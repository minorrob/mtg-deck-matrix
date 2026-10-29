/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {addObject} from "../game/engine/state/index.mjs";
import {beginRuleOperation} from "../game/engine/rules/operations.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const definition = loadCardIndex().definition;
const fresh = () => runScenario({name: "Zone action continuation", seats: 3, setup: [], steps: []}, definition, {}).state;
const put = (s, card, owner, zone = "battlefield", extra = {}) => addObject(s, {card, owner, controller: owner,
  types: ["Creature"], power: 2, toughness: 2, ...extra}, zone, ["hand", "library", "graveyard"].includes(zone) ? owner : null);
const redirect = (s, name, owner, from, to) => put(s, name, owner, "battlefield", {types: ["Enchantment"], abilities: [{id: "redirect", kind: "replacement",
  watches: {event: "zone-change", from, to: "graveyard", filter: {what: "card", zone: from}}, change: {to}}]});
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
