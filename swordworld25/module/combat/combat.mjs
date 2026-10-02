import { evaluateCheck } from "../dice/check.mjs";
import { removeExpiredEffects } from "../helpers/effects.mjs";
import { applyDamageTo, regenerate } from "./damage.mjs";
import { rollPower } from "../dice/power.mjs";
import { createCard } from "../chat/card.mjs";
import { isResponsibleGM, renderSystemTemplate, t } from "../helpers/utils.mjs";
import { executeAsGM, registerSocketHandler } from "../helpers/socket.mjs";

/**
 * Is the free turn order within each side used (popcorn initiative)? The side that won initiative acts first: any of
 * its characters takes the turn when ready, and the other side follows once all of them have acted (CR I p.121-123).
 * @returns {boolean}
 */
export function popcornEnabled() {
  return !!game.settings.get("swordworld25", "popcornInitiative");
}

/**
 * Faction of a combatant: "pc" (the players' side) or "enemy".
 * @param {Combatant} combatant
 * @returns {"pc"|"enemy"}
 */
export function factionOf(combatant) {
  const disposition = combatant.token?.disposition;
  if ( disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE ) return "enemy";
  if ( disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY ) return "pc";
  return ["character", "mount"].includes(combatant.actor?.type) ? "pc" : "enemy";
}

/**
 * Combat with Sword World 2.5 side-based initiative (CR I p.121-123): the side with the highest initiative acts
 * first, ties go to the PCs. Within a side, characters act in any order.
 */
export class SW25Combat extends Combat {

  /**
   * Which faction acts first, derived from the highest initiative of each side.
   * @type {"pc"|"enemy"}
   */
  get firstFaction() {
    let pc = -Infinity;
    let enemy = -Infinity;
    for ( const c of this.combatants ) {
      if ( !Number.isNumeric(c.initiative) ) continue;
      if ( factionOf(c) === "pc" ) pc = Math.max(pc, c.initiative);
      else enemy = Math.max(enemy, c.initiative);
    }
    const override = this.getFlag("swordworld25", "firstFaction");
    if ( override ) return override;
    if ( (pc === -Infinity) && (enemy === -Infinity) ) return "pc";
    return pc >= enemy ? "pc" : "enemy";
  }

  /** @override */
  setupTurns() {
    this._sw25First = this.firstFaction;
    return super.setupTurns();
  }

  /* -------------------------------------------- */
  /*  Popcorn turns                               */
  /* -------------------------------------------- */

  /** Is this combat run with free turns within each side? */
  get popcorn() {
    return popcornEnabled();
  }

  /**
   * Has a combatant acted in the current round?
   * @param {Combatant} combatant
   * @returns {boolean}
   */
  hasActed(combatant) {
    return !!combatant && (combatant.getFlag("swordworld25", "acted") === this.round);
  }

  /**
   * Side whose characters act now: the first side until each of its standing members has acted, then the other.
   * Null before the combat starts and once everybody has acted.
   * @type {"pc"|"enemy"|null}
   */
  get actingFaction() {
    if ( !this.started ) return null;
    const first = this.firstFaction;
    const second = (first === "pc") ? "enemy" : "pc";
    const pending = faction => this.combatants.some(c => (factionOf(c) === faction) && !c.isDefeated && !this.hasActed(c));
    if ( pending(first) ) return first;
    if ( pending(second) ) return second;
    return null;
  }

  /**
   * May a user take the turn of a combatant now? The GM may take anyone's turn at any time; a player only the turn of
   * a character they own, on the side that acts, while nobody else is acting.
   * @param {Combatant} combatant
   * @param {User} [user]
   * @returns {boolean}
   */
  canTakeTurn(combatant, user = game.user) {
    if ( !this.started || !combatant || combatant.isDefeated || this.hasActed(combatant) ) return false;
    if ( this.combatant?.id === combatant.id ) return false;
    if ( user.isGM ) return true;
    if ( this.combatant ) return false;
    return combatant.testUserPermission(user, "OWNER") && (factionOf(combatant) === this.actingFaction);
  }

