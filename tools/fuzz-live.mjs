#!/usr/bin/env node
/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* SEEDED WHOLE GAMES OF A LIBRARY'S DECKS THROUGH THE REAL ROOM, JUDGED OVER THE WHOLE MATCH (the independent review of
 * 2026-10-05, F-1).
 *
 * The review's fuzz script read `room.history` for "was refused" once a game had ended. The room keeps only its newest
 * 300 history lines, so a refusal early in a long game was gone by then and the script printed zero. This harness reads
 * the room's own tally instead (game/room/room.mjs, `refusals`), which counts every refused pilot answer from the
 * match's first event and is saved with the room, so it is the same after any reopening. A game is clean only when it
 * finished, its tally began at the match's start (`since` 0) and its total is zero -- a refusal the room survived with
 * its least answer is still a refusal.
 *
 * Seats are the table's: s0..s3, each a deck of the backup by name. The human seats answer with the random-legal pilot
 * from a stream of their own, through the same action envelope a browser sends (`room.act`); the others are house
 * pilots, answered inside the room. A person's wait is how long one of their answers took to come back as their next
 * question: everything the AI seats did in between.
 *
 * A person's answer the rules refuse -- creatures that cannot pay for a convoke, picked at random -- is refused by the room
 * with nothing changed (422, game/room/room.mjs `act`), and the person answers the same question again, as one reading the
 * refusal would. Each is kept (`personRefused`: the turn, the seat, the question and the rules' words) and said, but does
 * not make a game unclean: the room did its job. A question refused PERSON_TRIES times running is a person who cannot
 * go on, and the room's last refusal is thrown.
 *
 * GATE G1'S OTHER TWO TERMS (docs/plan-to-done-2026-09-30.md, G-A: "zero exceptions, identical replays and no leaks"),
 * which tests/engine-gate.mjs proves for the engine's own vanilla decks and these are Rob's real ones:
 *
 *   --replay   every game replayed from its seed and tape on a fresh room (game/room/replay.mjs `replayMatch`): the
 *              state, the journal and the tally must come out the same, or the game is not clean.
 *   --leaks    at every one of the people's questions, every seat's view -- what a browser in that seat is sent -- is
 *              read for the name of a card that seat may not know (`secretsFor`, below). Real decks share names (a Sol
 *              Ring in two decks) and look at each other's cards (the top of a library, a face-down card), so the
 *              judge is the state's own facts, not the projection that is being judged: a name is a leak only when
 *              no copy of it is anywhere that seat may see, nor was at an earlier check.
 *
 *   node tools/fuzz-live.mjs --backup <crankmagic-backup.json> --decks "<deck 1>|<deck 2>|<deck 3>|<deck 4>"
 *        [--humans 0,1] [--seeds 1-50] [--replay] [--leaks] [--json <out.json>]
 *
 * Exit 0 when every game is clean, 1 when any is not, 2 on a usage error. The card source is the cloud table's own
 * (cloud/game-room.mjs `tableCards`): a deck with a card the table cannot play is refused by name, as at the table. */
import {readFileSync, writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {fileURLToPath} from "node:url";
import {startRoom, openRoom, RoomError} from "../game/room/room.mjs";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {replayMatch} from "../game/room/replay.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";

const NAMES = ["Rob", "Friend", "AI 2", "AI 3"];
export const PERSON_TRIES = 50;

/** The decks of a crankmagic-backup file, by name, as the table takes them (crankmagic-table.js `deckForTable`). */
export function decksFromBackup(backup, names) {
  const state = backup && backup.payload && backup.payload.state;
  if (!backup || backup.format !== "crankmagic-backup" || !state) throw new Error("That file is not a CrankMagic backup (crankmagic-backup, version 1).");
  const cardName = (id) => (state.cards[id] || {}).name;
  return names.map((wanted) => {
    const deck = state.decks.find((d) => d.name === wanted && !d.archived);
    if (!deck) throw new Error(`The backup has no deck named "${wanted}". Its decks: ${state.decks.filter((d) => !d.archived).map((d) => d.name).join("; ")}.`);
    const commanders = new Set(deck.commanders || []);
    const cards = [];
    for (const slot of deck.slots || []) {
      if (slot.purpose !== "main" || commanders.has(slot.cardId)) continue;
      for (let i = 0; i < (slot.quantity || 1); i += 1) cards.push(cardName(slot.cardId));
    }
    return {name: deck.name, commander: [...commanders].map(cardName).filter(Boolean), cards: cards.filter(Boolean)};
  });
}

/* A person at the table: answers what they are shown, from a stream of their own. */
/* A PERSON STOPS GOING ROUND A LOOP. The random-legal pilot picks among what it is offered with nothing between one
   choice and the next, so offered "activate it again" after every untap -- Krenko, Mob Boss with Intruder Alarm: a Goblin
   for each Goblin, and every creature untapped as each one enters -- it doubles the board for as long as the coin keeps
   landing that way: in G1's 1,400 games, two games to thousands of Goblins, every step slower than the last (2026-10-08).
   A person going round a loop of optional actions picks how many times (CR 732.2a: a shortcut "may be ... a loop that
   repeats a specified number of times") and then does something else; this one goes round with one activated ability
   at most LOOP_LIMIT times a turn, then passes, and says how often it did (`stopped`). And as a person at the table would
   (Rob, 2026-10-09), it lets a run of identical triggers resolve with one decision, Resolve all, whenever one is offered
   (`resolvedAll`); and once its seat controls BOARD_LIMIT permanents it goes round no loop at all. Rob: "Games as huge
   as you saw in those 2 will never happen because half of the board you were seeing would win before ever getting to
   that point." A person with a hundred permanents has the game won, and attacks rather than make more. */
export const LOOP_LIMIT = 4;
export const BOARD_LIMIT = 100;
const controls = (view) => {const field = view?.state?.players?.[view.seat]?.zones?.Battlefield; return field ? field.count ?? (field.cards ?? []).length : 0;};
export function person(seed) {
  const pilot = randomLegalPilot(createRng(seed));
  let turn = null, taken = new Map();
  const answer = (decision, now, view = null) => {
    if (now !== turn) {turn = now; taken = new Map();}
    const all = decision.kind === "priority" ? decision.options.find((o) => o.act === "resolve-all") : null;
    if (all) {answer.resolvedAll += 1; return {kind: "answer", choiceId: decision.id, indices: [all.index]};}
    let a = pilot.answer(decision);
    const [one] = a.indices ?? [], option = decision.kind === "priority" && a.indices?.length === 1 ? decision.options?.[one] : null;
    if (option?.act === "activate") {
      const key = `${option.cardId}:${option.label}`, pass = decision.options.find((o) => o.act === "pass");
      if (((taken.get(key) ?? 0) >= LOOP_LIMIT || controls(view) >= BOARD_LIMIT) && pass) {a = {indices: [pass.index]}; answer.stopped += 1;}
      else taken.set(key, (taken.get(key) ?? 0) + 1);
    }
    return {kind: "answer", choiceId: decision.id, ...(a.indices ? {indices: a.indices} : {}), ...(a.amounts ? {amounts: a.amounts} : {}), ...(a.value !== undefined ? {value: a.value} : {})};
  };
  answer.stopped = 0;
  answer.resolvedAll = 0;
  return answer;
}

/* WHAT A SEAT MAY KNOW OF A CARD'S NAME, read off the state alone (never off game/engine/projection.mjs, which is what
   `--leaks` judges). Face up in a public zone, everyone (CR 400.2; the command zone, 903.6); in a hand, its owner; face
   down on the battlefield or the stack, its controller (708.5); face down in exile, whoever an instruction let look
   (406.3, `lookers`) or controls what exiled it (702.75a); in a library, no one (401.2), but its top card when a
   permanent its owner controls reveals it to all or lets its owner look (401.4), and the cards a player looked at while
   they are still the top, in that order (701.20e, `state.looks`). A phased-out permanent was public as it phased out. */
const PUBLIC_ZONES = new Set(["battlefield", "graveyard", "exile", "command", "stack", "phased"]);
const nameOf = (o) => (o.faceDown === true ? o.faceDownCard?.card : o.card);
function libraryKnowledge(state, viewer) {
  const known = new Set(), shown = new Set();
  for (const [owner, ids] of (state.zones.library ?? []).entries()) {
    if (!ids?.length) continue;
    let revealed = false, looked = false;
    for (const id of state.zones.battlefield) {
      const holder = state.objects[id];
      if (holder.controller !== owner) continue;
      for (const ability of holder.abilities ?? []) {
        if (ability.kind === "static" && ability.rule === "top-revealed") revealed = true;
        if (ability.kind === "static" && ability.rule === "look-at-top") looked = true;
      }
    }
    if (revealed) shown.add(ids[0]);
    if (revealed || (looked && owner === viewer)) known.add(ids[0]);
    for (const look of state.looks ?? []) if (look.viewer === viewer && look.ids.every((id, i) => ids[i] === id)) look.ids.forEach((id) => known.add(id));
  }
  return {known, shown};
}
/* THE CARDS A QUESTION SHOWS THE PLAYER IT ASKS: what a scry, a surveil or a dig looks at, what a search offers (CR 701.22a,
   701.25a, 701.19a) -- the ids listed in the pending question (`state.awaiting`; a count or a player is not a list of
   them), to that player alone and while it waits. */
function askedAbout(state, viewer) {
  const ids = new Set(), awaiting = state.awaiting;
  if (!awaiting || awaiting.player !== viewer) return ids;
  const walk = (v, listed) => {
    if (listed && Number.isInteger(v) && state.objects[v]) ids.add(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, true));
    else if (v && typeof v === "object") Object.values(v).forEach((x) => walk(x, false));
  };
  walk(awaiting, false);
  return ids;
}
function mayKnow(state, o, viewer, library) {
  if (library.asked.has(o.id)) return true;
  if (o.zone === "hand") return o.owner === viewer;
  if (o.zone === "library") return library.known.has(o.id);
  if (!PUBLIC_ZONES.has(o.zone)) return false;
  if (o.faceDown !== true) return true;
  if (o.zone === "battlefield") return characteristicsOf(state, o.id).controller === viewer;
  if (o.zone === "stack") return o.controller === viewer;
  if (o.zone === "exile") {
    const by = o.exiledBy !== undefined ? state.objects[o.exiledBy] : null;
    return (o.lookers ?? []).includes(viewer) || (by?.zone === "battlefield" && characteristicsOf(state, by.id).controller === viewer);
  }
  return false;
}

/** The names `viewer` may not be shown: a card's name is secret from a seat when no copy of it is anywhere that seat
    may see now, nor was public at any earlier check (`seen`, which this adds to: a history line written while a card was
    public stays true after it is gone). */
export function secretsFor(state, viewer, seen = new Set()) {
  const library = {...libraryKnowledge(state, viewer), asked: askedAbout(state, viewer)}, known = new Set(), secret = new Set();
  for (const o of Object.values(state.objects)) {
    const name = nameOf(o);
    if (!name) continue;
    if (mayKnow(state, o, viewer, library)) {
      known.add(name);
      if ((PUBLIC_ZONES.has(o.zone) && o.faceDown !== true) || library.shown.has(o.id)) seen.add(name);
    } else secret.add(name);
  }
  for (const name of secret) if (known.has(name) || seen.has(name)) secret.delete(name);
  return secret;
}

/* The game's own words -- every type, subtype, supertype and keyword any object has. A card may share its name with one
   (Rob's decks hold a card named Flashback), so where a view uses that word as a word, it names no card. */
export function gameTerms(state) {
  const terms = new Set();
  const add = (v) => {if (typeof v === "string") terms.add(v); else if (Array.isArray(v)) v.forEach(add); else if (v && typeof v === "object") Object.values(v).forEach(add);};
  for (const o of Object.values(state.objects)) for (const field of ["types", "subtypes", "supertypes", "keywords"]) add(o[field]);
  return terms;
}

/** The secret names a view holds: in a field that names a card (`name`, `faceDownName`), exactly; anywhere else -- a
    history line, a question, an option -- as a whole name (not "Opt" in "Option"), unless it is also one of the game's
    own words, or is part of a longer card name written there (`names`: Rob's decks hold a Mirkwood and a Mirkwood
    Nurturer -- the longer is judged as itself). Each with a little of what surrounds it. */
export function leaksIn(view, secrets, terms = new Set(), names = new Set()) {
  const found = [], prose = [];
  const walk = (v, key) => {
    if (typeof v === "string") {
      if (key === "name" || key === "faceDownName") {if (secrets.has(v)) found.push({name: v, context: `${key}: ${v}`});}
      else prose.push(v);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(view, null);
  const text = prose.join("\n");
  const word = (c) => c !== undefined && /[\p{L}\p{N}]/u.test(c);
  for (const name of secrets) {
    if (terms.has(name) || found.some((f) => f.name === name)) continue;
    const longer = [...names].filter((other) => other.length > name.length && other.includes(name));
    const inLonger = (at) => longer.some((other) => {
      for (let i = other.indexOf(name); i >= 0; i = other.indexOf(name, i + 1)) if (text.startsWith(other, at - i)) return true;
      return false;
    });
    for (let at = text.indexOf(name); at >= 0; at = text.indexOf(name, at + 1)) {
      if (word(text[at - 1]) || word(text[at + name.length]) || inLonger(at)) continue;
      found.push({name, context: text.slice(Math.max(0, at - 60), at + name.length + 60)});
      break;
    }
  }
  return found;
}

/* WHAT THE GAME HAS SHOWN EVERYONE, read off its journal: a card face up as it entered or left a public zone, was cast,
   played, revealed (CR 701.20a), turned face up or transformed. A history line written then stays true after the card is
   gone -- a player who loses takes their cards out of the game (CR 800.4a) -- and the AI seats play many turns between two
   of the people's questions, so what a check happens to see is not enough. A card moved face down is journaled without
   its name (effects/zones.mjs), so it is never counted here. */
const PUBLIC_ZONE_TYPES = new Set(["Battlefield", "Graveyard", "Exile", "Stack", "Command"]);
const SHOWING = new Set(["GameEventSpellAbilityCast", "GameEventLandPlayed", "GameEventCardRevealed", "GameEventCardTurnedFaceUp", "GameEventSpellResolved", "GameEventSpellCopied", "GameEventCardTransformed"]);
export function shownBy(event) {
  const fields = event?.data?.fields ?? {}, card = fields.card ?? fields.land;
  if (!card?.name || card.faceDown === true) return null;
  if (event.kind === "GameEventCardChangeZone") return PUBLIC_ZONE_TYPES.has(fields.from?.zoneType) || PUBLIC_ZONE_TYPES.has(fields.to?.zoneType) ? card.name : null;
  return SHOWING.has(event.kind) ? card.name : null;
}

/** A game's leak-check memory: per seat, the names no longer secret from it; and how far into the journal it has read. */
export const leakMemory = (seats) => ({seen: Array.from({length: seats}, () => new Set()), read: 0, names: new Set()});

/** Every seat's view read for leaks (`leaksIn` of `secretsFor`), the engine's state and journal taken from the room's own
    storage. */
export async function checkLeaks(room, storage, matchId, memory, turn) {
  const point = await createMatchStore(storage, matchId).latestCheckpoint();
  const keys = await storage.list(`match/${matchId}/journal/`);
  for (const key of keys.slice(memory.read)) {
    const name = shownBy(JSON.parse(await storage.get(key)));
    if (name) for (const seen of memory.seen) seen.add(name);
    if (name) memory.names.add(name);
  }
  memory.read = keys.length;
  const found = [];
  /* Every card name the game has had: a history line names a card that has since left it (CR 800.4a) as well as one in it. */
  for (const o of Object.values(point.state.objects)) if (nameOf(o)) memory.names.add(nameOf(o));
  const terms = gameTerms(point.state), names = memory.names;
  room.seats.forEach((s, seat) => {
    for (const leak of leaksIn(room.view(s.seatId), secretsFor(point.state, seat, memory.seen[seat]), terms, names)) found.push({turn, seatId: s.seatId, ...leak});
  });
  return found;
}

/**
 * One seeded game, played to its end. `decks` are table decks ({name, commander, cards}); `humans` the seat indices
 * a person sits in; `reopenEvery`, when set, puts the room away and wakes it from its storage after that many of the
 * people's answers, as an evicted Durable Object is; `people`, who answers for a person (a seed to an answering function,
 * `person` unless a suite says otherwise). Returns what the game was, never its state: how it ended, its length, the
 * people's longest wait, their answers the rules refused, and the room's tally of refused AI answers.
 */
export async function playGame({decks, seed, cards, humans = [], matchId = `fuzz-${seed}`, pilot, storage = memoryStorage(), turnLimit = 400, reopenEvery = 0, people: answerer = person,
  replay = false, leaks = false}) {
  /* The pod as the table launches it (game/room/table.mjs): the draw waits for its click, a step with nothing to do passes
     itself, and once every person is out the game ends there -- so a wait measured here is one a person at the table has,
     not the AI seats playing a game out for nobody. */
  const pod = {drawBeat: true, passEmpty: true, endWhenNoPerson: true, resolveAll: true, seats: decks.map((d, i) => ({seatId: `s${i}`, name: NAMES[i] || `Seat ${i + 1}`, pilot: humans.includes(i) ? "human" : "house", commander: d.commander, cards: d.cards}))};
  const people = Object.fromEntries(humans.map((i) => [`s${i}`, answerer(`person-${seed}-${i}`)]));
  const started = Date.now();
  let room = await startRoom({storage, matchId, ...(cards ? {cards} : {}), pod, seed: `seed-${seed}`, ...(pilot ? {pilot} : {})});
  let decisions = 0, reopened = 0, longest = {ms: 0, turn: null};
  const personRefused = [], leaked = [], memory = leakMemory(pod.seats.length);
  let leakChecks = 0;
  for (;;) {
    const who = room.waitingOn;
    if (!who || room.status === "finished") break;
    const view = room.view(who);
    if (view.state.turn > turnLimit) break;
    if (leaks) {leaked.push(...await checkLeaks(room, storage, matchId, memory, view.state.turn)); leakChecks += 1;}
    const asked = Date.now();
    for (let tries = 1; ; tries += 1) {
      try {await room.act(who, {actionId: randomUUID(), revision: view.revision, ...people[who](view.decision, view.state.turn, view)}); break;}
      catch (error) {
        if (!(error instanceof RoomError) || error.status !== 422 || tries >= PERSON_TRIES) throw error;
        personRefused.push({turn: view.state.turn, seatId: who, question: view.decision.title, reason: error.message});
      }
    }
    const waited = Date.now() - asked;
    decisions += 1;
    if (waited > longest.ms) longest = {ms: waited, turn: room.view(who).state.turn};
    if (reopenEvery && decisions % reopenEvery === 0) {room = await openRoom({storage, matchId, ...(cards ? {cards} : {}), ...(pilot ? {pilot} : {})}); reopened += 1;}
  }
  if (leaks && room.status === "finished") {leaked.push(...await checkLeaks(room, storage, matchId, memory, room.view(pod.seats[0].seatId).state.turn)); leakChecks += 1;}
  const last = room.view(pod.seats[0].seatId);
  const ms = Date.now() - started;
  return {seed, status: room.status, result: last.result, turns: last.state.turn, decisions, reopened, ms, longestWait: longest, refusals: room.refusals,
    personRefused, loopsStopped: Object.values(people).reduce((n, p) => n + (p.stopped ?? 0), 0), resolvedAll: Object.values(people).reduce((n, p) => n + (p.resolvedAll ?? 0), 0), room, ...(leaks ? {leaks: leaked, leakChecks} : {}),
    ...(replay ? {replay: await replayMatch({storage, matchId, ...(cards ? {cards} : {}), ...(pilot ? {pilot} : {})})} : {})};
}

/** Whether a game counts as clean, and why not when it does not. */
export function verdict(game) {
  const problems = [];
  if (game.status !== "finished") problems.push(`did not finish (${game.status} at turn ${game.turns})`);
  const r = game.refusals;
  if (!r || typeof r.total !== "number") problems.push("the room kept no refusal tally");
  else {
    if (r.since !== 0) problems.push(`its refusal tally began at event ${r.since}, not the match's start, so a zero would not cover the whole game`);
    if (r.total > 0) problems.push(`${r.total} AI answer${r.total === 1 ? " was" : "s were"} refused by the rules (first: turn ${r.first[0]?.turn}, ${r.first[0]?.seatId}, "${r.first[0]?.question}": ${r.first[0]?.reason})`);
  }
  if (game.replay && !game.replay.same) problems.push(`its replay from the seed and tape did not reach the same game (${JSON.stringify(game.replay.original)} against ${JSON.stringify(game.replay.replayed)})`);
  if (game.leaks?.length) problems.push(`${game.leaks.length} leak${game.leaks.length === 1 ? "" : "s"} (first: turn ${game.leaks[0].turn}, ${game.leaks[0].seatId} was sent ${JSON.stringify(game.leaks[0].name)}: …${game.leaks[0].context}…)`);
  return {clean: problems.length === 0, problems};
}

/** One line per game, in the review's words, with the whole-match tally. */
export function describe(game) {
  const v = verdict(game), end = game.result ? `${game.result.winner ?? "no one"}, ${game.result.reason}` : "unfinished";
  const wait = game.longestWait.turn === null ? "0 ms (no person)" : `${game.longestWait.ms} ms (turn ${game.longestWait.turn})`;
  const first = game.personRefused?.[0];
  const people = first ? `, ${game.personRefused.length} of the people's answers refused by the rules and given again (first: turn ${first.turn}, ${first.seatId}, "${first.question}": ${first.reason})` : "";
  const judged = [game.replay ? `replay ${game.replay.same ? "identical" : "DIFFERENT"}` : "", game.leaks ? `${game.leaks.length} leaks in ${game.leakChecks} checks of every seat's view` : "",
    game.loopsStopped ? `the person stopped going round a loop ${game.loopsStopped} time${game.loopsStopped === 1 ? "" : "s"}` : "",
    game.resolvedAll ? `the person chose Resolve all ${game.resolvedAll} time${game.resolvedAll === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ");
  return `seed ${game.seed}: ${game.status} (${end}), ${game.turns} turns, ${game.decisions} decisions, ${(game.ms / 1000).toFixed(1)} s, longest wait for a person ${wait}, ${game.refusals?.total ?? "?"} refused over the whole match${people}${judged ? `, ${judged}` : ""}${v.clean ? "" : ` -- NOT CLEAN: ${v.problems.join("; ")}`}`;
}

const seedsFrom = (spec) => spec.split(",").flatMap((part) => {
  const [a, b] = part.split("-").map(Number);
  if (!Number.isInteger(a) || (b !== undefined && !Number.isInteger(b))) throw new Error(`Seeds are numbers or ranges, like 1-50: ${spec}`);
  return b === undefined ? [a] : Array.from({length: b - a + 1}, (_, i) => a + i);
});

async function main(argv) {
  const arg = (name, fallback) => {const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback;};
  const backupPath = arg("backup"), deckNames = arg("decks");
  if (!backupPath || !deckNames) {console.error("usage: node tools/fuzz-live.mjs --backup <file> --decks \"A|B|C|D\" [--humans 0,1] [--seeds 1-50] [--json <out>]"); return 2;}
  const {tableCards} = await import("../cloud/game-room.mjs");
  const decks = decksFromBackup(JSON.parse(readFileSync(backupPath, "utf8")), deckNames.split("|"));
  const humansSpec = arg("humans", "");
  const humans = humansSpec ? humansSpec.split(",").map(Number) : [];
  const seeds = seedsFrom(arg("seeds", "1-50"));
  decks.forEach((d, i) => console.log(`s${i} ${NAMES[i]} (${humans.includes(i) ? "human" : "house"}): ${d.name}`));
  const rows = [];
  for (const seed of seeds) {
    const game = await playGame({decks, seed, cards: tableCards, humans, replay: argv.includes("--replay"), leaks: argv.includes("--leaks")});
    console.log(describe(game));
    rows.push({seed, status: game.status, result: game.result, turns: game.turns, decisions: game.decisions, ms: game.ms, longestWait: game.longestWait, refusals: game.refusals,
      personRefused: game.personRefused.length, loopsStopped: game.loopsStopped, ...(game.replay ? {replaySame: game.replay.same} : {}), ...(game.leaks ? {leaks: game.leaks, leakChecks: game.leakChecks} : {}),
      clean: verdict(game).clean});
  }
  const clean = rows.filter((r) => r.clean).length;
  const terms = [argv.includes("--replay") ? "replayed identically" : "", argv.includes("--leaks") ? "no seat sent a card it may not know" : ""].filter(Boolean);
  console.log(`${clean} of ${rows.length} games clean (finished, refusals counted from the match's start, none refused${terms.length ? `, ${terms.join(", ")}` : ""})`);
  const out = arg("json");
  if (out) writeFileSync(out, JSON.stringify({decks: decks.map((d) => d.name), humans, node: process.version, rows}, null, 2));
  return clean === rows.length ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(await main(process.argv.slice(2)));
