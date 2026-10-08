/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN B (X11), THE LAST CARDS -- COUNTS AND TRIGGERS: what the cards' scenarios cannot reach.
 *
 *   "target creature that was dealt damage this turn" (Mirrodin Avenged; CR 120.3): the selector `dealtDamageThisTurn`,
 *     recorded where every damage to a permanent lands (effects/resources.mjs, damagePermanent)
 *   "for each other attacking creature that shares a creature type with it" (Shared Animosity): selectors relative to
 *     what a trigger is about, `otherThan` and `sharesCreatureTypeWith`
 *   "for each nontoken creature you controlled that was destroyed this way" (Ceaseless Conflict): destroyAll's `movedWas`,
 *     read by the amount `movedCount` as each last existed (CR 608.2h)
 *
 * Three and four players throughout, where whose it is matters.
 */
import {checks, creature} from "./helpers/train-b6.mjs";
import {createState, addObject, moveObject} from "../game/engine/state/index.mjs";
import {compileSelector, selectMatching} from "../game/engine/script/filter.mjs";
import {dealDamage, damagePermanent} from "../game/engine/script/effects/resources.mjs";
import {destroyAll} from "../game/engine/script/effects/zones.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {loadCardIndex, loadCardScripts} from "../game/tools/engine-cards.mjs";
import {smokeTest} from "../game/engine/cards/compile.mjs";

