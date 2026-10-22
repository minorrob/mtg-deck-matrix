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

import {addRestricted, addPoolMana} from "../../rules/restricted-mana.mjs";
import {applyReplacements, hitKey, damageChoicesPossible} from "../../rules/replacement.mjs";
import {runFollowUps} from "./index.mjs";
import {selectMatching} from "../filter.mjs";
import {event, cardRef, playersFor} from "./zones.mjs";
import {markDeathtouch, lifelinkFrom} from "../../keywords/combat.mjs";
import {typesOf, powerOf, toughnessOf, keywordsOf, isKeywordCounter, controllerOf} from "../../rules/layers.mjs";
import {cantGainLife, lifeGained, countersPlaced, playerCountersPlaced, placeCounters} from "../../rules/statics.mjs";
import {playerRuled, leaveGame, monarchLeft} from "../../rules/sba.mjs";
import {amountOf} from "../amount.mjs";
import {recordUse} from "../../state/index.mjs";

/** `addMana` — into the controller's pool, which empties at the end of the step (CR 500.4). */
export function addMana(state, params, context) {
  /* "Add {R} for each card exiled this way" (Quintorius Kand): `count` times, counted as it resolves. */
  const times = params.count === undefined ? 1 : Math.max(0, params.count);
  const mana = Object.fromEntries(Object.entries(params.mana ?? {}).map(([color, n]) => [color, n * times]));
  if (Object.values(mana).every((n) => !n)) return [];
  /* "Spend this mana only to cast instant and sorcery spells" (Abstract Paintmage; CR 106.6): beside the pool, what it may
     pay for read as it is added, as a mana ability's is (rules/restricted-mana.mjs). */
  if (params.spendOnly) addRestricted(state, context.controller, mana, params.spendOnly, context.source);
  /* "This mana can't be spent to cast spells from your hand": in the pool, remembered beside it. */
  else addPoolMana(state, context.controller, mana, params.cantSpend, context.source);
  /* "Until end of combat, you don't lose this mana as steps and phases end" (firebending, CR 702.189a): how much of the pool
     its player keeps as combat's steps end (`combatMana`, rules/turn.mjs). */
  if (params.untilEndOfCombat === true) {
    const kept = (state.players[context.controller].combatMana ??= {});
    for (const [color, n] of Object.entries(mana)) kept[color] = (kept[color] ?? 0) + n;
  }
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
  /* "Their life total can't change" (Teferi's Reproach; CR 119.7-8): no gain, no loss. */
  if ((state.effects ?? []).some((e) => e.rule === "life-cant-change" && (e.players ?? []).includes(player))) return;
  /* "If you would gain life, you gain twice that much life instead" (Rhox Faithmender; rules/statics.mjs, lifeGained): an
     exchange of life totals and a life total set higher are gains too (CR 701.12b, 119.5). */
  if (delta > 0) delta = lifeGained(state, player, delta);
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
    /* Whoever controls the source puts the counters infect makes (CR 702.90b-c): "if you would put counters". */
    const putter = infect && state.objects[source] ? controllerOf(state, source) : null;
    /* The source has dealt damage (CR 120.1), for as long as it is this object (CR 400.7): "as long as Ratonhnhaké꞉ton
       hasn't dealt damage yet" (script/filter.mjs, hasDealtDamage) -- marked below where it is dealt, to a player or to a
       permanent; damage prevented in full was never dealt (above). */
    if (toPlayer !== undefined) {
      if (source !== null) state.objects[source].hasDealtDamage = true;
      /* A player dealt noncombat damage this turn, infect's included (CR 702.90b: still damage dealt): "activate only if an
         opponent has been dealt noncombat damage this turn" (Grim Repriser; script/amount.mjs, playersDealtNoncombatDamage).
         rules/turn.mjs clears it as a turn begins. */
      state.players[toPlayer].noncombatDamagedThisTurn = true;
      if (infect) events.push(...givePoison(state, toPlayer, proposal.amount, putter));
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
      if (source !== null) state.objects[source].hasDealtDamage = true;
      damagePermanent(state, toCard, proposal.amount, events, {infect, by: putter});
      events.push(event("GameEventCardDamaged", state, {
        card: cardRef(state, toCard),
        source: source === null ? null : cardRef(state, source),
        amount: proposal.amount, combat: false,
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
export function damagePermanent(state, id, amount, events, {infect = false, by = null} = {}) {
  const types = typesOf(state, id);
  const object = state.objects[id];
  /* "Target creature that was dealt damage this turn" (Mirrodin Avenged; CR 120.3): this object was dealt damage -- combat
     or not, marked, loyalty removed or -1/-1 counters from infect, all damage dealt (120.3c-d) -- counted for this turn
     only (state/index.mjs, usesThisTurn), and for this object only: one that leaves and returns is a new one (CR 400.7). */
  recordUse(state, id, "dealt damage");
  if (types.includes("Planeswalker")) {
    const before = object.counters.loyalty ?? 0;
    object.counters.loyalty = Math.max(0, before - amount);
    events.push(event("GameEventCardCounters", state, {card: cardRef(state, id), type: "loyalty", oldValue: before, newValue: object.counters.loyalty}));
    if (!types.includes("Creature")) return;
  }
  if (infect) addCounters(state, id, "-1/-1", amount, events, by);
  else object.damage += amount;
}

/* `by`: the player putting them (rules/statics.mjs, countersPlaced) -- an effect's controller, an infect source's.
   `orders`: the affected player's answers for the order of the effects that change them (CR 616.1; orderCounters). */
export function addCounters(state, id, kind, count, events, by = null, orders = []) {
  if (count === 0) return;
  const object = state.objects[id];
  if (!object) return;
  /* "Twice that many instead" (Branching Evolution; "if you would put", Innkeeper's Talent), "that many plus one" (Hardened
     Scales), "half that many" (Vorinclex): rules/statics.mjs. */
  if (object.zone === "battlefield") count = countersPlaced(state, id, kind, count, by, orders);
  if (count === 0) return;
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
    /* Who put them: "whenever you put one or more +1/+1 counters on this creature" (Exemplar of Light; rules/trigger.mjs). */
    ...(Number.isInteger(by) ? {by} : {}),
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
/* And each of a set dealing its own (damageEach, below). */
export const DAMAGING = Object.freeze({dealDamage, damageAll, fight, damageEach});
function damageCalls(state, effect, context) {
  if (effect.effect === "dealDamage") return [[effect, context]];
  if (effect.effect === "damageAll") return [damageAllCall(state, effect, context)];
  if (effect.effect === "fight") return fightCalls(state, effect, context);
  if (effect.effect === "damageEach") return damageEachCalls(state, effect, context);
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
      /* Only what the hit is dealt to: the question it asks is kept in the state, which a room saves as JSON (game/engine/
         storage.mjs, lostIn) -- damage to a player has no `toCard` at all, never an undefined one (Ajani Steadfast's emblem
         and Hedron-Field Purists, ordered for a Lightning Bolt at their controller). */
      const {question} = applyReplacements(state, {event: "damage", ...(hit.toPlayer !== undefined ? {toPlayer: hit.toPlayer} : {}),
        ...(hit.toCard !== undefined ? {toCard: hit.toCard} : {}), amount, sourceId: source, combat: false},
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
  return playersFor(state, params.who, context.controller).flatMap((id) => givePoison(state, id, count, context.controller));
}

/** Poison counters on a player, reported as the board knows them -- an effect's (poison), or toxic's (rules/combat.mjs).
    `by`, who puts them: "twice that many" for a player's counters too (rules/statics.mjs, playerCountersPlaced). */
export function givePoison(state, id, count, by = null) {
  const player = state.players[id];
  count = playerCountersPlaced(state, id, "poison", count, by);
  if (!(count > 0)) return [];
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
  /* "Your opponents can't win the game" (Darksteel Angel; CR 104.2b): a player one of whose opponents has it does not. */
  for (const id of playersFor(state, params.who ?? "you", context.controller)) if (!playerRuled(state, "opponents-cant-win", id, {opponents: true})) state.players[id].won = true;
  return [];
}

/**
 * `loseGame` -- "that player loses the game" (Strixhaven Stadium), "each player with exactly 13 life loses the game"
 * (Triskaidekaphobia; CR 104.3e; Forge's LosesGame): each player `who` names -- with `withLife`, only those whose life total
 * is exactly that now -- found first, then all of them losing together (CR 104.4a: all who remain losing at once is a draw).
 * Each leaves the game as it happens, everything of theirs with them (CR 104.5, 800.4a; rules/sba.mjs leaveGame): no
 * state-based action. One for whom "you can't lose the game" holds (Darksteel Angel) does not lose -- then, or later.
 */
export function loseGame(state, params, context) {
  const events = [];
  const losing = playersFor(state, params.who ?? "you", context.controller)
    .filter((id) => params.withLife === undefined || state.players[id].life === params.withLife)
    .filter((id) => !playerRuled(state, "cant-lose", id));
  for (const id of losing) leaveGame(state, state.players[id], "effect", events);
  /* The monarch among them: the designation passes on once they have all gone (CR 725.4; rules/sba.mjs). */
  return monarchLeft(state, events);
}

/**
 * `rollDie` -- "roll a d20" (Ancient Copper Dragon; wave 4c; CR 706.1-706.2): its controller rolls a die of `sides` sides,
 * each result as likely as any other -- from the game's random stream (rng.mjs), as a shuffle is, never chosen. The result
 * is what follows reads, "a number of Treasure tokens equal to the result" (`{dieRolled: true}`, script/amount.mjs), and
 * said to everyone. Nothing yet modifies a roll or watches for one ("whenever you roll a die", CR 706.2's results changed).
 */
export function rollDie(state, params, context, rng = null) {
  if (!rng) throw new Error("A die roll needs the game's random stream");
  /* A die of no number of sides is no die: nothing rolled (the schema refuses a script that says one, script/schema.mjs). */
  if (!(Number.isInteger(params.sides) && params.sides >= 2)) return [];
  const result = rng.int(params.sides) + 1;
  context.rolled = result;
  return [event("GameEventDieRolled", state, {player: {playerId: context.controller, name: state.players[context.controller]?.name}, sides: params.sides, result})];
}

/**
 * THE MONARCH (CR 725): a designation of the game's, not of any card -- none until an effect makes a player the monarch
 * (725.1), and one player's at most (725.3): `state.monarch`, that player's seat, unsaid while there is none, so a game made
 * before it hashes and replays as it did. As a player becomes it the monarch before stops being it. One who is the monarch
 * already does not become it again, and one who has left the game cannot (CR 800.4a). What being it does is two triggered
 * abilities of the game's own (rules/trigger.mjs, INHERENT_TRIGGERS), and what passes it on as its player leaves, the rule
 * of rules/sba.mjs (monarchLeft). Said to everyone: the designation is public.
 *
 * @returns {Array} the events, with one more when a player became the monarch
 */
export function crown(state, player, events = []) {
  if (state.players[player].lost || state.monarch === player) return events;
  state.monarch = player;
  events.push(event("GameEventBecomeMonarch", state, {player: {playerId: player, name: state.players[player].name}}));
  return events;
}

/**
 * `becomeMonarch` -- "you become the monarch" (Ginger, Queen of Sweets; Tamiyo, Upriser Crowned), and "its controller
 * becomes the monarch" (the monarch's own trigger, CR 725.2: `who: "that card's controller"`, the creature's controller now,
 * or as it last was; script/bind.mjs): `who` one player -- unsaid, the effect's controller; a target player, or nobody once
 * that target is gone (CR 608.2b).
 */
export function becomeMonarch(state, params, context) {
  const [player] = playersFor(state, params.who ?? "you", context.controller);
  return player === undefined ? [] : crown(state, player);
}

/* Who puts them, for "if you would put" (rules/statics.mjs): the effect's controller -- or, "that player ... puts a +1/+1
   counter on it" (Alexios, Deimos of Kosmos: `puts: "that player"`), the player the trigger is about. */
const putterOf = (params, context) => (params.puts === "that player" ? context.about.player : context.controller);

/** `putCounter` — CR 121. */
export function putCounter(state, params, context) {
  const events = [];
  /* A kind of counter its controller chooses (`counter: "chosen"`) is asked first, as it resolves (effects/asking.mjs,
     counterKind) -- never decided here, and never put on as a counter named "chosen". */
  if (params.counter === "chosen") throw new Error("putCounter with a chosen kind of counter asks its controller which: run it through resolution.mjs");
  for (const {id, kind, count} of counterPlacements(state, params, context, false))
    addCounters(state, id, kind, count, events, putterOf(params, context), params.counterOrders?.[placementKey(id, kind)] ?? []);
  /* "You get an experience counter" (Ezuri, Claw of Progress; CR 122.1): counters on players -- each player `who` names gets
     them, as many as "if you would put one or more counters on a player" leaves (rules/statics.mjs, playerCountersPlaced),
     kept with the player (state/index.mjs `counters`; every seat is shown them, projection.mjs). Poison counters are the
     `poison` effect's (CR 122.1f; cards/index.mjs refuses them here). */
  for (const player of params.who !== undefined ? playersFor(state, params.who, context.controller) : []) {
    const count = playerCountersPlaced(state, player, params.counter, params.count ?? 1, putterOf(params, context));
    const counters = state.players[player].counters;
    if (count > 0) counters[params.counter] = (counters[params.counter] ?? 0) + count;
  }
  /* "Put a +1/+1 counter on target creature you control, then it deals damage equal to its power" (Knockout Maneuver, Train
     E): `remember`, what it was told to put them on -- a counter put or not, a target no longer legal not among them (CR
     608.2b) -- for the effects after it, which read "it" as it then is (CR 608.2h), its power with the counter. */
  if (params.remember) context.remembered = [...(params.targets ?? [])];
  return events;
}

/** `putCounterAll` — on everything a selector matches. */
export function putCounterAll(state, params, context) {
  const events = [];
  for (const {id, kind, count} of counterPlacements(state, params, context, true))
    addCounters(state, id, kind, count, events, context.controller, params.counterOrders?.[placementKey(id, kind)] ?? []);
  return events;
}

/* ---- CR 616.1, before counters are put on ----

   The counter effects a resolution can stop to ask about (script/resolution.mjs; effects/asking.mjs, orderCounters), each
   as the placements it makes -- so the question and the putting see the same ones. */
const COUNTING = Object.freeze({putCounter, putCounterAll});
function counterPlacements(state, params, context, all) {
  const kind = params.counter ?? "+1/+1", count = params.count ?? 1;
  const ids = all ? selectMatching(state, params.selector ?? {what: "permanent"}, context) : params.targets ?? [];
  /* "Put this creature's counters on that token" (Ambitious Augmenter's dies trigger): each kind its source had as it last
     existed, as many (CR 608.2h) -- put on as counters are, so what changes counters put on changes these too. */
  if (params.countersOf === "self")
    return ids.flatMap((id) => Object.entries(context.lastKnown?.counters ?? {}).map(([had, n]) => ({id, kind: had, count: n})));
  /* "Whenever a creature you control leaves the battlefield, if it had counters on it, put those counters on The Ozolith"
     (wave 4b): each kind the creature the trigger is about had as it last existed, as many (CR 603.10a, 608.2h) -- not moved
     off it, so a second Ozolith gets them too (the card's ruling). */
  if (params.countersOf === "that card")
    return ids.flatMap((id) => Object.entries(context.about?.lastKnown?.counters ?? {}).map(([had, n]) => ({id, kind: had, count: n})));
  return ids.map((id) => ({id, kind, count}));
}
/** Which placement an answer belongs to: the permanent, and the kind. */
export const placementKey = (id, kind) => `${id}:${kind}`;

/**
 * The first placement of this counter effect whose replacement effects' order is the affected player's to choose and not
 * yet chosen (CR 616.1), given `answers` (by placement, `placementKey`): `{player, options, count, id, kind, by, key}`, or
 * null when there is none. It changes nothing.
 */
export function counterQuestion(state, effect, context, answers = {}) {
  if (!COUNTING[effect?.effect]) return null;
  for (const {id, kind, count} of counterPlacements(state, effect, context, effect.effect === "putCounterAll")) {
    const key = placementKey(id, kind);
    const {question} = placeCounters(state, {id}, kind, count, putterOf(effect, context), {orders: answers[key] ?? [], askable: true});
    if (question) return {...question, id, kind, by: putterOf(effect, context), key};
  }
  return null;
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
    for (const [kind, n] of Object.entries({...object.counters})) if (n > 0) addCounters(state, id, kind, n * more, events, context.controller);
  }
  for (const player of params.who !== undefined ? playersFor(state, params.who, context.controller) : [])
    if ((state.players[player].poison ?? 0) > 0) events.push(...givePoison(state, player, state.players[player].poison * more, context.controller));
  return events;
}

/** `removeCounter` — the other direction, and never below zero. "Remove all counters from target creature" (Perfect
    Intimidation): `counter: "all"`, every kind it has, all of each. "Remove all charge counters from this artifact"
    (Coalition Relic): `all: true`, every counter of the kind named. And how many it removed, for "for each charge counter
    removed this way" after it (`countersRemoved`, read by the amount `countersRemovedThisWay`, script/amount.mjs): none
    removed is 0 (CR 122.1, 608.2c). "Remove up to three counters from another target creature or planeswalker" (Mabel,
    Bitter Recluse): `counter: "any"`, which ones its controller's choice, asked first (effects/asking.mjs, countersToRemove)
    and done with the answer, `removing`, how many of each kind -- never decided here. */
export function removeCounter(state, params, context) {
  if (params.counter === "any" && params.removing === undefined)
    throw new Error("removeCounter of any kinds asks its controller which counters: run it through resolution.mjs");
  const events = [];
  let removed = 0;
  for (const id of params.targets ?? []) {
    const object = state.objects[id];
    if (!object) continue;
    const kinds = params.counter === "all" ? Object.keys(object.counters ?? {}) : params.counter === "any" ? Object.keys(params.removing) : [params.counter ?? "+1/+1"];
    for (const kind of kinds) {
      const before = object.counters[kind] ?? 0;
      const after = params.counter === "all" || params.all === true ? 0 : Math.max(0, before - (params.counter === "any" ? params.removing[kind] : params.count ?? 1));
      if (after === before) continue;
      object.counters[kind] = after;
      removed += before - after;
      events.push(event("GameEventCardCounters", state, {
        card: cardRef(state, id), type: kind, oldValue: before, newValue: after,
      }));
    }
  }
  if (context) context.countersRemoved = removed;
  return events;
}

/**
 * `moveCounters` -- CR 122.5: "you may move a counter from target creature you control onto a second target creature you
 * control" (Tidus, Yuna's Guardian). `count` counters of the kind `counter` taken off `from` (an object, bound as a target
 * is) and put on the effect's `targets` (the second object). Nothing moves (122.5) when the two are the same object, when
 * the first has none of that kind, or when either is no longer on the battlefield; with fewer than that many there, those
 * there move (CR 609.3; Train E, Tester of the Tangential's "move X +1/+1 counters"). They
 * are put on as any counters are (addCounters): what watches for counters being put on sees them (CR 122.6), and "twice
 * that many instead" applies. Which kind, when the card leaves it to its controller (`counter: "chosen"`), is asked first
 * (script/resolution.mjs; effects/asking.mjs, counterKind) -- never here.
 */
export function moveCounters(state, params, context) {
  const events = [];
  if (params.counter === "chosen") throw new Error("moveCounters with a chosen kind of counter asks its controller which: run it through resolution.mjs");
  /* "Onto other creatures" (Forgotten Ancient): where each goes is asked (effects/asking.mjs, countersOnto), never decided here. */
  if (params.onto !== undefined) throw new Error("moveCounters onto permanents its controller chooses asks where: run it through resolution.mjs");
  const [from] = params.from ?? [], [to] = params.targets ?? [];
  /* "Move all counters from The Ozolith onto target creature" (wave 4b; CR 122.5): every kind there, all of each, each moved as
     one kind is below. */
  if (params.counter === "all") {
    const there = Object.entries(state.objects[from]?.counters ?? {});
    return there.flatMap(([kind, n]) => moveCounters(state, {...params, counter: kind, count: n}, context));
  }
  const kind = params.counter ?? "+1/+1", n = Math.max(0, params.count ?? 1);
  if (from === undefined || to === undefined || from === to || n === 0) return events;
  const source = state.objects[from], destination = state.objects[to];
  if (source?.zone !== "battlefield" || destination?.zone !== "battlefield" || (source.counters?.[kind] ?? 0) < 1) return events;
  /* "Move X +1/+1 counters from this creature onto another target creature" (Tester of the Tangential, Train E) with fewer
     than X there: each counter that can move does, and the rest cannot (CR 122.5: none of a kind it has not got; 609.3: as
     much as possible). */
  const moving = Math.min(n, source.counters[kind]);
  const before = source.counters[kind];
  source.counters[kind] = before - moving;
  events.push(event("GameEventCardCounters", state, {card: cardRef(state, from), type: kind, oldValue: before, newValue: source.counters[kind]}));
  addCounters(state, to, kind, moving, events, context.controller);
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
      /* The proliferating player puts each (CR 701.34a): "twice that many" sees them. */
      for (const [kind, amount] of Object.entries(player.counters)) {
        if (amount > 0) player.counters[kind] = amount + playerCountersPlaced(state, choice.player, kind, 1, context.controller);
      }
      /* Poison counters are counters (CR 122.1f): one more, reported as any poisoning is (batch 77). */
      if (player.poison > 0) events.push(...givePoison(state, choice.player, 1, context.controller));
      continue;
    }
    const object = state.objects[choice];
    if (!object) continue;
    for (const [kind, amount] of Object.entries({...object.counters})) {
      if (amount > 0) addCounters(state, choice, kind, 1, events, context.controller);
    }
  }
  return events;
}

/* ---- exchanging life totals (CR 701.12), and damage dealt by each of a set ---- */

/* Whether a player's life total may become `value` (CR 701.12c, 701.12g, 119.7-8): no higher for a player who can't gain
   life, and no other at all while their life total can't change (Teferi's Reproach). */
function lifeMayBecome(state, player, value) {
  const life = state.players[player].life;
  if (value === life) return true;
  if ((state.effects ?? []).some((e) => e.rule === "life-cant-change" && (e.players ?? []).includes(player))) return false;
  return !(value > life && cantGainLife(state, player));
}

/**
 * `exchangeLife` -- CR 701.12 (Forge's ExchangeLifeVariant): "exchange your life total with this creature's toughness" (Tree
 * of Redemption), "exchange target opponent's life total with this creature's toughness" (Tree of Perdition), and "exchange
 * life totals with target opponent" (701.12c). `who` the player whose life total it is (bound: "you", a target); then
 * either `targets`, the creature whose toughness it is exchanged with, or `toPlayer`, the other player.
 *
 * ALL OR NOTHING (701.12a): if the entire exchange can't be completed, no part of it happens -- the creature no longer on
 * the battlefield, or no longer a creature (the card's ruling: the Tree gone before its ability resolves exchanges
 * nothing); a player who has left the game; a player who can't gain life given a higher total, or one whose life total
 * can't change given another (701.12c, 119.7-8). A player's side is life gained or lost -- whatever watches for that sees
 * it (701.12c, 701.12g). The creature's side is a continuous effect setting its toughness to the player's previous life
 * total (701.12g, 613.4b: layer 7b), for as long as it is that object (CR 611.2a, 400.7) -- so a +1/+1 counter still adds
 * to it (7d), and damage already marked on it is still marked (a Tree dealt 5 that takes a life total of 4 dies, CR
 * 704.5g). Its toughness is read through the layers as the exchange happens (CR 608.2h).
 */
export function exchangeLife(state, params, context) {
  const events = [];
  const [player] = playersFor(state, params.who ?? "you", context.controller);
  if (player === undefined) return events;
  if (params.toPlayer !== undefined) {
    const other = params.toPlayer;
    if (!state.players[other] || state.players[other].lost || other === player) return events;
    const mine = state.players[player].life, theirs = state.players[other].life;
    if (!lifeMayBecome(state, player, theirs) || !lifeMayBecome(state, other, mine)) return events;
    changeLife(state, player, theirs - mine, events);
    changeLife(state, other, mine - theirs, events);
    return events;
  }
  const [creature] = params.targets ?? [];
  if (creature === undefined || state.objects[creature]?.zone !== "battlefield" || !typesOf(state, creature).includes("Creature")) return events;
  const toughness = toughnessOf(state, creature), life = state.players[player].life;
  if (!lifeMayBecome(state, player, toughness)) return events;
  changeLife(state, player, toughness - life, events);
  (state.effects ??= []).push({id: `exchange:${creature}:${state.nextTimestamp}`, layer: 7, sublayer: "b", affects: {ids: [creature]},
    apply: {setToughness: life}, until: null, sourceController: context.controller, timestamp: state.nextTimestamp});
  state.nextTimestamp += 1;
  return events;
}

/**
 * `damageEach` -- Forge's EachDamage: "each creature deals damage to itself equal to its power" (Wave of Reckoning). Each
 * permanent `selector` matches as it resolves is a source of its own (CR 120.1), dealing `dealt` -- an amount counted for it,
 * "that card" being the one dealing it (its power, through the layers, CR 208.1) -- to itself (`to: "itself"`), or to the
 * effect's `targets` and players (`who`). Every amount is read before any damage is dealt, and the damage is dealt at once
 * (CR 120.3), the dying state-based, afterwards (CR 704.5g): a 0/0 dealing 0 deals nothing (120.8), and each source's own
 * deathtouch, lifelink and infect are its own (CR 702.2b, 702.15b, 702.90b) -- a lifelinking creature dealing damage to
 * itself still gains its controller that life. Through replacement and prevention, as all damage is (dealDamage).
 */
function damageEachCalls(state, params, context) {
  const {anyOf, ...shared} = params.selector ?? {what: "permanent", types: ["Creature"]};
  const dealers = Array.isArray(anyOf) ? [...new Set(anyOf.flatMap((one) => selectMatching(state, {...shared, ...one}, context)))] : selectMatching(state, shared, context);
  const calls = [];
  for (const id of dealers) {
    const about = {...(context.about ?? {}), card: id, player: controllerOf(state, id)};
    const amount = Math.max(0, amountOf(state, params.dealt ?? 0, {...context, about}));
    const to = params.to === "itself" ? {targets: [id]} : {targets: params.targets ?? [], ...(params.who !== undefined ? {who: params.who} : {})};
    calls.push([{amount, ...to, from: [id], ...(params.damageOrders ? {damageOrders: params.damageOrders} : {})}, context]);
  }
  return calls;
}
export function damageEach(state, params, context) {
  return damageEachCalls(state, params, context).flatMap(([deal, ctx]) => dealDamage(state, deal, ctx));
}
