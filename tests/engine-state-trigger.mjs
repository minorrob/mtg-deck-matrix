/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (w2c-hands-triggers): STATE TRIGGERS (CR 603.8).
 *
 * "When this artifact has twenty or more charge counters on it, you win the game" (Darksteel Reactor): a trigger on a game
 * state rather than an event -- `on: "state"`, its `state` a condition (cards/index.mjs, script/schema.mjs) -- triggering
 * as soon as the state holds, and not again until that triggering has left the stack; then, still holding, again
 * (rules/trigger.mjs). What the scenarios cannot reach: not again while it waits or is on the stack, again once it has
 * resolved, one for each permanent, a state that stops holding, what the schema refuses, and the catalog's credit.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {collectTriggers, openTriggers} from "../game/engine/rules/trigger.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {gameOver} from "../game/engine/rules/sba.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const REACTOR = "Darksteel Reactor";
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
/* "When you control no other creatures, you gain 1 life." -- a state that goes on holding after it resolves. */
const LONER = {card: "Loner", types: ["Creature"], manaCost: "{1}", power: 1, toughness: 1, abilities: [{id: "l", kind: "triggered", text: "When you control no other creatures, you gain 1 life.",
  trigger: {on: "state", state: {present: {what: "permanent", types: ["Creature"], controller: "you", another: true}, atMost: 0}}, effects: [{effect: "gainLife", amount: 1}]}]};
const BEAR = {card: "Bear", types: ["Creature"], manaCost: "{1}", power: 2, toughness: 2};
function table() {
  const s = createState({matchId: "m", seed: "state-trigger", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
const waiting = (s, id) => (s.pendingTriggers ?? []).filter((t) => t.source.cardId === id).length + s.stack.filter((e) => e.cardId === id).length;
/* Charge counters put on (or, a negative count, removed from) a permanent by an effect: what happened, read for triggers. */
const charge = (s, id, count) => collectTriggers(s, runEffects(s, [{effect: count >= 0 ? "putCounter" : "removeCounter", targets: [id], counter: "charge", count: Math.abs(count)}], {controller: 0, source: null}));
/* A permanent put onto the battlefield by an effect, as it would be. */
const arrive = (s, o, seat) => { const id = addObject(s, {...o, owner: seat, controller: seat}, "hand", seat); collectTriggers(s, runEffects(s, [{effect: "moveZone", targets: [id], to: "battlefield"}], {controller: seat, source: null})); };
const resolveTop = (s) => { const top = s.stack.at(-1)?.stackId; for (let n = 0; n < 6 && s.stack.some((e) => e.stackId === top) && !s.awaiting; n += 1) passPriority(s); };

{
  /* Nineteen: nothing. Twenty: once -- and not again as what happens is read again, waiting or on the stack. */
  const s = table();
  const reactor = on(s, card(REACTOR), 0);
  charge(s, reactor, 19);
  eq(waiting(s, reactor), 0, "nineteen: nothing");
  s.objects[reactor].counters.charge = 20;
  collectTriggers(s, []);
  eq(waiting(s, reactor), 0, "twenty, with nothing seen happening: not read yet");
  charge(s, reactor, 1);
  charge(s, reactor, 1);
  eq(waiting(s, reactor), 1, "a counter put on, then another: one, waiting");
  openTriggers(s);
  charge(s, reactor, 1);
  eq([s.stack.length, waiting(s, reactor)], [1, 1], "on the stack: still one, with another counter");
  /* The counters gone before it resolves: no intervening "if" -- it resolves, and he wins (CR 603.8 is no 603.4). */
  charge(s, reactor, -23);
  eq(s.objects[reactor].counters.charge ?? 0, 0, "every counter removed");
  resolveTop(s);
  eq(gameOver(s)?.winner, 0, "resolved: Rob wins");
}
{
  /* A state still holding once it has resolved triggers again (CR 603.8); the Bear arriving ends it. */
  const s = table();
  arrive(s, LONER, 0);
  const loner = s.zones.battlefield.find((id) => s.objects[id].card === "Loner");
  openTriggers(s);
  resolveTop(s);
  eq([s.players[0].life, waiting(s, loner)], [41, 1], "resolved, and alone still: 1 life, and it triggers again");
  on(s, BEAR, 0);
  resolveTop(s);
  eq([s.players[0].life, waiting(s, loner)], [42, 0], "another creature now: the one waiting resolves, and no more");
}
{
  /* Two Reactors at twenty: one each. */
  const s = table();
  const a = on(s, card(REACTOR), 0), b = on(s, card(REACTOR), 1);
  s.objects[b].counters.charge = 25;
  charge(s, a, 20);
  eq([waiting(s, a), waiting(s, b), s.pendingTriggers.map((t) => t.controller).sort()], [1, 1, [0, 1]], "each its own, each its controller's");
}
{
  /* What the schema refuses: a state trigger with no state, or a state outside the condition grammar. */
  const script = (trigger) => ({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Artifact"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: []},
    oracleText: "Odd.", abilities: [{kind: "triggered", text: "Odd.", trigger, effects: [{effect: "gainLife", amount: 1}]}]});
  const problems = (trigger) => compileScript(script(trigger)).problems;
  eq(problems({on: "state", state: {handEmpty: true}}), [], "a state of the condition grammar: kept");
  eq([problems({on: "state"}).length > 0, problems({on: "state", state: {sometimes: true}}).some((p) => p.includes("sometimes"))], [true, true], "none, or one it has no words for: refused");
}
{
  eq(missingFor({apis: ["PutCounter", "WinsGame"], triggers: ["Always", "Phase"]}).filter((m) => m.kind === "trigger"), [], "the catalog: Forge's Always is a trigger the engine builds");
}

console.log(`engine-state-trigger: ${checks} checks passed -- a state trigger triggers the moment its state holds, not again while it waits or is on the stack, again once it has resolved if the state still holds, one for each permanent.`);
