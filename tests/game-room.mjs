/* THE GAME ROOM (M5): one match, the whole state held in one place, and each seat shown only its own view
 * (game/room/room.mjs, cloud/game-room.mjs).
 *
 * The decks are the engine gate's own: lands, vanilla creatures and a commander per seat, each seat's card
 * names its own, so a name that reaches the wrong seat is a leak anyone can see. Two people and two house
 * pilots play; the people answer with the random-legal pilot, from a stream of their own, through the same
 * action envelope a browser sends.
 *
 *   Hidden     every view and every frame a seat receives holds no card that is only in another seat's
 *              hand or library; a hand is its owner's; a library is no one's.
 *   Decisions  only the seat being asked can answer; a stale revision, a bad answer and a reused id are
 *              refused without changing anything; a retry is answered from its receipt.
 *   Stored     the same seed and the same answers give the same game, and a room reopened from its storage
 *              at any decision (the object evicted and woken) is that same game.
 *   Refused    a pod with a card the engine cannot play is refused by name, before anything is written.
 *   Carried    over the Durable Object: each seat's socket receives only that seat's view, and a woken
 *              object carries on.
 */
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {memoryStorage} from "../game/engine/storage.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {startRoom, openRoom, RoomError, basicCards} from "../game/room/room.mjs";
import {GameRoom, objectStorage} from "../cloud/game-room.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

