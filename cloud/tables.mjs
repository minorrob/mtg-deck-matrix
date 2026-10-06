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
 *   POST /api/tables/:id/invite|uninvite|join|deck|known|ready|mat|rules|start|cancel|end|concede
 *   GET  /api/tables/:id/connect             WebSocket to your seat, once the game is on
 *   GET  /api/tables/:id/record?match=<id>   a finished game's record (M8b; what it holds is the table's call)
 *
 * A table's invitation link is `https://<site>/api/join/<id>/<code>` (cloud/worker.mjs): behind Access on every site,
 * it survives Access's sign-in, which keeps a path and drops a fragment, and comes back to the app at
 * `#table/<id>/<code>`, the form the app joins from (and an older link still opens). The code reaches the Worker in
 * that path, as the sign-in's `to` already carried it, and is kept by nothing; it seats only someone Access admits, for
 * a day, once, and a new link withdraws it.
 */
const TABLE_ID = /^[a-z0-9]{8,40}$/, MATCH_ID = /^[a-z0-9]{8,40}g[1-9][0-9]{0,5}$/;
const ACTIONS = new Set(["invite", "uninvite", "join", "deck", "known", "ready", "mat", "rules", "start", "cancel", "end", "concede"]);
const HEADERS = {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"};
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
    if (!given) {
      if (request.method !== "POST") return reply(405, {error: "Create a table with a POST."});
      let body;
      try {body = JSON.parse(await json());} catch {return reply(400, {error: "That request is not JSON, or is larger than a table needs."});}
      const tableId = newId();
      return forward(tableId, "/table/create", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({...body, tableId})});
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
    let body;
    try {body = await json(); JSON.parse(body || "{}");} catch {return reply(400, {error: "That request is not JSON, or is larger than a table needs."});}
    return forward(given, `/table/${action}`, {method: "POST", headers: {"content-type": "application/json"}, body: body || "{}"});
  })();
}
