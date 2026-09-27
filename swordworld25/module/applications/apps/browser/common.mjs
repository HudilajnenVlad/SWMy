import { itemEntry } from "../../../helpers/item-entry.mjs";
import { t } from "../../../helpers/utils.mjs";

/** Short labels of the rulebooks. */
export const BOOKS = { CR1: "CR I", CR2: "CR II", CR3: "CR III" };

/**
 * Options of a facet from a label map: [{value, label}].
 * @param {object} map        { key: label | {label, icon} }
 * @param {string[]} [only]   Keys to keep, in this order
 * @returns {object[]}
 */
export function optionsOf(map, only = null) {
  const keys = only ?? Object.keys(map);
  return keys.filter(k => k in map).map(k => {
    const v = map[k];
    return (typeof v === "object") ? { value: k, label: v.label, icon: v.icon } : { value: k, label: v };
  });
}

/**
 * Distinct values of records, as options sorted by label.
 * @param {object[]} records
 * @param {Function} get        record => value | value[]
 * @param {Function} [label]    value => label
 * @returns {object[]}
 */
export function distinctOptions(records, get, label = v => v) {
  const values = new Set();
  for ( const r of records ) {
    const v = get(r);
    for ( const x of (Array.isArray(v) ? v : [v]) ) if ( (x !== null) && (x !== undefined) && (x !== "") ) values.add(x);
  }
  return [...values].map(v => ({ value: v, label: label(v) })).sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

/** Label of a key from a label map. */
export function labelOf(map, key) {
  const v = map?.[key];
  if ( !v ) return key ?? "";
  return t(typeof v === "object" ? v.label : v);
}

/** The rulebook facet. */
export const bookFacet = {
  key: "book", type: "chips", label: "SW25.Bestiary.Book",
  options: Object.entries(BOOKS).map(([value, label]) => ({ value, label })),
  values: r => r.book
};

/** The rulebook column. */
export const bookColumn = {
  key: "book", label: "SW25.Bestiary.Book", cls: "book",
  sort: r => `${r.book}${String(r.page ?? 0).padStart(4, "0")}`,
  cell: r => ({ html: `${BOOKS[r.book] ?? r.book}${r.page ? ` <small>p.${r.page}</small>` : ""}` })
};

/** The level column. */
export const levelColumn = { key: "level", type: "level", label: "SW25.Entry.LevelShort", cls: "lvl", sort: r => r.level, cell: r => ({ text: r.level ?? "" }) };

/** The name column (image, name and subtitle). */
export const nameColumn = { key: "name", type: "name", label: "SW25.Name", cls: "name", sort: r => r.name };

/** A level range facet. */
export function levelFacet(max = 15) {
  return { key: "level", type: "range", label: "SW25.Level", get: r => r.level, placeholderMin: "0", placeholderMax: String(max) };
}

/**
 * Rulebook entry card of an item, for the expanded rows.
 * @param {Item} doc
 * @returns {Promise<string>}
 */
export async function entryDetail(doc) {
  if ( !doc ) return "";
  const entry = await itemEntry(doc, { text: true });
  return foundry.applications.handlebars.renderTemplate("systems/swordworld25/templates/item/entry.hbs",
    { ...entry, noTitle: true, compact: true });
}

/** Text of HTML. */
export function plain(html) {
  return String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Escape text for HTML cells. */
export function esc(text) {
  return foundry.utils.escapeHTML(String(text ?? ""));
}
