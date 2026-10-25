/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CARD LOAD OF THE SIX PRECONS ON THE DECKS SCREEN (2026-10-25), LANE A (Calling All Angels): the lane's cards played, and
 * what their scenarios cannot reach.
 *
 * - Every scenario of the lane's cards (docs/engine/card-load-precons-2026-10-25/lane-A-angels.json), run here on its own: the
 *   rules this lane built are each proved by one of them, so a change to one shows at once, without the whole catalog's.
 * - A block tax (Archangel of Tithes; CR 509.1d-f): which mana pays when the ways differ, a declaration that can't be paid
 *   for refused with what to do, the budget in the record, and the house pilot keeping to it.
 * - "The first time each turn" you gain life (Vanguard Seraph; CR 119.9), by lifelink's gain in combat too.
 * - The amounts and the condition: "an opponent" with more life, opponents with more cards in hand, each of the players
 *   still in the game (CR 800.4a); "your first, second, or third turns of the game" on another player's turn, and its guard.
 * - An alternative cost that taps creatures (Sephara, Sky's Blade; CR 118.9): the question in words, a wrong set refused,
 *   and a definition that names no count refused.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {conditionHolds, conditionProblems} from "../game/engine/script/condition.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {blockTax} from "../game/engine/rules/statics.mjs";
import {loadCardIndex, loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {blockers} from "../game/engine/rules/combat.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {scoredPilot} from "../game/engine/pilots/scored-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const throwsLike = (fn, pattern, m) => { let message = ""; try { fn(); } catch (e) { message = e.message; } ok(pattern.test(message), `${m} (${message || "no error"})`); };

/* ---- the lane's cards, every scenario ---- */
const lane = JSON.parse(readFileSync(new URL("../docs/engine/card-load-precons-2026-10-25/lane-A-angels.json", import.meta.url), "utf8"));
const names = new Set(lane.cards.map((c) => c.name));
const cards = loadCardIndex();
const files = loadCardScenarios().map((f) => f.scenarios).filter((f) => names.has(f.card));
ok(files.length === names.size, `every card of the lane has its scenarios (${files.length} of ${names.size})`);
for (const file of files) {
  ok(cards.resolve(file.card)?.playable === true, `${file.card} is playable`);
  for (const scenario of file.scenarios) {
    runScenario(scenario, cards.definition, file.fixtures ?? {});
    checks += 1;
  }
}

const creature = (cost, p, t, more = {}) => ({types: ["Creature"], subtypes: ["Bear"], manaCost: cost, colors: ["G"], power: p, toughness: t, ...more});
const FX = {
  Bear: creature("{1}{G}", 2, 2), "Big Bear": creature("{3}{G}{G}", 5, 5), Cub: creature("{G}", 1, 1), "Cub Two": creature("{G}", 1, 1),
  "Sky Pal": creature("{1}{W}", 2, 2, {subtypes: ["Angel"], colors: ["W"], keywords: ["Flying"]}),
  "Sky Two": creature("{1}{W}", 2, 2, {subtypes: ["Angel"], colors: ["W"], keywords: ["Flying"]}),
  "Link Bear": creature("{1}{W}", 2, 2, {keywords: ["Lifelink"]}), "Link Cub": creature("{W}", 1, 1, {keywords: ["Lifelink"]}),
};
const run = (scenario) => runScenario({setup: [], steps: [], expect: [], ...scenario}, cards.definition, FX);
/* On through the game, as the room plays it, until it asks this question (the scenario runner answers declare-blockers itself). */
function untilAsked(state, kind) {
  const rng = createRng(kind), events = [];
  for (let n = 0; n < 500 && state.awaiting?.kind !== kind; n += 1) {
    /* Nobody blocks, unless that is the question. */
    if (state.awaiting?.kind === "declare-blockers") { events.push(...resolveAwaiting(state, [])); continue; }
    if (state.awaiting) throw new Error(`asked ${state.awaiting.kind} before ${kind}`);
    if (state.priorityPlayer === null) { events.push(...advance(state)); continue; }
    const passed = passPriority(state, null, rng);
    events.push(...(passed.events ?? []));
    if (passed.outcome === "step-ends") events.push(...advance(state));
  }
  return events;
}

/* ---- a block tax (Archangel of Tithes) ---- */
/* Two ways to pay its {1}, a Plains and a Forest: which is Maya's to choose (CR 509.1f), and the one she picks pays. */
const toBlock = run({name: "block tax, two ways", setup: [{seat: 0, zone: "battlefield", cards: ["Archangel of Tithes"]}, {seat: 1, zone: "battlefield", cards: ["Sky Pal", "Plains", "Forest"]}],
  steps: [{attack: ["Archangel of Tithes"]}, {block: [["Sky Pal", "Archangel of Tithes"]]}]});
ok(toBlock.state.awaiting?.kind === "block-tax" && toBlock.state.awaiting.player === 1, "a block tax with two ways to pay it asks Maya");
const which = awaitingChoice(toBlock.state);
ok(which.min === 1 && which.max === 1 && which.options.map((o) => o.label).sort().join() === "Tap Forest,Tap Plains", `she chooses one of her lands (${which.options.map((o) => o.label)})`);
resolveAwaiting(toBlock.state, [which.options.find((o) => o.label === "Tap Forest").index]);
const lands = projectFor(toBlock.state, 1).players[1].zones.Battlefield.cards;
ok(lands.find((c) => c.name === "Forest").tapped && !lands.find((c) => c.name === "Plains").tapped, "the Forest she chose pays, the Plains stays untapped");
ok(toBlock.state.combat.attacks[0].blockers.length === 1, "and the block is declared once it is paid");

/* Nothing to pay with: the record says so, a check says what to do, and the declaration is refused. */
const broke = run({name: "block tax, no mana", setup: [{seat: 0, zone: "battlefield", cards: ["Archangel of Tithes"]}, {seat: 1, zone: "battlefield", cards: ["Sky Pal"]}],
  steps: [{attack: ["Archangel of Tithes"]}]});
untilAsked(broke.state, "declare-blockers");
const asked = broke.state.awaiting?.kind === "declare-blockers" ? broke.state.awaiting : null;
ok(asked !== null, "Maya is asked to declare blockers");
const record = awaitingChoice(broke.state);
ok(record.budget?.by === "mana" && record.budget.most === 0 && record.options.every((o) => o.mana === 1), "the record: each block costs {1}, and she has nothing to pay with");
ok(/cost \{1\} to block with, more than you can pay\. Declare fewer blockers\./.test(blockers.check(broke.state, asked, [0]).reasons.join(" ")), "a check names the cost and what to do");
throwsLike(() => blockers.resolve(broke.state, asked, [0]), /more than you can pay\. Declare fewer blockers\./, "the declaration is refused, saying what to do");
/* The pilots keep to what they can pay: two good blocks, one land -- one block. */
const two = run({name: "block tax, pilot", setup: [{seat: 0, zone: "battlefield", cards: ["Archangel of Tithes", "Cub", "Cub Two"]}, {seat: 1, zone: "battlefield", cards: ["Big Bear", "Bear", "Wastes"]}],
  steps: [{attack: ["Archangel of Tithes", "Cub", "Cub Two"]}]});
untilAsked(two.state, "declare-blockers");
const pilotRecord = awaitingChoice(two.state);
for (const [name, pilot] of [["house", housePilot({seat: 1})], ["scored", scoredPilot({seat: 1})]]) {
  const answer = pilot.answer(projectFor(two.state, 1), pilotRecord);
  const spent = answer.indices.reduce((n, i) => n + (pilotRecord.options[i].mana ?? 0), 0);
  ok(answer.indices.length === 1 && spent === 1 && pilotRecord.budget.most === 1, `the ${name} pilot blocks within what it can pay (${answer.indices.length} block, {${spent}} of {${pilotRecord.budget.most}})`);
}
/* Two lands: both good blocks, each by a different creature -- a block planned, not the record's cheapest options taken. */
const both = run({name: "block tax, pilot, two lands", setup: [{seat: 0, zone: "battlefield", cards: ["Archangel of Tithes", "Cub", "Cub Two"]}, {seat: 1, zone: "battlefield", cards: ["Big Bear", "Bear", "Wastes", "Wastes"]}],
  steps: [{attack: ["Archangel of Tithes", "Cub", "Cub Two"]}]});
untilAsked(both.state, "declare-blockers");
const bothRecord = awaitingChoice(both.state);
const planned = housePilot({seat: 1}).answer(projectFor(both.state, 1), bothRecord).indices;
ok(planned.length === 2 && new Set(planned.map((i) => bothRecord.options[i].cardId)).size === 2, `the house pilot blocks with both, one attacker each (${planned.map((i) => bothRecord.options[i].label)})`);
/* What the tax counts: each blocking creature once, however many attackers it blocks ("for each of those creatures"). */
const [bigBear, mayaBear, cub, cubTwo] = ["Big Bear", "Bear", "Cub", "Cub Two"].map((name) => both.state.zones.battlefield.find((id) => both.state.objects[id].card === name));
ok(blockTax(both.state, [{cardId: bigBear, attackerId: cub}, {cardId: bigBear, attackerId: cubTwo}]) === 1, "one creature blocking two attackers is taxed once");
ok(blockTax(both.state, [{cardId: bigBear, attackerId: cub}, {cardId: mayaBear, attackerId: cubTwo}]) === 2, "two creatures, twice");
/* No Archangel attacking: no budget at all. */
const free = run({name: "no block tax", setup: [{seat: 0, zone: "battlefield", cards: ["Archangel of Tithes", "Cub"]}, {seat: 1, zone: "battlefield", cards: ["Bear"]}],
  steps: [{attack: ["Cub"]}]});
untilAsked(free.state, "declare-blockers");
ok(awaitingChoice(free.state).budget === undefined, "with the Archangel at home, blocking costs nothing and the record has no budget");

/* ---- the first time each turn you gain life: lifelink's gain in combat ---- */
const linked = run({name: "lifelink first", setup: [{seat: 0, zone: "battlefield", cards: ["Vanguard Seraph", "Link Bear", "Link Cub"]}],
  steps: [{attack: ["Link Bear", "Link Cub"]}]});
const linkEvents = untilAsked(linked.state, "effect-choice");
const gains = linkEvents.filter((e) => e.kind === "GameEventPlayerLivesChanged" && e.data.fields.lifelink);
ok(gains.length === 2 && gains.filter((e) => e.data.fields.firstGainThisTurn === true).length === 1,
  "two lifelink gains in one combat damage step: the first of them is the turn's first");
ok(linked.state.awaiting.effect === "surveil" && linked.state.stack.length === 1, "Vanguard Seraph surveils, from lifelink");
resolveAwaiting(linked.state, []);
ok(linked.state.stack.length === 0 && !linked.state.awaiting, "and only once: nothing else of it waits");

/* ---- the amounts and the condition, among the players still in the game ---- */
const three = run({name: "three players", seats: 3, setup: [{seat: 1, zone: "hand", cards: ["Wastes", "Wastes"]}, {seat: 2, zone: "hand", cards: ["Wastes", "Wastes", "Wastes"]}]});
const s = three.state;
s.players[2].life = 60;
ok(amountOf(s, {lifeTotal: "an opponent"}, {controller: 0}) === 60, "an opponent's most life: Trey's 60");
ok(amountOf(s, {opponentsWithMore: {what: "card", zone: "hand", controller: "you"}}, {controller: 0}) === 2, "two opponents hold more cards than Rob");
ok(amountProblems({opponentsWithMore: {what: "card", zone: "hand", nonsense: true}}).length > 0, "what opponentsWithMore counts is held to the selector grammar");
s.players[2].lost = true;
ok(amountOf(s, {lifeTotal: "an opponent"}, {controller: 0}) === 40, "Trey has left the game: Maya's 40 is the most (CR 800.4a)");
ok(amountOf(s, {opponentsWithMore: {what: "card", zone: "hand", controller: "you"}}, {controller: 0}) === 1, "and only Maya holds more cards");
ok(conditionHolds(s, {pastYourFirstTurns: 3}, {controller: 1, source: null}), "on Rob's turn, Maya is not in one of her first three turns");
ok(!conditionHolds(s, {pastYourFirstTurns: 3}, {controller: 0, source: null}), "on his own first turn, Rob is");
ok(conditionProblems({pastYourFirstTurns: 0}).length > 0 && conditionProblems({pastYourFirstTurns: "3"}).length > 0 && conditionProblems({pastYourFirstTurns: 3}).length === 0,
  "pastYourFirstTurns is a whole number, 1 or more");

/* ---- an alternative cost that taps creatures (Sephara, Sky's Blade) ---- */
const sephara = run({name: "Sephara asks", setup: [{seat: 0, zone: "battlefield", cards: ["Plains", "Sky Pal", "Sky Two", "Link Bear", "Big Bear"]}, {seat: 0, zone: "hand", cards: ["Sephara, Sky's Blade"]}],
  steps: [{tap: "Plains"}]});
const fliers = ["Sky Pal", "Sky Two"];
ok(!legalActions(sephara.state, 0).some((a) => a.kind === "cast" && a.alternative !== undefined), "two fliers are not four: no alternative cost");
const four = run({name: "Sephara four", setup: [{seat: 0, zone: "battlefield", cards: ["Plains", ...fliers, "Sky Pal", "Sky Two", "Bear"]}, {seat: 0, zone: "hand", cards: ["Sephara, Sky's Blade"]}],
  steps: [{tap: "Plains"}, {cast: "Sephara, Sky's Blade", alternative: 0}]});
const tapQuestion = awaitingChoice(four.state);
ok(tapQuestion.title === "Sephara, Sky's Blade: tap four untapped creatures you control with flying" && tapQuestion.min === 4 && tapQuestion.options.length === 4,
  `the question in the card's words, its four fliers (${tapQuestion.title}; ${tapQuestion.options.length})`);
const castAction = structuredClone(four.state.awaiting.action);
const bear = four.state.zones.battlefield.find((id) => four.state.objects[id].card === "Bear");
const notFliers = [...tapQuestion.options.slice(0, 3).map((o) => o.cardId), bear];
/* An answer the question could not give -- a forged action, the cast taken again as resolveCastCost takes it. */
four.state.awaiting = null;
four.state.priorityPlayer = 0;
throwsLike(() => applyAction(four.state, 0, {...castAction, flashbackTap: notFliers}), /are not four untapped creatures you control with flying for it$/, "a set with a Bear in it is refused");
const identity = {name: "Odd", oracleId: "x", types: ["Creature"], subtypes: [], manaCost: "{5}", colors: [], colorIdentity: [], power: 1, toughness: 1};
const ALT = "You may tap two untapped creatures you control rather than pay this spell's mana cost.";
const altProblems = (atom) => compileScript({schema: "CrankCardScript@1", identity, oracleText: ALT, source: "hand",
  abilities: [{kind: "static", text: ALT, rule: "alternative-cost", affects: {what: "card", self: true}, cost: [atom]}]}).problems ?? [];
ok(altProblems({atom: "tapCreature", count: 2, selector: {types: ["Creature"]}}).length === 0, "an alternative cost of two creatures to tap is a definition");
ok(altProblems({atom: "tapCreature", selector: {types: ["Creature"]}}).some((p) => /nothing pays yet/.test(p)), "one that says no count is refused");

console.log(`engine-precons-a: ${checks} checks passed — the lane's 35 cards; a block tax asked, refused, budgeted and kept to; lifelink's first gain; the opponents still in the game; Sephara's tapped fliers.`);
