// Turns a batch of simulation results into a readable per-deck report: what the
// run measured, which changes it recommends, the evidence behind each cut, and
// what the model could not see.
//
//   node tools/sim/report.mjs                       # every result in sim/results
//   node tools/sim/report.mjs --variants 5o,1a      # just these
//   node tools/sim/report.mjs --out sim/results/report.md --json sim/results/report.json

import path from "node:path";
import {readdir} from "node:fs/promises";
import {parseArgs, readJson, writeJson, loadCatalog, ROOT, SIM_DIR, relative} from "./lib.mjs";
import {writeFile, mkdir} from "node:fs/promises";

const args = parseArgs(process.argv.slice(2));
const {variants} = await loadCatalog();
const wanted = args.variants ? new Set(String(args.variants).split(",").map((entry) => entry.trim())) : null;

const files = (await readdir(path.join(SIM_DIR, "results")))
  .filter((file) => /^sim-.+\.json$/.test(file) && !/\.iter\d+\.json$/.test(file));
const results = [];
for (const file of files) {
  const result = await readJson(path.join(SIM_DIR, "results", file), null);
  if (!result?.variantId) continue;
  if (wanted && !wanted.has(result.variantId)) continue;
  results.push(result);
}
if (!results.length) {
  console.error("No finished results in sim/results. Run: node tools/sim/run-batch.mjs --all");
  process.exit(1);
}

const percent = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`;
const STAGE_ORDER = {Tuned: 0, Maxed: 1};
const byDeck = new Map();
results
  .sort((a, b) => a.variantId.localeCompare(b.variantId) || (STAGE_ORDER[a.stage] ?? 0) - (STAGE_ORDER[b.stage] ?? 0))
  .forEach((result) => {
    const deckId = result.deckId || 0;
    if (!byDeck.has(deckId)) byDeck.set(deckId, []);
    byDeck.get(deckId).push(result);
  });

function changeLines(result) {
  const changes = (result.netChanges || []).filter((change) => change.out || change.in);
  if (!changes.length) return ["No change. Nothing in the candidate pool beat the current list."];
  return changes.map((change) => {
    const stat = change.outStat;
    const evidence = stat
      ? `cast in ${percent(stat.castRate)} of the games it was drawn, stranded in hand in ${percent(stat.deadRate)}, average cast on turn ${stat.avgCastTurn.toFixed(1)}, and the games it was cast in were won ${percent(stat.winRateWhenCast)} of the time against a deck average of ${percent(result.baselineMetrics.winRate)}`
      : "added to fill a measured gap";
    const price = `${change.priceDelta >= 0 ? "+" : ""}$${Number(change.priceDelta || 0).toFixed(2)}`;
    return `**Cut ${change.out || "—"} · add ${change.in || "—"}** (${price}) — ${evidence}.`;
  });
}

const lines = [];
lines.push("# Simulation results");
lines.push("");
lines.push(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} · ${results.length} deck${results.length === 1 ? "" : "s"}.`);
lines.push("");
lines.push("Each deck was simulated from its literal card list — never whichever boxes are ticked in a browser — as two builds checked against the rules each is meant to satisfy: **Tuned** (the starting shell with every required purchase applied) against **Tier 2**, and **Maxed** (Tuned plus every Enhance and Max option) against **Tier 3**.");
lines.push("");
lines.push("## How to read a verdict");
lines.push("");
lines.push("Every run ends by replaying both the original list and the optimized list on seeds the optimizer never saw. Only that comparison sets the verdict:");
lines.push("");
lines.push("- **confirmed** — ahead on unseen games by more than the sampling noise. Worth making.");
lines.push("- **within-noise** — ahead, but by less than the error bars. A preference, not a fix.");
lines.push("- **not-confirmed** — better only on the seeds it was tuned against. Keep the deck as it is.");
lines.push("- **no-change** — nothing in the candidate pool beat the current list.");
lines.push("");

