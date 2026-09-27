import { enrich, keyboardActions, t } from "../../helpers/utils.mjs";
import CompendiumBrowser from "../apps/compendium-browser.mjs";
import { itemEntry } from "../../helpers/item-entry.mjs";
import { rollCheck } from "../../workflows/checks.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Convert objects with numeric keys produced by form data back into arrays, merging with the source array.
 * @param {object} data     Expanded submit data (mutated)
 * @param {object} source   Document source at the same path
 */
export function restoreArrays(data, source) {
  if ( !data || (typeof data !== "object") ) return data;
  for ( const [key, value] of Object.entries(data) ) {
    const src = source?.[key];
    if ( Array.isArray(src) && value && (typeof value === "object") && !Array.isArray(value) ) {
      const keys = Object.keys(value);
      if ( keys.length && keys.every(k => /^\d+$/.test(k)) ) {
        const arr = foundry.utils.deepClone(src);
        for ( const k of keys ) {
          const i = Number(k);
          const merged = (arr[i] && (typeof arr[i] === "object")) ? arr[i] : {};
          arr[i] = (typeof value[k] === "object") && (value[k] !== null)
            ? foundry.utils.mergeObject(merged, restoreArrays(value[k], merged), { inplace: false })
            : value[k];
        }
        data[key] = arr;
        continue;
      }
    }
    if ( value && (typeof value === "object") && !Array.isArray(value) ) restoreArrays(value, src);
  }
  return data;
}

/**
 * Base class for Sword World 2.5 actor sheets.
 */