  /**
   * May a user end the current turn?
   * @param {User} [user]
   * @returns {boolean}
   */
  canEndTurn(user = game.user) {
    const current = this.combatant;
    return !!current && (user.isGM || current.testUserPermission(user, "OWNER"));
  }

  /**
   * Take the turn of a combatant (through the GM).
   * @param {string} combatantId
   */
  async takeTurn(combatantId) {
    return executeAsGM("popcorn", { combatId: this.id, op: "take", combatantId });
  }

  /** End the current turn: the combatant is marked as having acted (through the GM). */
  async endTurn() {
    if ( !this.combatant ) return;
    return executeAsGM("popcorn", { combatId: this.id, op: "end", combatantId: this.combatant.id });
  }

  /**
   * Mark a combatant as having acted this round, or not (the check box of the tracker).
   * @param {string} combatantId
   */
  async toggleActed(combatantId) {
    const acted = !this.hasActed(this.combatants.get(combatantId));
    return executeAsGM("popcorn", { combatId: this.id, op: "toggle", combatantId, acted, round: this.round });
  }

  /** Start the next round (through the GM). */
  async #requestNextRound() {
    return executeAsGM("popcorn", { combatId: this.id, op: "round", round: this.round });
  }

  /**
   * GM: a combatant starts its turn. A turn in progress ends first.
   * @param {Combatant} combatant
   * @internal
   */
  async _popcornTake(combatant) {
    if ( this.combatant && (this.combatant.id !== combatant.id) ) await this._popcornEnd({ advance: false });
    const index = this.turns.findIndex(c => c.id === combatant.id);
    if ( index < 0 ) return;
    await this.update({ turn: index }, { turnEvents: false });
    await this._onStartTurn(combatant, { round: this.round, turn: index, skipped: false });
  }

  /**
   * GM: the current turn ends. Once everybody has acted, the next round begins.
   * @param {object} [options]
   * @param {boolean} [options.advance=true]
   * @internal
   */
  async _popcornEnd({ advance = true } = {}) {
    const current = this.combatant;
    if ( current ) {
      await current.setFlag("swordworld25", "acted", this.round);
      await this._onEndTurn(current, { round: this.round, turn: this.turn, skipped: false });
      await this.update({ turn: null }, { turnEvents: false });
    }
    if ( advance && !this.actingFaction ) await this._popcornNextRound();
  }

  /**
   * GM: toggle the "has acted" mark of a combatant.
   * @param {Combatant} combatant
   * @internal
   */
  async _popcornToggle(combatant, acted) {
    if ( this.hasActed(combatant) === acted ) return;
    if ( acted && (this.combatant?.id === combatant.id) ) return this._popcornEnd();
    await combatant.setFlag("swordworld25", "acted", acted ? this.round : 0);
    if ( acted && !this.combatant && !this.actingFaction ) await this._popcornNextRound();
  }

  /**
   * GM: the round ends and the next one begins (nobody is acting yet).
   * @internal
   */
  async _popcornNextRound() {
    if ( this.combatant ) await this._popcornEnd({ advance: false });
    const round = this.round;
    if ( round >= 1 ) await this._onEndRound({ round, skipped: false });
    const next = round + 1;
    Hooks.callAll("combatRound", this, { round: next, turn: null }, { direction: 1 });
    await this.update({ round: next, turn: null }, {
      turnEvents: false, direction: 1, worldTime: { delta: this.getTimeDelta(round, null, next, null) }
    });
    await this._onStartRound({ round: next, skipped: false });
  }

  /** @override */
  async startCombat() {
    if ( !this.popcorn ) return super.startCombat();
    this._playCombatSound("startEncounter");
    const updateData = { round: 1, turn: null };
    Hooks.callAll("combatStart", this, updateData);
    await this.update(updateData, { turnEvents: false });
    if ( isResponsibleGM() ) await this._onStartRound({ round: 1, skipped: false });
    return this;
  }

  /**
   * Popcorn: "next turn" ends the current turn (or, when everybody has acted, starts the next round).
   * @override
   */
  async nextTurn() {
    if ( !this.popcorn ) return super.nextTurn();
    if ( this.combatant ) await this.endTurn();
    else if ( !this.actingFaction ) await this.#requestNextRound();
    else ui.notifications.info(t("SW25.Combat.TakeTurnHint"));
    return this;
  }

  /**
   * Popcorn: "previous turn" gives the current turn back (nobody acts, nothing is marked).
   * @override
   */
  async previousTurn() {
    if ( !this.popcorn ) return super.previousTurn();
    if ( this.combatant && game.user.isGM ) await this.update({ turn: null }, { turnEvents: false });
    return this;
  }

  /** @override */
  async nextRound() {
    if ( !this.popcorn || !this.started ) return super.nextRound();
    await this.#requestNextRound();
    return this;
  }

  /**
   * Popcorn: the acting combatant was removed from the tracker. Core gave its turn to the next one in the list (see
   * {@link SW25Combatant._preDeleteOperation}); nobody acts instead.
   * @override
   */
  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    if ( options.sw25ActingDeleted && (userId === game.user.id) && this.started ) {
      this.update({ turn: null }, { turnEvents: false });
    }
  }

  /** @override */
  _sortCombatants(a, b) {
    const first = a.parent?._sw25First ?? "pc";
    const fa = factionOf(a) === first ? 0 : 1;
    const fb = factionOf(b) === first ? 0 : 1;
    if ( fa !== fb ) return fa - fb;
    const ia = Number.isNumeric(a.initiative) ? a.initiative : -Infinity;
    const ib = Number.isNumeric(b.initiative) ? b.initiative : -Infinity;
    return (ib - ia) || (a.name?.localeCompare(b.name ?? "") ?? 0) || (a.id > b.id ? 1 : -1);
  }

  /**
   * Roll initiative: characters make Initiative checks, monsters use their fixed initiative value.
   * @override
   */
  async rollInitiative(ids, { updateTurn = true, messageOptions = {} } = {}) {
    ids = typeof ids === "string" ? [ids] : ids;
    const updates = [];
    const rows = [];
    const rolls = [];
    for ( const id of ids ) {
      const combatant = this.combatants.get(id);
      if ( !combatant?.isOwner ) continue;
      const actor = combatant.actor;
      let value;
      let dice = null;
      let diceList = null;
      let auto = null;
      if ( actor?.type === "character" ) {
        const check = actor.system.checks?.initiative;
        const roll = await evaluateCheck({ base: check?.value ?? 0, noAutoSuccess: true });
        rolls.push(roll);
        dice = roll.naturals.join("+");
        diceList = roll.naturals;
        value = roll.isAutoFailure ? 0 : roll.total;
        if ( roll.isAutoFailure ) auto = "failure";
      } else {
        value = actor?.system.initiativeTotal ?? actor?.system.initiative ?? 0;
      }
      updates.push({ _id: id, initiative: value });
      rows.push({ name: combatant.name, img: combatant.img, value, dice, diceList, auto, faction: factionOf(combatant) });
    }
    if ( !updates.length ) return this;
    const updateOptions = { turnEvents: false };
    if ( !updateTurn ) updateOptions.combatTurn = this.turn;
    await this.updateEmbeddedDocuments("Combatant", updates, updateOptions);

    const content = await renderSystemTemplate("chat/initiative.hbs", {
      rows,
      first: t(`SW25.Faction.${this.firstFaction}`)
    });
    const hidden = ids.every(id => this.combatants.get(id)?.hidden);
    const data = foundry.utils.mergeObject({
      content,
      rolls,
      speaker: ChatMessage.implementation.getSpeaker({ alias: t("SW25.Check.initiative") }),
      flags: { "core.initiativeRoll": true }
    }, messageOptions);
    ChatMessage.implementation.applyRollMode(data, hidden ? CONST.DICE_ROLL_MODES.PRIVATE : game.settings.get("core", "rollMode"));
    await ChatMessage.implementation.create(data);
    return this;
  }

  /**
   * Monsters get their fixed initiative immediately when added to the tracker.
   * @override
   */
  async _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if ( (collection !== "combatants") || (userId !== game.user.id) ) return;
    const updates = documents
      .filter(c => c.actor && (c.actor.type !== "character") && !Number.isNumeric(c.initiative))
      .map(c => ({ _id: c.id, initiative: c.actor.system.initiativeTotal ?? c.actor.system.initiative ?? 0 }));
    if ( updates.length ) await this.updateEmbeddedDocuments("Combatant", updates);
  }

  /**
   * End of a turn: HP regained (Raging Earth) and damage suffered (Poison Cloud) by the character whose turn ends,
   * and by the targets of effects acting at the end of their user's turns (Poison Needle). Runs for the designated GM.
   * @override
   */
  async _onEndTurn(combatant, context) {
    await super._onEndTurn?.(combatant, context);
    const ending = combatant.actor;
    if ( !ending || context.skipped ) return;
    const actors = new Map();
    for ( const c of this.combatants ) if ( c.actor ) actors.set(c.actor.uuid, c.actor);
    actors.set(ending.uuid, ending);
    for ( const actor of actors.values() ) {
      const turn = { damageTurn: 0, regenTurn: 0 };
      const types = new Set();
      const sources = { damageTurn: new Set(), regenTurn: new Set() };
      const powered = [];
      // Effects: at the end of the turn of their user (flag) or of the affected character
      for ( const effect of actor.appliedEffects ) {
        const turnOf = effect.getFlag("swordworld25", "turnOf");
        if ( turnOf ? (turnOf !== ending.uuid) : (actor !== ending) ) continue;
        const turnPower = effect.getFlag("swordworld25", "turnPower");
        if ( turnPower ) powered.push(turnPower);
        for ( const change of effect.changes ) {
          const key = change.key.replace(/^system\.bonuses\./, "");
          if ( !(key in turn) ) continue;
          turn[key] += Number(change.value) || 0;
          sources[key].add(effect.name);
          if ( key === "damageTurn" ) for ( const type of effect.getFlag("swordworld25", "types") ?? [] ) types.add(type);
        }
      }
      // Passive items of the character whose turn ends
      if ( actor === ending ) {
        for ( const key of Object.keys(turn) ) {
          for ( const src of actor.system.bonusSources?.[key] ?? [] ) {
            turn[key] += src.value;
            sources[key].add(src.source);
          }
        }
      }
      if ( turn.damageTurn > 0 ) {
        const section = (actor.type === "character") ? null : Math.max(0, (actor.system.sections ?? []).findIndex(s => s.main));
        await applyDamageTo(actor, {
          amount: turn.damageTurn, kind: "magic", types: [...types], section, source: [...sources.damageTurn].join(", ")
        });
      }
      if ( turn.regenTurn > 0 ) await regenerate(actor, turn.regenTurn, { source: [...sources.regenTurn].join(", "), sections: "main" });
      // Power-table damage of the effect (Lightning Bind, Blade Barrier, Summon Insects): a damage card to apply
      for ( const tp of powered ) await postTurnDamage(actor, tp);
    }
  }

  /**
   * End of a round: [Regeneration] of monsters (every section still standing).
   * @override
   */
  async _onEndRound(context) {
    await super._onEndRound?.(context);
    // Starting the combat "ends" round 0: nothing happens then
    if ( context.skipped || !(context.round >= 1) ) return;
    // Popcorn: effects whose last round ends now go, even when the one whose turn they waited for did not act
    if ( this.popcorn ) {
      for ( const c of this.combatants ) if ( c.actor ) await removeExpiredEffects(c.actor, { combat: this, roundEnded: context.round });
    }
    const done = new Set();
    for ( const combatant of this.combatants ) {
      const actor = combatant.actor;
      if ( !actor || combatant.defeated || done.has(actor.uuid) ) continue;
      done.add(actor.uuid);
      const regen = actor.system.bonuses?.regenRound ?? 0;
      if ( regen > 0 ) await regenerate(actor, regen, { source: sourceOf(actor, "regenRound") });
    }
  }

  /**
   * Clean up expired effects at every turn change.
   * @override
   */
  async _onStartTurn(combatant, context) {
    await super._onStartTurn?.(combatant, context);
    // Core runs turn events on the active GM only; popcorn turns run them on the GM who changed the turn
    if ( !game.user.isGM ) return;
    const options = this.popcorn ? { combat: this, turnOf: combatant.actor?.uuid ?? null } : {};
    for ( const c of this.combatants ) {
      if ( c.actor ) await removeExpiredEffects(c.actor, options);
    }
  }
}

