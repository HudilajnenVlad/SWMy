import ItemBaseModel from "./base.mjs";
import { boolField, intField, modifiersField, nullableInt, stringField } from "../fields.mjs";

const { ArrayField, SchemaField, StringField } = foundry.data.fields;

/* -------------------------------------------- */
/*  Race                                        */
/* -------------------------------------------- */

export class RaceModel extends ItemBaseModel {

  /** @override */
  static defineSchema() {
    const dice = initial => stringField(initial);
    return {
      ...super.defineSchema(),
      key: stringField(""),
      extraCheckOptions: new ArrayField(new SchemaField({
        check: stringField(""),
        source: stringField("adventurer"),
        ability: stringField(""),
        minLevel: intField(1)
      })),
      abilityDice: new SchemaField({
        dex: dice("2d"), agi: dice("2d"), str: dice("2d"), vit: dice("2d"), int: dice("2d"), spi: dice("2d")
      }),
      backgrounds: new ArrayField(new SchemaField({
        roll: stringField(""),
        name: stringField(""),
        classes: stringField(""),
        skill: intField(0),
        body: intField(0),
        mind: intField(0),
        exp: intField(0),
        gmOnly: boolField(false)
      })),
      languages: stringField(""),
      restrictedClasses: new ArrayField(new StringField()),
      traits: new ArrayField(new SchemaField({
        name: stringField(""),
        level: intField(1),
        description: stringField(""),
        modifiers: modifiersField()
      })),
      darkvision: boolField(false),
      noMP: boolField(false)
    };
  }

  /** Race modifiers plus those of the traits reached at the character's adventurer level. */
  get passiveModifiers() {
    const level = this.parent?.parent?.system?.level ?? 1;
    const traits = this.traits.filter(tr => (tr.level ?? 1) <= level).flatMap(tr => tr.modifiers ?? []);
    return [...super.passiveModifiers, ...traits.filter(m => (m.scope !== "use") && (m.target !== "target"))];
  }
}

/* -------------------------------------------- */
/*  Class                                       */
/* -------------------------------------------- */

export class ClassModel extends ItemBaseModel {

  /** @override */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      key: stringField(""),
      category: stringField("other", { choices: () => CONFIG.SW25.classCategories }),
      track: stringField("minor", { choices: () => CONFIG.SW25.classTracks }),
      level: intField(1, { min: 0, max: 15 }),
      magic: stringField(""),
      attack: new SchemaField({
        melee: boolField(false),
        wrestlingOnly: boolField(false),
        thrown: boolField(false),
        shooting: boolField(false)
      }),
      evasion: boolField(false),
      halfStrength: boolField(false),
      critical: intField(0),
      abilityType: stringField(""),
      extraChecks: new ArrayField(new StringField()),
      autoFeats: new ArrayField(new SchemaField({
        level: intField(1),
        name: stringField("")
      })),
      languages: stringField("")
    };
  }

  /* -------------------------------------------- */

  /** Is this a Wizard-type class (grants MP and Magic Power)? */
  get isWizard() {
    return (this.category === "wizard") && !!this.magic;
  }

  /** Experience needed to reach the next level (null at max level). */
  get nextLevelCost() {
    const table = CONFIG.SW25.expTable[this.track] ?? CONFIG.SW25.expTable.minor;
    const next = this.level + 1;
    if ( next > CONFIG.SW25.maxClassLevel ) return null;
    return table[next];
  }

  /** Total experience invested in this class. */
  get totalExp() {
    const table = CONFIG.SW25.expTable[this.track] ?? CONFIG.SW25.expTable.minor;
    let total = 0;
    for ( let l = 1; l <= this.level; l++ ) total += table[l];
    return total;
  }
}

/* -------------------------------------------- */
/*  Combat Feat                                 */
/* -------------------------------------------- */

export class FeatModel extends ItemBaseModel {

  /** @override */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      featType: stringField("passive", { choices: () => CONFIG.SW25.featTypes }),
      acquisition: stringField("selective", { choices: { selective: "selective", automatic: "automatic" } }),
      combatPrep: boolField(false),
      prerequisites: new SchemaField({
        text: stringField(""),
        advLevel: nullableInt(),
        classes: new ArrayField(new SchemaField({ class: stringField(""), level: intField(1), count: intField(1) })),
        feats: new ArrayField(new StringField()),
        featsAnyOf: new ArrayField(new StringField())
      }),
      autoGain: new SchemaField({
        class: stringField(""),
        level: nullableInt(),
        alt: new ArrayField(new SchemaField({ class: stringField(""), level: intField(1) }))
      }),
      use: stringField(""),
      application: stringField(""),
      risk: new SchemaField({
        text: stringField(""),
        modifiers: modifiersField()
      }),
      choice: stringField(""),
      choiceValue: stringField("")
    };
  }

  /* -------------------------------------------- */

  /** Is the feat a passive one (always applies)? */
  get isPassive() {
    return this.featType === "passive";
  }

  /** @override */
  get passiveModifiers() {
    if ( !this.isPassive ) return [];
    return super.passiveModifiers;
  }

  /**
   * Check whether an actor meets the prerequisites of this feat.
   * @param {Actor} actor
   * @returns {{ok: boolean, missing: string[]}}
   */
  checkPrerequisites(actor) {
    const missing = [];
    const pre = this.prerequisites;
    const sys = actor?.system;
    if ( !sys ) return { ok: true, missing };
    if ( pre.advLevel && ((sys.level ?? 0) < pre.advLevel) ) {
      missing.push(game.i18n.format("SW25.Prereq.advLevel", { level: pre.advLevel }));
    }
    if ( pre.classes.length ) {
      const ok = pre.classes.some(c => {
        if ( c.class === "wizard" ) {
          const n = Object.values(sys.classes ?? {}).filter(cl => cl.wizard && (cl.level >= c.level)).length;
          return n >= (c.count || 1);
        }
        return (sys.classes?.[c.class]?.level ?? 0) >= c.level;
      });
      if ( !ok ) missing.push(pre.classes.map(c => {
        const label = CONFIG.SW25.classes[c.class]?.label ?? c.class;
        return `${game.i18n.localize(label)} ${c.level}`;
      }).join(" / "));
    }
    for ( const feat of pre.feats ) {
      const base = feat.replace(/\s+(I|II|III|IV|V)$/, "");
      const has = actor.items.some(i => (i.type === "feat")
        && ((i.name === feat) || (i.name.replace(/\s+(I|II|III|IV|V)$/, "") === base)));
      if ( !has ) missing.push(`[${feat}]`);
    }
    if ( pre.featsAnyOf.length ) {
      const has = pre.featsAnyOf.some(f => actor.items.some(i => (i.type === "feat") && (i.name === f)));
      if ( !has ) missing.push(pre.featsAnyOf.map(f => `[${f}]`).join(" / "));
    }
    return { ok: !missing.length, missing };
  }
}
