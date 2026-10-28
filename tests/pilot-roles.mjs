/* WHAT A CARD DOES TO A GAME, AND HOW DANGEROUS A COMMANDER IS (docs/ai-players/PLAN-2026-10-26.html §4 and §4b;
 * tools/build-pilot-roles.mjs, game/engine/pilots/roles.mjs, roles-data.mjs).
 *
 * Rob, 2026-10-26: urgency is "if the card is a defined cornerstone of infinite loops, the opponent's deck's core engine, a
 * known salty card, a card that has bleed/poison or other draining effects, a card that doubles things, etc."; Hard "will
 * pay more attention to the commander that the players are playing and recognize commanders that are larger threats
 * earlier on". The pilots cannot read the 16 MB corpus, so a generator keeps a few kilobytes of it.
 *
 *   1. The module is what its sources say (the generator's --check), small enough for a Worker, and holds the engine's cards only.
 *   2. Famous cards read as what they are: doublers, untappers and loop pieces, token and draw engines, bleed, salty,
 *      and the answers, wipes and ramp a pilot weighs a spell in hand by.
 *   3. A commander's class: the loops highest, the engines in the middle, the unclassified none.
 *   4. The accessors fold a name as the engine does, and an unknown card has no flags.
 *   5. The room hands every pilot a card's flags and a commander's class with its other public facts.
 *
 *   node tests/pilot-roles.mjs
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {build, moduleText, fold as toolFold} from "../tools/build-pilot-roles.mjs";
import {CARD_FLAGS, COMMANDER_CLASS} from "../game/engine/pilots/roles-data.mjs";
import {flagsOf, commanderClassOf, fold, has, isLink, LINKS} from "../game/engine/pilots/roles.mjs";
import {DEFINITIONS} from "../game/engine/cards/definitions.mjs";
import {factsFrom} from "../game/room/room.mjs";
import {tableCards} from "../cloud/game-room.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const ROOT = new URL("../", import.meta.url);

/* ---- 1. The module ---- */
{
  const text = readFileSync(new URL("game/engine/pilots/roles-data.mjs", ROOT), "utf8");
  eq(text, moduleText(build()), "roles-data.mjs is what its sources say (node tools/build-pilot-roles.mjs writes it)");
  ok(text.length < 200 * 1024, `and is small enough for a Worker (${(text.length / 1024).toFixed(0)} KB of 200)`);
  ok(Object.keys(CARD_FLAGS).every((k) => DEFINITIONS[k]), "it holds engine cards only: every name is a playable definition");
  ok(Object.values(CARD_FLAGS).every((v) => /^[DWTURCLXBGSAKP]+$/.test(v)) && !Object.values(CARD_FLAGS).includes(""), "every card has at least one flag, from the legend");
  ok(Object.values(CARD_FLAGS).every((v) => v === [...v].sort((a, b) => "DWTURCLXBGSAKP".indexOf(a) - "DWTURCLXBGSAKP".indexOf(b)).join("")), "in the legend's order");
  ok(Object.keys(CARD_FLAGS).length > 800 && Object.keys(COMMANDER_CLASS).length > 1000, `a table worth reading: ${Object.keys(CARD_FLAGS).length} cards, ${Object.keys(COMMANDER_CLASS).length} commanders`);
  ok(Object.values(COMMANDER_CLASS).every((v) => v >= 0.35 && v <= 1), "a commander's class is kept from 0.35 to 1");
  const salty = JSON.parse(readFileSync(new URL("data/ai-players/salty-cards.json", ROOT), "utf8"));
  eq(salty.schema, "crank-salty-cards@1", "the salty list names its schema");
  ok(salty.cards.filter((n) => DEFINITIONS[toolFold(n)]).every((n) => CARD_FLAGS[toolFold(n)].includes("S")), "every salty card the engine can play is flagged salty");
  ok(Object.entries(CARD_FLAGS).filter(([, v]) => v.includes("G")).every(([, v]) => v.includes("S")) && Object.entries(CARD_FLAGS).filter(([, v]) => v.includes("X")).every(([, v]) => v.includes("S")),
    "and so is every game changer and every extra turn");
}

