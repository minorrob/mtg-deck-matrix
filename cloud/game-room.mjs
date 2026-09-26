/* THE GAME ROOM AS A DURABLE OBJECT (M5; the room itself is game/room/room.mjs).
 *
 * One object per match. It holds the room over its own storage, and carries each seat's view over a
 * WebSocket: a seat's socket only ever receives that seat's view, the receipt for its own actions and its own
 * refusals. Views go out after every change, in order, each with the controller's revision, so a client
 * keeps the newest and ignores anything older.
 *
 * NOT YET REACHABLE. No Worker route leads here and no release binds it: the front door (create, join and
 * leave a table, and hand a seat to an account) waits on Rob's host and guest journeys, and Play ships in its
 * own release profile. What reaches this object will be the Worker, having already decided which seat the
 * signed-in person holds; it says so in the `x-crankmagic-seat` header, and identity never comes further in.
 *
 * It uses the hibernation API (acceptWebSocket, webSocketMessage), so a quiet table costs nothing while it
 * waits; the room is reopened from storage when the object wakes.
 *
 *   POST /start               {matchId, seed, pod}  -> 201 {matchId, seats}; 422 names any card it cannot play
 *   GET  /view                one seat's view, for a reconnect without a socket
 *   GET  /connect             Upgrade: websocket -> 101, then {type:"view"} at once
 *   ws   {type:"act", ...}    the §12.1 action envelope -> {type:"receipt"} to the sender, {type:"view"} to all
 *   ws   {type:"view"}        the sender's view again
 */
import {startRoom, openRoom, RoomError, basicCards} from "../game/room/room.mjs";

/* A Durable Object's storage, as the M4 storage contract (game/engine/storage.mjs): strings in, strings out. */
export function objectStorage(storage) {
  return {
    async get(key) {const v = await storage.get(key); return v === undefined ? null : v;},
    put: (key, value) => storage.put(key, value),
    delete: (key) => storage.delete(key),
    async list(prefix) {return [...(await storage.list({prefix})).keys()].sort();},
  };
}

const JSON_HEADERS = {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"};
const reply = (status, value) => new Response(JSON.stringify(value), {status, headers: JSON_HEADERS});
const MAX_FRAME = 16 * 1024;
const MATCH_KEY = "room-match";

export class GameRoom {
  constructor(ctx, env, {cards = basicCards} = {}) {
    this.ctx = ctx; this.env = env; this.cards = cards; this.room = null;
    this.storage = objectStorage(ctx.storage);
  }

  async load() {
    if (this.room) return this.room;
    const matchId = await this.ctx.storage.get(MATCH_KEY);
    if (!matchId) return null;
    this.room = await openRoom({storage: this.storage, matchId, cards: this.cards});
    return this.room;
  }

  async fetch(request) {
    const url = new URL(request.url), seatId = request.headers.get("x-crankmagic-seat") || "";
    try {
      if (request.method === "POST" && url.pathname === "/start") {
        if (await this.load()) return reply(409, {error: "This table already has a game."});
        const {matchId, seed, pod} = await request.json();
        this.room = await startRoom({storage: this.storage, matchId: String(matchId || ""), cards: this.cards, pod, seed});
        await this.ctx.storage.put(MATCH_KEY, this.room.matchId);
        return reply(201, {matchId: this.room.matchId, seats: this.room.seats});
      }
      const room = await this.load();
      if (!room) return reply(404, {error: "There is no game at this table."});
      if (request.method === "GET" && url.pathname === "/view") return reply(200, {view: room.view(seatId)});
      if (request.method === "GET" && url.pathname === "/connect") {
        if (request.headers.get("upgrade") !== "websocket") return reply(426, {error: "Connect with a WebSocket."});
        room.view(seatId);  /* refuses a seat that is not at this table before a socket exists */
        const pair = new WebSocketPair();
        this.accept(pair[1], seatId);
        return new Response(null, {status: 101, webSocket: pair[0]});
      }
      return reply(404, {error: "No such endpoint."});
    } catch (error) {
      if (error instanceof RoomError) return reply(error.status, {error: error.message, ...(error.unsupported ? {unsupported: error.unsupported} : {})});
      throw error;
    }
  }

  /** A seat's socket joins the room, tagged with its seat, and is sent that seat's view at once. */
  accept(socket, seatId) {
    this.ctx.acceptWebSocket(socket, [seatId]);
    socket.send(JSON.stringify({type: "view", view: this.room.view(seatId)}));
  }

  async webSocketMessage(socket, message) {
    const [seatId] = this.ctx.getTags(socket);
    const room = await this.load();
    const send = (frame) => socket.send(JSON.stringify(frame));
    if (!room) return send({type: "refused", error: "There is no game at this table."});
    if (typeof message !== "string" || message.length > MAX_FRAME) return send({type: "refused", error: "That message is not one the table reads."});
    let frame;
    try {frame = JSON.parse(message);} catch {return send({type: "refused", error: "That message is not JSON."});}
    if (frame && frame.type === "view") return send({type: "view", view: room.view(seatId)});
    if (!frame || frame.type !== "act") return send({type: "refused", error: "That message is not one the table reads."});
    const {type, ...request} = frame;
    try {
      const {receipt, changed} = await room.act(seatId, request);
      send({type: "receipt", receipt});
      if (changed) this.broadcast();
    } catch (error) {
      if (!(error instanceof RoomError)) throw error;
      send({type: "refused", actionId: request.actionId ?? null, error: error.message, view: room.view(seatId)});
    }
  }

  async webSocketClose(socket, code) {try {socket.close(code, "closing");} catch {}}

  /** Every connected seat gets its own view: never another seat's, whatever sockets are open. */
  broadcast() {
    for (const socket of this.ctx.getWebSockets()) {
      const [seatId] = this.ctx.getTags(socket);
      try {socket.send(JSON.stringify({type: "view", view: this.room.view(seatId)}));} catch {}
    }
  }
}
