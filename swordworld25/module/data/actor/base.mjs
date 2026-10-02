import { bonusesField, intField, resourceField, stringField } from "../fields.mjs";

const { ArrayField, HTMLField, NumberField, SchemaField, StringField, TypedObjectField } = foundry.data.fields;

/**
 * Common data for every Actor type.
 */
export default class ActorBaseModel extends foundry.abstract.TypeDataModel {

  /** @override */
  static defineSchema() {
    return {
      hp: resourceField(0, 0),
      mp: resourceField(0, 0),
      resources: new TypedObjectField(new SchemaField({
        label: stringField(""),
        value: intField(0),
        max: intField(0),
        color: stringField("#7a5a2e"),
        sort: intField(0)
      })),
      bonuses: bonusesField()
    };
  }

  /* -------------------------------------------- */

  /** @override */
  prepareBaseData() {
    /** Conditional modifiers collected from items and effects (offered as options in roll dialogs). */
    this.conditionalModifiers = [];
    /** Breakdown of the flat bonuses coming from items, for tooltips. */
    this.bonusSources = {};
  }

  /* -------------------------------------------- */

  /**
   * Add the passive modifiers of owned items and the conditional modifiers of active effects.
   * Must be called at the start of prepareDerivedData (ActiveEffect changes are already applied at that point).
   * @protected
   */
  _applyItemModifiers() {
    const actor = this.parent;
    const type = (actor.type === "character") ? "character" : "monster";
    for ( const item of actor.items ) {
      const mods = item.system.passiveModifiers ?? [];
      for ( const mod of mods ) {
        if ( mod.actorType && (mod.actorType !== type) ) continue;
        this._addModifier({ ...mod, itemId: item.id }, item.name);
      }
    }
    for ( const effect of actor.appliedEffects ) {
      const conditional = effect.getFlag("swordworld25", "conditional") ?? [];
      for ( const mod of conditional ) {
        this.conditionalModifiers.push({ ...mod, source: effect.name });
      }
    }
  }

  /**
   * Register one modifier.
   * @param {object} mod
   * @param {string} source
   * @protected
   */
  _addModifier(mod, source) {
    if ( !mod?.key ) return;
    if ( mod.condition ) {
      this.conditionalModifiers.push({ ...mod, source });
      return;
    }
    const path = mod.key;
    const current = foundry.utils.getProperty(this.bonuses, path);
    if ( typeof current !== "number" ) {
      console.warn(`SW25 | Unknown modifier key "${path}" on ${source}`);
      return;
    }
    foundry.utils.setProperty(this.bonuses, path, current + (Number(mod.value) || 0));
    (this.bonusSources[path] ??= []).push({ source, value: Number(mod.value) || 0 });
  }

  /**
   * Where the flat bonuses on some modifier keys come from (passive modifiers of owned items, changes of active
   * effects): one line per source and key, for the breakdown of rolls.
   * @param {string[]} keys   Modifier keys ("evasion", "actionChecks", "check.climb"…)
   * @returns {{label: string, value: number, key: string}[]}
   */
  bonusBreakdown(keys) {
    const lines = [];
    for ( const key of keys ) {
      for ( const src of this.bonusSources[key] ?? [] ) {
        if ( src.value ) lines.push({ label: src.source, value: src.value, key });
      }
    }
    for ( const effect of this.parent.appliedEffects ) {
      for ( const change of effect.changes ) {
        const key = change.key.replace(/^system\.bonuses\./, "");
        if ( (key === change.key) || !keys.includes(key) || (change.mode !== CONST.ACTIVE_EFFECT_MODES.ADD) ) continue;
        const value = Number(change.value);
        if ( value ) lines.push({ label: effect.name, value, key });
      }
    }
    return lines;
  }

  /**
   * Conditional modifiers relevant to a given set of modifier keys.
   * @param {string[]} keys
   * @returns {object[]}
   */
  getConditionalModifiers(keys) {
    return this.conditionalModifiers.filter(m => keys.includes(m.key));
  }

  /**
   * Sorted list of resource trackers for display.
   * @type {object[]}
   */
  get resourceList() {
    return Object.entries(this.resources)
      .map(([id, r]) => ({ id, ...r, pct: r.max ? Math.clamp(Math.round((r.value / r.max) * 100), 0, 100) : 0 }))
      .sort((a, b) => (a.sort - b.sort) || a.label.localeCompare(b.label));
  }
}

/**
 * Fields shared by monsters and mounts.
 */
export function creatureFields() {
  return {
    classification: stringField("barbarous"),
    intelligence: stringField(""),
    perception: stringField(""),
    disposition: stringField(""),
    languages: stringField(""),
    habitat: stringField(""),
    weakPoint: new SchemaField({
      text: stringField(""),
      kind: stringField(""),
      damageType: stringField(""),
      value: intField(0)
    }),
    weakPointRevealed: new foundry.data.fields.BooleanField({ initial: false }),
    identified: new foundry.data.fields.BooleanField({ initial: false }),
    movement: new SchemaField({
      text: stringField(""),
      ground: new NumberField({ nullable: true, integer: true, initial: null }),
      groundMode: stringField(""),
      air: new NumberField({ nullable: true, integer: true, initial: null }),
      airMode: stringField("")
    }),
    useFixed: stringField("default", { choices: { default: "default", fixed: "fixed", roll: "roll" } }),
    details: new SchemaField({
      description: new HTMLField({ required: true, blank: true, initial: "" }),
      notes: new HTMLField({ required: true, blank: true, initial: "" }),
      source: new SchemaField({
        book: stringField(""),
        page: new NumberField({ nullable: true, integer: true, initial: null })
      })
    })
  };
}

/**
 * Schema of one monster section. Every section is one body part with its own HP and MP: identical parts
 * ("Horse x 2" in the bestiary) are separate sections sharing a name.
 */
export function sectionSchema() {
  return new SchemaField({
    name: stringField(""),
    style: stringField(""),
    accuracy: new NumberField({ nullable: true, integer: true, initial: null }),
    damage: stringField(""),
    evasion: new NumberField({ nullable: true, integer: true, initial: null }),
    defense: intField(0),
    hp: resourceField(0, 0),
    mp: resourceField(0, 0),
    main: new foundry.data.fields.BooleanField({ initial: false }),
    disabled: new foundry.data.fields.BooleanField({ initial: false }),
    // Book count of a variable group ("3-5" petals): shown in the section line, the copies are made by the GM
    countRange: stringField(""),
    // Mounts: index of the stat line of a level row this section uses (identical parts share one line)
    statIndex: new NumberField({ nullable: true, integer: true, min: 0, initial: null })
  });
}

/**
 * Split sections stored with a count (older data: one "Horse" section with count 2) into separate sections.
 * @param {object[]} sections  Section source data (left unchanged)
 * @returns {object[]|null}    The expanded list, or null when nothing had to change
 */
export function expandSectionCounts(sections) {
  if ( !Array.isArray(sections) ) return null;
  if ( !sections.some(s => s && (typeof s === "object") && ("count" in s)) ) return null;
  const size = s => Math.clamp(Math.floor(Number(s?.count) || 1), 1, 50);
  const shifts = sections.some(s => size(s) > 1);
  const out = [];
  sections.forEach((s, i) => {
    if ( !s || (typeof s !== "object") ) return;
    const { count, ...rest } = s;
    for ( let k = 0; k < size(s); k++ ) {
      const copy = foundry.utils.deepClone(rest);
      // Mount stat lines follow the stored order: remember it once the order shifts
      if ( shifts ) copy.statIndex ??= i;
      out.push(copy);
    }
  });
  return out;
}

export { ArrayField, StringField };
