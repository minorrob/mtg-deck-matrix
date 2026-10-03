/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 52 (THE CATALOG'S ORDER): STORM (CR 702.40), FIGHT (CR 701.14), AND A PLAYER'S CHOICE AMONG OPTIONS
 * (Forge's GenericChoice).
 *
 * Storm: "when you cast this spell, copy it for each spell cast before it this turn" -- a triggered ability of the spell,
 * waiting as it is cast, every player's spells this turn counted. Fight: each deals damage equal to its power to the
 * other, both powers read first, as the creatures' own damage (deathtouch counts); if either is gone, or no creature,
 * neither deals any. GenericChoice is the modal question at resolution.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const GIFT = {card: "Gift", types: ["Instant"], manaCost: "{C}", spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}};
function table() {
  const s = createState({matchId: "m", seed: "storm-fight", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const put = (s, o, seat, zone) => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
const cast = (s, seat, name) => applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "cast" && a.label === name));
const storms = (s) => [...(s.pendingTriggers ?? []), ...s.stack].filter((t) => t.abilityId === "storm");

{
  /* The first spell of the turn: storm triggers, for none. After Maya's and Rob's: for two -- everyone's spells counted. */
  const s = table();
  put(s, card("Chatterstorm"), 0, "hand");
  s.players[0].manaPool.G = 1; s.players[0].manaPool.C = 1;
  cast(s, 0, "Chatterstorm");
  eq(storms(s).map((t) => t.about?.castBefore ?? null), [0], "the first spell this turn: storm triggers, for none before it");
  const t = table();
  put(t, card("Chatterstorm"), 0, "hand"); put(t, GIFT, 0, "hand");
  t.players[0].manaPool.G = 1; t.players[0].manaPool.C = 2;
  (t.players[1].castThisTurn ??= []).push({types: ["Instant"], colors: []});
  cast(t, 0, "Gift");
  resolveTop(t);
  cast(t, 0, "Chatterstorm");
  const [trigger] = storms(t);
  const spell = t.stack.find((e) => e.kind === "spell").objectId;
  eq([trigger.about.castBefore, (trigger.source?.cardId ?? trigger.cardId) === spell], [2, true], "Maya's spell and Rob's Gift before it: for two, the trigger the spell's own");
  eq(storms((() => { const u = table(); put(u, GIFT, 0, "hand"); u.players[0].manaPool.C = 1; cast(u, 0, "Gift"); return u; })()).length, 0, "a spell without storm: no storm trigger");
  const permanent = compileScript({schema: "CrankCardScript@1", identity: {name: "Storm Golem", oracleId: "x", types: ["Artifact"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], power: null, toughness: null},
    oracleText: "Storm", source: "hand", abilities: [{kind: "keyword", text: "Storm", keyword: "storm"}]});
  eq(permanent.problems.some((p) => /storm on a card that is not an instant or sorcery/.test(p)), true, "storm on an artifact: refused");
}
{
  /* Fight: each its power to the other; both read before either deals any. */
  const s = table();
  const ogre = put(s, {card: "Ogre", types: ["Creature"], power: 4, toughness: 4}, 0, "battlefield"), bear = put(s, {card: "Bear", types: ["Creature"], power: 2, toughness: 2}, 1, "battlefield");
  runEffects(s, [{effect: "fight", from: [ogre], targets: [bear]}], {controller: 0, source: null});
  eq([s.objects[ogre].damage, s.objects[bear].damage], [2, 4], "the Ogre takes 2, the Bear 4");
  /* As the creatures' own damage: a deathtouch Bear's 1 destroys the Ogre (CR 702.2b). */
  const t = table();
  const big = put(t, {card: "Ogre", types: ["Creature"], power: 4, toughness: 4}, 0, "battlefield"), asp = put(t, {card: "Asp", types: ["Creature"], power: 1, toughness: 1, keywords: ["Deathtouch"]}, 1, "battlefield");
  runEffects(t, [{effect: "fight", from: [big], targets: [asp]}], {controller: 0, source: null});
  eq(t.objects[big].deathtouched === true, true, "the Asp's deathtouch marks the Ogre");
  /* Gone, or no creature: no damage at all. */
  const u = table();
  const one = put(u, {card: "Ogre", types: ["Creature"], power: 4, toughness: 4}, 0, "battlefield"), rock = put(u, {card: "Rock", types: ["Artifact"]}, 1, "battlefield");
  runEffects(u, [{effect: "fight", from: [one], targets: [rock]}, {effect: "fight", from: [one], targets: []}], {controller: 0, source: null});
  eq([u.objects[one].damage, u.objects[rock].damage ?? 0], [0, 0], "an artifact, or nothing: neither deals damage");
}
{
  eq([missingFor({apis: ["GenericChoice", "Fight"], keywords: ["Storm"]})], [[]], "the catalog credits GenericChoice, Fight and Storm");
}

console.log(`engine-storm-fight: ${checks} checks passed — storm for every spell before it, the spell's own trigger, only on instants and sorceries; fight, both powers first, the creatures' damage, none if either is gone; the credits.`);
