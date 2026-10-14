/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN E, WAVE 3 (g4): what the scenarios of sixteen of Rob's v43 library cards cannot reach.
 *
 *   - "THEN DISCARD TWO CARDS UNLESS YOU DISCARD A CREATURE CARD" (Thirst for Identity; CR 118.12, 701.9a): unlessPays'
 *     `discard` a selector of the card -- only the cards in hand it describes are ways to pay, and the question says which
 *     kind; ward's plain discard (any card) as before (effects/asking.mjs).
 *   - "YOU MAY CHOOSE NEW TARGETS FOR TARGET INSTANT OR SORCERY SPELL" (Wild Ricochet; CR 115.7d): changeTargets' `may`,
 *     each target of the spell kept or changed, a question at a time, as a copy's are -- one with no other choice not asked
 *     about, a counted target's list kept -- and without `may`, "change the target" as before (effects/asking.mjs).
 *   - "YOU HAVE NO MAXIMUM HAND SIZE FOR THE REST OF THE GAME" (Wisdom of Ages; CR 402.2, 611.2a): effectUntil's rule for
 *     the players it names, read at cleanup beside the statics (effects/permanents.mjs, rules/statics.mjs).
 *   - And that the table can play every one of the sixteen (cloud/game-room.mjs, tableCards).
 */
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {playerRuleChanged} from "../game/engine/rules/statics.mjs";
import {tableCards} from "../cloud/game-room.mjs";
import {play, drive, at, labels, checks, creature} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-train-e-g4");
const instant = (text, effects, targets = []) => ({types: ["Instant"], manaCost: "{C}", colors: ["R"], spell: {id: "s", text, targets, effects}});
const CREATURE = {what: "permanent", types: ["Creature"]};
const FIX = {
  Ogre: creature(["Ogre"], 3, 3, {manaCost: "{2}{R}", colors: ["R"]}), Elk: creature(["Elk"], 2, 2),
  Gift: instant("You gain 1 life.", [{effect: "gainLife", amount: 1}]),
  Bolt: instant("Bolt deals 3 damage to any target.", [{effect: "dealDamage", amount: 3, targets: {target: 0}, who: {target: 0}}], [{anyOf: [CREATURE, {what: "player"}]}]),
  /* Two targets: a creature, then a player. */
  Fork: instant("Fork deals 1 damage to target creature and 1 damage to target player.",
    [{effect: "dealDamage", amount: 1, targets: {target: 0}}, {effect: "dealDamage", amount: 1, who: {target: 1}}], [CREATURE, {what: "player"}]),
  /* A counted target: up to two target creatures. */
  Sweep: instant("Sweep deals 1 damage to each of up to two target creatures.", [{effect: "dealDamage", amount: 1, targets: {target: 0}}], [{...CREATURE, count: {min: 0, max: 2}}]),
  /* A target with one legal choice where there is one artifact. */
  Shatter: instant("Destroy target artifact.", [{effect: "destroy", targets: {target: 0}}], [{what: "permanent", types: ["Artifact"]}]),
  Rock: {types: ["Artifact"], manaCost: "{1}", colors: []},
};
const resolve = (s, effects, controller = 0) => beginResolution(s, effects, {controller, source: null});
const handOf = (s, seat = 0) => s.zones.hand[seat].map((id) => s.objects[id].card);
const graveOf = (s, seat = 0) => s.zones.graveyard[seat].map((id) => s.objects[id].card);
/* The steps that put a spell of `seat`'s on the stack with these targets, on that seat's turn, paid with a Wastes. */
const stackOn = (seat, name, targets) => [{to: {turn: seat + 1, phase: "MAIN1"}}, {tap: "Wastes", seat}, {cast: name, seat, targets}];

