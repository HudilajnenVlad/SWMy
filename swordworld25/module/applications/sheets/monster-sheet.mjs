import SW25ActorSheet from "./actor-base.mjs";
import MonsterTemplateApp from "../apps/monster-template.mjs";
import { rollCheck, rollLoot } from "../../workflows/checks.mjs";
import { rollSectionAttack } from "../../workflows/attacks.mjs";
import { showMonsterToPlayers } from "../../workflows/knowledge.mjs";
import { t } from "../../helpers/utils.mjs";

/**
 * Sheet for monsters, enemy NPCs and mounts, laid out like the bestiary stat blocks of the core rulebooks.
 * View mode is a live stat block (click a value to roll); edit mode turns the same layout into a form.
 */
export default class MonsterSheet extends SW25ActorSheet {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["monster", "swp", "themed", "theme-light"],
    position: { width: 800, height: 860 },
    actions: {
      sectionAttack: MonsterSheet.#onSectionAttack,
      sectionEvasion: MonsterSheet.#onSectionEvasion,
      sectionAdd: MonsterSheet.#onSectionAdd,
      sectionDelete: MonsterSheet.#onSectionDelete,
      sectionDuplicate: MonsterSheet.#onSectionDuplicate,
      sectionMain: MonsterSheet.#onSectionMain,
      lootAdd: MonsterSheet.#onLootAdd,
      lootDelete: MonsterSheet.#onLootDelete,
      rollLoot: MonsterSheet.#onRollLoot,
      monsterCheck: MonsterSheet.#onMonsterCheck,
      toggleIdentified: MonsterSheet.#onToggleIdentified,
      toggleWeakPoint: MonsterSheet.#onToggleWeakPoint,
      showPlayers: MonsterSheet.#onShowPlayers,
      openSpellbook: MonsterSheet.#onOpenSpellbook,
      fullHeal: MonsterSheet.#onFullHeal,
      levelRowAdd: MonsterSheet.#onLevelRowAdd,
      levelRowDelete: MonsterSheet.#onLevelRowDelete,
      clearJockey: MonsterSheet.#onClearJockey,
      toggleEdit: MonsterSheet.#onToggleEdit,
      openTemplate: MonsterSheet.#onOpenTemplate,
      skillCreate: MonsterSheet.#onSkillCreate
    }
  };

  /** @override */
  static PARTS = {
    header: { template: "systems/swordworld25/templates/actor/monster/header.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    stats: { template: "systems/swordworld25/templates/actor/monster/stats.hbs", scrollable: [""] },
    effects: { template: "systems/swordworld25/templates/actor/paper/effects-tab.hbs", scrollable: [""] },
    notes: { template: "systems/swordworld25/templates/actor/monster/notes.hbs", scrollable: [""] }
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        { id: "stats", icon: "fa-solid fa-dragon", tooltip: "SW25.Tab.stats" },
        { id: "effects", icon: "fa-solid fa-bolt", tooltip: "SW25.Tab.effects" },
        { id: "notes", icon: "fa-solid fa-feather", tooltip: "SW25.Tab.notes" }
      ],
      initial: "stats",
      labelPrefix: "SW25.Tab"
    }
  };

  /**
   * Edit mode of this sheet. Blank monsters open in edit mode so the stat block can be filled in right away.
   * @type {boolean|null}
   */
  _editMode = null;

  /**
   * Tabs this user may see: players never get the GM notes, and only the stat block (name and description) of
   * an unidentified monster.
   * @returns {string[]}
   */
  #visibleTabs() {
    if ( this.#isHidden() ) return ["stats"];
    return game.user.isGM ? ["stats", "effects", "notes"] : ["stats", "effects"];
  }

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    const visible = this.#visibleTabs();
    for ( const key of ["stats", "effects", "notes"] ) if ( !visible.includes(key) ) delete parts[key];
    return parts;
  }

  /** @override */
  _getTabsConfig(group) {
    const config = super._getTabsConfig(group);
    if ( !config ) return config;
    const visible = this.#visibleTabs();
    return { ...config, tabs: config.tabs.filter(tab => visible.includes(tab.id)) };
  }

  /**
   * Should the stats be hidden from this user (unidentified monster)?
   * @returns {boolean}
   */
  #isHidden() {
    if ( this.actor.isOwner || game.user.isGM ) return false;
    if ( !game.settings.get("swordworld25", "hideUnidentified") ) return false;
    return !this.actor.system.identified;
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    // An unidentified monster shows only its name and description: no need for a tall window
    if ( this.#isHidden() ) this.setPosition({ height: "auto" });
  }

  /** Is the stat block shown as a form? */
  get editMode() {
    if ( !this.isEditable ) return false;
    this._editMode ??= this.#isBlank();
    return this._editMode;
  }

  /** A monster with no usable section yet (freshly created). */
  #isBlank() {
    if ( this.actor.type === "mount" ) return !this.actor.system.levels.length;
    const sections = this.actor.system.sections;
    return !sections.length || sections.every(s => !s.style && !Number.isInteger(s.accuracy) && !s.hp.max);
  }

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const sys = actor.system;
    const SW25 = CONFIG.SW25;
    const fixed = n => (Number.isFinite(n) ? n + SW25.FIXED_OFFSET : null);
    const withFixed = n => (Number.isFinite(n) ? `${n} (${fixed(n)})` : "—");
    const isMount = actor.type === "mount";
    Object.assign(context, {
      hidden: this.#isHidden(),
      isMount,
      edit: this.editMode,
      blank: this.#isBlank(),
      editable: this.isEditable,
      classificationLabel: SW25.monsterClassifications[sys.classification] ?? sys.classification,
      classifications: SW25.monsterClassifications,
      weakPointKinds: SW25.weakPointKinds,
      useFixedOptions: {
        default: t("SW25.Monster.FixedDefault"), fixed: t("SW25.Monster.FixedAlways"), roll: t("SW25.Monster.RollAlways")
      },
      useFixedLabel: { default: "SW25.Monster.FixedDefault", fixed: "SW25.Monster.FixedAlways", roll: "SW25.Monster.RollAlways" }[sys.useFixed],
      fortitudeLabel: withFixed(sys.fortitudeTotal),
      willpowerLabel: withFixed(sys.willpowerTotal),
      initiativeLabel: Number.isFinite(sys.initiativeTotal) ? sys.initiativeTotal : "—",
      movementLabel: sys.movementLabel,
      // Players learn the weak point from a knowledge check reaching the Weakness value
      weakPointLabel: (actor.isOwner || sys.weakPointRevealed) ? (sys.weakPoint?.text || "—") : "???",
      expValue: sys.expValue,
      soulscarsShown: Number.isInteger(sys.soulscars) && (sys.soulscars > 0)
    });

    // Sections: current values; standard values with the fixed value in parentheses
    context.sections = sys.sections.map((s, i) => ({
      ...s,
      index: i,
      accuracyLabel: withFixed(s.accuracyTotal),
      evasionLabel: withFixed(s.evasionTotal),
      canAttack: Number.isFinite(s.accuracyTotal) && !!s.damage,
      canEvade: Number.isFinite(s.evasionTotal),
      srcHP: actor._source.system.sections[i]?.hp.max ?? 0,
      srcMP: actor._source.system.sections[i]?.mp.max ?? 0
    }));
    // "Rider, Chariot, Horse ×2" like the bestiary's section line
    context.sectionNames = (sys.sectionGroups ?? []).map(g => {
      const count = g.count > 1 ? ` ×${g.count}` : "";
      return `${g.label}${count}${g.countRange ? ` (${g.countRange})` : ""}`;
    }).join(", ");
    context.mainSectionLabel = sys.mainSection || sys.sections.filter(s => s.main).map(s => s.label).join(", ");
    context.sectionGroupOptions = (sys.sectionGroups ?? []).flatMap(g => (g.count > 1 ? [g.label, `${g.label} (All)`] : [g.label]));

    // Unique skills
    context.skills = await Promise.all(actor.items.filter(i => i.type === "ability")
      .sort((a, b) => (a.sort - b.sort) || 0)
      .map(async i => ({
        ...(await this._itemRow(i)),
        icons: i.system.tagIcons,
        tagLabels: i.system.tags.map(tag => game.i18n.localize(SW25.abilityTags[tag]?.label ?? tag)).join(", "),
        section: i.system.section,
        checkLabel: Number.isInteger(i.system.check.value)
          ? `${i.system.check.value} (${i.system.check.value + SW25.FIXED_OFFSET})${i.system.check.vs ? ` / ${game.i18n.localize(`SW25.Check.${i.system.check.vs}`)}` : ""}${i.system.check.result ? ` / ${game.i18n.localize(SW25.resistance[i.system.check.result] ?? i.system.check.result)}` : ""}`
          : "",
        damage: i.system.damage.formula,
        // Spellcasting skills ("Truespeech Magic"): level, Magic Power and a button to the spellbook
        casting: i.system.spellcasting?.system ? {
          system: i.system.spellcasting.system,
          label: game.i18n.format("SW25.Monster.CastingLine", {
            level: i.system.spellcasting.level ?? 0,
            power: (i.system.spellcasting.power ?? 0) + (sys.bonuses.magicPower ?? 0),
            fixed: (i.system.spellcasting.power ?? 0) + (sys.bonuses.magicPower ?? 0) + (sys.bonuses.spellcasting ?? 0) + SW25.FIXED_OFFSET
          })
        } : null,
        text: await this._enrich(i.system.description || i.system.summary)
      })));
    context.otherItems = await Promise.all(actor.items.filter(i => !["ability"].includes(i.type)).map(i => this._itemRow(i)));

    // Loot in two columns, like the book
    const loot = sys.loot.map((l, i) => ({
      ...l, index: i,
      label: [l.item, [l.price ? `${l.price}G` : (l.priceText || ""), l.cards].filter(Boolean).join("/")].filter(Boolean)
        .map((v, n) => (n ? `(${v})` : v)).join(" ") + (l.quantity ? ` ×${l.quantity}` : "")
    }));
    const half = Math.ceil(loot.length / 2);
    context.loot = loot;
    const right = loot.slice(half);
    while ( right.length < half ) right.push({ roll: "", label: "" });
    context.lootColumns = [loot.slice(0, half), right];

    context.enrichedDescription = await this._enrich(sys.details.description);
    context.enrichedNotes = await this._enrich(sys.details.notes);
    const book = { CR1: "CR I", CR2: "CR II", CR3: "CR III" }[sys.details.source?.book] ?? sys.details.source?.book;
    context.sourceLabel = book ? `${book}${sys.details.source.page ? ` p.${sys.details.source.page}` : ""}` : "";

    if ( isMount ) this.#mountContext(context, sys);
    return context;
  }

  /**
   * Mount data: jockey, level choice and the per-level table.
   * @param {object} context
   * @param {object} sys
   */
  #mountContext(context, sys) {
    context.levelOptions = {};
    for ( let l = sys.levelMin; l <= sys.levelMax; l++ ) context.levelOptions[l] = String(l);
    context.jockeyName = sys.jockeyActor?.name ?? "";
    context.jockeyRider = sys.jockeyRiderLevel;
    context.priceLabel = [sys.price.buy, sys.price.rent].map(p => (Number.isInteger(p) ? `${p.toLocaleString()}G` : "—")).join(" / ");
    context.levelRows = sys.levels.map((row, r) => ({
      ...row, index: r,
      odd: (r % 2) === 1,
      current: row.level === sys.currentLevel,
      span: Math.max(1, row.sections.length),
      sections: row.sections.map((s, si) => ({ ...s, index: si, first: si === 0 }))
    }));
  }

  /* -------------------------------------------- */
  /*  Drop handling                               */
  /* -------------------------------------------- */

  /** @override */
  async _onDropActor(event, actor) {
    // Dropping a character on a mount sets the jockey
    if ( (this.actor.type === "mount") && (actor.type === "character") ) {
      await this.actor.update({ "system.jockey": actor.uuid });
      return actor;
    }
    return null;
  }

  /** @override */
  async _onDropItemSpecial(event, item) {
    return undefined;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onToggleEdit() {
    this._editMode = !this.editMode;
    return this.render();
  }

  static #onOpenTemplate() {
    return new MonsterTemplateApp({ actor: this.actor }).render({ force: true });
  }

  static async #onSkillCreate() {
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{
      name: game.i18n.format("DOCUMENT.New", { type: game.i18n.localize("TYPES.Item.ability") }), type: "ability",
      system: { tags: ["passive"] }
    }]);
    item?.sheet.render(true);
  }

  static #onSectionAttack(event, target) {
    return rollSectionAttack(this.actor, Number(target.dataset.index) || 0, { event });
  }

  static #onSectionEvasion(event, target) {
    return rollCheck(this.actor, "evasion", { event, section: Number(target.dataset.index) || 0 });
  }

  static async #onSectionAdd() {
    const sections = this.actor.system.toObject().sections;
    sections.push({ name: "", style: "", accuracy: null, damage: "", evasion: null, defense: 0, hp: { value: 10, max: 10 }, mp: { value: 0, max: 0 }, main: false });
    await this.actor.update({ "system.sections": sections });
  }

  /** Another identical part (a second horse, a fourth petal): a copy at full HP and MP right after the original. */
  static async #onSectionDuplicate(event, target) {
    const i = Number(target.dataset.index);
    const sections = this.actor.system.toObject().sections;
    if ( !sections[i] ) return;
    const copy = foundry.utils.deepClone(sections[i]);
    copy.hp.value = copy.hp.max;
    copy.mp.value = copy.mp.max;
    sections.splice(i + 1, 0, copy);
    await this.actor.update({ "system.sections": sections });
  }

  static async #onSectionDelete(event, target) {
    const sections = this.actor.system.toObject().sections;
    sections.splice(Number(target.dataset.index), 1);
    await this.actor.update({ "system.sections": sections });
  }

  /** Toggle a main section. Several parts can be main ("Heads (All)": defeated when every head falls). */
  static async #onSectionMain(event, target) {
    const i = Number(target.dataset.index);
    const sections = this.actor.system.toObject().sections;
    if ( !sections[i] ) return;
    sections[i].main = !sections[i].main;
    await this.actor.update({ "system.sections": sections });
  }

  static async #onLootAdd() {
    const loot = this.actor.system.toObject().loot;
    loot.push({ roll: "", min: null, max: null, item: "", price: null, cards: "", quantity: "" });
    await this.actor.update({ "system.loot": loot });
  }

  static async #onLootDelete(event, target) {
    const loot = this.actor.system.toObject().loot;
    loot.splice(Number(target.dataset.index), 1);
    await this.actor.update({ "system.loot": loot });
  }

  static #onRollLoot() {
    const looter = canvas.tokens?.controlled.find(tk => tk.actor?.type === "character")?.actor ?? game.user.character;
    return rollLoot(this.actor, { looter });
  }

  static #onMonsterCheck(event, target) {
    return rollCheck(this.actor, target.dataset.check, { event });
  }

  static async #onToggleIdentified() {
    await this.actor.update({ "system.identified": !this.actor.system.identified });
  }

  static async #onToggleWeakPoint() {
    await this.actor.update({ "system.weakPointRevealed": !this.actor.system.weakPointRevealed });
  }

  static async #onOpenSpellbook(event, target) {
    const { default: SpellbookApp } = await import("../apps/spellbook.mjs");
    return SpellbookApp.openFor(this.actor, { system: target.dataset.system });
  }

  static #onShowPlayers() {
    return showMonsterToPlayers(this.actor);
  }

  static async #onFullHeal() {
    const sections = this.actor.system.toObject().sections;
    this.actor.system.sections.forEach((s, i) => {
      sections[i].hp.value = s.hp.max;
      sections[i].mp.value = s.mp.max;
    });
    await this.actor.update({ "system.sections": sections });
    if ( this.actor.statuses.has("dead") ) await this.actor.toggleStatusEffect("dead", { active: false });
  }

  static async #onLevelRowAdd() {
    const sys = this.actor.system;
    const levels = sys.toObject().levels;
    const last = levels.at(-1);
    const sectionCount = Math.max(1, sys.sections.length);
    const blankRow = { style: "", accuracy: null, damage: "", evasion: null, defense: 0, hp: 0, mp: 0 };
    const row = last ? foundry.utils.deepClone(last)
      : { level: sys.levelMin - 1, fortitude: 0, willpower: 0, sections: Array.from({ length: sectionCount }, () => ({ ...blankRow })) };
    row.level = (last?.level ?? (sys.levelMin - 1)) + 1;
    levels.push(row);
    const update = { "system.levels": levels, "system.levelMax": Math.max(sys.levelMax, row.level) };
    if ( !sys.sections.length ) update["system.sections"] = [{ name: "", style: "", hp: { value: 0, max: 0 }, mp: { value: 0, max: 0 } }];
    await this.actor.update(update);
  }

  static async #onLevelRowDelete(event, target) {
    const levels = this.actor.system.toObject().levels;
    levels.splice(Number(target.dataset.index), 1);
    await this.actor.update({ "system.levels": levels });
  }

  static async #onClearJockey() {
    await this.actor.update({ "system.jockey": "" });
  }
}
