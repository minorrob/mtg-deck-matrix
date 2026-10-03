/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ESCAPE (the plan's X5, D5 Shadrix Aristocrats: Woe Strider; X5e).
 *
 * "Escape [cost]" means "you may cast this card from your graveyard by paying [cost] rather than paying its mana cost"
 * (CR 702.138a): an alternative cost (CR 118.9), at the speed of the card's type. Its cost is mana and "exile N other cards
 * from your graveyard", so the cast is offered once, not once per set of cards (a graveyard of twenty has 3,876 ways to
 * pick four). Once the cast is taken, its caster picks which cards, as a pick-several, before anything moves or is paid
 * (rules/turn.mjs, "choose-cost"; CR 601.2h). A spell or permanent cast that way "escaped" (CR 702.138b). "Escapes with
 * two +1/+1 counters" means "if it escaped, it enters with them" (702.138c), a replacement on its own entering, and Uro's
 * "sacrifice it unless it escaped" reads the same mark. Unlike flashback, an escaped card is not exiled afterward: it goes
 * where it would, and may escape again. Underworld Breach gives escape to each nonland card in its controller's graveyard,
 * its cost the card's mana cost and three other cards.
 *
 * The card scenarios play the cards (Woe Strider, Uro, Underworld Breach). This suite holds the edges: who may, how many,
 * the question, what escaped and what did not, two escapes on one card, the house pilot, the schema, and the catalog.
 */
import assert from "node:assert/strict";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction, escapeWays, nothingToDo} from "../game/engine/rules/actions.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {conditionProblems, conditionHolds} from "../game/engine/script/condition.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {parseManaCost, manaValue} from "../game/engine/rules/mana.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const later = (seat, zone, ...cards) => ({seat, zone, cards, sick: true});
const FIX = {
  Raise: {types: ["Sorcery"], manaCost: "{B}", colors: ["B"], spell: {id: "s0", text: "Return target creature card from your graveyard to the battlefield.",
    targets: [{what: "card", zone: "graveyard", types: ["Creature"], controller: "you"}], effects: [{effect: "moveZone", targets: {target: 0}, to: "battlefield"}]}},
  Doom: {types: ["Instant"], manaCost: "{B}", colors: ["B"], spell: {id: "s0", text: "Destroy target creature.",
    targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "destroy", targets: {target: 0}}]}},
  Visions: {types: ["Sorcery"], manaCost: "", colors: ["U"], spell: {id: "s0", text: "Draw two cards.", targets: [], effects: [{effect: "draw", count: 2}]}},
};
const play = (name, setup, steps, more = {}) => runScenario({name, setup, steps, ...more}, index.definition, FIX).state;
const named = (s, card, zone) => Object.values(s.objects).filter((o) => o.card === card && o.zone === zone);
const casts = (s, seat, card) => legalActions(s, seat).filter((a) => a.kind === "cast" && a.label === card);
const OTHERS = ["Plains", "Island", "Forest", "Mountain"];
const LANDS = ["Swamp", "Swamp", "Wastes", "Wastes", "Wastes"];
const tapAll = (names) => names.map((n) => ({tap: n}));

/* ---- who may, and how many ---- */
{
  const s = play("offers", [at(0, "battlefield", ...LANDS), at(0, "graveyard", "Woe Strider", ...OTHERS, "Swamp"), at(1, "graveyard", "Woe Strider", ...OTHERS)], tapAll(LANDS));
  const offers = casts(s, 0, "Woe Strider");
  eq(offers.map((a) => [a.from, a.escape, s.objects[a.objectId].owner]), [["graveyard", "own", 0]],
    "Rob's Woe Strider with five other cards beside it: one offer, with escape, however many sets of four there are; Maya's is not his to cast");
  eq(offerDetails(s, 0, offers), ["escape for {3}{B}{B}, exiling four other cards"], "the table says how it is cast, and what it will take");
  const hers = named(s, "Woe Strider", "graveyard").find((o) => o.owner === 1).id;
  eq([escapeWays(s, 1, hers).map((w) => [w.kind, w.mana, w.exile]), escapeWays(s, 0, hers)], [[["own", "{3}{B}{B}", 4]], []],
    "Maya's may escape for her, from her graveyard, and not for Rob");
}
{
  const s = play("three others", [at(0, "battlefield", ...LANDS), at(0, "graveyard", "Woe Strider", "Plains", "Island", "Forest")], tapAll(LANDS));
  eq([casts(s, 0, "Woe Strider").length, escapeWays(s, 0, named(s, "Woe Strider", "graveyard")[0].id).length], [0, 0], "three other cards in the graveyard, not four: no escape");
}
{
  const s = play("its mana cost", [at(0, "battlefield", "Swamp", "Wastes", "Wastes"), at(0, "graveyard", "Woe Strider", ...OTHERS)], tapAll(["Swamp", "Wastes", "Wastes"]));
  eq(casts(s, 0, "Woe Strider").length, 0, "{2}{B}, its mana cost, pays nothing here: escape costs {3}{B}{B}");
}
{
  /* At the speed of its type (CR 117.1a): a creature in its caster's main phase, with the stack empty. The Breach is put there
     on Maya's turn: at the end step before it, it would have been sacrificed. */
  const s = play("Maya's turn", [later(0, "battlefield", ...LANDS, "Mountain", "Underworld Breach"), at(0, "graveyard", "Woe Strider", "Lightning Bolt", ...OTHERS)],
    [{pass: 1}, ...tapAll([...LANDS, "Mountain"])], {at: {turn: 2, phase: "MAIN1"}});
  eq([s.priorityPlayer, casts(s, 0, "Woe Strider").length, casts(s, 0, "Lightning Bolt").some((a) => a.escape === "given")], [0, 0, true],
    "on Maya's turn, holding priority: Woe Strider, a creature, cannot escape; Lightning Bolt, an instant given escape by the Breach, can");
}

