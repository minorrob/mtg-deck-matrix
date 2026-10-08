/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* GATE G1'S OTHER TWO TERMS ON ROB'S REAL DECKS: IDENTICAL REPLAYS AND NO LEAKS (tools/fuzz-live.mjs `--replay`,
 * `--leaks`; docs/plan-to-done-2026-09-30.md, G-A: "G1's 1,400 games with zero exceptions, identical replays and no
 * leaks").
 *
 * tests/engine-gate.mjs proves both for the engine's own vanilla decks, where every seat's card names are its own and a
 * name in the wrong seat's view is a leak on sight. Rob's decks share names (Sol Ring, Command Tower, the basics), and
 * their cards look at each other (the top of a library, a face-down card), so the harness judges a view by what the state
 * says that seat may know -- never by the projection being judged:
 *
 *   Knowing    a hand is its owner's; a library is no one's, but a top card revealed to all, or to its owner, and the
 *              cards a player looked at while they stay on top (CR 401.2, 401.4, 701.20e); a face-down permanent is its
 *              controller's (708.5), a face-down exiled card its lookers' (406.3); a name with a copy anywhere public is
 *              no secret, nor one that was public at an earlier check (a history line stays true after the card is gone).
 *   Reading    a card's name in a name field exactly, and anywhere else as a whole name -- not "Opt" in "Option", and not
 *              a word the game itself uses (a card named Flashback, in a keyword list).
 *   Judged     a whole game of four of the decks, every seat's view read at each of the person's questions, no leak, and
 *              its replay from seed and tape identical; a leak or a differing replay fails the game.
 *   Saved      the bugs the replay found: an effect without a sublayer wrote `sublayer: undefined`, and a permanent that
 *              became a copy kept "had no supertypes" as one; JSON drops such a key and the hash keeps it, so the room's
 *              checkpoint could not be read back (game/engine/storage.mjs). Neither writes one now, a copy moving as itself
 *              woken or not, and the save refuses any state that would not read back.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createState, addObject, moveObject} from "../game/engine/state/index.mjs";
import {beginGame} from "../game/engine/rules/turn.mjs";
import {effectUntil, copyOnto} from "../game/engine/script/effects/permanents.mjs";
import {createJournal, EVENT_SCHEMA, hashState} from "../game/engine/journal.mjs";
import {beginResolution, runResolution} from "../game/engine/script/resolution.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {secretsFor, leaksIn, gameTerms, checkLeaks, leakMemory, shownBy, playGame, verdict, decksFromBackup} from "../tools/fuzz-live.mjs";
import {tableCards} from "../cloud/game-room.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Maya"}, {name: "Trey"}, {name: "Sam"}]};
const started = () => { const s = createState(pod); beginGame(s); return s; };
const card = (name, owner, extra = {}) => ({card: name, types: ["Creature"], power: 1, toughness: 1, owner, controller: owner, ...extra});

/* ---- Knowing ---- */
{
  const s = started();
  addObject(s, card("Maya's Secret", 1), "hand", 1);
  addObject(s, card("Rob's Own", 0), "hand", 0);
  addObject(s, card("Deep Card", 0), "library", 0);
  addObject(s, card("Sol Ring", 1), "hand", 1);
  addObject(s, card("Sol Ring", 2), "battlefield");
  const rob = secretsFor(s, 0);
  ok(rob.has("Maya's Secret") && !rob.has("Rob's Own"), "another seat's hand is secret from Rob; his own is not");
  ok(rob.has("Deep Card") && secretsFor(s, 1).has("Deep Card"), "a library card is secret from everyone, its owner too (CR 401.2)");
  ok(!rob.has("Sol Ring"), "a name with a copy on the battlefield is no secret, though Maya holds another");

  const seen = new Set();
  const goes = addObject(s, card("Bounced", 1), "battlefield");
  secretsFor(s, 0, seen);
  s.objects[goes].zone = "hand"; s.zones.battlefield = s.zones.battlefield.filter((id) => id !== goes); s.zones.hand[1].push(goes);
  ok(!secretsFor(s, 0, seen).has("Bounced") && secretsFor(s, 0).has("Bounced"), "a card public at an earlier check stays known after it goes back to a hand -- and only through what was seen");

  const morph = addObject(s, {card: null, types: ["Creature"], power: 2, toughness: 2, owner: 1, controller: 1}, "battlefield");
  Object.assign(s.objects[morph], {faceDown: true, faceDownCard: {card: "Hidden Morph"}});
  ok(secretsFor(s, 0).has("Hidden Morph") && !secretsFor(s, 1).has("Hidden Morph"), "a face-down permanent's card is its controller's alone (CR 708.5)");

  const exiled = addObject(s, {card: null, types: [], owner: 2, controller: 2}, "exile");
  Object.assign(s.objects[exiled], {faceDown: true, faceDownCard: {card: "Hideaway Card"}, lookers: [3]});
  ok(!secretsFor(s, 3).has("Hideaway Card") && secretsFor(s, 2).has("Hideaway Card"), "a face-down exiled card is known to whoever an instruction let look, not to its owner for owning it (CR 406.3)");
}
{
  const s = started();
  addObject(s, card("Top Card", 1), "library", 1);
  addObject(s, card("Second Card", 1), "library", 1);
  const [top, second] = s.zones.library[1];
  const topName = s.objects[top].card, nextName = s.objects[second].card;
  ok(secretsFor(s, 0).has(topName), "a library's top card is secret with nothing revealing it");
  const revealer = addObject(s, card("Revealer", 1, {abilities: [{kind: "static", rule: "top-revealed"}]}), "battlefield");
  ok(!secretsFor(s, 0).has(topName) && secretsFor(s, 0).has(nextName), "played with the top card revealed, the top is known to all, the next is not (CR 401.4)");
  s.objects[revealer].abilities = [{kind: "static", rule: "look-at-top"}];
  ok(secretsFor(s, 0).has(topName) && !secretsFor(s, 1).has(topName), "\"you may look at the top card\": its owner alone");
  s.objects[revealer].abilities = [];
  s.looks = [{viewer: 2, owner: 1, ids: [top, second]}];
  ok(!secretsFor(s, 2).has(topName) && !secretsFor(s, 2).has(nextName) && secretsFor(s, 0).has(topName), "the cards a player looked at are known to that player alone (CR 701.20e)");
  s.zones.library[1].reverse();
  ok(secretsFor(s, 2).has(topName), "and no longer once they are not that library's top in that order (701.20d)");
}

