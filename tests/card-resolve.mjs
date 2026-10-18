/* Card resolution, held on two hundred real-world lines and on the rules that keep a wrong card out.
 *
 * card-resolve.js (Linear ROB-131) turns a typed, pasted or exported line into one card of the store with its layer
 * and confidence said out loud, or holds it with candidates. The contract is zero wrong accepts: an accepted row whose
 * card is not the one the line meant fails this suite, whatever the rate. The rate itself is published by the run
 * and pinned here so a change that quietly loses a layer is seen.
 *
 * The fixture (tests/fixtures/card-resolve-lines.json) carries the forms exports and typists produce: Moxfield's
 * "(SET) number" and "*F*", Archidekt's "1x", "[Category]" and "^tags^", text-file lines, thirty misspellings,
 * accents and ligatures, faces of two-faced cards, flavor names, foreign printed names (held: the store is English)
 * and names that are not cards. The small synthetic indexes below prove the rules the big store cannot show on
 * demand: the margin, the containment guard, a face two cards share, an alias that must not shadow a real name.
 *
 * The breaks: game/tools/batch/breaks-card-resolve.py.
 */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Resolve = require("../card-resolve.js");
const oracle = Object.values(JSON.parse(await readFile(new URL("../data/engine/oracle.json", import.meta.url), "utf8")).cards);
const flavor = JSON.parse(await readFile(new URL("../data/flavor-names.json", import.meta.url), "utf8")).cards;
const fixture = JSON.parse(await readFile(new URL("./fixtures/card-resolve-lines.json", import.meta.url), "utf8"));

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

/* 1. The store indexes in reasonable time and the fixture is what it says. */
let t = Date.now();
const r = Resolve.createResolver(oracle, {aliases: flavor});
const indexMs = Date.now() - t;
ok(r.size === oracle.length && r.size > 30000, `the whole oracle is indexed (${r.size} names)`);
ok(indexMs < 3000, `indexing the oracle is a one-time cost under three seconds (${indexMs} ms)`);
eq(fixture.lines.length, 200, "the fixture has two hundred lines");
eq(fixture.count, fixture.lines.length, "and says so");
ok(fixture.lines.every((l) => typeof l.line === "string" && l.line.trim() && (l.expect === null || typeof l.expect === "string") && l.kind), "every line names its kind and what it means");
const storeNames = new Set(oracle.map((c) => c.name));
ok(fixture.lines.every((l) => l.expect === null || storeNames.has(l.expect)), "every expected name is spelled as the oracle spells it");

/* 2. Two hundred lines: zero wrong accepts, every held line is one that should be, the rate is published. */
t = Date.now();
const results = fixture.lines.map((l) => ({...l, got: r.resolve(l.line)}));
const resolveMs = Date.now() - t;
const wrong = results.filter((x) => !x.got.held && x.got.resolved !== x.expect);
eq(wrong.map((x) => `${x.line} -> ${x.got.resolved} (${x.got.layer} ${x.got.confidence})`), [], "no accepted row names a card the line did not mean");
const missed = results.filter((x) => x.got.held && x.expect);
eq(missed.map((x) => `${x.line} held (${x.got.layer} ${x.got.confidence})`), [], "every line that means a card in the store resolves to it");
const shouldHold = results.filter((x) => x.expect === null);
ok(shouldHold.length >= 20 && shouldHold.every((x) => x.got.held && x.got.card === null && x.got.resolved === null), `every foreign name and non-card is held, never guessed (${shouldHold.length})`);
const summary = r.summary(results.map((x) => x.got));
eq(summary.lines, 200, "the summary counts every line");
eq(summary.accepted + summary.held, 200, "accepted and held add up");
ok(summary.rate >= 0.89, `the published offline rate: ${summary.accepted} of 200 (${summary.rate}); the rest are foreign names and non-cards the store cannot answer`);
ok(resolveMs < 1500, `two hundred lines resolve in well under the budget (${resolveMs} ms)`);
console.log(`card-resolve: ${summary.accepted}/200 accepted offline, ${summary.held} held, 0 wrong; layers ${JSON.stringify(summary.layers)}; ${indexMs} ms to index, ${resolveMs} ms to resolve`);

