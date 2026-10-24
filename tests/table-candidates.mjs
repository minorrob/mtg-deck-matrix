/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* CANDIDATES AT PLAYTEST TABLES, LABELED (card load step 5; Rob's decision 2; Linear ROB-91;
 * docs/engine/plan-card-load-program.md; game/engine/cards/candidates.mjs, game/room/room.mjs and table.mjs).
 *
 *   1. The module the Worker plays them from: the candidates file as it stands, every candidate in it, each definition
 *      the one its abilities and oracle record compile to, fresh each call; and the backstop's provisional cards the
 *      directory lacks; no directory card, no basic land.
 *   2. The room: a pod that says `candidates` seats one, and every object made from it says `candidate`, through every
 *      zone it moves to; its owner's view labels it, and nobody's view labels a card they cannot name. A pod without the
 *      key refuses the card by name; the directory's own definition wins over a candidate's. Reopened and replayed, the
 *      match keeps its cards, and an AI seat still reads a candidate's facts. Face down, a candidate is labeled for nobody.
 *   3. The table: a playtest table takes a deck with candidates, counts them known and starts its match with
 *      `candidates`; any other table refuses them by name and starts its match without.
 *   4. "Report a wrong card": a candidate this seat can see, at a playtest table, kept with the table and handed over in
 *      that game's record; never a card that is no candidate, one the seat cannot see, or at any other table; bounded.
 *   5. The Worker's table: on staging (PLAYTEST_TABLES on) a candidate is known and reported, elsewhere it is not known;
 *      the front door forwards a report.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {basicCards, startRoom, openRoom, seatPilot} from "../game/room/room.mjs";
import {createState, addObject, moveObject} from "../game/engine/state/index.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {replayMatch} from "../game/room/replay.mjs";
import {tableOn} from "../game/room/table.mjs";
import {GameTable, tableCandidates} from "../cloud/game-room.mjs";
import {tables} from "../cloud/tables.mjs";
import {candidateDefinition, CANDIDATE_SOURCE} from "../game/engine/cards/candidates.mjs";
import {tableDefinition} from "../game/engine/cards/definitions.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {candidatesModule, backstopScripts, CANDIDATES_MODULE} from "../game/tools/engine-candidates.mjs";
import {scriptOf} from "../game/tools/card-compiler.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const refuses = async (p, status, re, m) => {await assert.rejects(p, (e) => e.status === status && (!re || re.test(e.message)), m); checks += 1;};

const file = JSON.parse(readFileSync(new URL("../data/engine/candidates.json", import.meta.url), "utf8"));
const oracle = JSON.parse(readFileSync(new URL("../data/engine/oracle.json", import.meta.url), "utf8"));
const byName = new Map(oracle.cards.map((c) => [c.name, c]));

/* ---- 1. the module ---- */
{
  eq(readFileSync(CANDIDATES_MODULE, "utf8") === candidatesModule(), true,
    "game/engine/cards/candidates.mjs is the candidates file as it stands (if not, run `node game/tools/engine-candidates.mjs --write`)");
  const backstop = backstopScripts();
  eq(CANDIDATE_SOURCE, {oracle: file.oracle, cards: file.cards.length + backstop.length, compiler: file.cards.length, backstop: backstop.length},
    `all ${file.cards.length} of the compiler's candidates, from the same oracle data, and the backstop's ${backstop.length} provisional cards the directory lacks`);
  /* None once every learned definition is confirmed (wave 4d confirmed the last 22, 2026-10-23): then no ledger row is
     provisional, and the next check still shows which of the backstop's cards are taken. */
  const provisional = Object.values(JSON.parse(readFileSync(new URL("../data/engine/onboarding-ledger.json", import.meta.url), "utf8")).cards)
    .filter((row) => row.status === "provisional").length;
  ok((backstop.length >= 1 || provisional === 0) && backstop.every((b) => JSON.stringify(candidateDefinition(b.identity.name)) === JSON.stringify(compileScript(b).definition) && !tableDefinition(b.identity.name)),
    `each backstop card (${backstop.length ? `${backstop.slice(0, 3).map((b) => b.identity.name).join(", ")}, ...` : provisional ? `none, yet ${provisional} provisional in the ledger` : "none, and no provisional row"}) as it compiles, none a directory card`);
  const bolt = {schema: "CrankCardScript@1", identity: {name: "Lightning Bolt"}, abilities: []}, odd = {...bolt, identity: {name: "Test Backstop Card"}};
  eq(backstopScripts([{status: "provisional", script: bolt}, {status: "blocked", script: odd}, {status: "provisional", script: odd}]).map((s) => s.identity.name),
    ["Test Backstop Card"], "of the backstop's cards, only a provisional one the directory does not define");
  const missing = file.cards.filter((c) => !candidateDefinition(c.name)).map((c) => c.name);
  eq(missing, [], "each one the table can be dealt");
  const sample = file.cards.filter((_, i) => i % 50 === 0);
  eq(sample.filter((c) => JSON.stringify(candidateDefinition(c.name)) !== JSON.stringify(compileScript(scriptOf(c, byName.get(c.name))).definition)).map((c) => c.name), [],
    `${sample.length} of them, one in 50: the definition its abilities and oracle record compile to`);
  eq(file.cards.filter((c) => tableDefinition(c.name)).map((c) => c.name), [], "none a card the directory defines");
  const one = candidateDefinition(file.cards[0].name);
  one.abilities.length = 0;
  ok(candidateDefinition(file.cards[0].name).abilities.length > 0, "fresh each call: one table's object is not another's");
  eq(["Forest", "Llanowar Elves", "No Such Card"].map(candidateDefinition), [null, null, null], "a basic land, a directory card and no card at all: none");
  eq(candidateDefinition(file.cards[0].name.toUpperCase()), candidateDefinition(file.cards[0].name), "found however the name is spelled");
  eq(tableCandidates(file.cards[0].name), candidateDefinition(file.cards[0].name), "the Worker's table plays them from this module");
}

