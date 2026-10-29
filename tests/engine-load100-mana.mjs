/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Wave 0 W5: actual printed mana costs are distinct from mana values (CR 202.1, 202.3). */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {parseManaCost, convokeCanPay, convokePayments, paymentKey} from "../game/engine/rules/mana.mjs";

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const saga = JSON.parse(readFileSync(new URL("../game/engine/cards/u/urzas-saga.json", import.meta.url), "utf8"));
const search = saga.abilities.find((a) => a.trigger?.chapter === 3).effects[0];
const fixtures = Object.fromEntries([["Zero Trinket", "{0}"], ["One Trinket", "{1}"], ["White Trinket", "{W}"],
  ["Variable Trinket", "{X}"], ["No Cost Trinket", null], ["Artifact Land", null]].map(([name, manaCost]) =>
  [name, {types: name === "Artifact Land" ? ["Artifact", "Land"] : ["Artifact"], manaCost, colors: []}]));
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
  const index = loadCardIndex();
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
  const index = loadCardIndex();
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
console.log(`engine-load100-mana: ${checks} checks passed — Saga III's actual costs and convoke's colored and generic alternatives.`);
