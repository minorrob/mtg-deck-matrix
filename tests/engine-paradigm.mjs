/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* PARADIGM (CR 702.192a; Germination Practicum, claude/cards-faces-class).
 *
 * Two spell abilities, done as the spell resolves (rules/stack.mjs, paradigmResolves): the first time a spell its
 * controller controls with that name resolves this game, a delayed trigger for the rest of the game -- at the beginning of
 * each of that player's precombat main phases (rules/trigger.mjs), a copy of the spell is created in exile and they may
 * cast it without paying its mana cost (effects/asking.mjs, play's `copyOf`); and the spell is exiled. What the scenarios
 * cannot reach is here: four players, a countered spell, a copy that resolves first (each controller its own first time),
 * the copy cast as a spell is cast (CR 707.12), a declined copy gone (704.5e), a checkpoint, and the compiler's refusal.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {SCRIPT_SCHEMA} from "../game/engine/script/schema.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {keywordBuilt} from "../game/tools/engine-constructs.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const GP = "Germination Practicum";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
const PAY = [{tap: "Forest"}, {tap: "Forest"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}];
const LANDS = ["Forest", "Forest", "Wastes", "Wastes", "Wastes"];
const play = (setup, steps, seats = 2) => runScenario({name: "paradigm", seats, setup, steps}, index.definition, FIX);
const counters = (s, seat, name = "Bear") => s.zones.battlefield.map((id) => s.objects[id]).filter((o) => o.card === name && o.controller === seat).map((o) => o.counters["+1/+1"] ?? 0);
const paradigms = (s) => (s.delayedTriggers ?? []).filter((d) => d.at === "precombat main");

/* ---- the compiled card ---- */
{
  const gp = index.definition(GP);
  eq([gp.keywords, gp.abilities.filter((a) => a.rule === "paradigm").length], [["Paradigm"], 1], "Germination Practicum has paradigm, kept as a static the stack reads");
  const creature = compileScript({schema: SCRIPT_SCHEMA, identity: {name: "Probe", oracleId: "p", types: ["Creature"], manaCost: "{1}", power: 1, toughness: 1},
    abilities: [{kind: "keyword", text: "Paradigm", keyword: "paradigm"}]});
  ok(creature.definition === null && creature.problems.some((p) => /paradigm on a card that is not an instant or sorcery/.test(p)),
    "paradigm on a creature is refused by name: only an instant or sorcery resolves and is exiled");
  ok(keywordBuilt("Paradigm"), "and the catalog counts paradigm as built (game/tools/engine-constructs.mjs)");
}

/* ---- four players: Rob's precombat main phases only, every one of them ---- */
{
  const {state: s, events} = play([at(0, "battlefield", ...LANDS, "Bear"), at(0, "hand", GP)], [...PAY, {cast: GP}, {resolve: true},
    {to: {turn: 2, phase: "MAIN1"}}, {expect: [{stack: 0}]}, {to: {turn: 3, phase: "MAIN1"}}, {expect: [{stack: 0}]},
    {to: {turn: 4, phase: "MAIN1"}}, {expect: [{stack: 0}]}, {to: {turn: 5, phase: "MAIN1"}}, {expect: [{stack: 1}]}, {resolve: true}, {choose: [GP]}, {resolve: true},
    {to: {turn: 9, phase: "MAIN1"}}, {expect: [{stack: 1}]}, {resolve: true}, {choose: [GP]}, {resolve: true}], 4);
  eq(counters(s, 0), [6], "a four-player game: the copy is cast on turns 5 and 9, Rob's, and on none of Maya's, Trey's or Sam's -- six counters on his Bear");
  eq([paradigms(s).length, paradigms(s)[0]?.controller, s.players[0].paradigmResolved], [1, 0, [GP]], "one delayed trigger, Rob's, for the rest of the game; the name kept as resolved for him");
  const casts = events.filter((e) => e.kind === "GameEventSpellAbilityCast" && e.data.fields.card?.name === GP);
  eq(casts.map((e) => [e.data.turn, e.data.fields.castFrom]), [[1, "hand"], [5, "exile"], [9, "exile"]], "and each copy is CAST, from exile (CR 707.12): what watches casts sees it");
  eq(s.zones.exile.map((id) => [s.objects[id].card, s.objects[id].copy === true]), [[GP, false]], "in exile, the card alone -- every copy gone as it left the stack (CR 704.5e)");
  eq(s.zones.battlefield.filter((id) => s.objects[id].tapped).length, 0, "and no mana was paid for the copies: Rob's lands untapped on his turn");
}

/* ---- countered, it did not resolve: no trigger, and its card is in the graveyard ---- */
{
  const {state: s} = play([at(0, "battlefield", ...LANDS, "Bear"), at(0, "hand", GP), at(1, "battlefield", "Island", "Island"), at(1, "hand", "Counterspell")],
    [...PAY, {cast: GP}, {pass: 1}, {tap: "Island", seat: 1}, {tap: "Island", seat: 1}, {cast: "Counterspell", seat: 1, targets: [{card: GP}]}, {resolve: true},
      {to: {turn: 3, phase: "MAIN1"}}]);
  eq([s.stack.length, paradigms(s).length, s.players[0].paradigmResolved, s.zones.graveyard[0].map((id) => s.objects[id].card)], [0, 0, undefined, [GP]],
    "countered: no delayed trigger, nothing kept as resolved, and the card goes to Rob's graveyard -- paradigm is two abilities of a spell that resolves");
}

/* ---- its every target gone, it does not resolve (CR 608.2b): neither of paradigm's abilities ---- */
{
  const PROBE = "Probe Practicum";
  const probe = compileScript({schema: SCRIPT_SCHEMA, identity: {name: PROBE, oracleId: "probe-paradigm", types: ["Sorcery"], manaCost: "{1}", colors: []},
    abilities: [{kind: "spell", text: "Destroy target creature.", targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "destroy", targets: {target: 0}}]},
      {kind: "keyword", text: "Paradigm", keyword: "paradigm"}]}).definition;
  const cards = (name) => (name === PROBE ? structuredClone(probe) : index.definition(name));
  const {state: s} = runScenario({name: "paradigm", setup: [at(0, "battlefield", "Wastes"), at(0, "hand", PROBE), at(1, "battlefield", "Bear")],
    steps: [{tap: "Wastes"}, {cast: PROBE, targets: [{card: "Bear"}]}]}, cards, FIX);
  runEffect(s, {effect: "moveZone", targets: s.zones.battlefield.filter((id) => s.objects[id].card === "Bear"), to: "graveyard"}, {controller: 1, source: null});
  passPriority(s, null, createRng("paradigm")); passPriority(s, null, createRng("paradigm"));
  eq([s.stack.length, paradigms(s).length, s.zones.graveyard[0].map((id) => s.objects[id].card)], [0, 0, [PROBE]],
    "a paradigm spell whose target left: it does not resolve -- no delayed trigger, and to its owner's graveyard, not exile");
}