/* Decks: a synthetic commander and lands, and real candidates. */
const picks = file.cards.filter((c) => /Creature/.test(byName.get(c.name)?.type || "")).slice(0, 3).map((c) => c.name);
const FOREST = {types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]};
const DEFS = new Map();
const def = (name, d) => {DEFS.set(name, d); return name;};
const cards = (name) => DEFS.get(name) ?? basicCards(name);
const deck = (tag, library = picks) => ({name: `${tag} deck`, commander: [def(`General ${tag}`, {types: ["Creature"], supertypes: ["Legendary"], power: 3, toughness: 3, manaCost: "{2}{G}"})],
  cards: [...Array.from({length: 38}, () => def(`Grove ${tag}`, FOREST)), ...Array.from({length: 61}, (_, i) => library[i % library.length])]});
const seat = (seatId, d, pilot = "human") => ({seatId, name: seatId, pilot, commander: d.commander, cards: d.cards});
const handOf = (room, seatId = "s0", whose = 0) => room.view(seatId).state.players[whose].zones.Hand;
const podOf = async (storage, matchId) => (await createMatchStore(storage, matchId).loadMatch()).pod;

/* ---- 2. the room ---- */
{
  const a = deck("ra"), b = deck("rb");
  const pod = {seats: [seat("s0", a), seat("s1", b, "house")], candidates: true};
  const storage = memoryStorage();
  const room = await startRoom({storage, matchId: "cand-room", cards, candidates: candidateDefinition, pod, seed: "cand-room"});
  const hand = handOf(room).cards, theirs = handOf(room, "s0", 1), library = room.view("s0").state.players[0].zones.Library;
  ok(hand.length === 7, "a pod that says `candidates` seats them: the game starts, seven cards in hand");
  const mine = hand.filter((c) => picks.includes(c.name));
  ok(mine.length > 0 && mine.every((c) => c.candidate === true), `its owner's view labels every candidate in hand (${mine.length}): drawn from the library, the mark moved with it`);
  ok(hand.filter((c) => !picks.includes(c.name)).every((c) => c.candidate === undefined), "and no other card");
  ok(theirs.hiddenCount === 7 && theirs.cards.every((c) => c.name === null && c.candidate === undefined), "an opponent's hand: no name, and no label either");
  ok(library.hiddenCount === library.count && library.cards.every((c) => c.candidate === undefined), "nor a card in a library");
  await refuses(startRoom({storage: memoryStorage(), matchId: "cand-plain", cards, candidates: candidateDefinition, pod: {...pod, candidates: undefined}, seed: "x"}),
    422, new RegExp(`cannot play these 3 cards yet: ${picks.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(", ")}`), "a pod without the key refuses every candidate, by name");
  const hand2 = handOf(await startRoom({storage: memoryStorage(), matchId: "cand-dir", cards: (n) => cards(n) ?? (picks.includes(n) ? candidateDefinition(n) : null),
    candidates: candidateDefinition, pod, seed: "cand-room"})).cards;
  ok(hand2.some((c) => picks.includes(c.name)) && hand2.every((c) => c.candidate === undefined), "where the directory defines the card, its definition wins: no label");
  /* Played a while (each seat takes its first option), reopened, replayed. */
  for (let i = 0; i < 12 && room.waitingOn; i += 1) {
    const who = room.waitingOn, v = room.view(who), d = v.decision;
    try {await room.act(who, {actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: d.id, indices: d.min === 0 ? [] : [0]});} catch {break;}
  }
  const read = [];
  const again = await openRoom({storage, matchId: "cand-room", cards, candidates: candidateDefinition, pilot: (given) => {read.push(given.cards); return seatPilot(given);}});
  const handAgain = handOf(again).cards;
  ok(read.length === 1 && read[0](picks[0])?.manaValue >= 0, "reopened, the AI seat reads a candidate's facts, as anyone reads them off the card");
  ok(handAgain.some((c) => picks.includes(c.name)) && handAgain.filter((c) => picks.includes(c.name)).every((c) => c.candidate === true), "reopened, the labels hold");
  const proof = await replayMatch({storage, matchId: "cand-room", cards, candidates: candidateDefinition});
  ok(proof.same === true && proof.tape > 0, `and the match replays from its seed and tape (${proof.tape} answers) to the same game`);
  eq((await podOf(storage, "cand-room")).candidates, true, "its pod keeps the key");
}

