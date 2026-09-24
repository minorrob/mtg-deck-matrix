/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* REPLACING FORGE: THE RUNTIME BEHIND THE FLAG.
 *
 * `docs/engine/PLAN.md` §3.7 and §6's phase 4.1. This is the piece that makes
 * `CRANKMAGIC_ENGINE=crank` do something: the host stops spawning a Java child and runs the engine
 * instead. It exports exactly what `local-game-launcher.mjs` exports, because `serve-review.mjs`
 * imports seven functions from it and calls them from a dozen places — a runtime that is "mostly
 * the same shape" is one that fails on the call nobody exercised until a real game was in progress.
 * `engine-runtime` compares the two surfaces mechanically.
 *
 * WHAT IS DIFFERENT UNDERNEATH, AND IT IS MOST OF THE POINT:
 *
 *   NO CHILD PROCESS. Forge's launcher spawns a JVM, waits for it to write a port to a file, and
 *   talks to it over HTTP on localhost. This runs in the host's own process. There is no port, no
 *   token, no orphan to reap, and nothing to go stale.
 *
 *   RESUME IS A FILE, NOT A RECONNECTION. Forge resumes by fetching that port and hoping the
 *   process is still alive; if it is not, the game is gone. This reads a checkpoint, which is what
 *   §3.2.4 has promised since 1.1 — a resumed game is the SAME game, not a game that happened to
 *   still be running.
 *
 *   IT REFUSES BEFORE THE GAME, BY NAME. Every card in `data/engine/support.json` is `unsupported`
 *   today, so no real deck can be played yet. The useful behavior is not to fail on the third turn
 *   when a card nobody wrote comes up — it is to say, at prepare time, exactly which cards are
 *   missing (readiness plan §10.5, principle 6). That is what makes the flag worth flipping now:
 *   point it at a real deck and get the list.
 *
 * WHAT IS DEFERRED AND NAMED: §3.7 wants one Worker per match so a long resolution cannot block the
 * host's event loop. In-process is correct and simpler while the engine is this fast — the
 * thousand-game gate runs in ten seconds — and the Worker is an isolation change that does not move
 * this surface. `house-pilot` seats are 4.2, and the API pilots already speak the `view` contract.
 */

import {existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createState, addObject} from "../engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../engine/rules/turn.mjs";
import {createRng} from "../engine/rng.mjs";
import {createJournal} from "../engine/journal.mjs";
import {createController} from "../engine/controller.mjs";
import {projectFor} from "../engine/projection.mjs";
import {beginMulligans, mulligansDone} from "../engine/rules/mulligan.mjs";
import {gameOver} from "../engine/rules/sba.mjs";
import {ENGINE_ID} from "../engine/index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

/* One game at a time, like the launcher it replaces. The host is a single desktop host serving one
   table; a second concurrent match is a cloud-host concern and §3.8 keeps this surface ready for it
   rather than pretending to it now. */
let live = null;

/* ---- what the engine can play ---- */

/* The basic lands are the one thing the kernel can play without a card definition: a Forest is a
   land with a mana ability and nothing else, and the engine has had both since 1.3. Everything else
   needs a definition, and there are none yet. */
const BASICS = {
  Forest: "G", Island: "U", Mountain: "R", Plains: "W", Swamp: "B", Wastes: "C",
};

function supportLedger() {
  const file = path.join(REPO, "data", "engine", "support.json");
  if (!existsSync(file)) return new Map();
  const rows = JSON.parse(readFileSync(file, "utf8")).cards ?? [];
  return new Map(rows.map((row) => [row.name ?? row.oracleId, row.status]));
}

/**
 * Which cards in this pod the engine cannot play, with no duplicates and in a stable order.
 *
 * Asked before anything is written, so a refused launch leaves nothing half-started.
 */
export function unsupportedCards(pod) {
  const ledger = supportLedger();
  const missing = new Set();
  for (const seat of pod?.seats ?? []) {
    for (const card of seat.deck?.cards ?? []) {
      if (BASICS[card]) continue;
      const status = ledger.get(card);
      if (status === "verified" || status === "compiled") continue;
      missing.add(card);
    }
  }
  return [...missing].sort();
}

