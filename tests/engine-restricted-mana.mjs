/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 57 (THE CATALOG'S ORDER): "SPEND THIS MANA ONLY ..." (CR 106.6).
 *
 * Mana a source says may be spent only on some spells, or on some abilities' sources, is kept beside the pool, one entry
 * a mana, with what it may pay for -- "the chosen type" read as it is made. A spell or an ability may spend the pool and
 * the entries that admit it, and spends those first; "that spell can't be countered" rides on the entry. It empties with
 * the pool, never pays an "unless" cost, and a source that says it in words the engine cannot read is refused.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {cantBeCountered} from "../game/engine/rules/statics.mjs";
import {canPayGeneric} from "../game/engine/rules/mana.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const FOREST = {card: "Forest", types: ["Land"], supertypes: ["Basic"], subtypes: ["Forest"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {G: 1}}]};
const PUMP = {id: "p", kind: "activated", text: "{G}: This creature gets +1/+1 until end of turn.", cost: [{atom: "mana", cost: "{G}"}], effects: [{effect: "pump", targets: "self", power: 1, toughness: 1}]};
const creature = (name, subtype, more = {}) => ({card: name, types: ["Creature"], subtypes: [subtype], manaCost: "{G}", colors: ["G"], power: 1, toughness: 1, ...more});
const CHARM = {card: "Charm", types: ["Instant"], manaCost: "{G}", colors: ["G"], spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}};
function table() {
  const s = createState({matchId: "m", seed: "restricted", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const main = (s) => { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; };
const put = (s, o, zone = "battlefield", chosen) => { const id = addObject(s, {...o, owner: 0, controller: 0}, zone, zone === "battlefield" ? null : 0); if (chosen !== undefined) s.objects[id].chosen = chosen; return id; };
const tapFor = (s, id, mana) => applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.objectId === id && JSON.stringify(a.mana) === JSON.stringify(mana)));
const castable = (s, name) => legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === name).length;
const cast = (s, name) => applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === name));

