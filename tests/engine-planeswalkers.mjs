/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* PLANESWALKERS (the plan's X5, D5 Shadrix Aristocrats: Elspeth, Sun's Nemesis; X5m).
 *
 * Loyalty: a planeswalker enters with as many loyalty counters as its printed loyalty, however it enters (CR 306.5b), and
 * on the battlefield its loyalty is those counters (306.5c). Its loyalty abilities (CR 606): in a main phase of its
 * controller's turn with the stack empty, and one a turn for the permanent (606.3); the cost to put on or remove loyalty
 * counters (606.4), paid as it is activated; a negative one only with that many counters (606.6). Damage to it removes
 * that many (CR 120.3c, 306.8), infect's too; a creature that is one has both (120.3). With none left it is put into its
 * owner's graveyard (704.5i): put, so indestructible does not keep it, and before the ability that spent the last of them
 * resolves -- which resolves all the same (113.7a).
 *
 * Attacked (CR 306.6, 506.2, 508.1b): a creature that may attack may attack a planeswalker a defending player controls,
 * and that player blocks it. Unblocked, its combat damage removes loyalty: the player loses no life and is dealt no
 * commander damage (903.10a); a trampler's excess goes to the planeswalker (702.19b). Gone, or someone else's, before
 * damage, it is attacked by nothing, and the creature still attacking it deals no combat damage (506.4, 506.4c, 510.1b,
 * 702.19f). Attacking it is not attacking its controller (506.3): "can't attack you" and "can't attack you unless ..." do
 * not reach it unless they say "or planeswalkers you control" (Combat Calligrapher, Baird); "a player it has already
 * attacked this turn" does not count it; "whenever a player attacks one of your opponents" does not see it (508.3e), and
 * "if none of those creatures attacked you" is still true. A Ninja put in for its attacker attacks it too (702.49c).
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {attackTax, cantAttack} from "../game/engine/rules/statics.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {usesThisTurn} from "../game/engine/state/index.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const EL = "Elspeth, Sun's Nemesis";
const SCRIPT = JSON.parse(readFileSync(new URL("../game/engine/cards/e/elspeth-suns-nemesis.json", import.meta.url), "utf8"));
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const creature = (power, toughness = power, more = {}) => ({types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power, toughness, ...more});
/* Elspeth's abilities at other costs: "0:" two Soldiers, "+1:" gain 5 life. */
const WALKER = compileScript({...SCRIPT, abilities: SCRIPT.abilities.map((a, i) => (i === 1 ? {...a, cost: [{atom: "loyalty", amount: 0}]}
  : i === 2 ? {...a, cost: [{atom: "loyalty", amount: 1}]} : a))}).definition;
const FIX = {
  Bear: creature(2), Wall: creature(0, 4), Squire: creature(1), Brute: creature(5),
  Trampler: creature(4, 4, {keywords: ["Trample"]}), Plague: creature(2, 2, {keywords: ["Infect"]}),
  Inkling: creature(1, 1, {subtypes: ["Inkling"], colors: ["W", "B"]}),
  /* A creature that is a planeswalker too. */
  Avatar: {types: ["Creature", "Planeswalker"], manaCost: "{3}{W}", colors: ["W"], power: 5, toughness: 5, loyalty: 4},
  Walker: WALKER,
  Stalwart: {...WALKER, loyalty: 3, keywords: ["Indestructible"]},
  /* "Creatures can't attack you": no word of planeswalkers. */
  Ward: {types: ["Enchantment"], abilities: [{id: "w", kind: "static", text: "Creatures can't attack you.", rule: "cant-attack", affects: {types: ["Creature"]}, defender: "you"}]},
  /* "Creatures your opponents control can't attack": anyone, planeswalkers too. */
  Dread: {types: ["Enchantment"], abilities: [{id: "d", kind: "static", text: "Creatures your opponents control can't attack.", rule: "cant-attack", affects: {types: ["Creature"], controller: "opponent"}}]},
  /* "Whenever a creature you control attacks one of your opponents, you gain 1 life": no word of planeswalkers. */
  Raider: {types: ["Enchantment"], abilities: [{id: "r", kind: "triggered", text: "Whenever a creature you control attacks one of your opponents, you gain 1 life.",
    trigger: {on: "GameEventAttackersDeclared", who: "any", filter: {types: ["Creature"], controller: "you"}, defender: "opponent"}, effects: [{effect: "gainLife", amount: 1}]}]},
  /* "Whenever a creature you control attacks, you gain 1 life": an attack on a planeswalker is an attack (CR 508.3a). */
  Herald: {types: ["Enchantment"], abilities: [{id: "h", kind: "triggered", text: "Whenever a creature you control attacks, you gain 1 life.",
    trigger: {on: "GameEventAttackersDeclared", who: "any", filter: {types: ["Creature"], controller: "you"}}, effects: [{effect: "gainLife", amount: 1}]}]},
};
const play = (name, setup, steps = [], more = {}) => runScenario({name, setup, steps, ...more}, index.definition, FIX).state;
const named = (s, card) => s.zones.battlefield.filter((id) => s.objects[id]?.card === card);
const one = (s, card) => { const [id] = named(s, card); assert.ok(id !== undefined, `${card} is on the battlefield`); return id; };
const loyalty = (s, card) => s.objects[one(s, card)].counters.loyalty;
const activations = (s, seat, card) => legalActions(s, seat).filter((a) => a.kind === "activate" && s.objects[a.objectId]?.card === card);

