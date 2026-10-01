/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 4: A SEARCH, FACTS ABOUT A TARGET, AND THE LANDS THE MOST-PLAYED DECKS RUN.
 *
 *   1. `chooseCard` is a search (CR 701.23): the searcher sees every card of the zone the description matches and
 *      chooses. Searching for a card with a quality may find none (701.23b); for just "a card", must find one
 *      (701.23d). Cards go to their destinations in the order chosen; the library is shuffled after (701.24), with the
 *      game's own random stream, before a card "put on top" is put there. Nothing to find is still asked.
 *   2. Facts about a target (CR 608.2h): read as the resolution begins, so "exile target creature; its controller
 *      gains life equal to its power" knows the power of what it exiled. `controllerOf` is where a player goes.
 *   3. Supertypes ("a basic land card"), and "unless you have two or more opponents".
 *   4. CR 611.2c: "permanents you control gain ... until end of turn" affects the ones there as it resolves.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {selectMatching} from "../game/engine/script/filter.mjs";
import {bindEffect, factsOf} from "../game/engine/script/bind.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (f, re, m) => { assert.throws(f, re, m); checks += 1; };

const land = (name, sub, color, basic = true) => ({card: name, types: ["Land"], ...(basic ? {supertypes: ["Basic"]} : {}), subtypes: sub ? [sub] : [],
  abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {[color]: 1}}]});
const FOREST = land("Forest", "Forest", "G"), ISLAND = land("Island", "Island", "U"), WASTES = land("Wastes", null, "C");
const DUAL = {card: "Dual Forest", types: ["Land"], subtypes: ["Forest", "Island"], abilities: []};
const ROCK = {card: "Rock", types: ["Artifact"], manaCost: "{1}"};
const BEAR = {card: "Bear", types: ["Creature"], manaCost: "{1}{G}", power: 3, toughness: 3};
const sorcery = (name, effects, targets = []) => ({card: name, types: ["Sorcery"], manaCost: "{C}", spell: {id: "s", text: name, targets, effects}});
const search = (selector, extra = {}) => ({effect: "chooseCard", zone: "library", selector, shuffle: true, ...extra});

