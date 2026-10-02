/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 29 (THE CATALOG'S ORDER): "WHENEVER YOU GAIN LIFE" (CR 119.9).
 *
 * Each gain of life is an event of its own -- two life gains in one resolution, or lifelink from two creatures, are two --
 * and "whenever you gain life" triggers for each, about the player and how much. A loss is not a gain, and another
 * player's gain is not yours. And a static ability can ask for a number of counters: "as long as this creature has four or
 * more +1/+1 counters on it, it has flying and vigilance".
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {selectMatching} from "../game/engine/script/filter.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const pod = {matchId: "m", seed: "life", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const triggered = (s, effects, controller = 0) => { s.pendingTriggers = []; collectTriggers(s, runEffects(s, effects, {controller, source: null})); return s.pendingTriggers; };

{
  const s = table();
  on(s, card("Ajani's Pridemate"), 0);
  main(s);
  eq(triggered(s, [{effect: "gainLife", amount: 3}]).map((t) => t.about), [{player: 0, amount: 3}], "Rob gains 3: Ajani's Pridemate triggers, about Rob and 3");
  eq(triggered(s, [{effect: "gainLife", amount: 2}, {effect: "gainLife", amount: 1}]).length, 2, "two gains in one resolution are two events: it triggers twice (CR 119.9)");
  eq(triggered(s, [{effect: "gainLife", amount: 4}], 1).length, 0, "Maya gains life: not Rob's gain, nothing");
  eq(triggered(s, [{effect: "loseLife", amount: 2}]).length, 0, "Rob loses life: not a gain, nothing");
}
{
  const s = table();
  const voice = on(s, card("Voice of the Blessed"), 0);
  main(s);
  const kw = () => ["Flying", "Vigilance", "Indestructible"].filter((k) => keywordsOf(s, voice).includes(k));
  s.objects[voice].counters["+1/+1"] = 3;
  eq(kw(), [], "Voice of the Blessed with three +1/+1 counters: nothing");
  s.objects[voice].counters["+1/+1"] = 4;
  eq(kw(), ["Flying", "Vigilance"], "four: flying and vigilance");
  s.objects[voice].counters["+1/+1"] = 10;
  eq(kw(), ["Flying", "Vigilance", "Indestructible"], "ten: indestructible too");
}
{
  /* The same threshold as a selector ("each creature with three or more +1/+1 counters on it"). */
  const s = table();
  const bear = on(s, {card: "Bear", types: ["Creature"], power: 2, toughness: 2}, 0), wolf = on(s, {card: "Wolf", types: ["Creature"], power: 2, toughness: 2}, 1);
  main(s);
  s.objects[bear].counters["+1/+1"] = 3; s.objects[wolf].counters["+1/+1"] = 2;
  eq(selectMatching(s, {what: "permanent", types: ["Creature"], countersAtLeast: {counter: "+1/+1", count: 3}}, {controller: 0}), [bear], "three or more +1/+1 counters: the Bear with three, not the Wolf with two");
}

console.log(`engine-life-gained: ${checks} checks passed — each gain of life its own event, about the player and how much; a loss or another's gain triggers nothing; a counter threshold, in a static ability or a selector.`);
