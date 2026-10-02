import { evaluateCheck, fixedResult, resultFromRoll } from "../dice/check.mjs";
import RollDialog from "../dice/roll-dialog.mjs";
import { rollPower } from "../dice/power.mjs";
import { createCard, snapshotTargets } from "../chat/card.mjs";
import { applyEffects, buildEffectData, modifiersFor, raiseCurrentHp, removeEffects, resolveModifiers } from "../helpers/effects.mjs";
import { getTargetTokens, renderSystemTemplate, signed, speakerFor, t } from "../helpers/utils.mjs";
import { conditionalOptions, consumeChosenItems, handleAutoFailureExp } from "./checks.mjs";
import { declarableFeats, declaredEffects, payMP } from "./attacks.mjs";

/**
 * Magic power information of an actor for a magic system.
 * @param {Actor} actor
 * @param {string} system
 * @returns {{power: number, check: number, level: number, label: string}|null}
 */
export function getCasting(actor, system) {
  if ( actor.type === "character" ) return actor.system.magic?.[system] ?? null;
  for ( const item of actor.items ) {
    const sc = item.system.spellcasting;
    if ( (item.type === "ability") && (sc?.system === system) ) {
      const b = actor.system.bonuses;
      const power = (sc.power ?? 0) + (b.magicPower ?? 0);
      return {
        power, check: power + (b.spellcasting ?? 0), level: sc.level ?? 0, label: CONFIG.SW25.magicSystems[system]?.label ?? system, deity: sc.deity,
        checkBreakdown: [{ label: item.name, value: sc.power ?? 0 }, ...actor.system.bonusBreakdown(["magicPower", "spellcasting"])]
      };
    }
  }
  return null;
}

/**
 * Fixed damage/healing of a spell that does not use the power table: `effect.fixed` (Magic Power is
 * added separately when `addMagicPower`), or `effect.formula`: a number ("30"), "Magic Power x5", or a formula
 * with @magicPower, @level and @extraMp (extra MP paid, e.g. Transfer Mana).
 * @param {object} effect
 * @param {{power: number, level: number}} casting
 * @param {object} [extra]
 * @param {number} [extra.extraMp=0]
 * @returns {number|null}
 */
function fixedSpellAmount(effect, casting, { extraMp = 0 } = {}) {
  if ( Number.isInteger(effect.fixed) ) return effect.fixed;
  const formula = String(effect.formula ?? "").trim();
  if ( /^\d+$/.test(formula) ) return Number(formula);
  const m = formula.match(/magic power\s*[x×*]\s*(\d+)/i);
  if ( m ) return casting.power * Number(m[1]);
  if ( formula.includes("@") && (formula !== "@toZero") ) {
    try {
      const expr = Roll.replaceFormulaData(formula, { magicPower: casting.power, level: casting.level, extraMp }, { missing: "0" });
      return Math.max(0, Math.floor(Number(Roll.safeEval(expr)) || 0));
    } catch(err) {
      console.warn(`SW25 | Invalid spell formula "${formula}"`, err);
    }
  }
  return null;
}

/**
 * Split a list of modifiers into self/target groups.
 */
function splitModifiers(modifiers = []) {
  return {
    self: modifiers.filter(m => (m.target ?? "self") === "self" && m.scope !== "use"),
    target: modifiers.filter(m => m.target === "target")
  };
}

/* -------------------------------------------- */
/*  Spells                                      */
/* -------------------------------------------- */

/**
 * Cast a spell.
 * @param {Actor} actor
 * @param {Item|object} spell  Spell item (owned or from a compendium)
 * @param {object} [options]
 */
