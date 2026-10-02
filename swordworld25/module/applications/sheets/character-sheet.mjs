import SW25ActorSheet from "./actor-base.mjs";
import { checkSource, rollDeathCheck, rollMonsterKnowledge } from "../../workflows/checks.mjs";
import { reloadGun, rollWeaponDamage } from "../../workflows/attacks.mjs";
import { makeCrudeCard, sellLoot } from "../../workflows/loot.mjs";
import { applyDamageTo } from "../../combat/damage.mjs";
import { lookupPower, POWER_TABLE } from "../../dice/power-table.mjs";
import { gamels, PAPER_DIALOG, signed, speakerFor, t } from "../../helpers/utils.mjs";
import { createCard } from "../../chat/card.mjs";
import { stackValue } from "../../data/item/equipment.mjs";
import PregenPicker, { isBlankCharacter } from "../apps/pregen-picker.mjs";

const ABILITY_KEYS = ["dex", "agi", "str", "vit", "int", "spi"];

/** Adventurer levels at which combat feat slots open (CR I p.180). */
const FEAT_SLOT_LEVELS = [1, 3, 5, 7, 9, 11, 13, 15];

/** Warrior-type classes printed on the sheet (Base Accuracy / Extra Damage). */
const SHEET_WARRIORS = ["fighter", "grappler", "fencer", "marksman"];

/** Classes printed next to the Base Evasion box. */
const SHEET_EVADERS = ["fighter", "grappler", "fencer"];

/** Bonus keys listed in the "enhancements" brackets of the sheet. */
const ENHANCEMENT_KEYS = {
  movement: ["movement"],
  attack: ["accuracy", "accuracyMelee", "accuracyRanged", "damage", "damageMelee", "damageRanged", "critical", "powerRoll"],
  defense: ["evasion", "defense", "damageTaken", "damageTakenPhysical", "damageTakenMagic"]
};

/**
 * Player character sheet, laid out after the official Sword World 2.5 character sheet.
 */
