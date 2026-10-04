/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* PROTECTION (CR 702.16): "You and creatures you control have protection from the chosen card type" (Serra's Emissary; the
 * live-game plan of 2026-10-04, lane W6). rules/protection.mjs, and the four places it is read -- DEBT:
 *   damage from a source with the quality prevented   rules/replacement.mjs (a player's too, CR 702.16j)
 *   enchanted or equipped by one, it cannot be         rules/sba.mjs, effects/permanents.mjs attach
 *   blocked by one, it cannot be                       keywords/combat.mjs canBlockAttacker
 *   targeted by a spell or ability from one, never     script/filter.mjs (a permanent, a player)
 * A permanent that has chosen nothing protects from nothing.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {protectedFrom} from "../game/engine/rules/protection.mjs";
import {canBlockAttacker} from "../game/engine/keywords/combat.mjs";
import {matchesSelector} from "../game/engine/script/filter.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {attachTo} from "../game/engine/script/effects/permanents.mjs";
import {addObject} from "../game/engine/state/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const SE = "Serra's Emissary";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
/* The Emissary set on the battlefield with its choice already made. */
function table(chosen, setup = []) {
  const s = runScenario({name: "protection", setup: [at(0, "battlefield", SE, "Bear"), at(1, "battlefield", "Bear"), ...setup]}, index.definition, FIX).state;
  const emissary = s.zones.battlefield.find((id) => s.objects[id].card === SE);
  if (chosen !== undefined) s.objects[emissary].chosen = chosen;
  return s;
}
const idOf = (s, card, seat) => s.zones.battlefield.find((id) => s.objects[id].card === card && s.objects[id].controller === seat);

/* ---- who has it, from what ---- */
{
  const s = table("Creature");
  const [robBear, mayaBear, emissary] = [idOf(s, "Bear", 0), idOf(s, "Bear", 1), idOf(s, SE, 0)];
  eq([protectedFrom(s, {card: robBear}, mayaBear), protectedFrom(s, {card: emissary}, mayaBear), protectedFrom(s, {player: 0}, mayaBear)], [true, true, true],
    "Creature: Rob's Bear, the Emissary and Rob, from Maya's Bear");
  eq([protectedFrom(s, {card: mayaBear}, robBear), protectedFrom(s, {player: 1}, robBear)], [false, false], "Maya and Maya's Bear have none");
  const t = table(undefined);
  eq(protectedFrom(t, {card: idOf(t, "Bear", 0)}, idOf(t, "Bear", 1)), false, "nothing chosen yet: nothing protected from");
  const u = table("Instant");
  eq(protectedFrom(u, {card: idOf(u, "Bear", 0)}, idOf(u, "Bear", 1)), false, "Instant: a creature is no instant");
}
/* ---- damage ---- */
{
  const s = table("Creature");
  const [robBear, mayaBear] = [idOf(s, "Bear", 0), idOf(s, "Bear", 1)];
  runEffect(s, {effect: "dealDamage", amount: 3, targets: [robBear]}, {controller: 1, source: mayaBear});
  runEffect(s, {effect: "dealDamage", amount: 3, who: [0]}, {controller: 1, source: mayaBear});
  eq([s.objects[robBear].damage, s.players[0].life], [0, 40], "damage from a creature: none to Rob's Bear, none to Rob");
  runEffect(s, {effect: "dealDamage", amount: 3, targets: [mayaBear]}, {controller: 0, source: robBear});
  eq(s.objects[mayaBear].damage, 3, "Rob's Bear's damage to Maya's: dealt");
}
/* ---- blocking ---- */
{
  const s = table("Creature");
  eq([canBlockAttacker(s, idOf(s, "Bear", 1), idOf(s, "Bear", 0)), canBlockAttacker(s, idOf(s, "Bear", 0), idOf(s, "Bear", 1))], [false, true],
    "Maya's Bear can't block Rob's; Rob's can block Maya's");
}
/* ---- targeting ---- */
{
  const s = table("Instant", [at(1, "hand", "Lightning Bolt")]);
  const bolt = s.zones.hand[1].find((id) => s.objects[id].card === "Lightning Bolt");
  const spellAt = (id, what) => matchesSelector({what, target: true}, s, id, {controller: 1, source: bolt});
  eq([spellAt(idOf(s, "Bear", 0), "permanent"), spellAt(0, "player"), spellAt(idOf(s, "Bear", 1), "permanent"), spellAt(1, "player")], [false, false, true, true],
    "Instant: Maya's Bolt can target neither Rob nor Rob's Bear, and still Maya and Maya's Bear");
}
/* ---- enchanted and equipped ---- */
{
  const s = table("Enchantment");
  const robBear = idOf(s, "Bear", 0);
  const armor = addObject(s, {...structuredClone(index.definition("Blanchwood Armor")), card: "Blanchwood Armor", owner: 1, controller: 1}, "battlefield", null);
  attachTo(s, armor, robBear);
  checkStateBasedActions(s);
  eq(s.objects[armor]?.zone ?? "gone", "gone", "Enchantment: Maya's Aura on Rob's Bear is put into the graveyard");
  const t = table("Artifact", [at(0, "battlefield", "Behemoth Sledge")]);
  const sledge = idOf(t, "Behemoth Sledge", 0), bear = idOf(t, "Bear", 0);
  runEffect(t, {effect: "attach", targets: [bear]}, {controller: 0, source: sledge});
  eq(t.objects[sledge].attachedTo ?? null, null, "Artifact: Rob's own Sledge does not attach to Rob's Bear");
  t.objects[sledge].attachedTo = bear; t.objects[bear].attachments = [sledge];
  checkStateBasedActions(t);
  eq(t.objects[sledge].attachedTo, null, "and attached anyway, it comes off, and stays on the battlefield");
}
ok(index.resolve(SE)?.playable === true, `${SE} is defined and playable`);

console.log(`engine-protection: ${checks} checks passed -- protection from a card type: damage prevented, not enchanted or equipped, not blocked, not targeted, for permanents and their controller; nothing before the choice.`);