/* ---- a copy resolves first: each controller's own first time ---- */
{
  /* Maya copies Rob's Practicum: her copy resolves first -- the first spell SHE controls with that name -- then Rob's. */
  const {state: s} = play([at(0, "battlefield", ...LANDS, "Bear"), at(0, "hand", GP), at(1, "battlefield", "Mountain", "Mountain", "Bear"), at(1, "hand", "Reverberate")],
    [...PAY, {cast: GP}, {pass: 1}, {tap: "Mountain", seat: 1}, {tap: "Mountain", seat: 1}, {cast: "Reverberate", seat: 1, targets: [{card: GP}]}, {resolve: true},
      {expect: [{stack: 2}]}, {resolve: true}, {resolve: true}]);
  eq([counters(s, 0), counters(s, 1)], [[2], [2]], "Maya's copy puts its counters on her Bear, Rob's spell on his");
  eq(paradigms(s).map((d) => d.controller).sort(), [0, 1], "and each has a paradigm trigger of their own: the copy was a spell Maya controlled, resolving (CR 702.192a)");
  eq(s.zones.exile.map((id) => s.objects[id].card), [GP], "the copy ceases to exist; Rob's card is exiled");
  const later = play([at(0, "battlefield", ...LANDS, "Bear"), at(0, "hand", GP), at(1, "battlefield", "Mountain", "Mountain", "Bear"), at(1, "hand", "Reverberate")],
    [...PAY, {cast: GP}, {pass: 1}, {tap: "Mountain", seat: 1}, {tap: "Mountain", seat: 1}, {cast: "Reverberate", seat: 1, targets: [{card: GP}]}, {resolve: true},
      {resolve: true}, {resolve: true}, {to: {turn: 2, phase: "MAIN1"}}, {expect: [{stack: 1}]}, {resolve: true}, {choose: [GP]}, {resolve: true}]).state;
  eq(counters(later, 1), [4], "on Maya's turn her own trigger casts her a copy");
}
{
  /* Rob copies his own: the copy resolves first, and is his first; the card itself then is not, and makes no second trigger. */
  const {state: s} = play([at(0, "battlefield", ...LANDS, "Mountain", "Mountain", "Bear"), at(0, "hand", GP, "Reverberate")],
    [...PAY, {cast: GP}, {tap: "Mountain"}, {tap: "Mountain"}, {cast: "Reverberate", targets: [{card: GP}]}, {resolve: true}, {resolve: true}, {resolve: true}]);
  eq([counters(s, 0), paradigms(s).length], [[4], 1], "Rob's copy and his card: four counters, and one delayed trigger, not two");
  eq(s.zones.exile.map((id) => s.objects[id].card), [GP], "the card exiled all the same -- its second ability needs no first time");
}

