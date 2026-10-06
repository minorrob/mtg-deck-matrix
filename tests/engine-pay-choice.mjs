/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WHICH MANA PAYS (the plan's X8b).
 *
 * "Which color pays a generic symbol decides which spell the player can still cast afterwards, so it is theirs to decide"
 * (rules/mana.mjs, automaticPayment). Before X8b that decision went untaken: a spell or an ability the pool could pay more
 * than one way was not offered at all -- {W}{U} in the pool and a {1} artifact in hand, and nothing to cast. Now it is
 * offered once (`payWays`), and taken it asks which way before anything is paid (rules/actions.mjs, costChoice: "which
 * mana pays for it", each way in words), the answer named by its key (`payWith`) and checked again as it is paid: a way
 * no longer in the pool is refused. The same for an activated ability's mana. The house pilot answers with mana rather
 * than life where a way spends none.
 */
import assert from "node:assert/strict";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {parseManaCost, manaValue, paymentKey, paymentWords, chosenPayment, paymentOptions} from "../game/engine/rules/mana.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {
  Trinket: {types: ["Artifact"], manaCost: "{1}", colors: []},
  Mite: {types: ["Creature"], manaCost: "{G/P}", colors: ["G"], power: 1, toughness: 1},
  Imp: {types: ["Creature"], manaCost: "{G/W}", colors: ["G", "W"], power: 1, toughness: 1},
  Bear: {types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Lens: {types: ["Artifact"], manaCost: "{1}", colors: [],
    abilities: [{id: "a", kind: "activated", text: "{1}: You gain 1 life.", cost: [{atom: "mana", cost: "{1}"}], effects: [{effect: "gainLife", amount: 1}]}]},
};
const play = (name, setup, steps = []) => runScenario({name, setup, steps}, index.definition, FIX).state;
const casts = (s, card) => legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === card);
const onStack = (s) => s.stack.map((e) => s.objects[e.objectId]?.card ?? e.name);
const pool = (s) => Object.fromEntries(Object.entries(s.players[0].manaPool).filter(([, n]) => n > 0));
const facts = (name) => { const c = index.definition(name) ?? FIX[name]; return c ? {manaValue: manaValue(parseManaCost(c.manaCost ?? "")), types: c.types ?? []} : null; };

{
  /* The words and the keys (rules/mana.mjs). */
  const ways = paymentOptions({W: 1, U: 1}, parseManaCost("{1}"));
  eq(ways.map(paymentWords), ["{W}", "{U}"], "{1} from {W}{U}: two ways, each in words");
  eq(ways.map(paymentKey), ["1,0,0,0,0,0|0", "0,1,0,0,0,0|0"], "each named by its mana and its life");
  eq(paymentOptions({G: 1}, parseManaCost("{G/P}"), {life: 40}).map(paymentWords), ["{G}", "2 life"], "{G/P} from {G}, at 40 life: the mana or 2 life");
  eq(chosenPayment({W: 1, U: 1}, parseManaCost("{1}"), {}, ways[1] && paymentKey(ways[1]))?.mana.U, 1, "the way a key names, chosen");
  eq(chosenPayment({W: 1}, parseManaCost("{1}"), {}, paymentKey(ways[1])), null, "and none when that way is no longer in the pool");
  eq(chosenPayment({W: 1, U: 1}, parseManaCost("{1}"))?.mana ?? null, null, "with no key, still no guess: more than one way is not one");
}
{
  /* A {1} artifact and {W}{U} in the pool: offered once, and asked which (CR 601.2g-h). */
  const s = play("two colors", [at(0, "battlefield", "Plains", "Island"), at(0, "hand", "Trinket")], [{tap: "Plains"}, {tap: "Island"}]);
  const offered = casts(s, "Trinket");
  eq([offered.length, offered[0]?.payWays, offered[0]?.payment], [1, true, null], "{W}{U} in the pool, a {1} artifact in hand: cast offered once, the way to be asked");
  applyAction(s, 0, offered[0]);
  const q = awaitingChoice(s);
  eq([s.awaiting?.kind, q.title, q.cost, q.options.map((o) => o.label), onStack(s), pool(s)], ["choose-cost", "Trinket: which mana pays for it", "pool", ["{W}", "{U}"], [], {W: 1, U: 1}],
    "taken: asked which mana pays, before anything is paid");
  resolveAwaiting(s, [1]);
  eq([onStack(s), pool(s)], [["Trinket"], {W: 1}], "the {U} pays it; the {W} stays in the pool");
}
{
  /* One way is no question: {G}{G} for {1}{G}. */
  const s = play("one way", [at(0, "battlefield", "Forest", "Forest"), at(0, "hand", "Bear")], [{tap: "Forest"}, {tap: "Forest"}]);
  const [cast] = casts(s, "Bear");
  eq([cast.payWays ?? false, cast.payment?.mana.G], [false, 2], "{G}{G} for {1}{G}: the one way, paid without asking");
  applyAction(s, 0, cast);
  eq([s.awaiting, onStack(s)], [null, ["Bear"]], "cast at once");
}
{
  /* A Phyrexian symbol: the mana or the life, the caster's to say (CR 107.4f). */
  const s = play("phyrexian", [at(0, "battlefield", "Forest"), at(0, "hand", "Mite")], [{tap: "Forest"}]);
  const [cast] = casts(s, "Mite");
  ok(cast?.payWays === true, "{G} in the pool, {G/P} to pay: offered, the way to be asked (it was not offered at all before)");
  applyAction(s, 0, cast);
  eq(awaitingChoice(s).options.map((o) => o.label), ["{G}", "2 life"], "the {G} or 2 life");
  const life = s.players[0].life;
  resolveAwaiting(s, [1]);
  eq([onStack(s), s.players[0].life, pool(s)], [["Mite"], life - 2, {G: 1}], "2 life paid; the {G} kept");
  /* A hybrid: either color in the pool. */
  const h = play("hybrid", [at(0, "battlefield", "Forest", "Plains"), at(0, "hand", "Imp")], [{tap: "Forest"}, {tap: "Plains"}]);
  applyAction(h, 0, casts(h, "Imp")[0]);
  eq(awaitingChoice(h).options.map((o) => o.label).sort(), ["{G}", "{W}"], "{G/W} from {G}{W}: the {G} or the {W}");
}
{
  /* A way no longer there is refused, never paid some other way. */
  const s = play("stale", [at(0, "battlefield", "Plains", "Island"), at(0, "hand", "Trinket")], [{tap: "Plains"}, {tap: "Island"}]);
  const [cast] = casts(s, "Trinket");
  assert.throws(() => applyAction(s, 0, {...cast, payWith: "0,0,0,0,1,0|0"}), /cannot be paid for from this pool/, "a way the pool cannot pay ({G}) is refused");
  checks += 1;
  eq([onStack(s), pool(s)], [[], {W: 1, U: 1}], "and nothing was paid");
}
{
  /* An activated ability's mana, the same: {1} from {W}{U}. */
  const s = play("ability", [at(0, "battlefield", "Lens", "Plains", "Island")], [{tap: "Plains"}, {tap: "Island"}]);
  const offered = legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Lens");
  eq([offered.length, offered[0]?.payWays], [1, true], "the Lens's {1} from {W}{U}: offered once, the way to be asked");
  ok(JSON.parse(JSON.stringify(offered[0])).payWays === true && !("owed" in (offered[0].payment ?? {})), "the offer is plain data, whatever the reckoning kept");
  applyAction(s, 0, offered[0]);
  const q = awaitingChoice(s);
  eq([q.title, q.options.map((o) => o.label)], ["Lens: which mana pays for it", ["{W}", "{U}"]], "taken: asked which");
  resolveAwaiting(s, [0]);
  eq([onStack(s), pool(s)], [["Lens"], {U: 1}], "the {W} pays; the ability on the stack, the {U} kept");
}
{
  /* The house pilot: casts what it could not before, and pays with mana rather than life. */
  const pilot = housePilot({seat: 0, cards: facts});
  const s = play("pilot", [at(0, "battlefield", "Forest"), at(0, "hand", "Mite")], [{tap: "Forest"}]);
  const pick = pilot.choose(projectFor(s, 0), legalActions(s, 0));
  eq([pick?.kind, pick?.label], ["cast", "Mite"], "the house pilot casts the Mite");
  const life = s.players[0].life;
  applyAction(s, 0, pick);
  resolveAwaiting(s, pilot.answer(projectFor(s, 0), awaitingChoice(s)).indices);
  eq([onStack(s), s.players[0].life, pool(s)], [["Mite"], life, {}], "with the {G}, its life kept");
  /* Whatever order the ways come in: the life way listed first, the mana way still chosen. */
  const asked = {id: "choose-cost:1", title: "Mite: which mana pays for it", mode: "one", min: 1, max: 1, cost: "pool",
    options: [{index: 0, label: "2 life", key: "0,0,0,0,0,0|2"}, {index: 1, label: "{G}", key: "0,0,0,0,1,0|0"}]};
  eq(pilot.answer(projectFor(s, 0), asked).indices, [1], "asked with the life way first, the house pilot still pays the {G}");
}

console.log(`engine-pay-choice: ${checks} checks passed -- a cast or an ability the pool pays more than one way is offered and asks which way (X8b): two colors for generic, a Phyrexian symbol's mana or life, a hybrid; one way asks nothing; a way gone is refused; the house pilot pays with mana.`);
