/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "YOU MAY SACRIFICE AN ARTIFACT, CREATURE, ENCHANTMENT, LAND, OR PLANESWALKER. IF YOU DO, EACH OPPONENT MAY SACRIFICE A
 * PERMANENT OF THEIR CHOICE THAT SHARES A CARD TYPE WITH IT. FOR EACH OPPONENT WHO DOESN'T, THAT PLAYER LOSES 2 LIFE AND YOU
 * DRAW A CARD" (Braids, Arisen Nightmare; Train C phase 2, w2a-selectors; CR 205.2a, 608.2h, 101.4, 701.21a).
 *
 * Three pieces. A sacrifice that remembers keeps what it sacrificed as it last existed (`movedWas`, effects/asking.mjs) --
 * an animated land was a creature too. The selector `sharesCardTypeWith: "moved"` (script/filter.mjs) is bound, as the
 * effect reaches the head of its resolution, to those card types (script/bind.mjs), and unbound matches nothing. And a
 * sacrifice may be `optional`, each player named choosing none or one in turn order from the active player, every
 * sacrifice made together once the last has chosen (CR 101.4), with `ifNot` done for each player who sacrificed nothing --
 * declined, or had nothing to -- "that player" each in turn. The card's scenarios play Braids at two and three seats; this
 * suite holds the last known card types, a table of four with a player gone, the order the refusals land in, the grammar,
 * and the house pilot's answer.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {compileSelector, selectMatching} from "../game/engine/script/filter.mjs";
import {bindEffect} from "../game/engine/script/bind.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {beginResolution, answerResolution, resolutionChoice} from "../game/engine/script/resolution.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const named = (s, ids) => ids.map((id) => s.objects[id].card);

/* ---- the selector: bound, unbound, through the layers ---- */
{
  const s = createState({matchId: "m", seed: "shares", players: [{name: "Rob"}, {name: "Maya"}]});
  const bear = addObject(s, {card: "Bear", types: ["Creature"], subtypes: ["Bear"], power: 2, toughness: 2, owner: 1, controller: 1}, "battlefield");
  const relic = addObject(s, {card: "Relic", types: ["Artifact"], owner: 1, controller: 1}, "battlefield");
  const golem = addObject(s, {card: "Golem", types: ["Artifact", "Creature"], power: 3, toughness: 3, owner: 1, controller: 1}, "battlefield");
  const swamp = addObject(s, {card: "Swamp", types: ["Land"], supertypes: ["Basic"], subtypes: ["Swamp"], owner: 1, controller: 1}, "battlefield");
  const shared = (types) => selectMatching(s, {what: "permanent", sharesCardTypeWith: types}, {controller: 1});
  eq(named(s, shared(["Artifact"])), ["Relic", "Golem"], "an artifact: the Relic and the artifact creature");
  eq(named(s, shared(["Creature", "Land"])), ["Bear", "Golem", "Swamp"], "a land creature: every creature, and the land");
  eq(shared([]), [], "nothing moved: nothing shares a card type with it");
  eq(shared("moved"), [], "unbound, it matches nothing");
  runEffect(s, {effect: "animate", targets: [swamp], types: ["Creature"], power: 1, toughness: 1, until: "end-of-turn"}, {controller: 1, source: null});
  eq(named(s, shared(["Creature"])), ["Bear", "Golem", "Swamp"], "through the layers: the Swamp made a creature is one");
  for (const bad of [true, ["Tribal"], ["Legendary"], "remembered"])
    assert.throws(() => compileSelector({sharesCardTypeWith: bad}), /sharesCardTypeWith/, JSON.stringify(bad));
  checks += 4;
  /* Bound as it reaches the head: to the card types of what was moved, each as it last existed, supertypes and subtypes
     aside. */
  const bound = bindEffect({effect: "sacrifice", selector: {sharesCardTypeWith: "moved"}}, {controller: 0, movedWas: [{types: ["Land", "Creature"], supertypes: ["Basic"], subtypes: ["Swamp"]}]});
  eq(bound.selector.sharesCardTypeWith, ["Land", "Creature"], "bound: its card types");
  eq(bindEffect({effect: "sacrifice", selector: {sharesCardTypeWith: "moved"}}, {controller: 0}).selector.sharesCardTypeWith, [], "nothing moved: none");
  void bear; void relic; void golem;
}

