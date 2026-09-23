/* THE SELECTOR GRAMMAR: "ANOTHER TARGET CREATURE YOU CONTROL", AS DATA.
 *
 * `docs/engine/PLAN.md` §3.4 — "a small grammar for 'creature you control', 'another target
 * creature', 'each opponent', 'token', 'with mana value 2 or less', compiled by `filter.mjs` and
 * tested on its own" — and §6's phase 2.1, "schema, filter grammar with its own tests".
 *
 * Almost every card in Magic says WHICH things it affects, and almost every card says it in one of
 * a few dozen shapes. The selector is that sentence as data, and it is the piece the compiler
 * writes most often, so it is the piece most worth being unable to get subtly wrong.
 *
 * "ANOTHER" MEANS OTHER THAN THE SOURCE (CR 109.5), NOT "ANY OTHER ONE". A card that says
 * "whenever another creature you control enters" does not trigger off itself, and an engine that
 * reads `another` as "not the one we just picked" gets the same answer on almost every board and
 * the wrong one on the board that matters.
 *
 * "YOU CONTROL" IS THE ABILITY'S CONTROLLER, NOT THE CARD'S OWNER. A stolen creature's activated
 * ability says "you", and "you" is whoever is using it now.
 *
 * "TARGET" IS A RULE, NOT A LABEL (CR 115.4). Hexproof and shroud make a permanent an illegal
 * choice, and a selector that carries `target: true` has to enforce that — otherwise every card
 * that targets quietly ignores the one keyword that exists to stop it.
 *
 * THE GRAMMAR IS CLOSED. An unknown key is refused rather than ignored, because a compiler that
 * emits `manaValueMax` where the grammar says `manaValue` would produce a selector that silently
 * matches everything.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame} from "../game/engine/rules/turn.mjs";
import {compileSelector, selectMatching, SELECTOR_KEYS} from "../game/engine/script/filter.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const refuses = (fn, pattern, m) => { assert.throws(fn, pattern, m); checks += 1; };

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}]};
const creature = (over) => ({types: ["Creature"], power: 2, toughness: 2, ...over});

function board() {
  const s = createState(pod);
  beginGame(s);
  const mine = addObject(s, creature({card: "Mine", owner: 0, controller: 0, manaCost: "{1}{G}"}), "battlefield");
  const alsoMine = addObject(s, creature({card: "Also Mine", owner: 0, controller: 0, manaCost: "{4}{G}"}), "battlefield");
  const theirs = addObject(s, creature({card: "Theirs", owner: 1, controller: 1, manaCost: "{G}"}), "battlefield");
  const rock = addObject(s, {card: "Rock", types: ["Artifact"], owner: 0, controller: 0, manaCost: "{2}"}, "battlefield");
  const inHand = addObject(s, creature({card: "In Hand", owner: 0, controller: 0, manaCost: "{G}"}), "hand", 0);
  return {s, mine, alsoMine, theirs, rock, inHand};
}
const names = (state, ids) => ids.map((id) => state.objects[id].card).sort();

/* ---- the grammar is a closed set ---- */
{
  ok(Array.isArray(SELECTOR_KEYS) && SELECTOR_KEYS.length > 5, "the grammar declares its keys");
  ok(SELECTOR_KEYS.includes("types") && SELECTOR_KEYS.includes("controller"),
    "including the two every selector uses");
  refuses(() => compileSelector({manaValueMax: 2}), /manaValueMax|unknown|grammar/i,
    "a key the grammar does not have is refused — a compiler emitting manaValueMax where the grammar says manaValue would produce a selector that matches everything");
  refuses(() => compileSelector({types: "Creature"}), /list|array/i,
    "and types is a list, because 'artifact creature' is two of them");
}

/* ---- type and zone ---- */
{
  const {s} = board();
  eq(names(s, selectMatching(s, {what: "permanent", types: ["Creature"]}, {controller: 0})),
    ["Also Mine", "Mine", "Theirs"],
    "'creature' is every creature on the battlefield, whoever controls it");
  eq(names(s, selectMatching(s, {what: "permanent", types: ["Artifact"]}, {controller: 0})),
    ["Rock"], "and an artifact is not a creature");
  eq(selectMatching(s, {what: "permanent", types: ["Creature"]}, {controller: 0}).length, 3,
    "a card in hand is not a permanent (CR 110.1) — the battlefield is where permanents are");
  eq(names(s, selectMatching(s, {what: "card", zone: "hand", controller: "you"}, {controller: 0})),
    ["In Hand"], "and a card selector can look in a hand");
}

/* ---- "you control" is the ability's controller ---- */
{
  const {s} = board();
  eq(names(s, selectMatching(s, {what: "permanent", types: ["Creature"], controller: "you"}, {controller: 0})),
    ["Also Mine", "Mine"], "'creature you control' from seat 0 is seat 0's");
  eq(names(s, selectMatching(s, {what: "permanent", types: ["Creature"], controller: "you"}, {controller: 1})),
    ["Theirs"],
    "and the SAME selector from seat 1 is seat 1's — 'you' is whoever is using the ability, not whoever owns the card");
  eq(names(s, selectMatching(s, {what: "permanent", types: ["Creature"], controller: "opponent"}, {controller: 0})),
    ["Theirs"], "'an opponent controls' is the other side of it");
}

