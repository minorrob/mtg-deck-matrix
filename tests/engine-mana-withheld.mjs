/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "{T}: ADD {C}. THIS MANA CAN'T BE SPENT TO CAST SPELLS FROM YOUR HAND" (Heartwood Crafter // Soul Tether; Train C phase 2,
 * w2a-selectors; CR 106.4, 106.6, 118.12, 601.2h, 722.3c).
 *
 * The mana is in the pool like any other (rules/restricted-mana.mjs, addPoolMana) and pays for everything but a spell cast
 * from its player's hand: an ability, a spell cast from another zone -- a prepare spell's copy in exile, a commander from the
 * command zone -- an "unless" cost. Beside the pool, `withheldMana` says how much of it is such mana: a spell cast from the
 * hand sees the pool less it (poolFor) and spends none of it; anything else spends it first (spendFor), and a spend the
 * engine is not told of -- an "unless" cost, a mana ability's own cost -- is read as having spent it first too (withheldOf),
 * settled before mana is added again. The card's scenarios play the Crafter; this suite holds the rest: the commander,
 * each spend the engine is not told of and each way mana is added after one, the effect's own form, the pool emptying,
 * tapping for a cast, and the compile.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction, tapUnits} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {poolFor, withheldOf} from "../game/engine/rules/restricted-mana.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const CRAFTER = "Heartwood Crafter // Soul Tether", HC = "Heartwood Crafter";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const gain = (cost, n = 3) => ({types: ["Sorcery"], manaCost: cost, colors: [], spell: {id: "s", text: `You gain ${n} life.`, targets: [], effects: [{effect: "gainLife", amount: n}]}});
const FIX = {
  Rite: gain("{1}"),
  Pair: gain("{2}"),
  Relic: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "r", kind: "activated", text: "{1}: You gain 1 life.", cost: [{atom: "mana", cost: "{1}"}], targets: [], effects: [{effect: "gainLife", amount: 1}]}]},
  Toll: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "t", kind: "activated", text: "{T}: You lose 2 life unless you pay {1}.", cost: [{atom: "{T}"}], targets: [],
    effects: [{effect: "unlessPays", who: "you", amount: 1, effects: [{effect: "loseLife", amount: 2}]}]}]},
  Battery: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "b", kind: "mana", tapSelf: true, cost: "{1}", produces: {C: 2}, text: "{1}, {T}: Add {C}{C}."}]},
  Echo: {types: ["Enchantment"], manaCost: "{1}", colors: [], abilities: [{id: "e", kind: "triggered", text: "Whenever you tap a land for mana, add an additional {C}.",
    trigger: {on: "GameEventManaPool", tapper: "you", filter: {types: ["Land"]}, manaAbility: {mana: {C: 1}}}, effects: [{effect: "addMana", mana: {C: 1}}]}]},
  Bargain: {types: ["Sorcery"], manaCost: "{1}", colors: [], spell: {id: "s", text: "You lose 2 life unless you pay {1}. Add {C}{C}.", targets: [],
    effects: [{effect: "unlessPays", who: "you", amount: 1, effects: [{effect: "loseLife", amount: 2}]}, {effect: "addMana", mana: {C: 2}}]}},
  Ritual: {types: ["Sorcery"], manaCost: "{1}", colors: [], spell: {id: "s", text: "Add {C}{C}. This mana can't be spent to cast spells from your hand.", targets: [],
    effects: [{effect: "addMana", mana: {C: 2}, cantSpend: {castFrom: "hand"}}]}},
  Chief: {types: ["Creature"], supertypes: ["Legendary"], manaCost: "{1}", colors: [], power: 1, toughness: 1},
};
const play = (setup, steps = [], seats = 2) => runScenario({name: "heartwood", seats, setup, steps}, index.definition, FIX).state;
const named = (s, card, seat = 0) => [...s.zones.battlefield, ...s.zones.hand[seat], ...s.zones.exile[seat] ?? [], ...s.zones.command[seat] ?? []]
  .find((id) => s.objects[id].card === card && s.objects[id].owner === seat);
const offers = (s, kind, label) => legalActions(s, 0).filter((a) => a.kind === kind && a.label === label);
const C = (s) => s.players[0].manaPool.C;

/* ---- in the pool, and remembered beside it ---- */
{
  const s = play([at(0, "battlefield", CRAFTER, "Relic"), at(0, "hand", "Rite")], [{tap: HC}]);
  eq([C(s), s.players[0].withheldMana.map((e) => [e.key, s.objects[e.source].card, e.cantSpend])], [1, [["C", HC, {castFrom: "hand"}]]], "{C} in the pool, and beside it: the Crafter's, not for a spell from the hand");
  eq([poolFor(s, 0, {spell: named(s, "Rite")}).C, poolFor(s, 0, {ability: named(s, "Relic")}).C], [0, 1], "a spell in the hand sees none of it; an ability sees it");
  eq(offers(s, "cast", "Rite").length, 0, "Rite, in Rob's hand: not offered");
  eq(offers(s, "activate", "Relic").length, 1, "the Relic's {1}: offered");
  const t = play([at(0, "battlefield", "Wastes")], [{tap: "Wastes"}]);
  eq([C(t), "withheldMana" in t.players[0]], [1, false], "a Wastes' {C}: nothing kept beside the pool");
}

