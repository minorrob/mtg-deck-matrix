/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 77 (THE CATALOG'S ORDER): PROWESS (CR 702.108), TOXIC (CR 702.164) AND DEVOID (CR 702.114).
 *
 * Prowess is its triggered ability: "whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn"
 * -- cast, so a copy is not; yours, so an opponent's spell is not. Toxic N is a static ability: a player dealt combat
 * damage by the creature also gets N poison counters -- combat damage only, every instance added (702.164b), a given
 * one too ("other Rats you control have toxic 1"), none once it has lost its abilities. Devoid is colorless in every
 * zone: the card's identity says none. And proliferate now sees a player's poison counters (CR 122.1f, 701.34a), which
 * it did not.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {proliferate as asked} from "../game/engine/script/effects/asking.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {STATIC_RULES} from "../game/engine/rules/statics.mjs";
import {readdirSync, readFileSync} from "node:fs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const creature = (cost, subtypes, more = {}) => ({types: ["Creature"], subtypes, manaCost: cost, colors: ["B"], power: 2, toughness: 2, ...more});
const FIX = {Rat: creature("{1}{B}", ["Rat"]), Bear: creature("{1}{G}", ["Bear"]),
  Kill: {types: ["Instant"], manaCost: "{C}", colors: [], spell: {id: "s", text: "Destroy target creature.", targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "destroy", targets: {target: 0}}]}}};
const play = (setup, seats = 2) => runScenario({name: "batch 77", seats, setup, steps: [], expect: []}, cards.definition, FIX).state;
const named = (s, name, seat) => s.zones.battlefield.filter((id) => s.objects[id].card === name && (seat === undefined || s.objects[id].controller === seat));
/* Everyone passes, every question answered with nothing, until the turn's combat is over. */
const throughCombat = (s, attackers) => {
  for (let n = 0; n < 200 && s.awaiting?.kind !== "declare-attackers"; n += 1) { if (s.awaiting) resolveAwaiting(s, []); else if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); }
  const choice = awaitingChoice(s);
  resolveAwaiting(s, attackers.map(([id, defender]) => choice.options.find((o) => o.cardId === id && o.label.endsWith(s.players[defender].name)).index));
  for (let n = 0; n < 200 && s.phase !== "MAIN2"; n += 1) { if (s.awaiting) resolveAwaiting(s, []); else if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); }
};
const poisonOf = (s) => s.players.map((p) => p.poison ?? 0);

/* ---- compiling the three ---- */
const script = (abilities, identity = {}) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "test", types: ["Creature"], colors: [], ...identity}, oracleText: "", abilities});
{
  eq([missingFor({keywords: ["Prowess"]}), missingFor({keywords: ["Toxic"]}), missingFor({keywords: ["Devoid"]})], [[], [], []], "prowess, toxic and devoid have behavior");
  const toxic = compileScript(script([{kind: "keyword", text: "Toxic 2", keyword: "toxic", amount: 2}])).definition;
  eq([toxic.keywords, toxic.abilities.map((a) => [a.kind, a.rule, a.amount])], [["Toxic"], [["static", "toxic", 2]]], "toxic 2: the keyword, and its static with its number");
  eq([0, undefined, 1.5].map((amount) => compileScript(script([{kind: "keyword", text: "Toxic", keyword: "toxic", ...(amount !== undefined ? {amount} : {})}])).problems.some((p) => /toxic needs its number/.test(p))),
    [true, true, true], "toxic with no number, zero or half: refused");
  const prowess = compileScript(script([{kind: "keyword", text: "Prowess", keyword: "prowess"}])).definition;
  eq([prowess.keywords, prowess.abilities[0].trigger, prowess.abilities[0].effects],
    [["Prowess"], {on: "GameEventSpellAbilityCast", caster: "you", filter: {nonTypes: ["Creature"]}}, [{effect: "pump", targets: "self", power: 1, toughness: 1}]],
    "prowess: the triggered ability, a noncreature spell you cast");
  eq([compileScript(script([{kind: "keyword", text: "Devoid", keyword: "devoid"}])).definition.keywords,
    compileScript(script([{kind: "keyword", text: "Devoid", keyword: "devoid"}], {colors: ["U"]})).problems.some((p) => /devoid on a card whose identity has a color/.test(p))],
  [["Devoid"], true], "devoid: the keyword, on a card of no color only");
}

{
  /* Every rule a compiled definition's static carries is one rules/statics.mjs names -- toxic's among them (and storm's,
     which was not). */
  const names = [];
  for (const entry of readdirSync(new URL("../game/engine/cards/", import.meta.url), {withFileTypes: true})) if (entry.isDirectory())
    for (const file of readdirSync(new URL(`../game/engine/cards/${entry.name}/`, import.meta.url))) if (!file.endsWith(".scenarios.json"))
      names.push(JSON.parse(readFileSync(new URL(`../game/engine/cards/${entry.name}/${file}`, import.meta.url), "utf8")).identity.name);
  const unnamed = names.flatMap((name) => (cards.definition(name)?.abilities ?? []).filter((a) => a.kind === "static" && a.rule && !Object.hasOwn(STATIC_RULES, a.rule)).map((a) => a.rule));
  eq([names.length > 900, [...new Set(unnamed)]], [true, []], "every rule static a definition carries is a named rule");
}

