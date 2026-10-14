/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN E, WAVE 2 (f2): A DIFFERENT OPPONENT FOR EACH, A GOAD FOR THE REST OF THE GAME, AND THE GREATEST AMONG WHAT A PLAYER
 * CHOOSES -- what Dack Fayden, Helping Hand and End of the Hunt needed.
 *
 * effects/asking.mjs, controlToOpponents: gainControl's `toEach: "different opponent"` (script/resolution.mjs puts it there)
 * -- "for each of those permanents, choose a different opponent. Each opponent gains control of the permanent for which they
 * were chosen". The effect's controller chooses, permanent by permanent, among the opponents still in the game not chosen
 * yet; with one left nobody is asked, with none the rest stay; then each gains control of theirs, for good. Run directly, it
 * refuses. effects/permanents.mjs, goad's `until: "game"` (CR 701.15a): no turn ends it. effects/asking.mjs, chooseCard's
 * `greatest`: of the permanents that fit, those with the most power or mana value, a tie the chooser's (CR 608.2d). And
 * script/schema.mjs holds each to where it may be said. Dack's and End of the Hunt's scenarios play them at the table.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {ASKING} from "../game/engine/script/effects/asking.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {goadersOf} from "../game/engine/rules/statics.mjs";
import {controllerOf} from "../game/engine/rules/layers.mjs";
import {validateScript, SCRIPT_SCHEMA} from "../game/engine/script/schema.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const creature = (cost, power, toughness = power) => ({types: ["Creature"], manaCost: cost, colors: ["G"], power, toughness});
const FIX = {Bear: creature("{1}{G}", 2), Ogre: creature("{2}{R}", 3), Elf: creature("{G}", 1), Giant: creature("{3}{G}", 7),
  Brute: creature("{G}", 5, 1), Walker: {types: ["Planeswalker"], subtypes: ["Ajani"], manaCost: "{2}{W}", colors: ["W"], loyalty: 3}};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, seats = 2) => runScenario({name: "different opponents", seats, setup, steps: []}, index.definition, FIX).state;
