/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE RULES AN EXPERIENCED PLAYER CHECKS: A CONFORMANCE SUITE (the plan review's A4 and C3, 2026-10-03; decision D4).
 *
 * The harness gates (G1: games that finish, replay and leak nothing) measure crashes, never correctness: the commander
 * layer was wrong in four ways for eighty batches while every game finished. This suite is the other half. Each case is a
 * situation a player who knows the game would check at a real table, played through the rules -- real definitions where
 * the pool has the card, a named fixture where it does not -- and each check says the rule it holds the engine to, by
 * number, in its own words. Written from the Comprehensive Rules (September 25, 2026), never from Forge (ADR-001); the
 * rules text itself stays out of the repository.
 *
 * Most cases were red before the rule was right: the commander layer (C1, #577), the rules a player checks (C2a, #578),
 * and the decisions that are the player's (C2b, #579). Their own suites hold the detail (engine-commander, engine-sba,
 * engine-combat, engine-costs, engine-unless, engine-attack-tax, engine-replacement); here each is asked once more, the
 * way a player would meet it in a game. Then invariants over whole games of house pilots on random definitions: what
 * must be true at every moment, whatever the cards.
 *
 * NAMED, NOT HELD HERE (each a rule the engine does not yet keep, said where it is deferred): damage dealt where nothing
 * can stop to ask (an effect that repeats for each player, a mana ability's) keeps the least-damage order of several
 * replacement effects (rules/replacement.mjs); CR 903.9b for a move that is not an effect's moveZone (rules/commander.mjs);
 * planeswalkers (CR 306, 704.5i), which no definition plays.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn, commanderKeyOf} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting, currentPhase} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {checkStateBasedActions, gameOver} from "../game/engine/rules/sba.mjs";
import {commanderTax} from "../game/engine/rules/commander.mjs";
import {beginMulligans, mulligansDone} from "../game/engine/rules/mulligan.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {leastAnswer} from "../game/room/room.mjs";
import {commanderLegal} from "../game/room/table.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0, measured = "";
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const definition = (name) => index.definition(name);
/* The supporting cast, where the pool has no card that is only what the case needs. */
const FIXTURES = {
  /* A commander that can attack the turn it is cast and dies to a Lightning Bolt: a one-mana legendary 11/3 with haste. */
  Boss: {types: ["Creature"], subtypes: ["Ogre"], supertypes: ["Legendary"], manaCost: "{R}", colors: ["R"], power: 11, toughness: 3, keywords: ["Haste"]},
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  "Steel Golem": {types: ["Artifact", "Creature"], subtypes: ["Golem"], manaCost: "{3}", colors: [], power: 3, toughness: 3, keywords: ["Indestructible"]},
  Bounce: {types: ["Instant"], manaCost: "{U}", colors: ["U"], spell: {id: "s", text: "Return target creature to its owner's hand.",
    targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "moveZone", targets: {target: 0}, to: "hand"}]}},
  Fireball: {types: ["Sorcery"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "This deals 40 damage to target player.",
    targets: [{what: "player"}], effects: [{effect: "dealDamage", amount: 40, toPlayer: {target: 0}}]}},
  "Deep Thought": {types: ["Sorcery"], manaCost: "{U}", colors: ["U"], spell: {id: "s", text: "Draw twenty-five cards.", targets: [], effects: [{effect: "draw", count: 25}]}},
};
const play = (name, setup, steps, extra = {}) => runScenario({name, setup, steps, ...extra}, definition, FIXTURES);
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const ZONE = "Put it into the command zone";
const objectsNamed = (state, name) => Object.values(state.objects).filter((o) => o.card === name);
const castBoss = [{tap: "Mountain"}, {cast: "Boss"}, {resolve: true}];

