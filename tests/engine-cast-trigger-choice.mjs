/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "WHENEVER YOU CAST AN EQUIPMENT SPELL OR A SPELL THAT TARGETS A CREATURE YOU CONTROL, DRAW A CARD. THIS ABILITY TRIGGERS ONLY
 * ONCE EACH TURN" (Danitha, Sword of Hope; Train C phase 2, w2a-selectors; CR 601.2c, 601.2i, 603.2).
 *
 * A spell cast trigger's `anyOf` (cards/index.mjs, rules/trigger.mjs): a choice of spells, each alternative a `filter` of the
 * spell, a `targets` of what one of its targets is (chosen as it was cast, CR 601.2c, before it became cast, 601.2i), or both.
 * One is enough. The compiler takes it only on a spell cast trigger with no filter, targets or count of the caster's spells of
 * its own -- those read the trigger's one filter. The card's scenarios play Danitha; this suite holds an alternative of both
 * kinds at once, a spell with two targets, a turn later, four seats, and the compiler's refusals.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const creature = {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}", colors: ["G"], power: 2, toughness: 2};
const YOURS = {what: "permanent", types: ["Creature"], controller: "you"};
const pump = (targets) => ({types: ["Instant"], manaCost: "{C}", colors: ["G"], spell: {id: "s", text: "Pump.", targets, effects: [{effect: "pump", targets: {target: 0}, power: 1, toughness: 1}]}});
const FIX = {
  Bear: creature, "Their Bear": creature,
  Pump: pump([{what: "permanent", types: ["Creature"]}]),
  "Two Pump": pump([{what: "permanent", types: ["Creature"], count: {min: 2, max: 2}}]),
  Relic: {types: ["Artifact"], manaCost: "{C}", colors: []},
  Sorcery: {types: ["Sorcery"], manaCost: "{C}", colors: ["G"], spell: {id: "s", text: "Pump.", targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "pump", targets: {target: 0}, power: 1, toughness: 1}]}},
  /* "Whenever you cast an artifact spell or an instant spell that targets a creature you control, you gain 1 life": an
     alternative that is both a filter and a target. */
  Watcher: {...creature, abilities: [{id: "w", kind: "triggered", text: "Whenever you cast an artifact spell or an instant spell that targets a creature you control, you gain 1 life.",
    trigger: {on: "GameEventSpellAbilityCast", caster: "you", anyOf: [{filter: {types: ["Artifact"]}}, {filter: {types: ["Instant"]}, targets: YOURS}]}, effects: [{effect: "gainLife", amount: 1}]}]},
};
const cast = (seats, setup, steps, extra = {}) => runScenario({name: "cast", seats, setup, steps, ...extra}, index.definition, FIX).state;
const lands = (n) => Array.from({length: n}, () => "Wastes");
const tapAll = (n, seat = 0) => Array.from({length: n}, () => ({tap: "Wastes", seat}));

/* ---- an alternative of both kinds: an instant, and aimed at a creature Rob controls ---- */
{
  const s = cast(2, [at(0, "battlefield", "Watcher", "Bear", ...lands(4)), at(0, "hand", "Pump", "Sorcery", "Relic"), at(1, "battlefield", "Their Bear")],
    [...tapAll(1), {cast: "Pump", targets: [{card: "Their Bear"}]}, {settle: true}, ...tapAll(1), {cast: "Sorcery", targets: [{card: "Bear"}]}, {settle: true}]);
  eq(s.players[0].life, 40, "an instant at Maya's Bear, and a sorcery at Rob's: neither alternative, no life");
  const t = cast(2, [at(0, "battlefield", "Watcher", "Bear", ...lands(4)), at(0, "hand", "Pump", "Relic")],
    [...tapAll(1), {cast: "Pump", targets: [{card: "Bear"}]}, {settle: true}, ...tapAll(1), {cast: "Relic"}, {settle: true}]);
  eq(t.players[0].life, 42, "an instant at his Bear, then an artifact: one life for each");
}

