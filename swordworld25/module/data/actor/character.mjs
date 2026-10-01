import ActorBaseModel from "./base.mjs";
import { boolField, intField, stringField } from "../fields.mjs";
import { stackValue } from "../item/equipment.mjs";

const { ArrayField, HTMLField, SchemaField, StringField } = foundry.data.fields;

const ABILITY_KEYS = ["dex", "agi", "str", "vit", "int", "spi"];

/**
 * Player character data model.
 */
export default class CharacterModel extends ActorBaseModel {

  /** @override */
  static defineSchema() {
    const ability = () => new SchemaField({
      rolled: intField(0),
      growth: intField(0),
      other: intField(0)
    });
    const cardRanks = () => new SchemaField({ B: intField(0, { min: 0 }), A: intField(0, { min: 0 }), S: intField(0, { min: 0 }), SS: intField(0, { min: 0 }) });
    return {
      ...super.defineSchema(),
      details: new SchemaField({
        background: stringField(""),
        age: stringField(""),
        gender: stringField(""),
        height: stringField(""),
        weight: stringField(""),
        hair: stringField(""),
        eyes: stringField(""),
        skin: stringField(""),
        player: stringField(""),
        biography: new HTMLField({ required: true, blank: true, initial: "" }),
        notes: new HTMLField({ required: true, blank: true, initial: "" })
      }),
      base: new SchemaField({
        skill: intField(0),
        body: intField(0),
        mind: intField(0)
      }),
      abilities: new SchemaField(Object.fromEntries(ABILITY_KEYS.map(k => [k, ability()]))),
      exp: new SchemaField({
        value: intField(0),
        total: intField(0)
      }),
      money: intField(0),
      deposit: intField(0),
      debt: intField(0),
      reputation: new SchemaField({
        value: intField(0),
        total: intField(0)
      }),
      rank: intField(0, { min: 0 }),
      disgrace: intField(0),
      swordShards: intField(0, { min: 0 }),
      abyssShards: intField(0, { min: 0 }),
      soulscars: intField(0, { min: 0 }),
      fumbles: intField(0, { min: 0 }),
      deity: stringField(""),
      fairyElements: new ArrayField(new StringField()),
      rhythm: new SchemaField({
        up: intField(0, { min: 0 }),
        down: intField(0, { min: 0 }),
        heart: intField(0, { min: 0 })
      }),
      cards: new SchemaField({
        red: cardRanks(), green: cardRanks(), black: cardRanks(), white: cardRanks(), gold: cardRanks()
      }),
      languages: new ArrayField(new SchemaField({
        key: stringField(""),
        name: stringField(""),
        speak: boolField(true),
        write: boolField(true)
      })),
      daily: new SchemaField({
        changeFate: boolField(false),
        hpConversion: intField(0, { min: 0 }),
        wings: intField(0, { min: 0 })
      }),
      settings: new SchemaField({
        evasionClass: stringField(""),
        magicPowerAbility: stringField("int")
      })
    };
  }

  /* -------------------------------------------- */
  /*  Derived data                                */
  /* -------------------------------------------- */