const pod = (n = 2) => ({matchId: "m", seed: "search", players: ["Rob", "Maya", "Trey"].slice(0, n).map((name) => ({name}))});
function table(library, n = 2) {
  const s = createState(pod(n));
  for (let seat = 0; seat < n; seat += 1) for (const card of library) addObject(s, {...card, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const cast = (s, name, seat = 0, pick = (a) => true) => {
  for (const a of legalActions(s, seat).filter((x) => x.kind === "activate-mana")) applyAction(s, seat, a);
  applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "cast" && a.label === name && pick(a)));
  for (let n = 0; n < 3 && s.stack.length && !s.awaiting; n += 1) passPriority(s);
};
const names = (s, zone, seat = 0) => cardsIn(s, zone, seat).map((id) => s.objects[id].card).sort();
const lib = [FOREST, ISLAND, DUAL, ROCK, WASTES, WASTES];

/* ---- 1. the search ---- */
{
  const s = table(lib);
  on(s, WASTES, 0);
  on(s, sorcery("Ramp", [search({types: ["Land"], supertypes: ["Basic"]}, {to: "battlefield", tapped: true})]), 0, "hand");
  main(s);
  cast(s, "Ramp");
  const choice = awaitingChoice(s);
  eq([s.awaiting.effect, s.awaiting.player, choice.min, choice.options.map((o) => o.label).sort()], ["chooseCard", 0, 0, ["Forest", "Island", "Wastes", "Wastes"]],
    "a search for a basic land card offers every basic in the library -- the Wastes too, and never the nonbasic dual -- and may find none (CR 701.23b)");
  throws(() => resolveAwaiting(s, [0], null, null), /random stream/, "a search that shuffles refuses an answer without the game's random stream");
  const before = cardsIn(s, "library", 0).length;
  resolveAwaiting(s, [choice.options.findIndex((o) => o.label === "Island")], null, createRng("x"));
  const island = s.zones.battlefield.find((id) => s.objects[id].card === "Island");
  eq([Boolean(island), s.objects[island]?.tapped, cardsIn(s, "library", 0).length, s.stack.length], [true, true, before - 1, 0],
    "the Island is on the battlefield tapped, out of the library, and the spell has left the stack");
}
{
  const s = table(lib);
  on(s, WASTES, 0);
  on(s, sorcery("Tutor", [search({}, {to: "hand"})]), 0, "hand");
  main(s);
  cast(s, "Tutor");
  eq(awaitingChoice(s).min, 1, "a search for just \"a card\" must find one (CR 701.23d)");
  throws(() => resolveAwaiting(s, [], null, createRng("x")), /Invalid selection/, "so finding none is refused");
  resolveAwaiting(s, [awaitingChoice(s).options.findIndex((o) => o.label === "Rock")], null, createRng("x"));
  eq(names(s, "hand"), ["Rock"], "and the card chosen goes to hand");
}
{
  /* The same search, the same seed, the same library: a replay shuffles alike, and a different seed differently. */
  const run = (seed) => {
    const s = table([...lib, ...lib, ...lib]);
    on(s, WASTES, 0);
    on(s, sorcery("Tutor", [search({}, {to: "hand"})]), 0, "hand");
    main(s);
    cast(s, "Tutor");
    resolveAwaiting(s, [0], null, createRng(seed));
    return cardsIn(s, "library", 0).map((id) => s.objects[id].card).join(",");
  };
  eq(run("a"), run("a"), "the shuffle is the game's own random stream: the same seed, the same library");
  ok(run("a") !== run("b"), "and another seed another order");
}
{
  const s = table(lib);
  on(s, WASTES, 0);
  on(s, sorcery("Top", [search({}, {to: "top"})]), 0, "hand");
  main(s);
  cast(s, "Top");
  resolveAwaiting(s, [awaitingChoice(s).options.findIndex((o) => o.label === "Rock")], null, createRng("x"));
  eq(s.objects[cardsIn(s, "library", 0)[0]].card, "Rock", "\"then shuffle and put that card on top\": on top, after the shuffle (CR 701.24)");
}
{
  const s = table(lib);
  on(s, WASTES, 0);
  on(s, sorcery("Cultivate", [search({types: ["Land"], supertypes: ["Basic"]}, {count: 2, upTo: true, destinations: [{to: "battlefield", tapped: true}, {to: "hand"}]})]), 0, "hand");
  main(s);
  cast(s, "Cultivate");
  const opts = awaitingChoice(s).options;
  resolveAwaiting(s, [opts.findIndex((o) => o.label === "Island"), opts.findIndex((o) => o.label === "Forest")], null, createRng("x"));
  eq([names(s, "hand"), s.objects[s.zones.battlefield.find((id) => s.objects[id].card === "Island")].tapped], [["Forest"], true],
    "two found: the first to the battlefield tapped, the second to hand, in the order chosen");
}
{
  const s = table([ROCK, ROCK]);
  on(s, WASTES, 0);
  on(s, sorcery("Ramp", [search({types: ["Land"], supertypes: ["Basic"]}, {to: "battlefield"})]), 0, "hand");
  main(s);
  cast(s, "Ramp");
  eq([s.awaiting?.effect, awaitingChoice(s).max, awaitingChoice(s).title], ["chooseCard", 0, "Search your library: nothing to find"],
    "a library with nothing to find is still searched -- the question is asked, with nothing in it");
  resolveAwaiting(s, [], null, createRng("x"));
  eq(s.stack.length, 0, "and answering it finishes the spell");
}
{
  const s = table([FOREST, DUAL, ISLAND]);
  on(s, WASTES, 0);
  on(s, sorcery("Lore", [search({anyOf: [{types: ["Land"], subtypes: ["Forest"]}]}, {to: "battlefield"})]), 0, "hand");
  main(s);
  cast(s, "Lore");
  eq(awaitingChoice(s).options.map((o) => o.label).sort(), ["Dual Forest", "Forest"], "\"a Forest card\" finds a nonbasic land with the Forest type too (CR 305.6)");
}

/* ---- 2. facts about a target ---- */
{
  const s = table([WASTES]);
  on(s, ISLAND, 0);
  const bear = on(s, BEAR, 1);
  on(s, {card: "Swords", types: ["Instant"], manaCost: "{U}", spell: {id: "s", text: "Exile target creature. Its controller gains life equal to its power.",
    targets: [{what: "permanent", types: ["Creature"]}],
    effects: [{effect: "moveZone", targets: {target: 0}, to: "exile"}, {effect: "gainLife", who: {controllerOf: {target: 0}}, amount: {powerOf: {target: 0}}}]}}, 0, "hand");
  main(s);
  cast(s, "Swords");
  eq([names(s, "exile", 1), s.objects[bear], s.players[1].life, s.players[0].life], [["Bear"], undefined, 43, 40],
    "exiled, and its controller gained its power in life: the power read as the resolution began, after the creature was gone (CR 608.2h)");
  eq(factsOf(s, [{kind: "player", id: 0}, null]), [null, null], "a player or an illegal target has no facts");
  eq(bindEffect({effect: "gainLife", who: {controllerOf: {target: 0}}, amount: {powerOf: {target: 0}}}, {targets: [null], facts: [null]}),
    {effect: "gainLife", who: []}, "an illegal target's fact binds to nothing: no one gains anything");
  ok(!validateScript({schema: "CrankCardScript@1", identity: {name: "X", oracleId: "x", types: ["Instant"], manaCost: "{1}"},
    abilities: [{kind: "spell", text: "x", targets: [], effects: [{effect: "gainLife", amount: {powerOf: {target: 0}}}]}]}).valid,
    "a fact about a target the ability never declared is refused by the schema");
}

{
  /* Reanimate: "onto the battlefield under your control", for the creature card's mana value in life. */
  const s = table([WASTES]);
  on(s, ISLAND, 0);
  on(s, BEAR, 1, "graveyard");
  on(s, {card: "Reanimate", types: ["Sorcery"], manaCost: "{U}", spell: {id: "s", text: "x", targets: [{what: "card", zone: "graveyard", types: ["Creature"]}],
    effects: [{effect: "moveZone", targets: {target: 0}, to: "battlefield", controller: "you"}, {effect: "loseLife", amount: {manaValueOf: {target: 0}}}]}}, 0, "hand");
  main(s);
  cast(s, "Reanimate");
  const back = s.zones.battlefield.find((id) => s.objects[id].card === "Bear");
  eq([s.objects[back]?.owner, s.objects[back]?.controller, s.players[0].life], [1, 0, 38],
    "Maya's creature card returns under Rob's control -- still hers -- and he loses its mana value in life");
}

/* ---- 3. supertypes; two or more opponents ---- */
{
  const s = table([WASTES]);
  on(s, FOREST, 0);
  on(s, {...FOREST, card: "Snowy Forest", supertypes: ["Basic", "Snow"]}, 0);
  on(s, DUAL, 0);
  main(s);
  eq(selectMatching(s, {types: ["Land"], supertypes: ["Basic"]}).map((id) => s.objects[id].card).sort(), ["Forest", "Snowy Forest"], "\"basic land\" is the supertype Basic (CR 205.4c), whatever else");
  const bond = {card: "Bond", types: ["Land"], abilities: [{id: "r", kind: "replacement", text: "x", watches: {event: "enters", who: "self", unless: {opponents: {min: 2}}}, change: {entersTapped: true}}]};
  for (const [n, tapped] of [[2, true], [3, false]]) {
    const t = table([WASTES], n);
    on(t, bond, 0, "hand");
    main(t);
    applyAction(t, 0, legalActions(t, 0).find((a) => a.kind === "play-land"));
    eq(t.objects[t.zones.battlefield.find((id) => t.objects[id].card === "Bond")].tapped, tapped,
      `with ${n - 1} opponent${n === 2 ? "" : "s"} it enters ${tapped ? "tapped" : "untapped"}: "unless you have two or more opponents"`);
  }
}

/* ---- 4. CR 611.2c ---- */
{
  const s = table([WASTES]);
  for (let i = 0; i < 3; i += 1) on(s, WASTES, 0);
  const first = on(s, BEAR, 0);
  on(s, {card: "Heroic", types: ["Instant"], manaCost: "{C}", spell: {id: "s", text: "x", targets: [],
    effects: [{effect: "pumpAll", selector: {what: "permanent", controller: "you"}, keywords: ["Indestructible"], until: "end-of-turn"}]}}, 0, "hand");
  on(s, {...BEAR, card: "Late Bear", manaCost: "{2}"}, 0, "hand");
  main(s);
  cast(s, "Heroic");
  ok(keywordsOf(s, first).includes("Indestructible"), "a creature there as it resolves gains indestructible");
  cast(s, "Late Bear");
  const late = s.zones.battlefield.find((id) => s.objects[id].card === "Late Bear");
  ok(late && !keywordsOf(s, late).includes("Indestructible"), "one that comes after does not: the set was fixed as the effect began (CR 611.2c)");
}

console.log(`engine-search: ${checks} checks passed — a search that offers what the description matches and may or must find, a shuffle from the game's own stream, a target's facts read before it left, and an effect's set fixed as it begins.`);