/* The game played on with nobody doing anything -- priority passed, nothing declared -- until `done`. */
function until(s, done, what) {
  for (let n = 0; n < 2000 && !done(s); n += 1) {
    if (s.awaiting) {
      if (s.awaiting.kind === "order-triggers") resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index));
      else if (["declare-attackers", "declare-blockers"].includes(s.awaiting.kind)) resolveAwaiting(s, []);
      else throw new Error(`${what}: the game asks ${s.awaiting.kind}`);
    } else if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  assert.ok(done(s), what);
}
/* Answer the question `kind` asks by its options' labels. */
function answer(s, kind, labels) {
  until(s, (t) => t.awaiting?.kind === kind, `the game asks ${kind}`);
  const choice = awaitingChoice(s);
  return resolveAwaiting(s, labels.map((label) => {
    const option = choice.options.find((o) => o.label === label);
    assert.ok(option, `${label} is among ${choice.options.map((o) => o.label).join(", ")}`);
    return option.index;
  }));
}
const attackLabels = (s) => { until(s, (t) => t.awaiting?.kind === "declare-attackers", "the game asks who attacks"); return awaitingChoice(s).options.map((o) => o.label); };
const toMain2 = (s, turn) => until(s, (t) => t.turn === turn && t.phase === "MAIN2" && t.priorityPlayer !== null && !t.awaiting, `turn ${turn}, second main phase`);

