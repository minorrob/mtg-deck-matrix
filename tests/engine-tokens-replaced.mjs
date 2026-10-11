/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, P4-REPLACEMENTS: TOKENS CREATED, REPLACED (CR 614.1a, 111.1) -- Anointed Procession and Draconic Visitor.
 *
 * rules/statics.mjs, tokensCreated, read wherever tokens are made (script/effects/permanents.mjs: createToken and a token
 * copy's makeCopies): `more-tokens` ("it creates twice that many of those tokens instead"), for the player its `affects`
 * names; `tokens-instead` ("if one or more artifact tokens would be created under your control, that many 5/5 red Dragon
 * creature tokens with flying are created instead"), its controller's, the tokens it replaces told by their card types.
 * They end the same in either order (CR 616.1). Here: two Processions, whose control a token is made under, the effect's
 * own words (tapped, remembered, haste) on what is made instead, investigate, the turn's record, four players, the schema.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const AP = "Anointed Procession", DV = "Draconic Visitor";
const FIX = {Relic: {types: ["Artifact"], subtypes: [], manaCost: "{2}", colors: []},
  Thopter: {types: ["Artifact", "Creature"], subtypes: ["Thopter"], manaCost: "{1}", colors: [], power: 1, toughness: 1, keywords: ["Flying"]},
  /* "If an effect would create one or more tokens under your control, it creates three times that many of those tokens instead." */
  Trebler: {types: ["Enchantment"], subtypes: [], manaCost: "{3}{W}", colors: ["W"], abilities: [{id: "t", kind: "static", text: "x", rule: "more-tokens", affects: {who: "you"}, times: 3}]}};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, seats = 2) => runScenario({name: "tokens-replaced", seats, setup, steps: []}, index.definition, FIX).state;
const named = (s, name, seat = 0) => s.zones.battlefield.filter((id) => s.objects[id].card === name && s.objects[id].controller === seat);
const SOLDIER = {name: "Soldier", types: ["Creature"], subtypes: ["Soldier"], colors: ["W"], power: 1, toughness: 1};
const make = (s, params, controller = 0) => { const context = {controller, source: null}; runEffects(s, [{effect: "createToken", count: 1, ...params}], context); return context; };

{
  const s = table([at(0, "battlefield", AP, AP)]);
  make(s, {token: SOLDIER});
  eq([named(s, "Soldier").length, s.players[0].tokensThisTurn], [4, 4], "two Processions: four times as many -- and four counted as made this turn");
  const t = table([at(0, "battlefield", "Trebler")]);
  make(t, {token: SOLDIER});
  eq(named(t, "Soldier").length, 3, "times 3: three times as many");
}
{
  /* "Target player creates": the tokens are made under that player's control, and that player's Procession is the one. */
  const s = table([at(0, "battlefield", AP), at(1, "battlefield", AP)]);
  make(s, {token: SOLDIER, controller: 1});
  eq([named(s, "Soldier", 1).length, named(s, "Soldier", 0).length], [2, 0], "Rob's effect, Maya's tokens: her Procession doubles them, his does not");
}
{
  /* What the effect says of the tokens holds for those made instead: tapped, haste, remembered. */
  const s = table([at(0, "battlefield", DV, AP)]);
  const context = make(s, {token: {predefined: "Treasure"}, tapped: true, gainsUntilEndOfTurn: ["Haste"], remember: true});
  const dragons = named(s, "Dragon");
  eq([dragons.length, named(s, "Treasure").length, dragons.every((id) => s.objects[id].tapped), dragons.every((id) => keywordsOf(s, id).includes("Haste")), context.remembered],
    [2, 0, true, true, dragons], "a tapped Treasure with haste: two tapped Dragons with haste, remembered for what follows");
}
{
  const s = table([at(0, "battlefield", DV)]);
  runEffects(s, [{effect: "investigate", count: 2}], {controller: 0, source: null});
  eq([named(s, "Dragon").length, named(s, "Clue").length], [2, 0], "investigate twice: two Dragons, no Clues (a Clue is an artifact token)");
}
{
  /* A copy of an artifact creature would be an artifact token. */
  const s = table([at(0, "battlefield", DV, "Thopter")]);
  const [thopter] = named(s, "Thopter");
  runEffects(s, [{effect: "copyPermanent", targets: [thopter]}], {controller: 0, source: null});
  eq([named(s, "Thopter").length, named(s, "Dragon").length], [1, 1], "a token copy of the Thopter: a Dragon instead");
}
{
  const s = table([at(0, "battlefield", AP), at(1, "battlefield", DV), at(2, "battlefield", AP, DV)], 4);
  for (const seat of [0, 1, 2, 3]) make(s, {token: {predefined: "Treasure"}}, seat);
  eq([0, 1, 2, 3].map((seat) => [named(s, "Treasure", seat).length, named(s, "Dragon", seat).length]), [[2, 0], [0, 1], [0, 2], [1, 0]],
    "four players: each permanent its own controller's -- Rob two Treasures, Maya a Dragon, Trey two Dragons, Sam a Treasure");
}
{
  const problems = (fields) => compileScript({schema: "CrankCardScript@1",
    identity: {name: "Odd Procession", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{W}", colors: ["W"], colorIdentity: ["W"]},
    oracleText: "x", source: "hand", abilities: [{kind: "static", text: "x", ...fields}]}).problems;
  eq([problems({rule: "more-tokens", affects: {who: "you"}, times: 2}), problems({rule: "tokens-instead", affects: {types: ["Artifact"]}, token: SOLDIER})], [[], []], "both compile");
  ok(problems({rule: "more-tokens", affects: {who: "you"}}).some((p) => p.includes("More tokens instead says how many times")), "more-tokens without times is refused");
  ok(problems({rule: "tokens-instead", affects: {types: ["Artifact"], subtypes: ["Treasure"]}, token: SOLDIER}).some((p) => p.includes("told by their card types")), "tokens-instead by subtype is refused");
  ok(problems({rule: "tokens-instead", affects: {types: ["Artifact"]}, token: {power: 5}}).some((p) => p.includes("What is made instead is a token")), "and a token without a name or types");
}

console.log(`engine-tokens-replaced: ${checks} checks passed -- twice that many tokens, and Dragons instead of artifact tokens: whose control, the effect's words on what is made instead, copies, investigate, four seats, the schema.`);
