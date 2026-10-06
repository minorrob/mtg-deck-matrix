/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* REBOUND (CR 702.88; Ephemerate, AI 1's Chulane deck, after the live game of 2026-10-04).
 *
 * "If this spell was cast from your hand, instead of putting it into your graveyard as it resolves, exile it and, at the
 * beginning of your next upkeep, you may cast this card from exile without paying its mana cost." The keyword is kept as
 * the static `rebound` (cards/index.mjs), read as the spell leaves the stack (rules/stack.mjs): cast from its owner's hand
 * and resolved, it is exiled and a delayed trigger made (CR 603.7d, its caster's) that waits for THEIR next upkeep
 * (`yours`, rules/trigger.mjs) and offers the cast free (effects/asking.mjs, `play`; CR 608.2g). Cast from anywhere else,
 * countered, or with every target illegal: the graveyard, no rebound (the card's rulings of 2019-06-14). A copy was not
 * cast. The card moved out of exile meanwhile is a new object, and nothing is cast; with no legal target, nothing is asked
 * and it stays in exile.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {pushCopy} from "../game/engine/rules/stack.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {STATIC_RULES} from "../game/engine/rules/statics.mjs";
import {keywordBuilt, missingFor} from "../game/tools/engine-constructs.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const EP = "Ephemerate";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Healer: {types: ["Creature"], subtypes: ["Cleric"], manaCost: "{1}{W}", colors: ["W"], power: 1, toughness: 1}};
const table = (setup, steps = [], seats = 2) => runScenario({name: "rebound", seats, setup, steps}, index.definition, FIX).state;
const rng = createRng("rebound");
const cards = (s, zone, seat = 0) => (zone === "exile" ? s.zones.exile : s.zones[zone][seat]).map((id) => s.objects[id].card).sort();
const reboundTriggers = (s) => (s.delayedTriggers ?? []).filter((d) => d.at === "upkeep" && d.yours);
/* Everyone passes until the stack is empty or something is asked. */
const settle = (s) => { for (let n = 0; n < 40 && s.stack.length && !s.awaiting; n += 1) passPriority(s, null, rng); };
/* The game on to a step, as the room plays it; it stops early at a question nobody routinely answers. */
function goTo(s, turn, phase) {
  for (let n = 0; n < 3000; n += 1) {
    if (s.turn === turn && s.phase === phase && s.priorityPlayer !== null && !s.awaiting) return;
    if (s.awaiting) {
      const kind = s.awaiting.kind;
      if (kind === "order-triggers") resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index));
      else if (kind === "declare-attackers" || kind === "declare-blockers") resolveAwaiting(s, []);
      else return;
    } else if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s, null, rng).outcome === "step-ends") advance(s);
  }
  throw new Error(`never reached turn ${turn} ${phase}`);
}
const CAST = [{tap: "Plains"}, {cast: EP, targets: [{card: "Healer"}]}];