/* ---- Danitha: two targets, one of them hers; and a turn later, again ---- */
{
  const s = cast(2, [at(0, "battlefield", "Danitha, Sword of Hope", ...lands(2)), at(0, "hand", "Two Pump"), at(1, "battlefield", "Their Bear")],
    [...tapAll(1), {cast: "Two Pump", targets: [[{card: "Their Bear"}, {card: "Danitha, Sword of Hope"}]]}, {settle: true}]);
  eq(s.zones.hand[0].length, 1, "a spell aimed at Maya's Bear and at Danitha targets a creature Rob controls: he draws");
}
{
  const s = cast(2, [at(0, "battlefield", "Danitha, Sword of Hope", ...lands(2)), at(0, "hand", "Basilisk Collar"), at(0, "library", "Pump")],
    [...tapAll(1), {cast: "Basilisk Collar"}, {settle: true}, {to: {turn: 3, phase: "MAIN1"}}, {tap: "Wastes"}, {cast: "Pump", targets: [{card: "Danitha, Sword of Hope"}]}, {settle: true}],
    {library: ["Pump"]});
  /* Turn 1: the Collar's card drawn (the Pump); turn 3's draw; then the Pump cast on Danitha: once each turn, a new turn. */
  eq(s.zones.hand[0].length, 2, "the Collar on turn 1 drew the Pump; on turn 3, the Pump on Danitha draws again, after the turn's own draw");
}

/* ---- four seats: another player's spell at Rob's creature is not Rob's to cast ---- */
{
  const s = cast(4, [at(0, "battlefield", "Danitha, Sword of Hope"), at(2, "battlefield", "Wastes"), at(2, "hand", "Pump")],
    [{to: {turn: 3, phase: "MAIN1"}}, ...tapAll(1, 2), {cast: "Pump", seat: 2, targets: [{card: "Danitha, Sword of Hope"}]}, {settle: true}]);
  eq(s.zones.hand[0].length, 1, "Trey's Pump on Danitha draws Rob nothing -- his one card is his turn-1 draw at a table of four");
}

/* ---- the compiler ---- */
{
  const danitha = JSON.parse(readFileSync(new URL("../game/engine/cards/d/danitha-sword-of-hope.json", import.meta.url), "utf8"));
  eq(compileScript(danitha).problems, [], "Danitha compiles");
  const problems = (change) => { const copy = structuredClone(danitha); change(copy.abilities[1].trigger); return compileScript(copy).problems.join(" | "); };
  ok(/a choice of spells cast is anyOf/.test(problems((t) => { t.filter = {types: ["Instant"]}; })), "not beside a filter of its own");
  ok(/a choice of spells cast is anyOf/.test(problems((t) => { t.targets = YOURS; })), "nor targets of its own");
  ok(/a choice of spells cast is anyOf/.test(problems((t) => { t.nthThisTurn = 2; })), "nor a count of the caster's spells");
  ok(/a choice of spells cast is anyOf/.test(problems((t) => { t.anyOf = [t.anyOf[0]]; })), "two or more alternatives");
  ok(/a choice of spells cast is anyOf/.test(problems((t) => { t.anyOf[0] = {subtypes: ["Equipment"]}; })), "each a filter or targets");
  ok(/a choice of spells cast is anyOf/.test(problems((t) => { t.anyOf[1] = {}; })), "and not nothing");
  ok(/a choice of spells cast is anyOf/.test(problems((t) => { t.on = "enters"; t.who = "any"; delete t.caster; })), "on a spell cast trigger only");
  ok(/grammar has no key/.test(problems((t) => { t.anyOf[0].filter = {equipmentish: true}; })), "a filter held to the selector grammar");
  ok(/grammar has no key/.test(problems((t) => { t.anyOf[1].targets = {mine: true}; })), "and its targets too");
}

console.log(`engine-cast-trigger-choice: ${checks} checks passed`);
