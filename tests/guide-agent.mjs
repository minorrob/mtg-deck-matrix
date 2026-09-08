// The agent that writes "How to play it".
//
// The guide is the one thing on the deck page a template cannot produce: a paragraph about
// what a hundred specific cards are trying to do together. It is also the easiest place in
// the app for a language model to be confidently wrong -- name a card the deck does not
// have, count something that is not there, and it reads exactly like the six hand-written
// guides beside it.
//
// So the checks are the product, not the prompt. What follows pins them, and the last one
// runs them over the six guides a person wrote by hand: if the checker is right, those pass.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Agent = require("../guide-agent.js");

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; console.log("  ok  " + label); };

const at = (p) => new URL(p, import.meta.url);
const guides = JSON.parse(readFileSync(at("../data/archive/deck-guides.json"), "utf8"));
const master = JSON.parse(readFileSync(at("../data/archive/master-v2.json"), "utf8"));
const universe = JSON.parse(readFileSync(at("../data/commander-universe.json"), "utf8"));
const registry = universe.cards.map((row) => row[universe.fields.indexOf("name")]);

const DECK = {
  id: "T1", label: "Test", commander: "Krenko, Mob Boss", colorIdentity: ["R"],
  shape: {lands: 36, creatures: 30, instants: 6, sorceries: 5, artifacts: 10,
    enchantments: 3, planeswalkers: 0, battles: 0, avgMv: 3.1, curve: {1: 4, 2: 12}},
  cards: [
    {name: "Krenko, Mob Boss", quantity: 1},
    {name: "Purphoros, God of the Forge", quantity: 1},
    {name: "Sol Ring", quantity: 1},
    {name: "Impact Tremors", quantity: 1},
    {name: "Mountain", quantity: 36}
  ]
};

const GOOD = {
  nickname: "Mono-Red Goblin Tokens",
  hook: "Krenko doubles your goblin count every turn, and Purphoros turns each new body into damage nobody can block.",
  archetype: "Goblin tokens with damage payoffs",
  difficulty: {tier: "Intermediate", why: "The decision each turn is whether to tap Krenko for bodies or attack with what you have, and getting that wrong costs the game."},
  whatItDoes: "Krenko, Mob Boss taps to double your goblins. Impact Tremors and Purphoros, God of the Forge turn every one of those bodies into damage that does not care about blockers, so the board does not have to connect to kill. Sol Ring is how Krenko lands a turn early.",
  howItWins: "Purphoros, God of the Forge with a Krenko activation is between nine and twenty damage split across the table, and Impact Tremors does the same more slowly.",
  turns: [
    {when: "Turns 1-3", do: "Land every turn and get Sol Ring down if you see it. Nothing else matters this early; the deck does not do anything until Krenko, Mob Boss is on the battlefield and untapped."},
    {when: "Turns 4-6", do: "Cast Krenko, Mob Boss and hold up whatever protection you have. If Impact Tremors is already down, activating Krenko is damage rather than only bodies."},
    {when: "Turns 7+", do: "Activate Krenko, Mob Boss, then attack with everything. Purphoros, God of the Forge makes the attack redundant on a table that has blockers."}
  ],
  mulligan: "Keep three or four lands with Sol Ring or a two-drop. A hand with no early play and no rock does nothing until turn six.",
  keyCards: [
    {name: "Krenko, Mob Boss", why: "The engine. Everything in the deck is either protecting him or converting what he makes."},
    {name: "Purphoros, God of the Forge", why: "Turns a board of goblins into reach the table cannot block or chump."},
    {name: "Impact Tremors", why: "The cheap version of Purphoros, and it comes down four turns earlier."},
    {name: "Sol Ring", why: "Krenko on turn three instead of turn five, which is most of the deck's win rate."}
  ],
  watchFor: [
    "One board wipe undoes six turns of work, and there is no protection in the deck for Krenko, Mob Boss himself.",
    "Thirty-six lands is a lot to draw when the deck's average mana value is low; a flooded hand does very little.",
    "Nothing here interacts with an opponent's combo, so a fast table wins before the goblins matter."
  ],
  upgradePath: "Skullclamp is the first add: a one-toughness goblin becomes two cards. Goblin Bombardment gives the board a sacrifice outlet that does not need an attack step."
};

/* ------------------------------------------------------- the request */