/* ======== the commander (CR 903) ======== */
{
  /* Destroyed by an effect: in the graveyard first, then asked. */
  const {state} = play("Generous Gift on a commander", [at(0, "command", "Boss"), at(0, "battlefield", "Mountain"), at(1, "battlefield", "Plains", "Plains", "Plains"), at(1, "hand", "Generous Gift")],
    [...castBoss, {pass: 1}, {tap: "Plains", seat: 1}, {tap: "Plains", seat: 1}, {tap: "Plains", seat: 1}, {cast: "Generous Gift", seat: 1, targets: [{card: "Boss"}]}, {resolve: true},
      {expect: [{seat: 0, zone: "graveyard", cards: ["Boss"]}, {asks: {seat: 0, options: [ZONE, "Leave it in your graveyard"]}}]}, {choose: [ZONE]}]);
  eq(objectsNamed(state, "Boss").map((o) => o.zone), ["command"],
    "CR 903.9a: a commander destroyed by an effect reaches the graveyard, and its owner may then move it to the command zone -- asked, and moved");
}
{
  /* A commander that dies is a creature that died: "dies" sees it, and the question comes after. */
  const {state} = play("Terminate with Zulaport Cutthroat", [at(0, "command", "Boss"), at(0, "battlefield", "Mountain", "Zulaport Cutthroat"),
    at(1, "battlefield", "Swamp", "Mountain"), at(1, "hand", "Terminate")],
  [...castBoss, {pass: 1}, {tap: "Swamp", seat: 1}, {tap: "Mountain", seat: 1}, {cast: "Terminate", seat: 1, targets: [{card: "Boss"}]}, {resolve: true},
    {choose: [ZONE]}, {resolve: true}]);
  eq([state.players[1].life, state.players[0].life], [39, 41],
    "CR 903.9a, 603.10a: a commander that dies triggers \"whenever a creature you control dies\" (Zulaport Cutthroat drains 1) -- the return to the command zone is a state-based action after the death, not a replacement of it");
}
{
  /* The tax counts casts from the command zone, whatever object the commander is now. */
  const {state} = play("the second cast", [at(0, "command", "Boss"), at(0, "battlefield", "Mountain", "Mountain", "Mountain"), at(1, "battlefield", "Mountain"), at(1, "hand", "Lightning Bolt")],
    [...castBoss, {pass: 1}, {tap: "Mountain", seat: 1}, {cast: "Lightning Bolt", seat: 1, targets: [{card: "Boss"}]}, {resolve: true}, {choose: [ZONE]},
      {to: {turn: 3, phase: "MAIN1"}}, {tap: "Mountain"}, {tap: "Mountain"}, {expect: [{offers: {kind: "cast", card: "Boss"}, count: 0}]}, {tap: "Mountain"},
      {expect: [{offers: {kind: "cast", card: "Boss"}, count: 1}]}]);
  eq(commanderTax(state, 0, cardsIn(state, "command", 0)[0]), 2, "CR 903.8: the second cast from the command zone costs {2} more -- not offered for two mana, offered for three");
}
{
  /* Twenty-one combat damage from the same commander, across a death and a recast. */
  const {state} = play("21 from one commander", [at(0, "command", "Boss"), at(0, "battlefield", "Mountain", "Mountain", "Mountain"), at(1, "battlefield", "Mountain"), at(1, "hand", "Lightning Bolt")],
    [...castBoss, {attack: ["Boss"]}, {to: {turn: 2, phase: "MAIN1"}}, {tap: "Mountain", seat: 1}, {cast: "Lightning Bolt", seat: 1, targets: [{card: "Boss"}]}, {resolve: true},
      {choose: [ZONE]}, {to: {turn: 3, phase: "MAIN1"}}, {tap: "Mountain"}, {tap: "Mountain"}, {tap: "Mountain"}, {cast: "Boss"}, {resolve: true}, {attack: ["Boss"]},
      {to: {turn: 3, phase: "MAIN2"}}], {stopWhenOver: true});
  eq([state.players[1].life, state.players[1].lostTo], [18, "commander-damage"],
    "CR 903.10a: 11 and then 11 combat damage from the same commander, a death between, is 22 -- the player loses at 18 life");
}
{
  /* Bounced: asked before it moves, never seen in the hand. */
  const {state} = play("a commander bounced", [at(0, "command", "Boss"), at(0, "battlefield", "Mountain"), at(1, "battlefield", "Island"), at(1, "hand", "Bounce")],
    [...castBoss, {pass: 1}, {tap: "Island", seat: 1}, {cast: "Bounce", seat: 1, targets: [{card: "Boss"}]}, {resolve: true},
      {expect: [{seat: 0, zone: "battlefield", cards: ["Mountain", "Boss"]}, {asks: {seat: 0, options: [ZONE, "Let it go to your hand"]}}]}, {choose: [ZONE]}]);
  eq([objectsNamed(state, "Boss").map((o) => o.zone), cardsIn(state, "hand", 0).length], [["command"], 0],
    "CR 903.9b: a commander that would go to its owner's hand may go to the command zone instead -- asked before the move, so it never reaches the hand");
}

