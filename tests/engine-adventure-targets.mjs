/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (p1-bugs): AN ADVENTURE'S COUNTED TARGETS ASKED AS THE ADVENTURE'S (CR 715.3a, 601.2c).
 *
 * "Put a +1/+1 counter on up to one target creature" (Meager Meal), "tap one or two target creatures" (Gaze in Wonder),
 * "exile two target creatures and/or lands you control" (Gone Fishing): a counted target is picked once the offer is
 * taken, the cast stopping to ask (rules/actions.mjs, "choose-targets"). It stopped inside withAdventure, which shows the
 * card as itself again as it returns, so the question read the creature card's spell -- none -- and asked one of every
 * permanent. The question and its answer now read the card shown as its Adventure, as the offer was made (CR 715.3a), and
 * leave it as itself after. Every adventurer already defined still plays (tests/engine-adventure.mjs, their scenarios).
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {createCardIndex} from "../game/engine/cards/index.mjs";
import {SCRIPT_SCHEMA} from "../game/engine/script/schema.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const being = (cost, subtypes, p, t) => ({types: ["Creature"], subtypes, manaCost: cost, colors: ["G"], power: p, toughness: t});
const FIXTURES = {Bear: being("{1}{G}", ["Bear"], 2, 2), Ogre: being("{2}{R}", ["Ogre"], 3, 3), Rock: {types: ["Artifact"], manaCost: "{1}", colors: []}};
const MEAL = "Gollum, Silent Slinker // Meager Meal", GAZE = "Velvetwing Butterflies // Gaze in Wonder", FISHING = "Lake-town Mariners // Gone Fishing";
/* Cast as the Adventure with its counted target left to be asked; the game then waiting on that question. */
const asked = (scenario) => runScenario({...scenario, expect: []}, cards.definition, FIXTURES).state;

