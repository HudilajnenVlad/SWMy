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

  registerSocketHandler("toggleStatus", async ({ uuid, status, active, overlay }) => {
    const actor = actorFromUuid(uuid);
    if ( actor ) await actor.toggleStatusEffect(status, { active, overlay });
  });
}
