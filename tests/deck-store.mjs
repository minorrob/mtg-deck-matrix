// Imported decks joining the six, checked where the joins actually break.
//
// The merge is the risky part: it widens a catalog every other view reads, and a
// mistake there does not throw -- it quietly gives D1 a card it does not play, or
// leaves an imported deck's Sol Ring counted against somebody else's box. So the
// assertions here are mostly about isolation: what the six decks look like before
// a merge is what they look like after one.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Store = require("../deck-store.js");
const Import = require("../deck-import.js");

const load = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
const master = await load("../data/master-v2.json");
const paste = await readFile(new URL("./fixtures/moxfield-mono-red.txt", import.meta.url), "utf8");

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

/* ---------------- a real import, resolved against the app's own catalog ---------------- */

const parsed = Import.parseDecklist(paste);
const index = Import.buildIndex(master.cards.map((c) => ({
  name: c.name, type: c.type, mv: c.mv, price: c.price, ci: c.color
})));
const resolved = Import.resolveDeck(parsed, index, {source: "paste", name: "Mono-red test"});
const record = Store.toRecord(resolved, {id: Store.nextId([]), label: "Mono-red test"});

check("an id is issued that cannot collide with the workbook's six", () => {
  assert.equal(record.id, "U1");
  assert.ok(!master.decks.some((d) => d.id === record.id));
  assert.equal(Store.nextId([{id: "U1"}, {id: "U3"}]), "U2", "the lowest free id, not a counter");
});

check("a record keeps the printed facts, not just the names", () => {
  // Without these the deck cannot be re-measured offline, which is the whole
  // reason they are stored rather than looked up again.
  const keys = Object.keys(record.cards[0]);
  ["name", "quantity", "typeLine", "manaCost", "oracleText", "colorIdentity", "mv", "price"]
    .forEach((k) => assert.ok(keys.includes(k), `a stored card carries ${k}`));
});

check("what is wrong with the deck is stated, not swallowed", () => {
  const found = Store.problems(record);
  assert.ok(Array.isArray(found));
  // This fixture resolves partially against the app's own 648 cards, which is
  // exactly the case that must not be reported as a clean import.
  if (record.total !== 100 || record.unresolved.length) {
    assert.ok(found.length > 0, "a partial import is never reported as complete");
    assert.equal(Store.measurable(record), false, "and it is not measurable either");
  }
});

/* ---------------- the merge ---------------- */

const complete = {
  ...record,
  commander: "Krenko, Mob Boss",
  total: 100,
  unresolved: [],
  cards: [
    {name: "Sol Ring", quantity: 1, isCommander: false, typeLine: "Artifact", manaCost: "{1}",
     oracleText: "{T}: Add {C}{C}.", keywords: [], colorIdentity: [], mv: 1, price: 1.35},
    {name: "Krenko, Mob Boss", quantity: 1, isCommander: true, typeLine: "Legendary Creature — Goblin Warrior",
     manaCost: "{2}{R}{R}", oracleText: "Tap: create X 1/1 Goblins.", keywords: [], colorIdentity: ["R"], mv: 4, price: 2.10},
    {name: "Not In The Workbook At All", quantity: 1, isCommander: false, typeLine: "Instant",
     manaCost: "{R}", oracleText: "Deal 3 damage.", keywords: [], colorIdentity: ["R"], mv: 1, price: 0.25}
  ]
};

const before = JSON.stringify(master);
const merged = Store.merge(master, [complete]);

check("the master handed in is the master still held afterwards", () => {
  assert.equal(JSON.stringify(master), before,
    "merge must copy on write, or one import quietly rewrites the six decks");
});

check("the imported deck is a deck like any other", () => {
  const deck = merged.decks.find((d) => d.id === "U1");
  assert.ok(deck, "it is in the deck list");
  assert.equal(deck.commander, "Krenko, Mob Boss");
  assert.equal(deck.imported, true, "and says where it came from");
  assert.equal(merged.decks.length, master.decks.length + 1);
});

check("a card the six already play gains a target here and nowhere else", () => {
  const sol = merged.cards.find((c) => c.name === "Sol Ring");
  assert.ok(sol, "Sol Ring is in the workbook catalog");
  assert.equal(sol.target.U1, 1, "the import wants one");
  const original = master.cards.find((c) => c.name === "Sol Ring");
  master.decks.forEach((d) => {
    assert.equal(sol.target[d.id], original.target[d.id],
      `${d.id}'s Sol Ring count must not move because somebody imported a deck`);
    assert.equal(sol.actual[d.id], original.actual[d.id]);
  });
});

check("a card the six have never seen becomes a catalog row", () => {
  const row = merged.cards.find((c) => c.name === "Not In The Workbook At All");
  assert.ok(row, "an unknown card is added, not dropped");
  assert.equal(row.target.U1, 1);
  assert.equal(row.actual.U1, 1, "an imported deck is one its owner already built");
  assert.equal(row.type, "Instant");
  assert.equal(row.color, "R");
  master.decks.forEach((d) => {
    assert.equal(row.target[d.id], 0, "and it belongs to no other deck");
  });
});

