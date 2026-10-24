/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ROB'S PRIORITY LISTS, LANE P1 (BLINK): WHAT THE CARD SCENARIOS CANNOT SEE (docs/engine/card-load-rob-lists-2026-10-24).
 *
 * The scenarios play each card; this holds what a seat's view does not show, or what needs a die or four players:
 *   - Portal to Phyrexia's "It's a Phyrexian in addition to its other types" (a subtype, layer 4);
 *   - Preston, the Vanisher's "a 0/1 white Illusion": the colors and creature types replaced, other subtypes kept;
 *   - Riptide Gearhulk's "third from the top", where a library is only a count to its seats;
 *   - an airbended card cast by its owner alone;
 *   - Lae'zel's Acrobatics, 10-20: a permanent that enters and is exiled again in one resolution still has its "when this
 *     enters" (CR 603.6a) -- doubled by Panharmonicon, and suppressed for an opponent's by Elesh Norn, Mother of Machines;
 *   - Y'shtola Rhul's additional end step, again on its controller's next turn (the end steps counted afresh);
 *   - myriad with four players: two "you may"s, and one trigger at end of combat for both tokens.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex, loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {subtypesOf, colorsOf, characteristicsOf, controllerOf} from "../game/engine/rules/layers.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const later = (seat, zone, ...cards) => ({seat, zone, cards, sick: true});
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Elk: {types: ["Creature"], subtypes: ["Elk"], manaCost: "{2}{G}", colors: ["G"], power: 3, toughness: 3},
  Big: {types: ["Creature"], subtypes: ["Beast"], manaCost: "{3}{G}{G}", colors: ["G"], power: 5, toughness: 5},
  /* An artifact creature with a subtype that is no creature type (CR 205.3g): kept by "a 0/1 white Illusion". */
  Clockwork: {types: ["Artifact", "Creature"], subtypes: ["Construct", "Vehicle"], manaCost: "{3}", colors: [], power: 3, toughness: 3},
  /* A creature with no mana cost (CR 202.1b), cast only for an alternative cost (CR 118.6a). */
  Costless: {types: ["Creature"], subtypes: ["Shapeshifter"], manaCost: null, colors: [], power: 1, toughness: 1},
};
const play = (name, setup, steps, seats = 2) => runScenario({name, seats, setup, steps}, index.definition, FIX).state;
const onField = (s, card, seat = null) => Object.keys(s.objects).map(Number).filter((id) => s.objects[id].card === card && s.objects[id].zone === "battlefield"
  && (seat === null || controllerOf(s, id) === seat));