{
  /* Meager Meal, three players: up to one creature -- Rob's, Maya's, Trey's -- not a land, not an artifact. */
  const s = asked({name: "meal", seats: 3, setup: [at(0, "battlefield", "Swamp", "Bear"), at(0, "hand", MEAL), at(1, "battlefield", "Ogre", "Rock"), at(2, "battlefield", "Bear")],
    steps: [{tap: "Swamp"}, {cast: "Meager Meal", targets: "any"}]});
  const before = hashState(s);
  const choice = awaitingChoice(s);
  eq([s.awaiting.kind, choice.min, choice.max, choice.options.map((o) => o.label).sort()], ["choose-targets", 0, 1, ["Bear", "Bear (Trey's)", "Ogre (Maya's)"]],
    "up to one creature, from the three creatures alone");
  const card = s.objects[s.awaiting.action.objectId];
  eq([hashState(s), card.card, card.zone, card.face ?? null], [before, MEAL.split(" // ")[0], "hand", null], "asking changed nothing: the card in his hand, as itself");
  /* None at all is an answer; then the cast goes on, the Adventure on the stack. */
  resolveAwaiting(s, []);
  eq([s.awaiting ?? null, s.stack.map((e) => e.name), s.stack[0].targets[0]], [null, ["Meager Meal"], []], "no creature: Meager Meal cast, its counted target none");
}
{
  /* Gaze in Wonder: one or two creatures; three refused, none refused; the house pilot's answer one of them. */
  const s = asked({name: "gaze", setup: [at(0, "battlefield", "Plains", "Wastes"), at(0, "hand", GAZE), at(1, "battlefield", "Bear", "Ogre", "Rock")],
    steps: [{tap: "Plains"}, {tap: "Wastes"}, {cast: "Gaze in Wonder", targets: "any"}]});
  const choice = awaitingChoice(s);
  eq([choice.min, choice.max, choice.options.map((o) => o.label).sort()], [1, 2, ["Bear (Maya's)", "Ogre (Maya's)"]], "one or two of Maya's creatures, not her Rock or his lands");
  const answer = housePilot({seat: 0}).answer(projectFor(s, 0), choice).indices;
  eq(answer.length >= 1 && answer.length <= 2 && answer.every((i) => choice.options[i]), true, "the house pilot answers it with one or two of them");
  let refused = null;
  try { resolveAwaiting(s, []); } catch (error) { refused = error.message; }
  eq(refused, "Invalid selection", "none is not one or two");
  resolveAwaiting(s, [0, 1]);
  eq([s.stack.map((e) => e.name), s.stack[0].targets[0].length], [["Gaze in Wonder"], 2], "both chosen: Gaze in Wonder cast at them");
}
{
  /* Gone Fishing: exactly two of his creatures and lands -- one refused -- and Maya's Bear never among them. */
  const s = asked({name: "fishing", setup: [at(0, "battlefield", "Island", "Wastes", "Wastes", "Wastes", "Bear", "Rock"), at(0, "hand", FISHING), at(1, "battlefield", "Bear")],
    steps: [{tap: "Island"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Gone Fishing", targets: "any"}]});
  const choice = awaitingChoice(s);
  eq([choice.min, choice.max, choice.options.length], [2, 2, 5], "two of his five creatures and lands");
  let refused = null;
  try { resolveAwaiting(s, [0]); } catch (error) { refused = error.message; }
  eq([refused, s.awaiting?.kind], ["Invalid selection", "choose-targets"], "one is refused, and the question still waits");
  resolveAwaiting(s, [0, 1]);
  eq([s.stack.map((e) => e.name), s.zones.hand[0].length], [["Gone Fishing"], 0], "two chosen: Gone Fishing on the stack, the card gone from his hand");
}
{
  /* Two counted targets on one Adventure: the second is found and asked as the Adventure's too, once the first is
     answered -- "tap up to one target creature, untap up to one target artifact" asks of the creatures, then of the
     artifacts; with no artifact at all, of nothing (CR 601.2c: chosen as none), and the Prank is cast at once. */
  const prank = {schema: SCRIPT_SCHEMA, identity: {name: "Probe Imp // Probe Prank", oracleId: "probe-imp", types: ["Creature"], subtypes: ["Imp"], manaCost: "{U}", colors: ["U"], colorIdentity: ["U"], power: 1, toughness: 1},
    oracleText: "", source: "hand", abilities: [],
    adventure: {identity: {name: "Probe Prank", types: ["Instant"], subtypes: ["Adventure"], manaCost: "{U}", colors: ["U"], power: null, toughness: null},
      oracleText: "Tap up to one target creature. Untap up to one target artifact.", abilities: [{kind: "spell", text: "Tap up to one target creature. Untap up to one target artifact.",
        targets: [{what: "permanent", types: ["Creature"], count: {min: 0, max: 1}}, {what: "permanent", types: ["Artifact"], count: {min: 0, max: 1}}],
        effects: [{effect: "tap", targets: {target: 0}}, {effect: "untap", targets: {target: 1}}]}]}};
  const probes = createCardIndex([prank]);
  const lookup = (name) => probes.definition(name) ?? cards.definition(name);
  const pranked = (theirs) => runScenario({name: "prank", setup: [at(0, "battlefield", "Island", "Bear"), at(0, "hand", "Probe Imp // Probe Prank"), at(1, "battlefield", ...theirs)],
    steps: [{tap: "Island"}, {cast: "Probe Prank", targets: "any"}], expect: []}, lookup, FIXTURES).state;
  const s = pranked(["Ogre", "Rock"]);
  eq(awaitingChoice(s).options.map((o) => o.label).sort(), ["Bear", "Ogre (Maya's)"], "first, up to one creature");
  resolveAwaiting(s, [awaitingChoice(s).options.findIndex((o) => o.label === "Ogre (Maya's)")]);
  eq([s.awaiting?.kind, awaitingChoice(s).options.map((o) => o.label)], ["choose-targets", ["Rock (Maya's)"]], "then up to one artifact: Maya's Rock");
  resolveAwaiting(s, [0]);
  eq([s.stack.map((e) => e.name), s.stack[0].targets.map((t) => t.length)], [["Probe Prank"], [1, 1]], "both answered: the Prank cast, a creature and an artifact");
  const none = pranked(["Ogre"]);
  resolveAwaiting(none, [awaitingChoice(none).options.findIndex((o) => o.label === "Ogre (Maya's)")]);
  eq([none.awaiting ?? null, none.stack.map((e) => e.name), none.stack[0]?.targets.map((t) => t.length)], [null, ["Probe Prank"], [1, 0]],
    "no artifact anywhere: nothing more asked, the Prank cast at the Ogre and no artifact");
}
{
  /* The creature's own spell has no counted target, and casting it asks nothing: as itself, Gollum is cast at once. */
  const s = asked({name: "gollum", setup: [at(0, "battlefield", "Swamp", "Wastes", "Wastes", "Wastes"), at(0, "hand", MEAL)],
    steps: [{tap: "Swamp"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Gollum, Silent Slinker"}]});
  eq([s.awaiting ?? null, s.stack.map((e) => e.name)], [null, ["Gollum, Silent Slinker"]], "as itself: nothing asked, Gollum on the stack");
}

console.log(`engine-adventure-targets: ${checks} checks passed -- an Adventure's counted targets are asked and answered as the Adventure's (up to one creature, one or two, exactly two of yours), the card left as itself while it is asked.`);
