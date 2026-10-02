import { gamels, PAPER_DIALOG, t } from "../../helpers/utils.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Sample characters built by tools/build-packs.mjs from data/pregens.json. */
const DATA_PATH = "systems/swordworld25/packs/pregens.json";

const ABILITY_KEYS = ["dex", "agi", "str", "vit", "int", "spi"];

/** Aptitude marks of the "Sample Character Features" table (CR III p.12). */
const APTITUDE_MARKS = ["–", "△", "○", "◎"];

/** Learned class abilities listed in the details. */
const CLASS_ABILITY_TYPES = ["technique", "spellsong", "finale", "stunt", "evocation"];

/** Stored HP/MP value meaning "full" (see SW25Actor.FULL_RESOURCE). */
const FULL_RESOURCE = 9999;

let pregenCache = null;

/**
 * Load the sample characters.
 * @returns {Promise<object[]>}
 */
export async function loadPregens() {
  pregenCache ??= (async () => {
    const response = await fetch(foundry.utils.getRoute(DATA_PATH), { cache: "no-cache" });
    if ( !response.ok ) throw new Error(`${DATA_PATH}: ${response.status}`);
    const data = await response.json();
    return data.pregens ?? [];
  })().catch(err => {
    console.error("SW25 | Could not load the sample characters", err);
    pregenCache = null;
    return [];
  });
  return pregenCache;
}

/**
 * Item data of a sample character: copies of the compendium entries with the character's own changes (class
 * levels, equipped gear, quantities…). Names missing from the compendiums become plain items.
 * @param {object} pregen
 * @returns {Promise<object[]>}
 */
export async function pregenItemData(pregen) {
  const byPack = new Map();
  for ( const entry of pregen.items ) {
    if ( !entry.uuid ) continue;
    const [, scope, name, , id] = entry.uuid.split(".");
    const packId = `${scope}.${name}`;
    if ( !byPack.has(packId) ) byPack.set(packId, new Set());
    byPack.get(packId).add(id);
  }
  const docs = new Map();
  await Promise.all([...byPack].map(async ([packId, ids]) => {
    const pack = game.packs.get(packId);
    if ( !pack ) return;
    for ( const doc of await pack.getDocuments({ _id__in: [...ids] }) ) docs.set(doc.uuid, doc);
  }));
  return pregen.items.map(entry => {
    const doc = entry.uuid ? docs.get(entry.uuid) : null;
    const data = doc ? game.items.fromCompendium(doc) : { name: entry.name, type: entry.type, system: {} };
    data.name = entry.name;
    data.system = foundry.utils.mergeObject(data.system ?? {}, entry.system ?? {}, { inplace: false });
    return data;
  });
}

/**
 * Is the character still empty (no race, no class): the moment to pick a sample character.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isBlankCharacter(actor) {
  return !actor.items.some(i => ["race", "class"].includes(i.type));
}

/**
 * Turn a character into a sample character: race, abilities, classes, feats, equipment, money and languages are
 * replaced; name (unless still the default one), portrait, personal details and biography are kept.
 * @param {Actor} actor
 * @param {object} pregen
 * @param {object} [options]
 * @param {boolean} [options.mount=false]  Also create the mount of a Rider (with its mount equipment) and make this
 *                                          character its jockey
 * @returns {Promise<boolean>}
 */
export async function applyPregen(actor, pregen, { mount = false } = {}) {
  const items = await pregenItemData(pregen);
  // Mount equipment (barding, contracts) goes onto the mount when it is created
  const withMount = mount && !!pregen.mount && game.user.can("ACTOR_CREATE");
  const isMountGear = i => (i.type === "gear") && (i.system?.itemType === "mountItem");
  const own = withMount ? items.filter(i => !isMountGear(i)) : items;
  const typeLabel = game.i18n.localize(CONFIG.Actor.typeLabels?.character ?? "TYPES.Actor.character");
  const defaultName = game.i18n.format("DOCUMENT.New", { type: typeLabel });
  const keepName = actor.name && !actor.name.startsWith(defaultName);

  if ( actor.items.size ) await actor.deleteEmbeddedDocuments("Item", actor.items.map(i => i.id));
  await actor.update({
    ...(keepName ? {} : { name: pregen.name, "prototypeToken.name": pregen.name }),
    system: {
      ...foundry.utils.deepClone(pregen.system),
      hp: { value: FULL_RESOURCE },
      mp: { value: FULL_RESOURCE },
      soulscars: 0,
      fumbles: 0,
      swordShards: 0,
      rhythm: { up: 0, down: 0, heart: 0 },
      daily: { changeFate: false, hpConversion: 0, wings: 0 },
      settings: { evasionClass: "", magicPowerAbility: "int" }
    },
    "flags.swordworld25.pregen": pregen.id
  });
  await actor.createEmbeddedDocuments("Item", own);

  if ( mount && pregen.mount ) await createMount(actor, pregen.mount, withMount ? items.filter(isMountGear) : []);
  ui.notifications.info(t("SW25.Pregen.Applied", { actor: actor.name, pregen: pregen.name }));
  if ( pregen.missing?.length ) {
    ui.notifications.warn(t("SW25.Pregen.Missing", { names: pregen.missing.join(", ") }));
  }
  return true;
}

