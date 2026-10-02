import { executeAsGM, registerSocketHandler } from "../helpers/socket.mjs";
import { actorFromUuid, PAPER_DIALOG, speakerFor, t } from "../helpers/utils.mjs";

/**
 * Handing items over: an item of a character's inventory dragged onto another token moves to that token's actor.
 * The giver must own the item; the receiver may belong to someone else (the GM then performs the change).
 */

/** Item types that can be handed over. */
const TRANSFERABLE = ["weapon", "armor", "gear"];

/**
 * Drop handler for items dragged onto the canvas: give the item to the actor of the token under the pointer.
 * @param {object} data   Drop data (uuid, x, y in canvas coordinates)
 * @returns {boolean}     False when the drop was handled
 */
export function onDropItemOnToken(data) {
  if ( data.type !== "Item" ) return true;
  const item = fromUuidSync(data.uuid, { strict: false });
  const source = item?.parent;
  if ( !(source instanceof Actor) || !TRANSFERABLE.includes(item.type) ) return true;
  const token = canvas.tokens.placeables
    .filter(tk => (game.user.isGM || !tk.document.hidden) && tk.bounds.contains(data.x, data.y))
    .sort((a, b) => b.document.sort - a.document.sort)[0];
  const target = token?.actor;
  if ( !target || (target.uuid === source.uuid) ) return true;
  giveItem(item, target).catch(err => {
    console.error(err);
    ui.notifications.error(err.message);
  });
  return false;
}

/**
 * Give some or all of an item stack to another actor.
 * @param {Item} item
 * @param {Actor} target
 */
export async function giveItem(item, target) {
  const source = item.parent;
  if ( !source?.isOwner ) return ui.notifications.warn(t("SW25.Transfer.NotOwner", { name: item.name }));
  if ( !["character", "party", "mount"].includes(target.type) && !game.user.isGM ) {
    return ui.notifications.warn(t("SW25.Transfer.BadTarget", { name: target.name }));
  }
  const stack = Math.max(1, item.system.quantity ?? 1);
  let quantity = stack;
  if ( stack > 1 ) {
    quantity = await foundry.applications.api.DialogV2.prompt({
      window: { title: t("SW25.Transfer.Title", { name: item.name }), icon: "fa-solid fa-hand-holding-hand" },
      classes: PAPER_DIALOG,
      content: `<p>${t("SW25.Transfer.HowMany", { name: item.name, target: target.name })}</p>
        <label class="swp-field">${t("SW25.Quantity")}<input type="number" name="quantity" value="${stack}" min="1" max="${stack}" step="1" autofocus></label>`,
      ok: { label: t("SW25.Transfer.Give"), icon: "fa-solid fa-hand-holding-hand", callback: (event, button) => Number(button.form.elements.quantity.value) },
      rejectClose: false
    });
    if ( !Number.isFinite(quantity) ) return;
    quantity = Math.clamp(Math.floor(quantity), 0, stack);
    if ( !quantity ) return;
  } else {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("SW25.Transfer.Title", { name: item.name }), icon: "fa-solid fa-hand-holding-hand" },
      classes: PAPER_DIALOG,
      content: `<p>${t("SW25.Transfer.Confirm", { name: item.name, target: target.name })}</p>`,
      rejectClose: false
    });
    if ( !ok ) return;
  }

  // One operation: the receiver gets the items, then the giver loses them (through the GM for someone else's actor)
  const payload = { itemUuid: item.uuid, targetUuid: target.uuid, quantity };
  if ( target.isOwner ) await transferItem(payload, game.user.id);
  else await executeAsGM("transferItem", payload);
}

/**
 * Move some of an item stack from its actor to another one. The receiver stacks it onto the same item it already
 * carries (same type, name and price, not equipped), or gets a new one; then the giver's stack shrinks. Only a user
 * owning the item may give it.
 * @param {{itemUuid: string, targetUuid: string, quantity: number}} payload
 * @param {string} userId   Who asked
 */
async function transferItem({ itemUuid, targetUuid, quantity }, userId) {
  const item = fromUuidSync(itemUuid, { strict: false });
  const source = item?.parent;
  const target = actorFromUuid(targetUuid);
  const user = game.users.get(userId);
  if ( !(source instanceof Actor) || !target || !user || (source.uuid === target.uuid) ) return;
  if ( !item.testUserPermission(user, "OWNER") ) return;
  const stack = Math.max(1, item.system.quantity ?? 1);
  quantity = Math.clamp(Math.floor(Number(quantity) || 0), 0, stack);
  if ( !quantity ) return;
  const data = item.toObject();
  delete data._id;
  foundry.utils.setProperty(data, "system.quantity", quantity);
  foundry.utils.setProperty(data, "system.equipped", false);
  if ( "equippedSlot" in (data.system ?? {}) ) data.system.equippedSlot = "";
  if ( "hand" in (data.system ?? {}) ) data.system.hand = "";
  const same = target.items.find(i => (i.type === data.type) && (i.name === data.name) && !i.system.equipped
    && (i.system.price === data.system?.price) && ("quantity" in i.system));
  if ( same ) await same.update({ "system.quantity": (same.system.quantity ?? 1) + quantity });
  else await target.createEmbeddedDocuments("Item", [data]);
  if ( quantity >= stack ) await item.delete();
  else await item.update({ "system.quantity": stack - quantity });
  await ChatMessage.implementation.create({
    speaker: speakerFor(source),
    content: `<div class="sw25 swp swp-chat swp-chat-note-card"><p><i class="fa-solid fa-hand-holding-hand"></i> ${t("SW25.Transfer.Done", {
      name: item.name, quantity, target: target.token?.name ?? target.name })}</p></div>`
  });
}

registerSocketHandler("transferItem", transferItem, { serial: true });
