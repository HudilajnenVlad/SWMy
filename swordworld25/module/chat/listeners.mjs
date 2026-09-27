import { getCard, updateCard } from "./card.mjs";
import { undoDamage } from "../combat/damage.mjs";
import { rollCardResistance, rollDeathCheck } from "../workflows/checks.mjs";
import { addTargetsToCard, applyDamageFromCard, applyEffectFromCard, rollDamageFromCard } from "../workflows/damage-roll.mjs";
import { actorFromUuid, keyboardActions } from "../helpers/utils.mjs";

/**
 * Hook handler for rendered chat messages: permissions and button listeners.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function onRenderChatMessage(message, html) {
  const flags = message.flags?.swordworld25;
  if ( !flags ) return;
  const isGM = game.user.isGM;

  // Permission based visibility
  for ( const el of html.querySelectorAll("[data-owner]") ) {
    const actor = actorFromUuid(el.dataset.owner);
    if ( !isGM && !actor?.isOwner ) el.remove();
  }
  for ( const el of html.querySelectorAll("[data-gm-only]") ) {
    if ( !isGM ) el.remove();
  }
  for ( const el of html.querySelectorAll("[data-author-only]") ) {
    if ( !isGM && !message.isAuthor ) el.remove();
  }
  if ( flags.undone ) html.querySelector("[data-action='undo']")?.remove();

  // Paper-style card inside the message
  if ( html.querySelector(".swp-chat") ) {
    html.classList.add("swp-message");
    keyboardActions(html);
  }

  // Collapsible description (the effect row of the card)
  html.querySelector(".swp-chat-head.toggle")?.addEventListener("click", event => {
    if ( event.target.closest("button, a") ) return;
    html.querySelector(".swp-chat")?.classList.toggle("expanded");
  });

  html.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if ( !button || !html.contains(button) ) return;
    const action = button.dataset.action;
    if ( !(action in ACTIONS) ) return;
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    Promise.resolve(ACTIONS[action](message, button, event))
      .catch(err => {
        console.error(err);
        ui.notifications.error(err.message);
      })
      .finally(() => { button.disabled = false; });
  });
}

const index = button => (button.dataset.index !== undefined ? Number(button.dataset.index) : null);

const ACTIONS = {
  rollDamage: message => rollDamageFromCard(message),
  resist: (message, button, event) => rollCardResistance(message, index(button), event),
  apply: (message, button) => applyDamageFromCard(message, {
    index: index(button), multiplier: Number(button.dataset.mult) || 1
  }),
  applyHeal: (message, button) => applyDamageFromCard(message, { index: index(button), heal: true }),
  applyTargets: (message, button) => applyDamageFromCard(message, {
    index: null, multiplier: Number(button.dataset.mult) || 1
  }),
  applyEffect: (message, button) => applyEffectFromCard(message, { index: index(button) }),
  addTargets: message => addTargetsToCard(message),
  undo: message => undoDamage(message),
  deathCheck: (message, button, event) => {
    const actor = actorFromUuid(button.dataset.actor);
    if ( actor ) return rollDeathCheck(actor, event);
  },
  setOutcome: async (message, button) => {
    // GM override of a target's outcome
    const i = index(button);
    const outcome = button.dataset.outcome;
    const card = getCard(message);
    if ( !card?.targets?.[i] ) return;
    const total = outcome === "hit" || outcome === "affected" ? -1 : 999;
    await updateCard(message, { targets: { [i]: { resist: { total, fixed: true, autoSuccess: false, autoFailure: false, dice: [], override: true } } } });
  }
};
