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
import {afterResolving, passPriority} from "../game/engine/rules/priority.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {lastKnown, characteristicsOf, abilitiesOf} from "../game/engine/rules/layers.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {abstractBody, fillBody, templateOf} from "../game/engine/cards/sentences.mjs";

let checks = 0;
const eq = (actual, expected, why) => {assert.deepEqual(actual, expected, why); checks += 1;};
const index = loadCardIndex();
const read = (file) => JSON.parse(readFileSync(new URL(`../game/engine/cards/${file}`, import.meta.url), "utf8"));
const elspeth = read("e/elspeth-suns-champion.scenarios.json");
for (const scenario of elspeth.scenarios) runScenario(scenario, index.definition, elspeth.fixtures);
const {state} = runScenario(elspeth.scenarios.at(-1), index.definition, elspeth.fixtures);
const songScenarios = read("s/song-of-the-dryads.scenarios.json");
for (const scenario of songScenarios.scenarios) runScenario(scenario, index.definition, songScenarios.fixtures);
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

/* Generic permanent-inset grammar, without loading an undefined final card (CR 722.3c, 608.3f). */
{
  const script = read("g/goblin-glasswright-craft-with-pride.json");
  script.identity.name = "Inset Host // Inset Visionary";
  script.prepare = {identity: {name: "Inset Visionary", types: ["Creature"], subtypes: ["Elf"], manaCost: "{G}", colors: ["G"], power: 2, toughness: 3},
    oracleText: "When this creature enters, draw a card.", abilities: [{kind: "triggered", text: "When this creature enters, draw a card.",
      trigger: {on: "enters", who: "self"}, effects: [{effect: "draw", count: 1}]}]};
  const compiled = compileScript(script);
  eq(compiled.problems, [], "a permanent prepare spell is legal grammar, with its own entering ability");
  const resolver = (name) => name === script.identity.name ? compiled.definition : index.definition(name);
  const scenario = {name: "Public host cast, permanent inset cast, and entering trigger", seats: 3,
    setup: [{seat: 0, zone: "battlefield", cards: ["Mountain", "Wastes", "Forest"]},
      {seat: 0, zone: "hand", cards: [script.identity.name]}, {seat: 0, zone: "library", cards: ["Island"]}],
    steps: [{tap: "Mountain"}, {tap: "Wastes"}, {cast: "Inset Host"}, {resolve: true}], expect: []};
  let s = runScenario(scenario, resolver).state;
  const host = s.zones.battlefield.find((id) => s.objects[id].card === "Inset Host");
  const exile = s.objects[host].preparedCopy;
  eq([s.objects[exile].card, s.objects[exile].types, s.objects[exile].copy, s.objects[exile].token],
    ["Inset Visionary", ["Creature"], true, false], "the prepared inset is a card copy in exile with normal inset characteristics");
  s = JSON.parse(JSON.stringify(s));
  const forest = s.zones.battlefield.find((id) => s.objects[id].card === "Forest");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.objectId === forest));
  const offer = legalActions(s, 0).find((a) => a.kind === "cast" && a.objectId === exile);
  eq(Boolean(offer), true, "the reloaded permanent inset is offered with a payable cost");
  const castEvents = applyAction(s, 0, offer);
  const stackId = s.stack.at(-1).objectId;
  eq([s.objects[host].prepared, s.objects[host].preparedCopy, s.players[0].manaPool.G], [undefined, undefined, 0],
    "casting pays the inset's green cost and immediately unprepares its host");
  eq(castEvents.some((e) => e.kind === "GameEventCardAttribute" && e.data.fields.attribute === "prepared" && e.data.fields.value === false), true,
    "the public cast emits unprepared at cast time");
  s = JSON.parse(JSON.stringify(s));
  afterResolving(s, resolveTop(s));
  checkStateBasedActions(s);
  const permanent = s.zones.battlefield.find((id) => s.objects[id].card === "Inset Visionary");
  eq(Boolean(permanent), true, "the inset resolves to a permanent that survives state-based actions");
  eq([s.objects[permanent].token, s.objects[permanent].copy, s.objects[permanent].power, s.objects[permanent].toughness],
    [true, undefined, 2, 3], "the resolved copy becomes a token with its inset's own power and toughness");
  eq([s.objects[exile], s.objects[stackId]], [undefined, undefined], "each zone change replaces the old public object identity");
  eq(s.stack.at(-1)?.cardId, permanent, "the entering ability belongs to the arrived inset token");
  const drawn = s.zones.library[0][0], handBefore = s.zones.hand[0].length;
  const drawEvents = resolveTop(s);
  eq(s.zones.hand[0].length, handBefore + 1, "the inset token's actual entering trigger draws exactly one card");
  const draw = drawEvents.find((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.drawn)?.data.fields;
  eq([draw.card.cardId, draw.from.zoneType, draw.to.zoneType, s.zones.hand[0].includes(draw.drewAs)],
    [drawn, "Library", "Hand", true], "the actual draw event names the old library object and its new hand identity");
  const returned = moveObject(s, permanent, "hand", 0);
  checkStateBasedActions(s);
  eq(s.objects[returned], undefined, "the inset is a token and ceases after leaving the battlefield");
  const invalid = structuredClone(script);
  invalid.prepare.identity.types = ["Land"];
  invalid.prepare.abilities = [];
  invalid.prepare.oracleText = "";
  eq(compileScript(invalid).problems.some((problem) => /prepare spell.*land/i.test(problem)), true,
    "an inset that is a land cannot be cast as a prepare spell");
}

