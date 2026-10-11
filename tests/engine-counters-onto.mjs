/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, W2D: "YOU MAY MOVE ANY NUMBER OF +1/+1 COUNTERS FROM THIS CREATURE ONTO OTHER CREATURES" (Forgotten Ancient; CR
 * 122.5, 122.6, 616.1).
 *
 * moveCounters' `onto` and `anyNumber` (effects/asking.mjs, countersOnto): where each counter goes, its controller's choice
 * as it resolves, a counter at a time -- each permanent `onto` matches, or "No more" -- then all moved at once: off the
 * source in one change, onto each permanent in one placement, so "that many plus one" sees one placement on each. All or
 * nothing (CR 122.5): a destination gone moves nothing there, a source without that many moves nothing. Here: the
 * question, the moves, Hardened Scales, the guards, the schema and the house pilot.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {beginResolution, answerDeparted} from "../game/engine/script/resolution.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {moveObject} from "../game/engine/state/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const ANCIENT = "Forgotten Ancient";
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Relic: {types: ["Artifact"], subtypes: [], manaCost: "{2}", colors: []}};
const table = (setup) => runScenario({name: "counters-onto", setup, steps: []}, index.definition, FIX).state;
const idOf = (s, name, seat = 0) => s.zones.battlefield.find((id) => s.objects[id].card === name && s.objects[id].controller === seat);
const plus = (s, id) => s.objects[id].counters["+1/+1"] ?? 0;
const MOVE = {effect: "moveCounters", from: "self", counter: "+1/+1", anyNumber: true, onto: {what: "permanent", types: ["Creature"], another: true}};
const start = (s, n) => {
  const ancient = idOf(s, ANCIENT);
  s.objects[ancient].counters["+1/+1"] = n;
  const out = beginResolution(s, [MOVE], {controller: 0, source: ancient});
  return {ancient, out};
};
const choose = (s, label) => resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === label).index]);

{
  const s = table([{seat: 0, zone: "battlefield", cards: [ANCIENT, "Bear", "Relic"]}, {seat: 1, zone: "battlefield", cards: ["Bear"]}]);
  const {ancient} = start(s, 3);
  const q = awaitingChoice(s);
  eq([s.awaiting.player, q.mode, q.options.map((o) => o.label)], [0, "one", ["Bear (1)", "Bear (2)", "No more"]], "Rob is asked: the other creatures, both Bears told apart, or no more; not the Relic, not the Ancient");
  choose(s, "Bear (1)");
  eq([plus(s, ancient), awaitingChoice(s).title.includes("2 left; 1 chosen")], [3, true], "nothing moves until the last is chosen");
  choose(s, "Bear (2)");
  const events = resolveAwaiting(s, [0]);
  eq([plus(s, ancient), plus(s, idOf(s, "Bear")), plus(s, idOf(s, "Bear", 1)), s.awaiting], [0, 2, 1, null], "two onto Rob's Bear, one onto Maya's; the third and last ends it, unasked");
  eq(events.filter((e) => e.kind === "GameEventCardCounters").map((e) => [e.data.fields.oldValue, e.data.fields.newValue]), [[3, 0], [0, 2], [0, 1]],
    "off the Ancient at once, onto each Bear at once");
}
{
  /* Hardened Scales: one placement onto each -- two onto the Bear are three, one onto the Elk is two. */
  const s = table([{seat: 0, zone: "battlefield", cards: [ANCIENT, "Bear", "Hardened Scales"]}, {seat: 1, zone: "battlefield", cards: ["Bear"]}]);
  const {ancient} = start(s, 3);
  choose(s, "Bear (1)"); choose(s, "Bear (1)"); choose(s, "Bear (2)");
  eq([plus(s, ancient), plus(s, idOf(s, "Bear")), plus(s, idOf(s, "Bear", 1))], [0, 3, 1], "Rob's Bear gets three (two plus one), Maya's one (her own Scales it is not)");
}
{
  /* No more, at once: nothing moves. And invalid answers refused. */
  const s = table([{seat: 0, zone: "battlefield", cards: [ANCIENT, "Bear"]}]);
  const {ancient} = start(s, 2);
  let refused = 0;
  for (const bad of [[5], [0, 1], [], [-1]]) try { resolveAwaiting(s, bad); } catch { refused += 1; }
  eq(refused, 4, "an option not offered, two at once, none, a negative: each refused");
  choose(s, "No more");
  eq([plus(s, ancient), plus(s, idOf(s, "Bear")), s.awaiting], [2, 0, null], "no more: both stay");
}
{
  /* All or nothing (CR 122.5): a destination gone is skipped; a source without as many moves none. */
  const s = table([{seat: 0, zone: "battlefield", cards: [ANCIENT, "Bear"]}, {seat: 1, zone: "battlefield", cards: ["Bear"]}]);
  const {ancient} = start(s, 3);
  choose(s, "Bear (1)"); choose(s, "Bear (2)");
  moveObject(s, idOf(s, "Bear", 1), "graveyard", 1);
  choose(s, "No more");
  eq([plus(s, ancient), plus(s, idOf(s, "Bear"))], [2, 1], "Maya's Bear gone: one moved, onto Rob's");
  const t = table([{seat: 0, zone: "battlefield", cards: [ANCIENT, "Bear"]}]);
  const {ancient: a} = start(t, 2);
  choose(t, "Bear");
  t.objects[a].counters["+1/+1"] = 0;
  choose(t, "No more");
  eq([plus(t, a), plus(t, idOf(t, "Bear"))], [0, 0], "the Ancient's counters gone meanwhile: none moved");
}
{
  /* Nothing on it, or nothing to move them onto: nobody asked. Run directly, it refuses rather than deciding. */
  const s = table([{seat: 0, zone: "battlefield", cards: [ANCIENT]}]);
  eq(start(s, 2).out.status, "done", "no other creature: nothing asked");
  const t = table([{seat: 0, zone: "battlefield", cards: [ANCIENT, "Bear"]}]);
  eq(start(t, 0).out.status, "done", "no counter: nothing asked");
  let threw = false;
  try { runEffect(t, {...MOVE, from: [idOf(t, ANCIENT)]}, {controller: 0, source: idOf(t, ANCIENT)}); } catch (e) { threw = /asks where/.test(e.message); }
  ok(threw, "moveCounters onto chosen permanents, run directly, asks to be run through a resolution");
}

