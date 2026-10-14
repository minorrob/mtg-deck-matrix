/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE PLAN'S X11, TRAIN B: TWO WAYS TO CHOOSE WHAT IS KEPT BEFORE THE REST IS SACRIFICED, AND WHAT THEIR CARDS' SCENARIOS
 * CANNOT REACH. Both are the `sacrifice` effect's (script/effects/asking.mjs):
 *   - `keepPowerAtMost` (Slaughter the Strong: "each player chooses any number of creatures they control with total power 4
 *     or less, then sacrifices all other creatures they control"): each player with a creature asked, in turn order from
 *     the active player (CR 101.4), powers read through the layers as they choose, the question carrying its `budget` for
 *     whoever answers; refused with instructions past it; every player's rest sacrificed at once.
 *   - `keepTypes` (Tragic Arrogance: "for each player, you choose from among the permanents that player controls an
 *     artifact, a creature, an enchantment, and a planeswalker. Then each player sacrifices all other nonland permanents
 *     they control"): the caster asked every question (CR 608.2d), only where there is more than one to choose from.
 * Here: four players, the order, the refusals, the layers, both pilots' answers, a planeswalker and an artifact land.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (f, re, m) => { assert.throws(f, re, m); checks += 1; };

const index = loadCardIndex();
const rng = createRng("x11-keep");
const SLAUGHTER = "Slaughter the Strong", ARROGANCE = "Tragic Arrogance";
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Ogre: {types: ["Creature"], subtypes: ["Ogre"], manaCost: "{2}{R}", colors: ["R"], power: 3, toughness: 3},
  Elf: {types: ["Creature"], subtypes: ["Elf"], manaCost: "{G}", colors: ["G"], power: 1, toughness: 1},
  Wall: {types: ["Creature"], subtypes: ["Wall"], manaCost: "{1}{W}", colors: ["W"], power: 0, toughness: 3},
  Relic: {types: ["Artifact"], subtypes: [], manaCost: "{2}", colors: []},
  Idol: {types: ["Artifact"], subtypes: [], manaCost: "{5}", colors: []},
  Seat: {types: ["Artifact", "Land"], subtypes: [], manaCost: null, colors: []},
  Pact: {types: ["Enchantment"], subtypes: [], manaCost: "{1}{W}", colors: ["W"]},
  Sage: {types: ["Planeswalker"], subtypes: ["Sage"], manaCost: "{2}{U}", colors: ["U"], loyalty: 3, abilities: []},
  Seer: {types: ["Planeswalker"], subtypes: ["Seer"], manaCost: "{4}{U}", colors: ["U"], loyalty: 5, abilities: []},
};
const cards = (name) => (FIX[name] ? {manaValue: {Bear: 2, Ogre: 3, Elf: 1, Wall: 2, Relic: 2, Idol: 5, Seat: 0, Pact: 2, Sage: 3, Seer: 5}[name], types: FIX[name].types} : null);
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const table = (setup, seats = 2) => runScenario({name: "x11-keep", seats, setup, steps: []}, index.definition, FIX).state;
const idOf = (s, card, seat = 0) => s.zones.battlefield.find((id) => s.objects[id].card === card && s.objects[id].controller === seat);
const mine = (s, seat) => s.zones.battlefield.filter((id) => s.objects[id].controller === seat).map((id) => s.objects[id].card).sort();
function tapFor(s, lands, seat = 0) {
  for (const land of lands) applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "activate-mana" && a.label === land && !s.objects[a.objectId].tapped));
}
function castAndResolve(s, card, lands) {
  tapFor(s, lands);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === card));
  for (let n = 0; n < 50 && s.stack.length && !s.awaiting; n += 1) passPriority(s, null, rng);
}
const pick = (s, ...labels) => {
  const options = awaitingChoice(s).options, used = new Set();
  return labels.map((label) => { const o = options.find((x) => x.label === label && !used.has(x.index)); used.add(o.index); return o.index; });
};

/* ---- Slaughter the Strong ---- */
const ST_LANDS = ["Plains", "Plains", "Wastes"];
{
  const s = table([at(0, "hand", SLAUGHTER), at(0, "battlefield", ...ST_LANDS, "Ogre", "Bear", "Elf", "Wall"), at(1, "battlefield", "Ogre", "Ogre"),
    at(2, "battlefield", "Relic"), at(3, "battlefield", "Bear")], 4);
  /* Through the layers: Rob's Elf pumped to 4/1 counts 4. */
  runEffects(s, [{effect: "pump", targets: [idOf(s, "Elf")], power: 3, toughness: 0}], {controller: 0, source: null});
  castAndResolve(s, SLAUGHTER, ST_LANDS);
  const q = awaitingChoice(s);
  eq([s.awaiting.player, q.mode, q.min, q.max, q.budget, q.options.map((o) => `${o.label} ${o.power}`)], [0, "many", 0, 4, {by: "power", most: 4},
    ["Ogre 3", "Bear 2", "Elf 4", "Wall 0"]], "Rob first, the active player: any of his four, their powers now (the Elf pumped to 4), held to 4");
  /* The pilots, within the budget: the house pilot the strongest first while they fit; the random one never past it. */
  eq(housePilot({seat: 0, cards}).answer(projectFor(s, 0), q).indices.map((i) => q.options[i].label), ["Elf", "Wall"], "the house pilot keeps the most power: the 4/1 Elf, and the Wall, which costs none");
  for (let k = 0; k < 16; k += 1) {
    const {indices} = randomLegalPilot(createRng(`keep-${k}`)).answer(q);
    ok(new Set(indices).size === indices.length && indices.reduce((n, i) => n + q.options[i].power, 0) <= 4, `the random pilot's ${JSON.stringify(indices)} keeps total power 4 or less`);
  }
  throws(() => resolveAwaiting(s, pick(s, "Ogre", "Bear")), /total power is 5: choose creatures with total power 4 or less to keep/, "the Ogre and the Bear, 5, are refused, saying what to do");
  eq(s.awaiting?.player, 0, "and Rob is still the one asked");
  resolveAwaiting(s, pick(s, "Ogre", "Wall"));
  eq([s.awaiting?.player, mine(s, 0).filter((n) => !ST_LANDS.includes(n))], [1, ["Bear", "Elf", "Ogre", "Wall"]], "then Maya; nothing of Rob's is gone yet (CR 101.4)");
  resolveAwaiting(s, pick(s, "Ogre"));
  /* Trey has no creature: he is not asked. Sam is. */
  eq(s.awaiting?.player, 3, "Trey, with no creature, is not asked; Sam is");
  resolveAwaiting(s, []);
  eq([mine(s, 0).filter((n) => !ST_LANDS.includes(n)), mine(s, 1), mine(s, 2), mine(s, 3)], [["Ogre", "Wall"], ["Ogre"], ["Relic"], []],
    "then all at once: each keeps what they chose, and Trey's artifact was never a creature to sacrifice");
}

