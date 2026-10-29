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
import {legalActions, applyAction, tapUnits, castTapPlans} from "../game/engine/rules/actions.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {recordCommanderCast} from "../game/engine/rules/commander.mjs";
import {parseManaCost, manaValue, tapPlans, automaticPayment, poolSize, sourceTapPlans, quickTapPlan, SEARCH_LIMIT} from "../game/engine/rules/mana.mjs";
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
/* A match that tops floating mana up from its untapped sources and taps a source for all it makes (`pooledTaps`), as a table's
   new matches do; `play` is a match launched before, which offers what it offered then. */
const pooledPlay = (name, setup, steps = []) => runScenario({name, setup, steps, pooledTaps: true}, index.definition, FIX).state;
/* And one that taps for an {X} spell too (`xTaps`), as a table's new matches do since Oct 21. */
const xPlay = (name, setup, steps = []) => runScenario({name, setup, steps, pooledTaps: true, xTaps: true}, index.definition, FIX).state;
const named = (s, card) => s.zones.battlefield.filter((id) => s.objects[id].card === card);
const tapped = (s) => s.zones.battlefield.filter((id) => s.objects[id].tapped).map((id) => s.objects[id].card).sort();
const casts = (s, card) => legalActions(s, 0).filter((a) => a.kind === "cast" && (card === undefined || a.label === card));
const onStack = (s) => s.stack.map((e) => s.objects[e.objectId]?.card);
/* A command-zone commander's tax as one seat's view shows it (projection.mjs). */
const viewTax = (s, seat, id) => projectFor(s, seat).players[s.objects[id].owner].zones.Command.cards.find((c) => c.cardId === id)?.commanderTax;

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
  /* The same kind with three distinct identities: the caster explicitly chooses two. */
  const t = play("identical", [at(0, "battlefield", "Forest", "Forest", "Forest"), at(0, "hand", "Bear")]);
  applyAction(t, 0, casts(t, "Bear")[0]);
  eq([awaitingChoice(t).cost, awaitingChoice(t).options.map(o => o.cardId)], ["manaSource", named(t, "Forest")], "three Forests: every exact identity is offered");
  resolveAwaiting(t, [0, 1]);
  eq([t.awaiting, tapped(t).length, t.objects[named(t, "Forest")[2]].tapped], [null, 2, false], "the chosen first two Forests tap and the third remains untapped");
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
  eq(awaitingChoice(s).options.map(o => o.cardId), named(s, "Forest"), "the Forest-and-Island pattern asks which exact Forest");
  resolveAwaiting(s, [0]);
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
  eq(casts(play("pool", [at(0, "battlefield", "Forest", "Forest", "Forest"), at(0, "hand", "Bear")], [{tap: "Forest"}]), "Bear").length, 0,
    "{G} already in the pool, two Forests untapped, a match launched before: no tap-and-cast (tap one more, and the pool pays)");
  const pooled = pooledPlay("pool", [at(0, "battlefield", "Forest", "Forest", "Forest"), at(0, "hand", "Bear")], [{tap: "Forest"}]);
  eq(casts(pooled, "Bear").length, 1, "floating mana and an untapped source together make the spell available");
  applyAction(pooled,0,casts(pooled,"Bear")[0]);
  if(pooled.awaiting) resolveAwaiting(pooled,[0]);
  eq([onStack(pooled),tapped(pooled).length,poolSize(pooled.players[0].manaPool)],[["Bear"],2,0],"the floating mana is spent and only one additional Forest taps");
  const both = play("pool pays", [at(0, "battlefield", "Forest", "Forest"), at(0, "hand", "Bear")], [{tap: "Forest"}, {tap: "Forest"}]);
  eq(casts(both, "Bear").map((a) => a.autoTap ?? false), [false], "both tapped by hand: the pool pays, as always");
  eq([casts(play("x", [at(0, "battlefield", "Forest", "Forest"), at(0, "hand", "Hydra")]), "Hydra").length,
    casts(play("phyrexian", [at(0, "battlefield", "Forest"), at(0, "hand", "Mite")]), "Mite").map((a) => [a.autoTap ?? false, a.payment.life])], [0, [[false, 2]]],
    "{X}{G}: tapped by hand; {G/P}: only for 2 life from the empty pool, the Forest tapped by hand for the other way");
  /* {X} TAPPED FOR (`xTaps`): each X the pool and the untapped sources pay together, offered, the sources tapped as it is cast. */
  const xOffers = (s) => casts(s, "Hydra").map((a) => [a.x, a.autoTap === true]);
  const three = [at(0, "battlefield", "Forest", "Forest", "Forest"), at(0, "hand", "Hydra")];
  eq([xOffers(pooledPlay("x before", three)), xOffers(pooledPlay("x before, one floating", three, [{tap: "Forest"}]))], [[], [[0, false]]],
    "a match launched before: three untapped Forests offer no {X}{G}, and with one tapped by hand, X is what floats");
  eq(xOffers(xPlay("x taps", three)), [[0, true], [1, true], [2, true]], "with `xTaps`: three untapped Forests offer {X}{G} at X = 0, 1 and 2, each tapped for as it is cast");
  eq(xOffers(xPlay("x tops up", three, [{tap: "Forest"}])), [[0, false], [1, true], [2, true]], "with {G} floating: X = 0 from the pool, and 1 and 2 topped up from the Forests left");
  for (const steps of [[], [{tap: "Forest"}]]) {
    const s = xPlay("x cast", three, steps), top = casts(s, "Hydra").at(-1);
    applyAction(s, 0, top);
    if (s.awaiting) resolveAwaiting(s, [0]);
    eq([s.stack.map((e) => [s.objects[e.objectId].card, e.x]), tapped(s).length, poolSize(s.players[0].manaPool)], [[["Hydra", 2]], 3, 0],
      `cast at X = 2${steps.length ? ", the {G} floating spent" : ""}: the Forests tapped for it, X on the stack, nothing left floating`);
  }
  eq(xOffers(xPlay("x short", [at(0, "battlefield", "Forest"), at(0, "hand", "Hydra")])), [[0, true]], "one Forest: X = 0 only -- never an X its sources can't pay");
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
  eq(casts(play("a two-mana rock, a match launched before", [at(0, "battlefield", "Forest", "Vault"), at(0, "command", "Leader")]), "Leader").length, 0,
    "a match launched before taps a source for one mana only, so the two-mana rock is left to tapping by hand");
  const s = pooledPlay("commander with a two-mana rock", [at(0, "battlefield", "Forest", "Vault"), at(0, "command", "Leader")]);
  const [cast] = casts(s, "Leader");
  ok(cast?.autoTap, "a commander is offered with an untapped Forest and two-mana rock");
  applyAction(s, 0, cast);
  if (s.awaiting) resolveAwaiting(s, [0]);
  eq([onStack(s), tapped(s), s.players[0].manaPool.C], [["Leader"], ["Forest", "Vault"], 1], "the commander casts and surplus colorless mana remains");
  const tax = pooledPlay("tax with a rock", [at(0, "battlefield", "Forest", "Vault"), at(0, "command", "Leader")]);
  const leader = tax.zones.command[0][0];
  eq([viewTax(tax, 0, leader), viewTax(tax, 1, leader)], [0, 0], "the view says the commander's tax: none before its first cast, to its owner and to everyone");
  recordCommanderCast(tax, 0, leader);
  eq([viewTax(tax, 0, leader), viewTax(tax, 1, leader)], [2, 2], "two after one cast from the command zone (CR 903.8), public to every seat");
  eq(casts(tax, "Leader").length, 0, "three available mana cannot pay the taxed four-mana commander");
  const enough = pooledPlay("tax with pool and rock", [at(0, "battlefield", "Forest", "Forest", "Vault"), at(0, "command", "Leader")], [{tap: "Forest"}]);
  recordCommanderCast(enough, 0, enough.zones.command[0][0]);
  applyAction(enough, 0, casts(enough, "Leader")[0]);
  if (enough.awaiting) resolveAwaiting(enough, [0]);
  eq([onStack(enough), poolSize(enough.players[0].manaPool)], [["Leader"], 0], "floating mana, a land and a rock pay the commander tax together");
  const dual = pooledPlay("one dual cannot pay twice", [at(0, "battlefield", "Grove"), at(0, "command", "Leader")]);
  eq(casts(dual, "Leader").length, 0, "a dual's output alternatives never count as two sources");
  const restricted = pooledPlay("mana restrictions", [at(0, "battlefield", "Forest", "Ache"), at(0, "command", "Leader")]);
  eq(casts(restricted, "Leader").length, 0, "a pain source is not silently activated by the safe-source shortcut");
  /* Two Forests and a two-mana rock for {1}{G}: two ways, so the caster is asked -- the one the offer was priced at first. */
  const choice = pooledPlay("asked which way", [at(0, "battlefield", "Forest", "Forest", "Vault"), at(0, "hand", "Bear")]);
  const [bear] = casts(choice, "Bear");
  eq([bear.payment.mana.G, castTapPlans(choice, 0, bear).map((w) => w.taps.map((t) => choice.objects[t.id].card).join(", "))], [2, ["Forest, Forest", "Vault, Forest"]],
    "the offer is priced at the two Forests, and asked which way, the two Forests come first: the rock's second mana is not wasted");
  applyAction(choice, 0, bear);
  resolveAwaiting(choice, [0]);
  eq([onStack(choice), tapped(choice), poolSize(choice.players[0].manaPool)], [["Bear"], ["Forest", "Forest"], 0], "the first way taken: both Forests, the rock left untapped");
}
{
  /* The ways on top of floating mana (sourceTapPlans), and the one way built for a cast nobody is asked about
     (quickTapPlan). A source's outputs: each thing one tap of it makes, whole. */
  const NONE = {W: 0, U: 0, B: 0, R: 0, G: 0, C: 0};
  const src = (id, ...outs) => ({id, outputs: Object.fromEntries(outs.map((o) => [Object.entries(o).map(([k, n]) => (n === 1 ? k : `${k}:${n}`)).join("+"), {...NONE, ...o}]))});
  const forest = (id) => src(id, {G: 1}), swamp = (id) => src(id, {B: 1}), sol = (id) => src(id, {C: 2}), stone = (id) => src(id, {C: 1});
  const named = (w) => w.taps.map((t) => `${t.id}=${t.color}`).join(",");
  const ways = (units, cost, pool = NONE, limit = 24) => sourceTapPlans(units, pool, parseManaCost(cost), limit).map(named);
  const quick = (units, cost, pool = NONE) => {const w = quickTapPlan(units, pool, parseManaCost(cost)); return w && named(w);};
  eq([ways([forest(1), forest(2)], "{1}{G}"), ways([forest(1), forest(2), forest(3)], "{G}")], [["1=G,2=G"], ["1=G"]],
    "sources alike are one kind: two Forests for {1}{G} are one way, and of three Forests for {G} the first is tapped, once");
  eq(ways([swamp(1), sol(2), stone(3)], "{1}{B}"), ["3=C,1=B", "2=C:2,1=B"], "a Swamp, a two-mana rock and a one-mana rock for {1}{B}: two ways, the one that wastes nothing first");
  eq(quick([swamp(1), sol(2), stone(3)], "{1}{B}"), "1=B,3=C", "and the way built for it: the Swamp for {B}, the one-mana rock for the {1}, the two-mana rock left");
  eq(quick([swamp(1), sol(2), stone(3)], "{2}{B}"), "1=B,2=C:2", "for {2}{B}, the two-mana rock, which fits the {2} exactly");
  eq([ways([forest(1), forest(2)], "{1}{G}", {...NONE, G: 1}), quick([forest(1), forest(2)], "{1}{G}", {...NONE, G: 1})], [["1=G"], "1=G"],
    "{G} floating: one Forest more pays {1}{G}, the other left");
  eq([ways([src(1, {G: 1}, {U: 1})], "{G}{U}"), quick([src(1, {G: 1}, {U: 1})], "{G}{U}")], [[], null], "a dual taps once: it never pays both {G} and {U}");
  eq(quick([src(1, {G: 1}, {U: 1}), forest(2)], "{G}{U}"), "2=G,1=U", "with a Forest beside it: the Forest for {G}, the dual for {U}");
  eq([quick([src(1, {G: 1, U: 1}), forest(2)], "{G}"), quick([src(1, {C: 2}), src(2, {C: 1})], "{C}")], ["2=G", "2=C"],
    "a colored symbol from a source that makes one mana before one that makes two at once: the Forest, not the bounce land's {G}{U}; for {C}, the one-mana rock");
  eq([ways([forest(1), forest(2)], "{X}{G}"), quick([forest(1), forest(2)], "{X}{G}"), quick([forest(1)], "{G/P}")], [[], null, null],
    "{X} and Phyrexian costs are left to tapping by hand");
  /* A crowded board (ROB-67): five basics, a two-mana rock, two one-mana rocks, eight duals and three five-color lands. */
  const five = (id) => src(id, {W: 1}, {U: 1}, {B: 1}, {R: 1}, {G: 1});
  const crowd = [forest(1), forest(2), src(3, {W: 1}), src(4, {U: 1}), swamp(5), sol(6), stone(7), stone(8),
    ...Array.from({length: 8}, (_, i) => src(10 + i, {G: 1}, {U: 1})), five(30), five(31), five(32)];
  eq(quick(crowd, "{4}{G}{W}{U}{B}"), "1=G,3=W,4=U,5=B,6=C:2,7=C,8=C",
    "{4}{G}{W}{U}{B} on a crowded board: a basic for each color, the rocks for the {4}, every dual and five-color land left untapped");
  const found = sourceTapPlans(crowd, NONE, parseManaCost("{4}{G}{W}{U}{B}"), 2);
  eq([found.length, found.every((w) => new Set(w.taps.map((t) => t.id)).size === w.taps.length)], [2, true], "and the search finds two ways in its step limit, no source tapped twice");
  ok(SEARCH_LIMIT > 0 && ways(Array.from({length: 20}, (_, i) => src(i, {G: 1}, {U: 1})), "{W}", NONE, 2).length === 0, "twenty duals that can't make {W}: none, at once");
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

console.log(`engine-tap-to-cast: ${checks} checks passed -- a spell the pool cannot pay cast in one action by tapping its caster's plain sources: without asking when there is one way, asked when there are more, the least flexible first; floating mana and multi-mana sources combine; costly, variable and restricted sources remain explicit.`);
