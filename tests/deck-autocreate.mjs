/* THE NEW DECK FLOW'S ENGINE (Rob, 2026-10-23: the Decks requirements' Q10 to Q13, STF-5 to STF-8, REC, CRD, GEN-3, GEN-6,
 * MEC-3, MEC-4, RVW-2), on the committed graph:
 *
 *   1. One list of play styles (the 16 strategies under players' names, plus Walls and Defenders, Voltron, Superfriends and
 *      Go wide) and one of mechanics (the graph's terms on at least 50 cards, cleaned, plus the roles asked for by name).
 *   2. Colors: exact identity, Include more colors, and colorless on its own.
 *   3. data/commander-index.json is this build's, and matching puts owned commanders first, then the popular.
 *   4. Recommendations: inside the commander's colors, each saying which relation put it there, the same every time.
 *   5. Auto-create: 63 spells and 36 lands; every seat a slot definition its card meets; each chosen mechanic its bar of 8;
 *      the card sources, the budget and the bracket's caps honored; up to five alternatives per seat that meet the same
 *      definition; the same 99 every time.
 *   6. What Auto-create still needs: a composition, at most three mechanics, a pool that carries each one.
 *   7. No model call anywhere in the flow (REC-3).
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {build as buildIndex} from "../tools/build-commander-index.mjs";
const require = createRequire(import.meta.url);
const V = require("../deck-vocabulary.js"), R = require("../deck-recommend.js"), A = require("../deck-autocreate.js"), Loops = require("../crankmagic-loops.js"), S = require("../crankmagic-strategies.js");
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const graph = require("../graph-payload.js").unpack(JSON.parse(read("../data/graph.json")));
const root = {CrankStrategies: S};new Function("globalThis", "window", "self", read("../crankmagic-graph.js"))(root, root, root);
const relate = root.CrankGraph.relate, targets = JSON.parse(read("../data/composition-targets.json")), index = JSON.parse(read("../data/commander-index.json"));
const by = new Map(graph.cards.map((c) => [c.name, c])), card = (n) => {const c = by.get(n); assert.ok(c, `${n} is in the graph`); return c;};
let checks = 0;const ok = (c, m) => {checks++;assert.ok(c, m);}, eq = (a, b, m) => {checks++;assert.deepEqual(a, b, m);};

/* 1. The lists. */
eq(V.ARCHETYPES.length, 18, "eighteen play styles");
eq(V.ARCHETYPES.filter((a) => !a.strategies.length).map((a) => a.label), ["Walls and Defenders", "Voltron", "Superfriends", "Go wide"], "the four the vocabulary lacked");
const used = new Set(V.ARCHETYPES.flatMap((a) => a.strategies));
for (const s of S.STRATEGIES || []) ok(used.has(s.id), `strategy ${s.id} has a play style`);
eq(V.archetype("aristocrats").strategies, ["sacrifice-supply", "death-payoff"], "sacrifice supply and death payoff are Aristocrats");
eq(V.archetype("blink").strategies, ["blink-loop", "etb-payoff"], "a blink loop and an enter-the-battlefield payoff are Blink");
const mech = V.mechanics(graph.cards);
ok(mech.length >= 40 && mech.length <= 80, `about sixty mechanics (${mech.length})`);
ok(mech.every((m) => m.cards >= V.MIN_CARDS), "each on at least 50 cards");
ok(!mech.some((m) => V.DROP.has(m.term) && m.kind === "mechanic"), "none of the dropped terms");
eq(mech.find((m) => m.id === "m:enchant").label, "Auras", "display names cleaned by the alias list");
ok(mech.some((m) => m.id === "r:blink") && mech.some((m) => m.id === "r:sac-outlet"), "roles a player asks for by name: blink, sacrifice outlet");
eq(index.mechanics.map((m) => m.id), mech.map((m) => m.id), "Start from and Mechanics read the same list");

/* 2. Colors (Q10, Q11). */
ok(V.colorsMatch("UW", ["W", "U"]) && !V.colorsMatch("BUW", ["W", "U"]), "W + U exact is Azorius only");
ok(V.colorsMatch("BUW", ["W", "U"], {include: true}) && !V.colorsMatch("W", ["W", "U"], {include: true}), "Include more colors widens to commanders containing both");
ok(V.colorsMatch("", [], {colorless: true}) && !V.colorsMatch("W", [], {colorless: true}), "C is colorless alone");

