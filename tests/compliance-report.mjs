/* The compliance report, held per bracket on Krenko's hundred with the rule-breaking cards added one at a time.
 *
 * compliance-report.js (Linear ROB-111) says, rule by rule, where a hundred stands against its bracket, which cards
 * count, what the app could not check, and what one swap would do. It never changes the deck. The base is D6 Krenko
 * Goblins from the live state (no Game Changers, no land denial, no extra turns, no known combo), rows from the engine
 * oracle with the graph's Game Changer flags, roles and ranks; the pool for swaps is the graph's red cards.
 *
 * The breaks: game/tools/batch/breaks-compliance-report.py.
 */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Compliance = require("../compliance-report.js");
const oracle = Object.values(JSON.parse(await readFile(new URL("../data/engine/oracle.json", import.meta.url), "utf8")).cards);
const graph = require("../graph-payload.js").unpack(JSON.parse(await readFile(new URL("../data/graph.json", import.meta.url), "utf8")));
const brackets = JSON.parse(await readFile(new URL("../data/commander-brackets.json", import.meta.url), "utf8"));
const byOracle = new Map(oracle.map((c) => [c.name, c]));
const byGraph = new Map(graph.cards.map((c) => [c.name, c]));

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const row = (name, quantity = 1) => {
  const o = byOracle.get(name), g = byGraph.get(name);
  assert.ok(o, `${name} is in the oracle`);
  return {name, quantity, typeLine: o.type, oracleText: o.text, colorIdentity: o.ci, gameChanger: !!(g && g.gameChanger), roles: (g && g.roles) || [], rank: g ? g.rank : null};
};
const backup = JSON.parse(await readFile(new URL("../data/live-state.json", import.meta.url), "utf8"));
const live = backup.payload.state || backup.payload;
const d6 = live.decks.find((d) => /Krenko/.test(d.name));
const counts = new Map();
for (const s of d6.slots.filter((s) => s.purpose === "main")) { const n = live.cards[s.cardId].name; if (n !== "Krenko, Mob Boss") counts.set(n, (counts.get(n) || 0) + s.quantity); }
const base = () => ({commanders: [row("Krenko, Mob Boss")], cards: [...counts].map(([n, q]) => row(n, q))});
const pool = graph.cards.filter((c) => c.ci === "R" || c.ci === "").map((c) => ({name: c.name, roles: c.roles || [], rank: c.rank, ci: c.ci, gameChanger: !!c.gameChanger, type: c.type, text: (byOracle.get(c.name) || {}).text || ""}));
const withCards = (names, drop = []) => { const d = base(); d.cards = d.cards.filter((c) => !drop.includes(c.name)); for (const n of names) d.cards.push(row(n)); return d; };
const rule = (r, id) => r.rules.find((x) => x.id === id);
const statuses = (r) => Object.fromEntries(r.rules.map((x) => [x.id, x.status]));

/* 1. The table. */
eq(brackets.brackets.map((b) => b.n), [1, 2, 3, 4, 5], "five brackets");
ok(brackets.brackets[2].gameChangers === 3 && brackets.brackets[1].gameChangers === 0 && brackets.brackets[3].gameChangers === null, "the allowances the lobby carries: none, none, three, any, any");
ok(/^\d{4}-\d{2}-\d{2}/.test(brackets.updatedAt) && /Wizards/.test(brackets.source), "dated, with its source said");

/* 2. Krenko as is, at every bracket. */
const asIs = Compliance.report(base(), {bracket: 3, pool});
ok(asIs.available && asIs.fits && asIs.over.length === 0, `Krenko fits bracket 3 (${asIs.says})`);
eq(statuses(asIs), {"game-changers": "met", "mass-land-denial": "met", "extra-turns": "met", "two-card-combos": "met", tutors: "info"}, "every rule met, tutors informational at bracket 3");
eq(asIs.asOf, brackets.updatedAt, "the report says which date it judged by");
ok(/rules as of 2026/.test(asIs.says), "and the sentence repeats it");
ok(asIs.rules.every((r) => r.label && /\.$/.test(r.says) && r.how && Array.isArray(r.cards) && Array.isArray(r.swaps)), "every rule has a label, a sentence, how it was checked, its cards and its swaps");
eq(asIs.lowestFitting, 1, "as checked, the goblins fit bracket 1 and up");
const ladder = Compliance.ladder(base(), {pool});
eq(ladder.map((b) => b.fits), [true, true, true, true, true], "the ladder: fits every bracket");
eq(Compliance.report(base(), {}).bracket.n, 3, "the default bracket is 3");
eq(Compliance.report(base(), {bracket: 9}).bracket.n, 5, "a bracket out of range clamps");

