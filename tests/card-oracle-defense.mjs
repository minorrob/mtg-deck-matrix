/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {oracleDefenseProblems} from "../game/tools/oracle-defense.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {loadCardScripts} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, message) => {assert.deepEqual(a, b, message); checks++;};
const ok = (value, message) => {assert.ok(value, message); checks++;};
const raw = {name: "Defense Fixture", type: "Battle — Siege", defense: "4"};
const fixture = JSON.parse(readFileSync(new URL("../game/engine/cards/o/ordinary-bear.json", import.meta.url), "utf8"));
fixture.identity = {...fixture.identity, name: raw.name, types: ["Battle"], subtypes: ["Siege"], power: null, toughness: null, defense: 4};
eq(validateScript(fixture).valid, true, "printed defense has a native schema-supported numeric field");
eq(oracleDefenseProblems(fixture, raw), [], "the actual printed number matches");
const wrong = {...fixture, identity: {...fixture.identity, defense: 5}};
eq(validateScript(wrong).valid, true, "another positive integer satisfies schema, so schema alone cannot prove identity");
ok(oracleDefenseProblems(wrong, raw).some(p => p.includes("defense 5 is not Oracle 4")), "independent Oracle equality rejects the wrong integer");
for (const defense of [undefined, null, "4", 4.5, -1]) {
  ok(oracleDefenseProblems({...fixture, identity: {...fixture.identity, defense}}, raw).length > 0, "missing, mistyped and wrong defense values fail");
}
eq(oracleDefenseProblems({...fixture, identity: {...fixture.identity, defense: 0}}, {...raw, defense: "0"}), [], "zero is a real printed number, not absence");
eq(oracleDefenseProblems({...fixture, identity: {...fixture.identity, defense: 0}}, {...raw, defense: 0}), [], "numeric Oracle zero is also a real printed number, not an absent characteristic");
eq(oracleDefenseProblems(fixture, {...raw, defense: "+4"}), [], "whole signed integer Oracle strings retain numeric identity");
for (const defense of [undefined, null, "4x", "", "1e2", -1, "9007199254740993"]) {
  ok(oracleDefenseProblems(fixture, {...raw, defense}).length > 0, "missing or malformed committed Battle identity cannot supply a default");
}
ok(oracleDefenseProblems({...fixture, identity: {...fixture.identity, defense: -1}}, {...raw, defense: "-1"})
  .some(problem => problem.includes("invalid Oracle printed defense")), "matching negative values do not bypass independent Oracle validation");
const double = {name: "Two-faced fixture", layout: "transform", defense: "99", faces: [raw, {name: "Second Battle", type: "Battle", defense: "8"}]};
const both = {...fixture, back: {identity: {name: "Second Battle", defense: 8}}};
eq(oracleDefenseProblems(both, double), [], "front and back use their own Oracle face, not a misleading outer number");
ok(oracleDefenseProblems({...both, back: {identity: {defense: 4}}}, double).some(p => p.includes("second face defense 4 is not Oracle 8")), "a back face cannot borrow its front's number");
ok(oracleDefenseProblems(fixture, double).length > 0, "a missing printed back identity is not ignored");
for (const key of ["adventure", "prepare"]) {
  eq(oracleDefenseProblems({...fixture, [key]: both.back}, double), [], "an inset's own printed identity is compared too");
}
const ordinary = {name: "Ordinary fixture", type: "Creature — Bear", defense: null};
eq(oracleDefenseProblems({identity: {name: ordinary.name, defense: null}}, ordinary), [], "null/absent means no printed characteristic on an ordinary card");
ok(oracleDefenseProblems({identity: {name: ordinary.name, defense: 3}}, ordinary).length > 0, "inventing defense on an ordinary Oracle identity fails");
ok(oracleDefenseProblems(fixture, null).length > 0, "an unknown Oracle identity is not certified");

const cards = JSON.parse(readFileSync(new URL("../data/engine/oracle.json", import.meta.url), "utf8")).cards;
const actual = cards.find(card => card.faces?.[0]?.defense != null);
ok(actual, "the retained real Oracle includes a printed Battle face");
const printed = Number(actual.faces[0].defense), actualScript = {identity: {name: actual.name, defense: printed}};
eq(oracleDefenseProblems(actualScript, actual), [], "the actual retained Battle's printed number matches its face");
ok(oracleDefenseProblems({identity: {...actualScript.identity, defense: printed + 1}}, actual).length > 0, "a real retained Battle rejects a different schema-valid integer");
const byName = new Map(cards.map(card => [card.name, card]));
const drift = loadCardScripts().flatMap(({script}) => oracleDefenseProblems(script, byName.get(script.identity.name)));
eq(drift, [], "every existing canonical definition retains its exact defense/absence; no definition is removed or rewritten");
console.log(`card-oracle-defense: ${checks} checks; printed face identity is independently compared to the committed Oracle`);
