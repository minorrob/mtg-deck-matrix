/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, P4-REPLACEMENTS: WHAT A CREATURE WAS AS IT DIED (CR 603.10a, 608.2h, 603.4).
 *
 * A creature that dies is a new object in the graveyard (CR 400.7), with no counters and none of its changes. What a dies
 * trigger asks of it -- "if it had counters on it", "the number of counters it had", "with defender", "with lesser
 * toughness" -- is the snapshot taken as it left (rules/layers.mjs, lastKnown):
 *   - what the trigger is about carries that snapshot (`about.lastKnown`, rules/trigger.mjs) as it triggers, to its
 *     intervening "if" then (CR 603.4) and to its stack entry for when it resolves; a permanent's own death's condition is
 *     asked of it as it last existed too (Retched Wretch, Ambitious Augmenter);
 *   - `countersOn: "that card"` reads the snapshot's counters (script/amount.mjs: Felisa, Fang of Silverquill);
 *   - a departure's filter may ask `keywords` and `counters` (script/filter.mjs, matchesLastKnown: Rampart Architect);
 *   - a target's `toughness.lessThan: "that card"`, less than the snapshot's toughness (Colfenor, the Last Yew);
 *   - putCounter's `countersOf: "self"`, every kind its source had (Ambitious Augmenter), put on as counters are.
 * Here: a board wipe, the snapshot through a checkpoint, the keys alone, stolen and returned, two kinds of counters, the
 * compiler's refusals, four players.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {matchesLastKnown, compileSelector} from "../game/engine/script/filter.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
import {cardsIn} from "../game/engine/state/index.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {abilitiesOf} from "../game/engine/rules/layers.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {collectTriggers, openTriggers} from "../game/engine/rules/trigger.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const rng = createRng("lki-dies");
const FELISA = "Felisa, Fang of Silverquill", AUGMENTER = "Ambitious Augmenter", WRETCH = "Retched Wretch", ARCHITECT = "Rampart Architect", COLFENOR = "Colfenor, the Last Yew";
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Ogre: {types: ["Creature"], subtypes: ["Ogre"], manaCost: "{2}{R}", colors: ["R"], power: 3, toughness: 3},
  Elf: {types: ["Creature"], subtypes: ["Elf"], manaCost: "{G}", colors: ["G"], power: 1, toughness: 1},
  Post: {types: ["Creature"], subtypes: ["Wall"], manaCost: "{1}{W}", colors: ["W"], power: 0, toughness: 4, keywords: ["Defender"]},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, seats = 2) => runScenario({name: "lki-dies", seats, setup, steps: []}, index.definition, FIX).state;
const all = (s, name, seat = 0) => s.zones.battlefield.filter((id) => s.objects[id].card === name && s.objects[id].controller === seat);
const idOf = (s, name, seat = 0) => all(s, name, seat)[0];
/* Every trigger put on the stack and everything resolved, each question given its options in order. */
const settle = (s) => {
  for (let n = 0; n < 200 && (s.stack.length || s.awaiting || (s.pendingTriggers ?? []).length); n += 1) {
    if (s.awaiting) resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index));
    else if ((s.pendingTriggers ?? []).length) openTriggers(s);
    else passPriority(s, null, rng);
  }
};
/* What an effect did, read for triggers as the engine reads an action's events. */
const run = (s, effects, controller = 1) => { const events = runEffects(s, effects, {controller, source: null}); collectTriggers(s, events); return events; };
const destroy = (s, ids, controller = 1) => run(s, ids.map((id) => ({effect: "destroy", targets: [id]})), controller);

/* ---- a board wipe: each death its own trigger, each X its own counters, Felisa's among them ---- */
{
  const s = table([at(0, "battlefield", FELISA, "Bear", "Ogre", "Elf")]);
  s.objects[idOf(s, "Bear")].counters["+1/+1"] = 2;
  s.objects[idOf(s, "Ogre")].counters["-1/-1"] = 1;
  s.objects[idOf(s, FELISA)].counters["+1/+1"] = 1;
  run(s, [{effect: "destroyAll", selector: {what: "permanent", types: ["Creature"]}}]);
  eq((s.pendingTriggers ?? []).length, 3, "three of the four had counters: three triggers (Felisa sees her own death and theirs, CR 603.10a)");
  settle(s);
  eq(all(s, "Inkling").length, 4, "2 + 1 + 1 Inklings: each X the counters that creature had");
}
/* ---- the snapshot rides the stack entry, and reads back from a checkpoint ---- */
{
  const s = table([at(0, "battlefield", FELISA, "Bear")]);
  s.objects[idOf(s, "Bear")].counters["+1/+1"] = 3;
  destroy(s, [idOf(s, "Bear")]);
  openTriggers(s);
  const entry = s.stack.find((e) => e.kind === "trigger");
  eq([entry?.about?.lastKnown?.counters, entry?.about?.card !== undefined], [{"+1/+1": 3}, true], "the stack entry is about the card it became, and carries what it was");
  const copy = JSON.parse(JSON.stringify(s));
  eq(hashState(copy), hashState(s), "and a checkpoint of it reads back as the same game");
  settle(copy);
  eq(all(copy, "Inkling").length, 3, "resolved from the read-back state: three Inklings");
}

