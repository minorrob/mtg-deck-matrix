/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "UNTIL YOUR NEXT END STEP, YOU MAY PLAY THOSE CARDS" (Shadow Urchin; Train C phase 2, w3-last; CR 513.1, 611.2a).
 *
 * mayPlay's `until: "your-next-end-step"` (script/effects/zones.mjs): a permission over as its controller's next end step
 * begins (rules/turn.mjs, arrive) -- before anything triggers at that beginning or anyone has priority in it. Made before
 * this turn's end step began, it is over at this one's; made during their own end step, it lasts to their next turn's; made
 * on another player's turn, that player's end step does not end it. "Until the end of your next turn" (`your-next-end`)
 * is another duration, and lasts through the end step. The card scenarios play Shadow Urchin; this suite holds the edges:
 * when it ends, made on whose turn, at a table of four, the other duration beside it, and the compiler.
 */
import assert from "node:assert/strict";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const glimpse = (until) => ({types: ["Instant"], manaCost: "{U}", colors: ["U"], spell: {id: "s0", text: "Exile the top card of your library. You may play it.", targets: [],
  effects: [{effect: "moveZone", fromTop: 1, to: "exile", remember: true}, {effect: "mayPlay", targets: "remembered", until}]}});
const FIX = {
  Glimpse: glimpse("your-next-end-step"),
  "Long Glimpse": glimpse("your-next-end"),
  Spark: {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s0", text: "Spark deals 1 damage to target player.", targets: [{what: "player"}],
    effects: [{effect: "dealDamage", amount: 1, who: {target: 0}}]}},
};
const play = (name, setup, steps, more = {}) => runScenario({name, setup, steps, library: ["Spark", "Forest", "Plains", "Swamp"], ...more}, index.definition, FIX).state;
const permissions = (s) => (s.effects ?? []).filter((e) => e.rule === "may-play");
const sparkOffers = (s, seat) => legalActions(s, seat).filter((a) => a.kind === "cast" && a.label === "Spark" && s.objects[a.objectId]?.zone === "exile");
const GLIMPSE = [{tap: "Island"}, {cast: "Glimpse"}, {resolve: true}];
const to = (turn, phase) => ({to: {turn, phase}});
const SETUP = [at(0, "battlefield", "Island", "Mountain"), at(0, "hand", "Glimpse", "Long Glimpse")];

/* ---- made before this turn's end step: over as it begins ---- */
{
  const made = play("made in Rob's first main phase", SETUP, GLIMPSE);
  eq(permissions(made).map((p) => [p.player, p.until, p.sourceController]), [[0, "your-next-end-step", 0]], "Glimpse on Rob's turn 1: a permission for Rob, until his next end step");
  const main2 = play("his second main phase", SETUP, [...GLIMPSE, to(1, "MAIN2"), {tap: "Mountain"}]);
  eq([permissions(main2).length, sparkOffers(main2, 0).length], [1, 2], "it lasts through his second main phase: the Spark is offered, at either player");
  const end = play("his end step", SETUP, [...GLIMPSE, to(1, "END_OF_TURN"), {tap: "Mountain"}]);
  eq([end.phase, end.priorityPlayer, permissions(end).length, sparkOffers(end, 0).length], ["END_OF_TURN", 0, 0, 0],
    "as this turn's end step begins it is over: with priority there and {R} in his pool, Rob is offered no Spark");
  eq(Object.values(end.objects).filter((o) => o.card === "Spark" && o.zone === "exile").length, 1, "and the Spark stays in exile");
}
/* ---- made during his own end step: lasts to the next one ---- */
{
  const steps = [to(1, "END_OF_TURN"), ...GLIMPSE];
  eq(permissions(play("made in Rob's end step", SETUP, steps)).length, 1, "Glimpse cast in Rob's end step: his next end step has not begun");
  eq(permissions(play("Maya's turn", SETUP, [...steps, to(2, "END_OF_TURN")])).length, 1, "it outlasts the cleanup of turn 1 and Maya's end step");
  const main2 = play("Rob's next turn", SETUP, [...steps, to(3, "MAIN2"), {tap: "Mountain"}]);
  eq(sparkOffers(main2, 0).length, 2, "Rob may still cast the Spark in his next turn's second main phase");
  eq(permissions(play("Rob's next end step", SETUP, [...steps, to(3, "END_OF_TURN")])).length, 0, "and it is over as that turn's end step begins");
}
/* ---- made on Maya's turn: her end step is not Rob's ---- */
{
  const steps = [to(2, "MAIN1"), {pass: 1}, ...GLIMPSE];
  const made = play("made on Maya's turn", SETUP, steps);
  eq([made.activePlayer, permissions(made).length], [1, 1], "Glimpse cast at instant speed on Maya's turn 2");
  eq(permissions(play("Maya's end step", SETUP, [...steps, to(2, "END_OF_TURN")])).length, 1, "Maya's end step begins: Rob's permission goes on");
  eq(permissions(play("Rob's end step", SETUP, [...steps, to(3, "END_OF_TURN")])).length, 0, "over as Rob's next end step begins, turn 3");
}
/* ---- four players: only its controller's end step ends it ---- */
{
  /* On Maya's turn priority passes from her to the two players after her before it reaches Rob. */
  const steps = [to(2, "MAIN1"), {pass: 3}, ...GLIMPSE];
  eq(play("four seats, made", SETUP, steps, {seats: 4}).activePlayer, 1, "at a table of four, Glimpse cast on Maya's turn 2");
  for (const [turn, whose] of [[2, "Maya"], [3, "seat 2"], [4, "seat 3"]])
    eq(permissions(play(`four seats, turn ${turn}`, SETUP, [...steps, to(turn, "END_OF_TURN")], {seats: 4})).length, 1, `at a table of four: ${whose}'s end step does not end it`);
  eq(permissions(play("four seats, Rob's", SETUP, [...steps, to(5, "END_OF_TURN")], {seats: 4})).length, 0, "Rob's turn 5 end step does");
}
/* ---- "until the end of your next turn" is another duration ---- */
{
  const s = play("the other duration", SETUP, [{tap: "Island"}, {cast: "Long Glimpse"}, {resolve: true}, to(1, "END_OF_TURN"), {tap: "Mountain"}]);
  eq([permissions(s).map((p) => p.until), sparkOffers(s, 0).length], [["your-next-end"], 2],
    "\"until the end of your next turn\": not ended as this end step begins -- the Spark is still offered there");
}

/* ---- the compiler ---- */
{
  const script = (until) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Sorcery"], manaCost: "{R}", colors: ["R"]},
    oracleText: "Exile the top card of your library. Until your next end step, you may play it.", source: "hand",
    abilities: [{kind: "spell", text: "Exile the top card of your library. Until your next end step, you may play it.", targets: [],
      effects: [{effect: "moveZone", fromTop: 1, to: "exile", remember: true}, {effect: "mayPlay", targets: "remembered", until}]}]});
  eq(compileScript(script("your-next-end-step")).problems, [], "a permission until your next end step compiles");
  ok(compileScript(script("next-end-step")).problems.some((p) => p.startsWith("mayPlay")), "and one until a time it does not know is refused");
}
ok(index.resolve("Shadow Urchin")?.playable === true, "Shadow Urchin is defined and playable");

console.log(`engine-next-end-step: ${checks} checks passed -- "until your next end step" over as its controller's next end step begins: this turn's if made before it, the next if made during it, never another player's.`);
