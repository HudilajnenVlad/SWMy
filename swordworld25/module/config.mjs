/**
 * Static configuration of the Sword World 2.5 system.
 * Exposed as CONFIG.SW25 at runtime.
 */

export const SYSTEM_ID = "swordworld25";

export const SW25 = {};

/* -------------------------------------------- */
/*  Abilities                                   */
/* -------------------------------------------- */

/** Base ability scores ("Skill / Body / Mind" in the translation). */
SW25.baseAbilities = {
  skill: "SW25.Base.skill",
  body: "SW25.Base.body",
  mind: "SW25.Base.mind"
};

/** The six ability scores, with the base score they derive from. */
SW25.abilities = {
  dex: { label: "SW25.Ability.dex", abbr: "SW25.AbilityAbbr.dex", base: "skill", letter: "A" },
  agi: { label: "SW25.Ability.agi", abbr: "SW25.AbilityAbbr.agi", base: "skill", letter: "B" },
  str: { label: "SW25.Ability.str", abbr: "SW25.AbilityAbbr.str", base: "body", letter: "C" },
  vit: { label: "SW25.Ability.vit", abbr: "SW25.AbilityAbbr.vit", base: "body", letter: "D" },
  int: { label: "SW25.Ability.int", abbr: "SW25.AbilityAbbr.int", base: "mind", letter: "E" },
  spi: { label: "SW25.Ability.spi", abbr: "SW25.AbilityAbbr.spi", base: "mind", letter: "F" }
};

/** Ability growth die face → ability (CR I p.190). */
SW25.growthDie = { 1: "dex", 2: "agi", 3: "str", 4: "vit", 5: "int", 6: "spi" };

/* -------------------------------------------- */
/*  Classes                                     */
/* -------------------------------------------- */

SW25.classCategories = {
  warrior: "SW25.ClassCategory.warrior",
  wizard: "SW25.ClassCategory.wizard",
  other: "SW25.ClassCategory.other"
};

SW25.classTracks = {
  major: "SW25.ClassTrack.major",
  minor: "SW25.ClassTrack.minor"
};

/**
 * Default behaviour of the core classes, keyed by class identifier.
 * Class items carry their own data; this table supplies labels and the default values used when a class item is
 * created from scratch with a known key.
 */
SW25.classes = {
  fighter: { label: "SW25.Class.fighter", category: "warrior", track: "major", attack: { melee: true, thrown: true }, evasion: true },
  grappler: { label: "SW25.Class.grappler", category: "warrior", track: "major", attack: { melee: true, wrestlingOnly: true }, evasion: true },
  fencer: { label: "SW25.Class.fencer", category: "warrior", track: "minor", attack: { melee: true, thrown: true }, evasion: true, halfStrength: true, critical: -1 },
  marksman: { label: "SW25.Class.marksman", category: "warrior", track: "minor", attack: { thrown: true, shooting: true } },
  sorcerer: { label: "SW25.Class.sorcerer", category: "wizard", track: "major", magic: "truespeech" },
  conjurer: { label: "SW25.Class.conjurer", category: "wizard", track: "major", magic: "spiritualism" },
  priest: { label: "SW25.Class.priest", category: "wizard", track: "major", magic: "divine" },
  artificer: { label: "SW25.Class.artificer", category: "wizard", track: "major", magic: "magitech" },
  fairytamer: { label: "SW25.Class.fairytamer", category: "wizard", track: "major", magic: "fairy" },
  scout: { label: "SW25.Class.scout", category: "other", track: "minor" },
  ranger: { label: "SW25.Class.ranger", category: "other", track: "minor" },
  sage: { label: "SW25.Class.sage", category: "other", track: "minor" },
  enhancer: { label: "SW25.Class.enhancer", category: "other", track: "minor", abilityType: "technique" },
  bard: { label: "SW25.Class.bard", category: "other", track: "minor", abilityType: "spellsong" },
  rider: { label: "SW25.Class.rider", category: "other", track: "minor", abilityType: "stunt" },
  alchemist: { label: "SW25.Class.alchemist", category: "other", track: "minor", abilityType: "evocation" }
};

