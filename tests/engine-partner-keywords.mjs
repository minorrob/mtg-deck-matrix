/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE PARTNER ABILITIES AS KEYWORDS (Rob's Priority Batch 10.3, its twenty-eighth slice: Kraum, Ludevic's Opus and the
 * partner cards the catalog held back for the word alone).
 *
 * CR 702.124: Partner, a named Partner ability ("Partner--Character select") and Choose a Background let a deck have two
 * commanders. That is a deck rule, and the table already holds it (room/table.mjs, `partnered`), reading the card's own
 * words (cards/index.mjs, `partnersIn`); in the game they do nothing. What a card script could not do was say the keyword:
 * "Partner" compiled as a word with no behavior, and the card was refused. Now the compiler takes `partner` and
 * `choose a background` as deck rules -- the card's words must say the same -- and the catalog credits both
 * (game/tools/engine-constructs.mjs, DECK_RULE_KEYWORDS). Not yet "Partner with [name]" (702.124j), which is also a
 * trigger as the card enters.
 *
 * Splinter, the Mentor makes a Mutagen, a predefined token (CR 111.10v): script/effects/permanents.mjs, with Treasure,
 * Food and Clue.
 *
 * The card scenarios play the cards' other abilities (Kraum, Ikra Shidiqi, Ganax, April O'Neil, Bruse Tarl, Ravos, Jaheira,
 * Karlach, Splinter). This suite holds the compiler, the table pairing the real cards, the catalog, and the Mutagen.
 */
import assert from "node:assert/strict";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {partnered} from "../game/room/table.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});

/* ---- the compiler ---- */
{
  const script = (oracleText, keyword, text) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", supertypes: ["Legendary"],
    types: ["Creature"], subtypes: ["Human"], manaCost: "{2}", colors: [], power: 2, toughness: 2}, oracleText, source: "hand", abilities: [{kind: "keyword", text, keyword}]});
  const partner = compileScript(script("Partner (You can have two commanders if both have partner.)", "partner", "Partner"));
  eq([partner.problems, partner.definition.keywords, partner.definition.partners], [[], ["Partner"], [{kind: "partner"}]], "Partner: a deck rule, the card's words saying it too");
  const named = compileScript(script("Partner—Character select", "partner", "Partner—Character select"));
  eq([named.problems, named.definition.partners], [[], [{kind: "text", text: "character select"}]], "a named Partner ability is the partner keyword, its name kept for the table");
  const background = compileScript(script("Choose a Background (You can have a Background as a second commander.)", "choose a background", "Choose a Background"));
  eq([background.problems, background.definition.keywords, background.definition.partners], [[], ["Choose a Background"], [{kind: "background"}]], "Choose a Background, the same");
  ok(compileScript(script("Flying", "partner", "Partner")).problems.some((p) => p.includes("CR 702.124")), "a partner keyword the card's words do not say is a problem");
  ok(compileScript(script("Partner with Toothy, Imaginary Friend", "partner", "Partner with Toothy, Imaginary Friend")).problems.length > 0,
    "not yet \"Partner with [name]\": its trigger as the card enters is not built");
  ok(compileScript(script("Partner (You can have two commanders if both have partner.)", "choose a background", "Choose a Background")).problems.length > 0,
    "Partner's words are not Choose a Background's");
}

/* ---- the table pairs the real cards ---- */
{
  const pair = (a, b) => partnered([a, b], [index.definition(a), index.definition(b)]);
  ok(pair("Kraum, Ludevic's Opus", "Ikra Shidiqi, the Usurper"), "Kraum and Ikra Shidiqi, both with Partner, are two commanders");
  ok(pair("April O'Neil, Live on the Scene", "Splinter, the Mentor"), "April O'Neil and Splinter, both \"Partner--Character select\"");
  ok(!pair("April O'Neil, Live on the Scene", "Kraum, Ludevic's Opus"), "but not April O'Neil and Kraum: two different partner abilities never combine (CR 702.124f)");
  const background = {types: ["Enchantment"], subtypes: ["Background"], supertypes: ["Legendary"]};
  ok(partnered(["Ganax, Astral Hunter", "A Background"], [index.definition("Ganax, Astral Hunter"), background]), "Ganax chooses a Background");
  ok(!pair("Ganax, Astral Hunter", "Kraum, Ludevic's Opus"), "and Ganax with Kraum is no pair");
}