/* Setting a basic land type removes rules-text abilities, preserving external grants (CR 305.7). */
{
  let s = start("Song preserves earlier and later external grants", [
    {seat: 0, zone: "battlefield", cards: ["Forest", "Wastes", "Wastes"]},
    {seat: 0, zone: "hand", cards: ["Song of the Dryads"]}]);
  const host = field(s, {card: "Rules-text Host", types: ["Creature"], subtypes: ["Elf"], keywords: ["Flying"], power: 2, toughness: 2,
    abilities: [{id: "lord", kind: "static", layer: 7, sublayer: "c", affects: {types: ["Creature"], controller: "you"}, apply: {power: 1, toughness: 1}}, {id: "printed-red", kind: "mana", tapSelf: true, produces: {R: 1}}]});
  s.objects[host].counters = {vigilance: 1};
  const ally = field(s, {card: "Lord Companion", types: ["Creature"], power: 2, toughness: 2});
  const grant = (color, amount) => (s.effects ??= []).push({id: `grant-${color}`, timestamp: s.nextTimestamp++, layer: 6, affects: {ids: [host]},
    apply: {addKeywords: ["Haste"], addAbilities: [{id: `life-${color}`, kind: "activated", text: `{${color}}: You gain ${amount} life.`,
      cost: [{atom: "mana", cost: `{${color}}`}], effects: [{effect: "gainLife", amount}]}]}});
  grant("U", 2);
  for (const name of ["Forest", "Wastes", "Wastes"]) {
    const mana = legalActions(s, 0).find((a) => a.kind === "activate-mana" && s.objects[a.objectId].card === name);
    applyAction(s, 0, mana);
  }
  const song = legalActions(s, 0).find((a) => a.kind === "cast" && s.objects[a.objectId].card === "Song of the Dryads" && a.targets?.[0]?.id === host);
  applyAction(s, 0, song);
  afterResolving(s, resolveTop(s));
  s = JSON.parse(JSON.stringify(s));
  eq(abilitiesOf(s, host).some((a) => a.text === "{U}: You gain 2 life."), true,
    "Song leaves an ability granted before it resolved, independently of timestamps");
  eq(abilitiesOf(s, host).some((a) => a.id === "printed-red"), false, "the host's rules-text mana ability is lost");
  eq(characteristicsOf(s, host).keywords, ["Vigilance", "Haste"], "printed Flying is lost while a keyword counter and external Haste survive");
  eq(characteristicsOf(s, ally).power, 2, "the lost rules-text lord ability no longer pumps its other creature");
  grant("R", 3);
  for (const [color, amount] of [["U", 2], ["R", 3]]) {
    s.players[0].manaPool[color] = 1;
    const ability = legalActions(s, 0).find((a) => a.kind === "activate" && a.objectId === host && a.text === `{${color}}: You gain ${amount} life.`);
    eq(Boolean(ability), true, "the earlier and later grants each remain legal public activations");
    const life = s.players[0].life;
    applyAction(s, 0, ability);
    afterResolving(s, resolveTop(s));
    eq([s.players[0].life, s.players[0].manaPool[color]], [life + amount, 0], "each grant pays its own cost and gains its own life");
  }
  const forestMana = legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.objectId === host);
  eq(forestMana.length, 1, "the set Forest type gives exactly one intrinsic mana ability");
  applyAction(s, 0, forestMana[0]);
  eq(s.players[0].manaPool.G, 1, "the transformed permanent actually taps for green");
}

