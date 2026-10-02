/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 32 (THE CATALOG'S ORDER): WARD (CR 702.21a).
 *
 * "Whenever this permanent becomes the target of a spell or ability an opponent controls, counter it unless that
 * player pays [cost]." A permanent becomes a target as a spell is cast, an ability is activated, a trigger's targets
 * are chosen, or a copy's new target is chosen -- once per spell or ability however many of its targets name it, and
 * only an object (a player has no ward). Its controller's own spells do not trigger it. Ward counters the very spell or
 * ability, by its place on the stack. The cost may be mana, life (payable only by a player with that much, CR 119.4), a
 * card to discard, or a permanent of the payer's own to sacrifice.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {pushAbility, pushSpell, resolveTop} from "../game/engine/rules/stack.mjs";
import {askTriggerTargets} from "../game/engine/rules/trigger.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex, loadCardScripts} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const ANY = {anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]};
const BOLT = {card: "Bolt", types: ["Instant"], manaCost: "{R}", colors: ["R"],
  spell: {id: "s", text: "Bolt deals 3 damage to any target.", targets: [ANY], effects: [{effect: "dealDamage", amount: 3, targets: {target: 0}, who: {target: 0}}]}};
const TWIN = {card: "Twin Bolt", types: ["Instant"], manaCost: "{R}",
  spell: {id: "s", text: "Twin Bolt deals 1 damage to each of two targets.", targets: [ANY, ANY], effects: [{effect: "dealDamage", amount: 1, targets: {target: 0}, who: {target: 0}}, {effect: "dealDamage", amount: 1, targets: {target: 1}, who: {target: 1}}]}};
const ROD = {card: "Rod", types: ["Artifact"], abilities: [{id: "p", kind: "activated", text: "{T}: Rod deals 1 damage to any target.", cost: [{atom: "{T}"}], targets: [ANY],
  effects: [{effect: "dealDamage", amount: 1, targets: {target: 0}, who: {target: 0}}]}]};
const pod = {matchId: "m", seed: "ward", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const put = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
const at = (id) => ({kind: "object", id});
const castAt = (s, seat, name, targets) => applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "cast" && a.label === name && JSON.stringify(a.targets) === JSON.stringify(targets)));
const answer = (s, label) => resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === label).index]);

