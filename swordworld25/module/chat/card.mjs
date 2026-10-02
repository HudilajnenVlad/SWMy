import { activeWins } from "../dice/check.mjs";
import { executeAsGM, registerSocketHandler } from "../helpers/socket.mjs";
import { actorFromUuid, renderSystemTemplate, signed, t, typesLabel } from "../helpers/utils.mjs";

/**
 * Workflow chat cards. The whole state of a card lives in `message.flags.swordworld25.card`; the HTML content is
 * re-rendered from that state whenever it changes.
 *
 * @typedef {object} CardState
 * @property {string} kind          check | attack | spell | ability | damage | use
 * @property {string} actorUuid
 * @property {string} [itemUuid]
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} img
 * @property {string} [summary]
 * @property {string} [description]
 * @property {object[]} [details]   [{label, value}]
 * @property {object} [check]       Active check {label, total, dice, autoSuccess, autoFailure, fixed, parts, base}
 * @property {string} [contest]     What targets roll: evasion | willpower | fortitude | null
 * @property {string} [resistance]  neg | half | cant | optional | none
 * @property {object[]} targets     [{tokenUuid, actorUuid, name, img, section, sectionLabel, fixed, resist, outcome}]
 * @property {object} [damage]      Damage configuration for the "roll damage" button
 * @property {object} [effect]      Effect to apply {name, img, modifiers, duration, statuses}
 * @property {object} [result]      Damage/heal result (damage cards)
 */

const TEMPLATE = "chat/card.hbs";

/**
 * Create a workflow card.
 * @param {CardState} state
 * @param {object} [options]
 * @param {Roll[]} [options.rolls]
 * @param {object} [options.speaker]
 * @param {string} [options.rollMode]
 * @returns {Promise<ChatMessage>}
 */
export async function createCard(state, { rolls = [], speaker, rollMode } = {}) {
  resolveOutcomes(state);
  const content = await renderCard(state);
  const data = {
    content,
    speaker,
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : undefined,
    flags: { swordworld25: { card: state } }
  };
  ChatMessage.implementation.applyRollMode(data, rollMode ?? game.settings.get("core", "rollMode"));
  return ChatMessage.implementation.create(data);
}

/**
 * Update the state of an existing card (relayed to the GM when the user cannot update the message).
 * @param {ChatMessage} message
 * @param {Function|object} patch  Object merged into the state, or a function(state) mutating it
 * @param {object} [serialized]    Serializable patch used for the GM relay
 */
export async function updateCard(message, patch) {
  if ( message.isOwner || game.user.isGM ) return applyCardPatch(message, patch);
  if ( typeof patch === "function" ) throw new Error("Function patches require ownership");
  return executeAsGM("updateCard", { messageId: message.id, patch });
}

/**
 * Apply a patch locally.
 * @param {ChatMessage} message
 * @param {Function|object} patch
 */
async function applyCardPatch(message, patch) {
  const state = foundry.utils.deepClone(message.getFlag("swordworld25", "card"));
  if ( !state ) return;
  if ( typeof patch === "function" ) patch(state);
  else applySerializedPatch(state, patch);
  resolveOutcomes(state);
  const content = await renderCard(state);
  return message.update({ content, "flags.swordworld25.card": state });
}

/**
 * Serialized patch format: { targets: { <index>: {...} }, addTargets: [...], set: { path: value } }.
 * Added targets go after the existing ones, which keep their rolls and results; tokens already on the card are skipped.
 * @param {CardState} state
 * @param {object} patch
 */
function applySerializedPatch(state, patch) {
  for ( const [idx, data] of Object.entries(patch.targets ?? {}) ) {
    const target = state.targets?.[Number(idx)];
    if ( target ) Object.assign(target, data);
  }
  if ( patch.addTargets?.length ) {
    state.targets ??= [];
    for ( const target of patch.addTargets ) {
      if ( !state.targets.some(tg => tg.tokenUuid === target.tokenUuid) ) state.targets.push(target);
    }
  }
  for ( const [path, value] of Object.entries(patch.set ?? {}) ) foundry.utils.setProperty(state, path, value);
}

