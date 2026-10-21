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
 *   ws   {type:"act", ...}    the §12.1 action envelope -> {type:"receipt"} to the sender, {type:"view"} to all; or,
 *                             refused with nothing changed, {type:"refused", status, error, view} to the sender alone
 *   ws   {type:"view"}        the sender's view again; with `after` (an event id), the events since it, or `eventsReset`
 *   ws   {type:"yield", on}   Yield turn on, or Stop yielding -> every seat's view; refused as `prefer` is
 *   ws   {type:"check", choiceId, indices}  a draft checked, nothing changed -> {type:"checked", ok, open, reasons}
 *                             to the sender alone
 */
import {startRoom, openRoom, RoomError, basicCards} from "../game/room/room.mjs";
import {tableOn, TableError, llmWaiting} from "../game/room/table.mjs";
import {tableDefinition} from "../game/engine/cards/definitions.mjs";
import {candidateDefinition} from "../game/engine/cards/candidates.mjs";
import {agentBrief, pickOf} from "../game/room/agent-brief.mjs";
import {createAi, everyone, settings, pilot, pilotWorst, Closed} from "./ai.mjs";

/* WHAT THE TABLE PLAYS (M5; the plan review's A2 and C4): the basic lands, and every definition in the engine's card
   directory (game/engine/cards/definitions.mjs, generated from it). A deck whose every card is one of these takes a
   seat; any other is refused by name (game/room/table.mjs, readDeck). */
/* The cards a table plays: the engine's own definitions, the ones every card's scenarios are played with (tests/engine-cards.mjs),
   basic lands among them -- and the room's own basics only for one it does not hold. Basics first, they were the room's
   bare ones, with no Basic and no land type, so "search your library for a basic land card" found nothing at any table
   (Rob, 2026-10-11, Rampant Growth; tests/table-basics.mjs). */
export const tableCards = (name) => tableDefinition(name) ?? basicCards(name);
/* And what a playtest table plays besides (Rob's decision 2; card load step 5): the card compiler's candidates
   (game/engine/cards/candidates.mjs, generated from data/engine/candidates.json), each labeled on the board, where the
   directory has no definition. No other table seats one (game/room/table.mjs, `candidates`). */
export const tableCandidates = (name) => candidateDefinition(name);

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
/* The engine steps a room plays in one request or alarm before it stops and the alarm plays on (game/room/room.mjs,
   `continuing`): a Durable Object has 30 s of CPU for each. A step, not a clock: a Worker's clock stands still while it
   computes, so a slice cannot stop itself by time. A whole game of four house pilots is 1,500 to 4,500 steps. At 250 the
   longest slice of engine-room-games' ten pinned games took 5.0 s on the cloud container (Node 22, 2026-10-05); once the
   house pilot could pay from a pool more than one way (X8b, 2026-10-06), seed 4 became a 75-turn game whose late board
   (The Scarab God, Teysa Karlov, a dozen attackers) costs 300-900 ms a step, and its longest slice took 9.0 s at 250 and
   6.7 s at 100 -- about 17 s on the slowest machine measured, which runs these games about 2.6 times slower
   (docs/review-response-2026-10-05.md, "Slices"). A person's decision ends a slice sooner. */
export const SLICE_STEPS = 100;
/* The LLM seat's decisions one alarm answers before it comes back for the rest, and the game's own cap, in cents, when
   AI_CAP_PILOT_GAME_CENTS is not set (Rob, 2026-10-10: "0.25 per game is good"). */
export const AGENT_TURNS = 8;
export const PILOT_GAME_CENTS = 25;

export class GameRoom {
  constructor(ctx, env, {cards = tableCards, slice = SLICE_STEPS} = {}) {
    this.ctx = ctx; this.env = env; this.cards = cards; this.slice = slice; this.room = null;
    this.storage = objectStorage(ctx.storage);
  }

  async load() {
    if (this.room) return this.room;
    const matchId = await this.ctx.storage.get(MATCH_KEY);
    if (!matchId) return null;
    this.room = await openRoom({storage: this.storage, matchId, cards: this.cards, slice: this.slice});
    return this.room;
  }