/* ---- 2. Famous cards ---- */
{
  const flags = (n) => CARD_FLAGS[n] ?? "";
  ok(flags("doubling season").includes("D") && flags("panharmonicon").includes("D"), "Doubling Season and Panharmonicon double things");
  ok(flags("intruder alarm").includes("U") && flags("intruder alarm").includes("L"), "Intruder Alarm untaps, and is a loop piece");
  ok(flags("krenko mob boss").includes("T"), "Krenko, Mob Boss makes tokens, again and again");
  ok(flags("blood artist").includes("B") && flags("zulaport cutthroat").includes("B") && flags("impact tremors").includes("B"), "Blood Artist, Zulaport Cutthroat and Impact Tremors bleed the table");
  ok(flags("smothering tithe").includes("W") && flags("smothering tithe").includes("G") && flags("smothering tithe").includes("S"), "Smothering Tithe is a draw and token engine, a game changer, and salty");
  ok(flags("armageddon").includes("S") && !isLink(flags("armageddon")), "Armageddon is salty and is no engine link");
  eq([flags("sol ring"), flags("forest")], ["P", ""], "Sol Ring is ramp and a Forest has no role worth a flag");
  ok(flags("swords to plowshares") === "A" && flags("path to exile") === "A", "Swords to Plowshares and Path to Exile are answers");
  ok(flags("wrath of god").includes("K") && flags("damnation").includes("K"), "Wrath of God and Damnation are wipes");
  ok(flags("rampant growth") === "P" && flags("cultivate") === "P", "Rampant Growth and Cultivate are ramp");
  ok([...LINKS].every((l) => Object.values(CARD_FLAGS).some((v) => v.includes(l))), "every engine link kind is found somewhere in the table");
}

/* ---- 3. A commander's class ---- */
{
  ok(commanderClassOf("Chulane, Teller of Tales") >= 0.9, "Chulane, a classified untap loop, reads as the highest class");
  ok(commanderClassOf("Atraxa, Praetors' Voice") >= 0.5 && commanderClassOf("Atraxa, Praetors' Voice") < 1, "Atraxa, a counters engine, in the middle");
  eq(commanderClassOf("Not A Commander"), 0, "a name that is not a commander reads 0");
  ok(Object.values(COMMANDER_CLASS).filter((v) => v >= 0.9).length > 50, "the loops and extra turns are a small high tier");
}

/* ---- 4. The accessors ---- */
{
  eq([fold("Atraxa, Praetors’ Voice"), fold("Éowyn, Shieldmaiden"), fold("Aang, Swift Savior // Aang and La")], ["atraxa praetors voice", "eowyn shieldmaiden", "aang swift savior // aang and la"], "a name is folded as the engine folds it");
  eq([flagsOf("DOUBLING SEASON"), flagsOf("nothing at all")], [CARD_FLAGS["doubling season"], ""], "case makes no other card, and an unknown card has no flags");
  ok(has("DL", "UL") && !has("", "D") && !has(undefined, "D") && isLink("D") && !isLink("BS") && isLink("BT"), "has and isLink read a flag string, and an empty or missing one reads nothing");
}

/* ---- 5. The room hands a pilot a card's role ---- */
{
  const facts = factsFrom(tableCards);
  eq([facts("Doubling Season").flags.includes("D"), facts("Forest").flags, facts("Chulane, Teller of Tales").commanderClass >= 0.9, facts("Forest").commanderClass], [true, "", true, 0],
    "factsFrom carries `flags` and `commanderClass` beside a card's other public facts");
  eq(facts("No Such Card At All"), null, "and a card the table cannot play is still none");
  ok(facts("Doubling Season") === facts("Doubling Season"), "read once and kept");
}

console.log(`pilot-roles: ${checks} checks passed — a few kilobytes of the corpus tell every pilot which cards double, loop, drain or are salty and how dangerous a commander is, held equal to their sources, and handed to a pilot with a card's other public facts.`);