/* ---- the question ---- */
{
  const s = play("the question", [at(0, "battlefield", ...LANDS), at(0, "graveyard", "Woe Strider", ...OTHERS, "Swamp")], tapAll(LANDS));
  const strider = named(s, "Woe Strider", "graveyard")[0].id;
  const pool = {...s.players[0].manaPool};
  applyAction(s, 0, casts(s, 0, "Woe Strider")[0]);
  const q = awaitingChoice(s);
  eq([q.id, q.mode, q.min, q.max, q.options.map((o) => o.label)], [`choose-cost:${strider}`, "many", 4, 4, [...OTHERS, "Swamp"]],
    "taken, the cast asks which four other cards to exile -- never Woe Strider itself");
  eq(q.title, "Woe Strider's escape: exile four other cards from your graveyard", "in the card's words");
  eq([s.objects[strider].zone, s.players[0].manaPool, s.stack.length, s.priorityPlayer], ["graveyard", pool, 0, null], "nothing has moved or been paid before the answer");
  assert.throws(() => resolveAwaiting(s, [0, 1, 2]), /Invalid selection/, "three cards are not four"); checks += 1;
  assert.throws(() => resolveAwaiting(s, [0, 0, 1, 2]), /Invalid selection/, "nor is one card chosen twice"); checks += 1;
  assert.throws(() => resolveAwaiting(s, [0, 1, 2, 3, 4]), /Invalid selection/, "nor are five"); checks += 1;
  resolveAwaiting(s, [0, 1, 2, 4]);
  eq([named(s, "Woe Strider", "stack").length, s.zones.exile.map((id) => s.objects[id].card).sort(), named(s, "Mountain", "graveyard").length, s.priorityPlayer],
    [1, ["Forest", "Island", "Plains", "Swamp"], 1, 0], "answered: it is cast, the four chosen are exiled and the fifth is left, and Rob holds priority (CR 117.3c)");
  ok(Object.values(s.players[0].manaPool).every((n) => n === 0), "and {3}{B}{B} is paid");
  resolveTop(s);
  const entered = named(s, "Woe Strider", "battlefield")[0];
  eq([entered.counters["+1/+1"], entered.escaped], [2, true], "it escaped (CR 702.138b): it enters with two +1/+1 counters (702.138c), and is marked so");
  eq([conditionHolds(s, {escaped: true}, {controller: 0, source: entered.id}), conditionHolds(s, {escaped: false}, {controller: 0, source: entered.id})], [true, false],
    "and a condition about it reads the mark: it escaped");
}

{
  /* An action that names its cards itself -- a pilot's, across a network -- is checked before anything moves. */
  const s = play("named cards", [at(0, "battlefield", ...LANDS), at(0, "graveyard", "Woe Strider", ...OTHERS, "Swamp"), at(1, "graveyard", "Plains")], tapAll(LANDS));
  const offer = casts(s, 0, "Woe Strider")[0];
  const mine = OTHERS.map((name) => named(s, name, "graveyard").find((o) => o.owner === 0).id);
  const hers = named(s, "Plains", "graveyard").find((o) => o.owner === 1).id;
  const fifth = named(s, "Swamp", "graveyard")[0].id;
  for (const [list, why] of [[mine.slice(0, 3), "three cards"], [[...mine, fifth], "five cards"], [[...mine.slice(0, 3), mine[0]], "one card twice"], [[...mine.slice(0, 3), offer.objectId], "Woe Strider itself"],
    [[...mine.slice(0, 3), hers], "a card in Maya's graveyard"]]) {
    assert.throws(() => applyAction(s, 0, {...offer, escapeExile: list}), /other cards in that graveyard/, `refused: ${why}`); checks += 1;
  }
  eq([s.stack.length, named(s, "Woe Strider", "graveyard").length, s.zones.exile.length], [0, 1, 0], "and nothing moved");
  assert.throws(() => applyAction(s, 0, {...offer, escape: undefined}), /not a legal action/, "the same card from the graveyard without escape is not an action anyone was offered"); checks += 1;
}

