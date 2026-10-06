/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "IF YOU WOULD PROLIFERATE, PROLIFERATE TWICE INSTEAD" AND "REMOVE THREE COUNTERS FROM AMONG OTHER ARTIFACTS, CREATURES, AND
 * PLANESWALKERS YOU CONTROL" (Tekuthal, Inquiry Dominus; AI 2's Kiora deck).
 *
 * The static `proliferate-twice` (rules/statics.mjs, proliferateTimes) replaces a proliferate as it reaches the head of a
 * resolution (script/resolution.mjs) with as many as the replacements make -- each doubling, two Tekuthals four times (CR
 * 614.5) -- each its own choice (CR 701.34a); only its controller's. The cost atom `removeCountersAmong` (rules/actions.mjs):
 * that many counters of any kinds on the permanents its selector describes, the player's own, picked once the offer is taken
 * (choose-cost) and checked again as they are removed. The card scenarios play the card; this suite holds two Tekuthals, the
 * refusals, the units offered and the catalog's credit.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {proliferateTimes} from "../game/engine/rules/statics.mjs";
import {FORGE_REPLACEMENT} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (fn, pattern, m) => { assert.throws(fn, pattern, m); checks += 1; };

const cards = loadCardIndex();
const T = "Tekuthal, Inquiry Dominus";
const FIX = {Spread: {types: ["Instant"], manaCost: "{U}", colors: ["U"], spell: {id: "s", text: "Proliferate.", targets: [], effects: [{effect: "proliferate"}]}},
  Walker: {types: ["Planeswalker"], subtypes: ["Jace"], manaCost: "{2}{U}", colors: ["U"], loyalty: 3, abilities: []},
  Relic: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: []},
  /* A second one that the legend rule leaves (a nonlegendary copy, as Spark Double makes): the same replacement. */
  Copy: {types: ["Creature"], subtypes: ["Phyrexian", "Horror"], manaCost: "{2}{U}{U}", colors: ["U"], power: 3, toughness: 5,
    abilities: [{id: "p", kind: "static", rule: "proliferate-twice", text: "If you would proliferate, proliferate twice instead.", affects: {what: "player", who: "you"}}]}};
const at = (seat, zone, ...list) => ({seat, zone, cards: list});
const play = (scenario) => runScenario({name: "proliferate twice", ...scenario}, cards.definition, FIX).state;
const loyalty = (s, seat) => s.objects[s.zones.battlefield.find((id) => s.objects[id].card === "Walker" && s.objects[id].controller === seat)].counters.loyalty;

/* ---- how many times ---- */
{
  const s = play({setup: [at(0, "battlefield", T, "Copy", "Walker", "Island"), at(0, "hand", "Spread"), at(1, "battlefield", T)]});
  eq([proliferateTimes(s, 0), proliferateTimes(s, 1)], [4, 2], "Tekuthal and a copy of Rob's: four times; Maya's one: twice for her");
  const t = play({setup: [at(0, "battlefield", T, "Copy", "Walker", "Island"), at(0, "hand", "Spread")],
    steps: [{tap: "Island"}, {cast: "Spread"}, {resolve: true}, ...Array(4).fill({answer: [0]})]});
  eq([loyalty(t, 0), t.awaiting, t.stack.length], [7, null, 0], "Spread with Tekuthal and its copy: four proliferates, each asked -- the Walker from 3 to 7");
  const u = play({setup: [at(0, "battlefield", T, "Walker", "Island"), at(0, "hand", "Spread")],
    steps: [{tap: "Island"}, {cast: "Spread"}, {resolve: true}, {answer: []}, {answer: [0]}]});
  eq([loyalty(u, 0), u.awaiting], [4, null], "each its own choice: none the first time, the Walker the second");
}

/* ---- the cost: three counters among his others, picked after, checked as paid ---- */
{
  const s = play({setup: [at(0, "battlefield", T, "Walker", "Wastes"), at(1, "battlefield", "Walker")], steps: [{tap: "Wastes"}]});
  const [offer] = legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === T);
  eq([offer?.countersLater, offer?.costChoice], [3, undefined], "offered once, the three counters asked after");
  applyAction(s, 0, offer);
  const choice = awaitingChoice(s);
  eq([choice.min, choice.max, choice.options.map((o) => o.label)], [3, 3, ["Walker: a loyalty counter (1)", "Walker: a loyalty counter (2)", "Walker: a loyalty counter (3)"]],
    "three of his Walker's three: Maya's Walker's not among them");
  throws(() => resolveAwaiting(s, [0, 1]), /Invalid selection/, "two is refused");
  const own = s.zones.battlefield.find((id) => s.objects[id].card === T);
  s.objects[own].counters["+1/+1"] = 5;
  eq(awaitingChoice(s).options.length, 3, "Tekuthal's own counters are never among them: \"other\"");
  const mine = s.zones.battlefield.find((id) => s.objects[id].card === "Walker" && s.objects[id].controller === 0);
  throws(() => applyAction({...s, awaiting: null, priorityPlayer: 0}, 0, {...offer, counterSet: [{id: own, counter: "+1/+1"}, {id: mine, counter: "loyalty"}, {id: mine, counter: "loyalty"}]}),
    /Choose three counters/, "a set naming Tekuthal's own counter is refused, saying what to choose");
  throws(() => applyAction({...s, awaiting: null, priorityPlayer: 0}, 0, {...offer, counterSet: Array(3).fill({id: mine, counter: "+1/+1"})}),
    /Choose three counters/, "and one naming counters that are not there");
  resolveAwaiting(s, [0, 1, 2]);
  eq([s.objects[mine]?.counters.loyalty ?? null, s.stack.length], [null, 1], "paid: the Walker, its three gone, put into the graveyard (CR 704.5i); the ability on the stack");
}
{
  const s = play({setup: [at(0, "battlefield", T, "Walker", "Relic", "Wastes")], steps: [{tap: "Wastes"}]});
  const relic = s.zones.battlefield.find((id) => s.objects[id].card === "Relic");
  s.objects[relic].counters.charge = 1;
  const offer = legalActions(s, 0).find((a) => a.kind === "activate" && a.label === T);
  applyAction(s, 0, offer);
  eq(awaitingChoice(s).options.map((o) => o.label), ["Walker: a loyalty counter (1)", "Walker: a loyalty counter (2)", "Walker: a loyalty counter (3)", "Relic: a charge counter"],
    "an artifact's charge counter is one too, of any kind");
}

/* ---- the catalog ---- */
ok(FORGE_REPLACEMENT.Proliferate !== undefined, "\"proliferate twice instead\" credited (Forge's Proliferate replacement)");

console.log(`engine-proliferate-twice: ${checks} checks passed -- each Tekuthal doubling its controller's proliferates, each its own choice, and three counters from among its others picked after and checked as paid.`);
