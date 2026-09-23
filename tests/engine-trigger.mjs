/* TRIGGERED ABILITIES: WHAT HAPPENS BECAUSE SOMETHING ELSE HAPPENED.
 *
 * `docs/engine/PLAN.md` §3.3 (triggered abilities, CR 603) — "leaves-the-battlefield look-back
 * (603.10), intervening if".
 *
 * A TRIGGER DOES NOT RESOLVE WHEN IT TRIGGERS (CR 603.3). It waits, and goes on the stack the next
 * time a player would receive priority. An engine that runs the effect at the moment of the event
 * gets the whole game wrong in a way that is hard to see: the trigger cannot be responded to, it
 * resolves before state-based actions, and two triggers from one event resolve in the order they
 * happened rather than the order their controllers chose.
 *
 * APNAP (CR 603.3b). When several trigger at once, the ACTIVE player's go on the stack first, then
 * each other player's in turn order. Because the stack resolves last-on-first-off, that means the
 * active player's trigger resolves LAST. Getting this backwards is the classic error, and it is
 * invisible until two triggers fight over the same permanent.
 *
 * A PLAYER ORDERS THEIR OWN (CR 603.3b). Two of your triggers at once is a decision, not a
 * timestamp — and it is the player's, not the engine's.
 *
 * LOOK-BACK (CR 603.10a, 603.6e). "Whenever this creature dies" has to see the creature, and by the
 * time the trigger is collected the creature is a card in a graveyard and, because a zone change
 * makes a new object, not even the same object. The engine's events already carry the card as it
 * was at the moment of the move — the snapshot is taken before anything is applied — so the
 * look-back is not special machinery, it is the event envelope doing its job.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {beginGame, advance, currentPhase, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {stackSize, peekStack} from "../game/engine/rules/stack.mjs";
import {collectTriggers, pendingCount} from "../game/engine/rules/trigger.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}]};

/* A trigger is data over the event envelope the engine already emits, which is what the card
   script will compile to in phase 2 rather than a private vocabulary invented here. */
const DIES = {id: "on-death", kind: "triggered", text: "Whenever this creature dies, …",
  trigger: {on: "GameEventCardChangeZone", who: "self", from: "Battlefield", to: "Graveyard"}};
const ETB = {id: "on-etb", kind: "triggered", text: "Whenever another creature enters, …",
  trigger: {on: "GameEventCardChangeZone", who: "any", to: "Battlefield"}};
const UPKEEP = {id: "on-upkeep", kind: "triggered", text: "At the beginning of your upkeep, …",
  trigger: {on: "GameEventTurnPhase", phase: "UPKEEP", yourTurn: true}};

function started() {
  const s = createState(pod);
  for (let seat = 0; seat < 4; seat += 1)
    for (let i = 0; i < 60; i += 1)
      addObject(s, {card: `L${seat}-${i}`, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  return s;
}
const creature = (over) => ({types: ["Creature"], power: 2, toughness: 2, ...over});

/* ---- a trigger waits for priority; it does not resolve where it happened (CR 603.3) ---- */
{
  const s = started();
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0, abilities: [DIES]}), "battlefield");
  s.objects[bear].damage = 5;

  const events = checkStateBasedActions(s);
  eq(cardsIn(s, "graveyard", 0).length, 1, "the creature died");
  collectTriggers(s, events);
  eq(pendingCount(s), 1, "and its ability triggered");
  eq(stackSize(s), 0,
    "but nothing is on the stack yet — a trigger waits for the next time a player would receive priority (CR 603.3)");
}

/* ---- look-back: the trigger knows what died (CR 603.10a) ---- */
{
  const s = started();
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0, abilities: [DIES]}), "battlefield");
  s.objects[bear].damage = 5;
  collectTriggers(s, checkStateBasedActions(s));
  const pending = s.pendingTriggers[0];
  eq(pending.source.name, "Bear",
    "the trigger carries the creature as it was — by now the object is gone and the card is a different object in a graveyard");
  eq(pending.source.cardId, bear, "with the id it had on the battlefield, which is what an 'exile it' effect would need");
  eq(pending.controller, 0, "controlled by whoever controlled it as it left (CR 603.10a)");
}

