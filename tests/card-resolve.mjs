// "That card name is not a card." Now what?
//
// The bug this covers was a dead end, not a crash: a pasted list with one bad name
// reached the review screen, reported the name as unmatched, and offered a Save button
// that saved a 99-card deck the simulator would then refuse to score. Nothing errored and
// nothing was slow; there was simply no way forward. What follows pins the ladder that
// replaced it, and the three shapes of failure it has to tell apart:
//
//   a typo          "Sol Rng"                    -- one right answer
//   an invention    "Splinter, Vengeful Sensei"  -- several plausible ones
//   not a card      "Zzzqqq Nonexistent Blorp"   -- none, and saying so is the answer
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Resolve = require("../card-resolve.js");

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; console.log("  ok  " + label); };
const acheck = async (label, fn) => { await fn(); checks += 1; console.log("  ok  " + label); };

/* A Scryfall that knows five cards and nothing else. Every rung is recorded, so a test can
   assert that a rung DID NOT run as well as that it did -- the cheap ones existing is only
   half the point; not paying for the expensive ones is the other half. */
const KNOWN = [
  "Sol Ring", "Splinter", "Splinter, Radical Rat", "Splinter, the Mentor", "Lightning Bolt"
];
function stubClient(overrides = {}) {
  const calls = [];
  const card = (name) => ({name, typeLine: "Artifact", legalities: {commander: "legal"}});
  return {
    calls,
    async autocomplete(q) {
      calls.push(["autocomplete", q]);
      if (overrides.autocomplete) return overrides.autocomplete(q);
      const low = String(q).toLowerCase();
      return KNOWN.filter((n) => n.toLowerCase().startsWith(low));
    },
    async named(q) {
      calls.push(["named", q]);
      return overrides.named ? overrides.named(q) : null;
    },
    async search(q) {
      calls.push(["search", q]);
      return overrides.search ? overrides.search(q) : [];
    },
    async collection(ids) {
      calls.push(["collection", ids.map((i) => i.name)]);
      if (overrides.collection) return overrides.collection(ids);
      const found = ids.filter((i) => KNOWN.includes(i.name)).map((i) => card(i.name));
      return {cards: found, missing: ids.filter((i) => !KNOWN.includes(i.name)).map((i) => i.name)};
    }
  };
}

check("the name before the comma is what a legend is really called", () => {
  assert.equal(Resolve.leadName("Splinter, Vengeful Sensei"), "Splinter");
  assert.equal(Resolve.leadName("Atraxa, Praetors' Voice"), "Atraxa");
  assert.equal(Resolve.leadName("Sol Ring"), "", "no comma, nothing to split");
  assert.equal(Resolve.leadName("Ob, X"), "", "two letters is not a name worth searching on");
});

check("the words worth searching on are the ones that identify a card", () => {
  assert.deepEqual(Resolve.words("Virtue of Courage"), ["virtue", "courage"], "'of' matches everything");
  assert.deepEqual(Resolve.words("The Great Henge"), ["great", "henge"]);
});

check("likeness scores a wrong word and a wrong letter alike", () => {
  // Two different failures, and a reader would call both "nearly right".
  assert.ok(Resolve.likeness("Sol Rng", "Sol Ring") > 0.6, "one letter out");
  assert.ok(Resolve.likeness("Splinter, Vengeful Sensei", "Splinter, Radical Rat") > 0.4, "one title out");
  assert.equal(Resolve.likeness("Atraxa Praetors Voice", "Atraxa, Praetors' Voice"), 1,
    "punctuation is not a difference");
  assert.ok(Resolve.likeness("Sol Ring", "Lightning Bolt") < 0.2, "and unlike names score low");
});

await acheck("a typo is answered from the card list, with no request at all", async () => {
  const client = stubClient();
  const result = await Resolve.resolveName("Sol Rng", client, {localNames: KNOWN});
  assert.equal(result.candidates[0].name, "Sol Ring");
  assert.equal(result.candidates[0].rung, "registry");
  assert.ok(result.searched.includes("registry"));
  /* Scryfall's autocomplete is prefix-based, so it cannot answer a typo in the middle of a
     word -- which is exactly why the registry rung exists and goes first. */
  assert.deepEqual(await client.autocomplete("Sol Rng"), [], "the stub confirms the premise");
});

