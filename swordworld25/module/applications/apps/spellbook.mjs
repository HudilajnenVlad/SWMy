import { castSpell, getCasting } from "../../workflows/magic.mjs";
import { itemEntry } from "../../helpers/item-entry.mjs";
import { keyboardActions, t } from "../../helpers/utils.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SPELL_FIELDS = [
  "system.magic", "system.level", "system.subsystem", "system.deity", "system.barbarous", "system.cost",
  "system.target.text", "system.rangeArea.text", "system.duration.text", "system.resistance", "system.summary",
  "system.minorAction", "system.combatPrep", "system.magisphere", "system.effect"
];
const ABILITY_FIELDS = ["system.level", "system.summary", "system.mpCost", "system.cost", "system.cards", "system.action", "system.duration.text",
  "system.combatPrep", "system.minorAction", "system.baseRhythm"];

/** Compendium of each learnable ability type. */
const PACKS = { magic: "swordworld25.spells", learned: "swordworld25.class-abilities" };

/**
 * Short detail of a class ability: MP cost of a technique, rhythm of a song or finale, cards of an evocation,
 * action of a stunt.
 * @param {string} type
 * @param {object} s     System data of the ability
 * @returns {string}
 */
export function abilityDetail(type, s) {
  const rhythm = r => Object.entries(CONFIG.SW25.rhythms).filter(([k]) => r?.[k]).map(([k, c]) => `${c.icon}${r[k]}`).join(" ");
  if ( type === "technique" ) return `MP${s.mpCost ?? 3}${s.duration?.text ? ` · ${s.duration.text}` : ""}`;
  if ( type === "finale" ) return rhythm(s.cost) || "—";
  if ( type === "spellsong" ) return rhythm(s.baseRhythm) || "—";
  if ( type === "evocation" ) return s.cards?.text ?? "";
  if ( type === "stunt" ) return game.i18n.localize(CONFIG.SW25.stuntActions[s.action] ?? "");
  return "";
}

/**
 * Spellbook window: every spell an actor can cast (from its classes and the compendium) plus the learnable
 * class abilities (techniques, spellsongs, finales, stunts, evocations). Paper style: an index tab per school,
 * the caster's Magic Power and MP, and one table per school grouped by level whose rows open the rulebook entry.
 */