  /** @override */
  prepareDerivedData() {
    const actor = this.parent;
    const SW25 = CONFIG.SW25;
    this._applyItemModifiers();

    // Race
    const race = actor.items.find(i => i.type === "race") ?? null;
    this.race = race;

    // Classes
    this.classes = {};
    this.wizardLevels = 0;
    for ( const item of actor.items ) {
      if ( item.type !== "class" ) continue;
      const cls = item.system;
      const key = cls.key || item.name.slugify({ strict: true });
      this.classes[key] = {
        key, item, level: cls.level, label: item.name, category: cls.category, track: cls.track,
        wizard: cls.isWizard, magic: cls.magic, attack: cls.attack, evasion: cls.evasion,
        halfStrength: cls.halfStrength, critical: cls.critical, abilityType: cls.abilityType,
        extraChecks: cls.extraChecks
      };
      if ( cls.isWizard ) this.wizardLevels += cls.level;
    }
    const levels = Object.values(this.classes).map(c => c.level);
    this.level = levels.length ? Math.max(...levels) : 0;

    // Ability scores and modifiers
    for ( const key of ABILITY_KEYS ) {
      const abl = this.abilities[key];
      const baseKey = SW25.abilities[key].base;
      abl.base = this.base[baseKey] ?? 0;
      abl.value = Math.max(0, abl.base + abl.rolled + abl.growth + abl.other + (this.bonuses.ability[key] ?? 0));
      abl.mod = Math.floor(abl.value / 6) + (this.bonuses.mod[key] ?? 0);
      abl.label = SW25.abilities[key].label;
      abl.abbr = SW25.abilities[key].abbr;
    }

    // HP / MP
    const b = this.bonuses;
    this.hp.max = Math.max(0, this.abilities.vit.value + (this.level * 3) + b.hpMax);
    const noMP = race?.system.noMP ?? false;
    this.mp.max = noMP ? 0 : Math.max(0, this.abilities.spi.value + (this.wizardLevels * 3) + b.mpMax);
    // HP may go below 0 (death checks), never above the maximum; MP stays within 0..max
    this.hp.value = Math.min(this.hp.value, this.hp.max);
    this.mp.value = Math.clamp(this.mp.value, 0, this.mp.max);
    this.hp.pct = this.hp.max ? Math.clamp(Math.round((this.hp.value / this.hp.max) * 100), 0, 100) : 0;
    this.mp.pct = this.mp.max ? Math.clamp(Math.round((this.mp.value / this.mp.max) * 100), 0, 100) : 0;

    // Equipment
    this._prepareEquipment();

    // Checks
    this._prepareChecks();

    // Resistances
    this.fortitude = this.level + this.abilities.vit.mod + b.fortitude + b.allChecks;
    this.willpower = this.level + this.abilities.spi.mod + b.willpower + b.allChecks;

    // Magic
    this._prepareMagic();

    // Combat
    this._prepareCombat();

    // Movement
    const agi = this.abilities.agi.value;
    const move = Math.max(0, agi + b.movement);
    this.movement = { limited: Math.min(3, move), normal: move, full: move * 3 };

    // Feats
    this.featSlots = this.level > 0 ? Math.floor((this.level + 1) / 2) : 0;
    this.featsLearned = actor.items.filter(i => (i.type === "feat") && (i.system.acquisition !== "automatic")).length;

    // Experience
    this.expSpent = Object.values(this.classes).reduce((t, c) => t + (c.item.system.totalExp ?? 0), 0);

    // Adventurer Rank
    this.rankInfo = SW25.adventurerRank(this.rank);

    // Wealth
    this._prepareWealth();

    // Learned class abilities
    this.learned = {};
    for ( const [type, cls] of Object.entries(SW25.learnedTypes) ) {
      this.learned[type] = { class: cls, max: this.classes[cls]?.level ?? 0, count: 0 };
    }
    for ( const item of actor.items ) {
      if ( this.learned[item.type] ) this.learned[item.type].count += 1;
    }
    // Bard songs and finales share the same allowance.
    if ( this.learned.spellsong ) {
      const bardCount = this.learned.spellsong.count + this.learned.finale.count;
      this.learned.spellsong.count = this.learned.finale.count = bardCount;
    }
  }

  /* -------------------------------------------- */

  /**
   * Total wealth: money and deposit, plus the market value of everything carried (weapons, armor, items), less the
   * debt. Items without a fixed price are counted apart.
   * @protected
   */
  _prepareWealth() {
    let items = 0;
    let unpriced = 0;
    for ( const item of this.parent.items ) {
      if ( !["weapon", "armor", "gear"].includes(item.type) || !(item.system.quantity > 0) ) continue;
      const value = stackValue(item.system);
      if ( value === null ) unpriced += 1;
      else items += value;
    }
    this.wealth = { items, unpriced, total: this.money + this.deposit + items - this.debt };
  }

  /* -------------------------------------------- */

