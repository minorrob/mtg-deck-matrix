/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* SURGE AND FREERUNNING (CR 702.117, 702.173; Reckless Bushwhacker, Monastery Raid, Train C phase 2).
 *
 * Two alternative costs (CR 118.9; cards/index.mjs compiles each to an `alternative-cost` static), offered beside the mana
 * cost while their condition holds (script/condition.mjs): surge, once its caster has cast another spell this turn (there
 * are no teams here: "you or a teammate" is its caster alone); freerunning, once a player was dealt combat damage this turn
 * by an Assassin creature or a commander under its caster's control, as it dealt it (rules/combat.mjs keeps the record,
 * rules/turn.mjs clears it as a turn begins). What either casts is marked as cast for it -- the spell's cast record, and the
 * permanent it becomes (`paidFor`; rules/actions.mjs, rules/stack.mjs) -- for "if its surge cost was paid" and "if this
 * spell's freerunning cost was paid" (`{paidFor}`), a trigger's asked again as it resolves from what it saw as it
 * triggered, its source perhaps gone (CR 603.4, 608.2h; rules/trigger.mjs). And "other creatures you control" read with that
 * source gone is another than what it was as it last existed (script/filter.mjs, `another`; CR 113.7a).
 */
import {legalActions} from "../game/engine/rules/actions.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {powerOf, keywordsOf} from "../game/engine/rules/layers.mjs";
import {selectMatching} from "../game/engine/script/filter.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {play, drive, happen, at, idOf, compiled, keywordBuilt, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-surge-freerunning");
const RB = "Reckless Bushwhacker", MR = "Monastery Raid";
const instant = (text, effects, cost = "{R}") => ({types: ["Instant"], manaCost: cost, colors: ["R"], spell: {id: "s", text, targets: [], effects}});
const lastWords = compiled([{kind: "triggered", text: "When this creature dies, other creatures you control get +1/+0 until end of turn.", trigger: {on: "dies", who: "self"},
  effects: [{effect: "pumpAll", selector: {what: "permanent", types: ["Creature"], controller: "you", another: true}, power: 1, toughness: 0, until: "end-of-turn"}]}],
{name: "Last Words", types: ["Creature"], subtypes: ["Goblin"], manaCost: "{R}", colors: ["R"], power: 1, toughness: 1});
const FIX = {Spark: instant("You gain 1 life.", [{effect: "gainLife", amount: 1}]),
  Cutthroat: {types: ["Creature"], subtypes: ["Human", "Assassin"], manaCost: "{1}{B}", colors: ["B"], power: 2, toughness: 1},
  Mimic: {types: ["Creature"], subtypes: ["Shapeshifter"], manaCost: "{1}{U}", colors: ["U"], power: 1, toughness: 1, keywords: ["Changeling"]},
  "Last Words": {...lastWords.definition, card: "Last Words"}};
/* The ways Rob is offered a card in his hand: its keyword's, or its mana cost. */
const ways = (s, name, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "cast" && s.objects[a.objectId].card === name)
  .map((a) => (a.alternative !== undefined ? s.objects[a.objectId].abilities[a.alternative].paidFor : "mana")).sort();
const inHand = (s, name, seat = 0) => s.zones.hand[seat].find((id) => s.objects[id].card === name);

