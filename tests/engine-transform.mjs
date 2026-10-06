/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A NONMODAL DOUBLE-FACED CARD, AND TRANSFORMING (CR 712.2, 701.27; Venat, Heart of Hydaelyn // Hydaelyn, the Mothercrystal,
 * claude/cards-faces-class).
 *
 * A script that says `layout: "transform"` has both faces, the back reached only by transforming (cards/index.mjs): cast,
 * played and anywhere but the battlefield it is its front face (CR 712.8a, 712.11), never its back. To transform it is to
 * turn it over (state/index.mjs, transformObject; effects/permanents.mjs, setState): the same object (712.18), its counters,
 * damage and effects kept, the back face's characteristics only -- but its mana value its front face's (202.3b, 712.8e) --
 * and a new timestamp (613.7g). An activated or triggered ability of the permanent transforms it only if it has not
 * transformed since the ability was put on the stack (701.27f). A copy is no double-faced card and cannot (712.9); a copy of
 * the back face has mana value 0 (202.3b). A modal double-faced permanent told to transform does (712.3, 712.9), unless
 * into an instant or sorcery face (701.27d). What the scenarios cannot reach is here.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {validateScript, SCRIPT_SCHEMA} from "../game/engine/script/schema.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {characteristicsOf, keywordsOf} from "../game/engine/rules/layers.mjs";
import {selectMatching} from "../game/engine/script/filter.mjs";
import {factsOf} from "../game/engine/script/bind.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {historyLines} from "../game/room/history.mjs";
import {transformObject} from "../game/engine/state/index.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {advance, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {collectTriggers, openTriggers} from "../game/engine/rules/trigger.mjs";
import {endCopies} from "../game/engine/script/effects/permanents.mjs";
import {identityOf} from "../game/engine/cards/compile.mjs";
import {readFileSync} from "node:fs";
import {amountOf} from "../game/engine/script/amount.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const VE = "Venat, Heart of Hydaelyn // Hydaelyn, the Mothercrystal", VENAT = "Venat, Heart of Hydaelyn", HYD = "Hydaelyn, the Mothercrystal";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Relic: {types: ["Artifact"], manaCost: "{2}", colors: [], power: null, toughness: null}};
const run = (setup, steps = [], seats = 2) => runScenario({name: "transform", seats, setup, steps}, index.definition, FIX);
const play = (setup, steps, seats) => run(setup, steps, seats).state;
const named = (s, card) => Object.values(s.objects).filter((o) => o.card === card).map((o) => o.id);
const turn = (s, id, context = {controller: 0, source: null}) => runEffect(s, {effect: "setState", targets: [id], transform: true}, context);
const SUNDER = [...Array.from({length: 7}, () => ({tap: "Wastes"})), {activate: VENAT, targets: [{card: "Relic"}]}];

/* ---- the card, anywhere but the battlefield: its front face, never cast or played as its back (CR 712.8a, 712.11) ---- */
{
  const def = index.definition(VE);
  eq([def.mdfc.transforming, def.mdfc.front.card, def.mdfc.back.card, def.colorIdentity], [true, VENAT, HYD, ["W"]], "compiled with both faces, a card that transforms; its color identity both faces' (CR 903.4)");
  const s = play([at(0, "battlefield", "Plains", "Plains", "Wastes"), at(0, "hand", VE)], [{tap: "Plains"}, {tap: "Plains"}, {tap: "Wastes"}]);
  const [card] = s.zones.hand[0].filter((id) => s.objects[id].card === VENAT);
  eq([s.objects[card].types, s.objects[card].supertypes, s.objects[card].manaCost, s.objects[card].power], [["Creature"], ["Legendary"], "{1}{W}{W}", 3], "in Rob's hand it is Venat: a legendary 3/3 creature costing {1}{W}{W}");
  const ways = legalActions(s, 0).filter((a) => a.objectId === card);
  eq(ways.map((a) => [a.kind, a.label, a.face]), [["cast", VENAT, undefined]], "cast as Venat only: no back face to cast or play (CR 712.11)");
  const bad = validateScript({schema: SCRIPT_SCHEMA, identity: {name: "Probe", oracleId: "p", types: ["Creature"], manaCost: "{1}"}, layout: "transform", abilities: []});
  ok(!bad.valid && bad.errors.some((e) => e.path === "layout"), "a card that says it transforms with no back face is refused by the schema");
  const modal = validateScript({schema: SCRIPT_SCHEMA, identity: {name: "A // B", oracleId: "p", types: ["Creature"], manaCost: "{1}"}, layout: "modal_dfc", abilities: [],
    back: {identity: {name: "B", types: ["Land"]}, abilities: []}});
  ok(!modal.valid && modal.errors.some((e) => e.path === "layout"), "and a layout other than \"transform\" is refused: a modal card says nothing");
  const flip = compileScript({schema: SCRIPT_SCHEMA, identity: {name: "Probe", oracleId: "p", types: ["Creature"], manaCost: "{1}", power: 1, toughness: 1},
    abilities: [{kind: "activated", text: "{T}: Flip this creature.", cost: [{atom: "{T}"}], effects: [{effect: "setState", targets: "self", flip: true}]}]});
  ok(flip.definition === null && flip.problems.some((p) => /flipping and turning face up or down are not built/.test(p)), "setState that flips is refused by name: only a level and transforming are built");
}

