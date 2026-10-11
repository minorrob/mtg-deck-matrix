/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, W2D: "REMOVE UP TO THREE COUNTERS FROM ANOTHER TARGET CREATURE OR PLANESWALKER" (Mabel, Bitter Recluse; CR 122.1,
 * 608.2d).
 *
 * removeCounter of any kinds (`counter: "any"`): `count` counters in all, "up to" (`upTo`) as few as none, which ones its
 * controller's choice as it resolves (effects/asking.mjs, countersToRemove) -- every counter there an option, as many of a
 * kind as could go -- and the effect done with the answer (`removing`, effects/resources.mjs), so "for each counter removed
 * this way" counts them. Here: the question's bounds, the cases nobody is asked, the count after it, refused answers, the
 * compiler, and the house pilot's answer.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {beginResolution, answerDeparted} from "../game/engine/script/resolution.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
const table = (setup) => runScenario({name: "counters-removed", setup, steps: []}, index.definition, FIX).state;
const bear = (s, seat = 1) => s.zones.battlefield.find((id) => s.objects[id].card === "Bear" && s.objects[id].controller === seat);
const withCounters = (counters, seat = 1) => {
  const s = table([{seat: 0, zone: "battlefield", cards: ["Bear"]}, {seat: 1, zone: "battlefield", cards: ["Bear"]}]);
  s.objects[bear(s, seat)].counters = {...counters};
  return s;
};
const removal = (s, more = {}, seat = 1) => ({effect: "removeCounter", targets: [bear(s, seat)], counter: "any", count: 3, upTo: true, ...more});
const counters = (s, seat = 1) => Object.fromEntries(Object.entries(s.objects[bear(s, seat)].counters).filter(([, n]) => n > 0));
const DRAW_THAT_MANY = {effect: "draw", count: {countersRemovedThisWay: true}};
const hand = (s) => s.zones.hand[0].length;

{
  /* Up to three, of two kinds: each counter an option, as many of a kind as could go -- five +1/+1 counters are three. */
  const s = withCounters({"+1/+1": 5, time: 1});
  beginResolution(s, [removal(s), DRAW_THAT_MANY], {controller: 0, source: null});
  const choice = awaitingChoice(s);
  eq([s.awaiting.player, choice.mode, choice.min, choice.max, choice.options.map((o) => o.label)],
    [0, "many", 0, 3, ["+1/+1 counter (1)", "+1/+1 counter (2)", "+1/+1 counter (3)", "time counter"]], "Rob is asked: up to three, of the counters there");
  const before = hand(s);
  resolveAwaiting(s, [0, 3]);
  eq([counters(s), hand(s) - before], [{"+1/+1": 4}, 2], "one +1/+1 and the time counter go, and \"for each counter removed this way\" counts two");
}
{
  /* "Up to": none at all, and nothing is removed -- none removed this way. */
  const s = withCounters({"+1/+1": 2});
  beginResolution(s, [removal(s), DRAW_THAT_MANY], {controller: 0, source: null});
  const before = hand(s);
  resolveAwaiting(s, []);
  eq([counters(s), hand(s) - before], [{"+1/+1": 2}, 0], "none chosen: both stay, and none removed this way");
}
{
  /* Nothing on it: nobody is asked. Exactly three of three there (no "up to"): the rules leave no choice, nobody is asked. */
  const s = withCounters({});
  const out = beginResolution(s, [removal(s)], {controller: 0, source: null});
  eq([out.status, s.awaiting], ["done", null], "no counters: nothing asked");
  const t = withCounters({"+1/+1": 2, time: 1});
  const before = hand(t);
  const all = beginResolution(t, [removal(t, {upTo: undefined}), DRAW_THAT_MANY], {controller: 0, source: null});
  eq([all.status, counters(t), hand(t) - before], ["done", {}, 3], "exactly three of three: all go, unasked, and three are drawn");
  /* Exactly three of four: asked, and three must be chosen. */
  const u = withCounters({"+1/+1": 3, time: 1});
  beginResolution(u, [removal(u, {upTo: undefined})], {controller: 0, source: null});
  eq([awaitingChoice(u).min, awaitingChoice(u).max], [3, 3], "exactly three of four: three it must choose");
  let refused = 0;
  for (const bad of [[0, 1], [0, 1, 2, 3], [0, 1, 1, 3], [0, 1, 9]]) try { resolveAwaiting(u, bad); } catch { refused += 1; }
  eq(refused, 4, "too few, too many, one twice, one not offered: each refused");
  resolveAwaiting(u, [0, 1, 3]);
  eq(counters(u), {"+1/+1": 1}, "and the three chosen go");
}
{
  /* Rob, asked, leaves the game: the ability left with him (CR 800.4a), and nothing is removed. */
  const s = withCounters({"+1/+1": 2});
  beginResolution(s, [removal(s)], {controller: 0, source: null});
  s.players[0].lost = true;
  answerDeparted(s);
  eq([s.awaiting, s.resolving, counters(s)], [null, null, {"+1/+1": 2}], "Rob gone: no question, no resolution, both counters stay");
}
{
  /* Never decided where nothing asks: run directly, it refuses rather than guessing. */
  const s = withCounters({"+1/+1": 1});
  let threw = false;
  try { runEffect(s, removal(s), {controller: 0}); } catch (e) { threw = /asks its controller/.test(e.message); }
  ok(threw, "removeCounter of any kinds, run directly, asks to be run through a resolution");
}

