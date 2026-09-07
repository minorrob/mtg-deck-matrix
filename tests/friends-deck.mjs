// A friend's deck, end to end, on a browser that has never opened the app.
//
// tests/fixtures/splinter-deck.txt is a real export somebody handed over: 80 lines, 100
// cards, a Universes Beyond commander, and -- as it happens -- one name that is not a
// card. It is the happy path and the unhappy one in the same file, which is why it is
// pinned here rather than paraphrased.
//
// What this guarantees for the person who opens the app for the first time and pastes it:
//
//   * it parses to a hundred cards with a commander, so the simulation will score it;
//   * every real name in it is in the registry, so the app can place it with no network;
//   * every real name is reachable on the card graph, whether or not the corpus has an
//     edge for it;
//   * the one name that is NOT a card is caught, and the candidates offered are the real
//     cards a person would have meant.
//
// The last point is the one that matters. That name shipped in somebody's export, and the
// first version of this app took it, said "1 card name could not be matched", and offered
// to save a 99-card deck it would then refuse to score.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Import = require("../deck-import.js");
const Resolve = require("../card-resolve.js");

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; console.log("  ok  " + label); };
const acheck = async (label, fn) => { await fn(); checks += 1; console.log("  ok  " + label); };

const at = (p) => new URL(p, import.meta.url);
const text = readFileSync(at("fixtures/splinter-deck.txt"), "utf8");
const universe = JSON.parse(readFileSync(at("../data/commander-universe.json"), "utf8"));
const graph = JSON.parse(readFileSync(at("../data/graph.json"), "utf8"));

const F = universe.fields;
const iName = F.indexOf("name"), iCmd = F.indexOf("commander");
const registry = new Map(universe.cards.map((c) => [c[iName].toLowerCase(), c]));
const inGraph = new Set(graph.cards.map((c) => String(c.name || "").toLowerCase()));

const parsed = Import.parseDecklist(text);
const names = parsed.rows.map((c) => c.name);

/* The one name in the file that is not a card. Named here rather than computed, so that
   the day Scryfall prints a card by this name the test fails and somebody looks. */
const NOT_A_CARD = "Splinter, Vengeful Sensei";

check("the file is a hundred cards over eighty lines", () => {
  assert.equal(parsed.rows.length, 80, "80 distinct entries");
  assert.equal(parsed.rows.reduce((n, c) => n + c.quantity, 0), 100);
});

check("every real name in it is one the app can place with no network at all", () => {
  const missing = names.filter((n) => n !== NOT_A_CARD && !registry.has(n.toLowerCase()));
  assert.deepEqual(missing, [],
    `the registry is short ${missing.length} of this deck's cards: ${missing.join(", ")}`);
});

check("the one bad name really is not a card", () => {
  assert.ok(names.includes(NOT_A_CARD), "the fixture must keep the bad name, it is the point");
  assert.ok(!registry.has(NOT_A_CARD.toLowerCase()),
    `${NOT_A_CARD} is in the registry now — if Scryfall printed it, retire this fixture's bad name`);
});

check("every real name is reachable on the card graph", () => {
  /* Two ways to be reachable, and the difference is worth saying out loud: a card in the
     corpus has edges, a price and a place in the map; a card the registry knows can be
     searched for and looked at but stands alone. Both are findable. Neither is a dead end. */
  const unreachable = names.filter((n) =>
    n !== NOT_A_CARD && !inGraph.has(n.toLowerCase()) && !registry.has(n.toLowerCase()));
  assert.deepEqual(unreachable, [], `not findable on the graph: ${unreachable.join(", ")}`);

  const outside = names.filter((n) => n !== NOT_A_CARD && !inGraph.has(n.toLowerCase()));
  // Not an assertion about the number -- a record of it, so a corpus rebuild that swallows
  // these shows up as a change rather than as nothing.
  console.log(`      ${names.length - 1 - outside.length} of ${names.length - 1} have edges in the corpus; ` +
    `${outside.length} are registry-only`);
});

check("the commander is a card that can legally be one", () => {
  const commander = parsed.commander[0] || names.find((n) => registry.get(n.toLowerCase())?.[iCmd]);
  assert.ok(commander, "no commander could be identified");
  const row = registry.get(String(commander).toLowerCase());
  assert.ok(row && row[iCmd], `${commander} cannot be a commander`);
});

await acheck("the bad name is answered with the real cards somebody meant", async () => {
  /* No network: the registry rung alone has to do this, because a first-time reader on a
     hotel wifi is exactly who pastes a deck a friend sent them. */
  const localNames = universe.cards.map((c) => c[iName]);
  const stub = {
    async autocomplete() { throw new Error("offline"); },
    async named() { throw new Error("offline"); },
    async search() { throw new Error("offline"); },
    async collection(ids) {
      return {cards: ids.map((i) => ({name: i.name, typeLine: "Legendary Creature — Rat Ninja"})), missing: []};
    }
  };
  const out = await Resolve.resolveName(NOT_A_CARD, stub, {
    localNames,
    exclude: names.filter((n) => n !== NOT_A_CARD)
  });
  assert.ok(out.candidates.length >= 3,
    `only ${out.candidates.length} candidates offered for a name with several plausible answers`);
  const offered = out.candidates.map((c) => c.name);
  assert.ok(offered.every((n) => registry.has(n.toLowerCase())),
    `a candidate that is not a real card was offered: ${offered.join(", ")}`);
  assert.ok(offered.every((n) => /^Splinter/i.test(n)),
    `a candidate that is not a Splinter at all was offered: ${offered.join(" \u00b7 ")}`);
  /* AND NEVER A CARD THE LIST ALREADY HOLDS. This deck carries four real Splinter legends
     -- Radical Rat is the commander, and Hamato Yoshi, the Mentor and Aging Champion are
     in the ninety-nine -- so the answer to a FIFTH Splinter cannot be any of them.
     Offering one would build a hundred with two copies of a singleton card. What survives
     is the remaining real Splinters, which is the honest set to choose from. */
  ["Splinter, Radical Rat", "Splinter, Hamato Yoshi", "Splinter, the Mentor"]
    .filter((n) => names.includes(n))
    .forEach((n) => assert.ok(!offered.includes(n),
      `${n} is already in this deck and was offered as the answer to another name`));
  console.log(`      offered: ${offered.join(" · ")}`);
});

console.log(`\nfriends-deck: ${checks} checks passed.`);
