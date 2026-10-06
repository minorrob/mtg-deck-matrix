/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "WHENEVER A CREATURE IS EXILED FROM THE BATTLEFIELD" (Soulherder; AI 1's Chulane deck, after the live game of 2026-10-04).
 *
 * The trigger kind `exiled` (cards/index.mjs): a permanent put into exile from the battlefield, `who` and `filter` read as
 * it last existed -- a leaves-the-battlefield ability, so it looks back (CR 603.10a): each of three exiled at once is one
 * triggering, this creature among them; a land animated into a creature counts as the creature it was; a token counts
 * though it ceases to exist; a commander counts though its owner then puts it home (the card's ruling of 2019-06-14,
 * CR 903.9a). Exile from a graveyard is not from the battlefield. And Soulherder's other ability, "exile another target
 * creature you control, then return that card to the battlefield under its owner's control": a new object (CR 400.7), its
 * counters gone, under its owner.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {collectTriggers, openTriggers} from "../game/engine/rules/trigger.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {compileScript, TRIGGER_KINDS} from "../game/engine/cards/index.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const SH = "Soulherder";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Soldier: {types: ["Creature"], subtypes: ["Soldier"], colors: ["W"], manaCost: null, power: 1, toughness: 1, token: true},
  Totem: {types: ["Artifact"], manaCost: "{4}", colors: []}};
const table = (setup, seats = 2, steps = []) => runScenario({name: "exiled", seats, setup, steps}, index.definition, FIX).state;
const rng = createRng("exiled");
const named = (s, card) => s.zones.battlefield.filter((id) => s.objects[id].card === card);
const mine = (s) => (s.pendingTriggers ?? []).filter((t) => t.source.name === SH && /exiled from the battlefield/.test(t.text));
const exile = (s, ids) => collectTriggers(s, runEffect(s, {effect: "moveZone", targets: ids, to: "exile"}, {controller: 1, source: null}));
const settle = (s) => {
  for (let n = 0; n < 60; n += 1) {
    if (s.awaiting?.kind === "order-triggers") { resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index)); continue; }
    if (s.awaiting) return;
    openTriggers(s);
    if (s.awaiting) continue;
    if (!s.stack.length) return;
    passPriority(s, null, rng);
  }
};
const counters = (s) => s.objects[named(s, SH)[0]]?.counters?.["+1/+1"] ?? 0;

