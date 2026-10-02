/**
 * Build the compendium packs of the Sword World 2.5 system from the JSON sources in data/.
 *
 *   node tools/build-packs.mjs            build every pack
 *   node tools/build-packs.mjs spells     build selected packs
 *   node tools/build-packs.mjs pregens    sample characters only (plain JSON, fine while a world is open)
 *
 * Foundry must not have a world using this system open while packs are rebuilt (LevelDB lock).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const SYSTEM = path.join(ROOT, "swordworld25");
const OUT = path.join(SYSTEM, "packs");
const TMP = path.join(ROOT, "build", "packs-src");
const FOUNDRY_PUBLIC = process.env.FOUNDRY_PUBLIC ?? "C:/Program Files/Foundry Virtual Tabletop1/resources/app/public";

const systemJson = JSON.parse(fs.readFileSync(path.join(SYSTEM, "system.json"), "utf8"));
const STATS = {
  coreVersion: "13.348",
  systemId: "swordworld25",
  systemVersion: systemJson.version,
  createdTime: 1790000000000,
  modifiedTime: 1790000000000,
  lastModifiedBy: null,
  compendiumSource: null,
  duplicateSource: null
};

const warnings = [];
const warn = msg => warnings.push(msg);

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** Deterministic 16-character document id. */
function makeId(...parts) {
  const hash = crypto.createHash("sha256").update(parts.join("|")).digest();
  let id = "";
  for ( let i = 0; i < 16; i++ ) id += ALPHABET[hash[i] % ALPHABET.length];
  return id;
}

