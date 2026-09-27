import { lookupPower } from "../dice/power-table.mjs";
import { enrich, signed, t, typesLabel } from "./utils.mjs";

/**
 * Book-style entry cards of items: a black title bar with an icon cell, rows of gray label / value cells,
 * the summary ("Sum.") and the effect text ("Eff."), like the spell, feat and technique entries of the rulebooks.
 * Used by the item sheet (view mode), the spellbook, the expanded rows of actor sheets and chat cards.
 *
 * @typedef {object} EntryPair
 * @property {string} label
 * @property {string|number} value
 * @property {string} [cls]
 * @property {string} [tooltip]
 *
 * @typedef {object} ItemEntry
 * @property {string} name
 * @property {string} icon           Font Awesome classes of the icon cell
 * @property {string|number} badge   Level or rank printed over the icon
 * @property {string} marks          Action marks before the name (⏩ △ ◯ ► 🗨)
 * @property {string} marksTooltip
 * @property {EntryPair[]} head      Label / value cells at the right of the title bar
 * @property {EntryPair[][]} rows    Rows of label / value cells
 * @property {object[]} tables       Book tables [{cls, head: [{label, html, cls}], rows: [{cls, action, index, cells: [{value, html, cls}]}]}]
 *                                   (`html` is trusted markup built here, `value` is escaped)
 * @property {string} summary
 * @property {EntryPair[]} summaryPairs
 * @property {string} text           Enriched description
 * @property {object[]} blocks       Extra titled paragraphs [{title, text}]
 * @property {object|null} power     Power table row {power, note, critical, cells}
 * @property {string} source
 */

/** Icon of the entry by item type (spells use their magic system, gear its kind). */
const TYPE_ICONS = {
  race: "fa-solid fa-people-group",
  class: "fa-solid fa-user-graduate",
  weapon: "fa-solid fa-khanda",
  armor: "fa-solid fa-shield-halved",
  gear: "fa-solid fa-suitcase",
  spell: "fa-solid fa-wand-sparkles",
  feat: "fa-solid fa-hand-fist",
  technique: "fa-solid fa-fire-flame-curved",
  spellsong: "fa-solid fa-music",
  finale: "fa-solid fa-guitar",
  stunt: "fa-solid fa-horse",
  evocation: "fa-solid fa-flask",
  ability: "fa-solid fa-dragon",
  effect: "fa-solid fa-bolt"
};

const GEAR_ICONS = {
  accessory: "fa-solid fa-ring",
  classItem: "fa-solid fa-toolbox",
  herb: "fa-solid fa-leaf",
  potion: "fa-solid fa-vial",
  ammo: "fa-solid fa-crosshairs",
  tool: "fa-solid fa-toolbox",
  improvement: "fa-solid fa-hammer",
  golemItem: "fa-solid fa-robot",
  mountItem: "fa-solid fa-horse",
  card: "fa-solid fa-clone",
  loot: "fa-solid fa-gem"
};

const CLASS_ICONS = {
  warrior: "fa-solid fa-khanda",
  wizard: "fa-solid fa-hat-wizard",
  other: "fa-solid fa-user-graduate"
};

/** Books of the source line. */
const BOOKS = { CR1: "CR I", CR2: "CR II", CR3: "CR III" };

/* -------------------------------------------- */

/**
 * Icon of an item.
 * @param {Item} item
 * @returns {string}
 */
export function itemIcon(item) {
  const s = item.system ?? {};
  if ( item.type === "spell" ) return CONFIG.SW25.magicSystems[s.magic]?.icon ?? TYPE_ICONS.spell;
  if ( item.type === "gear" ) return GEAR_ICONS[s.itemType] ?? TYPE_ICONS.gear;
  if ( item.type === "class" ) return CLASS_ICONS[s.category] ?? TYPE_ICONS.class;
  return TYPE_ICONS[item.type] ?? "fa-solid fa-cube";
}

/**
 * Localize a key of a config map ("—" for empty values).
 * @param {object} map
 * @param {string} key
 * @returns {string}
 */
function lab(map, key) {
  if ( !key ) return "—";
  const entry = map?.[key];
  return t(entry?.label ?? entry ?? key);
}

/** Pair helper that skips empty values. */
function pair(label, value, extra = {}) {
  if ( (value === null) || (value === undefined) || (value === "") ) return null;
  return { label: t(label), value, ...extra };
}

