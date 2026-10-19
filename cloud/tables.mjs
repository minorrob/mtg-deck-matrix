/* PLAY'S FRONT DOOR (M5): the Worker's routes to a table, each table a Durable Object (cloud/game-room.mjs,
 * GameTable). This file is the Worker's side only: it imports nothing from game/, so the Worker that ships
 * today does not carry the engine. It is reached after Access has named the person (cloud/worker.mjs), and
 * all it adds is that name, in `x-crankmagic-email`, and which table.
 *
 * SHUT UNTIL PLAY SHIPS. Without the TABLES binding -- which only Play's own release profile will add -- every
 * route answers "Play is not switched on here yet."
 *
 *   POST /api/tables                         a new table; you host it, in seat 1
 *   GET  /api/tables/:id                     the table as you see it
 *   POST /api/tables/:id/invite|uninvite|join|deck|known|ready|mat|rules|start|cancel|end|concede|report
 *   POST /api/tables/known                   which of these card names a table cannot play yet, asked with no table (AI-5):
 *                                            {names} or {decks: [[names], ...]} -> {unknown, listed?}
 *   GET  /api/tables/:id/connect             WebSocket to your seat, once the game is on
 *   GET  /api/tables/:id/record?match=<id>   a finished game's record (M8b; what it holds is the table's call)
 *
 * A table's invitation link is `https://<site>/api/join/<id>/<code>` (cloud/worker.mjs): behind Access on every site,
 * it survives Access's sign-in, which keeps a path and drops a fragment, and comes back to the app at
 * `#table/<id>/<code>`, the form the app joins from (and an older link still opens). The code reaches the Worker in
 * that path, as the sign-in's `to` already carried it, and is kept by nothing; it seats only someone Access admits, for
 * a day, once, and a new link withdraws it.
 *
 * CARD DEMAND (card load step 1; cloud/card-demand.mjs): wherever the table names cards it cannot play -- the answer to
 * `known`, and a seat's deck refused for its cards -- those names are counted, and the answer carries `listed`, the names
 * now on the list for the next wave. Names and counts only: never who asked, the table, or the deck.
 */
import {recordDemand} from "./card-demand.mjs";

