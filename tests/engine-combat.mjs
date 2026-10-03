/* COMBAT: WHO ATTACKS WHOM, WHO BLOCKS, AND WHO DIES.
 *
 * `docs/engine/PLAN.md` §3.3 (combat, CR 506 to 511) and §6's phase 1 gate, which names
 * "combat with multiple defenders and damage assignment".
 *
 * MULTIPLE DEFENDERS IS THE WHOLE POINT. In a four-player Commander game every attacking creature
 * chooses which opponent it is attacking, one creature at a time. A two-player engine with "the
 * defending player" hardcoded produces a game that looks right until the first time somebody wants
 * to send two creatures at one seat and one at another, which is most turns.
 *
 * SUMMONING SICKNESS IS ABOUT CONTROL, NOT ABOUT ENTERING (CR 302.6). A creature can attack if its
 * controller has controlled it continuously since their most recent turn began. Because a zone
 * change makes a new object, the turn it arrived is the turn it came under control, and the test is
 * simply "not this turn".
 *
 * DECLARING ATTACKERS IS A TURN-BASED ACTION (CR 508.1), not something done with priority. It
 * happens as the step begins, before anyone can respond — which is why an instant cast in the
 * declare attackers step is cast at creatures that are already attacking and already tapped.
 *
 * DAMAGE AMONG BLOCKERS IS DIVIDED AS ITS CONTROLLER CHOOSES (CR 510.1c). Since the 2024 rules
 * there is no damage assignment order; lethal matters only for trample, which reaches the player
 * once every blocker has lethal (CR 702.19b). The board's validator and the engine hold the same
 * rule (controller.mjs, damageAssignmentProblem).
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn, zoneOf} from "../game/engine/state/index.mjs";
import {beginGame, advance, currentPhase, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {attackers, blockers, combatDamage} from "../game/engine/rules/combat.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {createController} from "../game/engine/controller.mjs";
import {randomUUID} from "node:crypto";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}]};
const creature = (over) => ({types: ["Creature"], power: 2, toughness: 2, ...over});

/* A table at the declare attackers step of seat 0's turn, with whatever was put on the board
   already out since an earlier turn unless `fresh` says otherwise. */
function atCombat(setup = () => {}) {
  const state = createState(pod);
  /* Libraries, because since 1.5 a draw step on an empty one is a real loss (CR 704.5b) and takes
     that player's board with them — a fixture that crosses one is testing the loss rules by
     accident rather than testing combat. */
  for (let seat = 0; seat < 4; seat += 1)
    for (let i = 0; i < 60; i += 1)
      addObject(state, {card: `L${seat}-${i}`, owner: seat, controller: seat}, "library", seat);
  beginGame(state);
  setup(state);
  /* Everything placed by the setup came down on turn 1; move to turn 2 so it is not sick. */
  let guard = 0;
  while (!(state.turn === 2 && currentPhase(state) === "COMBAT_DECLARE_ATTACKERS") && guard < 400) {
    if (state.awaiting) { resolveAwaiting(state, []); continue; }
    advance(state);
    guard += 1;
  }
  /* Turn 2 belongs to seat 1; run on to turn 5, which is seat 0's again. */
  while (!(state.activePlayer === 0 && state.turn > 1 && currentPhase(state) === "COMBAT_DECLARE_ATTACKERS") && guard < 900) {
    if (state.awaiting) { resolveAwaiting(state, awaitingChoice(state).mode === "many" ? [] : []); continue; }
    advance(state);
    guard += 1;
  }
  return state;
}
const named = (state, name) => state.zones.battlefield.filter((id) => state.objects[id].card === name);

/* ---- declaring attackers is a turn-based action, asked as the step begins ---- */
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  });
  eq(currentPhase(s), "COMBAT_DECLARE_ATTACKERS", "the step");
  eq(s.awaiting?.kind, "declare-attackers", "opens by asking the active player to declare (CR 508.1)");
  eq(s.awaiting.player, 0, "the active player, and nobody else");
  eq(s.priorityPlayer, null, "with nobody holding priority — this happens before anyone can respond");

  const choice = awaitingChoice(s);
  eq(choice.mode, "many", "it is a selection of attacks");
  eq(choice.min, 0, "attacking is optional (CR 508.1a)");
  /* THREE OPPONENTS MEANS THREE OPTIONS FOR ONE CREATURE. */
  eq(choice.options.length, 3,
    "one option per creature per legal defender — three opponents, so one bear has three ways to attack");
  eq(new Set(choice.options.map((o) => o.defenderId)).size, 3, "each naming a different defender");
  ok(choice.options.every((o) => o.label.includes("Bear")), "and the creature, so a player can read it");
}

