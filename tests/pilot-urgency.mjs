/* RESPONSE URGENCY (docs/ai-players/PLAN-2026-10-26.html §4b; game/engine/pilots/urgency.mjs).
 *
 * Rob, 2026-10-26: urgency is "the significance of the immediate threat, the near-term threat, the long-term threat engine,
 * and the costs to the caster at each stage", from "a defined cornerstone of infinite loops, the opponent's deck's core engine,
 * a known salty card, a card that has bleed/poison or other draining effects, a card that doubles things"; Easy pays no
 * attention, Normal lightly, Hard "with appropriate degree of urgency (not overkill ...)".
 *
 *   1. The three tiers of a card, from its role flags, the engine links its controller has and my life.
 *   2. The weighted urgency, and the table's: opposing permanents and spells on the stack only.
 *   3. What an answer nets, and the mana held for an instant.
 *   (The pilot's use of it -- the proportion rule, the target, the hold -- is tests/engine-hard-pilot.mjs.)
 *
 *   node tests/pilot-urgency.mjs
 */
import assert from "node:assert/strict";
import {tiersOf, urgencyOf, threatsOnTable, readTable, netOf, holdFor, TIER_WEIGHT, URGENCY, UNIT, CAP} from "../game/engine/pilots/urgency.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const near = (a, b, m) => {assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} is not ${b}`); checks += 1;};

const FACTS = {
  Vanilla: {types: ["Creature"], flags: ""}, "Loop Piece": {types: ["Creature"], flags: "UL"}, "Token Engine": {types: ["Creature"], flags: "T"},
  Doubler: {types: ["Enchantment"], flags: "D"}, Bleeder: {types: ["Creature"], flags: "B"}, "Extra Turn": {types: ["Sorcery"], flags: "X"},
  Salty: {types: ["Enchantment"], flags: "S"}, "Game Changer": {types: ["Artifact"], flags: "GS"}, Cmdr: {types: ["Creature"], flags: "", commanderClass: 1},
  Murder: {manaValue: 3, types: ["Instant"], flags: "A"}, Wrath: {manaValue: 4, types: ["Sorcery"], flags: "K"}, Divination: {manaValue: 3, types: ["Sorcery"], flags: ""}, Doom: {manaValue: 2, types: ["Instant"], flags: "A"},
};
const facts = (name) => FACTS[name] ?? null;
let ids = 0;
const card = (name, controller, extra = {}) => ({cardId: ++ids, name, types: FACTS[name].types, controller, owner: controller, keywords: [], ...extra});
const ctx = (over = {}) => ({facts, myLife: 40, links: new Map(), ...over});
const view = (players, stack = []) => ({viewerSeatId: 0, turn: 9, stack, players: players.map((p, i) => ({playerId: i, life: p.life ?? 40, zones: {Battlefield: {cards: p.battlefield ?? []}, Hand: {cards: p.hand ?? []}}}))});

/* ---- 1. The tiers ---- */
{
  const creature = card("Vanilla", 1, {power: 10, toughness: 10});
  near(tiersOf(creature, ctx()).immediate, 0.25, "a creature's immediate tier is its damage as a share of my life: 10 of 40");
  near(tiersOf(creature, ctx({myLife: 8})).immediate, 1, "and is 1 when it would kill me");
  eq(tiersOf(card("Vanilla", 1, {power: 10, toughness: 10, keywords: ["Defender"]}), ctx()).immediate, 0, "a defender is no immediate threat");
  near(tiersOf(card("Vanilla", 1, {power: 4, toughness: 4, keywords: ["Flying"]}), ctx()).immediate, 4 * 1.5 / 40, "evasion counts: a flyer's 4 are 6");
  /* A loop piece: its partner in sight (two links on its controller's board) makes it near; alone it is a long-term seed. */
  const loop = card("Loop Piece", 1, {power: 0, toughness: 1});
  eq([tiersOf(loop, ctx({links: new Map([[1, 2]])})).near, tiersOf(loop, ctx({links: new Map([[1, 1]])})).long], [0.7, 0.35], "a loop piece is near with a partner in sight, and a long-term seed alone");
  eq(tiersOf(loop, ctx({links: new Map([[2, 5]])})).near, 0, "another seat's links are not its partner");
  eq([tiersOf(card("Doubler", 1), ctx({links: new Map([[1, 2]])})).near, tiersOf(card("Doubler", 1), ctx()).long], [0.6, 0.4], "a doubler beside a link is near; alone it is long");
  eq([tiersOf(card("Token Engine", 1, {power: 1, toughness: 1}), ctx({links: new Map([[1, 3]])})).near, tiersOf(card("Token Engine", 1, {power: 1, toughness: 1}), ctx()).long], [0.45, 0.25], "an engine link beside others is near; alone a seed");
  eq([tiersOf(card("Extra Turn", 1), ctx()).immediate, tiersOf(card("Bleeder", 1), ctx()).near, tiersOf(card("Bleeder", 1), ctx({myLife: 10})).immediate], [0.7, 0.4, 0.5], "an extra turn is immediate; bleed is near, and immediate when my life is low");
  eq([tiersOf(card("Salty", 1), ctx()).near, tiersOf(card("Game Changer", 1), ctx()).long, tiersOf(card("Game Changer", 1), ctx()).near], [0.3, 0.3, 0.3], "a salty card is near; a game changer is long, and salty too");
  eq([tiersOf(card("Cmdr", 1, {commander: true}), ctx()).near, tiersOf(card("Cmdr", 1), ctx()).near], [0.6, 0], "a commander that is itself an engine is near, when it is the commander");
  eq(tiersOf(card("Vanilla", 1), ctx({facts: () => null})), {immediate: 0, near: 0, long: 0}, "a card the pilot knows nothing about has no tiers");
}

