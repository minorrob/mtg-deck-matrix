/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (w2c-hands-triggers): "WHENEVER THIS CREATURE TRANSFORMS INTO ..." (CR 701.27e), AND MANA OF ONE COLOR.
 *
 * Ashling, Rekindled // Ashling, Rimebound: "whenever this creature enters or transforms into Ashling, Rekindled" and
 * "whenever this creature transforms into Ashling, Rimebound ... add two mana of any one color. Spend this mana only to cast
 * spells with mana value 4 or greater". The trigger `transformed` -- this permanent turning over (setState), `into` the face
 * it then has, by name (cards/index.mjs, rules/trigger.mjs); entering transformed is no transforming (CR 712.14a). And an
 * ability's "two mana of any one color", one color asked once (`oneColor`), carrying what it may pay for (CR 106.6;
 * script/resolution.mjs, effects/asking.mjs manaColors). What the scenarios cannot reach: the face each trigger watches for,
 * another permanent's transforming, entering transformed, the one question and the restricted mana it makes, what the
 * compiler refuses, and the catalog's credit.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const ASHLING = "Ashling, Rekindled // Ashling, Rimebound";
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
function table() {
  const s = createState({matchId: "m", seed: "transformed", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
/* What triggered on these events, by its text, its source's face as it now is. */
function triggeredBy(s, events) {
  s.pendingTriggers = [];
  collectTriggers(s, events);
  return s.pendingTriggers.map((t) => `${s.objects[t.source.cardId]?.card}: ${t.text.split(",")[0]}`);
}
const transform = (s, id) => runEffects(s, [{effect: "setState", targets: [id], transform: true}], {controller: 0, source: null});

{
  /* To the back: the back face's "transforms into Ashling, Rimebound" alone; to the front again: the front's alone. */
  const s = table();
  const ashling = on(s, card(ASHLING), 0);
  eq(triggeredBy(s, transform(s, ashling)), ["Ashling, Rimebound: Whenever this creature transforms into Ashling"], "into Rimebound: its own trigger");
  eq(triggeredBy(s, transform(s, ashling)), ["Ashling, Rekindled: Whenever this creature enters or transforms into Ashling"], "into Rekindled again: the front's");
  /* The face it watches for, read from the event: Rimebound's "into Ashling, Rimebound" does not see a turn into Rekindled. */
  const said = (to) => [{kind: "GameEventCardTransformed", data: {turn: s.turn, phase: s.phase, fields: {card: {cardId: ashling}, from: "x", to}}}];
  transform(s, ashling);
  eq([triggeredBy(s, said("Ashling, Rekindled")).length, triggeredBy(s, said("Ashling, Rimebound")).length], [0, 1], "into the face it names, and no other");
  transform(s, ashling);
  /* Another Ashling turning over into Rimebound, this one Rimebound too: only that one's. */
  transform(s, ashling);
  const other = on(s, card(ASHLING), 0);
  s.pendingTriggers = [];
  collectTriggers(s, transform(s, other));
  eq([s.objects[ashling].card, s.pendingTriggers.map((t) => t.source.cardId)], ["Ashling, Rimebound", [other]], "another's transforming triggers only that one");
}
{
  /* Put onto the battlefield transformed (CR 712.14a): no transforming, and no trigger. */
  const s = table();
  const dead = on(s, card(ASHLING), 0, "graveyard");
  const events = runEffects(s, [{effect: "moveZone", targets: [dead], to: "battlefield", transformed: true}], {controller: 0, source: null});
  const there = Object.values(s.objects).find((o) => o.zone === "battlefield" && o.card === "Ashling, Rimebound");
  eq([Boolean(there), triggeredBy(s, events)], [true, []], "back face up as it enters: nothing triggers");
}
{
  /* Two mana of any one color: one question, both of that color, kept beside the pool for spells of mana value 4 or more. */
  const s = table();
  beginResolution(s, [{effect: "addMana", anyColor: true, oneColor: true, count: 2, spendOnly: {spell: {manaValue: {min: 4}}}}], {controller: 0, source: null});
  const choice = awaitingChoice(s);
  eq([choice.title, choice.options.length], ["Add 2 mana of any one color", 5], "asked once, of five colors");
  resolveAwaiting(s, [choice.options.find((o) => o.label === "Blue").index]);
  eq([s.awaiting ?? null, (s.players[0].restrictedMana ?? []).map((m) => [m.key, m.spell?.manaValue?.min])], [null, [["U", 4], ["U", 4]]], "both blue, both for mana value 4 or more");
  /* Without `oneColor`: each its own question (Coalition Relic's, as before). */
  const t = table();
  beginResolution(t, [{effect: "addMana", anyColor: true, count: 2}], {controller: 0, source: null});
  resolveAwaiting(t, [0]);
  eq(t.awaiting?.effect, "manaColors", "the second still asked");
  resolveAwaiting(t, [3]);
  eq([t.players[0].manaPool.W, t.players[0].manaPool.R], [1, 1], "one of each color named");
}
{
  /* What the compiler refuses: "transforms into" names its face, and is this permanent's own; one color is for two or more. */
  const script = (trigger, effects = [{effect: "gainLife", amount: 1}]) => ({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Creature"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], power: 1, toughness: 1},
    oracleText: "Odd.", abilities: [{kind: "triggered", text: "Odd.", trigger, effects}]});
  const problems = (trigger, effects) => compileScript(script(trigger, effects)).problems;
  eq([problems({on: "transformed", into: "Odd"}).length, problems({on: "transformed"}).length > 0, problems({on: "transformed", who: "another", into: "Odd"}).length > 0], [0, true, true], "into a named face, this one's");
  const mana = (effect) => problems({on: "upkeep"}, [{effect: "addMana", anyColor: true, ...effect}]).filter((p) => p.startsWith("addMana: oneColor"));
  eq([mana({oneColor: true, count: 2}).length, mana({oneColor: true, count: 1}).length, mana({oneColor: true}).length, mana({oneColor: false, count: 2}).length], [0, 1, 1, 1], "one color: true, for two or more");
  const fixed = (effect) => problems({on: "upkeep"}, [{effect: "addMana", ...effect}]).filter((p) => p.startsWith("addMana: oneColor")).length;
  eq([fixed({oneColor: true, count: 2}), fixed({oneColor: true, count: 2, anyColor: true, mana: {R: 1}})], [1, 1], "of any color, not a mana named");
}
{
  eq(missingFor({apis: ["Draw", "SetState", "Mana"], triggers: ["ChangesZone", "Transformed", "Phase"]}).filter((m) => m.kind === "trigger"), [], "the catalog: Forge's Transformed is a trigger the engine builds");
}

console.log(`engine-transformed: ${checks} checks passed -- "transforms into" a face triggers that face's ability on this permanent's own transforming, never on entering transformed; two mana of one color is one question, kept for what it may pay for.`);
