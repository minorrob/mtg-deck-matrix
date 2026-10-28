/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE LOUNGE AROUND A TABLE (docs/ui-lane/lounge-contract.md): who may see a table, the lobby's seat operations, requests to
 * join, quitting, the log, the chat and the table's summary for the registry (cloud/lounge.mjs). Everything the Pre-lobby,
 * the New game pop-up and the Lobby ask of one table lives here, in its own module, so game/room/table.mjs keeps its
 * shape: it builds `loungeOn(...)` over its own record and storage and adds the result to its api.
 *
 * This file holds no storage of its own and imports only the AI roster's levels: `h` hands it the table's record (`h.rec()`), its steps and its
 * errors. An address is the table's secret (the room only knows "s0".."s3"); nothing here puts one in a view, a summary's
 * public fields, the log or the chat. The registry's `members` list is the one place the table lets addresses out, and it
 * stays inside the Worker (cloud/lounge.mjs never returns it).
 */

import {LEVELS as ROSTER_LEVELS} from "../engine/pilots/roster.mjs";

export const PRIVACY = Object.freeze(["public", "private"]);
export const PERSONA = /^[a-z]{1,20}$/;
/* The levels a table may seat now (contract §2): the roster's available ones (game/engine/pilots/roster.mjs); "llm" is gated by the AI door, not here. */
export const LEVELS_NOW = Object.freeze(ROSTER_LEVELS.filter((l) => l.available && !l.needsAi).map((l) => l.id));
export const CHAT_KEEP = 500, CHAT_VIEW = 50, CHAT_MAX = 300;
/* Chat is limited to a few messages a second: this many within this window, per person. */
export const CHAT_BURST = 4, CHAT_WINDOW = 2000;
const REQUESTS_OPEN = 10, REQUESTS_KEPT = 40, LOBBY_LOG = 100;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}$/;
const clean = (v, n = 60) => String(v ?? "").trim().slice(0, n);

/** AN AI SEAT'S MAT, chosen for it (Rob, 2026-10-28: "AI players should have a mat auto-chosen for them during the Game Lobby"):
    the pool's mat a hash of the table's id and the seat's picks, or the next one along that no other seat at the table has, so the
    same table always gives the same mats and two AI seats share one only when the pool has run out. */
export function pickMat(pool, tableId, seatId, taken = []) {
  let hash = 2166136261;
  for (const ch of `${tableId}:${seatId}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  const start = hash % pool.length;
  for (let i = 0; i < pool.length; i += 1) {const mat = pool[(start + i) % pool.length]; if (!taken.includes(mat)) return mat;}
  return pool[start];
}

/** An AI seat's level as asked: "easy", "normal", "hard" or "llm" (gated by the caller); one the roster has not opened is refused, saying so (the table object's routes do, cloud/game-room.mjs; the table itself still reads an unknown level as Normal); unasked, none. */
export function levelAsked(level, fail, refuseClosed = true) {
  if (level === undefined || level === null || level === "") return null;
  const known = ROSTER_LEVELS.find((l) => l.id === level);
  if (known && !known.available && refuseClosed) fail(422, `${known.label} is not open yet. Choose ${LEVELS_NOW.map((id) => ROSTER_LEVELS.find((l) => l.id === id).label).slice(0, 2).join(" or ")}.`);
  return known && known.available ? known.id : "normal";
}
export function personaAsked(persona, fail) {
  if (persona === undefined || persona === null || persona === "") return null;
  if (typeof persona !== "string" || !PERSONA.test(persona)) fail(400, "An AI's persona is one to twenty lower-case letters.");
  return persona;
}
export const privacyAsked = (privacy, fail, fallback = "private") => {
  if (privacy === undefined || privacy === null) return fallback;
  if (!PRIVACY.includes(privacy)) fail(400, "A table is public or private.");
  return privacy;
};

/** What the table owes the registry (cloud/lounge.mjs): public facts, plus `members`, the addresses the registry matches a
    caller against and never returns. `listed` false once the table is over. */
export function summaryOf(rec, {room = null, now}) {
  const t = rec.lifecycle, seats = t.seats;
  const reserved = rec.reserved || {};
  const isAi = (s) => s.kind === "ai";
  const held = (s) => s.occupied || s.invited || !!reserved[s.seatId];
  const organizer = rec.observe ? clean(rec.hostName) || "Observer" : clean(seats[0].name) || "Host";
  const roster = seats.filter((s) => s.occupied).map((s) => {
    const deck = rec.decks?.[s.seatId];
    return {name: s.name, ai: isAi(s), commander: deck?.commander?.[0] ?? null, mechanic: ""};
  });
  const ai = seats.filter(isAi).length;
  const human = seats.filter((s) => !isAi(s) && held(s)).length;
  const open = seats.filter((s) => !isAi(s) && !held(s)).length;
  const phase = rec.quit ? "over" : t.phase;
  const listed = ["selecting", "countdown", "starting", "playing"].includes(phase);
  const commander = rec.decks?.[0]?.commander?.[0] ?? null;
  const members = [...new Set([rec.host, ...Object.values(rec.members || {})].filter(Boolean))];
  return {
    tableId: rec.tableId, phase, listed, at: now, createdAt: rec.createdAt ?? now,
    location: phase === "playing" ? "live" : "lobby",
    organizer, commander, mechanic: "", privacy: rec.privacy === "public" ? "public" : "private",
    ai, human, open, startedAt: phase === "playing" ? rec.startedAt ?? null : null, roster,
    ...(room && phase === "playing" ? {turn: room.turn ?? null} : {}),
    summary: `${organizer}'s table · ${human} human${human === 1 ? "" : "s"}, ${ai} AI${open ? `, ${open} open` : ""}`,
    members,
  };
}