/**
 * Experience points needed to raise a class to a given level (CR III p.69).
 * Index = target level.
 */
SW25.expTable = {
  major: [0, 1000, 1000, 1500, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7500, 9000, 10500, 12000, 13500],
  minor: [0, 500, 1000, 1000, 1500, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7500, 9000, 10500, 12000]
};

SW25.maxClassLevel = 15;

/* -------------------------------------------- */
/*  Magic                                       */
/* -------------------------------------------- */

SW25.magicSystems = {
  truespeech: { label: "SW25.Magic.truespeech", class: "sorcerer", icon: "fa-solid fa-hat-wizard" },
  spiritualism: { label: "SW25.Magic.spiritualism", class: "conjurer", icon: "fa-solid fa-ghost" },
  divine: { label: "SW25.Magic.divine", class: "priest", icon: "fa-solid fa-sun" },
  magitech: { label: "SW25.Magic.magitech", class: "artificer", icon: "fa-solid fa-gears" },
  fairy: { label: "SW25.Magic.fairy", class: "fairytamer", icon: "fa-solid fa-leaf" }
};

SW25.divineSubsystems = {
  basic: "SW25.Divine.basic",
  special: "SW25.Divine.special"
};

/**
 * Deities (CR I p.325–329, CR II p.261–262, p.324–325). The category (ancient/major/minor) selects the
 * rank-dependent version of spells such as Fist of God; `sword` is the First or Second Sword.
 */
SW25.deities = {
  Lyphos: { title: "the Divine Ancestor", category: "ancient", sword: "first" },
  Tidan: { title: "God of the Sun", category: "ancient", sword: "first" },
  Kilhia: { title: "God of Wisdom", category: "ancient", sword: "first" },
  Asteria: { title: "Goddess of Fairies", category: "ancient", sword: "first" },
  Grendal: { title: "Blazing Emperor", category: "ancient", sword: "first" },
  Sien: { title: "Goddess of the Moon", category: "major", sword: "first" },
  Mirtabar: { title: "Divine Hand", category: "major", sword: "first" },
  Eve: { title: "Shield Against the Abyss", category: "major", sword: "first" },
  Harula: { title: "Guiding Star", category: "major", sword: "first" },
  Dalion: { title: "God of Trees", category: "major", sword: "first" },
  Miritsa: { title: "Goddess of Love and Vengeance", category: "major", sword: "first" },
  Furusil: { title: "Goddess of Wind and Rain", category: "minor", sword: "first" },
  Strasford: { title: "God of Railroads", category: "minor", sword: "first" },
  Dalkhrem: { title: "God of War", category: "ancient", sword: "second" },
  Eiryak: { title: "Sea Snatcher", category: "major", sword: "second" },
  Zeides: { title: "Immortal Queen", category: "major", sword: "second" },
  Laris: { title: "Mad God", category: null, sword: "second" }
};

SW25.fairyElements = {
  earth: "SW25.Fairy.earth",
  water: "SW25.Fairy.water",
  fire: "SW25.Fairy.fire",
  wind: "SW25.Fairy.wind",
  light: "SW25.Fairy.light",
  dark: "SW25.Fairy.dark"
};

SW25.magispheres = {
  small: "SW25.Magisphere.small",
  medium: "SW25.Magisphere.medium",
  large: "SW25.Magisphere.large"
};

SW25.resistance = {
  cant: "SW25.Resistance.cant",
  optional: "SW25.Resistance.optional",
  none: "SW25.Resistance.none",
  neg: "SW25.Resistance.neg",
  half: "SW25.Resistance.half",
  temporary: "SW25.Resistance.temporary",
  special: "SW25.Resistance.special"
};

SW25.resistVs = {
  evasion: "SW25.Check.evasion",
  fortitude: "SW25.Check.fortitude",
  willpower: "SW25.Check.willpower",
  dangerSense: "SW25.Check.dangerSense",
  other: "SW25.Other"
};

