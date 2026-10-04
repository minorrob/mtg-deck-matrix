/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* EFFECT PRIMITIVES FOR MANA, LIFE, DAMAGE AND COUNTERS.
 *
 * `docs/engine/PLAN.md` §12.2, the Mana, Life-and-damage and Counters families. Nine of the
 * measured top twenty-five, including `Mana` at 97 uses — second only to moving cards.
 *
 * DAMAGE GOES THROUGH REPLACEMENT AND PREVENTION (CR 615), and this is the line worth writing down:
 * a primitive that subtracted life directly would walk straight past every shield on the board, and
 * every one of them would look like it was working because the number went down.
 *
 * PROLIFERATE ADDS ANOTHER, NOT A FIRST (CR 701.34a). A permanent with no counters gets nothing,
 * and a permanent with a counter its controller would rather not have gets another one. Both halves
 * catch people out, and an engine that reads it as "add a +1/+1 counter" is wrong in a way that
 * looks generous.
 */

import {addMana as addToPool} from "../../rules/mana.mjs";
import {addRestricted} from "../../rules/restricted-mana.mjs";
import {applyReplacements, hitKey, damageChoicesPossible} from "../../rules/replacement.mjs";
import {runFollowUps} from "./index.mjs";
import {selectMatching} from "../filter.mjs";
import {event, cardRef, playersFor} from "./zones.mjs";
import {markDeathtouch, lifelinkFrom} from "../../keywords/combat.mjs";
import {typesOf, powerOf, toughnessOf, keywordsOf, isKeywordCounter} from "../../rules/layers.mjs";
import {cantGainLife, countersPlaced} from "../../rules/statics.mjs";

/** `addMana` — into the controller's pool, which empties at the end of the step (CR 500.4). */
export function addMana(state, params, context) {
  const mana = params.mana ?? {};
  if (Object.values(mana).every((n) => !n)) return [];
  /* "Spend this mana only to cast instant and sorcery spells" (Abstract Paintmage; CR 106.6): beside the pool, what it may
     pay for read as it is added, as a mana ability's is (rules/restricted-mana.mjs). */
  if (params.spendOnly) addRestricted(state, context.controller, mana, params.spendOnly, context.source);
  else addToPool(state.players[context.controller].manaPool, mana);
  return [event("GameEventManaPool", state, {
    player: {playerId: context.controller, name: state.players[context.controller].name},
    produced: {...mana},
  })];
}

/** `tap` — CR 701.26. Something already tapped stays tapped and is not reported twice. */
export function tap(state, params, context) {
  const events = [];
  for (const id of params.targets ?? []) {
    const object = state.objects[id];
    if (!object || object.tapped) continue;
    object.tapped = true;
    events.push(event("GameEventCardTapped", state, {card: cardRef(state, id), tapped: true}));
  }
  void context;
  return events;
}

/** `untap` — its opposite, CR 701.26. */
export function untap(state, params, context) {
  const events = [];
  for (const id of params.targets ?? []) {
    const object = state.objects[id];
    if (!object || !object.tapped) continue;
    untapOne(state, id, events);
  }
  void context;
  return events;
}

/**
 * A STUN COUNTER (CR 122.1d): a permanent with one that would become untapped has one removed instead, and stays tapped --
 * in its controller's untap step (rules/turn.mjs) and by an untap effect alike. Whether it untapped.
 */
export function untapOne(state, id, events) {
  const object = state.objects[id];
  if ((object.counters?.stun ?? 0) > 0) {
    events.push(...removeCounter(state, {targets: [id], counter: "stun", count: 1}, {}));
    return false;
  }
  object.tapped = false;
  events.push(event("GameEventCardTapped", state, {card: cardRef(state, id), tapped: false}));
  return true;
}

/** `untapAll` — everything a selector matches. */
export function untapAll(state, params, context) {
  return untap(state, {targets: selectMatching(state, params.selector ?? {what: "permanent"}, context)}, context);
}

/** Whether a source deals its damage with infect (CR 702.90): the keyword, as the layers have it now. */
export const infects = (state, id) => Boolean(state.objects[id]) && keywordsOf(state, id).includes("Infect");

/**
 * A PLAYER'S LIFE CHANGED (CR 119.3), and said so: every life loss and gain goes through here -- an effect's, combat
 * damage's, a commander's, a cost's ("pay 2 life", CR 119.4; batch 78) -- so "whenever an opponent loses life" sees
 * each, and "the life they lost this turn" counts each.
 */