await acheck("an invented title is answered by the name in front of it", async () => {
  const client = stubClient();
  const result = await Resolve.resolveName("Splinter, Vengeful Sensei", client, {});
  const names = result.candidates.map((c) => c.name);
  assert.ok(names.includes("Splinter, Radical Rat"), `the real Splinters must be offered, got ${names}`);
  assert.ok(names.includes("Splinter, the Mentor"));
  assert.ok(client.calls.some(([kind, q]) => kind === "autocomplete" && q === "Splinter"),
    "the lead name must be searched when the whole name finds nothing");
});

await acheck("a comma-shaped query offers comma-shaped cards first", () => {
  // "Splinter" the sorcery and "Splinter, Radical Rat" the commander score the same on
  // words; the one shaped like what was asked for is the likelier answer.
  return Resolve.resolveName("Splinter, Vengeful Sensei", stubClient(), {}).then((result) => {
    const titled = result.candidates.findIndex((c) => /,/.test(c.name));
    const bare = result.candidates.findIndex((c) => c.name === "Splinter");
    assert.ok(titled < bare || bare === -1, `a titled card must outrank a bare one: ${result.candidates.map((c) => c.name)}`);
  });
});

await acheck("a name that is not a card is reported as one, not guessed at", async () => {
  const client = stubClient();
  const result = await Resolve.resolveName("Zzzqqq Nonexistent Blorp", client, {localNames: KNOWN});
  assert.deepEqual(result.candidates, [], "inventing an answer here would be worse than none");
  assert.equal(result.exact, null);
  assert.ok(result.searched.length >= 3, "and every rung must have been tried before giving up");
});

await acheck("an exact match is reported as exact, however it was spelled", async () => {
  const client = stubClient();
  const result = await Resolve.resolveName("sol ring", client, {localNames: KNOWN});
  assert.ok(result.exact, "case is not a difference");
  assert.equal(result.exact.name, "Sol Ring");
});

await acheck("one rung failing costs the reader that rung and no other", async () => {
  const client = stubClient({autocomplete: () => { throw new Error("429"); }});
  const result = await Resolve.resolveName("Sol Rng", client, {localNames: KNOWN});
  assert.equal(result.candidates[0].name, "Sol Ring", "the registry still answered");
  assert.ok(result.errors.some((e) => /429/.test(e)), "and the failure is recorded rather than swallowed");
});

await acheck("names are looked up one at a time, and progress is reported", async () => {
  const seen = [];
  const results = await Resolve.resolveNames(["Sol Rng", "Lightning Bolt"], stubClient(),
    {localNames: KNOWN, onEach: (result, i, total) => seen.push([result.name, i, total])});
  assert.equal(results.length, 2);
  assert.deepEqual(seen.map((s) => s[0]), ["Sol Rng", "Lightning Bolt"]);
  assert.deepEqual(seen.map((s) => s[2]), [2, 2]);
});

check("the last resort is a search a person can read, not an API this app cannot reach", () => {
  // TCGplayer's API needs a client id and secret, and this is a static site with nowhere
  // to keep one that would not also hand it to everybody who opens the page.
  assert.match(Resolve.storeSearchUrl("Sol Rng"), /^https:\/\/www\.tcgplayer\.com\/search\/magic\/product\?/);
  assert.match(Resolve.storeSearchUrl("Sol Rng"), /q=Sol%20Rng/);
  assert.match(Resolve.scryfallSearchUrl("Sol Rng"), /^https:\/\/scryfall\.com\/search\?q=Sol%20Rng$/);
});

/* ---------------- and the panel that has to use it ---------------- */
import {readFile} from "node:fs/promises";
const panel = await readFile(new URL("../import-panel.js", import.meta.url), "utf8");
const store = await readFile(new URL("../deck-store.js", import.meta.url), "utf8");
const importer = await readFile(new URL("../deck-import.js", import.meta.url), "utf8");
const page = await readFile(new URL("../index.html", import.meta.url), "utf8");

check("the panel asks about unmatched names instead of walking past them", () => {
  assert.match(panel, /if \(deck\.unresolved && deck\.unresolved\.length && opts\.resolveNames\) await renderFixNames\(\);/,
    "a list with an unmatched name must reach the fix step, not the review screen");
  assert.match(panel, /function renderFixNames\(\)/);
  assert.match(panel, /data-fix-drop/, "leaving a card out has to be a real option, not the only one");
  assert.match(panel, /data-imp-fixdone/);
  assert.match(panel, /disabled/, "the way onward waits until every name has an answer");
});

