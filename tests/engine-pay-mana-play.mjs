/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* CASTING WHAT THIS CREATURE EXILED, ITS MANA COST PAID, AND A TAP COST THAT MAY TAP ITS OWN SOURCE (Boiling Rock Rioter:
 * "Tap an untapped Ally you control: Exile target card from a graveyard. Whenever this creature attacks, you may cast an
 * Ally spell from among cards you own exiled with this creature."; CR 607.2a, 608.2g, 601.2g-h, 605.3a, 109.5, 302.6).
 *
 * The tap cost may tap its own source unless it says "another" (rules/actions.mjs, tapChoices; station's selector says
 * so). The cast is play's `from: "selector"` -- here the cards exiled with this creature that its controller owns, Allies --
 * and `payMana`: its mana cost paid as it resolves from the pool and the caster's plain sources, colored symbols and all,
 * the ways to pay asked when there are more than one (effects/asking.mjs; rules/mana.mjs, unlessPlans). Its firebending is
 * tests/engine-firebending.mjs's.
 */
import assert from "node:assert/strict";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {play} from "../game/engine/script/effects/asking.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const ally = (cost, more = {}) => ({types: ["Creature"], subtypes: ["Human", "Ally"], manaCost: cost, colors: ["R"], power: 1, toughness: 1, ...more});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{G}", colors: ["G"], power: 2, toughness: 2}, "Ally Scout": ally("{R}"), "Ally Captain": ally("{1}{R}"), "Ally X": ally("{X}{R}"), "Ally Sage": ally("{U}", {colors: ["U"]}),
  Shock: {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Shock deals 2 damage to any target.", targets: [{what: "player"}],
    effects: [{effect: "dealDamage", amount: 2, who: {target: 0}}]}},
  Taiga: {types: ["Land"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: [{R: 1}, {G: 1}]}]}};
const run = (setup, steps, more = {}) => runScenario({name: "pay-mana", setup, steps, ...more}, index.definition, FIX).state;
/* It attacks: its firebending and its cast trigger, ordered so the {R} comes first. */
const ATTACK = [{attack: ["Boiling Rock Rioter"]}, {answer: [1, 0]}, {resolve: true}];

{
  /* The tap cost: the Rioter may tap itself ("an untapped Ally", no "other"), or another Ally; a non-Ally, never. */
  const s = run([at(0, "battlefield", "Boiling Rock Rioter", "Ally Scout", "Bear"), at(0, "graveyard", "Shock")], []);
  const ways = legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Boiling Rock Rioter").map((a) => (a.costNames ?? []).join(" + ")).sort();
  eq(ways, ["Ally Scout", "Boiling Rock Rioter"], "tapping itself or the Ally Scout, never the Bear");
}
{
  /* The cast as it attacks: paying its mana cost. Three ways to pay {1}{R} -- the firebent {R} and the Wastes, the Taiga's
     {R} and the firebent one for the {1}, or the Taiga and the Wastes -- asked; an {X} Ally and one Rob cannot pay for are
     not offered. */
  const exile = (card) => [{pass: 1}, {activate: "Boiling Rock Rioter", seat: 0, targets: [{card, seat: 0}], tapping: "Boiling Rock Rioter"}, {resolve: true}];
  const setup = [at(0, "battlefield", "Boiling Rock Rioter", "Wastes", "Taiga"), at(0, "graveyard", "Ally Captain", "Ally X", "Ally Sage")];
  const s = run(setup, [...exile("Ally Captain"), {to: {turn: 4, phase: "MAIN1"}}, ...exile("Ally X"), {to: {turn: 6, phase: "MAIN1"}}, ...exile("Ally Sage"),
    {to: {turn: 7, phase: "MAIN1"}}, ...ATTACK, {resolve: true}], {at: {turn: 2, phase: "MAIN1"}});
  eq(awaitingChoice(s).options.map((o) => o.label), ["Ally Captain", "Don't cast"], "the {1}{R} Captain offered; the {X}{R} one and the blue Sage not");
  resolveAwaiting(s, [0]);
  ok(/choose the mana/.test(awaitingChoice(s).title), "more than one way to pay: which, asked");
  const ways = awaitingChoice(s).options.map((o) => o.label);
  resolveAwaiting(s, [ways.findIndex((label) => /Taiga/.test(label) && !/Wastes/.test(label))]);
  const tapped = (card) => s.objects[s.zones.battlefield.find((id) => s.objects[id].card === card)].tapped;
  eq([ways.length, s.stack.at(-1)?.name, tapped("Taiga"), tapped("Wastes"), s.players[0].manaPool.R], [3, "Ally Captain", true, false, 0],
    "cast, paid the way chosen: the Taiga's {R} and the firebent one, the Wastes kept");
  /* Only cards exiled with this creature (CR 607.2a): a second Rioter's exile is its own. */
  const t = run([at(0, "battlefield", "Boiling Rock Rioter", "Boiling Rock Rioter"), at(0, "graveyard", "Ally Scout")], []);
  const [first, second] = t.zones.battlefield.filter((id) => t.objects[id].card === "Boiling Rock Rioter");
  (t.links ??= {})[first] = [t.zones.graveyard[0][0]];
  t.objects[t.zones.graveyard[0][0]].zone = "exile"; t.zones.exile.push(t.zones.graveyard[0].pop());
  const offered = (source) => { t.awaiting = null; return play.open(t, {from: "selector", selector: {zone: "exile", exiledWith: "self", owner: "you", subtypes: ["Ally"]}, payMana: true}, {controller: 0, source}); };
  t.players[0].manaPool.R = 1;
  eq([offered(second), offered(first)], [false, true], "the second Rioter finds nothing; the first, the Scout it exiled");
}

console.log(`engine-pay-mana-play: ${checks} checks passed -- a tap cost that may tap itself, never a creature its selector does not fit; the exiled Ally cast with its mana cost paid, its ways asked and paid the way chosen, an {X} or unpayable one not offered; only what this creature exiled`);
