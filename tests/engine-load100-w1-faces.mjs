/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Wave 0, CR 114 and 722: emblem objects and preparation characteristics, with behavior beyond their markers. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {canBlockAttacker} from "../game/engine/keywords/combat.mjs";
import {createToken, makeCopies, copyOnto, endCopies, emblem as makeEmblem} from "../game/engine/script/effects/permanents.mjs";
import {prepare, unprepare} from "../game/engine/script/effects/attributes.mjs";
import {addObject, moveObject, shownFaceDown} from "../game/engine/state/index.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {lastKnown, characteristicsOf} from "../game/engine/rules/layers.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {abstractBody, fillBody, templateOf} from "../game/engine/cards/sentences.mjs";

let checks = 0;
const eq = (actual, expected, why) => {assert.deepEqual(actual, expected, why); checks += 1;};
const index = loadCardIndex();
const read = (file) => JSON.parse(readFileSync(new URL(`../game/engine/cards/${file}`, import.meta.url), "utf8"));
const elspeth = read("e/elspeth-suns-champion.scenarios.json");
for (const scenario of elspeth.scenarios) runScenario(scenario, index.definition, elspeth.fixtures);
const {state} = runScenario(elspeth.scenarios.at(-1), index.definition, elspeth.fixtures);
const emblemIds = state.zones.command[0].filter((id) => state.objects[id]?.emblem === true);
eq(emblemIds.length, 1, "Elspeth creates an actual emblem in its controller's command zone (CR 114.1-2)");
const emblem = state.objects[emblemIds[0]];
eq([emblem.owner, emblem.controller, emblem.types, emblem.manaCost, emblem.colors ?? []], [0, 0, [], null, []],
  "the emblem belongs to its player and has no card characteristics (CR 114.2-3)");
eq(state.zones.battlefield.includes(emblemIds[0]), false, "an emblem is not a permanent (CR 114.5)");
const shown = projectFor(state, 1).players[0].zones.Command.cards.find((card) => card.emblem);
eq(shown.name, "Elspeth, Sun's Champion emblem", "opponents receive the real emblem object in the existing room view");
eq(shown.text, "Creatures you control get +2/+2 and have flying.", "the emblem displays its single printed Oracle sentence once");
const soldier = state.zones.battlefield.find((id) => state.objects[id].card === "Soldier");
const bear = state.zones.battlefield.find((id) => state.objects[id].card === "Bear");
eq(canBlockAttacker(state, bear, soldier), false, "the emblem's flying prevents a ground Bear from blocking its Soldier");
eq(state.effects.filter((effect) => effect.until === "ever").length, 0,
  "the emblem carries its lasting abilities instead of a second pair of anonymous continuous effects");