/* ---- toxic ---- */
{
  /* Two instances add (702.164b): Karumonix-like, "other Rats you control have toxic 1" on a Rat with toxic 1. */
  const s = play([at(0, "battlefield", "Blightbelly Rat", "Rat")]);
  const toxicOne = compileScript(script([{kind: "keyword", text: "Toxic 1", keyword: "toxic", amount: 1}])).definition.abilities;
  s.effects = [...(s.effects ?? []), {id: "rats", layer: 6, affects: {what: "permanent", subtypes: ["Rat"], controller: "you"}, apply: {addAbilities: toxicOne}, until: null, sourceController: 0, timestamp: s.nextTimestamp++}];
  throughCombat(s, [[named(s, "Blightbelly Rat")[0], 1], [named(s, "Rat")[0], 1]]);
  eq([s.players[1].life, poisonOf(s)], [36, [0, 3]], "the Blightbelly Rat's two toxic and the Rat's given one: three poison counters");
}
{
  /* Combat damage only: the Rat's noncombat damage gives none. Lost its abilities: none in combat either. */
  const s = play([at(0, "battlefield", "Blightbelly Rat")]);
  const [rat] = named(s, "Blightbelly Rat");
  runEffects(s, [{effect: "dealDamage", amount: 2, from: [rat], toPlayer: 1}], {controller: 0, source: rat});
  eq([s.players[1].life, poisonOf(s)], [38, [0, 0]], "noncombat damage from it: no poison");
  s.effects = [...(s.effects ?? []), {id: "silence", layer: 6, affects: {ids: [rat]}, apply: {removeAllAbilities: true}, until: null, sourceController: 1, timestamp: s.nextTimestamp++}];
  throughCombat(s, [[rat, 1]]);
  eq([s.players[1].life, poisonOf(s)], [36, [0, 0]], "abilities lost: combat damage, no poison");
}
{
  /* Three players: the poison goes to the player it hit. */
  const s = play([at(0, "battlefield", "Bloodroot Apothecary", "Myr Convert")], 3);
  throughCombat(s, [[named(s, "Bloodroot Apothecary")[0], 2], [named(s, "Myr Convert")[0], 1]]);
  eq(poisonOf(s), [0, 1, 2], "Maya one from the Myr, Trey two from the Apothecary");
}

/* ---- prowess ---- */
{
  /* Maya's noncreature spell: not Rob's prowess. */
  const s = play([at(0, "battlefield", "Stormcatch Mentor"), at(1, "battlefield", "Wastes"), at(1, "hand", "Kill")]);
  for (let n = 0; n < 200 && !(s.activePlayer === 1 && s.priorityPlayer === 1 && s.phase === "MAIN1"); n += 1) { if (s.awaiting) resolveAwaiting(s, []); else if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); }
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "activate-mana"));
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "cast" && a.label === "Kill"));
  passPriority(s);
  eq(s.stack.length, 1, "her Kill on the stack, no prowess trigger with it");
}

/* ---- proliferate sees poison ---- */
{
  const s = play([at(0, "battlefield", "Bear")], 3);
  s.players[1].poison = 3;
  eq(asked.open(s, {}, {controller: 0}), true, "something to proliferate: asked");
  const choice = asked.choice(s, s.awaiting);
  eq(choice?.options.map((o) => o.label), ["Maya (3 poison)"], "a player with poison counters is a choice; one with none, and a permanent with none, are not");
}
{
  const s = play([at(0, "battlefield", "Bear")]);
  s.players[1].poison = 1;
  const events = runEffects(s, [{effect: "proliferate", chosen: [{player: 1}]}], {controller: 0, source: null});
  eq([poisonOf(s), events.filter((e) => e.kind === "GameEventPlayerPoisoned").length], [[0, 2], 1], "chosen: one more, reported");
}

/* ---- devoid ---- */
{
  const s = play([at(0, "battlefield", "Sifter of Skulls"), at(0, "hand", "Sire of Stagnation")]);
  const [sifter] = named(s, "Sifter of Skulls");
  const sire = Object.values(s.objects).find((o) => o.card === "Sire of Stagnation").id;
  eq([compileSelector({colorless: true})(s, sifter, {controller: 0}), compileSelector({colors: ["B"]})(s, sifter, {controller: 0}),
    compileSelector({what: "card", zone: "hand", colorless: true})(s, sire, {controller: 0})], [true, false, true], "colorless on the battlefield and in a hand; not black");
}

console.log(`engine-prowess-toxic: ${checks} checks passed`);
