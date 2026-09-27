import MonsterTemplateApp from "../monster-template.mjs";
import { t } from "../../../helpers/utils.mjs";
import { BOOKS, bookColumn, bookFacet, distinctOptions, esc, levelColumn, nameColumn } from "./common.mjs";

const SW25 = () => CONFIG.SW25;

/** Compendium of the bestiary. */
const PACK = "swordworld25.bestiary";

/**
 * Traits recognised from movement and unique skills. `match` receives the monster record.
 * @type {Record<string, {icon: string, match: Function}>}
 */
const TRAITS = {
  flight: { icon: "fa-solid fa-feather-pointed", match: r => /flying|floating/i.test(r.airMode) || r.skills.some(n => /\bflight\b|\bflying\b/i.test(n)) },
  swim: { icon: "fa-solid fa-water", match: r => /swim/i.test(r.airMode) || r.skills.some(n => /underwater|swim|aquatic/i.test(n)) },
  burrow: { icon: "fa-solid fa-mound", match: r => /burrow|sand/i.test(r.airMode) },
  magic: { icon: "fa-solid fa-wand-sparkles", match: r => r.magic.length > 0 },
  breath: { icon: "fa-solid fa-fire-flame-simple", match: r => r.skills.some(n => /breath/i.test(n)) },
  regeneration: { icon: "fa-solid fa-heart-circle-plus", match: r => r.skills.some(n => /regenerat/i.test(n)) },
  poison: { icon: "fa-solid fa-skull-crossbones", match: r => r.damageTypes.includes("poison") || r.skills.some(n => /poison(?! immunity)/i.test(n)) },
  curse: { icon: "fa-solid fa-ghost", match: r => r.damageTypes.includes("curse") || r.skills.some(n => /curse/i.test(n)) },
  gaze: { icon: "fa-solid fa-eye", match: r => r.skills.some(n => /gaze|eyes/i.test(n)) },
  invisible: { icon: "fa-solid fa-eye-slash", match: r => r.skills.some(n => /invisib/i.test(n)) },
  actions: { icon: "fa-solid fa-angles-right", match: r => r.skills.some(n => /2 actions|multiple declarations/i.test(n)) },
  shapeshift: { icon: "fa-solid fa-masks-theater", match: r => r.skills.some(n => /humanif|transform/i.test(n)) },
  noLoot: { icon: "fa-solid fa-ban", match: r => r.skills.some(n => /^no loot$/i.test(n)) }
};

/** Traits shown as icons in the result table. */
const ICON_TRAITS = ["flight", "swim", "burrow", "magic", "breath", "regeneration"];

/** Immunity names of unique skills ("Fire Immunity") → filter keys. */
const IMMUNITIES = {
  poison: /poison/i, psychic: /psychic/i, disease: /disease/i, normalWeapon: /normal weapon/i, fire: /fire/i,
  ice: /ice|water/i, slashing: /slashing/i, earth: /earth/i, wind: /wind/i, lightning: /lightning/i,
  energy: /energy/i, curse: /curse/i
};

/** Singular forms of habitat words. */
const HABITAT_ALIASES = {
  forests: "Forest", mountains: "Mountain", caves: "Cave", swamps: "Swamp", shallows: "Shallow", labyrinths: "Labyrinth",
  rivers: "River", lakes: "Lake", grasslands: "Grassland", plains: "Plain", deserts: "Desert", highlands: "Highland",
  hills: "Hill", ponds: "Pond", meadows: "Meadow", volcanoes: "Volcano", "cold regions": "Cold Region",
  "secluded regions": "Secluded Region", settlements: "Settlement", "human settlement": "Settlement", habitats: "Settlement"
};

/** Language entries that are not a language of the list ("All" speaks every language). */
const LANGUAGE_NOTES = /^(all|various)$|previous life|magic system/i;

/**
 * Localized label of an intelligence, perception or disposition value of the bestiary.
 * @param {"Intelligence"|"Perception"|"Disposition"} group
 * @param {string} value
 * @returns {string}
 */
function valueLabel(group, value) {
  if ( !value ) return "—";
  const key = (group === "Intelligence") ? SW25().intelligenceLevels?.[value]
    : `SW25.Bestiary.${group}.${value.replace(/[^A-Za-z]/g, "")}`;
  return (key && game.i18n.has(key)) ? t(key) : value;
}

/**
 * Label of a weak point damage type.
 * @param {string} key
 * @returns {string}
 */
function weakLabel(key) {
  const types = SW25().damageTypes;
  if ( types[key] ) return t(types[key]);
  const own = `SW25.Bestiary.Weak.${key}`;
  return game.i18n.has(own) ? t(own) : key;
}

/** Standard and fixed value: "10 (17)". */
const fixed = n => (Number.isFinite(n) ? `${n} (${n + SW25().FIXED_OFFSET})` : "—");

