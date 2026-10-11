/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* COMPLEATED (CR 702.150; Vraska, Betrayal's Sting, Train C phase 2).
 *
 * "If this permanent would enter with one or more loyalty counters on it and the player who cast it chose to pay life for
 * any part of its cost represented by Phyrexian mana symbols, it instead enters with that many loyalty counters minus two
 * for each of those mana symbols" (702.150a). The cast remembers how many Phyrexian symbols its caster paid with life
 * (rules/actions.mjs, `phyrexianLife`), and the planeswalker's entering reads it (rules/replacement.mjs,
 * enteringModifications) -- never below none.
 *
 * And what Vraska's other abilities needed: "target creature becomes a Treasure artifact with '{T}, Sacrifice this artifact:
 * Add one mana of any color' and loses all other card types and abilities" -- two effects for good, its type in layer 4 and
 * its abilities in layer 6, the given mana ability a Treasure token's (as Emrakul, the Exigent Doom gives one); and
 * "a number of poison counters equal to the difference" -- an amount of a target player's counters (script/amount.mjs,
 * `countersOn` a target player).
 */
import {enteringModifications} from "../game/engine/rules/replacement.mjs";
import {typesOf, subtypesOf, keywordsOf} from "../game/engine/rules/layers.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
import {play, drive, happen, at, idOf, compiled, labels, keywordBuilt, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-compleated");
const V = "Vraska, Betrayal's Sting";
const walker = (name, abilities, more = {}) => compiled(abilities, {name, types: ["Planeswalker"], subtypes: ["Test"], manaCost: "{B/P}{B/P}", colors: ["B"], power: null, toughness: null, loyalty: 5, ...more});
const COMPLEATED = {kind: "keyword", text: "Compleated", keyword: "compleated"};
const twin = walker("Twin Walker", [COMPLEATED]), plain = walker("Plain Walker", []), low = walker("Low Walker", [COMPLEATED], {loyalty: 1, manaCost: "{1}{B/P}"});
const FIX = {"Twin Walker": {...twin.definition, card: "Twin Walker"}, "Plain Walker": {...plain.definition, card: "Plain Walker"}, "Low Walker": {...low.definition, card: "Low Walker"},
  "Sky Bear": {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2, keywords: ["Flying"]}};
const loyalty = (s, name) => s.objects[idOf(s, name)]?.counters.loyalty;
const cast = (name, lands = [], answer = []) => play([at(0, "hand", name), at(0, "battlefield", ...lands)], [...lands.map((l) => ({tap: l})), {cast: name}, ...answer.map((a) => ({choose: [a]})), {resolve: true}], {}, FIX);

{
  eq([twin.problems, twin.definition.keywords, index.definition(V).keywords], [[], ["Compleated"], ["Compleated"]], "the keyword: a planeswalker's");
  ok(compiled([COMPLEATED], {manaCost: "{B/P}"}).problems.some((p) => p.includes("compleated is a planeswalker's")), "on a creature, refused");
  ok(walker("No Phyrexian", [COMPLEATED], {manaCost: "{2}{B}"}).problems.some((p) => p.includes("compleated is a planeswalker's")), "and on a planeswalker with no Phyrexian symbol");
}
{
  /* Two {B/P}: each paid with life is two fewer. */
  const s = play([at(0, "hand", "Twin Walker")], [{cast: "Twin Walker"}], {}, FIX);
  eq([s.stack[0].cast.phyrexianLife, s.players[0].life], [2, 36], "both {B/P} paid with life, 4 life: the cast remembers two symbols");
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null);
  eq(loyalty(s, "Twin Walker"), 1, "five, less two for each: one");
  const t = cast("Twin Walker", ["Swamp"], ["{B} and 2 life"]);
  eq([loyalty(t, "Twin Walker"), t.players[0].life], [3, 38], "one paid with {B}, one with life: three");
  const u = cast("Twin Walker", ["Swamp", "Swamp"], ["{B}{B}"]);
  eq([loyalty(u, "Twin Walker"), u.players[0].life], [5, 40], "both with mana: five, and no life paid");
  const asked = play([at(0, "hand", "Twin Walker"), at(0, "battlefield", "Swamp", "Swamp")], [{tap: "Swamp"}, {tap: "Swamp"}, {cast: "Twin Walker"}], {}, FIX);
  eq([asked.awaiting?.kind, labels(asked).sort(), asked.stack.length], ["choose-cost", ["4 life", "{B} and 2 life", "{B}{B}"], 0],
    "a pool of {B}{B} pays it three ways: his to choose, before it is cast");
}
{
  /* Not compleated: life paid changes nothing. Below none: none (and it dies, CR 704.5i). */
  eq(loyalty(play([at(0, "hand", "Plain Walker")], [{cast: "Plain Walker"}, {resolve: true}], {}, FIX), "Plain Walker"), 5, "a planeswalker without compleated, paid with life: five");
  const s = play([at(0, "hand", "Low Walker"), at(0, "battlefield", "Wastes")], [{tap: "Wastes"}, {cast: "Low Walker"}], {}, FIX);
  const id = s.stack[0].objectId;
  eq(enteringModifications(s, {objectId: id, player: 0, types: ["Planeswalker"], abilities: s.objects[id].abilities, phyrexianLife: 1}).counters.loyalty, 0, "one, less two: none, not fewer");
  eq(enteringModifications(s, {objectId: id, player: 0, types: ["Creature"], abilities: s.objects[id].abilities, phyrexianLife: 1}).counters, {},
    "were it to enter as no planeswalker, with no loyalty counters: none to take");
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null);
  eq(s.zones.graveyard[0].map((g) => s.objects[g].card), ["Low Walker"], "and with none it is put into the graveyard");
  eq(enteringModifications(s, {objectId: idOf(s, "Wastes"), player: 0, types: ["Land"], abilities: [], phyrexianLife: 1}).counters, {}, "a land: no loyalty to take from");
}
{
  /* Vraska's -2: a Treasure artifact for good, no other type, none of its abilities -- but the Treasure's. */
  const s = play([at(0, "hand", V), at(0, "battlefield", "Swamp", "Swamp", "Wastes", "Wastes", "Wastes", "Wastes"), at(1, "battlefield", "Sky Bear")],
    [..."Swamp Swamp Wastes Wastes Wastes Wastes".split(" ").map((l) => ({tap: l})), {cast: V}, {choose: ["{B}{B}{C}{C}{C}{C}"]}, {resolve: true},
      {activate: V, ability: "a2", targets: [{card: "Sky Bear"}]}, {resolve: true}, {to: {turn: 3, phase: "MAIN1"}}], {}, FIX);
  const bear = idOf(s, "Sky Bear");
  const given = index.definition(V).abilities.find((a) => a.id === "a2").effects[1].apply.addAbilities;
  eq([given.length, given[0].kind, given[0].anyColor, given[0].sacrificeSelf, given[0].tapSelf], [1, "mana", true, true, true], "the Treasure's ability, a mana ability as a Treasure token's is");
  eq([typesOf(s, bear), subtypesOf(s, bear), keywordsOf(s, bear)], [["Artifact"], ["Treasure"], []], "two turns on: a Treasure artifact, not a creature, without flying");
  drive(s, (st) => st.turn === 4 && st.phase === "MAIN1" && st.priorityPlayer === 1);
  eq(legalActions(s, 1).filter((a) => a.objectId === bear && a.kind === "activate-mana").length, 5, "on hers: tap and sacrifice it for one mana of any color, five ways");
  happen(s, {effect: "moveZone", targets: [bear], to: "hand"});
  happen(s, {effect: "moveZone", targets: [s.zones.hand[1].find((h) => s.objects[h].card === "Sky Bear")], to: "battlefield"}, {controller: 1, source: null});
  const back = idOf(s, "Sky Bear");
  eq([typesOf(s, back), keywordsOf(s, back)], [["Creature"], ["Flying"]], "returned to her hand and put back: a new object, a flying Bear again");
}
{
  /* Vraska's -9: the difference to nine, of a target player's poison counters -- none if she has nine already. */
  const s = play([at(0, "battlefield", V)], [], {}, FIX);
  s.players[1].poison = 4;
  s.players[1].counters = {...(s.players[1].counters ?? {}), energy: 2};
  const context = {controller: 0, source: idOf(s, V), targets: [{kind: "player", id: 1}]};
  eq([amountOf(s, {countersOn: {target: 0}, counter: "poison", times: -1, plus: 9}, context), amountOf(s, {countersOn: {target: 0}, counter: "energy"}, context),
    amountOf(s, {countersOn: {target: 0}, counter: "any"}, context), amountOf(s, {countersOn: {target: 0}, counter: "loyalty"}, {...context, targets: [{kind: "object", id: idOf(s, V)}]})],
    [5, 2, 6, 6], "a target player's counters: nine less her four poison, her two energy, all six; a target permanent's are its own, Vraska's six loyalty");
  for (const had of [0, 5, 9]) {
    const t = play([at(0, "battlefield", V)], [], {}, FIX);
    t.objects[idOf(t, V)].counters.loyalty = 9;
    t.players[1].poison = had;
    const minus = legalActions(t, 0).find((a) => a.kind === "activate" && a.abilityId === "a3" && a.targets?.[0]?.kind === "player" && a.targets[0].id === 1);
    applyAction(t, 0, minus);
    drive(t, (st) => st.stack.length === 0 && st.priorityPlayer !== null);
    eq([t.players[1].poison, t.zones.graveyard[0].map((g) => t.objects[g].card)], [9, [V]], `-9 at Maya with ${had} poison counters: nine, and Vraska gone with no loyalty left`);
  }
}
ok(keywordBuilt("Compleated"), "Compleated is built (engine-constructs: a keyword with behavior)");

done("compleated: two fewer loyalty counters for each Phyrexian symbol its caster paid with life, never fewer than none; Vraska's Treasure for good and her difference to nine.");