export default class CharacterSheet extends SW25ActorSheet {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["character", "swp", "themed", "theme-light"],
    position: { width: 940, height: 900 },
    actions: {
      classUp: CharacterSheet.#onClassUp,
      classDown: CharacterSheet.#onClassDown,
      rollAbilities: CharacterSheet.#onRollAbilities,
      chooseBackground: CharacterSheet.#onChooseBackground,
      rollGrowth: CharacterSheet.#onRollGrowth,
      languageDelete: CharacterSheet.#onLanguageDelete,
      languageToggle: CharacterSheet.#onLanguageToggle,
      fairyElement: CharacterSheet.#onFairyElement,
      rhythmAdjust: CharacterSheet.#onRhythmAdjust,
      cardAdjust: CharacterSheet.#onCardAdjust,
      weaponMode: CharacterSheet.#onWeaponMode,
      weaponDamage: CharacterSheet.#onWeaponDamage,
      gunReload: CharacterSheet.#onGunReload,
      lootSell: CharacterSheet.#onLootSell,
      lootCard: CharacterSheet.#onLootCard,
      monsterKnowledge: CharacterSheet.#onMonsterKnowledge,
      deathCheck: CharacterSheet.#onDeathCheck,
      rest: CharacterSheet.#onRest,
      awardExp: CharacterSheet.#onAwardExp,
      useChangeFate: CharacterSheet.#onChangeFate,
      setTally: CharacterSheet.#onSetTally,
      rankUp: CharacterSheet.#onRankUp,
      rankDown: CharacterSheet.#onRankDown,
      slotClear: CharacterSheet.#onSlotClear,
      itemToggleEquip: CharacterSheet.#onItemToggleEquip,
      resourceHit: CharacterSheet.#onResourceHit,
      powerTable: CharacterSheet.#onPowerTable,
      traitChat: CharacterSheet.#onTraitChat,
      addAdventurerSet: CharacterSheet.#onAddAdventurerSet,
      choosePregen: CharacterSheet.#onChoosePregen
    }
  };

  /** @override */
  static PARTS = {
    header: { template: "systems/swordworld25/templates/actor/character/header.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: "systems/swordworld25/templates/actor/character/main.hbs", scrollable: [""] },
    combat: { template: "systems/swordworld25/templates/actor/character/combat.hbs", scrollable: [""] },
    skills: { template: "systems/swordworld25/templates/actor/character/skills.hbs", scrollable: [""] },
    magic: { template: "systems/swordworld25/templates/actor/character/magic.hbs", scrollable: [""] },
    inventory: { template: "systems/swordworld25/templates/actor/character/inventory.hbs", scrollable: [""] },
    effects: { template: "systems/swordworld25/templates/actor/paper/effects-tab.hbs", scrollable: [""] },
    bio: { template: "systems/swordworld25/templates/actor/character/bio.hbs", scrollable: [""] }
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        { id: "main", icon: "fa-solid fa-user", tooltip: "SW25.Tab.main" },
        { id: "combat", icon: "fa-solid fa-khanda", tooltip: "SW25.Tab.combat" },
        { id: "skills", icon: "fa-solid fa-dice-d6", tooltip: "SW25.Tab.skills" },
        { id: "magic", icon: "fa-solid fa-hat-wizard", tooltip: "SW25.Tab.magic" },
        { id: "inventory", icon: "fa-solid fa-sack", tooltip: "SW25.Tab.inventory" },
        { id: "effects", icon: "fa-solid fa-bolt", tooltip: "SW25.Tab.effects" },
        { id: "bio", icon: "fa-solid fa-feather", tooltip: "SW25.Tab.bio" }
      ],
      initial: "main",
      labelPrefix: "SW25.Tab"
    }
  };

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const sys = actor.system;
    const SW25 = CONFIG.SW25;
    const items = actor.items.contents.sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name));
    context.editable = this.isEditable;

    // Header
    context.race = sys.race;
    context.isHuman = sys.race?.system.key === "human";
    context.traits = (sys.race?.system.traits ?? []).map((trait, index) => ({
      index, name: trait.name, description: trait.description, level: trait.level,
      locked: trait.level > Math.max(1, sys.level)
    }));
    context.activeStatuses = context.statuses.filter(s => s.active);

    // Classes & experience
    context.classes = items.filter(i => i.type === "class")
      .sort((a, b) => b.system.level - a.system.level)
      .map(i => ({
        item: i, id: i.id, name: i.name, img: i.img, level: i.system.level,
        track: game.i18n.localize(SW25.classTracks[i.system.track] ?? ""),
        category: game.i18n.localize(SW25.classCategories[i.system.category] ?? ""),
        nextCost: i.system.nextLevelCost,
        canLevel: (i.system.nextLevelCost !== null) && (sys.exp.value >= i.system.nextLevelCost)
      }));
    context.expNext = context.classes.length ? Math.min(...context.classes.map(c => c.nextCost ?? Infinity)) : null;
    if ( context.expNext === Infinity ) context.expNext = null;
    context.classOptions = await this.#classOptions();

    // Page I
    context.abilityGroups = this.#abilityGroups(sys);
    context.packageRows = this.#packageRows(sys);
    context.feats = await this.#featRows(items, sys);
    context.learned = await this.#learnedGroups(items, sys);
    context.languageRows = this.#languageRows(sys);
    context.languageOptions = this.#languageOptions(sys);
    context.rank = this.#rankContext(sys);
    context.fumbleBoxes = this.#tally(sys.fumbles, 10);
    context.soulscarBoxes = this.#tally(sys.soulscars, 5);
    context.autoFailureExp = game.settings.get("swordworld25", "autoFailureExp");

    // Page II
    context.mk = this.#formulaCheck(sys, "monsterKnowledge", ["sage", "rider"], "int");
    context.init = this.#formulaCheck(sys, "initiative", ["scout"], "agi");
    context.movement = { ...sys.movement, agi: sys.abilities.agi.value, lines: this.#bonusLines(ENHANCEMENT_KEYS.movement) };
    context.warriors = this.#warriorContext(sys);
    context.weapons = await Promise.all(items.filter(i => i.type === "weapon").map(i => this.#weaponContext(i)));
    context.attackLines = this.#bonusLines(ENHANCEMENT_KEYS.attack);
    context.declarable = items.filter(i => (i.type === "feat") && (i.system.featType !== "passive"))
      .map(i => ({ id: i.id, name: i.name, major: i.system.featType === "major" }));
    context.hands = this.#handRows(items, sys);
    context.accessorySlots = this.#accessorySlots(items);
    context.evasion = this.#evasionContext(sys);
    context.armors = await this.#armorRows(items, sys);
    context.defenseLines = this.#bonusLines(ENHANCEMENT_KEYS.defense);
    context.magicPowers = this.#magicPowers(sys);

    // Checks
    context.checkGroups = this.#checkGroups(sys);

    // Magic
    context.magic = await Promise.all(Object.values(sys.magic ?? {}).map(async m => ({
      ...m,
      icon: SW25.magicSystems[m.system]?.icon,
      spells: await Promise.all(items.filter(i => (i.type === "spell") && (i.system.magic === m.system))
        .sort((a, b) => (a.system.level - b.system.level) || a.name.localeCompare(b.name))
        .map(i => this.#spellContext(i)))
    })));
    context.otherSpells = await Promise.all(items.filter(i => (i.type === "spell") && !sys.magic?.[i.system.magic])
      .map(i => this.#spellContext(i)));
    context.hasBard = !!sys.classes.bard;
    context.hasAlchemist = !!sys.classes.alchemist;
    context.hasFairy = !!sys.classes.fairytamer;
    context.hasPriest = !!sys.classes.priest;
    context.fairyElements = Object.entries(SW25.fairyElements).map(([k, label]) => ({
      key: k, label, active: sys.fairyElements.includes(k)
    }));
    context.cardRows = Object.entries(SW25.cardColors).map(([color, label]) => ({
      color, label, ranks: SW25.cardRanks.map(r => ({ rank: r, value: sys.cards[color][r] }))
    }));
    context.rhythms = Object.entries(SW25.rhythms).map(([k, r]) => ({ key: k, icon: r.icon, label: r.label, value: sys.rhythm[k] }));
    context.deities = await this.#deityOptions();

    // Inventory: everything carried, the weapons and armor of the Combat tab included
    const gear = items.filter(i => i.type === "gear");
    const groups = {};
    for ( const g of gear ) {
      const type = g.system.itemType || "gear";
      (groups[type] ??= []).push(g);
    }
    const carried = [
      { type: "weapon", label: "SW25.Weapons", list: items.filter(i => i.type === "weapon") },
      { type: "armor", label: "SW25.ArmorAndShields", list: items.filter(i => i.type === "armor") }
    ].filter(g => g.list.length);
    context.inventory = [
      ...await Promise.all(carried.map(async g => ({
        type: g.type, label: g.label, items: await Promise.all(g.list.map(i => this.#possessionContext(i)))
      }))),
      ...await Promise.all(Object.entries(groups).map(async ([type, list]) => ({
        type, label: SW25.gearTypes[type] ?? type,
        items: await Promise.all(list.map(g => this.#gearContext(g)))
      })))
    ];
    context.wealth = this.#wealthContext(sys);
    context.consumables = gear.filter(g => g.system.consumable).map(g => ({
      id: g.id, name: g.name, img: g.img, quantity: g.system.quantity,
      pips: this.#tally(g.system.quantity, Math.min(Math.max(g.system.quantity, 6), 12)).map(p => ({ ...p, used: !p.on })),
      more: g.system.quantity > 12
    }));
    context.hasAdventurerSet = gear.some(g => /adventurer.?s? set/i.test(g.name));

    // Bio
    context.enrichedBiography = await this._enrich(sys.details.biography);
    context.enrichedNotes = await this._enrich(sys.details.notes);
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Compendium classes the character can still learn, with their level-1 cost.
   * @returns {Promise<object[]>}
   */
  async #classOptions() {
    const pack = game.packs.get("swordworld25.classes");
    if ( !pack ) return [];
    const index = await pack.getIndex({ fields: ["system.key", "system.track"] });
    const owned = this.actor.items.filter(i => i.type === "class");
    const restricted = this.actor.system.race?.system.restrictedClasses ?? [];
    const exp = this.actor.system.exp.value;
    return index
      .filter(e => !owned.some(i => (e.system?.key && (i.system.key === e.system.key)) || (i.name === e.name)))
      .filter(e => !restricted.includes(e.system?.key))
      .map(e => {
        const cost = CONFIG.SW25.expTable[e.system?.track]?.[1] ?? 0;
        return { uuid: e.uuid, name: e.name, cost, affordable: cost <= exp };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Ability rows grouped by their base score (Skill → Dex/Agi, Body → Str/Vit, Mind → Int/Spi).
   * @param {object} sys
   * @returns {object[]}
   */
  #abilityGroups(sys) {
    const SW25 = CONFIG.SW25;
    const faces = Object.fromEntries(Object.entries(SW25.growthDie).map(([face, key]) => [key, Number(face)]));
    return Object.entries(SW25.baseAbilities).map(([base, label]) => ({
      key: base, label, value: sys.base[base],
      abilities: ABILITY_KEYS.filter(k => SW25.abilities[k].base === base).map(k => {
        const a = sys.abilities[k];
        const bonus = sys.bonuses.ability[k] ?? 0;
        const modBonus = sys.bonuses.mod[k] ?? 0;
        return {
          key: k, label: SW25.abilities[k].label, letter: SW25.abilities[k].letter, face: faces[k],
          dice: sys.race?.system.abilityDice?.[k] ?? "",
          rolled: a.rolled, growth: a.growth, other: a.other, value: a.value, mod: a.mod,
          bonus, modBonus, bonusTooltip: this.#sourcesTooltip([`ability.${k}`, `mod.${k}`])
        };
      })
    }));
  }

  /**
   * Check package rows (CR I p.114): candidate classes, best value, and the package's checks.
   * @param {object} sys
   * @returns {object[]}
   */
  #packageRows(sys) {
    const SW25 = CONFIG.SW25;
    return Object.entries(SW25.packages).map(([key, pkg]) => {
      const list = sys.packages?.[key] ?? [];
      const best = list.reduce((a, b) => ((!a || (b.value > a.value)) ? b : a), null);
      return {
        key, label: pkg.label,
        abilityAbbr: SW25.abilities[pkg.ability].abbr, mod: sys.abilities[pkg.ability].mod,
        classes: pkg.classes.map(c => this.#classChip(sys, c, best?.class === c)),
        value: best?.value ?? null, level: best?.level ?? 0,
        bonus: sys.bonuses[SW25.packageModifier[key]] ?? 0,
        expanded: this._expanded.has(`pkg:${key}`),
        checks: Object.values(sys.checks).filter(c => c.package === key).map(c => ({
          key: c.key, label: game.i18n.localize(c.label), value: c.value, straight: c.straight
        }))
      };
    });
  }

  /**
   * A class shown as a checkbox with its level.
   * @param {object} sys
   * @param {string} key
   * @param {boolean} [best]
   * @returns {object}
   */
  #classChip(sys, key, best = false) {
    const cls = sys.classes[key];
    return {
      key, owned: !!cls, best, level: cls?.level ?? 0,
      label: cls?.label ?? game.i18n.localize(CONFIG.SW25.classes[key]?.label ?? key)
    };
  }

  /**
   * Combat feat slots (one per odd adventurer level) plus automatically acquired feats.
   * @param {Item[]} items
   * @param {object} sys
   * @returns {Promise<object>}
   */
  async #featRows(items, sys) {
    const feats = items.filter(i => i.type === "feat");
    const selective = feats.filter(f => f.system.acquisition !== "automatic");
    const slots = sys.featSlots;
    const count = Math.min(FEAT_SLOT_LEVELS.length, Math.max(slots + 1, selective.length));
    const rows = [];
    for ( let i = 0; i < Math.max(count, selective.length); i++ ) {
      const feat = selective[i] ? await this.#featContext(selective[i]) : null;
      rows.push({ slotLevel: FEAT_SLOT_LEVELS[i] ?? "—", feat, locked: i >= slots, over: !!feat && (i >= slots) });
    }
    return {
      rows,
      automatic: await Promise.all(feats.filter(f => f.system.acquisition === "automatic").map(f => this.#featContext(f))),
      slots, used: selective.length, over: selective.length > slots
    };
  }

  /**
   * Context of one combat feat row.
   * @param {Item} item
   * @returns {Promise<object>}
   */
  async #featContext(item) {
    const s = item.system;
    const icons = { passive: "fa-regular fa-circle", active: "fa-solid fa-bullhorn", major: "fa-solid fa-play" };
    const prereq = s.checkPrerequisites?.(this.actor) ?? { ok: true, missing: [] };
    return {
      ...(await this._itemRow(item)),
      typeIcon: icons[s.featType] ?? icons.passive,
      typeLabel: CONFIG.SW25.featTypes[s.featType] ?? "",
      usable: s.featType !== "passive",
      prereqOk: prereq.ok,
      missing: prereq.missing?.join(", ") ?? ""
    };
  }

  /**
   * Learned class abilities (techniques, spellsongs, finales, stunts, evocations).
   * @param {Item[]} items
   * @param {object} sys
   * @returns {Promise<object[]>}
   */
  async #learnedGroups(items, sys) {
    const groups = [];
    for ( const type of ["technique", "spellsong", "finale", "stunt", "evocation"] ) {
      const list = items.filter(i => i.type === type)
        .sort((a, b) => (a.system.level - b.system.level) || a.name.localeCompare(b.name));
      const info = sys.learned?.[type];
      if ( !list.length && !info?.max ) continue;
      groups.push({
        type, label: `TYPES.Item.${type}`,
        count: info?.count ?? 0, max: info?.max ?? 0, over: (info?.count ?? 0) > (info?.max ?? 0),
        items: await Promise.all(list.map(async i => ({ ...(await this._itemRow(i)), level: i.system.level })))
      });
    }
    return groups;
  }

  /**
   * Language rows: the languages printed on the sheet, then every other language the character knows.
   * @param {object} sys
   * @returns {object[]}
   */
  #languageRows(sys) {
    const SW25 = CONFIG.SW25;
    const entries = sys.languages.map((l, index) => ({ ...l, index, key: this.#languageKey(l) }));
    const rows = [];
    const used = new Set();
    for ( const [key, cfg] of Object.entries(SW25.languages) ) {
      if ( !cfg.sheet ) continue;
      const matches = entries.filter(e => e.key === key);
      if ( !matches.length ) rows.push(this.#languageRow(key, cfg, null));
      for ( const m of matches ) {
        rows.push(this.#languageRow(key, cfg, m));
        used.add(m.index);
      }
    }
    for ( const entry of entries ) {
      if ( used.has(entry.index) ) continue;
      rows.push(this.#languageRow(entry.key, SW25.languages[entry.key] ?? null, entry));
    }
    return rows;
  }

  /**
   * Identify a stored language entry with a configured language.
   * @param {object} entry
   * @returns {string}
   */
  #languageKey(entry) {
    const SW25 = CONFIG.SW25;
    if ( entry.key && SW25.languages[entry.key] ) return entry.key;
    const name = String(entry.name ?? "").trim().toLowerCase();
    if ( !name ) return entry.key || "";
    for ( const [key, cfg] of Object.entries(SW25.languages) ) {
      if ( (cfg.name.toLowerCase() === name) || (game.i18n.localize(cfg.label).toLowerCase() === name) ) return key;
    }
    return "";
  }

  /**
   * @param {string} key
   * @param {object|null} cfg
   * @param {object|null} entry
   * @returns {object}
   */
  #languageRow(key, cfg, entry) {
    const canSpeak = cfg?.speak !== false;
    const canWrite = cfg?.write !== false;
    return {
      key, index: entry?.index ?? "", learned: !!entry,
      label: cfg ? game.i18n.localize(cfg.label) : "",
      custom: !cfg, dialect: !!cfg?.dialect, name: (cfg?.dialect || !cfg) ? (entry?.name ?? "") : "",
      canSpeak, canWrite,
      speak: canSpeak && !!entry?.speak,
      write: canWrite && !!entry?.write,
      removable: !!entry && !cfg?.sheet
    };
  }

  /**
   * Languages that can still be added from the list.
   * @param {object} sys
   * @returns {object[]}
   */
  #languageOptions(sys) {
    const known = new Set(sys.languages.map(l => this.#languageKey(l)));
    return Object.entries(CONFIG.SW25.languages)
      .filter(([key, cfg]) => !cfg.sheet && !known.has(key))
      .map(([key, cfg]) => ({ key, label: game.i18n.localize(cfg.label) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Adventurer Rank display data.
   * @param {object} sys
   * @returns {object}
   */
  #rankContext(sys) {
    const info = sys.rankInfo ?? CONFIG.SW25.adventurerRank(sys.rank);
    const next = CONFIG.SW25.adventurerRank(info.index + 1);
    return {
      ...info, label: this.#rankLabel(info),
      next: { ...next, label: this.#rankLabel(next) },
      canUp: sys.reputation.value >= next.cost
    };
  }

  /** @param {object} info */
  #rankLabel(info) {
    const label = t(`SW25.AdvRank.${info.key}`);
    return info.stars ? `${label} ${"★".repeat(info.stars)}` : label;
  }

  /**
   * Boxes of a tally (soulscars, automatic failures, consumables).
   * @param {number} value
   * @param {number} size
   * @returns {object[]}
   */
  #tally(value, size) {
    return Array.from({ length: size }, (_, i) => ({ value: i + 1, on: i < value }));
  }

  /**
   * A check shown as "classes + ability modifier = value" (Monster Knowledge, Initiative).
   * @param {object} sys
   * @param {string} key
   * @param {string[]} classes
   * @param {string} ability
   * @returns {object}
   */
  #formulaCheck(sys, key, classes, ability) {
    const check = sys.checks[key];
    const keys = new Set(classes);
    if ( check?.source && sys.classes[check.source] ) keys.add(check.source);
    return {
      key, value: check?.value ?? 0, straight: !!check?.straight,
      level: check?.straight ? 0 : ((check?.base ?? 0) - sys.abilities[check?.ability ?? ability].mod),
      abilityAbbr: CONFIG.SW25.abilities[check?.ability ?? ability].abbr,
      mod: sys.abilities[check?.ability ?? ability].mod,
      bonus: check?.bonus ?? 0,
      classes: [...keys].map(c => this.#classChip(sys, c, check?.source === c))
    };
  }

  /**
   * Warrior classes: Base Accuracy (level + Dex mod) and Extra Damage (level + Str mod).
   * @param {object} sys
   * @returns {object}
   */
  #warriorContext(sys) {
    const keys = new Set(SHEET_WARRIORS);
    for ( const cls of Object.values(sys.classes) ) if ( cls.category === "warrior" ) keys.add(cls.key);
    return {
      chips: [...keys].map(k => this.#classChip(sys, k)),
      rows: Object.values(sys.warrior ?? {}),
      dexMod: sys.abilities.dex.mod,
      strMod: sys.abilities.str.mod
    };
  }

  /**
   * Context of one weapon row, with its power table row.
   * @param {Item} item
   * @returns {Promise<object>}
   */
  async #weaponContext(item) {
    const s = item.system;
    const atk = s.attack ?? {};
    const mode = s.currentMode;
    const isGun = s.isGun;
    const critical = atk.critical ?? 10;
    const hasPower = !isGun && Number.isInteger(atk.power);
    const powerRow = [];
    for ( let roll = 2; roll <= 12; roll++ ) {
      powerRow.push({
        roll, fumble: roll === 2,
        value: roll === 2 ? "✻" : (hasPower ? lookupPower(atk.power, roll) : ""),
        crit: hasPower && (roll > 2) && (roll >= critical)
      });
    }
    return {
      ...(await this._itemRow(item)),
      equipped: s.equipped,
      category: game.i18n.localize(CONFIG.SW25.weaponCategories[s.category] ?? s.category),
      rank: s.rank,
      modes: s.modes.map((m, i) => ({ ...m, index: i, active: i === s.mode, label: m.label || m.stance })),
      multiMode: s.modes.length > 1,
      stance: mode.stance,
      minStr: mode.minStr,
      strWarning: (atk.strPenalty ?? 0) < 0,
      strPenalty: atk.strPenalty,
      weaponAccuracy: signed(mode.accuracy ?? 0),
      accuracy: atk.accuracy ?? 0,
      power: isGun ? "—" : (atk.power ?? "—"),
      powerRow,
      critical,
      weaponExtra: signed(mode.extraDamage ?? 0),
      extraDamage: atk.extraDamage ?? 0,
      isGun,
      tracksBullets: isGun && Number.isInteger(s.magazine) && (s.magazine > 0),
      loaded: s.loaded,
      magazineLabel: (isGun && Number.isInteger(s.magazine)) ? `${s.loaded} / ${s.magazine}` : "",
      classLabel: atk.classLabel,
      straight: atk.straight,
      attackClass: s.attackClass,
      attackOptions: Object.fromEntries([["", t("SW25.Auto")], ...(atk.options ?? []).map(o => [o.key, `${o.label} ${o.level}`])])
    };
  }

  /**
   * The two hands with what they hold (weapons, shields, hand-held tools; CR I p.147), and the owned items that can
   * be taken in hand.
   * @param {Item[]} items
   * @param {object} sys
   * @returns {object[]}
   */
  #handRows(items, sys) {
    const hands = sys.hands ?? { right: [], left: [] };
    const held = new Set([...hands.right, ...hands.left].map(i => i.id));
    const order = { weapon: 0, armor: 1, gear: 2 };
    const candidates = items.filter(i => (i.type in order) && (i.system.heldHands > 0) && !held.has(i.id))
      .sort((a, b) => (order[a.type] - order[b.type]) || a.name.localeCompare(b.name))
      .map(i => ({ id: i.id, name: `${i.name}${i.system.heldHands >= 2 ? " (2H)" : ""}` }));
    return ["right", "left"].map(hand => ({
      hand,
      label: `SW25.Slot.${hand}Hand`,
      over: hands[hand].length > 1,
      items: hands[hand].map(i => ({ id: i.id, name: i.name, img: i.img, both: i.system.heldHands >= 2, summary: i.system.summary ?? "" })),
      candidates
    }));
  }

  /**
   * Accessory rows by equipment section (CR I p.294), with the owned accessories that fit each empty section.
   * @param {Item[]} items
   * @returns {object[]}
   */
  #accessorySlots(items) {
    const SW25 = CONFIG.SW25;
    const accessories = items.filter(i => (i.type === "gear") && i.system.slot.length);
    const rows = Object.entries(SW25.accessorySlots).map(([slot, label]) => ({ slot, label, items: [] }));
    for ( const item of accessories ) {
      if ( !item.system.isWorn ) continue;
      const slot = this.#slotOf(item);
      const row = rows.find(r => r.slot === slot) ?? rows.at(-1);
      row.items.push({ id: item.id, name: item.name, img: item.img, summary: item.system.summary });
    }
    for ( const row of rows ) {
      row.over = row.items.length > 1;
      row.candidates = accessories.filter(i => !i.system.isWorn && this.#fitsSlot(i, row.slot))
        .map(i => ({ id: i.id, name: i.name }));
    }
    return rows;
  }

  /**
   * Can an item be worn in a section?
   * @param {Item} item
   * @param {string} slot
   * @returns {boolean}
   */
  #fitsSlot(item, slot) {
    const allowed = item.system.slot ?? [];
    if ( allowed.includes("any") || allowed.includes(slot) ) return true;
    if ( allowed.includes("hand") && ["rightHand", "leftHand"].includes(slot) ) return true;
    return false;
  }

  /**
   * The section an equipped accessory occupies.
   * @param {Item} item
   * @returns {string}
   */
  #slotOf(item) {
    const s = item.system;
    if ( s.equippedSlot && this.#fitsSlot(item, s.equippedSlot) ) return s.equippedSlot;
    const first = s.slot[0];
    if ( first === "hand" ) return "rightHand";
    if ( first === "any" ) return "other";
    return first;
  }

  /**
   * Evasion: candidate classes and the base value.
   * @param {object} sys
   * @returns {object}
   */
  #evasionContext(sys) {
    const keys = new Set(SHEET_EVADERS);
    for ( const cls of Object.values(sys.classes) ) if ( cls.evasion ) keys.add(cls.key);
    return {
      chips: [...keys].map(k => this.#classChip(sys, k, sys.evasionClass === k)),
      base: sys.evasionBase,
      straight: sys.evasionStraight,
      mod: sys.abilities.agi.mod,
      level: sys.evasionStraight ? 0 : sys.evasionBase - sys.abilities.agi.mod,
      options: Object.fromEntries([["", t("SW25.Auto")], ...(sys.evasionOptions ?? []).map(o => [o.class, `${o.label} (${o.value})`])])
    };
  }

  /**
   * Armor and shield rows (equipped first).
   * @param {Item[]} items
   * @param {object} sys
   * @returns {Promise<object[]>}
   */
  async #armorRows(items, sys) {
    const SW25 = CONFIG.SW25;
    const list = items.filter(i => i.type === "armor")
      .sort((a, b) => (Number(b.system.equipped) - Number(a.system.equipped)) || (Number(a.system.isShield) - Number(b.system.isShield)));
    return Promise.all(list.map(async i => ({
      ...(await this._itemRow(i)),
      equipped: i.system.equipped,
      typeLabel: game.i18n.localize(SW25.armorTypes[i.system.armorType] ?? ""),
      isShield: i.system.isShield,
      rank: i.system.rank,
      minStr: i.system.minStr,
      strWarning: i.system.minStr > sys.abilities.str.value,
      evasion: signed(i.system.evasion),
      defense: i.system.defense
    })));
  }

  /**
   * Magic Power circles: every Wizard-type class, plus Bardic Power and Alchemy Power.
   * @param {object} sys
   * @returns {object[]}
   */
  #magicPowers(sys) {
    const SW25 = CONFIG.SW25;
    const out = Object.values(sys.magic ?? {}).map(m => ({
      key: m.system, label: m.classLabel, level: m.level, value: m.power, check: m.check,
      armorPenalty: m.armorPenalty, icon: SW25.magicSystems[m.system]?.icon, tab: m.system
    }));
    if ( sys.classes.bard ) out.push({ key: "bard", label: sys.classes.bard.label, level: sys.classes.bard.level, value: sys.bardicPower, icon: "fa-solid fa-music", tab: "spellsong" });
    if ( sys.classes.alchemist ) out.push({ key: "alchemist", label: sys.classes.alchemist.label, level: sys.classes.alchemist.level, value: sys.alchemyPower, icon: "fa-solid fa-flask", tab: "evocation" });
    return out;
  }

  /**
   * Skill checks grouped by ability, plus the resistance / combat checks.
   * @param {object} sys
   * @returns {object[]}
   */
  #checkGroups(sys) {
    const SW25 = CONFIG.SW25;
    const row = c => ({
      ...c, label: game.i18n.localize(c.label), valueLabel: c.straight ? "—" : c.value,
      sourceLabel: checkSource(c),
      packageLabel: c.package ? SW25.packages[c.package]?.label : ""
    });
    const groups = Object.entries(SW25.skillCheckGroups).map(([ability, keys]) => ({
      ability, label: SW25.abilities[ability].label, letter: SW25.abilities[ability].letter,
      mod: sys.abilities[ability].mod,
      checks: keys.map(k => sys.checks[k]).filter(Boolean).map(row)
    }));
    groups.push({
      ability: "combat", label: "SW25.Checks.Combat",
      checks: ["initiative", "monsterKnowledge", "fortitude", "willpower", "death"].map(k => sys.checks[k]).filter(Boolean).map(row)
    });
    return groups;
  }

  /**
   * Context of one spell row.
   * @param {Item} item
   * @returns {Promise<object>}
   */
  async #spellContext(item) {
    const s = item.system;
    return {
      ...(await this._itemRow(item)),
      level: s.level,
      cost: s.cost?.text || (Number.isInteger(s.cost?.mp) ? `MP${s.cost.mp}` : ""),
      target: s.target?.text ?? "",
      range: s.rangeArea?.text ?? "",
      duration: s.duration?.text ?? ""
    };
  }

  /**
   * Context of one gear row.
   * @param {Item} item
   * @returns {Promise<object>}
   */
  async #gearContext(item) {
    const s = item.system;
    return {
      ...(await this._itemRow(item)),
      quantity: s.quantity,
      ...this.#priceCell(s),
      equipped: s.equipped,
      canEquip: (s.slot.length > 0) || (s.itemType === "improvement") || (s.heldHands > 0),
      equipIcon: (s.heldHands > 0) && !s.slot.length ? "fa-solid fa-hand" : "",
      equipTooltip: (s.heldHands > 0) ? (s.slot.length ? "SW25.Sheet.HoldOrWear" : "SW25.Sheet.HoldToggle") : "",
      grip: this.#gripLabel(item),
      usable: s.isUsable,
      uses: Number.isInteger(s.uses?.max) && s.uses.max > 0 ? `${s.uses.value ?? s.uses.max}/${s.uses.max}` : "",
      // Loot: sold for its price, or turned into a crude material card by an Alchemist
      sellable: (s.itemType === "loot") && Number.isInteger(s.price),
      crude: (s.itemType === "loot") && !!this.actor.system.classes?.alchemist
        && (CONFIG.SW25.cardRanks.includes(s.card?.rank) || (s.price >= 10))
    };
  }

  /**
   * Context of a weapon or armor row of the inventory (they are listed on the Combat tab as well).
   * @param {Item} item
   * @returns {Promise<object>}
   */
  async #possessionContext(item) {
    const SW25 = CONFIG.SW25;
    const s = item.system;
    const weapon = item.type === "weapon";
    const kind = game.i18n.localize(weapon ? (SW25.weaponCategories[s.category] ?? s.category) : (SW25.armorTypes[s.armorType] ?? ""));
    const where = (!weapon && !s.isShield && s.equipped) ? t("SW25.Sheet.Worn") : this.#gripLabel(item);
    return {
      ...(await this._itemRow(item, `inv:${item.id}`)),
      quantity: s.quantity,
      ...this.#priceCell(s),
      equipped: s.equipped,
      canEquip: true,
      equipIcon: weapon ? "fa-solid fa-hand-fist" : (s.isShield ? "fa-solid fa-shield-halved" : "fa-solid fa-shirt"),
      equipTooltip: "SW25.Equip",
      grip: [kind, where].filter(Boolean).join(" · "),
      usable: false,
      uses: ""
    };
  }

  /**
   * Price column of an inventory row: the unit price, and the value of the whole stack in its tooltip.
   * @param {object} s  Item system data
   * @returns {{price: string, priceTooltip: string}}
   */
  #priceCell(s) {
    const value = stackValue(s);
    return {
      price: s.priceText || (Number.isInteger(s.price) ? `${s.price}G` : ""),
      priceTooltip: ((value !== null) && (s.quantity !== 1)) ? t("SW25.Wealth.Stack", { quantity: s.quantity, value: gamels(value) }) : ""
    };
  }

  /**
   * Total wealth: the value of the items and the sum with money and deposit, less the debt.
   * @param {object} sys
   * @returns {object}
   */
  #wealthContext(sys) {
    const w = sys.wealth ?? { items: 0, unpriced: 0, total: 0 };
    const lines = [t("SW25.Wealth.Formula", {
      money: gamels(sys.money), deposit: gamels(sys.deposit), items: gamels(w.items), debt: gamels(sys.debt), total: gamels(w.total)
    })];
    if ( w.unpriced ) lines.push(t("SW25.Wealth.Unpriced", { count: w.unpriced }));
    return { items: gamels(w.items), total: gamels(w.total), negative: w.total < 0, tooltip: lines.join("<br>") };
  }

  /**
   * Flat bonuses on some modifier keys, from items and active effects, plus conditional modifiers.
   * @param {string[]} keys
   * @returns {object[]}
   */
  #bonusLines(keys) {
    const sys = this.actor.system;
    const label = key => game.i18n.localize(CONFIG.SW25.modifierKeys[key] ?? key);
    const lines = [];
    for ( const key of keys ) {
      for ( const src of sys.bonusSources?.[key] ?? [] ) {
        if ( src.value ) lines.push({ source: src.source, label: label(key), value: signed(src.value) });
      }
    }
    for ( const effect of this.actor.appliedEffects ) {
      for ( const change of effect.changes ) {
        const key = change.key.replace(/^system\.bonuses\./, "");
        if ( !keys.includes(key) || (change.key === key) ) continue;
        const value = Number(change.value);
        if ( value ) lines.push({ source: effect.name, label: label(key), value: signed(value), effect: true });
      }
    }
    for ( const mod of sys.conditionalModifiers ?? [] ) {
      if ( !keys.includes(mod.key) ) continue;
      lines.push({ source: mod.source, label: label(mod.key), value: signed(mod.value), condition: mod.condition });
    }
    return lines;
  }

  /**
   * Tooltip listing where the bonuses on some keys come from.
   * @param {string[]} keys
   * @returns {string}
   */
  #sourcesTooltip(keys) {
    return this.#bonusLines(keys).map(l => `${l.source}: ${l.label} ${l.value}${l.condition ? ` (${l.condition})` : ""}`).join("<br>");
  }

  /**
   * Deity names for the datalist: the configured deities plus any deity named by a compendium spell.
   * @returns {Promise<string[]>}
   */
  async #deityOptions() {
    if ( this.constructor._deities ) return this.constructor._deities;
    const names = new Set(Object.keys(CONFIG.SW25.deities ?? {}));
    const pack = game.packs.get("swordworld25.spells");
    if ( pack ) {
      const index = await pack.getIndex({ fields: ["system.deity"] });
      for ( const e of index ) if ( e.system?.deity ) names.add(e.system.deity);
    }
    this.constructor._deities = [...names].sort();
    return this.constructor._deities;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * A "Choose a pregen" button in the title bar, shown while the character is still empty.
   * @override
   */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    if ( this.isEditable && this.window.controls ) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "swp-pregen-head-btn";
      button.dataset.action = "choosePregen";
      button.innerHTML = `<i class="fa-solid fa-users-viewfinder"></i><span>${t("SW25.Pregen.Choose")}</span>`;
      button.dataset.tooltip = "SW25.Pregen.ChooseHint";
      this.window.controls.before(button);
    }
    return frame;
  }

  /** @override */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    if ( this.isEditable ) {
      controls.unshift({ icon: "fa-solid fa-users-viewfinder", label: "SW25.Pregen.Choose", action: "choosePregen" });
    }
    return controls;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.window.header?.querySelector(".swp-pregen-head-btn")?.toggleAttribute("hidden", !isBlankCharacter(this.actor));
    // Language name inputs and the "add language" list
    for ( const input of this.element.querySelectorAll("[data-language-name]") ) {
      input.addEventListener("change", this.#onLanguageName.bind(this));
    }
    for ( const select of this.element.querySelectorAll("select[data-language-add]") ) {
      select.addEventListener("change", this.#onLanguageAdd.bind(this));
    }
    // Equip an accessory into a section from its list
    for ( const select of this.element.querySelectorAll("select[data-slot-assign]") ) {
      select.addEventListener("change", this.#onSlotAssign.bind(this));
    }
    // Take an item in hand from the hand's list
    for ( const select of this.element.querySelectorAll("select[data-hand-assign]") ) {
      select.addEventListener("change", this.#onHandAssign.bind(this));
    }
    // Learn a class from the compendium list
    for ( const select of this.element.querySelectorAll("select[data-class-add]") ) {
      select.addEventListener("change", this.#onClassAdd.bind(this));
    }
    // Second HP/MP inputs (combat tab): unnamed so they never shadow the header inputs in the form data
    for ( const input of this.element.querySelectorAll("input[data-vital]") ) {
      input.addEventListener("change", this.#onVitalChange.bind(this));
    }
  }

  /** Set current HP or MP from the combat tab. */
  async #onVitalChange(event) {
    event.stopPropagation();
    const input = event.currentTarget;
    const value = Number(input.value);
    if ( !Number.isFinite(value) ) return;
    await this.actor.update({ [`system.${input.dataset.vital}.value`]: Math.trunc(value) });
  }

  /** Learn a new class picked from the list (same rules as dropping it: spends the level-1 cost). */
  async #onClassAdd(event) {
    event.stopPropagation();
    const item = await fromUuid(event.currentTarget.value);
    if ( item?.type === "class" ) await this._onDropItemSpecial(event, item);
  }

  /* -------------------------------------------- */
  /*  Drop handling                               */
  /* -------------------------------------------- */

  /** @override */
  _onDragOver(event) {
    super._onDragOver(event);
    // Highlight the equipment section under the cursor
    const row = event.target.closest?.("[data-slot]") ?? null;
    for ( const el of this.element.querySelectorAll(".swp-slot.drop-hover") ) if ( el !== row ) el.classList.remove("drop-hover");
    row?.classList.add("drop-hover");
  }

  /** @override */
  async _onDropItem(event, item) {
    // Weapons, shields and hand-held tools dropped on a hand are held in it
    const hand = event.target?.closest?.("[data-hand]")?.dataset.hand;
    if ( hand && this.actor.isOwner && ["weapon", "armor", "gear"].includes(item.type) ) {
      if ( !(item.system.heldHands > 0) ) {
        ui.notifications.warn(t("SW25.Warn.NotHoldable", { name: item.name }));
        return null;
      }
      let owned = item.parent === this.actor ? item : null;
      if ( !owned ) [owned] = await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
      if ( owned ) await this.#holdIn(owned, hand);
      return owned;
    }
    // Accessories dropped on an equipment section are worn there
    const slot = event.target?.closest?.("[data-slot]")?.dataset.slot;
    if ( slot && this.actor.isOwner && (item.type === "gear") && item.system.slot?.length ) {
      if ( !this.#fitsSlot(item, slot) ) {
        ui.notifications.warn(t("SW25.Warn.WrongSlot", { name: item.name }));
        return null;
      }
      let owned = item.parent === this.actor ? item : null;
      if ( !owned ) [owned] = await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
      await owned?.update({ "system.equipped": true, "system.equippedSlot": slot });
      return owned;
    }
    return super._onDropItem(event, item);
  }

  /** @override */
  async _onDropItemSpecial(event, item) {
    const actor = this.actor;
    if ( item.type === "race" ) {
      const old = actor.items.filter(i => i.type === "race");
      if ( old.length ) await actor.deleteEmbeddedDocuments("Item", old.map(i => i.id));
      const [created] = await actor.createEmbeddedDocuments("Item", [item.toObject()]);
      ui.notifications.info(t("SW25.Race.Set", { name: item.name }));
      return created;
    }
    if ( item.type === "class" ) {
      const key = item.system.key;
      const existing = actor.items.find(i => (i.type === "class") && ((key && i.system.key === key) || (i.name === item.name)));
      if ( existing ) {
        await actor.levelUpClass(existing, { free: event?.shiftKey });
        return existing;
      }
      const restricted = actor.system.race?.system.restrictedClasses ?? [];
      if ( key && restricted.includes(key) ) {
        ui.notifications.warn(t("SW25.Warn.RestrictedClass", { name: item.name }));
        return null;
      }
      const data = item.toObject();
      data.system.level = 1;
      const cost = CONFIG.SW25.expTable[data.system.track]?.[1] ?? 0;
      if ( !event?.shiftKey ) {
        if ( actor.system.exp.value < cost ) {
          ui.notifications.warn(t("SW25.Warn.NotEnoughExp", { cost, have: actor.system.exp.value }));
          return null;
        }
        await actor.update({ "system.exp.value": actor.system.exp.value - cost });
      }
      const [created] = await actor.createEmbeddedDocuments("Item", [data]);
      return created;
    }
    if ( item.type === "feat" ) {
      const { ok, missing } = item.system.checkPrerequisites(actor);
      if ( !ok ) ui.notifications.warn(t("SW25.Warn.Prerequisites", { name: item.name, missing: missing.join(", ") }));
      if ( actor.items.some(i => (i.type === "feat") && (i.name === item.name)) ) return null;
    }
    const learnedClass = CONFIG.SW25.learnedTypes[item.type];
    if ( learnedClass ) {
      const info = actor.system.learned?.[item.type];
      const level = actor.system.classes?.[learnedClass]?.level ?? 0;
      if ( item.system.level > level ) ui.notifications.warn(t("SW25.Warn.AbilityLevel", { name: item.name }));
      if ( info && (info.count >= info.max) ) ui.notifications.warn(t("SW25.Warn.TooManyLearned", { name: item.name }));
      if ( actor.items.some(i => (i.type === item.type) && (i.name === item.name)) ) return null;
    }
    return undefined;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onClassUp(event, target) {
    const item = this._getItem(target);
    if ( item ) await this.actor.levelUpClass(item, { free: event.shiftKey });
  }

  static async #onClassDown(event, target) {
    const item = this._getItem(target);
    if ( item ) await this.actor.levelDownClass(item);
  }

  /**
   * Roll ability dice A–F three times according to the race and pick a set (CR I p.70).
   */
  static async #onRollAbilities() {
    const race = this.actor.system.race;
    if ( !race ) return ui.notifications.warn(t("SW25.Warn.NoRace"));
    const dice = race.system.abilityDice;
    const sets = [];
    for ( let i = 0; i < 3; i++ ) {
      const set = {};
      for ( const k of ABILITY_KEYS ) {
        const formula = String(dice[k] || "2d").replace(/(\d*)d(?!\d)/g, (m, n) => `${n || 1}d6`);
        const roll = await new Roll(formula).evaluate();
        set[k] = roll.total;
      }
      set.total = ABILITY_KEYS.reduce((a, k) => a + set[k], 0);
      sets.push(set);
    }
    const rows = sets.map((s, i) => `<tr><td><input type="radio" name="set" value="${i}" ${i === 0 ? "checked" : ""}></td>${
      ABILITY_KEYS.map(k => `<td>${s[k]}</td>`).join("")}<td><strong>${s.total}</strong></td></tr>`).join("");
    const header = ABILITY_KEYS.map(k => `<th>${CONFIG.SW25.abilities[k].letter} ${game.i18n.localize(CONFIG.SW25.abilities[k].abbr)}</th>`).join("");
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: t("SW25.Generation.RollAbilities"), icon: "fa-solid fa-dice" },
      classes: PAPER_DIALOG,
      position: { width: 460 },
      content: `<p>${t("SW25.Generation.RollAbilitiesHint", { race: race.name })}</p>
        <table class="swp-table swp-dialog-table"><thead><tr><th></th>${header}<th>Σ</th></tr></thead><tbody>${rows}</tbody></table>`,
      buttons: [{
        action: "ok", label: t("SW25.Generation.Apply"), default: true,
        callback: (ev, button) => Number(button.form.elements.set.value)
      }],
      rejectClose: false
    });
    if ( !Number.isInteger(choice) ) return;
    const set = sets[choice];
    const update = {};
    for ( const k of ABILITY_KEYS ) update[`system.abilities.${k}.rolled`] = set[k];
    await this.actor.update(update);
  }

  /**
   * Choose a background from the race: base abilities, starting classes and experience (CR I p.62).
   */
  static async #onChooseBackground() {
    const actor = this.actor;
    const race = actor.system.race;
    if ( !race?.system.backgrounds?.length ) return ui.notifications.warn(t("SW25.Warn.NoBackgrounds"));
    const backgrounds = race.system.backgrounds;
    const options = backgrounds.map((b, i) => `<option value="${i}">${b.roll} — ${b.name} (${b.classes || "—"}) ${b.skill}/${b.body}/${b.mind}, ${b.exp} EXP${b.gmOnly ? " *" : ""}</option>`).join("");
    const index = await foundry.applications.api.DialogV2.wait({
      window: { title: t("SW25.Generation.Background"), icon: "fa-solid fa-scroll" },
      classes: PAPER_DIALOG,
      position: { width: 520 },
      content: `<p>${t("SW25.Generation.BackgroundHint")}</p><select name="bg">${options}</select>
        <label class="swp-check"><input type="checkbox" name="roll"> ${t("SW25.Generation.RollBackground")}</label>`,
      buttons: [{
        action: "ok", label: t("SW25.Generation.Apply"), default: true,
        callback: (ev, button) => ({ index: Number(button.form.elements.bg.value), roll: button.form.elements.roll.checked })
      }],
      rejectClose: false
    });
    if ( !index ) return;
    let bg = backgrounds[index.index];
    if ( index.roll ) {
      const roll = await new Roll("2d6").evaluate();
      await roll.toMessage({ flavor: t("SW25.Generation.Background"), speaker: ChatMessage.getSpeaker({ actor }) });
      bg = backgrounds.find(b => {
        const m = String(b.roll).match(/(\d+)\s*[-–]?\s*(\d+)?/);
        if ( !m ) return false;
        const lo = Number(m[1]);
        const hi = Number(m[2] ?? m[1]);
        return (roll.total >= lo) && (roll.total <= hi);
      }) ?? bg;
    }
    await actor.update({
      "system.base.skill": bg.skill,
      "system.base.body": bg.body,
      "system.base.mind": bg.mind,
      "system.details.background": bg.name,
      "system.exp.value": bg.exp,
      "system.exp.total": bg.exp
    });
    // Starting classes
    const text = bg.classes ?? "";
    if ( !text || /none/i.test(text) ) return;
    let names;
    if ( /\bor\b/i.test(text) ) {
      const opts = text.split(/\s+or\s+/i).map(s => s.trim());
      const pick = await foundry.applications.api.DialogV2.wait({
        window: { title: t("SW25.Generation.StartingClass") },
        classes: PAPER_DIALOG,
        content: `<select name="c">${opts.map(o => `<option>${foundry.utils.escapeHTML(o)}</option>`).join("")}</select>`,
        buttons: [{ action: "ok", label: "OK", default: true, callback: (ev, b) => b.form.elements.c.value }],
        rejectClose: false
      });
      names = pick ? [pick] : [];
    } else names = text.split(/\s*&\s*/).map(s => s.trim());
    await this.#grantClasses(names);
  }

  /**
   * Add level-1 classes by name from the compendium (free).
   * @param {string[]} names
   */
  async #grantClasses(names) {
    const pack = game.packs.get("swordworld25.classes");
    if ( !pack ) return;
    const index = await pack.getIndex({ fields: ["system.key"] });
    const aliases = { Shooter: "Marksman", Magitech: "Artificer", "Magitech User": "Artificer" };
    for ( const raw of names ) {
      const name = aliases[raw] ?? raw;
      const entry = index.find(e => e.name.toLowerCase() === name.toLowerCase());
      if ( !entry ) continue;
      if ( this.actor.items.some(i => (i.type === "class") && (i.name === entry.name)) ) continue;
      const doc = await pack.getDocument(entry._id);
      const data = doc.toObject();
      data.system.level = 1;
      await this.actor.createEmbeddedDocuments("Item", [data]);
    }
  }

  /** Open the sample characters (Easy Creation, CR I p.20). */
  static #onChoosePregen() {
    PregenPicker.open(this.actor);
  }

  /**
   * Ability growth after a session (CR I p.190): roll 2d, pick one of the two abilities.
   */
  static async #onRollGrowth() {
    const roll = await new Roll("2d6").evaluate();
    const faces = roll.dice[0].results.map(r => r.result);
    const keys = [...new Set(faces.map(f => CONFIG.SW25.growthDie[f]))];
    await roll.toMessage({ flavor: t("SW25.Growth.Roll"), speaker: ChatMessage.getSpeaker({ actor: this.actor }) });
    let key = keys[0];
    if ( keys.length > 1 ) {
      key = await foundry.applications.api.DialogV2.wait({
        window: { title: t("SW25.Growth.Choose") },
        classes: PAPER_DIALOG,
        content: `<p>${t("SW25.Growth.ChooseHint")}</p>`,
        buttons: keys.map(k => ({
          action: k, label: game.i18n.localize(CONFIG.SW25.abilities[k].label), callback: () => k
        })),
        rejectClose: false
      });
    }
    if ( !key ) return;
    const growth = this.actor.system.abilities[key].growth + 1;
    await this.actor.update({ [`system.abilities.${key}.growth`]: growth });
    ui.notifications.info(t("SW25.Growth.Done", { ability: game.i18n.localize(CONFIG.SW25.abilities[key].label) }));
  }

  /* -------------------------------------------- */
  /*  Languages                                   */
  /* -------------------------------------------- */

  /** Toggle "speak" or "write" of a language row, adding or removing the stored entry as needed. */
  static async #onLanguageToggle(event, target) {
    const { langKey, index } = target.closest("[data-lang-key]").dataset;
    const field = target.dataset.field;
    if ( !["speak", "write"].includes(field) ) return;
    const cfg = CONFIG.SW25.languages[langKey] ?? null;
    const languages = this.actor.system.toObject().languages;
    if ( index === "" ) {
      languages.push({ key: langKey, name: "", speak: field === "speak", write: field === "write" });
    } else {
      const i = Number(index);
      const entry = languages[i];
      if ( !entry ) return;
      entry[field] = !entry[field];
      if ( cfg && !entry.key ) entry.key = langKey;
      // A printed language nobody speaks nor writes is simply unlearned again
      if ( cfg?.sheet && !entry.speak && !entry.write && !(cfg.dialect && entry.name) ) languages.splice(i, 1);
    }
    await this.actor.update({ "system.languages": languages });
  }

  /** Name of a custom language or of a regional dialect. */
  async #onLanguageName(event) {
    event.stopPropagation();
    const input = event.currentTarget;
    const { langKey, index } = input.closest("[data-lang-key]").dataset;
    const languages = this.actor.system.toObject().languages;
    if ( index === "" ) languages.push({ key: langKey, name: input.value, speak: true, write: true });
    else if ( languages[Number(index)] ) languages[Number(index)].name = input.value;
    await this.actor.update({ "system.languages": languages });
  }

  /** Add a language from the list (or an empty custom row). */
  async #onLanguageAdd(event) {
    event.stopPropagation();
    const key = event.currentTarget.value;
    if ( !key ) return;
    const cfg = CONFIG.SW25.languages[key];
    const languages = this.actor.system.toObject().languages;
    if ( cfg ) languages.push({ key, name: "", speak: cfg.speak !== false, write: cfg.write !== false });
    else languages.push({ key: "", name: "", speak: true, write: true });
    await this.actor.update({ "system.languages": languages });
  }

  static async #onLanguageDelete(event, target) {
    const i = Number(target.closest("[data-lang-key]")?.dataset.index);
    if ( !Number.isInteger(i) ) return;
    const languages = this.actor.system.toObject().languages;
    languages.splice(i, 1);
    await this.actor.update({ "system.languages": languages });
  }

  /* -------------------------------------------- */
  /*  Tallies, rank, class resources              */
  /* -------------------------------------------- */

  /** Click a tally box: fill up to it, or clear it if it is the last filled one. */
  static async #onSetTally(event, target) {
    const { field } = target.dataset;
    const value = Number(target.dataset.value) || 0;
    const current = foundry.utils.getProperty(this.actor.system, field) ?? 0;
    const next = event.shiftKey ? 0 : (current === value ? value - 1 : value);
    await this.actor.update({ [`system.${field}`]: Math.max(0, next) });
  }

  /** Buy the next Adventurer Rank with Reputation (Shift: free correction). */
  static async #onRankUp(event) {
    const sys = this.actor.system;
    const next = CONFIG.SW25.adventurerRank(sys.rank + 1);
    const free = event.shiftKey;
    if ( !free && (sys.reputation.value < next.cost) ) {
      return ui.notifications.warn(t("SW25.Warn.NotEnoughReputation", { cost: next.cost, have: sys.reputation.value }));
    }
    const update = { "system.rank": sys.rank + 1 };
    if ( !free ) update["system.reputation.value"] = sys.reputation.value - next.cost;
    await this.actor.update(update);
    ui.notifications.info(t("SW25.AdvRank.Promoted", { name: this.actor.name, rank: this.#rankLabel(next) }));
  }

  /** Step the rank back, refunding its Reputation (Shift: no refund). */
  static async #onRankDown(event) {
    const sys = this.actor.system;
    if ( sys.rank <= 0 ) return;
    const current = CONFIG.SW25.adventurerRank(sys.rank);
    const update = { "system.rank": sys.rank - 1 };
    if ( !event.shiftKey ) update["system.reputation.value"] = sys.reputation.value + current.cost;
    await this.actor.update(update);
  }

  static async #onFairyElement(event, target) {
    const key = target.dataset.element;
    const set = new Set(this.actor.system.fairyElements);
    if ( set.has(key) ) set.delete(key);
    else {
      if ( set.size >= 4 ) return ui.notifications.warn(t("SW25.Warn.FairyElements"));
      set.add(key);
    }
    await this.actor.update({ "system.fairyElements": [...set] });
  }

  static async #onRhythmAdjust(event, target) {
    const key = target.dataset.rhythm;
    const delta = Number(target.dataset.delta) || 0;
    const value = Math.max(0, (this.actor.system.rhythm[key] ?? 0) + delta);
    await this.actor.update({ [`system.rhythm.${key}`]: value });
  }

  static async #onCardAdjust(event, target) {
    const { color, rank } = target.dataset;
    const delta = (Number(target.dataset.delta) || 0) * (event.shiftKey ? 5 : 1);
    const value = Math.max(0, (this.actor.system.cards[color]?.[rank] ?? 0) + delta);
    await this.actor.update({ [`system.cards.${color}.${rank}`]: value });
  }

  /* -------------------------------------------- */
  /*  Combat                                      */
  /* -------------------------------------------- */

  static async #onWeaponMode(event, target) {
    const item = this._getItem(target);
    if ( !item ) return;
    // A single stance cell cycles through the modes
    const mode = target.dataset.mode !== undefined ? Number(target.dataset.mode)
      : (item.system.mode + 1) % Math.max(1, item.system.modes.length);
    await item.update({ "system.mode": mode || 0 });
  }

  static #onWeaponDamage(event, target) {
    const item = this._getItem(target);
    if ( item ) return rollWeaponDamage(this.actor, item, { event });
  }

  static #onLootSell(event, target) {
    const item = this._getItem(target);
    if ( item ) return sellLoot(this.actor, item);
  }

  static #onLootCard(event, target) {
    const item = this._getItem(target);
    if ( item ) return makeCrudeCard(this.actor, item);
  }

  static #onGunReload(event, target) {
    const item = this._getItem(target);
    if ( item ) return reloadGun(this.actor, item);
  }

  /** Wear an owned accessory in a section (from the section's list). */
  async #onSlotAssign(event) {
    event.stopPropagation();
    const select = event.currentTarget;
    const item = this.actor.items.get(select.value);
    if ( !item ) return;
    await item.update({ "system.equipped": true, "system.equippedSlot": select.dataset.slotAssign });
  }

  /** Take an owned item in a hand (from the hand's list). */
  async #onHandAssign(event) {
    event.stopPropagation();
    const select = event.currentTarget;
    const item = this.actor.items.get(select.value);
    if ( item ) await this.#holdIn(item, select.dataset.handAssign);
  }

  /**
   * Hold an item in a hand. A single-handed item already there moves to the other hand when that one is free (so
   * dropping an item on the other hand swaps them); a two-handed item fills both hands.
   * @param {Item} item
   * @param {string} hand  right | left
   * @returns {Promise<void>}
   */
  async #holdIn(item, hand) {
    const hands = this.actor.system.hands;
    const both = item.system.heldHands >= 2;
    const update = { _id: item.id, "system.equipped": true, "system.hand": both ? "" : hand };
    // An item that can also be worn (magical implement) is now held: a wand rather than a ring
    if ( item.system.slot?.length ) update["system.equippedSlot"] = "held";
    const updates = [update];
    if ( !both ) {
      const other = hand === "right" ? "left" : "right";
      const occupants = hands[hand].filter(i => i !== item);
      const otherBusy = hands[other].some(i => i !== item);
      if ( (occupants.length === 1) && (occupants[0].system.heldHands < 2) && !otherBusy ) {
        updates.push({ _id: occupants[0].id, "system.hand": other });
      }
    }
    await this.actor.updateEmbeddedDocuments("Item", updates);
    if ( this.actor.system.hands?.over ) ui.notifications.warn(t("SW25.Warn.HandsFull", { name: item.name }));
  }

  /**
   * Equip or put away an item. Held items (weapons, shields, hand-held tools) take a free hand, shields the left one
   * first; an item that can be held or worn (magical implement) is held unless it was last worn in a section.
   */
  static async #onItemToggleEquip(event, target) {
    const item = this._getItem(target);
    if ( !item ) return;
    const s = item.system;
    if ( s.equipped ) return item.update({ "system.equipped": false });
    const wornBefore = s.slot?.length && s.equippedSlot && (s.equippedSlot !== "held");
    if ( (s.heldHands > 0) && !wornBefore ) {
      const free = this.actor.system.freeHandFor(item);
      return this.#holdIn(item, free === "left" ? "left" : "right");
    }
    return item.update({ "system.equipped": true });
  }

  /**
   * Where an equipped gear item is: "Held: Right hand", "Worn: Neck".
   * @param {Item} item
   * @returns {string}
   */
  #gripLabel(item) {
    const s = item.system;
    if ( s.isHeld ) {
      const hands = this.actor.system.hands ?? { right: [], left: [] };
      const inRight = hands.right.includes(item);
      const inLeft = hands.left.includes(item);
      const where = (inRight && inLeft) ? t("SW25.Sheet.BothHands") : t(inLeft ? "SW25.Slot.leftHand" : "SW25.Slot.rightHand");
      return `${t("SW25.Sheet.Held")}: ${where}`;
    }
    if ( s.isWorn ) return `${t("SW25.Sheet.Worn")}: ${t(CONFIG.SW25.accessorySlots[this.#slotOf(item)] ?? "")}`;
    return "";
  }

  static async #onSlotClear(event, target) {
    const item = this._getItem(target);
    if ( item ) await item.update({ "system.equipped": false });
  }

  /** Damage or heal HP/MP by the amount typed next to the bar (Shift: plain change, no defense). */
  static async #onResourceHit(event, target) {
    const { resource, mode } = target.dataset;
    const input = target.closest("[data-resource-box]")?.querySelector("input.swp-amount");
    const amount = Math.abs(Number(input?.value) || 0);
    if ( !amount ) return input?.focus();
    const heal = mode === "heal";
    const actor = this.actor;
    if ( event.shiftKey ) {
      const { value, max } = actor.system[resource];
      const next = heal ? Math.min(max, value + amount) : value - amount;
      await actor.update({ [`system.${resource}.value`]: resource === "mp" ? Math.max(0, next) : next });
    }
    else await applyDamageTo(actor, { amount, kind: "fixed", heal, mp: resource === "mp", source: actor.name });
    if ( input ) input.value = "";
  }

  /** Show the full power table (CR I p.135). */
  static async #onPowerTable(event, target) {
    const item = this._getItem(target);
    const highlight = new Set(this.actor.items.filter(i => (i.type === "weapon") && Number.isInteger(i.system.attack?.power))
      .map(i => i.system.attack.power));
    if ( Number.isInteger(item?.system.attack?.power) ) highlight.add(item.system.attack.power);
    const head = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => `<th><span class="swp-circ">${n}</span></th>`).join("");
    const rows = POWER_TABLE.map((row, power) => `<tr class="${highlight.has(power) ? "hl" : ""}"><th>${power}</th><td>✻</td>${
      row.map(v => `<td>${v}</td>`).join("")}</tr>`).join("");
    await foundry.applications.api.DialogV2.prompt({
      window: { title: t("SW25.PowerTable.Title"), icon: "fa-solid fa-table-cells" },
      classes: ["sw25", "swp", "swp-power-dialog", "themed", "theme-light"],
      position: { width: 520, height: 640 },
      content: `<div class="swp-power-scroll"><table class="swp-table swp-power-table"><thead><tr><th>${t("SW25.Power")}</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`,
      ok: { label: t("Close") },
      rejectClose: false,
      render: (event, dialog) => dialog.element.querySelector("tr.hl")?.scrollIntoView({ block: "center" })
    });
  }

  static #onMonsterKnowledge(event) {
    return rollMonsterKnowledge(this.actor, event);
  }

  static #onDeathCheck(event) {
    return rollDeathCheck(this.actor, event);
  }

  static async #onRest() {
    const hours = await foundry.applications.api.DialogV2.wait({
      window: { title: t("SW25.Rest.Title"), icon: "fa-solid fa-bed" },
      classes: PAPER_DIALOG,
      content: `<p>${t("SW25.Rest.Hint")}</p>`,
      buttons: [
        { action: "3", label: t("SW25.Rest.Short"), callback: () => 3 },
        { action: "6", label: t("SW25.Rest.Long"), default: true, callback: () => 6 }
      ],
      rejectClose: false
    });
    if ( hours ) await this.actor.rest(hours);
  }

  static async #onAwardExp() {
    const value = await foundry.applications.api.DialogV2.prompt({
      window: { title: t("SW25.Exp.Award"), icon: "fa-solid fa-star" },
      classes: PAPER_DIALOG,
      content: `<label class="swp-field">${t("SW25.Exp.Amount")}<input type="number" name="exp" value="1000" autofocus></label>`,
      ok: { callback: (ev, button) => Number(button.form.elements.exp.value) || 0 },
      rejectClose: false
    });
    if ( !value ) return;
    const sys = this.actor.system;
    await this.actor.update({ "system.exp.value": sys.exp.value + value, "system.exp.total": sys.exp.total + value });
  }

  static async #onChangeFate() {
    const used = this.actor.system.daily.changeFate;
    await this.actor.update({ "system.daily.changeFate": !used });
  }

  /** Buy the Adventurer Set from the item compendium (Shift: add it for free). */
  static async #onAddAdventurerSet(event) {
    const pack = game.packs.get("swordworld25.gear");
    const index = await pack?.getIndex({ fields: ["system.price"] });
    const entry = index?.find(e => /^adventurer.?s? set$/i.test(e.name));
    if ( !entry ) return;
    const price = entry.system?.price ?? 0;
    const money = this.actor.system.money;
    if ( !event.shiftKey && (money < price) ) {
      return ui.notifications.warn(t("SW25.Warn.NotEnoughMoney", { cost: price, have: money }));
    }
    const doc = await pack.getDocument(entry._id);
    await this.actor.createEmbeddedDocuments("Item", [doc.toObject()]);
    if ( !event.shiftKey ) await this.actor.update({ "system.money": money - price });
  }

  /** Post a racial ability to chat. */
  static async #onTraitChat(event, target) {
    const race = this.actor.system.race;
    const trait = race?.system.traits?.[Number(target.dataset.index)];
    if ( !trait ) return;
    await createCard({
      kind: "use",
      actorUuid: this.actor.uuid,
      title: trait.name,
      subtitle: `${t("SW25.Sheet.RacialAbilities")} · ${race.name}`,
      img: race.img,
      summary: trait.description,
      targets: []
    }, { speaker: speakerFor(this.actor) });
  }
}