/* ---- the game directory, which is the contract with everything that reads a match ---- */

function writeDirectory(directory, pod) {
  mkdirSync(directory, {recursive: true});
  writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({
    schema: "CommanderProbeManifest@1", engine: ENGINE_ID, matchId: pod.matchId, seed: pod.seed ?? null,
  }, null, 2));
  writeFileSync(path.join(directory, "pod.json"), JSON.stringify(pod, null, 2));
}

function writeStatus(directory, status) {
  writeFileSync(path.join(directory, "live-status.json"), JSON.stringify(status, null, 2));
}

/* The journal streams to the game directory as newline-delimited JSON, in the envelope
   `ForgeProbe.java` already writes, so `match-report.mjs` and `match-telemetry.mjs` read a crank
   match with the code they already have. */
function streamEvents(directory, journal, events) {
  const file = path.join(directory, "journal.ndjson");
  for (const event of events) {
    const id = journal.write(event.kind, event.data);
    appendFileSync(file, JSON.stringify({
      schema: "CommanderProbeEvent@1", eventId: id, visibility: "engine-private",
      kind: event.kind, data: event.data,
    }) + "\n");
  }
}

/* ---- running the game up to the next thing a person has to decide ---- */

/* Advance until a seat has a decision or the game is over. Nothing here answers anything: the
   engine stops at `awaiting` or at priority, and the host's seats and pilots take it from there. */
function runToDecision(state, journal, directory) {
  for (let guard = 0; guard < 5000; guard += 1) {
    if (gameOver(state)) return "finished";
    if (state.awaiting) return "playing";
    if (state.priorityPlayer !== null) return "playing";
    streamEvents(directory, journal, advance(state));
  }
  throw new Error("The engine did not reach a decision; this is a bug in the rules, not in the pod");
}

/* ---- the seven the host imports ---- */

/**
 * Start a game.
 *
 * Refuses, by name, any pod containing a card the engine has no definition for — before writing
 * anything, so a refused launch leaves nothing behind.
 */
export async function launchLocalGame(pod, options = {}) {
  const missing = unsupportedCards(pod);
  if (missing.length > 0) {
    throw new Error(
      `This table cannot be played by the CrankMagic engine yet. ${missing.length} card`
      + `${missing.length === 1 ? " has" : "s have"} no definition: ${missing.join(", ")}.`
    );
  }

  const directory = options.directory
    ?? path.join(REPO, "game", ".local", "games", `${pod.matchId}-${pod.seed ?? "seed"}`);
  writeDirectory(directory, pod);

  const seats = (pod.seats ?? []).map((seat) => ({name: seat.name ?? `Seat ${seat.seatId}`}));
  const state = createState({matchId: pod.matchId, seed: pod.seed ?? pod.matchId, players: seats});
  const rng = createRng(pod.seed ?? pod.matchId);
  const journal = createJournal({matchId: pod.matchId, seed: pod.seed ?? pod.matchId});

  /* The decks, as the kernel can hold them: a basic land is a land with its mana ability. */
  (pod.seats ?? []).forEach((seat, index) => {
    for (const card of seat.deck?.cards ?? []) {
      const color = BASICS[card];
      addObject(state, {
        card, types: ["Land"], owner: index, controller: index,
        abilities: color ? [{id: `t-${color}`, kind: "mana", tapSelf: true, produces: {[color]: 1}}] : [],
      }, "library", index);
    }
  });

  streamEvents(directory, journal, beginMulligans(state, rng));
  live = {directory, pod, state, rng, journal, controller: createController(), status: "ready"};

  /* The mulligan is the first thing a seat is asked, so the game is "ready" the moment it is
     waiting on one — which is exactly what the board's countdown is watching for. */
  const status = {status: mulligansDone(state) ? "playing" : "ready", matchId: pod.matchId, engine: ENGINE_ID};
  writeStatus(directory, status);
  live.status = status.status;
  return {directory, matchId: pod.matchId};
}