/* ---- summoning sickness (CR 302.6) ---- */
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  });
  addObject(s, creature({card: "Newcomer", owner: 0, controller: 0}), "battlefield");
  const choice = awaitingChoice(s);
  ok(choice.options.every((o) => !o.label.includes("Newcomer")),
    "a creature that arrived this turn cannot attack (CR 302.6) and is not offered");
  ok(choice.options.some((o) => o.label.includes("Bear")),
    "one that has been out since an earlier turn can");
}
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Sleepy", owner: 0, controller: 0}), "battlefield");
    addObject(state, creature({card: "Tapped", owner: 0, controller: 0}), "battlefield");
    addObject(state, creature({card: "Wall", owner: 0, controller: 0, keywords: ["Defender"]}), "battlefield");
    addObject(state, creature({card: "Theirs", owner: 1, controller: 1}), "battlefield");
    addObject(state, {card: "Rock", types: ["Artifact"], owner: 0, controller: 0}, "battlefield");
  });
  s.objects[named(s, "Tapped")[0]].tapped = true;
  const labels = new Set(awaitingChoice(s).options.map((o) => o.label.split(" →")[0]));
  ok(labels.has("Sleepy"), "an untapped creature out since an earlier turn may attack");
  ok(!labels.has("Tapped"), "a tapped one may not (CR 508.1a)");
  ok(!labels.has("Wall"), "nor one with defender (CR 702.3b)");
  ok(!labels.has("Theirs"), "nor a creature somebody else controls");
  ok(!labels.has("Rock"), "and an artifact is not a creature");
}

/* ---- attacking taps, unless the creature has vigilance (CR 508.1f, 702.20b) ---- */
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
    addObject(state, creature({card: "Watcher", owner: 0, controller: 0, keywords: ["Vigilance"]}), "battlefield");
  });
  const choice = awaitingChoice(s);
  const pick = (name, defender) => choice.options.findIndex((o) => o.label.startsWith(name) && o.defenderId === defender);
  const events = resolveAwaiting(s, [pick("Bear", 1), pick("Watcher", 2)]);

  eq(s.combat.attacks.length, 2, "two attacks were declared");
  eq(s.combat.attacks.map((a) => a.defender).sort(), [1, 2],
    "at two different seats — which is the thing a two-player engine cannot do");
  eq(s.objects[named(s, "Bear")[0]].tapped, true, "attacking taps the creature (CR 508.1f)");
  eq(s.objects[named(s, "Watcher")[0]].tapped, false, "vigilance does not (CR 702.20b)");
  eq(s.awaiting, null, "the declaration is done");
  eq(s.priorityPlayer, 0, "and now the active player receives priority (CR 508.2)");
  ok(events.some((e) => e.kind === "GameEventAttackersDeclared"), "the attack is reported");
  eq(events.find((e) => e.kind === "GameEventAttackersDeclared").data.fields.attackers.length, 2,
    "with both attackers, as the board's combat panel reads it");
}

/* ---- a creature attacks once ---- */
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  });
  const choice = awaitingChoice(s);
  assert.throws(() => resolveAwaiting(s, [0, 1]), /once|twice|same creature/i,
    "one creature cannot attack two players at the same time"); checks += 1;
  eq(s.combat, null, "and nothing was declared");
  ok(choice.options.length === 3, "the choice is unchanged and can be answered again");
}

