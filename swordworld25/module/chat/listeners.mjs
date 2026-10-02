import { getCard, updateCard } from "./card.mjs";
import { attachBreakdown, attachBubble, damageBreakdownHTML } from "./breakdown.mjs";
import { undoDamage } from "../combat/damage.mjs";
import { rollCardResistance, rollDeathCheck } from "../workflows/checks.mjs";
import { addTargetsToCard, applyDamageFromCard, applyEffectFromCard, rollDamageFromCard } from "../workflows/damage-roll.mjs";
import { actorFromUuid, keyboardActions, t } from "../helpers/utils.mjs";
import { applyKnowledgeFromCard, showMonsterToPlayers } from "../workflows/knowledge.mjs";
import { takeLoot } from "../workflows/loot.mjs";
import { rollTrapRequest } from "../workflows/trap.mjs";

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

  // Hovering a result shows where it comes from
  const state = getCard(message);
  if ( state?.check ) attachBreakdown(html.querySelector(".swp-chat-roll:not(.swp-chat-damage) .swp-chat-total"), state.check, state.check.label);
  if ( state?.result ) {
    attachBubble(html.querySelector(".swp-chat-damage .swp-chat-total"),
      damageBreakdownHTML(state.damage, state.result, state.title));
  }
  if ( state?.contest ) {
    const contest = t(`SW25.Check.${state.contest}`);
    html.querySelectorAll(".swp-chat-target").forEach((el, i) => {
      const target = state.targets?.[i];
      if ( target?.resist ) attachBreakdown(el.querySelector(".swp-chat-resist:not(.gm)"), target.resist, `${contest} — ${target.name}`);
    });
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
  rollDamage: (message, button, event) => rollDamageFromCard(message, event),
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
  knowledgeApply: message => applyKnowledgeFromCard(message),
  trapRoll: (message, button, event) => rollTrapRequest(message, event),
  lootTake: (message, button) => takeLoot(message, index(button)),
  lootParty: (message, button) => takeLoot(message, index(button), { party: true }),
  showMonster: (message, button) => showMonsterToPlayers(actorFromUuid(button.dataset.uuid)),
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