const ids = (s, card, seat = 0) => s.zones.battlefield.filter((id) => s.objects[id].card === card && s.objects[id].controller === seat);
const whose = (s, list) => list.map((id) => controllerOf(s, id));
const giveAway = (s, targets, controller = 0) => beginResolution(s, [{effect: "gainControl", targets, toEach: "different opponent"}], {controller, source: null});
const turnOf = (s, player) => {
  for (let n = 0; n < 300 && !(s.activePlayer === player && s.priorityPlayer !== null && s.phase === "MAIN1"); n += 1) {
    if (s.awaiting) resolveAwaiting(s, []); else if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
};

/* ---- a different opponent for each ---- */
{
  /* Four players, three of Rob's permanents: he chooses for the first among three, for the second among the two left, and the
     third goes to the one nobody has been chosen for. */
  const s = table([at(0, "battlefield", "Bear", "Ogre", "Elf")], 4);
  const given = [ids(s, "Bear")[0], ids(s, "Ogre")[0], ids(s, "Elf")[0]];
  eq(giveAway(s, given).status, "waiting", "three permanents, three opponents: the resolution stops to ask");
  let q = awaitingChoice(s);
  eq([s.awaiting.player, q.title, q.options.map((o) => o.label), q.min, q.max], [0, "Choose an opponent to gain control of Bear", ["Maya", "Trey", "Sam"], 1, 1],
    "Rob is asked whose the Bear becomes, among Maya, Trey and Sam");
  resolveAwaiting(s, [q.options.find((o) => o.label === "Trey").index]);
  q = awaitingChoice(s);
  eq([q.title, q.options.map((o) => o.label)], ["Choose an opponent to gain control of Ogre", ["Maya", "Sam"]], "then the Ogre, among the two not chosen");
  eq(whose(s, given), [0, 0, 0], "nobody has gained anything while Rob still chooses");
  resolveAwaiting(s, [q.options.find((o) => o.label === "Sam").index]);
  eq([s.awaiting, whose(s, given)], [null, [2, 3, 1]], "the Elf goes to Maya, the one left, without asking; Trey has the Bear, Sam the Ogre");
  const records = (s.effects ?? []).filter((e) => e.rule === "control-returns" && given.includes(e.affects.ids[0]));
  eq([records.length, records.every((e) => e.until === undefined)], [3, true], "each for good (CR 613.1b): no duration");
  turnOf(s, 1);
  turnOf(s, 0);
  eq(whose(s, given), [2, 3, 1], "and still theirs a round of turns later");
}
{
  /* Two players: one opponent, no question. */
  const s = table([at(0, "battlefield", "Bear")]);
  const bear = ids(s, "Bear")[0];
  eq([giveAway(s, [bear]).status, s.awaiting, controllerOf(s, bear)], ["done", null, 1], "one opponent: the Bear is Maya's, and nobody is asked");
}
{
  /* Three players, one of whom has left the game (CR 800.4a): Maya alone is an opponent -- the first goes to her without a
     question, and with no opponent left to choose, the second stays Rob's. */
  const s = table([at(0, "battlefield", "Bear", "Ogre")], 3);
  s.players[2].lost = true;
  const given = [ids(s, "Bear")[0], ids(s, "Ogre")[0]];
  eq([giveAway(s, given).status, whose(s, given)], ["done", [1, 0]], "Trey gone: the Bear is Maya's, and the Ogre, with nobody different left, stays Rob's");
  eq((s.effects ?? []).filter((e) => e.rule === "control-returns" && e.affects.ids[0] === given[1]).length, 0, "no control change made of the Ogre at all");
}
{
  /* What is no longer on the battlefield is none of them (CR 400.7); and one named twice is one permanent. */
  const s = table([at(0, "battlefield", "Bear", "Ogre"), at(0, "graveyard", "Elf")], 3);
  const bear = ids(s, "Bear")[0], ogre = ids(s, "Ogre")[0], elf = s.zones.graveyard[0][0];
  eq(giveAway(s, [elf, bear, bear, ogre]).status, "waiting", "the Bear and the Ogre: Rob is asked");
  const q = awaitingChoice(s);
  eq(q.title, "Choose an opponent to gain control of Bear", "about the Bear first -- the Elf in his graveyard is not among them");
  resolveAwaiting(s, [q.options.find((o) => o.label === "Maya").index]);
  eq([s.awaiting, controllerOf(s, bear), controllerOf(s, ogre), s.objects[elf].zone], [null, 1, 2, "graveyard"],
    "the Bear Maya's, the Ogre Trey's -- named twice, the Bear was asked about once -- and the Elf where it was");
}
{
  /* An answer that is no option is refused, and the question stays. */
  const s = table([at(0, "battlefield", "Bear")], 3);
  giveAway(s, [ids(s, "Bear")[0]]);
  assert.throws(() => resolveAwaiting(s, [5]), /Invalid selection/);
  assert.throws(() => resolveAwaiting(s, []), /Invalid selection/);
  for (const answer of [[5], [], [0, 1], undefined]) assert.throws(() => ASKING.controlToOpponents.apply(s, s.awaiting, answer), /Invalid selection/);
  ok(s.awaiting?.effect === "controlToOpponents", "an answer naming no opponent, or two, is refused; Rob is still asked");
  eq(ASKING.controlToOpponents.left(s, s.awaiting), {events: []}, "asked of a controller who has left the game: their ability left with them, nobody gains anything");
}
{
  /* Nothing on the battlefield, or no opponent at all: nothing to ask, nothing changes. */
  const s = table([at(0, "battlefield", "Bear")], 3);
  const bear = ids(s, "Bear")[0];
  eq([giveAway(s, []).status, s.awaiting], ["done", null], "no permanents: done, nobody asked");
  s.players[1].lost = true;
  s.players[2].lost = true;
  eq([giveAway(s, [bear]).status, controllerOf(s, bear)], ["done", 0], "every opponent gone: the Bear stays Rob's");
}
{
  /* Run directly, outside a resolution that can ask, it refuses rather than giving anything to its own controller. */
  const s = table([at(0, "battlefield", "Bear")], 3);
  const bear = ids(s, "Bear")[0];
  assert.throws(() => runEffects(s, [{effect: "gainControl", targets: [bear], toEach: "different opponent"}], {controller: 0, source: null}), /toEach asks its controller/);
  eq(controllerOf(s, bear), 0, "run directly, toEach refuses, and the Bear stays Rob's");
}

/* ---- goaded for the rest of the game ---- */
{
  const s = table([at(1, "battlefield", "Bear", "Ogre")]);
  const bear = ids(s, "Bear", 1)[0], ogre = ids(s, "Ogre", 1)[0];
  runEffects(s, [{effect: "goad", targets: [bear], until: "game"}, {effect: "goad", targets: [ogre]}], {controller: 0, source: null});
  eq([goadersOf(s, bear), goadersOf(s, ogre)], [[0], [0]], "Rob goads Maya's Bear for the rest of the game, and her Ogre until his next turn");
  eq((s.effects ?? []).filter((e) => e.rule === "goaded").map((e) => e.until).sort(), ["game", "your-next-turn"], "the one lasts the game, the other until Rob's next turn");
  turnOf(s, 1);
  turnOf(s, 0);
  eq([goadersOf(s, bear), goadersOf(s, ogre)], [[0], []], "Rob's next turn: the Ogre's goad is over, the Bear's is not (CR 701.15a)");
  turnOf(s, 1);
  turnOf(s, 0);
  eq(goadersOf(s, bear), [0], "nor the turn after");
}

/* ---- the greatest, among what a player chooses ---- */
{
  /* By power: Maya chooses among her creatures with the greatest power -- the 5/1 Brute and nothing else -- whatever their
     mana values. */
  const s = table([at(1, "battlefield", "Brute", "Ogre", "Bear")]);
  const choose = {effect: "chooseCard", zone: "battlefield", who: [1], count: 1, greatest: "power", to: "graveyard", selector: {types: ["Creature"], controller: "you"}};
  eq(beginResolution(s, [choose], {controller: 0, source: null}).status, "waiting", "Maya is asked");
  eq([s.awaiting.player, awaitingChoice(s).options.map((o) => o.label)], [1, ["Brute"]], "the greatest power among hers: the Brute alone");
}
{
  /* By mana value, a tie: both are offered -- hers to break. */
  const s = table([at(1, "battlefield", "Ogre", "Walker", "Bear"), at(0, "battlefield", "Giant")]);
  const choose = {effect: "chooseCard", zone: "battlefield", who: [1], count: 1, greatest: "manaValue", to: "exile",
    selector: {anyOf: [{types: ["Creature"], controller: "you"}, {types: ["Planeswalker"], controller: "you"}]}};
  beginResolution(s, [choose], {controller: 0, source: null});
  eq(awaitingChoice(s).options.map((o) => o.label).sort(), ["Ogre", "Walker"], "the Ogre and Ajani, mana value 3 each; never her Bear, nor Rob's bigger Giant");
}
{
  /* Without `greatest`, the same choice offers everything that fits. */
  const s = table([at(1, "battlefield", "Ogre", "Bear")]);
  beginResolution(s, [{effect: "chooseCard", zone: "battlefield", who: [1], count: 1, to: "exile", selector: {types: ["Creature"], controller: "you"}}], {controller: 0, source: null});
  eq(awaitingChoice(s).options.map((o) => o.label).sort(), ["Bear", "Ogre"], "no `greatest`: the Bear and the Ogre");
}

/* ---- where each may be said ---- */
{
  const card = (effects) => ({schema: SCRIPT_SCHEMA, identity: {name: "Test Card", oracleId: "t1", types: ["Sorcery"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], power: null, toughness: null},
    oracleText: "Test.", abilities: [{kind: "spell", text: "Test.", targets: [], effects}]});
  const valid = (effects) => validateScript(card(effects)).valid;
  const refused = (effects, pattern) => validateScript(card(effects)).errors.some((e) => pattern.test(e.message));
  const CHOOSE = {effect: "chooseCard", zone: "battlefield", selector: {types: ["Creature"]}, to: "exile"};
  ok(valid([{...CHOOSE, greatest: "manaValue"}]) && valid([{...CHOOSE, greatest: "power"}]), "greatest power or mana value: a chooseCard's on the battlefield");
  ok(valid([{effect: "sacrifice", who: "opponent", count: 1, selector: {types: ["Creature"]}, greatest: "power"}]), "and a sacrifice's");
  ok(refused([{...CHOOSE, greatest: "toughness"}], /greatest/), "greatest toughness: refused");
  ok(refused([{...CHOOSE, zone: "graveyard", greatest: "manaValue"}], /greatest/), "a chooseCard's in a graveyard: refused");
  ok(refused([{effect: "destroy", targets: "self", greatest: "power"}], /greatest/) && refused([{effect: "destroyAll", zone: "battlefield", selector: {types: ["Creature"]}, greatest: "power"}], /greatest/),
    "on any other effect: refused");
  const GIVE = {effect: "gainControl", targets: "remembered", toEach: "different opponent"};
  ok(valid([GIVE]), "toEach: a gainControl's, of its targets");
  ok(refused([{...GIVE, toEach: "opponent"}], /toEach/), "toEach is \"different opponent\"");
  ok(refused([{...GIVE, toPlayer: {target: 0}}], /toEach/) && refused([{...GIVE, until: "end-of-turn"}], /toEach/), "never with a toPlayer, nor for a while");
  ok(refused([{effect: "gainControl", selector: {types: ["Creature"]}, toEach: "different opponent"}], /toEach/)
    && refused([{...GIVE, selector: {types: ["Creature"]}}], /toEach/) && refused([{effect: "gainControl", toEach: "different opponent"}], /toEach/),
    "of its targets: never a selector's, and never of nothing");
  ok(refused([{effect: "goad", targets: "remembered", toEach: "different opponent"}], /toEach/), "on any other effect: refused");
  ok(valid([{effect: "goad", targets: "remembered", until: "game"}]) && valid([{effect: "goad", targets: "remembered"}]), "a goad for the game, or until its controller's next turn");
  ok(refused([{effect: "goad", targets: "remembered", until: "end-of-turn"}], /goad/), "a goad for any other while: refused");
}

console.log(`engine-different-opponents: ${checks} checks passed -- a different opponent for each permanent given away (asked, forced with one left, the rest kept with none, the gone and the repeated left out, refused run directly), a goad for the rest of the game (CR 701.15a), the greatest power or mana value among what a player chooses (CR 608.2d), and where the schema lets each be said.`);
