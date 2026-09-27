import { lookupPower } from "./power-table.mjs";

/**
 * Result of a power table roll.
 * @typedef {object} PowerResult
 * @property {number} power            Power used for the first roll
 * @property {number|null} critical    Effective critical value (null = cannot crit)
 * @property {object[]} steps          Each roll: {dice, natural, result, value, power}
 * @property {number} tableTotal       Sum of power table values
 * @property {number} extra            Extra damage / magic power added once
 * @property {number} calculated       Calculated damage (tableTotal + extra, halved if requested)
 * @property {number} crits            Number of criticals
 * @property {boolean} fumble          First roll was double 1s: no damage at all
 * @property {boolean} halved
 */

/**
 * Roll on the power table with critical chains (CR I p.134-137).
 * @param {object} options
 * @param {number} options.power                 Power (0-100)
 * @param {number|null} [options.critical=10]    Critical value; null or >= 13 → no criticals
 * @param {number} [options.extra=0]             Extra damage added once to the table result
 * @param {number} [options.rollBonus=0]         Added to the 2d result (e.g. Lethal Strike), max 12
 * @param {number} [options.powerPerCrit=0]      Power increase for each subsequent critical roll
 * @param {boolean} [options.halve=false]        Halve the calculated damage (successful "Half" resistance)
 * @param {number|null} [options.fixedDie=null]  Use "1d + fixedDie" instead of 2d (e.g. pharmacist tools: 4)
 * @param {boolean} [options.minimumOnFumble=false]  Healing: a double 1 still grants the extra (CR II p.235)
 * @returns {Promise<{result: PowerResult, rolls: Roll[]}>}
 */
export async function rollPower({
  power = 0, critical = 10, extra = 0, rollBonus = 0, powerPerCrit = 0, halve = false, fixedDie = null,
  minimumOnFumble = false
} = {}) {
  let crit = Number.isFinite(critical) ? Math.max(8, critical) : null;
  if ( (crit !== null) && (crit >= 13) ) crit = null;
  if ( halve ) crit = null;

  const rolls = [];
  const steps = [];
  let tableTotal = 0;
  let crits = 0;
  let fumble = false;

  for ( let i = 0; i < 50; i++ ) {
    const formula = Number.isFinite(fixedDie) && (i === 0) ? `1d6 + ${fixedDie}` : "2d6";
    const roll = new Roll(formula);
    await roll.evaluate();
    rolls.push(roll);
    const dice = roll.dice[0].results.map(r => r.result);
    const natural = roll.total;
    const isDoubleOne = (dice.length === 2) && (dice[0] === 1) && (dice[1] === 1);

    if ( isDoubleOne ) {
      if ( i === 0 ) fumble = true;
      steps.push({ dice, natural, result: natural, value: 0, power: power + (crits * powerPerCrit), fumble: true });
      break;
    }
    const result = Math.min(12, natural + rollBonus);
    const stepPower = Math.min(100, power + (crits * powerPerCrit));
    const value = lookupPower(stepPower, result) ?? 0;
    tableTotal += value;
    const isCrit = (crit !== null) && (result >= crit);
    steps.push({ dice, natural, result, value, power: stepPower, crit: isCrit });
    if ( !isCrit ) break;
    crits += 1;
  }

  let calculated;
  if ( fumble ) calculated = minimumOnFumble ? Math.max(0, extra) : 0;
  else calculated = tableTotal + extra;
  if ( halve && !fumble ) calculated = Math.ceil(calculated / 2);

  return {
    rolls,
    result: {
      power, critical: crit, steps, tableTotal, extra, calculated, crits, fumble, halved: halve, rollBonus
    }
  };
}

/**
 * Roll a monster damage formula such as "2d+5" (no criticals, CR I p.135).
 * @param {string} formula
 * @returns {Promise<{roll: Roll, total: number}>}
 */
export async function rollFormulaDamage(formula) {
  const f = normalizeDiceFormula(formula);
  const roll = new Roll(f);
  await roll.evaluate();
  return { roll, total: Math.max(0, roll.total) };
}

/**
 * Convert rulebook dice notation ("2d+3", "1d") into Foundry notation ("2d6+3").
 * @param {string} formula
 * @returns {string}
 */
export function normalizeDiceFormula(formula) {
  if ( !formula ) return "0";
  return String(formula)
    .replace(/[“”"]/g, "")
    .replace(/(\d*)d(?!\d)/gi, (m, n) => `${n || 1}d6`)
    .replace(/\s+/g, "");
}
