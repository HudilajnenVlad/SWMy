import SW25ActorSheet from "./actor-base.mjs";
import { sellLoot } from "../../workflows/loot.mjs";
import { playerCharacters } from "../sidebar/actor-directory.mjs";
import { rollCheck } from "../../workflows/checks.mjs";
import { PAPER_DIALOG, speakerFor, t } from "../../helpers/utils.mjs";

/** Checks the whole party relies on its best member for (shown first, as boxes). */
const KEY_CHECKS = ["initiative", "monsterKnowledge", "dangerSense"];

/** Personal checks that say nothing about the party. */
const PERSONAL_CHECKS = ["death", "fortitude", "willpower"];

/** Party checks grouped by check package. */
const CHECK_GROUPS = [
  { key: "technique", label: "SW25.Package.technique" },
  { key: "movement", label: "SW25.Package.movement" },
  { key: "observation", label: "SW25.Package.observation" },
  { key: "knowledge", label: "SW25.Package.knowledge" },
  { key: null, label: "SW25.Party.OtherChecks" }
];

/**
 * Party sheet (after the PF2e party): the party's best checks and its languages on top, a card per member (race,
 * level, classes, HP/MP, defenses, best checks, magic, purse), the party tools (rest, new day, session reward,
 * tokens), the shared stash with the party purse, and notes.
 */
