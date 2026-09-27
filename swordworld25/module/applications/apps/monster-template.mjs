import { CLASSIFICATION_DEFAULTS, MONSTER_BENCHMARKS } from "../../data/monster-benchmarks.mjs";
import { PAPER_DIALOG, t } from "../../helpers/utils.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Highest level with benchmark values. */
const MAX_LEVEL = Math.max(...Object.keys(MONSTER_BENCHMARKS).map(Number));

/**
 * Roles nudge the typical values of a level (a design aid, not a rule from the books).
 * hp is a multiplier; the other entries are added to the typical value.
 */
export const MONSTER_ROLES = {
  standard: { label: "SW25.Template.Role.standard" },
  brute: { label: "SW25.Template.Role.brute", hp: 1.2, damage: 2, evasion: -1 },
  skirmisher: { label: "SW25.Template.Role.skirmisher", hp: 0.85, accuracy: 1, evasion: 2, defense: -1 },
  tank: { label: "SW25.Template.Role.tank", hp: 1.25, defense: 2, accuracy: -1, damage: -1 },
  caster: { label: "SW25.Template.Role.caster", hp: 0.9, accuracy: -1, damage: -2, willpower: 1, mp: "high" }
};

/**
 * Parse a movement text such as "20 (4 Legs)/30 (Flying)".
 * @param {string} text
 * @returns {object}
 */
function parseMovement(text) {
  const m = String(text ?? "").match(/^\s*(\d+|-)\s*(?:\(([^)]*)\))?\s*\/\s*(\d+|-)\s*(?:\(([^)]*)\))?/);
  if ( !m ) return { text: text ?? "", ground: null, groundMode: "", air: null, airMode: "" };
  const num = v => (/^\d+$/.test(v) ? Number(v) : null);
  return { text, ground: num(m[1]), groundMode: m[2] ?? "", air: num(m[3]), airMode: m[4] ?? "" };
}

/**
 * Build monster system data from template choices: typical values of the level (bestiary medians), adjusted by
 * role, split into sections, with the usual traits of the classification.
 * @param {object} choices
 * @param {number} choices.level
 * @param {string} choices.classification
 * @param {string} [choices.role="standard"]
 * @param {number} [choices.sections=1]
 * @param {string} [choices.sectionNames=""]  Comma-separated; the first one is the main section
 * @param {string} [choices.style=""]
 * @param {number} [choices.swordShards=0]
 * @param {string} [choices.useFixed="default"]
 * @returns {object} system data
 */
export function buildMonsterData({
  level = 1, classification = "barbarous", role = "standard", sections = 1, sectionNames = "", style = "",
  swordShards = 0, useFixed = "default"
} = {}) {
  level = Math.clamp(Math.round(Number(level) || 1), 1, MAX_LEVEL);
  const b = MONSTER_BENCHMARKS[level];
  const r = MONSTER_ROLES[role] ?? MONSTER_ROLES.standard;
  const def = CLASSIFICATION_DEFAULTS[classification] ?? {};
  const count = Math.clamp(Math.round(Number(sections) || 1), 1, 8);
  const names = String(sectionNames ?? "").split(",").map(s => s.trim()).filter(Boolean);
  // Multi-section monsters spread their bulk: each section gets a bit less than a single-section monster
  const hpFactor = count > 1 ? Math.max(0.6, 1 - (0.08 * (count - 2))) : 1;
  const mp = r.mp === "high" ? b.mpHigh : b.mpLow;
  const hp = Math.max(1, Math.round(b.hp * (r.hp ?? 1) * hpFactor));
  const shards = Math.max(0, Math.round(Number(swordShards) || 0));
  const list = [];
  for ( let i = 0; i < count; i++ ) {
    const sectionMP = (i === 0) ? mp : Math.round(b.mpLow / 2);
    // Sword shards raise the maxima of the main (first) section; it starts at full HP/MP
    const bonusHP = (i === 0) ? shards * 5 : 0;
    const bonusMP = (i === 0) ? shards : 0;
    list.push({
      name: names[i] ?? (count > 1 ? `${t("SW25.Section.label")} ${i + 1}` : ""),
      style: style || def.style || "Weapon",
      accuracy: b.accuracy + (r.accuracy ?? 0),
      damage: `2d+${Math.max(0, b.damage + (r.damage ?? 0))}`,
      evasion: b.evasion + (r.evasion ?? 0),
      defense: Math.max(0, b.defense + (r.defense ?? 0)),
      hp: { value: hp + bonusHP, max: hp },
      mp: { value: sectionMP + bonusMP, max: sectionMP },
      main: (count > 1) && (i === 0),
      disabled: false
    });
  }
  return {
    level,
    classification,
    intelligence: def.intelligence ?? "",
    perception: def.perception ?? "",
    disposition: def.disposition ?? "",
    languages: def.languages ?? "",
    soulscars: classification === "barbarous" ? b.soulscars : null,
    reputation: b.reputation,
    weakness: b.weakness,
    weakPoint: def.weakPoint ? { ...def.weakPoint } : { text: "", kind: "", damageType: "", value: 0 },
    initiative: b.initiative,
    movement: parseMovement(def.movement ?? "12/-"),
    fortitude: b.fortitude + (r.fortitude ?? 0),
    willpower: b.willpower + (r.willpower ?? 0),
    swordShards: shards,
    useFixed,
    sections: list
  };
}

