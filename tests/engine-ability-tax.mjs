/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "DURING YOUR TURN, SPELLS YOUR OPPONENTS CAST COST {1} MORE TO CAST AND ABILITIES YOUR OPPONENTS ACTIVATE COST {1} MORE TO
 * ACTIVATE UNLESS THEY'RE MANA ABILITIES" (Tithe Taker; AI 3's Teysa deck).
 *
 * A spell's increase (`spells-cost-more`, rules/statics.mjs costIncrease) now reads its own condition, asked at each cast;
 * and an activated ability's total cost (CR 602.2b, as CR 601.2f determines a spell's) takes `abilities-cost-more`
 * (abilityCostIncrease), for the players its `affects` names, while its condition holds -- in rules/actions.mjs costPayment,
 * so a permanent's abilities, a card's in a hand (cycling) and a graveyard's alike; the increase before any reduction; and an
 * ability that printed no mana now has that much to pay. Mana abilities are never paid there (CR 605). The card scenarios play
 * the card; this suite holds three and four players, X, a reduction, a second Tithe Taker, and the schema.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {costIncrease, abilityCostIncrease, STATIC_RULES} from "../game/engine/rules/statics.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const GIFT = {card: "Gift", types: ["Instant"], manaCost: "{1}", spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}};
const SHRINE = {card: "Shrine", types: ["Artifact"], manaCost: "{1}", abilities: [{id: "g", kind: "activated", text: "{T}: You gain 1 life.", cost: [{atom: "{T}"}], targets: [], effects: [{effect: "gainLife", amount: 1}]}]};
const FONT = {card: "Font", types: ["Artifact"], manaCost: "{1}", abilities: [{id: "x", kind: "activated", text: "{X}: You gain X life.", cost: [{atom: "mana", cost: "{X}"}], targets: [], effects: [{effect: "gainLife", amount: "X"}]}]};
const CHEAP = {card: "Cheap", types: ["Artifact"], manaCost: "{1}", abilities: [{id: "c", kind: "activated", text: "{2}: You gain 1 life. This ability costs {1} less to activate.",
  cost: [{atom: "mana", cost: "{2}"}], costLess: 1, targets: [], effects: [{effect: "gainLife", amount: 1}]}]};
const CYCLER = {card: "Cycler", types: ["Creature"], manaCost: "{3}", power: 2, toughness: 2, abilities: [{id: "cy", kind: "activated", zone: "hand", cycling: true, text: "Cycling {1}",
  cost: [{atom: "mana", cost: "{1}"}, {atom: "discard", self: true}], targets: [], effects: [{effect: "draw", count: 1}]}]};

