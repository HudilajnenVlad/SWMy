import { signed, t } from "../helpers/utils.mjs";

/** Font Awesome die faces. */
const FACES = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six" };

/**
 * Label of a modifier key ("All action checks", "Climb"…).
 * @param {string} key
 * @returns {string}
 */
function keyLabel(key) {
  if ( !key ) return "";
  const label = CONFIG.SW25.modifierKeys[key];
  if ( label ) return game.i18n.localize(label);
  if ( key.startsWith("check.") ) return game.i18n.localize(`SW25.Check.${key.slice(6)}`);
  return key;
}

/**
 * HTML of the breakdown of a check result, shown in a bubble over its total: the dice, where the standard value
 * comes from (class or adventurer level, ability modifier, items, effects, armor), the modifiers chosen in the roll
 * dialog, the fixed value offset, and the automatic success or failure.
 * Cards made before the breakdown existed show the standard value as a whole.
 * @param {object} check     Check of a card, or the resistance of a target: total, dice, fixed, base, parts, breakdown
 * @param {string} [title]
 * @returns {string}         Empty when there is nothing to show
 */
export function checkBreakdownHTML(check, title = "") {
  if ( !check || check.noRoll || check.override || !Number.isFinite(Number(check.total)) ) return "";
  const esc = value => foundry.utils.escapeHTML(String(value ?? ""));
  const rows = [];
  const row = (label, value, { note = "", cls = "" } = {}) => rows.push(
    `<tr class="${cls}"><th>${esc(label)}${note ? ` <small>${esc(note)}</small>` : ""}</th><td>${esc(value)}</td></tr>`);
  const num = value => Number(value) || 0;
  const parts = check.parts ?? [];
  const detailed = Array.isArray(check.breakdown);
  let sum = 0;

  // The dice
  if ( !check.fixed && check.dice?.length ) {
    const dice = check.dice.reduce((a, d) => a + num(d), 0);
    sum += dice;
    const faces = check.dice.map(d => (FACES[d] ? `<i class="fa-solid fa-dice-${FACES[d]}"></i>` : esc(d))).join("");
    rows.push(`<tr class="dice"><th>2d <span class="faces">${faces}</span></th><td>${dice}</td></tr>`);
  }

  // The standard value: its sources, or a single line
  const standard = num(check.base) + parts.filter(p => p.inBreakdown && detailed).reduce((a, p) => a + num(p.value), 0);
  if ( detailed ) {
    let listed = 0;
    for ( const line of check.breakdown ) {
      listed += num(line.value);
      const label = game.i18n.localize(line.label ?? "");
      row(line.ability ? `${label} ${t("SW25.Ability.mod")}` : label, signed(line.value), { note: line.note || keyLabel(line.key) });
    }
    if ( standard !== listed ) row(t("SW25.Breakdown.Other"), signed(standard - listed));
  }
  else if ( standard ) row(t("SW25.Roll.StandardValue"), signed(standard));
  sum += standard;

  // Modifiers chosen in the roll dialog (situational, declared feats, ammunition…)
  for ( const p of parts ) {
    if ( p.inBreakdown && detailed ) continue;
    sum += num(p.value);
    row(p.label, signed(p.value), { cls: "part" });
  }

  // Fixed values (monsters: standard value + 7)
  if ( check.fixed ) {
    const offset = num(check.total) - sum;
    if ( offset ) row(t("SW25.Breakdown.Fixed"), signed(offset), { cls: "note" });
  }
  else if ( check.autoFailure ) row(t("SW25.AutoFailure"), "0", { cls: "note bad" });
  else if ( check.autoSuccess ) row(t("SW25.AutoSuccess"), "+5", { cls: "note good" });
  else if ( (sum < 0) && (num(check.total) === 0) ) row(t("SW25.Breakdown.NotBelowZero"), "0", { cls: "note" });

  return [
    title ? `<header>${esc(title)}</header>` : "",
    `<table><tbody>${rows.join("")}</tbody>`,
    `<tfoot><tr><th>${esc(t("SW25.Breakdown.Total"))}</th><td>${esc(check.total)}</td></tr></tfoot></table>`
  ].join("");
}

/* -------------------------------------------- */
/*  Bubble following the pointer                */
/* -------------------------------------------- */

/** The bubble (one for the page) and the element it describes. */
let bubble = null;
let source = null;

/** Distance between the pointer and the bubble. */
const GAP = 16;

/**
 * The bubble element, created on first use.
 * @returns {HTMLElement}
 */
function bubbleElement() {
  if ( bubble?.isConnected ) return bubble;
  bubble = document.createElement("div");
  bubble.id = "sw25-roll-tip";
  bubble.className = "swp swp-roll-tip themed theme-light";
  bubble.setAttribute("role", "tooltip");
  document.body.append(bubble);
  return bubble;
}

/**
 * Put the bubble next to the pointer: below right, or on the other side when the screen ends.
 * @param {PointerEvent} event
 */
function placeBubble(event) {
  const { width, height } = bubble.getBoundingClientRect();
  let x = event.clientX + GAP;
  let y = event.clientY + GAP;
  if ( x + width > window.innerWidth - 4 ) x = event.clientX - width - GAP;
  if ( y + height > window.innerHeight - 4 ) y = event.clientY - height - GAP;
  bubble.style.left = `${Math.max(4, x)}px`;
  bubble.style.top = `${Math.max(4, y)}px`;
}

/** Follow the pointer; a hovered card that was re-rendered takes its bubble along. */
function onPointerMove(event) {
  if ( !source?.isConnected ) return hideBubble();
  placeBubble(event);
}

/**
 * Show the bubble for an element.
 * @param {HTMLElement} element
 * @param {string} html
 * @param {PointerEvent} event
 */
function showBubble(element, html, event) {
  const el = bubbleElement();
  source = element;
  el.innerHTML = html;
  el.classList.add("visible");
  placeBubble(event);
  document.addEventListener("pointermove", onPointerMove, { passive: true });
}

/** Hide the bubble. */
function hideBubble() {
  source = null;
  bubble?.classList.remove("visible");
  document.removeEventListener("pointermove", onPointerMove);
}

/**
 * Show the breakdown of a check in a slightly see-through bubble that follows the pointer while an element (the
 * total of a card, the resistance of a target) is hovered.
 * @param {HTMLElement} element
 * @param {object} check
 * @param {string} [title]
 */
export function attachBreakdown(element, check, title) {
  const html = checkBreakdownHTML(check, title);
  if ( !element || !html ) return;
  element.classList.add("swp-has-breakdown");
  element.removeAttribute("data-tooltip");
  element.addEventListener("pointerenter", event => showBubble(element, html, event));
  element.addEventListener("pointerleave", hideBubble);
}
