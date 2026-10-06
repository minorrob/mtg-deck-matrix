/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "PUT ANY NUMBER OF NONLAND PERMANENT CARDS WITH TOTAL MANA VALUE 4 OR LESS FROM AMONG THEM ONTO THE BATTLEFIELD" (Ao, the Dawn
 * Sky; AI 3's Teysa deck).
 *
 * `dig` with `totalManaValueAtMost` (script/effects/asking.mjs): the looker chooses one card at a time, each question offering
 * only what still fits what is left of the total (an {X} card's mana value is its printed one with X as 0, CR 202.3e), and "No
 * more" -- so no answer can break it; the cards chosen move together once the last is chosen, the rest to the bottom in a
 * random order. And Ao's other mode, "each permanent you control that's a creature or Vehicle", a choice of selectors that
 * counts a creature Vehicle once. The card scenarios play Ao; this suite holds the refusals, the order, X, and three players.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {beginResolution, answerResolution, resolutionChoice} from "../game/engine/script/resolution.mjs";
import {putCounterAll} from "../game/engine/script/effects/resources.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (fn, pattern, m) => { assert.throws(fn, pattern, m); checks += 1; };

const DIG = {effect: "dig", count: 7, selector: {nonTypes: ["Land", "Instant", "Sorcery"]}, totalManaValueAtMost: 4, upTo: true, to: "battlefield", rest: "bottom", random: true};
const C = (name, manaCost, types = ["Creature"]) => ({card: name, types, manaCost, power: 1, toughness: 1});
function library(cards) {
  const s = createState({matchId: "m", seed: "dig-total", players: [{name: "Rob"}, {name: "Maya"}, {name: "Trey"}]});
  for (const c of cards) addObject(s, {...c, owner: 0, controller: 0}, "library", 0);
  for (let i = 0; i < 5; i += 1) addObject(s, {...C("Filler", "{5}"), owner: 0, controller: 0}, "library", 0);
  return s;
}
const labels = (s) => resolutionChoice(s, s.awaiting).options.map((o) => o.label);
const pick = (s, label, rng) => answerResolution(s, [resolutionChoice(s, s.awaiting).options.find((o) => o.label === label).index], {}, rng);

/* ---- what each question offers, and what it refuses ---- */
{
  const rng = createRng("dig-total");
  const s = library([C("Giant", "{3}{G}{G}"), C("Ogre", "{2}{R}"), {card: "Forest", types: ["Land"], manaCost: ""}, C("Gift", "{1}", ["Instant"]), C("Hydra", "{X}{G}"), C("Bear", "{1}{G}"), C("Elf", "{G}")]);
  ok(beginResolution(s, [DIG], {controller: 0}, rng).status === "waiting", "the top seven looked at, and Rob asked");
  eq(labels(s), ["Ogre", "Hydra", "Bear", "Elf", "No more"], "offered: the nonland permanent cards of mana value 4 or less -- not the Giant (5), the Forest, the Gift; the {X}{G} Hydra as 1");
  throws(() => answerResolution(s, [9], {}, rng), /Invalid selection/, "an answer past the options is refused");
  throws(() => answerResolution(s, [0, 1], {}, rng), /Invalid selection/, "and two at once: one card a question");
  pick(s, "Ogre", rng);
  eq(labels(s), ["Hydra", "Elf", "No more"], "the Ogre (3) chosen: 1 left, the Bear (2) no longer fits");
  eq([cardsIn(s, "library", 0).length, s.zones.battlefield.length], [12, 0], "and nothing has moved yet");
  pick(s, "Hydra", rng);
  eq(s.awaiting, null, "the Hydra (1) chosen: nothing else fits, and nobody is asked again");
  eq(s.zones.battlefield.map((id) => s.objects[id].card).sort(), ["Hydra", "Ogre"], "both onto the battlefield, together");
  const lib = cardsIn(s, "library", 0).map((id) => s.objects[id].card);
  eq([lib.length, lib.slice(0, 5)], [10, ["Filler", "Filler", "Filler", "Filler", "Filler"]], "the five not taken go under the five that were never looked at");
  eq(lib.slice(5).sort(), ["Bear", "Elf", "Forest", "Giant", "Gift"], "the bottom five are the ones looked at and left");
}
{
  const rng = createRng("dig-total-none");
  const s = library([C("Bear", "{1}{G}")]);
  beginResolution(s, [DIG], {controller: 0}, rng);
  pick(s, "No more", rng);
  eq([s.awaiting, s.zones.battlefield.length, cardsIn(s, "library", 0).length], [null, 0, 6], "\"No more\" at once: nothing enters, the six go to the bottom");
}
{
  const rng = createRng("dig-total-big");
  const s = library([C("Giant", "{3}{G}{G}")]);
  const outcome = beginResolution(s, [DIG], {controller: 0}, rng);
  eq([outcome.status, s.awaiting], ["done", null], "nothing that fits: nobody is asked");
}

/* ---- "each permanent you control that's a creature or Vehicle": a creature Vehicle once, and only his ---- */
{
  const s = library([]);
  const cart = addObject(s, {card: "Cart", types: ["Artifact", "Creature"], subtypes: ["Vehicle"], power: 3, toughness: 3, owner: 0, controller: 0}, "battlefield");
  const wagon = addObject(s, {card: "Wagon", types: ["Artifact"], subtypes: ["Vehicle"], power: 3, toughness: 3, owner: 0, controller: 0}, "battlefield");
  const theirs = addObject(s, {card: "Bear", types: ["Creature"], power: 2, toughness: 2, owner: 2, controller: 2}, "battlefield");
  putCounterAll(s, {selector: {what: "permanent", controller: "you", anyOf: [{types: ["Creature"]}, {subtypes: ["Vehicle"]}]}, counter: "+1/+1", count: 2}, {controller: 0});
  eq([s.objects[cart].counters["+1/+1"], s.objects[wagon].counters["+1/+1"], s.objects[theirs].counters["+1/+1"] ?? 0], [2, 2, 0],
    "a crewed Cart (creature and Vehicle) two, not four; an uncrewed Wagon two; Trey's Bear none");
}

console.log(`engine-dig-total: ${checks} checks passed -- any number of cards with a total mana value, one at a time and never past it, the rest under in a random order.`);
