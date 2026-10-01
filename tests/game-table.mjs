/* THE TABLE (M5): the host and guest journeys Rob approved on 2026-09-26, as rules
 * (game/room/table.mjs, cloud/game-room.mjs GameTable, cloud/tables.mjs, cloud/worker.mjs).
 *
 *   Host    creates a table in seat 1; the others are people to invite or AI seats.
 *   Invite  only the host sends a seat's link; a new link withdraws the old; a link keeps a day; the code is
 *           kept only as a hash.
 *   Join    the invited person lands on that seat and holds only it; a stranger's or a spent code is refused.
 *   Deck    each person brings their own, the host brings the AIs'; an unplayable deck is refused by name;
 *           nobody sees another seat's cards.
 *   Start   only the host; the 10-second countdown waits for every person, a seat unreadying or the host's
 *           Cancel stops it, and nothing launches early; then the room starts and each person has a seat in it.
 *   Door    the Worker is shut without Play's binding, takes writes only from the app, and a table's socket
 *           only from this site; strangers see no table.
 */
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {memoryStorage} from "../game/engine/storage.mjs";
import {basicCards} from "../game/room/room.mjs";
import {replayTape} from "../game/room/replay.mjs";
import {tableOn, INVITE_TTL, MATS, commanderLegal, isBasicLandsTestDeck} from "../game/room/table.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardScripts} from "../game/tools/engine-cards.mjs";
import {GameTable} from "../cloud/game-room.mjs";
import {handle} from "../cloud/worker.mjs";
import {forgetKeys} from "../cloud/access.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const refuses = async (p, status, re, m) => {await assert.rejects(p, (e) => e.status === status && (!re || re.test(e.message)), m); checks += 1;};

