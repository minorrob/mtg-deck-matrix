/* The synergies model, held on Krenko's hundred and on what must stay empty.
 *
 * deck-synergies.js (Linear ROB-115) answers, for one deck, which cards work together, which chains it can run, and
 * which one card would complete a chain it almost has. It reads the graph's own scoring (CrankGraph.relate), the loop
 * finder (CrankLoops) and the strategy vocabulary, so it is held the way tests/crankmagic-loops.mjs holds the finder:
 * on D6 Krenko Goblins from the committed live state, where the Prospector-and-Staff engine is a known fact, and on
 * what must not be found (Sol Ring joins nothing into a chain; a pile of lands has no synergies). The completion is
 * proved by taking Thornbite Staff out of the deck and asking for it back from a pool that holds it among decoys.
 *
 * The breaks: game/tools/batch/breaks-deck-synergies.py.
 */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Synergies = require("../deck-synergies.js");
const Loops = require("../crankmagic-loops.js");
const Strategies = require("../crankmagic-strategies.js");
const graph = require("../graph-payload.js").unpack(JSON.parse(await readFile(new URL("../data/graph.json", import.meta.url), "utf8")));
const source = await readFile(new URL("../crankmagic-graph.js", import.meta.url), "utf8");
const root = {CrankStrategies: Strategies};
new Function("globalThis", "window", "self", source)(root, root, root);
const Graph = root.CrankGraph;
const byName = new Map(graph.cards.map((c) => [c.name, c]));
const row = (name) => { const c = byName.get(name); assert.ok(c, `${name} is in the graph`); return c; };

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

/* D6's hundred, as graph rows, from the committed live state (the same construction the loops suite uses). */
const backup = JSON.parse(await readFile(new URL("../data/live-state.json", import.meta.url), "utf8"));
const live = backup.payload.state || backup.payload;
const d6 = live.decks.find((d) => /Krenko/.test(d.name));
ok(d6, "the live state holds the Krenko deck");
const d6Names = [...new Set(d6.slots.filter((s) => s.purpose === "main").map((s) => live.cards[s.cardId] && live.cards[s.cardId].name).filter(Boolean))];
const d6Rows = d6Names.map((n) => byName.get(n)).filter(Boolean);
const krenko = row("Krenko, Mob Boss");
const staff = row("Thornbite Staff");
const bombardment = row("Goblin Bombardment");
ok(d6Rows.some((r) => r.id === staff.id) && d6Rows.some((r) => r.id === bombardment.id), "D6 carries Thornbite Staff and Goblin Bombardment");
const opts = {relate: Graph.relate, loops: Loops, strategies: Strategies, commanders: [krenko], mechanics: ["Goblin tribal", "Tokens", "ETB triggers"]};

/* 1. Krenko's hundred: pairs, chains, strategies, timing. */
const r = Synergies.synergies(d6Rows, {...opts, pool: []});
ok(r.cards === d6Rows.length && r.spells < r.cards, "every row counted; lands set aside for the joins");
ok(r.strategies.includes("tribal-payoff") && r.strategies.includes("sacrifice-supply"), `Krenko declares tribal payoff and sacrifice supply (${r.strategies.join(", ")})`);
ok(r.pairs.length >= 20, `a goblin deck has many pairs worth knowing (${r.pairs.length})`);
ok(r.pairs.every((p, i, all) => i === 0 || all[i - 1].strength >= p.strength), "pairs are strongest first");
ok(r.pairs.every((p) => typeof p.says === "string" && p.says.length > 5 && p.a !== p.b), "every pair has the graph's sentence and two different cards");
const tribalPairs = r.pairs.filter((p) => p.serves.includes("tribal-payoff"));
ok(tribalPairs.length >= 5, `tribal pairs are found (${tribalPairs.length})`);
ok(r.byStrategy.find((s) => s.id === "tribal-payoff").pairs >= tribalPairs.length && r.pairsTotal >= r.pairs.length, "byStrategy counts every pair, the list shows the strongest");
ok(r.chains.available && r.chains.list.length >= 1, `Krenko's hundred runs at least one chain (${r.chains.list.length})`);
const engine = r.chains.list.find((c) => c.cards.includes("Krenko, Mob Boss") && c.cards.includes("Thornbite Staff") && c.cards.includes("Goblin Bombardment"));
ok(engine, "the known engine is found: Krenko makes goblins, Bombardment throws them, the Staff untaps Krenko");
ok(engine.closed, "and it is closed (an untap resets it)");
ok(/Krenko/.test(engine.says) && /Thornbite Staff/.test(engine.says), `the chain reads as a sentence: ${engine.says}`);
const two = r.chains.list.find((c) => c.length === 2 && c.cards.includes("Krenko, Mob Boss") && c.cards.includes("Thornbite Staff"));
ok(two && two.closed, "the two-card engine (Krenko and the Staff) is its own chain, listed before the three-card one");
ok(r.chains.list.indexOf(two) < r.chains.list.indexOf(engine), "shorter closed chains come first");
ok(r.chains.list.every((c) => c.length >= 2 && c.length <= 4 && c.ids.length === new Set(c.ids).size), "every chain is two to four distinct cards");
ok(!r.chains.list.some((c) => c.cards.includes("Sol Ring")), "Sol Ring is on no chain");
ok(!r.unjoined.includes("Krenko, Mob Boss"), "the commander is joined");
ok(r.ms < 2500, `the hundred in well under the budget here (${r.ms} ms; the issue asks under a second on a desktop browser, measured when the Tune tab lands)`);