/**
 * Combatant: default initiative formula per actor type.
 */
export class SW25Combatant extends Combatant {

  /**
   * Popcorn: removing the acting combatant does not hand the turn (and its turn events) to the next one in the list.
   * @override
   */
  static async _preDeleteOperation(documents, operation, user) {
    await super._preDeleteOperation(documents, operation, user);
    const combat = operation.parent;
    if ( !combat?.popcorn || !combat.combatant || !operation.ids.includes(combat.combatant.id) ) return;
    operation.turnEvents = false;
    operation.sw25ActingDeleted = true;
  }

  /** @override */
  _getInitiativeFormula() {
    const actor = this.actor;
    if ( !actor ) return "2d6";
    if ( actor.type === "character" ) return `2d6 + ${actor.system.checks?.initiative?.value ?? 0}`;
    return String(actor.system.initiativeTotal ?? actor.system.initiative ?? 0);
  }

  /** Faction of the combatant. */
  get faction() {
    return factionOf(this);
  }
}

/**
 * Names of the items and effects giving an actor a bonus, for the logs.
 * @param {Actor} actor
 * @param {string} key
 * @returns {string}
 */
function sourceOf(actor, key) {
  const names = new Set((actor.system.bonusSources?.[key] ?? []).map(s => s.source));
  for ( const effect of actor.appliedEffects ) {
    if ( effect.changes.some(c => c.key === `system.bonuses.${key}`) ) names.add(effect.name);
  }
  return [...names].join(", ");
}

