/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* FIREBENDING, AND CASTING WHAT IT EXILED AS IT ATTACKS (Boiling Rock Rioter: "Firebending 1. Tap an untapped Ally you
 * control: Exile target card from a graveyard. Whenever this creature attacks, you may cast an Ally spell from among cards
 * you own exiled with this creature."; CR 702.189a, 500.5, 500.5a, 607.2a, 608.2g, 601.2g-h, 302.6).
 *
 * Firebending N is compiled to its triggered ability (cards/index.mjs): N {R} added and kept, as each step of the combat
 * phase ends, until the phase ends (effects/resources.mjs, addMana's `untilEndOfCombat`; rules/turn.mjs, emptyManaPools) --
 * the mana that would be lost spent first, so what is kept is the lesser of what was made so and what is left. The tap cost
 * may tap its own source unless it says "another" (rules/actions.mjs, tapChoices; station says so). The cast is play's
 * `from: "selector"` -- here the cards exiled with this creature that its controller owns, Allies -- and `payMana`, its mana
 * cost paid as it resolves from the pool and the caster's plain sources, colored symbols and all (effects/asking.mjs).
 */
import assert from "node:assert/strict";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {play} from "../game/engine/script/effects/asking.mjs";
import {keywordBuilt} from "../game/tools/engine-constructs.mjs";
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
const run = (setup, steps, more = {}) => runScenario({name: "fire", setup, steps, ...more}, index.definition, FIX).state;
const ATTACK = [{attack: ["Boiling Rock Rioter"]}, {answer: [1, 0]}, {resolve: true}];
const pool = (s) => s.players[0].manaPool.R ?? 0;

{
  /* The kept {R} and a Mountain's beside it: the Mountain's goes as the step ends, the firebent one stays; spent on a Shock,
     what is left of it stays. */
  const s = run([at(0, "battlefield", "Boiling Rock Rioter", "Mountain"), at(0, "hand", "Shock")], [...ATTACK, {tap: "Mountain"}]);
  eq([pool(s), s.players[0].combatMana], [2, {R: 1}], "two {R} in the pool, one of them firebent");
  const {state: t} = runScenario({name: "fire", setup: [at(0, "battlefield", "Boiling Rock Rioter", "Mountain")], steps: [...ATTACK, {tap: "Mountain"}, {resolve: true},
    {to: {turn: 1, phase: "COMBAT_DAMAGE"}}]}, index.definition, FIX);
  eq([t.players[0].manaPool.R, t.players[0].combatMana], [1, {R: 1}], "the Mountain's {R} is lost as the step ends; the firebent {R} stays");
  const u = run([at(0, "battlefield", "Boiling Rock Rioter"), at(0, "hand", "Shock")], [...ATTACK, {resolve: true}, {cast: "Shock", targets: [{player: 1}]}, {resolve: true},
    {to: {turn: 1, phase: "COMBAT_DAMAGE"}}]);
  eq([u.players[0].manaPool.R ?? 0, u.players[0].combatMana], [0, undefined], "spent on a Shock in combat: nothing left to keep");
  const v = run([at(0, "battlefield", "Boiling Rock Rioter")], [...ATTACK, {resolve: true}, {to: {turn: 1, phase: "END_OF_TURN"}}]);
  eq([v.players[0].manaPool.R ?? 0, v.players[0].combatMana], [0, undefined], "and gone once the combat phase ends (CR 500.5a)");
  /* Two kept, one spent: one is kept from then on -- a Mountain's {R} added later in combat goes as its step ends. */
  const LAMP = {...FIX, "Fire Lamp": {types: ["Artifact"], manaCost: "{0}", colors: [], abilities: [{id: "a", kind: "activated",
    text: "{0}: Add {R}{R}. Until end of combat, you don't lose this mana as steps and phases end.", cost: [], effects: [{effect: "addMana", mana: {R: 2}, untilEndOfCombat: true}]}]}};
  const spent = [{attack: ["Bear"]}, {activate: "Fire Lamp"}, {resolve: true}, {cast: "Shock", targets: [{player: 1}]}, {resolve: true}, {to: {turn: 1, phase: "COMBAT_DAMAGE"}}];
  const lamp = (steps) => runScenario({name: "fire", setup: [at(0, "battlefield", "Bear", "Fire Lamp", "Mountain"), at(0, "hand", "Shock")], steps}, index.definition, LAMP).state;
  const w = lamp(spent);
  eq([w.players[0].manaPool.R, w.players[0].combatMana], [1, {R: 1}], "two kept, one spent on a Shock: one kept");
  const x = lamp([...spent, {tap: "Mountain"}, {to: {turn: 1, phase: "COMBAT_END"}}]);
  eq(x.players[0].manaPool.R, 1, "the Mountain's {R} added after is lost as the damage step ends; the one kept stays");
}
{
  /* The keyword compiled: N {R}, kept. Its number is required. */
  const script = (amount) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Creature"], manaCost: "{R}", colors: ["R"], power: 1, toughness: 1},
    oracleText: `Firebending ${amount}`, source: "hand", abilities: [{kind: "keyword", text: `Firebending ${amount}`, keyword: "firebending", ...(amount ? {amount} : {})}]});
  const compiled = compileScript(script(2));
  eq(compiled.definition?.abilities?.[0]?.effects ?? compiled.abilities?.[0]?.effects, [{effect: "addMana", mana: {R: 2}, untilEndOfCombat: true}], "Firebending 2: two {R}, kept");
  ok(JSON.stringify(compileScript(script(0)).problems ?? []).includes("firebending needs its number"), "with no number, refused");
  ok(keywordBuilt("Firebending"), "and credited, its one form built");
}
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

console.log(`engine-firebending: ${checks} checks passed -- firebent mana kept through combat, the lost mana spent first, gone with the phase; the keyword compiled and credited; a tap cost that may tap itself; the exiled Ally cast with its mana cost paid, its ways asked, an {X} or unpayable one not offered; only what this creature exiled`);
