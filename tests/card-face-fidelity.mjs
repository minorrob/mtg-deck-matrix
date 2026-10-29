/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {loadCardScripts} from "../game/tools/engine-cards.mjs";
import {checkFidelity} from "../game/engine/cards/compile.mjs";
let checks = 0;
const eq = (a, b, message) => {assert.deepEqual(a, b, message); checks++;};
const ok = (value, message) => {assert.ok(value, message); checks++;};
const scripts = loadCardScripts().map(({script}) => script);
const actual = scripts.find(script => script.identity.name === "Aang, Swift Savior // Aang and La, Ocean's Fury");
ok(actual?.back.abilities.length > 0, "the fixture is an existing loaded card with real back-face text");
eq(checkFidelity(actual).ok, true, "the original whole card passes");
const omitted = structuredClone(actual); omitted.back.abilities = [];
const result = checkFidelity(omitted);
eq(result.ok, false, "removing every back-face ability fails even when the original front is unchanged");
ok(result.unclaimed.includes("Reach") && result.unclaimed.includes("trample"), "the error identifies actual omitted keyword text");
ok(result.unclaimed.some(text => text.includes("put a +1/+1 counter")), "the real omitted triggered instruction is identified too");
const invented = structuredClone(actual); invented.back.abilities.push({...invented.back.abilities[0], text: "Draw seven cards."});
eq(checkFidelity(invented).invented, ["Draw seven cards."], "an invented back-face sentence is refused independently");
const front = structuredClone(actual); front.abilities = [];
eq(checkFidelity(front).ok, false, "a good back cannot mask omitted front text");
for (const key of ["back", "adventure", "prepare"]) {
  const plain = {identity: {name: "Plain"}, oracleText: "Flying", abilities: [{text: "Flying"}],
    [key]: {oracleText: "Vigilance", abilities: [{text: "Vigilance"}]}};
  eq(checkFidelity(plain).ok, true, `${key} claims its own text`);
  plain[key].abilities = [];
  eq(checkFidelity(plain), {ok: false, invented: [], unclaimed: ["Vigilance"]}, `${key} cannot borrow the other face's claim`);
}
const rites = scripts.find(script => script.identity.name.startsWith("Growing Rites of Itlimoc //"));
eq(checkFidelity(rites).ok, true, "the real physical transform reminder needs no executable ability");
const changedReminder = structuredClone(rites);
changedReminder.back.oracleText = changedReminder.back.oracleText.replace("Transforms from Growing Rites of Itlimoc.", "Transforms from Someone Else.");
eq(checkFidelity(changedReminder).ok, false, "only a reminder naming this actual front is recognized");
const noParentheses = structuredClone(rites);
noParentheses.back.oracleText = noParentheses.back.oracleText.replace("(Transforms from Growing Rites of Itlimoc.)", "Transforms from Growing Rites of Itlimoc.");
eq(checkFidelity(noParentheses).ok, false, "unparenthesized text is not exempted");
const modal = structuredClone(rites); modal.layout = "modal_dfc";
eq(checkFidelity(modal).ok, false, "a modal face cannot use a transform-only reminder exception");
const lostMana = structuredClone(rites); lostMana.back.abilities = lostMana.back.abilities.slice(0, 1);
eq(checkFidelity(lostMana).ok, false, "recognizing physical metadata never exempts real adjacent mana text");
const lostFixedMana = structuredClone(rites); lostFixedMana.back.abilities = lostFixedMana.back.abilities.slice(1);
eq(checkFidelity(lostFixedMana).ok, false, "a longer conditional mana sentence cannot claim the distinct fixed-mana sentence sharing its prefix");
ok(checkFidelity(lostFixedMana).unclaimed.includes("{T}: Add {G}."), "the actual missing fixed-mana sentence remains unclaimed");
const multi = {identity: {name: "Multiple"}, oracleText: "", abilities: [],
  back: {oracleText: "Reach", abilities: []}, adventure: {oracleText: "Draw a card.", abilities: []},
  prepare: {oracleText: "Trample", abilities: []}};
eq(checkFidelity(multi).unclaimed, ["Reach", "Draw a card.", "Trample"], "each supplied face is checked without nullish coalescing hiding a sibling");
const backs = scripts.filter(script => script.back);
ok(backs.length >= 29, "the current back-face inventory is retained as the directory grows");
eq(scripts.filter(script => !checkFidelity(script).ok).map(script => script.identity.name), [], "all existing definitions pass the stronger whole-card check without a saved-card rewrite");
console.log(`card-face-fidelity: ${checks} checks; every printed face must claim its own actual text`);
