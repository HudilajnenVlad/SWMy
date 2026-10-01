import { SYSTEM_ID } from "./utils.mjs";

/**
 * Version of the automation data of the compendiums. Raise it when the automation of existing entries changes, so
 * that the copies owned in the world are refreshed once (see {@link refreshAutomation}).
 */
export const AUTOMATION_VERSION = 3;

/**
 * Automation fields copied from the compendium entry, by item type. Everything else (quantity, equipped state,
 * chosen weapon category, names and descriptions edited by the players...) is left untouched.
 */
const AUTOMATION_FIELDS = {
  spell: ["modifiers", "effect", "cost", "resistance", "duration", "types"],
  feat: ["modifiers", "risk"],
  technique: ["modifiers", "duration"],
  spellsong: ["modifiers"],
  finale: ["modifiers", "effect"],
  stunt: ["modifiers"],
  evocation: ["modifiers", "ranks", "modifierKey", "modifierTarget", "modifierCondition", "rankEffect", "turnOfUser", "types"],
  weapon: ["modifiers"],
  armor: ["modifiers"],
  gear: ["modifiers", "use", "types", "duration", "magic"],
  race: ["modifiers", "traits", "extraCheckOptions"],
  effect: ["modifiers", "statuses", "duration"]
};

/**
 * World migrations between system versions.
 */
export async function migrateWorld() {
  const current = game.system.version;
  const stored = game.settings.get(SYSTEM_ID, "systemMigrationVersion");
  if ( !stored || foundry.utils.isNewerVersion(current, stored) ) {
    await game.settings.set(SYSTEM_ID, "systemMigrationVersion", current);
  }
  // Refresh the automation of the items copied from the compendiums once per automation version
  const automation = game.settings.get(SYSTEM_ID, "automationVersion") ?? 0;
  if ( automation < AUTOMATION_VERSION ) {
    const count = await refreshAutomation();
    await game.settings.set(SYSTEM_ID, "automationVersion", AUTOMATION_VERSION);
    if ( count ) ui.notifications.info(game.i18n.format("SW25.Migration.AutomationRefreshed", { count }));
  }
}

/**
 * Copy the automation of the system compendiums onto the world items made from them (items of the sidebar and of
 * every world actor).
 * @param {object} [options]
 * @param {boolean} [options.dryRun=false]   Only count the items that would change
 * @returns {Promise<number>}                Number of items updated
 */
export async function refreshAutomation({ dryRun = false } = {}) {
  if ( !game.user.isGM ) return 0;
  const sources = new Map();
  const sourceOf = async uuid => {
    const parsed = foundry.utils.parseUuid(uuid);
    const pack = parsed?.collection;
    if ( !(pack instanceof foundry.documents.collections.CompendiumCollection) || (pack.metadata.packageName !== SYSTEM_ID) ) return null;
    if ( !sources.has(pack.collection) ) {
      const docs = await pack.getDocuments();
      sources.set(pack.collection, new Map(docs.map(d => [d.id, d])));
    }
    return sources.get(pack.collection).get(parsed.id) ?? null;
  };

  // Items copied without a compendium source are found by type and name (only rulebook entries: with a source book)
  let byName = null;
  const nameKey = doc => `${doc.type}|${doc.type === "spell" ? `${doc.system.magic}|` : ""}${doc.name}`;
  const sourceByName = async item => {
    if ( !byName ) {
      byName = new Map();
      for ( const pack of game.packs.filter(p => (p.metadata.packageName === SYSTEM_ID) && (p.documentName === "Item")) ) {
        const docs = await pack.getDocuments();
        sources.set(pack.collection, new Map(docs.map(d => [d.id, d])));
        for ( const doc of docs ) if ( !byName.has(nameKey(doc)) ) byName.set(nameKey(doc), doc);
      }
    }
    return byName.get(nameKey(item)) ?? null;
  };

  /** Update data for one item, or null when nothing changed. */
  const updateFor = async item => {
    const fields = AUTOMATION_FIELDS[item.type];
    if ( !fields ) return null;
    const uuid = item._stats?.compendiumSource;
    let source = null;
    if ( uuid?.startsWith(`Compendium.${SYSTEM_ID}.`) ) source = await sourceOf(uuid);
    else if ( !uuid && item.system.source?.book ) source = await sourceByName(item);
    if ( !source || (source.type !== item.type) ) return null;
    const update = {};
    for ( const field of fields ) {
      const value = foundry.utils.deepClone(source._source.system[field]);
      if ( value === undefined ) continue;
      if ( !foundry.utils.objectsEqual({ v: item._source.system[field] }, { v: value }) ) update[`system.${field}`] = value;
    }
    return foundry.utils.isEmpty(update) ? null : { _id: item.id, ...update };
  };

  let count = 0;
  const worldUpdates = (await Promise.all(game.items.map(updateFor))).filter(Boolean);
  count += worldUpdates.length;
  if ( worldUpdates.length && !dryRun ) await Item.implementation.updateDocuments(worldUpdates);
  for ( const actor of game.actors ) {
    const updates = (await Promise.all(actor.items.map(updateFor))).filter(Boolean);
    count += updates.length;
    if ( updates.length && !dryRun ) await actor.updateEmbeddedDocuments("Item", updates);
  }
  return count;
}
