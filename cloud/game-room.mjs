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
import {tableOn, TableError} from "../game/room/table.mjs";

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
        const pair = this.socketPair();
        this.accept(pair[1], seatId);
        return this.upgraded(pair[0]);
      }
      return reply(404, {error: "No such endpoint."});
    } catch (error) {
      if (error instanceof RoomError) return reply(error.status, {error: error.message, ...(error.unsupported ? {unsupported: error.unsupported} : {})});
      throw error;
    }
  }

  /* The platform's two WebSocket pieces, named so a test in Node (which has neither) can stand in for them. */
  socketPair() {return new WebSocketPair();}
  upgraded(client) {return new Response(null, {status: 101, webSocket: client});}

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

/* THE TABLE AS A DURABLE OBJECT: the lobby (game/room/table.mjs) and, once it launches, its game room, in one
 * object per table. The Worker's front door (cloud/tables.mjs) has already checked who is asking and passes
 * their address in `x-crankmagic-email`; the table turns it into a seat, and the room only ever sees "s0".
 * The countdown runs on the object's alarm, so it ends on time whether or not anyone is connected.
 *
 *   POST /table/create {tableId, hostName, seats}    GET /table
 *   POST /table/invite {seatId} -> {code}            POST /table/uninvite {seatId}
 *   POST /table/join {code}                          POST /table/deck {seatId, deck}
 *   POST /table/ready {ready}                        POST /table/start    POST /table/cancel
 *   POST /table/end      any person ends the game for everyone (the board asks a second tap first)
 *   POST /table/concede  you leave the game in play
 *   GET  /connect (websocket), once the game is on: the seat this address holds
 *
 * ONE ALARM, TWO CLOCKS: the countdown's end, and a dropped player's five minutes (Rob, 2026-09-26). When a
 * seat's last socket closes mid-game its clock starts and the others are told who they are waiting for and
 * until when; a socket back in time stops it; the alarm concedes whoever ran out, recorded as not finished.
 */
export class GameTable extends GameRoom {
  constructor(ctx, env, options = {}) {
    super(ctx, env, options);
    this.now = options.now || (() => Date.now());
    this.table = tableOn(this.storage, {cards: this.cards, ...(options.random ? {random: options.random} : {})});
  }

  async load() {
    this.room = await this.table.currentRoom().catch(() => null);
    return this.room;
  }

  async fetch(request) {
    const url = new URL(request.url), email = (request.headers.get("x-crankmagic-email") || "").toLowerCase();
    const body = async () => {try {return await request.json();} catch {throw new TableError(400, "That request is not JSON.");}};
    const t = this.table, now = this.now();
    try {
      if (!email) return reply(401, {error: "Sign in to use a table."});
      const route = `${request.method} ${url.pathname}`;
      if (route === "POST /table/create") {const b = await body(); return reply(201, {table: await t.create({tableId: b.tableId, host: email, hostName: b.hostName, seats: b.seats})});}
      /* With the table, the object's own time: a countdown is read against the clock that set it, not the device's. */
      if (route === "GET /table") return reply(200, {table: await t.view(email), now});
      if (route === "POST /table/invite") return reply(201, {invite: await t.invite(email, Number((await body()).seatId), now)});
      if (route === "POST /table/uninvite") return reply(200, {table: await t.uninvite(email, Number((await body()).seatId), now)});
      if (route === "POST /table/join") return reply(200, {table: await t.join(email, (await body()).code, now)});
      if (route === "POST /table/deck") {const b = await body(); return reply(200, {table: await t.deck(email, Number(b.seatId), b.deck, now)});}
      if (route === "POST /table/ready") return reply(200, {table: await t.ready(email, (await body()).ready, now)});
      if (route === "POST /table/start") {await t.start(email, now); await this.schedule(); return reply(200, {table: await t.view(email)});}
      if (route === "POST /table/cancel") {const view = await t.cancel(email, now); await this.schedule(); return reply(200, {table: view});}
      if (route === "POST /table/end") {const view = await t.endGame(email, now); await this.schedule(); await this.load(); this.broadcast(); return reply(200, {table: view});}
      if (route === "POST /table/concede") {const view = await t.concede(email, now); await this.schedule(); await this.load(); this.broadcast(); return reply(200, {table: view});}
      if (route === "GET /connect") {
        if (request.headers.get("upgrade") !== "websocket") return reply(426, {error: "Connect with a WebSocket."});
        const {room, seatId} = await t.room(email);
        this.room = room;
        const pair = this.socketPair();
        this.accept(pair[1], seatId);
        await this.returned(seatId);
        return this.upgraded(pair[0]);
      }
      return reply(404, {error: "No such endpoint."});
    } catch (error) {
      if (error instanceof TableError || error instanceof RoomError) return reply(error.status, {error: error.message, ...(error.unsupported ? {unsupported: error.unsupported} : {})});
      throw error;
    }
  }

  /** Set the one alarm to whichever clock runs out first, or clear it. */
  async schedule() {
    const next = await this.table.nextAlarm();
    if (next === null) await this.ctx.storage.deleteAlarm(); else await this.ctx.storage.setAlarm(next);
  }

  /** The countdown's end, or a dropped player's time running out. Whatever has not run out waits for the next alarm. */
  async alarm() {
    await this.table.tick(this.now());
    await this.schedule();
    if (await this.load()) this.broadcast();
  }

  /** A seat's socket opened: if they had dropped, their clock stops and everyone's view is fresh. */
  async returned(seatId) {
    await this.table.back(Number(seatId.slice(1)), this.now());
    await this.schedule();
    this.broadcast();
  }

  /** A socket closed. If it was that seat's last, their clock starts, and the others are told until when. */
  async webSocketClose(socket, code) {
    try {socket.close(code, "closing");} catch {}
    const [seatId] = this.ctx.getTags(socket);
    const open = this.ctx.getWebSockets().filter((s) => s !== socket && this.ctx.getTags(s)[0] === seatId);
    if (open.length) return;
    const seat = Number(seatId.slice(1)), now = this.now();
    await this.table.dropped(seat, now);
    await this.schedule();
    const away = (await this.table.view(null, {any: true})).away.find((a) => a.seatId === seat);
    for (const other of this.ctx.getWebSockets()) {
      if (other === socket) continue;
      try {other.send(JSON.stringify({type: "away", seatId, until: away ? away.until : null}));} catch {}
    }
  }
}
