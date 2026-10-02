import { executeAsGM, registerSocketHandler } from "../helpers/socket.mjs";
import { actorFromUuid, gamels, PAPER_DIALOG, parseRange, renderSystemTemplate, speakerFor, t } from "../helpers/utils.mjs";

/** Icon of loot items taken from a loot card. */
const LOOT_ICON = "icons/svg/item-bag.svg";

/**
 * Loot (CR I p.123): a 2d roll on the monster's loot table, posted as a card. Every row can be taken from the card by
 * a character (or put into the party's shared equipment) as a loot item, to be sold later for its price or turned
 * into a crude material card by an Alchemist (CR III p.112).
 */

/**
 * Roll loot for a monster.
 * @param {Actor} monster
 * @param {object} [options]
 * @param {Actor} [options.looter]  Character performing the loot determination (adds loot bonuses)
 */
export async function rollLoot(monster, { looter = null } = {}) {
  const loot = monster.system.loot ?? [];
  if ( !loot.length ) return ui.notifications.info(t("SW25.Loot.None"));
  const bonus = (looter?.system?.bonuses?.loot ?? 0);
  const roll = new Roll(`2d6 + ${bonus}`);
  await roll.evaluate();
  const total = roll.total;
  const rows = [];
  for ( const row of loot ) {
    // The printed roll text is authoritative (it is what the sheet edits); min/max are a fallback
    let range = parseRange(row.roll);
    if ( !range.always && !Number.isInteger(range.min) ) range = { min: row.min, max: row.max, always: false };
    const always = range.always;
    const within = !always && Number.isInteger(range.min) && (total >= range.min)
      && (!Number.isInteger(range.max) || (total <= range.max));
    if ( !(always || within) ) continue;
    rows.push({
      roll: row.roll, always, item: row.item, price: Number.isInteger(row.price) ? row.price : null,
      priceText: row.priceText ?? "", cards: row.cards ?? "",
      quantityText: row.quantity ?? "", quantity: await rollQuantity(row.quantity), taken: null
    });
  }
  // Sword shards are always found (they raise the party's reputation when handed in)
  if ( monster.system.swordShards ) {
    rows.push({ roll: "", always: true, item: t("SW25.SwordShards"), price: null, priceText: "", cards: "",
      quantityText: "", quantity: monster.system.swordShards, taken: null, shards: true });
  }
  const state = {
    monster: monster.token?.name ?? monster.name, img: monster.img, total, bonus, looter: looter?.name ?? "",
    dice: roll.dice[0].results.map(r => r.result)
  };
  await ChatMessage.implementation.create({
    content: await renderLootCard(state, rows),
    rolls: [roll],
    speaker: speakerFor(monster),
    sound: CONFIG.sounds.dice,
    flags: { swordworld25: { kind: "loot", loot: { ...state, rows } } }
  });
}

/**
 * Number of pieces of a loot row: "2", "1d" (rolled), or 1.
 * @param {string} text
 * @returns {Promise<number>}
 */
async function rollQuantity(text) {
  const s = String(text ?? "").trim();
  if ( !s ) return 1;
  if ( /^\d+$/.test(s) ) return Math.max(1, Number(s));
  const m = s.match(/^(\d*)d(\d*)$/i);
  if ( m ) {
    const roll = await new Roll(`${m[1] || 1}d${m[2] || 6}`).evaluate();
    return Math.max(1, roll.total);
  }
  return 1;
}

/**
 * HTML of a loot card.
 * @param {object} state
 * @param {object[]} rows
 * @returns {Promise<string>}
 */
async function renderLootCard(state, rows) {
  return renderSystemTemplate("chat/loot.hbs", {
    name: state.monster,
    img: state.img,
    total: state.total,
    diceList: state.dice,
    bonus: state.bonus,
    looter: state.looter,
    hasParty: !!partyActor(),
    rows: rows.map((r, index) => ({
      ...r, index,
      quantityLabel: (r.quantity > 1) ? `×${r.quantity}` : "",
      priceLabel: Number.isInteger(r.price) ? `${r.price}G` : (r.priceText || "")
    }))
  });
}

