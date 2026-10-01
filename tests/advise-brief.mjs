/* THE DECK ADVISOR'S BRIEF (AI-4; advise-brief.js) on Rob's committed library.
 *
 *   Shape      a deck's parameters, its measured roles (weakest first) and curve, the hundred with each card's roles,
 *              state, price and rank, the candidates, the constraints; the same role counts the role lens reads.
 *   Candidates found by code: at most thirty, inside the commander's identity, none already counted, owned or on the
 *              person's lists unless not-owned is asked for, within the per-card cap unless owned; a card filling a
 *              short role before one that fills none.
 *   Box        the eval's reading: what is physically in the box, the substitutes holding their seats, and the seats'
 *              own cards among the candidates (Negate in D2's box, holding Mystic Snake's seat).
 *   Hidden     never a price paid, an address, a lot's or a card's record id.
 *   Grounding  an answer's change is shown only when its card out is in the hundred and not kept and its card in is a
 *              candidate; everything else is refused as ungrounded.
 *   Eval       the rubric is the library's own intent (122 substitutes and the seats they hold); the committed
 *              tests/ai-advise-eval/rubric.json is that rubric; a score counts sound, near and refused swaps; the
 *              runner spends nothing unless asked with --yes and a key.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";

const require = createRequire(import.meta.url);
const B = require(path.join(ROOT, "advise-brief.js"));
const Lens = require(path.join(ROOT, "crankmagic-lens.js"));
const M = require(path.join(ROOT, "collection-model.js"));
const Catalog = require(path.join(ROOT, "card-catalog.js"));
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };

const live = JSON.parse(readFileSync(path.join(ROOT, "data/live-state.json"), "utf8"));
const state = M.migrate(live.payload.state || live.payload);
const records = JSON.parse(readFileSync(path.join(ROOT, "data/cards.json"), "utf8")).cards;
const byName = new Map(records.map((c) => [Catalog.folded(c.name), c]));
const cardOf = (id) => { const ref = state.cards[id]; if (!ref) return null; const rec = byName.get(Catalog.folded(ref.name)); return rec ? {...rec, ...ref, id, roles: rec.roles || []} : {...ref, roles: []}; };
const deckNamed = (word) => state.decks.find((d) => d.name.includes(word));
const D6 = deckNamed("Krenko"), D2 = deckNamed("Chulane"), D1 = deckNamed("Quintorius");

/* SHAPE, the list reading (the product's). */
const brief = B.buildBrief({state, deckId: D6.id, cardOf, ask: "more removal"});
eq([brief.schema, brief.basis, brief.deck.name, brief.deck.commanders, brief.deck.identity], ["CrankAdviseBrief@1", "list", D6.name, ["Krenko, Mob Boss"], ["R"]], "the brief names the deck, its commander and its identity");
eq(brief.deck.bracket, {base: D6.definition.baseBracket, ceiling: D6.definition.bracketCeiling}, "and its bracket, from the deck's definition");
eq(brief.hundred.reduce((n, r) => n + r.quantity, 0), 100, "the hundred is the deck's list, a hundred copies");
ok(brief.hundred.every((r) => typeof r.name === "string" && Array.isArray(r.roles) && /^(In the box|Owned, not in the box|Ordered|To buy|Not in the box yet; .+ holds the seat)$/.test(r.state)), "each card with its roles and where its copy is, in the library's own words");
const shortest = brief.measure.roles[0];
ok(brief.measure.roles.every((r, i, a) => i === 0 || a[i - 1].short >= r.short), `the roles are counted weakest first (${shortest.role} ${shortest.count} of ${shortest.min})`);
const removal = brief.measure.roles.find((r) => r.role === "Removal"), lensRemoval = Lens.lens(state, D6, "Removal", {cardOf}).count;
eq(removal.count, lensRemoval, `and the counts are the role lens's (Removal ${removal.count})`);
ok(Object.values(brief.measure.curve).reduce((n, x) => n + x, 0) + brief.measure.lands === 100, "the curve and the lands add to the hundred");
eq(brief.constraints.keep[0], "Krenko, Mob Boss", "the commander may not leave");
eq(brief.constraints.ask, "more removal", "and the person's ask travels with it, bounded");

