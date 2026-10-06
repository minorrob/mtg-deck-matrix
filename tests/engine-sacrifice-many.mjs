/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "{T}, SACRIFICE TEN NONLAND PERMANENTS: EACH OPPONENT LOSES 10 LIFE" (Bolas's Citadel; AI 2's Kiora deck).
 *
 * A sacrifice of many in an activated ability's cost (rules/actions.mjs): one offer for each set while the sets are few, as
 * "sacrifice two other creatures" always was; past CREW_OFFERS_MAX of them one offer (`sacrificeLater`), and which ones are
 * asked once it is taken (choose-cost), before anything is paid or put on the stack (CR 602.2b, 601.2h) -- each set checked
 * again as it is paid. The source itself may be one of them: the cost does not say "other". The card scenarios play the
 * Citadel; this suite holds the threshold, the refusals and four players.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (fn, pattern, m) => { assert.throws(fn, pattern, m); checks += 1; };

const cards = loadCardIndex();
const CIT = "Bolas's Citadel";
const FIX = {Shrine: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: []}};
const at = (seat, zone, ...list) => ({seat, zone, cards: list});
const table = (shrines, seats = 2) => runScenario({name: "sacrifice many", seats, setup: [at(0, "battlefield", CIT, "Forest", ...Array(shrines).fill("Shrine"))]}, cards.definition, FIX).state;
const activations = (s) => legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === CIT);

/* ---- the threshold: listed while the sets are few, asked after past that ---- */
{
  eq(activations(table(8)).length, 0, "nine nonland permanents, the Citadel among them: not ten, not offered");
  const ten = activations(table(9));
  eq([ten.length, ten[0].costNames.length, ten[0].sacrificeLater], [1, 10, undefined], "ten: one set, the Citadel and nine Shrines, listed with the offer");
  eq(activations(table(10)).length, 11, "eleven: eleven sets, each its own offer");
  const twelve = activations(table(11));
  eq([twelve.length, twelve[0].sacrificeLater, twelve[0].costChoice], [1, 10, undefined], "twelve: sixty-six sets -- one offer, the ten asked once it is taken");
}

/* ---- asked, refused, then paid ---- */
{
  const s = table(11, 4);
  const [offer] = activations(s);
  applyAction(s, 0, offer);
  eq([s.awaiting?.kind, s.stack.length, s.objects[s.zones.battlefield.find((id) => s.objects[id].card === CIT)].tapped], ["choose-cost", 0, false], "asked before anything: not on the stack, not tapped");
  const choice = awaitingChoice(s);
  eq([choice.min, choice.max, choice.options.length, choice.options.some((o) => o.label === "Forest")], [10, 10, 12, false], "ten of the twelve nonland permanents; never the Forest");
  throws(() => resolveAwaiting(s, choice.options.slice(0, 9).map((o) => o.index)), /Invalid selection/, "nine is refused");
  throws(() => applyAction({...s, awaiting: null, priorityPlayer: 0}, 0, {...offer, sacrificeSet: [s.zones.battlefield.find((id) => s.objects[id].card === "Forest"), ...choice.options.slice(0, 9).map((o) => o.cardId)]}),
    /Choose ten permanents/, "a set with the Forest in it is refused, by what to choose");
  resolveAwaiting(s, choice.options.slice(2).map((o) => o.index));
  eq([s.stack.length, s.zones.graveyard[0].length], [1, 10], "chosen: ten sacrificed, the ability on the stack");
  const left = s.zones.battlefield.map((id) => s.objects[id].card).sort();
  eq(left, [CIT, "Forest", "Shrine"], "the two not chosen -- the Citadel among them -- stay");
  ok(s.objects[s.zones.battlefield.find((id) => s.objects[id].card === CIT)].tapped, "and the Citadel is tapped");
  s.players[2].lost = true;
  for (let n = 0; n < 8 && s.stack.length; n += 1) passPriority(s, null, null);
  eq(s.players.map((p) => p.life), [40, 30, 40, 30], "each opponent still in the game loses 10; Rob loses nothing");
}

console.log(`engine-sacrifice-many: ${checks} checks passed -- a sacrifice of many listed while it is few, asked once taken past that, checked again as it is paid.`);
