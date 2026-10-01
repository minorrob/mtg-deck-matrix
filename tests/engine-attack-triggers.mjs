/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 23 (THE CATALOG'S ORDER): "WHENEVER YOU ATTACK" (CR 508.1m, 603.2c).
 *
 * Attackers are declared at once, in one event, so "whenever one or more creatures you control attack" triggers once for
 * the whole attack, about all of them -- "draw that many cards", "those creatures gain menace". "Whenever a player attacks
 * with three or more creatures" counts the attack as a whole. "Attack one of your opponents" asks who was attacked, and in
 * a game of more than two that can be another player's attack.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const FOREST = {card: "Forest", types: ["Land"], supertypes: ["Basic"], subtypes: ["Forest"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {G: 1}}]};
const creature = (name, power = 2, extra = {}) => ({card: name, types: ["Creature"], manaCost: "{1}", power, toughness: power, ...extra});
function table(players = ["Rob", "Maya"], library = []) {
  const s = createState({matchId: "m", seed: "attack", players: players.map((name) => ({name}))});
  for (let seat = 0; seat < players.length; seat += 1) {
    for (const c of seat === 0 ? library : []) addObject(s, {...c, owner: seat, controller: seat}, "library", seat);
    for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  }
  return s;
}
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
function begin(s) { beginGame(s); return s; }
/* On to the declare-attackers step of the given turn, then declare: [creature id, defender seat]. */
function attack(s, turn, picks) {
  for (let n = 0; n < 400 && !(s.turn === turn && s.awaiting?.kind === "declare-attackers"); n += 1) {
    if (s.awaiting) { resolveAwaiting(s, s.awaiting.kind === "order-triggers" ? awaitingChoice(s).options.map((o) => o.index) : []); continue; }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  const options = awaitingChoice(s).options;
  resolveAwaiting(s, picks.map(([id, defender]) => options.find((o) => o.cardId === id && o.defenderId === defender).index));
}
/* What triggered: waiting to go on the stack, or already there (a trigger goes on as its controller next gets priority). */
const pending = (s) => [...(s.pendingTriggers ?? []), ...s.stack.filter((e) => e.kind === "trigger")].map((t) => ({ability: t.abilityId, cards: t.about?.cards?.length}));

{
  const s = begin(table());
  on(s, card("Mavren Fein, Dusk Apostle"), 0);
  const a = on(s, creature("Thrall", 1, {subtypes: ["Vampire"]}), 0), b = on(s, creature("Thrall", 1, {subtypes: ["Vampire"]}), 0), c = on(s, creature("Bear"), 0);
  attack(s, 3, [[a, 1], [b, 1], [c, 1]]);
  eq(pending(s), [{ability: "a0", cards: 2}], "two Vampires and a Bear attack: Mavren Fein triggers once, about the two Vampires");
}
{
  const s = begin(table());
  on(s, card("Mavren Fein, Dusk Apostle"), 0);
  const bat = on(s, creature("Bat", 1, {subtypes: ["Vampire"], token: true}), 0);
  attack(s, 3, [[bat, 1]]);
  eq(pending(s), [], "a Vampire token attacking alone: it is not a nontoken Vampire, nothing triggers");
}
{
  const s = begin(table());
  const aurelia = on(s, card("Aurelia, the Law Above"), 0);
  const bears = [0, 1].map(() => on(s, creature("Bear"), 0));
  attack(s, 3, [[aurelia, 1], [bears[0], 1]]);
  eq(pending(s), [], "Aurelia: two attackers is not three or more");
}
{
  const s = begin(table());
  const aurelia = on(s, card("Aurelia, the Law Above"), 0);
  const bears = [0, 1, 2, 3].map(() => on(s, creature("Bear"), 0));
  attack(s, 3, [[aurelia, 1], [bears[0], 1], [bears[1], 1]]);
  eq(pending(s).map((t) => t.ability), ["a3"], "three attackers: the draw (a3), not the five-or-more ability (a4)");
}
{
  const s = begin(table());
  const aurelia = on(s, card("Aurelia, the Law Above"), 0);
  const bears = [0, 1, 2, 3].map(() => on(s, creature("Bear"), 0));
  attack(s, 3, [[aurelia, 1], ...bears.map((b) => [b, 1])]);
  eq(pending(s).map((t) => t.ability).sort(), ["a3", "a4"], "five attackers: both");
}
{
  /* "Whenever you attack with two or more Birds": the count is of the attackers the description fits, not all of them. */
  const s = begin(table());
  on(s, {card: "Aviary", types: ["Enchantment"], abilities: [{id: "flock", kind: "triggered", text: "x",
    trigger: {on: "GameEventAttackersDeclared", who: "any", filter: {subtypes: ["Bird"], controller: "you"}, atLeast: 2, batch: true}, effects: [{effect: "draw", count: 1}]}]}, 0);
  const bird = on(s, creature("Bird", 1, {subtypes: ["Bird"]}), 0), bears = [0, 1].map(() => on(s, creature("Bear"), 0));
  attack(s, 3, [[bird, 1], ...bears.map((b) => [b, 1])]);
  eq(pending(s), [], "one Bird and two Bears attack: three attackers, but only one Bird -- \"two or more Birds\" does not trigger");
}
{
  /* Another player's attack: Aurelia's "a player attacks" is anyone's. */
  const s = begin(table());
  on(s, card("Aurelia, the Law Above"), 0);
  const theirs = [0, 1, 2].map(() => on(s, creature("Wolf"), 1));
  attack(s, 2, theirs.map((w) => [w, 0]));
  eq(pending(s).map((t) => t.ability), ["a3"], "Maya attacks Rob with three: Rob's Aurelia triggers -- \"a player\", not only Rob");
}
{
  /* "Attack one of your opponents", in a game of three. */
  const s = begin(table(["Rob", "Maya", "Trey"]));
  on(s, card("Frontier Warmonger"), 0);
  const wolf = on(s, creature("Wolf"), 1), hound = on(s, creature("Hound"), 1);
  attack(s, 2, [[wolf, 2], [hound, 0]]);
  eq(pending(s).map((t) => t.cards), [1], "Maya attacks Trey with the Wolf and Rob with the Hound: Rob's Warmonger triggers for the Wolf alone -- Trey is Rob's opponent, Rob is not");
  for (let n = 0; n < 50 && ((s.pendingTriggers ?? []).length || s.stack.length); n += 1) {
    if (s.awaiting) { resolveAwaiting(s, []); continue; }
    if (passPriority(s).outcome === "step-ends") break;
  }
  eq([keywordsOf(s, wolf).includes("Menace"), keywordsOf(s, hound).includes("Menace")], [true, false], "and those creatures -- the Wolf -- gain menace; the Hound does not");
}
{
  /* "Search for up to that many basic land cards": that many is how many it is about. */
  const s = begin(table(["Rob", "Maya"], [FOREST, FOREST, FOREST]));
  on(s, card("The Earth King"), 0);
  const ogres = [0, 1].map(() => on(s, creature("Ogre", 4), 0));
  const bear = on(s, creature("Bear"), 0);
  attack(s, 3, [...ogres.map((o) => [o, 1]), [bear, 1]]);
  eq(pending(s).map((t) => t.cards), [2], "two 4-power creatures and a 2/2 attack: The Earth King triggers once, about the two");
  for (let n = 0; n < 50 && s.awaiting?.kind !== "effect-choice"; n += 1) {
    if (s.awaiting) { resolveAwaiting(s, []); continue; }
    passPriority(s);
  }
  const choice = awaitingChoice(s);
  eq([choice.min, choice.max], [0, 2], "and searches for up to that many -- two -- basic lands");
}

console.log(`engine-attack-triggers: ${checks} checks passed — "one or more attack" once for the whole attack, about them all; "three or more" and "five or more" counted; anyone's attack; "one of your opponents" in a game of three; "that many".`);
