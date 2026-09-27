import { evaluateCheck } from "../dice/check.mjs";
import { removeExpiredEffects } from "../helpers/effects.mjs";
import { applyDamageTo, regenerate } from "./damage.mjs";
import { rollPower } from "../dice/power.mjs";
import { createCard } from "../chat/card.mjs";
import { isResponsibleGM, renderSystemTemplate, t } from "../helpers/utils.mjs";

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
    if ( !isResponsibleGM() ) return;
    for ( const c of this.combatants ) {
      if ( c.actor ) await removeExpiredEffects(c.actor);
    }
  }
}

/**
 * Combatant: default initiative formula per actor type.
 */
export class SW25Combatant extends Combatant {

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
