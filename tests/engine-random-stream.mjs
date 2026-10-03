/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 80: THE GAME'S RANDOM STREAM REACHES PLAIN EFFECTS.
 *
 * Until now only a question's answer (a search's shuffle) and the mulligan were handed the game's random stream
 * (game/engine/rng.mjs), so a plain effect could not shuffle, and "the rest on the bottom of your library in a random
 * order" was the order the cards were taken -- the same every game, and not what the cards say. Now the stream is handed
 * in wherever something resolves: passPriority -> resolveTop -> the resolution -> each effect, and on after an answer.
 * With it: a library shuffled (CR 701.24; Forge's Shuffle), "shuffle it into its owner's library", a random order on
 * the bottom, a discard at random (CR 701.9b), and dig's "you may exile a nonland card from among them ... the rest in a
 * random order". Without it, an effect that needs it refuses -- nothing random is ever made up. Same seed, same game.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {randomUUID} from "node:crypto";
import {memoryStorage} from "../game/engine/storage.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {startRoom, basicCards} from "../game/room/room.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const creature = (cost, subtypes, power) => ({types: ["Creature"], subtypes, manaCost: cost, colors: ["G"], power, toughness: power});
const FIX = {Bear: creature("{1}{G}", ["Bear"], 2), Ogre: creature("{2}{R}", ["Ogre"], 3), Elf: creature("{G}", ["Elf"], 1),
  Shuffler: {types: ["Sorcery"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Shuffle your library.", targets: [], effects: [{effect: "shuffle"}]}}};
const play = (setup, seats = 2, more = {}) => runScenario({name: "batch 80", seats, setup, steps: [], expect: [], ...more}, cards.definition, FIX).state;
const names = (s, zone, seat) => s.zones[zone][seat].map((id) => s.objects[id].card);
const refused = (fn) => { try { fn(); return "ran"; } catch (e) { return e.message; } };
/* A library with something to tell orders apart: twenty named cards. */
const LIB = Array.from({length: 20}, (_, i) => (i % 3 === 0 ? "Bear" : i % 3 === 1 ? "Ogre" : "Elf"));

/* ---- a shuffle, and who it shuffles ---- */
{
  const s = play([], 3, {library: LIB});
  const before = [0, 1, 2].map((seat) => names(s, "library", seat).join());
  const events = runEffects(s, [{effect: "shuffle", who: "opponent"}], {controller: 0}, createRng("a"));
  const after = [0, 1, 2].map((seat) => names(s, "library", seat).join());
  eq([after[0] === before[0], after[1] !== before[1], after[2] !== before[2]], [true, true, true], "\"each opponent shuffles\": both opponents' libraries in a new order, his own untouched");
  eq(events.filter((e) => e.kind === "GameEventShuffle").map((e) => e.data.fields.player.playerId), [1, 2], "and each shuffle is said");
  eq([0, 1, 2].map((seat) => [...names(s, "library", seat)].sort().join()), before.map((b) => b.split(",").sort().join()), "the same cards, in a new order");
}
{
  /* Same seed, same order: a game replays. */
  const order = (seed) => { const s = play([], 2, {library: LIB}); runEffects(s, [{effect: "shuffle"}], {controller: 0}, createRng(seed)); return names(s, "library", 0).join(); };
  eq([order("x") === order("x"), order("x") !== order("y")], [true, true], "the order is the stream's: the same seed gives the same library, another seed another");
}
{
  /* What a player knew of the top ends with the shuffle (CR 701.20d), for that library only. */
  const s = play([], 2, {library: LIB});
  s.looks = [{viewer: 0, owner: 0, ids: s.zones.library[0].slice(0, 2)}, {viewer: 0, owner: 1, ids: s.zones.library[1].slice(0, 2)}];
  runEffects(s, [{effect: "shuffle"}], {controller: 0}, createRng("looks"));
  eq(s.looks.map((l) => l.owner), [1], "his look at his own top two is over; his look at hers is not");
}
{
  /* No stream, no shuffle made up. */
  const s = play([], 2, {library: LIB});
  eq(refused(() => runEffects(s, [{effect: "shuffle"}], {controller: 0})), "A shuffle needs the game's random stream", "without the game's random stream, a shuffle is refused");
}

/* ---- the stream reaches what resolves, by the room's own calls ---- */
{
  /* A spell on the stack that shuffles: passPriority hands the stream on to it; without one, it refuses. */
  const stacked = () => runScenario({name: "shuffler", setup: [at(0, "battlefield", "Mountain"), at(0, "hand", "Shuffler")], library: LIB,
    steps: [{tap: "Mountain"}, {cast: "Shuffler"}], expect: []}, cards.definition, FIX).state;
  const s = stacked(), before = names(s, "library", 0).join();
  passPriority(s, null, createRng("p")); passPriority(s, null, createRng("p"));
  eq([s.stack.length, names(s, "library", 0).join() !== before], [0, true], "passPriority with the stream: the spell resolves and the library is shuffled");
  const t = stacked();
  passPriority(t);
  eq(refused(() => passPriority(t)), "A shuffle needs the game's random stream", "passPriority without it: refused, nothing made up");
}
{
  /* After an answer: the effects that follow it have the stream the answer had (Gamble's search, then its shuffle). */
  const s = play([at(0, "hand", "Bear")], 2, {library: LIB});
  beginResolution(s, [{effect: "chooseCard", zone: "library", selector: {}, to: "hand"}, {effect: "discard", count: 1, random: true}, {effect: "shuffle"}], {controller: 0}, createRng("g"));
  const before = names(s, "library", 0).join();
  resolveAwaiting(s, [0], null, createRng("g2"));
  eq([s.resolving, names(s, "hand", 0).length, s.zones.graveyard[0].length, names(s, "library", 0).join() !== before], [null, 1, 1, true],
    "answered, the rest of the resolution goes on with the stream: one card discarded at random, then the shuffle");
}

{
  /* A branch run directly (what repeats for each, what follows a prevention) hands the stream on too. */
  const s = play([], 2, {library: LIB}), before = names(s, "library", 0).join();
  runEffects(s, [{effect: "branch", if: {}, then: [{effect: "shuffle"}]}], {controller: 0}, createRng("branch"));
  eq(names(s, "library", 0).join() !== before, true, "a branch's effects shuffle with the stream they were handed");
}

/* ---- moves into a library: shuffled after, or in a random order ---- */
{
  const s = play([at(0, "graveyard", "Bear"), at(1, "graveyard", "Ogre")], 2, {library: LIB});
  const bear = s.zones.graveyard[0][0], ogre = s.zones.graveyard[1][0];
  const before = [0, 1].map((seat) => names(s, "library", seat).join());
  const events = runEffects(s, [{effect: "moveZone", targets: [bear, ogre], to: "library", shuffle: true}], {controller: 0}, createRng("into"));
  eq([0, 1].map((seat) => s.zones.library[seat].length), [21, 21], "\"shuffle it into its owner's library\": each card into its owner's");
  eq(events.filter((e) => e.kind === "GameEventShuffle").map((e) => e.data.fields.player.playerId).sort(), [0, 1], "and each library a card went into is shuffled after");
  eq([0, 1].map((seat) => names(s, "library", seat).join() !== before[seat] + (seat === 0 ? ",Bear" : ",Ogre")), [true, true], "so the card is not simply at the bottom");
}
{
  /* A random order at the bottom: the moved cards in an order the stream picks, and a library nothing went into is not shuffled. */
  const orderFor = (seed) => {
    const s = play([at(0, "graveyard", "Bear", "Ogre", "Elf")], 2, {library: Array(20).fill("Wastes")});
    const events = runEffects(s, [{effect: "moveZone", targets: [...s.zones.graveyard[0]], to: "library", random: true}], {controller: 0}, createRng(seed));
    return {bottom: names(s, "library", 0).slice(20).join(" "), shuffles: events.filter((e) => e.kind === "GameEventShuffle").length};
  };
  const seen = new Set(Array.from({length: 30}, (_, i) => orderFor(`r${i}`).bottom));
  eq([orderFor("r1").shuffles, orderFor("r1").bottom === orderFor("r1").bottom, seen.size > 1, [...seen].every((o) => o.split(" ").sort().join(" ") === "Bear Elf Ogre")], [0, true, true, true],
    "\"on the bottom in a random order\": the three at the bottom, the order the stream's, replayable, and nothing shuffled");
}
{
  /* moveZoneAll shuffles too ("each player shuffles their hand into their library"). */
  const s = play([at(0, "hand", "Bear", "Ogre"), at(1, "hand", "Elf")], 2, {library: LIB});
  const events = runEffects(s, [{effect: "moveZoneAll", selector: {what: "card", zone: "hand"}, to: "library", shuffle: true}], {controller: 0}, createRng("all"));
  eq([s.zones.hand[0].length, s.zones.hand[1].length, events.filter((e) => e.kind === "GameEventShuffle").length], [0, 0, 2], "every hand into its library, and both libraries shuffled");
}

/* ---- "that many": what the effect before it remembered, counted ---- */
{
  eq([amountOf(null, {rememberedCount: true}, {remembered: [1, 2, 3]}), amountOf(null, {rememberedCount: true}, {}), amountOf(null, {rememberedCount: true, plus: 1}, {remembered: [1]})], [3, 0, 2],
    "\"draws that many cards\": three remembered, three; none, none; and it adds like any amount");
}

/* ---- a discard at random (CR 701.9b) ---- */
{
  const discardFrom = (seed, count = 2) => {
    const s = play([at(0, "hand", "Bear", "Ogre", "Elf"), at(1, "hand", "Bear")]);
    const {events} = beginResolution(s, [{effect: "discard", who: "each", count, random: true}], {controller: 0}, createRng(seed));
    return Object.assign(s, {said: events});
  };
  const s = discardFrom("d");
  eq([s.awaiting, s.zones.hand[0].length, s.zones.graveyard[0].length, s.zones.hand[1].length, s.zones.graveyard[1].length], [null, 1, 2, 0, 1],
    "each player discards two at random: nobody is asked; his three become one, her one is all she had");
  eq(s.said.filter((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.discarded === true).length, 3, "and each is said, as a discard, in what the resolution reports");
  const kept = (seed) => names(discardFrom(seed), "hand", 0).join();
  eq([kept("d") === kept("d"), new Set(Array.from({length: 30}, (_, i) => kept(`k${i}`))).size > 1], [true, true], "which cards: the stream's, replayable, not always the same");
  const t = play([at(0, "hand", "Bear")]);
  eq(refused(() => beginResolution(t, [{effect: "discard", count: 1, random: true}], {controller: 0})), "A discard at random needs the game's random stream", "without the stream: refused");
}

/* ---- dig: what may be taken, "you may", what was taken remembered, the rest in a random order ---- */
{
  const s = play([], 2, {library: ["Bear", "Forest", "Ogre", "Elf"]});
  const context = {controller: 0};
  beginResolution(s, [{effect: "dig", count: 3, selector: {nonTypes: ["Land"]}, upTo: true, to: "exile", rest: "bottom", random: true, remember: true},
    {effect: "moveZone", targets: "remembered", to: "graveyard"}], context, createRng("dig"));
  const asked = awaitingChoice(s);
  eq([asked.min, asked.max, asked.options.map((o) => o.label).sort()], [0, 1, ["Bear", "Ogre"]], "three looked at; only the nonland ones offered; none may be taken");
  resolveAwaiting(s, [asked.options.findIndex((o) => o.label === "Ogre")], null, createRng("dig2"));
  eq([names(s, "graveyard", 0), names(s, "library", 0).slice(0, 1), [...names(s, "library", 0).slice(-2)].sort()], [["Ogre"], ["Elf"], ["Bear", "Forest"]],
    "the Ogre taken and remembered (the next effect moved it on); the Bear and the Forest to the bottom");
  eq(refused(() => resolveAwaiting(s, [], null, null)), "The engine is not waiting on anything", "and the question is closed");
}
{
  /* Nothing among them that may be taken: nobody is asked, and the rest still go to the bottom. */
  const s = play([], 2, {library: ["Forest", "Forest", "Ogre"]});
  beginResolution(s, [{effect: "dig", count: 2, selector: {nonTypes: ["Land"]}, upTo: true, to: "exile", rest: "bottom", random: true}], {controller: 0}, createRng("none"));
  eq([s.awaiting, s.resolving, names(s, "library", 0)[0], names(s, "library", 0).slice(-2)], [null, null, "Ogre", ["Forest", "Forest"]], "no question; the two Forests at the bottom, the Ogre now on top");
}
{
  /* dig's rest in a random order: the stream's -- either order turns up across seeds -- and refused without the stream,
     whether the rest go after an answer or with nothing to answer. */
  const digOgre = (rng, answerRng = rng) => {
    const s = play([], 2, {library: ["Ogre", "Bear", "Elf"]});
    beginResolution(s, [{effect: "dig", count: 3, selector: {subtypes: ["Ogre"]}, to: "hand", rest: "bottom", random: true}], {controller: 0}, rng);
    resolveAwaiting(s, [0], null, answerRng);
    return names(s, "library", 0).slice(-2).join(" ");
  };
  eq([...new Set(Array.from({length: 24}, (_, i) => digOgre(createRng(`d${i}`))))].sort(), ["Bear Elf", "Elf Bear"], "the Ogre taken; the Bear and the Elf to the bottom, in either order");
  eq(refused(() => digOgre(createRng("a"), null)), "A random order needs the game's random stream", "answered without the stream: refused");
  const t = play([], 2, {library: ["Forest", "Forest"]});
  eq(refused(() => beginResolution(t, [{effect: "dig", count: 2, selector: {nonTypes: ["Land"]}, to: "hand", rest: "bottom", random: true}], {controller: 0})),
    "A random order needs the game's random stream", "nothing to take and no stream: refused, not put in the order looked at");
}
{
  /* Must take one when the card does not say "may"; a wrong answer is refused. */
  const s = play([], 2, {library: ["Bear", "Ogre"]});
  beginResolution(s, [{effect: "dig", count: 2, take: 1, to: "hand"}], {controller: 0}, createRng("must"));
  eq(awaitingChoice(s).min, 1, "without upTo: one must be taken");
  eq(refused(() => resolveAwaiting(s, [], null, createRng("must"))), "Invalid selection", "and none is refused");
}

/* ---- the room hands its own stream on: a game in which a spell shuffles ---- */
{
  const DEFS = new Map();
  const def = (name, d) => { DEFS.set(name, d); return name; };
  const roomCards = (name) => DEFS.get(name) ?? basicCards(name);
  const rite = def("Shuffle Rite", {types: ["Sorcery"], manaCost: "{G}", colors: ["G"], spell: {id: "s", text: "Shuffle your library.", targets: [], effects: [{effect: "shuffle"}]}});
  const deck = (seat) => ({commander: [def(`General ${seat}`, {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}"})],
    cards: [...Array(40).fill("Forest"), ...Array(59).fill(rite)]});
  const pod = {seats: [{seatId: "rob", name: "Rob", pilot: "human", ...deck(0)}, {seatId: "ai", name: "House", pilot: "house", ...deck(1)}]};
  const room = await startRoom({storage: memoryStorage(), matchId: "random-stream", cards: roomCards, pod, seed: "room-stream"});
  const pilot = randomLegalPilot(createRng("rob"));
  /* Played on for thirty decisions past the first Rite cast, so it has resolved -- a room that handed no stream on would
     stop there with "A shuffle needs the game's random stream". */
  let decisions = 0, cast = null;
  while (room.waitingOn && room.status === "playing" && decisions < 600 && (cast === null || decisions < cast + 30)) {
    const view = room.view(room.waitingOn), a = pilot.answer(view.decision);
    await room.act(room.waitingOn, {actionId: randomUUID(), revision: view.revision, kind: "answer", choiceId: view.decision.id,
      ...(a.indices ? {indices: a.indices} : {}), ...(a.amounts ? {amounts: a.amounts} : {}), ...(a.value !== undefined ? {value: a.value} : {})});
    decisions += 1;
    if (cast === null && room.history.some((h) => h.text.includes("Shuffle Rite"))) cast = decisions;
  }
  eq([cast !== null, decisions - (cast ?? decisions), room.status], [true, 30, "playing"],
    `the room's game: a Shuffle Rite cast, and thirty decisions on it is still playing -- resolved with the room's own stream (${decisions} decisions)`);
}

/* ---- the catalog, and the cards that faked it ---- */
{
  eq(missingFor({apis: ["Shuffle"]}), [], "Shuffle is built (CR 701.24)");
  const digUntil = cards.definition("Jodah, the Unifier").abilities.flatMap((a) => a.effects ?? []).find((e) => e.effect === "digUntil");
  const sunbird = cards.definition("Sunbird's Invocation").abilities.flatMap((a) => a.effects ?? []).find((e) => e.effect === "moveZone" && e.to === "library");
  eq([digUntil?.rest, sunbird?.random], ["bottom", true], "Jodah's rest go to the bottom (digUntil, now in a random order) and Sunbird's Invocation's rest say random");
  eq(["Gamble", "Winds of Change", "The Key to the Vault"].map((name) => cards.resolve(name)?.playable === true), [true, true, true], "the batch's three cards are defined and playable");
}

console.log(`engine-random-stream: ${checks} checks passed — a shuffle and whose, replayable by seed; the stream handed in by passPriority and on after an answer; into a library and shuffled, or on the bottom in a random order; that many; a discard at random; dig's choice, "may", memory and random rest; and nothing random ever made up.`);
