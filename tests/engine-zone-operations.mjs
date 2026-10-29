/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {addObject} from "../game/engine/state/index.mjs";
import {pushAbility, resolveTop} from "../game/engine/rules/stack.mjs";
import {awaitingChoice, resolveAwaiting, continueRuleOutcome, answerRuleForDeparted} from "../game/engine/rules/turn.mjs";
import {concede, gameOver} from "../game/engine/rules/sba.mjs";
import {beginRuleOperation, registerRuleOperation, askRuleOperation, emitRuleEvents} from "../game/engine/rules/operations.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {runResolution} from "../game/engine/script/resolution.mjs";
let checks = 0;
const eq = (a, b, message) => { assert.deepEqual(a, b, message); checks += 1; };
const definition = loadCardIndex().definition;
const fresh = () => runScenario({name: "Zone operation", seats: 3, setup: [], steps: []}, definition, {}).state;
const put = (s, name, owner, extra = {}) => addObject(s, {card: name, types: ["Creature"], power: 2, toughness: 2,
  owner, controller: owner, ...extra}, "battlefield");
function nested() {
  const s = fresh(), bear = put(s, "Subject", 1), ward = put(s, "Armor", 1, {types: ["Enchantment"], subtypes: ["Aura"], enchant: {what: "permanent"}}),
    shell = put(s, "Outer Armor", 1, {types: ["Enchantment"], subtypes: ["Aura"], enchant: {what: "permanent"}});
  for (const id of [ward, shell]) s.objects[id].abilities = [{id: "armor", kind: "static", rule: "umbra-armor", affects: {what: "permanent", attachedBy: "self"}}];
  s.objects[bear].attachments = [ward]; s.objects[ward].attachedTo = bear;
  s.objects[ward].attachments = [shell]; s.objects[shell].attachedTo = ward;
  s.objects[ward].counters.shield = 1; s.objects[bear].damage = 1;
  return {s, bear, ward, shell};
}
function start(s, target, prefix = []) {
  pushAbility(s, {controller: 0, abilityId: "destroy", script: {effects: [...prefix,
    {effect: "destroy", targets: [target]}, {effect: "gainLife", who: [0], amount: 5}]}});
  return resolveTop(s);
}
{
  let {s, bear, ward, shell} = nested();
  const first = start(s, bear);
  eq(s.awaiting?.kind, "rule-operation", "a nested destruction pauses its actual resolution caller");
  eq([s.objects[ward].zone, s.objects[ward].counters.shield, s.players[0].life, s.stack.length], ["battlefield", 1, 40, 1], "no later destruction, shield payment, spell finish or following effect happens before the answer");
  const waiting = JSON.stringify(s);
  eq(runResolution(s), {status: "waiting", events: []}, "polling the resolution API cannot run past its pending child");
  eq(JSON.stringify(s), waiting, "polling does not mutate the waiting caller or repeat its prefix");
  const choice = awaitingChoice(s), selected = choice.options.find(o => o.cardId === shell).index;
  s = JSON.parse(JSON.stringify(s));
  const last = resolveAwaiting(s, [selected]);
  eq([s.players[0].life, s.objects[ward].counters.shield, s.objects[bear].damage, s.stack.length], [45, 1, 0, 0], "the chosen nested replacement and following instruction run once after reload");
  eq(s.zones.graveyard[1].map(id => s.objects[id].card), ["Outer Armor"], "the nested Aura is destroyed while the original Aura survives");
  eq([...first, ...last].filter(e => e.kind === "GameEventUmbraArmor").length, 2, "prefix and child replacement events are journaled once each");
  eq(s.ruleOperation, undefined, "completed frames do not remain in saved state");
}
const replacement = (s, name, owner, to) => put(s, name, owner, {types: ["Enchantment"], abilities: [{id: "redirect", kind: "replacement", text: `Put it in ${to} instead`,
  watches: {event: "zone-change", from: "battlefield", to: "graveyard", filter: {what: "permanent", types: ["Creature"]}}, change: {to}}]});
{
  let s = fresh(); const body = put(s, "Commander", 0, {commander: true, controller: 2});
  replacement(s, "Exile Replacement", 1, "exile"); replacement(s, "Return Replacement", 1, "hand");
  start(s, body);
  eq([s.awaiting.player, s.objects[body].zone, s.players[0].life], [2, "battlefield", 40], "the affected permanent's controller orders the move before it happens");
  let q = awaitingChoice(s);
  resolveAwaiting(s, [q.options.find(o => o.label.includes("Return Replacement")).index]);
  eq([s.awaiting.player, s.objects[body].zone, s.players[0].life], [0, "battlefield", 40], "a newly applicable command-zone replacement belongs to the owner before the redirected move");
  s = JSON.parse(JSON.stringify(s)); q = awaitingChoice(s);
  resolveAwaiting(s, [q.options.find(o => o.label.includes("command zone")).index]);
  eq([s.zones.command[0].map(id => s.objects[id].card), s.zones.hand[0].some(id => s.objects[id].card === "Commander"), s.players[0].life], [["Commander"], false, 45], "the selected command-zone route and following instruction finish once");
}
{
  let {s, bear, ward} = nested(); start(s, bear); s = JSON.parse(JSON.stringify(s));
  concede(s, 1);
  eq([s.players[1].lost, s.players[0].life, s.stack.length, s.awaiting, s.ruleOperation], [true, 45, 0, null, undefined], "the public concession API resumes a surviving caller after its affected objects leave");
  eq([s.objects[bear], s.objects[ward]], [undefined, undefined], "resuming never resurrects departed objects");
}
{
  let {s, bear, ward} = nested();
  start(s, bear); s = JSON.parse(JSON.stringify(s)); concede(s, 0);
  eq([s.players[0].lost, s.stack.length, s.awaiting, s.ruleOperation], [true, 0, null, undefined], "the public concession API cancels a departed controller's remaining operation");
  eq([s.players[0].life, s.objects[ward].counters.shield, s.objects[ward].zone], [40, 1, "battlefield"], "cancellation neither performs the unchosen replacement nor runs the following effect");
}
{
  const {s, bear, shell} = nested(); start(s, bear);
  const before = awaitingChoice(s); concede(s, 2);
  eq(awaitingChoice(s), before, "an unrelated concession does not answer or replace the waiting player's question");
  resolveAwaiting(s, [before.options.find(o => o.cardId === shell).index]);
  eq(s.players[0].life, 45, "the original player can still complete the surviving operation");
}
for (const cancelling of [false, true]) {
  let {s, bear, shell} = nested();
  const observer = put(s, "Ajani's Pridemate", 2, definition("Ajani's Pridemate"));
  const prefix = start(s, bear, [{effect: "gainLife", who: [2], amount: 1}]);
  eq(s.players[2].life, 41, "the resolution's prefix happened before its question");
  s = JSON.parse(JSON.stringify(s));
  if (cancelling) concede(s, 0);
  else resolveAwaiting(s, [awaitingChoice(s).options.find(o => o.cardId === shell).index]);
  eq(s.stack.length, 1, "a surviving player's prefix trigger is collected once even when the resolving controller leaves");
  resolveTop(s);
  eq(s.objects[observer].counters["+1/+1"], 1, "that trigger's effect occurs once");
  eq(prefix.filter(e => e.kind === "GameEventPlayerLivesChanged").length, 1, "the prefix event was already journaled only once");
}
{
  const {s, bear} = nested(); start(s, bear); concede(s, 2); concede(s, 1);
  eq([Boolean(gameOver(s)), s.awaiting, s.ruleOperation, s.resolving], [true, null, undefined, null], "game end cancels the pending instruction without asking a winner to finish it");
  eq(s.players[0].life, 40, "the following instruction does not run after the game ends");
}
{
  let s = fresh(); const body = put(s, "Subject", 0);
  replacement(s, "Departing Replacement", 2, "exile"); replacement(s, "Surviving Replacement", 1, "hand");
  start(s, body); const old = awaitingChoice(s).options.find(o => o.label.includes("Departing Replacement")).index;
  concede(s, 2); s = JSON.parse(JSON.stringify(s));
  eq(s.awaiting, null, "a departure immediately rechecks the pending operation, leaving no choice when only one replacement remains");
  const before = JSON.stringify(s);
  assert.throws(() => resolveAwaiting(s, [old]), /not waiting/); checks += 1;
  eq(JSON.stringify(s), before, "a stale answer to the withdrawn question cannot change the resumed game");
  eq([s.zones.exile.length, s.zones.hand[0].some(id => s.objects[id].card === "Subject"), s.players[0].life], [0, true, 45], "an obsolete answer cannot apply a replacement whose source left; the sole remaining replacement applies");
}
{
  const {s, bear, shell} = nested(), damaged = put(s, "Already Lethally Damaged", 0);
  start(s, bear, [{effect: "dealDamage", targets: [damaged], amount: 2}]);
  concede(s, 2);
  eq(s.objects[damaged]?.zone, "battlefield", "an unrelated concession does not run state-based actions in the middle of the waiting resolution");
  resolveAwaiting(s, [awaitingChoice(s).options.find(o => o.cardId === shell).index]);
  eq(s.objects[damaged], undefined, "the delayed state-based action is checked when the resolution actually finishes");
}
/* Both owner finalizers receive all trigger events but return only the unreported journal suffix. These are contract
   tests for W2's entry roots; the actual entry caller is independently tested by that lane. */
