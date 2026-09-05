// The three shopping lists, checked against what each is for.
//
// These are print and paste targets, so the assertions are about the things that
// go wrong on paper and in somebody else's text box: a card that falls between
// two price bands and off the sheet, a heading with nothing under it, a name a
// vendor's matcher will not recognise.
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Export = require("../shop-export.js");

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

const rows = [
  {name: "Sol Ring", color: "Colorless", type: "Artifact", price: 1.35, need: 1, ordered: 0, inHand: 0, quantity: 1, deckNames: ["Krenko"]},
  {name: "Blasphemous Act", color: "Red", type: "Sorcery", price: 6.00, need: 1, ordered: 0, inHand: 0, quantity: 1, deckNames: ["Krenko"]},
  {name: "Abrade", color: "Red", type: "Instant", price: 0.99, need: 2, ordered: 0, inHand: 0, quantity: 2, deckNames: ["Krenko"]},
  {name: "Anguished Unmaking", color: "Multicolor", type: "Instant", price: 1.00, need: 1, ordered: 0, inHand: 0, quantity: 1, deckNames: ["Felothar"]},
  {name: "Wasteland", color: "Colorless", type: "Land", price: 24.5, need: 1, ordered: 0, inHand: 0, quantity: 1, deckNames: ["Krenko"]},
  {name: "Mystery Card", color: "Colorless", type: "Artifact", price: null, need: 1, ordered: 0, inHand: 0, quantity: 1, deckNames: []},
  // ordered and in-hand cards are not "to buy"
  {name: "Jeska's Will", color: "Red", type: "Sorcery", price: 38.62, need: 0, ordered: 1, inHand: 0, quantity: 1, deckNames: ["Krenko"]},
  {name: "Lightning Bolt", color: "Red", type: "Instant", price: 2.10, need: 0, ordered: 3, inHand: 0, quantity: 3, deckNames: ["Krenko"]},
  {name: "Mountain", color: "Colorless", type: "Basic Land", price: 0.1, need: 0, ordered: 0, inHand: 23, quantity: 23, deckNames: ["Krenko"]},
  {name: "Arcane Signet", color: "Colorless", type: "Artifact", price: 0.9, need: 0, ordered: 0, inHand: 1, quantity: 1, deckNames: ["Atraxa", "Krenko"]}
];

/* ---------------- price bands ---------------- */

check("every price lands in exactly one band, including the boundaries", () => {
  // $1.00 and $6.00 are exactly where "under $1 / $1-6 / $6+" is ambiguous in
  // words. A card that matches no band would silently not print.
  const probes = [0, 0.01, 0.99, 1, 1.01, 5.99, 6, 6.01, 100];
  probes.forEach((p) => {
    const hits = Export.BANDS.filter((b) => b.test(p));
    assert.equal(hits.length, 1, `${p} matched ${hits.length} bands`);
  });
  assert.equal(Export.bandOf(6).key, "high", "$6.00 is in the top band");
  assert.equal(Export.bandOf(1).key, "mid", "$1.00 is not 'under $1'");
  assert.equal(Export.bandOf(0.99).key, "low");
});

check("an unpriced card still prints, and does not read as free", () => {
  assert.ok(Export.bandOf(null), "no price still gets a band");
  const groups = Export.toBuyGroups(rows);
  const all = groups.flatMap((g) => g.colors.flatMap((c) => c.cards));
  const mystery = all.find((c) => c.name === "Mystery Card");
  assert.ok(mystery, "an unpriced card is still on the sheet");
  assert.equal(mystery.price, "—", "shown as unknown, not as $0.00");
});

/* ---------------- To Buy ---------------- */

check("To Buy holds only what is owed", () => {
  const names = Export.toBuyGroups(rows).flatMap((g) => g.colors.flatMap((c) => c.cards.map((x) => x.name)));
  assert.ok(!names.includes("Jeska's Will"), "an ordered card is not still to buy");
  assert.ok(!names.includes("Mountain"), "a card in hand is not to buy");
  assert.ok(names.includes("Sol Ring"));
});

check("To Buy is grouped by band, then color, then A to Z", () => {
  const groups = Export.toBuyGroups(rows);
  assert.deepEqual(groups.map((g) => g.key), ["high", "mid", "low"],
    "expensive first: it is the part of the sheet worth finding");
  // WUBRG order, then the non-colors. Blasphemous Act is exactly $6.00 and so is
  // in the band above, which is why no Red appears here -- the boundary working.
  const mid = groups.find((g) => g.key === "mid");
  assert.deepEqual(mid.colors.map((c) => c.color), ["Multicolor", "Colorless"]);
  const high = groups.find((g) => g.key === "high");
  assert.deepEqual(high.colors.map((c) => c.color), ["Red", "Colorless"],
    "Blasphemous Act at $6.00 and Wasteland at $24.50");
  const low = groups.find((g) => g.key === "low");
  const red = low.colors.find((c) => c.color === "Red");
  assert.deepEqual(red.cards.map((c) => c.name), ["Abrade"]);
});

