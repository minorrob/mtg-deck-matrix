/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ROB-343: a person plays the land face of a modal double-faced card and the table goes on.
 *
 * Found by the ROB-205 audit: on the wave-0 integration (PR #912), with a person in the seat, playing Fell the Profane //
 * Fell Mire as the land threw "saveCheckpoint: the state would not read back as the game it is", and the table could not
 * continue. The game waits on "pay 3 life?" with a checkpoint to save, which is exactly where a house AI seat never stops
 * (it answers in the same step). On main this room test passes without the fix, because the card has moved by then; it
 * guards the window for the day the integration lands. Actual saved card, actual room, both answers, a reload at the
 * question, and exact replay of the tape. tests/engine-mdfc-face-state.mjs holds the state-level cause, red on main too,
 * for every saved modal double-faced card.
 */
import assert from "node:assert/strict";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {startRoom, openRoom, basicCards} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";

let checks = 0, serial = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const FELL = "Fell the Profane // Fell Mire", MIRE = "Fell Mire";
const index = loadCardIndex(), cards = (n) => index.definition(n) ?? basicCards(n);
const request = (v, a) => ({kind: "answer", actionId: `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`, revision: v.revision, choiceId: v.decision.id, ...a});

async function tableAtTheLandFace(matchId, storage) {
  const room = await startRoom({storage, cards, matchId, seed: "mdfc-land", pod: {passEmpty: true, seats: [
    {seatId: "p0", name: "Rob", pilot: "human", commander: [], cards: Array.from({length: 60}, (_, n) => n % 3 === 0 ? FELL : "Swamp")},
    {seatId: "p1", name: "Maya", pilot: "human", commander: [], cards: Array.from({length: 60}, () => "Forest")}]}});
  for (let n = 0; n < 80; n += 1) {
    const view = room.view(room.waitingOn);
    const land = view.seatId === "p0" && view.decision.options.find((o) => o.act === "play-land" && o.label === MIRE);
    if (land) return {room, view, land};
    const option = view.decision.options.find((o) => /keep/i.test(o.label)) ?? view.decision.options.find((o) => o.act === "pass") ?? view.decision.options[0];
    await room.act(view.seatId, request(view, {indices: [option.index]}));
  }
  throw new Error("the table never offered Rob the land face");
}

const mire = (view) => view.state.players[0].zones.Battlefield.cards.find((c) => c.name === MIRE);

for (const [answer, life, tapped] of [[/^Pay 3 life/, 37, false], [/^Don't pay/, 40, true]]) {
  const storage = memoryStorage(), matchId = `mdfc-land-${tapped ? "decline" : "pay"}`, store = createMatchStore(storage, matchId);
  let {room, view, land} = await tableAtTheLandFace(matchId, storage);
  eq(view.state.players[0].health.life, 40, "Rob starts the play at 40 life with the card in his hand");

  /* The play itself: a person's seat, the land face, the game waiting on how it enters. */
  await assert.doesNotReject(() => room.act("p0", request(view, {indices: [land.index]})));
  checks += 1;
  view = room.view(room.waitingOn);
  eq([view.seatId, view.decision.title], ["p0", "Fell Mire: pay 3 life?"], "playing the land face asks Rob how it enters, and the table did not end");
  eq(view.decision.options.map((o) => o.label), ["Pay 3 life: Fell Mire enters untapped", "Don't pay: Fell Mire enters tapped"], "pay 3 life, or it enters tapped");
  eq(room.view("p1").decision, null, "the other seat is shown nothing of Rob's question");
  ok((await store.latestCheckpoint()).state.objects, "the table saved its checkpoint at the question");

  /* A room woken from storage at the question asks the same question. */
  const asked = view.decision.id;
  room = await openRoom({storage, cards, matchId});
  view = room.view(room.waitingOn);
  eq([view.seatId, view.decision.id], ["p0", asked], "a table reloaded at the question asks the same question of the same seat");

  const option = view.decision.options.find((o) => answer.test(o.label));
  await room.act("p0", request(view, {indices: [option.index]}));
  view = room.view("p0");
  eq([view.state.players[0].health.life, Boolean(mire(view)?.tapped)], [life, tapped], `${option.label}: Rob has ${life} life and Fell Mire is ${tapped ? "tapped" : "untapped"}`);
  ok(!view.state.players[0].zones.Hand.cards.some((c) => c.id === land.cardId), "the card left the hand when it entered");
  ok((await replayMatch({storage, cards, matchId})).same, "the tape of that play, question and answer replays to the same game");
}

console.log(`room-mdfc-land-play: ${checks} checks; a person plays Fell Mire's land face, answers pay or decline, reloads at the question, and the table goes on`);
