/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, P4-REPLACEMENTS: "IF AN OPPONENT WOULD DRAW TWO OR MORE CARDS, INSTEAD YOU AND THAT PLAYER EACH DRAW A CARD"
 * (Alms Collector; CR 614.1a, 616.1).
 *
 * The static `draws-instead` (rules/statics.mjs, drawsInstead), read by the draw effect (script/effects/zones.mjs): for each
 * player drawing two or more, the controllers of the statics whose `affects` names them; one card is no draw it replaces, so
 * the draws made instead are not replaced again. Two of one controller's end the same; two players' do not, and the drawing
 * player chooses whose applies, asked before any card is drawn (effects/asking.mjs, orderDraws). Here: each player drawing,
 * the question and its answers, a departure while it is asked, where nobody can be asked, an empty library, the pilot.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {concede, checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {drawsInstead} from "../game/engine/rules/statics.mjs";
import {cardsIn} from "../game/engine/state/index.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const AC = "Alms Collector";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
/* At the first upkeep, before any draw step (in three or more the first player draws in theirs, CR 103.8a): a hand counts what was drawn here. */
const table = (setup, seats = 2) => runScenario({name: "draws-replaced", seats, at: {turn: 1, phase: "UPKEEP"}, setup, steps: []}, index.definition, {}).state;
const hands = (s) => s.players.map((p) => cardsIn(s, "hand", p.id).length);
const drawing = (s, who, count, controller = who) => runEffects(s, [{effect: "draw", who, count}], {controller, source: null});

{
  const s = table([at(0, "battlefield", AC, AC)], 3);
  eq([drawsInstead(s, 1, 2), drawsInstead(s, 1, 1), drawsInstead(s, 0, 3)], [[0], [], []], "two of Rob's: one replacement, Rob's; one card is none; Rob is no opponent of his own");
  const t = table([at(0, "battlefield", AC), at(2, "battlefield", AC)], 3);
  eq([drawsInstead(t, 1, 2), drawsInstead(t, 0, 2)], [[2, 0], [2]], "Rob's and Trey's for Maya, in turn order after her; Trey's alone for Rob");
}
{
  const s = table([at(0, "battlefield", AC)]);
  const events = drawing(s, [1], 3);
  eq(hands(s), [1, 1], "Maya would draw three: Rob and Maya each draw one");
  eq(events.filter((e) => e.data.fields.drawn === true).map((e) => e.data.fields.to.player.playerId), [0, 1], "each a draw, in turn order from the active player");
  drawing(s, [0, 1], 2, 0);
  eq(hands(s), [4, 2], "\"each player draws two cards\": Rob his two, and Maya's two replaced -- one each");
}
{
  /* Maya's library empty: she would draw two, and instead draws one from nothing. */
  const s = table([at(0, "battlefield", AC)]);
  s.zones.library[1].length = 0;
  drawing(s, [1], 2);
  checkStateBasedActions(s);
  eq([hands(s)[0], s.players[1].lost === true], [1, true], "Rob draws his card; Maya drew from an empty library and loses (CR 704.5b)");
}

/* ---- two players' Collectors: the drawing player is asked ---- */
const resolve = (s, effects, controller) => beginResolution(s, effects, {controller, source: null});
{
  const s = table([at(0, "battlefield", AC), at(2, "battlefield", AC)], 3);
  resolve(s, [{effect: "draw", who: [1], count: 2}], 1);
  const q = awaitingChoice(s);
  eq([s.awaiting.player, q.title, q.options.map((o) => o.label)], [1, "Maya would draw 2 cards: whose replacement applies?",
    ["Trey's Alms Collector: Trey and Maya each draw a card", "Rob's Alms Collector: Rob and Maya each draw a card"]], "Maya is asked whose, before anything is drawn");
  eq(hands(s), [0, 0, 0], "nothing drawn yet");
  assert.throws(() => resolveAwaiting(s, [2]), /Invalid selection/); checks += 1;
  resolveAwaiting(s, [1]);
  eq([hands(s), s.awaiting, s.resolving], [[1, 1, 0], null, null], "Rob's: Rob and Maya draw, Trey nothing");
  const answer = housePilot({seat: 1, cards: index.definition});
  const t = table([at(0, "battlefield", AC), at(2, "battlefield", AC)], 3);
  resolve(t, [{effect: "draw", who: [1], count: 2}], 1);
  ok(awaitingChoice(t).options[answer.answer(projectFor(t, 1), awaitingChoice(t)).indices[0]] !== undefined, "the house pilot answers it");
}
{
  /* Trey concedes while Maya is asked: his Collector is gone, said so; answered, only Rob's applies. */
  const s = table([at(0, "battlefield", AC), at(2, "battlefield", AC)], 3);
  resolve(s, [{effect: "draw", who: [1], count: 2}], 1);
  concede(s, 2);
  eq(awaitingChoice(s).options.map((o) => o.label), ["An effect no longer there", "Rob's Alms Collector: Rob and Maya each draw a card"], "Trey's, gone with him");
  resolveAwaiting(s, [0]);
  eq([hands(s)[0], hands(s)[1], s.awaiting], [1, 1, null], "Rob's applies: Rob and Maya each draw one");
}
{
  /* Maya, asked, concedes: there is no draw of hers to replace, and the resolution goes on. */
  const s = table([at(0, "battlefield", AC), at(2, "battlefield", AC)], 3);
  resolve(s, [{effect: "draw", who: [1], count: 2}, {effect: "gainLife", amount: 2}], 0);
  concede(s, 1);
  eq([hands(s)[0], hands(s)[2], s.players[0].life, s.awaiting], [0, 0, 42, null], "nobody draws, and Rob's gain after it happens");
}
{
  /* "Each player draws two cards", Maya asked and gone: the others' draws go on, each replaced by the other's Collector. */
  const s = table([at(0, "battlefield", AC), at(2, "battlefield", AC)], 3);
  resolve(s, [{effect: "draw", who: "each", count: 2}], 0);
  eq(s.awaiting?.player, 1, "Maya, with both players' Collectors over her draw, is asked");
  concede(s, 1);
  eq([hands(s)[0], hands(s)[2], s.awaiting], [2, 2, null], "Rob's two replaced by Trey's, Trey's by Rob's: one and one each, twice");
}
{
  /* Two cards milled or discarded are no draw: nothing asked. */
  const s = table([at(0, "battlefield", AC), at(2, "battlefield", AC)], 3);
  const out = resolve(s, [{effect: "mill", who: [1], count: 2}], 1);
  eq([out.status, s.awaiting], ["done", null], "a mill of two: no question");
}
{
  /* Where nobody can be asked (the effect run directly): the first in turn order after the drawing player. */
  const s = table([at(0, "battlefield", AC), at(2, "battlefield", AC)], 3);
  drawing(s, [1], 2);
  eq(hands(s), [0, 1, 1], "Trey, after Maya in turn order: Trey and Maya draw");
  const t = table([at(0, "battlefield", AC), at(2, "battlefield", AC)], 3);
  runEffects(t, [{effect: "draw", who: [1], count: 2, drawOrders: {1: 0}}], {controller: 1, source: null});
  eq(hands(t), [1, 1, 0], "and with an answer, that one");
}

console.log(`engine-draws-replaced: ${checks} checks passed -- an opponent's two or more draws replaced, one each; whose of two players' asked of the drawing player before anything is drawn; departures; nobody to ask; an empty library; the pilot.`);
