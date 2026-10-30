/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A FOOD AND A HALL OF ECHOES THAT OKO TURNED INTO ELKS OFFER NOTHING, AND SAY WHY (ROB-330, ROB-331; Rob's playtest of
 * 2026-10-30, who answered that both were Elked, so the game was right).
 *
 * Rob could not activate a Food ("{2}, {T}, Sacrifice this artifact: You gain 3 life") and was not offered a Hall of Echoes'
 * "{5}: This land becomes a copy of target creature you control until end of turn". Both had lost all their abilities to Oko,
 * Thief of Crowns' +1 (CR 613.1f), the rules were right, and the board said nothing. These are the regression tests:
 *
 *   1. A Food that was not Elked, with {2} and untapped, is offered its ability, and activating it taps and sacrifices it, pays
 *      {2} and gains 3 life. One Oko turned into an Elk is not offered it, and the room says why, in the refusal's words
 *      (rules/actions.mjs, whyNoAbilities): what is wrong, who did it, what to do instead.
 *   2. A Hall of Echoes that was not Elked, with a creature and five other untapped sources, is offered "{5}: become a copy" and
 *      completes it: the Hall is a copy of the creature until end of turn. Elked, it is offered nothing, not even its {T}: {C},
 *      and says why.
 *   3. The reason is said of what is wrong and nothing else: not of Oko, nor of a land, nor of a permanent with no abilities to
 *      use, nor to a player who does not control it.
 *   4. The ledger (data/engine/support.json): Hall of Echoes, Oko and Tezzeret's Gambit are `verified`, as their definitions are,
 *      and the file is the card directory as it stands (game/tools/engine-definitions.mjs --check).
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {legalActions, whyNoAbilities, explainAbilityless} from "../game/engine/rules/actions.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const index = loadCardIndex();
const FIX = {
  "Legend Bear": {types: ["Creature"], supertypes: ["Legendary"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const play = (setup, steps = []) => runScenario({name: "elked reasons", setup, steps, expect: []}, index.definition, FIX).state;
const onField = (s, name, seat = 0) => s.zones.battlefield.filter((id) => s.objects[id].card === name && s.objects[id].controller === seat);
const offers = (s, name, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "activate" && a.label === name);
const OKO = "Oko, Thief of Crowns", ELKED = (what) => `${what} lost all abilities to ${OKO}, so it has nothing to activate. Use another permanent; the abilities come back only if that effect ends.`;
const THEN = {to: {turn: 3, phase: "MAIN1"}};   /* Oko's loyalty ability is once a turn, at sorcery speed: his controller's next turn */

/* ---- 1. THE FOOD ---- */
{
  /* Oko's +2 makes a real Food token; two Wastes pay its {2}. */
  const s = play([at(0, "battlefield", OKO, "Wastes", "Wastes")], [{activate: OKO, ability: "a0"}, {resolve: true}, {tap: "Wastes"}, {tap: "Wastes"}]);
  const food = onField(s, "Food")[0], life = s.players[0].life;
  eq(offers(s, "Food").length, 1, "an untapped Food with {2} in the pool is offered its ability");
  eq(whyNoAbilities(s, 0, food), null, "and nothing is said of it: it offers what it should");
  const done = play([at(0, "battlefield", OKO, "Wastes", "Wastes")], [{activate: OKO, ability: "a0"}, {resolve: true}, {tap: "Wastes"}, {tap: "Wastes"}, {activate: "Food"}, {resolve: true}]);
  eq([done.players[0].life, onField(done, "Food").length], [life + 3, 0], "activated: it is sacrificed, {2} paid, and Rob gains 3 life");
  eq(Object.values(done.players[0].manaPool ?? {}).reduce((n, v) => n + v, 0), 0, "and the {2} was spent");

  /* The same Food after Oko's +1 on his next turn: an Elk with no abilities. */
  const elked = play([at(0, "battlefield", OKO, "Wastes", "Wastes")],
    [{activate: OKO, ability: "a0"}, {resolve: true}, THEN, {activate: OKO, ability: "a1", targets: [{card: "Food"}]}, {resolve: true}, {tap: "Wastes"}, {tap: "Wastes"}]);
  const elk = onField(elked, "Food")[0];
  eq(offers(elked, "Food").length, 0, "an Elked Food with the same {2} is not offered its ability (CR 613.1f)");
  ok(characteristicsOf(elked, elk).types.includes("Creature") && characteristicsOf(elked, elk).subtypes.includes("Food"), "it is a Food and an Elk creature still");
  eq(whyNoAbilities(elked, 0, elk), ELKED("Food"), "and the room says why: what is wrong, who did it, what to do instead");
  eq(whyNoAbilities(elked, 1, elk), null, "to the player who controls it, and no other");
  eq(whyNoAbilities(elked, 0, onField(elked, OKO)[0]), null, "nothing is said of Oko, whose abilities are his own");
  eq(onField(elked, "Wastes").map((id) => whyNoAbilities(elked, 0, id)), [null, null], "nor of a land");
}

/* ---- 2. THE HALL OF ECHOES ---- */
{
  const five = [at(0, "battlefield", "Hall of Echoes", "Legend Bear", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes")];
  const taps = [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}];
  const s = play(five, taps);
  eq(offers(s, "Hall of Echoes").length, 1, "with a creature and five untapped sources, the Hall is offered \"{5}: become a copy\" once for its one creature");
  const hall = onField(s, "Hall of Echoes")[0];
  eq(whyNoAbilities(s, 0, hall), null, "and nothing is said of it");
  const done = play(five, [...taps, {activate: "Hall of Echoes", targets: [{card: "Legend Bear"}]}, {resolve: true}]);
  eq(onField(done, "Legend Bear").length, 2, "chosen, the Hall becomes a copy of the creature: two Legend Bears, and no legend rule this turn");
  ok(characteristicsOf(done, hall).types.includes("Creature"), "a creature, as the Bear is");

  /* Four others and the Hall's own {T}: {C} also make five (the ability has no {T} in its cost). */
  const four = play([at(0, "battlefield", "Hall of Echoes", "Legend Bear", "Wastes", "Wastes", "Wastes", "Wastes")], [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Hall of Echoes"}]);
  eq(offers(four, "Hall of Echoes").length, 1, "the Hall's own {C} counts toward the {5}: four other sources are enough");
  const short = play([at(0, "battlefield", "Hall of Echoes", "Legend Bear", "Wastes", "Wastes", "Wastes")], [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Hall of Echoes"}]);
  eq(offers(short, "Hall of Echoes").length, 0, "with only four mana it is not offered");
  const none = play([at(0, "battlefield", "Hall of Echoes", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes")], taps);
  eq(offers(none, "Hall of Echoes").length, 0, "and with no creature of Rob's to copy it is not offered either");

  /* Elked by Oko. His +1 reaches an artifact or a creature, and a Hall of Echoes is a land: so it was a creature when it was
     hit (a copy it had become), and what is left when the copy ends is an Elk land creature with no abilities, for good. His
     +1's own four effects (cards/o/oko-thief-of-crowns.json) are applied to it here, as he is their source. */
  const elk = (setup, steps, victim, seat = 0) => {
    const state = play(setup, steps), id = onField(state, victim, seat)[0], source = onField(state, OKO, 0)[0];
    runEffects(state, [{layer: 4, apply: {addTypes: ["Creature"], setCreatureTypes: ["Elk"]}}, {layer: 5, apply: {setColors: ["G"]}}, {layer: 6, apply: {removeAllAbilities: true}},
      {layer: 7, sublayer: "b", apply: {setPower: 3, setToughness: 3}}].map((e) => ({effect: "effectUntil", targets: [id], until: "ever", ...e})), {controller: 0, source});
    return {state, id};
  };
  const {state: elked, id: elkHall} = elk([at(0, "battlefield", OKO, "Hall of Echoes", "Legend Bear", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes")], taps, "Hall of Echoes");
  eq(offers(elked, "Hall of Echoes").length, 0, "an Elked Hall with the same creature and five sources is not offered \"{5}: become a copy\" (CR 613.1f)");
  eq(legalActions(elked, 0).filter((a) => a.objectId === elkHall).length, 0, "nor its {T}: {C}: it offers nothing at all");
  eq(whyNoAbilities(elked, 0, elkHall), ELKED("Hall of Echoes"), "and the room says why");
  /* What the room sends: the Elked Hall's card in its controller's view carries the reason, and no other card does, nor in the
     other seat's view (game/room/room.mjs calls this beside the hand's own reasons). */
  const mine = explainAbilityless(elked, projectFor(elked, 0), 0).players[0].zones.Battlefield.cards;
  eq(mine.filter((c) => c.why).map((c) => [c.cardId, c.why]), [[elkHall, ELKED("Hall of Echoes")]], "the view's Elked Hall says why, and no other permanent of Rob's says anything");
  eq(explainAbilityless(elked, projectFor(elked, 1), 1).players[0].zones.Battlefield.cards.some((c) => c.why), false, "and the other seat's view of it says nothing");
  /* A Bear Oko turned into an Elk has no ability to use: nothing to explain. */
  const bear = play([at(0, "battlefield", OKO, "Bear")], [THEN, {activate: OKO, ability: "a1", targets: [{card: "Bear"}]}, {resolve: true}]);
  eq(whyNoAbilities(bear, 0, onField(bear, "Bear")[0]), null, "an Elked Bear had no ability to lose: nothing is said");
  /* Another player's Elk is not Rob's to be told of. */
  const {state: theirs, id: theirHall} = elk([at(0, "battlefield", OKO), at(1, "battlefield", "Hall of Echoes")], [], "Hall of Echoes", 1);
  eq([whyNoAbilities(theirs, 0, theirHall), whyNoAbilities(theirs, 1, theirHall)], [null, ELKED("Hall of Echoes")], "an opponent's Elked Hall is explained to its controller alone");
}

/* ---- 3. THE LEDGER ---- */
{
  const ledger = JSON.parse(readFileSync(new URL("../data/engine/support.json", import.meta.url), "utf8")).cards;
  const status = (name) => ledger.find((c) => c.name === name)?.status;
  eq(["Hall of Echoes", OKO, "Tezzeret's Gambit", "Food Chain"].map(status), ["verified", "verified", "verified", "unsupported"],
    "the ledger agrees with the card directory: Hall of Echoes, Oko and Tezzeret's Gambit have definitions; Food Chain does not");
  const {supportLedgerText, SUPPORT_LEDGER} = await import("../game/tools/engine-definitions.mjs");
  eq(readFileSync(SUPPORT_LEDGER, "utf8") === supportLedgerText(), true, "and the file is the card directory as it stands (node game/tools/engine-definitions.mjs --write)");
}

console.log(`engine-elked-reasons: ${checks} checks passed -- an un-Elked Food and Hall of Echoes are offered and complete their abilities; an Elked one is not, and the room says why; the ledger agrees with the card directory.`);