check("the request is the current API shape, not the one from a year ago", () => {
  const body = Agent.request(DECK);
  assert.equal(body.model, "claude-opus-5");
  assert.equal(body.output_config.format.type, "json_schema");
  assert.ok(body.output_config.format.schema, "no schema was attached");
  assert.ok(!("output_format" in body), "output_format is the old spelling and 400s now");
  assert.ok(!("thinking" in body) || body.thinking.type === "adaptive",
    "budget_tokens thinking is rejected on this model");
  assert.equal(body.messages.length, 1, "a prefilled assistant turn is rejected on this model");
  assert.equal(body.messages[0].role, "user");
});

check("the model is asked for prose and never for a number the app already knows", () => {
  const asked = Object.keys(Agent.SCHEMA.properties);
  ["id", "label", "commander", "colorIdentity", "shape", "score"].forEach((field) => {
    assert.ok(!asked.includes(field), `the model is being asked for ${field}, which is computed`);
  });
  // ...and it is asked for everything the renderer draws.
  ["nickname", "hook", "archetype", "difficulty", "whatItDoes", "howItWins", "turns",
    "mulligan", "keyCards", "watchFor", "upgradePath"].forEach((field) => {
    assert.ok(asked.includes(field), `the renderer draws ${field} and nothing produces it`);
  });
});

check("the counts it may quote are handed to it, so it never has to count", () => {
  const text = Agent.userText(DECK);
  assert.match(text, /Counts you may quote: 36 lands, 30 creatures/);
  assert.match(text, /Average mana value 3\.1/);
  assert.match(text, /^Krenko, Mob Boss$/m);
  assert.match(text, /^36x Mountain$/m);
  assert.match(Agent.SYSTEM, /Never state a count/);
});

check("merged, it is the record the viewer already renders", () => {
  const record = Agent.merge(GOOD, DECK);
  /* The shape is pinned against the archived six rather than the live file. The clean
     start emptied data/deck-guides.json -- the feature stays wired and finds nothing
     until a guide is generated -- but the record shape a generated guide has to match
     is still the shape the viewer renders, and the archive is where an example of it
     survives. */
  const shipped = Object.keys(guides.decks[0]);
  assert.deepEqual(Object.keys(record), shipped,
    "the merged record's fields must match the guide shape the viewer renders");
  assert.equal(record.commander, DECK.commander);
  assert.equal(record.shape, DECK.shape, "the shape is the app's, not the model's");
});

/* --------------------------------------------------------- the checks */

check("a guide that only names cards in the deck passes", () => {
  const out = Agent.check(GOOD, DECK, registry);
  assert.deepEqual(out.errors, []);
});

check("a key card the deck does not contain is an error, not a note", () => {
  const bad = {...GOOD, keyCards: GOOD.keyCards.concat([
    {name: "Goblin Bombardment", why: "A sacrifice outlet the deck does not actually have."}])};
  const out = Agent.check(bad, DECK, registry);
  assert.ok(out.errors.some((e) => /Goblin Bombardment/.test(e)), JSON.stringify(out.errors));
});

check("a real card named in the prose that the deck does not hold is an error", () => {
  /* This is the failure that matters. "Add Skullclamp and draw two cards a turn" reads
     exactly like the rest of the guide and describes a deck nobody has. */
  const bad = {...GOOD, howItWins: GOOD.howItWins + " Goblin Bombardment turns each token into damage."};
  const out = Agent.check(bad, DECK, registry);
  assert.ok(out.errors.some((e) => /Goblin Bombardment/.test(e)), JSON.stringify(out.errors));
});

check("upgradePath may name cards the deck does not have -- that is its job", () => {
  const out = Agent.check(GOOD, DECK, registry);
  assert.ok(/Skullclamp/.test(GOOD.upgradePath), "the fixture must exercise this");
  assert.ok(!out.errors.some((e) => /Skullclamp/.test(e)),
    "the one field whose purpose is naming cards to add was checked as if it were not");
});

check("a type count that contradicts the deck is an error", () => {
  /* In the same neighbourhood as the real figure, which is what a miscount looks like.
     A number far below it -- "three creatures fly over a stalled board" -- is about a
     board rather than about the list, and is deliberately not checked. */
  const bad = {...GOOD, whatItDoes: GOOD.whatItDoes + " Twenty-six creatures carry the plan."};
  const out = Agent.check(bad, DECK, registry);
  assert.ok(out.errors.some((e) => /Twenty-six creatures/.test(e) && /30 creatures/.test(e)),
    JSON.stringify(out.errors));
  const board = {...GOOD, howItWins: GOOD.howItWins + " Four creatures and a Purphoros trigger ends it."};
  assert.deepEqual(Agent.check(board, DECK, registry).errors, [],
    "a count about a board was read as a claim about the hundred");
});

