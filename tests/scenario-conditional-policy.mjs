/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {loadCardIndex, loadCardScripts} from "../game/tools/engine-cards.mjs";
import {runScenario, selectedScenarioFrame, boundScenarioEnteringAnswer} from "../game/engine/cards/scenario.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {abilityInventory} from "../game/tools/ability-evidence.mjs";
import {proveRuntimeAbility, scenarioBehaviorFailure} from "../game/tools/ability-proof.mjs";

let checks = 0;
const eq = (actual, expected, message) => {assert.deepEqual(actual, expected, message); checks += 1;};
const ok = (actual, message) => {assert.ok(actual, message); checks += 1;};
const index = loadCardIndex(), scripts = loadCardScripts().map(entry => entry.script), fields = event => event.data?.fields ?? event.fields ?? {};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const tap = (card, index = 0) => ({tap: card, source: {zone: "battlefield", index}});
const run = (scenario, cards = index.definition) => runScenario(scenario, cards, {}, {explicitChoices: true});
const act = (operation, card, zone, extra = {}) => ({actIfLegal: {[operation]: card, seat: 0, source: {zone, index: 0}, ...(operation === "tap" ? {} : {targets: []}), ...extra}, ...(operation === "tap" ? {} : {resolveSelected: true})});
const choose = {chooseEnteringIfAsked: {card: "Patchwork Banner", seat: 0, question: "entering-choose", choose: ["Goblin"]}};
const bannerSetup = [at(0, "battlefield", "Wastes", "Wastes", "Wastes", "Fanatical Firebrand"), at(0, "hand", "Patchwork Banner")];
const bannerCast = [tap("Wastes", 0), tap("Wastes", 1), tap("Wastes", 2), {cast: "Patchwork Banner", source: {zone: "hand", index: 0}}];
const cases = [
  {card: "Conspicuous Snoop", path: "abilities[1]", scenario: {name: "A conditional native Goblin cast pays and resolves", setup: [at(0, "battlefield", "Conspicuous Snoop", "Mountain")], library: ["Raging Goblin"],
    steps: [tap("Mountain"), act("cast", "Raging Goblin", "library")], expect: [{seat: 0, zone: "battlefield", cards: ["Conspicuous Snoop", "Mountain", "Raging Goblin"]}, {seat: 0, pool: {R: 0}}, {stack: 0}]}},
  {card: "Conspicuous Snoop", path: "abilities[2]", scenario: {name: "A conditional inherited Krenko activation resolves actual tokens", setup: [at(0, "battlefield", "Conspicuous Snoop", "Fanatical Firebrand")], library: ["Krenko, Mob Boss"],
    steps: [act("activate", "Conspicuous Snoop", "battlefield")], expect: [{seat: 0, zone: "battlefield", cards: ["Conspicuous Snoop", "Fanatical Firebrand", "Goblin", "Goblin"]}, {seat: 0, tapped: "Conspicuous Snoop"}, {stack: 0}]}},
  {card: "Patchwork Banner", path: "abilities[2]", scenario: {name: "A conditional Banner mana activation produces real red", setup: bannerSetup,
    steps: [...bannerCast, {resolve: true}, {choose: ["Goblin"]}, act("tap", "Patchwork Banner", "battlefield", {mana: {R: 1}})], expect: [{seat: 0, pool: {R: 1}}, {seat: 0, tapped: "Patchwork Banner"}, {stack: 0}]}},
  {card: "Patchwork Banner", path: "abilities[0]", scenario: {name: "Only the captured Banner spell answers its entering question", setup: bannerSetup,
    steps: [...bannerCast, {resolve: true}, choose], expect: [{seat: 0, stats: {card: "Fanatical Firebrand", power: 2, toughness: 2}}, {seat: 0, pool: {C: 0}}, {stack: 0}]}}
];
for (const {card, path, scenario} of cases) {
  const baseline = run(scenario);
  const script = scripts.find(script => script.identity.name === card), ability = abilityInventory(script).find(ability => ability.path === path);
  const proof = proveRuntimeAbility({script, ability, cards: index.definition, scenarios: [scenario]});
  eq(proof.status, "proved", `${card} ${path}: the actual production policy reaches a behavior failure after one runtime omission`);
  eq(proof.baseline.choicePolicy, "explicit", "the positive proof has no automatic answers");
  ok(/not|pool/.test(proof.result.message), "the omission fails an actual effect/state assertion");
  ok(proof.result.policies.some(policy => ["unavailable", "completed-without-question"].includes(policy.branch)), "the counterfactual trace records its explicit inactive branch");
  ok(baseline.policies.some(policy => ["applied-and-resolved", "mana-produced", "answered"].includes(policy.branch)), "the baseline trace records its actual completed native action/answer");
}
/* A later actor uses its own card IDs and actual event actor, never hardcoded seat0. */
for (const original of [cases[0].scenario, cases[3].scenario]) {
  const scenario = structuredClone(original); scenario.name += " for Maya"; scenario.at = {turn: 2, phase: "MAIN1"};
  scenario.setup.forEach(entry => {entry.seat = 1;});
  if (scenario.library) scenario.library.unshift("Wastes");
  for (const step of scenario.steps) {
    if (step.tap || step.cast) step.seat = 1;
    if (step.actIfLegal) step.actIfLegal.seat = 1;
    if (step.chooseEnteringIfAsked) step.chooseEnteringIfAsked.seat = 1;
  }
  scenario.expect.forEach(expect => {if (expect.seat !== undefined) expect.seat = 1;});
  const result = run(scenario);
  ok(result.policies.some(policy => ["applied-and-resolved", "answered"].includes(policy.branch) && policy.actor === 1), "a second actor completes the same real effect through its actual source/frame");
}

