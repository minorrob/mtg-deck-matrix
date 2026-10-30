/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 614.12, 616.1, 702.150a: native entry waits for noncommuting counter replacements. */
import assert from "node:assert/strict";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {afterResolving} from "../game/engine/rules/priority.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginRuleOperation, registerRuleOperation, askRuleOperation} from "../game/engine/rules/operations.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {saveEntryCounterResult, entryCounterResult} from "../game/engine/rules/entry-characteristics.mjs";
import {createController} from "../game/engine/controller.mjs";

let checks = 0;
const eq = (a, b, why) => {assert.deepEqual(a, b, why); checks++;};
const name = "Smoke Ordered Walker";
const script = {schema: "CrankCardScript@1", source: "hand", identity: {name, oracleId: "smoke-ordered-walker",
  types: ["Creature", "Planeswalker"], manaCost: "{G/P}", colors: ["G"], colorIdentity: ["G"], loyalty: 3, power: 2, toughness: 2},
  oracleText: "Compleated\nWhen this creature enters, you gain 2 life.", abilities: [{kind: "keyword", keyword: "compleated", text: "Compleated"},
    {kind: "triggered", text: "When this creature enters, you gain 2 life.", trigger: {on: "enters", who: "self"}, effects: [{effect: "gainLife", amount: 2}]}]};