/* ---- something to do ---- */
{
  /* The room passes for a player with nothing to do (rules/actions.mjs, nothingToDo): a card that could escape is something. */
  const s = play("something to do", [at(0, "battlefield", ...LANDS), at(0, "graveyard", "Woe Strider", ...OTHERS)], []);
  const t = play("nothing to do", [at(0, "battlefield", ...LANDS), at(0, "graveyard", "Woe Strider", "Plains", "Island", "Forest")], []);
  eq([nothingToDo(s, 0), nothingToDo(t, 0)], [false, true],
    "five untapped lands and a Woe Strider that could escape: something to do, so the room does not pass for Rob; with three other cards only, nothing");
}

/* ---- what did not escape ---- */
{
  const s = play("raised", [at(0, "battlefield", "Swamp"), at(0, "graveyard", "Woe Strider"), at(0, "hand", "Raise")],
    [{tap: "Swamp"}, {cast: "Raise", targets: [{card: "Woe Strider"}]}, {resolve: true}]);
  const strider = named(s, "Woe Strider", "battlefield")[0];
  eq([strider.counters?.["+1/+1"] ?? 0, strider.escaped ?? false, conditionHolds(s, {escaped: false}, {controller: 0, source: strider.id})], [0, false, true],
    "returned from the graveyard by an effect, it did not escape: no counters, and \"unless it escaped\" holds");
}
{
  /* Unlike flashback (CR 702.34a), escape exiles nothing afterward: destroyed, the escaped Woe Strider goes to its owner's graveyard. */
  const s = play("destroyed", [at(0, "battlefield", ...LANDS, "Swamp"), at(0, "graveyard", "Woe Strider", ...OTHERS), at(0, "hand", "Doom")],
    [...tapAll(LANDS), {cast: "Woe Strider", escape: "own"}, {choose: OTHERS}, {resolve: true}, {resolve: true},
      {tap: "Swamp"}, {cast: "Doom", targets: [{card: "Woe Strider"}]}, {resolve: true}]);
  eq([named(s, "Woe Strider", "graveyard").length, named(s, "Woe Strider", "exile").length], [1, 0], "destroyed after it escaped, it goes to the graveyard, not to exile");
}

/* ---- Underworld Breach: escape given ---- */
{
  const s = play("the breach", [at(0, "battlefield", "Underworld Breach", "Mountain"), at(0, "graveyard", "Lightning Bolt", "Woe Strider", ...OTHERS),
    at(1, "graveyard", "Lightning Bolt", ...OTHERS)], [{tap: "Mountain"}]);
  const bolts = casts(s, 0, "Lightning Bolt");
  eq([...new Set(bolts.map((a) => `${s.objects[a.objectId].owner}:${a.escape}`))], ["0:given"], "the Breach gives Rob's Bolt escape; Maya's Bolt, in her graveyard, has none");
  ok(offerDetails(s, 0, bolts).every((d) => d.includes("escape for {R}, exiling three other cards")), "its cost: the card's mana cost and three other cards");
  const strider = named(s, "Woe Strider", "graveyard")[0].id;
  eq(escapeWays(s, 0, strider).map((w) => [w.kind, w.mana, w.exile]), [["own", "{3}{B}{B}", 4], ["given", "{2}{B}", 3]],
    "Woe Strider has two escapes now -- its own, and the Breach's -- and either may be used");
  eq(escapeWays(s, 0, named(s, "Plains", "graveyard")[0].id), [], "a land card is not given escape");
}
{
  /* What the Breach gives is its permanent's: in a graveyard it has no escape of its own. And a card with no mana cost is
     given none it could pay (CR 118.6). */
  const s = play("the breach in a graveyard", [at(0, "graveyard", "Underworld Breach", "Lightning Bolt", ...OTHERS)], []);
  eq([escapeWays(s, 0, named(s, "Underworld Breach", "graveyard")[0].id), escapeWays(s, 0, named(s, "Lightning Bolt", "graveyard")[0].id)], [[], []],
    "Underworld Breach in a graveyard: neither it nor the Bolt beside it has escape");
  const t = play("no mana cost", [at(0, "battlefield", "Underworld Breach"), at(0, "graveyard", "Visions", ...OTHERS)], []);
  eq(escapeWays(t, 0, named(t, "Visions", "graveyard")[0].id), [], "a card with no mana cost: the Breach's escape would cost what cannot be paid, so there is none");
}
{
  const s = play("two escapes", [at(0, "battlefield", "Underworld Breach", "Swamp", "Swamp", "Swamp", "Swamp", "Swamp"), at(0, "graveyard", "Woe Strider", ...OTHERS)],
    tapAll(["Swamp", "Swamp", "Swamp", "Swamp", "Swamp"]));
  eq(casts(s, 0, "Woe Strider").map((a) => a.escape).sort(), ["given", "own"], "two offers, one for each way, paid from five {B} either way");
}