SW25.targetKinds = {
  caster: "SW25.Target.caster",
  character: "SW25.Target.character",
  entireCharacter: "SW25.Target.entireCharacter",
  characterX: "SW25.Target.characterX",
  object: "SW25.Target.object",
  point: "SW25.Target.point",
  touch: "SW25.Target.touch",
  area: "SW25.Target.area",
  spell: "SW25.Target.spell",
  bullet: "SW25.Target.bullet",
  bullets3: "SW25.Target.bullets3",
  other: "SW25.Other"
};

SW25.rangeKinds = {
  caster: "SW25.Range.caster",
  touch: "SW25.Range.touch",
  ranged: "SW25.Range.ranged"
};

SW25.areaKinds = {
  none: "SW25.Area.none",
  shot: "SW25.Area.shot",
  target: "SW25.Area.target",
  line: "SW25.Area.line",
  breakthrough: "SW25.Area.breakthrough"
};

SW25.durationUnits = {
  instant: "SW25.Duration.instant",
  rounds: "SW25.Duration.rounds",
  instantRounds: "SW25.Duration.instantRounds",
  minutes: "SW25.Duration.minutes",
  hours: "SW25.Duration.hours",
  days: "SW25.Duration.days",
  permanent: "SW25.Duration.permanent",
  special: "SW25.Duration.special"
};

SW25.effectKinds = {
  damage: "SW25.EffectKind.damage",
  heal: "SW25.EffectKind.heal",
  mpHeal: "SW25.EffectKind.mpHeal",
  buff: "SW25.EffectKind.buff",
  debuff: "SW25.EffectKind.debuff",
  utility: "SW25.EffectKind.utility",
  summon: "SW25.EffectKind.summon",
  bullet: "SW25.EffectKind.bullet",
  other: "SW25.Other"
};

/* -------------------------------------------- */
/*  Damage                                      */
/* -------------------------------------------- */

SW25.damageKinds = {
  physical: "SW25.DamageKind.physical",
  magic: "SW25.DamageKind.magic",
  fixed: "SW25.DamageKind.fixed"
};

SW25.damageTypes = {
  earth: "SW25.DamageType.earth",
  water: "SW25.DamageType.water",
  fire: "SW25.DamageType.fire",
  wind: "SW25.DamageType.wind",
  lightning: "SW25.DamageType.lightning",
  energy: "SW25.DamageType.energy",
  slashing: "SW25.DamageType.slashing",
  bludgeoning: "SW25.DamageType.bludgeoning",
  poison: "SW25.DamageType.poison",
  disease: "SW25.DamageType.disease",
  psychic: "SW25.DamageType.psychic",
  psychicWeak: "SW25.DamageType.psychicWeak",
  curse: "SW25.DamageType.curse"
};

/* -------------------------------------------- */
/*  Equipment                                   */
/* -------------------------------------------- */

SW25.ranks = { B: "B", A: "A", S: "S", SS: "SS" };

SW25.weaponCategories = {
  sword: "SW25.WeaponCategory.sword",
  axe: "SW25.WeaponCategory.axe",
  spear: "SW25.WeaponCategory.spear",
  mace: "SW25.WeaponCategory.mace",
  staff: "SW25.WeaponCategory.staff",
  flail: "SW25.WeaponCategory.flail",
  warhammer: "SW25.WeaponCategory.warhammer",
  wrestling: "SW25.WeaponCategory.wrestling",
  throw: "SW25.WeaponCategory.throw",
  bow: "SW25.WeaponCategory.bow",
  crossbow: "SW25.WeaponCategory.crossbow",
  blowgun: "SW25.WeaponCategory.blowgun",
  gun: "SW25.WeaponCategory.gun"
};

/** Weapon categories that make shooting attacks. */
SW25.shootingCategories = new Set(["bow", "crossbow", "gun", "blowgun"]);

