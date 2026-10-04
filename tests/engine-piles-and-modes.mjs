/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TWO PILES, INCREMENT, MODES CHOSEN AS IT IS ACTIVATED, AND "UNTIL YOUR NEXT TURN, WHENEVER A CREATURE ATTACKS YOU" (Fact or
 * Fiction, Berta, Wise Extrapolator, Aetheric Amplifier, Jace, Reality Sculptor; the live-game plan of 2026-10-04, lane W5).
 *
 * `twoPiles` (script/effects/asking.mjs): the top cards revealed; an opponent, chosen by the controller when there is more
 * than one, separates them (a pile may be empty, CR 700.3); the controller takes one pile.
 * Increment (cards/index.mjs): a "whenever you cast a spell" trigger whose intervening "if" compares the mana spent on that
 * spell with the lesser of this creature's power and toughness (`lesserOf`, script/amount.mjs).
 * `counter added` (cards/index.mjs; rules/trigger.mjs): counters of a kind put on this permanent.
 * An activated ability's modes, when they name targets, chosen with the offer (CR 700.2; rules/actions.mjs).
 * A delayed trigger `untilYourNextTurn` (effects/permanents.mjs; rules/turn.mjs), every time until its controller's next
 * turn begins; an attack trigger's `defender: "you"` (rules/trigger.mjs); and moveZone's `allButBottom`.
 */
import assert from "node:assert/strict";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {offerDetails} from "../game/room/room.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  "Big Bear": {types: ["Creature"], subtypes: ["Bear"], manaCost: "{3}{G}{G}", colors: ["G"], power: 5, toughness: 5},
};
const play = (setup, steps = [], more = {}) => runScenario({name: "piles and modes", setup, steps, ...more}, index.definition, FIX).state;
const idOf = (s, card, seat = null) => s.zones.battlefield.find((id) => s.objects[id].card === card && (seat === null || s.objects[id].controller === seat));
const FOF = "Fact or Fiction", FOF_LANDS = ["Island", "Wastes", "Wastes", "Wastes"], CAST_FOF = [...FOF_LANDS.map((l) => ({tap: l})), {cast: FOF}, {resolve: true}];

