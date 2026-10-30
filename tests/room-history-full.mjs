/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ROB-332: THE WHOLE GAME'S HISTORY REACHES THE BOARD (the engine and room half; docs/ui-lane/history-and-targets-contract.md, §3).
 *
 * Rob, 2026-10-30: "Full game history needs to be shown in the history pane, not just the most recent during the game. I should be
 * able to scroll back at any time in the game and see everything that's happened" -- and, asked how, "load earlier is acceptable"
 * (ROB-334): the room sends the newest N lines and answers a request for older ones.
 *
 * One long game (two people and two house pilots, a whole game, far past the 300 lines the room once kept), read the way the board
 * reads it:
 *   Length     the view carries only its newest HISTORY_VIEW lines, the same for every seat and a spectator, numbered by `seq`;
 *              `historyFirst` says where the game begins.
 *   Earliest   asking for the lines before the oldest held, page after page, reaches seq 0: "Turn 1 · ..." -- and the test FAILS
 *              when the earliest line is missing, a page repeats a line or leaves a gap.
 *   Order      every page is oldest to newest by `seq`, the turns never go backwards, and the pages and the view are one history.
 *   Hidden     no line of any page, in any field, names a card only another seat's hand or a library holds -- the older pages too.
 *   Stored     the room's own record keeps only a short tail (the rest in sealed segments, written once), so it stays small however
 *              long the game; put away and woken, every page is the same; a room saved before lines were numbered wakes numbered.
 *   Socket     {type:"history", before} over the object's socket answers its asker alone, with the same page; a bad one is refused.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage} from "../game/engine/storage.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {startRoom, openRoom, basicCards, HISTORY_VIEW, HISTORY_SEGMENT, HISTORY_TAIL} from "../game/room/room.mjs";
import {GameRoom, objectStorage} from "../cloud/game-room.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const DEFS = new Map();
const def = (name, d) => {DEFS.set(name, d); return name;};
const cards = (name) => DEFS.get(name) ?? basicCards(name);
function deck(seat) {
  const list = [];
  for (let i = 0; i < 38; i += 1) list.push(def(`Grove ${seat}`, {types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]}));
  const kinds = [["Bear", 2, 2, "{1}{G}"], ["Wolf", 3, 3, "{2}{G}"], ["Wurm", 5, 5, "{4}{G}"], ["Elf", 1, 1, "{G}"]];
  for (let i = 0; i < 61; i += 1) {const [k, p, t, c] = kinds[i % 4]; list.push(def(`${k} ${seat}-${i}`, {types: ["Creature"], power: p, toughness: t, manaCost: c}));}
  return {commander: [def(`General ${seat}`, {types: ["Creature"], power: 3, toughness: 3, manaCost: "{2}{G}"})], cards: list};
}
const POD = {seats: [
  {seatId: "rob", name: "Rob", pilot: "human", ...deck(0)},
  {seatId: "maya", name: "Maya", pilot: "human", ...deck(1)},
  {seatId: "ai-1", name: "House 1", pilot: "house", ...deck(2)},
  {seatId: "ai-2", name: "House 2", pilot: "house", ...deck(3)},
]};
const HUMANS = ["rob", "maya"];
const rawState = async (storage, matchId) => JSON.parse(await storage.get(`match/${matchId}/checkpoint/${String(JSON.parse(await storage.get(`match/${matchId}/checkpoint/latest`)).sequence).padStart(10, "0")}`)).state;
function secretsFor(state, seat, seen) {
  const pub = new Set(), secret = new Set();
  for (const o of Object.values(state.objects)) {
    if (o.zone === "library" || (o.zone === "hand" && o.owner !== seat)) secret.add(o.card); else pub.add(o.card);
  }
  for (const n of pub) {secret.delete(n); seen.add(n);}
  for (const n of seen) secret.delete(n);
  return secret;
}
function person(seed) {
  const pilot = randomLegalPilot(createRng(seed));
  return (d) => {const a = pilot.answer(d); return {kind: "answer", choiceId: d.id, ...(a.indices ? {indices: a.indices} : {}), ...(a.amounts ? {amounts: a.amounts} : {})};};
}
/* Every line before `before`, the way the board asks: the page before the oldest held, again and again, until nothing older comes back. */
async function allBefore(room, before, limit = 100) {
  const pages = [];
  for (let at = before, n = 0; n < 200; n += 1) {
    const page = await room.historyBefore({before: at, limit});
    if (!page.lines.length) return {pages, first: page.first};
    pages.push(page);
    at = page.lines[0].seq;
  }
  throw new Error("history paged forever");
}