/* ---- surge ---- */
{
  const s = play([at(0, "hand", RB, "Spark"), at(0, "battlefield", "Mountain", "Mountain", "Wastes", "Wastes")], [{tap: "Mountain"}, {tap: "Mountain"}, {tap: "Wastes"}], {}, FIX);
  eq(ways(s, RB), ["mana"], "no spell cast this turn: its mana cost alone");
  ok(!conditionHolds(s, {surge: true}, {controller: 0, source: inHand(s, RB)}), "and surge does not hold");
  const t = play([at(0, "hand", RB, "Spark"), at(0, "battlefield", "Mountain", "Mountain", "Wastes", "Wastes")], [{tap: "Mountain"}, {cast: "Spark"}, {resolve: true}, {tap: "Mountain"}, {tap: "Wastes"}, {tap: "Wastes"}], {}, FIX);
  eq(ways(t, RB), ["mana", "surge"], "with Spark cast this turn: surge too");
  drive(t, (st) => st.turn === 3 && st.phase === "MAIN1");
  ok(!conditionHolds(t, {surge: true}, {controller: 0, source: inHand(t, RB)}), "Rob's next turn: no spell cast in it yet, and no surge");
}
{
  /* Another player's spell is no teammate's (CR 702.117a; no teams in Commander): Maya's Spark on Rob's turn gives him none. */
  const s = play([at(0, "hand", RB), at(0, "battlefield", "Mountain", "Wastes"), at(1, "hand", "Spark"), at(1, "battlefield", "Mountain")],
    [{to: {turn: 1, phase: "COMBAT_BEGIN"}}, {pass: 1}, {tap: "Mountain", seat: 1}, {cast: "Spark", seat: 1}, {resolve: true}], {seats: 4}, FIX);
  eq([s.players[1].life, conditionHolds(s, {surge: true}, {controller: 0, source: inHand(s, RB)}), conditionHolds(s, {surge: true}, {controller: 1, source: null})], [41, false, true],
    "Maya's Spark: surge holds for Maya, not for Rob");
}
{
  /* Cast for it, the permanent is marked; cast for its mana cost, or put there, it is not. */
  const steps = [{tap: "Mountain"}, {cast: "Spark"}, {resolve: true}, {tap: "Mountain"}, {tap: "Wastes"}];
  const s = play([at(0, "hand", RB, "Spark"), at(0, "battlefield", "Mountain", "Mountain", "Wastes", "Bear")], [...steps, {cast: RB, alternative: 0}], {}, FIX);
  eq(s.stack.at(-1).cast.paidFor, "surge", "on the stack: its cast record says surge");
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null && !st.awaiting);
  const id = idOf(s, RB);
  eq([s.objects[id].paidFor, powerOf(s, idOf(s, "Bear")), keywordsOf(s, idOf(s, "Bear")).includes("Haste"), powerOf(s, id)], ["surge", 3, true, 2],
    "the Bushwhacker cast for surge: marked; the Bear 3/2 with haste; the Bushwhacker itself 2/1");
  const t = play([at(0, "hand", RB), at(0, "battlefield", "Bear")], [], {}, FIX);
  happen(t, {effect: "moveZone", targets: [inHand(t, RB)], to: "battlefield"}, {controller: 0, source: null});
  drive(t, (st) => st.stack.length === 0 && !(st.pendingTriggers ?? []).length && st.priorityPlayer !== null);
  eq([t.objects[idOf(t, RB)].paidFor, powerOf(t, idOf(t, "Bear"))], [undefined, 2], "put onto the battlefield by an effect: cast for nothing, and its trigger does nothing");
}
{
  /* The trigger's "if" asked again as it resolves, from what it saw (CR 603.4, 608.2h): the Bushwhacker gone, still paid. */
  const s = play([at(0, "hand", RB, "Spark"), at(0, "battlefield", "Mountain", "Mountain", "Wastes", "Bear")],
    [{tap: "Mountain"}, {cast: "Spark"}, {resolve: true}, {tap: "Mountain"}, {tap: "Wastes"}, {cast: RB, alternative: 0}, {resolve: true}], {}, FIX);
  const trigger = s.stack.at(-1);
  eq([trigger.kind, trigger.paidFor], ["trigger", "surge"], "its trigger on the stack remembers the surge it was cast for");
  happen(s, {effect: "destroy", targets: [idOf(s, RB)]}, {controller: 1, source: null});
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null && !st.awaiting);
  eq([powerOf(s, idOf(s, "Bear")), keywordsOf(s, idOf(s, "Bear")).includes("Haste")], [3, true], "destroyed in response: the Bear still 3/2 with haste");
}
{
  /* "Other creatures you control" with the source gone: a "when this dies" trigger, its source as it last was (`lastKnown`). */
  eq(lastWords.problems, [], "the Last Words fixture compiles");
  const s = play([at(0, "battlefield", "Last Words", "Bear")], [], {}, FIX);
  happen(s, {effect: "destroy", targets: [idOf(s, "Last Words")]}, {controller: 1, source: null});
  drive(s, (st) => st.stack.length === 0 && !(st.pendingTriggers ?? []).length && st.priorityPlayer !== null);
  eq(powerOf(s, idOf(s, "Bear")), 3, "Last Words died: the Bear, another creature, 3/2");
  const t = play([at(0, "battlefield", "Bear", "Cutthroat")], [], {}, FIX);
  eq(selectMatching(t, {what: "permanent", types: ["Creature"], another: true}, {controller: 0, source: null, lastKnown: {cardId: 999}}).length, 2,
    "another than an object no longer there: every creature");
}