/* CANDIDATES. */
const inHundred = new Set(brief.hundred.map((r) => r.name));
ok(brief.candidates.length > 0 && brief.candidates.length <= B.LIMIT, `at most ${B.LIMIT} candidates (${brief.candidates.length})`);
ok(brief.candidates.every((c) => !inHundred.has(c.name)), "none already in the hundred");
ok(brief.candidates.every((c) => ((byName.get(Catalog.folded(c.name)) || {}).colorIdentity || []).every((x) => x === "R")), "all inside the commander's identity");
ok(brief.candidates.every((c) => c.source && !/Not owned/.test(c.source)), "owned or on the person's lists only, unless not-owned is asked for");
ok(brief.candidates.every((c, i, a) => i === 0 || a[i - 1].fills.length >= c.fills.length), "a card filling a short role comes before one that fills none");
{
  const oracle = (records.find((c) => c.name === "Krenko, Mob Boss") || {}).oracleId, stranger = records.find((c) => (c.colorIdentity || []).join("") === "R" && (c.roles || []).includes("removal") && c.price > 1 && !Object.values(state.cards).some((x) => x.name === c.name));
  const coPlay = (oid) => (oid === oracle ? new Map([[stranger.oracleId, {inclusion: 0.9, synergy: 0.5, decks: 1000}]]) : null);
  const wide = B.buildBrief({state, deckId: D6.id, cardOf, coPlay, byOracle: (oid) => (oid === stranger.oracleId ? {...stranger, id: Catalog.key(stranger.name)} : null), allowUnowned: true});
  const hit = wide.candidates.find((c) => c.name === stranger.name);
  ok(hit && hit.source === "Not owned" && hit.coPlay === 0.9, `asked, a co-play neighbor not owned is a candidate (${stranger.name})`);
  const capped = B.buildBrief({state: {...state, decks: state.decks.map((d) => (d.id === D6.id ? {...d, definition: {...d.definition, perCardCap: 0.5}} : d))}, deckId: D6.id, cardOf,
    coPlay, byOracle: (oid) => (oid === stranger.oracleId ? {...stranger, id: Catalog.key(stranger.name)} : null), allowUnowned: true});
  ok(capped.candidates.every((c) => c.owned || c.price === null || c.price <= 0.5) && !capped.candidates.some((c) => c.name === stranger.name),
    `a card over the per-card cap is offered only if it is already owned (${stranger.name} at $${stranger.price} is not, under a $0.50 cap)`);
}

/* HIDDEN: nothing the model should not see. */
{
  const text = JSON.stringify(brief);
  ok(!/"paid"|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]|"lot:|"card:|"deck:|"slot:/.test(text), "never a price paid, an address, or a lot's, card's, deck's or slot's record id");
}

/* THE BOX READING (the eval's). */
{
  const box = B.buildBrief({state, deckId: D2.id, cardOf, basis: "box"});
  const standIns = state.lots.filter((l) => l.standInFor && l.location && l.location.deckId === D2.id);
  const subs = box.hundred.filter((r) => /^Substitute, holding/.test(r.state));
  eq(subs.reduce((n, r) => n + r.quantity, 0), standIns.reduce((n, l) => n + l.quantity, 0), `the box holds its substitutes, each named with the seat it holds (${subs.length})`);
  ok(subs.some((r) => r.name === "Negate" && r.holds === "Mystic Snake") && box.candidates.some((c) => c.name === "Mystic Snake"), "Negate is in D2's box holding Mystic Snake's seat, and Mystic Snake is a candidate");
  const seatCards = new Set(box.hundred.filter((r) => r.holds).map((r) => r.holds)), offered = new Set(box.candidates.map((c) => c.name));
  ok([...seatCards].every((n) => offered.has(n)) && box.candidates.every((c) => !("seat" in c) && !/seat|target|list/i.test(c.source)), `every seat's own card is among the candidates, past the limit if need be (${box.candidates.length}), and none is marked as the answer`);
  const inBox = state.lots.filter((l) => l.source === "owned" && l.location && l.location.kind === "deck" && l.location.deckId === D2.id).reduce((n, l) => n + l.quantity, 0);
  eq(box.hundred.filter((r) => !r.empty).reduce((n, r) => n + r.quantity, 0), inBox, `the box reading counts what is physically there (${inBox} copies), and the empty seats apart`);
}