{
  /* The event: once per spell for each object it is aimed at; none for a player. */
  const s = main(table());
  const bear = put(s, {card: "Bear", types: ["Creature"], power: 2, toughness: 2}, 1);
  put(s, TWIN, 0, "hand");
  Object.assign(s.players[0].manaPool, {R: 1});
  const events = castAt(s, 0, "Twin Bolt", [at(bear), at(bear)]);
  const said = events.filter((e) => e.kind === "GameEventBecomesTarget");
  eq(said.map((e) => [e.data.fields.targetId, e.data.fields.by.playerId, e.data.fields.stackId === s.stack[0].stackId]), [[bear, 0, true]], "Twin Bolt at the Bear twice: the Bear becomes its target once, by Rob, for that stack entry");
  const t = main(table());
  put(t, BOLT, 0, "hand");
  Object.assign(t.players[0].manaPool, {R: 1});
  eq(castAt(t, 0, "Bolt", [{kind: "player", id: 1}]).some((e) => e.kind === "GameEventBecomesTarget"), false, "Bolt at Maya: a player becomes no such target");
}
{
  /* Ward {2}, not paid: the spell is countered. Paid: it resolves. The controller's own spell does not trigger it. */
  const s = main(table());
  const raptor = put(s, card("Hulking Raptor"), 1);
  put(s, BOLT, 0, "hand");
  Object.assign(s.players[0].manaPool, {R: 1});
  castAt(s, 0, "Bolt", [at(raptor)]);
  eq([s.stack.length, s.stack[1]?.kind, s.stack[1]?.playerId, s.stack[1]?.about?.stackId === s.stack[0].stackId], [2, "trigger", 1, true], "Rob's Bolt at Maya's Hulking Raptor: her ward triggers above it, about Bolt's stack entry");
  resolveTop(s);
  eq([s.awaiting.player, awaitingChoice(s).title, awaitingChoice(s).options.map((o) => o.label)], [0, "Hulking Raptor: pay {2}?", ["Don't pay"]], "Rob is asked to pay {2}; with nothing left he can only decline");
  answer(s, "Don't pay");
  eq([s.stack.length, s.zones.graveyard[0].map((id) => s.objects[id].card), Boolean(s.objects[raptor])], [0, ["Bolt"], true], "Bolt is countered: in Rob's graveyard, and the Raptor untouched");
  const v = main(table());
  put(v, card("Hulking Raptor"), 1);
  const bear = put(v, {card: "Bear", types: ["Creature"], power: 2, toughness: 2}, 1);
  put(v, BOLT, 0, "hand");
  Object.assign(v.players[0].manaPool, {R: 1});
  castAt(v, 0, "Bolt", [at(bear)]);
  eq(v.stack.length, 1, "Rob's Bolt at Maya's Bear: the Raptor's ward is about the Raptor only, and does not trigger");
  const t = main(table());
  const own = put(t, card("Hulking Raptor"), 0);
  put(t, BOLT, 0, "hand");
  Object.assign(t.players[0].manaPool, {R: 1});
  castAt(t, 0, "Bolt", [at(own)]);
  eq(t.stack.length, 1, "Rob's Bolt at his own Raptor: ward does not trigger (an opponent's only)");
  const u = main(table());
  const theirs = put(u, card("Hulking Raptor"), 1);
  put(u, BOLT, 0, "hand");
  for (let i = 0; i < 2; i += 1) put(u, WASTES, 0);
  Object.assign(u.players[0].manaPool, {R: 1});
  castAt(u, 0, "Bolt", [at(theirs)]);
  resolveTop(u);
  answer(u, "Pay {2}");
  eq([u.stack.length, u.stack[0]?.name, u.zones.battlefield.filter((id) => u.objects[id].card === "Wastes" && u.objects[id].tapped).length], [1, "Bolt", 2], "with two Wastes he pays {2}, tapping both: Bolt stays on the stack");
}
{
  /* An activated ability, and a trigger's targets: ward counters an ability as well. */
  const s = main(table());
  const raptor = put(s, card("Hulking Raptor"), 1);
  const rod = put(s, ROD, 0);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.objectId === rod && a.targets?.[0]?.id === raptor));
  eq([s.stack.length, s.stack[1]?.kind, s.stack[1]?.playerId], [2, "trigger", 1], "Rob's Rod aimed at the Raptor: ward triggers above the ability");
  resolveTop(s);
  answer(s, "Don't pay");
  eq([s.stack.length, s.objects[raptor].damage], [0, 0], "unpaid: the ability is countered -- gone from the stack, no damage dealt");
  const t = main(table());
  const target = put(t, card("Hulking Raptor"), 1);
  const entry = pushAbility(t, {sourceId: null, controller: 0, abilityId: "t", kind: "trigger", script: {targets: [ANY], effects: [{effect: "dealDamage", amount: 1, targets: {target: 0}, who: {target: 0}}]}});
  entry.stage = "targeting";
  t.priorityPlayer = null;
  askTriggerTargets(t);
  resolveAwaiting(t, [awaitingChoice(t).options.findIndex((o) => o.targets?.[0]?.id === target)]);
  eq(t.stack.map((e) => [e.kind, e.playerId]), [["trigger", 0], ["trigger", 1]], "a trigger of Rob's aimed at the Raptor as its targets are chosen: ward triggers above it");
  const w = main(table());
  const raptor2 = put(w, card("Hulking Raptor"), 1);
  const script = {targets: [ANY], effects: [{effect: "dealDamage", amount: 1, targets: {target: 0}, who: {target: 0}}]};
  for (const id of ["t1", "t2"]) pushAbility(w, {sourceId: null, controller: 0, abilityId: id, kind: "trigger", script}).stage = "targeting";
  w.priorityPlayer = null;
  askTriggerTargets(w);
  resolveAwaiting(w, [awaitingChoice(w).options.findIndex((o) => o.targets?.[0]?.id === raptor2)]);
  eq(w.awaiting?.kind, "trigger-targets", "two of Rob's triggers: the first aimed at the Raptor, and the second still asks for its targets");
  resolveAwaiting(w, [awaitingChoice(w).options.findIndex((o) => o.targets?.[0]?.kind === "player")]);
  eq(w.stack.filter((e) => e.playerId === 1).length, 1, "the ward triggered by the first is not lost while the second asked");
}
{
  /* A copy's new target becomes its target. */
  const s = main(table());
  const raptor = put(s, card("Hulking Raptor"), 1);
  const bolt = pushSpell(s, put(s, BOLT, 0, "hand"), {controller: 0, targets: [{kind: "player", id: 1}]});
  beginResolution(s, [{effect: "copySpell", spells: [bolt.objectId], newTargets: true}], {controller: 0, source: null});
  const {events} = (() => { const idx = awaitingChoice(s).options.find((o) => o.label === "Hulking Raptor").index; return {events: resolveAwaiting(s, [idx])}; })();
  const said = events.filter((e) => e.kind === "GameEventBecomesTarget");
  eq(said.map((e) => [e.data.fields.targetId, e.data.fields.by.playerId]), [[raptor, 0]], "the copy re-aimed at the Raptor: it becomes the copy's target");
}
{
  /* Other costs: life only when there is that much (CR 119.4); a sacrifice from the payer's own permanents. */
  const s = main(table());
  const sire = put(s, card("Sire of Seven Deaths"), 1);
  put(s, BOLT, 0, "hand");
  Object.assign(s.players[0].manaPool, {R: 1});
  s.players[0].life = 6;
  castAt(s, 0, "Bolt", [at(sire)]);
  resolveTop(s);
  eq(awaitingChoice(s).options.map((o) => o.label), ["Don't pay"], "Ward--Pay 7 life, and Rob at 6: he cannot pay");
  const t = main(table());
  const ripper = put(t, card("Vein Ripper"), 1);
  const robs = put(t, {card: "Bear", types: ["Creature"], power: 2, toughness: 2}, 0);
  put(t, {card: "Ogre", types: ["Creature"], power: 3, toughness: 3}, 1);
  put(t, BOLT, 0, "hand");
  Object.assign(t.players[0].manaPool, {R: 1});
  castAt(t, 0, "Bolt", [at(ripper)]);
  resolveTop(t);
  eq([awaitingChoice(t).title, awaitingChoice(t).options.map((o) => o.label)], ["Vein Ripper: sacrifice a creature?", ["Sacrifice Bear", "Don't pay"]], "Ward--Sacrifice a creature: Rob's Bear, not Maya's Ogre");
  answer(t, "Sacrifice Bear");
  eq([Boolean(t.objects[robs]), t.zones.graveyard[0].map((id) => t.objects[id].card), t.stack.map((e) => e.name)], [false, ["Bear"], ["Bolt", "Vein Ripper"]],
    "he sacrifices it: Bolt is not countered -- and the Bear's death triggers Vein Ripper above it");
}
{
  /* For Ratadrabik: a token copy "that's a 2/2 black Zombie in addition to its other colors and types". */
  const s = main(table());
  const knight = put(s, {card: "Knight", types: ["Creature"], subtypes: ["Human", "Knight"], colors: ["W"], power: 3, toughness: 3}, 0);
  beginResolution(s, [{effect: "copyPermanent", targets: [knight], except: {setPower: 2, setToughness: 2, addColors: ["B"], addSubtypes: ["Zombie"]}}], {controller: 0, source: null});
  const token = s.zones.battlefield.find((id) => id !== knight && s.objects[id].card === "Knight");
  eq([s.objects[token].colors, s.objects[token].subtypes, s.objects[token].power, s.objects[token].token], [["W", "B"], ["Human", "Knight", "Zombie"], 2, true], "white and black, a Human Knight Zombie, 2/2");
}
{
  /* The keyword's cost: what "unless" can ask. The catalog credits Ward. */
  const raptor = loadCardScripts().find(({script}) => script.identity.name === "Hulking Raptor").script;
  const ward = (cost) => {
    const script = structuredClone(raptor);
    script.abilities = script.abilities.map((a) => (a.keyword === "ward" ? {...a, cost} : a));
    return compileScript(script).problems.filter((p) => /ward cost/.test(p)).length;
  };
  eq([ward([{atom: "mana", cost: "{2}"}]), ward([{atom: "mana", cost: "{U}"}]), ward([])], [0, 1, 1], "Ward {2} compiles; Ward {U} (colored mana) and a ward with no cost are refused");
  eq(missingFor({keywords: ["Ward"]}), [], "a card with Ward misses nothing for it");
}

console.log(`engine-ward: ${checks} checks passed — a permanent becomes a target as a spell is cast, an ability activated, a trigger's or a copy's target chosen, once each; an opponent's spell or ability is countered unless its controller pays -- mana, life it has, a discard, a sacrifice of its own.`);
