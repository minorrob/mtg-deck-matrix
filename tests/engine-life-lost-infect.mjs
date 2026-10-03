/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 78 (THE CATALOG'S ORDER): "WHENEVER A PLAYER LOSES LIFE" (Forge's LifeLost), INFECT (CR 702.90) AND
 * ANNIHILATOR (CR 702.86).
 *
 * Every life loss now goes through one place (effects/resources.mjs changeLife) and says so: an effect's, combat
 * damage's, a commander's, and life paid as a cost (CR 119.4) -- which before was not said, and combat damage's and a
 * cost's were not counted in "the life they lost this turn". "Whenever an opponent loses life" triggers once for each
 * player for everything one action took: combat damage from two creatures at once is one loss. Infect's damage is
 * poison counters to a player and -1/-1 counters to a creature, in place of life lost and damage marked -- still damage,
 * so lifelink and deathtouch still see it, and no life is lost. Annihilator is its triggered ability: the defending
 * player -- the one it attacks -- sacrifices N permanents of their choice.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {dealCommanderDamage, checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const creature = (cost, subtypes, power, more = {}) => ({types: ["Creature"], subtypes, manaCost: cost, colors: ["G"], power, toughness: power, ...more});
const FIX = {Bear: creature("{1}{G}", ["Bear"], 2), Ogre: creature("{2}{R}", ["Ogre"], 3), Relic: {types: ["Artifact"], manaCost: "{1}", colors: []},
  Leech: creature("{1}{B}", ["Leech"], 1, {keywords: ["Infect", "Lifelink"]}), Asp: creature("{G}", ["Snake"], 1, {keywords: ["Infect", "Deathtouch"]}),
  Sting: {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "1 damage to each opponent.", targets: [], effects: [{effect: "dealDamage", amount: 1, who: "opponent"}]}}};
const play = (setup, seats = 2) => runScenario({name: "batch 78", seats, setup, steps: [], expect: []}, cards.definition, FIX).state;
const named = (s, name, seat) => s.zones.battlefield.filter((id) => s.objects[id].card === name && (seat === undefined || s.objects[id].controller === seat));
const life = (s) => s.players.map((p) => p.life);
const step = (s) => { if (s.awaiting) resolveAwaiting(s, []); else if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); };
const settle = (s) => { for (let n = 0; n < 60 && (s.stack.length || (s.pendingTriggers ?? []).length || s.awaiting); n += 1) { if (s.awaiting) resolveAwaiting(s, awaitingChoice(s).options.slice(0, awaitingChoice(s).min ?? 0).map((o) => o.index)); else passPriority(s); } };
const lostThisTurn = (s, player) => s.players[player].lostThisTurn ?? 0;

/* ---- compiling ---- */
const script = (abilities) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "test", types: ["Creature"], colors: []}, oracleText: "", abilities});
{
  eq([missingFor({triggers: ["LifeLost"]}), missingFor({keywords: ["Infect"]}), missingFor({keywords: ["Annihilator"]})], [[], [], []], "LifeLost, infect and annihilator built");
  const lost = compileScript(script([{kind: "triggered", text: "x", trigger: {on: "life lost"}, effects: [{effect: "draw", count: 1}]}])).definition.abilities[0].trigger;
  eq(lost, {on: "GameEventPlayerLivesChanged", loser: "you", batch: true}, "\"whenever you lose life\": yours, once an action");
  const annihilator = compileScript(script([{kind: "keyword", text: "Annihilator 2", keyword: "annihilator", amount: 2}])).definition;
  eq([annihilator.keywords, annihilator.abilities[0].trigger.on, annihilator.abilities[0].effects], [["Annihilator"], "GameEventAttackersDeclared",
    [{effect: "sacrifice", who: "that player", count: 2, selector: {what: "permanent"}}]], "annihilator 2: the defending player sacrifices two");
  eq([0, undefined].map((amount) => compileScript(script([{kind: "keyword", text: "Annihilator", keyword: "annihilator", ...(amount !== undefined ? {amount} : {})}])).problems
    .some((p) => /annihilator needs its number/.test(p))), [true, true], "annihilator with no number, or zero: refused");
}

