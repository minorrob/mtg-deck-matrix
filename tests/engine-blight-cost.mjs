/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "BLIGHT 1" AS A COST (Rob's Priority Batch 10.3, its thirty-eighth slice: Gristle Glutton, the 199th card of Rob's
 * list, and Spiral into Solitude, the 575th).
 *
 * `{atom: "blight", count}` (rules/actions.mjs): that many -1/-1 counters on a creature the ability's controller controls,
 * the source itself among them, chosen as it is activated -- one offer each, none with no creature (CR 701.68a, 118.3) --
 * and put as any counters are, as the cost is paid (CR 602.2b). And what an Aura's ability calls "enchanted creature" is
 * read as the Aura last was when its own cost sacrificed it (CR 608.2h; rules/stack.mjs, the last known `attachedTo`).
 *
 * The card scenarios play the cards. This suite holds the offers, the payment, the counters' meeting with +1/+1 counters
 * (CR 704.5q), the Aura's restrictions and its last known attachment.
 */
import assert from "node:assert/strict";
import {costAtomBuilt, legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {lastKnown} from "../game/engine/rules/layers.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {cardsIn} from "../game/engine/state/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  /* "Blight 1: Draw a card." on an artifact: no creature of its own. */
  Kettle: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "a0", kind: "activated", text: "Blight 1: Draw a card.", cost: [{atom: "blight", count: 1}],
    targets: [], effects: [{effect: "draw", count: 1}]}]},
};
const run = (setup, steps, more = {}) => runScenario({name: "blight", setup, steps, ...more}, index.definition, FIX).state;
const offers = (s, card, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "activate" && a.label === card);
const idOf = (s, card) => s.zones.battlefield.find((x) => s.objects[x].card === card);

/* ---- the compiler ---- */
eq([costAtomBuilt({atom: "blight", count: 1}), costAtomBuilt({atom: "blight"}), costAtomBuilt({atom: "blight", count: 2}), costAtomBuilt({atom: "blight", count: 0}),
  costAtomBuilt({atom: "blight", count: "X"})], [true, true, true, false, false], "built: blight N for a whole N of 1 or more");

/* ---- the offers ---- */
{
  const s = run([at(0, "battlefield", "Kettle")], []);
  eq(offers(s, "Kettle").length, 0, "no creature to blight: the Kettle's ability is not offered");
  const t = run([at(0, "battlefield", "Kettle", "Bear", "Bear"), at(1, "battlefield", "Bear")], []);
  eq(offers(t, "Kettle").map((a) => a.costNames), [["Bear"], ["Bear"]], "Rob's two Bears: one offer each, named; Maya's Bear is not Rob's to blight");
}

/* ---- the payment ---- */
{
  const s = run([at(0, "battlefield", "Kettle", "Bear")], []);
  applyAction(s, 0, offers(s, "Kettle")[0]);
  const bear = s.objects[idOf(s, "Bear")];
  eq([bear.counters["-1/-1"], s.stack.length], [1, 1], "paid as the ability goes on the stack: the counter is on the Bear while it waits");
}
{
  /* A -1/-1 counter meets a +1/+1 counter: both go, as state-based actions are checked before Rob holds priority again
     (CR 704.5q). */
  const s = run([at(0, "battlefield", "Kettle", "Bear")], []);
  s.objects[idOf(s, "Bear")].counters["+1/+1"] = 1;
  applyAction(s, 0, offers(s, "Kettle")[0]);
  const bear = s.objects[idOf(s, "Bear")];
  eq([bear.counters["+1/+1"] ?? 0, bear.counters["-1/-1"] ?? 0, s.priorityPlayer], [0, 0, 0], "a +1/+1 counter and the blight's -1/-1 counter annihilate");
}

/* ---- Spiral into Solitude ---- */
{
  const setup = [at(0, "battlefield", "Plains", "Wastes"), at(0, "hand", "Spiral into Solitude"), at(1, "battlefield", "Bear")];
  const cast = [{tap: "Plains"}, {tap: "Wastes"}, {cast: "Spiral into Solitude", targets: [{card: "Bear", seat: 1}]}, {resolve: true}];
  const s = run(setup, [...cast, {to: {turn: 2, phase: "COMBAT_DECLARE_ATTACKERS"}}]);
  const attackers = s.awaiting?.kind === "declare-attackers" ? awaitingChoice(s).options.map((o) => o.label) : [];
  ok(!attackers.some((label) => label.startsWith("Bear")), "enchanted, Maya's Bear is not among Maya's attackers");
  const aura = run(setup, cast);
  const lki = lastKnown(aura, idOf(aura, "Spiral into Solitude"));
  eq(aura.objects[lki.attachedTo]?.card, "Bear", "the Aura's last known information says what it enchanted");
  /* Its ability, its own cost sacrificing it: "enchanted creature" is the Bear it last enchanted. */
  const done = run([at(0, "battlefield", "Plains", "Wastes", "Plains", "Wastes", "Bear"), at(0, "hand", "Spiral into Solitude"), at(1, "battlefield", "Bear")],
    [...cast, {tap: "Plains"}, {tap: "Wastes"}, {activate: "Spiral into Solitude", blight: "Bear"}, {resolve: true}]);
  eq([cardsIn(done, "exile", 1).map((id) => done.objects[id].card), done.zones.battlefield.filter((id) => done.objects[id].controller === 1).length], [["Bear"], 0],
    "sacrificed for its own cost, the Aura's ability exiles Maya's Bear");
}
for (const name of ["Gristle Glutton", "Spiral into Solitude"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-blight-cost: ${checks} checks passed -- "blight N" a cost: one offer for each creature of yours, paid as the ability goes on the stack, annihilating with +1/+1 counters; an Aura's "enchanted creature" read as it last was.`);
