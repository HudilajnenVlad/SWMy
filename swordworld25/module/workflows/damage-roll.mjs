import { rollFormulaDamage, rollPower } from "../dice/power.mjs";
import { cardActor, createCard, getCard, snapshotTargets, updateCard } from "../chat/card.mjs";
import { applyDamageTo } from "../combat/damage.mjs";
import { applyEffects, applyRisk, buildEffectData, modifiersFor, raiseCurrentHp, removeEffects } from "../helpers/effects.mjs";
import { actorFromUuid, getTargetTokens, signed, speakerFor, t } from "../helpers/utils.mjs";
import RollDialog from "../dice/roll-dialog.mjs";
import { conditionalOptions, consumeChosenItems } from "./checks.mjs";
import { declarableFeats, declaredEffects } from "./attacks.mjs";

/**
 * Modifier keys of the situational damage bonuses offered for a kind of damage source.
 * @param {string} [source]   melee | ranged | gun | spell | ability
 * @returns {string[]}
 */
function situationalDamageKeys(source) {
  if ( source === "melee" ) return ["damage", "damageMelee"];
  if ( source === "ranged" ) return ["damage", "damageRanged"];
  if ( ["gun", "spell"].includes(source) ) return ["damageMagic"];
  return [];
}

/**
 * Let the user review and change a damage roll before it is made (like the damage dialog of PF2e): every part of the
 * added damage can be switched off, situational bonuses switched on, a manual modifier added, and the Power, Critical
 * Value and the bonus to the 2d of the power table changed. Shift (or the "skip dialogs" setting) rolls as is.
 * @param {Actor|null} actor   Who deals the damage (situational bonuses come from it)
 * @param {object} dmg         Damage configuration of a card
 * @param {object} [options]
 * @param {string} [options.title]
 * @param {Event} [options.event]
 * @param {string} [options.declare]   melee | ranged: offer the combat feats declared with such an attack (damage rolled
 *                                     without an attack: Power Strike adds its damage and its risk applies)
 * @returns {Promise<{damage: object, rollMode: string}|null>}   The configuration to roll, or null if cancelled
 */
