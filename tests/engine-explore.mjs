/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN E: EXPLORE (CR 701.44) AND THE MAP TOKEN (CR 111.10s) -- Restless Anchorage's "whenever this land attacks, create a
 * Map token".
 *
 * effects/asking.mjs, explore: the exploring permanent's controller reveals the top card of their library; a land card goes
 * to their hand; anything else, or nothing at all, puts a +1/+1 counter on the exploring permanent if it is still on the
 * battlefield, and that player may put the revealed card into their graveyard -- asked as surveil asks, the card shown to
 * every seat while it is open. Gone, its last known information says whose it was (701.44c). The Map token's ability,
 * "{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery." (effects/permanents.mjs,
 * PREDEFINED_TOKENS). Here: a land, a nonland kept and put away, an empty library, whose library, an explorer gone, the
 * revealed card in every seat's view, a player who left, the Map, the vocabulary. Restless Anchorage's scenarios play it at
 * the table.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {ASKING} from "../game/engine/script/effects/asking.mjs";
import {NEEDS_A_DECISION} from "../game/engine/script/effects/index.mjs";
import {PREDEFINED_TOKENS} from "../game/engine/script/effects/permanents.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {lastKnown} from "../game/engine/rules/layers.mjs";
import {isPrimitive} from "../game/engine/vocabulary.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Ogre: {types: ["Creature"], subtypes: ["Ogre"], manaCost: "{2}{R}", colors: ["R"], power: 3, toughness: 3}};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, library = []) => runScenario({name: "explore", setup, library, steps: []}, index.definition, FIX).state;
const idOf = (s, card, seat = 0) => s.zones.battlefield.find((id) => s.objects[id].card === card && s.objects[id].controller === seat);
const top = (s, seat = 0) => s.objects[s.zones.library[seat][0]]?.card;
const counters = (s, id) => s.objects[id].counters["+1/+1"] ?? 0;
const explore = (s, id, controller = 0, extra = {}) => beginResolution(s, [{effect: "explore", targets: [id]}], {controller, source: null, ...extra});
const revealed = (outcome) => (outcome.events ?? []).filter((e) => e.kind === "GameEventCardRevealed").map((e) => e.data.fields.card.name ?? e.data.fields.card.cardName ?? true);