/* Decks whose card names are each seat's own, so one reaching another seat shows. */
const DEFS = new Map();
const def = (name, d) => {DEFS.set(name, d); return name;};
const cards = (name) => DEFS.get(name) ?? basicCards(name);
const deckFor = (tag) => ({name: `${tag} deck`, commander: [def(`General ${tag}`, {types: ["Creature"], supertypes: ["Legendary"], power: 3, toughness: 3, manaCost: "{2}{G}"})],
  cards: [...Array.from({length: 38}, () => def(`Grove ${tag}`, {types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]})),
    ...Array.from({length: 61}, (_, i) => def(`Bear ${tag}-${i}`, {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}"}))]});
let seq = 0;
const random = (n) => {seq += 1; return new Uint8Array(n).map((_, i) => (seq * 31 + i * 7) % 256);};
const everyString = (v, out = new Set()) => {if (typeof v === "string") out.add(v); else if (v && typeof v === "object") Object.values(v).forEach((x) => everyString(x, out)); return out;};

const ROB = "rob@example.com", MAYA = "maya@example.com", SAM = "sam@example.com", EVE = "eve@example.com";
let now = Date.parse("2026-09-26T20:00:00Z");

/* 1. THE JOURNEYS, AGAINST THE TABLE ITSELF. */
{
  const storage = memoryStorage(), t = tableOn(storage, {cards, random});
  const made = await t.create({tableId: "tablealpha1", host: ROB, hostName: "Rob", seats: [{kind: "human", name: "Maya"}, {kind: "human", name: "Sam"}, {kind: "ai", name: "Shadrix"}]});
  eq([made.youAreHost, made.yourSeat, made.seats.map((s) => [s.kind, s.occupied])], [true, 0, [["human", true], ["human", false], ["human", false], ["ai", true]]], "the host sits in seat 1; the others wait for a person or are an AI");
  await refuses(t.create({tableId: "tablealpha1", host: ROB, seats: [{kind: "ai"}]}), 409, null, "a table is created once");
  await refuses(tableOn(memoryStorage()).create({tableId: "t", host: ROB, seats: [{kind: "ai"}]}), 400, null, "a table needs a proper id");
  await refuses(tableOn(memoryStorage()).create({tableId: "tableseats1", host: ROB, seats: []}), 400, /two to four/, "and at least one other seat");

  /* Invite. */
  await refuses(t.invite(MAYA, 1, now), 403, /Only the host/, "only the host sends a seat's link");
  await refuses(t.invite(ROB, 0, now), 400, null, "the host's own seat is not invited");
  await refuses(t.invite(ROB, 3, now), 400, null, "nor is an AI seat");
  const first = await t.invite(ROB, 1, now), second = await t.invite(ROB, 1, now);
  ok(first.code !== second.code && first.code.length >= 40, "a link carries a long random code, and a new one for the same seat is different");
  ok(!(await storage.get("table")).includes(second.code), "the table keeps only a hash of the code");
  eq(second.expiresAt - now, INVITE_TTL, "a link keeps a day");
  await refuses(t.join(MAYA, first.code, now), 410, /expired or was withdrawn/, "sending a new link withdrew the first");
  await refuses(t.join(EVE, "made-up", now), 410, /Ask the host for a new link/, "a made-up code is refused, and says what to do");

  /* Join. */
  const joined = await t.join(MAYA, second.code, now);
  eq([joined.yourSeat, joined.youAreHost, joined.seats[1].occupied], [1, false, true], "Maya lands on the seat she was invited to");
  eq((await t.join(MAYA, second.code, now)).yourSeat, 1, "opening the link again, she is already there");
  await refuses(t.join(EVE, second.code, now), 410, null, "a spent code seats no one else");
  const samCode = (await t.invite(ROB, 2, now)).code;
  await refuses(t.join(MAYA, samCode, now), 409, /already have a seat/, "a person holds one seat at a table");
  await refuses(t.view(EVE), 403, null, "someone with no seat sees nothing of the table");
  const late = (await t.invite(ROB, 2, now)).code;
  await refuses(t.join(SAM, late, now + INVITE_TTL + 1), 410, null, "a link used after its day is refused");
  const samLink = (await t.invite(ROB, 2, now)).code;

  /* Mats: every seat starts on felt; a person picks their own from the app's mats, and everyone sees it. */
  ok((await t.view(MAYA)).seats.every((s) => s.mat === "felt"), "every seat starts on felt");
  eq((await t.mat(MAYA, "sea")).seats[1].mat, "sea", "Maya picks the sea for her own seat");
  eq((await t.view(ROB)).seats[1].mat, "sea", "and Rob sees it on her seat");
  await refuses(t.mat(MAYA, "someone-elses-art"), 400, /no such mat/, "a mat that is not one of the app's is refused");
  await refuses(t.mat(EVE, "forge"), 403, null, "someone with no seat picks no mat");
  eq(MATS.slice(0, 5), ["felt", "forge", "cavern", "sea", "night"], "five mats the app draws, felt first");
  eq(MATS.length, 30, "and Rob's own artwork after them (2026-09-29), 25 mats: nobody else's art");
  eq((await t.mat(MAYA, "moon-wolf")).seats[1].mat, "moon-wolf", "one of Rob's artwork mats is chosen like any other, and everyone sees it");
  for (const id of MATS.slice(5)) ok(existsSync(new URL(`../assets/playmats/${id}.webp`, import.meta.url)) && existsSync(new URL(`../assets/playmats/${id}-thumb.webp`, import.meta.url)), `${id} has its picture and its thumbnail`);

  /* Decks. */
  await refuses(t.deck(MAYA, 0, deckFor("maya"), now), 403, null, "a person chooses only their own seat's deck");
  await refuses(t.deck(MAYA, 3, deckFor("maya"), now), 403, null, "and only the host chooses an AI's");
  const bad = await t.deck(MAYA, 1, {name: "x", commander: ["Krenko, Mob Boss"], cards: ["Mountain", "Sol Ring"]}, now).catch((e) => e);
  eq([bad.status, bad.unsupported], [422, ["Krenko, Mob Boss", "Sol Ring"]], "a deck the engine cannot play is refused, naming each card");
  await t.deck(ROB, 0, {...deckFor("rob"), source: {deckId: "deck:rob:1", deckVersion: 4}}, now);
  await t.deck(MAYA, 1, {...deckFor("maya"), source: {deckId: "deck:maya:7", deckVersion: 2}}, now);
  const ai = await t.deck(ROB, 3, {...deckFor("ai"), source: {deckId: "deck:rob:9", deckVersion: 1}}, now);
  /* THE LIBRARY DECK A SEAT BROUGHT (M5, results back to the library): kept so the finished game can be filed
     under it, and shown back to that seat alone. */
  const robSees = await t.view(ROB);
  eq(robSees.seats[0].source, {deckId: "deck:rob:1", deckVersion: 4}, "the host's own seat shows him which of his decks he brought");
  ok(robSees.seats.filter((x) => x.seatId !== 0).every((x) => !("source" in x)) && !JSON.stringify(robSees).includes("deck:maya:7"),
    "and no other seat's source reaches him, the host included: not Maya's, not even the AI's he chose");
  const mayaOwn = await t.view(MAYA);
  ok(mayaOwn.seats[1].source.deckId === "deck:maya:7" && !JSON.stringify(mayaOwn).includes("deck:rob:"), "Maya sees her own deck's source, and none of Rob's");
  const odd = tableOn(memoryStorage(), {cards, random});
  await odd.create({tableId: "oddsource", host: ROB, hostName: "Rob", seats: [{kind: "ai", name: "AI"}]});
  for (const [source, want, why] of [[{deckId: "../etc", deckVersion: 1}, null, "an id that is not an id"], [{deckId: "deck:ok", deckVersion: -2}, {deckId: "deck:ok", deckVersion: null}, "a version that is not a version"], ["deck:ok", null, "a source that is not an object"], [undefined, null, "no source at all"]]) {
    await odd.deck(ROB, 0, {...deckFor("odd"), source}, now);
    eq((await odd.view(ROB)).seats[0].source, want, `a source is read, not trusted: ${why}`);
  }
  eq([ai.seats[3].deck.name, ai.seats[3].ready], ["ai deck", true], "the host brings the AI's deck, and an AI with a deck is ready");
  const mayaSees = await t.view(MAYA);
  eq([mayaSees.seats[0].deck, mayaSees.seats[1].cards], [{name: "rob deck", commander: ["General rob"], bracket: null}, 99], "she sees the host's deck by name, commander and bracket (none sent here), and her own count");
  ok(![...everyString(mayaSees)].some((s) => /Bear rob|Grove rob|Bear ai/.test(s)), "and not one card of anyone else's list");

  /* Start: the rules the host meets. */
  await t.ready(ROB, true, now); await t.ready(MAYA, true, now);
  await refuses(t.start(ROB, now), 409, /Every seat must be ready/, "while Sam's invitation is out and unanswered, the countdown waits for him");
  ok((await t.view(ROB)).blockers.some((b) => b.seatId === 2 && /not joined/.test(b.reason)), "and the table says who it is waiting for");
  await t.join(SAM, samLink, now);
  await t.deck(SAM, 2, deckFor("sam"), now);
  await refuses(t.start(ROB, now), 409, /ready/, "Sam has joined but is not ready: still no countdown");
  await t.ready(SAM, true, now);
  await refuses(t.start(MAYA, now), 403, /Only the host/, "only the host starts it");
  const at = await t.start(ROB, now);
  eq(at - now, 10000, "the countdown is ten seconds");
  eq(await t.tick(now + 9999), null, "nothing starts before it ends");
  await t.cancel(ROB, now + 2000);
  eq((await t.view(ROB)).phase, "selecting", "the host's Cancel stops it");
  await refuses(t.cancel(ROB, now + 2000), 409, /No countdown/, "and there is then nothing to cancel");
  await t.start(ROB, now + 3000);
  await t.ready(SAM, false, now + 4000);
  eq([(await t.view(ROB)).phase, await t.tick(now + 20000)], ["selecting", null], "a person unreadying stops the countdown too, and the alarm then starts nothing");
  await t.ready(SAM, true, now + 5000);
  await t.start(ROB, now + 5000);
  const matchId = await t.tick(now + 15000);
  ok(matchId && (await t.view(ROB)).phase === "playing", "when the countdown ends, the game starts");
  const {room, seatId} = await t.room(MAYA);
  eq([seatId, room.seats.map((s) => [s.seatId, s.pilot])], ["s1", [["s0", "human"], ["s1", "human"], ["s2", "human"], ["s3", "house"]]], "each person has a seat in the room, and the room knows them only as a seat");
  ok(!JSON.stringify(room.view("s1")).includes("@example.com"), "no address reaches the room's views");
  await refuses(t.room(EVE), 403, null, "someone with no seat has none in the game");
}

/* 2. A LAUNCH THAT FAILS SAYS WHY, AND THE TABLE GOES BACK TO CHOOSING WITH THE AI STILL READY. */
{
  const t = tableOn(memoryStorage(), {cards, random});
  await t.create({tableId: "tablebeta01", host: ROB, hostName: "Rob", seats: [{kind: "ai", name: "Bot"}]});
  await t.deck(ROB, 0, deckFor("r2"), now); await t.deck(ROB, 1, deckFor("b2"), now); await t.ready(ROB, true, now);
  await t.start(ROB, now);
  const broken = {get: async () => null, put: async () => {throw new Error("disk full");}, delete: async () => false, list: async () => []};
  eq(await t.tick(now + 10000, {storageForRoom: broken}), null, "a room that cannot start does not start");
  const after = await t.view(ROB);
  eq([after.phase, after.launchError, after.seats.map((s) => s.ready)], ["selecting", "The rules engine did not start.", [false, true]], "the table says so, the host re-confirms, and the AI is still ready");
}

/* 3. THE TABLE AS A DURABLE OBJECT: its routes, and the countdown on its alarm. */
const alarms = [];
function objectCtx() {
  const map = new Map(), sockets = [];
  return {sockets, storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
    list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async (t) => {alarms.push(t);}, deleteAlarm: async () => {alarms.push("deleted");}},
  acceptWebSocket: (s, tags) => {s.tags = tags; sockets.push(s);}, getWebSockets: () => sockets, getTags: (s) => s.tags};
}
{
  const ctx = objectCtx();
  const table = new GameTable(ctx, {}, {cards, random, now: () => now});
  const call = async (method, path, email, body) => {
    const r = await table.fetch(new Request(`https://table.internal${path}`, {method, headers: {"content-type": "application/json", ...(email ? {"x-crankmagic-email": email} : {})}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})}));
    return {status: r.status, json: await r.json()};
  };
  eq((await call("GET", "/table")).status, 401, "the object refuses anyone the front door did not name");
  eq((await call("GET", "/table", ROB)).status, 404, "before it is created there is no table");
  eq((await call("POST", "/table/create", ROB, {tableId: "tablegamma1", hostName: "Rob", seats: [{kind: "human", name: "Maya"}]})).status, 201, "create");
  const code = (await call("POST", "/table/invite", ROB, {seatId: 1})).json.invite.code;
  eq((await call("POST", "/table/join", MAYA, {code})).json.table.yourSeat, 1, "invite and join");
  eq((await call("POST", "/table/deck", MAYA, {seatId: 1, deck: {commander: ["Sol Ring"], cards: []}})).json.unsupported, ["Sol Ring"], "an unplayable deck is refused by name over the object too");
  await call("POST", "/table/deck", ROB, {seatId: 0, deck: deckFor("r3")}); await call("POST", "/table/deck", MAYA, {seatId: 1, deck: deckFor("m3")});
  await call("POST", "/table/ready", ROB, {ready: true}); await call("POST", "/table/ready", MAYA, {ready: true});
  const started = await call("POST", "/table/start", ROB);
  eq([started.status, alarms.at(-1)], [200, now + 10000], "Start sets the object's alarm for the countdown's end");
  await call("POST", "/table/cancel", ROB);
  eq(alarms.at(-1), "deleted", "Cancel clears it");
  await call("POST", "/table/start", ROB);
  now += 10000;
  await table.alarm();
  eq((await call("GET", "/table", MAYA)).json.table.phase, "playing", "the alarm launches the game");
  eq((await call("GET", "/connect", MAYA)).status, 426, "a seat connects with a WebSocket");
  const {room, seatId} = await table.table.room(MAYA);
  const sock = {frames: [], send(f) {this.frames.push(JSON.parse(f));}, close() {}};
  table.room = room; table.accept(sock, seatId);
  eq([sock.frames[0].type, sock.frames[0].view.seatId], ["view", "s1"], "her socket is her seat's, and is sent her view");
  eq((await call("POST", "/table/start", MAYA)).status, 403, "a guest cannot start the table");
  eq((await call("POST", "/table/nothing", ROB)).status, 404, "an unknown route is 404");
}

/* 4. THE WORKER'S FRONT DOOR. */
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
  const fetchImpl = async (url) => new Response(JSON.stringify({keys: [jwk]}));
  const objects = new Map();
  const TABLES = {idFromName: (name) => name, get: (id) => {if (!objects.has(id)) objects.set(id, new GameTable(objectCtx(), {}, {cards, random, now: () => now})); return objects.get(id);}};
  const base = {ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, DB: {prepare: () => ({bind: () => ({first: async () => null, run: async () => ({})})})}};
  forgetKeys();
  const call = async (method, path, {as = ROB, body, headers = {}, env = {...base, TABLES}} = {}) => {
    const init = {method, headers: {"cf-access-jwt-assertion": await token(as), ...(body !== undefined ? {"content-type": "application/json", "x-crankmagic": "play"} : {}), ...headers}};
    if (body !== undefined) init.body = JSON.stringify(body);
    const r = await handle(new Request(`https://crankmagic.test${path}`, init), env, {fetchImpl});
    return {status: r.status, json: await r.json().catch(() => null)};
  };
  eq((await call("POST", "/api/tables", {body: {seats: [{kind: "ai"}]}, env: base})).status, 503, "without Play's binding, every table route is shut");
  ok(/not switched on/.test((await call("GET", "/api/tables/abcdefgh12", {env: base})).json.error), "and says so");
  eq((await call("POST", "/api/tables", {body: {seats: [{kind: "ai"}]}, headers: {"x-crankmagic": "sync"}})).status, 403, "a write without Play's header, as a page elsewhere would send, is refused");
  const made = await call("POST", "/api/tables", {body: {hostName: "Rob", seats: [{kind: "human", name: "Maya"}]}});
  eq([made.status, made.json.table.youAreHost, /^[a-z0-9]{32}$/.test(made.json.table.tableId)], [201, true, true], "a signed-in person creates a table and hosts it");
  const id = made.json.table.tableId;
  eq((await call("GET", `/api/tables/${id}`, {as: EVE})).status, 403, "a stranger sees nothing of it");
  const inv = await call("POST", `/api/tables/${id}/invite`, {body: {seatId: 1}});
  const joined = await call("POST", `/api/tables/${id}/join`, {as: MAYA, body: {code: inv.json.invite.code}});
  eq([joined.status, joined.json.table.yourSeat], [200, 1], "the invited person joins through the door, as themselves");
  eq((await call("POST", `/api/tables/${id}/invite`, {as: MAYA, body: {seatId: 1}})).status, 403, "a guest cannot send invitations");
  eq((await call("POST", `/api/tables/${id}/mat`, {as: MAYA, body: {mat: "night"}})).json.table.seats[1].mat, "night", "a mat is chosen through the front door too");
  eq((await call("GET", `/api/tables/${id}/connect`, {headers: {upgrade: "websocket", origin: "https://evil.example"}})).status, 403, "a table's socket from another site is refused");
  eq((await call("GET", "/api/tables/NOT-AN-ID")).status, 404, "a malformed table id is no table");
  eq((await call("POST", `/api/tables/${id}/explode`, {body: {}})).status, 404, "an unknown action is 404");
  eq((await call("GET", `/api/tables/${id}/ready`)).status, 405, "an action is a POST");
  eq((await call("POST", `/api/tables/${id}/join`, {as: MAYA, body: "x".repeat(70 * 1024)})).status, 400, "a body larger than a table needs is refused at the door");
}

