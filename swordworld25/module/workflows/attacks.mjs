import { evaluateCheck, fixedResult, resultFromRoll } from "../dice/check.mjs";
import RollDialog from "../dice/roll-dialog.mjs";
import { createCard, snapshotTargets } from "../chat/card.mjs";
import { applyEffects, applyRisk, buildEffectData, resolveModifiers } from "../helpers/effects.mjs";
import { getTargetTokens, PAPER_DIALOG, signed, speakerFor, t } from "../helpers/utils.mjs";
import { conditionalOptions, consumeChosenItems, handleAutoFailureExp } from "./checks.mjs";

/**
 * Keys of "use"-scoped feat modifiers that affect the attack check / damage roll.
 */
const CHECK_KEYS = ["accuracy", "accuracyMelee", "accuracyRanged", "spellcasting", "actionChecks", "allChecks"];
const DAMAGE_KEYS = ["damage", "damageMelee", "damageRanged", "damageMagic"];

/**
 * Active combat feats an actor can declare for an action.
 * @param {Actor} actor
 * @param {string} kind  melee | ranged | spell
 * @returns {object[]} dialog options
 */
export function declarableFeats(actor, kind) {
  const options = [];
  for ( const feat of actor.items ) {
    if ( (feat.type !== "feat") || (feat.system.featType !== "active") ) continue;
    const mods = feat.system.modifiers.filter(m => m.scope === "use");
    const checkMod = mods.filter(m => CHECK_KEYS.includes(m.key) && keyApplies(m.key, kind))
      .reduce((a, m) => a + m.value, 0);
    options.push({
      id: `feat:${feat.id}`,
      label: feat.name,
      value: checkMod,
      checked: false,
      group: "SW25.Roll.Declare",
      hint: feat.system.summary
    });
  }
  return options;
}

/**
 * Does a modifier key apply to an action kind?
 */
function keyApplies(key, kind) {
  if ( key.endsWith("Melee") ) return kind === "melee";
  if ( key.endsWith("Ranged") ) return kind === "ranged";
  if ( key === "spellcasting" ) return kind === "spell";
  if ( key === "damageMagic" ) return kind === "spell" || kind === "gun";
  if ( (key === "accuracy") || (key === "damage") ) return kind !== "spell";
  return true;
}

/**
 * Summarize the effect of the declared feats selected in a dialog.
 * @param {Actor} actor
 * @param {string[]} selected   Dialog option ids
 * @param {string} kind
 * @returns {{feats: Item[], damage: number, damageLines: object[], critical: number, criticalSpell: number,
 *   powerRoll: number, powerPerCrit: number, names: string[]}}
 */
export function declaredEffects(actor, selected, kind) {
  const feats = selected.filter(id => id.startsWith("feat:")).map(id => actor.items.get(id.slice(5))).filter(Boolean);
  let damage = 0;
  let critical = 0;
  let criticalSpell = 0;
  let powerRoll = 0;
  let powerPerCrit = 0;
  const damageLines = [];
  // Formulas of feat modifiers use the actor's highest Magic Power (Mana Strike: + Magic Power)
  const magicPower = Math.max(0, ...Object.values(actor.system.magic ?? {}).map(m => m?.power ?? 0));
  for ( const feat of feats ) {
    for ( const m of resolveModifiers(feat.system.modifiers, { magicPower })) {
      if ( m.scope !== "use" ) continue;
      if ( DAMAGE_KEYS.includes(m.key) && keyApplies(m.key, kind) ) {
        damage += m.value;
        if ( m.value ) damageLines.push({ label: feat.name, value: m.value });
      }
      if ( (m.key === "critical") && (kind !== "spell") ) critical += m.value;
      if ( m.key === "criticalSpell" ) criticalSpell += m.value;
      if ( m.key === "powerRoll" ) powerRoll += m.value;
      if ( m.key === "powerPerCrit" ) powerPerCrit += m.value;
    }
  }
  return { feats, damage, damageLines, critical, criticalSpell, powerRoll, powerPerCrit, names: feats.map(f => f.name) };
}

