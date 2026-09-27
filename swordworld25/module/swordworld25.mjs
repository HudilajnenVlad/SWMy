/**
 * Sword World 2.5 system for Foundry Virtual Tabletop v13.
 */
import { SW25, SYSTEM_ID } from "./config.mjs";
import { actorModels, itemModels } from "./data/_module.mjs";
import SW25Actor from "./documents/actor.mjs";
import SW25Actors from "./documents/actors.mjs";
import SW25Item from "./documents/item.mjs";
import SW25ActiveEffect from "./documents/active-effect.mjs";
import SW25TokenDocument from "./documents/token.mjs";
import { SW25Combat, SW25Combatant } from "./combat/combat.mjs";
import { CheckRoll } from "./dice/check.mjs";
import { lookupPower, POWER_TABLE } from "./dice/power-table.mjs";
import { rollPower } from "./dice/power.mjs";
import { buildStatusEffects } from "./helpers/conditions.mjs";
import { registerSettings } from "./helpers/settings.mjs";
import { registerHandlebarsHelpers, preloadTemplates } from "./helpers/handlebars.mjs";
import { initSocket } from "./helpers/socket.mjs";
import { registerDefaultSocketHandlers } from "./helpers/socket-handlers.mjs";
import { onRenderChatMessage } from "./chat/listeners.mjs";
import CharacterSheet from "./applications/sheets/character-sheet.mjs";
import MonsterSheet from "./applications/sheets/monster-sheet.mjs";
import PartySheet from "./applications/sheets/party-sheet.mjs";
import SW25ActorDirectory from "./applications/sidebar/actor-directory.mjs";
import SW25ItemSheet from "./applications/sheets/item-sheet.mjs";
import SpellbookApp from "./applications/apps/spellbook.mjs";
import ResourceTracker from "./applications/apps/resource-tracker.mjs";
import MonsterTemplateApp, { buildMonsterData } from "./applications/apps/monster-template.mjs";
import CompendiumBrowser from "./applications/apps/compendium-browser.mjs";
import { registerTokenHud } from "./canvas/token-hud.mjs";
import * as workflows from "./workflows/_module.mjs";
import { migrateWorld, refreshAutomation } from "./helpers/migration.mjs";
import { clampResources } from "./helpers/effects.mjs";
import { isResponsibleGM } from "./helpers/utils.mjs";

