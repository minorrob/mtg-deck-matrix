/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE PLAN'S X11, TRAIN B: FINALITY COUNTERS, AND WHAT EXCAVA'S SCENARIOS CANNOT REACH.
 *
 *   - A finality counter (CR 122.1h): one or more on a permanent make one replacement effect, "if this permanent would be
 *     put into a graveyard from the battlefield, exile it instead" (rules/replacement.mjs, applicable) -- destroyed,
 *     sacrificed or dead to lethal damage alike, any kind of permanent, ordered with other replacements (CR 616.1) and never
 *     a death (CR 700.4). Only a graveyard: to a hand it goes.
 *   - moveZone's `withCounters` ("return ... to the battlefield with a finality counter on it", Excava, the Risen Past;
 *     CR 122.6): put on as it enters, whatever kind of permanent it is.
 * Here: each way to the graveyard, a second "exile it instead" (no question), four players, the compiler.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {moveOne, sacrificeOne} from "../game/engine/script/effects/zones.mjs";
import {characteristicsOf, keywordsOf} from "../game/engine/rules/layers.mjs";
import {cardsIn} from "../game/engine/state/index.mjs";
import {matchesSelector} from "../game/engine/script/filter.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const rng = createRng("x11-finality");
const EXCAVA = "Excava, the Risen Past";
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Ogre: {types: ["Creature"], subtypes: ["Ogre"], manaCost: "{2}{R}", colors: ["R"], power: 3, toughness: 3},
  Relic: {types: ["Artifact"], subtypes: [], manaCost: "{2}", colors: []},
  /* "If a permanent would be put into a graveyard from the battlefield, exile it instead": a second effect that ends the same. */
  Warden: {types: ["Enchantment"], subtypes: [], manaCost: "{2}{W}", colors: ["W"],
    abilities: [{id: "w", kind: "replacement", text: "x", watches: {event: "zone-change", from: "battlefield", to: "graveyard"}, change: {to: "exile"}}]},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, seats = 2) => runScenario({name: "x11-finality", seats, setup, steps: []}, index.definition, FIX).state;
const idOf = (s, card, seat = 0) => s.zones.battlefield.find((id) => s.objects[id].card === card && s.objects[id].controller === seat);
const whereIs = (s, card, seat = 0) => (cardsIn(s, "graveyard", seat).some((id) => s.objects[id].card === card) ? "graveyard"
  : cardsIn(s, "exile").some((id) => s.objects[id].card === card && s.objects[id].owner === seat) ? "exile"
  : cardsIn(s, "hand", seat).some((id) => s.objects[id].card === card) ? "hand" : idOf(s, card, seat) !== undefined ? "battlefield" : "nowhere");