/* -------------------------------------------- */
/*  Character weapon attacks                    */
/* -------------------------------------------- */

/**
 * Attack with a weapon.
 * @param {Actor} actor
 * @param {Item} weapon
 * @param {object} [options]
 * @param {Event} [options.event]
 */
export async function rollWeaponAttack(actor, weapon, { event } = {}) {
  const atk = weapon.system.attack;
  if ( !atk ) return;
  if ( !weapon.system.equipped ) ui.notifications.warn(t("SW25.Warn.NotEquipped", { name: weapon.name }));
  const kind = atk.kind === "melee" ? "melee" : "ranged";

  // Gun: choose a bullet spell; the gun must hold loaded bullets (CR I p.149, 178)
  let bullet = null;
  const extraFields = [];
  let bulletChoices = [];
  const tracksBullets = weapon.system.isGun && Number.isInteger(weapon.system.magazine) && (weapon.system.magazine > 0);
  if ( weapon.system.isGun ) {
    if ( tracksBullets && (weapon.system.loaded < 1) ) {
      const reload = await foundry.applications.api.DialogV2.confirm({
        window: { title: weapon.name, icon: "fa-solid fa-gun" },
        classes: PAPER_DIALOG,
        content: `<p>${t("SW25.Gun.EmptyReload", { name: weapon.name })}</p>`,
        rejectClose: false
      });
      if ( reload ) await reloadGun(actor, weapon);
      return;
    }
    bulletChoices = await availableBulletSpells(actor);
    if ( !bulletChoices.length ) return ui.notifications.warn(t("SW25.Warn.NoBullets"));
    extraFields.push({
      name: "bullet", label: t("SW25.Gun.Bullet"), type: "select",
      value: bulletChoices[0].uuid,
      options: Object.fromEntries(bulletChoices.map(b => [b.uuid, `${b.name} (MP${b.cost}, ${t("SW25.Power")} ${b.power ?? "-"})`]))
    });
  }

  // Ammunition of bows, crossbows and blowguns: its modifiers apply to the shot, and one is used up
  const ammoChoices = (!weapon.system.isGun && (atk.kind === "shooting")) ? actor.items.filter(i => (i.type === "gear")
    && (i.system.itemType === "ammo") && (i.system.quantity > 0)
    && String(i.system.ammoFor ?? "").split(/\s*,\s*/).includes(weapon.system.category)) : [];
  if ( ammoChoices.length ) {
    extraFields.push({
      name: "ammo", label: t("SW25.Ammo.label"), type: "select", value: ammoChoices[0].id,
      options: { "": t("SW25.Ammo.None"), ...Object.fromEntries(ammoChoices.map(a => [a.id, `${a.name} (${a.system.quantity})`])) }
    });
    extraFields.push({ name: "spendAmmo", label: t("SW25.Ammo.Spend"), type: "checkbox", value: true });
  }

  const keys = ["accuracy", kind === "melee" ? "accuracyMelee" : "accuracyRanged", "actionChecks", "allChecks"];
  // Situational damage bonuses (added to the damage, not to the check) and the weapon's own situational modifiers
  const damageKeys = weapon.system.isGun ? ["damageMagic"] : ["damage", kind === "melee" ? "damageMelee" : "damageRanged"];
  const damageOptions = conditionalOptions(actor, damageKeys)
    .map(o => ({ ...o, id: `dmg-${o.id}`, value: 0, damage: o.value, hint: `${signed(o.damage ?? o.value)} ${t("SW25.Damage.label")}` }));
  const weaponOptions = weapon.system.modifiers.map((m, i) => ({ m, i }))
    .filter(({ m }) => (m.scope === "use") && m.condition && (CHECK_KEYS.includes(m.key) || DAMAGE_KEYS.includes(m.key)))
    .map(({ m, i }) => {
      const isDamage = DAMAGE_KEYS.includes(m.key);
      return {
        id: `wpn${i}`, label: `${weapon.name}: ${m.condition}`, value: isDamage ? 0 : m.value, damage: isDamage ? m.value : 0,
        checked: false, group: "SW25.Roll.Situational", hint: `${signed(m.value)}${isDamage ? ` ${t("SW25.Damage.label")}` : ""}`
      };
    });
  const dialog = await RollDialog.prompt({
    title: `${t("SW25.Check.accuracy")} — ${weapon.name}`,
    summary: `${atk.classLabel}: ${signed(atk.accuracy)} · ${t("SW25.Power")} ${atk.power ?? "-"} · ${t("SW25.CritValue")} ${atk.critical} · ${t("SW25.ExtraDamage")} ${signed(atk.extraDamage)}`,
    options: [...declarableFeats(actor, weapon.system.isGun ? "gun" : kind), ...weaponOptions, ...conditionalOptions(actor, keys), ...damageOptions],
    extraFields,
    skip: RollDialog.shouldSkip(event) && !weapon.system.isGun && !ammoChoices.length
  });
  if ( !dialog ) return;
  await consumeChosenItems(actor, dialog);

  // Bullet spell cost
  let power = atk.power;
  let damageKind = atk.damageKind;
  let heal = false;
  let critical = atk.critical;
  let gunTypes = [];
  if ( weapon.system.isGun ) {
    bullet = bulletChoices.find(b => b.uuid === dialog.extra.bullet) ?? bulletChoices[0];
    // A spell on 3 bullets needs them in the gun
    if ( tracksBullets && (weapon.system.loaded < bullet.bullets) ) {
      return ui.notifications.warn(t("SW25.Gun.NotEnoughLoaded", { name: weapon.name, count: bullet.bullets }));
    }
    const ok = await payMP(actor, bullet.cost, bullet.name);
    if ( !ok ) return;
    power = bullet.power ?? 0;
    heal = bullet.heal;
    critical += bullet.critical ?? 0;
    if ( tracksBullets ) {
      if ( weapon.system.loadedAmmo?.silver ) gunTypes.push("silver");
      await weapon.update({ "system.loaded": weapon.system.loaded - bullet.bullets });
    }
  }

  const declared = declaredEffects(actor, dialog.selected, weapon.system.isGun ? "gun" : kind);
  let chosenDamage = (dialog.chosen ?? []).reduce((a, o) => a + (Number(o.damage) || 0), 0);
  const extraParts = [...(atk.extraBreakdown ?? []), ...declared.damageLines,
    ...(dialog.chosen ?? []).filter(o => Number(o.damage)).map(o => ({ label: o.label, value: Number(o.damage) }))];

  // Ammunition
  const ammo = dialog.extra.ammo ? actor.items.get(dialog.extra.ammo) : null;
  const ammoTypes = [];
  if ( ammo ) {
    const mods = ammo.system.modifiers.filter(m => !m.condition);
    const sum = (...k) => mods.filter(m => k.includes(m.key)).reduce((a, m) => a + (Number(m.value) || 0), 0);
    const accuracy = sum("accuracy", "accuracyRanged");
    if ( accuracy ) dialog.parts.push({ label: ammo.name, value: accuracy });
    critical += sum("critical");
    power = Math.clamp((power ?? 0) + sum("weaponPower"), 0, 100);
    const ammoDamage = sum("damage", "damageRanged");
    chosenDamage += ammoDamage;
    if ( ammoDamage ) extraParts.push({ label: ammo.name, value: ammoDamage });
    if ( ammo.system.silver ) ammoTypes.push("silver");
    ammoTypes.push(...(ammo.system.types ?? []));
    if ( ammo.system.magic ) damageKind = "magic";
    if ( dialog.extra.spendAmmo ) {
      if ( ammo.system.quantity > 1 ) await ammo.update({ "system.quantity": ammo.system.quantity - 1 });
      else await ammo.delete();
    }
  }
  const tokens = getTargetTokens();
  const targets = await snapshotTargets(tokens, { contest: heal ? null : "evasion", askSection: true });
  const roll = await evaluateCheck({ base: atk.accuracy, parts: dialog.parts });
  const result = resultFromRoll(roll);
  const expGained = await handleAutoFailureExp(actor, result);

  // Risks of declared feats, and their effects on the characters hit (Nerve Strike)
  for ( const feat of declared.feats ) await applyRisk(actor, feat);
  const onHit = declared.feats.flatMap(f => f.system.modifiers.filter(m => (m.target === "target") && (m.scope !== "use")));
  const hitEffect = onHit.length ? {
    name: declared.feats.filter(f => f.system.modifiers.some(m => m.target === "target")).map(f => f.name).join(", "),
    img: declared.feats.find(f => f.system.modifiers.some(m => m.target === "target"))?.img,
    modifiers: onHit, duration: { unit: "rounds", value: 1 }, origin: weapon.uuid
  } : null;

  const details = [
    { label: t("SW25.AttackClass"), value: atk.classLabel },
    { label: t("SW25.Category"), value: t(CONFIG.SW25.weaponCategories[weapon.system.category] ?? weapon.system.category) }
  ];
  if ( bullet ) details.push({ label: t("SW25.Gun.Bullet"), value: bullet.name });
  if ( tracksBullets ) details.push({ label: t("SW25.Gun.Magazine"), value: `${weapon.system.loaded} / ${weapon.system.magazine}` });
  if ( ammo ) details.push({ label: t("SW25.Ammo.label"), value: ammo.name });
  if ( declared.names.length ) details.push({ label: t("SW25.Roll.Declare"), value: declared.names.join(", ") });

  await createCard({
    kind: "attack",
    actorUuid: actor.uuid,
    itemUuid: weapon.uuid,
    title: weapon.name,
    subtitle: t("SW25.Card.WeaponAttack"),
    img: weapon.img,
    details,
    check: { ...result, base: atk.accuracy, parts: dialog.parts, breakdown: atk.accuracyBreakdown ?? null, label: t("SW25.Check.accuracy"), expGained },
    contest: heal ? null : "evasion",
    resistance: null,
    targets,
    damage: {
      mode: "power",
      power: power ?? 0,
      critical: critical + declared.critical,
      extra: atk.extraDamage + declared.damage + chosenDamage,
      extraParts,
      rollBonus: declared.powerRoll + (atk.powerRoll ?? 0),
      powerPerCrit: declared.powerPerCrit + (atk.powerPerCrit ?? 0),
      kind: heal ? null : damageKind,
      types: heal ? [] : (weapon.system.isGun ? gunTypes : [...new Set([...weaponDamageTypes(weapon), ...ammoTypes])]),
      heal,
      source: weapon.system.isGun ? "gun" : kind,
      declaredDamage: declared.damage + chosenDamage
    },
    effect: hitEffect
  }, { rolls: [roll], speaker: speakerFor(actor), rollMode: dialog.rollMode });
}

