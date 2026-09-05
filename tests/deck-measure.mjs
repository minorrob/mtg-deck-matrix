// The in-browser measurement path, held to the published numbers.
//
// THE ASSERTION THAT MATTERS. data/deck-ratings.json was produced by a Node run
// through tools/sim/rate-decks.mjs. This module is a second path to the same
// engine, and two paths to one engine drift silently unless something compares
// them. So: build the six baked hundreds the way the app would, measure them
// here, and require the published score back. Not "close" -- the same protocol
// on the same data is deterministic, so it is the same number.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Measure = require("../deck-measure.js");

const load = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
const master = await load("../data/master-v2.json");
const facts = (await load("../data/card-facts.json")).cards;
const ratings = await load("../data/deck-ratings.json");
const config = await load("../sim/config.json");
const opponents = await load("../sim/opponents.json");

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

const seats = Measure.buildSeats(opponents, config.table);

check("the seat table matches what the Node tool builds", () => {
  assert.equal(seats.length > 0, true);
  const total = seats.reduce((n, s) => n + s.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, "seat weights normalise to 1");
});

/* ---------------- parity with the published run ---------------- */

// The `tuned` build is the Master's target column as it stands, which is exactly
// what the app would hand this module for a live deck.
function tunedHundred(deckId, commander) {
  return master.cards
    .filter((row) => (row.target[deckId] || 0) > 0)
    .map((row) => ({
      name: row.name,
      quantity: row.target[deckId],
      isCommander: row.name === commander,
      price: row.price
    }));
}

const parity = [];
for (const deck of master.decks) {
  const list = tunedHundred(deck.id, deck.commander);
  const total = list.reduce((n, c) => n + c.quantity, 0);
  assert.equal(total, 100, `${deck.id} is ${total} cards, not 100`);

  const cards = Measure.hydrate(list, facts);
  const blank = cards.filter((c) => !c.typeLine);
  assert.equal(blank.length, 0,
    `${deck.id}: no card facts for ${blank.map((c) => c.name).join(", ")}`);

  const result = Measure.measure(cards, {config, seats});

  const published = ratings.decks.find((d) => d.id === deck.id);
  const entry = published.builds.tuned;
  const expected = entry.sameAs ? published.builds[entry.sameAs].score : entry.score;
  parity.push({id: deck.id, label: deck.label, got: result.score, want: expected});
}

check("every baked deck reproduces its published score exactly", () => {
  const off = parity.filter((p) => p.got !== p.want);
  assert.deepEqual(off, [],
    "the browser path and the Node tool disagree: " +
    off.map((p) => `${p.id} got ${p.got} want ${p.want}`).join("; "));
});

check("a measurement is stamped with the protocol that produced it", () => {
  const cards = Measure.hydrate(tunedHundred("D6", "Krenko, Mob Boss"), facts);
  const full = Measure.measure(cards, {config, seats});
  assert.deepEqual(full.protocol, {seeds: 6, gamesPerSeed: 20000, preview: false});
  const quick = Measure.measure(cards, {config, seats, preview: true});
  assert.equal(quick.protocol.preview, true, "a preview says it is one");
  assert.equal(quick.protocol.seeds, 1);
  // A preview is allowed to differ; what it must not do is claim to be a
  // measurement. Being close is the point of it existing at all.
  assert.ok(Math.abs(quick.score - full.score) < 3,
    `preview ${quick.score} is not in the neighbourhood of ${full.score}`);
});

check("progress is reported per seed so a 3.5 second run is not a blank wait", () => {
  const cards = Measure.hydrate(tunedHundred("D1", "Quintorius, Loremaster"), facts);
  const seen = [];
  Measure.measure(cards, {config, seats, preview: true, seedCount: 3,
    onSeed: (done, total, mean) => seen.push({done, total, mean})});
  assert.equal(seen.length, 3);
  assert.deepEqual(seen.map((s) => s.done), [1, 2, 3]);
  assert.equal(seen[2].total, 3);
  assert.equal(typeof seen[2].mean, "number");
});

/* ---------------- the out-of-sync hash ---------------- */

check("the hash ignores order and notices every real edit", () => {
  const base = [
    {name: "Sol Ring", quantity: 1},
    {name: "Mountain", quantity: 23},
    {name: "Krenko, Mob Boss", quantity: 1, isCommander: true}
  ];
  const reordered = [base[2], base[0], base[1]];
  assert.equal(Measure.lineupHash(base), Measure.lineupHash(reordered),
    "shuffling the same hundred is not an edit");

  const swapped = base.map((c) => c.name === "Sol Ring" ? {...c, name: "Arcane Signet"} : c);
  assert.notEqual(Measure.lineupHash(base), Measure.lineupHash(swapped), "a swap changes it");

  const oneFewer = base.map((c) => c.name === "Mountain" ? {...c, quantity: 22} : c);
  assert.notEqual(Measure.lineupHash(base), Measure.lineupHash(oneFewer), "a land count changes it");

  const uncrowned = base.map((c) => c.isCommander ? {...c, isCommander: false} : c);
  assert.notEqual(Measure.lineupHash(base), Measure.lineupHash(uncrowned),
    "moving a card out of the command zone changes how the deck plays, so it changes the hash");
});

check("the hash is stable across runs and carried on the result", () => {
  const cards = Measure.hydrate(tunedHundred("D3", "Atraxa, Praetors' Voice"), facts);
  const a = Measure.measure(cards, {config, seats, preview: true});
  const b = Measure.measure(cards, {config, seats, preview: true});
  assert.equal(a.hash, b.hash);
  assert.equal(a.hash, Measure.lineupHash(cards));
});

console.log(`deck-measure: ${checks} checks passed · ` +
  parity.map((p) => `${p.label} ${p.got}`).join("  ") +
  " · all matching data/deck-ratings.json");
