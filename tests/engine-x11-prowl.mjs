/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* PROWL (CR 702.76; Latchkey Faerie, Train B X11).
 *
 * Prowl is an alternative cost (CR 118.9; cards/index.mjs): offered while a player was dealt combat damage this turn by a
 * source that, as it dealt that damage, was under this spell's caster's control and had one of this spell's creature types
 * (script/condition.mjs, `prowl`) -- every type, for a changeling on either side (CR 702.73a). rules/combat.mjs keeps each
 * such source's types as it dealt the damage, for its controller, and turn.mjs forgets them as a turn begins. The permanent
 * a prowled spell becomes is marked so (`prowled`, rules/stack.mjs), for "if its prowl cost was paid"; a new object is not.
 */
import {legalActions} from "../game/engine/rules/actions.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {play, drive, happen, at, idOf, compiled, missing, keywordBuilt, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-x11-prowl");
const LF = "Latchkey Faerie";
const sprite = (name, subtypes, keywords = ["Flying"]) => ({types: ["Creature"], subtypes, manaCost: "{U}", colors: ["U"], power: 1, toughness: 1, keywords});
const FIX = {Sprite: sprite("Sprite", ["Faerie"]), Thief: sprite("Thief", ["Human", "Rogue"]), Mimic: sprite("Mimic", ["Shapeshifter"], ["Flying", "Changeling"]),
  Cart: {types: ["Artifact", "Creature"], subtypes: ["Vehicle"], manaCost: "{2}", colors: [], power: 2, toughness: 2},
  Gear: {...compiled([{kind: "keyword", text: "Prowl {1}", keyword: "prowl", cost: [{atom: "mana", cost: "{1}"}]}],
    {name: "Gear", types: ["Artifact"], subtypes: ["Equipment"], manaCost: "{4}", colors: [], power: null, toughness: null}).definition, card: "Gear"},
  Shifter: {...compiled([{kind: "keyword", text: "Changeling", keyword: "changeling"}, {kind: "keyword", text: "Prowl {U}", keyword: "prowl", cost: [{atom: "mana", cost: "{U}"}]}],
    {name: "Shifter", subtypes: ["Shapeshifter"], manaCost: "{3}{U}", colors: ["U"]}).definition, card: "Shifter"}};
/* The ways Rob is offered to cast a card in his hand: "prowl" for its prowl cost, "mana" for its mana cost. */
const ways = (s, name) => legalActions(s, 0).filter((a) => a.kind === "cast" && s.objects[a.objectId].card === name).map((a) => (a.alternative !== undefined ? "prowl" : "mana")).sort();
const POOL = ["Island", "Wastes", "Wastes", "Wastes"];
const pooled = (setup, steps = [], more = {}) => play([at(0, "battlefield", ...POOL), ...setup], [...steps, ...POOL.map((l) => ({tap: l}))], more, FIX);
const hit = (attacker, more = {}) => [{attack: [attacker], ...more}, {to: {turn: 1, phase: "MAIN2"}}];

