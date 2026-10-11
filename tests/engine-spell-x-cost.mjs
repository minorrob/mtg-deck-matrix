/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "COUNTER TARGET SPELL WITH {X} IN ITS MANA COST UNLESS ITS CONTROLLER PAYS {3}" (Frontline Medic; Train C phase 2,
 * w2a-selectors; CR 107.3, 202.1).
 *
 * `xInManaCost: true` (script/filter.mjs): an {X} among the symbols of the mana cost the object has now -- a spell's on the
 * stack whatever X was chosen, a card's in a hand, a permanent's. {Y} is not {X}, and an object with no mana cost has none.
 * Frontline Medic's battalion is the attack as a whole ("attackers declared"), three or more declared and it among them. The
 * card's scenarios play both abilities; this suite holds the selector in every zone, its grammar, the counter at a table of
 * four, and battalion against an opponent's attack.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {compileSelector, selectMatching} from "../game/engine/script/filter.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {readFileSync} from "node:fs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();

/* ---- the selector, in every zone ---- */
{
  const s = createState({matchId: "m", seed: "x-cost", players: [{name: "Rob"}, {name: "Maya"}]});
  const put = (card, manaCost, zone) => addObject(s, {card, types: ["Sorcery"], manaCost, owner: 1, controller: 1}, zone, ["hand", "graveyard"].includes(zone) ? 1 : null);
  const blaze = put("Blaze", "{X}{R}", "stack"), shock = put("Shock", "{1}{R}", "stack"), double = put("Decree", "{X}{X}{W}", "stack");
  const why = put("Why", "{Y}{U}", "stack"), none = put("Nothing", null, "stack");
  s.stack.push(...[blaze, shock, double, why, none].map((objectId, n) => ({stackId: n + 1, objectId, kind: "spell", playerId: 1, targets: [], x: 0})));
  const spells = selectMatching(s, {what: "spell", xInManaCost: true}, {controller: 0});
  eq(spells.map((id) => s.objects[id].card), ["Blaze", "Decree"], "a spell with {X} in its mana cost: Blaze and Decree ({X}{X}); not Shock, not {Y}, not one with no mana cost");
  const match = compileSelector({what: "spell", xInManaCost: true, target: true});
  ok(match(s, blaze, {controller: 0}), "as a target too: Blaze, X chosen as 0");
  const inHand = put("Hydra", "{X}{G}{G}", "hand"), wall = put("Wall", "{2}{W}", "hand");
  eq(selectMatching(s, {what: "card", zone: "hand", controller: "you", xInManaCost: true}, {controller: 1}).map((id) => s.objects[id].card), ["Hydra"], "a card in a hand: its printed mana cost");
  void wall;
  const permanent = addObject(s, {card: "Endless One", types: ["Creature"], manaCost: "{X}", power: 0, toughness: 0, owner: 0, controller: 0}, "battlefield");
  const bear = addObject(s, {card: "Bear", types: ["Creature"], manaCost: "{1}{G}", power: 2, toughness: 2, owner: 0, controller: 0}, "battlefield");
  eq(selectMatching(s, {what: "permanent", xInManaCost: true}, {controller: 0}), [permanent], "a permanent: its mana cost, {X} alone");
  ok(!compileSelector({what: "permanent", xInManaCost: true})(s, bear, {controller: 0}), "the Bear has none");
  assert.throws(() => compileSelector({what: "spell", xInManaCost: false}), /xInManaCost is true/);
  checks += 1;
}

/* ---- the card, and its schema ---- */
const medic = JSON.parse(readFileSync(new URL("../game/engine/cards/f/frontline-medic.json", import.meta.url), "utf8"));
eq(validateScript(medic).valid, true, "Frontline Medic's definition is a valid script");
{
  const broken = structuredClone(medic);
  broken.abilities[1].targets[0].xInManaCost = "yes";
  ok(validateScript(broken).errors.some((e) => /xInManaCost is true/.test(e.message)), "the schema refuses an xInManaCost that is not true");
}

/* ---- at a table of four: Trey's X spell, countered unless Trey pays ---- */
const FIX = {
  Burst: {types: ["Instant"], manaCost: "{X}{R}", colors: ["R"], spell: {id: "s", text: "This spell deals X damage to target player.", targets: [{what: "player"}], effects: [{effect: "dealDamage", amount: "X", who: {target: 0}}]}},
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
{
  const {state: s} = runScenario({name: "four seats", seats: 4, at: {turn: 3, phase: "MAIN1"},
    setup: [at(0, "battlefield", "Frontline Medic"), at(2, "hand", "Burst"), at(2, "battlefield", "Mountain", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes")],
    steps: [{tap: "Mountain", seat: 2}, {tap: "Wastes", seat: 2}, {tap: "Wastes", seat: 2}, {cast: "Burst", seat: 2, x: 2, targets: [{player: 3}]}, {pass: 1}]}, index.definition, FIX);
  /* Priority passes from Trey to Sam, then on to Rob. */
  passPriority(s);
  eq(s.priorityPlayer, 0, "Rob holds priority with Trey's Burst on the stack");
  const sacrifice = legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Frontline Medic");
  eq(sacrifice.length, 1, "the Medic may target Trey's Burst -- its only spell with {X}");
  applyAction(s, 0, sacrifice[0]);
  for (let n = 0; n < 20 && !s.awaiting; n += 1) passPriority(s);
  eq(s.awaiting?.player, 2, "Trey, the spell's controller, is asked whether to pay {3} -- not Sam, not Maya");
  eq(awaitingChoice(s).options.map((o) => o.label), ["Pay {3}", "Don't pay"], "his three untapped Wastes can pay it");
  resolveAwaiting(s, [1]);
  eq(s.stack.length, 0, "he does not: Burst is countered, and the stack is empty");
  eq(s.players.map((p) => p.life), [40, 40, 40, 40], "and Sam is dealt nothing");
  ok(s.zones.graveyard[2].some((id) => s.objects[id].card === "Burst"), "Burst is in Trey's graveyard");
}

/* ---- battalion: the attack as a whole, Rob's, with the Medic among three or more ---- */
{
  const {state: s} = runScenario({name: "maya attacks", seats: 3, at: {turn: 2, phase: "MAIN1"},
    setup: [at(0, "battlefield", "Frontline Medic"), at(1, "battlefield", "Bear", "Bear", "Bear")]}, index.definition, FIX);
  for (let n = 0; n < 50 && s.awaiting?.kind !== "declare-attackers"; n += 1) { if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); }
  const options = awaitingChoice(s).options;
  resolveAwaiting(s, [...new Set(options.filter((o) => o.defenderId === 0).map((o) => o.cardId))].map((id) => options.find((o) => o.cardId === id && o.defenderId === 0).index));
  eq(s.combat.attacks.length, 3, "Maya attacks Rob with three Bears");
  eq((s.pendingTriggers ?? []).length + s.stack.filter((e) => e.kind === "trigger").length, 0, "Rob's Medic is not among them: battalion does not trigger");
}

console.log(`engine-spell-x-cost: ${checks} checks passed`);
