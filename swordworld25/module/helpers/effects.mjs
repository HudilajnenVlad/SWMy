import { executeAsGM } from "./socket.mjs";
import { t } from "./utils.mjs";

/**
 * Convert a rules duration into ActiveEffect duration data.
 * @param {object} duration  {unit, value}
 * @returns {object}
 */
export function effectDuration(duration) {
  const unit = duration?.unit;
  const value = Number(duration?.value) || 0;
  const combat = game.combat;
  const base = combat?.started ? { combat: combat.id, startRound: combat.round, startTurn: combat.turn ?? 0 } : null;
  switch ( unit ) {
    case "rounds":
    case "instantRounds":
      return base ? { ...base, rounds: value || 1 } : { seconds: (value || 1) * 10 };
    case "minutes":
      return base ? { ...base, rounds: value * 6 } : { seconds: value * 60 };
    case "hours":
      return { seconds: value * 3600 };
    case "days":
      return { seconds: value * 86400 };
    default:
      return {};
  }
}

/**
 * Compute the formula part of modifiers ("@magicPower + 8") and add it to their value.
 * @param {object[]} modifiers
 * @param {object} data   Values available to the formulas: magicPower, level, bardicPower, alchemyPower...
 * @returns {object[]}    Copies with a plain value
 */
export function resolveModifiers(modifiers = [], data = {}) {
  return modifiers.filter(m => m?.key).map(m => {
    if ( !m.formula ) return { ...m };
    let extra = 0;
    try {
      const expr = Roll.replaceFormulaData(m.formula, data, { missing: "0" });
      extra = Math.floor(Number(Roll.safeEval(expr)) || 0);
    } catch(err) {
      console.warn(`SW25 | Invalid modifier formula "${m.formula}"`, err);
    }
    return { ...m, value: (Number(m.value) || 0) + extra, formula: "" };
  });
}

/**
 * Modifiers that apply to an actor: some only work on characters (ability scores) or only on monsters and mounts
 * (fixed values).
 * @param {Actor} actor
 * @param {object[]} modifiers
 * @returns {object[]}
 */
export function modifiersFor(actor, modifiers = []) {
  const type = (actor?.type === "character") ? "character" : "monster";
  return modifiers.filter(m => !m.actorType || (m.actorType === type));
}

/**
 * Does a modifier apply only against some damage types (or all but some)? Such modifiers are not flat bonuses:
 * they are kept with the conditional ones and applied when damage of a matching type is taken.
 * @param {object} mod
 * @returns {boolean}
 */
export function isTyped(mod) {
  return !!(mod?.types?.length || mod?.exceptTypes?.length);
}

/**
 * Does a typed modifier apply to damage of these types?
 * @param {object} mod
 * @param {string[]} types   Types of the damage (fire, poison, bludgeoning...)
 * @returns {boolean}
 */
export function typedApplies(mod, types = []) {
  if ( mod.types?.length && !mod.types.some(tp => types.includes(tp)) ) return false;
  if ( mod.exceptTypes?.length && mod.exceptTypes.some(tp => types.includes(tp)) ) return false;
  return true;
}

/**
 * Build ActiveEffect creation data from a list of modifiers.
 * @param {object} config
 * @param {string} config.name
 * @param {string} [config.img]
 * @param {object[]} [config.modifiers]
 * @param {object} [config.duration]      Rules duration {unit, value}
 * @param {string} [config.origin]        Uuid of the source item/actor
 * @param {string[]} [config.statuses]
 * @param {string} [config.description]
 * @param {string[]} [config.types]       Damage/effect types of the source (poison of a Poison Cloud...)
 * @param {object} [config.flags]
 * @returns {object}
 */
export function buildEffectData({
  name, img, modifiers = [], duration, origin, statuses = [], description = "", types = [], flags = {}
}) {
  const changes = [];
  const conditional = [];
  for ( const mod of modifiers ) {
    if ( !mod?.key || (mod.scope === "use") ) continue;
    if ( mod.condition || isTyped(mod) ) {
      conditional.push({
        key: mod.key, value: mod.value, condition: mod.condition ?? "",
        ...(mod.types?.length ? { types: [...mod.types] } : {}),
        ...(mod.exceptTypes?.length ? { exceptTypes: [...mod.exceptTypes] } : {})
      });
    }
    else changes.push({
      key: `system.bonuses.${mod.key}`,
      mode: CONST.ACTIVE_EFFECT_MODES.ADD,
      value: String(mod.value),
      priority: 20
    });
  }
  // The numeric penalties of the conditions (blind: -4 to action checks...) unless the modifiers already set that key
  for ( const id of statuses ) {
    const cfg = CONFIG.statusEffects.find(e => e.id === id);
    for ( const change of cfg?.changes ?? [] ) {
      if ( !changes.some(c => c.key === change.key) ) changes.push({ ...change });
    }
  }
  return {
    name,
    img: img || "icons/svg/aura.svg",
    origin,
    description,
    changes,
    statuses,
    duration: effectDuration(duration),
    flags: foundry.utils.mergeObject({ swordworld25: {
      conditional,
      ...(types.length ? { types } : {}),
      // Whose turn it is when the effect begins: with popcorn turns, round durations end at that one's turn
      ...(game.combat?.started && game.combat.combatant?.actor ? { turnActor: game.combat.combatant.actor.uuid } : {})
    } }, flags)
  };
}

