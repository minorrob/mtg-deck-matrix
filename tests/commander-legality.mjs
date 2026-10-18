/* Commander legality, held on a failing and a passing case for every rule.
 *
 * commander-legality.js (Linear ROB-104) says whether a hundred is a deck the format allows, and names the card, the
 * rule and the fix when it is not. The cases are tests/fixtures/commander-legality.json: D6 Krenko Goblins from the
 * committed live state as the base, mutated one rule at a time, with rows hydrated from the engine's oracle by name
 * so the shapes are the real ones. Each case pins the exact set of problem codes, so a rule that fires where it
 * should not fails here as surely as one that stays silent.
 *
 * The breaks: game/tools/batch/breaks-commander-legality.py.
 */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Legality = require("../commander-legality.js");
const oracle = Object.values(JSON.parse(await readFile(new URL("../data/engine/oracle.json", import.meta.url), "utf8")).cards);
const bannedFile = JSON.parse(await readFile(new URL("../data/commander-banned.json", import.meta.url), "utf8"));
const fixture = JSON.parse(await readFile(new URL("./fixtures/commander-legality.json", import.meta.url), "utf8"));
const byName = new Map(oracle.map((c) => [c.name, c]));

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

/* The base: D6's hundred as oracle rows, the commander among them. */
const backup = JSON.parse(await readFile(new URL("../data/live-state.json", import.meta.url), "utf8"));
const live = backup.payload.state || backup.payload;
const d6 = live.decks.find((d) => /Krenko/.test(d.name));
const baseCounts = new Map();
for (const s of d6.slots.filter((s) => s.purpose === "main")) { const n = live.cards[s.cardId].name; baseCounts.set(n, (baseCounts.get(n) || 0) + s.quantity); }
eq([...baseCounts.values()].reduce((a, b) => a + b, 0), 100, "the base is a hundred");
const row = (name) => { const c = byName.get(name); assert.ok(c, `${name} is in the oracle`); return c; };
const hydrate = (spec) => {
  if (typeof spec === "string") return {...row(spec), quantity: 1};
  if (Array.isArray(spec)) return {...row(spec[0]), quantity: spec[1]};
  if (spec.bare) return {name: spec.name, quantity: spec.quantity || 1};
  return byName.has(spec.name) ? {...row(spec.name), ...spec, quantity: spec.quantity || 1} : {quantity: 1, ...spec};
};

function build(c) {
  let cards = c.cards ? c.cards.map(hydrate) : [...baseCounts].map(([n, q]) => ({...row(n), quantity: q}));
  for (const n of c.remove || []) { const i = cards.findIndex((x) => x.name === n); assert.ok(i >= 0, `${c.id}: ${n} is in the list to remove`); cards.splice(i, 1); }
  for (const [old, next] of c.swap || []) { const i = cards.findIndex((x) => x.name === old); assert.ok(i >= 0, `${c.id}: ${old} is in the list to swap`); cards[i] = hydrate(next); }
  for (const spec of c.add || []) cards.push(hydrate(spec));
  for (const [n, q] of c.setQuantity || []) { const x = cards.find((y) => y.name === n); assert.ok(x, `${c.id}: ${n} is in the list`); x.quantity = q; }
  if (c.strip === "all") cards = cards.map((x) => ({name: x.name, quantity: x.quantity}));
  else if (Array.isArray(c.strip)) cards = cards.map((x) => { const y = {...x}; for (const f of c.strip) delete y[f]; return y; });
  /* The commanders: named by the case, or Krenko among the base hundred (lifted out by the function itself). */
  const commanders = c.commanders !== undefined ? c.commanders.map(hydrate) : c.cards ? [] : [row("Krenko, Mob Boss")];
  return {commanders, cards};
}

/* 1. Every case lands on exactly the codes it names. */
const results = new Map();
for (const c of fixture.cases) {
  const deck = build(c);
  const options = {banned: c.banned === false ? undefined : bannedFile.cards, bannedAt: c.banned === false ? undefined : bannedFile.generatedAt, strict: !!c.strict};
  const r = Legality.check(deck, options);
  results.set(c.id, r);
  const codes = [...new Set(r.problems.map((p) => p.code))].sort();
  eq(codes, [...c.expect].sort(), `${c.id} (${c.rule}): codes ${JSON.stringify(codes)}, problems ${JSON.stringify(r.problems.map((p) => `${p.card}: ${p.rule}`))}`);
  eq(r.legal, c.expect.length === 0, `${c.id}: legal is the absence of problems`);
  if (c.expectCard) ok(r.problems.some((p) => p.card === c.expectCard), `${c.id}: the problem names ${c.expectCard}`);
  ok(r.problems.every((p) => p.card && /\S/.test(p.rule) && /\S/.test(p.fix) && /[.!]$/.test(p.rule) && /[.!]$/.test(p.fix)), `${c.id}: every problem names a card, a rule and a fix, as sentences`);
}
ok(fixture.cases.length >= 40, `${fixture.cases.length} cases`);
for (const rule of ["size", "commander", "eligible", "pair", "banned", "not-legal", "identity", "singleton", "unverified"]) {
  const failing = fixture.cases.filter((c) => c.rule === rule && c.expect.includes(rule)), passing = fixture.cases.filter((c) => c.rule === rule && !c.expect.length);
  ok(failing.length >= 1 && passing.length >= 1, `${rule}: ${failing.length} failing and ${passing.length} passing case${passing.length === 1 ? "" : "s"}`);
}

