/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE PLAN'S X11, TRAIN B'S SECOND WORKER: WHAT ITS CARDS' SCENARIOS CANNOT REACH.
 *
 * Twenty-one cards of the rest of Rob's seven decks, each written from its oracle text with rules the engine already had,
 * and one thing it lacked for them: Topiary Stomper's "can't ... block unless you control seven or more lands" is a rule
 * static `cant-block` on a condition, which rules/combat.mjs's canBlock reads through rules/statics.mjs's ruleChanged (it
 * asks every rule's condition) -- and which the card compiler had refused as a condition nothing reads (cards/index.mjs,
 * RULES_READING_A_CONDITION). A scenario never declares blockers, and "cannot attack" is no step a scenario can take, so
 * both restrictions are held here, at six lands and at seven (CR 508.1c, 509.1b). And two things a scenario cannot pick:
 * which of Plaza of Heroes' two abilities makes a {W} (the one "among legendary permanents you control" pays for anything;
 * the other only for a legendary spell, CR 106.6), and Purphoros, God of the Forge declared as an attacker only while it
 * is a creature (its devotion to red five or more, CR 700.5; layer 4, CR 613.1d).
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {canBlock} from "../game/engine/rules/combat.mjs";
import {typesOf} from "../game/engine/rules/layers.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const rng = createRng("x11-b2");
const TS = "Topiary Stomper", PURPHOROS = "Purphoros, God of the Forge", PLAZA = "Plaza of Heroes";
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{G}", colors: ["G"], power: 2, toughness: 2},
  Ogre: {types: ["Creature"], subtypes: ["Ogre"], manaCost: "{R}{R}", colors: ["R"], power: 2, toughness: 2},
  Squire: {types: ["Creature"], subtypes: ["Human"], manaCost: "{W}", colors: ["W"], power: 1, toughness: 1},
  Saint: {types: ["Creature"], subtypes: ["Human"], supertypes: ["Legendary"], manaCost: "{W}", colors: ["W"], power: 1, toughness: 1},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup) => runScenario({name: "x11-b2", setup, steps: []}, index.definition, FIX).state;
const idOf = (s, card, seat = 0) => s.zones.battlefield.find((id) => s.objects[id].card === card && s.objects[id].controller === seat);
const labels = (s) => awaitingChoice(s).options.map((o) => o.label);
/* On to a question of this kind, as the room plays the game: declarations answered with nobody, triggers in the order offered. */
function goToQuestion(s, kind) {
  for (let n = 0; n < 3000; n += 1) {
    if (s.awaiting?.kind === kind) return;
    if (s.awaiting) {
      const k = s.awaiting.kind;
      if (k === "order-triggers") resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index));
      else if (k === "declare-attackers" || k === "declare-blockers") resolveAwaiting(s, []);
      else throw new Error(`asked ${k}`);
    } else if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s, null, rng).outcome === "step-ends") advance(s);
  }
  throw new Error(`never asked ${kind}`);
}
const forests = (n) => Array.from({length: n}, () => "Forest");

/* ---- Topiary Stomper: "can't attack or block unless you control seven or more lands" ---- */
{
  /* A Bear beside it, so there is an attack to declare and the question is asked (CR 508.1). */
  const six = table([at(0, "battlefield", TS, "Bear", ...forests(6))]);
  goToQuestion(six, "declare-attackers");
  eq(labels(six), ["Bear → Maya"], "six lands: Topiary Stomper is not among the creatures that may attack");
  const seven = table([at(0, "battlefield", TS, "Bear", ...forests(7))]);
  goToQuestion(seven, "declare-attackers");
  eq(labels(seven), [`${TS} → Maya`, "Bear → Maya"], "seven lands: it may");
  /* An opponent's land is not one Rob controls: six of his and one of Maya's are six. */
  const theirs = table([at(0, "battlefield", TS, "Bear", ...forests(6)), at(1, "battlefield", "Forest")]);
  goToQuestion(theirs, "declare-attackers");
  eq(labels(theirs), ["Bear → Maya"], "six of Rob's lands and one of Maya's: still six he controls");
}
for (const [lands, may] of [[6, false], [7, true]]) {
  /* Maya's Bear attacks Rob on her turn; Rob is asked who blocks. */
  const s = table([at(0, "battlefield", TS, ...forests(lands)), at(1, "battlefield", "Bear")]);
  /* Rob declares no attack on his turn, if he is asked at all; then Maya's. */
  goToQuestion(s, "declare-attackers");
  if (s.activePlayer === 0) { resolveAwaiting(s, []); goToQuestion(s, "declare-attackers"); }
  eq([s.turn, s.activePlayer], [2, 1], "Maya's turn, her declaration");
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === "Bear → Rob").index]);
  goToQuestion(s, "declare-blockers");
  eq([s.awaiting.player, labels(s).includes(`${TS} blocks Bear`)], [0, may], `${lands} lands: Topiary Stomper ${may ? "may" : "can't"} block the Bear`);
  eq(canBlock(s, idOf(s, TS), 0), may, `${lands} lands: canBlock says the same`);
}
{
  /* The condition is the rule's own, asked each time: a land played makes the seventh. */
  const s = table([at(0, "battlefield", TS, ...forests(6)), at(0, "hand", "Forest")]);
  ok(!canBlock(s, idOf(s, TS), 0), "six lands: can't block");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "play-land"));
  ok(canBlock(s, idOf(s, TS), 0), "the seventh played: it can");
}