export async function castSpell(actor, spell, { event } = {}) {
  const s = spell.system;
  const casting = getCasting(actor, s.magic);
  if ( !casting ) return ui.notifications.warn(t("SW25.Warn.CannotCast", { system: t(CONFIG.SW25.magicSystems[s.magic]?.label ?? s.magic) }));
  if ( (s.level > casting.level) && !game.user.isGM ) return ui.notifications.warn(t("SW25.Warn.SpellLevel", { name: spell.name }));

  const isCreature = actor.type !== "character";
  const noRollDefault = s.minorAction || s.combatPrep;
  const makoStones = actor.items.filter(i => (i.type === "gear") && i.system.isMakoStone && (i.system.mako.value > 0));
  const eff = s.effect ?? {};
  const extraFields = [
    { name: "mult", label: t("SW25.Spell.MPMultiplier"), type: "number", value: 1 }
  ];
  // Spells paying a variable amount of MP on top of the cost (Transfer Mana)
  const usesExtraMp = /@extraMp/.test(eff.formula ?? "");
  if ( usesExtraMp ) extraFields.push({ name: "extraMp", label: t("SW25.Spell.ExtraMP"), type: "number", value: 1 });
  if ( noRollDefault ) extraFields.push({ name: "major", label: t("SW25.Spell.CastAsMajor"), type: "checkbox", value: false });
  // Versions of the spell (e.g. Fist of God by the rank of the caster's god, Bless by the ability raised)
  const variants = eff.variants ?? [];
  if ( variants.length ) {
    const byRank = variants.every(v => v.deityCategory);
    const category = CONFIG.SW25.deities?.[actor.system.deity || casting.deity]?.category;
    const matched = variants.findIndex(v => v.deityCategory && (v.deityCategory === category));
    const required = byRank || variants.some(v => v.modifiers || v.statuses);
    const options = required ? {} : { "": `${t("SW25.Spell.BaseVersion")}${Number.isInteger(eff.power) ? ` (${t("SW25.Power")} ${eff.power})` : ""}` };
    variants.forEach((v, i) => {
      const bits = [Number.isInteger(v.mp) ? `MP${v.mp}` : null, Number.isInteger(v.power) ? `${t("SW25.Power")} ${v.power}` : null,
        Number.isInteger(v.critical) ? `${t("SW25.CritValue")} ${v.critical}` : null].filter(Boolean);
      options[String(i)] = `${v.label}${bits.length ? ` (${bits.join(", ")})` : ""}`;
    });
    extraFields.push({
      name: "variant", label: t("SW25.Spell.Version"), type: "select", options,
      value: matched >= 0 ? String(matched) : (required ? "0" : "")
    });
  }
  if ( makoStones.length ) {
    extraFields.push({
      name: "mako", label: t("SW25.Spell.MakoStone"), type: "select", value: "",
      options: { "": "—", ...Object.fromEntries(makoStones.map(m => [m.id, `${m.name} (${m.system.mako.value})`])) }
    });
    extraFields.push({ name: "makoPoints", label: t("SW25.Spell.MakoPoints"), type: "number", value: 0 });
  }
  let baseCost = Number.isInteger(s.cost?.mp) ? s.cost.mp : 0;
  const costMod = actor.system.bonuses?.mp?.cost ?? 0;
  // The spell's own modifiers to its Spellcasting check ("+2 when cast underwater")
  const ownOptions = (s.modifiers ?? []).map((m, i) => ({ m, i }))
    .filter(({ m }) => (m.scope === "use") && ["spellcasting", "magicPower", "actionChecks", "allChecks"].includes(m.key))
    .map(({ m, i }) => ({
      id: `own${i}`, label: m.condition ? `${spell.name}: ${m.condition}` : spell.name, value: m.value, checked: !m.condition,
      group: "SW25.Roll.Situational", hint: signed(m.value)
    }));
  const dialog = await RollDialog.prompt({
    title: `${t("SW25.Check.spellcasting")} — ${spell.name}`,
    summary: `${t(casting.label)}: ${t("SW25.MagicPower")} ${casting.power} · MP ${s.cost?.text || baseCost}${costMod ? ` (${signed(costMod)})` : ""}`,
    options: [...ownOptions, ...declarableFeats(actor, "spell"), ...conditionalOptions(actor, ["spellcasting", "magicPower", "actionChecks", "allChecks"])],
    extraFields,
    showFixed: isCreature,
    fixedDefault: isCreature && actor.system.usesFixedValues,
    skip: RollDialog.shouldSkip(event) && !makoStones.length && !usesExtraMp && !variants.length
  });
  if ( !dialog ) return;
  await consumeChosenItems(actor, dialog);

  // Chosen version overrides cost, power, critical value, modifiers, conditions and duration
  const variant = (dialog.extra.variant !== undefined) && (dialog.extra.variant !== "")
    ? (variants[Number(dialog.extra.variant)] ?? null) : null;
  if ( Number.isInteger(variant?.mp) ) baseCost = variant.mp;

  // Cost
  const mult = Math.max(1, Number(dialog.extra.mult) || 1);
  const extraMp = usesExtraMp ? Math.max(0, Math.floor(Number(dialog.extra.extraMp) || 0)) : 0;
  const cost = (baseCost ? Math.max(1, baseCost + costMod) * mult : 0) + extraMp;
  const mako = dialog.extra.mako ? actor.items.get(dialog.extra.mako) : null;
  const paid = await payMP(actor, cost, spell.name, { mako, makoPoints: Number(dialog.extra.makoPoints) || 0 });
  if ( !paid ) return;

  // Check
  const rollIt = !noRollDefault || dialog.extra.major;
  let roll = null;
  let result;
  if ( !rollIt ) result = fixedResult(0);
  else if ( isCreature && dialog.useFixed ) result = fixedResult(casting.check + dialog.bonus + CONFIG.SW25.FIXED_OFFSET);
  else {
    roll = await evaluateCheck({ base: casting.check, parts: dialog.parts });
    result = resultFromRoll(roll);
  }
  const expGained = await handleAutoFailureExp(actor, result);
  const declared = declaredEffects(actor, dialog.selected, "spell");

  const contest = s.isResisted ? "willpower" : null;
  const targets = await snapshotTargets(getTargetTokens(), { contest });
  const kind = eff.kind;
  const power = Number.isInteger(variant?.power) ? variant.power : eff.power;
  const baseCritical = Number.isInteger(variant?.critical) ? variant.critical : (eff.critical ?? null);
  const critical = Number.isInteger(baseCritical)
    ? baseCritical + (actor.system.bonuses?.criticalSpell ?? 0) + useModifierTotal(s.modifiers, "criticalSpell") + declared.criticalSpell
    : null;
  // Damage dealt at the end of each turn (Lightning Bind, Summon Insects) is rolled then, not now
  const perTurn = !!eff.perTurn && (kind === "damage") && Number.isInteger(power);
  const dealsAmount = ["damage", "heal", "mpHeal"].includes(kind) && !perTurn;
  const usesPower = dealsAmount && Number.isInteger(power);
  const fixedAmount = (dealsAmount && !usesPower) ? fixedSpellAmount(eff, casting, { extraMp }) : null;
  const damageBonus = (kind === "damage") ? (actor.system.bonuses?.damageMagic ?? 0) + declared.damage : 0;
  // Where the added amount comes from, for the damage dialog and the breakdown of the damage card
  const extraParts = [
    ...(eff.addMagicPower && casting.power ? [{ label: "SW25.MagicPower", value: casting.power }] : []),
    ...((kind === "damage") ? [...actor.system.bonusBreakdown(["damageMagic"]), ...declared.damageLines] : [])
  ];

  // Lasting effects: modifiers (formulas use the caster's values), conditions and the spell itself as a timed effect
  const rollData = { magicPower: casting.power, level: casting.level, extraMp };
  const mods = splitModifiers(resolveModifiers(Array.isArray(variant?.modifiers) ? variant.modifiers : s.modifiers, rollData));
  const statuses = Array.isArray(variant?.statuses) ? variant.statuses : (eff.statuses ?? []);
  const duration = variant?.duration ?? s.duration;
  const onCaster = s.target?.kind === "caster";
  const timed = !["instant", "special"].includes(duration?.unit);
  // Timed effects are tracked on the characters they affect, numbers or not (utility spells too: Tongues, Disguise...)
  const onCharacter = ["caster", "character", "entireCharacter", "characterX"].includes(s.target?.kind);
  const tracked = timed && (["buff", "debuff"].includes(kind) || perTurn || (["utility", "other"].includes(kind) && onCharacter));
  const removes = { statuses: eff.removeStatuses ?? [], types: eff.removeTypes ?? [] };
  const effectName = variant?.modifiers || variant?.statuses ? `${spell.name} (${variant.label})` : spell.name;
  const flags = {};
  if ( perTurn ) {
    flags.turnPower = {
      power, critical: null, extra: (eff.addMagicPower ? casting.power : 0) + damageBonusFor(actor, kind),
      kind: eff.damageKind || "magic", types: s.types ?? [], name: spell.name
    };
    if ( eff.perTurn === "caster" ) flags.turnOf = actor.uuid;
  }
  const effectData = (modifiers, withStatuses) => {
    const raise = eff.raiseCurrent ? modifiers.filter(m => m.key === "hpMax").reduce((a, m) => a + m.value, 0) : 0;
    return {
      name: effectName, img: spell.img, modifiers, statuses: withStatuses ? statuses : [], duration, origin: spell.uuid,
      description: variant?.summary ?? s.summary, types: s.types ?? [],
      flags: { swordworld25: { ...flags, ...(raise ? { raiseHp: raise } : {}) } },
      removeStatuses: removes.statuses, removeTypes: removes.types,
      create: !!(modifiers.length || (withStatuses && statuses.length) || tracked)
    };
  };
  let cardEffect = null;
  if ( !result.autoFailure ) {
    if ( onCaster ) {
      const selfMods = modifiersFor(actor, [...mods.self, ...mods.target]);
      const data = effectData(selfMods, true);
      if ( data.create ) {
        await applyEffects(actor, [buildEffectData(data)]);
        if ( data.flags.swordworld25.raiseHp ) await raiseCurrentHp(actor, data.flags.swordworld25.raiseHp);
      }
      if ( removes.statuses.length || removes.types.length ) await removeEffects(actor, removes);
    } else {
      if ( mods.self.length && timed ) await applyEffects(actor, [buildEffectData(effectData(modifiersFor(actor, mods.self), false))]);
      const data = effectData(mods.target, true);
      if ( data.create || removes.statuses.length || removes.types.length ) cardEffect = data;
    }
  }

  const details = [
    { label: t("SW25.Spell.Level"), value: `${t(casting.label)} ${s.level}` },
    { label: "MP", value: cost ? String(cost) : (s.cost?.text || "0") },
    { label: t("SW25.Target.label"), value: s.target?.text },
    { label: t("SW25.RangeArea"), value: s.rangeArea?.text },
    { label: t("SW25.Duration.label"), value: duration?.text },
    { label: t("SW25.Resistance.label"), value: t(CONFIG.SW25.resistance[s.resistance] ?? s.resistance) }
  ].filter(d => d.value);
  if ( variant ) details.push({ label: t("SW25.Spell.Version"), value: variant.label });
  if ( statuses.length ) details.push({ label: t("SW25.Spell.Statuses"), value: statusLabels(statuses) });
  if ( declared.names.length ) details.push({ label: t("SW25.Roll.Declare"), value: declared.names.join(", ") });

  await createCard({
    kind: "spell",
    actorUuid: actor.uuid,
    itemUuid: spell.uuid,
    title: spell.name,
    subtitle: t(casting.label),
    img: spell.img,
    summary: variant?.summary ?? s.summary,
    description: s.description,
    details,
    check: {
      ...result, base: rollIt ? casting.check : 0, parts: dialog.parts, breakdown: rollIt ? (casting.checkBreakdown ?? null) : null,
      label: t("SW25.Check.spellcasting"), expGained, noRoll: !rollIt
    },
    contest,
    resistance: s.resistance,
    targets,
    damage: usesPower ? {
      mode: "power",
      power,
      critical,
      extra: (eff.addMagicPower ? casting.power : 0) + damageBonus,
      extraParts,
      source: "spell",
      rollBonus: declared.powerRoll,
      kind: kind === "damage" ? (eff.damageKind || "magic") : null,
      types: s.types ?? [],
      heal: kind !== "damage",
      mp: kind === "mpHeal",
      undeadDamage: (kind === "heal") && !!eff.undeadDamage,
      minimumOnFumble: kind !== "damage"
    } : (Number.isInteger(fixedAmount) ? {
      // Fixed amounts (Healing Water, Earthquake, Restoration...): no power table, no dice
      mode: "formula",
      formula: String(fixedAmount),
      extra: (eff.addMagicPower ? casting.power : 0) + damageBonus,
      extraParts,
      source: "spell",
      kind: kind === "damage" ? (eff.damageKind || "magic") : null,
      types: s.types ?? [],
      heal: kind !== "damage",
      mp: kind === "mpHeal",
      undeadDamage: (kind === "heal") && !!eff.undeadDamage
    } : ((kind === "heal") && (eff.formula === "@toZero") ? {
      // Raise negative HP to 0 (Vital Force): the amount is computed for each target
      mode: "toZero", formula: "0", extra: 0, kind: null, types: [], heal: true, mp: false
    } : null)),
    effect: cardEffect
  }, { rolls: roll ? [roll] : [], speaker: speakerFor(actor), rollMode: dialog.rollMode });
}