/* ---- Reading ---- */
{
  const secrets = new Set(["Opt", "Flashback", "Lightning Bolt"]);
  eq(leaksIn({cards: [{name: "Opt"}]}, secrets).map((l) => l.name), ["Opt"], "a secret in a name field is a leak");
  eq(leaksIn({history: [{text: "Maya cast Lightning Bolt."}]}, secrets).map((l) => l.name), ["Lightning Bolt"], "and in a history line, as a whole name");
  eq(leaksIn({options: [{label: "Option 2"}, {text: "Optional"}]}, secrets), [], "but not inside another word: \"Opt\" in \"Option\"");
  const terms = new Set(["Flashback"]);
  eq(leaksIn({cards: [{keywords: ["Flashback"]}], history: [{text: "cast with Flashback"}]}, secrets, terms), [], "a card named as one of the game's words is not found where the word is used");
  eq(leaksIn({cards: [{name: "Flashback"}]}, secrets, terms).map((l) => l.name), ["Flashback"], "and is still found in a name field");
  const s = started();
  addObject(s, card("Anything", 0, {keywords: ["Flashback"]}), "graveyard", 0);
  ok(gameTerms(s).has("Flashback") && gameTerms(s).has("Creature"), "the game's words are read off the objects: keywords and types");
}

/* ---- A view that sends a seat another's card, read from a room's own storage: found, with the seat and the turn ---- */
{
  const s = started();
  addObject(s, card("Maya's Secret", 1), "hand", 1);
  const storage = memoryStorage(), store = createMatchStore(storage, "m");
  await store.saveCheckpoint({...createJournal({matchId: "m", seed: "s"}).checkpoint(s, createRng("s").checkpoint()), matchId: "m"});
  const room = {seats: [{seatId: "s0"}, {seatId: "s1"}], view: (seatId) => ({seatId, cards: [{name: "Maya's Secret"}]})};
  eq((await checkLeaks(room, storage, "m", leakMemory(2), 4)).map((l) => [l.turn, l.seatId, l.name]), [[4, "s0", "Maya's Secret"]],
    "Rob's view holding the card in Maya's hand is a leak, at that turn; Maya's own view holding it is not");

  /* What the game has shown everyone, from its journal: a card once public may be named after it is gone. */
  const zone = (name, from, to, faceDown = false) => ({kind: "GameEventCardChangeZone", data: {fields: {card: {name, faceDown}, from: {zoneType: from}, to: {zoneType: to}}}});
  eq([zone("Drawn", "Library", "Hand"), zone("Played", "Hand", "Battlefield"), zone("Bounced", "Battlefield", "Hand"), zone("Hidden", "Library", "Exile", true),
    {kind: "GameEventCardRevealed", data: {fields: {card: {name: "Shown"}}}}, {kind: "GameEventScried", data: {fields: {card: {name: "Scried"}}}}].map(shownBy),
    [null, "Played", "Bounced", null, "Shown", null],
    "the journal shows a card entering or leaving a public zone face up, or revealed -- never a draw, a face-down move (even one that named its card) or a scry");
  addObject(s, card("Gone Card", 1), "library", 1);
  await store.appendEvents([{schema: EVENT_SCHEMA, sequence: 1, kind: "GameEventCardChangeZone", matchId: "m", data: {fields: {card: {name: "Gone Card", faceDown: false}, from: {zoneType: "Battlefield"}, to: {zoneType: "Graveyard"}}}}]);
  await store.saveCheckpoint({...createJournal({matchId: "m", seed: "s"}).checkpoint(s, createRng("s").checkpoint()), matchId: "m"});
  const told = {seats: [{seatId: "s0"}], view: () => ({history: [{text: "Maya cast Gone Card."}, {text: "Maya holds Maya's Secret."}]})};
  eq((await checkLeaks(told, storage, "m", leakMemory(1), 9)).map((l) => l.name), ["Maya's Secret"],
    "a history line naming a card the journal once showed is no leak, though another copy is in a library now; one naming a card never shown is");
}

