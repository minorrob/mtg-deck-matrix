/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* MANA MADE IN THE UPKEEP OR THE DRAW STEP STAYS UNTIL THE TURN ENDS (Rob, 2026-10-28: "If I tap mana during the Upkeep or Draw phase and
 * it wasn't used to cast something at instant speed, it should remain in my mana pool until used or end of turn").
 *
 * A house rule over CR 500.4 (rules/turn.mjs, emptyManaPools): what a pool holds as the upkeep or the draw step ends is kept, as
 * Birgi's mana is, through the main phases and combat; any other step still empties it; and it is gone with the turn.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {advance, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const cards = loadCardIndex();
const fresh = () => runScenario({name: "upkeep mana", seats: 2, setup: [{seat: 0, zone: "battlefield", cards: ["Forest"]}, {seat: 1, zone: "battlefield", cards: ["Forest"]}], steps: [], expect: []}, cards.definition, {}).state;
const step = (s) => {if (s.awaiting) resolveAwaiting(s, []); else if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);};
/* On until the phase is `phase` of a turn of seat 0 with priority, and no further. */
const until = (s, phase, player = 0, from = s.turn) => {for (let n = 0; n < 400 && !(s.phase === phase && s.activePlayer === player && s.turn >= from && s.priorityPlayer !== null); n += 1) step(s);};

{
  const s = fresh();
  until(s, "UPKEEP", 0, s.turn + 1);
  const turn = s.turn;
  s.players[0].manaPool.G = 2;
  const seen = [];
  for (let n = 0; n < 400 && s.turn === turn; n += 1) {
    step(s);
    if (s.turn === turn && s.priorityPlayer !== null && seen.at(-1)?.[0] !== s.phase) seen.push([s.phase, s.players[0].manaPool.G]);
  }
  const at = Object.fromEntries(seen);
  eq(at.DRAW, 2, "mana made in the upkeep is still in the pool in the draw step");
  eq(at.MAIN1, 2, "and in the first main phase, to be spent there");
  eq(at.MAIN2 ?? 2, 2, "and the second");
  const last = seen.at(-1);
  ok(last);
  function ok(v) {assert.ok(v); checks += 1;}
}

{
  const s = fresh();
  until(s, "MAIN1", 0, s.turn + 1);
  const turn = s.turn;
  s.players[0].manaPool.G = 2;
  for (let n = 0; n < 400 && s.phase === "MAIN1" && s.turn === turn; n += 1) step(s);
  eq(s.players[0].manaPool.G, 0, "mana made in a main phase still empties as the step ends: the rule is for the upkeep and the draw step alone");
}

{
  const s = fresh();
  until(s, "DRAW", 0, s.turn + 1);
  const turn = s.turn;
  s.players[0].manaPool.U = 1;
  for (let n = 0; n < 400 && s.turn === turn; n += 1) step(s);
  for (let n = 0; n < 400 && !(s.turn > turn && s.phase === "UPKEEP"); n += 1) step(s);
  eq(s.players[0].manaPool.U, 0, "what was kept goes with the turn: the next turn's upkeep opens on an empty pool");
}

console.log(`engine-mana-upkeep: ${checks} checks passed — mana made in the upkeep or the draw step stays through the turn and goes with it; a main phase's still empties.`);
