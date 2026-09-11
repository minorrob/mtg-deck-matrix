/* A COMMITTED NUMBER WHOSE GENERATOR CANNOT RUN IS A NUMBER NOBODY CAN REPRODUCE.
 *
 * tools/sim/rate-decks.mjs read data/master-v2.json for months after the workbook moved
 * to data/archive/. Every suite passed the whole time, because every suite checked the
 * FILE the generator had once written and nothing checked the generator. The number
 * under each of the six decks was still there; the thing that produced it was not.
 *
 * So this suite checks the generators themselves, two ways.
 *
 * 1. STATICALLY, every repo-shaped path a tool names has to resolve. A tool that reads
 *    data/rung-lists.json when the file lives at data/archive/rung-lists.json fails here
 *    on the commit that moves it, not months later when someone tries to re-run it.
 *    Writing this check found three more instances of exactly that: remeasure-all.mjs
 *    (both rung-lists and variants), build_card_facts.py and build_guide_shapes.py.
 *
 * 2. BY RUNNING the tools that offer a check mode. Those four read their real inputs
 *    and compare against their real committed outputs, so they fail on a missing input,
 *    a changed schema, or an output that has drifted from what its generator would emit.
 *
 * What this does NOT do is run the generators that write. Most of them fetch from
 * Scryfall or spend minutes in the simulator, which belongs in a deliberate regeneration
 * rather than in a suite meant to finish in seconds.
 */
import assert from "node:assert/strict";
import {readdirSync, statSync, readFileSync, existsSync} from "node:fs";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (condition, message) => {assert.ok(condition, message); checks++;};

/* ---------------------------------------------------------------- 1. paths */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(mjs|js|py)$/.test(name)) out.push(full);
  }
  return out;
}