/* ---- with nobody attacking, the combat steps stay skipped (CR 506.5) ---- */
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  });
  resolveAwaiting(s, []);
  eq(s.combat, null, "declaring no attackers leaves no combat");
  let guard = 0;
  while (currentPhase(s) !== "COMBAT_END" && guard < 20) { if (s.priorityPlayer !== null) { if (passPriority(s).outcome === "step-ends") advance(s); } else advance(s); guard += 1; }
  eq(currentPhase(s), "COMBAT_END",
    "and the declare blockers and combat damage steps do not happen at all (CR 506.5)");
}

/* ---- blocking (CR 509.1) ---- */
function withAttack(setup = () => {}) {
  const s = atCombat((state) => {
    addObject(state, creature({card: "Bear", owner: 0, controller: 0, power: 3, toughness: 3}), "battlefield");
    setup(state);
  });
  const choice = awaitingChoice(s);
  resolveAwaiting(s, [choice.options.findIndex((o) => o.label.startsWith("Bear") && o.defenderId === 1)]);
  /* Pass out of declare attackers into declare blockers. */
  let guard = 0;
  while (currentPhase(s) !== "COMBAT_DECLARE_BLOCKERS" && guard < 30) {
    if (s.priorityPlayer !== null) { if (passPriority(s).outcome === "step-ends") advance(s); } else advance(s);
    guard += 1;
  }
  return s;
}
{
  const s = withAttack((state) => {
    addObject(state, creature({card: "Blocker", owner: 1, controller: 1}), "battlefield");
    addObject(state, creature({card: "Bystander", owner: 2, controller: 2}), "battlefield");
  });
  eq(currentPhase(s), "COMBAT_DECLARE_BLOCKERS", "the declare blockers step happened, because somebody attacked");
  eq(s.awaiting?.kind, "declare-blockers", "and asks the defending player");
  eq(s.awaiting.player, 1, "the one being attacked");

  const choice = awaitingChoice(s);
  eq(choice.options.length, 1, "one of their creatures could block the one attacker");
  ok(choice.options[0].label.includes("Blocker"), "theirs");
  ok(!choice.options.some((o) => o.label.includes("Bystander")),
    "a creature belonging to a seat nobody is attacking is not offered — it cannot block (CR 509.1a)");

  const events = resolveAwaiting(s, [0]);
  eq(s.combat.attacks[0].blocked, true, "the attacker is blocked (CR 509.1h)");
  eq(s.combat.attacks[0].blockers.length, 1, "by one creature");
  eq(s.awaiting, null, "nobody else has to declare");
  ok(events.some((e) => e.kind === "GameEventBlockersDeclared"), "and the block is reported");
}
{
  const s = withAttack((state) => {
    addObject(state, creature({card: "Tapped", owner: 1, controller: 1}), "battlefield");
  });
  s.objects[named(s, "Tapped")[0]].tapped = true;
  eq(awaitingChoice(s).options.length, 0, "a tapped creature cannot block (CR 509.1a)");
  resolveAwaiting(s, []);
  eq(s.combat.attacks[0].blocked, false, "so the attacker is unblocked");
}

/* ---- combat damage (CR 510) ---- */
{
  const s = withAttack();
  resolveAwaiting(s, []);                       /* nobody blocks */
  let guard = 0;
  while (currentPhase(s) !== "COMBAT_DAMAGE" && guard < 30) {
    if (s.priorityPlayer !== null) { if (passPriority(s).outcome === "step-ends") advance(s); } else advance(s);
    guard += 1;
  }
  eq(currentPhase(s), "COMBAT_DAMAGE", "the damage step happens");
  eq(s.players[1].life, 37, "an unblocked 3/3 deals three to the player it was attacking (CR 510.1a)");
  eq(s.players[0].life, 40, "and to nobody else");
  eq(s.players[2].life, 40, "certainly not to a seat that was not being attacked");
}
{
  const s = withAttack((state) => {
    addObject(state, creature({card: "Blocker", owner: 1, controller: 1, power: 2, toughness: 2}), "battlefield");
  });
  resolveAwaiting(s, [0]);
  let guard = 0;
  while (currentPhase(s) !== "COMBAT_DAMAGE" && guard < 30) {
    if (s.awaiting) { resolveAwaiting(s, awaitingChoice(s).options.map((_, i) => i)); continue; }
    if (s.priorityPlayer !== null) { if (passPriority(s).outcome === "step-ends") advance(s); } else advance(s);
    guard += 1;
  }
  eq(s.players[1].life, 40, "a blocked creature deals no damage to the player (CR 510.1c)");
  eq(named(s, "Blocker").length, 0,
    "the 2/2 blocker took three and died to state-based actions as the next step gave out priority");
  eq(s.zones.graveyard[1].filter((id) => s.objects[id].card === "Blocker").length, 1,
    "into its owner's graveyard");
  eq(s.objects[named(s, "Bear")[0]].damage, 2,
    "and dealt its own two back before dying — damage is simultaneous (CR 510.2), so the 3/3 carries it and lives");
}

