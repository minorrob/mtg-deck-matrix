/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {play, at, later} from "./helpers/x11-keywords.mjs";
import {cardsIn} from "../game/engine/state/index.mjs";
import {beginResolution, answerResolution, resolutionChoice} from "../game/engine/script/resolution.mjs";
import {draw} from "../game/engine/script/effects/zones.mjs";

// A removed replacement-history guard can loop before resolution returns to the test.
// Keep that mutation observable as a bounded failure without changing the engine's behavior.
if (!process.argv.includes("--draw-worker")) {
  const child = spawnSync(process.execPath, ["--stack-size=4000", fileURLToPath(import.meta.url), "--draw-worker"],
    {encoding: "utf8", timeout: 15000, maxBuffer: 2 * 1024 * 1024});
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.error) console.error(child.error.message);
  process.exit(child.error || child.status !== 0 ? 1 : 0);
}

let checks = 0;
/* Synchronous callers still need the same instruction arithmetic. These cases make no claim that their outstanding
   replacement-choice continuation debt is closed; one controller's equivalent sources give the same result here. */
for (const count of [1, 2]) for (const collectors of [1, 2]) {
  const s = play([at(0, "battlefield", "Teferi's Ageless Insight"),
    at(1, "battlefield", ...Array(collectors).fill("Alms Collector"))], [], {seats: 3});
  const before = s.players.map((_, p) => cardsIn(s, "hand", p).length);
  draw(s, {count}, {controller: 0});
  assert.deepEqual(s.players.map((_, p) => cardsIn(s, "hand", p).length - before[p]),
    count === 1 ? [1, 1, 0] : collectors === 1 ? [2, 1, 0] : [1, 2, 0],
    "direct calls reconsider modified instructions and retain used-source history"); checks++;
}
for (const dredge of [false, true]) for (const count of [1, 2]) {
  let s = play([at(0, "battlefield", "Teferi's Ageless Insight"), at(1, "battlefield", "Alms Collector"),
    ...(dredge ? [later(0, "graveyard", "Life from the Loam")] : [])], [], {seats: 3});
  const before = s.players.map((_, p) => cardsIn(s, "hand", p).length);
  beginResolution(s, [{effect: "draw", count}], {controller: 0});
  for (let n = 0; s.awaiting && n < 20; n++) {
    const choice = resolutionChoice(s, s.awaiting);
    const pick = choice.options.find(o => /^Draw/.test(o.label)) ?? choice.options[0];
    s = JSON.parse(JSON.stringify(s));
    answerResolution(s, [pick.index]);
  }
  assert.equal(s.resolving, null, "the replacement chain finishes after persisted answers"); checks++;
  assert.deepEqual(s.players.map((_, p) => cardsIn(s, "hand", p).length - before[p]),
    count === 1 ? [1, 1, 0] : [2, 1, 0],
    `draw ${count}, dredge ${dredge}: a newly doubled instruction meets Collector; a used Collector cannot apply again`); checks++;
}
{
  let s = play([at(0, "battlefield", "Teferi's Ageless Insight"),
    at(1, "battlefield", "Alms Collector", "Alms Collector"), later(0, "graveyard", "Life from the Loam")], [], {seats: 3});
  const before = s.players.map((_, p) => cardsIn(s, "hand", p).length);
  beginResolution(s, [{effect: "draw", count: 2}], {controller: 0});
  const choice = resolutionChoice(s, s.awaiting);
  assert.equal(choice.options.length, 2, "two separate replacement sources remain separately selectable"); checks++;
  assert.equal(new Set(choice.options.map(o => o.cardId)).size, 2, "each option identifies its actual Collector"); checks++;
  let collectorQuestions = 0;
  for (let n = 0; s.awaiting && n < 20; n++) {
    const q = resolutionChoice(s, s.awaiting), pick = q.options.find(o => /^Draw/.test(o.label)) ?? q.options[0];
    if (/whose replacement/.test(q.title)) collectorQuestions++;
    s = JSON.parse(JSON.stringify(s)); answerResolution(s, [pick.index]);
  }
  assert.equal(s.resolving, null); checks++;
  assert.equal(collectorQuestions, 1, "the previously used Collector is not offered again beside the sole unused one"); checks++;
  assert.deepEqual(s.players.map((_, p) => cardsIn(s, "hand", p).length - before[p]), [1, 2, 0],
    "the unused second Collector can apply to the doubled descendant; the first cannot"); checks++;
}
for (const collector of [1, 2]) {
  let s = play([at(0, "battlefield", "Teferi's Ageless Insight"), at(1, "battlefield", "Alms Collector"),
    at(2, "battlefield", "Alms Collector")], [], {seats: 3});
  const before = s.players.map((_, p) => cardsIn(s, "hand", p).length), life = s.players[0].life;
  beginResolution(s, [{effect: "draw", who: [2], count: 1}, {effect: "draw", count: 1, remember: true},
    {effect: "gainLife", amount: {rememberedCount: true}}], {controller: 0});
  assert.equal(s.awaiting?.effect, "orderDraws", "without dredge, the modified instruction still asks which Collector applies"); checks++;
  assert.deepEqual(s.players.map((_, p) => cardsIn(s, "hand", p).length), before.map((n, p) => n + (p === 2 ? 1 : 0)),
    "the current instruction has not drawn; the completed prior instruction remains recorded"); checks++;
  const q = resolutionChoice(s, s.awaiting);
  s = JSON.parse(JSON.stringify(s)); answerResolution(s, [q.options.find(o => o.player === collector).index]);
  assert.deepEqual(s.players.map((_, p) => cardsIn(s, "hand", p).length - before[p]),
    collector === 1 ? [1, 1, 1] : [1, 0, 2], "the player-selected Collector receives its draw"); checks++;
  assert.equal(s.players[0].life, life + 2, "split draw instructions preserve the existing remembered-card result for the next effect"); checks++;
}
{
  const s = play([at(0, "battlefield", "Teferi's Ageless Insight"), at(1, "battlefield", "Narset, Parter of Veils"),
    at(2, "battlefield", "Alms Collector")], [], {seats: 3});
  s.players[0].drawnThisTurn = 1;
  const before = s.players.map((_, p) => cardsIn(s, "hand", p).length);
  beginResolution(s, [{effect: "draw", count: 1}], {controller: 0});
  assert.equal(s.awaiting, null, "an impossible draw has no replacement-order question"); checks++;
  assert.deepEqual(s.players.map((_, p) => cardsIn(s, "hand", p).length), before); checks++;
}
{
  const s = play([at(0, "battlefield", "Laboratory Maniac", "Teferi's Ageless Insight")], [], {seats: 3});
  s.zones.library[0] = [];
  beginResolution(s, [{effect: "draw", count: 1}], {controller: 0});
  const q = resolutionChoice(s, s.awaiting);
  assert.ok(q.options.some(o => o.label === "Win the game instead"), "the empty-draw replacement remains a player's alternative to doubling"); checks++;
  assert.ok(q.options.some(o => o.label === "Draw 2 cards instead")); checks++;
  answerResolution(s, [q.options.find(o => o.label === "Win the game instead").index]);
  assert.equal(s.players[0].won, true); checks++;
}
{
  let s = play([at(0, "battlefield", "Teferi's Ageless Insight", "Smoke Triple Draw"), at(1, "battlefield", "Alms Collector")], [], {seats: 3},
    {"Smoke Triple Draw": {types: ["Enchantment"], abilities: [{id: "triple", kind: "static", rule: "draws-more", affects: {who: "you"}, count: 3}]}});
  const before = s.players.map((_, p) => cardsIn(s, "hand", p).length);
  beginResolution(s, [{effect: "draw", count: 1}], {controller: 0});
  const q = resolutionChoice(s, s.awaiting);
  assert.deepEqual(q.options.map(o => o.label).sort(), ["Draw 2 cards instead", "Draw 3 cards instead"],
    "two mandatory replacements remain a real choice even without dredge"); checks++;
  s = JSON.parse(JSON.stringify(s)); answerResolution(s, [q.options.find(o => o.label === "Draw 3 cards instead").index]);
  assert.equal(s.resolving, null); checks++;
  assert.deepEqual(s.players.map((_, p) => cardsIn(s, "hand", p).length - before[p]), [2, 1, 0],
    "choosing the tripler first leaves the doubler for the Collector's descendant draw"); checks++;
}
console.log(`engine-draw-instructions: ${checks} checks passed`);
