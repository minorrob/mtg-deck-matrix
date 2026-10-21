/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ROB'S FULLSCREEN NOTES (Oct 21): three of the room's beats (game/room/room.mjs), each kept with the match, and a way of
 * playing.
 *
 *   1. `landAnyStep`: "When I am on any step of my turn, I should be able to play a land if I have not already played one."
 *      A person asked in their upkeep, draw step or combat is offered their land; one land a turn still; never on another
 *      player's turn; never with a spell on the stack; the AI seats play theirs in a main phase. A land is no reason to stop
 *      a step that has nothing else, so the steps still pass by themselves. Without the key, a main phase only, as before.
 *   2. `takeBackLand`: "Oh wait, no, I didn't mean to lay that land down." A land just played, nothing since, goes back to the
 *      hand, and the game is exactly as it was before it, to its hash -- the land drop offered again. Not once anything has
 *      happened since; not in a match launched before; kept on reopening; replayed, the same game.
 *   3. `askAimed`: "When AI does something to me, I should be able to resolve it." Another player's Bolt at a person, or at
 *      their creature, asks them before it resolves, though they hold no response; a Bolt at its caster does not; without
 *      the key, the stack is passed for them, as before.
 *   4. `askStack`, a person's way of playing ("Skip my priority if no response possible", turned off): asked whenever
 *      anything is on the stack; on the tape, so the game replays; the view says so.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {startRoom, openRoom, basicCards} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const BEAR = {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}", colors: ["G"]};
const BOLT = {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Bolt deals 3 damage to any target.",
  targets: [{anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]}], effects: [{effect: "dealDamage", amount: 3, targets: {target: 0}, who: {target: 0}}]}};
const GENERAL = {types: ["Creature"], power: 9, toughness: 9, manaCost: "{7}{G}{G}", colors: ["G"]};
const cards = (name) => (/^Bear /.test(name) ? BEAR : /^Bolt /.test(name) ? BOLT : name.startsWith("General") ? GENERAL : basicCards(name));
const deck = (seat, land, spell) => ({commander: [`General ${seat}`], cards: Array.from({length: 99}, (_, i) => (i % 2 ? land : `${spell} ${seat}-${i}`))});
const rob = () => ({seatId: "rob", name: "Rob", pilot: "human", ...deck(0, "Forest", "Bear")});
const maya = (pilot = "human") => ({seatId: "maya", name: "Maya", pilot, ...deck(1, "Mountain", "Bolt")});
/* The pod as the table launches it, with or without the new keys. */
const TABLE = {passEmpty: true, endWhenNoPerson: true, resolveAll: true, passAfterCast: true, endAsks: true, untapMana: true, pooledTaps: true, passStack: true, yieldTurn: true, blocksNone: true};
const NEW = {landAnyStep: true, takeBackLand: true, askAimed: true};
const pod = (more = NEW, mayaPilot = "human") => ({seats: [rob(), maya(mayaPilot)], ...TABLE, ...more});
const SEED = "lands-and-aims-1";

const ask = (room) => (room.waitingOn ? room.view(room.waitingOn) : null);
const act = (room, v, index) => room.act(v.seatId, {actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: v.decision.id, indices: [index]});
const option = (v, test) => (v.decision.options || []).find(test);
const pass = (v) => option(v, (o) => o.act === "pass").index;
const MAIN = new Set(["MAIN1", "MAIN2"]);
const hand = (v) => v.state.players[v.seat].zones.Hand.cards;
const field = (v) => v.state.players[v.seat].zones.Battlefield.cards;
/* Play on, each decision answered by `policy(v)` (an option index, or undefined to pass / take the first), until `stop(v)`. */
async function until(room, stop, policy = () => undefined, limit = 4000) {
  for (let n = 0; n < limit; n += 1) {
    const v = ask(room);
    if (!v) return null;
    if (stop(v)) return v;
    const chosen = policy(v);
    await act(room, v, chosen !== undefined ? chosen : v.decision.kind === "priority" ? pass(v) : 0);
  }
  throw new Error("the game did not get there");
}

