/* The refresh runner's plan, held to the registry and the specification.
 *
 * The runner is what the refresh skill drives, so the failures that matter are quiet ones:
 * a step whose tool moved, a step out of the specification's order, a data file the runner
 * would bump that the asset map does not serve, or a file the refresh must never touch that
 * a step claims to write. Nothing here fetches; the run itself is the skill's job. */
import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import path from "node:path";
import {ROOT, REGISTRY} from "../schema/index.mjs";
import {STEPS, ALLOWED, NEVER, bumpText, statusPaths} from "../tools/refresh.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };

/* Every step's tool exists and is the registry's generator for what it writes. */
for (const s of STEPS) {
  ok(existsSync(path.join(ROOT, s.run[1])), `${s.id}: ${s.run[1]} exists`);
  ok(existsSync(path.join(ROOT, s.check[1])), `${s.id}: its check exists`);
  for (const f of s.writes) {
    if (s.derived) {
      /* A derived artifact is built from the refreshed data by its own tool and is not an envelope data file, so it is not in
         the registry. Its tool must be the one that vouches for it and must name the file it writes. */
      ok(s.check[1] === s.run[1], `${s.id}: its own tool vouches for ${f}`);
      ok(readFileSync(path.join(ROOT, s.run[1]), "utf8").includes(f), `${s.id}: ${s.run[1]} names ${f}, the file it writes`);
      const registered = REGISTRY.find((r) => r.file === f);
      if (registered) ok(registered.generator === s.run[1], `${s.id}: ${f} is registered, and its registered generator is the step's tool`);
      continue;
    }
    const reg = REGISTRY.find((r) => r.file === f);
    ok(reg, `${s.id}: ${f} is registered`);
    if (reg && s.id !== "records") ok(reg.generator === s.run[1], `${s.id}: ${f}'s registered generator is ${reg.generator}, the step runs ${s.run[1]}`);
  }
  ok(!(s.derived && s.count), `${s.id}: a derived step has no count to hold`);
  for (const a of s.also || []) { ok(existsSync(path.join(ROOT, a.run[1])), `${s.id}: ${a.run[1]} exists`); }
  ok(!s.writes.some((f) => NEVER.some((n) => f === n || f.startsWith(n))), `${s.id} writes nothing a refresh must never touch`);
}
/* The records step writes the graph's card block through build-card-records.mjs, whose registered producer is the graph tool; that is the one shared file. */
ok(STEPS.find((s) => s.id === "records").writes.includes("data/graph.json"), "the records step says it touches the graph's card block");

/* The specification's order: 1 universe, 2 flavor names, 3 graph, 4 ranks; then the record set, the strategies, the precons (held to the new universe),
   then what is derived from them (the advisor's cards, the commander index, the pilots' roles, the variants' prices), then the manifest. */
eq(STEPS.map((s) => s.id), ["universe", "flavor", "graph", "ranks", "records", "strategies", "precons", "advise-cards", "commander-index", "pilot-roles", "variants", "manifest"], "the plan is the specification's order");
/* THE DERIVED FILES (the 2026-10-29 refresh's proof failed five suites until each was rebuilt by hand): each is a step, after what it reads. */
const at = (id) => STEPS.findIndex((s) => s.id === id);
for (const id of ["advise-cards", "commander-index", "pilot-roles", "variants"]) ok(STEPS.find((s) => s.id === id)?.derived, `${id} is a derived step`);
ok(at("records") < at("advise-cards") && at("records") < at("variants"), "the advisor's cards and the variants' prices follow the records (data/cards.json)");
ok(at("strategies") < at("commander-index") && at("strategies") < at("pilot-roles"), "the commander index and the pilots' roles follow the graph and the strategies");
ok(at("variants") < at("manifest"), "the manifest comes last, so it sees every file");
/* The commander index is served (the asset map and the worker's on-demand list name it), so the manifest must list it, and the manifest is made from the registry. */
ok(REGISTRY.some((r) => r.file === "data/commander-index.json" && r.generator === "tools/build-commander-index.mjs"), "the commander index is registered, so the manifest lists the file the asset map serves");
eq(STEPS.find((s) => s.id === "pilot-roles").writes, ["game/engine/pilots/roles-data.mjs"], "the pilots' roles are the one generated file the refresh writes in the engine lane's tree");
ok(STEPS.find((s) => s.id === "graph").long, "the graph step is marked long");
for (const id of ["universe", "flavor", "graph", "records"]) ok(STEPS.find((s) => s.id === id).count?.mustNotShrink, `${id} must not shrink`);