export default class PartySheet extends SW25ActorSheet {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["party", "swp", "themed", "theme-light"],
    position: { width: 940, height: 880 },
    actions: {
      memberOpen: PartySheet.#onMemberOpen,
      memberRemove: PartySheet.#onMemberRemove,
      memberToken: PartySheet.#onMemberToken,
      addPlayerCharacters: PartySheet.#onAddPlayerCharacters,
      partyRest: PartySheet.#onRest,
      partyNewDay: PartySheet.#onNewDay,
      partyReward: PartySheet.#onReward,
      placeTokens: PartySheet.#onPlaceTokens,
      selectTokens: PartySheet.#onSelectTokens,
      summaryView: PartySheet.#onSummaryView,
      rollBest: PartySheet.#onRollBest,
      stashGive: PartySheet.#onStashGive,
      lootSell: PartySheet.#onLootSell
    }
  };

  /** @override */
  static PARTS = {
    header: { template: "systems/swordworld25/templates/actor/party/header.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    overview: { template: "systems/swordworld25/templates/actor/party/overview.hbs", scrollable: [""] },
    stash: { template: "systems/swordworld25/templates/actor/party/stash.hbs", scrollable: [""] },
    notes: { template: "systems/swordworld25/templates/actor/party/notes.hbs", scrollable: [""] }
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        { id: "overview", icon: "fa-solid fa-users", tooltip: "SW25.Tab.overview" },
        { id: "stash", icon: "fa-solid fa-sack-dollar", tooltip: "SW25.Tab.stash" },
        { id: "notes", icon: "fa-solid fa-feather", tooltip: "SW25.Tab.notes" }
      ],
      initial: "overview",
      labelPrefix: "SW25.Tab"
    }
  };

  /** Summary on top of the overview: "skills" (party checks) or "languages". */
  summaryView = "skills";

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const party = this.actor;
    const members = party.system.memberActors;
    const characters = members.filter(a => a.type === "character");
    const levels = characters.map(a => a.system.level ?? 0);
    const purses = characters.reduce((sum, a) => sum + (a.system.money ?? 0), 0);
    const moves = members.map(a => movementOf(a)).filter(Number.isFinite);
    const scene = canvas?.scene ?? null;
    Object.assign(context, {
      party,
      editable: this.isEditable,
      members: members.map(a => this.#memberCard(a, scene)),
      characterCount: characters.length,
      summaryView: this.summaryView,
      checks: this.#partyChecks(characters),
      languages: this.#partyLanguages(characters),
      avgLevel: levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : "—",
      maxLevel: levels.length ? Math.max(...levels) : "—",
      totalMoney: (purses + party.system.money).toLocaleString(game.i18n.lang),
      slowest: moves.length ? Math.min(...moves) : "—",
      canAddPCs: game.user.isGM && playerCharacters().some(a => !party.system.hasMember(a)),
      scene: scene ? { name: scene.name } : null,
      missingTokens: scene ? members.filter(a => !scene.tokens.some(tk => tk.actorId === a.id)).length : 0,
      stash: await this.#stashRows(),
      purses: characters.map(a => ({ id: a.id, name: a.name, img: a.img, money: (a.system.money ?? 0).toLocaleString(game.i18n.lang) })),
      memberOptions: Object.fromEntries(characters.filter(a => a.isOwner).map(a => [a.id, a.name])),
      enrichedNotes: await this._enrich(party.system.notes)
    });
    return context;
  }

  /**
   * Card of a party member.
   * @param {Actor} actor
   * @param {Scene|null} scene
   * @returns {object}
   */
  #memberCard(actor, scene) {
    const SW25 = CONFIG.SW25;
    const sys = actor.system;
    const pct = (v, m) => (m ? Math.clamp(Math.round((v / m) * 100), 0, 100) : 0);
    const card = {
      id: actor.id,
      name: actor.name,
      img: actor.img,
      tokenImg: actor.prototypeToken?.texture?.src || actor.img,
      owner: actor.isOwner,
      limited: !actor.testUserPermission(game.user, "OBSERVER"),
      level: actor.type === "mount" ? sys.currentLevel : sys.level,
      onScene: !!scene?.tokens.some(tk => tk.actorId === actor.id)
    };
    if ( actor.type === "character" ) {
      card.subtitle = [sys.race?.name, sys.details?.player || ownerName(actor)].filter(Boolean).join(" · ");
      card.classes = Object.values(sys.classes ?? {}).filter(c => c.level > 0)
        .sort((a, b) => (b.level - a.level) || a.label.localeCompare(b.label))
        .map(c => ({ label: c.label, level: c.level }));
    } else {
      card.subtitle = game.i18n.localize(SW25.monsterClassifications[sys.classification] ?? `TYPES.Actor.${actor.type}`);
      card.classes = [];
    }
    if ( card.limited ) return card;

    card.hp = { value: sys.hp?.value ?? 0, max: sys.hp?.max ?? 0, pct: pct(sys.hp?.value, sys.hp?.max) };
    card.mp = { value: sys.mp?.value ?? 0, max: sys.mp?.max ?? 0, pct: pct(sys.mp?.value, sys.mp?.max) };
    card.statuses = actor.temporaryEffects.map(e => ({ name: e.name, img: e.img }));
    if ( actor.type === "character" ) {
      const checks = sys.checks ?? {};
      card.stats = [
        { label: "SW25.Tracker.EvasionShort", value: sys.evasion, tooltip: "SW25.Evasion" },
        { label: "SW25.Tracker.DefenseShort", value: sys.defense, tooltip: "SW25.Defense" },
        { label: "SW25.Tracker.FortitudeShort", value: sys.fortitude, tooltip: "SW25.Check.fortitude" },
        { label: "SW25.Tracker.WillpowerShort", value: sys.willpower, tooltip: "SW25.Check.willpower" },
        { label: "SW25.Party.InitiativeShort", value: checks.initiative?.straight ? "—" : checks.initiative?.value, tooltip: "SW25.Check.initiative" },
        { label: "SW25.Party.MoveShort", value: `${sys.movement?.normal ?? "—"}/${sys.movement?.full ?? "—"}`, tooltip: "SW25.Party.MoveHint" }
      ];
      card.checks = Object.values(checks)
        .filter(c => !c.straight && !PERSONAL_CHECKS.includes(c.key) && !KEY_CHECKS.includes(c.key))
        .sort((a, b) => (b.value - a.value) || game.i18n.localize(a.label).localeCompare(game.i18n.localize(b.label)))
        .slice(0, 6)
        .map(c => ({ key: c.key, label: game.i18n.localize(c.label), value: c.value }));
      card.magic = Object.values(sys.magic ?? {}).map(m => ({
        label: game.i18n.localize(m.label), power: m.power, icon: SW25.magicSystems[m.system]?.icon ?? "fa-solid fa-wand-sparkles"
      }));
      card.money = (sys.money ?? 0).toLocaleString(game.i18n.lang);
      card.exp = (sys.exp?.value ?? 0).toLocaleString(game.i18n.lang);
      card.graceUsed = !!sys.daily?.changeFate;
      card.character = true;
    } else {
      const main = sys.mainSectionData;
      card.stats = [
        { label: "SW25.Tracker.EvasionShort", value: main?.evasionTotal ?? "—", tooltip: "SW25.Evasion" },
        { label: "SW25.Tracker.DefenseShort", value: main?.defenseTotal ?? "—", tooltip: "SW25.Defense" },
        { label: "SW25.Tracker.FortitudeShort", value: sys.fortitudeTotal ?? "—", tooltip: "SW25.Check.fortitude" },
        { label: "SW25.Tracker.WillpowerShort", value: sys.willpowerTotal ?? "—", tooltip: "SW25.Check.willpower" },
        { label: "SW25.Party.MoveShort", value: sys.movementLabel ?? "—", tooltip: "SW25.Party.MoveHint" }
      ];
    }
    return card;
  }

  /**
   * Best value of every check in the party (trained members only).
   * @param {Actor[]} characters
   * @returns {{key: object[], groups: object[], empty: boolean}}
   */
  #partyChecks(characters) {
    const SW25 = CONFIG.SW25;
    const entries = [];
    for ( const key of Object.keys(SW25.checks) ) {
      if ( PERSONAL_CHECKS.includes(key) ) continue;
      const values = characters.map(actor => ({ actor, check: actor.system.checks?.[key] }))
        .filter(v => v.check && !v.check.straight)
        .sort((a, b) => b.check.value - a.check.value);
      if ( !values.length ) continue;
      const best = values[0];
      entries.push({
        key,
        label: game.i18n.localize(`SW25.Check.${key}`),
        package: SW25.checks[key].package ?? null,
        value: best.check.value,
        name: best.actor.name,
        actorId: best.actor.id,
        canRoll: best.actor.isOwner,
        tooltip: values.map(v => `${v.actor.name} ${v.check.value}`).join(" · ")
      });
    }
    const keyChecks = KEY_CHECKS.map(k => entries.find(e => e.key === k)).filter(Boolean);
    const groups = CHECK_GROUPS.map(g => ({
      ...g,
      checks: entries.filter(e => !KEY_CHECKS.includes(e.key) && (e.package === g.key))
        .sort((a, b) => a.label.localeCompare(b.label))
    })).filter(g => g.checks.length);
    return { key: keyChecks, groups, empty: !entries.length };
  }

  /**
   * Languages of the party: who speaks and who reads each one.
   * @param {Actor[]} characters
   * @returns {object[]}
   */
  #partyLanguages(characters) {
    const SW25 = CONFIG.SW25;
    const byId = new Map();
    for ( const actor of characters ) {
      for ( const entry of actor.system.languages ?? [] ) {
        const key = languageKey(entry);
        const cfg = SW25.languages[key] ?? null;
        const custom = String(entry.name ?? "").trim();
        const label = cfg ? (cfg.dialect && custom ? `${game.i18n.localize(cfg.label)}: ${custom}` : game.i18n.localize(cfg.label)) : custom;
        const id = cfg && !cfg.dialect ? key : label.toLowerCase();
        if ( !id ) continue;
        const lang = byId.get(id) ?? { id, label, speak: new Set(), write: new Set() };
        if ( entry.speak && (cfg?.speak !== false) ) lang.speak.add(actor.name);
        if ( entry.write && (cfg?.write !== false) ) lang.write.add(actor.name);
        byId.set(id, lang);
      }
    }
    const n = characters.length;
    return [...byId.values()]
      .filter(l => l.speak.size || l.write.size)
      .map(l => ({
        id: l.id,
        label: l.label,
        speak: l.speak.size,
        write: l.write.size,
        common: (n > 0) && (l.speak.size === n),
        tooltip: [
          l.speak.size ? `${t("SW25.Speak")}: ${[...l.speak].join(", ")}` : "",
          l.write.size ? `${t("SW25.Write")}: ${[...l.write].join(", ")}` : ""
        ].filter(Boolean).join(" · ")
      }))
      .sort((a, b) => (b.speak - a.speak) || (b.write - a.write) || a.label.localeCompare(b.label));
  }

  /**
   * Rows of the party stash.
   * @returns {Promise<object[]>}
   */
  async #stashRows() {
    const items = this.actor.items.filter(i => CONFIG.SW25.inventoryTypes.includes(i.type))
      .sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name));
    return Promise.all(items.map(async item => ({
      ...(await this._itemRow(item)),
      quantity: item.system.quantity ?? 1,
      price: Number.isFinite(item.system.price) ? item.system.price.toLocaleString(game.i18n.lang) : (item.system.priceText || "—"),
      typeLabel: game.i18n.localize(`TYPES.Item.${item.type}`),
      sellable: (item.system.itemType === "loot") && Number.isInteger(item.system.price)
    })));
  }

  /* -------------------------------------------- */
  /*  Drag & drop                                 */
  /* -------------------------------------------- */

  /** @override */
  async _onDropActor(event, actor) {
    if ( !this.actor.isOwner ) return null;
    if ( actor.pack || (actor.type === "party") ) {
      ui.notifications.warn(t("SW25.Party.WorldActorsOnly"));
      return null;
    }
    await this.actor.system.addMembers(actor);
    return actor;
  }

  /** @override */
  async _onDropItem(event, item) {
    if ( !this.actor.isOwner ) return null;
    if ( item.parent === this.actor ) return super._onDropItem(event, item);
    if ( !CONFIG.SW25.inventoryTypes.includes(item.type) ) {
      ui.notifications.warn(t("SW25.Party.StashOnly"));
      return null;
    }
    const data = item.toObject();
    delete data._id;
    if ( data.system ) data.system.equipped = false;
    const [created] = await this.actor.createEmbeddedDocuments("Item", [data]);
    // Dragged from a member: the item moves into the stash
    if ( created && (item.parent instanceof Actor) && item.parent.isOwner ) await item.delete();
    return created;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /** Member of the clicked card. */
  #member(target) {
    return game.actors.get(target.closest("[data-member-id]")?.dataset.memberId) ?? null;
  }

  /** Character members of the party. */
  get #characters() {
    return this.actor.system.memberActors.filter(a => a.type === "character");
  }

  static #onMemberOpen(event, target) {
    this.#member(target)?.sheet.render(true);
  }

  static async #onMemberRemove(event, target) {
    const actor = this.#member(target);
    if ( actor ) await this.actor.system.removeMember(actor);
  }

  /** Show the member's token on the scene (or place it there). */
  static async #onMemberToken(event, target) {
    const actor = this.#member(target);
    if ( !actor || !canvas?.scene ) return;
    const token = canvas.tokens.placeables.find(tk => tk.document.actorId === actor.id);
    if ( token ) {
      token.control({ releaseOthers: !event.shiftKey });
      return canvas.animatePan({ x: token.center.x, y: token.center.y });
    }
    if ( game.user.isGM ) return placeTokens([actor]);
  }

  static async #onAddPlayerCharacters() {
    await this.actor.system.addMembers(...playerCharacters());
  }

  static async #onRest() {
    const characters = this.#characters;
    if ( !characters.length ) return;
    const hours = await foundry.applications.api.DialogV2.wait({
      window: { title: t("SW25.Rest.Party"), icon: "fa-solid fa-bed" },
      classes: PAPER_DIALOG,
      content: `<p>${t("SW25.Rest.Hint")}</p><p class="swp-hint">${characters.map(a => foundry.utils.escapeHTML(a.name)).join(", ")}</p>`,
      buttons: [
        { action: "3", label: t("SW25.Rest.Short"), callback: () => 3 },
        { action: "6", label: t("SW25.Rest.Long"), default: true, callback: () => 6 }
      ],
      rejectClose: false
    });
    if ( !hours ) return;
    for ( const actor of characters ) await actor.rest(hours);
  }

  static async #onNewDay() {
    const characters = this.#characters;
    for ( const actor of characters ) await actor.newDay();
    await postPartyNote(this.actor, t("SW25.Rest.NewDay"), "fa-solid fa-sun",
      t("SW25.Party.NewDayDone", { names: characters.map(a => a.name).join(", ") }));
  }

  /** Session reward: experience, reputation and gamels for every character. */
  static async #onReward() {
    const characters = this.#characters;
    if ( !characters.length ) return;
    const reward = await foundry.applications.api.DialogV2.prompt({
      window: { title: t("SW25.Party.Reward"), icon: "fa-solid fa-star" },
      classes: PAPER_DIALOG,
      content: `<p>${t("SW25.Party.RewardHint")}</p>
        <div class="swp-field-grid">
          <label class="swp-field">${t("SW25.Exp.label")}<input type="number" name="exp" value="1000" min="0" step="10" autofocus></label>
          <label class="swp-field">${t("SW25.Reputation.current")}<input type="number" name="reputation" value="0" min="0"></label>
          <label class="swp-field">${t("SW25.Party.Gamels")}<input type="number" name="money" value="0" min="0"></label>
        </div>`,
      ok: {
        label: t("SW25.Party.Give"),
        callback: (event, button) => {
          const f = button.form.elements;
          return { exp: Number(f.exp.value) || 0, reputation: Number(f.reputation.value) || 0, money: Number(f.money.value) || 0 };
        }
      },
      rejectClose: false
    });
    if ( !reward || !(reward.exp || reward.reputation || reward.money) ) return;
    for ( const actor of characters ) {
      const s = actor.system;
      await actor.update({
        "system.exp.value": s.exp.value + reward.exp,
        "system.exp.total": s.exp.total + reward.exp,
        "system.reputation.value": s.reputation.value + reward.reputation,
        "system.reputation.total": s.reputation.total + reward.reputation,
        "system.money": s.money + reward.money
      });
    }
    const parts = [];
    if ( reward.exp ) parts.push(`+${reward.exp} ${t("SW25.Exp.label")}`);
    if ( reward.reputation ) parts.push(`+${reward.reputation} ${t("SW25.Reputation.current")}`);
    if ( reward.money ) parts.push(`+${reward.money} G`);
    await postPartyNote(this.actor, t("SW25.Party.Reward"), "fa-solid fa-star",
      t("SW25.Party.RewardDone", { reward: parts.join(", "), names: characters.map(a => a.name).join(", ") }));
  }

  static async #onPlaceTokens() {
    const scene = canvas?.scene;
    if ( !scene ) return ui.notifications.warn(t("SW25.Party.NoScene"));
    const missing = this.actor.system.memberActors.filter(a => !scene.tokens.some(tk => tk.actorId === a.id));
    if ( !missing.length ) return ui.notifications.info(t("SW25.Party.AllPlaced"));
    await placeTokens(missing);
  }

  static #onSelectTokens(event) {
    const ids = new Set(this.actor.system.members);
    const tokens = canvas?.tokens?.placeables.filter(tk => ids.has(tk.document.actorId) && tk.isOwner) ?? [];
    if ( !tokens.length ) return ui.notifications.info(t("SW25.Party.NoTokens"));
    if ( !event.shiftKey ) canvas.tokens.releaseAll();
    for ( const token of tokens ) token.control({ releaseOthers: false });
    const x = tokens.reduce((s, tk) => s + tk.center.x, 0) / tokens.length;
    const y = tokens.reduce((s, tk) => s + tk.center.y, 0) / tokens.length;
    return canvas.animatePan({ x, y });
  }

  static #onSummaryView(event, target) {
    this.summaryView = target.dataset.view;
    return this.render({ parts: ["overview"] });
  }

  /** Roll a party check for its best member. */
  static #onRollBest(event, target) {
    const actor = game.actors.get(target.dataset.actorId);
    if ( actor?.isOwner ) return rollCheck(actor, target.dataset.check, { event });
  }

  /** Give a stash item to a member (the item moves). */
  static #onLootSell(event, target) {
    const item = this._getItem(target);
    if ( item ) return sellLoot(this.actor, item);
  }

  static async #onStashGive(event, target) {
    const item = this._getItem(target);
    const members = this.#characters.filter(a => a.isOwner);
    if ( !item || !members.length ) return;
    const options = members.map(a => `<option value="${a.id}">${foundry.utils.escapeHTML(a.name)}</option>`).join("");
    const id = await foundry.applications.api.DialogV2.prompt({
      window: { title: t("SW25.Party.GiveTitle", { name: item.name }), icon: "fa-solid fa-hand-holding" },
      classes: PAPER_DIALOG,
      content: `<label class="swp-field">${t("SW25.Party.GiveTo")}<select name="member">${options}</select></label>`,
      ok: { label: t("SW25.Party.Give"), callback: (ev, button) => button.form.elements.member.value },
      rejectClose: false
    });
    const actor = game.actors.get(id ?? "");
    if ( !actor ) return;
    const data = item.toObject();
    delete data._id;
    await actor.createEmbeddedDocuments("Item", [data]);
    await item.delete();
  }
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * Identify a stored language entry with a configured language key.
 * @param {object} entry
 * @returns {string}
 */
