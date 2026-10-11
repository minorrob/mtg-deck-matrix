/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "COUNTER TARGET SPELL. IF A PERMANENT SPELL IS COUNTERED THIS WAY, EXILE IT INSTEAD OF PUTTING IT INTO ITS OWNER'S
 * GRAVEYARD. YOU MAY CAST THAT CARD WITHOUT PAYING ITS MANA COST FOR AS LONG AS IT REMAINS EXILED" (Thranduil's Decree;
 * CR 701.6a, 611.2b, 400.7, 601.2a).
 *
 * counterSpell's `permanentTo: "exile"` (script/effects/zones.mjs): a spell that would become a permanent as it resolved
 * (rules/stack.mjs, `permanent`) is exiled, any other goes to its owner's graveyard; `remember`, what it moved, as the cards
 * they became. mayPlay's `zone: "exile"`: only a card in exile now is given the permission -- a countered instant, in its
 * owner's graveyard, never starts "for as long as it remains exiled" (CR 611.2b) -- and it lasts while it stays there, a
 * card that leaves being a new object (CR 400.7). The card scenarios play the Decree; this suite holds the edges: a copy,
 * a spell that can't be countered, a commander, the card leaving exile, the cast's cost, and the schema.
 */
import assert from "node:assert/strict";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {commandersGoingHome} from "../game/engine/script/effects/asking.mjs";
import {pushCopy} from "../game/engine/rules/stack.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {
  /* Seven mana nobody at the table but Maya can pay: a cast of it from exile is free or nothing. */
  Colossus: {types: ["Creature"], subtypes: ["Giant"], manaCost: "{7}", colors: [], power: 7, toughness: 7},
  Study: {types: ["Instant"], manaCost: "{C}", colors: [], spell: {id: "s", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]}},
  Unstoppable: {types: ["Creature"], manaCost: "{C}", colors: [], power: 1, toughness: 1,
    abilities: [{id: "a0", kind: "static", text: "This spell can't be countered.", rule: "cant-be-countered", affects: {self: true}}]},
};
/* Maya casts the card named, and the stack is left with it on top, Rob holding priority. */
function cast(name, more = {}) {
  const {state} = runScenario({name: `cast ${name}`, at: {turn: 2, phase: "MAIN1"}, ...more,
    setup: [at(1, "battlefield", ...Array(7).fill("Wastes")), at(1, more.commander ? "command" : "hand", name), at(0, "battlefield", "Wastes", "Wastes")],
    steps: [...Array(name === "Colossus" ? 7 : 1).fill({tap: "Wastes", seat: 1}), {cast: name, seat: 1}, {pass: 1}]}, index.definition, FIX);
  return state;
}
const DECREE = {effect: "counterSpell", permanentTo: "exile", remember: true};
const counter = (s, spells) => { const context = {controller: 0, source: null}; runEffect(s, {...DECREE, spells}, context); return context; };
const top = (s) => s.stack[s.stack.length - 1].objectId;
const where = (s, card) => Object.values(s.objects).filter((o) => o.card === card).map((o) => o.zone).sort();
const permissions = (s) => (s.effects ?? []).filter((e) => e.rule === "may-play");
const permit = (s, ids) => runEffect(s, {effect: "mayPlay", targets: ids, zone: "exile", free: true, spellsOnly: true, until: "ever"}, {controller: 0, source: null});
const castOffers = (s, seat, card) => legalActions(s, seat).filter((a) => a.kind === "cast" && a.label === card);

