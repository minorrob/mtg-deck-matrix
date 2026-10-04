/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "−X:" AND "A CARD THAT SHARES A COLOR WITH THIS PLANESWALKER" (Kasmina, Enigma Sage; the live-game plan of 2026-10-04,
 * lane W6).
 *
 * A loyalty cost of −X (cards/index.mjs): X chosen as it is activated, from none to the loyalty the permanent has
 * (rules/actions.mjs, abilityXValues), that many loyalty counters removed (CR 606.4), and the activation saying −X -- an
 * offer's and the event's `loyalty` a number, so "if you removed two or more loyalty counters" reads it. And the selector
 * `sharesColor: "self"` (script/filter.mjs): a color of its source's, as it now is.
 */
import assert from "node:assert/strict";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {matchesSelector, compileSelector} from "../game/engine/script/filter.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const KE = "Kasmina, Enigma Sage";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {"Blue Bolt": {types: ["Instant"], manaCost: "{U}", colors: ["U"]}, "Red Bolt": {types: ["Instant"], manaCost: "{R}", colors: ["R"]}};
const play = (setup, steps = []) => runScenario({name: "loyalty x", setup, steps}, index.definition, FIX).state;
const idOf = (s, card) => s.zones.battlefield.find((id) => s.objects[id].card === card);

{
  const s = play([at(0, "battlefield", KE)]);
  const kasmina = idOf(s, KE);
  eq(legalActions(s, 0).filter((a) => a.objectId === kasmina && a.abilityId === "a2").map((a) => [a.x, a.loyalty]), [[0, -0], [1, -1], [2, -2]], "-X at 2 loyalty: X of 0, 1 or 2, each its own offer, its loyalty -X");
  s.objects[kasmina].counters.loyalty = 5;
  eq(legalActions(s, 0).filter((a) => a.objectId === kasmina && a.abilityId === "a2").length, 6, "at 5: six");
  const t = play([at(0, "battlefield", KE, "Way of the Mind Sculptor")], [{activate: KE, ability: "a2", x: 2}]);
  eq(t.stack.length + (t.pendingTriggers?.length ?? 0), 2, "-2 removed: the Mind Sculptor's \"two or more\" triggers");
  const u = play([at(0, "battlefield", KE, "Way of the Mind Sculptor")], [{activate: KE, ability: "a2", x: 1}]);
  eq(u.stack.length + (u.pendingTriggers?.length ?? 0), 1, "-1: it does not");
}
{
  const s = play([at(0, "battlefield", KE), at(0, "library", "Blue Bolt", "Red Bolt")]);
  const kasmina = idOf(s, KE);
  const match = (card) => matchesSelector({what: "card", zone: "library", types: ["Instant"], sharesColor: "self"}, s, s.zones.library[0].find((id) => s.objects[id].card === card), {controller: 0, source: kasmina});
  eq([match("Blue Bolt"), match("Red Bolt")], [true, false], "green and blue Kasmina: the blue instant shares a color, the red one not");
  let threw = false;
  try { compileSelector({what: "card", sharesColor: "you"}); } catch { threw = true; }
  ok(threw, "sharesColor is \"self\"");
}

console.log(`engine-loyalty-x: ${checks} checks passed -- -X from none to its loyalty, each its own offer, and said as -X; a card that shares a color with its source.`);
