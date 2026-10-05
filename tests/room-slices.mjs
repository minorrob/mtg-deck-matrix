/* A ROOM PLAYS IN SLICES WHERE A REQUEST'S TIME IS CAPPED, AND THE SLICED GAME IS THE SAME GAME (game/room/room.mjs,
 * `slice`, `continuing`, `resume`; cloud/game-room.mjs, the alarm).
 *
 * Cloudflare gives a Durable Object 30 s of CPU for each request or alarm. Between two people's decisions the AI seats
 * play inside one call, and once every person is out of the game the rest is AI seats alone -- 3 to 100 s of play to
 * the end in the review of 2026-10-05 -- so a single call could be stopped by the platform with nothing saved, and the
 * same answer would stop it again. A room given a slice stops after that many engine steps with nobody asked, saved,
 * and plays on when resumed: on the object, by its alarm, set for at once.
 *
 *   Same       a game of AI seats played in slices of 25 steps, the room put away and woken between some of them,
 *              reaches the same state, journal and tape as the game played in one go;
 *   Asked      with a person at the table, their decisions are the same decisions, and the game replays from its tape
 *              (with no slices) to the same journal;
 *   Refused    while the AI seats play on, nobody can answer, leave or end the game, and the refusal says when to try
 *              again -- leaving there would be taped where a replay cannot put it;
 *   Alarmed    the table's object sets its alarm for now whenever a slice ran out, plays the next slice when it rings,
 *              a dropped player's five minutes running out mid-slice waits for the AI seats to stop instead of failing
 *              the alarm, and the game the last person left plays on, alarm by alarm, to its end.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {startRoom, openRoom, basicCards} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {GameTable} from "../cloud/game-room.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const refuses = async (p, status, re, m) => {await assert.rejects(p, (e) => e.status === status && (!re || re.test(e.message)), m); checks += 1;};

const DEFS = new Map();
const def = (name, d) => {DEFS.set(name, d); return name;};
const cards = (name) => DEFS.get(name) ?? basicCards(name);
const FOREST = {types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]};
const deck = (tag) => ({commander: [def(`General ${tag}`, {types: ["Creature"], supertypes: ["Legendary"], power: 3, toughness: 3, manaCost: "{2}{G}"})],
  cards: [...Array.from({length: 38}, () => def(`Grove ${tag}`, FOREST)), ...Array.from({length: 61}, (_, i) => def(`Bear ${tag}-${i}`, {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}"}))]});
const answerer = (seed) => {const p = randomLegalPilot(createRng(seed)); return (d) => {const a = p.answer(d); return {kind: "answer", choiceId: d.id, ...(a.indices ? {indices: a.indices} : {}), ...(a.amounts ? {amounts: a.amounts} : {}), ...(a.value !== undefined ? {value: a.value} : {})};};};
const journalOf = async (storage, matchId) => hashState(await createMatchStore(storage, matchId).readJournal());
const SLICE = 25;

/* 1. AI SEATS ONLY: SLICED, AND WOKEN BETWEEN SLICES, IT IS THE SAME GAME. */
{
  const pod = {passEmpty: true, seats: ["a", "b", "c"].map((t, i) => ({seatId: `s${i}`, name: `House ${t}`, pilot: "house", ...deck(`ai${t}`)}))};
  const whole = memoryStorage(), sliced = memoryStorage();
  const once = await startRoom({storage: whole, matchId: "m", cards, pod, seed: "slices-1"});
  ok(once.status === "finished", "played in one go, three house pilots finish the game inside the start");
  let room = await startRoom({storage: sliced, matchId: "m", cards, pod, seed: "slices-1", slice: SLICE});
  ok(room.continuing && room.status === "playing" && room.waitingOn === null, `given a slice of ${SLICE} steps, the start stops with nobody asked: the AI seats play on`);
  eq(JSON.parse(await sliced.get("room/m")).continuing, true, "and the stop is saved with the room, like any other point of the game");
  let slices = 1;
  while (room.continuing) {
    if (slices % 7 === 0) room = await openRoom({storage: sliced, matchId: "m", cards, slice: SLICE});
    await room.resume();
    slices += 1;
  }
  ok(slices > 20, `it took ${slices} slices, the room put away and woken every seventh`);
  eq(room.fingerprint(), once.fingerprint(), "and reached the same game: the state's hash, the journal's length, the tape, the refusals");
  eq(await journalOf(sliced, "m"), await journalOf(whole, "m"), "the same journal, event for event");
  eq(room.history, once.history, "and the same history");
}