const t = checks("engine-x11-counts-triggers");
const table = (seats = 4) => createState({matchId: "x11", seed: "x11", players: ["Rob", "Maya", "Trey", "Sam"].slice(0, seats).map((name) => ({name}))});
const put = (s, object, seat, zone = "battlefield", controller = seat) => addObject(s, {...object, owner: seat, controller}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
const index = loadCardIndex();

/* ---- "was dealt damage this turn" (CR 120.3) ---- */
{
  const s = table();
  const bear = put(s, creature("Bear", 2, 2), 1), wall = put(s, creature("Wall", 0, 4), 1), elf = put(s, creature("Elf", 1, 1), 2);
  const walker = put(s, {card: "Walker", types: ["Planeswalker"], manaCost: "{3}"}, 3);
  s.objects[walker].counters.loyalty = 5;
  const damaged = {what: "permanent", types: ["Creature"], dealtDamageThisTurn: true};
  t.eq(selectMatching(s, damaged, {controller: 0}), [], "nothing has been dealt damage yet this turn");
  dealDamage(s, {amount: 1, targets: [wall]}, {controller: 0, source: null});
  t.eq(selectMatching(s, damaged, {controller: 0}), [wall], "noncombat damage marked on the Wall: it was dealt damage this turn");
  t.eq(selectMatching(s, {...damaged, dealtDamageThisTurn: false}, {controller: 0}), [bear, elf], "and `false` is the creatures that were not");
  dealDamage(s, {amount: 0, targets: [bear]}, {controller: 0, source: null});
  t.eq(selectMatching(s, damaged, {controller: 0}), [wall], "zero damage is no damage dealt (CR 120.8)");
  /* Infect: -1/-1 counters, not damage marked -- still damage dealt (CR 120.3d). */
  damagePermanent(s, elf, 1, [], {infect: true, by: 0});
  t.eq([selectMatching(s, damaged, {controller: 0}), s.objects[elf].counters["-1/-1"], s.objects[elf].damage], [[wall, elf], 1, 0], "damage from infect is still damage dealt, its counters and no damage marked");
  dealDamage(s, {amount: 2, targets: [walker]}, {controller: 0, source: null});
  t.eq([selectMatching(s, {what: "permanent", types: ["Planeswalker"], dealtDamageThisTurn: true}, {controller: 0}), s.objects[walker].counters.loyalty], [[walker], 3],
    "a planeswalker dealt damage loses that much loyalty, and was dealt damage (CR 120.3c)");
  s.objects[wall].damage = 0;
  t.eq(selectMatching(s, damaged, {controller: 0}).includes(wall), true, "with its damage gone (regenerated, CR 701.19a), it was still dealt damage this turn");
  const back = moveObject(s, moveObject(s, wall, "hand", 1), "battlefield");
  t.eq(selectMatching(s, damaged, {controller: 0}).includes(back), false, "the Wall returned is a new object, never dealt damage (CR 400.7)");
  s.turn += 1;
  t.eq(selectMatching(s, damaged, {controller: 0}), [], "next turn, nothing was dealt damage this turn");
  t.throws(() => compileSelector({what: "permanent", dealtDamageThisTurn: "yes"}), /dealtDamageThisTurn is true or false/, "the key is true or false, refused otherwise");
}

/* ---- relative to what a trigger is about ---- */
{
  const s = table(3);
  const raider = put(s, creature("Raider", 1, 1, {subtypes: ["Goblin", "Warrior"]}), 0), scout = put(s, creature("Scout", 1, 1, {subtypes: ["Goblin"]}), 0);
  const mimic = put(s, creature("Mimic", 1, 1, {subtypes: ["Shapeshifter"], keywords: ["Changeling"]}), 0), bear = put(s, creature("Bear", 2, 2, {subtypes: ["Bear"]}), 0);
  const golem = put(s, creature("Golem", 3, 3, {subtypes: []}), 0), theirs = put(s, creature("Their Goblin", 1, 1, {subtypes: ["Goblin"]}), 1);
  const sharing = {what: "permanent", types: ["Creature"], otherThan: "that card", sharesCreatureTypeWith: "that card"};
  const about = (card) => ({controller: 0, source: null, about: {card}});
  t.eq(selectMatching(s, sharing, about(raider)), [scout, mimic, theirs], "the Raider: the other Goblins, anyone's, and the changeling -- not itself, the Bear or the Golem");
  t.eq(selectMatching(s, sharing, about(mimic)), [raider, scout, bear, theirs], "a changeling shares a type with every creature that has one (CR 702.73a), the Golem with none excepted");
  t.eq(selectMatching(s, sharing, about(golem)), [], "a creature with no creature type shares one with nothing, a changeling included");
  t.eq(selectMatching(s, {what: "permanent", otherThan: "that card"}, about(bear)).includes(bear), false, "otherThan leaves out the creature the trigger is about");
  t.eq(selectMatching(s, {what: "permanent", otherThan: "that card"}, {controller: 0}).length, 6, "and with nothing it is about, leaves out nothing");
  t.eq(selectMatching(s, sharing, {controller: 0}), [], "sharing a type with nothing the trigger is about is sharing with nothing");
  moveObject(s, raider, "graveyard", 0);
  t.eq(selectMatching(s, sharing, about(raider)), [], "nor with a creature gone from the battlefield");
  t.throws(() => compileSelector({what: "permanent", otherThan: "self"}), /otherThan is "that card"/, "otherThan is \"that card\", refused otherwise");
  t.throws(() => compileSelector({what: "permanent", sharesCreatureTypeWith: "self"}), /sharesCreatureTypeWith is "that card"/, "and sharesCreatureTypeWith");
}

/* ---- what was destroyed, as it last was (CR 608.2h) ---- */
{
  const s = table();
  put(s, creature("Rob's Bear"), 0);
  put(s, creature("Rob's Token", 1, 1, {token: true}), 0);
  put(s, creature("Maya's Bear"), 1, "battlefield", 0);
  put(s, creature("Trey's Bear"), 2);
  put(s, creature("Rob's Stone Bear", 2, 2, {keywords: ["Indestructible"]}), 0);
  const ctx = {controller: 0, source: null};
  destroyAll(s, {selector: {what: "permanent", types: ["Creature"]}, remember: true}, ctx);
  const mine = {movedCount: {types: ["Creature"], token: false, controller: "you"}};
  t.eq(ctx.movedWas.map((w) => w.name), ["Rob's Bear", "Rob's Token", "Maya's Bear", "Trey's Bear"], "destroyAll remembers each it destroyed as it last was -- never the indestructible");
  t.eq(amountOf(s, mine, ctx), 2, "\"nontoken creatures you controlled\": Rob's Bear and the Bear of Maya's he controlled, not his token");
  t.eq(s.zones.graveyard[1].map((id) => s.objects[id].card), ["Maya's Bear"], "the Bear Rob controlled went to its owner's graveyard, and still counts for him");
  t.eq([amountOf(s, mine, {...ctx, controller: 1}), amountOf(s, mine, {...ctx, controller: 2}), amountOf(s, mine, {...ctx, controller: 3})], [0, 1, 0], "for Maya none, Trey one, Sam none");
  t.eq(amountOf(s, {movedCount: {types: ["Creature"]}}, ctx), 4, "and every creature destroyed, without the filter's other keys");
  const plain = {controller: 0, source: null};
  destroyAll(s, {selector: {what: "permanent", types: ["Creature"]}}, plain);
  t.eq(amountOf(s, mine, plain), 0, "without `remember`, nothing is remembered to count");
  t.eq(amountProblems({movedCount: {power: {min: 2}}}).length > 0, true, "the filter is one a last-known snapshot answers: power refused");
  t.eq(amountProblems(mine), [], "and Ceaseless Conflict's is one");
}

/* ---- a preparation card in its smoke game (cards/compile.mjs) ---- */
{
  /* Its events name it by its own name, the only one it has in every zone (CR 722.4): Lorehold Archivist and Goblin
     Glasswright are each cast there, and say so. */
  const smoked = loadCardScripts().filter(({script}) => script.prepare !== undefined).map(({script}) => [script.identity.name, smokeTest(script, index.definition).played]);
  t.eq(smoked, [["Goblin Glasswright // Craft with Pride", true], ["Lorehold Archivist // Restore Relic", true]], "each preparation card is cast in its smoke game, and the test knows it");
}

t.done();