/* ---- transformed: the same object, its back face's characteristics, its front face's mana value ---- */
{
  const s = play([at(0, "battlefield", VE), at(1, "battlefield", "Bear")]);
  const [id] = named(s, VENAT);
  s.objects[id].counters["+1/+1"] = 1;
  s.objects[id].damage = 1;
  runEffect(s, {effect: "pump", targets: [id], power: 2, toughness: 2}, {controller: 0, source: null});
  const stamp = s.objects[id].timestamp;
  const events = turn(s, id);
  const c = characteristicsOf(s, id);
  eq([s.objects[id].card, c.types, s.objects[id].subtypes, c.colors, c.power, c.toughness, keywordsOf(s, id)], [HYD, ["Creature"], ["God"], ["W"], 7, 7, ["Indestructible"]],
    "Hydaelyn: a white God, 4/4 printed with its +1/+1 counter and the +2/+2 still applying (CR 712.18) -- 7/7, indestructible");
  eq([named(s, HYD), s.objects[id].counters, s.objects[id].damage, s.objects[id].face, s.objects[id].transforms], [[id], {"+1/+1": 1}, 1, "back", 1], "the same object: its counters and damage stay");
  ok(s.objects[id].timestamp > stamp, "and it has a new timestamp (CR 613.7g)");
  eq([selectMatching(s, {what: "permanent", manaValue: {min: 3, max: 3}}, {controller: 0}), factsOf(s, [{kind: "object", id}])[0].manaValueOf], [[id], 3],
    "its mana value is its front face's, 3, though its back face has no mana cost (CR 202.3b, 712.8e)");
  eq(events.flatMap((e) => historyLines(e, ["Rob", "Maya"]).map((l) => l.text)), [`${VENAT} transformed into ${HYD}`], "the history names both faces, which are public");
  eq(projectFor(s, 1).players[0].zones.Battlefield.cards.map((c) => [c.name, c.power]), [[HYD, 7]], "Maya sees Hydaelyn");
  turn(s, id);
  eq([s.objects[id].card, s.objects[id].face, characteristicsOf(s, id).power, s.objects[id].transforms], [VENAT, undefined, 6, 2], "transformed again: Venat, front face up, still the same object");
}

/* ---- every reader of mana value reads the front face's: a count, and "the greatest mana value" ---- */
{
  const s = play([at(0, "battlefield", VE)]);
  const [id] = named(s, VENAT);
  turn(s, id);
  eq(amountOf(s, {manaValueOf: "self"}, {controller: 0, source: id}), 3, "\"equal to its mana value\": 3 for Hydaelyn");
  const shatter = play([at(0, "battlefield", "Swamp", "Wastes", "Wastes", "Relic"), at(0, "hand", "Soul Shatter"), at(1, "battlefield", VE, "Bear", ...Array(7).fill("Wastes"))],
    [{to: {turn: 2, phase: "MAIN1"}}, ...Array.from({length: 7}, () => ({tap: "Wastes", seat: 1})), {activate: VENAT, seat: 1, targets: [{card: "Relic"}]}, {resolve: true},
      {pass: 1}, {tap: "Swamp", seat: 0}, {tap: "Wastes", seat: 0}, {tap: "Wastes", seat: 0}, {cast: "Soul Shatter", seat: 0}, {resolve: true}, {settle: true}]);
  eq([shatter.zones.graveyard[1].map((x) => shatter.objects[x].card), named(shatter, "Bear").length], [[VENAT], 1],
    "Soul Shatter: Maya sacrifices Hydaelyn, the greatest mana value she controls (3, its front face's), and keeps her Bear (2)");
}