/* ---- a trigger that watches somebody else ---- */
{
  const s = started();
  addObject(s, creature({card: "Watcher", owner: 0, controller: 0, abilities: [ETB]}), "battlefield");
  const arrival = addObject(s, creature({card: "Newcomer", owner: 1, controller: 1}), "battlefield");
  /* Entering the battlefield is a zone change, and the engine reports it as one. */
  collectTriggers(s, [{kind: "GameEventCardChangeZone", data: {turn: s.turn, fields: {
    card: {cardId: arrival, name: "Newcomer", owner: 1, controller: 1},
    from: {zoneType: "Hand", player: {playerId: 1}},
    to: {zoneType: "Battlefield", player: {playerId: 1}},
  }}}]);
  eq(pendingCount(s), 1, "a creature entering under somebody else's control still triggers a watcher");
  eq(s.pendingTriggers[0].controller, 0, "controlled by the watcher's controller, not the newcomer's");
}
{
  const s = started();
  addObject(s, creature({card: "Loner", owner: 0, controller: 0, abilities: [DIES]}), "battlefield");
  const other = addObject(s, creature({card: "Other", owner: 1, controller: 1}), "battlefield");
  s.objects[other].damage = 5;
  collectTriggers(s, checkStateBasedActions(s));
  eq(pendingCount(s), 0,
    "a 'whenever THIS creature dies' ability does not trigger on somebody else's death");
}
{
  const s = started();
  addObject(s, creature({card: "Ghost", owner: 0, controller: 0, abilities: [DIES]}), "graveyard", 0);
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  s.objects[bear].damage = 5;
  collectTriggers(s, checkStateBasedActions(s));
  eq(pendingCount(s), 0,
    "an ability on a card in a graveyard does not watch the battlefield (CR 113.6) — only where the card is");
}

/* ---- APNAP: the active player's go on the stack first, so they resolve LAST (CR 603.3b) ---- */
{
  const s = started();
  addObject(s, creature({card: "Mine", owner: 0, controller: 0, abilities: [ETB]}), "battlefield");
  addObject(s, creature({card: "Theirs", owner: 2, controller: 2, abilities: [ETB]}), "battlefield");
  const arrival = addObject(s, creature({card: "Newcomer", owner: 1, controller: 1}), "battlefield");
  collectTriggers(s, [{kind: "GameEventCardChangeZone", data: {turn: s.turn, fields: {
    card: {cardId: arrival, name: "Newcomer", owner: 1, controller: 1},
    from: {zoneType: "Hand", player: {playerId: 1}},
    to: {zoneType: "Battlefield", player: {playerId: 1}},
  }}}]);
  eq(pendingCount(s), 2, "both watchers triggered");

  /* Getting to the next step is what puts them on the stack. */
  advance(s);
  eq(stackSize(s), 2, "and the next priority put both on the stack (CR 603.3)");
  eq(peekStack(s).playerId, 2,
    "the NON-active player's is on top, because the active player's went on first — so the active player's resolves LAST");
  eq(s.stack[0].playerId, 0, "with the active player's underneath");
  eq(pendingCount(s), 0, "and nothing is still waiting");
}