SW25.armorTypes = {
  nonmetal: "SW25.ArmorType.nonmetal",
  metal: "SW25.ArmorType.metal",
  shield: "SW25.ArmorType.shield"
};

SW25.grapplerArmor = {
  may: "SW25.Grappler.may",
  only: "SW25.Grappler.only"
};

SW25.accessorySlots = {
  head: "SW25.Slot.head",
  face: "SW25.Slot.face",
  ear: "SW25.Slot.ear",
  neck: "SW25.Slot.neck",
  back: "SW25.Slot.back",
  rightHand: "SW25.Slot.rightHand",
  leftHand: "SW25.Slot.leftHand",
  waist: "SW25.Slot.waist",
  feet: "SW25.Slot.feet",
  other: "SW25.Slot.other"
};

SW25.gearTypes = {
  accessory: "SW25.GearType.accessory",
  classItem: "SW25.GearType.classItem",
  herb: "SW25.GearType.herb",
  potion: "SW25.GearType.potion",
  ammo: "SW25.GearType.ammo",
  tool: "SW25.GearType.tool",
  gear: "SW25.GearType.gear",
  improvement: "SW25.GearType.improvement",
  golemItem: "SW25.GearType.golemItem",
  mountItem: "SW25.GearType.mountItem",
  card: "SW25.GearType.card",
  loot: "SW25.GearType.loot",
  other: "SW25.Other"
};

SW25.useKinds = {
  none: "SW25.UseKind.none",
  healHP: "SW25.UseKind.healHP",
  healMP: "SW25.UseKind.healMP",
  damage: "SW25.UseKind.damage",
  effect: "SW25.UseKind.effect"
};

SW25.useBonuses = {
  rangerDex: "SW25.UseBonus.rangerDex",
  rangerInt: "SW25.UseBonus.rangerInt"
};

/* -------------------------------------------- */
/*  Checks                                      */
/* -------------------------------------------- */

/**
 * Check packages (CR I p.114, CR III p.82). Each package lists the classes that provide it and the ability used.
 */
SW25.packages = {
  technique: { label: "SW25.Package.technique", ability: "dex", classes: ["scout", "ranger"] },
  movement: { label: "SW25.Package.movement", ability: "agi", classes: ["scout", "ranger", "rider"] },
  observation: { label: "SW25.Package.observation", ability: "int", classes: ["scout", "ranger"] },
  knowledge: { label: "SW25.Package.knowledge", ability: "int", classes: ["sage", "rider", "alchemist"] }
};

/**
 * All skill checks. `options` lists the (class | "adventurer") and ability combinations that can supply the
 * standard value; the best available one is used by default. `package` ties the check to a package bonus key.
 */
