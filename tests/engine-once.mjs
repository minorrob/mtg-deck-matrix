/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 18 (THE CATALOG'S ORDER): ONLY ONCE EACH TURN.
 *
 * "Activate only once each turn" (CR 602.5b) and "this ability triggers only once each turn" are counted on the object:
 * the limit stays with it when its controller changes, a new object starts afresh, and the next turn resets it.
 * "Whenever ONE OR MORE other creatures die" triggers once for everything that happened at once (CR 603.2c), about all
 * of them -- "for each of them, create a token that's a copy of it". The costs: return a permanent you control to its
 * owner's hand, put a counter on the source, remove counters from it -- a mana ability's too. Any "+X/+Y" counter
 * changes power and toughness (CR 122.1a). "If it isn't that player's turn" asks about the drawer. "For each of that
 * spell's colors" counts them. And a Pest's "when this token dies, you gain 1 life".
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const land = (name, color, subtypes = []) => ({card: name, types: ["Land"], supertypes: ["Basic"], subtypes, abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {[color]: 1}}]});
const WASTES = land("Wastes", "C"), FOREST = land("Forest", "G", ["Forest"]);
const creature = (name, power = 2, extra = {}) => ({card: name, types: ["Creature"], manaCost: "{1}", power, toughness: power, ...extra});
const pod = {matchId: "m", seed: "once", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
function run(s, until) {
  for (let n = 0; n < 600 && !until(s); n += 1) {
    if (s.awaiting) {
      const kind = s.awaiting.kind;
      if (kind === "declare-attackers" || kind === "declare-blockers") resolveAwaiting(s, []);
      else if (kind === "order-triggers") resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index));
      else break;
      continue;
    }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
}
const settled = (s) => s.stack.length === 0 && !(s.pendingTriggers ?? []).length && s.priorityPlayer !== null && !s.awaiting;
const ctx = (controller = 0, source = null) => ({controller, source});
const named = (s, name, zone = "battlefield") => Object.keys(s.objects).map(Number).filter((id) => s.objects[id].card === name && s.objects[id].zone === zone);
const offers = (s, seat, kind, label) => legalActions(s, seat).filter((a) => a.kind === kind && a.label === label);
const nextTurnOf = (s, seat) => run(s, (x) => x.turn > 1 && x.activePlayer === seat && x.phase === "MAIN1" && x.priorityPlayer === seat);

/* ---- an activated ability, once each turn (CR 602.5b) ---- */
{
  const s = table();
  const ranger = on(s, card("Quirion Ranger"), 0);
  on(s, FOREST, 0); on(s, FOREST, 0); on(s, FOREST, 1);
  main(s);
  eq(offers(s, 0, "activate", "Quirion Ranger").length, 2, "return a Forest: one offer for each Forest Rob controls (the cost is chosen as it is activated)");
  applyAction(s, 0, offers(s, 0, "activate", "Quirion Ranger")[0]);
  run(s, settled);
  eq([named(s, "Forest", "hand").length, named(s, "Forest").filter((id) => s.objects[id].controller === 0).length, offers(s, 0, "activate", "Quirion Ranger").length], [1, 1, 0],
    "a Forest went back to Rob's hand; with another Forest still there, the ability is not offered again this turn");
  /* Maya takes it: the limit stays with the object (CR 602.5b). */
  s.objects[ranger].controller = 1;
  passPriority(s);
  ok(s.priorityPlayer === 1 && !legalActions(s, 1).some((a) => a.kind === "activate" && a.label === "Quirion Ranger"),
    "taken by Maya the same turn -- and she has a Forest to return -- it is still used up: the count is on the object");
  s.objects[ranger].controller = 0;
  nextTurnOf(s, 0);
  eq(offers(s, 0, "activate", "Quirion Ranger").length, 1, "on Rob's next turn it may be activated again");
}
{
  /* A new object starts afresh (CR 400.7). */
  const s = table();
  on(s, card("Wirewood Symbiote"), 0);
  on(s, creature("Elf", 1, {subtypes: ["Elf"]}), 0); on(s, creature("Elf", 1, {subtypes: ["Elf"]}), 0);
  main(s);
  applyAction(s, 0, offers(s, 0, "activate", "Wirewood Symbiote")[0]);
  run(s, settled);
  eq(offers(s, 0, "activate", "Wirewood Symbiote").length, 0, "Wirewood Symbiote: used once");
  const [symbiote] = named(s, "Wirewood Symbiote");
  beginResolution(s, [{effect: "moveZone", targets: [symbiote], to: "hand"}, ], ctx());
  beginResolution(s, [{effect: "moveZone", targets: named(s, "Wirewood Symbiote", "hand"), to: "battlefield"}], ctx());
  ok(offers(s, 0, "activate", "Wirewood Symbiote").length > 0, "bounced and put back, it is a new object, and may be activated again this turn");
}