check("every existing row answers for the new deck rather than reading undefined", () => {
  const missing = merged.cards.filter((c) => c.target.U1 === undefined || c.actual.U1 === undefined);
  assert.equal(missing.length, 0, `${missing.length} rows have no U1 entry`);
});

check("merging nothing changes nothing", () => {
  assert.equal(Store.merge(master, []), master, "no imports is the same object back");
});

/* ---------------- the workbook's dialect ---------------- */

check("colors are written the way the workbook writes them", () => {
  assert.equal(Store.colorCode([], "Artifact"), "C", "colorless");
  assert.equal(Store.colorCode(["R"], "Instant"), "R");
  assert.equal(Store.colorCode(["W", "B"], "Instant"), "WB", "in WUBRG order");
  assert.equal(Store.colorCode(["B", "W"], "Instant"), "WB", "regardless of the order given");
  assert.equal(Store.colorCode(["W", "U", "B"], "Instant"), "Multi", "three or more");
  assert.equal(Store.colorCode(["R"], "Land — Mountain"), "L", "a land is an L, whatever it taps for");
});

check("a type line splits the way the catalog stores it", () => {
  assert.equal(Store.shortType("Legendary Creature — Goblin Warrior"), "Legendary Creature");
  assert.equal(Store.subType("Legendary Creature — Goblin Warrior"), "Goblin Warrior");
  assert.equal(Store.shortType("Instant"), "Instant");
  assert.equal(Store.subType("Instant"), "");
  assert.equal(Store.shortType(""), "Card", "an unknown type is still a type");
});

/* ---------------- storage ---------------- */

check("records survive a round trip through storage", () => {
  const store = new Map();
  const fake = {getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v)};
  assert.deepEqual(Store.read(fake), [], "nothing saved is an empty list, not a throw");
  assert.equal(Store.write(fake, [complete]), true);
  const back = Store.read(fake);
  assert.equal(back.length, 1);
  assert.equal(back[0].id, "U1");
  assert.equal(back[0].cards.length, 3);
});

check("storage that refuses to write is reported, not thrown", () => {
  const brick = {getItem: () => "not json at all", setItem: () => { throw new Error("QuotaExceeded"); }};
  assert.deepEqual(Store.read(brick), [], "unreadable storage reads as empty");
  assert.equal(Store.write(brick, [complete]), false, "a failed save says so");
});

check("add replaces by id and remove takes one out", () => {
  const one = Store.add([], complete);
  assert.equal(one.length, 1);
  const same = Store.add(one, {...complete, label: "Renamed"});
  assert.equal(same.length, 1, "the same id is an update, not a duplicate");
  assert.equal(same[0].label, "Renamed");
  assert.equal(Store.remove(same, "U1").length, 0);
  assert.equal(Store.remove(same, "U9").length, 1, "removing what is not there is a no-op");
});

/* ---------------- the lineup handed to the simulator ---------------- */

check("the lineup is what deck-measure hydrates", () => {
  const lineup = Store.toLineup(complete);
  assert.equal(lineup.reduce((n, c) => n + c.quantity, 0), 3);
  assert.equal(lineup.filter((c) => c.isCommander).length, 1);
  assert.ok(lineup[0].card.oracleText, "the facts travel with the entry");
});


// ---------------------------------------------------------------------------
// A generated deck carries where it came from, all the way to the deck page.
// The record keeps it, the merged deck keeps it, and an imported deck has null
// there rather than a missing key -- the banner reads it either way.
// ---------------------------------------------------------------------------
{
  const genResolved = {
    name: "Built one", commander: ["Krenko, Mob Boss"], source: "generated",
    cards: [{name: "Krenko, Mob Boss", quantity: 1, isCommander: true,
      card: {typeLine: "Legendary Creature - Goblin Warrior", cmc: 4, price: 3.5, colorIdentity: ["R"]}}],
    generated: {rung: "tuned", rungLabel: "Tuned", lens: "synergy-max",
      lensLabel: "Synergy maximizer", inputs: {budgetUsd: 150}}
  };
  const genRecord = Store.toRecord(genResolved, {id: "U9", label: "Built one"});
  assert.equal(genRecord.generated.rungLabel, "Tuned", "the record keeps the rung it was built at");
  assert.equal(genRecord.generated.lensLabel, "Synergy maximizer");
  assert.equal(genRecord.source, "generated");

  const merged = Store.merge(master, [genRecord]);
  const deck = merged.decks.filter((d) => d.id === "U9")[0];
  assert.ok(deck, "a generated deck must appear among the decks");
  assert.equal(deck.generated.rungLabel, "Tuned",
    "the deck page never sees the record, so the merge has to carry the provenance");
  assert.equal(deck.generated.inputs.budgetUsd, 150);

  const pasted = Store.toRecord({name: "Pasted", commander: [], cards: [], source: "paste"}, {id: "U8"});
  assert.equal(pasted.generated, null, "an imported deck has null, not a missing key");
  checks += 6;
}

console.log(`deck-store: ${checks} checks passed · ` +
  `${merged.cards.length - master.cards.length} new catalog row from a 3-card import, ` +
  `${merged.decks.length} decks`);
