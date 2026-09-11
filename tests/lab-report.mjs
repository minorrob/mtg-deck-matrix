/* THE SIMULATION REPORT, RENDERED.
 *
 * Everything the engine measures has to survive one more step to be worth measuring: the
 * function that turns it into the page somebody reads. Three figures were counted by the
 * engine and silently dropped at exactly this line before anyone noticed, and the only
 * check on it was opening a browser, drafting a deck and waiting two minutes for a
 * measurement -- slow, dependent on a full catalog, and performed once per change at best.
 *
 * reportHTML is a pure function of the report: no DOM, no state, seven free names and all
 * of them are helpers. So this reads the function's SOURCE out of crankmagic-lab.js at
 * test time, binds those seven, and asserts the HTML. It is the real text, not a copy --
 * editing the template changes what this runs -- and it costs milliseconds.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

let checks = 0;
const ok = (label, fn) => {fn(); checks += 1; process.stdout.write(`  ok  ${label}\n`);};

const source = readFileSync(new URL("../crankmagic-lab.js", import.meta.url), "utf8");
const start = source.indexOf("  function reportHTML(r,def){");
assert.ok(start > 0, "reportHTML is not where this test expects it in crankmagic-lab.js");
/* The function ends at the first line that is exactly two spaces and a brace, which is how
   every top-level function in this module closes. */
const end = source.indexOf("\n  }\n", start) + 4;
const body = source.slice(start, end);
assert.ok(body.length > 1500 && body.split("\n").length > 10, "the slice does not look like the whole function");

const esc = (x) => String(x == null ? "" : x)
  .replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const note = (text, warn) => `<div class="cm-note${warn ? " cm-warning" : ""}">${esc(text)}</div>`;
const title = (s) => String(s || "").replace(/^./, (c) => c.toUpperCase());

/* eslint-disable no-new-func */
const reportHTML = new Function("e", "note", "targetsFor", "rawFrom", "definition", "simConfig", "lossLabel",
  body + "; return reportHTML;")(
  esc, note,
  () => [],                 // targets: their own section, tested elsewhere
  () => ({}), {}, {},
  (cause) => title(cause),
);

const BASE = {
  protocol: "published-v2.8-6x20000",
  conditions: {seedCount: 6, gamesPerSeed: 20000},
  run: {games: 120000, elapsedMs: 19000},
  metrics: {
    score: {value: 62.5, unit: "points"},
    scoreStandardError: {value: 0.41, unit: "points"},
    winRate: {value: 33.1, unit: "%"},
    averageWinTurn: {value: 10.8, unit: "turns"},
    spellsCastPerGame: {value: 14.2, unit: "spells"},
    biggestTurn: {value: 3.4, unit: "spells"},
    winPathsTheEngineCannotWatch: {value: 0, unit: "cards"},
  },
  scoreParts: [], perCard: [], lossCauses: [],
  limits: ["Three opponents are sampled archetype profiles."],
  coverage: {total: 100, known: 100, ratio: 1, unreadable: []},
  perSeedScores: [], endTurnCounts: [],
};

ok("with no measurement it says so rather than drawing an empty report", () => {
  assert.match(reportHTML(null), /No measurement has been run/);
});

ok("the score and the two run figures the engine already counted are printed", () => {
  const html = reportHTML(BASE);
  assert.match(html, /Score <strong>62\.5/);
  assert.match(html, /Spells cast per game <strong>14\.2/);
  assert.match(html, /Biggest turn <strong>3\.4/);
  assert.match(html, /published-v2\.8-6x20000/);
});

ok("per-seed scores are shown with the spread, so a gap can be read against the noise", () => {
  /* Two lists two points apart, measured on seeds that themselves range over three, are
     not two points apart. Printing the seeds and the spread is the difference between a
     number a reader can act on and one they can only believe. */
  const html = reportHTML({...BASE, perSeedScores: [61.2, 63.9, 62.4, 62.8, 61.9, 62.8]});
  assert.match(html, /How much of this is seed noise/);
  assert.match(html, /Seed 1 <strong>61\.20/);
  assert.match(html, /Seed 6 <strong>62\.80/);
  assert.match(html, /Spread <strong>2\.70 points/, "the spread is max minus min, to two places");
  // One seed has no spread to report, so the section stays away rather than printing 0.
  assert.doesNotMatch(reportHTML({...BASE, perSeedScores: [62.5]}), /How much of this is seed noise/);
});

