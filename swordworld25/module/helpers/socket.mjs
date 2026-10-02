import { isResponsibleGM, SYSTEM_ID } from "./utils.mjs";

/**
 * Socket relay: players ask the responsible GM to perform updates they lack permission for
 * (damaging monsters, updating chat cards authored by others...).
 */
const SOCKET = `system.${SYSTEM_ID}`;

/** Registered handlers: action → async function(payload, userId). */
const handlers = {};

/** Serialized handlers run one after the other (a double click must not apply twice what the first changed). */
let serialChain = Promise.resolve();

/**
 * Register a socket action handler (executed on the responsible GM client).
 * @param {string} action
 * @param {Function} handler
 * @param {object} [options]
 * @param {boolean} [options.serial=false]  Run after the serialized requests before it have finished, so that it
 *                                          reads the state they left
 */
export function registerSocketHandler(action, handler, { serial = false } = {}) {
  handlers[action] = !serial ? handler : (...args) => {
    const run = serialChain.then(() => handler(...args));
    serialChain = run.catch(() => {});
    return run;
  };
}

/** Handlers run by every client that receives a broadcast: action → function(payload, userId). */
const broadcastHandlers = {};

/**
 * Register a handler for a broadcast action (executed by every other connected client).
 * @param {string} action
 * @param {Function} handler
 */
export function registerBroadcastHandler(action, handler) {
  broadcastHandlers[action] = handler;
}

/**
 * Send an action to every other connected client (opening a sheet for the players...).
 * @param {string} action
 * @param {object} payload
 */
export function broadcast(action, payload) {
  game.socket.emit(SOCKET, { action, payload, userId: game.user.id, broadcast: true });
}

/** Install the socket listener. */
export function initSocket() {
  game.socket.on(SOCKET, async (data, userId) => {
    if ( data?.broadcast ) {
      try {
        await broadcastHandlers[data.action]?.(data.payload ?? {}, data.userId ?? userId);
      } catch(err) {
        console.error(`SW25 | Broadcast ${data.action} failed`, err);
      }
      return;
    }
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
