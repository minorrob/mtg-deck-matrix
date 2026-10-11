/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (w2c-hands-triggers): "WHENEVER YOU COMMIT A CRIME" (CR 700.13).
 *
 * A player commits a crime as they cast a spell, activate an ability or put a triggered ability on the stack that targets
 * an opponent, a permanent or spell an opponent controls, or a card in an opponent's graveyard (rules/stack.mjs,
 * crimeCommitted) -- once for that spell or ability, however many of its targets are an opponent's. Bandit's Haul: "this
 * ability triggers only once each turn". What the scenarios cannot reach: an activated ability's crime and a triggered
 * one's, a card in a graveyard, a spell on the stack, two of an opponent's at once, whose crime a trigger watches, and the
 * catalog's credit.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {crimeCommitted} from "../game/engine/rules/stack.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const ANY = [{anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]}];
const FIXTURES = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  /* "{T}: This deals 1 damage to any target." */
  Pinger: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "p", kind: "activated", text: "{T}: This deals 1 damage to any target.", cost: [{atom: "{T}"}],
    targets: ANY, effects: [{effect: "dealDamage", amount: 1, targets: {target: 0}, who: {target: 0}}]}]},
  /* "When this enters, it deals 1 damage to target player." */
  Spitter: {types: ["Creature"], manaCost: "{C}", colors: [], power: 1, toughness: 1, abilities: [{id: "s", kind: "triggered", text: "When this enters, it deals 1 damage to target player.",
    trigger: {on: "GameEventCardChangeZone", to: "Battlefield", who: "self"}, targets: [{what: "player"}], effects: [{effect: "dealDamage", amount: 1, who: {target: 0}}]}]},
  /* "Exile target card from a graveyard." */
  Hook: {types: ["Instant"], manaCost: "{C}", colors: [], spell: {id: "h", text: "Exile target card from a graveyard.", targets: [{what: "card", zone: "graveyard"}],
    effects: [{effect: "moveZone", targets: {target: 0}, to: "exile"}]}},
  /* "Counter target spell." */
  Nope: {types: ["Instant"], manaCost: "{C}", colors: [], spell: {id: "n", text: "Counter target spell.", targets: [{what: "spell"}], effects: [{effect: "counterSpell", spells: {target: 0}}]}},
  /* "Two target creatures each get -1/-1 until end of turn." */
  Pair: {types: ["Instant"], manaCost: "{C}", colors: [], spell: {id: "w", text: "Two target creatures each get -1/-1 until end of turn.",
    targets: [{what: "permanent", types: ["Creature"]}, {what: "permanent", types: ["Creature"]}], effects: [{effect: "pump", targets: {target: 0}, power: -1, toughness: -1}, {effect: "pump", targets: {target: 1}, power: -1, toughness: -1}]}},
  /* "When this enters, up to one target creature gets -1/-1 until end of turn." */
  Shrinker: {types: ["Creature"], manaCost: "{C}", colors: [], power: 1, toughness: 1, abilities: [{id: "k", kind: "triggered", text: "When this enters, up to one target creature gets -1/-1 until end of turn.",
    trigger: {on: "GameEventCardChangeZone", to: "Battlefield", who: "self"}, targets: [{what: "permanent", types: ["Creature"], count: {min: 0, max: 1}}],
    effects: [{effect: "pump", targets: {target: 0}, power: -1, toughness: -1}]}]},
  /* "Whenever an opponent commits a crime, you gain 1 life." */
  Witness: {types: ["Enchantment"], manaCost: "{1}", colors: [], abilities: [{id: "o", kind: "triggered", text: "Whenever an opponent commits a crime, you gain 1 life.",
    trigger: {on: "GameEventCrimeCommitted", criminal: "opponent"}, effects: [{effect: "gainLife", amount: 1}]}]},
};
const play = (scenario) => runScenario({expect: [], ...scenario}, cards.definition, FIXTURES);
const crimes = (events) => events.filter((e) => e.kind === "GameEventCrimeCommitted").map((e) => e.data.fields.player.playerId);