/* ---- a mana ability, once each turn; a counter as its cost; a "+X/+Y" counter ---- */
{
  const s = table();
  const wall = on(s, card("Wall of Roots"), 0);
  main(s);
  applyAction(s, 0, offers(s, 0, "activate-mana", "Wall of Roots")[0]);
  eq([s.players[0].manaPool.G ?? 0, characteristicsOf(s, wall).toughness, s.objects[wall].tapped, offers(s, 0, "activate-mana", "Wall of Roots").length], [1, 4, false, 0],
    "Wall of Roots: {G}, paid for with a -0/-1 counter (now 0/4, never tapped), and once this turn");
  nextTurnOf(s, 0);
  applyAction(s, 0, offers(s, 0, "activate-mana", "Wall of Roots")[0]);
  eq(characteristicsOf(s, wall).toughness, 3, "next turn again: a second -0/-1 counter, 0/3");
  s.objects[wall].counters["+1/+0"] = 2;
  eq([characteristicsOf(s, wall).power, characteristicsOf(s, wall).toughness], [2, 3], "and a +1/+0 counter is power only (CR 122.1a)");
}
{
  const s = table();
  const ramos = on(s, card("Ramos, Dragon Engine"), 0);
  main(s);
  s.objects[ramos].counters["+1/+1"] = 4;
  eq(offers(s, 0, "activate-mana", "Ramos, Dragon Engine").length, 0, "four +1/+1 counters: five can't be removed, so no mana");
  s.objects[ramos].counters["+1/+1"] = 6;
  applyAction(s, 0, offers(s, 0, "activate-mana", "Ramos, Dragon Engine")[0]);
  eq([s.objects[ramos].counters["+1/+1"], s.players[0].manaPool, offers(s, 0, "activate-mana", "Ramos, Dragon Engine").length],
    [1, {W: 2, U: 2, B: 2, R: 2, G: 2, C: 0}, 0], "six: five removed for {W}{W}{U}{U}{B}{B}{R}{R}{G}{G}, one left, and not again this turn");
}

/* ---- for each of that spell's colors ---- */
{
  const s = table();
  const ramos = on(s, card("Ramos, Dragon Engine"), 0);
  on(s, {card: "Charm", types: ["Instant"], manaCost: "{0}", colors: ["W", "U", "B"], spell: {id: "s", text: "x", targets: [], effects: [{effect: "gainLife", amount: 1}]}}, 0, "hand");
  on(s, {card: "Trinket", types: ["Artifact"], manaCost: "{0}"}, 0, "hand");
  main(s);
  applyAction(s, 0, offers(s, 0, "cast", "Trinket")[0]);
  run(s, settled);
  applyAction(s, 0, offers(s, 0, "cast", "Charm")[0]);
  run(s, settled);
  eq(s.objects[ramos].counters["+1/+1"] ?? 0, 3, "a colorless artifact: no counters; a white, blue and black spell: three");
}