const compiled = compileScript(script);
eq(compiled.problems, [], "the ordered entry fixture compiles without a new final card");
const cards = loadCardIndex();
function cast(extra = [], fixtures = {}) {
  return runScenario({name: "Native ordered counter entry", seats: 3,
    setup: [{seat: 0, zone: "hand", cards: [name]}, {seat: 0, zone: "battlefield", cards: ["Doubling Season"]}, ...extra],
    steps: [{cast: name}], expect: []}, card => card === name ? compiled.definition : cards.definition(card), fixtures).state;
}
const walkerOn = state => state.zones.battlefield.find(id => state.objects[id].card === name);
const optionFor = (state, wanted) => awaitingChoice(state).options.findIndex(option => option.puts === wanted);
const counterStatic = change => ({types: ["Enchantment"], abilities: [{id: "counter-change", kind: "static", rule: "more-counters", affects: {what: "permanent", controller: "you"}, ...change}]});
const fresh = () => {const state = createState({players: [{name: "A"}, {name: "B"}, {name: "C"}]}); state.phase = "MAIN1"; state.turn = 1; state.activePlayer = 0; state.priorityPlayer = 0; return state;};
for (const wanted of [2, 4]) {
  let state = cast(); const source = state.stack[0].objectId;
  resolveTop(state);
  eq(state.awaiting?.kind, "rule-operation", "the actual cast waits before entering for the controller's replacement order");
  eq([state.objects[source].zone, state.players[0].life, state.zones.battlefield.some(id => state.objects[id].card === name)], ["stack", 38, false],
    "the original spell and paid life are preserved; no entry or ETB occurs before the explicit answer");
  const choice = awaitingChoice(state);
  eq(choice.options.map(option => option.puts).sort((a, b) => a-b), [2, 4], "both legal orders remain visible, including the smaller result");
  state = JSON.parse(JSON.stringify(state));
  const events = resolveAwaiting(state, [choice.options.findIndex(option => option.puts === wanted)]);
  const walker = state.zones.battlefield.find(id => state.objects[id].card === name);
  eq(state.objects[walker].counters.loyalty, wanted, "the selected order is applied once without doubling the final counters again");
  eq(events.filter(event => event.kind === "GameEventCardChangeZone" && event.data.fields.becomes === walker).length, 1, "the reloaded explicit answer emits one actual entry");
  eq(events.filter(event => event.kind === "GameEventCardCounters").map(event => event.data.fields.newValue), [wanted], "only the final positive placement is journaled once");
  eq(events.filter(event => event.kind === "GameEventSpellResolved").length, 1, "the permanent spell's completion occurs once");
  eq([state.stack.length, state.stack[0].cardId], [1, walker], "the actual ETB is queued only after the answered entry");
  afterResolving(state, resolveTop(state));
  eq(state.players[0].life, 40, "the actual ETB suffix resolves once after the life-funded cast");
  const before = JSON.stringify(state);
  assert.throws(() => resolveAwaiting(state, [0]), /not waiting/); checks++;
  eq(JSON.stringify(state), before, "a repeated answer cannot replay the entry or ETB");
}
{
  const state = cast(); resolveTop(state);
  for (const indices of [[], [0, 1], [2], [-1]]) {
    const before = JSON.stringify(state);
    assert.throws(() => resolveAwaiting(state, indices), /Invalid selection/); checks++;
    eq(JSON.stringify(state), before, "invalid answers preserve the complete pending counter event and paid resources");
  }
  const before = JSON.stringify(state);
  assert.throws(() => resolveAwaiting(state, undefined, null, null, {cancel: true}), /mandatory|committed|finish|Cancel/i); checks++;
  eq(JSON.stringify(state), before, "a mandatory committed entry order remains pending after Cancel");
}
{
  let state = cast([{seat: 0, zone: "battlefield", cards: ["Smoke Add Two"]}], {"Smoke Add Two": counterStatic({plus: 2, counter: "loyalty"})});
  const source = state.zones.battlefield.find(id => state.objects[id].card === "Smoke Add Two");
  resolveTop(state);
  resolveAwaiting(state, [awaitingChoice(state).options.findIndex(option => option.cardId === source)]);
  eq(awaitingChoice(state).options.map(option => option.puts).sort((a,b) => a-b), [6, 8], "the selected prefix leaves only the two unchosen replacements");
  state = JSON.parse(JSON.stringify(state));
  const events = resolveAwaiting(state, [optionFor(state, 6)]);
  eq(state.awaiting, null, "a still-present chosen modifier cannot be offered or applied again after reload");
  eq([!!state.objects[source], state.objects[walkerOn(state)].counters.loyalty], [true, 6], "the source stays present while its chosen prefix and saved count apply exactly once");
  eq(events.filter(event => event.kind === "GameEventCardCounters").map(event => event.data.fields.newValue), [6], "the live prefix yields one final six-counter placement");
}
{
  const state = cast([{seat: 0, zone: "battlefield", cards: ["Smoke Add Two"]}], {"Smoke Add Two": counterStatic({plus: 2, counter: "loyalty"})});
  const source = state.zones.battlefield.find(id => state.objects[id].card === "Smoke Add Two");
  state.objects[source].owner = 1;
  resolveTop(state);
  const first = awaitingChoice(state).id;
  resolveAwaiting(state, [awaitingChoice(state).options.findIndex(option => option.cardId === source)]);
  const beforeDeparture = awaitingChoice(state).id;
  eq(awaitingChoice(state).options.map(option => option.puts).sort((a,b) => a-b), [6, 8], "the explicit plus-two prefix leaves both remaining legal orders askable");
  concede(state, 1);
  const next = awaitingChoice(state);
  eq([!!state.objects[source], next.options.map(option => option.puts).sort((a,b) => a-b), next.id !== first && next.id !== beforeDeparture], [false, [6, 8], true],
    "the applied plus-two prefix survives its source owner's departure and the remaining question has a fresh identity");
  const controller = createController(); controller.offer(next);
  const before = JSON.stringify(state);
  assert.throws(() => controller.answer({kind: "answer", actionId: "00000000-0000-4000-8000-000000000001", revision: controller.revision, choiceId: beforeDeparture, indices: [0]}), /expired/); checks++;
  eq(JSON.stringify(state), before, "the actual transport controller refuses the earlier question identity without changing the engine");
  resolveAwaiting(state, [optionFor(state, 6)]);
  eq(state.objects[walkerOn(state)].counters.loyalty, 6, "the departed source's already-applied prefix is neither lost nor replayed");
}
{
  const state = cast(), doubler = state.zones.battlefield.find(id => state.objects[id].card === "Doubling Season");
  state.objects[doubler].owner = 1;
  resolveTop(state); const first = awaitingChoice(state).id;
  const events = concede(state, 1);
  eq([state.awaiting, state.objects[walkerOn(state)].counters.loyalty], [null, 1], "a departed unchosen doubler cannot modify the entry; the sole live Compleated replacement needs no order answer");
  eq(events.filter(event => event.kind === "GameEventCardCounters").map(event => event.data.fields.newValue), [1], "departure completes only the remaining live counter event once");
  assert.throws(() => resolveAwaiting(state, [0]), /not waiting/); checks++;
  eq(first.startsWith("entry-counters:"), true, "the expired counter question belongs to this exact entry operation");
}
{
  const state = cast(); resolveTop(state);
  const events = concede(state, 0);
  eq([walkerOn(state), state.stack.some(entry => entry.name === name)], [undefined, false], "the caster's actual departure removes the unfinished spell instead of reviving its saved entry");
  eq(events.filter(event => event.kind === "GameEventCardCounters").length, 0, "the departed caster's canceled entry places no counters");
}
{
  const state = cast([{seat: 0, zone: "battlefield", cards: ["Smoke No Counters"]}], {"Smoke No Counters": counterStatic({times: 0})});
  const events = resolveTop(state);
  eq(state.awaiting, null, "all legal orders prevent every counter, so no meaningless order question is invented");
  afterResolving(state, events);
  eq(walkerOn(state), undefined, "the actual zero-counter planeswalker cannot survive the native SBA");
  eq(state.zones.graveyard[0].map(id => state.objects[id].card), [name], "the actual zero-loyalty permanent is put into its owner's graveyard");
  eq(events.filter(event => event.kind === "GameEventCardCounters").length, 0, "a completed zero placement cannot fall through to the printed count or produce a counter-placement event");
}
{
  const state = fresh();
  addObject(state, {...cards.definition("Doubling Season"), card: "Doubling Season", owner: 0, controller: 0}, "battlefield");
  addObject(state, {card: "Smoke Mute", types: ["Enchantment"], owner: 1, controller: 1, abilities: [{id: "mute", kind: "static", layer: 6, affects: {types: ["Creature"]}, apply: {removeAllAbilities: true}}]}, "battlefield");
  const old = addObject(state, {...compiled.definition, card: name, owner: 0, controller: 0}, "graveyard", 0);
  const result = beginRuleOperation(state, {kind: "move-one", id: old, to: "battlefield", options: {controller: 0, counters: {loyalty: 2}, alreadyReplaced: true, countersReplaced: true}});
  const walker = walkerOn(state);
  eq([result.status, walker !== old, state.objects[walker].counters.loyalty], ["done", true, 4], "native movement preserves an independent counter grant when the entrant loses its intrinsic abilities, and doubles the total once");
  eq(result.events.filter(event => event.kind === "GameEventCardCounters").map(event => event.data.fields.newValue), [4], "the forwarded external counters are placed and reported once");
}
{
  const state = fresh();
  addObject(state, {...cards.definition("Doubling Season"), card: "Doubling Season", owner: 0, controller: 0}, "battlefield");
  const old = addObject(state, {card: "Smoke No Host Aura", types: ["Enchantment"], subtypes: ["Aura"], owner: 0, controller: 0, enchant: {what: "permanent", types: ["Creature"]}}, "graveyard", 0);
  const result = beginRuleOperation(state, {kind: "move-one", id: old, to: "battlefield", options: {counters: {charge: 2}}});
  eq([result.result.moved, state.objects[old].zone, state.objects[old].counters], [null, "graveyard", {}], "a prepared Aura without a legal host never moves or receives its planned counters");
  eq(result.events.filter(event => event.kind === "GameEventCardCounters" || event.kind === "GameEventCardChangeZone").length, 0, "a no-move result emits no entry or counter event");
}
{
  let state = fresh();
  addObject(state, {...counterStatic({times: 2}), card: "Smoke Counter Doubler", owner: 0, controller: 0}, "battlefield");
  addObject(state, {...counterStatic({plus: 2, counter: "loyalty"}), card: "Smoke Add Two", owner: 0, controller: 0}, "battlefield");
  const original = addObject(state, {...compiled.definition, card: "Smoke Token Source", abilities: [], owner: 0, controller: 0, counters: {loyalty: 3}}, "battlefield");
  const before = state.zones.battlefield.length;
  beginResolution(state, [{effect: "copyPermanent", targets: [original], count: 2, entersWithCounters: {loyalty: 1}, remember: true},
    {effect: "gainLife", who: [0], amount: {rememberedCount: true, plus: 3}}], {controller: 0});
  eq(awaitingChoice(state).options.map(option => option.puts).sort((a,b) => a-b), [10, 12], "token instruction counters join intrinsic counters before either external replacement is applied");
  resolveAwaiting(state, [optionFor(state, 10)]);
  eq([state.zones.battlefield.length, state.players[0].life], [before, 40], "one token's explicit counter answer creates no member of the simultaneous batch or suffix");
  const tampered = JSON.parse(JSON.stringify(state));
  tampered.ruleOperation.frames.find(frame => frame.kind === "token-entry").entries[0].prepared.entering.counters.loyalty = 999;
  assert.throws(() => resolveAwaiting(tampered, [optionFor(tampered, 12)]), /matching internal/); checks++;
  eq([tampered.zones.battlefield.filter(id => tampered.objects[id].token).length, tampered.players[0].life], [0, 40], "altering a saved child result cannot bypass its bound counter receipt, create tokens or run the suffix");
  state = JSON.parse(JSON.stringify(state));
  const events = resolveAwaiting(state, [optionFor(state, 12)]);
  const made = state.zones.battlefield.filter(id => state.objects[id].token);
  eq(made.map(id => state.objects[id].counters.loyalty), [10, 12], "each saved token counter event retains its own explicit order after JSON reload");
  eq([state.players[0].tokensThisTurn, state.players[0].life, state.resolving, state.ruleOperation], [2, 45, null, undefined], "the batch and remembered-count suffix complete once");
  eq(events.filter(event => event.kind === "GameEventCardCounters").map(event => event.data.fields.newValue), [10, 12], "each simultaneous native token reports one final counter placement");
}
for (const departure of [false, true]) {
  let state = fresh();
  const source = addObject(state, {...counterStatic({times: 2}), card: "Smoke Counter Creature", types: ["Creature", "Enchantment"], power: 1, toughness: 1, owner: departure ? 1 : 0, controller: 0}, "battlefield");
  const ability = departure ? {id: "choose", kind: "replacement", watches: {event: "enters", who: "self"}, change: {choose: "creature type"}}
    : {id: "devour", kind: "replacement", watches: {event: "enters", who: "self"}, change: {devour: {amount: 1, of: {types: ["Creature"]}}}};
  const original = addObject(state, {...compiled.definition, card: "Smoke Token Source", owner: 0, controller: 0, counters: {loyalty: 3}, abilities: [ability]}, "battlefield");
  beginResolution(state, [{effect: "copyPermanent", targets: [original], count: 2},
    {effect: "gainLife", who: [0], amount: 1}], {controller: 0});
  resolveAwaiting(state, departure ? [awaitingChoice(state).options.findIndex(option => option.label === "Elf")] : []);
  eq(state.zones.battlefield.filter(id => state.objects[id].token).length, 0, "the first sibling's entry choices do not plan counters or create a token early");
  state = JSON.parse(JSON.stringify(state));
  let events = [];
  if (departure) events.push(...concede(state, 1));
  events.push(...resolveAwaiting(state, [awaitingChoice(state).options.findIndex(option => departure ? option.label === "Elf" : option.cardId === source)]));
  const made = state.zones.battlefield.filter(id => state.objects[id].token);
  eq(made.map(id => state.objects[id].counters.loyalty), [3, 3], "a later sibling's actual cost or concession removes the source before every sibling's counter plan begins");
  eq([state.players[0].tokensThisTurn, state.players[0].life], [2, 41], "the deferred group and following instruction finish once after the later choice");
  eq(events.filter(event => event.kind === "GameEventCardCounters" && event.data.fields.type === "loyalty").map(event => event.data.fields.newValue), [3, 3], "both actual sibling loyalty placements reflect the final source set without early multiplier snapshots");
  if (!departure) eq(state.objects[made[1]].counters["+1/+1"], 1, "the second token's actual devour sacrifice still grants its independent counter");
}
{
  const battleName = "Smoke Ordered Siege";
  const battle = compileScript({schema: "CrankCardScript@1", source: "hand", identity: {name: battleName, oracleId: "smoke-ordered-siege", types: ["Battle"], subtypes: ["Siege"], defense: 4, manaCost: "{0}", colors: [], colorIdentity: []}, oracleText: "", abilities: []});
  eq(battle.problems, [], "the native Battle/counter interaction fixture compiles");
  let state = runScenario({name: "A protector leaves during the Battle's counter plan", seats: 3,
    setup: [{seat: 0, zone: "hand", cards: [battleName]}, {seat: 0, zone: "battlefield", cards: ["Doubling Season", "Smoke Defense Add Two"]}],
    steps: [{cast: battleName}], expect: []}, card => card === battleName ? battle.definition : cards.definition(card), {"Smoke Defense Add Two": counterStatic({plus: 2, counter: "defense"})}).state;
  const source = state.stack[0].objectId;
  resolveTop(state);
  resolveAwaiting(state, [awaitingChoice(state).options.findIndex(option => option.playerId === 1)]);
  eq(awaitingChoice(state).options.map(option => option.puts).sort((a,b) => a-b), [10, 12], "the Siege asks its independent counter order after the original explicit protector");
  concede(state, 1);
  resolveAwaiting(state, [optionFor(state, 12)]);
  eq([state.objects[source].zone, awaitingChoice(state).options.map(option => option.playerId)], ["stack", [2]], "a completed counter plan still cannot enter with a departed protector");
  state = JSON.parse(JSON.stringify(state));
  const events = resolveAwaiting(state, [0]);
  const id = state.zones.battlefield.find(cardId => state.objects[cardId].card === battleName);
  eq([state.objects[id].protector, state.objects[id].counters.defense, state.stack.length], [2, 12, 0], "the fresh saved protector and already-completed counter result survive JSON without aliasing or a second replacement pass");
  eq(events.filter(event => event.kind === "GameEventCardCounters").map(event => event.data.fields.newValue), [12], "the deferred Battle reports its one final defense placement");
}
registerRuleOperation("smoke-counter-result", (state, frame) => {
  if (!frame.prepared) {
    const counterResult = saveEntryCounterResult(state, {objectId: "smoke-entry", player: 0}, {loyalty: 3}, {});
    frame.prepared = {counterResult, entering: {counters: {}}};
  }
  return askRuleOperation(state, frame, {player: 0, choice: {id: "smoke-counter-receipt", title: "Hold the internal receipt", mode: "one", min: 1, max: 1, options: [{index: 0, label: "Continue"}]}});
});
{
  const state = fresh(); beginRuleOperation(state, {kind: "smoke-counter-result"});
  const prepared = state.ruleOperation.frames.at(-1).prepared;
  for (const [value, objectId, player] of [[{...prepared, counterResult: "forged"}, "smoke-entry", 0], [prepared, "other-entry", 0], [prepared, "smoke-entry", 1], [{...prepared, entering: {counters: {loyalty: 3}}}, "smoke-entry", 0]]) {
    const before = JSON.stringify(state);
    assert.throws(() => entryCounterResult(state, value, objectId, player, {consume: true}), /matching internal/); checks++;
    eq(JSON.stringify(state), before, "forged or mismatched receipts cannot skip replacements or consume another entry's saved result");
  }
  eq(entryCounterResult(state, prepared, "smoke-entry", 0, {consume: true}), {}, "a completed zero-counter receipt remains distinct from no receipt");
  assert.throws(() => entryCounterResult(state, prepared, "smoke-entry", 0, {consume: true}), /matching internal/); checks++;
}
console.log(`engine-entry-counter-order: ${checks} checks; actual counter replacements remain separately askable`);