/**
 * Roll a weapon's damage without an accuracy check (the hit was decided elsewhere). Guns need a bullet spell,
 * so they go through the full attack workflow instead.
 * @param {Actor} actor
 * @param {Item} weapon
 * @param {object} [options]
 * @param {Event} [options.event]
 */
export async function rollWeaponDamage(actor, weapon, { event } = {}) {
  const atk = weapon.system.attack;
  if ( !atk ) return;
  if ( weapon.system.isGun ) return rollWeaponAttack(actor, weapon, { event });
  const base = {
    mode: "power",
    power: atk.power ?? 0,
    critical: atk.critical,
    extra: atk.extraDamage,
    extraParts: atk.extraBreakdown ?? [],
    rollBonus: atk.powerRoll ?? 0,
    powerPerCrit: atk.powerPerCrit ?? 0,
    kind: atk.damageKind,
    types: weaponDamageTypes(weapon),
    heal: false,
    source: atk.kind === "melee" ? "melee" : "ranged"
  };
  const { configureDamage } = await import("./damage-roll.mjs");
  const configured = await configureDamage(actor, base, { title: weapon.name, event, declare: base.source });
  if ( !configured ) return;
  const { damage, rollMode } = configured;
  const { rollPower } = await import("../dice/power.mjs");
  const { result, rolls } = await rollPower({
    power: damage.power, critical: damage.critical, extra: damage.extra, rollBonus: damage.rollBonus, powerPerCrit: damage.powerPerCrit
  });
  const targets = (await snapshotTargets(getTargetTokens(), { askSection: true }))
    .map(target => ({ ...target, halved: false, amount: result.calculated, result }));
  await createCard({
    kind: "damage",
    actorUuid: actor.uuid,
    itemUuid: weapon.uuid,
    title: weapon.name,
    subtitle: t("SW25.Card.Damage"),
    img: weapon.img,
    damage,
    result,
    targets
  }, { rolls, speaker: speakerFor(actor), rollMode });
}

