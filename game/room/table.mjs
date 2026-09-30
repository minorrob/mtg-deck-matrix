/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE TABLE (M5; the host and guest journeys Rob approved on 2026-09-26, docs/decisions-2026-09-25.md).
 *
 * The lobby around a game room: who sits where, who was invited, which deck each seat brings, who is ready,
 * the countdown, and the launch into the room (game/room/room.mjs). The rules of that lifecycle are the
 * pure contract the local host has used all along (game/contracts/table-lifecycle.mjs); this file gives it
 * identities and storage.
 *
 * A PERSON IS THEIR SIGNED-IN ADDRESS. In the cloud there are no seat tokens: Cloudflare Access has already
 * said who is asking, and only people on CrankMagic's invite list get that far (a table's link never adds
 * anyone to it; Rob, 2026-09-26). A seat is bound to an address when its invitation is redeemed, and from
 * then on that address is the seat. The address stays here, in the table; the room is told only "s0".."s3".
 *
 * THE JOURNEYS, AS RULES:
 *   host     creates the table and sits in seat 1; seats 2-4 are a person to invite, an AI, or left out
 *   invite   a link names this table and this seat; sending another withdraws the first; it keeps for a day
 *   join     the invited person lands on that seat; a person holds one seat at a table
 *   deck     each person brings their own deck, and the host brings the AI seats'; a deck with a card the
 *            engine cannot play is refused by name, as the room refuses it
 *   ready    then the host starts a 10-second countdown that waits for every person, and can cancel it
 *   launch   when the countdown ends the room starts; if it cannot, the table says why and goes back to
 *            choosing, the AI seats still ready
 */
import {createTable, transitionTable, countdownBlockers} from "../contracts/table-lifecycle.mjs";
import {startRoom, openRoom, RoomError, basicCards} from "./room.mjs";
import {createMatchStore} from "../engine/storage.mjs";

export const TABLE_SCHEMA = "CrankTable@1";
export const RECORD_SCHEMA = "CrankGameRecord@1";
export const INVITE_TTL = 24 * 3600 * 1000;
/* THE MATS a seat may play on (the handoff's Choose mat): five drawn by the app itself, and Rob's own artwork (2026-09-29:
   "They're all mine, publish them"; assets/playmats, crankmagic-mats.css). Nothing here is anyone else's art. A
   person's own uploaded mats wait on file storage. Felt is where every seat starts. */
export const DRAWN_MATS = Object.freeze(["felt", "forge", "cavern", "sea", "night"]);
export const ART_MATS = Object.freeze(["cloud-wolf", "sand-lion", "ember-serpent", "grove-stag", "star-gate", "moon-altar", "sky-citadel", "sky-dais",
  "star-tome", "dragon-pact", "moon-wolf", "falls-tree", "star-whale", "grove-arch", "molten-sword", "sky-tree", "void-ring", "desert-portal",
  "night-citadel", "white-sanctum", "grave-king", "tree-portal", "ringed-world", "mirror-gates", "orrery-bridge"]);
export const MATS = Object.freeze([...DRAWN_MATS, ...ART_MATS]);
/* A dropped player has this long to come back before they concede (Rob, 2026-09-26: five minutes). */
export const AWAY_LIMIT = 5 * 60 * 1000;
const TABLE_ID = /^[a-z0-9]{8,40}$/;
export const MATCH_ID = /^[a-z0-9]{8,40}g[1-9][0-9]{0,5}$/;
const KEY = "table";

export class TableError extends Error {
  constructor(status, message, extra = {}) {super(message); this.status = status; Object.assign(this, extra);}
}

const bytesToB64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (text) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
const seatName = (n) => `s${n}`;
const clean = (v, n = 60) => String(v ?? "").trim().slice(0, n);

/* The deck a seat brings: a name, its commander(s) and its cards, bounded, and every card playable. */
function readDeck(deck, cards) {
  if (!deck || typeof deck !== "object") throw new TableError(400, "Choose a deck for this seat.");
  const commander = (Array.isArray(deck.commander) ? deck.commander : []).map((c) => clean(c, 200)).filter(Boolean);
  const list = (Array.isArray(deck.cards) ? deck.cards : []).map((c) => clean(c, 200)).filter(Boolean);
  if (commander.length > 2 || commander.length + list.length === 0 || commander.length + list.length > 250) throw new TableError(400, "That is not a deck a table can hold.");
  const missing = [...new Set([...commander, ...list].filter((n) => !cards(n)))].sort();
  if (missing.length) throw new TableError(422, `The table cannot play ${missing.length === 1 ? "this card" : `these ${missing.length} cards`} yet: ${missing.join(", ")}.`, {unsupported: missing});
  /* The deck's bracket as its library measures it (the Decks page's B1-B5), which a table's limit is held to. */
  const bracket = Number.isInteger(deck.bracket) && deck.bracket >= 1 && deck.bracket <= 5 ? deck.bracket : null;
  return {name: clean(deck.name) || commander[0] || "A deck", commander, cards: list, bracket, source: readSource(deck.source)};
}