/* ---- unlessPays: `discard` a selector of the card ---- */
{
  const s = play([at(0, "hand", "Ogre", "Gift", "Elk")], [], {}, FIX);
  resolve(s, [{effect: "unlessPays", who: "you", discard: {types: ["Creature"]}, effects: [{effect: "discard", count: 2}]}]);
  const choice = awaitingChoice(s);
  eq([choice.title, labels(s)], ["discard a creature card?", ["Discard Ogre", "Discard Elk", "Don't pay"]], "a creature card: the Ogre and the Elk are ways to pay, the Gift is not");
  resolveAwaiting(s, [choice.options.find((o) => o.label === "Discard Elk").index]);
  eq([graveOf(s), handOf(s), s.awaiting ?? null], [["Elk"], ["Ogre", "Gift"], null], "paid with the Elk: it is discarded, and no two cards are");
}
{
  const s = play([at(0, "hand", "Ogre", "Gift", "Elk")], [], {}, FIX);
  resolve(s, [{effect: "unlessPays", who: "you", discard: {types: ["Creature"]}, effects: [{effect: "discard", count: 2}]}]);
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === "Don't pay").index]);
  eq([s.awaiting?.effect, labels(s)], ["discard", ["Ogre", "Gift", "Elk"]], "not paid: two cards of any kind to discard, the creatures among them");
}
{
  const s = play([at(0, "hand", "Gift", "Gift")], [], {}, FIX);
  resolve(s, [{effect: "unlessPays", who: "you", discard: {types: ["Creature"]}, effects: [{effect: "discard", count: 2}]}]);
  eq(labels(s), ["Don't pay"], "no creature card in hand: not paying is all there is");
}
{
  /* Ward's discard, any card (CR 702.21a), as it was. */
  const s = play([at(0, "hand", "Ogre", "Gift")], [], {}, FIX);
  resolve(s, [{effect: "unlessPays", who: "you", discard: 1, effects: [{effect: "loseLife", who: "you", amount: 1}]}]);
  eq([awaitingChoice(s).title, labels(s)], ["discard a card?", ["Discard Ogre", "Discard Gift", "Don't pay"]], "a plain discard: every card in hand, and the words say a card");
}

/* ---- changeTargets: `may` ---- */
{
  /* Maya's Fork at Rob's Elk and at Rob: each target kept or changed, the first then the second. */
  const s = play([at(0, "battlefield", "Elk"), at(1, "battlefield", "Wastes", "Ogre"), at(1, "hand", "Fork")], stackOn(1, "Fork", [{card: "Elk"}, {player: 0}]), {}, FIX);
  const fork = s.stack[0];
  resolve(s, [{effect: "changeTargets", spells: [fork.objectId], may: true}]);
  let choice = awaitingChoice(s);
  eq([s.awaiting.player, choice.title, labels(s)], [0, "Fork: keep its first target, or choose a new one?", ["Keep Elk", "Ogre"]],
    "Rob, whose effect it is, is asked about Maya's spell: its first target, keep the Elk or the Ogre");
  resolveAwaiting(s, [0]);
  choice = awaitingChoice(s);
  eq([choice.title, labels(s)], ["Fork: keep its second target, or choose a new one?", ["Keep Rob", "Maya"]], "then its second: keep Rob, or Maya");
  resolveAwaiting(s, [1]);
  eq([s.awaiting ?? null, fork.targets.map((t) => [t.kind, t.kind === "player" ? t.id : s.objects[t.id].card])], [null, [["object", "Elk"], ["player", 1]]],
    "the Elk kept, Maya now the player it aims at");
}
{
  /* A counted target's list is kept, as a copy's is; with nothing else to ask, nobody is asked. */
  const s = play([at(0, "battlefield", "Elk"), at(1, "battlefield", "Wastes", "Ogre"), at(1, "hand", "Sweep")], stackOn(1, "Sweep", [[{card: "Elk"}]]), {}, FIX);
  const before = structuredClone(s.stack[0].targets);
  resolve(s, [{effect: "changeTargets", spells: [s.stack[0].objectId], may: true}]);
  eq([s.awaiting ?? null, s.stack[0].targets], [null, before], "up to two target creatures: not asked about, and kept");
}
{
  /* A target with no other legal choice is not asked about. */
  const s = play([at(1, "battlefield", "Wastes", "Rock"), at(1, "hand", "Shatter")], stackOn(1, "Shatter", [{card: "Rock"}]), {}, FIX);
  resolve(s, [{effect: "changeTargets", spells: [s.stack[0].objectId], may: true}]);
  eq(s.awaiting ?? null, null, "the one artifact there is: nothing to choose, and nobody is asked");
}
{
  /* Without `may` it is "change the target": another one, never keeping it (CR 115.7a). */
  const s = play([at(0, "battlefield", "Elk"), at(1, "battlefield", "Wastes", "Ogre"), at(1, "hand", "Bolt")], stackOn(1, "Bolt", [{card: "Elk"}]), {}, FIX);
  const t = structuredClone(s);
  resolve(s, [{effect: "changeTargets", spells: [s.stack[0].objectId]}]);
  ok(!labels(s).some((l) => l.startsWith("Keep")) && labels(s).includes("Ogre"), `change the target: no keeping it (${labels(s).join(", ")})`);
  /* With `may`, a spell of one target: said as its target, not its first. */
  resolve(t, [{effect: "changeTargets", spells: [t.stack[0].objectId], may: true}]);
  eq([awaitingChoice(t).title, labels(t)[0]], ["Bolt: keep its target, or choose a new one?", "Keep Elk"], "may, one target: keep it, or another");
}
{
  /* Wild Ricochet itself: the new target becomes the spell's target -- Thornfist Striker's ward triggers on Maya's Bolt
     turned on it (CR 702.21a). */
  const s = play([at(0, "battlefield", "Thornfist Striker", "Mountain", "Mountain", "Wastes", "Wastes"), at(0, "hand", "Wild Ricochet"),
    at(1, "battlefield", "Wastes"), at(1, "hand", "Bolt")],
  [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Wastes", seat: 1}, {cast: "Bolt", seat: 1, targets: [{player: 0}]}, {pass: 1},
    ...["Mountain", "Mountain", "Wastes", "Wastes"].map((l) => ({tap: l, seat: 0})), {cast: "Wild Ricochet", seat: 0, targets: [{card: "Bolt"}]}, {resolve: true},
    {choose: ["Thornfist Striker"]}, {choose: ["Keep Thornfist Striker"]}], {}, FIX);
  const [bolt, copy, ward] = s.stack;
  eq([bolt.name, bolt.playerId, copy.name, copy.playerId], ["Bolt", 1, "Bolt", 0], "Maya's Bolt, and Rob's copy over it");
  eq([bolt.targets[0], copy.targets[0]].map((t) => s.objects[t.id]?.card), ["Thornfist Striker", "Thornfist Striker"], "both at the Striker now");
  eq([ward?.kind, ward?.name, ward?.script.effects[0].effect, ward?.about.stackId], ["trigger", "Thornfist Striker", "unlessPays", bolt.stackId],
    "and the Striker's ward, triggered by Maya's Bolt becoming its target (CR 702.21a) -- not by Rob's own copy");
}

