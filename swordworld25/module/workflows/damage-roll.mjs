import { rollFormulaDamage, rollPower } from "../dice/power.mjs";
import { cardActor, createCard, getCard, snapshotTargets, updateCard } from "../chat/card.mjs";
import { applyDamageTo } from "../combat/damage.mjs";
import { applyEffects, buildEffectData, modifiersFor, raiseCurrentHp, removeEffects } from "../helpers/effects.mjs";
import { actorFromUuid, getTargetTokens, speakerFor, t } from "../helpers/utils.mjs";

/**
 * Roll the damage (or healing) configured on a workflow card.
 * Resisted "Half" targets roll without criticals and are halved (CR I p.169-170); missed/negated targets are skipped.
 * @param {ChatMessage} message
 */
export async function rollDamageFromCard(message) {
  const state = getCard(message);
  if ( !state?.damage ) return;
  const actor = cardActor(state);
  if ( actor && !actor.isOwner ) return ui.notifications.warn(t("SW25.Warn.NotOwner"));
  const dmg = state.damage;
  const targets = state.targets ?? [];

  // Which targets receive the effect, and how. Targets whose damage was already rolled keep it: after targets were
  // added to the card, only the new ones are rolled.
  const plan = [];
  if ( !targets.length ) plan.push({ target: null, halve: false, index: null });
  let alreadyRolled = 0;
  targets.forEach((target, index) => {
    if ( ["miss", "failed"].includes(target.outcome) ) return;
    if ( (target.outcome === "resisted") && (state.resistance === "neg") ) return;
    if ( target.damageRolled ) {
      alreadyRolled += 1;
      return;
    }
    const halve = (target.outcome === "resisted") && (state.resistance === "half");
    plan.push({ target, halve, index });
  });
  if ( !plan.length ) return ui.notifications.info(t(alreadyRolled ? "SW25.Card.DamageAlreadyRolled" : "SW25.Card.NoValidTargets"));

  const rolls = [];
  const results = [];
  // One roll per target (criticals and halving are individual); identical unresisted targets can share a roll
  const shared = game.settings.get("swordworld25", "sharedDamageRoll");
  let sharedResult = null;
  for ( const entry of plan ) {
    let result;
    const targetActor = entry.target ? (actorFromUuid(entry.target.tokenUuid) ?? actorFromUuid(entry.target.actorUuid)) : null;
    // Raise negative HP to 0 (Vital Force): nothing to roll
    if ( dmg.mode === "toZero" ) {
      const hp = targetActor?.system.hp?.value ?? 0;
      const amount = Math.max(0, -hp);
      results.push({ entry, result: { formula: "→ 0", steps: [], tableTotal: amount, extra: 0, calculated: amount, crits: 0, fumble: false, halved: false } });
      continue;
    }
    // Attacks against a character whose Critical Value is lowered (Weak Point)
    const critTaken = (!dmg.heal && Number.isFinite(dmg.critical)) ? (targetActor?.system.bonuses?.criticalTaken ?? 0) : 0;
    const rollDmg = critTaken ? { ...dmg, critical: dmg.critical + critTaken } : dmg;
    if ( shared && sharedResult && !entry.halve && !critTaken ) result = sharedResult;
    else {
      result = await doRoll(rollDmg, entry.halve);
      rolls.push(...result.rolls);
      if ( !entry.halve && !critTaken ) sharedResult = result;
    }
    results.push({ entry, result: result.result });
  }

  const outTargets = results.map(({ entry, result }) => ({
    ...(entry.target ?? {}),
    halved: entry.halve,
    amount: result.calculated,
    result
  }));
  const main = results[0].result;
  const rolled = plan.filter(entry => entry.index !== null).map(entry => entry.index);
  if ( rolled.length ) await updateCard(message, { targets: Object.fromEntries(rolled.map(i => [i, { damageRolled: true }])) });
  await createCard({
    kind: "damage",
    actorUuid: state.actorUuid,
    itemUuid: state.itemUuid,
    title: state.title,
    subtitle: dmg.heal ? t(dmg.mp ? "SW25.Card.MPHealing" : "SW25.Card.Healing") : t("SW25.Card.Damage"),
    img: state.img,
    damage: dmg,
    result: main,
    targets: outTargets.filter(tg => tg.actorUuid),
    sourceMessage: message.id
  }, { rolls, speaker: actor ? speakerFor(actor) : message.speaker });
}

/**
 * Roll one damage instance.
 * @param {object} dmg
 * @param {boolean} halve
 * @returns {Promise<{result: object, rolls: Roll[]}>}
 */
