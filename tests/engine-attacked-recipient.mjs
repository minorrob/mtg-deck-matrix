/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "THE PLAYER OR PLANESWALKER THAT CREATURE IS ATTACKING" (CR 506.3, 508.1b; Train C phase 2, p6-combat).
 *
 * An attack trigger is about the attacking creature and the player it attacks; attacking a planeswalker is not attacking its
 * controller (CR 506.3), so the trigger now carries the planeswalker too (rules/trigger.mjs, `about.planeswalker`), and an
 * effect's `who: "attacked"` (script/bind.mjs) deals its damage to that planeswalker -- while it is still on the battlefield;
 * gone, to nobody (CR 506.4c) -- or else to the player. Raid Bombardment and Myr Battlesphere's scenarios play the cards;
 * this suite holds four players, the creature or the planeswalker gone before the trigger resolves, an opponent's Myr, the
 * binding itself and the schema.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {bindEffect} from "../game/engine/script/bind.mjs";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const creature = (subtypes, p = 2, extra = {}) => ({types: ["Creature"], subtypes, manaCost: "{1}", colors: ["G"], power: p, toughness: p, ...extra});
const WALKER = {types: ["Planeswalker"], subtypes: ["Fixture"], manaCost: "{2}", colors: ["U"], loyalty: 5};
const FIX = {Bear: creature(["Bear"]), Wolf: creature(["Wolf"]), Hound: creature(["Hound"]), Walker: WALKER, Sage: {...WALKER, subtypes: ["Sage"]},
  Myr: creature(["Myr"], 1, {types: ["Artifact", "Creature"], colors: []})};
const play = (setup, seats = 2) => runScenario({name: "attacked", seats, setup}, index.definition, FIX).state;
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const idOf = (s, card, seat) => s.zones.battlefield.find((id) => s.objects[id].card === card && s.objects[id].controller === seat);
const loyalty = (s, card, seat) => s.objects[idOf(s, card, seat)]?.counters?.loyalty ?? null;
/* On to the declaration, then declare: [card, defender seat, planeswalker name or none]. */
function attack(s, picks) {
  for (let n = 0; n < 400 && s.awaiting?.kind !== "declare-attackers"; n += 1) {
    if (s.awaiting) { resolveAwaiting(s, []); continue; }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  const options = awaitingChoice(s).options;
  resolveAwaiting(s, picks.map(([name, defender, walker]) => options.find((o) => s.objects[o.cardId].card === name && o.defenderId === defender
    && (walker === undefined ? o.planeswalkerId === undefined : s.objects[o.planeswalkerId]?.card === walker)).index));
}
/* The triggers waiting or on the stack, put in order first if they are asked to be. */
function pending(s) {
  if (s.awaiting?.kind === "order-triggers") resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index));
  return s.stack.filter((e) => e.kind === "trigger");
}
function settle(s) {
  for (let n = 0; n < 400 && (s.awaiting || s.stack.length); n += 1) {
    if (s.awaiting) { const c = awaitingChoice(s); resolveAwaiting(s, c.options.slice(0, Math.max(1, c.min ?? 0)).map((o) => o.index)); continue; }
    passPriority(s);
  }
}

/* ---- what an attack trigger is about ---- */
{
  const s = play([at(0, "battlefield", "Raid Bombardment", "Bear", "Wolf"), at(1, "battlefield", "Walker")]);
  attack(s, [["Bear", 1], ["Wolf", 1, "Walker"]]);
  const abouts = pending(s).map((e) => e.about).sort((a, b) => a.card - b.card);
  eq(abouts.map((a) => [s.objects[a.card].card, a.player, a.planeswalker === undefined ? null : s.objects[a.planeswalker].card]),
    [["Bear", 1, null], ["Wolf", 1, "Walker"]], "the Bear's trigger is about Maya; the Wolf's about Maya and her Walker");
  ok(!("planeswalker" in abouts[0]), "and one attacking a player carries no planeswalker key at all -- nothing undefined to drop at a checkpoint");
}

/* ---- four players, players and planeswalkers ---- */
{
  const s = play([at(0, "battlefield", "Raid Bombardment", "Bear", "Wolf", "Hound"), at(1, "battlefield", "Walker"), at(3, "battlefield", "Sage")], 4);
  attack(s, [["Bear", 1, "Walker"], ["Wolf", 2], ["Hound", 3, "Sage"]]);
  pending(s);
  settle(s);
  eq([s.players[1].life, s.players[2].life, s.players[3].life, loyalty(s, "Walker", 1), loyalty(s, "Sage", 3)], [40, 39, 40, 4, 4],
    "the Bear at Maya's Walker, the Wolf at Trey, the Hound at Sam's Sage: 1 to the Walker, 1 to Trey, 1 to the Sage -- Maya and Sam untouched");
}