function readJson(rel) {
  const file = path.join(DATA, rel);
  if ( !fs.existsSync(file) ) {
    warn(`missing data file ${rel}`);
    return [];
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Plain text (paragraphs separated by blank lines) → HTML. */
function toHtml(text, extra = "") {
  const paragraphs = String(text ?? "").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`);
  return paragraphs.join("") + extra;
}

function sourceLine(source) {
  if ( !source?.book ) return "";
  const book = { CR1: "Core Rulebook I", CR2: "Core Rulebook II", CR3: "Core Rulebook III" }[source.book] ?? source.book;
  return `<p class="sw25-source"><em>${book}${source.page ? `, p. ${source.page}` : ""}</em></p>`;
}

const iconCache = new Map();
/** Return the icon if it exists in Foundry's public folder, else the fallback. */
function icon(src, fallback = "icons/svg/item-bag.svg") {
  if ( !src ) return fallback;
  if ( src.startsWith("systems/") ) return src;
  if ( !fs.existsSync(FOUNDRY_PUBLIC) ) return src;
  if ( !iconCache.has(src) ) iconCache.set(src, fs.existsSync(path.join(FOUNDRY_PUBLIC, src)));
  if ( iconCache.get(src) ) return src;
  warn(`icon not found: ${src}`);
  return fallback;
}

const MODIFIER_KEYS = new Set([
  "accuracy", "accuracyMelee", "accuracyRanged", "evasion", "defense", "damage", "damageMelee", "damageRanged",
  "damageMagic", "damageTaken", "damageTakenPhysical", "damageTakenMagic", "critical", "criticalSpell", "powerRoll",
  "criticalTaken", "powerPerCrit", "weaponPower", "finalePower", "regenTurn", "regenRound", "damageTurn",
  "fortitude", "willpower", "spellcasting", "magicPower", "actionChecks", "allChecks", "initiative", "monsterKnowledge",
  "technique", "movementCheck", "observation", "knowledge", "movement", "hpMax", "mpMax", "performance", "evocation",
  "riding", "loot", "mp.cost",
  ...["dex", "agi", "str", "vit", "int", "spi"].flatMap(a => [`ability.${a}`, `mod.${a}`])
]);
const CHECK_KEYS = new Set([
  "conceal", "firstAid", "disableDevice", "pickpocket", "disguise", "setTrap", "tumble", "hide", "acrobatics", "climb",
  "follow", "jump", "swim", "riding", "climbStr", "strength", "track", "notice", "listen", "dangerSense", "search", "spotTrap",
  "meteorology", "insight", "literature", "engineering", "cartography", "pathology", "herbology", "appraise",
  "monsterKnowledge", "weakness", "detect", "investigation", "evocation", "initiative", "performance", "willpower",
  "fortitude", "death"
]);

/** Normalize a modifier list, dropping unknown keys. */
function modifiers(list, context) {
  const out = [];
  for ( const m of list ?? [] ) {
    if ( !m?.key ) continue;
    let key = m.key;
    if ( key.startsWith("checks.") ) key = `check.${key.slice(7)}`;
    const valid = MODIFIER_KEYS.has(key) || (key.startsWith("check.") && CHECK_KEYS.has(key.slice(6)));
    if ( !valid ) {
      warn(`${context}: unknown modifier key "${m.key}"`);
      continue;
    }
    const value = Number(m.value);
    if ( !Number.isFinite(value) ) continue;
    out.push({
      key, value,
      formula: str(m.formula),
      condition: m.condition ?? "",
      scope: m.scope === "use" ? "use" : "effect",
      target: m.target === "target" ? "target" : "self",
      actorType: ["character", "monster"].includes(m.actorType) ? m.actorType : ""
    });
  }
  return out;
}

/** Status ids of the system (module/helpers/conditions.mjs). */
const STATUS_IDS = new Set([...fs.readFileSync(path.join(ROOT, "swordworld25", "module", "helpers", "conditions.mjs"), "utf8")
  .matchAll(/\{ id: "(\w+)"/g)].map(m => m[1]));

/** Validated list of status ids. */
function statuses(list, context) {
  return (list ?? []).filter(id => {
    if ( STATUS_IDS.has(id) ) return true;
    warn(`${context}: unknown status "${id}"`);
    return false;
  });
}

const int = (v, d = null) => (Number.isFinite(Number(v)) && (v !== null) && (v !== "") ? Math.trunc(Number(v)) : d);
const str = (v, d = "") => ((v === null) || (v === undefined)) ? d : String(v);

function duration(d) {
  if ( !d ) return { text: "", unit: "instant", value: null };
  let unit = d.unit ?? "instant";
  let value = int(d.value);
  if ( unit === "years" ) { unit = "days"; value = (value ?? 1) * 365; }
  if ( unit === "seconds" ) { unit = "rounds"; value = Math.max(1, Math.round((value ?? 10) / 10)); }
  return { text: str(d.text), unit, value };
}

function target(tg) {
  return {
    text: str(tg?.text), kind: str(tg?.kind, "character"), areaCount: str(tg?.areaCount),
    radius: int(tg?.radius), count: str(tg?.count)
  };
}

function rangeArea(r) {
  return {
    text: str(r?.text), range: str(r?.range, "ranged"), areas: int(r?.areas), meters: int(r?.meters),
    area: str(r?.area, "none")
  };
}

function baseSystem(e, context) {
  return {
    summary: str(e.summary),
    description: toHtml(e.description, sourceLine(e.source)),
    source: { book: str(e.source?.book), page: int(e.source?.page) },
    modifiers: modifiers(e.modifiers, context)
  };
}

/** Build an Item document. */
function itemDoc(pack, type, e, system, { img, folder, effects = [], idSeed } = {}) {
  const _id = makeId(pack, type, idSeed ?? e.name);
  return {
    _id,
    _key: `!items!${_id}`,
    name: e.name,
    type,
    img: img ?? "icons/svg/item-bag.svg",
    system,
    effects,
    folder: folder ?? null,
    sort: 0,
    ownership: { default: 0 },
    flags: {},
    _stats: STATS
  };
}

/** Build a Folder document. */
function folderDoc(pack, type, name, { parent = null, color = null, sort = 0 } = {}) {
  const _id = makeId(pack, "folder", parent ?? "", name);
  return {
    _id, _key: `!folders!${_id}`, name, type, folder: parent, sorting: "a", sort, color,
    description: "", flags: {}, _stats: STATS
  };
}

/* -------------------------------------------- */
/*  Icons                                       */
/* -------------------------------------------- */

const WEAPON_ICONS = {
  sword: "icons/weapons/swords/sword-guard-brown.webp",
  axe: "icons/weapons/axes/axe-battle-black.webp",
  spear: "icons/weapons/polearms/spear-flared-steel.webp",
  mace: "icons/weapons/maces/mace-round-spiked-black.webp",
  staff: "icons/weapons/staves/staff-simple.webp",
  flail: "icons/weapons/maces/flail-ball-grey.webp",
  warhammer: "icons/weapons/hammers/hammer-war-spiked.webp",
  wrestling: "icons/weapons/fist/fist-knuckles-brass.webp",
  throw: "icons/weapons/thrown/dagger-simple.webp",
  bow: "icons/weapons/bows/shortbow-recurve.webp",
  crossbow: "icons/weapons/crossbows/crossbow-simple-brown.webp",
  blowgun: "icons/weapons/ammunition/arrow-simple.webp",
  gun: "icons/weapons/guns/gun-pistol-flintlock-metal.webp"
};
const ARMOR_ICONS = {
  nonmetal: "icons/equipment/chest/breastplate-banded-leather-brown.webp",
  metal: "icons/equipment/chest/breastplate-banded-steel.webp",
  shield: "icons/equipment/shield/buckler-wooden-boss-brown.webp"
};
const GEAR_ICONS = {
  accessory: "icons/equipment/neck/amulet-carved-stone-eye.webp",
  classItem: "icons/sundries/books/book-embossed-bound-brown.webp",
  herb: "icons/consumables/plants/leaf-herb-green.webp",
  potion: "icons/consumables/potions/bottle-round-corked-red.webp",
  ammo: "icons/weapons/ammunition/arrows-bodkin-yellow-red.webp",
  tool: "icons/tools/hand/lockpicks-steel-grey.webp",
  gear: "icons/containers/bags/pack-leather-brown.webp",
  improvement: "icons/tools/smithing/anvil.webp",
  golemItem: "icons/commodities/gems/gem-cluster-red.webp",
  mountItem: "icons/environment/creatures/horse-brown.webp",
  other: "icons/containers/bags/pack-leather-brown.webp"
};
const MAGIC_ICONS = {
  truespeech: "icons/magic/symbols/runes-star-pentagon-blue.webp",
  spiritualism: "icons/magic/control/silhouette-hold-change-blue.webp",
  divine: "icons/magic/holy/prayer-hands-glowing-yellow.webp",
  magitech: "icons/commodities/tech/cog-large-steel-white.webp",
  fairy: "icons/magic/nature/leaf-glow-teal.webp"
};
const FAIRY_ICONS = {
  earth: "icons/magic/earth/barrier-stone-brown-green.webp",
  water: "icons/magic/water/barrier-ice-crystal-wall-jagged-blue.webp",
  fire: "icons/magic/fire/flame-burning-campfire-orange.webp",
  wind: "icons/magic/air/wind-tornado-wall-blue.webp",
  light: "icons/magic/light/beam-rays-yellow.webp",
  dark: "icons/magic/unholy/orb-glowing-purple.webp"
};
const MONSTER_ICONS = {
  barbarous: "icons/creatures/magical/humanoid-horned-rider.webp",
  animal: "icons/creatures/mammals/wolf-howl-moon-black.webp",
  plant: "icons/magic/nature/tree-animated-strike.webp",
  undead: "icons/creatures/magical/humanoid-silhouette-dashing-blue.webp",
  construct: "icons/creatures/magical/construct-golem-stone-blue.webp",
  magitech: "icons/commodities/tech/cog-large-steel-white.webp",
  mythicalBeast: "icons/creatures/reptiles/dragon-winged-blue.webp",
  fairy: "icons/magic/nature/leaf-glow-teal.webp",
  daemon: "icons/creatures/unholy/demon-horned-winged-laughing.webp",
  humanoid: "icons/environment/people/commoner.webp",
  golem: "icons/creatures/magical/construct-stone-earth-gray.webp",
  familiar: "icons/creatures/birds/corvid-watchful-glowing-green.webp"
};
const CLASS_ICONS = {
  fighter: "icons/weapons/swords/sword-guard-brown.webp",
  grappler: "icons/weapons/fist/fist-knuckles-brass.webp",
  fencer: "icons/weapons/swords/scimitar-guard-brown.webp",
  marksman: "icons/weapons/bows/shortbow-recurve.webp",
  sorcerer: MAGIC_ICONS.truespeech,
  conjurer: MAGIC_ICONS.spiritualism,
  priest: MAGIC_ICONS.divine,
  artificer: MAGIC_ICONS.magitech,
  fairytamer: MAGIC_ICONS.fairy,
  scout: "icons/tools/hand/lockpicks-steel-grey.webp",
  ranger: "icons/consumables/plants/leaf-herb-green.webp",
  sage: "icons/sundries/books/book-embossed-bound-brown.webp",
  enhancer: "icons/magic/control/buff-strength-muscle-damage-orange.webp",
  bard: "icons/tools/instruments/lute-gold-brown.webp",
  rider: "icons/environment/creatures/horse-brown.webp",
  alchemist: "icons/sundries/gaming/playing-cards-grey.webp"
};

/* -------------------------------------------- */
/*  Converters                                  */
/* -------------------------------------------- */

function raceDocs() {
  return readJson("races.json").map(e => itemDoc("races", "race", e, {
    ...baseSystem(e, `race ${e.name}`),
    description: toHtml([e.summary, `Languages: ${e.languages}`].join("\n\n"),
      `<ul>${(e.traits ?? []).map(t => `<li><strong>${escapeHtml(t.name)}</strong>${t.level > 1 ? ` (Adv. Lv ${t.level}+)` : ""}: ${escapeHtml(t.description)}</li>`).join("")}</ul>${sourceLine(e.source)}`),
    key: e.key,
    extraCheckOptions: (e.extraCheckOptions ?? []).map(o => ({ check: o.check, source: o.source ?? "adventurer", ability: o.ability ?? "", minLevel: o.minLevel ?? 1, trait: o.trait ?? "" })),
    abilityDice: e.abilityDice,
    backgrounds: (e.backgrounds ?? []).map(b => ({ roll: str(b.roll), name: str(b.name), classes: str(b.classes), skill: b.skill ?? 0, body: b.body ?? 0, mind: b.mind ?? 0, exp: b.exp ?? 0, gmOnly: !!b.gmOnly })),
    languages: str(e.languages),
    restrictedClasses: e.restrictedClasses ?? [],
    traits: (e.traits ?? []).map(t => ({
      name: t.name, level: t.level ?? 1, description: t.description, modifiers: modifiers(t.modifiers, `race ${e.name} / ${t.name}`)
    })),
    darkvision: !!e.darkvision,
    noMP: !!e.noMP
  }, { img: icon("icons/environment/people/group.webp") }));
}

function classDocs() {
  return readJson("classes.json").map(e => itemDoc("classes", "class", e, {
    ...baseSystem(e, `class ${e.name}`),
    key: e.key,
    category: e.category,
    track: e.track,
    level: 1,
    magic: str(e.magic),
    attack: { melee: !!e.attack?.melee, wrestlingOnly: !!e.attack?.wrestlingOnly, thrown: !!e.attack?.thrown, shooting: !!e.attack?.shooting },
    evasion: !!e.evasion,
    halfStrength: !!e.halfStrength,
    critical: e.critical ?? 0,
    abilityType: str(e.abilityType),
    extraChecks: [],
    autoFeats: e.autoFeats ?? [],
    languages: str(e.languages)
  }, { img: icon(CLASS_ICONS[e.key]) }));
}

function featDocs() {
  const pack = "feats";
  const folders = {
    passive: folderDoc(pack, "Item", "Passive (selective)", { sort: 1 }),
    active: folderDoc(pack, "Item", "Active (declared)", { sort: 2 }),
    major: folderDoc(pack, "Item", "Major Action", { sort: 3 }),
    automatic: folderDoc(pack, "Item", "Automatically acquired", { sort: 4 })
  };
  const docs = readJson("feats.json").map(e => {
    const auto = e.acquisition === "automatic";
    const folder = auto ? folders.automatic : folders[e.featType] ?? folders.passive;
    const img = { active: "icons/skills/melee/strike-sword-steel-yellow.webp", major: "icons/skills/targeting/crosshair-pointed-orange.webp" }[e.featType] ?? "icons/skills/melee/weapons-crossed-swords-yellow.webp";
    return itemDoc(pack, "feat", e, {
      ...baseSystem(e, `feat ${e.name}`),
      featType: e.featType,
      acquisition: e.acquisition,
      combatPrep: !!e.combatPrep,
      prerequisites: {
        text: str(e.prerequisites?.text),
        advLevel: int(e.prerequisites?.advLevel),
        classes: (e.prerequisites?.classes ?? []).map(c => ({ class: c.class, level: c.level ?? 1, count: c.count ?? 1 })),
        feats: e.prerequisites?.feats ?? [],
        featsAnyOf: e.prerequisites?.featsAnyOf ?? []
      },
      autoGain: {
        class: str(e.autoGain?.class), level: int(e.autoGain?.level),
        alt: (e.autoGain?.alt ?? []).map(a => ({ class: a.class, level: a.level }))
      },
      use: str(e.use),
      application: str(e.application),
      risk: { text: str(e.risk?.text), modifiers: modifiers(e.risk?.modifiers, `feat risk ${e.name}`) },
      choice: str(e.choice),
      choiceValue: ""
    }, { img: icon(img), folder: folder._id });
  });
  return [...Object.values(folders), ...docs];
}

function spellDocs() {
  const pack = "spells";
  const out = [];
  const systems = [
    ["truespeech", "Truespeech Magic"], ["spiritualism", "Spiritualism Magic"], ["divine", "Divine Magic"],
    ["magitech", "Magitech"], ["fairy", "Fairy Magic"]
  ];
  let sort = 0;
  for ( const [sys, label] of systems ) {
    const root = folderDoc(pack, "Item", label, { sort: ++sort });
    out.push(root);
    const sub = {};
    const subFolder = (name, s) => {
      if ( !sub[name] ) {
        sub[name] = folderDoc(pack, "Item", name, { parent: root._id, sort: s });
        out.push(sub[name]);
      }
      return sub[name]._id;
    };
    for ( const e of readJson(`spells/${sys}.json`) ) {
      let folder = root._id;
      if ( sys === "divine" ) {
        if ( e.subsystem === "special" ) folder = subFolder(`Specialized: ${e.deity}`, 10);
        else if ( e.barbarous ) folder = subFolder("Barbarous priests", 5);
        else folder = subFolder("Basic Divine Magic", 1);
      } else if ( sys === "fairy" ) {
        const names = { basic: "Basic Fairy Magic", earth: "Earth", water: "Water/Ice", fire: "Fire", wind: "Wind", light: "Light", dark: "Darkness" };
        folder = subFolder(names[e.subsystem] ?? "Other", Object.keys(names).indexOf(e.subsystem) + 1);
      }
      const eff = e.effect ?? {};
      const img = sys === "fairy" && FAIRY_ICONS[e.subsystem] ? FAIRY_ICONS[e.subsystem] : MAGIC_ICONS[sys];
      out.push(itemDoc(pack, "spell", e, {
        ...baseSystem(e, `spell ${e.name}`),
        magic: sys,
        subsystem: str(e.subsystem),
        deity: str(e.deity),
        barbarous: !!e.barbarous,
        level: int(e.level, 1),
        cost: { mp: int(e.cost?.mp), text: str(e.cost?.text) },
        minorAction: !!e.minorAction,
        combatPrep: !!e.combatPrep,
        target: target(e.target),
        rangeArea: rangeArea(e.rangeArea),
        duration: duration(e.duration),
        resistance: str(e.resistance, "none"),
        types: e.types ?? [],
        magisphere: str(e.magisphere),
        effect: {
          kind: str(eff.kind, "utility"),
          power: int(eff.power),
          critical: int(eff.critical),
          damageKind: str(eff.damageKind),
          addMagicPower: eff.addMagicPower !== false,
          fixed: int(eff.fixed),
          formula: str(eff.formula),
          undeadDamage: !!eff.undeadDamage,
          mpDamage: !!eff.mpDamage,
          statuses: statuses(eff.statuses, `spell ${e.name}`),
          removeStatuses: statuses(eff.removeStatuses, `spell ${e.name}`),
          removeTypes: eff.removeTypes ?? [],
          raiseCurrent: !!eff.raiseCurrent,
          perTurn: ["target", "caster"].includes(eff.perTurn) ? eff.perTurn : "",
          variants: (eff.variants ?? []).map(v => ({
            ...v,
            ...(v.modifiers ? { modifiers: modifiers(v.modifiers, `spell ${e.name} / ${v.label}`) } : {}),
            ...(v.statuses ? { statuses: statuses(v.statuses, `spell ${e.name} / ${v.label}`) } : {}),
            ...(v.duration ? { duration: duration(v.duration) } : {})
          }))
        }
      }, { img: icon(img), folder, idSeed: `${sys}|${e.deity ?? ""}|${e.name}` }));
    }
  }
  return out;
}

function classAbilityDocs() {
  const pack = "class-abilities";
  const out = [];
  const folders = {
    technique: folderDoc(pack, "Item", "Enhancer: Techniques", { sort: 1 }),
    spellsong: folderDoc(pack, "Item", "Bard: Spellsongs", { sort: 2 }),
    finale: folderDoc(pack, "Item", "Bard: Finales", { sort: 3 }),
    stunt: folderDoc(pack, "Item", "Rider: Stunts", { sort: 4 }),
    evocation: folderDoc(pack, "Item", "Alchemist: Evocations", { sort: 5 })
  };
  out.push(...Object.values(folders));
  for ( const e of readJson("techniques.json") ) {
    out.push(itemDoc(pack, "technique", e, {
      ...baseSystem(e, `technique ${e.name}`),
      level: int(e.level, 1), combatPrep: !!e.combatPrep, mpCost: int(e.mpCost, 3), oncePerRound: !!e.oncePerRound,
      duration: duration(e.duration)
    }, { img: icon(CLASS_ICONS.enhancer), folder: folders.technique._id }));
  }
  const rhythm = r => ({ up: int(r?.up, 0), down: int(r?.down, 0), heart: int(r?.heart, 0) });
  for ( const e of readJson("spellsongs.json") ) {
    out.push(itemDoc(pack, "spellsong", e, {
      ...baseSystem(e, `spellsong ${e.name}`),
      level: int(e.level, 1), singing: !!e.singing, pets: e.pets ?? [],
      condition: { text: str(e.condition?.text), ...rhythm(e.condition) },
      resistance: str(e.resistance, "neg"), types: e.types ?? [],
      baseRhythm: rhythm(e.baseRhythm), flourish: int(e.flourish), extraRhythm: rhythm(e.extraRhythm),
      duration: { text: "10 seconds (1 r)", unit: "rounds", value: 1 }
    }, { img: icon(CLASS_ICONS.bard), folder: folders.spellsong._id }));
  }
  for ( const e of readJson("finales.json") ) {
    const eff = e.effect ?? {};
    out.push(itemDoc(pack, "finale", e, {
      ...baseSystem(e, `finale ${e.name}`),
      level: int(e.level, 1), cost: rhythm(e.cost), resistance: str(e.resistance, "half"), types: e.types ?? [],
      targets: str(e.targets),
      effect: {
        kind: str(eff.kind, "damage"), power: int(eff.power), critical: int(eff.critical), damageKind: str(eff.damageKind),
        addMagicPower: eff.addMagicPower !== false, fixed: null, formula: "", undeadDamage: false, mpDamage: false, variants: []
      }
    }, { img: icon("icons/tools/instruments/harp-yellow-teal.webp"), folder: folders.finale._id }));
  }
  for ( const e of readJson("stunts.json") ) {
    out.push(itemDoc(pack, "stunt", e, {
      ...baseSystem(e, `stunt ${e.name}`),
      level: int(e.level, 1), action: str(e.action, "passive"), prerequisites: e.prerequisites ?? [],
      mounts: e.mounts ?? [], area: str(e.area, "none")
    }, { img: icon(CLASS_ICONS.rider), folder: folders.stunt._id }));
  }
  for ( const e of readJson("evocations.json") ) {
    const rank = r => (r ? { available: true, text: str(r.text), value: int(r.value), power: int(r.power) }
      : { available: false, text: "", value: null, power: null });
    const sys = baseSystem(e, `evocation ${e.name}`);
    out.push(itemDoc(pack, "evocation", e, {
      ...sys,
      level: int(e.level, 1), minorAction: !!e.minorAction, combatPrep: !!e.combatPrep,
      cards: { colors: e.cards?.colors ?? [], count: int(e.cards?.count, 1), text: str(e.cards?.text) },
      target: target(e.target), rangeArea: rangeArea(e.rangeArea), duration: duration(e.duration),
      resistance: str(e.resistance, "optional"),
      types: e.types ?? [],
      ranks: { B: rank(e.ranks?.B), A: rank(e.ranks?.A), S: rank(e.ranks?.S), SS: rank(e.ranks?.SS) },
      modifierKey: MODIFIER_KEYS.has(e.modifierKey) ? e.modifierKey : "",
      modifierTarget: e.modifierTarget === "self" ? "self" : "target",
      modifierCondition: str(e.modifierCondition),
      rankEffect: ["healHP", "healMP", "check", "duration"].includes(e.rankEffect) ? e.rankEffect : "",
      turnOfUser: !!e.turnOfUser
    }, { img: icon(CLASS_ICONS.alchemist), folder: folders.evocation._id }));
  }
  return out;
}

function weaponDocs() {
  const pack = "weapons";
  const out = [];
  const folders = {};
  const folderFor = (key, label, s) => (folders[key] ??= folderDoc(pack, "Item", label, { sort: s }));
  const labels = { sword: "Swords", axe: "Axes", spear: "Spears", mace: "Maces", staff: "Staves", flail: "Flails", warhammer: "Warhammers", wrestling: "Wrestling", throw: "Thrown", bow: "Bows", crossbow: "Crossbows", blowgun: "Blowguns", gun: "Guns", shield: "Shield weapons", ammo: "Ammunition" };
  const order = Object.keys(labels);
  for ( const e of readJson("weapons.json") ) {
    const category = e.categories?.[0] ?? "shield";
    const folder = folderFor(category, labels[category] ?? category, order.indexOf(category) + 1);
    out.push(itemDoc(pack, "weapon", e, {
      ...baseSystem(e, `weapon ${e.name}`),
      price: int(e.price), priceText: str(e.priceText), reputation: int(e.reputation), quantity: 1,
      magic: !!e.magic, equipped: false,
      categories: e.categories ?? [], category: e.categories?.[0] ?? "",
      rank: str(e.rank, "B"), edged: !!e.edged, blunt: !!e.blunt, silver: !!e.silver, grapplerOnly: !!e.grapplerOnly,
      range: str(e.range), defenseBonus: int(e.defenseBonus, 0), implement: category === "staff",
      magazine: int(e.magazine), loaded: 0,
      modes: (e.modes ?? []).map(m => ({
        label: str(m.label), stance: str(m.stance, "1H"), minStr: int(m.minStr, 1), accuracy: int(m.accuracy, 0),
        power: int(m.power), critical: int(m.critical, 10), extraDamage: int(m.extraDamage, 0)
      })),
      mode: 0, attackClass: ""
    }, { img: icon(WEAPON_ICONS[category] ?? WEAPON_ICONS.sword), folder: folder._id }));
  }
  const ammoFolder = folderFor("ammo", labels.ammo, 99);
  for ( const e of readJson("ammo.json") ) out.push(gearItem(pack, e, ammoFolder._id));
  return [...Object.values(folders), ...out];
}

function armorDocs() {
  const pack = "armor";
  const folders = {
    nonmetal: folderDoc(pack, "Item", "Non-metallic Armor", { sort: 1 }),
    metal: folderDoc(pack, "Item", "Metal Armor", { sort: 2 }),
    shield: folderDoc(pack, "Item", "Shields", { sort: 3 })
  };
  const docs = readJson("armor.json").map(e => itemDoc(pack, "armor", e, {
    ...baseSystem(e, `armor ${e.name}`),
    price: int(e.price), priceText: str(e.priceText), reputation: int(e.reputation), quantity: 1,
    magic: !!e.magic, equipped: false,
    armorType: str(e.armorType, "nonmetal"), rank: str(e.rank, "B"), stance: str(e.stance),
    minStr: int(e.minStr, 1), evasion: int(e.evasion, 0), defense: int(e.defense, 0),
    grappler: ["may", "only"].includes(e.grappler) ? e.grappler : "", silver: !!e.silver
  }, { img: icon(ARMOR_ICONS[e.armorType] ?? ARMOR_ICONS.nonmetal), folder: (folders[e.armorType] ?? folders.nonmetal)._id }));
  return [...Object.values(folders), ...docs];
}

/** One gear item. */
function gearItem(pack, e, folder) {
  const type = e.itemType ?? "gear";
  const mako = /mako stone/i.test(e.name) ? (() => {
    const m = e.name.match(/(\d+)\s*[-–]\s*(\d+)\s*pts?/i) ?? e.name.match(/(\d+)\s*pts?/i);
    const max = m ? Number(m[2] ?? m[1]) : 0;
    return { value: max, max };
  })() : { value: 0, max: 0 };
  let slot = (e.slot ?? []).map(s => (s === "right hand" ? "rightHand" : s === "left hand" ? "leftHand" : s));
  const consumable = !!e.consumable || ["potion", "herb", "ammo"].includes(type);
  const desc = e.mount ? `${e.description ?? ""}\n\nMount item — ${[e.mount.category, (e.mount.classifications ?? []).join("/")].filter(Boolean).join(", ")}` : e.description;
  return itemDoc(pack, "gear", { ...e, description: desc }, {
    ...baseSystem({ ...e, description: desc }, `gear ${e.name}`),
    price: int(e.price), priceText: str(e.priceText), reputation: int(e.reputation),
    quantity: type === "ammo" ? 12 : 1, magic: !!e.magic, equipped: false,
    itemType: type, slot, equippedSlot: "", stance: str(e.stance), consumable,
    uses: { value: null, max: null },
    use: {
      kind: str(e.use?.kind, "none"), power: int(e.use?.power), critical: int(e.use?.critical),
      extra: int(e.use?.extra, 0), bonus: str(e.use?.bonus)
    },
    classReq: { class: str(e.classReq?.class), level: int(e.classReq?.level) },
    popularity: int(e.popularity), silver: !!e.silver, ammoFor: str(e.ammoFor),
    types: e.types ?? [],
    duration: e.duration ? duration(e.duration) : { text: "", unit: "instant", value: null },
    mako, card: { color: "", rank: "" }, capacity: null
  }, { img: icon(GEAR_ICONS[type] ?? GEAR_ICONS.gear), folder });
}

function gearDocs() {
  const pack = "gear";
  const folders = {};
  const labels = {
    gear: "General Equipment", accessory: "Accessories", classItem: "Class-specific Items", herb: "Herbs",
    potion: "Potions", tool: "Adventure Tools", improvement: "Weapon & Armor Improvements",
    golemItem: "Golem Enhancing Items", mountItem: "Mount Equipment", other: "Other", ammo: "Ammunition"
  };
  const order = Object.keys(labels);
  const folderFor = type => (folders[type] ??= folderDoc(pack, "Item", labels[type] ?? type, { sort: order.indexOf(type) + 1 }));
  const out = [];
  for ( const file of ["gear.json", "improvements.json", "mount-gear.json"] ) {
    for ( const e of readJson(file) ) {
      const type = e.itemType ?? "gear";
      out.push(gearItem(pack, e, folderFor(type)._id));
    }
  }
  return [...Object.values(folders), ...out];
}

function effectDocs() {
  return readJson("effects.json").map(e => itemDoc("effects", "effect", e, {
    summary: e.description, description: toHtml(e.description), source: { book: "", page: null },
    modifiers: modifiers(e.modifiers, `effect ${e.name}`),
    duration: duration(e.duration), statuses: e.statuses ?? [], stackable: false
  }, { img: icon(e.img, "icons/svg/aura.svg") }));
}

/* -------------------------------------------- */
/*  Actors                                      */
/* -------------------------------------------- */

function abilityItem(actorId, pack, a, index, owner) {
  const _id = makeId(pack, owner, "ability", index, a.name);
  const tags = a.tags ?? [];
  const img = tags.includes("major") ? "icons/skills/melee/strike-slashes-red.webp"
    : tags.includes("minor") ? "icons/magic/movement/trail-streak-zigzag-yellow.webp"
      : tags.includes("declared") ? "icons/skills/social/intimidation-impressing.webp"
        : "icons/magic/defensive/shield-barrier-glowing-triangle-blue.webp";
  const spell = a.spellcasting;
  const mapSystem = s => {
    const k = String(s ?? "").toLowerCase();
    if ( k.includes("truespeech") ) return "truespeech";
    if ( k.includes("spiritual") ) return "spiritualism";
    if ( k.includes("divine") ) return "divine";
    if ( k.includes("magitech") ) return "magitech";
    if ( k.includes("fairy") ) return "fairy";
    return k;
  };
  const damage = a.damage ?? {};
  return {
    _id,
    _key: `!actors.items!${actorId}.${_id}`,
    name: a.name,
    type: "ability",
    img: icon(img),
    system: {
      summary: str(a.summary),
      description: toHtml(a.description),
      source: { book: "", page: null },
      modifiers: modifiers(a.modifiers, `ability ${owner}/${a.name}`),
      tags,
      section: str(a.section),
      check: {
        value: int(a.check?.value), vs: str(a.check?.vs), result: str(a.check?.result), base: str(a.check?.base)
      },
      damage: {
        formula: str(damage.formula), kind: str(damage.kind), types: damage.types ?? [],
        power: int(damage.power), critical: int(damage.critical), bonus: str(damage.bonus)
      },
      spellcasting: spell ? {
        system: mapSystem(spell.system), level: int(spell.level), power: int(spell.power), deity: str(spell.deity)
      } : { system: "", level: null, power: null, deity: "" },
      fairyTypes: a.fairyTypes ?? [],
      rangeArea: rangeArea(a.rangeArea),
      target: target(a.target),
      prerequisite: str(a.prerequisite),
      enhance: str(a.enhance),
      risk: { text: str(a.risk?.text), modifiers: a.risk?.modifiers ?? [] }
    },
    effects: [],
    folder: null,
    sort: index * 100,
    ownership: { default: 0 },
    flags: {},
    _stats: STATS
  };
}

/**
 * Sections of a bestiary entry. Identical parts ("Horse x 2") become separate sections, each with its own HP
 * and MP; a variable count ("3-5" petals) gives its minimum and keeps the book range for the section line.
 * @param {object[]} list
 * @returns {object[]}
 */
function sectionsFrom(list = []) {
  return list.flatMap(s => {
    let count = s.count ?? 1;
    let countRange = "";
    if ( typeof count === "string" ) {
      const m = count.match(/\d+/);
      countRange = count.replace(/\s+/g, "").replace("-", "–");
      count = m ? Number(m[0]) : 1;
    }
    const section = {
      name: str(s.name), style: str(s.style),
      accuracy: int(s.accuracy), damage: str(s.damage), evasion: int(s.evasion), defense: int(s.defense, 0),
      hp: { value: int(s.hp, 0), max: int(s.hp, 0) }, mp: { value: int(s.mp, 0) ?? 0, max: int(s.mp, 0) ?? 0 },
      main: !!s.main, disabled: false, countRange, statIndex: null
    };
    return Array.from({ length: Math.max(1, count) }, () => structuredClone(section));
  });
}

function golemNotes(g) {
  if ( !g ) return "";
  const mat = g.materials ?? {};
  const rows = [
    ["Required Conjurer level", g.conjurerLevel], ["MP", g.mp],
    ["Normal material", mat.normal ? `${mat.normal.name} (${mat.normal.price}G)` : "—"],
    ["Advanced material", mat.advanced ? `${mat.advanced.name} (${mat.advanced.price}G)` : "—"],
    ["Enhancing items (max)", g.enhancingSlots], ["Enhancing item grade", g.enhancingGrade],
    ["Allowed enhancing items", (g.enhancingItems ?? []).join(", ")]
  ].filter(r => (r[1] !== undefined) && (r[1] !== null) && (r[1] !== ""));
  return `<h3>Golem</h3><table>${rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join("")}</table>`;
}

function monsterDoc(pack, e, folder) {
  const _id = makeId(pack, e.source?.book ?? "", e.name);
  const img = icon(MONSTER_ICONS[e.classification] ?? "icons/svg/mystery-man.svg", "icons/svg/mystery-man.svg");
  const sections = sectionsFrom(e.sections);
  return {
    _id,
    _key: `!actors!${_id}`,
    name: e.name,
    type: "monster",
    img,
    system: {
      hp: { value: 0, max: 0 }, mp: { value: 0, max: 0 }, resources: {},
      classification: str(e.classification, "barbarous"),
      intelligence: str(e.intelligence), perception: str(e.perception), disposition: str(e.disposition),
      languages: Array.isArray(e.languages) ? e.languages.join(", ") : str(e.languages),
      habitat: str(e.habitat),
      weakPoint: { text: str(e.weakPoint?.text), kind: str(e.weakPoint?.kind), damageType: str(e.weakPoint?.damageType), value: int(e.weakPoint?.value, 0) },
      weakPointRevealed: false, identified: false,
      movement: { text: str(e.movement?.text), ground: int(e.movement?.ground), groundMode: str(e.movement?.groundMode), air: int(e.movement?.air), airMode: str(e.movement?.airMode) },
      useFixed: "default",
      details: {
        description: toHtml(e.description, golemNotes(e.golem) + sourceLine(e.source)),
        notes: "",
        source: { book: str(e.source?.book), page: int(e.source?.page) }
      },
      level: int(e.level, 1) ?? 1,
      soulscars: int(e.soulscars), reputation: int(e.reputation), weakness: int(e.weakness), initiative: int(e.initiative),
      fortitude: int(e.fortitude, 0) ?? 0, willpower: int(e.willpower, 0) ?? 0, swordShards: 0,
      sections: sections.length ? sections : [sectionFrom({ hp: 1 }, 0)],
      mainSection: str(e.mainSection),
      loot: (e.loot ?? []).map(l => ({
        roll: str(l.roll), min: int(l.min), max: int(l.max), item: str(l.item), price: int(l.price),
        priceText: str(l.priceText), cards: str(l.cards), quantity: str(l.quantity)
      }))
    },
    items: (e.abilities ?? []).map((a, i) => abilityItem(_id, pack, a, i, e.name)),
    effects: [],
    folder,
    sort: (e.level ?? 0) * 1000,
    ownership: { default: 0 },
    flags: {},
    prototypeToken: {
      name: e.name,
      displayName: 20,
      actorLink: false,
      disposition: -1,
      displayBars: 20,
      bar1: { attribute: "hp" },
      bar2: { attribute: "mp" },
      texture: { src: img },
      sight: { enabled: false }
    },
    _stats: STATS
  };
}

function bestiaryDocs() {
  const pack = "bestiary";
  const labels = {
    barbarous: "Barbarous", animal: "Animals", plant: "Plants", undead: "Undead", construct: "Constructs",
    magitech: "Magitech", mythicalBeast: "Mythical Beasts", fairy: "Fairies", daemon: "Daemons",
    humanoid: "Humanoids", golem: "Golems (Conjurer)", familiar: "Familiars"
  };
  const order = Object.keys(labels);
  const folders = {};
  const folderFor = cls => (folders[cls] ??= folderDoc(pack, "Actor", labels[cls] ?? cls, { sort: order.indexOf(cls) + 1 }));
  const docs = [];
  const seen = new Set();
  const files = fs.readdirSync(path.join(DATA, "monsters")).filter(f => f.endsWith(".json")).sort();
  for ( const file of files ) {
    for ( const e of readJson(`monsters/${file}`) ) {
      const key = `${e.source?.book}|${e.name}`;
      if ( seen.has(key) ) { warn(`duplicate monster ${key}`); continue; }
      seen.add(key);
      docs.push(monsterDoc(pack, e, folderFor(e.classification)._id));
    }
  }
  return [...Object.values(folders), ...docs];
}

function mountDocs() {
  const pack = "mounts";
  const folders = {
    animal: folderDoc(pack, "Actor", "Animals", { sort: 1 }),
    mythicalBeast: folderDoc(pack, "Actor", "Mythical Beasts", { sort: 2 }),
    magitech: folderDoc(pack, "Actor", "Magitech", { sort: 3 })
  };
  const docs = readJson("mounts.json").map(e => {
    const _id = makeId(pack, e.name);
    const img = icon(e.classification === "magitech" ? "icons/commodities/tech/cog-large-steel-white.webp"
      : e.classification === "mythicalBeast" ? "icons/creatures/reptiles/dragon-winged-blue.webp" : "icons/environment/creatures/horse-brown.webp");
    const levels = (e.levels ?? []).map(l => ({
      level: int(l.level, 1), fortitude: int(l.fortitude, 0), willpower: int(l.willpower, 0),
      sections: (l.sections ?? []).map(s => ({
        style: str(s.style), accuracy: int(s.accuracy), damage: str(s.damage), evasion: int(s.evasion),
        defense: int(s.defense, 0) ?? 0, hp: int(s.hp, 0) ?? 0, mp: int(s.mp, 0) ?? 0
      }))
    }));
    const first = levels[0];
    // One section per part (two wings = two sections); statIndex points at the part's stat line in a level row
    const sections = (e.sections?.length ? e.sections : [{ name: "", main: false }]).flatMap((s, i) => {
      const section = {
        name: str(s.name), style: first?.sections[i]?.style ?? "", accuracy: null, damage: "", evasion: null, defense: 0,
        hp: { value: first?.sections[i]?.hp ?? 0, max: first?.sections[i]?.hp ?? 0 },
        mp: { value: first?.sections[i]?.mp ?? 0, max: first?.sections[i]?.mp ?? 0 },
        main: !!s.main, disabled: false, countRange: "", statIndex: i
      };
      const count = (typeof s.count === "number") ? Math.max(1, s.count) : 1;
      return Array.from({ length: count }, () => structuredClone(section));
    });
    return {
      _id, _key: `!actors!${_id}`, name: e.name, type: "mount", img,
      system: {
        hp: { value: 0, max: 0 }, mp: { value: 0, max: 0 }, resources: {},
        classification: str(e.classification, "animal"), intelligence: str(e.intelligence), perception: str(e.perception),
        disposition: "", languages: Array.isArray(e.languages) ? e.languages.join(", ") : str(e.languages), habitat: "",
        weakPoint: { text: str(e.weakPoint?.text), kind: str(e.weakPoint?.kind), damageType: str(e.weakPoint?.damageType), value: int(e.weakPoint?.value, 0) },
        weakPointRevealed: false, identified: true,
        movement: { text: str(e.movement?.text), ground: int(e.movement?.ground), groundMode: str(e.movement?.groundMode), air: int(e.movement?.air), airMode: str(e.movement?.airMode) },
        useFixed: "default",
        details: {
          description: toHtml(e.description, (e.renownedOf ? `<p>Renowned version of <strong>${escapeHtml(e.renownedOf)}</strong>.</p>` : "") + sourceLine(e.source)),
          notes: "", source: { book: str(e.source?.book), page: int(e.source?.page) }
        },
        level: int(e.levelMin, 1), soulscars: null, reputation: null, weakness: null, initiative: null,
        fortitude: first?.fortitude ?? 0, willpower: first?.willpower ?? 0, swordShards: 0,
        sections, mainSection: str(e.mainSection), loot: [],
        price: { buy: int(e.price?.buy), rent: int(e.price?.rent), regen: int(e.price?.regen), reputation: int(e.price?.reputation) },
        levelMin: int(e.levelMin, 1), levelMax: int(e.levelMax, 1), levels, jockey: "", proprietary: false, autoLevel: true
      },
      items: (e.abilities ?? []).map((a, i) => abilityItem(_id, pack, a, i, e.name)),
      effects: [], folder: (folders[e.classification] ?? folders.animal)._id, sort: (e.levelMin ?? 1) * 1000,
      ownership: { default: 0 }, flags: {},
      prototypeToken: {
        name: e.name, displayName: 20, actorLink: false, disposition: 1, displayBars: 20,
        bar1: { attribute: "hp" }, bar2: { attribute: "mp" }, texture: { src: img }, sight: { enabled: false }
      },
      _stats: STATS
    };
  });
  return [...Object.values(folders), ...docs];
}

function macroDocs() {
  return readJson("macros.json").map(e => {
    const _id = makeId("macros", e.name);
    return {
      _id, _key: `!macros!${_id}`, name: e.name, type: "script", img: icon(e.img, "icons/svg/dice-target.svg"),
      command: e.command, scope: "global", author: null, folder: null, sort: 0, ownership: { default: 0 }, flags: {},
      _stats: STATS
    };
  });
}

/* -------------------------------------------- */
/*  Sample characters (Easy Creation)           */
/* -------------------------------------------- */

/** Experience table (module/config.mjs SW25.expTable). */
const EXP_TABLE = {
  major: [0, 1000, 1000, 1500, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7500, 9000, 10500, 12000, 13500],
  minor: [0, 500, 1000, 1000, 1500, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7500, 9000, 10500, 12000]
};
const ABILITIES = ["dex", "agi", "str", "vit", "int", "spi"];
const RANK_KEYS = ["none", "dagger", "rapier", "broadsword", "greatsword", "flamberge", "sentinel", "hyperion", "genesis"];
const CARD_COLORS = ["red", "green", "black", "white", "gold"];
const CARD_RANKS = ["B", "A", "S", "SS"];
const SLOTS = new Set(["head", "face", "ear", "neck", "back", "rightHand", "leftHand", "waist", "feet", "other"]);
const ROLE_LINES = new Set(["front", "frontSupport", "rear"]);

/** Loose name key: case, brackets, quotes and spacing do not matter. */
const nameKey = s => String(s ?? "").toLowerCase().replace(/[’‘`]/g, "'").replace(/[[\]]/g, "")
  .replace(/\s+/g, " ").trim();

/**
 * Compendium entries by document type and name, for resolving the names of the sample characters.
 * @returns {Record<string, Map<string, {pack: string, doc: object}>>}
 */
function compendiumLookup() {
  const sources = {
    races: raceDocs, classes: classDocs, feats: featDocs, "class-abilities": classAbilityDocs,
    weapons: weaponDocs, armor: armorDocs, gear: gearDocs, mounts: mountDocs
  };
  const byType = {};
  for ( const [pack, builder] of Object.entries(sources) ) {
    for ( const doc of builder() ) {
      if ( doc._key.startsWith("!folders") ) continue;
      const map = (byType[doc.type] ??= new Map());
      if ( !map.has(nameKey(doc.name)) ) map.set(nameKey(doc.name), { pack, doc });
    }
  }
  return byType;
}

/**
 * Turn the transcribed sample characters (data/pregens.json) into swordworld25/packs/pregens.json: actor system
 * data plus the items to copy from the compendiums (by UUID, with per-character changes). Read by the
 * "Choose a sample character" window of the character sheet.
 * @returns {object[]}
 */
function pregenDocs() {
  const lookup = compendiumLookup();
  const uuidOf = ({ pack, doc }) => `Compendium.swordworld25.${pack}.${doc._key.startsWith("!actors") ? "Actor" : "Item"}.${doc._id}`;
  const find = (types, name) => {
    for ( const type of types ) {
      const hit = lookup[type]?.get(nameKey(name));
      if ( hit ) return hit;
    }
    return null;
  };
  const deities = readJson("deities.json");
  const out = [];
  const ids = new Set();
  for ( const p of readJson("pregens.json") ) {
    const ctx = `pregen ${p.id}`;
    if ( ids.has(p.id) ) throw new Error(`Duplicate pregen id ${p.id}`);
    ids.add(p.id);
    const items = [];
    const missing = [];
    /** Add a compendium item (or a plain stand-in when the name is unknown). */
    const add = (types, name, system = {}, rename) => {
      const hit = find(types, name);
      if ( !hit ) {
        warn(`${ctx}: no ${types.join("/")} named "${name}"`);
        missing.push(name);
        const type = ["weapon", "armor"].includes(types[0]) ? types[0] : "gear";
        items.push({ uuid: null, type, name: rename ?? name, system });
        return null;
      }
      items.push({ uuid: uuidOf(hit), type: hit.doc.type, name: rename ?? hit.doc.name, system });
      return hit;
    };

    // Race, classes, feats, class abilities
    const race = find(["race"], p.race);
    if ( !race ) throw new Error(`${ctx}: unknown race "${p.race}"`);
    items.push({ uuid: uuidOf(race), type: "race", name: race.doc.name, system: {} });
    let spent = 0;
    const classes = [];
    for ( const c of p.classes ?? [] ) {
      const hit = add(["class"], c.name, { level: c.level });
      if ( !hit ) continue;
      classes.push({ name: hit.doc.name, key: hit.doc.system.key, level: c.level, img: hit.doc.img });
      const table = EXP_TABLE[hit.doc.system.track] ?? EXP_TABLE.minor;
      for ( let l = 1; l <= c.level; l++ ) spent += table[l];
    }
    classes.sort((a, b) => b.level - a.level);
    const level = Math.max(0, ...classes.map(c => c.level));
    if ( p.printed?.level && (p.printed.level !== level) ) warn(`${ctx}: adventurer level ${level} ≠ printed ${p.printed.level}`);
    // Feats: a name, or { name, choice } for feats with a chosen category (Weapon Proficiency A/Sword…)
    const feats = new Set();
    for ( const feat of [...(p.feats ?? []), ...(p.autoFeats ?? [])] ) {
      const name = feat?.name ?? feat;
      if ( feats.has(nameKey(name)) ) continue;
      feats.add(nameKey(name));
      add(["feat"], name, feat?.choice ? { choiceValue: str(feat.choice) } : {});
    }
    for ( const a of p.classAbilities ?? [] ) add([a.type], a.name);

    // Equipment
    for ( const w of p.weapons ?? [] ) {
      const hit = find(["weapon"], w.name);
      if ( !hit ) {
        add(["weapon"], w.name, { equipped: !!w.equipped, quantity: int(w.quantity, 1) });
        continue;
      }
      const modes = hit.doc.system.modes;
      const modeIndex = modes.findIndex(m => nameKey(m.label) === nameKey(w.mode));
      if ( w.mode && (modeIndex < 0) ) warn(`${ctx}: ${w.name} has no mode "${w.mode}"`);
      const system = { equipped: !!w.equipped, mode: Math.max(0, modeIndex), quantity: int(w.quantity, 1) };
      const enhance = int(w.enhance, 0);
      if ( enhance ) {
        system.magic = true;
        system.modes = modes.map(m => ({ ...m, accuracy: m.accuracy + enhance, extraDamage: m.extraDamage + enhance }));
      }
      if ( w.note ) system.summary = [hit.doc.system.summary, w.note].filter(Boolean).join(" — ");
      add(["weapon"], hit.doc.name, system, enhance ? `${hit.doc.name} +${enhance}` : undefined);
    }
    for ( const a of p.armor ?? [] ) {
      const hit = find(["armor"], a.name);
      // Some "Other" rows of the armor table are accessories or tools
      if ( !hit && find(["gear"], a.name) ) {
        add(["gear"], a.name, { equipped: true });
        continue;
      }
      const enhance = int(a.enhance, 0);
      const system = { equipped: a.equipped !== false };
      // Defense depending on the wearer (Mana Coat) is given as printed
      const defense = int(a.defense) ?? hit?.doc.system.defense;
      if ( hit && (enhance || (defense !== hit.doc.system.defense)) ) system.defense = defense + enhance;
      if ( hit && enhance ) system.magic = true;
      if ( hit && a.note ) system.summary = [hit.doc.system.summary, a.note].filter(Boolean).join(" — ");
      add(["armor"], a.name, system, (enhance && hit) ? `${hit.doc.name} +${enhance}` : undefined);
    }
    for ( const acc of p.accessories ?? [] ) {
      if ( !SLOTS.has(acc.slot) ) warn(`${ctx}: unknown slot "${acc.slot}" for ${acc.name}`);
      const hit = find(["gear", "weapon", "armor"], acc.name);
      const system = { equipped: true };
      if ( (hit?.doc.type ?? "gear") === "gear" ) system.equippedSlot = SLOTS.has(acc.slot) ? acc.slot : "";
      if ( acc.note ) system.summary = [hit?.doc.system.summary, acc.note].filter(Boolean).join(" — ");
      add(hit ? [hit.doc.type] : ["gear"], acc.name, system);
    }
    let abyssShards = 0;
    for ( const it of p.items ?? [] ) {
      // Abyss Shards are counted on the sheet, not carried as an item
      if ( /^abyss shards?$/i.test(String(it.name).trim()) ) {
        abyssShards += int(it.quantity, 1);
        continue;
      }
      const hit = find(["gear", "weapon", "armor"], it.name);
      add(hit ? [hit.doc.type] : ["gear"], it.name, { quantity: int(it.quantity, 1) });
    }

    // Actor data
    const cards = Object.fromEntries(CARD_COLORS.map(c => [c, Object.fromEntries(CARD_RANKS.map(r => [r, int(p.cards?.[c]?.[r], 0)]))]));
    const abilities = Object.fromEntries(ABILITIES.map(k => [k, { rolled: int(p.rolled?.[k], 0), growth: int(p.growth?.[k], 0), other: 0 }]));
    const rankIndex = RANK_KEYS.indexOf(nameKey(p.rank).replace(/[^a-z]/g, ""));
    const deity = p.deity ? (deities.find(d => nameKey(d.name) === nameKey(p.deity))?.name ?? p.deity) : "";
    const mountHit = p.mount?.name ? find(["mount"], p.mount.name) : null;
    if ( p.mount?.name && !mountHit ) warn(`${ctx}: unknown mount "${p.mount.name}"`);
    const roles = p.roles ?? {};
    if ( !ROLE_LINES.has(roles.line) ) warn(`${ctx}: missing role line`);

    out.push({
      id: p.id,
      name: p.name,
      tier: p.tier === "advanced" ? "advanced" : "starting",
      level,
      source: { book: str(p.source?.book), page: int(p.source?.page) },
      img: classes[0]?.img ?? race.doc.img,
      race: race.doc.name,
      background: str(p.background),
      classes: classes.map(({ name, key, level }) => ({ name, key, level })),
      roles: {
        line: ROLE_LINES.has(roles.line) ? roles.line : "front",
        healer: int(roles.healer, 0), explorer: int(roles.explorer, 0), knowledge: int(roles.knowledge, 0)
      },
      summary: str(p.summary),
      description: str(p.description),
      tips: p.tips ?? [],
      mount: mountHit ? { uuid: uuidOf(mountHit), name: mountHit.doc.name, level: int(p.mount.level) } : null,
      printed: p.printed ?? {},
      system: {
        details: { background: str(p.background) },
        base: { skill: int(p.base?.skill, 0), body: int(p.base?.body, 0), mind: int(p.base?.mind, 0) },
        abilities,
        exp: { value: int(p.exp, 0), total: spent + int(p.exp, 0) },
        money: int(p.money, 0), deposit: int(p.deposit, 0), debt: int(p.debt, 0),
        reputation: { value: int(p.reputation, 0), total: int(p.reputation, 0) },
        rank: Math.max(0, rankIndex),
        abyssShards,
        deity,
        fairyElements: p.fairyElements ?? [],
        cards,
        languages: (p.languages ?? []).map(l => ({ key: str(l.key), name: str(l.name), speak: l.speak !== false, write: l.write !== false }))
      },
      items,
      missing
    });
  }
  return out;
}

/** Write the sample characters file (plain JSON, no LevelDB: safe while a world is open). */
function buildPregens() {
  const pregens = pregenDocs();
  if ( !DRY ) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "pregens.json"), JSON.stringify({ version: systemJson.version, pregens }));
  }
  console.log(`  ${"pregens".padEnd(16)} ${String(pregens.length).padStart(4)} characters${DRY ? " (dry run)" : ""}`);
}