/** Fields of the template that describe what the monster is rather than how strong it is. */
const IDENTITY_FIELDS = ["intelligence", "perception", "disposition", "languages", "soulscars", "weakPoint", "movement"];

/**
 * "Monster from template": pick level, classification, role and sections; typical values are filled in with a
 * live preview. Creates a new monster, or rewrites the stats of an existing one.
 */
export default class MonsterTemplateApp extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * @param {object} [options]
   * @param {Actor|null} [options.actor]  Monster to apply the template to (a new one is created otherwise)
   */
  constructor({ actor = null, ...options } = {}) {
    super(options);
    this.actor = actor;
    const sys = actor?.system;
    this.choices = {
      name: t("SW25.Template.NewName"),
      level: sys?.level || 1,
      classification: sys?.classification || "barbarous",
      role: "standard",
      sections: Math.max(1, sys?.sections?.length ?? 1),
      sectionNames: (sys?.sections?.length > 1) ? sys.sections.map(s => s.name || s.style).join(", ") : "",
      style: sys?.sections?.[0]?.style ?? "",
      swordShards: sys?.swordShards ?? 0,
      useFixed: sys?.useFixed ?? "default",
      identity: !actor || !sys?.intelligence
    };
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["sw25", "swp", "swp-template", "themed", "theme-light"],
    window: { icon: "fa-solid fa-wand-magic-sparkles", resizable: true },
    position: { width: 760, height: "auto" },
    form: { handler: MonsterTemplateApp.#onSubmit, submitOnChange: false, closeOnSubmit: true }
  };

  /** @override */
  static PARTS = {
    fields: { template: "systems/swordworld25/templates/apps/monster-template.hbs" },
    preview: { template: "systems/swordworld25/templates/apps/monster-template-preview.hbs" },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  /** @override */
  get title() {
    return this.actor ? t("SW25.Template.TitleApply", { name: this.actor.name }) : t("SW25.Template.Title");
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, {
      choices: this.choices,
      isNew: !this.actor,
      maxLevel: MAX_LEVEL,
      classifications: CONFIG.SW25.monsterClassifications,
      roles: Object.fromEntries(Object.entries(MONSTER_ROLES).map(([k, r]) => [k, r.label])),
      useFixedOptions: {
        default: "SW25.Monster.FixedDefault", fixed: "SW25.Monster.FixedAlways", roll: "SW25.Monster.RollAlways"
      },
      styleHint: CLASSIFICATION_DEFAULTS[this.choices.classification]?.style ?? "Weapon",
      buttons: [{
        type: "submit", icon: this.actor ? "fa-solid fa-check" : "fa-solid fa-dragon",
        label: this.actor ? "SW25.Template.ApplyButton" : "SW25.Template.CreateButton"
      }]
    });
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if ( partId === "preview" ) context.preview = this.#preview();
    return context;
  }

  /**
   * Stat block preview of the current choices.
   * @returns {object}
   */
  #preview() {
    const SW25 = CONFIG.SW25;
    const sys = buildMonsterData(this.choices);
    const fixed = n => `${n} (${n + SW25.FIXED_OFFSET})`;
    const shards = sys.swordShards;
    const shardResist = SW25.swordShardResistBonus(shards);
    return {
      ...sys,
      classificationLabel: SW25.monsterClassifications[sys.classification] ?? sys.classification,
      roleLabel: MONSTER_ROLES[this.choices.role]?.label ?? "",
      fortitudeLabel: fixed(sys.fortitude + shardResist),
      willpowerLabel: fixed(sys.willpower + shardResist),
      movementLabel: sys.movement.text,
      sections: sys.sections.map((s, i) => ({
        ...s,
        accuracyLabel: fixed(s.accuracy),
        evasionLabel: fixed(s.evasion),
        hpLabel: (i === 0) && shards ? `${s.hp.max}+${shards * 5}` : s.hp.max,
        mpLabel: (i === 0) && shards ? `${s.mp.max}+${shards}` : s.mp.max
      })),
      shards, shardResist,
      exp: sys.level * sys.sections.length * 10
    };
  }

  /* -------------------------------------------- */

  /**
   * Template choices from the form. Field names avoid properties of the form element (style, name, role...),
   * which named controls would shadow.
   * @param {object} data  Form data
   * @returns {object}
   */
  static #readForm(data) {
    const map = { tplName: "name", tplRole: "role", attackStyle: "style" };
    const out = {};
    for ( const [key, value] of Object.entries(data) ) out[map[key] ?? key] = value;
    return out;
  }

  /** @override */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    const data = MonsterTemplateApp.#readForm(new foundry.applications.ux.FormDataExtended(this.element).object);
    // A new classification brings its usual attack style unless one was typed
    if ( event.target?.name === "classification" ) {
      const previous = CLASSIFICATION_DEFAULTS[this.choices.classification]?.style;
      if ( !data.style || (data.style === previous) ) {
        data.style = CLASSIFICATION_DEFAULTS[data.classification]?.style ?? data.style;
        const input = this.element.querySelector("input[name=attackStyle]");
        if ( input ) input.value = data.style;
      }
    }
    Object.assign(this.choices, data);
    this.render({ parts: ["preview"] });
  }

  /**
   * Create the monster, or apply the template to the existing one.
   * @this {MonsterTemplateApp}
   * @param {SubmitEvent} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   */
  static async #onSubmit(event, form, formData) {
    Object.assign(this.choices, MonsterTemplateApp.#readForm(formData.object));
    const system = buildMonsterData(this.choices);
    if ( this.actor ) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("SW25.Template.ConfirmTitle"), icon: "fa-solid fa-wand-magic-sparkles" },
        classes: PAPER_DIALOG,
        content: `<p>${t("SW25.Template.ConfirmApply", { name: foundry.utils.escapeHTML(this.actor.name) })}</p>`,
        rejectClose: false
      });
      if ( !ok ) return;
      if ( !this.choices.identity ) for ( const key of IDENTITY_FIELDS ) delete system[key];
      await this.actor.update({ system });
      return;
    }
    const actor = await Actor.implementation.create({
      name: this.choices.name || t("SW25.Template.NewName"),
      type: "monster",
      system: {
        ...system,
        loot: [
          { roll: "2-7", min: 2, max: 7, item: "" },
          { roll: "8+", min: 8, max: null, item: "" }
        ]
      }
    });
    if ( !actor ) return;
    actor.sheet._editMode = true;
    actor.sheet.render({ force: true });
  }
}