/* The same basic type rule applies without Song's definition, including a Forest set to Forest. */
for (const [types, subtypes, change, lost, mana] of [
  [["Land"], ["Forest"], {setSubtypes: ["Forest"]}, true, 1],
  [["Land"], ["Forest"], {addSubtypes: ["Island"]}, false, 1],
  [["Land"], ["Forest"], {setSubtypes: ["Locus"]}, false, 0],
  [["Creature"], [], {setSubtypes: ["Forest"]}, false, 0],
]) {
  const s = start("Generic land-type setting preserves the right abilities");
  const id = field(s, {card: "Land-type Host", types, subtypes, power: 2, toughness: 2, keywords: ["Flying"],
    abilities: [{id: "own", kind: "activated", cost: [], effects: [{effect: "gainLife", amount: 1}]}]});
  (s.effects ??= []).push({id: "type-setting", layer: 4, timestamp: s.nextTimestamp++, affects: {ids: [id]}, apply: change});
  eq(characteristicsOf(s, id).keywords.includes("Flying"), !lost, "rules-text keywords obey the same basic type rule");
  eq(abilitiesOf(s, id).some((a) => a.id === "own"), !lost, "only a set basic land type on a land removes rules-text abilities");
  eq(abilitiesOf(s, id).filter((a) => a.kind === "mana").length, mana, "intrinsic mana follows the new basic types even if the old type was the same");
}

