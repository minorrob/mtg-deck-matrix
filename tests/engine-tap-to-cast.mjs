/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TAPPING TO CAST (the plan's X8: a spell cast in one click; the review's R13).
 *
 * A spell the pool cannot pay is offered still when tapping its caster's untapped sources can pay it, each source one
 * mana for nothing but {T} (rules/actions.mjs, tapUnits). Taken, it taps them -- each mana ability activated as its
 * caster would (CR 601.2g) -- and is cast from the pool they filled (601.2h). Sources that make the same mana are
 * interchangeable and the mana is all spent at once, so the ways to tap are told apart by the kinds of source tapped
 * (rules/mana.mjs, tapPlans): one way, and it is tapped without asking; more, and the caster is asked which, the least
 * flexible first. Left to tapping by hand: mana already in the pool, {X} and Phyrexian costs, a source that asks more
 * than {T} (life, a painland's damage), one that makes two mana, a creature not yet its controller's since the turn
 * began (CR 302.6), and a cast from anywhere but the hand or the command zone.
 */
import assert from "node:assert/strict";
import {legalActions, applyAction, tapUnits} from "../game/engine/rules/actions.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {recordCommanderCast} from "../game/engine/rules/commander.mjs";
import {parseManaCost, manaValue, tapPlans, automaticPayment} from "../game/engine/rules/mana.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const creature = (manaCost, more = {}) => ({types: ["Creature"], manaCost, colors: ["G"], power: 2, toughness: 2, ...more});
const mana = (produces, more = {}) => ({id: "m", kind: "mana", tapSelf: true, produces, text: "{T}: Add mana.", ...more});
const FIX = {
  Bear: creature("{1}{G}"), Ox: creature("{2}{G}{G}"), Trinket: {types: ["Artifact"], manaCost: "{1}", colors: []}, Raider: creature("{2}{R}", {colors: ["R"]}), Hydra: creature("{X}{G}"), Mite: creature("{G/P}"), Imp: creature("{G/W}", {colors: ["G", "W"]}),
  Seer: creature("{C}{G}"), Leader: creature("{1}{G}", {supertypes: ["Legendary"]}),
  Elf: creature("{G}", {power: 1, toughness: 1, abilities: [mana({G: 1})]}),
  Grove: {types: ["Land"], abilities: [mana([{G: 1}, {U: 1}])]},
  Ache: {types: ["Land"], abilities: [mana({G: 1}, {then: [{effect: "dealDamage", amount: 1, who: "you"}]})]},
  Vault: {types: ["Artifact"], manaCost: "{1}", abilities: [mana({C: 2})]},
};
const play = (name, setup, steps = []) => runScenario({name, setup, steps}, index.definition, FIX).state;
const named = (s, card) => s.zones.battlefield.filter((id) => s.objects[id].card === card);
const tapped = (s) => s.zones.battlefield.filter((id) => s.objects[id].tapped).map((id) => s.objects[id].card).sort();
const casts = (s, card) => legalActions(s, 0).filter((a) => a.kind === "cast" && (card === undefined || a.label === card));
const onStack = (s) => s.stack.map((e) => s.objects[e.objectId]?.card);

{
  /* The ways, by kinds (tapPlans). */
  const u = (id, colors) => ({id, colors: colors.split("")});
  const ways = (units, cost) => tapPlans(units, parseManaCost(cost), 24).map((w) => w.key);
  eq(ways([u(1, "G"), u(2, "G")], "{1}{G}"), ["G,G"], "two Forests for {1}{G}: one way");
  eq(ways([u(1, "G"), u(2, "G"), u(3, "U")], "{1}{G}"), ["G,G", "G,U"], "two Forests and an Island: two ways, the Forests first");
  eq(ways([u(1, "U"), u(2, "GU")], "{1}{U}"), ["GU,U"], "an Island and a land of either color for {1}{U}: the same two lands, one way, whichever pays what");
  eq(ways([u(1, "W"), u(2, "G")], "{G/W}"), ["W", "G"], "a hybrid: either land, in the order they sit");
  eq(ways([u(1, "GU"), u(2, "G")], "{G}"), ["G", "GU"], "the least flexible first: the Forest before the dual, though the dual sits first");
  eq(ways([u(1, "G"), u(2, "C")], "{1}"), ["C", "G"], "and a colorless source before the Forest: it can pay only generic");
  eq([ways([u(1, "G")], "{1}{G}"), ways([u(1, "G"), u(2, "G")], "{X}{G}"), ways([u(1, "G")], "{G/P}")], [[], [], []], "too little, {X}, Phyrexian: none");
  /* Too little, among many: answered by the count, without a search (asked for every card in a hand, every time). */
  const many = Array.from({length: 12}, (_, i) => u(i, "WUBRG"[i % 5]));
  const started = Date.now();
  eq(ways(many, "{G}{G}{G}{G}{G}{G}{7}"), [], "thirteen mana from twelve sources: none");
  ok(Date.now() - started < 2000, "and at once");
  /* A pool that holds exactly the cost, tapped for it: one way to spend it, found at once -- every ordering of the
     generic mana was walked before (rules/mana.mjs, payments), seconds for twelve and far longer for sixteen. */
  const pool = {W: 3, U: 3, B: 3, R: 3, G: 4, C: 0};
  const at0 = Date.now();
  eq(automaticPayment(pool, parseManaCost("{16}"))?.mana, pool, "{16} from sixteen mana of five colors: all of it, the one way");
  ok(Date.now() - at0 < 2000, "found at once");
}
{
  /* One way: one action taps both Forests and casts the Bear (CR 601.2g-h). */
  const s = play("one way", [at(0, "battlefield", "Forest", "Forest"), at(0, "hand", "Bear")]);
  const [cast] = casts(s, "Bear");
  eq([casts(s, "Bear").length, cast.autoTap, cast.payment.mana.G], [1, true, 2], "the Bear offered once, tapping for itself, paid {G}{G}");
  eq(offerDetails(s, 0, [cast]), ["tapping Forest, Forest"], "the offer says what it taps");
  const events = applyAction(s, 0, cast);
  eq([s.awaiting, onStack(s), tapped(s), s.players[0].manaPool.G], [null, ["Bear"], ["Forest", "Forest"], 0], "taken: nothing asked; both Forests tapped, the Bear on the stack, the pool spent");
  ok(events.filter((e) => e.kind === "GameEventCardTapped").length === 2 && events.some((e) => e.kind === "GameEventSpellAbilityCast"), "each Forest tapped for mana, then the cast");
  /* Two Forests and a third: interchangeable, still one way; the first two tapped. */
  const t = play("identical", [at(0, "battlefield", "Forest", "Forest", "Forest"), at(0, "hand", "Bear")]);
  applyAction(t, 0, casts(t, "Bear")[0]);
  eq([t.awaiting, tapped(t).length, t.objects[named(t, "Forest")[2]].tapped], [null, 2, false], "three Forests: no question, the third untapped");
  /* A land of either color and an Island for {1}{U}... and a Grove for {1}{G} beside an Island: one way. */
  const g = play("dual", [at(0, "battlefield", "Island", "Grove"), at(0, "hand", "Bear")]);
  applyAction(g, 0, casts(g, "Bear")[0]);
  eq([g.awaiting, onStack(g), tapped(g)], [null, ["Bear"], ["Grove", "Island"]], "a Grove and an Island for {1}{G}: the Grove makes {G}, the Island the {1}");
}
{
  /* More than one way: asked, the least flexible first (CR 601.2g: the caster activates the mana abilities). */
  const s = play("two ways", [at(0, "battlefield", "Forest", "Forest", "Island"), at(0, "hand", "Bear")]);
  const [cast] = casts(s, "Bear");
  eq(offerDetails(s, 0, [cast]), ["tapping what you choose"], "the offer says the caster picks");
  applyAction(s, 0, cast);
  const q = awaitingChoice(s);
  eq([s.awaiting?.kind, q.title, q.options.map((o) => o.label), tapped(s), onStack(s)], ["choose-cost", "Bear: what to tap for it", ["Forest, Forest", "Forest, Island"], [], []],
    "asked which, before anything is tapped");
  resolveAwaiting(s, [1]);
  eq([onStack(s), tapped(s), s.objects[named(s, "Forest")[1]].tapped], [["Bear"], ["Forest", "Island"], false], "Forest and Island tapped; the other Forest kept");
  /* The house pilot takes the one-click cast, and answers the least flexible way: the Island kept for blue. */
  const p = play("pilot", [at(0, "battlefield", "Forest", "Forest", "Island"), at(0, "hand", "Bear")]);
  /* What the room tells its pilots of a card (game/room/room.mjs): its mana value and types, read off the card. */
  const facts = (name) => { const c = index.definition(name) ?? FIX[name]; return c ? {manaValue: manaValue(parseManaCost(c.manaCost ?? "")), types: c.types ?? []} : null; };
  const pilot = housePilot({seat: 0, cards: facts});
  const pick = pilot.choose(projectFor(p, 0), legalActions(p, 0));
  eq([pick.kind, pick.autoTap], ["cast", true], "the house pilot casts the Bear in one action");
  applyAction(p, 0, pick);
  resolveAwaiting(p, pilot.answer(projectFor(p, 0), awaitingChoice(p)).indices);
  eq(tapped(p), ["Forest", "Forest"], "and taps the two Forests, keeping the Island");
  /* A {1} spell beside a Forest and a Mind Stone: the pilot taps the Mind Stone, keeping green -- where a rank of the
     options by their cards' mana values would tap the Forest, the cheaper card. */
  const m = play("pilot, colorless", [at(0, "battlefield", "Forest", "Mind Stone"), at(0, "hand", "Trinket")]);
  applyAction(m, 0, pilot.choose(projectFor(m, 0), legalActions(m, 0)));
  const asked = awaitingChoice(m);
  resolveAwaiting(m, pilot.answer(projectFor(m, 0), asked).indices);
  eq([asked.options.map((o) => o.label), tapped(m)], [["Mind Stone", "Forest"], ["Mind Stone"]], "the pilot casts the Trinket with the Mind Stone");
  /* A hybrid: Forest or Plains, asked. */
  const h = play("hybrid", [at(0, "battlefield", "Forest", "Plains"), at(0, "hand", "Imp")]);
  applyAction(h, 0, casts(h, "Imp")[0]);
  eq(awaitingChoice(h).options.map((o) => o.label), ["Forest", "Plains"], "{G/W}: the Forest or the Plains");
}
{
  /* A commander's tax is tapped for too (CR 903.8): {1}{G} and {2} more needs four sources. */
  const three = play("tax", [at(0, "battlefield", "Forest", "Forest", "Forest"), at(0, "command", "Leader")]);
  const [leader] = three.zones.command[0];
  recordCommanderCast(three, 0, leader);
  eq(casts(three, "Leader").length, 0, "three Forests: the taxed commander is not offered");
  const four = play("tax four", [at(0, "battlefield", "Forest", "Forest", "Forest", "Forest"), at(0, "command", "Leader")]);
  recordCommanderCast(four, 0, four.zones.command[0][0]);
  applyAction(four, 0, casts(four, "Leader")[0]);
  eq([onStack(four), tapped(four).length], [["Leader"], 4], "four Forests: cast from the command zone, all four tapped");
}
{
  /* Left to tapping by hand. */
  const pooled = play("pool", [at(0, "battlefield", "Forest", "Forest", "Forest"), at(0, "hand", "Bear")], [{tap: "Forest"}]);
  eq(casts(pooled, "Bear").length, 0, "{G} already in the pool, two Forests untapped: no tap-and-cast (tap one more, and the pool pays)");
  const both = play("pool pays", [at(0, "battlefield", "Forest", "Forest"), at(0, "hand", "Bear")], [{tap: "Forest"}, {tap: "Forest"}]);
  eq(casts(both, "Bear").map((a) => a.autoTap ?? false), [false], "both tapped by hand: the pool pays, as always");
  eq([casts(play("x", [at(0, "battlefield", "Forest", "Forest"), at(0, "hand", "Hydra")]), "Hydra").length,
    casts(play("phyrexian", [at(0, "battlefield", "Forest"), at(0, "hand", "Mite")]), "Mite").map((a) => [a.autoTap ?? false, a.payment.life])], [0, [[false, 2]]],
    "{X}{G}: tapped by hand; {G/P}: only for 2 life from the empty pool, the Forest tapped by hand for the other way");
  eq(casts(play("painland", [at(0, "battlefield", "Forest", "Ache"), at(0, "hand", "Bear")]), "Bear").length, 0, "a land that deals damage as it taps is not tapped for you");
  eq(casts(play("two mana", [at(0, "battlefield", "Forest", "Vault"), at(0, "hand", "Ox")]), "Ox").length, 0, "nor one that makes two mana");
  const sick = runScenario({name: "sick", setup: [at(0, "battlefield", "Forest"), at(0, "hand", "Bear"), {seat: 0, zone: "battlefield", cards: ["Elf"], sick: true}], steps: []}, index.definition, FIX).state;
  eq(casts(sick, "Bear").length, 0, "nor an Elf that came this turn (CR 302.6)");
  const ready = play("ready", [at(0, "battlefield", "Forest", "Elf"), at(0, "hand", "Bear")]);
  applyAction(ready, 0, casts(ready, "Bear")[0]);
  eq(tapped(ready), ["Elf", "Forest"], "an Elf that has been Rob's since his turn began is");
  eq(tapUnits(play("units", [at(0, "battlefield", "Forest", "Grove", "Ache", "Vault")]), 0).map((u) => [u.colors.join(""), Object.keys(u.via).length]),
    [["G", 1], ["GU", 2]], "the sources: the Forest and the Grove; not the Ache nor the Vault");
  /* Mana added beyond what was tapped for (Nirkana Revenant: a Swamp's extra {B}) leaves more than one way to spend the
     pool: what the sources were tapped for pays, and the rest stays (CR 106.4). */
  const extra = play("extra mana", [at(0, "battlefield", "Nirkana Revenant", "Mountain", "Swamp", "Island"), at(0, "hand", "Raider")]);
  applyAction(extra, 0, casts(extra, "Raider")[0]);
  eq([onStack(extra), tapped(extra), extra.players[0].manaPool.B, extra.players[0].manaPool.U], [["Raider"], ["Island", "Mountain", "Swamp"], 1, 0],
    "the Raider cast with the Mountain, the Swamp and the Island; the Swamp's extra {B} left in the pool");
  /* {C}: a Wastes, not a Forest. */
  const seer = play("colorless", [at(0, "battlefield", "Forest", "Wastes"), at(0, "hand", "Seer")]);
  applyAction(seer, 0, casts(seer, "Seer")[0]);
  eq([seer.awaiting, tapped(seer)], [null, ["Forest", "Wastes"]], "{C}{G}: the Wastes and the Forest, one way");
}
{
  /* Refused: a way that is not one, or a tap-and-cast nobody offered. */
  const s = play("forged", [at(0, "battlefield", "Forest", "Forest", "Island"), at(0, "hand", "Bear")]);
  const [cast] = casts(s, "Bear");
  assert.throws(() => applyAction(s, 0, {...cast, tapPlan: "U,U"}), /cannot be tapped for that way/);
  checks += 1;
  eq([tapped(s), s.stack.length], [[], 0], "a way that is not one: refused, nothing tapped");
  const t = play("not offered", [at(0, "battlefield", "Forest", "Forest"), at(0, "hand", "Bear")], [{tap: "Forest"}, {tap: "Forest"}]);
  assert.throws(() => applyAction(t, 0, {...casts(t, "Bear")[0], autoTap: true}), /not a legal action/);
  checks += 1;
}

console.log(`engine-tap-to-cast: ${checks} checks passed -- a spell the pool cannot pay cast in one action by tapping its caster's plain sources: without asking when there is one way, asked when there are more, the least flexible first; the pool, {X}, Phyrexian, a painland, two-mana and summoning-sick sources left to tapping by hand.`);
