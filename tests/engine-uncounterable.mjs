/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 22 (THE CATALOG'S ORDER): CAN'T BE COUNTERED.
 *
 * Countering a spell removes it from the stack (CR 701.6a). A spell that can't be countered stays: the counter effect
 * does nothing to it (CR 101.2, "can't" beats "can"), though it was a legal target and the counterspell still resolves.
 * "This spell can't be countered" is the spell's own, read while it is on the stack; "creature spells you control can't
 * be countered" is a permanent's, over the spells it describes -- yours, of that kind, and no one else's.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const pod = {matchId: "m", seed: "uncounterable", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const fill = (s, seat, pool) => { Object.assign(s.players[seat].manaPool, pool); };
/* Cast by name (the first legal way), and the stack entry it made. */
function cast(s, seat, name, pool) {
  if (pool) fill(s, seat, pool);
  applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "cast" && a.label === name));
  return s.stack[s.stack.length - 1];
}
/* A counter effect aimed at the spell: whether it is still on the stack afterwards. */
const survives = (s, entry) => {
  beginResolution(s, [{effect: "counterSpell", spells: [entry.objectId]}], {controller: 1, source: null});
  return s.stack.some((e) => e.stackId === entry.stackId);
};
const creature = (name, cost = "{1}", extra = {}) => ({card: name, types: ["Creature"], manaCost: cost, power: 2, toughness: 2, ...extra});

{
  const s = table();
  on(s, creature("Bear"), 1);
  on(s, card("Void Rend"), 0, "hand");
  on(s, {card: "Murder", types: ["Instant"], manaCost: "{B}", spell: {id: "s", text: "x", targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "destroy", targets: {target: 0}}]}}, 0, "hand");
  main(s);
  const rend = cast(s, 0, "Void Rend", {W: 1, U: 1, B: 1});
  const murder = cast(s, 0, "Murder", {B: 1});
  eq([survives(s, rend), survives(s, murder)], [true, false], "\"This spell can't be countered\": Void Rend stays on the stack; Murder beside it is countered");
}
{
  const s = table();
  on(s, card("Surrak Dragonclaw"), 0);
  on(s, creature("Bear"), 0, "hand"); on(s, {card: "Peek", types: ["Instant"], manaCost: "{C}", spell: {id: "s", text: "x", targets: [], effects: [{effect: "draw", count: 1}]}}, 0, "hand");
  on(s, creature("Wolf"), 1, "hand");
  main(s);
  const bear = cast(s, 0, "Bear", {C: 1});
  const peek = cast(s, 0, "Peek", {C: 1});
  eq([survives(s, bear), survives(s, peek)], [true, false], "Surrak Dragonclaw: Rob's creature spell can't be countered; his instant can");
}
{
  const s = table();
  on(s, card("Thryx, the Sudden Storm"), 0);
  on(s, creature("Giant", "{5}"), 0, "hand"); on(s, creature("Ogre", "{4}", {keywords: ["Flash"]}), 0, "hand");   /* flash: cast with the Giant still on the stack */
  main(s);
  fill(s, 0, {C: 4});
  const giant = cast(s, 0, "Giant");
  eq(s.players[0].manaPool.C, 0, "Thryx: the mana value 5 Giant costs {1} less -- four mana paid it");
  const ogre = cast(s, 0, "Ogre", {C: 4});
  eq([survives(s, giant), survives(s, ogre)], [true, false], "and can't be countered; the mana value 4 Ogre can be");
}
{
  const s = table();
  on(s, card("Allosaurus Shepherd"), 0);
  on(s, creature("Bear", "{G}", {colors: ["G"]}), 0, "hand"); on(s, creature("Imp", "{R}", {colors: ["R"], keywords: ["Flash"]}), 0, "hand");
  main(s);
  const bear = cast(s, 0, "Bear", {G: 1});
  const imp = cast(s, 0, "Imp", {R: 1});
  eq([survives(s, bear), survives(s, imp)], [true, false], "Allosaurus Shepherd: Rob's green spell can't be countered; his red one can");
}
{
  const s = table();
  on(s, card("Destiny Spinner"), 0);
  on(s, {card: "Shrine", types: ["Enchantment"], manaCost: "{C}"}, 0, "hand"); on(s, {card: "Rock", types: ["Artifact"], manaCost: "{C}", keywords: ["Flash"]}, 0, "hand");
  main(s);
  const shrine = cast(s, 0, "Shrine", {C: 1});
  const rock = cast(s, 0, "Rock", {C: 1});
  eq([survives(s, shrine), survives(s, rock)], [true, false], "Destiny Spinner: Rob's enchantment spell can't be countered; his artifact can");
}
{
  /* Only the controller's: Maya's creature spell under Rob's Surrak is counterable. */
  const s = table();
  on(s, card("Surrak Dragonclaw"), 0);
  on(s, creature("Wolf"), 1, "hand");
  main(s);
  s.priorityPlayer = 1; s.activePlayer = 1;
  const wolf = cast(s, 1, "Wolf", {C: 1});
  eq(survives(s, wolf), false, "Maya's creature spell is not Rob's: Surrak's ability doesn't protect it");
}

console.log(`engine-uncounterable: ${checks} checks passed — "this spell can't be countered" stays on the stack; "creature / green / enchantment / mana value 5 or greater spells you control can't be countered", for that controller's spells of that kind only.`);