{
  /* Three exiled at once (one action): three triggerings, three counters. */
  const s = table([at(0, "battlefield", SH), at(1, "battlefield", "Bear", "Bear", "Bear")]);
  exile(s, named(s, "Bear"));
  eq(mine(s).length, 3, "three Bears exiled together: three triggers");
  settle(s);
  eq(counters(s), 3, "three +1/+1 counters");
}
{
  /* Soulherder exiled with them: it looks back and sees all of them, itself too (CR 603.10a) -- with nothing left to put the
     counters on. */
  const s = table([at(0, "battlefield", SH), at(1, "battlefield", "Bear", "Bear")]);
  exile(s, [...named(s, SH), ...named(s, "Bear")]);
  eq(mine(s).length, 3, "itself and two Bears: three triggers, from the battlefield as it was");
  settle(s);
  eq(s.zones.exile.length, 3, "and they resolve doing nothing: Soulherder is in exile");
}
{
  /* What it was as it left: a token creature (gone at once), and a land that was a creature then; an artifact is not one. */
  const s = table([at(0, "battlefield", SH), at(1, "battlefield", "Soldier", "Forest", "Totem")]);
  const [forest] = named(s, "Forest");
  runEffect(s, {effect: "animate", targets: [forest], addTypes: ["Creature"], power: 3, toughness: 3, until: "end-of-turn"}, {controller: 1, source: null});
  exile(s, [...named(s, "Soldier"), forest, ...named(s, "Totem")]);
  eq(mine(s).length, 2, "the Soldier token and the animated Forest: two; the Totem: none");
}
{
  /* Leaving the battlefield another way is not being exiled: a Bear that dies, one returned to its owner's hand. */
  const s = table([at(0, "battlefield", SH), at(1, "battlefield", "Bear", "Bear")]);
  const [one, two] = named(s, "Bear");
  collectTriggers(s, runEffect(s, {effect: "destroy", targets: [one]}, {controller: 1, source: null}));
  collectTriggers(s, runEffect(s, {effect: "moveZone", targets: [two], to: "hand"}, {controller: 1, source: null}));
  eq(mine(s).length, 0, "died, and bounced: no trigger");
}
{
  /* A creature card exiled from a graveyard was not on the battlefield. */
  const s = table([at(0, "battlefield", SH), at(1, "graveyard", "Bear")]);
  exile(s, s.zones.graveyard[1]);
  eq(mine(s).length, 0, "exiled from Maya's graveyard: no trigger");
}
{
  /* A commander exiled triggers it, and then its owner may put it home (the card's ruling; CR 903.9a). */
  const s = table([at(0, "battlefield", SH, "Plains"), at(0, "hand", "Swords to Plowshares"), at(1, "command", "Bear"), at(1, "battlefield", "Forest", "Wastes")], 2,
    [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Forest", seat: 1}, {tap: "Wastes", seat: 1}, {cast: "Bear", seat: 1}, {resolve: true}, {pass: 1},
      {tap: "Plains", seat: 0}, {cast: "Swords to Plowshares", seat: 0, targets: [{card: "Bear"}]}, {resolve: true}]);
  eq(s.awaiting?.kind, "commander-replacement", "the commander's owner is asked whether it goes home");
  resolveAwaiting(s, [0], null, rng);
  settle(s);
  eq([s.zones.command[1].map((id) => s.objects[id].card), counters(s)], [["Bear"], 1], "the Bear home, and Soulherder has its counter");
}
{
  /* Its end-step flicker: a borrowed creature returns under its owner's control, a new object without its counters. */
  const s = table([at(0, "battlefield", SH), at(1, "battlefield", "Bear")]);
  const [bear] = named(s, "Bear");
  runEffect(s, {effect: "gainControl", targets: [bear]}, {controller: 0, source: null});
  s.objects[bear].counters["+1/+1"] = 2;
  const fresh = (state) => state.zones.battlefield.find((id) => state.objects[id].card === "Bear");
  const sh = named(s, SH)[0];
  runEffect(s, {effect: "moveZone", targets: [bear], to: "exile", andReturn: true}, {controller: 0, source: sh});
  const back = fresh(s);
  eq([back !== bear, s.objects[back].controller, s.objects[back].counters["+1/+1"] ?? 0], [true, 1, 0], "back as a new object, Maya's, with no counters");
}

/* The trigger kind, compiled; from anywhere but the battlefield, refused rather than read as the battlefield. */
{
  const script = (trigger) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "t", types: ["Creature"], manaCost: "{1}", power: 1, toughness: 1}, oracleText: "x",
    abilities: [{kind: "triggered", text: "x", trigger, effects: [{effect: "draw", count: 1}]}]});
  eq(compileScript(script({on: "exiled", who: "any", filter: {types: ["Creature"]}})).definition.abilities[0].trigger,
    {on: "GameEventCardChangeZone", from: "Battlefield", to: "Exile", who: "any", filter: {types: ["Creature"]}}, "compiled to a zone change from the battlefield to exile");
  eq(compileScript(script({on: "exiled", who: "any", from: "graveyard"})).definition, null, "exiled from a graveyard: not built, and refused");
  eq([TRIGGER_KINDS.includes("exiled"), missingFor({triggers: ["Exiled"]})], [true, []], "the catalog: Forge's Exiled trigger is built");
}

console.log(`engine-exiled-trigger: ${checks} checks passed -- a creature exiled from the battlefield, each of several at once, looked back at as it was (a token, an animated land, a commander, the trigger's own creature); and a flicker under the owner.`);