/** The party actor of the world, if any. */
function partyActor() {
  return game.actors.find(a => a.type === "party") ?? null;
}

/* -------------------------------------------- */
/*  Taking loot from a card                     */
/* -------------------------------------------- */

/**
 * Take a row of a loot card: to the character of the user (the selected token's, or the assigned character), or to
 * the party's shared equipment. The GM performs it (the card belongs to the GM).
 * @param {ChatMessage} message
 * @param {number} index
 * @param {object} [options]
 * @param {boolean} [options.party=false]
 */
export async function takeLoot(message, index, { party = false } = {}) {
  const loot = message.getFlag("swordworld25", "loot");
  const row = loot?.rows?.[index];
  if ( !row ) return;
  if ( row.taken ) return ui.notifications.info(t("SW25.Loot.AlreadyTaken", { name: row.taken }));
  let actor;
  if ( party ) actor = partyActor();
  else {
    actor = canvas.tokens?.controlled.find(tk => tk.actor?.type === "character")?.actor ?? game.user.character;
    if ( actor && !actor.isOwner ) actor = null;
  }
  if ( !actor ) return ui.notifications.warn(t(party ? "SW25.Loot.NoParty" : "SW25.Loot.NoRecipient"));
  await executeAsGM("takeLoot", { messageId: message.id, index, actorUuid: actor.uuid });
}

registerSocketHandler("takeLoot", async ({ messageId, index, actorUuid }, userId) => {
  const message = game.messages.get(messageId);
  const actor = actorFromUuid(actorUuid);
  const user = game.users.get(userId);
  const loot = foundry.utils.deepClone(message?.getFlag("swordworld25", "loot"));
  const row = loot?.rows?.[index];
  if ( !row || row.taken || !actor || !user ) return;
  const allowed = (actor.type === "party") ? actor.testUserPermission(user, "LIMITED") : actor.testUserPermission(user, "OWNER");
  if ( !allowed ) return;
  row.taken = actor.name;
  await message.update({ content: await renderLootCard(loot, loot.rows), "flags.swordworld25.loot": loot });
  await giveLootItem(actor, row, loot.monster);
}, { serial: true });

/**
 * Add a loot row to an actor's items: the same loot already carried (same name and price) is stacked.
 * @param {Actor} actor
 * @param {object} row
 * @param {string} monster
 */
async function giveLootItem(actor, row, monster) {
  const { colors, rank } = parseCards(row.cards);
  const same = actor.items.find(i => (i.type === "gear") && (i.system.itemType === "loot") && (i.name === row.item)
    && (i.system.price === row.price));
  if ( same ) return same.update({ "system.quantity": same.system.quantity + row.quantity });
  return actor.createEmbeddedDocuments("Item", [{
    name: row.item,
    type: "gear",
    img: LOOT_ICON,
    system: {
      itemType: "loot",
      price: row.price,
      priceText: Number.isInteger(row.price) ? "" : (row.priceText ?? ""),
      quantity: row.quantity,
      card: { color: colors.join(" "), rank },
      summary: t("SW25.Loot.ItemSummary", { monster, cards: row.cards || "—" })
    }
  }]);
}

/**
 * Colors and rank of the crude material card a loot gives: "Black White A" → black or white, rank A.
 * @param {string} text
 * @returns {{colors: string[], rank: string}}
 */
export function parseCards(text) {
  const words = String(text ?? "").split(/[\s,/]+/).filter(Boolean);
  const colors = words.map(w => w.toLowerCase()).filter(w => w in CONFIG.SW25.cardColors);
  // "A-SS": the lowest rank
  const rankWord = words.find(w => /^(B|A|S|SS)(-|$)/.test(w));
  const rank = rankWord ? rankWord.split("-")[0] : "";
  return { colors, rank };
}

/* -------------------------------------------- */
/*  Selling loot, crude material cards          */
/* -------------------------------------------- */

/**
 * Sell a loot item (or any priced item) for its price: the gamels go to the character's money.
 * @param {Actor} actor
 * @param {Item} item
 */
