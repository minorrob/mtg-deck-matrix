/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 36 (THE CATALOG'S ORDER): THE SAME FOR EACH (Forge's RepeatEach).
 *
 * `repeatFor` does its effects once for each player -- in turn order from the active player (CR 101.4) -- each opponent,
 * or each creature, with "that player" (and, for a creature, "that card" and its controller as "that player") bound to
 * it, and every amount counted for it as it is done (CR 608.2h). "Each creature deals 1 damage to its controller": the
 * creature is the source, so its lifelink counts. With it: half a player's life rounded down, the life a player has
 * lost this turn, and a selector's controller bound to a target player -- seat 0 included.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {playerRuleChanged} from "../game/engine/rules/statics.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {selectMatching} from "../game/engine/script/filter.mjs";
import {bindEffect} from "../game/engine/script/bind.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardIndex, loadCardScripts} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const pod = (n = 3) => ({matchId: "m", seed: "repeat", players: ["Rob", "Maya", "Trey"].slice(0, n).map((name) => ({name}))});
function table(n = 3) {
  const s = createState(pod(n));
  for (let seat = 0; seat < n; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let k = 0; k < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); k += 1) advance(s);
  return s;
}
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
const run = (s, effects, controller = 0) => runEffects(s, effects, {controller, source: null});
const lives = (s) => s.players.map((p) => p.life);

{
  /* Each player, in turn order from the active player, each counted for: twice the nonbasic lands that player controls. */
  const s = table();
  on(s, {card: "Grove", types: ["Land"]}, 1); on(s, {card: "Grove", types: ["Land"]}, 1); on(s, {card: "Grove", types: ["Land"]}, 2);
  const events = run(s, [{effect: "repeatFor", each: "player", effects: [{effect: "dealDamage", who: "that player",
    amount: {count: {what: "permanent", types: ["Land"], nonSupertypes: ["Basic"], controller: "that player"}, times: 2}}]}]);
  eq(lives(s), [40, 36, 38], "Rob none, Maya two (4), Trey one (2)");
  eq(events.filter((e) => e.kind === "GameEventPlayerLivesChanged").map((e) => e.data.fields.player.playerId), [1, 2], "one after another, in turn order");
  s.activePlayer = 2;
  const order = [];
  run(s, [{effect: "repeatFor", each: "player", effects: [{effect: "loseLife", who: "that player", amount: 1}]}]).forEach((e) => order.push(e.data.fields.player.playerId));
  eq(order, [2, 0, 1], "on Trey's turn: Trey, then Rob, then Maya (CR 101.4)");
}
{
  /* Each opponent: not its controller, not a player who has left. */
  const s = table();
  s.players[2].lost = true;
  run(s, [{effect: "repeatFor", each: "opponent", effects: [{effect: "loseLife", who: "that player", amount: 2}]}]);
  eq(lives(s), [40, 38, 40], "Rob's: Maya loses 2; Trey has left the game; Rob is no opponent of his own");
  run(s, [{effect: "repeatFor", each: "player", effects: [{effect: "gainLife", amount: 1}]}]);
  eq(s.players[0].life, 42, "and \"for each player, you gain 1 life\": two rounds, Rob and Maya -- none for Trey, who has left");
}
{
  /* Each creature: it deals the damage, to its controller -- its lifelink is its controller's gain. */
  const s = table(2);
  on(s, {card: "Bear", types: ["Creature"], power: 2, toughness: 2}, 0);
  on(s, {card: "Vampire", types: ["Creature"], power: 1, toughness: 1, keywords: ["Lifelink"]}, 1);
  run(s, [{effect: "repeatFor", each: "creature", effects: [{effect: "dealDamage", from: "that card", who: "that player", amount: 1}]}]);
  eq(lives(s), [39, 40], "the Bear deals 1 to Rob; the Vampire deals 1 to Maya and its lifelink gives it back");
}
{
  /* Half a life total, rounded down; the life lost this turn, cleared as the next begins. */
  const s = table(2);
  s.players[1].life = 37;
  eq(amountOf(s, {lifeTotal: "that player", half: true}, {controller: 0, about: {player: 1}}), 18, "half of 37, rounded down: 18");
  run(s, [{effect: "loseLife", who: [1], amount: 3}, {effect: "gainLife", who: [1], amount: 5}, {effect: "dealDamage", who: [1], amount: 2}]);
  eq(amountOf(s, {lifeLostThisTurn: "that player"}, {controller: 0, about: {player: 1}}), 5, "lost 3, gained 5, dealt 2: she has lost 5 this turn -- a gain takes nothing back");
  for (let k = 0; k < 80 && s.turn === 1; k += 1) { s.awaiting = null; advance(s); }
  eq(s.players[1].lostThisTurn ?? 0, 0, "the next turn: nothing lost yet");
}
{
  /* A selector's controller bound to a target player -- seat 0 is a player too. */
  const s = table(2);
  const robs = addObject(s, {card: "Bolt", types: ["Instant"], owner: 0, controller: 0}, "graveyard", 0);
  addObject(s, {card: "Bolt", types: ["Instant"], owner: 1, controller: 1}, "graveyard", 1);
  const bound = bindEffect({effect: "moveZoneAll", selector: {what: "card", zone: "graveyard", controller: {target: 0}}, to: "exile"}, {controller: 1, targets: [{kind: "player", id: 0}]});
  eq([bound.selector.controller, selectMatching(s, bound.selector, {controller: 1})], [0, [robs]], "Maya targets Rob: his graveyard alone, by seat 0");
  const nobody = bindEffect({effect: "moveZoneAll", selector: {what: "card", zone: "graveyard", controller: {target: 0}}, to: "exile"}, {controller: 1, targets: [null]});
  eq(selectMatching(s, nobody.selector, {controller: 1}), [], "a target that has become illegal: nobody's graveyard");
}
{
  /* Players have no maximum hand size (Folio of Fancies): its controller and every other player. */
  const s = table(2);
  on(s, card("Folio of Fancies"), 0);
  eq([playerRuleChanged(s, "no-maximum-hand-size", 0), playerRuleChanged(s, "no-maximum-hand-size", 1)], [true, true], "Rob's Folio: Rob and Maya alike");
}
{
  /* What may repeat: players, opponents or creatures, and what is built -- one that stops to ask too, since 2026-10-04 (a
     resolution splices it in for each, script/resolution.mjs; tests/engine-overload.mjs). */
  const script = structuredClone(loadCardScripts().find(({script: one}) => one.identity.name === "Price of Progress").script);
  script.abilities[0].effects[0].effects = [{effect: "discard", count: 1, who: "that player"}];
  eq(compileScript(script).problems.some((p) => /repeatFor/.test(p)), false, "a discard -- a question -- inside it is taken");
  script.abilities[0].effects[0].effects = [{effect: "addTurn"}];
  eq(compileScript(script).problems.some((p) => /repeatFor: addTurn is not something that repeats/.test(p)), true, "something not built inside it is refused");
  script.abilities[0].effects[0].effects = [{effect: "discard", count: 1, who: "that player"}];
  script.abilities[0].effects[0].each = "land";
  eq(compileScript(script).problems.some((p) => /repeatFor: each of player, opponent, creature/.test(p)), true, "and each land is not (yet) a thing it ranges over");
}

console.log(`engine-repeat: ${checks} checks passed — the same for each player in turn order, each opponent, each creature as the source; amounts counted for each; half a life rounded down; life lost this turn; a target player's own cards, seat 0 too.`);