/* ---- a player with two triggers orders their own (CR 603.3b) ---- */
{
  const s = started();
  const first = {...ETB, id: "a"};
  const second = {...ETB, id: "b"};
  addObject(s, creature({card: "Twofold", owner: 0, controller: 0, abilities: [first, second]}), "battlefield");
  const arrival = addObject(s, creature({card: "Newcomer", owner: 1, controller: 1}), "battlefield");
  collectTriggers(s, [{kind: "GameEventCardChangeZone", data: {turn: s.turn, fields: {
    card: {cardId: arrival, name: "Newcomer", owner: 1, controller: 1},
    from: {zoneType: "Hand", player: {playerId: 1}},
    to: {zoneType: "Battlefield", player: {playerId: 1}},
  }}}]);
  eq(pendingCount(s), 2, "one permanent, two abilities, two triggers");

  advance(s);
  eq(s.awaiting?.kind, "order-triggers", "two of your own triggers is a decision, not a timestamp");
  eq(s.awaiting.player, 0, "and it is yours to make");
  const choice = awaitingChoice(s);
  eq(choice.mode, "order", "as an ordering");
  eq(choice.min, 2, "over both of them");
  eq(choice.options.length, 2, "each named by its ability's text, so a player can tell them apart");
  eq(stackSize(s), 0, "and nothing goes on the stack until it is answered");

  resolveAwaiting(s, [1, 0]);
  eq(stackSize(s), 2, "answering puts them on in the order chosen");
  eq(peekStack(s).abilityId, "a",
    "the one put on LAST is on top and resolves FIRST — so choosing b then a resolves a first");
}

/* ---- an intervening if is checked when it would trigger (CR 603.4) ---- */
{
  const withIf = {id: "gated", kind: "triggered", text: "At the beginning of your upkeep, if you have no cards in hand, …",
    trigger: {on: "GameEventTurnPhase", phase: "UPKEEP", yourTurn: true},
    condition: {handEmpty: true}};
  const s = started();
  addObject(s, creature({card: "Gate", owner: 0, controller: 0, abilities: [withIf]}), "battlefield");
  addObject(s, {card: "A card", owner: 0, controller: 0}, "hand", 0);
  advance(s);
  eq(currentPhase(s), "UPKEEP", "it is the upkeep");
  eq(pendingCount(s) + stackSize(s), 0,
    "and with a card in hand the ability does not trigger at all (CR 603.4) — it is not put on the stack and then removed, it never goes on");
}
{
  const withIf = {id: "gated", kind: "triggered", text: "…if you have no cards in hand, …",
    trigger: {on: "GameEventTurnPhase", phase: "UPKEEP", yourTurn: true},
    condition: {handEmpty: true}};
  const s = started();
  addObject(s, creature({card: "Gate", owner: 0, controller: 0, abilities: [withIf]}), "battlefield");
  advance(s);
  eq(stackSize(s), 1, "with an empty hand it does, and goes on the stack as the step gives out priority");
}

/* ---- your upkeep is yours (CR 603.2) ---- */
{
  const s = started();
  addObject(s, creature({card: "Mine", owner: 0, controller: 0, abilities: [UPKEEP]}), "battlefield");
  addObject(s, creature({card: "Theirs", owner: 1, controller: 1, abilities: [UPKEEP]}), "battlefield");
  collectTriggers(s, advance(s));
  eq(pendingCount(s), 1, "on seat 0's upkeep, only seat 0's ability triggers");
  eq(s.pendingTriggers[0].controller, 0, "theirs");
}

/* ---- a trigger is an ability on the stack, and behaves like one ---- */
{
  const s = started();
  addObject(s, creature({card: "Mine", owner: 0, controller: 0, abilities: [UPKEEP]}), "battlefield");
  advance(s);
  eq(stackSize(s), 1, "it went on the stack");
  eq(peekStack(s).kind, "trigger", "as a trigger, which is how the board labels it");
  eq(s.priorityPlayer, 0, "and the active player has priority with it there, so it can be responded to");

  for (let i = 0; i < 3; i += 1) passPriority(s);
  const result = passPriority(s);
  eq(result.outcome, "resolved", "a full round of passes resolves it");
  eq(stackSize(s), 0, "and it leaves the stack");
}

console.log(`engine-trigger: ${checks} checks passed — a trigger waits for priority, the active player's goes on first and resolves last, a player orders their own, and the look-back is the event envelope doing its job.`);
