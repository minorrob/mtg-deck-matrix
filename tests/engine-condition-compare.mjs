/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 44 (THE CATALOG'S ORDER): AN EFFECT'S CONDITION, A COMPARISON (Forge's ConditionCompare).
 *
 * The comparisons were built piecemeal -- an arrival's `unless` with min / max (a fast land), a condition's atLeast /
 * atMost -- and the cards that compare need two things more. "When this land enters untapped" reads how it ENTERED, which
 * the arrival now records wherever a permanent enters (a move, a search, a resolving spell, a token, a copy), not how it
 * is later. And "put target card from your graveyard on top of your library": a card put into a library goes to the
 * bottom unless it says the top.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const ISLAND = {card: "Island", types: ["Land"], supertypes: ["Basic"], subtypes: ["Island"], abilities: [{id: "u", kind: "mana", tapSelf: true, produces: {U: 1}}]};
const table = () => createState({matchId: "m", seed: "compare", players: [{name: "Rob"}, {name: "Maya"}]});
const put = (s, o, zone, seat = 0) => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
const islands = (s, n) => { for (let i = 0; i < n; i += 1) put(s, ISLAND, "battlefield"); return s; };
const you = {controller: 0, source: null};
const arrival = (events) => events.find((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.to?.zoneType === "Battlefield");
const triggered = (s, events) => { s.pendingTriggers = []; collectTriggers(s, events); return s.pendingTriggers.map((t) => t.source.name); };

{
  /* How it entered: three other Islands, untapped -- it triggers; two, tapped -- it does not. */
  const s = islands(table(), 3);
  const events = runEffects(s, [{effect: "moveZone", targets: [put(s, card("Mystic Sanctuary"), "hand")], to: "battlefield"}], you);
  eq(arrival(events).data.fields.enteredTapped, undefined, "three other Islands: it entered untapped, and its arrival says nothing of tapped");
  eq(triggered(s, events), ["Mystic Sanctuary"], "... and \"when this land enters untapped\" triggers");
  const t = islands(table(), 2);
  const tapped = runEffects(t, [{effect: "moveZone", targets: [put(t, card("Mystic Sanctuary"), "hand")], to: "battlefield"}], you);
  eq(arrival(tapped).data.fields.enteredTapped, true, "two: it entered tapped, and its arrival says so");
  eq(triggered(t, tapped), [], "... and nothing triggers");
  /* Tapped for mana before its trigger is put on the stack: it still entered untapped. */
  const u = islands(table(), 3);
  const later = runEffects(u, [{effect: "moveZone", targets: [put(u, card("Mystic Sanctuary"), "hand")], to: "battlefield"}], you);
  u.objects[arrival(later).data.fields.enteredAs].tapped = true;
  eq(triggered(u, later), ["Mystic Sanctuary"], "tapped since: it entered untapped, and it triggers -- as it entered, not as it is");
}
{
  /* Each way onto the battlefield tapped says so: an effect's "return ... to the battlefield tapped" (Lumra), a search's
     "put it onto the battlefield tapped", a tapped token, a tapped copy. */
  const s = islands(table(), 3);
  put(s, card("Mystic Sanctuary"), "graveyard");
  const all = runEffects(s, [{effect: "moveZoneAll", selector: {what: "card", zone: "graveyard", controller: "you"}, to: "battlefield", tapped: true}], you);
  eq([arrival(all).data.fields.enteredTapped, triggered(s, all)], [true, []], "returned tapped beside three other Islands: its arrival says tapped, and nothing triggers");
  const t = islands(table(), 3);
  put(t, card("Mystic Sanctuary"), "library");
  beginResolution(t, [{effect: "chooseCard", zone: "library", selector: {types: ["Land"]}, to: "battlefield", tapped: true}], you);
  const found = resolveAwaiting(t, [0]);
  eq([arrival(found).data.fields.enteredTapped, triggered(t, found)], [true, []], "searched for and put onto the battlefield tapped: the same");
  const k = table();
  eq(arrival(runEffects(k, [{effect: "createToken", token: {predefined: "Treasure"}, tapped: true}], you)).data.fields.enteredTapped, true, "a tapped Treasure: its arrival says tapped");
  eq(arrival(runEffects(k, [{effect: "createToken", token: {predefined: "Treasure"}}], you)).data.fields.enteredTapped, undefined, "an untapped one: nothing");
  const original = put(k, {card: "Bear", types: ["Creature"], power: 2, toughness: 2}, "battlefield");
  eq(arrival(runEffects(k, [{effect: "copyPermanent", targets: [original], tapped: true}], you)).data.fields.enteredTapped, true, "a tapped copy: its arrival says tapped");
}
{
  /* A permanent spell resolving: its own "enters tapped" is read as it comes off the stack, and its arrival says so. */
  const watcher = (extra) => ({types: ["Creature"], manaCost: "{1}", colors: ["W"], power: 1, toughness: 1, abilities: [...extra,
    {id: "w", kind: "triggered", text: "When this creature enters untapped, you gain 1 life.", trigger: {on: "GameEventCardChangeZone", to: "Battlefield", who: "self", untapped: true}, effects: [{effect: "gainLife", amount: 1}]}]});
  const fixtures = {Sentry: watcher([{id: "r", kind: "replacement", text: "This creature enters tapped.", watches: {event: "enters", who: "self"}, change: {entersTapped: true}}]), Scout: watcher([])};
  const cast = (name, expect) => runScenario({name, setup: [{seat: 0, zone: "hand", cards: [name]}, {seat: 0, zone: "battlefield", cards: ["Wastes"]}],
    steps: [{tap: "Wastes"}, {cast: name}, {resolve: true}], expect}, cards.definition, fixtures);
  eq(cast("Sentry", [{stack: 0}, {seat: 0, tapped: "Sentry"}, {seat: 0, life: 40}]).passed.length, 3, "a creature spell that enters tapped: nothing triggers");
  eq(cast("Scout", [{stack: 1}]).passed.length, 1, "one that enters untapped: it triggers");
}
{
  /* "On top of your library": the top. Without it, the bottom, as before. */
  const s = table();
  for (let i = 0; i < 3; i += 1) put(s, ISLAND, "library");
  runEffects(s, [{effect: "moveZone", targets: [put(s, {card: "Spark", types: ["Instant"]}, "graveyard")], to: "library", top: true}], you);
  eq(s.objects[s.zones.library[0][0]].card, "Spark", "\"on top of your library\": the top");
  runEffects(s, [{effect: "moveZone", targets: [put(s, {card: "Gift", types: ["Instant"]}, "graveyard")], to: "library"}], you);
  eq(s.objects[s.zones.library[0].at(-1)].card, "Gift", "without it: the bottom");
}
{
  eq(missingFor({options: ["ConditionCompare", "ConditionPresent"]}), [], "the catalog credits the comparison");
}

console.log(`engine-condition-compare: ${checks} checks passed — "enters untapped" read as it entered, wherever a permanent enters; on top of a library; the comparison credited.`);