/* ---- 1. A LAND IN ANY STEP OF YOUR OWN TURN ---- */
{
  /* Rob plays step by step (asked at every step of his own turn); Maya is an AI seat. */
  const offeredAt = async (more) => {
    const room = await startRoom({storage: memoryStorage(), matchId: "any-step", cards, pod: pod(more, "house"), seed: SEED});
    await until(room, (v) => v.seatId === "rob" && v.decision.kind === "priority");
    await room.prefer("rob", {stepByStep: true});
    const seen = new Map();
    await until(room, (v) => v.state.turn >= 8, (v) => {
      if (v.seatId !== "rob" || v.decision.kind !== "priority") return undefined;
      const land = option(v, (o) => o.act === "play-land");
      if (v.state.turnPlayerId === v.seat && !v.state.stack.length) seen.set(v.state.phase, (seen.get(v.state.phase) || false) || !!land);
      /* He holds his land as long as he may: to his end step with the key, to his second main phase without it. */
      if (land && (v.state.phase === "END_OF_TURN" || (!more.landAnyStep && v.state.phase === "MAIN2"))) return land.index;
      return undefined;
    });
    return {room, seen};
  };
  const on = await offeredAt(NEW), off = await offeredAt({});
  eq(["UPKEEP", "DRAW", "MAIN1", "COMBAT_BEGIN", "COMBAT_END", "MAIN2", "END_OF_TURN"].filter((p) => !on.seen.get(p)), [],
    "with the key, Rob is offered his land in every step of his own turn he is asked in: upkeep, draw step, combat, his end step");
  eq(["UPKEEP", "DRAW", "COMBAT_BEGIN", "COMBAT_END", "END_OF_TURN"].filter((p) => off.seen.get(p)), [], "without it, in none but a main phase, as before");
  ok(off.seen.get("MAIN1") && off.seen.get("MAIN2"), "and there, as ever");
  const history = on.room.view("rob").history.map((l) => l.text);
  ok(history.some((t) => /^Rob played Forest/.test(t)), "his lands were played");
}
{
  /* The journal says which step each land was played in: Rob's outside a main phase, Maya's (an AI seat) only in one. */
  const storage = memoryStorage();
  const room = await startRoom({storage, matchId: "any-step-journal", cards, pod: pod(NEW, "house"), seed: SEED});
  await until(room, (v) => v.seatId === "rob" && v.decision.kind === "priority");
  await room.prefer("rob", {stepByStep: true});
  let refusedTwice = null;
  await until(room, (v) => v.state.turn >= 10, (v) => {
    if (v.seatId !== "rob" || v.decision.kind !== "priority") return undefined;
    const land = option(v, (o) => o.act === "play-land");
    if (land && v.state.phase === "UPKEEP") return land.index;
    /* The same turn, after his upkeep's land: no land offered in any later step. */
    if (v.state.turnPlayerId === v.seat && v.state.phase !== "UPKEEP" && v.state.players[v.seat].landsPlayed && land) refusedTwice = v.state.phase;
    return undefined;
  });
  const played = (await createMatchStore(storage, "any-step-journal").readJournal()).filter((e) => e.kind === "GameEventLandPlayed")
    .map((e) => ({who: e.data.fields.player.playerId, phase: e.data.phase}));
  ok(played.some((p) => p.who === 0 && p.phase === "UPKEEP"), "Rob's land played in his upkeep");
  ok(played.filter((p) => p.who === 1).length >= 3 && played.filter((p) => p.who === 1).every((p) => MAIN.has(p.phase)), "Maya's, an AI seat's, only ever in a main phase");
  eq(refusedTwice, null, "one land a turn still: none offered after his upkeep's");
}
{
  /* Not step by step: a step with nothing else to do still passes by itself, land in hand or not. */
  const room = await startRoom({storage: memoryStorage(), matchId: "any-step-quiet", cards, pod: pod(NEW, "house"), seed: SEED});
  const steps = new Set();
  await until(room, (v) => v.state.turn >= 8, (v) => {
    if (v.seatId === "rob" && v.decision.kind === "priority" && v.state.turnPlayerId === v.seat && !v.state.stack.length) steps.add(v.state.phase);
    return undefined;
  });
  eq([...steps].filter((p) => !MAIN.has(p) && p !== "END_OF_TURN"), [], "not step by step, Rob with only lands and creatures is asked in no upkeep, draw step or combat: those steps pass by themselves");
}

