/* The swap record, held on Krenko's hundred and the simulator's preview protocol.
 *
 * swap-record.js (Linear ROB-117) is the one shape every recommended swap takes: evidence, the composition change, the
 * price, the owned flags, and the measured gain when a measurement exists. The rule under test: a swap with no measured
 * delta is shown as unmeasured, never as a gain; a measured delta inside the noise is no gain; an unmeasured record
 * never ranks above a measured gain; a record with no evidence is not recommended. Measurements here are real runs of
 * deck-measure.js on three seeds of 2,000 games (the Lab's refine shape at a suite's size): fast enough for a suite,
 * and with a standard error, which a one-seed preview does not have.
 *
 * The breaks: game/tools/batch/breaks-swap-record.py.
 */
import assert from "node:assert/strict";
import {readFile, readFileSync} from "node:fs";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Swap = require("../swap-record.js");
const Measure = require("../deck-measure.js");
const S = require("../crankmagic-strategies.js");
const sandbox = {CrankRules: require("../crankmagic-rules.js"), CrankLoops: require("../crankmagic-loops.js"), CrankStrategies: S};
new Function("globalThis", "window", readFileSync(new URL("../crankmagic-graph.js", import.meta.url), "utf8"))(sandbox, sandbox);
const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const facts = load("../data/card-facts.json").cards;
const config = load("../sim/config.json");
const opponents = load("../sim/opponents.json");
const targets = load("../data/composition-targets.json");
const graph = require("../graph-payload.js").unpack(load("../data/graph.json"));
const byGraph = new Map(graph.cards.map((c) => [c.name, c]));
void readFile;

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

/* Krenko's hundred as catalog-shaped rows: the facts table's body and text, the graph's roles, terms and rank. */
const backup = load("../data/live-state.json");
const live = backup.payload.state || backup.payload;
const d6 = live.decks.find((d) => /Krenko/.test(d.name));
const rowOf = (name, quantity = 1) => {
  const f = facts[name] || {}, g = byGraph.get(name) || {};
  return {id: g.id || name, name, quantity, typeLine: f.typeLine || g.type || "", oracleText: f.oracleText || "", manaCost: f.manaCost || "", power: f.power, toughness: f.toughness, keywords: f.keywords || [],
    colorIdentity: f.colorIdentity || String(g.ci || "").split("").filter(Boolean), price: Number.isFinite(f.price) ? f.price : g.price, rank: g.rank, roles: g.roles || [], causes: g.causes || [], triggers: g.triggers || [], produces: g.produces || [], mechanics: g.mechanics || [], tribes: g.tribes || [], wants: g.wants || [], grants: g.grants || [], extends: g.extends || [], multiplies: g.multiplies || [], makes: g.makes || [], gameChanger: !!g.gameChanger};
};
const counts = new Map();
for (const s of d6.slots.filter((s) => s.purpose === "main")) { const n = live.cards[s.cardId].name; counts.set(n, (counts.get(n) || 0) + s.quantity); }
const krenko = rowOf("Krenko, Mob Boss");
const cards = [...counts].map(([n, q]) => rowOf(n, q));
ok(cards.reduce((n, c) => n + c.quantity, 0) === 100 && cards.every((c) => c.typeLine), "the hundred, every card with a type line");
const deck = {commanders: [krenko], cards};
const strategies = S.derive(krenko);
const seats = Measure.buildSeats(opponents, config.table);
const measure = (list) => {
  const hydrated = Measure.hydrate(list.map((c) => ({name: c.name, quantity: c.quantity, isCommander: c.name === "Krenko, Mob Boss", card: c})));
  /* Three seeds of 2,000 games: the Lab's refine shape at a suite's size. One seed would carry no standard error. */
  const r = Measure.measure(hydrated, {config, seats, seedCount: 3, games: 2000});
  return {score: r.score, se: r.se, games: r.games, seeds: 3, protocol: "refine-lite"};
};
const ctx = {deck, strategies, relate: sandbox.CrankGraph.relate, owned: new Set(["Lightning Greaves"]), bracket: 3, playStyle: "Balanced", targets};

