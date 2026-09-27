import { signed, t } from "../../../helpers/utils.mjs";
import { bookColumn, bookFacet, esc, entryDetail, labelOf, nameColumn, optionsOf } from "./common.mjs";

const SW25 = () => CONFIG.SW25;

/** Groups shown in the "Type" facet: weapons, armor kinds and gear kinds. */
const GROUPS = {
  weapon: "TYPES.Item.weapon",
  nonmetal: "SW25.ArmorType.nonmetal",
  metal: "SW25.ArmorType.metal",
  shield: "SW25.ArmorType.shield",
  accessory: "SW25.GearType.accessory",
  potion: "SW25.GearType.potion",
  herb: "SW25.GearType.herb",
  ammo: "SW25.GearType.ammo",
  tool: "SW25.GearType.tool",
  gear: "SW25.GearType.gear",
  classItem: "SW25.GearType.classItem",
  improvement: "SW25.GearType.improvement",
  golemItem: "SW25.GearType.golemItem",
  mountItem: "SW25.GearType.mountItem",
  other: "SW25.Other"
};

/** Special properties of an item. */
const FLAGS = {
  magic: "SW25.Browser.Flag.magic",
  silver: "SW25.Browser.Flag.silver",
  consumable: "SW25.Browser.Flag.consumable",
  usable: "SW25.Browser.Flag.usable",
  grappler: "SW25.Browser.Flag.grappler",
  classReq: "SW25.Browser.Flag.classReq",
  automation: "SW25.Browser.Flag.automation"
};

/** Hands used: 1H, 2H, or other (worn, fixed...). */
function stanceGroup(stance) {
  const s = String(stance ?? "");
  if ( s.startsWith("1") ) return "1H";
  if ( s.startsWith("2") ) return "2H";
  return s ? "other" : "";
}