/* ---- Tragic Arrogance ---- */
const TA_LANDS = ["Plains", "Plains", "Wastes", "Wastes", "Wastes"];
{
  const s = table([at(0, "hand", ARROGANCE), at(0, "battlefield", ...TA_LANDS, "Bear"),
    at(1, "battlefield", "Relic", "Idol", "Ogre", "Elf", "Sage", "Seer"), at(2, "battlefield", "Seat", "Relic", "Pact"), at(3, "battlefield", "Bear", "Ogre")], 4);
  castAndResolve(s, ARROGANCE, TA_LANDS);
  /* Rob's own: one creature, kept unasked. Maya's: two artifacts, two creatures, two planeswalkers -- each asked of Rob. */
  const q = awaitingChoice(s);
  eq([s.awaiting.player, q.mode, q.title, q.options.map((o) => o.label), q.options.every((o) => o.keeper === 1)], [0, "one", "Tragic Arrogance: choose an artifact Maya keeps", ["Relic", "Idol"], true],
    "Rob, the caster, is asked what Maya keeps: an artifact of hers");
  eq(housePilot({seat: 0, cards}).answer(projectFor(s, 0), q).indices.map((i) => q.options[i].label), ["Relic"], "the house pilot leaves another player the cheapest");
  ok(q.options[randomLegalPilot(createRng("ta")).answer(q).indices[0]] !== undefined, "and the random pilot one of them");
  throws(() => resolveAwaiting(s, [0, 1]), /Invalid selection/, "two artifacts are refused: one of each type");
  resolveAwaiting(s, pick(s, "Idol"));
  eq(awaitingChoice(s).title, "Tragic Arrogance: choose a creature Maya keeps", "then her creature");
  resolveAwaiting(s, pick(s, "Elf"));
  eq([awaitingChoice(s).title, awaitingChoice(s).options.map((o) => o.label)], ["Tragic Arrogance: choose a planeswalker Maya keeps", ["Sage", "Seer"]], "she has no enchantment; then her planeswalker");
  resolveAwaiting(s, pick(s, "Sage"));
  /* Trey: an artifact land and an artifact -- the land may be the artifact chosen, and is no nonland permanent either way. */
  eq(awaitingChoice(s).options.map((o) => o.label), ["Seat", "Relic"], "Trey's artifacts, his artifact land among them");
  resolveAwaiting(s, pick(s, "Seat"));
  eq([awaitingChoice(s).title, awaitingChoice(s).options.map((o) => o.label)], ["Tragic Arrogance: choose a creature Sam keeps", ["Bear", "Ogre"]], "Trey's lone enchantment kept unasked; then Sam's creature");
  eq(housePilot({seat: 0, cards}).answer(projectFor(s, 0), awaitingChoice(s)).indices.map((i) => awaitingChoice(s).options[i].label), ["Bear"], "the house pilot: Sam's cheaper");
  resolveAwaiting(s, pick(s, "Ogre"));
  eq([s.awaiting, mine(s, 0).filter((n) => !TA_LANDS.includes(n)), mine(s, 1), mine(s, 2), mine(s, 3)],
    [null, ["Bear"], ["Elf", "Idol", "Sage"], ["Pact", "Seat"], ["Ogre"]], "then all at once: every other nonland permanent sacrificed, Trey's Relic among them");
}
{
  /* For its own caster, the house pilot keeps the costliest. */
  const s = table([at(0, "hand", ARROGANCE), at(0, "battlefield", ...TA_LANDS, "Relic", "Idol")]);
  castAndResolve(s, ARROGANCE, TA_LANDS);
  const q = awaitingChoice(s);
  eq([q.title, housePilot({seat: 0, cards}).answer(projectFor(s, 0), q).indices.map((i) => q.options[i].label)], ["Tragic Arrogance: choose an artifact Rob keeps", ["Idol"]],
    "asked what he keeps himself, the house pilot keeps his costliest");
}

console.log(`engine-x11-keep: ${checks} checks passed`);