/* ---- an ability spends it first: what is left pays for a spell from the hand ---- */
{
  const s = play([at(0, "battlefield", CRAFTER, "Wastes", "Relic"), at(0, "hand", "Rite")], [{tap: HC}, {tap: "Wastes"}, {activate: "Relic"}, {resolve: true}]);
  eq([C(s), s.players[0].withheldMana], [1, []], "the Relic paid with the Crafter's {C}: the Wastes' is left, and none withheld");
  eq(offers(s, "cast", "Rite").length, 1, "so Rite can be cast");
}

/* ---- a commander, cast from the command zone (CR 903.8): not from the hand ---- */
{
  const s = play([at(0, "battlefield", CRAFTER), at(0, "command", "Chief")], [{tap: HC}]);
  eq(poolFor(s, 0, {spell: named(s, "Chief")}).C, 1, "the Chief in the command zone sees the Crafter's {C}");
  applyAction(s, 0, offers(s, "cast", "Chief")[0]);
  eq([C(s), s.players[0].withheldMana, s.stack.length], [0, [], 1], "cast with it");
}

/* ---- spends the engine is not told of: the withheld mana went first ---- */
{
  /* An "unless" cost (CR 118.12): Toll's {1}, from a pool of the Crafter's {C} and the Wastes'. */
  const s = play([at(0, "battlefield", CRAFTER, "Wastes", "Toll"), at(0, "hand", "Rite")], [{tap: HC}, {tap: "Wastes"}, {activate: "Toll"}, {resolve: true}, {choose: ["Pay {1}"]}]);
  eq([s.players[0].life, C(s), withheldOf(s, 0)], [40, 1, []], "Toll paid from the pool: the {C} left is the Wastes'");
  eq(offers(s, "cast", "Rite").length, 1, "and pays for Rite");
  applyAction(s, 0, offers(s, "cast", "Rite")[0]);
  eq([C(s), s.players[0].withheldMana], [0, []], "cast with it: nothing withheld left");
}
{
  /* A mana ability's own cost, then {C}{C} from it (activate-mana): the {C} paid was the Crafter's, the two made are not. */
  const s = play([at(0, "battlefield", CRAFTER, "Battery"), at(0, "hand", "Pair")], [{tap: HC}, {tap: "Battery"}]);
  eq([C(s), s.players[0].withheldMana], [2, []], "the Battery's {1} paid with the Crafter's {C}: {C}{C}, none withheld");
  eq(offers(s, "cast", "Pair").length, 1, "Pair, {2}, can be cast");
}
{
  /* The Great Hall's {1} from the pool, its mana restricted, and the Echo's {C} added to the pool as a triggered mana ability. */
  const s = play([at(0, "battlefield", CRAFTER, "Great Hall of the Citadel", "Echo"), at(0, "hand", "Rite")], [{tap: HC}]);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.objectId === named(s, "Great Hall of the Citadel") && a.abilityId === "a1"));
  eq([C(s), s.players[0].restrictedMana.length, s.players[0].withheldMana], [1, 2, []], "the Hall's {1} paid with the Crafter's {C}; the Echo's {C} is not withheld");
  eq(offers(s, "cast", "Rite").length, 1, "so Rite can be cast with it");
}
{
  /* "You lose 2 life unless you pay {1}. Add {C}{C}" (an effect adds it): the {1} paid with the Crafter's {C}. */
  const s = play([at(0, "battlefield", CRAFTER, "Wastes"), at(0, "hand", "Bargain", "Pair")], [{tap: HC}, {tap: "Wastes"}, {cast: "Bargain"}, {resolve: true}, {choose: ["Pay {1}"]}]);
  eq([s.players[0].life, C(s), s.players[0].withheldMana], [40, 2, []], "Bargain cast with the Wastes', its {1} paid with the Crafter's: {C}{C} added, none withheld");
  eq(offers(s, "cast", "Pair").length, 1, "Pair can be cast");
}
{
  /* Not paid: the Crafter's {C} is still the Crafter's. */
  const s = play([at(0, "battlefield", CRAFTER, "Wastes"), at(0, "hand", "Bargain", "Pair", "Rite")], [{tap: HC}, {tap: "Wastes"}, {cast: "Bargain"}, {resolve: true}, {choose: ["Don't pay"]}]);
  eq([s.players[0].life, C(s), withheldOf(s, 0).length], [38, 3, 1], "Bargain's {1} not paid: {C}{C} added, the Crafter's {C} still withheld");
  eq([offers(s, "cast", "Pair").length, offers(s, "cast", "Rite").length], [1, 1], "two of the three pay for a spell from the hand");
  applyAction(s, 0, offers(s, "cast", "Pair")[0]);
  eq([C(s), withheldOf(s, 0).length, offers(s, "cast", "Rite").length], [1, 1, 0], "Pair paid with the other two: the Crafter's is left, and Rite can't be cast with it");
}