{
  /* A permanent spell, exiled and remembered; an instant, to its graveyard -- remembered there, and given nothing. */
  const s = cast("Colossus");
  const context = counter(s, [top(s)]);
  eq(where(s, "Colossus"), ["exile"], "a permanent spell countered this way is exiled");
  eq(context.remembered.map((id) => [s.objects[id].card, s.objects[id].zone]), [["Colossus", "exile"]], "and remembered as the card it became (CR 400.7)");
  const t = cast("Study");
  const told = counter(t, [top(t)]);
  eq(where(t, "Study"), ["graveyard"], "an instant countered this way goes to its owner's graveyard");
  permit(t, told.remembered);
  eq(permissions(t), [], "and is given no permission: it is not exiled, so \"for as long as it remains exiled\" never starts (CR 611.2b)");
  const u = cast("Study");
  runEffect(u, {effect: "counterSpell", spells: [top(u)], to: "exile"}, {controller: 0, source: null});
  eq(where(u, "Study"), ["exile"], "`to: \"exile\"` still exiles any spell (Force of Negation)");
}
{
  /* A copy of a permanent spell, countered, ceases to exist (CR 707.10a): nothing exiled, nothing remembered. */
  const s = cast("Colossus");
  const copy = pushCopy(s, s.stack[s.stack.length - 1], {controller: 1});
  const context = counter(s, [copy.objectId]);
  eq([where(s, "Colossus"), context.remembered], [["stack"], []], "the copy is gone, the original still on the stack, and nothing remembered");
  /* A spell that can't be countered is not countered this way: it stays, and nothing is remembered. */
  const t = cast("Unstoppable");
  const told = counter(t, [top(t)]);
  eq([where(t, "Unstoppable"), told.remembered], [["stack"], []], "a spell that can't be countered stays on the stack, and nothing is remembered");
}
{
  /* The permission: Rob's alone, cast without paying its mana cost, for as long as it remains exiled -- turns later too. */
  const s = cast("Colossus");
  permit(s, counter(s, [top(s)]).remembered);
  eq(permissions(s).map((p) => [p.player, p.free, p.spellsOnly, p.until]), [[0, true, true, "ever"]], "a permission for Rob, free, to cast, for as long as it stays exiled");
  const {state: later} = runScenario({name: "Rob's turn", at: {turn: 2, phase: "MAIN1"},
    setup: [at(1, "battlefield", ...Array(7).fill("Wastes")), at(1, "hand", "Colossus"), at(0, "battlefield", "Wastes", "Wastes")],
    steps: [...Array(7).fill({tap: "Wastes", seat: 1}), {cast: "Colossus", seat: 1}, {pass: 1}]}, index.definition, FIX);
  permit(later, counter(later, [top(later)]).remembered);
  /* On to Rob's turn 5, two turns on: still there, and offered. */
  for (let n = 0; n < 4000 && !(later.turn === 5 && later.phase === "MAIN1" && later.priorityPlayer === 0 && !later.stack.length); n += 1) {
    if (later.awaiting) { resolveAwaiting(later, awaitingChoice(later).options.slice(0, awaitingChoice(later).min ?? 0).map((o) => o.index)); continue; }
    if (later.priorityPlayer === null) advance(later); else if (passPriority(later).outcome === "step-ends") advance(later);
  }
  eq([later.turn, later.phase], [5, "MAIN1"], "the game reached Rob's turn 5");
  const offers = castOffers(later, 0, "Colossus");
  eq(offers.map((a) => a.free === true), [true], "Rob is offered the Colossus, free, three turns after it was exiled -- with two Wastes, it is free or nothing");
  eq(castOffers(later, 1, "Colossus").length, 0, "Maya, its owner, is not offered it");
  applyAction(later, 0, offers[0]);
  ok(later.zones.battlefield.every((id) => !later.objects[id].tapped), "cast without paying its mana cost: nothing tapped");
}
{
  /* It leaves exile and comes back: a new object, no permission (CR 400.7). */
  const s = cast("Colossus");
  permit(s, counter(s, [top(s)]).remembered);
  const exiled = Object.values(s.objects).find((o) => o.card === "Colossus").id;
  const back = moveOne(s, moveOne(s, exiled, "graveyard", []), "exile", []);
  eq([s.objects[back].zone, permissions(s).some((p) => p.affects.ids.includes(back))], ["exile", false], "the card that came back to exile is a new object, with no permission");
}
{
  /* A commander countered this way is exiled; its owner may then put it into the command zone (CR 903.9a), and the
     permission is left behind. */
  const s = cast("Colossus", {commander: true});
  /* Cast through a permission that sends it to the bottom of its library instead of a graveyard: its owner would be asked
     about the command zone as it went to the library (CR 903.9b) -- but exiled instead, it goes to no library. */
  s.stack[s.stack.length - 1].graveyardToLibraryBottom = true;
  eq(commandersGoingHome(s, {...DECREE, effect: "counterSpell", spells: [top(s)]}), [], "a commander exiled this way is no commander going to a library");
  eq(commandersGoingHome(s, {effect: "counterSpell", spells: [top(s)]}).length, 1, "countered plainly, it would be");
  const context = counter(s, [top(s)]);
  eq(where(s, "Colossus"), ["exile"], "Maya's commander, a permanent spell, is exiled -- not asked about her library");
  permit(s, context.remembered);
  eq(permissions(s).length, 1, "and Rob is given the permission");
  const home = moveOne(s, context.remembered[0], "command", []);
  eq([s.objects[home].zone, permissions(s).some((p) => p.affects.ids.includes(home))], ["command", false], "put into the command zone, it is a new object the permission does not name");
}
{
  /* The schema: a permanent spell's place is exile, and a permission's zone is exile. */
  const script = (effects) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Instant"], manaCost: "{U}", colors: ["U"]},
    oracleText: "Counter target spell.", abilities: [{kind: "spell", text: "Counter target spell.", targets: [{what: "spell"}], effects}]});
  ok(validateScript(script([{effect: "counterSpell", spells: {target: 0}, permanentTo: "exile"}])).valid, "permanentTo exile is a definition the schema takes");
  ok(validateScript(script([{effect: "counterSpell", spells: {target: 0}, permanentTo: "top"}])).errors.some((e) => /permanentTo/.test(e.path)), "any other place is refused");
  ok(validateScript(script([{effect: "mayPlay", targets: "remembered", zone: "graveyard"}])).errors.some((e) => /zone/.test(e.path)), "a permission's zone other than exile is refused");
}

console.log(`engine-counter-exile-cast: ${checks} checks passed -- a permanent spell countered and exiled, remembered as the card it became; an instant to its graveyard and given nothing; a copy and an uncounterable spell remembered as nothing; the free cast, Rob's alone, turns later; a card that leaves exile, or a commander that goes home, left without it; the schema`);
