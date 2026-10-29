/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 608.2h/707.10: departure-time spell copies; CR 707.8a: created double-faced token copies. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {play, index, at, compiled} from "./helpers/x11-keywords.mjs";
import {pushSpell, pushAbility, pushCopy, resolveTop} from "../game/engine/rules/stack.mjs";
import {rememberDepartingSpell} from "../game/engine/rules/spell-memory.mjs";
import {copySpell} from "../game/engine/script/effects/asking.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {incubate, copyPermanent, copyOnto, setState} from "../game/engine/script/effects/permanents.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {addObject} from "../game/engine/state/index.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";

let checks = 0;
const eq = (a, b, why) => { assert.deepEqual(a, b, why); checks += 1; };
const ok = (a, why) => { assert.ok(a, why); checks += 1; };
const throws = (f, pattern, why) => { assert.throws(f, pattern, why); checks += 1; };
const ctx = {controller: 0, source: null};
const tokens = (s) => s.zones.battlefield.filter((id) => s.objects[id].token);

/* The card's saved scenarios prove ordinary copies, no sacrifice, and copies after a counter removes the original. */
const plumb = JSON.parse(readFileSync(new URL("../game/engine/cards/p/plumb-the-forbidden.scenarios.json", import.meta.url)));
for (const scenario of plumb.scenarios) { runScenario(scenario, index.definition, plumb.fixtures); checks += 1; }

const memorySpell = {types: ["Sorcery"], manaCost: "{2}{R}", colors: ["R"], colorIdentity: ["R"],
  spell: {id: "memory", targets: [{what: "player"}], effects: [{effect: "loseLife", who: {target: 0}, amount: 1}]}};