const pair = "Goblin Glasswright // Craft with Pride";
const preparedDefinition = index.definition(pair);
const start = (name, setup = []) => runScenario({name, setup, steps: [], expect: [], seats: 3}, index.definition).state;
const field = (s, object, seat = 0) => addObject(s, {...object, owner: seat, controller: seat}, "battlefield");
{
  const s = start("Genuinely repeated emblem abilities remain visible");
  const bear = field(s, {card: "Repeated Bear", types: ["Creature"], power: 2, toughness: 2});
  const ability = {id: "a0", kind: "static", text: "Creatures you control get +1/+1.", layer: 7, sublayer: "c",
    affects: {what: "permanent", types: ["Creature"], controller: "you"}, apply: {power: 1, toughness: 1}};
  makeEmblem(s, {abilities: [ability, {...ability, id: "a1"}]}, {controller: 0, source: null});
  const marker = projectFor(s, 1).players[0].zones.Command.cards.find((card) => card.emblem);
  eq(marker.text, `${ability.text}\n${ability.text}`, "the legacy fallback preserves genuinely repeated ability text");
  eq(characteristicsOf(s, bear).power, 4, "both genuine repeated abilities still apply");
}
{
  const original = read("e/elspeth-suns-champion.json");
  for (const invalid of ["", "  ", 42, []]) {
    const script = structuredClone(original);
    script.abilities[2].effects[0].text = invalid;
    eq(compileScript(script).problems.some((problem) => /emblem Oracle text/.test(problem)), true,
      "explicit emblem Oracle text must be a nonempty string");
  }
  const ability = original.abilities[2];
  const variantText = ability.text.replaceAll("+2/+2", "+3/+3");
  const filled = fillBody(abstractBody(ability, templateOf(ability.text, original.identity.name).slots, original.identity.name),
    templateOf(variantText, original.identity.name).slots, original.identity.name);
  const s = start("A shared emblem sentence fills its own printed text");
  const bear = field(s, {card: "Variant Bear", types: ["Creature"], power: 2, toughness: 2});
  makeEmblem(s, filled.effects[0], {controller: 0, source: null});
  eq(projectFor(s, 1).players[0].zones.Command.cards.find((card) => card.emblem).text,
    "Creatures you control get +3/+3 and have flying.", "the existing nested-text template fills the emblem's printed values");
  eq(characteristicsOf(s, bear).power, 5, "the filled emblem's displayed values agree with its actual effect");
}
const castInset = (s, permanent) => {
  const inset = s.objects[permanent].preparedCopy;
  const player = s.objects[permanent].controller;
  s.players[player].manaPool.R = 1;
  const action = legalActions(s, player).find((a) => a.kind === "cast" && a.objectId === inset);
  eq(Boolean(action), true, "a prepared copy's inset is a payable cast offered to its controller");
  applyAction(s, player, action);
  resolveTop(s);
  checkStateBasedActions(s);
  eq(s.objects[permanent].prepared, undefined, "casting the inset unprepares only its permanent");
  eq(s.zones.battlefield.filter((id) => s.objects[id].card === "Treasure").length, 1,
    "the copied inset actually resolves and creates its Treasure");
  eq(s.objects[inset], undefined, "the cast prepare copy ceases after leaving the stack");
};
for (const tapped of [false, true]) {
  const s = start("A literal preparation token enters prepared");
  createToken(s, {count: 1, tapped, token: {...preparedDefinition, name: "Goblin Glasswright"}}, {controller: 0, source: null});
  const token = s.zones.battlefield.find((id) => s.objects[id].token);
  eq(s.objects[token].tapped, tapped, "an explicit tapped entry does not skip the prepared replacement");
  eq(s.objects[token].prepared, true, "a preparation token applies its own enters-prepared replacement");
  castInset(s, token);
}
{
  const s = start("Prepared status is not copied");
  const source = field(s, preparedDefinition);
  s.objects[source].abilities = [];
  prepare(s, source);
  const originalInset = s.objects[source].preparedCopy;
  const [copy] = makeCopies(s, [source], {count: 1}, {controller: 0, source: null}, []);
  eq(s.objects[copy].prepared, undefined, "a copy with no enters-prepared replacement does not copy the designation");
  eq(s.objects[copy].preparedCopy, undefined, "a copy never shares the source's existing exile object");
  prepare(s, copy);
  eq(s.objects[copy].preparedCopy !== originalInset, true, "preparing the copy creates a distinct exile object");
  castInset(s, copy);
  eq(s.objects[source].prepared, true, "casting the copy's inset leaves the source prepared");
  eq(s.objects[originalInset].zone, "exile", "the source's independent inset remains in exile");
  unprepare(s, source);
  eq(s.objects[originalInset], undefined, "unpreparing removes that permanent's own unused inset");
}
{
  const s = start("A temporary copy loses and regains its inset");
  const host = field(s, preparedDefinition);
  const ordinary = field(s, {card: "Plain Bear", types: ["Creature"], power: 2, toughness: 2});
  copyOnto(s, host, ordinary, {until: "end-of-turn"});
  prepare(s, host);
  eq(s.zones.exile.length, 0, "a preparation card copying an ordinary creature cannot prepare without its inset");
  endCopies(s, "end-of-turn");
  prepare(s, host);
  eq(s.objects[host].prepared, true, "ending the copy restores the original prepare characteristics");
  castInset(s, host);
}
{
  const s = start("Becoming a copy is not entering");
  const source = field(s, preparedDefinition);
  prepare(s, source);
  const host = field(s, {card: "Copy Host", types: ["Creature"], power: 2, toughness: 2});
  copyOnto(s, host, source);
  eq(s.objects[host].prepared, undefined, "becoming a copy neither copies prepared state nor repeats entering");
  prepare(s, host);
  castInset(s, host);
}
{
  const s = start("A copy leaving removes its independent inset");
  const source = field(s, preparedDefinition);
  const [copy] = makeCopies(s, [source], {count: 1}, {controller: 0, source: null}, []);
  const inset = s.objects[copy].preparedCopy;
  moveObject(s, copy, "hand", 0);
  checkStateBasedActions(s);
  eq(s.objects[inset], undefined, "the token copy's prepared spell ceases when its permanent leaves");
}
{
  const s = start("A copy keeps its explicit name exception");
  const source = field(s, preparedDefinition);
  const [copy] = makeCopies(s, [source], {count: 1, except: {name: "Named Preparation Copy"}}, {controller: 0, source: null}, []);
  eq(s.objects[copy].card, "Named Preparation Copy", "alternative spell metadata cannot overwrite an explicit copy name");
  castInset(s, copy);
}
{
  const s = start("A different controller prepares its copy");
  const source = field(s, preparedDefinition);
  const [copy] = makeCopies(s, [source], {count: 1, controller: 1}, {controller: 0, source: null}, []);
  const inset = s.objects[copy].preparedCopy;
  eq([s.objects[inset].owner, s.objects[inset].controller], [1, 1], "the copy's controller owns the new prepare spell");
  s.players[0].manaPool.R = 1;
  eq(legalActions(s, 0).some((a) => a.kind === "cast" && a.objectId === inset), false, "even on their own turn, the source's controller cannot cast another player's prepared inset");
  s.activePlayer = 1;
  s.priorityPlayer = 1;
  castInset(s, copy);
}
{
  const s = start("The last known copy retains its inset");
  const source = field(s, preparedDefinition);
  const host = field(s, {card: "Mortal Copy Host", types: ["Creature"], power: 2, toughness: 2});
  copyOnto(s, host, source);
  const was = lastKnown(s, host);
  moveObject(s, host, "graveyard", 0);
  const [copy] = makeCopies(s, [{values: was.copiable}], {count: 1}, {controller: 0, source: null}, []);
  eq(s.objects[copy].prepared, true, "a departed copy's last known alternative characteristics prepare its token copy");
  castInset(s, copy);
}
{
  const s = start("A copied inset ignores exceptions to its creature");
  const source = field(s, preparedDefinition);
  const [copy] = makeCopies(s, [source], {count: 1, except: {setPower: 1, setToughness: 1, setColors: ["G"], setCreatureTypes: ["Frog"]}}, {controller: 0, source: null}, []);
  const inset = s.objects[s.objects[copy].preparedCopy];
  eq([s.objects[copy].power, s.objects[copy].colors, s.objects[copy].subtypes], [1, ["G"], ["Frog"]], "copy exceptions change the creature");
  eq([inset.types, inset.colors, inset.manaCost], [["Sorcery"], ["R"], "{R}"], "the inset keeps its own alternative characteristics (CR 722.3c)");
  castInset(s, copy);
}
{
  const s = start("A prepared copy can lose its inset characteristics");
  const source = field(s, preparedDefinition);
  prepare(s, source);
  const inset = s.objects[source].preparedCopy;
  const ordinary = field(s, {card: "Ordinary Copy", types: ["Creature"], power: 2, toughness: 2});
  copyOnto(s, source, ordinary);
  eq(s.objects[source].preparation, undefined, "the new creature has no alternative spell characteristics");
  eq(s.objects[inset].zone, "exile", "its existing prepare spell remains until it is unprepared or leaves");
  castInset(s, source);
}
{
  const s = start("Face-down copies do not expose their preparation");
  const source = field(s, shownFaceDown(preparedDefinition));
  const [copy] = makeCopies(s, [source], {count: 1}, {controller: 0, source: null}, []);
  prepare(s, copy);
  eq(s.objects[copy].preparation, undefined, "copying the face-down characteristics does not copy the hidden inset");
  eq(s.zones.exile.length, 0, "a face-down copy cannot create a hidden prepare spell");
}

console.log(`engine-load100-w1-faces: ${checks} checks passed`);