/* ======== state-based actions (CR 704) ======== */
{
  const {state} = play("forty damage", [at(0, "battlefield", "Mountain"), at(0, "hand", "Fireball")],
    [{tap: "Mountain"}, {cast: "Fireball", targets: [{player: 1}]}, {resolve: true}], {stopWhenOver: true});
  eq([state.players[1].lost, state.players[1].lostTo, gameOver(state)], [true, "life", {winner: 0, reason: "last player standing"}],
    "CR 704.5a, 104.2a: a player at 0 life loses, and the last player in the game wins");
}
{
  const {state} = play("draw from an empty library", [at(0, "battlefield", "Island"), at(0, "hand", "Deep Thought")],
    [{tap: "Island"}, {cast: "Deep Thought"}, {resolve: true}], {stopWhenOver: true});
  eq([state.players[0].lost, state.players[0].lostTo], [true, "empty-library"],
    "CR 704.5b: a player who attempted to draw from an empty library loses -- twenty cards, then five more drawn from nothing");
}
{
  /* A token that leaves the battlefield ceases to exist; the Elephant Generous Gift makes is bounced. */
  const {state} = play("a token bounced", [at(0, "battlefield", "Plains", "Plains", "Plains", "Island", "Bear"), at(0, "hand", "Generous Gift", "Bounce")],
    [{tap: "Plains"}, {tap: "Plains"}, {tap: "Plains"}, {cast: "Generous Gift", targets: [{card: "Bear"}]}, {resolve: true},
      {tap: "Island"}, {cast: "Bounce", targets: [{card: "Elephant"}]}, {resolve: true}]);
  eq([objectsNamed(state, "Elephant").length, cardsIn(state, "hand", 0).length], [0, 0],
    "CR 704.5d, 111.7: a token returned to a hand ceases to exist -- it is in no hand, and nowhere at all");
}
{
  /* A board wipe and an indestructible creature: everything else dies at once, and every death is seen. */
  const {state} = play("Blasphemous Act and an indestructible Golem", [at(0, "battlefield", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Steel Golem", "Blood Artist"),
    at(1, "battlefield", "Bear", "Bear"), at(0, "hand", "Blasphemous Act")],
  [{tap: "Mountain"}, {tap: "Mountain"}, {tap: "Mountain"}, {tap: "Mountain"}, {tap: "Mountain"}, {cast: "Blasphemous Act"}, {resolve: true},
    /* Three triggers of one player's: they order them (CR 603.3b), and each one's target is chosen as it goes on the stack (603.3d). */
    {expect: [{asks: {seat: 0}}]}, {answer: [0, 1, 2]}, {choose: ["Maya"]}, {choose: ["Maya"]}, {choose: ["Maya"]},
    {expect: [{stack: 3}]}, {resolve: true}, {resolve: true}, {resolve: true}]);
  eq([objectsNamed(state, "Steel Golem").map((o) => o.zone), objectsNamed(state, "Bear").map((o) => o.zone), objectsNamed(state, "Blood Artist").map((o) => o.zone)],
    [["battlefield"], ["graveyard", "graveyard"], ["graveyard"]],
    "CR 702.12b, 704.5g: thirteen damage to each creature destroys all but the indestructible Golem, which keeps its damage and stays");
  eq([state.players[1].life, state.players[0].life], [37, 43],
    "CR 603.10a: Blood Artist sees itself and both Bears die in the same event -- three triggers, three life drained");
}
{
  /* The legend rule, with a copy: Phyrexian Metamorph entering as a copy of Krenko under the same player. */
  const {state} = play("a copy of a legend", [at(0, "battlefield", "Krenko, Mob Boss", "Wastes", "Wastes", "Wastes", "Blood Artist"), at(0, "hand", "Phyrexian Metamorph")],
    [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Phyrexian Metamorph"}, {resolve: true}, {choose: ["Krenko, Mob Boss"]},
      {expect: [{asks: {seat: 0}}]}]);
  const choice = awaitingChoice(state);
  eq([state.awaiting?.kind, choice.options.length], ["legend-rule", 2],
    "CR 704.5j, 707.2: a copy of a legendary creature is that legend -- two Krenkos under one player, and that player is asked which to keep");
  /* Keep the Krenko that was there first: the copy is the one that goes. */
  resolveAwaiting(state, [choice.options.findIndex((o) => !state.objects[o.cardId].uncopied)]);
  eq([objectsNamed(state, "Krenko, Mob Boss").map((o) => o.zone).sort(), objectsNamed(state, "Phyrexian Metamorph").map((o) => o.zone)],
    [["battlefield"], ["graveyard"]],
    "CR 704.5j: the one not kept is put into its owner's graveyard -- the copy keeps Krenko's name, and goes as the Metamorph it is");
}

/* +1/+1 and -1/-1 counters on one permanent (CR 704.5q). */
{
  const s = createState({matchId: "m", seed: "q", players: [{name: "Rob"}, {name: "Maya"}]});
  beginGame(s);
  const bear = addObject(s, {...FIXTURES.Bear, card: "Bear", owner: 0, controller: 0}, "battlefield");
  s.objects[bear].counters = {"+1/+1": 1, "-1/-1": 2};
  checkStateBasedActions(s);
  eq([s.objects[bear].counters["+1/+1"], s.objects[bear].counters["-1/-1"]], [0, 1],
    "CR 704.5q: one +1/+1 and two -1/-1 counters become one -1/-1 counter, and the 2/2 lives as a 1/1");
}

/* ======== combat (CR 506 to 511, 702) ========
   Blocks are declared here through the engine itself, as the room does: the scenario runner declares none. */
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
Object.assign(FIXTURES, {
  Brute: {types: ["Creature"], manaCost: "{4}", colors: [], power: 5, toughness: 5},
  "Venom Wurm": {types: ["Creature"], manaCost: "{4}", colors: [], power: 4, toughness: 4, keywords: ["Trample", "Deathtouch"]},
  Ox: {types: ["Creature"], manaCost: "{3}", colors: [], power: 0, toughness: 4},
  Duelist: {types: ["Creature"], manaCost: "{2}", colors: [], power: 2, toughness: 2, keywords: ["First Strike"]},
  Twinblade: {types: ["Creature"], manaCost: "{2}", colors: [], power: 2, toughness: 2, keywords: ["Double Strike"]},
  Sneak: {types: ["Creature"], manaCost: "{2}", colors: [], power: 2, toughness: 2, keywords: ["Menace"]},
  Imp: {types: ["Creature"], manaCost: "{R}", colors: ["R"], power: 2, toughness: 2},
});
/* A two-player game at Rob's first declare-attackers step, his creatures and Maya's already out (not summoning sick:
   they were there before the game began). */
function battle(rob, maya) {
  const s = createState({matchId: "m", seed: "battle", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 30; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  const put = (name, seat) => addObject(s, {...(FIXTURES[name] ?? definition(name)), card: name, owner: seat, controller: seat}, "battlefield");
  rob.forEach((name) => put(name, 0));
  maya.forEach((name) => put(name, 1));
  beginGame(s);
  return onTo(s, (x) => x.awaiting?.kind === "declare-attackers");
}
function onTo(s, done) {
  for (let n = 0; n < 400 && !done(s); n += 1) {
    if (s.awaiting) { resolveAwaiting(s, []); continue; }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  return s;
}
const indexOf = (choice, label) => {
  const at = choice.options.findIndex((o) => o.label === label || o.label.startsWith(`${label} → `));
  assert.ok(at >= 0, `no option ${label}: ${choice.options.map((o) => o.label).join(", ")}`);
  return at;
};
const attack = (s, ...names) => resolveAwaiting(s, names.map((n) => indexOf(awaitingChoice(s), n)));
/* Each label once per creature: two Bears blocking are two options with the same words. */
const block = (s, ...labels) => {
  onTo(s, (x) => x.awaiting?.kind === "declare-blockers");
  const choice = awaitingChoice(s), used = new Set();
  return resolveAwaiting(s, labels.map((label) => {
    const at = choice.options.findIndex((o, i) => o.label === label && !used.has(i) && ![...used].some((u) => choice.options[u].cardId === o.cardId));
    assert.ok(at >= 0, `no option ${label} left: ${choice.options.map((o) => o.label).join(", ")}`);
    used.add(at);
    return at;
  }));
};
const toDivision = (s) => onTo(s, (x) => x.awaiting?.kind === "assign-combat-damage");
const throughCombat = (s) => onTo(s, (x) => x.phase === "MAIN2");
const named = (s, name) => s.zones.battlefield.filter((id) => s.objects[id].card === name);
{
  const s = battle(["Brute"], ["Bear", "Ox"]);
  attack(s, "Brute"); block(s, "Bear blocks Brute", "Ox blocks Brute"); toDivision(s);
  resolveAwaiting(s, [], [0, 5]);
  throughCombat(s);
  eq([named(s, "Bear").length, named(s, "Ox").length], [1, 0],
    "CR 510.1c: a creature blocked by two divides its damage as its controller chooses -- all five to the second blocker and none to the first, with no order to follow");
}
{
  const s = battle(["Ghalta, Primal Hunger"], ["Bear", "Bear"]);
  attack(s, "Ghalta, Primal Hunger"); block(s, "Bear blocks Ghalta, Primal Hunger", "Bear blocks Ghalta, Primal Hunger"); toDivision(s);
  assert.throws(() => resolveAwaiting(s, [], [1, 2, 9]), /lethal/, "CR 702.19b: trample's excess waits for lethal on every blocker"); checks += 1;
  resolveAwaiting(s, [], [2, 2, 8]);
  throughCombat(s);
  eq([s.players[1].life, named(s, "Bear").length], [32, 0], "CR 702.19b: lethal to each blocker, then the rest to the player -- eight trample over");
}
{
  const s = battle(["Venom Wurm"], ["Ox", "Ox"]);
  attack(s, "Venom Wurm"); block(s, "Ox blocks Venom Wurm", "Ox blocks Venom Wurm"); toDivision(s);
  eq(awaitingChoice(s).options.map((o) => o.lethal), [1, 1, 0], "CR 702.2c: from a source with deathtouch, one damage is lethal damage");
  resolveAwaiting(s, [], [1, 1, 2]);
  throughCombat(s);
  eq([s.players[1].life, named(s, "Ox").length], [38, 0], "CR 702.2b, 702.19b: one to each 0/4 destroys both, and two trample over");
}
{
  const s = battle(["Brute"], ["Vampire Nighthawk", "Ajani's Pridemate"]);
  attack(s, "Brute"); block(s, "Vampire Nighthawk blocks Brute"); throughCombat(s);
  const pridemate = named(s, "Ajani's Pridemate")[0];
  eq([named(s, "Brute").length, named(s, "Vampire Nighthawk").length, s.players[1].life, s.objects[pridemate].counters["+1/+1"]], [0, 0, 42, 1],
    "CR 702.2b, 702.15b: the blocking Nighthawk's two deathtouch damage destroys the 5/5, its lifelink gains Maya two life as the damage is dealt, and \"whenever you gain life\" triggers once for that one event (Ajani's Pridemate: one counter)");
}
{
  /* Two red 2/2s attack Maya with Torbran and the Dictate out: two hits, each a choice of hers, both asked before either is
     dealt (CR 510.2), and then both dealt at once as she chose. */
  const s = battle(["Torbran, Thane of Red Fell", "Dictate of the Twin Gods", "Imp", "Imp"], []);
  resolveAwaiting(s, awaitingChoice(s).options.filter((o) => o.label.startsWith("Imp → ")).map((o) => o.index));
  onTo(s, (x) => x.awaiting?.kind === "order-damage");
  const first = awaitingChoice(s);
  eq([s.awaiting?.player, s.players[1].life, first.options.map((o) => o.label)], [1, 40, ["Torbran, Thane of Red Fell first: 8 damage", "Dictate of the Twin Gods first: 6 damage"]],
    "CR 616.1, 510.2: an attacking Imp's 2 to Maya, changed by Torbran and the Dictate -- she chooses the order before any combat damage is dealt");
  resolveAwaiting(s, [0]);
  eq([s.awaiting?.kind, s.players[1].life], ["order-damage", 40], "CR 510.2: the second Imp's hit is hers to order too, and still nothing has been dealt");
  resolveAwaiting(s, [1]);
  eq(s.players[1].life, 26, "CR 616.1, 510.2: then all of it at once, as she chose -- 8 and 6");
}
{
  const s = battle(["Duelist"], ["Bear"]);
  attack(s, "Duelist"); block(s, "Bear blocks Duelist"); throughCombat(s);
  eq([named(s, "Bear").length, s.objects[named(s, "Duelist")[0]].damage], [0, 0],
    "CR 702.7b, 510.4: first strike deals its damage in a step of its own -- the Bear dies before it can deal any back");
}
{
  const s = battle(["Twinblade"], []);
  attack(s, "Twinblade"); throughCombat(s);
  eq(s.players[1].life, 36, "CR 702.4b: double strike deals combat damage in both steps -- 2 and 2");
}
{
  const s = battle(["Baird, Steward of Argive"], []);
  attack(s, "Baird, Steward of Argive");
  eq(s.objects[named(s, "Baird, Steward of Argive")[0]].tapped, false, "CR 702.20b: attacking does not tap a creature with vigilance");
}
{
  const s = battle(["Sneak"], ["Bear", "Bear"]);
  attack(s, "Sneak");
  onTo(s, (x) => x.awaiting?.kind === "declare-blockers");
  const one = [indexOf(awaitingChoice(s), "Bear blocks Sneak")];
  assert.throws(() => resolveAwaiting(s, one), /menace/, "CR 702.111b: a creature with menace can't be blocked except by two or more creatures -- one blocker is refused"); checks += 1;
  resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index));
  eq(s.combat.attacks[0].blockers.length, 2, "CR 702.111b: and two are a legal block");
}
{
  /* Summoning sickness, and haste: a creature cast this turn is not offered as an attacker, unless it has haste. */
  const {state} = play("sick and hasty", [at(0, "battlefield", "Forest", "Forest", "Mountain"), at(0, "hand", "Bear", "Boss")],
    [{tap: "Forest"}, {tap: "Forest"}, {cast: "Bear"}, {resolve: true}, {tap: "Mountain"}, {cast: "Boss"}, {resolve: true}]);
  for (let n = 0; n < 50 && state.awaiting?.kind !== "declare-attackers"; n += 1) {
    if (state.priorityPlayer === null) advance(state); else if (passPriority(state).outcome === "step-ends") advance(state);
  }
  eq([...new Set(awaitingChoice(state).options.map((o) => state.objects[o.cardId].card))], ["Boss"],
    "CR 302.6, 702.10b: a creature that came under its controller's control this turn can't attack -- the Bear is not offered; the Boss, with haste, is");
}

/* ======== the stack and priority (CR 117, 601, 603, 608, 702) ======== */
{
  /* Two players' triggers from one death: the active player's go on the stack first, so the other's resolve first. */
  const {state} = play("APNAP", [at(0, "battlefield", "Mountain", "Bear", "Blood Artist"), at(1, "battlefield", "Blood Artist"), at(0, "hand", "Lightning Bolt")],
    [{tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{card: "Bear"}]}, {resolve: true},
      {expect: [{asks: {seat: 0, options: ["Rob", "Maya"]}}]}, {choose: ["Maya"]}, {expect: [{asks: {seat: 1, options: ["Rob", "Maya"]}}]}, {choose: ["Rob"]},
      {expect: [{stack: 2}]}]);
  eq(state.stack.map((e) => e.playerId), [0, 1],
    "CR 603.3b: triggers controlled by different players go on the stack in APNAP order -- Rob's (active) first, Maya's on top of it, so Maya's resolves first");
}
{
  const {state} = play("Counterspell", [at(0, "battlefield", "Mountain"), at(0, "hand", "Lightning Bolt"), at(1, "battlefield", "Island", "Island"), at(1, "hand", "Counterspell")],
    [{tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{player: 1}]}, {pass: 1}, {tap: "Island", seat: 1}, {tap: "Island", seat: 1},
      {cast: "Counterspell", seat: 1, targets: [{card: "Lightning Bolt"}]}, {resolve: true}, {expect: [{stack: 0}, {seat: 0, zone: "graveyard", cards: ["Lightning Bolt"]}]}]);
  eq(state.players[1].life, 40, "CR 701.6a, 608.2b: a countered spell does nothing, and its card goes to its owner's graveyard");
}
{
  const {state} = play("flashback countered", [at(0, "battlefield", "Mountain", "Mountain", "Mountain"), at(0, "graveyard", "Faithless Looting"),
    at(1, "battlefield", "Island", "Island"), at(1, "hand", "Counterspell")],
  [{tap: "Mountain"}, {tap: "Mountain"}, {tap: "Mountain"}, {cast: "Faithless Looting"}, {pass: 1}, {tap: "Island", seat: 1}, {tap: "Island", seat: 1},
    {cast: "Counterspell", seat: 1, targets: [{card: "Faithless Looting"}]}, {resolve: true}]);
  eq([objectsNamed(state, "Faithless Looting").map((o) => o.zone)], [["exile"]],
    "CR 702.34a: a spell cast with flashback is exiled whenever it would leave the stack -- countered, it goes to exile, not back to the graveyard");
}
{
  /* Ward: the spell aimed at it is countered unless its controller pays -- not paid, and paid. */
  const ward = (pays) => play(`ward ${pays ? "paid" : "not paid"}`, [at(0, "battlefield", "Mountain", ...(pays ? ["Wastes", "Wastes"] : [])), at(0, "hand", "Lightning Bolt"),
    at(1, "battlefield", "Hulking Raptor")],
  [{tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{card: "Hulking Raptor"}]}, {resolve: true},
    {expect: [{asks: {seat: 0, options: pays ? ["Pay {2}", "Don't pay"] : ["Don't pay"]}}]}, {choose: [pays ? "Pay {2}" : "Don't pay"]},
    ...(pays ? [{resolve: true}] : [])]).state;
  const unpaid = ward(false), paid = ward(true);
  eq([objectsNamed(unpaid, "Hulking Raptor").map((o) => o.zone), objectsNamed(unpaid, "Lightning Bolt").map((o) => o.zone), objectsNamed(paid, "Hulking Raptor").map((o) => o.zone)],
    [["battlefield"], ["graveyard"], ["graveyard"]],
    "CR 702.21a: ward counters the spell that targets it unless its controller pays -- not paid, the Bolt is countered and the Raptor lives; paid, the Bolt resolves and the 5/3 dies");
}
{
  /* An instant in an opponent's end step: every step but untap and cleanup gives priority (CR 117.3a, 513.2). */
  const {state} = play("end-step Bolt", [at(1, "battlefield", "Mountain"), at(1, "hand", "Lightning Bolt")],
    [{to: {turn: 1, phase: "END_OF_TURN"}}, {pass: 1}, {tap: "Mountain", seat: 1}, {cast: "Lightning Bolt", seat: 1, targets: [{player: 0}]}, {resolve: true}]);
  eq([state.phase, state.players[0].life], ["END_OF_TURN", 37], "CR 513.2, 117.3a: in Rob's end step Maya receives priority and casts an instant -- Bolt resolves before the turn ends");
}
{
  const {state} = play("Mana Leak not paid", [at(0, "battlefield", "Forest", "Forest"), at(0, "hand", "Bear"), at(1, "battlefield", "Island", "Island"), at(1, "hand", "Mana Leak")],
    [{tap: "Forest"}, {tap: "Forest"}, {cast: "Bear"}, {pass: 1}, {tap: "Island", seat: 1}, {tap: "Island", seat: 1}, {cast: "Mana Leak", seat: 1, targets: [{card: "Bear"}]},
      {resolve: true}, {expect: [{asks: {seat: 0, options: ["Don't pay"]}}]}, {choose: ["Don't pay"]}]);
  eq(objectsNamed(state, "Bear").map((o) => o.zone), ["graveyard"], "CR 118.12: \"counter target spell unless its controller pays {3}\" -- Rob cannot pay, and the Bear is countered");
}

