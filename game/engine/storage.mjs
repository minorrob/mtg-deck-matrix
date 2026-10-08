/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WHERE A MATCH IS KEPT, WITHOUT THE ENGINE KNOWING WHERE THAT IS.
 *
 * `docs/engine/PLAN.md` §3.8 and task 4.1b (`docs/plan-to-100.md` M4): "the runtime writes its journal and
 * checkpoints through an interface, not Node's `fs`, so a Durable Object can host it." This file is that
 * interface and the one implementation that needs nothing: memory. The file-backed one for the local host is
 * `game/server/storage-fs.mjs`, outside this directory on purpose; the cloud one wraps a Durable Object's own
 * `state.storage` in M5. Nothing under `game/engine/` imports a Node module, and `tests/engine-storage.mjs`
 * fails if one ever does.
 *
 * THE STORAGE CONTRACT is the shape of a Durable Object's storage, cut to what a match needs, so the cloud
 * implementation is a thin wrapper and not a translation:
 *
 *   get(key)          -> Promise<string | null>
 *   put(key, value)   -> Promise<void>          value is a string (the match store writes JSON)
 *   delete(key)       -> Promise<boolean>
 *   list(prefix)      -> Promise<string[]>      the keys under a prefix, in ascending order
 *
 * Keys are slash-separated words of [A-Za-z0-9._-] with no empty, "." or ".." part, which keeps a key from
 * ever naming a place outside its store when an implementation maps it to a path.
 *
 * A MATCH IS A VALUE (§3.8): its pod and seed, its journal, and its checkpoints. `createMatchStore` keeps
 * those under `match/<id>/`. A checkpoint is verified on the way in and on the way out: the hash it carries
 * must be the hash of the state it carries, so a truncated write or an edited file is refused by name rather
 * than resumed into a different game.
 */
import {hashState, EVENT_SCHEMA} from "./journal.mjs";

export const STORAGE_PROTOCOL = 1;
export const CHECKPOINT_SCHEMA = "CrankEngineCheckpoint@1";

const PART = /^[A-Za-z0-9._-]+$/;

/** Throws unless `key` is a safe storage key. Exported so every implementation checks the same way. */
export function checkKey(key) {
  if (typeof key !== "string" || key.length === 0 || key.length > 512) throw new Error("A storage key must be a non-empty string of at most 512 characters");
  for (const part of key.split("/")) {
    if (!PART.test(part) || part === "." || part === "..") throw new Error(`A storage key's parts are words of [A-Za-z0-9._-], never empty, "." or ".." (got ${JSON.stringify(key)})`);
  }
  return key;
}

/** Throws unless `storage` has the four async methods of the contract. */
export function checkStorage(storage) {
  for (const m of ["get", "put", "delete", "list"])
    if (!storage || typeof storage[m] !== "function") throw new Error(`A storage adapter needs ${m}(); see game/engine/storage.mjs`);
  return storage;
}

