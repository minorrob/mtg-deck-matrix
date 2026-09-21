/* The verdict this tool prints is the whole product, so the thing to guard is that it never prints
 * one it did not earn. The first version did exactly that: pointed at a four-player pod that was
 * still on its mulligans, it watched eight seconds, saw no library fall, and announced "THE BUG
 * THIS WAS PREDICTED TO FIND". Nothing was wrong with the game -- it had not dealt opening hands.
 *
 * "No draw seen" and "no draw happened" are different facts. These pin them apart.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {firstDrawVerdict, canAnswerFrom, PAST_DRAW} from "../tools/first-draw-check.mjs";

test("a watch that never reached turn 1's draw step returns no verdict at all", () => {
  for (const seats of [2, 3, 4]) {
    const out = firstDrawVerdict({seats, answered: false, starterDrew: false});
    assert.equal(out.verdict, "unknown", `${seats} players`);
    assert.equal(out.correct, null, "an unknown must not read as a pass or a failure");
    assert.match(out.message, /missing observation/);
  }
});

test("CR 103.8a is applied by table size, not by habit", () => {
  // Two players: the player on the play skips their first draw.
  assert.equal(firstDrawVerdict({seats: 2, answered: true, starterDrew: false}).correct, true);
  assert.equal(firstDrawVerdict({seats: 2, answered: true, starterDrew: true}).correct, false);
  // Four players: there is no such clause, so the starting player must draw.
  assert.equal(firstDrawVerdict({seats: 4, answered: true, starterDrew: true}).correct, true);
  const pod = firstDrawVerdict({seats: 4, answered: true, starterDrew: false});
  assert.equal(pod.correct, false);
  assert.match(pod.message, /two-player rule/, "the report has to say why it is wrong, not just that it is");
});

test("a run that starts after turn 1's draw step refuses rather than guesses", () => {
  assert.equal(canAnswerFrom(0, null), true, "before the game starts is the best time to start");
  assert.equal(canAnswerFrom(1, "UNTAP"), true);
  assert.equal(canAnswerFrom(1, "UPKEEP"), true);
  assert.equal(canAnswerFrom(1, "MAIN1"), false, "the draw step is already behind us");
  assert.equal(canAnswerFrom(2, "UNTAP"), false);
});

test("every phase after the draw step counts as past it", () => {
  for (const phase of ["MAIN1", "COMBAT_DAMAGE", "MAIN2", "END_OF_TURN", "CLEANUP"]) assert.ok(PAST_DRAW.has(phase), phase);
  for (const phase of ["UNTAP", "UPKEEP", "DRAW"]) assert.ok(!PAST_DRAW.has(phase), phase + " is not past the draw step");
});
