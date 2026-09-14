/* THE STRATEGY VOCABULARY (Trace T0). Sixteen tuples over the graph's own terms, asked two
 * questions -- what does this commander offer, what does this join serve -- and the baked
 * answer for every legal commander in data/commander-strategies.json. Named commanders are
 * checked because a rule that passes on Krenko and Atraxa is a rule about Magic; the counts
 * per strategy are ranged because the classifier moves and the file follows it. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";

const require = createRequire(import.meta.url);
const S = require(path.join(ROOT, "crankmagic-strategies.js"));
const graph = require(path.join(ROOT, "graph-payload.js")).unpack(JSON.parse(readFileSync(path.join(ROOT, "data/graph.json"), "utf8")));
const baked = JSON.parse(readFileSync(path.join(ROOT, "data/commander-strategies.json"), "utf8"));
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const card = (name) => graph.cards.find((c) => c.name === name || c.name === name.replace("'", "’"));
const has = (name, id) => S.derive(card(name)).includes(id);

/* The vocabulary. */
eq(S.ids().length, 16, "sixteen strategies to start");
ok(S.ids().every((id, i, a) => a.indexOf(id) === i && /^[a-z-]+$/.test(id)), "ids are unique kebab-case terms");
ok(S.STRATEGIES.every((s) => s.label && s.why && typeof s.commander === "function" && typeof s.join === "function"), "every tuple says what it is, why, and how to read a commander and a join");
eq(S.labelOf("untap-loop"), "Untap loop"); eq(S.labelOf("nope"), "nope", "an unknown id labels as itself");

/* Source 1: derived from the commander's text. */
eq(S.derive(card("Krenko, Mob Boss")), ["untap-loop", "copy-loop", "sacrifice-supply", "etb-payoff", "tribal-payoff"], "Krenko: a tap ability that makes Goblins offers untap, copy, sacrifice supply, ETB payoff and the tribe");
ok(has("Atraxa, Praetors' Voice", "counters"), "Atraxa proliferates: counters");
ok(has("Niv-Mizzet, Parun", "draw-payoff") && has("Niv-Mizzet, Parun", "spellslinger"), "Niv-Mizzet fires on draws and on spells");
ok(has("Chulane, Teller of Tales", "draw-payoff"), "Chulane draws on a creature cast");
ok(has("Shadrix Silverquill", "counters") && has("Shadrix Silverquill", "sacrifice-supply"), "Shadrix places counters and makes bodies");
ok(has("Splinter, Radical Rat", "tribal-payoff") && has("Splinter, Radical Rat", "team-quality"), "Splinter names Ninjas and grants a quality");
ok(!card("Sol Ring").isCommander && !baked.commanders.some((r) => r.name === "Sol Ring"), "Sol Ring is not a commander and is not in the file");
eq(S.derive(null), [], "no card, no strategies");

/* The join side: a relation-shaped object is read for what it serves. */
eq(S.servedBy({drives: ["untap"], fires: [], loopFeeds: []}), ["untap-loop"], "an untap onto a tap ability serves the untap loop");
eq(S.servedBy({fires: ["creature-etb"], drives: []}), ["etb-payoff"], "a creature entering serves the ETB payoff");
eq(S.servedBy({loopFeeds: ["creatures"], drives: [], fires: []}), ["sacrifice-supply"], "bodies fed to an outlet serve the sacrifice supply");
eq(S.servedBy({multiplied: ["counter"]}), ["counters"], "a counter doubled serves counters");
eq(S.servedBy({tribal: ["Goblin"], extended: ["haste"]}), ["team-quality", "tribal-payoff"], "in the vocabulary's order");
eq(S.servedBy(null), [], "no relation, nothing served");
eq(S.servedBy({shared: ["ramp"]}), [], "a shared word alone serves no strategy");