/**
 * Magic damage bonus of a caster for damage dealt later (end of turn damage).
 * @param {Actor} actor
 * @param {string} kind
 * @returns {number}
 */
function damageBonusFor(actor, kind) {
  return (kind === "damage") ? (actor.system.bonuses?.damageMagic ?? 0) : 0;
}

/**
 * Sum of a spell's own single-use modifiers of a key that have no condition.
 * @param {object[]} modifiers
 * @param {string} key
 * @returns {number}
 */
function useModifierTotal(modifiers = [], key) {
  return modifiers.filter(m => (m.scope === "use") && (m.key === key) && !m.condition).reduce((a, m) => a + (Number(m.value) || 0), 0);
}

/**
 * Localized names of status ids.
 * @param {string[]} statuses
 * @returns {string}
 */
export function statusLabels(statuses = []) {
  return statuses.map(id => {
    const cfg = CONFIG.statusEffects.find(e => e.id === id);
    return cfg ? t(cfg.name) : id;
  }).join(", ");
}

/* -------------------------------------------- */
/*  Enhancer techniques                         */
/* -------------------------------------------- */

/**
 * Use an Enhancer technique: costs MP, no check, affects the user only.
 * @param {Actor} actor
 * @param {Item} technique
 */
export async function useTechnique(actor, technique) {
  const s = technique.system;
  const cost = Math.max(0, (s.mpCost ?? 3) + (actor.system.bonuses?.mp?.cost ?? 0));
  const paid = await payMP(actor, cost, technique.name);
  if ( !paid ) return;
  if ( s.modifiers.length ) {
    await applyEffects(actor, [buildEffectData({
      name: technique.name, img: technique.img, modifiers: s.modifiers.map(m => ({ ...m, target: "self" })),
      duration: s.duration, origin: technique.uuid, description: s.summary
    })]);
  }
  await createCard({
    kind: "use",
    actorUuid: actor.uuid,
    itemUuid: technique.uuid,
    title: technique.name,
    subtitle: t("TYPES.Item.technique"),
    img: technique.img,
    summary: s.summary,
    description: s.description,
    details: [
      { label: "MP", value: String(cost) },
      { label: t("SW25.Duration.label"), value: s.duration?.text }
    ].filter(d => d.value),
    targets: []
  }, { speaker: speakerFor(actor) });
}