const summary = [];
for (const [deckId, deckResults] of [...byDeck.entries()].sort((a, b) => a[0] - b[0])) {
  lines.push(`## Deck ${deckId}`);
  lines.push("");
  for (const result of deckResults) {
    const variant = variants.variants.find((entry) => entry.id === result.variantId);
    const holdoutBefore = result.holdoutBaselineMetrics || result.baselineMetrics;
    const holdoutAfter = result.holdoutMetrics || result.finalMetrics;
    lines.push(`### ${result.variantId} · ${result.name} · ${result.stage || "Tuned"} · Tier ${result.tier ?? 3}`);
    lines.push("");
    if (result.legalityFixes?.length) {
      lines.push(`**Not legal as published.** The ${(result.stage || "Tuned").toLowerCase()} build in the shopping guide is not Tier ${result.tier ?? 3} legal on its own — these changes are mandatory, not a suggestion:`);
      result.legalityFixes.forEach((fix) => lines.push(`- **Cut ${fix.out} · add ${fix.in}** — ${fix.reason}`));
      lines.push("");
    }
    lines.push(`**${result.verdict}** — ${result.recommendation}`);
    lines.push("");
    lines.push(`| | before | after |`);
    lines.push(`|---|---|---|`);
    lines.push(`| Win rate (unseen games) | ${percent(holdoutBefore?.winRate)} | ${percent(holdoutAfter?.winRate)} |`);
    lines.push(`| Score | ${Number(holdoutBefore?.score || 0).toFixed(1)} | ${Number(holdoutAfter?.score || 0).toFixed(1)} |`);
    lines.push(`| Average win turn | ${result.baselineMetrics.avgWinTurn ? result.baselineMetrics.avgWinTurn.toFixed(1) : "no wins"} | ${result.finalMetrics.avgWinTurn ? result.finalMetrics.avgWinTurn.toFixed(1) : "no wins"} |`);
    lines.push(`| Mana screw | ${percent(result.baselineMetrics.screwPct)} | ${percent(result.finalMetrics.screwPct)} |`);
    lines.push(`| Answer in hand, turns 3-7 | ${percent(result.baselineMetrics.interactionAvailability)} | ${percent(result.finalMetrics.interactionAvailability)} |`);
    lines.push(`| Fun/participation | ${percent(holdoutBefore?.funScore)} | ${percent(holdoutAfter?.funScore)} |`);
    lines.push("");
    changeLines(result).forEach((line) => lines.push(`- ${line}`));
    lines.push("");
    if (result.gapsRemaining?.length) {
      lines.push(`Still weak: ${result.gapsRemaining.map((gap) => `${gap.key.replace(/-/g, " ")} (${gap.observed})`).join("; ")}.`);
      lines.push("");
    }
    summary.push({
      requestId: result.id,
      variantId: result.variantId,
      deckId,
      name: result.name,
      commander: result.commander,
      stage: result.stage || "Tuned",
      tier: result.tier ?? 3,
      legalityFixes: result.legalityFixes || [],
      mechanics: variant?.mechanics || [],
      verdict: result.verdict,
      recommendation: result.recommendation,
      before: {winRate: holdoutBefore?.winRate ?? null, score: holdoutBefore?.score ?? null, funScore: holdoutBefore?.funScore ?? null, games: holdoutBefore?.games ?? null},
      after: {winRate: holdoutAfter?.winRate ?? null, score: holdoutAfter?.score ?? null, funScore: holdoutAfter?.funScore ?? null, games: holdoutAfter?.games ?? null},
      baseline: result.baselineMetrics,
      final: result.finalMetrics,
      changes: (result.netChanges || []).filter((change) => change.out || change.in),
      gapsRemaining: result.gapsRemaining || [],
      compliance: result.compliance,
      stopReason: result.stopReason,
      totalGamesUsed: result.totalGamesUsed
    });
  }
}

lines.push("## What the model cannot see");
lines.push("");
(results[0].simplifications || []).forEach((line) => lines.push(`- ${line}`));
lines.push("");
lines.push("Read these numbers as a comparison between two versions of one deck, never as absolute odds.");
lines.push("");

const markdown = `${lines.join("\n")}`;
const outPath = path.resolve(ROOT, String(args.out || path.join(SIM_DIR, "results", "report.md")));
await mkdir(path.dirname(outPath), {recursive: true});
await writeFile(outPath, markdown);
if (args.json) await writeJson(path.resolve(ROOT, String(args.json)), {generatedAt: new Date().toISOString(), decks: summary});

const counts = summary.reduce((tally, entry) => ({...tally, [entry.verdict]: (tally[entry.verdict] || 0) + 1}), {});
console.log(`${summary.length} decks · ${Object.entries(counts).map(([verdict, count]) => `${count} ${verdict}`).join(" · ")}`);
console.log(`written to ${relative(outPath)}${args.json ? ` and ${relative(path.resolve(ROOT, String(args.json)))}` : ""}`);