export async function configureDamage(actor, dmg, { title = "", event, declare = null } = {}) {
  const rollMode = game.settings.get("core", "rollMode");
  if ( dmg.mode === "toZero" ) return { damage: dmg, rollMode };
  const localize = label => game.i18n.localize(label ?? "");
  // The added damage as separate lines (older cards: one line)
  let parts = (dmg.extraParts ?? []).filter(p => Number(p.value));
  const listed = parts.reduce((a, p) => a + Number(p.value), 0);
  if ( (dmg.extra ?? 0) !== listed ) parts = [...parts, { label: "SW25.Breakdown.Other", value: (dmg.extra ?? 0) - listed }];
  const options = parts.map((p, i) => ({
    id: `part${i}`,
    label: p.ability ? `${localize(p.label)} ${t("SW25.Ability.mod")}` : localize(p.label),
    value: Number(p.value), checked: true, group: dmg.heal ? "SW25.Damage.HealParts" : "SW25.Damage.Parts", part: p
  }));
  if ( actor && declare ) {
    for ( const opt of declarableFeats(actor, declare) ) {
      const effect = declaredEffects(actor, [opt.id], declare);
      if ( !effect.damage && !effect.critical && !effect.powerRoll && !effect.powerPerCrit ) continue;
      options.push({ ...opt, value: effect.damage, checked: false, group: "SW25.Roll.Declare" });
    }
  }
  if ( actor ) {
    const known = new Set(options.map(o => o.label));
    const situational = conditionalOptions(actor, situationalDamageKeys(dmg.source))
      .filter(o => !known.has(o.label))
      .map(o => ({ ...o, id: `sit-${o.id}` }));
    options.push(...situational);
  }
  const extraFields = [];
  if ( dmg.mode === "power" ) {
    extraFields.push({ name: "power", label: t("SW25.Power"), type: "number", value: dmg.power ?? 0 });
    extraFields.push({ name: "critical", label: t("SW25.CritValue"), type: "number", value: Number.isFinite(dmg.critical) ? dmg.critical : "" });
    extraFields.push({ name: "rollBonus", label: t("SW25.Damage.RollBonus"), type: "number", value: dmg.rollBonus ?? 0 });
  }
  const what = dmg.mode === "power" ? `${t("SW25.Power")} ${dmg.power ?? 0}` : (dmg.formula || "");
  const dialog = await RollDialog.prompt({
    title: `${t(dmg.heal ? "SW25.Card.Healing" : "SW25.Damage.label")}${title ? ` — ${title}` : ""}`,
    summary: `${what}${dmg.extra ? ` ${signed(dmg.extra)}` : ""}`,
    options,
    extraFields,
    skip: RollDialog.shouldSkip(event)
  });
  if ( !dialog ) return null;
  if ( actor?.isOwner ) await consumeChosenItems(actor, dialog);
  const extraParts = dialog.parts.map(p => ({ label: p.label, value: p.value }));
  const configured = { ...dmg, extra: extraParts.reduce((a, p) => a + p.value, 0), extraParts };
  if ( dmg.mode === "power" ) {
    const number = (value, fallback) => (((value === "") || (value === null) || !Number.isFinite(Number(value))) ? fallback : Number(value));
    configured.power = Math.clamp(Math.floor(number(dialog.extra.power, dmg.power ?? 0)), 0, 100);
    configured.critical = number(dialog.extra.critical, Number.isFinite(dmg.critical) ? dmg.critical : null);
    configured.rollBonus = Math.floor(number(dialog.extra.rollBonus, dmg.rollBonus ?? 0));
  }
  // Combat feats declared now: their other effects on the roll, and their risk
  const feats = dialog.selected.filter(id => id.startsWith("feat:"));
  if ( actor && declare && feats.length ) {
    const declared = declaredEffects(actor, feats, declare);
    if ( Number.isFinite(configured.critical) ) configured.critical += declared.critical;
    configured.rollBonus = (configured.rollBonus ?? 0) + declared.powerRoll;
    configured.powerPerCrit = (configured.powerPerCrit ?? 0) + declared.powerPerCrit;
    for ( const feat of declared.feats ) await applyRisk(actor, feat);
  }
  return { damage: configured, rollMode: dialog.rollMode };
}

/**
 * Roll the damage (or healing) configured on a workflow card.
 * Resisted "Half" targets roll without criticals and are halved (CR I p.169-170); missed/negated targets are skipped.
 * @param {ChatMessage} message
 * @param {Event} [event]
 */
