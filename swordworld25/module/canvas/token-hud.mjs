import { t } from "../helpers/utils.mjs";
import { showMonsterToPlayers } from "../workflows/knowledge.mjs";

/**
 * Extra Token HUD buttons: spellbook, loot, tracker.
 */
export function registerTokenHud() {
  Hooks.on("renderTokenHUD", (hud, html) => {
    const token = hud.object?.document;
    const actor = token?.actor;
    if ( !actor ) return;
    const column = html.querySelector(".col.left");
    if ( !column ) return;

    const add = (icon, tooltip, handler) => {
      const button = document.createElement("button");
      button.type = "button";
      button.classList.add("control-icon", "sw25-hud-button");
      button.dataset.tooltip = tooltip;
      button.innerHTML = `<i class="${icon}"></i>`;
      button.addEventListener("click", event => {
        event.preventDefault();
        handler(event);
      });
      column.append(button);
    };

    const canCast = (actor.type === "character")
      ? Object.keys(actor.system.magic ?? {}).length || Object.values(actor.system.learned ?? {}).some(l => l.count)
      : actor.items.some(i => i.system.spellcasting?.system);
    if ( actor.isOwner && canCast ) {
      add("fa-solid fa-book-sparkles", t("SW25.Spellbook.Title"), () => game.sw25.SpellbookApp.openFor(actor));
    }
    if ( game.user.isGM && (actor.type === "monster") && actor.system.loot?.length ) {
      add("fa-solid fa-sack-dollar", t("SW25.Loot.Roll"), () => actor.rollLoot());
    }
    if ( game.user.isGM && ["monster", "trap"].includes(actor.type) ) {
      add("fa-solid fa-users-viewfinder", t("SW25.Monster.ShowPlayers"), () => showMonsterToPlayers(actor));
    }
  });
}