/* ---- 2. A LAND TAKEN BACK ---- */
{
  const storage = memoryStorage();
  const room = await startRoom({storage, matchId: "take-back", cards, pod: pod(NEW), seed: SEED});
  const v = await until(room, (x) => x.seatId === "rob" && x.decision.kind === "priority" && option(x, (o) => o.act === "play-land"));
  const before = room.fingerprint().hash, inHand = hand(v).length, forest = option(v, (o) => o.act === "play-land");
  ok(!option(v, (o) => o.act === "undo-land"), "nothing to take back before a land is played");
  await act(room, v, forest.index);
  const after = room.view("rob");
  eq(room.waitingOn, "rob", "having played it, Rob is asked again, not passed for");
  const back = option(after, (o) => o.act === "undo-land");
  ok(back && field(after).some((c) => c.cardId === back.cardId && c.name === "Forest"), "and offered his Forest back, the one on his battlefield");
  eq(back.label, "Return Forest to your hand", "in words a reader of the choice hears");
  /* 5. Kept with the room: opened again, the take-back is still offered, and taken. */
  const again = await openRoom({storage, matchId: "take-back", cards});
  const reopened = again.view("rob");
  const backAgain = option(reopened, (o) => o.act === "undo-land");
  ok(backAgain, "opened again from storage, it is still offered");
  await act(again, reopened, backAgain.index);
  const undone = again.view("rob");
  eq(again.fingerprint().hash, before, "taken back, the game is exactly as it was before the land: the same hash");
  eq(hand(undone).length, inHand, "the Forest is in his hand again");
  ok(!field(undone).some((c) => c.name === "Forest"), "and not on his battlefield");
  ok(option(undone, (o) => o.act === "play-land"), "his land drop is offered again");
  ok(undone.history.some((l) => /^Rob took back Forest/.test(l.text)), "the history says he took it back");
  /* Played again, then something happens -- a tap for mana -- and it is no longer offered. */
  await act(again, undone, option(undone, (o) => o.act === "play-land").index);
  const played = again.view("rob");
  const tap = option(played, (o) => o.act === "activate-mana");
  ok(tap && option(played, (o) => o.act === "undo-land"), "played again: offered back again");
  await act(again, played, tap.index);
  const tapped = again.view("rob");
  ok(!option(tapped, (o) => o.act === "undo-land"), "tapped for mana since: no longer offered");
  /* And past his pass, never again. */
  await until(again, (x) => x.state.turn >= 3);
  /* 6. Replayed, the same game. */
  const replayed = await replayMatch({storage, matchId: "take-back", cards});
  ok(replayed.same && replayed.tape > 0, "replayed from its tape, the same game: the take-back on the tape plays the same");
}
{
  /* In a match launched before (no key): played, and nothing to take back. */
  const room = await startRoom({storage: memoryStorage(), matchId: "take-back-off", cards, pod: pod({landAnyStep: true, askAimed: true}), seed: SEED});
  const v = await until(room, (x) => x.seatId === "rob" && x.decision.kind === "priority" && option(x, (o) => o.act === "play-land"));
  await act(room, v, option(v, (o) => o.act === "play-land").index);
  const after = ask(room);
  ok(!after || after.seatId !== "rob" || !option(after, (o) => o.act === "undo-land"), "without the key, no land is offered back");
}
{
  /* An AI seat's land is never kept to be taken back: Maya's history has no take-back, and no view offers one to Rob of hers. */
  const room = await startRoom({storage: memoryStorage(), matchId: "take-back-ai", cards, pod: pod(NEW, "house"), seed: SEED});
  let offered = 0;
  await until(room, (v) => v.state.turn >= 8, (v) => {
    const back = option(v, (o) => o.act === "undo-land");
    if (back) {offered += 1; ok(v.seatId === "rob" && field(v).some((c) => c.cardId === back.cardId), "a land offered back is the asked person's own");}
    const land = v.seatId === "rob" && option(v, (o) => o.act === "play-land");
    return land ? land.index : undefined;
  });
  ok(offered >= 3, "Rob is offered each of his lands back as he plays it");
  ok(!room.view("rob").history.some((l) => /^Maya took back/.test(l.text)), "and Maya, an AI seat, never takes one back");
}

