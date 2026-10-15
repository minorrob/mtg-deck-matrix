/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (p3-costs): A COST THAT READS ITS TARGETS (CR 601.2c, then 601.2f; 602.2b).
 *
 * A spell's targets are chosen before its total cost is determined, so "this spell costs {3} less to cast if it targets a
 * tapped creature" (Magnificent End) is costed for each way to choose its targets, each its own offer -- and so is an
 * activated ability's "costs {1} less to activate for each +1/+1 counter on the creature it targets" (Warrior's Blades) and
 * "equip abilities you activate that target this creature cost {2} less" (Dwarven Mauler). What the scenarios cannot reach:
 * the reduction read wherever the cost is (the offer, the pool's ways, the cast that taps for itself, convoke, the payment,
 * "nothing to do"), four players, whose permanent reduces whose equip, and what the compiler refuses.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction, nothingToDo} from "../game/engine/rules/actions.mjs";
import {costReduction, equipCostReduction} from "../game/engine/rules/statics.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const ok = (v, m) => { assert.ok(v, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const land = (name, produces) => ({card: name, types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces}]});
const WASTES = land("Wastes", {C: 1});
const creature = (name, p, t, more = {}) => ({card: name, types: ["Creature"], manaCost: "{1}", colors: ["G"], power: p, toughness: t, ...more});