export async function sellLoot(actor, item) {
  const price = item.system.price;
  if ( !Number.isInteger(price) ) return ui.notifications.warn(t("SW25.Loot.NoPrice", { name: item.name }));
  const quantity = Math.max(1, item.system.quantity ?? 1);
  const total = price * quantity;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: t("SW25.Loot.Sell"), icon: "fa-solid fa-coins" },
    classes: PAPER_DIALOG,
    content: `<p>${t("SW25.Loot.SellConfirm", { name: item.name, quantity, total: gamels(total) })}</p>`,
    rejectClose: false
  });
  if ( !ok ) return;
  const holder = item.parent;
  if ( holder?.type === "character" ) await holder.update({ "system.money": (holder.system.money ?? 0) + total });
  else if ( holder?.type === "party" ) await holder.update({ "system.money": (holder.system.money ?? 0) + total });
  await item.delete();
  await ChatMessage.implementation.create({
    speaker: speakerFor(actor),
    content: `<div class="sw25 swp swp-chat swp-chat-note-card"><p><i class="fa-solid fa-coins"></i> ${t("SW25.Loot.Sold", {
      name: item.name, quantity, total: gamels(total) })}</p></div>`
  });
}

/**
 * Rank of a crude material card made from loot of a sale price (CR III p.112): B 10-99, A 100-999, S 1000-9999,
 * SS 10000+; cheaper loot cannot be used.
 * @param {number|null} price
 * @returns {string}
 */
export function crudeRankForPrice(price) {
  if ( !Number.isInteger(price) || (price < 10) ) return "";
  if ( price < 100 ) return "B";
  if ( price < 1000 ) return "A";
  if ( price < 10000 ) return "S";
  return "SS";
}

/**
 * An Alchemist turns one piece of loot into a crude material card (10 minutes with an Alchemy Kit; the loot is
 * destroyed). Its color is given by the loot (a choice when several are listed), its rank by the loot or its price.
 * @param {Actor} actor
 * @param {Item} item
 */
export async function makeCrudeCard(actor, item) {
  if ( !actor.system.classes?.alchemist ) return ui.notifications.warn(t("SW25.Loot.NotAlchemist", { name: actor.name }));
  const card = item.system.card ?? {};
  const rank = CONFIG.SW25.cardRanks.includes(card.rank) ? card.rank : crudeRankForPrice(item.system.price);
  if ( !rank ) return ui.notifications.warn(t("SW25.Loot.TooCheap", { name: item.name }));
  let colors = String(card.color ?? "").split(/[\s,]+/).filter(c => c in CONFIG.SW25.cardColors);
  // Loot without a listed color: the GM decides, any color can be picked
  if ( !colors.length ) colors = Object.keys(CONFIG.SW25.cardColors);
  let color = colors[0];
  if ( colors.length > 1 ) {
    color = await foundry.applications.api.DialogV2.wait({
      window: { title: t("SW25.Loot.CrudeCard"), icon: "fa-solid fa-layer-group" },
      classes: PAPER_DIALOG,
      content: `<p>${t("SW25.Loot.ChooseColor", { name: item.name, rank })}</p>`,
      buttons: colors.map((c, i) => ({ action: c, label: t(CONFIG.SW25.cardColors[c]), default: i === 0, callback: () => c })),
      rejectClose: false
    });
    if ( !colors.includes(color) ) return;
  }
  const have = actor.system.cards?.[color]?.[rank] ?? 0;
  await actor.update({ [`system.cards.${color}.${rank}`]: have + 1 });
  if ( (item.system.quantity ?? 1) > 1 ) await item.update({ "system.quantity": item.system.quantity - 1 });
  else await item.delete();
  await ChatMessage.implementation.create({
    speaker: speakerFor(actor),
    content: `<div class="sw25 swp swp-chat swp-chat-note-card"><p><i class="fa-solid fa-layer-group"></i> ${t("SW25.Loot.CardMade", {
      name: item.name, color: t(CONFIG.SW25.cardColors[color]), rank })}</p></div>`
  });
}