check("a count nothing can check is flagged for a person, not rejected", () => {
  /* "Eleven cards discard on purpose" is the most useful sentence in the six hand-written
     guides and there is no way to verify it from a card list. Rejecting it would cost the
     guides their best line; asserting it silently would be worse. */
  const soft = {...GOOD, whatItDoes: GOOD.whatItDoes + " Eleven cards make a goblin when they land."};
  const out = Agent.check(soft, DECK, registry);
  assert.deepEqual(out.errors, [], "an unverifiable count is not an error");
  assert.ok(out.review.some((r) => /Eleven cards/.test(r)), JSON.stringify(out.review));
});

check("a card called back by one word is not a card the deck is missing", () => {
  /* "Swiftfoot Boots, Thousand-Year Elixir and Goblin Warchief all let him tap ... and the
     Elixir untaps him" is how the hand-written guides refer back to a card they already
     named in full. Elixir is also a real Magic card, so a one-word match called a correct
     sentence an invention. Every collision found in the six shipped guides was one word;
     every genuine reference was two or more. */
  const short = {...GOOD, howItWins: GOOD.howItWins + " The Ring untaps Krenko for a second activation."};
  assert.deepEqual(Agent.check(short, DECK, registry).errors, [],
    "a one-word callback was read as a card the deck does not contain");
  const full = {...GOOD, howItWins: GOOD.howItWins + " Thousand-Year Elixir untaps him."};
  assert.ok(Agent.check(full, DECK, registry).errors.some((e) => /Thousand-Year Elixir/.test(e)),
    "the full printed name of a card the deck lacks must still be caught");
});

check("a difficulty outside the three tiers is an error", () => {
  const bad = {...GOOD, difficulty: {tier: "Expert", why: GOOD.difficulty.why}};
  assert.ok(Agent.check(bad, DECK, registry).errors.some((e) => /Expert/.test(e)));
});

check("a missing field is an error rather than a blank panel", () => {
  const bad = {...GOOD};
  delete bad.mulligan;
  assert.ok(Agent.check(bad, DECK, registry).errors.some((e) => /missing mulligan/.test(e)));
});

check("a name with a comma in it is read as one name", () => {
  const spans = Agent.spansIn("Cast Krenko, Mob Boss and hold up Valorous Stance.");
  assert.ok(spans.includes("Krenko, Mob Boss"), JSON.stringify(spans));
  assert.ok(spans.includes("Valorous Stance"), JSON.stringify(spans));
});

/* ------------------------------------ the six a person wrote, checked */

check("the six hand-written guides pass their own checker", () => {
  /* The strongest test available: if the checker is right, guides a person wrote against
     these hundreds have nothing to fix. Anything it flags is either a bug in the checker
     or something genuinely wrong in a shipped guide, and both are worth a failure. */
  /* THE DECK THE GUIDE WAS WRITTEN ABOUT, which is the one in the workbook -- not the
     first pinned variant whose hundred happens to contain the same card. Quintorius,
     Loremaster is the commander of one deck and a member of the ninety-nine of another;
     pairing a guide with the wrong one reported twenty-four invented cards in a guide a
     person wrote correctly, which is a fine demonstration of why this check exists and a
     terrible way to run it. */
  const listFor = (commander) => {
    const deck = master.decks.find((d) => d.commander === commander);
    if (!deck) return null;
    return master.cards
      .filter((card) => Number((card.target || {})[deck.id] || 0) > 0)
      .map((card) => ({name: card.name, quantity: Number(card.target[deck.id])}));
  };
  const problems = [];
  for (const guide of guides.decks) {
    const list = listFor(guide.commander);
    if (!list) continue;                       // no pinned hundred leads with this commander
    const deck = {
      id: guide.id, label: guide.label, commander: guide.commander,
      colorIdentity: guide.colorIdentity, shape: guide.shape,
      cards: list.map((c) => ({name: c.name, quantity: c.quantity}))
    };
    const out = Agent.check(guide, deck, registry);
    if (out.errors.length) problems.push(`${guide.id} ${guide.commander}: ${out.errors.join("; ")}`);
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

check("the generator is a tool, and the key is not in the repository", () => {
  const tool = readFileSync(at("../tools/generate-guides.mjs"), "utf8");
  assert.match(tool, /process\.env\.ANTHROPIC_API_KEY/);
  assert.ok(!/sk-ant-/.test(tool), "an API key is in the source");
  assert.match(tool, /--call/, "the default must not spend money");
  const page = readFileSync(at("../legacy-decks.html"), "utf8");
  assert.ok(!/guide-agent\.js/.test(page),
    "the browser must not load the agent: there is no key there and nowhere to keep one");
});

console.log(`\nguide-agent: ${checks} checks passed.`);
