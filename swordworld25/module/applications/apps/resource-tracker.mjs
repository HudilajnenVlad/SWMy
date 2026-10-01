import { SYSTEM_ID, t } from "../../helpers/utils.mjs";
import ActorPanel from "./actor-panel.mjs";

/**
 * Floating panel showing the selected token (or the user's character): HP/MP and custom trackers with ±1 and ±N
 * buttons, attacks, Bard rhythm, Alchemist cards and active conditions. Changes made here are manual corrections:
 * they post nothing to the chat. The heart of the Token Controls turns it on and off (so does the X of the window);
 * the arrow of the title bar collapses it to a translucent bar showing the name, HP and MP. While the combat panel is
 * open, it takes the place of the tracker.
 */
export default class ResourceTracker extends ActorPanel {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "sw25-resource-tracker",
    classes: ["sw25-tracker"],
    position: { width: 320 },
    window: { title: "SW25.Tracker.Title", icon: "fa-solid fa-heart-pulse" }
  };

  /** @override */
  static PARTS = {
    body: { template: "systems/swordworld25/templates/apps/resource-tracker.hbs" }
  };

  /** @override */
  static SETTINGS = { show: "showResourceTracker", collapsed: "trackerCollapsed", position: "trackerPosition" };

  /** @override */
  static TOOL = { name: "sw25Tracker", title: "SW25.Tracker.Toggle", icon: "fa-solid fa-heart-pulse", order: 100 };

  /** @override */
  static CLOSE_HINT = "SW25.Tracker.CloseHint";

  /** @override */
  static instance = null;

  /**
   * The combat panel shows everything the tracker does: the tracker steps aside while it is open.
   * @override
   */
  static get visible() {
    return this.enabled && !game.settings.get(SYSTEM_ID, "showCombatPanel");
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = context.actor;
    if ( !actor ) return context;
    const sys = actor.system;
    context.stats = context.creature ? [] : [
      { label: t("SW25.Tracker.EvasionShort"), value: sys.evasion, tooltip: t("SW25.Evasion") },
      { label: t("SW25.Tracker.DefenseShort"), value: sys.defense, tooltip: t("SW25.Defense") },
      { label: t("SW25.Tracker.FortitudeShort"), value: sys.fortitude, tooltip: t("SW25.Check.fortitude") },
      { label: t("SW25.Tracker.WillpowerShort"), value: sys.willpower, tooltip: t("SW25.Check.willpower") }
    ];
    return context;
  }
}
