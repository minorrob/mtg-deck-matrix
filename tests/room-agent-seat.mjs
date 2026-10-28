/* THE LLM SEAT IN THE ROOM (AI-2): ITS CLOSE CALLS OFFERED TO IT, ITS ANSWERS ON THE TAPE.
 *
 * game/engine/pilots/agent-pilot.mjs plays L1 at Normal and asks to consult at its close calls; game/room/room.mjs then
 * offers that one decision to the seat as to a person, and whoever answers for the seat -- the table's model, or the
 * room's own `houseAnswer` when the model cannot -- answers through `act`. This suite holds, with a stand-in for the
 * model (no network):
 *
 *   1. The seat is asked only at close calls, and never at anything else: every decision it is offered is one its pilot
 *      called close, and the rest of its play goes on without it.
 *   2. Answered by `houseAnswer` throughout, or by a stand-in that picks the first option every time, the game finishes,
 *      and replays from its seed and tape to the same game: the answers are on the tape, so a replay asks no one.
 *   3. A room reopened while it waits on the seat is still waiting on it, with the same question.
 *   4. `houseAnswer` answers only for an AI seat that is being asked.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom, openRoom, RoomError, LLM} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";
import {agentPilot, CLOSE} from "../game/engine/pilots/agent-pilot.mjs";
import {decksFromBackup, person} from "../tools/fuzz-live.mjs";
import {tableCards} from "../cloud/game-room.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const backup = JSON.parse(readFileSync(new URL("../data/live-state.json", import.meta.url), "utf8"));
const decks = decksFromBackup(backup, ["D6 Krenko Goblins", "D2 Chulane Value Loop"]);
const pod = {passEmpty: true, endWhenNoPerson: true, resolveAll: true, passAfterCast: true, seats: [
  {seatId: "rob", name: "Rob", pilot: "human", commander: decks[0].commander, cards: decks[0].cards},
  {seatId: "claude", name: "Claude", pilot: "house", level: LLM, commander: decks[1].commander, cards: decks[1].cards}]};

/* A game: Rob at random from what he is offered, the LLM seat answered by `forSeat`. */
async function play({storage = memoryStorage(), matchId, forSeat, reopenAt = null}) {
  let room = await startRoom({storage, matchId, cards: tableCards, pod, seed: `${matchId}-seed`});
  const rob = person(`${matchId}-rob`);
  const asked = [];
  let n = 0, reopened = null;
  while (room.waitingOn && room.status !== "finished") {
    const who = room.waitingOn, view = room.view(who);
    if (view.state.turn > 200) break;
    if (who === "claude") {
      asked.push(view.decision);
      if (reopenAt !== null && asked.length === reopenAt && !reopened) {
        room = await openRoom({storage, matchId, cards: tableCards});
        reopened = {waiting: room.waitingOn, same: JSON.stringify(room.view("claude").decision) === JSON.stringify(view.decision)};
      }
      const answer = forSeat(room, view);
      await room.act("claude", {actionId: randomUUID(), revision: view.revision, kind: "answer", choiceId: view.decision.id, ...answer});
    } else {
      await room.act(who, {actionId: randomUUID(), revision: view.revision, ...rob(view.decision, view.state.turn, view)});
    }
    n += 1;
  }
  return {room, asked, reopened, storage, matchId};
}

/* ---- 1 and 2: answered as its own pilot would, through the tape ---- */
{
  const game = await play({matchId: "agent-house", forSeat: (room) => room.houseAnswer("claude")});
  const end = game.room.view("rob");
  ok(game.room.status === "finished", `with houseAnswer for the LLM seat, the game finishes (${end.state.turn} turns, ${game.asked.length} close calls offered to the seat)`);
  ok(game.asked.length > 0, "and the seat was asked: some decisions were close calls");
  const kinds = new Set(game.asked.map((d) => d.kind === "priority" ? "priority" : String(d.id).split(":")[0]));
  ok([...kinds].every((k) => ["priority", "declare-attackers", "mulligan"].includes(k)), `only spells to cast, attacks and an opening hand are ever offered to it (${[...kinds].join(", ")})`);
  ok(kinds.has("priority") && kinds.has("declare-attackers"), "and both are: a close call over which spell to cast, and one over an attack, each reach the seat");
  const replay = await replayMatch({storage: game.storage, matchId: game.matchId, cards: tableCards});
  ok(replay.same && replay.tape > game.asked.length, `replayed from its seed and the tape (${replay.tape} entries, the seat's among them): the same game`);
}
{
  const game = await play({matchId: "agent-first", forSeat: (room, view) => ({indices: [0]})});
  ok(game.room.status === "finished", `answered by a stand-in that takes the first option every time, it finishes too (${game.asked.length} answers)`);
  const replay = await replayMatch({storage: game.storage, matchId: game.matchId, cards: tableCards});
  ok(replay.same, "and the replay, reading the stand-in's answers off the tape, is the same game: nobody is asked again");
}