/* Face down (manifest, CR 701.40a), a candidate is a 2/2 with no name, labeled for nobody; turned up as it leaves, it is again. */
{
  const state = createState({matchId: "cand-face", seed: "cand-face", players: [{name: "A"}, {name: "B"}]});
  const id = addObject(state, {...candidateDefinition(picks[0]), card: picks[0], owner: 0, controller: 0, candidate: true}, "library", 0);
  const down = moveObject(state, id, "battlefield", null, {faceDown: true});
  const seen = (viewer, cardId) => projectFor(state, viewer).players[0].zones.Battlefield.cards.find((c) => c.cardId === cardId);
  ok(seen(1, down) && seen(1, down).name === null && seen(1, down).candidate === undefined, "a face-down candidate: no name to anyone else, and no label");
  ok(seen(0, down) && seen(0, down).candidate === undefined, "nor to its controller, who may look at it but sees a 2/2");
  const up = moveObject(state, down, "graveyard", 0);
  ok(projectFor(state, 1).players[0].zones.Graveyard.cards.find((c) => c.cardId === up)?.candidate === true, "turned up as it leaves, labeled again");
}

/* ---- 3. the table ---- */
const ROB = "rob@example.com", EVE = "eve@example.com";
let now = Date.parse("2026-10-19T20:00:00Z"), seq = 0;
const random = (n) => {seq += 1; return new Uint8Array(n).map((_, i) => (seq * 17 + i * 3) % 256);};
async function launched(tableId, {playtest}) {
  const storage = memoryStorage(), t = tableOn(storage, {cards, candidates: candidateDefinition, random});
  await t.create({tableId, host: ROB, hostName: "Rob", seats: [{kind: "ai", name: "Bot"}], playtest});
  return {t, storage};
}
{
  const {t, storage} = await launched("candplay1", {playtest: true});
  eq(await t.unknown([...picks, "No Such Card"]), ["No Such Card"], "a playtest table counts its candidates known");
  await t.deck(ROB, 0, deck("tp"), now); await t.deck(ROB, 1, deck("tq"), now);
  await t.ready(ROB, true, now); await t.start(ROB, now);
  const matchId = await t.tick(now + 10000);
  ok(matchId, "takes a deck of them, and starts the game");
  const room = await t.currentRoom();
  ok(handOf(room).cards.some((c) => c.candidate === true), "and its board labels them");
  eq((await podOf(storage, matchId)).candidates, true, "its match keeps the key");

  /* ---- 4. report a wrong card ---- */
  const shown = handOf(room).cards, candidate = shown.find((c) => c.candidate === true), other = shown.find((c) => c.candidate !== true);
  const report = await t.reportCard(ROB, {cardId: candidate.cardId, note: "  It should have flying.  "}, now + 20000);
  eq([report.matchId, report.seatId, report.card, report.cardId, report.note, report.at], [matchId, "s0", candidate.name, candidate.cardId, "It should have flying.", now + 20000],
    "a candidate in this seat's hand, reported: the game, the seat, the card as the engine names it, the note");
  if (other) await refuses(t.reportCard(ROB, {cardId: other.cardId}, now), 404, /not a candidate you can see/, "a card that is no candidate is not reported");
  await refuses(t.reportCard(ROB, {cardId: 999999}, now), 404, /not a candidate you can see/, "nor one this seat cannot see");
  await refuses(t.reportCard(EVE, {cardId: candidate.cardId}, now), 403, null, "nor by someone without a seat");
  for (let i = 1; i < 200; i += 1) await t.reportCard(ROB, {cardId: candidate.cardId, note: `again ${i}`}, now);
  await refuses(t.reportCard(ROB, {cardId: candidate.cardId}, now), 409, /taken 200 reports/, "a table keeps 200 reports, no more");
  await t.endGame(ROB, now + 30000);
  const rec = await t.record(ROB, matchId);
  eq([rec.kind, rec.cardReports.length, rec.cardReports[0].card], ["full", 200, candidate.name], "the game's record hands them over, for the triage loop");
  const plain = await launched("candplain1", {playtest: false});
  eq(await plain.t.unknown([...picks]), [...picks].sort(), "any other table counts them unknown");
  await refuses(plain.t.deck(ROB, 0, deck("tr"), now), 422, /cannot play these 3 cards yet/, "and refuses a deck of them, by name");
  await refuses(plain.t.reportCard(ROB, {cardId: 1}, now), 409, /Only a playtest table/, "and takes no report");
  await plain.t.deck(ROB, 0, deck("ts", ["Forest"]), now); await plain.t.deck(ROB, 1, deck("tt", ["Forest"]), now);
  await plain.t.ready(ROB, true, now); await plain.t.start(ROB, now);
  const plainMatch = await plain.t.tick(now + 10000);
  ok(plainMatch && (await podOf(plain.storage, plainMatch)).candidates === undefined, "whose own match starts without the key");
}

