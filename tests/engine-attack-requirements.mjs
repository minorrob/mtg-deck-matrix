/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 508.1c-d: restrictions first, then as many requirements as possible; paying an attack cost is optional. */
import assert from "node:assert/strict";
import {table, on, ready, card, bear} from "./helpers/b4-table.mjs";
import {attackers} from "../game/engine/rules/combat.mjs";
import {housePilot, meetRequirements} from "../game/engine/pilots/house-pilot.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {createController} from "../game/engine/controller.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const awaiting = {kind: "declare-attackers", player: 0};
const goblin = {...bear, card: "Goblin", subtypes: ["Goblin"]};
{
  const s = table(4);
  const rabble = ready(s, on(s, card("Goblin Rabblemaster")));
  const required = ready(s, on(s, goblin));
  ready(s, on(s, bear));
  const sick = on(s, goblin), tapped = ready(s, on(s, goblin)); s.objects[tapped].tapped = true;
  const choice = attackers.choice(s, awaiting);
  eq(choice.requires.map((r) => [r.values, r.least]), [[[required], 1]], "only another ready Goblin must attack, not the source, a Bear, a tapped Goblin or a sick Goblin");
  ok(!choice.options.some((o) => o.cardId === sick), "sickness still prevents the required creature attacking");
  assert.throws(() => attackers.declared(s, awaiting, []), /Goblin.*has to attack.*Declare/s); checks += 1;
  const c = createController(); c.offer(choice);
  assert.throws(() => c.answer({kind: "answer", choiceId: choice.id, indices: [], actionId: "00000000-0000-4000-8000-000000000001", revision: c.revision}), /Goblin.*has to attack.*Declare/s); checks += 1;
  for (const answer of [housePilot({seat: 0}).answer(projectFor(s, 0), choice), randomLegalPilot({int: () => 0}).answer(choice)]) {
    ok(answer.indices.some((i) => choice.options[i].cardId === required), "each pilot includes the required Goblin even when it would prefer no attack");
    attackers.declared(s, awaiting, answer.indices); checks += 1;
  }
  const voluntary = choice.options.find((o) => o.cardId === rabble);
  ok(meetRequirements(choice, [voluntary.index]).includes(voluntary.index), "fulfilling requirements preserves an optional attack already chosen");
}
{
  const s = table(2); on(s, card("Goblin Rabblemaster")); ready(s, on(s, goblin)); on(s, card("Propaganda"), 1);
  eq(attackers.choice(s, awaiting).requires, undefined, "a cost on the only opponent makes attacking optional");
  eq(attackers.declared(s, awaiting, []), [], "the engine accepts declining to pay that cost");
}
{
  const s = table(2); on(s, card("Goblin Rabblemaster"));
  ready(s, on(s, goblin)); ready(s, on(s, goblin));
  const pw = on(s, card("The Eternal Wanderer"), 1);
  on(s, {card: "No player attacks", types: ["Enchantment"], abilities: [{kind: "static", rule: "cant-attack", affects: {types: ["Creature"]}, defender: "you"}]}, 1);
  const choice = attackers.choice(s, awaiting);
  eq(choice.requires[0].least, 1, "two Goblins able to attack only a one-attacker planeswalker require exactly one");
  eq(choice.options.every((o) => o.planeswalkerId === pw), true, "the restriction on attacking a player leaves their planeswalker available");
  const filled = meetRequirements(choice, []);
  eq(filled.length, 1, "pilot requirement completion respects the planeswalker cap");
  attackers.declared(s, awaiting, filled); checks += 1;
}
{
  /* Two Rabblemasters each require the other's attack once and the token's attack twice (CR 508.1d). With one available
     place at The Eternal Wanderer, a token must attack; a second token ties it and either is the player's choice. */
  for (const tokenCount of [1, 2]) {
    const s = table(2);
    const masters = [ready(s, on(s, card("Goblin Rabblemaster"))), ready(s, on(s, card("Goblin Rabblemaster")))];
    const tokens = Array.from({length: tokenCount}, () => ready(s, on(s, {...goblin, card: "Required Goblin", token: true})));
    on(s, card("The Eternal Wanderer"), 1);
    on(s, {card: "Player protected", types: ["Enchantment"], abilities: [{kind: "static", rule: "cant-attack", affects: {types: ["Creature"]}, defender: "you"}]}, 1);
    const choice = attackers.choice(s, awaiting);
    const pick = (id) => choice.options.find((o) => o.cardId === id).index;
    for (const master of masters) {
      assert.throws(() => attackers.declared(s, awaiting, [pick(master)]), /Required Goblin.*Declare/s); checks += 1;
      const controller = createController(); controller.offer(choice);
      assert.throws(() => controller.answer({kind: "answer", choiceId: choice.id, indices: [pick(master)], actionId: "00000000-0000-4000-8000-000000000002", revision: controller.revision}), /Required Goblin.*Declare/s); checks += 1;
    }
    for (const token of tokens) {
      eq(attackers.declared(s, awaiting, [pick(token)]).map((o) => o.cardId), [token], "each token tied for the maximum requirements remains a legal choice");
      const controller = createController(); controller.offer(choice);
      controller.answer({kind: "answer", choiceId: choice.id, indices: [pick(token)], actionId: "00000000-0000-4000-8000-000000000003", revision: controller.revision}); checks += 1;
    }
    for (const answer of [housePilot({seat: 0}).answer(projectFor(s, 0), choice), randomLegalPilot({int: () => 0}).answer(choice)]) {
      eq(answer.indices.length, 1, "the pilots respect the one-creature cap with overlapping requirements");
      ok(tokens.includes(choice.options[answer.indices[0]].cardId), "each pilot chooses an attacker that satisfies two requirements rather than one");
      attackers.declared(s, awaiting, answer.indices); checks += 1;
    }
  }
}
{
  const s = table(); const id = ready(s, on(s, goblin));
  on(s, {card: "Conditional orders", types: ["Enchantment"], abilities: [{kind: "static", rule: "attacks-each-combat", affects: {types: ["Creature"], controller: "you"}, condition: {present: {types: ["Land"], controller: "you"}, atLeast: 1}}]});
  eq(attackers.choice(s, awaiting).requires, undefined, "an unmet static condition imposes no attack requirement");
  on(s, {card: "Forest", types: ["Land"]});
  eq(attackers.choice(s, awaiting).requires[0].values, [id], "the requirement appears as soon as its static condition holds");
}
{
  const choice = {options: [{index: 0, cardId: 1, planeswalkerId: 10}, {index: 1, cardId: 2, planeswalkerId: 10}], exclusiveBy: "cardId", capped: {most: {10: 1}}, requires: [{by: "cardId", values: [2], least: 1}]};
  eq(meetRequirements(choice, [0]), [1], "a required attack replaces an optional attack occupying the only legal slot");
  choice.options.push({index: 2, cardId: 3, defenderId: 1});
  eq(meetRequirements(choice, [0, 2]), [1, 2], "replanning retains an optional attack that does not compete for the required slot");
}
{
  const s = table(); on(s, card("Goblin Rabblemaster"));
  const flexible = ready(s, on(s, {...goblin, card: "Flexible Goblin"}));
  const tight = ready(s, on(s, {...goblin, card: "Restricted Goblin", subtypes: ["Goblin", "Rogue"]}));
  const capped = on(s, card("The Eternal Wanderer"), 1);
  const open = on(s, {card: "Open planeswalker", types: ["Planeswalker"], loyalty: 5}, 2);
  for (const seat of [1, 2]) on(s, {card: "Players protected", types: ["Enchantment"], abilities: [{kind: "static", rule: "cant-attack", affects: {types: ["Creature"]}, defender: "you"}]}, seat);
  on(s, {card: "Rogues forbidden", types: ["Enchantment"], abilities: [{kind: "static", rule: "cant-attack", affects: {subtypes: ["Rogue"]}, defender: "you", planeswalkers: true}]}, 2);
  const choice = attackers.choice(s, awaiting);
  eq(choice.requires.map((r) => [r.values, r.least]), [[[flexible], 1], [[tight], 1]], "the engine distinguishes a flexible required attacker from one restricted to the capped planeswalker");
  const original = choice.options.find((o) => o.cardId === flexible && o.planeswalkerId === capped).index;
  for (const answer of [meetRequirements(choice, []), meetRequirements(choice, [original]), housePilot({seat: 0}).answer(projectFor(s, 0), choice).indices, randomLegalPilot({int: () => 0}).answer(choice).indices]) {
    eq(answer.map((i) => [choice.options[i].cardId, choice.options[i].planeswalkerId]), [[flexible, open], [tight, capped]], "requirements across groups backtrack to reserve the capped slot for the restricted attacker");
    attackers.declared(s, awaiting, answer); checks += 1;
  }
}
{
  const choice = {options: [{index: 0, cardId: 1, planeswalkerId: 10}, {index: 1, cardId: 1, planeswalkerId: 11}, {index: 2, cardId: 2, planeswalkerId: 10}], capped: {most: {10: 1, 11: 1}}, requires: [{by: "cardId", values: [1, 2], least: 2}]};
  eq(meetRequirements(choice, []), [1, 2], "completion backtracks when its first placement would block the second attacker");
}
eq(missingFor({statics: ["MustAttack"]}), [], "the catalog credits the implemented attack requirement");
console.log(`engine-attack-requirements: ${checks} checks passed`);