/* 3. Game Changers: the cap, the order, the swap. */
const four = withCards(["Rhystic Study", "Smothering Tithe", "Cyclonic Rift", "Demonic Tutor"], ["Thornbite Staff", "Goblin Bombardment", "Skirk Prospector", "Impact Tremors"].filter((n) => counts.has(n)).slice(0, 4));
const atThree = Compliance.report(four, {bracket: 3, pool});
eq(rule(atThree, "game-changers").status, "over", "four Game Changers at bracket 3 is over");
eq(rule(atThree, "game-changers").count, 4, "counted");
ok(/4 Game Changers .*bracket 3 allows 3\. 1 would have to go\.$/.test(rule(atThree, "game-changers").says), `said in words (${rule(atThree, "game-changers").says})`);
eq(rule(atThree, "game-changers").swaps.length, 1, "one swap offered: the one over");
const swap = rule(atThree, "game-changers").swaps[0];
eq(swap.out, "Smothering Tithe", "the least played of the four goes first (the lobby's order)");
ok(swap.in && swap.in !== "Mountain" && /shares its role/.test(swap.why) && !byGraph.get(swap.in).gameChanger, `and a real card comes in from the pool (${swap.in}: ${swap.why})`);
ok(!atThree.fits && atThree.over.includes("game-changers") && /1 rule over \(game changers\)/.test(atThree.says), "the report says so");
eq(atThree.lowestFitting, 4, "as checked it fits bracket 4 and up");
eq(rule(Compliance.report(four, {bracket: 4, pool}), "game-changers").status, "info", "at bracket 4 there is no limit");
eq(rule(Compliance.report(withCards(["Rhystic Study"]), {bracket: 2}), "game-changers").status, "over", "one Game Changer at bracket 2 is over");
const noPool = rule(Compliance.report(withCards(["Rhystic Study"]), {bracket: 2}), "game-changers").swaps[0];
eq([noPool.out, noPool.in], ["Rhystic Study", "Mountain"], "without a pool the swap is a basic in the heaviest color");
ok(/plainly worse|put something real/.test(noPool.why), "and says a basic is plainly worse");
const named = Compliance.report(base(), {bracket: 2, gameChangers: ["Skullclamp"]});
eq([rule(named, "game-changers").count, rule(named, "game-changers").status], [1, "over"], "a name the caller adds counts as a Game Changer (the goblins run one Skullclamp)");
const bare = Compliance.report({commanders: [{name: "Krenko, Mob Boss"}], cards: [{name: "Mountain", quantity: 99}]}, {bracket: 2});
eq(rule(bare, "game-changers").status, "not-checked", "bare names carry no flag: not checked, and said");
ok(bare.notChecked.includes("game-changers") && /not checked/.test(bare.says), "the sentence names what was not checked");

/* 4. Mass land denial. */
const geddon = Compliance.report(withCards(["Armageddon"]), {bracket: 3, pool});
eq(rule(geddon, "mass-land-denial").status, "over", "Armageddon at bracket 3 is over");
ok(/Armageddon: mass land denial/.test(rule(geddon, "mass-land-denial").says) && rule(geddon, "mass-land-denial").swaps[0].out === "Armageddon", "named, with its swap");
eq(rule(Compliance.report(withCards(["Armageddon"]), {bracket: 4, pool}), "mass-land-denial").status, "info", "allowed at bracket 4");

/* 5. Extra turns: a chain, a one-shot, a pile. */
const nexus = Compliance.report(withCards(["Nexus of Fate"]), {bracket: 2, pool});
eq(rule(nexus, "extra-turns").status, "over", "a spell that comes back is a chain on its own");
ok(/comes back to be cast again/.test(rule(nexus, "extra-turns").says), "and says why");
const warp = Compliance.report(withCards(["Time Warp"]), {bracket: 2, pool});
eq(rule(warp, "extra-turns").status, "met", "one extra turn, once, is no chain");
const pile = Compliance.report(withCards(["Time Warp", "Temporal Mastery", "Expropriate"]), {bracket: 2, pool});
eq(rule(pile, "extra-turns").status, "review", "three one-shots are a question for the table, not a verdict");
ok(pile.review.includes("extra-turns") && pile.fits && /for the table to judge/.test(pile.says), "review does not make the deck unfit; the sentence says the table judges");

