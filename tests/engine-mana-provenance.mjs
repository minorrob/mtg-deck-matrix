/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "WHENEVER YOU CAST A SPELL, IF MANA FROM A TREASURE WAS SPENT TO CAST IT, YOU DRAW A CARD AND LOSE 1 LIFE" (Smaug, Wicked
 * Worm; Train C phase 2, w2a-selectors; CR 106.3, 601.2h, 603.4, 608.2h).
 *
 * The source of mana is the object whose ability made it (CR 106.3), as it was as it made it -- a Treasure is sacrificed for
 * its mana. Mana whose source an ability in the game asks after (a `spentFrom` condition) is remembered beside the pool as
 * rider mana is (rules/restricted-mana.mjs, addProvenance); spent to cast a spell, the spell keeps the sources
 * (`spentFrom`, rules/actions.mjs), and the trigger's snapshot of the spell keeps them too (rules/trigger.mjs) for when it is
 * gone. Where it is read -- a spell of a player who controls a permanent that asks -- which mana pays is the caster's: each
 * way an offer, or, when the pool pays more than one way, each way of the pool question (CR 601.2h). The card's scenarios
 * play Smaug; this suite holds when mana is remembered at all, the pool question, a countered spell, another player's
 * Treasure, the pool emptying, and the grammar.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {conditionProblems, conditionHolds} from "../game/engine/script/condition.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {
  Rite: {types: ["Sorcery"], manaCost: "{1}", colors: [], spell: {id: "s", text: "You gain 3 life.", targets: [], effects: [{effect: "gainLife", amount: 3}]}},
  Bigger: {types: ["Sorcery"], manaCost: "{1}{B}", colors: ["B"], spell: {id: "s", text: "You gain 3 life.", targets: [], effects: [{effect: "gainLife", amount: 3}]}},
  Trinket: {types: ["Artifact"], manaCost: "{1}", colors: []},
  Hoard: {types: ["Sorcery"], manaCost: "{C}", colors: [], spell: {id: "s", text: "Create two Treasure tokens.", targets: [], effects: [{effect: "createToken", count: 2, token: {predefined: "Treasure"}}]}},
  Denial: {types: ["Instant"], manaCost: "{C}", colors: ["U"], spell: {id: "s", text: "Counter target spell.", targets: [{what: "spell"}], effects: [{effect: "counterSpell", spells: {target: 0}}]}},
};
const play = (seats, setup, steps = []) => runScenario({name: "treasure", seats, setup, steps}, index.definition, FIX).state;
const named = (s, card, seat = 0) => s.zones.battlefield.find((id) => s.objects[id].card === card && s.objects[id].controller === seat);
const tap = (s, card, color, seat = 0) => applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "activate-mana" && a.objectId === named(s, card, seat) && (color === undefined || (a.mana?.[color] ?? 0) > 0)));
const settle = (s) => { for (let n = 0; n < 60 && (s.awaiting || s.stack.length); n += 1) { if (s.awaiting) { const c = awaitingChoice(s); resolveAwaiting(s, c.options.slice(0, Math.max(1, c.min ?? 0)).map((o) => o.index)); } else passPriority(s); } };
/* Rob's Treasures, made by a spell (no Smaug needed to make them). */
const treasures = (setup, seats = 2) => play(seats, setup, [{tap: "Wastes"}, {cast: "Hoard"}, {resolve: true}]);

/* ---- remembered only when an ability in the game asks ---- */
{
  const s = treasures([at(0, "battlefield", "Wastes"), at(0, "hand", "Hoard")]);
  tap(s, "Treasure", "R");
  eq(s.players[0].manaRiders ?? [], [], "no ability in the game asks after a Treasure: its {R} is mana like any other");
  const t = treasures([at(0, "battlefield", "Wastes", "Plains"), at(0, "hand", "Hoard"), at(1, "library", "Smaug, Wicked Worm")]);
  tap(t, "Treasure", "R");
  eq((t.players[0].manaRiders ?? []).map((r) => [r.key, r.from?.subtypes]), [["R", ["Treasure"]]], "Smaug anywhere in the game -- Maya's library -- and the Treasure's {R} is remembered, as the Treasure it was");
  tap(t, "Plains");
  eq((t.players[0].manaRiders ?? []).length, 1, "a Plains' {W} is not: nothing asks after a land");
  /* The pool empties at the step's end (CR 106.4), and with it what was remembered. */
  for (let n = 0; n < 20 && t.phase === "MAIN1"; n += 1) { if (t.priorityPlayer === null) advance(t); else if (passPriority(t).outcome === "step-ends") advance(t); }
  eq(t.players[0].manaRiders ?? [], [], "the pool empty, nothing is remembered");
}