/**
 * Create a Rider's mount from the Mounts compendium, owned like the character and ridden by it.
 * @param {Actor} actor
 * @param {{uuid: string, name: string}} mount
 * @param {object[]} [gear]  Mount equipment item data
 */
async function createMount(actor, mount, gear = []) {
  if ( !game.user.can("ACTOR_CREATE") ) {
    ui.notifications.warn(t("SW25.Pregen.MountNoPermission", { name: mount.name }));
    return;
  }
  const source = await fromUuid(mount.uuid);
  if ( !source ) return;
  const data = game.actors.fromCompendium(source);
  data.name = `${source.name} (${actor.name})`;
  data.folder = actor.folder?.id ?? null;
  data.ownership = foundry.utils.deepClone(actor.ownership);
  foundry.utils.setProperty(data, "system.jockey", actor.uuid);
  foundry.utils.setProperty(data, "prototypeToken.name", data.name);
  data.items = [...(data.items ?? []), ...gear.map(i => ({ ...i, system: { ...i.system, equipped: true } }))];
  const created = await Actor.implementation.create(data);
  if ( created ) ui.notifications.info(t("SW25.Pregen.MountCreated", { name: created.name, actor: actor.name }));
}

/* -------------------------------------------- */

/**
 * "Choose a sample character" window of the character sheet (Easy Creation, CR I p.20): the sample characters of
 * the three core rulebooks as cards; a card opens the details with the full character and a button taking it.
 */
