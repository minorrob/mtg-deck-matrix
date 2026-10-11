/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "PUT ZACK FAIR'S COUNTERS ON THAT CREATURE AND ATTACH AN EQUIPMENT THAT WAS ATTACHED TO ZACK FAIR TO THAT CREATURE" (Zack
 * Fair; Train C phase 2, w3-last; CR 608.2h, 400.7, 701.3a).
 *
 * chooseCard's `among: "was attached to this"` (script/effects/asking.mjs): among what was attached to the ability's source
 * as it last existed -- sacrificed as the cost, read from the snapshot the activation took (rules/actions.mjs, rules/
 * stack.mjs) -- each still on the battlefield and still the object it was there (CR 400.7), of the kind the selector says
 * ("an Equipment", not an Aura), one chosen when several; then `attach` moves the one chosen (`source: "remembered"`). The
 * counters are putCounter's `countersOf: "self"`, each kind as many as it had. The card scenarios play Zack Fair; this suite
 * holds the edges: what may be chosen, a source still there, the question and its answers, the house pilot, the compiler.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {lastKnown} from "../game/engine/rules/layers.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Squire: {types: ["Creature"], subtypes: ["Human"], manaCost: "{W}", colors: ["W"], power: 1, toughness: 1},
};
const table = (setup) => runScenario({name: "was-attached", setup, steps: []}, index.definition, FIX).state;
const idOf = (s, name, seat = 0) => s.zones.battlefield.find((id) => s.objects[id].card === name && s.objects[id].controller === seat);
const hang = (s, item, host) => { runEffect(s, {effect: "attach", source: item, targets: [host]}, {controller: 0, source: item}); };
const CHOOSE = {effect: "chooseCard", zone: "battlefield", among: "was attached to this", selector: {subtypes: ["Equipment"]}, to: "stay", remember: true};
const ZACKS = (target) => [CHOOSE, {effect: "attach", source: "remembered", targets: [target]}];
/* The Squire sacrificed as a cost: its snapshot taken, and it gone (rules/actions.mjs, an ability that leaves its source). */
const sacrifice = (s, id) => { const was = lastKnown(s, id); moveOne(s, id, "graveyard", []); return was; };
const attachedTo = (s, item) => s.objects[item]?.attachedTo ?? null;