/* ---- two blockers: the attacking player divides the damage (CR 510.1c) ---- */
{
  const s = withAttack((state) => {
    addObject(state, creature({card: "Small", owner: 1, controller: 1, power: 1, toughness: 1}), "battlefield");
    addObject(state, creature({card: "Big", owner: 1, controller: 1, power: 1, toughness: 4}), "battlefield");
  });
  resolveAwaiting(s, [0, 1]);
  eq(s.combat.attacks[0].blockers.length, 2, "two creatures block one attacker");

  /* The attacking player divides three damage between them. */
  let guard = 0, offered = null;
  while (guard < 30) {
    if (s.awaiting?.kind === "assign-combat-damage") { offered = awaitingChoice(s); break; }
    if (s.awaiting) { resolveAwaiting(s, [0, 1]); continue; }
    if (s.priorityPlayer !== null) { if (passPriority(s).outcome === "step-ends") advance(s); } else advance(s);
    guard += 1;
  }
  ok(offered, "the attacker's controller is asked how to divide the damage");
  eq(offered.mode, "damage", "in the mode the board already draws");
  eq(offered.total, 3, "for the attacker's three power");
  ok(offered.options.every((o) => Number.isInteger(o.lethal)),
    "each blocker saying how much is lethal to it, which trample's rule needs (CR 702.19b)");
}

/* ---- dividing damage among blockers (CR 510.1c), trample past them (CR 702.19b), deathtouch's lethal (CR 702.2c) ----
   The plan review's C2 (decision D9): the rule today has no damage assignment order. The attacking creature's
   controller divides its damage among its blockers as they choose; lethal matters only for trample, whose damage reaches
   the player once every blocker has been assigned lethal. Each combat damage step asks for its own division (CR 510.4). */