  /**
   * Equipped armor, shields and accessories.
   * @protected
   */
  _prepareEquipment() {
    const actor = this.parent;
    const equipped = actor.items.filter(i => i.system.equipped);
    this.armor = equipped.find(i => (i.type === "armor") && !i.system.isShield) ?? null;
    this.shields = equipped.filter(i => (i.type === "armor") && i.system.isShield);
    this.shield = this.shields[0] ?? null;
    this.weapons = actor.items.filter(i => i.type === "weapon");
    this.equippedWeapons = this.weapons.filter(i => i.system.equipped);
    this.wearingMetal = !!this.armor?.system.isMetal;
    this.hands = CharacterModel.#assignHands(actor.items.filter(i => i.system.isHeld && (i.system.heldHands > 0)));
  }

  /**
   * Put the held items in the hands: a two-handed item fills both, the others go to their chosen hand, else to a
   * free one (shields to the left hand first, anything else to the right one).
   * @param {Item[]} items
   * @returns {{right: Item[], left: Item[], over: boolean}}
   */
  static #assignHands(items) {
    const hands = { right: [], left: [] };
    const single = [];
    for ( const item of items ) {
      if ( item.system.heldHands < 2 ) single.push(item);
      else {
        hands.right.push(item);
        hands.left.push(item);
      }
    }
    const chosen = single.filter(i => i.system.hand in hands);
    for ( const item of chosen ) hands[item.system.hand].push(item);
    for ( const item of single ) {
      if ( chosen.includes(item) ) continue;
      const prefer = item.system.isShield ? "left" : "right";
      const other = prefer === "right" ? "left" : "right";
      hands[(!hands[prefer].length || hands[other].length) ? prefer : other].push(item);
    }
    return { ...hands, over: (hands.right.length > 1) || (hands.left.length > 1) };
  }

  /**
   * A hand free for an item.
   * @param {Item} item
   * @returns {string|null}  right | left | both (a two-handed item and both hands free) | null (no free hand)
   */
  freeHandFor(item) {
    const busy = hand => this.hands[hand].some(i => i !== item);
    if ( item.system.heldHands >= 2 ) return (!busy("right") && !busy("left")) ? "both" : null;
    const prefer = item.system.isShield ? "left" : "right";
    const other = prefer === "right" ? "left" : "right";
    if ( !busy(prefer) ) return prefer;
    return busy(other) ? null : other;
  }

  /* -------------------------------------------- */

  /**
   * Compute the standard value of every skill check.
   * @protected
   */
  _prepareChecks() {
    const SW25 = CONFIG.SW25;
    const b = this.bonuses;
    this.checks = {};
    const raceOptions = this.race?.system.extraCheckOptions ?? [];
    for ( const [key, cfg] of Object.entries(SW25.checks) ) {
      const options = [...cfg.options];
      for ( const opt of raceOptions ) {
        if ( (opt.check !== key) || (this.level < (opt.minLevel ?? 1)) ) continue;
        options.push({ source: opt.source || "adventurer", ability: opt.ability || cfg.ability, note: opt.trait || this.race.name });
      }
      for ( const cls of Object.values(this.classes) ) {
        if ( cls.extraChecks?.includes(key) ) options.push(cls.key);
      }
      let best = null;
      for ( const option of options ) {
        const source = typeof option === "string" ? option : option.source;
        const ability = (typeof option === "object" && option.ability) ? option.ability : cfg.ability;
        let level;
        let label;
        if ( source === "adventurer" ) {
          level = this.level;
          label = "SW25.AdventurerLevel";
        } else if ( source === "any" ) {
          const top = Object.values(this.classes).sort((x, y) => y.level - x.level)[0];
          level = top?.level ?? 0;
          label = top?.label ?? "";
        } else {
          const cls = this.classes[source];
          if ( !cls || (cls.level <= 0) ) continue;
          level = cls.level;
          label = cls.label;
        }
        if ( !level ) continue;
        const value = level + (this.abilities[ability]?.mod ?? 0);
        const note = (typeof option === "object" && option.note) ? option.note : "";
        if ( !best || (value > best.value) ) best = { value, level, ability, source, label, note };
      }
      const straight = !best;
      let bonus = (b.check[key] ?? 0) + b.allChecks;
      // The adventurer's Climb is the same check with another standard value: Climb modifiers count for it too
      if ( key === "climbStr" ) bonus += b.check.climb ?? 0;
      if ( !cfg.notAction ) bonus += b.actionChecks;
      if ( cfg.package ) bonus += b[SW25.packageModifier[cfg.package]] ?? 0;
      if ( key === "initiative" ) bonus += b.initiative;
      if ( key === "monsterKnowledge" ) bonus += b.monsterKnowledge;
      if ( key === "performance" ) bonus += b.performance;
      if ( key === "evocation" ) bonus += b.evocation;
      if ( key === "riding" ) bonus += b.riding;
      if ( cfg.metalArmor && this.wearingMetal ) bonus += cfg.metalArmor;
      this.checks[key] = {
        key,
        label: `SW25.Check.${key}`,
        straight,
        base: best?.value ?? 0,
        bonus,
        value: (best?.value ?? 0) + bonus,
        ability: best?.ability ?? cfg.ability,
        source: best?.source ?? null,
        sourceLabel: best?.label ?? "",
        sourceNote: best?.note ?? "",
        package: cfg.package ?? null
      };
    }
    this.initiative = this.checks.initiative.value;
    this.monsterKnowledge = this.checks.monsterKnowledge.value;
    this.monsterKnowledgeSource = this.checks.monsterKnowledge.source;

    // Packages summary for the sheet
    this.packages = {};
    for ( const [key, pkg] of Object.entries(SW25.packages) ) {
      const list = [];
      for ( const cls of pkg.classes ) {
        const c = this.classes[cls];
        if ( !c ) continue;
        list.push({
          class: cls, label: c.label, level: c.level,
          value: c.level + this.abilities[pkg.ability].mod + (this.bonuses[SW25.packageModifier[key]] ?? 0)
        });
      }
      this.packages[key] = list;
    }
  }

  /* -------------------------------------------- */

  /**
   * Magic Power of every magic system the character can use.
   * @protected
   */
  _prepareMagic() {
    const SW25 = CONFIG.SW25;
    const b = this.bonuses;
    const int = this.abilities.int.mod;
    this.magic = {};
    for ( const cls of Object.values(this.classes) ) {
      if ( !cls.wizard ) continue;
      const penalty = this._spellcastingArmorPenalty(cls.magic);
      this.magic[cls.magic] = {
        system: cls.magic,
        class: cls.key,
        classLabel: cls.label,
        level: cls.level,
        power: cls.level + int + b.magicPower,
        check: cls.level + int + b.magicPower + b.spellcasting + b.actionChecks + b.allChecks + penalty,
        armorPenalty: penalty,
        label: SW25.magicSystems[cls.magic]?.label ?? cls.magic
      };
    }
    // Bard and Alchemist powers
    const bard = this.classes.bard;
    this.bardicPower = bard ? bard.level + this.abilities.spi.mod : 0;
    const alch = this.classes.alchemist;
    this.alchemyPower = alch ? alch.level + int : 0;
  }

  /**
   * Armor penalty to spellcasting for a magic system (CR I p.176, CR II p.95).
   * @param {string} system
   * @returns {number}
   * @protected
   */
  _spellcastingArmorPenalty(system) {
    if ( this.parent.statuses?.has("alternateForm") ) return 0;
    const armor = this.armor?.system;
    if ( !armor ) return 0;
    if ( ["truespeech", "spiritualism"].includes(system) ) {
      if ( armor.isMetal ) return -4;
      if ( armor.minStr >= 10 ) return -2;
    }
    if ( (system === "fairy") && armor.isMetal ) return -4;
    return 0;
  }

  /* -------------------------------------------- */

  /**
   * Accuracy, damage and evasion values, and per-weapon attack data.
   * @protected
   */
  _prepareCombat() {
    const b = this.bonuses;
    const abl = this.abilities;
    const str = abl.str.value;

    // Defense
    let defense = 0;
    if ( this.armor ) defense += this.armor.system.defense;
    if ( this.shield ) defense += this.shield.system.defense;
    const weaponDefense = Math.max(0, ...this.equippedWeapons.map(w => w.system.defenseBonus || 0));
    defense += weaponDefense;
    this.defense = defense + b.defense;

    // Evasion
    const armorEvasion = this._equipmentEvasion(str);
    const candidates = [];
    for ( const cls of Object.values(this.classes) ) {
      if ( !cls.evasion ) continue;
      if ( !this._canEvadeWith(cls) ) continue;
      candidates.push({ class: cls.key, label: cls.label, level: cls.level, value: cls.level + abl.agi.mod });
    }
    candidates.sort((x, y) => y.value - x.value);
    let evasionClass = candidates.find(c => c.class === this.settings.evasionClass) ?? candidates[0] ?? null;
    this.evasionOptions = candidates;
    this.evasionClass = evasionClass?.class ?? null;
    this.evasionClassLabel = evasionClass?.label ?? "";
    this.evasionBase = evasionClass?.value ?? 0;
    this.evasion = this.evasionBase + armorEvasion + b.evasion + b.actionChecks + b.allChecks;
    this.evasionStraight = !evasionClass;

    // Warrior class summaries
    this.warrior = {};
    for ( const cls of Object.values(this.classes) ) {
      if ( cls.category !== "warrior" ) continue;
      this.warrior[cls.key] = {
        label: cls.label, level: cls.level,
        accuracy: cls.level + abl.dex.mod,
        damage: cls.level + abl.str.mod
      };
    }

    // Weapons
    for ( const weapon of this.weapons ) this._prepareWeaponAttack(weapon);
  }

  /**
   * Evasion bonus/penalty from equipped armor and shield.
   * @param {number} str
   * @returns {number}
   * @protected
   */
  _equipmentEvasion(str) {
    let total = 0;
    const armor = this.armor?.system;
    if ( armor ) {
      if ( armor.minStr > str ) total -= (armor.minStr - str);
      else total += armor.evasion > 0 ? armor.evasion : 0;
      if ( armor.evasion < 0 ) total += armor.evasion;
    }
    const shield = this.shield?.system;
    if ( shield ) {
      if ( shield.minStr > str ) total -= (shield.minStr - str);
      else if ( shield.evasion > 0 ) total += shield.evasion;
      if ( shield.evasion < 0 ) total += shield.evasion;
    }
    return total;
  }

  /**
   * Can the given warrior class be used for Evasion checks with the current equipment?
   * @param {object} cls
   * @returns {boolean}
   * @protected
   */
  _canEvadeWith(cls) {
    const armor = this.armor?.system;
    if ( cls.key === "grappler" ) {
      if ( this.shield ) return false;
      if ( armor && !["may", "only"].includes(armor.grappler) ) return false;
      return true;
    }
    if ( armor?.grappler === "only" ) return false;
    if ( cls.halfStrength ) {
      const half = Math.ceil(this.abilities.str.value / 2);
      if ( armor && (armor.minStr > half) ) return false;
      if ( this.shield && (this.shield.system.minStr > half) ) return false;
    }
    return true;
  }

  /**
   * Prepare attack data of one weapon (stored on weapon.system.attack).
   * @param {Item} weapon
   * @protected
   */
  _prepareWeaponAttack(weapon) {
    const w = weapon.system;
    const mode = w.currentMode;
    const b = this.bonuses;
    const abl = this.abilities;
    const kind = w.attackKind;
    const options = [];
    for ( const cls of Object.values(this.classes) ) {
      if ( cls.category !== "warrior" ) continue;
      const atk = cls.attack ?? {};
      let allowed = false;
      if ( kind === "melee" ) {
        allowed = atk.melee && (!atk.wrestlingOnly || (w.category === "wrestling"));
        if ( w.grapplerOnly && (cls.key !== "grappler") ) allowed = false;
        if ( (cls.key === "grappler") && this.shield ) allowed = false;
      }
      else if ( kind === "thrown" ) allowed = atk.thrown;
      else if ( kind === "shooting" ) allowed = atk.shooting;
      if ( allowed ) options.push(cls);
    }
    let cls = options.find(c => c.key === w.attackClass) ?? options.sort((x, y) => y.level - x.level)[0] ?? null;

    // Strength requirement
    const str = cls?.halfStrength ? Math.ceil(abl.str.value / 2) : abl.str.value;
    const strPenalty = Math.min(0, str - (mode.minStr ?? 0));

    const isMelee = kind === "melee";
    // The weapon's own single-use modifiers apply to the attacks made with it
    const own = w.modifiers.filter(m => (m.scope === "use") && !m.condition && !m.actorType);
    const ownSum = (...keys) => own.filter(m => keys.includes(m.key)).reduce((a, m) => a + (Number(m.value) || 0), 0);
    const accuracyBonus = b.accuracy + (isMelee ? b.accuracyMelee : b.accuracyRanged) + b.actionChecks + b.allChecks
      + ownSum("accuracy", isMelee ? "accuracyMelee" : "accuracyRanged");
    const accuracyBase = cls ? cls.level + abl.dex.mod : 0;
    const accuracy = accuracyBase + (mode.accuracy ?? 0) + accuracyBonus + strPenalty;

    let extra;
    let damageKind = "physical";
    if ( w.isGun ) {
      const magitech = this.magic?.magitech;
      extra = (magitech?.power ?? 0) + (mode.extraDamage ?? 0) + b.damageMagic + ownSum("damageMagic");
      damageKind = "magic";
    } else {
      const extraBase = cls ? cls.level + abl.str.mod : 0;
      extra = extraBase + (mode.extraDamage ?? 0) + b.damage + (isMelee ? b.damageMelee : b.damageRanged)
        + ownSum("damage", isMelee ? "damageMelee" : "damageRanged");
    }
    extra += this._proficiencyDamage(weapon);

    let critical = (mode.critical ?? 10) + (cls?.critical ?? 0) + b.critical + ownSum("critical");

    w.attack = {
      class: cls?.key ?? null,
      classLabel: cls?.label ?? game.i18n.localize("SW25.StraightRoll"),
      options: options.map(o => ({ key: o.key, label: o.label, level: o.level })),
      straight: !cls,
      kind,
      accuracy,
      accuracyBase,
      strPenalty,
      power: (Number.isInteger(mode.power) && !w.isGun)
        ? Math.clamp(mode.power + b.weaponPower + ownSum("weaponPower"), 0, 100) : mode.power,
      critical,
      powerRoll: b.powerRoll + ownSum("powerRoll"),
      powerPerCrit: b.powerPerCrit + ownSum("powerPerCrit"),
      extraDamage: extra,
      damageKind,
      hands: w.hands
    };
  }

  /**
   * Damage bonus from Weapon Proficiency feats for the weapon's category.
   * @param {Item} weapon
   * @returns {number}
   * @protected
   */
  _proficiencyDamage(weapon) {
    const category = weapon.system.category;
    let bonus = 0;
    for ( const feat of this.parent.items ) {
      if ( feat.type !== "feat" ) continue;
      if ( feat.system.choice !== "weaponCategory" ) continue;
      if ( feat.system.choiceValue !== category ) continue;
      const m = feat.name.match(/Weapon Proficiency\s+(A|S|SS)/i);
      if ( !m ) continue;
      const value = { A: 1, S: 2, SS: 3 }[m[1].toUpperCase()] ?? 0;
      bonus = Math.max(bonus, value);
    }
    return bonus;
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /** Class level for a class key (0 if the class is not learned). */
  classLevel(key) {
    return this.classes?.[key]?.level ?? 0;
  }

  /** Is the character a spellcaster of the given system? */
  canCast(system) {
    return !!this.magic?.[system];
  }
}