/* 3. The index. */
eq(JSON.stringify(buildIndex()) + "\n", read("../data/commander-index.json"), "data/commander-index.json is this build's (node tools/build-commander-index.mjs)");
const row = (n) => index.commanders.find((c) => c.n === n), styleIds = (c) => c.s.map((i) => index.styles[i].id);
ok(styleIds(row("Krenko, Mob Boss")).includes("tribal") && styleIds(row("Krenko, Mob Boss")).includes("go-wide"), "Krenko offers Tribal and Go wide");
ok(styleIds(row("Arcades, the Strategist")).includes("walls"), "Arcades offers Walls and Defenders");
ok(index.commanders.some((c) => c.p === "partner") && index.commanders.some((c) => c.p === "chooses-background") && index.commanders.some((c) => c.p === "background"), "pairs are marked: partner, Choose a Background, Background");
const rows = index.commanders.map((c) => ({name: c.n, ci: c.ci, rank: c.r, styles: styleIds(c), mechanics: c.m.map((i) => index.mechanics[i].id)}));
const azorius = V.matchCommanders(rows, {colors: ["W", "U"]});
ok(azorius.length > 20 && azorius.every((c) => c.ci === "UW"), `W + U finds ${azorius.length} Azorius commanders`);
for (let i = 1; i < azorius.length; i++) ok((azorius[i - 1].rank || 1e9) <= (azorius[i].rank || 1e9), "by popularity");
const owned = V.matchCommanders(rows, {colors: ["W", "U"]}, new Set([azorius.at(-1).name]));
eq(owned[0].name, azorius.at(-1).name, "an owned commander comes first");
const blinkers = V.matchCommanders(rows, {styles: ["blink", "aristocrats"]});
ok(blinkers.length && blinkers[0].matches >= 1 && blinkers.every((c, i) => !i || blinkers[i - 1].matches >= c.matches || blinkers[i - 1].owned), "more matches first, with the count");

/* 4. Recommendations. */
const krenko = card("Krenko, Mob Boss"), definition = {styles: ["tribal", "go-wide"], mechanics: ["m:haste"]};
const recs = R.recommend({commanders: [krenko], definition, pool: graph.cards, relate, loops: Loops});
ok(recs.length > 100, `recommendations for Krenko (${recs.length})`);
ok(recs.every((r) => V.within(card(r.name).ci, new Set(["R"]))), "every one inside Krenko's colors");
ok(recs.every((r) => r.why.length && r.why.every((w) => ["synergy", "chain", "style", "mechanic"].includes(w.kind))), "each says which relation put it there");
ok(recs.some((r) => r.why.some((w) => w.kind === "chain")), "chains among them (CrankLoops)");
eq(JSON.stringify(R.recommend({commanders: [krenko], definition, pool: graph.cards, relate, loops: Loops})), JSON.stringify(recs), "the same answer every time");
ok(JSON.stringify(R.recommend({commanders: [krenko], definition: {styles: ["aristocrats"]}, pool: graph.cards, relate, loops: Loops}).slice(0, 20)) !== JSON.stringify(recs.slice(0, 20)), "and a different definition recomputes them (REC-6)");
const brought = R.fromCommander([card("Atraxa, Praetors' Voice")], {styles: index.styles, mechanics: index.mechanics}, () => []);
ok(brought.mechanics.includes("m:proliferate") && brought.mechanics.includes("m:flying"), `Atraxa brings her mechanics to the definition (${brought.mechanics.join(", ")})`);

