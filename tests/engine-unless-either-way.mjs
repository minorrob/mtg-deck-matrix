/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "UNLESS ITS CONTROLLER PAYS {2}. IF THEY DO, YOU ..." -- AN OUTCOME EITHER WAY (Divert Disaster; AI 1's Chulane deck,
 * after the live game of 2026-10-04; CR 118.12a).
 *
 * unlessPays' `whenPaid` (effects/asking.mjs): `effects` if the cost is not paid, `whenPaid` if it is -- each done by the
 * effect's controller, not the payer, as the resolution carries on with them ("you create a Lander token", CR 111.10u).
 * Named, not built before: "If they do" was the payer's own "you may pay ... if you do" (`ifPaid`), which does nothing when
 * the payment is refused.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const DV = "Divert Disaster";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const gift = (extra = []) => ({types: ["Instant"], manaCost: "{C}", abilities: extra, spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}});
const FIX = {Gift: gift(), "Sure Gift": gift([{id: "u", kind: "static", text: "This spell can't be countered.", rule: "cant-be-countered", affects: {what: "spell", self: true}}])};
const rng = createRng("either way");
const play = (scenario) => runScenario({name: "either way", setup: [], ...scenario}, index.definition, FIX).state;
const labels = (s) => awaitingChoice(s).options.map((o) => o.label);
const answer = (s, label) => resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === label).index], null, rng);
const settle = (s) => { for (let n = 0; n < 40 && s.stack.length && !s.awaiting; n += 1) passPriority(s, null, rng); };
const landers = (s) => s.zones.battlefield.filter((id) => s.objects[id].card === "Lander").map((id) => s.objects[id].controller);
/* A spell cast by `caster` on their turn, and Rob's Divert Disaster at it; the question is Maya's or Trey's. */
const divert = (caster, spell, lands, seats = 2) => play({seats,
  setup: [at(0, "battlefield", "Island", "Wastes"), at(0, "hand", DV), at(caster, "hand", spell), at(caster, "battlefield", ...lands)],
  /* On the caster's turn (the active player passes first, CR 117.3d: the next in turn order is Rob, whoever cast it). */
  steps: [{to: {turn: caster + 1, phase: "MAIN1"}}, {tap: lands[0], seat: caster}, {cast: spell, seat: caster}, {pass: 1},
    {tap: "Island", seat: 0}, {tap: "Wastes", seat: 0}, {cast: DV, seat: 0, targets: [{card: spell}]}, {resolve: true}]});

{
  /* Three players: Trey's spell, Rob's Divert Disaster, Trey pays -- and the Lander is Rob's, not Trey's or Maya's. */
  const s = divert(2, "Gift", ["Wastes", "Wastes", "Wastes"], 3);
  eq([s.awaiting?.player, labels(s)], [2, ["Pay {2}", "Don't pay"]], "Trey, its controller, is asked");
  answer(s, "Pay {2}");
  settle(s);
  eq([landers(s), s.players[2].life], [[0], 41], "Trey paid: his spell resolved, and Rob created the Lander");
}
{
  /* "If they do": paid with a choice of mana, the Lander follows the payment's own question. */
  const s = divert(1, "Gift", ["Wastes", "Island", "Forest", "Wastes"]);
  answer(s, "Pay {2}");
  eq(awaitingChoice(s).title, "Pay {2}: choose the mana", "an Island, a Forest and a Wastes: which two is Maya's");
  resolveAwaiting(s, [0, 1], null, rng);
  eq(landers(s), [0], "then Rob's Lander");
}
{
  /* A spell that can't be countered (CR 101.2): not paid, nothing happens to it; paid, Rob still has his Lander. */
  const s = divert(1, "Sure Gift", ["Wastes", "Wastes", "Wastes"]);
  answer(s, "Don't pay");
  settle(s);
  eq([landers(s), s.players[1].life], [[], 41], "not paid: no counter (it can't be), no Lander");
  const t = divert(1, "Sure Gift", ["Wastes", "Wastes", "Wastes"]);
  answer(t, "Pay {2}");
  settle(t);
  eq([landers(t), t.players[1].life], [[0], 41], "paid: the Lander");
}

/* The grammar: what follows paying is a list of effects, held to the same rules as what follows not paying. */
{
  const script = (unless) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "t", types: ["Instant"], manaCost: "{1}"}, oracleText: "x",
    abilities: [{kind: "spell", text: "x", targets: [{what: "spell"}], effects: [{effect: "unlessPays", who: {controllerOf: {target: 0}}, amount: 2, effects: [{effect: "counterSpell", spells: {target: 0}}], ...unless}]}]});
  eq(validateScript(script({whenPaid: [{effect: "draw", count: 1}]})).valid, true, "whenPaid: a list of effects");
  eq(validateScript(script({whenPaid: {effect: "draw", count: 1}})).valid, false, "not a list: refused");
  eq(validateScript(script({whenPaid: [{effect: "drawCards", count: 1}]})).valid, false, "a primitive the catalog lacks: refused");
  eq(validateScript(script({whenPaid: [{effect: "destroy", targets: {target: 1}}]})).valid, false, "a target not declared: refused");
  eq(compileScript(script({whenPaid: [{effect: "discover", count: 1}]})).problems.some((p) => /discover: declared, not built/.test(p)), true, "a primitive not built: the card refused by name");
}

console.log(`engine-unless-either-way: ${checks} checks passed -- "unless its controller pays; if they do, you ...": either outcome, by the effect's controller, after any question of which mana; held to the effect grammar.`);
