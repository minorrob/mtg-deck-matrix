/* The lounge suites' shared stage (tests/lounge-*.mjs): the Worker's real front door over Durable Objects made in Node, with real
 * RS256 Access tokens, an in-memory D1 stand-in (Node's SQLite, the real migrations), and sockets that record what they are sent.
 * Not a suite: tests/helpers is not walked by the runner. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {basicCards} from "../../game/room/room.mjs";
import {GameTable} from "../../cloud/game-room.mjs";
import {handle} from "../../cloud/worker.mjs";
import {forgetKeys} from "../../cloud/access.mjs";

export const ROB = "rob@example.com", MAYA = "maya@example.com", SAM = "sam@example.com", EVE = "eve@example.com", AVERY = "avery@example.com";

let checks = 0;
export const count = () => checks;
export const ok = (c, m) => {assert.ok(c, m); checks += 1;};
export const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
export const everyString = (v, out = new Set()) => {if (typeof v === "string") out.add(v); else if (v && typeof v === "object") Object.values(v).forEach((x) => everyString(x, out)); return out;};

/* Decks whose card names are each seat's own, so one reaching a spectator shows. */
const DEFS = new Map();
const def = (name, d) => {DEFS.set(name, d); return name;};
export const cards = (name) => DEFS.get(name) ?? basicCards(name);
export const deckFor = (tag) => ({name: `${tag} deck`, commander: [def(`General ${tag}`, {types: ["Creature"], supertypes: ["Legendary"], power: 3, toughness: 3, manaCost: "{2}{G}"})],
  cards: [...Array.from({length: 38}, () => def(`Grove ${tag}`, {types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]})),
    ...Array.from({length: 61}, (_, i) => def(`Bear ${tag}-${i}`, {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}"}))]});
let seq = 0;
export const random = (n) => {seq += 1; return new Uint8Array(n).map((_, i) => (seq * 31 + i * 7) % 256);};

export function d1(migrations = ["0001_accounts.sql", "0002_ai.sql", "0003_sharing.sql", "0010_match_results.sql"]) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const m of migrations) db.exec(readFileSync(new URL(`../../cloud/migrations/${m}`, import.meta.url), "utf8"));
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({results: db.prepare(sql).all(...args), success: true, meta: {}}),
    run: async () => ({success: true, meta: {changes: Number(db.prepare(sql).run(...args).changes)}}),
  });
  return {raw: db, prepare: (sql) => statement(sql)};
}

/** A Durable Object's context made of maps, with the hibernation API's calls recorded. */
export function objectCtx() {
  const map = new Map(), sockets = [];
  return {sockets, map, storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
    list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async () => {}, deleteAlarm: async () => {}},
  acceptWebSocket: (s, tags) => {s.tags = tags; sockets.push(s);}, getWebSockets: () => sockets, getTags: (s) => s.tags};
}
/** A socket that keeps every frame it is sent. */
export const socket = () => ({frames: [], closed: false, send(f) {this.frames.push(JSON.parse(f));}, close() {this.closed = true;}});

/**
 * The world: the Worker's `handle` over a map of Durable Objects, signed in as whoever a call names.
 * @param {{db?: boolean, migrations?: string[], owner?: string, aiPilot?: boolean}} options
 */