/* 2. A PERSON AT THE TABLE: THE SAME DECISIONS, AND A REPLAY WITH NO SLICES AGREES. */
{
  const pod = {passEmpty: true, seats: [{seatId: "s0", name: "Rob", pilot: "human", ...deck("pr")}, {seatId: "s1", name: "House", pilot: "house", ...deck("ph")}, {seatId: "s2", name: "House 2", pilot: "house", ...deck("pi")}]};
  const storage = memoryStorage(), person = answerer("person");
  let room = await startRoom({storage, matchId: "p", cards, pod, seed: "slices-2", slice: SLICE});
  let refusedWhile = 0, answered = 0, resumed = 0;
  for (let guard = 0; guard < 20000 && room.status !== "finished"; guard += 1) {
    if (room.continuing) {
      if (refusedWhile === 0) {
        const v = room.view("s0");
        eq([v.continuing, v.waitingOn, v.decision], [true, null, null], "while the AI seats play on, the view says so and asks nobody");
        await refuses(room.act("s0", {actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: "x", indices: [0]}), 409, /not your decision/, "a person cannot answer then");
        await refuses(room.leave("s0", "conceded"), 409, /still taking their turns \(turn \d+\)\. You can leave the game once they stop, in a few seconds/, "nor leave: the refusal says why, and when to try again");
        await refuses(room.end("s0"), 409, /You can end the game once they stop/, "nor end the game for everyone");
        ok(room.continuing && room.view("s0").departures.s0 === undefined, "and the refusals changed nothing");
        refusedWhile += 1;
      }
      await room.resume(); resumed += 1;
      if (resumed % 5 === 0) room = await openRoom({storage, matchId: "p", cards, slice: SLICE});
      continue;
    }
    if (!room.waitingOn) break;
    const v = room.view("s0");
    await room.act("s0", {actionId: randomUUID(), revision: v.revision, ...person(v.decision)});
    answered += 1;
  }
  ok(room.status === "finished" && answered > 10 && resumed > 10, `the game ran to its end: ${answered} of Rob's answers, ${resumed} slices played on between them`);
  const proof = await replayMatch({storage, matchId: "p", cards});
  ok(proof.same, `replayed from its seed and Rob's ${proof.tape} answers with no slices at all, it is the same game`);
}

