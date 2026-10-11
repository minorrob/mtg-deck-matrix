/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, W2D: "FOR AS LONG AS THAT LAND HAS A BLIGHT COUNTER ON IT, IT LOSES ALL LAND TYPES AND ABILITIES AND HAS '{T}: ADD
 * {C}.'" (Ultima, Origin of Oblivion; CR 611.2b, 205.3i, 613.1d, 613.1f).
 *
 *   1. effectUntil's `whileCounter` for a layer's effect (effects/permanents.mjs): the layers apply it to an object only
 *      while it has a counter of that kind (rules/layers.mjs); and once it has none, the effect ends for it for good -- the
 *      next time the game is checked (rules/sba.mjs, endCounterDurations) -- so a counter put on again does not bring it
 *      back. A rule changed for a while (Promise of Loyalty's "can't attack") is left as it reads its counter.
 *   2. `removeLandTypes` (layer 4): every land type gone (CR 205.3i), a land creature's creature types kept.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {subtypesOf, abilitiesOf} from "../game/engine/rules/layers.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {selectMatching} from "../game/engine/script/filter.mjs";
import {isLandType} from "../game/engine/keywords/types.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const FIX = {Arbor: {types: ["Land", "Creature"], subtypes: ["Forest", "Dryad"], manaCost: null, colors: ["G"], power: 1, toughness: 1}};
const table = (setup) => runScenario({name: "counter-duration", setup, steps: []}, index.definition, FIX).state;
const idOf = (s, name) => s.zones.battlefield.find((id) => s.objects[id].card === name);
const ultima = (s) => s.objects[idOf(s, "Ultima, Origin of Oblivion")].abilities.find((a) => a.kind === "triggered" && a.trigger?.who === "self").effects;
const blight = (s, id) => beginResolution(s, ultima(s), {controller: 0, source: idOf(s, "Ultima, Origin of Oblivion"), targets: [{kind: "object", id}]});
const mana = (s, id) => abilitiesOf(s, id).filter((a) => a.kind === "mana").map((a) => JSON.stringify(a.produces));
const blights = (s) => (s.effects ?? []).filter((e) => e.whileCounter === "blight");

{
  /* A Forest blighted: no land type -- "Forests you control" no longer counts it -- and {C}, not {G}. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Ultima, Origin of Oblivion"]}, {seat: 1, zone: "battlefield", cards: ["Forest", "Arbor"]}]);
  const forest = idOf(s, "Forest"), arbor = idOf(s, "Arbor");
  eq([subtypesOf(s, forest), mana(s, forest)], [["Forest"], ['{"G":1}']], "before: a Forest, tapping for {G}");
  blight(s, forest);
  eq([subtypesOf(s, forest), mana(s, forest), s.objects[forest].counters.blight], [[], ['{"C":1}'], 1], "after: no land type, {T}: Add {C}, a blight counter");
  eq(selectMatching(s, {what: "permanent", subtypes: ["Forest"], controller: 1}, {controller: 1}), [arbor], "\"Forests\" no longer finds it");
  /* A land creature loses its land types, and keeps its creature types. */
  blight(s, arbor);
  eq(subtypesOf(s, arbor), ["Dryad"], "the Arbor is a Dryad still, and no Forest");
}
{
  /* Removed: not applied at once, and over for good as the game is checked -- a counter put on again brings nothing back. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Ultima, Origin of Oblivion", "Forest"]}]);
  const forest = idOf(s, "Forest");
  blight(s, forest);
  eq(blights(s).length, 2, "two effects, its two layers, while the counter is there");
  runEffects(s, [{effect: "removeCounter", targets: [forest], counter: "blight", count: 1}], {controller: 0, source: null});
  eq([subtypesOf(s, forest), mana(s, forest)], [["Forest"], ['{"G":1}']], "the counter gone: a Forest again, at once");
  checkStateBasedActions(s);
  eq(blights(s).length, 0, "and the effects over, once the game is checked");
  runEffects(s, [{effect: "putCounter", targets: [forest], counter: "blight", count: 1}], {controller: 0, source: null});
  eq([subtypesOf(s, forest), mana(s, forest)], [["Forest"], ['{"G":1}']], "a blight counter put on again does not bring them back (CR 611.2b)");
}
{
  /* An effect on two objects ends for the one with no counter, and goes on for the other. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Forest", "Island"]}]);
  const [forest, island] = ["Forest", "Island"].map((n) => idOf(s, n));
  for (const id of [forest, island]) s.objects[id].counters.blight = 1;
  runEffects(s, [{effect: "effectUntil", targets: [forest, island], layer: 4, apply: {removeLandTypes: true}, until: "ever", whileCounter: "blight"}], {controller: 0, source: null});
  s.objects[forest].counters.blight = 0;
  checkStateBasedActions(s);
  eq([blights(s).map((e) => e.affects.ids), subtypesOf(s, forest), subtypesOf(s, island)], [[[island]], ["Forest"], []], "the Island still, the Forest no longer");
}
{
  /* A rule changed while a counter is there (Promise of Loyalty's vow counters) is read where it is asked, and left here. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Forest"]}]);
  runEffects(s, [{effect: "effectUntil", rule: "cant-attack", targets: [idOf(s, "Forest")], defender: "you", whileCounter: "vow", until: "ever"}], {controller: 0, source: null});
  checkStateBasedActions(s);
  eq((s.effects ?? []).filter((e) => e.whileCounter === "vow").length, 1, "the can't-attack rule is not ended here");
  eq(["Forest", "Island", "Locus", "Urza's", "Dryad", "Equipment"].map(isLandType), [true, true, true, true, false, false], "the land types, and not others");
}

/* ---- the compiler ---- */
const compiled = (effect) => compileScript({schema: "CrankCardScript@1",
  identity: {name: "Odd God", oracleId: "x", types: ["Creature"], subtypes: ["God"], manaCost: "{5}", colors: [], colorIdentity: [], power: 4, toughness: 4},
  oracleText: "x", source: "hand", abilities: [{kind: "triggered", text: "x", trigger: {on: "attacks", who: "self"}, targets: [{what: "permanent", types: ["Land"]}],
    effects: [{effect: "effectUntil", targets: {target: 0}, until: "ever", whileCounter: "blight", ...effect}]}]});
{
  eq(compiled({layer: 4, apply: {removeLandTypes: true}}).problems, [], "removeLandTypes in layer 4 compiles");
  ok(compiled({layer: 6, apply: {removeLandTypes: true}}).problems.some((p) => p.includes("removeLandTypes is true, in layer 4")), "in another layer, refused");
  ok(compiled({layer: 4, apply: {removeLandTypes: "yes"}}).problems.some((p) => p.includes("removeLandTypes is true")), "anything but true, refused");
  ok(compiled({layer: 4, apply: {removeLandTypes: true}, until: "end-of-turn"}).problems.some((p) => p.includes("whileCounter")), "a counter's duration with another end, refused");
  ok(compiled({layer: 4, apply: {removeLandTypes: true}, whileCounter: ""}).problems.some((p) => p.includes("whileCounter")), "no kind of counter, refused");
  ok(compiled({layer: 4, apply: {removeLandTypes: true}, targets: undefined, selector: {what: "permanent", types: ["Land"]}}).problems.some((p) => p.includes("whileCounter")),
    "on what a selector finds rather than its targets, refused");
}

console.log(`engine-counter-duration: ${checks} checks passed -- "for as long as it has a blight counter": applied while it does, over for good once it does not; every land type lost, the compiler holding both.`);
