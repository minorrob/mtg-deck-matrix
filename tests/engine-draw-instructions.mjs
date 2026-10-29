/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {play, at, later} from "./helpers/x11-keywords.mjs";
import {cardsIn} from "../game/engine/state/index.mjs";
import {beginResolution, answerResolution, resolutionChoice} from "../game/engine/script/resolution.mjs";

let checks = 0;
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
console.log(`engine-draw-instructions: ${checks} checks passed`);
