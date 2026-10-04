/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* EVOKE (Rob's Priority Batch 10.3, its twentieth slice: Mulldrifter).
 *
 * "Evoke [cost]" is two abilities (CR 702.74a): "you may cast this card by paying [cost] rather than paying its mana cost",
 * an alternative cost (CR 118.9) offered wherever the card may be cast, and "when this permanent enters, if its evoke cost
 * was paid, its controller sacrifices it", a trigger whose "if" is checked as it triggers and again as it resolves (CR
 * 603.4). cards/index.mjs compiles both from the keyword; the cast marks the spell, and the permanent it becomes, evoked
 * (rules/actions.mjs, rules/stack.mjs); the trigger's condition reads the mark (script/condition.mjs, `evoked`).
 *
 * The card scenarios play the cards (Mulldrifter, Shriekmaw, Foundation Breaker): evoked and not, the two triggers in
 * either order, and a blink before the sacrifice resolves. This suite holds the edges: the compiled abilities and the
 * compiler's refusals, an evoke cost that exiles a card from the hand (Fury's form), the mark and where it is not, the
 * condition's grammar, the table's words, the house pilot, and the catalog.
 */
import assert from "node:assert/strict";
import {legalActions, applyAction, alternativeCosts} from "../game/engine/rules/actions.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {conditionProblems, conditionHolds} from "../game/engine/script/condition.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {parseManaCost, manaValue} from "../game/engine/rules/mana.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const script = (abilities, {types = ["Creature"], manaCost = "{3}{R}{R}", colors = ["R"]} = {}) => ({schema: "CrankCardScript@1",
  identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types, manaCost, colors, ...(types.includes("Creature") ? {power: 3, toughness: 3} : {})},
  oracleText: abilities.map((a) => a.text).join("\n"), source: "hand", abilities});