export default class PregenPicker extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * @param {object} options
   * @param {Actor} options.actor  Character receiving the sample character
   */
  constructor({ actor, ...options } = {}) {
    super(options);
    this.actor = actor;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sw25", "swp", "swp-pregens-app", "themed", "theme-light"],
    window: { icon: "fa-solid fa-users-viewfinder", resizable: true },
    position: { width: 980, height: 780 },
    actions: {
      filter: PregenPicker.#onFilter,
      details: PregenPicker.#onDetails,
      closeDetails: PregenPicker.#onCloseDetails,
      choose: PregenPicker.#onChoose
    }
  };

  /** @override */
  static PARTS = {
    body: { template: "systems/swordworld25/templates/apps/pregen-picker.hbs", scrollable: [".swp-pregens-grid", ".swp-pregen-modal-body"] }
  };

  /**
   * Open (or bring to front) the window for a character.
   * @param {Actor} actor
   * @returns {PregenPicker}
   */
  static open(actor) {
    const id = `sw25-pregens-${actor.id}`;
    const existing = foundry.applications.instances.get(id);
    if ( existing ) {
      existing.render({ force: true });
      existing.bringToFront();
      return existing;
    }
    const app = new this({ actor, id });
    app.render({ force: true });
    return app;
  }

  /** Shown tier: all | starting | advanced. */
  tier = "all";

  /** Id of the sample character shown in the details, if any. */
  selected = null;

  /** Characters built in memory for the details (derived values), by pregen id. */
  #previews = new Map();

  /** @override */
  get title() {
    return `${t("SW25.Pregen.Title")}: ${this.actor.name}`;
  }

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const pregens = await loadPregens();
    const counts = { all: pregens.length, starting: 0, advanced: 0 };
    for ( const p of pregens ) counts[p.tier] += 1;
    const shown = pregens.filter(p => (this.tier === "all") || (p.tier === this.tier));
    const context = {
      empty: !pregens.length,
      filters: ["all", "starting", "advanced"].map(id => ({
        id, label: t(`SW25.Pregen.Tier.${id}`), count: counts[id], active: this.tier === id
      })),
      groups: ["starting", "advanced"].map(tier => ({
        tier,
        label: t(`SW25.Pregen.Tier.${tier}`),
        hint: t(`SW25.Pregen.TierHint.${tier}`),
        pregens: shown.filter(p => p.tier === tier).map(p => this.#cardContext(p))
      })).filter(g => g.pregens.length)
    };
    const pregen = this.selected ? pregens.find(p => p.id === this.selected) : null;
    if ( pregen ) context.detail = await this.#detailContext(pregen);
    return context;
  }

  /**
   * Card of the list.
   * @param {object} p
   * @returns {object}
   */
  #cardContext(p) {
    return {
      id: p.id,
      name: p.name,
      img: p.img,
      level: p.level,
      race: p.race,
      classLine: p.classes.map(c => `${c.name} ${c.level}`).join(" · "),
      summary: p.summary,
      source: this.#sourceLabel(p.source),
      line: { key: p.roles.line, label: t(`SW25.Pregen.Line.${p.roles.line}`) },
      aptitudes: this.#aptitudes(p.roles)
    };
  }

  /** Healer / explorer / knowledge marks. */
  #aptitudes(roles) {
    return ["healer", "explorer", "knowledge"].map(key => {
      const value = Math.clamp(roles[key] ?? 0, 0, 3);
      return {
        key, value, mark: APTITUDE_MARKS[value], label: t(`SW25.Pregen.Role.${key}`),
        tooltip: `${t(`SW25.Pregen.Role.${key}`)}: ${t(`SW25.Pregen.Aptitude.${value}`)}`
      };
    });
  }

  /** "CR I p.23" */
  #sourceLabel(source) {
    const books = { CR1: "CR I", CR2: "CR II", CR3: "CR III" };
    return source?.book ? `${books[source.book] ?? source.book}${source.page ? ` p.${source.page}` : ""}` : "";
  }

  /**
   * The character built in memory, for derived values (HP, MP, evasion, attack values…).
   * @param {object} pregen
   * @returns {Promise<Actor>}
   */
  async #preview(pregen) {
    if ( !this.#previews.has(pregen.id) ) {
      const items = await pregenItemData(pregen);
      this.#previews.set(pregen.id, new Actor.implementation({
        name: pregen.name,
        type: "character",
        system: foundry.utils.deepClone(pregen.system),
        items: items.map(i => ({ ...i, _id: foundry.utils.randomID() }))
      }));
    }
    return this.#previews.get(pregen.id);
  }

  /**
   * Details of a sample character.
   * @param {object} pregen
   * @returns {Promise<object>}
   */
  async #detailContext(pregen) {
    const actor = await this.#preview(pregen);
    const sys = actor.system;
    const SW25 = CONFIG.SW25;
    const items = actor.items.contents;
    const byType = type => items.filter(i => i.type === type);
    const tip = item => item.system.summary || "";
    const magic = Object.values(sys.magic ?? {}).map(m => ({ label: m.classLabel, value: m.power }));
    const weapons = byType("weapon").map(w => {
      const mode = w.system.currentMode;
      const attack = w.system.attack;
      return {
        name: w.name, tip: tip(w), mode: mode.label, equipped: w.system.equipped,
        accuracy: attack?.accuracy, power: attack?.power ?? mode.power, critical: attack?.critical ?? mode.critical,
        extra: attack?.extraDamage
      };
    });
    const armor = byType("armor").map(a => ({ name: a.name, tip: tip(a), evasion: a.system.evasion, defense: a.system.defense }));
    const accessories = byType("gear").filter(g => g.system.equipped && g.system.equippedSlot).map(g => ({
      name: g.name, tip: tip(g), slot: t(SW25.accessorySlots[g.system.equippedSlot] ?? "SW25.Slot.other")
    }));
    const carried = byType("gear").filter(g => !(g.system.equipped && g.system.equippedSlot)).map(g => ({
      name: g.name, tip: tip(g), quantity: g.system.quantity > 1 ? g.system.quantity : null
    }));
    const languages = (sys.languages ?? []).map(l => {
      const cfg = SW25.languages[l.key];
      const name = cfg ? t(cfg.label) : l.name;
      const marks = [l.speak && (cfg?.speak !== false) ? t("SW25.Speak") : null, l.write && (cfg?.write !== false) ? t("SW25.Write") : null]
        .filter(Boolean).join(", ");
      return `${name}${l.key === "regional" && l.name ? ` (${l.name})` : ""}${marks ? ` — ${marks.toLowerCase()}` : ""}`;
    });
    const canMount = !!pregen.mount;
    return {
      ...this.#cardContext(pregen),
      tier: t(`SW25.Pregen.Tier.${pregen.tier}`),
      background: pregen.background,
      description: pregen.description,
      tips: pregen.tips,
      abilities: ABILITY_KEYS.map(k => ({
        key: k, label: t(SW25.abilities[k].label), abbr: t(SW25.abilities[k].abbr),
        value: sys.abilities[k].value, mod: sys.abilities[k].mod
      })),
      vitals: [
        { label: t("SW25.HP"), value: sys.hp.max, cls: "hp" },
        { label: t("SW25.MP"), value: sys.mp.max, cls: "mp" },
        { label: t("SW25.Pregen.Fortitude"), value: sys.fortitude },
        { label: t("SW25.Pregen.Willpower"), value: sys.willpower },
        { label: t("SW25.Evasion"), value: sys.evasion },
        { label: t("SW25.Defense"), value: sys.defense },
        { label: t("SW25.Pregen.Move"), value: sys.movement.normal }
      ],
      magic,
      classes: byType("class").sort((a, b) => b.system.level - a.system.level)
        .map(c => ({ name: c.name, level: c.system.level, tip: tip(c) })),
      feats: byType("feat").map(f => ({ name: f.name, tip: tip(f), auto: f.system.acquisition === "automatic" })),
      classAbilities: items.filter(i => CLASS_ABILITY_TYPES.includes(i.type))
        .map(i => ({ name: i.name, tip: tip(i), type: t(`TYPES.Item.${i.type}`) })),
      weapons,
      armor,
      accessories,
      carried,
      money: gamels(sys.money),
      languages,
      deity: sys.deity,
      mount: canMount ? {
        name: pregen.mount.name,
        allowed: game.user.can("ACTOR_CREATE")
      } : null,
      missing: pregen.missing ?? [],
      replace: this.actor.items.size > 0,
      canApply: this.actor.isOwner
    };
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Keyboard: Enter/Space open a card
    for ( const card of this.element.querySelectorAll(".swp-pregen-card") ) {
      card.addEventListener("keydown", event => {
        if ( !["Enter", " "].includes(event.key) ) return;
        event.preventDefault();
        card.click();
      });
    }
    this.element.querySelector(".swp-pregen-modal [data-action='choose']")?.focus();
  }

  /** Esc closes the details first, then the window. @override */
  async close(options = {}) {
    if ( options.closeKey && this.selected ) {
      this.selected = null;
      await this.render();
      return this;
    }
    return super.close(options);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onFilter(event, target) {
    this.tier = target.dataset.filter;
    await this.render();
  }

  static async #onDetails(event, target) {
    this.selected = target.closest("[data-pregen]")?.dataset.pregen ?? null;
    await this.render();
  }

  static async #onCloseDetails(event, target) {
    // A click on the backdrop closes; clicks inside the dialog bubble up to it and are ignored
    if ( target.classList.contains("swp-pregen-backdrop") && (event.target !== target) ) return;
    this.selected = null;
    await this.render();
  }

  static async #onChoose(event, target) {
    const pregens = await loadPregens();
    const pregen = pregens.find(p => p.id === this.selected);
    if ( !pregen || !this.actor.isOwner ) return;
    const mount = !!this.element.querySelector("input[name='withMount']")?.checked;
    if ( this.actor.items.size ) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("SW25.Pregen.ConfirmTitle"), icon: "fa-solid fa-users-viewfinder" },
        classes: PAPER_DIALOG,
        content: `<p>${t("SW25.Pregen.ConfirmText", { actor: foundry.utils.escapeHTML(this.actor.name), pregen: pregen.name })}</p>`,
        rejectClose: false
      });
      if ( !ok ) return;
    }
    target.disabled = true;
    try {
      await applyPregen(this.actor, pregen, { mount });
      await this.close();
      this.actor.sheet?.render({ force: true });
    } finally {
      target.disabled = false;
    }
  }
}