const TABLE_ID = /^[a-z0-9]{8,40}$/, MATCH_ID = /^[a-z0-9]{8,40}g[1-9][0-9]{0,5}$/;
const ACTIONS = new Set(["invite", "uninvite", "join", "deck", "known", "ready", "mat", "rules", "start", "cancel", "end", "concede", "report"]);
const HEADERS = {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"};
/* The object that answers "which of these cards can a table play" with no table (AI-5). Every table's object answers it
   from the engine's cards alone (game/room/table.mjs `unknown`), reading no table, so one object answers everyone; its
   name holds a hyphen, which no table's id can (TABLE_ID), so it is never a table. */
const KNOWN_OBJECT = "cards-known";
const reply = (status, value) => new Response(JSON.stringify(value), {status, headers: HEADERS});
const newTableId = () => crypto.randomUUID().replace(/-/g, "");

/** @returns {?Promise<Response>} null when the path is not Play's */
export function tables(request, env, who, {newId = newTableId} = {}) {
  const url = new URL(request.url);
  const match = /^\/api\/tables(?:\/([^/]+)(?:\/([a-z]+))?)?$/.exec(url.pathname);
  if (!match) return null;
  return (async () => {
    if (!env.TABLES) return reply(503, {error: "Play is not switched on here yet."});
    const [, given, action] = match;
    const forward = (tableId, path, init = {}) => {
      const headers = new Headers(init.headers || {});
      headers.set("x-crankmagic-email", who.email);
      const stub = env.TABLES.get(env.TABLES.idFromName(tableId));
      return stub.fetch(new Request(`https://table.internal${path}`, {method: init.method || "GET", headers, ...(init.body !== undefined ? {body: init.body} : {})}));
    };
    const json = async () => {const text = await request.text(); if (text.length > 64 * 1024) throw new Error("large"); return text;};
    /* The table's answer, with the names it cannot play counted (card demand): `asks` turns those names into what is
       recorded. An answer naming none, or one the database could not record, goes out as it came. */
    const counted = async (response, asks) => {
      if (!env.DB || (response.status !== 200 && response.status !== 422)) return response;
      let value;
      try {value = await response.clone().json();} catch {return response;}
      const named = Array.isArray(value && value.unknown) ? value.unknown : Array.isArray(value && value.unsupported) ? value.unsupported : [];
      if (!named.length) return response;
      const listed = await recordDemand(env.DB, asks(named));
      return listed.length ? reply(response.status, {...value, listed}) : response;
    };
    if (!given) {
      if (request.method !== "POST") return reply(405, {error: "Create a table with a POST."});
      let body;
      try {body = JSON.parse(await json());} catch {return reply(400, {error: "That request is not JSON, or is larger than a table needs."});}
      const tableId = newId();
      return forward(tableId, "/table/create", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({...body, tableId})});
    }
    /* A DECK'S READINESS, BEFORE ANY TABLE (AI-5): a deck's tile and its page say whether it is playable at the table, or
       how many of its cards are still to learn. Names only go in; only the names a table cannot play come back. */
    if (given === "known" && !action) {
      if (request.method !== "POST") return reply(405, {error: "Ask which cards a table can play with a POST."});
      let body, asked;
      try {body = await json(); asked = JSON.parse(body || "{}");} catch {return reply(400, {error: "That request is not JSON, or is larger than a table needs."});}
      /* Several decks at once, each its own list, so each is counted as one deck (card demand); asked as one list. */
      const decks = asked && Array.isArray(asked.decks) ? asked.decks : null;
      if (decks && !decks.every((d) => Array.isArray(d))) return reply(400, {error: "Send each deck as a list of card names."});
      const sent = decks ? JSON.stringify({names: [...new Set(decks.flat())]}) : body || "{}";
      const answer = await forward(KNOWN_OBJECT, "/table/known", {method: "POST", headers: {"content-type": "application/json"}, body: sent});
      return counted(answer, (unknown) => {
        if (!decks) return [{unknown}];
        /* The table answers each name trimmed (game/room/table.mjs, clean), so a deck's are matched the same way. */
        const key = (n) => String(n ?? "").trim().toLowerCase(), missing = new Set(unknown.map(key));
        return decks.map((deck) => ({deck, unknown: deck.filter((n) => missing.has(key(n)))}));
      });
    }
    if (!TABLE_ID.test(given)) return reply(404, {error: "There is no such table."});
    if (!action) return request.method === "GET" ? forward(given, "/table") : reply(405, {error: "Read a table with a GET."});
    if (action === "connect") {
      if (request.headers.get("upgrade") !== "websocket") return reply(426, {error: "Connect with a WebSocket."});
      const headers = new Headers(request.headers);
      headers.set("x-crankmagic-email", who.email);
      return env.TABLES.get(env.TABLES.idFromName(given)).fetch(new Request("https://table.internal/connect", {method: "GET", headers}));
    }
    if (action === "record") {
      if (request.method !== "GET") return reply(405, {error: "Read a record with a GET."});
      const match = url.searchParams.get("match") || "";
      return forward(given, `/table/record${MATCH_ID.test(match) ? `?match=${match}` : ""}`);
    }
    if (!ACTIONS.has(action)) return reply(404, {error: "No such endpoint."});
    if (request.method !== "POST") return reply(405, {error: "That is a POST."});
    let body, asked;
    try {body = await json(); asked = JSON.parse(body || "{}");} catch {return reply(400, {error: "That request is not JSON, or is larger than a table needs."});}
    const answer = await forward(given, `/table/${action}`, {method: "POST", headers: {"content-type": "application/json"}, body: body || "{}"});
    /* A seat's deck refused for cards the table cannot play (game/room/table.mjs, readDeck): one deck, counted. */
    if (action !== "deck" || answer.status !== 422) return answer;
    const deck = asked && asked.deck && typeof asked.deck === "object" ? asked.deck : {};
    const list = [...(Array.isArray(deck.commander) ? deck.commander : []), ...(Array.isArray(deck.cards) ? deck.cards : [])].filter((n) => typeof n === "string");
    return counted(answer, (unknown) => [{deck: list, unknown}]);
  })();
}
