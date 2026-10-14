/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* VOTING (CR 701.38; Fateful Tempest's council's dilemma: "Starting with you, each player votes for past or present. You
 * mill a card for each past vote, then Fateful Tempest deals damage to each opponent equal to the total mana value of
 * cards milled this way. Exile the top card of your library for each present vote. Until the end of your next turn, you
 * may play the exiled cards.").
 *
 * `vote` (script/effects/asking.mjs): each player in the game votes for one of the choices, starting with the effect's
 * controller and going on in turn order (701.38a), each seeing the votes before theirs; the votes are counted by choice
 * for the effects after it (script/resolution.mjs; script/amount.mjs, `{votes: choice}`), and "the total mana value of
 * cards milled this way" is `{totalManaValue: "remembered"}`. One who leaves the game while asked casts no vote (CR 800.4a).
 * The scenarios play the card; this suite holds the order, the tally, a departure, the amounts, the schema and the pilots.
 */
import assert from "node:assert/strict";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {vote} from "../game/engine/script/effects/asking.mjs";
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
const FIX = {Big: {types: ["Creature"], subtypes: ["Giant"], manaCost: "{5}{R}", colors: ["R"], power: 6, toughness: 6}, Small: {types: ["Artifact"], manaCost: "{2}", colors: []}};
/* Maya casts it on her turn, four players: the vote starts with her. */
const tempest = (library = []) => runScenario({name: "vote", seats: 4, at: {turn: 2, phase: "MAIN1"}, library,
  setup: [at(1, "hand", "Fateful Tempest"), at(1, "battlefield", "Mountain", "Wastes", "Wastes")],
  steps: [{tap: "Mountain", seat: 1}, {tap: "Wastes", seat: 1}, {tap: "Wastes", seat: 1}, {cast: "Fateful Tempest", seat: 1}, {resolve: true}]}, index.definition, FIX).state;
const answer = (s, label) => resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === label).index]);

{
  /* Starting with Maya, then Trey, Sam, Rob (CR 701.38a); each sees the votes before theirs. */
  const s = tempest();
  const asked = [];
  for (const label of ["past", "present", "past", "past"]) { asked.push([s.awaiting.player, awaitingChoice(s).title]); answer(s, label); }
  eq(asked.map(([p]) => p), [1, 2, 3, 0], "Maya votes first, then in turn order");
  eq(asked.map(([, t]) => t), ["Council's dilemma: vote for past or present", "Council's dilemma: vote for past or present -- so far past 1, present 0",
    "Council's dilemma: vote for past or present -- so far past 1, present 1", "Council's dilemma: vote for past or present -- so far past 2, present 1"], "with the votes so far");
}
{
  /* Three past votes: Maya mills three -- Big {5}{R}, Small {2}, and a Wastes -- and deals 8 to each opponent. One present
     vote: one card exiled. Maya drew her turn's card first, so her library begins after it. */
  const s = tempest(["Wastes", "Big", "Small", "Wastes", "Big"]);
  for (const label of ["past", "present", "past", "past"]) answer(s, label);
  eq([s.players[0].life, s.players[1].life, s.players[2].life, s.players[3].life], [32, 40, 32, 32], "6 + 2 + 0: 8 to each of Maya's opponents, none to her");
  eq(s.zones.exile.map((id) => s.objects[id].card), ["Big"], "and one card exiled for the one present vote");
}
{
  /* Trey leaves the game while he is asked: no vote of his, and Sam is asked next (CR 800.4a). A player already out is
     never asked. */
  const s = tempest();
  answer(s, "present");
  eq(s.awaiting.player, 2, "Trey is asked");
  concede(s, 2);
  eq(s.awaiting.player, 3, "he leaves; Sam is asked next");
  answer(s, "present");
  concede(s, 0);
  eq(s.awaiting, null, "Rob leaves before his vote: the votes are counted and the spell goes on");
  eq(s.zones.exile.filter((id) => s.objects[id].owner === 1).length, 2, "two present votes, Maya's and Sam's: two cards exiled");
  /* Trey leaves before his turn to vote: he is never asked. */
  const t = tempest();
  concede(t, 2);
  answer(t, "past");
  eq(t.awaiting.player, 3, "after Maya, Sam: Trey, gone, is passed over");
}
{
  /* The amounts: the votes for a choice, and the total mana value of what was remembered (CR 202.3). */
  eq([amountOf({}, {votes: "past"}, {votes: {past: 3, present: 1}}), amountOf({}, {votes: "present"}, {votes: {past: 3, present: 1}}), amountOf({}, {votes: "past"}, {})],
    [3, 1, 0], "the votes for each choice, none before a vote");
  const s = tempest(["Wastes", "Big", "Small"]);
  const ids = s.zones.library[1].slice(0, 2);
  eq(amountOf(s, {totalManaValue: "remembered"}, {remembered: ids}), 8, "a {5}{R} and a {2}: 8");
  ok(amountProblems({votes: ""}).length > 0 && amountProblems({totalManaValue: "that card"}).length > 0 && amountProblems({votes: "past"}).length === 0, "the schema holds both");
  /* Two choices or more, each its own words; fewer and nothing is asked. */
  const script = (choices) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Sorcery"], manaCost: "{R}", colors: ["R"]},
    oracleText: "Each player votes.", abilities: [{kind: "spell", text: "Each player votes.", targets: [], effects: [{effect: "vote", choices}]}]});
  ok(validateScript(script(["past", "present"])).valid, "two choices: a vote");
  for (const bad of [["past"], ["past", "past"], ["past", 3]]) ok(validateScript(script(bad)).errors.some((e) => /choices/.test(e.path)), `${JSON.stringify(bad)} refused`);
  eq(vote.open(s, {choices: ["past"]}, {controller: 0}), false, "one choice is no vote");
}
{
  /* The pilots vote. */
  const s = tempest();
  for (const pick of [housePilot({seat: 1}).answer(projectFor(s, 1), awaitingChoice(s)), randomLegalPilot(createRng("vote")).answer(awaitingChoice(s))])
    ok(pick.indices.length === 1 && ["past", "present"].includes(awaitingChoice(s).options[pick.indices[0]]?.label), "a pilot votes for one of them");
}

console.log(`engine-vote: ${checks} checks passed -- each player from the caster in turn order, the votes so far in the question, one who leaves casting none; the votes and the total mana value counted; the schema; the pilots`);