{
  const s = table([at(0, "battlefield", "Bear")]);
  const bear = idOf(s, "Bear");
  const outcome = explore(s, bear);
  eq([outcome.status, s.zones.hand[0].map((id) => s.objects[id].card), counters(s, bear), s.zones.library[0].length], ["done", ["Wastes"], 0, 19],
    "a land on top (the Wastes): into Rob's hand, no counter, nobody asked");
  eq(revealed(outcome).length, 1, "revealed first (CR 701.44a)");
}
{
  const s = table([at(0, "battlefield", "Bear")], ["Ogre"]);
  const bear = idOf(s, "Bear");
  eq(explore(s, bear).status, "waiting", "a nonland on top: the resolution stops to ask");
  const q = awaitingChoice(s);
  eq([s.awaiting.player, counters(s, bear), q.options.map((o) => o.label), q.min, q.max], [0, 1, ["Ogre"], 0, 1],
    "the Bear already has its +1/+1 counter; Rob may put the Ogre into his graveyard, or not");
  eq(projectFor(s, 1).players[0].zones.Library.cards.map((c) => c.name), ["Ogre"], "the revealed Ogre is in Maya's view of Rob's library while he decides");
  resolveAwaiting(s, [q.options[0].index]);
  eq([s.zones.graveyard[0].map((id) => s.objects[id].card), top(s), s.awaiting], [["Ogre"], "Wastes", null], "he puts it there: the Ogre in his graveyard");
  eq(projectFor(s, 1).players[0].zones.Library.cards, [], "the question over, Maya sees nothing of his library");
}
{
  const s = table([at(0, "battlefield", "Bear")], ["Ogre"]);
  const bear = idOf(s, "Bear");
  explore(s, bear);
  resolveAwaiting(s, []);
  eq([top(s), s.zones.graveyard[0].length, counters(s, bear)], ["Ogre", 0, 1], "or he keeps it: the Ogre stays on top, and the counter stays");
  eq(projectFor(s, 1).players[0].zones.Library.cards, [], "no longer shown to Maya");
}
{
  const s = table([at(0, "battlefield", "Bear")]);
  const bear = idOf(s, "Bear");
  s.zones.library[0] = [];
  const outcome = explore(s, bear);
  eq([outcome.status, counters(s, bear), revealed(outcome).length], ["done", 1, 0], "an empty library: nothing revealed, and the counter all the same (CR 701.44a-b)");
}
{
  /* Whose library: the exploring permanent's controller's, whoever's effect it is. */
  const s = table([at(1, "battlefield", "Bear")]);
  const bear = idOf(s, "Bear", 1);
  const [mine, hers] = [s.zones.hand[0].length, s.zones.hand[1].length];
  explore(s, bear, 0);
  eq([s.zones.hand[0].length - mine, s.zones.hand[1].length - hers, s.zones.library[1].length], [0, 1, 19],
    "Rob's effect, Maya's Bear: Maya reveals her top card, a land, and it is her hand it goes to");
}
{
  const s = table([at(1, "battlefield", "Bear")], ["Ogre"]);
  const bear = idOf(s, "Bear", 1);
  explore(s, bear, 0);
  eq([s.awaiting?.player, counters(s, bear), awaitingChoice(s).options.map((o) => s.objects[o.cardId].owner)], [1, 1, [1]],
    "a nonland on top of Maya's library: her Bear's counter, and she is the one asked, about her own Ogre");
}
{
  /* Gone before it explores: its last known information says whose it was (CR 701.44c), and there is nothing to put a
     counter on. */
  const s = table([at(1, "battlefield", "Bear")]);
  const bear = idOf(s, "Bear", 1);
  const seen = lastKnown(s, bear);
  s.zones.battlefield = s.zones.battlefield.filter((id) => id !== bear);
  delete s.objects[bear];
  const before = s.zones.hand[1].length;
  explore(s, bear, 0, {lastKnown: seen});
  eq(s.zones.hand[1].length - before, 1, "Maya's Bear, gone: Maya still reveals, and her land goes to her hand");
}
{
  const s = table([at(0, "battlefield", "Bear")], ["Ogre"]);
  explore(s, idOf(s, "Bear"));
  const awaiting = s.awaiting;
  eq(ASKING.explore.left(s, awaiting), [], "asked of a player who has left the game: nothing to move");
  ok(!(s.looks ?? []).some((l) => l.revealed === true), "and nothing left shown");
}
{
  /* A player who has left the game explores nothing (CR 800.4a). */
  const s = table([at(1, "battlefield", "Bear")]);
  const bear = idOf(s, "Bear", 1);
  s.players[1].lost = true;
  const [hand, library] = [s.zones.hand[1].length, s.zones.library[1].length];
  eq([explore(s, bear, 0).status, counters(s, bear), s.zones.hand[1].length - hand, s.zones.library[1].length - library], ["done", 0, 0, 0],
    "Maya has left: no card revealed, none moved, no counter");
}
{
  const map = PREDEFINED_TOKENS.Map;
  eq([map.name, map.types, map.subtypes, map.colors ?? [], map.abilities.length], ["Map", ["Artifact"], ["Map"], [], 1], "the Map: a colorless Map artifact token (CR 111.10s)");
  const [ability] = map.abilities;
  eq([ability.timing, ability.targets, ability.cost.map((c) => c.atom), ability.effects], ["sorcery", [{what: "permanent", types: ["Creature"], controller: "you"}],
    ["mana", "{T}", "sacrifice"], [{effect: "explore", targets: {target: 0}}]], "{1}, {T}, Sacrifice this token: target creature you control explores, as a sorcery");
  ok(isPrimitive("explore") && NEEDS_A_DECISION.includes("explore") && typeof ASKING.explore?.open === "function", "explore is a declared primitive that asks");
}

console.log(`engine-explore: ${checks} checks passed -- explore (CR 701.44): a land to hand, a nonland's counter and the graveyard asked, an empty library, whose library, an explorer gone, the reveal shown, a player who left; and the Map token (CR 111.10s).`);