SW25.checks = {
  // Dexterity
  conceal: { ability: "dex", options: ["scout", "ranger"], package: "technique", time: "1m" },
  firstAid: { ability: "dex", options: ["ranger", "rider"], time: "10m" },
  disableDevice: { ability: "dex", options: ["scout", "ranger"], package: "technique", time: "1m" },
  pickpocket: { ability: "dex", options: ["scout"], package: "technique", time: "1r" },
  disguise: { ability: "dex", options: ["scout"], package: "technique", time: "10m" },
  setTrap: { ability: "dex", options: ["scout", "ranger"], package: "technique", time: "10m" },
  // Agility
  tumble: { ability: "agi", options: ["scout", "ranger", "rider"], package: "movement", time: "instant" },
  hide: { ability: "agi", options: ["scout", "ranger"], package: "movement", time: "1m", metalArmor: -4 },
  acrobatics: { ability: "agi", options: ["scout", "ranger"], package: "movement", time: "1m", metalArmor: -4 },
  climb: { ability: "agi", options: ["scout", "ranger", { source: "adventurer", ability: "str" }], package: "movement", time: "1m", metalArmor: -4 },
  follow: { ability: "agi", options: ["scout", "ranger"], package: "movement", time: "10m", metalArmor: -4 },
  jump: { ability: "agi", options: ["adventurer"], time: "1r", metalArmor: -4 },
  swim: { ability: "agi", options: ["adventurer"], time: "1m" },
  riding: { ability: "agi", options: ["rider"], package: "movement", time: "1m" },
  // Strength
  strength: { ability: "str", options: ["adventurer"], time: "1r" },
  // Intelligence
  track: { ability: "int", options: ["scout", "ranger"], package: "observation", time: "1m" },
  notice: { ability: "int", options: ["scout", "ranger"], package: "observation", time: "instant" },
  listen: { ability: "int", options: ["scout", "ranger"], package: "observation", time: "1r" },
  dangerSense: { ability: "int", options: ["scout", "ranger"], package: "observation", time: "instant" },
  search: { ability: "int", options: ["scout", "ranger"], package: "observation", time: "10m" },
  spotTrap: { ability: "int", options: ["scout", "ranger"], package: "observation", time: "instant" },
  meteorology: { ability: "int", options: ["scout", "ranger"], package: "observation", time: "1m" },
  insight: { ability: "int", options: ["sage", "bard", "alchemist"], package: "knowledge", time: "instant" },
  literature: { ability: "int", options: ["sage", "alchemist"], package: "knowledge", time: "10m" },
  engineering: { ability: "int", options: ["sage"], package: "knowledge", time: "10m" },
  cartography: { ability: "int", options: ["scout", "ranger", "sage", "rider"], package: "knowledge", time: "10m" },
  pathology: { ability: "int", options: ["ranger", "sage"], package: "knowledge", time: "10m" },
  herbology: { ability: "int", options: ["ranger", "sage", "alchemist"], package: "knowledge", time: "1m" },
  appraise: { ability: "int", options: ["scout", "sage"], package: "knowledge", time: "10m" },
  monsterKnowledge: { ability: "int", options: ["sage", "rider"], package: "knowledge", time: "instant" },
  weakness: { ability: "int", options: ["rider"], package: "knowledge", time: "instant" },
  detect: { ability: "int", options: ["adventurer"], time: "1r" },
  investigation: { ability: "int", options: ["any"], time: "1h" },
  evocation: { ability: "int", options: ["alchemist"], time: "instant" },
  // Agility (combat)
  initiative: { ability: "agi", options: ["scout"], time: "instant", noAutoSuccess: true },
  // Spirit
  performance: { ability: "spi", options: ["bard"], time: "instant" },
  willpower: { ability: "spi", options: ["adventurer"], time: "instant", notAction: true },
  // Vitality
  fortitude: { ability: "vit", options: ["adventurer"], time: "instant", notAction: true },
  death: { ability: "vit", options: ["adventurer"], time: "instant", notAction: true }
};

/** Checks shown in the "skills" list of the character sheet (combat checks are shown elsewhere). */
SW25.skillCheckGroups = {
  dex: ["conceal", "firstAid", "disableDevice", "pickpocket", "disguise", "setTrap"],
  agi: ["tumble", "hide", "acrobatics", "climb", "follow", "jump", "swim", "riding"],
  str: ["strength"],
  int: ["track", "notice", "listen", "dangerSense", "search", "spotTrap", "meteorology", "insight", "literature",
    "engineering", "cartography", "pathology", "herbology", "appraise", "weakness", "detect", "investigation"],
  spi: ["performance"]
};

/* -------------------------------------------- */
/*  Modifiers (automation vocabulary)           */
/* -------------------------------------------- */

/**
 * Modifier keys usable on items and effects. Each maps to a path under `system.bonuses` of an actor.
 */
