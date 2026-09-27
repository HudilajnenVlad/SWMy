/**
 * Token document: exposes custom resource trackers as selectable token bars.
 */
export default class SW25TokenDocument extends foundry.documents.TokenDocument {

  /** @override */
  static getTrackedAttributes(data, _path = []) {
    const attributes = super.getTrackedAttributes(data, _path);
    if ( _path.length ) return attributes;
    // When inspecting an actor's data model instance, add its custom resources and section HP bars.
    if ( data instanceof foundry.abstract.DataModel ) {
      const resources = data.resources ?? {};
      for ( const id of Object.keys(resources) ) attributes.bar.push(["resources", id]);
      const sections = data.sections ?? [];
      sections.forEach((s, i) => {
        attributes.bar.push(["sections", String(i), "hp"]);
        attributes.bar.push(["sections", String(i), "mp"]);
      });
      if ( data.rhythm ) for ( const k of ["up", "down", "heart"] ) attributes.value.push(["rhythm", k]);
    }
    return attributes;
  }

  /** @override */
  static getTrackedAttributeChoices(attributes) {
    const choices = super.getTrackedAttributeChoices(attributes);
    // Friendly labels for custom resources
    for ( const choice of choices ) {
      if ( choice.value.startsWith("resources.") ) choice.label = `${game.i18n.localize("SW25.Resources.label")}: ${choice.value.split(".")[1]}`;
    }
    return choices;
  }

  /** @override */
  getBarAttribute(barName, { alternative } = {}) {
    const bar = super.getBarAttribute(barName, { alternative });
    if ( bar && this.actor && bar.attribute?.startsWith("resources.") ) {
      const id = bar.attribute.split(".")[1];
      const res = this.actor.system.resources?.[id];
      if ( res ) bar.label = res.label;
    }
    return bar;
  }
}