/* ---- Braids, Arisen Nightmare: the last known card types of what Rob sacrificed ---- */
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Relic: {types: ["Artifact"], manaCost: "{1}", colors: []},
};
function endStep(seats, setup) {
  const {state: s} = runScenario({name: "braids", seats, setup, steps: [{to: {turn: 1, phase: "END_OF_TURN"}}, {resolve: true}, {choose: ["Yes"]}]}, index.definition, FIX);
  return s;
}
{
  /* Rob's Swamp, made a 1/1 creature this turn, sacrificed: it was a land and a creature, though the card in his graveyard
     is a land (CR 608.2h) -- so Maya may answer with her Bear. */
  const s = endStep(2, [at(0, "battlefield", "Braids, Arisen Nightmare", "Swamp"), at(1, "battlefield", "Bear", "Relic")]);
  const swamp = s.zones.battlefield.find((id) => s.objects[id].card === "Swamp");
  runEffect(s, {effect: "animate", targets: [swamp], types: ["Creature"], power: 1, toughness: 1, until: "end-of-turn"}, {controller: 0, source: null});
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === "Swamp").index]);
  eq(s.awaiting?.player, 1, "Maya is asked");
  eq(awaitingChoice(s).options.map((o) => o.label), ["Bear"], "her Bear shares a card type with the animated Swamp as it last was; her Relic does not");
  eq([awaitingChoice(s).min, awaitingChoice(s).max, awaitingChoice(s).mode], [0, 1, "many"], "and she may choose none");
  eq(awaitingChoice(s).title, "You may sacrifice a permanent", "the question says she may");
}

/* ---- at a table of four: one has nothing, one has left the game, the rest choose in turn ---- */
{
  const s = endStep(4, [at(0, "battlefield", "Braids, Arisen Nightmare", "Bear"), at(1, "battlefield", "Bear"), at(2, "battlefield", "Relic"), at(3, "battlefield", "Bear")]);
  s.players[3].lost = true;
  const hand = s.zones.hand[0].length;
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === "Bear").index]);
  eq(s.awaiting?.player, 1, "Maya, the first opponent in turn order with a creature, is asked first; Trey has none, and Sam has left the game");
  const events = resolveAwaiting(s, []);
  eq(s.awaiting, null, "and nobody else: the sacrifices, and the refusals, are made");
  eq(s.players.map((p) => p.life), [40, 38, 38, 40], "Maya declined and Trey could not: each loses 2 life; Sam, gone, nothing");
  eq(s.zones.hand[0].length, hand + 2, "Rob draws a card for each of them");
  ok(s.zones.battlefield.some((id) => s.objects[id].card === "Bear" && s.objects[id].controller === 1), "Maya's Bear stays");
  /* Each refusal in turn order from the active player: Maya loses 2 and Rob draws, then Trey, then Rob again. */
  const order = events.filter((e) => e.kind === "GameEventPlayerLivesChanged" || (e.kind === "GameEventCardChangeZone" && e.data.fields.to?.zoneType === "Hand"))
    .map((e) => (e.kind === "GameEventPlayerLivesChanged" ? `loses:${e.data.fields.player.playerId}` : "draws"));
  eq(order, ["loses:1", "draws", "loses:2", "draws"], "Maya's refusal, then Trey's, each its life and its card");
}
{
  /* Chosen in turn, sacrificed together once the last has chosen (CR 101.4): Maya's Bear is still there while Trey decides. */
  const s = endStep(3, [at(0, "battlefield", "Braids, Arisen Nightmare", "Bear"), at(1, "battlefield", "Bear"), at(2, "battlefield", "Bear")]);
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === "Bear").index]);
  resolveAwaiting(s, [0]);
  eq(s.awaiting?.player, 2, "Trey is asked after Maya");
  ok(s.zones.battlefield.some((id) => s.objects[id].card === "Bear" && s.objects[id].controller === 1), "Maya's chosen Bear is still on the battlefield while Trey chooses");
  /* The house pilot, asked a "may sacrifice": an answer within its bounds -- none, here. */
  const pilot = housePilot({seat: 2});
  const answer = pilot.answer(projectFor(s, 2), awaitingChoice(s));
  ok(Array.isArray(answer.indices) && answer.indices.length <= 1, "the house pilot answers a \"may sacrifice\" within its bounds");
  resolveAwaiting(s, answer.indices);
  eq(s.zones.battlefield.filter((id) => s.objects[id].card === "Bear").map((id) => s.objects[id].controller), answer.indices.length ? [] : [2],
    "Maya's Bear is gone with Trey's answer: both sacrifices made together");
  eq(s.players.map((p) => p.life), [40, 40, answer.indices.length ? 40 : 38], "Maya sacrificed; Trey loses 2 only if he did not");
}