/* ---- The close calls, read off the pilot ---- */
{
  const FACTS = {A: {manaValue: 2, types: ["Creature"]}, B: {manaValue: 2, types: ["Creature"]}, C: {manaValue: 4, types: ["Creature"]}, D: {manaValue: 6, types: ["Creature"]}};
  const pilot = agentPilot({seat: 1, cards: (name) => FACTS[name] ?? null});
  const view = (phase, turnPlayerId) => ({viewerSeatId: 1, turn: 3, turnPlayerId, phase, stackSize: 0, combat: null,
    players: [0, 1].map((i) => ({playerId: i, life: 40, health: {status: "active"}, mana: [], zones: {Battlefield: {cards: []}, Hand: {cards: []}, Library: {count: 60, cards: []}}}))});
  const cast = (id, label) => ({kind: "cast", objectId: id, label, tax: 0});
  const mana = (n) => Array.from({length: n}, (_, i) => ({kind: "activate-mana", objectId: 90 + i}));
  const two = [cast(1, "A"), cast(2, "B"), ...mana(2), {kind: "pass"}];
  eq(pilot.consult(view("MAIN1", 1), {actions: two}), true, "two spells of two, and mana for one of them: a close call, offered to the seat");
  eq(pilot.consult(view("MAIN1", 0), {actions: two}), false, "never on another player's turn");
  eq(pilot.consult(view("MAIN1", 1), {actions: [cast(1, "A"), cast(3, "C"), ...mana(4), {kind: "pass"}]}), true, "a 4 against a 2 with four mana is within three points: the model is asked");
  eq(pilot.consult(view("MAIN1", 1), {actions: [cast(1, "A"), cast(4, "D"), ...mana(6), {kind: "pass"}]}), false, "a 6 against a 2 with six mana is no close call: Hard casts the 6");
  eq(pilot.consult(view("MAIN1", 1), {actions: [cast(1, "A"), ...mana(2), {kind: "pass"}]}), false, "nor is one spell, a pass beside it not counted as a second");
  /* An attack whose every plan comes to nothing -- a 1/1 into an untapped 0/4 -- is a close call too: attacking or not
     scores the same. A 5/5 into an empty board is not: it attacks. */
  const card = (cardId, controller, power, toughness, tapped = false) => ({cardId, name: `C${cardId}`, controller, owner: controller, types: ["Creature"], power, toughness, keywords: [], damage: 0, tapped});
  const board = (mine, theirs) => {const v = view("COMBAT_DECLARE_ATTACKERS", 1); v.players[1].zones.Battlefield.cards = mine; v.players[0].zones.Battlefield.cards = theirs; return v;};
  const attack = (ids) => ({id: "declare-attackers:3", mode: "many", min: 0, max: ids.length, exclusiveBy: "cardId", options: ids.map((cardId, index) => ({index, cardId, defenderId: 0}))});
  eq(pilot.consult(board([card(11, 1, 1, 1)], [card(21, 0, 0, 4)]), {choice: attack([11])}), true, "a 1/1 into an untapped 0/4: attacking or not, nothing comes of it, a close call");
  eq(pilot.consult(board([card(11, 1, 5, 5)], []), {choice: attack([11])}), true, "a 5/5 into an empty board is asked about too: attacking or holding it back, the swing back is the model's to weigh");
  eq(pilot.consult(board([card(11, 1, 5, 5)], []).players.map((p) => p) && (() => {const v = board([card(11, 1, 5, 5)], []); v.players[0].life = 4; return v;})(), {choice: attack([11])}), false, "but a kill (the 5/5 at a seat on 4 life, nothing to block) is not a question");
  /* Holding back is one plan, however many opponents: a 2/2 facing an untapped 3/3 on each of two opponents' sides is
     no close call -- it stays home -- though "stay home" is weighed against each of them. */
  const three = view("COMBAT_DECLARE_ATTACKERS", 1);
  three.players.push({playerId: 2, life: 40, health: {status: "active"}, mana: [], zones: {Battlefield: {cards: [card(22, 2, 3, 3)]}, Hand: {cards: []}, Library: {count: 60, cards: []}}});
  three.players[1].zones.Battlefield.cards = [card(12, 1, 2, 2)];
  three.players[0].zones.Battlefield.cards = [card(21, 0, 3, 3)];
  const both = {id: "declare-attackers:3", mode: "many", min: 0, max: 1, exclusiveBy: "cardId", options: [{index: 0, cardId: 12, defenderId: 0}, {index: 1, cardId: 12, defenderId: 2}]};
  eq(pilot.consult(three, {choice: both}), false, "a 2/2 into a 3/3 on either side, at three players, is no close call: staying home counts once");
  eq(CLOSE, 3, "a close call: two plans within three points of each other, Hard's plans being worth a few points each");
}

