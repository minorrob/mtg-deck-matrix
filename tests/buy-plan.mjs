/* The buy plan, held on a dated snapshot of fourteen cards' printings and the three extremes of the dial.
 *
 * buy-plan.js (Linear ROB-119) chooses, for every card a reader needs, a printing and a vendor by three weights,
 * and says what each choice cost. The snapshot is tests/fixtures/printings-snapshot.json (tools/printings-snapshot.mjs,
 * Scryfall's US-dollar prices on its generatedAt); the vendors are data/vendors.json's table. The acceptance: the three
 * extremes give three different plans, the function is pure and UMD, and a break that ignores the weights fails.
 *
 * The breaks: game/tools/batch/breaks-buy-plan.py.
 */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const B = require("../buy-plan.js");
const Rules = require("../crankmagic-rules.js");
const snapshot = JSON.parse(await readFile(new URL("./fixtures/printings-snapshot.json", import.meta.url), "utf8"));
const vendors = JSON.parse(await readFile(new URL("../data/vendors.json", import.meta.url), "utf8"));

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

/* 1. The data. */
eq(snapshot.schema, "printings-snapshot@1", "the snapshot carries its schema");
ok(/^\d{4}-\d{2}-\d{2}T/.test(snapshot.generatedAt), `and its date (${snapshot.generatedAt})`);
ok(Object.keys(snapshot.cards).length === 14 && snapshot.count > 600, `fourteen cards, ${snapshot.count} printings`);
ok(snapshot.cards["Sol Ring"].some((p) => p.set === "lea" || p.set === "leb") && snapshot.cards["Sol Ring"].some((p) => p.usd !== null), "Sol Ring's printings run back to the first sets and carry prices");
ok(vendors.vendors.length === 3 && vendors.vendors.some((v) => v.kind === "counter") && vendors.vendors.every((v) => v.says), "three vendors, one a counter, each with its assumption in words");
const ids = vendors.vendors.map((v) => v.id);
eq(ids, ["tcgplayer", "cardkingdom", "local"], "the table's order");

/* 2. The weights. */
eq(B.normalizeWeights({cost: 2, speed: 0, print: 0}), {cost: 1, speed: 0, print: 0, allEqual: false}, "weights normalize to a share");
eq(B.normalizeWeights({}).allEqual, true, "no weights is all equal");
eq(B.normalizeWeights({cost: 1, speed: 1}).cost, 0.5, "two set, half each");

/* 3. The three extremes give three different plans. */
const needs = ["Sol Ring", "Arcane Signet", "Lightning Bolt", "Swords to Plowshares", "Cyclonic Rift", "Rhystic Study", "Command Tower", "Smothering Tithe", "Counterspell", "Thassa's Oracle", "Skullclamp", "Goblin Bombardment", "Thornbite Staff", "Mountain"].map((name) => ({name, quantity: 1, deck: "Krenko"}));
const cost = B.buyPlan(needs, snapshot, {cost: 1}, {print: {prefer: "oldest"}});
const speed = B.buyPlan(needs, snapshot, {speed: 1}, {print: {prefer: "oldest"}});
const print = B.buyPlan(needs, snapshot, {print: 1}, {print: {prefer: "oldest"}});
const key = (p) => p.lines.map((l) => `${l.name}|${l.printing.set}|${l.printing.finish}|${l.vendor.id}`).sort().join("\n");
ok(key(cost) !== key(speed) && key(speed) !== key(print) && key(cost) !== key(print), "cost, speed and print give three different plans");
ok(cost.total.all <= speed.total.all && cost.total.all <= print.total.all, `cost is the cheapest plan ($${cost.total.all} against $${speed.total.all} and $${print.total.all})`);
eq(cost.total.all, cost.total.floor, "and it is the floor: every card its cheapest printing at its cheapest vendor");
ok(speed.slowestDays === 0 && speed.bundles.length === 1 && speed.bundles[0].vendor.kind === "counter", "speed walks into the local store today");
ok(print.lines.filter((l) => /original printing/.test(l.says)).length >= 10, `print takes the original printings (${print.lines.filter((l) => /original printing/.test(l.says)).length} of ${print.lines.length})`);
ok(print.total.all > cost.total.all * 3, `and pays for them ($${print.total.all} against $${cost.total.all}); the dial is the reader's`);
for (const p of [cost, speed, print]) {
  eq(p.lines.length, 13, "thirteen priced cards planned");
  eq(p.unpriced, ["Mountain"], "the basic land is not in the snapshot and is said, not dropped");
  eq(p.generatedAt, snapshot.generatedAt, "the plan carries the snapshot's date");
  ok(p.assumptions.length === 4 && p.assumptions.some((a) => /as of 2026-10-18/.test(a)) && p.assumptions.some((a) => /Card Kingdom: 15% over/.test(a)), "the assumptions are repeated, vendors and date");
  ok(p.lines.every((l) => l.says.includes(l.name) && l.says.includes(l.vendor.name) && /\$\d/.test(l.says) && /\.$/.test(l.says)), "every line names the card, the vendor and the money, as a sentence");
  ok(p.lines.every((l) => l.cheapest && l.cheapest.unit <= l.unit + 1e-9 && l.cheapest.saves === Math.round((l.unit - l.cheapest.unit) * l.quantity * 100) / 100), "every line knows the cheapest it could have been and the difference");
  ok(p.bundles.every((b) => b.total === Math.round((b.subtotal + b.shipping) * 100) / 100), "bundles add up");
  eq(Math.round(p.bundles.reduce((n, b) => n + b.total, 0) * 100) / 100, p.total.all, "and the plan's total is the bundles'");
  ok(p.alternatives.length >= 2 && p.alternatives.every((a) => a.label && a.total > 0), "the plans not taken are named with their totals");
}

