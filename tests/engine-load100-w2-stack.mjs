/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Wave 0 stack regressions: counted targets, face-down exile, and the explicit wish-card refusal. */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {pushSpell, pushAbility, resolveTop} from "../game/engine/rules/stack.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {legalActions, applyAction, castChoicesNow} from "../game/engine/rules/actions.mjs";
import {memoryStorage} from "../game/engine/storage.mjs";
import {tableOn} from "../game/room/table.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {collectTriggers, openTriggers} from "../game/engine/rules/trigger.mjs";

let checks = 0;
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const ok = (a, m) => {assert.ok(a, m); checks += 1;};
const CREATURE = {what: "permanent", types: ["Creature"]};
const BEAR = {card: "Bear", types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", power: 2, toughness: 2};
const SHOT = {card: "Counted Shot", types: ["Instant"], manaCost: "{R}", spell: {id: "s0", text: "Destroy up to two target creatures.",
  targets: [{...CREATURE, count: {min: 0, max: 2}}], effects: [{effect: "destroy", targets: {target: 0}}]}};
function table() {
  const s = createState({matchId: "w2", seed: "w2", players: [{name: "Rob"}, {name: "Maya"}, {name: "Trey"}]});
  for (let p = 0; p < 3; p += 1) for (let n = 0; n < 12; n += 1) addObject(s, {...BEAR, owner: p, controller: p}, "library", p);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const bear = (s, name, p = 0) => addObject(s, {...BEAR, card: name, owner: p, controller: p}, "battlefield", p);
const spell = (s, targets) => pushSpell(s, addObject(s, {...SHOT, owner: 0, controller: 0}, "hand", 0), {controller: 0, targets});
const pick = (s, name) => awaitingChoice(s).options.find((o) => o.label === name || o.label.startsWith(`${name} (`)).index;
const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});

if (!process.argv[2] || process.argv[2] === "copyWard") {
  const s = table(), a = bear(s, "Alpha", 1);
  const original = spell(s, [[{kind: "object", id: a}]]);
  const outcome = beginResolution(s, [{effect: "copySpell", spells: [original.objectId]}], {controller: 0, source: null});
  eq(outcome.events.filter((e) => e.kind === "GameEventBecomesTarget").map((e) => [e.data.fields.targetId, e.data.fields.stackId]), [[a, s.stack[1].stackId]],
    "a copied spell also becomes a new targeting spell when it keeps its targets (ward, CR 702.21a)");
  const game = table(), raptor = addObject(game, {...index.definition("Hulking Raptor"), card: "Hulking Raptor", owner: 1, controller: 1}, "battlefield", 1);
  const live = spell(game, [[{kind: "object", id: raptor}]]);
  pushAbility(game, {controller: 0, abilityId: "copy", script: {effects: [{effect: "copySpell", spells: [live.objectId]}]}});
  collectTriggers(game, resolveTop(game)); openTriggers(game);
  eq(game.stack.length, 3, "the kept Raptor target's ward is put above the new copy");
  resolveTop(game);
  eq(awaitingChoice(game).options.map((o) => o.label), ["Don't pay"], "the copy's controller must answer ward with no mana available");
  resolveAwaiting(game, [0]);
  eq(game.stack.map((e) => [e.stackId, e.copy === true]), [[live.stackId, false]], "unpaid ward counters the new copy, leaving the original spell");
  const abilities = table(), protectedCreature = addObject(abilities, {...index.definition("Hulking Raptor"), card: "Hulking Raptor", owner: 1, controller: 1}, "battlefield", 1);
  const originalAbility = pushAbility(abilities, {controller: 0, abilityId: "original", script: SHOT.spell, targets: [[{kind: "object", id: protectedCreature}]]});
  pushAbility(abilities, {controller: 0, abilityId: "copy", script: {effects: [{effect: "copySpell", stack: [originalAbility.stackId]}]}});
  collectTriggers(abilities, resolveTop(abilities)); openTriggers(abilities);
  eq(abilities.stack.length, 3, "an ability copy that keeps its target triggers ward too");
  resolveTop(abilities); resolveAwaiting(abilities, [0]);
  eq(abilities.stack.map((e) => e.stackId), [originalAbility.stackId], "unpaid ward counters only the copied ability");
  const pair = table(), left = bear(pair, "Left", 1), right = bear(pair, "Right", 2), alternate = bear(pair, "Alternate");
  const twin = {...SHOT, spell: {...SHOT.spell, targets: [CREATURE, CREATURE]}};
  const twinSpell = pushSpell(pair, addObject(pair, {...twin, owner: 0, controller: 0}, "hand", 0), {controller: 0, targets: [{kind: "object", id: left}, {kind: "object", id: right}]});
  const opened = beginResolution(pair, [{effect: "copySpell", spells: [twinSpell.objectId], newTargets: true}], {controller: 0, source: null});
  eq(opened.events.filter((e) => e.kind === "GameEventBecomesTarget"), [], "a copy whose targets are being chosen has not targeted its provisional list");
  const first = resolveAwaiting(pair, [0]);
  eq(first.filter((e) => e.kind === "GameEventBecomesTarget"), [], "the first answer waits for the other target before targeting events");
  const last = resolveAwaiting(pair, [awaitingChoice(pair).options.find((o) => o.cardId === alternate).index]);
  eq(last.filter((e) => e.kind === "GameEventBecomesTarget").map((e) => e.data.fields.targetId), [left, alternate], "once final, scalar copy targets become targets exactly once, including the kept one");
}