const MATCH = "hist-full", SEED = "hf-1", TURNS = 100;
const storage = memoryStorage();
let room = await startRoom({storage, matchId: MATCH, cards, pod: POD, seed: SEED});
const people = Object.fromEntries(HUMANS.map((h) => [h, person(`${SEED}-${h}`)]));
const seen = room.seats.map(() => new Set());
for (let n = 0; room.waitingOn; n += 1) {
  const who = room.waitingOn, view = room.view(who);
  if (view.state.turn > TURNS) break;
  if (n % 3 === 0) {const state = await rawState(storage, MATCH); room.seats.forEach((s, i) => secretsFor(state, i, seen[i]));}
  await room.act(who, {actionId: randomUUID(), revision: view.revision, ...people[who](view.decision)});
  if (n % 60 === 59) room = await openRoom({storage, matchId: MATCH, cards});
}

/* 1. THE VIEW CARRIES ONLY THE NEWEST LINES, THE SAME FOR EVERYONE. */
const views = Object.fromEntries(room.seats.map((s) => [s.seatId, room.view(s.seatId)]));
const watched = room.watch();
const rob = views.rob;
eq(rob.history.length, HISTORY_VIEW, `the view carries its newest ${HISTORY_VIEW} lines`);
for (const [seat, v] of Object.entries(views)) eq(v.history, rob.history, `${seat} is shown the same newest lines`);
eq(watched.history, rob.history, "and a spectator the same");
eq([rob.historyFirst, watched.historyFirst], [0, 0], "`historyFirst` says the game's lines begin at 0, in a seat's view and a spectator's");
const newestSeq = rob.history.at(-1).seq;
ok(newestSeq >= 300, `the game is long: ${newestSeq + 1} lines, well past the 300 the room once kept`);
eq(rob.history.map((l) => l.seq), rob.history.map((_, i) => rob.history[0].seq + i), "the view's lines are numbered one after another");

/* 2. THE EARLIEST LINE IS REACHABLE, AND THE PAGES ARE ONE HISTORY. */
const back = await allBefore(room, rob.history[0].seq);
const older = back.pages.flatMap((p) => p.lines).sort((a, b) => a.seq - b.seq);
const whole = [...older, ...rob.history];
eq(whole.map((l) => l.seq), whole.map((_, i) => i), "paging back from the view reaches seq 0 with no line repeated and no gap");
eq([whole[0].seq, whole[0].turn, / drew \d+ cards$/.test(whole[0].text)], [0, 0, true], "the earliest line is the game's first event: the opening hands, before turn 1");
ok(whole.slice(0, 20).some((l) => l.mark === "turn" && /^Turn 1 · /.test(l.text)), "and turn 1's own line follows it within the first lines");
ok(back.pages.length >= 3, `it took ${back.pages.length} pages of 100 to get there`);
for (const page of back.pages) {
  eq(page.lines.map((l) => l.seq), page.lines.map((_, i) => page.lines[0].seq + i), "a page is oldest to newest by seq");
  ok(page.lines.length <= 100 && page.lines.at(-1).seq < page.before, "a page holds at most what was asked and only lines before `before`");
  eq(page.first, 0, "and says where the game begins");
}
eq(whole.map((l) => l.turn).every((t, i) => i === 0 || t >= whole[i - 1].turn), true, "the turns never go backwards along the history");
ok(whole.some((l) => l.actor !== undefined && l.source && l.cards?.length), "the lines carry who, with what and the cards named");
eq((await room.historyBefore({before: 0})).lines, [], "before the first line there is nothing");
await assert.rejects(room.historyBefore({before: -5}), (e) => e.status === 400); checks += 1;   /* a `before` that is not a line number is refused, by the room as by the socket */
eq((await room.historyBefore({before: 10, limit: 1000})).lines.length, 10, "a page never holds more than the lines there are before it");
eq((await room.historyBefore({before: 1e9, limit: 1000})).lines.length, 200, "nor more than 200, however many are asked");
eq((await room.historyBefore({before: 1e9, limit: 0})).lines.length, 100, "no sensible limit is the default 100");
eq((await room.historyBefore({limit: 5})).lines.map((l) => l.seq), [newestSeq - 4, newestSeq - 3, newestSeq - 2, newestSeq - 1, newestSeq].map((x) => x), "asked for the newest, with no `before`: the last lines");