/** Rhythm string (⮭1 ⮯0 ♡2 → "⮭1 ♡2"). */
function rhythm(r = {}) {
  const parts = [];
  for ( const [key, cfg] of Object.entries(CONFIG.SW25.rhythms) ) if ( r[key] ) parts.push(`${cfg.icon}${r[key]}`);
  return parts.join(" ");
}

/** Price with thousands separators ("1,580"); text prices are kept as written. */
function price(s) {
  if ( s.priceText ) return s.priceText;
  return Number.isFinite(s.price) ? s.price.toLocaleString(game.i18n.lang) : null;
}

/** Yes / no label. */
const yes = flag => t(flag ? "SW25.Entry.Yes" : "SW25.Entry.No");

/**
 * Power table row of a power value (results 3–12, critical from the crit value).
 * @param {number} power
 * @param {number|null} critical
 * @param {string} [note]
 * @returns {object|null}
 */
export function powerRow(power, critical = 10, note = "") {
  if ( !Number.isInteger(power) ) return null;
  const crit = Number.isInteger(critical) ? critical : null;
  const cells = [];
  for ( let roll = 3; roll <= 12; roll++ ) {
    cells.push({ roll, value: lookupPower(power, roll), crit: (crit !== null) && (roll >= crit) });
  }
  return { power, note, critical: crit ?? "—", cells };
}

/* -------------------------------------------- */

/**
 * Build the entry card of an item.
 * @param {Item} item
 * @param {object} [options]
 * @param {boolean} [options.text=true]   Include the enriched description
 * @returns {Promise<ItemEntry>}
 */
export async function itemEntry(item, { text = true } = {}) {
  const s = item.system ?? {};
  const entry = {
    name: item.name,
    img: item.img,
    type: item.type,
    typeLabel: t(`TYPES.Item.${item.type}`),
    icon: itemIcon(item),
    badge: "",
    marks: "",
    marksTooltip: "",
    head: [],
    rows: [],
    tables: [],
    summary: s.summary ?? "",
    summaryPairs: [],
    text: "",
    blocks: [],
    power: null,
    source: sourceLabel(s.source)
  };
  const builder = BUILDERS[item.type];
  if ( builder ) builder(entry, s, item);
  entry.rows = entry.rows.map(row => row.filter(Boolean)).filter(row => row.length);
  entry.head = entry.head.filter(Boolean);
  entry.summaryPairs = entry.summaryPairs.filter(Boolean);
  if ( text && s.description ) {
    entry.text = await enrich(s.description, { secrets: item.isOwner, relativeTo: item, rollData: item.getRollData?.() });
  }
  entry.hasEffect = !!(entry.text || entry.power || entry.blocks.length);
  entry.hasSummary = !!(entry.summary || entry.summaryPairs.length);
  return entry;
}

/**
 * "CR I p.219" from a source field.
 * @param {object} source
 * @returns {string}
 */
function sourceLabel(source) {
  if ( !source?.book ) return "";
  return `${BOOKS[source.book] ?? source.book}${source.page ? ` p.${source.page}` : ""}`;
}

/**
 * Action marks of spells, techniques and evocations.
 * @param {object} s
 * @param {object} entry
 * @param {boolean} [minor]
 */
function actionMarks(entry, { minor = false, prep = false } = {}) {
  const tags = CONFIG.SW25.abilityTags;
  const marks = [];
  const tips = [];
  if ( minor ) {
    marks.push(tags.minor.icon);
    tips.push(`${tags.minor.icon} ${t(tags.minor.label)}`);
  }
  if ( prep ) {
    marks.push(tags.prep.icon);
    tips.push(`${tags.prep.icon} ${t(tags.prep.label)}`);
  }
  entry.marks = marks.join("");
  entry.marksTooltip = tips.join(" · ");
}

/** Targeting rows shared by spells and evocations. */
function targetingRow(s) {
  return [
    pair("SW25.Entry.Target", s.target?.text || "—", { cls: "first" }),
    pair("SW25.Entry.RangeArea", s.rangeArea?.text || "—"),
    pair("SW25.Entry.Duration", s.duration?.text || "—"),
    pair("SW25.Entry.Resistance", lab(CONFIG.SW25.resistance, s.resistance))
  ];
}

