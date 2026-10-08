/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* LANDWALK (CR 702.14; Yavimaya Dryad, Train B X11).
 *
 * "[type]walk" is the keyword itself (keywords/combat.mjs, landwalkLand): a creature with it can't be blocked while the
 * defending player -- the one it attacks, and in a game of four only that one (CR 802.2a) -- controls a land of the kind
 * (702.14c): a land type, "snow" and a land type, or a supertype or card type with "land". A given one is read as a printed
 * one, through the layers; a blocker's own landwalk changes nothing (702.14d). The card script says the land
 * (`land`, `qualifier`), and the compiler makes the word (cards/index.mjs, landwalkWord). And the Dryad's own trigger: a
 * Forest card searched out onto the battlefield tapped under the target player's control.
 */
import {landwalkLand, landwalkWord, LAND_TYPES, canBlockAttacker} from "../game/engine/keywords/combat.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {controllerOf} from "../game/engine/rules/layers.mjs";
import {play, drive, asked, labels, at, idOf, compiled, missing, keywordBuilt, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-x11-landwalk");
const DRYAD = "Yavimaya Dryad";

/* The words. */
eq(landwalkLand("Forestwalk"), {types: ["Land"], subtypes: ["Forest"]}, "Forestwalk: a land with the subtype Forest");
eq(landwalkLand("Snow swampwalk"), {types: ["Land"], supertypes: ["Snow"], subtypes: ["Swamp"]}, "snow swampwalk: a snow land that is a Swamp");
eq(landwalkLand("Nonbasic landwalk"), {types: ["Land"], nonSupertypes: ["Basic"]}, "nonbasic landwalk: a land without the supertype Basic");
eq(landwalkLand("Legendary landwalk"), {types: ["Land"], supertypes: ["Legendary"]}, "legendary landwalk");
eq(landwalkLand("Artifact landwalk"), {types: ["Land", "Artifact"]}, "artifact landwalk: a land that is also an artifact");
eq(landwalkLand("Power-Plantwalk"), {types: ["Land"], subtypes: ["Power-Plant"]}, "every land type of CR 205.3i, Power-Plant among them");
eq(LAND_TYPES.length, 17, "the seventeen land types of CR 205.3i");
eq([landwalkLand("Landwalk"), landwalkLand("Flying"), landwalkLand("Bogwalk"), landwalkLand("Odd forestwalk")], [null, null, null, null],
  "no landwalk: the bare generic term, another keyword, no land type, an unknown qualifier");
eq([landwalkWord("Forest"), landwalkWord("Swamp", "snow"), landwalkWord("land", "nonbasic")], ["Forestwalk", "Snow swampwalk", "Nonbasic landwalk"],
  "the word a script's land and qualifier make");
eq([landwalkWord("land"), landwalkWord("Bog"), landwalkWord("Forest", "odd"), landwalkWord("forest")], [null, null, null, null],
  "and none for \"land\" alone, an unknown type or qualifier, or a type not spelled as CR 205.3i spells it");

/* The compiler. */
const good = compiled([{kind: "keyword", text: "Islandwalk", keyword: "landwalk", land: "Island"}]);
eq(good.definition?.keywords, ["Islandwalk"], "a script's landwalk is its word on the object");
const bad = compiled([{kind: "keyword", text: "Landwalk", keyword: "landwalk"}]);
ok(bad.problems.some((p) => p.includes("landwalk says which land")), "a landwalk that names no land is refused");

/* Four players: the Dryad attacks Maya, and only Maya's lands count. */
const blockers = (s) => drive(s, asked("declare-blockers")) && labels(s);
{
  const s = play([at(0, "battlefield", DRYAD), at(1, "battlefield", "Bear", "Forest"), at(2, "battlefield", "Bear")], [{attack: [DRYAD], at: "Maya"}], {seats: 4});
  eq(blockers(s), [], "Maya controls a Forest: her Bear can't block the Dryad");
}
{
  const s = play([at(0, "battlefield", DRYAD), at(1, "battlefield", "Bear", "Plains", "Swamp"), at(2, "battlefield", "Forest"), at(3, "battlefield", "Forest")], [{attack: [DRYAD], at: "Maya"}], {seats: 4});
  eq(blockers(s), [`Bear blocks ${DRYAD}`], "Trey and Sam control Forests and Maya, the defending player, only a Plains and a Swamp: she may block (CR 802.2a)");
}
{
  /* A Forest card that is not a basic Forest -- a dual land with the type -- is a Forest (CR 205.3i). */
  const s = play([at(0, "battlefield", DRYAD), at(1, "battlefield", "Bear", "Bog Grove")], [{attack: [DRYAD]}]);
  eq(blockers(s), [], "a nonbasic land with the subtype Forest stops the block too");
}
{
  /* Given until end of turn ("gains swampwalk"), through the layers; snow swampwalk asks for a snow Swamp. */
  const s = play([at(0, "battlefield", "Bear"), at(1, "battlefield", "Spider", "Swamp")]);
  const bear = idOf(s, "Bear");
  runEffect(s, {effect: "pump", targets: [bear], power: 0, toughness: 0, keywords: ["Snow swampwalk"]}, {controller: 0, source: null});
  Object.assign(s, {combat: {attacks: [{attacker: bear, defender: 1, blocked: false, blockers: []}]}});
  const spider = idOf(s, "Spider");
  ok(canBlockAttacker(s, spider, bear), "snow swampwalk, and Maya's Swamp is not snow: the Spider may block");
  runEffect(s, {effect: "pump", targets: [bear], power: 0, toughness: 0, keywords: ["Swampwalk"]}, {controller: 0, source: null});
  ok(!canBlockAttacker(s, spider, bear), "swampwalk given as well: any Swamp of hers stops it");
}
{
  const s = play([at(0, "battlefield", "Bear"), at(1, "battlefield", "Spider", "Snow Swamp")]);
  const bear = idOf(s, "Bear"), spider = idOf(s, "Spider");
  runEffect(s, {effect: "pump", targets: [bear], power: 0, toughness: 0, keywords: ["Snow swampwalk"]}, {controller: 0, source: null});
  Object.assign(s, {combat: {attacks: [{attacker: bear, defender: 1, blocked: false, blockers: []}]}});
  ok(!canBlockAttacker(s, spider, bear), "a snow Swamp: snow swampwalk stops the block");
}
{
  /* Nonbasic landwalk: basics alone do not stop it, a nonbasic land does. And a blocker's own landwalk cancels nothing. */
  const s = play([at(0, "battlefield", "Bear", "Forest"), at(1, "battlefield", "Spider", "Forest")]);
  const bear = idOf(s, "Bear"), spider = idOf(s, "Spider");
  runEffect(s, {effect: "pump", targets: [bear], power: 0, toughness: 0, keywords: ["Nonbasic landwalk"]}, {controller: 0, source: null});
  runEffect(s, {effect: "pump", targets: [spider], power: 0, toughness: 0, keywords: ["Forestwalk"]}, {controller: 1, source: null});
  Object.assign(s, {combat: {attacks: [{attacker: bear, defender: 1, blocked: false, blockers: []}]}});
  ok(canBlockAttacker(s, spider, bear), "nonbasic landwalk against basic lands only: the Spider, forestwalk and all, may block");
}

/* The Dryad's trigger: the Forest is Rob's card, tapped, under Maya's control. */
{
  const s = play([at(0, "battlefield", "Forest", "Forest", "Wastes"), at(0, "hand", DRYAD)],
    [{tap: "Forest"}, {tap: "Forest"}, {tap: "Wastes"}, {cast: DRYAD}, {resolve: true}, {choose: ["Maya"]}, {resolve: true}, {choose: ["Yes"]}, {choose: ["Forest"]}],
    {library: ["Forest"]});
  const found = s.zones.battlefield.find((id) => s.objects[id].card === "Forest" && controllerOf(s, id) === 1);
  ok(found !== undefined && s.objects[found].owner === 0 && s.objects[found].tapped === true, "the Forest Rob found: his card, tapped, under Maya's control");
}

/* The credit. */
ok(keywordBuilt("Landwalk"), "Landwalk is built (keywords/combat.mjs, the evasion family)");
eq(missing(DRYAD), [], `${DRYAD} needs nothing the engine lacks`);
ok(index.resolve(DRYAD)?.playable === true, `${DRYAD} is defined and playable`);

done("landwalk's words and the defending player's lands, given or printed, at a table of four; the Dryad's Forest for another player.");
