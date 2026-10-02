/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 19 (THE CATALOG'S ORDER): CAN'T BE BLOCKED -- AND BY WHOM (CR 509.1b).
 *
 * Who may block is decided blocker by blocker. "This creature can't be blocked" refuses every blocker; "Slivers can't be
 * blocked except by Slivers" refuses all but Slivers; "can't be blocked by creatures with power 2 or less" refuses the
 * small ones; "creatures with power less than this creature's power can't block creatures you control" compares each
 * blocker with the source as it now is. Equipment and Auras say it of the creature they're on, and "as long as enchanted
 * creature is blue" reads its color. Each check asks the rules module directly, the question a declared block is put to.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {characteristicsOf, keywordsOf} from "../game/engine/rules/layers.mjs";
import {canBlockAttacker, whyBlockersAreIllegal} from "../game/engine/keywords/combat.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const creature = (name, power = 2, extra = {}) => ({card: name, types: ["Creature"], manaCost: "{1}", power, toughness: power, ...extra});
const pod = {matchId: "m", seed: "unblockable", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const attach = (s, what, to) => { s.objects[what].attachedTo = to; s.objects[to].attachments = [...(s.objects[to].attachments ?? []), what]; };
const blockable = (s, attacker, blockers) => blockers.map((b) => canBlockAttacker(s, b, attacker));

/* ---- can't be blocked ---- */
{
  const s = table();
  const blade = on(s, card("Slither Blade"), 0), bear = on(s, creature("Bear"), 0);
  const wall = on(s, creature("Wall", 0, {toughness: 6}), 1), bird = on(s, creature("Bird", 1, {keywords: ["Flying"]}), 1);
  main(s);
  eq([...blockable(s, blade, [wall, bird]), canBlockAttacker(s, wall, bear)], [false, false, true], "Slither Blade can't be blocked, by the Wall or by a flyer; a Bear beside it can be");
  ok(/can't block Slither Blade/.test(whyBlockersAreIllegal(s, blade, [wall]) ?? ""), "and a block of it is refused, saying why");
}
{
  const s = table();
  const cloak = on(s, card("Whispersilk Cloak"), 0), bear = on(s, creature("Bear"), 0), cub = on(s, creature("Cub"), 0);
  const wall = on(s, creature("Wall", 0, {toughness: 6}), 1);
  main(s);
  attach(s, cloak, bear);
  eq([canBlockAttacker(s, wall, bear), canBlockAttacker(s, wall, cub), keywordsOf(s, bear).includes("Shroud")], [false, true, true],
    "Whispersilk Cloak: the equipped Bear can't be blocked and has shroud; the Cub beside it can be blocked");
}
{
  const s = table();
  const herald = on(s, card("Herald of Secret Streams"), 0), grown = on(s, creature("Grown"), 0), plain = on(s, creature("Plain"), 0);
  const theirs = on(s, creature("Theirs"), 1), wall = on(s, creature("Wall", 0, {toughness: 6}), 0);
  main(s);
  s.objects[grown].counters["+1/+1"] = 1; s.objects[theirs].counters["+1/+1"] = 1;
  eq([canBlockAttacker(s, theirs, grown), canBlockAttacker(s, theirs, plain), canBlockAttacker(s, theirs, herald), canBlockAttacker(s, wall, theirs)], [false, true, true, true],
    "Herald of Secret Streams: Rob's creature with a +1/+1 counter can't be blocked; one without, Herald itself, and Maya's grown creature can be");
}
{
  const s = table();
  on(s, card("Tetsuko Umezawa, Fugitive"), 0);
  const elf = on(s, creature("Elf", 1), 0), bear = on(s, creature("Bear"), 0), brute = on(s, creature("Brute", 3, {toughness: 1}), 0);
  const wall = on(s, creature("Wall", 0, {toughness: 6}), 1);
  main(s);
  eq(blockable(s, elf, [wall]).concat(blockable(s, brute, [wall]), blockable(s, bear, [wall])), [false, false, true],
    "Tetsuko: a 1/1 (power 1) and a 3/1 (toughness 1) can't be blocked; a 2/2 can");
}

/* ---- can't be blocked by ---- */
{
  const s = table();
  on(s, card("Shifting Sliver"), 0);
  const sliver = on(s, creature("Sliver", 1, {subtypes: ["Sliver"]}), 1), bear = on(s, creature("Bear"), 0), robSliver = on(s, creature("Sliver", 1, {subtypes: ["Sliver"]}), 0);
  const ogre = on(s, creature("Ogre", 3), 1);
  main(s);
  eq([canBlockAttacker(s, bear, sliver), canBlockAttacker(s, robSliver, sliver), canBlockAttacker(s, ogre, robSliver), canBlockAttacker(s, bear, ogre)], [false, true, false, true],
    "Shifting Sliver: any Sliver -- Maya's too -- can't be blocked except by a Sliver; the Bear may block an Ogre as usual");
}
{
  const s = table();
  const arm = on(s, card("Wrecking Ball Arm"), 0), knight = on(s, creature("Knight", 2, {supertypes: ["Legendary"]}), 0);
  const elf = on(s, creature("Elf", 1), 1), bear = on(s, creature("Bear"), 1), ogre = on(s, creature("Ogre", 3), 1);
  main(s);
  attach(s, arm, knight);
  s.objects[knight].counters["+1/+1"] = 1;
  const c = characteristicsOf(s, knight);
  eq([c.power, c.toughness, ...blockable(s, knight, [elf, bear, ogre])], [8, 8, false, false, true],
    "Wrecking Ball Arm: base 7/7, and its +1/+1 counter still counts (8/8); creatures with power 2 or less can't block it, the 3-power Ogre can");
}
{
  const s = table();
  const champion = on(s, card("Champion of Lambholt"), 0), bear = on(s, creature("Bear"), 0);
  const elf = on(s, creature("Elf", 1), 1), ogre = on(s, creature("Ogre", 3), 1), wolf = on(s, creature("Wolf", 2), 1);
  main(s);
  eq(blockable(s, bear, [elf, wolf]), [true, true], "Champion of Lambholt at 1/1: no creature has less power, so anything may block Rob's Bear");
  s.objects[champion].counters["+1/+1"] = 2;
  eq([...blockable(s, bear, [elf, wolf, ogre]), canBlockAttacker(s, bear, ogre)], [false, false, true, true],
    "at 3/3: the 1- and 2-power creatures can't block Rob's creatures, the 3-power Ogre can; and Maya's Ogre may still be blocked by Rob's Bear");
}

/* ---- an Aura, and its color ---- */
{
  const s = table();
  const bear = on(s, creature("Bear"), 0);
  const wall = on(s, creature("Wall", 0, {toughness: 6}), 1);
  main(s);
  /* An Aura with nothing to enchant is put into its owner's graveyard (CR 704.5m): put down, and attached, in one moment. */
  const form = on(s, card("Aqueous Form"), 0);
  attach(s, form, bear);
  eq(canBlockAttacker(s, wall, bear), false, "Aqueous Form: enchanted creature can't be blocked");
}
{
  const s = table();
  const sprite = on(s, creature("Sprite", 1, {colors: ["U"]}), 0), knight = on(s, creature("Knight", 2, {colors: ["W"]}), 0), elf = on(s, creature("Elf", 1, {colors: ["G"]}), 0);
  const wall = on(s, creature("Wall", 0, {toughness: 6}), 1);
  main(s);
  const blueSteel = on(s, card("Steel of the Godhead"), 0), whiteSteel = on(s, card("Steel of the Godhead"), 0), greenSteel = on(s, card("Steel of the Godhead"), 0);
  attach(s, blueSteel, sprite); attach(s, whiteSteel, knight); attach(s, greenSteel, elf);
  eq([characteristicsOf(s, sprite).power, canBlockAttacker(s, wall, sprite), keywordsOf(s, sprite).includes("Lifelink")], [2, false, false],
    "Steel of the Godhead on a blue creature: +1/+1 and can't be blocked, but no lifelink");
  eq([characteristicsOf(s, knight).power, canBlockAttacker(s, wall, knight), keywordsOf(s, knight).includes("Lifelink")], [3, true, true],
    "on a white one: +1/+1 and lifelink, and it can be blocked");
  eq([characteristicsOf(s, elf).power, canBlockAttacker(s, wall, elf)], [1, true], "on a green one: nothing");
}

console.log(`engine-unblockable: ${checks} checks passed — can't be blocked, by anyone or except by some, by creatures weaker than the source, on the creature an Equipment or Aura is on, and as long as it is blue.`);
