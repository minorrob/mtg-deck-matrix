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

export const TABLE_SCHEMA = "CrankTable@1";
export const INVITE_TTL = 24 * 3600 * 1000;
const TABLE_ID = /^[a-z0-9]{8,40}$/;
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
  return {name: clean(deck.name) || commander[0] || "A deck", commander, cards: list};
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

  const api = {
    /** A new table, the host in seat 1. Seats after the first are a person to invite or an AI. */
    async create({tableId, host, hostName, seats, settings = {}}) {
      if (!TABLE_ID.test(String(tableId || ""))) throw new TableError(400, "A table needs its id.");
      if (await storage.get(KEY) !== null) throw new TableError(409, "This table already exists.");
      const others = Array.isArray(seats) ? seats : [];
      if (others.length < 1 || others.length > 3) throw new TableError(400, "A table seats two to four players.");
      const all = [{kind: "human", name: clean(hostName) || "Host"}, ...others.map((s, i) => ({kind: s && s.kind === "ai" ? "ai" : "human", name: clean(s && s.name) || (s && s.kind === "ai" ? `AI ${i + 2}` : `Seat ${i + 2}`)}))];
      record = {
        schema: TABLE_SCHEMA, tableId, host, created: true,
        lifecycle: createTable({tableId, seats: all.map((s, seatId) => ({seatId, kind: s.kind, name: s.name, occupied: seatId === 0})), settings: {startingLife: 40, ...settings}}),
        members: {0: host}, invites: [], decks: {}, matches: [],
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
      const read = readDeck(deck, cards);
      const version = (await sha256(JSON.stringify(read))).slice(0, 16);
      step({type: "deck", seatId, deckVersion: version}, now);
      if (seat.kind === "ai") step({type: "ready", seatId, ready: true}, now);
      record.decks[seatId] = read;
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
      const t = record.lifecycle;
      if (t.phase !== "countdown" || now < t.countdownAt) return null;
      const matchId = `${record.tableId}g${t.generation + 1}`;
      step({type: "tick"}, now, {launchId: matchId});
      const pod = {seats: t.seats.filter((s) => s.occupied).map((s) => ({
        seatId: seatName(s.seatId), name: s.name, pilot: s.kind === "ai" ? "house" : "human",
        commander: record.decks[s.seatId].commander, cards: record.decks[s.seatId].cards,
      }))};
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

    /** The table as one person sees it: every seat's state, but only their own deck's cards. */
    async view(email) {
      await load();
      const mine = seatOf(email);
      if (mine === null && !isHost(email)) throw new TableError(403, "You do not have a seat at this table.");
      const t = record.lifecycle;
      return {
        schema: TABLE_SCHEMA, tableId: record.tableId, phase: t.phase, revision: t.revision,
        youAreHost: isHost(email), yourSeat: mine,
        countdownAt: t.countdownAt, launchError: t.launchError, matchId: t.phase === "playing" ? t.matchId : null,
        blockers: countdownBlockers(t).map(({seatId, reason}) => ({seatId, reason})),
        seats: t.seats.map((s) => ({
          seatId: s.seatId, kind: s.kind, name: s.name, occupied: s.occupied, connected: s.connected, ready: s.ready,
          invited: s.invited, you: s.seatId === mine,
          deck: record.decks[s.seatId] ? {name: record.decks[s.seatId].name, commander: record.decks[s.seatId].commander} : null,
          ...(s.seatId === mine && record.decks[s.seatId] ? {cards: record.decks[s.seatId].cards.length} : {}),
        })),
      };
    },
  };
  return api;
}