/* ======== replacement effects (CR 614, 616) ======== */
{
  /* Exiled instead of dying: it never died, so nothing that watches for a death sees one. */
  const {state} = play("Liesa", [at(0, "battlefield", "Liesa, Forgotten Archangel", "Mountain"), at(0, "hand", "Lightning Bolt"), at(1, "battlefield", "Bear", "Blood Artist")],
    [{tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{card: "Bear"}]}, {resolve: true}]);
  eq([objectsNamed(state, "Bear").map((o) => o.zone), state.stack.length, state.awaiting], [["exile"], 0, null],
    "CR 614.6: a creature that would die and is exiled instead did not die -- Maya's Blood Artist does not trigger");
}
{
  const {state} = play("two Liesas", [at(0, "battlefield", "Liesa, Forgotten Archangel", "Mountain"), at(1, "battlefield", "Liesa, Forgotten Archangel"),
    at(2, "battlefield", "Bear"), at(0, "hand", "Lightning Bolt")],
  [{tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{card: "Bear"}]}, {resolve: true}], {seats: 3});
  eq([objectsNamed(state, "Bear").map((o) => o.zone), state.awaiting], [["exile"], null],
    "CR 616.1: two replacement effects that end the same either way (two players' \"exile it instead\") need no choice -- exiled, and nobody is asked");
}
{
  const setup = [at(0, "battlefield", "Torbran, Thane of Red Fell", "Dictate of the Twin Gods", "Mountain"), at(0, "hand", "Lightning Bolt")];
  const bolt = [{tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{player: 1}]}, {resolve: true}];
  const {state} = play("a doubler and a plus two", setup, bolt);
  const choice = awaitingChoice(state);
  eq([state.awaiting?.player, state.players[1].life, choice.title, choice.options.map((o) => o.label)],
    [1, 40, "3 damage from Lightning Bolt to Maya: which applies first?", ["Torbran, Thane of Red Fell first: 10 damage", "Dictate of the Twin Gods first: 8 damage"]],
    "CR 616.1: Torbran's plus two and the Dictate's doubling would both change the Bolt's 3, and the order changes how it ends -- so Maya, the player hit, chooses which applies first, before any of it is dealt, each way said by where it leads");
  eq(choice.options.map((o) => play(`the Bolt, ${o.label}`, setup, [...bolt, {choose: [o.label]}]).state.players[1].life), [30, 32],
    "CR 616.1: and it is dealt as she chose -- Torbran's first, 3 plus 2 doubled is 10; the Dictate's first, 3 doubled plus 2 is 8");
  const same = play("a doubler and a tripler", [at(0, "battlefield", "Fiery Emancipation", "Dictate of the Twin Gods", "Mountain"), at(0, "hand", "Lightning Bolt")], bolt).state;
  eq([same.awaiting, same.players[1].life], [null, 22], "CR 616.1: doubled and tripled is 18 in either order, so nobody is asked");
}

