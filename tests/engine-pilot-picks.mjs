/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE AI SEATS TAKE WHAT AN "UP TO" OR A SEARCH IS FOR (`picks`; Linear ROB-164, 2026-10-19).
 *
 * The Play readiness evaluation of 2026-10-19 (one person against three AIs) found that an AI seat chose nothing whenever it
 * could: the house pilot answered every choice it had no rule for with its first `min` options, and a search for a card
 * with a quality (CR 701.23b), "up to two basic land cards" and proliferate's "any number" all have a least answer of
 * none. So an AI cracked Evolving Wilds and Cultivated for nothing, and Kiora proliferated nothing. L1 (Normal, Easy, the
 * LLM seat) answers these with the same floor.
 *
 * This suite holds, on the engine's own questions about real cards, what the pilot now takes (game/engine/pilots/
 * house-pilot.mjs, `picks`), and that a match launched before it still gets the old answers -- the room tapes no AI
 * answer, so a pilot that answered an old match differently would replay it differently (game/room/room.mjs,
 * `pilotPicks`):
 *   1. a search: the land of the color it lacks (Evolving Wilds), two lands of two colors, the first onto the battlefield
 *      (Cultivate), a nonbasic land by the mana it makes, the costliest creature it could cast soon (Fauna Shaman), a land
 *      when it has none to play (Diabolic Tutor), the land from its hand (Chulane) -- and not Brainstorm's put-back;
 *   2. proliferate: its own counters that help it and another's that hurt them, never an opponent's +1/+1 or loyalty;
 *   3. any other choice of any number: its own permanents (Peregrine Drake's untap), an opponent's when it is hostile, the
 *      costliest first, kept to `exclusiveBy` and `capped` -- and never a card that is on no side (surveil);
 *   4. the plumbing: L0, L1 and the LLM seat all take it; the room hands the pod's key to each pilot, keeps it on reopening
 *      and in the pod a replay reads; whole games of the six staging decks replay, with it and without it;
 *   5. fuzz-live's lands by turn, read off a journal.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {housePilot, manaColors} from "../game/engine/pilots/house-pilot.mjs";
import {scoredPilot} from "../game/engine/pilots/scored-pilot.mjs";
import {agentPilot} from "../game/engine/pilots/agent-pilot.mjs";
import {startRoom, openRoom, seatPilot, factsFrom, basicCards} from "../game/room/room.mjs";
import {playGame, verdict, decksFromBackup, landsByTurn} from "../tools/fuzz-live.mjs";
import {tableCards} from "../cloud/game-room.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
/* The supporting cast: spells by their colors, creatures by their costs, a planeswalker, and the filler every library is. */
const spell = (cost, colors, types = ["Sorcery"]) => ({types, subtypes: [], manaCost: cost, colors});
const creature = (cost, colors, p, extra = {}) => ({types: ["Creature"], subtypes: ["Bear"], manaCost: cost, colors, power: p, toughness: p, ...extra});
const FIX = {
  "Chaff": spell("{9}{9}", [], ["Enchantment"]),
  "Tidewater Thought": spell("{1}{U}", ["U"], ["Instant"]), "Dawn Pledge": spell("{1}{W}", ["W"]), "Ember Rite": spell("{R}", ["R"]),
  "Elm Rite": spell("{G}", ["G"]), "Elm Song": spell("{1}{G}", ["G"]),
  "Tide General": creature("{2}{U}", ["U"], 3, {supertypes: ["Legendary"]}), "Ember General": creature("{2}{R}", ["R"], 3, {supertypes: ["Legendary"]}),
  "Small Bear": creature("{1}{G}", ["G"], 2), "Big Bear": creature("{3}{G}", ["G"], 4), "Huge Bear": creature("{6}{G}", ["G"], 7),
  "Elm Sprite": creature("{G}", ["G"], 1), "Withered Elm": creature("{2}{G}", ["G"], 3), "Stunned Elm": creature("{2}{G}", ["G"], 3),
  "Tide Sage": {types: ["Planeswalker"], subtypes: ["Sage"], manaCost: "{3}{U}", colors: ["U"], loyalty: 3},
};
/* A table hands its AI seats these facts (room.mjs, factsFrom): the same reader, over the same definitions. */
const look = (name) => (FIX[name] ? structuredClone(FIX[name]) : index.definition(name) ?? basicCards(name));
const facts = factsFrom(look);
const table = (setup) => runScenario({name: "pilot-picks", library: Array(20).fill("Chaff"), setup, steps: []}, index.definition, FIX).state;
const idOf = (s, name, seat = 0) => [s.zones.battlefield, s.zones.command[seat], s.zones.hand[seat], s.zones.library[seat]].flat()
  .find((id) => s.objects[id]?.card === name && s.objects[id].owner === seat);
const effectsOf = (name, kind = "activated") => {
  const def = index.definition(name);
  return kind === "spell" ? (Array.isArray(def.spell) ? def.spell : def.spell.effects) : def.abilities.find((a) => a.kind === kind).effects;
};
const ask = (s, effects, source = null) => { beginResolution(s, structuredClone(effects), {controller: 0, source}); return awaitingChoice(s); };
const OLD = housePilot({seat: 0, cards: facts});
const PILOTS = [["L0", housePilot({seat: 0, cards: facts, picks: true})], ["L1 at Normal", scoredPilot({seat: 0, cards: facts, picks: true})],
  ["L1 at Easy", scoredPilot({seat: 0, cards: facts, setting: "easy", seed: "picks", picks: true})], ["the LLM seat's L1", agentPilot({seat: 0, cards: facts, picks: true})]];
const answer = (pilot, s, choice) => pilot.answer(projectFor(s, 0), choice).indices;
const named = (choice, indices) => indices.map((i) => choice.options[i].label);
/* Every pilot's answer the same, inside the choice's bounds, no option twice; and the old pilot's, for the record. */
function picked(s, choice, what) {
  const answers = PILOTS.map(([who, p]) => [who, named(choice, answer(p, s, choice))]);
  for (const [who, labels] of answers.slice(1)) eq(labels, answers[0][1], `${what}: ${who} answers as L0`);
  const indices = answer(PILOTS[0][1], s, choice);
  ok(indices.length >= (choice.min ?? 0) && indices.length <= (choice.max ?? 0) && new Set(indices).size === indices.length, `${what}: within the choice's bounds`);
  return {labels: answers[0][1], indices, old: named(choice, answer(OLD, s, choice))};
}
const rng = createRng("pilot-picks");

/* ---- 1. Searches ---- */
{
  /* Evolving Wilds, with two Forests in play and a blue spell in hand: the Island. Before, nothing -- and the Wilds gone. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Forest", "Forest", "Evolving Wilds"]}, {seat: 0, zone: "hand", cards: ["Tidewater Thought"]},
    {seat: 0, zone: "library", cards: ["Forest", "Plains", "Island", "Swamp"]}]);
  const choice = ask(s, effectsOf("Evolving Wilds"), idOf(s, "Evolving Wilds"));
  eq([choice.title, choice.min, choice.max], ["Search your library", 0, 1], "Evolving Wilds asks a search it may fail (CR 701.23b): none to one");
  const {labels, indices, old} = picked(s, choice, "Evolving Wilds");
  eq(old, [], "before: the house pilot found nothing");
  eq(labels, ["Island"], "now: the Island, the color its hand needs and its Forests do not make");
  resolveAwaiting(s, indices, null, rng);
  const island = idOf(s, "Island");
  eq([s.objects[island].zone, s.objects[island].tapped], ["battlefield", true], "and it is on the battlefield, tapped, as the card says");
}
{
  /* It already makes green: a hand of two green spells and one blue still wants the Island, the color it lacks. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Forest"]}, {seat: 0, zone: "hand", cards: ["Elm Rite", "Elm Song", "Tidewater Thought"]},
    {seat: 0, zone: "library", cards: ["Forest", "Island"]}]);
  eq(picked(s, ask(s, effectsOf("Evolving Wilds")), "a color it has, a color it lacks").labels, ["Island"],
    "the Island over the Forest offered first: a color it lacks counts four times one it has");
}
{
  /* Nothing in its hand asks a color: any land, the first offered -- not none. */
  const s = table([{seat: 0, zone: "library", cards: ["Swamp", "Plains"]}]);
  eq(picked(s, ask(s, effectsOf("Evolving Wilds")), "no colors needed").labels, ["Swamp"], "with no color to want, the first land, rather than none");
}
{
  /* Its commander counts twice: a blue commander and a white spell in hand want the Island over the Plains offered first. */
  const s = table([{seat: 0, zone: "command", cards: ["Tide General"]}, {seat: 0, zone: "hand", cards: ["Dawn Pledge"]}, {seat: 0, zone: "library", cards: ["Plains", "Island"]}]);
  eq(picked(s, ask(s, effectsOf("Evolving Wilds")), "its commander's color").labels, ["Island"], "the Island, for its commander, over the Plains for one spell");
}
{
  /* Cultivate: two lands of two colors, the most needed onto the battlefield, the other to its hand. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Forest", "Forest", "Forest"]}, {seat: 0, zone: "command", cards: ["Tide General"]},
    {seat: 0, zone: "hand", cards: ["Dawn Pledge"]}, {seat: 0, zone: "library", cards: ["Forest", "Island", "Island", "Plains"]}]);
  const choice = ask(s, effectsOf("Cultivate", "spell"));
  eq([choice.min, choice.max], [0, 2], "Cultivate's \"up to two\": none to two");
  const {labels, indices, old} = picked(s, choice, "Cultivate");
  eq(old, [], "before: nothing, for three mana");
  eq(labels, ["Island", "Plains"], "now: the Island its commander needs, then the Plains its hand needs -- not a second Island once one is taken");
  resolveAwaiting(s, indices, null, rng);
  const island = s.zones.battlefield.find((id) => s.objects[id].card === "Island");
  eq([island !== undefined && s.objects[island].tapped, s.zones.hand[0].map((id) => s.objects[id].card).includes("Plains")], [true, true],
    "the first onto the battlefield tapped, the second into its hand");
}
{
  /* "A land card" (Weathered Wayfarer): a nonbasic land by the mana it makes, read off the card -- Clifftop Retreat's red and
     white over a Plains. */
  const s = table([{seat: 0, zone: "command", cards: ["Ember General"]}, {seat: 0, zone: "hand", cards: ["Dawn Pledge"]},
    {seat: 0, zone: "library", cards: ["Plains", "Clifftop Retreat"]}]);
  eq(picked(s, ask(s, effectsOf("Weathered Wayfarer")), "a land card").labels, ["Clifftop Retreat"], "Clifftop Retreat, which makes both colors it needs");
  eq([manaColors(look("Clifftop Retreat")), manaColors(look("Command Tower")), manaColors(look("Forest")), manaColors(look("Sol Ring"))],
    [["W", "R"], ["W", "U", "B", "R", "G"], ["G"], ["C"]], "the mana a card makes: a list of ways, any color, a basic land's, colorless");
  eq([facts("Clifftop Retreat").makes, facts("Dawn Pledge").colors], [["W", "R"], ["W"]], "and the facts a table hands its pilots carry both");
}
{
  /* Fauna Shaman: the costliest creature it could cast by its next turn -- three lands and the one it would play. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Forest", "Forest", "Forest"]}, {seat: 0, zone: "hand", cards: ["Forest"]},
    {seat: 0, zone: "library", cards: ["Small Bear", "Huge Bear", "Big Bear"]}]);
  const {labels, old} = picked(s, ask(s, effectsOf("Fauna Shaman")), "Fauna Shaman");
  eq([old, labels], [[], ["Big Bear"]], "before nothing; now the four-drop, not the seven it cannot cast nor the two");
  /* A mana rock is a source too: two Forests and Arcane Signet, and the land it would play, cast the four-drop. */
  const rock = table([{seat: 0, zone: "battlefield", cards: ["Forest", "Forest", "Arcane Signet"]}, {seat: 0, zone: "hand", cards: ["Forest"]},
    {seat: 0, zone: "library", cards: ["Small Bear", "Huge Bear", "Big Bear"]}]);
  eq(picked(rock, ask(rock, effectsOf("Fauna Shaman")), "Fauna Shaman, with a rock").labels, ["Big Bear"], "Arcane Signet counted: the four-drop");
  /* Nothing it could cast soon: the cheapest, which it reaches first. */
  const none = table([{seat: 0, zone: "hand", cards: ["Forest"]}, {seat: 0, zone: "library", cards: ["Huge Bear", "Big Bear"]}]);
  eq(picked(none, ask(none, effectsOf("Fauna Shaman")), "Fauna Shaman, nothing castable").labels, ["Big Bear"], "with one land coming, the Big Bear before the Huge one");
}
{
  /* Diabolic Tutor, "a card": it must find one, and found the first offered. A land of the color it needs when its hand has
     none and it has fewer than four in play; else the costliest card it could cast by its next turn. */
  const tutor = (lands, hand) => {
    const s = table([{seat: 0, zone: "battlefield", cards: Array(lands).fill("Swamp")}, {seat: 0, zone: "hand", cards: hand},
      {seat: 0, zone: "library", cards: ["Big Bear", "Small Bear", "Plains", "Island"]}]);
    const choice = ask(s, effectsOf("Diabolic Tutor", "spell"));
    return {choice, ...picked(s, choice, `Diabolic Tutor, ${lands} lands in play`)};
  };
  const short = tutor(2, ["Tidewater Thought"]);
  eq([short.choice.min, short.old, short.labels], [1, [short.choice.options[0].label], ["Island"]], "two lands and none in hand: before, the first card offered; now the Island it lacks");
  eq(tutor(2, ["Tidewater Thought", "Swamp"]).labels, ["Small Bear"], "two lands and one in hand: the Small Bear, all it could cast next turn");
  eq(tutor(4, ["Tidewater Thought"]).labels, ["Big Bear"], "four lands and none in hand: the Big Bear");
}
{
  /* Chulane's "you may put a land card from your hand onto the battlefield": the Island its commander needs. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Forest"]}, {seat: 0, zone: "command", cards: ["Tide General"]},
    {seat: 0, zone: "hand", cards: ["Forest", "Island", "Plains"]}]);
  const choice = ask(s, effectsOf("Chulane, Teller of Tales", "triggered").filter((e) => e.effect === "chooseCard"));
  const {labels, old} = picked(s, choice, "Chulane's land");
  eq([choice.title, old, labels], ["Search your hand", [], ["Island"]], "before none; now the Island");
}
{
  /* Brainstorm's two back on top: it must put two, and that is not a card it wants -- answered as before. */
  const s = table([{seat: 0, zone: "hand", cards: ["Big Bear", "Tidewater Thought", "Forest"]}]);
  const choice = ask(s, effectsOf("Brainstorm", "spell").filter((e) => e.effect === "chooseCard"));
  const {labels, old} = picked(s, choice, "Brainstorm's put-back");
  eq([choice.title, choice.min, labels], ["Search your hand", 2, old], "Brainstorm's put-back: the old answer, not its best cards on top");
}

/* ---- 2. Proliferate ---- */
{
  const s = table([{seat: 0, zone: "battlefield", cards: ["Elm Sprite", "Tide Sage", "Withered Elm", "Stunned Elm"]},
    {seat: 1, zone: "battlefield", cards: ["Elm Sprite", "Tide Sage", "Withered Elm", "Stunned Elm", "Small Bear"]}]);
  const at = (name, seat) => idOf(s, name, seat);
  s.objects[at("Elm Sprite", 0)].counters["+1/+1"] = 2;     // its own +1/+1: more
  s.objects[at("Withered Elm", 0)].counters["-1/-1"] = 1;   // its own -1/-1: no
  s.objects[at("Stunned Elm", 0)].counters = {"+1/+1": 1, stun: 1}; // its own, one of each: no
  s.objects[at("Elm Sprite", 1)].counters["+1/+1"] = 2;     // theirs +1/+1: never
  s.objects[at("Withered Elm", 1)].counters["-1/-1"] = 1;   // theirs -1/-1: more
  s.objects[at("Stunned Elm", 1)].counters = {stun: 1};      // theirs, stunned: more
  s.objects[at("Small Bear", 1)].counters = {"+1/+1": 1, stun: 1}; // theirs, one of each: no
  s.players[0].poison = 2; s.players[1].poison = 3;
  const choice = ask(s, [{effect: "proliferate"}]);
  const {indices, old} = picked(s, choice, "proliferate");
  const who = (i) => (choice.options[i].playerId !== undefined ? `player ${choice.options[i].playerId}` : `${s.objects[choice.options[i].cardId].card} (${s.objects[choice.options[i].cardId].controller})`);
  eq(old, [], "before: nothing proliferated");
  eq(indices.map(who).sort(), ["Elm Sprite (0)", "Stunned Elm (1)", "Tide Sage (0)", "Withered Elm (1)", "player 1"].sort(),
    "now: its +1/+1 creature and its planeswalker; their -1/-1 creature, their stunned one and their poison -- not their +1/+1 nor loyalty, not its own -1/-1 nor poison, nothing mixed");
  resolveAwaiting(s, indices, null, rng);
  eq([s.objects[at("Elm Sprite", 0)].counters["+1/+1"], s.objects[at("Tide Sage", 0)].counters.loyalty, s.objects[at("Withered Elm", 1)].counters["-1/-1"], s.players[1].poison,
    s.objects[at("Elm Sprite", 1)].counters["+1/+1"], s.objects[at("Tide Sage", 1)].counters.loyalty, s.objects[at("Withered Elm", 0)].counters["-1/-1"], s.players[0].poison],
  [3, 4, 2, 4, 2, 3, 1, 2], "and it is so: one more on each chosen, none on the rest");
}

/* ---- 3. Any other choice of any number ---- */
{
  /* Peregrine Drake: "untap up to five lands" -- its own, not an opponent's. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Forest", "Island", "Island"]}, {seat: 1, zone: "battlefield", cards: ["Plains", "Plains"]}]);
  for (const id of s.zones.battlefield) s.objects[id].tapped = true;
  const choice = ask(s, effectsOf("Peregrine Drake", "triggered"));
  const {indices, old} = picked(s, choice, "Peregrine Drake");
  eq([choice.min, choice.max, old], [0, 5, []], "five lands it may untap, and before it untapped none");
  eq(indices.map((i) => s.objects[choice.options[i].cardId].controller), [0, 0, 0], "now its three, and neither of Maya's");
  resolveAwaiting(s, indices, null, rng);
  eq(s.zones.battlefield.map((id) => [s.objects[id].controller, s.objects[id].tapped]).sort(), [[0, false], [0, false], [0, false], [1, true], [1, true]],
    "its lands untapped, hers still tapped");
}
{
  /* The top of its library being surveilled is on no side: still none put into its graveyard, as before. */
  const s = table([]);
  const choice = ask(s, [{effect: "surveil", count: 2}]);
  const {labels, old} = picked(s, choice, "surveil");
  eq([choice.min, labels, old], [0, [], []], "surveil 2: nothing milled, as before -- a card in a library is on no side");
}
{
  /* The record's constraints and sides, on a choice no rule names: own permanents, the costliest first, one of each `group`
     (`exclusiveBy`), no more of a pile than `capped` allows; a hostile one, an opponent's. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Small Bear", "Huge Bear", "Big Bear"]}, {seat: 1, zone: "battlefield", cards: ["Big Bear", "Small Bear"]}]);
  const option = (index, name, seat, extra = {}) => ({index, label: name, cardId: idOf(s, name, seat), ...extra});
  const view = projectFor(s, 0);
  const options = [option(0, "Small Bear", 0, {group: "a", pile: "x"}), option(1, "Huge Bear", 0, {group: "a", pile: "x"}), option(2, "Big Bear", 0, {group: "b", pile: "x"}),
    option(3, "Big Bear", 1, {group: "c", pile: "y"}), option(4, "Small Bear", 1, {group: "d", pile: "y"})];
  const sides = (extra) => PILOTS[0][1].answer(view, {id: "custom:1", title: "Choose any number", mode: "many", min: 0, max: 5, options, ...extra}).indices.map((i) => `${options[i].label} (${s.objects[options[i].cardId].controller})`);
  eq(sides({}), ["Huge Bear (0)", "Big Bear (0)", "Small Bear (0)"], "its own permanents, the costliest first, none of Maya's");
  eq(sides({exclusiveBy: "group"}), ["Huge Bear (0)", "Big Bear (0)"], "one of each group: the Huge Bear for group a, then the Big Bear");
  eq(sides({capped: {by: "pile", most: {x: 2}}}), ["Huge Bear (0)", "Big Bear (0)"], "no more of pile x than two");
  eq(sides({hostile: true}), ["Big Bear (1)", "Small Bear (1)"], "a hostile choice: Maya's, the costliest first");
  eq(sides({max: 1}), ["Huge Bear (0)"], "and no more than it may");
  eq(OLD.answer(view, {id: "custom:1", title: "Choose any number", mode: "many", min: 0, max: 5, options}).indices, [], "the old pilot: none");
}

/* ---- 4. The plumbing ---- */
{
  /* Every AI seat's pilot takes it with the match's key, and none without. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Forest"]}, {seat: 0, zone: "hand", cards: ["Tidewater Thought"]}, {seat: 0, zone: "library", cards: ["Forest", "Island"]}]);
  const choice = ask(s, effectsOf("Evolving Wilds"));
  for (const level of [null, "normal", "easy", "llm"]) {
    const answers = [false, true].map((picks) => named(choice, seatPilot({seat: 0, cards: facts, level, seed: "s", picks}).answer(projectFor(s, 0), choice).indices));
    eq(answers, [[], ["Island"]], `seatPilot at ${level ?? "L0"}: none without the key, the Island with it`);
  }
}
{
  /* The room hands the pod's key to each AI seat's pilot, keeps it on reopening, and in the pod a replay reads. */
  const deck = (n) => Array.from({length: 40}, () => n);
  const pod = (extra) => ({...extra, seats: [{seatId: "rob", name: "Rob", pilot: "human", commander: [], cards: deck("Forest")},
    {seatId: "ai", name: "AI", pilot: "house", level: "normal", commander: [], cards: deck("Island")}]});
  for (const picks of [true, false]) {
    const given = [], spy = (args) => {given.push(args.picks); return seatPilot(args);};
    const storage = memoryStorage();
    await startRoom({storage, matchId: "m", seed: "picks-seed", pilot: spy, pod: pod(picks ? {pilotPicks: true} : {})});
    await openRoom({storage, matchId: "m", pilot: spy});
    eq(given, [picks, picks], `${picks ? "a pod with pilotPicks" : "a pod without it, as every match before"}: its AI seat's pilot is made with picks ${picks}, and again when the room is reopened`);
    eq((await createMatchStore(storage, "m").loadMatch()).pod.pilotPicks, picks ? true : undefined, `and the match's pod ${picks ? "keeps the key" : "has no key"}, for its replay`);
  }
}
{
  /* Whole games of Rob's staging decks at the table's setting, AI seats only: each finishes clean and replays from its seed
     and tape -- with the key, and without it (a match launched before). */
  const decks = decksFromBackup(JSON.parse(readFileSync(new URL("./fixtures/shared-staging-decks.json", import.meta.url), "utf8")), ["D3 Kiora", "D2 Chulane", "D4 Felothar", "D1 Tymna + Kraum"]);
  for (const picks of [true, false]) {
    const storage = memoryStorage();
    const game = await playGame({decks, seed: 4, cards: tableCards, levels: ["normal", "normal", "normal", "normal"], replay: true, picks, storage});
    eq([verdict(game).problems, game.replay.same], [[], true], `four AI seats on the staging decks${picks ? "" : ", without the key"}: the game finishes clean and replays identically`);
    eq((await createMatchStore(storage, "fuzz-4").loadMatch()).pod.pilotPicks, picks ? true : undefined, `the harness launches it ${picks ? "as a table now does" : "as a table did before"}`);
  }
}

/* ---- 5. Lands by turn (tools/fuzz-live.mjs `landsByTurn`) ---- */
{
  const storage = memoryStorage();
  let n = 0;
  const put = (kind, fields) => storage.put(`match/j/journal/${String(n += 1).padStart(12, "0")}`, JSON.stringify({kind, data: {fields}}));
  const turn = (seat) => put("GameEventTurnPhase", {phase: "UNTAP", playerTurn: {playerId: seat}});
  const move = (name, controller, from, to) => put("GameEventCardChangeZone", {card: {name, controller}, from: {zoneType: from}, to: {zoneType: to}});
  await turn(0); await move("Forest", 0, "Hand", "Battlefield"); await move("Elm Sprite", 0, "Hand", "Battlefield");
  await turn(1); await move("Island", 1, "Hand", "Battlefield");
  await turn(0); await move("Evolving Wilds", 0, "Hand", "Battlefield"); await move("Evolving Wilds", 0, "Battlefield", "Graveyard"); await move("Forest", 0, "Library", "Battlefield"); await move("Plains", 0, "Library", "Hand");
  await turn(1);
  eq(await landsByTurn(storage, "j", (name) => look(name)), {0: [1, 2], 1: [1, 1]},
    "each seat's lands at the end of each of its turns: a land in counts, one out does not, a creature and a card to its hand are not lands in play");
}

console.log(`engine-pilot-picks: ${checks} checks passed`);
