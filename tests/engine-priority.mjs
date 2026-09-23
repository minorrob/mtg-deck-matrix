/* PRIORITY: WHO MAY ACT, AND WHAT HAPPENS WHEN NOBODY WILL.
 *
 * `docs/engine/PLAN.md` §3.3 (priority and the stack, CR 117). This is the rule that makes a game
 * progress at all, and the phase 1 gate — a four-player game runs to completion for 1,000 seeds —
 * is really a claim about this file: if a round of passes can fail to end a step, the engine hangs.
 *
 * Three things here are where implementations go wrong:
 *
 *   ALL PLAYERS PASS "IN SUCCESSION" (CR 117.4). Any action by anybody starts the count over. An
 *   implementation that counts total passes rather than consecutive ones resolves spells that
 *   somebody was still responding to.
 *
 *   AFTER SOMETHING RESOLVES, THE ACTIVE PLAYER GETS PRIORITY (CR 117.3b) — not the next player in
 *   order, and not whoever passed last. Handing it to the wrong seat lets the table act in an order
 *   that is not APNAP, which changes which responses are possible.
 *
 *   A PLAYER WHO HAS LOST IS NOT IN THE ROUND. Counting them means the round never completes, which
 *   is a hang: the game stops with no error and no way for the board to say why.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {pushAbility, stackSize} from "../game/engine/rules/stack.mjs";
import {
  priorityOrder, grantPriority, takeAction, passPriority,
} from "../game/engine/rules/priority.mjs";
import {beginGame, advance, currentPhase} from "../game/engine/rules/turn.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {
  matchId: "m", seed: "s",
  players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}],
};
const started = () => { const s = createState(pod); beginGame(s); advance(s); return s; };  /* upkeep */

/* ---- APNAP: the active player, then the others in turn order ---- */
{
  const s = started();
  eq(priorityOrder(s), [0, 1, 2, 3], "from seat 0's turn, the round runs 0 1 2 3");
  s.activePlayer = 2;
  eq(priorityOrder(s), [2, 3, 0, 1], "from seat 2's turn it starts at 2 and wraps");
  s.players[3].lost = true;
  eq(priorityOrder(s), [2, 0, 1], "a player who has lost is not in the round at all");
}

/* ---- a step with priority opens with the active player holding it (CR 117.1a) ---- */
{
  const s = started();
  eq(currentPhase(s), "UPKEEP", "the upkeep step");
  eq(s.priorityPlayer, 0, "opens with the active player holding priority");
  eq(s.passes, 0, "and nobody having passed yet");
}

/* ---- passing walks the round ---- */
{
  const s = started();
  const first = passPriority(s);
  eq(first.outcome, "passed", "one pass is just a pass");
  eq(s.priorityPlayer, 1, "and priority moves to the next seat");
  eq(s.passes, 1, "one consecutive pass so far");
  passPriority(s);
  eq(s.priorityPlayer, 2, "then the next");
  passPriority(s);
  eq(s.priorityPlayer, 3, "then the last");
  const last = passPriority(s);
  eq(last.outcome, "step-ends",
    "when everyone has passed on an empty stack, the step is over (CR 117.4) — the caller advances it");
  eq(s.passes, 0, "and the count starts again");
}

/* ---- an action starts the count over (CR 117.4, "in succession") ---- */
{
  const s = started();
  passPriority(s); passPriority(s); passPriority(s);
  eq(s.passes, 3, "three in a row");
  takeAction(s, 3);
  eq(s.passes, 0, "and the fourth player doing something resets it");
  eq(s.priorityPlayer, 3,
    "a player who takes an action receives priority again (CR 117.3c) rather than handing it on");
  const next = passPriority(s);
  eq(next.outcome, "passed", "so the round has to go round again");
  eq(s.priorityPlayer, 0, "starting from the seat after the one that acted");
}

