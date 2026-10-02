import { fadeWhileDragging, keyboardActions, t } from "../../helpers/utils.mjs";
import bestiary from "./browser/bestiary.mjs";
import spells from "./browser/spells.mjs";
import feats from "./browser/feats.mjs";
import abilities from "./browser/abilities.mjs";
import equipment from "./browser/equipment.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Browser tabs, in display order. */
const TABS = { spells, feats, abilities, equipment, bestiary };

/** Records and documents of each tab, built once per session. */
const CACHE = {};

/** Filters, sort and expanded rows of each tab, kept between openings in this session. */
const STATE = {};

/**
 * Compendium browser (like the PF2e one): one tab per kind of content — spells, combat feats, class abilities,
 * equipment and the bestiary — with faceted filters that show how many entries each choice gives, a text search
 * (names, or the whole text), sortable results that expand into the rulebook entry, drag & drop onto sheets and the
 * scene, and a button adding the entry to the character in use.
 *
 * A tab is a plain object (see ./browser/*.mjs): its packs, a `record(doc)` builder, `facets`, `columns`,
 * `detail(record, doc)` and optional `rowTools`/`barTools`.
 */
export default class CompendiumBrowser extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(options = {}) {
    super(options);
    /** Tab shown. */
    this.tabId = TABS[options.tab] ? options.tab : "spells";
    /** Character the filters "for …" and the "add" button refer to (set when opened from a sheet). */
    this.refActorOverride = options.actor ?? null;
  }

  /** Width of the collapsed title bar. */
  static #COLLAPSED_WIDTH = 320;

  /** Is the window collapsed to its title bar? */
  #collapsed = false;

  /** Size of the window before it collapsed. */
  #expandedSize = null;

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "sw25-compendium-browser",
    classes: ["sw25", "swp", "swp-browser", "swp-collapsible", "themed", "theme-light"],
    position: { width: 1120, height: 860 },
    // Instead of the core minimization, the window collapses to a translucent title bar (like the resource tracker)
    window: { title: "SW25.Browser.Title", icon: "fa-solid fa-book-open-reader", resizable: true, minimizable: false },
    actions: {
      collapse: CompendiumBrowser.#onCollapse,
      browserTab: CompendiumBrowser.#onTab,
      toggleFacet: CompendiumBrowser.#onToggleFacet,
      resetFilters: CompendiumBrowser.#onResetFilters,
      sortBy: CompendiumBrowser.#onSortBy,
      toggleRow: CompendiumBrowser.#onToggleRow,
      openEntry: CompendiumBrowser.#onOpenEntry,
      addEntry: CompendiumBrowser.#onAddEntry,
      barTool: CompendiumBrowser.#onBarTool,
      rowTool: CompendiumBrowser.#onRowTool
    }
  };

  /** @override */
  static PARTS = {
    tabs: { template: "systems/swordworld25/templates/apps/browser/tabs.hbs" },
    filters: { template: "systems/swordworld25/templates/apps/browser/filters.hbs", scrollable: [""] },
    results: { template: "systems/swordworld25/templates/apps/browser/results.hbs", scrollable: [".swp-best-scroll"] }
  };

  /** The tab definitions. */
  static get TABS() {
    return TABS;
  }

  /**
   * Open the browser (one window), optionally on a tab with some filters set.
   * @param {string} [tab]                  spells | feats | abilities | equipment | bestiary
   * @param {object} [options]
   * @param {object} [options.filters]      Facet values to set: { facetKey: value | value[] | {min, max} }
   * @param {Actor} [options.actor]         Reference character (sheet the browser was opened from)
   * @returns {Promise<CompendiumBrowser>}
   */
  static async open(tab, { filters = null, actor = null } = {}) {
    let app = foundry.applications.instances.get("sw25-compendium-browser");
    if ( !app ) app = new this({ tab, actor });
    else {
      if ( TABS[tab] ) app.tabId = tab;
      if ( actor ) app.refActorOverride = actor;
    }
    if ( filters ) app.#preset(filters);
    await app.render({ force: true });
    app.#setCollapsed(false);
    app.bringToFront();
    return app;
  }

  /* -------------------------------------------- */
  /*  State                                       */
  /* -------------------------------------------- */

  /** Definition of the current tab. */
  get tab() {
    return TABS[this.tabId];
  }

  /** State of the current tab. */
  get state() {
    return (STATE[this.tabId] ??= {
      filters: CompendiumBrowser.#blankFilters(this.tab),
      sort: { ...(this.tab.defaultSort ?? { key: "name", dir: 1 }) },
      expanded: new Set()
    });
  }

  /** Character of reference: the sheet the browser was opened from, else the selected token or own character. */
  get refActor() {
    const actor = this.refActorOverride ?? canvas.tokens?.controlled?.[0]?.actor ?? game.user.character ?? null;
    return actor?.type === "character" ? actor : null;
  }

  /**
   * Empty filters of a tab.
   * @param {object} tab
   * @returns {object}
   */
  static #blankFilters(tab) {
    const values = {};
    for ( const facet of tab.facets ) values[facet.key] = CompendiumBrowser.#blankValue(facet);
    return { text: "", deep: false, values };
  }

  /** Empty value of a facet. */
  static #blankValue(facet) {
    switch ( facet.type ) {
      case "chips": return new Set();
      case "range": return { min: null, max: null };
      case "toggle": return false;
      case "radio": return facet.default ?? "any";
      default: return "";
    }
  }

  /**
   * Replace the filters of the current tab by a preset.
   * @param {object} values
   */
  #preset(values) {
    const state = this.state;
    state.filters = CompendiumBrowser.#blankFilters(this.tab);
    state.expanded.clear();
    for ( const [key, value] of Object.entries(values) ) {
      const facet = this.tab.facets.find(f => f.key === key);
      if ( !facet ) continue;
      if ( facet.type === "chips" ) state.filters.values[key] = new Set(Array.isArray(value) ? value : [value]);
      else state.filters.values[key] = value;
    }
  }

  /**
   * Records and documents of a tab (loaded once).
   * @param {string} tabId
   * @returns {Promise<{records: object[], docs: Map<string, Document>}>}
   */
  static async load(tabId) {
    if ( CACHE[tabId] ) return CACHE[tabId];
    const tab = TABS[tabId];
    const docs = new Map();
    const records = [];
    for ( const id of tab.packs ) {
      const pack = game.packs.get(id);
      if ( !pack ) continue;
      for ( const doc of await pack.getDocuments() ) {
        if ( tab.accept && !tab.accept(doc) ) continue;
        const record = tab.record(doc);
        if ( !record ) continue;
        record.uuid = doc.uuid;
        record.id = doc.id;
        record.name ??= doc.name;
        record.img ??= doc.img;
        record.book ??= doc.system?.source?.book ?? doc.system?.details?.source?.book ?? "";
        record.page ??= doc.system?.source?.page ?? doc.system?.details?.source?.page ?? null;
        record.nameText = record.name.toLowerCase();
        record.deepText = [record.name, record.searchText ?? "", plain(doc.system?.summary), plain(doc.system?.description)]
          .join(" · ").toLowerCase();
        docs.set(doc.uuid, doc);
        records.push(record);
      }
    }
    records.sort((a, b) => ((a.level ?? 0) - (b.level ?? 0)) || a.name.localeCompare(b.name));
    return (CACHE[tabId] = { records, docs });
  }

  /* -------------------------------------------- */
  /*  Filtering                                   */
  /* -------------------------------------------- */

  /**
   * Does a record pass one option of a facet?
   * @param {object} facet
   * @param {object} record
   * @param {*} value
   * @param {Actor|null} ref
   * @returns {boolean}
   */
  static #test(facet, record, value, ref) {
    if ( facet.test ) return facet.test(record, value, ref);
    const values = facet.values ? facet.values(record) : record[facet.key];
    return Array.isArray(values) ? values.includes(value) : (values === value);
  }

  /**
   * Does a record pass the filters (optionally ignoring one facet)?
   * @param {object} tab
   * @param {object} record
   * @param {object} filters
   * @param {Actor|null} ref
   * @param {string} [skip]
   * @returns {boolean}
   */
  static #passes(tab, record, filters, ref, skip = "") {
    const text = filters.text.trim().toLowerCase();
    if ( text && !(filters.deep ? record.deepText : record.nameText).includes(text) ) return false;
    for ( const facet of tab.facets ) {
      if ( facet.key === skip ) continue;
      if ( facet.visible && !facet.visible(ref) ) continue;
      const value = filters.values[facet.key];
      switch ( facet.type ) {
        case "chips": {
          if ( !value?.size ) break;
          const test = v => CompendiumBrowser.#test(facet, record, v, ref);
          if ( facet.mode === "all" ? ![...value].every(test) : ![...value].some(test) ) return false;
          break;
        }
        case "select":
          if ( value && !CompendiumBrowser.#test(facet, record, value, ref) ) return false;
          break;
        case "radio":
          if ( value && (value !== (facet.default ?? "any")) && !facet.test(record, value, ref) ) return false;
          break;
        case "range": {
          const { min, max } = value ?? {};
          if ( !Number.isFinite(min) && !Number.isFinite(max) ) break;
          const n = facet.get(record);
          if ( !Number.isFinite(n) ) return false;
          if ( Number.isFinite(min) && (n < min) ) return false;
          if ( Number.isFinite(max) && (n > max) ) return false;
          break;
        }
        case "toggle":
          if ( value && !facet.test(record, ref) ) return false;
          break;
      }
    }
    return true;
  }

  /** Are any filters set in the current tab? */
  #hasFilters() {
    const { filters } = this.state;
    if ( filters.text ) return true;
    return this.tab.facets.some(facet => {
      const v = filters.values[facet.key];
      switch ( facet.type ) {
        case "chips": return v?.size > 0;
        case "range": return Number.isFinite(v?.min) || Number.isFinite(v?.max);
        case "toggle": return !!v;
        case "radio": return v && (v !== (facet.default ?? "any"));
        default: return !!v;
      }
    });
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const tab = this.tab;
    const { records, docs } = await CompendiumBrowser.load(this.tabId);
    const state = this.state;
    const ref = this.refActor;
    const results = records.filter(r => CompendiumBrowser.#passes(tab, r, state.filters, ref));
    const column = tab.columns.find(c => c.key === state.sort.key) ?? tab.columns.find(c => c.sort);
    if ( column?.sort ) {
      const dir = state.sort.dir;
      results.sort((a, b) => {
        const va = column.sort(a);
        const vb = column.sort(b);
        if ( (va === null) || (va === undefined) ) return ((vb === null) || (vb === undefined)) ? a.name.localeCompare(b.name) : 1;
        if ( (vb === null) || (vb === undefined) ) return -1;
        const c = (typeof va === "string") ? va.localeCompare(vb) : (va - vb);
        return (c * dir) || a.name.localeCompare(b.name);
      });
    }
    return { tab, records, docs, results, state, ref, total: records.length, found: results.length };
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if ( partId === "tabs" ) {
      context.tabs = Object.entries(TABS).map(([id, tab]) => ({ id, label: t(tab.label), icon: tab.icon, active: id === this.tabId }));
    }
    if ( partId === "filters" ) Object.assign(context, this.#filterContext(context));
    if ( partId === "results" ) Object.assign(context, await this.#resultContext(context));
    return context;
  }

  /**
   * Facets with the number of entries each choice gives.
   * @param {object} context
   * @returns {object}
   */
  #filterContext({ tab, records, state, ref }) {
    const f = state.filters;
    const facets = [];
    for ( const facet of tab.facets ) {
      if ( facet.visible && !facet.visible(ref) ) continue;
      const base = records.filter(r => CompendiumBrowser.#passes(tab, r, f, ref, facet.key));
      const value = f.values[facet.key];
      const data = {
        key: facet.key, type: facet.type, label: t(facet.label, facet.labelData?.(ref) ?? {}), hint: facet.hint ? t(facet.hint) : "",
        [facet.type]: true
      };
      if ( ["chips", "select", "radio"].includes(facet.type) ) {
        const options = (typeof facet.options === "function" ? facet.options(records, ref) : facet.options).map(o => {
          const count = base.filter(r => CompendiumBrowser.#test(facet, r, o.value, ref)).length;
          const on = facet.type === "chips" ? value.has(o.value) : (value === o.value);
          return { ...o, label: t(o.label), count, on };
        });
        data.options = (facet.type === "radio") ? options : options.filter(o => o.count || o.on);
        if ( facet.sortByLabel ) data.options.sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
        if ( !data.options.length && (facet.type !== "radio") ) continue;
      }
      if ( facet.type === "range" ) {
        data.min = value?.min ?? "";
        data.max = value?.max ?? "";
        data.placeholderMin = facet.placeholderMin ?? "";
        data.placeholderMax = facet.placeholderMax ?? "";
        data.onlyMax = facet.onlyMax ?? false;
      }
      if ( facet.type === "toggle" ) {
        data.checked = !!value;
        data.count = base.filter(r => facet.test(r, ref)).length;
      }
      facets.push(data);
    }
    return {
      f,
      facets,
      searchPlaceholder: t(tab.search ?? "SW25.Browser.Search"),
      deepLabel: t(tab.deep ?? "SW25.Browser.SearchText"),
      hasFilters: this.#hasFilters()
    };
  }

  /**
   * Rows of the result table.
   * @param {object} context
   * @returns {Promise<object>}
   */
  async #resultContext({ tab, results, docs, state, ref }) {
    const canAdd = !!ref?.isOwner && (tab.documentName === "Item");
    const columns = tab.columns.map(c => ({
      key: c.key, label: t(c.label), tooltip: c.tooltip ? t(c.tooltip) : "", cls: c.cls ?? "", sortable: !!c.sort,
      sorted: state.sort.key === c.key, sortDir: state.sort.dir === 1 ? "up" : "down"
    }));
    const rowTools = [
      { action: "openEntry", icon: "fa-solid fa-eye", tooltip: t("SW25.Browser.Open") },
      ...(canAdd ? [{ action: "addEntry", icon: "fa-solid fa-circle-plus", tooltip: t("SW25.Browser.AddTo", { name: ref.name }) }] : []),
      ...((tab.rowTools?.() ?? []).map(tool => ({ ...tool, action: "rowTool", tool: tool.id, tooltip: t(tool.tooltip) })))
    ];
    const rows = [];
    for ( const record of results ) {
      const expanded = state.expanded.has(record.uuid);
      const cells = tab.columns.map(c => {
        const cell = c.cell ? c.cell(record) : { text: record[c.key] ?? "" };
        return { cls: c.cls ?? "", name: c.type === "name", level: c.type === "level", ...(typeof cell === "object" ? cell : { text: cell }) };
      });
      rows.push({
        uuid: record.uuid, img: record.img, name: record.name, subtitle: record.subtitle ?? "", expanded, cells,
        detail: expanded ? await tab.detail(record, docs.get(record.uuid), ref) : ""
      });
    }
    return {
      columns,
      rows,
      rowTools,
      colspan: columns.length + 1,
      barTools: this.#barTools().map(tool => ({ id: tool.id, icon: tool.icon, tooltip: t(tool.tooltip) })),
      refName: canAdd ? ref.name : "",
      found: results.length
    };
  }

  /** @override */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    // A collapse arrow before the close button; double-clicking the title bar collapses or expands the window
    const header = frame.querySelector(".window-header");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "collapse";
    header?.querySelector("[data-action=close]")?.before(button);
    header?.addEventListener("dblclick", event => {
      if ( event.target.closest("button, a, input") ) return;
      event.preventDefault();
      this.#setCollapsed(!this.#collapsed);
    });
    return frame;
  }

  /** @override */
  _updateFrame(options) {
    super._updateFrame(options);
    this.#syncCollapsed();
  }

  /**
   * Collapse the window to a translucent title bar, or give it back its size.
   * @param {boolean} collapsed
   */
  #setCollapsed(collapsed) {
    if ( !this.rendered || (collapsed === this.#collapsed) ) return;
    if ( collapsed ) {
      const { width, height } = this.position;
      this.#expandedSize = { width, height };
    }
    this.#collapsed = collapsed;
    this.#syncCollapsed();
    if ( collapsed ) this.setPosition({ width: CompendiumBrowser.#COLLAPSED_WIDTH, height: "auto" });
    else this.setPosition({ ...this.#expandedSize });
  }

  /** Show the collapsed state on the frame: class, arrow button and title (with the tab while collapsed). */
  #syncCollapsed() {
    const el = this.element;
    if ( !el ) return;
    const collapsed = this.#collapsed;
    el.classList.toggle("collapsed", collapsed);
    const button = el.querySelector(".window-header [data-action=collapse]");
    if ( button ) {
      const label = t(collapsed ? "SW25.Window.Expand" : "SW25.Window.Collapse");
      button.className = `header-control icon fa-solid ${collapsed ? "fa-chevron-down" : "fa-chevron-up"}`;
      button.dataset.tooltip = label;
      button.setAttribute("aria-label", label);
    }
    if ( this.window.title ) this.window.title.innerText = collapsed ? `${this.title} · ${t(this.tab.label)}` : this.title;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    keyboardActions(this.element);
    const f = this.state.filters;
    if ( options.parts.includes("filters") ) {
      this.element.querySelector(".swp-best-filters input[name=text]")?.addEventListener("input", foundry.utils.debounce(ev => {
        f.text = ev.target.value;
        this.render({ parts: ["results", "filters"] });
      }, 250));
      for ( const input of this.element.querySelectorAll(".swp-best-filters [data-filter]") ) {
        input.addEventListener("change", ev => this.#onFilterChange(ev.currentTarget));
      }
    }
    // Rows can be dragged onto sheets, the directories or the scene; the browser fades meanwhile
    fadeWhileDragging(this.element);
    for ( const row of this.element.querySelectorAll("tr.swp-row[data-uuid]") ) {
      row.draggable = true;
      row.addEventListener("dragstart", ev => {
        ev.dataTransfer.setData("text/plain", JSON.stringify({ type: this.tab.documentName, uuid: row.dataset.uuid }));
      });
    }
  }

  /**
   * A filter control changed.
   * @param {HTMLElement} el
   */
  #onFilterChange(el) {
    const f = this.state.filters;
    const key = el.dataset.filter;
    const bound = el.dataset.bound;
    if ( key === "deep" ) f.deep = el.checked;
    else if ( bound ) {
      const range = f.values[key] ??= { min: null, max: null };
      range[bound] = (el.value === "") ? null : Number(el.value);
    }
    else if ( el.type === "checkbox" ) f.values[key] = el.checked;
    else f.values[key] = el.value;
    this.render({ parts: ["results", "filters"] });
  }

  /** @override */
  _preSyncPartState(partId, newElement, priorElement, state) {
    super._preSyncPartState(partId, newElement, priorElement, state);
    // Keep the caret in the search field while the filters re-render
    const focused = document.activeElement;
    if ( (partId === "filters") && (focused?.name === "text") && priorElement.contains(focused) ) {
      state.textCaret = focused.selectionStart;
    }
  }

  /** @override */
  _syncPartState(partId, newElement, priorElement, state) {
    super._syncPartState(partId, newElement, priorElement, state);
    if ( (partId === "filters") && Number.isInteger(state.textCaret) ) {
      const input = newElement.querySelector("input[name=text]");
      input?.focus();
      input?.setSelectionRange(state.textCaret, state.textCaret);
    }
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onCollapse() {
    this.#setCollapsed(!this.#collapsed);
  }

  static #onTab(event, target) {
    const id = target.dataset.tab;
    if ( !TABS[id] || (id === this.tabId) ) return;
    this.tabId = id;
    return this.render({ parts: ["tabs", "filters", "results"] });
  }

  static #onToggleFacet(event, target) {
    const { facet, value } = target.dataset;
    const def = this.tab.facets.find(f => f.key === facet);
    const set = this.state.filters.values[facet];
    if ( !(set instanceof Set) ) return;
    const v = def?.numeric ? Number(value) : value;
    if ( set.has(v) ) set.delete(v);
    else set.add(v);
    return this.render({ parts: ["results", "filters"] });
  }

  static #onResetFilters() {
    const state = this.state;
    state.filters = CompendiumBrowser.#blankFilters(this.tab);
    return this.render({ parts: ["results", "filters"] });
  }

  static #onSortBy(event, target) {
    const key = target.dataset.key;
    const state = this.state;
    state.sort = { key, dir: (state.sort.key === key) ? -state.sort.dir : 1 };
    return this.render({ parts: ["results"] });
  }

  static #onToggleRow(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    if ( !uuid ) return;
    const expanded = this.state.expanded;
    if ( expanded.has(uuid) ) expanded.delete(uuid);
    else expanded.add(uuid);
    return this.render({ parts: ["results"] });
  }

  static async #onOpenEntry(event, target) {
    const doc = await fromUuid(target.closest("[data-uuid]")?.dataset.uuid);
    doc?.sheet.render(true);
  }

  /** Add the entry to the character of reference, as dropping it on its sheet would. */
  static async #onAddEntry(event, target) {
    const actor = this.refActor;
    const item = await fromUuid(target.closest("[data-uuid]")?.dataset.uuid);
    if ( !actor?.isOwner || !(item instanceof Item) ) return;
    const created = await actor.sheet._onDropItem({ target: null, shiftKey: event.shiftKey }, item);
    if ( created ) ui.notifications.info(t("SW25.Browser.Added", { name: item.name, actor: actor.name }));
  }

  static #onBarTool(event, target) {
    return this.#barTools().find(tool => tool.id === target.dataset.tool)?.run?.(this, event);
  }

  /** Tools of the result bar: the tab's own, or opening its compendium. */
  #barTools() {
    if ( this.tab.barTools ) return this.tab.barTools();
    return this.tab.packs.map(id => {
      const pack = game.packs.get(id);
      return pack ? { id, icon: "fa-solid fa-book-open", tooltip: pack.title, run: () => pack.render(true) } : null;
    }).filter(Boolean);
  }

  static async #onRowTool(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    const tool = this.tab.rowTools?.().find(t => t.id === target.dataset.tool);
    if ( tool && uuid ) await tool.run(uuid, this, event);
  }
}

/**
 * Plain text of an HTML string.
 * @param {string} html
 * @returns {string}
 */
function plain(html) {
  return String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
