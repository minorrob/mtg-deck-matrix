/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* AN ATTACK TAX THE ATTACKER CAN'T PAY (CR 508.1d, 508.1h): every answerer declares only what it can pay for.
 *
 * Found by p4's fuzzed games (tests/engine-x11-leave-questions.mjs, at random): a Goblin that must attack (Goblin
 * Rabblemaster), Maya behind Propaganda and Rob with no mana. The house pilot sent the Goblin at Maya, an attack it could
 * not pay for, and the room's least answer then declared no attack at all -- refused, since the Goblin could attack Trey
 * for free. Neither read the tax. By CR 508.1d a requirement never makes a player pay: the Goblin must attack a player it
 * can attack for free, and need not attack if every way costs. The declare-attackers record now says what each attack
 * takes from the mana the player could pay with (`mana`, and `budget` the most there is, rules/combat.mjs), and every
 * answerer keeps to it: L0 and L1 (game/engine/pilots/), the random pilot, and the room's least answer (game/room/room.mjs).
 */
import assert from "node:assert/strict";
import {table, on, ready, card, bear} from "./helpers/b4-table.mjs";
import {attackers} from "../game/engine/rules/combat.mjs";
import {housePilot, meetRequirements} from "../game/engine/pilots/house-pilot.mjs";
import {scoredPilot} from "../game/engine/pilots/scored-pilot.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {leastAnswer} from "../game/room/room.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

const awaiting = {kind: "declare-attackers", player: 0};
const goblin = {...bear, card: "Goblin", subtypes: ["Goblin"]};
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
/* A Goblin that taps for mana: attacking taps it, so it can't help pay for its own attack (CR 508.1f, 508.1h). */
const manaGoblin = (more = {}) => ({...goblin, card: "Mana Goblin", abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {R: 1}}], ...more});

/* The attack, made on a copy: declared (the requirements held), then paid. The copy's combat, or the refusal thrown. */
function made(s, indices) {
  const t = structuredClone(s);
  t.awaiting = awaiting;
  const picked = attackers.declared(t, awaiting, indices);
  if (picked.length) attackers.payAndAttack(t, awaiting, picked, []);
  return t.combat;
}
const legal = (s, indices) => { try { made(s, indices); return true; } catch { return false; } };
const where = (choice, indices) => indices.map((i) => choice.options[i].label).sort();
/* Every answerer, each given the board's question as the room gives it. */
function answers(s, choice) {
  const view = projectFor(s, 0);
  return [
    ["the house pilot (L0)", housePilot({seat: 0}).answer(view, choice)],
    ["L1 at Normal", scoredPilot({seat: 0}).answer(view, choice)],
    ["L1 at Easy", scoredPilot({seat: 0, setting: "easy", seed: "tax"}).answer(view, choice)],
    ["the room's least answer", leastAnswer(choice)],
    ...Array.from({length: 6}, (_, n) => [`the random pilot ${n}`, randomLegalPilot(createRng(`tax-${n}`)).answer(choice)]),
  ];
}
const board = (build) => { const s = table(3); build(s); s.awaiting = awaiting; return {s, choice: attackers.choice(s, awaiting)}; };

