/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, W2D: "EACH OPPONENT CREATES A 1/1 WHITE HUMAN CREATURE TOKEN" (Slaughter Specialist; CR 111.2, 101.4).
 *
 * A token made for "that player" -- createToken's `controller: "that player"`, bound to the player a repetition is about
 * (script/bind.mjs; effects/index.mjs, repeatFor) -- is that player's: they control it, they own it (CR 111.2), and it is
 * one they created this turn. Here: four players, each opponent in turn order; one who has left the game creates nothing;
 * no player to be about, and nobody does.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {bindEffect} from "../game/engine/script/bind.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const SPECIALIST = "Slaughter Specialist";
const table = (setup, seats) => runScenario({name: "each-player-creates", seats, setup, steps: []}, index.definition, {}).state;
const humans = (s) => s.zones.battlefield.filter((id) => s.objects[id].card === "Human")
  .map((id) => ({controller: s.objects[id].controller, owner: s.objects[id].owner, token: s.objects[id].token}));
const entering = (s) => {
  const id = s.zones.battlefield.find((x) => s.objects[x].card === SPECIALIST);
  return {id, effects: s.objects[id].abilities.find((a) => a.kind === "triggered" && a.trigger?.who === "self").effects};
};

{
  /* Four players, on Trey's turn (Trey, Sam, Rob, Maya in turn order, CR 101.4): Rob's three opponents each create one, in
     that order. */
  const s = table([{seat: 0, zone: "battlefield", cards: [SPECIALIST]}], 4);
  s.activePlayer = 2;
  const {id, effects} = entering(s);
  beginResolution(s, effects, {controller: 0, source: id});
  eq(humans(s), [2, 3, 1].map((p) => ({controller: p, owner: p, token: true})),
    "Trey, Sam and Maya, in turn order, each control and own a Human token; Rob none");
  eq(s.players.map((p) => p.tokensThisTurn ?? 0), [0, 1, 1, 1], "each of them created a token this turn, Rob did not (CR 111.2)");
}
{
  /* A player who has left the game is no longer an opponent the repetition reaches (CR 800.4a). */
  const s = table([{seat: 0, zone: "battlefield", cards: [SPECIALIST]}], 3);
  s.players[2].lost = true;
  const {id, effects} = entering(s);
  beginResolution(s, effects, {controller: 0, source: id});
  eq(humans(s).map((h) => h.controller), [1], "Trey has left: Maya alone creates one");
}
{
  /* Bound: the player the repetition is about; with none, nobody (-1), and createToken makes nothing for nobody. */
  eq(bindEffect({effect: "createToken", controller: "that player"}, {about: {player: 2}}).controller, 2, "\"that player\" is the one it is about");
  eq(bindEffect({effect: "createToken", controller: "that player"}, {}).controller, -1, "and with no one to be about, no one");
  const s = table([], 2);
  beginResolution(s, [{effect: "createToken", count: 1, token: {name: "Human", types: ["Creature"], subtypes: ["Human"], colors: ["W"], power: 1, toughness: 1}, controller: "that player"}], {controller: 0, source: null});
  eq(humans(s), [], "outside a repetition, \"that player\" is nobody, and no token is made");
}

console.log(`engine-each-player-creates: ${checks} checks passed -- "each opponent creates a token": each in turn, theirs to control and own, none for a player gone or nobody.`);