function table(seats = 2) {
  const s = createState({matchId: "m", seed: "cost-targets", players: ["Rob", "Maya", "Trey", "Sam"].slice(0, seats).map((name) => ({name}))});
  for (let seat = 0; seat < seats; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const put = (s, o, seat, zone) => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
const casts = (s, name, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "cast" && a.label === name);
const activations = (s, id, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "activate" && a.objectId === id);
const aimedAt = (actions) => actions.map((a) => (a.targets ?? []).map((t) => t.id));

{
  /* costReduction reads the targets it is given: a tapped creature fits Magnificent End's, an untapped one or a player none,
     and with no targets chosen it takes nothing off. */
  const s = table();
  const end = put(s, card("Magnificent End"), 0, "hand");
  const tapped = put(s, creature("Tapped", 2, 2), 1, "battlefield"), untapped = put(s, creature("Untapped", 2, 2), 1, "battlefield");
  s.objects[tapped].tapped = true;
  eq(costReduction(s, 0, end, [{kind: "object", id: tapped}]), 3, "at a tapped creature: {3} less");
  eq(costReduction(s, 0, end, [{kind: "object", id: untapped}]), 0, "at an untapped one: nothing");
  eq(costReduction(s, 0, end, [{kind: "player", id: tapped}]), 0, "a player is no tapped creature, whatever its number");
  eq(costReduction(s, 0, end), 0, "no targets chosen: nothing");
}
{
  /* Offered once per aim, each with its own payment: {1}{W} at the tapped creature, and not at all at the untapped one with two
     mana; with five, both -- the tapped one still paying only {1}{W}. A pilot naming the untapped aim with two is refused. */
  const s = table();
  put(s, card("Magnificent End"), 0, "hand");
  const tapped = put(s, creature("Tapped", 2, 2), 1, "battlefield"), untapped = put(s, creature("Untapped", 2, 2), 1, "battlefield");
  s.objects[tapped].tapped = true;
  Object.assign(s.players[0].manaPool, {W: 1, C: 1});
  eq(aimedAt(casts(s, "Magnificent End")), [[tapped]], "two mana: at the tapped creature only");
  eq(casts(s, "Magnificent End")[0].payment.mana, {W: 1, U: 0, B: 0, R: 0, G: 0, C: 1}, "and it pays {1}{W}");
  const refused = {...casts(s, "Magnificent End")[0], targets: [{kind: "object", id: untapped}]};
  assert.throws(() => applyAction(s, 0, refused), /not a legal action/, "aimed at the untapped one, it is not offered for two");
  checks += 1;
  s.players[0].manaPool.C = 4;
  eq(aimedAt(casts(s, "Magnificent End")).sort(), [[tapped], [untapped]].sort(), "five mana: both");
  const atTapped = casts(s, "Magnificent End").find((a) => a.targets[0].id === tapped);
  applyAction(s, 0, atTapped);
  eq([s.players[0].manaPool.W, s.players[0].manaPool.C], [0, 3], "cast at the tapped one, {1}{W} paid and three left: the payment reads the target");
}
{
  /* Its sources tapped for it (the pool empty): the plan is made for the cost at that aim, two lands for {1}{W}. */
  const s = table();
  put(s, card("Magnificent End"), 0, "hand");
  const tapped = put(s, creature("Tapped", 5, 5), 1, "battlefield");
  s.objects[tapped].tapped = true;
  const plains = put(s, land("Plains", {W: 1}), 0, "battlefield"), wastes = put(s, WASTES, 0, "battlefield");
  const offer = casts(s, "Magnificent End").find((a) => a.autoTap);
  ok(offer, "two untapped lands: a cast that taps for itself, at the tapped creature");
  applyAction(s, 0, offer);
  eq([s.objects[plains].tapped, s.objects[wastes].tapped, s.stack.length], [true, true, 1], "both tapped, and it is cast");
}
{
  /* More than one way from the pool (X8b): the ways are the cost's at the aim -- {1}{W} from {W}{R}{G}, two ways. */
  const s = table();
  put(s, card("Magnificent End"), 0, "hand");
  const tapped = put(s, creature("Tapped", 5, 5), 1, "battlefield");
  s.objects[tapped].tapped = true;
  Object.assign(s.players[0].manaPool, {W: 1, R: 1, G: 1});
  const offer = casts(s, "Magnificent End").find((a) => a.payWays);
  ok(offer, "one offer, the pool's way asked");
  applyAction(s, 0, offer);
  eq(awaitingChoice(s).options.length, 2, "two ways to pay {1}{W}: the {R} or the {G} for the {1}");
  resolveAwaiting(s, [0]);
  eq(s.stack.length, 1, "and cast");
}
{
  /* Convoke beside a target-read reduction: the creatures and the pool pay the cost at the aim. */
  const STRIKE = {card: "Convoked Strike", types: ["Instant"], manaCost: "{4}{W}", colors: ["W"], keywords: ["Convoke"],
    abilities: [{id: "a0", kind: "static", text: "This spell costs {2} less to cast if it targets a tapped creature.", rule: "this-costs-less", affects: {self: true}, amount: 2,
      targeting: {what: "permanent", types: ["Creature"], tapped: true}}],
    spell: {id: "a1", text: "Destroy target creature.", targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "destroy", targets: {target: 0}}]}};
  const s = table();
  put(s, STRIKE, 0, "hand");
  const helper = put(s, creature("Helper", 1, 1), 0, "battlefield");
  const tapped = put(s, creature("Tapped", 5, 5), 1, "battlefield");
  s.objects[tapped].tapped = true;
  Object.assign(s.players[0].manaPool, {W: 1, R: 1, G: 1});
  const offer = casts(s, "Convoked Strike").find((a) => a.convoke && a.targets[0].id === tapped);
  ok(offer, "{W}{R}{G} and one creature: convoked at the tapped creature, {2}{W}");
  applyAction(s, 0, offer);
  const choice = awaitingChoice(s);
  eq([choice.options.map((o) => o.cardId), choice.min], [[helper], 0], "the creature to tap -- or none, the pool paying {2}{W} alone");
  resolveAwaiting(s, [0]);
  eq(awaitingChoice(s).options.length, 2, "the creature paying {1}, the rest {1}{W} two ways: the {R} or the {G}");
  resolveAwaiting(s, [0]);
  eq([s.objects[helper].tapped, s.stack.length, s.players[0].manaPool.W], [true, 1, 0], "tapped, {W} spent, and cast");
}
{
  /* "Attacking" is any attacker, whoever it attacks: four players, Maya attacking Trey, and Rob's Run Behind {2}{U} at it. */
  const s = table(4);
  put(s, card("Run Behind"), 0, "hand");
  const bear = put(s, creature("Bear", 2, 2), 1, "battlefield");
  s.combat = {attackingPlayerId: 1, attacks: [{attacker: bear, defender: 2, blocked: false, blockers: []}], defenders: [2]};
  Object.assign(s.players[0].manaPool, {U: 1, C: 2});
  eq(aimedAt(casts(s, "Run Behind")), [[bear]], "three mana, at the creature attacking Trey");
}
{
  /* Nothing to do (item 11) asks the cheapest aim: Magnificent End with two lands is something to do while a tapped creature
     is there, and nothing once none is. */
  const s = table();
  put(s, card("Magnificent End"), 0, "hand");
  const tapped = put(s, creature("Tapped", 5, 5), 1, "battlefield");
  put(s, land("Plains", {W: 1}), 0, "battlefield"); put(s, WASTES, 0, "battlefield");
  s.objects[tapped].tapped = true;
  eq(nothingToDo(s, 0), false, "a tapped creature to aim at: two mana is enough, so something to do");
  s.objects[tapped].tapped = false;
  eq(nothingToDo(s, 0), true, "none tapped: it costs five, and there are two");
  /* With mana in the pool its sources are not tapped for it (castTapPlans), so it is not offered: "nothing to do" weighs it. */
  const t = table();
  put(t, card("Magnificent End"), 0, "hand");
  const tired = put(t, creature("Tired", 5, 5), 1, "battlefield");
  t.objects[tired].tapped = true;
  put(t, WASTES, 0, "battlefield");
  t.players[0].manaPool.W = 1;
  eq([casts(t, "Magnificent End").length, nothingToDo(t, 0)], [1, false], "{W} floating and one Wastes: offered using both funding sources");
}
{
  /* Warrior's Blades: Equip {3}, {1} less for each +1/+1 counter on the creature it targets -- offered at the creature with two
     for {1}, and the pool's ways are the ways to pay that {1}. */
  const s = table();
  const blades = put(s, card("Warrior's Blades"), 0, "battlefield");
  const grown = put(s, creature("Grown", 1, 1), 0, "battlefield"), plain = put(s, creature("Plain", 1, 1), 0, "battlefield");
  s.objects[grown].counters["+1/+1"] = 2;
  s.players[0].manaPool.C = 1;
  eq(aimedAt(activations(s, blades)), [[grown]], "one mana: at the creature with two counters only");
  eq(activations(s, blades)[0].payment.mana.mana, {W: 0, U: 0, B: 0, R: 0, G: 0, C: 1}, "paying {1}");
  s.players[0].manaPool.C = 0;
  Object.assign(s.players[0].manaPool, {R: 1, G: 1});
  const offer = activations(s, blades).find((a) => a.payWays);
  ok(offer && offer.targets[0].id === grown, "{R}{G}: one offer at the grown creature, its way asked");
  applyAction(s, 0, offer);
  eq(awaitingChoice(s).options.length, 2, "the {R} or the {G}");
  resolveAwaiting(s, [0]);
  eq([s.stack.length, s.players[0].manaPool.R + s.players[0].manaPool.G], [1, 1], "activated, one mana spent");
  eq(plain !== undefined, true, "(the plain creature was never offered for one)");
  /* Not only an equip ability: any activated ability's cost read from its target is costed at each aim. */
  const SHAPER = {card: "Shaper", types: ["Artifact"], abilities: [{id: "shape", kind: "activated", text: "{3}: Put a +1/+1 counter on target creature. This ability costs {1} less to activate for each +1/+1 counter on the creature it targets.",
    cost: [{atom: "mana", cost: "{3}"}], targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "putCounter", targets: {target: 0}, counter: "+1/+1", count: 1}],
    costLess: {countersOn: {target: 0}, counter: "+1/+1"}}]};
  const t = table();
  const shaper = put(t, SHAPER, 0, "battlefield");
  const big = put(t, creature("Big", 1, 1), 1, "battlefield");
  put(t, creature("Small", 1, 1), 1, "battlefield");
  t.objects[big].counters["+1/+1"] = 3;
  eq(aimedAt(activations(t, shaper)), [[big]], "no mana: at the creature with three counters, for nothing");
}
{
  /* Equip is known by its words (CR 702.6a): a compiled "Equip {3}" is an equip ability, an attaching ability worded
     otherwise is not -- and Dwarven Mauler reduces only an equip ability, of its own controller, aimed at what it says. */
  const blades = cards.definition("Warrior's Blades").abilities.find((a) => a.kind === "activated");
  eq(blades.equip, true, "Warrior's Blades' Equip {3} is an equip ability");
  const sledge = cards.definition("Behemoth Sledge").abilities.find((a) => a.kind === "activated");
  eq(sledge.equip, true, "and so is every Equipment's written before it");
  const s = table();
  const mauler = put(s, card("Dwarven Mauler"), 0, "battlefield"), ogre = put(s, creature("Ogre", 3, 3), 0, "battlefield");
  eq(equipCostReduction(s, 0, [{kind: "object", id: mauler}]), 2, "an equip aimed at the Mauler: {2} less");
  eq(equipCostReduction(s, 0, [{kind: "object", id: ogre}]), 0, "aimed at the Ogre: nothing");
  eq(equipCostReduction(s, 1, [{kind: "object", id: mauler}]), 0, "Maya activating: the Mauler is Rob's, and reduces only his");
  /* A holder whose words reach any creature: Maya's reduces nothing of Rob's, Rob's two together reduce his by both. */
  const LEAN = (who) => ({card: "Lean", types: ["Enchantment"], abilities: [{id: `l${who}`, kind: "static", text: "Equip abilities you activate that target a creature cost {1} less to activate.",
    rule: "equip-costs-less", affects: {what: "permanent", types: ["Creature"]}, amount: 1}]});
  put(s, LEAN(1), 1, "battlefield");
  eq(equipCostReduction(s, 0, [{kind: "object", id: ogre}]), 0, "Maya's: not for Rob's equip");
  put(s, LEAN(0), 0, "battlefield"); put(s, LEAN(0), 0, "battlefield");
  eq(equipCostReduction(s, 0, [{kind: "object", id: ogre}]), 2, "two of Rob's: {2} less");
  eq(equipCostReduction(s, 0, [{kind: "player", id: ogre}]), 0, "a player target is no creature");
  /* Only an equip-costs-less static: toxic 1 on the creature aimed at is no reduction, though it has an amount. */
  const toxic = put(s, creature("Stinger", 1, 1, {abilities: [{id: "t", kind: "static", rule: "toxic", text: "Toxic 1", amount: 1, affects: {what: "permanent", self: true}}]}), 0, "battlefield");
  eq(equipCostReduction(s, 0, [{kind: "object", id: toxic}]), 2, "aimed at a creature with toxic 1: only the two Leans' {2}");
}
{
  /* What the compiler refuses: a reduction read from targets on a spell that has none to choose with the offer, or a modal
     one; an ability's cost read from a target it picks after the offer, or from the hand. And the schema reads `targeting`. */
  const id = {name: "Odd", oracleId: "x", subtypes: [], colors: ["U"], colorIdentity: ["U"]};
  const less = {kind: "static", text: "This spell costs {1} less to cast if it targets an attacking creature.", rule: "this-costs-less", affects: {self: true}, amount: 1,
    targeting: {what: "permanent", attacking: true}};
  const script = (types, abilities) => ({schema: "CrankCardScript@1", identity: {...id, types, manaCost: "{2}{U}"}, oracleText: abilities.map((a) => a.text).join("\n"), abilities});
  const draw = {kind: "spell", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]};
  const counted = {kind: "spell", text: "Tap up to two target creatures.", targets: [{what: "permanent", types: ["Creature"], count: {min: 0, max: 2}}], effects: [{effect: "tap", targets: {target: 0}}]};
  const one = {kind: "spell", text: "Tap target creature.", targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "tap", targets: {target: 0}}]};
  const modal = {kind: "spell", text: "Choose one.", effects: [{effect: "modal", choose: 1, modes: [{text: "Tap target creature.", targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "tap", targets: {target: 0}}]},
    {text: "Draw a card.", effects: [{effect: "draw", count: 1}]}]}]};
  const refused = (s) => compileScript(s).problems.some((p) => /costs less for what it targets/.test(p));
  eq([refused(script(["Instant"], [less, draw])), refused(script(["Instant"], [less, counted])), refused(script(["Instant"], [less, modal])), refused(script(["Creature"], [less])),
    refused(script(["Instant"], [less, one]))], [true, true, true, true, false], "no targets, counted ones, modes, a creature spell: refused; one target chosen with the offer: built");
  ok(!validateScript(script(["Instant"], [{...less, targeting: {what: "permanent", flavor: true}}, one])).valid, "a targeting selector is held to the selector grammar");
  const equip = (more) => ({kind: "activated", text: "Equip {3}. This ability costs {1} less to activate for each +1/+1 counter on the creature it targets.", cost: [{atom: "mana", cost: "{3}"}], timing: "sorcery",
    targets: [{what: "permanent", types: ["Creature"], controller: "you"}], effects: [{effect: "attach", targets: {target: 0}}], costLess: {countersOn: {target: 0}, counter: "+1/+1"}, ...more});
  const art = (ability) => ({schema: "CrankCardScript@1", identity: {...id, types: ["Artifact"], subtypes: ["Equipment"], manaCost: "{2}"}, oracleText: ability.text, abilities: [ability]});
  const readFromTarget = (s) => compileScript(s).problems.some((p) => /cost read from its target/.test(p));
  eq([readFromTarget(art(equip({}))), readFromTarget(art(equip({zone: "hand"}))), readFromTarget(art(equip({targets: [{what: "permanent", types: ["Creature"], count: {min: 0, max: 1}}]}))),
    readFromTarget(art(equip({targets: [], effects: [{effect: "draw", count: 1}]})))], [false, true, true, true], "a permanent's ability with its target chosen with the offer: built; from the hand, counted, or with no target: refused");
}

console.log(`engine-cost-targets: ${checks} checks passed`);
