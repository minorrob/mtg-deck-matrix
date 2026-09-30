/* THE TABLE'S TWO BEATS (B5; docs/plan-to-done-2026-09-30.md, items 11 and 13; game/room/room.mjs, and the engine's
 * held draw in game/engine/rules/turn.mjs).
 *
 *   Draw     a pod that asks for `drawBeat` holds the draw step's draw: the active person is asked Draw a card, the
 *            one thing to do, their hand unchanged until they answer; the answer draws the card and priority
 *            follows in the draw step. The two-player first draw is still skipped (CR 103.8a). An AI seat draws for
 *            itself. Without the flag the draw happens at once, as before, and the state carries no new key.
 *   Empty    a pod that asks for `passEmpty` never asks a person whose only legal action is to pass with the stack
 *            empty; a step that passes by itself says so in the history, a turn's quiet steps in a row sharing one
 *            line ("Upkeep, Draw step: nothing to do"). Without the flag the room asks as before.
 *   Replay   a game with both beats replays from its seed and tape to the same game.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage} from "../game/engine/storage.mjs";
import {createState} from "../game/engine/state/index.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {startRoom, basicCards} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

/* Decks of Forests and vanilla creatures, each seat's creatures named its own. */
const DEFS = new Map();
const cards = (name) => DEFS.get(name) ?? basicCards(name);
function deck(seat, {creatures = true} = {}) {
  const list = Array.from({length: 40}, () => "Forest");
  if (creatures) for (let i = 0; i < 40; i += 1) {const name = `Bear ${seat}-${i}`; DEFS.set(name, {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}"}); list.push(name);}
  const general = `General ${seat}`;
  DEFS.set(general, {types: ["Creature"], power: 3, toughness: 3, manaCost: "{2}{G}"});
  return {commander: [general], cards: list};
}
const seats = (opts) => [{seatId: "rob", name: "Rob", pilot: "human", ...deck(0, opts)}, {seatId: "maya", name: "Maya", pilot: "human", ...deck(1, opts)}];
const hand = (view, seat) => view.state.players[seat].zones.Hand.count;
const library = (view, seat) => view.state.players[seat].zones.Library.count;

/* Answer whatever is asked: Keep, Draw a card, and otherwise pass; `hook` sees each decision first. */
async function walk(room, {turns, hook, pick} = {}) {
  let n = 0;
  for (;;) {
    const who = room.waitingOn;
    if (!who) break;
    const view = room.view(who);
    if (view.state.turn > turns) break;
    await hook?.(view);
    const d = view.decision;
    const index = pick ? pick(d, view) : d.kind === "priority" ? d.options.find((o) => o.act === "pass").index : 0;
    await room.act(who, {actionId: randomUUID(), revision: view.revision, kind: "answer", choiceId: d.id, indices: d.mode === "many" ? d.options.slice(0, d.min).map((o) => o.index) : [index]});
    n += 1;
    if (n > 2000) throw new Error("the walk did not end");
  }
  return n;
}

/* 1. THE ENGINE: the key only when asked; the held draw; its one answer. */
{
  const plain = createState({matchId: "x", seed: "s", players: [{name: "A"}, {name: "B"}]});
  const held = createState({matchId: "x", seed: "s", players: [{name: "A"}, {name: "B"}], drawBeat: true});
  ok(!("drawBeat" in plain) && held.drawBeat === true, "the engine's state carries drawBeat only when a pod asks for it, so an older game's state is unchanged");
  ok(hashState(plain) !== hashState(held), "and a game that asks for it is a different game to the hash");
}

/* 2. THE DRAW AS ITS OWN BEAT, without passEmpty: the room still asks in every step, as before. */
{
  const storage = memoryStorage();
  const room = await startRoom({storage, matchId: "beat1", cards, seed: "beat-seed-1", pod: {seats: seats(), drawBeat: true}});
  const draws = [], firstPriority = [];
  let before = null;
  await walk(room, {turns: 4, hook: (view) => {
    const d = view.decision;
    if (d.kind === "priority" && view.state.turn === 1 && !firstPriority.length) firstPriority.push(view.state.phase);
    if (d.kind === "draw") {before = {turn: view.state.turn, seat: view.seat, hand: hand(view, view.seat), library: library(view, view.seat), phase: view.state.phase, options: d.options.map((o) => o.label), title: d.title, active: view.state.turnPlayerId};}
    else if (before && before.seat === view.seat && view.state.turn === before.turn) {
      draws.push({...before, after: {hand: hand(view, view.seat), library: library(view, view.seat), phase: view.state.phase, kind: d.kind}});
      before = null;
    }
  }});
  eq(firstPriority, ["UPKEEP"], "without passEmpty the room asks as it did: the first priority of turn 1 is the upkeep's");
  ok(!draws.some((x) => x.turn === 1), "turn 1 of a two-player game asks no one to draw: the first player skips that draw (CR 103.8a)");
  ok(draws.length >= 3 && draws.every((x) => x.phase === "DRAW" && x.seat === x.active && x.title === "Draw a card" && x.options.join() === "Draw a card"),
    `in each later draw step the active person is asked one thing, Draw a card (${draws.map((x) => `turn ${x.turn}`).join(", ")})`);
  ok(draws.every((x) => x.after.hand === x.hand + 1 && x.after.library === x.library - 1 && x.after.phase === "DRAW" && x.after.kind === "priority"),
    "their hand waits for the click; the click draws one card from the library, and priority follows in the draw step");
}

/* 3. A STEP WITH NOTHING TO DO PASSES ITSELF, and the draw beat with it. Lands only: after the land drop, nothing. */
{
  const storage = memoryStorage();
  const room = await startRoom({storage, matchId: "beat2", cards, seed: "beat-seed-2", pod: {seats: seats({creatures: false}), drawBeat: true, passEmpty: true}});
  const asked = [];
  /* each person plays a land when they can, and passes otherwise */
  const land = (d) => d.kind === "priority" ? (d.options.find((o) => o.act === "play-land") || d.options.find((o) => o.act === "pass")).index : 0;
  await walk(room, {turns: 4, pick: land, hook: (view) => {if (view.decision.kind === "priority") asked.push({phase: view.state.phase, turn: view.state.turn, acts: view.decision.options.map((o) => o.act), stack: view.state.stack.length});}});
  ok(asked.length > 0 && asked.every((a) => a.stack > 0 || a.acts.some((x) => x !== "pass" && x !== "activate-mana")),
    `a person is asked for priority only when there is something to do (${asked.length} times, in ${[...new Set(asked.map((a) => a.phase))].join(", ")})`);
  ok(asked.every((a) => a.phase === "MAIN1" || a.phase === "MAIN2"), "with lands alone that is only a main phase with the land drop unused");
  const lines = room.history.filter((l) => l.mark === "quiet");
  ok(room.history.some((l) => l.turn === 1 && l.mark === "quiet" && l.text === "Upkeep, Draw step: nothing to do"),
    `the first turn's empty upkeep and skipped draw say so in the history, in one line (${lines.filter((l) => l.turn === 1).map((l) => l.text).join(" | ")})`);
  ok(lines.some((l) => l.turn === 1 && l.text === "Beginning of combat, Declare attackers, End of combat, Main 2, End step: nothing to do"), `and the quiet steps after the land drop, in one line of their own (${lines.filter((l) => l.turn === 1).map((l) => l.text).join(" | ")})`);
  ok(!lines.some((l) => /^Draw step/.test(l.text) && l.turn > 1), "a draw step where someone drew is not called empty");

  /* 4. The same game replays from its seed and tape. */
  const proof = await replayMatch({storage, matchId: "beat2", cards});
  ok(proof.same && proof.tape > 0, `a game with both beats replays from its seed and tape to the same game (${proof.tape} tape entries)`);
}

/* 4b. MANA IS SOMETHING TO DO WHILE A SPELL COULD USE IT: with lands out and a creature in hand, a person is asked in
   the main phase, taps, and casts -- the room never passes it away for them. */
{
  const storage = memoryStorage();
  const room = await startRoom({storage, matchId: "beat5", cards, seed: "beat-seed-5", pod: {seats: seats(), drawBeat: true, passEmpty: true}});
  const tapThenCast = (d) => d.kind !== "priority" ? 0 : (d.options.find((o) => o.act === "cast") || d.options.find((o) => o.act === "play-land") || d.options.find((o) => o.act === "activate-mana") || d.options.find((o) => o.act === "pass")).index;
  let tappedAsked = 0;
  await walk(room, {turns: 6, pick: tapThenCast, hook: (view) => {const d = view.decision; if (d.kind === "priority" && !d.options.some((o) => o.act === "play-land" || o.act === "cast") && d.options.some((o) => o.act === "activate-mana")) tappedAsked += 1;}});
  const cast = room.history.filter((l) => /^(Rob|Maya) cast Bear/.test(l.text));
  ok(cast.length >= 2 && tappedAsked > 0, `with a creature it could pay for, a person is asked while only its mana is on offer, and casts (${cast.map((l) => l.text).join(", ")})`);
}

/* 5. With creatures, both beats and random answers: a longer game, replayed. */
{
  const storage = memoryStorage(), pilot = randomLegalPilot(createRng("people"));
  const room = await startRoom({storage, matchId: "beat3", cards, seed: "beat-seed-3", pod: {seats: seats(), drawBeat: true, passEmpty: true}});
  const n = await walk(room, {turns: 8, pick: (d) => (pilot.answer(d).indices || [0])[0]});
  const proof = await replayMatch({storage, matchId: "beat3", cards});
  ok(n > 20 && proof.same, `${n} random answers over eight turns, and the game replays to the same (${proof.tape} tape entries)`);
}

/* 6. An AI seat draws for itself: no one is asked, and its library goes down by one each of its turns. */
{
  const storage = memoryStorage();
  const pod = {seats: [...seats(), {seatId: "ai", name: "House", pilot: "house", ...deck(2)}], drawBeat: true, passEmpty: true};
  const room = await startRoom({storage, matchId: "beat4", cards, seed: "beat-seed-4", pod});
  const lib = new Map(), turnOf = new Map();
  let askedForAi = 0;
  await walk(room, {turns: 7, hook: (view) => {
    if (!lib.has(view.state.turn)) {lib.set(view.state.turn, library(view, 2)); turnOf.set(view.state.turn, view.state.turnPlayerId);}
    if (view.decision.kind === "draw" && view.state.turnPlayerId === 2) askedForAi += 1;
  }});
  eq(askedForAi, 0, "no person is ever asked to draw for the AI");
  /* Rob's turns are three apart, and the AI has exactly one turn between two of them. */
  const robTurns = [...turnOf].filter(([t, p]) => p === 0 && lib.has(t + 3) && turnOf.get(t + 3) === 0).map(([t]) => t);
  ok(robTurns.length >= 2 && robTurns.every((t) => lib.get(t) - lib.get(t + 3) === 1), `the AI drew for itself, one card in each of its turns (${robTurns.map((t) => `turn ${t} → ${t + 3}: ${lib.get(t)} → ${lib.get(t + 3)}`).join(", ")})`);
}

console.log(`room-beats: ${checks} checks passed — the draw waits for its click and priority follows, a step with nothing to do passes itself and says so, and a game with both replays to the same.`);
