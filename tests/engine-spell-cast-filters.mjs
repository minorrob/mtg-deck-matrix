/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "ONCE DURING EACH OF YOUR TURNS", "A MULTICOLORED SPELL" AND "A SPELL THAT TARGETS A CREATURE" (Rob's Priority Batch
 * 10.3, its forty-second slice: Zaffai and the Tempests, the 316th card of Rob's list, Mage Tower Referee, the 318th, and
 * Rehearsed Debater, the 324th).
 *
 * A free cast's static (rules/statics.mjs, freeCast) reads its own `condition`, as the other rule statics that read one
 * do: Zaffai's is `yourTurn`, with a limit of one, so the instant or sorcery spell it casts for nothing is one during
 * each of its controller's turns and none during anyone else's. A selector's `multicolored` (script/filter.mjs) is two
 * or more colors (CR 105.2b), through the layers. And a "spell cast" trigger's `targets` (rules/trigger.mjs) is what one
 * of the spell's targets must be -- chosen as it was cast (CR 601.2c), so before it became cast (601.2i) -- a player it
 * targets fitting no such selector.
 *
 * The card scenarios play the cards. This suite holds the edges: the condition on another player's turn, the limit
 * spent, colorless and one color against two, a spell with a player and a creature among its targets, a creature card
 * in a graveyard, and the compiler.
 */
import assert from "node:assert/strict";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {freeCast} from "../game/engine/rules/statics.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const spell = (types, manaCost, colors, text, targets, effects) => ({types, manaCost, colors, spell: {id: "s", text, targets, effects}});
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Frog: {types: ["Creature"], subtypes: ["Frog"], manaCost: "{U}{R}", colors: ["U", "R"], power: 2, toughness: 2},
  Bauble: {types: ["Artifact"], manaCost: "{0}", colors: []},
  Spark: spell(["Instant"], "{R}", ["R"], "Spark deals 1 damage to target player.", [{what: "player"}], [{effect: "dealDamage", amount: 1, who: {target: 0}}]),
  Insight: spell(["Instant"], "{U}", ["U"], "Draw a card.", [], [{effect: "draw", count: 1}]),
  Fork: spell(["Sorcery"], "{R}", ["R"], "Fork deals 1 damage to target player and 1 damage to target creature.", [{what: "player"}, {what: "permanent", types: ["Creature"]}],
    [{effect: "dealDamage", amount: 1, who: {target: 0}}, {effect: "dealDamage", amount: 1, targets: {target: 1}}]),
  Raise: spell(["Sorcery"], "{B}", ["B"], "Return target creature card from your graveyard to your hand.", [{what: "card", zone: "graveyard", types: ["Creature"], controller: "you"}],
    [{effect: "moveZone", targets: {target: 0}, to: "hand"}]),
};
const play = (setup, steps = [], more = {}) => runScenario({name: "spell-cast filters", setup, steps, ...more}, index.definition, FIX).state;
const inZone = (s, zone, card) => Object.keys(s.objects).map(Number).filter((id) => s.objects[id].card === card && s.objects[id].zone === zone);
const idIn = (s, zone, card) => inZone(s, zone, card)[0];
const countIn = (s, zone, card) => inZone(s, zone, card).length;
const casts = (s, seat, card) => legalActions(s, seat).filter((a) => a.kind === "cast" && s.objects[a.objectId]?.card === card);
const named = (s) => s.stack.map((e) => e.name);

/* ---- a free cast's own condition: once during each of your turns ---- */
{
  const s = play([at(0, "battlefield", "Zaffai and the Tempests"), at(0, "hand", "Insight", "Bear")]);
  const zaffai = idIn(s, "battlefield", "Zaffai and the Tempests");
  eq([freeCast(s, 0, idIn(s, "hand", "Insight"))?.source, freeCast(s, 0, idIn(s, "hand", "Insight"))?.limited], [zaffai, true], "Rob's turn: Insight may be cast for nothing, once");
  eq([casts(s, 0, "Insight").length, casts(s, 0, "Insight")[0]?.free], [1, true], "with no mana, the free cast is Insight's one offer");
  eq(freeCast(s, 0, idIn(s, "hand", "Bear")), null, "a creature spell is neither an instant nor a sorcery");
}
{
  const s = play([at(0, "battlefield", "Zaffai and the Tempests"), at(0, "hand", "Insight")], [{pass: 1}], {at: {turn: 2, phase: "MAIN1"}});
  eq([s.activePlayer, s.priorityPlayer], [1, 0], "Maya's turn, and Rob holds priority");
  eq([freeCast(s, 0, idIn(s, "hand", "Insight")), casts(s, 0, "Insight").length], [null, 0], "Maya's turn: no free spell, and Insight is not offered");
}
{
  const once = [{cast: "Insight"}, {resolve: true}];
  const s = play([at(0, "battlefield", "Zaffai and the Tempests"), at(0, "hand", "Insight", "Insight")], once);
  eq([countIn(s, "graveyard", "Insight"), casts(s, 0, "Insight").length], [1, 0], "once used, no second free spell this turn");
  const t = play([at(0, "battlefield", "Zaffai and the Tempests"), at(0, "hand", "Insight", "Insight")], [...once, {to: {turn: 3, phase: "MAIN1"}}]);
  eq([t.activePlayer, casts(t, 0, "Insight").length], [0, 1], "Rob's next turn: once again");
}