/* ---- no maximum hand size for the rest of the game ---- */
{
  const s = play([], [], {seats: 3});
  runEffect(s, {effect: "effectUntil", rule: "no-maximum-hand-size", until: "ever"}, {controller: 0, source: null});
  const made = s.effects.find((e) => e.rule === "no-maximum-hand-size");
  eq([made.players, made.until], [[0], null], "its controller's, with no end");
  eq([0, 1, 2].map((p) => playerRuleChanged(s, "no-maximum-hand-size", p)), [true, false, false], "Rob has no maximum hand size; Maya and Trey do");
  runEffect(s, {effect: "effectUntil", rule: "no-maximum-hand-size", until: "ever", who: [2]}, {controller: 0, source: null});
  eq([0, 1, 2].map((p) => playerRuleChanged(s, "no-maximum-hand-size", p)), [true, false, true], "for the players it names: Trey too");
  drive(s, (st) => st.turn === 4 && st.phase === "MAIN1" && st.priorityPlayer !== null, {answer: (st, choice) => (st.awaiting.kind === "discard-to-hand-size" ? choice.options.slice(0, choice.min).map((o) => o.index) : null)});
  eq(playerRuleChanged(s, "no-maximum-hand-size", 0), true, "still so three turns later: for the rest of the game");
}
{
  /* Another rule's effect for a player is not this one. */
  const s = play([], []);
  runEffect(s, {effect: "effectUntil", rule: "life-cant-change", until: "ever"}, {controller: 0, source: null});
  eq(playerRuleChanged(s, "no-maximum-hand-size", 0), false, "his life total can't change: no word about his hand size");
  /* And the statics as before: Reliquary Tower's controller. */
  const t = play([at(1, "battlefield", "Reliquary Tower")], []);
  eq([playerRuleChanged(t, "no-maximum-hand-size", 0), playerRuleChanged(t, "no-maximum-hand-size", 1)], [false, true], "Reliquary Tower: Maya's, not Rob's");
}

/* ---- the table plays every one ---- */
{
  const MINE = ["Thalia, the Survivor", "Thirst for Identity", "Thornfist Striker", "Thoughtweft Lieutenant", "Topiary Lecturer", "Triceraton Commander",
    "Venser, Fervent Forger", "Vinelasher Adept", "Virus Beetle", "Vraska's Final Mercy", "Vraska, the Cutting Glare", "Wild Ricochet", "Winter, Team Player",
    "Winter, Tormented Loner", "Wisdom of Ages", "Zoo Escapees"];
  eq(MINE.filter((name) => !tableCards(name)), [], "the table can play all sixteen");
}

done("an unless cost's discard of a kind, choosing new targets for a spell, and no maximum hand size for the rest of the game");
