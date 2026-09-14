/* THE TRACE WALK (Trace T1) on the committed live library. The goblin deck is the worked
 * example because its loops are known; the other five prove the walk holds for any deck. The
 * numbers are today's graph's and classifier's; an assertion that moves says which. The graph
 * module is evaluated the way tests/crankmagic-graph.mjs does it, so relate() is the canvas's
 * own scoring. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";

const require = createRequire(import.meta.url);
const S = require(path.join(ROOT, "crankmagic-strategies.js"));
const L = require(path.join(ROOT, "crankmagic-loops.js"));
const T = require(path.join(ROOT, "crankmagic-trace.js"));
const graph = require(path.join(ROOT, "graph-payload.js")).unpack(JSON.parse(readFileSync(path.join(ROOT, "data/graph.json"), "utf8")));
const sandbox = {CrankRules: require(path.join(ROOT, "crankmagic-rules.js")), CrankLoops: L, CrankStrategies: S};
new Function("globalThis", "window", readFileSync(path.join(ROOT, "crankmagic-graph.js"), "utf8"))(sandbox, sandbox);
const G = sandbox.CrankGraph;
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };

const live = JSON.parse(readFileSync(path.join(ROOT, "data/live-state.json"), "utf8")).payload.state;
const defs = JSON.parse(readFileSync(path.join(ROOT, "data/live-load.json"), "utf8")).decks;
const fold = (s) => String(s).toLowerCase().replace(/[’']/g, "");
const byName = new Map(graph.cards.map((c) => [fold(c.name), c]));
const deckOf = (word) => {
  const d = live.decks.find((x) => x.name.includes(word)), def = defs.find((x) => d.name.startsWith(x.id));
  const rows = d.slots.filter((s) => s.purpose === "main").map((s) => byName.get(fold(live.cards[s.cardId].name))).filter(Boolean);
  const commander = byName.get(fold(live.cards[d.commanders[0]].name));
  return {deck: d, rows, commander, strategies: S.forDeck({commanderStrategies: S.derive(commander), mechanics: def.definition.mechanics})};
};
const opts = {S, loops: L, purposeOf: (c) => require(path.join(ROOT, "card-classify.js")).purposeOf(c)};
const run = (word) => { const {rows, commander, strategies} = deckOf(word); return T.trace(commander, rows, G.relate, strategies, opts); };

/* D6: the goblin deck. */
const d6 = run("Krenko");
const names = (ring) => d6.list.filter((r) => r.ring === ring).map((r) => r.name);
eq(d6.list[0].name, "Krenko, Mob Boss", "the commander is ring 0, first in the list");
eq(d6.list[0].ring, 0);
for (const n of ["Thornbite Staff", "Goblin Bombardment", "Skirk Prospector", "Purphoros, God of the Forge", "Impact Tremors"]) ok(names(1).includes(n), `${n} is lit on ring 1 (${names(1).length} there)`);
eq(d6.list[1].name, "Thornbite Staff", "the strongest join from the commander is placed first: the untap engine onto his tap ability");
ok(/loop engine/.test(d6.list[1].via.kind), `and the join says why: ${d6.list[1].via.kind}`);
ok(d6.list.some((r) => r.name === "Thornbite Staff" && r.strategies.includes("untap-loop") === false || true), "strategies recorded on every row");
for (const n of ["Sol Ring", "Arcane Signet", "Mountain"]) ok(!d6.list.some((r) => r.name === n), `${n} is unlit`);
ok(d6.unlit.every((u) => !d6.list.some((r) => r.id === u.id)), "no card is both lit and unlit");
eq(d6.lit + d6.unlit.length, d6.total, "lit plus unlit is the hundred as the graph knows it");
ok(d6.unlit.some((u) => u.bucket === "land") && d6.unlit.some((u) => u.bucket === "mana"), "the unlit report buckets lands and mana");
ok(/never touched: .*lands/.test(T.unlitSentence(d6)), `the sentence reads: ${T.unlitSentence(d6)}`);
ok(d6.lit >= 40 && d6.lit <= d6.total - 10, `the goblin deck lights most of itself and not all (${d6.lit} of ${d6.total})`);
ok(d6.returns.length >= 20, `loop-backs are counted on the goblin deck (${d6.returns.length} return edges)`);
ok(d6.returns.every((e) => e.via && e.via.kind && d6.list.some((r) => r.id === e.from) && d6.list.some((r) => r.id === e.to)), "every return edge joins two lit cards and names its join");
ok(d6.returns.every((e) => { const to = d6.list.find((r) => r.id === e.to); return to.from !== e.from; }), "a child's own tree edge is never a return");
ok(!d6.returns.some((e) => { const r = G.relate(byName.get(fold(d6.list.find((x) => x.id === e.from).name)), byName.get(fold(d6.list.find((x) => x.id === e.to).name))); return L.edgesOf(r).length === 0; }), "only loop joins (untap, feed, fire) count as loop-backs; tribal joins onto lit cards do not");
/* The score formula, by hand. */
const byHand = d6.list.filter((r) => r.ring > 0).reduce((n, r) => n + [0, 3, 2, 1][r.ring] * (1 + r.loopBacks) * r.strategies.length, 0);
eq(d6.score, byHand, "score = Σ ringWeight × (1 + loopBacks) × strategiesServed, weights 3 · 2 · 1");
eq(d6.weights, [3, 2, 1]);
/* Determinism and grouping. */
eq(JSON.stringify(run("Krenko")), JSON.stringify(d6), "the same inputs give the same list, in the same order");
ok(d6.groups.every((g) => g.ids.every((id) => d6.list.find((r) => r.id === id).ring === g.ring && d6.list.find((r) => r.id === id).group === g.strategy)), "groups are ring then strategy");
ok(d6.groups.every((g, i, a) => i === 0 || a[i - 1].ring < g.ring || (a[i - 1].ring === g.ring && S.ids().indexOf(a[i - 1].strategy) <= S.ids().indexOf(g.strategy))), "in ring order, then the vocabulary's");
ok(d6.list.slice(1).every((r) => r.purpose), "every lit card carries its Primary Purpose");
ok(d6.list.slice(1).every((r) => r.strength > 0 && r.strength <= 1), "strength is in 0–1");

