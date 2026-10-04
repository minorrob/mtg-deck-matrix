/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* COUNTERS DOUBLED, AND "WHENEVER YOU SCRY OR SURVEIL" (Deepglow Skate, Branching Evolution, Proft, Consulting Detective;
 * the live-game plan of 2026-10-04, lane W5).
 *
 * `multiplyCounters` (script/effects/resources.mjs; a primitive the catalog declared and nothing built): on each target, as
 * many more of each kind as it has, put on as counters are; `who`, a player's own (poison).
 * `more-counters` (rules/statics.mjs, countersPlaced; CR 614.1a, 122.6): "twice that many ... instead", for the permanents
 * and the kind it says -- read wherever counters are put on a permanent, as it enters too. Only multiplying is built, so two
 * of them in either order are four times, and nobody is asked.
 * `scried` (cards/index.mjs; rules/trigger.mjs): the event a scry or a surveil makes once it is done (effects/asking.mjs),
 * by its player; a library with nothing to look at is no scry.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {countersPlaced} from "../game/engine/rules/statics.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const card = (name, types, abilities, more = {}) => compileScript({schema: "CrankCardScript@1", identity: {name, oracleId: "x", types, subtypes: [], manaCost: "{0}", colors: ["G"], colorIdentity: ["G"], ...more},
  oracleText: "x", source: "hand", abilities}).definition;
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  /* A 0/0 that enters with three +1/+1 counters, for {0}. */
  "Hydra Fixture": card("Hydra Fixture", ["Creature"], [{kind: "replacement", text: "x", watches: {event: "enters", who: "self"}, change: {entersWithCounters: {counter: "+1/+1", count: 3}}}], {power: 0, toughness: 0}),
  "Scry Fixture": card("Scry Fixture", ["Sorcery"], [{kind: "spell", text: "x", targets: [], effects: [{effect: "scry", count: 1}]}]),
};
const play = (setup, steps = [], extra = {}) => runScenario({name: "counters doubled", setup, steps, ...extra}, index.definition, FIX).state;
const idOf = (s, name, seat = null) => s.zones.battlefield.find((id) => s.objects[id].card === name && (seat === null || s.objects[id].controller === seat));
const BE = "Branching Evolution";

/* ---- multiplyCounters ---- */
{
  const s = play([at(0, "battlefield", "Bear")]);
  const bear = idOf(s, "Bear");
  s.objects[bear].counters = {"+1/+1": 2, "-1/-1": 1};
  runEffect(s, {effect: "multiplyCounters", targets: [bear]}, {controller: 0});
  eq(s.objects[bear].counters, {"+1/+1": 4, "-1/-1": 2}, "each kind on it doubled");
  runEffect(s, {effect: "multiplyCounters", targets: [bear], times: 3}, {controller: 0});
  eq(s.objects[bear].counters["+1/+1"], 12, "times 3: tripled");
  s.players[1].poison = 3;
  runEffect(s, {effect: "multiplyCounters", who: [1]}, {controller: 0});
  eq([s.players[1].poison, s.players[0].poison ?? 0], [6, 0], "a player's own counters: Maya's poison doubled, Rob's none");
}
/* ---- twice that many instead ---- */
{
  const s = play([at(0, "battlefield", BE, "Bear"), at(1, "battlefield", "Bear")]);
  eq([countersPlaced(s, idOf(s, "Bear", 0), "+1/+1", 1), countersPlaced(s, idOf(s, "Bear", 1), "+1/+1", 1), countersPlaced(s, idOf(s, "Bear", 0), "-1/-1", 1)], [2, 1, 1],
    "Rob's creature, +1/+1: twice; Maya's, or another kind: as it was");
  const t = play([at(0, "battlefield", BE, BE, "Bear")]);
  eq(countersPlaced(t, idOf(t, "Bear"), "+1/+1", 1), 4, "two of them: four times, in either order");
  const u = play([at(0, "battlefield", BE), at(0, "hand", "Hydra Fixture")], [{cast: "Hydra Fixture"}, {resolve: true}]);
  eq(u.objects[idOf(u, "Hydra Fixture")].counters["+1/+1"], 6, "a creature entering with three +1/+1 counters: six (CR 122.6)");
  const w = play([at(0, "battlefield", BE), at(0, "hand", "Hydra Fixture")]);
  runEffect(w, {effect: "moveZone", targets: [w.zones.hand[0].find((id) => w.objects[id].card === "Hydra Fixture")], to: "battlefield"}, {controller: 0});
  eq(w.objects[idOf(w, "Hydra Fixture")].counters["+1/+1"], 6, "put onto the battlefield by an effect, not cast: six as well");
  const v = play([at(0, "battlefield", BE, "Bear")]);
  runEffect(v, {effect: "multiplyCounters", targets: [idOf(v, "Bear")]}, {controller: 0});
  eq(v.objects[idOf(v, "Bear")].counters["+1/+1"] ?? 0, 0, "doubling none is none");
}
/* ---- whenever you scry or surveil ---- */
{
  const PROFT = "Proft, Consulting Detective";
  const s = play([at(0, "battlefield", PROFT), at(0, "hand", "Scry Fixture")], [{cast: "Scry Fixture"}, {resolve: true}, {answer: []}]);
  eq(s.stack.length, 1, "Rob's scry: Proft's trigger waits on the stack");
  const t = play([at(1, "battlefield", PROFT), at(0, "hand", "Scry Fixture")], [{cast: "Scry Fixture"}, {resolve: true}, {answer: []}]);
  eq(t.stack.length, 0, "Rob's scry, Maya's Proft: nothing");
  const u = runScenario({name: "counters doubled", setup: [at(0, "battlefield", PROFT), at(0, "hand", "Scry Fixture")], steps: [{cast: "Scry Fixture"}]}, index.definition, FIX).state;
  u.zones.library[0].length = 0;
  for (let n = 0; n < 10 && u.stack.length; n += 1) passPriority(u, null);
  eq([u.stack.length, u.awaiting], [0, null], "an empty library: nothing looked at, no scry, no trigger");
}
for (const name of ["Deepglow Skate", BE, "Proft, Consulting Detective"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-counters-doubled: ${checks} checks passed -- each kind of counter doubled, on permanents and players; twice that many instead, as it enters too, four times for two; whenever you scry or surveil, yours, once it is done.`);