/* ---- 5. the Worker's table ---- */
function objectCtx() {
  const map = new Map();
  return {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
    list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async () => {}, deleteAlarm: async () => {}},
  acceptWebSocket: () => {}, getWebSockets: () => [], getTags: () => []};
}
const objectCall = (table) => async (method, path, email, body) => {
  const r = await table.fetch(new Request(`https://table.internal${path}`, {method, headers: {"content-type": "application/json", "x-crankmagic-email": email}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})}));
  return {status: r.status, json: await r.json()};
};
{
  const object = new GameTable(objectCtx(), {PLAYTEST_TABLES: "on"}, {random, now: () => now}), staging = objectCall(object);
  await staging("POST", "/table/create", ROB, {tableId: "candstage1", hostName: "Rob", seats: [{kind: "ai"}]});
  eq((await staging("POST", "/table/known", ROB, {names: picks})).json.unknown, [], "on staging, every table a playtest table, a candidate is known");
  const general = file.cards.find((c) => /Legendary Creature/.test(byName.get(c.name)?.type || "")).name;
  const real = (tag) => ({name: tag, commander: [general],
    cards: [...Array.from({length: 38}, () => "Forest"), ...Array.from({length: 61}, (_, i) => picks[i % picks.length])]});
  await staging("POST", "/table/deck", ROB, {seatId: 0, deck: real("sa")}); await staging("POST", "/table/deck", ROB, {seatId: 1, deck: real("sb")});
  await staging("POST", "/table/ready", ROB, {ready: true}); await staging("POST", "/table/start", ROB);
  now += 10000; await object.alarm();
  const live = (await object.table.currentRoom()).view("s0").state.players[0].zones.Hand.cards.find((c) => c.candidate === true);
  const sent = await staging("POST", "/table/report", ROB, {cardId: live.cardId, note: "wrong"});
  eq([sent.status, sent.json.report.card], [201, live.name], "and POST /table/report takes a report of one, with a commander that is a candidate too");
  const prod = objectCall(new GameTable(objectCtx(), {}, {random, now: () => now}));
  await prod("POST", "/table/create", ROB, {tableId: "candprod1", hostName: "Rob", seats: [{kind: "ai"}]});
  eq((await prod("POST", "/table/known", ROB, {names: picks})).json.unknown, [...picks].sort(), "elsewhere it is not");
  const seen = [];
  const TABLES = {idFromName: (n) => n, get: () => ({fetch: async (r) => {seen.push([r.method, new URL(r.url).pathname, await r.text()]); return new Response("{}");}})};
  await tables(new Request("https://crankmagic.test/api/tables/candstage1/report", {method: "POST", body: JSON.stringify({cardId: 7, note: "wrong"})}), {TABLES}, {email: ROB});
  eq(seen.at(-1), ["POST", "/table/report", JSON.stringify({cardId: 7, note: "wrong"})], "the front door forwards POST /api/tables/:id/report to the table");
}

console.log(`table-candidates: ${checks} checks passed — ${CANDIDATE_SOURCE.cards} candidates in the Worker's module; a playtest table seats them, labeled where the seat can name the card; any other table refuses them by name.`);
