/**
 * Sword World 2.5 ActiveEffect: effects transferred from inactive equipment are suppressed.
 */
export default class SW25ActiveEffect extends ActiveEffect {

  /** @override */
  get isSuppressed() {
    if ( super.isSuppressed ) return true;
    const item = this.parent;
    if ( (item instanceof Item) && this.transfer ) {
      if ( item.system?.isActive === false ) return true;
    }
    return false;
  }

  /**
   * Readable list of the modifiers of this effect (for sheets).
   * @type {string}
   */
  get modifierSummary() {
    const parts = [];
    for ( const change of this.changes ) {
      const key = change.key.replace(/^system\.bonuses\./, "");
      const label = CONFIG.SW25.modifierKeys[key] ? game.i18n.localize(CONFIG.SW25.modifierKeys[key])
        : (key.startsWith("check.") ? game.i18n.localize(`SW25.Check.${key.slice(6)}`) : key);
      const v = Number(change.value);
      parts.push(`${label} ${v > 0 ? "+" : ""}${change.value}`);
    }
    for ( const mod of this.getFlag("swordworld25", "conditional") ?? [] ) {
      const label = game.i18n.localize(CONFIG.SW25.modifierKeys[mod.key] ?? mod.key);
      parts.push(`${label} ${mod.value > 0 ? "+" : ""}${mod.value} (${mod.condition})`);
    }
    return parts.join(", ");
  }
}
