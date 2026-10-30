/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* ROB-326 through the room, as the board sees it (CrankRoomView@1): Tezzeret's Gambit, {3}{U/P}, with three untapped lands.
 *
 * The room is the seam the board reads (docs/ui-lane/gameplay-anchor.md): the cast is among the player's options with three
 * Wastes and no blue, and the question that follows (once there is blue) lists "2 life" for the {U/P} beside the {U} way, in
 * the same shape as the pool's payment question -- `payment: {mana, life}` on each option and a decision path ending in it. A
 * match launched without the key (`phyrexianTaps`) offers what it offered before: not the cast.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom, basicCards} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {readFileSync} from "node:fs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

const real = JSON.parse(readFileSync(new URL("../game/engine/cards/t/tezzerets-gambit.json", import.meta.url), "utf8"));
const compiled = compileScript(real);
eq(compiled.problems, [], "the card's script compiles clean");
const GAMBIT = "Tezzeret's Gambit";
const cards = (n) => n === GAMBIT ? compiled.definition : n === "Commander" ? {types: ["Creature"], power: 1, toughness: 1, manaCost: "{9}"} : basicCards(n);

/* Rob's deck: the card and one land type, so the hand and the draws are never in doubt; Maya's is plain. */
async function table(matchId, land, pod) {
  const storage = memoryStorage();
  const room = await startRoom({storage, matchId, cards, seed: matchId, pod: {pooledTaps: true, xTaps: true, ...pod,
    seats: [{seatId: "rob", land}, {seatId: "maya", land: "Forest"}].map(({seatId, land: l}) => ({seatId, name: seatId, pilot: "human", commander: ["Commander"],
      cards: Array.from({length: 99}, (_, i) => (seatId === "rob" && i % 2 === 0 ? GAMBIT : l === "mixed" ? (i % 4 === 1 ? "Wastes" : "Island") : l))}))}});
  return {room, storage};
}
const view = (room) => room.view(room.waitingOn);
const act = (room, v, option) => room.act(v.seatId, {kind: "answer", actionId: randomUUID(), revision: v.revision, choiceId: v.decision.id, indices: [option.index]});
const lands = (v) => v.state.players[0].zones.Battlefield.cards.filter((c) => c.types.includes("Land"));
/* Play lands and pass until Rob has `n` lands and is at priority in his main phase with nothing on the stack. */
async function until(room, stop) {
  for (let n = 0; n < 400; n += 1) {
    const v = view(room);
    if (stop(v)) return v;
    await act(room, v, v.decision.options.find((o) => o.act === "play-land" && v.seatId === "rob") ?? v.decision.options.find((o) => o.act === "pass") ?? v.decision.options[0]);
  }
  throw new Error("never reached: " + JSON.stringify({seat: view(room).seatId, turn: view(room).state.turn, phase: view(room).state.phase}));
}
const ready = (v) => v.seatId === "rob" && v.decision.kind === "priority" && lands(v).length >= 3 && lands(v).every((c) => !c.tapped)
  && v.decision.options.some((o) => o.act === "cast" && o.label === GAMBIT);

{
  /* Three untapped Wastes, no blue. */
  const {room, storage} = await table("phyrexian-room-wastes", "Wastes", {phyrexianTaps: true});
  let v = await until(room, ready);
  const cast = v.decision.options.find((o) => o.act === "cast" && o.label === GAMBIT);
  ok(cast, "with three untapped Wastes and no blue, Tezzeret's Gambit is among the options");
  const life = v.state.players[0].life;
  await act(room, v, cast);
  v = view(room);
  eq([v.state.stack.at(-1)?.name, v.state.players[0].life, lands(v).filter((c) => c.tapped).length], [GAMBIT, life - 2, 3], "taken: on the stack, 2 life paid, the three Wastes tapped; the one way there is, so no question");
  ok((await replayMatch({storage, matchId: "phyrexian-room-wastes", cards})).same, "and the match replays identically");
}
{
  /* A match launched without the key: not offered, as before. */
  const {room} = await table("phyrexian-room-old", "Wastes", {});
  let offered = false;
  for (let n = 0; n < 400 && !offered; n += 1) {
    const v = view(room);
    if (v.seatId === "rob" && v.decision.kind === "priority" && lands(v).length >= 3 && lands(v).every((c) => !c.tapped)) {
      offered = v.decision.options.some((o) => o.act === "cast" && o.label === GAMBIT);
      eq(offered, false, "a match launched without the key: three untapped Wastes, and the cast is not offered (the defect, kept for old matches)");
      break;
    }
    await act(room, v, v.decision.options.find((o) => o.act === "play-land" && v.seatId === "rob") ?? v.decision.options.find((o) => o.act === "pass") ?? v.decision.options[0]);
  }
}
{
  /* Blue available: the question, as the board reads it. */
  const {room} = await table("phyrexian-room-blue", "mixed", {phyrexianTaps: true});
  let v = await until(room, (x) => ready(x) && lands(x).some((c) => c.name === "Island") && lands(x).filter((c) => c.name === "Wastes").length >= 3);
  await act(room, v, v.decision.options.find((o) => o.act === "cast" && o.label === GAMBIT));
  v = view(room);
  eq(v.decision.title, `${GAMBIT}: what to tap for it`, "with an Island among the lands, the cast asks what pays for it");
  eq(v.decision.options.map((o) => [o.label, o.payment.life, o.decisionPath.at(-1).label]),
    [["Island, Wastes, Wastes, Wastes", 0, "{U}{C}{C}{C}"], ["Wastes, Wastes, Wastes and 2 life", 2, "{C}{C}{C} and 2 life"], ["Wastes, Wastes, Island and 2 life", 2, "{U}{C}{C} and 2 life"]],
    "the {U} way, and 2 life for the {U/P}: each option's payment carries the life, and its path ends in it, as the pool's question does");
  const life = v.state.players[0].life;
  await act(room, v, v.decision.options[1]);
  v = view(room);
  eq([v.state.stack.at(-1)?.name, v.state.players[0].life, lands(v).filter((c) => c.tapped).map((c) => c.name)], [GAMBIT, life - 2, ["Wastes", "Wastes", "Wastes"]],
    "2 life chosen: three Wastes tapped, the Island kept, 2 life paid");
}
console.log(`room-phyrexian-payment: ${checks} checks passed`);
