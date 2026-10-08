/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 701.12: an exchange is all or nothing, and toughness is set in layer 7b. */
import {table, on, creature, context, checks} from "./helpers/train-b6.mjs";
import {exchangeLife} from "../game/engine/script/effects/resources.mjs";
import {toughnessOf} from "../game/engine/rules/layers.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
const t = checks("engine-exchange-life");
{
  const s = table(), tree = on(s, creature("Tree", 0, 13));
  s.players[0].life = 7; s.objects[tree].counters["+1/+1"] = 2;
  const events = exchangeLife(s, {targets: [tree]}, context);
  t.eq([s.players[0].life, toughnessOf(s, tree), s.players[0].gainedThisTurn], [15, 9, 8], "reads modified toughness, sets base toughness, and records life gained");
  t.eq(events.map(e => e.kind), ["GameEventPlayerLivesChanged"], "exchange is life change, not damage");
  s.objects[tree].damage = 10; checkStateBasedActions(s);
  t.eq(s.objects[tree], undefined, "marked damage remains lethal after the exchange");
}
{
  const s = table(); s.players[0].life = 7; s.players[1].life = 21;
  exchangeLife(s, {who: [0], toPlayer: 1}, context);
  t.eq(s.players.map(p => p.life), [21, 7, 40], "two players exchange while the third is unaffected");
  t.eq([s.players[0].gainedThisTurn, s.players[1].lostThisTurn], [14, 14], "each side records the gain or loss");
  (s.effects ??= []).push({rule: "life-cant-change", players: [1]});
  exchangeLife(s, {who: [0], toPlayer: 1}, context);
  t.eq(s.players.map(p => p.life), [21, 7, 40], "a forbidden second side prevents both sides");
  s.players[1].lost = true;
  exchangeLife(s, {who: [0], toPlayer: 1}, context);
  t.eq(s.players[0].life, 21, "a departed player cannot exchange");
}
{
  const s = table(), rock = on(s, {card: "Rock", types: ["Artifact"], toughness: 13});
  exchangeLife(s, {targets: [rock]}, context);
  t.eq([s.players[0].life, (s.effects ?? []).length], [40, 0], "a noncreature cannot exchange toughness");
  const tree = on(s, creature("Tree", 0, 13));
  s.players[0].life = 7; (s.effects ??= []).push({rule: "life-cant-change", players: [0]});
  exchangeLife(s, {targets: [tree]}, context);
  t.eq([s.players[0].life, toughnessOf(s, tree)], [7, 13], "a forbidden gain does not change the creature either");
}
{
  const s = table(), tree = on(s, creature("Tree", 0, 13));
  on(s, {card: "No gains", types: ["Enchantment"], abilities: [{id: "no", kind: "static", rule: "cant-gain-life", affects: {what: "player", who: "opponent"}}]}, 1);
  s.players[0].life = 7;
  exchangeLife(s, {targets: [tree]}, context);
  t.eq([s.players[0].life, toughnessOf(s, tree)], [7, 13], "can't gain life prevents the entire toughness exchange");
  s.players[0].life = 20;
  exchangeLife(s, {targets: [tree]}, context);
  t.eq([s.players[0].life, toughnessOf(s, tree)], [13, 20], "can't gain life still permits an exchange that loses life");
}
t.done();
