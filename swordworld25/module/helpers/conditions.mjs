/**
 * Status conditions available from the Token HUD. Numeric effects follow the core rules
 * (CR I p.97, p.125, p.139, p.144, p.184; CR II p.69-75, p.330).
 */

const ADD = () => CONST.ACTIVE_EFFECT_MODES.ADD;

/**
 * Build a change on a bonus key.
 * @param {string} key
 * @param {number} value
 */
function bonus(key, value) {
  return { key: `system.bonuses.${key}`, mode: ADD(), value: String(value), priority: 20 };
}

/**
 * @returns {object[]} CONFIG.statusEffects entries
 */
export function buildStatusEffects() {
  return [
    { id: "dead", name: "SW25.Status.dead", img: "icons/svg/skull.svg" },
    { id: "unconscious", name: "SW25.Status.unconscious", img: "icons/svg/unconscious.svg" },
    { id: "prone", name: "SW25.Status.prone", img: "icons/svg/falling.svg", changes: [bonus("actionChecks", -2)] },
    { id: "stoodUp", name: "SW25.Status.stoodUp", img: "icons/svg/up.svg", changes: [bonus("actionChecks", -2)] },
    { id: "surprised", name: "SW25.Status.surprised", img: "icons/svg/hazard.svg", changes: [bonus("allChecks", -2)] },
    { id: "fullMove", name: "SW25.Status.fullMove", img: "icons/svg/wingfoot.svg", changes: [bonus("evasion", -4)] },
    { id: "withdrawing", name: "SW25.Status.withdrawing", img: "icons/svg/door-exit.svg", changes: [bonus("evasion", -4)] },
    { id: "engaged", name: "SW25.Status.engaged", img: "icons/svg/combat.svg" },
    { id: "sleep", name: "SW25.Status.sleep", img: "icons/svg/sleep.svg", changes: [bonus("actionChecks", -4)] },
    { id: "paralyzed", name: "SW25.Status.paralyzed", img: "icons/svg/paralysis.svg" },
    { id: "entangled", name: "SW25.Status.entangled", img: "icons/svg/net.svg" },
    { id: "blind", name: "SW25.Status.blind", img: "icons/svg/blind.svg", changes: [bonus("actionChecks", -4)] },
    { id: "deaf", name: "SW25.Status.deaf", img: "icons/svg/deaf.svg", changes: [bonus("check.listen", -2)] },
    // Attackers take -4 Accuracy and evading its attacks takes -4 (CR II p.69): the same as +4 on its own checks
    { id: "invisible", name: "SW25.Status.invisible", img: "icons/svg/invisible.svg", changes: [bonus("evasion", 4), bonus("accuracy", 4)] },
    { id: "hidden", name: "SW25.Status.hidden", img: "icons/svg/mystery-man.svg" },
    { id: "darkness", name: "SW25.Status.darkness", img: "icons/svg/light-off.svg", changes: [bonus("actionChecks", -4)] },
    { id: "dimLight", name: "SW25.Status.dimLight", img: "icons/svg/eye.svg", changes: [bonus("actionChecks", -2)] },
    { id: "badFooting", name: "SW25.Status.badFooting", img: "icons/svg/stone-path.svg", changes: [bonus("actionChecks", -2)] },
    { id: "waistDeep", name: "SW25.Status.waistDeep", img: "icons/svg/waterfall.svg", changes: [bonus("actionChecks", -2)] },
    { id: "underwater", name: "SW25.Status.underwater", img: "icons/svg/whale.svg", changes: [bonus("actionChecks", -4)] },
    { id: "fly", name: "SW25.Status.fly", img: "icons/svg/wing.svg" },
    { id: "mounted", name: "SW25.Status.mounted", img: "icons/svg/pawprint.svg" },
    { id: "hungry", name: "SW25.Status.hungry", img: "icons/svg/tankard.svg", changes: [bonus("allChecks", -1), bonus("hpMax", -1), bonus("mpMax", -1)] },
    { id: "poisoned", name: "SW25.Status.poisoned", img: "icons/svg/poison.svg" },
    { id: "diseased", name: "SW25.Status.diseased", img: "icons/svg/biohazard.svg" },
    { id: "cursed", name: "SW25.Status.cursed", img: "icons/svg/degen.svg" },
    { id: "charmed", name: "SW25.Status.charmed", img: "icons/svg/heal.svg" },
    { id: "confused", name: "SW25.Status.confused", img: "icons/svg/daze.svg" },
    { id: "frightened", name: "SW25.Status.frightened", img: "icons/svg/terror.svg" },
    { id: "silenced", name: "SW25.Status.silenced", img: "icons/svg/silenced.svg" },
    { id: "petrifying", name: "SW25.Status.petrifying", img: "icons/svg/stoned.svg" },
    { id: "petrified", name: "SW25.Status.petrified", img: "icons/svg/statue.svg" },
    { id: "alternateForm", name: "SW25.Status.alternateForm", img: "icons/svg/fire-shield.svg" },
    { id: "beastForm", name: "SW25.Status.beastForm", img: "icons/svg/pawprint.svg", changes: [bonus("mod.str", 2)] },
    { id: "weakPoint", name: "SW25.Status.weakPoint", img: "icons/svg/target.svg" }
  ];
}

/**
 * Short rules descriptions for the conditions (shown in the effects compendium and tooltips).
 */
export const CONDITION_RULES = {
  dead: "SW25.StatusRule.dead",
  unconscious: "SW25.StatusRule.unconscious",
  prone: "SW25.StatusRule.prone",
  stoodUp: "SW25.StatusRule.stoodUp",
  surprised: "SW25.StatusRule.surprised",
  fullMove: "SW25.StatusRule.fullMove",
  withdrawing: "SW25.StatusRule.withdrawing",
  engaged: "SW25.StatusRule.engaged",
  sleep: "SW25.StatusRule.sleep",
  paralyzed: "SW25.StatusRule.paralyzed",
  entangled: "SW25.StatusRule.entangled",
  blind: "SW25.StatusRule.blind",
  deaf: "SW25.StatusRule.deaf",
  invisible: "SW25.StatusRule.invisible",
  hidden: "SW25.StatusRule.hidden",
  darkness: "SW25.StatusRule.darkness",
  dimLight: "SW25.StatusRule.dimLight",
  badFooting: "SW25.StatusRule.badFooting",
  waistDeep: "SW25.StatusRule.waistDeep",
  underwater: "SW25.StatusRule.underwater",
  fly: "SW25.StatusRule.fly",
  mounted: "SW25.StatusRule.mounted",
  hungry: "SW25.StatusRule.hungry",
  poisoned: "SW25.StatusRule.poisoned",
  diseased: "SW25.StatusRule.diseased",
  cursed: "SW25.StatusRule.cursed",
  charmed: "SW25.StatusRule.charmed",
  confused: "SW25.StatusRule.confused",
  frightened: "SW25.StatusRule.frightened",
  silenced: "SW25.StatusRule.silenced",
  petrifying: "SW25.StatusRule.petrifying",
  petrified: "SW25.StatusRule.petrified",
  alternateForm: "SW25.StatusRule.alternateForm",
  beastForm: "SW25.StatusRule.beastForm",
  weakPoint: "SW25.StatusRule.weakPoint"
};
