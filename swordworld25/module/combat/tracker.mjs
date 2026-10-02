import { factionOf, popcornEnabled } from "./combat.mjs";
import { t } from "../helpers/utils.mjs";

const { CombatTracker } = foundry.applications.sidebar.tabs;

/**
 * Combat tracker with popcorn turns (when the setting is on): the combatants are listed by side, the side that won
 * initiative first. Any character of the acting side takes the turn with the play button; a check box marks who has
 * acted; the footer ends the current turn. Without the setting it is the core tracker.
 */
export default class SW25CombatTracker extends CombatTracker {

  /** @override */
  static DEFAULT_OPTIONS = {
    actions: {
      takeTurn: SW25CombatTracker.#onTakeTurn,
      toggleActed: SW25CombatTracker.#onToggleActed
    }
  };

  /** Templates of the popcorn tracker. */
  static POPCORN_PARTS = {
    tracker: "systems/swordworld25/templates/sidebar/combat-tracker.hbs",
    footer: "systems/swordworld25/templates/sidebar/combat-footer.hbs"
  };

  /** Are combats run with popcorn turns? (A world setting: known before the viewed combat is.) */
  get popcorn() {
    return popcornEnabled();
  }

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    if ( this.popcorn ) {
      for ( const [id, template] of Object.entries(SW25CombatTracker.POPCORN_PARTS) ) {
        if ( parts[id] ) parts[id] = { ...parts[id], template };
      }
    }
    return parts;
  }

  /** @override */
  async _prepareTrackerContext(context, options) {
    await super._prepareTrackerContext(context, options);
    const combat = this.viewed;
    if ( !combat || !this.popcorn ) return;
    for ( const turn of context.turns ?? [] ) {
      const combatant = combat.combatants.get(turn.id);
      turn.faction = factionOf(combatant);
      turn.acted = combat.hasActed(combatant);
      turn.canTake = combat.canTakeTurn(combatant);
      turn.canToggle = combat.started && (game.user.isGM || combatant.isOwner);
      if ( turn.acted ) turn.css = [turn.css, "acted"].filterJoin(" ");
    }
    const first = combat.firstFaction;
    const acting = combat.actingFaction;
    context.sides = [first, (first === "pc") ? "enemy" : "pc"].map((faction, i) => {
      const turns = context.turns.filter(tr => tr.faction === faction);
      return {
        faction, order: i + 1, turns,
        label: t(`SW25.Combat.Side.${faction}`),
        acting: faction === acting,
        progress: combat.started ? `${turns.filter(tr => tr.acted || tr.isDefeated).length}/${turns.length}` : ""
      };
    }).filter(side => side.turns.length);
  }

  /** @override */
  async _prepareCombatContext(context, options) {
    await super._prepareCombatContext(context, options);
    const combat = this.viewed;
    if ( !combat || !this.popcorn ) return;
    const current = combat.combatant;
    const acting = combat.actingFaction;
    Object.assign(context, {
      popcorn: true,
      currentName: current?.name ?? "",
      canEndTurn: combat.canEndTurn(),
      waiting: combat.started && !current,
      actingLabel: acting ? t(`SW25.Combat.Side.${acting}`) : "",
      allActed: combat.started && !acting
    });
  }

  /* -------------------------------------------- */

  /**
   * Take the turn of a combatant.
   * @this {SW25CombatTracker}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onTakeTurn(event, target) {
    event.stopPropagation();
    const id = target.closest("[data-combatant-id]")?.dataset.combatantId;
    if ( id ) return this.viewed?.takeTurn(id);
  }

  /**
   * Toggle the "has acted" mark of a combatant.
   * @this {SW25CombatTracker}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onToggleActed(event, target) {
    event.stopPropagation();
    const id = target.closest("[data-combatant-id]")?.dataset.combatantId;
    if ( id ) return this.viewed?.toggleActed(id);
  }
}
