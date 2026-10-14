/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, W2D: ROLE TOKENS (Royal Treatment; CR 303.7, 111.10m, 303.4i, 704.5z).
 *
 * "Create a Royal Role token attached to that creature": the predefined Royal Role (effects/permanents.mjs) -- a colorless
 * Aura Role enchantment token named Royal with enchant creature, "Enchanted creature gets +1/+1 and has ward {1}" -- made
 * by createToken's `attachedTo`, entering attached to that object (script/bind.mjs binds it as a target is). An Aura token
 * created attached to what it could not enchant, or to nothing, is not created (CR 303.4i). And the state-based action
 * (rules/sba.mjs; CR 704.5z): two or more Roles one player controls on one permanent -- each but the newest goes to its
 * owner's graveyard, and a token there ceases to exist (CR 704.5d); another player's Role stays.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {powerOf, keywordsOf, colorsOf} from "../game/engine/rules/layers.mjs";
import {PREDEFINED_TOKENS} from "../game/engine/script/effects/permanents.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
const table = (setup) => runScenario({name: "roles", setup, steps: []}, index.definition, FIX).state;
const idOf = (s, name, seat = 0) => s.zones.battlefield.find((id) => s.objects[id].card === name && s.objects[id].controller === seat);
const roles = (s) => s.zones.battlefield.filter((id) => s.objects[id].card === "Royal");
const ROLE = (host, more = {}) => [{effect: "createToken", count: 1, token: {predefined: "Royal Role"}, attachedTo: [host], ...more}];

{
  const s = table([{seat: 0, zone: "battlefield", cards: ["Bear"]}]);
  const bear = idOf(s, "Bear");
  runEffects(s, ROLE(bear), {controller: 0, source: null});
  checkStateBasedActions(s);
  const [role] = roles(s);
  eq([s.objects[role].types, s.objects[role].subtypes, colorsOf(s, role), s.objects[role].token, s.objects[role].attachedTo, s.objects[bear].attachments],
    [["Enchantment"], ["Aura", "Role"], [], true, bear, [role]], "a colorless Aura Role enchantment token named Royal, entered attached to the Bear");
  eq([powerOf(s, bear), keywordsOf(s, bear).includes("Ward")], [3, true], "the Bear gets +1/+1 and has ward");
  eq(PREDEFINED_TOKENS["Royal Role"].enchant, {what: "permanent", types: ["Creature"]}, "its Enchant: creature");
}
{
  /* Not created (CR 303.4i): attached to what it can't enchant -- a land -- or to nothing. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Forest"]}]);
  runEffects(s, [...ROLE(idOf(s, "Forest")), ...ROLE(undefined, {attachedTo: []})], {controller: 0, source: null});
  eq(roles(s), [], "no Role made for a Forest, or for nothing");
}
{
  /* Three of Rob's Roles on it, one at a time: the newest stays, each other goes to the graveyard and ceases to exist. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Bear"]}]);
  const bear = idOf(s, "Bear");
  for (let n = 0; n < 3; n += 1) runEffects(s, ROLE(bear), {controller: 0, source: null});
  const newest = Math.max(...roles(s));
  checkStateBasedActions(s);
  eq([roles(s), s.objects[bear].attachments, s.zones.graveyard[0]], [[newest], [newest], []], "the newest alone, and the others gone (CR 704.5d)");
  eq(powerOf(s, bear), 3, "one +1/+1, not three");
}
{
  /* Maya's Role and Rob's on Rob's Bear: one each player controls, and both stay. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Bear"]}]);
  const bear = idOf(s, "Bear");
  runEffects(s, ROLE(bear), {controller: 0, source: null});
  runEffects(s, ROLE(bear), {controller: 1, source: null});
  checkStateBasedActions(s);
  eq([roles(s).map((id) => s.objects[id].controller).sort(), powerOf(s, bear)], [[0, 1], 4], "Rob's and Maya's both, +2/+2");
}
{
  /* Two Auras of Rob's that are not Roles: the rule is a Role's, and both stay. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Bear"]}]);
  const bear = idOf(s, "Bear");
  const charm = {name: "Charm", types: ["Enchantment"], subtypes: ["Aura"], colors: ["W"], enchant: {what: "permanent", types: ["Creature"]}};
  runEffects(s, [{effect: "createToken", count: 2, token: charm, attachedTo: [bear]}], {controller: 0, source: null});
  checkStateBasedActions(s);
  eq(s.objects[bear].attachments.map((id) => s.objects[id].card), ["Charm", "Charm"], "both Charms stay");
}
{
  /* Twice that many (Anointed Procession): two made, both attached, and the state-based action keeps one. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Bear", "Anointed Procession"]}]);
  const bear = idOf(s, "Bear");
  runEffects(s, ROLE(bear), {controller: 0, source: null});
  eq(roles(s).map((id) => s.objects[id].attachedTo), [bear, bear], "two Roles made, each attached to the Bear");
  checkStateBasedActions(s);
  eq(roles(s).length, 1, "one stays");
}

/* ---- the compiler ---- */
const compiled = (effect) => compileScript({schema: "CrankCardScript@1",
  identity: {name: "Odd Treatment", oracleId: "x", types: ["Instant"], subtypes: [], manaCost: "{G}", colors: ["G"], colorIdentity: ["G"]},
  oracleText: "x", source: "hand", abilities: [{kind: "spell", text: "x", targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "createToken", count: 1, attachedTo: {target: 0}, ...effect}]}]}).problems;
{
  eq(compiled({token: {predefined: "Royal Role"}}), [], "a Royal Role attached to a target compiles");
  ok(compiled({token: {predefined: "Treasure"}}).some((p) => p.includes("one Aura token")), "a Treasure attached is refused");
  ok(compiled({token: {predefined: "Royal Role"}, count: 2}).some((p) => p.includes("one Aura token")), "two at once is refused");
  ok(compiled({token: {predefined: "Royal Role"}, attachedTo: "self"}).some((p) => p.includes("one Aura token")), "attached to its source is refused");
}

console.log(`engine-roles: ${checks} checks passed -- a Royal Role made attached, not made for what it can't enchant, and one player's newest Role alone on a permanent.`);
