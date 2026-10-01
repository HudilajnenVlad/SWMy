import ItemBaseModel from "./base.mjs";
import { boolField, intField, nullableInt, stringField } from "../fields.mjs";

const { ArrayField, NumberField, SchemaField, StringField } = foundry.data.fields;

/**
 * Shared fields of carried equipment.
 */
function physicalFields() {
  return {
    price: nullableInt({ min: 0 }),
    priceText: stringField(""),
    reputation: nullableInt(),
    quantity: intField(1, { min: 0 }),
    magic: boolField(false),
    equipped: boolField(false),
    // Hand holding the item when it is held (weapons, shields, hand-held tools): right | left | "" (free choice)
    hand: stringField("")
  };
}

/**
 * Market value of a stack of carried equipment: price × quantity, a bundle price ("10G per 12") counting per piece.
 * Equipment without a fixed price (priced by size, rank or points) has none.
 * @param {object} system  Item system data with price, priceText and quantity
 * @returns {number|null}
 */
export function stackValue(system) {
  if ( !Number.isInteger(system?.price) ) return null;
  const bundle = Number(String(system.priceText ?? "").match(/\bper\s+(\d+)/i)?.[1]) || 1;
  return Math.round((system.price * Math.max(0, system.quantity ?? 1)) / bundle);
}

/**
 * Hands needed to hold an item of a stance ("1H", "2H", "1H, 2H" held in one hand; "1H#"/"W" need no hand).
 * @param {string} stance
 * @returns {number}
 */
export function handsForStance(stance) {
  const s = String(stance ?? "").trim();
  if ( !s || s.includes("#") || s.includes("W") ) return 0;
  return s.startsWith("2") ? 2 : 1;
}

/* -------------------------------------------- */
/*  Weapon                                      */
/* -------------------------------------------- */

export class WeaponModel extends ItemBaseModel {

  /** @override */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      ...physicalFields(),
      categories: new ArrayField(new StringField()),
      category: stringField(""),
      rank: stringField("B"),
      edged: boolField(false),
      blunt: boolField(false),
      silver: boolField(false),
      grapplerOnly: boolField(false),
      range: stringField(""),
      defenseBonus: intField(0),
      implement: boolField(false),
      magazine: nullableInt({ min: 0 }),
      loaded: intField(0, { min: 0 }),
      modes: new ArrayField(new SchemaField({
        label: stringField(""),
        stance: stringField("1H"),
        minStr: intField(1),
        accuracy: intField(0),
        power: nullableInt({ min: 0, max: 100 }),
        critical: intField(10),
        extraDamage: intField(0)
      })),
      mode: intField(0, { min: 0 }),
      attackClass: stringField("")
    };
  }

  /* -------------------------------------------- */

  /** @override */
  prepareBaseData() {
    if ( !this.category || !this.categories.includes(this.category) ) this.category = this.categories[0] ?? "sword";
    if ( this.mode >= this.modes.length ) this.mode = 0;
  }

  /** @override */
  get isActive() {
    return this.equipped;
  }

  /** The currently selected usage mode. */
  get currentMode() {
    return this.modes[this.mode] ?? this.modes[0] ?? {
      label: "", stance: "1H", minStr: 1, accuracy: 0, power: 0, critical: 10, extraDamage: 0
    };
  }

  /** Is this a gun (damage from bullet spells)? */
  get isGun() {
    return this.category === "gun";
  }

  /** Attack kind of the current category: melee, thrown or shooting. */
  get attackKind() {
    if ( CONFIG.SW25.shootingCategories.has(this.category) ) return "shooting";
    if ( this.category === "throw" ) return "thrown";
    return "melee";
  }

  /** Number of hands the weapon uses in its current mode. */
  get hands() {
    return handsForStance(this.currentMode.stance);
  }

  /** Hands needed to hold the weapon. */
  get heldHands() {
    return this.hands;
  }

  /** Is the weapon held in the hands? */
  get isHeld() {
    return this.equipped && (this.hands > 0);
  }
}

/* -------------------------------------------- */
/*  Armor & Shield                              */
/* -------------------------------------------- */

export class ArmorModel extends ItemBaseModel {