/* Every served data file a step writes is one the asset map and the worker name, so a bump has somewhere to land. */
const assets = readFileSync(path.join(ROOT, "crankmagic-assets.js"), "utf8"), worker = readFileSync(path.join(ROOT, "crankmagic-sw.js"), "utf8");
for (const f of STEPS.flatMap((s) => s.writes).filter((f) => f.startsWith("data/") && f !== "data/manifest.json" && !f.startsWith("data/archive/"))) ok(assets.includes(f + "?v=") && worker.includes(f + "?v="), `${f} is served with a ?v= in the asset map and the worker`);
/* The commander index's URL lives in the asset map, not inside crankmagic-newdeck.js: a URL the bumper cannot find is bumped for nothing (the 2026-10-29 refresh). */
const newdeck = readFileSync(path.join(ROOT, "crankmagic-newdeck.js"), "utf8");
ok(!/commander-index\.json\?v=/.test(newdeck) && newdeck.includes("CrankAssets") && newdeck.includes("commanderIndex"), "crankmagic-newdeck.js reads the commander index from the asset map");
ok(assets.includes("commanderIndex:"), "the asset map names the commander index");
ok(!assets.includes("data/manifest.json?v="), "the manifest is not served, so it is never bumped");

/* The allowed set is the steps' files plus the version cascade, and nothing the refresh must never touch. */
for (const f of ["crankmagic-assets.js", "crankmagic-sw.js", "crankmagic-app.js", "index.html", "crankmagic.html", "tests/fixtures/asset-versions.json"]) ok(ALLOWED.has(f), `${f} may change (the cascade)`);
for (const n of NEVER) ok(![...ALLOWED].some((f) => f === n || f.startsWith(n)), `${n} is never allowed`);
ok(NEVER.includes("data/live-state.json") && NEVER.includes("data/deck-ratings.json") && NEVER.includes("sim/"), "the library, the scores and the sweep are off limits");

/* The bump: exactly the named URL, every occurrence, by one. */
eq(bumpText("a data/graph.json?v=17 b data/graph.json?v=17 c data/graph-played.json?v=2", "data/graph.json"), {out: "a data/graph.json?v=18 b data/graph.json?v=18 c data/graph-played.json?v=2", n: 2}, "bumps the file named and not its neighbor");
eq(bumpText("x crankmagic-app.js?v=165 y", "crankmagic-app.js").out, "x crankmagic-app.js?v=166 y");
eq(bumpText("nothing here", "data/cards.json").n, 0);

/* THE PORCELAIN PATHS. Real `git status --porcelain` output: two status columns then a
   space, so the FIRST line begins with a space for an unstaged change. The runner used to
   .trim() the whole block before slicing at 3, which ate that one leading space and cut a
   character off the first path only -- so the alphabetically first changed file stopped
   looking like data/... and got no ?v= bump, and every browser holding it kept the old
   copy. This is the case that catches it: card-facts sorts before cards. */
const PORCELAIN = " M data/card-facts.json\n M data/cards.json\n M data/graph.json\n";
eq(statusPaths(PORCELAIN), ["data/card-facts.json", "data/cards.json", "data/graph.json"],
   "the first path survives, leading space and all");
eq(statusPaths(" M a.json\n"), ["a.json"], "a lone unstaged path is not shortened");
eq(statusPaths("M  staged.json\n M unstaged.json"), ["staged.json", "unstaged.json"],
   "staged and unstaged columns both start the path at 3");
eq(statusPaths(""), [], "a clean tree is no paths");

/* The specification names the runner and the skill, and the skill names the runner. */
const spec = readFileSync(path.join(ROOT, "docs/crankmagic-refresh.md"), "utf8"), skill = readFileSync(path.join(ROOT, ".claude/skills/crankmagic-refresh/SKILL.md"), "utf8");
ok(spec.includes("tools/refresh.mjs") && spec.includes("crankmagic-refresh"), "the specification points at the runner and the skill");
ok(skill.includes("tools/refresh.mjs") && skill.includes("docs/crankmagic-refresh.md"), "the skill points at the runner and the specification");
ok(/never/i.test(skill) && skill.includes("data/live-state.json") && skill.includes("deck-ratings.json"), "the skill carries the never list");
const readmeCount = Number((/There are (\d+) Node suites/.exec(readFileSync(path.join(ROOT, "README.md"), "utf8")) || [])[1]);
ok(!/\b44 suites\b/.test(spec), "the specification no longer hard-codes a suite count that moved");
ok(readmeCount > 0, "the README states the suite count the runner checks against the directory");

console.log(`refresh: ${checks} checks passed — ${STEPS.length} steps in the specification's order, ${ALLOWED.size} files a refresh may change.`);
