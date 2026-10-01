import { SYSTEM_ID, t } from "../../helpers/utils.mjs";
import { rollCheck, rollDeathCheck, rollMonsterKnowledge } from "../../workflows/checks.mjs";
import { getCasting } from "../../workflows/magic.mjs";
import { abilityDetail } from "./spellbook.mjs";
import ActorPanel from "./actor-panel.mjs";

/** Class abilities listed by the panel, in this order. */
const CLASS_ABILITIES = ["technique", "spellsong", "finale", "stunt", "evocation"];

/**
 * Combat panel: what a character (or a creature) does in combat, in one floating window opened by the swords of the
 * Token Controls. It takes the place of the resource tracker (HP/MP, custom trackers, rhythm, cards, conditions) and
 * adds the defenses and combat checks (Evasion, Fortitude, Willpower, Initiative, Monster Knowledge, death check),
 * the attacks with their stance and the declarable combat feats, the favorite spells by school, the class abilities
 * (techniques, songs, finales, stunts, evocations) and the usable items. Its blocks fold; the folds are remembered.
 */
export default class CombatPanel extends ActorPanel {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "sw25-combat-panel",
    classes: ["sw25-tracker", "sw25-combat"],
    position: { width: 370 },
    window: { title: "SW25.Combat.Title", icon: "fa-solid fa-swords" },
    actions: {
      check: CombatPanel.#onCheck,
      weaponMode: CombatPanel.#onWeaponMode,
      use: CombatPanel.#onUse,
      fold: CombatPanel.#onFold
    }
  };

  /** @override */
  static PARTS = {
    body: { template: "systems/swordworld25/templates/apps/combat-panel.hbs", scrollable: [""] }
  };

  /** @override */
  static SETTINGS = { show: "showCombatPanel", collapsed: "combatPanelCollapsed", position: "combatPanelPosition" };

  /** @override */
  static TOOL = { name: "sw25Combat", title: "SW25.Combat.Toggle", icon: "fa-solid fa-swords", order: 101 };

  /** @override */
  static CLOSE_HINT = "SW25.Combat.CloseHint";

  /** @override */
  static KEEP_EMPTY = true;

  /** @override */
  static instance = null;

  /** @override */
  static _registerHooks(refresh) {
    // Initiative rolled or reset, rounds passing (durations of the conditions)
    for ( const hook of ["updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant"] ) {
      Hooks.on(hook, refresh);
    }
  }

  /**
   * The first time, the panel opens where the resource tracker was.
   * @override
   */
  _savedPosition() {
    const own = super._savedPosition();
    return own?.left ? own : game.settings.get(SYSTEM_ID, "trackerPosition");
  }

  /** Folded blocks of the panel. */
  get folds() {
    return game.settings.get(SYSTEM_ID, "combatPanelFolds") ?? {};
  }

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.folds = this.folds;
    // Attack rows show the stance of the weapons, with a switch
    context.stances = true;
    const actor = context.actor;
    if ( !actor ) return context;
    const character = actor.type === "character";
    context.subtitle = character
      ? Object.values(actor.system.classes ?? {}).sort((a, b) => b.level - a.level).map(c => `${c.label} ${c.level}`).join(" · ")
      : "";
    context.defenses = character ? this.#characterDefenses(actor) : this.#creatureDefenses(actor);
    context.checks = this.#checks(actor);
    context.feats = (context.owner && character) ? this.#feats(actor) : [];
    context.hasAttacks = !!context.attacks || context.feats.length > 0;
    context.magic = context.owner ? this.#magic(actor) : [];
    context.classAbilities = (context.owner && character) ? this.#classAbilities(actor) : [];
    context.items = (context.owner && character) ? this.#items(actor) : [];
    return context;
  }

  /**
   * Evasion, Defense, Fortitude and Willpower of a character (the checks roll on click).
   * @param {Actor} actor
   * @returns {object[]}
   */
  #characterDefenses(actor) {
    const sys = actor.system;
    return [
      { key: "evasion", label: t("SW25.Tracker.EvasionShort"), value: sys.evasionStraight ? "—" : sys.evasion, tooltip: t("SW25.Check.evasion"), roll: true },
      { key: "defense", label: t("SW25.Tracker.DefenseShort"), value: sys.defense, tooltip: t("SW25.Defense"), roll: false },
      { key: "fortitude", label: t("SW25.Tracker.FortitudeShort"), value: sys.fortitude, tooltip: t("SW25.Check.fortitude"), roll: true },
      { key: "willpower", label: t("SW25.Tracker.WillpowerShort"), value: sys.willpower, tooltip: t("SW25.Check.willpower"), roll: true }
    ];
  }

  /**
   * Evasion and Defense of the shown section of a creature, its Fortitude and Willpower, with their fixed values.
   * @param {Actor} actor
   * @returns {object[]}
   */
  #creatureDefenses(actor) {
    const sys = actor.system;
    const section = sys.sections?.[this._sectionIndex(actor)] ?? sys.sections?.[0] ?? {};
    const fixed = n => (Number.isFinite(n) ? `${n} (${n + CONFIG.SW25.FIXED_OFFSET})` : "—");
    const evasion = section.evasionTotal;
    return [
      { key: "evasion", label: t("SW25.Tracker.EvasionShort"), value: fixed(evasion), tooltip: t("SW25.Check.evasion"), roll: Number.isFinite(evasion) },
      { key: "defense", label: t("SW25.Tracker.DefenseShort"), value: section.defenseTotal ?? "—", tooltip: t("SW25.Defense"), roll: false },
      { key: "fortitude", label: t("SW25.Tracker.FortitudeShort"), value: fixed(sys.fortitudeTotal), tooltip: t("SW25.Check.fortitude"), roll: true },
      { key: "willpower", label: t("SW25.Tracker.WillpowerShort"), value: fixed(sys.willpowerTotal), tooltip: t("SW25.Check.willpower"), roll: true }
    ];
  }

  /**
   * Combat checks besides the defenses: Initiative (into the combat tracker when the actor fights and has none yet),
   * Monster Knowledge, and the death check below 1 HP.
   * @param {Actor} actor
   * @returns {object[]}
   */
  #checks(actor) {
    const sys = actor.system;
    if ( actor.type !== "character" ) {
      const init = sys.initiativeTotal;
      return Number.isFinite(init) ? [{ key: "initiative", label: t("SW25.Check.initiative"), value: init, icon: "fa-solid fa-bolt", static: true }] : [];
    }
    const checks = [];
    const value = c => (!c || c.straight ? "—" : c.value);
    const combatant = this.#combatant(actor);
    const toTracker = !!combatant && (combatant.initiative === null);
    checks.push({
      key: "initiative", label: t("SW25.Check.initiative"), value: value(sys.checks?.initiative), icon: "fa-solid fa-bolt",
      tooltip: toTracker ? t("SW25.Combat.InitiativeToTracker") : t("SW25.Check.initiative"), cssClass: toTracker ? "pending" : ""
    });
    checks.push({
      key: "monsterKnowledge", label: t("SW25.Check.monsterKnowledge"), value: value(sys.checks?.monsterKnowledge),
      icon: "fa-solid fa-book-skull", tooltip: t("SW25.Sheet.MonsterKnowledgeHint")
    });
    if ( sys.hp.value <= 0 ) {
      checks.push({ key: "death", label: t("SW25.Check.death"), value: value(sys.checks?.death), icon: "fa-solid fa-skull", cssClass: "danger" });
    }
    return checks;
  }

  /**
   * The combatant of an actor in the current combat.
   * @param {Actor} actor
   * @returns {Combatant|null}
   */
  #combatant(actor) {
    return game.combat?.getCombatantsByActor(actor)?.[0] ?? null;
  }

  /**
   * Combat feats declared during the turn (active and major ones).
   * @param {Actor} actor
   * @returns {object[]}
   */
  #feats(actor) {
    return actor.items.filter(i => (i.type === "feat") && (i.system.featType !== "passive"))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(i => ({ id: i.id, name: i.name, major: i.system.featType === "major", summary: i.system.summary ?? "" }));
  }

  /**
   * Magic by school: Magic Power, casting check and the favorite (owned) spells. A creature lists its spellcasting
   * skills, which open the spellbook of their school.
   * @param {Actor} actor
   * @returns {object[]}
   */
  #magic(actor) {
    const SW25 = CONFIG.SW25;
    const tags = SW25.abilityTags;
    const systems = new Set();
    if ( actor.type === "character" ) for ( const key of Object.keys(actor.system.magic ?? {}) ) systems.add(key);
    else {
      for ( const item of actor.items ) {
        if ( (item.type === "ability") && item.system.spellcasting?.system ) systems.add(item.system.spellcasting.system);
      }
    }
    for ( const item of actor.items ) if ( item.type === "spell" ) systems.add(item.system.magic);
    const out = [];
    for ( const system of systems ) {
      const casting = getCasting(actor, system);
      if ( !casting ) continue;
      const spells = actor.items.filter(i => (i.type === "spell") && (i.system.magic === system))
        .sort((a, b) => (a.system.level - b.system.level) || a.name.localeCompare(b.name))
        .map(i => {
          const s = i.system;
          const details = [s.target?.text, s.rangeArea?.text, s.duration?.text].filter(Boolean).join(" · ");
          return {
            id: i.id, name: i.name, img: i.img, level: s.level,
            cost: s.cost?.text || (Number.isInteger(s.cost?.mp) ? `MP${s.cost.mp}` : ""),
            marks: `${s.minorAction ? tags.minor.icon : ""}${s.combatPrep ? tags.prep.icon : ""}`,
            tooltip: [s.summary, details].filter(Boolean).join("<br>")
          };
        });
      const skill = (actor.type !== "character")
        ? actor.items.find(i => (i.type === "ability") && (i.system.spellcasting?.system === system)) : null;
      out.push({
        system,
        label: SW25.magicSystems[system]?.label ?? system,
        icon: SW25.magicSystems[system]?.icon ?? "fa-solid fa-wand-sparkles",
        level: casting.level,
        power: casting.power,
        check: casting.check,
        armorPenalty: casting.armorPenalty ?? 0,
        skillId: skill?.id ?? null,
        spells
      });
    }
    return out;
  }

  /**
   * Learned class abilities used in combat, by type.
   * @param {Actor} actor
   * @returns {object[]}
   */
  #classAbilities(actor) {
    const tags = CONFIG.SW25.abilityTags;
    const groups = [];
    for ( const type of CLASS_ABILITIES ) {
      const list = actor.items.filter(i => i.type === type)
        .sort((a, b) => (a.system.level - b.system.level) || a.name.localeCompare(b.name));
      if ( !list.length ) continue;
      groups.push({
        type,
        label: `TYPES.Item.${type}`,
        items: list.map(i => ({
          id: i.id, name: i.name, img: i.img,
          detail: abilityDetail(type, i.system),
          marks: `${i.system.minorAction || (type === "technique") ? tags.minor.icon : ""}${i.system.combatPrep ? tags.prep.icon : ""}`,
          tooltip: i.system.summary ?? ""
        }))
      });
    }
    return groups;
  }

  /**
   * Usable items: potions, herbs, magic items with uses...
   * @param {Actor} actor
   * @returns {object[]}
   */
  #items(actor) {
    return actor.items.filter(i => (i.type === "gear") && i.system.isUsable && (i.system.quantity > 0))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(i => {
        const s = i.system;
        const uses = (Number.isInteger(s.uses?.max) && (s.uses.max > 0)) ? `${s.uses.value ?? s.uses.max}/${s.uses.max}` : "";
        return { id: i.id, name: i.name, img: i.img, quantity: s.quantity, uses, tooltip: s.summary ?? "" };
      });
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Roll a combat check. Initiative goes to the combat tracker while the actor fights without one.
   */
  static async #onCheck(event, target) {
    const actor = this.actor;
    const key = target.dataset.check;
    if ( !actor?.isOwner || !key ) return;
    if ( key === "death" ) return rollDeathCheck(actor, event);
    if ( key === "monsterKnowledge" ) return rollMonsterKnowledge(actor, event);
    if ( key === "initiative" ) {
      const combatant = this.#combatant(actor);
      if ( combatant && (combatant.initiative === null) ) return combatant.parent.rollInitiative([combatant.id]);
    }
    const section = (actor.type !== "character") ? this._sectionIndex(actor) : null;
    return rollCheck(actor, key, { event, section });
  }

  /** Switch the stance of a weapon (one-handed / two-handed...). */
  static async #onWeaponMode(event, target) {
    const item = this._getItem(target);
    if ( !item ) return;
    await item.update({ "system.mode": (item.system.mode + 1) % Math.max(1, item.system.modes.length) });
  }

  /** Use an item: cast a spell, use a class ability or an item, declare a feat. */
  static async #onUse(event, target) {
    const item = this._getItem(target);
    if ( item && this.actor?.isOwner ) return item.use({ event, actor: this.actor });
  }

  /** Fold or unfold a block of the panel. */
  static async #onFold(event, target) {
    const key = target.dataset.fold;
    if ( !key ) return;
    const folds = { ...this.folds, [key]: !this.folds[key] };
    await game.settings.set(SYSTEM_ID, "combatPanelFolds", folds);
    await this.render();
  }
}
