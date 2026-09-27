import { rollCheck, rollDeathCheck, rollLoot, rollMonsterKnowledge } from "../workflows/checks.mjs";
import { rollSectionAttack, rollWeaponAttack } from "../workflows/attacks.mjs";
import { t } from "../helpers/utils.mjs";

/**
 * Sword World 2.5 Actor document.
 */
export default class SW25Actor extends Actor {

  /** Stored HP/MP value meaning "full"; derived data clamps it to the maximum. */
  static FULL_RESOURCE = 9999;

  /** @override */
  static getDefaultArtwork(actorData) {
    if ( actorData?.type !== "party" ) return super.getDefaultArtwork(actorData);
    const img = CONFIG.SW25?.partyIcon ?? super.getDefaultArtwork(actorData).img;
    return { img, texture: { src: img } };
  }

  /** @override */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if ( allowed === false ) return false;
    const prototype = {};
    if ( this.type === "character" ) {
      Object.assign(prototype, {
        actorLink: true,
        disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
        sight: { enabled: true },
        "bar1.attribute": "hp",
        "bar2.attribute": "mp"
      });
    } else if ( this.type === "party" ) {
      // The party token travels on overland maps: linked, friendly, no bars
      Object.assign(prototype, { actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY });
    } else {
      Object.assign(prototype, {
        disposition: this.type === "mount" ? CONST.TOKEN_DISPOSITIONS.FRIENDLY : CONST.TOKEN_DISPOSITIONS.HOSTILE,
        "bar1.attribute": "hp",
        "bar2.attribute": "mp"
      });
    }
    const update = {};
    for ( const [k, v] of Object.entries(prototype) ) {
      if ( foundry.utils.getProperty(data, `prototypeToken.${k}`) === undefined ) update[`prototypeToken.${k}`] = v;
    }
    if ( !foundry.utils.isEmpty(update) ) this.updateSource(update);
    // A hand-made monster starts with one empty fighting style row to fill in
    if ( (this.type === "monster") && !foundry.utils.getProperty(data, "system.sections")?.length ) {
      this.updateSource({ "system.sections": [{ name: "", style: "", hp: { value: 0, max: 0 }, mp: { value: 0, max: 0 } }] });
    }
    // New characters start full: the stored value is clamped to the derived maximum, so it keeps
    // tracking the maximum through character creation until the first real change.
    if ( this.type === "character" ) {
      const full = {};
      if ( !foundry.utils.hasProperty(data, "system.hp.value") ) full["system.hp.value"] = SW25Actor.FULL_RESOURCE;
      if ( !foundry.utils.hasProperty(data, "system.mp.value") ) full["system.mp.value"] = SW25Actor.FULL_RESOURCE;
      if ( !foundry.utils.isEmpty(full) ) this.updateSource(full);
    }
    return allowed;
  }

  /* -------------------------------------------- */

  /** @override */
  getRollData() {
    const data = { ...this.system };
    const sys = this.system;
    if ( this.type === "character" ) {
      data.lvl = sys.level;
      for ( const [k, a] of Object.entries(sys.abilities ?? {}) ) {
        data[k] = a.value;
        data[`${k}Mod`] = a.mod;
      }
      for ( const [k, c] of Object.entries(sys.classes ?? {}) ) data[k] = c.level;
    } else {
      data.lvl = sys.level;
    }
    return data;
  }

  /* -------------------------------------------- */
  /*  Token bar edits                             */
  /* -------------------------------------------- */

  /**
   * Route token bar edits of multi-section creatures to a section (main section by default).
   * @override
   */
  async modifyTokenAttribute(attribute, value, isDelta = false, isBar = true) {
    const sectionMatch = attribute.match(/^sections\.(\d+)\.(hp|mp)$/);
    if ( (this.type !== "character") && this.system.sections?.length && (["hp", "mp"].includes(attribute) || sectionMatch) ) {
      const sections = foundry.utils.deepClone(this._source.system.sections);
      const idx = sectionMatch ? Number(sectionMatch[1]) : Math.max(0, sections.findIndex(s => s.main));
      const key = sectionMatch ? sectionMatch[2] : attribute;
      if ( !sections[idx] ) return this;
      const current = this.system.sections[idx][key];
      let newValue;
      if ( isDelta ) newValue = current.value + value;
      else if ( sectionMatch ) newValue = value;
      else {
        // Absolute values refer to the total; convert to a delta on the main section
        const total = this.system[key].value;
        newValue = current.value + (value - total);
      }
      attribute = key;
      if ( isBar ) newValue = Math.min(newValue, current.max);
      sections[idx][attribute].value = newValue;
      const allowed = Hooks.call("modifyTokenAttribute", { attribute, value, isDelta, isBar }, { [`system.sections`]: sections }, this);
      return allowed !== false ? this.update({ "system.sections": sections }) : this;
    }
    return super.modifyTokenAttribute(attribute, value, isDelta, isBar);
  }

  /* -------------------------------------------- */
  /*  Roll shortcuts                              */
  /* -------------------------------------------- */

  /** Roll a skill check by key. */
  rollCheck(key, options = {}) {
    return rollCheck(this, key, options);
  }

  /** Roll a death check. */
  rollDeathCheck(options = {}) {
    return rollDeathCheck(this, options.event);
  }

  /** Monster knowledge against targeted monsters. */
  rollMonsterKnowledge(options = {}) {
    return rollMonsterKnowledge(this, options.event);
  }

  /** Attack with a weapon (by id) or a section (monsters). */
  rollAttack(idOrIndex, options = {}) {
    if ( this.type === "character" ) {
      const weapon = this.items.get(idOrIndex);
      if ( weapon ) return rollWeaponAttack(this, weapon, options);
      return;
    }
    return rollSectionAttack(this, Number(idOrIndex) || 0, options);
  }

  /** Roll loot (monsters). */
  rollLoot(options = {}) {
    return rollLoot(this, options);
  }

  /* -------------------------------------------- */
  /*  Rest & recovery                             */
  /* -------------------------------------------- */

  /**
   * Rest (CR I p.184): 3 hours restores 10% HP and half MP, 6 hours 20% HP and all MP.
   * @param {number} hours  3 or 6
   */
  async rest(hours = 6) {
    if ( this.type !== "character" ) return;
    const sys = this.system;
    const long = hours >= 6;
    const hp = Math.ceil(sys.hp.max * (long ? 0.2 : 0.1));
    const mp = long ? sys.mp.max : Math.ceil(sys.mp.max / 2);
    const update = {
      "system.hp.value": Math.min(sys.hp.max, sys.hp.value + hp),
      "system.mp.value": Math.min(sys.mp.max, sys.mp.value + mp)
    };
    await this.update(update);
    ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this }),
      content: `<div class="sw25 swp swp-chat swp-chat-note">
        <header class="swp-chat-head"><span class="swp-chat-icon"><i class="fa-solid fa-bed"></i></span>
          <div class="swp-chat-titles"><span class="swp-chat-title">${t("SW25.Rest.Title")}</span></div></header>
        <p class="swp-chat-text">${t("SW25.Rest.Message", { name: foundry.utils.escapeHTML(this.name), hours, hp, mp })}</p></div>`
    });
  }

  /**
   * New day (6:00 a.m.): reset once-per-day abilities.
   */
  async newDay() {
    if ( this.type !== "character" ) return;
    await this.update({ "system.daily.changeFate": false, "system.daily.hpConversion": 0, "system.daily.wings": 0 });
  }

  /* -------------------------------------------- */
  /*  Class levels                                */
  /* -------------------------------------------- */

  /**
   * Raise a class by one level, spending experience points (CR I p.188).
   * @param {Item} classItem
   * @param {object} [options]
   * @param {boolean} [options.free=false]  Do not spend experience
   */
  async levelUpClass(classItem, { free = false } = {}) {
    const cost = classItem.system.nextLevelCost;
    if ( cost === null ) return ui.notifications.warn(t("SW25.Warn.MaxLevel"));
    if ( !free && (this.system.exp.value < cost) ) {
      return ui.notifications.warn(t("SW25.Warn.NotEnoughExp", { cost, have: this.system.exp.value }));
    }
    const newLevel = classItem.system.level + 1;
    await classItem.update({ "system.level": newLevel });
    if ( !free ) await this.update({ "system.exp.value": this.system.exp.value - cost });
    await this._grantAutoFeats(classItem, newLevel);
    ui.notifications.info(t("SW25.Class.LeveledUp", { name: classItem.name, level: newLevel }));
  }

  /**
   * Lower a class level, refunding experience (corrections).
   * @param {Item} classItem
   */
  async levelDownClass(classItem) {
    const level = classItem.system.level;
    if ( level <= 1 ) return classItem.deleteDialog?.() ?? classItem.delete();
    const table = CONFIG.SW25.expTable[classItem.system.track] ?? CONFIG.SW25.expTable.minor;
    await classItem.update({ "system.level": level - 1 });
    await this.update({ "system.exp.value": this.system.exp.value + table[level] });
  }

  /**
   * Add automatically acquired combat feats of a class up to a level.
   * @param {Item} classItem
   * @param {number} level
   * @protected
   */
  async _grantAutoFeats(classItem, level) {
    if ( !game.settings.get("swordworld25", "autoFeats") ) return;
    const key = classItem.system.key;
    const pack = game.packs.get("swordworld25.feats");
    if ( !pack || !key ) return;
    const index = await pack.getIndex({ fields: ["system.autoGain", "system.acquisition"] });
    const toAdd = [];
    for ( const entry of index ) {
      const gain = entry.system?.autoGain;
      if ( !gain ) continue;
      const matches = [gain, ...(gain.alt ?? [])].some(g => (g.class === key) && Number.isInteger(g.level) && (g.level <= level));
      if ( !matches ) continue;
      if ( this.items.some(i => (i.type === "feat") && (i.name === entry.name)) ) continue;
      toAdd.push(entry.uuid);
    }
    if ( !toAdd.length ) return;
    const docs = await Promise.all(toAdd.map(uuid => fromUuid(uuid)));
    await this.createEmbeddedDocuments("Item", docs.filter(Boolean).map(d => d.toObject()));
  }
}
