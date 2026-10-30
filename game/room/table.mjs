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
 *   again    when the game is over each person answers Play again, Yes or No (No is leaving), within two minutes;
 *            the people who stay play the next game with the same seats, decks and rules (`rematch`)
 */
import {createTable, transitionTable, countdownBlockers} from "../contracts/table-lifecycle.mjs";
import {coachBrief} from "./coach-brief.mjs";
import {startRoom, openRoom, RoomError, basicCards} from "./room.mjs";
import {createMatchStore} from "../engine/storage.mjs";
import {resultRecord} from "./result-record.mjs";
import {loungeOn} from "./lounge.mjs";
import {readSeatAi} from "../engine/pilots/roster.mjs";

/* An AI seat's setting (AI-2) and persona (docs/ai-players/PLAN-2026-10-26.html §7), as the roster offers them
   (game/engine/pilots/roster.mjs): a level that is available, "normal" unless one was chosen; a persona on the roster, or none. */
const levelOf = (s) => readSeatAi(s).level;
const personaOf = (s) => readSeatAi(s).persona;
/** Whether the room is waiting on an LLM seat, whose answer the table's object gives (cloud/game-room.mjs). */
export const llmWaiting = (room) => !!room && !!room.waitingOn && room.status !== "finished" && room.seats.some((s) => s.seatId === room.waitingOn && s.level === "llm");

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
/* The mats an AI seat is given (the lounge, game/room/lounge.mjs): the art mats and the drawn ones, felt kept for the people. */
export const AI_MATS = Object.freeze([...ART_MATS, ...DRAWN_MATS.filter((m) => m !== "felt")]);
/* A dropped player has this long to come back before they concede (Rob, 2026-09-26: five minutes), when another person is
   at the table to wait on them (`dropped`). */
export const AWAY_LIMIT = 5 * 60 * 1000;
/* How long a finished game's players have to answer Play again (Requests row 12, Linear ROB-167), from the moment it ended.
   The lifecycle counts from `rematchAt` and names no length (game/contracts/table-lifecycle.mjs, `rematch-deadline`), so
   it is set here: two minutes, what the local host's table waited (game/server/table-broker.mjs, settleRematch) -- long
   enough to read the result and answer, short enough that nobody waits long on a player who walked away. Past it, a
   person who has not answered has said No. */
export const REMATCH_WINDOW = 2 * 60 * 1000;
const TABLE_ID = /^[a-z0-9]{8,40}$/;
export const MATCH_ID = /^[a-z0-9]{8,40}g[1-9][0-9]{0,5}$/;
const KEY = "table";
/* The candidate reports one table keeps (`reportCard`): ample for a playtest, and a bound on what one table stores. */
const CARD_REPORTS = 200;

export class TableError extends Error {
  constructor(status, message, extra = {}) {super(message); this.status = status; Object.assign(this, extra);}
}

const bytesToB64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (text) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
const seatName = (n) => `s${n}`;
const clean = (v, n = 60) => String(v ?? "").trim().slice(0, n);

/* ONLY A CARD THAT CAN BE A COMMANDER IS ONE (CR 903.3): a legendary creature, or a card that says it "can be your
   commander" (its definition's `canBeCommander`, game/engine/cards/index.mjs). The library already offers only
   verified commanders; the table holds every deck to the rule itself, since a deck reaches it from a page. The one
   exception is the Basic lands test deck (crankmagic-table.js, TEST_DECK; Rob, 2026-09-29), a basic land at the head
   of basic lands, and only on a playtest table, made while the engine played basic lands only (Rob, 2026-10-01: "confirming
   a basic land being the commander in the test deck is an exception"). */
const BASIC_LANDS = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"]);
export function commanderLegal(definition) {
  if (!definition) return false;
  if (definition.canBeCommander === true) return true;
  return (definition.types || []).includes("Creature") && (definition.supertypes || []).includes("Legendary");
}
export const isBasicLandsTestDeck = (commander, list) => commander.length === 1 && BASIC_LANDS.has(commander[0]) && list.every((n) => BASIC_LANDS.has(n));

/* TWO COMMANDERS ARE PARTNERS OR THEY ARE NOT TWO COMMANDERS (CR 702.124a). Each partner ability says what the other
   must be, and two different ones never combine (702.124f): both with partner (h); both with the same "Partner--"
   ability (i); each "Partner with" the other (j); one that chooses a Background with a legendary Background
   enchantment (k), which can be a commander no other way; the Doctor's companion with a legendary Time Lord Doctor that
   is no other creature type (m). Read from the definitions' `partners` (game/engine/cards/index.mjs, partnersIn). */
const has = (definition, kind) => (definition?.partners || []).filter((p) => p.kind === kind);
const isBackground = (d) => (d?.types || []).includes("Enchantment") && (d?.subtypes || []).includes("Background") && (d?.supertypes || []).includes("Legendary");
const isDoctor = (d) => (d?.types || []).includes("Creature") && (d?.supertypes || []).includes("Legendary")
  && (d?.subtypes || []).length === 2 && (d?.subtypes || []).includes("Time Lord") && (d?.subtypes || []).includes("Doctor");