registerRuleOperation("w3-finalizer-test", (state, frame) => {
  if (!frame.stage) {
    emitRuleEvents(state, runEffect(state, {effect: "gainLife", who: [2], amount: 1}, {controller: 0})); frame.stage = "answer";
  }
  if (!frame.answer) return askRuleOperation(state, frame, {player: 0, choice: {id: "owner-finalizer", title: "Continue", mode: "one", min: 1, max: 1, options: [{index: 0, label: "Continue"}]}});
  emitRuleEvents(state, runEffect(state, {effect: "gainLife", who: [2], amount: 1}, {controller: 0}));
  return {status: "done"};
});
for (const kind of ["after-action", "after-resolving"]) {
  let s = fresh(); const observer = put(s, "Ajani's Pridemate", 2, definition("Ajani's Pridemate"));
  const first = beginRuleOperation(s, {kind: "w3-finalizer-test"}, {after: {kind, player: 0}});
  s = JSON.parse(JSON.stringify(s)); const last = resolveAwaiting(s, [0]);
  eq([...first.events, ...last].filter(e => e.kind === "GameEventPlayerLivesChanged").length, 2, `${kind}: only two actual life events are journaled`);
  eq([s.awaiting?.kind, s.pendingTriggers.length], ["order-triggers", 2], `${kind}: both prefix and suffix triggers are collected once`);
  resolveAwaiting(s, [0, 1]); resolveTop(s); resolveTop(s);
  eq(s.objects[observer].counters["+1/+1"], 2, `${kind}: both actual trigger effects happen exactly once`);
}
{
  const s = fresh(), doomed = put(s, "Doomed at Finalization", 1); s.objects[doomed].damage = 2;
  beginRuleOperation(s, {kind: "w3-finalizer-test"}, {after: {kind: "after-resolving"}});
  const events = resolveAwaiting(s, [0]);
  eq(events.filter(e => e.kind === "GameEventCardChangeZone").length, 1, "the resolving owner's final state-based action is included once in the returned journal suffix");
  eq(s.objects[doomed], undefined, "the finalizer actually performs that delayed state-based action");
}
{
  const s = fresh(); beginRuleOperation(s, {kind: "w3-finalizer-test"}, {after: {kind: "after-action", player: 1}});
  resolveAwaiting(s, [0]); eq(s.priorityPlayer, 1, "an action's waiting owner receives priority when its complete instruction finishes");
}
{
  const {s, bear, shell} = nested(), doomed = put(s, "Other Target", 2);
  pushAbility(s, {controller: 0, abilityId: "remember-after-pause", script: {effects: [{effect: "destroy", targets: [doomed, bear], remember: true},
    {effect: "gainLife", who: [0], amount: {rememberedCount: true}}]}});
  resolveTop(s); resolveAwaiting(s, [awaitingChoice(s).options.find(o => o.cardId === shell).index]);
  eq([s.objects[doomed], s.players[0].life], [undefined, 41], "a paused destruction returns remembered IDs to the following resolution instruction");
}
{
  const {s, bear} = nested(), doomed = put(s, "Doomed after Cancellation", 2);
  start(s, bear, [{effect: "dealDamage", targets: [doomed], amount: 2}]); concede(s, 0);
  eq(s.objects[doomed], undefined, "when the resolving controller leaves, the surviving damaged permanent reaches the ordinary state-based check");
}
{
  const s = fresh(), prefix = [{kind: "test-journal-prefix"}];
  s.passes = 2; s.priorityPlayer = 2;
  eq(continueRuleOutcome(s, {status: "waiting", events: prefix, after: {kind: "after-action", player: 0}}), prefix, "a still-waiting root returns its suffix without finalizing an action");
  eq([s.passes, s.priorityPlayer], [2, 2], "waiting does not reset passes or restore an action owner's priority");
  eq(continueRuleOutcome(s, {status: "done", events: prefix, after: null}), prefix, "a standalone root returns its reported events");
  eq(answerRuleForDeparted(s), [], "a departure without an operation has no operation work");
  assert.throws(() => continueRuleOutcome(s, {status: "done", events: [], after: {kind: "unsupported"}}), /Unknown rule continuation/); checks += 1;
}
{
  let s = fresh(); const bodies = [2, 1].map(owner => {
    const id = put(s, `Protected ${owner}`, owner); s.objects[id].damage = 1; s.objects[id].counters.shield = 1;
    (s.effects ??= []).push({id: `regen-${owner}`, rule: "regeneration", affects: {ids: [id]}, until: "end-of-turn"}); return id;
  });
  pushAbility(s, {controller: 0, abilityId: "ordered-wipe", script: {effects: [{effect: "destroyAll", selector: {what: "permanent", types: ["Creature"]}}]}});
  resolveTop(s); eq(s.awaiting.player, 1, "simultaneous destruction replacement choices use APNAP order rather than object insertion order");
  resolveAwaiting(s, [awaitingChoice(s).options.find(o => o.label.toLowerCase().includes("shield")).index]);
  eq(s.awaiting.player, 2, "the next affected player makes their independent destruction choice");
  s = JSON.parse(JSON.stringify(s)); resolveAwaiting(s, [awaitingChoice(s).options.find(o => o.label.toLowerCase().includes("regenerat")).index]);
  eq(bodies.map(id => [s.objects[id].counters.shield, s.objects[id].tapped, s.objects[id].damage]), [[1, true, 0], [0, false, 1]], "each saved answer applies to its own permanent with its own payment");
}
for (const noRegenerate of [false, true]) {
  const s = fresh(), body = put(s, "Regenerating", 0);
  s.objects[body].damage = 1; (s.effects ??= []).push({id: "regeneration", rule: "regeneration", affects: {ids: [body]}, until: "end-of-turn"});
  pushAbility(s, {controller: 0, abilityId: "regeneration-test", script: {effects: [{effect: "destroy", targets: [body], noRegenerate}]}});
  resolveTop(s);
  eq(s.objects[body]?.zone ?? null, noRegenerate ? null : "battlefield", "the instruction's regeneration restriction is preserved");
  if (!noRegenerate) eq([s.objects[body].tapped, s.objects[body].damage], [true, 0], "the chosen regeneration performs its actual tap/damage changes");
}
{
  const s = fresh(), body = put(s, "Shielded", 0); s.objects[body].counters.shield = 1;
  start(s, body);
  eq([s.objects[body].zone, s.objects[body].counters.shield], ["battlefield", 0], "a sole shield replacement consumes exactly one shield");
}
{
  const {s, bear, shell, ward} = nested(); s.objects[shell].keywords = ["Indestructible"];
  start(s, bear); resolveAwaiting(s, [awaitingChoice(s).options.find(o => o.cardId === shell).index]);
  eq([s.objects[bear].zone, s.objects[ward].zone, s.objects[shell].zone, s.objects[ward].counters.shield],
    ["battlefield", "battlefield", "battlefield", 1], "an indestructible nested Aura can replace the destruction without being destroyed itself");
}
for (const effect of ["destroy", "destroyAll"]) {
  const s = fresh(), body = put(s, "Exiled Subject", 0); replacement(s, "Exile Replacement", 1, "exile");
  pushAbility(s, {controller: 0, abilityId: "remember-test", script: {effects: [
    {effect, targets: [body], selector: {what: "permanent", types: ["Creature"]}, remember: true},
    {effect: "gainLife", who: [0], amount: {movedCount: {types: ["Creature"]}}},
    {effect: "gainLife", who: [2], amount: {rememberedCount: true}},
  ]}}); resolveTop(s);
  eq([s.zones.exile.map(id => s.objects[id].card), s.players[0].life], [["Exiled Subject"], effect === "destroy" ? 40 : 41],
    "existing targeted-death and wipe-move remembering contracts survive a redirected destruction");
  eq(s.players[2].life, effect === "destroy" ? 40 : 41, "later instructions receive the actual remembered new object IDs");
}
{
  let s = fresh(); const card = put(s, "Commander", 0, {commander: true});
  put(s, "Return Command Replacement", 1, {types: ["Enchantment"], abilities: [{id: "redirect-command", kind: "replacement",
    watches: {event: "zone-change", from: "battlefield", to: "command", filter: {what: "permanent", types: ["Creature"]}}, change: {to: "library"}}]});
  beginRuleOperation(s, {kind: "move-one", id: card, to: "hand"}); resolveAwaiting(s, [0]);
  eq([s.awaiting.player, s.objects[card].zone], [0, "battlefield"], "command-zone replacement can apply again when a later replacement redirects back to library");
  s = JSON.parse(JSON.stringify(s)); resolveAwaiting(s, [0]);
  eq(s.zones.command[0].map(id => s.objects[id].card), ["Commander"], "the owner's repeated commander decision controls the actual final move");
}
{
  const s = fresh(), monument = put(s, "Eldrazi Monument", 0, definition("Eldrazi Monument")), body = put(s, "Protected Creature", 0);
  pushAbility(s, {controller: 0, abilityId: "wipe", script: {effects: [{effect: "destroyAll", selector: {what: "permanent"}}]}});
  resolveTop(s);
  eq([s.objects[monument], s.objects[body]?.zone], [undefined, "battlefield"], "a simultaneous wipe determines indestructibility before the granting source leaves");
}
{
  let s = fresh(); const body = put(s, "Commander", 0, {commander: true}); replacement(s, "Return Replacement", 1, "hand");
  start(s, body); s = JSON.parse(JSON.stringify(s)); resolveAwaiting(s, [1]);
  eq([s.zones.hand[0].some(id => s.objects[id].card === "Commander"), s.players[0].life], [true, 45], "the owner may decline command-zone replacement after another effect redirects the move");
}
{
  const s = fresh(), token = addObject(s, {card: "Departed Token", token: true, types: ["Creature"], owner: 0, controller: 0}, "exile");
  eq(beginRuleOperation(s, {kind: "move-one", id: token, to: "graveyard"}).result.moved, null, "a token outside the battlefield cannot move again");
}
{
  const s = fresh(), body = put(s, "Unearthed", 0); s.objects[body].exileIfLeaves = true;
  eq(beginRuleOperation(s, {kind: "move-one", id: body, to: "hand"}).result.proposal.to, "exile", "unearth's leave replacement remains active in an explicit move");
}
{
  const s = fresh(), card = addObject(s, {card: "Stay Here", types: ["Creature"], owner: 0, controller: 0}, "hand", 0);
  s.players[1].lost = true;
  eq(beginRuleOperation(s, {kind: "move-one", id: card, to: "battlefield", options: {controller: 1}}).result.moved, null,
    "a permanent cannot enter under a departed player's control");
  eq(s.objects[card].zone, "hand", "the refused entry leaves the card in its original zone");
}
{
  const s = fresh(), card = addObject(s, {card: "Original Artifact", types: ["Artifact"], owner: 0, controller: 0, loyalty: 3, spell: {effects: []}}, "hand", 0);
  put(s, "Hardened Scales", 0, definition("Hardened Scales"));
  /* A serialized checkpoint at W2's completed child seam. This proves W3 applies the patch to the NEW object before
     actual counter replacement arithmetic; W2 separately proves the entry choices that produce this result. */
  const out = beginRuleOperation(s, {kind: "move-one", id: card, to: "battlefield", stage: "after-enter",
    proposal: {event: "zone-change", objectId: card, from: "hand", to: "battlefield", player: 0},
    childResult: {entering: {tapped: true, counters: {"+1/+1": 2}, asks: []},
      objectPatch: {set: {card: "Copied Creature", types: ["Creature"], power: 4, toughness: 4}, remove: ["loyalty", "spell"]}}});
  eq([s.objects[card], s.objects[out.result.moved].types, s.objects[out.result.moved].counters["+1/+1"], s.objects[out.result.moved].tapped],
    [undefined, ["Creature"], 3, true], "the new copied creature receives the creature-only counter replacement before its arrival event");
  eq([s.objects[out.result.moved].loyalty, s.objects[out.result.moved].spell], [undefined, undefined], "copying removes characteristics absent from the selected object after reload-safe patching");
}
console.log(`engine-zone-operations: ${checks} checks passed`);