function memoryState() {
  const s = play([at(0, "hand", "Memory Spell")], [], {seats: 3}, {"Memory Spell": memorySpell});
  const hand = s.zones.hand[0].find((id) => s.objects[id].card === "Memory Spell");
  const original = pushSpell(s, hand, {controller: 0, targets: [{kind: "player", id: 1}], x: 3, modes: [1]});
  const observer = pushAbility(s, {controller: 1, abilityId: "observer", name: "Copy observer",
    script: {effects: [{effect: "copySpell", spells: "that card"}]},
    about: {card: original.objectId, stackId: original.stackId}});
  return {s, original, about: observer.about, observer};
}
function copyRemembered(s, about, controller = 0) {
  const before = s.stack.length;
  copySpell.open(s, {spells: [about.card], count: 1}, {...ctx, controller, about});
  return s.stack.length > before ? s.stack.at(-1) : null;
}
{
  const {s, original, about} = memoryState();
  original.targets = [{kind: "player", id: 0}]; // A legal redirection after casting; the observer already exists.
  const departedObject = s.objects[original.objectId];
  const events = [];
  moveOne(s, original.objectId, "exile", events);
  const restored = JSON.parse(JSON.stringify(s));
  const restoredAbout = restored.stack.find((entry) => entry.about?.card === original.objectId).about;
  const restoredCopy = copyRemembered(restored, restoredAbout);
  eq([restoredCopy.targets, restoredCopy.x, restoredCopy.modes], [[{kind: "player", id: 0}], 3, [1]],
    "a stored and reloaded game retains departure-time values without JavaScript object aliases");
  const copy = copyRemembered(s, about);
  ok(copy, "a nontargeted reference still copies a spell returned or exiled from the stack");
  eq([copy.targets, copy.x, copy.modes], [[{kind: "player", id: 0}], 3, [1]], "latest targets, chosen X and modes survive departure");
  eq([s.objects[copy.objectId].manaCost, s.objects[copy.objectId].colors, s.objects[copy.objectId].spell],
    [memorySpell.manaCost, memorySpell.colors, memorySpell.spell], "the last spell's copiable values, not another card's, supply its copy");
  eq(s.objects[original.objectId], undefined, "the test copies an original that is actually gone");
  const frozen = structuredClone(about.spellLastKnown);
  copy.targets[0].id = 1; s.objects[copy.objectId].spell.effects[0].amount = 99;
  original.targets[0].id = 1; original.modes[0] = 0; departedObject.spell.effects[0].amount = 50;
  eq(about.spellLastKnown, frozen, "using or changing the copy never mutates the stored original");
  eq(about.spellLastKnown.values.counters, undefined, "only copiable characteristics, not counters or transient object state, are recorded");
  throws(() => pushCopy(s, original, {controller: 0}), /There is no spell there to copy/, "without explicit last-known source, a gone spell remains unavailable");
}
{
  const {s, original, about, observer} = memoryState();
  s.stack.splice(s.stack.indexOf(observer), 1); s.pendingTriggers.push({about});
  resolveTop(s);
  ok(about.spellLastKnown, "normal resolution records the spell before it leaves, for an already waiting trigger");
  eq(copyRemembered(s, about)?.name, "Memory Spell", "a spell that resolved is still available through its last known information");
}
{
  const {s, original, about} = memoryState();
  concede(s, 0);
  eq(s.objects[original.objectId], undefined, "the original's owner leaving removes their spell");
  ok(about.spellLastKnown, "another player's waiting copy ability remembers a spell before its owner leaves");
  const copy = copyRemembered(s, about, 1);
  eq([copy.name, copy.playerId], ["Memory Spell", 1], "the surviving player's copy ability can still create its own spell");
  resolveTop(s);
  eq([s.players[1].life, s.players[2].lost], [39, false], "the copied spell resolves in a continuing three-player game");
}
{
  const {s, original, about} = memoryState();
  about.spellLastKnown = {entry: structuredClone(original), values: {...memorySpell, card: "Wrong remembered card"}};
  const before = s.stack.length;
  eq(copyRemembered(s, about)?.name, "Memory Spell", "a live original takes precedence over stale recorded source values");
  eq(s.stack.length, before + 1, "the remembered and live reference cannot duplicate the same original");
  eq(pushCopy(s, original, {controller: 0, recordedSource: {...s.objects[original.objectId], card: "Wrong explicit source"}}).name,
    "Memory Spell", "pushCopy itself gives a live stack object precedence over an explicitly supplied old source");
  const wrong = {card: original.objectId, stackId: original.stackId + 50};
  s.pendingTriggers.push({about: wrong});
  rememberDepartingSpell(s, original);
  eq(wrong.spellLastKnown, undefined, "object id alone cannot bind an unrelated stack entry");
  const absent = {card: original.objectId + 500, stackId: original.stackId};
  s.pendingTriggers.push({about: absent});
  rememberDepartingSpell(s, original);
  eq(absent.spellLastKnown, undefined, "stack id alone cannot bind an unrelated object");
}
for (const keyword of ["disguise", "morph"]) {
  const hidden = compiled([{kind: "keyword", text: `${keyword} {G}`, keyword, cost: [{atom: "mana", cost: "{G}"}]}],
    {name: "Hidden Scholar", manaCost: "{4}{G}", colors: ["G"], colorIdentity: ["G"], power: 5, toughness: 5}).definition;
  hidden.preparation = {card: "Secret Prepare", types: ["Sorcery"], manaCost: "{G}", spell: {effects: []}};
  const s = play([at(0, "hand", "Hidden Scholar"), at(0, "battlefield", "Wastes", "Wastes", "Wastes")],
    [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}], {seats: 3}, {"Hidden Scholar": hidden});
  applyAction(s, 0, legalActions(s, 0).find((action) => action.kind === "cast" && action.disguise));
  const original = s.stack.at(-1);
  eq([original.faceDown, original.name, s.objects[original.objectId].power], [true, null, 2], "the source is a genuinely cast face-down spell");
  const observer = pushAbility(s, {controller: 1, abilityId: "hidden-observer", name: "Hidden copy observer",
    script: {effects: [{effect: "copySpell", spells: "that card"}]}, about: {card: original.objectId, stackId: original.stackId}});
  const liveCopy = pushCopy(s, original, {controller: 0});
  eq([s.objects[liveCopy.objectId].preparation, s.objects[liveCopy.objectId].colorIdentity], [undefined, []],
    "live face-down copies mask hidden preparation and color identity too");
  moveOne(s, original.objectId, "exile", []);
  const memory = observer.about.spellLastKnown;
  eq([memory.values.card, memory.values.power, memory.values.toughness, memory.values.colors ?? [], memory.values.colorIdentity],
    [null, 2, 2, [], []], "recorded face-down copiable values reveal no printed name, stats, colors or identity");
  eq([memory.values.preparation, memory.values.mdfc, memory.values.faceDownCard], [undefined, undefined, undefined],
    "the snapshot never includes the original's hidden faces or preparation definition");
  const copy = copyRemembered(s, observer.about), copyId = copy.objectId;
  eq([s.objects[copyId].card, s.objects[copyId].power, s.objects[copyId].toughness, characteristicsOf(s, copyId).keywords],
    [null, 2, 2, keyword === "disguise" ? ["Ward"] : []], "disguise keeps its ward; morph copies the plain nameless2/2 characteristics");
  eq([s.objects[copyId].preparation, s.objects[copyId].faceDownCard, s.objects[copyId].mdfc], [undefined, undefined, undefined],
    "the copied spell has no hidden preparation or printed faces");
  const resolved = resolveTop(s);
  const landed = resolved.find((event) => event.kind === "GameEventCardChangeZone" && event.data.fields.card.cardId === copyId)?.data.fields.becomes;
  ok(s.objects[landed]?.token && s.objects[landed].zone === "battlefield", "the copied creature spell resolves into its own token cleanly");
  eq([s.objects[landed].card, s.objects[landed].power, s.objects[landed].prepared], [null, 2, undefined],
    "the resulting nameless2/2 token never becomes prepared from the hidden card's definition");
  for (const viewer of [0, 1, 2]) {
    const visible = projectFor(s, viewer).players.flatMap((player) => player.zones.Battlefield.cards).find((card) => card.cardId === landed);
    ok(visible, "the copied token is present in the actual public projection");
    ok(!JSON.stringify(visible).includes("Hidden Scholar") && !JSON.stringify(visible).includes("Secret Prepare"),
      "no viewer sees the original printed name or preparation through the copied token");
  }
}
{
  const {s, original, about} = memoryState();
  const pending = {card: original.objectId, stackId: original.stackId};
  const delayed = {...pending}, resolving = {...pending}, queued = {...pending}, unrelatedQueue = {...pending};
  s.pendingTriggers.push({about: pending}); (s.delayedTriggers ??= []).push({about: delayed});
  s.resolving = {context: {about: resolving}, queue: [{effect: "__about", about: queued}, {effect: "scry", about: unrelatedQueue}], events: []};
  moveOne(s, original.objectId, "hand", []);
  for (const [label, remembered] of [["stack", about], ["pending", pending], ["delayed", delayed], ["resolution", resolving], ["queued", queued]]) {
    ok(copyRemembered(s, remembered), `a ${label} reference retains its departed original`);
    eq(remembered.spellLastKnown.reference.name, "Memory Spell", `${label}: the original's public card reference survives too`);
  }
  eq(s.resolving.events.at(-1).data.fields.original.name, "Memory Spell", "copy events still identify the original source card after departure");
  eq(unrelatedQueue.spellLastKnown, undefined, "ordinary effect parameters are not mistaken for saved resolution contexts");
  const snapshot = about.spellLastKnown;
  const before = s.stack.length;
  for (const entry of [{...snapshot.entry, objectId: snapshot.entry.objectId + 1}, {...snapshot.entry, stackId: snapshot.entry.stackId + 1}])
    copyRemembered(s, {...about, spellLastKnown: {...snapshot, entry}});
  copySpell.open(s, {spells: [about.card + 100], count: 1}, {...ctx, about});
  eq(s.stack.length, before, "unrelated snapshot identities and unrelated spell requests do not create copies");
}
{
  const {s, original, about} = memoryState();
  rememberDepartingSpell(s, {...original, kind: "ability"});
  eq(about.spellLastKnown, undefined, "an ability is not a spell whose characteristics can be recorded");
  s.objects[original.objectId].zone = "hand";
  rememberDepartingSpell(s, original);
  eq(about.spellLastKnown, undefined, "a card in another zone is not the stack spell's last known values");
  delete s.objects[original.objectId];
  rememberDepartingSpell(s, original);
  eq(about.spellLastKnown, undefined, "an already missing object supplies no invented snapshot");
}
{
  const s = play([]);
  incubate(s, {count: 2}, ctx);
  const original = tokens(s)[0];
  copyPermanent(s, {targets: [original], count: 1}, ctx);
  const copy = tokens(s).find((id) => id !== original);
  eq([s.objects[copy].mdfc?.front.card, s.objects[copy].mdfc?.back.card, s.objects[copy].face],
    ["Incubator", "Phyrexian Token", undefined], "a front-face Incubator copy has both token faces with its front up");
  eq(s.objects[copy].counters, {}, "the original's counters are not copiable");
  s.objects[copy].counters["+1/+1"] = 3;
  setState(s, {targets: [copy], transform: true}, ctx);
  eq([s.objects[copy].card, characteristicsOf(s, copy).power, s.objects[copy].counters["+1/+1"]],
    ["Phyrexian Token", 3, 3], "the token copy transforms as the same object and keeps its own counters");
  copyPermanent(s, {targets: [copy], count: 1}, ctx);
  const back = tokens(s).at(-1);
  eq([s.objects[back].card, s.objects[back].face, s.objects[back].mdfc?.front.card],
    ["Phyrexian Token", "back", "Incubator"], "a copy of the back-face token enters with that back face up");
  eq(s.objects[back].counters, {}, "a copied back face still does not copy counters");
  const physical = play([at(0, "battlefield", "Plain Relic")], [], {}, {"Plain Relic": {types: ["Artifact"]}});
  const relic = physical.zones.battlefield[0];
  const physicalSource = addObject(physical, {...structuredClone(s.objects[original]), owner: 0, controller: 0}, "battlefield");
  copyOnto(physical, relic, physicalSource);
  eq(physical.objects[relic].mdfc, undefined, "a physical single-faced permanent becoming a copy does not acquire another face");
}
{
  const s = play([at(0, "battlefield", "Ordinary Bear", "Plain Relic")], [], {}, {
    "Ordinary Bear": {types: ["Creature"], power: 2, toughness: 2}, "Plain Relic": {types: ["Artifact"]},
  });
  incubate(s, {count: 1}, ctx);
  const original = tokens(s)[0], bear = s.zones.battlefield.find((id) => s.objects[id].card === "Ordinary Bear");
  copyPermanent(s, {targets: [bear]}, ctx);
  eq(s.objects[tokens(s).at(-1)].mdfc, undefined, "ordinary created token copies do not acquire extra faces");
  copyOnto(s, original, bear);
  copyPermanent(s, {targets: [original]}, ctx);
  const copy = tokens(s).at(-1);
  eq([s.objects[copy].mdfc.front.card, s.objects[copy].mdfc.back.card], ["Ordinary Bear", "Ordinary Bear"],
    "a copy effect on a double-faced original modifies the copiable values of both created token faces");
  const other = play([]);
  incubate(other, {count: 1}, ctx);
  const id = tokens(other)[0];
  other.objects[id].merged = [{}];
  copyPermanent(other, {targets: [id]}, ctx);
  eq(other.objects[tokens(other).at(-1)].mdfc, undefined, "a merged permanent is not double-faced (CR 730.2i)");
  delete other.objects[id].merged; other.objects[id].faceDown = true;
  copyPermanent(other, {targets: [id]}, ctx);
  eq(other.objects[tokens(other).at(-1)].mdfc, undefined, "face-down characteristics do not expose hidden physical faces");
}
{
  const s = play([]);
  incubate(s, {count: 1}, ctx);
  const original = tokens(s)[0];
  copyPermanent(s, {targets: [original], except: {setPower: 4, setToughness: 4, addKeywords: ["Flying"]}}, ctx);
  const copy = tokens(s).at(-1);
  eq([s.objects[copy].mdfc.front.power, s.objects[copy].mdfc.back.power], [4, 4], "a token-copy exception changes both copiable faces");
  setState(s, {targets: [copy], transform: true}, ctx);
  eq([characteristicsOf(s, copy).power, characteristicsOf(s, copy).keywords.includes("Flying")], [4, true],
    "copy exceptions persist when the token transforms");
}
{
  const face = (card, types) => ({card, types, colors: [], manaCost: null, abilities: [], keywords: [], power: null, toughness: null});
  for (const [otherType, canTransform] of [["Land", true], ["Sorcery", false]]) {
    const front = face("Modal Front", ["Artifact"]), back = face("Modal Back", [otherType]);
    const s = play([at(0, "battlefield", "Modal Front")], [], {}, {"Modal Front": {...front, mdfc: {front, back}}});
    const original = s.zones.battlefield.find((id) => s.objects[id].card === "Modal Front");
    copyPermanent(s, {targets: [original]}, ctx);
    const copy = tokens(s).at(-1);
    ok(s.objects[copy].mdfc, "a created token copy preserves modal double-faced metadata too");
    beginResolution(s, [{effect: "setState", targets: [copy], transform: true}], ctx);
    ok(!s.resolving && !s.awaiting, "the transform instruction completes cleanly, including an ineligible opposite face");
    eq(s.objects[copy].card, canTransform ? "Modal Back" : "Modal Front", "only a permanent opposite face can be transformed into (CR 712.10)");
  }
}
{
  const s = play([at(0, "hand", "Goblin Glasswright // Craft with Pride")]);
  const card = s.zones.hand[0].find((id) => s.objects[id].preparation);
  const original = pushSpell(s, card, {controller: 0, permanent: true});
  const copy = pushCopy(s, original, {controller: 1});
  ok(s.objects[copy.objectId].preparation, "a copied permanent spell retains its preparation definition");
  ok(s.objects[copy.objectId].preparation !== s.objects[original.objectId].preparation, "the preparation definition is cloned, not shared mutable state");
  resolveTop(s);
  const landed = s.zones.battlefield.find((id) => s.objects[id].controller === 1 && s.objects[id].preparation);
  ok(s.objects[landed]?.prepared, "a copy of an enters-prepared permanent spell becomes prepared as it enters");
  eq([s.objects[s.objects[landed].preparedCopy]?.controller, s.objects[s.objects[landed].preparedCopy]?.zone],
    [1, "exile"], "the copied permanent creates its own preparation copy for its controller");
}
console.log(`engine-load100-tokens: ${checks} checks passed`);
