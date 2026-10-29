/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {deriveEffectPlay, refreshEffectPlay} from "../game/engine/script/effects/asking.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {resolveTop, pushAbility} from "../game/engine/rules/stack.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {addObject, createState} from "../game/engine/state/index.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {lastKnown} from "../game/engine/rules/layers.mjs";
let checks = 0;
const eq = (a, b, message) => {assert.deepEqual(a, b, message); checks++;};
const index = loadCardIndex();
{
  const raw = createState({players: [{name: "Rob"}, {name: "Maya"}]});
  eq(Object.hasOwn(raw, "effectPlayVersion"), false, "historical native pod absence preserves the exact old state shape");
  eq(createState({effectPlayVersion: 1, players: [{name: "Rob"}, {name: "Maya"}]}).effectPlayVersion, 1, "the current native epoch is persisted explicitly");
  for (const version of [0, false, 2]) {assert.throws(() => createState({effectPlayVersion: version, players: [{name: "Rob"}, {name: "Maya"}]}), /version/i); checks++;}
  const before = structuredClone(raw);
  eq([deriveEffectPlay(raw), refreshEffectPlay(raw)], [null, {changed: false}], "non-play native state is an explicit refresh no-op");
  eq(raw, before, "a non-play refresh neither injects an epoch nor changes state");
}
function scepter(extra = []) {
  const {state} = runScenario({name: "actual copied Boros Charm live variants", seats: 3, setup: [
    {seat: 0, zone: "battlefield", cards: [...Array(4).fill("Wastes"), "Cankerbloom"]},
    {seat: 1, zone: "battlefield", cards: ["Cankerbloom"]}, ...extra,
    {seat: 0, zone: "hand", cards: ["Isochron Scepter", "Boros Charm"]}], steps: [
    {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Isochron Scepter"}, {resolve: true}, {resolve: true}, {choose: ["Boros Charm"]},
    {tap: "Wastes"}, {tap: "Wastes"}, {activate: "Isochron Scepter"}]}, index.definition);
  return state;
}
{
  const state = scepter(); resolveTop(state);
  eq(state.effectPlayVersion, 1, "canonical scenarios force the current native play epoch by default");
  const old = awaitingChoice(state), selected = state.awaiting.choices.findIndex(action => action.modes?.[0] === 2 && state.objects[action.targets[0].id]?.owner === 1);
  eq(selected >= 0, true, "the actual Scepter copy initially offers Boros Charm aimed at the opponent's real Cankerbloom");
  const copy = state.awaiting.choices[selected].objectId, target = state.awaiting.choices[selected].targets[0].id;
  concede(state, 1);
  eq([state.players[1].lost, state.objects[target]], [true, undefined], "an actual concession removes its owner's target while the original effect waits");
  const before = structuredClone(state), live = deriveEffectPlay(state), current = awaitingChoice(state);
  eq(state, before, "deriving and projecting live native variants never edits the pending question or engine state");
  eq([live.changed, current.id === old.id, live.choices.some(action => action.targets?.some(t => t.id === target))], [true, false, false], "the live native question drops the vanished target and changes its generation");
  assert.throws(() => resolveAwaiting(state, [selected], null, null, {choiceId: old.id}), /expired/i); checks++;
  eq(state, before, "old-generation indices are rejected before payment, copy movement or question mutation");
  assert.throws(() => resolveAwaiting(state, [0], null, null, {choiceId: current.id}), /expired/i); checks++;
  eq(state, before, "a freshly derived identifier cannot answer cached indices before authoritative refresh");
  const refreshed = refreshEffectPlay(state);
  eq([refreshed.changed, refreshed.choiceId, awaitingChoice(state).id], [true, current.id, current.id], "only explicit authoritative refresh publishes the new saved variants and generation");
  eq(refreshEffectPlay(state).changed, false, "unchanged facts never advance the native question generation");
  const afterRefresh = structuredClone(state);
  assert.throws(() => resolveAwaiting(state, [0]), /expired/i); checks++;
  eq(state, afterRefresh, "untagged old indices cannot answer a reindexed native question");
  for (const version of [0, false, 2]) {
    assert.throws(() => resolveAwaiting(state, [0], null, null, {choiceId: old.id, effectPlayVersion: version}), /expired/i); checks++;
    eq(state, afterRefresh, "forged answer fields cannot disable the saved native epoch or its stale-generation refusal");
  }
  const reloaded = JSON.parse(JSON.stringify(state)), unchanged = structuredClone(reloaded);
  assert.throws(() => resolveAwaiting(reloaded, [0], null, null, {choiceId: old.id}), /expired/i); checks++;
  eq(reloaded, unchanged, "old-generation answers stay refused after JSON reload even when their old index is valid now");
  eq(reloaded.zones.exile.filter(id => reloaded.objects[id].copy && reloaded.objects[id].card === "Boros Charm"), [copy], "refresh retains the same one actual exiled card copy without creating or restoring another");
  const none = awaitingChoice(reloaded).options.at(-1);
  resolveAwaiting(reloaded, [none.index], null, null, {choiceId: awaitingChoice(reloaded).id});
  eq([reloaded.awaiting, reloaded.stack.length, reloaded.players[0].castThisTurn.length], [null, 0, 1], "native optional decline still completes Scepter without casting its copy");
}
{
  const state = scepter(); delete state.effectPlayVersion; resolveTop(state);
  const before = structuredClone(state), choice = awaitingChoice(state);
  eq(choice.id, `play:0:${state.turn}`, "the explicitly historical native question retains its original initial identifier");
  eq([deriveEffectPlay(state), refreshEffectPlay(state)], [null, {changed: false}], "historical saved play without an epoch or origin remains a documented no-op");
  eq(state, before, "historical refresh preserves the old pending question and full state shape");
  resolveAwaiting(state, [state.awaiting.choices.findIndex(action => action.modes?.[0] === 1)], null, null, {choiceId: choice.id});
  eq([Object.hasOwn(state, "effectPlayVersion"), Object.hasOwn(state, "effectPlaySerial"), state.stack.at(-1).modes], [false, false, [1]], "the original historical native handler consumes its old answer without introducing new epoch metadata");
}
{
  const state = scepter();
  addObject(state, {...index.definition("Shalai, Voice of Plenty"), card: "Shalai, Voice of Plenty", owner: 2, controller: 1}, "battlefield");
  resolveTop(state);
  const target = state.zones.battlefield.find(id => state.objects[id].card === "Cankerbloom" && state.objects[id].owner === 1), old = awaitingChoice(state);
  eq(state.awaiting.choices.some(action => action.modes?.[0] === 2 && action.targets?.[0]?.id === target), false, "the actual borrowed Shalai makes the surviving opponent's Cankerbloom initially untargetable");
  concede(state, 2);
  const live = deriveEffectPlay(state);
  eq([live.changed, live.choices.some(action => action.modes?.[0] === 2 && action.targets?.[0]?.id === target)], [true, true], "departure of the real hexproof source adds newly legal Boros Charm targets rather than filtering cached indices");
  const before = structuredClone(state);
  assert.throws(() => resolveAwaiting(state, [0], null, null, {choiceId: old.id}), /expired/i); checks++;
  eq(state, before, "a newly expanded native variant set still refuses old indices atomically");
  refreshEffectPlay(state);
  const reload = JSON.parse(JSON.stringify(state)), choice = awaitingChoice(reload), selected = reload.awaiting.choices.findIndex(action => action.modes?.[0] === 2 && action.targets?.[0]?.id === target);
  resolveAwaiting(reload, [selected], null, null, {choiceId: choice.id});
  eq([reload.stack.at(-1).name, reload.stack.at(-1).modes, reload.stack.at(-1).targets.map(t => t.id)], ["Boros Charm", [2], [target]], "the refreshed generation casts the exact newly legal mode and target through the original native handler");
  resolveTop(reload);
  eq(reload.objects[target].keywords.some(keyword => keyword.toLowerCase() === "double strike"), false, "the printed card is not rewritten by the resolved temporary effect");
  eq(reload.effects.some(effect => effect.affects?.ids?.includes(target) && effect.apply?.addKeywords?.includes("Double Strike")), true, "the actual resolved Boros Charm gives its new target double strike once");
}
{
  const {state} = runScenario({name: "live play refresh retains the original mana-value bound", seats: 3, setup: [
    {seat: 0, zone: "hand", cards: ["Lightning Bolt", "Boros Charm"]},
    {seat: 0, zone: "battlefield", cards: ["Cankerbloom"]}, {seat: 1, zone: "battlefield", cards: ["Cankerbloom"]}], steps: []}, index.definition);
  const handBefore = [...state.zones.hand[0]];
  pushAbility(state, {controller: 0, abilityId: "one-mana-spell-only", script: {effects: [{effect: "play", from: "hand", free: true, manaValueAtMost: 1}]}});
  resolveTop(state);
  eq([...new Set(state.awaiting.choices.map(action => action.label))], ["Lightning Bolt"], "the original resolving permission admits only its one-mana spell");
  concede(state, 1); refreshEffectPlay(state);
  eq([...new Set(state.awaiting.choices.map(action => action.label))], ["Lightning Bolt"], "live rederivation retains the saved mana-value limit instead of promoting another spell in hand");
  const choice = awaitingChoice(state);
  resolveAwaiting(state, [choice.options.at(-1).index], null, null, {choiceId: choice.id});
  eq(state.zones.hand[0], handBefore, "declining the refreshed bounded permission moves or pays for neither hand card");
}
{
  const {state} = runScenario({name: "live play refresh cannot reopen native selected targets", seats: 3, setup: [
    {seat: 0, zone: "exile", cards: ["Eerie Interlude"]}, {seat: 0, zone: "battlefield", cards: ["Cankerbloom"]}], steps: []}, index.definition);
  pushAbility(state, {controller: 0, abilityId: "cast-interlude", script: {effects: [{effect: "play", from: "targets", targets: [...state.zones.exile], free: true}]}});
  resolveTop(state); resolveAwaiting(state, [0]);
  eq(Boolean(state.awaiting.targeting), true, "the actual native counted-target question remains part of the selected cast");
  const before = structuredClone(state);
  eq([deriveEffectPlay(state), refreshEffectPlay(state)], [null, {changed: false}], "refresh does not reopen a committed native target step or replace its locked action");
  eq(state, before, "an ineligible refresh leaves the selected target continuation exactly unchanged");
  resolveAwaiting(state, [0]);
  eq(state.stack.at(-1).name, "Eerie Interlude", "the original selected target handler still completes its exact native cast");
}
{
  const {state} = runScenario({name: "live play refresh cannot reopen native selected payment", setup: [{seat: 0, zone: "exile", cards: ["Sol Ring"]}], steps: []}, index.definition);
  Object.assign(state.players[0].manaPool, {C: 1, R: 1});
  pushAbility(state, {controller: 0, abilityId: "pay-ring", script: {effects: [{effect: "play", from: "targets", targets: [...state.zones.exile], payMana: true}]}});
  resolveTop(state); resolveAwaiting(state, [0]);
  eq(Boolean(state.awaiting.planning || state.awaiting.funding), true, "an actual selected Sol Ring cast retains its native mana-payment step");
  const before = structuredClone(state);
  eq([deriveEffectPlay(state), refreshEffectPlay(state)], [null, {changed: false}], "refresh cannot reopen an existing native payment child");
  eq(state, before, "the exact selected payment state survives a no-op refresh unchanged");
  resolveAwaiting(state, [0]);
  eq([state.stack.at(-1).name, state.players[0].manaPool.C + state.players[0].manaPool.R], ["Sol Ring", 1], "the original native payment handler still spends precisely one mana and casts the selected Ring");
}
for (const goneBeforeOpen of [false, true]) {
  const {state} = runScenario({name: "native linked selector retains source LKI and a fixed bound", seats: 3, setup: [
    {seat: 0, zone: "battlefield", cards: ["Hada Freeblade", "Hada Freeblade", "Plains", "Forest", "Wastes"]},
    {seat: 0, zone: "graveyard", cards: ["Hada Freeblade", "Oran-Rief Survivalist"]}], steps: []}, index.definition);
  const source = addObject(state, {...index.definition("Boiling Rock Rioter"), card: "Boiling Rock Rioter", owner: 2, controller: 0}, "battlefield");
  const tappers = state.zones.battlefield.filter(id => state.objects[id].card === "Hada Freeblade");
  const grave = [...state.zones.graveyard[0]];
  for (const [i, target] of grave.entries()) {
    const action = legalActions(state, 0).find(action => action.kind === "activate" && action.objectId === source && action.targets?.[0]?.id === target
      && Object.values(action.costChoice ?? {}).flat().includes(tappers[i]));
    applyAction(state, 0, action);
    eq(state.objects[tappers[i]].tapped, true, "the native Rioter activation pays its explicitly selected actual Ally tapper");
    resolveTop(state);
  }
  eq(state.links[source].map(id => state.objects[id].card), ["Hada Freeblade", "Oran-Rief Survivalist"], "the actual Rioter's two native exile activations create the real linked card identities");
  for (const id of state.zones.battlefield.filter(id => ["Plains", "Forest", "Wastes"].includes(state.objects[id].card)))
    applyAction(state, 0, legalActions(state, 0).find(action => action.kind === "activate-mana" && action.objectId === id));
  state.objects[source].counters.charge = 1;
  const was = lastKnown(state, source), instruction = structuredClone(state.objects[source].abilities.find(ability => ability.effects?.some(effect => effect.effect === "play")).effects[0]);
  /* This supplemental native instruction adds a finite bound to the printed selector; no saved card definition changes. */
  instruction.manaValueAtMost = {countersOn: "self", counter: "charge"};
  pushAbility(state, {sourceId: source, controller: 0, abilityId: "bounded-linked-native-control", lastKnown: was, script: {effects: [instruction]}});
  if (goneBeforeOpen) concede(state, 2);
  resolveTop(state);
  eq([state.awaiting.player, state.awaiting.playOrigin.most, state.awaiting.choices.map(action => action.label)], [0, 1, ["Hada Freeblade"]], "the original actor and source/LKI fix the bound when the instruction begins, including a source already gone");
  if (!goneBeforeOpen) {state.objects[source].counters.charge = 3; concede(state, 2);}
  const before = structuredClone(state), derived = deriveEffectPlay(state);
  eq([derived.choices.map(action => action.label), state.awaiting.playOrigin.context.controller, state.awaiting.playOrigin.most], [["Hada Freeblade"], 0, 1], "refresh reevaluates the live linked selector with the original actor/context without widening the saved bound from a changed or missing source");
  eq(state, before, "source-departure/LKI derivation is pure and does not redo either native exile activation");
  refreshEffectPlay(state);
  const copy = JSON.parse(JSON.stringify(state)), choice = awaitingChoice(copy), pool = {...copy.players[0].manaPool};
  resolveAwaiting(copy, [0], null, null, {choiceId: choice.id});
  eq([copy.stack.at(-1).name, copy.stack.at(-1).playerId, copy.players[0].manaPool.W, copy.players[0].manaPool.G, copy.players[0].manaPool.C], ["Hada Freeblade", 0, pool.W - 1, pool.G, pool.C], "the surviving original actor pays only the selected spell's real white cost through the original native handler after reload");
  eq([copy.players[2].lost, copy.objects[source], copy.zones.exile.filter(id => copy.objects[id].card === "Oran-Rief Survivalist").length], [true, undefined, 1], "departure remains immediate and the disallowed two-mana linked card remains in exile");
  resolveTop(copy);
  eq(copy.zones.battlefield.filter(id => copy.objects[id].card === "Hada Freeblade").length, 3, "the bounded selected card actually resolves for the surviving actor");
}
console.log(`engine-effect-play-refresh: ${checks} checks passed`);
