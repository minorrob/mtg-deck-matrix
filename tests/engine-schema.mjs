/* `CrankCardScript@1`: WHAT A CARD DEFINITION IS ALLOWED TO SAY.
 *
 * `docs/engine/PLAN.md` §3.4, and §6's phase 2.1. Thirty-one thousand of these will be written by a
 * model, so the schema is not documentation — it is the thing standing between a plausible-looking
 * generated document and a game that plays it wrong.
 *
 * EVERY EFFECT NAMES A PRIMITIVE FROM THE CATALOG. This is the reason 2.1a came first. A schema
 * that accepted any string for `effect` would accept `destroyCreature` — which is not a primitive,
 * reads perfectly, and would compile, validate, ship and then do nothing. "Unsupported is loud"
 * (principle 6) has to be enforced somewhere, and this is the somewhere.
 *
 * EVERY ABILITY CARRIES THE ORACLE SENTENCE IT IMPLEMENTS. §3.2.5: a definition carries the text it
 * was written from, so it can be re-checked when the text changes. Without it, a card whose oracle
 * text is errata'd has a definition nobody can tell is now wrong, among thirty-one thousand others.
 *
 * `reveals` IS THE UNUSUAL ONE AND IT EARNS ITS PLACE. A card declares what information it exposes
 * and to whom, so the hidden-information property test of 1.10 has something to check a card
 * against — otherwise the first card that says "look at target player's hand" either leaks by
 * accident or is indistinguishable from a leak.
 *
 * VALIDATION RETURNS A LIST, NOT THE FIRST PROBLEM. The compiler retries against the errors, so it
 * needs all of them; a validator that stops at the first one turns a fixable document into as many
 * round trips as it has mistakes, at thirty-one thousand cards.
 */
import assert from "node:assert/strict";
import {validateScript, assertScript, SCRIPT_SCHEMA} from "../game/engine/script/schema.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const bad = (script, pattern, m) => {
  const result = validateScript(script);
  assert.ok(!result.valid, `${m} (expected invalid)`);
  assert.ok(result.errors.some((e) => pattern.test(e.message) || pattern.test(e.path)),
    `${m} — errors were ${JSON.stringify(result.errors)}`);
  checks += 1;
};

/* The three cards phase 3 starts with, written the way a definition actually looks. */
const BEARS = {
  schema: SCRIPT_SCHEMA,
  identity: {name: "Grizzly Bears", oracleId: "a1b2", types: ["Creature"], subtypes: ["Bear"],
    manaCost: "{1}{G}", colors: ["G"], colorIdentity: ["G"], power: 2, toughness: 2},
  oracleText: "",
  abilities: [],
};
const ELVES = {
  schema: SCRIPT_SCHEMA,
  identity: {name: "Llanowar Elves", oracleId: "c3d4", types: ["Creature"], subtypes: ["Elf", "Druid"],
    manaCost: "{G}", colors: ["G"], colorIdentity: ["G"], power: 1, toughness: 1},
  oracleText: "{T}: Add {G}.",
  abilities: [
    {kind: "activated", text: "{T}: Add {G}.", mana: true, cost: [{atom: "{T}"}],
      effects: [{effect: "addMana", mana: {G: 1}}]},
  ],
};
const BOLT = {
  schema: SCRIPT_SCHEMA,
  identity: {name: "Lightning Bolt", oracleId: "e5f6", types: ["Instant"], subtypes: [],
    manaCost: "{R}", colors: ["R"], colorIdentity: ["R"], power: null, toughness: null},
  oracleText: "Lightning Bolt deals 3 damage to any target.",
  abilities: [
    {kind: "spell", text: "Lightning Bolt deals 3 damage to any target.",
      targets: [{what: "permanent", types: ["Creature"], target: true}],
      effects: [{effect: "dealDamage", amount: 3, to: "target"}]},
  ],
};

/* ---- the three real ones validate ---- */
{
  for (const [name, script] of [["Grizzly Bears", BEARS], ["Llanowar Elves", ELVES], ["Lightning Bolt", BOLT]]) {
    const result = validateScript(script);
    eq(result.errors, [], `${name} validates, and says nothing about it`);
    ok(result.valid, `${name} is valid`);
    checks -= 1;
  }
  checks += 1;
  ok(() => assertScript(BOLT), "and assertScript lets a good one through");
}

