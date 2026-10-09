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
 *   Went by  one person and three AI seats, lands only (Rob, 2026-10-01: "I was just able to continuously draw cards
 *            and play a land after every draw"): the person is asked Draw a card once in each of their turns, four
 *            turns apart, and after one land in a turn no other is offered (CR 504.1, 305.2); the three AI turns
 *            between pass with no click of theirs, so the board's CrankBoard.turnsWentBy names them from the
 *            history -- each turn's line, its draw and its land -- and says nothing when no whole turn went by.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage} from "../game/engine/storage.mjs";
import {createState} from "../game/engine/state/index.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {startRoom, openRoom, basicCards, leastAnswer} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";
import vm from "node:vm";
import {readFileSync} from "node:fs";

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

/* 7. TURNS THAT WENT BY: Rob with three AI seats, every deck lands, both beats -- the playtest table as staging runs it. */
{
  const box = {};
  box.globalThis = box;
  vm.runInNewContext(readFileSync(new URL("../crankmagic-board.js", import.meta.url), "utf8"), box);
  /* Through JSON: the script runs in its own realm, whose arrays are not this one's to deepEqual. */
  const turnsWentBy = (was, next) => JSON.parse(JSON.stringify(box.CrankBoard.turnsWentBy(was, next)));
  /* The Basic lands test deck's shape (crankmagic-table.js, TEST_DECK): Wastes as its commander, the one exception to
     "a commander is a legendary creature" (CR 903.3), offered only on a playtest table while the engine plays basics. */
  const lands = () => ({commander: ["Wastes"], cards: Array.from({length: 99}, (_, i) => ["Forest", "Island", "Swamp"][i % 3])});
  const pod = {seats: [{seatId: "rob", name: "Rob", pilot: "human", ...lands()}, ...["Ada", "Bo", "Cy"].map((name) => ({seatId: name.toLowerCase(), name, pilot: "house", ...lands()}))],
    drawBeat: true, passEmpty: true};
  const room = await startRoom({storage: memoryStorage(), matchId: "went", cards, seed: "went-seed", pod});
  const draws = [], seen = [], askedIn = new Map();
  let landTurn = null;
  await walk(room, {turns: 13, hook: (view) => {
    seen.push(view);
    if (view.decision.kind === "draw") draws.push({turn: view.state.turn, hand: hand(view, 0)});
    const kinds = askedIn.get(view.state.turn) || [];
    askedIn.set(view.state.turn, [...kinds, view.decision.kind === "priority" ? `priority${view.decision.options.some((o) => o.act === "play-land") ? "+land" : ""}` : view.decision.kind]);
  }, pick: (d, view) => {
    if (d.kind !== "priority") return 0;
    const land = d.options.find((o) => o.act === "play-land");
    if (land && landTurn !== view.state.turn) {landTurn = view.state.turn; return land.index;}
    return d.options.find((o) => o.act === "pass").index;
  }});
  eq(draws.map((x) => x.turn), [1, 5, 9, 13], "Rob is asked Draw a card once in each of his turns, four turns apart: in a four-player game the first player draws too (CR 103.8c)");
  eq([5, 9].map((t) => askedIn.get(t)), [["draw", "priority+land"], ["draw", "priority+land"]],
    "in each of his turns he is asked twice: Draw a card, then priority with his lands; after one land nothing more is offered (CR 305.2), so the rest of the turn passes by itself");
  const playedIn = (t) => room.history.filter((l) => l.turn === t && /^Rob played /.test(l.text)).length;
  eq([1, 5, 9].map(playedIn), [1, 1, 1], "the history has one land played by Rob in each of his turns");
  const asked = seen.filter((v) => v.seat === 0);
  const before = asked.filter((v) => v.state.turn === 5 && v.decision.kind === "priority").pop(), after = asked.find((v) => v.state.turn === 9);
  const went = turnsWentBy(before, after);
  eq([went.from, went.to, went.now, went.turns.map((t) => t.head)], [6, 8, 9, ["Turn 6 · Ada", "Turn 7 · Bo", "Turn 8 · Cy"]],
    "from his land in turn 5 to his draw in turn 9, the board is told turns 6 to 8 went by, each by its player's name");
  ok(went.turns.every((t, i) => t.lines.length === 2 && t.lines[0] === `${["Ada", "Bo", "Cy"][i]} drew a card` && /^(Ada|Bo|Cy) played (Forest|Island|Swamp)$/.test(t.lines[1])),
    `and what each held: a draw and a land, the steps that passed by themselves left out (${went.turns.map((t) => t.lines.join(", ")).join(" / ")})`);
  const next = asked.filter((v) => v.state.turn === 9);
  eq([turnsWentBy(next[0], next[1]), turnsWentBy(null, after), turnsWentBy(before, {...after, matchId: "another"})], [null, null, null],
    "nothing when no whole turn went by, when there was no earlier view, or across two games");
  eq(turnsWentBy({matchId: "m", state: {turn: 3}}, {matchId: "m", state: {turn: 5}, history: []}).turns, [{turn: 4, head: "Turn 4", lines: []}], "a turn the history no longer holds is still named");
}

/* 8. THE CAST THAT PASSES (Rob, 2026-10-09: "When I play a card to the board from my hand, I don't want to have to click a
   pop-up to resolve it"; `passAfterCast`). Each person casts a Bear whenever one is offered, plays a land otherwise, and
   passes when nothing else is. */
{
  const mixed = (seat) => {const d = deck(seat); return {...d, cards: d.cards.map((c, i) => (c === "Forest" && i % 3 === 0 ? "Island" : c))};};
  const pod = (beats) => ({seats: [{seatId: "rob", name: "Rob", pilot: "human", ...mixed(0)}, {seatId: "maya", name: "Maya", pilot: "human", ...mixed(1)}], passEmpty: true, ...beats});
  async function castGame(matchId, beats, {hold = false} = {}) {
    const storage = memoryStorage();
    let room = await startRoom({storage, matchId, cards, seed: `${matchId}-seed`, pod: pod(beats)});
    const seen = {ownOnTop: 0, theirsOnTop: 0, casts: 0};
    for (let n = 0; n < 3000; n += 1) {
      const who = room.waitingOn;
      if (!who) break;
      const view = room.view(who), d = view.decision;
      if (view.state.turn > 8) break;
      const top = view.state.stack[view.state.stack.length - 1];
      if (d.kind === "priority" && top) seen[top.playerId === view.seat ? "ownOnTop" : "theirsOnTop"] += 1;
      let answer;
      if (d.kind === "priority") {
        const cast = d.options.find((o) => o.act === "cast"), o = cast || d.options.find((x) => x.act === "play-land") || d.options.find((x) => x.act === "pass");
        if (o === cast) seen.casts += 1;
        answer = {indices: [o.index], ...(o === cast && hold ? {hold: true} : {})};
      } else answer = {indices: d.mode === "many" ? d.options.slice(0, d.min).map((o) => o.index) : [0]};
      await room.act(who, {actionId: randomUUID(), revision: view.revision, kind: "answer", choiceId: d.id, ...answer});
    }
    return {room, storage, seen, resolved: room.history.filter((l) => /^(Rob|Maya) cast /.test(l.text)).length};
  }
  const asBefore = await castGame("cast0", {});
  ok(asBefore.seen.casts >= 4 && asBefore.seen.ownOnTop >= asBefore.seen.casts, `without the beat, as before: each caster is asked again with their own spell on top, Resolve (${asBefore.seen.ownOnTop} times for ${asBefore.seen.casts} casts)`);
  const passing = await castGame("cast1", {passAfterCast: true});
  ok(passing.seen.casts >= 4, `with it, the people cast (${passing.seen.casts} casts)`);
  eq(passing.seen.ownOnTop, 0, "and no caster is asked again with their own spell on top: the cast passed for them");
  ok(passing.seen.theirsOnTop >= passing.seen.casts, `while the other person is still asked with it on the stack, and may respond (${passing.seen.theirsOnTop} times)`);
  ok(passing.room.history.some((l) => /^Rob cast Bear/.test(l.text)) && passing.room.history.some((l) => /^Maya cast Bear/.test(l.text)), "and the spells resolve");
  const held = await castGame("cast2", {passAfterCast: true}, {hold: true});
  ok(held.seen.casts >= 4 && held.seen.ownOnTop >= held.seen.casts, `a cast that holds priority (hold: true, the caster's choice, CR 117.3c) is asked again with its spell on top (${held.seen.ownOnTop} for ${held.seen.casts})`);
  /* A cast that asks before it is on the stack -- which creatures convoke it (CR 702.51a) -- with the room put away and
     woken at that question: the pass the cast makes is kept with the room, and made once the question is answered. */
  const ZERO = {"Zero Elf": {types: ["Creature"], subtypes: ["Elf"], power: 1, toughness: 1, manaCost: "{0}", colors: ["G"]},
    "Convoke Spell": {types: ["Sorcery"], manaCost: "{3}", colors: [], keywords: ["Convoke"], spell: {id: "s", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]}}};
  const zeroCards = (name) => ZERO[name] ?? basicCards(name);
  const storage = memoryStorage();
  let room = await startRoom({storage, matchId: "cast3", cards: zeroCards, seed: "cast3-seed", pod: {passEmpty: true, passAfterCast: true, seats: [
    {seatId: "rob", name: "Rob", pilot: "human", commander: [], cards: [...Array(40).fill("Zero Elf"), ...Array(20).fill("Convoke Spell")]},
    {seatId: "ai", name: "House", pilot: "house", commander: [], cards: Array(60).fill("Forest")}]}});
  let convoking = null, after = null;
  for (let i = 0; i < 400 && room.waitingOn === "rob" && !after; i += 1) {
    const view = room.view("rob"), d = view.decision;
    if (convoking) {after = view; break;}
    if (/tap creatures to convoke it/.test(d.title)) {
      room = await openRoom({storage, matchId: "cast3", cards: zeroCards});
      convoking = room.view("rob");
      await room.act("rob", {actionId: randomUUID(), revision: convoking.revision, kind: "answer", choiceId: convoking.decision.id, indices: convoking.decision.options.slice(0, 3).map((o) => o.index)});
      continue;
    }
    const elf = d.kind === "priority" && d.options.find((o) => o.label === "Zero Elf");
    const convoke = d.kind === "priority" && d.options.find((o) => o.label === "Convoke Spell" && /convoking/.test(o.detail || ""));
    const indices = d.kind !== "priority" ? leastAnswer(d).indices : [(elf || convoke || d.options.find((o) => o.act === "pass")).index];
    await room.act("rob", {actionId: randomUUID(), revision: view.revision, kind: "answer", choiceId: d.id, indices});
  }
  const top = after && after.state.stack[after.state.stack.length - 1];
  ok(convoking && after && !(top && top.name === "Convoke Spell" && top.playerId === 0) && room.history.some((l) => /^Rob cast Convoke Spell/.test(l.text)),
    `woken at the convoke question and answered, the cast passes: Rob is next asked with no Convoke Spell of his on top, and it resolved (${after ? `${after.decision.title}, stack ${after.state.stack.length}` : "never asked"})`);
  const woken = {room, storage, cards: zeroCards};
  for (const game of [passing, held, woken]) {
    const proof = await replayMatch({storage: game.storage, matchId: game.room.matchId, cards: game.cards || cards});
    ok(proof.same && proof.tape > 0, `${game.room.matchId}: replays from its seed and tape to the same game (${proof.tape} tape entries)`);
  }
}

console.log(`room-beats: ${checks} checks passed — the draw waits for its click and priority follows, a step with nothing to do passes itself and says so, a cast passes for its caster unless they hold priority, and each game replays to the same.`);