export async function rollDamageFromCard(message, event) {
  const state = getCard(message);
  if ( !state?.damage ) return;
  const actor = cardActor(state);
  if ( actor && !actor.isOwner ) return ui.notifications.warn(t("SW25.Warn.NotOwner"));
  const targets = state.targets ?? [];

  // Which targets receive the effect, and how. Targets whose damage was already rolled keep it: after targets were
  // added to the card, only the new ones are rolled.
  const plan = [];
  if ( !targets.length ) plan.push({ target: null, halve: false, index: null });
  let alreadyRolled = 0;
  targets.forEach((target, index) => {
    if ( ["miss", "failed"].includes(target.outcome) ) return;
    if ( (target.outcome === "resisted") && (state.resistance === "neg") ) return;
    if ( target.damageRolled ) {
      alreadyRolled += 1;
      return;
    }
    const halve = (target.outcome === "resisted") && (state.resistance === "half");
    plan.push({ target, halve, index });
  });
  if ( !plan.length ) return ui.notifications.info(t(alreadyRolled ? "SW25.Card.DamageAlreadyRolled" : "SW25.Card.NoValidTargets"));

  // The damage dialog: only once there is something to roll
  const configured = await configureDamage(actor, state.damage, { title: state.title, event });
  if ( !configured ) return;
  const dmg = configured.damage;

  const rolls = [];
  const results = [];
  // One roll per target (criticals and halving are individual); identical unresisted targets can share a roll
  const shared = game.settings.get("swordworld25", "sharedDamageRoll");
  let sharedResult = null;
  for ( const entry of plan ) {
    let result;
    const targetActor = entry.target ? (actorFromUuid(entry.target.tokenUuid) ?? actorFromUuid(entry.target.actorUuid)) : null;
    // Raise negative HP to 0 (Vital Force): nothing to roll
    if ( dmg.mode === "toZero" ) {
      const hp = targetActor?.system.hp?.value ?? 0;
      const amount = Math.max(0, -hp);
      results.push({ entry, result: { formula: "→ 0", steps: [], tableTotal: amount, extra: 0, calculated: amount, crits: 0, fumble: false, halved: false } });
      continue;
    }
    // Attacks against a character whose Critical Value is lowered (Weak Point)
    const critTaken = (!dmg.heal && Number.isFinite(dmg.critical)) ? (targetActor?.system.bonuses?.criticalTaken ?? 0) : 0;
    const rollDmg = critTaken ? { ...dmg, critical: dmg.critical + critTaken } : dmg;
    if ( shared && sharedResult && !entry.halve && !critTaken ) result = sharedResult;
    else {
      result = await doRoll(rollDmg, entry.halve);
      rolls.push(...result.rolls);
      if ( !entry.halve && !critTaken ) sharedResult = result;
    }
    results.push({ entry, result: result.result });
  }

  const outTargets = results.map(({ entry, result }) => ({
    ...(entry.target ?? {}),
    halved: entry.halve,
    amount: result.calculated,
    result
  }));
  const main = results[0].result;
  const rolled = plan.filter(entry => entry.index !== null).map(entry => entry.index);
  if ( rolled.length ) await updateCard(message, { targets: Object.fromEntries(rolled.map(i => [i, { damageRolled: true }])) });
  await createCard({
    kind: "damage",
    actorUuid: state.actorUuid,
    itemUuid: state.itemUuid,
    title: state.title,
    subtitle: dmg.heal ? t(dmg.mp ? "SW25.Card.MPHealing" : "SW25.Card.Healing") : t("SW25.Card.Damage"),
    img: state.img,
    damage: dmg,
    result: main,
    targets: outTargets.filter(tg => tg.actorUuid),
    sourceMessage: message.id
  }, { rolls, speaker: actor ? speakerFor(actor) : message.speaker, rollMode: configured.rollMode });
}

/**
 * Roll one damage instance.
 * @param {object} dmg
 * @param {boolean} halve
 * @returns {Promise<{result: object, rolls: Roll[]}>}
 */
async function doRoll(dmg, halve) {
  if ( dmg.mode === "formula" ) {
    const { roll, total } = await rollFormulaDamage(dmg.formula);
    let calculated = total + (dmg.extra ?? 0);
    if ( halve ) calculated = Math.ceil(calculated / 2);
    return {
      rolls: [roll],
      result: {
        formula: dmg.formula,
        steps: [{ dice: roll.dice.flatMap(d => d.results.map(r => r.result)), natural: roll.total, value: total }],
        tableTotal: total, extra: dmg.extra ?? 0, calculated: Math.max(0, calculated), crits: 0, fumble: false, halved: halve
      }
    };
  }
  return rollPower({
    power: dmg.power ?? 0,
    critical: dmg.critical,
    extra: dmg.extra ?? 0,
    rollBonus: dmg.rollBonus ?? 0,
    powerPerCrit: dmg.powerPerCrit ?? 0,
    halve,
    minimumOnFumble: !!dmg.minimumOnFumble
  });
}

/* -------------------------------------------- */

/**
 * May the current user apply what a card does (damage, healing, effects)? The GM always may. A player must own the
 * character the card comes from and have its token selected, when it has one on the scene.
 * @param {object} state   Card state
 * @returns {boolean}
 */