function table(seats = 2) {
  const s = createState({matchId: "m", seed: "ability-tax", players: ["Rob", "Maya", "Trey", "Sam"].slice(0, seats).map((name) => ({name}))});
  for (let seat = 0; seat < seats; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const put = (s, o, seat, zone) => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
const pool = (s, seat, n) => { s.players[seat].manaPool.C = n; };
/* What a seat is offered: its priority, for the question. */
const offered = (s, seat, kind, label) => { s.priorityPlayer = seat; return legalActions(s, seat).filter((a) => a.kind === kind && a.label === label); };

/* ---- whose, and when: three players, Rob's Tithe Taker ---- */
{
  const s = table(3);
  put(s, card("Tithe Taker"), 0, "battlefield");
  const gift = put(s, GIFT, 1, "hand"), trey = put(s, GIFT, 2, "hand"), rob = put(s, GIFT, 0, "hand");
  eq([abilityCostIncrease(s, 0), abilityCostIncrease(s, 1), abilityCostIncrease(s, 2)], [0, 1, 1], "Rob's turn: each opponent's abilities {1} more, his own not");
  eq([costIncrease(s, 1, gift), costIncrease(s, 2, trey), costIncrease(s, 0, rob)], [1, 1, 0], "Rob's turn: each opponent's spells {1} more, his own not");
  s.activePlayer = 1;
  eq([abilityCostIncrease(s, 1), abilityCostIncrease(s, 2), costIncrease(s, 1, gift), costIncrease(s, 2, trey)], [0, 0, 0, 0], "Maya's turn: nobody's costs more -- \"during your turn\"");
  s.activePlayer = 0;
  put(s, card("Tithe Taker"), 0, "battlefield");
  eq([abilityCostIncrease(s, 1), costIncrease(s, 1, gift)], [2, 2], "two Tithe Takers: {2} more each");
}

/* ---- abilities: a {T} ability, a mana ability, X, a reduction, a card's in hand ---- */
{
  const s = table();
  put(s, card("Tithe Taker"), 0, "battlefield");
  put(s, SHRINE, 1, "battlefield");
  const wastes = put(s, WASTES, 1, "battlefield");
  eq(offered(s, 1, "activate", "Shrine").length, 0, "Maya's {T} ability, with nothing in her pool: {1} it cannot pay");
  eq(offered(s, 1, "activate-mana", "Wastes").map((a) => a.objectId), [wastes], "her mana ability costs nothing more (CR 605)");
  pool(s, 1, 1);
  eq(offered(s, 1, "activate", "Shrine").map((a) => a.payment.mana.mana.C), [1], "with {C}: offered, paying it");
}
{
  const s = table();
  put(s, card("Tithe Taker"), 0, "battlefield");
  put(s, FONT, 1, "battlefield");
  pool(s, 1, 3);
  eq(offered(s, 1, "activate", "Font").map((a) => a.x), [0, 1, 2], "{X} with three mana and {1} more: X up to 2, not 3");
  const t = table();
  put(t, FONT, 1, "battlefield");
  pool(t, 1, 3);
  eq(offered(t, 1, "activate", "Font").map((a) => a.x), [0, 1, 2, 3], "without Tithe Taker, X up to 3");
}
{
  const s = table();
  put(s, card("Tithe Taker"), 0, "battlefield");
  put(s, CHEAP, 1, "battlefield");
  pool(s, 1, 1);
  eq(offered(s, 1, "activate", "Cheap").length, 0, "{2}, {1} more, {1} less: {2}, and one mana is not enough -- the increase before the reduction (CR 601.2f)");
  pool(s, 1, 2);
  eq(offered(s, 1, "activate", "Cheap").length, 1, "... and two is");
}
{
  const s = table();
  put(s, card("Tithe Taker"), 0, "battlefield");
  put(s, CYCLER, 1, "hand");
  pool(s, 1, 1);
  eq(offered(s, 1, "activate", "Cycler").length, 0, "cycling {1} from her hand on Rob's turn: {2}");
  pool(s, 1, 2);
  eq(offered(s, 1, "activate", "Cycler").length, 1, "... and with two, offered");
}

/* ---- the rule, its condition, and a card that reads it ---- */
{
  ok(Object.hasOwn(STATIC_RULES, "abilities-cost-more"), "the rule is in the closed list");
  const tithe = cards.resolve("Tithe Taker");
  ok(tithe.playable, "Tithe Taker is playable");
  const rules = cards.definition("Tithe Taker").abilities.filter((a) => a.kind === "static").map((a) => [a.rule, a.condition]);
  eq(rules, [["spells-cost-more", {yourTurn: true}], ["abilities-cost-more", {yourTurn: true}]], "both statics carry \"during your turn\"");
  const bad = compileScript({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Artifact"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: []},
    oracleText: "x", source: "hand", abilities: [{kind: "static", text: "x", rule: "abilities-cost-more", affects: {what: "player", who: "opponent"}, condition: {yourTurn: "sometimes"}}]});
  ok(bad.problems.some((p) => p.includes("yourTurn is true")), "a condition it cannot read is refused");
}

console.log(`engine-ability-tax: ${checks} checks passed -- spells and abilities an opponent casts or activates cost more during your turn, mana abilities never, the increase before a reduction.`);
