/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "FOR EACH CARD TYPE AMONG CARDS DISCARDED THIS WAY" (Rob's Priority Batch 10.3, its thirty-second slice: Occult
 * Epiphany, the 93rd card of Rob's list).
 *
 * `{cardTypesAmong: "remembered"}` (script/amount.mjs): the card types (CR 205.2a) that what the effect before it
 * remembered has between them -- the discard remembers the cards it made (`remember`), an artifact creature counts as
 * two. Like the other "this way" counts it is bound as a delayed trigger is made (script/bind.mjs, rememberNow), which now
 * has the state to read the cards with.
 *
 * The card scenarios play Occult Epiphany: three types from three cards, three from two. This suite holds the count, its
 * schema and the binding.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {rememberNow} from "../game/engine/script/bind.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const s = createState({matchId: "m", seed: "types", players: [{name: "Rob"}, {name: "Maya"}]});
const put = (card, types) => addObject(s, {card, types, owner: 0, controller: 0}, "graveyard", 0);
const bear = put("Bear", ["Creature"]), construct = put("Construct", ["Artifact", "Creature"]), forest = put("Forest", ["Land"]), island = put("Island", ["Land"]);
const types = (remembered) => amountOf(s, {cardTypesAmong: "remembered"}, {controller: 0, remembered});

eq([types([bear]), types([forest, island]), types([bear, forest]), types([construct, forest]), types([bear, construct, forest])], [1, 1, 2, 3, 3],
  "a Bear: one type; two lands: one; a Bear and a Forest: two; an artifact creature and a Forest: three; all three cards: three");
eq(types([]), 0, "nothing remembered: none");
eq(amountProblems({cardTypesAmong: "remembered"}), [], "the schema takes it");
ok(amountProblems({cardTypesAmong: "graveyard"}).length > 0, "of what was remembered, and nothing else");
{
  const [bound] = rememberNow([{effect: "createToken", count: {cardTypesAmong: "remembered"}, token: {predefined: "Clue"}}], {controller: 0, remembered: [construct, forest]}, {state: s});
  eq(bound.count, 3, "a delayed trigger made now counts them now, with the state to read them");
}
{
  /* And through the effect that makes one: delayedTrigger hands rememberNow the state. */
  runEffects(s, [{effect: "delayedTrigger", at: "end step", effects: [{effect: "createToken", count: {cardTypesAmong: "remembered"}, token: {predefined: "Clue"}}]}],
    {controller: 0, source: null, remembered: [bear, forest]});
  eq(s.delayedTriggers.at(-1).effects[0].count, 2, "a delayed trigger at the next end step: two card types, counted as it was made");
}
ok(loadCardIndex().resolve("Occult Epiphany")?.playable === true, "Occult Epiphany is defined and playable");

console.log(`engine-card-types-among: ${checks} checks passed -- the card types among what was remembered, an artifact creature two, nothing none; the schema; bound as a delayed trigger is made.`);
