import { evaluateCheck, fixedResult, meetsTarget, resultFromRoll } from "../dice/check.mjs";
import RollDialog from "../dice/roll-dialog.mjs";
import { createCard, getCard, resistValue, updateCard } from "../chat/card.mjs";
import { parseRange, renderSystemTemplate, signed, speakerFor, t } from "../helpers/utils.mjs";

/**
 * Modifier keys relevant for a check key.
 * @param {string} key
 * @returns {string[]}
 */
export function modifierKeysForCheck(key) {
  const cfg = CONFIG.SW25.checks[key];
  const keys = ["allChecks", `check.${key}`];
  if ( cfg && !cfg.notAction ) keys.push("actionChecks");
  if ( cfg?.package ) keys.push(CONFIG.SW25.packageModifier[cfg.package]);
  if ( ["fortitude", "willpower", "initiative", "monsterKnowledge", "performance", "evocation", "riding"].includes(key) ) keys.push(key);
  if ( key === "evasion" ) keys.push("evasion", "actionChecks");
  return keys;
}

/**
 * Build dialog options from an actor's conditional modifiers.
 * @param {Actor} actor
 * @param {string[]} keys
 * @returns {object[]}
 */
export function conditionalOptions(actor, keys) {
  return (actor.system.getConditionalModifiers?.(keys) ?? []).map((m, i) => ({
    id: `cond${i}`,
    label: `${m.source}: ${m.condition}`,
    value: m.value,
    checked: false,
    group: "SW25.Roll.Situational",
    hint: m.consume ? `${signed(m.value)} · ${t("SW25.Roll.Consumed")}` : signed(m.value),
    consume: m.consume ? m.itemId : null
  }));
}

/**
 * Use up the consumable items whose modifier was chosen in a roll dialog (charms broken for their bonus...).
 * @param {Actor} actor
 * @param {{chosen?: object[]}} dialog
 */
export async function consumeChosenItems(actor, dialog) {
  const ids = [...new Set((dialog?.chosen ?? []).map(o => o.consume).filter(Boolean))];
  for ( const id of ids ) {
    const item = actor.items.get(id);
    if ( !item ) continue;
    const quantity = item.system.quantity ?? 1;
    if ( quantity > 1 ) await item.update({ "system.quantity": quantity - 1 });
    else await item.delete();
    ui.notifications.info(t("SW25.Roll.ItemConsumed", { name: item.name }));
  }
}

/**
 * Grant 50 experience for an automatic failure (CR I p.92).
 * @param {Actor} actor
 * @param {object} result
 * @returns {Promise<boolean>}
 */
export async function handleAutoFailureExp(actor, result) {
  if ( !result?.autoFailure || (actor?.type !== "character") ) return false;
  if ( !actor.isOwner ) return false;
  // The sheet's "Automatic Failures" tally counts every fumble of the session
  const update = { "system.fumbles": actor.system.fumbles + 1 };
  const grant = game.settings.get("swordworld25", "autoFailureExp");
  if ( grant ) {
    update["system.exp.value"] = actor.system.exp.value + 50;
    update["system.exp.total"] = actor.system.exp.total + 50;
  }
  await actor.update(update);
  return grant;
}

/**
 * Standard value and label of a check for any actor type.
 * @param {Actor} actor
 * @param {string} key
 * @param {object} [options]
 * @returns {{base: number, bonus: number, label: string, straight: boolean, fixedBase: number|null}}
 */
export function checkValue(actor, key, { section = null } = {}) {
  const sys = actor.system;
  if ( actor.type === "character" ) {
    if ( key === "fortitude" ) return { base: sys.fortitude, bonus: 0, label: t("SW25.Check.fortitude"), straight: false };
    if ( key === "willpower" ) return { base: sys.willpower, bonus: 0, label: t("SW25.Check.willpower"), straight: false };
    if ( key === "evasion" ) return { base: sys.evasion, bonus: 0, label: t("SW25.Check.evasion"), straight: sys.evasionStraight };
    const c = sys.checks?.[key];
    if ( !c ) return { base: 0, bonus: 0, label: key, straight: true };
    return { base: c.base, bonus: c.bonus, label: t(c.label), straight: c.straight, source: c.sourceLabel };
  }
  // Monsters and mounts
  if ( key === "fortitude" ) return { base: sys.fortitudeTotal, bonus: 0, label: t("SW25.Check.fortitude"), fixedBase: sys.fortitudeTotal };
  if ( key === "willpower" ) return { base: sys.willpowerTotal, bonus: 0, label: t("SW25.Check.willpower"), fixedBase: sys.willpowerTotal };
  if ( key === "initiative" ) return { base: sys.initiativeTotal ?? 0, bonus: 0, label: t("SW25.Check.initiative"), fixedBase: sys.initiativeTotal };
  if ( key === "evasion" ) {
    const v = resistValue(actor, "evasion", section);
    return { base: v ?? 0, bonus: 0, label: t("SW25.Check.evasion"), fixedBase: v };
  }
  if ( key === "death" ) return { base: sys.fortitudeTotal, bonus: 0, label: t("SW25.Check.death"), fixedBase: sys.fortitudeTotal };
  return { base: 0, bonus: 0, label: t(`SW25.Check.${key}`), straight: true };
}

