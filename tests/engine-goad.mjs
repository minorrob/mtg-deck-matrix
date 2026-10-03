/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 69 (THE CATALOG'S ORDER): GOAD (Forge's Goad, CR 701.15) AND "CAN'T BE BLOCKED BY" (Forge's
 * CantBlockBy, credited: the static `cant-be-blocked-by` was built already).
 *
 * A goaded creature attacks each combat if able and attacks a player other than its goader if able -- "able" without a
 * cost to pay (CR 508.1d): its goader is not offered while another player it may attack for free is, and one its
 * controller leaves out attacks anyway. Goaded by two, it avoids both if it can. It lasts until the goader's next turn.
 * "Can't be blocked by creatures with power 3 or greater"; "your opponents can't block with creatures with even mana
 * values"; "your opponents can't cast spells with even mana values" -- zero is even.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {castForbidden, goadersOf} from "../game/engine/rules/statics.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const creature = (cost, power, more = {}) => ({types: ["Creature"], manaCost: cost, colors: ["G"], power, toughness: power, ...more});
const FIX = {Bear: creature("{1}{G}", 2), Ogre: creature("{2}{R}", 3), Elf: creature("{G}", 1), Bauble: {types: ["Artifact"], manaCost: "{0}", colors: []}};
const play = (setup, seats = 3) => runScenario({name: "goad", seats, setup, steps: [], expect: []}, cards.definition, FIX).state;
const named = (s, name, seat) => s.zones.battlefield.filter((id) => s.objects[id].card === name && (seat === undefined || s.objects[id].controller === seat));
/* On to the next declare-attackers (or declare-blockers) question, nothing else answered but with nothing. */
const until = (s, kind) => { for (let n = 0; n < 80 && s.awaiting?.kind !== kind; n += 1) { if (s.awaiting) resolveAwaiting(s, []); else if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); } };
/* On to that player's turn, its first priority. */
const turnOf = (s, player) => { for (let n = 0; n < 200 && !(s.activePlayer === player && s.priorityPlayer !== null); n += 1) { if (s.awaiting) resolveAwaiting(s, []); else if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); } };
const goad = (s, by, ids) => runEffects(s, [{effect: "goad", targets: ids}], {controller: by, source: null});
const attacks = (s) => (s.combat?.attacks ?? []).map((a) => [s.objects[a.attacker].card, a.defender]);

