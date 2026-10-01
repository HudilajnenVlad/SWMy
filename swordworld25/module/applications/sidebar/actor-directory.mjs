import MonsterTemplateApp from "../apps/monster-template.mjs";
import CompendiumBrowser from "../apps/compendium-browser.mjs";
import { t } from "../../helpers/utils.mjs";

const { ActorDirectory } = foundry.applications.sidebar.tabs;

/** Party folders collapsed by this client (they start expanded). */
const collapsed = new Set();

/**
 * Actors directory with the party folders on top (like the PF2e party): each party lists its members and opens the
 * party sheet. The footer holds the GM tools: monster from template and the bestiary.
 */
export default class SW25ActorDirectory extends ActorDirectory {

  /** @override */
  static DEFAULT_OPTIONS = {
    renderUpdateKeys: ["system.members"],
    actions: {
      togglePartyFolder: SW25ActorDirectory.#onTogglePartyFolder,
      openPartySheet: SW25ActorDirectory.#onOpenPartySheet,
      createParty: SW25ActorDirectory.#onCreateParty,
      createPartyMember: SW25ActorDirectory.#onCreatePartyMember,
      openMonsterTemplate: SW25ActorDirectory.#onOpenMonsterTemplate,
      openBestiary: SW25ActorDirectory.#onOpenBestiary
    }
  };

  /** @override */
  static PARTS = (() => {
    const parts = { ...super.PARTS };
    return {
      header: parts.header,
      parties: {
        template: "systems/swordworld25/templates/sidebar/party-folders.hbs",
        templates: ["templates/sidebar/partials/document-partial.hbs"]
      },
      directory: parts.directory,
      footer: parts.footer
    };
  })();

  /* -------------------------------------------- */

  /**
   * Create the party of the world with the player characters.
   * @param {object} [options]
   * @param {boolean} [options.render=true]  Open the new party sheet
   * @returns {Promise<Actor|null>}
   */
  static async createParty({ render = true } = {}) {
    if ( !game.user.isGM ) return null;
    const party = await Actor.implementation.create({
      name: t("SW25.Party.DefaultName"),
      type: "party",
      img: CONFIG.SW25.partyIcon,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
      system: { members: playerCharacters().map(a => a.id) }
    });
    if ( render ) party?.sheet.render(true);
    return party;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  render(options = {}, _options) {
    // The party folders live inside the directory list: they are rendered together
    if ( (typeof options === "object") && options.parts ) {
      if ( options.parts.includes("parties") && !options.parts.includes("directory") ) options.parts.push("directory");
      if ( options.parts.includes("directory") && !options.parts.includes("parties") ) options.parts.push("parties");
    }
    return super.render(options, _options);
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if ( partId === "parties" ) {
      const parties = this.collection.filter(a => (a.type === "party") && a.visible)
        .sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name));
      Object.assign(context, {
        documentCls: "actor",
        canCreateParty: game.user.isGM && !parties.length,
        canCreateMember: Actor.implementation.canUserCreate(game.user),
        parties: parties.map(party => ({
          id: party.id,
          name: party.name,
          img: party.img,
          expanded: !collapsed.has(party.id),
          count: party.system.memberActors.length,
          members: party.system.memberActors.filter(a => a.visible)
        }))
      });
    }
    return context;
  }

  /** @override */
  async _prepareFooterContext(context, options) {
    await super._prepareFooterContext(context, options);
    if ( !game.user.isGM ) return;
    context.buttons.push(
      { type: "button", icon: "fa-solid fa-wand-magic-sparkles", label: "SW25.Template.Sidebar", action: "openMonsterTemplate" },
      { type: "button", icon: "fa-solid fa-dragon", label: "SW25.Party.Bestiary", action: "openBestiary" }
    );
  }

  /** @override */
  async _onRender(context, options) {
    const parties = this.parts.parties;
    const list = this.parts.directory;
    if ( parties && list && options.parts.includes("directory") ) list.prepend(parties);
    await super._onRender(context, options);
    // Double-click a party folder to open its sheet
    for ( const header of this.element.querySelectorAll(".swp-party-header") ) {
      header.addEventListener("dblclick", event => {
        if ( event.target.closest("button") ) return;
        game.actors.get(header.closest("[data-party-id]")?.dataset.partyId)?.sheet.render(true);
      });
    }
  }

  /** @override */
  _onSearchFilter(event, query, rgx, html) {
    super._onSearchFilter(event, query, rgx, html);
    // A party folder opens while one of its members matches the search
    for ( const folder of html.querySelectorAll(".swp-party-folder") ) {
      const matches = [...folder.querySelectorAll(".directory-item.entry")].some(li => li.style.display !== "none");
      folder.classList.toggle("expanded", query ? matches : !collapsed.has(folder.dataset.partyId));
    }
  }

  /* -------------------------------------------- */
  /*  Drag & drop                                 */
  /* -------------------------------------------- */

  /** @override */
  _onDragStart(event) {
    super._onDragStart(event);
    const fromParty = event.currentTarget.closest("[data-party-id]")?.dataset.partyId;
    if ( !fromParty ) return;
    const data = JSON.parse(event.dataTransfer.getData("text/plain") || "{}");
    data.fromParty = fromParty;
    event.dataTransfer.setData("text/plain", JSON.stringify(data));
  }

  /** @override */
  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const partyId = event.target.closest("[data-party-id]")?.dataset.partyId;
    if ( data.type === "Actor" ) {
      // Into a party folder: the actor joins the party
      if ( partyId ) {
        if ( data.fromParty === partyId ) return;
        const party = game.actors.get(partyId);
        const actor = await fromUuid(data.uuid);
        if ( party && (actor instanceof Actor) && !actor.pack && (actor.type !== "party") ) await party.system.join(actor);
        return;
      }
      // Out of a party folder: the actor leaves it and goes where it was dropped
      if ( data.fromParty ) {
        const party = game.actors.get(data.fromParty);
        if ( party?.isOwner ) await party.system.removeMember(fromUuidSync(data.uuid)?.id);
      }
    }
    return super._onDrop(event);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onTogglePartyFolder(event, target) {
    if ( event.target.closest("button") ) return;
    const folder = target.closest("[data-party-id]");
    const id = folder.dataset.partyId;
    if ( collapsed.has(id) ) collapsed.delete(id);
    else collapsed.add(id);
    folder.classList.toggle("expanded", !collapsed.has(id));
  }

  static #onOpenPartySheet(event, target) {
    game.actors.get(target.closest("[data-party-id]")?.dataset.partyId)?.sheet.render(true);
  }

  /** Create a character that joins the party at once. */
  static async #onCreatePartyMember(event, target) {
    event.stopPropagation();
    const party = game.actors.get(target.closest("[data-party-id]")?.dataset.partyId);
    if ( !party ) return;
    const top = Math.max(0, target.getBoundingClientRect().top);
    const actor = await Actor.implementation.createDialog({ type: "character" }, {}, {
      types: ["character"], position: { width: 320, left: window.innerWidth - 630, top }
    }).catch(() => null);
    if ( actor instanceof Actor ) await party.system.join(actor);
  }

  static #onCreateParty() {
    return SW25ActorDirectory.createParty();
  }

  static #onOpenMonsterTemplate() {
    return new MonsterTemplateApp().render({ force: true });
  }

  static #onOpenBestiary() {
    return CompendiumBrowser.open("bestiary");
  }
}

/**
 * World characters owned by players.
 * @returns {Actor[]}
 */
export function playerCharacters() {
  return game.actors.filter(a => (a.type === "character") && a.hasPlayerOwner);
}
