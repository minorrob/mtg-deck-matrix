/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A COUNTED TARGET'S CHOICES TOGETHER: "UP TO TWO TARGET CARDS FROM A SINGLE GRAVEYARD" (Unlicensed Hearse) AND "TWO TARGET
 * CREATURE CARDS THAT SHARE A CREATURE TYPE" (Unbury; Train C phase 2, w2a-selectors; CR 115.1, 601.2c, 608.2b, 702.73a).
 *
 * `share` on a counted target (script/bind.mjs): "graveyard", every choice from one graveyard; "creature type", a creature
 * type every choice has, a changeling having every one. Its candidates are offered in groups that hold together -- each
 * graveyard, each creature type a candidate has -- each its own way to aim the spell or ability, so every legal choice has a
 * way and no other; the cards are then picked within the group (the "choose-targets" question), and what is picked is held
 * to the rule again as it is cast or activated, refused with what to do instead. As it resolves (CR 608.2b), choices that no
 * longer share a creature type are none of them legal. The cards' scenarios play Unbury and the Hearse; this suite holds a
 * table of four, a list submitted around the question, changelings alone, a trigger's way to aim, the resolution's check,
 * the grammar, and the house pilot's answer.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {targetChoices, recheckTargets, shareProblem, targetName, SHARES} from "../game/engine/script/bind.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {readFileSync} from "node:fs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const creature = (subtypes, extra = {}) => ({types: ["Creature"], subtypes, manaCost: "{1}", colors: ["G"], power: 1, toughness: 1, ...extra});
const FIX = {Bear: creature(["Bear"]), Elf: creature(["Elf"]), "Elf Rogue": creature(["Elf", "Rogue"]), Rogue: creature(["Rogue"]),
  Mimic: creature([], {keywords: ["Changeling"]}), "Other Mimic": creature([], {keywords: ["Changeling"]}),
  /* "When this creature enters, exile up to two target cards from a single graveyard": the same target, on a trigger. */
  Ghoul: {...creature(["Zombie"]), abilities: [{id: "g", kind: "triggered", text: "When this creature enters, exile up to two target cards from a single graveyard.",
    trigger: {on: "GameEventCardChangeZone", to: "Battlefield", who: "self"}, targets: [{what: "card", zone: "graveyard", count: {min: 0, max: 2}, share: "graveyard"}],
    effects: [{effect: "moveZone", targets: {target: 0}, to: "exile"}]}]}};
const play = (seats, setup, extra = {}) => runScenario({name: "groups", seats, setup, ...extra}, index.definition, FIX).state;
const named = (s, ids) => ids.map((id) => s.objects[id].card);

/* ---- the Hearse at a table of four: a way for each graveyard with a card in it ---- */
{
  const s = play(4, [at(0, "battlefield", "Unlicensed Hearse"), at(0, "graveyard", "Bear"), at(2, "graveyard", "Elf", "Rogue"), at(3, "graveyard", "Mountain")]);
  const offers = legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Unlicensed Hearse" && (a.targets ?? []).length);
  eq(offers.map((a) => a.targetNames), [["up to two targets from Rob's graveyard"], ["up to two targets from Trey's graveyard"], ["up to two targets from Sam's graveyard"]],
    "one way for each graveyard with a card in it, in seat order; Maya's empty one is none");
  eq(offers.map((a) => a.targets[0].of), [1, 2, 1], "each says how many it picks from");
  applyAction(s, 0, offers[1]);
  const choice = awaitingChoice(s);
  eq(choice.options.map((o) => o.label), ["Elf (Trey's)", "Rogue (Trey's)"], "the question is Trey's graveyard's cards alone");
  eq(choice.title, "Unlicensed Hearse: choose up to two targets from Trey's graveyard", "and says so");
  /* The house pilot answers within the group: whatever it picks is in Trey's graveyard. */
  const answer = housePilot({seat: 0}).answer(projectFor(s, 0), choice);
  ok(answer.indices.length <= 2 && answer.indices.every((i) => choice.options[i]), "the house pilot's answer is one of the question's");
  resolveAwaiting(s, [0, 1]);
  for (let n = 0; n < 10 && s.stack.length; n += 1) passPriority(s);
  eq(named(s, s.zones.exile), ["Elf", "Rogue"], "Trey's two cards are exiled");
}
{
  /* A list submitted with the offer, around the question: refused, with what to do instead (CR 601.2c). */
  const s = play(3, [at(0, "battlefield", "Unlicensed Hearse"), at(1, "graveyard", "Elf"), at(2, "graveyard", "Rogue")]);
  const offer = legalActions(s, 0).find((a) => a.kind === "activate" && a.label === "Unlicensed Hearse" && (a.targets ?? []).length);
  const elf = s.zones.graveyard[1][0], rogue = s.zones.graveyard[2][0];
  assert.throws(() => applyAction(s, 0, {...offer, targets: [[{kind: "object", id: elf}, {kind: "object", id: rogue}]]}),
    /Unlicensed Hearse's targets must be in a single graveyard: choose them all from one player's graveyard\./);
  checks += 1;
  eq(s.stack.length, 0, "nothing was activated");
  applyAction(s, 0, {...offer, targets: [[{kind: "object", id: rogue}]]});
  eq(s.stack.length, 1, "one of Trey's alone is a single graveyard's");
}