const countered = (s, card, n = 1) => { s.objects[idOf(s, card)].counters.finality = n; };
const deaths = (events) => events.filter((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.to?.zoneType === "Graveyard").length;

/* ---- the replacement, each way to a graveyard ---- */
{
  const s = table([at(0, "battlefield", "Bear", "Ogre", "Relic")]);
  countered(s, "Bear");
  const events = runEffects(s, [{effect: "destroy", targets: [idOf(s, "Bear")]}], {controller: 0, source: null});
  eq([whereIs(s, "Bear"), deaths(events)], ["exile", 0], "destroyed with a finality counter: exiled instead, and it never died (CR 700.4)");
  countered(s, "Relic");
  runEffects(s, [{effect: "destroy", targets: [idOf(s, "Relic")]}], {controller: 0, source: null});
  eq(whereIs(s, "Relic"), "exile", "an artifact too: the counter's effect is about any permanent (CR 122.1h)");
  runEffects(s, [{effect: "destroy", targets: [idOf(s, "Ogre")]}], {controller: 0, source: null});
  eq(whereIs(s, "Ogre"), "graveyard", "without one, to the graveyard as ever");
}
{
  const s = table([at(0, "battlefield", "Bear", "Ogre")]);
  countered(s, "Bear", 2);
  sacrificeOne(s, idOf(s, "Bear"), []);
  eq(whereIs(s, "Bear"), "exile", "sacrificed, two counters on it: one effect, exiled");
  countered(s, "Ogre");
  runEffects(s, [{effect: "dealDamage", amount: 3, targets: [idOf(s, "Ogre")]}], {controller: 1, source: null});
  checkStateBasedActions(s);
  eq(whereIs(s, "Ogre"), "exile", "dead to lethal damage, by the state-based actions: exiled");
}
{
  const s = table([at(0, "battlefield", "Bear")]);
  countered(s, "Bear");
  moveOne(s, idOf(s, "Bear"), "hand", []);
  eq(whereIs(s, "Bear"), "hand", "returned to its owner's hand, it goes there: only a graveyard is replaced");
}
{
  /* Another "exile it instead" beside it: both end the same, so the first applies and nobody is asked (CR 616.1). */
  const s = table([at(0, "battlefield", "Bear"), at(1, "battlefield", "Warden")]);
  countered(s, "Bear");
  runEffects(s, [{effect: "destroy", targets: [idOf(s, "Bear")]}], {controller: 0, source: null});
  eq([whereIs(s, "Bear"), s.awaiting], ["exile", null], "with a second exile-instead effect: exiled, and no question");
}

/* ---- withCounters: entering with them, any permanent ---- */
{
  const s = table([at(0, "graveyard", "Relic")]);
  runEffects(s, [{effect: "moveZone", targets: [cardsIn(s, "graveyard", 0)[0]], to: "battlefield", withCounters: {finality: 1, charge: 2}}], {controller: 0, source: null});
  eq(s.objects[idOf(s, "Relic")]?.counters, {finality: 1, charge: 2}, "an artifact enters with them, each kind");
}
const moving = (effect) => compileScript({schema: "CrankCardScript@1",
  identity: {name: "Odd Return", oracleId: "x", types: ["Sorcery"], subtypes: [], manaCost: "{W}", colors: ["W"], colorIdentity: ["W"]},
  oracleText: "x", source: "hand", abilities: [{kind: "spell", text: "x", targets: [{what: "card", zone: "graveyard", owner: "you"}], effects: [{effect: "moveZone", targets: {target: 0}, ...effect}]}]}).problems;
eq(moving({to: "battlefield", withCounters: {finality: 1}}), [], "returned with a finality counter compiles");
for (const bad of [{to: "hand", withCounters: {finality: 1}}, {to: "battlefield", withCounters: {finality: 0}}, {to: "battlefield", withCounters: {}}, {to: "battlefield", withCounters: ["finality"]}])
  ok(moving(bad).some((p) => p.includes("withCounters is the counters it enters the battlefield with")), `and refuses ${JSON.stringify(bad)}`);

/* ---- Excava, four players: its own graveyard's cards, then the counter at work ---- */
{
  const s = runScenario({name: "x11-finality-excava", seats: 4, setup: [{seat: 0, zone: "battlefield", cards: [EXCAVA], sick: true}, at(0, "graveyard", "Bear", "Relic"),
    at(1, "graveyard", "Bear"), at(2, "graveyard", "Ogre"), at(3, "graveyard", "Relic")], steps: [{attack: [EXCAVA]}]}, index.definition, FIX).state;
  const q = awaitingChoice(s);
  eq(q.options.map((o) => o.label).sort(), ["Bear", "Relic"], "its targets: the cards of Rob's own graveyard only");
  resolveAwaiting(s, [q.options.find((o) => o.label === "Bear").index]);
  for (let n = 0; n < 50 && s.stack.length && !s.awaiting; n += 1) passPriority(s, null, rng);
  const bear = idOf(s, "Bear");
  const c = characteristicsOf(s, bear);
  /* "A Spirit" as any rule asks it, a selector's subtypes (the layers keep a type animate adds beside the card types). */
  const is = (subtype) => matchesSelector({what: "permanent", types: ["Creature"], subtypes: [subtype]}, s, bear, {controller: 0});
  eq([c.power, c.toughness, c.types.includes("Creature"), is("Spirit"), is("Bear"), keywordsOf(s, bear).includes("Flying"), s.objects[bear].counters.finality],
    [1, 1, true, true, true, true, 1], "a 1/1 Spirit Bear creature with flying, in addition to its other types, with a finality counter");
  runEffects(s, [{effect: "destroy", targets: [bear]}], {controller: 1, source: null});
  eq(whereIs(s, "Bear"), "exile", "destroyed, it is exiled: it will not come back the same way");
}

console.log(`engine-x11-finality: ${checks} checks passed`);