/* 3. Each kind of line reaches the layer built for it. */
const ofKind = (k) => results.filter((x) => x.kind === k);
ok(ofKind("plain").every((x) => x.got.layer === "exact" && x.got.confidence === 1), "a plain line is an exact match at confidence 1");
ok(ofKind("moxfield").every((x) => x.got.layer === "exact" && x.got.set && x.got.collector), "Moxfield's set and collector number are read off and kept, the foil marker dropped");
const solRing = results.find((x) => /^1 Sol Ring \(LTC\)/.test(x.line)).got;
eq([solRing.set, solRing.collector, solRing.quantity, solRing.resolved], ["LTC", "292", 1, "Sol Ring"], "set, collector, quantity and the card on one Moxfield row");
const lower = results.find((x) => /\([a-z0-9]+\) \d+$/.test(x.line) && x.kind === "moxfield").got;
ok(lower.set === lower.set.toUpperCase() && lower.layer === "exact", `a lower-case set code is upper-cased (${lower.line})`);
ok(ofKind("archidekt").every((x) => !x.got.held && x.got.layer === "exact"), "Archidekt's category brackets and ^tags^ never reach the name");
const bracketSet = results.find((x) => x.line === "1 Karn Liberated [NPH]").got;
eq([bracketSet.set, bracketSet.resolved], ["NPH", "Karn Liberated"], "a [SET] code in square brackets is a set, not a category");
eq(results.find((x) => x.line === "23 Mountain").got.quantity, 23, "quantities are carried");
eq(results.find((x) => x.line === "SB: 1 Shock").got.marker, "side", "the sideboard marker is carried");
ok(ofKind("misspelling").every((x) => ["fuzzy", "folded", "normalized"].includes(x.got.layer)), "a misspelling is answered by the fuzzy layer, or by folding when the slip was only punctuation");
const fuzzy = results.filter((x) => x.got.layer === "fuzzy");
ok(fuzzy.length >= 20, `most misspellings needed the fuzzy layer (${fuzzy.length})`);
ok(fuzzy.every((x) => x.got.confidence >= Resolve.DEFAULTS.accept && x.got.confidence < 1), "a fuzzy accept is at or above the threshold and never claims certainty");
ok(fuzzy.every((x) => /nearest spelling/.test(x.got.says) && /% alike/.test(x.got.says)), "and says how alike the two spellings are");
ok(ofKind("accent").every((x) => ["folded", "normalized"].includes(x.got.layer) && x.got.confidence >= 0.98), "accents, the Æ ligature and curly quotes are folding, not fuzziness");
ok(ofKind("face").every((x) => ["exact", "normalized", "folded", "face"].includes(x.got.layer)), "a face, a front half or a slash-written pair reaches the two-faced card");
eq(results.find((x) => x.line === "1 Insectile Aberration").got.layer, "face", "the back face is the face layer");
eq(results.find((x) => x.line === "1 Fire/Ice").got.resolved, "Fire // Ice", "a slash-written split card");
ok(ofKind("flavor").every((x) => x.got.layer === "alias" && x.got.confidence === Resolve.LAYER_CONFIDENCE.alias), "a flavor name is the alias layer");
eq(results.find((x) => /Tis But a Scratch/.test(x.line)).got.resolved, "Dismember", "'Tis But a Scratch! is Dismember");
ok(ofKind("foreign").every((x) => x.got.held && (x.got.layer === "held" || x.got.layer === "unknown")), "foreign names are held with the nearest English names as candidates, or with none");
const krenko = results.find((x) => x.line === "1 Krenko").got;
ok(krenko.held && krenko.candidates.length >= 2 && krenko.candidates.slice(0, 2).every((c) => /^Krenko,/.test(c.name)), `a name typed short offers the cards that begin with it (${krenko.candidates.map((c) => c.name).join(", ")})`);
ok(krenko.candidates.every((c) => c.confidence < Resolve.DEFAULTS.accept), "and none of them is accepted");
const shok = results.find((x) => x.line === "1 Shok").got;
ok(shok.held && shok.candidates[0].name === "Shock" && shok.candidates[0].confidence < Resolve.DEFAULTS.accept, "a four-letter slip is offered, not assumed: one letter is a different card at that length");
ok(results.every((x) => !x.got.held || (Array.isArray(x.got.candidates) && x.got.candidates.length <= Resolve.DEFAULTS.candidates && x.got.says.length > 10)), "every held row carries at most five candidates and a sentence");
ok(results.every((x) => x.got.held || (x.got.card && x.got.card.name === x.got.resolved)), "every accepted row carries the store's own card");

