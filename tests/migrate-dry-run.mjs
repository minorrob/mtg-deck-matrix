/* THE MIGRATION, PRINTED BEFORE IT RUNS (docs/plan-groups.md §4). tools/migrate-dry-run.mjs on Rob's real library
 * as his browser holds it -- the v25 backup he restored, schema 3, kept as tests/fixtures/live-state-v25.json.gz since
 * data/live-state.json was rebuilt from the 9.30 workbook at schema 4 (2026-09-30) -- says exactly what opening it in
 * this build changes: the empty Main Deck goes, every other group gets its template, and not one copy or deck changes.
 * It writes nothing. */
import assert from "node:assert/strict";
import {readFileSync, writeFileSync, mkdtempSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {dryRun} from "../tools/migrate-dry-run.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "data", "live-state.json");
let checks = 0;
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const hash = () => createHash("sha256").update(readFileSync(FILE)).digest("hex");

const V25 = gunzipSync(readFileSync(path.join(ROOT, "tests", "fixtures", "live-state-v25.json.gz"))).toString("utf8");
const raw = JSON.parse(V25), before = hash();
const r = dryRun(raw);
eq([r.from, r.to], [3, 4], "Rob's library is schema 3 and opens as schema 4");
eq(r.counts, {"groups removed": 1, "groups → Bench": 1, "groups → To sell / trade": 1, "groups → General": 1, "groups → Commander deck": 7}, "the empty Main Deck goes; the Bench, To Trade, To Buy and the seven decks' groups get their templates");
eq(r.changes.filter((c) => /^copy|^deck|^copies/.test(c)), [], "not one copy or deck changes");
eq(r.kept, {copies: raw.payload.state.lots.length, decks: raw.payload.state.decks.length, groups: raw.payload.state.groups.length - 1}, "every copy and deck is kept");
eq(dryRun({payload: {state: {schemaVersion: 4}}}).note, "Already the current schema; nothing to migrate.", "a library already on the current schema has nothing to migrate");
eq(dryRun(JSON.parse(readFileSync(FILE, "utf8"))).note, "Already the current schema; nothing to migrate.", "and the rebuilt data/live-state.json is one: the 9.30 backup is written at schema 4");
const v25File = path.join(mkdtempSync(path.join(tmpdir(), "migrate-dry-run-")), "live-state-v25.json");
writeFileSync(v25File, V25);
const out = execFileSync(process.execPath, [path.join(ROOT, "tools", "migrate-dry-run.mjs"), v25File], {encoding: "utf8"});
eq(/schema 3 → 4[\s\S]*group removed: Main Deck[\s\S]*nothing written/.test(out), true, "the command prints the report");
eq(hash(), before, "and the library file is untouched");
console.log(`migrate-dry-run: ${checks} checks passed — Rob's library opens as schema 4 with Main Deck gone, ten templates set, and no copy or deck changed.`);