/**
 * Damage types dealt by a weapon's physical damage (slashing/bludgeoning weak points, silver).
 * @param {Item} weapon
 * @returns {string[]}
 */
function weaponDamageTypes(weapon) {
  const s = weapon.system;
  const types = [];
  if ( s.edged ) types.push("slashing");
  if ( s.blunt ) types.push("bludgeoning");
  if ( s.silver ) types.push("silver");
  return types;
}

/**
 * Load bullets from the inventory into a gun, up to its magazine (a Major Action, CR I p.149). With several kinds of
 * bullets the user picks one.
 * @param {Actor} actor
 * @param {Item} weapon
 * @returns {Promise<boolean>}   Whether bullets were loaded
 */
export async function reloadGun(actor, weapon) {
  const s = weapon.system;
  if ( !s.isGun || !Number.isInteger(s.magazine) ) return false;
  const space = s.magazine - s.loaded;
  if ( space <= 0 ) {
    ui.notifications.info(t("SW25.Gun.Full", { name: weapon.name }));
    return false;
  }
  const stocks = actor.items.filter(i => (i.type === "gear") && (i.system.itemType === "ammo") && (i.system.quantity > 0)
    && String(i.system.ammoFor ?? "").split(/\s*,\s*/).includes("gun"));
  if ( !stocks.length ) {
    ui.notifications.warn(t("SW25.Gun.NoAmmo", { name: actor.name }));
    return false;
  }
  let stock = stocks[0];
  if ( stocks.length > 1 ) {
    const id = await foundry.applications.api.DialogV2.wait({
      window: { title: t("SW25.Gun.Reload"), icon: "fa-solid fa-gun" },
      classes: PAPER_DIALOG,
      content: `<p>${t("SW25.Gun.ChooseAmmo", { name: weapon.name })}</p>`,
      buttons: stocks.map((a, i) => ({ action: a.id, label: `${a.name} (${a.system.quantity})`, default: i === 0, callback: () => a.id })),
      rejectClose: false
    });
    stock = stocks.find(a => a.id === id);
    if ( !stock ) return false;
  }
  const count = Math.min(space, stock.system.quantity);
  if ( stock.system.quantity > count ) await stock.update({ "system.quantity": stock.system.quantity - count });
  else await stock.delete();
  await weapon.update({ "system.loaded": s.loaded + count, "system.loadedAmmo": { name: stock.name, silver: !!stock.system.silver } });
  await ChatMessage.implementation.create({
    speaker: speakerFor(actor),
    content: `<div class="sw25 swp swp-chat swp-chat-note-card"><p><i class="fa-solid fa-gun"></i> ${t("SW25.Gun.Reloaded", {
      name: weapon.name, count, ammo: stock.name, loaded: s.loaded + count, magazine: s.magazine })}</p></div>`
  });
  return true;
}

