// Loading a deck from the site it lives on.
//
// The fixture is a real Archidekt API response, trimmed to six cards with every
// field left exactly as the site sends it -- including the two shapes that would
// otherwise be guessed wrong: colour identity spelled out in full ("Green", not
// "G") and a type line that has to be assembled from three separate arrays.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Sources = require("../deck-sources.js");
const Store = require("../deck-store.js");

const fixture = JSON.parse(await readFile(new URL("./fixtures/archidekt-deck.json", import.meta.url), "utf8"));

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

/* ---------------- which site, and whether it can be fetched ---------------- */

check("a deck link is recognized and its id pulled out", () => {
  assert.equal(Sources.identify("https://archidekt.com/decks/1/fun-with-fungus").id, "1");
  assert.equal(Sources.identify("archidekt.com/decks/123456").key, "archidekt");
  assert.equal(Sources.identify("https://www.moxfield.com/decks/AbC-123_x").key, "moxfield");
  assert.equal(Sources.identify("https://deckstats.net/decks/12345/678910-name").key, "deckstats");
  assert.equal(Sources.identify("https://example.com/deck/1"), null);
  assert.equal(Sources.identify(""), null);
});

check("only Archidekt claims to be fetchable, and the others say what to do", () => {
  // Measured, not assumed: api.moxfield.com answers 403 to a plain GET. A UI
  // that offered a Moxfield URL box would be offering something that cannot work.
  const moxfield = Sources.SITES.find((s) => s.key === "moxfield");
  assert.equal(moxfield.fetchable, false);
  assert.match(moxfield.advice, /Export/, "the advice names the button to press");
  assert.equal(Sources.SITES.find((s) => s.key === "archidekt").fetchable, true);
});

/* ---------------- the conversion ---------------- */

const deck = Sources.fromArchidekt(fixture, {url: "https://archidekt.com/decks/1"});

check("the command zone comes from the category, not from position", () => {
  assert.deepEqual(deck.commander, ["Thelon of Havenwood"]);
  assert.equal(deck.cards.filter((c) => c.isCommander).length, 1);
});

check("colors are letters by the time anything downstream sees them", () => {
  // Thelon is Golgari, and Archidekt sends ["Black","Green"] -- two words that
  // index as nothing, in an order that is not WUBRG.
  const thelon = deck.cards.find((c) => c.name === "Thelon of Havenwood");
  assert.deepEqual(thelon.card.colorIdentity, ["B", "G"], '"Green" is not a color identity anything can index');
  deck.cards.forEach((c) => {
    c.card.colorIdentity.forEach((letter) => {
      assert.ok("WUBRG".includes(letter), `${c.name} has a color identity of "${letter}"`);
    });
  });
});

check("a type line is assembled from the three arrays it arrives in", () => {
  assert.equal(Sources.typeLineOf({superTypes: ["Legendary"], types: ["Creature"], subTypes: ["Fungus"]}),
    "Legendary Creature — Fungus");
  assert.equal(Sources.typeLineOf({types: ["Instant"], subTypes: []}), "Instant");
  const typed = deck.cards.filter((c) => c.card.typeLine);
  assert.equal(typed.length, deck.cards.length, "every card has a type line, or the sim is guessing");
});

check("the printed text travels with the card, so nothing has to be looked up", () => {
  const withText = deck.cards.filter((c) => c.card.oracleText);
  assert.ok(withText.length >= 4, `only ${withText.length} of ${deck.cards.length} cards carry rules text`);
  deck.cards.forEach((c) => {
    assert.equal(typeof c.card.cmc, "number");
    assert.equal(typeof c.card.price, "number");
  });
  assert.equal(deck.unresolved.length, 0, "a URL load resolves on arrival: there is nothing to match");
});

check("the price taken is the one the rest of the app quotes", () => {
  // Archidekt returns a dozen vendors. TCGplayer market is the app's currency.
  const priced = deck.cards.filter((c) => c.card.price > 0);
  assert.ok(priced.length > 0, "at least some cards are priced");
  const row = fixture.cards.find((r) => (r.card.prices || {}).tcg > 0);
  const match = deck.cards.find((c) => c.name === row.card.oracleCard.name);
  assert.equal(match.card.price, row.card.prices.tcg);
});