SW25.modifierKeys = {
  accuracy: "SW25.Mod.accuracy",
  accuracyMelee: "SW25.Mod.accuracyMelee",
  accuracyRanged: "SW25.Mod.accuracyRanged",
  evasion: "SW25.Mod.evasion",
  defense: "SW25.Mod.defense",
  damage: "SW25.Mod.damage",
  damageMelee: "SW25.Mod.damageMelee",
  damageRanged: "SW25.Mod.damageRanged",
  damageMagic: "SW25.Mod.damageMagic",
  damageTaken: "SW25.Mod.damageTaken",
  damageTakenPhysical: "SW25.Mod.damageTakenPhysical",
  damageTakenMagic: "SW25.Mod.damageTakenMagic",
  critical: "SW25.Mod.critical",
  criticalSpell: "SW25.Mod.criticalSpell",
  criticalTaken: "SW25.Mod.criticalTaken",
  powerRoll: "SW25.Mod.powerRoll",
  powerPerCrit: "SW25.Mod.powerPerCrit",
  weaponPower: "SW25.Mod.weaponPower",
  finalePower: "SW25.Mod.finalePower",
  regenTurn: "SW25.Mod.regenTurn",
  regenRound: "SW25.Mod.regenRound",
  damageTurn: "SW25.Mod.damageTurn",
  fortitude: "SW25.Mod.fortitude",
  willpower: "SW25.Mod.willpower",
  spellcasting: "SW25.Mod.spellcasting",
  magicPower: "SW25.Mod.magicPower",
  actionChecks: "SW25.Mod.actionChecks",
  allChecks: "SW25.Mod.allChecks",
  initiative: "SW25.Mod.initiative",
  monsterKnowledge: "SW25.Mod.monsterKnowledge",
  technique: "SW25.Mod.technique",
  movementCheck: "SW25.Mod.movementCheck",
  observation: "SW25.Mod.observation",
  knowledge: "SW25.Mod.knowledge",
  movement: "SW25.Mod.movement",
  hpMax: "SW25.Mod.hpMax",
  mpMax: "SW25.Mod.mpMax",
  "ability.dex": "SW25.Mod.abilityDex",
  "ability.agi": "SW25.Mod.abilityAgi",
  "ability.str": "SW25.Mod.abilityStr",
  "ability.vit": "SW25.Mod.abilityVit",
  "ability.int": "SW25.Mod.abilityInt",
  "ability.spi": "SW25.Mod.abilitySpi",
  "mod.dex": "SW25.Mod.modDex",
  "mod.agi": "SW25.Mod.modAgi",
  "mod.str": "SW25.Mod.modStr",
  "mod.vit": "SW25.Mod.modVit",
  "mod.int": "SW25.Mod.modInt",
  "mod.spi": "SW25.Mod.modSpi",
  performance: "SW25.Mod.performance",
  evocation: "SW25.Mod.evocation",
  riding: "SW25.Mod.riding",
  loot: "SW25.Mod.loot",
  "mp.cost": "SW25.Mod.mpCost"
};

/** Maps the "package" name used in checks to its modifier key. */
SW25.packageModifier = {
  technique: "technique",
  movement: "movementCheck",
  observation: "observation",
  knowledge: "knowledge"
};

/* -------------------------------------------- */
/*  Monsters                                    */
/* -------------------------------------------- */

SW25.monsterClassifications = {
  barbarous: "SW25.MonsterType.barbarous",
  animal: "SW25.MonsterType.animal",
  plant: "SW25.MonsterType.plant",
  undead: "SW25.MonsterType.undead",
  construct: "SW25.MonsterType.construct",
  magitech: "SW25.MonsterType.magitech",
  mythicalBeast: "SW25.MonsterType.mythicalBeast",
  fairy: "SW25.MonsterType.fairy",
  daemon: "SW25.MonsterType.daemon",
  humanoid: "SW25.MonsterType.humanoid",
  golem: "SW25.MonsterType.golem",
  familiar: "SW25.MonsterType.familiar",
  other: "SW25.Other"
};

/** Monster unique skill classification tags (CR I p.393). */
SW25.abilityTags = {
  passive: { label: "SW25.AbilityTag.passive", icon: "◯" },
  major: { label: "SW25.AbilityTag.major", icon: "►" },
  minor: { label: "SW25.AbilityTag.minor", icon: "⏩" },
  prep: { label: "SW25.AbilityTag.prep", icon: "△" },
  declared: { label: "SW25.AbilityTag.declared", icon: "🗨" }
};