{
  /* Rob goads Maya's Bear. On her turn it is offered at Trey only, not Rob -- and declared by no one, it attacks Trey. */
  const s = play([at(1, "battlefield", "Bear")]);
  goad(s, 0, named(s, "Bear"));
  until(s, "declare-attackers");
  eq([s.activePlayer, awaitingChoice(s).options.map((o) => o.label)], [1, ["Bear → Trey"]], "her turn: the Bear may attack Trey, not its goader");
  resolveAwaiting(s, []);
  eq(attacks(s), [["Bear", 2]], "left out, it attacks anyway");
  /* Until Rob's next turn: on Trey's it is still goaded, on Rob's it is not. */
  turnOf(s, 2);
  const onTrey = [s.activePlayer, goadersOf(s, named(s, "Bear")[0])];
  turnOf(s, 0);
  eq([...onTrey, s.activePlayer, goadersOf(s, named(s, "Bear")[0])], [2, [0], 0, []], "goaded through Trey's turn, over as Rob's begins");
}
{
  /* A cost to attack Trey (his Propaganda): not "able" there, so the Bear may attack Rob, and left out it does. */
  const s = play([at(1, "battlefield", "Bear"), at(2, "battlefield", "Propaganda")]);
  goad(s, 0, named(s, "Bear"));
  until(s, "declare-attackers");
  const offered = awaitingChoice(s).options.map((o) => o.label);
  resolveAwaiting(s, []);
  eq([offered, attacks(s)], [["Bear → Rob", "Bear → Trey"], [["Bear", 0]]], "both offered; left out, it attacks Rob for free");
  /* A cost everywhere: not required to attack at all. */
  const t = play([at(1, "battlefield", "Bear"), at(0, "battlefield", "Propaganda"), at(2, "battlefield", "Propaganda")]);
  goad(t, 0, named(t, "Bear"));
  until(t, "declare-attackers");
  resolveAwaiting(t, []);
  eq(t.combat ?? null, null, "every attack costs: no attack");
}
{
  /* Goaded by Rob and by Trey: both are offered, and left out it attacks the first after Maya -- Trey. Declared at Rob by
     Maya herself, it attacks Rob, once. */
  const s = play([at(1, "battlefield", "Bear")]);
  goad(s, 0, named(s, "Bear"));
  goad(s, 2, named(s, "Bear"));
  until(s, "declare-attackers");
  const choice = awaitingChoice(s);
  const atRob = choice.options.find((o) => o.label === "Bear → Rob").index;
  resolveAwaiting(s, []);
  eq([choice.options.map((o) => o.label), attacks(s)], [["Bear → Rob", "Bear → Trey"], [["Bear", 2]]], "both goaders offered; left out, at Trey");
  const t = play([at(1, "battlefield", "Bear")]);
  goad(t, 0, named(t, "Bear"));
  goad(t, 2, named(t, "Bear"));
  until(t, "declare-attackers");
  resolveAwaiting(t, [atRob]);
  eq(attacks(t), [["Bear", 0]], "her own choice stands");
  /* Goaded by Trey alone, first after Maya in turn order: left out, it passes him by for Rob. */
  const v = play([at(1, "battlefield", "Bear")]);
  goad(v, 2, named(v, "Bear"));
  until(v, "declare-attackers");
  resolveAwaiting(v, []);
  /* And a card no longer on the battlefield is goaded by nothing. */
  const gone = play([at(1, "graveyard", "Bear")]);
  goad(gone, 0, gone.zones.graveyard[1]);
  eq([attacks(v), (gone.effects ?? []).filter((e) => e.rule === "goaded").length], [[["Bear", 0]], 0], "at Rob, not its goader; a card in a graveyard: no goad");
  /* A goaded creature that cannot attack -- tapped -- is not made to. */
  const u = play([at(1, "battlefield", "Bear", "Ogre")]);
  goad(u, 0, named(u, "Bear"));
  turnOf(u, 1);
  u.objects[named(u, "Bear")[0]].tapped = true;
  until(u, "declare-attackers");
  resolveAwaiting(u, []);
  eq([u.combat ?? null, compileSelector({what: "permanent", goaded: true})(u, named(u, "Bear")[0], {controller: 0}), compileSelector({what: "permanent", goaded: true})(u, named(u, "Ogre")[0], {controller: 0})],
    [null, true, false], "tapped: no attack; the Bear is goaded, the Ogre not");
}
{
  /* Delney: Rob's Bear (power 2) can't be blocked by Maya's Ogre (power 3); her Elf may block it. */
  const s = play([at(0, "battlefield", "Delney, Streetwise Lookout", "Bear"), at(1, "battlefield", "Ogre", "Elf")], 2);
  until(s, "declare-attackers");
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === "Bear → Maya").index]);
  until(s, "declare-blockers");
  eq(awaitingChoice(s).options.map((o) => o.label), ["Elf blocks Bear"], "the Elf only");
  /* Void Winnower: her Bear (mana value 2) can't block, her Elf (1) can; she can't cast a {0} Bauble or a Bear, can an Elf. */
  const t = play([at(0, "battlefield", "Void Winnower", "Ogre"), at(1, "battlefield", "Bear", "Elf"), at(1, "hand", "Bauble", "Bear", "Elf"), at(0, "hand", "Bauble")], 2);
  const forbidden = (seat, name) => castForbidden(t, seat, t.zones.hand[seat].find((id) => t.objects[id].card === name));
  eq([forbidden(1, "Bauble"), forbidden(1, "Bear"), forbidden(1, "Elf"), forbidden(0, "Bauble")], [true, true, false, false], "zero and two are even; one is not; Rob is not her");
  until(t, "declare-attackers");
  resolveAwaiting(t, [awaitingChoice(t).options.find((o) => o.label === "Ogre → Maya").index]);
  until(t, "declare-blockers");
  eq(awaitingChoice(t).options.map((o) => o.label), ["Elf blocks Ogre"], "the Elf only");
}
{
  eq([missingFor({apis: ["Goad"]}), missingFor({statics: ["CantBlockBy"]})], [[], []], "the catalog credits Goad and CantBlockBy");
}

console.log(`engine-goad: ${checks} checks passed — a goaded creature offered away from its goader, attacking anyway when left out, only where it costs nothing, avoiding two goaders, its controller's choice standing, not when it cannot; until the goader's next turn; can't be blocked by power 3 or more; even mana values can't block or be cast.`);
