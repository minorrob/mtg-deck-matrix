/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* LEAVING COMBAT AS CONTROL CHANGES (CR 506.4), AND THE MONARCH (CR 725) -- Train E, for Ginger, Queen of Sweets and Tamiyo,
 * Upriser Crowned of Rob's v43 library.
 *
 * What the cards' scenarios (game/engine/cards/<letter>/*.scenarios.json) cannot reach:
 *   1. CR 506.4 (rules/combat.mjs removeFromCombat; effects/permanents.mjs gainControl and endControlChange): an attacker taken
 *      as attackers are declared ("Threaten" in response), a blocker taken after blocks -- the attacker it blocked stays
 *      blocked (509.1h), its damage through only with trample (702.19d) -- an exchange in combat (Oko's -5's), and a creature
 *      given back mid-combat as the effect or the Aura that held it ends. Neither deals or is dealt combat damage.
 *   2. The monarch (CR 725): a designation of the game, one player's at a time (725.3; effects/resources.mjs crown); its two
 *      triggers, the game's own, with no source, controlled by the monarch as they trigger (725.2; rules/trigger.mjs), on the
 *      stack and answered as any is; a monarch who leaves the game (725.4; rules/sba.mjs monarchLeft) on their own turn and on
 *      another's, with the active player leaving too, and nobody left; two players and four.
 *   3. Its words: `becomeMonarch` (vocabulary, schema, the catalog's credit), the condition `monarch`, "while you're the
 *      monarch" (Tamiyo), the view's `monarch` (projection.mjs) and the history's line (game/room/history.mjs).
 */
import {play, drive, happen, at, idOf, compiled, checks, creature, index} from "./helpers/x11-keywords.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {controllerOf} from "../game/engine/rules/layers.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {concede, checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {canBlockAttacker} from "../game/engine/keywords/combat.mjs";
import {historyLines} from "../game/room/history.mjs";
import {ALL_PRIMITIVES, PRIMITIVES} from "../game/engine/vocabulary.mjs";
import {EFFECTS} from "../game/engine/script/effects/index.mjs";
import {INHERENT_TRIGGERS, MONARCH_NAME} from "../game/engine/rules/trigger.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {FORGE_API, FORGE_COUNTS} from "../game/tools/engine-constructs.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {createRng} from "../game/engine/rng.mjs";

const {eq, ok, done} = checks("engine-monarch");
const GQ = "Ginger, Queen of Sweets", TU = "Tamiyo, Upriser Crowned";
const FIX = {
  Ogre: creature(["Ogre"], 4, 4, {colors: ["R"]}),
  Trampler: creature(["Wurm"], 4, 4, {keywords: ["Trample"]}),
  Killer: creature(["Warrior"], 4, 1, {colors: ["B"]}),
  Raider: creature(["Goblin"], 3, 3, {keywords: ["Haste"], colors: ["R"]}),
  Striker: creature(["Knight"], 2, 2, {keywords: ["First Strike"], colors: ["W"]}),
  "Hasty Goblin": creature(["Goblin"], 1, 1, {keywords: ["Haste"], colors: ["R"]}),
};
const ME = {controller: 0, source: null}, MAYA = {controller: 1, source: null};
const life = (s, seat) => projectFor(s, 0).players[seat].life;
const attackers = (s) => (s.combat?.attacks ?? []).map((a) => s.objects[a.attacker]?.card);
const blockersOf = (s, name) => (s.combat?.attacks.find((a) => s.objects[a.attacker]?.card === name)?.blockers ?? []).map((id) => s.objects[id].card);
const damageOn = (s, name) => s.objects[idOf(s, name)].damage ?? 0;
const toEndOfCombat = (s) => drive(s, (st) => st.phase === "COMBAT_END");
/* Who is the monarch, as the view says (projection.mjs): a seat, or null. */
const monarchSeen = (s, viewer = 0) => projectFor(s, viewer).players.filter((p) => p.monarch === true).map((p) => p.playerId);
const crowned = (s) => (Number.isInteger(s.monarch) ? s.monarch : null);

/* ======================================== 1. CR 506.4 ======================================== */

/* ---- an attacker taken as attackers are declared ("Threaten" in response): out of combat, and nothing dealt ---- */
{
  const s = play([at(0, "battlefield", "Bear", "Ogre")], [{attack: ["Bear", "Ogre"]}], {}, FIX);
  eq([s.phase, attackers(s)], ["COMBAT_DECLARE_ATTACKERS", ["Bear", "Ogre"]], "Rob attacks Maya with the Bear and the Ogre");
  happen(s, {effect: "gainControl", targets: [idOf(s, "Ogre")], until: "end-of-turn"}, MAYA);
  eq([controllerOf(s, idOf(s, "Ogre")), attackers(s)], [1, ["Bear"]], "Maya takes the Ogre until end of turn: it is out of combat (CR 506.4)");
  toEndOfCombat(s);
  eq([life(s, 1), life(s, 0)], [38, 40], "only the Bear's 2 reach Maya; the Ogre, hers now, deals no combat damage to anyone");
  ok(s.objects[idOf(s, "Ogre")].tapped, "it stays tapped from attacking (CR 506.4b is about tapping, not control)");
}
/* ---- an unblocked attacker taken in the declare blockers step ---- */
{
  const s = play([at(0, "battlefield", "Ogre")], [{attack: ["Ogre"]}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}], {}, FIX);
  happen(s, {effect: "gainControl", targets: [idOf(s, "Ogre")], until: "end-of-turn"}, MAYA);
  eq(s.combat.attacks, [], "an unblocked Ogre taken after blocks: no attack is left");
  toEndOfCombat(s);
  eq(life(s, 1), 40, "and Maya is dealt nothing");
}
/* ---- a blocker taken after blocks: the attacker stays blocked (CR 509.1h), and neither deals or is dealt damage ---- */
{
  const s = play([at(0, "battlefield", "Ogre"), at(1, "battlefield", "Bear")], [{attack: ["Ogre"]}, {block: [["Bear", "Ogre"]]}], {}, FIX);
  eq(blockersOf(s, "Ogre"), ["Bear"], "Maya's Bear blocks the Ogre");
  happen(s, {effect: "gainControl", targets: [idOf(s, "Bear")], until: "end-of-turn"}, ME);
  const attack = s.combat.attacks[0];
  eq([attack.blocked, attack.blockers, controllerOf(s, idOf(s, "Bear"))], [true, [], 0], "Rob takes the Bear: it blocks nothing, and the Ogre is still blocked (CR 509.1h)");
  toEndOfCombat(s);
  eq([life(s, 1), damageOn(s, "Bear"), damageOn(s, "Ogre")], [40, 0, 0], "no damage to Maya, none to the Bear, none from it");
}
{
  /* With trample, a blocked creature with nothing left blocking it assigns all its damage to the player (CR 702.19d). */
  const s = play([at(0, "battlefield", "Trampler"), at(1, "battlefield", "Bear")], [{attack: ["Trampler"]}, {block: [["Bear", "Trampler"]]}], {}, FIX);
  happen(s, {effect: "gainControl", targets: [idOf(s, "Bear")], until: "end-of-turn"}, ME);
  toEndOfCombat(s);
  eq([life(s, 1), damageOn(s, "Bear")], [36, 0], "a trampler whose blocker was taken: all 4 to Maya");
}
{
  /* A blocked attacker taken: its blocker blocks nothing now, and is dealt nothing. */
  const s = play([at(0, "battlefield", "Bear"), at(1, "battlefield", "Squirrel")], [{attack: ["Bear"]}, {block: [["Squirrel", "Bear"]]}], {}, FIX);
  happen(s, {effect: "gainControl", targets: [idOf(s, "Bear")], until: "end-of-turn"}, MAYA);
  eq(s.combat.attacks, [], "the Bear Maya took is out of combat, and with it the block on it");
  toEndOfCombat(s);
  eq([damageOn(s, "Squirrel"), damageOn(s, "Bear"), life(s, 1)], [0, 0, 40], "the Squirrel and the Bear deal each other nothing");
}
/* ---- an exchange in combat (Oko, Thief of Crowns' -5, CR 701.12b): both change hands, and both are out ---- */
{
  const s = play([at(0, "battlefield", "Ogre", "Bear"), at(1, "battlefield", "Squirrel")], [{attack: ["Ogre", "Bear"]}, {block: [["Squirrel", "Ogre"]]}], {}, FIX);
  happen(s, {effect: "exchangeControl", from: [idOf(s, "Bear")], targets: [idOf(s, "Squirrel")]}, ME);
  eq([controllerOf(s, idOf(s, "Bear")), controllerOf(s, idOf(s, "Squirrel")), attackers(s), blockersOf(s, "Ogre"), s.combat.attacks[0].blocked],
    [1, 0, ["Ogre"], [], true], "the attacking Bear and the blocking Squirrel exchanged: both out of combat, the Ogre still blocked");
  toEndOfCombat(s);
  eq([life(s, 1), damageOn(s, "Squirrel"), damageOn(s, "Ogre")], [40, 0, 0], "and no combat damage at all");
}
/* ---- given back mid-combat: the effect that held it ends (Sower of Temptation's, "for as long as") ---- */
{
  const s = play([at(0, "battlefield", "Sower"), at(1, "battlefield", "Raider")], [], {}, {...FIX, Sower: creature(["Faerie"], 2, 2, {colors: ["U"]})});
  happen(s, {effect: "gainControl", targets: [idOf(s, "Raider")], until: "this leaves"}, {controller: 0, source: idOf(s, "Sower")});
  const raider = idOf(s, "Raider");
  drive(s, (st) => st.phase === "COMBAT_DECLARE_ATTACKERS" && st.priorityPlayer === 0, {answer: (st, choice) => (st.awaiting.kind === "declare-attackers"
    ? [choice.options.find((o) => o.cardId === raider).index] : null)});
  eq(attackers(s), ["Raider"], "Rob attacks Maya with her hasty Raider, his while the Sower stays");
  happen(s, {effect: "destroy", targets: [idOf(s, "Sower")]}, MAYA);
  eq([controllerOf(s, raider), s.combat.attacks], [1, []], "the Sower destroyed: the Raider is Maya's again, and out of combat (CR 506.4)");
  toEndOfCombat(s);
  eq(life(s, 1), 40, "it deals Maya nothing");
}
/* ---- given back mid-combat: the Aura that held it loses its abilities (Tractor Beam, "you control enchanted permanent") ---- */
{
  const s = play([at(0, "hand", "Tractor Beam"), at(0, "battlefield", "Island", "Island", "Wastes", "Wastes"), at(1, "battlefield", "Raider")],
    [{tap: "Island"}, {tap: "Island"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Tractor Beam", targets: [{card: "Raider"}]}, {resolve: true}, {resolve: true}], {}, FIX);
  const raider = idOf(s, "Raider"), beam = idOf(s, "Tractor Beam");
  happen(s, {effect: "untap", targets: [raider]}, ME);
  drive(s, (st) => st.phase === "COMBAT_DECLARE_ATTACKERS" && st.priorityPlayer === 0, {answer: (st, choice) => (st.awaiting.kind === "declare-attackers"
    ? [choice.options.find((o) => o.cardId === raider).index] : null)});
  eq([controllerOf(s, raider), attackers(s)], [0, ["Raider"]], "Rob attacks with the Raider his Beam holds");
  s.effects.push({id: "hush", layer: 6, affects: {ids: [beam]}, apply: {removeAllAbilities: true}, until: "end-of-turn", sourceController: 1});
  checkStateBasedActions(s);
  eq([controllerOf(s, raider), s.combat.attacks], [1, []], "the Beam without its abilities: the Raider goes back to Maya, out of combat");
  toEndOfCombat(s);
  eq(life(s, 1), 40, "and deals her nothing");
}
/* ---- phased out, out of combat too (CR 702.26, 506.4): the same removal ---- */
{
  const s = play([at(0, "battlefield", "Bear", "Ogre"), at(1, "battlefield", "Squirrel")], [{attack: ["Bear", "Ogre"]}, {block: [["Squirrel", "Ogre"]]}], {}, FIX);
  happen(s, {effect: "phaseOut", targets: [idOf(s, "Bear"), idOf(s, "Squirrel")]}, MAYA);
  eq([attackers(s), s.combat.attacks.find((a) => s.objects[a.attacker].card === "Ogre").blockers, s.combat.attacks[0].blocked], [["Ogre"], [], true],
    "the attacking Bear and the blocking Squirrel phased out: out of combat, the Ogre still blocked");
}
/* ---- a control change that changes nothing removes nothing ---- */
{
  const s = play([at(0, "battlefield", "Bear")], [{attack: ["Bear"]}], {}, FIX);
  happen(s, {effect: "gainControl", targets: [idOf(s, "Bear")], until: "end-of-turn"}, ME);
  eq(attackers(s), ["Bear"], "Rob \"gains control\" of his own attacker: it stays in combat -- its controller has not changed");
  toEndOfCombat(s);
  eq(life(s, 1), 38, "and deals its damage");
}

/* ======================================== 2. THE MONARCH ======================================== */

/* ---- the words ---- */
{
  ok(ALL_PRIMITIVES.includes("becomeMonarch") && PRIMITIVES.counters.includes("becomeMonarch") && typeof EFFECTS.becomeMonarch === "function",
    "becomeMonarch: declared (vocabulary.mjs) and built (effects/resources.mjs)");
  eq([FORGE_API.BecomeMonarch, FORGE_COUNTS.Monarch.status], ["becomeMonarch", "built"], "and credited: Forge's BecomeMonarch and its Monarch count (engine-constructs.mjs)");
  const one = (effect) => compiled([{kind: "triggered", text: "x", trigger: {on: "enters"}, effects: [effect]}]).problems;
  eq([one({effect: "becomeMonarch"}), one({effect: "becomeMonarch", who: "you"}), one({effect: "becomeMonarch", who: "that card's controller"})], [[], [], []],
    "\"you become the monarch\", and \"its controller becomes the monarch\"");
  eq(compiled([{kind: "spell", text: "x", targets: [{what: "player"}], effects: [{effect: "becomeMonarch", who: {target: 0}}]}], {types: ["Sorcery"], power: null, toughness: null}).problems, [],
    "\"target player becomes the monarch\"");
  ok(one({effect: "becomeMonarch", who: "opponent"}).some((p) => p.includes("One player becomes the monarch")), "never more than one player (CR 725.3)");
  const gate = (trigger) => compiled([{kind: "triggered", text: "x", trigger, effects: [{effect: "draw", count: 1}]}]).problems;
  eq(gate({on: "damage dealt once", who: "any", to: "you", combat: true, monarch: "you"}), [], "\"whenever creatures deal combat damage to you while you're the monarch\"");
  ok(gate({on: "enters", monarch: "you"}).some((p) => p.includes("while you're the monarch")), "\"while you're the monarch\" on another trigger is refused");
  ok(gate({on: "damage dealt", who: "any", to: "opponent", combat: true, monarch: "you"}).some((p) => p.includes("while you're the monarch")), "and on damage to an opponent");
  ok(gate({on: "damage dealt", who: "any", to: "you", monarch: "them"}).some((p) => p.includes("while you're the monarch")), "and as anything but \"you\"");
  ok(compiled([{kind: "triggered", text: "x", trigger: {on: "upkeep"}, condition: {monarch: "them"}, effects: [{effect: "draw", count: 1}]}]).problems
    .some((p) => p.includes("monarch is \"you\"")), "the condition is monarch: \"you\"");
  eq(INHERENT_TRIGGERS.map((t) => t.abilityId), ["monarch-end-step", "monarch-combat-damage"], "the game's own two triggers (CR 725.2)");
}

/* ---- becoming the monarch: one player's at a time (CR 725.3), said to everyone ---- */
{
  const s = play([], [], {}, FIX);
  eq([crowned(s), "monarch" in s, monarchSeen(s), conditionHolds(s, {monarch: "you"}, {controller: 0})], [null, false, [], false],
    "no monarch until an effect makes one (CR 725.1): no key in the state, nobody in the view, nobody \"you\"");
  const events = happen(s, {effect: "becomeMonarch"}, ME);
  eq([crowned(s), monarchSeen(s, 0), monarchSeen(s, 1)], [0, [0], [0]], "Rob becomes the monarch: every seat sees it");
  eq(Object.keys(projectFor(s, 1).players[1]).includes("monarch"), false, "and only the monarch carries the field");
  eq(events.map((e) => [e.kind, e.data.fields.player]), [["GameEventBecomeMonarch", {playerId: 0, name: "Rob"}]], "the event");
  eq(historyLines(events[0], ["Rob", "Maya"]).map((l) => l.text), ["Rob became the monarch"], "the history's line");
  eq([conditionHolds(s, {monarch: "you"}, {controller: 0}), conditionHolds(s, {monarch: "you"}, {controller: 1})], [true, false], "\"if you're the monarch\": Rob's, not Maya's");
  eq(happen(s, {effect: "becomeMonarch"}, ME), [], "the monarch becoming it again: nothing happens");
  const passed = happen(s, {effect: "becomeMonarch"}, MAYA);
  eq([crowned(s), monarchSeen(s), passed.length], [1, [1], 1], "a second \"become the monarch\" passes it: Maya's, and Rob's no longer");
  eq(historyLines(passed[0], ["Rob", "Maya"]).map((l) => l.text), ["Maya became the monarch"], "Maya became the monarch");
  /* "Target player becomes the monarch", its target gone as it resolves (CR 608.2b): bound to nobody, and nobody becomes it. */
  eq([happen(s, {effect: "becomeMonarch", who: []}, ME), crowned(s)], [[], 1], "a target player no longer there: nothing happens");
  eq([happen(s, {effect: "becomeMonarch", who: [0]}, MAYA).length, crowned(s)], [1, 0], "a target player there: Rob, whoever's effect it is");
  /* The scenarios' word on it (cards/scenario.mjs): a wrong monarch fails the scenario. */
  let refused = null;
  try { runScenario({name: "x", setup: [], steps: [], expect: [{monarch: 0}]}, index.definition); } catch (error) { refused = error.message; }
  eq(refused, "x: the monarch is nobody, not Rob", "a scenario expecting a monarch where there is none fails, saying so");
}

/* ---- the end-step draw: the game's own trigger, on the stack, respondable, the monarch's ---- */
{
  const s = play([], [], {}, FIX);
  happen(s, {effect: "becomeMonarch"}, ME);
  drive(s, (st) => st.phase === "END_OF_TURN" && st.priorityPlayer !== null);
  const entry = s.stack.at(-1), seen = projectFor(s, 1).stack.at(-1);
  eq([s.stack.length, entry.kind, entry.abilityId, entry.playerId, entry.cardId, seen.name], [1, "trigger", "monarch-end-step", 0, null, MONARCH_NAME],
    "Rob's end step: the monarch's trigger on the stack -- no source (CR 725.2), Rob's, named for the designation");
  const hand = s.zones.hand[0].length;
  /* Respondable: Rob passes, and Maya holds priority with it still there -- and in response becomes the monarch herself. */
  passPriority(s, null, createRng("monarch"));
  eq([s.priorityPlayer, s.stack.length], [1, 1], "Rob passes: Maya may respond, the trigger waiting");
  happen(s, {effect: "becomeMonarch"}, MAYA);
  drive(s, (st) => st.stack.length === 0);
  eq([s.zones.hand[0].length, s.zones.hand[1].length, crowned(s)], [hand + 1, 0, 1], "\"that player draws\": Rob, who was the monarch as it triggered -- not Maya, the monarch now");
  /* Maya's end step: hers now. */
  drive(s, (st) => st.turn === 2 && st.phase === "END_OF_TURN" && st.priorityPlayer !== null);
  eq([s.stack.length, s.stack[0]?.playerId], [1, 1], "Maya's end step, Maya the monarch: her trigger");
  drive(s, (st) => st.turn === 3 && st.phase === "END_OF_TURN" && st.priorityPlayer !== null);
  eq(s.stack.length, 0, "Rob's next end step: he is not the monarch, nothing triggers");
}

/* ---- combat damage takes it: from an unblocked creature, from trample, from two at once; noncombat damage does not ---- */
{
  const s = play([at(0, "battlefield", "Bear")], [], {}, FIX);
  happen(s, {effect: "becomeMonarch"}, MAYA);
  drive(s, (st) => st.phase === "COMBAT_DECLARE_ATTACKERS" && st.priorityPlayer === 0, {answer: (st, choice) => (st.awaiting.kind === "declare-attackers" ? [0] : null)});
  drive(s, (st) => st.stack.length > 0);
  const entry = s.stack.at(-1);
  eq([s.phase, entry.abilityId, entry.playerId, entry.about.controller, crowned(s)], ["COMBAT_DAMAGE", "monarch-combat-damage", 1, 0, 1],
    "Rob's unblocked Bear deals combat damage to Maya, the monarch: her trigger (CR 725.2), about the Bear and its controller");
  drive(s, (st) => st.stack.length === 0);
  eq(crowned(s), 0, "it resolves: Rob, its controller, is the monarch");
}
{
  /* Trample (CR 702.19b): the Trampler's damage over its blocker is combat damage to the monarch -- and its controller is read
     as it last was, the Trampler dying in the same combat (CR 608.2h; script/bind.mjs). */
  const s = play([at(0, "battlefield", "Trampler"), at(1, "battlefield", "Killer")], [{attack: ["Trampler"]}, {block: [["Killer", "Trampler"]]}], {}, FIX);
  happen(s, {effect: "becomeMonarch"}, MAYA);
  drive(s, (st) => st.stack.length > 0);
  eq([life(s, 1), idOf(s, "Trampler"), s.stack.at(-1).abilityId], [37, undefined, "monarch-combat-damage"], "3 trampled over to Maya; the Trampler died to the Killer");
  drive(s, (st) => st.stack.length === 0);
  eq(crowned(s), 0, "gone, its controller as it last was becomes the monarch: Rob");
}
{
  /* Two creatures at once: two triggers, the monarch's to order; the second makes no one the monarch again. */
  const s = play([at(0, "battlefield", "Bear", "Ogre")], [{attack: ["Bear", "Ogre"]}], {}, FIX);
  happen(s, {effect: "becomeMonarch"}, MAYA);
  let asked = null;
  drive(s, (st) => st.stack.length > 1, {answer: (st, choice) => (st.awaiting.kind === "order-triggers" ? (asked = {player: st.awaiting.player, labels: choice.options.map((o) => o.label)}, choice.options.map((o) => o.index)) : null)});
  eq(asked, {player: 1, labels: [`${MONARCH_NAME}: ${INHERENT_TRIGGERS[1].text}`, `${MONARCH_NAME}: ${INHERENT_TRIGGERS[1].text}`]}, "Maya orders her two triggers, each named for the monarch");
  drive(s, (st) => st.stack.length === 0);
  eq(crowned(s), 0, "Rob is the monarch");
}
{
  /* Noncombat damage takes nothing (CR 725.2: combat damage). */
  const s = play([at(0, "battlefield", "Bear")], [], {}, FIX);
  happen(s, {effect: "becomeMonarch"}, MAYA);
  happen(s, {effect: "dealDamage", amount: 3, who: [1]}, {controller: 0, source: idOf(s, "Bear")});
  drive(s, (st) => st.priorityPlayer !== null);
  eq([life(s, 1), s.stack.length, (s.pendingTriggers ?? []).length, crowned(s)], [37, 0, 0, 1], "the Bear deals Maya 3 noncombat damage: nothing triggers, and she stays the monarch");
}
{
  /* Combat damage to a player who is not the monarch triggers nothing; and with no monarch, nothing at all. */
  const s = play([at(0, "battlefield", "Bear")], [{attack: ["Bear"]}], {seats: 4}, FIX);
  happen(s, {effect: "becomeMonarch"}, {controller: 2, source: null});
  drive(s, (st) => st.phase === "COMBAT_END");
  eq([life(s, 1), s.stack.length, crowned(s)], [38, 0, 2], "four players: Rob's Bear hits Maya, and Trey is still the monarch");
  const t = play([at(0, "battlefield", "Bear")], [{attack: ["Bear"]}], {}, FIX);
  drive(t, (st) => st.phase === "COMBAT_END");
  eq([life(t, 1), t.stack.length, crowned(t)], [38, 0, null], "no monarch: nothing triggers");
}
{
  /* Four players: Rob attacks Trey, the monarch, and Maya; only Trey's is taken from him, by Rob. */
  const s = play([at(0, "battlefield", "Bear", "Ogre")], [{attack: ["Bear", "Ogre"], at: ["Maya", "Trey"]}], {seats: 4}, FIX);
  happen(s, {effect: "becomeMonarch"}, {controller: 2, source: null});
  drive(s, (st) => st.stack.length > 0);
  eq([s.stack.length, s.stack[0].playerId, s.stack[0].about.card === idOf(s, "Ogre")], [1, 2, true], "one trigger, Trey's, about the Ogre that hit him");
  drive(s, (st) => st.stack.length === 0);
  eq([crowned(s), monarchSeen(s, 3)], [0, [0]], "Rob is the monarch, and Sam sees it");
}
{
  /* First strike: the first-strike damage step takes it; in the regular step the monarch is Rob, whose creatures hit Maya. */
  const s = play([at(0, "battlefield", "Striker", "Bear")], [{attack: ["Striker", "Bear"]}], {}, FIX);
  happen(s, {effect: "becomeMonarch"}, MAYA);
  drive(s, (st) => st.stack.length > 0);
  eq([s.phase, s.stack.length], ["COMBAT_FIRST_STRIKE_DAMAGE", 1], "the Striker's first-strike damage: Maya's trigger");
  drive(s, (st) => st.phase === "COMBAT_END");
  eq([crowned(s), life(s, 1)], [0, 36], "Rob the monarch before the Bear's regular damage, which then triggers nothing");
}

/* ---- Tamiyo: "while you're the monarch" is read as the damage is dealt, and is no intervening "if" ---- */
{
  const s = play([at(0, "battlefield", TU), at(1, "battlefield", "Bear")], [], {}, FIX);
  happen(s, {effect: "becomeMonarch"}, ME);
  let order = null;
  drive(s, (st) => st.turn === 2 && st.stack.length === 2, {answer: (st, choice) => {
    if (st.awaiting.kind === "declare-attackers") return st.awaiting.player === 1 ? [choice.options.find((o) => st.objects[o.cardId].card === "Bear").index] : [];
    /* Rob puts the monarch's trigger on top, to resolve first. */
    if (st.awaiting.kind === "order-triggers") { order = choice.options.map((o) => o.label); return [choice.options.findIndex((o) => o.label.startsWith(TU)), choice.options.findIndex((o) => o.label.startsWith(MONARCH_NAME))]; }
    return null;
  }});
  ok(order.some((l) => l.startsWith(TU)) && order.some((l) => l.startsWith(MONARCH_NAME)), "Maya's Bear hits Rob, the monarch: Tamiyo's trigger and the monarch's, both Rob's");
  drive(s, (st) => st.stack.length === 1);
  eq(crowned(s), 1, "the monarch's resolves first: Maya is the monarch");
  drive(s, (st) => st.stack.length === 0);
  eq([s.objects[idOf(s, "Bear")].counters.stun, s.objects[idOf(s, "Bear")].tapped], [1, true], "Tamiyo's still stuns the Bear: Rob was the monarch as the damage was dealt");
}
{
  /* Ginger's "if you're the monarch" IS an intervening "if" (CR 603.4): Maya becomes the monarch in response, and no token. */
  const s = play([at(0, "battlefield", GQ)], [], {}, FIX);
  happen(s, {effect: "becomeMonarch"}, ME);
  drive(s, (st) => st.turn === 2 && st.phase === "UPKEEP" && st.stack.length === 1);
  happen(s, {effect: "becomeMonarch"}, MAYA);
  drive(s, (st) => st.stack.length === 0);
  eq(idOf(s, "Gingerbrute"), undefined, "Maya the monarch as Ginger's upkeep trigger resolves: no Gingerbrute");
  drive(s, (st) => st.turn === 3 && st.phase === "UPKEEP" && st.priorityPlayer !== null);
  eq(s.stack.length, 0, "and Rob's upkeep, not the monarch: it does not trigger");
}
{
  /* A Gingerbrute's {1}: blocked only by creatures with haste, this turn. */
  const s = play([at(0, "battlefield", GQ, "Wastes"), at(1, "battlefield", "Ogre", "Hasty Goblin")], [], {}, FIX);
  happen(s, {effect: "becomeMonarch"}, ME);
  drive(s, (st) => st.turn === 3 && st.phase === "MAIN1" && st.priorityPlayer === 0 && st.stack.length === 0);
  const brute = idOf(s, "Gingerbrute"), ogre = idOf(s, "Ogre"), goblin = idOf(s, "Hasty Goblin");
  eq([s.objects[brute].manaCost, s.objects[brute].token, s.objects[ogre].manaCost], ["{1}", true, "{2}"], "a {1} token (CR 111.3): its mana cost the effect's");
  eq([canBlockAttacker(s, ogre, brute), canBlockAttacker(s, goblin, brute)], [true, true], "before: the Ogre and the Goblin may block it");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.label === "Wastes"));
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.objectId === brute && a.abilityId === "gingerbrute-evasion"));
  drive(s, (st) => st.stack.length === 0);
  eq([canBlockAttacker(s, ogre, brute), canBlockAttacker(s, goblin, brute)], [false, true], "after: the Ogre can't, the Goblin with haste can");
}

