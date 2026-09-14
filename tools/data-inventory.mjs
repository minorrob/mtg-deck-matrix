#!/usr/bin/env node
/* THE DATA INVENTORY. Every data artefact the repository carries, in one generated table:
 * what it is, how big, what writes it, what reads it (the served app, the service worker's
 * precache, the tools, the tests, the workflows), the version or timestamp it carries, and
 * a disposition -- serve, tool input, archive, review -- derived from those readers.
 *
 * E0 of docs/crankmagic-data-model-evaluation-plan.md. It is generated, not typed, so it
 * stays true: `node tools/data-inventory.mjs` rewrites docs/data-inventory.md, and
 * `--check` fails when the committed table has drifted from what the repository now says
 * (tests/generators.mjs runs the check). Nothing here reads the network or git history:
 * "last regenerated" is the stamp the file itself carries, or a dash -- a file with no
 * stamp is a finding, not something to paper over with a commit date.
 *
 * Judgement lives in one place, OVERRIDES: a disposition the rules would not reach on their
 * own, each with its reason printed in the Notes column, so a reviewer sees the argument.
 */
import {readFileSync, writeFileSync, readdirSync, statSync, existsSync} from "node:fs";
import {execFileSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "data-inventory.md");
const CHECK = process.argv.includes("--check");
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

/* ------------------------------------------------------------ the artefacts */
const tracked = execFileSync("git", ["ls-files", "data", "sim"], {cwd: ROOT, encoding: "utf8"})
  .split("\n").filter(Boolean)
  .filter((p) => !/\.gitkeep$|README\.md$/.test(p));

/* ------------------------------------------------------------ the readers */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { if (!/node_modules|\.cache/.test(name)) walk(full, out); }
    else if (/\.(mjs|js|py|yml|yaml|html)$/.test(name)) out.push(full);
  }
  return out;
}
const pages = ["index.html", "crankmagic.html", "graph.html"].filter((p) => existsSync(path.join(ROOT, p)));
/* The served modules are the scripts the pages load, plus the worker and the asset map the
   pages reach through the worker's registration -- not every .js in the tree. */
const served = new Set(["crankmagic-sw.js", "crankmagic-assets.js"]);
for (const page of pages) for (const m of readFileSync(path.join(ROOT, page), "utf8").matchAll(/<script[^>]+src="([^"?]+)/g)) served.add(m[1]);
const readers = [
  ...[...served].filter((f) => existsSync(path.join(ROOT, f))).map((f) => ({file: f, group: f === "crankmagic-sw.js" ? "sw" : "app"})),
  ...walk(path.join(ROOT, "tools")).map((f) => ({file: rel(f), group: "tools"})),
  ...walk(path.join(ROOT, "tests")).map((f) => ({file: rel(f), group: "tests"})),
  ...walk(path.join(ROOT, ".github")).map((f) => ({file: rel(f), group: "workflows"})),
].filter((r) => r.file !== "tools/data-inventory.mjs").map((r) => ({...r, text: readFileSync(path.join(ROOT, r.file), "utf8")}));
/* The worker's RUNTIME list is cached on demand (the graph files, fetched on the first
   Discover visit), not at install: such a file is served but not precached. */