function languageKey(entry) {
  const languages = CONFIG.SW25.languages;
  if ( entry.key && languages[entry.key] ) return entry.key;
  const name = String(entry.name ?? "").trim().toLowerCase();
  if ( !name ) return entry.key || "";
  for ( const [key, cfg] of Object.entries(languages) ) {
    if ( (cfg.name.toLowerCase() === name) || (game.i18n.localize(cfg.label).toLowerCase() === name) ) return key;
  }
  return "";
}

/**
 * Normal movement of an actor (monsters: ground speed).
 * @param {Actor} actor
 * @returns {number}
 */
function movementOf(actor) {
  if ( actor.type === "character" ) return actor.system.movement?.normal;
  return actor.system.movement?.ground;
}

/**
 * Name of the player owning an actor.
 * @param {Actor} actor
 * @returns {string}
 */
function ownerName(actor) {
  const owner = game.users.find(u => !u.isGM && (actor.ownership[u.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
  return owner?.name ?? "";
}

/**
 * Place tokens of actors on the current scene, in rows around the centre of the view.
 * @param {Actor[]} actors
 * @returns {Promise<void>}
 */
export async function placeTokens(actors) {
  const scene = canvas?.scene;
  if ( !scene || !actors.length || !game.user.isGM ) return;
  const size = canvas.grid.size;
  const perRow = Math.ceil(Math.sqrt(actors.length));
  const origin = canvas.stage.pivot;
  const data = [];
  for ( const [i, actor] of actors.entries() ) {
    const point = canvas.grid.getSnappedPoint({
      x: origin.x + ((i % perRow) - (perRow / 2)) * size,
      y: origin.y + (Math.floor(i / perRow) - 0.5) * size
    }, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_VERTEX });
    const token = await actor.getTokenDocument({ x: point.x, y: point.y });
    data.push(token.toObject());
  }
  await scene.createEmbeddedDocuments("Token", data);
}

/**
 * Chat note of a party action (new day, reward).
 * @param {Actor} party
 * @param {string} title
 * @param {string} icon
 * @param {string} text
 */
async function postPartyNote(party, title, icon, text) {
  await ChatMessage.implementation.create({
    speaker: speakerFor(party),
    content: `<div class="sw25 swp swp-chat swp-chat-note">
      <header class="swp-chat-head"><span class="swp-chat-icon"><i class="${icon}"></i></span>
        <div class="swp-chat-titles"><span class="swp-chat-title">${foundry.utils.escapeHTML(title)}</span>
          <span class="swp-chat-subtitle">${foundry.utils.escapeHTML(party.name)}</span></div></header>
      <p class="swp-chat-text">${foundry.utils.escapeHTML(text)}</p></div>`
  });
}