/**
 * Magitech bullet spells available to an actor (owned spell items + compendium, up to its Artificer level).
 * @param {Actor} actor
 * @returns {Promise<object[]>}
 */
export async function availableBulletSpells(actor) {
  const level = actor.system.magic?.magitech?.level ?? 0;
  const out = [];
  const seen = new Set();
  const push = (doc) => {
    const s = doc.system;
    if ( (s.magic !== "magitech") || !["bullet", "bullets3"].includes(s.target?.kind) ) return;
    if ( s.level > level ) return;
    if ( seen.has(doc.name) ) return;
    seen.add(doc.name);
    const critMod = (s.modifiers ?? []).filter(m => m.key === "critical").reduce((a, m) => a + m.value, 0);
    out.push({
      uuid: doc.uuid, name: doc.name, cost: s.cost?.mp ?? 0, power: s.effect?.power,
      heal: s.effect?.kind === "heal", critical: critMod, level: s.level,
      bullets: s.target?.kind === "bullets3" ? 3 : 1
    });
  };
  for ( const item of actor.items ) if ( item.type === "spell" ) push(item);
  if ( level > 0 ) {
    const pack = game.packs.get("swordworld25.spells");
    if ( pack ) {
      const index = await pack.getIndex({ fields: ["system.magic", "system.level", "system.target", "system.cost", "system.effect", "system.modifiers"] });
      for ( const entry of index ) push({ ...entry, uuid: entry.uuid });
    }
  }
  return out.sort((a, b) => a.level - b.level);
}