{
  const all = state.decks.map((d) => {const b = B.buildBrief({state, deckId: d.id, cardOf, basis: "box"}), off = new Set(b.candidates.map((c) => c.name)); return b.hundred.filter((r) => r.holds).every((r) => off.has(r.holds));});
  ok(all.every(Boolean), "in all seven decks, every substitute's seat card is offered: the eval's answers are always in the brief");
}

/* GROUNDING. */
{
  const box = B.buildBrief({state, deckId: D2.id, cardOf, basis: "box"});
  const checked = B.checkAnswer(box, {changes: [{out: "Negate", in: "Mystic Snake", role: "Protection", why: "Counters and brings a body."},
    {out: "Negate", in: "Black Lotus", role: "Ramp", why: "Invented."}, {out: box.deck.commanders[0], in: "Mystic Snake", role: "x", why: "The commander may not leave."},
    {out: "Island Of Nowhere", in: "Mystic Snake", role: "x", why: "Not in the hundred."}], keep: [], summary: "One swap."});
  eq([checked.changes.map((c) => c.out + " -> " + c.in), checked.ungrounded.length, checked.ok], [["Negate -> Mystic Snake"], 3, false], "a change is shown only when grounded: invented cards, the commander and a card not in the hundred are refused");
}

/* THE EVAL: the rubric is the library's own intent, and the committed one is it. */
{
  const rubric = B.rubricOf(state, cardOf);
  eq(Object.values(rubric).reduce((n, d) => n + d.sound.length, 0), state.lots.filter((l) => l.standInFor).length, "the rubric's sound swaps are the library's substitutes and the seats they hold");
  ok(rubric[D2.id].sound.some((s) => s.out === "Negate" && s.in === "Mystic Snake"), "Rob's example among them");
  eq(JSON.parse(readFileSync(path.join(ROOT, "tests/ai-advise-eval/rubric.json"), "utf8")).decks, rubric, "tests/ai-advise-eval/rubric.json is that rubric (node tests/ai-advise-eval/make-rubric.mjs rewrites it)");
  const r2 = {...rubric[D2.id], refuse: [{out: "Negate", in: "Counterspell"}]};
  const got = B.score(r2, {changes: [{out: "Negate", in: "Mystic Snake"}, {out: "Negate", in: "Counterspell"}, {out: "Other", in: r2.sound[1].in}], ungrounded: [1]});
  eq(got, {hits: 1, near: 1, refused: 1, ungrounded: 1, proposed: 3, possible: r2.sound.length}, "a score counts the sound swaps, the near ones, the refused ones and the ungrounded");
  const run = spawnSync(process.execPath, [path.join(ROOT, "tests/ai-advise-eval/run.mjs")], {encoding: "utf8", env: {...process.env, ANTHROPIC_API_KEY: ""}});
  ok(run.status === 2 && /--yes/.test(run.stderr), "and the eval runner spends nothing unless asked: without --yes and a key it says so and stops");
}

console.log(`advise-brief: ${checks} checks passed — the advisor's brief built by code from the library, grounded answers only, and an eval that starts from Rob's own intent.`);