async function doRoll(dmg, halve) {
  if ( dmg.mode === "formula" ) {
    const { roll, total } = await rollFormulaDamage(dmg.formula);
    let calculated = total + (dmg.extra ?? 0);
    if ( halve ) calculated = Math.ceil(calculated / 2);
    return {
      rolls: [roll],
      result: {
        formula: dmg.formula,
        steps: [{ dice: roll.dice.flatMap(d => d.results.map(r => r.result)), natural: roll.total, value: total }],
        tableTotal: total, extra: dmg.extra ?? 0, calculated: Math.max(0, calculated), crits: 0, fumble: false, halved: halve
      }
    };
  }
  return rollPower({
    power: dmg.power ?? 0,
    critical: dmg.critical,
    extra: dmg.extra ?? 0,
    rollBonus: dmg.rollBonus ?? 0,
    powerPerCrit: dmg.powerPerCrit ?? 0,
    halve,
    minimumOnFumble: !!dmg.minimumOnFumble
  });
}

/* -------------------------------------------- */

/**
 * May the current user apply what a card does (damage, healing, effects)? The GM always may. A player must own the
 * character the card comes from and have its token selected, when it has one on the scene.
 * @param {object} state   Card state
 * @returns {boolean}
 */
export function canApplyFromCard(state) {
  if ( game.user.isGM ) return true;
  const source = cardActor(state);
  if ( !source ) {
    ui.notifications.warn(t("SW25.Warn.GMApplies"));
    return false;
  }
  if ( !source.isOwner ) {
    ui.notifications.warn(t("SW25.Warn.NotSourceOwner", { name: source.name }));
    return false;
  }
  const onScene = source.getActiveTokens(false, true).length > 0;
  if ( onScene && !(canvas.tokens?.controlled ?? []).some(tk => tk.actor?.uuid === source.uuid) ) {
    ui.notifications.warn(t("SW25.Warn.SelectSource", { name: source.name }));
    return false;
  }
  return true;
}

/**
 * Apply the damage of a damage card to one of its targets, or to the tokens the user targets now (T).
 * @param {ChatMessage} message
 * @param {object} options
 * @param {number|null} options.index        Target index on the card; null → the current targets
 * @param {number} [options.multiplier=1]
 * @param {boolean} [options.heal]           Force healing
 */
export async function applyDamageFromCard(message, { index = null, multiplier = 1, heal = null } = {}) {
  const state = getCard(message);
  if ( !state?.result && (index === null) ) return;
  if ( !canApplyFromCard(state) ) return;
  const dmg = state.damage ?? {};
  const base = {
    kind: dmg.kind ?? "physical",
    types: dmg.types ?? [],
    heal: heal ?? !!dmg.heal,
    mp: !!dmg.mp,
    multiplier,
    source: state.title
  };
  if ( index !== null ) {
    const target = state.targets[index];
    const actor = actorFromUuid(target.tokenUuid) ?? actorFromUuid(target.actorUuid);
    if ( !actor ) return;
    await applyDamageTo(actor, forTarget(actor, dmg, { ...base, amount: target.amount, section: target.section }));
    await updateCard(message, { targets: { [index]: { applied: true } } });
    return;
  }
  const tokens = getTargetTokens();
  if ( !tokens.length ) return ui.notifications.warn(t("SW25.Warn.NoTargets"));
  for ( const token of tokens ) {
    await applyDamageTo(token.actor, forTarget(token.actor, dmg, { ...base, amount: state.result?.calculated ?? 0 }));
  }
}

/**
 * HP recovery that harms undead (Cure Wounds...) becomes magic damage against them,
 * typed "hpRecovery" so an undead weak point applies.
 * @param {Actor} actor
 * @param {object} dmg        The card's damage configuration
 * @param {object} data       Damage data about to be applied
 * @returns {object}
 */
function forTarget(actor, dmg, data) {
  const undead = (actor.type !== "character") && (actor.system.classification === "undead");
  if ( !data.heal || data.mp || !dmg.undeadDamage || !undead ) return data;
  return { ...data, heal: false, kind: "magic", types: [...(data.types ?? []), "hpRecovery"] };
}

/**
 * Apply the effect configured on a card to its affected targets (or, without any, to the tokens targeted now).
 * @param {ChatMessage} message
 * @param {object} [options]
 * @param {number|null} [options.index]
 */
