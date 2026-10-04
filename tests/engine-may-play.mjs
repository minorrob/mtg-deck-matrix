/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "YOU MAY PLAY THAT CARD" (Rob's Priority Batch 10.3, its twenty-third slice: Blazing Crescendo, the first card of Rob's
 * list).
 *
 * "Exile the top card of your library. Until the end of your next turn, you may play that card": the exile is moveZone's,
 * remembering what it moved, and the rest is a permission (script/effects/zones.mjs, `mayPlay`) -- not a cast now, which
 * is `play`. While it lasts, its controller may play the named cards from where they are, each the way a card in a hand
 * is played: a land as the land for the turn (CR 305.2), a spell at its type's speed with its costs paid (CR 601.2a).
 * rules/actions.mjs offers them; rules/turn.mjs ends the permission at the cleanup step -- "this turn", or "until the end
 * of your next turn": the first turn of that player begun after it was made. It names objects: a card that moves is a new
 * object (CR 400.7), which the permission does not name.
 *
 * The card scenarios play the cards (Blazing Crescendo, Gundabad Opportunist, Kulrath Zealot, Atsushi, Containment
 * Construct, Wrenn's Resolve, Inspired Tinkering, Escape to the Wilds). This suite holds the edges: when it ends, made on
 * the player's own turn or another's; whose it is; "cast" alone; the land drop and the speed of a type; a card that moved
 * away and back; the compiler; and the catalog, which does not yet credit MayPlay.
 */
import assert from "node:assert/strict";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {runEffect, isBuilt} from "../game/engine/script/effects/index.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const later = (seat, zone, ...cards) => ({seat, zone, cards, sick: true});
const glimpse = (until, more = {}) => ({types: ["Instant"], manaCost: "{U}", colors: ["U"], spell: {id: "s0", text: "Exile the top card of your library. You may play that card.", targets: [],
  effects: [{effect: "moveZone", fromTop: 1, to: "exile", remember: true}, {effect: "mayPlay", targets: "remembered", until, ...more}]}});
const FIX = {
  Glimpse: glimpse("your-next-end"),
  "Brief Glimpse": glimpse("end-of-turn"),
  "Spell Glimpse": glimpse("your-next-end", {spellsOnly: true}),
  Ogre: {types: ["Creature"], subtypes: ["Ogre"], manaCost: "{2}{R}", colors: ["R"], power: 3, toughness: 3},
  Spark: {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s0", text: "Spark deals 1 damage to target player.", targets: [{what: "player"}],
    effects: [{effect: "dealDamage", amount: 1, who: {target: 0}}]}},
};
const play = (name, setup, steps, more = {}) => runScenario({name, setup, steps, ...more}, index.definition, FIX).state;
const permissions = (s) => (s.effects ?? []).filter((e) => e.rule === "may-play");
const named = (s, card, zone) => Object.values(s.objects).filter((o) => o.card === card && o.zone === zone);
const offers = (s, seat, kind, card) => legalActions(s, seat).filter((a) => a.kind === kind && a.label === card);
const GLIMPSE = [{tap: "Island"}, {cast: "Glimpse"}, {resolve: true}];

