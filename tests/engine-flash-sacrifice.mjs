/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 49 (THE CATALOG'S ORDER): "AS THOUGH THEY HAD FLASH" (Forge's CastWithFlash) AND SACRIFICING MANY AT
 * ONCE (Forge's SacrificeAll).
 *
 * A permanent's permission gives its controller -- and only its controller -- flash for the spells it describes. Every
 * permanent a selector fits, sacrificed, each player's at once. "Chooses up to two creatures they control, then sacrifices
 * the rest", asked only of a player with more; "the greatest power" or "the greatest mana value", a tie the player's to
 * choose. A selector may say "any of these" for every caller. And "attach it" names what entered, or nothing.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, nothingToDo} from "../game/engine/rules/actions.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const LESSON = {card: "Lesson", types: ["Sorcery"], manaCost: "{C}", spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}};
const TRINKET = {card: "Trinket", types: ["Artifact"], manaCost: "{C}"};
const BEAR = {card: "Bear", types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2};
const OGRE = {card: "Ogre", types: ["Creature"], manaCost: "{3}{R}", colors: ["R"], power: 4, toughness: 4};
function table() {
  const s = createState({matchId: "m", seed: "flash-sacrifice", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const put = (s, o, seat, zone) => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
const offered = (s, name) => legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === name).length;
/* Rob holding priority on Maya's turn, with mana to pay. */
const herTurn = (s) => { s.activePlayer = 1; s.priorityPlayer = 0; s.players[0].manaPool.C = 4; s.players[0].manaPool.G = 1; return s; };

{
  /* Vedalken Orrery: a sorcery on Maya's turn. Without it, no; Maya's Orrery is hers. */
  const s = herTurn(table());
  put(s, LESSON, 0, "hand");
  eq(offered(s, "Lesson"), 0, "a sorcery on Maya's turn: not without a permission");
  const hers = put(s, card("Vedalken Orrery"), 1, "battlefield");
  eq(offered(s, "Lesson"), 0, "Maya's Orrery gives Rob nothing");
  s.objects[hers].controller = 0;
  eq(offered(s, "Lesson"), 1, "his: offered");
  /* And it is something to do: with an untapped land and no mana floating, the room does not pass him by. */
  const t = table();
  put(t, LESSON, 0, "hand"); put(t, WASTES, 0, "battlefield");
  t.activePlayer = 1; t.priorityPlayer = 0;
  const orrery = put(t, card("Vedalken Orrery"), 1, "battlefield");
  eq(nothingToDo(t, 0), true, "a sorcery in hand on Maya's turn: nothing to do");
  t.objects[orrery].controller = 0;
  eq(nothingToDo(t, 0), false, "with his Orrery: something to do");
}
{
  /* What it describes: Shimmer Myr's artifacts, Skittering Cicada's colorless spells, Sigarda's Aid's Auras and
     Equipment ("any of these"). */
  const s = herTurn(table());
  put(s, TRINKET, 0, "hand"); put(s, BEAR, 0, "hand");
  put(s, card("Shimmer Myr"), 0, "battlefield");
  eq([offered(s, "Trinket"), offered(s, "Bear")], [1, 0], "Shimmer Myr: the Trinket, not the Bear");
  const t = herTurn(table());
  put(t, TRINKET, 0, "hand"); put(t, {...TRINKET, card: "Blade", subtypes: ["Equipment"]}, 0, "hand");
  put(t, card("Sigarda's Aid"), 0, "battlefield");
  eq([offered(t, "Blade"), offered(t, "Trinket")], [1, 0], "Sigarda's Aid: the Equipment, not a plain artifact");
}
{
  /* sacrificeAll: every colored permanent, each player's, at once -- each a sacrifice; the colorless stay. */
  const s = table();
  const mine = put(s, BEAR, 0, "battlefield"), theirs = put(s, OGRE, 1, "battlefield"), trinket = put(s, TRINKET, 0, "battlefield");
  const events = runEffects(s, [{effect: "sacrificeAll", who: "each", selector: {colorless: false}}], {controller: 0, source: null});
  eq([s.zones.battlefield.includes(mine), s.zones.battlefield.includes(theirs), s.zones.battlefield.includes(trinket)], [false, false, true], "the Bear and the Ogre gone; the Trinket stays");
  eq(events.filter((e) => e.data?.fields?.sacrificed === true).map((e) => e.data.fields.sacrificer).sort(), [0, 1], "two sacrifices, by Rob and by Maya");
  const t = table();
  put(t, BEAR, 0, "battlefield"); put(t, OGRE, 1, "battlefield");
  runEffects(t, [{effect: "sacrificeAll", who: "opponent", selector: {types: ["Creature"]}}], {controller: 0, source: null});
  eq(t.zones.battlefield.map((id) => t.objects[id].card), ["Bear"], "\"each opponent\": Maya's Ogre only");
}
{
  /* Keep up to two, sacrifice the rest; a player with two or fewer is not asked. */
  const s = table();
  const a = put(s, BEAR, 1, "battlefield"), b = put(s, BEAR, 1, "battlefield"), c = put(s, OGRE, 1, "battlefield");
  put(s, BEAR, 0, "battlefield"); put(s, BEAR, 0, "battlefield");
  beginResolution(s, [{effect: "sacrifice", who: "each", selector: {types: ["Creature"]}, keep: 2}], {controller: 0, source: null});
  const choice = awaitingChoice(s);
  eq([s.awaiting.player, choice.min, choice.max, choice.options.length], [1, 0, 2, 3], "only Maya is asked (Rob has two): keep up to two of three");
  assert.throws(() => resolveAwaiting(s, [0, 1, 2]), /Invalid selection/); checks += 1;
  resolveAwaiting(s, [0, 2]);
  eq([a, b, c].map((id) => s.zones.battlefield.includes(id)), [true, false, true], "she keeps a Bear and the Ogre: the other Bear is sacrificed");
}
{
  /* The greatest: power, ties offered; mana value. */
  const s = table();
  put(s, BEAR, 1, "battlefield"); put(s, {...BEAR, card: "Cub"}, 1, "battlefield"); put(s, {...BEAR, card: "Sage", power: 1, manaCost: "{4}{U}"}, 1, "battlefield");
  beginResolution(s, [{effect: "sacrifice", who: "opponent", count: 1, selector: {types: ["Creature"]}, greatest: "power"}], {controller: 0, source: null});
  eq(awaitingChoice(s).options.map((o) => o.label).sort(), ["Bear", "Cub"], "greatest power: the two 2s, not the 1/1 Sage");
  const t = table();
  put(t, BEAR, 1, "battlefield"); put(t, {...BEAR, card: "Sage", power: 1, manaCost: "{4}{U}"}, 1, "battlefield");
  beginResolution(t, [{effect: "sacrifice", who: "opponent", count: 1, selector: {types: ["Creature"]}, greatest: "manaValue"}], {controller: 0, source: null});
  eq(awaitingChoice(t).options.map((o) => o.label), ["Sage"], "greatest mana value: the Sage");
}
{
  /* "Any of these", with the keys they share, for every caller. */
  const s = table();
  const bear = put(s, BEAR, 0, "battlefield"), walker = put(s, {card: "Walker", types: ["Planeswalker"]}, 0, "battlefield"), hers = put(s, BEAR, 1, "battlefield"), rock = put(s, TRINKET, 0, "battlefield");
  const match = compileSelector({what: "permanent", controller: "you", anyOf: [{types: ["Creature"]}, {types: ["Planeswalker"]}]});
  eq([bear, walker, hers, rock].map((id) => match(s, id, {controller: 0})), [true, true, false, false], "a creature or planeswalker Rob controls: his Bear and Walker, not Maya's Bear or his Trinket");
}
{
  /* "Attach it": what the trigger is about -- or nothing, never the ability's own source. */
  const s = table();
  const aid = put(s, card("Sigarda's Aid"), 0, "battlefield");
  const bear = put(s, BEAR, 0, "battlefield");
  const blade = put(s, {...TRINKET, card: "Blade", subtypes: ["Equipment"]}, 0, "battlefield");
  beginResolution(s, [{effect: "attach", source: "that card", targets: [bear]}], {controller: 0, source: aid, about: {card: blade}});
  eq([s.objects[blade].attachedTo, s.objects[aid].attachedTo ?? null], [bear, null], "the Blade attached to the Bear");
  const t = table();
  const aid2 = put(t, card("Sigarda's Aid"), 0, "battlefield");
  const bear2 = put(t, BEAR, 0, "battlefield");
  beginResolution(t, [{effect: "attach", source: "that card", targets: [bear2]}], {controller: 0, source: aid2, about: {}});
  eq(t.objects[aid2].attachedTo ?? null, null, "nothing to attach: Sigarda's Aid is not attached in its place");
}
{
  eq([missingFor({statics: ["CastWithFlash"]}), missingFor({apis: ["SacrificeAll"]})], [[], []], "the catalog credits both");
}

console.log(`engine-flash-sacrifice: ${checks} checks passed — flash by permission, the controller's, for what it describes; sacrificed all at once; keep up to two; the greatest; any of these; attach it.`);
