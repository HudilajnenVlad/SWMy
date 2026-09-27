/**
 * World Actors collection. Parties and their members are listed in the party folders at the top of the Actors
 * directory, so they are left out of the regular folder tree.
 */
export default class SW25Actors extends foundry.documents.collections.Actors {

  /**
   * The party of the world (the first one when there are several).
   * @type {Actor|null}
   */
  get party() {
    return this.find(a => a.type === "party") ?? null;
  }

  /**
   * Parties an actor belongs to.
   * @param {Actor|string} actor
   * @returns {Actor[]}
   */
  partiesOf(actor) {
    const id = typeof actor === "string" ? actor : actor?.id;
    return this.filter(a => (a.type === "party") && a.system.members.includes(id));
  }

  /** @override */
  _getVisibleTreeContents(entry) {
    const members = new Set(this.filter(a => a.type === "party").flatMap(p => p.system.members ?? []));
    return super._getVisibleTreeContents(entry).filter(a => (a.type !== "party") && !members.has(a.id));
  }
}
