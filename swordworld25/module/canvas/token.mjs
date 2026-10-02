/**
 * Token placeable: the status icons are laid out between the resource bars (bar 2 on top, bar 1 at the bottom), so
 * that they never cover the HP bar however many there are. The core draws them from the top-left corner down to the
 * bottom edge, over both bars.
 */
export default class SW25Token extends foundry.canvas.placeables.Token {

  /** @override */
  _refreshEffects() {
    const s = canvas.dimensions.uiScale;
    const { width, height } = this.document.getSize();
    const barHeight = 8 * (this.document.height >= 2 ? 1.5 : 1) * s;
    const top = this.#hasBar("bar2") ? barHeight : 0;
    const bottom = this.#hasBar("bar1") ? barHeight : 0;
    const size = 20 * s;
    const rows = Math.max(1, Math.floor(((height - top - bottom) / size) + 1e-6));
    const bg = this.effects.bg.clear().beginFill(0x000000, 0.40).lineStyle(s, 0x000000);
    let i = 0;
    for ( const effect of this.effects.children ) {
      if ( effect === bg ) continue;

      // Overlay effect (defeated...): centered, as in the core
      if ( effect === this.effects.overlay ) {
        const overlaySize = Math.min(width * 0.6, height * 0.6);
        effect.width = effect.height = overlaySize;
        effect.position = this.document.getCenterPoint({ x: 0, y: 0 });
        effect.anchor.set(0.5, 0.5);
        continue;
      }

      // Status icons: columns between the bars
      effect.width = effect.height = size;
      effect.x = Math.floor(i / rows) * size;
      effect.y = top + ((i % rows) * size);
      bg.drawRoundedRect(effect.x + s, effect.y + s, size - (2 * s), size - (2 * s), 2 * s);
      i++;
    }
  }

  /**
   * Does the token draw a bar (whether or not it is shown right now: hovering must not move the icons)?
   * @param {string} name  bar1 | bar2
   * @returns {boolean}
   */
  #hasBar(name) {
    if ( this.document.displayBars === CONST.TOKEN_DISPLAY_MODES.NONE ) return false;
    return !!this.document.getBarAttribute(name);
  }

  /**
   * Clicking a token, even one already selected, makes its actor the one the effects panel shows.
   * @override
   */
  _onClickLeft(event) {
    super._onClickLeft(event);
    if ( this.controlled ) Hooks.callAll("sw25.tokenFocus", this);
  }

  /** @override */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    // The icons make room for the bars: lay them out again when the bars change
    if ( ("bar1" in changed) || ("bar2" in changed) || ("displayBars" in changed) ) {
      this.renderFlags.set({ refreshEffects: true });
    }
  }
}