{
  const s = play("portal", [later(0, "battlefield", "Portal to Phyrexia"), at(1, "graveyard", "Elk")],
    [{to: {turn: 3, phase: "UPKEEP"}}, {choose: ["Elk"]}, {resolve: true}]);
  const [elk] = onField(s, "Elk");
  eq([controllerOf(s, elk), subtypesOf(s, elk).sort()], [0, ["Elk", "Phyrexian"]], "Portal to Phyrexia: Maya's Elk, Rob's, a Phyrexian in addition to an Elk");
}
{
  const s = play("preston", [at(0, "battlefield", "Preston, the Vanisher", "Clockwork", "Plains"), at(0, "hand", "Cloudshift")],
    [{tap: "Plains"}, {cast: "Cloudshift", targets: [{card: "Clockwork"}]}, {resolve: true}, {resolve: true}]);
  const token = onField(s, "Clockwork").find((id) => s.objects[id].token === true);
  const c = characteristicsOf(s, token);
  eq([colorsOf(s, token), subtypesOf(s, token).sort(), c.power, c.toughness, c.types.sort()],
    [["W"], ["Illusion", "Vehicle"], 0, 1, ["Artifact", "Creature"]], "Preston: the copy a 0/1 white Illusion -- its creature types replaced, Vehicle and its card types kept");
}
{
  const s = play("riptide", [at(0, "battlefield", "Plains", "Plains", "Island", "Island", "Wastes"), at(0, "hand", "Riptide Gearhulk"), at(1, "battlefield", "Bear")],
    [{tap: "Plains"}, {tap: "Plains"}, {tap: "Island"}, {tap: "Island"}, {tap: "Wastes"}, {cast: "Riptide Gearhulk"}, {resolve: true}, {choose: ["Bear (Maya's)"]}, {resolve: true}]);
  eq(s.zones.library[1].slice(0, 4).map((id) => s.objects[id].card), ["Wastes", "Wastes", "Bear", "Wastes"], "Riptide Gearhulk: the Bear third from the top of Maya's library");
}
{
  const s = play("airbended", [at(0, "battlefield", "Plains", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Airbender Ascension"), at(1, "battlefield", "Big")],
    [{tap: "Plains"}, {tap: "Wastes"}, {cast: "Airbender Ascension"}, {resolve: true}, {choose: ["Big (Maya's)"]}, {resolve: true}, {tap: "Wastes"}, {tap: "Wastes"}]);
  const big = Object.keys(s.objects).map(Number).find((id) => s.objects[id].card === "Big" && s.objects[id].zone === "exile");
  const permit = (s.effects ?? []).find((e) => e.rule === "may-play" && e.affects.ids.includes(big));
  eq([permit?.player, permit?.manaInstead], [1, "{2}"], "airbended: Maya's to cast, for {2} -- Rob, whose ability it was, may not");
}

/* AN AIRBENDED CARD, CAST FOR {2} AND NO OTHER WAY (CR 118.9a): not for its own alternative cost (Overlord of the Floodpits'
   impending, with the {1}{U}{U} for it in Maya's pool) -- and one with no mana cost at all, for {2} all the same (CR 118.6a). */
const castWays = (card, lands) => {
  const s = play(`airbend ${card}`, [at(0, "battlefield", "Plains", "Wastes"), at(0, "hand", "Airbender Ascension"), at(1, "battlefield", card, ...lands)],
    [{tap: "Plains"}, {tap: "Wastes"}, {cast: "Airbender Ascension"}, {resolve: true}, {choose: [`${card} (Maya's)`]}, {resolve: true}, {to: {turn: 2, phase: "MAIN1"}},
      ...lands.map((land) => ({tap: land, seat: 1}))]);
  const id = Object.keys(s.objects).map(Number).find((x) => s.objects[x].card === card && s.objects[x].zone === "exile");
  return legalActions(s, 1).filter((a) => a.kind === "cast" && a.objectId === id).map((a) => a.alternative ?? "for {2}");
};
eq(castWays("Overlord of the Floodpits", ["Island", "Island", "Wastes"]), ["for {2}"], "an airbended Overlord of the Floodpits: cast for {2} alone, never for its impending cost");
eq(castWays("Costless", ["Wastes", "Wastes"]), ["for {2}"], "an airbended creature with no mana cost: cast for {2}");

/* LAE'ZEL'S ACROBATICS, 10-20: the die is the game's random stream seeded by the scenario's name (rng.mjs) -- the first of
   these names that rolls 10 or more. */
const highRoll = (base, setup, steps, seats = 2) => {
  for (let k = 0; k < 60; k += 1) {
    const r = runScenario({name: `${base} ${k}`, seats, setup, steps}, index.definition, FIX);
    const roll = r.events.find((e) => e.kind === "GameEventDieRolled")?.data?.fields?.result;
    if (roll >= 10) return r.state;
  }
  throw new Error("no seed rolled 10 or more");
};
const LAEZEL = ["Plains", "Wastes", "Wastes", "Wastes"];
const castLaezel = [...LAEZEL.map((land) => ({tap: land})), {cast: "Lae'zel's Acrobatics"}, {resolve: true}, {settle: true}];
{
  const s = highRoll("panharmonicon", [at(0, "battlefield", ...LAEZEL, "Circuit Mender", "Panharmonicon"), at(0, "hand", "Lae'zel's Acrobatics")], castLaezel);
  eq([s.players[0].life, s.zones.hand[0].length], [44, 2],
    "Lae'zel's, 10-20: Circuit Mender returns and is exiled again -- its own \"when this enters\" still triggers, Panharmonicon doubling it (4 life), and two leavings draw two");
}
{
  const s = highRoll("elesh norn", [at(1, "battlefield", "Elesh Norn, Mother of Machines"), at(0, "battlefield", ...LAEZEL, "Circuit Mender"), at(0, "hand", "Lae'zel's Acrobatics")], castLaezel);
  eq([s.players[0].life, s.zones.hand[0].length], [40, 2],
    "Lae'zel's, 10-20, under Maya's Elesh Norn: Rob's Circuit Mender entering triggers nothing even though it is gone again -- its leavings still draw");
}
{
  const {state: s, events} = runScenario({name: "y'shtola, next turn", setup: [at(0, "battlefield", "Circuit Mender", "Y'shtola Rhul")],
    steps: [{to: {turn: 3, phase: "UPKEEP", settle: true}}, {to: {turn: 4, phase: "UPKEEP", settle: true}}]}, index.definition, FIX);
  const endSteps = events.filter((e) => e.kind === "GameEventTurnPhase" && ["END_OF_TURN", "CLEANUP"].includes(e.data?.fields?.phase))
    .map((e) => `${e.data.fields.playerTurn.name} ${e.data.fields.phase === "CLEANUP" ? "cleanup" : "end"}`);
  eq(endSteps, ["Rob end", "Rob end", "Rob cleanup", "Maya end", "Maya cleanup", "Rob end", "Rob end", "Rob cleanup"],
    "Y'shtola Rhul: an additional end step after the end step, before the cleanup, on each of Rob's turns -- never a third, none on Maya's: counted afresh each turn");
  eq(s.endStepsThisTurn ?? 0, 0, "Maya's turn 4, in its upkeep: no end step begun yet");
}
{
  const s = runScenario({name: "myriad, four players", seats: 4, setup: [at(0, "battlefield", "Battle Angels of Tyr")],
    steps: [{attack: ["Battle Angels of Tyr"], at: "Maya"}, {resolve: true}, {choose: ["Yes"]}, {choose: ["Yes"]}, {to: {turn: 1, phase: "COMBAT_END"}}]}, index.definition, FIX).state;
  eq([s.stack.length, onField(s, "Battle Angels of Tyr").length, s.players.map((p) => p.life)], [1, 3, [40, 36, 36, 36]],
    "myriad, four players: a token attacking Trey and one attacking Sam (each dealt 4), and one trigger at end of combat for both");
}

/* Every card the lane wrote, through its scenarios (the lane's list, docs/engine/card-load-rob-lists-2026-10-24/lane-P1-blink.json). */
const LANE = JSON.parse(readFileSync(new URL("../docs/engine/card-load-rob-lists-2026-10-24/lane-P1-blink.json", import.meta.url), "utf8")).cards.map((c) => c.name);
const files = loadCardScenarios().filter((f) => LANE.includes(f.scenarios.card));
eq(files.length, LANE.length, "each card the lane wrote has its scenarios");
for (const {scenarios: file} of files) for (const scenario of file.scenarios) {
  try { runScenario(scenario, index.definition, file.fixtures ?? {}); } catch (error) { throw new Error(`${file.card}: ${error.message}`); }
  checks += 1;
}

console.log(`engine-roblists-p1: ${checks} checks passed -- a Phyrexian added, a 0/1 white Illusion, third from the top, an owner's airbend, an entering trigger of a permanent gone again, the additional end step each turn, myriad at four, and the lane's ${LANE.length} cards through their scenarios.`);
