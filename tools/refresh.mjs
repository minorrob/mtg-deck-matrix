#!/usr/bin/env node
/* THE DATA REFRESH, IN ORDER, WITH ITS PROOF.
 *
 * docs/crankmagic-refresh.md is the specification: Magic prints cards every few weeks, prices
 * move daily, EDHREC's play rates move weekly, and every one of those lives in a committed
 * data file so the app works on a phone with no signal. This is the runner the Claude skill
 * (.claude/skills/crankmagic-refresh) drives: the generators the registry already names,
 * in the order they have to run, then the bumps a changed file needs so a browser fetches it,
 * then the acceptance criteria the specification lists -- each one a check that already
 * exists. It invents nothing: every step is a tool in tools/ that a person can run by hand.
 *
 *   node tools/refresh.mjs --plan              print the steps and run nothing
 *   node tools/refresh.mjs --check             every producer's --check plus the proof, no writes
 *   node tools/refresh.mjs                     run the refresh, bump the versions, prove it
 *   node tools/refresh.mjs --only ranks,manifest    a subset, in the plan's order
 *   node tools/refresh.mjs --skip graph        leave the long step out (the corpus rebuild)
 *   node tools/refresh.mjs --no-tests          skip runtests.sh at the end (the rest still runs)
 *
 * WHAT IT NEVER TOUCHES: data/live-load.json and data/live-state.json (the reader's library;
 * the Load Live workflow owns them), data/deck-ratings.json and sim/ (measured results; only
 * a re-run of the sweep may write a score), data/deck-guides.json (hand-written), and the
 * library in the browser. The guard at the end refuses a run that changed anything else.
 *
 * WHAT A SHRINK MEANS: the universe and the graph grow by a set's worth and never shrink. A
 * smaller count after a run means a query changed meaning, and the run is reported as a
 * failure rather than committed. Exit 0 only when every proof passed. */
import {execFileSync, spawnSync} from "node:child_process";
import {readFileSync, writeFileSync, readdirSync, existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const listArg = (f) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1].split(",").map((s) => s.trim()).filter(Boolean) : []; };

/* The plan: the specification's order, each step naming its writer, what it writes, and the
   --check that vouches for it. `long` marks the one that refetches rules text for the corpus. */
export const STEPS = [
  {id: "universe", why: "every Commander-legal card, by name; a set's worth of growth, never a shrink", run: ["node", "tools/commander-universe.mjs"], check: ["node", "tools/commander-universe.mjs", "--check"], writes: ["data/commander-universe.json"], count: {file: "data/commander-universe.json", mustNotShrink: true}},
  {id: "flavor", why: "the names printed on cards that are not the names the rules use; checked against the universe", run: ["node", "tools/flavor-names.mjs"], check: ["node", "tools/flavor-names.mjs", "--check"], writes: ["data/flavor-names.json"], count: {file: "data/flavor-names.json", mustNotShrink: true}},
  {id: "graph", why: "re-classify the corpus with the current card-classify.js vocabulary (rules text cached under graph/.cache)", run: ["node", "tools/graph-amplifiers.mjs", "--all"], check: ["node", "tools/graph-amplifiers.mjs", "--check"], writes: ["data/graph.json", "data/graph-played.json"], count: {file: "data/graph.json", mustNotShrink: true}, long: true},
  {id: "ranks", why: "EDHREC commander popularity, which orders every picker; joined onto cards by name, so after the graph", run: ["node", "tools/commander-ranks.mjs"], check: ["node", "tools/commander-ranks.mjs", "--check"], writes: ["data/commander-ranks.json"], count: {file: "data/commander-ranks.json"}},
  {id: "records", why: "the Card record set re-read from Scryfall: prices, legality, text, images; a card whose lookup fails keeps every value it had", run: ["node", "tools/build-card-records.mjs", "--refresh"], check: ["node", "tools/build-card-records.mjs", "--check"], writes: ["data/cards.json", "data/card-facts.json", "data/graph.json"], count: {file: "data/cards.json", mustNotShrink: true}},
  {id: "strategies", why: "what each legal commander offers, derived from the graph's terms; after the graph and the records", run: ["node", "tools/commander-strategies.mjs"], check: ["node", "tools/commander-strategies.mjs", "--check"], writes: ["data/commander-strategies.json"], count: {file: "data/commander-strategies.json"}},
  {id: "manifest", why: "data/manifest.json and docs/data-inventory.md say what the files now are", run: ["node", "tools/data-manifest.mjs"], check: ["node", "tools/data-manifest.mjs", "--check"], writes: ["data/manifest.json"], also: [{run: ["node", "tools/data-inventory.mjs"], check: ["node", "tools/data-inventory.mjs", "--check"], writes: ["docs/data-inventory.md"]}]},
];
/* The files a refresh may change, and nothing else. */
export const ALLOWED = new Set([...STEPS.flatMap((s) => [...s.writes, ...((s.also || []).flatMap((a) => a.writes))]), "crankmagic-assets.js", "crankmagic-sw.js", "crankmagic-app.js", "index.html", "crankmagic.html", "tests/fixtures/asset-versions.json"]);
export const NEVER = ["data/live-load.json", "data/live-state.json", "data/deck-ratings.json", "data/simulation-summary.json", "data/deck-guides.json", "sim/"];

