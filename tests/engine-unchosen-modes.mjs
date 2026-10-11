/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "AS GOLLUM ENTERS, CHOOSE ODD OR EVEN" AND "CHOOSE ONE THAT HASN'T BEEN CHOSEN" (Gollum, Riddle Master; Train C phase 2,
 * w3-last; CR 614.12, 202.3, 603.3c, 700.2, 400.7).
 *
 * Two pieces. A selector's `manaValue.parity` (script/filter.mjs): "Odd" or "Even" -- zero is even, a spell's X counted on
 * the stack (CR 202.3e) -- or "$chosen", the quality its permanent chose as it entered (rules/entering.mjs keeps it,
 * script/chosen.mjs reads it); before anything is chosen, nothing matches. And a triggered ability's modal `unchosen`
 * (rules/trigger.mjs, modesTaken): the modes it may choose as it is put on the stack are those its permanent has not chosen
 * for it before -- kept on the permanent, by ability, as each is chosen (once chosen, chosen, whatever becomes of that
 * trigger), a new object starting afresh (CR 400.7); the permanent gone before the modes are chosen, those it had chosen as
 * it triggered (CR 113.7a); all chosen, there is no way, and the trigger is removed from the stack (CR 603.3c). The card
 * scenarios play Gollum; this suite holds the edges, the house pilot and the compiler.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {NONE_CHOSEN} from "../game/engine/script/chosen.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const GOLLUM = "Gollum, Riddle Master";
const draw = (cost, more = {}) => ({types: ["Instant"], manaCost: cost, colors: [], spell: {id: "s", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]}, ...more});
const FIX = {Nought: draw("{0}"), Single: draw("{C}"), Double: draw("{1}{C}"), Triple: draw("{2}{C}"), Burst: draw("{X}{C}")};
const play = (name, setup, steps) => runScenario({name, setup, steps}, index.definition, FIX).state;
const gollumOf = (s) => s.zones.battlefield.find((id) => s.objects[id].card === GOLLUM);
const CAST = [{tap: "Swamp"}, {tap: "Wastes"}, {cast: GOLLUM}, {resolve: true}];
const ENTERED = (quality) => [...CAST, {choose: [quality]}, {to: {turn: 2, phase: "MAIN1"}}];
const SETUP = (...maya) => [{seat: 0, zone: "battlefield", cards: ["Swamp", "Wastes"]}, {seat: 0, zone: "hand", cards: [GOLLUM]},
  {seat: 1, zone: "battlefield", cards: ["Wastes", "Wastes", "Wastes", "Wastes"]}, {seat: 1, zone: "hand", cards: maya}];
const maya = (card, wastes, more = {}) => [...Array.from({length: wastes}, () => ({tap: "Wastes", seat: 1})), {cast: card, seat: 1, ...more}];
const MODES = ["Put a +1/+1 counter on Gollum.", "Each opponent loses 2 life and you gain 2 life.", "Draw a card."];
const labels = (s) => awaitingChoice(s).options.map((o) => o.label);

/* ---- odd or even ---- */
{
  const s = play("hands", [{seat: 0, zone: "hand", cards: ["Nought", "Single", "Double", "Triple"]}], []);
  const hand = s.zones.hand[0];
  const fits = (parity) => hand.filter((id) => compileSelector({what: "card", zone: "hand", manaValue: {parity}})(s, id, {controller: 0})).map((id) => s.objects[id].card).sort();
  eq([fits("Even"), fits("Odd")], [["Double", "Nought"], ["Single", "Triple"]], "even: mana values 0 and 2 -- zero is even; odd: 1 and 3");
  eq(fits(NONE_CHOSEN), [], "before anything is chosen, nothing");
  let refused = false;
  try { compileSelector({what: "card", manaValue: {parity: "Prime"}}); } catch (e) { refused = /parity/.test(e.message); }
  ok(refused, "a quality the grammar does not know is refused");
}
{
  const s = play("chosen", SETUP(), ENTERED("Even"));
  eq(s.objects[gollumOf(s)].chosen, "Even", "the quality chosen as Gollum entered is kept on it");
  /* X counts on the stack (CR 202.3e): {X}{C} with X 1 is mana value 2, even; with X 0, 1. */
  const two = play("X is 1", SETUP("Burst"), [...ENTERED("Even"), ...maya("Burst", 2, {x: 1})]);
  eq([two.stack.length, two.awaiting?.kind], [2, "trigger-targets"], "Maya's {X}{C} with X 1, mana value 2: Gollum's ability triggers");
  const one = play("X is 0", SETUP("Burst"), [...ENTERED("Even"), ...maya("Burst", 1, {x: 0})]);
  eq([one.stack.length, one.awaiting], [1, null], "with X 0, mana value 1: it does not");
}
{
  /* A Gollum put onto the battlefield without entering through its own choice (as the scenario puts it) has chosen nothing. */
  const s = play("nothing chosen", [{seat: 0, zone: "battlefield", cards: [GOLLUM]}, {seat: 1, zone: "battlefield", cards: ["Wastes", "Wastes"]}, {seat: 1, zone: "hand", cards: ["Nought", "Single"]}],
    [{to: {turn: 2, phase: "MAIN1"}}, ...maya("Nought", 0), {resolve: true}, ...maya("Single", 1)]);
  eq([s.objects[gollumOf(s)].chosen, s.stack.length, s.awaiting], [undefined, 1, null], "nothing chosen: neither an even nor an odd spell triggers it");
}

