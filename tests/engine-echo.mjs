/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ECHO (CR 702.30a; Karmic Guide, AI 1's Chulane deck, after the live game of 2026-10-04), AND "UNLESS" A MANA COST WITH
 * COLORS (CR 118.12).
 *
 * "At the beginning of your upkeep, if this permanent came under your control since the beginning of your last upkeep,
 * sacrifice it unless you pay [cost]." The keyword compiles to that trigger (cards/index.mjs): its intervening "if" the
 * condition `sinceYourLastUpkeep` (script/condition.mjs) -- the turn it came under its controller's control, entering or
 * by a change of control (state/index.mjs, controlledSinceTurn), no earlier than that player's previous turn (rules/turn.mjs
 * keeps it) -- asked as it triggers and again as it resolves (CR 603.4); and "unless you pay" a mana cost with its colors
 * (effects/asking.mjs, unlessPays `mana`): from the pool and the payer's plain sources (rules/mana.mjs, unlessPlans), offered
 * only to a payer who has a way, and with more than one way the payer chooses which (CR 605.3a). Paying is always optional
 * (the card's ruling of 2021-06-18).
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {unlessPlans, payPlan} from "../game/engine/rules/mana.mjs";
import {keywordBuilt, missingFor} from "../game/tools/engine-constructs.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const KG = "Karmic Guide";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const later = (seat, zone, ...cards) => ({seat, zone, cards, sick: true});
const table = (setup, steps = [], seats = 2) => runScenario({name: "echo", seats, setup, steps}, index.definition, {}).state;
const rng = createRng("echo");
const echoes = (s) => s.stack.filter((e) => e.kind === "trigger" && e.name === KG);
const labels = (s) => awaitingChoice(s).options.map((o) => o.label);
const answer = (s, label) => resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === label).index], null, rng);
const guide = (s) => s.zones.battlefield.find((id) => s.objects[id].card === KG);
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

{
  /* Two ways to pay {3}{W}{W} -- three Plains and three Wastes -- and which is Rob's (CR 605.3a). */
  const s = table([later(0, "battlefield", KG, "Plains", "Plains", "Plains", "Wastes", "Wastes", "Wastes")]);
  goTo(s, 3, "UPKEEP");
  eq(echoes(s).length, 1, "it came under his control this turn of his last: echo at his next upkeep");
  settle(s);
  eq([awaitingChoice(s).title, labels(s)], ["Karmic Guide: pay {3}{W}{W}?", ["Pay {3}{W}{W}", "Don't pay"]], "asked to pay {3}{W}{W}, in so many words");
  answer(s, "Pay {3}{W}{W}");
  eq(labels(s).length, 2, "two ways: asked which");
  const third = labels(s).find((l) => (l.match(/Plains/g) ?? []).length === 3);
  answer(s, third);
  const tapped = (card) => s.zones.battlefield.filter((id) => s.objects[id].card === card && s.objects[id].tapped).length;
  eq([tapped("Plains"), tapped("Wastes"), guide(s) !== undefined], [3, 2, true], "the way he chose: three Plains and two Wastes tapped, and it stays");
}
{
  /* No white source: he has no way to pay -- only Don't pay -- and it is sacrificed. */
  const s = table([later(0, "battlefield", KG, "Wastes", "Wastes", "Wastes", "Wastes", "Wastes")]);
  goTo(s, 3, "UPKEEP");
  settle(s);
  eq(labels(s), ["Don't pay"], "five Wastes cannot pay {W}{W}");
  answer(s, "Don't pay");
  eq([guide(s), s.zones.graveyard[0].map((id) => s.objects[id].card)], [undefined, [KG]], "sacrificed");
}
{
  /* Mana already in his pool pays first, with the rest from his lands. */
  const s = table([later(0, "battlefield", KG, "Plains", "Plains", "Wastes", "Wastes", "Wastes")]);
  goTo(s, 3, "UPKEEP");
  for (const id of s.zones.battlefield.filter((x) => s.objects[x].card === "Plains")) applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.objectId === id));
  eq(s.players[0].manaPool.W, 2, "{W}{W} in his pool");
  settle(s);
  answer(s, "Pay {3}{W}{W}");
  eq([s.players[0].manaPool.W, s.zones.battlefield.filter((id) => s.objects[id].card === "Wastes" && s.objects[id].tapped).length, guide(s) !== undefined], [0, 3, true],
    "the pool's {W}{W} spent and the three Wastes tapped: one way, not asked");
}
{
  /* Under Maya's control since before her last upkeep: no echo for her. Rob gains control of it: since his last upkeep it
     came under HIS control, and at his next upkeep he is asked (the card's ruling of 2021-06-18). */
  const t = table([later(1, "battlefield", KG, "Plains", "Plains", "Wastes", "Wastes", "Wastes")]);
  goTo(t, 2, "UPKEEP");
  eq(echoes(t).length, 1, "Maya's first upkeep since it entered (on Rob's turn): echo");
  settle(t);
  answer(t, "Pay {3}{W}{W}");
  goTo(t, 4, "UPKEEP");
  eq([t.players[1].previousTurnBegan, echoes(t).length], [2, 0], "her next: hers since before her last upkeep (turn 2), so none");
  runEffect(t, {effect: "gainControl", targets: [guide(t)]}, {controller: 0, source: null});
  goTo(t, 5, "UPKEEP");
  eq([echoes(t).length, echoes(t)[0]?.playerId], [1, 0], "Rob took it on turn 4: at his upkeep on turn 5, his echo");
}
{
  /* Asked again as it resolves (CR 603.4): gone in response, and nothing is asked. */
  const s = table([later(0, "battlefield", KG, "Plains", "Plains", "Wastes", "Wastes", "Wastes")]);
  goTo(s, 3, "UPKEEP");
  runEffect(s, {effect: "moveZone", targets: [guide(s)], to: "hand"}, {controller: 1, source: null});
  settle(s);
  eq([s.awaiting, s.stack.length], [null, 0], "returned to his hand with its echo waiting: the echo does nothing");
}