export function changeLife(state, player, delta, events) {
  if (delta === 0) return;
  /* "Your opponents can't gain life" (CR 119.7): a gain that does not happen, and is not said to. */
  if (delta > 0 && cantGainLife(state, player)) return;
  const before = state.players[player].life;
  state.players[player].life += delta;
  /* The life each player has lost this turn (Wound Reflection; script/amount.mjs), cleared as a turn begins (turn.mjs). */
  if (delta < 0) state.players[player].lostThisTurn = (state.players[player].lostThisTurn ?? 0) - delta;
  /* And gained ("if you gained 3 or more life this turn", Indulging Patrician). */
  if (delta > 0) state.players[player].gainedThisTurn = (state.players[player].gainedThisTurn ?? 0) + delta;
  events.push(event("GameEventPlayerLivesChanged", state, {
    player: {playerId: player, name: state.players[player].name},
    oldLives: before, newLives: state.players[player].life,
  }));
}

/** `gainLife` — CR 119.3. */
export function gainLife(state, params, context) {
  const events = [];
  for (const player of playersFor(state, params.who, context.controller))
    changeLife(state, player, params.amount ?? 0, events);
  return events;
}

/**
 * `loseLife` — CR 119.3, and NOT the same as damage.
 *
 * Losing life is not damage: it is not prevented by damage prevention, does not trigger "whenever
 * damage is dealt", and does not mark a creature. A great many cards say one and mean one.
 */
export function loseLife(state, params, context) {
  const events = [];
  /* playersFor leaves out a player who has left the game (CR 800.4a): nothing is lost for them, nor gained. */
  for (const player of playersFor(state, params.who, context.controller)) {
    changeLife(state, player, -(params.amount ?? 0), events);
    /* "You gain life equal to the life lost this way" (script/amount.mjs lifeLostThisWay): kept with the resolution. */
    context.lifeLost = (context.lifeLost ?? 0) + Math.max(0, params.amount ?? 0);
  }
  return events;
}

/**
 * `dealDamage` — CR 119, through replacement and prevention (CR 615).
 *
 * A hit prevented in full does not happen at all (CR 615.4), so it is skipped rather than reported
 * as zero damage — the board should not announce something that did not occur.
 */
/* What a damage effect deals, and to whom: the source, the amount, and each hit. */
function damageHits(state, params, context) {
  const amount = params.amount ?? 0;
  /* The spell or ability, or a creature the trigger is about: "it deals that much damage to each other opponent". One that
     has left the battlefield since (a Dragon dealt lethal damage) still deals it, as a departed ability source does
     (rules/stack.mjs): with no object left to read for lifelink or deathtouch. */
  const named = Array.isArray(params.from) ? params.from[0] ?? null : context.source ?? null;
  const source = named !== null && state.objects[named] ? named : null;
  const hits = [
    ...(params.targets ?? []).map((id) => ({toCard: id})),
    ...(params.toPlayer === undefined ? [] : [{toPlayer: params.toPlayer}]),
    ...playersFor(state, params.who, context.controller)
      .filter(() => params.who !== undefined)
      /* "Each other opponent": not the one the trigger is about. */
      .filter((player) => !(params.exceptThatPlayer === true && player === context.about?.player))
      .map((player) => ({toPlayer: player})),
  ];
  return {source, amount, hits};
}