{
  /* The fixed game: the Goblin must attack (its Rabblemaster just arrived), Maya is behind Propaganda and has the lowest
     life, and Rob has no mana. */
  const {s, choice} = board((s) => { on(s, card("Goblin Rabblemaster")); ready(s, on(s, goblin)); on(s, card("Propaganda"), 1); s.players[2].life = 50; });
  const atMaya = choice.options.find((o) => o.defenderId === 1), atTrey = choice.options.find((o) => o.defenderId === 2);
  eq([atMaya.mana, atTrey.mana, choice.budget], [2, undefined, {by: "mana", most: 0}], "the record says what each attack takes from the mana Rob could pay with, and how much there is");
  ok(!legal(s, [atMaya.index]), "the Goblin can't attack Maya: {2} it can't pay (CR 508.1h)");
  ok(!legal(s, []), "and it must attack: it can attack Trey for free (CR 508.1d)");
  for (const [who, answer] of answers(s, choice)) eq(where(choice, answer.indices), ["Goblin → Trey"], `${who} sends the Goblin at Trey, for free`);
}
{
  /* Every way to obey costs mana: no requirement, and no attack is legal (CR 508.1d). */
  const {s, choice} = board((s) => { on(s, card("Goblin Rabblemaster")); ready(s, on(s, goblin)); on(s, card("Propaganda"), 1); on(s, card("Ghostly Prison"), 2); });
  eq([choice.requires, choice.options.map((o) => o.mana)], [undefined, [2, 2]], "with every way costing, the Goblin is required nothing");
  eq(made(s, []) ?? null, null, "the engine accepts no attackers");
  for (const [who, answer] of answers(s, choice)) eq(answer.indices, [], `${who} declares no attack it can't pay for`);
}
{
  /* Two Wastes: one Goblin's attack on Maya can be paid, not two. Each answerer keeps to that, and the second Goblin, which
     must attack, goes at Trey for free. */
  const {s, choice} = board((s) => {
    on(s, card("Goblin Rabblemaster")); ready(s, on(s, goblin)); ready(s, on(s, goblin)); on(s, WASTES); on(s, WASTES);
    on(s, card("Propaganda"), 1); s.players[1].life = 2;
  });
  eq(choice.budget, {by: "mana", most: 2}, "two Wastes, two mana to pay with");
  const both = choice.options.filter((o) => o.defenderId === 1).map((o) => o.index);
  ok(!legal(s, both), "both Goblins at Maya cost {4}: refused");
  for (const [who, answer] of answers(s, choice)) {
    ok(legal(s, answer.indices), `${who}'s attack can be paid for`);
    ok(answer.indices.reduce((n, i) => n + (choice.options[i].mana ?? 0), 0) <= 2, `${who} keeps to the budget`);
  }
  eq(where(choice, housePilot({seat: 0}).answer(projectFor(s, 0), choice).indices), ["Goblin → Maya", "Goblin → Trey"],
    "the house pilot pays for one Goblin at Maya, its target, and sends the other at Trey for free");
}
{
  /* A required Mana Goblin goes at Trey for free, but attacking taps it: of Rob's two mana only the Wastes' is left, so a
     Bear at Maya ({2}) can't be added -- the required attack counted against the budget, by every answerer. */
  const {s, choice} = board((s) => {
    on(s, card("Goblin Rabblemaster")); ready(s, on(s, manaGoblin())); ready(s, on(s, bear)); on(s, WASTES); on(s, card("Propaganda"), 1);
  });
  const bearAtMaya = choice.options.find((o) => o.label === "Bear → Maya");
  ok(!legal(s, [choice.options.find((o) => o.label === "Mana Goblin → Trey").index, bearAtMaya.index]), "the Mana Goblin at Trey and the Bear at Maya can't be paid for");
  for (const [who, answer] of answers(s, choice)) {
    ok(legal(s, answer.indices), `${who}'s attack, the Mana Goblin's included, can be paid for`);
    ok(!answer.indices.includes(bearAtMaya.index), `${who} doesn't add the Bear at Maya`);
  }
}
{
  /* L1 weighs only the attacks it can pay for. Both Bears at Maya would be lethal through her one blocker, but Rob can pay
     for one; one Bear alone at Maya dies to the blocker, so L1 sends both at Trey. */
  const {s, choice} = board((s) => {
    ready(s, on(s, {...bear, card: "Bear", toughness: 2})); ready(s, on(s, {...bear, card: "Bear", toughness: 2})); on(s, WASTES); on(s, WASTES);
    on(s, card("Propaganda"), 1); on(s, {...bear, card: "Wall", power: 3, toughness: 3}, 1); s.players[1].life = 2;
  });
  eq(where(choice, scoredPilot({seat: 0}).answer(projectFor(s, 0), choice).indices), ["Bear → Trey", "Bear → Trey"], "L1 sends both Bears at Trey");
}
{
  /* And each pilot plans with what it can pay for. Both Bears at Maya would be lethal, but Rob can pay for one, which is
     not; both at Trey are lethal and free -- so L0 and L1 (its greedy plan too) send both at Trey. */
  const {s, choice} = board((s) => {
    ready(s, on(s, {...bear, card: "Bear", toughness: 2})); ready(s, on(s, {...bear, card: "Bear", toughness: 2})); on(s, WASTES); on(s, WASTES);
    on(s, card("Propaganda"), 1); s.players[1].life = 3; s.players[2].life = 4;
  });
  for (const [who, pilot] of [["L0", housePilot({seat: 0})], ["L1", scoredPilot({seat: 0})]])
    eq(where(choice, pilot.answer(projectFor(s, 0), choice).indices), ["Bear → Trey", "Bear → Trey"], `${who} sends both Bears at Trey, lethal and free`);
}
{
  /* The least answer spends nothing where nothing need be spent: the required Goblin at Trey for free, not at Maya for the
     {2} Rob could pay. */
  const {choice} = board((s) => { on(s, card("Goblin Rabblemaster")); ready(s, on(s, goblin)); on(s, WASTES); on(s, WASTES); on(s, card("Propaganda"), 1); });
  eq(where(choice, leastAnswer(choice).indices), ["Goblin → Trey"], "the least answer attacks for free");
}
{
  /* A mana creature that attacks is tapped by attacking, so it pays nothing toward the tax (CR 508.1f): its own attack
     takes one more from the budget -- unless it has vigilance (CR 702.20b). */
  const plain = board((s) => { ready(s, on(s, manaGoblin())); on(s, WASTES); on(s, card("Propaganda"), 1); });
  const watchful = board((s) => { ready(s, on(s, manaGoblin({keywords: ["Vigilance"]}))); on(s, WASTES); on(s, card("Propaganda"), 1); });
  eq(plain.choice.options.map((o) => o.mana), [3, 1], "Mana Goblin at Maya takes {2} and its own mana; at Trey, its own mana");
  eq(watchful.choice.options.map((o) => o.mana), [2, undefined], "with vigilance it still pays");
  eq(plain.choice.budget.most, 2, "the Wastes and the Goblin: two mana");
  ok(!legal(plain.s, [0]), "so it can't attack Maya: only the Wastes' {1} is left to pay with");
  ok(legal(watchful.s, [0]), "and the vigilant one can, tapping itself and the Wastes");
}
{
  /* The record is exact: on boards of taxes, mana creatures and vigilance, every set of options keeps to the budget just
     when its attack can be paid for. */
  const boards = [
    (s) => { ready(s, on(s, goblin)); ready(s, on(s, manaGoblin())); ready(s, on(s, manaGoblin({keywords: ["Vigilance"]}))); on(s, WASTES); on(s, card("Propaganda"), 1); },
    (s) => { ready(s, on(s, goblin)); ready(s, on(s, goblin)); on(s, WASTES); on(s, WASTES); on(s, WASTES); on(s, card("Propaganda"), 1); on(s, card("Windborn Muse"), 2); },
    (s) => { ready(s, on(s, manaGoblin())); ready(s, on(s, manaGoblin())); on(s, card("Ghostly Prison"), 2); },
  ];
  for (const build of boards) {
    const {s, choice} = board(build);
    const ids = [...new Set(choice.options.map((o) => o.cardId))];
    /* Each creature at one defender or none: every declaration the record allows. */
    const sets = ids.reduce((acc, id) => acc.flatMap((set) => [set, ...choice.options.filter((o) => o.cardId === id).map((o) => [...set, o.index])]), [[]]);
    for (const set of sets) {
      const fits = set.reduce((n, i) => n + (choice.options[i].mana ?? 0), 0) <= (choice.budget?.most ?? Infinity);
      eq(fits, legal(s, set), `${where(choice, set).join(", ") || "no attack"}: within the budget just when it can be paid`);
    }
  }
}
{
  /* No tax anywhere: the record is as it was, with no budget and no mana on any option. */
  const {choice} = board((s) => { on(s, card("Goblin Rabblemaster")); ready(s, on(s, goblin)); ready(s, on(s, manaGoblin())); on(s, WASTES); });
  eq([choice.budget, choice.options.some((o) => "mana" in o)], [undefined, false], "no attack tax, no budget");
  /* And meetRequirements, given a pick past the budget, keeps what it can pay for. */
  const taxed = board((s) => { on(s, card("Goblin Rabblemaster")); ready(s, on(s, goblin)); on(s, card("Propaganda"), 1); });
  const atMaya = taxed.choice.options.find((o) => o.defenderId === 1).index;
  eq(where(taxed.choice, meetRequirements(taxed.choice, [atMaya], 1)), ["Goblin → Trey"], "a required Goblin that can't be paid for at the preferred player goes where it is free");
}

console.log(`engine-attack-tax-answers: ${checks} checks passed`);
