/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A TEMPTING OFFER (Tempt with Vengeance; CR 207.2c, an ability word, and 101.4): "Create X 1/1 red Elemental creature
 * tokens with haste. Each opponent may create X 1/1 red Elemental creature tokens with haste. For each opponent who does,
 * create X 1/1 red Elemental creature tokens with haste."
 *
 * "Each opponent may" is a repetition over the opponents in turn order (script/effects/index.mjs, eachOf), each asked a
 * "may" of their own -- a modal whose chooser is that player, the mode that does it saying `did` (effects/asking.mjs) --
 * and the opponents who did are kept for the effects after it (script/resolution.mjs). "For each opponent who does" counts
 * them (`{playersWhoDid: true}`, script/amount.mjs), "X ... for each" with `times: "X"`, so Rob's tokens for them are one
 * instruction, X for each, as the card says. One who leaves the game while asked is answered for by
 * another opponent (CR 800.4g), creates nothing (800.4b) and is not one who did. The scenarios play the card; this suite
 * holds the amount, the schema, the count as it is read, the departure and the pilots.
 */
import assert from "node:assert/strict";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const CAST = [{tap: "Mountain"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Tempt with Vengeance", x: 2}, {resolve: true}];
const tempt = (seats, steps, more = []) => runScenario({name: "tempt", seats, setup: [at(0, "hand", "Tempt with Vengeance"), at(0, "battlefield", "Mountain", "Wastes", "Wastes"), ...more],
  steps: [...CAST, ...steps]}, index.definition).state;
const elementals = (s, seat) => s.zones.battlefield.filter((id) => s.objects[id].card === "Elemental" && s.objects[id].controller === seat).length;

{
  /* The amount: the players who did, X for each. */
  eq([amountOf({}, {playersWhoDid: true}, {whoDid: [1, 3]}), amountOf({}, {playersWhoDid: true, times: "X"}, {whoDid: [1, 3], x: 2}),
    amountOf({}, {playersWhoDid: true, times: "X"}, {x: 2})], [2, 4, 0], "two who did; X=2 for each, four; nobody, none");
  ok(amountProblems({playersWhoDid: false}).length > 0 && amountProblems({playersWhoDid: true, times: "Y"}).length > 0 && amountProblems({playersWhoDid: true, times: "X"}).length === 0,
    "the schema: playersWhoDid is true, and times a whole number or X");
  const script = (did) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Sorcery"], manaCost: "{R}", colors: ["R"]},
    oracleText: "Each opponent may draw a card.", abilities: [{kind: "spell", text: "Each opponent may draw a card.", targets: [],
      effects: [{effect: "repeatFor", each: "opponent", effects: [{effect: "modal", chooser: "that player", modes: [{text: "Draw", did, effects: [{effect: "draw", who: "that player", count: 1}]}, {text: "Don't", effects: []}]}]}]}]});
  ok(validateScript(script(true)).valid, "a mode that did is `did: true`");
  ok(validateScript(script("yes")).errors.some((e) => /did/.test(e.path)), "any other word refused");
}
{
  /* Asked in turn order from Rob (CR 101.4), each opponent of their own; those who did, kept. */
  const s = tempt(4, [{choose: ["Create them"]}, {choose: ["Don't"]}]);
  eq([s.awaiting.player, s.resolving.context.whoDid], [3, [1]], "Maya took it, Trey did not; Sam is asked last, and only Maya is kept as one who did");
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === "Create them").index]);
  eq([0, 1, 2, 3].map((seat) => elementals(s, seat)), [6, 2, 0, 2], "Rob two and four more; Maya two, Trey none, Sam two");
}
{
  /* "For each opponent who does": counted as the last instruction reaches the head of the resolution (CR 608.2h), after the
     last opponent has answered -- not as the spell began. */
  const s = tempt(3, [{choose: ["Create them"]}]);
  eq([s.resolving.context.whoDid, s.resolving.queue.at(-1).count], [[1], {playersWhoDid: true, times: "X"}], "with Trey still to answer, one who did, and the count not yet read");
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === "Create them").index]);
  eq(elementals(s, 0), 6, "Trey takes it too: two and four more");
}
{
  /* Maya leaves the game while she is asked: another opponent answers for her (CR 800.4g) -- Trey, the only one -- and
     taking it creates nothing under her control (800.4b), and she is not one who did. */
  const s = tempt(3, []);
  eq(s.awaiting.player, 1, "Maya is asked");
  concede(s, 1);
  eq(s.awaiting.player, 2, "she leaves; Trey, the only other opponent, answers for her");
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === "Create them").index]);
  eq([elementals(s, 1), s.resolving?.context.whoDid ?? []], [0, []], "nothing is created for Maya, and she is not one who did");
  eq(s.awaiting.player, 2, "then Trey is asked his own");
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === "Create them").index]);
  eq([elementals(s, 0), elementals(s, 2)], [4, 2], "Rob two and two for Trey");
}
{
  /* The pilots answer it, as any "may". */
  const s = tempt(3, []);
  const choice = awaitingChoice(s);
  for (const answer of [housePilot({seat: 1}).answer(projectFor(s, 1), choice), randomLegalPilot(createRng("tempt")).answer(choice)])
    ok(answer.indices.length === 1 && choice.options[answer.indices[0]] !== undefined, "an answer of one of the two");
}

console.log(`engine-tempting-offer: ${checks} checks passed -- each opponent asked in turn order, those who did kept and counted as the last instruction is reached, X for each; one who leaves answered for, given nothing and not counted; the schema; the pilots`);
