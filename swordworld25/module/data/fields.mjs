/**
 * Shared field factories for the system data models.
 */

const {
  ArrayField, BooleanField, NumberField, SchemaField, StringField
} = foundry.data.fields;

/** A non-negative-or-any integer field with an initial value. */
export function intField(initial = 0, options = {}) {
  return new NumberField({ required: true, nullable: false, integer: true, initial, ...options });
}

/** A nullable integer field. */
export function nullableInt(options = {}) {
  return new NumberField({ required: false, nullable: true, integer: true, initial: null, ...options });
}

/** A plain string field. */
export function stringField(initial = "", options = {}) {
  return new StringField({ required: true, blank: true, initial, ...options });
}

/** A boolean field. */
export function boolField(initial = false) {
  return new BooleanField({ required: true, initial });
}

/** A {value, max} resource pair usable as a token bar. */
export function resourceField(initialValue = 0, initialMax = 0) {
  return new SchemaField({
    value: intField(initialValue),
    max: intField(initialMax)
  });
}

/** Book reference. */
export function sourceField() {
  return new SchemaField({
    book: stringField(""),
    page: nullableInt()
  });
}

/** A single automation modifier (see docs/DATA_FORMAT.md). */
export function modifierSchema() {
  return new SchemaField({
    key: stringField(""),
    value: new NumberField({ required: true, nullable: false, initial: 0 }),
    // Added to the value when the effect is created: "@magicPower", "@magicPower + 8", "@level"...
    formula: stringField(""),
    condition: stringField(""),
    scope: stringField("effect", { choices: { effect: "effect", use: "use" } }),
    target: stringField("self", { choices: { self: "self", target: "target" } }),
    // Only for characters (PCs/NPCs with ability scores) or only for monsters and mounts (fixed values)
    actorType: stringField("", { choices: { "": "", character: "character", monster: "monster" } })
  });
}

/** A list of automation modifiers. */
export function modifiersField() {
  return new ArrayField(modifierSchema());
}

/** Duration description used by spells and other timed effects. */
export function durationField() {
  return new SchemaField({
    text: stringField(""),
    unit: stringField("instant"),
    value: nullableInt()
  });
}

/** Target description used by spells, evocations and abilities. */
export function targetField() {
  return new SchemaField({
    text: stringField(""),
    kind: stringField("character"),
    areaCount: stringField(""),
    radius: nullableInt(),
    count: stringField("")
  });
}

/** Range and area description. */
export function rangeAreaField() {
  return new SchemaField({
    text: stringField(""),
    range: stringField("ranged"),
    areas: nullableInt(),
    meters: nullableInt(),
    area: stringField("none")
  });
}

/** Effect of a spell / finale (damage, heal...). */
export function spellEffectField() {
  return new SchemaField({
    kind: stringField("utility"),
    power: nullableInt({ min: 0, max: 100 }),
    critical: nullableInt(),
    damageKind: stringField(""),
    addMagicPower: boolField(true),
    fixed: nullableInt(),
    formula: stringField(""),
    undeadDamage: boolField(false),
    mpDamage: boolField(false),
    // Conditions put on the targets (or on the caster for "Target: Caster") for the duration
    statuses: new ArrayField(new StringField()),
    // Conditions and effect types (poison, disease, curse, psychic...) ended on the targets (Cure Poison...)
    removeStatuses: new ArrayField(new StringField()),
    removeTypes: new ArrayField(new StringField()),
    // Current HP rise together with the maximum HP given by the modifiers (Virtual Toughness)
    raiseCurrent: boolField(false),
    // Power-table damage dealt at the end of each turn of the target or of the caster instead of at once
    perTurn: stringField("", { choices: { "": "", target: "target", caster: "caster" } }),
    variants: new ArrayField(new foundry.data.fields.ObjectField())
  });
}

/** Rhythm triple used by Bard songs. */
export function rhythmField() {
  return new SchemaField({
    up: intField(0, { min: 0 }),
    down: intField(0, { min: 0 }),
    heart: intField(0, { min: 0 })
  });
}

/** Build the actor bonus schema from the modifier vocabulary. */
export function bonusesField() {
  const n = () => new NumberField({ required: true, nullable: false, initial: 0 });
  const abilities = () => new SchemaField(Object.fromEntries(
    ["dex", "agi", "str", "vit", "int", "spi"].map(k => [k, n()])
  ));
  const checks = new SchemaField(Object.fromEntries(
    Object.keys(CONFIG.SW25.checks).map(k => [k, n()])
  ));
  const flat = {};
  for ( const key of Object.keys(CONFIG.SW25.modifierKeys) ) {
    if ( key.includes(".") ) continue;
    flat[key] = n();
  }
  return new SchemaField({
    ...flat,
    ability: abilities(),
    mod: abilities(),
    mp: new SchemaField({ cost: n() }),
    check: checks
  });
}