/* ---- how long it lasts ---- */
{
  const setup = [later(0, "battlefield", "Island", "Mountain"), at(0, "hand", "Glimpse")];
  const library = ["Spark", "Forest", "Plains", "Swamp"];
  const now = play("made on Rob's turn", setup, GLIMPSE, {library});
  eq(permissions(now).map((p) => [p.player, p.until, p.madeOnTurn, p.affects.ids.map((id) => now.objects[id].card)]), [[0, "your-next-end", 1, ["Spark"]]],
    "Glimpse resolved on Rob's turn 1: a permission for Rob to play the Spark, until the end of Rob's next turn");
  eq(permissions(play("Maya's turn", setup, [...GLIMPSE, {to: {turn: 2, phase: "MAIN1"}}], {library})).length, 1, "it outlasts the end of turn 1, the turn it was made");
  eq(permissions(play("Rob's next turn", setup, [...GLIMPSE, {to: {turn: 3, phase: "MAIN2"}}], {library})).length, 1, "and lasts through Rob's next turn");
  eq(permissions(play("after it", setup, [...GLIMPSE, {to: {turn: 4, phase: "MAIN1"}}], {library})).length, 0, "and is over once that turn has ended");
}
{
  /* Made on Maya's turn: Rob's next turn is the very next one. */
  const setup = [later(0, "battlefield", "Island", "Mountain"), at(0, "hand", "Glimpse")];
  const library = ["Spark", "Forest", "Plains", "Swamp"];
  const steps = [{to: {turn: 2, phase: "MAIN1"}}, {pass: 1}, ...GLIMPSE];
  const made = play("made on Maya's turn", setup, steps, {library});
  eq(permissions(made).map((p) => p.madeOnTurn), [2], "Glimpse resolved on Maya's turn 2, at Rob's instant speed");
  eq(permissions(play("Rob's turn 3", setup, [...steps, {to: {turn: 3, phase: "MAIN2"}}], {library})).length, 1, "it lasts through Rob's turn 3");
  eq(permissions(play("Maya's turn 4", setup, [...steps, {to: {turn: 4, phase: "MAIN1"}}], {library})).length, 0, "and is over after it -- not after Maya's turn 4 or Rob's turn 5");
}
{
  const setup = [later(0, "battlefield", "Island", "Mountain"), at(0, "hand", "Brief Glimpse")];
  const library = ["Spark", "Forest"];
  const steps = [{tap: "Island"}, {cast: "Brief Glimpse"}, {resolve: true}];
  eq(permissions(play("this turn", setup, steps, {library})).map((p) => p.until), ["end-of-turn"], "\"you may play that card this turn\": until the end of this turn");
  eq(permissions(play("this turn, over", setup, [...steps, {to: {turn: 2, phase: "MAIN1"}}], {library})).length, 0, "and over when it ends");
}

/* ---- what it permits, and whom ---- */
{
  const s = play("both kinds", [later(0, "battlefield", "Island", "Mountain", "Mountain", "Mountain"), at(0, "hand", "Glimpse", "Glimpse")],
    [...GLIMPSE, {tap: "Mountain"}, {tap: "Mountain"}, {tap: "Mountain"}], {library: ["Ogre", "Forest"]});
  eq(offers(s, 0, "cast", "Ogre").map((a) => a.from), ["exile"], "the Ogre exiled: cast from exile, its cost paid from the pool");
  eq(offers(s, 0, "play-land", "Ogre").length, 0, "and never played as a land");
}
{
  /* Whose it is: Maya, holding priority with {R} in the pool, is offered Maya's own Spark from Maya's hand -- not Rob's from exile. */
  const s = play("whose", [later(0, "battlefield", "Island"), at(0, "hand", "Glimpse"), later(1, "battlefield", "Mountain"), at(1, "hand", "Spark")],
    [...GLIMPSE, {pass: 1}, {tap: "Mountain", seat: 1}], {library: ["Spark", "Forest"]});
  const theirs = legalActions(s, 1).filter((a) => a.kind === "cast" && a.label === "Spark");
  eq([s.priorityPlayer, named(s, "Spark", "exile").length, [...new Set(theirs.map((a) => s.objects[a.objectId].zone))]], [1, 1, ["hand"]],
    "the permission is Rob's: Maya, with priority, is offered only the Spark in Maya's hand");
}
{
  const s = play("a land", [later(0, "battlefield", "Island"), at(0, "hand", "Glimpse", "Plains")], GLIMPSE, {library: ["Forest", "Swamp"]});
  eq(offers(s, 0, "play-land", "Forest").map((a) => a.from), ["exile"], "a land exiled: played from exile");
  const t = play("the land drop", [later(0, "battlefield", "Island"), at(0, "hand", "Glimpse", "Plains")], [...GLIMPSE, {play: "Plains"}], {library: ["Forest", "Swamp"]});
  eq(offers(t, 0, "play-land", "Forest").length, 0, "as the land for the turn: with the Plains played from the hand, not offered (CR 305.2)");
  const u = play("cast alone", [later(0, "battlefield", "Island"), at(0, "hand", "Spell Glimpse")], [{tap: "Island"}, {cast: "Spell Glimpse"}, {resolve: true}], {library: ["Forest", "Swamp"]});
  eq([offers(u, 0, "play-land", "Forest").length, permissions(u)[0].spellsOnly], [0, true], "\"you may cast that card\" (`spellsOnly`): a land is not played");
}
{
  /* At the speed of its type (CR 117.1a): a creature from exile only in Rob's main phase with the stack empty. */
  const s = play("speed", [later(0, "battlefield", "Island", "Mountain", "Mountain", "Mountain"), at(0, "hand", "Glimpse")],
    [{to: {turn: 2, phase: "MAIN1"}}, {pass: 1}, ...GLIMPSE, {pass: 1}, {tap: "Mountain"}, {tap: "Mountain"}, {tap: "Mountain"}], {library: ["Ogre", "Forest"]});
  eq([s.activePlayer, s.priorityPlayer, offers(s, 0, "cast", "Ogre").length], [1, 0, 0], "on Maya's turn, Rob holding priority with {R}{R}{R}: the Ogre is not offered");
}
{
  /* A new object (CR 400.7): the card put into a graveyard and back into exile is not what the permission names. */
  const s = play("moved", [later(0, "battlefield", "Island", "Mountain"), at(0, "hand", "Glimpse")], [...GLIMPSE, {tap: "Mountain"}], {library: ["Spark", "Forest"]});
  const [spark] = named(s, "Spark", "exile");
  eq(offers(s, 0, "cast", "Spark").length, 2, "the Spark in exile: offered, at either player");
  const inGraveyard = moveOne(s, spark.id, "graveyard", []);
  moveOne(s, inGraveyard, "exile", []);
  eq([named(s, "Spark", "exile").length, offers(s, 0, "cast", "Spark").length], [1, 0], "put into the graveyard and exiled again, it is a new object: not offered");
}

