/* HARD (docs/ai-players/PLAN-2026-10-26.html §3 and §5; game/engine/pilots/scored-pilot.mjs at setting "hard").
 *
 * Rob, 2026-10-26: Hard "will compute a preferred target for each of the creatures they are going to declare to attack ...
 * They also consider the creatures that they would use and the blockers they may want to hold back ... based on the attack
 * potential of other players, the number of creatures on the board, the number of creatures with trample or with flying on
 * the board, and a weighted probability that X number of blockers may be needed between now and my next turn."; and the
 * response to a threat in proportion to it.
 *
 *   1. A preferred defender for each creature: one goes for the kill, another where it does the most, which a single-target
 *      plan (Normal's) never does; the same board at Normal and Easy keeps its one target.
 *   2. (later milestones add the reserve, the urgency and the chains to this file)
 *
 *   node tests/engine-hard-pilot.mjs
 */
import assert from "node:assert/strict";
import {scoredPilot, SETTINGS, TEMPERATURE} from "../game/engine/pilots/scored-pilot.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const FACTS = {Forest: {manaValue: 0, types: ["Land"], makes: ["G"], flags: ""}, Bear: {manaValue: 2, types: ["Creature"], makes: [], flags: ""}, Wall: {manaValue: 2, types: ["Creature"], makes: [], flags: ""}};
const cards = (name) => FACTS[name] ?? null;
let ids = 0;
const C = (name, controller, power, toughness, extra = {}) => ({cardId: ++ids, name, types: FACTS[name].types, controller, owner: controller, tapped: false, damage: 0, keywords: [], power, toughness, ...extra});
function viewOf({seat = 0, turn = 9, phase = "COMBAT_DECLARE_ATTACKERS", turnPlayerId = 0, players}) {
  return {viewerSeatId: seat, turn, turnPlayerId, phase, stackSize: 0, combat: null, stack: [],
    players: players.map((p, i) => ({playerId: i, name: `P${i}`, life: p.life ?? 40, health: {life: p.life ?? 40, status: "active", poison: 0}, mana: [], counters: {},
      zones: {Battlefield: {cards: p.battlefield ?? [], count: (p.battlefield ?? []).length}, Hand: {cards: p.hand ?? [], count: (p.hand ?? []).length},
        Library: {cards: [], count: 60}, Graveyard: {cards: []}, Exile: {cards: []}, Command: {cards: p.command ?? []}}}))};
}
const attackChoice = (mine, defenders, max = mine.length) => ({id: "declare-attackers:9", mode: "many", min: 0, max, exclusiveBy: "cardId",
  options: defenders.flatMap((d) => mine.map((c) => ({cardId: c.cardId, defenderId: d}))).map((o, index) => ({...o, index}))});
const answer = (setting, view, choice, seed = "s") => scoredPilot({seat: 0, cards, setting, seed}).answer(view, choice).indices.sort((a, b) => a - b);
const which = (choice, indices) => indices.map((i) => [choice.options[i].cardId, choice.options[i].defenderId]);

ok(SETTINGS.includes("hard") && TEMPERATURE.hard === 0, "L1 knows a hard setting, which takes the best plan");

/* ---- 1. A preferred defender for each creature ---- */
{
  ids = 0;
  const a = C("Bear", 0, 3, 3), b = C("Bear", 0, 2, 2);
  /* Seat 1 is at 3 life with nothing to block; seat 2 is at 40 with nothing to block. */
  const v = viewOf({players: [{battlefield: [a, b]}, {life: 3}, {life: 40}]});
  const ch = attackChoice([a, b], [1, 2]);
  eq(which(ch, answer("hard", v, ch)), [[a.cardId, 1], [b.cardId, 2]], "Hard: the 3/3 goes for the kill at 3 life, and the 2/2, which that seat no longer needs, at the healthy one");
  eq(new Set(answer("normal", v, ch).map((i) => ch.options[i].defenderId)).size <= 1, true, "Normal's plans send everything at one seat: it never splits");
  eq(new Set(answer("easy", v, ch).map((i) => ch.options[i].defenderId)).size <= 1, true, "and neither does Easy");
  /* The split is not a habit: with two seats alike, both go where the damage is worth most (the same one). */
  const alike = viewOf({players: [{battlefield: [a, b]}, {life: 40}, {life: 40}]});
  eq(new Set(answer("hard", alike, ch).map((i) => ch.options[i].defenderId)).size, 1, "with two seats alike, Hard keeps both at one: a split only where it helps");
}

console.log(`engine-hard-pilot: ${checks} checks passed — Hard gives each creature the defender where it does the most.`);