/* 2. What the words say. */
const outside = results.get("outside-the-colors").problems[0];
eq(outside.rule, "Counterspell is blue; the commander is red.", "the identity rule names both colors");
eq(outside.fix, "Replace it with a card inside the commander's color identity.", "and the fix is an instruction");
const short = results.get("ninety-nine").problems[0];
ok(/99/.test(short.rule) && short.fix === "Add 1 card.", `size says how many and what to do (${short.fix})`);
const dupes = results.get("two-copies").problems[0];
ok(/2 copies of Lightning Bolt/.test(dupes.rule) && /Keep one Lightning Bolt/.test(dupes.fix), `singleton names the count and the keep (${dupes.fix})`);
const dwarves = results.get("eight-dwarves").problems[0];
ok(/allows 7/.test(dwarves.rule) && dwarves.fix === "Keep 7.", `a card with its own copy limit is held to it (${dwarves.rule})`);
const banned = results.get("banned-by-name").problems[0];
ok(new RegExp(`list dated ${bannedFile.generatedAt.slice(0, 10)}`).test(banned.rule), `the banned rule carries the list's date (${banned.rule})`);
eq(results.get("banned-by-name").facts.bannedAt, bannedFile.generatedAt, "and the facts repeat it");
ok(bannedFile.cards.length >= 60 && bannedFile.cards.includes("Mana Crypt") && bannedFile.cards.includes("Black Lotus"), `the committed banned list is the real one (${bannedFile.cards.length} names)`);
const pair = results.get("partner-with-someone-else").problems[0];
ok(/partners only with Toothy, Imaginary Friend/.test(pair.rule), `a Partner with card names who it partners with (${pair.rule})`);
const bg = results.get("background-alone").problems[0];
ok(/Background is not a commander on its own/.test(bg.rule), "a Background alone is said in words");
ok(results.get("nothing-to-check").notes.some((n) => /identity was not checked/.test(n)) && results.get("nothing-to-check").facts.identityChecked === 0, "bare names: the note says identity was not checked");
ok(results.get("banned-list-not-supplied").notes.some((n) => /No banned list/.test(n)), "no list: the note says banned cards were not checked");
ok(results.get("unverified-is-a-note").notes.some((n) => /Goblin Guide/.test(n)) && results.get("unverified-is-a-note").facts.unverified === 1, "an unverified card is named in a note and counted");
ok(results.get("companion-is-noted").notes.some((n) => /Jegantha.*companion/.test(n)), "a companion in the ninety-nine is noted");
eq(results.get("partners-widen-the-identity").facts.identity, ["B", "R", "U"], "two partners' identities are joined");
eq(results.get("everything-at-once").problems.map((p) => p.code), ["size", "banned", "identity", "singleton"], "problems come in rule order, size first");

/* 3. The helpers. */
const N = Legality.normalize;
eq(Legality.deriveIdentity(N({name: "x", mana: "{1}{G/W}{G/W}"})), ["G", "W"], "hybrid derives both colors");
eq(Legality.deriveIdentity(N({name: "x", mana: "{1}{B/P}{B/P}"})), ["B"], "Phyrexian derives its color, not P");
eq(Legality.deriveIdentity(N({name: "x", mana: "{2}", text: "{T}: Add {R}. (Reminder {U} text.)"})), ["R"], "rules text counts, reminder text does not");
eq(Legality.deriveIdentity(N({name: "x", type: "Land — Island Swamp"})), ["U", "B"], "basic land types count");
eq(Legality.identityOf(N({name: "x", mana: "{G}", colorIdentity: []})), [], "a given identity wins over the cost, even when empty");
eq([Legality.maxCopies(N({name: "Mountain", type: "Basic Land — Mountain"})), Legality.maxCopies(N({name: "Sol Ring", type: "Artifact"}))], [Infinity, 1], "basics repeat, a rock does not");
eq(Legality.commanderLegality([{name: "Mountain", quantity: 99}], [row("Krenko, Mob Boss")], {banned: bannedFile.cards}).legal, true, "the issue's signature: list, commanders, options");
ok(Legality.check({commanders: [row("Krenko, Mob Boss")], cards: [{name: "Krenko, Mob Boss"}, {name: "Mountain", quantity: 99}]}).legal, "a commander repeated in the hundred is lifted out once");
eq(Legality.check(null).problems.map((p) => p.code), ["size", "commander"], "nothing at all: two problems, no crash");
eq(Legality.check({commanders: [row("Krenko, Mob Boss")], cards: [{name: "Mountain", quantity: 98}, {name: "Mountain", quantity: 1}]}).legal, true, "rows of one basic merge into one legal count");

/* 4. The browser root. */
const source = await readFile(new URL("../commander-legality.js", import.meta.url), "utf8");
const root = {};
new Function("globalThis", "window", "self", "module", source)(root, root, root, undefined);
ok(root.CrankLegality && typeof root.CrankLegality.check === "function", "the UMD wrapper lands on the browser root as CrankLegality");

console.log(`commander-legality: ${checks} checks passed — ${fixture.cases.length} cases, every rule failing and passing, the words, the helpers.`);