/* 1. A record with evidence, unmeasured. */
const greaves = Swap.record({out: rowOf("Thornbite Staff"), in: rowOf("Lightning Greaves")}, ctx);
eq(greaves.status, "unmeasured", "no measurement yet: unmeasured");
ok(greaves.evidence.length >= 1 && greaves.evidence.some((e) => e.kind === "inventory"), `evidence named (${greaves.evidence.map((e) => e.kind).join(", ")})`);
ok(/Unmeasured: no measured gain is claimed\.$/.test(greaves.says), `and the sentence says so: ${greaves.says}`);
ok(greaves.measured === null && greaves.in.owned === true && greaves.out.owned === false, "no measured block; owned read from the library");
ok(greaves.price.delta !== null && /more|less/.test(greaves.says), `the price difference is said (${greaves.price.delta})`);
ok(greaves.composition && typeof greaves.composition.says === "string" && greaves.composition.gaps.before >= 0, `the composition change is computed (${greaves.composition.says})`);

/* 2. A record the graph and the strategies support: a mana rock of the hundred out, a goblin lord in. */
const rock = cards.find((c) => c.roles.includes("ramp") && /Artifact/.test(c.typeLine) && c.name !== "Sol Ring") || cards.find((c) => c.roles.includes("ramp") && /Artifact/.test(c.typeLine));
ok(rock, `the hundred has a mana rock to swap out (${rock && rock.name})`);
const chieftain = Swap.record({out: rock, in: rowOf("Goblin Chieftain")}, ctx);
ok(chieftain.evidence.some((e) => e.kind === "trace" || e.kind === "strategy"), `a goblin lord carries trace or strategy evidence (${chieftain.evidence.map((e) => e.says).join(" | ")})`);
ok(chieftain.composition && chieftain.composition.delta && Object.keys(chieftain.composition.delta).length >= 1, `swapping a rock for a lord moves the role counts (${chieftain.composition.says})`);

/* 3. No evidence, no recommendation. */
const bare = Swap.record({out: "Mountain", in: "Some Card"}, {});
eq(bare.status, "no-evidence", "names alone carry no evidence");
ok(/not recommended; nothing supports it/.test(bare.says), "and the sentence says it is not recommended");
const stillBare = Swap.withMeasurement(bare, {score: 50, se: 0.3, games: 2000}, {score: 60, se: 0.3, games: 2000}, {protocol: "preview"});
eq(stillBare.status, "no-evidence", "a measurement does not rescue a swap nothing supports");

/* 4. Measurements: a real gain, within the noise, a loss; the same protocol; the fields required. */
const before = {score: 70, se: 0.2, games: 2000, protocol: "preview"};
const gain = Swap.withMeasurement(greaves, before, {score: 71.5, se: 0.2, games: 2000, protocol: "preview"});
eq([gain.status, gain.measured.delta, gain.measured.significant], ["measured-gain", 1.5, true], "a delta clearing twice the noise is a gain");
ok(/a measured gain of \+1\.50 points \(± 0\.28, preview\)/.test(gain.says), `and reads as one: ${gain.says}`);
const noise = Swap.withMeasurement(greaves, before, {score: 70.3, se: 0.2, games: 2000, protocol: "preview"});
eq(noise.status, "measured-no-gain", "a delta inside twice the noise is no gain");
ok(/within the noise, no gain shown/.test(noise.says), "and says so");
const loss = Swap.withMeasurement(greaves, before, {score: 68, se: 0.2, games: 2000, protocol: "preview"});
eq([loss.status, loss.measured.delta], ["measured-loss", -2], "a loss is a loss");
assert.throws(() => Swap.withMeasurement(greaves, before, {score: 71.5, se: 0.2, games: 2000, protocol: "published"}), /different protocols/, "before and after on different protocols is refused"); checks++;
assert.throws(() => Swap.withMeasurement(greaves, before, {score: 71.5}), /needs a before and an after/, "a measurement without its error and game count is refused"); checks++;
assert.throws(() => Swap.withMeasurement(greaves, {score: 70, se: 0, games: 2000, protocol: "preview"}, {score: 71.5, se: 0, games: 2000, protocol: "preview"}), /one seed has no standard error/, "a one-seed run, whose error is zero by construction, cannot claim a gain"); checks++;
ok(greaves.measured === null && greaves.status === "unmeasured", "withMeasurement returns a new record; the original is untouched");

