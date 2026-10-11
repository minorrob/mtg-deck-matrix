/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ASKING WHAT AN ADVENTURER CARD MAY DO CHANGES NOTHING (CR 715.3a; Train C phase 2, found by tests/engine-derive-once.mjs
 * once the card pool it draws from changed).
 *
 * An adventurer card is weighed as its Adventure for an offer and shown as itself again after (rules/actions.mjs,
 * withAdventure; state/index.mjs, showAdventure). Shown back, it must be exactly as it was: an object keeps no empty
 * subtypes, supertypes or colors (state/index.mjs, addObject -- "present only on a card that has them"), and An Unexpected
 * Party, an enchantment with no subtype, came back with `subtypes: []` -- the same card, but another state, so asking what
 * may be done changed the game's hash (CR 715.4 is about characteristics; the journal's hash is about the state).
 */
import {legalActions} from "../game/engine/rules/actions.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {showAdventure, addObject} from "../game/engine/state/index.mjs";
import {play, at, checks} from "./helpers/x11-keywords.mjs";

const {eq, done} = checks("engine-adventure-asking");
const PARTY = "An Unexpected Party // At the Door";
const party = (s, seat) => s.zones.hand[seat].find((h) => s.objects[h].card === "An Unexpected Party");

for (const seat of [0, 1]) {
  /* Rob's main phase, and Maya's: the Adventure, an instant, is offered on either. */
  const s = play([at(seat, "hand", PARTY), at(seat, "battlefield", "Plains", "Plains", "Wastes", "Wastes")], seat === 1 ? [{to: {turn: 2, phase: "MAIN1"}}] : []);
  const id = party(s, seat), before = JSON.stringify(s.objects[id]), hash = hashState(s);
  eq("subtypes" in s.objects[id], false, `${["Rob", "Maya"][seat]}'s Party: no subtypes, and so none kept`);
  legalActions(s, s.priorityPlayer);
  eq([hashState(s), JSON.stringify(s.objects[id])], [hash, before], "asked what may be done: the game as it was, the card key for key");
  showAdventure(s, id, true);
  eq(s.objects[id].subtypes, ["Adventure"], "shown as its Adventure: an Adventure instant");
  showAdventure(s, id, false);
  eq(JSON.stringify(s.objects[id]), before, "and shown as itself again, exactly as it was");
}

{
  /* A colorless artifact with no supertype, its Adventure a blue legendary one: each empty array absent again. */
  const s = play([], [], {});
  const main = {card: "Odd Engine", types: ["Artifact"], subtypes: [], supertypes: [], colors: [], manaCost: "{3}", power: null, toughness: null, abilities: [], keywords: []};
  const adventure = {card: "Odd Errand", types: ["Instant"], subtypes: ["Adventure"], supertypes: ["Legendary"], colors: ["U"], manaCost: "{U}", power: null, toughness: null, abilities: [], keywords: []};
  const id = addObject(s, {...main, adventurer: {main, adventure}, owner: 0, controller: 0}, "hand", 0);
  const before = JSON.stringify(s.objects[id]);
  showAdventure(s, id, true);
  eq([s.objects[id].colors, s.objects[id].supertypes, s.objects[id].subtypes], [["U"], ["Legendary"], ["Adventure"]], "shown as its Adventure: blue, legendary, an Adventure");
  showAdventure(s, id, false);
  eq(JSON.stringify(s.objects[id]), before, "and as itself again: no colors, no supertypes, no subtypes kept empty");
}

done("asking what an adventurer card may do changes nothing: shown as itself again, it keeps no empty subtypes, as no object does.");
