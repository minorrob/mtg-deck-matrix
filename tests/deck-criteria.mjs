/* Build me a deck from my criteria, held on six criteria sets over the committed stores.
 *
 * deck-criteria.js (Linear ROB-109) turns a criteria record into a hundred with a reason on every slot, a commander
 * suggested when none is given, the composition against the bracket's and playstyle's targets, the legality verdict
 * and the budget line. The six sets (tests/fixtures/criteria-sets.json) cover a given commander and a suggested one,
 * colors open and fixed, a cap and no cap, pins and fences, owned first and not. Every build must be legal
 * (commander-legality.js with the banned list), within its cap and its bracket, complete, and explained; the
 * composition numbers are printed and the in-range count pinned loosely, because the builder's own targets (36 lands,
 * 10 ramp, 10 draw, 10 interaction) are not yet the composition model's (ROB-112 measures what they should be).
 *
 * The catalog is the browser's, rebuilt from the stores (tests/helpers/catalog-rows.mjs); relate() is the graph's own
 * scoring, evaluated the way tests/crankmagic-trace.mjs does it. The breaks: game/tools/batch/breaks-deck-criteria.py.
 */
import assert from "node:assert/strict";
import {readFile, readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {catalogRows} from "./helpers/catalog-rows.mjs";

const require = createRequire(import.meta.url);
const Criteria = require("../deck-criteria.js");
const S = require("../crankmagic-strategies.js");
const Composition = require("../deck-composition.js");
const sandbox = {CrankRules: require("../crankmagic-rules.js"), CrankLoops: require("../crankmagic-loops.js"), CrankStrategies: S};
new Function("globalThis", "window", readFileSync(new URL("../crankmagic-graph.js", import.meta.url), "utf8"))(sandbox, sandbox);
const T = require("../crankmagic-trace.js");
const fixture = JSON.parse(readFileSync(new URL("./fixtures/criteria-sets.json", import.meta.url), "utf8"));
void readFile;

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const t0 = Date.now();
const {rows, owned} = await catalogRows();
const catalogMs = Date.now() - t0;
ok(rows.length > 30000 && owned.size > 300, `the catalog is the stores' (${rows.length} rows, ${owned.size} owned) in ${catalogMs} ms`);
const opts = {trace: T, relate: sandbox.CrankGraph.relate};

/* 1. The criteria record. */
const n = Criteria.normalizeCriteria({playstyle: "combo", bracket: "9", budgetUsd: "120.5", colors: ["g", "x", "W", "G"], mustInclude: "Sol Ring", neverInclude: [{name: "Mana Crypt"}], seed: 7});
eq([n.playstyle, n.bracket, n.budgetUsd, n.colors, n.mustInclude, n.neverInclude, n.ownedFirst, n.seed], ["Combo", 5, 120.5, ["G", "W"], ["Sol Ring"], ["Mana Crypt"], true, "7"], "criteria are normalized: the Lab's five playstyles, brackets 1 to 5, colors as letters, names as lists, a seed as a string");
eq(Criteria.normalizeCriteria({}).playstyle, "Balanced", "no playstyle is Balanced");
eq(Criteria.normalizeCriteria({}).budgetUsd, null, "no budget is no cap");

/* 2. Six sets. */
const results = new Map();
for (const set of fixture.sets) {
  const r = Criteria.buildFromCriteria(set.criteria, rows, set.library ? owned : null, opts);
  results.set(set.id, r);
  const e = set.expect;
  ok(r.available, `${set.id}: built (${r.error || "ok"})`);
  eq(r.total, 100, `${set.id}: a hundred`);
  ok(r.complete, `${set.id}: complete`);
  ok(r.legality && r.legality.legal, `${set.id}: legal by commander-legality.js with the banned list (${r.legality ? JSON.stringify(r.legality.problems.slice(0, 3)) : "no verdict"})`);
  ok(r.legality.facts.bannedList > 60, `${set.id}: the banned list was applied (${r.legality.facts.bannedList} names)`);
  ok(r.budget.within, `${set.id}: within the cap ($${r.budget.spent} of ${r.budget.cap === null ? "no cap" : "$" + r.budget.cap})`);
  if (e.capNull) eq(r.budget.cap, null, `${set.id}: no cap`);
  else ok(r.budget.spent >= r.budget.cap * 0.8, `${set.id}: the cap is a target, not merely a ceiling ($${r.budget.spent} of $${r.budget.cap})`);
  ok(r.bracket.within, `${set.id}: within bracket ${r.bracket.n} (${r.bracket.gameChangers} Game Changers, ${r.bracket.allowed === null ? "any" : r.bracket.allowed} allowed)`);
  if (e.gameChangersAtMost !== undefined) ok(r.bracket.gameChangers <= e.gameChangersAtMost, `${set.id}: at most ${e.gameChangersAtMost} Game Changers (${r.bracket.gameChangers})`);
  if (e.commander) eq(r.commander.name, e.commander, `${set.id}: the commander asked for`);
  eq(r.commander.how, e.how, `${set.id}: the commander was ${e.how}`);
  if (e.identity) eq(r.commander.identity.slice().sort(), e.identity, `${set.id}: identity`);
  if (e.identityWithin) ok(r.commander.identity.every((x) => e.identityWithin.includes(x)) && r.commander.identity.length, `${set.id}: ${r.commander.name} is inside ${e.identityWithin.join("")} (${r.commander.identity.join("")})`);
  if (e.alternativesAtLeast) ok(r.commander.alternatives.length >= e.alternativesAtLeast && r.commander.alternatives.every((a) => /\S/.test(a.says)), `${set.id}: ${r.commander.alternatives.length} alternatives, each with a reason`);
  if (e.how === "suggested") ok(/offers|inside|exactly|among/.test(r.commander.reason), `${set.id}: the suggestion says why (${r.commander.reason})`);
  if (e.strategiesInclude) for (const id of e.strategiesInclude) ok(r.strategies.some((s) => s.id === id), `${set.id}: strategy ${id} is on the deck (${r.strategies.map((s) => s.id).join(", ")})`);
  if (e.ownedAtLeast !== undefined) ok(r.owned.cards >= e.ownedAtLeast && r.owned.preferred, `${set.id}: owned copies preferred (${r.owned.cards})`);
  if (e.ownedAtMost !== undefined) ok(r.owned.cards <= e.ownedAtMost && !r.owned.preferred, `${set.id}: no library, nothing owned (${r.owned.cards})`);
  if (e.pinned) for (const name of e.pinned) ok(r.cards.some((c) => c.name === name && c.pinned) && /asked for/.test(r.cards.find((c) => c.name === name).reason), `${set.id}: ${name} is pinned and says so`);
  if (e.fenced) for (const name of e.fenced) ok(!r.cards.some((c) => c.name === name), `${set.id}: ${name} is fenced out`);
  if (e.fenceOneItWants) {
    /* The fence is proven on a card this build took: fence it, build again, and it is gone. */
    const victim = r.cards.find((c) => !c.isCommander && c.role === "engine" && !c.pinned && !c.owned);
    ok(victim, `${set.id}: a card to fence (${victim && victim.name})`);
    const fenced = Criteria.buildFromCriteria({...set.criteria, neverInclude: [victim.name]}, rows, set.library ? owned : null, opts);
    ok(fenced.total === 100 && !fenced.cards.some((c) => c.name === victim.name) && fenced.fenced === 1, `${set.id}: with ${victim.name} fenced out the hundred is built without it`);
  }
  const comp = r.composition;
  ok(comp && comp.roles && comp.gaps && comp.targets, `${set.id}: a composition summary against bracket ${r.bracket.n} ${r.playstyle.name}`);
  const count = (role) => comp.roles[role].count;
  if (e.threatAtLeast) ok(count("threat") >= e.threatAtLeast, `${set.id}: Aggressive brings threats (${count("threat")})`);
  if (e.tutorAtLeast) ok(count("tutor") >= e.tutorAtLeast, `${set.id}: Combo brings tutors (${count("tutor")})`);
  if (e.counterspellAtLeast) ok(count("counterspell") >= e.counterspellAtLeast, `${set.id}: Reactive blue brings counterspells (${count("counterspell")})`);
  ok(count("ramp") >= 10 && count("draw") >= 8 && comp.lands.count >= 33 && comp.lands.count <= 38, `${set.id}: the builder's floors hold (ramp ${count("ramp")}, draw ${count("draw")}, lands ${comp.lands.count})`);
  const inRange = Object.values(comp.gaps).filter((g) => g.verdict === "in range").length;
  /* A loose pin: the builder fills its own four targets and the Trace fills the rest, so a bracket 5 Balanced deck
     reads short on tutors and counterspells against the composition model's ranges. ROB-112 measures what the ranges
     should be; until then the summary tells the truth and this holds that at least a third of it lands. */
  ok(inRange >= 4, `${set.id}: ${inRange} of ${Object.keys(comp.gaps).length} composition targets in range (${Object.entries(comp.gaps).filter(([, g]) => g.verdict !== "in range").map(([k, g]) => `${k} ${g.verdict} ${g.count}`).join(", ")})`);
  const spells = r.cards.filter((c) => !c.isCommander);
  ok(spells.every((c) => typeof c.reason === "string" && c.reason.length > 10 && /\.$/.test(c.reason) && c.role && Array.isArray(c.roles) && Array.isArray(c.strategies)), `${set.id}: every slot carries a role, its strategies and a reason sentence`);
  ok(spells.filter((c) => /over .+/.test(c.reason)).length >= 80, `${set.id}: most reasons name the next candidate and why this one beat it (${spells.filter((c) => /over .+/.test(c.reason)).length})`);
  ok(spells.some((c) => /ring \d/.test(c.reason)), `${set.id}: the Trace's rings appear in the reasons`);
  ok(r.trace && r.trace.inDeck >= 15 && r.trace.world <= 2000, `${set.id}: the Trace lit ${r.trace.inDeck} of the hundred over a world of ${r.trace.world}`);
  ok(r.ms < 12000, `${set.id}: built in ${r.ms} ms`);
  console.log(`deck-criteria: ${set.id} → ${r.commander.name} (${r.commander.how}), $${r.budget.spent}${r.budget.cap === null ? "" : " of $" + r.budget.cap}, GC ${r.bracket.gameChangers}, owned ${r.owned.cards}, in range ${inRange}/${Object.keys(comp.gaps).length}, ${r.ms} ms; ` +
    Object.entries(comp.roles).map(([k, v]) => `${k} ${v.count}`).join(" · ") + ` · lands ${comp.lands.count}`);
}

/* 3. Determinism, the seed, owned first, and the pieces. */
const again = Criteria.buildFromCriteria(fixture.sets[0].criteria, rows, owned, opts);
eq(again.cards.map((c) => c.name), results.get("krenko-aggressive").cards.map((c) => c.name), "the same criteria and seed give the same hundred");
const other = Criteria.buildFromCriteria({...fixture.sets[0].criteria, seed: "b"}, rows, owned, opts);
ok(other.cards.map((c) => c.name).join("|") !== again.cards.map((c) => c.name).join("|"), "another seed gives another hundred");
ok(other.cards.filter((c) => again.cards.some((x) => x.name === c.name)).length >= 70, "but most of it is the same deck: the seed is a nudge, not a reshuffle");
const notOwned = Criteria.buildFromCriteria({...fixture.sets[0].criteria, ownedFirst: false}, rows, owned, opts);
ok(notOwned.owned.cards < results.get("krenko-aggressive").owned.cards && !notOwned.owned.preferred, `owned first is a real preference (${results.get("krenko-aggressive").owned.cards} owned with it, ${notOwned.owned.cards} without)`);
const missing = Criteria.buildFromCriteria({commander: "Not A Card At All", colors: ["R"], playstyle: "Aggressive", bracket: 3, budgetUsd: 100}, rows, null, opts);
ok(missing.available && missing.commander.how === "suggested" && missing.issues.some((i) => /Not A Card At All is not in the catalog/.test(i)), "a commander the catalog lacks is said, and one is suggested instead");
const noFit = Criteria.buildFromCriteria({colors: [], playstyle: "Combo", bracket: 4, neverInclude: rows.filter((c) => c.commander).map((c) => c.name)}, rows, null, opts);
ok(noFit.available === false && /No commander/.test(noFit.error), "no commander fits: an honest error, not a crash");
const noRelate = Criteria.buildFromCriteria(fixture.sets[0].criteria, rows, owned, {trace: T, relate: null});
ok(noRelate.available && noRelate.total === 100 && noRelate.trace === null && noRelate.notes.some((x) => /relate\(\) was not available/.test(x)) && /commander's strategies/.test(noRelate.method), "without the graph's relate() the build still completes and says it was not seeded by the Trace");

/* 4. Commander suggestions on their own. */
const gw = Criteria.suggestCommanders({colors: ["G", "W"], playstyle: "Value engine", budgetUsd: 75}, rows, {limit: 8});
eq(gw.length, 8, "eight suggestions when asked");
ok(gw.every((s) => s.card.commander && s.card.colorIdentity.every((x) => ["G", "W"].includes(x))), "every suggestion can lead and is inside the colors");
ok(gw.every((s, i, a) => i === 0 || a[i - 1].score >= s.score), "best first");
ok(gw[0].matched.length >= 2 && /Value engine asks for/.test(gw[0].says), `the first offers the playstyle's strategies (${gw[0].says})`);
const combo = Criteria.suggestCommanders({playstyle: "Combo"}, rows, {limit: 5});
ok(combo.some((s) => /Krenko|Kiki-Jiki|Lagomos/.test(s.card.name)), `Combo suggestions reach the untap and copy engines (${combo.map((s) => s.card.name).join(", ")})`);
const dear = Criteria.suggestCommanders({colors: ["U"], playstyle: "Reactive", budgetUsd: 20}, rows, {limit: 5});
ok(dear.every((s) => s.card.price === null || s.card.price <= 5 || /large share/.test(s.says)), "a dear commander on a small budget says so");

/* 5. The browser root. */
const source = readFileSync(new URL("../deck-criteria.js", import.meta.url), "utf8");
const root = {CrankDraft: require("../draft-builder.js"), CrankStrategies: S, CrankComposition: Composition, CrankLegality: require("../commander-legality.js"), MtgCardClassify: require("../card-classify.js"), CrankTrace: T, CrankGraph: sandbox.CrankGraph};
new Function("globalThis", "window", "self", "module", "require", source)(root, root, root, undefined, undefined);
ok(root.CrankCriteria && typeof root.CrankCriteria.buildFromCriteria === "function", "the UMD wrapper lands on the browser root as CrankCriteria");

console.log(`deck-criteria: ${checks} checks passed — six criteria sets legal, on budget, in bracket and explained; the seed, owned first, suggestions, the browser root.`);
