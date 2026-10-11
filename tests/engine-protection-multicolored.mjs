/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* PROTECTION FROM MULTICOLORED, AND "UNLESS YOU DISCARD A CARD. WHEN YOU DISCARD A CARD THIS WAY" (CR 702.16, 603.12;
 * Argentum Masticore, Train C phase 2).
 *
 * Protection's quality may be "multicolored" (CR 702.16a, 105.2b): `from: {multicolored: true}` (cards/index.mjs), a source
 * of two or more colors as it now is (rules/protection.mjs) -- a hybrid card is both its colors; a colorless or one-colored
 * source is not. What protection does is read where each thing happens (DEBT, 702.16b-f): targeting, damage, blocking.
 *
 * Its upkeep trigger: "sacrifice this creature unless you discard a card" -- unlessPays's discard, each card in its
 * controller's hand an option, the card discarded remembered (effects/asking.mjs) -- and "when you discard a card this way,
 * destroy target nonland permanent an opponent controls with mana value less than or equal to the mana value of the
 * discarded card": a reflexive trigger (CR 603.12) about that card (`about: "remembered"`; effects/permanents.mjs), its
 * target chosen as it goes on the stack and checked again as it resolves.
 */
import {legalActions} from "../game/engine/rules/actions.mjs";
import {canBlockAttacker} from "../game/engine/keywords/combat.mjs";
import {protectedFrom} from "../game/engine/rules/protection.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {play, drive, happen, at, later, idOf, compiled, choose, labels, pilotsAnswer, keywordBuilt, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-protection-multicolored");
const AM = "Argentum Masticore";
const creature = (cost, colors, p = 2, t = 2) => ({types: ["Creature"], subtypes: ["Beast"], manaCost: cost, colors, power: p, toughness: t});
const bolt = (cost, colors) => ({types: ["Instant"], manaCost: cost, colors, spell: {id: "s", text: "It deals 3 damage to target creature.",
  targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "dealDamage", amount: 3, targets: {target: 0}}]}});
const FIX = {"Gold Beast": creature("{R}{G}", ["R", "G"], 6, 6), "Hybrid Beast": creature("{R/G}", ["R", "G"], 6, 6), "Red Beast": creature("{R}", ["R"], 6, 6),
  "Iron Beast": creature("{4}", [], 6, 6), "Gold Bolt": bolt("{R}{G}", ["R", "G"]), "Red Bolt": bolt("{R}", ["R"]),
  Ox: creature("{2}{G}", ["G"], 3, 3), Elk: creature("{4}{G}", ["G"], 4, 4), Rock: {types: ["Artifact"], manaCost: "{1}", colors: []},
  Statue: {types: ["Artifact"], manaCost: "{4}", colors: []}};