check("a market price of zero falls through to the vendor minimum", () => {
  // Real, and the reason the fallback exists: the fixture's Mana Crypt has
  // tcg 0 and tcgMinimum 39.88. Taking tcg alone would put a $40 card on a
  // shopping list at $0.00.
  const raw = fixture.cards.find((r) => r.card.oracleCard.name === "Mana Crypt").card.prices;
  assert.equal(raw.tcg, 0, "the fixture still carries the zero this guards against");
  assert.equal(deck.cards.find((c) => c.name === "Mana Crypt").card.price, raw.tcgMinimum);
});

check("a card no vendor prices reads as unknown, not as free", () => {
  const unpriced = Sources.fromArchidekt({
    name: "x",
    cards: [{quantity: 1, categories: [], card: {prices: {tcg: 0, tcgMinimum: 0},
      oracleCard: {name: "Nobody Sells This", types: ["Instant"], colorIdentity: []}}}]
  }, {});
  assert.equal(unpriced.cards[0].card.price, null, "0 from every vendor means no price");
  const record = Store.toRecord(unpriced, {id: "U1", label: "x"});
  assert.equal(record.cards[0].price, null, "and the null survives into the stored record");
});

check("a short deck is reported as short rather than padded", () => {
  assert.equal(deck.total, deck.cards.reduce((n, c) => n + c.quantity, 0));
  assert.ok(deck.warnings.some((w) => /not 100/.test(w)), "six cards is not a Commander deck and says so");
});

check("a maybeboard category is not counted into the hundred", () => {
  const withMaybe = {
    ...fixture,
    categories: fixture.categories.concat([{name: "Maybeboard", includedInDeck: false}]),
    cards: fixture.cards.map((c, i) => (i === 1 ? {...c, categories: ["Maybeboard"]} : c))
  };
  const trimmed = Sources.fromArchidekt(withMaybe, {});
  assert.equal(trimmed.cards.length, deck.cards.length - 1,
    "a card the deck excludes is excluded here too");
});

/* ---------------- and it plugs into the store ---------------- */

check("a URL-loaded deck becomes a record like a pasted one", () => {
  const record = Store.toRecord(deck, {id: "U1", label: deck.name});
  assert.equal(record.source, "archidekt");
  assert.equal(record.commander, "Thelon of Havenwood");
  assert.ok(record.cards[0].oracleText !== undefined);
  assert.equal(record.cards.length, deck.cards.length);
});

/* ---------------- what load() does without a network ---------------- */

check("an unsupported link is an answer, not a rejection", async () => {
  // Deliberately synchronous-looking: the assertion is that it resolves.
  assert.ok(Sources.load);
});

const notADeck = await Sources.load("https://example.com/x");
check("a link to nowhere says so plainly", () => {
  assert.match(notADeck.error, /does not look like/);
  assert.equal(notADeck.deck, undefined);
});

const mox = await Sources.load("https://moxfield.com/decks/abc123");
check("a Moxfield link is answered with the path that works", () => {
  assert.equal(mox.site.key, "moxfield");
  assert.match(mox.error, /cannot be loaded by link/);
  assert.match(mox.advice, /paste/i);
  assert.equal(mox.deck, undefined, "and no half-built deck is handed back");
});

const stubbed = await Sources.load("https://archidekt.com/decks/1", {
  fetchImpl: async () => ({ok: true, status: 200, json: async () => fixture})
});
check("a good response comes back as a deck", () => {
  assert.equal(stubbed.deck.commander[0], "Thelon of Havenwood");
  assert.equal(stubbed.deck.sourceUrl, "https://archidekt.com/decks/1");
});

const missing = await Sources.load("https://archidekt.com/decks/999999999", {
  fetchImpl: async () => ({ok: false, status: 404})
});
check("a private or deleted deck is named as such", () => {
  assert.match(missing.error, /no deck|private/i);
});

const dead = await Sources.load("https://archidekt.com/decks/1", {
  fetchImpl: async () => { throw new Error("network down"); }
});
check("a network failure suggests the paste box rather than a stack trace", () => {
  assert.match(dead.error, /paste the export/i);
});

console.log(`deck-sources: ${checks} checks passed · ` +
  `${deck.cards.length} cards off a real Archidekt response, ` +
  `commander ${deck.commander[0]}, ${deck.unresolved.length} unresolved`);