/* The same generic object-rule emblem applies on opposing turns and a loaded stack (CR 114.4, 606.3). */
for (const controller of [0, 1]) {
  const emblemText = "You may activate loyalty abilities of planeswalkers you control on any player's turn any time you could cast an instant.";
  const script = (name, amount) => ({schema: "CrankCardScript@1", identity: {name, oracleId: `smoke-${name}`, types: ["Planeswalker"],
    subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], loyalty: amount === null ? 1 : 3}, source: "hand",
    oracleText: amount === null ? `-1: You get an emblem with \"${emblemText}\"` : `+1: You gain ${amount} life.`,
    abilities: [{kind: "activated", text: amount === null ? `-1: You get an emblem with \"${emblemText}\"` : `+1: You gain ${amount} life.`,
      cost: [{atom: "loyalty", amount: amount === null ? -1 : 1}], effects: amount === null
        ? [{effect: "emblem", text: emblemText, abilities: [{kind: "static", text: emblemText, rule: "loyalty-at-instant-speed",
          affects: {what: "permanent", types: ["Planeswalker"], controller: "you"}}]}]
        : [{effect: "gainLife", amount}]}]});
  const names = ["Smoke Timing Maker", "Smoke Life Walker", "Smoke Other Walker"];
  const defs = names.map((name, i) => compileScript(script(name, [null, 3, 5][i])));
  for (const def of defs) eq(def.problems, [], "generic emblem and loyalty fixtures use the existing grammar");
  const unsupported = script("Smoke Unsupported Emblem", null);
  unsupported.abilities[0].effects[0].abilities[0].rule = "untap-others";
  eq(compileScript(unsupported).problems.some((problem) => /command zone yet/.test(problem)), true,
    "unrelated object rules with specialized readers remain refused on an emblem");
  const resolver = (name) => names.includes(name) ? defs[names.indexOf(name)].definition : index.definition(name);
  const opponent = (controller + 1) % 3;
  let s = runScenario({name: "A publicly created emblem applies to current planeswalkers after its maker dies", seats: 3,
    setup: [{seat: controller, zone: "battlefield", cards: names}, {seat: opponent, zone: "battlefield", cards: ["Mountain", "Smoke Life Walker"]},
      {seat: opponent, zone: "hand", cards: ["Shock"]}],
    steps: [...(controller === 1 ? [{to: {turn: 2, phase: "MAIN1"}}] : []),
      {activate: "Smoke Timing Maker", seat: controller}, {resolve: true}, {to: {turn: controller + 2, phase: "UPKEEP"}},
      {tap: "Mountain", seat: opponent}, {cast: "Shock", seat: opponent, targets: [{player: controller}]}], expect: []}, resolver).state;
  const own = s.zones.battlefield.find((id) => s.objects[id].card === "Smoke Life Walker" && s.objects[id].controller === controller);
  const other = s.zones.battlefield.find((id) => s.objects[id].card === "Smoke Other Walker");
  const enemy = s.zones.battlefield.find((id) => s.objects[id].card === "Smoke Life Walker" && s.objects[id].controller === opponent);
  const marker = s.zones.command[controller].find((id) => s.objects[id].emblem === true);
  eq([s.objects[marker].owner, s.objects[marker].controller, s.objects[marker].zone], [controller, controller, "command"],
    "the actual ultimate creates a command-zone emblem owned and controlled by its player");
  eq(s.objects[marker].timestamp > s.objects[own].timestamp, true, "the emblem receives its actual creation timestamp after the existing walker");
  eq((s.effects ?? []).some((effect) => effect.rule === "loyalty-at-instant-speed"), false,
    "the permission comes from the actual emblem, without an anonymous lasting effect");
  eq(s.zones.graveyard[controller].some((id) => s.objects[id].card === "Smoke Timing Maker"), true,
    "the maker dies from its paid loyalty cost while its ability still creates the lasting emblem");
  eq([s.activePlayer, s.phase, s.stack.length], [opponent, "UPKEEP", 1], "the opponent's actual Shock remains on a nonempty stack outside a main phase");
  eq(legalActions(s, opponent).some((a) => a.kind === "activate" && a.objectId === enemy), false,
    "the other player's emblem gives the active opponent no loyalty timing permission");
  passPriority(s); passPriority(s);
  s = JSON.parse(JSON.stringify(s));
  const noMarker = structuredClone(s); noMarker.objects[marker].emblem = false;
  eq(legalActions(noMarker, controller).some((a) => a.kind === "activate" && a.objectId === own), false,
    "a card in the command zone with the same text is no emblem and grants no timing permission");
  const offer = legalActions(s, controller).find((a) => a.kind === "activate" && a.objectId === own);
  eq(Boolean(offer), true, "the reloaded emblem offers its controller a loyalty activation on the opponent's loaded stack");
  applyAction(s, controller, offer);
  eq(s.objects[own].counters.loyalty, 4, "the offered loyalty cost is paid on its actual source permanent");
  eq(s.stack.at(-1).cardId, own, "the new ability on the stack has the actual planeswalker's source identity");
  eq(legalActions(s, controller).some((a) => a.kind === "activate" && a.objectId === own), false,
    "instant timing does not waive the once-per-turn loyalty limit");
  const second = legalActions(s, controller).find((a) => a.kind === "activate" && a.objectId === other);
  eq(Boolean(second), true, "another current planeswalker still gets its independent once-per-turn activation");
  applyAction(s, controller, second);
  afterResolving(s, resolveTop(s)); afterResolving(s, resolveTop(s));
  eq([s.players[controller].life, s.stack.length], [48, 1], "both loyalty abilities actually gain their own life while the opponent's Shock remains pending");
  afterResolving(s, resolveTop(s));
  eq(s.players[controller].life, 46, "the original opponent spell then resolves against its chosen player");
}

console.log(`engine-load100-w1-faces: ${checks} checks passed`);