export default class SW25ActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sw25", "sheet", "actor"],
    form: { submitOnChange: true },
    window: { resizable: true },
    actions: {
      itemEdit: SW25ActorSheet.#onItemEdit,
      itemDelete: SW25ActorSheet.#onItemDelete,
      itemUse: SW25ActorSheet.#onItemUse,
      itemChat: SW25ActorSheet.#onItemChat,
      itemCreate: SW25ActorSheet.#onItemCreate,
      itemToggleEquip: SW25ActorSheet.#onItemToggleEquip,
      itemQuantity: SW25ActorSheet.#onItemQuantity,
      effectToggle: SW25ActorSheet.#onEffectToggle,
      effectEdit: SW25ActorSheet.#onEffectEdit,
      effectDelete: SW25ActorSheet.#onEffectDelete,
      effectCreate: SW25ActorSheet.#onEffectCreate,
      statusToggle: SW25ActorSheet.#onStatusToggle,
      rollCheck: SW25ActorSheet.#onRollCheck,
      resourceAdd: SW25ActorSheet.#onResourceAdd,
      resourceDelete: SW25ActorSheet.#onResourceDelete,
      resourceAdjust: SW25ActorSheet.#onResourceAdjust,
      openSpellbook: SW25ActorSheet.#onOpenSpellbook,
      openCompendium: SW25ActorSheet.#onOpenCompendium,
      toggleExpand: SW25ActorSheet.#onToggleExpand
    }
  };

  /** Expanded rows of "paper" sheets ("item:<id>", "pkg:<key>"), kept per sheet between renders. */
  _expanded = new Set();

  /* -------------------------------------------- */

  /** @override */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    // Unchanged HP/MP inputs show the clamped value; submitting them would overwrite a "full" source value
    if ( this.actor.type === "character" ) {
      for ( const res of ["hp", "mp"] ) {
        const submitted = foundry.utils.getProperty(data, `system.${res}.value`);
        if ( (submitted !== undefined) && (submitted === this.actor.system[res].value) ) delete data.system[res].value;
      }
    }
    return restoreArrays(data, this.document._source);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    Object.assign(context, {
      actor,
      system: actor.system,
      config: CONFIG.SW25,
      isGM: game.user.isGM,
      owner: actor.isOwner,
      limited: actor.limited,
      effects: this._prepareEffects(),
      statuses: this._prepareStatuses(),
      resources: actor.system.resourceList ?? []
    });
    return context;
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if ( context.tabs?.[partId] ) context.tab = context.tabs[partId];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Active effects grouped for display.
   * @returns {object}
   * @protected
   */
  _prepareEffects() {
    const temporary = [];
    const passive = [];
    const disabled = [];
    for ( const effect of this.actor.allApplicableEffects() ) {
      const data = {
        id: effect.id,
        uuid: effect.uuid,
        name: effect.name,
        img: effect.img,
        disabled: effect.disabled,
        suppressed: effect.isSuppressed,
        source: effect.parent === this.actor ? "" : effect.parent?.name,
        summary: effect.modifierSummary,
        duration: effect.duration?.label ?? "",
        isItemEffect: effect.parent !== this.actor,
        parentId: effect.parent === this.actor ? "" : effect.parent?.id
      };
      if ( effect.disabled ) disabled.push(data);
      else if ( effect.isTemporary ) temporary.push(data);
      else passive.push(data);
    }
    return { temporary, passive, disabled };
  }

  /**
   * Status conditions with their active state.
   * @returns {object[]}
   * @protected
   */
  _prepareStatuses() {
    return CONFIG.statusEffects.map(s => ({
      id: s.id, name: game.i18n.localize(s.name), img: s.img, active: this.actor.statuses.has(s.id)
    }));
  }

  /**
   * Enrich an HTML field.
   * @param {string} html
   * @returns {Promise<string>}
   * @protected
   */
  _enrich(html) {
    return enrich(html, { secrets: this.actor.isOwner, rollData: this.actor.getRollData(), relativeTo: this.actor });
  }

  /**
   * Fields shared by every item row of the paper sheets, with the details of expanded rows.
   * @param {Item} item
   * @returns {Promise<object>}
   * @protected
   */
  async _itemRow(item) {
    const expanded = this._expanded.has(`item:${item.id}`);
    let entry = null;
    if ( expanded ) {
      entry = await itemEntry(item);
      // Weapon rows already show the usage table with the power row
      if ( item.type === "weapon" ) entry.tables = [];
    }
    return {
      item, id: item.id, name: item.name, img: item.img, system: item.system,
      summary: item.system.summary ?? "",
      source: item.system.sourceLabel ?? "",
      expanded,
      entry
    };
  }

  /**
   * Re-render only the part that contains an element.
   * @param {HTMLElement} target
   * @returns {Promise}
   * @protected
   */
  _renderPartOf(target) {
    const part = target.closest("[data-application-part]")?.dataset.applicationPart;
    return this.render(part ? { parts: [part] } : {});
  }

  /* -------------------------------------------- */

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    keyboardActions(this.element);
    // Inline edits of embedded items
    for ( const input of this.element.querySelectorAll("[data-item-field]") ) {
      input.addEventListener("change", this.#onItemFieldChange.bind(this));
    }
    // Resource inputs
    for ( const input of this.element.querySelectorAll("[data-resource-field]") ) {
      input.addEventListener("change", this.#onResourceFieldChange.bind(this));
    }
    // Right-click an item row to post it to chat
    for ( const row of this.element.querySelectorAll(".swp-row[data-item-id]") ) {
      row.addEventListener("contextmenu", event => {
        event.preventDefault();
        this.actor.items.get(row.dataset.itemId)?.toChat();
      });
    }
  }

  /**
   * Update a field of an embedded item from an inline input.
   * @param {Event} event
   */
  async #onItemFieldChange(event) {
    event.stopPropagation();
    const input = event.currentTarget;
    const item = this.actor.items.get(input.closest("[data-item-id]")?.dataset.itemId);
    if ( !item ) return;
    let value = input.type === "checkbox" ? input.checked : input.value;
    if ( input.dataset.dtype === "Number" || input.type === "number" ) value = Number(value) || 0;
    await item.update({ [input.dataset.itemField]: value });
  }

  /**
   * Update a resource tracker field.
   * @param {Event} event
   */
  async #onResourceFieldChange(event) {
    event.stopPropagation();
    const input = event.currentTarget;
    const id = input.closest("[data-resource-id]")?.dataset.resourceId;
    if ( !id ) return;
    let value = input.value;
    if ( input.type === "number" ) value = Number(value) || 0;
    await this.actor.update({ [`system.resources.${id}.${input.dataset.resourceField}`]: value });
  }

  /* -------------------------------------------- */
  /*  Drag & drop                                 */
  /* -------------------------------------------- */

  /** @override */
  async _onDropItem(event, item) {
    if ( !this.actor.isOwner ) return null;
    if ( this.actor.uuid === item.parent?.uuid ) return super._onDropItem(event, item);
    // Effect presets are applied, not added
    if ( item.type === "effect" ) {
      await item.applyTo([this.actor]);
      return null;
    }
    const handled = await this._onDropItemSpecial(event, item);
    if ( handled !== undefined ) return handled;
    let result = null;
    // Stack identical gear
    const existing = (item.type === "gear")
      ? this.actor.items.find(i => (i.type === item.type) && (i.name === item.name) && !i.system.equipped) : null;
    if ( existing?.system.consumable ) {
      await existing.update({ "system.quantity": existing.system.quantity + (item.system.quantity || 1) });
      result = existing;
    }
    else result = await super._onDropItem(event, item);
    // Taken from the party stash: the item leaves the stash
    if ( result && (item.parent?.type === "party") && item.parent.isOwner ) await item.delete();
    return result;
  }

  /**
   * Type-specific drop handling. Return undefined to continue with the default behaviour.
   * @param {DragEvent} event
   * @param {Item} item
   * @returns {Promise<Item|null|undefined>}
   * @protected
   */
  async _onDropItemSpecial(event, item) {
    return undefined;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /** Item from an action target. */
  _getItem(target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    return id ? this.actor.items.get(id) : null;
  }

  static #onItemEdit(event, target) {
    this._getItem(target)?.sheet.render(true);
  }

  static async #onItemDelete(event, target) {
    const item = this._getItem(target);
    if ( !item ) return;
    if ( event.shiftKey ) return item.delete();
    return item.deleteDialog();
  }

  static #onItemUse(event, target) {
    return this._getItem(target)?.use({ event });
  }

  static #onItemChat(event, target) {
    return this._getItem(target)?.toChat();
  }

  static async #onItemCreate(event, target) {
    const type = target.dataset.type;
    const extra = target.dataset.system ? JSON.parse(target.dataset.system) : {};
    const name = game.i18n.format("DOCUMENT.New", { type: game.i18n.localize(`TYPES.Item.${type}`) });
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name, type, system: extra }]);
    item?.sheet.render(true);
  }

  static async #onItemToggleEquip(event, target) {
    const item = this._getItem(target);
    if ( !item ) return;
    await item.update({ "system.equipped": !item.system.equipped });
  }

  static async #onItemQuantity(event, target) {
    const item = this._getItem(target);
    if ( !item ) return;
    const delta = Number(target.dataset.delta) || 0;
    const q = Math.max(0, (item.system.quantity ?? 0) + delta);
    await item.update({ "system.quantity": q });
  }

  static async #onEffectToggle(event, target) {
    const effect = this.#getEffect(target);
    if ( effect ) await effect.update({ disabled: !effect.disabled });
  }

  static #onEffectEdit(event, target) {
    this.#getEffect(target)?.sheet.render(true);
  }

  static async #onEffectDelete(event, target) {
    const effect = this.#getEffect(target);
    if ( effect ) await effect.delete();
  }

  static async #onEffectCreate(event, target) {
    const [effect] = await this.actor.createEmbeddedDocuments("ActiveEffect", [{
      name: t("SW25.Effect.New"), img: "icons/svg/aura.svg", origin: this.actor.uuid
    }]);
    effect?.sheet.render(true);
  }

  /** Find an effect (on the actor or one of its items). */
  #getEffect(target) {
    const row = target.closest("[data-effect-id]");
    if ( !row ) return null;
    const parent = row.dataset.parentId ? this.actor.items.get(row.dataset.parentId) : this.actor;
    return parent?.effects.get(row.dataset.effectId) ?? null;
  }

  static async #onStatusToggle(event, target) {
    await this.actor.toggleStatusEffect(target.dataset.status);
  }

  static #onRollCheck(event, target) {
    return rollCheck(this.actor, target.dataset.check, { event });
  }

  static async #onResourceAdd() {
    const id = foundry.utils.randomID();
    const count = Object.keys(this.actor.system.resources ?? {}).length;
    await this.actor.update({
      [`system.resources.${id}`]: { label: t("SW25.Resources.New"), value: 0, max: 0, color: "#7a5a2e", sort: count }
    });
  }

  static async #onResourceDelete(event, target) {
    const id = target.closest("[data-resource-id]")?.dataset.resourceId;
    if ( id ) await this.actor.update({ [`system.resources.-=${id}`]: null });
  }

  static async #onResourceAdjust(event, target) {
    const id = target.closest("[data-resource-id]")?.dataset.resourceId;
    const res = this.actor.system.resources?.[id];
    if ( !res ) return;
    const delta = Number(target.dataset.delta) || 0;
    let value = res.value + delta;
    if ( res.max > 0 ) value = Math.clamp(value, 0, res.max);
    await this.actor.update({ [`system.resources.${id}.value`]: value });
  }

  static #onOpenSpellbook(event, target) {
    return game.sw25.SpellbookApp.openFor(this.actor, { tab: target.dataset.tab });
  }

  /**
   * The magnifiers open the compendium browser on the matching tab, with filters for this character (spells of its
   * magic systems, abilities of its classes, the kind of equipment). Shift-click opens the compendium itself.
   */
  static #onOpenCompendium(event, target) {
    const pack = target.dataset.pack;
    const tab = { spells: "spells", feats: "feats", "class-abilities": "abilities", weapons: "equipment", armor: "equipment", gear: "equipment" }[pack];
    if ( !tab || event.shiftKey ) return game.packs.get(`swordworld25.${pack}`)?.render(true);
    const sys = this.actor.system;
    let filters = {};
    if ( pack === "spells" ) {
      const systems = Object.keys(sys.magic ?? {});
      if ( systems.length ) filters = { magic: systems };
    } else if ( pack === "class-abilities" ) {
      const kinds = Object.entries(CONFIG.SW25.learnedTypes).filter(([, cls]) => sys.classes?.[cls]).map(([kind]) => kind);
      if ( kinds.length ) filters = { type: kinds };
    } else if ( pack === "weapons" ) filters = { group: ["weapon"] };
    else if ( pack === "armor" ) filters = { group: ["nonmetal", "metal", "shield"] };
    else if ( pack === "gear" ) {
      filters = { group: ["accessory", "potion", "herb", "ammo", "tool", "gear", "classItem", "improvement", "golemItem", "mountItem", "other"] };
    }
    return CompendiumBrowser.open(tab, { filters, actor: this.actor });
  }

  /** Expand or collapse a row (its key is on the closest [data-expand]). */
  static #onToggleExpand(event, target) {
    const key = target.closest("[data-expand]")?.dataset.expand;
    if ( !key ) return;
    if ( this._expanded.has(key) ) this._expanded.delete(key);
    else this._expanded.add(key);
    return this._renderPartOf(target);
  }
}