/* ---- two piles ---- */
{
  const s = play([at(0, "battlefield", ...FOF_LANDS), at(0, "hand", FOF)], CAST_FOF, {library: ["Island", "Forest", "Plains", "Swamp", "Mountain"]});
  eq([s.awaiting.player, awaitingChoice(s).mode, awaitingChoice(s).min, awaitingChoice(s).options.length], [1, "many", 0, 5], "two players: Maya separates the five, any number in the first pile");
  ok(s.zones.library[0].slice(0, 5).every((id) => s.objects[id].zone === "library"), "while the piles are made, the cards stay in Rob's library");
  const t = play([at(0, "battlefield", ...FOF_LANDS), at(0, "hand", FOF)], [...CAST_FOF, {answer: []}], {library: ["Island", "Forest", "Plains", "Swamp", "Mountain"]});
  eq([t.awaiting.player, awaitingChoice(t).options.map((o) => o.label)], [0, ["Pile 1: no cards", "Pile 2: Island, Forest, Plains, Swamp, Mountain"]], "an empty first pile: Rob chooses between nothing and all five");
  const u = play([at(0, "battlefield", ...FOF_LANDS), at(0, "hand", FOF)], [...CAST_FOF, {answer: []}, {choose: ["Pile 1: no cards"]}], {library: ["Island", "Forest", "Plains", "Swamp", "Mountain"]});
  eq([u.zones.hand[0].length, u.zones.graveyard[0].length], [0, 6], "the empty pile taken: nothing in hand, the five and the spell in the graveyard");
  const w = play([at(0, "battlefield", ...FOF_LANDS), at(0, "hand", FOF)], [...FOF_LANDS.map((l) => ({tap: l})), {cast: FOF}]);
  for (const id of [...w.zones.library[0]]) runEffect(w, {effect: "moveZone", targets: [id], to: "exile"}, {controller: 0});
  for (let n = 0; n < 10 && w.stack.length; n += 1) passPriority(w, null);
  eq([w.stack.length, w.awaiting, w.zones.hand[0].length], [0, null, 0], "an empty library: nothing revealed, nobody asked");
}
/* ---- increment ---- */
{
  const s = play([at(0, "battlefield", "Berta, Wise Extrapolator")]);
  const berta = idOf(s, "Berta, Wise Extrapolator");
  eq(amountOf(s, {lesserOf: [{powerOf: "self"}, {toughnessOf: "self"}]}, {controller: 0, source: berta}), 1, "Berta, 1/4: the lesser is 1");
  s.objects[berta].counters["+1/+1"] = 4;
  eq(amountOf(s, {lesserOf: [{powerOf: "self"}, {toughnessOf: "self"}]}, {controller: 0, source: berta}), 5, "with four counters, 5/8: 5");
  const bad = compileScript({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Creature"], subtypes: [], manaCost: "{G}", colors: ["G"], colorIdentity: ["G"], power: 1, toughness: 1},
    oracleText: "x", source: "hand", abilities: [{kind: "triggered", text: "x", trigger: {on: "spell cast"}, condition: {compare: {count: {lesserOf: [1]}, atLeast: 1}}, effects: [{effect: "draw", count: 1}]}]});
  ok(bad.problems.some((p) => p.includes("lesserOf is two or more amounts")), "lesserOf is two amounts or more");
  const t = play([at(0, "battlefield", "Berta, Wise Extrapolator", "Island"), at(1, "battlefield", "Forest", "Wastes"), at(1, "hand", "Bear")],
    [{pass: 1}, {to: {turn: 2, phase: "MAIN1"}}, {tap: "Forest", seat: 1}, {tap: "Wastes", seat: 1}, {cast: "Bear", seat: 1}]);
  eq(t.stack.length, 1, "Maya's two-mana spell: no trigger for Rob's Berta");
}
/* ---- counters added: this one, this kind, more of them ---- */
{
  const fires = (effect, card) => {
    const s = play([at(0, "battlefield", "Berta, Wise Extrapolator", "Bear")]);
    collectTriggers(s, runEffect(s, {...effect, targets: [idOf(s, card)]}, {controller: 0}));
    return (s.pendingTriggers ?? []).length;
  };
  eq([fires({effect: "putCounter", counter: "+1/+1", count: 2}, "Berta, Wise Extrapolator"), fires({effect: "putCounter", counter: "+1/+1", count: 1}, "Bear"),
    fires({effect: "putCounter", counter: "-1/-1", count: 1}, "Berta, Wise Extrapolator")], [1, 0, 0],
    "two +1/+1 counters on Berta: once; one on the Bear, or a -1/-1 counter on Berta: nothing");
}
/* ---- modes chosen as it is activated ---- */
{
  const s = play([at(0, "battlefield", "Aetheric Amplifier", "Wastes", "Wastes", "Wastes", "Wastes", "Bear")], [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}]);
  const offers = legalActions(s, 0).filter((a) => a.kind === "activate" && s.objects[a.objectId].card === "Aetheric Amplifier");
  eq([offers.filter((a) => a.modes[0] === 0).length, offers.filter((a) => a.modes[0] === 1 && a.targets.length === 0).length], [6, 1], "the first mode once per permanent, the second once, with no target");
  const second = offers.find((a) => a.modes[0] === 1);
  ok(offerDetails(s, 0, [second])[0].startsWith("Double the number of each kind of counter you have."), "the table says the mode in the card's words");
  const u = runScenario({name: "piles and modes", setup: [at(0, "battlefield", "Aetheric Amplifier", "Wastes", "Wastes", "Wastes", "Wastes")],
    steps: [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {activate: "Aetheric Amplifier", modes: [1]}]}, index.definition, FIX).state;
  u.players[0].poison = 2;
  for (let n = 0; n < 10 && u.stack.length; n += 1) passPriority(u, null);
  eq([second !== undefined, u.players[0].poison], [true, 4], "the second: Rob's own counters doubled, poison 2 to 4");
  ok(index.definition("Pemmin's Aura").abilities.every((a) => a.modal === undefined), "a modal activated ability whose modes name no target is still asked as it resolves");
  /* A mode with a counted target ("tap up to two target creatures"): picked once the offer is taken, from that mode's specs. */
  const ROD = compileScript({schema: "CrankCardScript@1", identity: {name: "Modal Rod", oracleId: "x", types: ["Artifact"], subtypes: [], manaCost: "{0}", colors: [], colorIdentity: []},
    oracleText: "x", source: "hand", abilities: [{kind: "activated", text: "x", cost: [{atom: "{T}"}], effects: [{effect: "modal", choose: 1, modes: [
      {text: "Tap up to two target creatures.", targets: [{what: "permanent", types: ["Creature"], count: {min: 0, max: 2}}], effects: [{effect: "tap", targets: {target: 0}}]},
      {text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]}]}]}]}).definition;
  const rod = runScenario({name: "piles and modes", setup: [at(0, "battlefield", "Modal Rod"), at(1, "battlefield", "Bear", "Big Bear")],
    steps: [{activate: "Modal Rod", modes: [0], targets: [[{card: "Bear"}, {card: "Big Bear"}]]}, {resolve: true}]}, index.definition, {...FIX, "Modal Rod": ROD}).state;
  eq(["Bear", "Big Bear"].map((c) => rod.objects[idOf(rod, c)].tapped), [true, true], "a mode's counted target, picked as the offer is taken: both Bears tapped");
}
/* ---- until your next turn, whenever a creature attacks you ---- */
{
  const JRS = "Jace, Reality Sculptor";
  const MINUS = [{activate: JRS, ability: "a1"}, {resolve: true}];
  const s = play([at(0, "battlefield", JRS), at(1, "battlefield", "Bear", "Big Bear")], [...MINUS, {to: {turn: 2, phase: "MAIN1"}}, {attack: ["Bear", "Big Bear"], at: ["Rob", "Rob"]}]);
  eq(s.stack.length + (s.pendingTriggers?.length ?? 0), 2, "two creatures attack Rob: two triggers (waiting for their order)");
  const t = play([at(0, "battlefield", JRS), at(1, "battlefield", "Bear")], [...MINUS, {to: {turn: 3, phase: "MAIN1"}}]);
  eq((t.delayedTriggers ?? []).filter((d) => d.untilYourNextTurn).length, 0, "Rob's next turn: gone");
  const u = play([at(0, "battlefield", JRS), at(1, "battlefield", "Bear")], [...MINUS, {to: {turn: 2, phase: "MAIN2"}}]);
  eq((u.delayedTriggers ?? []).filter((d) => d.untilYourNextTurn).length, 1, "through Maya's whole turn: still there");
  const v = play([at(0, "battlefield", JRS), at(1, "battlefield", "Bear")], [...MINUS, {to: {turn: 2, phase: "MAIN1"}}, {attack: ["Bear"], at: "Rob"}, {resolve: true}, {to: {turn: 2, phase: "MAIN2"}}]);
  eq((v.delayedTriggers ?? []).filter((d) => d.untilYourNextTurn).length, 1, "and still there after it triggered");
  const w = play([at(0, "battlefield", JRS), at(1, "battlefield", "Bear")], [...MINUS, {to: {turn: 2, phase: "MAIN1"}}, {attack: ["Bear"], at: "Trey"}], {seats: 3});
  eq(w.stack.length, 0, "a creature attacking Trey: not Rob's, no trigger");
}
/* ---- all but the bottom card ---- */
{
  const s = play([]);
  const bottom = s.zones.library[1].at(-1);
  runEffect(s, {effect: "moveZone", who: "opponent", allButBottom: true, to: "exile"}, {controller: 0});
  eq([s.zones.library[1], s.zones.library[0].length], [[bottom], 20], "Maya's library down to its bottom card; Rob's untouched");
}
for (const name of [FOF, "Berta, Wise Extrapolator", "Aetheric Amplifier", "Jace, Reality Sculptor"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-piles-and-modes: ${checks} checks passed -- two piles by an opponent, increment by the lesser of power and toughness, counters put on this, modes chosen as an ability is activated, until your next turn whenever a creature attacks you, all but the bottom card.`);
