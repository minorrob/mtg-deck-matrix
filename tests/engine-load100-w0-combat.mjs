/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* CR 702.19b: a trampler's controller may assign excess to the blocker, including a single blocker. */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {combatDamage} from "../game/engine/rules/combat.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {KEYWORD_FAMILIES} from "../game/engine/keywords/combat.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {leastAnswer} from "../game/room/room.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
function combat({power = 5, toughness = 2, keywords = ["Trample"], damage = 0, walker = false} = {}) {
  const state = createState({matchId: "load100-combat", seed: "combat", players: ["Rob", "Maya", "Trey", "Lee"].map((name) => ({name}))});
  state.turn = 1; state.activePlayer = 0; state.phase = "COMBAT_DAMAGE";
  const attacker = addObject(state, {card: "Smoke trampler", owner: 0, controller: 0, types: ["Creature"], power, toughness: 8, keywords}, "battlefield");
  const blocker = addObject(state, {card: "Smoke blocker", owner: 1, controller: 1, types: ["Creature"], power: 0, toughness, damage}, "battlefield");
  const planeswalker = walker ? addObject(state, {card: "Smoke planeswalker", owner: 1, controller: 1, types: ["Planeswalker"], counters: {loyalty: 4}}, "battlefield") : undefined;
  state.objects[blocker].damage = damage;
  if (walker) state.objects[planeswalker].counters.loyalty = 4;
  state.combat = {attackingPlayerId: 0, defenders: [1], attacks: [{attacker, defender: 1, blocked: true, blockers: [blocker], ...(walker ? {planeswalker} : {})}]};
  return {state, attacker, blocker, planeswalker};
}
const assign = (state, amounts) => {
  combatDamage.resolve(state, state.awaiting, amounts);
  return combatDamage.deal(state);
};
eq(KEYWORD_FAMILIES.combat.includes("Trample Over Planeswalkers"), true, "the variant is registered among combat keywords");
{
  const compiled = compileScript({schema: "CrankCardScript@1", identity: {name: "Smoke variant", oracleId: "smoke-variant", types: ["Creature"], manaCost: "{5}{G}", power: 7, toughness: 7},
    oracleText: "Trample over planeswalkers", abilities: [{kind: "keyword", text: "Trample over planeswalkers", keyword: "trample over planeswalkers"}]});
  eq([compiled.problems, compiled.definition.keywords], [[], ["Trample Over Planeswalkers"]], "normal script compilation uses the registered canonical keyword spelling");
}

{
  const {state, blocker} = combat();
  eq(combatDamage.open(state), true, "a single blocker does not take away the attacker's choice");
  eq(state.awaiting.player, 0, "the attacking creature's controller assigns it");
  eq(combatDamage.choice(state, state.awaiting).options.map((option) => [option.cardId ?? null, option.defender, option.lethal]),
    [[blocker, false, 2], [null, true, 0]], "both the blocker and defending player are offered");
  assign(state, [5, 0]);
  eq([state.objects[blocker].damage, state.players[1].life], [5, 40], "all five may be assigned to the blocker");
}
{
  const {state, blocker} = combat();
  combatDamage.open(state);
  assert.throws(() => combatDamage.resolve(state, state.awaiting, [1, 4]), /lethal/); checks += 1;
  assign(state, [2, 3]);
  eq([state.objects[blocker].damage, state.players[1].life], [2, 37], "or lethal to the blocker and three to the defender");
}
{
  const {state, blocker} = combat({keywords: ["Trample", "Deathtouch"], toughness: 7});
  combatDamage.open(state);
  eq(combatDamage.choice(state, state.awaiting).options[0].lethal, 1, "deathtouch changes the lethal threshold");
  assign(state, [1, 4]);
  eq([state.objects[blocker].damage, state.players[1].life], [1, 36], "the chosen deathtouch division is dealt");
}
{
  const {state} = combat({power: 2, toughness: 5});
  eq(combatDamage.open(state), false, "without excess there is only one legal assignment");
}
{
  const {state, blocker} = combat({keywords: []});
  eq(combatDamage.open(state), false, "one blocker without trample has no division choice");
  combatDamage.deal(state);
  eq([state.objects[blocker].damage, state.players[1].life], [5, 40], "all damage goes to that blocker");
}
{
  const {state, planeswalker} = combat({walker: true});
  combatDamage.open(state);
  eq(combatDamage.choice(state, state.awaiting).options[1].planeswalkerId, planeswalker,
    "ordinary trample reaches the attacked planeswalker");
  assign(state, [2, 3]);
  eq([state.objects[planeswalker].counters.loyalty, state.players[1].life], [1, 40],
    "ordinary trample does not reach the planeswalker's controller");
}
{
  const {state, blocker, planeswalker} = combat({walker: true});
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== planeswalker);
  delete state.objects[planeswalker];
  eq(combatDamage.open(state), false, "a departed planeswalker is not a damage recipient");
  combatDamage.deal(state);
  eq([state.objects[blocker].damage, state.players[1].life], [5, 40], "the blocker receives all assigned damage");
}
{
  const {state, blocker} = combat({keywords: ["Trample", "Double Strike"], toughness: 8, damage: 4});
  state.phase = "COMBAT_FIRST_STRIKE_DAMAGE";
  combatDamage.open(state, "first");
  eq(combatDamage.choice(state, state.awaiting).options[0].lethal, 4, "already marked damage counts toward lethal");
  combatDamage.resolve(state, state.awaiting, [5, 0]);
  state.objects[blocker].damage = 5;
  state.phase = "COMBAT_DAMAGE";
  eq(combatDamage.open(state, "regular"), true, "a surviving blocker permits a fresh division in the regular step");
}