/**
 * Roll a skill check and post a card.
 * @param {Actor} actor
 * @param {string} key
 * @param {object} [options]
 * @param {Event} [options.event]
 * @param {number} [options.targetNumber]
 * @param {string} [options.flavor]
 * @param {boolean} [options.chat=true]
 * @param {number|null} [options.section]
 * @returns {Promise<{result: object, roll: Roll|null, message: ChatMessage|null}|null>}
 */
export async function rollCheck(actor, key, {
  event, targetNumber = null, flavor = "", chat = true, section = null, extraOptions = [], title
} = {}) {
  const cfg = CONFIG.SW25.checks[key] ?? {};
  const value = checkValue(actor, key, { section });
  const isCreature = actor.type !== "character";
  const options = [...extraOptions, ...conditionalOptions(actor, modifierKeysForCheck(key))];
  const dialog = await RollDialog.prompt({
    title: title ?? `${value.label} — ${actor.name}`,
    summary: `${t("SW25.Roll.StandardValue")}: ${value.base + value.bonus}${value.straight ? ` (${t("SW25.StraightRoll")})` : ""}`,
    options,
    targetNumber: true,
    defaultTN: targetNumber,
    showFixed: isCreature,
    fixedDefault: isCreature && actor.system.usesFixedValues,
    skip: RollDialog.shouldSkip(event)
  });
  if ( !dialog ) return null;
  await consumeChosenItems(actor, dialog);

  let roll = null;
  let result;
  const parts = [];
  if ( value.bonus ) parts.push({ label: t("SW25.Roll.Bonuses"), value: value.bonus });
  parts.push(...dialog.parts);
  if ( isCreature && dialog.useFixed ) {
    result = fixedResult(value.base + value.bonus + dialog.bonus + CONFIG.SW25.FIXED_OFFSET);
  } else {
    roll = await evaluateCheck({ base: value.base, parts, noAutoSuccess: !!cfg.noAutoSuccess });
    result = resultFromRoll(roll);
  }
  const tn = dialog.targetNumber ?? targetNumber;
  const success = meetsTarget(result, tn);
  const expGained = await handleAutoFailureExp(actor, result);

  let message = null;
  if ( chat ) {
    message = await createCard({
      kind: "check",
      actorUuid: actor.uuid,
      title: value.label,
      subtitle: flavor || (value.source ? value.source : ""),
      img: actor.img,
      checkKey: key,
      check: { ...result, base: value.base, parts, label: value.label, targetNumber: tn, success, expGained },
      targets: []
    }, { rolls: roll ? [roll] : [], speaker: speakerFor(actor), rollMode: dialog.rollMode });
  }
  return { result, roll, message, success };
}

/* -------------------------------------------- */

/**
 * A target of a card rolls its resistance (Evasion, Willpower, Fortitude).
 * @param {ChatMessage} message
 * @param {number} index    Target index on the card
 * @param {Event} [event]
 */
export async function rollCardResistance(message, index, event) {
  const state = getCard(message);
  const target = state?.targets?.[index];
  if ( !target ) return;
  const actor = fromUuidSync(target.actorUuid, { strict: false });
  const token = fromUuidSync(target.tokenUuid, { strict: false });
  const resistActor = token?.actor ?? actor;
  if ( !resistActor?.isOwner ) return ui.notifications.warn(t("SW25.Warn.NotOwner"));
  const contest = state.contest;
  const extraOptions = [];
  // Situational penalties: full move / withdrawing handled by statuses; invisible attacker etc. by user
  const outcome = await rollCheck(resistActor, contest, {
    event,
    section: target.section,
    flavor: `${t("SW25.Card.Against")} ${state.title} (${state.check?.total ?? "?"})`,
    extraOptions,
    title: `${t(`SW25.Check.${contest}`)} — ${resistActor.name}`
  });
  if ( !outcome ) return;
  const resist = {
    total: outcome.result.total,
    autoSuccess: outcome.result.autoSuccess,
    autoFailure: outcome.result.autoFailure,
    fixed: outcome.result.fixed,
    dice: outcome.result.dice
  };
  await updateCard(message, { targets: { [index]: { resist } } });
}

