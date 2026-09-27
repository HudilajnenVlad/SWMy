/**
 * Sword World 2.5 skill check roll: 2d + standard value + modifiers.
 * Double 6 is an automatic success, double 1 an automatic failure (CR I p.91).
 */
export class CheckRoll extends Roll {

  /**
   * @param {string} formula
   * @param {object} data
   * @param {object} [options]
   * @param {boolean} [options.noAutoSuccess]  Double 6 is not an automatic success (Initiative checks)
   */
  constructor(formula, data = {}, options = {}) {
    super(formula, data, options);
  }

  /** The natural results of the 2d. */
  get naturals() {
    const die = this.dice[0];
    return die ? die.results.filter(r => r.active !== false).map(r => r.result) : [];
  }

  /** Sum of the natural dice. */
  get natural() {
    return this.naturals.reduce((a, b) => a + b, 0);
  }

  /** Is the roll an automatic success? */
  get isAutoSuccess() {
    if ( this.options.noAutoSuccess ) return false;
    const n = this.naturals;
    return (n.length === 2) && (n[0] === 6) && (n[1] === 6);
  }

  /** Is the roll an automatic failure? */
  get isAutoFailure() {
    const n = this.naturals;
    return (n.length === 2) && (n[0] === 1) && (n[1] === 1);
  }

  /**
   * Success value used for comparisons (CR I p.92): automatic success = total + 5, automatic failure = 0,
   * and never below 0.
   * @type {number}
   */
  get successValue() {
    if ( !this._evaluated ) return null;
    if ( this.isAutoFailure ) return 0;
    if ( this.isAutoSuccess ) return Math.max(0, this.total + 5);
    return Math.max(0, this.total);
  }
}

/* -------------------------------------------- */

/**
 * A plain object describing the outcome of a check, either rolled or fixed.
 * @typedef {object} CheckResult
 * @property {number} total          Success value
 * @property {boolean} autoSuccess
 * @property {boolean} autoFailure
 * @property {boolean} fixed         A fixed value was used (no dice)
 * @property {number[]} dice         Natural dice
 */

/**
 * Convert a CheckRoll into a serializable result.
 * @param {CheckRoll} roll
 * @returns {CheckResult}
 */
export function resultFromRoll(roll) {
  return {
    total: roll.successValue,
    raw: roll.total,
    autoSuccess: roll.isAutoSuccess,
    autoFailure: roll.isAutoFailure,
    fixed: false,
    dice: roll.naturals
  };
}

/**
 * Build a result from a fixed value (monsters, CR I p.383).
 * @param {number} value
 * @returns {CheckResult}
 */
export function fixedResult(value) {
  return { total: Math.max(0, value), raw: value, autoSuccess: false, autoFailure: false, fixed: true, dice: [] };
}

/**
 * Resolve a contested check between an active and a passive side (CR I p.99).
 * Ties go to the passive side; both automatic successes → passive side wins.
 * @param {CheckResult} active
 * @param {CheckResult} passive
 * @returns {boolean} true if the ACTIVE side wins
 */
export function activeWins(active, passive) {
  if ( !active ) return false;
  if ( active.autoFailure ) return false;
  if ( !passive ) return true;
  if ( passive.autoSuccess ) return false;
  if ( active.autoSuccess ) return true;
  if ( passive.autoFailure ) return true;
  return active.total > passive.total;
}

/**
 * Resolve a check against a static target number.
 * @param {CheckResult} result
 * @param {number|null} targetNumber
 * @returns {boolean|null} null if no target number
 */
export function meetsTarget(result, targetNumber) {
  if ( result.autoSuccess ) return true;
  if ( result.autoFailure ) return false;
  if ( !Number.isFinite(targetNumber) ) return null;
  return result.total >= targetNumber;
}

/**
 * Evaluate a 2d check.
 * @param {object} options
 * @param {number} options.base            Standard value
 * @param {object[]} [options.parts]       Additional modifiers [{label, value}]
 * @param {boolean} [options.noAutoSuccess]
 * @returns {Promise<CheckRoll>}
 */
export async function evaluateCheck({ base = 0, parts = [], noAutoSuccess = false } = {}) {
  const terms = ["2d6"];
  const data = {};
  if ( base ) terms.push(`${base}`);
  for ( const p of parts ) {
    if ( !p.value ) continue;
    terms.push(`${p.value}`);
  }
  const formula = terms.join(" + ").replace(/\+ -/g, "- ");
  const roll = new CheckRoll(formula, data, { noAutoSuccess });
  await roll.evaluate();
  return roll;
}