/* The compiler: a condition on "can't block" is read, so it is taken; on a rule that reads none, still refused. */
{
  const script = (rule) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "t", types: ["Creature"], manaCost: "{1}", power: 1, toughness: 1}, oracleText: "x",
    abilities: [{kind: "static", text: "x", rule, affects: {what: "permanent", self: true}, condition: {present: {what: "permanent", types: ["Land"], controller: "you"}, atMost: 6}}]});
  const block = compileScript(script("cant-block"));
  eq([block.problems, block.definition?.abilities[0].condition.atMost], [[], 6], "cant-block on a condition: compiled, its condition kept");
  const unblockable = compileScript(script("cant-be-blocked"));
  eq([unblockable.definition, unblockable.problems.some((p) => /condition or a graveyard on a rule static/.test(p))], [null, true],
    "cant-be-blocked on a condition, which nothing reads: refused");
  ok(index.resolve(TS)?.playable === true, "Topiary Stomper is playable");
}

/* ---- Plaza of Heroes: two ways to make {W}, and only one of them pays for a nonlegendary spell ---- */
{
  const ways = (s) => legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.label === PLAZA && JSON.stringify(a.mana) === JSON.stringify({W: 1}));
  const s = table([at(0, "battlefield", PLAZA, "Saint"), at(0, "hand", "Squire")]);
  eq(ways(s).map((a) => a.abilityId).sort(), ["a1", "a2"], "with the white legendary Saint: {W} from the restricted ability and from the one among legendary permanents");
  applyAction(s, 0, ways(s).find((a) => a.abilityId === "a1"));
  eq(legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === "Squire").length, 0, "the restricted {W}: no Squire, which is not legendary");
  const t = table([at(0, "battlefield", PLAZA, "Saint"), at(0, "hand", "Squire")]);
  applyAction(t, 0, ways(t).find((a) => a.abilityId === "a2"));
  const cast = legalActions(t, 0).find((a) => a.kind === "cast" && a.label === "Squire");
  ok(cast !== undefined, "the {W} among legendary permanents: the Squire may be cast with it");
  applyAction(t, 0, cast);
  eq(t.players[0].manaPool.W ?? 0, 0, "and it was spent on it");
  const none = table([at(0, "battlefield", PLAZA, "Bear")]);
  eq(legalActions(none, 0).filter((a) => a.kind === "activate-mana" && a.abilityId === "a2").length, 0, "no legendary permanent: the third ability adds nothing (CR 106.7)");
}

/* ---- Purphoros, God of the Forge: an attacker only while its devotion to red makes it a creature ---- */
{
  const low = table([at(0, "battlefield", PURPHOROS, "Ogre")]);
  eq(typesOf(low, idOf(low, PURPHOROS)), ["Enchantment"], "devotion three: an enchantment only");
  goToQuestion(low, "declare-attackers");
  eq(labels(low), ["Ogre → Maya"], "and not among the attackers");
  const high = table([at(0, "battlefield", PURPHOROS, "Ogre", "Ogre")]);
  eq(typesOf(high, idOf(high, PURPHOROS)).sort(), ["Creature", "Enchantment"], "devotion five: an enchantment creature");
  goToQuestion(high, "declare-attackers");
  ok(labels(high).includes(`${PURPHOROS} → Maya`), "and it may attack");
  const stolen = table([at(0, "battlefield", PURPHOROS, "Ogre"), at(1, "battlefield", "Ogre")]);
  eq(typesOf(stolen, idOf(stolen, PURPHOROS)), ["Enchantment"], "Maya's Ogre is no devotion of Rob's: still three");
}

for (const name of ["Mogg Raider", "Mogg War Marshal", "Moonlit Lamenter", "Obyra, Dreaming Duelist", "Paradise Druid", "Peppersmoke", "Perpetual Timepiece",
  PLAZA, "Pollenbright Druid", PURPHOROS, "Ravenous Chupacabra", "Reconstruct History", "Scion of Oona", "Selfless Savior", "Springbloom Druid", "The Black Arrow",
  "Thornbite Staff", TS, "Wall of Limbs", "Wall of Resurgence", "Whitemane Lion"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-cards-x11-b2: ${checks} checks passed -- can't attack or block unless seven lands, at six and at seven, both ways; a condition on "can't block" compiled; Plaza of Heroes' two {W}s; Purphoros an attacker only at devotion five.`);
