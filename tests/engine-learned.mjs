/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE LEARNED DEFINITIONS STORED IN THE REPOSITORY: STILL THEIR CARDS, PLAYED RIGHT, AND AT NO TABLE (X10).
 *
 * `data/engine/scripts` holds definitions learned outside the hand-authored directory -- by the card loader
 * (game/tools/engine-compile.mjs) or written in a session (game/tools/engine-ingest.mjs) -- stored PROVISIONAL. The
 * smoke game they passed proves only that they do not throw (the plan review's R5), so the pilot of 2026-10-06 played
 * each one in a scenario as well (docs/engine/velocity-measured-2026-10-06.md). This holds them to that:
 *
 *   1. Each stored record is its card as the oracle has it today, provisional, and still passes schema and fidelity.
 *   2. Each one the directory can play has a scenario here (tests/fixtures/learned-scenarios.json), and every scenario
 *      passes through the rules -- a definition found wrong is withdrawn, not left with a failing check.
 *   3. None is seated at a table (the execution plan's D5: a provisional definition seats only at a playtest table until
 *      a played game or Rob confirms it, and no table reads them yet): the table's module (cloud/game-room.mjs
 *      `tableCards`, from game/engine/cards/definitions.mjs) has none of them. The check is shown to fire on a table
 *      that reads the learned folder.
 */
import assert from "node:assert/strict";
import {readFileSync, readdirSync, existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {COMPILED_SCHEMA, oracleHash, checkFidelity} from "../game/engine/cards/compile.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex, loadCompiledScripts, COMPILED_DIR} from "../game/tools/engine-cards.mjs";
import {characteristicsOf, controllerOf, typesOf, keywordsOf} from "../game/engine/rules/layers.mjs";
import {tableCards} from "../cloud/game-room.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const oracle = new Map(JSON.parse(readFileSync(path.join(REPO, "data", "engine", "oracle.json"), "utf8")).cards.map((c) => [c.id, c]));
const ledger = existsSync(path.join(REPO, "data", "engine", "onboarding-ledger.json"))
  ? JSON.parse(readFileSync(path.join(REPO, "data", "engine", "onboarding-ledger.json"), "utf8")) : {cards: {}};
const records = existsSync(COMPILED_DIR) ? readdirSync(COMPILED_DIR).sort().flatMap((prefix) => readdirSync(path.join(COMPILED_DIR, prefix)).sort()
  .map((file) => ({file: `${prefix}/${file}`, record: JSON.parse(readFileSync(path.join(COMPILED_DIR, prefix, file), "utf8"))}))) : [];
const index = loadCardIndex();
const spec = JSON.parse(readFileSync(new URL("./fixtures/learned-scenarios.json", import.meta.url), "utf8"));

/* ---- 1. each record is its card, today ---- */
ok(records.length > 0, `the learned folder holds definitions (${records.length})`);
eq(loadCompiledScripts().length, records.length, "and the card directory reads every one of them");
for (const {file, record} of records) {
  const card = oracle.get(record.oracleId);
  ok(card && card.name === record.name, `${file} is a card the oracle data has (${record.name})`);
  eq(file, `${record.oracleId.slice(0, 2)}/${record.oracleId}.json`, `${record.name} is stored where the loader stores it`);
  eq([record.schema, record.status, record.oracleHash], [COMPILED_SCHEMA, "provisional", oracleHash(card)], `${record.name}: a provisional definition of the card's current text`);
  eq(record.checks.readBack, "not run", `${record.name} says no second reader checked it`);
  eq(ledger.cards[record.oracleId]?.status, "provisional", `${record.name}: the ledger records it provisional`);
  ok(validateScript(record.script).valid && checkFidelity(record.script).ok, `${record.name} still passes schema and fidelity`);
}

/* ---- 2. each plays right in its scenarios ---- */
const mine = (state, seat, card) => state.zones.battlefield.filter((id) => controllerOf(state, id) === seat && state.objects[id].card === card);
/* What a scenario file cannot say: whether a player lost, how many of a permanent, its types, every Bird's size. */
function post(state, c) {
  if (c.count) return mine(state, c.count.seat, c.count.card).length === c.count.n;
  if (c.tappedCount) return mine(state, c.tappedCount.seat, c.tappedCount.card).filter((id) => state.objects[id].tapped).length === c.tappedCount.n;
  if (c.types) { const [id] = mine(state, c.types.seat, c.types.card); return id !== undefined && c.types.has.every((t) => typesOf(state, id).includes(t)); }
  if (c.lost) return (state.players[c.lost.seat].lost === true) === c.lost.is;
  if (c.onBattlefield) {
    const o = c.onBattlefield, [id] = mine(state, o.seat, o.card); if (id === undefined) return false;
    const ch = characteristicsOf(state, id); return ch.power === o.power && ch.toughness === o.toughness && (!o.keyword || keywordsOf(state, id).includes(o.keyword));
  }
  if (c.birds) return JSON.stringify(mine(state, c.birds.seat, "Bird").map((id) => [characteristicsOf(state, id).power, characteristicsOf(state, id).toughness]).sort()) === JSON.stringify(c.birds.stats);
  throw new Error(`a post check this suite does not know: ${JSON.stringify(c)}`);
}
const covered = new Set();
for (const entry of spec.cards) {
  ok(index.resolve(entry.card)?.source === "compiled" && index.resolve(entry.card)?.playable === true, `${entry.card} is a learned definition the directory plays`);
  for (const scenario of entry.scenarios) {
    const runs = scenario.then ? [{...scenario, then: undefined}, {...scenario, name: `${scenario.name} (then)`, steps: [...scenario.steps, ...scenario.then.steps], post: scenario.then.post, expect: []}] : [scenario];
    for (const run of runs) {
      const {state} = runScenario(run, index.definition, spec.fixtures);
      for (const c of run.post ?? []) ok(post(state, c), `${run.name}: ${JSON.stringify(c)}`);
      checks += 1;
    }
  }
  covered.add(entry.card);
}
eq(records.filter(({record}) => index.resolve(record.name)?.playable === true && !covered.has(record.name)).map(({record}) => record.name), [],
  "every learned definition the directory plays has a scenario here: a smoke game alone proves only that it does not throw");

/* ---- 3. at no table ---- */
const seated = (table) => records.filter(({record}) => { try { return Boolean(table(record.name)); } catch { return false; } }).map(({record}) => record.name);
eq(seated(tableCards), [], "no learned definition is seated by the table's card source: a provisional one seats nowhere until confirmed (D5)");
/* The check fires on a table that reads the learned folder (the card directory as engine-cards.mjs reads it). */
eq(seated((name) => (index.resolve(name)?.source === "compiled" ? index.definition(name) : null)).length, records.length,
  "and a table reading data/engine/scripts would be caught by it, every definition there named");

console.log(`engine-learned: ${checks} checks passed -- ${records.length} learned definitions, each its card today, each played right in its scenarios, none seated at a table.`);