{
  /* Cavern of Souls on Elf: its green is beside the pool, not in it; it casts the Elf, not the green Goblin or an instant. */
  const s = table();
  const cavern = put(s, card("Cavern of Souls"), "battlefield", "Elf");
  put(s, creature("Elf", "Elf"), "hand"); put(s, creature("Goblin", "Goblin"), "hand"); put(s, CHARM, "hand");
  main(s);
  tapFor(s, cavern, {G: 1});
  eq([s.players[0].manaPool.G, s.players[0].restrictedMana.length], [0, 1], "tapped for green: none in the pool, one restricted mana beside it");
  eq([castable(s, "Elf"), castable(s, "Goblin"), castable(s, "Charm")], [1, 0, 0], "the Elf castable with it; the Goblin and the instant not");
  /* Its source gone, the mana still says Elf: the choice was read as it was made. */
  runEffects(s, [{effect: "destroy", targets: [cavern]}], {controller: 1, source: null});
  eq(castable(s, "Elf"), 1, "Cavern destroyed: the Elf still castable with its mana");
  cast(s, "Elf");
  const elf = s.stack.at(-1).objectId;
  eq([s.players[0].restrictedMana.length, cantBeCountered(s, elf)], [0, true], "spent on the Elf, and the Elf can't be countered");
}
{
  /* The restricted mana first: a Forest's green and Cavern's both in hand, the Elf takes Cavern's -- and can't be
     countered -- and the Forest's is left for the instant. Paid with the Forest's alone, it can be countered. */
  const s = table();
  const cavern = put(s, card("Cavern of Souls"), "battlefield", "Elf"), forest = put(s, FOREST);
  put(s, creature("Elf", "Elf"), "hand"); put(s, CHARM, "hand");
  main(s);
  tapFor(s, cavern, {G: 1}); tapFor(s, forest, {G: 1});
  cast(s, "Elf");
  eq([s.players[0].manaPool.G, s.players[0].restrictedMana.length, cantBeCountered(s, s.stack.at(-1).objectId)], [1, 0, true], "Cavern's green spent, the Forest's left; can't be countered");
  const t = table();
  const woods = put(t, FOREST);
  put(t, card("Cavern of Souls"), "battlefield", "Elf"); put(t, creature("Elf", "Elf"), "hand");
  main(t);
  tapFor(t, woods, {G: 1});
  cast(t, "Elf");
  eq(cantBeCountered(t, t.stack.at(-1).objectId), false, "the Forest's green alone: the Elf can be countered");
}
{
  /* It empties with the pool at the end of the step (CR 500.4). */
  const s = table();
  const cavern = put(s, card("Cavern of Souls"), "battlefield", "Elf");
  main(s);
  tapFor(s, cavern, {G: 1});
  for (let n = 0; n < 20 && s.phase === "MAIN1"; n += 1) advance(s);
  eq([s.phase !== "MAIN1", s.players[0].restrictedMana?.length ?? 0], [true, 0], "the main phase over: Cavern's green is gone");
}
{
  /* "Or activate an ability of a creature source of the chosen type" (Secluded Courtyard on Elf): the Elf's {G} ability,
     not the Goblin's. Delighted Halfling: a legendary spell, not another. */
  const s = table();
  const courtyard = put(s, card("Secluded Courtyard"), "battlefield", "Elf");
  const elf = put(s, creature("Elf", "Elf", {abilities: [PUMP]})), goblin = put(s, creature("Goblin", "Goblin", {abilities: [PUMP]}));
  main(s);
  tapFor(s, courtyard, {G: 1});
  const activations = (id) => legalActions(s, 0).filter((a) => a.kind === "activate" && a.objectId === id).length;
  eq([activations(elf), activations(goblin)], [1, 0], "the Elf's ability paid with it; the Goblin's not");
  const sage = put(s, creature("Sage", "Elf", {abilities: [{id: "x", kind: "activated", text: "{X}: This creature gets +X/+0 until end of turn.", cost: [{atom: "mana", cost: "{X}"}],
    effects: [{effect: "pump", targets: "self", power: "X", toughness: 0}]}]}));
  eq(legalActions(s, 0).filter((a) => a.kind === "activate" && a.objectId === sage).map((a) => a.x ?? 0).sort(), [0, 1], "an Elf's {X} ability: X up to 1 with it");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.objectId === elf));
  eq([s.players[0].restrictedMana.length, s.stack.map((e) => e.kind)], [0, ["ability"]], "activated: Courtyard's green spent on the Elf's ability, on the stack");
  const t = table();
  const halfling = put(t, card("Delighted Halfling"));
  put(t, creature("Hero", "Human", {supertypes: ["Legendary"]}), "hand"); put(t, creature("Elf", "Elf"), "hand");
  main(t);
  tapFor(t, halfling, {G: 1});
  eq([castable(t, "Hero"), castable(t, "Elf")], [1, 0], "the Halfling's green: the legendary Hero, not the Elf");
}
{
  /* "Two mana in any combination of colors" (Great Hall of the Citadel): fifteen ways. "Equal to the number of creatures you
     control of the chosen type" (Three Tree City on Elf, two Elves and a Goblin): two of a color. */
  const s = table();
  const hall = put(s, card("Great Hall of the Citadel")), wastes = [put(s, WASTES), put(s, WASTES)];
  const city = put(s, card("Three Tree City"), "battlefield", "Elf");
  put(s, creature("Elf", "Elf")); put(s, creature("Elf", "Elf")); put(s, creature("Goblin", "Goblin"));
  main(s);
  for (const id of wastes) tapFor(s, id, {C: 1});
  eq(legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.objectId === hall && a.abilityId === "a1").length, 15, "the Great Hall: fifteen offers beside its {C}");
  eq(legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.objectId === city && a.abilityId !== "a1").map((a) => JSON.stringify(a.mana)).sort(),
    ["{\"B\":2}", "{\"G\":2}", "{\"R\":2}", "{\"U\":2}", "{\"W\":2}"], "Three Tree City: two of any one color for its two Elves");
}
{
  /* Never an "unless" cost (CR 118.12): a source whose only mana is restricted does not pay generic mana. */
  const s = table();
  put(s, {card: "Heirloom", types: ["Artifact"], abilities: [{id: "m", kind: "mana", tapSelf: true, anyColor: true, spendOnly: {spell: {types: ["Creature"]}}}]});
  put(s, WASTES);
  main(s);
  eq([canPayGeneric(s, 0, 1), canPayGeneric(s, 0, 2)], [true, false], "the Wastes pays {1}; the Heirloom does not make it {2}");
}
{
  /* Words the engine cannot read are refused: an unknown key, nothing it may pay for, an "uncounterable" that is not true. */
  const land = (spendOnly) => compileScript({schema: "CrankCardScript@1", identity: {name: "Odd Land", oracleId: "x", types: ["Land"], subtypes: [], manaCost: "", colors: [], colorIdentity: []},
    oracleText: "{T}: Add one mana of any color. Spend this mana only to cast creature spells.", source: "hand",
    abilities: [{kind: "activated", text: "{T}: Add one mana of any color. Spend this mana only to cast creature spells.", mana: true, cost: [{atom: "{T}"}], effects: [{effect: "addMana", anyColor: true, spendOnly}]}]});
  eq([land({spell: {types: ["Creature"]}}).problems.length, land({spell: {types: ["Creature"]}, colors: ["G"]}).problems.length, land({}).problems.length, land({spell: {types: ["Creature"]}, uncounterable: "yes"}).problems.length,
    land({spell: {bogus: 1}}).problems.length], [0, 1, 1, 1, 1], "read: a creature spell; refused: an unknown key, nothing named, an uncounterable that is not true, a selector it cannot read");
}

console.log(`engine-restricted-mana: ${checks} checks passed — beside the pool, for what it admits, spent first; the choice read as it is made; can't be countered when it says so; empties with the pool; never an unless cost; unreadable words refused.`);
