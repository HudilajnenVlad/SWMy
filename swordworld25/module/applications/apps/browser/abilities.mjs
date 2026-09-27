import { t } from "../../../helpers/utils.mjs";
import {
  bookColumn, bookFacet, distinctOptions, entryDetail, esc, labelOf, levelColumn, levelFacet, nameColumn, optionsOf
} from "./common.mjs";

const SW25 = () => CONFIG.SW25;

/** Kinds of class abilities, with the class that learns them. */
const KINDS = ["technique", "spellsong", "finale", "stunt", "evocation"];

/** Rhythm text: ⮭2 ⮯1. */
function rhythm(r) {
  return ["up", "down", "heart"].filter(k => r?.[k]).map(k => `${SW25().rhythms[k].icon}${r[k]}`).join(" ");
}

/** When an ability is used. */
const TIMINGS = {
  prep: "SW25.Browser.Flag.combatPrep",
  minor: "SW25.Browser.Flag.minorAction",
  major: "SW25.AbilityTag.major",
  passive: "SW25.AbilityTag.passive",
  oncePerRound: "SW25.Technique.OncePerRound"
};

export default {
  id: "abilities",
  label: "SW25.Browser.Abilities",
  icon: "fa-solid fa-hat-wizard",
  documentName: "Item",
  packs: ["swordworld25.class-abilities"],
  search: "SW25.Browser.SearchName",
  deep: "SW25.Browser.SearchText",
  defaultSort: { key: "level", dir: 1 },

  accept: doc => KINDS.includes(doc.type),

  record(doc) {
    const s = doc.system;
    const type = doc.type;
    const timings = [];
    let cost = "";
    let extra = "";
    switch ( type ) {
      case "technique":
        timings.push(s.combatPrep ? "prep" : "minor");
        if ( s.oncePerRound ) timings.push("oncePerRound");
        cost = `MP${s.mpCost ?? 3}`;
        extra = s.duration?.text ?? "";
        break;
      case "spellsong":
        timings.push("major");
        cost = rhythm(s.baseRhythm) ? `+${rhythm(s.baseRhythm)}` : "";
        extra = labelOf(SW25().resistance, s.resistance);
        break;
      case "finale":
        timings.push("major");
        cost = rhythm(s.cost);
        extra = labelOf(SW25().resistance, s.resistance);
        break;
      case "stunt":
        timings.push(s.action || "passive");
        extra = (s.mounts ?? []).map(m => labelOf(SW25().mountKinds, m)).join(", ");
        break;
      case "evocation":
        timings.push(s.minorAction ? "minor" : "major");
        if ( s.combatPrep ) timings.push("prep");
        cost = s.cards?.text ?? "";
        extra = s.duration?.text ?? "";
        break;
    }
    const ranks = type === "evocation" ? SW25().cardRanks.filter(r => s.ranks?.[r]?.available !== false) : [];
    return {
      type,
      learnedBy: SW25().learnedTypes[type],
      level: s.level ?? 1,
      timings,
      cost,
      extra,
      colors: s.cards?.colors ?? [],
      ranks,
      mounts: s.mounts ?? [],
      pets: s.pets ?? [],
      singing: !!s.singing,
      resistance: s.resistance || "",
      types: s.types ?? [],
      automation: (s.modifiers?.length > 0) || !!s.modifierKey || !!s.rankEffect || Number.isInteger(s.effect?.power),
      subtitle: t(`TYPES.Item.${type}`),
      searchText: [s.duration?.text, s.cards?.text, s.condition?.text, (s.pets ?? []).join(" ")].filter(Boolean).join(" ")
    };
  },

  facets: [
    { key: "learnable", type: "toggle", label: "SW25.Browser.LearnableBy", labelData: ref => ({ name: ref?.name ?? "" }),
      visible: ref => !!ref && KINDS.some(k => ref.system.classes?.[SW25().learnedTypes[k]]),
      test: (r, ref) => (ref.system.classes?.[r.learnedBy]?.level ?? 0) >= r.level },
    { key: "type", type: "chips", label: "SW25.Browser.Kind",
      options: () => KINDS.map(k => ({ value: k, label: `TYPES.Item.${k}` })), values: r => r.type },
    levelFacet(15),
    { key: "timings", type: "chips", label: "SW25.Browser.Timing", options: () => Object.entries(TIMINGS).map(([value, label]) => ({ value, label })),
      values: r => r.timings },
    { key: "colors", type: "chips", mode: "all", label: "SW25.Card.Cards", hint: "SW25.Bestiary.AllOfHint",
      options: () => optionsOf(SW25().cardColors), values: r => r.colors },
    { key: "ranks", type: "chips", label: "SW25.Card.Rank", options: () => SW25().cardRanks.map(r => ({ value: r, label: r })), values: r => r.ranks },
    { key: "mounts", type: "chips", label: "SW25.Browser.Mounts", options: () => optionsOf(SW25().mountKinds), values: r => r.mounts },
    { key: "pets", type: "chips", label: "SW25.Entry.Pet", options: records => distinctOptions(records, r => r.pets), values: r => r.pets },
    { key: "singing", type: "toggle", label: "SW25.Entry.Singing", test: r => r.singing },
    { key: "resistance", type: "chips", label: "SW25.Resistance.label", options: () => optionsOf(SW25().resistance), values: r => r.resistance },
    { key: "types", type: "chips", label: "SW25.Browser.Types", options: () => optionsOf(SW25().damageTypes), values: r => r.types, sortByLabel: true },
    { key: "automation", type: "toggle", label: "SW25.Browser.Flag.automation", test: r => r.automation },
    bookFacet
  ],

  columns: [
    levelColumn,
    nameColumn,
    { key: "cost", label: "SW25.Entry.Cost", cls: "c", sort: r => r.cost || null, cell: r => ({ text: r.cost || "—" }) },
    { key: "timings", label: "SW25.Browser.Timing", cls: "c small",
      cell: r => ({ html: r.timings.map(k => esc(t(TIMINGS[k]))).join("<br>") }) },
    { key: "extra", label: "SW25.Browser.Details", cls: "small opt", cell: r => ({ text: r.extra || "—" }) },
    bookColumn
  ],

  detail: (record, doc) => entryDetail(doc)
};
