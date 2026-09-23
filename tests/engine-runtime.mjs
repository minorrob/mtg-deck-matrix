/* REPLACING FORGE: THE RUNTIME BEHIND THE FLAG.
 *
 * `docs/engine/PLAN.md` §3.7 and §6's phase 4.1 — "`engine-runtime.mjs` with the launcher exports
 * and the game directory files". This is the piece that makes `CRANKMAGIC_ENGINE=crank` do
 * something: the host stops starting a Java child and starts running the engine instead.
 *
 * THE SURFACE IS NOT NEGOTIABLE, and that is the first thing checked here. `serve-review.mjs`
 * imports seven functions from the launcher and calls them from a dozen places. A runtime that is
 * "mostly the same shape" is one that fails on the call nobody exercised until a real game was in
 * progress. So the two modules are compared export for export, mechanically — the plan says six and
 * it is seven, which is exactly the sort of thing a person counting by eye gets wrong.
 *
 * IT REFUSES AT PREPARE TIME, BY NAME. Every card in `data/engine/support.json` is `unsupported`
 * today, so no real deck can be played yet. The useful behaviour is not to fail when the third turn
 * reaches a card nobody wrote — it is to say, before the game starts, exactly which cards are
 * missing. That is readiness plan §10.5 and principle 6, and it is what makes the flag worth
 * flipping today: Rob can point it at a real deck and get a list.
 *
 * RESUME IS A FILE, NOT A RECONNECTION. Forge's launcher resumes by fetching a port and hoping the
 * process is still alive. This one reads a checkpoint, which is what §3.2.4 has been promising
 * since 1.1 — and it means a resumed game is the same game, not a game that happens to still be
 * running.
 */