/* ---- the house pilot ---- */
{
  const s = play("the pilot", [at(0, "battlefield", ...LANDS), at(0, "graveyard", "Woe Strider", "Grave Titan", "Lightning Bolt", "Plains", "Island", "Counterspell")], tapAll(LANDS));
  /* What the room tells a pilot of a card (room.mjs, factsFrom): its mana value and types. */
  const facts = (name) => { const c = FIX[name] ?? index.definition(name); return c ? {manaValue: manaValue(parseManaCost(c.manaCost ?? "")), types: c.types ?? []} : null; };
  const pilot = housePilot({seat: 0, cards: facts});
  const pick = pilot.choose(projectFor(s, 0), legalActions(s, 0));
  eq([pick.kind, pick.label, pick.escape], ["cast", "Woe Strider", "own"], "the house pilot takes the escape");
  applyAction(s, 0, pick);
  const choice = awaitingChoice(s);
  const answer = pilot.answer(projectFor(s, 0), choice);
  eq(answer.indices.map((i) => choice.options[i].label).sort(), ["Counterspell", "Island", "Lightning Bolt", "Plains"], "and exiles its lands first, then the cheapest -- not Grave Titan");
}

/* ---- the schema, and the catalog ---- */
{
  const script = (cost, types = ["Creature"]) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types, manaCost: "{B}", power: 1, toughness: 1},
    oracleText: "Escape—{B}, Exile two other cards from your graveyard.", source: "hand", abilities: [{kind: "keyword", text: "Escape—{B}, Exile two other cards from your graveyard.", keyword: "escape", cost}]});
  eq(compileScript(script([{atom: "mana", cost: "{B}"}, {atom: "exileFromGraveyard", count: 2}])).problems, [], "an escape cost of mana and N other cards compiles");
  for (const bad of [[], [{atom: "mana", cost: "{B}"}], [{atom: "exileFromGraveyard", count: 2}], [{atom: "mana", cost: "{B}"}, {atom: "exileFromGraveyard", count: 0}],
    [{atom: "mana", cost: "{B}"}, {atom: "exileFromGraveyard", count: 2}, {atom: "discard", count: 1}]])
    ok(compileScript(script(bad)).problems.length > 0, `and refuses ${JSON.stringify(bad)}`);
  const given = (ability) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Enchantment"], manaCost: "{B}{R}"},
    oracleText: "Each nonland card in your graveyard has escape.", source: "hand", abilities: [{kind: "static", text: "Each nonland card in your graveyard has escape.", rule: "escape", ...ability}]});
  const AFFECTS = {what: "card", zone: "graveyard", controller: "you", nonTypes: ["Land"]};
  eq(compileScript(given({affects: AFFECTS, cost: [{atom: "exileFromGraveyard", count: 3}]})).problems, [], "escape given, its cost the cards to exile, compiles");
  ok(compileScript(given({affects: AFFECTS, cost: [{atom: "mana", cost: "{1}"}, {atom: "exileFromGraveyard", count: 3}]})).problems.length > 0, "and refuses mana of its own: each card's mana cost is its mana");
  ok(compileScript(given({cost: [{atom: "exileFromGraveyard", count: 3}]})).problems.length > 0, "and an escape given that does not say which cards have it");
  ok(compileScript(script([{atom: "mana", cost: "{B}"}, {atom: "exileFromGraveyard", count: 2}], ["Land"])).problems.length > 0, "and escape on a land, which is never cast");
  eq([conditionProblems({escaped: true}), conditionProblems({escaped: false})], [[], []], "a condition may ask whether its permanent escaped");
  ok(conditionProblems({escaped: "yes"}).length > 0, "true or false only");
}
eq([missingFor({keywords: ["Escape"]}), missingFor({keywords: ["etbCounter"]})], [[], []], "the catalog credits Escape, and a permanent that enters with counters (etbCounter)");
for (const name of ["Woe Strider", "Uro, Titan of Nature's Wrath", "Underworld Breach"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-escape: ${checks} checks passed -- escape offered once from its owner's graveyard at its type's speed, its other cards picked before anything moves; it escaped, so it enters with its counters; not exiled after; the Breach's escape beside a card's own; the pilot exiles lands first.`);