/* 4. Confidence is ordered by layer. */
const C = Resolve.LAYER_CONFIDENCE;
ok(C.exact > C.normalized && C.normalized > C.folded && C.folded > C.face && C.face > C.alias && C.alias > Resolve.DEFAULTS.accept, "exact over normalized over folded over face over alias, all above a fuzzy accept");

/* 5. The rules a big store cannot show on demand, on small synthetic ones. */
const tiny = Resolve.createResolver([{name: "Testament Alpha"}, {name: "Testament Alpho"}, {name: "Ur-Drago"}, {name: "Ur-Dragon Lord"}, {name: "Shock"}, {name: "Shock Troops"}, {name: "Fire // Ice"}, {name: "Frost // Ice"}, {name: "The Great Henge"}, {name: "Great Henge Keeper"}],
  {aliases: [["Shock", "Shock Troops"], ["Zap!", "Shock"], ["Nobody", "A Card Not Here"]]});
const amb = tiny.resolve("1 Testament Alphx");
ok(amb.held && amb.candidates.length === 2 && amb.candidates[0].confidence === amb.candidates[1].confidence && /pick one/.test(amb.says), `two names a hair apart are both offered, neither taken (${amb.says})`);
const guard = tiny.resolve("1 Ur-Dragon");
ok(guard.held && guard.candidates.some((c) => c.name === "Ur-Drago") && guard.candidates.some((c) => c.name === "Ur-Dragon Lord") && /could be/.test(guard.says), `one letter from one card and a whole word of another is held (${guard.says})`);
eq(tiny.resolve("1 Shock").resolved, "Shock", "a flavor name never shadows a real name");
eq(tiny.resolve("1 Zap!").resolved, "Shock", "while a flavor name of its own resolves");
eq(tiny.maps.alias.has("nobody"), false, "an alias of a card the store lacks is not indexed");
const ice = tiny.resolve("Ice");
ok(ice.held && ice.candidates.length === 2 && ice.layer === "face", "a face two cards share is a question, not an answer");
eq(tiny.resolve("Great Henge").resolved, "The Great Henge", "the dropped article is forgiven");
eq(tiny.resolve("1 ").layer, "unreadable", "a line with no name is unreadable, not unknown");
eq(Resolve.fold("Æther Vial’s “Lim-Dûl”"), "aether vials lim-dul".replace("-", " "), "fold: ligature, curly quotes, accents, apostrophes dropped, punctuation spaced");

/* 6. A pasted list: headers and blank lines skipped, every card line answered. */
const many = r.resolveMany("Commander (1)\n1 Krenko, Mob Boss\n\n// Deck\n23 Mountain\n1 Skirk Prospector\n1 Thassas Oracle\nSideboard\n1 Shok\n");
eq(many.map((x) => x.layer), ["exact", "exact", "exact", "folded", "held"], "five card lines, headers and the blank line skipped");
eq(many.map((x) => x.quantity), [1, 23, 1, 1, 1], "quantities in order");
const rows = r.resolveMany([{name: "Sol Ring", quantity: 1, set: "LTC", collector: "292"}, {name: "Cylonic Rift", quantity: 1}]);
eq(rows.map((x) => [x.resolved, x.layer, x.set]), [["Sol Ring", "exact", "LTC"], ["Cyclonic Rift", "fuzzy", null]], "already-parsed rows resolve the same way");