/* ---- 3. ASKED ABOUT WHAT IS AIMED AT YOU ---- */
/* Maya bolts `at` ("Rob", his "Bear", or "Maya" herself) at her first chance; Rob, with no instant, has no response. */
async function bolted(more, at, prefer = null) {
  const storage = memoryStorage();
  const room = await startRoom({storage, matchId: "aimed", cards, pod: pod(more), seed: SEED});
  if (prefer) {await until(room, (v) => v.seatId === "rob" && v.decision.kind === "priority"); await room.prefer("rob", prefer);}
  let cast = false, asked = null;
  await until(room, (v) => v.state.turn >= 14 || asked !== null, (v) => {
    if (v.seatId === "rob" && v.decision.kind === "priority" && v.state.stack.some((s) => /^Bolt /.test(s.name || ""))) {asked = v; return undefined;}
    if (v.seatId === "rob" && v.decision.kind === "priority") {
      const land = option(v, (o) => o.act === "play-land"); if (land) return land.index;
      const bear = MAIN.has(v.state.phase) && !v.state.stack.length && option(v, (o) => o.act === "cast" && /^Bear /.test(o.label)); if (bear) return bear.index;
      return undefined;
    }
    if (v.seatId === "maya" && v.decision.kind === "priority") {
      const land = option(v, (o) => o.act === "play-land"); if (land && MAIN.has(v.state.phase)) return land.index;
      const target = at === "Maya" ? /→ Maya/ : at === "Rob" ? /→ Rob/ : /→ Bear /;
      const bolt = !cast && option(v, (o) => o.act === "cast" && /^Bolt /.test(o.label) && target.test(o.detail || ""));
      if (bolt && (at !== "Bear" || field(room.view("rob")).some((c) => /^Bear /.test(c.name)))) {cast = true; return bolt.index;}
    }
    return undefined;
  });
  return {cast, asked, room, storage};
}
{
  const atRob = await bolted(NEW, "Rob");
  ok(atRob.cast && atRob.asked, "with the key, Maya's Bolt at Rob asks him before it resolves");
  ok(!(atRob.asked.decision.options || []).some((o) => o.act === "cast"), "though he holds no response: it is to read, and Resolve");
  const top = atRob.asked.state.stack.at(-1);
  eq(top.targets, [{kind: "player", id: 0}], "the Bolt on top, aimed at him");
  const atBear = await bolted(NEW, "Bear");
  ok(atBear.cast && atBear.asked, "and her Bolt at his Bear asks him too");
  const atHer = await bolted(NEW, "Maya");
  ok(atHer.cast && !atHer.asked, "her Bolt at herself is not his to be asked about: passed for him");
  const before = await bolted({landAnyStep: true, takeBackLand: true}, "Rob");
  ok(before.cast && !before.asked, "without the key (a match launched before), the Bolt at him is passed for him, as it was");
}

/* ---- 4. SKIP MY PRIORITY IF NO RESPONSE POSSIBLE, TURNED OFF ---- */
{
  const off = await bolted(NEW, "Maya", {stepByStep: false, askStack: true});
  ok(off.cast && off.asked, "turned off (`askStack`), Rob is asked about her Bolt at herself too: anything on the stack");
  eq(off.room.view("rob").askStack, true, "and his view says so");
  const tape = await createMatchStore(off.storage, "aimed").readTape();
  ok(tape.some((t) => t.kind === "prefer" && t.askStack === true), "it is on the tape");
  const replayed = await replayMatch({storage: off.storage, matchId: "aimed", cards});
  ok(replayed.same, "and the game replays the same");
  /* Left out of a prefer, it stays as it was: stepByStep alone does not turn it back on. */
  await off.room.prefer("rob", {stepByStep: true});
  eq(off.room.view("rob").askStack, true, "a way of playing sent without it keeps it as it was");
  await off.room.prefer("rob", {stepByStep: true, askStack: false});
  eq(off.room.view("rob").askStack, undefined, "and turned back on, the view no longer says so");
}

console.log(`room-lands-and-aims: ${checks} checks passed -- a person's land in any step of their own turn (landAnyStep), a land taken back with nothing since (takeBackLand), asked about what is aimed at them (askAimed), and Skip my priority if no response possible (askStack); each kept with the match, reopened and replayed.`);