/* 6. Two-card combos: a known pair at three brackets. */
const oracleCombo = ["Thassa's Oracle", "Demonic Consultation"];
eq(rule(Compliance.report(withCards(oracleCombo), {bracket: 2, pool}), "two-card-combos").status, "over", "Oracle and Consultation at bracket 2: over");
const late = Compliance.report(withCards(oracleCombo), {bracket: 3, pool});
eq(rule(late, "two-card-combos").status, "over", "at bracket 3 a known early combo is still over");
ok(/before the late game/.test(rule(late, "two-card-combos").says), "and the sentence says a late-game finish is the allowance");
eq(rule(Compliance.report(withCards(oracleCombo), {bracket: 4, pool}), "two-card-combos").status, "info", "at bracket 4 anything goes");
ok(rule(late, "two-card-combos").cards[0].name === "Thassa's Oracle + Demonic Consultation" && rule(late, "two-card-combos").swaps.length === 1, "the pair is named as a pair, one swap breaks it");
ok(/cannot see every combo/.test(rule(asIs, "two-card-combos").how) && /not every combo/.test(rule(asIs, "two-card-combos").says), "the app says it does not know every combo");
const tagged = Compliance.report({commanders: [row("Krenko, Mob Boss")], cards: [...base().cards.slice(0, 98), {...row("Isochron Scepter"), tags: ["infinite combo"]}]}, {bracket: 3});
eq(rule(tagged, "two-card-combos").status, "review", "a curated combo piece at bracket 3 is for the table");
eq(rule(Compliance.report({commanders: [row("Krenko, Mob Boss")], cards: [{...row("Isochron Scepter"), tags: ["infinite combo"]}]}, {bracket: 1}), "two-card-combos").status, "over", "and at bracket 1 it is over");

/* 7. Tutors: counted, never a rule. */
const tutors = Compliance.report(withCards(["Demonic Tutor", "Vampiric Tutor", "Worldly Tutor", "Gamble"]), {bracket: 2, pool});
eq(rule(tutors, "tutors").status, "review", "four tutors at bracket 2 are a lot, for the table");
ok(rule(tutors, "tutors").count >= 4 && /Not a rule/.test(rule(tutors, "tutors").says), "counted, and said not to be a rule");
eq(rule(tutors, "game-changers").status, "over", "those four are also Game Changers, which is a rule");
eq(rule(Compliance.report(withCards(["Demonic Tutor"]), {bracket: 4}), "tutors").status, "info", "no limit at bracket 4");

/* 8. It never changes the deck. */
const input = withCards(["Rhystic Study", "Armageddon", "Nexus of Fate", ...oracleCombo]);
const before = JSON.stringify(input);
const r = Compliance.report(input, {bracket: 2, pool});
eq(JSON.stringify(input), before, "the deck handed in is the deck handed back, untouched");
ok(!("cards" in r) && !("deck" in r) && r.swaps.length >= 4 && r.swaps.every((s) => s.out && s.in && s.why && s.rule), "the report carries offers, not a list");
ok(/This report changes nothing on its own/.test(r.decides), "and says whose decision it is");
eq(r.over.length, 4, "four rules over at once");

/* 9. The browser root. */
const source = await readFile(new URL("../compliance-report.js", import.meta.url), "utf8");
const root = {MtgComplianceModel: require("../compliance-model.js"), CrankCommanderBrackets: brackets};
new Function("globalThis", "window", "self", "module", "require", source)(root, root, root, undefined, undefined);
ok(root.CrankCompliance && root.CrankCompliance.report(base(), {bracket: 3}).fits, "the UMD wrapper lands on the browser root as CrankCompliance and reads the root's bracket table");

console.log(`compliance-report: ${checks} checks passed — Krenko at every bracket, each rule over and met, the swaps offered, the deck untouched.`);
