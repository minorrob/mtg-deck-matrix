/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WHAT HAPPENED, AND A HASH THAT SAYS WHETHER IT HAPPENED THE SAME WAY TWICE.
 *
 * `docs/engine/PLAN.md` §3.1 (journal.mjs) and §3.2.4 (checkpointable). The phase 1 gate is that a
 * four-player game replays to the same hash, and phase 5 compares this engine with Forge by
 * normalizing both states and comparing them at every priority. Both rest on `hashState`.
 *
 * The journal keeps the existing `CommanderProbeEvent@1` vocabulary that `match-telemetry.mjs`
 * already reads, so the board's history, notices and audio keep working when the engine is swapped
 * in behind the flag. It is a contract with code that exists, not a new one.
 *
 * TWO THINGS THAT LOOK LIKE DETAILS AND ARE NOT:
 *
 * 1. NO WALL CLOCK. Not one `Date.now()`. A replay of the same seed and the same decisions must
 *    produce a byte-identical journal, and a timestamp makes every run differ. When the host wants
 *    a real time it stamps the file it writes, outside the engine.
 *
 * 2. THE HASH IGNORES KEY ORDER. `JSON.stringify` preserves insertion order, so a state rebuilt
 *    from a checkpoint — same values, different order — would hash differently and a correct
 *    replay would be reported as a divergence. Keys are sorted; arrays are not, because array
 *    order is meaning: a library is ordered and a shuffle has to change its hash.
 *
 * The hash is FNV-1a over a canonical rendering. It is a checksum for "is this the same state",
 * not a security primitive, and nothing here should ever be asked to resist an adversary.
 */

/** The event vocabulary the board already reads. Bumped only when a reader must notice. */
export const EVENT_SCHEMA = "CommanderProbeEvent@1";

/* A canonical rendering: sorted keys, arrays in order, types distinguishable. `undefined` is
   written rather than dropped, so a missing field and a present-but-undefined one differ — one is
   usually a bug and they should not hash alike. */
function canonical(value) {
  if (value === null) return "null";
  if (value === undefined) return "undef";
  const type = typeof value;
  if (type === "number") return Number.isFinite(value) ? "n:" + value : "n:nonfinite";
  if (type === "boolean") return value ? "b:1" : "b:0";
  if (type === "string") return "s:" + value.length + ":" + value;
  if (type === "bigint") return "g:" + value;
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (type === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => canonical(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  /* A function or a symbol in game state is a bug in the caller: state is plain data (§3.2.4). */
  throw new Error(`Game state may only hold plain data; found a ${type}`);
}

/* FNV-1a over the canonical form, folded to 64 bits as two 32-bit halves so a collision needs
   both to agree. Sixteen hex characters is short enough to compare by eye in a divergence report. */
export function hashState(state) {
  const text = canonical(state);
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a ^= c; a = Math.imul(a, 0x01000193);
    b = (b + c) | 0; b = Math.imul(b ^ (b >>> 13), 0x85ebca6b);
  }
  const hex = (n) => ((n >>> 0).toString(16).padStart(8, "0"));
  return hex(a) + hex(b);
}

/**
 * A journal for one match.
 *
 * @param {{matchId: string, seed: string}} match
 */
export function createJournal({matchId, seed}) {
  if (!matchId) throw new Error("A journal needs the match it belongs to");
  const events = [];
  let sequence = 0;

  return {
    matchId,
    seed,

    /**
     * Record something that happened. `data` is copied, so a later mutation of the caller's object
     * cannot rewrite history — a journal is a record, not a view.
     */
    write(kind, data = {}) {
      if (!kind) throw new Error("An event needs a kind");
      sequence += 1;
      events.push({schema: EVENT_SCHEMA, sequence, matchId, kind, data: structuredClone(data)});
      return sequence;
    },

    /** Everything written, as copies. */
    events() {
      return structuredClone(events);
    },

    /**
     * A point a game can be resumed from (§3.2.4): the state, its hash, the rng position and the
     * event it follows. Its own copy of the state, so play continuing does not rewrite it.
     */
    checkpoint(state, rng) {
      return {
        schema: "CrankEngineCheckpoint@1",
        matchId, seed, sequence,
        hash: hashState(state),
        state: structuredClone(state),
        rng: structuredClone(rng),
      };
    },

    /** How many events have been written. */
    get length() {
      return events.length;
    },
  };
}
