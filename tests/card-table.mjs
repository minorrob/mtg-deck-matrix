// The shared table: filtering, faceted counting, sorting, banding.
//
// Three lists are drawn with it -- the bench, the upgrades and (through the same rules)
// the Shop -- and every one of them is a list somebody reads to decide what to buy. The
// failures that matter here are quiet ones: a count that promises rows a click does not
// produce, a sort that reorders ties differently on each render so a row moves under a
// finger, a band that double-counts a card belonging to two decks so the numbers above
// the list add up to more cards than the list holds.
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const T = require("../card-table.js");

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; console.log("  ok  " + label); };

const ROWS = [
  {name: "Sol Ring",    color: "Colorless",  rarity: "Uncommon", price: 1.5,  copies: 2, decks: ["Atraxa", "Krenko"]},
  {name: "Anger",       color: "Red",        rarity: "Rare",     price: 0.8,  copies: 1, decks: ["Krenko"]},
  {name: "Forest",      color: "Lands",      rarity: "Common",   price: 0.1,  copies: 40, decks: []},
  {name: "Rhystic Study", color: "Blue",     rarity: "Rare",     price: 32.0, copies: 1, decks: ["Atraxa"]},
  {name: "Anguished Unmaking", color: "Multicolor", rarity: "Rare", price: null, copies: 1, decks: []}
];
const FACETS = [
  {key: "color", label: "Color"},
  {key: "rarity", label: "Rarity"},
  {key: "deck", label: "Deck", of: (r) => (r.decks.length ? r.decks : ["Not in any deck"])}
];
const COLUMNS = [
  {key: "name", label: "Card"},
  {key: "rarity", label: "Rarity"},
  {key: "price", label: "Price", numeric: true, value: (r) => (r.price == null ? -1 : r.price)}
];

check("a facet with no choice made lets everything through", () => {
  assert.equal(T.filter(ROWS, FACETS, {}).length, ROWS.length);
  assert.equal(T.filter(ROWS, FACETS, {rarity: []}).length, ROWS.length,
    "an empty array means nothing was chosen, not that nothing matches");
});

check("a row belonging to several buckets answers a filter naming any of them", () => {
  const only = T.filter(ROWS, FACETS, {deck: ["Krenko"]}).map((r) => r.name);
  assert.deepEqual(only.sort(), ["Anger", "Sol Ring"]);
});

check("`of` decides what a facet sees, so a row with no value gets its own bucket", () => {
  const none = T.filter(ROWS, FACETS, {deck: ["Not in any deck"]}).map((r) => r.name);
  assert.deepEqual(none.sort(), ["Anguished Unmaking", "Forest"]);
});

check("counts are computed against the OTHER axes, so a count never lies", () => {
  // The naive count -- how many VISIBLE rows carry this value -- reads zero for every
  // option you have not picked the moment you pick one, which makes a multi-select look
  // broken. Each axis is counted against the rest, so the number means "click this and
  // you get that many".
  const chosen = {rarity: ["Rare"]};
  const byColor = T.counts(ROWS, FACETS, chosen, FACETS[0]);
  assert.equal(byColor.get("Red"), 1, "Anger is red and rare");
  assert.equal(byColor.get("Blue"), 1, "Rhystic Study is blue and rare");
  assert.equal(byColor.get("Lands"), undefined, "no rare land in this set");
  // The rarity axis itself is counted with its own choice ignored, so the options you
  // did not pick still show what picking them would give you.
  const byRarity = T.counts(ROWS, FACETS, chosen, FACETS[1]);
  assert.equal(byRarity.get("Common"), 1, "Common is still reachable from here");
  assert.equal(byRarity.get("Rare"), 3);
});

check("every count matches the rows that click would actually produce", () => {
  for (const facet of FACETS) {
    const tally = T.counts(ROWS, FACETS, {}, facet);
    for (const [value, n] of tally) {
      const got = T.filter(ROWS, FACETS, {[facet.key]: [value]}).length;
      assert.equal(got, n, `${facet.key}=${value} promised ${n} and gives ${got}`);
    }
  }
});

check("unknown numbers sort below every real figure, not above", () => {
  // A card nobody has a price for is unknown, not free. Ascending puts it first
  // because that is what -1 means; descending must not float it to the top.
  const desc = T.sortRows(ROWS, COLUMNS, "price", "desc").map((r) => r.name);
  assert.equal(desc[0], "Rhystic Study");
  assert.equal(desc[desc.length - 1], "Anguished Unmaking");
});

check("ties break on name, so the order is stable between renders", () => {
  const tied = [
    {name: "Beta", rarity: "Rare", price: 1},
    {name: "Alpha", rarity: "Rare", price: 1},
    {name: "Gamma", rarity: "Rare", price: 1}
  ];
  assert.deepEqual(T.sortRows(tied, COLUMNS, "price", "asc").map((r) => r.name), ["Alpha", "Beta", "Gamma"]);
  assert.deepEqual(T.sortRows(tied, COLUMNS, "price", "desc").map((r) => r.name), ["Alpha", "Beta", "Gamma"],
    "a descending sort of equal values is still the same order, not the reverse of it");
});