{
  /* The quality, source by source. */
  const s = play([later(0, "battlefield", AM), at(1, "battlefield", "Gold Beast", "Hybrid Beast", "Red Beast", "Iron Beast")], [], {}, FIX);
  const m = idOf(s, AM);
  eq(["Gold Beast", "Hybrid Beast", "Red Beast", "Iron Beast"].map((n) => protectedFrom(s, {card: m}, idOf(s, n))), [true, true, false, false],
    "from a red-green source and a hybrid red/green one; not a red one, nor a colorless one");
  eq(["Gold Beast", "Hybrid Beast", "Red Beast", "Iron Beast"].map((n) => canBlockAttacker(s, idOf(s, n), m)), [false, false, true, true],
    "so the two multicolored creatures can't block it (702.16f), the others can");
}
{
  /* Targeting (702.16b): Maya's red-green Gold Bolt has the Masticore no target; her red Bolt has. */
  const s = play([later(0, "battlefield", AM), at(1, "hand", "Gold Bolt", "Red Bolt"), at(1, "battlefield", "Mountain", "Forest", "Red Beast")],
    [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Mountain", seat: 1}, {tap: "Forest", seat: 1}], {}, FIX);
  const aims = (name) => legalActions(s, 1).filter((a) => a.kind === "cast" && s.objects[a.objectId].card === name).map((a) => a.targetNames.join()).sort();
  eq([aims("Gold Bolt"), aims("Red Bolt")], [["Red Beast"], [AM, "Red Beast"].sort()], "the Gold Bolt may not aim at it; the Red Bolt may");
}
{
  /* Damage (702.16e): the Gold Beast's combat damage to it is prevented, the Red Beast's is not. */
  const s = play([later(0, "battlefield", AM), at(1, "battlefield", "Gold Beast", "Red Beast")], [], {}, FIX);
  happen(s, {effect: "dealDamage", amount: 3, targets: [idOf(s, AM)]}, {controller: 1, source: idOf(s, "Gold Beast")});
  eq(s.objects[idOf(s, AM)].damage, 0, "3 from the Gold Beast: prevented");
  happen(s, {effect: "dealDamage", amount: 3, targets: [idOf(s, AM)]}, {controller: 1, source: idOf(s, "Red Beast")});
  eq(s.objects[idOf(s, AM)].damage, 3, "3 from the Red Beast: marked");
}

/* ---- the upkeep ---- */
const upkeep = (hand, theirs = ["Rock", "Statue", "Bear", "Forest"]) => play([later(0, "battlefield", AM), at(0, "hand", ...hand), at(1, "battlefield", ...theirs)],
  [{to: {turn: 3, phase: "UPKEEP"}}, {resolve: true}], {}, FIX);
{
  const s = upkeep(["Ox", "Elk"]);
  eq([s.awaiting?.player, labels(s)], [0, ["Discard Ox", "Discard Elk", "Don't pay"]], "Rob is asked: a card of his hand to discard, or not");
  choose(s, "Discard Elk");
  eq(labels(s).sort(), ["Bear", "Rock", "Statue"], "the Elk (mana value 5) discarded: the trigger may aim at any of Maya's nonland permanents of 5 or less");
  const t = upkeep(["Ox"]);
  choose(t, "Discard Ox");
  eq(labels(t).sort(), ["Bear", "Rock"], "the Ox (3): not the Statue (4)");
  const ox = t.zones.graveyard[0].find((id) => t.objects[id].card === "Ox");
  eq(t.stack.at(-1).about?.card, ox, "the reflexive trigger is about the Ox, the card it became in the graveyard");
  choose(t, "Rock");
  drive(t, (st) => st.stack.length === 0 && st.priorityPlayer !== null && !st.awaiting);
  eq([t.zones.graveyard[1].map((id) => t.objects[id].card), idOf(t, AM) !== undefined], [["Rock"], true], "the Rock destroyed, the Masticore stays");
}
{
  /* A land discarded (mana value 0): only what costs 0 -- nothing here. Its trigger has no target, and is removed (CR 603.3d). */
  const s = upkeep(["Forest"], ["Rock", "Bear"]);
  choose(s, "Discard Forest");
  eq([s.awaiting, s.stack.length, idOf(s, AM) !== undefined], [null, 0, true], "a Forest discarded: no target with mana value 0, nothing destroyed, the Masticore stays");
}
{
  /* Not paid, or nothing to pay with: sacrificed, and no trigger. */
  const s = upkeep(["Ox"]);
  choose(s, "Don't pay");
  eq([idOf(s, AM), s.zones.hand[0].length, s.stack.length], [undefined, 1, 0], "not paid: sacrificed, the Ox kept, nothing triggered");
  const t = upkeep([]);
  eq(labels(t), ["Don't pay"], "an empty hand: only not paying");
  choose(t, "Don't pay");
  ok(idOf(t, AM) === undefined, "and it is sacrificed");
}
{
  /* The pilots answer each question, and the rules take the answer. */
  for (const after of pilotsAnswer(upkeep(["Ox"]))) ok(after.awaiting === null || ["effect-choice", "trigger-targets"].includes(after.awaiting.kind), "each pilot answers the discard");
  const s = upkeep(["Ox"]);
  choose(s, "Discard Ox");
  for (const after of pilotsAnswer(s)) ok(after.stack.some((e) => e.kind === "trigger" && (e.targets ?? []).length === 1), "each pilot aims the reflexive trigger");
}
/* The grammar. */
eq(compiled([{kind: "keyword", text: "Protection from multicolored", keyword: "protection", from: {multicolored: true}}]).problems, [], "protection from multicolored compiles");
ok(compiled([{kind: "keyword", text: "Protection from multicolored", keyword: "protection", from: {colors: ["W"], multicolored: false}}]).problems.some((p) => p.includes("protection says from what")),
  "multicolored is true, or not said");
ok(compiled([{kind: "triggered", text: "x", trigger: {on: "upkeep"}, effects: [{effect: "immediateTrigger", about: "that card", targets: [], effects: [{effect: "draw", count: 1}]}]}]).problems
  .some((p) => p.includes("A reflexive trigger is about")), "a reflexive trigger is about its resolution's subject or what was remembered");
eq(missingFor({options: ["UnlessCost", "UnlessCostDiscard"]}), [], "\"unless a player discards a card\" is built (engine-constructs)");
eq(index.definition(AM).keywords, ["First Strike", "Protection"], `${AM}'s keywords`);
ok(keywordBuilt("Protection from multicolored"), "protection from multicolored is built (engine-constructs)");
ok(index.resolve(AM)?.playable === true, `${AM} is defined and playable`);

done("protection from multicolored -- targeting, damage, blocking -- and \"sacrifice it unless you discard a card; when you discard a card this way\", about the card discarded.");