/* ---- a multicolored spell ---- */
{
  const s = play([at(0, "hand", "Frog", "Spark", "Bauble", "Bear")]);
  const multicolored = compileSelector({what: "card", zone: "hand", multicolored: true});
  eq(Object.keys(s.objects).map(Number).filter((id) => s.objects[id].zone === "hand" && multicolored(s, id, {controller: 0})).map((id) => s.objects[id].card),
    ["Frog"], "two colors are multicolored; one color, or none, is not");
  assert.throws(() => compileSelector({multicolored: false}), /multicolored is true/, "the grammar holds multicolored to true"); checks += 1;
}

/* ---- a spell that targets a creature ---- */
{
  const debater = [at(0, "battlefield", "Rehearsed Debater", "Mountain", "Swamp"), at(1, "battlefield", "Bear")];
  const zap = play([...debater, at(0, "hand", "Fork")], [{tap: "Mountain"}, {cast: "Fork", targets: [{player: 1}, {card: "Bear"}]}]);
  eq(named(zap), ["Fork", "Rehearsed Debater"], "a player and a creature among its targets: it triggers, the creature enough");
  const spark = play([...debater, at(0, "hand", "Spark")], [{tap: "Mountain"}, {cast: "Spark", targets: [{player: 1}]}]);
  eq(named(spark), ["Spark"], "a player alone: no trigger");
  const raise = play([...debater, at(0, "hand", "Raise"), at(0, "graveyard", "Bear")], [{tap: "Swamp"}, {cast: "Raise", targets: [{card: "Bear"}]}]);
  eq(named(raise), ["Raise"], "a creature card in a graveyard is not a creature: no trigger");
}

/* ---- the compiler ---- */
const compile = (ability) => compileScript({schema: "CrankCardScript@1", identity: {name: "Odd Card", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: []},
  oracleText: ability.text, source: "hand", abilities: [ability]});
{
  const free = compile({kind: "static", text: "Once during each of your turns, you may cast a spell without paying its mana cost.", rule: "cast-without-paying", affects: {}, limit: 1, condition: {yourTurn: true}});
  eq([free.problems, free.definition?.abilities?.[0]?.condition], [[], {yourTurn: true}], "a free cast's static takes a condition");
  const text = "Whenever you cast a spell that targets a creature, draw a card.";
  const aimed = compile({kind: "triggered", text, trigger: {on: "spell cast", caster: "you", targets: {what: "permanent", types: ["Creature"]}}, effects: [{effect: "draw", count: 1}]});
  eq([aimed.problems, aimed.definition?.abilities?.[0]?.trigger?.targets], [[], {what: "permanent", types: ["Creature"]}], "a spell cast trigger carries what its spell targets");
  const elsewhere = compile({kind: "triggered", text, trigger: {on: "enters", who: "self", targets: {what: "permanent"}}, effects: [{effect: "draw", count: 1}]});
  ok(elsewhere.problems.some((p) => p.includes("what a spell targets is read as it is cast")), "another trigger refuses it, rather than dropping it");
  const odd = compile({kind: "triggered", text, trigger: {on: "spell cast", caster: "you", targets: {hue: "red"}}, effects: [{effect: "draw", count: 1}]});
  ok(odd.problems.some((p) => p.includes("no key \"hue\"")), "what it targets is held to the selector grammar");
}
for (const name of ["Zaffai and the Tempests", "Mage Tower Referee", "Rehearsed Debater"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-spell-cast-filters: ${checks} checks passed -- a free cast once during each of your turns, none during another's; two colors or more are multicolored; a spell cast that targets a creature, not a player or a card.`);
