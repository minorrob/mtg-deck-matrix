/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 66 (THE CATALOG'S ORDER): ATTACK TAXES (Forge's CantAttackUnless, CR 508.1g-h) AND "DOESN'T UNTAP"
 * (Forge's Untap replacement, CR 502.3).
 *
 * "Creatures can't attack you unless their controller pays {2} for each": paid as attackers are declared, for each creature
 * attacking the player whose permanent says so, an amount counted then (Sphere of Safety); more than can be paid, and that
 * attack can't be declared; no attack, nothing paid. "Doesn't untap during your untap step": what the static names stays
 * tapped -- any player's (Intruder Alarm), by its power now (Meekstone) -- until the static is gone. "You may pay {4}" that
 * can't be paid asks nothing; that can, it asks, and paying untaps Mana Vault.
 */
import assert from "node:assert/strict";
import {createState, addObject, moveObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {attackTax} from "../game/engine/rules/statics.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const creature = (name, power, more = {}) => ({card: name, types: ["Creature"], manaCost: "{G}", colors: ["G"], power, toughness: power, ...more});
const FIX = {Bear: creature("Bear", 2), Elf: creature("Elf", 1), Glory: {types: ["Enchantment"], manaCost: "{2}", colors: []}};

/* The game played on with nobody doing anything: priority passed, no attackers or blockers declared. */
function toStep(s, turn, phase) {
  for (let n = 0; n < 400 && !(s.turn === turn && s.phase === phase && s.priorityPlayer !== null); n += 1) {
    if (s.awaiting) resolveAwaiting(s, []);
    else if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  assert.equal(`${s.turn} ${s.phase}`, `${turn} ${phase}`, "the game reached the step");
}
function table(seats = 2) {
  const s = createState({matchId: "m", seed: "tax", players: ["Rob", "Maya", "Trey"].slice(0, seats).map((name) => ({name}))});
  for (let seat = 0; seat < seats; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  toStep(s, 1, "MAIN1");
  return s;
}
const put = (s, o, seat = 0, tapped = false) => { const id = addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null); s.objects[id].tapped = tapped; return id; };
const tapped = (s, ...ids) => ids.map((id) => s.objects[id].tapped === true);

{
  /* Propaganda: two attackers, {4} -- all four of Rob's Wastes -- and both attack. */
  const {state: s} = runScenario({name: "two", setup: [at(0, "battlefield", "Bear", "Elf", "Wastes", "Wastes", "Wastes", "Wastes"), at(1, "battlefield", "Propaganda")],
    steps: [{attack: ["Bear", "Elf"]}], expect: []}, cards.definition, FIX);
  eq([s.zones.battlefield.filter((id) => s.objects[id].card === "Wastes").map((id) => s.objects[id].tapped), s.combat?.attacks.length], [[true, true, true, true], 2], "{2} for each of two attackers, paid");
  /* Three Wastes for two attackers: that attack can't be declared. */
  assert.throws(() => runScenario({name: "short", setup: [at(0, "battlefield", "Bear", "Elf", "Wastes", "Wastes", "Wastes"), at(1, "battlefield", "Propaganda")],
    steps: [{attack: ["Bear", "Elf"]}], expect: []}, cards.definition, FIX), /cost \{4\} to attack with, more than can be paid/);
  checks += 1;
  /* No attack, nothing paid. */
  const {state: t} = runScenario({name: "none", setup: [at(0, "battlefield", "Bear", "Wastes", "Wastes"), at(1, "battlefield", "Propaganda")],
    steps: [{attack: []}], expect: []}, cards.definition, FIX);
  eq([t.zones.battlefield.filter((id) => t.objects[id].card === "Wastes").some((id) => t.objects[id].tapped), t.combat ?? null], [false, null], "declining to attack costs nothing");
}
{
  /* Only the player whose permanent says so: Maya's Propaganda taxes attacks on her, not on Trey; Rob's own taxes attacks
     on Rob. */
  const s = table(3);
  put(s, card("Propaganda"), 1);
  put(s, card("Propaganda"), 0);
  eq([attackTax(s, [{defenderId: 1}, {defenderId: 2}]), attackTax(s, [{defenderId: 1}, {defenderId: 1}]), attackTax(s, [{defenderId: 2}]), attackTax(s, [{defenderId: 0}])],
    [2, 4, 0, 2], "{2} for each attacker at Maya, none at Trey, {2} at Rob from his own");
}
{
  /* Sphere of Safety: {X} where X is the enchantments she controls -- itself among them, not Rob's -- counted now. */
  const s = table();
  const sphere = put(s, card("Sphere of Safety"), 1);
  put(s, FIX.Glory, 1);
  put(s, FIX.Glory, 0);
  const before = attackTax(s, [{defenderId: 1}]);
  put(s, FIX.Glory, 1);
  const more = attackTax(s, [{defenderId: 1}]);
  moveObject(s, sphere, "graveyard", 1);
  eq([before, more, attackTax(s, [{defenderId: 1}])], [2, 3, 0], "two of hers, then three, then the Sphere gone");
}
{
  /* Basalt Monolith stays tapped through Rob's untap step; his Bear beside it untaps. */
  const s = table();
  const monolith = put(s, card("Basalt Monolith"), 0, true), bear = put(s, FIX.Bear, 0, true);
  toStep(s, 3, "MAIN1");
  eq(tapped(s, monolith, bear), [true, false], "the Monolith tapped, the Bear untapped");
}
{
  /* Intruder Alarm: every creature, anyone's -- Maya's Bear through her untap step, Rob's through his -- and nothing else. */
  const s = table();
  put(s, card("Intruder Alarm"), 0);
  const his = put(s, FIX.Bear, 0, true), hers = put(s, FIX.Bear, 1, true), land = put(s, WASTES, 0, true);
  toStep(s, 2, "MAIN1");
  const onHers = tapped(s, hers);
  toStep(s, 3, "MAIN1");
  eq([...onHers, ...tapped(s, his, land)], [true, true, false], "both Bears stay tapped; Rob's Wastes untaps");
}
{
  /* Meekstone: power 3 or greater now -- a Bear with a +1/+1 counter, not an Elf -- and once it is gone, the Bear untaps. */
  const s = table();
  const stone = put(s, card("Meekstone"), 1);
  const bear = put(s, FIX.Bear, 0, true), elf = put(s, FIX.Elf, 0, true);
  s.objects[bear].counters = {"+1/+1": 1};
  toStep(s, 3, "MAIN1");
  const held = tapped(s, bear, elf);
  moveObject(s, stone, "graveyard", 1);
  toStep(s, 5, "MAIN1");
  eq([...held, ...tapped(s, bear)], [true, false, false], "the 3/3 Bear held, the Elf not; the Meekstone gone, the Bear untaps");
}
{
  /* Mana Vault's "you may pay {4}": Rob with nothing to pay it with is asked nothing; with four Wastes he is asked, and
     paying untaps it -- no damage in his draw step. (The Vault arrives after the game starts: on his first upkeep it is
     untapped, and the trigger asks then too, as it should.) */
  const vault = (lands, steps) => runScenario({name: "vault", setup: [at(0, "battlefield", ...lands), {...at(0, "battlefield", "Mana Vault"), sick: true}], steps, expect: []}, cards.definition, {}).state;
  const s = vault([], [{tap: "Mana Vault"}, {to: {turn: 3, phase: "UPKEEP"}}, {resolve: true}]);
  eq([s.awaiting ?? null, s.stack.length], [null, 0], "unpayable: the trigger resolves asking nothing");
  const four = ["Wastes", "Wastes", "Wastes", "Wastes"];
  const t = vault(four, [{tap: "Mana Vault"}, {to: {turn: 3, phase: "UPKEEP"}}, {resolve: true}]);
  eq([t.awaiting?.effect, awaitingChoice(t).options.map((o) => o.label)], ["unlessPays", ["Pay {4}", "Don't pay"]], "payable: asked");
  const u = vault(four, [{tap: "Mana Vault"}, {to: {turn: 3, phase: "UPKEEP"}}, {resolve: true}, {choose: ["Pay {4}"]}, {to: {turn: 3, phase: "MAIN1"}}]);
  const id = (name) => u.zones.battlefield.filter((i) => u.objects[i].card === name);
  eq([id("Mana Vault").map((i) => u.objects[i].tapped), id("Wastes").map((i) => u.objects[i].tapped), u.players[0].life],
    [[false], [true, true, true, true], 40], "paid: the Vault untapped, the Wastes tapped, no damage");
}
{
  eq([missingFor({statics: ["CantAttackUnless"]}), missingFor({replacements: ["Untap"]})], [[], []], "the catalog credits CantAttackUnless and the Untap replacement");
}

console.log(`engine-attack-tax: ${checks} checks passed — {2} for each attacker paid as they are declared, at the player whose permanent says so, counted then, more than can be paid refused, no attack nothing paid; doesn't untap: itself, anyone's creatures, by power now, until the static is gone; "you may pay" unpayable asks nothing, payable asks and untaps.`);
