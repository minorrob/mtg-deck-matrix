/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A PAYMENT REPEATED, AND "THAT MANY" AFTER IT (Bloodthirsty Adversary: "you may pay {2}{R} any number of times. When you
 * pay this cost one or more times, put that many +1/+1 counters on this creature, then exile up to that many target instant
 * and/or sorcery cards with mana value 3 or less from your graveyard and copy them. You may cast any number of the copies
 * without paying their mana costs."; CR 118.12a, 601.2h, 603.12, 107.3, 707.12).
 *
 * unlessPays's `timesAny` (script/effects/asking.mjs): how many times is the payer's to choose, each count their mana could
 * pay -- the cost that many times over, paid as one, its ways asked when they differ -- and "that many" after it is the
 * count (`paidX`, script/resolution.mjs), the X the reflexive trigger is made with (effects/permanents.mjs). A counted
 * target "up to that many" is `count: {max: "X"}` (script/bind.mjs, countOf), read with the X it was made with -- a
 * reflexive trigger's alone (script/schema.mjs). The scenarios play the card; this suite holds the counts offered, the way
 * to pay, the count read as X, the schema and the pilots.
 */
import assert from "node:assert/strict";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {countOf, countedChoice} from "../game/engine/script/bind.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
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
const spell = (types, cost) => ({types, manaCost: cost, colors: [], spell: {id: "s", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]}});
const FIX = {Opt: spell(["Instant"], "{U}"), Ponder: spell(["Sorcery"], "{U}"), Brainstorm: spell(["Instant"], "{U}"), Tome: spell(["Sorcery"], "{4}"),
  /* A land that taps for {R} or {G}: two ways to pay, told apart. */
  Taiga: {types: ["Land"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: [{R: 1}, {G: 1}]}]}};
const enter = (lands, graveyard = []) => runScenario({name: "times", setup: [at(0, "hand", "Bloodthirsty Adversary"), at(0, "battlefield", "Mountain", "Wastes", ...lands), at(0, "graveyard", ...graveyard)],
  steps: [{tap: "Mountain"}, {tap: "Wastes"}, {cast: "Bloodthirsty Adversary"}, {resolve: true}, {resolve: true}]}, index.definition, FIX).state;
const labels = (s) => awaitingChoice(s).options.map((o) => o.label);
const choose = (s, label) => resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === label).index]);

