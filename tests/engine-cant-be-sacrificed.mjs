/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, P4-REPLACEMENTS: "ALEXIOS ... CAN'T BE SACRIFICED" (Alexios, Deimos of Kosmos; CR 701.21a, 101.2).
 *
 * The static `cant-be-sacrificed` (rules/statics.mjs, cantBeSacrificed): told to sacrifice it, nothing happens to it
 * (script/effects/zones.mjs, sacrificeOne -- every sacrifice goes through there); told to choose a permanent to sacrifice, a
 * player never has it among the choices -- the sacrifice effect and an "unless" cost (script/effects/asking.mjs), an
 * ability's cost and a spell's additional cost (rules/actions.mjs). And the rest of Alexios that needed something:
 * "that player gains control" (`toPlayer: "that player"`, script/bind.mjs) and "that player puts a +1/+1 counter on it"
 * (putCounter's `puts`, for "if you would put" -- Vorinclex). Here: each way, the compiler, and whose counter it is.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {sacrificeOne} from "../game/engine/script/effects/zones.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {cantBeSacrificed} from "../game/engine/rules/statics.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const ALEXIOS = "Alexios, Deimos of Kosmos";
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  /* "As an additional cost to cast this spell, sacrifice a creature. You gain 2 life." */
  Offering: {types: ["Sorcery"], subtypes: [], manaCost: "{0}", colors: ["B"],
    spell: {id: "s", text: "x", additionalCost: [{atom: "sacrifice", selector: {types: ["Creature"]}}], targets: [], effects: [{effect: "gainLife", amount: 2}]}},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, seats = 2) => runScenario({name: "cant-be-sacrificed", seats, setup, steps: []}, index.definition, FIX).state;
const idOf = (s, name, seat = 0) => s.zones.battlefield.find((id) => s.objects[id].card === name && s.objects[id].controller === seat);
const here = (s, name, seat = 0) => idOf(s, name, seat) !== undefined;

{
  const s = table([at(0, "battlefield", ALEXIOS, "Bear")]);
  const alexios = idOf(s, ALEXIOS);
  eq([cantBeSacrificed(s, alexios), cantBeSacrificed(s, idOf(s, "Bear"))], [true, false], "Alexios can't be sacrificed; the Bear can (its `affects` is itself)");
  const events = [];
  eq([sacrificeOne(s, alexios, events), events.length, here(s, ALEXIOS)], [null, 0, true], "told to sacrifice it, nothing happens");
  runEffects(s, [{effect: "sacrificeAll", who: "each", selector: {types: ["Creature"]}}, {effect: "moveZone", targets: [alexios], to: "graveyard", sacrifice: true}], {controller: 1, source: null});
  eq([here(s, ALEXIOS), here(s, "Bear")], [true, false], "\"each player sacrifices all creatures\", and \"sacrifice it\": it stays, the Bear goes");
}
{
  /* The sacrifice effect: with Alexios its only creature, there is nothing to choose and nothing sacrificed. */
  const s = table([at(0, "battlefield", ALEXIOS), at(1, "battlefield", "Bear")]);
  const out = beginResolution(s, [{effect: "sacrifice", who: "each", count: 1, selector: {types: ["Creature"]}}], {controller: 1, source: null});
  eq([out.status === "waiting" ? s.awaiting.player : null], [1], "Rob is not asked: only Maya is, about her Bear");
}
{
  /* "Unless you sacrifice a creature": Alexios is never one of the ways to pay. */
  const s = table([at(0, "battlefield", ALEXIOS, "Bear")]);
  beginResolution(s, [{effect: "unlessPays", who: "you", sacrifice: {types: ["Creature"]}, effects: [{effect: "loseLife", amount: 3}]}], {controller: 0, source: null});
  eq(awaitingChoice(s).options.map((o) => o.label).filter((l) => l.startsWith("Sacrifice")), ["Sacrifice Bear"], "the Bear alone");
}
{
  /* A spell's additional cost: offered with the Bear, never with Alexios. */
  const s = table([at(0, "battlefield", ALEXIOS, "Bear"), at(0, "hand", "Offering")]);
  const casts = legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === "Offering");
  eq(casts.map((a) => a.costNames ?? [s.objects[a.costChoice?.sacrifice]?.card]).flat(), ["Bear"], "an additional cost: the Bear alone");
  const t = table([at(0, "battlefield", ALEXIOS), at(0, "hand", "Offering")]);
  eq(legalActions(t, 0).filter((a) => a.kind === "cast" && a.label === "Offering").length, 0, "with Alexios alone it can't be cast");
}

/* ---- whose counter it is: "that player puts a +1/+1 counter on it" ---- */
{
  /* Rob's Vorinclex: Maya, his opponent, puts the counter at her upkeep -- half of one is none; Rob's own, doubled. */
  const s = table([at(0, "battlefield", ALEXIOS, "Vorinclex, Monstrous Raider")]);
  const alexios = idOf(s, ALEXIOS);
  const trigger = s.objects[alexios].abilities.find((a) => a.kind === "triggered");
  const before = s.objects[alexios].counters["+1/+1"] ?? 0;
  beginResolution(s, trigger.effects, {controller: 0, source: alexios, about: {player: 1}});
  eq([idOf(s, ALEXIOS, 1) !== undefined, (s.objects[alexios].counters["+1/+1"] ?? 0) - before], [true, 0], "Maya takes it, and her counter is halved to none");
  beginResolution(s, trigger.effects, {controller: 1, source: alexios, about: {player: 0}});
  eq([idOf(s, ALEXIOS, 0) !== undefined, (s.objects[alexios].counters["+1/+1"] ?? 0) - before], [true, 2], "Rob takes it back, and his counter is doubled: two");
}
{
  const problems = (effect) => compileScript({schema: "CrankCardScript@1",
    identity: {name: "Odd Raider", oracleId: "x", types: ["Creature"], subtypes: [], manaCost: "{R}", colors: ["R"], colorIdentity: ["R"], power: 1, toughness: 1},
    oracleText: "x", source: "hand", abilities: [{kind: "triggered", text: "x", trigger: {on: "upkeep", yours: false}, effects: [{effect: "putCounter", targets: "self", counter: "+1/+1", count: 1, ...effect}]}]}).problems;
  eq(problems({puts: "that player"}), [], "puts that player compiles");
  ok(problems({puts: "you"}).some((p) => p.includes("puts is \"that player\"")), "and puts anything else is refused");
}

console.log(`engine-cant-be-sacrificed: ${checks} checks passed -- can't be sacrificed: told to, nothing happens; never among the choices of an effect, an unless cost, an additional cost; whose counter it is.`);
