/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* MODES ARE CHOSEN AS A SPELL IS CAST, OR AS A TRIGGER GOES ON THE STACK -- NEVER AS IT RESOLVES (CR 700.2, 601.2b,
 * 603.3c).
 *
 * A modal spell whose modes name no target (Austere Command: "Choose two -- destroy all artifacts ...") had its modes
 * asked as it resolved, after every response: its caster learned what the table did before choosing, and the table never
 * saw the modes the spell was cast with. A spell whose one effect is a modal is now offered once per choice of modes, as
 * one with targets in its modes always was (cards/index.mjs, rules/actions.mjs withModes); a triggered ability whose one
 * effect is a modal is asked its modes as it is put on the stack (rules/trigger.mjs), its mode named in the card's words.
 * A "you may" stays a question at resolution: it is not a mode (CR 603.5), and nothing here touches it.
 */
import assert from "node:assert/strict";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
const play = (name, setup, steps) => runScenario({name, setup, steps}, index.definition, FIX).state;

/* ---- a spell ---- */
{
  const LANDS = ["Plains", "Plains", "Wastes", "Wastes", "Wastes", "Wastes"];
  const s = play("Austere Command", [at(0, "battlefield", ...LANDS), at(0, "hand", "Austere Command"), at(1, "battlefield", "Bear")], LANDS.map((tap) => ({tap})));
  const casts = legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === "Austere Command");
  eq(casts.map((a) => JSON.stringify(a.modes)).sort(), ["[0,1]", "[0,2]", "[0,3]", "[1,2]", "[1,3]", "[2,3]"],
    "Austere Command is offered once per pair of its four modes, chosen as it is cast");
  applyAction(s, 0, casts.find((a) => JSON.stringify(a.modes) === "[2,3]"));
  eq(s.stack[s.stack.length - 1].modes, [2, 3], "the spell on the stack carries the modes it was cast with, for all to see");
  for (let n = 0; n < 4 && s.stack.length; n += 1) { ok(!s.awaiting, "nothing is asked as it resolves"); passPriority(s); }
  eq(Object.values(s.objects).filter((o) => o.card === "Bear" && o.zone === "graveyard").length, 1, "and both creature modes destroyed Maya's Bear");
}

/* ---- a triggered ability ---- */
{
  /* Tireless Provisioner: "Whenever a land you control enters, create a Food token or a Treasure token." */
  const s = play("Tireless Provisioner", [at(0, "battlefield", "Tireless Provisioner"), at(0, "hand", "Forest")], [{play: "Forest"}]);
  eq(s.awaiting?.kind, "trigger-targets", "the land enters: its mode is asked as the trigger goes on the stack, before anyone may respond");
  const choice = awaitingChoice(s);
  eq(choice.options.map((o) => o.label).sort(), ["Create a Food token.", "Create a Treasure token."], "each mode in the card's words, with no arrow to a target it has not");
}

for (const name of ["Austere Command", "Return of the Wildspeaker", "Ghalta and Mavren", "Tireless Provisioner"])
  ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-modes-up-front: ${checks} checks passed -- a modal spell's modes chosen as it is cast and a modal trigger's as it goes on the stack, whether or not its modes name targets (CR 700.2, 601.2b, 603.3c).`);