  /** @override */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      ...physicalFields(),
      armorType: stringField("nonmetal"),
      rank: stringField("B"),
      stance: stringField(""),
      minStr: intField(1),
      evasion: intField(0),
      defense: intField(0),
      grappler: stringField(""),
      silver: boolField(false)
    };
  }

  /** @override */
  get isActive() {
    return this.equipped;
  }

  /** Is this a shield? */
  get isShield() {
    return this.armorType === "shield";
  }

  /** Is this metal armor (penalties to some checks and to spellcasting)? */
  get isMetal() {
    return this.armorType === "metal";
  }

  /** Hands needed to hold the item: a shield is held like a weapon (CR I p.147, 153), armor is worn. */
  get heldHands() {
    return this.isShield ? Math.max(1, handsForStance(this.stance)) : 0;
  }

  /** Is the shield held in the hands? */
  get isHeld() {
    return this.equipped && this.isShield;
  }
}

/* -------------------------------------------- */
/*  Gear (accessories, consumables, tools...)   */
/* -------------------------------------------- */

export class GearModel extends ItemBaseModel {

  /** @override */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      ...physicalFields(),
      itemType: stringField("gear"),
      slot: new ArrayField(new StringField()),
      equippedSlot: stringField(""),
      stance: stringField(""),
      consumable: boolField(false),
      uses: new SchemaField({
        value: nullableInt({ min: 0 }),
        max: nullableInt({ min: 0 })
      }),
      use: new SchemaField({
        kind: stringField("none"),
        power: nullableInt({ min: 0, max: 100 }),
        critical: nullableInt(),
        extra: intField(0),
        bonus: stringField("")
      }),
      classReq: new SchemaField({
        class: stringField(""),
        level: nullableInt()
      }),
      popularity: nullableInt(),
      silver: boolField(false),
      ammoFor: stringField(""),
      types: new ArrayField(new StringField()),
      duration: new SchemaField({
        text: stringField(""),
        unit: stringField("instant"),
        value: nullableInt()
      }),
      mako: new SchemaField({
        value: intField(0, { min: 0 }),
        max: intField(0, { min: 0 })
      }),
      card: new SchemaField({
        color: stringField(""),
        rank: stringField("")
      }),
      capacity: nullableInt({ min: 0 })
    };
  }

  /* -------------------------------------------- */

  /** Hands needed to hold the item (0: not a hand-held item). */
  get heldHands() {
    return handsForStance(this.stance);
  }

  /**
   * Is the item held in the hands? An item that can also be worn as an accessory (magical implement: a wand in the
   * hand or a ring) is held only when it was put in a hand (`equippedSlot` "held").
   */
  get isHeld() {
    return this.equipped && (this.heldHands > 0) && (!this.slot.length || (this.equippedSlot === "held"));
  }

  /** Is the item worn as an accessory in one of the equipment sections? */
  get isWorn() {
    return this.equipped && (this.slot.length > 0) && !this.isHeld;
  }

  /** @override */
  get isActive() {
    const accessoryLike = ["accessory", "classItem"].includes(this.itemType) && this.slot.length;
    // Weapon and armor improvements count once marked as applied (equipped)
    if ( accessoryLike || (this.itemType === "improvement") ) return this.equipped;
    return this.equipped || !this.slot.length;
  }

  /** @override */
  get passiveModifiers() {
    if ( !this.isActive ) return [];
    // Consumables grant their modifiers when used (effects are created then); a modifier with a condition is
    // instead offered in roll dialogs and uses the item up when chosen (charms broken for their bonus).
    if ( this.consumable ) {
      return this.modifiers.filter(m => m.condition && (m.target !== "target")).map(m => ({ ...m, consume: true }));
    }
    const req = this.classReq;
    const actor = this.parent?.parent;
    if ( req.class && actor?.system?.classes ) {
      const level = actor.system.classes[req.class]?.level ?? 0;
      if ( level < (req.level ?? 1) ) return [];
    }
    return super.passiveModifiers;
  }

  /** Can this item be used from the sheet (heal, damage, effect)? */
  get isUsable() {
    return (this.use.kind && (this.use.kind !== "none")) || this.consumable;
  }

  /** Is this a mako stone? */
  get isMakoStone() {
    return this.mako.max > 0;
  }
}
