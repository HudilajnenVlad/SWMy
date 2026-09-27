import { isResponsibleGM, SYSTEM_ID } from "./utils.mjs";

/**
 * Socket relay: players ask the responsible GM to perform updates they lack permission for
 * (damaging monsters, updating chat cards authored by others...).
 */
const SOCKET = `system.${SYSTEM_ID}`;

/** Registered handlers: action → async function(payload, userId). */
const handlers = {};

/**
 * Register a socket action handler (executed on the responsible GM client).
 * @param {string} action
 * @param {Function} handler
 */
export function registerSocketHandler(action, handler) {
  handlers[action] = handler;
}

/** Install the socket listener. */
export function initSocket() {
  game.socket.on(SOCKET, async (data, userId) => {
    if ( !data?.action || !isResponsibleGM() ) return;
    const handler = handlers[data.action];
    if ( !handler ) return;
    try {
      await handler(data.payload ?? {}, data.userId ?? userId);
    } catch(err) {
      console.error(`SW25 | Socket action ${data.action} failed`, err);
    }
  });
}

/**
 * Execute an action: locally if the user can, otherwise through the GM.
 * @param {string} action
 * @param {object} payload
 * @param {object} [options]
 * @param {boolean} [options.local]  Force local execution
 * @returns {Promise<boolean>} true if executed or relayed
 */
export async function executeAsGM(action, payload, { local = false } = {}) {
  const handler = handlers[action];
  if ( !handler ) throw new Error(`Unknown socket action ${action}`);
  if ( local || game.user.isGM ) {
    await handler(payload, game.user.id);
    return true;
  }
  if ( !game.users.activeGM ) {
    ui.notifications.warn(game.i18n.localize("SW25.Warn.NoGM"));
    return false;
  }
  game.socket.emit(SOCKET, { action, payload, userId: game.user.id });
  return true;
}