/** Storage in memory: for tests, for a solo table in one tab, and as the reference behavior. */
export function memoryStorage() {
  const map = new Map();
  return {
    kind: "memory",
    async get(key) { checkKey(key); return map.has(key) ? map.get(key) : null; },
    async put(key, value) {
      checkKey(key);
      if (typeof value !== "string") throw new Error("Storage holds strings; the match store writes JSON");
      map.set(key, value);
    },
    async delete(key) { checkKey(key); return map.delete(key); },
    async list(prefix = "") {
      if (prefix) checkKey(prefix.replace(/\/$/, ""));
      return [...map.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
}

/* Where a value would not survive JSON: a key holding undefined (dropped), a number that is not finite (null). */
function lostIn(value, path) {
  if (typeof value === "number" && !Number.isFinite(value)) return `${path} is ${value}`;
  if (!value || typeof value !== "object") return null;
  for (const [key, v] of Object.entries(value)) {
    const at = `${path}.${key}`;
    if (v === undefined) return `${at} is undefined`;
    const lost = lostIn(v, at);
    if (lost) return lost;
  }
  return null;
}

/* Sequence numbers are written fixed-width so the store's ascending key order is the journal's order. */
const pad = (n) => String(n).padStart(10, "0");

/**
 * One match's journal, checkpoints and card index over any storage.
 *
 * @param {object} storage  implements the contract above
 * @param {string} matchId  the match; one key part
 */
export function createMatchStore(storage, matchId) {
  checkStorage(storage);
  checkKey(String(matchId));
  if (String(matchId).includes("/")) throw new Error("A match id is one key part, with no slash");
  const root = `match/${matchId}`;
  const read = async (key) => { const text = await storage.get(key); return text === null ? null : JSON.parse(text); };
  const write = (key, value) => storage.put(key, JSON.stringify(value));

  function verified(point, where) {
    if (!point || point.schema !== CHECKPOINT_SCHEMA) throw new Error(`${where}: not a ${CHECKPOINT_SCHEMA}`);
    if (point.matchId !== matchId) throw new Error(`${where}: the checkpoint is for match ${point.matchId}, not ${matchId}`);
    if (!Number.isInteger(point.sequence) || point.sequence < 0) throw new Error(`${where}: the checkpoint has no journal position`);
    if (hashState(point.state) !== point.hash) throw new Error(`${where}: the state does not match its hash, so it is not the game that was saved; refusing to resume it`);
    return point;
  }

  return {
    matchId,

    /** The match's identity: its pod and seed. Written once, when the match starts. */
    async saveMatch({pod, seed}) {
      if (typeof seed !== "string") throw new Error("A match needs its seed");
      if (await storage.get(`${root}/meta`) !== null) throw new Error(`Match ${matchId} is already stored; a match is started once`);
      await write(`${root}/meta`, {protocol: STORAGE_PROTOCOL, matchId, seed, pod: structuredClone(pod)});
    },
    async loadMatch() { return read(`${root}/meta`); },

    /** Journal events, as the engine's journal writes them. Each is kept under its own sequence number. */
    async appendEvents(events) {
      for (const e of events) {
        if (!e || e.schema !== EVENT_SCHEMA || !Number.isInteger(e.sequence) || e.matchId !== matchId)
          throw new Error(`Only this match's ${EVENT_SCHEMA} events go in its journal`);
        const key = `${root}/journal/${pad(e.sequence)}`;
        if (await storage.get(key) !== null) throw new Error(`Journal event ${e.sequence} is already written; a journal is appended to, never rewritten`);
        await write(key, e);
      }
    },
    async readJournal() {
      const keys = await storage.list(`${root}/journal/`);
      const events = [];
      for (const k of keys) events.push(await read(k));
      return events;
    },

    /** THE DECISION TAPE (docs/plan-to-100.md M8): the inputs the journal does not hold -- a person's answers, a seat
        leaving, the game ended -- each under its own number, appended, never rewritten. With the seed it replays the
        game (game/room/replay.mjs); the journal holds what the engine did, the tape what people told it. */
    async appendTape(entries) {
      for (const t of entries) {
        if (!t || !Number.isInteger(t.n) || t.n < 0 || !["answer", "leave", "end"].includes(t.kind)) throw new Error("A tape entry is {n, kind: answer | leave | end, seat, ...}");
        const key = `${root}/tape/${pad(t.n)}`;
        if (await storage.get(key) !== null) throw new Error(`Tape entry ${t.n} is already written; a tape is appended to, never rewritten`);
        await write(key, t);
      }
    },
    async readTape() {
      const tape = [];
      for (const k of await storage.list(`${root}/tape/`)) tape.push(await read(k));
      return tape;
    },

    /** A checkpoint from the engine's `journal.checkpoint(state, rng)`, verified, then made the latest. */
    async saveCheckpoint(point) {
      verified(point, "saveCheckpoint");
      /* WRITTEN AS IT WILL BE READ. JSON drops a key whose value is undefined and writes NaN as null, and the hash keeps
         both apart (journal.mjs `canonical`), so such a checkpoint would be refused as it is read back: the room could not
         wake (G1, 2026-10-08: a layer-6 effect's `sublayer: undefined`, from any effect without a sublayer). Refused here
         instead, naming the field, while the game that made it is still in memory. */
      const text = JSON.stringify(point);
      if (hashState(JSON.parse(text).state) !== point.hash) throw new Error(`saveCheckpoint: the state would not read back as the game it is (${lostIn(point.state, "state")}), so a room could not wake from it`);
      await storage.put(`${root}/checkpoint/${pad(point.sequence)}`, text);
      await write(`${root}/checkpoint/latest`, {sequence: point.sequence});
    },
    /** The newest checkpoint, verified; null when the match has none yet. */
    async latestCheckpoint() {
      const latest = await read(`${root}/checkpoint/latest`);
      if (!latest) return null;
      return verified(await read(`${root}/checkpoint/${pad(latest.sequence)}`), `checkpoint ${latest.sequence} of ${matchId}`);
    },

    /** Keep only the latest checkpoint. A room checkpoints at every person's decision, and the journal is
        the history; older checkpoints are dead weight in a Durable Object's storage. */
    async pruneCheckpoints() {
      const latest = await read(`${root}/checkpoint/latest`);
      if (!latest) return 0;
      const keep = `${root}/checkpoint/${pad(latest.sequence)}`;
      let removed = 0;
      for (const key of await storage.list(`${root}/checkpoint/`)) {
        if (key === keep || key === `${root}/checkpoint/latest`) continue;
        if (await storage.delete(key)) removed += 1;
      }
      return removed;
    },

    /** The card index a match plays with, by the data version it pinned (plan-data-sync §0). */
    async saveCardIndex(version, index) {
      checkKey(String(version));
      await write(`cards/${version}`, index);
    },
    async loadCardIndex(version) {
      checkKey(String(version));
      return read(`cards/${version}`);
    },
  };
}