ok("the turn distribution is drawn as a bar per turn, sized against the busiest", () => {
  const html = reportHTML({...BASE, endTurnCounts: [{turn: 9, games: 20}, {turn: 12, games: 100}, {turn: 15, games: 40}]});
  assert.match(html, /When the games ended/);
  const bars = html.match(/<i style="height:\d+%"><\/i>/g) || [];
  assert.equal(bars.length, 3, `expected three bars, got ${bars.length}`);
  assert.match(html, /height:100%"><\/i><span>12</, "the busiest turn is the full-height bar");
  assert.match(html, /height:20%"><\/i><span>9</, "a turn with a fifth of the games is a fifth as tall");
  assert.match(html, /out of 160/, "the caption says how many games the shape is made of");
  // A bar can never vanish: one game out of 100,000 still gets a sliver.
  const thin = reportHTML({...BASE, endTurnCounts: [{turn: 4, games: 1}, {turn: 12, games: 100000}]});
  assert.match(thin, /height:2%"><\/i><span>4</, "the rarest turn keeps a visible minimum");
  assert.doesNotMatch(reportHTML(BASE), /When the games ended/, "no histogram, no section");
});

ok("the cards the engine could not read are named, behind a fold", () => {
  const html = reportHTML({...BASE, coverage: {total: 100, known: 97, ratio: 0.97, unreadable: ["Mystery Booster Test Card", "Un-card", "Third Thing"]}});
  assert.match(html, /3 cards the engine could not read/);
  assert.match(html, /<details/);
  assert.match(html, /Mystery Booster Test Card/);
  assert.match(html, /claim about the other 97 cards/);
  assert.doesNotMatch(reportHTML(BASE), /could not read/, "full coverage says nothing");
  // Scryfall hands these back as objects on some paths and strings on others.
  assert.match(reportHTML({...BASE, coverage: {known: 99, unreadable: [{name: "Objecty Card"}]}}), /Objecty Card/);
});

ok("a win the engine cannot watch is said ABOVE the score, not below it", () => {
  /* A reader who scrolls to a number and stops has to meet this first: it is the sentence
     that says what the number leaves out. Under the table it would be worse than absent,
     because it would look as though it had been disclosed. */
  const html = reportHTML({
    ...BASE,
    metrics: {...BASE.metrics, winPathsTheEngineCannotWatch: {value: 2, unit: "cards"}},
    unwatchedWinCards: ["Thassa's Oracle", "Approach of the Second Sun"],
  });
  const warning = html.indexOf("you win the game");
  const score = html.indexOf("Score <strong>");
  assert.ok(warning >= 0, "the warning is missing");
  assert.ok(warning < score, `the warning is at ${warning} and the score at ${score}; it has to come first`);
  assert.match(html, /cm-warning/, "it is rendered as a warning, not a footnote");
  // Escaped on the way in, like everything else the note carries.
  assert.match(html.slice(0, warning + 400), /Thassa&#39;s Oracle, Approach of the Second Sun/,
    "naming the cards is what makes it actionable");
  assert.doesNotMatch(reportHTML(BASE), /you win the game/, "a list with none says nothing");
});

ok("what ended the games this deck lost is labelled, not printed raw", () => {
  const html = reportHTML({...BASE, lossCauses: [{cause: "combo", rate: 0.173}, {cause: "damage", rate: 0.049}]});
  assert.match(html, /What ended the games this deck lost/);
  assert.match(html, /Combo <strong>17\.3% of games/);
});

ok("every value is escaped on its way in", () => {
  const html = reportHTML({...BASE, coverage: {total: 1, known: 0, unreadable: ["<script>alert(1)</script>"]}});
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

console.log(`lab-report: ${checks} checks passed — the report prints its figures, names what it cannot see, and says it first.`);