/* ---- the compiler ---- */
const compiled = (effect, wrap = (e) => [e]) => compileScript({schema: "CrankCardScript@1",
  identity: {name: "Odd Mouse", oracleId: "x", types: ["Creature"], subtypes: ["Mouse"], manaCost: "{B}", colors: ["B"], colorIdentity: ["B"], power: 1, toughness: 1},
  oracleText: "x", source: "hand", abilities: [{kind: "triggered", text: "x", trigger: {on: "enters", who: "self"}, targets: [{what: "permanent"}], effects: wrap({effect: "removeCounter", targets: {target: 0}, ...effect})}]}).problems;
{
  eq(compiled({counter: "any", count: 3, upTo: true}), [], "of any kinds, up to three, compiles");
  eq(compiled({counter: "any", count: 2}), [], "and exactly two");
  ok(compiled({counter: "any"}).some((p) => p.includes("a number of them")), "no count is refused");
  ok(compiled({counter: "any", count: 3, upTo: false}).some((p) => p.includes("a number of them")), "upTo other than true is refused");
  ok(compiled({counter: "any", count: 3, removing: {"+1/+1": 1}}).some((p) => p.includes("a number of them")), "an answer written in is refused");
  ok(compiled({counter: "+1/+1", count: 1, upTo: true}).some((p) => p.includes("upTo goes with")), "upTo on a named kind is refused");
  ok(compiled({counter: "any", count: 1}, (e) => [{effect: "repeatFor", each: "opponent", effects: [e]}]).some((p) => p.includes("what repeats here does not ask")),
    "and inside what repeats for each, which does not ask, refused");
}

/* ---- the house pilot ---- */
{
  const pilot = housePilot({seat: 0, cards: index.definition});
  const s = withCounters({"+1/+1": 2, "-1/-1": 1, time: 1});
  beginResolution(s, [removal(s)], {controller: 0, source: null});
  const q = awaitingChoice(s);
  eq(pilot.answer(projectFor(s, 0), q).indices.map((i) => q.options[i].counter).sort(), ["+1/+1", "+1/+1", "time"], "from Maya's Bear: all it may, never her -1/-1 counter");
  const t = withCounters({"+1/+1": 1, "-1/-1": 2}, 0);
  beginResolution(t, [removal(t, {}, 0)], {controller: 0, source: null});
  const r = awaitingChoice(t);
  eq(pilot.answer(projectFor(t, 0), r).indices.map((i) => r.options[i].counter), ["-1/-1", "-1/-1"], "from its own Bear: its -1/-1 counters alone");
}

console.log(`engine-counters-removed: ${checks} checks passed -- "remove up to three counters" of any kinds: the controller's choice, its bounds, unasked where there is no choice, counted after, refused when wrong.`);
