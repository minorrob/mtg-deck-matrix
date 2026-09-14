#!/usr/bin/env node
/* Trace T2 calibration: does the trace score track the simulator's measured score?
 *
 * Over the 200 measured rungs (50 variants × Base · Tuned · Fun · Max, data/simulation-summary.json
 * and data/archive/rung-lists.json) and the six live decks (data/deck-ratings.json), the walk
 * runs under the commander's derived strategies and its score is compared with the measured
 * one: Spearman's rank correlation across all rungs, and within each variant whether the trace
 * orders the ladder the way the simulator did. Several scorings are tried so the plan can
 * say which weights were chosen and why. Read-only; prints a table. */
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));
const S = require(path.join(ROOT, "crankmagic-strategies.js"));
const L = require(path.join(ROOT, "crankmagic-loops.js"));
const T = require(path.join(ROOT, "crankmagic-trace.js"));
const graph = require(path.join(ROOT, "graph-payload.js")).unpack(read("data/graph.json"));
const sandbox = {CrankRules: require(path.join(ROOT, "crankmagic-rules.js")), CrankLoops: L, CrankStrategies: S};
new Function("globalThis", "window", readFileSync(path.join(ROOT, "crankmagic-graph.js"), "utf8"))(sandbox, sandbox);
const G = sandbox.CrankGraph;
const fold = (s) => String(s).toLowerCase().replace(/[’']/g, "").replace(/\s*\/\/.*$/, "");
const byName = new Map(graph.cards.map((c) => [fold(c.name), c]));
const row = (name) => byName.get(fold(name)) || byName.get(fold(String(name).split(" // ")[0]));

const summary = read("data/simulation-summary.json").builds;
const lists = read("data/archive/rung-lists.json").variants;
const variants = read("data/archive/variants.json").variants;
const commanderOf = new Map(variants.map((v) => [v.id, v.commander]));

/* The scorings under test. Each takes the trace result and returns a number. */
const SCORINGS = {
  "plan (3·2·1 × (1+lb) × strategies)": (t) => t.score,
  "log-damped loop-backs": (t) => t.list.filter((r) => r.ring > 0).reduce((n, r) => n + [0, 3, 2, 1][r.ring] * (1 + Math.log2(1 + r.loopBacks)) * r.strategies.length, 0),
  "no loop-backs": (t) => t.list.filter((r) => r.ring > 0).reduce((n, r) => n + [0, 3, 2, 1][r.ring] * r.strategies.length, 0),
  "lit share": (t) => (t.total ? t.lit / t.total : 0),
  "lit count": (t) => t.lit
};

const points = []; // {variant, rung, measured, trace: {scoring: value}}
let skipped = 0;
for (const [variant, rungs] of Object.entries(lists)) {
  const commander = row(commanderOf.get(variant) || "");
  if (!commander) { skipped += 1; continue; }
  const strategies = S.derive(commander);
  for (const [rung, cards] of Object.entries(rungs)) {
    const measured = summary[variant] && summary[variant][rung] && summary[variant][rung].score;
    if (!Number.isFinite(measured)) continue;
    const rows = cards.map((c) => row(c.name)).filter(Boolean);
    const t = T.trace(commander, rows, G.relate, strategies, {S, loops: L});
    points.push({variant, rung, measured, trace: Object.fromEntries(Object.entries(SCORINGS).map(([k, f]) => [k, f(t)])), lit: t.lit, total: t.total});
  }
}
/* The six live decks, measured by rate-decks. */
const ratings = read("data/deck-ratings.json").decks;
const live = read("data/live-state.json").payload.state;
for (const d of live.decks) {
  const rating = ratings.find((r) => d.name.startsWith(r.id));
  const measured = rating && rating.builds && Object.values(rating.builds)[0] && Object.values(rating.builds)[0].score;
  const commander = row(live.cards[d.commanders[0]].name);
  if (!commander || !Number.isFinite(measured)) continue;
  const rows = d.slots.filter((s) => s.purpose === "main").map((s) => row(live.cards[s.cardId].name)).filter(Boolean);
  const t = T.trace(commander, rows, G.relate, S.derive(commander), {S, loops: L});
  points.push({variant: d.name.slice(0, 2), rung: "live", measured, trace: Object.fromEntries(Object.entries(SCORINGS).map(([k, f]) => [k, f(t)])), lit: t.lit, total: t.total});
}

function spearman(xs, ys) {
  const rank = (a) => { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; };
  const rx = rank(xs), ry = rank(ys), n = xs.length, mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0; for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}
/* Within a variant: of the rung pairs the simulator separates by more than 1 point, the share the trace orders the same way. */
function withinVariant(key) {
  let agree = 0, pairs = 0;
  const byV = new Map();
  for (const p of points) { if (p.rung === "live") continue; if (!byV.has(p.variant)) byV.set(p.variant, []); byV.get(p.variant).push(p); }
  for (const list of byV.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j]; if (Math.abs(a.measured - b.measured) < 1) continue;
    pairs += 1; if (Math.sign(a.measured - b.measured) === Math.sign(a.trace[key] - b.trace[key])) agree += 1;
  }
  return pairs ? agree / pairs : 0;
}
const measured = points.map((p) => p.measured);
console.log(`trace-calibrate: ${points.length} measured lists (${points.filter((p) => p.rung !== "live").length} rungs, ${points.filter((p) => p.rung === "live").length} live decks), ${skipped} variants skipped (commander not in the graph)`);
console.log("scoring".padEnd(40), "Spearman ρ vs measured", "within-variant ladder agreement");
for (const key of Object.keys(SCORINGS)) {
  const rho = spearman(points.map((p) => p.trace[key]), measured);
  console.log(key.padEnd(40), rho.toFixed(3).padStart(22), (withinVariant(key) * 100).toFixed(0).padStart(28) + "%");
}
const litAvg = points.reduce((n, p) => n + p.lit / Math.max(1, p.total), 0) / points.length;
console.log(`mean lit share ${(litAvg * 100).toFixed(0)}% · measured score range ${Math.min(...measured).toFixed(1)}–${Math.max(...measured).toFixed(1)}`);