/* The keyword, compiled; the schema; the ways to pay. */
{
  const script = (cost) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "t", types: ["Creature"], manaCost: "{1}", power: 1, toughness: 1}, oracleText: "x",
    abilities: [{kind: "keyword", text: "Echo", keyword: "echo", cost}]});
  const echo = compileScript(script([{atom: "mana", cost: "{1}{G}"}])).definition.abilities[0];
  eq([echo.kind, echo.trigger.phase, echo.condition, echo.effects[0].effect, echo.effects[0].mana], ["triggered", "UPKEEP", {sinceYourLastUpkeep: true}, "unlessPays", "{1}{G}"],
    "echo {1}{G}: an upkeep trigger, its intervening if, unless you pay {1}{G}");
  eq(compileScript(script([{atom: "discard"}])).definition, null, "an echo cost that is not mana: refused");
  const spell = (effect) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "t", types: ["Sorcery"], manaCost: "{1}"}, oracleText: "x",
    abilities: [{kind: "spell", text: "x", targets: [], effects: [effect]}]});
  const sac = [{effect: "draw", count: 1}];
  eq([validateScript(spell({effect: "unlessPays", mana: "{3}{W}{W}", effects: sac})).valid, validateScript(spell({effect: "unlessPays", mana: "{X}{W}", effects: sac})).valid,
    validateScript(spell({effect: "unlessPays", mana: "{W}", amount: 1, effects: sac})).valid], [true, false, false], "a mana cost: valid; with X, or beside a generic amount: refused");
  const s = table([at(0, "battlefield", "Plains", "Island")]);
  const {units, plans} = unlessPlans(s, 0, "{W}{U}");
  eq(plans.length, 1, "{W}{U} from a Plains and an Island: one way");
  payPlan(s, 0, units, plans[0]);
  eq(s.zones.battlefield.every((id) => s.objects[id].tapped), true, "paid: both tapped");
  assert.throws(() => payPlan(s, 0, units, plans[0]), /no longer there/, "and not twice");
  checks += 1;
  eq(unlessPlans(s, 0, "{W}{U}").plans, [], "nothing left to pay with: no way");
  eq([keywordBuilt("Echo"), missingFor({apis: ["ChangeZone"], triggers: ["ChangesZone"], keywords: ["Flying", "Protection from black", "Echo"]})], [true, []], "the catalog: Karmic Guide's keywords built");
}

console.log(`engine-echo: ${checks} checks passed -- echo at the upkeep after it came under your control, entering or by a change of control, asked again as it resolves; and "unless" a mana cost with colors, from pool and lands, the way the payer chooses.`);
