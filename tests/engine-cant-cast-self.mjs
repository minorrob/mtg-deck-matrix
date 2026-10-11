/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (p3-costs): A CARD'S OWN RESTRICTION ON CASTING IT, READ WHEREVER IT IS (CR 601.2).
 *
 * "Threshold -- You can't cast this spell unless there are seven or more cards in your graveyard" (Proft, Sinister
 * Mastermind): the static `cant-cast-self`, its `unless` the condition that lets it be cast, asked of its caster wherever the
 * card would be cast from -- the hand, the command zone, by an effect. What the scenarios cannot reach: whose graveyard, the
 * command zone, a cast an effect makes, the permanent on the battlefield, and the schema.
 */
import assert from "node:assert/strict";
import {table, on, bear, card} from "./helpers/b4-table.mjs";
import {legalActions, castChoicesNow} from "../game/engine/rules/actions.mjs";
import {castForbidden} from "../game/engine/rules/statics.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const proft = card("Proft, Sinister Mastermind");
const fill = (s, seat, n) => { for (let i = 0; i < n; i += 1) on(s, {card: "Wastes", types: ["Land"]}, seat, "graveyard"); };
const casts = (s, name) => legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === name);
{
  /* Its caster's own graveyard: Maya's seven do not let Rob cast it; his own seventh does. */
  const s = table();
  const id = on(s, proft, 0, "hand");
  fill(s, 1, 7); fill(s, 0, 6);
  Object.assign(s.players[0].manaPool, {B: 1, C: 2});
  eq([castForbidden(s, 0, id), casts(s, "Proft, Sinister Mastermind").length], [true, 0], "six of Rob's, seven of Maya's: forbidden");
  eq(castChoicesNow(s, 0, id), [], "and no effect casts it for him either");
  fill(s, 0, 1);
  eq([castForbidden(s, 0, id), casts(s, "Proft, Sinister Mastermind").length, castChoicesNow(s, 0, id).length > 0], [false, 1, true], "his seventh: cast from the hand, or by an effect");
}
{
  /* From the command zone, as a commander (CR 903.8): the same restriction. */
  const s = table();
  const id = on(s, {...proft, commander: true}, 0, "command");
  Object.assign(s.players[0].manaPool, {B: 1, C: 2});
  eq([castForbidden(s, 0, id), legalActions(s, 0).filter((a) => a.kind === "cast" && a.objectId === id).length], [true, 0], "an empty graveyard: not from the command zone");
  fill(s, 0, 7);
  eq(legalActions(s, 0).filter((a) => a.kind === "cast" && a.objectId === id).length, 1, "seven: from the command zone");
}
{
  /* On the battlefield it restricts nothing: a card's own static is read only of that card. */
  const s = table();
  on(s, proft);
  const cub = on(s, {...bear, card: "Cub", manaCost: "{1}"}, 0, "hand");
  s.players[0].manaPool.C = 1;
  eq([castForbidden(s, 0, cub), castForbidden(s, 1, cub)], [false, false], "Proft on the battlefield forbids no one anything");
  eq(casts(s, "Cub").length, 1, "and the Cub is cast");
}
{
  const script = (ability) => ({schema: "CrankCardScript@1", source: "hand", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Creature"], manaCost: "{B}", power: 1, toughness: 1},
    oracleText: "You can't cast this spell unless you control a Swamp.", abilities: [{kind: "static", text: "You can't cast this spell unless you control a Swamp.", rule: "cant-cast-self", affects: {what: "card", self: true}, ...ability}]});
  eq(validateScript(script({unless: {present: {what: "permanent", subtypes: ["Swamp"], controller: "you"}}})).valid, true, "the schema admits it with its condition");
  eq([validateScript(script({})).valid, validateScript(script({unless: {flavor: true}})).valid], [false, false], "and refuses it without one, or with one the grammar has not");
}
console.log(`engine-cant-cast-self: ${checks} checks passed`);
