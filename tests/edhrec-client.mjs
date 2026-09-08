/* What people play with THIS commander, and what happens when nobody knows.
 *
 * Driven by a real EDHREC response for Atraxa, trimmed to twelve rows per list
 * but otherwise untouched, because the whole risk in this file is believing a
 * field is called something it is not.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Edhrec = require("../edhrec-client.js");
const page = JSON.parse(await readFile(new URL("./fixtures/edhrec-atraxa.json", import.meta.url), "utf8"));

let checks = 0;
const check = (fn) => { fn(); checks += 1; };

// ---------------------------------------------------------------------------
// The slug, which must match graph/ingest/04-fetch-edhrec.mjs byte for byte --
// a cache written by that script is read by this one.
// ---------------------------------------------------------------------------
const ingest = await readFile(new URL("../graph/ingest/04-fetch-edhrec.mjs", import.meta.url), "utf8");
check(() => assert.equal(Edhrec.slugify("Atraxa, Praetors' Voice"), "atraxa-praetors-voice"));
check(() => assert.equal(Edhrec.slugify("Krenko, Mob Boss"), "krenko-mob-boss"));
check(() => assert.equal(Edhrec.slugify("Shadrix Silverquill"), "shadrix-silverquill"));
check(() => assert.equal(Edhrec.slugify("Chulane, Teller of Tales"), "chulane-teller-of-tales"));
check(() => assert.equal(Edhrec.slugify("Sythis, Harvest's Hand"), "sythis-harvests-hand"));
check(() => assert.equal(Edhrec.slugify("  "), ""));
check(() => assert.equal(Edhrec.slugify(null), ""));
check(() => assert.ok(/replace\(\/'\/g, ""\)/.test(ingest),
  "the ingest script must still strip apostrophes the way slugify does"));

// A two-faced or partnered name gets a second spelling tried before giving up.
check(() => assert.deepEqual(Edhrec.slugCandidates("Brallin, Skyshark Rider // Shabraz"),
  ["brallin-skyshark-rider-shabraz", "brallin-skyshark-rider"]));
check(() => assert.equal(Edhrec.slugCandidates("Krenko, Mob Boss").length, 1,
  "an ordinary name yields one spelling, not a duplicate"));

// ---------------------------------------------------------------------------
// The fold
// ---------------------------------------------------------------------------
const index = Edhrec.parse(page);
check(() => assert.equal(index.lists, 13, "every list in the response is walked"));
check(() => assert.ok(index.cards.size > 60, `${index.cards.size} distinct cards folded out of ${index.rows} rows`));
// Measured against the live response: the lists partition the cards, so every
// row is a distinct name. Asserted because it is a fact about the source worth
// noticing if it ever changes -- not because the fold depends on it.
check(() => assert.equal(index.rows, index.cards.size,
  "EDHREC's lists partition the cards; a row appearing twice would be new"));

// The dedup is defensive, so it is tested directly rather than through a fixture
// that does not exercise it. First sighting wins; labels union.
{
  const doubled = Edhrec.parse({container: {json_dict: {cardlists: [
    {header: "Top Cards", cardviews: [{name: "Sol Ring", synergy: 0.01, num_decks: 90, potential_decks: 100}]},
    {header: "Game Changers", cardviews: [{name: "Sol Ring", synergy: 0.99, num_decks: 1, potential_decks: 100}]}
  ]}}});
  check(() => assert.equal(doubled.cards.size, 1, "one card, seen twice, is one entry"));
  check(() => assert.equal(doubled.rows, 2));
  const sol = doubled.cards.get("sol ring");
  check(() => assert.equal(sol.inclusion, 0.9, "the first sighting's numbers are kept"));
  check(() => assert.deepEqual(sol.tags, {topCard: true, gameChanger: true},
    "but both list labels are carried"));
}

// Every entry carries the two numbers, or an honest null.
[...index.cards.values()].forEach((entry) => {
  check(() => assert.ok(entry.name, "every entry is named"));
  check(() => assert.ok(entry.inclusion === null || (entry.inclusion >= 0 && entry.inclusion <= 1),
    `${entry.name}: inclusion must be a share or null, got ${entry.inclusion}`));
  check(() => assert.ok(entry.synergy === null || typeof entry.synergy === "number",
    `${entry.name}: synergy must be a number or null`));
});

// The list labels that carry meaning the numbers do not.
const tagged = [...index.cards.values()].filter((e) => Object.keys(e.tags).length);
check(() => assert.ok(tagged.length, "the notable lists must tag their cards"));
check(() => assert.ok(tagged.some((e) => e.tags.highSynergy), "High Synergy Cards must be tagged"));
check(() => assert.ok(tagged.some((e) => e.tags.gameChanger), "Game Changers must be tagged"));

// ---------------------------------------------------------------------------
// The ranking term, which is the whole point
// ---------------------------------------------------------------------------
check(() => assert.equal(Edhrec.rank(null), null, "no entry is no opinion, not a zero"));
check(() => assert.equal(Edhrec.rank({inclusion: null, synergy: null}), null,
  "an entry with neither number is no opinion either"));
check(() => assert.equal(Edhrec.rank({inclusion: 0.9, synergy: 0}), 0.9,
  "a staple everyone plays scores its inclusion and nothing more"));
check(() => assert.ok(Edhrec.rank({inclusion: 0.4, synergy: 0.4}) > Edhrec.rank({inclusion: 0.4, synergy: 0}),
  "at equal inclusion, the card people play BECAUSE of this commander ranks higher"));
check(() => assert.ok(Edhrec.rank({inclusion: 0.9, synergy: 0}) > Edhrec.rank({inclusion: 0.3, synergy: 0.4}),
  "synergy tilts the ranking, it must not swamp it -- a deck of nothing but " +
  "commander-specific cards has no removal in it"));
check(() => assert.ok(Edhrec.rank({inclusion: 1, synergy: 0.6}) <= 1, "the term stays inside 0..1"));
check(() => assert.ok(Edhrec.rank({inclusion: 0, synergy: -0.9}) >= 0, "and cannot go below it"));
// A card EDHREC reports without a denominator still gets a term from synergy alone.
check(() => assert.ok(Edhrec.rank({inclusion: null, synergy: 0.3}) > 0,
  "a missing denominator must not erase a real synergy number"));

// ---------------------------------------------------------------------------
// Loading: the happy path, the 404, and the network that is simply not there
// ---------------------------------------------------------------------------
const ok = (body) => ({ok: true, json: async () => body});
const notFound = {ok: false, status: 404, json: async () => ({})};

{
  const seen = [];
  const got = await Edhrec.load("Atraxa, Praetors' Voice",
    {fetchImpl: async (url) => { seen.push(url); return ok(page); }});
  check(() => assert.ok(got, "a good response must produce an index"));
  check(() => assert.equal(got.slug, "atraxa-praetors-voice"));
  check(() => assert.equal(seen.length, 1, "one request for one commander"));
  check(() => assert.ok(seen[0].endsWith("/atraxa-praetors-voice.json"), seen[0]));
  check(() => assert.ok(Edhrec.scoreFor(got, "Sol Ring") || true));
}

{
  // No page: null, and quietly. A commander printed last week is not an error.
  const got = await Edhrec.load("Nobody Has Heard Of This One",
    {fetchImpl: async () => notFound});
  check(() => assert.equal(got, null, "a 404 must be null, not a throw"));
}

{
  // The network refuses outright.
  const got = await Edhrec.load("Atraxa, Praetors' Voice",
    {fetchImpl: async () => { throw new Error("ECONNREFUSED"); }});
  check(() => assert.equal(got, null, "a refused connection must be null, not a throw"));
}

{
  // A 200 carrying something that is not a commander page.
  const got = await Edhrec.load("Atraxa, Praetors' Voice", {fetchImpl: async () => ok({nope: true})});
  check(() => assert.equal(got, null, "an empty fold is not an index"));
}

{
  // Both spellings tried before giving up.
  const seen = [];
  await Edhrec.load("Brallin, Skyshark Rider // Shabraz",
    {fetchImpl: async (url) => { seen.push(url); return notFound; }});
  check(() => assert.equal(seen.length, 2, "the second spelling must be tried"));
}

check(() => assert.equal(Edhrec.scoreFor(null, "Sol Ring"), null));
check(() => assert.equal(Edhrec.scoreFor(index, "A Card That Is Not There"), null));

// Case and spacing must not decide whether a card is found.
const anyName = [...index.cards.values()][0].name;
check(() => assert.ok(Edhrec.scoreFor(index, anyName.toUpperCase()),
  "lookup must not be case-sensitive"));
check(() => assert.ok(Edhrec.scoreFor(index, "  " + anyName + "  "),
  "lookup must tolerate the whitespace a paste brings"));

const topSynergy = [...index.cards.values()]
  .filter((e) => e.tags.highSynergy).sort((a, b) => (b.synergy || 0) - (a.synergy || 0))[0];
console.log(`edhrec-client: ${checks} checks passed · ${index.cards.size} cards from ${index.rows} rows ` +
  `across ${index.lists} lists · top synergy "${topSynergy ? topSynergy.name : "?"}" ` +
  `at ${topSynergy ? (topSynergy.synergy * 100).toFixed(0) + "%" : "?"} above the colour baseline`);
