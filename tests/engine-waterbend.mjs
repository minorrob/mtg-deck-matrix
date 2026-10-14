/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (p3-costs): WATERBEND (CR 701.67) AS AN ACTIVATED ABILITY'S COST.
 *
 * "Waterbend {3}" is "pay {3}; for each generic mana in it, you may tap an untapped artifact or creature you control rather
 * than pay that mana" (701.67a) -- only the waterbend cost's own generic mana, never an increase on it (701.67b). Offered
 * beside the payment the pool makes alone: one offer that taps some, which ones asked once it is taken, then which mana pays
 * the rest. What the scenarios cannot reach: what may be tapped, the range, an increase and a reduction, the picks the
 * payment refuses, the pool's question, the house pilot's answer, blocking, and what the compiler refuses.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction, costAtomBuilt} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {addRider, ridersOf} from "../game/engine/rules/restricted-mana.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const ok = (v, m) => { assert.ok(v, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const land = (name, produces) => ({card: name, types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces}]});
const WASTES = land("Wastes", {C: 1});
const creature = (name, p = 1, t = 1, more = {}) => ({card: name, types: ["Creature"], manaCost: "{1}", colors: ["G"], power: p, toughness: t, ...more});
const ROCK = {card: "Rock", types: ["Artifact"], manaCost: "{1}"};