function blockedBy(attacker, blockerSpecs) {
  const s = atCombat((state) => {
    addObject(state, creature({card: "Attacker", owner: 0, controller: 0, ...attacker}), "battlefield");
    for (const b of blockerSpecs) addObject(state, creature({owner: 1, controller: 1, ...b}), "battlefield");
  });
  const declare = awaitingChoice(s);
  resolveAwaiting(s, [declare.options.findIndex((o) => o.label.startsWith("Attacker") && o.defenderId === 1)]);
  let guard = 0;
  while (s.awaiting?.kind !== "declare-blockers" && guard < 40) {
    if (s.priorityPlayer !== null) { if (passPriority(s).outcome === "step-ends") advance(s); } else advance(s);
    guard += 1;
  }
  resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index));
  return onTo(s, (st) => st.awaiting?.kind === "assign-combat-damage");
}
function onTo(s, done) {
  let guard = 0;
  while (!done(s) && guard < 60) {
    if (s.awaiting) { resolveAwaiting(s, []); continue; }
    if (s.priorityPlayer !== null) { if (passPriority(s).outcome === "step-ends") advance(s); } else advance(s);
    guard += 1;
  }
  return s;
}
const combatOver = (s) => onTo(s, (st) => ["COMBAT_END", "MAIN2"].includes(currentPhase(st)));
const answerAs = (choice, amounts) => {
  const c = createController();
  c.offer(choice);
  return c.answer({actionId: randomUUID(), revision: c.revision, kind: "answer", choiceId: choice.id, amounts});
};
{
  const s = blockedBy({power: 3, toughness: 3}, [{card: "Small", power: 1, toughness: 1}, {card: "Big", power: 1, toughness: 4}]);
  const choice = awaitingChoice(s);
  eq([choice.divide, choice.options.map((o) => [o.label, o.lethal, o.defender])], [true, [["Small", 1, false], ["Big", 4, false]]],
    "two blockers: the attacker's controller divides three damage between them, each saying what is lethal to it");
  ok(answerAs(choice, [0, 3]).accepted, "the board's answer of all three to the 1/4 and none to the 1/1 is accepted -- there is no order to follow (CR 510.1c)");
  resolveAwaiting(s, [], [0, 3]);
  eq([named(s, "Small").length, s.objects[named(s, "Big")[0]]?.damage], [1, 3], "and dealt: the 1/1 untouched, the 1/4 with three");
}
{
  const s = blockedBy({power: 5, toughness: 5, keywords: ["Trample"]}, [{card: "Wall A", power: 0, toughness: 2}, {card: "Wall B", power: 0, toughness: 2}]);
  const choice = awaitingChoice(s);
  eq(choice.options.map((o) => [o.defender, o.lethal]), [[false, 2], [false, 2], [true, 0]], "a trampler's division has the player in it, after its blockers (CR 702.19b)");
  assert.throws(() => answerAs(choice, [2, 1, 2]), /lethal/, "two to the player while one wall has less than lethal is refused by the board's validator"); checks += 1;
  assert.throws(() => resolveAwaiting(s, [], [2, 1, 2]), /lethal/, "and by the engine"); checks += 1;
  resolveAwaiting(s, [], [2, 2, 1]);
  eq([s.players[1].life, named(s, "Wall A").length + named(s, "Wall B").length], [39, 0], "lethal to each wall, then one to the player: both walls die and the player takes one");
}
{
  const s = blockedBy({power: 3, toughness: 3, keywords: ["Trample", "Deathtouch"]}, [{card: "Ox A", power: 0, toughness: 4}, {card: "Ox B", power: 0, toughness: 4}]);
  eq(awaitingChoice(s).options.map((o) => o.lethal), [1, 1, 0], "from a source with deathtouch one damage is lethal (CR 702.2c)");
  resolveAwaiting(s, [], [1, 1, 1]);
  eq([s.players[1].life, named(s, "Ox A").length + named(s, "Ox B").length], [39, 0], "one to each 0/4, both destroyed (CR 702.2b), and one tramples over");
}
{
  const s = blockedBy({power: 4, toughness: 4, keywords: ["Double Strike"]}, [{card: "Pike A", power: 2, toughness: 2}, {card: "Pike B", power: 2, toughness: 2}]);
  eq(currentPhase(s), "COMBAT_FIRST_STRIKE_DAMAGE", "a double striker facing two blockers divides its damage in the first-strike step");
  resolveAwaiting(s, [], [2, 2]);
  eq([named(s, "Pike A").length + named(s, "Pike B").length, s.objects[named(s, "Attacker")[0]].damage], [0, 0],
    "both blockers die in that step without dealing theirs: the answer is dealt as first-strike damage, not regular");
  combatOver(s);
  eq(s.players[1].life, 40, "and in the regular step, blocked by nothing and without trample, it deals no damage (CR 510.1c)");
}
{
  const s = blockedBy({power: 4, toughness: 4, keywords: ["Double Strike", "Trample"]}, [{card: "Pike A", power: 2, toughness: 2}, {card: "Pike B", power: 2, toughness: 2}]);
  resolveAwaiting(s, [], [2, 2, 0]);
  combatOver(s);
  eq(s.players[1].life, 36, "with trample, blocked by nothing left, all four go to the player in the regular step (CR 702.19d)");
}

{
  const s = blockedBy({power: 2, toughness: 9, keywords: ["Double Strike"]}, [{card: "Ogre A", power: 0, toughness: 3}, {card: "Ogre B", power: 0, toughness: 3}]);
  resolveAwaiting(s, [], [2, 0]);
  onTo(s, (st) => st.awaiting?.kind === "assign-combat-damage" || ["COMBAT_END", "MAIN2"].includes(currentPhase(st)));
  eq([currentPhase(s), s.awaiting?.kind], ["COMBAT_DAMAGE", "assign-combat-damage"], "both blockers lived through the first-strike step, so the double striker divides again in the regular one (CR 510.4)");
  resolveAwaiting(s, [], [0, 2]);
  eq(["Ogre A", "Ogre B"].map((n) => s.objects[named(s, n)[0]].damage), [2, 2], "two to each blocker, one division in each step");
}

