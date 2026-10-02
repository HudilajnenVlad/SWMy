import { getCard, updateCard } from "../chat/card.mjs";
import { broadcast, executeAsGM, registerBroadcastHandler, registerSocketHandler } from "../helpers/socket.mjs";
import { actorFromUuid, t } from "../helpers/utils.mjs";

/**
 * Monster knowledge (CR I p.382-383): a success value of at least the Reputation identifies the monster (its data
 * can be read), one of at least the Weakness reveals its weak point to the whole party. Only Sage finds weak points:
 * a check made with another class (Rider) counts with the Sage level instead for that.
 */

/**
 * Totals of a monster knowledge check.
 * @param {Actor} actor     Character who made the check
 * @param {object} result   Check result
 * @returns {{total: number, weakTotal: number|null, autoSuccess: boolean, autoFailure: boolean}}
 */
export function knowledgeTotals(actor, result) {
  const sys = actor.system;
  const source = sys.monsterKnowledgeSource;
  const sage = sys.classes?.sage;
  let weakTotal = null;
  if ( source === "sage" ) weakTotal = result.total;
  else if ( sage ) weakTotal = result.total + sage.level - (sys.classes?.[source]?.level ?? 0);
  return { total: result.total, weakTotal, autoSuccess: !!result.autoSuccess, autoFailure: !!result.autoFailure };
}

/**
 * What a knowledge check reveals about one monster.
 * @param {Actor} monster
 * @param {object} totals   {@link knowledgeTotals}
 * @returns {{identified: boolean, weakPoint: boolean}}
 */
export function knowledgeOutcome(monster, totals) {
  const { reputation, weakness } = monster.system;
  if ( totals.autoFailure ) return { identified: false, weakPoint: false };
  const identified = totals.autoSuccess || (Number.isInteger(reputation) && (totals.total >= reputation));
  const weakPoint = (totals.weakTotal !== null)
    && (totals.autoSuccess || (Number.isInteger(weakness) && (totals.weakTotal >= weakness)));
  return { identified, weakPoint };
}

/**
 * Every copy of a monster the party may meet: the token's own actor, the world actor it was made from, and the other
 * unlinked tokens of that actor on the scene. What the party learns about a monster counts for all of them.
 * @param {Actor} actor
 * @returns {{base: Actor|null, tokens: Actor[]}}
 */
export function monsterCopies(actor) {
  const baseId = actor.isToken ? actor.token?.actorId : actor.id;
  const base = baseId ? (game.actors.get(baseId) ?? null) : null;
  const tokens = new Set();
  if ( actor.isToken ) tokens.add(actor);
  const scenes = new Set([canvas.scene, actor.token?.parent].filter(Boolean));
  for ( const scene of scenes ) {
    for ( const token of scene.tokens ) {
      if ( !baseId || (token.actorId !== baseId) || token.actorLink || !token.actor ) continue;
      tokens.add(token.actor);
    }
  }
  return { base, tokens: [...tokens] };
}

/**
 * Mark a monster (and its copies) as identified and/or its weak point as revealed. Runs on the GM.
 * @param {Actor} monster
 * @param {{identified?: boolean, weakPoint?: boolean}} reveal
 */
export async function revealMonster(monster, { identified = false, weakPoint = false } = {}) {
  if ( !monster || (!identified && !weakPoint) ) return;
  return executeAsGM("revealMonster", { uuid: monster.uuid, identified, weakPoint });
}

registerSocketHandler("revealMonster", async ({ uuid, identified, weakPoint }) => {
  const actor = actorFromUuid(uuid);
  if ( !actor ) return;
  const update = {};
  if ( identified ) update["system.identified"] = true;
  if ( weakPoint ) update["system.weakPointRevealed"] = true;
  const missing = doc => (identified && !doc.system.identified) || (weakPoint && !doc.system.weakPointRevealed);
  const { base, tokens } = monsterCopies(actor);
  if ( base && missing(base) ) await base.update(update);
  // Unlinked tokens follow their world actor unless they changed these values themselves
  for ( const doc of tokens ) if ( missing(doc) ) await doc.update(update);
});

/* -------------------------------------------- */

/**
 * Apply a knowledge check to monsters and describe the results for the chat card.
 * @param {Actor[]} monsters
 * @param {object} totals
 * @param {object} [options]
 * @param {boolean} [options.reveal]   Reveal what was learned (default: the "auto-identify" setting)
 * @returns {Promise<object[]>}
 */
export async function applyKnowledge(monsters, totals, { reveal = game.settings.get("swordworld25", "autoIdentify") } = {}) {
  const results = [];
  for ( const monster of monsters ) {
    const outcome = knowledgeOutcome(monster, totals);
    const before = { identified: !!monster.system.identified, weakPoint: !!monster.system.weakPointRevealed };
    if ( reveal ) await revealMonster(monster, outcome);
    const token = monster.token ?? monster.getActiveTokens(false, true)[0];
    results.push({
      uuid: monster.uuid,
      name: token?.name ?? monster.name,
      img: token?.texture?.src ?? monster.img,
      identified: outcome.identified || before.identified,
      weakPoint: outcome.weakPoint || before.weakPoint,
      hasWeakPoint: !!monster.system.weakPoint?.kind,
      newIdentified: outcome.identified && !before.identified,
      newWeakPoint: outcome.weakPoint && !before.weakPoint
    });
  }
  return results;
}

/**
 * GM: apply the knowledge check of a card to the monsters targeted now (the check was made without targets).
 * @param {ChatMessage} message
 */
export async function applyKnowledgeFromCard(message) {
  const state = getCard(message);
  if ( !state?.knowledge ) return;
  const monsters = Array.from(game.user.targets ?? []).map(tk => tk.actor).filter(a => a && (a.type !== "character"));
  if ( !monsters.length ) return ui.notifications.warn(t("SW25.Warn.NoTargets"));
  const known = new Set((state.knowledge.results ?? []).map(r => r.uuid));
  const fresh = monsters.filter(m => !known.has(m.uuid));
  const results = await applyKnowledge(fresh, state.knowledge, { reveal: true });
  await updateCard(message, { set: { "knowledge.results": [...(state.knowledge.results ?? []), ...results] } });
}

/* -------------------------------------------- */
/*  Showing a monster to the players            */
/* -------------------------------------------- */

/**
 * GM: open a monster's sheet on the players' screens. They see what the party knows: only its look and description
 * until it is identified, then the stat block, and the weak point once revealed. The players get Limited permission
 * on the world actor so that they can open it again later.
 * @param {Actor} actor
 */
export async function showMonsterToPlayers(actor) {
  if ( !game.user.isGM || !actor ) return;
  const { base } = monsterCopies(actor);
  const owner = base ?? actor;
  const LIMITED = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
  if ( (owner.ownership?.default ?? 0) < LIMITED ) await owner.update({ "ownership.default": LIMITED });
  broadcast("showSheet", { uuid: actor.uuid });
  ui.notifications.info(t("SW25.Monster.ShownToPlayers", { name: actor.token?.name ?? actor.name }));
}

registerBroadcastHandler("showSheet", ({ uuid }) => {
  if ( game.user.isGM ) return;
  const actor = actorFromUuid(uuid);
  if ( actor?.testUserPermission(game.user, "LIMITED") ) actor.sheet.render({ force: true });
});
