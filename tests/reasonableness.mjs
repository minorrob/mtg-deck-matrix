/* Reasonableness, held to a tolerance: the criteria builder's decks against what people play, the precons and Rob's.
 *
 * tools/sim/reasonableness.mjs (Linear ROB-112) builds the six criteria sets and compares each with its references on
 * composition distance, overlap, played rate, score and cost. This suite runs it on the cached inputs (the EDHREC
 * reference snapshot, the precons, the live library) and the quick protocol, and holds the numbers that would move if
 * the builder got worse: the mean composition distance across every comparison, the played rate of the goblin deck
 * (the one commander whose popular cards the Trace reaches most), and the shape of the report itself. The tolerances
 * are loose on purpose: data refreshes move the numbers a little, a broken builder moves them a lot (seeding without
 * the Trace doubles the composition distance; a random seed halves the played rate).
 *
 * What the numbers say today is in docs/program/reports/reasonableness-<version>.md, and it is not flattering on
 * overlap: the builder leans on the Trace's lit cards, which are mostly not the cards people play. That is a finding
 * for ROB-109, recorded there; this suite keeps it from getting worse unnoticed.
 *
 * The breaks: game/tools/batch/breaks-reasonableness.py.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compare, render, distance, referencesFor, QUICK, VERSION} from "../tools/sim/reasonableness.mjs";

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const TOLERANCE = {meanComposition: 6, krenkoPlayed: 0.12, minPlayed: 0.02, maxComposition: 9};

const t0 = Date.now();
const report = await compare({protocol: QUICK});
const ms = Date.now() - t0;
ok(ms < 120000, `the comparison runs in under two minutes on cached data (${ms} ms)`);
eq(report.version, VERSION, "the report names the generator version");
ok(/^\d{4}-\d{2}-\d{2}T/.test(report.inputs.edhrec), `the EDHREC reference carries its date (${report.inputs.edhrec})`);
eq(report.results.length, 6, "six criteria sets");
ok(report.results.every((r) => !r.error), `every set built (${report.results.filter((r) => r.error).map((r) => r.id + ": " + r.error).join("; ") || "none failed"})`);

/* The shape: every set has an EDHREC reference and at least one more, every comparison its four distances. */
for (const r of report.results) {
  ok(r.comparisons.length >= 2 && r.comparisons.some((c) => c.kind === "edhrec"), `${r.id}: EDHREC and at least one more reference (${r.comparisons.map((c) => c.kind).join(", ")})`);
  ok(r.comparisons.every((c) => Number.isFinite(c.composition) && c.composition >= 0 && Number.isFinite(c.overlap) && c.overlap >= 0 && c.overlap <= 1 && (c.played === null || (c.played >= 0 && c.played <= 1)) && Number.isFinite(c.cost)), `${r.id}: every comparison carries its distances`);
  ok(r.generated.score && Number.isFinite(r.generated.score.score) && r.generated.score.se > 0 && r.generated.score.games === QUICK.seedCount * QUICK.games, `${r.id}: the built deck is measured on the quick protocol with its error`);
  ok(r.comparisons.filter((c) => c.cards >= 90).every((c) => c.score && Number.isFinite(c.score.score)), `${r.id}: every full reference is measured on the same protocol`);
  ok(r.comparisons.every((c) => c.composition <= TOLERANCE.maxComposition), `${r.id}: no comparison is further than ${TOLERANCE.maxComposition} on composition (${r.comparisons.map((c) => c.composition).join(", ")})`);
  ok(r.comparisons.every((c) => c.played === null || c.played >= TOLERANCE.minPlayed), `${r.id}: the built deck plays at least a few cards EDHREC lists (${r.comparisons[0].played})`);
}
const krenko = report.results.find((r) => r.id === "krenko-aggressive");
ok(krenko.comparisons.some((c) => c.kind === "own") && krenko.comparisons.some((c) => c.kind === "precon"), "Krenko is compared with Rob's own goblins and a red precon");
ok(krenko.comparisons[0].played >= TOLERANCE.krenkoPlayed, `the goblin deck's played rate holds (${krenko.comparisons[0].played} against ${TOLERANCE.krenkoPlayed}): the Trace still reaches the goblins people play`);
const atraxa = report.results.find((r) => r.id === "atraxa-combo-not-owned");
ok(atraxa.comparisons.some((c) => c.kind === "precon" && /Breed Lethality/.test(c.label)) && atraxa.comparisons.some((c) => c.kind === "own"), "Atraxa is compared with her precon and Rob's deck");
const all = report.results.flatMap((r) => r.comparisons);
const meanComposition = all.reduce((n, c) => n + c.composition, 0) / all.length;
ok(meanComposition <= TOLERANCE.meanComposition, `the mean composition distance across ${all.length} comparisons holds (${meanComposition.toFixed(2)} against ${TOLERANCE.meanComposition}); seeding without the Trace roughly doubles it`);
console.log(`reasonableness: mean composition ${meanComposition.toFixed(2)}, Krenko played ${krenko.comparisons[0].played}, ` + report.results.map((r) => `${r.id} ${r.generated.score.score}`).join(", "));

/* The pieces on their own. */
const fake = {commanders: {"X": {slug: "x", decks: 10, rows: [{name: "Sol Ring", inclusion: 0.9}, {name: "Mountain", inclusion: 0.5}], top: ["Sol Ring", "Mountain"]}}, generatedAt: "2026-10-18T00:00:00Z"};
const rowByName = new Map([["sol ring", {name: "Sol Ring", typeLine: "Artifact"}], ["mountain", {name: "Mountain", typeLine: "Basic Land — Mountain"}]]);
const refs = referencesFor("X", ["R"], {edhrec: fake, precons: {decks: []}, live: {decks: [], cards: {}}, rowByName});
eq([refs.length, refs[0].kind, refs[0].cards.length, refs[0].played.size], [1, "edhrec", 2, 2], "referencesFor: the EDHREC list resolved against the catalog, the played set kept");
const none = referencesFor("Nobody", ["R"], {edhrec: {commanders: {}}, precons: {decks: []}, live: {decks: [], cards: {}}, rowByName});
eq(none, [], "a commander with no references has none, not a crash");
const md = render(report);
ok(/^# Reasonableness report, generator /.test(md) && /\| Reference \| Cards \| Composition distance \| Overlap \| Played \| Score \| Cost \|/.test(md) && /sanity check on the builder, not a judgment of any deck/.test(md), "the markdown names the version, tables every reference, and says what it is not");
ok(report.results.every((r) => md.includes(`## ${r.id}`)), "every set has its section");
const published = readFileSync(new URL(`../docs/program/reports/reasonableness-${VERSION}.md`, import.meta.url), "utf8");
ok(/published protocol/.test(published) && published.includes(`generator ${VERSION}`), `the published report for ${VERSION} is committed and was measured on the published protocol`);
void distance;

console.log(`reasonableness: ${checks} checks passed — six sets against their references in ${Math.round(ms / 1000)} s, the tolerances held, the report shaped.`);