const rejected = (scenario, pattern) => {
  let error; try {run({...scenario, expect: []});} catch (caught) {error = caught;}
  ok(error instanceof Error, "invalid conditional input is refused");
  assert.match(error.message, pattern); checks += 1;
  eq(error.scenarioAssertion, {kind: "policy-precheck"}, "a policy validation failure cannot earn ability proof");
  ok(!scenarioBehaviorFailure(error, scenario), "the unchanged proof classifier rejects policy validation failure");
};
const changedCast = change => {const scenario = structuredClone(cases[0].scenario); change(scenario.steps.at(-1)); return scenario;};
for (const change of [
  step => {delete step.actIfLegal.source;}, step => {step.actIfLegal.source.index = 99;}, step => {step.actIfLegal.source.index = "0";},
  step => {step.actIfLegal.source.seat = 1;}, step => {step.actIfLegal.source.card = "Mountain";}, step => {step.actIfLegal.source.extra = true;},
  step => {delete step.actIfLegal.seat;}, step => {step.actIfLegal.seat = 99;}, step => {step.actIfLegal.targets = "any";},
  step => {step.actIfLegal.targets = [{player: 1}];}, step => {step.actIfLegal.tap = "Mountain";}, step => {step.then = [{draw: 3}];},
  step => {step.actIfLegal.optional = true;}, step => {delete step.resolveSelected;}, step => {step.actIfLegal.ability = "a0";}
]) rejected(changedCast(change), /conditional|actIfLegal|physical|targetless|selected resolution/i);
{
  const wrongPresent = changedCast(step => {step.actIfLegal.source.card = "Mountain";});
  wrongPresent.library.push("Mountain");
  rejected(wrongPresent, /named actor's explicit physical source/);
}
for (const value of [null, [], "cast"]) rejected(changedCast(step => {step.actIfLegal = value;}), /bounded native action/);
{
  const scenario = structuredClone(cases[0].scenario); scenario.at = {turn: 1, phase: "END_OF_TURN"}; rejected(scenario, /main-phase priority/);
}
rejected(changedCast(step => {step.actIfLegal.seat = 1;}), /main-phase priority/);
{
  const noPriority = structuredClone(cases[0].scenario); noPriority.steps.splice(-1, 0, {pass: 1}); rejected(noPriority, /main-phase priority/);
  const otherTurn = structuredClone(cases[0].scenario); otherTurn.setup[0].seat = 1; otherTurn.steps = [{pass: 1}, act("cast", "Raging Goblin", "library")];
  otherTurn.steps.at(-1).actIfLegal.seat = 1; rejected(otherTurn, /main-phase priority/);
}
{
  const notTop = structuredClone(cases[0].scenario); notTop.name = "The named second library object is not silently replaced by the top"; notTop.library.push("Raging Goblin");
  notTop.steps.at(-1).actIfLegal.source.index = 1;
  notTop.expect = [{seat: 0, zone: "battlefield", cards: ["Conspicuous Snoop", "Mountain"]}, {seat: 0, pool: {R: 1}}, {stack: 0}];
  const result = run(notTop); eq(result.policies.at(-1).branch, "unavailable", "a physically present but unavailable exact source stays untouched");
}
{
  const scenario = structuredClone(cases[2].scenario); delete scenario.steps.at(-1).actIfLegal.mana; rejected(scenario, /ambiguous/);
  for (const mana of [{Z: 1}, {R: 0}, {R: 1.5}]) {const copy = structuredClone(cases[2].scenario); copy.steps.at(-1).actIfLegal.mana = mana; rejected(copy, /mana vector/);}
  const copy = structuredClone(cases[2].scenario); copy.steps.at(-1).resolveSelected = true; rejected(copy, /mana action cannot resolve/);
}
{
  const scenario = {name: "An existing spell is not a conditional resolution target", setup: cases[0].scenario.setup, library: ["Raging Goblin", "Krenko, Mob Boss"],
    steps: [tap("Mountain"), {cast: "Raging Goblin", source: {zone: "library", index: 0}}, act("activate", "Conspicuous Snoop", "battlefield")]};
  rejected(scenario, /pending commitment or stack/);
}
rejected({name: "A pending Banner question is not skipped", setup: bannerSetup, library: ["Raging Goblin"], steps: [...bannerCast, {resolve: true}, act("cast", "Raging Goblin", "library")]}, /pending commitment or stack/);
rejected({name: "A selected spell may not auto-answer its entry", setup: bannerSetup, steps: [...bannerCast.slice(0, 3), act("cast", "Patchwork Banner", "hand")]}, /selected native resolution did not finish/);
rejected({...structuredClone(cases[0].scenario), name: "A cast watcher is not auto-resolved", setup: [at(0, "battlefield", "Conspicuous Snoop", "Mountain", "Beast Whisperer")]}, /unsupported|extra|intervening|commitment/);
rejected({name: "A funding question is not auto-answered", setup: [at(0, "battlefield", "Conspicuous Snoop", "Mountain", "Mountain")], library: ["Raging Goblin"], steps: [act("cast", "Raging Goblin", "library")]}, /unsupported native question|continuation/);
for (const change of [
  request => {request.card = "Conspicuous Snoop";}, request => {request.seat = 1;}, request => {request.question = "any";},
  request => {request.choose = ["Not a creature type"];}, request => {request.choose = ["Goblin", "Elf"];},
  request => {request.context = {cardId: 46};}, request => {delete request.card;}
]) {
  const scenario = structuredClone(cases[3].scenario); change(scenario.steps.at(-1).chooseEnteringIfAsked); rejected(scenario, /preceding native spell|fixed entering answer/);
}
{
  const scenario = structuredClone(cases[3].scenario); scenario.steps.splice(-1, 0, {expect: []}); rejected(scenario, /immediately preceding/);
  const repeated = structuredClone(cases[3].scenario); repeated.steps.push(structuredClone(choose)); rejected(repeated, /immediately preceding/);
  const spoofed = structuredClone(cases[3].scenario); spoofed.steps.at(-1).then = []; rejected(spoofed, /unknown or competing/);
}
rejected({name: "An ability cannot masquerade as the captured entering spell", setup: cases[1].scenario.setup, library: ["Krenko, Mob Boss"],
  steps: [{activate: "Conspicuous Snoop", source: {zone: "battlefield", index: 0}}, {resolve: true}, {chooseEnteringIfAsked: {card: "Conspicuous Snoop", seat: 0, question: "entering-choose", choose: ["Goblin"]}}]}, /immediately preceding/);
rejected({name: "A resolved instant did not make the captured source enter", setup: [at(0, "battlefield", "Mountain"), at(0, "hand", "Lightning Bolt")],
  steps: [tap("Mountain"), {cast: "Lightning Bolt", source: {zone: "hand", index: 0}, targets: [{player: 1}]}, {resolve: true},
    {chooseEnteringIfAsked: {card: "Lightning Bolt", seat: 0, question: "entering-choose", choose: ["Goblin"]}}]}, /no exact completed native entry/);

const pendingBanner = run({name: "Actual pending Banner authority", setup: bannerSetup, steps: [...bannerCast, {resolve: true}], expect: []}).state;
const {stackId, cardId, name, playerId, kind} = pendingBanner.stack.at(-1), context = {frame: {stackId, cardId, name, playerId, kind}, questionSignature: hashState(pendingBanner.awaiting)};
const selectedType = boundScenarioEnteringAnswer(pendingBanner, context, "Goblin");
eq(pendingBanner.awaiting.choice.options[selectedType.index].label, "Goblin", "the pure production entry validator locates the fixed actual native label");
const rejectQuestion = (state, captured, label, expected) => {
  const before = hashState(state); let error; try {boundScenarioEnteringAnswer(state, captured, label);} catch (caught) {error = caught;}
  ok(error instanceof Error, "forged or stale entering authority rejected"); assert.match(error.message, expected); checks += 1;
  eq(error.scenarioAssertion, {kind: "policy-precheck"}, "entry authority failure remains ineligible proof");
  eq(hashState(state), before, "pure entry validation preserves the real native state");
};
for (const change of [captured => {captured.questionSignature = "forged";}, captured => {captured.frame.cardId += 1;}, captured => {captured.frame.playerId = 1;}, captured => {captured.frame.stackId += 1;}, captured => {captured.frame.kind = "ability";}]) {
  const copy = structuredClone(context); change(copy); rejectQuestion(pendingBanner, copy, "Goblin", /changed or expired|different native source/);
}
for (const change of [state => {state.awaiting.choice.title += " changed";}, state => {state.objects[cardId].zone = "battlefield";}, state => {state.ruleOperation.frames.at(-1).objectId += 1;}, state => {state.stack[0].cardId += 1;}, state => {state.stack[0].playerId = 1;}]) {
  const copy = structuredClone(pendingBanner); change(copy); rejectQuestion(copy, context, "Goblin", /changed or expired|different native source/);
}
rejectQuestion(pendingBanner, context, "Unknown type", /unavailable or ambiguous/);
const duplicate = structuredClone(pendingBanner); duplicate.awaiting.choice.options.push({...duplicate.awaiting.choice.options[selectedType.index], index: duplicate.awaiting.choice.options.length});
rejectQuestion(duplicate, {...context, questionSignature: hashState(duplicate.awaiting)}, "Goblin", /unavailable or ambiguous/);
const colored = run({name: "A real color-entry prompt is not a creature-type policy", setup: [at(0, "battlefield", "Wastes", "Wastes"), at(0, "hand", "Coldsteel Heart")],
  steps: [tap("Wastes", 0), tap("Wastes", 1), {cast: "Coldsteel Heart"}, {resolve: true}], expect: []}).state;
const colorFrame = colored.stack.at(-1), colorContext = {frame: {stackId: colorFrame.stackId, cardId: colorFrame.cardId, name: colorFrame.name, playerId: colorFrame.playerId, kind: colorFrame.kind}, questionSignature: hashState(colored.awaiting)};
rejectQuestion(colored, colorContext, colored.awaiting.choice.options[0].label, /different native source or mandatory question/);
/* Same actual entering-choose protocol/card/actor, but a Khans/Dragons choice is not a creature-type choice. */
rejected({name: "Outpost Siege is a different entering-choose family", setup: [at(0, "battlefield", "Mountain", "Mountain", "Mountain", "Mountain"), at(0, "hand", "Outpost Siege")],
  steps: [tap("Mountain", 0), tap("Mountain", 1), tap("Mountain", 2), tap("Mountain", 3), {cast: "Outpost Siege"}, {resolve: true},
    {chooseEnteringIfAsked: {card: "Outpost Siege", seat: 0, question: "entering-choose", choose: ["Khans"]}}]}, /different native source or mandatory question/);

/* The actual pure production validator receives cloned real native receipts with one forged field at a time. */
const ready = run({...structuredClone(cases[0].scenario), steps: [tap("Mountain")], expect: []}).state;
const action = legalActions(ready, 0).find(action => action.kind === "cast" && action.label === "Raging Goblin"), emitted = applyAction(ready, 0, action);
const selection = {sourceId: action.objectId, actor: 0, card: "Raging Goblin", kind: "cast"};
const selected = selectedScenarioFrame(ready, emitted, selection);
eq(selected.stackId, ready.stack.at(-1).stackId, "the production validator binds the exact actual native stack ID");
ok(selected.cardId !== selection.sourceId, "a cast's new object identity is not confused with its old library source");
for (const value of [null, {...selection, sourceId: "1"}, {...selection, actor: 99}, {...selection, kind: "other"}, {...selection, forged: true}]) {
  let error; try {selectedScenarioFrame(ready, emitted, value);} catch (caught) {error = caught;}
  ok(error instanceof Error && error.scenarioAssertion?.kind === "policy-precheck", "malformed internal receipt identity is not accepted or credited");
}
const rejectReceipt = (state, events, expected) => {
  const before = hashState(state); let error; try {selectedScenarioFrame(state, events, selection);} catch (caught) {error = caught;}
  ok(error instanceof Error, "forged native receipt/frame rejected"); assert.match(error.message, expected); checks += 1;
  eq(error.scenarioAssertion, {kind: "policy-precheck"}, "forged receipt validation never becomes behavior credit");
  eq(hashState(state), before, "pure receipt validation cannot alter the actual native game");
};
for (const change of [
  f => {f.card.cardId += 1;}, f => {f.card.name = "Other card";}, f => {f.si.actor.playerId = 1;},
  f => {f.sa.stackId += 100;}, f => {f.sa.isSpell = false;}, f => {f.si.isTrigger = true;}
]) {const copy = structuredClone(emitted); change(fields(copy.find(event => event.kind === "GameEventSpellAbilityCast"))); rejectReceipt(ready, copy, /unique source\/actor|native stack frame/);}
rejectReceipt(ready, [], /unique source\/actor/);
rejectReceipt(ready, [...emitted, ...structuredClone(emitted)], /unique source\/actor/);
for (const change of [frame => {frame.playerId = 1;}, frame => {frame.kind = "ability";}, frame => {frame.name = "Other card";}]) {
  const copy = structuredClone(ready); change(copy.stack[0]); rejectReceipt(copy, emitted, /native stack frame/);
}
{
  const s = run({...structuredClone(cases[0].scenario), setup: [at(0, "battlefield", "Conspicuous Snoop", "Mountain", "Fanatical Firebrand")], steps: [tap("Mountain")], expect: []}).state;
  const cast = legalActions(s, 0).find(action => action.kind === "cast" && action.label === "Raging Goblin"), events = applyAction(s, 0, cast);
  const other = legalActions(s, 0).find(action => action.kind === "activate" && action.label === "Fanatical Firebrand" && action.targets?.[0]?.kind === "player" && action.targets[0].id === 1);
  applyAction(s, 0, other); rejectReceipt(s, events, /extra or intervening/); eq(s.stack.length, 2, "neither the chosen nor unrelated legal native frame is resolved");
}

/* Existing presence-only/activation-only behavior still supplies no completed result. */
const offered = run({...structuredClone(cases[0].scenario), steps: [tap("Mountain")], expect: []});
ok(legalActions(offered.state, 0).some(action => action.kind === "cast" && action.label === "Raging Goblin"), "an offer exists in the presence control");
eq(offered.state.zones.battlefield.filter(id => offered.state.objects[id].card === "Raging Goblin").length, 0, "the offer alone produced no actual entrant");
const activated = run({...structuredClone(cases[1].scenario), steps: [{activate: "Conspicuous Snoop", source: {zone: "battlefield", index: 0}}], expect: []});
eq(activated.state.zones.battlefield.filter(id => activated.state.objects[id].card === "Goblin").length, 0, "an unresolved native activation produces no token effect");
console.log(`scenario-conditional-policy: ${checks} checks; bound native effects, runtime omissions and policy/receipt refusal`);
