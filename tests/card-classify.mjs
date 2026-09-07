/* The one vocabulary, held to what the bake already committed.
 *
 * card-classify.js was lifted out of graph/ingest/02-build-csv.mjs so the graph page
 * could classify a card the bake never included -- somebody types a Commander-legal
 * card and the page draws its neighborhood. The risk in that move is not that the
 * extraction breaks loudly; it is that it breaks QUIETLY. A typed card would sit in
 * the same picture as the baked ones, connected by subtly different rules, and every
 * screen would look right.
 *
 * So the extraction is checked against evidence rather than against itself.
 * data/cards.json carries the oracle text, type line and keywords for 1,972 cards;
 * data/graph.json carries what the pipeline decided those same cards do. Re-deriving
 * the second from the first has to agree card for card and field for field. It cannot
 * re-run Neo4j, and it does not need to: what it compares is the committed output.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Classify = require("../card-classify.js");
const cards = JSON.parse(await readFile(new URL("../data/cards.json", import.meta.url), "utf8")).cards || [];
const graph = JSON.parse(await readFile(new URL("../data/graph.json", import.meta.url), "utf8"));

let checks = 0;
const ok = (label, fn) => { fn(); checks += 1; process.stdout.write(`  ok  ${label}\n`); };

const norm = (n) => String(n || "").toLowerCase().replace(/\s+/g, " ").trim();
const baked = new Map(graph.cards.map((c) => [norm(c.name), c]));
const FIELDS = ["roles", "requires", "causes", "triggers", "produces", "mechanics", "tribes"];
const sorted = (list) => (list || []).slice().sort().join("|");

const overlap = cards.filter((c) => baked.has(norm(c.name)));

ok("the catalog and the bake share enough cards to be worth comparing", () => {
  assert.ok(overlap.length > 1000,
    `only ${overlap.length} cards appear in both data/cards.json and data/graph.json`);
});

ok(`re-deriving ${overlap.length} baked cards from their rules text reproduces the bake`, () => {
  const wrong = [];
  overlap.forEach((card) => {
    const mine = Classify.classify(card);
    const theirs = baked.get(norm(card.name));
    FIELDS.forEach((field) => {
      if (sorted(mine[field]) !== sorted(theirs[field])) {
        wrong.push(`${card.name} [${field}]: got "${sorted(mine[field])}", baked "${sorted(theirs[field])}"`);
      }
    });
  });
  assert.deepEqual(wrong.slice(0, 10), [],
    `${wrong.length} field${wrong.length === 1 ? "" : "s"} disagree with the bake`);
});

ok("every vocabulary the bake uses is one this module can still produce", () => {
  /* The other direction: a table entry deleted here would show up above only if some
     card in the overlap happened to use it. This asserts the vocabularies themselves
     still cover everything the baked corpus names. */
  const mine = {
    roles: new Set(Classify.ROLE_PATTERNS.map((r) => r.id)
      .concat(Classify.SUPPLY_ROLES.map((r) => r.id), Classify.SUPPLY_TEXT.map((r) => r.id))),
    requires: new Set(Classify.REQUIRES.map((r) => r.role)),
    causes: new Set(Classify.EVENTS.filter((e) => e.cause).map((e) => e.id)),
    triggers: new Set(Classify.EVENTS.filter((e) => e.listen).map((e) => e.id)),
    produces: new Set(Classify.RESOURCES.filter((r) => r.produce).map((r) => r.id))
  };
  const missing = [];
  Object.keys(mine).forEach((field) => {
    const used = new Set();
    graph.cards.forEach((c) => (c[field] || []).forEach((v) => used.add(v)));
    used.forEach((v) => { if (!mine[field].has(v)) missing.push(`${field}: ${v}`); });
  });
  assert.deepEqual(missing, [], `the bake names vocabulary this module no longer has: ${missing.join(", ")}`);
});