/* ---- "only if it hasn't transformed since the ability was put on the stack" (CR 701.27f) ---- */
{
  const s = play([at(0, "battlefield", VE, ...Array(7).fill("Wastes")), at(1, "battlefield", "Relic")], SUNDER);
  const [id] = named(s, VENAT);
  eq(s.stack.at(-1).sourceTransforms, 0, "Hero's Sundering on the stack remembers that Venat had transformed no times");
  turn(s, id);
  eq(s.objects[id].card, HYD, "in answer, something else transforms it: Hydaelyn");
  passPriority(s, null, createRng("transform"));
  passPriority(s, null, createRng("transform"));
  eq([s.stack.length, s.zones.exile.map((x) => s.objects[x].card), s.objects[id].card], [0, ["Relic"], HYD],
    "Hero's Sundering resolves: the Relic exiled, and \"transform Venat\" ignored -- it has transformed since, and stays Hydaelyn");
  const fresh = play([at(0, "battlefield", VE, ...Array(7).fill("Wastes")), at(1, "battlefield", "Relic")], [...SUNDER, {resolve: true}]);
  eq(named(fresh, HYD).length, 1, "and with nothing between, it transforms");
  /* A delayed trigger of the permanent: as it was made. */
  const d = play([at(0, "battlefield", VE)]);
  const [v] = named(d, VENAT);
  runEffect(d, {effect: "delayedTrigger", at: "end step", effects: [{effect: "setState", targets: "self", transform: true}]}, {controller: 0, source: v});
  eq(d.delayedTriggers.at(-1).sourceTransforms, 0, "a delayed trigger it makes remembers its transforms as it is made");
}

/* ---- what cannot transform, and what has no face to turn to (CR 712.9, 701.27c-d) ---- */
{
  const s = play([at(0, "battlefield", VE, "Bear")]);
  const [venat] = named(s, VENAT);
  runEffect(s, {effect: "copyPermanent", targets: [venat]}, {controller: 0, source: venat});
  const token = s.zones.battlefield.find((id) => s.objects[id].token);
  eq([s.objects[token].card, transformObject(s, token), s.objects[token].card], [VENAT, false, VENAT], "a token copy of Venat is no double-faced card: told to transform, it does not (CR 712.9)");
  eq(transformObject(s, named(s, "Bear")[0]), false, "nor does a Bear (CR 701.27c)");
  turn(s, venat);
  runEffect(s, {effect: "copyPermanent", targets: [venat]}, {controller: 0, source: venat});
  const hydCopy = s.zones.battlefield.find((id) => s.objects[id].token && s.objects[id].card === HYD);
  eq(factsOf(s, [{kind: "object", id: hydCopy}])[0].manaValueOf, 0, "a copy of Hydaelyn, the back face, has mana value 0 (CR 202.3b)");
  /* A modal double-faced permanent may be told to transform (CR 712.3): Fell Mire's other face is an instant, so nothing happens. */
  const m = play([at(0, "hand", "Fell the Profane // Fell Mire")], [{play: "Fell Mire"}, {choose: ["Don't pay: Fell Mire enters tapped"]}]);
  const [mire] = named(m, "Fell Mire");
  eq([transformObject(m, mire), m.objects[mire].card], [false, "Fell Mire"], "Fell Mire told to transform: its other face is an instant, and nothing happens (CR 701.27d)");
  eq(factsOf(m, [{kind: "object", id: mire}])[0].manaValueOf, 0, "and a modal card's back face up has that face's mana value, 0 -- the front face's is a nonmodal card's alone (CR 712.8e, 712.8f)");
}