export default class SpellbookApp extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @param {Actor} actor */
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.filter = "";
    this.showAll = false;
    this.activeTab = options.tab ?? null;
    /** Uuids of the expanded rows. */
    this.expanded = new Set();
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "sw25-spellbook-{id}",
    classes: ["sw25", "sw25-spellbook", "swp", "themed", "theme-light"],
    position: { width: 780, height: 800 },
    window: { resizable: true, icon: "fa-solid fa-book-sparkles" },
    actions: {
      cast: SpellbookApp.#onCast,
      view: SpellbookApp.#onView,
      expand: SpellbookApp.#onExpand,
      favorite: SpellbookApp.#onFavorite,
      learn: SpellbookApp.#onLearn,
      use: SpellbookApp.#onUse,
      forget: SpellbookApp.#onForget,
      bookTab: SpellbookApp.#onTab,
      toggleAll: SpellbookApp.#onToggleAll,
      openPack: SpellbookApp.#onOpenPack,
      element: SpellbookApp.#onElement,
      rhythm: SpellbookApp.#onRhythm
    }
  };

  /** @override */
  static PARTS = {
    body: { template: "systems/swordworld25/templates/apps/spellbook.hbs", scrollable: [".swp-book-content"] }
  };

  /** Open instances per actor. */
  static #instances = new Map();

  /**
   * Open (or focus) the spellbook of an actor.
   * @param {Actor} actor
   * @param {object} [options]
   * @param {string} [options.tab]
   * @param {string} [options.system]
   * @returns {Promise<SpellbookApp>}
   */
  static openFor(actor, { tab, system } = {}) {
    let app = this.#instances.get(actor.uuid);
    if ( !app ) {
      app = new this(actor, { tab: tab ?? system, id: `sw25-spellbook-${actor.id}` });
      this.#instances.set(actor.uuid, app);
    } else if ( tab ?? system ) app.activeTab = tab ?? system;
    return app.render({ force: true });
  }

  /** @override */
  get title() {
    return `${t("SW25.Spellbook.Title")}: ${this.actor.name}`;
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    SpellbookApp.#instances.delete(this.actor.uuid);
  }

  /* -------------------------------------------- */

  /**
   * Available tabs for the actor.
   * @returns {object[]}
   */
  #tabs() {
    const actor = this.actor;
    const SW25 = CONFIG.SW25;
    const tabs = [];
    for ( const [system, cfg] of Object.entries(SW25.magicSystems) ) {
      const casting = getCasting(actor, system);
      const owned = actor.items.some(i => (i.type === "spell") && (i.system.magic === system));
      if ( casting || owned ) tabs.push({ id: system, label: cfg.label, icon: cfg.icon, kind: "magic", casting });
    }
    if ( actor.type === "character" ) {
      const learnable = [
        ["technique", "enhancer", "fa-solid fa-fire-flame-curved"],
        ["spellsong", "bard", "fa-solid fa-music"],
        ["finale", "bard", "fa-solid fa-guitar"],
        ["stunt", "rider", "fa-solid fa-horse"],
        ["evocation", "alchemist", "fa-solid fa-flask"]
      ];
      for ( const [type, cls, icon] of learnable ) {
        const level = actor.system.classes?.[cls]?.level ?? 0;
        const owned = actor.items.some(i => i.type === type);
        if ( level || owned ) tabs.push({ id: type, label: `TYPES.Item.${type}`, icon, kind: "learned", classKey: cls, level });
      }
    }
    return tabs;
  }

  /** @override */
  async _prepareContext(options) {
    const tabs = this.#tabs();
    if ( !tabs.find(tb => tb.id === this.activeTab) ) this.activeTab = tabs[0]?.id ?? null;
    const active = tabs.find(tb => tb.id === this.activeTab) ?? null;
    for ( const tb of tabs ) tb.active = tb.id === this.activeTab;
    const context = { actor: this.actor, tabs, active, filter: this.filter, showAll: this.showAll, groups: [] };
    if ( !active ) return context;
    if ( active.kind === "magic" ) Object.assign(context, await this.#magicContext(active));
    else Object.assign(context, await this.#learnedContext(active));
    return context;
  }

  /**
   * Rulebook entry of an expanded row.
   * @param {string} uuid
   * @returns {Promise<object|null>}
   */
  async #entry(uuid) {
    if ( !this.expanded.has(uuid) ) return null;
    const doc = await fromUuid(uuid);
    return doc ? itemEntry(doc) : null;
  }

  /**
   * Spells of one magic system grouped by level.
   * @param {object} tab
   */
  async #magicContext(tab) {
    const actor = this.actor;
    const system = tab.id;
    const casting = tab.casting;
    const maxLevel = casting?.level ?? 0;
    const entries = [];
    const ownedNames = new Set();

    // Owned spells
    for ( const item of actor.items ) {
      if ( (item.type !== "spell") || (item.system.magic !== system) ) continue;
      ownedNames.add(item.name);
      entries.push({ uuid: item.uuid, name: item.name, img: item.img, system: item.system, owned: true, id: item.id });
    }
    // Compendium spells
    const pack = game.packs.get(PACKS.magic);
    if ( pack ) {
      const index = await pack.getIndex({ fields: SPELL_FIELDS });
      for ( const entry of index ) {
        if ( entry.system?.magic !== system ) continue;
        if ( ownedNames.has(entry.name) ) continue;
        entries.push({ uuid: entry.uuid, name: entry.name, img: entry.img, system: entry.system, owned: false });
      }
    }

    // Availability rules
    const SW25 = CONFIG.SW25;
    const deity = (actor.system.deity ?? casting?.deity ?? "").toLowerCase();
    const elements = actor.system.fairyElements ?? [];
    const isCreature = actor.type !== "character";
    const filter = this.filter.toLowerCase();
    const rows = [];
    for ( const e of entries ) {
      const s = e.system ?? {};
      let available = (s.level ?? 0) <= maxLevel;
      let reason = available ? "" : t("SW25.Spellbook.TooHigh", { level: s.level ?? 0 });
      if ( system === "divine" && (s.subsystem === "special") ) {
        const d = (s.deity ?? "").toLowerCase();
        if ( !deity || !d || !deity.includes(d) ) { available = false; reason = t("SW25.Spellbook.OtherDeity", { deity: s.deity }); }
      }
      if ( system === "divine" && s.barbarous && !isCreature && !e.owned ) { available = false; reason = t("SW25.Spellbook.Barbarous"); }
      if ( (system === "fairy") && s.subsystem && (s.subsystem !== "basic") && !isCreature ) {
        if ( !elements.includes(s.subsystem) ) { available = false; reason = t("SW25.Spellbook.ElementNotChosen"); }
      }
      if ( e.owned ) {
        available = true;
        reason = "";
      }
      if ( !available && !this.showAll ) continue;
      if ( filter && !e.name.toLowerCase().includes(filter) && !(s.summary ?? "").toLowerCase().includes(filter) ) continue;
      const tags = CONFIG.SW25.abilityTags;
      rows.push({
        ...e,
        level: s.level ?? 0,
        cost: s.cost?.text || (Number.isInteger(s.cost?.mp) ? `MP${s.cost.mp}` : ""),
        target: s.target?.text ?? "",
        range: s.rangeArea?.text ?? "",
        duration: s.duration?.text ?? "",
        resistance: s.resistance ? game.i18n.localize(SW25.resistance[s.resistance] ?? s.resistance) : "",
        summary: s.summary ?? "",
        marks: `${s.minorAction ? tags.minor.icon : ""}${s.combatPrep ? tags.prep.icon : ""}`,
        tag: s.subsystem === "special" ? s.deity : (s.subsystem && (s.subsystem !== "basic") ? game.i18n.localize(SW25.fairyElements[s.subsystem] ?? s.subsystem) : ""),
        magisphere: s.magisphere ? game.i18n.localize(SW25.magispheres[s.magisphere] ?? s.magisphere) : "",
        available,
        reason,
        expanded: this.expanded.has(e.uuid)
      });
    }
    rows.sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));
    for ( const row of rows ) if ( row.expanded ) row.entry = await this.#entry(row.uuid);
    const groups = [];
    for ( const row of rows ) {
      let group = groups.find(g => g.level === row.level);
      if ( !group ) groups.push(group = { level: row.level, label: t("SW25.Spellbook.LevelN", { level: row.level }), rows: [] });
      group.rows.push(row);
    }
    const mp = actor.system.mp ?? { value: 0, max: 0 };
    return {
      groups,
      count: rows.length,
      magic: casting ? {
        power: casting.power, check: casting.check, level: casting.level,
        mpValue: mp.value, mpMax: mp.max, mpPct: mp.max ? Math.clamp(Math.round((mp.value / mp.max) * 100), 0, 100) : 0
      } : null,
      isFairy: system === "fairy" && (actor.type === "character"),
      elements: Object.entries(SW25.fairyElements).map(([k, l]) => ({ key: k, label: l, active: elements.includes(k) })),
      elementCount: elements.length,
      isDivine: system === "divine",
      deity: actor.system.deity ?? casting?.deity ?? "",
      deities: Object.keys(SW25.deities ?? {})
    };
  }

  /**
   * Known and learnable class abilities.
   * @param {object} tab
   */
  async #learnedContext(tab) {
    const actor = this.actor;
    const type = tab.id;
    const tags = CONFIG.SW25.abilityTags;
    const marks = s => `${s.minorAction || (type === "technique") ? tags.minor.icon : ""}${s.combatPrep ? tags.prep.icon : ""}`;
    const known = actor.items.filter(i => i.type === type)
      .sort((a, b) => (a.system.level - b.system.level) || a.name.localeCompare(b.name))
      .map(i => ({
        uuid: i.uuid, id: i.id, name: i.name, img: i.img, level: i.system.level, summary: i.system.summary, owned: true,
        detail: this.#abilityDetail(type, i.system), marks: marks(i.system), expanded: this.expanded.has(i.uuid)
      }));
    const knownNames = new Set(known.map(k => k.name));
    const pack = game.packs.get(PACKS.learned);
    const learnable = [];
    const filter = this.filter.toLowerCase();
    if ( pack ) {
      const index = await pack.getIndex({ fields: ABILITY_FIELDS });
      for ( const entry of index ) {
        if ( entry.type !== type ) continue;
        if ( knownNames.has(entry.name) ) continue;
        const level = entry.system?.level ?? 1;
        const available = level <= tab.level;
        if ( !available && !this.showAll ) continue;
        if ( filter && !entry.name.toLowerCase().includes(filter) && !(entry.system?.summary ?? "").toLowerCase().includes(filter) ) continue;
        learnable.push({
          uuid: entry.uuid, name: entry.name, img: entry.img, level, summary: entry.system?.summary ?? "",
          available, reason: available ? "" : t("SW25.Spellbook.TooHigh", { level }),
          detail: this.#abilityDetail(type, entry.system ?? {}), marks: marks(entry.system ?? {}), expanded: this.expanded.has(entry.uuid)
        });
      }
    }
    learnable.sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));
    for ( const row of [...known, ...learnable] ) if ( row.expanded ) row.entry = await this.#entry(row.uuid);
    const info = actor.system.learned?.[type] ?? { count: known.length, max: tab.level };
    const rhythmData = ["spellsong", "finale"].includes(type) ? actor.system.rhythm : null;
    return {
      learned: true,
      learnedLists: [
        { key: "known", label: "SW25.Spellbook.Known", empty: "SW25.Spellbook.NoneKnown", rows: known },
        { key: "learnable", label: "SW25.Spellbook.Learnable", empty: "SW25.Spellbook.NothingFound", rows: learnable }
      ],
      count: info.count,
      max: info.max,
      canLearn: info.count < info.max,
      classLabel: CONFIG.SW25.classes[tab.classKey]?.label ?? "",
      classLevel: tab.level,
      detailLabel: this.#detailLabel(type),
      rhythm: rhythmData ? Object.entries(CONFIG.SW25.rhythms).map(([key, cfg]) => ({ key, icon: cfg.icon, label: cfg.label, value: rhythmData[key] ?? 0 })) : null,
      cards: type === "evocation" ? Object.entries(actor.system.cards ?? {}).map(([color, ranks]) => ({
        color, label: CONFIG.SW25.cardColors[color], ranks: Object.entries(ranks).map(([rank, value]) => ({ rank, value }))
      })) : null
    };
  }

  /** Column label of the ability detail. */
  #detailLabel(type) {
    return {
      technique: "SW25.Entry.Cost", finale: "SW25.Entry.Cost", evocation: "SW25.Entry.Cards", stunt: "SW25.Stunt.Action", spellsong: "SW25.Entry.BaseRhythm"
    }[type] ?? "";
  }

  /** Short detail text of a class ability. */
  #abilityDetail(type, s) {
    return abilityDetail(type, s);
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    keyboardActions(this.element);
    const input = this.element.querySelector("input[name=filter]");
    input?.addEventListener("input", foundry.utils.debounce(ev => {
      this.filter = ev.target.value;
      this.render();
    }, 250));
    if ( input && this.filter ) {
      input.focus();
      input.setSelectionRange(this.filter.length, this.filter.length);
    }
    // Rows can be dragged onto a sheet (learn / add to the sheet) or the hotbar
    for ( const row of this.element.querySelectorAll("tr.swp-row[data-uuid]") ) {
      row.draggable = true;
      row.addEventListener("dragstart", ev => {
        ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: row.dataset.uuid }));
      });
    }
    this.element.querySelector("input[name=deity]")?.addEventListener("change", async ev => {
      await this.actor.update({ "system.deity": ev.target.value });
      this.render();
    });
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /** Resolve the document of a row. */
  async #doc(target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    return uuid ? fromUuid(uuid) : null;
  }

  static async #onCast(event, target) {
    const spell = await this.#doc(target);
    if ( spell ) await castSpell(this.actor, spell, { event });
    this.render();
  }

  static async #onView(event, target) {
    const doc = await this.#doc(target);
    doc?.sheet.render(true);
  }

  static #onExpand(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    if ( !uuid ) return;
    if ( this.expanded.has(uuid) ) this.expanded.delete(uuid);
    else this.expanded.add(uuid);
    return this.render();
  }

  static async #onFavorite(event, target) {
    const doc = await this.#doc(target);
    if ( !doc ) return;
    if ( doc.parent === this.actor ) await doc.delete();
    else await this.actor.createEmbeddedDocuments("Item", [doc.toObject()]);
    this.render();
  }

  static async #onLearn(event, target) {
    const doc = await this.#doc(target);
    if ( !doc ) return;
    const info = this.actor.system.learned?.[doc.type];
    if ( info && (info.count >= info.max) && !event.shiftKey ) {
      return ui.notifications.warn(t("SW25.Warn.TooManyLearned", { name: doc.name }));
    }
    await this.actor.createEmbeddedDocuments("Item", [doc.toObject()]);
    this.render();
  }

  static async #onUse(event, target) {
    const doc = await this.#doc(target);
    if ( doc ) await doc.use({ event, actor: this.actor });
    this.render();
  }

  static async #onForget(event, target) {
    const doc = await this.#doc(target);
    if ( doc?.parent === this.actor ) await doc.deleteDialog();
    this.render();
  }

  static #onTab(event, target) {
    this.activeTab = target.dataset.tab;
    this.render();
  }

  static #onToggleAll() {
    this.showAll = !this.showAll;
    this.render();
  }

  static #onOpenPack(event, target) {
    game.packs.get(PACKS[target.dataset.kind] ?? PACKS.magic)?.render(true);
  }

  static async #onElement(event, target) {
    const key = target.dataset.element;
    const set = new Set(this.actor.system.fairyElements ?? []);
    if ( set.has(key) ) set.delete(key);
    else if ( set.size < 4 ) set.add(key);
    else return ui.notifications.warn(t("SW25.Warn.FairyElements"));
    await this.actor.update({ "system.fairyElements": [...set] });
    this.render();
  }

  static async #onRhythm(event, target) {
    const key = target.dataset.key;
    const delta = Number(target.dataset.delta) || 0;
    const current = this.actor.system.rhythm?.[key] ?? 0;
    await this.actor.update({ [`system.rhythm.${key}`]: Math.max(0, current + delta) });
    this.render();
  }
}