/* The room imports nothing a Worker lacks. */
for (const f of ["game/room/room.mjs", "cloud/game-room.mjs"]) {
  const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  ok(!/from\s+["'](node:|fs|path|os|child_process|worker_threads)/.test(src) && !/\brequire\(|\bprocess\./.test(src), `${f} imports nothing a Worker lacks`);
}

/* THE DECKS: each seat's names its own. */
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
const TURNS = 12;

/* WHAT A SEAT MUST NOT SEE: every name in another seat's hand or library that is nowhere public. */
function everyString(v, out = new Set()) {
  if (typeof v === "string") out.add(v);
  else if (Array.isArray(v)) v.forEach((x) => everyString(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => everyString(x, out));
  return out;
}
const hiddenFrom = (state, seat) => {
  const pub = new Set(), hidden = new Set();
  for (const o of Object.values(state.objects)) {
    const z = o.zone;
    if (z === "hand" || z === "library") {if (o.owner !== seat || z === "library") hidden.add(o.card);}
    else pub.add(o.card);
  }
  for (const n of pub) hidden.delete(n);
  for (const o of Object.values(state.objects)) if (o.zone === "hand" && o.owner === seat) hidden.delete(o.card);
  return hidden;
};
let leakChecks = 0;
function assertHidden(room, state, seatId, frame) {
  const seat = room.seats.findIndex((s) => s.seatId === seatId);
  const seen = everyString(frame), secret = hiddenFrom(state, seat);
  const leaked = [...secret].filter((n) => seen.has(n));
  if (leaked.length) assert.fail(`seat ${seatId} was sent ${leaked.slice(0, 3).join(", ")}, which only another seat's hand or a library holds`);
  const v = frame.view ?? frame;
  if (v.state) v.state.players.forEach((p, i) => {
    if (i !== seat && (p.zones?.Hand?.cards?.length ?? 0) > 0) assert.fail(`seat ${seatId} was sent seat ${i}'s hand`);
    if ((p.zones?.Library?.cards?.length ?? 0) > 0) assert.fail(`seat ${seatId} was sent a library's cards`);
  });
  leakChecks += 1;
}

/* The engine's state, read from the room's own storage, for the test's eyes only: the room never hands it out. */
const rawFrom = (storage, matchId) => async () => JSON.parse(await storage.get(`match/${matchId}/checkpoint/${String(JSON.parse(await storage.get(`match/${matchId}/checkpoint/latest`)).sequence).padStart(10, "0")}`)).state;

/* A person at the table: answers the decision they are shown, from their own stream. */
function person(seed) {
  const pilot = randomLegalPilot(createRng(seed));
  return (decision) => {
    const a = pilot.answer(decision);
    return {kind: "answer", choiceId: decision.id, ...(a.indices ? {indices: a.indices} : {}), ...(a.amounts ? {amounts: a.amounts} : {}), ...(a.value !== undefined ? {value: a.value} : {})};
  };
}

/* Play a room until the turn limit, or its end; `every` sees each decision; `reopen` swaps in a woken room. */
async function play(room, {storage, matchId, every, reopenEvery = 0}) {
  const people = Object.fromEntries(HUMANS.map((h) => [h, person(`person-${h}`)]));
  let n = 0;
  for (;;) {
    const who = room.waitingOn;
    if (!who) break;
    const view = room.view(who);
    if (view.state.turn > TURNS) break;
    await every?.(room, view);
    const request = {actionId: randomUUID(), revision: view.revision, ...people[who](view.decision)};
    await room.act(who, request);
    n += 1;
    if (reopenEvery && n % reopenEvery === 0) room = await openRoom({storage, matchId, cards});
  }
  return {room, decisions: n};
}

try {
  /* 1. A game, played through, every view checked. */
  const storage = memoryStorage(), raw = rawFrom(storage, "m1");
  let room = await startRoom({storage, matchId: "m1", cards, pod: POD, seed: "seed-1"});
  eq(room.seats.map((s) => [s.seatId, s.pilot]), [["rob", "human"], ["maya", "human"], ["ai-1", "house"], ["ai-2", "house"]], "the room seats two people and two house pilots");
  ok(HUMANS.includes(room.waitingOn), "the house pilots decided for themselves; the room waits on a person");
  const first = room.view(room.waitingOn);
  eq([first.schema, first.status, first.decision !== null], ["CrankRoomView@1", "playing", true], "the person asked is shown the decision");
  const other = HUMANS.find((h) => h !== room.waitingOn);
  eq(room.view(other).decision, null, "the other person is shown no decision");
  let houseAsked = 0;
  const played = await play(room, {storage, matchId: "m1", every: async (r, v) => {
    for (const s of r.seats) assertHidden(r, await raw(), s.seatId, r.view(s.seatId));
    if (v.decision.kind === "priority") ok(v.decision.options.some((o) => o.label === "Pass priority"), "priority is a decision, and passing is one of its options");
  }});
  room = played.room;
  ok(played.decisions > 50, `the people made ${played.decisions} decisions, each through the action envelope`);
  ok(leakChecks > 200, `and at every one, all four seats' views held nothing of another seat's hand or any library (${leakChecks} views checked)`);

  /* 2. Decisions: only the seat asked; stale, bad and reused refused, changing nothing. */
  const s2 = memoryStorage(), raw2 = rawFrom(s2, "m2");
  const r2 = await startRoom({storage: s2, matchId: "m2", cards, pod: POD, seed: "seed-2"});
  const asked = r2.waitingOn, notAsked = HUMANS.find((h) => h !== asked), v2 = r2.view(asked);
  const before = hashState(await raw2());
  const refuse = async (seat, req, status, re, msg) => {
    await assert.rejects(r2.act(seat, req), (e) => e instanceof RoomError && e.status === status && re.test(e.message), msg); checks += 1;
  };
  const good = {actionId: randomUUID(), revision: v2.revision, ...person("x")(v2.decision)};
  await refuse(notAsked, {...good, actionId: randomUUID()}, 409, /not your decision/, "a seat that is not being asked cannot answer, even with the right revision");
  await refuse("ai-1", {...good, actionId: randomUUID()}, 409, /not your decision/, "nor can anyone speak for a house pilot's seat");
  await refuse("nobody", good, 403, /not at this table/, "a seat that is not at the table is refused");
  await refuse(asked, {...good, actionId: randomUUID(), revision: v2.revision - 1}, 409, /board changed/, "a stale revision is refused with the board's own words");
  await refuse(asked, {...good, actionId: randomUUID(), indices: [999]}, 409, /./, "an answer outside the choice is refused");
  await refuse(asked, {...good, actionId: "not-a-uuid"}, 400, /Invalid action id/, "and one without a proper action id");
  eq([hashState(await raw2()), r2.revision, r2.waitingOn], [before, v2.revision, asked], "none of that changed the game");
  const accepted = await r2.act(asked, good);
  eq([accepted.changed, accepted.receipt.accepted, accepted.receipt.actionId], [true, true, good.actionId], "the right seat's answer is accepted, with a receipt");
  const after = hashState(await raw2()), revision = r2.revision;
  const retry = await r2.act(asked, good);
  eq([retry.changed, retry.receipt, hashState(await raw2()), r2.revision], [false, accepted.receipt, after, revision], "a retry returns the same receipt and applies nothing");
  await refuse(notAsked, good, 409, /reused/, "the same action id from another seat is refused");
  /* The retry arrives late: the room was evicted and woken, and someone else is being asked by now. */
  let r2b = r2;
  const next = person("late");
  for (let i = 0; i < 400 && r2b.waitingOn === asked; i += 1) {const v = r2b.view(asked); await r2b.act(asked, {actionId: randomUUID(), revision: v.revision, ...next(v.decision)});}
  ok(r2b.waitingOn && r2b.waitingOn !== asked, "play moves on until another seat is asked");
  r2b = await openRoom({storage: s2, matchId: "m2", cards});
  const late = await r2b.act(asked, good);
  eq([late.changed, late.receipt], [false, accepted.receipt], "a retry that arrives after the room was woken, while another seat is asked, still gets its receipt and applies nothing");
  await refuse(asked, {...good, indices: [0, 1]}, 409, /reused/, "and from the same seat with other content");

  /* 3. Stored: same seed, same answers, same game; reopened at every tenth decision, still the same game. */
  const run = async (matchId, reopenEvery) => {
    const s = memoryStorage();
    const r = await startRoom({storage: s, matchId: "same", cards, pod: POD, seed: "seed-3"});
    const out = await play(r, {storage: s, matchId: "same", reopenEvery});
    return {hash: hashState(await rawFrom(s, "same")()), decisions: out.decisions, view: out.room.view("rob"), journal: (await s.list("match/same/journal/")).length, checkpoints: (await s.list("match/same/checkpoint/")).length};
  };
  const once = await run("same", 0), again = await run("same", 0), woken = await run("same", 10);
  eq([again.hash, again.decisions], [once.hash, once.decisions], "the same seed and the same answers give the same game");
  eq([woken.hash, woken.decisions, woken.view], [once.hash, once.decisions, once.view], `a room reopened from storage every ten decisions is the same game, at the same question (${once.decisions} decisions)`);
  eq(woken.journal, once.journal, "and its journal holds every event once, across the reopenings");
  eq(once.checkpoints, 2, "storage keeps one checkpoint and the pointer to it, not one per decision");
  const again2 = memoryStorage();
  await startRoom({storage: again2, matchId: "once", cards, pod: POD, seed: "s"});
  await assert.rejects(startRoom({storage: again2, matchId: "once", cards, pod: POD, seed: "s"}), (e) => e.status === 409, "a table with a game cannot start a second"); checks += 1;
  await assert.rejects(openRoom({storage: memoryStorage(), matchId: "none", cards}), (e) => e.status === 404, "an empty table has no game to open"); checks += 1;

  /* 4. Refused by name, before anything is written. */
  const s4 = memoryStorage();
  const pod4 = {seats: [{seatId: "a", commander: ["Krenko, Mob Boss"], cards: ["Mountain", "Sol Ring", "Mountain"]}, {seatId: "b", commander: [], cards: ["Island", "Counterspell"]}]};
  const refusal = await startRoom({storage: s4, matchId: "m4", pod: pod4, seed: "s"}).catch((e) => e);
  eq([refusal.status, refusal.unsupported], [422, ["Counterspell", "Krenko, Mob Boss", "Sol Ring"]], "a pod with cards the engine cannot play is refused, naming each, basic lands allowed");
  eq(await s4.list(""), [], "and nothing was written");
  for (const [pod, why] of [[{seats: [POD.seats[0]]}, "one seat"], [{seats: [...POD.seats, {...POD.seats[0], seatId: "fifth"}]}, "five seats"], [{seats: [POD.seats[0], POD.seats[0]]}, "a seat id twice"]]) {
    await assert.rejects(startRoom({storage: memoryStorage(), matchId: "p", cards, pod, seed: "s"}), (e) => e.status === 400, `a pod with ${why} is refused`); checks += 1;
  }

  /* 5. Carried over the Durable Object: each socket its own seat's view; a woken object carries on. */
  const map = new Map();
  const doStorage = {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k), list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort())};
  const sockets = [];
  const ctx = {storage: doStorage, acceptWebSocket: (s, tags) => {s.tags = tags; sockets.push(s);}, getWebSockets: () => sockets, getTags: (s) => s.tags};
  const socket = () => ({frames: [], send(f) {this.frames.push(JSON.parse(f));}, close() {}});
  let object = new GameRoom(ctx, {}, {cards});
  const post = (o, path, body, seat) => o.fetch(new Request(`https://room.internal${path}`, {method: body ? "POST" : "GET", headers: {"content-type": "application/json", ...(seat ? {"x-crankmagic-seat": seat} : {})}, ...(body ? {body: JSON.stringify(body)} : {})}));
  eq((await post(object, "/view", null, "rob")).status, 404, "before a game starts, the object has none");
  const started = await post(object, "/start", {matchId: "do-1", seed: "seed-5", pod: POD});
  eq([started.status, (await started.json()).seats.length], [201, 4], "POST /start sets the table");
  eq((await post(object, "/start", {matchId: "do-1", seed: "seed-5", pod: POD})).status, 409, "and a second start is refused");
  const bad = await post(new GameRoom({...ctx, storage: {get: async () => undefined, put: async () => {}, delete: async () => false, list: async () => new Map()}}, {}), "/start", {matchId: "do-2", seed: "s", pod: pod4});
  eq([bad.status, (await bad.json()).unsupported.length], [422, 3], "over the object, an unplayable pod is refused by name too");
  eq((await post(object, "/view", null, "stranger")).status, 403, "a seat that is not at the table gets no view");
  const byRoom = {rob: socket(), maya: socket(), "ai-1": socket()};
  for (const [seat, s] of Object.entries(byRoom)) object.accept(s, seat);
  eq(Object.entries(byRoom).map(([seat, s]) => [s.frames.length, s.frames[0].type, s.frames[0].view.seatId]), [[1, "view", "rob"], [1, "view", "maya"], [1, "view", "ai-1"]], "a socket is sent its own seat's view as it connects");
  const rawDo = rawFrom(objectStorage(doStorage), "do-1");
  for (let i = 0; i < 40; i += 1) {
    object = i % 7 === 6 ? new GameRoom(ctx, {}, {cards}) : object;  /* evicted and woken now and then */
    const current = (await object.load()).waitingOn;
    if (!current) break;
    const s = byRoom[current], v = s.frames.filter((f) => f.type === "view").at(-1).view;
    const counts = Object.fromEntries(Object.entries(byRoom).map(([k, x]) => [k, x.frames.length]));
    await object.webSocketMessage(s, JSON.stringify({type: "act", actionId: randomUUID(), revision: v.revision, ...person(`ws-${i}`)(v.decision)}));
    const receipt = s.frames.slice(counts[current]).find((f) => f.type === "receipt");
    ok(receipt && receipt.receipt.accepted, "the sender gets its receipt");
    for (const [seat, x] of Object.entries(byRoom)) {
      const fresh = x.frames.slice(counts[seat]).filter((f) => f.type === "view");
      ok(fresh.length === 1 && fresh[0].view.seatId === seat, `after an action, ${seat}'s socket gets one view, its own`);
      assertHidden(await object.load(), await rawDo(), seat, fresh[0]);
      if (seat !== current) ok(!x.frames.slice(counts[seat]).some((f) => f.type === "receipt"), "and no one else's receipt");
    }
  }
  const stale = byRoom.rob.frames.length;
  await object.webSocketMessage(byRoom.rob, JSON.stringify({type: "act", actionId: randomUUID(), revision: 0, kind: "answer", choiceId: "nope", indices: [0]}));
  const refusedFrame = byRoom.rob.frames.slice(stale).find((f) => f.type === "refused");
  ok(refusedFrame && refusedFrame.view.seatId === "rob", "a refused action is answered with why, and the sender's fresh view");
  await object.webSocketMessage(byRoom.rob, "{not json");
  eq(byRoom.rob.frames.at(-1).type, "refused", "a message that is not JSON is refused");
  await object.webSocketMessage(byRoom.rob, JSON.stringify({type: "view", pad: "x".repeat(20000)}));
  eq(byRoom.rob.frames.at(-1).type, "refused", "and one far larger than an action, even well-formed");
} finally {
  /* nothing to close: all in memory */
}
console.log(`game-room: ${checks} checks passed — one match per room, every seat shown only its own view (${leakChecks} views checked), decisions only from the seat asked, the same game after any reopening, unplayable cards refused by name.`);