/* ---- the compiler, and the catalog ---- */
{
  const script = (until) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Sorcery"], manaCost: "{R}", colors: ["R"]},
    oracleText: "Exile the top card of your library. You may play it.", source: "hand",
    abilities: [{kind: "spell", text: "Exile the top card of your library. You may play it.", targets: [],
      effects: [{effect: "moveZone", fromTop: 1, to: "exile", remember: true}, {effect: "mayPlay", targets: "remembered", ...(until ? {until} : {})}]}]});
  for (const until of [undefined, "end-of-turn", "your-next-end"]) eq(compileScript(script(until)).problems, [], `a permission until ${until ?? "(unsaid: this turn)"} compiles`);
  ok(compileScript(script("forever")).problems.some((p) => p.startsWith("mayPlay")), "and one until a time it does not know is refused");
}
{
  const s = play("nothing named", [], []);
  eq([runEffect(s, {effect: "mayPlay", targets: []}, {controller: 0, source: null}), permissions(s)], [[], []], "naming nothing, it makes no permission");
  runEffect(s, {effect: "mayPlay", targets: [987654]}, {controller: 0, source: null});
  eq(permissions(s), [], "nor naming only what no longer exists");
}
ok(isBuilt("mayPlay"), "mayPlay is an effect the engine performs");
ok(missingFor({options: ["MayPlay"]}).some((m) => m.name === "MayPlay"), "the catalog does not yet credit MayPlay: its other forms (\"for as long as it remains exiled\", from a graveyard, without paying) are not built");
for (const name of ["Blazing Crescendo", "Gundabad Opportunist", "Kulrath Zealot", "Atsushi, the Blazing Sky", "Containment Construct", "Wrenn's Resolve", "Inspired Tinkering", "Escape to the Wilds"])
  ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-may-play: ${checks} checks passed -- "you may play that card" a permission for its controller until this turn's end or their next turn's; a land as the land for the turn, a spell at its type's speed; a new object not named.`);
