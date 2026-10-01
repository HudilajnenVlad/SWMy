import { enrich, SYSTEM_ID, t } from "../../helpers/utils.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Effects panel (after the PF2e one): the effects and conditions of the selected token (else the user's character)
 * as a column of icons in the top right corner of the canvas, next to the sidebar. Hovering an icon shows its card
 * (duration, source, modifiers, description). Click turns an effect off or on again, right-click removes it,
 * Shift-click opens it. Effects carried by items (equipment) are not listed: they come and go with the items.
 */
export default class EffectsPanel extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "sw25-effects-panel",
    tag: "aside",
    classes: ["swp", "sw25-effects-panel"],
    window: { frame: false, positioned: false },
    actions: {
      toggleEffect: EffectsPanel.#onToggle
    }
  };

  /** @override */
  static PARTS = {
    body: { template: "systems/swordworld25/templates/apps/effects-panel.hbs" }
  };

  /** Singleton instance. */
  static instance = null;

  /**
   * Create the panel and the hooks that keep it up to date (once).
   * @returns {EffectsPanel}
   */
  static initialize() {
    if ( this.instance ) return this.instance;
    const panel = this.instance = new this();
    const refresh = foundry.utils.debounce(() => panel.refresh(), 100);
    Hooks.on("controlToken", refresh);
    Hooks.on("canvasReady", refresh);
    for ( const hook of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect"] ) {
      Hooks.on(hook, effect => { if ( effect.parent === panel.actor ) refresh(); });
    }
    // Remaining durations
    for ( const hook of ["updateCombat", "deleteCombat", "updateWorldTime"] ) Hooks.on(hook, refresh);
    return panel;
  }

  /** Is the panel turned on (client setting)? */
  static get enabled() {
    return game.settings.get(SYSTEM_ID, "showEffectsPanel");
  }

  /** Show or hide the panel as its setting says. */
  static sync() {
    if ( this.enabled ) this.initialize().refresh();
    else if ( this.instance?.rendered ) this.instance.close();
  }

  /** The actor shown: the first controlled token's, else the user's character. */
  get actor() {
    const token = canvas.tokens?.controlled?.[0];
    return token?.actor ?? game.user.character ?? null;
  }

  /** Re-render, or close when the panel is off. */
  refresh() {
    if ( !this.constructor.enabled ) {
      if ( this.rendered ) this.close();
      return;
    }
    this.render({ force: !this.rendered });
  }

  /**
   * Effects listed for an actor: its own ones (conditions, spells and feats applied to it, custom effects), the
   * turned off ones included. Active ones first, temporary before lasting ones.
   * @param {Actor} actor
   * @returns {ActiveEffect[]}
   */
  static effectsOf(actor) {
    if ( !actor ) return [];
    return actor.effects.contents
      .sort((a, b) => (Number(a.disabled) - Number(b.disabled)) || (Number(b.isTemporary) - Number(a.isTemporary)));
  }

  /** @override */
  async _prepareContext(options) {
    const actor = this.actor;
    if ( !actor?.testUserPermission(game.user, "OBSERVER") ) return { effects: [] };
    const owner = actor.isOwner;
    const effects = await Promise.all(EffectsPanel.effectsOf(actor).map(e => this.#effectContext(e, owner)));
    return { effects, owner };
  }

  /**
   * One icon of the panel and its hover card.
   * @param {ActiveEffect} effect
   * @param {boolean} owner
   * @returns {Promise<object>}
   */
  async #effectContext(effect, owner) {
    const d = effect.duration ?? {};
    const remaining = Number.isFinite(d.remaining) ? d.remaining : null;
    const expired = effect.isTemporary && (remaining !== null) && (remaining <= 0);
    const source = this.#sourceName(effect);
    const description = effect.description ? await enrich(effect.description, { relativeTo: effect }) : "";
    const esc = foundry.utils.escapeHTML;
    const lines = [
      `<header><img src="${esc(effect.img)}" alt=""><b>${esc(effect.name)}</b></header>`,
      `<p class="meta">${[
        effect.disabled ? t("SW25.EffectsPanel.Off") : "",
        effect.isTemporary ? (expired ? t("SW25.EffectsPanel.Expired") : esc(d.label ?? "")) : t("SW25.EffectsPanel.Unlimited"),
        source ? esc(source) : ""
      ].filter(Boolean).join(" · ")}</p>`
    ];
    const summary = effect.modifierSummary;
    if ( summary ) lines.push(`<p class="mods">${esc(summary)}</p>`);
    if ( description ) lines.push(`<div class="desc">${description}</div>`);
    if ( owner ) lines.push(`<p class="hint">${t("SW25.EffectsPanel.Hint")}</p>`);
    return {
      uuid: effect.uuid,
      name: effect.name,
      img: effect.img,
      disabled: effect.disabled,
      expired,
      badge: this.#badge(effect, remaining),
      card: lines.join("")
    };
  }

  /**
   * Short remaining duration shown on an icon: rounds, or minutes / hours / days.
   * @param {ActiveEffect} effect
   * @param {number|null} remaining
   * @returns {string}
   */
  #badge(effect, remaining) {
    if ( !effect.isTemporary || (remaining === null) ) return "";
    const d = effect.duration;
    if ( (d.type === "turns") || (d.type === "rounds") ) return t("SW25.EffectsPanel.Rounds", { n: Math.max(0, Math.ceil(remaining)) });
    const s = Math.max(0, remaining);
    if ( s < 60 ) return t("SW25.EffectsPanel.Rounds", { n: Math.ceil(s / CONFIG.time.roundTime) });
    if ( s < 3600 ) return t("SW25.EffectsPanel.Minutes", { n: Math.ceil(s / 60) });
    if ( s < 86400 ) return t("SW25.EffectsPanel.Hours", { n: Math.ceil(s / 3600) });
    return t("SW25.EffectsPanel.Days", { n: Math.ceil(s / 86400) });
  }

  /**
   * Where an effect comes from: its item, else the document it originates from (a caster, a spell...).
   * @param {ActiveEffect} effect
   * @returns {string}
   */
  #sourceName(effect) {
    if ( effect.parent instanceof Item ) return effect.parent.name;
    if ( !effect.origin ) return "";
    const origin = fromUuidSync(effect.origin, { strict: false });
    if ( !origin || (origin === effect.parent) ) return "";
    return origin.name ?? "";
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.classList.toggle("empty", !context.effects.length);
    // The icon under the cursor was replaced: its card must not stay on screen
    const hovered = game.tooltip.element;
    if ( hovered?.matches?.(".swp-fx") && !hovered.isConnected ) game.tooltip.deactivate();
    // Right-click removes an effect
    for ( const icon of this.element.querySelectorAll("[data-effect-uuid]") ) {
      icon.addEventListener("contextmenu", event => {
        event.preventDefault();
        this.#remove(icon.dataset.effectUuid);
      });
    }
  }

  /**
   * The panel sits on top of the right column of the interface, by the sidebar.
   * @override
   */
  _insertElement(element) {
    const existing = document.getElementById(element.id);
    if ( existing ) return existing.replaceWith(element);
    const column = document.getElementById("ui-right-column-1");
    if ( column ) column.prepend(element);
    else document.body.append(element);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Click: turn the effect off or on. Shift-click: open it.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onToggle(event, target) {
    const effect = fromUuidSync(target.closest("[data-effect-uuid]")?.dataset.effectUuid);
    if ( !effect?.isOwner ) return;
    if ( event.shiftKey ) return effect.sheet.render(true);
    await effect.update({ disabled: !effect.disabled });
  }

  /**
   * Remove an effect.
   * @param {string} uuid
   */
  async #remove(uuid) {
    const effect = fromUuidSync(uuid);
    if ( !effect?.isOwner ) return;
    game.tooltip.deactivate();
    await effect.delete();
  }
}