/* Sources 3a and 3b: what a person named. */
eq(S.fromMechanics(["Goblin tribal", "Tokens", "ETB triggers"]), ["tribal-payoff", "team-quality", "sacrifice-supply", "etb-payoff", "blink-loop"], "D6's definition names its strategies");
eq(S.fromMechanics(["Counters", "Doublers & multipliers", "Proliferate"]), ["counters", "etb-payoff"], "D3's");
eq(S.fromMechanics([]), []); eq(S.fromMechanics(["Nonsense"]), [], "an unknown label names nothing");
ok(S.fromWords("Ninja tribal · ninjutsu tempo").includes("tribal-payoff") && S.fromWords("Ninja tribal · ninjutsu tempo").includes("stat-payoff"), "a guide's archetype line is read for its words");

/* The deck's default: the commander's own together with what the definition names. */
const krenko = S.derive(card("Krenko, Mob Boss"));
eq(S.forDeck({commanderStrategies: krenko, mechanics: ["Goblin tribal", "Tokens", "ETB triggers"]}), ["untap-loop", "copy-loop", "blink-loop", "sacrifice-supply", "etb-payoff", "team-quality", "tribal-payoff"], "D6 defaults to the union, in the vocabulary's order");
eq(S.forDeck({commanderStrategies: krenko, mechanics: ["Landfall"]}), [...krenko.slice(0, 4), "tribal-payoff", "landfall"].sort((a, b) => S.ids().indexOf(a) - S.ids().indexOf(b)), "a mechanic the commander does not derive is still traced");
eq(S.forDeck({commanderStrategies: krenko, mechanics: []}), krenko, "nothing named leaves the commander's");
eq(S.forDeck({commanderStrategies: krenko, mechanics: [], ticked: ["copy-loop", "untap-loop"]}), ["untap-loop", "copy-loop"], "what the reader ticked wins, in the vocabulary's order");

/* The baked file. */
eq(baked.schema, "commander-strategies@1");
ok(baked.count === baked.commanders.length && baked.count >= 2000 && baked.count <= graph.cards.filter((c) => c.isCommander).length, `${baked.count} commanders carry a strategy`);
ok(baked.vocabulary.map((v) => v.id).join() === S.ids().join(), "the file carries the vocabulary it was baked with");
ok(baked.commanders.every((r, i, a) => i === 0 || a[i - 1].name.localeCompare(r.name) <= 0), "commanders by name");
ok(baked.commanders.every((r) => r.strategies.length && r.strategies.every((id, i) => S.ids().indexOf(id) > (i ? S.ids().indexOf(r.strategies[i - 1]) : -1))), "every row's strategies are in the vocabulary's order");
const row = (name) => baked.commanders.find((r) => r.name === name || r.name === name.replace("'", "’"));
eq(row("Krenko, Mob Boss").derived, krenko, "Krenko's baked row carries the derivation");
ok(krenko.every((id) => row("Krenko, Mob Boss").strategies.includes(id)) && row("Krenko, Mob Boss").strategies.includes("blink-loop"), "and the union with what D6's definition named (ETB triggers brings blink)");
ok(row("Krenko, Mob Boss").named && row("Krenko, Mob Boss").named.from.includes("deck definition"), "and carries what the live deck named");
ok(row("Splinter, Radical Rat").named && row("Splinter, Radical Rat").named.from.includes("guide"), "Splinter carries the guide's words");
for (const [id, lo, hi] of [["untap-loop", 200, 900], ["sacrifice-supply", 300, 1500], ["etb-payoff", 300, 1500], ["counters", 300, 1500], ["extra-turns", 1, 40], ["landfall", 10, 150]]) {
  ok(baked.perStrategy[id] >= lo && baked.perStrategy[id] <= hi, `${id}: ${baked.perStrategy[id]} commanders, within ${lo}–${hi}`);
}
console.log(`commander-strategies: ${checks} checks passed — ${S.ids().length} strategies, ${baked.count} commanders with one.`);