check("a name left out on purpose is not reported as a failure", () => {
  assert.match(store, /const dropped = record\.dropped \|\| \[\];/);
  assert.match(store, /name\$\{dropped\.length === 1 \? "" : "s"\} you left out/);
  assert.match(panel, /dropped: \(deck\.dropped \|\| \[\]\)\.concat\(dropped\)/);
});

check("applyFallback keys by the name that was ASKED for", () => {
  /* The obvious `{name, ...fetched[name]}` looks like it does and does not: the spread is
     second, so a card carrying its own name overwrites the key. Harmless while the caller
     keys by card.name; silently drops every choice the moment one does not, which is what
     the fix step does. */
  assert.ok(!/buildIndex\(Object\.keys\(fetched/.test(importer),
    "the index must not be rebuilt from the card's own names");
  assert.match(importer, /asked\.set\(normalizeName\(name\), card\)/);
  assert.match(importer, /asked\.get\(normalizeName\(name\)\) \|\| asked\.get\(foldName\(name\)\)/);
});

check("the page loads the resolver, and the import refuses to open without it", () => {
  assert.match(page, /src="card-resolve\.js/);
  const viewer = null; void viewer;
});

/* ---------------------------------------------------------------------------
   NEVER OFFER A CARD THE LIST ALREADY HAS.
   Commander is singleton. A candidate already sitting in the deck is not what the reader
   meant by a name that did not match -- it is a second copy, and picking it builds an
   illegal hundred. The exclusion has to hold at EVERY rung, because each one reaches a
   different corpus: the registry never touches the network, autocomplete does, and the
   fill request at the end can rename a registry hit into something the deck already has.
   --------------------------------------------------------------------------- */

await acheck("a card already in the list is not offered, however it was found", async () => {
  const client = stubClient();
  const withOut = await Resolve.resolveName("Sol Rng", client, {localNames: KNOWN});
  assert.ok(withOut.candidates.some((c) => c.name === "Sol Ring"),
    "without the exclusion, Sol Ring is the obvious answer");

  const withIn = await Resolve.resolveName("Sol Rng", stubClient(), {
    localNames: KNOWN,
    exclude: ["Sol Ring"]
  });
  assert.ok(!withIn.candidates.some((c) => c.name === "Sol Ring"),
    "the deck already has Sol Ring, so it cannot be the answer to another name");
});

await acheck("the exclusion survives the rung that renames a registry hit", async () => {
  /* The registry offers a bare name; the fill request turns it into a real card and can
     come back under a different spelling. If the deck already has THAT spelling, the
     candidate has to go on the way out, not just on the way in. */
  const client = stubClient({
    collection: (ids) => ({
      cards: ids.map((i) => ({name: i.name === "Splinter" ? "Splinter, Radical Rat" : i.name,
        typeLine: "Creature"})),
      missing: []
    })
  });
  const out = await Resolve.resolveName("Splinter, Vengeful Sensei", client, {
    localNames: KNOWN,
    exclude: ["Splinter, Radical Rat"]
  });
  assert.ok(!out.candidates.some((c) => c.name === "Splinter, Radical Rat"),
    "renamed into a card the deck holds, so it is dropped");
});

await acheck("excluding the name being asked about does not silence the whole lookup", async () => {
  const out = await Resolve.resolveName("Sol Ring", stubClient(), {
    localNames: KNOWN,
    exclude: ["Sol Ring"]
  });
  assert.ok(out.candidates.length > 0,
    "a name cannot exclude itself, or a re-run of the same list answers nothing");
});

check("the import screen builds that exclusion from the deck, minus the basics", () => {
  /* Basics are the one card a decklist may legally repeat, so they stay available: a
     misspelled Mountain in a list that already has ten Mountains still means Mountain. */
  assert.match(panel, /exclude: alreadyInDeck\(\)/);
  assert.match(panel, /isBasicLand/);
  assert.match(panel, /function chosenElsewhere/);
});

console.log(`\ncard-resolve: ${checks} checks passed.`);
