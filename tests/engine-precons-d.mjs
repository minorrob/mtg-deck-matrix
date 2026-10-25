/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE PRECON LOAD OF 2026-10-25, LANE D (Tramplesaurus Rex): the lane's cards played, and what their scenarios cannot reach.
 *
 * - Every scenario of the lane's cards (docs/engine/card-load-precons-2026-10-25/lane-D-dinosaurs.json), run here on its own.
 * - "Can't be blocked by more than one creature" given to each creature with power 4 or greater (Challenger Troll): two
 *   blockers refused on one, never on a 2/2.
 * - "Can't attack or block unless you control another creature with power 4 or greater" (Rhonas the Indomitable): the
 *   attackers and blockers offered.
 * - A total divided among any number of targets (Monstrous Onslaught; CR 601.2d): no more targets than the total, the
 *   question, a division refused with what to do instead, nothing to divide with no creature, a settle's first legal answer,
 *   and a copy keeping the division (CR 707.10).
 * - Each fights a different one (Ezuri's Predation): fewer fighters than foes, each fighter asked which it fights.
 * - "The greatest mana value among your commanders" (Tangleweave Armor): a commander on the stack counted with its X.
 * - The grammar's guards: `commanderManaValue`, a fight's `against`, a spell's `divided` and dealDamage's `divided`.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardIndex, loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {pushCopy} from "../game/engine/rules/stack.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {ASKING} from "../game/engine/script/effects/asking.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

/* ---- the lane's cards, every scenario ---- */
const lane = JSON.parse(readFileSync(new URL("../docs/engine/card-load-precons-2026-10-25/lane-D-dinosaurs.json", import.meta.url), "utf8"));
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
const fileOf = (card) => files.find((f) => f.card === card);
/* A scenario of a card's own, with other steps and nothing expected. */
const play = (card, scenario) => runScenario({name: card, expect: [], ...scenario}, cards.definition, fileOf(card).fixtures ?? {});
const rng = createRng(1);
/* On through the game until it asks that question. */
function driveTo(state, kind) {
  for (let n = 0; n < 500 && state.awaiting?.kind !== kind; n += 1) {
    if (state.awaiting) throw new Error(`asked ${state.awaiting.kind} on the way to ${kind}`);
    if (state.priorityPlayer === null) { advance(state); continue; }
    if (passPriority(state, null, rng).outcome === "step-ends") advance(state);
  }
  assert.equal(state.awaiting?.kind, kind);
  return awaitingChoice(state);
}
const refused = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

/* ---- Challenger Troll: no more than one blocker for each of power 4 or greater ---- */
{
  const {state} = play("Challenger Troll", {setup: [{seat: 0, zone: "battlefield", cards: ["Challenger Troll", "Brute", "Bear"]},
    {seat: 1, zone: "battlefield", cards: ["Their Bear", "Their Other Bear"]}], steps: [{attack: ["Challenger Troll", "Brute", "Bear"]}]});
  const choice = driveTo(state, "declare-blockers");
  const index = (label) => choice.options.find((o) => o.label === label).index;
  for (const attacker of ["Challenger Troll", "Brute"])
    ok(refused(() => resolveAwaiting(structuredClone(state), [index(`Their Bear blocks ${attacker}`), index(`Their Other Bear blocks ${attacker}`)])) !== null,
      `two blockers refused on ${attacker}, of power 4 or greater`);
  ok(refused(() => resolveAwaiting(structuredClone(state), [index("Their Bear blocks Bear"), index("Their Other Bear blocks Bear")])) === null,
    "two blockers allowed on the 2/2 Bear");
}

/* ---- Rhonas the Indomitable: attacking and blocking only beside another creature with power 4 or greater ---- */
{
  const attackers = (others) => driveTo(play("Rhonas the Indomitable", {setup: [{seat: 0, zone: "battlefield", cards: ["Rhonas the Indomitable", ...others]},
    {seat: 1, zone: "battlefield", cards: ["Their Brute"]}], steps: []}).state, "declare-attackers").options.map((o) => o.label.split(" → ")[0]);
  ok(!attackers(["Elk"]).includes("Rhonas the Indomitable") && attackers(["Elk"]).includes("Elk"), "with a 3/3 of Rob's (and Maya's 4/4), Rhonas may not attack; the Elk may");
  ok(attackers(["Brute"]).includes("Rhonas the Indomitable"), "with a 4/4 of Rob's, Rhonas may attack");
  const blockers = (others) => {
    const {state} = play("Rhonas the Indomitable", {setup: [{seat: 0, zone: "battlefield", cards: ["Rhonas the Indomitable", ...others]},
      {seat: 1, zone: "battlefield", cards: ["Their Elk"]}], steps: [{to: {turn: 2, phase: "MAIN1"}}, {attack: ["Their Elk"], seat: 1}]});
    return driveTo(state, "declare-blockers").options.map((o) => o.label.split(" blocks ")[0]);
  };
  ok(!blockers(["Elk"]).includes("Rhonas the Indomitable"), "without a 4/4 of Rob's, Rhonas may not block");
  ok(blockers(["Brute"]).includes("Rhonas the Indomitable"), "with one, it may");
}

/* ---- Monstrous Onslaught: a division (CR 601.2d) ---- */
const onslaught = fileOf("Monstrous Onslaught");
const lands = onslaught.scenarios[0].setup[0].cards.filter((c) => c === "Forest" || c === "Wastes");
const taps = lands.map((land) => ({tap: land}));
const onslaughtGame = (mine, theirs, steps) => play("Monstrous Onslaught", {setup: [{seat: 0, zone: "battlefield", cards: [...lands, ...mine]},
  {seat: 0, zone: "hand", cards: ["Monstrous Onslaught"]}, {seat: 1, zone: "battlefield", cards: theirs}], steps: [...taps, ...steps]});
{
  /* Its targets: from one up to the total, 4 -- never five 1/1s. */
  const asked = onslaughtGame(["Brute"], ["Their Bear", "Their Bear", "Their Elk", "Their Elk"], [{cast: "Monstrous Onslaught", targets: "any"}]).state;
  const targets = awaitingChoice(asked);
  ok(asked.awaiting.kind === "choose-targets" && targets.min === 1 && targets.max === 4, `its targets: one to four (${targets.min}-${targets.max})`);
  ok(refused(() => onslaughtGame(["Brute"], ["Their Bear", "Their Bear", "Their Elk", "Their Elk", "Their Brute"],
    [{cast: "Monstrous Onslaught", targets: [[{card: "Their Bear"}, {card: "Their Bear"}, {card: "Their Elk"}, {card: "Their Elk"}, {card: "Their Brute"}]]}])) !== null,
  "five targets for 4 damage are refused");
  /* The division asked: an amount each, at least 1, all 4. */
  const {state} = onslaughtGame(["Brute"], ["Their Bear", "Their Elk"], [{cast: "Monstrous Onslaught", targets: [[{card: "Their Bear"}, {card: "Their Elk"}]]}]);
  const division = awaitingChoice(state);
  ok(division.mode === "amount" && division.total === 4 && division.minEach === 1 && division.options.every((o) => o.max === 3),
    `the question divides 4, at least 1 each, at most 3 to one (${division.title})`);
  ok(/at least 1/.test(division.title), "and says so");
  for (const bad of [[0, 4], [2, 1], [4], [2, 2, 0]]) {
    const tried = structuredClone(state);
    ok(/give each target at least 1, and all 4 in all/.test(refused(() => resolveAwaiting(tried, [], bad)) ?? ""), `${JSON.stringify(bad)} refused, saying what to do`);
    ok(tried.awaiting?.kind === "choose-cost" && tried.stack.length === 0, "and the question is still asked, nothing cast");
  }
  /* A cast taken with a division of its own, never asked: held to the same rule. */
  {
    const before = onslaughtGame(["Brute"], ["Their Bear", "Their Elk"], []).state;
    const offer = legalActions(before, 0).find((a) => a.kind === "cast" && before.objects[a.objectId]?.card === "Monstrous Onslaught");
    const ids = ["Their Bear", "Their Elk"].map((n) => before.zones.battlefield.find((id) => before.objects[id].card === n));
    const taken = (division) => ({...offer, targets: [ids.map((id) => ({kind: "object", id}))], division});
    ok(/at least 1/.test(refused(() => applyAction(structuredClone(before), 0, taken([0, 4]))) ?? ""), "a cast taken with 0 and 4 is refused");
    const cast = structuredClone(before);
    applyAction(cast, 0, taken([1, 3]));
    ok(Object.values(cast.stack.at(-1).division[0]).join(",") === "1,3", "and with 1 and 3, cast so");
  }
  const good = structuredClone(state);
  resolveAwaiting(good, [], [3, 1]);
  const entry = good.stack.at(-1);
  ok(Object.values(entry.division[0]).join(",") === "3,1", "3 and 1 go with the spell");
  /* A copy keeps it (CR 707.10). */
  const copy = pushCopy(good, entry, {controller: 0});
  ok(JSON.stringify(copy.division) === JSON.stringify(entry.division), "a copy of the spell has the same division");
  /* A settle's first legal answer gives each its least, the rest to the first. */
  const settled = onslaughtGame(["Brute"], ["Their Bear", "Their Elk"], [{cast: "Monstrous Onslaught", targets: [[{card: "Their Bear"}, {card: "Their Elk"}]]}, {settle: true}]).state;
  ok(settled.zones.graveyard[1].length === 1 && settled.objects[settled.zones.graveyard[1][0]].card === "Their Bear", "settled: 3 to the Bear, 1 to the Elk");
  /* No creature of Rob's: nothing to divide, no target asked, and it resolves doing nothing. */
  const none = onslaughtGame([], ["Their Bear"], [{cast: "Monstrous Onslaught", targets: "any"}]).state;
  ok(!none.awaiting && none.stack.length === 1 && JSON.stringify(none.stack[0].targets) === "[[]]", "with power 0 to divide, no target is asked");
}

/* ---- Ezuri's Predation: fewer fighters than foes, each fighter asked ---- */
{
  const {state} = play("Ezuri's Predation", {setup: [{seat: 0, zone: "battlefield", cards: ["Bear"]}, {seat: 1, zone: "battlefield", cards: ["Their Bear", "Their Elk"]}], steps: []});
  const bear = state.zones.battlefield.find((id) => state.objects[id].card === "Bear");
  state.resolving = {queue: [], context: {controller: 0, source: null}, events: []};
  const opened = ASKING.fightPartners.open(state, {then: {from: [bear], against: {what: "permanent", types: ["Creature"], controller: "opponent"}}}, {controller: 0, source: null});
  const choice = awaitingChoice(state);
  ok(opened === true && choice.title === "Choose which creature Bear fights" && choice.options.map((o) => o.label).sort().join(",") === "Their Bear,Their Elk",
    `one fighter, two foes: which it fights is asked (${choice.title})`);
  const done = ASKING.fightPartners.apply(state, state.awaiting, [choice.options.findIndex((o) => o.label === "Their Elk")]);
  const elk = state.zones.battlefield.find((id) => state.objects[id].card === "Their Elk");
  ok(JSON.stringify(done.splice) === JSON.stringify([{effect: "fight", pairs: [[bear, elk]]}]), "and it fights the one chosen, the other nothing");
}

/* ---- Tangleweave Armor: a commander on the stack, with its X ---- */
{
  const {state} = play("Tangleweave Armor", {setup: [{seat: 0, zone: "command", cards: ["Leader"]}], steps: []});
  ok(amountOf(state, {commanderManaValue: "you"}, {controller: 0}) === 5 && amountOf(state, {commanderManaValue: "you"}, {controller: 1}) === 0,
    "Rob's commander's mana value is 5; Maya, with none, has 0");
  const leader = Object.values(state.objects).find((o) => o.commander === true);
  leader.manaCost = "{X}{G}";
  state.stack.push({stackId: 99, objectId: leader.id, x: 3, kind: "spell", playerId: 0, targets: []});
  ok(amountOf(state, {commanderManaValue: "you"}, {controller: 0}) === 4, "a commander spell with X 3 on the stack counts 4 (CR 202.3e)");
}

/* ---- the grammar's guards ---- */
ok(amountProblems({commanderManaValue: "you"}).length === 0 && amountProblems({commanderManaValue: "them"}).length > 0, "commanderManaValue is \"you\"");
const identity = {name: "Odd", oracleId: "x", types: ["Sorcery"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: []};
const problems = (text, ability) => JSON.stringify(compileScript({schema: "CrankCardScript@1", identity, oracleText: text, source: "hand", abilities: [{text, ...ability}]}).problems ?? []);
const THEIRS = {what: "permanent", types: ["Creature"], controller: "opponent"};
const FIGHT = "Each of those tokens fights a different one of those creatures.";
ok(!/against/.test(problems(FIGHT, {kind: "spell", targets: [], effects: [{effect: "fight", from: "remembered", against: THEIRS}]})), "a fight's against, with from, is a definition");
ok(/against/.test(problems(FIGHT, {kind: "spell", targets: [], effects: [{effect: "dealDamage", amount: 1, against: THEIRS}]})), "against is a fight's");
ok(/against/.test(problems(FIGHT, {kind: "spell", targets: [], effects: [{effect: "fight", against: THEIRS}]})), "against needs its fighters");
ok(/against/.test(problems(FIGHT, {kind: "spell", targets: [], effects: [{effect: "fight", from: "remembered", against: {what: "permanent", nonsense: 1}}]})), "against is held to the selector grammar");
const DIVIDE = "This spell deals 3 damage divided as you choose among any number of target creatures.";
const counted = [{what: "permanent", types: ["Creature"], count: {min: 0}}];
const divides = (spell) => problems(DIVIDE, {kind: "spell", targets: counted, effects: [{effect: "dealDamage", targets: {target: 0}, divided: 0}], ...spell});
ok(!/divided/.test(divides({divided: {target: 0, total: 3}})), "a spell's divided, a counted target and a total, is a definition");
ok(/divided/.test(divides({divided: {target: 0, total: "three"}})), "the total is an amount");
ok(/divided/.test(divides({divided: {target: 0, total: 2.5}})) && /divided/.test(divides({divided: {target: 0, total: 0}})), "a number total is whole, 1 or more");
ok(/divided/.test(divides({divided: {target: 1, total: 3}})), "the target is one of its own");
ok(/divided/.test(divides({targets: [{what: "permanent", types: ["Creature"]}], divided: {target: 0, total: 3}})), "the target is a counted one");
ok(/divided/.test(divides({divided: {target: 0, total: 3}, effects: [{effect: "dealDamage", targets: {target: 0}, amount: 3}]})), "a dealDamage of it says divided");
ok(/divided/.test(divides({divided: {target: 0, total: 3}, effects: [{effect: "dealDamage", targets: {target: 0}, divided: 0, amount: 3}]})), "with no amount of its own");

console.log(`engine-precons-d: ${checks} checks passed`);