/* 3. THE TABLE'S OBJECT: THE ALARM PLAYS THE NEXT SLICE. */
{
  const ROB = "rob@example.com", map = new Map(), sockets = [], alarms = [];
  let clock = Date.parse("2026-10-05T21:00:00Z"), seq = 0;
  const random = (n) => {seq += 1; return new Uint8Array(n).map((_, i) => (seq * 13 + i * 5) % 256);};
  const ctx = {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
    list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async (t) => {alarms.push(t);}, deleteAlarm: async () => {alarms.push(null);}},
  acceptWebSocket: (s, tags) => {s.tags = tags; sockets.push(s);}, getWebSockets: () => sockets, getTags: (s) => s.tags};
  const object = new GameTable(ctx, {}, {cards, random, now: () => clock, slice: SLICE});
  const call = async (path, body) => (await object.fetch(new Request(`https://table.internal${path}`, {method: body === undefined ? "GET" : "POST", headers: {"content-type": "application/json", "x-crankmagic-email": ROB}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})}))).json();
  await call("/table/create", {tableId: "tableslice1", hostName: "Rob", seats: [{kind: "ai", name: "House"}, {kind: "ai", name: "House 2"}]});
  await call("/table/deck", {seatId: 0, deck: deck("tr")}); await call("/table/deck", {seatId: 1, deck: deck("th")}); await call("/table/deck", {seatId: 2, deck: deck("ti")});
  await call("/table/ready", {ready: true});
  await call("/table/start", {});
  clock += 10000; await object.alarm();
  eq((await call("/table")).table.phase, "playing", "the alarm launches the game");
  const rob = {frames: [], send(f) {this.frames.push(JSON.parse(f));}, close() {}};
  await object.load(); object.accept(rob, "s0");
  /* Rob answers until a slice runs out with nobody asked (his own answers' AI turns, with this small a slice). */
  const person = answerer("table-person");
  let room = await object.load();
  for (let guard = 0; guard < 500 && !room.continuing && room.waitingOn === "s0"; guard += 1) {
    const v = room.view("s0");
    await object.webSocketMessage(rob, JSON.stringify({type: "act", actionId: randomUUID(), revision: v.revision, ...person(v.decision)}));
  }
  ok(room.continuing, "with this small a slice, one of Rob's answers leaves the AI seats playing on");
  eq(alarms.at(-1), clock, "and the object sets its alarm for now, to play the next slice");
  const ended = await object.fetch(new Request("https://table.internal/table/end", {method: "POST", headers: {"content-type": "application/json", "x-crankmagic-email": ROB}, body: "{}"}));
  eq([ended.status, /still taking their turns/.test((await ended.json()).error)], [409, true], "End game then is refused over the object too, saying why");
  let rang = 0;
  while ((await object.load()).continuing && rang < 2000) {clock += 1; await object.alarm(); rang += 1;}
  ok(rang >= 1 && !(await object.load()).continuing && (await object.load()).waitingOn === "s0", `the alarm played on (${rang} slice${rang === 1 ? "" : "s"}) until Rob was asked again`);
  ok(alarms.at(-1) === null, "and with nothing left to play on and no clock running, the alarm is cleared");
  ok(rob.frames.filter((f) => f.type === "view").length >= 2, "Rob's socket was sent the views as the AI seats played");
  /* His connection drops while the AI seats play on, and stays down past his five minutes: the alarm that rings then
     plays on first, and his time running out waits until they stop, rather than failing the alarm. */
  room = await object.load();
  for (let guard = 0; guard < 500 && !room.continuing && room.waitingOn === "s0"; guard += 1) {
    const v = room.view("s0");
    await object.webSocketMessage(rob, JSON.stringify({type: "act", actionId: randomUUID(), revision: v.revision, ...person(v.decision)}));
  }
  ok(room.continuing, "another of Rob's answers leaves the AI seats playing on");
  await object.webSocketClose(rob, 1001);
  clock += 5 * 60 * 1000;
  await object.table.tick(clock);
  ok((await object.load()).continuing && (await object.load()).view("s0").departures.s0 === undefined, "his time ran out mid-slice: the table's clock waits for the AI seats, and fails nothing");
  let waited = 0;
  while ((await object.load()).view("s0").departures.s0 === undefined && waited < 2000) {clock += 1; await object.alarm(); waited += 1;}
  eq((await object.load()).view("s0").departures.s0, "timed-out", `once the AI seats stopped, his time running out conceded him (${waited} more alarm${waited === 1 ? "" : "s"})`);
  /* The two AI seats play the rest of the game alone, slice by slice, on the alarm. */
  let more = 0;
  while ((await object.load()).continuing && more < 20000) {clock += 1; await object.alarm(); more += 1;}
  const last = (await object.load()).view("s0");
  ok(more > 5 && last.status === "finished", `the rest of the game, AI seats alone, played on over ${more} alarms to its end (${last.result.winner} won)`);
  eq(alarms.at(-1), null, "and then the alarm is cleared");
}

console.log(`room-slices: ${checks} checks passed -- a room played in slices is the same game, a person's decisions and a replay agree with it, leaving and ending wait for the AI seats with instructions, and the table's alarm plays each slice.`);
