import SW25ActorSheet from "./actor-base.mjs";
import { requestTrapCheck, setDetected, triggerTrap } from "../../workflows/trap.mjs";
import { showMonsterToPlayers } from "../../workflows/knowledge.mjs";
import { t } from "../../helpers/utils.mjs";

/**
 * Sheet of a trap, laid out as a rulebook entry: what finds and disarms it, what it does when it springs. View mode is
 * the entry (the GM springs the trap and asks the players for checks from it); edit mode turns it into a form.
 * Players who are shown the trap see its name and description only.
 */
export default class TrapSheet extends SW25ActorSheet {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["trap", "swp", "themed", "theme-light"],
    position: { width: 640, height: 720 },
    actions: {
      toggleEdit: TrapSheet.#onToggleEdit,
      trigger: TrapSheet.#onTrigger,
      askCheck: TrapSheet.#onAskCheck,
      toggleState: TrapSheet.#onToggleState,
      showPlayers: TrapSheet.#onShowPlayers,
      statusToggleTrap: TrapSheet.#onStatusToggle,
      modifierAdd: TrapSheet.#onModifierAdd,
      modifierDelete: TrapSheet.#onModifierDelete
    }
  };

  /** @override */
  static PARTS = {
    sheet: { template: "systems/swordworld25/templates/actor/trap/sheet.hbs", scrollable: [".swp-trap-body"] }
  };

  /**
   * Edit mode of this sheet; a new trap opens as a form.
   * @type {boolean|null}
   */
  _editMode = null;

  /** Is the entry shown as a form? */
  get editMode() {
    if ( !this.isEditable ) return false;
    this._editMode ??= !Number.isInteger(this.actor.system.search) && !this.actor.system.damage.formula
      && !Number.isInteger(this.actor.system.damage.power) && !this.actor.system.check.value;
    return this._editMode;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.actor.system;
    const SW25 = CONFIG.SW25;
    const owner = this.actor.isOwner;
    const statuses = CONFIG.statusEffects.filter(s => !["dead"].includes(s.id))
      .map(s => ({ id: s.id, name: game.i18n.localize(s.name), img: s.img, active: sys.statuses.includes(s.id) }));
    const damageLabel = Number.isInteger(sys.damage.power)
      ? `${t("SW25.Power")} ${sys.damage.power}${sys.damage.extra ? ` +${sys.damage.extra}` : ""}${Number.isInteger(sys.damage.critical) ? ` · ${t("SW25.CritValue")} ${sys.damage.critical}` : ""}`
      : (sys.damage.formula ? `${sys.damage.formula}${sys.damage.extra ? ` +${sys.damage.extra}` : ""}` : "");
    Object.assign(context, {
      edit: this.editMode,
      owner,
      playerView: !owner,
      editable: this.isEditable,
      trapTypes: Object.fromEntries(["mechanical", "natural", "magical"].map(k => [k, t(`SW25.Trap.Kind.${k}`)])),
      typeLabel: t(`SW25.Trap.Kind.${sys.trapType}`),
      vsOptions: Object.fromEntries(Object.entries(SW25.resistVs).filter(([k]) => k !== "other").map(([k, v]) => [k, t(v)])),
      resultOptions: Object.fromEntries(["neg", "half", "temporary", "cant"].map(k => [k, t(SW25.resistance[k])])),
      damageKinds: Object.fromEntries(Object.entries(SW25.damageKinds).map(([k, v]) => [k, t(v)])),
      durationUnits: { rounds: t("SW25.Trap.Rounds"), minutes: t("SW25.Trap.Minutes"), hours: t("SW25.Trap.Hours") },
      damageTypesText: sys.damage.types.join(", "),
      checkLabel: Number.isInteger(sys.check.value)
        ? `${sys.check.value} — ${t(`SW25.Check.${sys.check.vs}`)} / ${t(SW25.resistance[sys.check.result] ?? sys.check.result)}` : "—",
      damageLabel: damageLabel || "—",
      damageTypeLabel: [sys.damage.kind ? t(SW25.damageKinds[sys.damage.kind] ?? sys.damage.kind) : "", ...sys.damage.types.map(tp => t(SW25.damageTypes[tp] ?? tp))].filter(Boolean).join(" · "),
      statuses,
      activeStatuses: statuses.filter(s => s.active),
      modifierKeys: Object.fromEntries(Object.entries(SW25.modifierKeys).map(([k, v]) => [k, t(v)])),
      durationLabel: Number.isInteger(sys.duration.value) ? `${sys.duration.value} ${t(`SW25.Trap.${{ rounds: "Rounds", minutes: "Minutes", hours: "Hours" }[sys.duration.unit] ?? "Rounds"}`)}` : "",
      searchLabel: Number.isInteger(sys.search) ? sys.search : "—",
      spotLabel: Number.isInteger(sys.spotTrapValue) ? sys.spotTrapValue : "—",
      disarmLabel: Number.isInteger(sys.disarm) ? sys.disarm : "—",
      enrichedDescription: await this._enrich(sys.details.description),
      enrichedNotes: await this._enrich(sys.details.notes)
    });
    return context;
  }

  /** @override */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const types = foundry.utils.getProperty(data, "system.damage.types");
    if ( typeof types === "string" ) {
      foundry.utils.setProperty(data, "system.damage.types", types.split(/[\s,;]+/).map(v => v.trim()).filter(Boolean));
    }
    return data;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onToggleEdit() {
    this._editMode = !this.editMode;
    return this.render();
  }

  static #onTrigger() {
    return triggerTrap(this.actor);
  }

  static #onAskCheck(event, target) {
    return requestTrapCheck(this.actor, target.dataset.kind);
  }

  static async #onToggleState(event, target) {
    const key = target.dataset.state;
    const value = !this.actor.system.state[key];
    if ( (key === "detected") && value ) return setDetected(this.actor);
    return this.actor.update({ [`system.state.${key}`]: value });
  }

  static #onShowPlayers() {
    return showMonsterToPlayers(this.actor);
  }

  static async #onStatusToggle(event, target) {
    const id = target.dataset.status;
    const list = new Set(this.actor.system.statuses);
    if ( list.has(id) ) list.delete(id);
    else list.add(id);
    await this.actor.update({ "system.statuses": [...list] });
  }

  static async #onModifierAdd() {
    const list = foundry.utils.deepClone(this.actor._source.system.modifiers ?? []);
    list.push({ key: "evasion", value: -1, condition: "", scope: "effect", target: "target" });
    await this.actor.update({ "system.modifiers": list });
  }

  static async #onModifierDelete(event, target) {
    const list = foundry.utils.deepClone(this.actor._source.system.modifiers ?? []);
    list.splice(Number(target.dataset.index), 1);
    await this.actor.update({ "system.modifiers": list });
  }
}