/* ---- the effect's own form: "Add {C}{C}. This mana can't be spent to cast spells from your hand" ---- */
{
  const s = play([at(0, "battlefield", "Wastes", "Relic"), at(0, "hand", "Ritual", "Rite")], [{tap: "Wastes"}, {cast: "Ritual"}, {resolve: true}]);
  eq([C(s), s.players[0].withheldMana.map((e) => [e.key, e.cantSpend])], [2, [["C", {castFrom: "hand"}], ["C", {castFrom: "hand"}]]], "{C}{C} in the pool, both withheld");
  eq([offers(s, "cast", "Rite").length, offers(s, "activate", "Relic").length], [0, 1], "Rite can't be cast with it; the Relic can be activated");
  applyAction(s, 0, offers(s, "activate", "Relic")[0]);
  eq([C(s), withheldOf(s, 0).length], [1, 1], "the Relic's {1} paid with one of them: the other still withheld");
}

/* ---- it empties with the pool (CR 106.4) ---- */
{
  const s = play([at(0, "battlefield", CRAFTER)], [{tap: HC}]);
  for (let n = 0; n < 20 && s.phase === "MAIN1"; n += 1) { if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); }
  eq([s.phase !== "MAIN1", C(s), s.players[0].withheldMana], [true, 0, []], "the main phase over: the pool empty, and nothing withheld");
}

/* ---- tapped for a cast: never the Crafter -- its mana would pay nothing for a spell from the hand ---- */
{
  const s = play([at(0, "battlefield", CRAFTER), at(0, "hand", "Rite")]);
  eq([tapUnits(s, 0).length, offers(s, "cast", "Rite").length], [0, 0], "the Crafter untapped, Rite in hand: nothing to tap for it, no cast");
  const t = play([at(0, "battlefield", CRAFTER, "Wastes"), at(0, "hand", "Rite")]);
  eq(tapUnits(t, 0).map((u) => t.objects[u.id].card), ["Wastes"], "a Wastes beside it: the Wastes is what a cast taps");
}

/* ---- an "unless" cost may tap it: its {C} pays for that ---- */
{
  const s = play([at(0, "battlefield", CRAFTER, "Toll")], [{activate: "Toll"}, {resolve: true}]);
  ok(awaitingChoice(s).options.some((o) => o.label === "Pay {1}"), "Toll asks, and paying is offered: the Crafter can be tapped for it");
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === "Pay {1}").index]);
  eq([s.players[0].life, s.objects[named(s, HC)].tapped], [40, true], "paid: the Crafter tapped");
}

/* ---- the compile ---- */
{
  const mana = index.definition(CRAFTER).abilities.find((a) => a.kind === "mana");
  eq([mana.produces, mana.cantSpend], [{C: 1}, {castFrom: "hand"}], "the Crafter's mana ability carries what its mana can't be spent on");
  const land = (addMana, trigger = null) => compileScript({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Land"], subtypes: [], manaCost: "", colors: [], colorIdentity: []},
    oracleText: "x", source: "hand", abilities: [trigger ? {kind: "triggered", text: "x", trigger, effects: [{effect: "addMana", mana: {C: 1}, ...addMana}]}
      : {kind: "activated", text: "x", cost: [{atom: "{T}"}], effects: [{effect: "addMana", mana: {C: 1}, ...addMana}]}]});
  const refused = (problems) => problems.some((p) => p.includes("cantSpend {castFrom: \"hand\"}"));
  eq(land({cantSpend: {castFrom: "hand"}}).problems, [], "spells cast from the hand: built");
  ok(refused(land({cantSpend: {castFrom: "graveyard"}}).problems), "from another zone: not built, and said");
  ok(refused(land({cantSpend: {castFrom: "hand", also: true}}).problems), "with anything else said of it: not built");
  ok(refused(land({cantSpend: {castFrom: "hand"}, spendOnly: {spell: {types: ["Creature"]}}}).problems), "with a spending restriction besides: not built");
  ok(refused(land({cantSpend: {castFrom: "hand"}, whenSpent: {spell: {types: ["Creature"]}, effects: [{effect: "scry", count: 1}], text: "x"}}).problems), "with a rider besides: not built");
  ok(land({cantSpend: {castFrom: "hand"}}, {on: "tapped for mana", filter: {types: ["Land"]}}).problems.some((p) => p.includes("triggered mana ability whose mana may pay for only some things")),
    "a triggered mana ability's: not built, and said");
}

console.log(`engine-mana-withheld: ${checks} checks passed -- mana that can't be spent to cast spells from the hand, in the pool, spent first on anything else and kept from those, gone with its pool.`);
