import { fixedResult, meetsTarget } from "../dice/check.mjs";
import { createCard, snapshotTargets } from "../chat/card.mjs";
import { executeAsGM, registerSocketHandler } from "../helpers/socket.mjs";
import { actorFromUuid, renderSystemTemplate, speakerFor, t } from "../helpers/utils.mjs";
import { rollCheck } from "./checks.mjs";

/**
 * Traps: springing a trap on the targeted tokens, and asking the players for the checks that find or disarm it.
 */

/** Checks the GM can ask for, with the trap value they are made against. */
export const TRAP_CHECKS = {
  search: { check: "search", value: sys => sys.search, icon: "fa-solid fa-magnifying-glass" },
  spotTrap: { check: "spotTrap", value: sys => sys.spotTrapValue, icon: "fa-solid fa-eye" },
  disarm: { check: "disableDevice", value: sys => sys.disarm, icon: "fa-solid fa-screwdriver-wrench" }
};

/**
 * Spring a trap: its success value against the victims (the tokens targeted now), then damage and conditions.
 * @param {Actor} trap
 */
export async function triggerTrap(trap) {
  const sys = trap.system;
  const hasCheck = Number.isInteger(sys.check.value);
  const contest = (hasCheck && ["evasion", "fortitude", "willpower", "dangerSense"].includes(sys.check.vs)) ? sys.check.vs : null;
  const targets = await snapshotTargets(getTargets(), { contest });
  let damage = null;
  const d = sys.damage;
  if ( Number.isInteger(d.power) ) {
    damage = {
      mode: "power", power: d.power, critical: Number.isInteger(d.critical) ? d.critical : 10, extra: d.extra ?? 0,
      extraParts: d.extra ? [{ label: trap.name, value: d.extra }] : [],
      kind: d.kind || "physical", types: [...d.types], heal: false, source: "trap"
    };
  } else if ( d.formula ) {
    damage = {
      mode: "formula", formula: d.formula, extra: d.extra ?? 0, extraParts: [],
      kind: d.kind || "physical", types: [...d.types], heal: false, source: "trap"
    };
  }
  const mods = sys.modifiers.filter(m => m.key);
  const effect = (sys.statuses.length || mods.length) ? {
    name: trap.name, img: trap.img, modifiers: mods, statuses: [...sys.statuses],
    duration: { unit: sys.duration.unit || "rounds", value: sys.duration.value ?? 1 },
    origin: trap.uuid, description: t("SW25.Trap.EffectOf", { name: trap.name })
  } : null;
  const details = [
    { label: t("SW25.Trap.Type"), value: t(`SW25.Trap.Kind.${sys.trapType}`) },
    { label: t("SW25.Trap.Trigger"), value: sys.trigger },
    { label: t("SW25.Target.label"), value: sys.target }
  ].filter(x => x.value);
  await createCard({
    kind: "ability",
    actorUuid: trap.uuid,
    title: trap.name,
    subtitle: t("SW25.Trap.Springs"),
    img: trap.img,
    description: sys.details.description,
    details,
    check: hasCheck ? {
      ...fixedResult(sys.check.value), base: sys.check.value, parts: [], label: t("SW25.Trap.Check"),
      breakdown: [{ label: "SW25.Trap.Value", value: sys.check.value }]
    } : null,
    contest,
    resistance: hasCheck ? (sys.check.result || "neg") : null,
    targets,
    damage,
    effect
  }, { speaker: speakerFor(trap) });
  if ( !sys.state.triggered ) await trap.update({ "system.state.triggered": true });
}

/**
 * The tokens targeted now (the victims of a trap).
 * @returns {TokenDocument[]}
 */
function getTargets() {
  return Array.from(game.user.targets ?? []).map(tk => tk.document).filter(Boolean);
}

/* -------------------------------------------- */
/*  Asking the players for a check              */
/* -------------------------------------------- */

/**
 * GM: post a card asking the players for a check against a trap (Search, Spot Trap, Disable Device). The players
 * roll from it; the trap's value stays hidden and the GM's client compares the results.
 * @param {Actor} trap
 * @param {"search"|"spotTrap"|"disarm"} kind
 */
export async function requestTrapCheck(trap, kind) {
  const cfg = TRAP_CHECKS[kind];
  if ( !cfg || !game.user.isGM ) return;
  const state = { trapUuid: trap.uuid, kind, results: [] };
  await ChatMessage.implementation.create({
    content: await renderRequest(trap.name, state),
    speaker: ChatMessage.implementation.getSpeaker({ alias: t("SW25.Trap.label") }),
    flags: { swordworld25: { kind: "trapRequest", trapRequest: state } }
  });
}

/**
 * HTML of a check request card.
 * @param {string} name
 * @param {object} state
 * @returns {Promise<string>}
 */
async function renderRequest(name, state) {
  const cfg = TRAP_CHECKS[state.kind];
  return renderSystemTemplate("chat/trap-request.hbs", {
    kind: state.kind,
    icon: cfg.icon,
    checkLabel: t(`SW25.Check.${cfg.check}`),
    title: t(`SW25.Trap.Ask.${state.kind}`),
    hint: t(`SW25.Trap.AskHint.${state.kind}`),
    name,
    results: state.results
  });
}

/**
 * A player rolls the check asked for by a request card, with their selected character (or their own).
 * @param {ChatMessage} message
 * @param {Event} [event]
 */
export async function rollTrapRequest(message, event) {
  const state = message.getFlag("swordworld25", "trapRequest");
  const cfg = TRAP_CHECKS[state?.kind];
  if ( !cfg ) return;
  const actor = canvas.tokens?.controlled.find(tk => tk.actor?.type === "character")?.actor ?? game.user.character;
  if ( !actor?.isOwner ) return ui.notifications.warn(t("SW25.Trap.NoCharacter"));
  const outcome = await rollCheck(actor, cfg.check, { event });
  if ( !outcome ) return;
  const r = outcome.result;
  await executeAsGM("trapCheck", {
    messageId: message.id, name: actor.name,
    result: { total: r.total, autoSuccess: !!r.autoSuccess, autoFailure: !!r.autoFailure }
  });
}

registerSocketHandler("trapCheck", async ({ messageId, name, result }) => {
  const message = game.messages.get(messageId);
  const state = foundry.utils.deepClone(message?.getFlag("swordworld25", "trapRequest"));
  const trap = actorFromUuid(state?.trapUuid);
  const cfg = TRAP_CHECKS[state?.kind];
  if ( !trap || !cfg ) return;
  const tn = cfg.value(trap.system);
  const success = meetsTarget(result, tn) ?? false;
  state.results.push({ name, total: result.total, success });
  await message.update({ content: await renderRequest(trap.name, state), "flags.swordworld25.trapRequest": state });
  if ( !success ) return;
  if ( state.kind === "disarm" ) await trap.update({ "system.state.disarmed": true, "system.state.detected": true });
  else await setDetected(trap);
}, { serial: true });

/**
 * Mark a trap as found, and show its hidden tokens.
 * @param {Actor} trap
 */
export async function setDetected(trap) {
  if ( !trap.system.state.detected ) await trap.update({ "system.state.detected": true });
  const tokens = trap.isToken ? [trap.token] : trap.getActiveTokens(false, true);
  const hidden = tokens.filter(tk => tk?.hidden);
  for ( const token of hidden ) await token.update({ hidden: false });
}