/* ---- a triggered ability, once each turn; one or more at once ---- */
{
  const s = table();
  const opp = on(s, card("Morbid Opportunist"), 0);
  const a = on(s, creature("Bear"), 1), b = on(s, creature("Cub"), 1), c = on(s, creature("Ogre", 3), 1);
  main(s);
  collectTriggers(s, beginResolution(s, [{effect: "destroy", targets: [a, b]}], ctx()).events);
  eq([s.pendingTriggers.length, (s.pendingTriggers[0]?.about?.cards ?? []).length], [1, 2], "two creatures die at once: Morbid Opportunist triggers once, about both");
  s.pendingTriggers = [];
  collectTriggers(s, beginResolution(s, [{effect: "destroy", targets: [c]}], ctx()).events);
  eq(s.pendingTriggers.length, 0, "a third dies later this turn: it has triggered once this turn already");
  nextTurnOf(s, 0);
  s.pendingTriggers = [];
  const d = on(s, creature("Elf", 1), 1);
  collectTriggers(s, beginResolution(s, [{effect: "destroy", targets: [d]}], ctx()).events);
  eq(s.pendingTriggers.length, 1, "on a later turn it triggers again");
  s.pendingTriggers = [];
  /* Dying with another creature, it sees it die (CR 603.10a): once. */
  const e = on(s, creature("Rat", 1), 1), f = on(s, creature("Bat", 1), 1);
  s.objects[opp].used = undefined;
  collectTriggers(s, beginResolution(s, [{effect: "destroy", targets: [opp, e, f]}], ctx()).events);
  eq([s.pendingTriggers.length, s.pendingTriggers[0]?.about?.cards?.length], [1, 2], "destroyed together with two others: it sees them both die, and triggers once");
}
{
  /* Kambal: for each of them, a tapped copy; and your tokens entering drain. */
  const s = table();
  on(s, card("Kambal, Profiteering Mayor"), 0);
  main(s);
  const made = beginResolution(s, [{effect: "createToken", count: 3, token: {name: "Spirit", types: ["Creature"], colors: ["W"], power: 1, toughness: 1}}], ctx(1));
  collectTriggers(s, made.events);
  eq(s.pendingTriggers.map((t) => t.about?.cards?.length), [3], "three of Maya's tokens enter: Kambal triggers once, about all three");
  run(s, settled);
  eq([named(s, "Spirit").filter((id) => s.objects[id].controller === 0).length, named(s, "Spirit").filter((id) => s.objects[id].controller === 0 && s.objects[id].tapped).length, s.players[1].life, s.players[0].life],
    [3, 3, 39, 41], "a tapped copy of each for Rob -- three -- and his tokens entering drain Maya once: 39, Rob 41");
}

/* ---- "if it isn't that player's turn" ---- */
{
  const s = table();
  on(s, card("Tataru Taru"), 0);
  main(s);
  const draw = (seat) => collectTriggers(s, beginResolution(s, [{effect: "draw", count: 1}], ctx(seat)).events);
  draw(1);
  eq(s.pendingTriggers.length, 1, "Maya draws on Rob's turn: a Treasure is coming");
  s.pendingTriggers = [];
  draw(1);
  eq(s.pendingTriggers.length, 0, "and a second draw this turn makes none: once each turn");
  run(s, (x) => x.turn === 2 && x.phase === "MAIN1");
  eq(named(s, "Treasure").length, 0, "on her own turn, her draw step's draw is not one: no Treasure");
  s.pendingTriggers = [];
  draw(1);
  eq(s.pendingTriggers.length, 0, "nor any other draw of hers that turn");
}

/* ---- a Pest, and each upkeep ---- */
{
  const s = table();
  main(s);
  on(s, card("Beledros Witherbloom"), 0);
  run(s, (x) => x.turn === 2 && x.phase === "MAIN1");
  const pests = named(s, "Pest");
  eq([pests.length, s.objects[pests[0]].controller, s.objects[pests[0]].types, characteristicsOf(s, pests[0]).colors], [1, 0, ["Creature"], ["B", "G"]],
    "at the beginning of Maya's upkeep -- each upkeep -- Rob gets a 1/1 black and green Pest");
  const life = s.players[0].life;
  collectTriggers(s, beginResolution(s, [{effect: "destroy", targets: pests}], ctx()).events);
  run(s, settled);
  eq(s.players[0].life, life + 1, "and when it dies, Rob gains 1 life");
}

console.log(`engine-once: ${checks} checks passed — "activate only once each turn" and "triggers only once each turn" counted on the object, "one or more" once for all at once, costs that return a permanent or move counters, "+X/+Y" counters, "if it isn't that player's turn", a spell's colors counted, and a Pest.`);
