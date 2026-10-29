/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {commanderPool, scorePool, dealPoolLanes, loadScopeFilter} from "../tools/library-engine-pool.mjs";

let checks = 0;
const eq = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const normal = (name, more = {}) => ({name, type: "Creature — Bear", layout: "normal", ...more});
{
  const oracle = {cards: [normal("Unwritten"), normal("Written"), normal("Banned"), normal("Face", {layout: "transform"}),
    normal("Basic", {type: "Basic Land — Forest"}), normal("Token", {type: "Token Creature — Bear"}),
    normal("Scheme", {type: "Scheme"}), normal("Unwritten")]};
  eq(commanderPool(oracle, new Set(["Banned"]), (name) => name === "Written").map((c) => c.name), ["Unwritten", "Face"],
    "the compiler's undefined universe: banned, nondeck and final cards excluded; faces included, canonical names once");
}
const unknown = (name, gaps, theme = "mana") => ({name, gaps, theme, compiler: "unknown", tier: "unloaded"});
{
  const scope = {schema: "CrankCardLoadScope@1", share: 0.95, count: 3,
    cards: [{name: "Front // Back"}, {name: "Included candidate"}, {name: "Wish", exempt: "not playable"}]};
  const included = loadScopeFilter(scope, (name) => name === "Front" ? "Front // Back" : name);
  const rows = [unknown("Front", ["Shared."]), unknown("Least played", ["Shared."]),
    {name: "Included candidate", tier: "candidate", theme: "mana"}, {name: "Excluded candidate", tier: "candidate", theme: "mana"}, unknown("Wish", ["Shared."])];
  const lanes = dealPoolLanes(scorePool(rows.filter((c) => included(c.name))), {laneSize: 2,
    themes: [["mana", "Mana"]], themeOf: (c) => c.theme});
  eq(lanes.flatMap((l) => l.cards).map((c) => c.name), ["Front"], "library aliases enter only through the included full card identity");
  eq(lanes.flatMap((l) => l.review).map((c) => c.name), ["Included candidate"], "excluded and exempt names never enter promotion reviews");
  eq(lanes[0].cards[0].potentialCompletions, 1, "outside-scope cards cannot inflate sentence reuse priority");
  eq(loadScopeFilter(null)("Least played"), true, "the explicit full-pool diagnostic remains available");
  for (const invalid of [{...scope,share:0.8}, {...scope,count:2}, {...scope,cards:[{name:"Front"},{name:"Front"},{name:"Wish"}]}, {...scope,schema:"other"}]) {
    assert.throws(() => loadScopeFilter(invalid), /valid frozen/); checks++;
  }
}
{
  const rows = scorePool([unknown("Shared 1", ["Add  one mana."]), unknown("Shared 2", ["Add one mana."]),
    unknown("Shared 3", ["Add one mana."]), unknown("Rare", ["Rare sentence."]), unknown("Two gaps", ["Add one mana.", "Rare sentence."])]);
  eq(rows.find((c) => c.name === "Shared 1").potentialCompletions, 3, "only complete one-gap cards count toward estimated sentence gain");
  eq(rows.find((c) => c.name === "Two gaps").potentialPerSentence, 2, "two sentences divide the four potential completions by writing effort");
  eq(rows.find((c) => c.name === "Shared 1").sentencesNeeded, 1, "each lane reports its writing effort");
  eq(scorePool(Array.from({length: 45}, (_, n) => unknown(`Card ${n}`, [`Sentence ${n}.`]))).every((c) => c.potentialCompletions === 1), true,
    "sentence priority covers the entire pool, beyond the compiler report's default top forty");
}
{
  const rows = scorePool([unknown("Low", ["Rare."]), unknown("High 1", ["Shared."]), unknown("High 2", ["Shared."]),
    unknown("Face", ["Face gap."], "faces"), {name: "Review Only", theme: "stack", tier: "candidate"}]);
  const lanes = dealPoolLanes(rows, {laneSize: 2, themeOf: (c) => c.theme,
    themes: [["faces", "Faces"], ["walkers", "Walkers"], ["stack", "Stack"], ["mana", "Mana"]], rides: {faces: "walkers"}});
  eq(lanes.flatMap((l) => [...l.cards, ...l.review]).map((c) => c.name).sort(), rows.map((c) => c.name).sort(), "every undefined row dealt exactly once");
  eq(lanes.every((l) => l.cards.length + l.review.length <= 2), true, "the lane-size limit includes both writes and reviews");
  eq(lanes.filter((l) => l.theme === "mana").flatMap((l) => l.cards).map((c) => c.name), ["High 1", "High 2", "Low"],
    "the first mana lane writes the sentence shared by more undefined cards");
  eq(lanes.find((l) => l.review.length)?.theme, "stack", "a candidate-only theme gets its own lane, never another role");
  eq(lanes.find((l) => l.cards.some((c) => c.name === "Face"))?.theme, "walkers", "explicit theme rides still apply");
  eq(new Set(lanes.map((l) => l.id)).size, lanes.length, "lane identities are unique");
  for (const laneSize of [0, -1, 1.5, Infinity]) {
    assert.throws(() => dealPoolLanes(rows, {laneSize, themes: [["mana", "Mana"]], themeOf: () => "mana"}), /lane size/); checks++;
  }
  assert.throws(() => dealPoolLanes(rows, {themes: [["a", "A"], ["b", "B"]], rides: {a: "b", b: "a"}, themeOf: () => "a"}), /cycle/); checks++;
}
console.log(`library-engine-pool: ${checks} checks passed — the whole undefined Commander pool, sentence reuse first, each theme and name once.`);