/* ---- 3. Reopened while it waits ---- */
{
  const game = await play({matchId: "agent-reopen", forSeat: (room) => room.houseAnswer("claude"), reopenAt: 2});
  ok(game.reopened && game.reopened.waiting === "claude" && game.reopened.same, "a room reopened while the seat is asked is still waiting on it, with the same question");
  ok(game.room.status === "finished", "and answered after, the game goes on to its end");
}

/* ---- What the model may answer (game/room/agent-brief.mjs pickOf) ---- */
{
  const {pickOf} = await import("../game/room/agent-brief.mjs");
  const one = {mode: "one", min: 1, max: 1, options: [{index: 0}, {index: 1}, {index: 2}]};
  const many = {mode: "many", min: 0, max: 2, exclusiveBy: "cardId", options: [{index: 0, cardId: 7}, {index: 1, cardId: 7}, {index: 2, cardId: 8}]};
  eq([pickOf(one, {indices: [2]}), pickOf(one, {indices: [3]}), pickOf(one, {indices: [0, 1]}), pickOf(one, {index: 1}), pickOf(one, {indices: ["1"]})],
    [[2], null, null, [1], null], "one of the decision's own options for \"one\": never an index it does not have, two, or a word");
  eq([pickOf(many, {indices: [0, 2]}), pickOf(many, {indices: [2, 2]}), pickOf(many, {indices: [0, 1]}), pickOf(many, {indices: [0, 1, 2]})],
    [[0, 2], null, null, null], "and for \"many\": never the same option twice, two of one card (exclusiveBy), or more than its max");
  const any = {mode: "many", min: 0, max: 3, options: [{index: 0}, {index: 1}, {index: 2}]};
  eq([pickOf(any, {indices: [1, 1]}), pickOf(any, {indices: [0, 1]})], [null, [0, 1]], "the same option twice is refused even where nothing else would refuse it");
}

/* ---- 4. houseAnswer, only for an AI seat being asked ---- */
{
  const room = await startRoom({storage: memoryStorage(), matchId: "agent-refuse", cards: tableCards, pod, seed: "agent-refuse-seed"});
  assert.throws(() => room.houseAnswer("rob"), (e) => e instanceof RoomError && e.status === 403);
  assert.throws(() => room.houseAnswer("nobody"), (e) => e instanceof RoomError && e.status === 403);
  checks += 2;
  if (room.waitingOn !== "claude") assert.throws(() => room.houseAnswer("claude"), (e) => e instanceof RoomError && e.status === 409);
  checks += 1;
}

console.log(`room-agent-seat: ${checks} checks passed — the LLM seat is offered only its close calls, its answers go on the tape, a replay asks no one, and a room reopened while it waits still waits on it.`);