/* THE TABLE'S RULES (Rob, 2026-09-30; docs/plan-to-done-2026-09-30.md, B3): the host sets the starting life and a bracket
   limit, never once a seat is ready; a deck above the limit is refused, saying what to do instead; the game starts at
   the host's life, and a playtest table's record replays to it. */
{
  const storage = memoryStorage(), t = tableOn(storage, {cards, random});
  await t.create({tableId: "tablerules1", host: ROB, hostName: "Rob", seats: [{kind: "human", name: "Maya"}, {kind: "ai", name: "Shadrix"}], playtest: true});
  await t.join(MAYA, (await t.invite(ROB, 1, now)).code, now);
  eq((await t.view(ROB)).rules, {startingLife: 40, bracketLimit: null}, "a new table plays at 40 life (CR 903.7) with no bracket limit");
  await refuses(t.rules(MAYA, {startingLife: 30}, now), 403, /Only the host/, "only the host edits the rules");
  eq((await t.rules(ROB, {startingLife: 30, bracketLimit: 3}, now)).rules, {startingLife: 30, bracketLimit: 3}, "the host sets 30 life and bracket 3");
  eq((await t.view(MAYA)).rules, {startingLife: 30, bracketLimit: 3}, "and everyone at the table sees them");
  await refuses(t.rules(ROB, {startingLife: 0}, now), 400, /1 to 999/, "a starting life is a whole number from 1 to 999");
  await refuses(t.rules(ROB, {bracketLimit: 7}, now), 400, /1 to 5/, "a bracket limit is 1 to 5, or none");
  await refuses(t.deck(MAYA, 1, {...deckFor("maya"), bracket: 4}, now), 409, /^maya deck is bracket 4, above this table's limit of 3\. Choose a deck at bracket 3 or lower, or ask the host to raise the limit\.$/, "a deck above the limit is refused, saying what is wrong and what to do instead");
  eq((await t.deck(MAYA, 1, {...deckFor("maya"), bracket: 3}, now)).seats[1].deck.bracket, 3, "a deck at the limit takes the seat, its bracket shown");
  await refuses(t.rules(ROB, {bracketLimit: 2}, now), 409, /^Maya's deck \(bracket 3\) is above 2\. Change that deck first, or keep the limit at 3 or higher\.$/, "lowering the limit under a deck already chosen is refused, with the way out");
  await t.ready(MAYA, true, now);
  await refuses(t.rules(ROB, {startingLife: 20}, now), 409, /^The rules can't change once a seat is ready, and Maya is\. Take back Ready/, "once a seat is ready the rules are refused, saying how to change them");
  await t.ready(MAYA, false, now);
  eq((await t.rules(ROB, {bracketLimit: null}, now)).rules, {startingLife: 30, bracketLimit: null}, "with nobody ready, the host takes the limit off again");
  await t.deck(ROB, 0, deckFor("rob"), now); await t.deck(ROB, 2, deckFor("shadrix"), now);
  await refuses(t.rules(ROB, {startingLife: 25}, now), 409, /Shadrix is\. Take back Ready \(an AI seat is ready once its deck is chosen, so choose AI decks after the rules\)/, "an AI seat is ready once its deck is chosen, and the refusal says to set the rules first");
  await t.ready(ROB, true, now); await t.ready(MAYA, true, now);
  await t.start(ROB, now); const matchId = await t.tick(now + 11000);
  const room = await t.currentRoom();
  eq(room.view("s0").state.players.map((p) => p.health.life), [30, 30, 30], "the game starts every seat at the host's 30 life");
  await t.endGame(ROB, now + 12000);
  const record = await t.record(ROB, matchId);
  eq(record.pod.startingLife, 30, "the playtest record keeps the starting life with the pod");
  const replayed = await replayTape({matchId, pod: record.pod, seed: record.seed, tape: record.tape, cards});
  eq(replayed.view("s0").state.players.map((p) => p.health.life), [30, 30, 30], "and replays to the same 30 life");
}

/* ONLY A CARD THAT CAN BE A COMMANDER IS ONE (CR 903.3; Rob, 2026-10-01): a legendary creature, or a card that says it
   can be your commander. The Basic lands test deck is the one exception, and only on a playtest table. */
{
  const TEST_DECK = {name: "Basic lands test deck", commander: ["Wastes"],
    cards: [["Plains", 20], ["Island", 20], ["Swamp", 20], ["Mountain", 20], ["Forest", 19]].flatMap(([land, n]) => Array(n).fill(land))};
  const plain = {...deckFor("plain"), commander: [def("Plain Bear", {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}"})]};
  const walker = {...deckFor("walker"), commander: [def("Walker Who Leads", {types: ["Planeswalker"], supertypes: ["Legendary"], manaCost: "{3}", canBeCommander: true})]};
  const relic = {...deckFor("relic"), commander: [def("Legendary Relic", {types: ["Artifact"], supertypes: ["Legendary"], manaCost: "{3}"})]};
  for (const playtest of [false, true]) {
    const t = tableOn(memoryStorage(), {cards, random});
    await t.create({tableId: playtest ? "cmdlegal2" : "cmdlegal1", host: ROB, hostName: "Rob", seats: [{kind: "ai", name: "Shadrix"}], playtest});
    const refusal = async (deck) => t.deck(ROB, 1, deck, now).then(() => null, (e) => [e.status, e.message, e.notCommanders]);
    eq(await refusal(plain), [422, "Plain Bear can't be a commander: a commander is a legendary creature, or a card that says it can be your commander.", ["Plain Bear"]],
      `${playtest ? "on a playtest table too" : "at a table"}, a creature that is not legendary is refused as a commander, by name, saying what a commander is`);
    eq(await refusal(relic), [422, "Legendary Relic can't be a commander: a commander is a legendary creature, or a card that says it can be your commander.", ["Legendary Relic"]],
      "and so is a legendary card that is not a creature");
    eq(await refusal(walker), null, "a card that says it can be your commander takes the seat");
    eq(await refusal({...plain, commander: ["General ai", "Plain Bear"]}), [422, "Plain Bear can't be a commander: a commander is a legendary creature, or a card that says it can be your commander.", ["Plain Bear"]],
      "of two commanders, the one that cannot be is named");
    eq(await refusal(TEST_DECK), playtest ? null : [422, "Wastes can't be a commander: a commander is a legendary creature, or a card that says it can be your commander.", ["Wastes"]],
      playtest ? "on a playtest table the Basic lands test deck is the one exception: Wastes at the head of basic lands takes the seat"
        : "at any other table a basic land is no commander, the test deck's included");
    if (playtest) eq(await refusal({...TEST_DECK, cards: [...TEST_DECK.cards.slice(1), def("Grove x", {types: ["Land"], abilities: []})]}),
      [422, "Wastes can't be a commander: a commander is a legendary creature, or a card that says it can be your commander.", ["Wastes"]],
      "and only that deck: basic lands with one other card in them are not it");
  }
  eq([commanderLegal({types: ["Creature"], supertypes: ["Legendary"]}), commanderLegal({types: ["Creature"]}), commanderLegal({types: ["Land"], supertypes: ["Basic"]}), commanderLegal(null)],
    [true, false, false, false], "the rule itself: a legendary creature, nothing else unless it says so");
  eq([isBasicLandsTestDeck(["Wastes"], TEST_DECK.cards), isBasicLandsTestDeck(["Wastes", "Forest"], []), isBasicLandsTestDeck(["Sol Ring"], [])], [true, false, false],
    "the test deck is one basic land at the head of basic lands");
  const script = structuredClone(loadCardScripts()[0].script);
  const says = compileScript({...script, oracleText: `${script.oracleText}
${script.identity.name} can be your commander.`});
  eq([compileScript(script).definition.canBeCommander ?? false, says.definition.canBeCommander], [false, true],
    "a definition says canBeCommander only when its card says it can be your commander");
}

console.log(`game-table: ${checks} checks passed — the approved journeys as rules: the host invites, the invited join as themselves, each brings a playable deck, the countdown waits for every person and the host can cancel it, and the door is shut until Play ships.`);
