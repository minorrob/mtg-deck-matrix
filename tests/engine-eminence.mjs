/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* EMINENCE, AND "EACH PLAYER MILLS THAT MANY CARDS. FOR EACH PLAYER, YOU MAY CAST A CARD THAT PLAYER MILLED THIS WAY WITHOUT
 * PAYING ITS MANA COST" (The Ur-Sphinx; the live-game plan of 2026-10-04, lane W6).
 *
 * Eminence (rules/statics.mjs, costReduction): a "spells cost less" static that says `eminence` works from its owner's
 * command zone as well as the battlefield. "One or more Sphinxes you control attack" is about those attackers ("those
 * cards", rules/trigger.mjs), so "that many" counts them; mill remembers what it milled (script/effects/zones.mjs); and
 * play's `ownedBy: "that player"` casts from among that player's own (script/effects/asking.mjs), once for each player.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {costReduction} from "../game/engine/rules/statics.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const US = "The Ur-Sphinx";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
/* A commander with eminence for Sphinxes and a plain reduction for Bears: only the first works from the command zone. */
const TWO = compileScript({schema: "CrankCardScript@1", identity: {name: "Two Minds", oracleId: "x", supertypes: ["Legendary"], types: ["Creature"], subtypes: ["Sphinx"], manaCost: "{U}", colors: ["U"], colorIdentity: ["U"], power: 1, toughness: 1},
  oracleText: "x", source: "hand", abilities: [{kind: "static", text: "x", rule: "spells-cost-less", eminence: true, affects: {subtypes: ["Sphinx"], another: true}, amount: 1},
    {kind: "static", text: "y", rule: "spells-cost-less", affects: {subtypes: ["Bear"]}, amount: 1}]}).definition;
const FIX = {"Two Minds": TWO, "Little Sphinx": {types: ["Creature"], subtypes: ["Sphinx"], manaCost: "{2}{U}", colors: ["U"], power: 2, toughness: 2},
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
const play = (setup, steps = [], more = {}) => runScenario({name: "eminence", setup, steps, ...more}, index.definition, FIX).state;
const inHand = (s, card, seat = 0) => s.zones.hand[seat].find((id) => s.objects[id].card === card);

{
  const s = play([at(0, "command", US), at(0, "hand", "Little Sphinx", "Bear"), at(1, "hand", "Little Sphinx")]);
  eq([costReduction(s, 0, inHand(s, "Little Sphinx")), costReduction(s, 0, inHand(s, "Bear")), costReduction(s, 1, inHand(s, "Little Sphinx", 1))], [1, 0, 0],
    "in the command zone: Rob's Sphinx {1} less, Rob's Bear not, Maya's Sphinx not");
  const two = play([at(0, "command", "Two Minds"), at(0, "hand", "Little Sphinx", "Bear")]);
  eq([costReduction(two, 0, inHand(two, "Little Sphinx")), costReduction(two, 0, inHand(two, "Bear"))], [1, 0], "from the command zone, its eminence alone works");
  const t = play([at(0, "graveyard", US), at(0, "hand", "Little Sphinx")]);
  eq(costReduction(t, 0, inHand(t, "Little Sphinx")), 0, "in a graveyard: nothing");
  const u = play([at(0, "command", US)]);
  eq(costReduction(u, 0, u.zones.command[0][0]), 0, "never itself (\"other Sphinx spells\")");
}
{
  const s = play([at(0, "battlefield", US, "Little Sphinx")], [{attack: [US, "Little Sphinx"]}, {resolve: true}], {seats: 3, library: ["Island", "Bear", "Forest"]});
  eq(s.zones.graveyard.map((g) => g.length), [2, 2, 2], "two Sphinxes attack: each of three players mills two");
  const b = play([at(0, "battlefield", US, "Bear")], [{attack: [US, "Bear"]}, {resolve: true}], {seats: 3, library: ["Island", "Bear", "Forest"]});
  eq(b.zones.graveyard.map((g) => g.length), [1, 1, 1], "The Ur-Sphinx and a Bear attack: one Sphinx, one card each");
  eq([s.awaiting?.player, awaitingChoice(s).options.map((o) => o.label).filter((l) => l !== "Don't cast")], [0, ["Bear"]], "Rob is asked first of Rob's own milled cards: the Bear, not the Island");
}

console.log(`engine-eminence: ${checks} checks passed -- eminence from the command zone, its owner's other Sphinxes only; that many for each Sphinx attacking; for each player, a card that player milled.`);