/* ---- freerunning ---- */
const RAIDER = [at(0, "hand", MR), at(0, "battlefield", "Mountain", "Wastes", "Wastes")];
const hit = (attacker, more = {}) => [{attack: [attacker], ...more}, {to: {turn: 1, phase: "MAIN2"}}, {tap: "Mountain"}, {tap: "Wastes"}, {tap: "Wastes"}];
{
  eq(ways(play(RAIDER, [{tap: "Mountain"}, {tap: "Wastes"}, {tap: "Wastes"}], {}, FIX), MR), ["mana"], "no combat damage: its mana cost alone");
  eq(ways(play([...RAIDER, at(0, "battlefield", "Cutthroat")], hit("Cutthroat"), {}, FIX), MR), ["freerunning", "freerunning", "freerunning", "mana"],
    "an Assassin of Rob's dealt Maya combat damage: freerunning, for X of 0, 1 or 2");
  eq(ways(play([...RAIDER, at(0, "battlefield", "Mimic")], hit("Mimic"), {}, FIX), MR).includes("freerunning"), true, "a changeling is an Assassin (CR 702.73a)");
  eq(ways(play([...RAIDER, at(0, "battlefield", "Bear")], hit("Bear"), {}, FIX), MR), ["mana"], "a Bear: no freerunning");
}
{
  /* A commander of his, cast from the command zone: a Bear, ready to attack. */
  const s = play([...RAIDER, at(0, "command", "Bear"), at(0, "battlefield", "Forest", "Wastes")], [{tap: "Forest"}, {tap: "Wastes"}, {cast: "Bear"}, {resolve: true}], {}, FIX);
  const bear = idOf(s, "Bear");
  s.objects[bear].controlledSinceTurn = -1;
  drive(s, (st) => st.phase === "MAIN2", {answer: (st, choice) => (st.awaiting.kind === "declare-attackers" ? [choice.options.find((o) => o.cardId === bear).index] : null)});
  eq([s.players[1].life, conditionHolds(s, {freerunning: true}, {controller: 0, source: inHand(s, MR)})], [38, true], "his commander, a Bear, dealt Maya combat damage: freerunning holds");
  eq(s.players[0].combatDamageSources, [{types: ["Bear"], every: false, commander: true}], "the record says it was a commander");
  drive(s, (st) => st.turn === 2 && st.phase === "MAIN1");
  ok(!conditionHolds(s, {freerunning: true}, {controller: 0, source: inHand(s, MR)}), "the next turn: forgotten as it began");
}
{
  /* Combat damage only, and the damage dealt by one of the caster's own: noncombat damage from an Assassin is none, and Maya,
     dealt it, has no freerunning. */
  const s = play([...RAIDER, at(0, "battlefield", "Cutthroat"), at(1, "hand", MR)], hit("Cutthroat"), {}, FIX);
  ok(!conditionHolds(s, {freerunning: true}, {controller: 1, source: inHand(s, MR, 1)}), "Maya, who was dealt it, may not freerun");
  const t = play([...RAIDER, at(0, "battlefield", "Cutthroat")], [], {}, FIX);
  happen(t, {effect: "dealDamage", amount: 2, who: [1]}, {controller: 0, source: idOf(t, "Cutthroat")});
  eq([t.players[1].life, conditionHolds(t, {freerunning: true}, {controller: 0, source: inHand(t, MR)})], [38, false], "the Assassin's noncombat damage: no freerunning");
}
{
  /* Cast for it: its cast record says so, and X is the X paid -- its branch takes that many. */
  const s = play([...RAIDER, at(0, "battlefield", "Cutthroat")], [...hit("Cutthroat"), {cast: MR, alternative: 0, x: 2}], {library: ["Forest", "Island", "Swamp"]}, FIX);
  eq([s.stack.at(-1).cast.paidFor, s.stack.at(-1).x], ["freerunning", 2], "Monastery Raid on the stack: cast for freerunning, X = 2");
  const t = play([...RAIDER, at(0, "battlefield", "Cutthroat")], [...hit("Cutthroat"), {cast: MR, alternative: 0, x: 0}, {resolve: true}], {library: ["Forest", "Island", "Swamp"]}, FIX);
  eq(t.zones.exile.length, 0, "freerunning with X = 0: no card exiled -- not the two its mana cost would");
  const offers = legalActions(play([...RAIDER, at(0, "battlefield", "Cutthroat")], hit("Cutthroat"), {}, FIX), 0).filter((a) => a.kind === "cast");
  const shown = offerDetails(play([...RAIDER, at(0, "battlefield", "Cutthroat")], hit("Cutthroat"), {}, FIX), 0, offers);
  ok(shown.filter((d) => d.startsWith("X = ")).every((d) => d.includes("freerunning for {X}{R}")), "the board says each freerunning offer by its name and cost");
}
{
  /* The house pilot takes the cast it is offered, either way. */
  const s = play([...RAIDER, at(0, "battlefield", "Cutthroat")], hit("Cutthroat"), {}, FIX);
  const pick = housePilot({seat: 0}).choose(projectFor(s, 0), legalActions(s, 0));
  eq(pick.kind, "cast", "the house pilot casts Monastery Raid");
}