/** Pick a game back up from its checkpoint (§3.2.4). */
export async function resumeLocalGame(directory) {
  const target = path.resolve(directory);
  const file = path.join(target, "checkpoint.json");
  if (!existsSync(file))
    throw new Error("There is no checkpoint to resume from in that directory");
  const point = JSON.parse(readFileSync(file, "utf8"));
  const pod = JSON.parse(readFileSync(path.join(target, "pod.json"), "utf8"));
  live = {
    directory: target, pod,
    state: point.state,
    rng: createRng(point.seed, point.rng),
    journal: createJournal({matchId: point.matchId, seed: point.seed}),
    controller: createController(point.controller),
    status: "playing",
    resumed: true,
  };
  writeStatus(target, {status: "playing", matchId: point.matchId, engine: ENGINE_ID, resumed: true});
  return {directory: target, matchId: point.matchId};
}

/** What the board polls. The same words the launcher uses, because the board matches on them. */
export function liveStatus() {
  if (!live) return {status: "idle"};
  return {
    status: gameOver(live.state) ? "finished" : live.status,
    matchId: live.pod.matchId,
    directory: live.directory,
    engine: ENGINE_ID,
    ...(live.resumed ? {resumed: true} : {}),
  };
}

/** The pod of the running game. */
export function livePod() {
  if (!live) throw new Error("No local game is running");
  return live.pod;
}

/** Seat zero's bridge, which is what a solo table uses. */
export async function browserBridge(operation, body) {
  return browserBridgeForSeat(0, operation, body);
}

/**
 * The §12.1 envelope, for one seat.
 *
 * `view` is a projection plus the ui block; `action` goes through the controller, which validates
 * it against the pending choice exactly as the bridge always has. `nativeFallback` is always empty
 * and always will be: there is no other window for a player to go and finish something in, which is
 * one of the things replacing Forge buys.
 */
export async function browserBridgeForSeat(seatId, operation, body) {
  if (!live) throw new Error("No local game is running");
  if (!live.state.players[seatId]) throw new Error(`There is no seat ${seatId} at this table`);

  if (operation === "view") {
    const pending = live.controller.pending;
    const awaiting = live.state.awaiting ? awaitingChoice(live.state) : null;
    const choice = pending ?? awaiting;
    const mine = choice && (choice.player === undefined || choice.player === seatId);
    return {
      viewerSeatId: seatId,
      viewerPlayerId: seatId,
      revision: live.controller.revision,
      engine: ENGINE_ID,
      state: projectFor(live.state, seatId),
      ui: {
        prompt: mine && choice ? choice.title : "",
        ok: "OK", cancel: "Cancel",
        okEnabled: Boolean(mine && choice), cancelEnabled: false,
        selectables: [], selectableCards: [],
        choice: mine ? choice : null,
        nativeFallback: "",
        inputType: mine && choice ? choice.mode : null,
        payment: null,
        cardActions: {}, highlightedPlayers: [], highlightedCards: [],
        actionInFlight: false, lastAction: null,
      },
    };
  }

  if (operation === "action") {
    const receipt = live.controller.answer(body);
    if (live.controller.answered) {
      const answer = live.controller.take();
      const events = resolveAwaiting(live.state, answer.indices, answer.amounts, live.rng, answer);
      streamEvents(live.directory, live.journal, events);
      live.status = runToDecision(live.state, live.journal, live.directory);
      writeStatus(live.directory, {status: live.status, matchId: live.pod.matchId, engine: ENGINE_ID});
    }
    return receipt;
  }

  throw new Error(`The bridge has no operation named ${JSON.stringify(operation)}`);
}

/** Stop, leaving the record the board's post-game screen reads. */
export async function closeLocalGame() {
  if (!live) return;
  const outcome = gameOver(live.state);
  writeFileSync(path.join(live.directory, "summary.json"), JSON.stringify({
    schema: "CommanderProbeSummary@1", engine: ENGINE_ID, matchId: live.pod.matchId,
    status: outcome ? "finished" : "closed",
    outcome: outcome ?? null,
    turns: live.state.turn,
    events: live.journal.length,
  }, null, 2));
  /* A checkpoint on the way out, so closing a game is not the same as losing it. */
  writeFileSync(path.join(live.directory, "checkpoint.json"), JSON.stringify(
    live.journal.checkpoint(live.state, live.rng.checkpoint()), null, 2));
  live = null;
}
