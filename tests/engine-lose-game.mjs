/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "THAT PLAYER LOSES THE GAME" (CR 104.3e; Train C phase 2, p6-combat): the effect `loseGame` (script/effects/resources.mjs).
 *
 * A player an effect says loses leaves the game as it happens (CR 104.5, 800.4a -- not a state-based action), everything of
 * theirs with them; every player it names loses together, so all who remain losing at once is a draw (CR 104.4a); "you
 * can't lose the game" holds against it, then and later (CR 104.3e beside Darksteel Angel's static). A spell or ability
 * whose controller has left the game has left the stack with them, and nothing more of it is done (CR 800.4a; script/
 * resolution.mjs). And "whenever a creature deals combat damage to you" (`to: "you"`, rules/trigger.mjs). The scenarios
 * play Strixhaven Stadium and Triskaidekaphobia; this suite holds three and four players, the simultaneous loss, the
 * Angel, the loser's own spell, the checkpoint and the vocabulary.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {runEffect, isBuilt} from "../game/engine/script/effects/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {gameOver, checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {isPrimitive} from "../game/engine/vocabulary.mjs";
import {isHostile} from "../game/engine/script/bind.mjs";
import {FORGE_API} from "../game/tools/engine-constructs.mjs";
import {createJournal} from "../game/engine/journal.mjs";
import {createMatchStore, memoryStorage} from "../game/engine/storage.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const creature = (subtypes, p = 2) => ({types: ["Creature"], subtypes, manaCost: "{1}", colors: ["G"], power: p, toughness: p});
const FIX = {Bear: creature(["Bear"]), Wolf: creature(["Wolf"]),
  /* "You lose the game. Each player gains 5 life." -- a spell whose controller its own effect removes. */
  Wager: {types: ["Sorcery"], manaCost: "{C}", colors: ["B"], spell: {id: "s", text: "You lose the game. Each player gains 5 life.", targets: [],
    effects: [{effect: "loseGame", who: "you"}, {effect: "gainLife", who: "each", amount: 5}]}}};
const play = (setup, seats = 2) => runScenario({name: "lose", seats, setup}, index.definition, FIX).state;
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const idOf = (s, card, seat) => s.zones.battlefield.find((id) => s.objects[id].card === card && s.objects[id].controller === seat);
function step(s) {
  if (s.awaiting) { const c = awaitingChoice(s); resolveAwaiting(s, s.awaiting.kind === "order-triggers" ? c.options.map((o) => o.index) : c.options.slice(0, c.min ?? 0).map((o) => o.index)); return; }
  if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
}

/* ---- who loses, at once ---- */
{
  const s = play([at(1, "battlefield", "Bear"), at(2, "battlefield", "Wolf")], 4);
  s.players[1].life = 13; s.players[2].life = 13;
  const events = runEffect(s, {effect: "loseGame", who: "each", withLife: 13}, {controller: 0, source: null});
  eq(s.players.map((p) => p.lost === true), [false, true, true, false], "each player with exactly 13 life: Maya and Trey, Rob at 40 and Sam at 40 not");
  eq([idOf(s, "Bear", 1) ?? null, idOf(s, "Wolf", 2) ?? null], [null, null], "and they have left the game at once, their permanents with them (CR 800.4a) -- no state-based action needed");
  eq(events.filter((e) => e.data?.fields?.lost === true).map((e) => [e.data.fields.player.playerId, e.data.fields.lossReason]), [[1, "effect"], [2, "effect"]],
    "each said, a loss by an effect");
  eq(gameOver(s), null, "Rob and Sam play on");
}
{
  const s = play([]);
  s.players[0].life = 13; s.players[1].life = 13;
  runEffect(s, {effect: "loseGame", who: "each", withLife: 13}, {controller: 0, source: null});
  eq(gameOver(s), {winner: null, reason: "all players lost"}, "both at 13 in a game of two: both lose together, and the game is a draw (CR 104.4a)");
}
{
  const s = play([at(1, "battlefield", "Darksteel Angel")], 3);
  runEffect(s, {effect: "loseGame", who: "opponent"}, {controller: 0, source: null});
  eq(s.players.map((p) => p.lost === true), [false, false, true], "\"your opponents lose\": Trey does; Maya, with Darksteel Angel, can't lose the game");
  runEffect(s, {effect: "destroy", targets: [idOf(s, "Darksteel Angel", 1)]}, {controller: 0, source: null});
  checkStateBasedActions(s);
  eq(s.players[1].lost === true, false, "and the Angel gone, she has not lost after all -- the effect did nothing to her, then or later");
}