SW25.weakPointKinds = {
  accuracy: "SW25.WeakPoint.accuracy",
  damage: "SW25.WeakPoint.damage",
  other: "SW25.Other"
};

/** Sword shard enhancement: resistance bonus by number of shards (CR I p.385). */
SW25.swordShardResistBonus = shards => {
  if ( shards >= 16 ) return 4;
  if ( shards >= 11 ) return 3;
  if ( shards >= 6 ) return 2;
  if ( shards >= 1 ) return 1;
  return 0;
};

/** Difference between a monster's standard value and its fixed value. */
SW25.FIXED_OFFSET = 7;

/* -------------------------------------------- */
/*  Class abilities                             */
/* -------------------------------------------- */

SW25.rhythms = {
  up: { label: "SW25.Rhythm.up", icon: "⮭" },
  down: { label: "SW25.Rhythm.down", icon: "⮯" },
  heart: { label: "SW25.Rhythm.heart", icon: "♡" }
};

SW25.cardColors = {
  red: "SW25.Card.red",
  green: "SW25.Card.green",
  black: "SW25.Card.black",
  white: "SW25.Card.white",
  gold: "SW25.Card.gold"
};

SW25.cardRanks = ["B", "A", "S", "SS"];

SW25.stuntActions = {
  passive: "SW25.AbilityTag.passive",
  major: "SW25.AbilityTag.major",
  minor: "SW25.AbilityTag.minor"
};

SW25.mountKinds = {
  animal: "SW25.MonsterType.animal",
  mythicalBeast: "SW25.MonsterType.mythicalBeast",
  magitech: "SW25.MonsterType.magitech"
};

SW25.featTypes = {
  passive: "SW25.FeatType.passive",
  active: "SW25.FeatType.active",
  major: "SW25.FeatType.major"
};

/* -------------------------------------------- */
/*  Item type groupings                         */
/* -------------------------------------------- */

/** Item types that represent equipment carried by an actor. */
SW25.inventoryTypes = ["weapon", "armor", "gear"];

/** Item types learned through class levels ("one per level"). */
SW25.learnedTypes = {
  technique: "enhancer",
  spellsong: "bard",
  finale: "bard",
  stunt: "rider",
  evocation: "alchemist"
};

/* -------------------------------------------- */
/*  Character sheet                             */
/* -------------------------------------------- */

/**
 * Languages (CR I p.75, CR II p.31). `speak: false` / `write: false` mark a form that does not exist;
 * `sheet` languages are printed on the official character sheet and always shown; `name` is the English
 * name used to match free-text entries.
 */
SW25.languages = {
  tradeCommon: { label: "SW25.Lang.tradeCommon", name: "Trade Common", sheet: true },
  regional: { label: "SW25.Lang.regional", name: "Regional Dialect", sheet: true, dialect: true },
  ancientCelestial: { label: "SW25.Lang.ancientCelestial", name: "Ancient Celestial", speak: false, sheet: true },
  arcana: { label: "SW25.Lang.arcana", name: "Arcana", sheet: true },
  magitech: { label: "SW25.Lang.magitech", name: "Magitech", sheet: true },
  sylvan: { label: "SW25.Lang.sylvan", name: "Sylvan", write: false, sheet: true },
  daemonic: { label: "SW25.Lang.daemonic", name: "Daemonic", write: false, sheet: true },
  barbaric: { label: "SW25.Lang.barbaric", name: "Barbaric", sheet: true },
  elven: { label: "SW25.Lang.elven", name: "Elven" },
  dwarven: { label: "SW25.Lang.dwarven", name: "Dwarven" },
  grassrunner: { label: "SW25.Lang.grassrunner", name: "Grassrunner" },
  lycant: { label: "SW25.Lang.lycant", name: "Lycant" },
  giantish: { label: "SW25.Lang.giantish", name: "Giantish" },
  drakish: { label: "SW25.Lang.drakish", name: "Drakish" },
  dragonic: { label: "SW25.Lang.dragonic", name: "Dragonic" },
  youma: { label: "SW25.Lang.youma", name: "Youma", write: false },
  seaAnimal: { label: "SW25.Lang.seaAnimal", name: "Sea Animal", write: false },
  nosferatu: { label: "SW25.Lang.nosferatu", name: "Nosferatu" },
  basilisk: { label: "SW25.Lang.basilisk", name: "Basilisk" },
  aviary: { label: "SW25.Lang.aviary", name: "Aviary" },
  lizardman: { label: "SW25.Lang.lizardman", name: "Lizardman" }
};