/* ---- each mode once ---- */
{
  const s = play("first", SETUP("Single", "Single"), [...ENTERED("Odd"), ...maya("Single", 1)]);
  eq(labels(s), MODES, "the first time, all three");
  resolveAwaiting(s, [1]);
  const entry = s.stack[s.stack.length - 1];
  /* Remembered as it is chosen, with the trigger still on the stack: countered before it resolves, it was chosen all the same. */
  eq([entry.name, entry.modes, s.objects[gollumOf(s)].modesChosen], [GOLLUM, [1], {[entry.abilityId]: [1]}],
    "chosen: the life mode, remembered on Gollum by its ability as it is chosen, before the trigger resolves");
}
{
  const steps = [...ENTERED("Odd"), ...maya("Single", 1), {choose: [MODES[1]]}, {resolve: true}, {resolve: true}, ...maya("Single", 1)];
  const s = play("second", SETUP("Single", "Single", "Single"), steps);
  eq(labels(s), [MODES[0], MODES[2]], "the second time: the two not chosen");
  const pilot = housePilot({seat: 0, cards: index.definition});
  const q = awaitingChoice(s);
  const answer = pilot.answer(projectFor(s, 0), q);
  ok(answer.indices.length === 1 && q.options[answer.indices[0]] !== undefined, "the house pilot answers with one of them");
  resolveAwaiting(s, answer.indices);
  const gollum = gollumOf(s), ability = Object.keys(s.objects[gollum].modesChosen)[0];
  eq(s.objects[gollum].modesChosen[ability].length, 2, "and that one is remembered beside the first");
}
{
  /* Two at once (Roaming Throne, Halfling chosen: "it triggers an additional time"): the second's modes are chosen after the
     first's, and the first's choice is already taken -- the permanent's record as it is now, not as it was as they triggered. */
  const setup = [{seat: 0, zone: "battlefield", cards: ["Swamp", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes"]}, {seat: 0, zone: "hand", cards: [GOLLUM, "Roaming Throne"]},
    {seat: 1, zone: "battlefield", cards: ["Wastes"]}, {seat: 1, zone: "hand", cards: ["Single"]}];
  const THRONE = [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Roaming Throne"}, {resolve: true}, {choose: ["Halfling"]}];
  const s = play("twice", setup, [...CAST, {choose: ["Odd"]}, ...THRONE, {to: {turn: 2, phase: "MAIN1"}}, ...maya("Single", 1)]);
  eq([s.awaiting?.kind, s.pendingTriggers.map((t) => t.source.name)], ["order-triggers", [GOLLUM, GOLLUM]], "Maya's spell: Gollum's ability triggers twice, and Rob orders the two");
  resolveAwaiting(s, [0, 1]);
  eq(labels(s), MODES, "the first: all three");
  resolveAwaiting(s, [0]);
  eq(labels(s), [MODES[1], MODES[2]], "the second, its modes chosen after: not the counter the first just chose");
}
{
  /* Gone before its modes are chosen: what Gollum had chosen as it triggered. */
  const steps = [...ENTERED("Odd"), ...maya("Single", 1), {choose: [MODES[0]]}, {resolve: true}, {resolve: true}, ...maya("Single", 1)];
  const s = play("gone", SETUP("Single", "Single"), steps);
  const entry = s.stack[s.stack.length - 1];
  eq(entry.modesChosenWas, [0], "the trigger carries the modes Gollum had chosen as it triggered");
  const graveyard = moveOne(s, gollumOf(s), "graveyard", []);
  eq([s.objects[graveyard].zone, labels(s)], ["graveyard", [MODES[1], MODES[2]]], "Gollum gone before the modes are chosen: still not the counter (CR 113.7a)");
  resolveAwaiting(s, [0]);
  eq([s.objects[graveyard].modesChosen, s.stack[s.stack.length - 1].modes], [undefined, [1]], "the life mode chosen; nothing remembered on the card in the graveyard, a new object");
}
{
  /* All three chosen: the fourth trigger has no way, and is removed from the stack (CR 603.3c). */
  const choose = (i) => [...maya("Single", 1), {choose: [MODES[i]]}, {resolve: true}, {resolve: true}];
  const s = play("all", [...SETUP("Single", "Single", "Single", "Single")], [...ENTERED("Odd"), ...choose(0), ...choose(1), ...choose(2), ...maya("Single", 1)]);
  eq([s.stack.length, s.awaiting, s.stack[0]?.name], [1, null, "Single"], "the fourth time nothing is left: no question, only Maya's spell on the stack");
}
{
  /* A new object (CR 400.7): bounced and cast again, it has chosen nothing. */
  const s = play("new", SETUP("Single"), [...ENTERED("Odd"), ...maya("Single", 1), {choose: [MODES[0]]}, {resolve: true}, {resolve: true}]);
  const gollum = gollumOf(s);
  ok(Object.keys(s.objects[gollum].modesChosen ?? {}).length === 1, "Gollum has chosen one");
  const inHand = moveOne(s, gollum, "hand", []);
  const back = moveOne(s, inHand, "battlefield", []);
  eq(s.objects[back].modesChosen, undefined, "returned to its owner's hand and put back: a new object, with none chosen");
}

/* ---- the compiler ---- */
{
  const modal = (more = {}) => ({effect: "modal", choose: 1, unchosen: true, modes: [{text: "Draw a card.", effects: [{effect: "draw", count: 1}]}, {text: "You gain 2 life.", effects: [{effect: "gainLife", amount: 2}]}], ...more});
  const script = (ability) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Creature"], manaCost: "{B}", colors: ["B"], power: 1, toughness: 1},
    oracleText: ability.text, source: "hand", abilities: [ability]});
  const trig = (effects) => ({kind: "triggered", text: "At the beginning of your upkeep, choose one that hasn't been chosen.", trigger: {on: "upkeep"}, effects});
  eq(compileScript(script(trig([modal()]))).problems, [], "a triggered ability's one modal, choosing one that hasn't been chosen: compiles");
  ok(compileScript(script(trig([modal({choose: 2})]))).problems.some((p) => p.includes("hasn't been chosen")), "choosing two: refused");
  ok(compileScript(script(trig([modal({unchosen: "yes"})]))).problems.some((p) => p.includes("hasn't been chosen")), "unchosen not true: refused");
  ok(compileScript(script(trig([modal(), {effect: "draw", count: 1}]))).problems.some((p) => p.includes("hasn't been chosen")), "beside another effect, chosen as it resolves: refused");
  ok(compileScript(script(trig([modal({mayChooseNone: true})]))).problems.some((p) => p.includes("hasn't been chosen")), "with \"you may choose none\": refused");
  ok(compileScript(script({kind: "activated", text: "{1}: Choose one that hasn't been chosen.", cost: [{atom: "mana", cost: "{1}"}], effects: [modal()]})).problems.some((p) => p.includes("hasn't been chosen")),
    "an activated ability's: refused, not built");
  ok(compileScript(script({kind: "triggered", text: "Whenever an opponent casts a spell with mana value of the chosen quality, draw a card.", trigger: {on: "spell cast", caster: "opponent",
    filter: {manaValue: {parity: "$chosen"}}}, effects: [{effect: "draw", count: 1}]})).problems.length === 0, "a trigger filtered by the chosen quality compiles");
}
ok(index.resolve(GOLLUM)?.playable === true, "Gollum, Riddle Master is defined and playable");

console.log(`engine-unchosen-modes: ${checks} checks passed -- odd or even as chosen, zero even, X counted; each mode once for as long as it is the same object, the last trigger removed when none is left.`);
