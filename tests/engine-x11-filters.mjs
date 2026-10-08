/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE PLAN'S X11, TRAIN B: TWO SELECTOR KEYS AND A CONDITION, AND WHAT THEIR CARDS' SCENARIOS CANNOT REACH.
 *
 *   - `unequalPowerToughness` (Gilt-Leaf Winnower: "target non-Elf creature whose power and toughness aren't equal"),
 *     through the layers.
 *   - `equipped` (Hemlock Vial: "each equipped creature and Equipment you control gains deathtouch"): an Equipment attached
 *     to it, not an Aura (CR 301.5a).
 *   - The condition `nameUnshared` (Guardian Project's intervening "if", CR 603.4: "if it doesn't have the same name as
 *     another creature you control or a creature card in your graveyard"), read again as it resolves -- with the name it
 *     entered with when it is gone by then (CR 608.2h); a card it became in the graveyard is another object (CR 400.7).
 * Here: the layers, the refusals, four players, a set fixed as it resolves (CR 611.2c), and a creature gone in response.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {compileSelector, selectMatching} from "../game/engine/script/filter.mjs";
import {conditionProblems} from "../game/engine/script/condition.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {cardsIn, addObject} from "../game/engine/state/index.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (f, re, m) => { assert.throws(f, re, m); checks += 1; };

const index = loadCardIndex();
const rng = createRng("x11-filters");
const WINNOWER = "Gilt-Leaf Winnower", VIAL = "Hemlock Vial", PROJECT = "Guardian Project", GREAVES = "Lightning Greaves";
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

/* ---- unequalPowerToughness, through the layers ---- */
{
  const s = table([at(0, "battlefield", "Bear", "Imp"), at(1, "battlefield", "Ogre")]);
  const unequal = (st) => names(st, selectMatching(st, {what: "permanent", types: ["Creature"], unequalPowerToughness: true}, {controller: 0}));
  eq(unequal(s), ["Imp@0"], "a 2/1 is; a 2/2 and a 3/3 are not");
  runEffects(s, [{effect: "pump", targets: [idOf(s, "Bear")], power: 1, toughness: 0}], {controller: 0, source: null});
  runEffects(s, [{effect: "pump", targets: [idOf(s, "Imp")], power: 0, toughness: 1}], {controller: 0, source: null});
  eq(unequal(s), ["Bear@0"], "pumped: the 3/2 Bear is, the 2/2 Imp no longer");
}
throws(() => compileSelector({unequalPowerToughness: false}), /unequalPowerToughness is true/, "unequalPowerToughness says only true");
/* Gilt-Leaf Winnower aims at any player's non-Elf creature that fits -- its own controller's too -- across four players. */
{
  const s = table([at(0, "hand", WINNOWER), at(0, "battlefield", "Swamp", "Swamp", "Wastes", "Wastes", "Wastes", "Imp"), at(1, "battlefield", "Ogre"), at(2, "battlefield", "Imp"), at(3, "battlefield", "Bear")], 4);
  tapFor(s, ["Swamp", "Swamp", "Wastes", "Wastes", "Wastes"]);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === WINNOWER));
  resolveAll(s);
  eq(awaitingChoice(s).options.map((o) => o.label).sort(), ["Imp", "Imp"], "its trigger's targets: Rob's Imp and Trey's -- not the 3/3, the 2/2, or itself, an Elf");
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

/* ---- nameUnshared: Guardian Project ---- */
eq(conditionProblems({nameUnshared: [{what: "permanent", types: ["Creature"], controller: "you"}]}), [], "nameUnshared of a selector");
ok(conditionProblems({nameUnshared: []}).some((p) => p.includes("nameUnshared is a list")), "and refuses an empty list");
ok(conditionProblems({nameUnshared: [{shade: "R"}]}).some((p) => p.startsWith("nameUnshared:")), "and a selector the grammar refuses");
/* Cast a Bear under Guardian Project, its trigger on the stack: then `between` happens, and it resolves. */
function bearUnder(setup, between, seats = 2) {
  const s = table([at(0, "hand", "Bear"), at(0, "battlefield", PROJECT, "Forest", "Wastes"), ...setup], seats);
  tapFor(s, ["Forest", "Wastes"]);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === "Bear"));
  for (let n = 0; n < 20 && s.stack.length && s.stack[s.stack.length - 1].kind !== "trigger"; n += 1) passPriority(s, null, rng);
  const triggered = s.stack.length === 1 && s.stack[0].kind === "trigger";
  between(s);
  const hand = cardsIn(s, "hand", 0).length;
  resolveAll(s);
  return {triggered, drew: cardsIn(s, "hand", 0).length - hand};
}
{
  /* Gone before it resolves: exiled, it drew -- nothing of Rob's is named Bear; died, it did not -- the Bear card in his
     graveyard shares its name. */
  const exiled = bearUnder([], (s) => moveOne(s, idOf(s, "Bear"), "exile", []));
  eq([exiled.triggered, exiled.drew], [true, 1], "exiled in response: the name it entered with is still new, and Rob draws");
  const died = bearUnder([], (s) => moveOne(s, idOf(s, "Bear"), "graveyard", []));
  eq([died.triggered, died.drew], [true, 0], "died in response: its card in Rob's graveyard has its name, and he draws nothing");
  const joined = bearUnder([at(0, "graveyard", "Ogre")], (s) => moveOne(s, cardsIn(s, "graveyard", 0).find((id) => s.objects[id].card === "Ogre"), "exile", []));
  eq([joined.triggered, joined.drew], [true, 1], "a different creature card leaving his graveyard changes nothing");
  /* Asked again as it resolves (CR 603.4): a second Bear of Rob's arriving in response is another creature with its name. */
  const second = bearUnder([at(0, "hand", "Bear")], (s) => moveOne(s, cardsIn(s, "hand", 0).find((id) => s.objects[id].card === "Bear"), "battlefield", []));
  eq([second.triggered, second.drew], [true, 0], "a second Bear put onto the battlefield in response: Rob draws nothing");
  const fourPlayers = bearUnder([at(1, "graveyard", "Bear"), at(2, "battlefield", "Bear"), at(3, "graveyard", "Bear")], () => {}, 4);
  eq([fourPlayers.triggered, fourPlayers.drew], [true, 1], "four players: the others' Bears, on the battlefield and in their graveyards, are not his");
}
{
  /* A token entering is no nontoken creature: nothing triggers. */
  const s = table([at(0, "battlefield", PROJECT)]);
  runEffects(s, [{effect: "createToken", count: 1, token: {name: "Bear", types: ["Creature"], subtypes: ["Bear"], colors: ["G"], power: 2, toughness: 2}}], {controller: 0, source: null});
  resolveAll(s);
  eq([s.stack.length, s.pendingTriggers?.length ?? 0], [0, 0], "a token Bear enters: it does not trigger");
}

console.log(`engine-x11-filters: ${checks} checks passed`);
