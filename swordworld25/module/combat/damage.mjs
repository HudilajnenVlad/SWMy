import { executeAsGM, registerSocketHandler } from "../helpers/socket.mjs";
import { actorFromUuid, PAPER_DIALOG, renderSystemTemplate, speakerFor, t, typesLabel } from "../helpers/utils.mjs";

/**
 * @typedef {object} DamageData
 * @property {number} amount                 Calculated (or total) damage / healing amount
 * @property {string} [kind="physical"]      physical | magic | fixed
 * @property {string[]} [types]              Damage types (fire, poison...)
 * @property {boolean} [heal=false]          Heal instead of damaging
 * @property {boolean} [mp=false]            Affect MP instead of HP
 * @property {number} [multiplier=1]         0.5 (half), 2 (double)...
 * @property {boolean} [ignoreDefense=false]
 * @property {number|null} [section=null]    Section index for multi-section targets
 * @property {string} [source]               Name of the source, for the log
 */

/**
 * Collect immunities of an actor from its unique skills and race.
 * @param {Actor} actor
 * @returns {Set<string>}
 */
export function getImmunities(actor) {
  const set = new Set();
  const map = {
    poison: "poison", disease: "disease", fire: "fire", earth: "earth", water: "water", ice: "water",
    wind: "wind", lightning: "lightning", energy: "energy", curse: "curse", psychic: "psychic",
    slashing: "slashing", bludgeoning: "bludgeoning"
  };
  for ( const item of actor.items ) {
    const m = item.name.match(/^(.*?)\s+Immunity$/i);
    if ( !m ) continue;
    const words = m[1].toLowerCase();
    if ( words.includes("normal weapon") ) set.add("normalWeapon");
    if ( words.includes("physical") ) set.add("physical");
    if ( words.includes("magic") && !words.includes("magic damage") ) set.add("magicAll");
    if ( words.includes("weak") && words.includes("psychic") ) set.add("psychicWeak");
    for ( const [word, type] of Object.entries(map) ) if ( words.includes(word) ) set.add(type);
  }
  if ( actor.system.race?.system?.key === "dwarf" ) set.add("fire");
  return set;
}

/**
 * Compute the applied damage against an actor without applying it.
 * @param {Actor} actor
 * @param {DamageData} data
 * @returns {{applied: number, breakdown: object[], immune: boolean, sectionIndex: number|null}}
 */
export function computeDamage(actor, data) {
  const sys = actor.system;
  const kind = data.kind ?? "physical";
  const types = data.types ?? [];
  const breakdown = [];
  let total = Math.round((Number(data.amount) || 0) * (data.multiplier ?? 1));
  if ( data.multiplier && (data.multiplier !== 1) ) {
    total = data.multiplier < 1 ? Math.ceil((Number(data.amount) || 0) * data.multiplier)
      : Math.floor((Number(data.amount) || 0) * data.multiplier);
    breakdown.push({ label: `×${data.multiplier}`, value: total });
  } else breakdown.push({ label: t("SW25.Damage.Calculated"), value: total });

  const immunities = getImmunities(actor);
  const immune = types.some(tp => immunities.has(tp)) || (kind === "physical" && immunities.has("physical"));
  if ( immune ) return { applied: 0, breakdown: [...breakdown, { label: t("SW25.Damage.Immune"), value: 0 }], immune: true, sectionIndex: data.section ?? null };

  if ( kind !== "fixed" ) {
    // Monster weak point
    const wp = sys.weakPoint;
    if ( wp && sys.weakPointRevealed && (wp.kind === "damage") && wp.value ) {
      // damageType is a damage kind (physical/magic) or type, or a comma-separated list of them
      const wpTypes = String(wp.damageType ?? "").split(",").map(s => s.trim()).filter(Boolean);
      const applies = wpTypes.some(wt => (wt === kind) || types.includes(wt));
      if ( applies ) {
        total += wp.value;
        breakdown.push({ label: t("SW25.WeakPoint.label"), value: wp.value });
      }
    }
    // Damage taken modifiers
    const b = sys.bonuses ?? {};
    const taken = (b.damageTaken ?? 0) + ((kind === "physical") ? (b.damageTakenPhysical ?? 0) : 0)
      + ((kind === "magic") ? (b.damageTakenMagic ?? 0) : 0);
    if ( taken ) {
      total += taken;
      breakdown.push({ label: t("SW25.Mod.damageTaken"), value: taken });
    }
    // Defense
    if ( (kind === "physical") && !data.ignoreDefense ) {
      let defense = 0;
      if ( actor.type === "character" ) defense = sys.defense ?? 0;
      else {
        const section = sys.sections?.[data.section ?? sys.sections.indexOf(sys.mainSectionData)] ?? sys.mainSectionData;
        defense = section?.defenseTotal ?? section?.defense ?? 0;
      }
      if ( defense ) {
        total -= defense;
        breakdown.push({ label: t("SW25.Defense"), value: -defense });
      }
    }
  }
  return { applied: Math.max(0, total), breakdown, immune: false, sectionIndex: data.section ?? null };
}