{
  /* Cast from his graveyard, by a permission (mayPlay): not from his hand -- to the graveyard, no rebound. */
  const s = table([at(0, "battlefield", "Plains", "Healer"), at(0, "graveyard", EP)]);
  runEffect(s, {effect: "mayPlay", targets: s.zones.graveyard[0], until: "end-of-turn"}, {controller: 0, source: null});
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === EP));
  settle(s);
  eq([cards(s, "graveyard"), cards(s, "exile"), reboundTriggers(s).length], [[EP], [], 0], "cast from a graveyard: back to the graveyard, nothing waiting");
}
{
  /* A copy was not cast (CR 707.10): it ceases to exist; the original, cast from his hand, rebounds -- once. */
  const s = table([at(0, "battlefield", "Plains", "Healer", "Healer"), at(0, "hand", EP)], CAST);
  const copy = pushCopy(s, s.stack[0], {controller: 0});
  /* The copy aimed at the other Healer, as a new target chosen for it would be (CR 707.10c). */
  copy.targets = [{kind: "object", id: s.zones.battlefield.filter((id) => s.objects[id].card === "Healer").find((id) => id !== s.stack[0].targets[0].id)}];
  settle(s);
  eq([cards(s, "exile"), cards(s, "graveyard"), reboundTriggers(s).length], [[EP], [], 1], "the copy gone, the card exiled, one rebound waiting");
}
{
  /* Countered: it never resolved -- the graveyard. */
  const s = table([at(0, "battlefield", "Plains", "Healer"), at(0, "hand", EP)], CAST);
  runEffect(s, {effect: "counterSpell", spells: [s.stack[0].objectId]}, {controller: 1, source: null});
  eq([cards(s, "graveyard"), cards(s, "exile"), reboundTriggers(s).length], [[EP], [], 0], "countered: to the graveyard, no rebound");
}
{
  /* Three players: the rebound waits for Rob's upkeep -- not Maya's or Trey's. */
  const s = table([at(0, "battlefield", "Plains", "Healer"), at(0, "hand", EP)], [...CAST, {resolve: true}], 3);
  goTo(s, 2, "UPKEEP");
  eq([s.stack.length, s.awaiting], [0, null], "Maya's upkeep: nothing");
  goTo(s, 3, "UPKEEP");
  eq([s.stack.length, s.awaiting], [0, null], "Trey's upkeep: nothing");
  goTo(s, 4, "UPKEEP");
  eq([s.stack.map((e) => e.kind), s.stack[0]?.playerId], [["trigger"], 0], "Rob's upkeep: his rebound trigger");
  settle(s);
  eq(awaitingChoice(s).options.map((o) => o.label), ["Ephemerate → Healer", "Don't cast"], "and he is asked whether to cast it");
}
{
  /* The card moved out of exile before his upkeep: a new object (CR 400.7) -- nothing to cast, nothing asked. */
  const s = table([at(0, "battlefield", "Plains", "Healer"), at(0, "hand", EP)], [...CAST, {resolve: true}]);
  runEffect(s, {effect: "moveZone", targets: s.zones.exile.slice(), to: "graveyard"}, {controller: 1, source: null});
  goTo(s, 3, "UPKEEP");
  settle(s);
  eq([s.awaiting, s.stack.length, cards(s, "graveyard")], [null, 0, [EP]], "it left exile: the trigger does nothing");
}
{
  /* No legal target at his upkeep: he can't cast it, so nothing is asked, and it stays exiled (the card's ruling). */
  const s = table([at(0, "battlefield", "Plains", "Healer"), at(0, "hand", EP)], [...CAST, {resolve: true}]);
  runEffect(s, {effect: "moveZone", targets: s.zones.battlefield.filter((id) => s.objects[id].card === "Healer"), to: "graveyard"}, {controller: 1, source: null});
  goTo(s, 3, "UPKEEP");
  settle(s);
  eq([s.awaiting, cards(s, "exile"), reboundTriggers(s).length], [null, [EP], 0], "no creature of his: nothing asked, Ephemerate stays in exile for good");
}

/* The keyword: an instant's or a sorcery's; the static it becomes; the catalog's credit. */
{
  const script = (types) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "t", types, manaCost: "{1}", ...(types.includes("Creature") ? {power: 1, toughness: 1} : {})}, oracleText: "x",
    abilities: [...(types.includes("Instant") ? [{kind: "spell", text: "x", targets: [], effects: [{effect: "draw", count: 1}]}] : []), {kind: "keyword", text: "Rebound", keyword: "rebound"}]});
  const instant = compileScript(script(["Instant"])).definition;
  eq([instant.keywords, instant.abilities.map((a) => a.rule)], [["Rebound"], ["rebound"]], "an instant: the keyword, and the static rebound");
  eq(compileScript(script(["Creature"])).problems.some((p) => /rebound on a card that is not an instant or sorcery/.test(p)), true, "a creature: refused");
  eq([STATIC_RULES.rebound, keywordBuilt("Rebound")], ["rules/stack.mjs", true], "read by rules/stack.mjs, and credited");
  eq(missingFor({apis: ["ChangeZone", "Cleanup"], keywords: ["Rebound"]}), [], "nothing missing for Ephemerate");
}

console.log(`engine-rebound: ${checks} checks passed -- cast from hand and resolved, exiled and cast free at its caster's next upkeep; from anywhere else, countered or a copy, not; gone from exile or with no target, nothing.`);