/* ---- every life loss said, and counted ---- */
{
  /* Combat damage: counted in the life lost this turn (it was not). */
  const s = play([at(0, "battlefield", "Bear")]);
  for (let n = 0; n < 200 && s.awaiting?.kind !== "declare-attackers"; n += 1) step(s);
  resolveAwaiting(s, [0]);
  for (let n = 0; n < 200 && s.phase !== "MAIN2"; n += 1) step(s);
  eq([life(s), lostThisTurn(s, 1)], [[40, 38], 2], "combat damage: 2 lost, counted");
}
{
  /* Life paid as a cost: lost, said and counted -- a mana ability's, an activated ability's. */
  const s = play([at(0, "battlefield", "Myr Convert", "Vilis, Broker of Blood", "Swamp"), at(1, "battlefield", "Bear")]);
  const myr = named(s, "Myr Convert")[0];
  const events = applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.objectId === myr && a.mana?.B === 1));
  eq([life(s)[0], lostThisTurn(s, 0), events.filter((e) => e.kind === "GameEventPlayerLivesChanged").map((e) => [e.data.fields.oldLives, e.data.fields.newLives])],
    [38, 2, [[40, 38]]], "the Myr's 2 life: lost, counted, said");
}
{
  /* Life paid in a spell's cost: an alternative cost's (Snuff Out), flashback's (Deep Analysis), Phyrexian mana's
     (Phyrexian Metamorph) -- and an activated ability's Phyrexian mana (Solphim). Each lost, counted and said. */
  const paid = (setup, pick) => {
    const s = play(setup);
    for (const a of legalActions(s, 0).filter((x) => x.kind === "activate-mana")) applyAction(s, 0, a);
    const events = applyAction(s, 0, legalActions(s, 0).find(pick));
    return [life(s)[0], lostThisTurn(s, 0), events.filter((e) => e.kind === "GameEventPlayerLivesChanged" && e.data.fields.player.playerId === 0).length];
  };
  eq(paid([at(0, "battlefield", "Swamp"), at(0, "hand", "Snuff Out"), at(1, "battlefield", "Bear")], (a) => a.kind === "cast" && a.label === "Snuff Out" && a.alternative !== undefined && a.alternative !== false),
    [36, 4, 1], "Snuff Out for 4 life");
  eq(paid([at(0, "battlefield", "Island", "Wastes"), at(0, "graveyard", "Deep Analysis")], (a) => a.kind === "cast" && a.label === "Deep Analysis" && a.flashback === true),
    [37, 3, 1], "Deep Analysis's flashback, 3 life");
  eq(paid([at(0, "battlefield", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Phyrexian Metamorph")], (a) => a.kind === "cast" && a.label === "Phyrexian Metamorph"),
    [38, 2, 1], "{U/P} paid with 2 life");
  eq(paid([at(0, "battlefield", "Solphim, Mayhem Dominus", "Wastes"), at(0, "hand", "Bear", "Ogre")], (a) => a.kind === "activate" && a.label === "Solphim, Mayhem Dominus"),
    [36, 4, 1], "Solphim's {R/P}{R/P} paid with 4 life");
}
{
  /* A commander's damage: said and counted too (rules/sba.mjs). */
  const s = play([at(0, "battlefield", "Bear")]);
  const events = dealCommanderDamage(s, 1, named(s, "Bear")[0], 3);
  eq([life(s), lostThisTurn(s, 1), events.filter((e) => e.kind === "GameEventPlayerLivesChanged").length], [[40, 37], 3, 1], "commander damage: lost, counted, said");
}

/* ---- whenever a player loses life ---- */
{
  /* Three players: Sting takes 1 from each opponent -- Exquisite Blood triggers once for each of them. */
  const s = play([at(0, "battlefield", "Exquisite Blood", "Mountain"), at(0, "hand", "Sting")], 3);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === "Sting"));
  settle(s);
  eq(life(s), [42, 39, 39], "a loss each: two triggers, 1 life each");
}
{
  /* Three players, Mindcrank: each opponent's loss its own -- each mills the 1 they lost, not one of them 2. */
  const s = play([at(0, "battlefield", "Mindcrank", "Mountain"), at(0, "hand", "Sting")], 3);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === "Sting"));
  settle(s);
  eq(s.zones.graveyard.map((z) => z.length), [1, 1, 1], "Maya and Trey mill one each (Rob's Sting in his graveyard)");
}
{
  /* A gain is not a loss; nor is infect's damage, which loses no life. */
  const s = play([at(0, "battlefield", "Exquisite Blood", "Leech"), at(1, "battlefield", "Bear")]);
  runEffects(s, [{effect: "gainLife", amount: 3, who: [1]}], {controller: 1, source: null});
  runEffects(s, [{effect: "dealDamage", amount: 1, from: [named(s, "Leech")[0]], toPlayer: 1}], {controller: 0, source: named(s, "Leech")[0]});
  settle(s);
  eq([life(s), s.players[1].poison], [[41, 43], 1], "her gain and her infect damage: no trigger; the Leech's lifelink still gains him 1");
}