/* ---- the keys alone ---- */
{
  const was = {cardId: 9, controller: 0, types: ["Creature"], subtypes: ["Wall"], keywords: ["Defender", "Reach"], counters: {"+1/+1": 0, "-1/-1": 2}};
  eq([matchesLastKnown({keywords: ["Defender"]}, was), matchesLastKnown({keywords: ["Defender", "Flying"]}, was), matchesLastKnown({keywords: ["Reach"]}, {...was, keywords: undefined})],
    [true, false, false], "keywords: every one named, as it last had them");
  eq([matchesLastKnown({counters: "any"}, was), matchesLastKnown({counters: "-1/-1"}, was), matchesLastKnown({counters: "+1/+1"}, was), matchesLastKnown({counters: "any"}, {...was, counters: {"+1/+1": 0}})],
    [true, true, false, false], "counters: any kind, or the one named -- none of a kind is none");
  const about = {card: 77, lastKnown: was};
  eq([amountOf({objects: {}}, {countersOn: "that card", counter: "any"}, {about}), amountOf({objects: {}}, {countersOn: "that card", counter: "-1/-1"}, {about})], [2, 2],
    "countersOn that card: as it last existed");
}
{
  /* toughness.lessThan "that card": what the trigger is about, as it last existed; nothing known, nothing less. */
  const s = table([at(0, "graveyard", "Elf", "Ogre")]);
  const lesser = compileSelector({what: "card", zone: "graveyard", toughness: {lessThan: "that card"}});
  const [elf, ogre] = cardsIn(s, "graveyard", 0);
  eq([lesser(s, elf, {about: {lastKnown: {toughness: 3}}}), lesser(s, ogre, {about: {lastKnown: {toughness: 3}}}), lesser(s, elf, {about: {card: ogre}}), lesser(s, elf, {})],
    [true, false, false, false], "1 under 3 yes, 3 under 3 no; no snapshot, none");
  assert.throws(() => compileSelector({what: "card", toughness: {lessThan: "self"}}), /toughness.lessThan is "that card"/); checks += 1;
}

/* ---- Retched Wretch stolen: returned under its owner's control ---- */
{
  const s = table([at(0, "battlefield", WRETCH)]);
  const wretch = idOf(s, WRETCH);
  s.objects[wretch].controller = 1;
  s.objects[wretch].counters["-1/-1"] = 1;
  destroy(s, [wretch], 0);
  openTriggers(s);
  eq(s.stack.find((e) => e.kind === "trigger")?.playerId, 1, "Maya controlled it as it died: the trigger is hers");
  settle(s);
  const back = s.zones.battlefield.find((id) => s.objects[id].card === WRETCH);
  eq([s.objects[back]?.controller, abilitiesOf(s, back).length], [0, 0], "returned under Rob's control, its owner, with no abilities");
}

/* ---- Ambitious Augmenter: every kind it had, each put on as counters are ---- */
{
  const s = table([at(0, "battlefield", AUGMENTER, "Hardened Scales")]);
  s.objects[idOf(s, AUGMENTER)].counters = {"+1/+1": 2, charge: 1};
  destroy(s, [idOf(s, AUGMENTER)]);
  settle(s);
  eq(s.objects[idOf(s, "Fractal")]?.counters, {"+1/+1": 3, charge: 1}, "two +1/+1 and a charge counter: both kinds on the Fractal, Hardened Scales adding one more +1/+1");
}
{
  const problems = (effect) => compileScript({schema: "CrankCardScript@1",
    identity: {name: "Odd Augmenter", oracleId: "x", types: ["Creature"], subtypes: [], manaCost: "{G}", colors: ["G"], colorIdentity: ["G"], power: 1, toughness: 1},
    oracleText: "x", source: "hand", abilities: [{kind: "triggered", text: "x", trigger: {on: "dies"}, effects: [{effect: "putCounter", targets: "self", ...effect}]}]}).problems;
  eq(problems({countersOf: "self"}), [], "countersOf self compiles");
  for (const bad of [{countersOf: "remembered"}, {countersOf: "self", counter: "+1/+1"}, {countersOf: "self", count: 2}])
    ok(problems(bad).some((p) => p.includes("countersOf is \"self\"")), `and refuses ${JSON.stringify(bad)}`);
}

/* ---- Rampart Architect: a creature that had defender as it died, gained or printed ---- */
{
  const s = table([at(0, "battlefield", ARCHITECT, "Post", "Bear")]);
  /* The Bear given defender by an effect until end of turn: it had it as it died. */
  runEffects(s, [{effect: "pump", targets: [idOf(s, "Bear")], power: 0, toughness: 0, keywords: ["Defender"], until: "end-of-turn"}], {controller: 0, source: null});
  destroy(s, [idOf(s, "Bear"), idOf(s, "Post")]);
  eq(s.pendingTriggers.map((t) => t.source.name), [ARCHITECT, ARCHITECT], "the Post's printed defender and the Bear's given one: two triggers");
}

/* ---- Colfenor, four players: its controller's graveyard alone ---- */
{
  const s = table([at(0, "battlefield", COLFENOR, "Ogre"), at(0, "graveyard", "Elf"), at(1, "graveyard", "Elf"), at(2, "graveyard", "Bear"), at(3, "graveyard", "Elf")], 4);
  destroy(s, [idOf(s, "Ogre")]);
  openTriggers(s);
  const q = awaitingChoice(s);
  eq([s.awaiting.player, q.options.map((o) => o.label)], [0, ["Elf"]], "Rob's Elf alone: the others' graveyards are not his");
}

console.log(`engine-lki-dies: ${checks} checks passed -- a dies trigger reads what died as it last existed: counters had, kinds, defender, toughness; through a wipe, a checkpoint, a theft, two kinds, four seats.`);