/* ---- the envelope ---- */
{
  bad({...BOLT, schema: "CrankCardScript@99"}, /schema/i, "a script from a schema this engine does not speak");
  bad({...BOLT, schema: undefined}, /schema/i, "or from none at all");
  bad({...BOLT, identity: undefined}, /identity/i, "a script without an identity");
  bad({...BOLT, identity: {...BOLT.identity, name: ""}}, /name/i, "or without a name");
  bad({...BOLT, identity: {...BOLT.identity, oracleId: undefined}}, /oracleId/i,
    "or without the oracle id, which is how a definition is matched to a card at all");
  bad({...BOLT, identity: {...BOLT.identity, types: []}}, /types/i, "a card has at least one type");
  bad({...BOLT, abilities: undefined}, /abilities/i, "and abilities is a list even when it is empty");
}

/* ---- every effect names a primitive from the catalog ---- */
{
  bad({...BOLT, abilities: [{...BOLT.abilities[0], effects: [{effect: "destroyCreature", amount: 1}]}]},
    /destroyCreature|primitive/i,
    "THE CHECK 2.1a EXISTS FOR: destroyCreature is not a primitive, reads perfectly, and would otherwise compile, validate, ship and do nothing");
  bad({...BOLT, abilities: [{...BOLT.abilities[0], effects: [{effect: "dealDamge", amount: 3}]}]},
    /dealDamge|primitive/i, "and a one-letter typo in a real one is caught the same way");
  bad({...BOLT, abilities: [{...BOLT.abilities[0], effects: []}]}, /effects/i,
    "a spell ability that does nothing is a definition somebody forgot to finish");
}

/* ---- every ability carries the sentence it implements (§3.2.5) ---- */
{
  bad({...BOLT, abilities: [{...BOLT.abilities[0], text: undefined}]}, /text/i,
    "an ability without its oracle sentence cannot be re-checked when the card is errata'd");
  bad({...BOLT, abilities: [{...BOLT.abilities[0], text: "   "}]}, /text/i, "nor can an empty one");
  bad({...BOLT, abilities: [{...BOLT.abilities[0], kind: "vibes"}]}, /kind|vibes/i,
    "and an ability is one of the six kinds, not a seventh somebody invented");
}

/* ---- each kind is held to what its engine module needs ---- */
{
  bad({...ELVES, abilities: [{kind: "triggered", text: "Whenever this dies, draw a card.",
    effects: [{effect: "draw", count: 1}]}]},
    /trigger/i, "a triggered ability says what it triggers on");
  bad({...ELVES, abilities: [{kind: "triggered", text: "x", trigger: {on: "creature-dies"},
    effects: [{effect: "draw", count: 1}]}]},
    /creature-dies|trigger event/i,
    "and it says it in the ENGINE's vocabulary — 'creature-dies' is the app's word for it, and the two are bridged, not interchangeable");
  ok(validateScript({...ELVES, abilities: [{kind: "triggered", text: "x", trigger: {on: "dies"},
    effects: [{effect: "draw", count: 1}]}]}).valid, "the engine's spelling is accepted");
}
{
  bad({...ELVES, abilities: [{kind: "keyword", text: "Flying", keyword: "Flyign"}]},
    /Flyign|keyword/i, "a keyword ability names a keyword the engine declares");
  ok(validateScript({...ELVES, abilities: [{kind: "keyword", text: "Flying", keyword: "flying"}]}).valid,
    "and a real one passes");
  bad({...ELVES, abilities: [{kind: "keyword", text: "Saga", keyword: "saga chapters"}]},
    /saga chapters|keyword/i,
    "while a construct family that §12.2 filed under Keywords is not grantable and is refused — which is what splitting them in 2.1a was for");
}
{
  bad({...ELVES, abilities: [{kind: "static", text: "Creatures you control get +1/+1.",
    affects: {what: "permanent", types: ["Creature"]}, apply: {power: 1, toughness: 1}}]},
    /layer/i, "a static ability says which layer it applies in (CR 613), because nothing can order it otherwise");
  ok(validateScript({...ELVES, abilities: [{kind: "static", text: "Creatures you control get +1/+1.",
    layer: 7, sublayer: "c", affects: {what: "permanent", types: ["Creature"], controller: "you"},
    apply: {power: 1, toughness: 1}}]}).valid, "and with one it is accepted");
  bad({...ELVES, abilities: [{kind: "static", text: "x", layer: 9, affects: {what: "permanent"}, apply: {}}]},
    /layer/i, "there is no layer nine");
}
{
  /* A static that changes a rule rather than a characteristic names the rule (rules/statics.mjs) instead of a layer. */
  ok(validateScript({...ELVES, abilities: [{kind: "static", text: "Each creature assigns combat damage equal to its toughness rather than its power.",
    rule: "combat-damage-by-toughness", affects: {what: "permanent", types: ["Creature"]}}]}).valid,
    "a static that changes a rule names it, and needs no layer");
  bad({...ELVES, abilities: [{kind: "static", text: "x", rule: "creatures-fly-sometimes", affects: {what: "permanent"}}]},
    /creatures-fly-sometimes|rule/i, "a rule nothing in the engine reads is refused by name: the list is closed");
  bad({...ELVES, abilities: [{kind: "static", text: "x", rule: "combat-damage-by-toughness"}]},
    /affects/i, "and it still says what it affects");
}
{
  bad({...ELVES, abilities: [{kind: "replacement", text: "If a creature would die, exile it instead.",
    change: {to: "exile"}}]},
    /watches/i, "a replacement effect says what event it is watching for");
  ok(validateScript({...ELVES, abilities: [{kind: "replacement", text: "If a creature would die, exile it instead.",
    watches: {event: "zone-change", from: "battlefield", to: "graveyard"}, change: {to: "exile"}}]}).valid,
    "and with one it is accepted");
}
{
  bad({...ELVES, abilities: [{kind: "activated", text: "{T}: Add {G}.", effects: [{effect: "addMana", mana: {G: 1}}]}]},
    /cost/i, "an activated ability has a cost — one with none is a free ability nobody wrote");
}

