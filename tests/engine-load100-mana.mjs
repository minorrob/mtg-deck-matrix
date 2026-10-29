/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Wave 0 W5: actual printed mana costs are distinct from mana values (CR 202.1, 202.3). */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {parseManaCost, convokeCanPay, convokePayments, paymentKey, paymentOptions, sourceTapPlans, quickTapPlan, manaPayloadKey, sourceKindKey} from "../game/engine/rules/mana.mjs";
import {legalActions, applyAction, castTapPlans, manaSources} from "../game/engine/rules/actions.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";

const cardIndex = loadCardIndex();
let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const finishSources = (state, plan) => {
  const events = [];
  while (state.awaiting?.kind === "choose-cost" && awaitingChoice(state).cost === "manaSource") {
    const choice = awaitingChoice(state), wanted = plan.taps.filter(t => t.color === choice.output).map(t => t.id);
    const picked = choice.options.filter(o => wanted.includes(o.cardId)).map(o => o.index);
    eq(picked.length, choice.min, "the original exact-ID witness is explicitly available at each identity block");
    events.push(...resolveAwaiting(state, picked));
  }
  return events;
};
const saga = JSON.parse(readFileSync(new URL("../game/engine/cards/u/urzas-saga.json", import.meta.url), "utf8"));
const search = saga.abilities.find((a) => a.trigger?.chapter === 3).effects[0];
const fixtures = Object.fromEntries([["Zero Trinket", "{0}"], ["One Trinket", "{1}"], ["White Trinket", "{W}"],
  ["Variable Trinket", "{X}"], ["No Cost Trinket", null], ["Artifact Land", null]].map(([name, manaCost]) =>
  [name, {types: name === "Artifact Land" ? ["Artifact", "Land"] : ["Artifact"], manaCost, colors: []}]));
{
  const sources = Object.fromEntries(Array.from({length: 17}, (_, n) => [`Rider Source ${n}`, {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {R: 1},
    whenSpent: {spell: {types: ["Sorcery"]}, text: "When spent, you gain 1 life.", effects: [{effect: "gainLife", amount: 1}]}}]}]));
  const fixtures = {...sources, Ride: {types: ["Sorcery"], manaCost: "{R}", spell: {id: "s", text: "You gain 3 life.", targets: [], effects: [{effect: "gainLife", amount: 3}]}}};
  let state = runScenario({name: "all rider sources remain selectable", setup: [{seat: 0, zone: "hand", cards: ["Ride"]}, {seat: 0, zone: "battlefield", cards: Object.keys(sources)}], steps: []}, cardIndex.definition, fixtures).state;
  const ids = [...state.zones.battlefield];
  const events = ids.flatMap(id => applyAction(state, 0, legalActions(state, 0).find(a => a.kind === "activate-mana" && a.objectId === id)));
  eq(events.filter(e => e.kind === "GameEventManaPool").length, 17, "seventeen actual source activations produce seventeen rider mana");
  const offers = legalActions(state, 0).filter(a => a.kind === "cast" && a.label === "Ride");
  eq(offers.length, 17, "all seventeen distinguishable rider-source payments remain offered");
  const selectedRider = offers[16].riders[0], selectedSource = state.players[0].manaRiders.find(rider => rider.id === selectedRider).source;
  state = JSON.parse(JSON.stringify(state));
  applyAction(state, 0, offers[16]);
  eq([state.players[0].manaPool.R, state.players[0].manaRiders.length, state.stack.at(-1)?.cardId], [16, 16, selectedSource], "selecting the last rider spends exactly its mana and triggers that source");
  eq(state.players[0].manaRiders.some(rider => rider.id === selectedRider), false, "the chosen rider ID is spent, with the other sixteen retained");
  resolveTop(state);
  resolveTop(state);
  eq(state.players[0].life, 44, "the selected rider and the spell each resolve once");
}
{
  const lands = Object.fromEntries(["W", "U", "B", "R", "G", "C"].map(key => [`${key} Vast Source`, {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {[key]: 1}}]}]));
  const fixtures = {...lands, Eight: {types: ["Sorcery"], manaCost: "{8}", spell: {id: "s", text: "You gain 8 life.", targets: [], effects: [{effect: "gainLife", amount: 8}]}}};
  let state = runScenario({name: "search budget cannot hide funding choices", pooledTaps: true, setup: [{seat: 0, zone: "hand", cards: ["Eight"]},
    {seat: 0, zone: "battlefield", cards: Object.keys(lands).flatMap(name => Array(6).fill(name))}], steps: []}, cardIndex.definition, fixtures).state;
  state.players[0].manaPool.C = 1;
  const action = legalActions(state, 0).find(a => a.kind === "cast" && a.label === "Eight"), plans = castTapPlans(state, 0, action, Infinity);
  eq(plans.filter(plan => plan.taps.length === 7).length, 786, "all C(12,5)-6 seven-source multisets are available; the six all-one-color sets exceed source counts");
  applyAction(state, 0, action);
  eq(awaitingChoice(state).options.length, plans.length, "the public funding question retains the complete large plan list");
  state = JSON.parse(JSON.stringify(state));
  const selected = plans.findLastIndex(plan => plan.taps.length === 7), wanted = plans[selected].taps.map(tap => tap.id).sort((a,b) => a-b);
  resolveAwaiting(state, [selected]);
  finishSources(state, plans[selected]);
  eq(state.zones.battlefield.filter(id => state.objects[id].tapped).sort((a,b) => a-b), wanted, "a late plan pays with exactly its seven sources and the floating mana");
  resolveTop(state);
  eq([state.players[0].life, Object.values(state.players[0].manaPool).reduce((a,b) => a+b, 0)], [48, 0], "that late complete-search payment casts and resolves");
}
{
  const fixtures = {Two: {types: ["Sorcery"], manaCost: "{2}", spell: {id: "s", text: "You gain 2 life.", targets: [], effects: [{effect: "gainLife", amount: 2}]}},
    Rock: {types: ["Artifact"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {C: 2}}]}};
  const state = runScenario({name: "source budgets stay legal choices", pooledTaps: true, setup: [{seat: 0, zone: "hand", cards: ["Two"]}, {seat: 0, zone: "battlefield", cards: ["Rock", "Wastes", "Wastes"]}], steps: []}, cardIndex.definition, fixtures).state;
  const action = legalActions(state, 0).find(a => a.kind === "cast" && a.label === "Two");
  const plans = castTapPlans(state, 0, action, Infinity);
  const lands = state.zones.battlefield.filter(id => state.objects[id].card === "Wastes");
  const index = plans.findIndex(plan => plan.taps.length === 2 && plan.taps.every(tap => lands.includes(tap.id)));
  eq(index >= 0, true, "two one-mana lands remain an option beside a single two-mana rock");
  applyAction(state, 0, action);
  resolveAwaiting(state, [index]);
  eq(state.zones.battlefield.map(id => [state.objects[id].card, state.objects[id].tapped]), [["Rock", false], ["Wastes", true], ["Wastes", true]], "the chosen larger source set leaves the rock untapped");
  resolveTop(state);
  eq(state.players[0].life, 42, "that funding choice pays and resolves the spell");
}
{
  const saved = JSON.parse(readFileSync(new URL("../game/engine/cards/f/faithless-looting.scenarios.json", import.meta.url), "utf8"));
  const {state, events} = runScenario(saved.scenarios[0], cardIndex.definition, saved.fixtures);
  eq(state.zones.battlefield.map((id) => [state.objects[id].card, state.objects[id].tapped]), Array.from({length: 4}, () => ["Mountain", true]), "Faithless Looting's two real casts tap exactly four Mountains");
  eq(events.filter((e) => e.kind === "GameEventManaPool").length, 4, "four mana abilities are performed, including automatic flashback funding");
  eq(events.filter((e) => e.kind === "GameEventSpellAbilityCast").map((e) => e.data.fields.castFrom), ["hand", "graveyard"], "exactly one ordinary and one flashback cast occur");
  eq([events.filter((e) => e.data?.fields?.drawn).length, events.filter((e) => e.data?.fields?.discarded).length], [4, 4], "both casts draw and discard exactly two");
}
{
  const index = cardIndex, shock = {...index.definition("Breeding Pool"), card: "Breeding Pool"};
  for (const route of ["create", "copy"]) for (const pay of [false, true]) {
    const maker = {types: ["Sorcery"], manaCost: "{0}", spell: {id: "s", text: "Create a shock-land token.",
      targets: route === "copy" ? [{what: "permanent", types: ["Land"]}] : [],
      effects: [route === "copy" ? {effect: "copyPermanent", targets: {target: 0}} : {effect: "createToken", count: 1, token: {...shock, name: "Breeding Pool"}}]}};
    let state = runScenario({name: `${route} shock token`, setup: [{seat: 0, zone: "hand", cards: ["Make Shock"]},
      ...(route === "copy" ? [{seat: 0, zone: "battlefield", cards: ["Breeding Pool"]}] : [])],
      steps: [{cast: "Make Shock", ...(route === "copy" ? {targets: [{card: "Breeding Pool", seat: 0}]} : {})}, {resolve: true}]}, index.definition, {"Make Shock": maker}).state;
    const choice = awaitingChoice(state);
    eq(choice.options.map((o) => o.pay), [true, false], `${route}: actual token entry offers pay-life and decline`);
    eq(state.zones.battlefield.filter((id) => state.objects[id].token).length, 0, "no token is committed before its entry answer");
    state = JSON.parse(JSON.stringify(state));
    const before = structuredClone(state);
    assert.throws(() => resolveAwaiting(state, [99]), /Select the required rule options/); checks++;
    eq(state, before, "invalid token entry answer preserves the reloaded game");
    const events = resolveAwaiting(state, [pay ? 0 : 1]);
    const made = state.zones.battlefield.filter((id) => state.objects[id].token);
    eq([made.length, state.objects[made[0]].card, state.objects[made[0]].tapped, state.players[0].life], [1, "Breeding Pool", !pay, pay ? 38 : 40], `${route}: selected life payment determines tapped state exactly`);
    eq(events.filter((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.to.zoneType === "Battlefield").length, 1, "the selected token arrives exactly once");
    eq([state.ruleOperation ?? null, state.awaiting], [null, null], "token creation finishes its saved operation");
  }
}
{
  const spec = {types: ["Sorcery"], manaCost: "{X}{B}", colors: ["B"], keywords: ["Delve"], spell: {id: "s", text: "You gain X life.", targets: [], effects: [{effect: "gainLife", amount: "X"}]}};
  for (const reduction of [0, 2]) {
  let state = runScenario({name: "X paid by delve", setup: [{seat: 0, zone: "hand", cards: ["Delve X"]}, {seat: 0, zone: "graveyard", cards: ["Wastes", "Plains", "Island"]},
    ...(reduction ? [{seat: 0, zone: "battlefield", cards: ["Helm of Awakening", "Helm of Awakening"]}] : [])], steps: []}, cardIndex.definition, {"Delve X": spec}).state;
  state.players[0].manaPool.B = 1;
  const offers = legalActions(state, 0).filter((a) => a.kind === "cast" && a.label === "Delve X" && a.delve);
  eq(offers.map((a) => a.x), [1, 2, 3].map((n) => n + reduction), "delve offers every X whose remaining generic cost the graveyard can pay after reductions");
  applyAction(state, 0, offers[2]);
  eq([awaitingChoice(state).min, awaitingChoice(state).max], [3, 3], "X=3 requires all three selected graveyard cards");
  state = JSON.parse(JSON.stringify(state));
  const before = structuredClone(state), grave = [...state.zones.graveyard[0]];
  assert.throws(() => resolveAwaiting(state, [0, 0, 1]), /Invalid selection/); checks++;
  eq(state, before, "duplicate delve selection changes no zone, mana or saved operation");
  const events = resolveAwaiting(state, [0, 1, 2]);
  eq([state.players[0].manaPool.B, state.zones.exile.map((id) => state.objects[id].card), state.stack.at(-1)?.x], [0, ["Wastes", "Plains", "Island"], 3 + reduction], "the actual X cast exiles exactly those cards and spends its black mana");
  eq(events.filter((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.to.zoneType === "Exile").map((e) => e.data.fields.card.cardId), grave, "the exile events name exactly the three chosen old object IDs");
  eq(grave.every((id) => !state.objects[id]), true, "all old graveyard incarnations are gone");
  eq(events.filter((e) => e.kind === "GameEventSpellAbilityCast").length, 1, "delve announces the spell exactly once");
  resolveTop(state);
  eq(state.players[0].life, 43 + reduction, "the resolved effect reads the announced X, including the cost reduction");
  }
}
{
  const index = cardIndex;
  const names = ["Choked Estuary", "Foreboding Ruins", "Fortified Village", "Frostboil Snarl", "Furycalm Snarl", "Game Trail",
    "Necroblossom Snarl", "Port Town", "Shineshadow Snarl", "Vineglimmer Snarl", "Murmuring Bosk"];
  for (const name of names) {
    const {state, events} = runScenario({name: `${name} without a revealable card`, setup: [{seat: 0, zone: "hand", cards: [name, "Wastes"]}], steps: [{play: name}]}, index.definition);
    eq([state.awaiting, state.ruleOperation ?? null], [null, null], `${name}: no revealable card leaves no decision or suspended operation`);
    eq(state.zones.battlefield.filter((id) => state.objects[id].card === name).map((id) => state.objects[id].tapped), [true], `${name}: the actual played land enters tapped immediately`);
  }
  const heart = JSON.parse(readFileSync(new URL("../game/engine/cards/c/coldsteel-heart.scenarios.json", import.meta.url), "utf8"));
  for (const scenario of heart.scenarios) {
    const {state} = runScenario(scenario, index.definition);
    eq(state.zones.battlefield.filter((id) => state.objects[id].card === "Coldsteel Heart").length, 1, "the chosen replacement order commits exactly one Heart");
    eq(state.awaiting, null, "both legal replacement orders finish without a leftover question");
  }
}
{
  const lands = Object.fromEntries(["W", "U", "B", "R", "G", "C"].map((key) => [`${key} Source`, {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {[key]: 1}}]}]));
  const fixtures = {...lands, Three: {types: ["Sorcery"], manaCost: "{3}", spell: {id: "s", text: "You gain 3 life.", targets: [], effects: [{effect: "gainLife", amount: 3}]}}};
  let state = runScenario({name: "complete tapping choices", setup: [{seat: 0, zone: "hand", cards: ["Three"]},
    {seat: 0, zone: "battlefield", cards: Object.keys(lands).flatMap((name) => [name, name, name])}], steps: []}, cardIndex.definition, fixtures).state;
  const action = legalActions(state, 0).find((a) => a.kind === "cast" && a.label === "Three");
  applyAction(state, 0, action);
  eq(awaitingChoice(state).options.length, 56, "all 56 source combinations appear beyond the old 24 tap choices");
  const selected = castTapPlans(state, 0, action, Infinity)[55];
  state = JSON.parse(JSON.stringify(state));
  const before = structuredClone(state);
  assert.throws(() => resolveAwaiting(state, [56]), /Invalid selection/); checks++;
  eq(state, before, "invalid source selection changes nothing after JSON reload");
  const events = [...resolveAwaiting(state, [55]), ...finishSources(state, selected)];
  eq(state.zones.battlefield.filter((id) => state.objects[id].tapped).sort((a,b) => a-b), selected.taps.map((t) => t.id).sort((a,b) => a-b), "the last source combination taps exactly the selected objects");
  eq(events.filter((e) => e.kind === "GameEventManaPool").length, 3, "three selected mana abilities each produce once");
  resolveTop(state);
  eq([state.players[0].life, Object.values(state.players[0].manaPool).reduce((a,b) => a+b, 0)], [43, 0], "the selected sources pay all three and the spell resolves");
  const invite = {types: ["Sorcery"], manaCost: "{0}", spell: {id: "s", text: "You may cast an exiled spell.", targets: [],
    effects: [{effect: "play", from: "selector", selector: {zone: "exile", owner: "you"}, payMana: true}]}};
  const effectState = runScenario({name: "complete effect-paid mana plans", setup: [{seat: 0, zone: "hand", cards: ["Invite"]}, {seat: 0, zone: "exile", cards: ["Three"]},
    {seat: 0, zone: "battlefield", cards: Object.keys(lands).flatMap((name) => [name, name, name])}], steps: [{cast: "Invite"}, {resolve: true}]}, cardIndex.definition, {...fixtures, Invite: invite}).state;
  resolveAwaiting(effectState, [0]);
  eq(awaitingChoice(effectState).options.length, 56, "an effect-paid cast also exposes every funding plan beyond twelve");
  resolveAwaiting(effectState, [55]);
  eq(effectState.zones.battlefield.filter((id) => effectState.objects[id].tapped).length, 3, "the effect-paid cast taps exactly three chosen sources");
  eq(effectState.stack.at(-1)?.name, "Three", "the chosen payment really casts the exiled card");
  resolveTop(effectState);
  eq(effectState.players[0].life, 43, "the effect-paid spell resolves with its paid effect");
}
{
  const state = runScenario({name: "complete payment choices", setup: [{seat: 0, zone: "hand", cards: ["Three"]}], steps: []}, cardIndex.definition,
    {Three: {types: ["Sorcery"], manaCost: "{3}", spell: {id: "s", text: "You gain 3 life.", targets: [], effects: [{effect: "gainLife", amount: 3}]}}}).state;
  Object.assign(state.players[0].manaPool, {W: 3, U: 3, B: 3, R: 3, G: 3, C: 3});
  eq(paymentOptions(state.players[0].manaPool, parseManaCost("{3}")).length, 56, "all 56 distinct three-mana payments are enumerated");
  applyAction(state, 0, legalActions(state, 0).find((a) => a.kind === "cast" && a.label === "Three"));
  eq(awaitingChoice(state).options.length, 56, "the public payment question offers every payment beyond the old twelve");
  const before = structuredClone(state);
  assert.throws(() => resolveAwaiting(state, [56]), /Invalid selection/); checks++;
  eq(state, before, "an out-of-range payment leaves the state unchanged");
  resolveAwaiting(state, [55]);
  eq(state.players[0].manaPool.C, 0, "the last payment really spends three colorless mana");
  resolveTop(state);
  eq(state.players[0].life, 43, "the last payment casts and resolves the spell");
}
{
  for (const manaCost of [[], "{0}", [null], [""], ["0"], ["{not-a-symbol}"]]) {
    assert.throws(() => compileSelector({what: "card", manaCost}), /manaCost|mana cost|mana symbol/);
    checks++;
  }
  eq(compileSelector({what: "card", manaCost: ["{0}"]}) instanceof Function, true, "zero is an actual valid cost");
}
{
  const state = createState({matchId: "load100-w5", seed: "printed-cost", players: [{name: "Rob"}, {name: "Maya"}]});
  const ids = Object.entries(fixtures).map(([card, spec]) => addObject(state, {...spec, card, owner: 0, controller: 0}, "library", 0));
  const match = compileSelector({...search.selector, what: "card", zone: "library"});
  eq(ids.filter((id) => match(state, id, {controller: 0})).map((id) => state.objects[id].card), ["Zero Trinket", "One Trinket"],
    "Saga III offers actual {0} or {1}; colored, X, no-cost and artifact lands with those mana values stay out");
}
{
  const index = cardIndex;
  const scenario = {name: "Saga III's printed-cost search", library: ["Wastes", "Wastes", ...Object.keys(fixtures)],
    setup: [{seat: 0, zone: "hand", cards: ["Urza's Saga"]}],
    steps: [{play: "Urza's Saga"}, {resolve: true}, {to: {turn: 5, phase: "MAIN1"}}, {resolve: true}]};
  const {state} = runScenario(scenario, index.definition, fixtures);
  eq(state.awaiting?.effect, "chooseCard", "the actual chapter reaches its search question");
  eq(state.awaiting.cards.map((id) => state.objects[id].card).sort(), ["One Trinket", "Zero Trinket"],
    "the played Saga's chapter offers exactly the two printed costs");
  const skipped = runScenario({...scenario, steps: [...scenario.steps, {choose: []}]}, index.definition, fixtures).state;
  eq(skipped.zones.library[0].filter((id) => Object.hasOwn(fixtures, skipped.objects[id].card)).length, Object.keys(fixtures).length,
    "failing to find leaves every artifact in the shuffled library; private-zone contents checked in state");
  eq(skipped.zones.battlefield.length, 0, "the completed final chapter sacrifices the Saga after finding none");
}
{
  const white = [{id: 1, colors: ["W"]}], gray = [{id: 2, colors: []}, {id: 3, colors: []}];
  eq(convokeCanPay({}, parseManaCost("{W/P}"), white), true, "a white creature convokes the colored Phyrexian choice");
  eq(convokeCanPay({}, parseManaCost("{W/P}"), [...white, ...gray]), true, "extra eligible creatures may remain untapped when only one contribution is needed");
  eq(convokePayments({}, parseManaCost("{W/P}"), white).map(paymentKey), ["0,0,0,0,0,0|0"], "the Phyrexian symbol is paid by convoke, with no life or mana");
  eq(convokeCanPay({}, parseManaCost("{2/W}"), white), true, "a white creature pays the colored monohybrid choice");
  eq(convokeCanPay({}, parseManaCost("{2/W}"), gray), true, "two colorless creatures pay the generic monohybrid choice");
  eq(convokeCanPay({}, parseManaCost("{2/W}"), gray.slice(0, 1)), false, "one colorless creature cannot pay the two-generic choice");
  eq(convokePayments({}, parseManaCost("{2/W}"), gray).map(paymentKey), ["0,0,0,0,0,0|0"], "the generic branch may use two different creatures");
  const alternatives = convokePayments({C: 1}, parseManaCost("{1}{W/P}"), white, {life: 2});
  eq(alternatives.map((p) => [p.mana.C, p.life]).sort(), [[0, 2], [1, 0]], "which colored/life branch and which creature contribution remain the caster's choice");
  eq(convokeCanPay({}, parseManaCost("{S}"), white), false, "convoke cannot substitute a creature for snow mana");
  eq(convokePayments({}, parseManaCost("{W/P}"), gray, {life: 2}), [], "creatures cannot be tapped for life payments or surplus contributions");
}
{
  const index = cardIndex;
  const pals = {"White Pal": {types: ["Creature"], colors: ["W"], power: 2, toughness: 2},
    "Gray Pal": {types: ["Creature"], colors: [], power: 2, toughness: 2}, "Other Gray Pal": {types: ["Creature"], colors: [], power: 2, toughness: 2}};
  for (const [manaCost, helpers, life] of [["{1}{W/P}", ["White Pal"], 38], ["{W/P}", ["White Pal"], 40],
    ["{2/W}", ["White Pal"], 40], ["{2/W}", ["Gray Pal", "Other Gray Pal"], 40]]) {
    const spell = "Convoke Test";
    const spec = {types: ["Sorcery"], manaCost, colors: ["W"], keywords: ["Convoke"],
      spell: {id: "s", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]}};
    const {state} = runScenario({name: `${manaCost} played with convoke`,
      setup: [{seat: 0, zone: "battlefield", cards: helpers}, {seat: 0, zone: "hand", cards: [spell]}],
      steps: [{cast: spell, convoke: true}, {choose: helpers}, {resolve: true}]}, index.definition, {...pals, [spell]: spec});
    eq(state.players[0].life, life, `${manaCost}: the colored/generic/life choice pays exactly its total cost`);
    eq(state.zones.graveyard[0].map((id) => state.objects[id].card), [spell], `${manaCost}: the spell resolves through the actual cast path`);
    eq(state.zones.battlefield.every((id) => state.objects[id].tapped), true, `${manaCost}: every selected helper is tapped`);
  }
  for (const [answer, life, remaining] of [["2 life", 38, 1], ["{C}", 40, 0]]) {
    const spec = {types: ["Sorcery"], manaCost: "{1}{W/P}", colors: ["W"], keywords: ["Convoke"],
      spell: {id: "s", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]}};
    const {state} = runScenario({name: `choose ${answer} after convoke`,
      setup: [{seat: 0, zone: "battlefield", cards: ["White Pal", "Wastes"]}, {seat: 0, zone: "hand", cards: ["Convoke Test"]}],
      steps: [{tap: "Wastes"}, {cast: "Convoke Test", convoke: true}, {choose: ["White Pal"]},
        {expect: [{asks: {seat: 0, options: ["2 life", "{C}"]}}]}, {choose: [answer]}, {resolve: true}]},
    index.definition, {...pals, "Convoke Test": spec});
    eq([state.players[0].life, state.players[0].manaPool.C], [life, remaining], "the caster's answer decides whether mana or life remains");
  }
}
{
  /* CR 601.2g-h: mana abilities are available after announcing a cast from any permitted zone and for an alternative cost. */
  const land = (card, key) => ({card, types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {[key]: 1}}]});
  for (const zone of ["hand", "exile", "graveyard", "library"]) {
    let state = createState({matchId: `w5-funded-${zone}`, seed: zone, players: [{name: "Rob"}, {name: "Maya"}]});
    state.pooledTaps = true;
    for (let seat = 0; seat < 2; seat++) for (let n = 0; n < 12; n++) addObject(state, {...land("Library Wastes", "C"), owner: seat, controller: seat}, "library", seat);
    beginGame(state);
    for (let n = 0; n < 50 && !(state.phase === "MAIN1" && state.priorityPlayer === 0); n++) advance(state);
    const put = (spec, where) => addObject(state, {...spec, owner: 0, controller: 0}, where, where === "battlefield" ? null : 0);
    const source = put(land("Funding Forest", "G"), "battlefield");
    const other = put(land("Funding Island", "U"), "battlefield");
    if (zone !== "hand") put({card: "Casting Gate", types: ["Artifact"], abilities: [{id: "g", kind: "static", rule: "play-from", affects: {what: "player", who: "you"}, zone: zone === "library" ? "library-top" : zone, spells: {types: ["Sorcery"]}}]}, "battlefield");
    const spell = put({card: "Funded Spell", types: ["Sorcery"], manaCost: "{G}", colors: ["G"],
      abilities: [{id: "alt", kind: "static", rule: "alternative-cost", cost: [{atom: "mana", cost: "{U}"}]}],
      spell: {id: "s", text: "You gain 3 life.", targets: [], effects: [{effect: "gainLife", amount: 3}]}}, zone);
    if (zone === "library") state.zones.library[0].unshift(state.zones.library[0].pop());
    const offers = legalActions(state, 0).filter((a) => a.kind === "cast" && a.objectId === spell);
    eq(offers.map((a) => [a.from, a.alternative ?? null, a.autoTap]), [[zone, null, true], [zone, 0, true]], `${zone}: normal and alternative casts offered before any mana is floated`);
    eq([state.players[0].manaPool.G, state.players[0].manaPool.U, state.objects[source].tapped, state.objects[other].tapped], [0, 0, false, false], "offering the casts does not tap or add mana");
    state = JSON.parse(JSON.stringify(state));
    const before = structuredClone(state);
    assert.throws(() => applyAction(state, 0, {...offers[1], alternative: 99}), /legal action/); checks++;
    eq(state, before, "invalid alternative leaves the whole reloaded state unchanged");
    const events = applyAction(state, 0, offers[1]);
    eq([state.objects[source].tapped, state.objects[other].tapped, state.players[0].manaPool.U, state.stack.at(-1)?.name], [false, true, 0, "Funded Spell"], "the chosen alternative taps and spends exactly the Island's mana");
    eq(events.filter((e) => e.kind === "GameEventSpellAbilityCast").length, 1, "one spell cast event");
    eq(events.filter((e) => e.kind === "GameEventManaPool").map((e) => e.data.fields.source.cardId), [other], "exactly the selected source produces mana once");
    resolveTop(state);
    eq([state.players[0].life, state.zones.graveyard[0].map((id) => state.objects[id].card)], [43, ["Funded Spell"]], "paid alternative resolves with its exact effect and destination");
  }
}
{
  const fixtures = {Source: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {C: 1}}]},
    Two: {types: ["Sorcery"], manaCost: "{2}", spell: {id: "s", text: "You gain 2 life.", targets: [], effects: [{effect: "gainLife", amount: 2}]}}};
  const make = () => runScenario({name: "exact equivalent source identities", setup: [{seat: 0, zone: "hand", cards: ["Two"]},
    {seat: 0, zone: "battlefield", cards: ["Source", "Source", "Source", "Source"]}], steps: []}, cardIndex.definition, fixtures).state;
  const initial = make();
  eq(initial.sourceChoices, true, "canonical native scenarios use explicit physical source choices by default");
  const action = legalActions(initial, 0).find(a => a.kind === "cast");
  eq(castTapPlans(initial, 0, action, Infinity).length, 1, "one source-kind plan still has six physical subsets");
  applyAction(initial, 0, action);
  eq(initial.awaiting?.kind, "choose-cost", "a sole source-kind plan still asks which actual sources");
  eq([awaitingChoice(initial).cost, awaitingChoice(initial).mode, awaitingChoice(initial).min, awaitingChoice(initial).options.length], ["manaSource", "many", 2, 4], "the scalable identity stage offers every actual object once");
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
    const state = JSON.parse(JSON.stringify(initial)), before = structuredClone(state), options = awaitingChoice(state).options;
    assert.throws(() => resolveAwaiting(state, [a, a]), /Invalid selection/); checks++;
    eq(state, before, "duplicate source identity changes nothing after reload");
    const ids = [options[a].cardId, options[b].cardId], events = resolveAwaiting(state, [a, b]);
    eq(state.zones.battlefield.filter(id => state.objects[id].tapped), ids, "every physical subset taps exactly the chosen identities");
    eq(events.filter(e => e.kind === "GameEventManaPool").map(e => e.data.fields.source.cardId), ids, "mana provenance names the chosen source identities");
    eq([state.awaiting, state.stack.at(-1)?.name, state.players[0].manaPool.C], [null, "Two", 0], "the selected subset pays and casts exactly once");
    resolveTop(state);
    eq(state.players[0].life, 42, "every identity subset reaches the actual native effect");
  }
  const withdrawn = JSON.parse(JSON.stringify(initial));
  concede(withdrawn, 0);
  eq([withdrawn.awaiting, withdrawn.players[0].lost, withdrawn.stack.length], [null, true, 0], "concession withdraws the identity proposal without casting");
  const stale = JSON.parse(JSON.stringify(initial)), source = awaitingChoice(stale).options[3].cardId;
  stale.objects[source].controller = 1;
  const staleBefore = structuredClone(stale);
  assert.throws(() => resolveAwaiting(stale, [0, 3]), /Invalid selection/); checks++;
  eq(stale, staleBefore, "a stale identity index changes no resources or saved proposal");
}
{
  const fixtures = {SwampSource: {types: ["Land"], subtypes: ["Swamp"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {B: 1}}]},
    OtherSource: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {B: 1}}]},
    One: {types: ["Sorcery"], manaCost: "{B}", spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}}};
  const initial = runScenario({name: "identity-dependent extra mana", setup: [{seat: 0, zone: "hand", cards: ["One"]},
    {seat: 0, zone: "battlefield", cards: ["SwampSource", "OtherSource", "Nirkana Revenant"]}], steps: []}, cardIndex.definition, fixtures).state;
  applyAction(initial, 0, legalActions(initial, 0).find(a => a.kind === "cast"));
  eq(awaitingChoice(initial).options.map(o => initial.objects[o.cardId].card), ["SwampSource", "OtherSource"], "equal base outputs still offer identity-dependent sources");
  for (const pick of [0, 1]) {
    const state = JSON.parse(JSON.stringify(initial)), id = awaitingChoice(state).options[pick].cardId;
    const events = resolveAwaiting(state, [pick]);
    eq(state.zones.battlefield.filter(id => state.objects[id].tapped), [id], "only the chosen identity is tapped beside the real Nirkana");
    eq(events.filter(e => e.kind === "GameEventManaPool")[0].data.fields.source.cardId, id, "base mana provenance uses the actual chosen source");
    eq(state.players[0].manaPool.B, pick === 0 ? 1 : 0, "only the selected Swamp receives Nirkana's actual extra mana");
    resolveTop(state);
    eq([state.players[0].life, state.awaiting], [41, null], "both identity-dependent payments cast and resolve exactly once");
  }
}
{
  const fixtures = {Dual: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: [{G: 1}, {U: 1}]}]},
    Mixed: {types: ["Sorcery"], manaCost: "{G}{U}", spell: {id: "s", text: "You gain 2 life.", targets: [], effects: [{effect: "gainLife", amount: 2}]}}};
  const initial = runScenario({name: "assign exact identities to distinct outputs", setup: [{seat: 0, zone: "hand", cards: ["Mixed"]},
    {seat: 0, zone: "battlefield", cards: ["Dual", "Dual"]}], steps: []}, cardIndex.definition, fixtures).state;
  applyAction(initial, 0, legalActions(initial, 0).find(a => a.kind === "cast"));
  const all = awaitingChoice(initial).options.map(o => o.cardId);
  eq(awaitingChoice(initial).title.includes("{G}"), true, "the physical-ID stage says which output these exact sources will make");
  for (const pick of [0, 1]) {
    const state = JSON.parse(JSON.stringify(initial)), chosen = all[pick], other = all[1-pick];
    const events = resolveAwaiting(state, [pick]);
    eq(events.filter(e => e.kind === "GameEventManaPool").map(e => [e.data.fields.source.cardId, e.data.fields.produced]), [[chosen, {G: 1}], [other, {U: 1}]], "both assignments of distinct outputs to exact dual identities remain legal");
    eq([state.awaiting, state.players[0].manaPool.G, state.players[0].manaPool.U, state.stack.at(-1)?.name], [null, 0, 0, "Mixed"], "the chosen output assignment pays exactly once");
  }
}
{
  const fixtures = {Green: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {G: 1}}]},
    Clear: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {C: 1}}]},
    Mixed: {types: ["Sorcery"], manaCost: "{1}{G}", spell: {id: "s", text: "You gain 2 life.", targets: [], effects: [{effect: "gainLife", amount: 2}]}}};
  const initial = runScenario({name: "saved identity prefix", setup: [{seat: 0, zone: "hand", cards: ["Mixed"]},
    {seat: 0, zone: "battlefield", cards: ["Green", "Green", "Clear", "Clear"]}], steps: []}, cardIndex.definition, fixtures).state;
  const action = legalActions(initial, 0).find(a => a.kind === "cast"), plans = castTapPlans(initial, 0, action, Infinity);
  applyAction(initial, 0, action);
  const pattern = plans.findIndex(p => p.taps.some(t => t.color === "C"));
  resolveAwaiting(initial, [pattern]);
  const green = awaitingChoice(initial).options[1].cardId;
  resolveAwaiting(initial, [1]);
  eq([awaitingChoice(initial).cost, initial.zones.battlefield.some(id => initial.objects[id].tapped), initial.stack.length], ["manaSource", false, 0], "the first ID block is saved without tapping, producing or casting");
  const state = JSON.parse(JSON.stringify(initial)), clear = awaitingChoice(state).options[1].cardId;
  const events = resolveAwaiting(state, [1]);
  eq(events.filter(e => e.kind === "GameEventManaPool").map(e => e.data.fields.source.cardId), [green, clear], "JSON reload preserves the earlier exact source prefix");
  const stale = JSON.parse(JSON.stringify(initial)); stale.objects[green].tapped = true;
  const before = structuredClone(stale);
  assert.throws(() => resolveAwaiting(stale, [0]), /Invalid mana source selection/); checks++;
  eq(stale, before, "a stale earlier block refuses before any later source activates or the proposal changes");
  const forged = JSON.parse(JSON.stringify(initial)); forged.awaiting.action.tapSources[0] = [clear];
  const forgedBefore = structuredClone(forged);
  assert.throws(() => resolveAwaiting(forged, [0]), /Invalid mana source selection/); checks++;
  eq(forged, forgedBefore, "an ID from the wrong output kind is refused with all resources unchanged");
  const withdrawn = JSON.parse(JSON.stringify(initial)); concede(withdrawn, 0);
  eq([withdrawn.awaiting, withdrawn.stack.length, withdrawn.players[0].manaPool.G, withdrawn.players[0].manaPool.C], [null, 0, 0, 0], "concession after a saved block produces no mana and casts nothing");
}
{
  const initial = createState({matchId: "derived-mana-controller", seed: "borrowed", sourceChoices: true, players: [{name: "Rob"}, {name: "Maya"}]});
  initial.phase = "MAIN1"; initial.activePlayer = 0; initial.priorityPlayer = 0; initial.turn = 1;
  const reef = addObject(initial, {...cardIndex.definition("Shivan Reef"), card: "Shivan Reef", owner: 1, controller: 1}, "battlefield", null);
  const spell = addObject(initial, {card: "Borrowed Funding", owner: 0, controller: 0, types: ["Sorcery"], manaCost: "{1}",
    spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}}, "hand", 0);
  initial.effects = [{id: "borrowed", layer: 2, timestamp: 1, affects: {ids: [reef]}, apply: {controller: 0}}];
  const offered = legalActions(initial, 0).find(a => a.kind === "activate-mana" && a.objectId === reef && a.mana.C === 1);
  eq(Boolean(offered), true, "the actual layer-2 controller can activate the borrowed Reef despite raw controller and owner");
  eq(manaSources(initial, 0).map(s => s.cardId), [reef], "the public mana source facts use the same derived controller");
  const manual = JSON.parse(JSON.stringify(initial)), events = applyAction(manual, 0, offered);
  eq([manual.objects[reef].tapped, manual.players[0].manaPool.C, manual.players[1].manaPool.C], [true, 1, 0], "borrowed mana goes only to its actual activating controller");
  eq(events.filter(e => e.kind === "GameEventManaPool").map(e => e.data.fields.source.cardId), [reef], "borrowed source provenance retains the original exact object ID");
  const funded = JSON.parse(JSON.stringify(initial)), cast = legalActions(funded, 0).find(a => a.kind === "cast" && a.objectId === spell);
  eq(cast.autoTap, true, "the derived-controller source also funds an actual spell offer");
  applyAction(funded, 0, cast); resolveTop(funded);
  eq([funded.players[0].life, funded.objects[reef].tapped, funded.players[0].manaPool.C], [41, true, 0], "borrowed source funds, pays and resolves the spell");
  const former = JSON.parse(JSON.stringify(initial)); former.priorityPlayer = 1;
  eq([legalActions(former, 1).some(a => a.kind === "activate-mana" && a.objectId === reef), manaSources(former, 1).some(s => s.cardId === reef)], [false, false], "the owner and former raw controller has neither an activation nor source facts");
  const before = structuredClone(former);
  assert.throws(() => applyAction(former, 1, offered), /not a legal action/); checks++;
  eq(former, before, "a forged former-controller activation changes nothing");
}
{
  const fixtures = {Source: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {C: 1}}]},
    Eighteen: {types: ["Sorcery"], manaCost: "{18}", spell: {id: "s", text: "You gain 18 life.", targets: [], effects: [{effect: "gainLife", amount: 18}]}}};
  const state = runScenario({name: "billions of subsets need one explicit question", setup: [{seat: 0, zone: "hand", cards: ["Eighteen"]},
    {seat: 0, zone: "battlefield", cards: Array(36).fill("Source")}], steps: []}, cardIndex.definition, fixtures).state;
  applyAction(state, 0, legalActions(state, 0).find(a => a.kind === "cast"));
  const choice = awaitingChoice(state), indices = Array.from({length: 18}, (_, i) => 18 + i), ids = indices.map(i => choice.options[i].cardId);
  eq([choice.cost, choice.min, choice.max, choice.options.length], ["manaSource", 18, 18, 36], "C(36,18) physical subsets use one36-option explicit question");
  const events = resolveAwaiting(state, indices);
  eq(events.filter(e => e.kind === "GameEventManaPool").map(e => e.data.fields.source.cardId), ids, "the late18 physical identities remain selectable without enumerating billions of subsets");
  eq(state.zones.battlefield.slice(0, 18).some(id => state.objects[id].tapped), false, "no earlier equivalent source is silently substituted");
  resolveTop(state);
  eq([state.players[0].life, state.awaiting, state.players[0].manaPool.C], [58, null, 0], "the scalable identity selection pays and resolves natively");
}
for (const manaCost of ["{1}", "{G/U}"]) {
  const fixtures = {Dual: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: [{G: 1}, {U: 1}]}]},
    One: {types: ["Sorcery"], manaCost, spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}}};
  const initial = runScenario({name: `both outputs pay ${manaCost}`, setup: [{seat: 0, zone: "hand", cards: ["One"]},
    {seat: 0, zone: "battlefield", cards: ["Dual"]}], steps: []}, cardIndex.definition, fixtures).state;
  const action = legalActions(initial, 0).find(a => a.kind === "cast"), plans = castTapPlans(initial, 0, action, Infinity);
  eq(plans.map(p => p.taps[0].color).sort(), ["G", "U"], `${manaCost}: neither output color is silently discarded`);
  applyAction(initial, 0, action);
  eq([initial.awaiting?.kind, awaitingChoice(initial).options.length, initial.stack.length], ["choose-cost", 2, 0], "the actual output question precedes payment or casting");
  eq(["G", "U"].every(color => awaitingChoice(initial).options.some(o => o.label.includes(`make {${color}}`))), true, "the public options describe the actual colors to choose");
  for (const color of ["G", "U"]) {
    const state = JSON.parse(JSON.stringify(initial)), choice = awaitingChoice(state), before = structuredClone(state);
    assert.throws(() => resolveAwaiting(state, [2]), /Invalid selection/); checks++;
    eq(state, before, "invalid output selection preserves all state after reload");
    const events = resolveAwaiting(state, [plans.findIndex(p => p.taps[0].color === color)]);
    eq(events.filter(e => e.kind === "GameEventManaPool").map(e => e.data.fields.produced), [{[color]: 1}], "the selected actual ability produces exactly the selected output");
    const spell = state.objects[state.stack.at(-1).objectId];
    eq([spell.spent[color], state.players[0].manaPool.G, state.players[0].manaPool.U, state.awaiting], [1, 0, 0, null], "the selected output actually pays the spell");
    resolveTop(state);
    eq(state.players[0].life, 41, "each explicit output alternative reaches native resolution");
  }
}
{
  const fixtures = {Dual: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: [{G: 1}, {U: 1}]}]},
    Two: {types: ["Sorcery"], manaCost: "{2}", spell: {id: "s", text: "You gain 2 life.", targets: [], effects: [{effect: "gainLife", amount: 2}]}}};
  const initial = runScenario({name: "all mixed output patterns", setup: [{seat: 0, zone: "hand", cards: ["Two"]},
    {seat: 0, zone: "battlefield", cards: ["Dual", "Dual"]}], steps: []}, cardIndex.definition, fixtures).state;
  const action = legalActions(initial, 0).find(a => a.kind === "cast"), plans = castTapPlans(initial, 0, action, Infinity);
  eq(plans.map(p => p.taps.map(t => t.color).sort().join("")).sort(), ["GG", "GU", "UU"], "all same-color and mixed-color output patterns remain available exactly once");
  applyAction(initial, 0, action);
  for (let i = 0; i < plans.length; i++) {
    const state = JSON.parse(JSON.stringify(initial)), events = [...resolveAwaiting(state, [i]), ...finishSources(state, plans[i])];
    eq(events.filter(e => e.kind === "GameEventManaPool").map(e => Object.keys(e.data.fields.produced)[0]).sort(), plans[i].taps.map(t => t.color).sort(), "every mixed output pattern activates its actual chosen mana outputs");
    const spent = state.objects[state.stack.at(-1).objectId].spent;
    eq([spent.G ?? 0, spent.U ?? 0], [plans[i].taps.filter(t => t.color === "G").length, plans[i].taps.filter(t => t.color === "U").length], "the actual paid colors match the selected mixed pattern");
    resolveTop(state);
    eq([state.players[0].life, state.players[0].manaPool.G, state.players[0].manaPool.U, state.awaiting], [42, 0, 0, null], "every mixed pattern pays, casts and resolves with no leftover decision");
  }
  const alias = runScenario({name: "same names and same total outputs remain distinct kind choices", setup: [{seat: 0, zone: "hand", cards: ["Two"]},
    {seat: 0, zone: "battlefield", cards: ["Dual", "Dual", "Forest", "Forest"]}], steps: []}, cardIndex.definition, fixtures).state;
  for (const id of alias.zones.battlefield) alias.objects[id].card = "Same Source";
  applyAction(alias, 0, legalActions(alias, 0).find(a => a.kind === "cast"));
  const labels = awaitingChoice(alias).options.map(o => o.label);
  eq([labels.length, new Set(labels).size], [6, 6], "different kind patterns with identical names and total colors stay individually identifiable");
  eq(labels.every(label => (label.match(/make/g) ?? []).length === 1), true, "duplicate display facts are added once per pattern");
}
{
  /* An explicitly historical saved pod: its floating-pool solver kept quick/search activation orders as two keys.
     Preserve that tape contract; every canonical scenario and current table uses the current contract above. */
  const saved = createState({matchId: "historical-floating-funding", seed: "old", pooledTaps: true, players: [{name: "Rob"}, {name: "Maya"}]});
  saved.phase = "MAIN1"; saved.activePlayer = 0; saved.priorityPlayer = 0; saved.turn = 1; saved.players[0].manaPool.C = 1;
  const grove = addObject(saved, {card: "Grove", types: ["Land"], owner: 0, controller: 0, abilities: [{id: "m", kind: "mana", tapSelf: true, produces: [{G: 1}, {U: 1}]}]}, "battlefield", null);
  const island = addObject(saved, {...cardIndex.definition("Island"), card: "Island", owner: 0, controller: 0}, "battlefield", null);
  addObject(saved, {card: "Old Three", types: ["Sorcery"], owner: 0, controller: 0, manaCost: "{1}{G}{U}",
    spell: {id: "s", text: "You gain 2 life.", targets: [], effects: [{effect: "gainLife", amount: 2}]}}, "hand", 0);
  const state = JSON.parse(JSON.stringify(saved)), action = legalActions(state, 0).find(a => a.kind === "cast");
  eq([Object.hasOwn(state, "sourceChoices"), castTapPlans(state, 0, action, Infinity).length], [false, 2], "the explicitly historical saved pod retains its old distinct activation-order keys");
  eq(castTapPlans(state, 0, action, Infinity).map(plan => plan.key), ["sources:G/U=G;U=U|0,1,0,0,1,1|0", "sources:U=U;G/U=G|0,1,0,0,1,1|0"], "the historical tape retains its exact pre-payload keys");
  applyAction(state, 0, action);
  eq(awaitingChoice(state).options.map(o => o.label), ["Grove, Island", "Island, Grove"], "historical output labels remain exactly as on its old tape");
  const events = resolveAwaiting(state, [1]);
  eq(events.filter(e => e.kind === "GameEventManaPool").map(e => e.data.fields.source.cardId), [island, grove], "the historical answer retains its original activation order");
  resolveTop(state);
  eq([state.players[0].life, Object.values(state.players[0].manaPool).reduce((a,b) => a+b, 0)], [42, 0], "historical funding retains its actual paid and resolved outcome");
}
{
  const fixtures = {Bird: {types: ["Creature"], power: 1, toughness: 1, keywords: ["Flying"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {W: 1}}]},
    Drake: {types: ["Creature"], power: 1, toughness: 1, keywords: ["Flying"]},
    Flexible: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: [{W: 1}, {G: 1}]}]},
    Spectrum: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: [{U: 1}, {B: 1}, {R: 1}]}]}};
  const make = (birds, drakes, land = []) => runScenario({name: `Sephara disjoint tap costs ${birds}/${drakes}/${land}`, setup: [{seat: 0, zone: "hand", cards: ["Sephara, Sky's Blade"]},
    {seat: 0, zone: "battlefield", cards: [...Array(birds).fill("Bird"), ...Array(drakes).fill("Drake"), ...land]}], steps: []}, cardIndex.definition, fixtures).state;
  const alternatives = state => legalActions(state, 0).filter(a => a.kind === "cast" && a.alternative !== undefined);
  const impossible = make(1, 3);
  eq(alternatives(impossible), [], "four cost flyers cannot also tap their sole mana Bird for the required white mana");
  const initial = make(2, 4);
  applyAction(initial, 0, alternatives(initial)[0]);
  const first = awaitingChoice(initial);
  eq([first.cost, first.mode, first.min, first.max, first.options.length], ["tap", "many", 4, 4, 6], "the actual alternative asks nonmana cost tappers before its funding sources");
  const all = first.options.map(o => o.cardId), birds = all.filter(id => initial.objects[id].card === "Bird");
  const verify = (state, costIds, source, events) => {
    eq(events.filter(e => e.kind === "GameEventManaPool").map(e => e.data.fields.source.cardId), [source], "only the disjoint chosen mana source produces");
    const tapped = events.filter(e => e.kind === "GameEventCardTapped" && e.data.fields.tapped === true).map(e => e.data.fields.card.cardId);
    eq([tapped.length, new Set(tapped).size, [...tapped].sort((a,b) => a-b)], [5, 5, [...costIds, source].sort((a,b) => a-b)], "the four cost tappers and mana source each tap exactly once");
    eq([state.players[0].manaPool.W, state.stack.at(-1)?.name, state.awaiting], [0, "Sephara, Sky's Blade", null], "the actual disjoint resources pay and cast Sephara");
    resolveTop(state);
    const drake = state.zones.battlefield.find(id => state.objects[id].card === "Drake");
    eq([state.zones.battlefield.some(id => state.objects[id].card === "Sephara, Sky's Blade"), keywordsOf(state, drake).includes("Indestructible")], [true, true], "the actual Sephara resolves and protects the other flyer");
  };
  let refused = 0, paid = 0;
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++) for (let d = c + 1; d < 6; d++) {
    const state = JSON.parse(JSON.stringify(initial)), picks = [a,b,c,d], costs = picks.map(i => all[i]), remaining = birds.filter(id => !costs.includes(id));
    if (!remaining.length) {
      const before = structuredClone(state);
      assert.throws(() => resolveAwaiting(state, picks), /leave no legal mana payment/); checks++;
      eq(state, before, "every unaffordable tap subset refuses before clearing the proposal or paying anything");
      refused++;
    } else {
      const events = resolveAwaiting(state, picks);
      if (state.awaiting) {
        eq([awaitingChoice(state).cost, state.zones.battlefield.some(id => state.objects[id].tapped), state.stack.length], ["manaSource", false, 0], "the chosen cost IDs are saved while both possible mana IDs remain unpaid");
        eq(state.awaiting.action.flashbackTap, costs, "the cost-tapper prefix survives to its source-identity question");
        for (let index = 0; index < remaining.length; index++) {
          const resumed = JSON.parse(JSON.stringify(state)), source = awaitingChoice(resumed).options[index].cardId;
          eq(remaining.includes(source), true, "only a source outside the saved cost set is offered");
          verify(resumed, costs, source, [...events, ...resolveAwaiting(resumed, [index])]); paid++;
        }
        const withdrawn = JSON.parse(JSON.stringify(state)); concede(withdrawn, 0);
        eq([withdrawn.awaiting, withdrawn.stack.length, withdrawn.players[0].manaPool.W], [null, 0, 0], "concession after saving cost tappers commits no cost or cast");
        const stale = JSON.parse(JSON.stringify(state)); stale.objects[costs[0]].controller = 1;
        const staleBefore = structuredClone(stale);
        assert.throws(() => resolveAwaiting(stale, [0]), /untapped creatures you control/); checks++;
        eq(stale, staleBefore, "a saved cost tapper that changed controller refuses before source activation or proposal changes");
      } else {verify(state, costs, remaining[0], events); paid++;}
    }
  }
  eq([refused, paid], [6, 10], "all15 four-of-six cost subsets are audited: six invalid subsets and ten distinct legal complete payments");
  for (const land of ["Plains", "Flexible"]) {
    const state = make(1, 3, [land]), action = alternatives(state)[0];
    eq(Boolean(action), true, "an outside same-kind or flexible source admits the legal payment after a rejected Bird witness");
    eq(castTapPlans(state, 0, action, Infinity).every(p => p.taps.every(t => state.objects[t.id].card === land)), true, "the concrete availability witness also leaves all four mandatory cost flyers untapped");
    applyAction(state, 0, action);
    const costs = awaitingChoice(state).options.map(o => o.cardId), source = state.zones.battlefield.find(id => state.objects[id].card === land);
    const events = resolveAwaiting(state, [0,1,2,3]);
    verify(state, costs, source, events);
  }
  const forged = make(2, 4), action = alternatives(forged)[0], own = forged.zones.battlefield.filter(id => forged.objects[id].card === "Drake");
  const enemy = addObject(forged, {...fixtures.Drake, card: "Enemy Drake", owner: 1, controller: 1}, "battlefield", null);
  const before = structuredClone(forged);
  assert.throws(() => applyAction(forged, 0, {...action, flashbackTap: [enemy, ...own.slice(0, 3)]}), /untapped creatures you control/); checks++;
  eq(forged, before, "a forged opponent cost tapper refuses before replacing the proposal or committing any resource");
  const borrowed = make(2, 3);
  const drake = addObject(borrowed, {...fixtures.Drake, card: "Borrowed Drake", owner: 1, controller: 1}, "battlefield", null);
  (borrowed.effects ??= []).push({id: "borrowed cost flyer", layer: 2, timestamp: 1, affects: {ids: [drake]}, apply: {controller: 0}});
  applyAction(borrowed, 0, alternatives(borrowed)[0]);
  const costs = awaitingChoice(borrowed).options.filter(o => borrowed.objects[o.cardId].card !== "Bird");
  eq(costs.some(o => o.cardId === drake), true, "a layer2-controlled cost tapper is eligible despite raw controller and owner");
  resolveAwaiting(borrowed, costs.map(o => o.index));
  const source = awaitingChoice(borrowed).options[1].cardId;
  verify(borrowed, costs.map(o => o.cardId), source, resolveAwaiting(borrowed, [1]));
  const constrained = make(1, 3, ["Flexible", "Spectrum"]);
  addObject(constrained, {...cardIndex.definition("Grand Arbiter Augustin IV"), card: "Grand Arbiter Augustin IV", owner: 1, controller: 1}, "battlefield", null);
  const legal = alternatives(constrained)[0];
  eq(Boolean(legal), true, "a rejected Bird prefix cannot memo-prune the later legal outside-source pattern under the real Arbiter tax");
  applyAction(constrained, 0, legal);
  const tapIds = awaitingChoice(constrained).options.map(o => o.cardId);
  resolveAwaiting(constrained, [0,1,2,3]);
  const funding = castTapPlans(constrained, 0, constrained.awaiting.action, Infinity), picked = funding.findIndex(p => p.payment.mana.W === 1 && p.payment.mana.U === 1);
  eq(picked >= 0, true, "the real taxed alternative retains the legal W/U funding output pattern");
  const events = resolveAwaiting(constrained, [picked]);
  const manaIds = constrained.zones.battlefield.filter(id => ["Flexible", "Spectrum"].includes(constrained.objects[id].card));
  eq(events.filter(e => e.kind === "GameEventManaPool").map(e => e.data.fields.source.cardId), manaIds, "only both outside sources fund the taxed alternative");
  eq(events.filter(e => e.kind === "GameEventCardTapped").map(e => e.data.fields.card.cardId).sort((a,b) => a-b), [...tapIds, ...manaIds].sort((a,b) => a-b), "the taxed cast taps exactly six distinct mana/cost identities");
  resolveTop(constrained);
  eq(constrained.zones.battlefield.some(id => constrained.objects[id].card === "Sephara, Sky's Blade"), true, "the real tax and disjoint nonmana cost finish in actual resolution");
}
{
  const fixtures = {Small: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {C: 1}}]},
    Large: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {C: 2}}]},
    Two: {types: ["Sorcery"], manaCost: "{2}", spell: {id: "s", text: "You gain 2 life.", targets: [], effects: [{effect: "gainLife", amount: 2}]}}};
  const initial = runScenario({name: "actual same-name C1/C2 payload identities", pooledTaps: true, setup: [{seat: 0, zone: "hand", cards: ["Two"]},
    {seat: 0, zone: "battlefield", cards: ["Small", "Small", "Large"]}], steps: []}, cardIndex.definition, fixtures).state;
  for (const id of initial.zones.battlefield) initial.objects[id].card = "Same Source";
  const action = legalActions(initial, 0).find(a => a.kind === "cast"), plans = castTapPlans(initial, 0, action, Infinity);
  eq(plans.length, 3, "actual C1/C2 outputs retain the large source, both small sources and one of each pattern");
  applyAction(initial, 0, action);
  let paid = 0;
  const verify = (state, events) => {
    const produced = events.filter(e => e.kind === "GameEventManaPool");
    eq(produced.every(e => e.data.fields.produced.C === state.objects[e.data.fields.source.cardId].abilities[0].produces.C), true, "each exact source identity retains its actual C1 or C2 production payload");
    const made = produced.reduce((n,e) => n + e.data.fields.produced.C, 0);
    eq([state.objects[state.stack.at(-1).objectId].spent.C, state.players[0].manaPool.C], [2, made - 2], "different output quantities pay the same two and retain their exact surplus");
    resolveTop(state);
    eq(state.players[0].life, 42, "each quantity-specific physical payment reaches native resolution"); paid++;
  };
  for (let i = 0; i < plans.length; i++) {
    const state = JSON.parse(JSON.stringify(initial)), events = resolveAwaiting(state, [i]);
    if (state.awaiting) {
      const choice = awaitingChoice(state);
      eq(choice.options.every(o => state.objects[o.cardId].abilities[0].produces.C === 1), true, "the ambiguous small-output ID block cannot substitute the C2 source");
      for (const option of choice.options) {const resumed = JSON.parse(JSON.stringify(state)); verify(resumed, [...events, ...resolveAwaiting(resumed, [option.index])]);}
    } else verify(state, events);
  }
  eq(paid, 4, "all four actual physical C1/C2 payments are exercised");
}
{
  const fixtures = {Bundle: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: [{C: 2}, {G: 1, U: 1}]}]},
    Two: {types: ["Sorcery"], manaCost: "{2}", spell: {id: "s", text: "You gain 2 life.", targets: [], effects: [{effect: "gainLife", amount: 2}]}}};
  const initial = runScenario({name: "actual distinct bundled payloads", pooledTaps: true, setup: [{seat: 0, zone: "hand", cards: ["Two"]}, {seat: 0, zone: "battlefield", cards: ["Bundle"]}], steps: []}, cardIndex.definition, fixtures).state;
  const action = legalActions(initial, 0).find(a => a.kind === "cast"), plans = castTapPlans(initial, 0, action, Infinity);
  eq(plans.length, 2, "both actual C2 and G1/U1 bundled output payloads remain available");
  applyAction(initial, 0, action);
  for (let i = 0; i < plans.length; i++) {
    const state = JSON.parse(JSON.stringify(initial)), events = resolveAwaiting(state, [i]);
    const made = events.find(e => e.kind === "GameEventManaPool").data.fields.produced;
    eq(made, plans[i].taps[0].color === "C:2" ? {C: 2} : {G: 1, U: 1}, "the selected actual bundled ability produces its full payload");
    eq(Object.values(state.players[0].manaPool).reduce((a,b) => a+b, 0), 0, "the full bundled payload pays exactly two");
    resolveTop(state);
    eq(state.players[0].life, 42, "both distinct actual bundles cast and resolve");
  }
}
{
  const fixtures = {One: {types: ["Sorcery"], manaCost: "{1}", spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}}};
  const initial = runScenario({name: "actual pain outputs stay distinct from pure tap funding", setup: [{seat: 0, zone: "hand", cards: ["One"]}, {seat: 0, zone: "battlefield", cards: ["Shivan Reef"]}], steps: []}, cardIndex.definition, fixtures).state;
  const cast = legalActions(initial, 0).find(a => a.kind === "cast");
  eq(castTapPlans(initial, 0, cast, Infinity).map(p => p.taps[0].color), ["C"], "the actual damage-producing U/R abilities are not grouped into pure tap funding");
  const automatic = JSON.parse(JSON.stringify(initial)); applyAction(automatic, 0, cast); resolveTop(automatic);
  eq(automatic.players[0].life, 41, "the automatic pure C ability causes no hidden painland damage");
  const manual = JSON.parse(JSON.stringify(initial)), blue = legalActions(manual, 0).find(a => a.kind === "activate-mana" && a.mana.U === 1);
  applyAction(manual, 0, blue);
  eq([manual.players[0].life, manual.players[0].manaPool.U], [39, 1], "the explicit actual blue mana ability retains its damage side effect");
  applyAction(manual, 0, legalActions(manual, 0).find(a => a.kind === "cast")); resolveTop(manual);
  eq([manual.players[0].life, manual.players[0].manaPool.U], [40, 0], "the explicit painland payment still pays, casts and resolves with its real life total");
}
{
  const fixtures = {One: {types: ["Sorcery"], manaCost: "{1}", spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}}};
  const initial = runScenario({name: "actual spending restriction is not a pure-output identity", setup: [{seat: 0, zone: "hand", cards: ["One"]},
    {seat: 0, zone: "battlefield", cards: ["Ancient Ziggurat", "Wastes"]}], steps: []}, cardIndex.definition, fixtures).state;
  const pure = initial.zones.battlefield.find(id => initial.objects[id].card === "Wastes"), restricted = initial.zones.battlefield.find(id => initial.objects[id].card === "Ancient Ziggurat");
  const cast = legalActions(initial, 0).find(a => a.kind === "cast");
  eq(castTapPlans(initial, 0, cast, Infinity).map(p => p.taps.map(t => t.id)), [[pure]], "the real creature-only mana source is not grouped with unrestricted funding of a sorcery");
  const green = legalActions(initial, 0).find(a => a.kind === "activate-mana" && a.objectId === restricted && a.mana.G === 1);
  applyAction(initial, 0, green);
  eq(initial.players[0].restrictedMana.map(entry => [entry.key, entry.source]), [["G", restricted]], "the explicit actual restricted activation retains its green amount and source provenance");
  const events = applyAction(initial, 0, legalActions(initial, 0).find(a => a.kind === "cast"));
  eq(events.filter(e => e.kind === "GameEventManaPool").map(e => e.data.fields.source.cardId), [pure], "the sorcery funds only from the unrestricted actual identity");
  eq([initial.players[0].restrictedMana.map(entry => [entry.key, entry.source]), initial.players[0].manaPool.C], [[["G", restricted]], 0], "casting retains the unspent creature-only green mana and spends the pure colorless mana");
  resolveTop(initial);
  eq(initial.players[0].life, 41, "the actual restricted/pure split still reaches native sorcery resolution");
}
{
  const fixtures = {Bird: {types: ["Creature"], power: 1, toughness: 1, keywords: ["Flying"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {W: 1}}]},
    Drake: {types: ["Creature"], power: 1, toughness: 1, keywords: ["Flying"]}};
  const {state} = runScenario({name: "pilot chooses a complete legal tap payment from actor-visible facts", setup: [{seat: 0, zone: "hand", cards: ["Sephara, Sky's Blade"]},
    {seat: 0, zone: "battlefield", cards: ["Bird", "Bird", "Drake", "Drake", "Drake", "Drake"]}], steps: []}, cardIndex.definition, fixtures);
  applyAction(state, 0, legalActions(state, 0).find(a => a.kind === "cast" && a.alternative !== undefined));
  const before = structuredClone(state), choice = JSON.parse(JSON.stringify(awaitingChoice(state)));
  eq(state, before, "constructing the factual funding witness changes no state");
  eq([choice.fundingWitness?.kind, choice.fundingWitness?.sources.length, choice.fundingWitness?.payment.mana.W, choice.options.length], ["mana-before-tap-cost", 1, 1, 6], "one factual complete funding witness is serializable while every human cost option remains available");
  const protectedIds = choice.fundingWitness.sources.map(source => source.cardId);
  eq(choice.fundingWitness.sources.every(source => state.objects[source.cardId].zone === "battlefield" && source.mana.W === 1), true, "the witness contains only the actor's public mana sources and actual outputs");
  const answer = housePilot({seat: 0}).answer(projectFor(state, 0), choice), costs = answer.indices.map(i => choice.options[i].cardId);
  eq([costs.length, costs.some(id => protectedIds.includes(id))], [4, false], "the pilot chooses a complete cost subset without tapping its factual funding source");
  const reloaded = JSON.parse(JSON.stringify(state)), events = resolveAwaiting(reloaded, answer.indices);
  eq(events.filter(e => e.kind === "GameEventManaPool").map(e => e.data.fields.source.cardId), protectedIds, "the explicit pilot answer after JSON reload uses the witness's actual source");
  eq([reloaded.awaiting, reloaded.priorityPlayer, reloaded.passes, reloaded.stack.at(-1)?.name, reloaded.players[0].manaPool.W], [null, 0, 0, "Sephara, Sky's Blade", 0], "the actual pilot payment casts once and returns priority to its actor");
  resolveTop(reloaded);
  eq(reloaded.zones.battlefield.some(id => reloaded.objects[id].card === "Sephara, Sky's Blade"), true, "the pilot's actual paid spell resolves");
}
{
  const units = [{id: 1, outputs: {C: {C: 1}}}, {id: 2, outputs: {C: {C: 2}}}];
  const plans = sourceTapPlans(units, {}, parseManaCost("{1}"), Infinity);
  eq(plans.map(plan => plan.taps[0].id).sort(), [1, 2], "the saved raw RED retains both complete payloads even with the same C display label");
  eq(new Set(plans.map(plan => plan.key)).size, 2, "different full payloads retain distinct plan keys");
  eq(sourceKindKey(units[0]) === sourceKindKey(units[1]), false, "source kinds distinguish amounts rather than just color names");
  const aliases = [{id: 1, outputs: {alpha: {G: 1}, beta: {U: 1}}}, {id: 2, outputs: {delta: {U: 1}, gamma: {G: 1}}}];
  const ways = sourceTapPlans(aliases, {}, parseManaCost("{2}"), Infinity);
  const pattern = plan => plan.taps.map(tap => Object.keys(aliases.find(unit => unit.id === tap.id).outputs[tap.color])[0]).sort().join("");
  eq(ways.map(pattern).sort(), ["GG", "GU", "UU"], "reversed output aliases retain every semantic combination exactly once");
  eq(ways.every(plan => plan.taps.every(tap => aliases.find(unit => unit.id === tap.id).outputs[tap.color])), true, "every raw output label still binds to the actual selected source");
  const quick = quickTapPlan(aliases, {}, parseManaCost("{2}"));
  eq(ways.find(plan => plan.key === quick.key)?.key, quick.key, "quick and searched keys identify the same payload pattern independently of activation order");
  const renamed = aliases.map((unit, index) => ({id: unit.id, outputs: Object.fromEntries(Object.values(unit.outputs).reverse().map((mana, n) => [`label-${index}-${n}`, mana]))}));
  eq(sourceTapPlans(renamed, {}, parseManaCost("{2}"), Infinity).map(plan => plan.key).sort(), ways.map(plan => plan.key).sort(), "renaming and reordering presentation labels cannot change semantic funding keys");
}
{
  const fixtures = {First: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {G: 1, U: 1}}]},
    Second: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {U: 1, G: 1}}]},
    Two: {types: ["Sorcery"], manaCost: "{2}", spell: {id: "s", text: "You gain 2 life.", targets: [], effects: [{effect: "gainLife", amount: 2}]}}};
  const initial = runScenario({name: "actual equivalent bundle labels retain physical choices", pooledTaps: true, setup: [{seat: 0, zone: "hand", cards: ["Two"]},
    {seat: 0, zone: "battlefield", cards: ["First", "Second"]}], steps: []}, cardIndex.definition, fixtures).state;
  const ids = [...initial.zones.battlefield];
  for (const id of ids) initial.objects[id].card = "Same Bundle";
  const action = legalActions(initial, 0).find(action => action.kind === "cast"), plans = castTapPlans(initial, 0, action, Infinity);
  eq(plans.length, 1, "reordered actual bundled mana vectors form one funding pattern");
  applyAction(initial, 0, action);
  eq([awaitingChoice(initial).cost, awaitingChoice(initial).options.map(option => option.cardId)], ["manaSource", ids], "a sole bundle pattern still asks for either actual physical source");
  eq([initial.stack.length, ids.every(id => !initial.objects[id].tapped)], [0, true], "previewing the equivalent payloads pays and taps nothing");
  const invalid = JSON.parse(JSON.stringify(initial)), before = structuredClone(invalid);
  assert.throws(() => resolveAwaiting(invalid, [99])); checks++;
  eq(invalid, before, "a forged bundle choice after reload changes no state");
  for (let index = 0; index < ids.length; index++) {
    const state = JSON.parse(JSON.stringify(initial)), events = resolveAwaiting(state, [index]);
    eq(events.filter(event => event.kind === "GameEventManaPool").map(event => [event.data.fields.source.cardId, event.data.fields.produced]),
      [[ids[index], state.objects[ids[index]].abilities[0].produces]], "the selected bundle uses its own exact activation label and full original payload");
    eq(ids.map(id => state.objects[id].tapped === true), ids.map(id => id === ids[index]), "only the explicitly selected physical bundle is tapped");
    eq([state.objects[state.stack.at(-1).objectId].spent.G, state.objects[state.stack.at(-1).objectId].spent.U, Object.values(state.players[0].manaPool).reduce((a,b) => a+b, 0)], [1, 1, 0], "the selected full bundle actually pays its two colors with no residual mana");
    resolveTop(state);
    eq([state.awaiting, state.players[0].life, state.zones.graveyard[0].some(id => state.objects[id].card === "Two")], [null, 42, true], "either physical bundled source reaches real resolution and the final graveyard zone");
  }
  const stale = JSON.parse(JSON.stringify(initial)); stale.objects[ids[1]].tapped = true;
  const staleBefore = structuredClone(stale);
  assert.throws(() => resolveAwaiting(stale, [1])); checks++;
  eq(stale, staleBefore, "a stale payload source refuses atomically without substituting the other source");
  const stopped = JSON.parse(JSON.stringify(initial)), stoppedEvents = concede(stopped, 0);
  eq([stopped.awaiting, stopped.stack.length, stopped.players[0].manaPool.G, stopped.players[0].manaPool.U, stoppedEvents.some(event => event.kind === "GameEventManaPool")], [null, 0, 0, 0, false], "conceding a saved payload question produces no mana and casts nothing");
}
{
  const fixtures = {Bird: {types: ["Creature"], power: 1, toughness: 1, keywords: ["Flying"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {W: 1, G: 1}}]},
    Land: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {G: 1, W: 1}}]},
    Drake: {types: ["Creature"], power: 1, toughness: 1, keywords: ["Flying"]}};
  const {state} = runScenario({name: "reserved witness remaps equivalent bundle labels", pooledTaps: true, setup: [{seat: 0, zone: "hand", cards: ["Sephara, Sky's Blade"]},
    {seat: 0, zone: "battlefield", cards: ["Bird", "Land", "Drake", "Drake", "Drake"]}], steps: []}, cardIndex.definition, fixtures);
  const land = state.zones.battlefield.find(id => state.objects[id].card === "Land"), costs = state.zones.battlefield.filter(id => id !== land);
  const action = legalActions(state, 0).find(action => action.kind === "cast" && action.alternative !== undefined), plans = castTapPlans(state, 0, action, Infinity);
  eq(plans.map(plan => plan.taps), [[{id: land, color: "G:1+W:1"}]], "a reserved witness retargets an equivalent outside source using that source's own bundled output label");
  const events = applyAction(state, 0, action);
  while (state.awaiting) {
    const choice = awaitingChoice(state);
    eq(choice.cost, "tap", "the reserved bundle leaves only the real four-flyer cost question");
    events.push(...resolveAwaiting(state, choice.options.filter(option => costs.includes(option.cardId)).map(option => option.index)));
  }
  eq(events.filter(event => event.kind === "GameEventManaPool").map(event => [event.data.fields.source.cardId, event.data.fields.produced]), [[land, {G: 1, W: 1}]], "the remapped outside-source activation produces its real full bundle");
  eq([costs.every(id => state.objects[id].tapped), state.players[0].manaPool.G, state.players[0].manaPool.W, state.stack.at(-1)?.name], [true, 1, 0, "Sephara, Sky's Blade"], "nonmana and mana source costs remain disjoint with the exact bundled surplus");
  resolveTop(state);
  eq(state.zones.battlefield.some(id => state.objects[id].card === "Sephara, Sky's Blade"), true, "the full remapped payment reaches actual resolution");
}
{
  const fixtures = {First: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: [{G: 1}, {U: 1}]}]},
    Second: {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: [{U: 1}, {G: 1}]}]},
    Two: {types: ["Sorcery"], manaCost: "{2}", spell: {id: "s", text: "You gain 2 life.", targets: [], effects: [{effect: "gainLife", amount: 2}]}}};
  const initial = runScenario({name: "actual reversed output arrays", pooledTaps: true, setup: [{seat: 0, zone: "hand", cards: ["Two"]},
    {seat: 0, zone: "battlefield", cards: ["First", "Second"]}], steps: []}, cardIndex.definition, fixtures).state;
  const ids = [...initial.zones.battlefield]; for (const id of ids) initial.objects[id].card = "Same Dual";
  const action = legalActions(initial, 0).find(action => action.kind === "cast"), plans = castTapPlans(initial, 0, action, Infinity);
  eq(plans.map(plan => plan.taps.map(tap => tap.color).sort().join("")).sort(), ["GG", "GU", "UU"], "actual reversed output arrays preserve all GG/GU/UU patterns");
  applyAction(initial, 0, action);
  let paid = 0;
  for (let index = 0; index < plans.length; index++) {
    const state = JSON.parse(JSON.stringify(initial)), events = resolveAwaiting(state, [index]);
    const choices = state.awaiting ? awaitingChoice(state).options.map(option => option.index) : [null];
    for (const selected of choices) {
      const resumed = JSON.parse(JSON.stringify(state)), actual = [...events, ...(selected === null ? [] : resolveAwaiting(resumed, [selected]))];
      eq(actual.filter(event => event.kind === "GameEventManaPool").map(event => manaPayloadKey(event.data.fields.produced)).sort(),
        plans[index].taps.map(tap => manaPayloadKey({[tap.color]: 1})).sort(), "each actual reversed-array payment activates the selected full output payloads");
      eq(ids.every(id => resumed.objects[id].tapped), true, "each complete payment taps the two actual physical sources once");
      if (selected !== null) eq(actual.find(event => event.kind === "GameEventManaPool" && event.data.fields.produced.G).data.fields.source.cardId, ids[selected], "both mixed-color physical assignments retain the explicitly selected green source");
      resolveTop(resumed);
      eq([resumed.awaiting, resumed.players[0].life], [null, 42], "each reversed-array physical payment resolves once"); paid++;
    }
  }
  eq(paid, 4, "GG, UU and both exact GU assignments are exercised natively");
}
console.log(`engine-load100-mana: ${checks} checks passed — printed costs, convoke alternatives, and funded casts.`);