registerSocketHandler("updateCard", async ({ messageId, patch }) => {
  const message = game.messages.get(messageId);
  if ( message ) await applyCardPatch(message, patch);
});

/* -------------------------------------------- */

/**
 * Compute each target's outcome from the active check and the target's resistance.
 * @param {CardState} state
 */
export function resolveOutcomes(state) {
  const check = state.check;
  for ( const target of state.targets ?? [] ) {
    if ( !state.contest ) {
      target.outcome = null;
      continue;
    }
    // An automatic failure misses, or (spells and other effects) fails outright with no effect at all
    if ( check?.autoFailure ) {
      target.outcome = state.contest === "evasion" ? "miss" : "failed";
      continue;
    }
    if ( !target.resist ) {
      target.outcome = null;
      continue;
    }
    const wins = activeWins(check, target.resist);
    if ( state.contest === "evasion" ) target.outcome = wins ? "hit" : "miss";
    else target.outcome = wins ? "affected" : "resisted";
  }
}

/* -------------------------------------------- */

/**
 * Render the HTML of a card.
 * @param {CardState} state
 * @returns {Promise<string>}
 */
export async function renderCard(state) {
  const SW25 = CONFIG.SW25;
  const check = state.check ? {
    ...state.check,
    partsLabel: (state.check.parts ?? []).map(p => `${p.label} ${signed(p.value)}`).join(", ")
  } : null;
  const contestLabel = state.contest ? t(`SW25.Check.${state.contest}`) : "";
  const targets = (state.targets ?? []).map((tg, index) => {
    const outcomeLabel = tg.outcome ? t(`SW25.Outcome.${tg.outcome}`) : "";
    return {
      ...tg,
      index,
      outcomeLabel,
      outcomeClass: tg.outcome ?? "pending",
      resistLabel: tg.resist ? String(tg.resist.total) : "",
      canResist: !!state.contest && !tg.resist && !check?.autoFailure,
      halved: (state.resistance === "half") && (tg.outcome === "resisted"),
      negated: ((state.resistance === "neg") && (tg.outcome === "resisted")) || (tg.outcome === "miss")
    };
  });
  const damage = state.damage ? {
    ...state.damage,
    typesLabel: typesLabel(state.damage.types),
    kindLabel: state.damage.kind ? t(SW25.damageKinds[state.damage.kind] ?? state.damage.kind) : "",
    label: state.damage.heal ? t(state.damage.mp ? "SW25.Card.RollMPHeal" : "SW25.Card.RollHeal") : t("SW25.Card.RollDamage"),
    formulaLabel: state.damage.formula
      ? `${state.damage.formula}${state.damage.extra ? signed(state.damage.extra) : ""}` : ""
  } : null;
  const result = state.result ? {
    ...state.result,
    steps: (state.result.steps ?? []).map(s => ({ ...s, diceLabel: (s.dice ?? []).join("+") }))
  } : null;
  return renderSystemTemplate(TEMPLATE, {
    state,
    check,
    contestLabel,
    targets,
    damage,
    result,
    hasTargets: targets.length > 0,
    showDamageButton: !!state.damage && (state.kind !== "damage") && !check?.autoFailure,
    showEffectButton: !!state.effect && !check?.autoFailure,
    showAddTargets: (state.kind !== "check") && !check?.autoFailure && !!(state.effect || state.damage || state.contest),
    resistanceLabel: state.resistance ? t(SW25.resistance[state.resistance] ?? state.resistance) : ""
  });
}

/* -------------------------------------------- */

/**
 * Snapshot targets for a card.
 * @param {TokenDocument[]} tokens
 * @param {object} options
 * @param {string|null} options.contest  evasion | willpower | fortitude
 * @param {Function} [options.sectionFor]  async (token) => section index for multi-section targets
 * @returns {Promise<object[]>}
 */