/**
 * Spend MP (optionally from a mako stone). Returns false if the actor cannot pay.
 * @param {Actor} actor
 * @param {number} cost
 * @param {string} label
 * @param {object} [options]
 * @param {Item} [options.mako]  Mako stone item to draw from first
 * @returns {Promise<boolean>}
 */
export async function payMP(actor, cost, label, { mako = null, makoPoints = 0 } = {}) {
  cost = Math.max(0, Number(cost) || 0);
  if ( !cost ) return true;
  let fromStone = 0;
  if ( mako ) fromStone = Math.min(makoPoints || cost, mako.system.mako.value, cost);
  const fromActor = cost - fromStone;
  if ( actor.type === "character" ) {
    if ( actor.system.mp.value < fromActor ) {
      ui.notifications.warn(t("SW25.Warn.NotEnoughMP", { name: label }));
      return false;
    }
    await actor.update({ "system.mp.value": actor.system.mp.value - fromActor });
  } else if ( actor.system.sections?.length ) {
    const sections = foundry.utils.deepClone(actor._source.system.sections);
    const idx = Math.max(0, sections.findIndex(s => s.main));
    if ( sections[idx].mp.value < fromActor ) {
      ui.notifications.warn(t("SW25.Warn.NotEnoughMP", { name: label }));
      return false;
    }
    sections[idx].mp.value -= fromActor;
    await actor.update({ "system.sections": sections });
  }
  if ( fromStone ) {
    const remaining = mako.system.mako.value - fromStone;
    if ( remaining <= 0 ) await mako.delete();
    else await mako.update({ "system.mako.value": remaining });
  }
  return true;
}

/* -------------------------------------------- */
/*  Monster attacks                             */
/* -------------------------------------------- */

/**
 * Attack with a monster section.
 * @param {Actor} actor
 * @param {number} index
 * @param {object} [options]
 */
