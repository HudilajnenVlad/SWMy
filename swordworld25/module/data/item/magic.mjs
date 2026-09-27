import ItemBaseModel from "./base.mjs";
import {
  boolField, durationField, intField, nullableInt, rangeAreaField, rhythmField, spellEffectField, stringField,
  targetField
} from "../fields.mjs";

const { ArrayField, SchemaField, StringField } = foundry.data.fields;

/**
 * Learned abilities never contribute passive modifiers except explicitly passive ones.
 */
class LearnedModel extends ItemBaseModel {
  /** @override */
  get passiveModifiers() {
    return [];
  }
}

/* -------------------------------------------- */
/*  Spell                                       */
/* -------------------------------------------- */

export class SpellModel extends LearnedModel {

  /** @override */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      magic: stringField("truespeech"),
      subsystem: stringField(""),
      deity: stringField(""),
      barbarous: boolField(false),
      level: intField(1, { min: 0, max: 20 }),
      cost: new SchemaField({
        mp: nullableInt({ min: 0 }),
        text: stringField("")
      }),
      minorAction: boolField(false),
      combatPrep: boolField(false),
      target: targetField(),
      rangeArea: rangeAreaField(),
      duration: durationField(),
      resistance: stringField("none"),
      types: new ArrayField(new StringField()),
      magisphere: stringField(""),
      effect: spellEffectField()
    };
  }

  /* -------------------------------------------- */

  /** Does the spell use the power table? */
  get usesPower() {
    return Number.isInteger(this.effect.power);
  }

  /** Can the spell be resisted with Willpower? ("Temporary": a resisting target is affected for 1 round only) */
  get isResisted() {
    return ["neg", "half", "temporary"].includes(this.resistance);
  }

  /** Label of the magic system. */
  get magicLabel() {
    return game.i18n.localize(CONFIG.SW25.magicSystems[this.magic]?.label ?? this.magic);
  }
}

/* -------------------------------------------- */
/*  Enhancer Technique                          */
/* -------------------------------------------- */

export class TechniqueModel extends LearnedModel {

  /** @override */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      level: intField(1, { min: 1, max: 20 }),
      combatPrep: boolField(false),
      mpCost: intField(3, { min: 0 }),
      oncePerRound: boolField(false),
      duration: durationField()
    };
  }
}

/* -------------------------------------------- */
/*  Bard Spellsong                              */
/* -------------------------------------------- */

export class SpellsongModel extends LearnedModel {

  /** @override */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      level: intField(1, { min: 1, max: 20 }),
      singing: boolField(false),
      pets: new ArrayField(new StringField()),
      condition: new SchemaField({
        text: stringField(""),
        up: intField(0, { min: 0 }),
        down: intField(0, { min: 0 }),
        heart: intField(0, { min: 0 })
      }),
      resistance: stringField("neg"),
      types: new ArrayField(new StringField()),
      baseRhythm: rhythmField(),
      flourish: nullableInt(),
      extraRhythm: rhythmField(),
      duration: durationField()
    };
  }
}

/* -------------------------------------------- */
/*  Bard Finale                                 */
/* -------------------------------------------- */

export class FinaleModel extends LearnedModel {

  /** @override */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      level: intField(1, { min: 1, max: 20 }),
      cost: rhythmField(),
      resistance: stringField("half"),
      types: new ArrayField(new StringField()),
      targets: stringField(""),
      effect: spellEffectField()
    };
  }

  /** Does the finale use the power table? */
  get usesPower() {
    return Number.isInteger(this.effect.power);
  }
}

/* -------------------------------------------- */
/*  Rider Stunt                                 */
/* -------------------------------------------- */

export class StuntModel extends ItemBaseModel {

  /** @override */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      level: intField(1, { min: 1, max: 20 }),
      action: stringField("passive"),
      prerequisites: new ArrayField(new StringField()),
      mounts: new ArrayField(new StringField()),
      area: stringField("none")
    };
  }

  /** Passive stunts apply their modifiers constantly (to the rider/mount). */
  get passiveModifiers() {
    if ( this.action !== "passive" ) return [];
    return super.passiveModifiers;
  }
}

