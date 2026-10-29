/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {addObject} from "../game/engine/state/index.mjs";
import {beginRuleOperation} from "../game/engine/rules/operations.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {keywordsOf, controllerOf} from "../game/engine/rules/layers.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {pushAbility, pushSpell, resolveTop} from "../game/engine/rules/stack.mjs";
import {zoneEffectFrame} from "../game/engine/rules/zone-operation.mjs";
import {createRng} from "../game/engine/rng.mjs";
let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const definition = loadCardIndex().definition;
const fresh = () => runScenario({name: "Zone action continuation", seats: 3, setup: [], steps: []}, definition, {}).state;
const put = (s, card, owner, zone = "battlefield", extra = {}) => addObject(s, {card, owner, controller: owner,
  types: ["Creature"], power: 2, toughness: 2, ...extra}, zone, ["hand", "library", "graveyard"].includes(zone) ? owner : null);
const redirect = (s, name, owner, from, to) => put(s, name, owner, "battlefield", {types: ["Enchantment"], abilities: [{id: "redirect", kind: "replacement",
  watches: {event: "zone-change", from, to: "graveyard", filter: {what: "card", zone: from}}, change: {to}}]});
{
  let s = fresh(); s.players[0].landAllowance = 3;
  const observer = put(s, "Ajani's Pridemate", 2, "battlefield", definition("Ajani's Pridemate"));
  const lands = ["Breeding Pool", "Forest"].map(card => put(s, card, 0, "hand", definition(card)));
  pushAbility(s, {controller: 0, abilityId: "play-lands", script: {effects: [{effect: "gainLife", who: [2], amount: 1},
    {effect: "play", from: "targets", targets: lands, who: [0], lands: true, free: true, anyNumber: true}, {effect: "gainLife", who: [0], amount: 3},
    {effect: "rollDie", sides: 6}, {effect: "gainLife", who: [0], amount: {dieRolled: true}}]}});
  const first = resolveTop(s); let choice = awaitingChoice(s);
  const second = resolveAwaiting(s, [choice.options.find(o => o.label.includes("Breeding Pool")).index]);
  eq([s.awaiting?.kind, s.objects[lands[0]].zone, s.players[0].life, s.objects[lands[1]].zone], ["rule-operation", "hand", 40, "hand"], "a real effect-play answer hands into pre-entry without clearing the new question, replaying the land or running its splice");
  s = JSON.parse(JSON.stringify(s)); choice = awaitingChoice(s);
  const third = resolveAwaiting(s, [choice.options.find(o => o.label.includes("Pay 2")).index]);
  eq([s.awaiting?.kind, s.players[0].life, s.zones.battlefield.filter(id => s.objects[id].card === "Breeding Pool").length], ["effect-choice", 38, 1], "the entered land pays its actual life cost before the any-number play splice asks again");
  s = JSON.parse(JSON.stringify(s)); choice = awaitingChoice(s);
  const expectedRoll = createRng("w3-effect-play").int(6) + 1;
  const last = resolveAwaiting(s, [choice.options.find(o => o.label.includes("Forest")).index], null, createRng("w3-effect-play"));
  eq([s.players[0].life, s.players[0].landsPlayed, s.stack.map(entry => entry.kind)], [41 + expectedRoll, 2, ["trigger"]], "both lands complete once before the original following instruction and grouped prefix trigger");
  eq(last.filter(e => e.kind === "GameEventDieRolled").map(e => e.data.fields.result), [expectedRoll], "the actual deferred-operation boundary forwards the caller's random stream to one following roll");
  eq([...first, ...second, ...third, ...last].filter(e => e.kind === "GameEventCardChangeZone" && e.data.fields.to.zoneType === "Battlefield").length, 2, "nested play/entry questions report exactly two actual land arrivals");
  resolveTop(s); eq(s.objects[observer].counters["+1/+1"], 1, "the original prefix's surviving trigger actually resolves once after both effect-play lands");
}
{
  let s = fresh(); put(s, "Entry Elf", 0, "battlefield", {subtypes: ["Elf"]});
  const front = {card: "Before Transform", types: ["Artifact", "Planeswalker"], loyalty: 11}, back = {...definition("Metallic Mimic"), card: "After Transform"};
  const card = put(s, front.card, 0, "hand", {...front, mdfc: {transforming: true, front, back}});
  beginRuleOperation(s, {kind: "move-one", id: card, to: "battlefield", options: {transformed: true}});
  eq([s.awaiting?.kind, s.objects[card]?.zone], ["rule-operation", "hand"], "the real transformed entrant asks using its back-face ability before moving");
  const face = s.ruleOperation.frames.at(-1).entryFace;
  eq([face.set.power, face.remove.includes("loyalty"), face.set.id], [2, true, undefined], "the preview gets the back face's full copiable values and absent-field removals without object identity");
  s = JSON.parse(JSON.stringify(s)); resolveAwaiting(s, [awaitingChoice(s).options.find(o => o.label === "Elf").index]);
  const moved = s.zones.battlefield.find(id => s.objects[id].card === "After Transform");
  eq([s.objects[card], s.objects[moved].chosen, s.objects[moved].types, s.objects[moved].loyalty], [undefined, "Elf", ["Artifact", "Creature"], undefined], "the transformed move allocates one actual back-face permanent with the prior chosen replacement applied");
}
{
  let s = fresh(); const bodies = [put(s, "First Payment", 0), put(s, "Second Payment", 0)];
  redirect(s, "Exile Replacement", 2, "battlefield", "exile"); redirect(s, "Return Replacement", 2, "battlefield", "hand");
  pushAbility(s, {controller: 0, abilityId: "remember-sacrifices", script: {effects: [{effect: "moveZone", targets: bodies, sacrifice: true, remember: true},
    {effect: "gainLife", who: [0], amount: {rememberedCount: true}}, {effect: "gainLife", who: [1], amount: {rememberedCount: true, controlledBy: "most"}},
    {effect: "gainLife", who: [2], amount: {movedCount: {types: ["Creature"]}}}]}});
  const first = resolveTop(s), middle = resolveAwaiting(s, [awaitingChoice(s).options.find(o => o.label.includes("Exile Replacement")).index]);
  eq([s.awaiting?.kind, s.players[0].life, s.objects[bodies[1]].zone], ["rule-operation", 40, "battlefield"], "the literal sacrifice instruction saves its next target and downstream remembering while the next payment waits");
  eq(s.ruleOperation.events.filter(e => e.data?.fields?.sacrificed === true).length, 1, "the saved operation retains one prefix payment while the same resolution is still waiting");
  s = JSON.parse(JSON.stringify(s)); const last = resolveAwaiting(s, [awaitingChoice(s).options.find(o => o.label.includes("Return Replacement")).index]);
  eq([s.players.map(p => p.life), s.players[0].sacrificedNontokenThisTurn], [[42, 42, 40], 2], "the actual resumed caller receives new remembered IDs/controllers while movedWas retains its existing graveyard-only contract");
  eq([...first, ...middle, ...last].filter(e => e.data?.fields?.sacrificed === true).length, 2, "two actual successful payments are reported once each across both questions");
}
{
  const s = fresh(), body = put(s, "Revealed Sacrifice", 0);
  pushAbility(s, {controller: 0, abilityId: "advanced-sacrifice", script: {effects: [{effect: "moveZone", targets: [body], sacrifice: true, reveal: true}]}});
  eq(resolveTop(s).filter(e => e.kind === "GameEventCardRevealed").length, 1, "unsupported modifiers keep their established implementation instead of being silently dropped by the bounded consumer");
  for (const effect of [{effect: "gainLife", amount: 1}, {effect: "moveZone", targets: [body]}, {effect: "moveZone", sacrifice: true}])
    eq(zoneEffectFrame(effect, {}), null, "only the declared literal-target sacrifice grammar creates this operation frame");
}
for (const cancelling of [false, true]) {
  let s = fresh(); const observer = put(s, "Ajani's Pridemate", 2, "battlefield", definition("Ajani's Pridemate"));
  put(s, "Entry Elf", 0, "battlefield", {subtypes: ["Elf"]});
  const spell = put(s, "Mimic with Script", 0, "hand", {...definition("Metallic Mimic"), card: "Mimic with Script",
    spell: {effects: [{effect: "gainLife", who: [2], amount: 1}, {effect: "scry", who: [0], count: 1}]}});
  pushSpell(s, spell, {controller: 0, permanent: true}); const first = resolveTop(s);
  eq([s.awaiting?.kind, s.players[2].life], ["effect-choice", 41], "the actual permanent spell's script pauses after its life event");
  s = JSON.parse(JSON.stringify(s)); const middle = resolveAwaiting(s, [0]);
  eq([s.awaiting?.kind, s.stack.length, s.priorityPlayer], ["rule-operation", 1, null], "finishing the script hands directly into the real pre-entry question without priority");
  s = JSON.parse(JSON.stringify(s)); const last = cancelling ? concede(s, 0) : resolveAwaiting(s, [awaitingChoice(s).options.find(o => o.label === "Elf").index]);
  eq(s.stack.map(entry => entry.kind), ["trigger"], "the completed script's prefix trigger survives the new entry operation exactly once");
  eq([...first, ...middle, ...last].filter(e => e.kind === "GameEventPlayerLivesChanged" && e.data.fields.player.playerId === 2).length, 1, "transitioning between resolution and entry journals the surviving player's old prefix once");
  resolveTop(s); eq(s.objects[observer].counters["+1/+1"], 1, "the preserved life trigger actually resolves once after entry or cancellation");
}
{
  let s = fresh(); const body = put(s, "Borrowed Subject", 0);
  runEffect(s, {effect: "gainControl", targets: [body]}, {controller: 1, source: null});
  eq(controllerOf(s, body), 1, "the payment subject is actually borrowed by the future departing player");
  redirect(s, "Exile Replacement", 2, "battlefield", "exile"); redirect(s, "Return Replacement", 2, "battlefield", "hand");
  pushAbility(s, {controller: 0, abilityId: "sacrifice-borrowed", script: {effects: [{effect: "moveZone", targets: [body], sacrifice: true}, {effect: "gainLife", who: [0], amount: 5}]}});
  resolveTop(s);
  eq([s.awaiting?.kind, s.objects[body]?.zone, s.players[0].life], ["rule-operation", "battlefield", 40], "the actual surviving controller's sacrifice instruction waits before moving another player's borrowed permanent");
  s = JSON.parse(JSON.stringify(s)); const events = concede(s, 1);
  eq([s.objects[body]?.zone, controllerOf(s, body), s.players[0].life, s.stack.length, s.ruleOperation], ["battlefield", 0, 45, 0, undefined], "a departing sacrificer's borrowed permanent returns to its owner and is not moved by the obsolete payment child");
  eq([s.players[1].sacrificedNontokenThisTurn ?? 0, events.some(e => e.data?.fields?.sacrificed === true)], [0, false], "cancellation records no sacrifice or count while the surviving outer instruction finishes once");
}
{
  const s = fresh(), body = put(s, "Sacrifice Subject", 0, "battlefield", {keywords: ["Indestructible"]});
  s.objects[body].counters.shield = 1; s.effects = [{id: "regen", rule: "regeneration", affects: {ids: [body]}, until: "end-of-turn"}];
  const out = beginRuleOperation(s, {kind: "sacrifice-one", id: body, player: 0});
  eq([out.result.sacrificed, s.objects[out.result.moved].zone, s.players[0].sacrificedNontokenThisTurn], [true, "graveyard", 1], "sacrifice ignores indestructible/shield/regeneration and records one actual nontoken sacrifice");
  const zone = out.events.find(e => e.kind === "GameEventCardChangeZone").data.fields;
  eq([zone.sacrificed, zone.sacrificer, zone.becomes], [true, 0, out.result.moved], "the exact move is marked with the sacrificer and new object ID");
}
{
  const s = fresh(), card = put(s, "Discarded Card", 0, "hand");
  const out = beginRuleOperation(s, {kind: "discard-one", id: card});
  eq([out.result.discarded, s.objects[out.result.moved].zone, s.players[0].discardedThisTurn], [true, "graveyard", 1], "discard's default owner receives an actual successful payment result");
}
for (const kind of ["sacrifice-one", "discard-one"]) {
  let s = fresh(); const from = kind === "sacrifice-one" ? "battlefield" : "hand", body = put(s, "Choice Subject", 0, from);
  const exile = redirect(s, "Exile Replacement", 1, from, "exile"); redirect(s, "Return Replacement", 1, from, "hand");
  s.objects[exile].abilities[0].change.then = [{effect: "gainLife", who: [2], amount: 1}];
  const first = beginRuleOperation(s, {kind, id: body, player: 0});
  eq([s.awaiting?.kind, s.objects[body].zone, first.events.length], ["rule-operation", from, 0], `${kind}: actual payment waits before the move and event`);
  s = JSON.parse(JSON.stringify(s)); const events = resolveAwaiting(s, [awaitingChoice(s).options.find(o => o.label.includes("Exile Replacement")).index]);
  const moved = s.zones.exile.find(id => s.objects[id].card === "Choice Subject"), zone = events.find(e => e.kind === "GameEventCardChangeZone").data.fields;
  eq([s.objects[body], Boolean(moved), zone.becomes], [undefined, true, moved], `${kind}: the selected exile replacement happens once after JSON reload`);
  eq([zone.sacrificed === true, zone.discarded === true], [kind === "sacrifice-one", kind === "discard-one"], `${kind}: replacement preserves the action identity on its exact zone event`);
  if (kind === "sacrifice-one") eq(s.players[0].sacrificedNontokenThisTurn, 1, "redirected sacrifice still records its nontoken payment once");
  else eq(s.players[0].discardedThisTurn, 1, "redirected discard still records its payment once");
  eq([s.players[2].life, events.filter(e => e.kind !== "GameEventCardChangeZone").some(e => e.data?.fields?.sacrificed || e.data?.fields?.discarded)], [41, false], `${kind}: a replacement's actual follow-up event is not mislabeled as the payment`);
}
{
  const s = fresh(), body = put(s, "Cannot Sacrifice", 0, "battlefield", {abilities: [{id: "forbid", kind: "static", rule: "cant-be-sacrificed", affects: {what: "permanent", self: true}}]});
  const out = beginRuleOperation(s, {kind: "sacrifice-one", id: body, player: 0});
  eq([out.result.sacrificed, s.objects[body].zone, s.players[0].sacrificedNontokenThisTurn ?? 0, out.events.length], [false, "battlefield", 0, 0], "a prohibited sacrifice pays nothing and reports no successful action");
}
for (const kind of ["sacrifice-one", "discard-one"]) {
  const s = fresh(), body = put(s, "Wrong Zone", 0, "graveyard");
  eq(beginRuleOperation(s, {kind, id: body, player: 0}).result[kind === "sacrifice-one" ? "sacrificed" : "discarded"], false, `${kind}: an object outside the required zone cannot pay`);
  eq(beginRuleOperation(s, {kind, id: -1, player: 0}).result.moved, null, `${kind}: a missing payment object cannot move`);
  eq(beginRuleOperation(s, {kind, id: -1}).result.moved, null, `${kind}: a missing object without an explicit payer is harmless`);
}
{
  const s = fresh(), token = put(s, "Sacrificed Token", 0, "battlefield", {token: true});
  const out = beginRuleOperation(s, {kind: "sacrifice-one", id: token});
  eq([out.result.sacrificed, s.players[0].sacrificedNontokenThisTurn ?? 0], [true, 0], "a token can be sacrificed but does not increment the nontoken condition");
}
{
  const s = fresh(), body = put(s, "Another Player's Subject", 1);
  eq(beginRuleOperation(s, {kind: "sacrifice-one", id: body, player: 0}).result.sacrificed, false, "a player cannot sacrifice another player's permanent");
  const hand = put(s, "Another Player's Card", 1, "hand");
  eq(beginRuleOperation(s, {kind: "discard-one", id: hand, player: 0}).result.discarded, false, "a player cannot discard a card outside their hand");
}
for (const kind of ["sacrifice-one", "discard-one"]) {
  const s = fresh(), body = put(s, "Departed Payer", 1, kind === "sacrifice-one" ? "battlefield" : "hand"); s.players[1].lost = true;
  eq(beginRuleOperation(s, {kind, id: body, player: 1}).result.moved, null, `${kind}: a departed player cannot pay with a stale surviving object`);
}
for (const kind of ["sacrifice-one", "discard-one"]) {
  let s = fresh(); const from = kind === "sacrifice-one" ? "battlefield" : "hand", body = put(s, "Departing Subject", 1, from);
  redirect(s, "Exile Replacement", 0, from, "exile"); redirect(s, "Return Replacement", 0, from, "hand");
  beginRuleOperation(s, {kind, id: body, player: 1}); s = JSON.parse(JSON.stringify(s)); const events = concede(s, 1);
  eq([s.objects[body], s.ruleOperation, s.awaiting, s.zones.exile.some(id => s.objects[id].card === "Departing Subject")], [undefined, undefined, null, false], `${kind}: public concession resumes without resurrecting the departed payment`);
  eq(events.filter(e => e.kind === "GameEventCardChangeZone" && (e.data.fields.sacrificed || e.data.fields.discarded)).length, 0, `${kind}: the departed object is not counted as a paid action`);
}
{
  const s = fresh(), card = put(s, "Original", 0, "hand"), before = s.nextTimestamp;
  const out = beginRuleOperation(s, {kind: "move-one", id: card, to: "battlefield", stage: "after-enter",
    proposal: {event: "zone-change", objectId: card, from: "hand", to: "battlefield", player: 0},
    childResult: {entering: {counters: {}, asks: [], gainsKeywords: ["Haste"]}, objectPatch: {set: {keywords: []}, remove: []}}});
  const moved = out.result.moved;
  eq([keywordsOf(s, moved).includes("Haste"), s.objects[moved].keywords, s.nextTimestamp], [true, [], before + 2], "riot-like haste is a persistent noncopiable layer grant to the NEW object with one grant timestamp after its move timestamp");
}
{
  const s = fresh(), card = put(s, "Refused Entry without Replacement", 0, "hand"), before = s.nextTimestamp;
  const out = beginRuleOperation(s, {kind: "move-one", id: card, to: "battlefield", stage: "after-enter",
    proposal: {event: "zone-change", objectId: card, from: "hand", to: "battlefield", player: 0},
    childResult: {entering: {to: "graveyard", counters: {}, asks: []}}});
  eq([s.objects[out.result.moved].zone, out.result.zoneEventIndex, s.nextTimestamp], ["graveyard", 0, before + 1], "a refused entry returns the real redirected child's result and allocates only one nonbattlefield object");
}
{
  let s = fresh(); const card = put(s, "Refused Entry", 0, "hand");
  redirect(s, "Exile Replacement", 1, "hand", "exile"); redirect(s, "Library Replacement", 1, "hand", "library");
  beginRuleOperation(s, {kind: "move-one", id: card, to: "battlefield", stage: "after-enter",
    proposal: {event: "zone-change", objectId: card, from: "hand", to: "battlefield", player: 0},
    childResult: {entering: {to: "graveyard", counters: {}, asks: []}}});
  eq([s.awaiting?.kind, s.objects[card].zone, s.zones.battlefield.some(id => s.objects[id].card === "Refused Entry")], ["rule-operation", "hand", false], "refused pre-entry routes from the unchanged original zone through its own replacements");
  s = JSON.parse(JSON.stringify(s)); const events = resolveAwaiting(s, [awaitingChoice(s).options.find(o => o.label.includes("Exile Replacement")).index]);
  eq([s.zones.exile.some(id => s.objects[id].card === "Refused Entry"), events.some(e => e.data?.fields?.to?.zoneType === "Battlefield")], [true, false], "the refused card reaches its chosen replacement zone without any battlefield arrival");
}
console.log(`engine-zone-action-operations: ${checks} checks passed`);