/**
 * Roll the power-table damage an effect deals at the end of a turn and post it as a damage card for its target.
 * @param {Actor} actor
 * @param {{power: number, critical: number|null, extra: number, kind: string, types: string[], name: string}} tp
 */
async function postTurnDamage(actor, tp) {
  const { result, rolls } = await rollPower({ power: tp.power ?? 0, critical: tp.critical ?? null, extra: tp.extra ?? 0 });
  const tokenUuid = actor.token?.uuid ?? actor.getActiveTokens(false, true)[0]?.uuid ?? null;
  await createCard({
    kind: "damage",
    actorUuid: null,
    title: tp.name,
    subtitle: t("SW25.Card.Damage"),
    img: "icons/svg/degen.svg",
    damage: { kind: tp.kind ?? "magic", types: tp.types ?? [], heal: false },
    result,
    targets: [{ tokenUuid, actorUuid: actor.uuid, name: actor.name, img: actor.img, amount: result.calculated }]
  }, { rolls, speaker: ChatMessage.implementation.getSpeaker({ alias: tp.name }) });
}

/* -------------------------------------------- */

/**
 * Popcorn turns are changed by the GM: players ask through the socket.
 * Ops: take (a combatant's turn), end (the current turn), toggle (the "has acted" mark), round (next round).
 */
registerSocketHandler("popcorn", async ({ combatId, op, combatantId, acted, round }, userId) => {
  const combat = game.combats.get(combatId);
  const user = game.users.get(userId);
  if ( !combat || !user ) return;
  const combatant = combatantId ? combat.combatants.get(combatantId) : null;
  // Requests are serialized and checked against the state they were made for: a double click acts once
  switch ( op ) {
    case "take":
      if ( combatant && combat.canTakeTurn(combatant, user) ) await combat._popcornTake(combatant);
      break;
    case "end":
      if ( (combat.combatant?.id === combatantId) && combat.canEndTurn(user) ) await combat._popcornEnd();
      break;
    case "toggle":
      if ( combat.round !== round ) break;
      if ( combatant && (user.isGM || combatant.testUserPermission(user, "OWNER")) ) await combat._popcornToggle(combatant, !!acted);
      break;
    case "round":
      if ( combat.round !== round ) break;
      if ( user.isGM || !combat.actingFaction ) await combat._popcornNextRound();
      break;
  }
}, { serial: true });