/* ---- the monarch leaves the game (CR 725.4) ---- */
{
  /* Two players, on another's turn: Maya, the monarch, concedes in Rob's turn -- Rob, the active player, is the monarch. */
  const s = play([], [], {}, FIX);
  happen(s, {effect: "becomeMonarch"}, MAYA);
  const events = concede(s, 1);
  eq([crowned(s), events.filter((e) => e.kind === "GameEventBecomeMonarch").map((e) => e.data.fields.player.playerId)], [0, [0]], "two players: Maya concedes, Rob is the monarch");
}
{
  /* Two players, on their own turn: Rob, the monarch, concedes in his -- Maya, next in turn order. */
  const s = play([], [], {}, FIX);
  happen(s, {effect: "becomeMonarch"}, ME);
  concede(s, 0);
  eq(crowned(s), 1, "two players: Rob concedes in his own turn, and Maya is the monarch");
}
{
  /* Four players, on another's turn: Trey, the monarch, concedes in Rob's turn -- Rob. */
  const s = play([], [], {seats: 4}, FIX);
  happen(s, {effect: "becomeMonarch"}, {controller: 2, source: null});
  concede(s, 2);
  eq([crowned(s), monarchSeen(s, 1)], [0, [0]], "four players: Trey concedes in Rob's turn, Rob is the monarch");
}
{
  /* Four players, on their own turn: Trey, the monarch, concedes in his -- Sam, the next in turn order, not Rob. */
  const s = play([], [], {seats: 4}, FIX);
  happen(s, {effect: "becomeMonarch"}, {controller: 2, source: null});
  drive(s, (st) => st.turn === 3 && st.phase === "MAIN1" && st.priorityPlayer === 2);
  concede(s, 2);
  eq(crowned(s), 3, "four players: Trey concedes in his own turn, Sam is the monarch");
}
{
  /* Four players, the turn's player gone already (CR 800.4j): Rob conceded in his turn; then Trey, the monarch -- Maya. */
  const s = play([], [], {seats: 4}, FIX);
  happen(s, {effect: "becomeMonarch"}, {controller: 2, source: null});
  concede(s, 0);
  eq(crowned(s), 2, "Rob concedes: Trey is still the monarch");
  concede(s, 2);
  eq(crowned(s), 1, "Trey concedes in the turn Rob left: the next player after Rob still in the game, Maya");
}
{
  /* The active player and the monarch leaving at once (one check of state-based actions): the next player still in it. */
  const s = play([], [], {seats: 4}, FIX);
  happen(s, {effect: "becomeMonarch"}, {controller: 2, source: null});
  s.players[0].life = 0; s.players[2].life = 0;
  const events = checkStateBasedActions(s);
  eq([crowned(s), events.filter((e) => e.kind === "GameEventBecomeMonarch").map((e) => e.data.fields.player.playerId)], [1, [1]],
    "Rob, the active player, and Trey, the monarch, at 0 life together: Maya is the monarch, and no one else is made it on the way");
}
{
  /* An effect that makes the monarch lose (CR 104.3e; effects/resources.mjs loseGame). */
  const s = play([], [], {seats: 4}, FIX);
  happen(s, {effect: "becomeMonarch"}, {controller: 3, source: null});
  happen(s, {effect: "loseGame", who: [3]}, ME);
  eq(crowned(s), 0, "Sam, the monarch, loses the game to an effect: Rob, the active player, is the monarch");
  happen(s, {effect: "loseGame", who: "any"}, ME);
  eq([crowned(s), "monarch" in s], [null, false], "every player loses at once: nobody can become the monarch, and the game has none (CR 725.4)");
}
{
  /* The monarch dealt lethal combat damage: their trigger is never put on the stack (CR 800.4d), and the active player is the
     monarch as they leave. */
  const s = play([at(0, "battlefield", "Ogre")], [{attack: ["Ogre"], at: "Maya"}], {seats: 4}, FIX);
  happen(s, {effect: "becomeMonarch"}, MAYA);
  s.players[1].life = 4;
  drive(s, (st) => st.phase === "COMBAT_END");
  eq([s.players[1].lost, crowned(s), s.stack.length], [true, 0, 0], "four players: Maya dies to the Ogre, Rob is the monarch, and her trigger never reaches the stack");
}
{
  /* A monarch who has left cannot become it again, and a player gone is never made it. */
  const s = play([], [], {seats: 4}, FIX);
  concede(s, 1);
  eq(happen(s, {effect: "becomeMonarch"}, MAYA), [], "Maya, gone, does not become the monarch");
  eq(crowned(s), null, "and there is still none");
}

/* ---- the room's view carries it (projection.mjs), for every seat and a spectator ---- */
{
  const s = play([], [], {seats: 4}, FIX);
  happen(s, {effect: "becomeMonarch"}, {controller: 2, source: null});
  eq([0, 1, 2, 3, null].map((viewer) => monarchSeen(s, viewer)), [[2], [2], [2], [2], [2]], "public: every seat and a spectator see Trey as the monarch");
}

done("a creature whose controller changes leaves combat -- taken, exchanged, given back -- its attacker blocked still, and nothing dealt; the monarch: one player's, its two sourceless triggers on the stack, taken by combat damage alone, passed on as the monarch leaves, in the view and the history.");