{
  /* An activated ability at Maya: a crime, Rob's; at his own Bear, none. */
  const at0 = play({name: "pinger", setup: [at(0, "battlefield", "Pinger"), at(1, "battlefield", "Bear")], steps: [{activate: "Pinger", targets: [{player: 1}]}]});
  eq(crimes(at0.events), [0], "{T} at Maya: Rob commits a crime");
  const own = play({name: "own", setup: [at(0, "battlefield", "Pinger", "Bear")], steps: [{activate: "Pinger", targets: [{card: "Bear", seat: 0}]}]});
  eq(crimes(own.events), [], "at his own Bear: none");
}
{
  /* A triggered ability, as it is put on the stack aimed at Maya: a crime then -- and none for the spell, which targets
     nothing. Aimed at Rob himself: none. */
  const spit = (player) => play({name: "spit", setup: [at(0, "battlefield", "Wastes"), at(0, "hand", "Spitter")],
    steps: [{tap: "Wastes"}, {cast: "Spitter"}, {resolve: true}, {choose: [player]}]});
  eq(crimes(spit("Maya").events), [0], "the trigger at Maya: a crime");
  eq(crimes(spit("Rob").events), [], "at Rob: none");
}
{
  /* A card in Maya's graveyard is hers: a crime; one in Rob's own, none. */
  const hook = (seat) => play({name: "hook", setup: [at(0, "battlefield", "Wastes"), at(0, "hand", "Hook"), at(seat, "graveyard", "Bear")],
    steps: [{tap: "Wastes"}, {cast: "Hook", targets: [{card: "Bear"}]}]});
  eq([crimes(hook(1).events), crimes(hook(0).events)], [[0], []], "her graveyard's card: a crime; his own: none");
}
{
  /* Rob's spell on the stack is his: Maya countering it commits a crime -- his Hook, at his own graveyard's card, none. */
  const nope = play({name: "nope", setup: [at(0, "battlefield", "Wastes"), at(0, "hand", "Hook"), at(0, "graveyard", "Bear"), at(1, "battlefield", "Wastes"), at(1, "hand", "Nope")],
    steps: [{tap: "Wastes"}, {cast: "Hook", targets: [{card: "Bear"}]}, {pass: 1}, {tap: "Wastes", seat: 1}, {cast: "Nope", seat: 1, targets: "any"}]});
  eq(crimes(nope.events), [1], "Maya's counter at Rob's spell: her crime, and his Hook none");
  /* Bandit's Haul, Rob's, watches his crimes alone: hers puts no loot counter on it. */
  const haul = play({name: "haul", setup: [at(0, "battlefield", "Wastes", "Bandit's Haul"), at(0, "hand", "Hook"), at(0, "graveyard", "Bear"), at(1, "battlefield", "Wastes"), at(1, "hand", "Nope")],
    steps: [{tap: "Wastes"}, {cast: "Hook", targets: [{card: "Bear"}]}, {pass: 1}, {tap: "Wastes", seat: 1}, {cast: "Nope", seat: 1, targets: "any"}]});
  const loot = Object.values(haul.state.objects).find((o) => o.card === "Bandit's Haul").counters.loot ?? 0;
  eq([haul.state.stack.length, loot], [2, 0], "her crime: nothing of his triggers");
}
{
  /* A creature of Maya's that Rob controls is his, not hers: no crime (CR 700.13, "controls"). */
  const {state} = play({name: "stolen", setup: [at(0, "battlefield", "Pinger"), at(1, "battlefield", "Bear")]});
  const bear = Object.values(state.objects).find((o) => o.card === "Bear");
  bear.controller = 0;
  eq(crimeCommitted(state, {playerId: 0, stackId: 9, targets: [{kind: "object", id: bear.id}]}).length, 0, "his to control: no crime");
  bear.controller = 1;
  eq(crimeCommitted(state, {playerId: 0, stackId: 9, targets: [{kind: "object", id: bear.id}]}).length, 1, "hers again: a crime");
}
{
  /* A trigger with a counted target ("up to one target creature"), picked as it is put on the stack: Maya's Bear, a crime. */
  const {events} = play({name: "counted", setup: [at(0, "battlefield", "Wastes"), at(0, "hand", "Shrinker"), at(1, "battlefield", "Bear")],
    steps: [{tap: "Wastes"}, {cast: "Shrinker"}, {resolve: true}, {choose: ["Bear (Maya's)"]}]});
  eq(crimes(events), [0], "the counted target Maya's: a crime");
}
{
  /* Two targets, one of them Maya's: one crime. Witness, Rob's, sees no crime of his own; Maya's does. */
  const counter = play({name: "nope2", setup: [at(0, "battlefield", "Wastes", "Witness"), at(0, "hand", "Pair"), at(0, "battlefield", "Bear"), at(1, "battlefield", "Bear", "Witness")],
    steps: [{tap: "Wastes"}, {cast: "Pair", targets: [{card: "Bear", seat: 1}, {card: "Bear", seat: 0}]}, {resolve: true}, {resolve: true}]});
  eq(crimes(counter.events), [0], "two targets, one of them Maya's: one crime");
  eq([counter.state.players[0].life, counter.state.players[1].life], [40, 41], "Maya's Witness (an opponent's crime) gains her 1; Rob's own does not");
}
{
  /* The catalog: Bandit's Haul's CommitCrime trigger is one the engine builds. */
  eq(missingFor({apis: ["PutCounter", "Mana", "Draw"], triggers: ["CommitCrime"], options: ["ActivationLimit"]}).filter((m) => m.kind === "trigger"), [], "nothing of its triggers missing");
}

console.log(`engine-crime: ${checks} checks passed -- a crime is a spell cast, an ability activated or a trigger put on the stack aimed at an opponent or what is theirs, once for it, and "whenever you commit a crime" reads whose.`);
