import { SYSTEM_ID } from "./utils.mjs";

/**
 * Register system settings.
 */
export function registerSettings() {
  const register = (key, data) => game.settings.register(SYSTEM_ID, key, {
    name: `SW25.Setting.${key}.Name`,
    hint: `SW25.Setting.${key}.Hint`,
    ...data
  });

  register("monsterFixedValues", { scope: "world", config: true, type: Boolean, default: true });
  register("skipRollDialog", { scope: "client", config: true, type: Boolean, default: false });
  register("autoFailureExp", { scope: "world", config: true, type: Boolean, default: true });
  register("autoStatus", { scope: "world", config: true, type: Boolean, default: true });
  register("autoIdentify", { scope: "world", config: true, type: Boolean, default: true });
  register("autoFeats", { scope: "world", config: true, type: Boolean, default: true });
  register("sharedDamageRoll", { scope: "world", config: true, type: Boolean, default: false });
  register("hideMonsterDamage", { scope: "world", config: true, type: Boolean, default: false });
  register("hideUnidentified", { scope: "world", config: true, type: Boolean, default: true });
  register("popcornInitiative", {
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => ui.combat?.render()
  });
  register("damageLog", {
    scope: "world", config: true, type: String, default: "all",
    choices: { all: "SW25.Setting.damageLog.All", gm: "SW25.Setting.damageLog.GM", none: "SW25.Setting.damageLog.None" }
  });
  register("showResourceTracker", {
    scope: "client", config: true, type: Boolean, default: true,
    onChange: value => game.sw25?.ResourceTracker?.toggle(value)
  });
  register("showCombatPanel", {
    scope: "client", config: true, type: Boolean, default: false,
    onChange: value => {
      game.sw25?.CombatPanel?.toggle(value);
      // The combat panel takes the place of the resource tracker while it is open
      game.sw25?.ResourceTracker?.sync();
    }
  });
  register("showEffectsPanel", {
    scope: "client", config: true, type: Boolean, default: true,
    onChange: () => game.sw25?.EffectsPanel?.sync()
  });
  game.settings.register(SYSTEM_ID, "partyCreated", {
    scope: "world", config: false, type: Boolean, default: false
  });
  game.settings.register(SYSTEM_ID, "systemMigrationVersion", {
    scope: "world", config: false, type: String, default: ""
  });
  game.settings.register(SYSTEM_ID, "automationVersion", {
    scope: "world", config: false, type: Number, default: 0
  });
  game.settings.register(SYSTEM_ID, "trackerCollapsed", {
    scope: "client", config: false, type: Boolean, default: false
  });
  game.settings.register(SYSTEM_ID, "trackerPosition", {
    scope: "client", config: false, type: Object, default: {}
  });
  game.settings.register(SYSTEM_ID, "combatPanelCollapsed", {
    scope: "client", config: false, type: Boolean, default: false
  });
  game.settings.register(SYSTEM_ID, "combatPanelPosition", {
    scope: "client", config: false, type: Object, default: {}
  });
  // Folded blocks of the combat panel: {attacks, magic, abilities, items}
  game.settings.register(SYSTEM_ID, "combatPanelFolds", {
    scope: "client", config: false, type: Object, default: {}
  });
}