/* -------------------------------------------- */
/*  Bard                                        */
/* -------------------------------------------- */

/**
 * Perform a spellsong: performance check, rhythm generation and effects on listeners.
 * @param {Actor} actor
 * @param {Item} song
 * @param {object} [options]
 */
export async function performSong(actor, song, { event } = {}) {
  const s = song.system;
  const base = actor.system.checks?.performance?.value ?? 0;
  const dialog = await RollDialog.prompt({
    title: `${t("SW25.Check.performance")} — ${song.name}`,
    summary: `${t("SW25.BardicPower")} ${actor.system.bardicPower} · ${t("SW25.Song.Flourish")} ${s.flourish ?? "-"}`,
    options: conditionalOptions(actor, ["performance", "actionChecks", "allChecks"]),
    skip: RollDialog.shouldSkip(event)
  });
  if ( !dialog ) return;
  await consumeChosenItems(actor, dialog);
  const roll = await evaluateCheck({ base, parts: dialog.parts });
  const result = resultFromRoll(roll);
  const expGained = await handleAutoFailureExp(actor, result);

  // Condition
  const rhythm = actor.system.rhythm;
  const cond = s.condition ?? {};
  const conditionMet = ["up", "down", "heart"].every(k => (rhythm[k] ?? 0) >= (cond[k] ?? 0));

  // Rhythm
  let gained = { up: 0, down: 0, heart: 0 };
  if ( !result.autoFailure ) {
    gained = { ...s.baseRhythm };
    const flourish = result.autoSuccess || (Number.isInteger(s.flourish) && (result.total >= s.flourish));
    if ( flourish ) for ( const k of ["up", "down", "heart"] ) gained[k] += s.extraRhythm[k] ?? 0;
    await actor.update({
      "system.rhythm.up": rhythm.up + gained.up,
      "system.rhythm.down": rhythm.down + gained.down,
      "system.rhythm.heart": rhythm.heart + gained.heart
    });
  }
  const mods = splitModifiers(s.modifiers);
  const contest = s.resistance === "neg" ? "willpower" : null;
  const targets = await snapshotTargets(getTargetTokens(), { contest });
  const icons = CONFIG.SW25.rhythms;
  const rhythmText = ["up", "down", "heart"].filter(k => gained[k]).map(k => `${icons[k].icon}${gained[k]}`).join(" ");
  await createCard({
    kind: "spell",
    actorUuid: actor.uuid,
    itemUuid: song.uuid,
    title: song.name,
    subtitle: t("TYPES.Item.spellsong"),
    img: song.img,
    summary: s.summary,
    description: s.description,
    details: [
      { label: t("SW25.Song.RhythmGained"), value: rhythmText || "—" },
      { label: t("SW25.Song.Condition"), value: cond.text && (cond.text !== "None") ? `${cond.text} (${conditionMet ? "✔" : "✘"})` : "" }
    ].filter(d => d.value),
    check: { ...result, base, parts: dialog.parts, breakdown: actor.system.checks?.performance?.breakdown ?? null, label: t("SW25.Check.performance"), expGained },
    contest,
    resistance: s.resistance,
    targets,
    effect: (mods.target.length && conditionMet) ? {
      name: song.name, img: song.img, modifiers: mods.target, duration: { unit: "rounds", value: 1 }, origin: song.uuid,
      description: s.summary
    } : null
  }, { rolls: [roll], speaker: speakerFor(actor), rollMode: dialog.rollMode });
}

