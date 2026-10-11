/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* AMOUNTS COUNTED AS THE CARDS PRINT THEM (Train C, phase 2: the area w2b-amounts).
 *
 * An amount is counted as the rules say, when they say (CR 107.1, 107.3; on resolution CR 608.2h) -- script/amount.mjs and
 * its readers. What the cards' scenarios cannot reach: three and four players, the edges, the refusals, a checkpoint.
 *   - `half` and `per`: "half the cards in their hand ... round down each time" (Pox Plague), "+2/+0 for every seven cards
 *     in your graveyard" (Dark Matter Manipulator) -- the count divided, rounded down as printed (CR 107.1a).
 *   - `perPlayer` on a discard or a sacrifice: each player's own count, every player's counted before anyone is asked, the
 *     choices in turn order and the cards moved together (CR 101.4).
 *   - A counted selector on a target player's zone, `controller: {target: n}`: "the number of cards in target opponent's
 *     hand" (Borrowed Knowledge, Jeska's Will), bound to that player as it is counted (CR 608.2b, 608.2h).
 *   - A whole hand discarded and remembered, whose hand each card was: "the number of cards discarded this way" (Borrowed
 *     Knowledge), "each player discards all the cards in their hand, then ... that many" (Awaken the Erstwhile's form).
 *   - `rememberedCount` with a `filter`, of what the remembered are now: "for each creature card exiled this way" (Release
 *     to Memory), "one or more nonland cards ... that many" across every player's choice (Augusta, Order Returned) -- and a
 *     reflexive trigger's "that many" counted as it triggers (CR 603.12; script/bind.mjs, countThisWay).
 *   - Converge, `colorsSpent`: the colors of mana spent to cast it (CR 601.2h), as its trigger remembered it once it has gone
 *     (CR 608.2h) -- for the targets its trigger chooses and checks again (rules/trigger.mjs, rules/stack.mjs).
 *   - `planeswalkerTypesAmong` (CR 205.3j; keywords/planeswalker-types.mjs, generated) and "proliferate X times" (CR 701.34a),
 *     each proliferate one a replacement may double.
 *   - `commanderCasts: "you"`: every cast of your commanders from the command zone this game (CR 903.8), for a static.
 * Each construct's credit is checked.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {characteristicsOf, controllerOf} from "../game/engine/rules/layers.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {ASKING} from "../game/engine/script/effects/asking.mjs";
import {countThisWay} from "../game/engine/script/bind.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {PLANESWALKER_TYPES} from "../game/engine/keywords/planeswalker-types.mjs";
import {isPlaneswalkerType} from "../game/engine/keywords/types.mjs";
import {planeswalkerTypesFrom, planeswalkerModuleText} from "../game/tools/engine-creature-types.mjs";
import {FORGE_COUNTS, missingFor} from "../game/tools/engine-constructs.mjs";
import {createJournal} from "../game/engine/journal.mjs";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const rng = createRng("counted-amounts");
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Elk: {types: ["Creature"], subtypes: ["Elk"], manaCost: "{2}{G}", colors: ["G"], power: 3, toughness: 3},
  Rock: {types: ["Artifact"], manaCost: "{1}", colors: []},
  Glyph: {types: ["Enchantment"], manaCost: "{2}{W}", colors: ["W"]},
  Ogre: {types: ["Creature"], subtypes: ["Ogre"], manaCost: "{3}{R}", colors: ["R"], power: 4, toughness: 4},
  Captain: {types: ["Creature"], supertypes: ["Legendary"], subtypes: ["Human"], manaCost: "{R}", colors: ["R"], power: 1, toughness: 1},
  Wisp: {types: ["Creature"], subtypes: ["Spirit"], manaCost: "{W}", colors: ["W"], power: 1, toughness: 1},
  /* Vanguard of the Restless's static, alone: "Spirits you control get +1/+1 for each time you've cast your commander from the
     command zone this game", on an enchantment: the card itself, with its graveyard trigger, is defined. */
  Banner: {types: ["Enchantment"], manaCost: "{1}{W}", colors: ["W"], abilities: [{id: "b", kind: "static", text: "Spirits you control get +1/+1 for each time you've cast your commander from the command zone this game.",
    layer: 7, sublayer: "c", affects: {what: "permanent", subtypes: ["Spirit"], controller: "you"}, apply: {power: {commanderCasts: "you"}, toughness: {commanderCasts: "you"}}}]},
  /* "Creatures your opponents control get -3/-3": a 3/3 that enters dies before its trigger is put on the stack. */
  Wither: {types: ["Enchantment"], manaCost: "{2}{B}", colors: ["B"], abilities: [{id: "w", kind: "static", text: "Creatures your opponents control get -3/-3.",
    layer: 7, sublayer: "c", affects: {what: "permanent", types: ["Creature"], controller: "opponent"}, apply: {power: -3, toughness: -3}}]},
  /* "Each player discards their hand, then draws that many cards": Awaken the Erstwhile's discard, with a draw for its tokens. */
  Churn: {types: ["Sorcery"], manaCost: "{B}", colors: ["B"], spell: {id: "s0", text: "Each player discards their hand, then draws that many cards.", targets: [], effects: [
    {effect: "discard", who: "each", all: true, remember: true},
    {effect: "repeatFor", each: "player", effects: [{effect: "draw", who: "that player", count: {rememberedCount: true, controlledBy: "that player"}}]}]}},
  /* Crystalline Crawler's converge: "enters with a +1/+1 counter on it for each color of mana spent to cast it". */
  Crawler: {types: ["Artifact", "Creature"], subtypes: ["Construct"], manaCost: "{4}", colors: [], power: 1, toughness: 1, abilities: [{id: "c", kind: "replacement",
    text: "This creature enters with a +1/+1 counter on it for each color of mana spent to cast it.", watches: {event: "enters", who: "self"},
    change: {entersWithCounters: {counter: "+1/+1", count: {colorsSpent: "self"}}}}]},
  "Jace Walker": {types: ["Planeswalker"], supertypes: ["Legendary"], subtypes: ["Jace"], manaCost: "{2}{U}", colors: ["U"], loyalty: 3},
  "Nissa Walker": {types: ["Planeswalker"], supertypes: ["Legendary"], subtypes: ["Nissa"], manaCost: "{2}{G}", colors: ["G"], loyalty: 3},
  "Gideon Walker": {types: ["Planeswalker", "Creature"], supertypes: ["Legendary"], subtypes: ["Gideon", "Human", "Soldier"], manaCost: "{2}{W}", colors: ["W"], loyalty: 3, power: 2, toughness: 2},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, seats = 4, steps = []) => runScenario({name: "counted-amounts", seats, setup, steps}, index.definition, FIX).state;