/* ---- an attacker that has left the battlefield is out of combat (CR 506.4) ----
   Probe R's seed 10: an attacker sacrificed after attackers were declared, and the blockers' question was built for it
   anyway, and threw. It is offered no blocker, and the one still attacking is. */
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
    addObject(state, creature({card: "Doomed", owner: 0, controller: 0}), "battlefield");
    addObject(state, {card: "Altar", types: ["Artifact"], owner: 0, controller: 0, abilities: [{id: "a1", kind: "activated", text: "Sacrifice a creature: You gain 1 life.",
      cost: [{atom: "sacrifice", selector: {types: ["Creature"]}}], effects: [{effect: "gainLife", amount: 1}]}]}, "battlefield");
    addObject(state, creature({card: "Guard", owner: 1, controller: 1}), "battlefield");
  });
  const declare = awaitingChoice(s);
  resolveAwaiting(s, ["Bear", "Doomed"].map((n) => declare.options.findIndex((o) => o.label.startsWith(n) && o.defenderId === 1)));
  const sac = legalActions(s, 0).find((a) => a.kind === "activate" && a.costChoice?.sacrifice === named(s, "Doomed")[0]);
  ok(sac, "seat 0 may sacrifice its own attacker in the declare attackers step");
  applyAction(s, 0, sac);
  onTo(s, (st) => st.awaiting?.kind === "declare-blockers");
  const blocks = awaitingChoice(s);
  eq(blocks.options.map((o) => o.label), ["Guard blocks Bear"], "the defender is offered blocks on the attacker still there, and none on the one that left (CR 506.4)");
}

/* ---- a game with combat in it terminates, and replays ---- */
function playOut(seed, turnLimit = 20) {
  const state = createState(pod);
  for (let seat = 0; seat < 4; seat += 1) {
    for (let i = 0; i < 20; i += 1)
      addObject(state, {card: "Forest", types: ["Land"], owner: seat, controller: seat,
        abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]}, "library", seat);
    for (let i = 0; i < 3; i += 1)
      addObject(state, {card: "Forest", types: ["Land"], owner: seat, controller: seat,
        abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]}, "hand", seat);
    for (let i = 0; i < 4; i += 1)
      addObject(state, creature({card: "Bears", owner: seat, controller: seat, manaCost: "{1}{G}"}), "hand", seat);
  }
  beginGame(state);
  const pilot = randomLegalPilot(createRng(seed));
  let steps = 0, attacks = 0;
  while (state.turn <= turnLimit && steps < 60000) {
    steps += 1;
    if (state.awaiting) {
      const choice = awaitingChoice(state);
      const answer = pilot.answer(choice);
      if (state.awaiting.kind === "declare-attackers") attacks += answer.indices.length;
      resolveAwaiting(state, answer.indices, answer.amounts);
      continue;
    }
    if (state.priorityPlayer === null) { advance(state); continue; }
    const chosen = pilot.choose(legalActions(state, state.priorityPlayer));
    if (chosen.kind === "pass") { if (passPriority(state).outcome === "step-ends") advance(state); }
    else applyAction(state, state.priorityPlayer, chosen);
  }
  return {state, steps, attacks};
}
{
  const a = playOut("combat");
  ok(a.steps < 60000, "a game with combat in it terminates");
  ok(a.attacks > 0, `and creatures actually attacked (${a.attacks} declarations)`);
  ok(a.state.players.some((p) => p.life < 40), "and somebody took damage");
  checks -= 2;

  const b = playOut("combat");
  eq(hashState(a.state), hashState(b.state), "the same seed plays the same game, combat and all");
  eq(a.attacks, b.attacks, "declaring the same attacks");
}

console.log(`engine-combat: ${checks} checks passed — every attacker chooses its own defender, summoning sickness is about control, damage among blockers is divided as its controller chooses, and trample waits for lethal to every blocker.`);
