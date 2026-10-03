/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 53 (THE CATALOG'S ORDER): UNTAPPING DURING OTHER PLAYERS' UNTAP STEPS (Forge's UntapOtherPlayer) AND
 * "CHOOSE A CREATURE TYPE" (Forge's ChooseType).
 *
 * A static of a player who is not the active one untaps what it names in that untap step -- only its controller's, only
 * what it describes. "Choose a creature type": one of the creature types among the cards in the game, from any zone; with
 * none, no question; and the effects after it name the choice as "$chosen", in a selector or a count -- before anything
 * is chosen, it matches nothing.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {untapsDuringOthers} from "../game/engine/rules/statics.mjs";
import {bindEffect} from "../game/engine/script/bind.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const table = () => createState({matchId: "m", seed: "untap-choose-type", players: [{name: "Rob"}, {name: "Maya"}]});
const put = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
const ROCK = {card: "Rock", types: ["Artifact"]}, BEAR = {card: "Bear", types: ["Creature"], subtypes: ["Bear"], power: 2, toughness: 2};

{
  /* Maya's turn: Rob's Seedborn Muse untaps his; Maya's own Muse would untap hers -- but it is her turn anyway, so the
     question is never asked of the active player's. */
  const s = table();
  put(s, card("Seedborn Muse"), 0);
  const mine = put(s, ROCK, 0), hers = put(s, ROCK, 1);
  s.activePlayer = 1;
  eq([untapsDuringOthers(s, mine), untapsDuringOthers(s, hers)], [true, false], "Maya's untap step: Rob's Rock yes; hers is untapped as hers, not by his Muse");
  s.activePlayer = 0;
  eq(untapsDuringOthers(s, mine), false, "his own turn: the ordinary untap, not this");
  /* Maya's Muse is hers: on her turn it does nothing for Rob's Rock. */
  const u = table();
  put(u, card("Seedborn Muse"), 1);
  const robs = put(u, ROCK, 0);
  u.activePlayer = 1;
  eq(untapsDuringOthers(u, robs), false, "Maya's Muse, Maya's turn: Rob's Rock stays tapped");
  /* What it describes: Unwinding Clock's artifacts; Bender's Waterskin itself. */
  const t = table();
  put(t, card("Unwinding Clock"), 0);
  const rock = put(t, ROCK, 0), bear = put(t, BEAR, 0);
  const skin = put(t, card("Bender's Waterskin"), 0), otherRock = put(t, ROCK, 1);
  t.activePlayer = 1;
  eq([untapsDuringOthers(t, rock), untapsDuringOthers(t, bear), untapsDuringOthers(t, skin), untapsDuringOthers(t, otherRock)], [true, false, true, false],
    "the Clock: his Rock and the Waterskin (an artifact too), not his Bear, not Maya's Rock");
}
{
  /* The creature types among the cards in the game, from any zone; chosen, "$chosen" names it. */
  const s = table();
  put(s, {...BEAR, card: "Elf", subtypes: ["Elf", "Druid"]}, 0);
  put(s, {...BEAR, card: "Goblin", subtypes: ["Goblin"]}, 1, "graveyard");
  put(s, {card: "Tribal", types: ["Kindred", "Instant"], subtypes: ["Merfolk"]}, 0, "hand");
  put(s, {card: "Forest", types: ["Land"], subtypes: ["Forest"]}, 0);
  beginResolution(s, [{effect: "chooseType"}, {effect: "gainLife", amount: {count: {what: "permanent", subtypes: ["$chosen"]}}}], {controller: 0, source: null});
  eq(awaitingChoice(s).options.map((o) => o.label), ["Druid", "Elf", "Goblin", "Merfolk"], "Druid, Elf, Goblin, Merfolk -- a Forest is no creature type");
  resolveAwaiting(s, [1]);
  eq(s.players[0].life, 41, "Elf chosen: one Elf on the battlefield, 1 life");
  const t = table();
  put(t, {card: "Forest", types: ["Land"], subtypes: ["Forest"]}, 0);
  beginResolution(t, [{effect: "chooseType"}, {effect: "gainLife", amount: 1}], {controller: 0, source: null});
  eq([t.awaiting, t.players[0].life], [null, 41], "no creature card anywhere: nothing to ask, and the rest goes on");
  eq(bindEffect({effect: "destroyAll", selector: {nonSubtypes: ["$chosen"]}}, {}).selector.nonSubtypes[0] === "$chosen", false, "before anything is chosen, \"$chosen\" names no type at all");
}
{
  eq(missingFor({statics: ["UntapOtherPlayer"], apis: ["ChooseType"]}), [], "the catalog credits both");
}

console.log(`engine-untap-choose-type: ${checks} checks passed — another player's untap step untaps what a static names, only its controller's; a creature type chosen from the game's cards, named after as "$chosen".`);