eq(ways(pooled([at(0, "hand", LF)]), LF), ["mana"], "no combat damage this turn: only its mana cost");
eq(ways(pooled([at(0, "battlefield", "Sprite"), at(0, "hand", LF)], hit("Sprite")), LF), ["mana", "prowl"], "Rob's Faerie dealt Maya combat damage: prowl too");
eq(ways(pooled([at(0, "battlefield", "Thief"), at(0, "hand", LF)], hit("Thief")), LF), ["mana", "prowl"], "a Rogue of his: prowl (a Faerie Rogue shares either type)");
eq(ways(pooled([at(0, "battlefield", "Bear"), at(0, "hand", LF)], hit("Bear")), LF), ["mana"], "a Bear dealt it: no prowl");
eq(ways(pooled([at(0, "battlefield", "Mimic"), at(0, "hand", LF)], hit("Mimic")), LF), ["mana", "prowl"], "a changeling dealt it: every creature type, a Faerie among them");
eq(ways(pooled([at(0, "battlefield", "Bear"), at(0, "hand", "Shifter")], hit("Bear")), "Shifter"), ["mana", "prowl"], "a changeling spell, and a Bear dealt it: it shares the Bear's type");
eq(ways(pooled([at(0, "battlefield", "Cart"), at(0, "hand", "Shifter")], hit("Cart")), "Shifter"), ["mana"], "a creature with no creature type (a Vehicle) dealt it: a changeling spell shares nothing with it");
eq(ways(pooled([at(0, "battlefield", "Mimic"), at(0, "hand", "Gear")], hit("Mimic")), "Gear"), ["mana"], "a spell with no creature type (an Equipment), and a changeling dealt it: nothing to share");
{
  /* The source as it dealt the damage: gone since, it still counts. And the next turn, nothing. */
  const s = play([at(0, "battlefield", "Sprite", ...POOL), at(0, "hand", LF)], hit("Sprite"), {}, FIX);
  happen(s, {effect: "destroy", targets: [idOf(s, "Sprite")]}, {controller: 1, source: null});
  const latchkey = s.zones.hand[0].find((id) => s.objects[id].card === LF);
  ok(conditionHolds(s, {prowl: true}, {controller: 0, source: latchkey}), "the Faerie destroyed since: it dealt the damage as a Faerie of Rob's, and prowl holds");
  drive(s, (st) => st.turn === 3 && st.phase === "MAIN1");
  ok(!conditionHolds(s, {prowl: true}, {controller: 0, source: s.zones.hand[0].find((id) => s.objects[id].card === LF)}), "his next turn: forgotten as the turn began");
}
{
  /* Four players: the damage to any player counts, and it is the source's controller's -- not the player dealt it. */
  const s = play([at(0, "battlefield", "Sprite"), at(0, "hand", LF), at(2, "hand", LF)], hit("Sprite", {at: "Trey"}), {seats: 4}, FIX);
  const robs = s.zones.hand[0].find((id) => s.objects[id].card === LF), treys = s.zones.hand[2].find((id) => s.objects[id].card === LF);
  ok(conditionHolds(s, {prowl: true}, {controller: 0, source: robs}) && !conditionHolds(s, {prowl: true}, {controller: 2, source: treys}),
    "Rob's Faerie hit Trey: Rob may prowl; Trey, dealt the damage, may not");
}
{
  /* Cast for its prowl cost: its permanent is marked, and draws; put onto the battlefield otherwise, a new object, it is not. */
  const s = play([at(0, "battlefield", "Sprite", "Island", "Wastes", "Wastes"), at(0, "hand", LF)],
    [...hit("Sprite"), {tap: "Island"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: LF, alternative: 0}, {resolve: true}], {}, FIX);
  ok(s.objects[idOf(s, LF)].prowled === true, "the Latchkey Faerie cast for its prowl cost: its permanent was prowled");
  const t = play([at(0, "hand", LF)], [], {}, FIX);
  happen(t, {effect: "moveZone", targets: [t.zones.hand[0][0]], to: "battlefield"});
  drive(t, (st) => st.stack.length === 0 && !(st.pendingTriggers ?? []).length && st.priorityPlayer !== null);
  eq([t.objects[idOf(t, LF)].prowled, t.zones.hand[0].length], [undefined, 0], "put onto the battlefield by an effect: not prowled, and its trigger does not draw");
}
ok(compiled([{kind: "keyword", text: "Prowl--Pay 2 life", keyword: "prowl", cost: [{atom: "payLife", amount: 2}]}]).problems.some((p) => p.includes("a prowl cost of mana")),
  "a prowl cost that is not mana is refused");
eq([compiled([{kind: "triggered", text: "x", trigger: {on: "enters"}, condition: {prowled: true}, effects: [{effect: "draw", count: 1}]}]).problems,
  compiled([{kind: "triggered", text: "x", trigger: {on: "enters"}, condition: {prowled: "yes"}, effects: [{effect: "draw", count: 1}]}]).problems.some((p) => p.includes("prowled is true or false")),
  compiled([{kind: "triggered", text: "x", trigger: {on: "enters"}, condition: {prowl: false}, effects: [{effect: "draw", count: 1}]}]).problems.some((p) => p.includes("prowl is true"))],
  [[], true, true], "the conditions' grammar: prowled true or false, prowl true");
eq(compiled([{kind: "static", text: "x", rule: "alternative-cost", condition: {prowl: true}, cost: [{atom: "mana", cost: "{U}"}], affects: {what: "card", self: true}}]).problems, [],
  "a script may name prowl's condition on an alternative cost: one of the grammar's closed keys");
eq(index.definition(LF).keywords, ["Flying", "Prowl"], "Latchkey Faerie's keywords");
ok(keywordBuilt("Prowl"), "Prowl is built (keywords/timing.mjs, the pay family)");
eq(missing(LF), [], `${LF} needs nothing the engine lacks`);
ok(index.resolve(LF)?.playable === true, `${LF} is defined and playable`);

done("prowl offered after combat damage by a source of the caster's sharing a creature type, changelings both ways, this turn only; its permanent marked as prowled.");