/* -------------------------------------------- */
/*  Init                                        */
/* -------------------------------------------- */

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initializing Sword World 2.5`);

  CONFIG.SW25 = SW25;

  // Documents and data models
  CONFIG.Actor.documentClass = SW25Actor;
  CONFIG.Actor.collection = SW25Actors;
  CONFIG.ui.actors = SW25ActorDirectory;
  CONFIG.Item.documentClass = SW25Item;
  CONFIG.ActiveEffect.documentClass = SW25ActiveEffect;
  CONFIG.ActiveEffect.legacyTransferral = false;
  CONFIG.Token.documentClass = SW25TokenDocument;
  CONFIG.Combat.documentClass = SW25Combat;
  CONFIG.Combatant.documentClass = SW25Combatant;
  Object.assign(CONFIG.Actor.dataModels, actorModels);
  Object.assign(CONFIG.Item.dataModels, itemModels);

  // Dice
  CONFIG.Dice.rolls.push(CheckRoll);
  CONFIG.Combat.initiative = { formula: "2d6", decimals: 0 };
  CONFIG.time.roundTime = 10;

  // Conditions
  CONFIG.statusEffects = buildStatusEffects();
  CONFIG.specialStatusEffects.DEFEATED = "dead";
  CONFIG.specialStatusEffects.INVISIBLE = "invisible";
  CONFIG.specialStatusEffects.BLIND = "blind";
  CONFIG.specialStatusEffects.FLY = "fly";

  // Sheets
  const DSC = foundry.applications.apps.DocumentSheetConfig;
  DSC.registerSheet(Actor, SYSTEM_ID, CharacterSheet, {
    types: ["character"], makeDefault: true, label: "SW25.Sheet.Character"
  });
  DSC.registerSheet(Actor, SYSTEM_ID, MonsterSheet, {
    types: ["monster", "mount"], makeDefault: true, label: "SW25.Sheet.Monster"
  });
  DSC.registerSheet(Actor, SYSTEM_ID, PartySheet, {
    types: ["party"], makeDefault: true, label: "SW25.Sheet.Party"
  });
  DSC.registerSheet(Item, SYSTEM_ID, SW25ItemSheet, { makeDefault: true, label: "SW25.Sheet.Item" });

  // Settings, templates, helpers
  registerSettings();
  registerHandlebarsHelpers();
  preloadTemplates();

  // Public API
  game.sw25 = {
    config: SW25,
    rollPower,
    lookupPower,
    POWER_TABLE,
    SpellbookApp,
    ResourceTracker,
    MonsterTemplateApp,
    buildMonsterData,
    PartySheet,
    CompendiumBrowser,
    BestiaryBrowser: { open: () => CompendiumBrowser.open("bestiary") },
    createParty: options => SW25ActorDirectory.createParty(options),
    refreshAutomation,
    workflows
  };
});

/* -------------------------------------------- */
/*  Setup / Ready                               */
/* -------------------------------------------- */

Hooks.once("setup", () => {
  // Localize config labels once translations are loaded
  for ( const effect of CONFIG.statusEffects ) effect.name = game.i18n.localize(effect.name);
});

Hooks.once("ready", async () => {
  // Mount levels depend on their jockey's data, which may be prepared after the mount at load time
  for ( const actor of game.actors ) if ( (actor.type === "mount") && actor.system.jockey ) actor.reset();
  initSocket();
  registerDefaultSocketHandlers();
  if ( game.user.isGM ) await migrateWorld();
  if ( game.user.isGM ) await ensureParty();
  if ( game.settings.get(SYSTEM_ID, "showResourceTracker") ) ResourceTracker.initialize();
});

/* -------------------------------------------- */
/*  Other hooks                                 */
/* -------------------------------------------- */

Hooks.on("renderChatMessageHTML", onRenderChatMessage);

/**
 * A jockey's new level or Rider class changes the stats of the mounts it rides.
 * @param {Actor} actor
 */
function refreshMountsOf(actor) {
  if ( actor?.type !== "character" ) return;
  for ( const mount of game.actors ) {
    if ( (mount.type !== "mount") || (mount.system.jockey !== actor.uuid) ) continue;
    mount.reset();
    if ( mount.sheet?.rendered ) mount.sheet.render();
  }
}
Hooks.on("updateActor", refreshMountsOf);
for ( const hook of ["createItem", "updateItem", "deleteItem"] ) {
  Hooks.on(hook, item => { if ( item.type === "class" ) refreshMountsOf(item.parent); });
}
registerTokenHud();

/**
 * Create the party of the world once (like PF2e): a folder of the player characters on top of the Actors directory.
 * A deleted party is not recreated; the directory then offers a button to create one.
 */
async function ensureParty() {
  if ( game.settings.get(SYSTEM_ID, "partyCreated") ) return;
  if ( !game.actors.party ) await SW25ActorDirectory.createParty({ render: false });
  await game.settings.set(SYSTEM_ID, "partyCreated", true);
}

/** Re-render the sheets of the parties an actor belongs to (debounced per party). */
const partyRefresh = new Map();
function refreshPartiesOf(actor) {
  if ( !actor || (actor.type === "party") || !game.actors?.partiesOf ) return;
  for ( const party of game.actors.partiesOf(actor) ) {
    if ( !party.sheet?.rendered ) continue;
    if ( !partyRefresh.has(party.id) ) partyRefresh.set(party.id, foundry.utils.debounce(() => party.sheet.rendered && party.sheet.render(), 150));
    partyRefresh.get(party.id)();
  }
}
Hooks.on("updateActor", refreshPartiesOf);
for ( const hook of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"] ) {
  Hooks.on(hook, doc => refreshPartiesOf(doc.parent instanceof Actor ? doc.parent : doc.parent?.parent));
}
for ( const hook of ["createToken", "deleteToken"] ) Hooks.on(hook, token => refreshPartiesOf(token.actor));
Hooks.on("canvasReady", () => {
  for ( const party of game.actors.filter(a => a.type === "party") ) if ( party.sheet?.rendered ) party.sheet.render();
});
// A deleted actor leaves its party
Hooks.on("deleteActor", actor => {
  if ( !game.user.isGM || !game.actors?.partiesOf ) return;
  for ( const party of game.actors.partiesOf(actor) ) party.system.removeMember(actor.id);
});

// Items and Compendium directories: a button opening the compendium browser
for ( const hook of ["renderItemDirectory", "renderCompendiumDirectory"] ) {
  Hooks.on(hook, (app, html) => {
    const footer = html.querySelector(".directory-footer") ?? html.querySelector("footer");
    if ( !footer || footer.querySelector(".sw25-browser-button") ) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sw25-browser-button";
    button.innerHTML = `<i class="fa-solid fa-book-open-reader"></i> ${game.i18n.localize("SW25.Browser.Title")}`;
    button.addEventListener("click", () => CompendiumBrowser.open());
    footer.append(button);
  });
}

// Token Controls: show or hide the resource tracker
Hooks.on("getSceneControlButtons", controls => {
  if ( controls.tokens?.tools ) controls.tokens.tools.sw25Tracker = ResourceTracker.controlTool;
});

// Drop an effect preset (or a condition) onto a token
Hooks.on("dropCanvasData", (canvas, data) => {
  if ( data.type !== "Item" ) return;
  const entry = fromUuidSync(data.uuid, { strict: false });
  if ( entry?.type !== "effect" ) return;
  const token = canvas.tokens.placeables.find(t => t.bounds.contains(data.x, data.y));
  if ( !token?.actor ) return;
  fromUuid(data.uuid).then(item => item?.applyTo([token.actor]));
  return false;
});

// An effect raising maximum HP/MP ends: current values above the new maximum are lowered to it
Hooks.on("deleteActiveEffect", effect => {
  const actor = effect.parent;
  if ( !(actor instanceof Actor) || !isResponsibleGM() ) return;
  if ( !effect.changes.some(c => /bonuses\.(hpMax|mpMax)$/.test(c.key)) ) return;
  clampResources(actor);
});
