import { modifiersField, sourceField, stringField } from "../fields.mjs";

const { HTMLField } = foundry.data.fields;

/**
 * Common data shared by every Item type.
 */
export default class ItemBaseModel extends foundry.abstract.TypeDataModel {

  /** @override */
  static defineSchema() {
    return {
      summary: stringField(""),
      description: new HTMLField({ required: true, blank: true, initial: "" }),
      source: sourceField(),
      modifiers: modifiersField()
    };
  }

  /** Localization prefixes for automatic field labels. */
  static LOCALIZATION_PREFIXES = ["SW25.Item"];

  /* -------------------------------------------- */

  /**
   * Is this item currently contributing its passive modifiers to the owning actor?
   * Subclasses override (equipment must be equipped, learned options always are).
   * @type {boolean}
   */
  get isActive() {
    return true;
  }

  /**
   * Modifiers that are always applied to the owning actor while the item is active.
   * @returns {object[]}
   */
  get passiveModifiers() {
    if ( !this.isActive ) return [];
    return this.modifiers.filter(m => (m.scope !== "use") && (m.target !== "target"));
  }

  /**
   * Short source reference such as "CR I p.219".
   * @type {string}
   */
  get sourceLabel() {
    const { book, page } = this.source;
    if ( !book ) return "";
    const books = { CR1: "CR I", CR2: "CR II", CR3: "CR III" };
    return `${books[book] ?? book}${page ? ` p.${page}` : ""}`;
  }

  /**
   * Data used to render a chat card for this item. Subclasses extend.
   * @returns {object}
   */
  getCardData() {
    return { summary: this.summary, source: this.sourceLabel };
  }
}
