/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 33 (THE CATALOG'S ORDER): EXTRA PHASES (CR 500.8).
 *
 * "Some effects can add phases to a turn. They do this by adding the phases directly after the specified phase. If
 * multiple extra phases are created after the same phase, the most recently created phase will occur first." After the
 * added phases the turn goes on from where it was; phases added during an added phase come directly after that one.
 * What an added phase leaves pending at the end of the turn goes with the turn. And with them: creatures that attacked
 * this turn, the first combat phase of the turn, and delirium -- four or more card types among cards in your graveyard.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {selectMatching} from "../game/engine/script/filter.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardScripts} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const pod = {matchId: "m", seed: "phases", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
function to(s, phase, turn = s.turn) { for (let n = 0; n < 200 && !(s.turn === turn && s.phase === phase && s.priorityPlayer !== null && !s.awaiting); n += 1) step(s); return s; }
/* One step of the rules loop: nobody attacks unless told, everyone passes. */
function step(s, attack = null) {
  if (s.awaiting) { resolveAwaiting(s, s.awaiting.kind === "declare-attackers" && attack ? attack(s) : []); return; }
  if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
}
/* The steps the turn walks through from here until the next turn's MAIN1, in order, each named once per visit. */
function walk(s, attack = null) {
  const seen = [], start = s.turn;
  let last = null;
  for (let n = 0; n < 400 && !(s.turn > start && s.phase === "MAIN1"); n += 1) {
    const at = `${s.turn}:${s.phase}:${s.stepIndex}:${(s.stepQueue ?? []).length}`;
    if (at !== last) { seen.push(s.phase); last = at; }
    step(s, attack);
  }
  return seen;
}
const add = (s, phases) => runEffects(s, [{effect: "addPhase", phases}], {controller: 0, source: null});
const COMBAT = ["COMBAT_BEGIN", "COMBAT_DECLARE_ATTACKERS", "COMBAT_END"];
const START = ["UNTAP", "UPKEEP", "DRAW"];

{
  /* "After this main phase, there is an additional combat phase followed by an additional main phase." */
  const s = table(); beginGame(s); to(s, "MAIN1");
  add(s, ["combat", "main"]);
  eq(s.extraPhases, [{turn: 1, after: "MAIN1", steps: ["COMBAT_BEGIN", "COMBAT_DECLARE_ATTACKERS", "COMBAT_DECLARE_BLOCKERS", "COMBAT_FIRST_STRIKE_DAMAGE", "COMBAT_DAMAGE", "COMBAT_END", "MAIN2"]}],
    "added in the first main phase: a combat and a main phase, after MAIN1, this turn");
  eq(walk(s).slice(0, 13), ["MAIN1", ...COMBAT, "MAIN2", ...COMBAT, "MAIN2", "END_OF_TURN", "CLEANUP", "UNTAP", "UPKEEP"],
    "then: the added combat (no attackers, so no blockers or damage steps), the added main, then the turn's own combat and main, and on");
}
{
  /* Two after the same phase: the most recently added first (CR 500.8). Added during an added phase: directly after it. */
  const s = table(); beginGame(s); to(s, "MAIN1");
  add(s, ["combat"]);
  add(s, ["beginning"]);
  const first = walk(s).slice(0, 8);
  eq(first, ["MAIN1", ...START, ...COMBAT, "COMBAT_BEGIN"], "a combat, then a beginning phase, both after MAIN1: the beginning phase (added last) comes first");
  const t = table(); beginGame(t); to(t, "MAIN1");
  add(t, ["combat", "main"]);
  to(t, "COMBAT_BEGIN");
  add(t, ["combat"]);
  eq(walk(t).slice(0, 9), ["COMBAT_BEGIN", "COMBAT_DECLARE_ATTACKERS", "COMBAT_END", ...COMBAT, "MAIN2", "COMBAT_BEGIN", "COMBAT_DECLARE_ATTACKERS"],
    "a combat added during the added combat comes right after it, before the added main phase -- then the turn's own combat");
}
{
  /* What is still pending at the end of the turn goes with it. */
  const s = table(); beginGame(s); to(s, "MAIN2");
  s.extraPhases = [{turn: 1, after: "MAIN1", steps: ["COMBAT_BEGIN", "COMBAT_END"]}];
  to(s, "MAIN1", 2);
  eq([s.extraPhases, s.stepQueue, s.resumeAfter], [[], [], null], "an extra phase added after a step already past is dropped at the turn's end");
  s.extraPhases = [{turn: 1, after: "MAIN1", steps: ["UNTAP", "UPKEEP", "DRAW"]}];
  eq(walk(s).slice(0, 3), ["MAIN1", "COMBAT_BEGIN", "COMBAT_DECLARE_ATTACKERS"], "and the next turn's MAIN1 is followed by its own combat only -- even one recorded for the last turn (a saved state) is not this turn's");
}
{
  /* Creatures that attacked this turn; the first combat phase of the turn. */
  const s = table();
  const bear = addObject(s, {card: "Bear", types: ["Creature"], power: 2, toughness: 2, owner: 0, controller: 0}, "battlefield", null);
  const elf = addObject(s, {card: "Elf", types: ["Creature"], power: 1, toughness: 1, owner: 0, controller: 0}, "battlefield", null);
  beginGame(s); to(s, "MAIN1");
  add(s, ["combat"]);
  eq(conditionHolds(s, {firstCombat: true}, {controller: 0}), true, "before any combat: it is (still) the first");
  const attacker = () => [0];
  for (let n = 0; n < 50 && s.phase !== "COMBAT_DECLARE_BLOCKERS" && s.phase !== "COMBAT_DAMAGE"; n += 1) step(s, attacker);
  const attacked = selectMatching(s, {what: "permanent", types: ["Creature"], attackedThisTurn: true}, {controller: 0});
  eq([attacked.length, [bear, elf].includes(attacked[0])], [1, true], "one creature declared as an attacker: it, and only it, attacked this turn");
  eq(conditionHolds(s, {firstCombat: true}, {controller: 0}), true, "in the first combat phase: the first");
  to(s, "COMBAT_BEGIN");
  eq([s.combatsThisTurn, conditionHolds(s, {firstCombat: true}, {controller: 0})], [2, false], "in the added combat phase: the second, not the first");
  to(s, "MAIN1", 2);
  eq([selectMatching(s, {what: "permanent", types: ["Creature"], attackedThisTurn: true}, {controller: 0}), s.combatsThisTurn ?? 0], [[], 0], "the next turn: nobody has attacked, and no combat yet");
}
{
  /* Delirium (CR 205.2a): card types among cards in your graveyard -- an artifact creature is two, two lands one type. */
  const s = table();
  const yard = (o) => addObject(s, {...o, owner: 0, controller: 0}, "graveyard", 0);
  yard(WASTES); yard(WASTES); yard({card: "Bolt", types: ["Instant"]});
  const holds = () => conditionHolds(s, {graveyardTypes: 4}, {controller: 0});
  eq(holds(), false, "two lands and an instant: two card types");
  yard({card: "Golem", types: ["Artifact", "Creature"]});
  eq(holds(), true, "and an artifact creature: four (land, instant, artifact, creature)");
  addObject(s, {card: "Ogre", types: ["Sorcery"], owner: 1, controller: 1}, "graveyard", 1);
  eq(conditionHolds(s, {graveyardTypes: 5}, {controller: 0}), false, "a sorcery in Maya's graveyard is not in Rob's");
}
{
  /* What may be added. */
  const script = structuredClone(loadCardScripts().find(({script: one}) => one.identity.name === "Relentless Assault").script);
  script.abilities[0].effects[1] = {effect: "addPhase", phases: ["combat", "upkeep"]};
  eq(compileScript(script).problems.filter((p) => /addPhase/.test(p)).length, 1, "an upkeep step is not (yet) a phase a card may add: refused at compile");
}

console.log(`engine-phases: ${checks} checks passed — added phases directly after the phase under way, the most recent first, then the turn goes on; added inside an added phase, right after it; dropped with the turn; attacked this turn; the first combat; delirium.`);