const swText = (readers.find((r) => r.group === "sw") || {text: ""}).text;
const runtimeMatch = swText.match(/const RUNTIME = \[([^\]]*)\]/);
const runtimeCached = new Set();
if (runtimeMatch) for (const m of runtimeMatch[1].matchAll(/'([^'?]+)(?:\?[^']*)?'/g)) runtimeCached.add(m[1]);
const WRITES = /writeFileSync|writeFile\(|\.write\(|json\.dump|to_json|open\([^)]*["']w["']|\bOUT(?:PUT)?\b|\bout(?:put)?(?:Path|File)?\s*=/;
/* A producer names the file within three lines of a write: a tool that reads it and writes
   something else is a reader, not its producer. */
function writesTo(text, p) {
  const lines = text.split("\n"), b = path.basename(p);
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(p) || (byBase.get(b) === 1 && lines[i].includes(b))) {
    if (WRITES.test(lines.slice(Math.max(0, i - 1), i + 4).join("\n"))) return true;
  }
  return false;
}

/* A reference is the full repo path, or the bare filename when no other artefact shares it. */
const byBase = new Map();
for (const p of tracked) { const b = path.basename(p); byBase.set(b, (byBase.get(b) || 0) + 1); }
function mentions(text, p) {
  if (text.includes(p)) return true;
  const b = path.basename(p);
  return byBase.get(b) === 1 && text.includes(b);
}

/* ------------------------------------------------------------ the stamps */
const STAMPS = ["generatedAt", "savedAt", "amplifiersAt", "measuredAt", "importedAt", "exportedAt", "builtAt", "createdAt", "updatedAt"];
const VERSIONS = ["schemaVersion", "exportSchema", "format", "version", "schema", "engine", "generation"];
function describe(p) {
  const full = path.join(ROOT, p), size = statSync(full).size, ext = path.extname(p).slice(1);
  const out = {path: p, size, ext, shape: "", versions: [], stamp: "", note: ""};
  if (ext !== "json") { out.shape = ext === "xlsx" ? "workbook" : ext === "docx" ? "document" : ext; return out; }
  let data; try { data = JSON.parse(readFileSync(full, "utf8")); } catch (e) { out.shape = "unreadable JSON"; out.note = e.message.slice(0, 60); return out; }
  if (Array.isArray(data)) out.shape = `array · ${data.length.toLocaleString()}`;
  else if (data && typeof data === "object") {
    const keys = Object.keys(data);
    const big = keys.map((k) => [k, Array.isArray(data[k]) ? data[k].length : data[k] && typeof data[k] === "object" ? Object.keys(data[k]).length : 0]).filter(([, n]) => n >= 10).sort((a, b) => b[1] - a[1]).slice(0, 2);
    out.shape = `{${keys.slice(0, 6).join(", ")}${keys.length > 6 ? ", …" : ""}}${big.length ? " · " + big.map(([k, n]) => `${k} ${n.toLocaleString()}`).join(", ") : ""}`;
    for (const k of VERSIONS) if (data[k] !== undefined && typeof data[k] !== "object") out.versions.push(`${k} ${data[k]}`);
    for (const k of STAMPS) if (typeof data[k] === "string" && /^\d{4}-\d{2}-\d{2}/.test(data[k])) { out.stamp = data[k].slice(0, 10); break; }
    /* backups and payloads carry their state one level down */
    const inner = data.payload && (data.payload.state || data.payload);
    if (!out.versions.length && inner && typeof inner === "object") for (const k of VERSIONS) if (inner[k] !== undefined && typeof inner[k] !== "object") out.versions.push(`payload.${k} ${inner[k]}`);
  } else out.shape = typeof data;
  return out;
}

/* Producers the proximity scan cannot see: tools that write through a --write flag and a
   variable path, and files kept by hand. Declared here so the table says so, marked
   "(declared)"; a declared producer that no longer exists fails the check. */
const DECLARED = {
  "data/deck-guides.json": ["tools/generate-guides.mjs", "tools/build_guide_shapes.py"],
  "data/deck-ratings.json": ["tools/sim/rate-decks.mjs"],
  "data/simulation-summary.json": ["tools/sim/rate-decks.mjs", "tools/import_summary_metrics.py"],
  "data/live-state.json": ["tools/build-live-state.mjs", ".github/workflows/live-load.yml"],
  "data/lenses.json": ["(sim-lenses.js in a past sweep; no tool writes it today)"],
  "sim/status.json": ["tools/sim/lib.mjs"],
  "sim/config.json": ["(hand-maintained placeholder)"],
  "sim/opponents.json": ["(hand-maintained placeholder)"],
  "data/commander-glossary.json": ["(hand-maintained; tools/check-glossary.mjs checks it)"],
  "data/archive/deck-guides.json": ["(frozen copy)"], "data/archive/deck-swaps.json": ["(frozen copy)"], "data/archive/variants.json": ["(frozen copy)"],
  "data/base-rebuild.json": ["(the retired ladder's builder; not in tools/ any more)"],
};
for (const [file, list] of Object.entries(DECLARED)) for (const t of list) if (!t.startsWith("(") && !existsSync(path.join(ROOT, t))) { console.error(`data-inventory: ${file} declares producer ${t}, which is not in the tree`); process.exit(1); }

/* ------------------------------------------------------------ judgement */
const OVERRIDES = {
  "data/active-state.json": ["archive", "the retired viewer's state; read by tools and tests only, never fetched by a page since the legacy pages were retired"],
  "data/buy-plans.json": ["archive", "8 MB of the retired ladder's buy plans; slot-model.js (not served) is its only module reader"],
  "data/my-load.json": ["archive", "an early Load Live shape superseded by live-load.json"],
  "data/base-rebuild.json": ["archive", "the base-rung rebuild the ladder work produced; nothing served reads it"],
  "data/pull-list.json": ["archive", "the pull sheet before it became a page; superseded by the Ready to add route"],
  "data/game-history.json": ["tool input", "the compiled game logs the compile-game-logs workflow writes; the app reads games from the library state"],
  "data/lenses.json": ["tool input", "sim-lenses.js reads it in Node; the pages do not load that module"],
  "data/live-state.json": ["serve", "fetched by Load Live (User Functions), not precached: it is a backup, replaced whole"],
  "sim/status.json": ["serve", "the sweep's status placeholder the Lab reads; the run rewrites it"],
  "data/commander-glossary.json": ["serve", "hand-maintained editorial file: no generator by design; tools/check-glossary.mjs is its check"],
  "data/deck-swaps.json": ["review", "152 bytes: an emptied stub since the swaps moved to data/archive, still precached by the worker; drop it from the asset map and the worker, or fold it"],
};
function disposition(a, groups) {
  const o = OVERRIDES[a.path]; if (o) return {disposition: o[0], note: o[1]};
  if (groups.has("app") || groups.has("sw")) return {disposition: "serve", note: ""};
  if (a.path.startsWith("data/source/")) return {disposition: "source", note: "workbook or document the builders read; never fetched by a page"};
  if (a.path.startsWith("data/archive/")) return {disposition: "archive", note: "already under data/archive; tools and tests read it there"};
  if (groups.has("tools") || groups.has("tests") || groups.has("workflows")) return {disposition: "tool input", note: ""};
  return {disposition: "review", note: "no reader found: candidate for deletion"};
}

/* ------------------------------------------------------------ the table */
const rows = tracked.map((p) => {
  const a = describe(p);
  const who = readers.filter((r) => mentions(r.text, p));
  const groups = new Set(who.map((r) => r.group));
  const found = who.filter((r) => (r.group === "tools" || r.group === "workflows") && writesTo(r.text, p)).map((r) => r.file);
  const producers = [...found, ...(DECLARED[p] || []).filter((t) => !found.includes(t)).map((t) => t.startsWith("(") ? t : t + " (declared)")];
  const tests = who.filter((r) => r.group === "tests").map((r) => path.basename(r.file));
  const precached = who.some((r) => r.group === "sw") && !runtimeCached.has(p);
  const onDemand = runtimeCached.has(p);
  const app = who.filter((r) => r.group === "app").map((r) => r.file);
  const tools = who.filter((r) => r.group === "tools").map((r) => path.basename(r.file));
  const flows = who.filter((r) => r.group === "workflows").map((r) => path.basename(r.file));
  const d = disposition(a, groups);
  return {...a, app, precached, onDemand, tools, tests, flows, producers, ...d};
});
const kb = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : n >= 1024 ? Math.round(n / 1024) + " KB" : n + " B";
const list = (xs, max = 4) => xs.length ? xs.slice(0, max).join(", ") + (xs.length > max ? ` +${xs.length - max}` : "") : "—";
const esc = (s) => String(s).replace(/\|/g, "\\|");
const total = rows.reduce((n, r) => n + r.size, 0), servedBytes = rows.filter((r) => r.disposition === "serve").reduce((n, r) => n + r.size, 0), precachedBytes = rows.filter((r) => r.precached).reduce((n, r) => n + r.size, 0), onDemandBytes = rows.filter((r) => r.onDemand).reduce((n, r) => n + r.size, 0);
const counts = {}; for (const r of rows) counts[r.disposition] = (counts[r.disposition] || 0) + 1;
const unstamped = rows.filter((r) => r.ext === "json" && !r.stamp).map((r) => r.path);
const unversioned = rows.filter((r) => r.ext === "json" && !r.versions.length).map((r) => r.path);
const noProducer = rows.filter((r) => r.ext === "json" && !r.producers.length && r.disposition !== "archive").map((r) => r.path);

const md = `# The data inventory

<!-- Generated by tools/data-inventory.mjs. Do not edit by hand: run the tool, or \`--check\` to see the drift. -->

Every data artefact the repository tracks under \`data/\` and \`sim/\`, with what writes it, what
reads it and what it carries. E0 of the [data-model evaluation](crankmagic-data-model-evaluation-plan.md).
The served app is the scripts the pages load plus the service worker and the asset map;
**precached** means the worker's data list carries it at install, **on demand** that its runtime list
does (fetched on the first Discover visit, then kept); **producer** is a tool or workflow that
names the file and writes; **tests** are the suites that read it.

## Summary

| | |
|---|---|
| Artefacts | ${rows.length} (${rows.filter((r) => r.ext === "json").length} JSON, ${rows.filter((r) => r.ext !== "json").length} workbooks and documents) · ${kb(total)} |
| Served to the app | ${counts.serve || 0} · ${kb(servedBytes)} (${kb(precachedBytes)} precached by the worker, ${kb(onDemandBytes)} cached on demand) |
| Tool inputs | ${counts["tool input"] || 0} |
| Source workbooks and documents | ${counts.source || 0} |
| Archive (already, or should be) | ${counts.archive || 0} |
| Review: no reader found | ${counts.review || 0} |
| JSON with no version field | ${unversioned.length}${unversioned.length ? ": " + unversioned.map((p) => `\`${p}\``).join(", ") : ""} |
| JSON with no timestamp | ${unstamped.length}${unstamped.length ? ": " + unstamped.map((p) => `\`${p}\``).join(", ") : ""} |
| Served or tool-input JSON with no producer found | ${noProducer.length}${noProducer.length ? ": " + noProducer.map((p) => `\`${p}\``).join(", ") : ""} |