/* 3. NO LINE OF ANY PAGE NAMES WHAT ONLY A HIDDEN ZONE HOLDS. */
{
  const state = await rawState(storage, MATCH);
  let read = 0;
  for (const [i, s] of room.seats.entries()) {
    const secret = [...secretsFor(state, i, seen[i])];
    for (const line of whole) {
      const leaked = secret.find((name) => new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(JSON.stringify(line)));
      if (leaked) assert.fail(`seat ${s.seatId}'s history says ${JSON.stringify(line)}, naming ${leaked}, which only a hidden zone holds`);
      read += 1;
    }
  }
  ok(read > 1000, `no line of the whole history, in any field, names a card only a hidden zone holds: ${read} lines read, across ${room.seats.length} seats`);
  /* The same pages for every seat and for a spectator: history is public, so it asks nothing of who is asking. */
  eq(await allBefore(room, rob.history[0].seq), back, "the older pages are the same whoever asks");
}

/* 4. STORED: A SHORT TAIL IN THE RECORD, THE REST SEALED ONCE. */
{
  const record = JSON.parse(await storage.get(`room/${MATCH}`));
  ok(record.history.length < HISTORY_SEGMENT + HISTORY_TAIL, `the room's record holds only a tail of ${record.history.length} lines (under ${HISTORY_SEGMENT + HISTORY_TAIL}), not ${whole.length}`);
  ok(record.history.length >= HISTORY_TAIL, `at least the ${HISTORY_TAIL} lines a view needs`);
  const keys = await storage.list(`room/${MATCH}/history-`);
  eq(keys.length, record.historySealed, "each sealed segment is its own storage key");
  eq(record.historySealed * HISTORY_SEGMENT + record.history.length, whole.length, "and the segments and the tail are the whole game");
  const first = JSON.parse(await storage.get(keys[0]));
  eq([first.length, first[0].seq], [HISTORY_SEGMENT, 0], "the first segment is the game's first lines");
  const woken = await openRoom({storage, matchId: MATCH, cards});
  eq(woken.view("maya").history, rob.history, "put away and woken, the view's lines are the same");
  eq(await allBefore(woken, woken.view("rob").history[0].seq), back, "and so is every older page");
  /* A segment is written once: playing on does not rewrite it. */
  const before = await storage.get(keys[0]);
  for (let n = 0; n < 6 && woken.waitingOn; n += 1) {const who = woken.waitingOn, v = woken.view(who); await woken.act(who, {actionId: randomUUID(), revision: v.revision, ...people[who](v.decision)});}
  eq(await storage.get(keys[0]), before, "playing on leaves a sealed segment as it was");
}