{
  /* Never onto the permanent they come off (CR 122.5), even where `onto` would take it in. */
  const s = table([{seat: 0, zone: "battlefield", cards: [ANCIENT, "Bear"]}]);
  const ancient = idOf(s, ANCIENT);
  s.objects[ancient].counters["+1/+1"] = 1;
  beginResolution(s, [{...MOVE, onto: {what: "permanent", types: ["Creature"]}}], {controller: 0, source: ancient});
  eq(awaitingChoice(s).options.map((o) => o.label), ["Bear", "No more"], "the Bear, not the Ancient itself");
  /* Rob, asked, leaves the game: the ability left with him (CR 800.4a), and nothing moves. */
  s.players[0].lost = true;
  answerDeparted(s);
  eq([s.awaiting, s.resolving, plus(s, ancient)], [null, null, 1], "Rob gone: no question, no resolution, the counter stays");
}

/* ---- the schema ---- */
const errors = (effect) => validateScript({schema: "CrankCardScript@1",
  identity: {name: "Odd Ancient", oracleId: "x", types: ["Creature"], subtypes: ["Elemental"], manaCost: "{G}", colors: ["G"], colorIdentity: ["G"], power: 0, toughness: 3},
  oracleText: "x", source: "hand", abilities: [{kind: "triggered", text: "x", trigger: {on: "upkeep"}, effects: [{effect: "moveCounters", from: "self", counter: "+1/+1", ...effect}]}]}).errors.map((e) => e.message);
{
  eq(errors({anyNumber: true, onto: {what: "permanent", types: ["Creature"]}}), [], "onto, any number, a kind named: valid");
  ok(errors({onto: {what: "permanent"}}).some((m) => m.includes("anyNumber: true")), "onto without anyNumber: refused");
  ok(errors({anyNumber: true, onto: {what: "permanent"}, count: 2}).some((m) => m.includes("anyNumber: true")), "onto with a count: refused");
  ok(errors({anyNumber: true, onto: {what: "permanent"}, targets: "self"}).some((m) => m.includes("`targets`, an object, or `onto`")), "onto and targets both: refused");
  ok(errors({anyNumber: true}).some((m) => m.includes("anyNumber goes with")), "anyNumber alone: refused");
  ok(errors({anyNumber: true, onto: {what: "permanent"}, counter: "chosen"}).some((m) => m.includes("anyNumber: true")), "onto, of a kind its controller chooses: refused");
  ok(errors({anyNumber: true, onto: {what: "permanent", flavor: true}}).length > 0, "an onto the selector grammar does not know: refused");
}

/* ---- the house pilot: onto its own creature, else no more ---- */
{
  const pilot = housePilot({seat: 0, cards: index.definition});
  const s = table([{seat: 0, zone: "battlefield", cards: [ANCIENT, "Bear"]}, {seat: 1, zone: "battlefield", cards: ["Bear"]}]);
  start(s, 1);
  const q = awaitingChoice(s);
  eq(q.options[pilot.answer(projectFor(s, 0), q).indices[0]].cardId, idOf(s, "Bear"), "its own Bear, not Maya's");
  const t = table([{seat: 0, zone: "battlefield", cards: [ANCIENT]}, {seat: 1, zone: "battlefield", cards: ["Bear"]}]);
  start(t, 1);
  const r = awaitingChoice(t);
  eq(r.options[pilot.answer(projectFor(t, 0), r).indices[0]].label, "No more", "only Maya's creature: no more");
}

console.log(`engine-counters-onto: ${checks} checks passed -- "move any number of counters onto other creatures": a counter at a time, then all at once, one placement each; all or nothing; refused when wrong.`);