/* ---- the pool pays more than one way: the question offers the Treasure's mana, and not ---- */
{
  const s = treasures([at(0, "battlefield", "Wastes", "Swamp", "Mountain", "Smaug, Wicked Worm"), at(0, "hand", "Hoard", "Bigger")]);
  tap(s, "Treasure", "B"); tap(s, "Swamp"); tap(s, "Mountain");
  /* {B} (Treasure), {B}, {R} for {1}{B}: the generic paid with a {B} or the {R} -- and either {B} the Treasure's or not. */
  const offer = legalActions(s, 0).find((a) => a.kind === "cast" && a.label === "Bigger");
  ok(offer.payWays === true, "more than one way from the pool: the cast asks which");
  applyAction(s, 0, offer);
  const labels = awaitingChoice(s).options.map((o) => o.label);
  eq(labels.length, 3, `three ways: ${labels.join(" | ")}`);
  ok(labels.some((l) => /with the mana from Treasure/.test(l)) && labels.some((l) => !/Treasure/.test(l)), "with the Treasure's mana, and without it");
  /* The {B}{R} way, the Treasure's {B} among it: Smaug triggers. */
  resolveAwaiting(s, [awaitingChoice(s).options.findIndex((o) => /\{R\}/.test(o.label) && /Treasure/.test(o.label))]);
  eq(s.stack.filter((e) => e.kind === "trigger").length, 1, "the Treasure's {B} spent: Smaug triggers");
  eq(s.players[0].manaPool, {W: 0, U: 0, B: 1, R: 0, G: 0, C: 0}, "and the Swamp's {B} is left in the pool");
  ok(s.objects[s.stack.find((e) => e.kind === "spell").objectId].spentFrom.length === 1, "the spell keeps the source of the mana: one Treasure");
}

/* ---- where the choice is asked: Rob's spells, while he controls Smaug -- each Treasure's mana alike ---- */
{
  const s = treasures([at(0, "battlefield", "Wastes", "Swamp", "Smaug, Wicked Worm"), at(0, "hand", "Hoard", "Rite")]);
  tap(s, "Treasure", "B"); tap(s, "Treasure", "B"); tap(s, "Swamp");
  /* {B}{B}{B}, two of them Treasures', for {1}: the Swamp's or a Treasure's -- two ways, not one for each Treasure. */
  eq(legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === "Rite").map((a) => (a.riders ?? []).length), [0, 1], "two ways: without Treasure mana, and with one");
}
{
  /* Maya's Treasure mana for Maya's spell, Smaug Rob's: nothing reads it, so nothing to choose. */
  const s = play(2, [at(0, "battlefield", "Smaug, Wicked Worm"), at(1, "battlefield", "Wastes", "Swamp"), at(1, "hand", "Hoard", "Rite")],
    [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Wastes", seat: 1}, {cast: "Hoard", seat: 1}, {resolve: true}]);
  tap(s, "Treasure", "B", 1); tap(s, "Swamp", undefined, 1);
  eq(legalActions(s, 1).filter((a) => a.kind === "cast" && a.label === "Rite").length, 1, "Maya's cast: one way");
}
{
  /* What Rob's permanent asks after is a Gold's mana; Smaug, in Maya's library, makes a Treasure's remembered -- and Rob's
     permanent does not read it: one way. */
  const gold = {types: ["Enchantment"], manaCost: "{1}", colors: [], abilities: [{id: "g", kind: "triggered", text: "Whenever you cast a spell, if mana from a Gold was spent to cast it, you gain 1 life.",
    trigger: {on: "GameEventSpellAbilityCast", caster: "you"}, condition: {spentFrom: {subtypes: ["Gold"]}}, effects: [{effect: "gainLife", amount: 1}]}]};
  const s = runScenario({name: "gold", setup: [at(0, "battlefield", "Wastes", "Swamp", "Goldwatch"), at(0, "hand", "Hoard", "Rite"), at(1, "library", "Smaug, Wicked Worm")],
    steps: [{tap: "Wastes"}, {cast: "Hoard"}, {resolve: true}]}, index.definition, {...FIX, Goldwatch: gold}).state;
  tap(s, "Treasure", "B"); tap(s, "Swamp");
  eq((s.players[0].manaRiders ?? []).length, 1, "the Treasure's {B} is remembered: Smaug asks after it");
  eq(legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === "Rite").length, 1, "but Rob's Goldwatch asks after a Gold: one way");
}
{
  /* An ability's cost: no spell is cast, nothing reads it -- one way. */
  const relic = {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "r", kind: "activated", text: "{1}: You gain 1 life.", cost: [{atom: "mana", cost: "{1}"}], targets: [], effects: [{effect: "gainLife", amount: 1}]}]};
  const s = runScenario({name: "relic", setup: [at(0, "battlefield", "Wastes", "Swamp", "Smaug, Wicked Worm", "Relic"), at(0, "hand", "Hoard")], steps: [{tap: "Wastes"}, {cast: "Hoard"}, {resolve: true}]},
    index.definition, {...FIX, Relic: relic}).state;
  tap(s, "Treasure", "B"); tap(s, "Swamp");
  eq(legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Relic").length, 1, "the Relic's {1}: one way");
}