export function dealDamage(state, params, context) {
  const events = [];
  /* "If a Dinosaur is dealt damage this way" (Marauding Raptor, batch 70): the permanents it was dealt to, after prevention,
     remembered for the effects after it -- none, when there was no damage to deal. */
  const dealt = [];
  if (params.remember) context.remembered = dealt;
  const {source, amount, hits} = damageHits(state, params, context);
  if (amount <= 0) return events;

  for (const hit of hits) {
    /* CR 616.1: the order of the effects that change it, as the player dealt it chose (effects/asking.mjs, orderDamage);
       the order that leaves the least where nobody was asked (rules/replacement.mjs). */
    const {proposal} = applyReplacements(state, {
      event: "damage", toPlayer: hit.toPlayer, toCard: hit.toCard, amount, sourceId: source, combat: false,
    }, {orders: params.damageOrders?.[hitKey(source, hit.toPlayer, hit.toCard)] ?? []});
    /* What follows a prevention -- "each opponent mills that many cards" -- immediately afterward (CR 615.5). */
    if (proposal.prevented === true || proposal.amount <= 0) { events.push(...runFollowUps(state, proposal)); continue; }
    /* Dealt where the replacements left it: a redirection (CR 614.9) moves it from a player to a permanent. */
    const toPlayer = proposal.toPlayer !== undefined && proposal.toPlayer !== null ? proposal.toPlayer : undefined;
    const toCard = toPlayer === undefined ? proposal.toCard : undefined;
    if (toCard !== undefined && state.objects[toCard]) dealt.push(toCard);
    /* INFECT (CR 702.90b-c, batch 78): from a source with infect, damage to a player is poison counters, not life lost, and
       damage to a creature is -1/-1 counters, not damage marked -- still damage dealt. */
    const infect = source !== null && infects(state, source);
    if (toPlayer !== undefined) {
      if (infect) events.push(...givePoison(state, toPlayer, proposal.amount));
      else changeLife(state, toPlayer, -proposal.amount, events);
      events.push(event("GameEventPlayerDamaged", state, {
        source: source === null ? null : cardRef(state, source),
        target: {playerId: toPlayer, name: state.players[toPlayer].name},
        amount: proposal.amount, combat: false, infect,
      }));
    } else if (state.objects[toCard]) {
      /* EXCESS DAMAGE (CR 120.4a): "if excess damage was dealt to that permanent this way" (Violent Echoes) -- past lethal
         to a creature (its damage marked counted; from deathtouch, anything past 1, 702.2c), past its loyalty to a
         planeswalker, the greater for one that is both -- read before it is dealt, and kept for the effects after it. */
      context.excessDamage = (context.excessDamage ?? 0) + excessOf(state, toCard, proposal.amount, source);
      damagePermanent(state, toCard, proposal.amount, events, {infect});
      events.push(event("GameEventCardDamaged", state, {
        card: cardRef(state, toCard),
        source: source === null ? null : cardRef(state, source),
        amount: proposal.amount,
      }));
      /* CR 702.2b: deathtouch is any damage from the source, not only combat damage. */
      markDeathtouch(state, source, toCard);
    }
    /* CR 702.15b: so is lifelink -- its controller gains that much life as the damage is dealt. */
    const linked = source === null ? 0 : lifelinkFrom(state, source, proposal.amount);
    if (linked > 0 && state.objects[source]) changeLife(state, state.objects[source].controller, linked, events);
  }
  return events;
}

/* How much of `amount` dealt to this permanent now would be excess damage (CR 120.4a). */
function excessOf(state, id, amount, source) {
  const types = typesOf(state, id), object = state.objects[id];
  let excess = 0;
  if (types.includes("Creature")) {
    const deathtouch = source !== null && state.objects[source] && keywordsOf(state, source).includes("Deathtouch");
    const lethal = Math.max(0, toughnessOf(state, id) - (object.damage ?? 0));
    excess = Math.max(excess, amount - (deathtouch ? Math.min(lethal, 1) : lethal));
  }
  if (types.includes("Planeswalker")) excess = Math.max(excess, amount - (object.counters?.loyalty ?? 0));
  return Math.max(0, excess);
}

/**
 * `damageAll` -- "deals 13 damage to each creature" (Blasphemous Act), "1 damage to each opponent and each creature they
 * control" (Tectonic Hazard): `selector` the permanents (each creature, unless it says), `who` the players, `amount`
 * counted as it resolves. The source is the spell, or `from` -- "target creature you control deals damage equal to its
 * power to each other creature" (Chandra's Ignition), which `exceptSource` leaves out of "each other creature". One
 * damage event for all of it; the dying is state-based, afterwards (CR 704.5g).
 */
function damageAllCall(state, params, context) {
  const from = Array.isArray(params.from) ? params.from[0] ?? null : context.source ?? null;
  /* "Each creature and planeswalker they control": a choice of descriptions (`anyOf`), each one counted once. */
  const {anyOf, ...shared} = params.selector ?? {what: "permanent", types: ["Creature"]};
  const matched = Array.isArray(anyOf) ? [...new Set(anyOf.flatMap((one) => selectMatching(state, {...shared, ...one}, context)))] : selectMatching(state, shared, context);
  const ids = matched.filter((id) => !(params.exceptSource === true && id === from));
  return [{amount: params.amount, targets: ids, ...(params.who !== undefined ? {who: params.who} : {}), ...(params.damageOrders ? {damageOrders: params.damageOrders} : {})}, {...context, source: from}];
}
export function damageAll(state, params, context) {
  const [deal, from] = damageAllCall(state, params, context);
  return dealDamage(state, deal, from);
}

/**
 * DAMAGE TO A PERMANENT (CR 120.3): to a planeswalker, that many loyalty counters removed (120.3c, 306.8); to a creature,
 * marked -- or, from a source with infect, that many -1/-1 counters (120.3d); to one that is both, both (120.3).
 */