const hand = (s, seat) => s.zones.hand[seat].map((id) => s.objects[id].card);
const controls = (s, seat) => s.zones.battlefield.filter((id) => controllerOf(s, id) === seat).map((id) => s.objects[id].card).sort();
const script = (name) => JSON.parse(readFileSync(new URL(`../game/engine/cards/${name[0]}/${name}.json`, import.meta.url), "utf8"));
const SWAMPS = ["Swamp", "Swamp", "Swamp", "Swamp", "Swamp"];
const castPox = [...SWAMPS.map((tap) => ({tap})), {cast: "Pox Plague"}, {resolve: true}];

/* ---------------------------------------------------------------------------------------------------------------------
 * HALF AND PER: THE COUNT DIVIDED, ROUNDED DOWN (CR 107.1a), BEFORE `times` AND `plus`.
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const s = table([at(0, "hand", "Bear", "Elk", "Rock", "Glyph", "Bear"), at(1, "hand", "Bear"), at(0, "graveyard", ...Array(13).fill("Wastes")),
    at(1, "graveyard", ...Array(14).fill("Wastes"))], 2);
  const handOf = {count: {what: "card", zone: "hand", controller: "you"}};
  const grave = {count: {what: "card", zone: "graveyard", controller: "you"}};
  eq([amountOf(s, {...handOf, half: true}, {controller: 0}), amountOf(s, {...handOf, half: true}, {controller: 1})], [2, 0], "half of five is two, of one none: rounded down");
  eq([amountOf(s, {...grave, per: 7, times: 2}, {controller: 0}), amountOf(s, {...grave, per: 7, times: 2}, {controller: 1})], [2, 4],
    "for every seven, +2: thirteen is one seven, fourteen two");
  eq([amountOf(s, {...grave, per: 7}, {controller: 0}), amountOf(s, {...handOf, half: true, plus: 1}, {controller: 0}), amountOf(s, {...handOf, half: true, times: 3}, {controller: 0})],
    [1, 3, 6], "divided first, then added to and multiplied");
  eq([amountOf(s, {lifeTotal: "you", half: true}, {controller: 0}), amountOf(s, {lifeTotal: "you"}, {controller: 0})], [20, 40], "half a life total, as Heartless Hidetsugu reads it");
  eq([amountProblems({...handOf, half: true}), amountProblems({...grave, per: 7, times: 2})], [[], []], "the grammar takes half and per");
  for (const bad of [{...handOf, half: "up"}, {...handOf, half: 2}, {...grave, per: 1}, {...grave, per: 2.5}, {...grave, per: "7"}])
    ok(amountProblems(bad).length > 0, `and refuses ${JSON.stringify({half: bad.half, per: bad.per})}`);
}

/* ---------------------------------------------------------------------------------------------------------------------
 * EACH PLAYER'S OWN COUNT (Pox Plague, four players): every count counted before anyone is asked; the choices in turn order
 * from the active player, a player with none to discard or sacrifice not asked; the cards moved once the last has chosen.
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const s = table([at(0, "battlefield", ...SWAMPS), at(0, "hand", "Pox Plague", "Bear", "Elk", "Rock", "Glyph"),
    at(1, "battlefield", "Bear", "Elk"), at(1, "hand", "Bear", "Elk", "Rock"),
    at(2, "hand", "Glyph"),
    at(3, "battlefield", "Bear", "Elk", "Rock", "Glyph", "Forest", "Forest", "Forest"), at(3, "hand", "Bear", "Elk", "Rock", "Glyph", "Forest", "Forest")], 4, castPox);
  eq(s.players.map((p) => p.life), [20, 20, 20, 20], "everyone at 40 loses 20");
  eq([s.awaiting.effect, s.awaiting.player, s.awaiting.remaining, s.awaiting.counts], ["discard", 0, [1, 3], {0: 2, 1: 1, 2: 0, 3: 3}],
    "each player's half of their hand, counted at once: Rob 2 of 5 (his first draw among them), Maya 1 of 3, Trey none of 1 -- not asked -- Sam 3 of 6");
  eq([awaitingChoice(s).min, awaitingChoice(s).max], [2, 2], "Rob must discard exactly two");
  resolveAwaiting(s, [0, 1]);
  eq([s.awaiting.player, hand(s, 0).length, awaitingChoice(s).min], [1, 5, 1], "Maya asked next; Rob's cards still in his hand until the last has chosen (CR 101.4)");
  resolveAwaiting(s, [2]);
  resolveAwaiting(s, [0, 1, 2]);
  eq([hand(s, 0).sort(), hand(s, 1).sort(), hand(s, 2), hand(s, 3).sort()], [["Glyph", "Rock", "Wastes"], ["Bear", "Elk"], ["Glyph"], ["Forest", "Forest", "Glyph"]],
    "then every discard at once: Rob two, Maya her Rock, Trey nothing, Sam three");
  eq([s.awaiting.effect, s.awaiting.player, s.awaiting.remaining, s.awaiting.counts], ["sacrifice", 0, [1, 3], {0: 2, 1: 1, 2: 0, 3: 3}],
    "the sacrifice the same: Rob 2 of his 5 Swamps, Maya 1 of 2, Trey with nothing not asked, Sam 3 of 7");
  resolveAwaiting(s, [0, 1]);
  resolveAwaiting(s, [0]);
  resolveAwaiting(s, [4, 5, 6]);
  eq([controls(s, 0).length, controls(s, 1), controls(s, 2), controls(s, 3)], [3, ["Elk"], [], ["Bear", "Elk", "Glyph", "Rock"]], "and every sacrifice made, of each player's choice");
  eq([s.awaiting, s.stack.length, s.zones.graveyard[0].map((id) => s.objects[id].card).includes("Pox Plague")], [null, 0, true], "and the spell is done");
}

/* Counted before anyone sacrifices (CR 101.4, 608.2h): Maya's Bear, taken by Rob's Sower of Temptation, comes back to her only
   once every sacrifice is made -- Rob's Sower among them -- so her half is of the three she controlled, not of four. */
{
  const s = table([at(0, "battlefield", ...SWAMPS, "Island", "Island", "Wastes", "Wastes"), at(0, "hand", "Sower of Temptation", "Pox Plague"),
    at(1, "battlefield", "Bear", "Elk", "Rock", "Glyph")], 2,
    [{tap: "Island"}, {tap: "Island"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Sower of Temptation"}, {resolve: true}, {choose: ["Bear"]}, {resolve: true}, ...castPox]);
  eq([controls(s, 0).includes("Bear"), controls(s, 1)], [true, ["Elk", "Glyph", "Rock"]], "Rob controls Maya's Bear as the Plague resolves");
  eq([s.awaiting.effect, s.awaiting.counts], ["sacrifice", {0: 5, 1: 1}], "Rob sacrifices five of his eleven, Maya one of her three");
  const mine = awaitingChoice(s).options;
  resolveAwaiting(s, [mine.findIndex((o) => o.label === "Sower of Temptation"), 0, 1, 2, 3]);
  eq([controls(s, 0).includes("Bear"), awaitingChoice(s).options.map((o) => o.label).sort(), awaitingChoice(s).min], [true, ["Elk", "Glyph", "Rock"], 1],
    "Maya chooses one of her own three: the Bear is still Rob's while she chooses");
  resolveAwaiting(s, [0]);
  eq(controls(s, 1), ["Bear", "Glyph", "Rock"], "then the Sower is gone with the rest, and the Bear comes home: Maya kept two and has it back");
}

/* A question asked mid-resolution, saved and read back: the counts are part of it. */
{
  const s = table([at(0, "battlefield", ...SWAMPS), at(0, "hand", "Pox Plague", "Bear", "Elk"), at(1, "hand", "Bear", "Elk", "Rock", "Glyph")], 2, castPox);
  const store = createMatchStore(memoryStorage(), "amounts");
  await store.saveCheckpoint({...createJournal({matchId: "amounts", seed: "s"}).checkpoint(s, createRng("s").checkpoint()), matchId: "amounts"});
  const back = (await store.latestCheckpoint()).state;
  eq([back.awaiting.counts, awaitingChoice(back).min], [{0: 1, 1: 2}, 1], "the checkpoint keeps each player's count, and the question reads the same from it");
}

/* The grammar: perPlayer only on a discard or a sacrifice whose count is counted, nothing whole, at random or kept. */
{
  const pox = script("pox-plague");
  eq(validateScript(pox).errors, [], "Pox Plague is a valid script");
  const withEffect = (change) => { const copy = structuredClone(pox); change(copy.abilities[0].effects); return validateScript(copy).errors.some((e) => /perPlayer/.test(e.message)); };
  eq([withEffect((fx) => { fx[1].perPlayer = "yes"; }), withEffect((fx) => { fx[1].count = 2; }), withEffect((fx) => { fx[1].all = true; }),
    withEffect((fx) => { fx[1].random = true; }), withEffect((fx) => { fx[2].keep = 1; }), withEffect((fx) => { fx[1].effect = "draw"; }),
    withEffect((fx) => { fx[0].effects[0].perPlayer = true; }), withEffect((fx) => { fx[2].keepTypes = ["Creature"]; }), withEffect((fx) => { fx[2].keepPowerAtMost = 4; }),
    withEffect(() => {})], [true, true, true, true, true, true, true, true, true, false],
  "refused: not true, a plain number, a whole hand, at random, a sacrifice that keeps, a draw, a loss of life");
}

/* ---------------------------------------------------------------------------------------------------------------------
 * A TARGET PLAYER'S ZONE, COUNTED: bound to the player chosen, nobody once that target is not one.
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const s = table([at(0, "hand", "Bear"), at(1, "hand", "Bear", "Elk", "Rock", "Glyph"), at(2, "hand", "Elk"), at(3, "hand", "Rock", "Glyph")], 4);
  const theirs = {count: {what: "card", zone: "hand", controller: {target: 0}}};
  const read = (targets) => amountOf(s, theirs, {controller: 0, targets});
  eq([read([{kind: "player", id: 1}]), read([{kind: "player", id: 2}]), read([{kind: "player", id: 3}])], [4, 1, 2], "the target opponent's hand: Maya 4, Trey 1, Sam 2");
  eq([read([null]), read([]), read([{kind: "object", id: 1}])], [0, 0, 0], "a target no longer legal, none chosen, or an object (object 1, not Maya): nothing counted, never every hand");
  eq(amountOf(s, {count: {what: "card", zone: "hand", anyOf: [{types: ["Creature"], controller: {target: 0}}, {types: ["Artifact"], controller: {target: 1}}]}},
    {controller: 0, targets: [{kind: "player", id: 1}, {kind: "player", id: 3}]}), 3, "an alternative's own target, each bound: Maya's two creatures and Sam's Rock");
  eq(amountProblems(theirs), [], "the grammar takes a target player as a counted selector's controller");
  const bk = script("borrowed-knowledge");
  eq(validateScript(bk).errors, [], "Borrowed Knowledge is a valid script");
  bk.abilities[0].effects[0].modes[0].targets = [];
  ok(validateScript(bk).errors.some((e) => /target 0/.test(e.message)), "and a count of a target's hand with no target declared is refused");
}

/* ---------------------------------------------------------------------------------------------------------------------
 * A WHOLE HAND DISCARDED, REMEMBERED: every card, and whose hand it was.
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const s = table([at(0, "battlefield", "Swamp"), at(0, "hand", "Churn", "Bear", "Elk", "Rock"), at(1, "hand", "Bear"), at(3, "hand", "Elk", "Rock")], 4,
    [{tap: "Swamp"}, {cast: "Churn"}, {resolve: true}]);
  eq([hand(s, 0), hand(s, 1), hand(s, 2), hand(s, 3)], [["Wastes", "Wastes", "Wastes", "Wastes"], ["Wastes"], [], ["Wastes", "Wastes"]],
    "each player discards their whole hand and draws as many as they discarded: Rob four (his first draw among them), Maya one, Trey none, Sam two");
  eq(s.zones.graveyard.map((g) => g.length), [5, 1, 0, 2], "every card discarded, into its owner's graveyard");
}
{
  const s = table([at(0, "hand", "Bear", "Elk"), at(1, "hand", "Rock")], 2);
  const context = {controller: 0, source: null};
  const remembering = {controller: 0, source: null};
  ASKING.discard.open(s, {who: "each", all: true}, context);
  eq([context.remembered, context.rememberedControllers, s.zones.graveyard.map((g) => g.length)], [undefined, undefined, [2, 1]], "a whole hand discarded without `remember` remembers nothing");
  const t = table([at(0, "hand", "Bear", "Elk"), at(1, "hand", "Rock")], 2);
  ASKING.discard.open(t, {who: "each", all: true, remember: true}, remembering);
  eq([remembering.remembered.map((id) => t.objects[id].card).sort(), Object.values(remembering.rememberedControllers).sort()], [["Bear", "Elk", "Rock"], [0, 0, 1]],
    "with it, every card discarded, as the cards they became, and whose hand each was");
}

/* ---------------------------------------------------------------------------------------------------------------------
 * A REMEMBERED COUNT WITH A FILTER, OF WHAT THE REMEMBERED ARE NOW.
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const s = table([at(0, "battlefield", "Bear", "Rock"), at(1, "graveyard", "Elk", "Forest", "Glyph")], 2);
  const context = {controller: 0, source: null};
  runEffects(s, [{effect: "moveZoneAll", selector: {what: "card", zone: "graveyard", controller: "opponent"}, to: "exile", remember: true}], context);
  const exiled = context.remembered;
  const counted = (filter, remembered = exiled) => amountOf(s, {rememberedCount: true, ...(filter ? {filter} : {})}, {...context, remembered});
  eq([counted(null), counted({types: ["Creature"]}), counted({nonTypes: ["Land"]}), counted({anyOf: [{types: ["Creature"]}, {types: ["Land"]}]})], [3, 1, 2, 2],
    "of the three exiled: three, one creature card, two nonland, two creature or land");
  const board = s.zones.battlefield.slice();
  eq([counted({types: ["Creature"]}, board), counted({types: ["Artifact"]}, [...board, 999999])], [1, 1], "remembered permanents read where they are; one that is gone is not counted");
  eq(amountProblems({rememberedCount: true, filter: {types: ["Creature"]}}), [], "the grammar takes a remembered count's filter");
  for (const bad of [{rememberedCount: true, filter: {shade: ["W"]}}, {count: {types: ["Creature"]}, filter: {types: ["Creature"]}}])
    ok(amountProblems(bad).length > 0, `and refuses ${JSON.stringify(bad)}`);
}
/* Augusta, Order Returned in four players: every player exiles a card of their own graveyard's, in turn order, and the
   reflexive ability counts the nonland ones across all of them -- that many fixed as it triggers. */
{
  const s = table([at(0, "battlefield", "Augusta, Order Returned"), at(0, "graveyard", "Bear"), at(1, "graveyard", "Elk", "Island"),
    at(3, "graveyard", "Rock")], 4, [{attack: ["Augusta, Order Returned"], at: "Maya"}, {resolve: true}]);
  eq([s.awaiting.effect, s.awaiting.player], ["chooseCard", 0], "Rob is asked first");
  resolveAwaiting(s, [0]);
  eq(s.awaiting.player, 1, "then Maya");
  resolveAwaiting(s, [0]);
  eq([s.awaiting.player, awaitingChoice(s).max], [2, 0], "then Trey, with nothing in his graveyard to exile");
  resolveAwaiting(s, []);
  resolveAwaiting(s, [0]);
  eq(s.zones.exile.map((id) => s.objects[id].card).sort(), ["Bear", "Elk", "Rock"], "Rob's Bear, Maya's Elk and Sam's Rock exiled");
  const reflexive = s.stack.at(-1);
  eq([s.awaiting.kind, reflexive.script.effects[0].count], ["trigger-targets", 3], "three nonland cards: the reflexive ability waits for its target, its count already 3");
  runEffects(s, [{effect: "moveZone", targets: s.zones.exile.filter((id) => s.objects[id].card === "Elk"), to: "graveyard"}], {controller: 1, source: null});
  resolveAwaiting(s, [0]);
  const augusta = s.zones.battlefield.find((id) => s.objects[id].card === "Augusta, Order Returned");
  for (let n = 0; n < 50 && s.stack.length; n += 1) passPriority(s, null, rng);
  eq(s.objects[augusta].counters["+1/+1"], 3, "the Elk put back in Maya's graveyard in response changes nothing: three counters, as it triggered");
}
{
  /* A reflexive trigger's counts of this resolution, nested where they are -- a branch's, a mode's -- and nothing else bound:
     its targets are its own. */
  const counted = countThisWay([{effect: "branch", if: {handEmpty: true}, then: [{effect: "draw", count: {rememberedCount: true}}], otherwise: []},
    {effect: "modal", choose: 1, modes: [{text: "m", targets: [], effects: [{effect: "gainLife", amount: {rememberedCount: true, plus: 1}}]}]},
    {effect: "dealDamage", amount: 2, targets: {target: 0}, who: {target: 0}}], {controller: 0, remembered: [1, 2], targets: [{kind: "player", id: 1}]}, null);
  eq([counted[0].then[0].count, counted[1].modes[0].effects[0].amount, counted[2].targets, counted[2].who], [2, 3, {target: 0}, {target: 0}],
    "a branch's and a mode's counted now; a target reference left for the reflexive ability's own target");
}

/* ---------------------------------------------------------------------------------------------------------------------
 * CONVERGE: THE COLORS SPENT TO CAST IT, AS ITS TRIGGER REMEMBERED THEM ONCE IT HAS GONE.
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const s = table([at(0, "battlefield", "Bear")], 2);
  const bear = s.zones.battlefield[0];
  s.objects[bear].spent = {W: 1, U: 2, C: 3};
  eq([amountOf(s, {colorsSpent: "self"}, {controller: 0, source: bear}), amountOf(s, {colorsSpent: "self"}, {controller: 0, source: null, spent: {R: 1, G: 1, B: 1}}),
    amountOf(s, {colorsSpent: "self"}, {controller: 0, source: null}), amountOf(s, {colorsSpent: "self"}, {controller: 0, source: 999999, spent: {W: 2}})], [2, 3, 0, 1],
  "white and blue of {W}{U}{U}{C}{C}{C}: 2, colorless no color; gone, as remembered; never cast, none");
  eq([amountProblems({colorsSpent: "self"}), amountProblems({colorsSpent: "that card"}).length > 0], [[], true], "the grammar: colorsSpent is \"self\"");
}
{
  /* Sundering Archaic, cast for {W}{U}{B}{C}{C}{C} into Maya's Wither: a 0/0, it dies before its trigger is put on the stack
     (CR 704.5f, 603.3) -- and the trigger still knows three colors were spent, as it chooses its target and as it resolves. */
  const lands = ["Plains", "Island", "Swamp", "Wastes", "Wastes", "Wastes"];
  const s = table([at(0, "battlefield", ...lands), at(0, "hand", "Sundering Archaic"), at(1, "battlefield", "Wither", "Glyph", "Ogre")], 2,
    [...lands.map((tap) => ({tap})), {cast: "Sundering Archaic"}, {resolve: true}]);
  eq([s.zones.graveyard[0].map((id) => s.objects[id].card), s.awaiting?.kind], [["Sundering Archaic"], "trigger-targets"], "the Archaic died; its trigger is choosing a target");
  eq(awaitingChoice(s).options.map((o) => o.label).sort(), ["Glyph", "Wither"], "mana value 3 or less, as three colors were spent: the Wither and the Glyph, not the Ogre");
  resolveAwaiting(s, [awaitingChoice(s).options.findIndex((o) => o.label === "Glyph")]);
  for (let n = 0; n < 10 && s.stack.length; n += 1) passPriority(s, null, rng);
  eq([s.zones.exile.map((id) => s.objects[id].card), controls(s, 1)], [["Glyph"], ["Ogre", "Wither"]], "and as it resolves its target is still legal: the Glyph is exiled");
}
{
  /* And as a permanent enters with counters (Crystalline Crawler): the spell's colors, counted as it is about to enter. */
  const lands = ["Plains", "Island", "Wastes", "Wastes"];
  const s = table([at(0, "battlefield", ...lands), at(0, "hand", "Crawler")], 2, [...lands.map((tap) => ({tap})), {cast: "Crawler"}, {resolve: true}]);
  const crawler = s.zones.battlefield.find((id) => s.objects[id].card === "Crawler");
  eq([s.objects[crawler].counters["+1/+1"], characteristicsOf(s, crawler).power], [2, 3], "{W}{U}{C}{C}: two colors, two +1/+1 counters");
}

/* ---------------------------------------------------------------------------------------------------------------------
 * PLANESWALKER TYPES, AND PROLIFERATE X TIMES.
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const oracle = JSON.parse(readFileSync(new URL("../data/engine/oracle.json", import.meta.url), "utf8"));
  eq(planeswalkerTypesFrom(oracle), [...PLANESWALKER_TYPES], "keywords/planeswalker-types.mjs is what the oracle data gives");
  eq(readFileSync(new URL("../game/engine/keywords/planeswalker-types.mjs", import.meta.url), "utf8"), planeswalkerModuleText([...PLANESWALKER_TYPES]), "and is the generator's text");
  eq(["Jace", "Nissa", "Gideon", "Ugin", "Equipment", "Human", "Forest", "Aura"].map(isPlaneswalkerType), [true, true, true, true, false, false, false, false],
    "Jace, Nissa, Gideon and Ugin are planeswalker types; The Aetherspark's Equipment, a creature type, a land type and an enchantment type are not");
}
{
  const s = table([at(0, "battlefield", "Jace Walker", "Nissa Walker", "Gideon Walker", "Bear"), at(1, "battlefield", "Jace Walker")], 2);
  const mine = {planeswalkerTypesAmong: {what: "permanent", types: ["Planeswalker"], controller: "you"}};
  eq([amountOf(s, mine, {controller: 0}), amountOf(s, mine, {controller: 1})], [3, 1], "Rob's Jace, Nissa and Gideon: three -- the Gideon's Human Soldier no planeswalker type; Maya's one");
  eq(amountProblems(mine), [], "the grammar takes a selector");
  /* Through the layers (CR 613.1d): a subtype an effect gives counts, as the permanent now is. */
  const jace = s.zones.battlefield.find((id) => s.objects[id].card === "Jace Walker" && s.objects[id].controller === 1);
  (s.effects ??= []).push({id: "probe-subtypes", layer: 4, affects: {ids: [jace]}, apply: {addSubtypes: ["Nissa", "Ugin"]}, until: null, sourceController: 1});
  eq(amountOf(s, mine, {controller: 1}), 3, "Maya's Jace given Nissa and Ugin: three planeswalker types");
  const t = table([at(0, "graveyard", "Jace Walker", "Gideon Walker", "Bear")], 2);
  eq(amountOf(t, {planeswalkerTypesAmong: {what: "card", zone: "graveyard", controller: "you"}}, {controller: 0}), 2, "and cards elsewhere, as printed: a Jace and a Gideon in a graveyard");
  ok(amountProblems({planeswalkerTypesAmong: {shade: ["W"]}}).length > 0, "and refuses a selector that is not one");
}
{
  /* Tam with Tekuthal, Inquiry Dominus: one planeswalker type, so one proliferate -- which Tekuthal makes two (CR 614.1a). */
  const lands = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
  const s = table([at(0, "battlefield", "Tam, the Possibility", "Tekuthal, Inquiry Dominus", "Jace Walker", ...lands)], 2,
    [...lands.map((tap) => ({tap})), {activate: "Tam, the Possibility"}, {resolve: true}]);
  const jace = s.zones.battlefield.find((id) => s.objects[id].card === "Jace Walker");
  resolveAwaiting(s, [0]);
  eq([s.awaiting?.effect, s.objects[jace].counters.loyalty], ["proliferate", 4], "the first proliferate: Jace at 4, and a second asked");
  resolveAwaiting(s, [0]);
  eq([s.awaiting, s.objects[jace].counters.loyalty], [null, 5], "the second: Jace at 5, and no third");
}
{
  const s = table([at(0, "battlefield", "Jace Walker")], 2);
  const jace = s.zones.battlefield[0];
  for (const [count, asked] of [[0, null], [-1, null], [3, "proliferate"]]) {
    s.awaiting = null; s.resolving = null;
    beginResolution(s, [{effect: "proliferate", count}], {controller: 0});
    eq(s.awaiting?.effect ?? null, asked, `proliferate ${count} times: ${asked ? "asked" : "nothing asked, nothing done"}`);
  }
  resolveAwaiting(s, [0]); resolveAwaiting(s, [0]); resolveAwaiting(s, [0]);
  eq([s.awaiting, s.objects[jace].counters.loyalty], [null, 6], "three times, three questions: Jace from 3 to 6");
}

/* ---------------------------------------------------------------------------------------------------------------------
 * YOUR COMMANDERS' CASTS FROM THE COMMAND ZONE, FOR A STATIC.
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const s = table([at(0, "command", "Captain"), at(0, "battlefield", "Banner", "Wisp", "Mountain"), at(1, "battlefield", "Banner", "Wisp")], 2,
    [{tap: "Mountain"}, {cast: "Captain"}]);
  const wisps = s.zones.battlefield.filter((id) => s.objects[id].card === "Wisp");
  eq(wisps.map((id) => characteristicsOf(s, id).power), [2, 1], "Rob has cast his commander once from the command zone: his Spirit +1/+1, Maya's not");
  s.players[0].commanderCasts = {a: 2, b: 1};
  eq([amountOf(s, {commanderCasts: "you"}, {controller: 0}), amountOf(s, {commanderCasts: "you"}, {controller: 1})], [3, 0], "every commander's casts, together; none for Maya");
  eq([amountProblems({commanderCasts: "you"}), amountProblems({commanderCasts: "opponent"}).length > 0], [[], true], "the grammar: \"you\" or \"that card\"");
}

/* ---------------------------------------------------------------------------------------------------------------------
 * THE CREDITS.
 * ------------------------------------------------------------------------------------------------------------------- */
eq(["Converge", "TotalCommanderCastFromCommandZone"].map((kind) => FORGE_COUNTS[kind]?.status), ["built", "built"],
  "credited: converge, and every cast of your commanders from the command zone");
eq(FORGE_COUNTS.RememberedSize.status, "missing", "not credited: Forge's remembered count holds players as well, which nothing here remembers");
eq(missingFor({counts: ["Converge", "TotalCommanderCastFromCommandZone"]}), [], "and a card counting them is held back by neither");
for (const name of ["Pox Plague", "Dark Matter Manipulator", "Borrowed Knowledge", "Jeska's Will", "Release to Memory", "Augusta, Order Returned", "Sundering Archaic", "Tam, the Possibility", "Awaken the Erstwhile", "Vanguard of the Restless"])
  ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-counted-amounts: ${checks} checks passed -- half and per; each player's own count; a target player's zone; a whole hand remembered; a remembered count filtered and carried into a reflexive trigger; converge; planeswalker types and proliferate X times; your commanders' casts.`);