/* ---- the spell gone before the trigger resolves: read as it last was (CR 608.2h) ---- */
{
  const s = treasures([at(0, "battlefield", "Wastes", "Smaug, Wicked Worm"), at(0, "hand", "Hoard", "Rite"), at(1, "battlefield", "Wastes"), at(1, "hand", "Denial")]);
  tap(s, "Treasure", "B");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === "Rite"));
  for (let n = 0; n < 5 && s.priorityPlayer !== 0; n += 1) passPriority(s);
  /* Rob passes with Smaug's trigger above Rite; Maya counters Rite, and her Denial resolves first. */
  passPriority(s);
  tap(s, "Wastes", undefined, 1);
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "cast" && a.label === "Denial" && s.objects[a.targets[0].id]?.card === "Rite"));
  const hand = s.zones.hand[0].length;
  settle(s);
  ok(s.zones.graveyard[0].some((id) => s.objects[id].card === "Rite"), "Rite was countered");
  eq([s.zones.hand[0].length, s.players[0].life], [hand + 1, 39], "Smaug's trigger still resolves: its spell, as it last was, was paid with Treasure mana -- a card, and 1 life");
}

/* ---- Maya's Treasure, Maya's spell: Smaug watches Rob's ---- */
{
  const s = play(2, [at(0, "battlefield", "Smaug, Wicked Worm"), at(1, "battlefield", "Wastes"), at(1, "hand", "Hoard", "Rite")],
    [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Wastes", seat: 1}, {cast: "Hoard", seat: 1}, {resolve: true}]);
  tap(s, "Treasure", "B", 1);
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "cast" && a.label === "Rite"));
  eq(s.stack.filter((e) => e.kind === "trigger").length, 0, "Maya's spell, paid with her Treasure's mana: not Rob's to trigger on");
}

/* ---- the condition and its grammar ---- */
{
  const was = {cardId: 9, types: ["Artifact"], subtypes: ["Treasure"], supertypes: [], controller: 0, token: true};
  const asks = {spentFrom: {subtypes: ["Treasure"]}};
  const s = play(2, []);
  ok(conditionHolds(s, asks, {controller: 0, about: {card: 999, was: {spentFrom: [was]}}}), "a spell gone: its snapshot's sources");
  ok(!conditionHolds(s, asks, {controller: 0, about: {card: 999, was: {}}}), "none recorded: no Treasure mana was spent");
  ok(!conditionHolds(s, {spentFrom: {subtypes: ["Gold"]}}, {controller: 0, about: {card: 999, was: {spentFrom: [was]}}}), "a Gold's mana is not a Treasure's");
  ok(conditionProblems({spentFrom: {power: {min: 2}}}).some((p) => /spentFrom/.test(p)), "what it asks of the source is what last known information keeps");
  const smaug = JSON.parse(readFileSync(new URL("../game/engine/cards/s/smaug-wicked-worm.json", import.meta.url), "utf8"));
  eq(validateScript(smaug).valid, true, "Smaug's definition is a valid script");
}

console.log(`engine-mana-provenance: ${checks} checks passed`);
