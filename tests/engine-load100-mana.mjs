/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Wave 0 W5: actual printed mana costs are distinct from mana values (CR 202.1, 202.3). */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {parseManaCost, convokeCanPay, convokePayments, paymentKey, paymentOptions} from "../game/engine/rules/mana.mjs";
import {legalActions, applyAction, castTapPlans} from "../game/engine/rules/actions.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";

const cardIndex = loadCardIndex();
let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
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
  const events = resolveAwaiting(state, [55]);
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
console.log(`engine-load100-mana: ${checks} checks passed — printed costs, convoke alternatives, and funded casts.`);