function table() {
  const s = createState({matchId: "m", seed: "waterbend", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const put = (s, o, seat, zone) => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
const activations = (s, id) => legalActions(s, 0).filter((a) => a.kind === "activate" && a.objectId === id);
const bendOffer = (s, id) => activations(s, id).find((a) => a.waterbend === true);

{
  /* What may be tapped: an untapped artifact or creature of Rob's -- the Koi itself, a creature that came this turn -- never a
     tapped one, a land, an enchantment or Maya's. The fewest the pool leaves, the most the cost's generic mana allows. */
  const s = table();
  const koi = put(s, card("Giant Koi"), 0, "battlefield"), rock = put(s, ROCK, 0, "battlefield"), fresh = put(s, creature("Fresh"), 0, "battlefield");
  const tired = put(s, creature("Tired"), 0, "battlefield");
  s.objects[tired].tapped = true;
  put(s, {card: "Charm", types: ["Enchantment"]}, 0, "battlefield"); put(s, WASTES, 0, "battlefield"); put(s, creature("Hers"), 1, "battlefield");
  eq(activations(s, koi).map((a) => a.waterbend === true), [true], "an empty pool: only the offer that waterbends");
  const offer = bendOffer(s, koi);
  eq(offer.payment, null, "its mana asked once it is taken");
  applyAction(s, 0, offer);
  const choice = awaitingChoice(s);
  eq([choice.cost, choice.min, choice.max], ["waterbend", 3, 3], "three to tap, of three there are");
  eq(choice.options.map((o) => o.cardId).sort(), [koi, rock, fresh].sort(), "the Koi, the Rock and the creature that came this turn");
  /* The house pilot taps the fewest it must. */
  eq(housePilot({seat: 0, cards: (n) => cards.definition(n)}).answer(projectFor(s, 0), choice).indices.length, 3, "the house pilot taps the three");
  const events = resolveAwaiting(s, choice.options.map((o) => o.index));
  eq([s.objects[koi].tapped, s.objects[rock].tapped, s.objects[fresh].tapped, s.stack.length], [true, true, true, 1], "all three tapped, the ability on the stack");
  eq(events.filter((e) => e.kind === "GameEventCardTapped").length, 3, "each tapped, as a cost is paid");
}
{
  /* With mana in the pool: none need be tapped, two at most; and the rest asked of the pool when it pays more than one way --
     {2} from {U}{R}{C}, three ways. */
  const s = table();
  const koi = put(s, card("Giant Koi"), 0, "battlefield"), rock = put(s, ROCK, 0, "battlefield");
  Object.assign(s.players[0].manaPool, {U: 1, R: 1, C: 1});
  eq(activations(s, koi).length, 2, "three mana: the pool's payment, and the one that waterbends");
  applyAction(s, 0, bendOffer(s, koi));
  const choice = awaitingChoice(s);
  eq([choice.min, choice.max], [0, 2], "none to tap at least, two at most (the Koi and the Rock)");
  resolveAwaiting(s, [choice.options.find((o) => o.cardId === rock).index]);
  const pool = awaitingChoice(s);
  eq([pool.cost, pool.options.length], ["pool", 3], "the rest, {2}, from {U}{R}{C}: three ways, the caster's to choose");
  resolveAwaiting(s, [0]);
  eq([s.stack.length, s.players[0].manaPool.U + s.players[0].manaPool.R + s.players[0].manaPool.C, s.objects[rock].tapped, s.objects[koi].tapped], [1, 1, true, false],
    "the Rock tapped, two mana spent, one left");
}
{
  /* An increase is mana, not waterbend (CR 701.67b): Tithe Taker's {1} more is paid from the pool. And a reduction lowers what
     may be tapped: never more than is left to pay. */
  const s = table();
  const koi = put(s, card("Giant Koi"), 0, "battlefield");
  for (const name of ["A", "B", "C", "D"]) put(s, creature(name), 0, "battlefield");
  put(s, {card: "Taker", types: ["Artifact"], abilities: [{id: "t", kind: "static", text: "Abilities your opponents activate cost {1} more.", rule: "abilities-cost-more",
    affects: {what: "player", who: "opponent"}, amount: 1}]}, 1, "battlefield");
  eq(bendOffer(s, koi), undefined, "{4} in all and an empty pool: three may be tapped, and the {1} more is the pool's");
  s.players[0].manaPool.C = 1;
  const taxed = bendOffer(s, koi);
  const four = s.zones.battlefield.filter((id) => s.objects[id].card.length === 1);
  assert.throws(() => applyAction(s, 0, {...taxed, waterbendTap: four}), /cannot be paid/, "four tapped for {4}: the {1} more is no waterbend's");
  checks += 1;
  applyAction(s, 0, taxed);
  eq([awaitingChoice(s).min, awaitingChoice(s).max], [3, 3], "one mana: three tapped, the pool the {1} more");
  const LESS = {card: "Pool", types: ["Creature"], manaCost: "{1}", power: 1, toughness: 1, abilities: [{id: "p", kind: "activated", text: "Waterbend {3}: Draw a card. This ability costs {2} less to activate.",
    cost: [{atom: "waterbend", cost: "{3}"}], targets: [], effects: [{effect: "draw", count: 1}], costLess: 2}]};
  const t = table();
  const pool = put(t, LESS, 0, "battlefield");
  put(t, creature("E"), 0, "battlefield"); put(t, creature("F"), 0, "battlefield");
  applyAction(t, 0, bendOffer(t, pool));
  eq([awaitingChoice(t).min, awaitingChoice(t).max], [1, 1], "{2} less leaves {1}: one to tap, no more");
}
{
  /* Picks the payment refuses: one tapped, twice the same, a land, Maya's -- and too many, or too few for the pool. */
  const s = table();
  const koi = put(s, card("Giant Koi"), 0, "battlefield"), rock = put(s, ROCK, 0, "battlefield"), bear = put(s, creature("Bear"), 0, "battlefield");
  const cub = put(s, creature("Cub"), 0, "battlefield"), tired = put(s, creature("Tired"), 0, "battlefield"), field = put(s, WASTES, 0, "battlefield");
  const hers = put(s, creature("Hers"), 1, "battlefield");
  s.objects[tired].tapped = true;
  const offer = bendOffer(s, koi);
  for (const [waterbendTap, why] of [[[koi, rock, tired], "a tapped creature"], [[koi, rock, rock], "one twice"], [[koi, rock, field], "a land"], [[koi, rock, hers], "Maya's creature"]])
    assert.throws(() => applyAction(s, 0, {...offer, waterbendTap}), /untapped artifacts and creatures you control/, why);
  checks += 4;
  assert.throws(() => applyAction(s, 0, {...offer, waterbendTap: [koi, rock, bear, cub]}), /cannot be paid/, "four for {3}: one too many");
  assert.throws(() => applyAction(s, 0, {...offer, waterbendTap: [koi, rock]}), /cannot be paid/, "two, and nothing in the pool for the third");
  checks += 2;
  eq([s.objects[koi].tapped, s.objects[rock].tapped, s.stack.length], [false, false, 0], "nothing tapped, nothing on the stack");
  /* The pool's own offer with picks beside it is still the pool's: nothing tapped, all of it paid. */
  s.players[0].manaPool.C = 3;
  const plain = activations(s, koi).find((a) => a.waterbend !== true);
  applyAction(s, 0, {...plain, waterbendTap: [rock, bear]});
  eq([s.players[0].manaPool.C, s.objects[rock].tapped, s.objects[bear].tapped], [0, false, false], "the pool's payment: {3} paid, the picks ignored");
}
{
  /* "This creature can't be blocked this turn": Maya's Wall is offered no block on the Koi once it has waterbent. And Foggy
     Swamp Vinebender can't be blocked by her 2/1, only by her 3/3. */
  const s = table();
  const koi = put(s, card("Giant Koi"), 0, "battlefield"), vine = put(s, card("Foggy Swamp Vinebender"), 0, "battlefield");
  for (const id of [koi, vine]) s.objects[id].controlledSinceTurn = -1;
  for (const name of ["A", "B", "C"]) put(s, creature(name), 0, "battlefield");
  put(s, creature("Wall", 0, 7), 1, "battlefield"); put(s, creature("Goblin", 2, 1), 1, "battlefield"); put(s, creature("Beast", 3, 3), 1, "battlefield");
  applyAction(s, 0, bendOffer(s, koi));
  resolveAwaiting(s, awaitingChoice(s).options.filter((o) => ["A", "B", "C"].includes(o.label)).map((o) => o.index));
  const until = (kind) => {
    for (let n = 0; n < 500 && s.awaiting?.kind !== kind; n += 1) {
      if (s.awaiting) throw new Error(`asked ${s.awaiting.kind} on the way to ${kind}`);
      if (s.priorityPlayer === null) advance(s);
      else if (passPriority(s).outcome === "step-ends") advance(s);
    }
    return awaitingChoice(s);
  };
  const attack = until("declare-attackers");
  resolveAwaiting(s, attack.options.filter((o) => [koi, vine].includes(o.cardId)).map((o) => o.index));
  const blocks = until("declare-blockers").options.map((o) => o.label).sort();
  eq(blocks, ["Beast blocks Foggy Swamp Vinebender"], "no block on the Koi this turn; on the Vinebender only by power 3 or more");
}
{
  /* What the compiler refuses: a waterbend twice, beside other mana, beside {T}, from the hand -- and one of colored mana or X,
     which tapping could not pay. */
  const id = {name: "Odd", oracleId: "x", types: ["Creature"], subtypes: [], manaCost: "{1}{U}", colors: ["U"], colorIdentity: ["U"], power: 1, toughness: 1};
  const ability = (cost, more = {}) => ({kind: "activated", text: "Waterbend {2}: Draw a card.", cost, targets: [], effects: [{effect: "draw", count: 1}], ...more});
  const problems = (a) => compileScript({schema: "CrankCardScript@1", identity: id, oracleText: a.text, abilities: [a]}).problems;
  const bend = {atom: "waterbend", cost: "{2}"};
  eq(problems(ability([bend])), [], "Waterbend {2}: built");
  for (const [cost, more, why] of [[[bend, bend], {}, "twice"], [[bend, {atom: "mana", cost: "{U}"}], {}, "beside {U}"], [[bend, {atom: "{T}"}], {}, "beside {T}"],
    [[bend, {atom: "discard", self: true}], {zone: "hand"}, "from the hand"]])
    ok(problems(ability(cost, more)).some((p) => /waterbend cost is a permanent's ability's only mana/.test(p)), `refused: ${why}`);
  eq([costAtomBuilt({atom: "waterbend", cost: "{3}"}), costAtomBuilt({atom: "waterbend", cost: "{2}{U}"}), costAtomBuilt({atom: "waterbend", cost: "{X}"}), costAtomBuilt({atom: "waterbend", cost: "{0}"}),
    costAtomBuilt({atom: "waterbend", cost: "nonsense"})], [true, false, false, false, false], "generic mana only, at least {1}");
}

{
  /* The rest paid with rider mana (Path of Ancestry's; rules/restricted-mana.mjs). The offer that waterbends cannot know its
     mana until the permanents are picked, so it names no rider mana: what is left is paid as any cost but a spell's is,
     the plain mana first and the rider mana after (a library game, 2026-10-11: the offer said "none of it" for a cost it
     took as nothing, and an AI seat's waterbend was refused part-way, its ability already on the stack). */
  const s = table();
  const koi = put(s, card("Giant Koi"), 0, "battlefield"), fresh = put(s, creature("Fresh"), 0, "battlefield");
  const path = put(s, {card: "Path", types: ["Land"]}, 0, "battlefield");
  s.players[0].manaPool.C = (s.players[0].manaPool.C ?? 0) + 2;
  addRider(s, 0, {C: 2}, {spell: {types: ["Creature"]}, effects: [], text: "scry 1"}, path);
  const offer = bendOffer(s, koi);
  eq(offer.riders, undefined, "the waterbend offer names no rider mana: its mana is not known until the permanents are picked");
  applyAction(s, 0, offer);
  const choice = awaitingChoice(s);
  eq([choice.min, choice.max], [1, 2], "one to tap at least, the pool's two paying the rest; two at most, of the Koi and the creature");
  const pick = choice.options.find((o) => o.cardId === fresh).index;
  resolveAwaiting(s, [pick]);
  eq([s.stack.length, s.players[0].manaPool.C ?? 0, ridersOf(s, 0).length, s.objects[fresh].tapped], [1, 0, 0, true],
    "taken: the creature tapped for {1}, the rider mana paying the other {2}, and the ability on the stack");
}

console.log(`engine-waterbend: ${checks} checks passed`);
