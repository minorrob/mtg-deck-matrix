/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TIERED (CR 702.183; Cloud's Limit Break, Train C phase 2).
 *
 * "Choose one. As an additional cost to cast this spell, pay the cost associated with that mode" (702.183a): each mode says
 * its cost, and cards/index.mjs puts the costs among the spell's additional costs (`tiered`), in the modes' order;
 * rules/actions.mjs makes each mode a cast of its own -- that mode alone, its cost added to the total cost (CR 601.2b,
 * 601.2f), offered only when it can be paid. A mode's own counted target may be "controlled by different players"
 * (script/schema.mjs lets a mode say it, as an ability may).
 */
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {play, at, compiled, pilotsAnswer, keywordBuilt, index, checks, assert} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-tiered");
const CLB = "Cloud's Limit Break";
const FIX = {Elf: {types: ["Creature"], subtypes: ["Elf"], manaCost: "{G}", colors: ["G"], power: 1, toughness: 1, abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]},
  Wall: {types: ["Creature"], subtypes: ["Wall"], manaCost: "{1}{W}", colors: ["W"], power: 0, toughness: 6}};
const casts = (s, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "cast" && s.objects[a.objectId].card === CLB);
/* Each mode offered, with the cost it adds -- once, however many ways there are to aim it. */
const summary = (s, seat = 0) => [...new Set(casts(s, seat).map((a) => `${a.modes.join("+")}:${a.extraMana}`))].sort();
/* Maya attacks Rob with her two Bears on her turn; Rob, with priority in the declare-attackers step, has these lands tapped. */
const attacked = (lands, more = []) => play([at(0, "hand", CLB), at(0, "battlefield", ...lands, ...more), at(1, "battlefield", "Bear", "Big Bear")],
  [{to: {turn: 2, phase: "MAIN1"}}, {attack: ["Bear", "Big Bear"], seat: 1}, {pass: 1}, ...lands.map((l) => ({tap: l, seat: 0}))], {}, FIX);

{
  eq(summary(attacked(["Plains", "Wastes"])), ["0:{0}"], "{1}{W} in his pool: Cross-Slash alone, its {0} added");
  eq(summary(attacked(["Plains", "Wastes", "Wastes"])), ["0:{0}", "1:{1}"], "{2}{W}: Blade Beam too");
  eq(summary(attacked(["Plains", "Plains", "Wastes", "Wastes", "Wastes"])), ["0:{0}", "1:{1}"], "five mana: still not Omnislash, which costs {4}{W}{W} in all");
  eq(summary(attacked(["Plains", "Plains", "Wastes", "Wastes", "Wastes", "Wastes"])), ["0:{0}", "1:{1}", "2:{3}{W}"], "six, two of them white: every mode, each alone");
  ok(casts(attacked(["Plains", "Plains", "Wastes", "Wastes", "Wastes", "Wastes"])).every((a) => a.modes.length === 1), "never two modes at once (\"choose one\")");
}
{
  /* Cast with Blade Beam: its counted target asked, then the spell on the stack with that mode, its cost paid. */
  const s = attacked(["Plains", "Wastes", "Wastes"]);
  applyAction(s, 0, casts(s).find((a) => a.modes[0] === 1));
  eq([s.awaiting?.kind, s.players[0].manaPool.W + s.players[0].manaPool.C], ["choose-targets", 3], "Blade Beam taken: its targets asked before anything is paid");
  const choice = awaitingChoice(s);
  eq(choice.options.map((o) => o.label).sort(), ["Bear (Maya's)", "Big Bear (Maya's)"], "Maya's two tapped attackers to choose from");
  const both = choice.options.map((o) => o.index);
  assert.throws(() => resolveAwaiting(structuredClone(s), both), /different/i, "both of Maya's: refused -- they must have different controllers");
  for (const after of pilotsAnswer(s)) ok(after.stack.length === 1 && after.stack[0].modes[0] === 1 && [].concat(after.stack[0].targets[0]).length <= 1, "each pilot casts it at one of her creatures at most");
  resolveAwaiting(s, [both[0]]);
  eq([s.stack.length, s.stack[0].modes, s.players[0].manaPool.W ?? 0, s.players[0].manaPool.C ?? 0], [1, [1], 0, 0], "cast with Blade Beam's mode: {1}{W} and its {1}, all three paid");
}
{
  /* Omnislash: every tapped creature, whoever's, and nothing untapped. */
  const s = play([at(0, "hand", CLB), at(0, "battlefield", "Plains", "Plains", "Wastes", "Wastes", "Wastes", "Elf", "Wall"), at(1, "battlefield", "Bear", "Big Bear")],
    [{to: {turn: 2, phase: "MAIN1"}}, {attack: ["Bear"], seat: 1}, {pass: 1}, ...["Plains", "Plains", "Wastes", "Wastes", "Wastes", "Elf"].map((l) => ({tap: l, seat: 0})),
      {cast: CLB, seat: 0, modes: [2]}, {resolve: true}], {}, FIX);
  eq([s.zones.graveyard[1].map((id) => s.objects[id].card), s.zones.battlefield.filter((id) => s.objects[id].types.includes("Creature")).map((id) => s.objects[id].card).sort()],
    [["Bear"], ["Big Bear", "Wall"]], "Maya's attacking Bear and Rob's tapped Elf destroyed; her untapped Big Bear and his Wall stay");
}
/* The grammar. */
const mode = (text, more) => ({text, targets: [], effects: [{effect: "draw", count: 1}], ...more});
const spell = (modes) => ({kind: "spell", text: "x", effects: [{effect: "modal", choose: 1, modes}]});
const tiered = {kind: "keyword", text: "Tiered", keyword: "tiered"};
const instant = {types: ["Instant"], power: null, toughness: null};
eq(compiled([tiered, spell([mode("a", {cost: "{0}"}), mode("b", {cost: "{2}{U}"})])], instant).problems, [], "tiered, each mode with its cost: fine");
ok(compiled([tiered, spell([mode("a", {cost: "{0}"}), mode("b")])], instant).problems.some((p) => p.includes("each mode says its cost")), "a mode without its cost is refused");
ok(compiled([tiered, spell([mode("a", {cost: "{X}"}), mode("b", {cost: "{1}"})])], instant).problems.some((p) => p.includes("each mode says its cost")), "a cost with X is refused");
ok(compiled([tiered, {kind: "spell", text: "x", effects: [{effect: "draw", count: 1}]}], instant).problems.some((p) => p.includes("one mode is chosen as it is cast")), "tiered on a spell with no modes is refused");
ok(compiled([spell([mode("a", {cost: "{0}"}), mode("b", {cost: "{1}"})])], instant).problems.some((p) => p.includes("a mode's own cost is tiered's")), "a mode's cost without tiered is refused");
ok(compiled([spell([{text: "a", targets: [{what: "permanent", differentControllers: true}], effects: [{effect: "destroy", targets: {target: 0}}]}, mode("b")])], instant).problems
  .some((p) => p.includes("on a counted target")), "a mode's \"different controllers\" on a target that is not counted is refused");
const defined = index.definition(CLB);
eq([defined.keywords, defined.spell.additionalCost], [["Tiered"], [{atom: "tiered", costs: ["{0}", "{1}", "{3}{W}"]}]], `${CLB}: its keyword, and its modes' costs among its additional costs`);
ok(keywordBuilt("Tiered"), "Tiered is built (keywords/timing.mjs, the pay family)");
ok(index.resolve(CLB)?.playable === true, `${CLB} is defined and playable`);

done("tiered: one mode, its own cost added, each mode its own cast; a mode's counted target controlled by different players.");
