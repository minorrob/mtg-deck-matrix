/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WHERE A PERMANENT CAME FROM, AND A TARGET OF A SPELL (Fblthp, the Lost; AI 1's Chulane deck, after the live game of
 * 2026-10-04).
 *
 * "When Fblthp enters, draw a card. If it entered from your library or was cast from your library, draw two cards instead."
 * The condition `cameFrom: "library"` (script/condition.mjs): the permanent the trigger is about entered the battlefield
 * from its controller's library (effects/zones.mjs records it) or was cast from it (rules/stack.mjs) -- read on the
 * permanent, or, once it is gone, as the trigger saw it (rules/trigger.mjs keeps it, CR 608.2h). An opponent's library is
 * not "your library"; a card exiled from a library and cast from exile was cast from exile (the card's ruling of
 * 2021-03-19). "When Fblthp becomes the target of a spell, shuffle Fblthp into its owner's library": any spell, its own
 * controller's too, and not an ability's target.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const FB = "Fblthp, the Lost";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const sorcery = (cost, text, effects, targets = []) => ({types: ["Sorcery"], manaCost: cost, colors: ["U"], spell: {id: "s", text, targets, effects}});
const FIX = {
  Lens: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "p", kind: "static", text: "You may cast spells from the top of your library.", rule: "play-from",
    zone: "library-top", spells: true, affects: {what: "player", who: "you"}}]},
  Pilfer: sorcery("{U}", "Put the top card of target opponent's library onto the battlefield under your control.", [{effect: "moveZone", fromTop: 1, who: "opponent", to: "battlefield", controller: "you"}]),
  Glimpse: sorcery("{U}", "Exile the top card of your library. You may play it this turn.", [{effect: "moveZone", fromTop: 1, to: "exile", remember: true}, {effect: "mayPlay", targets: "remembered"}]),
  Shield: {types: ["Instant"], manaCost: "{U}", colors: ["U"], spell: {id: "s", text: "Target creature gains hexproof until end of turn.", targets: [{what: "permanent", types: ["Creature"]}],
    effects: [{effect: "pump", targets: {target: 0}, keywords: ["Hexproof"]}]}},
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
const play = (scenario) => runScenario({name: "came from", setup: [], ...scenario}, index.definition, FIX).state;
const hand = (s, seat = 0) => s.zones.hand[seat].length;
const rng = createRng("came from");

{
  /* From an opponent's library, under Rob's control: not his library -- one card. */
  const s = play({library: [FB], setup: [at(0, "battlefield", "Island"), at(0, "hand", "Pilfer")], steps: [{tap: "Island"}, {cast: "Pilfer"}, {resolve: true}, {resolve: true}]});
  const fb = s.zones.battlefield.find((id) => s.objects[id].card === FB);
  eq([s.objects[fb].owner, s.objects[fb].controller, s.objects[fb].cameFrom], [1, 0, {zone: "library", owner: 1}], "Maya's Fblthp, from her library, under Rob's control");
  eq(hand(s), 1, "Rob draws one, not two");
}
{
  /* Cast from his library, and gone before its trigger resolves: as the trigger saw it, two cards. */
  const s = play({library: [FB], setup: [at(0, "battlefield", "Island", "Wastes", "Lens")], steps: [{tap: "Island"}, {tap: "Wastes"}, {cast: FB}, {resolve: true}]});
  const fb = s.zones.battlefield.find((id) => s.objects[id].card === FB);
  eq([s.objects[fb].cameFrom, s.stack[0]?.about?.cameFrom], [{zone: "library", owner: 0, cast: true}, {zone: "library", owner: 0, cast: true}], "cast from it: on the permanent, and kept with its trigger");
  runEffect(s, {effect: "moveZone", targets: [fb], to: "hand"}, {controller: 1, source: null});
  for (let n = 0; n < 6 && s.stack.length; n += 1) passPriority(s, null, rng);
  eq(hand(s), 3, "returned to his hand in response: Fblthp and the two cards it still draws");
}
{
  /* Exiled from his library and cast from exile: cast from exile (the card's ruling) -- one card. */
  const s = play({library: [FB], setup: [at(0, "battlefield", "Island", "Island", "Wastes"), at(0, "hand", "Glimpse")],
    steps: [{tap: "Island"}, {cast: "Glimpse"}, {resolve: true}, {tap: "Island"}, {tap: "Wastes"}, {cast: FB}, {resolve: true}, {resolve: true}]});
  eq([hand(s), s.objects[s.zones.battlefield.find((id) => s.objects[id].card === FB)].cameFrom], [1, undefined], "from exile: one card, and no record of a library");
}
{
  /* Any spell: Rob's own Shield targets it -- shuffled in, and the Shield, its only target gone, does nothing. */
  const s = play({setup: [at(0, "battlefield", FB, "Island"), at(0, "hand", "Shield")], steps: [{tap: "Island"}, {cast: "Shield", targets: [{card: FB}]}, {resolve: true}, {resolve: true}]});
  eq([s.zones.battlefield.some((id) => s.objects[id].card === FB), s.zones.library[0].length, s.zones.graveyard[0].map((id) => s.objects[id].card)], [false, 21, ["Shield"]],
    "his own spell: Fblthp into his library, the Shield to his graveyard");
}
{
  /* A spell aimed at another creature does not trigger it. */
  const s = play({setup: [at(0, "battlefield", FB, "Bear", "Island"), at(0, "hand", "Shield")], steps: [{tap: "Island"}, {cast: "Shield", targets: [{card: "Bear"}]}]});
  eq(s.stack.length, 1, "the Shield on the Bear: nothing of Fblthp's");
}

/* The condition: what it reads, and what it refuses. */
{
  const s = play({setup: [at(0, "battlefield", "Bear")], steps: []});
  const bear = s.zones.battlefield[0];
  eq(conditionHolds(s, {cameFrom: "library"}, {controller: 0, source: bear}), false, "a permanent with no record: no");
  s.objects[bear].cameFrom = {zone: "library", owner: 0};
  eq([conditionHolds(s, {cameFrom: "library"}, {controller: 0, source: bear}), conditionHolds(s, {cameFrom: "library"}, {controller: 1, source: bear})], [true, false],
    "from Rob's library: yes for Rob, no for anyone else");
  eq(conditionHolds(s, {cameFrom: "library"}, {controller: 0, source: null, about: {card: 999, cameFrom: {zone: "library", owner: 0}}}), true, "gone: as the trigger saw it");
  const script = (condition) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "t", types: ["Creature"], manaCost: "{1}", power: 1, toughness: 1}, oracleText: "x",
    abilities: [{kind: "triggered", text: "x", trigger: {on: "enters"}, effects: [{effect: "branch", if: condition, then: [{effect: "draw", count: 2}], otherwise: [{effect: "draw", count: 1}]}]}]});
  eq([validateScript(script({cameFrom: "library"})).valid, validateScript(script({cameFrom: "graveyard"})).valid], [true, false], "cameFrom a library: valid; a graveyard: not built, refused");
  eq(missingFor({apis: ["Draw", "ChangeZone"], options: ["Count"], counts: ["wasCastFromYourLibrary"]}), [], "the catalog: \"was cast from your library\" is built");
}

console.log(`engine-came-from: ${checks} checks passed -- entered from or cast from your library, kept with its trigger; an opponent's library, or a cast from exile, is not; and any spell's target is shuffled in.`);