const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const chosenBackground = (a, b) => has(a, "background").length > 0 && isBackground(b);
export function partnered([nameA, nameB], [a, b]) {
  if (has(a, "partner").length && has(b, "partner").length) return true;
  if (has(a, "text").some((p) => has(b, "text").some((q) => q.text === p.text))) return true;
  if (has(a, "with").some((p) => sameName(p.name, nameB)) && has(b, "with").some((q) => sameName(q.name, nameA))) return true;
  if (chosenBackground(a, b) || chosenBackground(b, a)) return true;
  return (has(a, "doctor").length > 0 && isDoctor(b)) || (has(b, "doctor").length > 0 && isDoctor(a));
}

/* The deck a seat brings: a name, its commander(s) and its cards, bounded, every card playable, and every commander
   one that can be. */
function readDeck(deck, cards, {playtest = false} = {}) {
  if (!deck || typeof deck !== "object") throw new TableError(400, "Choose a deck for this seat.");
  const commander = (Array.isArray(deck.commander) ? deck.commander : []).map((c) => clean(c, 200)).filter(Boolean);
  const list = (Array.isArray(deck.cards) ? deck.cards : []).map((c) => clean(c, 200)).filter(Boolean);
  if (commander.length > 2 || commander.length + list.length === 0 || commander.length + list.length > 250) throw new TableError(400, "That is not a deck a table can hold.");
  const missing = [...new Set([...commander, ...list].filter((n) => !cards(n)))].sort();
  if (missing.length) throw new TableError(422, `The table cannot play ${missing.length === 1 ? "this card" : `these ${missing.length} cards`} yet: ${missing.join(", ")}.`, {unsupported: missing});
  /* A Background is a commander only beside the one that chose it (CR 702.124k). */
  const other = (n) => cards(commander.find((m) => m !== n) ?? "");
  const notCommanders = commander.filter((n) => !commanderLegal(cards(n)) && !(commander.length === 2 && chosenBackground(other(n), cards(n))));
  if (notCommanders.length && !(playtest && isBasicLandsTestDeck(commander, list)))
    throw new TableError(422, `${notCommanders.join(" and ")} ${notCommanders.length === 1 ? "can't be a commander" : "can't be commanders"}: a commander is a legendary creature, or a card that says it can be your commander${notCommanders.some((n) => isBackground(cards(n))) ? "; a Background is one only beside a commander that says Choose a Background" : ""}.`, {notCommanders});
  if (commander.length === 2 && !partnered(commander, commander.map(cards)))
    throw new TableError(422, `${commander[0]} and ${commander[1]} can't both be commanders: two commanders must be partners. Both need Partner (or the same named Partner ability), each must say Partner with the other, or one must say Choose a Background and the other be a Background.`, {notPartners: [...commander]});
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
 * @param {{cards?: Function, candidates?: Function, random?: (n: number) => Uint8Array, slice?: number}} options  `slice`: the
 *   engine steps a room plays in one call before it stops for the object's alarm to play on (game/room/room.mjs,
 *   `continuing`). `candidates`: the card compiler's (game/engine/cards/candidates.mjs), which a playtest table alone
 *   plays where `cards` has no definition, labeled (Rob's decision 2; card load step 5)
 */
export function tableOn(storage, {cards = basicCards, candidates = () => null, random = (n) => crypto.getRandomValues(new Uint8Array(n)), slice, watching = () => 0} = {}) {
  let record = null, room = null, lounge = null;
  /* The cards a table takes in a deck: its own, and at a playtest table a candidate where it has none. */
  const cardsAt = (rec) => (rec?.playtest === true ? (name) => cards(name) ?? candidates(name) : cards);
  const load = async () => {
    if (!record) record = JSON.parse((await storage.get(KEY)) || "null");
    if (!record) throw new TableError(404, "There is no table here.");
    return record;
  };
  const save = () => storage.put(KEY, JSON.stringify(record));
  const seatOf = (email) => {const n = Object.entries(record.members).find(([, e]) => e === email); return n ? Number(n[0]) : null;};
  const isHost = (email) => email === record.host;
  const step = (event, now, extra = {}) => {
    if (record.quit) throw new TableError(409, "This table has ended. Start a new table to play again.");
    try {record.lifecycle = transitionTable(record.lifecycle, {...event, revision: record.lifecycle.revision}, {now, ...extra});}
    catch (error) {throw new TableError(409, error.message);}
  };
  const needHost = (email) => {if (!isHost(email)) throw new TableError(403, "Only the host can do that.");};
  const needSeat = (email) => {const s = seatOf(email); if (s === null) throw new TableError(403, "You do not have a seat at this table."); return s;};
  /* THE TABLE'S RULES (Rob, 2026-09-30): the starting life (CR 903.7's 40 unless the host says otherwise) and a bracket
     limit (none unless the host sets one). And whether the player who goes first in a two-player game skips their first
     draw step (CR 103.8a): on unless the host turns it off, a house rule (Rob, 2026-10-12: "this can be toggled off in game
     setup by the lobby owner"). A game of three or more has no such skip (103.8c), whatever this says. And whether the stack
     is passed for a person with no meaningful answer to what is on it (Linear ROB-102, `passStack`): on unless the host turns
     it off, so a person at a table of AIs is not stopped at every spell they could not answer. */
  const rulesOf = () => {const r = (record.lifecycle && record.lifecycle.settings) || {};
    return {startingLife: Number.isInteger(r.startingLife) ? r.startingLife : 40, bracketLimit: Number.isInteger(r.bracketLimit) ? r.bracketLimit : null,
      skipFirstDraw: r.skipFirstDraw !== false, passStack: r.passStack !== false,
      /* The lounge's two (lounge-contract §2): said only once the host has set them, so a table that never did reads as it always did. */
      ...(typeof r.houseRules === "boolean" ? {houseRules: r.houseRules} : {}), ...(r.privacy ? {privacy: r.privacy} : {})};};
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
  /* When the game in the room is over, the table moves on to the rematch question -- however it ended: through the table
     (End game, a concession, a clock running out), or in the room itself, the last opponent knocked out over a socket,
     which the object's alarm notices (`nextAlarm`, `tick`). */
  async function settle(now) {
    if (record.lifecycle.phase === "playing" && room && room.status === "finished") {
      const matchId = record.lifecycle.matchId;
      record.gameRecords ??= {};
      if (!record.gameRecords[matchId]) {
        record.gameRecords[matchId] = Object.fromEntries(room.seats.filter(s => s.pilot !== "house").map(s => {
          const mine = room.view(s.seatId), seat = Number(s.seatId.slice(1));
          const opponents = room.seats.filter(other => other.seatId !== s.seatId).map(other => ({seatId: other.seatId, name: other.name,
            commanders: [...(record.decks[Number(other.seatId.slice(1))]?.commander ?? [])], ai: other.pilot === "house"}));
          return [s.seatId, resultRecord({tableId: record.tableId, matchId, view: mine, deck: record.decks[seat], opponents, now})];
        }));
      }
      lounge.fileResults(record, matchId, room);
      step({type: "completed", matchId: record.lifecycle.matchId}, now);
      record.away = {};
      decideRematch(now);
    }
    await save();
  }
  /* A person still to answer Play again: the lifecycle's own test of who is waited on (`next-selection`). */
  const unanswered = (s) => s.kind === "human" && s.occupied && s.rematch === null;
  /* EVERY PERSON ASKED HAS ANSWERED PLAY AGAIN, or the clock answered for them: the next game, or the end of the table.
   *
   * The next game is this one again: the same seats, decks and rules, every seat staying ready -- a person's Yes is their
   * Ready, and an AI seat always stays -- and the ten-second countdown every game starts with, which the host can still
   * cancel. The object's alarm launches it as it launches a first game, as the next match (`<tableId>g<n>`). A seat whose
   * person said No, did not answer in time, or left the game before it ended is released by the lifecycle
   * (`next-selection`), never refused (AGENTS.md, U-09), and its person is no longer at the table: their address, deck and
   * mat go with them, and the host may invite someone else to the chair.
   *
   * There is no next game when the host is not staying -- the table's controls (start, cancel, invitations, the AI seats'
   * decks) and its AI seats' costs are the host's, and nobody else could run the next game -- or when fewer than two seats
   * would play. Then the table is over: it stays in `rematch` with every answer final (`closed`), and the view tells
   * everyone at it to start a new table. The host's No, or the host's having left the game, settles that at once, with
   * nobody kept waiting for the others' answers. Called only while Play again is undecided; the caller saves. */
  function decideRematch(now) {
    const t = record.lifecycle;
    const over = (why) => {record.closed = {at: now, reason: `${why} Start a new table to play again.`};};
    const host = t.seats[0];
    if (!host.occupied) return over("The host left the game, so this table's games are over.");
    if (host.rematch === false) return over("The host is not staying for another game, so this table's games are over.");
    if (t.seats.some(unanswered)) return;
    try {step({type: "next-selection"}, now);}
    catch {return over("Nobody else is staying for another game, and a game needs at least two seats.");}
    for (const s of record.lifecycle.seats) {
      if (s.occupied) continue;
      delete record.members[s.seatId]; delete record.decks[s.seatId];
      if (record.mats) delete record.mats[s.seatId];
    }
    for (const s of record.lifecycle.seats) if (s.occupied) step({type: "ready", seatId: s.seatId, ready: true}, now);
    /* Something may still hold the countdown -- an invitation the host sent to an empty chair meanwhile: the table then
       waits in the lobby, everyone ready, and says what it is waiting for, as any table does. */
    try {step({type: "countdown"}, now);} catch {/* the lobby's blockers say why */}
  }

  const api = {
    /** A new table, the host in seat 1. Seats after the first are a person to invite or an AI. */
    /* `llmAllowed`: whether this host may seat an AI on Claude (the LLM seat, AI-2), which the table's object works out
       from the AI door's gates (cloud/game-room.mjs); without it, such a seat is refused. */
    async create({tableId, host, hostName, seats, settings = {}, playtest = false, llmAllowed = false, privacy, observe = false, admin = false, now = Date.now()}) {
      if (!TABLE_ID.test(String(tableId || ""))) throw new TableError(400, "A table needs its id.");
      if (await storage.get(KEY) !== null) throw new TableError(409, "This table already exists.");
      if (observe === true) {
        record = lounge.observe({tableId, host, hostName, seats, settings, playtest, admin, privacy, createTable, now, levelOf});
        await save();
        return api.view(host, {admin});
      }
      const others = Array.isArray(seats) ? seats : [];
      lounge.vetCreate(others, {privacy, admin});
      if (others.length < 1 || others.length > 3) throw new TableError(400, "A table seats two to four players.");
      /* An AI seat plays at a setting (AI-2, Rob, 2026-10-10): "easy" or "normal", normal unless the host chose easy; or
         "llm", an AI on Claude, only where the AI door lets this host seat one. */
      if (others.some((s) => s && s.kind === "ai" && s.level === "llm") && !llmAllowed) throw new TableError(403, "An AI on Claude needs CrankMagic's AI features, switched on here and open to you. Choose a Normal or Easy AI.");
      const all = [{kind: "human", name: clean(hostName) || "Host"}, ...others.map((s, i) => (s && s.kind === "ai"
        ? {kind: "ai", name: clean(s.name) || `AI ${i + 2}`, level: levelOf(s), ...(personaOf(s) ? {persona: personaOf(s)} : {})}
        : {kind: "human", name: clean(s && s.name) || `Seat ${i + 2}`}))];
      record = {
        schema: TABLE_SCHEMA, tableId, host, created: true,
        lifecycle: createTable({tableId, seats: all.map((s, seatId) => ({seatId, kind: s.kind, name: s.name, ...(s.level ? {level: s.level} : {}), ...(s.persona ? {persona: s.persona} : {}), occupied: seatId === 0})), settings: {startingLife: 40, bracketLimit: null, ...settings}}),
        members: {0: host}, invites: [], decks: {}, matches: [], away: {}, playtest: playtest === true,
      };
      lounge.decorate(record, others, {privacy, now});
      await save();
      return api.view(host, {admin});
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

    /** Which of these card names the table cannot play yet (M5): what Change deck counts per deck -- "87 of 100 known,
        13 to learn" -- before a deck is brought, so a deck that is not whole is said to be so before it is refused.
        Names only, read against the table's own cards; nothing about any seat or game. */
    async unknown(names) {
      if (!Array.isArray(names) || names.length > 2000) throw new TableError(400, "Send at most 2000 card names.");
      const known = cardsAt(record ?? JSON.parse((await storage.get(KEY)) || "null"));
      return [...new Set(names.map((n) => clean(n, 200)).filter(Boolean))].filter((n) => !known(n)).sort();
    },

    /** A seat's deck: the person's own, or, for an AI seat, the host's choice (and an AI with a deck is ready). */
    async deck(email, seatId, deck, now) {
      await load();
      const seat = record.lifecycle.seats[seatId];
      if (!seat) throw new TableError(400, "There is no such seat.");
      /* Anyone at the table brings an AI seat's deck (Rob's Lobby, 2026-10-28); a person's own seat stays its sitter's. */
      if (seat.kind === "ai" ? !(isHost(email) || seatOf(email) !== null) : seatOf(email) !== seatId) throw new TableError(403, "That is not your seat to choose for.");
      const read = readDeck(deck, cardsAt(record), {playtest: record.playtest === true}), limit = rulesOf().bracketLimit;
      if (limit !== null && read.bracket !== null && read.bracket > limit)
        throw new TableError(409, `${read.name} is bracket ${read.bracket}, above this table's limit of ${limit}. Choose a deck at bracket ${limit} or lower, or ask the host to raise the limit.`);
      const version = (await sha256(JSON.stringify(read))).slice(0, 16);
      step({type: "deck", seatId, deckVersion: version}, now);
      if (seat.kind === "ai") step({type: "ready", seatId, ready: true}, now);
      record.decks[seatId] = read;
      await save();
      return api.view(email);
    },
    /** The host's Table rules (Rob, 2026-09-30): the starting life, the bracket limit and the first draw's skip, and not
        once any seat is ready. A change that would break the table is refused, saying what is wrong and what to do
        instead (AGENTS.md). */
    async rules(email, body, now) {
      await load(); needHost(email);
      if (body && Object.keys(body).length && Object.keys(body).every((k) => k === "privacy")) return lounge.setPrivacy({email}, body.privacy);
      const t = record.lifecycle;
      if (t.phase !== "selecting") throw new TableError(409, "The table's rules can change only before the game starts.");
      /* An AI seat is ready from its deck, never by a choice, so only a person's Ready holds the rules (the lobby's host edits them with AI decks chosen; a deck above a new bracket limit is refused below). */
      const ready = t.seats.filter((x) => x.ready && x.kind !== "ai").map((x) => x.name);
      if (ready.length) throw new TableError(409, `The rules can't change once a seat is ready, and ${seatNames(ready)} ${ready.length === 1 ? "is" : "are"}. Take back Ready, then edit the rules.`);
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
      const skip = b.skipFirstDraw === undefined ? now_.skipFirstDraw : b.skipFirstDraw;
      if (typeof skip !== "boolean") throw new TableError(400, "Whether the player who goes first skips their first draw is on or off: true or false.");
      const pass = b.passStack === undefined ? now_.passStack : b.passStack;
      if (typeof pass !== "boolean") throw new TableError(400, "Whether the stack is passed for a player with no answer to it is on or off: true or false.");
      void now;
      const house = b.houseRules === undefined ? {} : typeof b.houseRules === "boolean" ? {houseRules: b.houseRules} : null;
      if (house === null) throw new TableError(400, "House rules are on or off: true or false.");
      const privacy = b.privacy === undefined ? {} : {privacy: lounge.privacyOf(b.privacy)};
      if (privacy.privacy) record.privacy = privacy.privacy;
      record.lifecycle = {...t, settings: {...(t.settings || {}), startingLife: life, bracketLimit: limit, skipFirstDraw: skip, passStack: pass, ...house, ...privacy}, revision: t.revision + 1};
      await save();
      return api.view(email);
    },
    /** "REPORT A WRONG CARD" (Rob's decision 2; card load step 5): a candidate this seat can see, in the game being played
        or the table's last, said to play wrong, with the person's note. Kept with the table and handed over in that game's
        record, which the triage loop reads (tools/playtest-triage.mjs); a wave reviews the card before it joins the
        directory (step 6). The card is the one the engine shows this seat, so nobody reports a card they cannot name. */
    async reportCard(email, {cardId, note} = {}, now) {
      await load();
      const seat = needSeat(email), seatId = seatName(seat);
      if (record.playtest !== true) throw new TableError(409, "Only a playtest table seats candidates, so there is no candidate here to report.");
      const id = record.lifecycle.phase === "playing" ? record.lifecycle.matchId : record.matches.at(-1);
      if (!id) throw new TableError(409, "No game has been played at this table yet.");
      const game = room && room.matchId === id ? room : await openRoom({storage, matchId: id, cards, candidates});
      if (!game.seats.some((s) => s.seatId === seatId)) throw new TableError(403, "You did not have a seat in that game.");
      const state = game.view(seatId).state;
      const seen = [...state.players.flatMap((p) => Object.values(p.zones).flatMap((z) => z.cards)), ...(state.stack || [])];
      const card = seen.find((c) => c && c.cardId === Number(cardId) && c.candidate === true && c.name);
      if (!card) throw new TableError(404, "That is not a candidate you can see in this game.");
      const reports = record.cardReports || [];
      if (reports.length >= CARD_REPORTS) throw new TableError(409, `This table has taken ${CARD_REPORTS} reports; start another table to send more.`);
      const report = {matchId: id, seatId, card: card.name, cardId: card.cardId, turn: state.turn, note: clean(note, 500), at: now};
      record.cardReports = [...reports, report];
      await save();
      return report;
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

    /** The alarm's work: a dropped player's time running out, a game over in the room, Play again's deadline, and, when
        the countdown has run out, the room launched with each seat's deck. Nothing happens early. */
    async tick(now, {storageForRoom = storage} = {}) {
      await load();
      if (record.quit) return null;
      /* While the AI seats play on (the room's `continuing`), a leave waits: the alarm that plays on comes back for it. */
      const playingOn = record.lifecycle.phase === "playing" && (await api.currentRoom())?.continuing;
      for (const [seat, until] of Object.entries(record.away || {})) {
        if (until <= now && record.lifecycle.phase === "playing" && !playingOn) await leaveSeat(Number(seat), "timed-out", now);
      }
      /* A game that ended in the room itself -- the last opponent knocked out over a socket -- has told the table nothing:
         it moves on to Play again here. */
      if (record.lifecycle.phase === "playing" && !playingOn && (await api.currentRoom())?.status === "finished") await settle(now);
      /* Play again's time is up: whoever has not answered has said No (the lifecycle's `rematch-deadline`), and the table
         decides. */
      if (record.lifecycle.phase === "rematch" && !record.closed && record.lifecycle.seats.some(unanswered) && now >= record.lifecycle.rematchAt + REMATCH_WINDOW) {
        step({type: "rematch-deadline"}, now);
        decideRematch(now);
        await save();
      }
      const t = record.lifecycle;
      if (t.phase !== "countdown" || now < t.countdownAt) return null;
      const matchId = `${record.tableId}g${t.generation + 1}`;
      step({type: "tick"}, now, {launchId: matchId});
      const pod = {seats: t.seats.filter((s) => s.occupied).map((s) => ({
        seatId: seatName(s.seatId), name: s.name, pilot: s.kind === "ai" ? "house" : "human",
        /* An AI seat's setting; a table made before settings were, normal. */
        ...(s.kind === "ai" ? {level: levelOf(s), ...(personaOf(s) ? {persona: personaOf(s)} : {})} : {}),
        commander: record.decks[s.seatId].commander, cards: record.decks[s.seatId].cards,
      })), startingLife: rulesOf().startingLife, ...(rulesOf().skipFirstDraw === false ? {skipFirstDraw: false} : {}),
      /* The table's beats (game/room/room.mjs): a step with nothing to do passes itself (item 11); once every person is
         out, the game ends there (Rob, 2026-10-06); a run of identical triggers may be let resolve with one decision (Rob,
         2026-10-09: "resolve all"); and a person's cast passes for them (Rob, 2026-10-09: "I don't want to have to click a
         pop-up to resolve it"). And a person's turn ends only when they say so (Rob,
         2026-10-11: "passing the turn to the next player should always require player confirmation"): their end step is
         always asked; and a land tapped for mana may be untapped while its mana is unspent ("I should also be able to
         click the card to untap it again"). */
      passEmpty: true, endWhenNoPerson: true, resolveAll: true, passAfterCast: true, endAsks: true, untapMana: true,
      /* A spell offered from floating mana and the sources still untapped together, a two-mana rock tapped for both
         (Rob's playtest, 2026-10-15: a commander should be castable with what is on the board): new matches only, so a
         match launched before keeps its choices and its replay (rules/actions.mjs, `pooledTaps`). */
      pooledTaps: true,
      preparedTaps: true,
      resultRecords: true,
      /* An {X} spell tapped for too, for each X the pool and the untapped sources pay together, so a person casts it from the
         hand, choosing X, without tapping each land first (rules/actions.mjs, `xTaps`): new matches only. */
      xTaps: true,
      /* A spell with Phyrexian mana ({U/P}: {U} or 2 life, CR 107.4f) tapped for too, in each way its symbols can be paid, the
         caster asked which (ROB-326, Rob's playtest 2026-10-29: Tezzeret's Gambit): new matches only (rules/actions.mjs, `phyrexianTaps`). */
      phyrexianTaps: true,
      /* A person may yield the rest of an opponent's turn (Linear ROB-13, the Oct 16 handoff): new matches only, so one
         launched before is asked as it was (room.mjs, `yieldTurn`). */
      yieldTurn: true,
      /* The draw step's draw waits for its player's Draw card (Linear ROB-102 and ROB-24; `drawBeat`, CR 504.1): the Oct 15
         playtest's confirmed decisions reverse Oct 9's automatic draw ("label the pending draw action Draw card"). An AI
         seat draws for itself. New matches only: a match launched between Oct 9 and now drew by itself and replays so. */
      drawBeat: true,
      /* And the stack passed for a person with no meaningful answer to what is on it (Linear ROB-102; ROB-13's `passStack`):
         an opponent's spell they could not answer resolves without a Pass for each one -- the most-felt stop at a table of
         three AIs. They see it came and went: the board calls out a spell cast and resolved between two views from the
         view's events (crankmagic-board.js, calloutsFor, "CAST"), and the history keeps it. A person who holds an answer is
         still asked. On unless the host turned it off (the table's rules); new matches only, so one launched before is asked
         as it was. */
      ...(rulesOf().passStack ? {passStack: true} : {}),
      /* And Declare blockers made for a person with no creature that could block: none, the history saying why (room.mjs,
         `blocksNone`; Rob's one-person, three-AI table, Oct 21) -- most of the AI seats' attacks asked a No blocks of him.
         New matches only, so one launched before is asked as it was. */
      blocksNone: true,
      /* And Rob's fullscreen notes (Oct 21; room.mjs): a person's land in any step of their own turn (`landAnyStep`), a land
         just played put back in the hand while nothing has happened since (`takeBackLand`), and a spell or ability aimed at
         a person asked of them before it resolves (`askAimed`). New matches only, so one launched before plays as it did. */
      landAnyStep: true, takeBackLand: true, askAimed: true,
      /* r4: a new match keeps its undo house rule, so older matches retain their original choices. */
      ...(rulesOf().houseRules === false ? {} : {houseRules: {undoLastPlay: true}, keepStepMana: true}),
      /* Its AI seats take what a choice they may answer with none is for -- the land Evolving Wilds finds, the counters
         proliferate adds -- where they took none (Linear ROB-164, 2026-10-19): new matches only, so one launched
         before replays as it was played (room.mjs, `pilotPicks`). */
      pilotPicks: true,
      /* A playtest table seats the card compiler's candidates, labeled (Rob's decision 2; card load step 5): new matches only,
         so one launched before replays with the cards it was dealt (room.mjs, `candidates`). */
      ...(record.playtest === true ? {candidates: true} : {})};
      try {
        room = await startRoom({storage: storageForRoom, matchId, cards, candidates, pod, seed: `${matchId}:${now}`, slice});
        step({type: "engine-started", launchId: matchId, matchId}, now);
        record.matches.push(matchId);
        record.startedAt = now;
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

    /* ---- after the game: Play again (Requests row 12, Linear ROB-167) ---- */

    /** A person's answer once the game is over: Yes, another game, or No, which is leaving the table. It can change until
        every person has answered; the answer that completes them decides (`decideRematch`), and the clock decides for
        whoever is silent (`tick`). Answering is being here: a seat a closed socket marked away is back. A person whose No
        released their seat gets the table without a seat in it (`yourSeat: null`), and is not at the table afterward. */
    async rematch(email, accept, now) {
      await load();
      const seatId = needSeat(email), t = record.lifecycle, seat = t.seats[seatId];
      if (typeof accept !== "boolean") throw new TableError(400, "Answer Play again with accept: true for another game, or false to leave the table.");
      if (t.phase !== "rematch") throw new TableError(409, t.phase === "playing"
        ? "The game is still being played, so there is no Play again to answer yet. Answer it once the game is over."
        : record.matches.length
          ? "There is no Play again to answer: this table's next game is already being set up. Use Ready in the lobby instead."
          : "No game has been played at this table yet, so there is no Play again to answer. Use Ready in the lobby instead.");
      if (record.closed) throw new TableError(409, `Play again has been decided. ${record.closed.reason}`);
      if (!seat.occupied) throw new TableError(409, "You left that game, so the next one is not yours to answer. Ask the host to invite you again.");
      if (!seat.connected) step({type: "reconnect", seatId}, now);
      step({type: "rematch-vote", seatId, accept}, now);
      decideRematch(now);
      await save();
      return api.view(email, {any: true});
    },

    /** A seat's last connection closed. While a game is on, their five minutes start. Outside a game a socket closing
        says nothing: only a game opens one (`room`), and the lobby reads the table instead, so the socket of a game just
        over closing as its player turns to Play again is not their leaving. Counted, it marked a seat disconnected that
        nothing but a game could connect again, and the next game's countdown waited on it for good. */
    async dropped(seat, now) {
      await load();
      if (record.lifecycle.phase !== "playing") return;
      const s = record.lifecycle.seats[seat];
      if (!s || !s.occupied || s.kind !== "human" || !s.connected) return;
      step({type: "disconnect", seatId: seat}, now);
      record.away = record.away || {};
      /* The five minutes are for the people waiting on them. A person whose only company is AI seats holds nobody up
         (Linear ROB-170), so their game waits for them, with no clock, as it was: their Leave or Concede still ends it. */
      const waitedOn = record.lifecycle.seats.some((x, i) => i !== seat && x.occupied && x.kind === "human");
      if (record.lifecycle.phase === "playing" && waitedOn) record.away[seat] = now + AWAY_LIMIT;
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

    /** When the object should next wake: the countdown's end, the first dropped player's time running out, now, while
        the AI seats play on in slices or once the game has ended in the room, or Play again's deadline while a person
        has yet to answer. */
    async nextAlarm(now = Date.now()) {
      await load();
      if (record.quit) return null;
      const times = Object.values(record.away || {});
      if (record.lifecycle.phase === "countdown") times.push(record.lifecycle.countdownAt);
      const current = record.lifecycle.phase === "playing" ? await api.currentRoom() : null;
      if (current && (current.continuing || current.status === "finished")) times.push(now);
      if (record.lifecycle.phase === "rematch" && !record.closed && record.lifecycle.seats.some(unanswered)) times.push(record.lifecycle.rematchAt + REMATCH_WINDOW);
      /* The LLM seat being asked: its turn is the object's to take (cloud/game-room.mjs, agentTurns), at once. */
      if (record.lifecycle.phase === "playing" && llmWaiting(await api.currentRoom())) times.push(now);
      return times.length ? Math.min(...times) : null;
    },

    /** Who made the table: whose AI features an LLM seat's calls are, and whose caps hold them. */
    async host() {await load(); return record.host;},

    /** The room of the game being played, whoever asks (the object's own sockets), or null. */
    async currentRoom() {
      await load();
      if (record.lifecycle.phase !== "playing") return null;
      if (!room || room.matchId !== record.lifecycle.matchId) room = await openRoom({storage, matchId: record.lifecycle.matchId, cards, candidates, slice});
      return room;
    },

    /** The room of the game being played, for the seat this person holds. */
    async room(email) {
      await load();
      const seat = needSeat(email);
      if (record.lifecycle.phase !== "playing" || record.quit) throw new TableError(409, "No game is being played at this table.");
      if (!room || room.matchId !== record.lifecycle.matchId) room = await openRoom({storage, matchId: record.lifecycle.matchId, cards, candidates, slice});
      return {room, seatId: seatName(seat)};
    },

    /** The room of the game being played, for someone watching it (lounge-contract §4): a spectator holds no seat. Public tables
        to anyone signed in; private ones to their seats, the host and the admin. */
    async watchRoom(who) {
      await load();
      if (!lounge.mayWatch(who)) throw new TableError(403, "This table is private. Ask the host to seat you or invite you.");
      if (record.lifecycle.phase !== "playing" || record.quit) throw new TableError(409, "No game is being played at this table.");
      return api.currentRoom();
    },

    /** THE COACH'S BRIEF (X13; game/room/coach-brief.mjs): the game as this person may see it, and the deck they brought --
        built here, from their own seat's view, for the Worker's AI door and nothing else. */
    async brief(email, {hand = true} = {}) {
      const {room: game, seatId} = await api.room(email);
      return coachBrief(game.view(seatId), record.decks[needSeat(email)], {hand});
    },

    /**
     * A FINISHED GAME'S RECORD (M8b; Rob's go, 2026-09-29). A record shows what the game hid, so there is none
     * while it goes on. On a PLAYTEST table (made one by the Worker, never by the request: staging's tables are)
     * it is the whole game -- its seed, pod, decision tape and journal, which game/room/replay.mjs plays again --
     * so a finding can be seen happen twice. On any other table it is the asking seat's own: its last view and
     * the public history, never the seed (which with the pod would deal every hand again) or the tape.
     * Both carry the match's tally of refused AI answers (`refusals`), counted over the whole game, not read off the
     * history, which keeps only its newest lines.
     * Nobody's address is in either: the room only ever knew "s0".."s3".
     */
    async record(email, matchId) {
      await load();
      const seat = needSeat(email), id = matchId || record.matches.at(-1);
      if (!id || !record.matches.includes(id)) throw new TableError(404, "There is no such game at this table.");
      const game = room && room.matchId === id ? room : await openRoom({storage, matchId: id, cards, candidates});
      if (game.status !== "finished") throw new TableError(409, "A game's record is ready once the game is over.");
      const seatId = seatName(seat);
      if (!game.seats.some((s) => s.seatId === seatId)) throw new TableError(403, "You did not have a seat in that game.");
      const mine = game.view(seatId), base = {schema: RECORD_SCHEMA, tableId: record.tableId, matchId: id, playtest: !!record.playtest, result: mine.result, departures: mine.departures, seats: game.seats, history: game.history, refusals: game.refusals,
        gameRecord: structuredClone(record.gameRecords?.[id]?.[seatId] ?? null), chat: await lounge.chatRecord()};
      if (!record.playtest) return {...base, kind: "seat", seatId, view: mine};
      const store = createMatchStore(storage, id), meta = await store.loadMatch();
      const cardReports = (record.cardReports || []).filter((r) => r.matchId === id);
      return {...base, kind: "full", seed: meta.seed, pod: meta.pod, tape: await store.readTape(), journal: await store.readJournal(), ...(cardReports.length ? {cardReports} : {})};
    },

    /** The table as one person sees it: every seat's state, but only their own deck's cards. */
    async view(email, {any = false, admin = false, watch = false} = {}) {
      await load();
      const mine = email === null ? null : seatOf(email);
      /* Someone with no seat sees a table only as a spectator (lounge-contract §4): the admin any table, anyone signed in a public one. */
      const who = {email, admin: admin === true};
      if (!any && mine === null && !isHost(email) && !(admin === true || (watch === true && lounge.mayWatch(who)))) throw new TableError(403, "You do not have a seat at this table.");
      const t = record.lifecycle;
      const base = {
        schema: TABLE_SCHEMA, tableId: record.tableId, phase: t.phase, revision: t.revision, playtest: !!record.playtest,
        youAreHost: isHost(email), yourSeat: mine,
        countdownAt: t.countdownAt, launchError: t.launchError, matchId: t.phase === "playing" ? t.matchId : null,
        blockers: countdownBlockers(t).map(({seatId, reason}) => ({seatId, reason})),
        rules: rulesOf(),
        // The result is private to its human seat, including its own library source; never another player's source.
        gameRecord: mine !== null && t.phase === "rematch" ? structuredClone(record.gameRecords?.[t.matchId]?.[seatName(mine)] ?? null) : null,
        away: Object.entries(record.away || {}).map(([seatId, until]) => ({seatId: Number(seatId), until})),
        /* Play again (Requests row 12): while a finished game's players answer, the game it follows, until when, each
           seat's answer, and -- once every person has answered and there is no next game -- that the table is over and
           why. Null in every other phase. */
        rematch: t.phase === "rematch" ? {
          lastMatchId: t.matchId, deadline: t.rematchAt + REMATCH_WINDOW,
          outcome: record.closed ? "closed" : "waiting", reason: record.closed ? record.closed.reason : null,
          votes: t.seats.filter((s) => s.occupied).map((s) => ({seatId: s.seatId, vote: s.rematch === true ? "yes" : s.rematch === false ? "no" : "pending"})),
        } : null,
        seats: t.seats.map((s) => ({
          seatId: s.seatId, kind: s.kind, name: s.name, ...(s.kind === "ai" ? {level: levelOf(s), ...(personaOf(s) ? {persona: personaOf(s)} : {})} : {}), occupied: s.occupied, connected: s.connected, ready: s.ready,
          invited: s.invited, you: s.seatId === mine, mat: (record.mats || {})[s.seatId] || "felt",
          deck: record.decks[s.seatId] ? {name: record.decks[s.seatId].name, commander: record.decks[s.seatId].commander, bracket: record.decks[s.seatId].bracket ?? null} : null,
          ...(s.seatId === mine && record.decks[s.seatId] ? {cards: record.decks[s.seatId].cards.length, source: record.decks[s.seatId].source || null} : {}),
          ...lounge.seatExtra(s),
        })),
      };
      return {...base, ...(await lounge.viewExtra(who, {mine}))};
    },
  };
  /* The lounge around the table (game/room/lounge.mjs): its seat operations, requests, chat and registry summary, over this
     table's own record and storage. Built here, last, so it reads the record through the closure. */
  lounge = loungeOn({
    storage, rec: () => record, load, save, step, seatOf, isHost, api, settle, watching, aiMats: AI_MATS,
    fail: (status, message) => {throw new TableError(status, message);},
    latestRoom: async () => {
      const current = await api.currentRoom();
      if (current) return current;
      const id = record.matches.at(-1);
      if (!id) return null;
      return room && room.matchId === id ? room : openRoom({storage, matchId: id, cards, candidates});
    },
  });
  Object.assign(api, {lounge});
  return api;
}