/* -------------------------------------------- */
/*  Main                                        */
/* -------------------------------------------- */

const PACKS = {
  races: raceDocs,
  classes: classDocs,
  feats: featDocs,
  spells: spellDocs,
  "class-abilities": classAbilityDocs,
  weapons: weaponDocs,
  armor: armorDocs,
  gear: gearDocs,
  effects: effectDocs,
  bestiary: bestiaryDocs,
  mounts: mountDocs,
  macros: macroDocs
};

const DRY = process.argv.includes("--dry");

async function build(name) {
  const docs = PACKS[name]();
  if ( DRY ) {
    const ids = new Set(docs.map(d => d._id));
    if ( ids.size !== docs.length ) throw new Error(`Duplicate ids in ${name}`);
    const count = docs.filter(d => !d._key.startsWith("!folders")).length;
    console.log(`  ${name.padEnd(16)} ${String(count).padStart(4)} documents (dry run)`);
    return;
  }
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const ids = new Set();
  for ( const doc of docs ) {
    if ( ids.has(doc._id) ) throw new Error(`Duplicate id ${doc._id} (${doc.name}) in ${name}`);
    ids.add(doc._id);
    fs.writeFileSync(path.join(dir, `${doc._id}.json`), JSON.stringify(doc, null, 1));
  }
  const dest = path.join(OUT, name);
  fs.rmSync(dest, { recursive: true, force: true });
  await compilePack(dir, dest, { log: false });
  const count = docs.filter(d => !d._key.startsWith("!folders")).length;
  console.log(`  ${name.padEnd(16)} ${String(count).padStart(4)} documents`);
}

/** Generated data files beside the packs (plain JSON, not LevelDB). */
const FILES = { pregens: buildPregens };

const selected = process.argv.slice(2).filter(a => PACKS[a] || FILES[a]);
const targets = selected.length ? selected : [...Object.keys(PACKS), ...Object.keys(FILES)];
console.log(`Building ${targets.length} packs → ${path.relative(ROOT, OUT)}`);
for ( const name of targets ) {
  if ( FILES[name] ) FILES[name]();
  else await build(name);
}
if ( warnings.length ) {
  console.log(`\n${warnings.length} warnings:`);
  const uniq = [...new Set(warnings)];
  for ( const w of uniq.slice(0, 60) ) console.log(`  - ${w}`);
  if ( uniq.length > 60 ) console.log(`  ... ${uniq.length - 60} more`);
}
