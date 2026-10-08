/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE PLAN'S X11, TRAIN B: A SELECTOR KEY, AND WHAT ITS CARD'S SCENARIOS CANNOT REACH.
 *
 * `equipped` (Hemlock Vial: "each equipped creature and Equipment you control gains deathtouch until end of turn"): an
 * Equipment attached to it, not an Aura (CR 301.5a), and still there -- one that left is a new object (CR 400.7).
 * Here: the Aura and a departed Equipment, three players and only what the Vial's controller controls, and a set fixed as
 * the ability resolves (CR 611.2c).
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {compileSelector, selectMatching} from "../game/engine/script/filter.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {addObject} from "../game/engine/state/index.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (f, re, m) => { assert.throws(f, re, m); checks += 1; };

const index = loadCardIndex();
const rng = createRng("x11-filters");
const VIAL = "Hemlock Vial", GREAVES = "Lightning Greaves";
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Ogre: {types: ["Creature"], subtypes: ["Ogre"], manaCost: "{2}{R}", colors: ["R"], power: 3, toughness: 3},
  Imp: {types: ["Creature"], subtypes: ["Imp"], manaCost: "{1}{B}", colors: ["B"], power: 2, toughness: 1},
  Charm: {types: ["Enchantment"], subtypes: ["Aura"], manaCost: "{W}", colors: ["W"], enchant: {what: "permanent", types: ["Creature"]}},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, seats = 2) => runScenario({name: "x11-filters", seats, setup, steps: []}, index.definition, FIX).state;
const idOf = (s, card, seat = 0) => s.zones.battlefield.find((id) => s.objects[id].card === card && s.objects[id].controller === seat);
const names = (s, ids) => ids.map((id) => `${s.objects[id].card}@${s.objects[id].controller}`).sort();
function tapFor(s, lands, seat = 0) {
  for (const land of lands) applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "activate-mana" && a.label === land && !s.objects[a.objectId].tapped));
}
function resolveAll(s) {
  for (let n = 0; n < 200 && s.stack.length && !s.awaiting; n += 1) passPriority(s, null, rng);
}

/* ---- equipped: an Equipment attached, not an Aura ---- */
{
  const s = table([at(0, "battlefield", GREAVES, "Bear", "Ogre", "Imp"), at(1, "battlefield", "Bear")]);
  /* The Aura made here and attached at once: unattached, the state-based actions would put it into the graveyard (CR 704.5m). */
  const greaves = idOf(s, GREAVES), charm = addObject(s, {...structuredClone(FIX.Charm), card: "Charm", owner: 0, controller: 0}, "battlefield", null);
  runEffects(s, [{effect: "attach", targets: [idOf(s, "Bear")], source: greaves}], {controller: 0, source: greaves});
  runEffects(s, [{effect: "attach", targets: [idOf(s, "Ogre")], source: charm}], {controller: 0, source: charm});
  const equipped = (st, more = {}) => names(st, selectMatching(st, {what: "permanent", types: ["Creature"], equipped: true, ...more}, {controller: 0}));
  eq(equipped(s), ["Bear@0"], "the Bear wears the Greaves; the Ogre wears an Aura, which is no Equipment");
  runEffects(s, [{effect: "attach", targets: [idOf(s, "Imp")], source: greaves}], {controller: 0, source: greaves});
  eq(equipped(s), ["Imp@0"], "moved to the Imp, the Bear is no longer equipped");
  moveOne(s, greaves, "graveyard", []);
  eq(equipped(s), [], "and with the Greaves gone to the graveyard, nothing is");
  throws(() => compileSelector({equipped: "yes"}), /equipped is true/, "equipped says only true");
}
/* Hemlock Vial: only what Rob controls, fixed as it resolves (CR 611.2c). */
{
  const s = table([at(0, "battlefield", VIAL, "Swamp", GREAVES, "Bear", "Ogre"), at(1, "battlefield", GREAVES, "Imp"), at(2, "battlefield", "Bear")], 3);
  const mine = idOf(s, GREAVES), theirs = idOf(s, GREAVES, 1);
  runEffects(s, [{effect: "attach", targets: [idOf(s, "Bear")], source: mine}], {controller: 0, source: mine});
  runEffects(s, [{effect: "attach", targets: [idOf(s, "Imp", 1)], source: theirs}], {controller: 1, source: theirs});
  tapFor(s, ["Swamp"]);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.label === VIAL));
  resolveAll(s);
  const deathtouch = (id) => keywordsOf(s, id).includes("Deathtouch");
  eq([deathtouch(idOf(s, "Bear")), deathtouch(mine), deathtouch(idOf(s, "Ogre")), deathtouch(idOf(s, "Imp", 1)), deathtouch(theirs), deathtouch(idOf(s, "Bear", 2))],
    [true, true, false, false, false, false], "Rob's equipped Bear and his Greaves: not his Ogre, not Maya's equipped Imp or her Greaves, not Trey's Bear");
  runEffects(s, [{effect: "attach", targets: [idOf(s, "Ogre")], source: mine}], {controller: 0, source: mine});
  eq(deathtouch(idOf(s, "Ogre")), false, "the Ogre equipped afterward does not gain it: the set was fixed as it resolved");
}

console.log(`engine-x11-filters: ${checks} checks passed`);