/**
 * Perform a finale: spend rhythm, performance check, damage or healing.
 * @param {Actor} actor
 * @param {Item} finale
 * @param {object} [options]
 */
export async function performFinale(actor, finale, { event } = {}) {
  const s = finale.system;
  const rhythm = actor.system.rhythm;
  for ( const k of ["up", "down", "heart"] ) {
    if ( (rhythm[k] ?? 0) < (s.cost[k] ?? 0) ) return ui.notifications.warn(t("SW25.Warn.NotEnoughRhythm", { name: finale.name }));
  }
  const base = actor.system.checks?.performance?.value ?? 0;
  const dialog = await RollDialog.prompt({
    title: `${t("SW25.Check.performance")} — ${finale.name}`,
    summary: `${t("SW25.BardicPower")} ${actor.system.bardicPower}`,
    options: conditionalOptions(actor, ["performance", "actionChecks", "allChecks"]),
    skip: RollDialog.shouldSkip(event)
  });
  if ( !dialog ) return;
  await consumeChosenItems(actor, dialog);
  await actor.update({
    "system.rhythm.up": rhythm.up - (s.cost.up ?? 0),
    "system.rhythm.down": rhythm.down - (s.cost.down ?? 0),
    "system.rhythm.heart": rhythm.heart - (s.cost.heart ?? 0)
  });
  const roll = await evaluateCheck({ base, parts: dialog.parts });
  const result = resultFromRoll(roll);
  const expGained = await handleAutoFailureExp(actor, result);
  const contest = ["half", "neg"].includes(s.resistance) ? "willpower" : null;
  const targets = await snapshotTargets(getTargetTokens(), { contest });
  const kind = s.effect?.kind;
  const usesPower = Number.isInteger(s.effect?.power);
  await createCard({
    kind: "spell",
    actorUuid: actor.uuid,
    itemUuid: finale.uuid,
    title: finale.name,
    subtitle: t("TYPES.Item.finale"),
    img: finale.img,
    summary: s.summary,
    description: s.description,
    details: [{ label: t("SW25.Resistance.label"), value: t(CONFIG.SW25.resistance[s.resistance] ?? s.resistance) }],
    check: { ...result, base, parts: dialog.parts, breakdown: actor.system.checks?.performance?.breakdown ?? null, label: t("SW25.Check.performance"), expGained },
    contest,
    resistance: s.resistance,
    targets,
    damage: usesPower ? {
      mode: "power",
      power: Math.min(100, s.effect.power + (actor.system.bonuses?.finalePower ?? 0)),
      critical: s.effect.critical ?? null,
      extra: s.effect.addMagicPower ? actor.system.bardicPower : 0,
      kind: kind === "damage" ? (s.effect.damageKind || "magic") : null,
      types: s.types ?? [],
      heal: kind !== "damage",
      mp: kind === "mpHeal",
      minimumOnFumble: kind !== "damage"
    } : null
  }, { rolls: [roll], speaker: speakerFor(actor), rollMode: dialog.rollMode });
}

