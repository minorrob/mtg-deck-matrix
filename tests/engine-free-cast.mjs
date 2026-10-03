/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 25 (THE CATALOG'S ORDER): CAST WITHOUT PAYING THE MANA COST (CR 118.9).
 *
 * "You may cast spells from your hand without paying their mana costs": an alternative cost of nothing, so X is 0 (CR
 * 107.3b) and additional costs -- the commander tax among them -- are still paid. When it may be used every time it is
 * the one offer; when it is "once each turn" it stands beside the paid cast, and the player chooses which spell spends
 * it, the board saying which offer is which. "If you cast a creature spell this way, it gains haste until end of turn."
 */
import assert from "node:assert/strict";
import {createState, addObject, commanderKeyOf} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const creature = (name, cost = "{1}", power = 2, extra = {}) => ({card: name, types: ["Creature"], manaCost: cost, power, toughness: power, ...extra});
const pod = {matchId: "m", seed: "free-cast", players: [{name: "Rob"}, {name: "Maya"}]};
function table(library = []) {
  const s = createState(pod);
  for (const c of library) addObject(s, {...c, owner: 0, controller: 0}, "library", 0);
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
const casts = (s, name) => legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === name);
const named = (s, name, zone = "battlefield") => Object.keys(s.objects).map(Number).filter((id) => s.objects[id].card === name && s.objects[id].zone === zone);

{
  const s = table();
  on(s, card("Omniscience"), 0); on(s, creature("Wurm", "{6}{G}", 7), 0, "hand");
  on(s, {card: "Blaze", types: ["Sorcery"], manaCost: "{X}{R}", spell: {id: "s", text: "x", targets: [], effects: [{effect: "dealDamage", amount: "X", who: "opponent"}]}}, 0, "hand");
  main(s);
  eq([casts(s, "Wurm").length, casts(s, "Wurm")[0]?.free], [1, true], "Omniscience: the seven-mana Wurm is castable from hand with nothing in the pool -- one offer, free");
  eq(casts(s, "Blaze").map((a) => a.x ?? 0), [0], "an X spell cast without paying its mana cost has X = 0 (CR 107.3b): one offer, X 0");
}
{
  /* "From your hand": Omniscience does not reach the command zone. */
  const s = table();
  on(s, card("Omniscience"), 0);
  const wurm = on(s, creature("Wurm", "{6}{G}", 7, {supertypes: ["Legendary"]}), 0, "command");
  s.objects[wurm].commander = true;
  main(s);
  eq(casts(s, "Wurm").length, 0, "Omniscience and a seven-mana commander in the command zone: not from the hand, so not free -- and nothing floating, so not castable");
}
{
  /* The commander tax is an additional cost, still paid (CR 118.9d, 903.8). */
  const s = table();
  on(s, card("Dracogenesis"), 0);
  const whelp = on(s, creature("Whelp", "{4}{R}", 4, {subtypes: ["Dragon"], supertypes: ["Legendary"]}), 0, "command");
  s.objects[whelp].commander = true;
  on(s, WASTES, 0); on(s, WASTES, 0);
  main(s);
  s.players[0].commanderCasts = {[commanderKeyOf(s.objects[whelp])]: 1};   /* cast once before: a tax of {2} */
  const before = casts(s, "Whelp");
  for (const a of legalActions(s, 0).filter((x) => x.kind === "activate-mana")) applyAction(s, 0, a);
  const after = casts(s, "Whelp");
  eq([before.length, after.length, after[0]?.free, after[0]?.tax], [0, 1, true, 2],
    "Dracogenesis and a Dragon commander taxed {2}: with nothing floating it can't be cast; with two mana it is, free of its {4}{R} but not of the tax");
}
{
  const s = table();
  on(s, card("Darksteel Monolith"), 0);
  for (const i of [1, 2]) on(s, {card: `Rock ${i}`, types: ["Artifact"], manaCost: "{3}"}, 0, "hand");
  for (let i = 0; i < 3; i += 1) on(s, WASTES, 0);
  main(s);
  for (const a of legalActions(s, 0).filter((x) => x.kind === "activate-mana")) applyAction(s, 0, a);
  const offered = casts(s, "Rock 1");
  eq(offered.map((a) => Boolean(a.free)).sort(), [false, true], "Darksteel Monolith with three mana floating: Rock is offered paid and free -- the player chooses which spends the once-each-turn");
  eq(offerDetails(s, 0, offered).filter(Boolean), ["without paying its mana cost"], "and the board says which is the free one");
  applyAction(s, 0, offered.find((a) => a.free));
  run(s, settled);
  eq([s.players[0].manaPool.C, casts(s, "Rock 2").map((a) => Boolean(a.free))], [3, [false]], "cast free, the pool untouched; the second Rock now costs {3}: once each turn");
}
{
  const s = table();
  main(s);
  on(s, card("As Foretold"), 0);
  on(s, creature("Bear", "{1}"), 0, "hand"); on(s, creature("Imp", "{2}"), 0, "hand");
  eq([casts(s, "Bear").length, casts(s, "Imp").length], [0, 0], "As Foretold with no time counters: nothing above mana value 0 is free");
  run(s, (x) => x.turn === 3 && x.phase === "MAIN1" && settled(x));
  eq([casts(s, "Bear").map((a) => a.free), casts(s, "Imp").length], [[true], 0], "one time counter after Rob's upkeep: the mana value 1 Bear is free, the 2 is not");
}
{
  const s = table([creature("Ogre", "{4}", 4)]);
  on(s, card("Thundermane Dragon"), 0);
  for (let i = 0; i < 4; i += 1) on(s, WASTES, 0);
  main(s);
  for (const a of legalActions(s, 0).filter((x) => x.kind === "activate-mana")) applyAction(s, 0, a);
  applyAction(s, 0, casts(s, "Ogre")[0]);
  run(s, settled);
  const [ogre] = named(s, "Ogre");
  eq(keywordsOf(s, ogre).includes("Haste"), true, "Thundermane Dragon: the 4-power Ogre cast from the top of the library gains haste");
  run(s, (x) => x.turn === 2 && x.phase === "MAIN1");
  eq(keywordsOf(s, ogre).includes("Haste"), false, "until end of turn only");
}
{
  /* Batch 18's return cost, said as what it is on the board: "returning", not "sacrificing". */
  const s = table();
  on(s, card("Quirion Ranger"), 0); on(s, {card: "Forest", types: ["Land"], supertypes: ["Basic"], subtypes: ["Forest"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {G: 1}}]}, 0);
  main(s);
  const offered = legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Quirion Ranger");
  eq(offerDetails(s, 0, offered).map((d) => d.split(" · ").find((p) => /Forest/.test(p))), ["returning Forest"], "Quirion Ranger's cost reads \"returning Forest\"");
}

console.log(`engine-free-cast: ${checks} checks passed — without paying the mana cost: one free offer, X 0, the tax still paid; "once each turn" beside the paid cast, said on the board; a counted cap; haste for a creature cast from the top; the return cost said as returning.`);