/* ---- infect ---- */
{
  /* To a creature: -1/-1 counters, not damage; with deathtouch, destroyed all the same (CR 702.2b). */
  const s = play([at(0, "battlefield", "Leech", "Asp"), at(1, "battlefield", "Ogre", "Bear")]);
  const [ogre] = named(s, "Ogre"), [bear] = named(s, "Bear"), [leech] = named(s, "Leech"), [asp] = named(s, "Asp");
  runEffects(s, [{effect: "dealDamage", amount: 1, from: [leech], targets: [ogre]}], {controller: 0, source: leech});
  eq([s.objects[ogre].damage, s.objects[ogre].counters["-1/-1"], life(s)[0]], [0, 1, 41], "the Ogre: a -1/-1 counter, no damage; lifelink: he gains 1");
  runEffects(s, [{effect: "dealDamage", amount: 1, from: [asp], targets: [bear]}], {controller: 0, source: asp});
  checkStateBasedActions(s);
  eq(named(s, "Bear").length, 0, "the Bear, a 2/2 given a -1/-1 counter by a deathtoucher: destroyed");
}
{
  /* Combat, to a player: poison, no life lost, lifelink still; the damage event says it was infect's. */
  const s = play([at(0, "battlefield", "Leech")]);
  for (let n = 0; n < 200 && s.awaiting?.kind !== "declare-attackers"; n += 1) step(s);
  resolveAwaiting(s, [0]);
  const seen = [];
  for (let n = 0; n < 200 && s.phase !== "MAIN2"; n += 1) {
    if (s.awaiting) resolveAwaiting(s, []);
    else if (s.priorityPlayer === null) seen.push(...advance(s));
    else if (passPriority(s).outcome === "step-ends") seen.push(...advance(s));
  }
  eq([life(s), s.players[1].poison, seen.filter((e) => e.kind === "GameEventPlayerDamaged").map((e) => e.data.fields.infect)], [[41, 40], 1, [true]],
    "poison, no life lost; lifelink gained 1; the damage event infect's");
}
{
  /* Combat, to a creature: Maya's Ogre blocks the Leech -- a -1/-1 counter, no damage marked. */
  const s = play([at(0, "battlefield", "Leech"), at(1, "battlefield", "Ogre")]);
  for (let n = 0; n < 200 && s.awaiting?.kind !== "declare-attackers"; n += 1) step(s);
  resolveAwaiting(s, [0]);
  for (let n = 0; n < 200 && s.awaiting?.kind !== "declare-blockers"; n += 1) step(s);
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => /Ogre/.test(o.label)).index]);
  for (let n = 0; n < 200 && s.phase !== "MAIN2"; n += 1) step(s);
  const [ogre] = named(s, "Ogre");
  eq([s.objects[ogre].counters["-1/-1"], s.objects[ogre].damage, named(s, "Leech").length], [1, 0, 0], "the Ogre a -1/-1 counter, undamaged; the Leech dead");
}
{
  /* Its damage event, to a player and a creature, from an effect: marked as infect's. */
  const s = play([at(0, "battlefield", "Leech"), at(1, "battlefield", "Ogre")]);
  const [leech] = named(s, "Leech");
  const events = runEffects(s, [{effect: "dealDamage", amount: 1, from: [leech], toPlayer: 1}], {controller: 0, source: leech});
  eq(events.filter((e) => e.kind === "GameEventPlayerDamaged").map((e) => e.data.fields.infect), [true], "the damage event: infect's");
}

/* ---- annihilator ---- */
{
  /* Three players: the defending player is the one attacked (Trey), not Maya. */
  const s = play([at(0, "battlefield", "It That Betrays"), at(1, "battlefield", "Relic"), at(2, "battlefield", "Bear", "Ogre")], 3);
  for (let n = 0; n < 200 && s.awaiting?.kind !== "declare-attackers"; n += 1) step(s);
  const choice = awaitingChoice(s);
  resolveAwaiting(s, [choice.options.find((o) => o.label.endsWith("Trey")).index]);
  for (let n = 0; n < 30 && !s.awaiting; n += 1) passPriority(s);
  eq([s.awaiting?.player, awaitingChoice(s).options.map((o) => o.label).sort()], [2, ["Bear", "Ogre"]], "Trey asked, his two permanents");
}

console.log(`engine-life-lost-infect: ${checks} checks passed`);