/* ======== the turn (CR 103, 104, 106, 500, 514) ======== */
{
  const rng = createRng("mulligans");
  const s = createState({matchId: "m", seed: "mulligans", players: ["Rob", "Maya", "Trey", "Sam"].map((name) => ({name}))});
  for (let seat = 0; seat < 4; seat += 1) for (let i = 0; i < 30; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginMulligans(s, rng);
  const asked = [];
  let robMulligans = 0;
  for (let n = 0; n < 40 && !mulligansDone(s); n += 1) {
    const choice = awaitingChoice(s);
    asked.push(`${s.awaiting.player}:${s.awaiting.kind}`);
    if (s.awaiting.kind === "mulligan-decision") resolveAwaiting(s, [s.awaiting.player === 0 && robMulligans < 2 ? (robMulligans += 1, 1) : 0], null, rng);
    else resolveAwaiting(s, choice.options.slice(0, choice.min).map((o) => o.index), null, rng);
  }
  eq([cardsIn(s, "hand", 0).length, cardsIn(s, "hand", 1).length, asked.filter((a) => a === "0:mulligan-bottom").length], [6, 7, 1],
    "CR 103.5, 103.5c: a London mulligan, the first free in a multiplayer game -- Rob mulligans twice and keeps six (one on the bottom); the others keep seven");
}
{
  const two = play("two players", [], [], {seats: 2}).state, four = play("four players", [], [], {seats: 4}).state;
  eq([cardsIn(two, "hand", 0).length, cardsIn(four, "hand", 0).length], [0, 1],
    "CR 103.8a: the player who goes first skips the first draw only in a two-player game -- in four-player Commander they draw");
}
{
  const {state} = play("the pool empties", [at(0, "battlefield", "Mountain")], [{tap: "Mountain"}, {expect: [{seat: 0, pool: {R: 1}}]}, {to: {turn: 1, phase: "COMBAT_BEGIN"}}]);
  eq(state.players[0].manaPool.R, 0, "CR 106.4, 500.4: unspent mana empties from a pool at the end of each step and phase");
}
{
  const {state} = play("damage wears off", [at(0, "battlefield", "Mountain"), at(0, "hand", "Lightning Bolt"), at(1, "battlefield", "Ox")],
    [{tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{card: "Ox"}]}, {resolve: true}, {to: {turn: 2, phase: "UPKEEP"}}]);
  eq(state.objects[objectsNamed(state, "Ox")[0].id].damage, 0, "CR 514.2: damage marked on a permanent is removed in the cleanup step -- the 0/4 that took three is undamaged next turn");
}
{
  const {state} = play("hand size", [at(0, "hand", ...Array(9).fill("Bear"))], [{to: {turn: 1, phase: "CLEANUP"}}, {expect: [{asks: {seat: 0, min: 2}}]}]);
  eq(state.awaiting?.kind, "discard-to-hand-size", "CR 514.1: in the cleanup step the active player discards down to seven -- nine cards, two discarded");
}
{
  const s = createState({matchId: "m", seed: "draw", players: [{name: "Rob"}, {name: "Maya"}]});
  beginGame(s);
  s.players[0].life = 0; s.players[1].life = 0;
  checkStateBasedActions(s);
  eq(gameOver(s), {winner: null, reason: "all players lost"}, "CR 104.4a: if every player loses at once, the game is a draw");
}
{
  /* Each player sacrifices a creature: chosen in turn, then sacrificed together. */
  const {state} = play("Fleshbag Marauder", [at(0, "battlefield", "Swamp", "Swamp", "Swamp", "Bear"), at(0, "hand", "Fleshbag Marauder"), at(1, "battlefield", "Bear")],
    [{tap: "Swamp"}, {tap: "Swamp"}, {tap: "Swamp"}, {cast: "Fleshbag Marauder"}, {resolve: true}, {resolve: true},
      {expect: [{asks: {seat: 0, options: ["Bear", "Fleshbag Marauder"]}}]}, {choose: ["Bear"]},
      {expect: [{asks: {seat: 1, options: ["Bear"]}}, {seat: 0, zone: "battlefield", cards: ["Swamp", "Swamp", "Swamp", "Bear", "Fleshbag Marauder"]}]}, {choose: ["Bear"]}]);
  eq(objectsNamed(state, "Bear").map((o) => o.zone), ["graveyard", "graveyard"],
    "CR 101.4, 701.21a: each player chooses in turn order -- Rob's Bear still on the battlefield while Maya chooses -- and then both are sacrificed at once");
}

