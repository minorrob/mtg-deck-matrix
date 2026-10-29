/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {createLibrary} from "../game/engine/cards/sentences.mjs";
import {compileCard, trustOf} from "../game/tools/card-compiler.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {smokeTest} from "../game/engine/cards/compile.mjs";

const source = {
  schema: "CrankCardScript@1", identity: {name: "Smoke Legendary Counter", oracleId: "w7-source", types: ["Instant"], manaCost: "{U}", colors: ["U"], colorIdentity: ["U"]},
  oracleText: "Counter target legendary spell.", abilities: [{kind: "spell", text: "Counter target legendary spell.",
    targets: [{what: "spell", supertypes: ["Legendary"]}], effects: [{effect: "counterSpell", spells: {target: 0}}]}],
};
const definition = loadCardIndex().definition;
const smoke = smokeTest(source, definition);
assert.equal(smoke.ok, true, "the smoke fixture finishes without a rules exception");
assert.equal(smoke.played, false, "its nonlegendary spell gives this counterspell no legal cast");
const library = createLibrary([source]);
const record = {id: "w7-smoke-counter", name: "Another Legendary Counter", type: "Instant", mana: "{U}", colors: ["U"], ci: ["U"],
  layout: "normal", faces: "None", text: source.oracleText};
const trust = () => ({ok: true, cards: 50, band: {band: "50+", rate: 1, low: 0.99}});
const result = compileCard(record, {library, trust, definition});
assert.equal(result.status, "refused", "a clean smoke game that never played the candidate is refused");
assert.match(result.why[0], /not played/, "the refusal names the missing played evidence");
const bear = {...source, identity: {...source.identity, name: "Smoke Flying Bear", types: ["Creature"], power: 2, toughness: 2},
  oracleText: "Flying", abilities: [{kind: "keyword", text: "Flying", keyword: "flying"}]};
const good = compileCard({...record, name: "Another Flying Bear", type: "Creature — Bear", power: "2", toughness: "2", text: "Flying"},
  {library: createLibrary([bear]), trust, definition});
assert.equal(good.status, "candidate", "a candidate actually cast in the same smoke fixture passes");
assert.equal(good.smoke.played, true);
const seeded = {...bear, identity: {...bear.identity, manaCost: null}};
assert.equal(smokeTest(seeded, definition).played, false, "a permanent seeded on the battlefield was never played");
const flyingLibrary = createLibrary([bear]);
const [template] = good.templates;
const calibration = {minimumCount: 2, pooled: Array.from({length: 6}, () => ({rate: 1, low: 0.99})), rates: new Map()};
assert.equal(trustOf(flyingLibrary, calibration)(template).ok, false, "a source count below the calibrated minimum is vetoed");
assert.equal(trustOf(flyingLibrary, {...calibration, minimumCount: 1})(template).ok, true, "the measured minimum includes its exact boundary");
for (const type of ["Artifact", "Enchantment"]) {
  const script = {...source, identity: {...source.identity, name: `Smoke ${type} Counter`},
    oracleText: `Counter target ${type.toLowerCase()} spell.`, abilities: [{kind: "spell", text: `Counter target ${type.toLowerCase()} spell.`,
      targets: [{what: "spell", types: [type]}], effects: [{effect: "counterSpell", spells: {target: 0}}]}]};
  const actual = smokeTest(script, definition);
  assert.equal(actual.played, true, `${type} counterspell is actually cast in its smoke fixture`);
  assert.equal(actual.ok, true, `${type} fixture supplies a legal spell without weakening the smoke check`);
}
console.log("load100-w7-compiler: 13 checks passed; actual smoke play and calibrated count required.");
