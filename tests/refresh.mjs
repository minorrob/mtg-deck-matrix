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
import {STEPS, ALLOWED, NEVER, bumpText} from "../tools/refresh.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };

/* Every step's tool exists and is the registry's generator for what it writes. */
for (const s of STEPS) {
  ok(existsSync(path.join(ROOT, s.run[1])), `${s.id}: ${s.run[1]} exists`);
  ok(existsSync(path.join(ROOT, s.check[1])), `${s.id}: its check exists`);
  for (const f of s.writes) {
    const reg = REGISTRY.find((r) => r.file === f);
    ok(reg, `${s.id}: ${f} is registered`);
    if (reg && s.id !== "records") ok(reg.generator === s.run[1], `${s.id}: ${f}'s registered generator is ${reg.generator}, the step runs ${s.run[1]}`);
  }
  for (const a of s.also || []) { ok(existsSync(path.join(ROOT, a.run[1])), `${s.id}: ${a.run[1]} exists`); }
  ok(!s.writes.some((f) => NEVER.some((n) => f === n || f.startsWith(n))), `${s.id} writes nothing a refresh must never touch`);
}
/* The records step writes the graph's card block through build-card-records.mjs, whose registered producer is the graph tool; that is the one shared file. */
ok(STEPS.find((s) => s.id === "records").writes.includes("data/graph.json"), "the records step says it touches the graph's card block");

/* The specification's order: 1 universe, 2 flavour names, 3 graph, 4 ranks; then the record set, the strategies, the manifest. */
eq(STEPS.map((s) => s.id), ["universe", "flavor", "graph", "ranks", "records", "strategies", "manifest"], "the plan is the specification's order");
ok(STEPS.find((s) => s.id === "graph").long, "the graph step is marked long");
for (const id of ["universe", "flavor", "graph", "records"]) ok(STEPS.find((s) => s.id === id).count?.mustNotShrink, `${id} must not shrink`);

/* Every served data file a step writes is one the asset map and the worker name, so a bump has somewhere to land. */
const assets = readFileSync(path.join(ROOT, "crankmagic-assets.js"), "utf8"), worker = readFileSync(path.join(ROOT, "crankmagic-sw.js"), "utf8");
for (const f of STEPS.flatMap((s) => s.writes).filter((f) => f.startsWith("data/") && f !== "data/manifest.json")) ok(assets.includes(f + "?v=") && worker.includes(f + "?v="), `${f} is served with a ?v= in the asset map and the worker`);
ok(!assets.includes("data/manifest.json?v="), "the manifest is not served, so it is never bumped");

/* The allowed set is the steps' files plus the version cascade, and nothing the refresh must never touch. */
for (const f of ["crankmagic-assets.js", "crankmagic-sw.js", "crankmagic-app.js", "index.html", "crankmagic.html", "tests/fixtures/asset-versions.json"]) ok(ALLOWED.has(f), `${f} may change (the cascade)`);
for (const n of NEVER) ok(![...ALLOWED].some((f) => f === n || f.startsWith(n)), `${n} is never allowed`);
ok(NEVER.includes("data/live-state.json") && NEVER.includes("data/deck-ratings.json") && NEVER.includes("sim/"), "the library, the scores and the sweep are off limits");

/* The bump: exactly the named URL, every occurrence, by one. */
eq(bumpText("a data/graph.json?v=17 b data/graph.json?v=17 c data/graph-played.json?v=2", "data/graph.json"), {out: "a data/graph.json?v=18 b data/graph.json?v=18 c data/graph-played.json?v=2", n: 2}, "bumps the file named and not its neighbour");
eq(bumpText("x crankmagic-app.js?v=165 y", "crankmagic-app.js").out, "x crankmagic-app.js?v=166 y");
eq(bumpText("nothing here", "data/cards.json").n, 0);

/* The specification names the runner and the skill, and the skill names the runner. */
const spec = readFileSync(path.join(ROOT, "docs/crankmagic-refresh.md"), "utf8"), skill = readFileSync(path.join(ROOT, ".claude/skills/crankmagic-refresh/SKILL.md"), "utf8");
ok(spec.includes("tools/refresh.mjs") && spec.includes("crankmagic-refresh"), "the specification points at the runner and the skill");
ok(skill.includes("tools/refresh.mjs") && skill.includes("docs/crankmagic-refresh.md"), "the skill points at the runner and the specification");
ok(/never/i.test(skill) && skill.includes("data/live-state.json") && skill.includes("deck-ratings.json"), "the skill carries the never list");
const readmeCount = Number((/There are (\d+) Node suites/.exec(readFileSync(path.join(ROOT, "README.md"), "utf8")) || [])[1]);
ok(!/\b44 suites\b/.test(spec), "the specification no longer hard-codes a suite count that moved");
ok(readmeCount > 0, "the README states the suite count the runner checks against the directory");

console.log(`refresh: ${checks} checks passed — ${STEPS.length} steps in the specification's order, ${ALLOWED.size} files a refresh may change.`);