export async function applyEffectFromCard(message, { index = null } = {}) {
  const state = getCard(message);
  const effect = state?.effect;
  if ( !effect ) return;
  if ( !canApplyFromCard(state) ) return;
  // "Temporary" resistance: a target that resists is still affected, for 10 seconds (1 round) only.
  // "Half" resistance halves the damage only: the other effects (falling prone...) still apply.
  const temporary = state.resistance === "temporary";
  const stillAffected = ["temporary", "half"].includes(state.resistance);
  let entries = [];
  if ( index !== null ) {
    const target = state.targets[index];
    entries = [{ actor: actorFromUuid(target.tokenUuid) ?? actorFromUuid(target.actorUuid), resisted: target.outcome === "resisted", index }];
  } else if ( state.targets?.length ) {
    // Targets that already have the effect keep it as it is (targets added later get it now)
    entries = state.targets
      .map((tg, i) => ({ tg, i }))
      .filter(({ tg }) => !tg.effectApplied && !["miss", "failed"].includes(tg.outcome) && (stillAffected || (tg.outcome !== "resisted")))
      .map(({ tg, i }) => ({ actor: actorFromUuid(tg.tokenUuid) ?? actorFromUuid(tg.actorUuid), resisted: tg.outcome === "resisted", index: i }));
    if ( !entries.length && state.targets.some(tg => tg.effectApplied) ) return ui.notifications.info(t("SW25.Card.EffectAlreadyOn"));
  } else {
    // Cast without targets: the tokens the user targets now (T)
    entries = getTargetTokens().map(tk => ({ actor: tk.actor, resisted: false }));
  }
  entries = entries.filter(e => e.actor);
  if ( !entries.length ) return ui.notifications.warn(t("SW25.Warn.NoTargetsForEffect"));
  const removed = [];
  for ( const { actor, resisted } of entries ) {
    // Conditions and effect types ended (Cure Poison, Awaken...)
    const names = await removeEffects(actor, { statuses: effect.removeStatuses ?? [], types: effect.removeTypes ?? [] });
    if ( names.length ) removed.push(`${actor.name}: ${names.join(", ")}`);
    if ( effect.create === false ) continue;
    const data = buildEffectData({
      name: effect.name,
      img: effect.img,
      modifiers: modifiersFor(actor, effect.modifiers),
      duration: (temporary && resisted) ? { unit: "rounds", value: 1 } : effect.duration,
      origin: effect.origin,
      statuses: effect.statuses ?? [],
      description: effect.description ?? "",
      types: effect.types ?? [],
      flags: foundry.utils.deepClone(effect.flags ?? {})
    });
    await applyEffects(actor, [data]);
    const raise = effect.flags?.swordworld25?.raiseHp;
    if ( raise ) await raiseCurrentHp(actor, raise);
  }
  // Mark the card's targets that got the effect
  const marked = entries.filter(e => Number.isInteger(e.index)).map(e => e.index);
  if ( marked.length ) await updateCard(message, { targets: Object.fromEntries(marked.map(i => [i, { effectApplied: true }])) });
  if ( removed.length ) ui.notifications.info(t("SW25.Card.EffectsRemoved", { list: removed.join("; ") }));
  if ( effect.create !== false ) ui.notifications.info(t("SW25.Card.EffectApplied", { name: effect.name, count: entries.length }));
  else if ( !removed.length ) ui.notifications.info(t("SW25.Card.NothingToRemove"));
}

/**
 * Add the tokens the user targets now (T) to a card. The targets already on the card keep their rolls and results;
 * the new ones resist, take damage and receive the effect like the others.
 * @param {ChatMessage} message
 */
export async function addTargetsToCard(message) {
  const state = getCard(message);
  if ( !state || !canApplyFromCard(state) ) return;
  const tokens = getTargetTokens();
  if ( !tokens.length ) return ui.notifications.warn(t("SW25.Warn.NoTargets"));
  const known = new Set((state.targets ?? []).map(tg => tg.tokenUuid));
  const fresh = tokens.filter(tk => !known.has(tk.uuid));
  if ( !fresh.length ) return ui.notifications.info(t("SW25.Card.TargetsAlreadyIn"));
  let added = await snapshotTargets(fresh, { contest: state.contest ?? null, askSection: state.contest === "evasion" });
  // A damage card gives the new targets its rolled amount
  if ( state.kind === "damage" ) {
    added = added.map(tg => ({ ...tg, halved: false, amount: state.result?.calculated ?? 0, result: state.result ?? null }));
  }
  await updateCard(message, { addTargets: added });
  ui.notifications.info(t("SW25.Card.TargetsAdded", { count: added.length }));
}