export async function world({db = false, migrations, owner = ROB, start = Date.parse("2026-10-28T20:00:00Z")} = {}) {
  const TEAM = "crankmagic-test.cloudflareaccess.com", AUD = "aud-lounge";
  const b64url = (buf) => Buffer.from(buf).toString("base64url");
  const {publicKey, privateKey} = await crypto.subtle.generateKey({name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, ["sign", "verify"]);
  const jwk = {...await crypto.subtle.exportKey("jwk", publicKey), kid: "k1"};
  const token = async (email) => {
    const h = b64url(JSON.stringify({alg: "RS256", kid: "k1", typ: "JWT"}));
    const p = b64url(JSON.stringify({aud: [AUD], iss: `https://${TEAM}`, email, exp: Date.now() / 1000 + 3600, iat: Date.now() / 1000}));
    return `${h}.${p}.${b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${p}`)))}`;
  };
  const fetchImpl = async () => new Response(JSON.stringify({keys: [jwk]}));
  const clock = {t: start}, objects = new Map(), contexts = new Map();
  const database = db ? d1(migrations) : undefined;
  const env = {ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, OWNER_EMAIL: owner, ...(database ? {DB: database} : {})};
  env.TABLES = {idFromName: (name) => name, get: (id) => {
    if (!objects.has(id)) {
      const ctx = objectCtx(); contexts.set(id, ctx);
      const table = new GameTable(ctx, env, {cards, random, now: () => clock.t});
      /* Node has neither WebSocketPair nor a 101: the socket is the recorded one, and the answer says it was upgraded. */
      table.socketPair = () => [{client: true}, socket()];
      table.upgraded = () => new Response(JSON.stringify({upgraded: true}), {status: 200});
      objects.set(id, table);
    }
    return objects.get(id);
  }};
  forgetKeys();
  const call = async (method, path, {as = ROB, body, headers = {}} = {}) => {
    const init = {method, headers: {"cf-access-jwt-assertion": await token(as), ...(body !== undefined ? {"content-type": "application/json", "x-crankmagic": "play"} : {}), ...headers}};
    if (body !== undefined) init.body = JSON.stringify(body);
    const r = await handle(new Request(`https://crankmagic.test${path}`, init), env, {fetchImpl});
    return {status: r.status, json: await r.json().catch(() => null)};
  };
  const watch = (id, as) => call("GET", `/api/tables/${id}/connect?watch=1`, {as, headers: {upgrade: "websocket", origin: "https://crankmagic.test"}});
  /** The recorded server-side socket of the n-th connection an object accepted. */
  const socketsOf = (id) => contexts.get(id).sockets;
  const make = async (as, body) => {
    const r = await call("POST", "/api/tables", {as, body});
    return {...r, id: r.json?.table?.tableId};
  };
  return {env, call, watch, clock, objects, contexts, socketsOf, make, db: database};
}

const T = (id, path = "") => `/api/tables/${id}${path}`;
/* A table through its lobby to a running game: the host and any named people ready, then the countdown, then the alarm. */
export async function running(w, host, {privacy, people = [], ai = 1} = {}) {
  const made = await w.make(host, {hostName: host.split("@")[0].replace(/^./, (c) => c.toUpperCase()), privacy, seats: [...people.map((p) => ({kind: "human", name: p.name})), ...Array.from({length: ai}, (_, i) => ({kind: "ai", name: `Ember${i}`}))]});
  const id = made.id;
  for (const [i, p] of people.entries()) {
    const code = (await w.call("POST", T(id, "/invite"), {as: host, body: {seatId: i + 1}})).json.invite.code;
    await w.call("POST", T(id, "/join"), {as: p.email, body: {code}});
  }
  const table = (await w.call("GET", T(id), {as: host})).json.table;
  for (const s of table.seats) {
    if (s.kind === "ai") await w.call("POST", T(id, "/deck"), {as: host, body: {seatId: s.seatId, deck: deckFor(`ai${s.seatId}`)}});
    else {
      const email = s.seatId === 0 ? host : people[s.seatId - 1].email;
      await w.call("POST", T(id, "/deck"), {as: email, body: {seatId: s.seatId, deck: deckFor(`p${s.seatId}`)}});
      await w.call("POST", T(id, "/ready"), {as: email, body: {ready: true}});
    }
  }
  return {id, start: async () => {
    const r = await w.call("POST", T(id, "/start"), {as: host, body: {}});
    w.clock.t += 10000; await w.objects.get(id).alarm();
    return r;
  }};
}


/** Past the opening hands: each named person connects and keeps (answers the first option) until the game's first turn. */
export async function begun(w, id, emails) {
  const object = w.objects.get(id), headers = {upgrade: "websocket", origin: "https://crankmagic.test"};
  const mine = [];
  for (const email of emails) {
    const seat = (await w.call("GET", `/api/tables/${id}`, {as: email})).json.table.yourSeat;
    await w.call("GET", `/api/tables/${id}/connect`, {as: email, headers});
    mine.push(w.socketsOf(id).findLast((s) => s.tags[0] === `s${seat}`));
  }
  for (let round = 0; round < 40; round += 1) {
    let moved = false;
    for (const sock of mine) {
      const latest = sock.frames.filter((f) => f.type === "view").at(-1)?.view;
      if (latest?.decision && latest.state.turn === 0) {
        moved = true;
        await object.webSocketMessage(sock, JSON.stringify({type: "act", actionId: crypto.randomUUID(), revision: latest.revision, kind: "answer", choiceId: latest.decision.id, indices: [0]}));
      }
    }
    if (!moved) break;
  }
  return mine;
}