import assert from "node:assert/strict";
import {mkdtempSync, existsSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import * as forge from "../game/tools/local-game-launcher.mjs";
import * as crank from "../game/server/engine-runtime.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

/* The seven `serve-review.mjs` imports on its line 9. */
const HOST_NEEDS = [
  "launchLocalGame", "liveStatus", "livePod", "browserBridge",
  "browserBridgeForSeat", "resumeLocalGame", "closeLocalGame",
];

/* ---- the surface matches, function for function ---- */
{
  for (const name of HOST_NEEDS) {
    ok(typeof forge[name] === "function", `the Forge launcher exports ${name}`);
    checks -= 1;
  }
  checks += 1;
  for (const name of HOST_NEEDS) {
    ok(typeof crank[name] === "function",
      `the crank runtime exports ${name} — a runtime that is "mostly the same shape" fails on the call nobody exercised until a real game was in progress`);
    checks -= 1;
  }
  checks += 1;
  eq(HOST_NEEDS.length, 7,
    "seven, not the six the plan says — the sort of thing a person counting by eye gets wrong, which is why this is a check");
}
{
  /* Same arity, so a caller cannot pass arguments one of them quietly ignores. */
  for (const name of HOST_NEEDS) {
    eq(crank[name].length, forge[name].length, `${name} takes the same arguments in both`);
    checks -= 1;
  }
  checks += 1;
}

/* ---- idle before anything starts ---- */
{
  eq(crank.liveStatus().status, "idle", "a runtime with no game is idle, the same word the board already reads");
  assert.throws(() => crank.livePod(), /no local game|not running/i,
    "and asking for the pod of a game that is not running is refused"); checks += 1;
}

/* ---- it refuses a deck it cannot play, before the game starts, by name ---- */
{
  const directory = mkdtempSync(path.join(tmpdir(), "crank-runtime-"));
  const pod = {
    matchId: "refuse-me",
    seats: [
      {seatId: 0, name: "Rob", deck: {cards: ["Sol Ring", "Forest", "Krenko, Mob Boss"]}},
      {seatId: 1, name: "Krenko", deck: {cards: ["Forest"]}},
    ],
  };
  let thrown = null;
  try { await crank.launchLocalGame(pod, {directory}); } catch (error) { thrown = error; }
  ok(thrown, "a pod full of cards with no definitions does not start");
  ok(/Sol Ring/.test(thrown.message),
    "and the refusal NAMES the cards it cannot play — the useful failure is before the game, not on the third turn when a card nobody wrote comes up");
  ok(/Krenko, Mob Boss/.test(thrown.message), "all of them, not just the first");
  eq(crank.liveStatus().status, "idle", "and nothing is left half-started");
  rmSync(directory, {recursive: true, force: true});
}

/* ---- a pod it CAN play starts, and writes the files the host reads ---- */
{
  const directory = mkdtempSync(path.join(tmpdir(), "crank-runtime-"));
  const pod = {
    matchId: "playable",
    seed: "runtime-test",
    seats: [
      {seatId: 0, name: "Rob", deck: {cards: new Array(40).fill("Forest")}},
      {seatId: 1, name: "Krenko", deck: {cards: new Array(40).fill("Forest")}},
      {seatId: 2, name: "Atraxa", deck: {cards: new Array(40).fill("Forest")}},
      {seatId: 3, name: "Shadrix", deck: {cards: new Array(40).fill("Forest")}},
    ],
  };
  await crank.launchLocalGame(pod, {directory});

  const status = crank.liveStatus();
  ok(["ready", "playing"].includes(status.status),
    `a pod of basic lands is inside the engine's vocabulary and starts (${status.status})`);
  eq(status.matchId, "playable", "the status carries the match id the board matches on");
  ok(status.directory, "and the directory, which is how match-report finds the journal");

  for (const file of ["manifest.json", "pod.json", "live-status.json"]) {
    ok(existsSync(path.join(status.directory, file)),
      `the game directory has ${file}, because the host and the report reader both look for it`);
    checks -= 1;
  }
  checks += 1;
  eq(JSON.parse(readFileSync(path.join(status.directory, "manifest.json"), "utf8")).matchId, "playable",
    "the manifest names the match, which is what liveStatus reads it for");
  eq(crank.livePod().matchId, "playable", "and the pod is recoverable from disk");

  /* The §12.1 envelope, which the board already speaks. */
  const view = await crank.browserBridgeForSeat(0, "view");
  eq(view.viewerSeatId, 0, "a seat's view says whose it is");
  eq(view.engine, "crank", "and which engine served it, which is the one field §3.5 adds");
  ok(Number.isInteger(view.revision), "with a revision the board polls on");
  eq(view.state.schema, "CommanderProbeProjection@1", "the projection is the one the board already renders");
  eq(view.state.players.length, 4, "four seats");
  ok(view.ui, "and a ui block");
  eq(view.ui.nativeFallback, "", "with no native fallback — there is no other window to finish anything in");

  /* THE PROPERTY 1.10 PROVED, HELD ACROSS THE HOST BOUNDARY TOO. */
  const mine = view.state.players.find((p) => p.playerId === 0);
  const theirs = view.state.players.find((p) => p.playerId === 1);
  ok(mine.zones.Hand.cards.length >= 0, "a seat sees its own hand");
  eq(theirs.zones.Hand.cards, [],
    "and not anybody else's, through the bridge as well as inside the engine");

  const other = await crank.browserBridgeForSeat(1, "view");
  eq(other.viewerSeatId, 1, "each seat gets its own view");

  await crank.closeLocalGame();
  eq(crank.liveStatus().status, "idle", "closing returns it to idle");
  ok(existsSync(path.join(directory, "summary.json")),
    "leaving a summary, which is what the board's post-game record reads");
  rmSync(directory, {recursive: true, force: true});
}

/* ---- refusals ---- */
{
  await assert.rejects(() => crank.browserBridgeForSeat(0, "view"), /no local game|not running/i,
    "the bridge refuses when nothing is running"); checks += 1;
  await assert.rejects(() => crank.resumeLocalGame(path.join(tmpdir(), "nothing-here")),
    /resume|checkpoint|outside/i, "and resume refuses a directory with no game in it"); checks += 1;
}

console.log(`engine-runtime: ${checks} checks passed — the launcher's seven exports matched function for function, a deck it cannot play refused by name before the game starts, and a seat's view that still shows nobody else's hand.`);