/**
 * Ask which section of a multi-section actor should receive an effect.
 * @param {Actor} actor
 * @param {string} [title]
 * @returns {Promise<number|null>}
 */
export async function promptSection(actor, title) {
  const sections = actor.system.sections ?? [];
  if ( sections.length <= 1 ) return 0;
  const main = Math.max(0, sections.findIndex(s => s.main));
  const buttons = sections.map((s, i) => ({
    action: `s${i}`,
    label: `${s.label ?? s.name ?? i} (${s.hp.value}/${s.hp.max})`,
    default: i === main,
    callback: () => i
  }));
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: title ?? t("SW25.Section.Choose"), icon: "fa-solid fa-bullseye" },
    classes: PAPER_DIALOG,
    content: `<p>${t("SW25.Section.ChooseHint", { name: actor.name })}</p>`,
    buttons,
    rejectClose: false
  });
  return Number.isInteger(result) ? result : null;
}

/**
 * Apply damage or healing to an actor, checking permissions and prompting for sections.
 * @param {Actor} actor
 * @param {DamageData} data
 * @returns {Promise<void>}
 */
export async function applyDamageTo(actor, data) {
  if ( !actor ) return;
  if ( (actor.type !== "character") && (actor.system.sections?.length > 1) && !Number.isInteger(data.section) ) {
    const section = await promptSection(actor);
    if ( section === null ) return;
    data = { ...data, section };
  }
  const payload = { actorUuid: actor.uuid, data, userId: game.user.id };
  if ( actor.isOwner ) return applyDamageHandler(payload);
  return executeAsGM("applyDamage", payload);
}

/**
 * Socket/local handler performing the update.
 * @param {object} payload
 */
async function applyDamageHandler({ actorUuid, data }) {
  const actor = actorFromUuid(actorUuid);
  if ( !actor ) return;
  const sys = actor.system;
  const resource = data.mp ? "mp" : "hp";
  const isCreature = actor.type !== "character";
  let sectionIndex = null;
  let before;
  let max;
  if ( isCreature ) {
    sectionIndex = Number.isInteger(data.section) ? data.section : Math.max(0, sys.sections.findIndex(s => s.main));
    const section = sys.sections[sectionIndex];
    if ( !section ) return;
    before = section[resource].value;
    max = section[resource].max;
  } else {
    before = sys[resource].value;
    max = sys[resource].max;
  }

  let applied;
  let breakdown = [];
  let after;
  if ( data.heal ) {
    applied = Math.max(0, Math.round((Number(data.amount) || 0) * (data.multiplier ?? 1)));
    after = Math.min(max, before + applied);
    applied = after - before;
  } else {
    const result = computeDamage(actor, { ...data, section: sectionIndex });
    applied = result.applied;
    breakdown = result.breakdown;
    after = before - applied;
    if ( resource === "mp" ) after = Math.max(0, after);
  }

  // Update
  if ( isCreature ) {
    const sections = foundry.utils.deepClone(actor._source.system.sections);
    sections[sectionIndex][resource].value = after;
    await actor.update({ "system.sections": sections }, { sw25Damage: true });
  } else {
    await actor.update({ [`system.${resource}.value`]: after }, { sw25Damage: true });
  }

  // Status automation
  if ( resource === "hp" ) await updateHealthStatus(actor, before, after, sectionIndex);

  // Log message (manual corrections from the resource tracker post none)
  if ( data.log !== false ) await postDamageLog(actor, { data, before, after, applied, breakdown, sectionIndex, resource });
}

registerSocketHandler("applyDamage", applyDamageHandler);

/**
 * Toggle unconscious / dead statuses when HP crosses 0.
 * @param {Actor} actor
 * @param {number} before
 * @param {number} after
 * @param {number|null} sectionIndex
 */
async function updateHealthStatus(actor, before, after, sectionIndex) {
  if ( !game.settings.get("swordworld25", "autoStatus") ) return;
  if ( actor.type === "character" ) {
    if ( (after <= 0) && !actor.statuses.has("unconscious") ) await actor.toggleStatusEffect("unconscious", { active: true });
    else if ( (after > 0) && actor.statuses.has("unconscious") && (before <= 0) ) {
      // Recovering HP alone does not wake a character (CR I p.185); leave the status to the players.
    }
    return;
  }
  // Creatures: defeated when the main section (or all sections) are down
  const sections = actor.system.sections;
  const mainIdx = sections.map((s, i) => s.main ? i : -1).filter(i => i >= 0);
  const down = sections.map(s => s.hp.value <= 0);
  let defeated;
  const mainText = (actor.system.mainSection ?? "").toLowerCase();
  if ( sections.length <= 1 ) defeated = down[0];
  else if ( mainText.includes("none") || !mainIdx.length ) defeated = down.every(d => d);
  else if ( mainText.includes("all") ) defeated = mainIdx.every(i => down[i]);
  else defeated = mainIdx.some(i => down[i]);
  const hasDead = actor.statuses.has("dead");
  if ( defeated && !hasDead ) await actor.toggleStatusEffect("dead", { active: true, overlay: true });
  else if ( !defeated && hasDead ) await actor.toggleStatusEffect("dead", { active: false });
}