export function damagePermanent(state, id, amount, events, {infect = false} = {}) {
  const types = typesOf(state, id);
  const object = state.objects[id];
  if (types.includes("Planeswalker")) {
    const before = object.counters.loyalty ?? 0;
    object.counters.loyalty = Math.max(0, before - amount);
    events.push(event("GameEventCardCounters", state, {card: cardRef(state, id), type: "loyalty", oldValue: before, newValue: object.counters.loyalty}));
    if (!types.includes("Creature")) return;
  }
  if (infect) addCounters(state, id, "-1/-1", amount, events);
  else object.damage += amount;
}

export function addCounters(state, id, kind, count, events) {
  if (count === 0) return;
  const object = state.objects[id];
  if (!object) return;
  /* "Twice that many instead" (Branching Evolution; rules/statics.mjs). */
  if (object.zone === "battlefield") count = countersPlaced(state, id, kind, count);
  const before = object.counters[kind] ?? 0;
  object.counters[kind] = before + count;
  /* A keyword counter's ability has the timestamp of the counter's placing (CR 122.1b, 613.7): a "loses all abilities"
     from before it does not take it away (rules/layers.mjs). */
  if (before <= 0 && object.counters[kind] > 0 && isKeywordCounter(kind)) {
    (object.counterStamps ??= {})[kind] = state.nextTimestamp;
    state.nextTimestamp += 1;
  }
  events.push(event("GameEventCardCounters", state, {
    card: cardRef(state, id), type: kind, oldValue: before, newValue: object.counters[kind],
  }));
}

/**
 * `fight` -- CR 701.14a: two creatures, each dealing damage equal to its power to the other -- `from` the one named first
 * ("this creature", "target creature you control"), `targets` the other. Both powers are read before either deals any.
 * If either is no longer a creature on the battlefield, neither deals damage (701.14b).
 */
function fightCalls(state, params, context) {
  const [a] = params.from ?? [], [b] = params.targets ?? [];
  const fighting = (id) => id !== undefined && state.objects[id]?.zone === "battlefield" && typesOf(state, id).includes("Creature");
  if (!fighting(a) || !fighting(b)) return [];
  const powerA = Math.max(0, powerOf(state, a)), powerB = Math.max(0, powerOf(state, b));
  const orders = params.damageOrders ? {damageOrders: params.damageOrders} : {};
  return [[{amount: powerA, targets: [b], from: [a], ...orders}, context], [{amount: powerB, targets: [a], from: [b], ...orders}, context]];
}
export function fight(state, params, context) {
  return fightCalls(state, params, context).flatMap(([deal, ctx]) => dealDamage(state, deal, ctx));
}

/* ---- CR 616.1, before damage is dealt ----

   The damage effects a resolution can stop to ask about (script/resolution.mjs; effects/asking.mjs, orderDamage), each
   as the dealDamage calls it makes -- so the question and the dealing see the same hits. */
export const DAMAGING = Object.freeze({dealDamage, damageAll, fight});
function damageCalls(state, effect, context) {
  if (effect.effect === "dealDamage") return [[effect, context]];
  if (effect.effect === "damageAll") return [damageAllCall(state, effect, context)];
  if (effect.effect === "fight") return fightCalls(state, effect, context);
  return [];
}

/**
 * The first hit of this damage effect whose replacement effects' order is the affected player's to choose and not yet
 * chosen (CR 616.1), given `answers` (by hit, `hitKey`): `{player, proposal, options, key}`, or null when there is none.
 * Tried dry: it changes nothing.
 */
export function damageQuestion(state, effect, context, answers = {}) {
  if (!DAMAGING[effect?.effect] || !damageChoicesPossible(state)) return null;
  for (const [params, ctx] of damageCalls(state, effect, context)) {
    const {source, amount, hits} = damageHits(state, params, ctx);
    if (amount <= 0) continue;
    for (const hit of hits) {
      const key = hitKey(source, hit.toPlayer, hit.toCard);
      const {question} = applyReplacements(state, {event: "damage", toPlayer: hit.toPlayer, toCard: hit.toCard, amount, sourceId: source, combat: false},
        {orders: answers[key] ?? [], askable: true, dry: true});
      if (question) return {...question, key};
    }
  }
  return null;
}

/**
 * `poison` -- "each opponent gets a poison counter", "that player gets two poison counters" (CR 122.1f; Forge's Poison):
 * on each player it names, `count` of them. Ten or more and that player loses (CR 704.5c, rules/sba.mjs).
 */
export function poison(state, params, context) {
  const count = params.count ?? 1;
  if (!(count > 0)) return [];
  return playersFor(state, params.who, context.controller).flatMap((id) => givePoison(state, id, count));
}