/**
 * Adventurer Ranks (CR II p.114): Reputation cost of each promotion and the "free" Renowned Item threshold.
 * Past Sword of Genesis every promotion adds a ★, costs 500 and raises the free threshold by 50.
 */
SW25.adventurerRanks = [
  { key: "none", cost: 0, free: 0 },
  { key: "dagger", cost: 20, free: 0 },
  { key: "rapier", cost: 30, free: 5 },
  { key: "broadSword", cost: 50, free: 10 },
  { key: "greatSword", cost: 100, free: 20 },
  { key: "flamberge", cost: 100, free: 30 },
  { key: "sentinel", cost: 200, free: 50 },
  { key: "hyperion", cost: 200, free: 70 },
  { key: "genesis", cost: 300, free: 100 }
];

/**
 * Adventurer Rank data for a rank index.
 * @param {number} index
 * @returns {{index: number, key: string, stars: number, cost: number, free: number, total: number}}
 */
SW25.adventurerRank = index => {
  const ranks = SW25.adventurerRanks;
  const last = ranks.length - 1;
  index = Math.max(0, Number(index) || 0);
  const stars = Math.max(0, index - last);
  const base = ranks[Math.min(index, last)];
  let total = 0;
  for ( let i = 1; i <= Math.min(index, last); i++ ) total += ranks[i].cost;
  total += stars * 500;
  return {
    index, key: base.key, stars, total,
    cost: stars ? 500 : base.cost,
    free: base.free + (stars * 50)
  };
};

/* -------------------------------------------- */
/*  Miscellaneous                               */
/* -------------------------------------------- */

SW25.dispositions = {
  friendly: "SW25.Disposition.friendly",
  neutral: "SW25.Disposition.neutral",
  hostile: "SW25.Disposition.hostile",
  hungry: "SW25.Disposition.hungry",
  instructed: "SW25.Disposition.instructed"
};

SW25.intelligenceLevels = {
  None: "SW25.Intelligence.none",
  Animal: "SW25.Intelligence.animal",
  Low: "SW25.Intelligence.low",
  Average: "SW25.Intelligence.average",
  High: "SW25.Intelligence.high",
  Servant: "SW25.Intelligence.servant"
};

/** Image of a new party actor. */
SW25.partyIcon = "icons/environment/people/group.webp";

/** Icons for Item types (used when an item is created without an image). */
SW25.defaultIcons = {
  race: "icons/environment/people/group.webp",
  class: "icons/sundries/books/book-embossed-bound-brown.webp",
  weapon: "icons/weapons/swords/sword-guard-brown.webp",
  armor: "icons/equipment/chest/breastplate-banded-steel.webp",
  gear: "icons/containers/bags/pack-leather-brown.webp",
  spell: "icons/magic/symbols/runes-star-pentagon-blue.webp",
  feat: "icons/skills/melee/weapons-crossed-swords-yellow.webp",
  technique: "icons/magic/control/buff-strength-muscle-damage-orange.webp",
  spellsong: "icons/tools/instruments/lute-gold-brown.webp",
  finale: "icons/tools/instruments/harp-yellow-teal.webp",
  stunt: "icons/environment/creatures/horse-brown.webp",
  evocation: "icons/sundries/gaming/playing-cards-grey.webp",
  ability: "icons/creatures/abilities/bear-roar-bite-brown.webp",
  effect: "icons/svg/aura.svg"
};
