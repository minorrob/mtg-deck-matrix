/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN E, WAVE 3 (g2): what the scenarios of sixteen of Rob's v43 library cards cannot reach.
 *
 *   - "WHENEVER THIS CREATURE BLOCKS A CREATURE WITH FLYING" (Skystinger; CR 509.3b): a blocks trigger's `blocked`, a selector
 *     of the attacking creature blocked, read as blockers are declared (cards/index.mjs, rules/trigger.mjs) -- said only with
 *     `each: "attacker"`, and held to the selector grammar.
 *   - "WHEN YOU CAST THIS SPELL WHILE YOU CONTROL A CREATURE" (Social Snub): a spell cast trigger's `while`, a condition asked as
 *     the spell is cast and not again -- no intervening "if" (CR 603.4) -- held to the condition grammar, and on a spell cast
 *     trigger alone (script/schema.mjs).
 *   - "THIS CREATURE CAN'T BE BLOCKED THIS TURN" (Snooping Page's repartee), which a scenario cannot ask: the Wall offered as a
 *     blocker before the spell, and not after it.
 *   - "THE OTHER ON THE BOTTOM OF YOUR LIBRARY" (Sleight of Hand; CR 401.4), where a scenario sees only how many cards are left.
 *   - Each of the sixteen at the table (cloud/game-room.mjs, tableCards).
 */
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {tableCards} from "../cloud/game-room.mjs";
import {play, drive, asked, compiled, index, checks, creature} from "./helpers/x11-keywords.mjs";

const {eq, ok, throws, done} = checks("engine-train-e-g2");
const MINE = ["Roiling Canopy", "Rooftop Percher", "Samut, Hazoret's Champion", "Shredder's Revenge", "Skycoach Waypoint", "Skystinger", "Sleight of Hand",
  "Snarl Song", "Sneering Shadewriter", "Snooping Page", "Social Snub", "Solitary Cell", "Solve for Disappointment", "Spectacle Summit", "Spirit Mascot", "Splatter Technique"];
const FIX = {
  Bird: creature(["Bird"], 2, 2, {manaCost: "{1}{U}", colors: ["U"], keywords: ["Flying"]}),
  Wall: creature(["Wall"], 0, 5, {manaCost: "{1}{W}", colors: ["W"], keywords: ["Defender"]}),
  Grow: {types: ["Instant"], manaCost: "{G}", colors: ["G"], spell: {id: "s", text: "Put a +1/+1 counter on target creature.", targets: [{what: "permanent", types: ["Creature"]}],
    effects: [{effect: "putCounter", targets: {target: 0}, counter: "+1/+1", count: 1}]}},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const pump = [{effect: "pump", targets: "self", power: 5, toughness: 0}];
const blocks = (trigger) => compiled([{kind: "triggered", text: "Whenever this creature blocks a creature with flying, it gets +5/+0.", trigger: {on: "blocks", who: "self", ...trigger}, effects: pump}]).problems;

/* ---- the blocks trigger's `blocked` ---- */
{
  eq(blocks({each: "attacker", blocked: {keywords: ["Flying"]}}), [], "blocks a creature with flying: each attacker blocked, described by `blocked`, compiles");
  ok(blocks({blocked: {keywords: ["Flying"]}}).some((p) => p.includes("a trigger the engine does not watch for yet")),
    "`blocked` without each: \"attacker\" is refused -- it describes a creature blocked, once for each (CR 509.3b)");
  ok(blocks({each: "attacker", blocked: {wings: true}}).some((p) => p.includes("wings")), "`blocked` is held to the selector grammar");
  ok(blocks({each: "attacker", blocked: true}).some((p) => p.includes("the creature blocked is a selector")), "`blocked` is a selector, not a flag");
  /* "Whenever you attack" names the attacking player `attacker` (you, opponent or any): no creature blocked, and not read as one. */
  eq(compiled([{kind: "triggered", text: "Whenever you attack, draw a card.", trigger: {on: "attackers declared", attacker: "you"}, effects: [{effect: "draw", count: 1}]}]).problems, [],
    "an attack trigger's `attacker` is no creature blocked");
  ok(compiled([{kind: "triggered", text: "Whenever this creature attacks, draw a card.", trigger: {on: "attacks", who: "self", blocked: {keywords: ["Flying"]}}, effects: [{effect: "draw", count: 1}]}])
    .problems.some((p) => p.includes("read by a blocks trigger, and by no other")), "`blocked` on another trigger is refused, not ignored");
  const sting = index.definition("Skystinger").abilities.find((a) => a.kind === "triggered");
  eq([sting.trigger.on, sting.trigger.eachBlocked, sting.trigger.blocked], ["GameEventBlockersDeclared", true, {keywords: ["Flying"]}], "Skystinger's trigger, as the engine watches it");
}
{
  /* About the attacker blocked, as rules/trigger.mjs says ("blocked"), and read as blockers are declared. */
  const s = play([at(0, "battlefield", "Skystinger"), at(1, "battlefield", "Bird")], [{to: {turn: 2, phase: "MAIN1"}}, {attack: ["Bird"]}, {block: [["Skystinger", "Bird"]]}], {name: "g2-sting"}, FIX);
  const entry = s.stack.at(-1);
  eq([s.stack.length, s.objects[entry.about?.blocked]?.card, s.objects[entry.about?.card]?.card], [1, "Bird", "Skystinger"], "the trigger is about Skystinger, and the Bird it blocks");
}

/* ---- the spell cast trigger's `while` ---- */
{
  const snub = index.definition("Social Snub").abilities.find((a) => a.kind === "triggered");
  eq([snub.trigger.who, snub.trigger.while, snub.condition], ["self", {present: {what: "permanent", types: ["Creature"], controller: "you"}}, undefined],
    "Social Snub's \"while you control a creature\": the trigger's own condition, and no intervening if carried to the stack");
  const odd = (trigger) => compiled([{kind: "triggered", text: "When this enters while you control a creature, draw a card.", trigger, effects: [{effect: "draw", count: 1}]}]).problems;
  ok(odd({on: "enters", who: "self", while: {present: {what: "permanent", types: ["Creature"], controller: "you"}}}).some((p) => p.includes("read by a spell cast trigger and an attack trigger alone")),
    "`while` on another trigger is refused: only a spell cast trigger and an attack trigger read it");
  ok(odd({on: "spell cast", who: "self", while: {soon: true}}).some((p) => p.includes("soon")), "`while` is held to the condition grammar");
  eq(odd({on: "spell cast", who: "self", while: {present: {what: "permanent", types: ["Creature"], controller: "you"}}}), [], "and a spell cast trigger's `while` compiles");
}

/* ---- Snooping Page: can't be blocked, after a spell that targets a creature ---- */
{
  const setup = [at(0, "battlefield", "Snooping Page", "Forest"), at(0, "hand", "Grow"), at(1, "battlefield", "Wall")];
  const blocked = play(setup, [{attack: ["Snooping Page"]}, {block: [["Wall", "Snooping Page"]]}, {to: {turn: 1, phase: "MAIN2"}}], {name: "g2-page"}, FIX);
  eq([blocked.players[1].life, blocked.players[0].life], [40, 40], "before any spell, Maya's Wall may block it, and Rob draws no card");
  throws(() => play(setup, [{tap: "Forest"}, {cast: "Grow", targets: [{card: "Snooping Page"}]}, {resolve: true}, {resolve: true}, {attack: ["Snooping Page"]},
    {block: [["Wall", "Snooping Page"]]}], {name: "g2-page"}, FIX), /Wall cannot block Snooping Page/, "after Rob's Grow at it, the Wall is not offered as its blocker");
  const s = play(setup, [{tap: "Forest"}, {cast: "Grow", targets: [{card: "Snooping Page"}]}, {resolve: true}, {resolve: true}, {attack: ["Snooping Page"]}], {name: "g2-page"}, FIX);
  drive(s, asked("declare-blockers"));
  eq(awaitingChoice(s).options.map((o) => o.label), [], "Maya is asked who blocks, and nothing may block the Page");
}

/* ---- Sleight of Hand: the other card on the bottom ---- */
{
  const s = play([at(0, "battlefield", "Island"), at(0, "hand", "Sleight of Hand")], [{tap: "Island"}, {cast: "Sleight of Hand"}, {resolve: true}, {choose: ["Ogre"]}],
    {name: "g2-sleight", library: ["Bear", "Ogre"]}, {Ogre: creature(["Ogre"], 3, 3)});
  const library = s.zones.library[0];
  eq([s.objects[library.at(-1)].card, library.length, s.objects[library[0]].card], ["Bear", 19, "Wastes"], "the Bear on the bottom of the library, the filler on top");
}

/* ---- at the table ---- */
eq(MINE.filter((name) => !tableCards(name)), [], "each of the sixteen is a card the table seats");
eq(MINE.filter((name) => !index.resolve(name)?.playable), [], "and each is playable");

done("Skystinger's creature blocked, Social Snub's while, Snooping Page unblocked, Sleight of Hand's bottom card, and the table");