/* 5. Rank: measured gains first, then unmeasured by evidence, then no-gains and losses. */
const ordered = Swap.rank([noise, greaves, loss, gain, chieftain, bare]);
eq(ordered.map((r) => r.status), ["measured-gain", "unmeasured", "unmeasured", "measured-no-gain", "measured-loss", "no-evidence"], "the order a screen shows");
ok(ordered.indexOf(gain) < ordered.indexOf(greaves), "an unmeasured record never sorts above a measured gain");
ok(ordered[1] === chieftain || ordered[2] === chieftain, "unmeasured records sort by their evidence");

/* 6. measureTop: real preview runs, one baseline, the records not reached stay unmeasured. */
const spells = cards.filter((c) => !/Land/.test(c.typeLine) && c.name !== "Thornbite Staff" && c !== rock && c.quantity === 1);
const candidates = [
  Swap.record({out: rowOf("Thornbite Staff"), in: rowOf("Lightning Greaves")}, ctx),
  Swap.record({out: rock, in: rowOf("Goblin Chieftain")}, ctx),
  Swap.record({out: spells[spells.length - 1], in: rowOf("Goblin Warchief")}, ctx)
].filter((r) => r.status === "unmeasured");
ok(candidates.length === 3, "three candidates with evidence");
const t0 = Date.now();
const measured = await Swap.measureTop(candidates, measure, {n: 2, deck, protocol: "refine-lite", cardOf: (name) => rowOf(name)});
const ms = Date.now() - t0;
eq(measured.length, 3, "every record comes back");
eq(measured.filter((r) => r.measured).length, 2, "two were measured, one was not reached");
ok(measured.filter((r) => r.measured).every((r) => r.measured.protocol === "refine-lite" && r.measured.games === 12000 && Number.isFinite(r.measured.delta) && r.measured.se > 0 && /refine-lite/.test(r.says)), "each measurement names its protocol, its games and its error");
ok(measured.find((r) => !r.measured).status === "unmeasured" && /Unmeasured/.test(measured.find((r) => !r.measured).says), "the one not reached is still unmeasured, and says so");
ok(measured.filter((r) => r.measured).every((r) => ["measured-gain", "measured-no-gain", "measured-loss"].includes(r.status)), "a measured record is a gain, no gain or a loss, by the noise");
ok(ms < 30000, `three runs of three seeds in ${ms} ms`);
const again = await Swap.measureTop(candidates, measure, {n: 2, deck, protocol: "refine-lite", cardOf: (name) => rowOf(name)});
eq(again.filter((r) => r.measured).map((r) => r.measured.delta), measured.filter((r) => r.measured).map((r) => r.measured.delta), "the same seeds give the same deltas");
const untouched = await Swap.measureTop(candidates, measure, {n: 0, deck});
ok(untouched.every((r) => !r.measured), "n of zero measures nothing and fakes nothing");

/* 7. The browser root. */
const source = readFileSync(new URL("../swap-record.js", import.meta.url), "utf8");
const root = {CrankComposition: require("../deck-composition.js"), CrankStrategies: S, MtgCardClassify: require("../card-classify.js")};
new Function("globalThis", "window", "self", "module", "require", source)(root, root, root, undefined, undefined);
ok(root.CrankSwap && root.CrankSwap.record({out: rowOf("Thornbite Staff"), in: rowOf("Lightning Greaves")}, ctx).status === "unmeasured", "the UMD wrapper lands on the browser root as CrankSwap");

console.log(`swap-record: ${checks} checks passed — evidence or nothing, unmeasured never a gain, the noise respected, measured gains first, three real three-seed runs.`);
