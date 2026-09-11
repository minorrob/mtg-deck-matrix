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
const graph = require("../graph-payload.js").unpack(JSON.parse(await readFile(new URL("../data/graph.json", import.meta.url), "utf8")));

let checks = 0;
const ok = (label, fn) => { fn(); checks += 1; process.stdout.write(`  ok  ${label}\n`); };

const norm = (n) => String(n || "").toLowerCase().replace(/\s+/g, " ").trim();
const baked = new Map(graph.cards.map((c) => [norm(c.name), c]));
const FIELDS = ["roles", "requires", "causes", "triggers", "produces", "multiplies", "grants", "extends", "mechanics", "tribes", "wants", "makes", "wantsStat", "offersStat"];
/* WANTS names a tribe only from the vocabulary the bake was built with; the page passes
   the same facet, so this is the call the page makes. */
const TRIBES = new Set(graph.facets.tribes || []);
const sorted = (list) => (list || []).slice().sort().join("|");

const overlap = cards.filter((c) => baked.has(norm(c.name)));

ok("the catalog and the bake share enough cards to be worth comparing", () => {
  assert.ok(overlap.length > 1000,
    `only ${overlap.length} cards appear in both data/cards.json and data/graph.json`);
});

ok(`re-deriving ${overlap.length} baked cards from their rules text reproduces the bake`, () => {
  const wrong = [];
  overlap.forEach((card) => {
    const mine = Classify.classify(card, {tribes: TRIBES});
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
    /* A typed cast is caused by the type line rather than the rules text, so its
       cause side is causeType; both are causes the bake may name. */
    causes: new Set(Classify.EVENTS.filter((e) => e.cause || e.causeType).map((e) => e.id)),
    triggers: new Set(Classify.EVENTS.filter((e) => e.listen).map((e) => e.id)),
    produces: new Set(Classify.RESOURCES.filter((r) => r.produce).map((r) => r.id)),
    multiplies: new Set(Classify.MULTIPLIERS.map((m) => m.id)),
    grants: new Set(Classify.QUALITIES.map((q) => q.id)),
    extends: new Set(Classify.QUALITIES.map((q) => q.id).concat("keywords")),
    wantsStat: new Set(Classify.STAT_WANTS.map((q) => q.id)),
    offersStat: new Set(Classify.STAT_WANTS.map((q) => q.id))
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


/* ------------------------------------------------- the directed half of the model */

ok("a multiplier names the same thing its partner produces or fires", () => {
  /* The whole point of reusing the RESOURCES and EVENTS ids: Krenko PRODUCES token and
     Parallel Lives MULTIPLIES token, so the pair is a set intersection rather than a
     curated list. An id on only one side of that join is a dead column. */
  const resources = new Set(Classify.RESOURCES.map((r) => r.id));
  const events = new Set(Classify.EVENTS.map((e) => e.id));
  const orphans = Classify.MULTIPLIERS.map((m) => m.id)
    .filter((id) => id !== "trigger" && !resources.has(id) && !events.has(id));
  assert.deepEqual(orphans, [],
    `these multiplier ids match nothing any card produces or triggers on: ${orphans.join(", ")}`);
});

ok("the token and counter doublers are found, and Krenko is not one", () => {
  const doubling = Classify.classify({typeLine: "Enchantment", oracleText:
    "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\n" +
    "If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead."});
  assert.deepEqual(doubling.multiplies.slice().sort(), ["counter", "token"]);
  const krenko = Classify.classify({typeLine: "Legendary Creature - Goblin Warrior", oracleText:
    "{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control."});
  assert.deepEqual(krenko.multiplies, [], "making tokens is not multiplying them");
  assert.ok(krenko.produces.includes("token"), "and it is the other side of the same join");
});

ok("a trigger doubler names the event it doubles", () => {
  const pan = Classify.classify({typeLine: "Artifact", oracleText:
    "If an artifact or creature entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time."});
  assert.deepEqual(pan.multiplies, ["creature-etb"]);
  const delney = Classify.classify({typeLine: "Legendary Creature - Human Soldier", oracleText:
    "If a triggered ability of a creature you control with power 2 or less triggers, that ability triggers an additional time."});
  assert.deepEqual(delney.multiplies, ["trigger"],
    "a doubler that names no event gets the generic id, which pairs with anything that has a trigger");
});

ok("granting a quality is not the same as having one", () => {
  /* The case that decides whether Grants is a useful filter or noise: every evasive
     creature in Magic has "flying" in its text and almost none of them grant it. */
  const angel = Classify.classify({typeLine: "Creature - Angel", oracleText: "Flying, vigilance", keywords: ["Flying", "Vigilance"]});
  assert.deepEqual(angel.grants, [], "a flier grants nothing");
  const boots = Classify.classify({typeLine: "Artifact - Equipment", oracleText:
    "Equipped creature has hexproof and haste.\nEquip {1}", keywords: ["Equip"]});
  assert.deepEqual(boots.grants.slice().sort(), ["haste", "hexproof"]);
  assert.deepEqual(boots.extends, [], "one equipped creature is not the board");
  const counting = Classify.classify({typeLine: "Sorcery", oracleText:
    "Destroy target tapped creature. You gain 1 life for each creature you control with flying."});
  assert.deepEqual(counting.grants, [],
    "counting your fliers puts a giving verb and a quality in one sentence and gives nothing");
});

ok("extending is a board-wide grant, or a card that copies what is already there", () => {
  const heroic = Classify.classify({typeLine: "Instant", oracleText:
    "Permanents you control gain hexproof and indestructible until end of turn."});
  assert.deepEqual(heroic.extends.slice().sort(), ["hexproof", "indestructible"]);
  assert.deepEqual(heroic.grants.slice().sort(), ["hexproof", "indestructible"],
    "a board-wide grant is still a grant");
  const single = Classify.classify({typeLine: "Creature - Dwarf Artificer", oracleText:
    "At the beginning of combat on your turn, target artifact creature you control gets +2/+2 and gains indestructible until end of turn."});
  assert.deepEqual(single.extends, [], "one target is not the board");
  assert.deepEqual(single.grants, ["indestructible"]);
  const cauldron = Classify.classify({typeLine: "Legendary Artifact", oracleText:
    "Creatures you control with +1/+1 counters on them have all activated abilities of all creature cards exiled with this artifact."});
  assert.deepEqual(cauldron.extends, ["keywords"],
    "a card that copies abilities cannot name in advance what it will spread");
});

ok("the bake carries the directed fields for every card, not only the ones tested here", () => {
  /* PRESENCE IS NOT THE PROOF ANY MORE. The export drops an empty array rather than ship
     7,777 copies of "[]", so "every card has a multiplies key" would now fail on a file
     that is perfectly correct. What proves the amplifier ran is the stamp it writes and
     the shape of what it found; what proves the trimming is honest is that no card carries
     an empty one. Both are checked, and the population bands are unchanged. */
  assert.ok(graph.amplifiersAt, "data/graph.json has no amplifiersAt stamp - re-run tools/graph-amplifiers.mjs");
  const wrongType = graph.cards.filter((c) => ["multiplies", "grants", "extends"]
    .some((f) => c[f] !== undefined && !Array.isArray(c[f])));
  assert.equal(wrongType.length, 0, `${wrongType.length} baked cards carry a non-array directed field`);
  const empty = graph.cards.filter((c) => Object.values(c).some((v) => Array.isArray(v) && !v.length));
  assert.equal(empty.length, 0,
    `${empty.length} baked cards ship an empty array; the export is meant to drop them`);
  const multipliers = graph.cards.filter((c) => (c.multiplies || []).length).length;
  const granters = graph.cards.filter((c) => (c.grants || []).length).length;
  assert.ok(multipliers > 100 && multipliers < 1500, `${multipliers} multipliers in ${graph.cards.length} cards`);
  assert.ok(granters > 300 && granters < 3000, `${granters} granters in ${graph.cards.length} cards`);
});

process.stdout.write(`\n${checks} checks passed over ${overlap.length} cards the bake and the catalog share.\n`);
