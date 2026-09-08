/* TWO ROWS THAT DIFFER IN NOTHING ARE ONE ROW OF TWO.
 *
 * The roster is one record per copy lot, which is faithful to how cards are actually
 * acquired: a foil bought in March and a nonfoil bought in July are two different pieces
 * of cardboard with two different prices. But recording a second copy of something you
 * already own, identical in every field, drew two rows a reader could not tell apart --
 * and an interface that shows you the same line twice reads as broken however correct the
 * model underneath is.
 *
 * So acquire merges into an existing lot when nothing distinguishes them, and keeps them
 * apart the moment anything does. This pins both halves: the merge, and every reason not
 * to merge. The reasons matter more than the merge -- folding a copy that is reserved to
 * a deck slot into one that is not would silently move an allocation.
 *
 * It also covers the quantity command, which is what the table's editable count writes.
 * Lowering a count is a loss of copies, so it asks the same confirmation every other
 * shrinking change asks; a slot fed by that lot recomputes its shortfall from the lots,
 * which is why nothing else has to be told.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const M = require("../collection-model.js");

let checks = 0;
const ok = (label, fn) => {fn(); checks += 1; process.stdout.write(`  ok  ${label}\n`);};

const CARD = {id: "card:sol-ring", name: "Sol Ring", typeLine: "Artifact", manaCost: "{1}",
  oracleText: "", keywords: [], mechanics: [], colorIdentity: [], manaValue: 1, price: 2,
  rarity: "uncommon", legalities: {commander: "legal"}};

let seq = 0;
const start = () => M.empty();
const run = (state, type, body) => M.apply(state, {id: "op" + (seq += 1), type, ...body}).state;
const buy = (state, body = {}) => run(state, "acquire", {
  ...body,
  cards: [CARD],
  lot: {cardId: CARD.id, quantity: 1, source: "owned", printing: {}, location: {kind: "bench", box: ""},
    notes: "", paid: null, ...body.lot}});

ok("a second identical copy raises the count instead of adding a row", () => {
  let s = buy(start());
  s = buy(s);
  assert.equal(s.lots.length, 1, `two identical copies made ${s.lots.length} records`);
  assert.equal(s.lots[0].quantity, 2, "and the one record holds both");
});

ok("the receipt says what actually happened", () => {
  let s = buy(start());
  const out = M.apply(s, {id: "again", type: "acquire", cards: [CARD],
    lot: {cardId: CARD.id, quantity: 3, source: "owned", printing: {}, location: {kind: "bench", box: ""}, notes: "", paid: null}});
  assert.match(out.summary, /3 more owned Sol Ring/, "the summary must say it added to a record");
  assert.match(out.summary, /4 in that record now/, "and what the record holds now");
});

/* Each of these is a real difference between two pieces of cardboard, or between two
   claims about them. Merging any of them away loses something the reader put there. */
for (const [what, second] of [
  ["a different print", {lot: {printing: {set: "lea", collector: "1"}}}],
  ["a different source", {lot: {source: "ordered"}}],
  ["a different box", {lot: {location: {kind: "bench", box: "Blue tin"}}}],
  ["a different price", {lot: {paid: 4}}],
  ["a note of its own", {lot: {notes: "signed by the artist"}}],
]) {
  ok(`${what} stays its own record`, () => {
    let s = buy(start());
    s = buy(s, second);
    assert.equal(s.lots.length, 2, `${what} was folded into the first copy`);
  });
}

ok("a copy that is spoken for is never a merge target", () => {
  /* This is the one that would corrupt rather than annoy. A copy held for a pending deal,
     or reserved to a deck slot, is promised to someone; folding a loose copy into it
     promises a card nobody promised. Held is used here because it needs no deck to set up,
     and it is the same guard: sameCopy() requires offer "none" and no allocation. */
  let s = buy(start());
  s = run(s, "offer", {lotId: s.lots[0].id, quantity: 1, offer: "held", confirmed: true});
  assert.equal(s.lots[0].offer, "held");
  s = buy(s);
  assert.equal(s.lots.length, 2, "a loose copy was folded into one that is spoken for");
  assert.ok(s.lots.some((l) => l.offer === "none"), "and the loose copy must stay loose");
});

ok("the count can be set directly, up or down", () => {
  let s = buy(start(), {lot: {quantity: 4}});
  s = run(s, "quantity", {lotId: s.lots[0].id, quantity: 7});
  assert.equal(s.lots[0].quantity, 7, "raising a count must be a plain edit");
  s = run(s, "quantity", {lotId: s.lots[0].id, quantity: 2});
  assert.equal(s.lots[0].quantity, 2, "and so must lowering one, on a loose copy");
});

ok("lowering a count is refused on a copy something is counting on", () => {
  let s = buy(start(), {lot: {quantity: 4}});
  s = run(s, "offer", {lotId: s.lots[0].id, quantity: 4, offer: "held", confirmed: true});
  assert.throws(() => M.apply(s, {id: "cut", type: "quantity", lotId: s.lots[0].id, quantity: 1}),
    /Review and confirm/, "shrinking a spoken-for lot must ask, exactly as disposing of one does");
  /* Raising it never has to ask: nothing loses a copy. */
  const up = M.apply(s, {id: "up", type: "quantity", lotId: s.lots[0].id, quantity: 6}).state;
  assert.equal(up.lots[0].quantity, 6);
});

ok("a count is still a whole number of copies", () => {
  const s = buy(start());
  for (const bad of [0, -1, 2.5, "many"]) {
    assert.throws(() => M.apply(s, {id: "bad", type: "quantity", lotId: s.lots[0].id, quantity: bad}),
      /whole number/, `${bad} was accepted as a quantity`);
  }
});

ok("what you paid is a number or unknown, and nothing else", () => {
  let s = buy(start());
  s = run(s, "editLot", {lotId: s.lots[0].id, paid: 12.5});
  assert.equal(s.lots[0].paid, 12.5, "the table's Paid cell writes through editLot");
  s = run(s, "editLot", {lotId: s.lots[0].id, paid: null});
  assert.equal(s.lots[0].paid, null, "and clearing it says unknown rather than zero");
  assert.throws(() => M.apply(s, {id: "neg", type: "editLot", lotId: s.lots[0].id, paid: -1}),
    /nonnegative/, "a negative price is not a price");
});

ok("every state these produce is one the model will accept back", () => {
  let s = buy(start(), {lot: {quantity: 3, paid: 5}});
  s = buy(s);
  s = run(s, "quantity", {lotId: s.lots[0].id, quantity: 9});
  assert.doesNotThrow(() => M.validate(M.clone(s)));
});

console.log(`copy-merge: ${checks} checks passed — identical copies merge, every real ` +
  "difference keeps its own record, and a count is a number you can correct.");
