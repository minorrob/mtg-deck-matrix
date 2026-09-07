// The cards Scryfall does not know yet.
//
// A card added from a link that no lookup could place goes into the deck anyway, because
// the alternative is the dead end the fix screen exists to remove. That leaves the app
// holding a card with no rules text -- and the honest thing to do with it is to keep
// asking. This covers the asking: one request for all of them, an exact match only, and
// the answer written back into every deck already holding the card.
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Manual = require("../manual-cards.js");
const User = require("../user-state.js");

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; console.log("  ok  " + label); };
const acheck = async (label, fn) => { await fn(); checks += 1; console.log("  ok  " + label); };

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get length() { return map.size; },
    key: (i) => Array.from(map.keys())[i] ?? null
  };
}

const MANUAL = (name, extra = {}) => Object.assign({
  name, manual: true, typeLine: "", price: 0, image: "", source: "https://example.com/" + name
}, extra);

check("the population is one key, and it is a key Clear session knows about", () => {
  assert.equal(Manual.KEY, "mtg-manual-cards.v1");
  assert.ok(User.keys().includes(Manual.KEY),
    "a key user-state does not enumerate survives Clear session, which is a bug not a feature");
});

check("adding the same card twice keeps one of it", () => {
  const store = memoryStorage();
  Manual.add(store, MANUAL("Pastel Ooze"));
  Manual.add(store, MANUAL("Pastel Ooze", {image: "https://example.com/better.jpg"}));
  const list = Manual.read(store);
  assert.equal(list.length, 1);
  assert.equal(list[0].image, "https://example.com/better.jpg", "the later record wins");
});

check("storage that is missing, full or full of nonsense is not an error", () => {
  assert.deepEqual(Manual.read(null), []);
  assert.deepEqual(Manual.read(memoryStorage({[Manual.KEY]: "{not json"})), []);
  assert.deepEqual(Manual.read(memoryStorage({[Manual.KEY]: '{"a":1}'})), [],
    "an object where a list belongs is discarded, not iterated");
});

await acheck("every manual card is asked about in one request", async () => {
  const calls = [];
  const client = {
    async collection(ids) {
      calls.push(ids.map((i) => i.name));
      return {cards: [{name: "Pastel Ooze", typeLine: "Creature — Ooze", cmc: 3, price: 1.5}], missing: []};
    }
  };
  const out = await Manual.recheck([MANUAL("Pastel Ooze"), MANUAL("Nothing Yet")], client);
  assert.equal(calls.length, 1, "one request for the whole population, not one per card");
  assert.deepEqual(calls[0], ["Pastel Ooze", "Nothing Yet"]);
  assert.equal(out.found.length, 1);
  assert.equal(out.still.length, 1);
  assert.equal(out.still[0].name, "Nothing Yet");
});

await acheck("a card that comes back under another name is not this card", async () => {
  const client = {
    async collection() { return {cards: [{name: "Pastel Sludge", typeLine: "Creature"}], missing: []}; }
  };
  const out = await Manual.recheck([MANUAL("Pastel Ooze")], client);
  assert.equal(out.found.length, 0, "a fuzzy promotion would replace what the reader added");
  assert.equal(out.still.length, 1);
});

await acheck("being offline leaves the population exactly as it was", async () => {
  const client = {async collection() { throw new Error("offline"); }};
  const out = await Manual.recheck([MANUAL("Pastel Ooze")], client);
  assert.equal(out.found.length, 0);
  assert.equal(out.still.length, 1);
  assert.match(out.error, /offline/);
});

check("a promotion is written into every deck already holding the card", () => {
  const records = [
    {id: "U1", cards: [
      {name: "Pastel Ooze", quantity: 1, manual: true, typeLine: "", mv: 0, price: null, source: "https://x"},
      {name: "Sol Ring", quantity: 1, manual: false, typeLine: "Artifact"}
    ]},
    {id: "U2", cards: [{name: "Sol Ring", quantity: 1, manual: false, typeLine: "Artifact"}]}
  ];
  const out = Manual.promote(records, [{name: "Pastel Ooze", card: {
    name: "Pastel Ooze", typeLine: "Creature — Ooze", manaCost: "{2}{G}", cmc: 3,
    oracleText: "It oozes.", colorIdentity: ["G"], price: 1.5, image: "https://img"
  }}]);
  assert.equal(out.changed, 1);
  const card = out.records[0].cards[0];
  assert.equal(card.manual, false, "it is a real card now, and stops saying otherwise");
  assert.equal(card.source, "", "and stops carrying where it came from");
  assert.equal(card.typeLine, "Creature — Ooze");
  assert.equal(card.mv, 3);
  assert.equal(card.price, 1.5);
  assert.equal(out.records[1], records[1], "a deck with nothing to promote is not rewritten");
});

check("nothing to promote touches nothing", () => {
  const records = [{id: "U1", cards: [{name: "X", manual: true}]}];
  const out = Manual.promote(records, []);
  assert.equal(out.changed, 0);
  assert.equal(out.records, records);
});

check("a deck says how many of its cards are still only a link", () => {
  assert.equal(Manual.countIn({cards: [{manual: true}, {manual: false}, {manual: true}]}), 2);
  assert.equal(Manual.countIn(null), 0);
});

check("the deck record carries the manual flag, and problems() says so in words", () => {
  const Store = require("../deck-store.js");
  const record = Store.toRecord({
    name: "Test", commander: ["Pastel Ooze"],
    cards: [{name: "Pastel Ooze", quantity: 1, isCommander: true,
      card: {name: "Pastel Ooze", manual: true, source: "https://example.com/ooze", sourceSite: "example.com"}}],
    unresolved: [], warnings: []
  }, {id: "U1", label: "Test"});
  assert.equal(record.cards[0].manual, true);
  assert.equal(record.cards[0].source, "https://example.com/ooze");
  const said = Store.problems(record).join(" ");
  assert.match(said, /added from a link/);
  assert.ok(!/no printed text/.test(said),
    "a card the reader added on purpose is not reported as a card the app failed on");
});

console.log(`\nmanual-cards: ${checks} checks passed.`);