/**
 * Create effects on an actor (through the GM when needed).
 * @param {Actor} actor
 * @param {object[]} effects
 */
export async function applyEffects(actor, effects) {
  if ( !actor || !effects.length ) return;
  // Same-name effects do not stack (CR I p.172): replace them and refresh the duration.
  const names = new Set(effects.map(e => e.name));
  const existing = actor.effects.filter(e => names.has(e.name) && !e.getFlag("swordworld25", "stackable"));
  if ( actor.isOwner ) {
    if ( existing.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
    await actor.createEmbeddedDocuments("ActiveEffect", effects);
    return;
  }
  if ( existing.length ) await executeAsGM("deleteEffects", { uuid: actor.uuid, ids: existing.map(e => e.id) });
  await executeAsGM("createEffects", { uuid: actor.uuid, effects });
}

/**
 * End conditions and effects of some types on an actor (Cure Poison, Remove Curse, Awaken...).
 * @param {Actor} actor
 * @param {object} options
 * @param {string[]} [options.statuses]   Status ids
 * @param {string[]} [options.types]      Effect types: poison, disease, curse, psychic...
 * @returns {Promise<string[]>}           Names of the removed effects
 */
export async function removeEffects(actor, { statuses = [], types = [] } = {}) {
  if ( !actor || (!statuses.length && !types.length) ) return [];
  const matches = actor.effects.filter(e => {
    if ( [...(e.statuses ?? [])].some(s => statuses.includes(s)) ) return true;
    const own = e.getFlag("swordworld25", "types") ?? [];
    return own.some(tp => types.includes(tp) || (types.includes("psychic") && (tp === "psychicWeak")));
  });
  if ( !matches.length ) return [];
  const ids = matches.map(e => e.id);
  if ( actor.isOwner ) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  else await executeAsGM("deleteEffects", { uuid: actor.uuid, ids });
  return matches.map(e => e.name);
}

/**
 * Raise an actor's current HP by an amount (Virtual Toughness raises the current HP with the maximum).
 * @param {Actor} actor
 * @param {number} amount
 */
export async function raiseCurrentHp(actor, amount) {
  amount = Math.floor(Number(amount) || 0);
  if ( !actor || (amount <= 0) ) return;
  const { applyDamageTo } = await import("../combat/damage.mjs");
  await applyDamageTo(actor, { amount, heal: true, section: (actor.type === "character") ? null
    : Math.max(0, (actor.system.sections ?? []).findIndex(s => s.main)) });
}

/**
 * HP and MP above their maximum once an effect raising it ends are lowered to the maximum (GM side).
 * @param {Actor} actor
 */
export async function clampResources(actor) {
  if ( !actor ) return;
  if ( actor.type === "character" ) {
    const update = {};
    for ( const key of ["hp", "mp"] ) {
      const res = actor.system[key];
      if ( res && (res.value > res.max) ) update[`system.${key}.value`] = res.max;
    }
    if ( !foundry.utils.isEmpty(update) ) await actor.update(update);
    return;
  }
  const prepared = actor.system.sections ?? [];
  const sections = foundry.utils.deepClone(actor._source.system.sections ?? []);
  let changed = false;
  prepared.forEach((s, i) => {
    for ( const key of ["hp", "mp"] ) {
      if ( sections[i] && (sections[i][key].value > s[key].max) ) {
        sections[i][key].value = s[key].max;
        changed = true;
      }
    }
  });
  if ( changed ) await actor.update({ "system.sections": sections });
}

/**
 * Create the "risk" effect of a declared combat feat (lasts until the start of the next turn).
 * @param {Actor} actor
 * @param {Item} feat
 */
export async function applyRisk(actor, feat) {
  const mods = feat.system.risk?.modifiers ?? [];
  if ( !mods.length ) return;
  const data = buildEffectData({
    name: `${feat.name} (${t("SW25.Feat.Risk")})`,
    img: feat.img,
    modifiers: mods,
    duration: { unit: "rounds", value: 1 },
    origin: feat.uuid
  });
  await applyEffects(actor, [data]);
}

/**
 * Remove expired temporary effects of an actor (GM side).
 * @param {Actor} actor
 * @param {object} [options]                Popcorn turns (see SW25Combat#popcorn)
 * @param {Combat} [options.combat]
 * @param {string} [options.turnOf]         Uuid of the actor whose turn starts
 * @param {number} [options.roundEnded]     Round that just ended
 */
export async function removeExpiredEffects(actor, { combat = null, turnOf = null, roundEnded = null } = {}) {
  const expired = actor.effects.filter(e => {
    const d = e.duration;
    if ( !e.isTemporary ) return false;
    // Popcorn turns: an effect lasting N rounds ends at the start of the next turn of the one whose turn it was
    // when it began, N rounds later, or at the end of that round when they did not act
    if ( combat && d.rounds && ((e._source.duration?.combat ?? d.combat) === combat.id) && Number.isInteger(d.startRound) ) {
      const lastRound = d.startRound + d.rounds;
      if ( roundEnded !== null ) return roundEnded >= lastRound;
      const owner = e.getFlag("swordworld25", "turnActor");
      return !!turnOf && (owner === turnOf) && (combat.round >= lastRound);
    }
    if ( (d.type === "none") || (d.remaining === null) || (d.remaining === undefined) ) return false;
    return d.remaining <= 0;
  });
  if ( expired.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", expired.map(e => e.id));
}