/* ======== invariants over whole games ========
   Seeded four-seat games of house pilots on random decks of the engine's own definitions (the review's probe R, smaller),
   checked after every action and every answer -- whatever the cards, these hold at every moment:
     one object, one zone (CR 400.1, 400.7): every object is listed in exactly the zone it says it is in;
     a token is nowhere but the battlefield whenever a player could act (CR 704.5d, 111.7);
     nothing on the stack is controlled by a player who has left the game (CR 800.4a);
     life moves only through logged events, each beginning where the last ended (CR 119);
     the commander-damage tally is exactly the combat damage each commander dealt each player (CR 903.10a). */
{
  const playable = index.names.filter((n) => index.resolve(n)?.playable === true);
  const defs = new Map(playable.map((n) => [n, definition(n)]));
  const isLand = (d) => (d.types ?? []).includes("Land");
  const spells = playable.filter((n) => { const d = defs.get(n); return !isLand(d) && d.manaCost && !(d.types ?? []).includes("Planeswalker"); });
  const lands = playable.filter((n) => isLand(defs.get(n)));
  /* Its commanders creatures of mana value 4 or less, cast early and in combat by turn 24, so that commander damage -- one
     invariant below -- is dealt to be checked. */
  const cheap = (d) => (String(d.manaCost || "").match(/\{([^}]+)\}/g) || []).reduce((n, sym) => n + (/^\d+$/.test(sym.slice(1, -1)) ? Number(sym.slice(1, -1)) : sym === "{X}" ? 0 : 1), 0) <= 4;
  const commanders = playable.filter((n) => commanderLegal(defs.get(n)) && (defs.get(n).types ?? []).includes("Creature") && cheap(defs.get(n)));
  const BASICS = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
  const basicLand = (name) => ({types: ["Land"], supertypes: ["Basic"], subtypes: [name], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {[{Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G"}[name]]: 1}}]});
  const cardOf = (name) => (BASICS.includes(name) ? basicLand(name) : defs.get(name));

  function invariantGame(seed, turns) {
    const r = createRng(`conformance-${seed}`);
    const pick = (list) => list[r.int(list.length)];
    const state = createState({matchId: `c${seed}`, seed: `conformance-${seed}`, players: ["Rob", "Maya", "Trey", "Sam"].map((name) => ({name}))});
    for (let seat = 0; seat < 4; seat += 1) {
      const put = (name, zone) => addObject(state, {...cardOf(name), card: name, owner: seat, controller: seat, ...(zone === "command" ? {commander: true} : {})}, zone, seat);
      put(pick(commanders), "command");
      for (let i = 0; i < 26; i += 1) put(pick(spells), "library");
      for (let i = 0; i < 4; i += 1) put(pick(lands), "library");
      for (let i = 0; i < 30; i += 1) put(pick(BASICS), "library");
    }
    /* The facts the room gives its pilots (room.mjs, factsFrom): what anyone reads off the card. */
    const manaValue = (cost) => (String(cost || "").match(/\{([^}]+)\}/g) || []).reduce((n, sym) => n + (/^\d+$/.test(sym.slice(1, -1)) ? Number(sym.slice(1, -1)) : sym === "{X}" ? 0 : 1), 0);
    const facts = (name) => { const d = cardOf(name); return d ? {manaValue: manaValue(d.manaCost), types: d.types ?? [], power: d.power ?? null, toughness: d.toughness ?? null, ...(/\{X\}/.test(d.manaCost ?? "") ? {x: true} : {})} : null; };
    const pilots = [0, 1, 2, 3].map((seat) => housePilot({seat, cards: facts}));
    const life = state.players.map((p) => p.life);
    const keyOfId = new Map(), dealt = new Map();
    let refused = 0, combat = 0, resolved = 0, deaths = 0;
    const seen = (events) => {
      for (const o of Object.values(state.objects)) if (o.commander === true) keyOfId.set(o.id, commanderKeyOf(o));
      for (const e of events ?? []) {
        const f = e.data?.fields ?? {};
        if (e.kind === "GameEventPlayerLivesChanged") {
          const p = f.player.playerId;
          assert.equal(f.oldLives, life[p], `seed ${seed}: a life change begins where the last ended (CR 119)`);
          life[p] = f.newLives;
        }
        if (e.kind === "GameEventPlayerDamaged" && f.combat === true) combat += 1;
        if (e.kind === "GameEventSpellResolved") resolved += 1;
        if (e.kind === "GameEventCardChangeZone" && f.from?.zoneType === "Battlefield" && f.to?.zoneType === "Graveyard") deaths += 1;
        if (e.kind === "GameEventPlayerDamaged" && f.combat === true && f.source && keyOfId.has(f.source.cardId)) {
          const k = `${f.target.playerId}|${keyOfId.get(f.source.cardId)}`;
          dealt.set(k, (dealt.get(k) ?? 0) + f.amount);
        }
      }
      check();
    };
    function check() {
      const where = new Map();
      for (const [zone, lists] of Object.entries(state.zones)) for (const list of Array.isArray(lists[0]) || lists.every((x) => Array.isArray(x)) ? lists : [lists])
        for (const id of list) {
          assert.ok(!where.has(id), `seed ${seed}: object ${id} is in two zones (CR 400.1)`);
          where.set(id, zone);
          assert.equal(state.objects[id]?.zone, zone, `seed ${seed}: object ${id} is listed in ${zone} and says ${state.objects[id]?.zone}`);
        }
      assert.equal(where.size, Object.keys(state.objects).length, `seed ${seed}: every object is in a zone`);
      if (state.priorityPlayer !== null && !state.awaiting)
        for (const o of Object.values(state.objects)) if (o.token === true) assert.equal(o.zone, "battlefield", `seed ${seed}: a token in ${o.zone} while ${state.players[state.priorityPlayer].name} could act (CR 704.5d)`);
      for (const entry of state.stack) assert.ok(!state.players[entry.playerId]?.lost, `seed ${seed}: the stack holds something of a player who has left the game (CR 800.4a)`);
      state.players.forEach((p, i) => assert.equal(p.life, life[i], `seed ${seed}: ${p.name}'s life moved without a logged event`));
      for (const p of state.players) for (const [key, n] of Object.entries(p.commanderDamage))
        assert.equal(n, dealt.get(`${p.id}|${key}`) ?? 0, `seed ${seed}: ${p.name}'s tally for ${key} is the combat damage that commander dealt (CR 903.10a)`);
    }
    const answer = (seat, choice) => {
      const a = pilots[seat].answer(projectFor(state, seat), choice);
      try { return resolveAwaiting(state, a.indices, a.amounts, rng, a); } catch {
        refused += 1;
        const least = leastAnswer(choice);
        return resolveAwaiting(state, least.indices, least.amounts, rng, least);
      }
    };
    const rng = createRng(`game-${seed}`);
    seen(beginMulligans(state, rng));
    for (let n = 0; n < 200 && !mulligansDone(state); n += 1) seen(answer(state.awaiting.player, awaitingChoice(state)));
    seen(beginGame(state));
    let steps = 0;
    while (state.turn <= turns && !gameOver(state) && steps < 60000) {
      steps += 1;
      if (state.awaiting) { seen(answer(state.awaiting.player, awaitingChoice(state))); continue; }
      if (state.priorityPlayer === null) { seen(advance(state)); continue; }
      const seat = state.priorityPlayer, actions = legalActions(state, seat);
      const chosen = pilots[seat].choose(projectFor(state, seat), actions);
      if (chosen.kind === "pass") { const out = passPriority(state, null, rng); seen(out.events); if (out.outcome === "step-ends") seen(advance(state)); }
      else seen(applyAction(state, seat, chosen));
    }
    const tallied = state.players.reduce((n, p) => n + Object.values(p.commanderDamage).reduce((a, b) => a + b, 0), 0);
    return {steps, turn: state.turn, refused, over: gameOver(state), combat, resolved, deaths, tallied};
  }
  /* Games that did nothing would prove nothing: these resolve spells, fight, kill, and hit players with commanders. The decks
     are dealt from every definition, so each card added deals different games: four are played, and more, up to eight, only
     until together they have done all of that -- a check that holds only of games where it was exercised says nothing. */
  const runs = [];
  const sum = (key) => runs.reduce((n, g) => n + g[key], 0);
  const exercised = () => sum("resolved") > 20 && sum("combat") > 20 && sum("deaths") > 0 && sum("tallied") > 0;
  for (let seed = 1; seed <= 8 && (runs.length < 4 || !exercised()); seed += 1) runs.push(invariantGame(seed, 24));
  measured = `${runs.length} four-seat games of 24 turns, ${sum("steps")} steps: ${sum("resolved")} resolutions, ${sum("combat")} combat hits on players, ${sum("deaths")} deaths, ${sum("tallied")} commander damage tallied`;
  ok(sum("resolved") > 20 && sum("combat") > 20 && sum("deaths") > 0 && sum("tallied") > 0,
    `the invariants held at every step of ${runs.length} four-seat games of 24 turns: ${sum("steps")} steps, ${sum("resolved")} spells and abilities resolved, ${sum("combat")} combat hits on players, ${sum("deaths")} creatures died, ${sum("tallied")} commander damage tallied${sum("refused") ? `, ${sum("refused")} pilot answers refused and answered least` : ""}`);
}

console.log(`engine-rules-conformance: ${checks} checks passed -- the commander, state-based actions, combat, the stack, replacement effects and the turn, each held to its rule by number; and the invariants at every step of ${measured}.`);
