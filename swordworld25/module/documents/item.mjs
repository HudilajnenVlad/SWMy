import { declareFeat, rollWeaponAttack, useAbility } from "../workflows/attacks.mjs";
import {
  castSpell, performFinale, performSong, postItemCard, useEvocation, useGear, useTechnique
} from "../workflows/magic.mjs";
import { applyEffects, buildEffectData } from "../helpers/effects.mjs";
import { getTargetTokens, t } from "../helpers/utils.mjs";

/**
 * Sword World 2.5 Item document.
 */
export default class SW25Item extends Item {

  /** @override */
  static getDefaultArtwork(itemData) {
    const img = CONFIG.SW25?.defaultIcons?.[itemData?.type];
    return img ? { img } : super.getDefaultArtwork(itemData);
  }

  /* -------------------------------------------- */

  /** @override */
  async _onCreate(data, options, userId) {
    await super._onCreate(data, options, userId);
    if ( (userId !== game.user.id) || !this.parent ) return;
    if ( (this.type === "class") && (this.parent.type === "character") ) {
      await this.parent._grantAutoFeats?.(this, this.system.level);
    }
  }

  /* -------------------------------------------- */

  /**
   * Use the item: attack, cast, perform, consume...
   * @param {object} [options]
   * @param {Event} [options.event]
   * @param {Actor} [options.actor]  Actor using the item (defaults to the owner)
   */
  async use({ event, actor } = {}) {
    actor ??= this.actor;
    if ( !actor ) return postItemCard(null, this);
    switch ( this.type ) {
      case "weapon": return rollWeaponAttack(actor, this, { event });
      case "spell": return castSpell(actor, this, { event });
      case "technique": return useTechnique(actor, this, { event });
      case "spellsong": return performSong(actor, this, { event });
      case "finale": return performFinale(actor, this, { event });
      case "evocation": return useEvocation(actor, this, { event });
      case "ability": return useAbility(actor, this, { event });
      case "gear":
        if ( this.system.isUsable ) return useGear(actor, this, { event });
        return postItemCard(actor, this);
      case "effect": return this.applyTo();
      case "feat":
        // Feats lasting for the round are declared from the sheet; the others are declared with an attack or spell
        if ( (this.system.featType === "active") && /^lasts/i.test(this.system.application ?? "") ) return declareFeat(actor, this);
        return postItemCard(actor, this);
      default: return postItemCard(actor, this);
    }
  }

  /**
   * Post the item description to chat.
   */
  toChat() {
    return postItemCard(this.actor, this);
  }

  /**
   * Apply an effect preset to the targeted tokens (T).
   * @param {Actor[]} [actors]
   */
  async applyTo(actors) {
    if ( this.type !== "effect" ) return;
    actors ??= getTargetTokens().map(tk => tk.actor);
    if ( !actors.length ) return ui.notifications.warn(t("SW25.Warn.NoTargetsForEffect"));
    const data = buildEffectData({
      name: this.name,
      img: this.img,
      modifiers: this.system.modifiers,
      duration: this.system.duration,
      origin: this.uuid,
      statuses: this.system.statuses,
      description: this.system.description,
      flags: this.system.stackable ? { swordworld25: { stackable: true } } : {}
    });
    for ( const actor of actors ) await applyEffects(actor, [foundry.utils.deepClone(data)]);
  }
}
