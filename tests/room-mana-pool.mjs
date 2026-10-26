/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   THE MANA POOL'S FACTS, AND A SIGNET'S MANA SPENT FIRST (Rob, Oct 26, 2026; game/engine/rules/actions.mjs manaSources,
   game/room/room.mjs, crankmagic-board.js's Mana Pool module).

     1. A seat's view says what each of its permanents could tap for (`manaSources`): a basic land its one color, a
        Signet both of its colors at once for {1} more, Command Tower each color of its commander's identity; tapped or
        not, and whether it could be tapped now. Only that seat's own permanents, and only to that seat.
     2. "When I tap a mana to tap an artifact like Orzhov Signet, its mana ... [is] available for spending to cast and
        prioritized to spend in the Actions when I select to cast a spell": a Plains tapped for {W}, the Signet paid
        with it for {W}{B}, and a {1}{W} spell cast is paid from that floating mana, the other Plains left untapped.

     node tests/room-mana-pool.mjs
*/
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom, basicCards} from "../game/room/room.mjs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {manaSources, legalActions} from "../game/engine/rules/actions.mjs";
import {tableDefinition} from "../game/engine/cards/definitions.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const cards = (name) => name === "Bear" ? {types: ["Creature"], manaCost: "{1}{W}", power: 2, toughness: 2}
  : name === "Commander" ? {types: ["Creature"], manaCost: "{9}", power: 1, toughness: 1, colorIdentity: ["W", "B"]}
  : tableDefinition(name) ?? basicCards(name);
const deck = Array.from({length: 99}, (_, i) => ["Plains", "Orzhov Signet", "Command Tower", "Bear", "Swamp"][i % 5]);
const pod = {seats: ["rob", "maya"].map((seatId) => ({seatId, name: seatId, pilot: "human", commander: ["Commander"], cards: deck})), passEmpty: true, endAsks: true, untapMana: true};
const room = await startRoom({storage: memoryStorage(), matchId: "mana-pool", cards, seed: "mana-pool-1", pod});
const view = () => room.view(room.waitingOn);
const find = (v, act, pred = () => true) => v.decision?.options.find((o) => o.act === act && pred(o));
const answer = (v, o) => room.act(v.seatId, {kind: "answer", actionId: randomUUID(), revision: v.revision, choiceId: v.decision.id, indices: [o.index]});
const mine = (v) => v.state.players[0], field = (v) => mine(v).zones.Battlefield.cards;
const named = (v, n) => field(v).filter((c) => c.name === n);
const pool = (v) => Object.fromEntries(mine(v).mana.map((m) => [m.color, m.amount]));

/* To rob's main phase with a Signet, Command Tower, two untapped Plains and a Bear in hand: lands played, the Signet cast. */
let v;
for (let n = 0; n < 4000; n++) {
  v = view();
  if (v.seatId === "rob" && v.decision?.kind === "priority" && /MAIN/.test(v.state.phase) && !v.state.stack.length && named(v, "Orzhov Signet").length
    && named(v, "Command Tower").length && named(v, "Plains").filter((c) => !c.tapped).length >= 2 && mine(v).zones.Hand.cards.some((c) => c.name === "Bear")) break;
  const mineToDo = v.seatId === "rob" ? (find(v, "play-land", (o) => o.label === "Plains" && named(v, "Plains").length < 2) || find(v, "play-land", (o) => o.label === "Command Tower")
    || find(v, "play-land") || (named(v, "Orzhov Signet").length ? null : find(v, "cast", (o) => o.label === "Orzhov Signet"))) : null;
  await answer(v, mineToDo || find(v, "pass") || v.decision.options[0]);
}
ok(named(v, "Orzhov Signet").length && named(v, "Command Tower").length, `rob's board has its sources (${field(v).map((c) => c.name).join(", ")})`);