{
  /* The compiler: loyalty, and loyalty costs paid in counters, at sorcery speed. */
  const {definition, problems} = compileScript(SCRIPT);
  eq(problems, [], "Elspeth compiles");
  eq([definition.loyalty, definition.abilities.filter((a) => a.kind === "activated").map((a) => [a.loyalty, a.timing, a.cost])],
    [5, [[-1, "sorcery", [{atom: "removeCounters", self: true, counter: "loyalty", count: 1}]], [-2, "sorcery", [{atom: "removeCounters", self: true, counter: "loyalty", count: 2}]],
      [-3, "sorcery", [{atom: "removeCounters", self: true, counter: "loyalty", count: 3}]]]],
    "loyalty 5; -1, -2 and -3 remove that many loyalty counters, at sorcery speed (CR 606.3, 606.4)");
  eq(WALKER.abilities.filter((a) => a.kind === "activated").map((a) => [a.loyalty, a.cost]),
    [[-1, [{atom: "removeCounters", self: true, counter: "loyalty", count: 1}]], [0, []], [1, [{atom: "addCounters", self: true, counter: "loyalty", count: 1}]]],
    "\"0:\" costs nothing, \"+1:\" puts one on");
  const twice = {...SCRIPT, abilities: SCRIPT.abilities.map((a, i) => (i === 0 ? {...a, cost: [{atom: "loyalty", amount: -1}, {atom: "loyalty", amount: -1}]} : a))};
  ok(compileScript(twice).problems.some((p) => /a loyalty cost is one number/.test(p)), "two loyalty costs in one ability are refused");
  const fraction = {...SCRIPT, abilities: SCRIPT.abilities.map((a, i) => (i === 0 ? {...a, cost: [{atom: "loyalty", amount: "X"}]} : a))};
  ok(compileScript(fraction).problems.some((p) => /a loyalty cost is one number/.test(p)), "and one that is no whole number");
  eq(validateScript({...SCRIPT, identity: {...SCRIPT.identity, loyalty: -1}}).errors.map((e) => e.path), ["identity.loyalty"], "a printed loyalty is 0 or more");
  ok(index.resolve(EL)?.playable === true, `${EL} is defined and playable`);
}
{
  /* Entering (CR 306.5b): however it enters, with 5. Set on the battlefield by an effect from the graveyard, then returned
     to the hand at 2 and put onto the battlefield again: a new object, 5 again (CR 400.7). */
  const s = play("put", [at(0, "graveyard", EL)]);
  const [card] = s.zones.graveyard[0].filter((id) => s.objects[id].card === EL);
  const id = moveOne(s, card, "battlefield", []);
  eq(s.objects[id].counters.loyalty, 5, "put onto the battlefield by an effect, she enters with 5 loyalty");
  s.objects[id].counters.loyalty = 2;
  const back = moveOne(s, moveOne(s, id, "hand", [], {owner: 0}), "battlefield", []);
  eq(s.objects[back].counters.loyalty, 5, "left and returned, a new object with 5");
  eq(projectFor(s, 1).players[0].zones.Battlefield.cards.find((c) => c.name === EL)?.counters?.loyalty, 5, "Maya sees her loyalty");
}
{
  /* Timing (CR 606.3): Rob's main phase with the stack empty -- not with a spell on the stack, not in combat, not in
     Maya's turn. */
  const s = play("timing", [at(0, "battlefield", EL, "Mountain", "Wastes", "Wastes"), at(0, "hand", "Lightning Bolt")]);
  eq(activations(s, 0, EL).map((a) => a.loyalty), [-1, -2, -3], "in Rob's main phase: each of her three, with its loyalty cost");
  const cast = play("a spell on the stack", [at(0, "battlefield", EL, "Mountain"), at(0, "hand", "Lightning Bolt")],
    [{tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{player: 1}]}]);
  eq([cast.stack.length, cast.priorityPlayer, activations(cast, 0, EL).length], [1, 0, 0], "with Lightning Bolt on the stack and Rob holding priority: none");
  const combat = play("combat", [at(0, "battlefield", EL)], [{to: {turn: 1, phase: "COMBAT_BEGIN"}}]);
  eq([combat.priorityPlayer, activations(combat, 0, EL).length], [0, 0], "in Rob's beginning of combat: none");
  const theirs = play("Maya's turn", [at(0, "battlefield", EL)], [{to: {turn: 2, phase: "MAIN1"}}, {pass: 1}]);
  eq([theirs.activePlayer, theirs.priorityPlayer, activations(theirs, 0, EL).length], [1, 0, 0], "in Maya's main phase, Rob holding priority: none");
}
{
  /* The cost paid as it is activated (CR 602.2b, 606.4): -2 on the stack, 3 left; one loyalty ability a turn for the
     permanent (606.3), again next turn. */
  const s = play("once a turn", [at(0, "battlefield", EL)], [{activate: EL, ability: "a1"}]);
  eq([s.stack.length, loyalty(s, EL)], [1, 3], "-2 activated: on the stack, and 3 loyalty left already");
  until(s, (t) => t.stack.length === 0, "it resolves");
  eq([named(s, "Human Soldier").length, activations(s, 0, EL).length, usesThisTurn(s, one(s, EL), "loyalty")], [2, 0, 1], "two Soldiers, and no other of her abilities this turn");
  until(s, (t) => t.turn === 3 && t.phase === "MAIN1" && t.priorityPlayer === 0 && !t.awaiting, "Rob's next turn");
  eq(activations(s, 0, EL).map((a) => a.loyalty), [-1, -2, -3], "Rob's next turn: all three again");
  /* A negative cost needs that many counters (CR 606.6): at 2, -1 and -2, not -3. */
  s.objects[one(s, EL)].counters.loyalty = 2;
  eq(activations(s, 0, EL).map((a) => a.loyalty), [-1, -2], "at 2 loyalty: -1 and -2, not -3");
  /* "+1:" and "0:". */
  const plus = play("+1", [at(0, "battlefield", "Walker")], [{activate: "Walker", ability: "a2"}]);
  eq(loyalty(plus, "Walker"), 6, "+1 activated: 6 at once");
  until(plus, (t) => t.stack.length === 0, "it resolves");
  eq([plus.players[0].life, activations(plus, 0, "Walker").length], [45, 0], "Rob gains 5, and nothing more from it this turn");
  const zero = play("0", [at(0, "battlefield", "Walker")], [{activate: "Walker", ability: "a1"}, {resolve: true}]);
  eq([loyalty(zero, "Walker"), named(zero, "Human Soldier").length], [5, 2], "0: two Soldiers, loyalty unchanged");
}
{
  /* Damage removes loyalty (CR 120.3c, 306.8): Lightning Bolt at Maya's Elspeth, 5 to 2. */
  const bolt = (card) => [{tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{card, seat: 1}]}, {resolve: true}];
  const s = play("bolted", [at(0, "battlefield", "Mountain"), at(0, "hand", "Lightning Bolt"), at(1, "battlefield", EL)], bolt(EL));
  eq([loyalty(s, EL), s.objects[one(s, EL)].damage, s.players[1].life], [2, 0, 40], "Bolted: 2 loyalty left, no damage marked, Maya's life untouched");
  /* A second Bolt, more than she has: none left, never below, and she is put into Maya's graveyard (CR 704.5i). */
  const twice = runScenario({name: "bolted twice", setup: [at(0, "battlefield", "Mountain", "Mountain"), at(0, "hand", "Lightning Bolt", "Lightning Bolt"), at(1, "battlefield", EL)],
    steps: [...bolt(EL), ...bolt(EL)]}, index.definition, FIX);
  eq([named(twice.state, EL).length, twice.state.zones.graveyard[1].map((id) => twice.state.objects[id].card)], [0, [EL]], "Bolted twice: in Maya's graveyard");
  eq(twice.events.filter((e) => e.kind === "GameEventCardCounters" && e.data?.fields?.type === "loyalty").map((e) => [e.data.fields.oldValue, e.data.fields.newValue]),
    [[5, 2], [2, 0]], "each Bolt took loyalty: 5 to 2, then 2 to 0 -- never below");
  /* Indestructible does not keep one: it is put there, not destroyed. */
  const tough = play("indestructible", [at(0, "battlefield", "Mountain"), at(0, "hand", "Lightning Bolt"), at(1, "battlefield", "Stalwart")], bolt("Stalwart"));
  eq([named(tough, "Stalwart").length, tough.zones.graveyard[1].map((id) => tough.objects[id].card)], [0, ["Stalwart"]], "an indestructible planeswalker Bolted at 3: in the graveyard all the same");
  /* A creature that is a planeswalker too: loyalty removed and damage marked (CR 120.3). */
  const both = play("both", [at(0, "battlefield", "Mountain"), at(0, "hand", "Lightning Bolt"), at(1, "battlefield", "Avatar")], bolt("Avatar"));
  eq([loyalty(both, "Avatar"), both.objects[one(both, "Avatar")].damage], [1, 3], "a creature planeswalker Bolted: 4 loyalty to 1, and 3 damage marked");
}
{
  /* Attacked (CR 506.2, 508.1b): Maya's Bear may attack Rob, or his Elspeth. Her commander, it attacks Elspeth. */
  const s = play("attacked", [at(0, "battlefield", EL), at(1, "battlefield", "Bear", "Herald")], [], {at: {turn: 2, phase: "MAIN1"}});
  const bear = one(s, "Bear"), el = one(s, EL);
  s.objects[bear].commander = true;
  eq(attackLabels(s), ["Bear → Rob", `Bear → ${EL} (Rob)`], "Maya's Bear: Rob, or Elspeth");
  answer(s, "declare-attackers", [`Bear → ${EL} (Rob)`]);
  eq(s.combat.attacks.map((a) => [a.attacker, a.defender, a.planeswalker]), [[bear, 0, el]], "the Bear attacks Elspeth, and Rob is the defending player");
  eq(projectFor(s, 0).combat.attacks.map((a) => a.planeswalker), [el], "Rob sees what it attacks");
  eq([usesThisTurn(s, bear, "attacked"), usesThisTurn(s, bear, "attacked:0")], [1, 0], "it attacked -- and attacked no player");
  toMain2(s, 2);
  eq([loyalty(s, EL), s.players[0].life, s.players[0].commanderDamage, s.players[1].life], [3, 40, {}, 41],
    "unblocked: 2 loyalty gone; Rob loses no life and is dealt no commander damage (CR 903.10a); Maya's Herald saw an attack (508.3a)");
}
{
  /* Blocked: Rob blocks it, and Elspeth keeps her loyalty. */
  const s = play("blocked", [at(0, "battlefield", EL, "Wall"), at(1, "battlefield", "Bear")], [], {at: {turn: 2, phase: "MAIN1"}});
  answer(s, "declare-attackers", [`Bear → ${EL} (Rob)`]);
  answer(s, "declare-blockers", ["Wall blocks Bear"]);
  toMain2(s, 2);
  eq([loyalty(s, EL), s.objects[one(s, "Wall")].damage, s.players[0].life], [5, 2, 40], "the Wall blocks: Elspeth keeps 5, the Wall takes 2");
  /* A trampler blocked by a Squire: lethal to the Squire, the rest to Elspeth, none to Rob (CR 702.19b, 702.19f). */
  const t = play("trample", [at(0, "battlefield", EL, "Squire"), at(1, "battlefield", "Trampler")], [], {at: {turn: 2, phase: "MAIN1"}});
  answer(t, "declare-attackers", [`Trampler → ${EL} (Rob)`]);
  answer(t, "declare-blockers", ["Squire blocks Trampler"]);
  toMain2(t, 2);
  eq([loyalty(t, EL), t.players[0].life, named(t, "Squire").length], [2, 40, 0], "a 4/4 trampler through a 1/1: 1 to the Squire, 3 to Elspeth, none to Rob");
  /* Infect's damage removes loyalty: no -1/-1 counters, no poison (CR 120.3c). */
  const i = play("infect", [at(0, "battlefield", EL), at(1, "battlefield", "Plague")], [], {at: {turn: 2, phase: "MAIN1"}});
  answer(i, "declare-attackers", [`Plague → ${EL} (Rob)`]);
  toMain2(i, 2);
  eq([loyalty(i, EL), i.objects[one(i, EL)].counters["-1/-1"] ?? 0, i.players[0].poison ?? 0], [3, 0, 0], "infect: 2 loyalty gone, no -1/-1 counters, no poison");
}
{
  /* Gone before damage (CR 506.4c, 510.1b): the Bear and the Trampler still attack, attacking nothing, unblocked -- and deal
     no combat damage, the trampler's none to Rob (702.19f). */
  const s = play("gone", [at(0, "battlefield", EL), at(1, "battlefield", "Bear", "Trampler")], [], {at: {turn: 2, phase: "MAIN1"}});
  answer(s, "declare-attackers", [`Bear → ${EL} (Rob)`, `Trampler → ${EL} (Rob)`]);
  moveOne(s, one(s, EL), "graveyard", [], {owner: 0});
  eq(s.combat.attacks.map((a) => s.objects[a.attacker].card), ["Bear", "Trampler"], "Elspeth gone: both still attacking");
  toMain2(s, 2);
  eq(s.players[0].life, 40, "and Rob takes nothing");
  /* Someone else's before damage: removed from combat (506.4) -- Maya's own now, her creatures deal it nothing. */
  const t = play("stolen", [at(0, "battlefield", EL), at(1, "battlefield", "Bear")], [], {at: {turn: 2, phase: "MAIN1"}});
  answer(t, "declare-attackers", [`Bear → ${EL} (Rob)`]);
  t.objects[one(t, EL)].controller = 1;
  toMain2(t, 2);
  eq([loyalty(t, EL), t.players[0].life], [5, 40], "Elspeth Maya's before damage: 5 loyalty still, and Rob 40");
}
{
  /* Whom a creature can't attack (CR 508.1c): "can't attack you" does not reach Elspeth; "Inklings can't attack you or
     planeswalkers you control" (Combat Calligrapher) does; one that can't attack at all attacks neither. */
  const ward = play("can't attack you", [at(0, "battlefield", EL, "Ward"), at(1, "battlefield", "Bear")], [], {at: {turn: 2, phase: "MAIN1"}});
  eq(attackLabels(ward), [`Bear → ${EL} (Rob)`], "\"Creatures can't attack you\": the Bear may attack Elspeth, not Rob");
  const ink = play("Calligrapher", [at(0, "battlefield", EL, "Combat Calligrapher"), at(1, "battlefield", "Bear", "Inkling")], [], {at: {turn: 2, phase: "MAIN1"}});
  eq(attackLabels(ink), ["Bear → Rob", `Bear → ${EL} (Rob)`], "Combat Calligrapher: the Inkling attacks neither Rob nor Elspeth, the Bear either");
  const dread = play("can't attack", [at(0, "battlefield", EL, "Dread"), at(1, "battlefield", "Bear")]);
  eq([cantAttack(dread, one(dread, "Bear"), 0), cantAttack(dread, one(dread, "Bear"), 0, one(dread, EL))], [true, true], "\"can't attack\": Rob nor Elspeth");
  /* "A player it has already attacked this turn" (Port Razer; CR 506.3): an attack on Elspeth is not one on Rob. */
  const razer = play("Port Razer", [at(0, "battlefield", EL), at(1, "battlefield", "Port Razer")], [], {at: {turn: 2, phase: "MAIN1"}});
  answer(razer, "declare-attackers", [`Port Razer → ${EL} (Rob)`]);
  eq(cantAttack(razer, one(razer, "Port Razer"), 0), false, "Port Razer attacked Elspeth: it may still attack Rob in another combat");
}
{
  /* Taxes (CR 508.1g): Ghostly Prison's "can't attack you unless ..." costs nothing to attack Elspeth; "you or planeswalkers
     you control" (Baird; Sphere of Safety, X the enchantments Rob controls) costs as much as attacking Rob. */
  const s = play("Ghostly Prison", [at(0, "battlefield", EL, "Ghostly Prison"), at(1, "battlefield", "Bear")], [], {at: {turn: 2, phase: "MAIN1"}});
  const bear = one(s, "Bear"), el = one(s, EL);
  eq([attackTax(s, [{cardId: bear, defenderId: 0}]), attackTax(s, [{cardId: bear, defenderId: 0, planeswalkerId: el}])], [2, 0], "Ghostly Prison: {2} to attack Rob, nothing to attack Elspeth");
  answer(s, "declare-attackers", [`Bear → ${EL} (Rob)`]);
  toMain2(s, 2);
  eq(loyalty(s, EL), 3, "and Maya, with no mana, attacks her");
  const b = play("Baird", [at(0, "battlefield", EL, "Baird, Steward of Argive", "Sphere of Safety"), at(1, "battlefield", "Bear")]);
  eq([attackTax(b, [{cardId: one(b, "Bear"), defenderId: 0}]), attackTax(b, [{cardId: one(b, "Bear"), defenderId: 0, planeswalkerId: one(b, EL)}])], [2, 2],
    "Baird's {1} and Sphere of Safety's {1}: {2} to attack Rob, and {2} to attack Elspeth");
  /* Paid with a choice of lands (CR 508.1h): the Bear still attacks Elspeth once Maya picks. */
  const paid = play("Baird, paid", [at(0, "battlefield", EL, "Baird, Steward of Argive"), at(1, "battlefield", "Bear", "Island", "Wastes")], [], {at: {turn: 2, phase: "MAIN1"}});
  answer(paid, "declare-attackers", [`Bear → ${EL} (Rob)`]);
  eq([paid.awaiting?.kind, awaitingChoice(paid).options.map((o) => o.label)], ["attack-tax", ["Tap Island", "Tap Wastes"]], "Baird's {1}: Maya picks the land");
  resolveAwaiting(paid, [1]);
  eq(paid.combat.attacks.map((a) => [a.planeswalker, paid.objects[one(paid, "Wastes")].tapped]), [[one(paid, EL), true]], "the Wastes paid, and the Bear attacks Elspeth");
  assert.throws(() => runScenario({name: "Baird", setup: [at(0, "battlefield", EL, "Baird, Steward of Argive"), at(1, "battlefield", "Bear")], at: {turn: 2, phase: "MAIN1"},
    steps: [{attack: ["Bear"], at: `${EL} (Rob)`}]}, index.definition, FIX), /cost \{1\} to attack with, more than can be paid/, "Maya, with no mana, can't attack Elspeth past Baird");
  checks += 1;
}
{
  /* "Whenever a player attacks one of your opponents" (Combat Calligrapher, Rob's; CR 508.3e): Maya attacking Trey's
     Elspeth is not attacking Trey -- no Inkling. Attacking Trey, one. */
  const seat = () => play("Calligrapher's trigger", [at(0, "battlefield", "Combat Calligrapher"), at(1, "battlefield", "Bear"), at(2, "battlefield", EL)], [], {seats: 3, at: {turn: 2, phase: "MAIN1"}});
  const pw = seat();
  answer(pw, "declare-attackers", [`Bear → ${EL} (Trey)`]);
  toMain2(pw, 2);
  eq([named(pw, "Inkling").length, loyalty(pw, EL)], [0, 3], "Maya's Bear at Trey's Elspeth: no Inkling");
  const player = seat();
  answer(player, "declare-attackers", ["Bear → Trey"]);
  toMain2(player, 2);
  eq([named(player, "Inkling").length, player.players[2].life], [1, 36], "at Trey: a 2/1 Inkling attacking him too");
  /* "They draw a card if none of those creatures attacked you" (Firemane Commando, Rob's): two at his Elspeth attacked
     not him -- Maya draws. One at Rob, and she does not. */
  const firemane = (labels) => {
    const s = play("Firemane Commando", [at(0, "battlefield", "Firemane Commando", EL), at(1, "battlefield", "Bear", "Squire")], [], {at: {turn: 2, phase: "MAIN1"}});
    const before = s.zones.hand[1].length;
    answer(s, "declare-attackers", labels);
    toMain2(s, 2);
    return s.zones.hand[1].length - before;
  };
  eq([firemane([`Bear → ${EL} (Rob)`, `Squire → ${EL} (Rob)`]), firemane([`Bear → ${EL} (Rob)`, "Squire → Rob"])], [1, 0],
    "Firemane Commando: both at Elspeth, Maya draws; one at Rob, she does not");
  /* "Attack one of your opponents or a planeswalker they control" (Frontier Warmonger): Rob's Bear at Maya's Elspeth gains
     menace. */
  const war = play("Frontier Warmonger", [at(0, "battlefield", "Frontier Warmonger", "Bear"), at(1, "battlefield", EL)], [{attack: ["Bear"], at: `${EL} (Maya)`}, {resolve: true}]);
  ok(keywordsOf(war, one(war, "Bear")).includes("Menace"), "Frontier Warmonger: the Bear attacking Elspeth gains menace");
  /* Without those words, an attack on her is not one on Maya: the Raider's trigger sees Maya attacked, not Elspeth. */
  const raid = (where) => play("Raider", [at(0, "battlefield", "Raider", "Bear"), at(1, "battlefield", EL)], [{attack: ["Bear"], at: where}, {settle: true}, {to: {turn: 1, phase: "MAIN2"}}]).players[0].life;
  eq([raid(`${EL} (Maya)`), raid("Maya")], [40, 41], "\"attacks one of your opponents\": at Elspeth, nothing; at Maya, 1 life");
}
{
  /* Ninjutsu (CR 702.49c): the Ninja attacks Maya's Elspeth, as the Bear it replaced did; its 2 damage is hers, and no
     player was dealt any -- nothing to draw. */
  const ninja = "Ninja of the Deep Hours";
  const s = play("ninjutsu", [at(0, "battlefield", "Bear", "Island", "Wastes"), at(0, "hand", ninja), at(1, "battlefield", EL)],
    [{attack: ["Bear"], at: `${EL} (Maya)`}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}, {tap: "Island"}, {tap: "Wastes"},
      {activate: ninja, sacrifice: "Bear"}, {resolve: true}]);
  eq(s.combat.attacks.filter((a) => s.objects[a.attacker]?.zone === "battlefield").map((a) => [s.objects[a.attacker].card, a.planeswalker]), [[ninja, one(s, EL)]],
    "the Ninja attacks Elspeth");
  toMain2(s, 1);
  eq([loyalty(s, EL), s.players[1].life], [3, 40], "and deals her 2");
  /* Elspeth gone before the Ninja is put in: it enters tapped, attacking nothing (CR 506.3c, 508.4a). */
  const t = play("ninjutsu, Elspeth gone", [at(0, "battlefield", "Bear", "Island", "Wastes"), at(0, "hand", ninja), at(1, "battlefield", EL)],
    [{attack: ["Bear"], at: `${EL} (Maya)`}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}, {tap: "Island"}, {tap: "Wastes"}]);
  moveOne(t, one(t, EL), "graveyard", [], {owner: 1});
  applyAction(t, 0, legalActions(t, 0).find((a) => a.kind === "activate" && a.label === ninja && (a.costNames ?? []).includes("Bear")));
  until(t, (u) => u.stack.length === 0, "the Ninja's ability resolves");
  const put = one(t, ninja);
  eq([t.objects[put].tapped, t.combat.attacks.some((a) => a.attacker === put)], [true, false], "the Ninja enters tapped, and is not attacking");
}
{
  /* The house pilot: a loyalty ability in its main phase, the one that costs least -- Elspeth's -1 on its creatures; with
     none, "up to two target creatures you control" would do nothing, so -2's Soldiers. */
  const pilot = (seat) => housePilot({seat, cards: (name) => index.definition(name)});
  const armed = play("the pilot's creatures", [at(0, "battlefield", EL, "Bear", "Squire")]);
  const pick = pilot(0).choose(projectFor(armed, 0), legalActions(armed, 0));
  eq([pick.kind, pick.loyalty, pick.targets], ["activate", -1, [{kind: "choose", min: 0, max: 2, of: 2}]], "with two creatures: -1, its two to pick");
  const bare = play("the pilot's none", [at(0, "battlefield", EL)]);
  const none = pilot(0).choose(projectFor(bare, 0), legalActions(bare, 0));
  eq([none.kind, none.loyalty], ["activate", -2], "with none: -2");
  /* It attacks players, not planeswalkers. */
  const s = play("the pilot attacks", [at(0, "battlefield", EL), at(1, "battlefield", "Bear")], [], {at: {turn: 2, phase: "MAIN1"}});
  attackLabels(s);
  const choice = awaitingChoice(s);
  eq(pilot(1).answer(projectFor(s, 1), choice).indices.map((i) => choice.options[i].label), ["Bear → Rob"], "Maya's pilot attacks Rob, not Elspeth");
  const warded = play("the pilot, only Elspeth", [at(0, "battlefield", EL, "Ward"), at(1, "battlefield", "Bear")], [], {at: {turn: 2, phase: "MAIN1"}});
  eq(attackLabels(warded), [`Bear → ${EL} (Rob)`], "with Rob's Ward, the Bear may attack only Elspeth");
  eq(pilot(1).answer(projectFor(warded, 1), awaitingChoice(warded)).indices, [], "and the pilot, which attacks players, does not attack");
  /* At 3 life, it chump-blocks a 5/5 coming at it -- not one coming at its Elspeth. */
  const block = (label) => {
    const t = play("the pilot blocks", [at(0, "battlefield", EL, "Squire"), at(1, "battlefield", "Brute")], [], {at: {turn: 2, phase: "MAIN1"}});
    t.players[0].life = 3;
    answer(t, "declare-attackers", [label]);
    until(t, (u) => u.awaiting?.kind === "declare-blockers", "Rob is asked to block");
    const asked = awaitingChoice(t);
    return pilot(0).answer(projectFor(t, 0), asked).indices.map((i) => asked.options[i].label);
  };
  eq([block("Brute → Rob"), block(`Brute → ${EL} (Rob)`)], [["Squire blocks Brute"], []], "Rob's pilot at 3: chumps the Brute at Rob, lets the one at Elspeth through");
}
{
  /* The schema: "or planeswalkers you control" is planeswalkers: true, on a tax or a "can't attack you". */
  const script = JSON.parse(readFileSync(new URL("../game/engine/cards/c/combat-calligrapher.json", import.meta.url), "utf8"));
  eq(validateScript(script).errors, [], "Combat Calligrapher validates");
  const restrict = (change) => ({...script, abilities: script.abilities.map((a) => (a.rule === "cant-attack" ? {...a, ...change} : a))});
  eq([validateScript(restrict({planeswalkers: false})).errors.map((e) => e.path), validateScript(restrict({defender: "owner"})).errors.map((e) => e.path)],
    [["abilities[1].planeswalkers"], ["abilities[1].planeswalkers"]], "planeswalkers: false, or on a restriction on attacking another, is refused");
  const warmonger = JSON.parse(readFileSync(new URL("../game/engine/cards/f/frontier-warmonger.json", import.meta.url), "utf8"));
  const trigger = (change) => ({...warmonger, abilities: warmonger.abilities.map((a) => (a.kind === "triggered" ? {...a, trigger: {...a.trigger, ...change}} : a))});
  eq([validateScript(warmonger).errors, validateScript(trigger({planeswalkers: false})).errors.map((e) => e.path), validateScript(trigger({defender: undefined})).errors.map((e) => e.path)],
    [[], ["abilities[0].trigger.planeswalkers"], ["abilities[0].trigger.planeswalkers"]], "an attack trigger's planeswalkers: true, beside defender: \"opponent\" only");
  ok(["Baird, Steward of Argive", "Combat Calligrapher", "Sandwurm Convergence", "Sphere of Safety"].every((name) =>
    index.definition(name).abilities.some((a) => ["cant-attack", "attack-tax"].includes(a.rule) && a.planeswalkers === true)), "the four that say \"or planeswalkers you control\" say so");
}

console.log(`engine-planeswalkers: ${checks} checks passed -- a planeswalker enters with its loyalty and spends it once a turn at sorcery speed, loses it to damage and is put into the graveyard at none; attacked, it is defended by its controller, takes the combat damage its controller would have, and attacking it is not attacking them.`);