check("sorting never mutates what it was handed", () => {
  const before = ROWS.map((r) => r.name);
  T.sortRows(ROWS, COLUMNS, "price", "desc");
  assert.deepEqual(ROWS.map((r) => r.name), before);
});

check("a row lands in exactly one band, however many buckets it belongs to", () => {
  const group = {key: "deck", label: "Deck", of: (r) => r.decks, empty: "No deck"};
  const bands = T.groupRows(ROWS, group);
  const total = bands.reduce((n, b) => n + b[1].length, 0);
  assert.equal(total, ROWS.length,
    "Sol Ring is in two decks; counted twice the bands would hold more cards than the list");
  assert.equal(bands[bands.length - 1][0], "No deck", "the unknown bucket sorts last");
});

check("a declared order is honoured, and anything unlisted follows it", () => {
  const group = {key: "rarity", label: "Rarity", order: ["Mythic", "Rare", "Uncommon", "Common"]};
  assert.deepEqual(T.groupRows(ROWS, group).map((b) => b[0]), ["Rare", "Uncommon", "Common"]);
});

check("no grouping is one nameless band, so a caller never branches", () => {
  const [[label, rows]] = T.groupRows(ROWS, null);
  assert.equal(label, "");
  assert.equal(rows.length, ROWS.length);
});

check("toggling the last chosen value clears the key rather than leaving []", () => {
  // "[]" and "absent" would otherwise both mean "all", and only one of them
  // round-trips through storage.
  const on = T.toggle({}, "color", "Red");
  assert.deepEqual(on, {color: ["Red"]});
  assert.deepEqual(T.toggle(on, "color", "Red"), {});
  assert.deepEqual(on, {color: ["Red"]}, "toggle returns a new state, it does not edit one");
});

check("a header click flips its own column and restarts on a new one", () => {
  assert.deepEqual(T.nextSort({key: "price", dir: "asc"}, "price"), {key: "price", dir: "desc"});
  assert.deepEqual(T.nextSort({key: "price", dir: "desc"}, "price"), {key: "price", dir: "asc"});
  assert.deepEqual(T.nextSort({key: "price", dir: "desc"}, "name"), {key: "name", dir: "asc"});
  assert.deepEqual(T.nextSort({key: "name", dir: "asc"}, "price", "desc"), {key: "price", dir: "desc"},
    "a numeric column opens on the big end");
});

check("the header emits one cell per grid track, spacers included", () => {
  // The header and the rows share one grid template. A header short by the tick box
  // lands every label one column left of the data it describes, which is exactly what
  // it did before `before`/`after` existed.
  const html = T.head(COLUMNS, {key: "price", dir: "desc"}, {before: 1, after: 1});
  const cells = html.match(/class="ct-cell/g) || [];
  assert.equal(cells.length, COLUMNS.length + 2);
  assert.match(html, /aria-sort="descending"/);
  assert.equal((html.match(/aria-sort="none"/g) || []).length, COLUMNS.length - 1);
});

check("the filter bar only offers options that lead somewhere", () => {
  const html = T.filterBar(ROWS, FACETS, {rarity: ["Rare"], open: "color"}, {});
  assert.ok(html.includes('data-ct-value="Red"'), "reachable from here");
  assert.ok(!html.includes('data-ct-value="Lands"'), "no rare land, so no dead option");
  // A chosen value stays on the list even when the other axes have emptied it, or there
  // would be no way to un-choose it.
  const stuck = T.filterBar(ROWS, FACETS, {rarity: ["Common"], color: ["Red"], open: "color"}, {});
  assert.ok(stuck.includes('data-ct-value="Red"'), "the chosen value is always un-choosable");
});

check("everything the bar prints is escaped", () => {
  const nasty = [{name: '<img src=x onerror=alert(1)>', color: '"><script>', rarity: "Rare", price: 1, decks: []}];
  const html = T.filterBar(nasty, FACETS, {open: "color"}, {});
  assert.ok(!html.includes("<script>"), "a card name is data, not markup");
  assert.ok(html.includes("&quot;&gt;&lt;script&gt;"));
});

check("search looks where the caller says, not where this file guesses", () => {
  const rows = [{name: "Sol Ring", note: "artifact ramp"}, {name: "Anger", note: "haste"}];
  const facets = [];
  assert.equal(T.filter(rows, facets, {query: "ramp"}).length, 0, "by default only the name");
  assert.equal(T.filter(rows, facets, {query: "ramp", searchIn: ["name", "note"]}).length, 1);
});

console.log(`\ncard-table: ${checks} checks passed.`);