function walkerCombat({keywords = ["Trample Over Planeswalkers"], power = 7, blocker = false, second = false,
  secondPower = 1, secondKeywords = []} = {}) {
  let state = createState({matchId: "walker-combat", seed: "walker", players: ["Rob", "Maya", "Trey", "Lee"].map(name => ({name}))});
  for (let player = 0; player < 4; player += 1) for (let i = 0; i < 40; i += 1)
    addObject(state, {card: `Library ${player} ${i}`, owner: player, controller: player}, "library", player);
  beginGame(state);
  const attacker = addObject(state, {card: "Smoke walker trampler", owner: 0, controller: 0, types: ["Creature"], power, toughness: 8, keywords}, "battlefield");
  const walker = addObject(state, {card: "Smoke walker", owner: 1, controller: 1, types: ["Planeswalker"], counters: {loyalty: 4}}, "battlefield");
  state.objects[walker].counters.loyalty = 4;
  const guard = blocker ? addObject(state, {card: "Smoke guard", owner: 1, controller: 1, types: ["Creature"], power: 0, toughness: 2}, "battlefield") : null;
  const other = second ? addObject(state, {card: "Smoke other attacker", owner: 0, controller: 0, types: ["Creature"], power: secondPower, toughness: 2, keywords: secondKeywords}, "battlefield") : null;
  const drive = (until) => {
    for (let n = 0; n < 900; n += 1) {
      if (until()) return;
      if (state.awaiting) throw new Error(`Unexpected choice ${state.awaiting.kind}`);
      if (state.priorityPlayer !== null) { if (passPriority(state).outcome === "step-ends") advance(state); }
      else advance(state);
    }
    throw new Error("Combat did not reach the requested state");
  };
  // Finish initial turn choices explicitly before the first attack this creature may declare.
  for (let n = 0; n < 900 && !(state.turn > 1 && state.activePlayer === 0 && state.awaiting?.kind === "declare-attackers"); n += 1) {
    if (state.awaiting) resolveAwaiting(state, awaitingChoice(state).mode === "many" ? [] : [0]);
    else advance(state);
  }
  let choice = awaitingChoice(state);
  resolveAwaiting(state, [attacker, ...(other ? [other] : [])].map(id => choice.options.findIndex(o => o.cardId === id && o.planeswalkerId === walker)));
  drive(() => state.awaiting?.kind === "declare-blockers");
  choice = awaitingChoice(state);
  resolveAwaiting(state, guard ? [choice.options.findIndex(o => o.cardId === guard && o.attackerId === attacker)] : []);
  return {get state() { return state; }, attacker, walker, guard, other, drive, reload() { state = JSON.parse(JSON.stringify(state)); }};
}
{
  const game = walkerCombat({blocker: true});
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  eq(awaitingChoice(game.state).options.map(o => o.cardId ?? o.planeswalkerId ?? o.playerId), [game.guard, game.walker, 1], "blocked variant offers blocker, walker, and controller separately");
  assert.throws(() => resolveAwaiting(game.state, [], [1, 4, 2]), /lethal/); checks += 1;
  const events = resolveAwaiting(game.state, [], [2, 4, 1]);
  eq([game.state.players[1].life, game.state.zones.graveyard[1].map(id => game.state.objects[id].card).sort()],
    [39, ["Smoke guard", "Smoke walker"]], "chosen legal blocked division kills blocker and walker and hits player");
  eq(events.filter(e => e.kind === "GameEventCardDamaged").map(e => e.data.fields.amount), [2, 4], "each permanent is dealt its chosen damage once");
}
{
  const game = walkerCombat();
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  resolveAwaiting(game.state, [], [7, 0]);
  eq(game.state.players[1].life, 40, "the player may put all excess on the walker");
}
{
  const game = walkerCombat({keywords: ["Trample"]});
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  eq([game.state.awaiting, game.state.players[1].life, game.state.zones.graveyard[1].length], [null, 40, 1], "ordinary trample deals all unblocked damage to the walker");
}
{
  const game = walkerCombat({second: true});
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  eq(awaitingChoice(game.state).options[1].requires[0].amount, 3, "other unblocked damage being assigned reduces the loyalty threshold");
  resolveAwaiting(game.state, [], [3, 4]);
  eq([game.state.players[1].life, game.state.zones.graveyard[1].length], [36, 1], "shared simultaneous loyalty damage permits four excess to the player");
}
{
  const game = walkerCombat({power: 3, second: true, secondPower: 3, secondKeywords: ["Trample Over Planeswalkers"]});
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  eq(awaitingChoice(game.state).mode, "one", "cooperating allocations first ask which creature to assign or revise");
  const source = id => resolveAwaiting(game.state, [awaitingChoice(game.state).options.findIndex(o => o.cardId === id)]);
  const confirm = () => resolveAwaiting(game.state, [awaitingChoice(game.state).options.findIndex(o => o.confirmDamage)]);
  assert.throws(confirm, /every creature/); checks += 1;
  source(game.attacker); resolveAwaiting(game.state, [], [1, 2]);
  source(game.other); resolveAwaiting(game.state, [], [2, 1]);
  game.reload();
  assert.throws(confirm, /loyalty/); checks += 1;
  eq([game.state.objects[game.walker].counters.loyalty, game.state.players[1].life], [4, 40], "an illegal whole assignment deals no partial damage");
  source(game.attacker); resolveAwaiting(game.state, [], [2, 1]);
  const events = confirm();
  eq([game.state.players[1].life, game.state.zones.graveyard[1].length], [38, 1], "revised shared allocations are legal even though neither creature alone assigns four loyalty damage");
  eq(events.filter(e => e.kind === "GameEventPlayerDamaged").map(e => e.data.fields.amount), [1, 1], "each revised player allocation is dealt exactly once after confirmation");
}
{
  const game = walkerCombat({blocker: true, second: true, secondPower: 3, secondKeywords: ["Trample Over Planeswalkers"]});
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  const source = id => resolveAwaiting(game.state, [awaitingChoice(game.state).options.findIndex(o => o.cardId === id)]);
  const confirm = () => resolveAwaiting(game.state, [awaitingChoice(game.state).options.findIndex(o => o.confirmDamage)]);
  source(game.attacker); resolveAwaiting(game.state, [], [1, 4, 2]);
  source(game.other); resolveAwaiting(game.state, [], [0, 3]);
  assert.throws(confirm, /lethal/); checks += 1;
  source(game.attacker); resolveAwaiting(game.state, [], [2, 4, 1]);
  confirm();
  eq([game.state.players[1].life, game.state.zones.graveyard[1].length], [36, 2], "whole assignment enforces blocker lethal before either onward recipient");
}
{
  const game = walkerCombat({keywords: ["Trample Over Planeswalkers", "Double Strike"]});
  game.drive(() => game.state.phase === "COMBAT_FIRST_STRIKE_DAMAGE");
  resolveAwaiting(game.state, [], [4, 3]);
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  eq(game.state.players[1].life, 30, "double strike sends regular-step damage to player after walker leaves in first strike");
}
{
  const {state, blocker} = combat({keywords: ["Trample Over Planeswalkers"]});
  combatDamage.open(state); assign(state, [2, 3]);
  eq([state.objects[blocker].damage, state.players[1].life], [2, 37], "the variant also tramples over blockers when attacking a player");
}
{
  const game = walkerCombat();
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  concede(game.state, 1);
  eq(awaitingChoice(game.state).options.length, 0, "conceded defender and walker cease being recipients");
  const events = resolveAwaiting(game.state, [], []);
  eq(events.filter(e => ["GameEventPlayerDamaged", "GameEventCardDamaged"].includes(e.kind)).length, 0, "concession cannot redirect damage to another player");
}
{
  const game = walkerCombat();
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  eq(game.state.awaiting?.kind, "assign-combat-damage", "actual unblocked walker attack asks where excess damage goes");
  game.reload();
  eq(awaitingChoice(game.state).options.map(o => o.planeswalkerId ?? o.playerId), [game.walker, 1], "reload preserves walker and its controller as separate recipients");
  assert.throws(() => resolveAwaiting(game.state, [], [3, 4]), /loyalty/); checks += 1;
  const events = resolveAwaiting(game.state, [], [4, 3]);
  eq(game.state.players[1].life, 37, "the chosen excess hits the walker's controller");
  eq(game.state.zones.graveyard[1].map(id => game.state.objects[id].card), ["Smoke walker"], "zero loyalty sends the walker to its owner's graveyard");
  eq(events.filter(e => e.kind === "GameEventPlayerDamaged").map(e => e.data.fields.amount), [3], "player damage occurs once");
  eq(events.filter(e => e.kind === "GameEventCardDamaged").map(e => e.data.fields.amount), [4], "walker damage occurs once");
}
{
  const game = walkerCombat();
  runEffect(game.state, {effect: "destroy", targets: [game.walker]}, {controller: 2, source: null});
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  eq([game.state.awaiting, game.state.players[1].life], [null, 33], "removed walker is not offered and variant assigns all damage to original defending player");
}
{
  const game = walkerCombat({keywords: ["Trample"]});
  runEffect(game.state, {effect: "destroy", targets: [game.walker]}, {controller: 2, source: null});
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  eq(game.state.players[1].life, 40, "ordinary trample cannot hit controller after walker leaves");
}
{
  const game = walkerCombat();
  runEffect(game.state, {effect: "phaseOut", targets: [game.walker]}, {controller: 2, source: null});
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  eq([game.state.objects[game.walker].zone, game.state.players[1].life], ["phased", 33], "a phased walker is removed from combat while retaining its object id");
}
{
  const game = walkerCombat({power: 3});
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  eq([game.state.awaiting, game.state.objects[game.walker].counters.loyalty, game.state.players[1].life], [null, 1, 40], "insufficient power has one legal recipient and does not ask a division");
}
{
  const game = walkerCombat();
  game.state.objects[game.walker].abilities = [{id: "protection", kind: "static", rule: "protection", affects: {self: true}, from: "everything"}];
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  resolveAwaiting(game.state, [], [4, 3]);
  eq([game.state.objects[game.walker].counters.loyalty, game.state.players[1].life], [4, 37], "assigned loyalty threshold ignores prevention of damage actually dealt");
}
{
  const game = walkerCombat();
  runEffect(game.state, {effect: "gainControl", targets: [game.walker], controller: 2}, {controller: 2, source: null});
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  eq([game.state.players[1].life, game.state.players[2].life, game.state.objects[game.walker].counters.loyalty], [33, 40, 4], "changed walker controller removes walker from combat; original defender takes variant damage");
}
{
  const game = walkerCombat({keywords: []});
  runEffect(game.state, {effect: "pump", targets: [game.attacker], keywords: ["Trample Over Planeswalkers"]}, {controller: 0, source: null});
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  eq(awaitingChoice(game.state).options.length, 2, "variant granted by a live layer applies during damage assignment");
  resolveAwaiting(game.state, [], [4, 3]);
  eq(game.state.players[1].life, 37, "the granted variant changes the actual combat outcome");
}
{
  const game = walkerCombat({keywords: ["Trample Over Planeswalkers", "Deathtouch"]});
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  assert.throws(() => resolveAwaiting(game.state, [], [1, 6]), /loyalty/); checks += 1;
  resolveAwaiting(game.state, [], [4, 3]);
  eq(game.state.players[1].life, 37, "deathtouch does not reduce a planeswalker's loyalty threshold");
}
{
  const game = walkerCombat({second: true, secondKeywords: ["First Strike"]});
  game.drive(() => game.state.phase === "COMBAT_FIRST_STRIKE_DAMAGE");
  eq(game.state.objects[game.walker].counters.loyalty, 3, "other first-strike damage removes loyalty in its own step");
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  eq(awaitingChoice(game.state).options[1].requires[0].amount, 3, "first-strike damage is not counted again as a regular-step assignment");
  assert.throws(() => resolveAwaiting(game.state, [], [2, 5]), /loyalty/); checks += 1;
  resolveAwaiting(game.state, [], [3, 4]);
  eq(game.state.players[1].life, 36, "regular step uses the walker's current loyalty");
}
{
  const game = walkerCombat({power: 3, second: true, secondPower: 3, secondKeywords: ["Trample Over Planeswalkers"]});
  addObject(game.state, {card: "Smoke shared power lord", owner: 2, controller: 2, types: ["Enchantment"],
    abilities: [{id: "boost", kind: "static", layer: 7, sublayer: "c", affects: {types: ["Creature"]}, apply: {power: 2, toughness: 0}}]}, "battlefield");
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  const source = id => resolveAwaiting(game.state, [awaitingChoice(game.state).options.findIndex(o => o.cardId === id)]);
  const confirm = () => resolveAwaiting(game.state, [awaitingChoice(game.state).options.findIndex(o => o.confirmDamage)]);
  source(game.attacker); resolveAwaiting(game.state, [], [2, 3]);
  source(game.other); resolveAwaiting(game.state, [], [2, 3]);
  concede(game.state, 2);
  game.reload();
  assert.throws(confirm, /Review.*battlefield changed/); checks += 1;
  eq(game.state.players[1].life, 40, "concession invalidates saved power without dealing partial damage");
  source(game.attacker); resolveAwaiting(game.state, [], [2, 1]);
  source(game.other); resolveAwaiting(game.state, [], [2, 1]);
  confirm();
  eq(game.state.players[1].life, 38, "both assignments can be revised to live power after concession and reload");
}

for (const [name, answer] of [
  ["house", (choice, state) => housePilot({seat: 0}).answer(projectFor(state, 0), choice)],
  ["random-legal", choice => randomLegalPilot(createRng("trample-pilot")).answer(choice)],
  ["room leastAnswer", choice => leastAnswer(choice)],
]) {
  const game = walkerCombat({power: 3, second: true, secondPower: 3, secondKeywords: ["Trample Over Planeswalkers"]});
  game.drive(() => game.state.phase === "COMBAT_DAMAGE");
  const events = [];
  for (let n = 0; n < 8 && game.state.awaiting; n += 1) {
    const picked = answer(awaitingChoice(game.state), game.state);
    events.push(...resolveAwaiting(game.state, picked.indices, picked.amounts));
  }
  eq([game.state.awaiting, game.state.players[1].life, game.state.zones.graveyard[1].length], [null, 38, 1], `${name} explicitly answers shared allocations legally and terminates`);
  eq(events.filter(e => e.kind === "GameEventCardDamaged").reduce((n, e) => n + e.data.fields.amount, 0), 4, `${name} assigns exactly enough simultaneous loyalty damage`);
}

console.log(`engine-load100-w0-combat: ${checks} checks passed; combat assignments are player choices.`);