if (!process.argv[2] || process.argv[2] === "copy") {
  const s = table(), a = bear(s, "Alpha"), b = bear(s, "Beta", 1), c = bear(s, "Gamma", 2);
  const original = spell(s, [[{kind: "object", id: a}, {kind: "object", id: b}]]);
  beginResolution(s, [{effect: "copySpell", spells: [original.objectId], newTargets: true}], {controller: 2, source: null});
  eq(s.awaiting?.effect, "copySpell", "a copied counted target asks its controller about new targets");
  eq(s.awaiting.player, 2, "the copy's controller chooses");
  const choice = awaitingChoice(s);
  eq([choice.mode, choice.min, choice.max], ["many", 2, 2], "the copy retains the original number of targets (CR 601.2c, 707.10c)");
  assert.throws(() => resolveAwaiting(s, [pick(s, "Gamma")]), /Invalid selection/); checks += 1;
  assert.throws(() => resolveAwaiting(s, [pick(s, "Alpha"), pick(s, "Alpha")]), /Invalid selection/); checks += 1;
  const targetEvents = resolveAwaiting(s, [pick(s, "Alpha"), pick(s, "Gamma")]);
  eq(targetEvents.filter((e) => e.kind === "GameEventBecomesTarget").map((e) => e.data.fields.targetId), [a, c], "the counted copy's final targets each become its target exactly once");
  eq(s.stack[1].targets, [[{kind: "object", id: a}, {kind: "object", id: c}]], "keep one target and choose another");
  eq(s.stack[0].targets, [[{kind: "object", id: a}, {kind: "object", id: b}]], "the original's list is unchanged");
  resolveTop(s);
  eq([s.objects[a]?.zone, s.objects[b]?.zone, s.objects[c]?.zone], [undefined, "battlefield", undefined], "the copy destroys exactly its newly selected list");
}
if (!process.argv[2] || process.argv[2] === "copy") {
  const s = table(); bear(s, "Alpha");
  const original = spell(s, [[]]);
  beginResolution(s, [{effect: "copySpell", spells: [original.objectId], newTargets: true}], {controller: 1, source: null});
  eq([s.awaiting, s.stack[1].targets], [null, [[]]], "a zero-target original gives its copy zero targets");
}
if (!process.argv[2] || process.argv[2] === "copy") {
  const s = table(), a = bear(s, "Alpha"), b = bear(s, "Beta", 1);
  const original = spell(s, [[{kind: "object", id: a}]]);
  s.objects[a].keywords = ["Shroud"];
  beginResolution(s, [{effect: "copySpell", spells: [original.objectId], newTargets: true}], {controller: 2, source: null});
  ok(awaitingChoice(s).options.some((o) => o.cardId === a), "an unchanged illegal target may be kept (CR 115.7d)");
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.cardId === a).index]);
  eq(s.stack[1].targets, [[{kind: "object", id: a}]], "keeping an illegal target preserves its identity");
  eq(s.objects[b].zone, "battlefield", "offering another target does not move it");
}
if (!process.argv[2] || process.argv[2] === "copy") {
  const s = table(), a = bear(s, "Alpha"), b = bear(s, "Beta", 1), c = bear(s, "Gamma", 2);
  const original = pushAbility(s, {sourceId: a, controller: 0, abilityId: "counted", script: SHOT.spell, targets: [[{kind: "object", id: b}]]});
  beginResolution(s, [{effect: "copySpell", stack: [original.stackId], newTargets: true, count: 2}], {controller: 2, source: null});
  eq(s.awaiting?.questions.length, 2, "each copied ability asks independently");
  resolveAwaiting(s, [pick(s, "Gamma")]);
  eq(s.awaiting?.effect, "copySpell", "the second copy still waits for its answer");
  const reloaded = JSON.parse(JSON.stringify(s));
  resolveAwaiting(reloaded, [pick(reloaded, "Alpha")]);
  eq(reloaded.stack.slice(1).map((e) => [e.cardId, e.targets]), [[a, [[{kind: "object", id: c}]]], [a, [[{kind: "object", id: a}]]]], "copied abilities retain their source and independent counted answers across reload");
}
if (!process.argv[2] || process.argv[2] === "copy") {
  const s = table(), a = bear(s, "Alpha"), b = bear(s, "Beta"), c = bear(s, "Gamma"), d = bear(s, "Delta");
  for (const id of [a, b]) s.objects[id].subtypes = ["Elf"];
  for (const id of [c, d]) s.objects[id].subtypes = ["Goblin"];
  const original = spell(s, [[{kind: "object", id: a}, {kind: "object", id: b}]]);
  s.objects[original.objectId].spell.targets[0].share = "creature type";
  beginResolution(s, [{effect: "copySpell", spells: [original.objectId], newTargets: true}], {controller: 0, source: null});
  assert.throws(() => resolveAwaiting(s, [pick(s, "Alpha"), pick(s, "Gamma")]), /new targets/); checks += 1;
  resolveAwaiting(s, [pick(s, "Gamma"), pick(s, "Delta")]);
  eq(s.stack[1].targets, [[{kind: "object", id: c}, {kind: "object", id: d}]], "a new group may share a different creature type from the original group");
}
if (!process.argv[2] || process.argv[2] === "distinct") {
  for (const reverse of [false, true]) {
    const s = table(), a = bear(s, "Alpha"), b = bear(s, "Beta"), c = bear(s, "Gamma");
    const specs = [{...CREATURE, count: {max: 2}}, CREATURE].map((spec, i) => ({...spec, ...((reverse ? i === 1 : i === 0) ? {distinctFrom: [1 - i]} : {})}));
    const original = pushSpell(s, addObject(s, {...SHOT, spell: {...SHOT.spell, targets: specs}, owner: 0, controller: 0}, "hand", 0),
      {controller: 0, targets: [[{kind: "object", id: a}], {kind: "object", id: b}]});
    beginResolution(s, [{effect: "copySpell", spells: [original.objectId], newTargets: true}], {controller: 0, source: null});
    ok(awaitingChoice(s).options.some((o) => o.cardId === b), "a target used by another original instance is available for a legal final-set change, in either direction");
    const swapped = JSON.parse(JSON.stringify(s));
    resolveAwaiting(swapped, [pick(swapped, "Beta")]);
    const beforeInvalid = hashState(swapped);
    assert.throws(() => resolveAwaiting(swapped, [0]), /not legal/); checks += 1;
    eq(hashState(swapped), beforeInvalid, "an invalid final duplicate preserves the question and every original target");
    resolveAwaiting(swapped, [pick(swapped, "Alpha")]);
    eq(swapped.stack[1].targets, [[{kind: "object", id: b}], {kind: "object", id: a}], "both instances may change together to a valid distinct final set");
    resolveAwaiting(s, [pick(s, "Gamma")]);
    resolveAwaiting(s, [0]);
    eq(s.stack[1].targets, [[{kind: "object", id: c}], {kind: "object", id: b}], "distinct instances retain their independently chosen targets");
  }
}
if (!process.argv[2] || process.argv[2] === "opponents") {
  const s = table(), a = bear(s, "Alpha"), b = bear(s, "Beta", 1), c = bear(s, "Gamma", 2); bear(s, "Delta");
  const original = spell(s, [[{kind: "object", id: b, forPlayer: 1}, {kind: "object", id: c, forPlayer: 2}]]);
  s.objects[original.objectId].spell.targets = [{...CREATURE, forEach: "opponent"}];
  beginResolution(s, [{effect: "copySpell", spells: [original.objectId], newTargets: true}], {controller: 1, source: null});
  assert.throws(() => resolveAwaiting(s, [pick(s, "Alpha"), pick(s, "Delta")]), /target restrictions/); checks += 1;
  resolveAwaiting(s, [pick(s, "Alpha"), pick(s, "Gamma")]);
  eq(s.stack[1].targets, [[{kind: "object", id: a, forPlayer: 0}, {kind: "object", id: c, forPlayer: 2}]], "a new opponent's creature retains the opponent it was chosen for under the copy's controller");
  resolveTop(s);
  eq([s.objects[a], s.objects[b]?.zone, s.objects[c]], [undefined, "battlefield", undefined], "each new opponent target stays legal as the copy resolves");
}
if (!process.argv[2] || process.argv[2] === "values") {
  const s = table(), a = bear(s, "Alpha"), b = bear(s, "Beta"), c = bear(s, "Gamma"), d = bear(s, "Delta");
  s.objects[a].manaCost = "{G}"; s.objects[d].manaCost = "{3}{G}";
  const original = spell(s, [[{kind: "object", id: a}, {kind: "object", id: b}]]);
  s.objects[original.objectId].spell.targets[0].differentManaValues = true;
  beginResolution(s, [{effect: "copySpell", spells: [original.objectId], newTargets: true}], {controller: 0, source: null});
  assert.throws(() => resolveAwaiting(s, [pick(s, "Beta"), pick(s, "Gamma")]), /different mana values/); checks += 1;
  resolveAwaiting(s, [pick(s, "Delta"), pick(s, "Gamma")]);
  eq(s.stack[1].targets, [[{kind: "object", id: d}, {kind: "object", id: c}]], "new counted targets still meet a different-mana-values restriction");
}
if (!process.argv[2] || process.argv[2] === "effect") {
  const s = table(), id = addObject(s, {...SHOT, owner: 0, controller: 0}, "exile"); bear(s, "Alpha"); bear(s, "Beta", 1);
  ok(castChoicesNow(s, 0, id).length > 0, "a free/effect cast with counted targets is offered");
  beginResolution(s, [{effect: "play", from: "exile", targets: [id], free: true}, {effect: "gainLife", who: "you", amount: 3}], {controller: 0, source: null});
  eq(s.awaiting?.effect, "play", "the effect asks whether to cast it");
  resolveAwaiting(s, [0]);
  eq([s.awaiting?.effect, awaitingChoice(s).mode, s.objects[id].zone, s.players[0].life], ["play", "many", "exile", 40], "targets are asked before the cast or the following effect");
  resolveAwaiting(s, []);
  eq([s.stack.at(-1)?.name, s.stack.at(-1)?.targets, s.players[0].life], [SHOT.card, [[]], 43], "zero targets is cast, then the containing resolution continues once");
}
if (!process.argv[2] || process.argv[2] === "effect") {
  const s = table(), a = bear(s, "Alpha"), id = addObject(s, {...SHOT, card: "Two questions", owner: 0, controller: 0,
    spell: {...SHOT.spell, targets: [...SHOT.spell.targets, {what: "player", count: {min: 0, max: 1}}], effects: [...SHOT.spell.effects, {effect: "loseLife", who: {target: 1}, amount: 2}]}}, "exile");
  beginResolution(s, [{effect: "play", from: "exile", targets: [id], free: true}, {effect: "gainLife", who: "you", amount: 1}], {controller: 0, source: null});
  resolveAwaiting(s, [0]);
  assert.throws(() => resolveAwaiting(s, [0, 0]), /Invalid selection/); checks += 1;
  resolveAwaiting(s, [pick(s, "Alpha")]);
  eq([s.awaiting.effect, s.objects[id].zone, awaitingChoice(s).options.length], ["play", "exile", 3], "a second counted instance asks its own target set without casting early");
  const reloaded = JSON.parse(JSON.stringify(s));
  resolveAwaiting(reloaded, [pick(reloaded, "Maya")]);
  eq([reloaded.stack.at(-1).targets, reloaded.players[0].life], [[[{kind: "object", id: a}], [{kind: "player", id: 1}]], 41], "the effect cast retains both answers across reload and resumes the containing effect once");
  resolveTop(reloaded);
  eq([reloaded.objects[a], reloaded.players[1].life], [undefined, 38], "both counted effect-cast target instances actually resolve");
  const landGame = table(), land = addObject(landGame, {...index.definition("Forest"), card: "Forest", owner: 0, controller: 0}, "exile");
  beginResolution(landGame, [{effect: "play", from: "exile", targets: [land], lands: true, free: true}], {controller: 0, source: null});
  resolveAwaiting(landGame, [0]);
  ok(landGame.zones.battlefield.some((id) => landGame.objects[id].card === "Forest"), "a land played by an effect still works with no spell target list");
}
if (!process.argv[2] || process.argv[2] === "wish") {
  for (const playtest of [false, true]) for (const name of ["Cunning Wish", "Extrapolate the Impossible"]) {
    const t = tableOn(memoryStorage(), {cards: (n) => ({...BEAR, card: n, supertypes: ["Legendary"]})});
    await t.create({tableId: "w2wishrefusal", host: "rob@example.com", hostName: "Rob", seats: [{kind: "ai"}], playtest});
    await assert.rejects(t.deck("rob@example.com", 0, {name: "Wish deck", commander: ["General"], cards: [name]}, Date.parse("2026-10-28T12:00:00Z")),
      (e) => e.status === 422 && e.message.includes(name) && /outside.*game/i.test(e.message) && /remove/i.test(e.message), "wish refusal names the card, reason, and removal instruction even if a lookup supplies it"); checks += 1;
  }
  const t = tableOn(memoryStorage(), {cards: (n) => ({...BEAR, card: n, supertypes: ["Legendary"]})});
  await t.create({tableId: "w2wishneighbor", host: "rob@example.com", hostName: "Rob", seats: [{kind: "ai"}]});
  await t.deck("rob@example.com", 0, {name: "A normal deck", commander: ["General"], cards: ["Cunning Wishful"]}, Date.parse("2026-10-28T12:00:00Z"));
  checks += 1;
}
if (!process.argv[2] || process.argv[2] === "faceDown") {
  const name = "Hidden Morph", fixtures = {[name]: {...BEAR, card: name, abilities: [{id: "morph", kind: "static", rule: "morph", cost: [{atom: "mana", cost: "{1}{G}"}]}]},
    Apprentice: {...BEAR, card: "Apprentice", subtypes: ["Wizard"]}};
  const s = runScenario({name: "Flameshape permits a face-down cast", setup: [at(0, "battlefield", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Apprentice"),
    at(0, "hand", "Gandalf, Goblins' Bane // Flameshape")], library: [name, "Forest"],
    steps: [{tap: "Mountain"}, {tap: "Mountain"}, {cast: "Flameshape"}, {resolve: true}, {tap: "Mountain"}, {tap: "Mountain"}, {tap: "Mountain"}]}, index.definition, fixtures).state;
  const secret = s.zones.exile.find((id) => s.objects[id].faceDownCard?.card === name), before = hashState(s);
  const offer = legalActions(s, 0).find((a) => a.kind === "cast" && a.objectId === secret && a.disguise);
  ok(offer, "a morph card exiled face down by Flameshape may be cast face down (CR 708.4)");
  eq(hashState(s), before, "weighing a face-down cast preserves the exiled card and permission");
  eq(legalActions(s, 1).filter((a) => a.objectId === secret), [], "the other seat gets no offer");
  const cannotLook = JSON.parse(JSON.stringify(s));
  cannotLook.activePlayer = 1; cannotLook.priorityPlayer = 1;
  cannotLook.players[1].manaPool = {C: 3};
  cannotLook.effects.filter((e) => e.rule === "may-play").forEach((e) => {e.player = 1; delete e.onlyIf;});
  eq(legalActions(cannotLook, 1).filter((a) => a.objectId === secret), [], "even a permission holder cannot cast a hidden card they may not look at");
  applyAction(s, 0, JSON.parse(JSON.stringify(offer)));
  const cast = s.stack.at(-1);
  eq([cast.name, s.objects[cast.objectId].faceDown, s.objects[cast.objectId].faceDownCard.card, s.players[0].manaPool.R ?? 0], [null, true, name, 0], "cast as the nameless face-down spell, paying {3} and retaining the real card privately");
  ok(!JSON.stringify(projectFor(s, 1)).includes(name), "the stack view hides the face-down spell's real name");
  resolveTop(s);
  const arrived = s.zones.battlefield.find((id) => s.objects[id].faceDownCard?.card === name);
  eq([s.objects[arrived]?.faceDown, s.objects[arrived]?.power, s.objects[arrived]?.toughness], [true, 2, 2], "the face-down cast resolves into a face-down permanent");
}
if (!process.argv[2] || process.argv[2] === "copyDivision") {
  let s = table();
  const a = bear(s, "Division Alpha", 1), b = bear(s, "Division Beta", 1), c = bear(s, "Division Gamma", 2);
  for (const id of [a, b, c]) s.objects[id].toughness = 10;
  s.objects[a].power = 3; s.objects[a].controller = 0;
  const id = addObject(s, {...index.definition("Monstrous Onslaught"), card: "Monstrous Onslaught", owner: 0, controller: 0}, "hand", 0);
  s.players[0].manaPool = {C: 3, G: 2};
  const offer = legalActions(s, 0).find(action => action.kind === "cast" && action.objectId === id);
  applyAction(s, 0, {...offer, targets: [[{kind: "object", id: a}, {kind: "object", id: b}]], division: [1, 2]});
  const originalStackId = s.stack.at(-1).stackId;
  beginResolution(s, [{effect: "copySpell", spells: [s.stack.at(-1).objectId], newTargets: true}], {controller: 2, source: null});
  s = JSON.parse(JSON.stringify(s));
  eq(awaitingChoice(s).title.includes("1 assigned"), true, "the first copied share is identified before its target is selected");
  const unchosen = hashState(s);
  for (const bad of [[], [0, 0]]) assert.throws(() => resolveAwaiting(s, bad), /Invalid selection/);
  checks += 2;
  eq(hashState(s), unchosen, "invalid positional selections do not consume a copied share");
  resolveAwaiting(s, [0]);
  eq(awaitingChoice(s).title.includes("2 assigned"), true, "the second copied share is identified independently");
  const choices = awaitingChoice(s);
  resolveAwaiting(s, [choices.options.find(option => option.cardId === c).index]);
  const original = s.stack.find(entry => entry.stackId === originalStackId), copy = s.stack.at(-1);
  eq(copy.division, {0: {[a]: 1, [c]: 2}}, "a copied divided spell retains announced amounts on its chosen target positions after reload");
  eq(original.division, {0: {[a]: 1, [b]: 2}}, "choosing new targets for the copy does not change the original division");
  resolveTop(s);
  eq([s.objects[a].damage, s.objects[b].damage, s.objects[c].damage], [1, 0, 2], "the copy deals its original 1 and 2 damage to its kept and newly chosen targets");

  for (const variant of ["swap", "swap-becomes-illegal", "illegal-kept", "both-new"]) {
    let game = table();
    const left = bear(game, "Divided Left", 0), right = bear(game, "Divided Right", 1), third = bear(game, "Divided Third", 2), fourth = bear(game, "Divided Fourth", 1);
    for (const target of [left, right, third, fourth]) game.objects[target].toughness = 10;
    game.objects[left].power = 3;
    const card = addObject(game, {...index.definition("Monstrous Onslaught"), card: "Monstrous Onslaught", owner: 0, controller: 0}, "hand", 0);
    game.players[0].manaPool = {C: 3, G: 2};
    const cast = legalActions(game, 0).find(action => action.kind === "cast" && action.objectId === card);
    applyAction(game, 0, {...cast, targets: [[{kind: "object", id: left}, {kind: "object", id: right}]], division: [1, 2]});
    if (variant === "illegal-kept") game.objects[left].keywords = ["Shroud"];
    beginResolution(game, [{effect: "copySpell", spells: [game.stack.at(-1).objectId], newTargets: true}], {controller: 2, source: null});
    const swapping = variant.startsWith("swap");
    const first = swapping ? right : variant === "both-new" ? third : left;
    const firstChoice = awaitingChoice(game);
    eq(firstChoice.mode, "one", `${variant}: a copied share is assigned to one target, not redistributed`);
    ok(first === left || firstChoice.options.some(option => option.cardId === first), `${variant}: the first legal replacement target is available`);
    resolveAwaiting(game, [first === left ? 0 : firstChoice.options.find(option => option.cardId === first).index]);
    eq(game.stack.at(-1).division, {0: {[left]: 1, [right]: 2}}, `${variant}: provisional target choice does not partially rewrite the division`);
    game = JSON.parse(JSON.stringify(game));
    const secondChoice = awaitingChoice(game), second = swapping ? left : variant === "both-new" ? fourth : third;
    if (variant === "swap") {
      const beforeDuplicate = hashState(game);
      assert.throws(() => resolveAwaiting(game, [0]), /Invalid selection/); checks += 1;
      eq(hashState(game), beforeDuplicate, "a duplicate final target is refused without consuming the second share");
    }
    if (variant === "illegal-kept") eq(secondChoice.options.some(option => option.cardId === left), false,
      "an illegal original target cannot be moved to the other announced share");
    ok(secondChoice.options.some(option => option.cardId === second), `${variant}: the second legal replacement target is available`);
    if (variant === "swap-becomes-illegal") {
      /* The live game can change during a question, for example when another player concedes (CR 104.3a, 800.4a).
         A previously selected new target is checked again; it is not a kept target merely because another share had it. */
      game.objects[right].keywords = ["Shroud"];
      const changedBoard = hashState(game);
      assert.throws(() => resolveAwaiting(game, [secondChoice.options.find(option => option.cardId === second).index]), /not legal/); checks += 1;
      eq(hashState(game), changedBoard, "a relocated original target that becomes illegal is refused without consuming the last choice");
      game.objects[right].keywords = [];
    }
    resolveAwaiting(game, [secondChoice.options.find(option => option.cardId === second).index]);
    eq(game.stack.at(-1).division, {0: {[first]: 1, [second]: 2}}, `${variant}: copied shares retain their positions across the second reload`);
    resolveTop(game);
    const expected = swapping ? [2, 1, 0, 0] : variant === "both-new" ? [0, 0, 1, 2] : [0, 0, 2, 0];
    eq([left, right, third, fourth].map(target => game.objects[target].damage), expected, `${variant}: only legal final targets receive their original shares`);
  }
}
if (!process.argv[2] || process.argv[2] === "copyJoint") {
  for (const countedFirst of [true, false]) {
    let s = table();
    const a = bear(s, "Joint Alpha"), b = bear(s, "Joint Beta"), c = bear(s, "Joint Gamma");
    const counted = {...CREATURE, controller: "you", count: {min: 0, max: 2}}, scalar = {...CREATURE, controller: "you", distinctFrom: [countedFirst ? 0 : 1]};
    const specs = countedFirst ? [counted, scalar] : [scalar, counted];
    const originalTargets = countedFirst ? [[{kind: "object", id: a}, {kind: "object", id: b}], {kind: "object", id: c}]
      : [{kind: "object", id: c}, [{kind: "object", id: a}, {kind: "object", id: b}]];
    const original = pushSpell(s, addObject(s, {...SHOT, spell: {...SHOT.spell, targets: specs}, owner: 0, controller: 0}, "hand", 0),
      {controller: 0, targets: originalTargets});
    const opened = beginResolution(s, [{effect: "copySpell", spells: [original.objectId], newTargets: true}], {controller: 0, source: null});
    ok(s.awaiting?.effect === "copySpell", "a legal joint final target set is offered instead of silently keeping all originals");
    eq(opened.events.filter(event => event.kind === "GameEventBecomesTarget"), [], "creating a provisional copy reports no target events");
    const first = resolveAwaiting(s, countedFirst ? [pick(s, "Joint Alpha"), pick(s, "Joint Gamma")] : [pick(s, "Joint Beta")]);
    eq(first.filter(event => event.kind === "GameEventBecomesTarget"), [], "a provisional target instance reports no target events");
    eq(s.stack[1].targets, originalTargets, "the first choice stays provisional until all instances have been answered");
    s = JSON.parse(JSON.stringify(s));
    const final = resolveAwaiting(s, countedFirst ? [pick(s, "Joint Beta")] : [pick(s, "Joint Alpha"), pick(s, "Joint Gamma")]);
    const desired = countedFirst ? [[{kind: "object", id: a}, {kind: "object", id: c}], {kind: "object", id: b}]
      : [{kind: "object", id: b}, [{kind: "object", id: a}, {kind: "object", id: c}]];
    eq(s.stack[1].targets, desired, "the final counted and scalar instances change together after reload");
    eq(final.filter(event => event.kind === "GameEventBecomesTarget").map(event => event.data.fields.targetId).sort((a,b) => a-b), [a,b,c],
      "the copy becomes targeting only once its complete legal final set is committed");
    eq(s.stack[0].targets, originalTargets, "the original spell's targets are unchanged");
  }
  {
    let s = table();
    const a = bear(s, "Cancel Alpha"), b = bear(s, "Cancel Beta"), c = bear(s, "Cancel Gamma");
    const specs = [{...CREATURE, count: {min: 0, max: 2}}, {...CREATURE, distinctFrom: [0]}];
    const targets = [[{kind: "object", id: a}, {kind: "object", id: b}], {kind: "object", id: c}];
    const original = pushSpell(s, addObject(s, {...SHOT, spell: {...SHOT.spell, targets: specs}, owner: 0, controller: 0}, "hand", 0), {controller: 0, targets});
    original.division = {0: {[a]: 1, [b]: 2}};
    beginResolution(s, [{effect: "copySpell", spells: [original.objectId], newTargets: true}], {controller: 0, source: null});
    resolveAwaiting(s, [0]);
    const partial = resolveAwaiting(s, [pick(s, "Cancel Gamma")]);
    eq(partial.filter(event => event.kind === "GameEventBecomesTarget"), [], "completed divided positions stay provisional while another target instance is pending");
    s = JSON.parse(JSON.stringify(s));
    ok(awaitingChoice(s).maySkip === true && awaitingChoice(s).title.includes("Cancel keeps original targets"), "the player can explicitly decline all provisional retargeting");
    const done = resolveAwaiting(s, undefined, null, null, {cancel: true});
    eq(s.stack[1].targets, targets, "canceling after a reloaded partial plan keeps every original target");
    eq(s.stack[1].division, {0: {[a]: 1, [b]: 2}}, "canceling also keeps every original divided share");
    eq(done.filter(event => event.kind === "GameEventBecomesTarget").map(event => event.data.fields.targetId), [a,b,c],
      "explicit cancellation reports the final original targets once, with no provisional ward events");
  }
  {
    let s = table();
    const a = bear(s, "Scalar Cancel Alpha"), b = bear(s, "Scalar Cancel Beta"), c = bear(s, "Scalar Cancel Gamma"), d = bear(s, "Scalar Cancel Delta");
    const targets = [{kind: "object", id: a}, [{kind: "object", id: b}], {kind: "object", id: c}];
    const original = pushSpell(s, addObject(s, {...SHOT, spell: {...SHOT.spell, targets: [CREATURE, {...CREATURE, count: {min: 0, max: 2}}, CREATURE]}, owner: 0, controller: 0}, "hand", 0), {controller: 0, targets});
    beginResolution(s, [{effect: "copySpell", spells: [original.objectId], newTargets: true}], {controller: 0, source: null});
    eq(resolveAwaiting(s, [pick(s, "Scalar Cancel Delta")]).filter(event => event.kind === "GameEventBecomesTarget"), [], "a scalar provisional answer has no targeting events");
    s = JSON.parse(JSON.stringify(s));
    const canceled = resolveAwaiting(s, undefined, null, null, {cancel: true});
    eq(s.stack[1].targets, targets, "canceling a reloaded scalar plan keeps all original target instances");
    eq(canceled.filter(event => event.kind === "GameEventBecomesTarget").map(event => event.data.fields.targetId), [a,b,c], "scalar cancellation reports original targets once without the provisional target");
    eq(s.awaiting, null, "canceling discards every remaining target-instance question for this copy");
  }
  {
    let s = table();
    const a = bear(s, "Recovery Alpha"), b = bear(s, "Recovery Beta");
    s.objects[a].power = 3;
    const card = addObject(s, {...index.definition("Monstrous Onslaught"), card: "Monstrous Onslaught", owner: 0, controller: 0}, "hand", 0);
    s.players[0].manaPool = {C: 3, G: 2};
    const cast = legalActions(s, 0).find(action => action.kind === "cast" && action.objectId === card);
    applyAction(s, 0, {...cast, targets: [[{kind: "object", id: a}, {kind: "object", id: b}]], division: [1, 2]});
    s.objects[a].keywords = ["Shroud"];
    beginResolution(s, [{effect: "copySpell", spells: [s.stack.at(-1).objectId], count: 2, newTargets: true}], {controller: 0, source: null});
    const copyId = s.awaiting.questions[0].stackId;
    const partial = resolveAwaiting(s, [pick(s, "Recovery Beta")]);
    eq(partial.filter(event => event.kind === "GameEventBecomesTarget"), [], "an incomplete copied division has no targeting events");
    s = JSON.parse(JSON.stringify(s));
    const invalid = hashState(s);
    assert.throws(() => resolveAwaiting(s, [0]), /Invalid selection/); checks += 1;
    eq(hashState(s), invalid, "a final duplicate is rejected without consuming the reloaded question");
    ok(awaitingChoice(s).maySkip && awaitingChoice(s).title.includes("Cancel keeps original targets"), "an invalid provisional route has an explicit recovery choice");
    const cancel = resolveAwaiting(s, undefined, null, null, {cancel: true});
    const copy = s.stack.find(entry => entry.stackId === copyId);
    eq(copy.targets, [[{kind: "object", id: a}, {kind: "object", id: b}]], "recovery keeps the unchanged illegal original and its other original target");
    eq(copy.division, {0: {[a]: 1, [b]: 2}}, "recovery restores both announced shares after reload");
    eq(cancel.filter(event => event.kind === "GameEventBecomesTarget").map(event => [event.data.fields.stackId,event.data.fields.targetId]), [[copyId,a],[copyId,b]],
      "canceling an incomplete divided group reports only that copy's original targets once");
    ok(s.awaiting.questions[0].stackId !== copyId, "canceling skips all remaining positions of this copy and continues the next copy");
    resolveAwaiting(s, [0]);
    s = JSON.parse(JSON.stringify(s));
    resolveAwaiting(s, [0]);
    eq(s.awaiting, null, "the next copy can complete normally after the first copy canceled");
  }
  {
    const s = table(), a = bear(s, "May Alpha"), b = bear(s, "May Beta");
    const original = spell(s, [{kind: "object", id: a}]);
    beginResolution(s, [{effect: "changeTargets", spells: [original.objectId], may: true}], {controller: 0, source: null});
    eq(awaitingChoice(s).maySkip ?? false, false, "noncopy target changes keep their existing explicit keep-target choice");
    resolveAwaiting(s, [0]);
    eq(original.targets, [{kind: "object", id: a}], "keeping a noncopy target remains explicit");
  }
  {
    const s = table(), a = bear(s, "Mandatory Alpha"), b = bear(s, "Mandatory Beta");
    const original = spell(s, [[{kind: "object", id: a}]]);
    beginResolution(s, [{effect: "changeTargets", spells: [original.objectId]}], {controller: 0, source: null});
    eq(awaitingChoice(s).maySkip ?? false, false, "mandatory target changes do not gain cancellation");
    const unchanged = hashState(s);
    assert.throws(() => resolveAwaiting(s, undefined, null, null, {cancel: true}), /Invalid selection/); checks += 1;
    eq(hashState(s), unchanged, "attempting to cancel a mandatory target change does not change state");
    resolveAwaiting(s, [pick(s, "Mandatory Beta")]);
  }
}
console.log(`engine-load100-w2-stack: ${checks} checks passed`);
