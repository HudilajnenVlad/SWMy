import { signed } from "./utils.mjs";

/** Pip positions of die faces on a 12×12 grid. */
const DIE_PIPS = {
  1: [[6, 6]],
  2: [[3.2, 3.2], [8.8, 8.8]],
  3: [[3.2, 3.2], [6, 6], [8.8, 8.8]],
  4: [[3.2, 3.2], [8.8, 3.2], [3.2, 8.8], [8.8, 8.8]],
  5: [[3.2, 3.2], [8.8, 3.2], [6, 6], [3.2, 8.8], [8.8, 8.8]],
  6: [[3.2, 3], [8.8, 3], [3.2, 6], [8.8, 6], [3.2, 9], [8.8, 9]]
};

/**
 * Inline SVG of a die face (the growth column of the character sheet).
 * @param {number} face
 * @returns {string}
 */
function dieFace(face) {
  const pips = DIE_PIPS[face] ?? [];
  const r = face === 1 ? 1.9 : 1.2;
  return `<svg class="swp-die" viewBox="0 0 12 12" aria-hidden="true"><rect x="0.7" y="0.7" width="10.6" height="10.6" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.3"/>${
    pips.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor"/>`).join("")}</svg>`;
}

/**
 * Register system Handlebars helpers.
 */
export function registerHandlebarsHelpers() {
  Handlebars.registerHelper({
    swpDie: face => new Handlebars.SafeString(dieFace(Number(face))),
    // Chat content is sanitized (no inline SVG): chat cards use the Font Awesome die faces
    swpDieIcon: face => {
      const names = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six" };
      const name = names[Number(face)];
      return new Handlebars.SafeString(name ? `<i class="fa-solid fa-dice-${name}"></i>` : `<b>${Number(face) || "?"}</b>`);
    },
    sw25Signed: value => signed(value),
    sw25Mul: (a, b) => (Number(a) || 0) * (Number(b) || 0),
    sw25IsNumber: value => Number.isFinite(value),
    sw25Pct: (value, max) => (max ? Math.clamp(Math.round((value / max) * 100), 0, 100) : 0),
    sw25Json: value => JSON.stringify(value),
    sw25Includes: (list, value) => Array.isArray(list) && list.includes(value),
    sw25Default: (value, fallback) => ((value === null) || (value === undefined) || (value === "")) ? fallback : value,
    sw25Fixed: value => (Number.isFinite(value) ? value + CONFIG.SW25.FIXED_OFFSET : "-"),
    sw25Range: (from, to) => {
      const out = [];
      for ( let i = Number(from); i <= Number(to); i++ ) out.push(i);
      return out;
    },
    sw25Lookup: (obj, key) => obj?.[key],
    sw25Localize: (map, key) => game.i18n.localize(map?.[key]?.label ?? map?.[key] ?? key ?? "")
  });
}

/**
 * Preload templates used as partials.
 */
export function preloadTemplates() {
  const base = "systems/swordworld25/templates";
  const itemTypes = ["race", "class", "weapon", "armor", "gear", "spell", "feat", "technique", "spellsong", "finale",
    "stunt", "evocation", "ability", "effect"];
  return foundry.applications.handlebars.loadTemplates([
    `${base}/chat/card.hbs`,
    `${base}/chat/damage-log.hbs`,
    `${base}/chat/loot.hbs`,
    `${base}/chat/initiative.hbs`,
    `${base}/dialogs/roll-dialog.hbs`,
    `${base}/actor/paper/name-cell.hbs`,
    `${base}/actor/paper/details.hbs`,
    `${base}/actor/paper/row-tools.hbs`,
    `${base}/actor/paper/resources.hbs`,
    `${base}/item/entry.hbs`,
    `${base}/item/parts/modifiers.hbs`,
    `${base}/item/parts/targeting.hbs`,
    `${base}/item/parts/effect.hbs`,
    ...itemTypes.map(type => `${base}/item/details/${type}.hbs`)
  ]);
}