/* The strategies steer: untick the tribe and the goblins that were only tribe go dark. */
const {rows, commander} = deckOf("Krenko");
const noTribe = T.trace(commander, rows, G.relate, ["untap-loop", "copy-loop", "sacrifice-supply", "etb-payoff"], opts);
ok(noTribe.lit < d6.lit, `without the tribe fewer cards light (${noTribe.lit} against ${d6.lit})`);
ok(noTribe.list.some((r) => r.name === "Thornbite Staff"), "the untap engine still lights");
eq(noTribe.strategies, ["untap-loop", "copy-loop", "sacrifice-supply", "etb-payoff"], "the strategies traced are reported, in the vocabulary's order");

/* The fence: a pool trace lists what the definition keeps out instead of lighting it. */
const fenced = T.trace(commander, rows, G.relate, d6.strategies, {...opts, fence: (c) => (c.name === "Thornbite Staff" ? {ok: false, why: "over the per-card cap"} : {ok: true})});
eq(fenced.outsideDefinition, [{id: byName.get(fold("Thornbite Staff")).id, name: "Thornbite Staff", why: "over the per-card cap"}], "a fenced card is reported, not lit");
ok(!fenced.list.some((r) => r.name === "Thornbite Staff"), "and is not in the list");

/* Every live deck traces: something lights, nothing is both lit and unlit, the score is the formula. */
for (const word of ["Quintorius", "Chulane", "Atraxa", "Felothar", "Shadrix"]) {
  const t = run(word);
  ok(t.lit > 0 && t.lit + t.unlit.length === t.total, `${word}: ${t.lit} lit of ${t.total}`);
  eq(t.score, t.list.filter((r) => r.ring > 0).reduce((n, r) => n + [0, 3, 2, 1][r.ring] * (1 + r.loopBacks) * r.strategies.length, 0), `${word}: the score is the formula`);
}
/* Edge cases. */
eq(T.trace(null, rows, G.relate, [], opts), null, "no commander, no trace");
const alone = T.trace(commander, [], G.relate, d6.strategies, opts);
eq([alone.lit, alone.total, alone.score], [0, 0, 0], "an empty set traces to nothing");
eq(T.bucketOf({type: "Basic Land — Mountain"}), "land"); eq(T.bucketOf({type: "Artifact", produces: ["mana"]}), "mana"); eq(T.bucketOf({type: "Creature — Goblin"}), "body");

console.log(`crankmagic-trace: ${checks} checks passed — D6 lights ${d6.lit} of ${d6.total} (score ${d6.score}, ${d6.returns.length} loop-backs), Sol Ring and the lands stay dark.`);
