/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 73 (THE CATALOG'S ORDER): THE TOP OF A LIBRARY LOOKED AT, OR REVEALED (Forge's PeekAndReveal).
 *
 * `peekAndReveal`: the top N cards of a library, left where they are (CR 701.20b) and remembered for the effects after
 * it. Revealed, every player is shown them (CR 701.20a), and the history names them. Looked at, only the effect's
 * controller is (CR 701.20e): their view of that library shows those cards, and nobody else's does, for as long as they
 * are its top cards in that order -- a draw, a shuffle or a card put on top ends it (CR 701.20d). Besides: "shares a
 * creature type with a creature you control", and "from among them" with nothing that fits asks nothing.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const bear = (power) => ({types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power, toughness: power});
const FIX = {Bear: bear(2), Cub: bear(1), Elf: {types: ["Creature"], subtypes: ["Elf"], manaCost: "{G}", colors: ["G"], power: 1, toughness: 1}};
const scenario = (setup, steps = [], seats = 2, library = []) => runScenario({name: "peek", seats, setup, steps, expect: [], library}, cards.definition, FIX);
const named = (s, name, zone = "battlefield") => Object.values(s.objects).filter((o) => o.card === name && o.zone === zone).map((o) => o.id);
/* What `viewer` sees of `owner`'s library: its count, the names shown, and how many are hidden. */
const library = (s, viewer, owner) => { const z = projectFor(s, viewer).players[owner].zones.Library; return [z.count, z.cards.map((c) => c.name), z.hiddenCount]; };

{
  eq(missingFor({apis: ["PeekAndReveal"]}), [], "PeekAndReveal is built");
}
{
  /* Rob's Bauble at Maya: Rob sees her top card; Maya and Trey do not; the history names it to nobody. */
  const {state: s, events} = scenario([at(0, "battlefield", "Mishra's Bauble")], [{activate: "Mishra's Bauble", targets: [{player: 1}]}, {resolve: true}], 3, ["Elf"]);
  eq([library(s, 0, 1), library(s, 1, 1), library(s, 2, 1)], [[20, ["Elf"], 19], [20, [], 20], [20, [], 20]], "Rob sees Maya's top card, an Elf; she and Trey see a count");
  eq(events.some((e) => e.kind === "GameEventCardRevealed"), false, "nothing revealed: the history does not name it");
  eq(JSON.stringify(projectFor(s, 1)).includes("\"Elf\""), false, "Maya's projection carries no Elf anywhere");
  /* Her library's top changes -- she draws it -- and what Rob knew is no longer the top: he sees a count again. */
  runEffects(s, [{effect: "draw", count: 1}], {controller: 1, source: null});
  eq(library(s, 0, 1), [19, [], 19], "drawn: Rob sees nothing of her library");
}
{
  /* A look sees the top cards as they are then; a new look replaces it; a card put on top ends it. */
  const {state: s} = scenario([], [], 2, ["Elf", "Cub"]);
  runEffects(s, [{effect: "peekAndReveal", count: 2, who: [1]}], {controller: 0, source: null});
  eq(library(s, 0, 1), [20, ["Elf", "Cub"], 18], "the top two");
  runEffects(s, [{effect: "peekAndReveal", count: 1, who: [1]}], {controller: 0, source: null});
  eq(library(s, 0, 1), [20, ["Elf"], 19], "looked at again, one: the one");
  runEffects(s, [{effect: "peekAndReveal", count: 0, who: [1]}], {controller: 0, source: null});
  eq(library(s, 0, 1), [20, ["Elf"], 19], "a look at none of it changes nothing he knows");
  const shuffled = s.zones.library[1];
  shuffled.push(shuffled.shift());
  eq(library(s, 0, 1), [20, [], 20], "reordered: what he looked at is no longer the top");
}
{
  /* Revealed, every player is shown it -- an event naming each card -- and it stays where it is; remembered for what
     follows. Nothing to reveal, nothing remembered. */
  const {state: s} = scenario([], [], 2, ["Elf", "Cub", "Bear"]);
  const context = {controller: 0, source: null};
  const events = runEffects(s, [{effect: "peekAndReveal", count: 2, reveal: true, remember: true}], context);
  eq([events.filter((e) => e.kind === "GameEventCardRevealed").map((e) => e.data.fields.card.name), context.remembered.map((id) => s.objects[id].card),
    s.zones.library[0].slice(0, 2).map((id) => s.objects[id].card), library(s, 1, 0)], [["Elf", "Cub"], ["Elf", "Cub"], ["Elf", "Cub"], [20, [], 20]],
  "revealed to all, remembered, still on top -- and not left showing afterwards");
  runEffects(s, [{effect: "peekAndReveal", count: 0, remember: true}], context);
  eq(context.remembered, [], "the top 0: nothing");
}
{
  /* "Shares a creature type with a creature you control": another permanent the selector describes, itself aside. */
  const shares = compileSelector({what: "permanent", sharesCreatureType: {types: ["Creature"], controller: "you"}});
  const {state: one} = scenario([at(0, "battlefield", "Bear", "Elf")]);
  eq(shares(one, named(one, "Bear")[0], {controller: 0}), false, "his only Bear shares with nothing but itself");
  const {state: two} = scenario([at(0, "battlefield", "Bear", "Cub")]);
  eq(shares(two, named(two, "Bear")[0], {controller: 0}), true, "a Cub beside it: Bear");
  /* A creature type an effect gave it counts (the layers): a land made a 1/1 Bear creature shares Bear with the Bear. */
  const {state: land} = scenario([at(0, "battlefield", "Bear", "Forest")]);
  runEffects(land, [{effect: "animate", targets: named(land, "Forest"), subtypes: ["Bear"], power: 1, toughness: 1}], {controller: 0, source: null});
  eq(shares(land, named(land, "Bear")[0], {controller: 0}), true, "the Forest, now a Bear creature too");
  assert.throws(() => compileSelector({what: "card", sharesCreatureType: {kind: "creature"}}), /no key/);
  checks += 1;
}

console.log(`engine-peek: ${checks} checks passed`);