export async function snapshotTargets(tokens, { contest = null, askSection = false } = {}) {
  const { promptSection } = await import("../combat/damage.mjs");
  const out = [];
  for ( const token of tokens ) {
    const actor = token.actor;
    if ( !actor ) continue;
    let section = null;
    let sectionLabel = "";
    if ( (actor.type !== "character") && (actor.system.sections?.length > 1) && askSection ) {
      section = await promptSection(actor, t("SW25.Section.ChooseTarget", { name: token.name }));
      if ( section === null ) section = Math.max(0, actor.system.sections.findIndex(s => s.main));
      sectionLabel = actor.system.sections[section]?.label ?? "";
    }
    const entry = {
      tokenUuid: token.uuid,
      actorUuid: actor.uuid,
      name: token.name,
      img: token.texture?.src ?? actor.img,
      section,
      sectionLabel,
      resist: null,
      outcome: null,
      fixed: null
    };
    // Monsters using fixed values resolve immediately
    if ( contest && (actor.type !== "character") && actor.system.usesFixedValues ) {
      const value = resistValue(actor, contest, section);
      if ( Number.isFinite(value) ) {
        entry.fixed = value + CONFIG.SW25.FIXED_OFFSET;
        entry.resist = {
          total: entry.fixed, fixed: true, autoSuccess: false, autoFailure: false, dice: [],
          base: value, parts: [], breakdown: resistBreakdown(actor, contest, section)
        };
      }
    }
    out.push(entry);
  }
  return out;
}

/**
 * Standard value an actor uses to resist a contest.
 * @param {Actor} actor
 * @param {string} contest
 * @param {number|null} section
 * @returns {number|null}
 */
export function resistValue(actor, contest, section = null) {
  const sys = actor.system;
  if ( actor.type === "character" ) {
    if ( contest === "evasion" ) return sys.evasion;
    if ( contest === "willpower" ) return sys.willpower;
    if ( contest === "fortitude" ) return sys.fortitude;
    if ( contest === "dangerSense" ) return sys.checks?.dangerSense?.value ?? 0;
    return null;
  }
  if ( contest === "evasion" ) {
    const s = sys.sections?.[section ?? Math.max(0, sys.sections.findIndex(x => x.main))] ?? sys.sections?.[0];
    return s?.evasionTotal ?? null;
  }
  if ( contest === "willpower" ) return sys.willpowerTotal;
  if ( contest === "fortitude" ) return sys.fortitudeTotal;
  return null;
}

/**
 * Where an actor's resistance to a contest comes from (lines of the roll breakdown).
 * @param {Actor} actor
 * @param {string} contest
 * @param {number|null} section
 * @returns {object[]|null}
 */
export function resistBreakdown(actor, contest, section = null) {
  const sys = actor.system;
  if ( contest === "willpower" ) return sys.willpowerBreakdown ?? null;
  if ( contest === "fortitude" ) return sys.fortitudeBreakdown ?? null;
  if ( actor.type === "character" ) {
    if ( contest === "evasion" ) return sys.evasionBreakdown ?? null;
    if ( contest === "dangerSense" ) return sys.checks?.dangerSense?.breakdown ?? null;
    return null;
  }
  if ( contest === "evasion" ) {
    const s = sys.sections?.[section ?? Math.max(0, sys.sections.findIndex(x => x.main))] ?? sys.sections?.[0];
    return s?.evasionBreakdown ?? null;
  }
  return null;
}

/**
 * Get a card's state.
 * @param {ChatMessage} message
 * @returns {CardState|null}
 */
export function getCard(message) {
  return message?.getFlag("swordworld25", "card") ?? null;
}

/**
 * Actor that created a card.
 * @param {CardState} state
 * @returns {Actor|null}
 */
export function cardActor(state) {
  return actorFromUuid(state.actorUuid);
}