/* -------------------------------------------- */
/*  Alchemist Evocation                         */
/* -------------------------------------------- */

export class EvocationModel extends LearnedModel {

  /** @override */
  static defineSchema() {
    const rank = () => new SchemaField({
      available: boolField(true),
      text: stringField(""),
      value: nullableInt(),
      power: nullableInt({ min: 0, max: 100 })
    });
    return {
      ...super.defineSchema(),
      level: intField(1, { min: 1, max: 20 }),
      minorAction: boolField(false),
      combatPrep: boolField(false),
      cards: new SchemaField({
        colors: new ArrayField(new StringField()),
        count: intField(1, { min: 0 }),
        text: stringField("")
      }),
      target: targetField(),
      rangeArea: rangeAreaField(),
      duration: durationField(),
      resistance: stringField("optional"),
      types: new ArrayField(new StringField()),
      ranks: new SchemaField({ B: rank(), A: rank(), S: rank(), SS: rank() }),
      // The rank value as a modifier of one key (Vorpal Weapon: damage +1/+2/+3/+6)...
      modifierKey: stringField(""),
      modifierTarget: stringField("target"),
      modifierCondition: stringField(""),
      // ...or as an amount: HP/MP healed (Heal Spray, Vivid Liquid), the fixed success value of the check (Unlock
      // Needle) or the duration in rounds (fields). The evocation's modifiers can also use it as "@rankValue".
      rankEffect: stringField("", { choices: { "": "", healHP: "healHP", healMP: "healMP", check: "check", duration: "duration" } }),
      // Effects that act at the end of the Alchemist's turns rather than the target's (Poison Needle)
      turnOfUser: boolField(false)
    };
  }
}

/* -------------------------------------------- */
/*  Monster unique skill                        */
/* -------------------------------------------- */

export class AbilityModel extends ItemBaseModel {

  /** @override */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      tags: new ArrayField(new StringField()),
      section: stringField(""),
      check: new SchemaField({
        value: nullableInt(),
        vs: stringField(""),
        result: stringField(""),
        base: stringField("")
      }),
      damage: new SchemaField({
        formula: stringField(""),
        kind: stringField(""),
        types: new ArrayField(new StringField()),
        power: nullableInt({ min: 0, max: 100 }),
        critical: nullableInt(),
        bonus: stringField("")
      }),
      target: targetField(),
      risk: new SchemaField({
        text: stringField(""),
        modifiers: new ArrayField(new foundry.data.fields.ObjectField())
      }),
      spellcasting: new SchemaField({
        system: stringField(""),
        level: nullableInt(),
        power: nullableInt(),
        deity: stringField("")
      }),
      fairyTypes: new ArrayField(new StringField()),
      rangeArea: rangeAreaField(),
      prerequisite: stringField(""),
      enhance: stringField("")
    };
  }

  /* -------------------------------------------- */

  /** Is the unique skill always active? */
  get isPassiveSkill() {
    return this.tags.includes("passive") && !this.tags.some(t => ["major", "minor", "declared"].includes(t));
  }

  /** @override */
  get passiveModifiers() {
    if ( !this.isPassiveSkill ) return [];
    return super.passiveModifiers;
  }

  /** Icons string for the tags. */
  get tagIcons() {
    return this.tags.map(t => CONFIG.SW25.abilityTags[t]?.icon ?? "").join("");
  }

  /** Fixed value of the check (standard + 7). */
  get fixedValue() {
    return Number.isInteger(this.check.value) ? this.check.value + CONFIG.SW25.FIXED_OFFSET : null;
  }
}

/* -------------------------------------------- */
/*  Effect preset (conditions, spell effects)   */
/* -------------------------------------------- */

export class EffectModel extends ItemBaseModel {

  /** @override */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      duration: durationField(),
      statuses: new ArrayField(new StringField()),
      stackable: boolField(false)
    };
  }

  /** Effect presets never modify an actor by being owned: they create ActiveEffects when applied. */
  get passiveModifiers() {
    return [];
  }
}
