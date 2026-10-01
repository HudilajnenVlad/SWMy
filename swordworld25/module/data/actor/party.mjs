import { intField } from "../fields.mjs";
import { executeAsGM } from "../../helpers/socket.mjs";

const { ArrayField, HTMLField, StringField } = foundry.data.fields;

/**
 * The adventuring party: its members (world actors), a shared purse, the stash (items owned by the party actor)
 * and notes. Shown as a folder at the top of the Actors directory that opens the party sheet.
 */
export default class PartyModel extends foundry.abstract.TypeDataModel {

  /** @override */
  static defineSchema() {
    return {
      members: new ArrayField(new StringField({ blank: false })),
      money: intField(0, { min: 0 }),
      notes: new HTMLField({ required: true, blank: true, initial: "" })
    };
  }

  /* -------------------------------------------- */

  /**
   * Member actors that still exist, in the stored order.
   * @type {Actor[]}
   */
  get memberActors() {
    return this.members.map(id => game.actors?.get(id)).filter(Boolean);
  }

  /**
   * Is an actor a member of this party?
   * @param {Actor|string} actor
   * @returns {boolean}
   */
  hasMember(actor) {
    return this.members.includes(typeof actor === "string" ? actor : actor?.id);
  }

  /**
   * Add world actors to the party (other parties keep them only once: an actor belongs to one party).
   * @param {...Actor} actors
   * @returns {Promise<void>}
   */
  async addMembers(...actors) {
    const party = this.parent;
    const ids = actors.filter(a => a && !a.pack && !a.isToken && (a.type !== "party") && !this.hasMember(a)).map(a => a.id);
    if ( !ids.length ) return;
    for ( const other of game.actors.filter(a => (a.type === "party") && (a !== party)) ) {
      const left = other.system.members.filter(id => !ids.includes(id));
      if ( left.length !== other.system.members.length ) await other.update({ "system.members": left });
    }
    await party.update({ "system.members": [...this.members, ...ids] });
  }

  /**
   * Add an actor to the party on behalf of its owner: directly when the user may update the party, else through
   * the GM (players only observe the party).
   * @param {Actor} actor
   * @returns {Promise<boolean>}  Whether the actor joined (or the request went to the GM)
   */
  async join(actor) {
    if ( !actor || this.hasMember(actor) ) return false;
    if ( this.parent.isOwner ) {
      await this.addMembers(actor);
      return true;
    }
    if ( !actor.isOwner ) return false;
    return executeAsGM("joinParty", { partyId: this.parent.id, actorId: actor.id });
  }

  /**
   * Remove an actor from the party.
   * @param {Actor|string} actor
   * @returns {Promise<void>}
   */
  async removeMember(actor) {
    const id = typeof actor === "string" ? actor : actor?.id;
    if ( !this.hasMember(id) ) return;
    await this.parent.update({ "system.members": this.members.filter(m => m !== id) });
  }
}