{
  /* The counts offered: each its mana could pay -- three Mountains and six Wastes pay it three times; colorless mana alone,
     never, and nothing is asked. */
  eq(labels(enter(["Mountain", "Mountain", "Mountain", ...Array(6).fill("Wastes")])), ["Pay {2}{R} once", "Pay {2}{R} twice", "Pay {2}{R} 3 times", "Don't pay"],
    "once, twice, three times, or not");
  eq(labels(enter(["Mountain", "Mountain", ...Array(6).fill("Wastes")])), ["Pay {2}{R} once", "Pay {2}{R} twice", "Don't pay"], "two red sources: twice at most");
  eq(enter([...Array(6).fill("Wastes")]).awaiting, null, "with no red mana, no choice to make: nothing asked");
  eq(awaitingChoice(enter(["Mountain", "Wastes", "Wastes"])).title, "Bloodthirsty Adversary: pay {2}{R} any number of times?", "the question in the card's words");
}
{
  /* The cost that many times over, paid as one: with a Taiga beside two Mountains and Wastes, twice can be paid more than
     one way, and which is asked -- here the Mountains, the Taiga kept. */
  const s = enter(["Mountain", "Mountain", "Taiga", "Wastes", "Wastes", "Wastes", "Wastes"], ["Opt", "Ponder"]);
  choose(s, "Pay {2}{R} twice");
  ok(/choose the mana/.test(awaitingChoice(s).title), "which mana pays is asked");
  const way = awaitingChoice(s).options.find((o) => !/Taiga/.test(o.label));
  resolveAwaiting(s, [way.index]);
  const untapped = s.zones.battlefield.filter((id) => !s.objects[id].tapped).map((id) => s.objects[id].card).sort();
  eq(untapped, ["Bloodthirsty Adversary", "Taiga"], "the Mountains and four Wastes paid; the Taiga untapped");
  /* "That many": the reflexive trigger made with X = 2, its target "up to two". */
  const trigger = s.stack[s.stack.length - 1];
  eq([trigger.x, s.awaiting?.kind, awaitingChoice(s).max, trigger.targets[0].max], [2, "choose-targets", 2, 2], "the trigger's X is two, and it may target up to two -- its placeholder says so too");
}
{
  /* countOf reads "X" with the X it is given; none, and it is none. */
  const spec = {what: "card", count: {min: 0, max: "X"}};
  eq([countOf(spec, {x: 3}), countOf(spec, {}), countOf({what: "card", count: {min: 1, max: 2}}, {x: 5})], [{min: 0, max: 3}, {min: 0, max: 0}, {min: 1, max: 2}], "max X is X");
  const s = enter(["Mountain", "Wastes", "Wastes"], ["Opt", "Brainstorm", "Tome"]);
  const choice = countedChoice(s, {anyOf: [{what: "card", zone: "graveyard", controller: "you", types: ["Instant"]}], count: {min: 0, max: "X"}}, {controller: 0, x: 1}, {id: "t", name: "T"});
  eq([choice.min, choice.max, choice.options.length], [0, 1, 2], "two instants to choose from, up to one");
}
{
  /* The schema: timesAny is a "you may" of a mana cost alone; "up to X" targets a reflexive trigger's. */
  const script = (effects, targets = []) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Sorcery"], manaCost: "{R}", colors: ["R"]},
    oracleText: "You may pay {2}{R} any number of times.", abilities: [{kind: "spell", text: "You may pay {2}{R} any number of times.", targets, effects}]});
  const pay = (more) => [{effect: "unlessPays", who: "you", mana: "{2}{R}", timesAny: true, ifPaid: true, effects: [{effect: "draw", count: 1}], ...more}];
  ok(validateScript(script(pay({}))).valid, "a mana cost, any number of times, if paid");
  for (const bad of [{ifPaid: undefined}, {mana: undefined}, {amount: 2}, {timesAny: "yes"}])
    ok(validateScript(script(pay(bad))).errors.some((e) => /timesAny/.test(e.path)), `refused: ${JSON.stringify(bad)}`);
  const reflexive = (count) => [{effect: "immediateTrigger", text: "When you do, draw.", targets: [{what: "card", zone: "graveyard", count}], effects: [{effect: "draw", count: 1}]}];
  ok(validateScript(script(reflexive({min: 0, max: "X"}))).valid, "a reflexive trigger's \"up to that many\"");
  ok(validateScript(script(reflexive({min: 1, max: "X"}))).errors.some((e) => /count/.test(e.path)), "at least one of X refused: X may be none");
  ok(validateScript(script([], [{what: "card", zone: "graveyard", count: {min: 0, max: "X"}}])).errors.some((e) => /count/.test(e.path)), "and a spell's own targets cannot say X");
}
{
  /* The pilots answer how many times, and the counted target. */
  const s = enter(["Mountain", "Mountain", ...Array(4).fill("Wastes")], ["Opt", "Ponder"]);
  for (const answer of [housePilot({seat: 0}).answer(projectFor(s, 0), awaitingChoice(s)), randomLegalPilot(createRng("times")).answer(awaitingChoice(s))])
    ok(answer.indices.length === 1 && awaitingChoice(s).options[answer.indices[0]] !== undefined, "an answer of one of them");
  choose(s, "Pay {2}{R} twice");
  const choice = awaitingChoice(s);
  for (const answer of [housePilot({seat: 0}).answer(projectFor(s, 0), choice), randomLegalPilot(createRng("times")).answer(choice)])
    ok(answer.indices.length <= 2, "up to two targets");
}

console.log(`engine-unless-times: ${checks} checks passed -- a cost any number of times: each count the mana pays offered, nothing asked when none, the cost that many times over paid as one with its ways asked; that many the reflexive trigger's X and "up to X" its targets; the schema; the pilots`);
