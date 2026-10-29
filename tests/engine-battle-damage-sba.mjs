/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 120.3h, 120.10, 310.7-.11, 704.5v-y: Battle damage and state-based actions, without final card definitions. */
import assert from "node:assert/strict";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {resolveTop, pushAbility} from "../game/engine/rules/stack.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {afterResolving} from "../game/engine/rules/priority.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {lastKnown} from "../game/engine/rules/layers.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {attachTo} from "../game/engine/script/effects/permanents.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";

let checks = 0;
const failures = [];
const eq = (a,b,why) => {assert.deepEqual(a,b,why); checks++;};
const run = (name, fn) => {try {fn();} catch(error) {failures.push(`${name}: ${error.message}`);}};
const make = ({types = ["Battle"], defense = 4, siege = true, etb = false, seats = 3, sourceKeywords = []} = {}) => {
  const name = "Smoke Damage Battle";
  const script = {schema: "CrankCardScript@1", source: "hand", identity: {name, oracleId: "smoke-battle-damage", types,
    subtypes: siege ? ["Siege"] : [], defense, manaCost: "{0}", colors: [], colorIdentity: [],
    ...(types.includes("Planeswalker") ? {loyalty: 6} : {}), ...(types.includes("Creature") ? {power: 8, toughness: 8} : {})},
    oracleText: etb ? "When this permanent enters, you gain 1 life." : "", abilities: etb ? [{kind: "triggered", text: "When this permanent enters, you gain 1 life.", trigger: {on: "enters", who: "self"}, effects: [{effect: "gainLife", amount: 1}]}] : []};
  const compiled = compileScript(script); eq(compiled.problems, [], "the generic Battle fixture compiles");
  const {state} = runScenario({name: "Native Battle damage/SBA", seats, setup: [{seat: 0, zone: "hand", cards: [name]}, {seat: 0, zone: "battlefield", cards: ["Smoke Damage Source"]}], steps: [{cast: name}], expect: []}, card => card === name ? compiled.definition : null,
    {"Smoke Damage Source": {types: ["Creature"], power: 2, toughness: 2, colors: ["R"], keywords: sourceKeywords}});
  const castEvents = resolveTop(state);
  if (siege) castEvents.push(...resolveAwaiting(state, [awaitingChoice(state).options.findIndex(option => option.playerId === 1)]));
  else afterResolving(state, castEvents);
  return {state, name, castEvents, battle: state.zones.battlefield.find(id => state.objects[id].card === name), source: state.zones.battlefield.find(id => state.objects[id].card === "Smoke Damage Source")};
};
for (const types of [["Battle"], ["Battle","Creature"], ["Battle","Planeswalker"], ["Battle","Planeswalker","Creature"]]) run(`native damage ${types}`, () => {
  const {state,battle,source} = make({types});
  const outcome = beginResolution(state, [{effect: "dealDamage", targets: [battle], amount: 2}], {controller: 0, source});
  eq(outcome.status, "done", "ordinary Battle damage uses the existing native damage continuation");
  eq([state.objects[battle].counters.defense, state.objects[battle].counters.loyalty, state.objects[battle].damage],
    [2, types.includes("Planeswalker") ? 4 : undefined, types.includes("Creature") ? 2 : 0], "every applicable permanent type receives its own proper damage result");
  eq(state.players.map(player => player.life), [40,40,40], "no Battle damage is redirected to its protector or controller");
});
for (const types of [["Battle"], ["Battle","Planeswalker","Creature"]]) run(`native excess ${types}`, () => {
  const {state,battle,source} = make({types});
  beginResolution(state, [{effect: "dealDamage", targets: [battle], amount: 7}, {effect: "gainLife", who: [0], amount: {excessDamage: true}}], {controller: 0, source});
  eq(state.players[0].life, 43, "Battle excess uses its current defense and the greatest result among all applicable types");
});
run("zero non-Siege", () => {
  const {state,name} = make({defense: 0, siege: false});
  eq(state.zones.graveyard[0].map(id => state.objects[id].card), [name], "a zero-defense non-Siege is put into its owner's graveyard by the actual SBA");
});
run("zero Siege pending source trigger", () => {
  const {state,battle,name} = make({defense: 0, etb: true});
  eq([!!state.objects[battle], state.stack[0]?.cardId], [true,battle], "a Siege waits while its own actual printed ETB trigger has not left the stack");
  afterResolving(state, resolveTop(state));
  eq([state.zones.graveyard[0].map(id => state.objects[id].card), state.players[0].life], [[name],41], "after that exact trigger leaves the stack, the zero-defense Siege is put into its owner's graveyard");
});
run("protector departure", () => {
  let {state,battle} = make({seats: 4});
  concede(state,1);
  eq([state.awaiting?.kind, state.awaiting?.player], ["rule-operation",0], "the current controller receives a saved mandatory protector repair operation");
  eq(awaitingChoice(state).options.map(option => option.playerId), [2,3], "every remaining eligible opponent is offered");
  const old = awaitingChoice(state).id;
  state = JSON.parse(JSON.stringify(state));
  concede(state,3);
  eq([awaitingChoice(state).options.map(option => option.playerId), awaitingChoice(state).id !== old], [[2],true], "another departure refreshes the exact eligible question after reload");
  const before = JSON.stringify(state);
  assert.throws(() => resolveAwaiting(state,[1]), /Invalid selection/); checks++;
  eq(JSON.stringify(state), before, "a stale invalid option leaves the entire saved operation unchanged");
  resolveAwaiting(state,[0]);
  eq([state.objects[battle].protector, state.ruleOperation, state.awaiting], [2,undefined,null], "the explicit answer repairs the same actual Battle once");
});
const board = () => {
  const state = createState({players: [{name: "A"}, {name: "B"}, {name: "C"}, {name: "D"}]});
  Object.assign(state, {phase: "MAIN1", turn: 1, activePlayer: 0, priorityPlayer: 0});
  const put = object => {
    const id = addObject(state, {owner: 0, controller: 0, ...object}, "battlefield");
    if (object.counters) state.objects[id].counters = structuredClone(object.counters);
    if (object.protector !== undefined) state.objects[id].protector = object.protector;
    return id;
  };
  return {state, put};
};
run("native zero Battle replacement choice", () => {
  let {state,put} = board();
  const battle = put({card: "Choice Battle", types: ["Battle"], defense: 4, counters: {defense: 4}, protector: 0});
  for (const to of ["hand", "exile"]) put({card: `Send to ${to}`, types: ["Enchantment"], abilities: [{id: to, kind: "replacement",
    watches: {event: "zone-change", from: "battlefield", to: "graveyard", filter: {types: ["Battle"]}}, change: {to}}]});
  const removed = beginResolution(state, [{effect: "removeCounter", targets: [battle], counter: "defense", count: 4}], {controller: 0, source: battle});
  afterResolving(state, removed.events);
  eq([state.objects[battle]?.zone, state.awaiting?.kind, state.priorityPlayer], ["battlefield","rule-operation",null], "the causal old Battle remains until the actual replacement answer, without priority");
  eq(awaitingChoice(state).options.length, 2, "both legal destinations remain askable");
  state = JSON.parse(JSON.stringify(state));
  const unchanged = JSON.stringify(state);
  assert.throws(() => resolveAwaiting(state, [2]), /Invalid selection/); checks++;
  eq(JSON.stringify(state), unchanged, "an invalid saved replacement answer changes no state");
  const events = resolveAwaiting(state, [awaitingChoice(state).options.findIndex(option => option.label.includes("exile"))]);
  const change = events.find(event => event.kind === "GameEventCardChangeZone" && event.data.fields.card.cardId === battle);
  eq([state.objects[battle], change.data.fields.to.zoneType, state.objects[change.data.fields.becomes]?.zone], [undefined,"Exile","exile"], "only the explicit native destination commits with a new identity");
});
run("actual mixed simultaneous cohort", () => {
  const {state,put} = board();
  const source = put({card: "Safe Damage Source", types: ["Creature"], power: 1, toughness: 1});
  const lord = put({card: "Dying Battle Lord", types: ["Battle","Creature"], power: 2, toughness: 2, defense: 4, protector: 0, counters: {defense: 4}, abilities: [
    {id: "pump", kind: "static", layer: 7, sublayer: "c", affects: {types: ["Creature"], another: true}, apply: {power: 2, toughness: 2}},
    {id: "exile", kind: "replacement", watches: {event: "zone-change", from: "battlefield", to: "graveyard", filter: {types: ["Creature"], another: true}}, change: {to: "exile", then: [{effect: "gainLife", amount: {powerOf: "self"}}]}},
    {id: "watch", kind: "triggered", text: "Whenever one or more creatures die, gain 1 life.", trigger: {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "any", filter: {types: ["Creature"]}, batch: true}, effects: [{effect: "gainLife", amount: 1}]},
  ]});
  const battle = put({card: "Dying Other Battle", types: ["Battle","Creature"], power: 2, toughness: 2, defense: 4, protector: 0, counters: {defense: 4}});
  const bear = put({card: "Ordinary Bear", types: ["Creature"], power: 2, toughness: 2});
  const walker = put({card: "Ordinary Walker", types: ["Planeswalker"], loyalty: 4, counters: {loyalty: 4}});
  eq([state.objects[lord].counters.defense,state.objects[battle].counters.defense,state.objects[walker].counters.loyalty],[4,4,4],"the mixed fixture starts with actual counters before native damage removes them");
  eq(lastKnown(state,battle).toughness, 4, "the native pre-SBA board actually derives the Lord's anthem");
  const hit = beginResolution(state, [{effect: "damageAll", selector: {anyOf: [{types: ["Battle"]},{types: ["Creature"]},{types: ["Planeswalker"]}]}, amount: 4, exceptSource: true}], {controller: 0, source});
  afterResolving(state, hit.events);
  const changes = hit.events.filter(event => event.kind === "GameEventCardChangeZone");
  eq(changes.map(event => [event.data.fields.card.cardId, event.data.fields.to.zoneType]), [[lord,"Graveyard"],[battle,"Exile"],[bear,"Exile"],[walker,"Graveyard"]], "every mixed cohort replacement is planned on the pre-move board");
  eq(changes.find(event => event.data.fields.card.cardId === battle).data.fields.leftBehind.toughness, 4, "every member retains the same frozen pre-move characteristics");
  eq(state.stack.filter(entry => entry.lastKnown?.cardId === lord && entry.abilityId === "watch").length, 1, "the departed Lord sees its actual death exactly once in the final batch");
  eq(state.players[0].life, 44, "both committed replacements run their suffix once using the dying source's frozen power");
});
run("deferred control-source cleanup cannot change a sibling departure", () => {
  const {state,put} = board();
  const source = put({card: "Control Source Battle", types: ["Battle"], defense: 0, counters: {defense: 0}, protector: 0});
  const borrowed = put({owner: 1, controller: 1, card: "Borrowed Dying Battle", types: ["Battle"], defense: 0, counters: {defense: 0}, protector: 1});
  runEffect(state, {effect: "gainControl", targets: [borrowed], until: "this leaves"}, {controller: 0, source});
  put({card: "Controller Replacement", types: ["Enchantment"], abilities: [{id: "controlled-exile", kind: "replacement",
    watches: {event: "zone-change", from: "battlefield", to: "graveyard", filter: {named: "Borrowed Dying Battle", controller: "you"}}, change: {to: "exile"}}]});
  eq(lastKnown(state,borrowed).controller, 0, "the actual native control duration gives the source's controller the borrowed Battle");
  const events = afterResolving(state, []);
  const change = events.find(event => event.kind === "GameEventCardChangeZone" && event.data.fields.card.cardId === borrowed).data.fields;
  eq([change.leftBehind.controller,change.from.player.playerId,change.to.zoneType,change.to.player.playerId], [0,0,"Exile",1], "the sibling's frozen controller and replacement survive until its base departure, to its owner's zone");
  eq((state.effects ?? []).filter(effect => effect.rule === "control-returns").length, 0, "departure cleanup spends the obsolete control duration only after both base moves");
});
run("cohort receipts cannot commit before sibling planning", () => {
  let {state,put} = board();
  const first = put({card: "First Waiting Battle", types: ["Battle"], defense: 0, counters: {defense: 0}, protector: 0});
  const second = put({card: "Second Waiting Battle", types: ["Battle"], defense: 0, counters: {defense: 0}, protector: 0});
  for (const to of ["hand","exile"]) put({card: `${to} for Second`, types: ["Enchantment"], abilities: [{id: to, kind: "replacement",
    watches: {event: "zone-change", from: "battlefield", to: "graveyard", filter: {named: "Second Waiting Battle"}}, change: {to}}]});
  afterResolving(state, []);
  state = JSON.parse(JSON.stringify(state));
  const parent = state.ruleOperation.frames.find(frame => frame.kind === "sba-cohort");
  const cohort = state.ruleOperation.sbaCohorts[parent.cohortId], token = cohort.members.find(member => member.id === first).token;
  eq([state.objects[first].zone, state.objects[second].zone, !!token], ["battlefield","battlefield",true], "the first completed internal plan is retained while its sibling asks, after reload");
  for (const options of [{preparedMove: token, cohortId: parent.cohortId}, {preparedMove: token, cohortId: "wrong"}, {preparedMove: "wrong", cohortId: parent.cohortId}, {preparedMove: token}]) {
    const before = JSON.stringify(state);
    assert.throws(() => moveOne(state, first, "hand", [], options), /internal SBA/); checks++;
    eq(JSON.stringify(state), before, "an early, wrong-cohort or forged receipt changes no state");
  }
  const wrongObject = JSON.stringify(state);
  assert.throws(() => moveOne(state, second, "hand", [], {preparedMove: token, cohortId: parent.cohortId}), /internal SBA/); checks++;
  eq(JSON.stringify(state), wrongObject, "a sibling cannot borrow the first object's completed result");
  const events = resolveAwaiting(state, [0]);
  eq(events.filter(event => event.kind === "GameEventCardChangeZone").map(event => event.data.fields.card.cardId), [first,second], "the explicit answer commits every actual old identity exactly once");
  assert.throws(() => moveOne(state, first, "hand", [], {preparedMove: token, cohortId: parent.cohortId}), /internal SBA/); checks++;
  eq(state.ruleOperation, undefined, "no operation or reusable move receipt survives completion");
});
run("later concession preserves prefixes and rechecks unanswered modifiers", () => {
  let {state,put} = board();
  const first = put({card: "Prefix Battle", types: ["Battle"], defense: 0, counters: {defense: 0}, protector: 0});
  const second = put({card: "Sibling Battle", types: ["Battle"], defense: 0, counters: {defense: 0}, protector: 0});
  put({owner: 1, controller: 1, card: "Already Applied Hand", types: ["Enchantment"], abilities: [{id: "prefix", kind: "replacement",
    watches: {event: "zone-change", from: "battlefield", to: "graveyard", filter: {named: "Prefix Battle"}}, change: {to: "hand"}}]});
  const gate = put({owner: 1, controller: 1, card: "Exile Gate", types: ["Enchantment"]});
  const returned = addObject(state, {owner: 0, controller: 0, card: "Newly Live Exile", types: ["Enchantment"], abilities: [{id: "new-exile", kind: "replacement",
    watches: {event: "zone-change", from: "battlefield", to: "hand", filter: {named: "Prefix Battle"}}, change: {to: "exile"}}]}, "exile");
  state.exiledUntil = [{source: gate, exiled: returned}];
  for (const to of ["hand","exile"]) put({card: `Sibling ${to}`, types: ["Enchantment"], abilities: [{id: to, kind: "replacement",
    watches: {event: "zone-change", from: "battlefield", to: "graveyard", filter: {named: "Sibling Battle"}}, change: {to}}]});
  afterResolving(state, []);
  const parent = state.ruleOperation.frames.find(frame => frame.kind === "sba-cohort"), cohort = state.ruleOperation.sbaCohorts[parent.cohortId];
  const token = cohort.members.find(member => member.id === first).token;
  eq(state.ruleOperation.sbaPreparedMoves[token].proposal.to, "hand", "the first proposal actually applied its native replacement before the sibling question");
  const oldQuestion = awaitingChoice(state).id;
  state = JSON.parse(JSON.stringify(state));
  const departureEvents = concede(state, 1);
  eq([state.objects[first].zone, state.objects[second].zone, state.ruleOperation.sbaPreparedMoves[token].proposal.to], ["battlefield","battlefield","hand"], "an outside concession neither moves a member nor undoes an applied prefix");
  eq([state.zones.battlefield.some(id => state.objects[id].card === "Newly Live Exile"), awaitingChoice(state).id !== oldQuestion], [true,true], "a newly returned modifier is live and the sibling question gets a fresh identity");
  const answerEvents = resolveAwaiting(state, [0]);
  const changes = answerEvents.filter(event => event.kind === "GameEventCardChangeZone" && [first,second].includes(event.data.fields.card.cardId));
  eq(changes.map(event => [event.data.fields.card.cardId,event.data.fields.to.zoneType]), [[first,"Exile"],[second,"Hand"]], "the completed prefix is retained while the newly eligible unanswered replacement is applied before any commit");
  eq(departureEvents.some(event => event.data?.fields?.card?.cardId === gate && event.data.fields.leftTheGame), true, "the independent concession event is returned once in its own result");
  eq(answerEvents.some(event => event.data?.fields?.card?.cardId === gate), false, "resuming the cohort does not replay the outside departure prefix");
});
run("saved departure entry waits after every base move", () => {
  let {state,put} = board();
  const first = put({card: "Departing Return Battle", types: ["Battle","Creature"], power: 2, toughness: 2, defense: 0, counters: {defense: 0}, protector: 0});
  const second = put({card: "Other Departing Battle", types: ["Battle"], defense: 0, counters: {defense: 0}, protector: 0});
  put({card: "Existing Watcher", types: ["Enchantment"], abilities: [{id: "existing-watch", kind: "triggered", text: "Whenever a creature dies, gain 1 life.",
    trigger: {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "any", filter: {types: ["Creature"]}}, effects: [{effect: "gainLife", amount: 1}]}]});
  const held = addObject(state, {owner: 0, controller: 0, card: "Returned Siege", types: ["Battle"], subtypes: ["Siege"], defense: 2}, "exile");
  state.exiledUntil = [{source: first, exiled: held}];
  const initial = afterResolving(state, []);
  eq([state.objects[first], state.objects[second], state.objects[held]?.zone, state.awaiting?.kind, state.priorityPlayer], [undefined,undefined,"exile","rule-operation",null], "all actual base departures finish before a linked Siege asks its native pre-entry question");
  eq(initial.filter(event => event.kind === "GameEventCardChangeZone").map(event => event.data.fields.card.cardId), [first,second], "the first response journals only the two completed base moves");
  eq(state.pendingTriggers.filter(entry => entry.abilityId === "existing-watch").length, 1, "the existing watcher sees the base cohort once before the departure question");
  state = JSON.parse(JSON.stringify(state));
  const parent = state.ruleOperation.frames.find(frame => frame.kind === "sba-cohort"), cohort = state.ruleOperation.sbaCohorts[parent.cohortId];
  eq([cohort.departures.length, Object.keys(state.ruleOperation.sbaPreparedMoves).length], [2,0], "the deferred queue survives reload while all completed move receipts are already consumed");
  const before = JSON.stringify(state);
  assert.throws(() => moveOne(state, first, "hand", [], {cohortId: parent.cohortId, preparedMove: cohort.members[0].token}), /internal SBA/); checks++;
  eq(JSON.stringify(state), before, "a completed sibling token cannot be consumed during a departure child");
  const done = resolveAwaiting(state, [awaitingChoice(state).options.findIndex(option => option.playerId === 1)]);
  const returned = state.zones.battlefield.find(id => state.objects[id].card === "Returned Siege");
  eq([state.objects[held], state.objects[returned].counters.defense, state.objects[returned].protector, state.ruleOperation], [undefined,2,1,undefined], "the explicit saved native entry completes once with a new identity and correct intrinsic counters");
  eq(done.filter(event => event.kind === "GameEventCardChangeZone").map(event => event.data.fields.card.cardId), [held], "resuming entry does not replay either base departure");
  eq([...state.pendingTriggers,...state.stack].filter(entry => entry.abilityId === "existing-watch").length, 1, "outer collection after JSON does not collect the already-seen base deaths again");
  eq(state.sbaTriggerReceipts, undefined, "the completed operation's consumed trigger receipts are cleared after final collection");
  assert.throws(() => resolveAwaiting(state,[0]), /Nothing|No|not|await/i); checks++;
  eq(state.zones.battlefield.filter(id => state.objects[id].card === "Returned Siege").length, 1, "a duplicate resume cannot create another returned Siege");
});
run("a card flag cannot suppress native trigger collection", () => {
  const {state,put} = board();
  const watcher = put({card: "Ordinary Watcher", types: ["Enchantment"], abilities: [{id: "ordinary-watch", kind: "triggered", text: "Whenever a creature dies, gain 1 life.",
    trigger: {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "any", filter: {types: ["Creature"]}}, effects: [{effect: "gainLife", amount: 1}]}]});
  const bear = put({card: "Ordinary Dead Bear", types: ["Creature"], power: 2, toughness: 2});
  const events = [], moved = moveOne(state,bear,"graveyard",events);
  events[0].sbaTriggerReceipt = {key: "forged", index: 0};
  collectTriggers(state,events);
  eq([state.objects[moved].zone,state.pendingTriggers.filter(entry => entry.source.cardId === watcher).length], ["graveyard",1], "an unowned receipt marker has no authority to skip an actual death event");
});
run("successive native SBA cohorts retain separate collected batches", () => {
  const {state,put} = board();
  const first = put({card: "First Cascading Battle", types: ["Battle","Creature"], power: 2, toughness: 2, defense: 0, counters: {defense: 0}, protector: 0});
  const second = addObject(state, {owner: 0, controller: 0, card: "Returned Zero Battle", types: ["Battle","Creature"], power: 2, toughness: 2, defense: 0}, "exile");
  put({card: "Batch Watcher", types: ["Enchantment"], abilities: [{id: "batch-watch", kind: "triggered", text: "Whenever one or more creatures die, gain 1 life.",
    trigger: {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "any", filter: {types: ["Creature"]}, batch: true}, effects: [{effect: "gainLife", amount: 1}]}]});
  state.exiledUntil = [{source: first, exiled: second}];
  const events = afterResolving(state, []);
  const watching = [...state.pendingTriggers,...state.stack].filter(entry => entry.abilityId === "batch-watch");
  eq(events.filter(event => event.kind === "GameEventCardChangeZone" && event.data.fields.to.zoneType === "Graveyard").length, 2, "the returned zero Battle dies in the next actual SBA check");
  eq(watching.map(entry => entry.about.cards.length), [1,1], "the two native cohorts each trigger once about only their own death, without replaying the prior prefix");
});
run("applied follow-up retains a departing borrowed source", () => {
  let {state,put} = board();
  const first = put({card: "Follow-up Battle", types: ["Battle"], defense: 0, counters: {defense: 0}, protector: 0});
  const second = put({card: "Follow-up Sibling", types: ["Battle"], defense: 0, counters: {defense: 0}, protector: 0});
  put({owner: 1, controller: 0, card: "Borrowed Replacement", types: ["Creature"], power: 5, toughness: 5, abilities: [{id: "exile-and-life", kind: "replacement",
    watches: {event: "zone-change", from: "battlefield", to: "graveyard", filter: {named: "Follow-up Battle"}}, change: {to: "exile", then: [{effect: "gainLife", amount: {powerOf: "self"}}]}}]});
  for (const to of ["hand","exile"]) put({card: `Follow-up Sibling ${to}`, types: ["Enchantment"], abilities: [{id: to, kind: "replacement",
    watches: {event: "zone-change", from: "battlefield", to: "graveyard", filter: {named: "Follow-up Sibling"}}, change: {to}}]});
  afterResolving(state, []);
  state = JSON.parse(JSON.stringify(state));
  concede(state,1);
  const events = resolveAwaiting(state,[0]);
  eq(events.filter(event => event.kind === "GameEventCardChangeZone" && [first,second].includes(event.data.fields.card.cardId)).length, 2, "the already-applied replacement survives its borrowed source's owner's concession");
  eq(state.players[0].life, 45, "the live controller's applied follow-up uses the borrowed source's actual last-known power once");
});
run("returned watcher cannot see earlier cohort deaths", () => {
  const {state,put} = board();
  const battle = put({card: "Departing Exile Battle", types: ["Battle"], defense: 0, counters: {defense: 0}, protector: 0});
  const bear = put({card: "Dying Bear", types: ["Creature"], power: 2, toughness: 2});
  state.objects[bear].damage = 2;
  const watcher = addObject(state, {owner: 0, controller: 0, card: "Returned Watcher", types: ["Creature"], power: 3, toughness: 3, abilities: [
    {id: "returned-watch", kind: "triggered", text: "Whenever a creature dies, gain 1 life.", trigger: {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "any", filter: {types: ["Creature"]}}, effects: [{effect: "gainLife", amount: 1}]},
  ]}, "exile");
  state.exiledUntil = [{source: battle, exiled: watcher}];
  afterResolving(state, []);
  eq(state.zones.battlefield.map(id => state.objects[id].card), ["Returned Watcher"], "the actual linked native return occurs after every base cohort departure");
  eq([...state.stack,...state.pendingTriggers].filter(entry => entry.abilityId === "returned-watch").length, 0, "a newly returned watcher was absent at the simultaneous deaths and cannot see them later");
});
run("umbra replacement cannot remove a simultaneous modifier before planning", () => {
  const {state,put} = board();
  const host = put({card: "Armored Bear", types: ["Creature"], power: 2, toughness: 2});
  state.objects[host].damage = 2;
  const aura = put({card: "Zero Battle Umbra", types: ["Enchantment","Battle"], subtypes: ["Aura"], defense: 0, counters: {defense: 0}, protector: 0,
    enchant: {types: ["Creature"]}, abilities: [
      {id: "umbra", kind: "static", rule: "umbra-armor"},
      {id: "other-battles", kind: "replacement", watches: {event: "zone-change", from: "battlefield", to: "graveyard", filter: {types: ["Battle"], another: true}}, change: {to: "exile"}},
    ]});
  attachTo(state, aura, host);
  const other = put({card: "Simultaneous Other Battle", types: ["Battle"], defense: 0, counters: {defense: 0}, protector: 0});
  const events = afterResolving(state, []);
  eq([state.objects[host]?.zone, state.objects[host]?.damage], ["battlefield",0], "actual umbra replaces the creature's lethal destruction");
  eq(events.find(event => event.kind === "GameEventCardChangeZone" && event.data.fields.card.cardId === other)?.data.fields.to.zoneType, "Exile", "the simultaneous other Battle still sees the Aura's pre-move replacement before that Aura leaves");
});
run("multiple umbras use saved semantic choices before any cohort move", () => {
  let {state,put} = board();
  const host = put({card: "Multiply Armored Bear", types: ["Creature"], power: 2, toughness: 2});
  state.objects[host].damage = 2;
  const aura = put({card: "Chosen Battle Umbra", types: ["Enchantment","Battle"], subtypes: ["Aura"], defense: 0, counters: {defense: 0}, protector: 0,
    enchant: {types: ["Creature"]}, abilities: [{id: "umbra", kind: "static", rule: "umbra-armor"}]});
  const otherAura = put({owner: 1, controller: 0, card: "Departing Other Umbra", types: ["Enchantment"], subtypes: ["Aura"], enchant: {types: ["Creature"]}, abilities: [{id: "umbra", kind: "static", rule: "umbra-armor"}]});
  attachTo(state,aura,host); attachTo(state,otherAura,host);
  afterResolving(state, []);
  eq([state.awaiting?.kind,state.objects[aura]?.zone,state.objects[host].damage], ["rule-operation","battlefield",2], "multiple umbras ask in the saved cohort before damage is removed or either Aura moves");
  eq(awaitingChoice(state).options.map(option => option.cardId).sort((a,b) => a-b), [aura,otherAura].sort((a,b) => a-b), "both actual replacement source identities remain available");
  state = JSON.parse(JSON.stringify(state));
  const before = JSON.stringify(state);
  assert.throws(() => resolveAwaiting(state,[2]), /Invalid selection/); checks++;
  eq(JSON.stringify(state), before, "an invalid destruction choice leaves the entire saved cohort unchanged");
  const events = concede(state,1);
  eq([state.objects[host]?.zone,state.objects[host].damage,state.objects[aura]], ["battlefield",0,undefined], "source departure rechecks the live sole umbra, then the zero Battle leaves once");
  eq(events.filter(event => event.kind === "GameEventCardChangeZone" && event.data.fields.card.cardId === aura).length, 1, "an Aura already in the zero-Battle membership does not move or trigger twice");
});
for (const mode of ["regenerate","umbra","depart-child","depart-parent"]) run(`nested umbra ${mode}`, () => {
  let {state,put} = board();
  const battle = put({card: "Nested Zero Battle", types: ["Battle"], defense: 0, counters: {defense: 0}, protector: 0});
  const host = put({card: "Nested Armored Bear", types: ["Creature"], power: 2, toughness: 2});
  state.objects[host].damage = 2;
  const parent = put({owner: mode === "depart-parent" ? 1 : 0, controller: 0, card: "Living Parent Umbra", types: ["Enchantment"], subtypes: ["Aura"],
    enchant: {types: ["Creature"]}, abilities: [{id: "parent-umbra", kind: "static", rule: "umbra-armor"}]});
  const child = put({owner: mode === "depart-child" ? 1 : 0, controller: 0, card: "Nested Child Umbra", types: ["Enchantment"], subtypes: ["Aura"],
    enchant: {what: "permanent"}, abilities: [{id: "child-umbra", kind: "static", rule: "umbra-armor"}]});
  attachTo(state,parent,host); attachTo(state,child,parent);
  runEffect(state,{effect:"regenerate",targets:[parent]},{controller:0,source:parent});
  afterResolving(state, []);
  eq([state.awaiting?.kind,state.objects[battle]?.zone,state.objects[host].damage], ["rule-operation","battlefield",2], "the selected parent umbra's nested destruction choice suspends before any modification or base move");
  eq(awaitingChoice(state).options.map(option => option.cardId).sort((a,b) => a-b), [parent,child].sort((a,b) => a-b), "the child Aura's armor and the parent's regeneration remain separate explicit legal options");
  state = JSON.parse(JSON.stringify(state));
  let events;
  if (mode.startsWith("depart")) events = concede(state,1);
  else events = resolveAwaiting(state,[awaitingChoice(state).options.findIndex(option => option.cardId === (mode === "regenerate" ? parent : child))]);
  eq(events.filter(event => event.kind === "GameEventCardChangeZone" && event.data.fields.card.cardId === battle).length,1,"the independent zero Battle's prepared move commits once");
  if (mode === "depart-parent") {
    eq([state.objects[parent],state.objects[host]], [undefined,undefined], "a departed parent source cannot save the now-unarmored lethal host");
    eq(events.filter(event => event.kind === "GameEventUmbraArmor").length,0,"an unchosen departed parent does not produce a phantom applied prefix");
  } else {
    eq([state.objects[host]?.zone,state.objects[host]?.damage,state.objects[parent]?.zone], ["battlefield",0,"battlefield"], "the live parent umbra saves the host while the chosen or sole live child replacement saves the parent");
    eq(state.objects[parent].tapped,mode !== "umbra","regeneration taps the parent only in the regeneration outcome");
    eq(events.filter(event => event.kind === "GameEventCardRegenerated" && event.data.fields.card.cardId === parent).length, mode === "umbra" ? 0 : 1, "the committed regeneration prefix is journaled once without replay or loss");
    eq(events.filter(event => event.kind === "GameEventCardChangeZone" && event.data.fields.card.cardId === child && !event.data.fields.leftTheGame).length,mode === "umbra" ? 1 : 0,"the selected child Aura leaves at most once in the actual native cohort");
  }
});
for (const kind of ["ability","wrong-trigger"]) run(`zero Siege does not wait for ${kind}`, () => {
  const {state,put} = board();
  const battle = put({card: "Identity Siege", types: ["Battle"], subtypes: ["Siege"], defense: 0, counters: {defense: 0}, protector: 1});
  const other = kind === "ability" ? battle : put({card: "Identity Siege", types: ["Battle"], subtypes: ["Siege"], defense: 4, counters: {defense: 4}, protector: 1});
  pushAbility(state,{sourceId:other,controller:0,abilityId:"ordinary",kind:kind === "ability" ? "ability" : "trigger",script:{effects:[{effect:"gainLife",amount:1}]}});
  afterResolving(state,[]);
  eq(state.objects[battle],undefined,"only a triggered ability of this exact Battle identity can suspend its zero-defense SBA");
  eq(state.stack.length,1,"the unrelated activation or other same-name source trigger remains on the actual stack");
});
run("current non-Siege protection and forced missing protection differ", () => {
  const {state,put} = board();
  const existing = put({card:"Copied Non-Siege",types:["Battle"],defense:2,counters:{defense:2},protector:1});
  const missing = put({card:"Missing Non-Siege",types:["Battle"],defense:2,counters:{defense:2}});
  const events = afterResolving(state,[]);
  eq([state.objects[existing].protector,state.objects[missing].protector,state.awaiting],[1,0,null],"an existing live protector persists, while a new non-Siege protector is forced to its controller by rule");
  eq(events.filter(event => event.kind === "GameEventBattleProtectorChanged").map(event => event.data.fields.card.cardId),[missing],"only the actual missing protection changes once");
});
run("saved departure completion reenters SBA before priority", () => {
  const {state,put} = board();
  const source = put({card:"Zero Return Source",types:["Battle"],defense:0,counters:{defense:0},protector:0});
  const returned = addObject(state,{card:"Returned Zero Siege",owner:0,controller:0,types:["Battle"],subtypes:["Siege"],defense:0},"exile");
  state.exiledUntil = [{source,exiled:returned}];
  afterResolving(state,[]);
  eq(state.awaiting?.kind,"rule-operation","the linked zero Siege first asks its actual native entry protector question");
  resolveAwaiting(state,[0]);
  eq(state.zones.battlefield.length,0,"after its entry answer the zero Siege's next actual SBA occurs before anybody receives priority");
  eq(state.zones.graveyard[0].map(id => state.objects[id].card),["Zero Return Source","Returned Zero Siege"],"both actual zone-change identities reach the owner's graveyard once");
});
assert.deepEqual(failures, [], failures.join("\n"));
console.log(`engine-battle-damage-sba: ${checks} checks; native Battle damage and mandatory state-based actions`);
