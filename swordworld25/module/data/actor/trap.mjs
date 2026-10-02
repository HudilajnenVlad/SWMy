import ActorBaseModel from "./base.mjs";
import { boolField, intField, modifiersField, nullableInt, stringField } from "../fields.mjs";

const { ArrayField, HTMLField, SchemaField, StringField } = foundry.data.fields;

/**
 * Trap (CR I p.102-109): found with Search (10 minutes) or noticed at the last moment with Spot Trap, disarmed with
 * Disable Device; each against the trap's success value. Mechanical traps are a Scout's job, natural ones a Ranger's
 * too. When it springs, its fixed success value is opposed by the victims (Evasion, Fortitude, Willpower or Danger
 * Sense), then it deals damage and puts conditions on those it affects.
 */
export default class TrapModel extends ActorBaseModel {

  /** @override */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      level: intField(1, { min: 0 }),
      trapType: stringField("mechanical", { choices: { mechanical: "mechanical", natural: "natural", magical: "magical" } }),
      trigger: stringField(""),
      target: stringField(""),
      // Success values to beat: Search (active, 10 minutes), Spot Trap (reactive), Disable Device
      search: nullableInt(),
      spotTrap: nullableInt(),
      disarm: nullableInt(),
      // The trap's own check when it springs, opposed by the victims
      check: new SchemaField({
        value: nullableInt(),
        vs: stringField("evasion"),
        result: stringField("neg")
      }),
      damage: new SchemaField({
        formula: stringField(""),
        power: nullableInt({ min: 0, max: 100 }),
        critical: nullableInt(),
        extra: intField(0),
        kind: stringField("physical"),
        types: new ArrayField(new StringField())
      }),
      statuses: new ArrayField(new StringField()),
      modifiers: modifiersField(),
      duration: new SchemaField({
        unit: stringField("rounds"),
        value: nullableInt({ min: 0 })
      }),
      reset: stringField(""),
      state: new SchemaField({
        detected: boolField(false),
        disarmed: boolField(false),
        triggered: boolField(false)
      }),
      details: new SchemaField({
        description: new HTMLField({ required: true, blank: true, initial: "" }),
        notes: new HTMLField({ required: true, blank: true, initial: "" })
      })
    };
  }

  /* -------------------------------------------- */

  /** @override */
  prepareDerivedData() {
    this._applyItemModifiers();
    // Spot Trap is the last-moment version of Search: by default 4 higher (CR I p.109)
    this.spotTrapValue = Number.isInteger(this.spotTrap) ? this.spotTrap
      : (Number.isInteger(this.search) ? this.search + 4 : null);
  }

  /** Can the trap spring now? */
  get armed() {
    return !this.state.disarmed;
  }
}
