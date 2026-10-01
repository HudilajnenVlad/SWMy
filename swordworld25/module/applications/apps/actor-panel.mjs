import { keyboardActions, signed, SYSTEM_ID, t } from "../../helpers/utils.mjs";
import { applyDamageTo } from "../../combat/damage.mjs";
import { rollSectionAttack, rollWeaponAttack, rollWeaponDamage, useAbility } from "../../workflows/attacks.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Base of the floating panels that follow the selected token (else the user's character): the resource tracker and
 * the combat panel. Each panel is a singleton turned on and off by its toggle in the Token Controls (a client
 * setting); the X of its window turns it off as well, while closings made by the system (no actor to show, the
 * other panel taking its place) keep it on. The arrow of the title bar, or a double click on it, collapses the panel
 * to a translucent bar with the name, HP and MP; the position is remembered. Escape does not close the panels.
 * Changes of HP, MP and custom trackers made in a panel are manual corrections: they post nothing to the chat.
 */
export default class ActorPanel extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sw25", "sw25-panel", "swp", "themed", "theme-light", "swp-collapsible"],
    position: { height: "auto" },
    window: { minimizable: false, resizable: false },
    actions: {
      collapse: ActorPanel.#onCollapse,
      step: ActorPanel.#onStep,
      amount: ActorPanel.#onAmount,
      rhythm: ActorPanel.#onRhythm,
      openSheet: ActorPanel.#onOpenSheet,
      spellbook: ActorPanel.#onSpellbook,
      removeStatus: ActorPanel.#onRemoveStatus,
      section: ActorPanel.#onSection,
      attack: ActorPanel.#onAttack,
      weaponDamage: ActorPanel.#onWeaponDamage,
      sectionAttack: ActorPanel.#onSectionAttack,
      ability: ActorPanel.#onAbility
    }
  };

  /**
   * Client settings of the panel: whether it is on, whether it is collapsed, and its position.
   * @type {{show: string, collapsed: string, position: string}}
   */
  static SETTINGS = { show: "", collapsed: "", position: "" };

  /**
   * The toggle of the panel in the Token Controls.
   * @type {{name: string, title: string, icon: string, order: number}}
   */
  static TOOL = { name: "", title: "", icon: "", order: 100 };

  /** Tooltip of the X of the window. */
  static CLOSE_HINT = "";

  /** Does the panel stay on screen, with a hint, when there is no actor to show? */
  static KEEP_EMPTY = false;

  /** Singleton instance (each panel class has its own). */
  static instance = null;

  /** Index of the section shown for a multi-section creature. */
  section = null;

  /* -------------------------------------------- */
  /*  Singleton and toggle                        */
  /* -------------------------------------------- */

  /**
   * Create the panel and the hooks that keep it up to date (once).
   * @returns {ActorPanel}
   */
  static initialize() {
    if ( this.instance ) return this.instance;
    const panel = this.instance = new this();
    const refresh = foundry.utils.debounce(() => panel.refresh(), 100);
    Hooks.on("controlToken", refresh);
    Hooks.on("canvasReady", refresh);
    Hooks.on("updateActor", actor => { if ( actor === panel.actor ) refresh(); });
    Hooks.on("updateToken", token => { if ( token.actor === panel.actor ) refresh(); });
    for ( const hook of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect", "createItem", "deleteItem", "updateItem"] ) {
      Hooks.on(hook, doc => { if ( (doc.parent === panel.actor) || (doc.parent?.parent === panel.actor) ) refresh(); });
    }
    this._registerHooks(refresh);
    return panel;
  }

  /**
   * Additional hooks of a panel.
   * @param {Function} refresh  Debounced refresh of the panel
   * @protected
   */
  static _registerHooks(refresh) {}

  /** Is the panel turned on (its client setting)? */
  static get enabled() {
    return game.settings.get(SYSTEM_ID, this.SETTINGS.show);
  }

  /** Should the panel be on screen? */
  static get visible() {
    return this.enabled;
  }

  /** Show or hide the panel as its settings say. */
  static sync() {
    if ( this.visible ) this.initialize().refresh();
    else if ( this.instance?.rendered ) this.instance.close({ animate: false, sw25Auto: true });
  }

  /**
   * The panel was turned on or off (its client setting changed).
   * @param {boolean} show
   */
  static toggle(show) {
    this.sync();
    // Keep the Token Controls toggle in step
    const tool = ui.controls?.controls?.tokens?.tools?.[this.TOOL.name];
    if ( tool && (tool.active !== show) ) {
      tool.active = show;
      if ( ui.controls.rendered ) ui.controls.render();
    }
  }

  /**
   * The toggle of the panel in the Token Controls.
   * @returns {object}   SceneControlTool
   */
  static get controlTool() {
    const key = this.SETTINGS.show;
    return {
      ...this.TOOL,
      toggle: true,
      active: game.settings.get(SYSTEM_ID, key),
      onChange: (event, active) => {
        if ( game.settings.get(SYSTEM_ID, key) !== active ) game.settings.set(SYSTEM_ID, key, active);
      }
    };
  }

  /* -------------------------------------------- */
  /*  Shown actor                                 */
  /* -------------------------------------------- */

  /** Is the panel collapsed to its title bar? */
  get collapsed() {
    return game.settings.get(SYSTEM_ID, this.constructor.SETTINGS.collapsed);
  }

  /** The actor shown: the first controlled token's, else the user's character. */
  get actor() {
    const token = canvas.tokens?.controlled?.[0];
    return token?.actor ?? game.user.character ?? null;
  }

  /**
   * Can the panel show an actor?
   * @param {Actor|null} actor
   * @returns {boolean}
   * @protected
   */
  _canShow(actor) {
    return !!actor && (actor.type !== "party") && actor.testUserPermission(game.user, "OBSERVER");
  }

  /**
   * Title of the window: the actor with its HP and MP while collapsed.
   * @override
   */
  get title() {
    const actor = this.actor;
    if ( !this.collapsed || !this._canShow(actor) ) return game.i18n.localize(this.options.window.title);
    const { hp, mp } = this._vitalsOf(actor);
    return `${actor.name} · ${t("SW25.HP")} ${hp.value}/${hp.max} · ${t("SW25.MP")} ${mp.value}/${mp.max}`;
  }

  /**
   * HP and MP shown for an actor: those of the chosen section of a multi-section creature.
   * @param {Actor} actor
   * @returns {{hp: object, mp: object}}
   * @protected
   */
  _vitalsOf(actor) {
    const sys = actor.system;
    const sections = sys.sections ?? [];
    if ( (actor.type === "character") || (sections.length < 2) ) return { hp: sys.hp, mp: sys.mp };
    const section = sections[this._sectionIndex(actor)] ?? sections[0];
    return { hp: section.hp, mp: section.mp };
  }

  /**
   * Section of a creature the panel works on: the chosen one, else the main one.
   * @param {Actor} actor
   * @returns {number}
   * @protected
   */
  _sectionIndex(actor) {
    return this.section ?? Math.max(0, (actor.system.sections ?? []).findIndex(s => s.main));
  }

  /** Re-render if there is something to show, close otherwise. */
  refresh() {
    const cls = this.constructor;
    const actor = this.actor;
    if ( !cls.visible || (!this._canShow(actor) && !cls.KEEP_EMPTY) ) {
      if ( this.rendered ) this.close({ animate: false, sw25Auto: true });
      return;
    }
    if ( actor !== this._lastActor ) this.section = null;
    this._lastActor = actor;
    // Updates do not bring the panel to the front of the other windows
    this.render({ force: !this.rendered, window: { title: this.title } });
  }

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const actor = this.actor;
    if ( !this._canShow(actor) ) return { actor: null };
    const sys = actor.system;
    const creature = actor.type !== "character";
    const activeSection = this._sectionIndex(actor);
    const sections = creature ? (sys.sections ?? []).map((s, i) => ({
      index: i, label: s.label, hp: s.hp, mp: s.mp, pct: s.hpPct, active: activeSection === i
    })) : [];
    // A multi-section creature shows the HP/MP of the chosen section
    const { hp, mp } = this._vitalsOf(actor);
    const pct = (v, m) => (m ? Math.clamp(Math.round((v / m) * 100), 0, 100) : 0);
    const SW25 = CONFIG.SW25;
    const owner = actor.isOwner;
    return {
      actor,
      owner,
      creature,
      level: sys.level,
      vitals: [
        { key: "hp", label: t("SW25.HP"), value: hp.value, max: hp.max, pct: pct(hp.value, hp.max),
          down: t("SW25.Tracker.HPDown"), up: t("SW25.Tracker.HPUp") },
        { key: "mp", label: t("SW25.MP"), value: mp.value, max: mp.max, pct: pct(mp.value, mp.max),
          down: t("SW25.Tracker.MPDown"), up: t("SW25.Tracker.MPUp") }
      ],
      sections: sections.length > 1 ? sections : [],
      attacks: owner ? this._attacks(actor) : null,
      resources: (sys.resourceList ?? []).map(r => ({ ...r, key: `res:${r.id}` })),
      rhythm: sys.classes?.bard ? Object.entries(SW25.rhythms).map(([key, cfg]) => ({ key, icon: cfg.icon, label: cfg.label, value: sys.rhythm?.[key] ?? 0 })) : null,
      cardRanks: SW25.cardRanks,
      cards: sys.classes?.alchemist ? Object.entries(sys.cards ?? {}).map(([color, ranks]) => ({
        color, label: SW25.cardColors[color], ranks: SW25.cardRanks.map(rank => ({ rank, value: ranks[rank] ?? 0 }))
      })) : null,
      statuses: actor.temporaryEffects.map(e => ({ id: e.id, name: e.name, img: e.img, duration: e.duration?.label ?? "" }))
    };
  }

  /**
   * Attacks of the actor: equipped weapons of a character; attacking sections and active unique skills of a creature.
   * @param {Actor} actor
   * @returns {{weapons: object[], sections: object[], abilities: object[]}|null}
   * @protected
   */
  _attacks(actor) {
    const fixed = n => `${n} (${n + CONFIG.SW25.FIXED_OFFSET})`;
    if ( actor.type === "character" ) {
      const weapons = actor.items.filter(i => (i.type === "weapon") && i.system.equipped && i.system.attack).map(w => {
        const atk = w.system.attack;
        return {
          id: w.id, name: w.name, img: w.img, gun: w.system.isGun,
          accuracy: signed(atk.accuracy),
          power: w.system.isGun ? t("SW25.Gun.Bullet") : `${t("SW25.Tracker.PowerShort")}${atk.power ?? "—"}`,
          critical: atk.critical, extra: signed(atk.extraDamage),
          stance: w.system.currentMode?.stance ?? "", multiMode: w.system.modes.length > 1
        };
      });
      return weapons.length ? { weapons, sections: [], abilities: [] } : null;
    }
    const sections = (actor.system.sections ?? []).map((s, i) => ({ s, i }))
      .filter(({ s }) => Number.isFinite(s.accuracyTotal) && s.damage)
      .map(({ s, i }) => ({ index: i, label: s.label, style: s.style, accuracy: fixed(s.accuracyTotal), damage: s.damage }));
    const abilities = actor.items.filter(i => (i.type === "ability") && !i.system.isPassiveSkill && !i.system.spellcasting?.system
      && (Number.isInteger(i.system.check?.value) || i.system.damage?.formula))
      .map(i => ({
        id: i.id, name: i.name, icons: i.system.tagIcons,
        check: Number.isInteger(i.system.check.value) ? fixed(i.system.check.value) : "",
        damage: i.system.damage?.formula ?? ""
      }));
    return (sections.length || abilities.length) ? { weapons: [], sections, abilities } : null;
  }

  /* -------------------------------------------- */
  /*  Window                                      */
  /* -------------------------------------------- */

  /** @override */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    // An arrow before the X collapses the panel to its title bar (so does a double click on the bar)
    const close = frame.querySelector(".window-header [data-action=close]");
    if ( close ) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "header-control icon fa-solid fa-chevron-up";
      button.dataset.action = "collapse";
      close.before(button);
      if ( this.constructor.CLOSE_HINT ) {
        close.dataset.tooltip = t(this.constructor.CLOSE_HINT);
        close.setAttribute("aria-label", close.dataset.tooltip);
      }
    }
    frame.querySelector(".window-header")?.addEventListener("dblclick", event => {
      if ( event.target.closest("button") ) return;
      ActorPanel.#onCollapse.call(this);
    });
    return frame;
  }

  /** @override */
  _updateFrame(options) {
    super._updateFrame(options);
    const collapsed = this.collapsed;
    this.element.classList.toggle("collapsed", collapsed);
    const button = this.element.querySelector(".window-header [data-action=collapse]");
    if ( button ) {
      const label = t(collapsed ? "SW25.Window.Expand" : "SW25.Window.Collapse");
      button.className = `header-control icon fa-solid ${collapsed ? "fa-chevron-down" : "fa-chevron-up"}`;
      button.dataset.tooltip = label;
      button.setAttribute("aria-label", label);
    }
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    keyboardActions(this.element);
    // Restore the saved position once
    if ( !this._positioned ) {
      const saved = this._savedPosition();
      if ( saved?.left ) this.setPosition({ left: saved.left, top: saved.top });
      this._positioned = true;
    }
  }

  /**
   * The position the panel opens at.
   * @returns {{left: number, top: number}|null}
   * @protected
   */
  _savedPosition() {
    return game.settings.get(SYSTEM_ID, this.constructor.SETTINGS.position);
  }

  /** Debounced persistence of the window position. */
  #savePosition = foundry.utils.debounce((left, top) => {
    game.settings.set(SYSTEM_ID, this.constructor.SETTINGS.position, { left, top });
  }, 500);

  /** @override */
  setPosition(position) {
    const pos = super.setPosition(position);
    if ( this.rendered && pos ) this.#savePosition(pos.left, pos.top);
    return pos;
  }

  /**
   * The X of the window turns the panel off; closings by the system keep it on, and Escape leaves it open.
   * @override
   */
  async close(options = {}) {
    if ( options.closeKey ) return this;
    const manual = !options.sw25Auto;
    await super.close(options);
    const key = this.constructor.SETTINGS.show;
    if ( manual && game.settings.get(SYSTEM_ID, key) ) await game.settings.set(SYSTEM_ID, key, false);
    return this;
  }

  /* -------------------------------------------- */
  /*  Changing values                             */
  /* -------------------------------------------- */

  /**
   * Change a value of the shown actor: "hp", "mp" or "res:<id>" (custom tracker). No chat message is posted.
   * @param {string} key
   * @param {number} delta
   */
  async #change(key, delta) {
    const actor = this.actor;
    if ( !actor?.isOwner || !delta ) return;
    if ( key.startsWith("res:") ) {
      const id = key.slice(4);
      const res = actor.system.resources?.[id];
      if ( !res ) return;
      let value = res.value + delta;
      if ( res.max > 0 ) value = Math.clamp(value, 0, res.max);
      return actor.update({ [`system.resources.${id}.value`]: value });
    }
    const section = (actor.type !== "character") ? this._sectionIndex(actor) : null;
    // Straight change (no Defense, weak point or immunity), with the automatic statuses but without a chat log
    await applyDamageTo(actor, {
      amount: Math.abs(delta), kind: "fixed", heal: delta > 0, mp: key === "mp", section, log: false
    });
  }

  /**
   * Show the amount field over a row: it starts at 1, selected, so a number can be typed right away.
   * Enter applies, Escape or leaving the field cancels.
   * @param {HTMLElement} button
   * @param {string} key
   * @param {number} sign   1 or -1
   */
  #openAmount(button, key, sign) {
    this.#closeAmount();
    const row = button.closest("[data-row]");
    if ( !row ) return;
    const pop = document.createElement("div");
    pop.className = `swp-tracker-pop ${sign < 0 ? "down" : "up"}`;
    pop.innerHTML = `<span class="sign">${sign < 0 ? "−" : "+"}</span>
      <input type="text" inputmode="numeric" pattern="[0-9]*" value="1" autocomplete="off" aria-label="${t("SW25.Tracker.Amount")}">
      <button type="button" class="ok" data-tooltip="${t("SW25.Tracker.Apply")}"><i class="fa-solid fa-check"></i></button>`;
    row.append(pop);
    const input = pop.querySelector("input");
    const apply = () => {
      const n = Math.abs(Math.floor(Number(String(input.value).replace(/[^\d-]/g, "")) || 0));
      try {
        this.#closeAmount();
      } finally {
        if ( n ) this.#change(key, sign * n);
      }
    };
    input.addEventListener("keydown", event => {
      if ( event.key === "Enter" ) {
        event.preventDefault();
        apply();
      } else if ( event.key === "Escape" ) {
        event.preventDefault();
        event.stopPropagation();
        this.#closeAmount();
      }
    });
    pop.querySelector("button.ok").addEventListener("click", apply);
    pop.addEventListener("focusout", event => {
      if ( !pop.contains(event.relatedTarget) ) this.#closeAmount();
    });
    input.focus();
    input.select();
  }

  /** Remove the amount field (removing it blurs its input, which asks to remove it again). */
  #closeAmount() {
    const pop = this.element?.querySelector(".swp-tracker-pop");
    if ( !pop || pop.dataset.closing ) return;
    pop.dataset.closing = "true";
    pop.remove();
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Item of the shown actor from an action target.
   * @param {HTMLElement} target
   * @returns {Item|null}
   * @protected
   */
  _getItem(target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    return id ? (this.actor?.items.get(id) ?? null) : null;
  }

  static #onStep(event, target) {
    return this.#change(target.closest("[data-row]")?.dataset.row, Number(target.dataset.delta) || 0);
  }

  static #onAmount(event, target) {
    this.#openAmount(target, target.closest("[data-row]")?.dataset.row, Number(target.dataset.sign) < 0 ? -1 : 1);
  }

  static async #onRhythm(event, target) {
    const actor = this.actor;
    const key = target.dataset.key;
    const delta = Number(target.dataset.delta) || 0;
    await actor.update({ [`system.rhythm.${key}`]: Math.max(0, (actor.system.rhythm[key] ?? 0) + delta) });
  }

  static #onOpenSheet() {
    this.actor?.sheet.render(true);
  }

  static #onSpellbook(event, target) {
    if ( this.actor ) game.sw25.SpellbookApp.openFor(this.actor, { tab: target.dataset.tab });
  }

  /** Collapse the panel to its title bar, or expand it again. */
  static async #onCollapse() {
    this.#closeAmount();
    await game.settings.set(SYSTEM_ID, this.constructor.SETTINGS.collapsed, !this.collapsed);
    await this.render({ window: { title: this.title } });
    this.setPosition({ height: "auto" });
  }

  static async #onRemoveStatus(event, target) {
    const effect = this.actor?.effects.get(target.dataset.id);
    if ( effect && this.actor.isOwner ) await effect.delete();
  }

  static #onSection(event, target) {
    this.section = Number(target.dataset.index);
    this.render({ window: { title: this.title } });
  }

  static #onAttack(event, target) {
    const weapon = this._getItem(target);
    if ( weapon ) return rollWeaponAttack(this.actor, weapon, { event });
  }

  static #onWeaponDamage(event, target) {
    const weapon = this._getItem(target);
    if ( weapon ) return rollWeaponDamage(this.actor, weapon, { event });
  }

  static #onSectionAttack(event, target) {
    if ( this.actor ) return rollSectionAttack(this.actor, Number(target.closest("[data-index]")?.dataset.index) || 0, { event });
  }

  static #onAbility(event, target) {
    const ability = this._getItem(target);
    if ( ability ) return useAbility(this.actor, ability, { event });
  }
}
