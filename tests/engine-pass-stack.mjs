/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* NOTHING TO DO WITH SOMETHING ON THE STACK (Linear ROB-13; rules/actions.mjs, nothingToDo with `stack`). The room passes
 * for a person who could make no response (`passStack`); a doubtful case is asked, never passed for them.
 *
 * Maya's Dark Ritual on the stack, Rob holding priority over it:
 *   1. Without `stack` he is asked, whatever he holds -- as every match launched before is.
 *   2. With it: a sorcery in hand and a land is nothing to do; an instant the mana could pay is something (colors are not
 *      matched: a doubtful case is asked); one it could not pay is nothing.
 *   3. A mana ability that does more than add mana is a response in itself: Phyrexian Altar with a creature to sacrifice,
 *      Lotus Petal, Mana Confluence's life, The Great Henge's life after. A painland's hurt to its own controller (Adarkar
 *      Wastes, Ancient Tomb) is not.
 *   4. Any other ability he may activate is something to do (Viscera Seer).
 *   5. In his own main phase, his own spell on the stack: a sorcery is not castable now (CR 307.1), so it is nothing to do --
 *      and with the stack empty again, it is something.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction, nothingToDo, plainMana} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {abilitiesOf} from "../game/engine/rules/layers.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const LESSON = {card: "Lesson", types: ["Sorcery"], manaCost: "{C}", spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}};
function table() {
  const s = createState({matchId: "m", seed: "pass-stack", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const put = (s, o, seat, zone) => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
/* `seat` casts a Dark Ritual, on Maya's turn or Rob's own; `then`, priority passed on to the other player. */
function ritual(s, seat, then = true) {
  put(s, card("Dark Ritual"), seat, "hand");
  s.players[seat].manaPool.B = 1;
  applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "cast" && a.label === "Dark Ritual"));
  if (then) passPriority(s);
  return s;
}
/* Maya's turn, her Dark Ritual on the stack, Rob holding priority over it, with what `setup` gives him. */
function overHers(setup) {
  const s = table();
  s.activePlayer = 1; s.priorityPlayer = 1;
  setup(s);
  return ritual(s, 1);
}
const idle = (s) => nothingToDo(s, 0, legalActions(s, 0), {stack: true});

{
  const s = overHers((t) => { put(t, LESSON, 0, "hand"); put(t, WASTES, 0, "battlefield"); });
  eq([s.stack.length, s.priorityPlayer], [1, 0], "Maya's Dark Ritual on the stack, Rob holding priority over it");
  eq(nothingToDo(s, 0), false, "1. without `stack`: asked, as a match launched before asks");
  eq(idle(s), true, "2. with it: a sorcery in hand and a land -- nothing he could do in response");
}
{
  const s = overHers((t) => { put(t, card("Opt"), 0, "hand"); put(t, WASTES, 0, "battlefield"); });
  eq(idle(s), false, "an Opt and a Wastes: something to do -- colors are not matched, so a doubtful case is asked");
  const t = overHers((u) => { put(u, card("Counterspell"), 0, "hand"); put(u, WASTES, 0, "battlefield"); });
  eq(idle(t), true, "a Counterspell and one land: two mana it needs, one he has -- nothing to do");
}
{
  const s = overHers((t) => { put(t, LESSON, 0, "hand"); put(t, card("Phyrexian Altar"), 0, "battlefield"); put(t, card("Llanowar Elves"), 0, "battlefield"); });
  eq(idle(s), false, "3. Phyrexian Altar and an Elf to sacrifice: a response in itself");
  const t = overHers((u) => { put(u, LESSON, 0, "hand"); put(u, card("Phyrexian Altar"), 0, "battlefield"); });
  eq(idle(t), true, "the Altar with no creature to sacrifice offers nothing: nothing to do");
  eq(idle(overHers((u) => { put(u, LESSON, 0, "hand"); put(u, card("Lotus Petal"), 0, "battlefield"); })), false, "Lotus Petal sacrifices itself: asked");
  eq(idle(overHers((u) => { put(u, LESSON, 0, "hand"); put(u, card("Mana Confluence"), 0, "battlefield"); })), false, "Mana Confluence pays life: asked");
  eq(idle(overHers((u) => { put(u, LESSON, 0, "hand"); put(u, card("The Great Henge"), 0, "battlefield"); })), false, "The Great Henge gains life as it makes mana: asked");
  eq(idle(overHers((u) => { put(u, LESSON, 0, "hand"); put(u, card("Adarkar Wastes"), 0, "battlefield"); })), true, "Adarkar Wastes' hurt is only to Rob: nothing to do");
  eq(idle(overHers((u) => { put(u, LESSON, 0, "hand"); put(u, card("Ancient Tomb"), 0, "battlefield"); })), true, "and Ancient Tomb's: nothing to do");
  /* What the rule reads, ability by ability: each card's own mana ability. */
  const mana = (name) => { const v = overHers((u) => put(u, card(name), 0, "battlefield")); const id = v.zones.battlefield.find((x) => v.objects[x].card === name); return plainMana(abilitiesOf(v, id).find((a) => a.kind === "mana")); };
  eq(["Wastes", "Adarkar Wastes", "Ancient Tomb", "Sol Ring", "Phyrexian Altar", "Lotus Petal", "Mana Confluence", "The Great Henge"].map((n) => (n === "Wastes" ? plainMana(WASTES.abilities[0]) : mana(n))),
    [true, true, true, true, false, false, false, false], "plainMana: a tap and mana, and a painland's hurt; never a sacrifice, life paid, or life gained after");
  /* And each cost beyond a tap and mana, on a plain {T}: Add {C} -- the cards above show four of them; these are the rest. */
  const COSTS = {sacrifice: {types: ["Creature"]}, sacrificeSelf: true, tapCreature: {types: ["Creature"]}, payLife: 1, counterCost: {counter: "charge", count: 1}, millCost: 1, exileFromGraveyard: {}};
  eq(Object.entries(COSTS).filter(([key, value]) => plainMana({...WASTES.abilities[0], [key]: value})).map(([key]) => key), [], "and every other cost a mana ability may carry is more than mana: none of them plain");
}
{
  const s = overHers((t) => { put(t, LESSON, 0, "hand"); put(t, card("Viscera Seer"), 0, "battlefield"); });
  eq(idle(s), false, "4. Viscera Seer may sacrifice itself: something to do");
}
{
  /* 5. Rob's own main phase, his Dark Ritual on the stack, holding priority (CR 117.3c). */
  const s = table();
  put(s, card("Cultivate"), 0, "hand");
  for (let i = 0; i < 3; i += 1) put(s, i ? WASTES : card("Forest"), 0, "battlefield");
  eq(nothingToDo(s, 0), false, "his main phase, the stack empty: Cultivate and three lands is something to do");
  ritual(s, 0, false);
  eq([s.stack.length, s.priorityPlayer, legalActions(s, 0).some((a) => a.label === "Cultivate")], [1, 0, false], "his Ritual on the stack, his priority: no Cultivate offered");
  eq(idle(s), true, "5. and nothing to do: a sorcery waits for the stack to empty (CR 307.1)");
}

console.log(`engine-pass-stack: ${checks} checks passed — with something on the stack, a player who could make no response has nothing to do; an instant the mana could pay, a mana ability that does more than add mana, or any other ability keeps the decision theirs.`);