/** Poison counters on a player, reported as the board knows them -- an effect's (poison), or toxic's (rules/combat.mjs). */
export function givePoison(state, id, count) {
  const player = state.players[id];
  const before = player.poison ?? 0;
  player.poison = before + count;
  return [event("GameEventPlayerPoisoned", state, {receiver: {playerId: id, name: player.name}, oldValue: before, amount: count})];
}

/**
 * `winGame` -- "you win the game" (CR 104.2b; Forge's WinsGame): the player it names wins, and the game is over at once
 * (CR 104.1) -- with every opponent, a multiplayer game having no limited range of influence (CR 104.3h). The state-based
 * actions report it (rules/sba.mjs, gameOver). A player no longer in the game wins nothing (playersFor names none).
 */
export function winGame(state, params, context) {
  for (const id of playersFor(state, params.who ?? "you", context.controller)) state.players[id].won = true;
  return [];
}

/** `putCounter` — CR 121. */
export function putCounter(state, params, context) {
  const events = [];
  for (const id of params.targets ?? []) addCounters(state, id, params.counter ?? "+1/+1", params.count ?? 1, events);
  void context;
  return events;
}

/** `putCounterAll` — on everything a selector matches. */
export function putCounterAll(state, params, context) {
  const events = [];
  for (const id of selectMatching(state, params.selector ?? {what: "permanent"}, context))
    addCounters(state, id, params.counter ?? "+1/+1", params.count ?? 1, events);
  return events;
}

/**
 * `multiplyCounters` -- "double the number of each kind of counter on any number of target permanents" (Deepglow Skate;
 * Forge's MultiplyCounter): on each target, as many more of each kind as it has now, put on as counters are (CR 122.1 --
 * doubling is putting that many on, which "if counters would be put on" sees); `who`, the players whose own counters
 * double ("each kind of counter you have": poison, CR 122.1c). `times` 2 unless it says.
 */
export function multiplyCounters(state, params, context) {
  const events = [], more = Math.max(1, params.times ?? 2) - 1;
  for (const id of params.targets ?? []) {
    const object = state.objects[id];
    if (!object || object.zone !== "battlefield") continue;
    for (const [kind, n] of Object.entries({...object.counters})) if (n > 0) addCounters(state, id, kind, n * more, events);
  }
  for (const player of params.who !== undefined ? playersFor(state, params.who, context.controller) : [])
    if ((state.players[player].poison ?? 0) > 0) events.push(...givePoison(state, player, state.players[player].poison * more));
  return events;
}

/** `removeCounter` — the other direction, and never below zero. "Remove all counters from target creature" (Perfect
    Intimidation): `counter: "all"`, every kind it has, all of each. */
export function removeCounter(state, params, context) {
  const events = [];
  for (const id of params.targets ?? []) {
    const object = state.objects[id];
    if (!object) continue;
    const kinds = params.counter === "all" ? Object.keys(object.counters ?? {}) : [params.counter ?? "+1/+1"];
    for (const kind of kinds) {
      const before = object.counters[kind] ?? 0;
      const after = params.counter === "all" ? 0 : Math.max(0, before - (params.count ?? 1));
      if (after === before) continue;
      object.counters[kind] = after;
      events.push(event("GameEventCardCounters", state, {
        card: cardRef(state, id), type: kind, oldValue: before, newValue: after,
      }));
    }
  }
  void context;
  return events;
}

/**
 * `proliferate` — CR 701.34a.
 *
 * For each chosen permanent or player that already has a counter, add ANOTHER of each kind it
 * already has. Not a +1/+1 counter, not a first counter: another of what is there. A permanent with
 * nothing on it gets nothing, and a creature with a -1/-1 counter gets a second one.
 *
 * `chosen` is the set the player picked. Choosing is the controller's decision and belongs to the
 * caller; this applies the result.
 */
export function proliferate(state, params, context) {
  const events = [];
  for (const choice of params.chosen ?? []) {
    if (choice && typeof choice === "object" && choice.player !== undefined) {
      const player = state.players[choice.player];
      if (!player) continue;
      for (const [kind, amount] of Object.entries(player.counters)) {
        if (amount > 0) player.counters[kind] = amount + 1;
      }
      /* Poison counters are counters (CR 122.1f): one more, reported as any poisoning is (batch 77). */
      if (player.poison > 0) events.push(...givePoison(state, choice.player, 1));
      continue;
    }
    const object = state.objects[choice];
    if (!object) continue;
    for (const [kind, amount] of Object.entries({...object.counters})) {
      if (amount > 0) addCounters(state, choice, kind, 1, events);
    }
  }
  void context;
  return events;
}
