/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {usesThisTurn} from "../game/engine/state/index.mjs";

let checks = 0;
const eq = (a, b, message) => { assert.deepEqual(a, b, message); checks += 1; };
const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {
  "Smoke Permit": {types: ["Creature"], manaCost: "{B}", colors: ["B"], power: 1, toughness: 1},
  "Smoke Relic": {types: ["Artifact"], manaCost: "{0}", colors: []},
  "Smoke Archivist": {types: ["Creature"], manaCost: "{1}", colors: [], power: 1, toughness: 1,
    abilities: [{id: "permission", kind: "static", rule: "play-from", affects: {what: "player", who: "you"}, zone: "graveyard", spells: true, limit: 1}]},
  "Smoke Double Archivist": {types: ["Creature"], manaCost: "{1}", colors: [], power: 1, toughness: 1,
    abilities: ["permission-a", "permission-b"].map(id => ({id, kind: "static", rule: "play-from", affects: {what: "player", who: "you"},
      zone: "graveyard", spells: true, lands: true, limit: 1}))},
};
const start = (setup, more = {}) => runScenario({name: "W3 accuracy debt", seats: 3, setup, steps: [], ...more}, index.definition, FIX).state;

/* CR 601.2a: two limited permissions consume different resources, even when both give the same cast. */
{
  const state = start([at(0, "battlefield", "Smoke Permit"), at(0, "graveyard", "Smoke Relic")]);
  const source = state.zones.battlefield.find(id => state.objects[id].card === "Smoke Permit");
  for (let n = 0; n < 2; n += 1) runEffect(state, {effect: "mayPlay", from: "graveyard", count: 1, spellsOnly: true}, {controller: 0, source});
  const permits = state.effects.filter(e => e.rule === "may-play").map(e => e.id);
  const offers = legalActions(state, 0).filter(a => a.kind === "cast" && a.label === "Smoke Relic");
  eq(offers.map(a => a.via).sort(), [...permits].sort(), "the player chooses which limited permission is spent");
  applyAction(state, 0, offers.find(a => a.via === permits[1]));
  eq(state.effects.filter(e => e.rule === "may-play").map(e => e.id), [permits[0]], "choosing the second permission leaves the first available");
  eq(state.stack.length, 1, "one spell was cast, once");
}

/* One permanent can grant two separate permissions; each ability has its own use counter (CR 113.2c, 601.2a, 305.1). */
for (const [kind, card] of [["cast", "Smoke Relic"], ["play-land", "Forest"]]) {
  const state = start([at(0, "graveyard", card), at(0, "battlefield", "Smoke Double Archivist")]);
  const source = state.zones.battlefield.find(id => state.objects[id].card === "Smoke Double Archivist");
  const offers = legalActions(state, 0).filter(action => action.kind === kind && action.label === card);
  eq(offers.length, 2, `${kind}: two limited abilities on one source are separate choices`);
  eq(new Set(offers.map(action => action.via)).size, 2, `${kind}: saved actions identify the particular permission ability`);
  eq(offers.map(action => action.viaName), ["Smoke Double Archivist (permission 1)", "Smoke Double Archivist (permission 2)"],
    `${kind}: a player can tell the same-source choices apart`);
  for (let selected = 0; selected < 2; selected += 1) {
    const resumed = JSON.parse(JSON.stringify(state));
    applyAction(resumed, 0, JSON.parse(JSON.stringify(offers[selected])));
    eq(["permission-a", "permission-b"].map(id => usesThisTurn(resumed, source, `play-from:${id}`)),
      selected === 0 ? [1, 0] : [0, 1], `${kind}: selecting ability ${selected + 1} spends only that ability after reload`);
  }
  const before = JSON.stringify(state);
  assert.throws(() => applyAction(state, 0, {...offers[1], via: String(offers[1].via).replace("permission-b", "missing-permission")}),
    `${kind}: a forged permission ability is refused`); checks += 1;
  eq(JSON.stringify(state), before, `${kind}: refusal does not spend a counter, move a card or change priority`);
}

{
  let state = start([at(0, "graveyard", "Smoke Relic"), at(0, "battlefield", "Smoke Archivist", "Smoke Archivist")]);
  const sources = state.zones.battlefield.filter(id => state.objects[id].card === "Smoke Archivist");
  const offers = legalActions(state, 0).filter(a => a.kind === "cast" && a.label === "Smoke Relic");
  eq(offers.map(a => a.via), sources, "two identical limited static permissions also remain separate choices");
  state = JSON.parse(JSON.stringify(state));
  applyAction(state, 0, offers[1]);
  eq(sources.map(id => usesThisTurn(state, id, "play-from:permission")), [0, 1], "the persisted action spends the chosen source's once-per-turn permission");
}

{
  const state = start([at(0, "graveyard", "Smoke Relic")]);
  for (const count of [1, undefined]) runEffect(state, {effect: "mayPlay", from: "graveyard", ...(count ? {count} : {})}, {controller: 0});
  const permits = state.effects.filter(e => e.rule === "may-play");
  const offers = legalActions(state, 0).filter(a => a.kind === "cast" && a.label === "Smoke Relic");
  eq(offers.map(a => a.via), permits.map(e => e.id), "the player can spend a limited permission even while an unlimited one is open");
  applyAction(state, 0, offers[0]);
  eq(state.effects.filter(e => e.rule === "may-play").map(e => e.id), [permits[1].id], "choosing the limited permission consumes it and leaves the unlimited permission");
}

{
  const state = start([at(0, "graveyard", "Smoke Relic")]);
  for (let n = 0; n < 2; n += 1) runEffect(state, {effect: "mayPlay", from: "graveyard"}, {controller: 0});
  eq(legalActions(state, 0).filter(a => a.kind === "cast" && a.label === "Smoke Relic").length, 1, "identical unlimited permissions still have the same outcome and need one offer");
}

console.log(`engine-load100-w3-graveyard: ${checks} checks passed`);
