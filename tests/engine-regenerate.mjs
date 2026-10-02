/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 28 (THE CATALOG'S ORDER): REGENERATE (CR 701.19a).
 *
 * A regeneration shield replaces the next destruction this turn: instead, all damage marked on the permanent is removed,
 * it is tapped, and if it is attacking or blocking it is removed from combat. Destruction is a destroy effect, lethal
 * damage, or deathtouch damage; toughness zero or less and a sacrifice are not, and a shield does nothing for them. One
 * shield, one destruction; shields left at the end of the turn are gone. "It can't be regenerated" destroys anyway.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const creature = (name, power = 2, extra = {}) => ({card: name, types: ["Creature"], manaCost: "{1}", power, toughness: power, ...extra});
const pod = {matchId: "m", seed: "regenerate", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const ctx = {controller: 0, source: null};
const shield = (s, ids) => beginResolution(s, [{effect: "regenerate", targets: ids}], ctx);
const there = (s, id) => Boolean(s.objects[id]);
const shields = (s) => (s.effects ?? []).filter((e) => e.rule === "regeneration").length;

{
  const s = table();
  const bear = on(s, creature("Bear"), 0);
  main(s);
  s.objects[bear].damage = 1;
  shield(s, [bear]);
  beginResolution(s, [{effect: "destroy", targets: [bear]}], ctx);
  eq([there(s, bear), s.objects[bear].tapped, s.objects[bear].damage, shields(s)], [true, true, 0, 0], "a shielded Bear destroyed: it stays, tapped, its damage removed, and the shield is used up");
  beginResolution(s, [{effect: "destroy", targets: [bear]}], ctx);
  eq(there(s, bear), false, "destroyed again: no shield left, it dies");
}
{
  const s = table();
  const bear = on(s, creature("Bear"), 0), wolf = on(s, creature("Wolf"), 0);
  main(s);
  shield(s, [bear, wolf]); shield(s, [bear]);
  s.objects[bear].damage = 2; s.objects[wolf].damage = 1; s.objects[wolf].deathtouched = true;
  checkStateBasedActions(s);
  eq([there(s, bear), there(s, wolf), s.objects[bear]?.damage, shields(s)], [true, true, 0, 1], "lethal damage and deathtouch damage are destruction: each shield saves one, and the Bear's second shield is still there");
}
{
  const s = table();
  const ghost = on(s, creature("Ghost"), 0), imp = on(s, creature("Imp"), 0);
  main(s);
  shield(s, [ghost, imp]);
  beginResolution(s, [{effect: "pump", targets: [ghost], power: -2, toughness: -2}], ctx);
  const sba = checkStateBasedActions(s);
  eq(sba.some((e) => e.kind === "GameEventCardRegenerated"), false, "toughness 0: nothing is regenerated -- the shield is not even spent on it");
  beginResolution(s, [{effect: "moveZone", targets: [imp], to: "graveyard"}], ctx);
  eq([there(s, ghost), there(s, imp)], [false, false], "toughness 0 (704.5f) and being put into the graveyard are not destruction: a shield saves neither");
}
{
  /* "They can't be regenerated" -- Terminate, Putrefy -- destroys anyway; a wipe regenerates whatever has a shield. */
  const s = table();
  const bear = on(s, creature("Bear"), 0), wolf = on(s, creature("Wolf"), 1), elf = on(s, creature("Elf", 1), 1);
  main(s);
  shield(s, [bear, wolf]);
  beginResolution(s, [{effect: "destroy", targets: [bear], noRegenerate: true}], ctx);
  eq(there(s, bear), false, "\"can't be regenerated\": the shielded Bear is destroyed at once");
  beginResolution(s, [{effect: "destroyAll", selector: {what: "permanent", types: ["Creature"]}}], ctx);
  eq([there(s, bear), there(s, wolf), there(s, elf)], [false, true, false], "\"can't be regenerated\": the shielded Bear dies anyway; then a wipe: the shielded Wolf stays, the Elf without one dies");
}
{
  /* Removed from combat; and a shield does not outlive its turn. */
  const s = table();
  const bear = on(s, creature("Bear"), 0), wall = on(s, creature("Wall", 0, {toughness: 5}), 1);
  main(s);
  s.combat = {attacks: [{attacker: bear, defender: 1, blockers: [wall]}]};
  shield(s, [bear]);
  beginResolution(s, [{effect: "destroy", targets: [bear]}], ctx);
  eq((s.combat.attacks ?? []).some((a) => a.attacker === bear), false, "a regenerated attacker is removed from combat");
  s.combat = null;
  shield(s, [wall]);
  for (let n = 0; n < 400 && !(s.turn === 2 && s.phase === "MAIN1"); n += 1) {
    if (s.awaiting) { resolveAwaiting(s, s.awaiting.kind === "order-triggers" ? awaitingChoice(s).options.map((o) => o.index) : []); continue; }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  eq(shields(s), 0, "a shield left at the end of the turn is gone (it was \"this turn\")");
}

console.log(`engine-regenerate: ${checks} checks passed — a shield replaces the next destruction this turn (destroy, lethal damage, deathtouch): tapped, damage removed, out of combat; not toughness 0 or a sacrifice; one shield each; "can't be regenerated"; gone at the turn's end.`);
