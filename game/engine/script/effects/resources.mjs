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
import {applyReplacements} from "../../rules/replacement.mjs";
import {selectMatching} from "../filter.mjs";
import {event, cardRef, playersFor} from "./zones.mjs";
import {markDeathtouch, lifelinkFrom} from "../../keywords/combat.mjs";

/** `addMana` — into the controller's pool, which empties at the end of the step (CR 500.4). */
export function addMana(state, params, context) {
  const mana = params.mana ?? {};
  if (Object.values(mana).every((n) => !n)) return [];
  addToPool(state.players[context.controller].manaPool, mana);
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
    object.tapped = false;
    events.push(event("GameEventCardTapped", state, {card: cardRef(state, id), tapped: false}));
  }
  void context;
  return events;
}

/** `untapAll` — everything a selector matches. */
export function untapAll(state, params, context) {
  return untap(state, {targets: selectMatching(state, params.selector ?? {what: "permanent"}, context)}, context);
}

function changeLife(state, player, delta, events) {
  if (delta === 0) return;
  const before = state.players[player].life;
  state.players[player].life += delta;
  /* The life each player has lost this turn (Wound Reflection; script/amount.mjs), cleared as a turn begins (turn.mjs). */
  if (delta < 0) state.players[player].lostThisTurn = (state.players[player].lostThisTurn ?? 0) - delta;
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
export function dealDamage(state, params, context) {
  const events = [];
  const amount = params.amount ?? 0;
  if (amount <= 0) return events;
  /* The spell or ability, or a creature the trigger is about: "it deals that much damage to each other opponent". */
  const source = Array.isArray(params.from) ? params.from[0] ?? null : context.source ?? null;

  const hits = [
    ...(params.targets ?? []).map((id) => ({toCard: id})),
    ...(params.toPlayer === undefined ? [] : [{toPlayer: params.toPlayer}]),
    ...playersFor(state, params.who, context.controller)
      .filter(() => params.who !== undefined)
      /* "Each other opponent": not the one the trigger is about. */
      .filter((player) => !(params.exceptThatPlayer === true && player === context.about?.player))
      .map((player) => ({toPlayer: player})),
  ];

  for (const hit of hits) {
    const {proposal} = applyReplacements(state, {
      event: "damage", toPlayer: hit.toPlayer, toCard: hit.toCard, amount, sourceId: source, combat: false,
    });
    if (proposal.prevented === true || proposal.amount <= 0) continue;
    if (hit.toPlayer !== undefined) {
      changeLife(state, hit.toPlayer, -proposal.amount, events);
      events.push(event("GameEventPlayerDamaged", state, {
        source: source === null ? null : cardRef(state, source),
        target: {playerId: hit.toPlayer, name: state.players[hit.toPlayer].name},
        amount: proposal.amount, combat: false, infect: false,
      }));
    } else if (state.objects[hit.toCard]) {
      state.objects[hit.toCard].damage += proposal.amount;
      events.push(event("GameEventCardDamaged", state, {
        card: cardRef(state, hit.toCard),
        source: source === null ? null : cardRef(state, source),
        amount: proposal.amount,
      }));
      /* CR 702.2b: deathtouch is any damage from the source, not only combat damage. */
      markDeathtouch(state, source, hit.toCard);
    }
    /* CR 702.15b: so is lifelink -- its controller gains that much life as the damage is dealt. */
    const linked = source === null ? 0 : lifelinkFrom(state, source, proposal.amount);
    if (linked > 0 && state.objects[source]) changeLife(state, state.objects[source].controller, linked, events);
  }
  return events;
}

/**
 * `damageAll` -- "deals 13 damage to each creature" (Blasphemous Act), "1 damage to each opponent and each creature they
 * control" (Tectonic Hazard): `selector` the permanents (each creature, unless it says), `who` the players, `amount`
 * counted as it resolves. The source is the spell, or `from` -- "target creature you control deals damage equal to its
 * power to each other creature" (Chandra's Ignition), which `exceptSource` leaves out of "each other creature". One
 * damage event for all of it; the dying is state-based, afterwards (CR 704.5g).
 */
export function damageAll(state, params, context) {
  const from = Array.isArray(params.from) ? params.from[0] ?? null : context.source ?? null;
  /* "Each creature and planeswalker they control": a choice of descriptions (`anyOf`), each one counted once. */
  const {anyOf, ...shared} = params.selector ?? {what: "permanent", types: ["Creature"]};
  const matched = Array.isArray(anyOf) ? [...new Set(anyOf.flatMap((one) => selectMatching(state, {...shared, ...one}, context)))] : selectMatching(state, shared, context);
  const ids = matched.filter((id) => !(params.exceptSource === true && id === from));
  return dealDamage(state, {amount: params.amount, targets: ids, ...(params.who !== undefined ? {who: params.who} : {})}, {...context, source: from});
}

function addCounters(state, id, kind, count, events) {
  if (count === 0) return;
  const object = state.objects[id];
  if (!object) return;
  const before = object.counters[kind] ?? 0;
  object.counters[kind] = before + count;
  events.push(event("GameEventCardCounters", state, {
    card: cardRef(state, id), type: kind, oldValue: before, newValue: object.counters[kind],
  }));
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

/** `removeCounter` — the other direction, and never below zero. */
export function removeCounter(state, params, context) {
  const events = [];
  const kind = params.counter ?? "+1/+1";
  for (const id of params.targets ?? []) {
    const object = state.objects[id];
    if (!object) continue;
    const before = object.counters[kind] ?? 0;
    const after = Math.max(0, before - (params.count ?? 1));
    if (after === before) continue;
    object.counters[kind] = after;
    events.push(event("GameEventCardCounters", state, {
      card: cardRef(state, id), type: kind, oldValue: before, newValue: after,
    }));
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