/* -------------------------------------------- */
/*  Alchemist                                   */
/* -------------------------------------------- */

/**
 * Use an evocation: choose card rank and action type, consume material cards.
 * @param {Actor} actor
 * @param {Item} evocation
 * @param {object} [options]
 */
export async function useEvocation(actor, evocation, { event } = {}) {
  const s = evocation.system;
  const ranks = CONFIG.SW25.cardRanks.filter(r => s.ranks[r]?.available !== false);
  if ( !ranks.length ) return;
  const colors = s.cards.colors.length ? s.cards.colors : [];
  const count = Math.max(1, s.cards.count || 1);
  const available = r => colors.every(c => (actor.system.cards?.[c]?.[r] ?? 0) >= count);
  const dialog = await RollDialog.prompt({
    title: `${t("SW25.Check.evocation")} — ${evocation.name}`,
    summary: `${t("SW25.AlchemyPower")} ${actor.system.alchemyPower} · ${s.cards.text}`,
    options: conditionalOptions(actor, ["evocation", "actionChecks", "allChecks"]),
    extraFields: [
      {
        name: "rank", label: t("SW25.Card.Rank"), type: "select", value: ranks.find(available) ?? ranks[0],
        options: Object.fromEntries(ranks.map(r => [r, `${r}${available(r) ? "" : ` (${t("SW25.Card.NotEnough")})`} — ${s.ranks[r]?.text ?? ""}`]))
      },
      { name: "major", label: t("SW25.Evocation.Major"), type: "checkbox", value: !s.minorAction },
      { name: "targets", label: t("SW25.Evocation.TargetCount"), type: "number", value: 1 }
    ],
    skip: false
  });
  if ( !dialog ) return;
  await consumeChosenItems(actor, dialog);
  const rank = dialog.extra.rank;
  const major = !!dialog.extra.major;
  const nTargets = major ? Math.max(1, Number(dialog.extra.targets) || 1) : 1;
  const needed = count * nTargets;
  const cardUpdate = {};
  for ( const c of colors ) {
    const have = actor.system.cards?.[c]?.[rank] ?? 0;
    if ( have < needed ) return ui.notifications.warn(t("SW25.Warn.NotEnoughCards", { color: t(CONFIG.SW25.cardColors[c]), rank }));
    cardUpdate[`system.cards.${c}.${rank}`] = have - needed;
  }
  if ( !foundry.utils.isEmpty(cardUpdate) ) await actor.update(cardUpdate);

  let roll = null;
  let result = fixedResult(0);
  const evocationCheck = actor.system.checks?.evocation;
  if ( major ) {
    const base = evocationCheck?.value ?? 0;
    roll = await evaluateCheck({ base, parts: dialog.parts });
    result = resultFromRoll(roll);
    await handleAutoFailureExp(actor, result);
  }
  const rankData = s.ranks[rank] ?? {};
  const rankValue = Number.isFinite(rankData.value) ? rankData.value : null;
  const contest = ["neg", "half", "temporary"].includes(s.resistance) ? "willpower" : null;
  const targets = await snapshotTargets(getTargetTokens(), { contest });
  // Unlock Needle: the rank gives the success value of the check
  if ( (s.rankEffect === "check") && Number.isFinite(rankValue) ) result = fixedResult(rankValue);
  // Fields: the rank gives the duration in rounds
  const duration = ((s.rankEffect === "duration") && Number.isFinite(rankValue))
    ? { text: rankData.text || `${rankValue}`, unit: "rounds", value: rankValue } : s.duration;
  const target = s.modifierTarget || "target";
  const modifiers = [
    ...((s.modifierKey && Number.isFinite(rankValue))
      ? [{ key: s.modifierKey, value: rankValue, target, condition: s.modifierCondition ?? "" }] : []),
    ...resolveModifiers(s.modifiers ?? [], { rankValue: rankValue ?? 0, alchemyPower: actor.system.alchemyPower ?? 0 })
      .map(m => ({ ...m, target: (target === "self") ? "self" : m.target }))
  ].filter(m => m.scope !== "use");
  const name = `${evocation.name} (${rank})`;
  const flags = s.turnOfUser ? { swordworld25: { turnOf: actor.uuid } } : {};
  const toSelf = (target === "self") || (s.target?.kind === "caster");
  if ( modifiers.length && toSelf && !result.autoFailure ) {
    await applyEffects(actor, [buildEffectData({
      name, img: evocation.img, modifiers: modifiersFor(actor, modifiers), duration, origin: evocation.uuid,
      description: rankData.text || s.summary, flags
    })]);
  }
  // Healing by the rank value (Heal Spray, Vivid Liquid)
  const heals = ["healHP", "healMP"].includes(s.rankEffect) && Number.isFinite(rankValue);
  await createCard({
    kind: "spell",
    actorUuid: actor.uuid,
    itemUuid: evocation.uuid,
    title: name,
    subtitle: t("TYPES.Item.evocation"),
    img: evocation.img,
    summary: rankData.text || s.summary,
    description: s.description,
    details: [
      { label: t("SW25.Card.Cards"), value: `${s.cards.text} ×${nTargets} (${rank})` },
      { label: t("SW25.Target.label"), value: s.target?.text },
      { label: t("SW25.Duration.label"), value: duration?.text }
    ].filter(d => d.value),
    check: (major || (s.rankEffect === "check"))
      ? {
        ...result, parts: dialog.parts, label: t("SW25.Check.evocation"), noRoll: !roll,
        // The rank of Unlock Needle gives the success value; otherwise the Alchemy check
        ...(((s.rankEffect === "check") && Number.isFinite(rankValue))
          ? { base: rankValue, parts: [], breakdown: [{ label: "SW25.Breakdown.CardRank", value: rankValue, note: rank }] }
          : { base: evocationCheck?.value ?? 0, breakdown: evocationCheck?.breakdown ?? null })
      }
      : { ...result, noRoll: true, label: t("SW25.Check.evocation") },
    contest,
    resistance: s.resistance,
    targets,
    damage: heals ? {
      mode: "formula", formula: String(rankValue), extra: 0, kind: null, types: [], heal: true, mp: s.rankEffect === "healMP"
    } : null,
    effect: (modifiers.length && !toSelf) ? {
      name, img: evocation.img, modifiers, duration, origin: evocation.uuid, description: rankData.text || s.summary,
      types: s.types ?? [], flags
    } : null
  }, { rolls: roll ? [roll] : [], speaker: speakerFor(actor), rollMode: dialog.rollMode });
}