/* ---- the loser's own spell, and their own turn ---- */
{
  const s = play([at(0, "battlefield", "Wastes"), at(0, "hand", "Wager")], 3);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === "Wager"));
  const seen = [];
  for (let n = 0; n < 20 && s.stack.length; n += 1) seen.push(...passPriority(s).events);
  eq(seen.filter((e) => e.kind === "GameEventSpellResolved").length, 0, "the Wager is not said to have resolved: it left the stack with Rob, and nothing of it was finished");
  eq(s.players.map((p) => [p.lost === true, p.life]), [[true, 40], [false, 40], [false, 40]],
    "Rob's own Wager: he loses and leaves the game, the spell with him -- nobody gains the 5 life after it (CR 800.4a)");
  eq([s.stack.length, s.resolving ?? null], [0, null], "nothing of it is left on the stack, or resolving");
  for (let n = 0; n < 400 && s.turn === 1; n += 1) step(s);
  eq([s.turn, s.activePlayer], [2, 1], "Rob's turn ran on without him (CR 800.4j), and Maya's began");
}
{
  /* Another's: the resolution goes on after it. */
  const s = play([], 3);
  const outcome = beginResolution(s, [{effect: "loseGame", who: "opponent"}, {effect: "gainLife", who: "each", amount: 2}], {controller: 1});
  eq([outcome.status, s.players.map((p) => [p.lost === true, p.life])], ["done", [[true, 40], [false, 42], [true, 40]]],
    "Maya's \"each opponent loses\": Rob and Trey leave, and then Maya, still in, gains 2");
}

/* ---- "whenever a creature deals combat damage to you" ---- */
{
  const s = play([at(0, "battlefield", "Strixhaven Stadium"), at(1, "battlefield", "Bear"), at(2, "battlefield", "Wolf")], 3);
  const stadium = idOf(s, "Strixhaven Stadium", 0);
  s.objects[stadium].counters.point = 3;
  for (let n = 0; n < 400 && !(s.turn === 2 && s.awaiting?.kind === "declare-attackers"); n += 1) step(s);
  const options = awaitingChoice(s).options;
  resolveAwaiting(s, [options.find((o) => o.defenderId === 2).index]);
  for (let n = 0; n < 400 && s.phase !== "MAIN2"; n += 1) step(s);
  eq([s.players[2].life, s.objects[stadium].counters.point], [38, 3], "Maya's Bear deals combat damage to Trey: not to Rob, and no counter comes off");
  for (let n = 0; n < 400 && !(s.turn === 3 && s.awaiting?.kind === "declare-attackers"); n += 1) step(s);
  const trey = awaitingChoice(s).options;
  resolveAwaiting(s, [trey.find((o) => o.defenderId === 0).index]);
  for (let n = 0; n < 400 && s.phase !== "MAIN2"; n += 1) step(s);
  eq([s.players[0].life, s.objects[stadium].counters.point], [38, 2], "Trey's Wolf deals combat damage to Rob: one comes off");
  runEffect(s, {effect: "dealDamage", amount: 2, who: [0]}, {controller: 2, source: idOf(s, "Wolf", 2)});
  for (let n = 0; n < 20 && (s.stack.length || s.pendingTriggers?.length); n += 1) step(s);
  eq(s.objects[stadium].counters.point, 2, "noncombat damage from it: none");
}

/* ---- saved and read back ---- */
{
  const s = play([], 3);
  s.players[2].life = 13;
  runEffect(s, {effect: "loseGame", who: "each", withLife: 13}, {controller: 0, source: null});
  const store = createMatchStore(memoryStorage(), "m");
  let saved = true;
  try { await store.saveCheckpoint({...createJournal({matchId: "m", seed: "s"}).checkpoint(s, createRng("s").checkpoint()), matchId: "m"}); } catch { saved = false; }
  ok(saved, "a game with a player who lost to an effect saves and reads back as itself");
}

/* ---- the vocabulary, the schema, the credit ---- */
{
  ok(isPrimitive("loseGame") && isBuilt("loseGame"), "loseGame is a primitive, and built");
  ok(isHostile([{effect: "loseGame", who: {target: 0}}]), "and aimed against what it targets: a pilot points \"target player loses the game\" at an opponent");
  eq(FORGE_API.LosesGame, "loseGame", "Forge's LosesGame is it");
  const identity = {name: "Odd", oracleId: "x", types: ["Sorcery"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: []};
  const script = (effect) => ({schema: "CrankCardScript@1", identity, oracleText: "x", source: "hand", abilities: [{kind: "spell", text: "x", targets: [], effects: [effect]}]});
  ok(validateScript(script({effect: "loseGame", who: "each", withLife: 13})).valid, "each player with exactly 13 life");
  ok(!validateScript(script({effect: "loseGame", who: "each", withLife: "13"})).valid, "a life total is a whole number");
  eq(compileScript(script({effect: "loseGame", who: "opponent"})).problems, [], "and compiles");
  const damage = (to) => compileScript({schema: "CrankCardScript@1", identity: {...identity, types: ["Artifact"]}, oracleText: "x", source: "hand",
    abilities: [{kind: "triggered", text: "x", trigger: {on: "damage dealt", who: "any", combat: true, to}, effects: [{effect: "draw", count: 1}]}]});
  eq(damage("you").definition.abilities[0].trigger.to, "you", "a damage trigger \"to you\" compiles");
  ok(damage("everyone").problems.length > 0, "and one to a word it does not know is refused");
}

console.log(`engine-lose-game: ${checks} checks passed -- losing to an effect at once, together, a draw when all do; Darksteel Angel; the loser's own spell gone with them, their turn run on; another's resolution going on; combat damage to you; a checkpoint; the vocabulary and the schema.`);
