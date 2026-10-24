/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CARD LOAD OF 2026-10-23, LANE L6 (SPELLS, DRAWS AND DISCARDS): WHAT THE CARDS' SCENARIOS CANNOT REACH.
 *
 * The lane's rules are each held by a card's scenarios (Sylvan Library, High Tide, Expressive Iteration, Tear Asunder, Chord
 * of Calling, Cut a Deal, Syphon Mind, Bloodletter of Aclazotz, Crackle with Power, Organic Extinction, Inspiring Statuary,
 * Apex Devastator, Isochron Scepter). This suite holds the rest: what a script may not say, the question improvise asks, an
 * opponent who draws nothing, and life paid while Bloodletter of Aclazotz watches.
 */
import assert from "node:assert/strict";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {changeLife} from "../game/engine/script/effects/resources.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Rock: {types: ["Artifact"], manaCost: "{1}", colors: []}, Bear: {types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Wolf: {types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
const play = (name, setup, steps = [], seats = 2) => runScenario({name, seats, setup, steps}, index.definition, FIX).state;
const castOf = (s, card) => legalActions(s, s.priorityPlayer ?? 0).filter((a) => a.kind === "cast" && s.objects[a.objectId]?.card === card);

/* ---- what a script may not say ---- */
const script = (abilities, more = {}) => ({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Instant"], subtypes: [], manaCost: "{R}", colors: ["R"],
  colorIdentity: ["R"], ...more}, oracleText: "Odd.", abilities});
{
  /* "They lose twice that much life instead": how many times, 2 or more (script/schema.mjs). */
  const loss = (times) => compileScript(script([{kind: "static", text: "Odd.", rule: "more-life-loss", affects: {who: "opponent"}, times, duringYourTurn: true}], {types: ["Enchantment"]}));
  eq([loss(2).problems, loss(1).problems.some((p) => /a whole number, 2 or more/.test(p))], [[], true], "more-life-loss: twice or more, never once");
  /* A kicked script is a kicker card's (cards/index.mjs). */
  const kicked = {kind: "spell", text: "Odd.", targets: [], effects: [{effect: "draw", count: 1}], kicked: {targets: [], effects: [{effect: "draw", count: 2}]}};
  ok(compileScript(script([kicked])).problems.some((p) => /a card with kicker's/.test(p)), "a kicked script without kicker is refused");
  eq(compileScript(script([{kind: "keyword", text: "Kicker {1}", keyword: "kicker", cost: "{1}"}, kicked])).problems, [], "with kicker, it compiles");
  ok(compileScript(script([{kind: "keyword", text: "Kicker", keyword: "kicker", cost: "{X}"}, kicked])).problems.some((p) => /kicker is a mana cost/.test(p)), "kicker {X} is refused");
  const empty = {...kicked, kicked: {targets: [], effects: []}};
  ok(compileScript(script([{kind: "keyword", text: "Kicker {1}", keyword: "kicker", cost: "{1}"}, empty])).problems.some((p) => /says its effects/.test(p)), "a kicked script with no effects is refused");
  /* "For each of those cards" (Sylvan Library): repeatFor over what was remembered; an unknown range refused. */
  const each = (word) => compileScript(script([{kind: "spell", text: "Odd.", targets: [], effects: [{effect: "repeatFor", each: word, effects: [{effect: "draw", count: 1}]}]}])).problems;
  eq([each("remembered"), each("card").length > 0], [[], true], "repeatFor each remembered card; each \"card\" is no range");
}

/* ---- improvise asks for artifacts ---- */
{
  const s = play("improvise", [at(0, "battlefield", "Plains", "Plains", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes", "Rock", "Ornithopter"), at(0, "hand", "Organic Extinction")],
    ["Plains", "Plains", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes"].map((tap) => ({tap})));
  const offer = castOf(s, "Organic Extinction").find((a) => a.convoke === true);
  ok(offer, "the pool and two artifacts can pay it: the improvise offer");
  applyAction(s, 0, offer);
  const choice = awaitingChoice(s);
  eq([choice.title, choice.options.map((o) => o.label).sort()], ["Organic Extinction: tap artifacts to improvise it", ["Ornithopter", "Rock"]], "the artifacts are asked for, in words");
}

/* ---- convoke with {X}: the creatures it asks for are what X=2 leaves the pool short of (Chord of Calling) ---- */
{
  const s = play("chord", [at(0, "battlefield", "Forest", "Forest", "Forest", "Bear", "Wolf"), at(0, "hand", "Chord of Calling")], ["Forest", "Forest", "Forest"].map((tap) => ({tap})));
  applyAction(s, 0, castOf(s, "Chord of Calling").find((a) => a.convoke === true && a.x === 2));
  const choice = awaitingChoice(s);
  eq([choice.min, choice.max], [1, 2], "X=2 with {G}{G}{G} in the pool: one creature at least -- the pool cannot pay it alone -- two at most");
}

/* ---- Cut a Deal: an opponent who draws nothing is not counted (CR 121.4) ---- */
{
  const s = play("cut a deal", [at(0, "battlefield", "Plains", "Wastes", "Wastes"), at(0, "hand", "Cut a Deal")], ["Plains", "Wastes", "Wastes"].map((tap) => ({tap})), 4);
  s.zones.library[2] = [];
  const before = s.zones.hand[0].length;
  applyAction(s, 0, castOf(s, "Cut a Deal")[0]);
  /* Everyone passes: the spell resolves. */
  const rng = createRng(7);
  for (let n = 0; n < 8 && s.stack.length; n += 1) passPriority(s, null, rng);
  eq([s.stack.length, s.zones.hand[0].length - (before - 1), s.zones.hand[1].length, s.zones.hand[2].length], [0, 2, 1, 0], "two opponents drew, one could not: Rob draws two");
}

/* ---- Bloodletter of Aclazotz: life paid is life lost, doubled too (its rulings) ---- */
{
  const s = play("bloodletter", [at(0, "battlefield", "Bloodletter of Aclazotz")]);
  changeLife(s, 1, -2, []);
  changeLife(s, 0, -2, []);
  eq([s.players[1].life, s.players[0].life], [36, 38], "on Rob's turn Maya's 2 is 4; his own is 2");
}

console.log(`engine-spells-w4d: ${checks} checks passed -- the card load of 2026-10-23's lane L6: more-life-loss twice or more, kicker's script and its cost, repeatFor over the remembered, improvise's question, convoke's with X, an opponent who draws nothing, life paid under Bloodletter.`);
