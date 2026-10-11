/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, W2D: "PUT ALL LAND CARDS REVEALED THIS WAY ONTO THE BATTLEFIELD TAPPED AND PUT ALL CREATURE CARDS REVEALED THIS WAY
 * INTO YOUR HAND" (Zimone's Experiment; CR 701.20a).
 *
 * dig's `toByType` (effects/asking.mjs): each card taken goes to the first destination whose card types it has -- a land
 * creature is a land card, so it goes where the lands go -- tapped when the destination says. The cards taken alone are
 * revealed (`reveal: "taken"`); the rest go to the bottom in a random order. Here: each destination, the land creature, the
 * question's words, and the compiler.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const FIX = {
  Ogre: {types: ["Creature"], subtypes: ["Ogre"], manaCost: "{2}{R}", colors: ["R"], power: 3, toughness: 3},
  Arbor: {types: ["Land", "Creature"], subtypes: ["Forest", "Dryad"], manaCost: null, colors: ["G"], power: 1, toughness: 1},
  Relic: {types: ["Artifact"], subtypes: [], manaCost: "{2}", colors: []},
};
const table = (library) => runScenario({name: "dig-by-type", library, setup: [], steps: []}, index.definition, FIX).state;
const DIG = (more = {}) => [{effect: "dig", count: 5, take: 2, upTo: true, reveal: "taken", random: true, rest: "bottom",
  selector: {anyOf: [{types: ["Creature"]}, {types: ["Land"]}]},
  toByType: [{types: ["Land"], to: "battlefield", tapped: true}, {types: ["Creature"], to: "hand"}], ...more}];
const names = (s, ids) => ids.map((id) => s.objects[id].card);
const run = (library, pick) => {
  const s = table(library), rng = createRng("dig-by-type");
  beginResolution(s, DIG(), {controller: 0, source: null}, rng);
  const q = awaitingChoice(s);
  const events = resolveAwaiting(s, pick.map((name) => q.options.find((o) => o.label === name && !pick.slice(0, pick.indexOf(name)).includes(o.label)).index), null, rng);
  return {s, q, events};
};

{
  const {s, q, events} = run(["Relic", "Forest", "Ogre", "Arbor", "Relic"], ["Forest", "Ogre"]);
  eq([q.title, q.min, q.max, q.options.map((o) => o.label)], ["Choose up to 2 to reveal", 0, 2, ["Forest", "Ogre", "Arbor"]], "up to two of the land and creature cards among the top five");
  const forest = s.zones.battlefield.find((id) => s.objects[id].card === "Forest");
  eq([names(s, s.zones.hand[0]), forest !== undefined && s.objects[forest].tapped], [["Ogre"], true], "the Forest onto the battlefield tapped, the Ogre into hand");
  eq(events.filter((e) => e.kind === "GameEventCardRevealed").map((e) => e.data.fields.card.name).sort(), ["Forest", "Ogre"], "the two taken revealed, the rest not");
  eq(names(s, s.zones.library[0].slice(-3)).sort(), ["Arbor", "Relic", "Relic"], "the rest on the bottom");
}
{
  /* A land creature is a land card: where the lands go, not into hand. */
  const {s} = run(["Arbor", "Ogre", "Relic", "Relic", "Relic"], ["Arbor", "Ogre"]);
  const arbor = s.zones.battlefield.find((id) => s.objects[id].card === "Arbor");
  eq([arbor !== undefined, arbor !== undefined && s.objects[arbor].tapped, names(s, s.zones.hand[0])], [true, true, ["Ogre"]], "the Arbor onto the battlefield tapped; the Ogre into hand");
}

/* ---- the compiler ---- */
const compiled = (toByType) => compileScript({schema: "CrankCardScript@1",
  identity: {name: "Odd Experiment", oracleId: "x", types: ["Sorcery"], subtypes: [], manaCost: "{3}{G}", colors: ["G"], colorIdentity: ["G"]},
  oracleText: "x", source: "hand", abilities: [{kind: "spell", text: "x", effects: DIG({toByType})}]}).problems;
{
  eq(compiled([{types: ["Land"], to: "battlefield", tapped: true}, {types: ["Creature"], to: "hand"}]), [], "lands tapped onto the battlefield, creatures into hand: compiles");
  ok(compiled([]).some((p) => p.includes("toByType is a list")), "no destination: refused");
  ok(compiled([{to: "hand"}]).some((p) => p.includes("toByType is a list")), "no card types: refused");
  ok(compiled([{types: [], to: "hand"}]).some((p) => p.includes("toByType is a list")), "an empty list of card types: refused");
  ok(compiled([{types: ["Land"], to: "library"}]).some((p) => p.includes("toByType is a list")), "a zone it does not put cards in: refused");
  ok(compiled([{types: ["Land"], to: "hand", tapped: true}]).some((p) => p.includes("toByType is a list")), "tapped, into a hand: refused");
  ok(compiled([{types: ["Land"], to: "battlefield", faceDown: true}]).some((p) => p.includes("toByType is a list")), "a word it does not know: refused");
}

console.log(`engine-dig-by-type: ${checks} checks passed -- a dig's cards to zones by card type: lands tapped onto the battlefield, creatures into hand, a land creature with the lands.`);
