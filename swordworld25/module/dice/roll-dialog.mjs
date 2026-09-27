import { PAPER_DIALOG } from "../helpers/utils.mjs";

/**
 * Dialog used before most rolls: situational modifiers, declared combat feats, manual modifier, target number
 * and roll mode.
 */
export default class RollDialog {

  /**
   * @param {object} config
   * @param {string} config.title
   * @param {string} [config.summary]           Text shown at the top (standard value breakdown)
   * @param {object[]} [config.options]         Optional modifiers [{id, label, value, checked, group, hint}]
   * @param {boolean} [config.targetNumber]     Show a target number input
   * @param {number|null} [config.defaultTN]
   * @param {boolean} [config.showFixed]        Show the "use fixed value" toggle
   * @param {boolean} [config.fixedDefault]
   * @param {object[]} [config.extraFields]     Additional inputs [{name, label, type, value, options}]
   * @param {boolean} [config.skip]             Resolve immediately with defaults
   * @returns {Promise<object|null>}
   */
  static async prompt(config) {
    const defaults = {
      manual: 0,
      targetNumber: config.defaultTN ?? null,
      rollMode: game.settings.get("core", "rollMode"),
      useFixed: !!config.fixedDefault,
      selected: (config.options ?? []).filter(o => o.checked).map(o => o.id),
      extra: Object.fromEntries((config.extraFields ?? []).map(f => [f.name, f.value]))
    };
    if ( config.skip ) return this.#finalize(defaults, config);

    const groups = {};
    for ( const opt of config.options ?? [] ) {
      const g = opt.group ?? "SW25.Roll.Situational";
      (groups[g] ??= []).push(opt);
    }
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/swordworld25/templates/dialogs/roll-dialog.hbs", {
        summary: config.summary,
        groups: Object.entries(groups).map(([label, options]) => ({ label, options })),
        targetNumber: config.targetNumber,
        defaultTN: config.defaultTN,
        showFixed: config.showFixed,
        fixedDefault: config.fixedDefault,
        extraFields: config.extraFields ?? [],
        rollModes: Object.fromEntries(Object.entries(CONFIG.Dice.rollModes).map(([k, v]) => [k, v.label ?? v])),
        rollMode: defaults.rollMode
      }
    );

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: config.title, icon: "fa-solid fa-dice" },
      classes: [...PAPER_DIALOG, "swp-roll-dialog"],
      position: { width: 420 },
      content,
      buttons: [{
        action: "roll",
        label: game.i18n.localize("SW25.Roll.Roll"),
        icon: "fa-solid fa-dice-d6",
        default: true,
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
      }],
      rejectClose: false
    });
    if ( !result || (typeof result !== "object") ) return null;

    const selected = Object.entries(result)
      .filter(([k, v]) => k.startsWith("opt.") && v)
      .map(([k]) => k.slice(4));
    const extra = {};
    for ( const f of config.extraFields ?? [] ) extra[f.name] = result[`extra.${f.name}`];
    return this.#finalize({
      manual: Number(result.manual) || 0,
      targetNumber: Number.isFinite(Number(result.targetNumber)) && (result.targetNumber !== "") && (result.targetNumber !== null)
        ? Number(result.targetNumber) : null,
      rollMode: result.rollMode || defaults.rollMode,
      useFixed: !!result.useFixed,
      selected,
      extra
    }, config);
  }

  /**
   * Compute the total of the selected options.
   * @param {object} data
   * @param {object} config
   * @returns {object}
   */
  static #finalize(data, config) {
    const chosen = (config.options ?? []).filter(o => data.selected.includes(o.id));
    const parts = chosen.filter(o => Number(o.value)).map(o => ({ label: o.label, value: Number(o.value) }));
    if ( data.manual ) parts.push({ label: game.i18n.localize("SW25.Roll.Manual"), value: data.manual });
    return { ...data, chosen, parts, bonus: parts.reduce((t, p) => t + p.value, 0) };
  }

  /**
   * Should the dialog be skipped for this event (shift-click toggles the configured default)?
   * @param {Event} [event]
   * @returns {boolean}
   */
  static shouldSkip(event) {
    const skipDefault = game.settings.get("swordworld25", "skipRollDialog");
    return event?.shiftKey ? !skipDefault : skipDefault;
  }
}