check("a band with nothing in it does not print a heading", () => {
  const onlyCheap = [{name: "Abrade", color: "Red", price: 0.5, need: 1, quantity: 1}];
  const groups = Export.toBuyGroups(onlyCheap);
  assert.deepEqual(groups.map((g) => g.key), ["low"], "empty bands are dropped, not left as bare headings");
});

check("the count on a band heading counts copies, not rows", () => {
  const low = Export.toBuyGroups(rows).find((g) => g.key === "low");
  // Abrade needs 2; a heading that said "1" would send you home a card short.
  assert.equal(low.count, low.colors.flatMap((c) => c.cards).reduce((n, c) => n + c.quantity, 0));
  const abrade = low.colors.flatMap((c) => c.cards).find((c) => c.name === "Abrade");
  assert.equal(abrade.quantity, 2);
});

/* ---------------- Order ---------------- */

check("the Order file is exactly what TCGplayer Mass Entry accepts", () => {
  const text = Export.orderText(rows);
  const lines = text.split("\n");
  assert.deepEqual(lines, ["1 Jeska's Will", "3 Lightning Bolt"]);
  lines.forEach((line) => {
    assert.match(line, /^\d+ \S/, "quantity first, then the name");
    assert.ok(!/[$]/.test(line), "no prices: the box is a matcher, not a form");
    assert.ok(!/\(|\[/.test(line), "no set codes");
  });
  assert.ok(!/\n\n/.test(text), "no blank lines to break the paste");
});

check("Order carries only ordered cards", () => {
  assert.equal(Export.orderText(rows).includes("Sol Ring"), false, "a card still to buy is not ordered");
  assert.equal(Export.orderText([]), "", "nothing ordered is an empty file, not a broken one");
});

/* ---------------- In hand ---------------- */

check("In hand is one flat list with the deck, sorted by deck then name", () => {
  const list = Export.inHandRows(rows);
  assert.deepEqual(list.map((r) => r.name), ["Arcane Signet", "Mountain"]);
  assert.equal(list[0].deck, "Atraxa, Krenko", "a card in two decks names both");
  assert.equal(list[0].type, "Artifact");
  assert.equal(list[1].color, "Colorless");
});

/* ---------------- the printed sheets ---------------- */

check("the print sheets are two columns and keep headings with their cards", () => {
  const html = Export.toBuyHtml(rows);
  assert.match(html, /column-count:\s*2/, "two columns is the whole reason it is printable");
  assert.match(html, /\.grp \{ break-inside: avoid-column/, "a color group is never split across a column break");
  assert.match(html, /section \{ break-inside: auto/,
    "a band may flow across the break, or a long band wastes half the page");
  assert.match(html, /break-after:\s*avoid/, "a heading is never orphaned at the foot of a column");
  assert.match(html, /@page/, "page size and margins are set for the printer");
  assert.match(html, /window\.print\(\)/, "the tab opens ready to print");
});

check("the sheets escape card names rather than injecting them", () => {
  const nasty = [{name: '<script>alert(1)</script>', color: "Red", price: 2, need: 1, quantity: 1}];
  const html = Export.toBuyHtml(nasty);
  assert.ok(!html.includes("<script>alert(1)</script>"), "a card name is text, never markup");
  assert.ok(html.includes("&lt;script&gt;"));
});

check("an empty list prints a sheet that says so, not a blank page", () => {
  const html = Export.toBuyHtml([]);
  assert.match(html, /Nothing outstanding/);
  assert.match(Export.inHandHtml([]), /Nothing marked as in hand/);
});

/* ---------------- picking which files to build ---------------- */

check("any combination of the three can be asked for", () => {
  assert.deepEqual(Export.build(rows, {}).map((f) => f.id), []);
  assert.deepEqual(Export.build(rows, {order: true}).map((f) => f.id), ["order"]);
  const all = Export.build(rows, {toBuy: true, order: true, inHand: true});
  assert.deepEqual(all.map((f) => f.id), ["toBuy", "order", "inHand"]);
  all.forEach((f) => {
    assert.ok(f.filename && f.mime && typeof f.content === "string",
      `${f.id} is missing something a download needs`);
  });
});

check("the Order file carries its instructions with it", () => {
  const [order] = Export.build(rows, {order: true});
  assert.match(order.note, /massentry/i, "the user is told where the file goes");
  assert.equal(order.mime, "text/plain;charset=utf-8");
  assert.match(order.filename, /\.txt$/);
});

console.log(`shop-export: ${checks} checks passed · ` +
  `to buy ${Export.toBuyGroups(rows).reduce((n, g) => n + g.count, 0)} copies in ` +
  `${Export.toBuyGroups(rows).length} bands · order ${Export.orderText(rows).split("\n").filter(Boolean).length} lines · ` +
  `in hand ${Export.inHandRows(rows).length} rows`);
