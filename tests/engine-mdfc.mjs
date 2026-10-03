/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A MODAL DOUBLE-FACED CARD (the plan's X5, D5 Shadrix Aristocrats: Fell the Profane // Fell Mire; X5l).
 *
 * Two faces, each with its own characteristics (CR 712.3, 712.8). Anywhere but the battlefield and the stack it has only
 * its front face's (712.8a): in a hand, a library or a graveyard Fell the Profane is an instant that costs {2}{B}{B}, and
 * a search for a land card does not find it. Cast, it is its front face (712.11b). Played as a land, its player chooses a
 * face that is a land and it enters with that face up (712.12): Fell Mire, which asks as it enters whether to pay 3 life
 * or have it enter tapped. On the battlefield it has only the characteristics of the face that is up (712.8f), so it
 * costs nothing and is no color; when it leaves, it is its front face again. Told to enter with its front face up when
 * that face is no permanent's, it stays where it is (712.14b). Its color identity is both faces' (CR 903.4).
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {selectMatching} from "../game/engine/script/filter.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {manaValue, parseManaCost} from "../game/engine/rules/mana.mjs";
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
const FELL = "Fell the Profane // Fell Mire", FRONT = "Fell the Profane", BACK = "Fell Mire";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const play = (name, setup, steps = [], more = {}) => runScenario({name, setup, steps, ...more}, index.definition, {}).state;
const named = (s, card, zone) => [s.zones[zone]].flat(2).filter((id) => s.objects[id]?.card === card);
const mv = (s, id) => manaValue(parseManaCost(s.objects[id].manaCost ?? ""));

{
  /* In the hand: its front face only (CR 712.8a) -- and both ways to use it offered. */
  const s = play("in hand", [at(0, "battlefield", "Swamp", "Swamp", "Wastes", "Wastes"), at(0, "hand", FELL)]);
  const [card] = named(s, FRONT, "hand");
  eq([s.objects[card]?.card, s.objects[card]?.types, mv(s, card), s.objects[card]?.colors, s.objects[card]?.colorIdentity], [FRONT, ["Instant"], 4, ["B"], ["B"]],
    "in Rob's hand it is Fell the Profane: an instant, mana value 4, black; its color identity black");
  const lands = legalActions(s, 0).filter((a) => a.kind === "play-land");
  eq(lands.map((a) => [a.label, a.face]), [[BACK, "back"]], "Rob may play it as a land, Fell Mire, its back face (CR 712.12)");
  assert.throws(() => applyAction(s, 0, {kind: "play-land", objectId: card, label: FRONT, face: "front"}), /not a legal action/);
  checks += 1;
  eq(projectFor(s, 0).players[0].zones.Hand.cards.map((c) => c.name), [FRONT], "and his view of his hand says Fell the Profane");
  /* A land played already: not again. */
  const dropped = play("a land played", [at(0, "hand", FELL, "Swamp")], [{play: "Swamp"}]);
  eq(legalActions(dropped, 0).filter((a) => a.kind === "play-land").length, 0, "with a land played this turn, not offered");
  /* The house pilot plays its Swamp, keeping the spell. */
  const both = play("the pilot", [at(0, "hand", FELL, "Swamp")]);
  const choice = housePilot({seat: 0, cards: (name) => index.definition(name)}).choose(projectFor(both, 0), legalActions(both, 0));
  eq([choice.kind, choice.label, choice.face], ["play-land", "Swamp", undefined], "the house pilot plays a real land before the land face");
}
{
  /* Played as Fell Mire (CR 712.12, 712.8f): the land face up, asked as it enters. */
  const s = play("played", [at(0, "hand", FELL)], [{play: BACK}]);
  const q = awaitingChoice(s);
  eq(q.options.map((o) => o.label), [`Pay 3 life: ${BACK} enters untapped`, `Don't pay: ${BACK} enters tapped`], "as it enters: pay 3 life, or it enters tapped");
  resolveAwaiting(s, [0]);
  const [mire] = named(s, BACK, "battlefield");
  const c = characteristicsOf(s, mire);
  eq([s.players[0].life, c.card, c.types, mv(s, mire), c.colors, s.objects[mire].tapped], [37, BACK, ["Land"], 0, [], false],
    "on the battlefield it is Fell Mire: a land, mana value 0, no color, untapped for 3 life");
  ok(legalActions(s, 0).some((a) => a.kind === "activate-mana" && a.objectId === mire), "and it taps for {B}");
  eq(projectFor(s, 1).players[0].zones.Battlefield.cards.map((x) => x.name), [BACK], "Maya sees Fell Mire");
  /* It is played as that face, so it is announced as that face: "Rob played Fell Mire" -- the history, the telemetry's
     land count and the audio rules read this event. */
  const {events: announced} = runScenario({name: "announced", setup: [at(0, "hand", FELL)], steps: [{play: BACK}, {answer: [0]}]}, index.definition, {});
  eq(announced.filter((e) => e.kind === "GameEventLandPlayed").map((e) => e.data.fields.land?.name), [BACK], "the land played is announced as Fell Mire");

  /* It leaves, and is its front face again (CR 712.8a): returned to Rob's hand, it may be cast or played again. */
  const events = [];
  const back = moveOne(s, mire, "hand", events, {owner: 0});
  eq([s.objects[back].card, s.objects[back].types, mv(s, back), s.objects[back].face], [FRONT, ["Instant"], 4, undefined], "returned to the hand, Fell the Profane again");
  const dead = play("destroyed", [at(0, "hand", FELL)], [{play: BACK}, {answer: [1]}]);
  const [land] = named(dead, BACK, "battlefield");
  ok(dead.objects[land].tapped === true, "not paying, it entered tapped");
  moveOne(dead, land, "graveyard", [], {owner: 0});
  eq(named(dead, FRONT, "graveyard").length, 1, "destroyed, it is Fell the Profane in the graveyard");
}
{
  /* Told to enter with its front face up, an instant: it stays where it is (CR 712.14b). */
  const s = play("put onto the battlefield", [at(0, "graveyard", FELL)]);
  const [card] = named(s, FRONT, "graveyard");
  eq([moveOne(s, card, "battlefield", []), named(s, FRONT, "graveyard").length, s.zones.battlefield.length], [null, 1, 0], "an effect putting it onto the battlefield leaves it in the graveyard");
  /* In a library it is an instant: a search for a land card does not find it. */
  const l = play("in the library", [at(0, "library", FELL)]);
  const lands = selectMatching(l, {what: "card", zone: "library", types: ["Land"], controller: "you"}, {controller: 0, source: null});
  eq(lands.filter((id) => l.objects[id].card === FRONT).length, 0, "a search for a land card does not find Fell the Profane");
}
{
  /* Cast, it is its front face: Fell the Profane destroys a creature, and goes to the graveyard as itself. */
  const s = play("cast", [at(0, "battlefield", "Swamp", "Swamp", "Wastes", "Wastes"), at(0, "hand", FELL), at(1, "battlefield", "Crystal Barricade")],
    [{tap: "Swamp"}, {tap: "Swamp"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: FRONT, targets: [{card: "Crystal Barricade", seat: 1}]}]);
  eq([s.stack.length, s.objects[s.stack[0].objectId]?.card], [1, FRONT], "on the stack it is Fell the Profane");
}
{
  /* The compiler: a back face named other than the card's second name is refused. */
  const script = JSON.parse(readFileSync(new URL("../game/engine/cards/f/fell-the-profane-fell-mire.json", import.meta.url), "utf8"));
  eq(compileScript(script).problems, [], "Fell the Profane // Fell Mire compiles");
  ok(compileScript({...script, back: {...script.back, identity: {...script.back.identity, name: "Fell Swamp"}}}).problems.length > 0, "a back face named otherwise is refused");
  ok(compileScript({...script, back: {identity: script.back.identity}}).problems.length > 0, "and one without abilities");
  eq(validateScript({...script, back: {identity: {name: "Fell Mire"}, abilities: []}}).errors.map((e) => e.path), ["back.identity.types"], "the schema says where a back face is wrong");
  ok(index.resolve(FELL)?.playable === true, `${FELL} is defined and playable`);
}

console.log(`engine-mdfc: ${checks} checks passed -- a modal double-faced card: its front face everywhere but the battlefield and the stack, played as its land face and entering that face up, its front again when it leaves, and kept where it is when told to enter as an instant.`);