/* ---- the catalog ---- */
eq([missingFor({keywords: ["Partner"]}), missingFor({keywords: ["Choose a Background"]})], [[], []], "the catalog credits Partner and Choose a Background, deck rules the table holds");
ok(missingFor({keywords: ["Partner with"]}).length === 1, "not Partner with, which is also a trigger");

/* ---- the Mutagen (CR 111.10v) ---- */
{
  const s = runScenario({name: "mutagen", setup: [at(0, "battlefield", "Splinter, the Mentor", "Swamp", "Wastes", "Wastes"), at(0, "hand", "Snuff")],
    steps: [{tap: "Swamp"}, {cast: "Snuff", targets: [{card: "Splinter, the Mentor"}]}, {resolve: true}, {resolve: true}, {tap: "Wastes"}]}, index.definition,
  {Snuff: {types: ["Instant"], manaCost: "{B}", colors: ["B"], spell: {id: "s", text: "Destroy target creature.", targets: [{what: "permanent", types: ["Creature"]}],
    effects: [{effect: "destroy", targets: {target: 0}}]}}}).state;
  const mutagen = Object.values(s.objects).find((o) => o.card === "Mutagen" && o.zone === "battlefield");
  eq([mutagen?.token, mutagen?.types, mutagen?.subtypes], [true, ["Artifact"], ["Mutagen"]], "Splinter leaves: a Mutagen, a colorless Mutagen artifact token");
  eq(legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Mutagen").length, 0, "with no creature to target, the Mutagen cannot be activated");
}
{
  /* "Activate only as a sorcery": on Maya's turn Rob's Mutagen waits, with a creature to aim at; on Rob's next turn, it may. */
  const FIX = {Snuff: {types: ["Instant"], manaCost: "{B}", colors: ["B"], spell: {id: "s", text: "Destroy target creature.", targets: [{what: "permanent", types: ["Creature"]}],
    effects: [{effect: "destroy", targets: {target: 0}}]}}, Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
  const made = [{tap: "Swamp"}, {cast: "Snuff", targets: [{card: "Bear"}]}, {resolve: true}, {resolve: true}];
  const setup = [at(0, "battlefield", "Splinter, the Mentor", "Bear", "Swamp", "Wastes"), at(0, "hand", "Snuff")];
  const offered = (s) => legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Mutagen").length;
  const theirs = runScenario({name: "Maya's turn", setup, steps: [...made, {to: {turn: 2, phase: "MAIN1"}}, {pass: 1}, {tap: "Wastes"}], library: ["Forest", "Island"]},
    index.definition, FIX).state;
  eq([theirs.activePlayer, theirs.priorityPlayer, theirs.players[0].manaPool?.C ?? 0, offered(theirs)], [1, 0, 1, 0],
    "Maya's main phase, Rob with priority and {C} to pay: the Mutagen is not offered");
  const mine = runScenario({name: "Rob's turn", setup, steps: [...made, {to: {turn: 3, phase: "MAIN1"}}, {tap: "Wastes"}], library: ["Forest", "Island"]}, index.definition, FIX).state;
  ok(offered(mine) > 0, "Rob's next main phase, the same {C}: it is, aimed at Splinter");
}

for (const name of ["Kraum, Ludevic's Opus", "Ikra Shidiqi, the Usurper", "Ganax, Astral Hunter", "April O'Neil, Live on the Scene", "Bruse Tarl, Boorish Herder",
  "Ravos, Soultender", "Jaheira, Friend of the Forest", "Karlach, Fury of Avernus", "Splinter, the Mentor"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-partner-keywords: ${checks} checks passed -- Partner, a named Partner and Choose a Background compile as deck rules the card's words must say; the table pairs the real cards and refuses mixed ones; the catalog credits both, not Partner with; the Mutagen token.`);