const EVOKE_EXILE = {kind: "keyword", text: "Evoke—Exile a red card from your hand.", keyword: "evoke", cost: [{atom: "exileFromHand", selector: {colors: ["R"]}}]};
/* Fury's form, without its divided damage: an evoke cost that exiles a red card from the hand, and nothing to pay. */
const {definition: cinder, problems: cinderProblems} = compileScript(script([EVOKE_EXILE]));
const FIX = {
  "Cinder Elemental": cinder,
  Bolt: {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s0", text: "Deal 3 damage to any target.", targets: [{what: "player"}], effects: []}},
};
const play = (name, setup, steps, more = {}) => runScenario({name, setup, steps, ...more}, index.definition, FIX).state;
const named = (s, card, zone) => Object.values(s.objects).filter((o) => o.card === card && o.zone === zone);
const casts = (s, seat, card) => legalActions(s, seat).filter((a) => a.kind === "cast" && a.label === card);
const tapAll = (names) => names.map((n) => ({tap: n}));
const evokes = (s, a) => a.alternative !== undefined && s.objects[a.objectId].abilities[a.alternative].evoke === true;

/* ---- what the keyword compiles to ---- */
{
  const mull = index.definition("Mulldrifter");
  const alt = mull.abilities.find((a) => a.rule === "alternative-cost");
  const sac = mull.abilities.find((a) => a.condition?.evoked !== undefined);
  eq([alt.evoke, alt.cost, alt.affects], [true, [{atom: "mana", cost: "{2}{U}"}], {what: "card", self: true}], "Mulldrifter's evoke: an alternative cost of {2}{U}, marked an evoke cost");
  eq([sac.kind, sac.trigger.on, sac.trigger.who, sac.condition, sac.effects], ["triggered", "GameEventCardChangeZone", "self", {evoked: true}, [{effect: "moveZone", targets: "self", sacrifice: true}]],
    "and its trigger: when it enters, if its evoke cost was paid, its controller sacrifices it");
  ok(new Set(mull.abilities.map((a) => a.id)).size === mull.abilities.length, "the two abilities from one keyword have ids of their own");
  eq([mull.keywords.includes("Evoke"), mull.keywords.includes("Flying")], [true, true], "the card has the keyword Evoke beside Flying");
  eq(cinderProblems, [], "an evoke cost that exiles a red card from the hand compiles");
  for (const bad of [[], [{atom: "exileFromHand"}], [{atom: "tapCreature", count: 1, selector: {types: ["Creature"]}}], [{atom: "mana", cost: "{1}"}, {atom: "discard", count: 1}]])
    ok(compileScript(script([{...EVOKE_EXILE, cost: bad}])).problems.length > 0, `and refuses an evoke cost of ${JSON.stringify(bad)}`);
  for (const types of [["Instant"], ["Sorcery"], ["Land"]])
    ok(compileScript(script([EVOKE_EXILE], {types})).problems.some((p) => p.includes("never enters from the stack")), `and evoke on a ${types[0].toLowerCase()}, which never enters from the stack`);
  eq([conditionProblems({evoked: true}), conditionProblems({evoked: false})], [[], []], "a condition may ask whether its permanent was evoked");
  ok(conditionProblems({evoked: "yes"}).length > 0, "true or false only");
}

/* ---- the offers ---- */
{
  const lands = ["Island", "Wastes", "Wastes"];
  const s = play("three mana", [at(0, "battlefield", ...lands), at(0, "hand", "Mulldrifter")], tapAll(lands));
  const offers = casts(s, 0, "Mulldrifter");
  eq(offers.map((a) => evokes(s, a)), [true], "{U} and two colorless: Mulldrifter's mana cost cannot be paid, its evoke cost can");
  eq(offerDetails(s, 0, offers), ["evoke for {2}{U}"], "the table says it is evoked, and for what");
  const id = named(s, "Mulldrifter", "hand")[0].id;
  eq(alternativeCosts(s, 0, id).map((w) => [w.mana, w.evoke]), [["{2}{U}", true]], "its alternative costs: one, an evoke cost");
}
{
  const lands = ["Island", "Wastes", "Wastes", "Wastes", "Wastes"];
  const s = play("five mana", [at(0, "battlefield", ...lands), at(0, "hand", "Mulldrifter")], tapAll(lands));
  const offers = casts(s, 0, "Mulldrifter");
  eq(offers.map((a) => evokes(s, a)), [false, true], "five mana: its mana cost first, its evoke cost beside it");
  /* What the room tells a pilot of a card (room.mjs, factsFrom): its mana value and types. */
  const facts = (name) => { const c = FIX[name] ?? index.definition(name); return c ? {manaValue: manaValue(parseManaCost(c.manaCost ?? "")), types: c.types ?? []} : null; };
  const pick = housePilot({seat: 0, cards: facts}).choose(projectFor(s, 0), legalActions(s, 0));
  eq([pick.label, evokes(s, pick)], ["Mulldrifter", false], "the house pilot casts it for its mana cost when it can, and keeps the 2/2 flier");
  const t = play("evoked with five", [at(0, "battlefield", ...lands), at(0, "hand", "Mulldrifter")], [...tapAll(lands), {cast: "Mulldrifter", evoke: true}]);
  eq([t.stack.at(-1).evoked, Object.values(t.players[0].manaPool).reduce((n, k) => n + k, 0)], [true, 2], "a scenario may evoke it all the same (`evoke: true`): {2}{U} paid, two mana left");
}
{
  const s = play("exile a red card", [at(0, "hand", "Cinder Elemental", "Bolt", "Island")], []);
  const offers = casts(s, 0, "Cinder Elemental");
  eq(offers.map((a) => [evokes(s, a), a.costNames]), [[true, ["Bolt"]]], "no mana at all: evoked by exiling the Bolt, its one other red card -- never the Island, never itself");
  eq(offerDetails(s, 0, offers), ["exiling Bolt · evoke"], "the table says what it exiles, and that it is evoked");
  applyAction(s, 0, offers[0]);
  eq([named(s, "Bolt", "exile").length, s.stack.at(-1).evoked], [1, true], "cast: the Bolt exiled as the cost is paid, and the spell marked evoked");
}
{
  const s = play("only itself", [at(0, "hand", "Cinder Elemental", "Island")], []);
  eq(casts(s, 0, "Cinder Elemental").length, 0, "with no other red card in hand there is nothing to exile, so no evoke");
  const t = play("two of it", [at(0, "hand", "Cinder Elemental", "Cinder Elemental")], []);
  eq(casts(t, 0, "Cinder Elemental").map((a) => a.costNames), [["Cinder Elemental"], ["Cinder Elemental"]], "two in hand: each may be evoked by exiling the other");
}

/* ---- the mark, and where it is not ---- */
{
  const s = play("evoked", [at(0, "hand", "Cinder Elemental", "Bolt")], [{cast: "Cinder Elemental", evoke: true}, {resolve: true}]);
  const [elemental] = named(s, "Cinder Elemental", "battlefield");
  const waiting = (state) => [...(state.pendingTriggers ?? []), ...state.stack].map((e) => e.abilityId);
  eq([elemental.evoked, waiting(s)], [true, ["a0-evoked"]], "evoked: the permanent it became is marked, and its sacrifice has triggered");
  eq([conditionHolds(s, {evoked: true}, {controller: 0, source: elemental.id}), conditionHolds(s, {evoked: false}, {controller: 0, source: elemental.id}),
    conditionHolds(s, {evoked: true}, {controller: 0, source: null})], [true, false, false], "the condition reads its own permanent's mark; with no permanent, nothing was evoked");
  const done = play("evoked, resolved", [at(0, "hand", "Cinder Elemental", "Bolt")], [{cast: "Cinder Elemental", evoke: true}, {resolve: true}, {resolve: true}]);
  eq([named(done, "Cinder Elemental", "graveyard").length, named(done, "Cinder Elemental", "battlefield").length], [1, 0], "its controller sacrifices it");
  ok(named(done, "Cinder Elemental", "graveyard").every((o) => o.evoked !== true), "and the card in the graveyard is a new object (CR 400.7), never evoked");
}
{
  const lands = ["Island", "Wastes", "Wastes", "Wastes", "Wastes"];
  const s = play("not evoked", [at(0, "battlefield", ...lands), at(0, "hand", "Mulldrifter")], [...tapAll(lands), {cast: "Mulldrifter", evoke: false}]);
  ok(s.stack.at(-1).evoked === undefined, "cast for its mana cost, the spell is not marked");
  const t = play("not evoked, resolved", [at(0, "battlefield", ...lands), at(0, "hand", "Mulldrifter")], [...tapAll(lands), {cast: "Mulldrifter", evoke: false}, {resolve: true}]);
  const [drifter] = named(t, "Mulldrifter", "battlefield");
  eq([drifter.evoked, [...(t.pendingTriggers ?? []), ...t.stack].map((e) => e.abilityId)], [undefined, ["a1"]], "nor the permanent, and only its draw has triggered: the sacrifice's \"if\" is false as it enters");
  ok(keywordsOf(t, drifter.id).includes("Evoke"), "the permanent has the keyword all the same");
}

eq(missingFor({keywords: ["Evoke", "Fear"]}), [], "the catalog credits Evoke, and Fear");
for (const name of ["Mulldrifter", "Shriekmaw", "Foundation Breaker"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-evoke: ${checks} checks passed -- evoke compiled to an alternative cost and an "if it was evoked" sacrifice; offered beside the mana cost, by mana or a card exiled from the hand, never itself; the spell and its permanent marked, a new object not; the pilot casts for the mana cost when it can.`);
