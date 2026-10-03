/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 67 (THE CATALOG'S ORDER): A TOKEN THAT ENTERS TAPPED AND ATTACKING (Forge's TokenAttacking, CR 508.4)
 * AND "ONLY ONCE EACH TURN" (ActivationLimit, credited: an ability's `limit` was built already).
 *
 * Attacking "that player" (Adeline: one for each opponent, attacking each), or the defending player its controller
 * chooses -- every opponent in Commander (CR 802.2), asked a creature at a time when there is more than one. Never
 * declared, so nothing that triggers on attacking sees it (General Kreat's Goblin does not trigger Kreat again); blocked
 * or not as the combat goes, and the player it attacks now defends. Only in a combat, only a creature, only the attacking
 * player's (CR 506.3a-b), never at a player who has left the game (CR 508.4a). "Whenever you attack with one or more ..."
 * read by the attackers; "when this enters from your hand"; mana in any combination of {U} and/or {R}.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {awaitingChoice, advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {legalActions, manaAlternatives} from "../game/engine/rules/actions.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const creature = (power, more = {}) => ({types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power, toughness: power, ...more});
const FIX = {Bear: creature(2), Gnome: creature(1, {subtypes: ["Gnome"]}), "Goblin Raider": creature(1, {subtypes: ["Goblin"], manaCost: "{R}", colors: ["R"]})};
const play = (setup, steps, seats = 2) => runScenario({name: "attacking", seats, setup, steps, expect: []}, cards.definition, FIX).state;
const attacks = (s) => s.combat.attacks.filter((a) => s.objects[a.attacker]).map((a) => [s.objects[a.attacker].card, a.defender]);
const CAT = {name: "Cat", types: ["Creature"], subtypes: ["Cat"], colors: ["W"], power: 1, toughness: 1};
const named = (s, name) => s.zones.battlefield.filter((id) => s.objects[id].card === name);

{
  /* Three at the table: Leonin Warleader attacks Maya, and Rob chooses for each Cat -- Maya or Trey. */
  const warleader = [at(0, "battlefield", "Leonin Warleader")];
  const s = play(warleader, [{attack: ["Leonin Warleader"]}, {resolve: true}], 3);
  eq([s.awaiting?.effect, awaitingChoice(s).options.map((o) => o.label)], ["attackWhom", ["Maya", "Trey"]], "every opponent defends: Maya or Trey");
  const t = play(warleader, [{attack: ["Leonin Warleader"]}, {resolve: true}, {choose: ["Trey"]}, {choose: ["Maya"]}], 3);
  eq([attacks(t), [...t.combat.defenders].sort()], [[["Leonin Warleader", 1], ["Cat", 2], ["Cat", 1]], [1, 2]], "one Cat at Trey, one at Maya; Trey defends now");
  /* Trey is dealt the first Cat's 1; Maya the Warleader's 4 and the second's 1; Rob gains 2. */
  const u = play(warleader, [{attack: ["Leonin Warleader"]}, {resolve: true}, {choose: ["Trey"]}, {choose: ["Maya"]}, {to: {turn: 1, phase: "COMBAT_END"}}], 3);
  eq(u.players.map((p) => p.life), [42, 35, 39], "the damage where the Cats were sent");
}
{
  /* "For each opponent ... attacking that player": Adeline attacks Maya, and a Human attacks each of Maya and Trey. */
  const s = play([at(0, "battlefield", "Adeline, Resplendent Cathar")], [{attack: ["Adeline, Resplendent Cathar"]}, {resolve: true}], 3);
  eq([s.awaiting ?? null, attacks(s), [...s.combat.defenders].sort()], [null, [["Adeline, Resplendent Cathar", 1], ["Human", 1], ["Human", 2]], [1, 2]], "a Human at each, nothing asked");
}
{
  /* Never declared: General Kreat's Goblin, attacking, triggers his "another creature enters", never his "Goblins attack". */
  const s = play([at(0, "battlefield", "General Kreat, the Boltbringer"), at(0, "battlefield", "Goblin Raider")], [{attack: ["Goblin Raider"]}, {resolve: true}]);
  eq(s.stack.map((e) => e.abilityId), [cards.definition("General Kreat, the Boltbringer").abilities[1].id], "only the enters trigger waits");
  /* Blocked as the combat goes: in the declare blockers step Maya's Bear may block the Cat. */
  const b = play([at(0, "battlefield", "Leonin Warleader"), at(1, "battlefield", "Bear")], [{attack: ["Leonin Warleader"]}, {resolve: true}]);
  for (let n = 0; n < 40 && b.awaiting?.kind !== "declare-blockers"; n += 1) { if (b.priorityPlayer === null) advance(b); else if (passPriority(b).outcome === "step-ends") advance(b); }
  const cats = named(b, "Cat");
  eq(awaitingChoice(b).options.filter((o) => cats.includes(o.attackerId)).length, 2, "her Bear may block either Cat");
}
{
  /* Only in a combat, only a creature, only the attacking player's, never at a player who has left. */
  const s = play([at(0, "battlefield", "Bear")], [{attack: ["Bear"]}]);
  runEffects(s, [{effect: "createToken", count: 1, token: CAT, attacking: true, controller: 1}], {controller: 0, source: null});
  runEffects(s, [{effect: "createToken", count: 1, token: {predefined: "Treasure"}, attacking: true}], {controller: 0, source: null});
  eq(attacks(s), [["Bear", 1]], "Maya's Cat and Rob's Treasure: neither attacking");
  const quiet = play([], []);
  runEffects(quiet, [{effect: "createToken", count: 1, token: CAT, attacking: true}], {controller: 0, source: null});
  eq([quiet.combat ?? null, named(quiet, "Cat").length], [null, 1], "outside a combat: just a Cat");
  /* Three at the table, run outside a resolution: no one to ask, so the first in turn order -- Maya. */
  const gone = play([at(0, "battlefield", "Bear")], [{attack: ["Bear"]}], 3);
  const token = (name, attacking, about) => runEffects(gone, [{effect: "createToken", count: 1, token: {...CAT, name}, attacking}], {controller: 0, source: null, ...(about ? {about} : {})});
  token("Lynx", true);
  /* Maya leaves: nothing attacks her any more (CR 508.4a), and Trey is the one defending player. */
  gone.players[1].lost = true;
  token("Cat", "that player", {player: 1});
  token("Wolf", true);
  /* "That player" who is Rob himself, or no one: not attacking. Then Trey leaves too: no one to attack. */
  token("Elk", "that player", {player: 0});
  token("Ox", "that player");
  gone.players[2].lost = true;
  token("Boar", true);
  eq([gone.awaiting ?? null, attacks(gone)], [null, [["Bear", 1], ["Lynx", 1], ["Wolf", 2]]], "Lynx at Maya unasked; Wolf at Trey once she has left; no Cat, Elk, Ox or Boar attacking");
}
{
  /* "Whenever you attack with one or more non-Gnome creatures": a Gnome alone, nothing; with the Bear, the trigger. */
  const pakal = (...who) => play([at(0, "battlefield", "Anim Pakal, Thousandth Moon", "Bear", "Gnome")], [{attack: who}]).stack.length;
  eq([pakal("Gnome"), pakal("Gnome", "Bear")], [0, 1], "Gnomes alone don't; a Bear with them does");
  /* "This creature and/or your commander": the commander alone triggers it; another creature alone does not. */
  const commander = play([at(0, "battlefield", "Ainok Strike Leader", "Forest", "Forest"), at(0, "command", "Bear")],
    [{tap: "Forest"}, {tap: "Forest"}, {cast: "Bear"}, {resolve: true}, {to: {turn: 3, phase: "MAIN1"}}, {attack: ["Bear"]}, {resolve: true}]);
  const other = play([at(0, "battlefield", "Ainok Strike Leader", "Bear")], [{attack: ["Bear"]}]);
  eq([attacks(commander), other.stack.length], [[["Bear", 1], ["Goblin", 1]], 0], "his commander attacks: a Goblin; a plain Bear: nothing");
}
{
  /* "When this creature enters from your hand"; Vivi's mana in any combination of {U} and/or {R}, on his turn only. */
  eq(cards.definition("Thousand-Faced Shadow").abilities.find((a) => a.kind === "triggered").trigger.from, "Hand", "the trigger reads where it came from");
  const s = play([at(0, "battlefield", "Vivi Ornitier")], []);
  const vivi = named(s, "Vivi Ornitier")[0];
  s.objects[vivi].counters = {"+1/+1": 2};
  const ability = s.objects[vivi].abilities.find((a) => a.kind === "mana");
  eq(manaAlternatives(s, 0, ability, vivi), [{U: 2}, {U: 1, R: 1}, {R: 2}], "power 2: {U}{U}, {U}{R} or {R}{R}, no other color");
  const later = play([at(0, "battlefield", "Vivi Ornitier")], [{to: {turn: 2, phase: "MAIN1"}}]);
  eq(legalActions(later, 0).filter((a) => a.kind === "activate-mana" && a.label === "Vivi Ornitier").length, 0, "not on Maya's turn");
}
{
  eq([missingFor({options: ["TokenAttacking"]}), missingFor({options: ["ActivationLimit"]})], [[], []], "the catalog credits TokenAttacking and ActivationLimit");
}

console.log(`engine-token-attacking: ${checks} checks passed — attacking that player, or the defending player chosen a creature at a time; never declared, blockable, its player defending; only in a combat, a creature, the attacker's, at a player still in the game; "with one or more" by the attackers, "your commander"; from your hand; {U} and/or {R}.`);