/* ---- declined: the copy made in exile is gone; a checkpoint keeps the promise ---- */
{
  const {state: waiting} = play([at(0, "battlefield", ...LANDS, "Bear"), at(0, "hand", GP)], [...PAY, {cast: GP}, {resolve: true}, {to: {turn: 3, phase: "MAIN1"}}]);
  eq(projectFor(waiting, 1).stack.map((e) => [e.name, e.kind]), [[GP, "trigger"]], "on the stack, the trigger is Germination Practicum's -- its card in exile, the source of the ability that made it (CR 603.7d)");
  const {state: s} = play([at(0, "battlefield", ...LANDS, "Bear"), at(0, "hand", GP)], [...PAY, {cast: GP}, {resolve: true}, {to: {turn: 3, phase: "MAIN1"}}, {resolve: true}]);
  eq(s.zones.exile.filter((id) => s.objects[id].copy === true).length, 1, "asked: the copy is made in exile first, whatever is chosen");
  const saved = JSON.parse(JSON.stringify(s));
  eq(paradigms(saved), paradigms(s), "the delayed trigger is plain data: a checkpoint carries it");
  const {state: d} = play([at(0, "battlefield", ...LANDS, "Bear"), at(0, "hand", GP)], [...PAY, {cast: GP}, {resolve: true}, {to: {turn: 3, phase: "MAIN1"}}, {resolve: true},
    {choose: ["Don't cast"]}, {to: {turn: 3, phase: "MAIN2"}}]);
  eq([d.zones.exile.filter((id) => d.objects[id].copy === true).length, counters(d, 0), paradigms(d).length], [0, [2], 1],
    "declined: the copy ceases to exist (CR 704.5e), no counters, and the trigger stays for the next precombat main phase");
}

console.log(`engine-paradigm: ${checks} checks passed -- a spell exiled as it resolves, the first time one of its name resolves for each player a copy cast free at each of their precombat main phases, a countered one nothing.`);
