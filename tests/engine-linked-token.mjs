/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE EXILED CARD'S OWNER'S TOKEN (Skyclave Apparition; AI 1's Chulane deck, after the live game of 2026-10-04).
 *
 * "When this creature leaves the battlefield, the exiled card's owner creates an X/X blue Illusion creature token, where X
 * is the mana value of the exiled card." A linked ability (CR 607.2a): createToken's `linked` reads what this permanent's
 * other ability exiled (`link`, script/effects/zones.mjs), while each is still that card in exile (CR 400.7), against the
 * source as it last was. Each owner of one creates the token, X all their mana values together (the card's ruling of
 * 2020-09-25); none there, nobody does; an {X} in a mana cost is 0 there (CR 202.3e). And a linked ability that exiles
 * twice (Panharmonicon) has exiled both: the link adds, for Oblivion Ring as for Skyclave.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {collectTriggers, openTriggers} from "../game/engine/rules/trigger.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const SA = "Skyclave Apparition", OR = "Oblivion Ring";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Cub: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{G}", colors: ["G"], power: 1, toughness: 1},
  Totem: {types: ["Artifact"], manaCost: "{4}", colors: []},
  "Echo Chamber": {types: ["Artifact"], manaCost: "{4}", colors: [], abilities: [{id: "e", kind: "static", rule: "triggers-again",
    text: "If an enchantment entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.",
    affects: {what: "permanent", controller: "you"}, cause: {event: "enters", filter: {types: ["Enchantment"]}}}]}};
const play = (setup, steps, seats = 2) => runScenario({name: "linked token", seats, setup, steps}, index.definition, FIX).state;
const idOf = (s, card) => s.zones.battlefield.find((id) => s.objects[id].card === card);
const tokens = (s, seat) => s.zones.battlefield.filter((id) => s.objects[id].card === "Illusion" && s.objects[id].controller === seat)
  .map((id) => [characteristicsOf(s, id).power, characteristicsOf(s, id).toughness]);
/* It leaves as an effect moves it; what that triggers goes on the stack, and everything resolves. */
const leave = (s, card) => collectTriggers(s, runEffect(s, {effect: "moveZone", targets: [idOf(s, card)], to: "graveyard"}, {controller: 1, source: null}));
const settle = (s) => { openTriggers(s); for (let n = 0; n < 20 && s.stack.length && !s.awaiting; n += 1) passPriority(s, null); };
const CAST = [{tap: "Plains"}, {tap: "Plains"}, {tap: "Wastes"}, {cast: SA}, {resolve: true}];
const PAN = at(0, "battlefield", "Plains", "Plains", "Wastes", "Panharmonicon");

{
  /* Panharmonicon: the trigger twice, each its own target -- Maya's Bear and Trey's Totem. Both are "the exiled card":
     each owner creates an Illusion of their mana values together, 6/6 (the card's ruling). */
  const s = play([PAN, at(0, "hand", SA), at(1, "battlefield", "Bear"), at(2, "battlefield", "Totem")],
    [...CAST, {answer: [0, 1]}, {choose: ["Bear (Maya's)"]}, {choose: ["Totem (Trey's)"]}, {resolve: true}, {resolve: true}], 3);
  const sky = idOf(s, SA);
  eq(s.links[sky].map((id) => s.objects[id].card).sort(), ["Bear", "Totem"], "both exiled cards kept against the one Skyclave");
  leave(s, SA);
  settle(s);
  eq([tokens(s, 1), tokens(s, 2), s.links[sky]], [[[6, 6]], [[6, 6]], undefined], "Maya and Trey each create a 6/6; the link is spent");
}
{
  /* Two cards of one owner: one token for that player, of both mana values. */
  const s = play([PAN, at(0, "hand", SA), at(1, "battlefield", "Bear", "Cub")],
    [...CAST, {answer: [0, 1]}, {choose: ["Bear (Maya's)"]}, {choose: ["Cub (Maya's)"]}, {resolve: true}, {resolve: true}]);
  leave(s, SA);
  settle(s);
  eq(tokens(s, 1), [[3, 3]], "Maya alone: one 3/3, not a 2/2 and a 1/1");
}
{
  /* The exiled card left exile (a commander its owner put home, CR 903.9a): no exiled card, so no token (the card's ruling). */
  const t = play([at(0, "battlefield", "Plains", "Plains", "Wastes"), at(0, "hand", SA), at(1, "command", "Bear"), at(1, "battlefield", "Forest", "Wastes")],
    [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Forest", seat: 1}, {tap: "Wastes", seat: 1}, {cast: "Bear", seat: 1}, {resolve: true},
      {to: {turn: 3, phase: "MAIN1"}}, ...CAST, {choose: ["Bear (Maya's)"]}, {resolve: true}, {answer: [0]}]);
  eq(t.zones.command[1].map((id) => t.objects[id].card), ["Bear"], "Maya's commander exiled, and she puts it home (CR 903.9a)");
  leave(t, SA);
  settle(t);
  eq(tokens(t, 1), [], "the Bear gone from exile to the command zone: nobody creates a token");
}
{
  /* With nothing exiled, createToken's `linked` makes nothing -- and a source with no link at all is not an error. */
  const s = play([at(0, "battlefield", "Plains")], []);
  const before = s.zones.battlefield.length;
  runEffect(s, {effect: "createToken", linked: true, token: {name: "Illusion", types: ["Creature"], subtypes: ["Illusion"], colors: ["U"], power: "X", toughness: "X"}}, {controller: 0, source: null, lastKnown: {cardId: 999}});
  eq(s.zones.battlefield.length, before, "no exiled card: no token");
}
{
  /* "X/X" is the X it is given: a token spec's power and toughness "X" read the effect's X (script/amount.mjs). */
  const s = play([at(0, "battlefield", "Plains")], []);
  runEffect(s, {effect: "createToken", token: {name: "Ooze", types: ["Creature"], colors: ["G"], power: "X", toughness: "X"}}, {controller: 0, source: null, x: 3});
  const ooze = idOf(s, "Ooze");
  eq([characteristicsOf(s, ooze).power, characteristicsOf(s, ooze).toughness], [3, 3], "an X/X Ooze with X of 3 is 3/3");
}
{
  /* The link adds (CR 607.2a): Oblivion Ring's trigger twice (an enchantment's arrival doubled, the Echo Chamber below)
     exiles twice, and both return as it leaves. */
  const s = play([at(0, "battlefield", "Plains", "Wastes", "Wastes", "Echo Chamber"), at(0, "hand", OR), at(1, "battlefield", "Bear", "Totem")],
    [{tap: "Plains"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: OR}, {resolve: true}, {answer: [0, 1]}, {choose: ["Bear"]}, {choose: ["Totem"]}, {resolve: true}, {resolve: true}]);
  eq(s.zones.exile.map((id) => s.objects[id].card).sort(), ["Bear", "Totem"], "both exiled");
  leave(s, OR);
  settle(s);
  eq([idOf(s, "Bear") !== undefined, idOf(s, "Totem") !== undefined], [true, true], "the Ring gone: both back under Maya's control");
}

/* The catalog: Skyclave Apparition's inventory reads ChangeZone, Token, its trigger -- none of them missing. */
eq(missingFor({apis: ["ChangeZone", "Token"], triggers: ["ChangesZone"], keywords: []}), [], "nothing missing for what Skyclave Apparition does");

console.log(`engine-linked-token: ${checks} checks passed -- the exiled cards' owners each create an X/X of all their mana values together; nothing once nothing is in exile; a linked exile done twice exiled both.`);
