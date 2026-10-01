import { registerSocketHandler } from "./socket.mjs";
import { actorFromUuid } from "./utils.mjs";

/**
 * Generic GM-side handlers used by the automation.
 */
export function registerDefaultSocketHandlers() {
  registerSocketHandler("updateActor", async ({ uuid, update }) => {
    const actor = actorFromUuid(uuid);
    if ( actor ) await actor.update(update);
  });

  registerSocketHandler("createEffects", async ({ uuid, effects }) => {
    const actor = actorFromUuid(uuid);
    if ( actor ) await actor.createEmbeddedDocuments("ActiveEffect", effects);
  });

  registerSocketHandler("deleteEffects", async ({ uuid, ids }) => {
    const actor = actorFromUuid(uuid);
    if ( actor ) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  });

  // A player adds a character they own to a party they can see (players only observe the party)
  registerSocketHandler("joinParty", async ({ partyId, actorId }, userId) => {
    const user = game.users.get(userId);
    const party = game.actors.get(partyId);
    const actor = game.actors.get(actorId);
    if ( !user || (party?.type !== "party") || !actor ) return;
    if ( !party.testUserPermission(user, "LIMITED") || !actor.testUserPermission(user, "OWNER") ) return;
    await party.system.addMembers(actor);
  });

  registerSocketHandler("toggleStatus", async ({ uuid, status, active, overlay }) => {
    const actor = actorFromUuid(uuid);
    if ( actor ) await actor.toggleStatusEffect(status, { active, overlay });
  });
}
