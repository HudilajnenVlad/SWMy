import { keyboardActions, signed, t } from "../../helpers/utils.mjs";
import { applyDamageTo } from "../../combat/damage.mjs";
import { rollSectionAttack, rollWeaponAttack, rollWeaponDamage, useAbility } from "../../workflows/attacks.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Floating panel showing the selected token (or the user's character): HP/MP and custom trackers with ±1 and ±N
 * buttons, attacks, Bard rhythm, Alchemist cards and active conditions. Changes made here are manual corrections:
 * they post nothing to the chat. The panel collapses to a translucent title bar (name, HP, MP) that expands again;
 * the Token Controls toggle turns it off entirely.
 */
export default class ResourceTracker extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "sw25-resource-tracker",
    classes: ["sw25", "sw25-tracker", "swp", "themed", "theme-light"],
    position: { width: 320, height: "auto" },
    window: { title: "SW25.Tracker.Title", icon: "fa-solid fa-heart-pulse", minimizable: false, resizable: false },
    actions: {
      collapse: ResourceTracker.#onCollapse,
      step: ResourceTracker.#onStep,
      amount: ResourceTracker.#onAmount,
      rhythm: ResourceTracker.#onRhythm,
      openSheet: ResourceTracker.#onOpenSheet,
      spellbook: ResourceTracker.#onSpellbook,
      removeStatus: ResourceTracker.#onRemoveStatus,
      section: ResourceTracker.#onSection,
      attack: ResourceTracker.#onAttack,
      weaponDamage: ResourceTracker.#onWeaponDamage,
      sectionAttack: ResourceTracker.#onSectionAttack,
      ability: ResourceTracker.#onAbility
    }
  };

  /** @override */
  static PARTS = {
    body: { template: "systems/swordworld25/templates/apps/resource-tracker.hbs" }
  };

  /** Singleton instance. */
  static instance = null;

  /** Selected section for multi-section creatures. */
  section = null;

  /**
   * Create the tracker and its hooks.
   */
  static initialize() {
    if ( this.instance ) return;
    this.instance = new this();
    const refresh = foundry.utils.debounce(() => this.instance?.refresh(), 100);
    Hooks.on("controlToken", refresh);
    Hooks.on("updateActor", (actor) => { if ( actor === this.instance?.actor ) refresh(); });
    Hooks.on("updateToken", (token) => { if ( token.actor === this.instance?.actor ) refresh(); });
    for ( const hook of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect", "createItem", "deleteItem", "updateItem"] ) {
      Hooks.on(hook, (doc) => { if ( (doc.parent === this.instance?.actor) || (doc.parent?.parent === this.instance?.actor) ) refresh(); });
    }
    this.instance.refresh();
  }

  /**
   * Show or hide the tracker (the "showResourceTracker" client setting).
   * @param {boolean} show
   */
  static toggle(show) {
    if ( show ) {
      this.initialize();
      this.instance.refresh();
    } else if ( this.instance?.rendered ) {
      this.instance.close({ sw25Auto: true });
    }
    // Keep the Token Controls toggle in step
    const tool = ui.controls?.controls?.tokens?.tools?.sw25Tracker;
    if ( tool && (tool.active !== show) ) {
      tool.active = show;
      if ( ui.controls.rendered ) ui.controls.render();
    }
  }

  /**
   * The toggle of the tracker in the Token Controls.
   * @returns {object}   SceneControlTool
   */
  static get controlTool() {
    return {
      name: "sw25Tracker",
      title: "SW25.Tracker.Toggle",
      icon: "fa-solid fa-heart-pulse",
      order: 100,
      toggle: true,
      active: game.settings.get("swordworld25", "showResourceTracker"),
      onChange: (event, active) => {
        if ( game.settings.get("swordworld25", "showResourceTracker") !== active ) {
          game.settings.set("swordworld25", "showResourceTracker", active);
        }
      }
    };
  }

  /** Is the tracker collapsed to its title bar? */
  get collapsed() {
    return game.settings.get("swordworld25", "trackerCollapsed");
  }

  /**
   * Title of the window: the actor with its HP and MP while collapsed.
   * @override
   */
  get title() {
    const actor = this.actor;
    if ( !this.collapsed || !actor ) return game.i18n.localize(this.options.window.title);
    const { hp, mp } = this.#vitalsOf(actor);
    return `${actor.name} · ${t("SW25.HP")} ${hp.value}/${hp.max} · ${t("SW25.MP")} ${mp.value}/${mp.max}`;
  }

  /**
   * HP and MP shown for an actor: those of the chosen section of a multi-section creature.
   * @param {Actor} actor
   * @returns {{hp: object, mp: object}}
   */
  #vitalsOf(actor) {
    const sys = actor.system;
    const sections = sys.sections ?? [];
    if ( (actor.type === "character") || (sections.length < 2) ) return { hp: sys.hp, mp: sys.mp };
    const section = sections[this.section ?? Math.max(0, sections.findIndex(x => x.main))] ?? sections[0];
    return { hp: section.hp, mp: section.mp };
  }

  /** The actor currently tracked. */
  get actor() {
    const token = canvas.tokens?.controlled?.[0];
    return token?.actor ?? game.user.character ?? null;
  }

  /** Re-render if there is something to show, close otherwise. */
  refresh() {
    if ( !game.settings.get("swordworld25", "showResourceTracker") ) return;
    const actor = this.actor;
    if ( !actor || (actor.type === "party") || !actor.testUserPermission(game.user, "OBSERVER") ) {
      if ( this.rendered ) this.close({ animate: false, sw25Auto: true });
      return;
    }
    if ( actor !== this._lastActor ) this.section = null;
    this._lastActor = actor;
    this.render({ force: true, window: { title: this.title } });
  }

  /** @override */
  async _prepareContext(options) {
    const actor = this.actor;
    if ( !actor ) return { actor: null };
    const sys = actor.system;
    const creature = actor.type !== "character";
    const activeSection = this.section ?? Math.max(0, (sys.sections ?? []).findIndex(x => x.main));
    const sections = creature ? (sys.sections ?? []).map((s, i) => ({
      index: i, label: s.label, hp: s.hp, mp: s.mp, pct: s.hpPct, active: activeSection === i
    })) : [];
    // A multi-section creature shows the HP/MP of the chosen section
    const { hp, mp } = this.#vitalsOf(actor);
    const pct = (v, m) => (m ? Math.clamp(Math.round((v / m) * 100), 0, 100) : 0);
    const SW25 = CONFIG.SW25;
    const owner = actor.isOwner;
    return {
      actor,
      owner,
      creature,
      vitals: [
        { key: "hp", label: t("SW25.HP"), value: hp.value, max: hp.max, pct: pct(hp.value, hp.max),
          down: t("SW25.Tracker.HPDown"), up: t("SW25.Tracker.HPUp") },
        { key: "mp", label: t("SW25.MP"), value: mp.value, max: mp.max, pct: pct(mp.value, mp.max),
          down: t("SW25.Tracker.MPDown"), up: t("SW25.Tracker.MPUp") }
      ],
      sections: sections.length > 1 ? sections : [],
      attacks: owner ? this.#attacks(actor) : null,
      resources: (sys.resourceList ?? []).map(r => ({ ...r, key: `res:${r.id}` })),
      rhythm: sys.classes?.bard ? Object.entries(SW25.rhythms).map(([key, cfg]) => ({ key, icon: cfg.icon, label: cfg.label, value: sys.rhythm?.[key] ?? 0 })) : null,
      cardRanks: SW25.cardRanks,
      cards: sys.classes?.alchemist ? Object.entries(sys.cards ?? {}).map(([color, ranks]) => ({
        color, label: SW25.cardColors[color], ranks: SW25.cardRanks.map(rank => ({ rank, value: ranks[rank] ?? 0 }))
      })) : null,
      statuses: actor.temporaryEffects.map(e => ({ id: e.id, name: e.name, img: e.img, duration: e.duration?.label ?? "" })),
      level: sys.level,
      stats: creature ? [] : [
        { label: t("SW25.Tracker.EvasionShort"), value: sys.evasion, tooltip: t("SW25.Evasion") },
        { label: t("SW25.Tracker.DefenseShort"), value: sys.defense, tooltip: t("SW25.Defense") },
        { label: t("SW25.Tracker.FortitudeShort"), value: sys.fortitude, tooltip: t("SW25.Check.fortitude") },
        { label: t("SW25.Tracker.WillpowerShort"), value: sys.willpower, tooltip: t("SW25.Check.willpower") }
      ]
    };
  }

  /**
   * Attacks of the actor: equipped weapons of a character; attacking sections and active unique skills of a creature.
   * @param {Actor} actor
   * @returns {{weapons: object[], sections: object[], abilities: object[]}|null}
   */
  #attacks(actor) {
    const fixed = n => `${n} (${n + CONFIG.SW25.FIXED_OFFSET})`;
    if ( actor.type === "character" ) {
      const weapons = actor.items.filter(i => (i.type === "weapon") && i.system.equipped && i.system.attack).map(w => {
        const atk = w.system.attack;
        return {
          id: w.id, name: w.name, img: w.img, gun: w.system.isGun,
          accuracy: signed(atk.accuracy),
          power: w.system.isGun ? t("SW25.Gun.Bullet") : `${t("SW25.Tracker.PowerShort")}${atk.power ?? "—"}`,
          critical: atk.critical, extra: signed(atk.extraDamage)
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

  /** @override */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    // The close button of the window collapses the tracker instead; double-clicking the title bar toggles it
    const button = frame.querySelector(".window-header [data-action=close]");
    if ( button ) button.dataset.action = "collapse";
    frame.querySelector(".window-header")?.addEventListener("dblclick", event => {
      if ( event.target.closest("button") ) return;
      ResourceTracker.#onCollapse.call(this);
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
      const label = t(collapsed ? "SW25.Tracker.Expand" : "SW25.Tracker.Collapse");
      button.className = `header-control icon fa-solid ${collapsed ? "fa-chevron-down" : "fa-chevron-up"}`;
      button.dataset.tooltip = label;
      button.setAttribute("aria-label", label);
    }
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    keyboardActions(this.element);
    // Restore / persist position
    const saved = game.settings.get("swordworld25", "trackerPosition");
    if ( !this._positioned && saved?.left ) {
      this.setPosition({ left: saved.left, top: saved.top });
      this._positioned = true;
    }
  }

  /** Debounced persistence of the window position. */
  #savePosition = foundry.utils.debounce((left, top) => {
    game.settings.set("swordworld25", "trackerPosition", { left, top });
  }, 500);

  /** @override */
  setPosition(position) {
    const pos = super.setPosition(position);
    if ( this.rendered && pos ) this.#savePosition(pos.left, pos.top);
    return pos;
  }

  /* -------------------------------------------- */
  /*  Changing values                             */
  /* -------------------------------------------- */

  /**
   * Change a value of the tracked actor: "hp", "mp" or "res:<id>" (custom tracker). No chat message is posted.
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
    const creature = actor.type !== "character";
    const section = creature ? (this.section ?? Math.max(0, (actor.system.sections ?? []).findIndex(s => s.main))) : null;
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

  static #onSpellbook() {
    if ( this.actor ) game.sw25.SpellbookApp.openFor(this.actor);
  }

  /** Collapse the tracker to its title bar, or expand it again. */
  static async #onCollapse() {
    this.#closeAmount();
    await game.settings.set("swordworld25", "trackerCollapsed", !this.collapsed);
    await this.render({ window: { title: this.title } });
    this.setPosition({ height: "auto" });
  }

  static async #onRemoveStatus(event, target) {
    const effect = this.actor?.effects.get(target.dataset.id);
    if ( effect && this.actor.isOwner ) await effect.delete();
  }

  static #onSection(event, target) {
    this.section = Number(target.dataset.index);
    this.render();
  }

  static #onAttack(event, target) {
    const weapon = this.actor?.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if ( weapon ) return rollWeaponAttack(this.actor, weapon, { event });
  }

  static #onWeaponDamage(event, target) {
    const weapon = this.actor?.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if ( weapon ) return rollWeaponDamage(this.actor, weapon, { event });
  }

  static #onSectionAttack(event, target) {
    if ( this.actor ) return rollSectionAttack(this.actor, Number(target.closest("[data-index]")?.dataset.index) || 0, { event });
  }

  static #onAbility(event, target) {
    const ability = this.actor?.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if ( ability ) return useAbility(this.actor, ability, { event });
  }
}