/* 7. The client layers: a printing confirms or outranks, Scryfall's fuzzy name rescues a held row, failures leave rows as they were. */
const stub = {
  calls: [],
  async bySetNumber(set, number) {
    this.calls.push(`${set}/${number}`);
    if (set === "LTC" && number === "292") return {name: "Sol Ring", set: "ltc"};
    if (set === "CMM" && number === "1") return {name: "Cyclonic Rift", set: "cmm"};
    if (set === "XXX" && number === "9") return {name: "Counterspell", set: "xxx"};
    if (set === "BAD") throw new Error("404");
    return null;
  },
  async named(name) {
    this.calls.push(`named:${name}`);
    if (/Sl Rng/.test(name)) return {name: "Sol Ring"};
    if (/Anillo/.test(name)) return {name: "Sol Ring"};
    throw new Error("404");
  }
};
const before = r.resolveMany(["1 Sol Ring (LTC) 292", "1 Cylonic Rfit (CMM) 1", "1 Lightning Bolt (XXX) 9", "1 Sl Rng", "1 Anillo Solar", "1 Pizza Delivery Dragon", "1 Shock (BAD) 1"]);
ok(before[1].held || before[1].layer === "fuzzy", "the second line is a guess or a hold before the client");
const after = await r.withClient(before, stub);
eq([after[0].layer, after[0].confidence, after[0].resolved], ["printing", 1, "Sol Ring"], "name and printing agree: the printing layer at confidence 1");
eq([after[1].layer, after[1].resolved], ["printing", "Cyclonic Rift"], "a printing outranks a fuzzy guess or a hold");
ok(after[1].card && after[1].card.name === "Cyclonic Rift" && after[1].card.id, "and the store's own card is carried, not the client's object");
ok(after[2].held && after[2].candidates.map((c) => c.name).sort().join("|") === "Counterspell|Lightning Bolt" && /pick one/.test(after[2].says), `an exact name whose printing is another card is held with both (${after[2].says})`);
eq([after[3].layer, after[3].resolved], ["scryfall", "Sol Ring"], "Scryfall's fuzzy name rescues a held misspelling");
ok(after[3].confidence >= Resolve.DEFAULTS.hold && after[3].confidence < 1, `with the similarity of what came back as its confidence (${after[3].confidence})`);
ok(after[4].held && after[4].candidates[0].name === "Sol Ring", "a foreign name Scryfall answers with a dissimilar English name stays held, the answer offered first");
ok(after[5].held && after[5].layer === "held", "a name Scryfall refuses stays held as it was");
ok(after[6].layer === "exact" && /lookup failed/.test(after[6].says), "a failed printing lookup leaves the row and says so");
ok(!stub.calls.includes("named:Sol Ring") && stub.calls.filter((c) => /^named:/.test(c)).length === 3, `the client is asked only about held rows (${stub.calls.join(", ")})`);
const none = await r.withClient(before, null);
eq(none.map((x) => x.layer), before.map((x) => x.layer), "no client, no change");

/* 8. Without relate the module still loads in a browser-like root. */
const source = await readFile(new URL("../card-resolve.js", import.meta.url), "utf8");
const root = {MtgLineupModel: require("../lineup-model.js"), MtgDeckImport: require("../deck-import.js")};
new Function("globalThis", "window", "self", "module", "require", source)(root, root, root, undefined, undefined);
ok(root.CrankResolve && typeof root.CrankResolve.createResolver === "function", "the UMD wrapper lands on the browser root as CrankResolve");

console.log(`card-resolve: ${checks} checks passed — two hundred lines, zero wrong accepts, the layers in order, the guards, the client layers.`);
