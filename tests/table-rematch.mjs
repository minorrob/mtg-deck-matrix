/* PLAY AGAIN (Requests row 12, Linear ROB-167): once a table's game is over, each person answers Play again -- Yes,
 * another game, or No, which is leaving the table -- and the people who stay play the next game with the same seats,
 * decks and rules (game/room/table.mjs `rematch` and `decideRematch`; the lifecycle's `rematch-vote`, `rematch-deadline`
 * and `next-selection` in game/contracts/table-lifecycle.mjs; cloud/game-room.mjs GameTable; cloud/tables.mjs).
 *
 *   Round     one person and three AI seats: the AI seats say yes by themselves, the person's Yes starts the next game's
 *             countdown with everyone ready, and it launches as the table's next match, same decks, same rules.
 *   Decline   a person's No releases their seat -- released, never refused: the next countdown starts without them --
 *             and they are no longer at the table; the others play on. An answer can change until it is decided.
 *   Deadline  two minutes, on the object's alarm: silence is a No.
 *   Over      the host's No, the host having left the game, or fewer than two seats staying: the table's games are over,
 *             and it says why and what to do.
 *   Refused   with no game played, mid-game, without a seat, having left the game, once decided, with no yes or no.
 *   Ended     a game the room finished on its own, over a socket, wakes the alarm, and the table moves on to Play again.
 *   Door      POST /api/tables/:id/rematch {accept} reaches the table through the Worker, as the other actions do.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {basicCards} from "../game/room/room.mjs";
import {tableOn, REMATCH_WINDOW} from "../game/room/table.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {GameTable} from "../cloud/game-room.mjs";
import {handle} from "../cloud/worker.mjs";
import {forgetKeys} from "../cloud/access.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const refuses = async (p, status, re, m) => {await assert.rejects(p, (e) => e.status === status && (!re || re.test(e.message)), m); checks += 1;};

/* Decks whose card names are each seat's own (as tests/game-table.mjs builds them). */
const DEFS = new Map();
const def = (name, d) => {DEFS.set(name, d); return name;};
const cards = (name) => DEFS.get(name) ?? basicCards(name);
const deckFor = (tag) => ({name: `${tag} deck`, commander: [def(`General ${tag}`, {types: ["Creature"], supertypes: ["Legendary"], power: 3, toughness: 3, manaCost: "{2}{G}"})],
  cards: [...Array.from({length: 38}, () => def(`Grove ${tag}`, {types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]})),
    ...Array.from({length: 61}, (_, i) => def(`Bear ${tag}-${i}`, {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}"}))]});
let seq = 0;
const random = (n) => {seq += 1; return new Uint8Array(n).map((_, i) => (seq * 29 + i * 11) % 256);};
const answerer = (seed) => {const p = randomLegalPilot(createRng(seed)); return (d) => {const a = p.answer(d); return {kind: "answer", choiceId: d.id, ...(a.indices ? {indices: a.indices} : {}), ...(a.amounts ? {amounts: a.amounts} : {}), ...(a.value !== undefined ? {value: a.value} : {})};};};

const ROB = "rob@example.com", MAYA = "maya@example.com", SAM = "sam@example.com", EVE = "eve@example.com";
const now = Date.parse("2026-10-20T20:00:00Z");

/* A table whose first game is on: Rob hosts in seat 1, the guests (Maya, then Sam) join the person's seats, every deck
   is chosen, everyone is ready, and the countdown launches it. */
async function playing(t, tableId, others, {rules} = {}) {
  await t.create({tableId, host: ROB, hostName: "Rob", seats: others});
  if (rules) await t.rules(ROB, rules, now);
  const guests = [MAYA, SAM];
  for (const [i, s] of others.entries()) {
    const seatId = i + 1;
    if (s.kind === "ai") {await t.deck(ROB, seatId, deckFor(`${tableId}${seatId}`), now); continue;}
    const who = guests.shift();
    await t.join(who, (await t.invite(ROB, seatId, now)).code, now);
    await t.deck(who, seatId, deckFor(`${tableId}${seatId}`), now);
    await t.ready(who, true, now);
  }
  await t.deck(ROB, 0, deckFor(`${tableId}0`), now);
  await t.ready(ROB, true, now);
  await t.start(ROB, now);
  const matchId = await t.tick(now + 10000);
  assert.ok(matchId, `${tableId}: the first game launched`);
  return matchId;
}
const votes = (view) => view.rematch.votes.map((v) => v.vote);

/* The table as a Durable Object, over a stand-in for the platform's context. */
function objectCtx() {
  const map = new Map(), sockets = [], alarms = [];
  return {alarms, storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
    list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async (at) => {alarms.push(at);}, deleteAlarm: async () => {alarms.push("deleted");}},
  acceptWebSocket: (s, tags) => {s.tags = tags; sockets.push(s);}, getWebSockets: () => sockets.filter((s) => !s.closed), getTags: (s) => s.tags};
}
const caller = (object) => async (method, path, email, body) => {
  const r = await object.fetch(new Request(`https://table.internal${path}`, {method, headers: {"content-type": "application/json", ...(email ? {"x-crankmagic-email": email} : {})}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})}));
  return {status: r.status, json: await r.json()};
};
const sock = () => ({tags: null, frames: [], closed: false, send(f) {this.frames.push(JSON.parse(f));}, close() {this.closed = true;}});

eq(REMATCH_WINDOW, 2 * 60 * 1000, "a finished game's players have two minutes to answer Play again");

/* 1. ONE PERSON AND THREE AI SEATS: THE NEXT GAME, SAME SEATS, SAME DECKS, SAME RULES, A NEW MATCH. */
{
  const storage = memoryStorage(), t = tableOn(storage, {cards, random});
  const first = await playing(t, "againsolo1", [{kind: "ai", name: "Ann"}, {kind: "ai", name: "Ben"}, {kind: "ai", name: "Cy"}], {rules: {startingLife: 30}});
  eq(first, "againsolo1g1", "the first game is the table's first match");
  const during = await t.view(ROB);
  eq(during.rematch, null, "while the game is on there is no Play again in the table's view");
  await refuses(t.rematch(ROB, true, now + 11000), 409, /^The game is still being played, so there is no Play again to answer yet\. Answer it once the game is over\.$/,
    "a Play again answer mid-game is refused, saying when to answer");
  const endedAt = now + 20000;
  await t.endGame(ROB, endedAt);
  const asked = await t.view(ROB);
  eq([asked.phase, asked.rematch], ["rematch", {lastMatchId: first, deadline: endedAt + REMATCH_WINDOW, outcome: "waiting", reason: null,
    votes: [{seatId: 0, vote: "pending"}, {seatId: 1, vote: "yes"}, {seatId: 2, vote: "yes"}, {seatId: 3, vote: "yes"}]}],
  "the game over, the table asks Play again: the game it follows, the deadline two minutes on, and each seat's answer -- the AI seats have said yes by themselves, Rob has not answered");
  eq(await t.nextAlarm(endedAt), endedAt + REMATCH_WINDOW, "the table's next alarm is the deadline");
  await refuses(t.rematch(ROB, "yes", endedAt + 1000), 400, /^Answer Play again with accept: true for another game, or false to leave the table\.$/,
    "an answer is true or false, and anything else is refused, saying how to answer");
  await refuses(t.rematch(EVE, true, endedAt + 1000), 403, /^You do not have a seat at this table\.$/, "someone with no seat has no answer to give");
  const again = await t.rematch(ROB, true, endedAt + 5000);
  eq([again.phase, again.rematch, again.countdownAt, again.seats.map((s) => s.ready)], ["countdown", null, endedAt + 15000, [true, true, true, true]],
    "Rob's Yes is the last answer: the next game's ten-second countdown starts, every seat ready -- his Yes is his Ready");
  eq(again.seats.map((s) => s.deck), during.seats.map((s) => s.deck), "every seat keeps the deck it brought");
  eq(await t.nextAlarm(endedAt + 5000), endedAt + 15000, "the table's next alarm is the countdown's end");
  await refuses(t.rematch(ROB, false, endedAt + 6000), 409, /^There is no Play again to answer: this table's next game is already being set up\. Use Ready in the lobby instead\.$/,
    "once decided there is no Play again to answer, and the refusal says what to use instead");
  eq(await t.tick(endedAt + 14999), null, "nothing launches before the countdown ends");
  const second = await t.tick(endedAt + 15000);
  const live = await t.view(ROB);
  eq([second, live.phase, live.matchId], ["againsolo1g2", "playing", "againsolo1g2"], "then the next game launches as the table's next match, a fresh match id");
  const meta = async (id) => createMatchStore(storage, id).loadMatch();
  const [a, b] = [await meta(first), await meta(second)];
  const seatsOf = (pod) => pod.seats.map(({seatId, name, pilot, level, commander, cards: list}) => ({seatId, name, pilot, level, commander, list}));
  ok(b.pod.seats.length === 4 && b.pod.seats.every((s, i) => s.commander[0] === `General againsolo1${i}` && s.cards.length === 99), "the next game's pod has every seat's whole deck");
  eq(seatsOf(b.pod), seatsOf(a.pod), "the same four seats, each with the same deck, card for card");
  eq([a.pod.startingLife, b.pod.startingLife], [30, 30], "and the table's rules: the host's 30 life");
  ok(a.seed !== b.seed, "and a new shuffle");
  eq((await t.currentRoom()).view("s0").state.players.map((p) => p.health.life), [30, 30, 30, 30], "the new game is on at 30 life");
}

/* 2. TWO PEOPLE AND AN AI SEAT: A NO RELEASES THE SEAT, THE OTHERS PLAY ON. */
{
  const storage = memoryStorage(), t = tableOn(storage, {cards, random});
  await playing(t, "againpair1", [{kind: "human", name: "Maya"}, {kind: "ai", name: "Bot"}]);
  await t.mat(MAYA, "sea");
  await t.dropped(1, now + 11000);
  eq((await t.view(ROB)).seats[1].connected, false, "Maya's connection drops during the game");
  const endedAt = now + 30000;
  await t.endGame(ROB, endedAt);
  eq(votes(await t.view(ROB)), ["pending", "pending", "yes"], "both people are asked; the AI seat has said yes");
  const yes = await t.rematch(MAYA, true, endedAt + 1000);
  eq([yes.seats[1].connected, votes(yes), yes.phase], [true, ["pending", "yes", "yes"], "rematch"],
    "Maya answers from the lobby, which holds no socket: answering is being here, so her seat is connected again, and the table waits for Rob");
  const no = await t.rematch(MAYA, false, endedAt + 2000);
  eq([votes(no), no.yourSeat], [["pending", "no", "yes"], 1], "an answer can change until everyone has answered: she makes hers No, and until it is decided she keeps her seat");
  const decided = await t.rematch(ROB, true, endedAt + 3000);
  const gone = decided.seats[1];
  eq([decided.phase, gone.occupied, gone.deck, gone.mat, gone.ready], ["countdown", false, null, "felt", false],
    "Rob's Yes decides it: Maya's seat is released -- empty, its deck and mat gone with her -- and the next game counts down without her (released, never refused: U-09)");
  eq(decided.seats.map((s) => s.ready), [true, false, true], "Rob and the AI seat are ready");
  await refuses(t.view(MAYA), 403, null, "Maya is no longer at the table");
  await refuses(t.rematch(MAYA, true, endedAt + 4000), 403, /^You do not have a seat at this table\.$/, "and has no answer left to give");
  await t.dropped(0, endedAt + 5000);
  const counting = await t.view(ROB);
  eq([counting.phase, counting.seats[0].connected], ["countdown", true],
    "the socket of the game just over closing as Rob turns to the lobby is not his leaving: his seat stays connected, and the countdown runs on");
  const second = await t.tick(endedAt + 13000);
  eq(second, "againpair1g2", "the next game launches");
  eq((await createMatchStore(storage, second).loadMatch()).pod.seats.map((s) => s.seatId), ["s0", "s2"], "Rob and the AI seat play on");
  const code = (await t.invite(ROB, 1, endedAt + 14000)).code;
  ok(typeof code === "string" && code.length >= 40, "and the host may invite someone else to the chair she left");
}

/* 3. THE DEADLINE, ON THE OBJECT'S ALARM: SILENCE IS A NO. */
{
  const ctx = objectCtx();
  let clock = now;
  const object = new GameTable(ctx, {}, {cards, random, now: () => clock}), call = caller(object);
  await call("POST", "/table/create", ROB, {tableId: "againclock1", hostName: "Rob", seats: [{kind: "human", name: "Maya"}, {kind: "ai", name: "Bot"}]});
  await call("POST", "/table/join", MAYA, {code: (await call("POST", "/table/invite", ROB, {seatId: 1})).json.invite.code});
  await call("POST", "/table/deck", ROB, {seatId: 0, deck: deckFor("c0")}); await call("POST", "/table/deck", MAYA, {seatId: 1, deck: deckFor("c1")});
  await call("POST", "/table/deck", ROB, {seatId: 2, deck: deckFor("c2")});
  await call("POST", "/table/ready", ROB, {ready: true}); await call("POST", "/table/ready", MAYA, {ready: true});
  await call("POST", "/table/start", ROB, {});
  clock += 10000; await object.alarm();
  clock += 60000;
  const endedAt = clock;
  await call("POST", "/table/end", MAYA, {});
  eq(ctx.alarms.at(-1), endedAt + REMATCH_WINDOW, "the game over, the object's alarm is set for Play again's deadline");
  const yes = await call("POST", "/table/rematch", ROB, {accept: true});
  eq([yes.status, votes(yes.json.table), ctx.alarms.at(-1)], [200, ["yes", "pending", "yes"], endedAt + REMATCH_WINDOW],
    "Rob says yes over the object; Maya has not answered, and the alarm still waits for the deadline");
  clock = endedAt + REMATCH_WINDOW - 1; await object.alarm();
  eq(votes((await call("GET", "/table", ROB)).json.table), ["yes", "pending", "yes"], "a moment short of two minutes nothing is decided");
  clock = endedAt + REMATCH_WINDOW; await object.alarm();
  const after = (await call("GET", "/table", ROB)).json.table;
  eq([after.phase, after.seats[1].occupied, ctx.alarms.at(-1)], ["countdown", false, clock + 10000],
    "at two minutes Maya's silence is a No: her seat is released, and the next game counts down on the alarm");
  eq((await call("GET", "/table", MAYA)).status, 403, "Maya, who never answered, is no longer at the table");
  clock += 10000; await object.alarm();
  const on = (await call("GET", "/table", ROB)).json.table;
  eq([on.phase, on.matchId], ["playing", "againclock1g2"], "and the alarm launches it, the table's next match");
}

/* 4. A GAME THE ROOM FINISHED ON ITS OWN, OVER A SOCKET: THE ALARM WAKES AT ONCE, AND THE TABLE MOVES ON TO PLAY AGAIN.
   The host's No then ends the table. */
{
  const ctx = objectCtx();
  let clock = now;
  const object = new GameTable(ctx, {}, {cards, random, now: () => clock}), call = caller(object);
  await call("POST", "/table/create", ROB, {tableId: "againroom1", hostName: "Rob", seats: [{kind: "ai", name: "Ann"}]});
  await call("POST", "/table/rules", ROB, {startingLife: 1});
  await call("POST", "/table/deck", ROB, {seatId: 0, deck: deckFor("r0")}); await call("POST", "/table/deck", ROB, {seatId: 1, deck: deckFor("r1")});
  await call("POST", "/table/ready", ROB, {ready: true});
  await call("POST", "/table/start", ROB, {});
  clock += 10000; await object.alarm();
  const room = await object.load(), rob = sock();
  object.accept(rob, "s0");
  const people = answerer("again-room");
  for (let guard = 0; guard < 3000 && room.status !== "finished" && room.waitingOn === "s0"; guard += 1) {
    const v = room.view("s0");
    await object.webSocketMessage(rob, JSON.stringify({type: "act", actionId: randomUUID(), revision: v.revision, ...people(v.decision)}));
  }
  ok(room.status === "finished", `at 1 life the game ends in the room, played over Rob's socket (${room.view("s0").result && room.view("s0").result.reason})`);
  eq([(await call("GET", "/table", ROB)).json.table.phase, ctx.alarms.at(-1)], ["playing", clock], "the table has not been told, so the object's alarm is set for now");
  clock += 5; await object.alarm();
  const asked = (await call("GET", "/table", ROB)).json.table;
  eq([asked.phase, asked.rematch.lastMatchId, votes(asked), ctx.alarms.at(-1)], ["rematch", "againroom1g1", ["pending", "yes"], clock + REMATCH_WINDOW],
    "the alarm moves the table on to Play again, and sets itself for the deadline");
  eq(rob.frames.filter((f) => f.type === "view").at(-1).view.status, "finished", "Rob's socket has the view that says the game is over");
  const no = await call("POST", "/table/rematch", ROB, {accept: false});
  eq([no.status, no.json.table.phase, no.json.table.rematch.outcome, no.json.table.rematch.reason, votes(no.json.table)],
    [200, "rematch", "closed", "The host is not staying for another game, so this table's games are over. Start a new table to play again.", ["no", "yes"]],
    "the host's No ends the table: Play again says so, and what to do");
  eq(ctx.alarms.at(-1), "deleted", "with nothing left to wait for, the alarm is cleared");
  const late = await call("POST", "/table/rematch", ROB, {accept: true});
  eq([late.status, late.json.error], [409, "Play again has been decided. The host is not staying for another game, so this table's games are over. Start a new table to play again."],
    "an answer after it is decided is refused, saying why and what to do");
}

/* 5. WHEN THERE IS NO NEXT GAME. */
{
  /* Two people and no AI seat: one says no, and a game needs two seats. */
  const two = tableOn(memoryStorage(), {cards, random});
  await playing(two, "againtwo1", [{kind: "human", name: "Maya"}]);
  const endedAt = now + 20000;
  await two.endGame(MAYA, endedAt);
  await two.rematch(ROB, true, endedAt + 1000);
  const over = await two.rematch(MAYA, false, endedAt + 2000);
  eq([over.phase, over.rematch.outcome, over.rematch.reason, votes(over)],
    ["rematch", "closed", "Nobody else is staying for another game, and a game needs at least two seats. Start a new table to play again.", ["yes", "no"]],
    "with only Rob staying there is no next game: the table's games are over, and it says why");
  eq([over.yourSeat, over.seats[1].occupied], [1, true], "nobody's seat changes at a table whose games are over");
  eq(await two.nextAlarm(endedAt + 3000), null, "and no deadline is left to wait for");
  await refuses(two.rematch(MAYA, true, endedAt + 4000), 409, /^Play again has been decided\. Nobody else is staying/, "and the answers are final");

  /* The host's No while a guest has yet to answer: decided at once, the guest's answer not waited for. */
  const quick = tableOn(memoryStorage(), {cards, random});
  await playing(quick, "againquick1", [{kind: "human", name: "Maya"}, {kind: "ai", name: "Bot"}]);
  await quick.endGame(ROB, endedAt);
  const closed = await quick.rematch(ROB, false, endedAt + 1000);
  eq([closed.rematch.outcome, votes(closed)], ["closed", ["no", "pending", "yes"]], "the host's No ends the table at once, Maya's answer not waited for");
  eq(await quick.nextAlarm(endedAt + 1000), null, "so the table sets no deadline");
  await quick.tick(endedAt + REMATCH_WINDOW + 1);
  eq(votes(await quick.view(MAYA)), ["no", "pending", "yes"], "and the deadline passing changes nothing at a table whose games are over");
  await refuses(quick.rematch(MAYA, true, endedAt + 2000), 409, /^Play again has been decided\. The host is not staying/, "Maya's Yes is refused, saying why");

  /* The host left the game before it ended: decided as it ends. */
  const left = tableOn(memoryStorage(), {cards, random});
  await playing(left, "againleft1", [{kind: "human", name: "Maya"}, {kind: "ai", name: "Bot"}]);
  await left.concede(ROB, now + 11000);
  eq((await left.view(MAYA)).phase, "playing", "Rob concedes: Maya and the AI seat play on");
  const ended = await left.endGame(MAYA, endedAt);
  eq([ended.phase, ended.rematch.outcome, ended.rematch.reason, await left.nextAlarm(endedAt)],
    ["rematch", "closed", "The host left the game, so this table's games are over. Start a new table to play again.", null],
    "when the game ends without its host, there is no Play again to ask: the table's games are over at once");

  /* The host silent past the deadline. */
  const silent = tableOn(memoryStorage(), {cards, random});
  await playing(silent, "againquiet1", [{kind: "ai", name: "Bot"}]);
  await silent.endGame(ROB, endedAt);
  await silent.tick(endedAt + REMATCH_WINDOW);
  const quiet = await silent.view(ROB);
  eq([quiet.rematch.outcome, votes(quiet)], ["closed", ["no", "yes"]], "the host silent for two minutes has said No, and the table's games are over");
}

/* 6. REFUSED, WITH WHAT TO DO. */
{
  const fresh = tableOn(memoryStorage(), {cards, random});
  await fresh.create({tableId: "againnew1", host: ROB, hostName: "Rob", seats: [{kind: "ai", name: "Bot"}]});
  await refuses(fresh.rematch(ROB, true, now), 409, /^No game has been played at this table yet, so there is no Play again to answer\. Use Ready in the lobby instead\.$/,
    "before any game there is no Play again, and the refusal says what to use");

  /* A person who left the game before it ended. */
  const storage = memoryStorage(), t = tableOn(storage, {cards, random});
  await playing(t, "againgone1", [{kind: "human", name: "Maya"}, {kind: "ai", name: "Bot"}]);
  await t.concede(MAYA, now + 11000);
  await t.endGame(ROB, now + 20000);
  eq(votes(await t.view(ROB)), ["pending", "yes"], "only the seats still in the game when it ended are asked");
  await refuses(t.rematch(MAYA, true, now + 21000), 409, /^You left that game, so the next one is not yours to answer\. Ask the host to invite you again\.$/,
    "Maya, who conceded, has no say in the next game, and is told how to come back");
  const next = await t.rematch(ROB, true, now + 22000);
  eq([next.phase, next.seats[1].occupied], ["countdown", false], "Rob's Yes is the only answer needed: the next game counts down, her seat released");
  await refuses(t.view(MAYA), 403, null, "and she is no longer at the table");

  /* The No that decides it: the person leaving is answered with the table as it now is, no seat in it theirs. */
  const last = tableOn(memoryStorage(), {cards, random});
  await playing(last, "againlast1", [{kind: "human", name: "Maya"}, {kind: "ai", name: "Bot"}]);
  await last.endGame(ROB, now + 20000);
  await last.rematch(ROB, true, now + 21000);
  const leaving = await last.rematch(MAYA, false, now + 22000);
  eq([leaving.phase, leaving.yourSeat, leaving.seats.some((s) => s.you), leaving.seats[1].occupied], ["countdown", null, false, false],
    "Maya's No is the last answer: she is answered with the table as it now is -- the next game counting down, no seat hers");
}

/* 7. THE WORKER'S FRONT DOOR: POST /api/tables/:id/rematch {accept}. */
{
  const TEAM = "crankmagic-test.cloudflareaccess.com", AUD = "aud-library";
  const b64url = (buf) => Buffer.from(buf).toString("base64url");
  const {publicKey, privateKey} = await crypto.subtle.generateKey({name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, ["sign", "verify"]);
  const jwk = {...await crypto.subtle.exportKey("jwk", publicKey), kid: "k1"};
  const token = async (email) => {
    const h = b64url(JSON.stringify({alg: "RS256", kid: "k1", typ: "JWT"}));
    const p = b64url(JSON.stringify({aud: [AUD], iss: `https://${TEAM}`, email, exp: Date.now() / 1000 + 3600, iat: Date.now() / 1000}));
    return `${h}.${p}.${b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${p}`)))}`;
  };
  const fetchImpl = async () => new Response(JSON.stringify({keys: [jwk]}));
  let clock = now;
  const objects = new Map();
  const TABLES = {idFromName: (name) => name, get: (id) => {if (!objects.has(id)) objects.set(id, new GameTable(objectCtx(), {}, {cards, random, now: () => clock})); return objects.get(id);}};
  const env = {ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, DB: {prepare: () => ({bind: () => ({first: async () => null, run: async () => ({})})})}, TABLES};
  forgetKeys();
  const call = async (method, path, {as = ROB, body} = {}) => {
    const init = {method, headers: {"cf-access-jwt-assertion": await token(as), ...(body !== undefined ? {"content-type": "application/json", "x-crankmagic": "play"} : {})}};
    if (body !== undefined) init.body = JSON.stringify(body);
    const r = await handle(new Request(`https://crankmagic.test${path}`, init), env, {fetchImpl});
    return {status: r.status, json: await r.json().catch(() => null)};
  };
  const made = await call("POST", "/api/tables", {body: {hostName: "Rob", seats: [{kind: "ai", name: "Ann"}, {kind: "ai", name: "Ben"}, {kind: "ai", name: "Cy"}]}});
  const id = made.json.table.tableId;
  for (const seatId of [0, 1, 2, 3]) await call("POST", `/api/tables/${id}/deck`, {body: {seatId, deck: deckFor(`door${seatId}`)}});
  await call("POST", `/api/tables/${id}/ready`, {body: {ready: true}});
  await call("POST", `/api/tables/${id}/start`, {body: {}});
  clock += 10000; await objects.get(id).alarm();
  const early = await call("POST", `/api/tables/${id}/rematch`, {body: {accept: true}});
  eq([early.status, /still being played/.test(early.json.error)], [409, true], "through the door, mid-game, Play again is refused in the table's words");
  await call("POST", `/api/tables/${id}/end`, {body: {}});
  eq((await call("GET", `/api/tables/${id}/rematch`)).status, 405, "Play again is a POST");
  eq((await call("POST", `/api/tables/${id}/rematch`, {as: EVE, body: {accept: true}})).status, 403, "a stranger has no answer to give");
  const yes = await call("POST", `/api/tables/${id}/rematch`, {body: {accept: true}});
  eq([yes.status, yes.json.table.phase, yes.json.table.seats.map((s) => s.ready)], [200, "countdown", [true, true, true, true]],
    "one person and three AI seats: Rob's Yes through the Worker's front door starts the next game's countdown");
  clock += 10000; await objects.get(id).alarm();
  const on = (await call("GET", `/api/tables/${id}`)).json.table;
  eq([on.phase, on.matchId], ["playing", `${id}g2`], "and the alarm launches the next match");
}

console.log(`table-rematch: ${checks} checks passed — Play again: one person and three AI seats play the next game with the same seats, decks and rules as a new match; a No releases the seat and the others play on; silence is a No at two minutes, on the alarm; the table's games end when the host goes or too few stay, saying so; and every refusal says what to do.`);