/**
 * @param {object} h  the table's hands: rec() the record (loaded), load() / save(), step(event, now), seatOf(email),
 *   isHost(email), api (the table's own api), settle(now), latestRoom() the newest game's room or null, fail(status, message),
 *   storage (the table's M4 storage, for the chat), watching() how many sockets are watching
 */
export function loungeOn(h) {
  const {fail} = h;
  let chatCache = null;
  const recents = new Map();   /* an address -> the times of its latest messages, for the chat's rate limit */

  const over = () => {if (h.rec().quit) fail(409, "This table has ended.");};
  const publicTable = () => h.rec().privacy === "public";
  const open = (s) => s.kind === "human" && !s.occupied && !s.invited && !(h.rec().reserved || {})[s.seatId];
  const held = (s) => s.kind === "ai" || s.occupied || s.invited || !!(h.rec().reserved || {})[s.seatId];
  const note = (text, now, kind = "lobby") => {
    const rec = h.rec();
    rec.lobbyLog = [...(rec.lobbyLog || []), {at: now, text, kind}].slice(-LOBBY_LOG);
  };
  const mutate = (fn) => {const rec = h.rec(), t = structuredClone(rec.lifecycle); fn(t); t.revision += 1; rec.lifecycle = t;};
  const needOrganizer = (who) => {if (!h.isHost(who.email)) fail(403, "Only the host can do that.");};
  const seated = (who) => h.seatOf(who.email);

  const chatLoad = async () => {
    if (chatCache === null) chatCache = JSON.parse((await h.storage.get("chat")) || "null") || {next: 1, messages: []};
    return chatCache;
  };

  return {
    privacyOf: (privacy) => privacyAsked(privacy, fail),
    /* ---- who may see a table ---- */
    /** A spectator's way in (contract §4): a public table to anyone signed in; a private one to its seats, its host and the admin. */
    mayWatch(who) {
      return who.admin === true || publicTable() || h.isHost(who.email) || seated(who) !== null;
    },

    /* ---- making a table ---- */
    /** Checked before a table is made: the seats asked for, in the contract's terms. Throws; changes nothing. */
    vetCreate(others, {privacy, admin}) {
      privacyAsked(privacy, fail);
      for (const s of others) {
        if (!s || typeof s !== "object") continue;
        if (s.kind === "ai") {levelAsked(s.level, fail, false); personaAsked(s.persona, fail);}
        else if (s.email !== undefined && s.email !== null && s.email !== "" && !EMAIL.test(String(s.email))) fail(400, "That is not an email address.");
      }
      void admin;
    },
    /** A new table's lounge facts, set on its record before it is first saved. */
    decorate(rec, others, {privacy, now}) {
      /* The AI seats' mats, seat by seat, each away from the ones already used. */
      const mats = {};
      others.forEach((s, i) => {if (s && s.kind === "ai") mats[i + 1] = pickMat(h.aiMats, rec.tableId, i + 1, Object.values(mats));});
      if (Object.keys(mats).length) rec.mats = mats;
      rec.privacy = privacyAsked(privacy, fail);
      rec.createdAt = now;
      const reserved = {};
      others.forEach((s, i) => {
        const seat = rec.lifecycle.seats[i + 1];
        if (!seat) return;
        if (s && s.kind === "ai") {const persona = personaAsked(s.persona, fail); if (persona) seat.persona = persona;}
        else if (s && s.email) reserved[i + 1] = String(s.email).trim().toLowerCase();
      });
      if (Object.keys(reserved).length) rec.reserved = reserved;
    },
    /** The admin's Observe AI game: AI seats only, no person at seat 1, watched. */
    observe({tableId, host, hostName, seats, settings, playtest, admin, privacy, createTable, now, levelOf}) {
      if (!admin) fail(403, "Only CrankMagic's owner can observe an AI game.");
      if (!Array.isArray(seats) || seats.length < 2 || seats.length > 4 || seats.some((s) => !s || s.kind !== "ai"))
        fail(400, "An observed game is two to four AI seats and no one else.");
      for (const s of seats) {levelAsked(s.level, fail, false); personaAsked(s.persona, fail);}
      const all = seats.map((s, i) => ({kind: "ai", name: clean(s.name) || `AI ${i + 1}`, level: levelOf(s), ...(personaAsked(s.persona, fail) ? {persona: s.persona} : {})}));
      const mats = {};
      all.forEach((_, i) => {mats[i] = pickMat(h.aiMats, tableId, i, Object.values(mats));});
      return {mats,
        schema: "CrankTable@1", tableId, host, created: true, observe: true, hostName: clean(hostName) || "Observer",
        privacy: privacyAsked(privacy, fail), createdAt: now,
        lifecycle: createTable({tableId, observe: true, seats: all.map((s, seatId) => ({seatId, ...s, occupied: true})), settings: {startingLife: 40, bracketLimit: null, ...settings}}),
        members: {}, invites: [], decks: {}, matches: [], away: {}, playtest: playtest === true,
      };
    },

    /* ---- the lobby's seats (contract §3) ---- */
    /** Any person at the table may change an AI seat's name, level or persona; only the organizer adds or removes a seat. The
        lobby only, and not once a person is ready (an AI seat is ready from its deck, so that does not count). */
    async seat(who, body, now, {llmAllowed = false} = {}) {
      await h.load(); over();
      const rec = h.rec(), t = rec.lifecycle, op = body && body.op;
      if (!["remove", "add-ai", "edit-ai"].includes(op)) fail(400, "A seat operation is remove, add-ai or edit-ai.");
      if (op === "edit-ai") {if (!(who.admin || h.isHost(who.email) || seated(who) !== null)) fail(403, "Only a person at this table can change its AI seats.");}
      else needOrganizer(who);
      if (t.phase !== "selecting") fail(409, "The seats can change only in the lobby, before the game starts.");
      const ready = t.seats.filter((s) => s.kind === "human" && s.occupied && s.ready).map((s) => s.name);
      if (ready.length) fail(409, `The seats can't change once a person is ready, and ${ready.join(", ")} ${ready.length === 1 ? "is" : "are"}. Take back Ready, then change the seats.`);
      const seatId = Number(body.seatId), seat = t.seats[seatId];
      if (!Number.isInteger(seatId) || !seat) fail(400, "There is no such seat.");
      const level = levelAsked(body.level, fail), persona = personaAsked(body.persona, fail);
      if (level === "llm" && !llmAllowed) fail(403, "An AI on Claude needs CrankMagic's AI features, switched on here and open to the host. Choose a Normal or Easy AI.");
      if (op === "edit-ai") {
        if (seat.kind !== "ai") fail(400, "That seat is not an AI seat.");
        const name = body.name === undefined ? null : clean(body.name);
        mutate((x) => {
          const s = x.seats[seatId];
          if (name) s.name = name;
          if (level) s.level = level;
          if (persona) s.persona = persona;
        });
        note(`${seat.name} was changed`, now);
      } else if (op === "add-ai") {
        if (!open(seat)) fail(409, "That seat is taken. Remove its person first, or pick an open seat.");
        mutate((x) => {
          const s = x.seats[seatId];
          Object.assign(s, {kind: "ai", name: clean(body.name) || `AI ${seatId + 1}`, level: level ?? "normal", occupied: true, connected: true, ready: false,
            deckVersion: null, invited: false, released: false, rematch: null});
          if (persona) s.persona = persona; else delete s.persona;
        });
        if (rec.reserved) delete rec.reserved[seatId];
        rec.mats = {...(rec.mats || {}), [seatId]: pickMat(h.aiMats, rec.tableId, seatId, Object.entries(rec.mats || {}).filter(([n]) => Number(n) !== seatId).map(([, m]) => m))};
        note(`An AI seat was added`, now);
      } else {
        if (seatId === 0) fail(400, "The host's own seat can't be removed. Cancel the table instead.");
        if (t.seats.filter((s, i) => i !== seatId && (s.kind === "ai" || s.occupied || s.invited || (rec.reserved || {})[i])).length < 2)
          fail(409, "A table needs two seats. Add an AI or invite a person before removing this one.");
        const was = seat.name;
        if (seat.kind === "ai") {
          mutate((x) => {
            const s = x.seats[seatId];
            for (const key of ["level", "persona"]) delete s[key];
            Object.assign(s, {kind: "human", name: `Seat ${seatId + 1}`, occupied: false, connected: false, ready: false, deckVersion: null,
              invited: false, released: true, rematch: null});
          });
        } else if (seat.occupied) {
          h.step({type: "exit", seatId}, now);
          delete rec.members[seatId];
        } else {
          h.step({type: "uninvited", seatId}, now);
        }
        delete rec.decks[seatId];
        if (rec.mats) delete rec.mats[seatId];
        rec.invites = rec.invites.filter((i) => i.seatId !== seatId);
        if (rec.reserved) delete rec.reserved[seatId];
        note(`${was} was removed`, now);
      }
      await h.save();
      return h.api.view(who.email, {admin: who.admin});
    },

    /* ---- asking to join (contract §3) ---- */
    async requestJoin(who, now) {
      await h.load(); over();
      const rec = h.rec(), t = rec.lifecycle;
      if (seated(who) !== null || h.isHost(who.email)) fail(409, "You are already at this table.");
      if (t.phase !== "selecting") fail(409, "This table has started, so it is not taking requests to join.");
      if (!t.seats.some(open)) fail(409, "Every seat at this table is taken.");
      const requests = rec.requests || [];
      if (requests.some((r) => r.status === "open" && r.email === who.email)) fail(409, "You have already asked to join this table. Wait for the host to answer.");
      if (requests.filter((r) => r.status === "open").length >= REQUESTS_OPEN) fail(409, "The host has as many requests as a table holds. Try again in a moment.");
      const request = {requestId: crypto.randomUUID().replace(/-/g, "").slice(0, 16), email: who.email, name: clean(who.name) || "A player", at: now, status: "open"};
      rec.requests = [...requests.filter((r) => !(r.email === who.email)), request].slice(-REQUESTS_KEPT);
      note(`${request.name} asked to join`, now);
      await h.save();
      return {requestId: request.requestId, name: request.name, status: "open"};
    },
    /** The organizer answers: accepting seats the person in the first open seat, bound to their address as a link would. */
    async request(who, body, now) {
      await h.load(); over();
      needOrganizer(who);
      const rec = h.rec(), asked = (rec.requests || []).find((r) => r.requestId === (body && body.requestId));
      if (!asked || asked.status !== "open") fail(404, "That request is not open.");
      if (typeof (body && body.accept) !== "boolean") fail(400, "Answer a request with accept: true or false.");
      if (!body.accept) {
        asked.status = "declined"; asked.at = now;
        note(`${asked.name}'s request was declined`, now);
        await h.save();
        return h.api.view(who.email, {admin: who.admin});
      }
      if (rec.lifecycle.phase !== "selecting") fail(409, "This table has started, so it is not taking anyone else.");
      if (h.seatOf(asked.email) !== null) {asked.status = "accepted"; await h.save(); return h.api.view(who.email, {admin: who.admin});}
      const seat = rec.lifecycle.seats.find(open);
      if (!seat) fail(409, "Every seat is taken. Remove a seat's occupant first, then accept.");
      h.step({type: "join", seatId: seat.seatId}, now);
      rec.members[seat.seatId] = asked.email;
      rec.lifecycle.seats[seat.seatId].name = asked.name;
      rec.invites = rec.invites.filter((i) => i.seatId !== seat.seatId);
      asked.status = "accepted"; asked.at = now;
      note(`${asked.name} joined`, now);
      await h.save();
      return h.api.view(who.email, {admin: who.admin});
    },
    /** Where a person who is not at this table stands with their request, or null. */
    requestState(email) {
      const mine = ((h.rec() || {}).requests || []).filter((r) => r.email === email).at(-1);
      return mine ? {requestId: mine.requestId, status: mine.status} : null;
    },

    /* ---- ending a table (contract §3) ---- */
    /** The organizer or the admin ends the table for everyone: a game in the room ends as `end` ends it, and every person's
        result is "unfinished" (or the loss a concession already made). Answers the table. */
    async quit(who, now) {
      await h.load(); over();
      const rec = h.rec();
      if (!who.admin && !h.isHost(who.email)) fail(403, "Only the host or CrankMagic's owner can end the table.");
      const t = rec.lifecycle;
      if (t.phase === "playing") {
        const current = await h.api.currentRoom();
        const asSeat = h.seatOf(who.email) !== null ? `s${h.seatOf(who.email)}` : current.seats[0].seatId;
        try {await current.end(asSeat); await h.settle(now);}
        catch (error) {
          /* The AI seats are mid-slice (the room's `continuing`): it can't be ended now, so the table is abandoned where it stands
             and each person's game is filed as unfinished. */
          if (error && error.status !== 409) throw error;
          const view = current.watch();
          rec.resultRows ??= {};
          rec.resultRows[t.matchId] ??= this.rowsFor(rec, current, view, {abandoned: true});
        }
      }
      rec.quit = {at: now, by: h.isHost(who.email) ? "organizer" : "admin"};
      rec.closed = rec.closed || {at: now, reason: "The table was ended. Start a new table to play again."};
      note(`The table was ended by the ${rec.quit.by}`, now);
      await h.save();
      return h.api.view(who.email, {admin: who.admin, any: true});
    },

    /** The rows a finished game files for the leaderboard: one per person's seat, never an AI seat (contract §6). */
    rowsFor(rec, room, view, {abandoned = false} = {}) {
      const t = rec.lifecycle, byPerson = [];
      for (const s of room.seats.filter((x) => x.pilot !== "house")) {
        const n = Number(s.seatId.slice(1)), email = rec.members?.[n];
        if (!email) continue;
        const gone = view.departures?.[s.seatId], end = view.result?.ending?.seats?.find((x) => x.seatId === s.seatId);
        let outcome = "unfinished";
        if (gone === "conceded") outcome = "loss";
        else if (gone === "timed-out") outcome = "unfinished";
        else if (!abandoned && view.result) {
          if (end?.outcome === "won") outcome = "win";
          else if (view.result.ending?.kind === "draw") outcome = "tie";
          else if (end?.outcome === "lost") outcome = "loss";
        }
        byPerson.push({email, name: t.seats[n]?.name ?? "A player", seatId: s.seatId, outcome});
      }
      return byPerson;
    },
    /** Files a finished game's rows once, as the table settles (table.mjs, settle). */
    fileResults(rec, matchId, room) {
      rec.resultRows ??= {};
      if (rec.resultRows[matchId]) return;
      const view = room.watch();
      rec.resultRows[matchId] = this.rowsFor(rec, room, view).map((r) => ({...r, humans: room.seats.filter((x) => x.pilot !== "house").length,
        ai: room.seats.filter((x) => x.pilot === "house").length, turns: view.state?.turn ?? null}));
    },
    /** The games whose rows the database has not taken yet: `[{matchId, rows}]`. */
    async pendingResults() {
      await h.load();
      const rec = h.rec(), done = rec.resultsWritten || {};
      return Object.entries(rec.resultRows || {}).filter(([id]) => !done[id]).map(([matchId, rows]) => ({matchId, tableId: rec.tableId, rows}));
    },
    async resultsWritten(matchId) {
      await h.load(); const rec = h.rec();
      rec.resultsWritten = {...(rec.resultsWritten || {}), [matchId]: true};
      await h.save();
    },

    /* ---- the log and the chat (contract §3, §5) ---- */
    async log(who) {
      await h.load();
      if (!who.admin && !h.isHost(who.email)) fail(403, "Only the host or CrankMagic's owner can read the table's log.");
      const rec = h.rec(), room = await h.latestRoom();
      const game = room ? room.history.map(({turn, text, mark}) => ({at: null, turn, text, kind: mark || "game"})) : [];
      return {log: [...(rec.lobbyLog || []).map(({at, text, kind}) => ({at, text, kind})), ...game], chat: (await chatLoad()).messages.slice(-CHAT_KEEP)};
    },
    /** One message to the table: a seated person, or the admin watching. */
    async chat(who, text, now) {
      await h.load(); over();
      if (!who.admin && !h.isHost(who.email) && seated(who) === null) fail(403, "Only a person at this table can chat in it.");
      if (typeof text !== "string") fail(400, "Write something to say, up to 300 characters.");
      const said = text.trim();
      if (!said) fail(400, "Write something to say, up to 300 characters.");
      if (said.length > CHAT_MAX) fail(400, "A message is 300 characters at most.");
      const times = (recents.get(who.email) || []).filter((at) => now - at < CHAT_WINDOW);
      if (times.length >= CHAT_BURST) fail(429, "That is a lot of messages at once. Wait a moment, then send it again.");
      recents.set(who.email, [...times, now]);
      const rec = h.rec(), mine = seated(who), store = await chatLoad();
      const name = mine !== null ? rec.lifecycle.seats[mine].name : `Watching: ${clean(who.name) || "the owner"}`;
      const message = {id: store.next, seatId: mine, name, text: said, at: now};
      store.next += 1;
      store.messages = [...store.messages, message].slice(-CHAT_KEEP);
      await h.storage.put("chat", JSON.stringify(store));
      return message;
    },
    async chatRecord() {return (await chatLoad()).messages.slice(-CHAT_KEEP);},

    /* ---- what a view adds ---- */
    async viewExtra(who, {mine}) {
      const rec = h.rec(), t = rec.lifecycle;
      const requests = h.isHost(who.email) ? (rec.requests || []).filter((r) => r.status === "open").map(({requestId, name}) => ({requestId, name})) : undefined;
      const store = await chatLoad();
      return {
        privacy: publicTable() ? "public" : "private", observe: rec.observe === true, youAreAdmin: who.admin === true,
        houseRules: !(t.settings && t.settings.houseRules === false),
        watching: h.watching(), chat: store.messages.slice(-CHAT_VIEW),
        ...(requests ? {requests} : {}),
        ...(rec.quit ? {phase: "over", quit: {at: rec.quit.at, by: rec.quit.by}} : {}),
        ...(mine === null && !h.isHost(who.email) ? {spectating: true} : {}),
      };
    },
    seatExtra(s) {
      return {...(s.persona ? {persona: s.persona} : {}), ...(s.kind === "human" ? {open: open(s)} : {})};
    },
    /** The table's `privacy` set from Table rules (contract §2): the host's, in the lobby, and only a word. */
    async setPrivacy(who, privacy) {
      await h.load(); over();
      needOrganizer(who);
      const rec = h.rec();
      if (!["selecting", "countdown"].includes(rec.lifecycle.phase)) fail(409, "A table's privacy can change only in the lobby.");
      rec.privacy = privacyAsked(privacy, fail);
      await h.save();
      return h.api.view(who.email, {admin: who.admin});
    },

    /* ---- the registry's summary ---- */
    async summary(now) {
      await h.load();
      const rec = h.rec(), room = rec.lifecycle.phase === "playing" && !rec.quit ? await h.latestRoom() : null;
      return summaryOf(rec, {now, room: room ? {turn: room.watch().state.turn} : null});
    },
    held, open,
  };
}
