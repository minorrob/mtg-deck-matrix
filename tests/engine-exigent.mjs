/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A SPELL'S OWN CAST TRIGGER, A CARD EXILED FROM HAND TO BE CAST LATER, A WARD OF THREE SACRIFICES (Emrakul, the Exigent Doom;
 * the live-game plan of 2026-10-04, lane W6).
 *
 * "When you cast this spell" (CR 603.2): the spell on the stack watched for its own cast, and no other (rules/trigger.mjs).
 * "Exile this card from your hand" as a cost (rules/actions.mjs): "this card" then the card in exile, which mayPlay `until:
 * "ever"` lets its owner cast for as long as it remains there, and an effect with `untilCast` lasts until that cast. And
 * ward's sacrifice with a `count` (effects/asking.mjs, unlessPays): paying is one option, then which ones, that many.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {unlessPays} from "../game/engine/script/effects/asking.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const EM = "Emrakul, the Exigent Doom";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
const run = (setup, steps) => runScenario({name: "exigent", setup, steps}, index.definition, FIX).state;
const mana = (s, card) => legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.label === card).map((a) => JSON.stringify(a.mana));
const tapped = (s) => s.zones.battlefield.filter((id) => s.objects[id].tapped).length;

{
  const tapTen = Array(10).fill({tap: "Wastes"});
  const s = run([at(0, "battlefield", ...Array(10).fill("Wastes")), at(0, "hand", EM)], [...tapTen, {cast: EM}]);
  eq(s.stack.map((e) => e.kind), ["spell", "trigger"], "cast: its own trigger, above it");
  const t = run([at(0, "battlefield", ...Array(10).fill("Wastes")), at(0, "hand", EM)], [...tapTen, {cast: EM}, {resolve: true}]);
  eq([tapped(t), t.stack.length], [0, 1], "the trigger untaps every land Rob controls; Emrakul still on the stack");
  const u = run([at(0, "battlefield", "Forest", "Wastes", EM), at(0, "hand", "Bear")], [{tap: "Forest"}, {tap: "Wastes"}, {cast: "Bear"}]);
  eq(u.stack.map((e) => e.kind), ["spell"], "on the battlefield, another spell's cast does not trigger it");
}
{
  const setup = [at(0, "battlefield", "Wastes", "Wastes", "Wastes", "Forest", ...Array(10).fill("Plains")), at(0, "hand", EM)];
  const exile = [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {activate: EM, targets: [{card: "Forest"}]}, {resolve: true}];
  const s = run(setup, exile);
  eq([s.zones.exile.map((id) => s.objects[id].card), mana(s, "Forest").includes('{"C":2}')], [[EM], true], "exiled from hand: the Forest has \"{T}: Add {C}{C}\"");
  const ten = Array(10).fill({tap: "Plains"});
  const castable = (state) => legalActions(state, 0).some((a) => a.kind === "cast" && a.label === EM);
  eq(castable(run(setup, [...exile, ...ten])), true, "and Rob may cast it from exile (a cast from elsewhere is offered with the mana in the pool)");
  const t = run(setup, [...exile, {to: {turn: 3, phase: "MAIN1"}}, ...ten]);
  eq([mana(t, "Forest").includes('{"C":2}'), castable(t)], [true, true], "turns later: both still");
  const u = run(setup, [...exile, {to: {turn: 3, phase: "MAIN1"}}, ...ten, {cast: EM}]);
  eq(mana(u, "Forest"), ['{"G":1}'], "cast from exile: the Forest's {C}{C} is over");
  eq(legalActions(u, 0).some((a) => a.kind === "cast" && a.label === EM), false, "and nothing more to cast");
}
{
  /* Ward--Sacrifice three permanents: Maya targets it. */
  const setup = [at(0, "battlefield", EM), at(1, "battlefield", "Mountain", "Forest", "Forest", "Bear"), at(1, "hand", "Lightning Bolt")];
  const aim = [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Mountain", seat: 1}, {cast: "Lightning Bolt", seat: 1, targets: [{card: EM}]}, {resolve: true}];
  const s = run(setup, aim);
  eq(s.awaiting?.sacrificeCount, 3, "Maya is asked to sacrifice three permanents");
  const pay = run(setup, [...aim, {answer: [0]}]);
  const which = unlessPays.choice(pay, pay.awaiting);
  eq([which.mode, which.min, which.max, which.options.map((o) => o.label)], ["many", 3, 3, ["Mountain", "Forest", "Forest", "Bear"]], "paying: which three of Maya's, asked next");
  assert.throws(() => unlessPays.apply(structuredClone(pay), pay.awaiting, [0, 1]), /Invalid selection/, "two of three is not paying");
  checks += 1;
  const paid = run(setup, [...aim, {answer: [0]}, {answer: [0, 1, 2]}]);
  eq([paid.stack.length, paid.zones.graveyard[1].length], [1, 3], "three sacrificed: the Bolt stays");
  const not = run(setup, [...aim, {answer: [1]}]);
  eq([not.stack.length, not.zones.graveyard?.[1]?.map((id) => not.objects[id].card)], [0, ["Lightning Bolt"]], "not paid: the Bolt is countered");
  const two = run([at(0, "battlefield", EM), at(1, "battlefield", "Mountain", "Bear"), at(1, "hand", "Lightning Bolt")], aim);
  eq(unlessPays.choice(two, two.awaiting).options.map((o) => o.label), ["Don't pay"], "with only two, Maya cannot pay");
  eq(unlessPays.choice(s, s.awaiting).title, `${EM}: sacrifice 3 permanents?`, "and the question says what paying is");
}

console.log(`engine-exigent: ${checks} checks passed -- a spell's own cast trigger; exiled from hand, cast from exile, and an effect until then; ward of three sacrifices.`);