/* ---- gone before the trigger resolves ---- */
{
  const s = play([at(0, "battlefield", "Raid Bombardment", "Bear"), at(1, "battlefield", "Walker")]);
  attack(s, [["Bear", 1, "Walker"]]);
  pending(s);
  runEffect(s, {effect: "destroy", targets: [idOf(s, "Walker", 1)]}, {controller: 1, source: null});
  settle(s);
  eq([s.players[1].life, idOf(s, "Walker", 1) ?? null], [40, null], "the Walker destroyed in response: nothing is dealt the damage -- it does not go to Maya instead");
}
{
  const s = play([at(0, "battlefield", "Raid Bombardment", "Bear"), at(1, "battlefield", "Walker")]);
  attack(s, [["Bear", 1, "Walker"]]);
  pending(s);
  runEffect(s, {effect: "destroy", targets: [idOf(s, "Bear", 0)]}, {controller: 1, source: null});
  settle(s);
  eq(loyalty(s, "Walker", 1), 4, "the Bear destroyed in response: the Walker it was attacking is still dealt 1");
}
{
  const s = play([at(0, "battlefield", "Raid Bombardment", "Bear")]);
  attack(s, [["Bear", 1]]);
  pending(s);
  runEffect(s, {effect: "destroy", targets: [idOf(s, "Bear", 0)]}, {controller: 1, source: null});
  settle(s);
  eq(s.players[1].life, 39, "and the player it was attacking, the same");
}

/* ---- "untapped Myr you control" ---- */
{
  const s = play([at(0, "battlefield", "Myr Battlesphere", "Myr", "Myr"), at(1, "battlefield", "Myr")]);
  attack(s, [["Myr Battlesphere", 1]]);
  pending(s);
  for (let n = 0; n < 20 && s.awaiting?.kind !== "effect-choice"; n += 1) passPriority(s);
  const choice = awaitingChoice(s);
  eq([choice.min, choice.max, choice.options.map((o) => s.objects[o.cardId].controller)], [0, 2, [0, 0]], "Rob may tap none, or up to his two Myr -- never Maya's");
  resolveAwaiting(s, [0, 1]);
  eq([s.objects[idOf(s, "Myr", 1)].tapped, s.players[1].life], [false, 38], "Maya's Myr untouched; two damage to Maya");
}

/* ---- the binding, and the schema ---- */
{
  const s = play([at(1, "battlefield", "Walker")]);
  const walker = idOf(s, "Walker", 1);
  const bound = (about, state = s) => { const b = bindEffect({effect: "dealDamage", amount: 1, who: "attacked"}, {controller: 0, about}, state); return [b.who, b.targets ?? null]; };
  eq(bound({card: 9, player: 1}), [[1], null], "attacking a player: that player");
  eq(bound({card: 9, player: 1, planeswalker: walker}), [[], [walker]], "attacking a planeswalker: the planeswalker, and no player");
  eq(bound({card: 9, player: 1, planeswalker: walker}, null), [[], [walker]], "bound with no game to look at, the planeswalker all the same (dealDamage asks if it is there)");
  runEffect(s, {effect: "moveZone", targets: [walker], to: "hand"}, {controller: 1, source: null});
  eq(bound({card: 9, player: 1, planeswalker: walker}), [[], []], "the planeswalker gone: nothing at all");
  const identity = {name: "Odd", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: []};
  const script = (effect) => ({schema: "CrankCardScript@1", identity, oracleText: "x", source: "hand", abilities: [{kind: "triggered", text: "x", trigger: {on: "attacks", who: "any"}, effects: [effect]}]});
  ok(validateScript(script({effect: "dealDamage", amount: 1, who: "attacked"})).valid, "dealDamage to who: \"attacked\" is a script");
  ok(!validateScript(script({effect: "loseLife", amount: 1, who: "attacked"})).valid, "only damage is dealt to \"the player or planeswalker it's attacking\"");
  ok(!validateScript(script({effect: "dealDamage", amount: 1, who: "attacked", targets: "that card"})).valid, "and to that one alone");
}

console.log(`engine-attacked-recipient: ${checks} checks passed -- an attack trigger about the planeswalker attacked; four players' players and planeswalkers; the planeswalker or the creature gone before it resolves; an opponent's Myr; the binding and the schema.`);