/* ---- everyone passing on a loaded stack resolves the top (CR 117.4, 608.1) ---- */
{
  const s = started();
  pushAbility(s, {sourceId: null, controller: 1, abilityId: "a1"});
  grantPriority(s, 0);
  passPriority(s); passPriority(s); passPriority(s);
  const result = passPriority(s);
  eq(result.outcome, "resolved", "the top object resolves rather than the step ending");
  eq(stackSize(s), 0, "and it is off the stack");
  ok(result.events.some((e) => e.kind === "GameEventSpellResolved"), "the resolution is reported");
  eq(s.priorityPlayer, 0,
    "and the ACTIVE player receives priority afterwards (CR 117.3b), not the next seat in the round");
  eq(s.passes, 0, "with the count reset, so a second object needs a whole round of its own");
}

/* ---- one object at a time ---- */
{
  const s = started();
  pushAbility(s, {sourceId: null, controller: 0, abilityId: "under"});
  pushAbility(s, {sourceId: null, controller: 0, abilityId: "over"});
  grantPriority(s, 0);
  for (let i = 0; i < 3; i += 1) passPriority(s);
  eq(passPriority(s).outcome, "resolved", "a full round resolves one object");
  eq(stackSize(s), 1, "the one under it is still there");
  for (let i = 0; i < 3; i += 1) passPriority(s);
  eq(passPriority(s).outcome, "resolved", "and needs its own round");
  eq(stackSize(s), 0, "before the stack is empty");
}

/* ---- the dead are not waited for ---- */
{
  const s = started();
  s.players[1].lost = true;
  s.players[2].lost = true;
  grantPriority(s, 0);
  eq(passPriority(s).outcome, "passed", "seat 0 passes");
  eq(s.priorityPlayer, 3, "priority skips the two who are out");
  eq(passPriority(s).outcome, "step-ends",
    "and two passes end the step — waiting for a player who has lost is a hang with nothing to report");
}
{
  const s = started();
  for (const seat of [1, 2, 3]) s.players[seat].lost = true;
  grantPriority(s, 0);
  eq(passPriority(s).outcome, "step-ends", "with one player left, one pass is a full round");
}

/* ---- a step that grants nobody priority holds nobody (CR 502.3) ---- */
{
  const s = createState(pod);
  beginGame(s);
  eq(currentPhase(s), "UNTAP", "the untap step");
  eq(s.priorityPlayer, null, "has no priority player at all");
  assert.throws(() => passPriority(s), /priority/i,
    "and passing in it is a caller's bug rather than something to absorb quietly"); checks += 1;
}

/* ---- a whole step, driven the way the controller loop will drive it ---- */
{
  const s = createState(pod);
  beginGame(s);
  let guard = 0;
  while (currentPhase(s) !== "MAIN1" && guard < 200) {
    if (s.priorityPlayer === null) { advance(s); guard += 1; continue; }
    const result = passPriority(s);
    if (result.outcome === "step-ends") advance(s);
    guard += 1;
  }
  eq(currentPhase(s), "MAIN1", "passing through upkeep and draw reaches the first main phase");
  ok(guard < 200, "in a bounded number of moves");
}

/* ---- refusals ---- */
{
  const s = started();
  assert.throws(() => grantPriority(s, 9), /seat|player/i,
    "priority cannot be granted to somebody who is not at the table"); checks += 1;
  s.players[2].lost = true;
  assert.throws(() => grantPriority(s, 2), /lost|out/i,
    "nor to a player who is out"); checks += 1;
}

/* ---- the count is state, so it checkpoints with everything else ---- */
{
  const s = started();
  passPriority(s);
  const copy = JSON.parse(JSON.stringify(s));
  eq(copy.passes, s.passes, "the pass count survives a round trip through plain data");
  eq(copy.priorityPlayer, s.priorityPlayer, "and so does who holds priority");
}

console.log(`engine-priority: ${checks} checks passed — APNAP order, consecutive passes only, the active player after a resolution, and the dead are never waited for.`);