/* Which deck in the person's own library this was, so the finished game can be filed under it (M5: results
   back to the library). An id and a version the table never reads, shown back to that seat alone: another
   seat, the host included, never learns which deck of someone else's library came to the table. */
function readSource(source) {
  if (!source || typeof source !== "object") return null;
  const deckId = clean(source.deckId, 100), version = Number(source.deckVersion);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,99}$/.test(deckId)) return null;
  return {deckId, deckVersion: Number.isSafeInteger(version) && version >= 0 ? version : null};
}

/**
 * The table over its storage (a Durable Object's own, in the cloud).
 *
 * @param {object} storage  the M4 storage contract
 * @param {{cards?: Function, random?: (n: number) => Uint8Array}} options
 */
export function tableOn(storage, {cards = basicCards, random = (n) => crypto.getRandomValues(new Uint8Array(n))} = {}) {
  let record = null, room = null;
  const load = async () => {
    if (!record) record = JSON.parse((await storage.get(KEY)) || "null");
    if (!record) throw new TableError(404, "There is no table here.");
    return record;
  };
  const save = () => storage.put(KEY, JSON.stringify(record));
  const seatOf = (email) => {const n = Object.entries(record.members).find(([, e]) => e === email); return n ? Number(n[0]) : null;};
  const isHost = (email) => email === record.host;
  const step = (event, now, extra = {}) => {
    try {record.lifecycle = transitionTable(record.lifecycle, {...event, revision: record.lifecycle.revision}, {now, ...extra});}
    catch (error) {throw new TableError(409, error.message);}
  };
  const needHost = (email) => {if (!isHost(email)) throw new TableError(403, "Only the host can do that.");};
  const needSeat = (email) => {const s = seatOf(email); if (s === null) throw new TableError(403, "You do not have a seat at this table."); return s;};
  /* THE TABLE'S RULES (Rob, 2026-09-30): the starting life (CR 903.7's 40 unless the host says otherwise) and a bracket
     limit (none unless the host sets one). */
  const rulesOf = () => {const r = (record.lifecycle && record.lifecycle.settings) || {};
    return {startingLife: Number.isInteger(r.startingLife) ? r.startingLife : 40, bracketLimit: Number.isInteger(r.bracketLimit) ? r.bracketLimit : null};};
  const seatNames = (list) => list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;

  /* A seat leaves the game (by choice, or when their time ran out), and the table follows the room. */
  async function leaveSeat(seat, why, now) {
    const current = await api.currentRoom();
    if (!current) throw new TableError(409, "No game is being played at this table.");
    try {await current.leave(seatName(seat), why);} catch (error) {throw new TableError(error.status || 409, error.message);}
    step({type: "concede", seatId: seat}, now);
    if (record.away) delete record.away[seat];
    await settle(now);
  }
  /* When the game in the room is over, the table moves on to the rematch question. */
  async function settle(now) {
    if (record.lifecycle.phase === "playing" && room && room.status === "finished") {
      step({type: "completed", matchId: record.lifecycle.matchId}, now);
      record.away = {};
    }
    await save();
  }

  const api = {
    /** A new table, the host in seat 1. Seats after the first are a person to invite or an AI. */
    async create({tableId, host, hostName, seats, settings = {}, playtest = false}) {
      if (!TABLE_ID.test(String(tableId || ""))) throw new TableError(400, "A table needs its id.");
      if (await storage.get(KEY) !== null) throw new TableError(409, "This table already exists.");
      const others = Array.isArray(seats) ? seats : [];
      if (others.length < 1 || others.length > 3) throw new TableError(400, "A table seats two to four players.");
      const all = [{kind: "human", name: clean(hostName) || "Host"}, ...others.map((s, i) => ({kind: s && s.kind === "ai" ? "ai" : "human", name: clean(s && s.name) || (s && s.kind === "ai" ? `AI ${i + 2}` : `Seat ${i + 2}`)}))];
      record = {
        schema: TABLE_SCHEMA, tableId, host, created: true,
        lifecycle: createTable({tableId, seats: all.map((s, seatId) => ({seatId, kind: s.kind, name: s.name, occupied: seatId === 0})), settings: {startingLife: 40, bracketLimit: null, ...settings}}),
        members: {0: host}, invites: [], decks: {}, matches: [], away: {}, playtest: playtest === true,
      };
      await save();
      return api.view(host);
    },

    /** The host sends a seat's link. A new link for the same seat withdraws the one before. */
    async invite(email, seatId, now) {
      await load(); needHost(email);
      const seat = record.lifecycle.seats[seatId];
      if (!seat || seat.kind !== "human" || seat.seatId === 0) throw new TableError(400, "Only a person's seat is invited.");
      if (seat.occupied) throw new TableError(409, "Someone already sits there.");
      const code = bytesToB64url(random(32));
      step({type: "invited", seatId}, now);
      record.invites = [...record.invites.filter((i) => i.seatId !== seatId), {seatId, hash: await sha256(code), expiresAt: now + INVITE_TTL}];
      await save();
      return {code, seatId, expiresAt: now + INVITE_TTL};
    },
    async uninvite(email, seatId, now) {
      await load(); needHost(email);
      if (!record.invites.some((i) => i.seatId === seatId)) throw new TableError(404, "That seat has no invitation out.");
      step({type: "uninvited", seatId}, now);
      record.invites = record.invites.filter((i) => i.seatId !== seatId);
      await save();
      return api.view(email);
    },

    /** The invited person lands on their seat. The same person opening the link again is already there. */
    async join(email, code, now) {
      await load();
      const already = seatOf(email);
      const h = await sha256(String(code || ""));
      const invite = record.invites.find((i) => i.hash === h);
      if (!invite || invite.expiresAt <= now) {
        if (already !== null) return api.view(email);
        throw new TableError(410, "This invitation has expired or was withdrawn. Ask the host for a new link.");
      }
      if (already !== null) throw new TableError(409, "You already have a seat at this table.");
      step({type: "join", seatId: invite.seatId}, now);
      record.members[invite.seatId] = email;
      record.invites = record.invites.filter((i) => i !== invite);
      await save();
      return api.view(email);
    },

    /** A seat's deck: the person's own, or, for an AI seat, the host's choice (and an AI with a deck is ready). */
    async deck(email, seatId, deck, now) {
      await load();
      const seat = record.lifecycle.seats[seatId];
      if (!seat) throw new TableError(400, "There is no such seat.");
      if (seat.kind === "ai" ? !isHost(email) : seatOf(email) !== seatId) throw new TableError(403, "That is not your seat to choose for.");
      const read = readDeck(deck, cards), limit = rulesOf().bracketLimit;
      if (limit !== null && read.bracket !== null && read.bracket > limit)
        throw new TableError(409, `${read.name} is bracket ${read.bracket}, above this table's limit of ${limit}. Choose a deck at bracket ${limit} or lower, or ask the host to raise the limit.`);
      const version = (await sha256(JSON.stringify(read))).slice(0, 16);
      step({type: "deck", seatId, deckVersion: version}, now);
      if (seat.kind === "ai") step({type: "ready", seatId, ready: true}, now);
      record.decks[seatId] = read;
      await save();
      return api.view(email);
    },
    /** The host's Table rules (Rob, 2026-09-30): the starting life and the bracket limit, and not once any seat is ready.
        A change that would break the table is refused, saying what is wrong and what to do instead (AGENTS.md). */
    async rules(email, body, now) {
      await load(); needHost(email);
      const t = record.lifecycle;
      if (t.phase !== "selecting") throw new TableError(409, "The table's rules can change only before the game starts.");
      const ready = t.seats.filter((x) => x.ready).map((x) => x.name);
      if (ready.length) throw new TableError(409, `The rules can't change once a seat is ready, and ${seatNames(ready)} ${ready.length === 1 ? "is" : "are"}. Take back Ready (an AI seat is ready once its deck is chosen, so choose AI decks after the rules), then edit the rules.`);
      const now_ = rulesOf(), b = body || {};
      const life = b.startingLife === undefined ? now_.startingLife : Number(b.startingLife);
      if (!Number.isInteger(life) || life < 1 || life > 999) throw new TableError(400, "Starting life is a whole number from 1 to 999.");
      const limit = b.bracketLimit === undefined ? now_.bracketLimit : b.bracketLimit === null || b.bracketLimit === "" ? null : Number(b.bracketLimit);
      if (limit !== null && !(Number.isInteger(limit) && limit >= 1 && limit <= 5)) throw new TableError(400, "The bracket limit is 1 to 5, or none.");
      if (limit !== null) {
        const over = Object.entries(record.decks).filter(([, d]) => d && d.bracket !== null && d.bracket > limit).map(([seat, d]) => ({name: t.seats[seat].name, bracket: d.bracket}));
        if (over.length) {const top = Math.max(...over.map((x) => x.bracket));
          throw new TableError(409, `${seatNames(over.map((x) => `${x.name}'s deck (bracket ${x.bracket})`))} ${over.length === 1 ? "is" : "are"} above ${limit}. Change ${over.length === 1 ? "that deck" : "those decks"} first, or keep the limit at ${top} or higher.`);}
      }
      void now;
      record.lifecycle = {...t, settings: {...(t.settings || {}), startingLife: life, bracketLimit: limit}, revision: t.revision + 1};
      await save();
      return api.view(email);
    },
    /** Your seat's mat: cosmetic, so it can change at any point, the game included, and everyone sees it. */
    async mat(email, mat) {
      await load();
      const seat = needSeat(email);
      if (!MATS.includes(mat)) throw new TableError(400, "There is no such mat.");
      record.mats = {...(record.mats || {}), [seat]: mat};
      await save();
      return api.view(email);
    },
    async ready(email, ready, now) {
      await load();
      step({type: "ready", seatId: needSeat(email), ready: !!ready}, now);
      await save();
      return api.view(email);
    },

    /** The host starts the countdown; it ends ten seconds on unless someone unreadies or the host cancels. */
    async start(email, now) {
      await load(); needHost(email);
      step({type: "countdown"}, now);
      await save();
      return record.lifecycle.countdownAt;
    },
    async cancel(email, now) {
      await load(); needHost(email);
      step({type: "cancel-countdown"}, now);
      await save();
      return api.view(email);
    },

    /** When the countdown has run out: launch the room with each seat's deck. Nothing happens early. */
    async tick(now, {storageForRoom = storage} = {}) {
      await load();
      for (const [seat, until] of Object.entries(record.away || {})) {
        if (until <= now && record.lifecycle.phase === "playing") await leaveSeat(Number(seat), "timed-out", now);
      }
      const t = record.lifecycle;
      if (t.phase !== "countdown" || now < t.countdownAt) return null;
      const matchId = `${record.tableId}g${t.generation + 1}`;
      step({type: "tick"}, now, {launchId: matchId});
      const pod = {seats: t.seats.filter((s) => s.occupied).map((s) => ({
        seatId: seatName(s.seatId), name: s.name, pilot: s.kind === "ai" ? "house" : "human",
        commander: record.decks[s.seatId].commander, cards: record.decks[s.seatId].cards,
      })), startingLife: rulesOf().startingLife};
      try {
        room = await startRoom({storage: storageForRoom, matchId, cards, pod, seed: `${matchId}:${now}`});
        step({type: "engine-started", launchId: matchId, matchId}, now);
        record.matches.push(matchId);
      } catch (error) {
        step({type: "engine-failed", launchId: matchId, error: error instanceof RoomError ? error.message : "The rules engine did not start."}, now);
      }
      await save();
      return record.lifecycle.phase === "playing" ? matchId : null;
    },

    /* ---- leaving a game in play (Rob, 2026-09-26) ---- */

    /** Any person at the table ends the game for everyone; the record says it ended early. */
    async endGame(email, now) {
      await load();
      const seat = needSeat(email);
      const current = await api.currentRoom();
      if (!current) throw new TableError(409, "No game is being played at this table.");
      if (record.lifecycle.seats[seat].conceded) throw new TableError(409, "You have left this game.");
      try {await current.end(seatName(seat));} catch (error) {throw new TableError(error.status || 409, error.message);}
      await settle(now);
      return api.view(email);
    },
    /** A person leaves the game in play by conceding; play goes on without them. */
    async concede(email, now) {
      await load();
      const seat = needSeat(email);
      await leaveSeat(seat, "conceded", now);
      return api.view(email);
    },

    /** A seat's last connection closed. While a game is on, their five minutes start. */
    async dropped(seat, now) {
      await load();
      const s = record.lifecycle.seats[seat];
      if (!s || !s.occupied || s.kind !== "human" || !s.connected) return;
      step({type: "disconnect", seatId: seat}, now);
      record.away = record.away || {};
      if (record.lifecycle.phase === "playing") record.away[seat] = now + AWAY_LIMIT;
      await save();
    },
    /** They came back in time: their seat is as they left it. */
    async back(seat, now) {
      await load();
      const s = record.lifecycle.seats[seat];
      if (!s || !s.occupied || s.connected) return;
      step({type: "reconnect", seatId: seat}, now);
      if (record.away) delete record.away[seat];
      await save();
    },

    /** When the object should next wake: the countdown's end, or the first dropped player's time running out. */
    async nextAlarm() {
      await load();
      const times = Object.values(record.away || {});
      if (record.lifecycle.phase === "countdown") times.push(record.lifecycle.countdownAt);
      return times.length ? Math.min(...times) : null;
    },

    /** The room of the game being played, whoever asks (the object's own sockets), or null. */
    async currentRoom() {
      await load();
      if (record.lifecycle.phase !== "playing") return null;
      if (!room || room.matchId !== record.lifecycle.matchId) room = await openRoom({storage, matchId: record.lifecycle.matchId, cards});
      return room;
    },

    /** The room of the game being played, for the seat this person holds. */
    async room(email) {
      await load();
      const seat = needSeat(email);
      if (record.lifecycle.phase !== "playing") throw new TableError(409, "No game is being played at this table.");
      if (!room || room.matchId !== record.lifecycle.matchId) room = await openRoom({storage, matchId: record.lifecycle.matchId, cards});
      return {room, seatId: seatName(seat)};
    },

    /**
     * A FINISHED GAME'S RECORD (M8b; Rob's go, 2026-09-29). A record shows what the game hid, so there is none
     * while it goes on. On a PLAYTEST table (made one by the Worker, never by the request: staging's tables are)
     * it is the whole game -- its seed, pod, decision tape and journal, which game/room/replay.mjs plays again --
     * so a finding can be seen happen twice. On any other table it is the asking seat's own: its last view and
     * the public history, never the seed (which with the pod would deal every hand again) or the tape.
     * Nobody's address is in either: the room only ever knew "s0".."s3".
     */
    async record(email, matchId) {
      await load();
      const seat = needSeat(email), id = matchId || record.matches.at(-1);
      if (!id || !record.matches.includes(id)) throw new TableError(404, "There is no such game at this table.");
      const game = room && room.matchId === id ? room : await openRoom({storage, matchId: id, cards});
      if (game.status !== "finished") throw new TableError(409, "A game's record is ready once the game is over.");
      const seatId = seatName(seat);
      if (!game.seats.some((s) => s.seatId === seatId)) throw new TableError(403, "You did not have a seat in that game.");
      const mine = game.view(seatId), base = {schema: RECORD_SCHEMA, tableId: record.tableId, matchId: id, playtest: !!record.playtest, result: mine.result, departures: mine.departures, seats: game.seats, history: game.history};
      if (!record.playtest) return {...base, kind: "seat", seatId, view: mine};
      const store = createMatchStore(storage, id), meta = await store.loadMatch();
      return {...base, kind: "full", seed: meta.seed, pod: meta.pod, tape: await store.readTape(), journal: await store.readJournal()};
    },

    /** The table as one person sees it: every seat's state, but only their own deck's cards. */
    async view(email, {any = false} = {}) {
      await load();
      const mine = email === null ? null : seatOf(email);
      if (!any && mine === null && !isHost(email)) throw new TableError(403, "You do not have a seat at this table.");
      const t = record.lifecycle;
      return {
        schema: TABLE_SCHEMA, tableId: record.tableId, phase: t.phase, revision: t.revision, playtest: !!record.playtest,
        youAreHost: isHost(email), yourSeat: mine,
        countdownAt: t.countdownAt, launchError: t.launchError, matchId: t.phase === "playing" ? t.matchId : null,
        blockers: countdownBlockers(t).map(({seatId, reason}) => ({seatId, reason})),
        rules: rulesOf(),
        away: Object.entries(record.away || {}).map(([seatId, until]) => ({seatId: Number(seatId), until})),
        seats: t.seats.map((s) => ({
          seatId: s.seatId, kind: s.kind, name: s.name, occupied: s.occupied, connected: s.connected, ready: s.ready,
          invited: s.invited, you: s.seatId === mine, mat: (record.mats || {})[s.seatId] || "felt",
          deck: record.decks[s.seatId] ? {name: record.decks[s.seatId].name, commander: record.decks[s.seatId].commander, bracket: record.decks[s.seatId].bracket ?? null} : null,
          ...(s.seatId === mine && record.decks[s.seatId] ? {cards: record.decks[s.seatId].cards.length, source: record.decks[s.seatId].source || null} : {}),
        })),
      };
    },
  };
  return api;
}
