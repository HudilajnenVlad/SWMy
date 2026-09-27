import ActorBaseModel, { creatureFields, expandSectionCounts, sectionSchema } from "./base.mjs";
import { intField, nullableInt, stringField } from "../fields.mjs";

const { ArrayField, SchemaField } = foundry.data.fields;

/**
 * Monster / enemy NPC data model. Monsters use standard values with optional fixed values (standard + 7) and may
 * consist of several sections, each with its own attack, defense and HP.
 */
export default class MonsterModel extends ActorBaseModel {

  /** @override */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      ...creatureFields(),
      level: intField(1, { min: 0 }),
      soulscars: nullableInt(),
      reputation: nullableInt(),
      weakness: nullableInt(),
      initiative: nullableInt(),
      fortitude: intField(0),
      willpower: intField(0),
      swordShards: intField(0, { min: 0 }),
      sections: new ArrayField(sectionSchema()),
      mainSection: stringField(""),
      loot: new ArrayField(new SchemaField({
        roll: stringField(""),
        min: nullableInt(),
        max: nullableInt(),
        item: stringField(""),
        price: nullableInt(),
        priceText: stringField(""),
        cards: stringField(""),
        quantity: stringField("")
      }))
    };
  }

  /* -------------------------------------------- */

  /** @override */
  static migrateData(source) {
    // Identical parts used to be one section with a count: every part needs its own HP and MP
    const sections = expandSectionCounts(source.sections);
    if ( sections ) source.sections = sections;
    return super.migrateData(source);
  }

  /* -------------------------------------------- */

  /** @override */
  prepareDerivedData() {
    this._applyItemModifiers();
    const b = this.bonuses;
    const shardBonus = CONFIG.SW25.swordShardResistBonus(this.swordShards);

    // Sections (sword shard HP/MP is assigned to the main or first section). Parts sharing a name are numbered:
    // "Horse 1", "Horse 2".
    const mainIndex = Math.max(0, this.sections.findIndex(s => s.main));
    const baseName = s => s.name || s.style || game.i18n.localize("SW25.Section.label");
    const totals = {};
    for ( const s of this.sections ) totals[baseName(s)] = (totals[baseName(s)] ?? 0) + 1;
    const seen = {};
    this.sectionGroups = [];
    this.sections.forEach((s, i) => {
      const base = baseName(s);
      seen[base] = (seen[base] ?? 0) + 1;
      s.index = i;
      s.ordinal = totals[base] > 1 ? seen[base] : 0;
      s.label = s.ordinal ? `${base} ${s.ordinal}` : base;
      if ( seen[base] === 1 ) this.sectionGroups.push({ label: base, count: totals[base], countRange: s.countRange });
      s.hp.max = (s.hp.max ?? 0) + ((i === mainIndex) ? this.swordShards * 5 : 0) + ((i === mainIndex) ? b.hpMax : 0);
      s.mp.max = (s.mp.max ?? 0) + ((i === mainIndex) ? this.swordShards : 0) + ((i === mainIndex) ? b.mpMax : 0);
      s.accuracyTotal = Number.isInteger(s.accuracy) ? s.accuracy + b.accuracy + b.accuracyMelee + b.actionChecks + b.allChecks : null;
      s.evasionTotal = Number.isInteger(s.evasion) ? s.evasion + b.evasion + b.actionChecks + b.allChecks : null;
      s.defenseTotal = s.defense + b.defense;
      s.damageBonus = b.damage + b.damageMelee;
      s.down = s.hp.value <= 0;
      s.hpPct = s.hp.max ? Math.clamp(Math.round((s.hp.value / s.hp.max) * 100), 0, 100) : 0;
    });

    // Aggregate HP/MP for token bars
    this.hp.value = this.sections.reduce((t, s) => t + Math.max(0, s.hp.value), 0);
    this.hp.max = this.sections.reduce((t, s) => t + s.hp.max, 0);
    this.mp.value = this.sections.reduce((t, s) => t + Math.max(0, s.mp.value), 0);
    this.mp.max = this.sections.reduce((t, s) => t + s.mp.max, 0);
    this.hp.pct = this.hp.max ? Math.clamp(Math.round((this.hp.value / this.hp.max) * 100), 0, 100) : 0;

    // Resistances and other values
    this.fortitudeTotal = this.fortitude + b.fortitude + b.allChecks + shardBonus;
    this.willpowerTotal = this.willpower + b.willpower + b.allChecks + shardBonus;
    this.initiativeTotal = Number.isInteger(this.initiative) ? this.initiative + b.initiative : null;
    this.shardBonus = shardBonus;
    this.multiSection = this.sections.length > 1;
    this.movementLabel = this._movementLabel();
  }

  /* -------------------------------------------- */

  /**
   * Human readable movement string.
   * @returns {string}
   * @protected
   */
  _movementLabel() {
    const m = this.movement;
    // Movement changed by effects (Bless, Shock Bomb...) is shown next to the printed value
    const bonus = this.bonuses?.movement ?? 0;
    const shown = bonus ? ` (${bonus > 0 ? "+" : ""}${bonus})` : "";
    if ( m.text ) return `${m.text}${shown}`;
    const ground = Number.isInteger(m.ground) ? `${m.ground}${m.groundMode ? ` (${m.groundMode})` : ""}` : "-";
    const air = Number.isInteger(m.air) ? `${m.air}${m.airMode ? ` (${m.airMode})` : ""}` : "-";
    return `${ground}/${air}${shown}`;
  }

  /**
   * Should fixed values be used for this monster's checks?
   * @type {boolean}
   */
  get usesFixedValues() {
    if ( this.useFixed === "fixed" ) return true;
    if ( this.useFixed === "roll" ) return false;
    return game.settings.get("swordworld25", "monsterFixedValues");
  }

  /**
   * The main section (or the first one).
   * @type {object}
   */
  get mainSectionData() {
    return this.sections.find(s => s.main) ?? this.sections[0] ?? null;
  }

  /** Experience granted when defeated (level x sections x 10). */
  get expValue() {
    return this.level * Math.max(1, this.sections.length) * 10;
  }
}