export function canApplyFromCard(state) {
  if ( game.user.isGM ) return true;
  const source = cardActor(state);
  if ( !source ) {
    ui.notifications.warn(t("SW25.Warn.GMApplies"));
    return false;
  }
  if ( !source.isOwner ) {
    ui.notifications.warn(t("SW25.Warn.NotSourceOwner", { name: source.name }));
    return false;
  }
  const onScene = source.getActiveTokens(false, true).length > 0;
  if ( onScene && !(canvas.tokens?.controlled ?? []).some(tk => tk.actor?.uuid === source.uuid) ) {
    ui.notifications.warn(t("SW25.Warn.SelectSource", { name: source.name }));
    return false;
  }
  return true;
}

/**
 * Apply the damage of a damage card to one of its targets, or to the tokens the user targets now (T).
 * @param {ChatMessage} message
 * @param {object} options
 * @param {number|null} options.index        Target index on the card; null → the current targets
 * @param {number} [options.multiplier=1]
 * @param {boolean} [options.heal]           Force healing
 */
export async function applyDamageFromCard(message, { index = null, multiplier = 1, heal = null } = {}) {
  const state = getCard(message);
  if ( !state?.result && (index === null) ) return;
  if ( !canApplyFromCard(state) ) return;
  const dmg = state.damage ?? {};
  const base = {
    kind: dmg.kind ?? "physical",
    types: dmg.types ?? [],
    heal: heal ?? !!dmg.heal,
    mp: !!dmg.mp,
    multiplier,
    source: state.title
  };
  if ( index !== null ) {
    const target = state.targets[index];
    const actor = actorFromUuid(target.tokenUuid) ?? actorFromUuid(target.actorUuid);
    if ( !actor ) return;
    await applyDamageTo(actor, forTarget(actor, dmg, { ...base, amount: target.amount, section: target.section }));
    await updateCard(message, { targets: { [index]: { applied: true } } });
    return;
  }
  const tokens = getTargetTokens();
  if ( !tokens.length ) return ui.notifications.warn(t("SW25.Warn.NoTargets"));
  for ( const token of tokens ) {
    await applyDamageTo(token.actor, forTarget(token.actor, dmg, { ...base, amount: state.result?.calculated ?? 0 }));
  }
}

/**
 * HP recovery that harms undead (Cure Wounds...) becomes magic damage against them,
 * typed "hpRecovery" so an undead weak point applies.
 * @param {Actor} actor
 * @param {object} dmg        The card's damage configuration
 * @param {object} data       Damage data about to be applied
 * @returns {object}
 */
function forTarget(actor, dmg, data) {
  const undead = (actor.type !== "character") && (actor.system.classification === "undead");
  if ( !data.heal || data.mp || !dmg.undeadDamage || !undead ) return data;
  return { ...data, heal: false, kind: "magic", types: [...(data.types ?? []), "hpRecovery"] };
}

/**
 * Apply the effect configured on a card to its affected targets (or, without any, to the tokens targeted now).
 * @param {ChatMessage} message
 * @param {object} [options]
 * @param {number|null} [options.index]
 */
