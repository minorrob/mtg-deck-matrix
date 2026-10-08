/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN B (X11), THE LAST CARDS -- COUNTERS MOVED, A KIND OF COUNTER CHOSEN, "ONLY ONCE EACH TURN", AND EXTRA TURNS: what
 * Tidus, Yuna's Guardian's and Ichormoon Gauntlet's scenarios cannot reach.
 *
 *   moveCounters (CR 122.5; script/effects/resources.mjs): all or nothing
 *   counterKind (script/effects/asking.mjs): "choose a counter on target permanent", "move a counter" -- which kind, its
 *     controller's question when there are two or more, answerable by both pilots
 *   onceEachTurn ("do this only once each turn", Tidus's Cheer; cards/index.mjs, effects/asking.mjs modal)
 *   addTurn (CR 500.7; script/effects/turns.mjs, rules/turn.mjs): the most recently created first, in APNAP order, and the
 *     turn order resumed after them -- nobody asked; the history says so; a game with one waiting survives a save
 *   the planeswalker abilities Ichormoon Gauntlet gives (CR 606.3, 606.6), and the construct credits
 */
import {checks, creature} from "./helpers/train-b6.mjs";
import {createState, addObject, moveObject} from "../game/engine/state/index.mjs";
import {moveCounters, putCounter} from "../game/engine/script/effects/resources.mjs";
import {counterKind, modal} from "../game/engine/script/effects/asking.mjs";
import {addTurn} from "../game/engine/script/effects/turns.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {historyLines} from "../game/room/history.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";

const t = checks("engine-x11-turns-counters");
const table = (seats = 4) => createState({matchId: "x11", seed: "x11", players: ["Rob", "Maya", "Trey", "Sam"].slice(0, seats).map((name) => ({name}))});
const put = (s, object, seat, zone = "battlefield") => addObject(s, {...object, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
const index = loadCardIndex();
const probe = (ability) => ({schema: "CrankCardScript@1", identity: {name: "Probe", oracleId: "x11-probe", types: ["Enchantment"], subtypes: [], manaCost: "{U}", colors: ["U"], colorIdentity: ["U"]},
  oracleText: ability.text, source: "hand", abilities: [ability]});

/* ---- moveCounters (CR 122.5) ---- */
{
  const s = table(), ctx = {controller: 0};
  const a = put(s, creature("A"), 0), b = put(s, creature("B"), 0), gone = put(s, creature("Gone"), 0);
  s.objects[a].counters["+1/+1"] = 2;
  const events = moveCounters(s, {from: [a], targets: [b], counter: "+1/+1", count: 1}, ctx);
  t.eq([s.objects[a].counters["+1/+1"], s.objects[b].counters["+1/+1"], events.map((e) => [e.data.fields.card.name, e.data.fields.oldValue, e.data.fields.newValue])],
    [1, 1, [["A", 2, 1], ["B", 0, 1]]], "one +1/+1 counter off A and onto B, each change reported");
  t.eq([moveCounters(s, {from: [a], targets: [a], counter: "+1/+1", count: 1}, ctx), s.objects[a].counters["+1/+1"]], [[], 1], "onto the same object: no move at all, nothing removed or put on");
  moveCounters(s, {from: [a], targets: [b], counter: "flying", count: 1}, ctx);
  t.eq([s.objects[a].counters.flying, s.objects[b].counters.flying], [undefined, undefined], "a kind it has not got: nothing moves");
  moveCounters(s, {from: [a], targets: [b], counter: "+1/+1", count: 2}, ctx);
  t.eq([s.objects[a].counters["+1/+1"], s.objects[b].counters["+1/+1"]], [1, 1], "two asked of one there: nothing moves, all or nothing");
  const yard = moveObject(s, gone, "graveyard", 0);
  moveCounters(s, {from: [a], targets: [yard], counter: "+1/+1", count: 1}, ctx);
  t.eq(s.objects[a].counters["+1/+1"], 1, "onto a card no longer on the battlefield: none removed either");
  s.objects[yard].counters["+1/+1"] = 1;
  moveCounters(s, {from: [yard], targets: [b], counter: "+1/+1", count: 1}, ctx);
  t.eq(s.objects[b].counters["+1/+1"], 1, "and from one no longer there: none put on");
  t.throws(() => moveCounters(s, {from: [a], targets: [b], counter: "chosen", count: 1}, ctx), /asks its controller which/, "a chosen kind is never moved here: it is asked first");
  t.throws(() => putCounter(s, {targets: [a], counter: "chosen", count: 1}, ctx), /asks its controller which/, "nor put on here");
  const bad = compileScript(probe({kind: "spell", text: "Move a counter.", effects: [{effect: "moveCounters", count: 1}]}));
  t.ok(bad.problems.some((p) => /`from`/.test(p)) && bad.problems.some((p) => /`targets`/.test(p)) && bad.problems.some((p) => /kind of counter/.test(p)),
    `moveCounters without its from, targets or kind is refused at the schema (${bad.problems.length} problems)`);
}

/* ---- which kind of counter ---- */
{
  const s = table(), ctx = {controller: 1};
  const bird = put(s, creature("Bird"), 1), bear = put(s, creature("Bear"), 1), plain = put(s, creature("Plain"), 1);
  Object.assign(s.objects[bird].counters, {"+1/+1": 1, flying: 1});
  s.objects[bear].counters["+1/+1"] = 2;
  const then = (on) => ({then: {effect: "putCounter", targets: [on], counter: "chosen", count: 1}});
  t.eq(counterKind.open(s, then(bird), ctx), true, "two kinds on the Bird: a question");
  const choice = counterKind.choice(s, s.awaiting);
  t.eq([s.awaiting.player, choice.mode, choice.options.map((o) => o.label)], [1, "one", ["+1/+1 counter (1 on Bird)", "flying counter (1 on Bird)"]], "asked of the ability's controller, Maya: one of the kinds there");
  const house = housePilot({seat: 1}).answer(projectFor(s, 1), choice), random = randomLegalPilot(createRng("x11")).answer(choice);
  t.ok([house, random].every((a) => a.indices.length === 1 && choice.options[a.indices[0]]), "both pilots answer it within its bounds");
  counterKind.apply(s, s.awaiting, [1]);
  t.eq(s.objects[bird].counters, {"+1/+1": 1, flying: 2}, "the kind chosen gets another");
  s.awaiting = null;
  const one = counterKind.open(s, then(bear), ctx);
  t.eq([one.events.length, s.awaiting, s.objects[bear].counters["+1/+1"]], [1, null, 3], "one kind there is no choice (CR 122.1): that one, nobody asked");
  t.eq([counterKind.open(s, then(plain), ctx).events, s.objects[plain].counters], [[], {}], "no counter on it, nothing to choose: nothing happens");
  t.throws(() => counterKind.apply(s, {...counterKind, kinds: [{kind: "+1/+1", n: 1}], then: then(bird).then, player: 1}, [3]), /Invalid selection/, "an answer that is no option is refused");
  /* A move reads its `from`: the kinds on the first object, not the second. */
  const tidus = put(s, creature("Tidus"), 1);
  counterKind.open(s, {then: {effect: "moveCounters", from: [bird], targets: [tidus], counter: "chosen", count: 1}}, ctx);
  t.eq(counterKind.choice(s, s.awaiting).options.map((o) => o.label), ["+1/+1 counter (1 on Bird)", "flying counter (2 on Bird)"], "a move asks about what it moves from");
  counterKind.apply(s, s.awaiting, [1]);
  t.eq([s.objects[bird].counters.flying, s.objects[tidus].counters.flying], [1, 1], "and moves the kind chosen");
}

/* ---- "do this only once each turn" ---- */
{
  const s = table(3), source = put(s, creature("Tidus"), 0), other = put(s, creature("Another"), 0);
  const params = {effect: "modal", title: "Cheer", onceEachTurn: "a1", modes: [{text: "Yes", effects: [{effect: "draw", count: 1}], once: true}, {text: "No", effects: []}]};
  const at = (id) => ({controller: 0, source: id});
  t.eq(modal.open(s, params, at(source)), true, "the first time this turn it asks, Yes or No");
  modal.apply(s, s.awaiting, [1]);
  s.awaiting = null;
  t.eq(modal.open(s, params, at(source)), true, "declined, it may still be done: it asks again");
  t.eq(modal.apply(s, s.awaiting, [0]).splice, [{effect: "draw", count: 1}], "Yes: the draw follows");
  s.awaiting = null;
  t.eq([modal.open(s, params, at(source)), s.awaiting], [false, null], "done once this turn: only No is left, and nothing is asked");
  t.eq(modal.open(s, params, at(other)), true, "another permanent's ability is its own");
  s.awaiting = null;
  t.eq(modal.open(s, {...params, onceEachTurn: undefined}, at(source)), true, "a \"you may\" with no such limit asks every time");
  s.awaiting = null;
  s.turn += 1;
  t.eq(modal.open(s, params, at(source)), true, "next turn it may be done again");
  const refused = compileScript(probe({kind: "triggered", text: "At the beginning of your upkeep, draw a card. Do this only once each turn.", trigger: {on: "upkeep"}, effects: [{effect: "draw", count: 1}], onceEachTurn: true}));
  t.ok(refused.definition === null && refused.problems.some((p) => /onceEachTurn: true, on a "you may"/.test(p)), "only a \"you may\" says it");
  const tidus = index.definition("Tidus, Yuna's Guardian").abilities.find((a) => /Cheer/.test(a.text));
  t.eq([tidus.effects[0].onceEachTurn, tidus.effects[0].modes.map((m) => m.once === true)], [tidus.id, [true, false]], "Tidus's Cheer compiles to a Yes that is done once a turn");
}

/* ---- extra turns (CR 500.7) ---- */
const pilotless = (s, rng) => {
  /* The rules loop with nobody doing anything: pass, advance, no attackers, no blockers. */
  if (s.awaiting) { const choice = awaitingChoice(s); resolveAwaiting(s, choice.min ? choice.options.slice(0, choice.min).map((o) => o.index) : [], null, rng); return; }
  if (s.priorityPlayer === null) { advance(s); return; }
  if (passPriority(s, null, rng).outcome === "step-ends") advance(s);
};
/* A table to play turns on: twenty cards in each library, so nobody draws from an empty one. */
const stocked = (seats) => {
  const s = table(seats);
  for (let seat = 0; seat < seats; seat += 1) for (let n = 0; n < 20; n += 1) put(s, {card: "Wastes", types: ["Land"]}, seat, "library");
  return s;
};
const turnsOf = (s, n, rng = createRng("x11-turns"), log = []) => {
  for (let guard = 0; guard < 20000 && log.length < n; guard += 1) {
    const before = s.turn;
    pilotless(s, rng);
    if (s.turn !== before) log.push([s.turn, s.players[s.activePlayer].name, s.extraTurn === true]);
  }
  return log;
};
{
  const s = stocked(3);
  beginGame(s);
  const events = addTurn(s, {who: "each"}, {controller: 0});
  t.eq([events.map((e) => e.data.fields.player.name), s.extraTurns.map((e) => e.player)], [["Rob", "Maya", "Trey"], [0, 1, 2]], "each player given one: added one at a time in APNAP order");
  t.eq(turnsOf(s, 5), [[2, "Trey", true], [3, "Maya", true], [4, "Rob", true], [5, "Maya", false], [6, "Trey", false]],
    "the most recently created first -- Trey's, Maya's, Rob's -- then the order goes on after Rob's turn: Maya, Trey");
}
{
  const s = stocked(3);
  beginGame(s);
  addTurn(s, {who: [1]}, {controller: 0});
  const log = turnsOf(s, 1);
  addTurn(s, {who: [2]}, {controller: 1});
  addTurn(s, {who: [0], count: 2}, {controller: 1});
  t.eq([log, turnsOf(s, 5)], [[[2, "Maya", true]], [[3, "Rob", true], [4, "Rob", true], [5, "Trey", true], [6, "Maya", false], [7, "Trey", false]]],
    "made during an extra turn, taken before those waiting (Trey's waits for Rob's two); and then Maya's own turn, after Rob's -- not the player after her");
}
{
  const s = stocked(4);
  beginGame(s);
  addTurn(s, {who: [2]}, {controller: 0});
  addTurn(s, {who: "you"}, {controller: 1});
  s.players[2].lost = true;
  t.eq(turnsOf(s, 3), [[2, "Maya", true], [3, "Maya", false], [4, "Sam", false]], "an extra turn of a player who has left the game is not taken (CR 800.4a), and the order skips them");
  t.eq(addTurn(s, {who: [2]}, {controller: 0}).length, 0, "nor is one given to them: a player who has left is no player an effect names");
}
{
  /* APNAP from the active player (CR 101.4): on Maya's turn, Maya's, Trey's and then Rob's are made -- Rob's taken first --
     and after them the order goes on from Maya's turn, to Trey. */
  const s = stocked(3);
  beginGame(s);
  turnsOf(s, 1);
  addTurn(s, {who: "each"}, {controller: 1});
  t.eq(s.extraTurns.map((e) => e.player), [1, 2, 0], "on Maya's turn, APNAP is Maya, Trey, Rob");
  t.eq(turnsOf(s, 4), [[3, "Rob", true], [4, "Trey", true], [5, "Maya", true], [6, "Trey", false]], "taken Rob, Trey, Maya; then Trey, after Maya's turn");
}
{
  /* "Until your next turn" of a player who has left the game ends as that turn would have begun (CR 800.4m): never at an
     extra turn, which begins in nobody's place, and at the first turn in the order that passes that player's seat. */
  const s = stocked(4);
  beginGame(s);
  turnsOf(s, 2);
  s.players[1].lost = true;
  (s.effects ??= []).push({id: "maya-until", layer: 7, sublayer: "c", affects: {ids: []}, apply: {power: 0}, until: "your-next-turn", sourceController: 1, timestamp: 0});
  addTurn(s, {who: [0]}, {controller: 2});
  addTurn(s, {who: "you"}, {controller: 2});
  const lasts = () => (s.effects ?? []).some((e) => e.id === "maya-until");
  const seen = [];
  for (let n = 0; n < 5; n += 1) { const [[turn, name, extra]] = turnsOf(s, 1); seen.push([turn, name, extra, lasts()]); }
  t.eq(seen, [[4, "Trey", true, true], [5, "Rob", true, true], [6, "Sam", false, true], [7, "Rob", false, true], [8, "Trey", false, false]],
    "Maya's effect lasts through Trey's and Rob's extra turns and Sam's turn after Trey's, and ends at Trey's, whose turn passes her seat");
}
{
  /* A game with an extra turn waiting is plain state: saved and resumed, it goes the same way. */
  const s = stocked(3);
  beginGame(s);
  addTurn(s, {who: [2]}, {controller: 0});
  const saved = JSON.parse(JSON.stringify(s));
  t.eq(turnsOf(saved, 2), turnsOf(s, 2), "a save with an extra turn waiting resumes the same: Trey's extra turn, then Maya's");
  const untap = [{kind: "GameEventTurnPhase", data: {turn: 2, fields: {phase: "UNTAP", playerTurn: {playerId: 2}, extraTurn: true}}}];
  t.eq(historyLines(untap[0], ["Rob", "Maya", "Trey"]).map((l) => l.text), ["Turn 2 · Trey (an extra turn)"], "the history says an extra turn is one");
}

/* ---- the abilities Ichormoon Gauntlet gives (CR 606) ---- */
{
  const s = stocked(2);
  const gauntlet = index.definition("Ichormoon Gauntlet");
  addObject(s, {...gauntlet, card: "Ichormoon Gauntlet", owner: 0, controller: 0}, "battlefield");
  const walker = addObject(s, {card: "Walker", types: ["Planeswalker"], subtypes: ["Jace"], manaCost: "{2}{U}{U}", loyalty: 11, owner: 0, controller: 0}, "battlefield");
  s.objects[walker].counters.loyalty = 11;
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) pilotless(s, createRng("x11-gauntlet"));
  const loyal = () => legalActions(s, 0).filter((a) => a.kind === "activate" && a.objectId === walker);
  t.eq(loyal().map((a) => a.loyalty), [0], "eleven loyalty: the 0 is offered, the -12 is not (CR 606.6)");
  s.objects[walker].counters.loyalty = 12;
  t.eq(loyal().map((a) => a.loyalty), [0, -12], "twelve: both");
  s.objects[walker].counters.loyalty = 13;
  applyAction(s, 0, loyal().find((a) => a.loyalty === -12));
  t.eq([s.objects[walker].counters.loyalty, loyal()], [1, []], "activated: twelve removed as its cost, and no other loyalty ability of it this turn (CR 606.3)");
}
t.eq([missingFor({apis: ["MoveCounter", "AddTurn"]}), missingFor({apis: ["ReplaceCounter"]}).length], [[], 1], "the constructs MoveCounter and AddTurn read as built; one still unbuilt does not");

t.done();
