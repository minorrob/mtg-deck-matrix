/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ROB'S PRIORITY BATCH 10.3, THE SECOND SLICE: WHAT ITS SCENARIOS CANNOT REACH.
 *
 * Twenty-one more cards from Rob's list (2026-10-04), and the three things they needed:
 * - Exhaust (CR 702.177a): "Activate only once" -- `exhaust` on an activated ability, recorded on the object that
 *   activated it (rules/actions.mjs). A permanent that leaves and returns is a new object (CR 400.7) and may again.
 *   Rocketeer Boostbuggy, Rebellious Captives.
 * - An ability of a card in its owner's graveyard, from a definition: "{W}, Exile this card from your graveyard: ..."
 *   (Goldmeadow Nomad), offered there as encore's is.
 * - "Discard a creature card" as a cost (Fauna Shaman): a discard cost's `selector`, one offer per card it describes.
 * The scenarios play the cards; this suite holds the edges: exhaust across turns and zones, the graveyard ability nowhere
 * else and at sorcery speed only, and a hand with no creature card.
 */
import assert from "node:assert/strict";
import {moveObject} from "../game/engine/state/index.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Rock: {types: ["Artifact"], manaCost: "{1}", colors: []},
};
const play = (name, setup, steps, more = {}) => runScenario({name, setup, steps, ...more}, index.definition, FIX).state;
const named = (s, card, zone = "battlefield") => Object.values(s.objects).filter((o) => o.card === card && o.zone === zone);
const activations = (s, card, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "activate" && a.label === card);
/* Every untapped Wastes tapped: colorless only, so the pool pays a generic cost one way (rules/mana.mjs, automaticPayment). */
const tapAll = (s, seat = 0) => {
  for (let n = 0; n < 20; n += 1) {
    const tap = legalActions(s, seat).find((a) => a.kind === "activate-mana" && !s.objects[a.objectId].tapped && s.objects[a.objectId].card === "Wastes");
    if (!tap) return;
    applyAction(s, seat, tap);
  }
};

/* ---- exhaust ---- */
{
  /* Rocketeer Boostbuggy exhausted: never again this turn, nor the next of Rob's -- however much mana is in the pool. */
  const s = play("exhausted", [at(0, "battlefield", "Rocketeer Boostbuggy", ...Array(9).fill("Wastes"))],
    [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {activate: "Rocketeer Boostbuggy", ability: "a1"}, {resolve: true}]);
  tapAll(s);
  eq(activations(s, "Rocketeer Boostbuggy").filter((a) => a.abilityId === "a1").length, 0, "with six mana in the pool, exhaust is not offered again");
  const next = play("exhausted, two turns on", [at(0, "battlefield", "Rocketeer Boostbuggy", ...Array(6).fill("Wastes"))],
    [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {activate: "Rocketeer Boostbuggy", ability: "a1"}, {resolve: true}, {to: {turn: 3, phase: "MAIN1"}}]);
  tapAll(next);
  eq(activations(next, "Rocketeer Boostbuggy").filter((a) => a.abilityId === "a1").length, 0, "on Rob's next turn either: only once, not once a turn");
  /* Out and back: a new object (CR 400.7), whose exhaust is its own. */
  const buggy = named(next, "Rocketeer Boostbuggy")[0].id;
  const yard = moveObject(next, buggy, "graveyard", 0);
  moveObject(next, yard, "battlefield");
  eq(activations(next, "Rocketeer Boostbuggy").filter((a) => a.abilityId === "a1").length, 1, "returned to the battlefield, it may exhaust again");
  ok(!("exhausted" in named(next, "Rocketeer Boostbuggy")[0]), "the new object carries no record of the old one's");
}
{
  /* Each exhaust ability once, and each object its own: two Captives, one exhausted, the other still may. */
  const s = play("two captives", [at(0, "battlefield", "Rebellious Captives", "Rebellious Captives", "Forest", ...Array(12).fill("Wastes"))],
    [...Array(6).fill({tap: "Wastes"}), {activate: "Rebellious Captives", targets: [{card: "Forest"}]}, {resolve: true}]);
  tapAll(s);
  eq(activations(s, "Rebellious Captives").map((a) => a.objectId).filter((v, i, all) => all.indexOf(v) === i).length, 1, "the other Captives may still exhaust");
}

/* ---- an ability of a card in the graveyard ---- */
{
  /* Goldmeadow Nomad: from the graveyard only, and as a sorcery. */
  const inHand = play("in hand", [at(0, "battlefield", "Plains"), at(0, "hand", "Goldmeadow Nomad")], [{tap: "Plains"}]);
  eq(activations(inHand, "Goldmeadow Nomad").length, 0, "in hand, its ability is not offered");
  const onField = play("on the battlefield", [at(0, "battlefield", "Plains", "Goldmeadow Nomad")], [{tap: "Plains"}]);
  eq(activations(onField, "Goldmeadow Nomad").length, 0, "on the battlefield, nor there");
  const theirTurn = play("Maya's turn", [at(0, "battlefield", "Plains"), at(0, "graveyard", "Goldmeadow Nomad")], [{to: {turn: 2, phase: "MAIN1"}}, {pass: 1}, {tap: "Plains", seat: 0}]);
  eq([theirTurn.priorityPlayer, activations(theirTurn, "Goldmeadow Nomad").length], [0, 0], "on Maya's turn, with priority and {W}: not offered (sorcery speed)");
}

/* ---- "discard a creature card" ---- */
{
  const none = play("no creature card", [at(0, "battlefield", "Fauna Shaman", "Forest"), at(0, "hand", "Rock", "Lightning Bolt")], [{tap: "Forest"}]);
  eq(activations(none, "Fauna Shaman").length, 0, "a hand with no creature card: not offered");
  const two = play("two creature cards", [at(0, "battlefield", "Fauna Shaman", "Forest"), at(0, "hand", "Bear", "Bear", "Rock")], [{tap: "Forest"}]);
  eq(activations(two, "Fauna Shaman").map((a) => a.costNames).sort(), [["Bear"], ["Bear"]], "two creature cards: one offer each, the Rock none");
}

for (const name of ["Chomping Changeling", "Goldmeadow Nomad", "Lys Alana Informant", "Mistmeadow Council", "Morcant's Eyes", "Tend the Sprigs", "Wildvine Pummeler",
  "Flaring Cinder", "Stratosoarer", "Unwelcome Sprite", "Changeling Wayfinder", "Spectacular Tactics", "Blacksmith's Skill", "Harmonize", "Wander Off",
  "Ancestral Anger", "Eager Glyphmage", "Charging Strifeknight", "Rocketeer Boostbuggy", "Rebellious Captives", "Fauna Shaman"])
  ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-cards-pb2: ${checks} checks passed -- Rob's priority list, its next 21 cards: exhaust once per object, an ability of a card in the graveyard, "discard a creature card" as a cost.`);