const read = (f) => readFileSync(path.join(ROOT, f), "utf8");
const envelopeCount = (f) => { try { const d = JSON.parse(read(f)); return Number.isFinite(d.count) ? d.count : null; } catch (e) { return null; } };
const gitOut = (...a) => execFileSync("git", a, {cwd: ROOT, encoding: "utf8"});
const git = (...a) => gitOut(...a).trim();
/* THE PATHS IN `git status --porcelain`, AND WHY THIS IS NOT INLINE. Each line is two status
   columns then a space, so the path starts at 3. Trimming the whole block first eats the
   leading space of the FIRST line only; slice(3) then cuts a character off that one path and
   it silently stops looking like data/..., so the alphabetically first changed file gets no
   ?v= bump and every browser holding it keeps the old copy. Pure, and exported, so a test
   can hold the shape of real porcelain output against it. */
export function statusPaths(out) { return out.split("\n").filter(Boolean).map((l) => l.slice(3)); }
const sh = (cmd, {quiet = false} = {}) => {
  const r = spawnSync(cmd[0], cmd.slice(1), {cwd: ROOT, encoding: "utf8", stdio: quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"], maxBuffer: 64 * 1024 * 1024});
  return {ok: r.status === 0, out: (r.stdout || "") + (r.stderr || ""), status: r.status};
};

/* THE VERSION CASCADE (docs/crankmagic-refresh.md "Bumping versions"): a changed data file gets
   a new ?v= wherever the asset map and the worker name it; that changes crankmagic-assets.js
   and crankmagic-sw.js, so their own ?v= move in the pages and the worker, and the worker's
   registration line in crankmagic-app.js moves, which moves crankmagic-app.js too. Then the
   manifest test records the new hashes. Nothing is bumped for a file that did not change. */
export function bumpText(text, url) {
  const re = new RegExp(`(${url.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\?v=)(\\d+)`, "g");
  let n = 0; const out = text.replace(re, (m, a, v) => { n++; return a + (Number(v) + 1); }); return {out, n};
}
export function bumpVersions(changedData, {write = true} = {}) {
  const edits = new Map(); const get = (f) => edits.get(f) ?? read(f); const set = (f, t) => edits.set(f, t);
  const bumpIn = (files, url) => { let total = 0; for (const f of files) { const {out, n} = bumpText(get(f), url); if (n) { set(f, out); total += n; } } return total; };
  const report = [];
  for (const d of changedData) { const n = bumpIn(["crankmagic-assets.js", "crankmagic-sw.js"], d); report.push(`${d}: ${n} reference${n === 1 ? "" : "s"} bumped`); }
  if (changedData.length) {
    bumpIn(["index.html", "crankmagic.html", "crankmagic-sw.js"], "crankmagic-assets.js");
    bumpIn(["crankmagic-app.js"], "crankmagic-sw.js");
    bumpIn(["index.html", "crankmagic.html", "crankmagic-sw.js"], "crankmagic-app.js");
    report.push("cascade: crankmagic-assets.js, crankmagic-sw.js (registration) and crankmagic-app.js bumped in the pages");
  }
  if (write) for (const [f, t] of edits) writeFileSync(path.join(ROOT, f), t);
  return {edited: [...edits.keys()], report};
}

function readmeSuiteCount() { const m = /There are (\d+) Node suites/.exec(read("README.md")); return m ? Number(m[1]) : null; }
function suiteFiles() { return readdirSync(path.join(ROOT, "tests")).filter((f) => f.endsWith(".mjs")).length; }

/* THE PROOF: the specification's acceptance criteria, each a check that already exists. */
function prove({steps, runTests}) {
  const rows = [];
  const add = (name, ok, detail = "") => rows.push({name, ok, detail});
  for (const s of steps) {
    const r = sh(s.check, {quiet: true}); add(`${s.id}: ${s.check.slice(1).join(" ")}`, r.ok, r.ok ? "" : r.out.trim().split("\n").slice(-3).join(" | "));
    for (const a of s.also || []) { const q = sh(a.check, {quiet: true}); add(`${s.id}: ${a.check.slice(1).join(" ")}`, q.ok, q.ok ? "" : q.out.trim().split("\n").slice(-3).join(" | ")); }
  }
  const av = sh(["node", "tests/asset-versions.mjs"], {quiet: true}); add("every asset has one version and every changed file a new one (tests/asset-versions.mjs)", av.ok, av.ok ? "" : av.out.trim().split("\n").slice(-3).join(" | "));
  const readme = readmeSuiteCount(), files = suiteFiles(); add(`the README's suite count matches the directory (${readme} named, ${files} present)`, readme === files);
  if (runTests) { const t = sh(["bash", "runtests.sh", "-q"], {quiet: true}); const line = (t.out.match(/\d+ suites passed\./) || [])[0] || t.out.trim().split("\n").slice(-4).join(" | "); add(`every suite passes (bash runtests.sh -q): ${line}`, t.ok, t.ok ? "" : line); }
  return rows;
}

function main() {
  const only = new Set(listArg("--only")), skip = new Set(listArg("--skip"));
  const steps = STEPS.filter((s) => (!only.size || only.has(s.id)) && !skip.has(s.id));
  const unknown = [...only, ...skip].filter((id) => !STEPS.some((s) => s.id === id));
  if (unknown.length) { console.error(`Unknown step${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. Steps: ${STEPS.map((s) => s.id).join(", ")}.`); process.exit(2); }
  if (flag("--plan")) {
    console.log("The refresh, in order (docs/crankmagic-refresh.md):");
    steps.forEach((s, i) => { console.log(`${i + 1}. ${s.id}${s.long ? " (long)" : ""} — ${s.why}\n     ${s.run.join(" ")}  →  ${s.writes.join(", ")}\n     proof: ${s.check.join(" ")}`); for (const a of s.also || []) console.log(`     ${a.run.join(" ")}  →  ${a.writes.join(", ")}  ·  proof: ${a.check.join(" ")}`); });
    console.log(`${steps.length + 1}. versions — a changed data file gets a new ?v= in crankmagic-assets.js and crankmagic-sw.js, the cascade moves the pages, tests/asset-versions.mjs --update records the hashes`);
    console.log(`${steps.length + 2}. proof — every producer's --check, tests/asset-versions.mjs, the README's suite count, bash runtests.sh -q`);
    console.log(`Never touched: ${NEVER.join(", ")}.`);
    return 0;
  }
  const dirtyBefore = statusPaths(gitOut("status", "--porcelain"));
  if (!flag("--check") && dirtyBefore.length) { console.error(`The working tree is not clean (${dirtyBefore.length} change${dirtyBefore.length === 1 ? "" : "s"}); commit or stash first so the refresh is one reviewable diff.`); process.exit(2); }
  const before = Object.fromEntries(steps.filter((s) => s.count).map((s) => [s.id, envelopeCount(s.count.file)]));
  if (!flag("--check")) {
    for (const s of steps) {
      console.log(`\n== ${s.id}: ${s.run.join(" ")}`);
      const r = sh(s.run); if (!r.ok) { console.error(`\n${s.id} failed (exit ${r.status}). Nothing after it ran. The files it wrote, if any, are in the working tree for you to inspect or discard with git checkout.`); process.exit(1); }
      for (const a of s.also || []) { console.log(`== ${s.id}: ${a.run.join(" ")}`); const q = sh(a.run); if (!q.ok) { console.error(`\n${s.id} failed on ${a.run.join(" ")} (exit ${q.status}).`); process.exit(1); } }
      if (s.count) { const now = envelopeCount(s.count.file), was = before[s.id]; if (s.count.mustNotShrink && was != null && now != null && now < was) { console.error(`\n${s.id}: ${s.count.file} shrank from ${was} to ${now}. A shrink means the query changed meaning; discard this run (git checkout -- ${s.count.file}) and look at the tool before running again.`); process.exit(1); } console.log(`   ${s.count.file}: ${was ?? "?"} → ${now ?? "?"}`); }
    }
    const changedData = statusPaths(gitOut("status", "--porcelain")).filter((f) => f.startsWith("data/") && f.endsWith(".json") && (read("crankmagic-assets.js").includes(f + "?v=") || read("crankmagic-sw.js").includes(f + "?v=")));
    console.log(`\n== versions: ${changedData.length ? changedData.join(", ") : "no served data file changed, nothing to bump"}`);
    const b = bumpVersions(changedData); for (const line of b.report) console.log("   " + line);
    if (changedData.length) { const u = sh(["node", "tests/asset-versions.mjs", "--update"], {quiet: true}); if (!u.ok) { console.error(u.out); process.exit(1); } console.log("   tests/asset-versions.mjs --update recorded the hashes"); }
    const touched = statusPaths(gitOut("status", "--porcelain"));
    const outside = touched.filter((f) => !ALLOWED.has(f)), never = touched.filter((f) => NEVER.some((n) => f === n || f.startsWith(n)));
    if (outside.length || never.length) { console.error(`\nThe run changed files a refresh may not touch: ${[...new Set([...outside, ...never])].join(", ")}. Nothing is committed; inspect them before going on.`); process.exit(1); }
  }
  console.log("\n== proof");
  const rows = prove({steps, runTests: !flag("--no-tests")});
  for (const r of rows) console.log(`   ${r.ok ? "ok  " : "FAIL"} ${r.name}${r.detail ? " — " + r.detail : ""}`);
  const failed = rows.filter((r) => !r.ok).length;
  const counts = steps.filter((s) => s.count).map((s) => `${s.id} ${before[s.id] ?? "?"} → ${envelopeCount(s.count.file) ?? "?"}`).join(" · ");
  console.log(`\n${failed ? `${failed} check${failed === 1 ? "" : "s"} failed` : "Every check passed"}. ${counts}`);
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
