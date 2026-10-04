/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "AS AN ADDITIONAL COST TO CAST THIS SPELL, BLIGHT 1 OR PAY {3}", AND "THIS CREATURE BECOMES THAT COLOR" (Rob's Priority
 * Batch 10.3, its forty-sixth slice: Bogslither's Embrace, the 196th card of Rob's list, and Foraging Wickermaw, the
 * 200th).
 *
 * A choice between additional costs (`{atom: "oneOf", options}`, rules/actions.mjs additionalVariants): each choice a cast
 * of its own -- its mana (`extraMana`) added to what the cast costs (CR 601.2f), whether it is paid from the pool, by
 * tapping for it, or convoked, the rest picked as any additional cost is. The mana it pays is part of the offer: an offer
 * without it is another one. Paid, it is an additional cost paid. The table says which it pays. And a mana ability's
 * follow-up knows what it added (`produced`): "this creature becomes that color until end of turn" is an animate of
 * colors alone (`addTypes: []`, `colors: "produced"`).
 *
 * The card scenarios play the cards. This suite holds the edges.
 */
import assert from "node:assert/strict";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {colorsOf, typesOf} from "../game/engine/rules/layers.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
const play = (setup, steps = []) => runScenario({name: "blight or pay", setup, steps}, index.definition, FIX).state;
const EMBRACE = "Bogslither's Embrace";
const idOf = (s, card) => s.zones.battlefield.find((id) => s.objects[id].card === card);
const casts = (s) => legalActions(s, 0).filter((a) => a.kind === "cast" && s.objects[a.objectId].card === EMBRACE);
const way = (a) => (a.extraMana ? `pay ${a.extraMana}` : a.costChoice?.blight !== undefined ? "blight" : "neither");
const FIVE = ["Swamp", "Wastes", "Wastes", "Wastes", "Wastes"];
const tapAll = (lands) => lands.map((card) => ({tap: card}));

/* ---- a choice between additional costs ---- */
{
  const s = play([at(0, "battlefield", ...FIVE, "Bear"), at(0, "hand", EMBRACE)], tapAll(FIVE));
  eq(casts(s).map(way).sort(), ["blight", "pay {3}"], "five mana and a Bear: each choice offered");
  const t = play([at(0, "battlefield", "Swamp", "Wastes", "Bear"), at(0, "hand", EMBRACE)], tapAll(["Swamp", "Wastes"]));
  eq(casts(t).map(way), ["blight"], "two mana: the blight alone -- {4}{B} is not there");
}
{
  const s = play([at(0, "battlefield", ...FIVE, "Bear"), at(0, "hand", EMBRACE)]);
  const tapped = casts(s).find((a) => a.extraMana === "{3}" && a.autoTap === true && s.objects[a.targets[0].id].card === "Bear");
  ok(tapped !== undefined, "with the pool empty, the {3} choice is offered tapping for it");
  applyAction(s, 0, tapped);
  const lands = s.zones.battlefield.filter((id) => s.objects[id].types.includes("Land"));
  eq([lands.length, lands.every((id) => s.objects[id].tapped), Object.values(s.players[0].manaPool).reduce((a, b) => a + b, 0), s.stack.length, s.stack[0].cast?.additionalPaid],
    [5, true, 0, 1, true], "taken: all five lands tapped for {4}{B} and all of it spent, the spell on the stack, its additional cost paid");
}
{
  const s = play([at(0, "battlefield", ...FIVE, "Bear"), at(0, "hand", EMBRACE)], tapAll(FIVE));
  const paying = casts(s).find((a) => a.extraMana === "{3}");
  const {extraMana: _dropped, ...without} = paying;
  assert.throws(() => applyAction(s, 0, without), /not a legal action/, "the same cast without the {3} is no offer: the mana is part of it"); checks += 1;
  const said = offerDetails(s, 0, casts(s));
  eq([said.filter((w) => w.includes("paying {3} more")).length, said.filter((w) => w.includes("blighting Bear")).length], [1, 1], "the table says which each pays");
}

/* ---- the compiler ---- */
const compile = (additionalCost) => compileScript({schema: "CrankCardScript@1", identity: {name: "Odd Embrace", oracleId: "x", types: ["Sorcery"], subtypes: [], manaCost: "{B}", colors: ["B"], colorIdentity: ["B"]},
  oracleText: "x", source: "hand", abilities: [{kind: "spell", text: "x", additionalCost, targets: [], effects: [{effect: "draw", count: 1}]}]}).problems;
eq(compile([{atom: "oneOf", options: [[{atom: "blight", count: 1}], [{atom: "mana", cost: "{3}"}]]}]), [], "blight 1 or pay {3}");
ok(compile([{atom: "oneOf", options: [[{atom: "blight", count: 1}]]}]).some((p) => p.includes("two or more")), "a choice of one is no choice");
ok(compile([{atom: "oneOf", options: [[{atom: "blight", count: 1}], [{atom: "mana", cost: "{X}"}]]}]).some((p) => p.includes("is no mana to pay")), "and its mana is a cost to pay, not an X");
ok(compile([{atom: "oneOf", options: [[{atom: "blight", count: 1}], [{atom: "payLife", amount: 3}]]}]).some((p) => p.includes("payLife: an additional cost nothing pays yet")), "and each choice is something paid");

/* ---- becomes that color ---- */
{
  const s = play([at(0, "battlefield", "Foraging Wickermaw", "Wastes")], [{tap: "Wastes"}, {tap: "Foraging Wickermaw", mana: {U: 1}}]);
  const maw = idOf(s, "Foraging Wickermaw");
  eq([colorsOf(s, maw), typesOf(s, maw)], [["U"], ["Artifact", "Creature"]], "{U} added: it is blue, its types as they were");
  const t = play([at(0, "battlefield", "Foraging Wickermaw", "Wastes")], [{tap: "Wastes"}, {tap: "Foraging Wickermaw", mana: {U: 1}}, {to: {turn: 2, phase: "UPKEEP"}}]);
  eq(colorsOf(t, idOf(t, "Foraging Wickermaw")), [], "until end of turn: colorless again");
  const u = play([at(0, "battlefield", "Foraging Wickermaw", "Wastes")], [{tap: "Wastes"}, {tap: "Foraging Wickermaw", mana: {U: 1}}, {to: {turn: 3, phase: "MAIN1"}}, {tap: "Wastes"}]);
  eq(legalActions(u, 0).filter((a) => a.kind === "activate-mana" && u.objects[a.objectId].card === "Foraging Wickermaw").length, 5, "once each turn: Rob's next turn, once again");
}
for (const name of [EMBRACE, "Foraging Wickermaw"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-blight-or-pay: ${checks} checks passed -- blight 1 or pay {3}, each its own cast, the mana in the offer, tapped for, said by the table; a mana ability's follow-up knows the color it added.`);