/* ---- among what was attached to it ---- */
{
  const s = table([{seat: 0, zone: "battlefield", cards: ["Squire", "Bear", "Swiftfoot Boots", "Goldvein Pick", "Explorer's Scope"]}, {seat: 0, zone: "hand", cards: ["Aqueous Form"]}]);
  const squire = idOf(s, "Squire"), bear = idOf(s, "Bear"), boots = idOf(s, "Swiftfoot Boots"), pick = idOf(s, "Goldvein Pick");
  hang(s, boots, squire); hang(s, pick, squire);
  /* And an Aura put onto the battlefield, enchanting the Squire (the first creature it can). In a game the state-based
     actions would put it into the graveyard once the Squire is gone (CR 704.5m); none have been checked here, so it is still
     on the battlefield to show that "an Equipment" keeps it out. */
  const aura = moveOne(s, s.zones.hand[0].find((id) => s.objects[id].card === "Aqueous Form"), "battlefield", []);
  const was = sacrifice(s, squire);
  eq([was.attachments.map((id) => s.objects[id].card).sort(), s.objects[aura].zone], [["Aqueous Form", "Goldvein Pick", "Swiftfoot Boots"], "battlefield"],
    "the Squire as it last existed: the Boots, the Pick and the Aura attached to it");
  beginResolution(s, ZACKS(bear), {controller: 0, source: null, lastKnown: was});
  const q = awaitingChoice(s);
  eq([s.awaiting.player, q.min, q.max, q.options.map((o) => o.label).sort()], [0, 1, 1, ["Goldvein Pick", "Swiftfoot Boots"]],
    "Rob is asked for one: the two Equipment that were on the Squire -- not the Aura, not the Scope that never was");
  resolveAwaiting(s, [q.options.find((o) => o.label === "Goldvein Pick").index]);
  eq([attachedTo(s, pick), attachedTo(s, boots) === null || s.objects[attachedTo(s, boots)] === undefined, s.objects[bear].attachments], [bear, true, [pick]],
    "the Pick attached to the Bear; the Boots stay where they are, unattached");
}
{
  /* One left the battlefield and came back: a new object (CR 400.7), not what was attached. One moved elsewhere since is. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Squire", "Bear", "Bear", "Swiftfoot Boots", "Goldvein Pick"]}]);
  const squire = idOf(s, "Squire"), [bear, other] = s.zones.battlefield.filter((id) => s.objects[id].card === "Bear");
  const boots = idOf(s, "Swiftfoot Boots"), pick = idOf(s, "Goldvein Pick");
  hang(s, boots, squire); hang(s, pick, squire);
  const was = sacrifice(s, squire);
  moveOne(s, moveOne(s, boots, "hand", []), "battlefield", []);
  hang(s, pick, other);
  beginResolution(s, ZACKS(bear), {controller: 0, source: null, lastKnown: was});
  eq(awaitingChoice(s).options.map((o) => o.label), ["Goldvein Pick"], "the Boots bounced and replayed are a new object, not offered; the Pick, re-equipped to the other Bear since, still is");
  resolveAwaiting(s, [0]);
  eq([attachedTo(s, pick), s.objects[other].attachments], [bear, []], "chosen, it moves from the other Bear to this one");
}
{
  /* Nothing that was attached, or nothing left of it: nothing to choose, nobody asked, and the attach does nothing. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Squire", "Bear", "Swiftfoot Boots"]}]);
  const squire = idOf(s, "Squire"), bear = idOf(s, "Bear"), boots = idOf(s, "Swiftfoot Boots");
  hang(s, boots, squire);
  const was = sacrifice(s, squire);
  moveOne(s, boots, "graveyard", []);
  eq([beginResolution(s, ZACKS(bear), {controller: 0, source: null, lastKnown: was}).status, s.objects[bear].attachments], ["done", []], "the Boots destroyed meanwhile: nothing asked, nothing attached");
  const t = table([{seat: 0, zone: "battlefield", cards: ["Squire", "Bear"]}]);
  const bare = sacrifice(t, idOf(t, "Squire"));
  eq(beginResolution(t, ZACKS(idOf(t, "Bear")), {controller: 0, source: null, lastKnown: bare}).status, "done", "nothing was ever attached: nothing asked");
}
{
  /* Its source still on the battlefield has no last known state to read: "was attached" names nothing. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Squire", "Bear", "Swiftfoot Boots"]}]);
  const squire = idOf(s, "Squire"), bear = idOf(s, "Bear"), boots = idOf(s, "Swiftfoot Boots");
  hang(s, boots, squire);
  eq([beginResolution(s, ZACKS(bear), {controller: 0, source: squire}).status, attachedTo(s, boots)], ["done", squire], "the source still there: nothing asked, the Boots stay on the Squire");
}

/* ---- the whole ability, through the rules: what the cost's sacrifice left to read ---- */
{
  const steps = [{tap: "Plains"}, {cast: "Zack Fair"}, {resolve: true}, {tap: "Wastes"}, {activate: "Swiftfoot Boots", targets: [{card: "Zack Fair"}]}, {resolve: true},
    {tap: "Wastes"}, {activate: "Zack Fair", targets: [{card: "Bear"}]}];
  const s = runScenario({name: "Zack", setup: [{seat: 0, zone: "battlefield", cards: ["Plains", "Wastes", "Wastes", "Swiftfoot Boots", "Bear"]}, {seat: 0, zone: "hand", cards: ["Zack Fair"]}], steps},
    index.definition, FIX).state;
  const entry = s.stack[s.stack.length - 1];
  eq([entry.name, entry.lastKnown?.counters, entry.lastKnown?.attachments.map((id) => s.objects[id].card)], ["Zack Fair", {"+1/+1": 1}, ["Swiftfoot Boots"]],
    "on the stack, Zack sacrificed: his counters and his Equipment as he last existed");
  const pilot = housePilot({seat: 0, cards: index.definition});
  for (let n = 0; n < 20 && !s.awaiting; n += 1) passPriority(s, null);
  const q = awaitingChoice(s);
  eq(q.options.map((o) => o.label), ["Swiftfoot Boots"], "resolving: the Boots, to be chosen");
  const answer = pilot.answer(projectFor(s, 0), q);
  resolveAwaiting(s, answer.indices);
  const bear = idOf(s, "Bear");
  eq([s.objects[bear].attachments.map((id) => s.objects[id].card), s.objects[bear].counters["+1/+1"]], [["Swiftfoot Boots"], 1], "the house pilot answers it: the Boots and the counter on the Bear");
}

/* ---- the compiler ---- */
{
  const script = (choose) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Creature"], manaCost: "{W}", colors: ["W"], power: 1, toughness: 1},
    oracleText: "Sacrifice this creature: Attach an Equipment that was attached to it to target creature you control.", source: "hand",
    abilities: [{kind: "activated", text: "Sacrifice this creature: Attach an Equipment that was attached to it to target creature you control.", cost: [{atom: "sacrifice", self: true}],
      targets: [{what: "permanent", types: ["Creature"], controller: "you"}], effects: [{effect: "chooseCard", selector: {subtypes: ["Equipment"]}, to: "stay", remember: true, ...choose},
        {effect: "attach", source: "remembered", targets: {target: 0}}]}]});
  eq(compileScript(script({zone: "battlefield", among: "was attached to this"})).problems, [], "among what was attached to it, on the battlefield: compiles");
  ok(compileScript(script({zone: "graveyard", among: "was attached to this"})).problems.some((p) => p.includes("among")), "in a graveyard: refused, it names permanents");
  ok(compileScript(script({zone: "battlefield", among: "attached"})).problems.some((p) => p.includes("among")), "an among the engine does not read: refused, never taken for a search");
  eq(compileScript(script({zone: "battlefield", among: "remembered"})).problems, [], "the others still compile");
}
ok(index.resolve("Zack Fair")?.playable === true, "Zack Fair is defined and playable");

console.log(`engine-was-attached: ${checks} checks passed -- "an Equipment that was attached to" a sacrificed source: what it had as it last existed, still the same objects, one chosen, attached; its counters every kind.`);