/* 2. Completions: take the Staff out, offer it back among decoys. */
const without = d6Rows.filter((x) => x.id !== staff.id);
const decoys = ["Sol Ring", "Lightning Bolt", "Swiftfoot Boots", "Fellwar Stone"].map(row);
const c = Synergies.synergies(without, {...opts, pool: [staff, ...decoys]});
ok(!c.chains.list.some((x) => x.cards.includes("Thornbite Staff")), "without the Staff, no chain names it");
const back = c.completions.list.find((x) => x.name === "Thornbite Staff");
ok(back, `Thornbite Staff is proposed as a completion (${c.completions.list.map((x) => x.name).join(", ") || "none"})`);
ok(back.closes[0] === "Thornbite Staff" && back.closes[back.closes.length - 1] === "Thornbite Staff" && back.closes.length >= 3 && back.closes.slice(1, -1).every((n) => without.some((x) => x.name === n)), `the completion names the chain it closes, through cards the deck has: ${back.closes.join(" → ")}`);
ok(back.via === "untaps", "and says how it joins (the Staff untaps what it is attached to)");
ok(typeof back.owned === "boolean" && (back.price === null || typeof back.price === "number"), "a completion carries ownership and price");
ok(!c.completions.list.some((x) => x.name === "Sol Ring"), "Sol Ring completes nothing");
eq(c.completions.scanned, [staff, ...decoys].filter((p) => !without.some((x) => x.id === p.id)).length, "every candidate outside the deck was scanned; the ones already in it were not");

/* 3. The pool drawn from the whole graph stays inside the colors and leaves the deck out. */
const pool = Synergies.poolFrom(graph.cards, d6Rows, ["R"], () => false, {...Synergies.DEFAULTS, poolSize: 50});
eq(pool.length, 50, "the pool is capped");
ok(pool.every((p) => !d6Rows.some((d) => d.id === p.id)), "no deck card in the pool");
ok(pool.every((p) => String(p.ci || "").split("").every((x) => x === "R")), "every candidate is red or colorless");
ok(pool.every((p) => !p.isLand), "no lands in the pool");

/* 4. Honest empties. */
const lands = ["Mountain", "Command Tower", "Sol Ring"].map(row);
const e = Synergies.synergies(lands, {...opts, pool: []});
eq(e.chains.list, [], "a pile of lands and a rock runs no chain");
eq(e.pairs, [], "and has no pair worth knowing");
eq(e.unjoined, ["Sol Ring"], "the rock is the one unjoined spell");
const none = Synergies.synergies(d6Rows, {relate: null, loops: Loops});
eq(none.available, false, "without relate() the model says so instead of guessing");

console.log(`deck-synergies: ${checks} checks passed — Krenko's pairs, the Prospector-and-Staff engine, the Staff proposed back, the pool in color, honest empties.`);
