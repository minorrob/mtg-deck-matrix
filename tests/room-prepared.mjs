/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CH-55: the real Studious First-Year card's inset is a legal Sorcery copy offered with its source identity. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {compileScript} from "../game/engine/cards/index.mjs";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom, basicCards} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";
const real = JSON.parse(readFileSync(new URL("../game/engine/cards/s/studious-first-year-rampant-growth.json", import.meta.url), "utf8"));
const compiled = compileScript(real);
assert.deepEqual(compiled.problems, []);
let checks = 1;
const eq = (a, b, message) => {assert.deepEqual(a, b, message); checks++;};
const ok = (a, message) => {assert.ok(a, message); checks++;};
const name = real.identity.name;
const creatureName = name.split(" // ")[0];
const cards = n => n === name ? compiled.definition : n === "Commander" ? {types: ["Creature"], power: 1, toughness: 1, manaCost: "{9}"} : basicCards(n);
const storage = memoryStorage();
const room = await startRoom({storage, matchId: "prepared-room", cards, seed: "prepared-room", pod: {pooledTaps: true, preparedTaps: true,
  seats: ["rob", "maya"].map(seatId => ({seatId, name: seatId, pilot: "human", commander: ["Commander"], cards: Array.from({length: 99}, (_, i) => i % 2 ? "Forest" : name)}))}});
const view = () => room.view(room.waitingOn);
const act = (v, option) => room.act(v.seatId, {kind: "answer", actionId: randomUUID(), revision: v.revision, choiceId: v.decision.id, indices: [option.index]});
async function until(stop, policy = () => null) {
  for (let n = 0; n < 200; n++) {
    const v = view();
    if (stop(v)) return v;
    await act(v, policy(v) ?? v.decision.options.find(o => o.act === "pass") ?? v.decision.options[0]);
  }
  throw new Error("the prepared decision never arrived: " + JSON.stringify({seat:view().seatId, turn:view().state.turn, phase:view().state.phase, field:view().state.players[0].zones.Battlefield.cards.map(c=>[c.name,c.tapped]), hand:view().state.players[0].zones.Hand.cards.map(c=>c.name), options:view().decision.options.slice(0,12)}));
}
let v = await until(v => v.seatId === "rob" && v.state.players[0].zones.Battlefield.cards.filter(c => c.types.includes("Land")).length >= 3
  && v.decision.options.some(o => o.act === "cast" && o.label === creatureName), v => v.decision.options.find(o => o.act === "play-land"));
await act(v, v.decision.options.find(o => o.act === "cast" && o.label === creatureName));
v = await until(v => v.seatId === "rob" && v.decision.kind === "priority" && !v.state.stack.length && v.state.players[0].zones.Battlefield.cards.some(c => c.prepared));
const source = v.state.players[0].zones.Battlefield.cards.find(c => c.prepared);
const copy = v.state.players[0].zones.Exile.cards.find(c => c.name === "Rampant Growth");
ok(copy, "the real entering creature creates its Rampant Growth copy in exile");
eq(copy.types, ["Sorcery"], "the copy has its inset's Sorcery type, never the creature's permanent type");
eq(source.preparedSpell, {cardId: copy.cardId, name: "Rampant Growth", manaCost: "{1}{G}"}, "the permanent projects its inset spell identity and cost");
let cast = v.decision.options.find(o => o.act === "cast" && o.cardId === copy.cardId);
ok(cast, "its controller is offered to cast the copy using available mana");
eq(cast.preparedFrom, source.cardId, "the option links back to the creature whose menu must show it");
await act(v, v.decision.options.find(o => o.act === "pass"));
v = await until(v => v.seatId === "rob" && v.decision.kind === "priority" && v.state.phase === "COMBAT_BEGIN");
ok(!v.decision.options.some(o => o.cardId === copy.cardId && o.act === "cast"), "a prepared Sorcery cannot be cast in combat");
v = await until(v => v.seatId === "rob" && v.decision.kind === "priority" && v.state.phase === "MAIN2");
cast = v.decision.options.find(o => o.act === "cast" && o.cardId === copy.cardId);
ok(cast, "its controller may wait until the next legal sorcery window");
await act(v, cast);
v = view();
eq(v.state.stack.at(-1).name, "Rampant Growth", "the inset is announced as Rampant Growth, not the creature");
ok(!v.state.players[0].zones.Battlefield.cards.find(c => c.cardId === source.cardId).prepared, "casting the copy unprepares its creature");
v = await until(v => v.decision.title.includes("Search") || v.decision.options.some(o => o.label === "Forest"));
await act(v, v.decision.options.find(o => o.label === "Forest") ?? v.decision.options[0]);
v = view();
ok(!v.state.players[0].zones.Battlefield.cards.some(c => c.name === "Rampant Growth"), "the Sorcery copy never resolves as a permanent");
ok(!v.state.players[0].zones.Exile.cards.some(c => c.cardId === copy.cardId), "the consumed inset is not offered for a second cast");
ok((await replayMatch({storage, matchId: "prepared-room", cards})).same, "the new match's prepared cast and shuffle replay identically");
console.log(`room-prepared: ${checks} checks passed`);