export default {
  id: "equipment",
  label: "SW25.Browser.Equipment",
  icon: "fa-solid fa-shield-halved",
  documentName: "Item",
  packs: ["swordworld25.weapons", "swordworld25.armor", "swordworld25.gear"],
  search: "SW25.Browser.SearchName",
  deep: "SW25.Browser.SearchText",
  defaultSort: { key: "name", dir: 1 },

  accept: doc => ["weapon", "armor", "gear"].includes(doc.type),

  record(doc) {
    const s = doc.system;
    let group;
    let stats = "";
    let stance = "";
    let minStr = null;
    let categories = [];
    if ( doc.type === "weapon" ) {
      group = "weapon";
      categories = s.categories ?? [];
      const modes = s.modes ?? [];
      stance = [...new Set(modes.map(m => stanceGroup(m.stance)))].filter(Boolean);
      minStr = modes.length ? Math.min(...modes.map(m => m.minStr ?? 0)) : null;
      stats = modes.map(m => `${m.label ? `${m.label}: ` : ""}${signed(m.accuracy ?? 0)} · ${t("SW25.Tracker.PowerShort")}${m.power ?? "—"} · ${m.critical ?? 10}${m.extraDamage ? ` · ${signed(m.extraDamage)}` : ""}`).join("\n");
    } else if ( doc.type === "armor" ) {
      group = s.armorType || "nonmetal";
      stance = s.stance ? [stanceGroup(s.stance)] : [];
      minStr = s.minStr ?? null;
      stats = `${t("SW25.Tracker.EvasionShort")} ${signed(s.evasion ?? 0)} · ${t("SW25.Tracker.DefenseShort")} ${s.defense ?? 0}`;
    } else {
      group = GROUPS[s.itemType] ? s.itemType : "other";
      stance = s.stance ? [stanceGroup(s.stance)] : [];
      const slots = (s.slot ?? []).map(k => labelOf({ ...SW25().accessorySlots, hand: "SW25.Slot.hand", any: "SW25.Slot.any" }, k));
      stats = slots.join(", ") || (s.use?.kind && (s.use.kind !== "none") ? labelOf(SW25().useKinds, s.use.kind) : "");
    }
    const flags = [
      s.magic && "magic", s.silver && "silver", s.consumable && "consumable",
      (doc.type === "gear") && s.use?.kind && (s.use.kind !== "none") && "usable",
      (s.grapplerOnly || s.grappler) && "grappler", s.classReq?.class && "classReq",
      (s.modifiers?.length > 0) && "automation"
    ].filter(Boolean);
    const price = Number.isFinite(s.price) ? s.price : null;
    return {
      group,
      categories,
      rank: s.rank || "",
      stance: Array.isArray(stance) ? stance : [stance].filter(Boolean),
      minStr,
      price,
      priceText: s.priceText || (price !== null ? `${price.toLocaleString(game.i18n.lang)}G` : "—"),
      slots: s.slot ?? [],
      flags,
      stats,
      subtitle: [t(GROUPS[group] ?? group), ...categories.map(c => labelOf(SW25().weaponCategories, c))]
        .filter((v, i, a) => a.indexOf(v) === i).join(" · "),
      searchText: [s.priceText, stats].filter(Boolean).join(" ")
    };
  },

  facets: [
    { key: "strength", type: "toggle", label: "SW25.Browser.StrengthFor", labelData: ref => ({ name: ref?.name ?? "" }),
      visible: ref => !!ref, test: (r, ref) => !Number.isFinite(r.minStr) || (r.minStr <= (ref.system.abilities?.str?.value ?? 0)) },
    { key: "affordable", type: "toggle", label: "SW25.Browser.AffordableFor", labelData: ref => ({ name: ref?.name ?? "" }),
      visible: ref => !!ref, test: (r, ref) => (r.price !== null) && (r.price <= (ref.system.money ?? 0)) },
    { key: "group", type: "chips", label: "SW25.Browser.ItemType", options: () => Object.entries(GROUPS).map(([value, label]) => ({ value, label })),
      values: r => r.group },
    { key: "categories", type: "chips", label: "SW25.Category", options: () => optionsOf(SW25().weaponCategories), values: r => r.categories },
    { key: "rank", type: "chips", label: "SW25.Rank", options: () => ["B", "A", "S", "SS"].map(r => ({ value: r, label: r })), values: r => r.rank },
    { key: "stance", type: "chips", label: "SW25.Browser.Hands",
      options: [{ value: "1H", label: "1H" }, { value: "2H", label: "2H" }, { value: "other", label: "SW25.Other" }], values: r => r.stance },
    { key: "minStr", type: "range", label: "SW25.Browser.MinStr", get: r => r.minStr, placeholderMin: "1", placeholderMax: "30" },
    { key: "price", type: "range", label: "SW25.Browser.Price", get: r => r.price, placeholderMin: "0", placeholderMax: "∞" },
    { key: "slots", type: "chips", label: "SW25.Browser.Slot",
      options: () => optionsOf({ ...SW25().accessorySlots, hand: "SW25.Slot.hand", any: "SW25.Slot.any" },
        ["head", "face", "ear", "neck", "back", "hand", "rightHand", "leftHand", "waist", "feet", "other", "any"]),
      values: r => r.slots },
    { key: "flags", type: "chips", mode: "all", label: "SW25.Browser.Properties", hint: "SW25.Bestiary.AllOfHint",
      options: () => Object.entries(FLAGS).map(([value, label]) => ({ value, label })), values: r => r.flags },
    bookFacet
  ],

  columns: [
    nameColumn,
    { key: "rank", label: "SW25.Rank", cls: "c", sort: r => ["B", "A", "S", "SS"].indexOf(r.rank), cell: r => ({ text: r.rank || "—" }) },
    { key: "stance", label: "SW25.Browser.Hands", cls: "c opt", cell: r => ({ text: r.stance.join("/") || "—" }) },
    { key: "minStr", label: "SW25.Browser.MinStrShort", cls: "c", sort: r => r.minStr, cell: r => ({ text: r.minStr ?? "—" }) },
    { key: "stats", label: "SW25.Browser.Stats", cls: "small opt", cell: r => ({ html: esc(r.stats || "—").replace(/\n/g, "<br>") }) },
    { key: "price", label: "SW25.Browser.Price", cls: "price", sort: r => r.price, cell: r => ({ text: r.priceText, tooltip: r.priceText }) },
    bookColumn
  ],

  detail: (record, doc) => entryDetail(doc)
};