/** Type pair of the summary row. */
function typePair(types) {
  return types?.length ? pair("SW25.Entry.Type", typesLabel(types)) : null;
}

/* -------------------------------------------- */
/*  Per type                                    */
/* -------------------------------------------- */

const BUILDERS = {

  spell(entry, s) {
    const SW25 = CONFIG.SW25;
    entry.badge = s.level;
    actionMarks(entry, { minor: s.minorAction, prep: s.combatPrep });
    const cost = s.cost?.text || (Number.isInteger(s.cost?.mp) ? `MP${s.cost.mp}` : "—");
    entry.head.push(pair("SW25.Entry.Cost", cost));
    entry.rows.push(targetingRow(s));
    const extra = [];
    if ( (s.magic === "divine") && (s.subsystem === "special") ) extra.push(pair("SW25.Deity", s.deity || "—", { cls: "first" }));
    if ( (s.magic === "fairy") && s.subsystem && (s.subsystem !== "basic") ) extra.push(pair("SW25.Entry.Element", lab(SW25.fairyElements, s.subsystem), { cls: "first" }));
    if ( s.magisphere ) extra.push(pair("SW25.Magisphere.label", lab(SW25.magispheres, s.magisphere), { cls: "first" }));
    if ( s.barbarous ) extra.push(pair("SW25.Entry.Note", t("SW25.Spellbook.Barbarous"), { cls: "first" }));
    entry.rows.push(extra);
    entry.summaryPairs.push(typePair(s.types));
    const eff = s.effect ?? {};
    const statusNames = ids => ids.map(id => CONFIG.statusEffects.find(e => e.id === id)?.name ?? id).map(n => t(n)).join(", ");
    if ( eff.statuses?.length ) entry.summaryPairs.push(pair("SW25.Spell.Statuses", statusNames(eff.statuses)));
    // Versions of the spell (Bless by ability, Fist of God by the god's rank, fear table results)
    for ( const v of eff.variants ?? [] ) {
      const bits = [Number.isInteger(v.mp) ? `MP${v.mp}` : null, Number.isInteger(v.power) ? `${t("SW25.Power")} ${v.power}` : null,
        Number.isInteger(v.critical) ? `${t("SW25.CritValue")} ${v.critical}` : null, v.duration?.text || null].filter(Boolean);
      const text = [v.summary, v.statuses?.length ? `${t("SW25.Spell.Statuses")}: ${statusNames(v.statuses)}.` : ""].filter(Boolean).join(" ");
      entry.blocks.push({ title: `${v.label}${bits.length ? ` (${bits.join(", ")})` : ""}:`, text });
    }
    entry.power = powerRow(eff.power, eff.critical ?? 10, eff.addMagicPower ? t("SW25.Entry.PlusMagicPower") : "");
  },

  technique(entry, s) {
    entry.badge = s.level;
    actionMarks(entry, { minor: true, prep: s.combatPrep });
    entry.head.push(pair("SW25.Entry.Duration", s.duration?.text || "—"));
    entry.rows.push([
      pair("SW25.Entry.Cost", `MP${s.mpCost ?? 3}`, { cls: "first" }),
      s.oncePerRound ? pair("SW25.Entry.Limit", t("SW25.Technique.OncePerRound")) : null
    ]);
  },

  spellsong(entry, s) {
    entry.badge = s.level;
    entry.rows.push([
      pair("SW25.Entry.Singing", t(s.singing ? "SW25.Entry.Required" : "SW25.Entry.NotRequired"), { cls: "first" }),
      pair("SW25.Entry.Pet", s.pets?.length ? s.pets.join(", ") : "—")
    ]);
    entry.rows.push([
      pair("SW25.Entry.Condition", s.condition?.text || rhythm(s.condition) || t("SW25.Entry.None"), { cls: "first" }),
      pair("SW25.Entry.Resistance", lab(CONFIG.SW25.resistance, s.resistance)),
      s.types?.length ? pair("SW25.Entry.Type", typesLabel(s.types)) : null
    ]);
    entry.rows.push([
      pair("SW25.Entry.BaseRhythm", rhythm(s.baseRhythm) || "—", { cls: "first" }),
      pair("SW25.Entry.Flourish", s.flourish ?? "—"),
      pair("SW25.Entry.ExtraRhythm", rhythm(s.extraRhythm) || "—")
    ]);
    if ( s.duration?.text ) entry.rows.push([pair("SW25.Entry.Duration", s.duration.text, { cls: "first" })]);
  },

  finale(entry, s) {
    entry.badge = s.level;
    entry.head.push(pair("SW25.Entry.Cost", rhythm(s.cost) || "—"));
    entry.rows.push([
      pair("SW25.Entry.Target", s.targets || "—", { cls: "first" }),
      pair("SW25.Entry.Resistance", lab(CONFIG.SW25.resistance, s.resistance)),
      typePair(s.types)
    ]);
    const eff = s.effect ?? {};
    entry.power = powerRow(eff.power, eff.critical ?? 10, eff.addMagicPower ? t("SW25.Entry.PlusBardicPower") : "");
  },

  stunt(entry, s) {
    const tags = CONFIG.SW25.abilityTags;
    entry.badge = s.level;
    const tag = tags[s.action];
    if ( tag ) {
      entry.marks = tag.icon;
      entry.marksTooltip = `${tag.icon} ${t(tag.label)}`;
    }
    entry.rows.push([
      pair("SW25.Entry.Prereq", s.prerequisites?.length ? s.prerequisites.join(", ") : t("SW25.Entry.None"), { cls: "first" }),
      pair("SW25.Stunt.Area", lab({ none: "SW25.Stunt.AreaNone", main: "SW25.Stunt.AreaMain", all: "SW25.Stunt.AreaAll" }, s.area))
    ]);
    if ( s.mounts?.length ) entry.rows.push([pair("SW25.Stunt.Mounts", s.mounts.join(", "), { cls: "first" })]);
  },

  evocation(entry, s) {
    entry.badge = s.level;
    actionMarks(entry, { minor: s.minorAction, prep: s.combatPrep });
    entry.head.push(pair("SW25.Entry.Cards", s.cards?.text || "—"));
    entry.rows.push(targetingRow(s));
    const ranks = CONFIG.SW25.cardRanks.filter(r => s.ranks?.[r]?.available);
    if ( ranks.length ) {
      entry.tables.push({
        cls: "swp-entry-ranks",
        head: [{ label: t("SW25.Card.Rank") }, { label: t("SW25.Mod.Value") }, { label: t("SW25.Power") }, { label: t("SW25.Entry.Effect"), cls: "name" }],
        rows: ranks.map(r => {
          const d = s.ranks[r];
          return { cells: [
            { value: r, cls: "key" },
            { value: Number.isInteger(d.value) ? signed(d.value) : "—" },
            { value: Number.isInteger(d.power) ? d.power : "—" },
            { value: d.text || "", cls: "name" }
          ] };
        })
      });
    }
  },

  feat(entry, s) {
    const marks = { active: CONFIG.SW25.abilityTags.declared, major: CONFIG.SW25.abilityTags.major };
    const tag = marks[s.featType];
    if ( tag ) {
      entry.marks = tag.icon;
      entry.marksTooltip = `${tag.icon} ${t(CONFIG.SW25.featTypes[s.featType])}`;
    }
    entry.icon = "";
    const prereq = [s.prerequisites?.text, s.prerequisites?.advLevel ? t("SW25.Prereq.advLevel", { level: s.prerequisites.advLevel }) : ""]
      .filter(Boolean).join("; ");
    entry.rows.push([
      pair("SW25.Entry.Prereq", prereq || t("SW25.Entry.None"), { cls: "first grow" }),
      pair("SW25.Entry.Use", s.use || "-")
    ]);
    entry.rows.push([
      pair("SW25.Feat.Application", s.application, { cls: "first" }),
      pair("SW25.Feat.Risk", s.risk?.text)
    ]);
    if ( s.autoGain?.class ) {
      const cls = lab(CONFIG.SW25.classes, s.autoGain.class);
      entry.rows.push([pair("SW25.Feat.AutoGain", `${cls} ${s.autoGain.level ?? ""}`.trim(), { cls: "first" })]);
    }
    if ( s.choice ) entry.rows.push([pair("SW25.Feat.Choice", s.choiceValue || s.choice, { cls: "first" })]);
  },

  ability(entry, s, item) {
    entry.marks = s.tagIcons ?? "";
    entry.marksTooltip = (s.tags ?? []).map(k => {
      const tag = CONFIG.SW25.abilityTags[k];
      return tag ? `${tag.icon} ${t(tag.label)}` : "";
    }).filter(Boolean).join(" · ");
    const check = s.check ?? {};
    const checkParts = [];
    if ( Number.isInteger(check.value) ) checkParts.push(`${check.value} (${check.value + CONFIG.SW25.FIXED_OFFSET})`);
    if ( check.vs ) checkParts.push(`${t("SW25.Card.Against")} ${lab(CONFIG.SW25.resistVs, check.vs)}`);
    if ( check.result ) checkParts.push(`/ ${lab(CONFIG.SW25.resistance, check.result)}`);
    entry.rows.push([
      pair("SW25.Section.label", s.section, { cls: "first" }),
      pair("SW25.Entry.Check", checkParts.join(" "))
    ]);
    const dmg = s.damage ?? {};
    const dmgParts = [dmg.formula, dmg.kind ? lab(CONFIG.SW25.damageKinds, dmg.kind) : "", typesLabel(dmg.types ?? [])].filter(Boolean);
    entry.rows.push([pair("SW25.Damage.label", dmgParts.join(" · "), { cls: "first" })]);
    const sc = s.spellcasting ?? {};
    if ( sc.system ) {
      const system = lab(CONFIG.SW25.magicSystems, sc.system);
      const bits = [system, Number.isInteger(sc.level) ? `${t("SW25.Level")} ${sc.level}` : "", Number.isInteger(sc.power) ? `${t("SW25.MagicPower")} ${sc.power}` : ""];
      entry.rows.push([pair("SW25.Entry.Spellcasting", bits.filter(Boolean).join(" · "), { cls: "first" })]);
    }
    if ( s.prerequisite ) entry.rows.push([pair("SW25.AbilityItem.Prerequisite", s.prerequisite, { cls: "first" })]);
    entry.power = powerRow(dmg.power, dmg.critical ?? 10);
  },

  weapon(entry, s, item) {
    const SW25 = CONFIG.SW25;
    entry.badge = s.rank;
    const flags = [];
    if ( s.edged ) flags.push(t("SW25.Weapon.Edged"));
    if ( s.blunt ) flags.push(t("SW25.Weapon.Blunt"));
    if ( s.silver ) flags.push(t("SW25.Weapon.Silver"));
    if ( s.magic ) flags.push(t("SW25.Magic.Item"));
    if ( s.grapplerOnly ) flags.push(t("SW25.Weapon.GrapplerOnly"));
    if ( s.implement ) flags.push(t("SW25.Weapon.Implement"));
    if ( s.defenseBonus ) flags.push(`${t("SW25.Defense")} ${signed(s.defenseBonus)}`);
    entry.rows.push([
      pair("SW25.Category", (s.categories ?? []).map(c => lab(SW25.weaponCategories, c)).join(" / ") || "—", { cls: "first" }),
      pair("SW25.Price", price(s)),
      pair("SW25.Range.label", s.range)
    ]);
    entry.rows.push([
      pair("SW25.Entry.Properties", flags.join(", "), { cls: "first" }),
      Number.isInteger(s.magazine) ? pair("SW25.Gun.Magazine", `${s.loaded ?? 0} / ${s.magazine}`) : null
    ]);
    const owned = !!item.parent;
    const pw = [];
    for ( let r = 3; r <= 12; r++ ) pw.push({ html: `<span class="swp-circ">${r}</span>`, cls: "pw" });
    entry.tables.push({
      cls: "swp-entry-weapon",
      head: [
        { label: t("SW25.Sheet.Stance"), cls: "stance" }, { label: t("SW25.MinStr") }, { label: t("SW25.AccuracyShort") },
        { label: t("SW25.Power") }, ...pw, { label: t("SW25.Entry.CritShort") }, { label: t("SW25.ExtraDamageShort") }
      ],
      rows: (s.modes ?? []).map((m, i) => {
        const cells = [
          (m.label && (m.label !== m.stance))
            ? { html: `${foundry.utils.escapeHTML(m.stance)} <small>${foundry.utils.escapeHTML(m.label)}</small>`, cls: "stance" }
            : { value: m.stance, cls: "stance" },
          { value: m.minStr },
          { value: m.accuracy ? signed(m.accuracy) : "-" },
          { value: Number.isInteger(m.power) ? m.power : "—" }
        ];
        for ( let r = 3; r <= 12; r++ ) {
          const has = Number.isInteger(m.power);
          cells.push({ value: has ? lookupPower(m.power, r) : "", cls: `pw ${has && (r >= m.critical) ? "crit" : ""}` });
        }
        cells.push({ html: `<span class="swp-circ">${Number(m.critical) || 10}</span>` }, { value: m.extraDamage ? signed(m.extraDamage) : "-" });
        const switchable = owned && (s.modes.length > 1);
        return { cells, index: i, cls: switchable && (i === s.mode) ? "current" : "", action: switchable ? "setMode" : "" };
      })
    });
  },

  armor(entry, s) {
    entry.badge = s.rank;
    entry.tables.push({
      cls: "swp-entry-armor",
      head: [{ label: t("SW25.ArmorType.label"), cls: "name" }, { label: t("SW25.MinStr") }, { label: t("SW25.Evasion") },
        { label: t("SW25.Defense") }, { label: t("SW25.Price") }],
      rows: [{ cells: [
        { value: lab(CONFIG.SW25.armorTypes, s.armorType) + (s.stance ? ` (${s.stance})` : ""), cls: "name" },
        { value: s.minStr ?? "—" },
        { value: s.evasion ? signed(s.evasion) : "-" },
        { value: s.defense ?? 0 },
        { value: price(s) ?? "—" }
      ] }]
    });
    const flags = [];
    if ( s.silver ) flags.push(t("SW25.Weapon.Silver"));
    if ( s.magic ) flags.push(t("SW25.Magic.Item"));
    entry.rows.push([
      s.grappler ? pair("SW25.Grappler.label", lab(CONFIG.SW25.grapplerArmor, s.grappler), { cls: "first" }) : null,
      pair("SW25.Entry.Properties", flags.join(", "))
    ]);
  },

  gear(entry, s) {
    const SW25 = CONFIG.SW25;
    const slots = { ...SW25.accessorySlots, hand: "SW25.Slot.hand", any: "SW25.Slot.any" };
    entry.rows.push([
      pair("SW25.GearType.label", lab(SW25.gearTypes, s.itemType), { cls: "first" }),
      pair("SW25.Price", price(s)),
      s.slot?.length ? pair("SW25.Entry.Slots", s.slot.map(k => lab(slots, k)).join(", ")) : null,
      pair("SW25.Stance", s.stance)
    ]);
    const req = s.classReq ?? {};
    entry.rows.push([
      Number.isInteger(s.uses?.max) && s.uses.max ? pair("SW25.Gear.Uses", `${s.uses.value ?? s.uses.max} / ${s.uses.max}`, { cls: "first" }) : null,
      s.mako?.max ? pair("SW25.Gear.Mako", `${s.mako.value} / ${s.mako.max}`) : null,
      req.class ? pair("SW25.Gear.ClassReq", `${lab(SW25.classes, req.class)} ${req.level ?? ""}`.trim()) : null,
      s.consumable ? pair("SW25.Entry.Properties", t("SW25.Gear.Consumable")) : null,
      s.duration?.text ? pair("SW25.Entry.Duration", s.duration.text) : null
    ]);
    const use = s.use ?? {};
    if ( use.kind && (use.kind !== "none") ) {
      const bits = [lab(SW25.useKinds, use.kind)];
      if ( use.extra ) bits.push(signed(use.extra));
      if ( use.bonus ) bits.push(lab({ ...SW25.useBonuses, riderDex: "SW25.UseBonus.riderDex" }, use.bonus));
      entry.rows.push([pair("SW25.Gear.UseEffect", bits.join(" "), { cls: "first" })]);
      entry.power = powerRow(use.power, use.critical ?? 10);
    }
    entry.summaryPairs.push(typePair(s.types));
  },

  class(entry, s, item) {
    const SW25 = CONFIG.SW25;
    if ( item.parent ) entry.badge = s.level;
    const attacks = [];
    if ( s.attack?.melee ) attacks.push(t(s.attack.wrestlingOnly ? "SW25.Class.WrestlingOnly" : "SW25.Class.Melee"));
    if ( s.attack?.thrown ) attacks.push(t("SW25.Class.Thrown"));
    if ( s.attack?.shooting ) attacks.push(t("SW25.Class.Shooting"));
    entry.rows.push([
      pair("SW25.Class.Category", lab(SW25.classCategories, s.category), { cls: "first" }),
      pair("SW25.Class.Track", lab(SW25.classTracks, s.track)),
      s.magic ? pair("SW25.Class.Magic", lab(SW25.magicSystems, s.magic)) : null
    ]);
    entry.rows.push([
      pair("SW25.Entry.Attacks", attacks.join(", ") || "—", { cls: "first" }),
      pair("SW25.Class.Evasion", yes(s.evasion)),
      s.critical ? pair("SW25.Class.CriticalMod", signed(s.critical)) : null,
      s.halfStrength ? pair("SW25.Entry.Properties", t("SW25.Class.HalfStrength")) : null
    ]);
    if ( s.languages ) entry.rows.push([pair("SW25.Languages", s.languages, { cls: "first" })]);
    const table = SW25.expTable[s.track] ?? [];
    if ( table.length ) {
      const levels = table.slice(1);
      entry.tables.push({
        cls: "swp-entry-exp",
        head: [{ label: t("SW25.Level"), cls: "key" }, ...levels.map((c, i) => ({ label: String(i + 1) }))],
        rows: [{ cells: [{ value: t("SW25.Exp.label"), cls: "key" }, ...levels.map((c, i) => ({
          value: c, cls: item.parent && (i + 1 <= s.level) ? "done" : ""
        }))] }]
      });
    }
    if ( s.autoFeats?.length ) {
      entry.rows.push([pair("SW25.Class.AutoFeats", s.autoFeats.map(f => `${f.level}: ${f.name}`).join(" · "), { cls: "first" })]);
    }
  },

  race(entry, s) {
    const SW25 = CONFIG.SW25;
    entry.rows.push([
      pair("SW25.Languages", s.languages || "—", { cls: "first grow" }),
      pair("SW25.Race.Darkvision", yes(s.darkvision)),
      s.noMP ? pair("SW25.MP", t("SW25.Race.NoMP")) : null
    ]);
    entry.tables.push({
      cls: "swp-entry-dice",
      head: Object.values(SW25.abilities).map(a => ({ label: `${a.letter} ${t(a.abbr)}` })),
      rows: [{ cells: Object.keys(SW25.abilities).map(k => ({ value: s.abilityDice?.[k] ?? "—" })) }]
    });
    if ( s.backgrounds?.length ) {
      entry.tables.push({
        cls: "swp-entry-backgrounds",
        head: [{ label: "2d" }, { label: t("SW25.Background"), cls: "name" }, { label: t("SW25.Classes"), cls: "name" },
          { label: t("SW25.Base.skill") }, { label: t("SW25.Base.body") }, { label: t("SW25.Base.mind") }, { label: t("SW25.Exp.label") }],
        rows: s.backgrounds.map(b => ({ cells: [
          { value: b.roll || "—", cls: "key" }, { value: b.name, cls: "name" }, { value: b.classes || "—", cls: "name" },
          { value: b.skill }, { value: b.body }, { value: b.mind }, { value: b.exp }
        ] }))
      });
    }
    // Racial abilities the description does not already cover
    for ( const trait of s.traits ?? [] ) {
      if ( trait.name && (s.description ?? "").includes(trait.name) ) continue;
      const level = trait.level > 1 ? ` (${t("SW25.Level")} ${trait.level})` : "";
      entry.blocks.push({ title: `[${trait.name}]${level}`, text: trait.description });
    }
  },

  effect(entry, s) {
    const statuses = (s.statuses ?? []).map(id => {
      const status = CONFIG.statusEffects.find(e => e.id === id);
      return status ? t(status.name) : id;
    });
    entry.rows.push([
      pair("SW25.Entry.Duration", s.duration?.text || lab(CONFIG.SW25.durationUnits, s.duration?.unit), { cls: "first" }),
      statuses.length ? pair("SW25.EffectItem.Statuses", statuses.join(", ")) : null,
      s.stackable ? pair("SW25.Entry.Properties", t("SW25.EffectItem.Stackable")) : null
    ]);
  }
};
