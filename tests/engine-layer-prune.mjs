/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE DEPENDENCY ORDER WITHOUT THE TRIALS THAT CANNOT FIND ONE (game/engine/rules/layers.mjs, mayDepend and independent).
 *
 * CR 613.8a: an effect depends on another in its layer when applying the other would change what it applies to or what it
 * does. The layers find out by trial -- apply one, see whether the other moves -- for every pair in the layer, for every
 * object, every derivation. On a crowded board that was nearly all the work: the first G1 pass (2026-10-08, D4 Felothar
 * Walls, D5, D6, D7, one seat random-legal, seed 3) waited 20 seconds for one person's next question, layer 7 trying a
 * dozen +1/+1 statics against each other. A trial can answer yes only if one effect writes a field the other's `affects`
 * reads, or both write one field in an order that matters; when neither holds the layers skip it, and a whole layer with
 * no such pair is in timestamp order (CR 613.7) without one pair asked. The answer is the same: `checkPrune` makes every
 * skipped trial anyway and throws where they would disagree, here through a whole seeded game of Rob's real decks.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame} from "../game/engine/rules/turn.mjs";
import {characteristicsOf, powerOf, deriveMemo} from "../game/engine/rules/layers.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Maya"}, {name: "Trey"}, {name: "Sam"}]};
const started = () => { const s = createState(pod); beginGame(s); return s; };
const fresh = (s, id) => { deriveMemo.reset(); const c = characteristicsOf(s, id); return {c, trials: deriveMemo.trials()}; };

/* ---- a layer that cannot have a dependency: no trial at all, and the same answer the trials give ---- */
{
  const s = started();
  const bear = addObject(s, {card: "Bear", types: ["Creature"], power: 2, toughness: 2, owner: 0, controller: 0}, "battlefield");
  s.effects = [1, 2, 3, 4, 5].map((t) => ({id: `anthem-${t}`, layer: 7, sublayer: "c", timestamp: t, affects: {types: ["Creature"]}, apply: {power: 1, toughness: 1}}));
  const pruned = fresh(s, bear);
  eq([pruned.c.power, pruned.c.toughness, pruned.trials], [7, 7, 0], "five +1/+1 anthems, none reading power: a 7/7 and not one trial");
  deriveMemo.checkPrune(true);
  const checked = fresh(s, bear);
  deriveMemo.checkPrune(false);
  ok(checked.trials > 0 && checked.c.power === 7, "with the check on, every pair is tried, and the trials agree");
}

/* ---- a real dependency is still found (CR 613.8a): "all creatures are Elves" waits for "this land is a creature" ---- */
{
  const s = started();
  const land = addObject(s, {card: "Forest", types: ["Land"], subtypes: ["Forest"], owner: 0, controller: 0}, "battlefield");
  s.effects = [
    {id: "elves", layer: 4, timestamp: 1, affects: {types: ["Creature"]}, apply: {addSubtypes: ["Elf"]}},
    {id: "animate", layer: 4, timestamp: 2, affects: {ids: [land]}, apply: {addTypes: ["Creature"]}},
  ];
  const {c, trials} = fresh(s, land);
  ok(c.types.includes("Creature") && c.subtypes.includes("Elf") && trials > 0,
    "the older Elf effect applies after the newer animation it depends on, found by trial: the land is an Elf creature");
}

/* ---- a layer with one pair that can depend and others that cannot: one trial, for that pair alone ---- */
{
  const s = started();
  const bear = addObject(s, {card: "Bear", types: ["Creature"], power: 2, toughness: 2, owner: 0, controller: 0}, "battlefield");
  s.effects = [
    {id: "fliers", layer: 7, sublayer: "c", timestamp: 1, affects: {keywords: ["Flying"]}, apply: {power: 1}},
    {id: "wings", layer: 7, sublayer: "c", timestamp: 2, affects: {ids: [bear]}, apply: {power: 1, addKeywords: ["Flying"]}},
    {id: "anthem", layer: 7, sublayer: "c", timestamp: 3, affects: {types: ["Creature"]}, apply: {power: 1}},
  ];
  const {c, trials} = fresh(s, bear);
  eq([c.power, c.keywords.includes("Flying"), trials], [5, true, 1],
    "\"creatures with flying get +1/+0\" waits for the newer effect that gives flying -- found with one trial, the others never tried");
}

/* ---- a layer of more than 64 effects that must be ordered: every one applies ---- */
{
  const s = started();
  const bear = addObject(s, {card: "Bear", types: ["Creature"], power: 2, toughness: 2, owner: 0, controller: 0}, "battlefield");
  /* Each sets power, so each pair is asked (a set's order matters); sixty-nine set other creatures' power, so none depends
     on another and the ordering loop places them one a pass -- and the Bear's own is the seventieth. */
  const others = Array.from({length: 69}, (_, i) => addObject(s, {card: `Bear ${i}`, types: ["Creature"], power: 2, toughness: 2, owner: 1, controller: 1}, "battlefield"));
  s.effects = [...others.map((id, i) => ({id: `set-${i + 1}`, layer: 7, sublayer: "b", timestamp: i + 1, affects: {ids: [id]}, apply: {setPower: 5}})),
    {id: "set-70", layer: 7, sublayer: "b", timestamp: 70, affects: {ids: [bear]}, apply: {setPower: 9}}];
  eq(powerOf(s, bear), 9, "seventy power-setting effects in one sublayer, the Bear's the seventieth: it applies -- none dropped past the 64th");
}

/* ---- a whole seeded game of Rob's decks with every skipped trial made, and none disagreeing ---- */
{
  const {decksFromBackup, playGame} = await import("../tools/fuzz-live.mjs");
  const {tableCards} = await import("../cloud/game-room.mjs");
  const {readFileSync} = await import("node:fs");
  const backup = JSON.parse(readFileSync(new URL("../data/live-state.json", import.meta.url), "utf8"));
  const decks = decksFromBackup(backup, ["D4 Felothar Walls", "D5 Shadrix Aristocrats", "D6 Krenko Goblins", "D7 Maralen Exile Cast"]);
  deriveMemo.checkPrune(true);
  let game;
  try { game = await playGame({decks, seed: 3, cards: tableCards, humans: [0]}); } finally { deriveMemo.checkPrune(false); }
  ok(game.status === "finished" && (game.refusals?.total ?? 0) === 0, `the G1 game that waited 20 seconds plays to its end, nothing refused, with every skipped trial made and agreeing (${game.turns} turns)`);
}

console.log(`engine-layer-prune: ${checks} checks passed -- a layer's dependency trials made only where one can find a dependency, a real one still found, more than 64 effects all applied, and a whole game of Rob's decks agreeing with every trial made.`);
