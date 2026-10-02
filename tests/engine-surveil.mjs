/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 20 (THE CATALOG'S ORDER): SURVEIL (CR 701.25).
 *
 * "Surveil N": look at the top N cards of your library, put any number into your graveyard and the rest back on top in
 * any order. Asked as two questions the board already draws as pop-ups -- which go to the graveyard (pick any, none
 * included), then the order of the rest, only when two or more stay -- so a player at the table can make every choice
 * the rule gives them. A card surveiled into a graveyard goes through the replacement effects; an empty library surveils
 * nothing.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {CHOICE_MODES} from "../game/engine/controller.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const card = (name) => ({card: name, types: ["Creature"], manaCost: "{1}", power: 1, toughness: 1});
const pod = {matchId: "m", seed: "surveil", players: [{name: "Rob"}, {name: "Maya"}]};
function table(library = ["A", "B", "C", "D"]) {
  const s = createState(pod);
  for (const name of library) addObject(s, {...card(name), owner: 0, controller: 0}, "library", 0);
  for (let i = 0; i < 8; i += 1) addObject(s, {...card("Filler"), owner: 1, controller: 1}, "library", 1);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const top = (s, n = 4) => s.zones.library[0].slice(0, n).map((id) => s.objects[id].card);
const grave = (s) => s.zones.graveyard[0].map((id) => s.objects[id].card).sort();
const surveil = (s, count) => beginResolution(s, [{effect: "surveil", count}], {controller: 0, source: null});
const pick = (s, names) => resolveAwaiting(s, names.map((n) => awaitingChoice(s).options.find((o) => o.label === n).index));

{
  const s = table();
  const libraryTop = top(s);
  surveil(s, 2);
  const choice = awaitingChoice(s);
  eq([s.awaiting.player, choice.mode, choice.min, choice.max, choice.options.map((o) => o.label)], [0, "many", 0, 2, libraryTop.slice(0, 2)],
    "surveil 2: Rob is asked which of the top two to put into his graveyard -- pick any, none included");
  pick(s, [libraryTop[0]]);
  eq([s.awaiting, grave(s), top(s, 2)], [null, [libraryTop[0]], [libraryTop[1], libraryTop[2]]], "one to the graveyard, one left: it stays on top, and nothing more is asked");
}
{
  const s = table();
  const [a, b, c] = top(s, 3);
  surveil(s, 2);
  pick(s, []);
  const order = awaitingChoice(s);
  eq([order.mode, order.min, order.max, order.options.map((o) => o.label).sort()], ["order", 2, 2, [a, b].sort()], "both kept: then the order they go back in, a second pop-up");
  pick(s, [b, a]);
  eq([top(s, 3), grave(s)], [[b, a, c], []], "the first chosen goes on top -- the order is the player's (CR 701.25a)");
}
{
  const s = table();
  const [a, b, c] = top(s, 3);
  surveil(s, 3);
  pick(s, [a, b, c]);
  eq([s.awaiting, grave(s), top(s, 1).length], [null, [a, b, c].sort(), 1], "all three to the graveyard: nothing left to order");
}
{
  const s = table([]);
  surveil(s, 2);
  eq(s.awaiting, null, "an empty library: nothing to look at, nothing asked (CR 701.25c)");
}
{
  /* "If a card would be put into a graveyard from anywhere, exile it instead": the surveiled card goes through it. */
  const s = table();
  addObject(s, {card: "Rest", types: ["Enchantment"], owner: 1, controller: 1,
    abilities: [{id: "r", kind: "replacement", text: "x", watches: {event: "zone-change", to: "graveyard"}, change: {to: "exile"}}]}, "battlefield", null);
  const [a] = top(s, 1);
  surveil(s, 1);
  pick(s, [a]);
  eq([grave(s), s.zones.exile.map((id) => s.objects[id].card)], [[], [a]], "a replacement that exiles instead: the surveiled card is exiled, not put into the graveyard");
}
{
  /* Both questions are modes the controller knows and the board draws: no new kind of question for the table. */
  const s = table();
  surveil(s, 2);
  const first = awaitingChoice(s).mode;
  pick(s, []);
  const second = awaitingChoice(s).mode;
  eq([first, second, CHOICE_MODES.includes(first), CHOICE_MODES.includes(second)], ["many", "order", true, true], "the two questions are a pick-several and an order, both modes the controller declares");
}

console.log(`engine-surveil: ${checks} checks passed — surveil N asked as two pop-ups the board draws: any to the graveyard, then the rest in the player's order; through the replacements; nothing from an empty library.`);