export async function rollSectionAttack(actor, index, { event } = {}) {
  const section = actor.system.sections[index];
  if ( !section || !Number.isInteger(section.accuracyTotal) ) return;
  const dialog = await RollDialog.prompt({
    title: `${t("SW25.Check.accuracy")} — ${actor.name} (${section.label})`,
    summary: `${t("SW25.Check.accuracy")} ${section.accuracyTotal} (${section.accuracyTotal + CONFIG.SW25.FIXED_OFFSET}) · ${t("SW25.Damage.label")} ${section.damage}`,
    options: [...declarableFeats(actor, "melee"), ...conditionalOptions(actor, ["accuracy", "accuracyMelee", "actionChecks", "allChecks"])],
    showFixed: true,
    fixedDefault: actor.system.usesFixedValues,
    skip: RollDialog.shouldSkip(event)
  });
  if ( !dialog ) return;
  await consumeChosenItems(actor, dialog);
  const declared = declaredEffects(actor, dialog.selected, "melee");
  const targets = await snapshotTargets(getTargetTokens(), { contest: "evasion", askSection: true });
  let roll = null;
  let result;
  if ( dialog.useFixed ) result = fixedResult(section.accuracyTotal + dialog.bonus + CONFIG.SW25.FIXED_OFFSET);
  else {
    roll = await evaluateCheck({ base: section.accuracyTotal, parts: dialog.parts });
    result = resultFromRoll(roll);
  }
  for ( const feat of declared.feats ) await applyRisk(actor, feat);
  await createCard({
    kind: "attack",
    actorUuid: actor.uuid,
    section: index,
    title: `${section.style || section.label}`,
    subtitle: actor.system.multiSection ? section.label : t("SW25.Card.MonsterAttack"),
    img: actor.img,
    details: declared.names.length ? [{ label: t("SW25.Roll.Declare"), value: declared.names.join(", ") }] : [],
    check: { ...result, base: section.accuracyTotal, parts: dialog.parts, breakdown: section.accuracyBreakdown ?? null, label: t("SW25.Check.accuracy") },
    contest: "evasion",
    targets,
    damage: {
      mode: "formula",
      formula: section.damage,
      extra: (section.damageBonus ?? 0) + declared.damage,
      extraParts: [...actor.system.bonusBreakdown(["damage", "damageMelee"]), ...declared.damageLines],
      kind: "physical",
      types: [],
      heal: false,
      source: "melee"
    }
  }, { rolls: roll ? [roll] : [], speaker: speakerFor(actor), rollMode: dialog.rollMode });
}

/**
 * Value derived from a mount's jockey, e.g. "riderInt" = Rider level + INT modifier.
 * @param {Actor} actor  The mount
 * @param {string} base
 * @returns {number}
 */
export function jockeyValue(actor, base) {
  const jockey = actor.system?.jockeyActor;
  if ( !jockey ) return 0;
  const map = { riderInt: "int", riderDex: "dex", riderAgi: "agi", riderSpi: "spi", riderStr: "str", riderVit: "vit" };
  const ability = map[base];
  const rider = jockey.system.classes?.rider?.level ?? 0;
  return rider + (jockey.system.abilities?.[ability]?.mod ?? 0);
}

/**
 * Use a monster unique skill (or any "ability" item).
 * @param {Actor} actor
 * @param {Item} ability
 * @param {object} [options]
 */