/* ---- the grammar ---- */
ok(compiled([{kind: "keyword", text: "Surge--Pay 2 life", keyword: "surge", cost: [{atom: "payLife", amount: 2}]}]).problems.some((p) => p.includes("a surge cost of mana")), "a surge cost that is not mana is refused");
ok(compiled([{kind: "keyword", text: "Freerunning", keyword: "freerunning"}]).problems.some((p) => p.includes("a freerunning cost of mana")), "a freerunning cost is mana");
eq([compiled([{kind: "triggered", text: "x", trigger: {on: "enters"}, condition: {paidFor: "surge"}, effects: [{effect: "draw", count: 1}]}]).problems,
  compiled([{kind: "triggered", text: "x", trigger: {on: "enters"}, condition: {paidFor: "evoke"}, effects: [{effect: "draw", count: 1}]}]).problems.some((p) => p.includes("paidFor is the alternative cost")),
  compiled([{kind: "triggered", text: "x", trigger: {on: "enters"}, condition: {surge: false}, effects: [{effect: "draw", count: 1}]}]).problems.some((p) => p.includes("surge is true")),
  compiled([{kind: "triggered", text: "x", trigger: {on: "enters"}, condition: {freerunning: 1}, effects: [{effect: "draw", count: 1}]}]).problems.some((p) => p.includes("freerunning is true"))],
  [[], true, true, true], "the conditions' grammar: paidFor surge or freerunning, surge and freerunning true");
eq([index.definition(RB).keywords, index.definition(MR).keywords], [["Surge", "Haste"], ["Freerunning"]], "their keywords");
ok(keywordBuilt("Surge") && keywordBuilt("Freerunning"), "Surge and Freerunning are built (keywords/timing.mjs, the pay family)");
ok(index.resolve(RB)?.playable === true && index.resolve(MR)?.playable === true, `${RB} and ${MR} are defined and playable`);

done("surge after its caster's other spell this turn, freerunning after an Assassin's or a commander's combat damage this turn; what each casts marked, asked again from what a trigger saw.");
