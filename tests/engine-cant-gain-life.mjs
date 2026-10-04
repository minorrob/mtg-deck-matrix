/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "CAN'T GAIN LIFE" (Rob's Priority Batch 10.3, its twenty-sixth slice: Archfiend of Despair).
 *
 * CR 119.7: a player an effect says can't gain life gains none, whatever would have given it some. A permanent's static
 * ability says whom (rules/statics.mjs, `cant-gain-life`): "your opponents" (Archfiend of Despair), or "players" (Rampaging
 * Ferocidon) -- a player selector read from its controller's side. It is read wherever life is gained: an effect's gain and
 * noncombat lifelink, both through changeLife (script/effects/resources.mjs), and lifelink in combat (rules/combat.mjs).
 * Nothing is gained, so nothing says it was ("whenever you gain life" does not trigger), and nothing is counted as gained
 * this turn.
 *
 * The card scenarios play the cards: a gain refused, lifelink in combat refused, the Archfiend's own controller still
 * gaining. This suite holds the reader, a loss still taken, the turn's record, noncombat lifelink, the permanent leaving,
 * and the schema.
 */
import assert from "node:assert/strict";
import {cantGainLife} from "../game/engine/rules/statics.mjs";
import {changeLife, dealDamage} from "../game/engine/script/effects/resources.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Linker: {types: ["Creature"], subtypes: ["Cleric"], manaCost: "{1}{W}", colors: ["W"], power: 2, toughness: 2, keywords: ["Lifelink"]},
  /* "As long as you control an artifact, your opponents can't gain life": the rule under a condition. */
  Ward: {types: ["Enchantment"], manaCost: "{B}", colors: ["B"], abilities: [{id: "a0", kind: "static", text: "As long as you control an artifact, your opponents can't gain life.",
    rule: "cant-gain-life", affects: {what: "player", who: "opponent"}, condition: {present: {what: "permanent", types: ["Artifact"], controller: "you"}}}]},
  Rock: {types: ["Artifact"], manaCost: "{1}", colors: []}};
const play = (setup) => runScenario({name: "board", setup, steps: []}, index.definition, FIX).state;
const named = (s, card) => Object.values(s.objects).find((o) => o.card === card && o.zone === "battlefield");

{
  const s = play([at(0, "battlefield", "Archfiend of Despair")]);
  eq([cantGainLife(s, 0), cantGainLife(s, 1)], [false, true], "Rob's Archfiend: Rob's opponents can't gain life; Rob can");
  const events = [];
  changeLife(s, 1, 5, events);
  eq([s.players[1].life, events.length, s.players[1].gainedThisTurn ?? 0], [40, 0, 0], "Maya's 5 life: not gained, not said to be, not counted as gained this turn");
  changeLife(s, 1, -3, events);
  eq([s.players[1].life, events.length, s.players[1].lostThisTurn], [37, 1, 3], "a loss is still taken, and counted");
  changeLife(s, 0, 2, events);
  eq(s.players[0].life, 42, "Rob gains as usual");
  moveOne(s, named(s, "Archfiend of Despair").id, "graveyard", []);
  changeLife(s, 1, 5, []);
  eq([cantGainLife(s, 1), s.players[1].life], [false, 42], "the Archfiend gone: Maya gains again");
}
{
  const s = play([at(0, "battlefield", "Rampaging Ferocidon")]);
  eq([cantGainLife(s, 0), cantGainLife(s, 1)], [true, true], "Rampaging Ferocidon: players can't gain life -- its controller too");
}
{
  eq([cantGainLife(play([at(0, "battlefield", "Ward")]), 1), cantGainLife(play([at(0, "battlefield", "Ward", "Rock")]), 1)], [false, true],
    "under a condition: with no artifact Maya may gain life; with Rob's Rock, not");
}
{
  /* Lifelink outside combat goes through changeLife too (CR 702.15b): the damage is dealt, no life gained. */
  const s = play([at(0, "battlefield", "Archfiend of Despair"), at(1, "battlefield", "Linker")]);
  const linker = named(s, "Linker");
  dealDamage(s, {amount: 2, who: [0]}, {controller: 1, source: linker.id});
  eq([s.players[0].life, s.players[1].life], [38, 40], "Maya's lifelinking Linker deals Rob 2 outside combat: Rob loses 2, Maya gains nothing");
}
{
  const script = (affects) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Enchantment"], manaCost: "{B}", colors: ["B"]},
    oracleText: "Your opponents can't gain life.", source: "hand", abilities: [{kind: "static", text: "Your opponents can't gain life.", rule: "cant-gain-life", affects}]});
  eq(compileScript(script({what: "player", who: "opponent"})).problems, [], "a static ability may say who can't gain life");
}
eq(missingFor({statics: ["CantGainLife"]}), [], "the catalog credits the static (Forge's CantGainLife)");
for (const name of ["Archfiend of Despair", "Rampaging Ferocidon"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-cant-gain-life: ${checks} checks passed -- "can't gain life" for the players a permanent names: no gain, no event, nothing counted; losses still taken; lifelink in and out of combat gains nothing; over when the permanent leaves.`);