export async function useAbility(actor, ability, { event } = {}) {
  const sys = ability.system;
  if ( sys.spellcasting?.system ) {
    const { default: SpellbookApp } = await import("../applications/apps/spellbook.mjs");
    return SpellbookApp.openFor(actor, { system: sys.spellcasting.system });
  }
  const checkBase = Number.isInteger(sys.check.value) ? sys.check.value
    : (sys.check.base ? jockeyValue(actor, sys.check.base) : null);
  const hasCheck = Number.isInteger(checkBase);
  const contest = hasCheck && ["evasion", "fortitude", "willpower", "dangerSense"].includes(sys.check.vs) ? sys.check.vs : null;
  const damageFormula = sys.damage?.formula;
  const damagePower = Number.isInteger(sys.damage?.power) ? sys.damage.power : null;
  const effectMods = sys.modifiers.filter(m => m.target === "target");
  let roll = null;
  let result = null;
  let rollMode = game.settings.get("core", "rollMode");
  let parts = [];
  if ( hasCheck ) {
    const dialog = await RollDialog.prompt({
      title: `${ability.name} — ${actor.name}`,
      summary: `${checkBase} (${checkBase + CONFIG.SW25.FIXED_OFFSET}) / ${t(`SW25.Check.${sys.check.vs}`) || sys.check.vs} / ${t(CONFIG.SW25.resistance[sys.check.result] ?? sys.check.result)}`,
      options: conditionalOptions(actor, ["actionChecks", "allChecks"]),
      showFixed: (actor.type !== "character") && !sys.check.base,
      fixedDefault: actor.system.usesFixedValues && !sys.check.base,
      skip: RollDialog.shouldSkip(event)
    });
    if ( !dialog ) return;
    await consumeChosenItems(actor, dialog);
    rollMode = dialog.rollMode;
    parts = dialog.parts;
    if ( dialog.useFixed ) result = fixedResult(checkBase + dialog.bonus + CONFIG.SW25.FIXED_OFFSET);
    else {
      roll = await evaluateCheck({ base: checkBase, parts: dialog.parts });
      result = resultFromRoll(roll);
    }
  }
  let damage = null;
  if ( damagePower !== null ) {
    const jockey = sys.damage.bonus ? jockeyValue(actor, sys.damage.bonus) : 0;
    damage = {
      mode: "power", power: damagePower, critical: sys.damage.critical ?? 10,
      extra: jockey,
      extraParts: jockey ? [{ label: "SW25.Breakdown.Jockey", value: jockey }] : [],
      source: "ability",
      kind: sys.damage.kind === "heal" ? null : (sys.damage.kind || "magic"), types: sys.damage.types ?? [],
      heal: sys.damage.kind === "heal"
    };
  } else if ( damageFormula ) {
    damage = {
      mode: "formula", formula: damageFormula, extra: 0, source: "ability",
      kind: sys.damage.kind === "heal" ? null : (sys.damage.kind || "magic"), types: sys.damage.types ?? [],
      heal: sys.damage.kind === "heal"
    };
  }
  const targets = await snapshotTargets(getTargetTokens(), { contest, askSection: contest === "evasion" });
  await createCard({
    kind: "ability",
    actorUuid: actor.uuid,
    itemUuid: ability.uuid,
    title: ability.name,
    subtitle: `${sys.tagIcons} ${sys.section || ""}`.trim(),
    img: ability.img,
    summary: sys.summary,
    description: sys.description,
    check: result ? {
      ...result, base: checkBase, parts, label: ability.name,
      breakdown: [{ label: sys.check.base ? "SW25.Breakdown.Jockey" : "SW25.Breakdown.StatBlock", value: checkBase }]
    } : null,
    contest,
    resistance: sys.check.result || null,
    targets,
    damage,
    effect: effectMods.length ? {
      name: ability.name, img: ability.img, modifiers: effectMods,
      duration: { unit: "rounds", value: 1 }, origin: ability.uuid
    } : null
  }, { rolls: roll ? [roll] : [], speaker: speakerFor(actor), rollMode });
}

/**
 * Declare an active combat feat that lasts for the round (Infight, Defensive Stance, Cover, Metamagic): its
 * modifiers become a 1-round effect on the user, its risk applies, and a card is posted.
 * @param {Actor} actor
 * @param {Item} feat
 */
export async function declareFeat(actor, feat) {
  const mods = feat.system.modifiers.filter(m => (m.scope !== "use") && (m.target !== "target"));
  if ( mods.length ) {
    await applyEffects(actor, [buildEffectData({
      name: feat.name, img: feat.img, modifiers: mods, duration: { unit: "rounds", value: 1 }, origin: feat.uuid,
      description: feat.system.summary
    })]);
  }
  await applyRisk(actor, feat);
  const { postItemCard } = await import("./magic.mjs");
  return postItemCard(actor, feat);
}