// A path literal, and the path.join(SOMETHING, "a", "b.json") spelling the sim tools use.
const LITERAL = /["']([^"'\n]*\.(?:json|csv|xlsx|md|txt|js|mjs|html|docx|png))["']/g;
const JOINED = /path\.join\(\s*(?:[A-Za-z_$][\w$]*|__dirname)\s*,\s*((?:"[^"]+"|'[^']+')(?:\s*,\s*(?:"[^"]+"|'[^']+'))*)\s*\)/g;
// Only paths that name a directory this repo actually has. Everything else in a tool is
// prose inside a console.log, a bare filename in a message, or a URL.
const REPO_SHAPED = /^(?:data|sim|tests|docs|design|assets|tools|\.\.)\/[\w./-]+$/;

/* A tool may legitimately name a path that must NOT exist. Each one is listed with its
   reason rather than pattern-matched away, so a new absence has to be argued for. */
const DELIBERATELY_ABSENT = new Map([
  ["tools/check-glossary.mjs -> data/glossary-editorial.json",
   "the checker asserts there is no second definition source beside data/commander-glossary.json"],
  ["tools/check-glossary.mjs -> data/sources/commander-glossary-workbook.json",
   "same assertion: the editorial workbook must not come back as a rival source of truth"],
]);

const tools = walk(path.join(ROOT, "tools"));
ok(tools.length > 40, `expected the tools directory to hold the generators, found ${tools.length} files`);

const unresolved = [];
let literals = 0;
for (const file of tools) {
  const source = readFileSync(file, "utf8");
  const named = new Set();
  for (const m of source.matchAll(LITERAL)) named.add(m[1]);
  for (const m of source.matchAll(JOINED)) {
    named.add(m[1].split(",").map((s) => s.trim().slice(1, -1)).join("/"));
  }
  for (const rel of named) {
    if (!REPO_SHAPED.test(rel)) continue;
    literals++;
    const label = `${path.relative(ROOT, file)} -> ${rel}`;
    if (DELIBERATELY_ABSENT.has(label)) continue;
    const tries = [
      path.resolve(path.dirname(file), rel),
      path.resolve(ROOT, rel),
      path.resolve(ROOT, "sim", rel),
    ];
    if (!tries.some(existsSync)) unresolved.push(label);
  }
}
ok(literals > 90, `expected the scan to reach the tools' real inputs, saw only ${literals} paths`);
assert.deepEqual(unresolved, [],
  "a generator names a file that is not there, so it cannot be re-run:\n  " + unresolved.join("\n  ") +
  "\n  Either the file moved and the tool needs repointing, or the tool is dead.");
checks++;

// The allowlist has to stay honest: an entry that now resolves is stale and should go.
for (const [label, why] of DELIBERATELY_ABSENT) {
  const [file, rel] = label.split(" -> ");
  ok(!existsSync(path.resolve(ROOT, rel)),
    `${file} is allowed to name ${rel} because ${why} -- but the file now exists, so drop the allowlist entry`);
}

/* ------------------------------------------------------------- 2. run them */

/* Every tool here reads committed inputs, touches no network and writes nothing. Each
   compares a committed output against what its generator would produce now. */
const CHECKABLE = [
  ["tools/check-glossary.mjs", []],
  ["tools/compile-game-logs.mjs", ["--check"]],
  ["tools/flavor-names.mjs", ["--check"]],
  ["tools/graph-amplifiers.mjs", ["--check"]],
  ["tools/build-live-state.mjs", ["--check"]],
];

for (const [tool, args] of CHECKABLE) {
  ok(existsSync(path.join(ROOT, tool)), `${tool} is listed as checkable but is not in the tree`);
  let failure = null;
  try {
    execFileSync(process.execPath, [path.join(ROOT, tool), ...args],
      {cwd: ROOT, stdio: "pipe", timeout: 180000, env: {...process.env, NO_COLOR: "1"}});
  } catch (error) {
    failure = [error.stdout, error.stderr].map((b) => String(b || "")).join("").trim().slice(0, 1200) ||
      error.message;
  }
  ok(failure === null,
    `${tool} ${args.join(" ")} does not pass its own check, so the file it generates no longer matches it:\n${failure}`);
}

/* ------------------------------------------- 3. the generation is never typed */

/* A NUMBER FILED UNDER A GENERATION THAT DID NOT PRODUCE IT is the one dishonesty the
   whole measurement discipline exists to prevent, and it happened twice in one afternoon
   because three separate files each carried the generation as a string literal:
   remeasure-all.mjs said "v2.6", rate-decks.mjs said "v2.7", and the engine said "v2.8".
   All three now read it from crankmagic-sim.js. This holds them there, and holds the two
   committed data files to the same answer. */
{
  const Sim = createRequire(import.meta.url)(path.join(ROOT, "crankmagic-sim.js"));
  const generation = Sim.ENGINE_GENERATION;
  ok(/^v\d+\.\d+$/.test(generation), `the engine generation reads "${generation}", which is not a generation`);

  for (const tool of ["tools/sim/remeasure-all.mjs", "tools/sim/rate-decks.mjs"]) {
    // Comments may name a generation -- explaining why the literal went is the point.
    const source = readFileSync(path.join(ROOT, tool), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const typed = [...source.matchAll(/["'](v\d+\.\d+)["']/g)].map((m) => m[1])
      .filter((v) => !/v2\.4-uniform/.test(v));
    assert.deepEqual(typed, [],
      `${tool} still writes a generation as a literal (${typed.join(", ")}). Read it from ` +
      "crankmagic-sim.js instead, or the day the engine moves this tool files its numbers under the old one.");
    checks++;
  }

  const ratings = JSON.parse(readFileSync(path.join(ROOT, "data/deck-ratings.json"), "utf8"));
  ok(ratings.generation === generation,
    `data/deck-ratings.json says ${ratings.generation} and the engine says ${generation}`);

  const summary = JSON.parse(readFileSync(path.join(ROOT, "data/simulation-summary.json"), "utf8"));
  ok(summary.engine === generation,
    `data/simulation-summary.json says ${summary.engine} and the engine says ${generation}; re-sweep it or say why in engineBoundaryNote`);

  /* And every generation the summary names has to have a paragraph saying what it changed.
     The note used to be inline in the sweep tool, keyed on whatever generation was current,
     so a bump silently filed the PREVIOUS generation's description under the new name. */
  const {GENERATION_NOTES, boundaryNote} = await import(new URL("../tools/sim/generation-notes.mjs", import.meta.url));
  ok(GENERATION_NOTES[generation], `tools/sim/generation-notes.mjs has no note for ${generation}`);
  ok(summary.engineNotes[generation] === GENERATION_NOTES[generation],
    `the summary's note for ${generation} is not the one generation-notes.mjs holds`);
  ok(summary.engineBoundaryNote === boundaryNote(generation),
    "the summary's boundary note does not match the one the sweep tool would write, so it is describing a different sweep");
}

/* A check mode nobody runs is no better than no check mode, so every tool that accepts
   --check has to be in the list above. Adding one to tools/ adds it to this suite. */
const listed = new Set(CHECKABLE.map(([tool]) => tool));
const offersCheck = tools
  .filter((f) => /"--check"|'--check'/.test(readFileSync(f, "utf8")))
  .map((f) => path.relative(ROOT, f));
assert.deepEqual(offersCheck.filter((f) => !listed.has(f)), [],
  "these tools accept --check and nothing runs it; add them to CHECKABLE");
checks++;

console.log(`generators: ${checks} checks passed — ${literals} declared paths across ${tools.length} tools all resolve, and ${CHECKABLE.length} generators pass their own check.`);