/* -------------------------------------------- */
/*  Generic item use                            */
/* -------------------------------------------- */

/**
 * Use a consumable or usable gear item (potions, herbs, thrown hairpins...).
 * @param {Actor} actor
 * @param {Item} item
 * @param {object} [options]
 */
export async function useGear(actor, item, { event } = {}) {
  const s = item.system;
  const use = s.use ?? {};
  const kind = use.kind;
  // Bonus from the Ranger class (CR I p.293-294)
  let extra = use.extra ?? 0;
  const ranger = actor.system.classes?.ranger?.level ?? 0;
  if ( ranger && (use.bonus === "rangerDex") ) extra += ranger + (actor.system.abilities?.dex?.mod ?? 0);
  if ( ranger && (use.bonus === "rangerInt") ) extra += ranger + (actor.system.abilities?.int?.mod ?? 0);
  const rider = actor.system.classes?.rider?.level ?? 0;
  if ( rider && (use.bonus === "riderDex") ) extra += rider + (actor.system.abilities?.dex?.mod ?? 0);

  // Lasting modifiers of the item (potions...): an effect on the targets, or on the user without targets
  const lasting = resolveModifiers((s.modifiers ?? []).filter(m => !m.condition && (m.scope !== "use")), {});
  const timed = s.duration?.unit && !["instant", "special"].includes(s.duration.unit);
  const effect = lasting.length ? {
    name: item.name, img: item.img, modifiers: lasting.map(m => ({ ...m, target: "target" })),
    duration: timed ? s.duration : { unit: "rounds", value: 18 }, origin: item.uuid, description: s.summary, types: s.types ?? []
  } : null;
  const selfTarget = () => [{
    tokenUuid: actor.token?.uuid ?? actor.getActiveTokens(false, true)[0]?.uuid ?? null,
    actorUuid: actor.uuid, name: actor.name, img: actor.img
  }];

  let card = null;
  let rolls = [];
  const heals = ["healHP", "healMP"].includes(kind);
  if ( (heals || (kind === "damage")) && (Number.isInteger(use.power) || heals) ) {
    const targets = await snapshotTargets(getTargetTokens(), { contest: null });
    let result;
    if ( Number.isInteger(use.power) ) {
      // Apothecary's Tools: herbs may roll 1d+4 instead of 2d (CR III p.222)
      const tools = heals && (s.itemType === "herb") && actor.items.some(i => /apothecary'?s tools/i.test(i.name));
      const rolled = await rollPower({
        power: use.power, critical: use.critical ?? (heals ? null : 10), extra, minimumOnFumble: heals, fixedDie: tools ? 4 : null
      });
      result = rolled.result;
      rolls = rolled.rolls;
    } else {
      // A fixed amount: Magic Perfume (Ranger level + Int), Unicorn Horn (50)...
      const amount = Math.max(0, extra);
      result = { formula: String(amount), steps: [], tableTotal: amount, extra: 0, calculated: amount, crits: 0, fumble: false, halved: false };
    }
    const list = (targets.length || (kind === "damage")) ? targets : selfTarget();
    card = {
      kind: "damage",
      actorUuid: actor.uuid,
      itemUuid: item.uuid,
      title: item.name,
      subtitle: t(kind === "healMP" ? "SW25.UseKind.healMP" : (heals ? "SW25.UseKind.healHP" : "SW25.UseKind.damage")),
      img: item.img,
      summary: s.summary,
      targets: list.map(tg => ({ ...tg, amount: result.calculated })),
      damage: heals ? { kind: null, types: [], heal: true, mp: kind === "healMP" } : { kind: "magic", types: s.types ?? [], heal: false },
      result,
      effect
    };
  } else {
    card = {
      kind: "use",
      actorUuid: actor.uuid,
      itemUuid: item.uuid,
      title: item.name,
      subtitle: t(CONFIG.SW25.gearTypes[s.itemType] ?? "SW25.Use"),
      img: item.img,
      summary: s.summary,
      description: s.description,
      details: [{ label: t("SW25.Duration.label"), value: s.duration?.text }].filter(d => d.value),
      targets: await snapshotTargets(getTargetTokens(), { contest: null }),
      effect
    };
    // An item with an effect used without targets affects its user (drinking a potion)
    if ( effect && !card.targets.length ) card.targets = selfTarget();
  }
  // Consume
  if ( s.consumable ) {
    if ( Number.isInteger(s.uses?.max) && (s.uses.max > 0) ) {
      const left = (s.uses.value ?? s.uses.max) - 1;
      if ( left <= 0 ) {
        if ( s.quantity > 1 ) await item.update({ "system.quantity": s.quantity - 1, "system.uses.value": s.uses.max });
        else await item.delete();
      } else await item.update({ "system.uses.value": left });
    } else if ( s.quantity > 1 ) await item.update({ "system.quantity": s.quantity - 1 });
    else await item.delete();
  }
  await createCard(card, { rolls, speaker: speakerFor(actor) });
}

/**
 * Post a simple description card for an item (feats, stunts, abilities without automation...).
 * @param {Actor|null} actor
 * @param {Item} item
 */
export async function postItemCard(actor, item) {
  const s = item.system;
  const details = [];
  if ( item.type === "feat" ) {
    details.push({ label: t("SW25.Feat.Type"), value: t(CONFIG.SW25.featTypes[s.featType] ?? s.featType) });
    if ( s.prerequisites?.text ) details.push({ label: t("SW25.Feat.Prerequisites"), value: s.prerequisites.text });
    if ( s.application ) details.push({ label: t("SW25.Feat.Application"), value: s.application });
    if ( s.risk?.text ) details.push({ label: t("SW25.Feat.Risk"), value: s.risk.text });
  }
  await createCard({
    kind: "use",
    actorUuid: actor?.uuid ?? null,
    itemUuid: item.uuid,
    title: item.name,
    subtitle: t(`TYPES.Item.${item.type}`),
    img: item.img,
    summary: s.summary,
    description: s.description,
    details,
    targets: []
  }, { speaker: actor ? speakerFor(actor) : ChatMessage.implementation.getSpeaker() });
}

export { renderSystemTemplate };
