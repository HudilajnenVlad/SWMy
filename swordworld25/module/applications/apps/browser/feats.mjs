import { bookColumn, bookFacet, entryDetail, labelOf, nameColumn, optionsOf } from "./common.mjs";

const SW25 = () => CONFIG.SW25;

/** What a declared feat is declared with, from its "Application" and "Use" texts. */
const APPLICATIONS = {
  melee: { label: "SW25.Browser.Apply.melee", rx: /melee/i },
  ranged: { label: "SW25.Browser.Apply.ranged", rx: /ranged|thrown|shoot|bow/i },
  weapon: { label: "SW25.Browser.Apply.weapon", rx: /weapon attack/i },
  spell: { label: "SW25.Browser.Apply.spell", rx: /spell/i },
  round: { label: "SW25.Browser.Apply.round", rx: /^lasts/i },
  bard: { label: "SW25.Browser.Apply.bard", rx: /finale|spellsong|performance/i },
  evocation: { label: "SW25.Browser.Apply.evocation", rx: /evocation/i }
};

/** Special properties of a feat. */
const FLAGS = {
  risk: "SW25.Feat.Risk",
  automation: "SW25.Browser.Flag.automation",
  prep: "SW25.Browser.Flag.combatPrep",
  choice: "SW25.Browser.Flag.choice"
};

export default {
  id: "feats",
  label: "SW25.Browser.Feats",
  icon: "fa-solid fa-hand-fist",
  documentName: "Item",
  packs: ["swordworld25.feats"],
  search: "SW25.Browser.SearchName",
  deep: "SW25.Browser.SearchText",
  defaultSort: { key: "name", dir: 1 },

  record(doc) {
    const s = doc.system;
    const pre = s.prerequisites ?? {};
    const classes = [...new Set([...(pre.classes ?? []).map(c => c.class), s.autoGain?.class, ...(s.autoGain?.alt ?? []).map(a => a.class)]
      .filter(Boolean))];
    const text = `${s.application ?? ""} ${s.use ?? ""}`;
    const applications = Object.entries(APPLICATIONS).filter(([, a]) => a.rx.test(text)).map(([k]) => k);
    const flags = [
      s.risk?.text && "risk", (s.modifiers?.length > 0 || s.risk?.modifiers?.length > 0) && "automation", s.combatPrep && "prep",
      s.choice && "choice"
    ].filter(Boolean);
    return {
      featType: s.featType,
      acquisition: s.acquisition,
      classes,
      advLevel: Number.isInteger(pre.advLevel) ? pre.advLevel : null,
      applications,
      flags,
      prerequisites: pre.text || "",
      application: s.application || "",
      risk: s.risk?.text || "",
      subtitle: pre.text && (pre.text !== "None") ? pre.text : "",
      searchText: [pre.text, s.application, s.use, s.risk?.text].filter(Boolean).join(" "),
      check: actor => doc.system.checkPrerequisites(actor).ok
    };
  },

  facets: [
    { key: "available", type: "toggle", label: "SW25.Browser.PrereqMet", labelData: ref => ({ name: ref?.name ?? "" }),
      visible: ref => !!ref, test: (r, ref) => r.check(ref) },
    { key: "featType", type: "chips", label: "SW25.Feat.Type", options: () => optionsOf(SW25().featTypes), values: r => r.featType },
    { key: "acquisition", type: "chips", label: "SW25.Browser.Acquisition",
      options: [{ value: "selective", label: "SW25.Browser.Selective" }, { value: "automatic", label: "SW25.Browser.Automatic" }],
      values: r => r.acquisition },
    { key: "classes", type: "chips", label: "SW25.Browser.Classes", sortByLabel: true,
      options: () => [...optionsOf(SW25().classes), { value: "wizard", label: "SW25.Browser.AnyWizard" }], values: r => r.classes },
    { key: "advLevel", type: "range", label: "SW25.Browser.AdvLevel", get: r => r.advLevel ?? 0, placeholderMin: "1", placeholderMax: "15" },
    { key: "applications", type: "chips", label: "SW25.Feat.Application",
      options: () => Object.entries(APPLICATIONS).map(([value, a]) => ({ value, label: a.label })), values: r => r.applications },
    { key: "flags", type: "chips", mode: "all", label: "SW25.Browser.Properties", hint: "SW25.Bestiary.AllOfHint",
      options: () => Object.entries(FLAGS).map(([value, label]) => ({ value, label })), values: r => r.flags },
    bookFacet
  ],

  columns: [
    { key: "featType", label: "SW25.Feat.Type", cls: "c", sort: r => r.featType,
      cell: r => ({ text: labelOf(SW25().featTypes, r.featType) }) },
    nameColumn,
    { key: "application", label: "SW25.Feat.Application", cls: "small", sort: r => r.application,
      cell: r => ({ text: r.application || "—" }) },
    { key: "risk", label: "SW25.Feat.Risk", cls: "small opt", sort: r => r.risk || null, cell: r => ({ text: r.risk || "—" }) },
    bookColumn
  ],

  detail: (record, doc) => entryDetail(doc)
};