ok("reminder text is not read as rules text", () => {
  /* Scryfall prints reminder text in parentheses. Reading it once credited Bronze
     Guardian with a counter doubler it does not have, so the stripping is load-bearing
     and gets its own case rather than riding on whichever card happens to exercise it. */
  const withReminder = Classify.classify({
    typeLine: "Artifact",
    oracleText: "Whenever you cast a spell, proliferate. (Choose any number of permanents and/or " +
      "players with counters on them, then give each another counter of each kind already there.)"
  });
  const withoutParens = Classify.classify({
    typeLine: "Artifact",
    oracleText: "Whenever you cast a spell, proliferate."
  });
  assert.deepEqual(withReminder.triggers.slice().sort(), withoutParens.triggers.slice().sort());
  assert.ok(!withReminder.causes.includes("counter-placed"),
    "the reminder text's “give each another counter” must not read as a counter source");
});

ok("both faces of a two-faced card are read", () => {
  /* A double-faced card carries no top-level oracle_text at all -- the abilities live
     under card_faces. Reading only the top level would classify it as doing nothing,
     which draws an empty graph rather than an error. Scryfall's own shape is what
     reaches this module when the page looks a card up, so it is the shape tested. */
  const both = Classify.classify({
    type_line: "Creature — Human Cleric // Creature — Vampire",
    card_faces: [
      {oracle_text: "When this creature enters, draw a card."},
      {oracle_text: "Destroy target creature."}
    ]
  });
  assert.ok(both.roles.includes("draw"), "the front face's ability should be found");
  assert.ok(both.roles.includes("removal"), "and so should the back face's");
  assert.ok(both.produces.includes("card"));
});

ok("a card with a land face is filed as a land, exactly as the bake files it", () => {
  /* Surprising, and deliberate: `isLand` reads the whole type line, so a creature whose
     back face is a land counts as one and picks up no spell roles. That is what the bake
     committed for every such card in data/graph.json, and a browser that disagreed would
     put a card in a group the corpus never puts it in. Changed here only alongside a
     re-bake, which is why it is pinned rather than left to be discovered. */
  const dfc = Classify.classify({
    type_line: "Creature — Elf Druid // Land",
    card_faces: [{oracle_text: "{T}: Add {G}."}, {oracle_text: "Land face."}]
  });
  assert.ok(!dfc.roles.includes("ramp"), "role patterns are skipped once the type line says Land");
  assert.ok(dfc.roles.includes("lands"));
  assert.ok(dfc.produces.includes("mana"), "what it produces is read either way");
});

ok("a card record is read whatever case its fields are written in", () => {
  /* Scryfall answers in snake_case and the app holds cards in camelCase. The module is
     called from both, and a silent miss here would classify a real card as doing nothing
     at all -- which draws an empty graph rather than an error. */
  const snake = Classify.classify({type_line: "Creature — Goblin", oracle_text: "Draw a card.", keywords: ["Haste"]});
  const camel = Classify.classify({typeLine: "Creature — Goblin", oracleText: "Draw a card.", keywords: ["Haste"]});
  assert.deepEqual(snake, camel);
  assert.deepEqual(snake.tribes, ["Goblin"]);
  assert.deepEqual(snake.mechanics, ["haste"]);
  assert.ok(snake.roles.includes("draw"));
});

ok("a land does not pick up spell roles from its rules text", () => {
  const land = Classify.classify({typeLine: "Land", oracleText: "{T}: Add {G}. Draw a card."});
  assert.ok(!land.roles.includes("draw"), "role patterns are for spells; a land is filed as a land");
  assert.ok(land.roles.includes("lands"));
  assert.ok(land.produces.includes("card"), "what it produces is still true of it");
});

ok("nothing is listed twice, whichever table found it", () => {
  /* sac-outlet is reachable from both ROLE_PATTERNS and SUPPLY_TEXT, and creature-etb
     from both the doubler rule and the event table. The bake deduplicates on load into
     Neo4j; in the browser nothing does, so the module has to. */
  const both = Classify.classify({
    typeLine: "Creature — Human",
    oracleText: "Sacrifice a creature: Draw a card. Whenever a creature you control enters, " +
      "it triggers an additional time."
  });
  FIELDS.forEach((field) => {
    const list = both[field] || [];
    assert.equal(new Set(list).size, list.length, `${field} carries a duplicate: ${list.join(", ")}`);
  });
});

process.stdout.write(`\n${checks} checks passed over ${overlap.length} cards the bake and the catalog share.\n`);