/* ---- a double-faced permanent that is a copy of something else, and a delayed trigger's "transform it" ---- */
{
  const s = play([at(0, "battlefield", VE, "Bear")]);
  const [id] = named(s, VENAT);
  runEffect(s, {effect: "becomeCopy", targets: [named(s, "Bear")[0]], until: "end-of-turn"}, {controller: 0, source: id});
  turn(s, id);
  eq([s.objects[id].card, characteristicsOf(s, id).power, s.objects[id].face, factsOf(s, [{kind: "object", id}])[0].manaValueOf], ["Bear", 2, "back", 2],
    "Venat, a copy of the Bear this turn, transforms: still the Bear's copy, with the Bear's mana value -- its own card turned over beneath (CR 712.9's example)");
  endCopies(s);
  eq([s.objects[id].card, characteristicsOf(s, id).power, factsOf(s, [{kind: "object", id}])[0].manaValueOf], [HYD, 4, 3], "the copy ends: Hydaelyn, mana value 3");
}
{
  /* "At the beginning of the next end step, transform it", made by Venat; transformed meanwhile, the instruction is ignored. */
  const s = play([at(0, "battlefield", VE)]);
  const [id] = named(s, VENAT);
  runEffect(s, {effect: "delayedTrigger", at: "end step", effects: [{effect: "setState", targets: "self", transform: true}]}, {controller: 0, source: id});
  turn(s, id);
  const rng = createRng("transform");
  for (let n = 0; n < 60 && !(s.phase === "END_OF_TURN" && s.stack.length); n += 1) {
    if (s.awaiting) resolveAwaiting(s, []);
    else if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s, null, rng).outcome === "step-ends") advance(s);
  }
  eq(s.stack.at(-1)?.sourceTransforms, 0, "at the end step its trigger carries the transforms Venat had as it was made");
  passPriority(s, null, rng); passPriority(s, null, rng);
  eq([s.stack.length, s.objects[id].card], [0, HYD], "and resolves to nothing: it stays Hydaelyn (CR 701.27f)");
  /* "When a creature dies this turn, transform it": the same, for one that waits for an event. */
  const t = play([at(0, "battlefield", VE, "Bear")]);
  const [v] = named(t, VENAT);
  runEffect(t, {effect: "delayedTrigger", on: {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "any"}, thisTurn: true,
    effects: [{effect: "setState", targets: "self", transform: true}]}, {controller: 0, source: v});
  collectTriggers(t, []);
  turn(t, v);
  collectTriggers(t, runEffect(t, {effect: "destroy", targets: named(t, "Bear")}, {controller: 0, source: null}));
  openTriggers(t);
  eq(t.stack.at(-1)?.sourceTransforms, 0, "the Bear dies: the trigger goes on the stack with the transforms Venat had as it was made");
  passPriority(t, null, rng); passPriority(t, null, rng);
  eq(t.objects[v].card, HYD, "and it stays Hydaelyn");
}
{
  /* A nonmodal card whose back face is a land is never played as that face (CR 712.11); its identity is its front face's. */
  const PROBE = "Probe Front // Probe Land";
  const probe = compileScript({schema: SCRIPT_SCHEMA, identity: {name: PROBE, oracleId: "probe-tdfc", types: ["Creature"], manaCost: "{1}", colors: [], power: 1, toughness: 1},
    layout: "transform", abilities: [], back: {identity: {name: "Probe Land", types: ["Land"], manaCost: null, colors: []}, oracleText: "", abilities: []}}).definition;
  const s = runScenario({name: "transform", setup: [at(0, "hand", PROBE)], steps: []}, (n) => (n === PROBE ? structuredClone(probe) : index.definition(n)), FIX).state;
  eq(legalActions(s, 0).filter((a) => a.kind === "play-land").length, 0, "a transforming card with a land on its back is not offered as a land");
  const card = JSON.parse(readFileSync(new URL("../data/engine/oracle.json", import.meta.url), "utf8")).cards.find((c) => c.name === VE);
  const identity = identityOf(card);
  eq([identity.name, identity.supertypes, identity.types, identity.subtypes, identity.manaCost, identity.colors, identity.power], [VE, ["Legendary"], ["Creature"], ["Elder", "Wizard"], "{1}{W}{W}", ["W"], 3],
    "the compiler's identity of the oracle's transform card is its front face's, under the whole card's name");
}

/* ---- it leaves, and is its front face; Blessing of Light's indestructible lasts until Rob's next turn, in four seats ---- */
{
  const s = play([at(0, "battlefield", VE, "Bear")]);
  const [id] = named(s, VENAT);
  turn(s, id);
  runEffect(s, {effect: "moveZone", targets: [id], to: "hand"}, {controller: 0, source: null});
  const [card] = s.zones.hand[0].filter((x) => s.objects[x].card === VENAT);
  eq([s.objects[card].face, s.objects[card].power], [undefined, 3], "returned to Rob's hand, it is Venat again (CR 712.8a)");
  runEffect(s, {effect: "moveZone", targets: [card], to: "battlefield"}, {controller: 0, source: null});
  eq(named(s, VENAT).filter((x) => s.objects[x].zone === "battlefield").length, 1, "and put onto the battlefield, it enters front face up (CR 712.14)");
  const four = play([at(0, "battlefield", VE, "Bear", ...Array(7).fill("Wastes")), at(1, "battlefield", "Relic")],
    [...SUNDER, {resolve: true}, {to: {turn: 1, phase: "COMBAT_BEGIN"}}, {choose: ["Bear"]}, {resolve: true}, {to: {turn: 4, phase: "MAIN1"}}], 4);
  const bear = named(four, "Bear")[0];
  eq([four.objects[bear].counters["+1/+1"], keywordsOf(four, bear).includes("Indestructible")], [1, true], "four seats: the Bear has its counter, and is indestructible through Sam's turn");
  const next = play([at(0, "battlefield", VE, "Bear", ...Array(7).fill("Wastes")), at(1, "battlefield", "Relic")],
    [...SUNDER, {resolve: true}, {to: {turn: 1, phase: "COMBAT_BEGIN"}}, {choose: ["Bear"]}, {resolve: true}, {to: {turn: 5, phase: "UPKEEP"}}], 4);
  eq(keywordsOf(next, named(next, "Bear")[0]).includes("Indestructible"), false, "and not once Rob's next turn has begun");
}

console.log(`engine-transform: ${checks} checks passed -- a card that transforms: its front face until it turns over, then the same object with its back face's characteristics and its front face's mana value; once per stacking, never a copy.`);