export default {
  id: "bestiary",
  label: "SW25.Bestiary.Title",
  icon: "fa-solid fa-dragon",
  documentName: "Actor",
  packs: [PACK],
  search: "SW25.Bestiary.Search",
  deep: "SW25.Bestiary.SearchDeep",
  defaultSort: { key: "level", dir: 1 },

  record(doc) {
    const s = doc.system;
    const skills = doc.items.filter(i => i.type === "ability");
    const skillNames = skills.map(i => i.name);
    const splitNames = skillNames.flatMap(n => n.split(/\s*[&/,]\s*/));
    const magic = [...new Set(skills.map(i => i.system.spellcasting?.system).filter(Boolean))];
    const damageTypes = [...new Set(skills.flatMap(i => i.system.damage?.types ?? []))];
    const immunities = Object.entries(IMMUNITIES)
      .filter(([, rx]) => splitNames.some(n => /immunity$/i.test(n) && rx.test(n.replace(/\s*immunity$/i, ""))))
      .map(([k]) => k);
    const habitat = String(s.habitat ?? "").split(/\s*,\s*/).map(h => h.trim()).filter(Boolean)
      .map(h => HABITAT_ALIASES[h.toLowerCase()] ?? h);
    const languageList = String(s.languages ?? "").split(/\s*,\s*/).map(l => l.trim()).filter(Boolean)
      .map(l => l.replace(/^regional dialect$/i, "Regional Dialect"));
    const weakTypes = String(s.weakPoint?.damageType ?? "").split(/\s*,\s*/).filter(Boolean);
    if ( s.weakPoint?.kind === "accuracy" ) weakTypes.push("accuracy");
    const lootItems = (s.loot ?? []).map(l => ({ roll: l.roll, item: l.item, price: l.price, cards: l.cards }));
    const record = {
      level: s.level ?? 0,
      classification: s.classification,
      book: s.details?.source?.book ?? "",
      page: s.details?.source?.page ?? null,
      intelligence: s.intelligence || "",
      perception: s.perception || "",
      disposition: s.disposition || "",
      habitat,
      habitatText: s.habitat ?? "",
      languages: languageList.filter(l => !LANGUAGE_NOTES.test(l)),
      allLanguages: languageList.some(l => /^all$/i.test(l)),
      languagesText: s.languages ?? "",
      reputation: s.reputation,
      weakness: s.weakness,
      weakText: s.weakPoint?.text ?? "",
      weakTypes,
      hp: s.hp?.max ?? 0,
      sections: s.sections.length,
      sectionLine: (s.sectionGroups ?? []).map(g => (g.count > 1 ? `${g.label} ×${g.count}` : g.label)).join(", "),
      mainSection: s.mainSection ?? "",
      movement: s.movementLabel ?? "",
      airMode: s.movement?.airMode ?? "",
      fortitude: s.fortitudeTotal,
      willpower: s.willpowerTotal,
      skills: skillNames,
      skillTags: skills.map(i => ({ name: i.name, icons: i.system.tagIcons, section: i.system.section })),
      magic,
      damageTypes,
      immunities,
      lootItems,
      rows: s.sections.map(sec => ({
        label: sec.label, style: sec.style, main: sec.main,
        accuracy: sec.accuracyTotal, damage: sec.damage, evasion: sec.evasionTotal, defense: sec.defenseTotal,
        hp: sec.hp.max, mp: sec.mp.max
      })),
      summary: String(s.details?.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      searchText: [...skillNames, ...lootItems.map(l => l.item)].join(" · ")
    };
    record.traits = Object.entries(TRAITS).filter(([, cfg]) => cfg.match(record)).map(([k]) => k);
    record.subtitle = [t(SW25().monsterClassifications[record.classification] ?? record.classification), record.habitatText]
      .filter(Boolean).join(" · ");
    return record;
  },

  facets: [
    { key: "level", type: "range", label: "SW25.Level", get: r => r.level, placeholderMin: "0", placeholderMax: "20" },
    { key: "repMax", type: "range", onlyMax: true, label: "SW25.Bestiary.RepMax", hint: "SW25.Bestiary.RepMaxHint",
      get: r => r.reputation, placeholderMax: "—" },
    { key: "classification", type: "chips", label: "SW25.Bestiary.Classification",
      options: () => Object.keys(SW25().monsterClassifications).filter(k => k !== "other")
        .map(k => ({ value: k, label: SW25().monsterClassifications[k] })), values: r => r.classification },
    { key: "traits", type: "chips", mode: "all", label: "SW25.Bestiary.Traits", hint: "SW25.Bestiary.AllOfHint",
      options: () => Object.entries(TRAITS).map(([k, cfg]) => ({ value: k, label: `SW25.Bestiary.Trait.${k}`, icon: cfg.icon })),
      values: r => r.traits },
    { key: "immunities", type: "chips", mode: "all", label: "SW25.Bestiary.Immunities", hint: "SW25.Bestiary.AllOfHint",
      options: () => Object.keys(IMMUNITIES).map(k => ({ value: k, label: `SW25.Bestiary.Immunity.${k}` })), values: r => r.immunities },
    { key: "weak", type: "chips", label: "SW25.Bestiary.WeakPoint", sortByLabel: true,
      options: records => distinctOptions(records, r => r.weakTypes, weakLabel), values: r => r.weakTypes },
    { key: "damage", type: "chips", label: "SW25.Bestiary.DamageDealt", hint: "SW25.Bestiary.DamageDealtHint", sortByLabel: true,
      options: () => Object.keys(SW25().damageTypes).map(k => ({ value: k, label: SW25().damageTypes[k] })), values: r => r.damageTypes },
    { key: "sections", type: "radio", label: "SW25.Bestiary.SectionsTitle", default: "any",
      options: ["any", "single", "multi"].map(v => ({ value: v, label: `SW25.Bestiary.Sections.${v}` })),
      test: (r, v) => (v === "any") || ((v === "single") ? (r.sections < 2) : (r.sections > 1)) },
    { key: "intelligence", type: "chips", label: "SW25.Monster.Intelligence",
      options: records => distinctOptions(records, r => r.intelligence, v => valueLabel("Intelligence", v)), values: r => r.intelligence },
    { key: "perception", type: "chips", label: "SW25.Monster.Perception",
      options: records => distinctOptions(records, r => r.perception, v => valueLabel("Perception", v)), values: r => r.perception },
    { key: "disposition", type: "chips", label: "SW25.Monster.Disposition",
      options: records => distinctOptions(records, r => r.disposition, v => valueLabel("Disposition", v)), values: r => r.disposition },
    { key: "language", type: "select", label: "SW25.Language", options: records => distinctOptions(records, r => r.languages),
      test: (r, v) => r.allLanguages || r.languages.includes(v) },
    { key: "habitat", type: "select", label: "SW25.Monster.Habitat", options: records => distinctOptions(records, r => r.habitat),
      values: r => r.habitat },
    bookFacet
  ],

  columns: [
    levelColumn,
    nameColumn,
    { key: "reputation", label: "SW25.Monster.RepWeak", tooltip: "SW25.Monster.RepWeakHint", cls: "c", sort: r => r.reputation,
      cell: r => ({ text: `${r.reputation ?? "—"}/${r.weakness ?? "—"}` }) },
    { key: "hp", label: "SW25.HP", cls: "c", sort: r => r.hp, cell: r => ({ text: r.hp }) },
    { key: "sections", label: "SW25.Bestiary.SectionsShort", tooltip: "SW25.Bestiary.SectionsTitle", cls: "c", sort: r => r.sections,
      cell: r => ({ text: r.sections }) },
    { key: "traits", label: "SW25.Bestiary.Traits", cls: "traits",
      cell: r => ({ html: r.traits.filter(k => ICON_TRAITS.includes(k))
        .map(k => `<i class="${TRAITS[k].icon}" data-tooltip="${esc(t(`SW25.Bestiary.Trait.${k}`))}"></i>`).join("") }) },
    bookColumn
  ],

  async detail(r) {
    const SW = SW25();
    return foundry.applications.handlebars.renderTemplate("systems/swordworld25/templates/apps/browser/bestiary-detail.hbs", {
      ...r,
      intelligenceLabel: valueLabel("Intelligence", r.intelligence),
      perceptionLabel: valueLabel("Perception", r.perception),
      dispositionLabel: valueLabel("Disposition", r.disposition),
      magicText: r.magic.map(m => t(SW.magicSystems[m]?.label ?? `SW25.Bestiary.Magic.${m}`)).join(", "),
      immunitiesText: r.immunities.map(k => t(`SW25.Bestiary.Immunity.${k}`)).join(", "),
      fortitudeLabel: fixed(r.fortitude),
      willpowerLabel: fixed(r.willpower),
      sectionRows: r.rows.map(row => ({ ...row, accuracyLabel: fixed(row.accuracy), evasionLabel: fixed(row.evasion) })),
      loot: r.lootItems.map(l => ({ ...l, label: [l.item, l.price ? `${l.price}G` : "", l.cards].filter(Boolean).join(" · ") }))
    });
  },

  /** Import into the world (GM or users allowed to create actors). */
  rowTools: () => ((game.user.isGM || Actor.implementation.canUserCreate(game.user)) ? [{
    id: "import", icon: "fa-solid fa-file-import", tooltip: "SW25.Bestiary.Import",
    async run(uuid) {
      const pack = game.packs.get(PACK);
      const id = foundry.utils.parseUuid(uuid)?.id;
      if ( !pack || !id ) return;
      const actor = await game.actors.importFromCompendium(pack, id);
      if ( actor ) {
        ui.notifications.info(t("SW25.Bestiary.Imported", { name: actor.name }));
        actor.sheet.render(true);
      }
    }
  }] : []),

  barTools: () => [
    { id: "template", icon: "fa-solid fa-wand-magic-sparkles", tooltip: "SW25.Template.Sidebar",
      run: () => new MonsterTemplateApp().render({ force: true }) },
    { id: "pack", icon: "fa-solid fa-book-open", tooltip: "SW25.Bestiary.OpenPack", run: () => game.packs.get(PACK)?.render(true) }
  ],

  /** Books of the records are those of the monster details. */
  books: BOOKS
};
