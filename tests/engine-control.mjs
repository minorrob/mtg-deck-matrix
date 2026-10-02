/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 40 (THE CATALOG'S ORDER): GAINING CONTROL (CR 613.1b).
 *
 * "Gain control of target creature until end of turn": the permanent's controller changes -- its triggers are its new
 * controller's, "a creature you control" finds it -- and at the end of the turn it goes back, to the first controller
 * however many times it changed hands that turn. Having changed controller it is summoning sick for the new one unless
 * it has haste (CR 302.6), and the old one has it again from their next turn. "Target opponent gains control of this
 * creature" gives it away; "activate only during your turn"; "permanents you don't own".
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {summoningSick} from "../game/engine/keywords/timing.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {selectMatching} from "../game/engine/script/filter.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const BEAR = {card: "Bear", types: ["Creature"], power: 2, toughness: 2};
function table(n = 2) {
  const s = createState({matchId: "m", seed: "control", players: ["Rob", "Maya", "Trey"].slice(0, n).map((name) => ({name}))});
  for (let seat = 0; seat < n; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const steal = (s, ids, controller, until) => runEffects(s, [{effect: "gainControl", targets: ids, ...(until ? {until} : {})}], {controller, source: null});
function toTurn(s, turn) {
  for (let n = 0; n < 400 && !(s.turn === turn && s.phase === "MAIN1" && s.priorityPlayer !== null); n += 1) {
    if (s.awaiting) { resolveAwaiting(s, awaitingChoice(s).options.slice(0, awaitingChoice(s).min ?? 0).map((o) => o.index)); continue; }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
}

{
  /* For a turn: Rob's until the turn ends, then Maya's again -- and sick for Rob, unless it has haste. */
  const s = table();
  const ogre = on(s, {...BEAR, card: "Ogre"}, 1);
  main(s);
  steal(s, [ogre], 0, "end-of-turn");
  eq([s.objects[ogre].controller, selectMatching(s, {what: "permanent", types: ["Creature"], controller: "you"}, {controller: 0})], [0, [ogre]], "Rob controls the Ogre: \"a creature you control\" finds it");
  eq(summoningSick(s, ogre), true, "and it is summoning sick for him: it came under his control this turn");
  runEffects(s, [{effect: "pump", targets: [ogre], power: 0, toughness: 0, keywords: ["Haste"]}], {controller: 0, source: null});
  eq(summoningSick(s, ogre), false, "with haste, it is not");
  toTurn(s, 2);
  eq([s.objects[ogre].controller, summoningSick(s, ogre)], [1, false], "Maya's turn: hers again, and not sick for her -- she has had it since her turn began");
}
{
  /* Twice in one turn, then back to the first controller; for good, it stays. */
  const s = main(table(3));
  const bear = on(s, BEAR, 1);
  steal(s, [bear], 0, "end-of-turn");
  steal(s, [bear], 2, "end-of-turn");
  eq(s.objects[bear].controller, 2, "Rob takes Maya's Bear, then Trey takes it from Rob: Trey's");
  toTurn(s, 2);
  eq(s.objects[bear].controller, 1, "the turn over: back to Maya, its first controller");
  const relic = on(s, {card: "Relic", types: ["Artifact"]}, 1);
  steal(s, [relic], 0);
  toTurn(s, 3);
  eq(s.objects[relic].controller, 0, "gained for good: still Rob's two turns later");
}
{
  /* Its triggers are its new controller's: a stolen Zulaport Cutthroat drains for Rob. */
  const s = main(table());
  const zulaport = on(s, card("Zulaport Cutthroat"), 1);
  const bear = on(s, BEAR, 0);
  steal(s, [zulaport], 0);
  s.pendingTriggers = [];
  collectTriggers(s, runEffects(s, [{effect: "destroy", targets: [bear]}], {controller: 0, source: null}));
  eq(s.pendingTriggers.map((t) => [t.source.name, t.controller]), [["Zulaport Cutthroat", 0]], "Rob's Bear dies: Zulaport, now his, triggers for him");
}
{
  /* "Activate only during your turn"; "permanents you don't own". */
  const s = table();
  const defector = on(s, card("Humble Defector"), 0);
  main(s);
  eq([conditionHolds(s, {yourTurn: true}, {controller: 0}), conditionHolds(s, {yourTurn: true}, {controller: 1})], [true, false], "Rob's turn: his, not Maya's");
  eq(legalActions(s, 0).some((a) => a.kind === "activate" && a.objectId === defector), true, "Humble Defector: offered on his turn");
  const relic = on(s, {card: "Relic", types: ["Artifact"]}, 1);
  on(s, {card: "Charm", types: ["Enchantment"]}, 0);
  steal(s, [relic], 0);
  eq(selectMatching(s, {what: "permanent", controller: "you", owner: "opponent"}, {controller: 0}).map((id) => s.objects[id].card), ["Relic"], "the permanents Rob controls and does not own: the Relic");
}

{
  /* The scenario runner's "controls" fails a scenario that says the wrong thing. */
  const wrong = {name: "wrong", setup: [{seat: 0, zone: "battlefield", cards: ["Wastes"]}], steps: [], expect: [{seat: 0, controls: ["Wastes", "Island"]}]};
  assert.throws(() => runScenario(wrong, cards.definition, {}), /Rob controls \["Wastes"\], not \["Island","Wastes"\]/, "Rob controls the Wastes only: an expectation of two fails, and says why");
  checks += 1;
}

console.log(`engine-control: ${checks} checks passed — control for a turn or for good: "you control" finds it, its triggers are its controller's, sick without haste, back to the first controller as the turn ends; your turn; not owned.`);