/* 5. A ROOM SAVED BEFORE LINES WERE NUMBERED WAKES NUMBERED. */
{
  const old = memoryStorage();
  const fresh = await startRoom({storage: old, matchId: "hist-old", cards, pod: POD, seed: "hf-old"});
  const record = JSON.parse(await old.get("room/hist-old"));
  record.history = [{turn: 1, text: "Turn 1 · Rob", mark: "turn"}, {turn: 1, text: "Rob played Grove 0"}, {turn: 1, text: "Rob drew a card"}];
  delete record.historySealed;
  await old.put("room/hist-old", JSON.stringify(record));
  const woken = await openRoom({storage: old, matchId: "hist-old", cards});
  eq(woken.view("rob").history.map((l) => [l.seq, l.text]), [[0, "Turn 1 · Rob"], [1, "Rob played Grove 0"], [2, "Rob drew a card"]], "its lines are numbered from 0 as it wakes");
  void fresh;
}

/* 6. OVER THE OBJECT'S SOCKET: the asker is answered, no one else is, and a bad request is refused. */
{
  const map = new Map();
  const doStorage = {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k), list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort())};
  const sockets = [];
  const ctx = {storage: doStorage, acceptWebSocket: (s, tags) => {s.tags = tags; sockets.push(s);}, getWebSockets: () => sockets, getTags: (s) => s.tags};
  const socket = () => ({frames: [], send(f) {this.frames.push(JSON.parse(f));}, close() {}});
  const object = new GameRoom(ctx, {}, {cards});
  const started = await object.fetch(new Request("https://room.internal/start", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({matchId: "hist-ws", seed: "hf-ws", pod: POD})}));
  eq(started.status, 201, "the object starts a game");
  const by = {rob: socket(), maya: socket()};
  for (const [seat, s] of Object.entries(by)) object.accept(s, seat);
  /* Play it long enough for a segment, through the object's own storage. */
  const live = await object.load(), pilots = Object.fromEntries(HUMANS.map((h) => [h, person(`ws-${h}`)]));
  for (let n = 0; live.waitingOn && live.view("rob").state.turn <= 14; n += 1) {const who = live.waitingOn, v = live.view(who); await live.act(who, {actionId: randomUUID(), revision: v.revision, ...pilots[who](v.decision)});}
  const newest = live.view("rob").history;
  ok(newest.at(-1).seq >= HISTORY_VIEW, `the object's game has more lines than a view carries (${newest.at(-1).seq + 1})`);
  const asked = newest[0].seq, counts = Object.fromEntries(Object.entries(by).map(([k, s]) => [k, s.frames.length]));
  await object.webSocketMessage(by.rob, JSON.stringify({type: "history", before: asked, limit: 7}));
  const answer = by.rob.frames.slice(counts.rob);
  eq(answer.map((f) => f.type), ["history"], "the asker is answered with one history frame");
  eq([answer[0].before, answer[0].first, answer[0].lines.map((l) => l.seq)], [asked, 0, [0, 1, 2, 3, 4, 5, 6].map((i) => asked - 7 + i)], "the seven lines just before the oldest held, oldest first");
  eq(by.maya.frames.length, counts.maya, "no one else is sent anything");
  for (const bad of [{before: "x"}, {before: 1.5}, {before: 3, limit: "many"}, {before: -1}]) {
    const n = by.rob.frames.length;
    await object.webSocketMessage(by.rob, JSON.stringify({type: "history", ...bad}));
    const f = by.rob.frames.slice(n);
    eq([f.length, f[0].type, f[0].of, f[0].status], [1, "refused", "history", 400], `${JSON.stringify(bad)} is refused, saying which request`);
  }
  void objectStorage;
}

console.log(`room-history-full: ${checks} checks passed -- ${whole.length} lines of one game reached from the newest ${HISTORY_VIEW} back to turn 1's first, the same for every seat and a spectator, nothing hidden named, the record small.`);
