/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 113.2c: a writer receives a complete unfinished ability, while keywords remain independent. */
import assert from "node:assert/strict";
import {createLibrary, partialTranslate} from "../game/engine/cards/sentences.mjs";

let checks = 0;
const eq = (actual, expected, why) => { assert.deepEqual(actual, expected, why); checks += 1; };
const script = (name, oracleText, abilities, types = ["Creature"]) => ({
  schema: "CrankCardScript@1", identity: {name, types}, oracleText, source: "hand", abilities,
});
const tap = "{T}: Add {C}.";
const flying = {kind: "keyword", text: "Flying", keyword: "Flying"};
const library = createLibrary([
  script("Mana Teacher", tap, [{kind: "activated", text: tap, mana: true,
    cost: [{atom: "{T}"}], effects: [{effect: "addMana", mana: {C: 1}}]}], ["Land"]),
  script("Wing Teacher", "Flying", [flying]),
  script("Draw Teacher", "Draw a card.", [{kind: "spell", text: "Draw a card.", effects: [{effect: "draw", count: 1}]}], ["Sorcery"]),
]);
const unfinished = `${tap} If this land has a luck counter on it, instead add one mana of any color.`;
const mana = partialTranslate(script("Unfinished Land", unfinished, [], ["Land"]), library);
eq(mana.known, [], "a writer must never retain the unconditional mana option from a conditional replacement ability");
eq(mana.write.map((a) => a.text), [unfinished], "all sentences of the unfinished mana ability go to the writer together");

const keywords = partialTranslate(script("Partly Known Wings", "Flying, shadow", []), library);
eq(keywords.known.map((a) => a.text), ["Flying"], "a known keyword remains available when another keyword is unfinished");
eq(keywords.write.map((a) => a.text), ["shadow"], "the writer receives only the unfinished keyword");
const none = partialTranslate(script("Unknown Wings", "Shadow, skulk", []), library);
eq(none.write.map((a) => a.text), ["Shadow", "skulk"], "separate unknown keywords are separate abilities for the writer");

const paragraphs = partialTranslate(script("Separated Land", `${tap}\nWhenever you draw a card, gain 1 life.`, [], ["Land"]), library);
eq(paragraphs.known.map((a) => a.text), [tap], "a complete mana ability stays known when another paragraph is unfinished");
eq(paragraphs.write.map((a) => a.text), ["Whenever you draw a card, gain 1 life."], "a different paragraph is requested independently");
const distrusted = partialTranslate(script("Distrusted Land", tap, [], ["Land"]), library, {keep: () => false});
eq(distrusted.known, [], "an untrusted complete ability is not supplied to the writer as known");
eq(distrusted.write.map((a) => a.text), [tap], "the writer receives the whole untrusted ability");
const spellText = "Draw a card.\nFlashback {1}{R}";
const spell = partialTranslate(script("Unfinished Spell", spellText, [], ["Sorcery"]), library);
eq(spell.known, [], "a spell is not supplied piecemeal when another ability remains unfinished");
eq(spell.write.map((a) => a.text), spellText.split("\n"), "the writer receives both the spell and its unfinished alternative cost");

console.log(`sentence-paragraphs: ${checks} checks passed`);