/* -------------------------------------------- */

/**
 * Roll loot for a monster (CR I p.123).
 * @param {Actor} monster
 * @param {object} [options]
 * @param {Actor} [options.looter]  Character performing the loot determination (adds loot bonuses)
 */
export async function rollLoot(monster, { looter = null } = {}) {
  const loot = monster.system.loot ?? [];
  if ( !loot.length ) return ui.notifications.info(t("SW25.Loot.None"));
  const bonus = (looter?.system?.bonuses?.loot ?? 0);
  const roll = new Roll(`2d6 + ${bonus}`);
  await roll.evaluate();
  const total = roll.total;
  const rows = [];
  for ( const row of loot ) {
    // The printed roll text is authoritative (it is what the sheet edits); min/max are a fallback
    let range = parseRange(row.roll);
    if ( !range.always && !Number.isInteger(range.min) ) range = { min: row.min, max: row.max, always: false };
    const always = range.always;
    const within = !always && Number.isInteger(range.min) && (total >= range.min)
      && (!Number.isInteger(range.max) || (total <= range.max));
    if ( always || within ) rows.push({ ...row, always });
  }
  // A roll above every range gets the highest row (e.g. "10+")
  const content = await renderSystemTemplate("chat/loot.hbs", {
    name: monster.name,
    img: monster.img,
    total,
    dice: roll.dice[0].results.map(r => r.result).join("+"),
    diceList: roll.dice[0].results.map(r => r.result),
    bonus,
    looter: looter?.name,
    rows: rows.map(r => ({
      ...r,
      quantityLabel: r.quantity ? `×${r.quantity}` : "",
      priceLabel: Number.isInteger(r.price) ? `${r.price}G` : ""
    })),
    shards: monster.system.swordShards
  });
  await ChatMessage.implementation.create({
    content,
    rolls: [roll],
    speaker: speakerFor(monster),
    sound: CONFIG.sounds.dice,
    flags: { swordworld25: { kind: "loot" } }
  });
}

/* -------------------------------------------- */

/**
 * Death check for an unconscious character (CR I p.110): TN = |current HP|.
 * @param {Actor} actor
 * @param {Event} [event]
 */
export async function rollDeathCheck(actor, event) {
  const hp = actor.type === "character" ? actor.system.hp.value : (actor.system.mainSectionData?.hp.value ?? 0);
  const tn = Math.abs(Math.min(0, hp));
  return rollCheck(actor, "death", { event, targetNumber: tn, flavor: t("SW25.Death.Flavor", { tn }) });
}

/**
 * Monster knowledge check against targeted monsters (CR I p.382).
 * @param {Actor} actor
 * @param {Event} [event]
 */
export async function rollMonsterKnowledge(actor, event) {
  const outcome = await rollCheck(actor, "monsterKnowledge", { event });
  if ( !outcome ) return;
  const targets = Array.from(game.user.targets ?? []).map(tk => tk.actor).filter(a => a && (a.type !== "character"));
  if ( !targets.length ) return outcome;
  const canWeakness = actor.system.monsterKnowledgeSource === "sage" || !!actor.system.classes?.sage;
  const sageTotal = (() => {
    if ( actor.system.monsterKnowledgeSource === "sage" ) return outcome.result.total;
    const sage = actor.system.classes?.sage;
    if ( !sage ) return null;
    const diff = (sage.level) - (actor.system.classes?.[actor.system.monsterKnowledgeSource]?.level ?? 0);
    return outcome.result.total + diff;
  })();
  if ( !game.settings.get("swordworld25", "autoIdentify") ) return outcome;
  for ( const monster of targets ) {
    const rep = monster.system.reputation;
    const weak = monster.system.weakness;
    const update = {};
    if ( outcome.result.autoSuccess || (Number.isInteger(rep) && (outcome.result.total >= rep)) ) update["system.identified"] = true;
    if ( canWeakness && !outcome.result.autoFailure
      && (outcome.result.autoSuccess || (Number.isInteger(weak) && (sageTotal ?? -1) >= weak)) ) {
      update["system.weakPointRevealed"] = true;
    }
    if ( !foundry.utils.isEmpty(update) ) {
      const { executeAsGM } = await import("../helpers/socket.mjs");
      await executeAsGM("updateActor", { uuid: monster.uuid, update });
    }
  }
  return outcome;
}