export async function applyEffectFromCard(message, { index = null } = {}) {
  const state = getCard(message);
  const effect = state?.effect;
  if ( !effect ) return;
  if ( !canApplyFromCard(state) ) return;
  // "Temporary" resistance: a target that resists is still affected, for 10 seconds (1 round) only.
  // "Half" resistance halves the damage only: the other effects (falling prone...) still apply.
  const temporary = state.resistance === "temporary";
  const stillAffected = ["temporary", "half"].includes(state.resistance);
  let entries = [];
  if ( index !== null ) {
    const target = state.targets[index];
    entries = [{ actor: actorFromUuid(target.tokenUuid) ?? actorFromUuid(target.actorUuid), resisted: target.outcome === "resisted", index }];
  } else if ( state.targets?.length ) {
    // Targets that already have the effect keep it as it is (targets added later get it now)
    entries = state.targets
      .map((tg, i) => ({ tg, i }))
      .filter(({ tg }) => !tg.effectApplied && !["miss", "failed"].includes(tg.outcome) && (stillAffected || (tg.outcome !== "resisted")))
      .map(({ tg, i }) => ({ actor: actorFromUuid(tg.tokenUuid) ?? actorFromUuid(tg.actorUuid), resisted: tg.outcome === "resisted", index: i }));
    if ( !entries.length && state.targets.some(tg => tg.effectApplied) ) return ui.notifications.info(t("SW25.Card.EffectAlreadyOn"));
  } else {
    // Cast without targets: the tokens the user targets now (T)
    entries = getTargetTokens().map(tk => ({ actor: tk.actor, resisted: false }));
  }
  entries = entries.filter(e => e.actor);
  if ( !entries.length ) return ui.notifications.warn(t("SW25.Warn.NoTargetsForEffect"));
  const removed = [];
  for ( const { actor, resisted } of entries ) {
    // Conditions and effect types ended (Cure Poison, Awaken...)
    const names = await removeEffects(actor, { statuses: effect.removeStatuses ?? [], types: effect.removeTypes ?? [] });
    if ( names.length ) removed.push(`${actor.name}: ${names.join(", ")}`);
    if ( effect.create === false ) continue;
    const data = buildEffectData({
      name: effect.name,
      img: effect.img,
      modifiers: modifiersFor(actor, effect.modifiers),
      duration: (temporary && resisted) ? { unit: "rounds", value: 1 } : effect.duration,
      origin: effect.origin,
      statuses: effect.statuses ?? [],
      description: effect.description ?? "",
      types: effect.types ?? [],
      flags: foundry.utils.deepClone(effect.flags ?? {})
    });
    await applyEffects(actor, [data]);
    const raise = effect.flags?.swordworld25?.raiseHp;
    if ( raise ) await raiseCurrentHp(actor, raise);
  }
  // Mark the card's targets that got the effect
  const marked = entries.filter(e => Number.isInteger(e.index)).map(e => e.index);
  if ( marked.length ) await updateCard(message, { targets: Object.fromEntries(marked.map(i => [i, { effectApplied: true }])) });
  if ( removed.length ) ui.notifications.info(t("SW25.Card.EffectsRemoved", { list: removed.join("; ") }));
  if ( effect.create !== false ) ui.notifications.info(t("SW25.Card.EffectApplied", { name: effect.name, count: entries.length }));
  else if ( !removed.length ) ui.notifications.info(t("SW25.Card.NothingToRemove"));
}

/**
 * Add the tokens the user targets now (T) to a card. The targets already on the card keep their rolls and results;
 * the new ones resist, take damage and receive the effect like the others.
 * @param {ChatMessage} message
 */
export async function addTargetsToCard(message) {
  const state = getCard(message);
  if ( !state || !canApplyFromCard(state) ) return;
  const tokens = getTargetTokens();
  if ( !tokens.length ) return ui.notifications.warn(t("SW25.Warn.NoTargets"));
  const known = new Set((state.targets ?? []).map(tg => tg.tokenUuid));
  const fresh = tokens.filter(tk => !known.has(tk.uuid));
  if ( !fresh.length ) return ui.notifications.info(t("SW25.Card.TargetsAlreadyIn"));
  let added = await snapshotTargets(fresh, { contest: state.contest ?? null, askSection: state.contest === "evasion" });
  // A damage card gives the new targets its rolled amount
  if ( state.kind === "damage" ) {
    added = added.map(tg => ({ ...tg, halved: false, amount: state.result?.calculated ?? 0, result: state.result ?? null }));
  }
  await updateCard(message, { addTargets: added });
  ui.notifications.info(t("SW25.Card.TargetsAdded", { count: added.length }));
}