/* ---- "another" excludes the source (CR 109.5) ---- */
{
  const {s, mine} = board();
  eq(names(s, selectMatching(s, {what: "permanent", types: ["Creature"], controller: "you", another: true},
    {controller: 0, source: mine})),
    ["Also Mine"],
    "'another creature you control' does not include the permanent whose ability it is — which is why a 'whenever another creature enters' card does not trigger off itself");
  eq(names(s, selectMatching(s, {what: "permanent", types: ["Creature"], controller: "you"},
    {controller: 0, source: mine})),
    ["Also Mine", "Mine"], "and without `another` it does");
  refuses(() => selectMatching(s, {what: "permanent", another: true}, {controller: 0}),
    /source/i,
    "`another` with no source is a compiler bug, and is refused rather than quietly meaning 'any'");
}

/* ---- mana value ---- */
{
  const {s} = board();
  eq(names(s, selectMatching(s, {what: "permanent", types: ["Creature"], manaValue: {max: 2}}, {controller: 0})),
    ["Mine", "Theirs"], "'with mana value 2 or less'");
  eq(names(s, selectMatching(s, {what: "permanent", types: ["Creature"], manaValue: {min: 5}}, {controller: 0})),
    ["Also Mine"], "'with mana value 5 or greater'");
  eq(names(s, selectMatching(s, {what: "permanent", types: ["Creature"], manaValue: {exactly: 1}}, {controller: 0})),
    ["Theirs"], "and 'with mana value 1'");
}

/* ---- tokens ---- */
{
  const {s} = board();
  addObject(s, creature({card: "Goblin", owner: 0, controller: 0, token: true}), "battlefield");
  eq(names(s, selectMatching(s, {what: "permanent", types: ["Creature"], token: true}, {controller: 0})),
    ["Goblin"], "'token creature'");
  eq(names(s, selectMatching(s, {what: "permanent", types: ["Creature"], token: false}, {controller: 0})),
    ["Also Mine", "Mine", "Theirs"], "and 'nontoken creature' is the other half");
}

/* ---- players ---- */
{
  const {s} = board();
  eq(selectMatching(s, {what: "player", who: "opponent"}, {controller: 0}), [1, 2, 3],
    "'each opponent' is everyone else at the table, which in a four-player game is three people");
  eq(selectMatching(s, {what: "player", who: "you"}, {controller: 0}), [0], "'you' is one");
  eq(selectMatching(s, {what: "player", who: "any"}, {controller: 0}), [0, 1, 2, 3], "'each player' is all of them");
  s.players[2].lost = true;
  eq(selectMatching(s, {what: "player", who: "opponent"}, {controller: 0}), [1, 3],
    "and a player who is out is not a player any more (CR 800.4a)");
}

/* ---- targeting is a rule, not a label (CR 115.4) ---- */
{
  const {s, theirs} = board();
  s.objects[theirs].keywords = ["Hexproof"];
  eq(names(s, selectMatching(s, {what: "permanent", types: ["Creature"], target: true}, {controller: 0})),
    ["Also Mine", "Mine"],
    "hexproof makes a creature an illegal target for an opponent — a selector that carried `target` and ignored it would let every targeting card in the game ignore the keyword that exists to stop it");
  eq(names(s, selectMatching(s, {what: "permanent", types: ["Creature"], target: true}, {controller: 1})),
    ["Also Mine", "Mine", "Theirs"],
    "and from its own controller all three are legal, because hexproof does not stop you targeting your own creature (CR 702.11b) — the half people forget");
  eq(names(s, selectMatching(s, {what: "permanent", types: ["Creature"]}, {controller: 0})).length, 3,
    "while a selector that does not target is not affected by it at all");
}
{
  const {s, theirs} = board();
  s.objects[theirs].keywords = ["Shroud"];
  eq(selectMatching(s, {what: "permanent", types: ["Creature"], target: true}, {controller: 1}).length, 2,
    "shroud stops EVERYBODY, including its own controller — which is exactly how it differs from hexproof");
}
{
  const {s, mine} = board();
  /* Through the layers, so a creature granted hexproof this turn is protected by it. */
  s.effects = [{id: "grant", layer: 6, timestamp: 9, affects: {ids: [mine]}, apply: {addKeywords: ["Hexproof"]}}];
  eq(names(s, selectMatching(s, {what: "permanent", types: ["Creature"], target: true}, {controller: 1})),
    ["Also Mine", "Theirs"],
    "granted hexproof takes Mine off the list for an opponent — targeting legality reads the creature as it currently is, not as it was printed");
}

/* ---- a compiled selector is a predicate ---- */
{
  const {s, mine, theirs} = board();
  const match = compileSelector({what: "permanent", types: ["Creature"], controller: "you"});
  ok(typeof match === "function", "compiling a selector gives a predicate");
  ok(match(s, mine, {controller: 0}), "which answers for one candidate");
  ok(!match(s, theirs, {controller: 0}), "in both directions");
  ok(match(s, theirs, {controller: 1}), "and takes its context each time, so one compiled selector serves every seat");
}

/* ---- selectors are plain data ---- */
{
  const selector = {what: "permanent", types: ["Creature"], controller: "you", another: true, manaValue: {max: 3}};
  eq(JSON.parse(JSON.stringify(selector)), selector,
    "a selector is plain data, so it lives in a card script and travels to the compiler as a tool definition");
}

console.log(`engine-filter: ${checks} checks passed — "another" excludes the source, "you" is the ability's controller, targeting enforces hexproof and shroud, and the grammar refuses a key it does not have.`);
