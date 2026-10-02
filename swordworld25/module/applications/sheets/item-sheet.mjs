import { restoreArrays } from "./actor-base.mjs";
import { itemEntry } from "../../helpers/item-entry.mjs";
import { enrich, keyboardActions, t } from "../../helpers/utils.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/**
 * Item sheet for every Sword World 2.5 item type, in the "paper" style: the view mode shows the item as a
 * rulebook entry (black title bar, gray label cells, summary and effect rows, weapon tables with the power row),
 * the ✎ mode turns the entry into a form.
 */
export default class SW25ItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sw25", "sheet", "item", "swp", "themed", "theme-light"],
    position: { width: 640, height: "auto" },
    form: { submitOnChange: true },
    window: { resizable: true },
    actions: {
      modifierAdd: SW25ItemSheet.#onModifierAdd,
      modifierDelete: SW25ItemSheet.#onModifierDelete,
      arrayAdd: SW25ItemSheet.#onArrayAdd,
      arrayDelete: SW25ItemSheet.#onArrayDelete,
      effectCreate: SW25ItemSheet.#onEffectCreate,
      effectEdit: SW25ItemSheet.#onEffectEdit,
      effectDelete: SW25ItemSheet.#onEffectDelete,
      effectToggle: SW25ItemSheet.#onEffectToggle,
      use: SW25ItemSheet.#onUse,
      toChat: SW25ItemSheet.#onToChat,
      openSource: SW25ItemSheet.#onOpenSource,
      toggleEdit: SW25ItemSheet.#onToggleEdit,
      setMode: SW25ItemSheet.#onSetMode,
      toggleCategory: SW25ItemSheet.#onToggleCategory,
      toggleSlot: SW25ItemSheet.#onToggleSlot,
      toggleTag: SW25ItemSheet.#onToggleTag,
      toggleType: SW25ItemSheet.#onToggleType,
      toggleColor: SW25ItemSheet.#onToggleColor
    }
  };

  /** @override */
  static PARTS = {
    header: { template: "systems/swordworld25/templates/item/header.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    description: { template: "systems/swordworld25/templates/item/main.hbs", scrollable: [""] },
    automation: { template: "systems/swordworld25/templates/item/automation.hbs", scrollable: [""] }
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        { id: "description", icon: "fa-solid fa-scroll", tooltip: "SW25.Tab.description" },
        { id: "automation", icon: "fa-solid fa-gears", tooltip: "SW25.Tab.automation" }
      ],
      initial: "description",
      labelPrefix: "SW25.Tab"
    }
  };

  /** Explicit edit mode toggle (null: decided from the item). */
  _editMode = null;

  /** Is the entry shown as a form? */
  get editMode() {
    if ( !this.isEditable ) return false;
    this._editMode ??= this.#isBlank();
    return this._editMode;
  }

  /** A freshly created item: nothing written yet. */
  #isBlank() {
    const s = this.item.system;
    return !s.summary && !s.description && !s.source?.book;
  }

  /* -------------------------------------------- */

  /** @override */
  _processFormData(event, form, formData) {
    const data = restoreArrays(super._processFormData(event, form, formData), this.document._source);
    // Damage type lists of the modifiers are typed as "fire, water"
    const lists = [data.system?.modifiers, data.system?.risk?.modifiers];
    for ( const list of lists ) {
      if ( !Array.isArray(list) ) continue;
      for ( const mod of list ) {
        for ( const key of ["types", "exceptTypes"] ) {
          if ( typeof mod?.[key] === "string" ) mod[key] = mod[key].split(/[\s,;]+/).map(v => v.trim()).filter(Boolean);
        }
      }
    }
    return data;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.item;
    const SW25 = CONFIG.SW25;
    const edit = this.editMode;
    Object.assign(context, {
      item,
      system: item.system,
      config: SW25,
      isGM: game.user.isGM,
      edit,
      editable: this.isEditable,
      typeLabel: game.i18n.localize(`TYPES.Item.${item.type}`),
      detailsTemplate: `systems/swordworld25/templates/item/details/${item.type}.hbs`,
      entry: await itemEntry(item, { text: !edit }),
      enrichedDescription: edit ? await enrich(item.system.description, { secrets: item.isOwner, relativeTo: item }) : "",
      sourceLabel: item.system.sourceLabel,
      sourceUuid: this.#compendiumSource(),
      tags: this.#tags(),
      useButton: this.#useButton(),
      modifierKeys: this.#modifierKeyOptions(),
      effects: item.effects.map(e => ({
        id: e.id, name: e.name, img: e.img, disabled: e.disabled, summary: e.modifierSummary, transfer: e.transfer
      })),
      choices: this.#choices()
    });
    // Type-specific form helpers
    if ( item.type === "weapon" ) {
      context.categories = Object.entries(SW25.weaponCategories).map(([k, l]) => ({ key: k, label: l, active: item.system.categories.includes(k) }));
      context.categoryOptions = Object.fromEntries(item.system.categories.map(k => [k, SW25.weaponCategories[k] ?? k]));
    }
    if ( item.type === "gear" ) {
      context.slots = Object.entries(SW25.accessorySlots).concat([["hand", "SW25.Slot.hand"], ["any", "SW25.Slot.any"]])
        .map(([k, l]) => ({ key: k, label: l, active: item.system.slot.includes(k) }));
    }
    if ( item.type === "ability" ) {
      context.abilityTags = Object.entries(SW25.abilityTags).map(([k, v]) => ({ key: k, label: v.label, icon: v.icon, active: item.system.tags.includes(k) }));
    }
    if ( ["spell", "spellsong", "finale", "ability", "gear"].includes(item.type) ) {
      const list = item.type === "ability" ? item.system.damage.types : item.system.types;
      context.damageTypes = Object.entries(SW25.damageTypes).map(([k, l]) => ({ key: k, label: l, active: (list ?? []).includes(k) }));
    }
    if ( item.type === "spell" ) {
      const list = item.system.effect.statuses ?? [];
      context.statusChoices = CONFIG.statusEffects.filter(e => !["dead"].includes(e.id))
        .map(e => ({ key: e.id, label: e.name, img: e.img, active: list.includes(e.id) }));
    }
    if ( item.type === "class" ) {
      context.expTable = (SW25.expTable[item.system.track] ?? []).slice(1).map((cost, i) => ({ level: i + 1, cost }));
    }
    if ( item.type === "evocation" ) {
      context.ranks = SW25.cardRanks.map(r => ({ rank: r, data: item.system.ranks[r] }));
      context.cardColors = Object.entries(SW25.cardColors).map(([k, l]) => ({ key: k, label: l, active: item.system.cards.colors.includes(k) }));
    }
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    keyboardActions(this.element);
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if ( context.tabs?.[partId] ) context.tab = context.tabs[partId];
    return context;
  }

  /**
   * Uuid of the compendium entry an owned or world item was imported from.
   * @returns {string|null}
   */
  #compendiumSource() {
    if ( this.item.pack ) return null;
    const uuid = this.item._stats?.compendiumSource ?? this.item.flags?.core?.sourceId ?? null;
    return uuid?.startsWith("Compendium.") ? uuid : null;
  }

  /**
   * Short tags of the header: category, source book, state on the owner.
   * @returns {object[]}
   */
  #tags() {
    const item = this.item;
    const s = item.system;
    const SW25 = CONFIG.SW25;
    const loc = (map, key) => game.i18n.localize(map[key]?.label ?? map[key] ?? key);
    const tags = [];
    switch ( item.type ) {
      case "spell": tags.push({ icon: SW25.magicSystems[s.magic]?.icon, label: loc(SW25.magicSystems, s.magic) }); break;
      case "weapon": if ( s.category ) tags.push({ label: loc(SW25.weaponCategories, s.category) }); break;
      case "armor": tags.push({ label: loc(SW25.armorTypes, s.armorType) }); break;
      case "gear": tags.push({ label: loc(SW25.gearTypes, s.itemType) }); break;
      case "class": tags.push({ label: loc(SW25.classCategories, s.category) }); break;
      case "feat": tags.push({ label: loc(SW25.featTypes, s.featType) }); break;
      case "ability": if ( s.section ) tags.push({ label: s.section }); break;
    }
    if ( item.parent ) {
      if ( ["weapon", "armor", "gear"].includes(item.type) && (s.quantity > 1) ) tags.push({ label: `×${s.quantity}` });
      if ( ["weapon", "armor"].includes(item.type) || ((item.type === "gear") && s.slot?.length) ) {
        tags.push({ icon: "fa-solid fa-hand-fist", label: t(s.equipped ? "SW25.Equipped" : "SW25.Entry.NotEquipped"), cls: s.equipped ? "" : "off" });
      }
    }
    if ( s.sourceLabel ) tags.push({ icon: "fa-solid fa-book", label: s.sourceLabel, tooltip: "SW25.Source" });
    return tags;
  }

  /**
   * The main action of the item (attack, cast, perform, use, apply).
   * @returns {object|null}
   */
  #useButton() {
    const item = this.item;
    if ( item.type === "effect" ) return { icon: "fa-solid fa-person-rays", tooltip: "SW25.Entry.ApplyToTargets" };
    if ( !item.actor ) return null;
    switch ( item.type ) {
      case "weapon": return { icon: "fa-solid fa-dice-d6", tooltip: "SW25.Attack" };
      case "spell": return { icon: "fa-solid fa-wand-magic-sparkles", tooltip: "SW25.Spellbook.Cast" };
      case "technique":
      case "spellsong":
      case "finale":
      case "evocation":
      case "ability": return { icon: "fa-solid fa-dice-d6", tooltip: "SW25.Use" };
      case "gear": return item.system.isUsable ? { icon: "fa-solid fa-hand-sparkles", tooltip: "SW25.Use" } : null;
      default: return null;
    }
  }

  /**
   * Options for the modifier key select.
   * @returns {object}
   */
  #modifierKeyOptions() {
    const options = {};
    for ( const [k, v] of Object.entries(CONFIG.SW25.modifierKeys) ) options[k] = game.i18n.localize(v);
    for ( const k of Object.keys(CONFIG.SW25.checks) ) options[`check.${k}`] = `${t("SW25.Check.label")}: ${t(`SW25.Check.${k}`)}`;
    return options;
  }

  /**
   * Select choices used by the templates.
   * @returns {object}
   */
  #choices() {
    const SW25 = CONFIG.SW25;
    const loc = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === "string" ? v : v.label]));
    return {
      categories: SW25.classCategories,
      tracks: SW25.classTracks,
      magic: loc(SW25.magicSystems),
      resistance: SW25.resistance,
      targetKinds: SW25.targetKinds,
      rangeKinds: SW25.rangeKinds,
      areaKinds: SW25.areaKinds,
      durationUnits: SW25.durationUnits,
      effectKinds: SW25.effectKinds,
      damageKinds: SW25.damageKinds,
      armorTypes: SW25.armorTypes,
      grappler: SW25.grapplerArmor,
      gearTypes: SW25.gearTypes,
      useKinds: SW25.useKinds,
      useBonuses: { ...SW25.useBonuses, riderDex: "SW25.UseBonus.riderDex" },
      featTypes: SW25.featTypes,
      acquisition: { selective: "SW25.Feat.Selective", automatic: "SW25.Feat.Automatic" },
      stuntActions: SW25.stuntActions,
      stuntAreas: { none: "SW25.Stunt.AreaNone", main: "SW25.Stunt.AreaMain", all: "SW25.Stunt.AreaAll" },
      ranks: SW25.ranks,
      magispheres: SW25.magispheres,
      resistVs: SW25.resistVs,
      abilityDamageKinds: { physical: "SW25.DamageKind.physical", magic: "SW25.DamageKind.magic", fixed: "SW25.DamageKind.fixed", heal: "SW25.EffectKind.heal" },
      books: { CR1: "CR I", CR2: "CR II", CR3: "CR III" },
      classes: loc(SW25.classes),
      scopes: { effect: "SW25.Mod.ScopeEffect", use: "SW25.Mod.ScopeUse" },
      targets: { self: "SW25.Mod.TargetSelf", target: "SW25.Mod.TargetTarget" },
      actorTypes: { "": "SW25.Mod.ActorAny", character: "SW25.Mod.ActorCharacter", monster: "SW25.Mod.ActorMonster" },
      subsystems: this.item.system.magic === "fairy" ? { basic: "SW25.Fairy.basic", ...SW25.fairyElements }
        : (this.item.system.magic === "divine" ? SW25.divineSubsystems : {})
    };
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onModifierAdd(event, target) {
    const path = target.dataset.path ?? "system.modifiers";
    const list = foundry.utils.deepClone(foundry.utils.getProperty(this.item._source, path) ?? []);
    list.push({ key: "accuracy", value: 1, condition: "", scope: "effect", target: "self" });
    await this.item.update({ [path]: list });
  }

  static async #onModifierDelete(event, target) {
    const path = target.dataset.path ?? "system.modifiers";
    const list = foundry.utils.deepClone(foundry.utils.getProperty(this.item._source, path) ?? []);
    list.splice(Number(target.dataset.index), 1);
    await this.item.update({ [path]: list });
  }

  static async #onArrayAdd(event, target) {
    const path = target.dataset.path;
    const list = foundry.utils.deepClone(foundry.utils.getProperty(this.item._source, path) ?? []);
    const template = target.dataset.template ? JSON.parse(target.dataset.template) : {};
    list.push(template);
    await this.item.update({ [path]: list });
  }

  static async #onArrayDelete(event, target) {
    const path = target.dataset.path;
    const list = foundry.utils.deepClone(foundry.utils.getProperty(this.item._source, path) ?? []);
    list.splice(Number(target.dataset.index), 1);
    await this.item.update({ [path]: list });
  }

  static async #onEffectCreate() {
    const [effect] = await this.item.createEmbeddedDocuments("ActiveEffect", [{
      name: this.item.name, img: this.item.img, transfer: true, origin: this.item.uuid
    }]);
    effect?.sheet.render(true);
  }

  static #onEffectEdit(event, target) {
    this.item.effects.get(target.closest("[data-effect-id]")?.dataset.effectId)?.sheet.render(true);
  }

  static async #onEffectDelete(event, target) {
    await this.item.effects.get(target.closest("[data-effect-id]")?.dataset.effectId)?.delete();
  }

  static async #onEffectToggle(event, target) {
    const effect = this.item.effects.get(target.closest("[data-effect-id]")?.dataset.effectId);
    if ( effect ) await effect.update({ disabled: !effect.disabled });
  }

  static #onUse(event) {
    if ( this.item.type === "effect" ) return this.item.applyTo();
    return this.item.use({ event });
  }

  static #onToChat() {
    return this.item.toChat();
  }

  static async #onOpenSource(event, target) {
    const doc = await fromUuid(target.dataset.uuid);
    if ( doc ) doc.sheet.render(true);
    else ui.notifications.warn(t("SW25.Entry.SourceMissing"));
  }

  static #onToggleEdit() {
    this._editMode = !this.editMode;
    return this.render();
  }

  static async #onSetMode(event, target) {
    if ( !this.isEditable || !this.item.parent ) return;
    await this.item.update({ "system.mode": Number(target.dataset.index) || 0 });
  }

  /** Toggle a key in an array field. */
  async #toggleIn(path, key) {
    const set = new Set(foundry.utils.getProperty(this.item._source, path) ?? []);
    if ( set.has(key) ) set.delete(key);
    else set.add(key);
    await this.item.update({ [path]: [...set] });
  }

  static #onToggleCategory(event, target) {
    return this.#toggleIn("system.categories", target.dataset.key);
  }

  static #onToggleSlot(event, target) {
    return this.#toggleIn("system.slot", target.dataset.key);
  }

  static #onToggleTag(event, target) {
    return this.#toggleIn("system.tags", target.dataset.key);
  }

  static #onToggleType(event, target) {
    return this.#toggleIn(target.dataset.path ?? "system.types", target.dataset.key);
  }

  static #onToggleColor(event, target) {
    return this.#toggleIn("system.cards.colors", target.dataset.key);
  }
}