/* ---- Judged: a whole game of Rob's decks ---- */
{
  const backup = JSON.parse(readFileSync(new URL("../data/live-state.json", import.meta.url), "utf8"));
  const decks = decksFromBackup(backup, ["D1 Quintorius Spirits", "D2 Chulane Value Loop", "D3 Atraxa Proliferate", "D4 Felothar Walls"]);
  const game = await playGame({decks, seed: 2, cards: tableCards, humans: [0], replay: true, leaks: true});
  ok(game.status === "finished" && game.leakChecks > 50 && game.leaks.length === 0,
    `a game of four of the decks to its end (${game.turns} turns), every seat's view read at each of ${game.leakChecks} checks: nothing sent that a seat may not know`);
  ok(game.replay.same && game.replay.tape > 0, `replayed from its seed and the person's ${game.replay.tape} answers, the same game`);
  ok(verdict(game).clean, "and the harness passes it");
  ok(!verdict({...game, leaks: [{turn: 3, seatId: "s1", name: "Sol Ring", context: "name: Sol Ring"}]}).clean, "a game with one leak fails it");
  ok(!verdict({...game, replay: {...game.replay, same: false}}).clean, "and one whose replay differs");
}

/* ---- Saved: an effect without a sublayer has no such key, and its checkpoint reads back ---- */
{
  const s = started();
  const bear = addObject(s, card("Bear", 0), "battlefield");
  effectUntil(s, {targets: [bear], apply: {addKeywords: ["Haste"]}}, {controller: 0, source: bear});
  const effect = s.effects.at(-1);
  ok(effect.layer === 6 && !Object.hasOwn(effect, "sublayer"), "\"gains haste until end of turn\": a layer-6 effect with no sublayer key at all");
  const point = {...createJournal({matchId: "m", seed: "s"}).checkpoint(s, createRng("s").checkpoint()), matchId: "m"};
  const store = createMatchStore(memoryStorage(), "m");
  await store.saveCheckpoint(point);
  eq((await store.latestCheckpoint()).hash, point.hash, "and the checkpoint holding it is saved and reads back as the same game");
}
/* ---- Saved: a permanent that became a copy keeps only the values it has, and moves as itself, woken or not ---- */
{
  const s = started();
  const legend = addObject(s, card("Legendary Hero", 1, {supertypes: ["Legendary"]}), "battlefield");
  const bear = addObject(s, card("Bear", 0), "battlefield");
  copyOnto(s, bear, legend);
  ok(s.objects[bear].card === "Legendary Hero" && !Object.hasOwn(s.objects[bear].uncopied, "supertypes"),
    "a Bear that became a copy of a legendary creature: the copy's values on it, its own beside them without a supertype it never had");
  const point = {...createJournal({matchId: "m", seed: "s"}).checkpoint(s, createRng("s").checkpoint()), matchId: "m"};
  const store = createMatchStore(memoryStorage(), "m");
  await store.saveCheckpoint(point);
  const woken = (await store.latestCheckpoint()).state;
  const moved = [s, woken].map((state) => { const id = moveObject(state, bear, "graveyard", 0); const o = state.objects[id]; return [o.card, o.supertypes ?? []]; });
  eq(moved, [["Bear", []], ["Bear", []]], "it leaves the battlefield as a Bear, not legendary (CR 400.7) -- in memory and woken from its checkpoint alike");
}

/* ---- Saved: a question paused mid-resolution reads back -- a discard that names no one, a repeat whose steps ask ---- */
{
  const readsBack = (state) => hashState(JSON.parse(JSON.stringify(state))) === hashState(state);
  const dealt = () => { const s = started(); for (let p = 0; p < 4; p += 1) addObject(s, card(`Card ${p}`, p), "hand", p); return s; };
  const one = dealt();
  beginResolution(one, [{effect: "discard", count: 1}], {controller: 0, source: null});
  runResolution(one, createRng("d"));
  ok(one.awaiting?.effect === "discard" && !Object.hasOwn(one.awaiting, "who") && readsBack(one),
    "\"discard a card\": its question waits with no `who` key at all, and the paused game reads back as itself");
  const each = dealt();
  beginResolution(each, [{effect: "repeatFor", each: "player", effects: [{effect: "discard", count: 1, who: "that player"}]}], {controller: 0, source: null});
  runResolution(each, createRng("e"));
  const mark = each.resolving.queue.at(-1);
  ok(each.awaiting?.effect === "discard" && mark?.effect === "__about" && !Object.hasOwn(mark, "about") && readsBack(each),
    "\"each player discards a card\": the mark that restores the resolution's subject -- it had none -- holds no `about` key, and the paused game reads back");
}

console.log(`room-g1-terms: ${checks} checks passed -- what each seat may know of a card read off the state, a name found only where it names a card, a whole game of Rob's decks with nothing leaked and an identical replay, and an effect's checkpoint that reads back.`);
