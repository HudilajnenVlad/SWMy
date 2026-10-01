/**
 * Miscellaneous helpers.
 */

export const SYSTEM_ID = "swordworld25";

/** CSS classes of the system's dialogs ("paper" style, always light). */
export const PAPER_DIALOG = ["sw25", "swp", "swp-dialog", "themed", "theme-light"];

/** Localize shortcut. */
export function t(key, data) {
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

/** Format a signed number ("+2", "-1", "±0"). */
export function signed(n) {
  n = Number(n) || 0;
  if ( n > 0 ) return `+${n}`;
  if ( n < 0 ) return `${n}`;
  return "±0";
}

/** Format an amount of gamels ("1,240 G"). */
export function gamels(n) {
  return `${(Number(n) || 0).toLocaleString(game.i18n.lang)} G`;
}

/**
 * The tokens currently targeted by the user (falls back to controlled tokens when requested).
 * @param {object} [options]
 * @param {boolean} [options.fallbackControlled=false]
 * @returns {TokenDocument[]}
 */
export function getTargetTokens({ fallbackControlled = false } = {}) {
  let tokens = Array.from(game.user.targets ?? []).map(t => t.document);
  if ( !tokens.length && fallbackControlled ) tokens = (canvas.tokens?.controlled ?? []).map(t => t.document);
  return tokens.filter(t => t.actor);
}

/**
 * The tokens currently controlled by the user.
 * @returns {TokenDocument[]}
 */
export function getControlledTokens() {
  return (canvas.tokens?.controlled ?? []).map(t => t.document).filter(t => t.actor);
}

/**
 * Resolve an actor or token-actor from a uuid.
 * @param {string} uuid
 * @returns {Actor|null}
 */
export function actorFromUuid(uuid) {
  if ( !uuid ) return null;
  const doc = fromUuidSync(uuid, { strict: false });
  if ( !doc ) return null;
  if ( doc instanceof Actor ) return doc;
  if ( doc.actor ) return doc.actor;
  return null;
}

/**
 * Is the current user the "responsible" GM (lowest-id active GM)?
 * @returns {boolean}
 */
export function isResponsibleGM() {
  if ( !game.user.isGM ) return false;
  const gm = game.users.activeGM;
  return !gm || (gm.id === game.user.id);
}

/**
 * Pick the speaker for an actor (prefers its active token).
 * @param {Actor} actor
 * @returns {object}
 */
export function speakerFor(actor) {
  const token = actor?.token ?? actor?.getActiveTokens?.(false, true)?.[0] ?? null;
  return ChatMessage.implementation.getSpeaker({ actor, token });
}

/**
 * Parse a loot roll range text like "2-7", "8+", "Always".
 * @param {string} text
 * @returns {{min: number|null, max: number|null, always: boolean}}
 */
export function parseRange(text) {
  const s = String(text ?? "").trim();
  if ( /always/i.test(s) ) return { min: null, max: null, always: true };
  let m = s.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if ( m ) return { min: Number(m[1]), max: Number(m[2]), always: false };
  m = s.match(/^(\d+)\s*\+$/);
  if ( m ) return { min: Number(m[1]), max: null, always: false };
  m = s.match(/^(\d+)$/);
  if ( m ) return { min: Number(m[1]), max: Number(m[1]), always: false };
  return { min: null, max: null, always: false };
}

/**
 * Localized label of a damage type list.
 * @param {string[]} types
 * @returns {string}
 */
export function typesLabel(types = []) {
  return types.map(k => {
    const key = CONFIG.SW25.damageTypes[k] ?? `SW25.DamageType.${k}`;
    return game.i18n.has(key) ? t(key) : k;
  }).join(", ");
}

/**
 * Enrich HTML with the v13 TextEditor.
 * @param {string} html
 * @param {object} [options]
 * @returns {Promise<string>}
 */
export function enrich(html, options = {}) {
  return foundry.applications.ux.TextEditor.implementation.enrichHTML(html ?? "", options);
}

/**
 * Render a system template.
 * @param {string} path  Path relative to the templates folder
 * @param {object} data
 * @returns {Promise<string>}
 */
export function renderSystemTemplate(path, data) {
  return foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/${path}`, data);
}

/**
 * Make the [data-action] elements of a window that are not buttons or links reachable with the keyboard:
 * Tab focuses them, Enter or Space activates them.
 * @param {HTMLElement} root
 */
export function keyboardActions(root) {
  if ( !root ) return;
  for ( const el of root.querySelectorAll("[data-action]:not(button, input, select, textarea, a[href], [tabindex])") ) {
    el.tabIndex = 0;
    if ( !el.hasAttribute("role") ) el.setAttribute("role", "button");
  }
  if ( root.dataset.swpKeys ) return;
  root.dataset.swpKeys = "1";
  root.addEventListener("keydown", event => {
    if ( (event.key !== "Enter") && (event.key !== " ") ) return;
    const el = event.target;
    if ( !(el instanceof HTMLElement) || !el.matches("[data-action][role=button]") ) return;
    event.preventDefault();
    el.click();
  });
}