/* ---- selectors in a script go through the same grammar ---- */
{
  bad({...BOLT, abilities: [{...BOLT.abilities[0],
    targets: [{what: "permanent", manaValueMax: 2}]}]},
    /manaValueMax|grammar|selector/i,
    "a target selector is held to the selector grammar, so a key it does not have is caught here rather than matching everything at runtime");
}

/* ---- composers nest, and their children are checked too ---- */
{
  ok(validateScript({...BOLT, abilities: [{...BOLT.abilities[0], effects: [
    {effect: "sequence", effects: [{effect: "draw", count: 1}, {effect: "gainLife", amount: 2}]},
  ]}]}).valid, "a sequence of two real primitives is fine");
  bad({...BOLT, abilities: [{...BOLT.abilities[0], effects: [
    {effect: "sequence", effects: [{effect: "draw", count: 1}, {effect: "gainLyfe", amount: 2}]},
  ]}]}, /gainLyfe/i,
    "and a typo INSIDE a composer is caught — a validator that only checked the top level would pass every nested mistake");
  bad({...BOLT, abilities: [{...BOLT.abilities[0], effects: [
    {effect: "modal", modes: [{text: "Draw", effects: [{effect: "nonsense"}]}]},
  ]}]}, /nonsense/i, "including inside a mode");
}

/* ---- reveals, which is what lets 1.10 check a card ---- */
{
  ok(validateScript({...BOLT, abilities: [{...BOLT.abilities[0],
    reveals: [{what: "hand", of: "target", to: "controller"}]}]}).valid,
    "an ability can declare what it exposes and to whom");
  bad({...BOLT, abilities: [{...BOLT.abilities[0], reveals: [{what: "everything"}]}]},
    /everything|reveals|what/i, "and the vocabulary for that is closed too");
  bad({...BOLT, abilities: [{...BOLT.abilities[0], reveals: [{what: "hand", of: "target"}]}]},
    /to\b/i, "a reveal that does not say TO WHOM is the one that cannot be checked at all");
}

/* ---- every error says where ---- */
{
  const result = validateScript({...BOLT, abilities: [{...BOLT.abilities[0], effects: [{effect: "nope"}]}]});
  ok(result.errors.length > 0, "a bad script reports errors");
  ok(result.errors.every((e) => typeof e.path === "string" && e.path.length > 0),
    "each one saying where it is, because the compiler retries against them");
  ok(result.errors[0].path.includes("abilities[0]"),
    "and the path points at the ability, not at the document");
}
{
  const result = validateScript({...BOLT, identity: {...BOLT.identity, name: ""},
    abilities: [{...BOLT.abilities[0], text: "", effects: [{effect: "nope"}]}]});
  ok(result.errors.length >= 3,
    "ALL the problems, not the first — the compiler retries against the errors, and one at a time turns a fixable document into as many round trips as it has mistakes");
}

/* ---- assertScript is the loud form ---- */
{
  assert.throws(() => assertScript({...BOLT, abilities: [{...BOLT.abilities[0], effects: [{effect: "nope"}]}]}),
    /nope/, "assertScript throws with the problem in the message"); checks += 1;
}

console.log(`engine-schema: ${checks} checks passed — every effect names a declared primitive, every ability carries its oracle sentence, each kind is held to what its engine module needs, and all the errors come back at once.`);