## The table

| File | Size | Shape | Version fields | Stamp | Producer | App readers | Precached | Tools | Tests | Workflows | Disposition | Notes |
|---|---:|---|---|---|---|---|:-:|---|---|---|---|---|
${rows.map((r) => `| \`${r.path}\` | ${kb(r.size)} | ${esc(r.shape)} | ${esc(list(r.versions, 3))} | ${r.stamp || "—"} | ${esc(list(r.producers, 3))} | ${esc(list(r.app, 3))} | ${r.precached ? "yes" : r.onDemand ? "on demand" : ""} | ${esc(list(r.tools, 3))} | ${esc(list(r.tests, 3))} | ${esc(list(r.flows, 2))} | **${r.disposition}** | ${esc(r.note)} |`).join("\n")}

## How to read the dispositions

- **serve** — a page, a served module or the service worker fetches it. Its version field and its
  \`?v=\` bump (\`tests/asset-versions.mjs\`) are what keep a cached browser current.
- **tool input** — nothing served reads it; a tool, a test or a workflow does. It stays, and says so
  in its own README or the tool's header.
- **source** — a workbook or document a builder reads. Never fetched.
- **archive** — either already under \`data/archive/\`, or a file the rules would call a tool input
  whose only readers are the retired viewer's modules and the tests that still pin them; the
  Notes column carries the argument. Moving one means repointing those readers in the same PR.
- **review** — no reader found by this scan. A candidate for deletion; confirm by hand before acting.

Regenerate with \`node tools/data-inventory.mjs\`; \`--check\` exits non-zero when this file has drifted.
`;

if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== md) {
    const a = current.split("\n"), b = md.split("\n");
    const first = a.findIndex((line, i) => line !== b[i]);
    console.error(`docs/data-inventory.md has drifted from the repository (first difference at line ${first + 1}):\n  committed: ${(a[first] || "").slice(0, 160)}\n  now:       ${(b[first] || "").slice(0, 160)}\nRun node tools/data-inventory.mjs and commit the result.`);
    process.exit(1);
  }
  console.log(`data-inventory: docs/data-inventory.md matches the repository (${rows.length} artefacts).`);
} else {
  writeFileSync(OUT, md);
  console.log(`data-inventory: wrote docs/data-inventory.md — ${rows.length} artefacts, ${kb(total)}; serve ${counts.serve || 0}, tool input ${counts["tool input"] || 0}, source ${counts.source || 0}, archive ${counts.archive || 0}, review ${counts.review || 0}.`);
  if (unversioned.length) console.log(`  no version field: ${unversioned.join(", ")}`);
  if (unstamped.length) console.log(`  no timestamp: ${unstamped.join(", ")}`);
  if (noProducer.length) console.log(`  no producer found: ${noProducer.join(", ")}`);
}