/* 4. Shipping, lead times and the house rules. */
const small = B.buyPlan([{name: "Thornbite Staff"}, {name: "Goblin Bombardment"}], snapshot, {cost: 1});
ok(small.bundles.length === 1, `a small order is not split across vendors (${small.chosen})`);
const mail = small.bundles.find((b) => b.vendor.kind === "mail");
ok(!mail || mail.shipping === 0 || mail.subtotal < vendors.vendors.find((v) => v.id === mail.vendor.id).freeOver, "shipping is charged only under the vendor's threshold");
const noLocal = B.buyPlan(needs, snapshot, {speed: 1}, {local: false});
ok(noLocal.bundles.every((b) => b.vendor.kind === "mail") && noLocal.slowestDays === 4, `with no counter to walk into, speed is the fastest mail vendor (${noLocal.bundles.map((b) => b.vendor.name).join(", ")}, ${noLocal.slowestDays} days)`);
const dear = cost.lines.find((l) => l.name === "Rhystic Study");
ok(dear.flags.includes("over $30") && dear.flags.includes("≥ $5 not local") && /\(over \$30, ≥ \$5 not local\)\.$/.test(dear.says), `the house rules mark a line, never block it (${dear.flags.join(", ")})`);
const local = speed.lines.find((l) => l.name === "Rhystic Study");
ok(!local.flags.includes("≥ $5 not local"), "bought at the counter, the first-refusal rule is satisfied");
const noRules = B.buyPlan(needs, snapshot, {cost: 1}, {rules: null});
ok(noRules.lines.every((l) => l.flags.length === 0), "without the rules module there are no flags");
ok(Rules.warnings({price: 68, paid: 68, vendor: "TCGplayer"}).includes("over $30"), "the rules module is the one the Shop reads");

/* 5. Printing preferences. */
const foil = B.buyPlan([{name: "Sol Ring"}], snapshot, {print: 1}, {print: {prefer: "newest", finish: "foil"}});
ok(foil.lines[0].printing.finish === "foil" && /newest printing, foil/.test(foil.lines[0].says), `a foil preference buys a foil (${foil.lines[0].says})`);
const borderless = B.buyPlan([{name: "Sol Ring"}], snapshot, {print: 1, cost: 0.2}, {print: {prefer: "cheapest", frame: "borderless"}});
ok(/borderless/.test(borderless.lines[0].says) && !/not borderless/.test(borderless.lines[0].says), `a borderless preference finds one (${borderless.lines[0].says})`);
const cands = B.candidatesOf(snapshot.cards["Counterspell"], {prefer: "oldest", finish: "nonfoil", frame: "any"});
const earliest = cands.slice().sort((a, b) => String(a.released).localeCompare(String(b.released)))[0];
ok(cands.every((c) => c.finish === "nonfoil") && cands[0].unit <= cands[1].unit && earliest.printScore === 1 && /^(lea|leb|2ed)$/.test(earliest.set), `candidates: the finish allowed, cheapest first, the original (${earliest.setName}) scoring 1 for oldest`);
const quantity = B.buyPlan([{name: "Lightning Bolt", quantity: 4}], snapshot, {cost: 1});
eq(quantity.lines[0].total, Math.round(quantity.lines[0].unit * 4 * 100) / 100, "quantities multiply");
ok(/×4/.test(quantity.lines[0].says), "and are said");

/* 6. Empty and odd inputs. */
const none = B.buyPlan([], snapshot, {cost: 1});
eq([none.lines, none.total.all, none.unpriced], [[], 0, []], "nothing needed, nothing planned");
const unknown = B.buyPlan([{name: "A Card Not Snapshotted"}], snapshot, {cost: 1});
eq([unknown.lines.length, unknown.unpriced], [0, ["A Card Not Snapshotted"]], "an unknown card is unpriced, not guessed");
const noVendors = B.buyPlan(needs, snapshot, {cost: 1}, {vendors: []});
ok(noVendors.lines.length === 0 && /No vendor table/.test(noVendors.says), "no vendors: an honest sentence");
const undated = B.buyPlan([{name: "Sol Ring"}], {cards: snapshot.cards}, {cost: 1});
ok(undated.generatedAt === null && undated.assumptions.some((a) => /not reproducible/.test(a)), "an undated snapshot is said to be one");
const edited = B.buyPlan(needs, snapshot, {speed: 1}, {vendors: vendors.vendors.map((v) => (v.id === "cardkingdom" ? {...v, leadDays: 0} : v))});
ok(edited.bundles.some((b) => b.vendor.id === "cardkingdom") || edited.slowestDays === 0, "an edited vendor table is honored");

/* 7. The browser root. */
const source = await readFile(new URL("../buy-plan.js", import.meta.url), "utf8");
const root = {CrankRules: Rules, CrankVendors: vendors};
new Function("globalThis", "window", "self", "module", "require", source)(root, root, root, undefined, undefined);
ok(root.CrankBuyPlan && typeof root.CrankBuyPlan.buyPlan === "function" && root.CrankBuyPlan.buyPlan([{name: "Sol Ring"}], snapshot, {cost: 1}).lines.length === 1, "the UMD wrapper lands on the browser root as CrankBuyPlan and plans from the root's vendor table");

console.log(`buy-plan: ${checks} checks passed — three extremes, three plans ($${cost.total.all} in ${cost.slowestDays} days, $${speed.total.all} today, $${print.total.all} for the originals); shipping, the house rules, the preferences, the browser root.`);
