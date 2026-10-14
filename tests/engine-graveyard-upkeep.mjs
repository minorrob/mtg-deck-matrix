/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (w2c-hands-triggers): A TRIGGERED ABILITY THAT WORKS FROM A GRAVEYARD (CR 113.6b, 113.6m).
 *
 * "At the beginning of your upkeep, you may return this card from your graveyard to your hand" (Squee, Goblin Nabob): an
 * ability whose effect moves its card out of the graveyard functions there and only there -- `zone: "graveyard"` on the
 * triggered ability (cards/index.mjs), read by rules/trigger.mjs beside the battlefield's. What the scenarios cannot reach:
 * the card gone from the graveyard before the trigger resolves, whose upkeep and whose trigger, two of them at once, and
 * what the compiler refuses.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const SQUEE = "Squee, Goblin Nabob";
const later = (seat, zone, ...names) => ({seat, zone, cards: names, sick: true});
/* A card with two upkeep triggers: one of the battlefield's, and one that works from its graveyard. */
const UPKEEP = {on: "GameEventTurnPhase", phase: "UPKEEP", yourTurn: true};
const FIXTURES = {Ghoul: {types: ["Creature"], manaCost: "{1}", colors: [], power: 1, toughness: 1, abilities: [
  {id: "g", kind: "triggered", text: "At the beginning of your upkeep, you gain 1 life.", trigger: UPKEEP, effects: [{effect: "gainLife", amount: 1}]},
  {id: "r", kind: "triggered", zone: "graveyard", text: "At the beginning of your upkeep, return this card from your graveyard to your hand.", trigger: UPKEEP,
    effects: [{effect: "moveZone", targets: "self", to: "hand"}]}]}};
const play = (scenario) => runScenario({expect: [], ...scenario}, cards.definition, FIXTURES);
const where = (state, name) => Object.values(state.objects).filter((o) => o.card === name).map((o) => `${o.zone}:${o.owner}`).sort();
/* Everyone passes until the stack is empty, answering a "you may" with Yes. */
function settle(state) {
  const rng = createRng("settle");
  for (let n = 0; n < 50 && (state.stack.length || state.awaiting); n += 1) {
    if (state.awaiting) resolveAwaiting(state, [awaitingChoice(state).options.find((o) => o.label === "Yes")?.index ?? 0], null, rng);
    else passPriority(state, null, rng);
  }
}

{
  /* Exiled from his graveyard in response: the trigger resolves, Yes, and nothing comes back -- the card in exile is a new
     object (CR 400.7). */
  const {state} = play({name: "exiled", setup: [later(0, "graveyard", SQUEE)], steps: [{to: {turn: 3, phase: "UPKEEP"}}]});
  eq([state.stack.length, state.stack[0]?.playerId], [1, 0], "his upkeep: his trigger, on the stack");
  const id = Object.values(state.objects).find((o) => o.card === SQUEE).id;
  runEffects(state, [{effect: "moveZone", targets: [id], to: "exile"}], {controller: 1});
  settle(state);
  eq(where(state, SQUEE), ["exile:0"], "still in exile, not in his hand");
}
{
  /* In Maya's graveyard: her upkeep (turn 2) triggers it, hers -- and two of hers, two triggers. */
  const {state} = play({name: "hers", setup: [later(1, "graveyard", SQUEE, SQUEE)], steps: [{to: {turn: 2, phase: "UPKEEP"}}]});
  const waiting = [...state.stack.filter((e) => e.kind === "trigger").map((e) => e.playerId), ...(state.pendingTriggers ?? []).map((t) => t.controller)];
  eq(waiting, [1, 1], "her upkeep: two triggers, both hers");
  settle(state);
  eq(where(state, SQUEE), ["hand:1", "hand:1"], "both returned to her hand");
}
{
  /* In the graveyard, only the ability that works there; on the battlefield, only the other. */
  const dead = play({name: "ghoul", setup: [later(0, "graveyard", "Ghoul")], steps: [{to: {turn: 3, phase: "UPKEEP"}}]});
  eq(dead.state.stack.map((e) => e.abilityId), ["r"], "in his graveyard: the return alone");
  settle(dead.state);
  eq([where(dead.state, "Ghoul"), dead.state.players[0].life], [["hand:0"], 40], "returned, and no life gained");
  const alive = play({name: "ghoul alive", setup: [later(0, "battlefield", "Ghoul")], steps: [{to: {turn: 3, phase: "UPKEEP"}}]});
  eq(alive.state.stack.map((e) => e.abilityId), ["g"], "on his battlefield: the life alone");
}
{
  /* What the compiler keeps and refuses: from the graveyard, or from nowhere but the battlefield. */
  const script = (zone) => ({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Creature"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], power: 1, toughness: 1},
    oracleText: "Odd.", abilities: [{kind: "triggered", text: "Odd.", trigger: {on: "upkeep"}, ...(zone ? {zone} : {}), effects: [{effect: "gainLife", amount: 1}]}]});
  const compiled = (zone) => compileScript(script(zone));
  eq([compiled("graveyard").definition.abilities[0].zone, compiled(null).definition.abilities[0].zone], ["graveyard", undefined], "kept on the ability, or not there");
  eq([compiled("graveyard").problems.length, compiled("hand").problems.some((p) => p.includes("works from the battlefield, or from a graveyard"))], [0, true], "a hand is refused");
}

console.log(`engine-graveyard-upkeep: ${checks} checks passed -- a triggered ability that works from its card's graveyard triggers there alone, for its owner, once for each card, and finds nothing once the card has left.`);