/* 5. Auto-create. */
const base = {composition: {primary: "tribal", tribe: "Goblin", secondary: "go-wide"}, mechanics: ["m:haste"], cardSources: "buy", budget: 150, baseBracket: 3};
const out = A.build({commanders: [krenko], definition: base, weighting: "Offense", targets, pool: graph.cards, recommendations: recs});
eq([out.slots.length, out.summary.lands, out.lands.nonbasic.length + out.lands.basic.reduce((n, x) => n + x.quantity, 0)], [63, 36, 36], "63 spells and 36 lands: the 99");
ok(out.slots.every((s) => s.label && s.role), "every seat has a slot definition");
ok(out.slots.filter((s) => s.card).every((s) => A.meets(card(s.card), s)), "and every card meets its seat's definition");
eq(new Set(out.slots.filter((s) => s.card).map((s) => s.card)).size, out.slots.filter((s) => s.card).length, "no card twice");
ok(out.slots.filter((s) => s.card && V.carries(card(s.card), "m:haste")).length >= V.BAR, "haste has its bar of eight");
ok(out.slots.filter((s) => s.card).every((s) => V.within(card(s.card).ci, new Set(["R"]))), "inside the colors");
ok(out.summary.toBuy <= 150, `inside the budget ($${out.summary.toBuy})`);
eq(out.slots.filter((s) => s.mechanic === "m:haste").length, V.BAR, "the plan sets eight seats aside for the chosen mechanic (MEC-3)");
const tight = A.build({commanders: [krenko], definition: {...base, budget: 20}, weighting: "Offense", targets, pool: graph.cards, recommendations: recs});
ok(tight.summary.toBuy <= 20 && tight.summary.toBuy < out.summary.toBuy, `a tighter budget buys less: $${tight.summary.toBuy} of $20`);
ok(out.slots.filter((s) => s.card && card(s.card).gameChanger).length <= 3, "the bracket's Game Changer cap");
ok(out.slots.every((s) => s.alternatives.length <= 5 && s.alternatives.every((a) => A.meets(card(a.name), s) && !out.slots.some((x) => x.card === a.name))), "up to five alternatives per seat, each meeting the same definition, none already in");
eq(JSON.stringify(A.build({commanders: [krenko], definition: base, weighting: "Offense", targets, pool: graph.cards, recommendations: recs})), JSON.stringify(out), "the same 99 every time");
const offense = A.quotas("Offense", targets), defense = A.quotas("Defense", targets), balanced = A.quotas("Balanced", targets);
ok(offense.removal < balanced.removal && defense.removal > balanced.removal && defense.finisher < balanced.finisher, "the weighting moves the skeleton: Offense fewer answers, Defense more answers and fewer threats");
eq(Object.values(balanced).reduce((n, x) => n + x, 0), 63, "the skeleton is 63 spells");
/* The card sources (GEN-3). */
const bench = new Set(["Goblin Chieftain", "Skirk Prospector", "Sol Ring"]);
const benchOnly = A.build({commanders: [krenko], definition: {...base, cardSources: "bench"}, weighting: "Offense", targets, pool: graph.cards, recommendations: recs, available: (n) => ({bench: bench.has(n) ? 1 : 0, decks: []})});
ok(benchOnly.slots.filter((s) => s.card).every((s) => s.source === "bench" && bench.has(s.card)) && benchOnly.summary.filled <= 3, "Bench only takes only Bench cards; the rest stay empty to fill later");
const fromDecks = A.build({commanders: [krenko], definition: {...base, cardSources: "decks"}, weighting: "Offense", targets, pool: graph.cards, recommendations: recs, available: (n) => ({bench: 0, decks: n === "Goblin Chieftain" ? [{deckId: "deck:x", name: "D6 Krenko"}] : []})});
ok(fromDecks.slots.some((s) => s.card === "Goblin Chieftain" && s.source === "deck" && s.deckId === "deck:x"), "with other decks allowed, a copy in another box is used as Reserved · in Dn");
ok(!A.build({commanders: [krenko], definition: base, weighting: "Offense", targets, pool: graph.cards, recommendations: recs, available: (n) => ({bench: 0, decks: n === "Goblin Chieftain" ? [{deckId: "deck:x", name: "D6"}] : []})}).slots.some((s) => s.source === "deck"), "without, it is not");
/* Restrictions (GEN-6). */
const b2 = A.build({commanders: [card("Atraxa, Praetors' Voice")], definition: {composition: {primary: "superfriends"}, cardSources: "buy", baseBracket: 2}, targets, pool: graph.cards, recommendations: []});
eq(b2.slots.filter((s) => s.card && card(s.card).gameChanger).length, 0, "bracket 2 takes no Game Changer");
ok(b2.slots.filter((s) => s.card && (card(s.card).roles || []).includes("extra-turn")).length <= 1, "and no chained extra turns");
const never = A.build({commanders: [krenko], definition: {...base, neverInclude: ["Goblin Chieftain"]}, weighting: "Offense", targets, pool: graph.cards, recommendations: recs});
ok(!never.slots.some((s) => s.card === "Goblin Chieftain"), "a card the definition excludes is never chosen");
ok(!A.build({commanders: [krenko], definition: base, weighting: "Offense", targets, pool: graph.cards, recommendations: recs, exclude: (c) => c.name === "Goblin Chieftain"}).slots.some((s) => s.card === "Goblin Chieftain"), "nor one the caller's restriction check refuses");

/* 6. What it still needs (CRD-5, CRD-6, MEC-4). */
eq(A.missing({}).map((x) => x.section), ["Gameplay"], "a composition is required");
eq(A.missing({composition: {primary: "blink"}, mechanics: ["m:a", "m:b", "m:c", "m:d"]}).map((x) => x.section), ["Mechanics"], "at most three mechanics");
const counts = V.mechanicCounts(graph.cards, new Set(["R"]), mech.map((m) => m.id)), thin = counts.find((m) => m.cards < V.FLAG), thick = counts.find((m) => m.cards >= V.FLAG);
ok(thin && thin.flagged && thick && !thick.flagged, `a thin mechanic is flagged with its count, not blocked (in mono-red, ${thin && thin.id}: ${thin && thin.cards})`);
const fit = V.fits(graph.cards, new Set(["R"]));
ok(!fit.find((x) => x.id === "blink").fits || fit.find((x) => x.id === "blink").cards >= V.FIT_MIN, "a style fits only when the colors can carry it (GPL-4)");
eq(V.chooseTribe(graph.cards, new Set(["R"]), [krenko]).id, "Goblin", "Let CrankMagic choose picks Krenko's tribe, which wants Goblins (GPL-5)");
ok(V.tribes(graph.cards, new Set(["R"])).length > 5 && V.tribes(graph.cards, new Set(["R"])).every((t) => t.cards >= V.FIT_MIN), "and offers only the tribes the colors can carry");

/* 7. No model call. */
for (const f of ["deck-vocabulary.js", "deck-recommend.js", "deck-autocreate.js", "tools/build-commander-index.mjs"]) ok(!/fetch\(|\/api\/advise|anthropic|openai/i.test(read("../" + f)), `${f} calls no model`);
console.log(`deck-autocreate: ${checks} checks passed; one list of play styles and mechanics, commanders matched owned first, recommendations that say why, and a 99 built the same way twice.`);
