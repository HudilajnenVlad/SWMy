import MonsterModel from "./monster.mjs";
import { boolField, intField, nullableInt, stringField } from "../fields.mjs";

const { ArrayField, SchemaField } = foundry.data.fields;

/**
 * Rider mount (CR III p.247+). Mounts have a stat line for every level of their Appropriate Level range; the
 * current level equals the jockey's adventurer level, clamped to the range.
 */
export default class MountModel extends MonsterModel {

  /** @override */
  static defineSchema() {
    const row = () => new SchemaField({
      style: stringField(""),
      accuracy: nullableInt(),
      damage: stringField(""),
      evasion: nullableInt(),
      defense: intField(0),
      hp: intField(0),
      mp: intField(0)
    });
    return {
      ...super.defineSchema(),
      price: new SchemaField({
        buy: nullableInt(),
        rent: nullableInt(),
        regen: nullableInt(),
        reputation: nullableInt()
      }),
      levelMin: intField(1, { min: 1 }),
      levelMax: intField(1, { min: 1 }),
      levels: new ArrayField(new SchemaField({
        level: intField(1),
        fortitude: intField(0),
        willpower: intField(0),
        sections: new ArrayField(row())
      })),
      jockey: stringField(""),
      proprietary: boolField(false),
      autoLevel: boolField(true)
    };
  }

  /* -------------------------------------------- */

  /** @override */
  prepareBaseData() {
    super.prepareBaseData();
    const jockey = this.jockey ? fromUuidSync(this.jockey, { strict: false }) : null;
    this.jockeyActor = jockey ?? null;
    // The low end of the Appropriate Level range is the minimum Rider level needed to handle the mount
    this.jockeyRiderLevel = jockey?.system?.classes?.rider?.level ?? 0;
    this.jockeyUnqualified = !!jockey && (this.jockeyRiderLevel < this.levelMin);
    let level = this.level;
    if ( this.autoLevel && jockey?.system?.level ) level = jockey.system.level;
    this.currentLevel = Math.clamp(level || this.levelMin, this.levelMin, Math.max(this.levelMin, this.levelMax));
    const row = this.levels.find(l => l.level === this.currentLevel)
      ?? this.levels.filter(l => l.level <= this.currentLevel).at(-1)
      ?? this.levels[0];
    this.levelRow = row ?? null;
    if ( !row ) return;
    this.fortitude = row.fortitude;
    this.willpower = row.willpower;
    // Identical parts (two wings) share one stat line of the level row
    this.sections.forEach((s, i) => {
      const stats = row.sections[s.statIndex ?? i];
      if ( !stats ) return;
      s.style = stats.style || s.style;
      s.accuracy = stats.accuracy;
      s.damage = stats.damage;
      s.evasion = stats.evasion;
      s.defense = stats.defense;
      s.hp.max = stats.hp + (this.proprietary ? 10 : 0);
      s.mp.max = stats.mp;
    });
  }

  /** Mounts are rolled with dice (no fixed values in mount data). */
  get usesFixedValues() {
    if ( this.useFixed === "fixed" ) return true;
    return false;
  }
}