  async fetch(request) {
    const url = new URL(request.url), seatId = request.headers.get("x-crankmagic-seat") || "";
    try {
      if (request.method === "POST" && url.pathname === "/start") {
        if (await this.load()) return reply(409, {error: "This table already has a game."});
        const {matchId, seed, pod} = await request.json();
        this.room = await startRoom({storage: this.storage, matchId: String(matchId || ""), cards: this.cards, pod, seed, slice: this.slice});
        await this.ctx.storage.put(MATCH_KEY, this.room.matchId);
        await this.schedule();
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
    /* A reconnect names the last event it handled (`events.v1`, Linear ROB-77; game/room/room.mjs, view): the view
       carries the events since, or says `eventsReset` when they are older than the room keeps. */
    if (frame && frame.type === "view") return send({type: "view", view: room.view(seatId, typeof frame.after === "string" ? {after: frame.after} : {})});
    /* Yield turn (Linear ROB-13; room.mjs, yieldTurn), and Stop yielding. Yielding can pass for the seat at once, so every
       seat's view moves, as after an action. */
    if (frame && frame.type === "yield") {
      try {await room.yieldTurn(seatId, {on: frame.on === true});}
      catch (error) {if (!(error instanceof RoomError)) throw error; return send({type: "refused", of: "yield", status: error.status, error: error.message, view: room.view(seatId)});}
      this.broadcast();
      return this.schedule();
    }
    /* A draft of the seat's answer checked before Confirm (Linear ROB-75; room.mjs, check): to the sender alone, and
       nothing changes, so nothing is broadcast. */
    if (frame && frame.type === "check") {
      try {return send({type: "checked", choiceId: frame.choiceId ?? null, ...room.check(seatId, {choiceId: frame.choiceId, indices: frame.indices})});}
      catch (error) {if (!(error instanceof RoomError)) throw error; return send({type: "refused", of: "check", status: error.status, error: error.message});}
    }
    /* A person's way of playing (game/room/room.mjs, prefer): Settings' "stop at every step of my turn". */
    if (frame && frame.type === "prefer") {
      try {await room.prefer(seatId, {stepByStep: frame.stepByStep === true});}
      catch (error) {if (!(error instanceof RoomError)) throw error; return send({type: "refused", of: "prefer", status: error.status, error: error.message, view: room.view(seatId)});}
      return send({type: "view", view: room.view(seatId)});
    }
    if (!frame || frame.type !== "act") return send({type: "refused", error: "That message is not one the table reads."});
    const {type, ...request} = frame;
    try {
      const {receipt, changed} = await room.act(seatId, request);
      send({type: "receipt", receipt});
      if (changed) {this.broadcast(); await this.schedule();}
    } catch (error) {
      if (!(error instanceof RoomError)) throw error;
      /* Refused, nothing changed: why, in the room's words (an answer the rules refuse is the rules' own, 422), and the
         sender's view, which still asks them the same question (game/room/room.mjs, act). */
      send({type: "refused", actionId: request.actionId ?? null, status: error.status, error: error.message, view: room.view(seatId)});
    }
  }

  async webSocketClose(socket, code) {try {socket.close(code, "closing");} catch {}}

  /** While the AI seats play on in slices, the alarm comes straight back for the next one. */
  async schedule() {
    if (this.room && this.room.continuing) await this.ctx.storage.setAlarm(Date.now());
  }
  async alarm() {
    const room = await this.load();
    if (room && room.continuing) {await room.resume(); this.broadcast();}
    await this.schedule();
  }

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
 *   POST /table/mat {mat}   your seat's mat, one of MATS in game/room/table.mjs
 *   POST /table/end      any person ends the game for everyone (the board asks a second tap first)
 *   POST /table/concede  you leave the game in play
 *   POST /table/rematch {accept}  Play again, once the game is over: true for another game, false to leave the table
 *        (Requests row 12, Linear ROB-167; game/room/table.mjs, rematch). The table's `rematch` says who has answered
 *        and until when; the answer that completes everyone's may start the next game's countdown
 *   POST /table/report {cardId, note}  a candidate your seat can see said to play wrong, at a playtest table only (Rob's
 *        decision 2): kept with the table, handed over in that game's record (game/room/table.mjs, reportCard)
 *   GET  /table/record?match=<matchId>  a finished game's record (M8b): the whole game on a playtest table, your
 *        own seat's elsewhere. A table is a playtest table when the Worker's PLAYTEST_TABLES is "on" as it is made.
 *   GET  /table/brief    the Coach's brief for your seat (X13), asked for by the Worker's AI door alone
 *   GET  /connect (websocket), once the game is on: the seat this address holds
 *
 * ONE ALARM, TWO CLOCKS: the countdown's end, and a dropped player's five minutes (Rob, 2026-09-26). When a
 * seat's last socket closes mid-game its clock starts and the others are told who they are waiting for and
 * until when; a socket back in time stops it; the alarm concedes whoever ran out, recorded as not finished.
 * And Play again's two minutes once a game is over (REMATCH_WINDOW): when they run out, silence is a No and the
 * table decides. A game that ends in the room itself wakes the alarm at once, so the table moves on to Play again.
 */
export class GameTable extends GameRoom {
  constructor(ctx, env, options = {}) {
    super(ctx, env, options);
    this.now = options.now || (() => Date.now());
    /* The model's fetch, for a suite to stand in for (the LLM seat); the platform's otherwise. */
    this.fetchImpl = options.fetchImpl || null;
    this.table = tableOn(this.storage, {cards: this.cards, candidates: options.candidates || tableCandidates, slice: this.slice, ...(options.random ? {random: options.random} : {})});
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
      if (route === "POST /table/create") {
        const b = await body();
        /* An AI on Claude is seated only where the AI door would let this host spend on it (AI-2). */
        const llm = Array.isArray(b.seats) && b.seats.some((s) => s && s.kind === "ai" && s.level === "llm");
        return reply(201, {table: await t.create({tableId: b.tableId, host: email, hostName: b.hostName, seats: b.seats, playtest: this.env?.PLAYTEST_TABLES === "on",
          llmAllowed: llm && (await this.pilotOpen(email)) === null})});
      }
      /* With the table, the object's own time: a countdown is read against the clock that set it, not the device's. */
      if (route === "GET /table") return reply(200, {table: await t.view(email), now});
      if (route === "GET /table/record") return reply(200, {record: await t.record(email, url.searchParams.get("match") || undefined)});
      /* The Coach's brief for this person's seat (game/room/coach-brief.mjs). Only the Worker's AI door asks for it: the
         front door (cloud/tables.mjs) forwards no such path. */
      /* `?hand=0`: the person has set the Coach to see their board only (AI-6). */
      if (route === "GET /table/brief") return reply(200, {brief: await t.brief(email, {hand: url.searchParams.get("hand") !== "0"})});
      if (route === "POST /table/invite") return reply(201, {invite: await t.invite(email, Number((await body()).seatId), now)});
      if (route === "POST /table/uninvite") return reply(200, {table: await t.uninvite(email, Number((await body()).seatId), now)});
      if (route === "POST /table/join") return reply(200, {table: await t.join(email, (await body()).code, now)});
      if (route === "POST /table/deck") {const b = await body(); return reply(200, {table: await t.deck(email, Number(b.seatId), b.deck, now)});}
      if (route === "POST /table/known") return reply(200, {unknown: await t.unknown((await body()).names)});
      if (route === "POST /table/ready") return reply(200, {table: await t.ready(email, (await body()).ready, now)});
      if (route === "POST /table/report") return reply(201, {report: await t.reportCard(email, await body(), now)});
      if (route === "POST /table/mat") return reply(200, {table: await t.mat(email, String((await body()).mat || ""))});
      if (route === "POST /table/rules") return reply(200, {table: await t.rules(email, await body(), now)});
      if (route === "POST /table/start") {await t.start(email, now); await this.schedule(); return reply(200, {table: await t.view(email)});}
      if (route === "POST /table/cancel") {const view = await t.cancel(email, now); await this.schedule(); return reply(200, {table: view});}
      if (route === "POST /table/end") {const room = await this.load(); const view = await t.endGame(email, now); await this.schedule(); await this.share(room); return reply(200, {table: view});}
      if (route === "POST /table/concede") {const room = await this.load(); const view = await t.concede(email, now); await this.schedule(); await this.share(room); return reply(200, {table: view});}
      /* Play again: the answer may start the next game's countdown, or settle the table; the alarm follows either. */
      if (route === "POST /table/rematch") {const view = await t.rematch(email, (await body()).accept, now); await this.schedule(); return reply(200, {table: view});}
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
    const next = await this.table.nextAlarm(this.now());
    if (next === null) await this.ctx.storage.deleteAlarm(); else await this.ctx.storage.setAlarm(next);
  }

  /** The countdown's end, a dropped player's time running out, or the AI seats' next slice. Whatever has not run out
      waits for the next alarm. */
  async alarm() {
    const room = await this.load();
    if (room && room.continuing) await room.resume();
    await this.table.tick(this.now());
    await this.agentTurns(await this.load());
    await this.schedule();
    await this.share(room);
  }

  /* THE LLM SEAT'S TURNS (AI-2, docs/plan-to-done-2026-09-30.md). The room stops at the seat's close calls
   * (game/engine/pilots/agent-pilot.mjs) and the table answers them here, on its alarm, so a person's own request is
   * never held for a model. Each is asked of the model through the AI door (cloud/ai.mjs `pilot`), under the host's
   * name and caps, within the game's own cap (AI_CAP_PILOT_GAME_CENTS, 25 by default: Rob, 2026-10-10, "0.25 per game
   * is good"). Whenever the model may not or cannot answer -- the door shut, the cap reached, a failure, an option that
   * was not offered, an answer the rules refuse -- the seat's own pilot answers (room.houseAnswer). Either way the
   * answer goes through `act`, onto the tape. AGENT_TURNS a call, then the alarm comes back for the rest. */
  async agentTurns(room) {
    for (let n = 0; n < AGENT_TURNS && llmWaiting(room); n += 1) {
      const seatId = room.waitingOn, view = room.view(seatId);
      const house = room.houseAnswer(seatId);
      const chosen = await this.agentChoice(room, view, house.indices).catch(() => null);
      const send = (asked, answer) => room.act(seatId, {actionId: crypto.randomUUID(), revision: asked.revision, kind: "answer", choiceId: asked.decision.id, ...answer});
      try {await send(view, chosen ? {indices: chosen} : house);}
      catch (error) {
        if (!(error instanceof RoomError) || !chosen) throw error;
        const again = room.view(seatId);
        await send(again, room.houseAnswer(seatId));
      }
      this.broadcast();
    }
  }

  /** Null when this host may ask the model for an LLM seat; otherwise why not. */
  async pilotOpen(email) {
    if (this.env?.AI_PILOT !== "on") return "The AI seat on Claude is not switched on here.";
    try {settings(this.env);} catch (error) {return error.message;}
    if (!this.env.DB || !(await createAi(this.env.DB, {everyone: everyone(this.env)}).allowed(email))) return "That account is not on CrankMagic's list for AI features.";
    return null;
  }

  /** The model's indices for the seat's decision, or null when it may not or cannot answer. */
  async agentChoice(room, view, hint) {
    const host = await this.table.host();
    if ((await this.pilotOpen(host)) !== null) return null;
    const config = settings(this.env), brief = agentBrief(view, hint);
    const key = `pilot-spent/${room.matchId}`, spent = Number(await this.ctx.storage.get(key)) || 0;
    const cap = (Number(this.env.AI_CAP_PILOT_GAME_CENTS) > 0 ? Number(this.env.AI_CAP_PILOT_GAME_CENTS) : PILOT_GAME_CENTS) * 10000;
    if (spent + pilotWorst(brief, config.model) > cap) return null;
    /* The call log on the table's clock, as the countdown and the away clocks are: a suite's fixed clock logs its calls,
       and reads the day's caps, in its own day. */
    const ai = createAi(this.env.DB, {now: () => new Date(this.now()).toISOString()});
    let asked;
    try {asked = await pilot({ai, who: {email: host}, brief, config, fetchImpl: this.fetchImpl ?? fetch});}
    catch (error) {if (error instanceof Closed) return null; throw error;}
    await this.ctx.storage.put(key, spent + asked.micros);
    const indices = pickOf(view.decision, asked.answer);
    await asked.done(indices ? "ok" : "ungrounded");
    return indices;
  }

  /** Everyone's view after a change, from the room it was made in. A game that just ended is no longer the
   *  table's current one, and its players are still owed the view that says it is over. */
  async share(room) {
    this.room = (await this.load()) || room;
    if (this.room) this.broadcast();
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