/* ---- Unbury: the groups, and what is held to them ---- */
{
  const s = play(2, [at(0, "hand", "Unbury"), at(0, "battlefield", "Swamp", "Wastes"), at(0, "graveyard", "Elf", "Elf Rogue", "Rogue", "Bear")]);
  for (const land of ["Swamp", "Wastes"]) applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.label === land));
  const pairs = legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === "Unbury" && JSON.stringify(a.modes) === "[1]");
  eq(pairs.map((a) => a.targetNames[0]), ["two targets that share a creature type: Elf", "two targets that share a creature type: Rogue"], "Elves and Rogues; the Bear shares with nothing");
  const [elf, elfRogue, rogue] = s.zones.graveyard[0].slice(0, 3);
  assert.throws(() => applyAction(s, 0, {...pairs[0], targets: [[{kind: "object", id: elf}, {kind: "object", id: rogue}]]}),
    /Unbury's targets must share a creature type: choose cards with a creature type in common\./);
  checks += 1;
  applyAction(s, 0, {...pairs[1], targets: [[{kind: "object", id: elfRogue}, {kind: "object", id: rogue}]]});
  eq(s.stack.length, 1, "the Elf Rogue and the Rogue share Rogue, whichever way they were offered");
  void elf;
}
{
  /* Two changelings that name no creature type share every one: offered together. */
  const s = createState({matchId: "m", seed: "mimics", players: [{name: "Rob"}, {name: "Maya"}]});
  for (const card of ["Mimic", "Other Mimic"]) addObject(s, {card, ...FIX[card], owner: 0, controller: 0}, "graveyard", 0);
  const spec = {what: "card", zone: "graveyard", controller: "you", types: ["Creature"], count: {min: 2, max: 2}, share: "creature type"};
  const ways = targetChoices(s, [spec], {controller: 0, source: null});
  eq(ways.length, 1, "one way");
  eq([targetName(s, ways[0][0]), ways[0][0].of], ["two targets that share a creature type", 2], "the changelings, together");
  eq(shareProblem(s, spec, s.zones.graveyard[0].map((id) => ({kind: "object", id})), "Unbury"), null, "and they do share one");
}

/* ---- a trigger's ways: one for each group, asked as its targets are ---- */
{
  const s = play(3, [at(0, "hand", "Ghoul"), at(0, "battlefield", "Wastes"), at(1, "graveyard", "Elf", "Bear"), at(2, "graveyard", "Rogue")]);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === "Ghoul"));
  for (let n = 0; n < 10 && !s.awaiting; n += 1) passPriority(s);
  eq(s.awaiting?.kind, "trigger-targets", "the Ghoul's trigger asks how to aim it");
  eq(awaitingChoice(s).options.map((o) => o.label), ["up to two targets from Maya's graveyard", "up to two targets from Trey's graveyard"], "a way for each graveyard");
  resolveAwaiting(s, [0]);
  eq(awaitingChoice(s).options.map((o) => o.label), ["Elf (Maya's)", "Bear (Maya's)"], "then Maya's cards, picked");
  resolveAwaiting(s, [0, 1]);
  for (let n = 0; n < 10 && s.stack.length; n += 1) passPriority(s);
  eq(named(s, s.zones.exile), ["Elf", "Bear"], "and exiled");
}

/* ---- as it resolves (CR 608.2b): choices that no longer share a creature type are none of them legal ---- */
{
  const s = createState({matchId: "m", seed: "recheck", players: [{name: "Rob"}, {name: "Maya"}]});
  const a = addObject(s, {card: "Elf", ...FIX.Elf, owner: 0, controller: 0}, "battlefield");
  const b = addObject(s, {card: "Other Elf", ...FIX.Elf, owner: 0, controller: 0}, "battlefield");
  const spec = {what: "permanent", types: ["Creature"], count: {min: 2, max: 2}, share: "creature type"};
  const chosen = [[{kind: "object", id: a}, {kind: "object", id: b}]];
  eq(recheckTargets(s, [spec], chosen, {controller: 0}).targets, chosen, "two Elves: both still legal");
  s.objects[b].subtypes = ["Bear"];
  eq(recheckTargets(s, [spec], chosen, {controller: 0}), {targets: [[]], fizzles: true}, "one no longer an Elf: neither shares a creature type with the other, and it fizzles");
  s.zones.battlefield = s.zones.battlefield.filter((id) => id !== a);
  delete s.objects[a];
  eq(recheckTargets(s, [spec], chosen, {controller: 0}).targets, [[{kind: "object", id: b}]], "one gone: the other, alone, shares with nothing and stays");
}

/* ---- the grammar ---- */
{
  eq(SHARES, ["graveyard", "creature type"], "what may be shared");
  const hearse = JSON.parse(readFileSync(new URL("../game/engine/cards/u/unlicensed-hearse.json", import.meta.url), "utf8"));
  const unbury = JSON.parse(readFileSync(new URL("../game/engine/cards/u/unbury.json", import.meta.url), "utf8"));
  eq([validateScript(hearse).valid, validateScript(unbury).valid], [true, true], "both definitions are valid scripts");
  const bad = (script, change) => { const copy = structuredClone(script); change(copy); return validateScript(copy).errors.map((e) => e.message).join(" | "); };
  ok(/on a counted target/.test(bad(hearse, (c) => { delete c.abilities[0].targets[0].count; })), "share is on a counted target");
  ok(/on a counted target/.test(bad(hearse, (c) => { c.abilities[0].targets[0].share = "owner"; })), "and is graveyard or creature type");
  ok(/on a counted target/.test(bad(unbury, (c) => { c.abilities[0].effects[0].modes[1].targets[0].share = "color"; })), "in a mode's targets too");
}

console.log(`engine-target-groups: ${checks} checks passed`);