/**
 * Post a short chat log of applied damage with an undo button.
 */
async function postDamageLog(actor, { data, before, after, applied, breakdown, sectionIndex, resource }) {
  const mode = game.settings.get("swordworld25", "damageLog");
  if ( mode === "none" ) return;
  const section = (sectionIndex !== null) && (actor.system.sections?.length > 1)
    ? actor.system.sections[sectionIndex]?.label : null;
  const content = await renderSystemTemplate("chat/damage-log.hbs", {
    name: actor.name,
    img: actor.img,
    actorUuid: actor.uuid,
    heal: data.heal,
    resource: resource.toUpperCase(),
    applied,
    before,
    after,
    section,
    types: typesLabel(data.types),
    kind: data.kind ? t(CONFIG.SW25.damageKinds[data.kind] ?? data.kind) : "",
    source: data.source ?? "",
    breakdown,
    down: (resource === "hp") && (after <= 0) && (before > 0),
    isCharacter: actor.type === "character"
  });
  const whisper = ((mode === "gm") || ((actor.type !== "character") && game.settings.get("swordworld25", "hideMonsterDamage")))
    ? game.users.filter(u => u.isGM).map(u => u.id) : undefined;
  await ChatMessage.implementation.create({
    content,
    speaker: speakerFor(actor),
    whisper,
    flags: {
      swordworld25: {
        kind: "damageLog",
        undo: { actorUuid: actor.uuid, resource, section: sectionIndex, value: before }
      }
    }
  });
}

/**
 * Undo a logged damage application.
 * @param {ChatMessage} message
 */
export async function undoDamage(message) {
  const undo = message.getFlag("swordworld25", "undo");
  if ( !undo ) return;
  const actor = actorFromUuid(undo.actorUuid);
  if ( !actor ) return;
  if ( actor.type === "character" ) await actor.update({ [`system.${undo.resource}.value`]: undo.value });
  else {
    const sections = foundry.utils.deepClone(actor._source.system.sections);
    const values = undo.sections ?? [{ section: undo.section, value: undo.value }];
    for ( const { section, value } of values ) if ( sections[section] ) sections[section][undo.resource].value = value;
    await actor.update({ "system.sections": sections });
  }
  await message.update({ "flags.swordworld25.undone": true });
}

/**
 * Heal an actor at the end of a turn or round (regeneration effects and unique skills). Characters heal their HP,
 * creatures the given sections (default: every section still standing), all in one update and one log.
 * @param {Actor} actor
 * @param {number} amount
 * @param {object} [options]
 * @param {string} [options.source]          Name shown in the log
 * @param {"alive"|"main"} [options.sections="alive"]
 * @returns {Promise<void>}
 */
export async function regenerate(actor, amount, { source = "", sections: which = "alive" } = {}) {
  amount = Math.floor(Number(amount) || 0);
  if ( (amount <= 0) || !actor ) return;
  if ( actor.type === "character" ) return applyDamageTo(actor, { amount, heal: true, source });
  const sections = foundry.utils.deepClone(actor._source.system.sections ?? []);
  const prepared = actor.system.sections ?? [];
  const mainIndex = Math.max(0, prepared.findIndex(s => s.main));
  const indices = (which === "main") ? [mainIndex] : prepared.map((s, i) => i).filter(i => prepared[i].hp.value > 0);
  const changes = [];
  for ( const i of indices ) {
    const before = sections[i]?.hp.value;
    const max = prepared[i]?.hp.max ?? before;
    if ( !Number.isFinite(before) || (before >= max) ) continue;
    const after = Math.min(max, before + amount);
    sections[i].hp.value = after;
    changes.push({ section: i, label: prepared[i].label, before, after });
  }
  if ( !changes.length ) return;
  await actor.update({ "system.sections": sections }, { sw25Damage: true });
  if ( actor.statuses.has("dead") ) await updateHealthStatus(actor, 0, 1, changes[0].section);
  const mode = game.settings.get("swordworld25", "damageLog");
  if ( mode === "none" ) return;
  const single = changes.length === 1;
  const content = await renderSystemTemplate("chat/damage-log.hbs", {
    name: actor.name,
    img: actor.img,
    actorUuid: actor.uuid,
    heal: true,
    resource: "HP",
    applied: single ? changes[0].after - changes[0].before : amount,
    before: single ? changes[0].before : null,
    after: single ? changes[0].after : null,
    section: single && (prepared.length > 1) ? changes[0].label : null,
    sectionsText: single ? "" : changes.map(c => `${c.label} ${c.before} → ${c.after}`).join(" · "),
    source,
    breakdown: [],
    isCharacter: false
  });
  const whisper = ((mode === "gm") || game.settings.get("swordworld25", "hideMonsterDamage"))
    ? game.users.filter(u => u.isGM).map(u => u.id) : undefined;
  await ChatMessage.implementation.create({
    content,
    speaker: speakerFor(actor),
    whisper,
    flags: {
      swordworld25: {
        kind: "damageLog",
        undo: { actorUuid: actor.uuid, resource: "hp", sections: changes.map(c => ({ section: c.section, value: c.before })) }
      }
    }
  });
}