/* ---- 1. what each permanent could tap for ---- */
const by = (v, name) => v.manaSources.filter((s) => s.name === name);
ok(Array.isArray(v.manaSources) && v.manaSources.every((s) => field(v).some((c) => c.cardId === s.cardId)), "the view lists the seat's own mana sources, each a permanent of theirs");
ok(!v.manaSources.some((s) => s.name === "Bear" || s.name === "Commander"), "and nothing that makes no mana");
eq(by(v, "Plains")[0].ways, [{mana: {W: 1}}], "a Plains: one {W}");
eq(by(v, "Orzhov Signet")[0].ways, [{mana: {W: 1, B: 1}, pay: 1}], "a Signet: {W}{B} at once, for {1} first");
eq(by(v, "Command Tower")[0].ways.map((w) => w.mana).sort((a, b) => Object.keys(a)[0].localeCompare(Object.keys(b)[0])), [{B: 1}, {W: 1}], "Command Tower: either color of the commander's identity");
ok(v.manaSources.filter((s) => !s.tapped).every((s) => s.ready), "untapped and able, each could be tapped now");
const maya = room.view("maya");
ok(maya.manaSources.every((s) => maya.state.players[1].zones.Battlefield.cards.some((c) => c.cardId === s.cardId)), "an opponent's view lists only their own");

/* ---- 2. a Plains, then the Signet, then a Bear paid from the pool ---- */
const plains = named(v, "Plains").filter((c) => !c.tapped).map((c) => c.cardId);
await answer(v, find(v, "activate-mana", (o) => o.label === "Plains")); v = view();
eq(pool(v), {W: 1}, "the Plains makes {W}");
ok(by(v, "Plains").filter((s) => s.tapped).length >= 1 && by(v, "Plains").some((s) => s.tapped && !s.ready), "and the view says it is tapped");
await answer(v, find(v, "activate-mana", (o) => o.label === "Orzhov Signet")); v = view();
eq(pool(v), {W: 1, B: 1}, "the Signet takes that {W} for its {1} and makes {W}{B}");
const untapped = () => field(view()).filter((c) => plains.includes(c.cardId) && !c.tapped).map((c) => c.cardId);
const left = untapped();
eq(left.length, 1, "one Plains is still untapped");
const cast = find(v, "cast", (o) => o.label === "Bear");
ok(cast && !/tapping/.test(cast.detail || ""), `the Bear is offered paid from the pool, nothing tapped for it (${cast?.detail || "no detail"})`);
await answer(v, cast); v = view();
eq(v.state.stack.map((s) => s.name), ["Bear"], "the Bear is cast");
eq(mine(v).mana, [], "the floating {W}{B} paid for it");
eq(untapped(), left, "and the other Plains stays untapped");
/* Actual definitions: colored costs survive the view seam, and life costs gate readiness. */
{
  const state = createState({players: [{name: "Rob"}, {name: "Maya"}]});
  state.turn = 2; state.activePlayer = 0; state.priorityPlayer = 0; state.phase = "MAIN1";
  state.players[0].turnBegan = 2;
  const put = (name) => {const id = addObject(state, {card: name, ...tableDefinition(name), owner: 0, controller: 0}, "battlefield"); state.objects[id].controlledSinceTurn = 1; return id;};
  const castle = put("Castle Garenbrig"), convert = put("Myr Convert");
  state.players[0].life = 1;
  const sources = manaSources(state, 0);
  eq(sources.find((x) => x.cardId === castle).ways.find((w) => w.pay === 4).payColors, {G: 2}, "Castle's activation retains its two green requirements");
  ok(!legalActions(state, 0).some((a) => a.kind === "activate-mana" && a.objectId === convert), "the legal-offer contract refuses Myr Convert at one life");
  eq(sources.find((x) => x.cardId === convert).ready, false, "the view agrees that Myr Convert cannot pay two life");
  state.players[0].life = 3;
  ok(manaSources(state, 0).find((x) => x.cardId === convert).ready && legalActions(state, 0).some((a) => a.kind === "activate-mana" && a.objectId === convert), "Myr Convert is ready and legally offered when its life cost can be paid");
}
console.log(`room-mana-pool: ${checks} checks passed`);
