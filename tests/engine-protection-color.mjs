/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* PROTECTION FROM A COLOR (CR 702.16; Karmic Guide's "protection from black", AI 1's Chulane deck, after the live game of
 * 2026-10-04).
 *
 * The keyword with its quality, `from: {colors: [...]}` (or a card type, or "everything"), compiled to the static
 * `protection` on its own permanent (cards/index.mjs); a source has the quality when it is that color as it now is -- a
 * permanent through the layers, a spell or card as it is (rules/protection.mjs). What it does is read where each thing
 * happens (DEBT): damage from a black source prevented (CR 702.16e), no black Aura attached or left attached (702.16c), no
 * black creature blocking it (702.16f), no black spell's or black source's ability targeting it (702.16b).
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {canBlockAttacker} from "../game/engine/keywords/combat.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {protectedFrom} from "../game/engine/rules/protection.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {keywordBuilt} from "../game/tools/engine-constructs.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const KG = "Karmic Guide";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const flier = (colors) => ({types: ["Creature"], subtypes: ["Bird"], manaCost: "{1}", colors, power: 1, toughness: 1, keywords: ["Flying"]});
const aura = (colors) => ({types: ["Enchantment"], subtypes: ["Aura"], manaCost: "{1}", colors, enchant: {what: "permanent", types: ["Creature"]}});
const FIX = {"Black Bat": flier(["B"]), "White Bird": flier(["W"]), "Gray Ogre": {types: ["Creature"], manaCost: "{2}{R}", colors: ["R"], power: 2, toughness: 2},
  Shade: {types: ["Creature"], manaCost: "{2}{B}", colors: ["B"], power: 2, toughness: 2}, "Dark Wreath": aura(["B"]), "Pale Wreath": aura(["W"]),
  Thopter: {types: ["Artifact", "Creature"], manaCost: "{1}", colors: [], power: 1, toughness: 1}};
/* Karmic Guide put on the battlefield after the first upkeep, so its echo is not asked; the Auras put there by an effect. */
const s = runScenario({name: "protection", setup: [at(1, "battlefield", "Black Bat", "White Bird", "Gray Ogre", "Shade", "Thopter"), at(1, "hand", "Dark Wreath", "Pale Wreath"),
  {seat: 0, zone: "battlefield", cards: [KG], sick: true}], steps: []}, index.definition, FIX).state;
runEffect(s, {effect: "moveZone", targets: s.zones.hand[1].slice(), to: "battlefield"}, {controller: 1, source: null});
const id = (card) => s.zones.battlefield.find((x) => s.objects[x].card === card) ?? s.zones.graveyard.flat().find((x) => s.objects[x].card === card);
const guide = id(KG);

{
  /* Damage (CR 702.16e): from a black source prevented, from a red one dealt. */
  runEffect(s, {effect: "dealDamage", amount: 1, targets: [guide]}, {controller: 1, source: id("Shade")});
  eq(s.objects[guide].damage, 0, "1 damage from the black Shade: prevented");
  runEffect(s, {effect: "dealDamage", amount: 1, targets: [guide]}, {controller: 1, source: id("Gray Ogre")});
  eq(s.objects[guide].damage, 1, "1 damage from the red Ogre: dealt");
}
{
  /* Blocking (CR 702.16f): a black flier can't block it, a white one can. */
  eq([canBlockAttacker(s, id("Black Bat"), guide), canBlockAttacker(s, id("White Bird"), guide)], [false, true], "the Black Bat can't block it; the White Bird can");
  /* Colors as they now are (layer 5): the White Bird made black can't; the Black Bat made white can. */
  runEffect(s, {effect: "effectUntil", layer: 5, targets: [id("White Bird")], apply: {setColors: ["B"]}, until: "end-of-turn"}, {controller: 1, source: null});
  runEffect(s, {effect: "effectUntil", layer: 5, targets: [id("Black Bat")], apply: {setColors: ["W"]}, until: "end-of-turn"}, {controller: 1, source: null});
  eq([canBlockAttacker(s, id("Black Bat"), guide), canBlockAttacker(s, id("White Bird"), guide)], [true, false], "its colors changed, each the other's answer");
}
{
  /* Targeting (CR 702.16b): an ability of a black source can't target it; of a red one, it can. */
  const target = compileSelector({what: "permanent", types: ["Creature"], target: true});
  eq([target(s, guide, {controller: 1, source: id("Shade")}), target(s, guide, {controller: 1, source: id("Gray Ogre")})], [false, true], "the Shade's ability can't aim at it; the Ogre's can");
  eq(protectedFrom(s, {card: guide}, null), false, "no source at all: nothing to be protected from");
  eq([protectedFrom(s, {card: id("Gray Ogre")}, id("Shade")), target(s, id("Gray Ogre"), {controller: 1, source: id("Shade")})], [false, true],
    "the protection is Karmic Guide's own: the Ogre beside it has none");
}
{
  /* Enchanting (CR 702.16c): a black Aura is not attached; one that is attached falls off as a state-based action. */
  runEffect(s, {effect: "attach", source: id("Dark Wreath"), targets: [guide]}, {controller: 1, source: id("Dark Wreath")});
  runEffect(s, {effect: "attach", source: id("Pale Wreath"), targets: [guide]}, {controller: 1, source: id("Pale Wreath")});
  eq(s.objects[guide].attachments.map((x) => s.objects[x].card), ["Pale Wreath"], "the white Aura attaches; the black one does not");
  runEffect(s, {effect: "effectUntil", layer: 5, targets: [id("Pale Wreath")], apply: {setColors: ["B"]}, until: "end-of-turn"}, {controller: 1, source: null});
  checkStateBasedActions(s);
  eq([s.objects[guide].attachments, s.zones.graveyard[1].map((x) => s.objects[x].card).includes("Pale Wreath")], [[], true], "made black, it is put into Maya's graveyard (CR 704.5m)");
  eq(protectedFrom(s, {card: guide}, id("Thopter")), false, "a colorless artifact: no protection from it");
}

/* The keyword: its quality said, or refused; and the catalog's credit, for the qualities that are built. */
{
  const script = (from) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "t", types: ["Creature"], manaCost: "{1}", power: 1, toughness: 1}, oracleText: "x",
    abilities: [{kind: "keyword", text: "Protection", keyword: "protection", ...(from !== undefined ? {from} : {})}]});
  const built = compileScript(script({types: ["Artifact"]})).definition;
  eq([built.keywords, built.abilities[0]], [["Protection"], {id: "a0", kind: "static", rule: "protection", text: "Protection", affects: {self: true}, from: {types: ["Artifact"]}}],
    "protection from artifacts: the static on its own permanent");
  eq([compileScript(script(undefined)).definition, compileScript(script({colors: ["P"]})).definition, compileScript(script({names: ["Bear"]})).definition], [null, null, null],
    "no quality, a color that is none, a quality not built: refused");
  eq(compileScript(script("everything")).definition.abilities[0].from, "everything", "protection from everything");
  eq(["Protection from black", "Protection from artifacts", "Protection from everything", "Protection from multicolored", "Protection from Humans", "Protection from the color of your choice"].map(keywordBuilt),
    [true, true, true, false, false, false], "credited for a color, a card type, everything; not for the rest");
}

console.log(`engine-protection-color: ${checks} checks passed -- protection from a color as the source now is: no damage, no block, no target, no Aura; the keyword's quality said or refused.`);