/* ---- 2. The weighted urgency and the table's ---- */
{
  eq([TIER_WEIGHT.immediate, TIER_WEIGHT.near, TIER_WEIGHT.long, CAP, UNIT], [1, 0.6, 0.3, 1.5, 8], "the tiers weigh 1 : 0.6 : 0.3, capped at 1.5, a full urgency worth 8");
  eq([URGENCY.easy, URGENCY.normal, URGENCY.hard], [0, 0.4, 1], "Easy pays no attention, Normal 0.4, Hard all of it");
  const c = card("Bleeder", 1, {power: 4, toughness: 4});
  near(urgencyOf(c, ctx()), 0.1 + 0.6 * 0.4, "urgency is 1 x immediate + 0.6 x near + 0.3 x long: a 4-power bleeder at 40 life");
  near(urgencyOf(card("Extra Turn", 1), ctx({myLife: 1})), 0.7, "an extra turn alone is 0.7");
  ok(urgencyOf(card("Vanilla", 1, {power: 99, toughness: 1}), ctx({myLife: 1})) <= CAP, "and never above the cap");
  /* The table: opposing permanents only, and the spells opponents have on the stack. */
  const mine = card("Vanilla", 0, {power: 9, toughness: 9}), theirs = card("Loop Piece", 1), their2 = card("Token Engine", 1, {power: 1, toughness: 1}), third = card("Doubler", 2);
  const t = threatsOnTable(view([{battlefield: [mine]}, {battlefield: [theirs, their2]}, {battlefield: [third]}], [{name: "Extra Turn", playerId: 1}, {name: "Vanilla", playerId: 0}, {name: null, playerId: 2}]), {seat: 0, facts});
  eq([...t.items.keys()].sort(), [theirs.cardId, their2.cardId, third.cardId].sort(), "only opposing permanents are on the table's list, never my own");
  eq([t.ctx.links.get(1), t.ctx.links.get(2), t.ctx.links.get(0)], [2, 1, 0], "with each seat's links counted");
  ok(t.items.get(theirs.cardId).urgency > t.items.get(third.cardId).urgency, "a loop piece with its partner in sight is more urgent than a doubler alone");
  eq(t.stack.map((e) => [e.name, e.playerId]), [["Extra Turn", 1]], "the stack lists an opponent's named spell, not mine and not a face-down one");
  near(t.stack[0].urgency, 0.7, "and an extra turn on it is urgent");
  near(t.total, [...t.items.values()].reduce((n, i) => n + i.urgency, 0), "the total is the sum");
  eq(readTable(view([{life: 7}, {}]), {seat: 0, facts}).myLife, 7, "the table reads my life");
}

/* ---- 3. What an answer nets, and the mana held ---- */
{
  near(netOf({removed: 0.5, cost: 3}), 1, "removing half a full urgency (4 worth) with a 3-mana spell nets 1");
  ok(netOf({removed: 0.2, cost: 3}) < 0, "removing little for 3 mana nets less than nothing: the proportion rule's case");
  ok(netOf({removed: 1, cost: 4, collateral: 6}) < 0 && netOf({removed: 1, cost: 4}) > 0, "a wipe's collateral, my own permanents it takes, is what turns it negative");
  const hand = [{name: "Murder"}, {name: "Divination"}, {name: "Doom"}];
  const threats = (signals, score = 0.1) => ({rows: [{playerId: 1, signals: {engine: 0, commander: 0, ...signals}, score}]});
  eq(holdFor({hand, facts, threats: threats({engine: 0.33})}), 2, "with an engine seed on the table it holds the cheapest instant answer it has (Doom, 2)");
  eq(holdFor({hand, facts, threats: threats({commander: 1})}), 2, "or a commander that is itself an engine");
  eq(holdFor({hand, facts, threats: threats({}, 0.7)}), 2, "or a seat whose threat reads high");
  eq(holdFor({hand, facts, threats: threats({})}), 0, "and nothing when the table holds nothing worth answering");
  eq(holdFor({hand: [{name: "Divination"}, {name: "Wrath"}], facts, threats: threats({engine: 1})}), 0, "nothing without an instant answer in hand: a sorcery waits for its turn");
}

console.log(`pilot-urgency: ${checks} checks passed — three tiers of urgency from a card's role, its controller's links and my life; an answer nets what it removes less what it costs; and the mana an instant answer holds.`);