/* ---- the grammar ---- */
{
  const braids = JSON.parse(readFileSync(new URL("../game/engine/cards/b/braids-arisen-nightmare.json", import.meta.url), "utf8"));
  eq(validateScript(braids).valid, true, "Braids's definition is a valid script");
  const with_ = (change) => { const copy = structuredClone(braids); change(copy.abilities[0].effects[1]); return validateScript(copy).errors.map((e) => e.message).join(" | "); };
  ok(/A sacrifice that may be declined is optional: true/.test(with_((e) => { e.optional = "yes"; })), "optional is true");
  /* Beside a sacrifice that must be made too: what follows for each player who can't (Plaguecrafter; wave 4c). Never beside
     keeping. */
  eq(with_((e) => { delete e.optional; }), "", "ifNot beside a sacrifice that must be made: for each player who can't");
  ok(/never beside keeping/.test(with_((e) => { e.keep = 1; })), "ifNot never beside keeping");
  ok(/is a list of effects/.test(with_((e) => { e.ifNot = []; })), "ifNot is a list with something in it");
  ok(/not a primitive/.test(with_((e) => { e.ifNot = [{effect: "loseHalf"}]; })), "what follows is held to the effect grammar");
  /* And to what the engine has built: a declared primitive nothing performs is a problem, named, before any game. */
  const unbuilt = structuredClone(braids);
  unbuilt.abilities[0].effects[1].ifNot = [{effect: "returnToHand", targets: "self"}];
  ok(compileScript(unbuilt).problems.some((p) => /returnToHand: declared, not built/.test(p)), "an unbuilt primitive after a refusal is refused by the card compiler");
}

/* ---- a player who leaves the game while asked is no refusal of theirs (CR 800.4a) ---- */
{
  const s = endStep(3, [at(0, "battlefield", "Braids, Arisen Nightmare", "Bear"), at(1, "battlefield", "Bear"), at(2, "battlefield", "Bear")]);
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === "Bear").index]);
  eq(s.awaiting?.player, 1, "Maya is asked");
  s.players[1].lost = true;
  const hand = s.zones.hand[0].length;
  resolveAwaiting(s, []);
  resolveAwaiting(s, []);
  eq(s.players.map((p) => p.life), [40, 40, 38], "Maya left the game while she was asked: only Trey, who declined, loses 2");
  eq(s.zones.hand[0].length, hand + 1, "and Rob draws one card, for Trey");
}

/* ---- a "may sacrifice" with nothing after it, and the resolution's own subject after the refusals ---- */
{
  const s = createState({matchId: "m", seed: "subject", players: [{name: "Rob"}, {name: "Maya"}, {name: "Trey"}]});
  addObject(s, {card: "Bear", types: ["Creature"], power: 2, toughness: 2, owner: 1, controller: 1}, "battlefield");
  const plain = beginResolution(s, [{effect: "sacrifice", who: "opponent", optional: true, selector: {types: ["Creature"]}}], {controller: 0});
  eq([plain.status, s.awaiting?.player], ["waiting", 1], "an optional sacrifice with nothing to follow it asks Maya, who has a creature");
  answerResolution(s, []);
  eq([s.resolving, s.players.map((p) => p.life)], [null, [40, 40, 40]], "she declines, and nothing follows");
  /* What a trigger is about ("that player", Maya) is back once every refusal is done -- Trey's the last. */
  beginResolution(s, [{effect: "sacrifice", who: "opponent", optional: true, selector: {types: ["Creature"]}, ifNot: [{effect: "loseLife", who: "that player", amount: 1}]},
    {effect: "gainLife", who: "that player", amount: 5}], {controller: 0, about: {player: 1}});
  answerResolution(s, []);
  eq(s.players.map((p) => p.life), [40, 44, 39], "Maya and Trey each lose 1 for declining; then Maya, the player it is about, gains 5");
}

/* ---- a resolution whose sacrifice nobody can make: what follows each refusal still happens ---- */
{
  const s = createState({matchId: "m", seed: "nobody", players: [{name: "Rob"}, {name: "Maya"}, {name: "Trey"}]});
  for (let n = 0; n < 3; n += 1) addObject(s, {card: "Wastes", types: ["Land"], owner: 0, controller: 0}, "library", 0);
  const outcome = beginResolution(s, [{effect: "sacrifice", who: "opponent", optional: true, selector: {types: ["Creature"]},
    ifNot: [{effect: "loseLife", who: "that player", amount: 1}]}], {controller: 0});
  eq(outcome.status, "done", "no opponent has a creature: nobody is asked");
  eq(s.players.map((p) => p.life), [40, 39, 39], "and each loses 1, \"that player\" each in turn");
  void answerResolution; void resolutionChoice;
}

console.log(`engine-shares-card-type: ${checks} checks passed`);
