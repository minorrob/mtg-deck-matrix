/* THE ENGINE EXISTS, ANNOUNCES WHAT IT CANNOT DO, AND IS NOT REACHABLE BY ACCIDENT.
 *
 * `docs/engine/PLAN.md` §6 phase 0.1. Three things matter at this phase and only three:
 *
 *   1. The entry point is where §3.1 says it is, and it THROWS. A stub returning a plausible game
 *      would let callers be written against a fiction and fail later, further from the cause —
 *      principle 6, unsupported is loud.
 *   2. The refusal says which phase it is at and what to do instead, because the person reading it
 *      will be whoever wired the flag on by mistake.
 *   3. The flag defaults to Forge. An engine that plays nothing must not be reachable by anyone who
 *      has not deliberately asked for it.
 */
import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";
import {createGame, ENGINE_ID, ENGINE_PROTOCOL, ENGINE_STATUS, EngineNotImplemented} from "../game/engine/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

eq(ENGINE_ID, "crank", "the flag value that selects this engine");
eq(ENGINE_PROTOCOL, 1, "the journal and projection protocol this engine speaks");
eq(ENGINE_STATUS.phase, 0, "phase 0 until the kernel gate passes");
/* The list names what is built and green, module by module. It is NOT a claim that a game can be
   played — there is no mana and no combat — and `createGame` still refuses below. Its job is to let
   a caller ask what exists rather than find out by catching an exception. Every name here has a
   suite; a name without one would be the exact lie this field exists to prevent. */
eq(ENGINE_STATUS.implemented,
  ["rng", "journal", "state", "turn", "stack", "priority", "controller", "actions", "mana", "cast", "combat", "sba", "trigger", "projection", "replacement"],
  "the status names what is actually built, and nothing that is not");
ok(ENGINE_STATUS.implemented.every((name) => existsSync(new URL(`./engine-${name}.mjs`, import.meta.url))),
  "and every name it claims has a suite in this directory holding it up");
ok(typeof ENGINE_STATUS.next === "string" && ENGINE_STATUS.next.length > 10,
  "and it names what comes next, so a caller can ask instead of catching an exception to find out");
ok(Object.isFrozen(ENGINE_STATUS), "the status is read, never edited by a caller");

/* The refusal itself. */
let thrown = null;
try { createGame({seats: []}, {seed: "test"}); } catch (error) { thrown = error; }
ok(thrown instanceof EngineNotImplemented, "createGame refuses rather than returning a fiction");
ok(/phase 0/.test(thrown.message), "the refusal names the phase it is at");
ok(/CRANKMAGIC_ENGINE=forge/.test(thrown.message), "and what to run instead");
eq(thrown.engine, "crank", "the error carries the engine it came from, for a log that has both");

/* THE FLAG DEFAULTS TO FORGE. This is the check that matters today: an engine that plays nothing
   must not be reachable by anyone who has not asked for it by name. */
const host = readFileSync(path.join(ROOT, "game/tools/serve-review.mjs"), "utf8");
ok(/CRANKMAGIC_ENGINE/.test(host), "the host reads the engine flag");
const line = /const\s+engineFlag\s*=\s*([^;]+);/.exec(host);
ok(line, "the flag is read once, into one name, so there is one place to find it");
ok(/'forge'|"forge"/.test(line[1]),
  "and it defaults to forge — the engine is opt-in until its gate passes");

/* A file under game/engine/ is Rob's outright (§12.5). engine-headers.mjs holds the whole tree;
   this one line keeps the entry point honest even if that suite is ever narrowed. */
const entry = readFileSync(path.join(ROOT, "game/engine/index.mjs"), "utf8");
ok(entry.startsWith("/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */"),
  "the engine entry point opens with the copyright header");

console.log(`engine-skeleton: ${checks} checks passed — the entry point exists, refuses loudly, names its phase, and the flag defaults to Forge.`);
