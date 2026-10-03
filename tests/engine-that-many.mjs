/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 26 (THE CATALOG'S ORDER): "THAT MANY" -- THE DAMAGE DEALT (CR 120.3).
 *
 * A damage trigger is about the source, the player or creature dealt the damage, and how much: "create that many
 * Treasure tokens", "you draw that many cards", "that source's controller sacrifices that many permanents". "Noncombat
 * damage" is told apart from combat damage; "a source you control" may be a spell; "each creature that player controls"
 * and "each other opponent" are read from the player the trigger is about. Damage prevented in full is no damage, and
 * triggers nothing (CR 615.4).
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const creature = (name, power = 2, extra = {}) => ({card: name, types: ["Creature"], manaCost: "{1}", power, toughness: power, ...extra});
const pod = {matchId: "m", seed: "that-many", players: [{name: "Rob"}, {name: "Maya"}, {name: "Trey"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 3; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
/* Damage dealt by `source` (controlled by `controller`), and what it triggers; then that trigger's effects run with what
   it is about. */
function hit(s, effect, controller, source) {
  s.pendingTriggers = [];
  collectTriggers(s, runEffects(s, [effect], {controller, source}));
  return s.pendingTriggers;
}
/* Combat damage to a player, as combat announces it (rules/combat.mjs), for the triggers that want combat damage. */
function combatHit(s, source, player, amount) {
  s.pendingTriggers = [];
  const o = s.objects[source];
  collectTriggers(s, [{kind: "GameEventPlayerDamaged", data: {turn: s.turn, phase: s.phase, fields: {source: {cardId: source, name: o.card, owner: o.owner, controller: o.controller},
    target: {playerId: player, name: s.players[player].name}, amount, combat: true, infect: false}}}]);
  return s.pendingTriggers;
}
const fire = (s, trigger) => beginResolution(s, trigger.script.effects, {controller: trigger.controller, source: trigger.source.cardId, about: trigger.about});
const named = (s, name) => Object.keys(s.objects).map(Number).filter((id) => s.objects[id].card === name && s.objects[id].zone === "battlefield");

{
  const s = table();
  on(s, card("Old Gnawbone"), 0);
  const ogre = on(s, creature("Ogre", 3), 0);
  main(s);
  eq(hit(s, {effect: "dealDamage", amount: 5, who: [1]}, 0, ogre).length, 0, "Old Gnawbone wants combat damage: an ability's 5 damage triggers nothing");
  const [t] = combatHit(s, ogre, 1, 5);
  eq(t?.about, {card: ogre, player: 1, amount: 5}, "the Ogre's 5 combat damage to Maya: the trigger is about the Ogre, Maya, and 5");
  fire(s, t);
  eq(named(s, "Treasure").length, 5, "and creates that many Treasures: five");
}
{
  /* Combat only, for Old Gnawbone; the scenario shows combat. Niv-Mizzet, Visionary wants the other kind. */
  const s = table();
  on(s, card("Niv-Mizzet, Visionary"), 0);
  const imp = on(s, creature("Imp"), 0), theirs = on(s, creature("Wolf"), 1);
  const spell = addObject(s, {card: "Shock", types: ["Instant"], owner: 0, controller: 0}, "stack", null);
  main(s);
  eq(hit(s, {effect: "dealDamage", amount: 2, who: [1]}, 0, spell).map((t) => t.about.amount), [2], "a spell of Rob's deals 2 noncombat damage to Maya: Niv-Mizzet triggers, that many 2");
  eq(hit(s, {effect: "dealDamage", amount: 2, who: [0]}, 0, imp).length, 0, "to Rob himself: not to an opponent, nothing");
  eq(combatHit(s, imp, 1, 2).length, 0, "Rob's Imp dealing 2 combat damage to Maya: combat damage, not noncombat -- nothing");
  eq(hit(s, {effect: "dealDamage", amount: 2, who: [2]}, 1, theirs).length, 0, "Maya's Wolf dealing damage to Trey: not a source Rob controls, nothing");
}
{
  const s = table();
  const obliterator = on(s, card("Phyrexian Obliterator"), 0);
  const wolf = on(s, creature("Wolf"), 1);
  main(s);
  const [t] = hit(s, {effect: "dealDamage", amount: 3, targets: [obliterator]}, 1, wolf);
  eq(t.about, {card: wolf, player: 1, amount: 3}, "Maya's Wolf deals 3 to Phyrexian Obliterator: about the Wolf, its controller Maya, and 3");
  const bystander = on(s, creature("Bystander", 4), 0);
  eq(hit(s, {effect: "dealDamage", amount: 3, targets: [bystander]}, 1, wolf).length, 0, "the Wolf dealing damage to another creature of Rob's: not to this one, nothing");
  beginResolution(s, [{effect: "effectUntil", rule: "prevent-damage", targets: [obliterator], apply: {to: true}, until: "end-of-turn"}], {controller: 0, source: null});
  eq(hit(s, {effect: "dealDamage", amount: 3, targets: [obliterator]}, 1, wolf).length, 0, "the same damage prevented in full is no damage, and triggers nothing (CR 615.4)");
}
{
  const s = table();
  const dragon = on(s, card("Balefire Dragon"), 0);
  const mine = on(s, creature("Bear"), 0), hers = on(s, creature("Ogre", 3), 1), his = on(s, creature("Ogre", 3), 2);
  main(s);
  const [t] = combatHit(s, dragon, 1, 6);
  fire(s, t);
  eq([s.objects[mine].damage, s.objects[hers].damage, s.objects[his].damage], [0, 6, 0], "Balefire Dragon's 6: to each creature that player -- Maya -- controls; not Rob's, not Trey's");
}
{
  const s = table();
  const bear = on(s, creature("Bear", 2, {keywords: ["Lifelink"]}), 0);
  main(s);
  /* An Aura enchanting nothing is put into the graveyard (CR 704.5m): put down, and attached, in one moment. */
  const state = on(s, card("Super State"), 0);
  s.objects[state].attachedTo = bear; s.objects[bear].attachments = [state];
  const effects = s.objects[state].abilities.find((a) => a.kind === "triggered").effects;
  fire(s, {controller: 0, source: {cardId: state}, about: {card: bear, player: 1, amount: 9}, script: {effects}});
  eq(s.players.map((p) => p.life), [49, 40, 31], "Super State: 9 to Maya, so 9 to each OTHER opponent -- Trey -- none to Maya again; and the enchanted creature deals it, so its lifelink gains Rob 9");
}

console.log(`engine-that-many: ${checks} checks passed — a damage trigger is about how much; noncombat told from combat, a spell as a source you control; that source's controller; that player's creatures; each other opponent; prevented damage triggers nothing.`);
