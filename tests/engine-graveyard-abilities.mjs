/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, W2D: "THRANDUIL HAS ALL ACTIVATED ABILITIES OF ALL ELF CARDS IN YOUR GRAVEYARD" (Thranduil, the Elvenking; CR
 * 613.1f, 702.73a).
 *
 * A layer-6 static's `apply.graveyardAbilities` (rules/layers.mjs, graveyardGrant): the activated and mana abilities of the
 * cards in its controller's graveyard that are what it says -- read as the graveyard now is, so they come and go with the
 * cards; each named by its card, so two cards' alike abilities are two. Here: whose graveyard (its controller's, and after a
 * change of control the new one's), a changeling card, a card leaving, what "this creature" is in a given ability, an
 * ability that works only from a graveyard, and the compiler.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {abilitiesOf, powerOf} from "../game/engine/rules/layers.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {moveObject} from "../game/engine/state/index.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const THRANDUIL = "Thranduil, the Elvenking";
const pump = {id: "p", kind: "activated", text: "{0}: This creature gets +1/+1 until end of turn.", cost: [{atom: "mana", cost: "{0}"}], targets: [],
  effects: [{effect: "pump", targets: "self", power: 1, toughness: 1}]};
const creature = (subtypes, more = {}) => ({types: ["Creature"], subtypes, manaCost: "{G}", colors: ["G"], power: 1, toughness: 1, ...more});
const FIX = {
  "Elf Pumper": creature(["Elf"], {abilities: [pump]}),
  "Bear Pumper": creature(["Bear"], {abilities: [pump]}),
  "Mimic Pumper": creature(["Shapeshifter"], {keywords: ["Changeling"], abilities: [pump]}),
  "Elf Ward": creature(["Elf"], {abilities: [{id: "w", kind: "static", text: "x", layer: 7, sublayer: "c", affects: {self: true}, apply: {power: 1, toughness: 1}}]}),
};
const table = (setup) => runScenario({name: "graveyard-abilities", setup, steps: []}, index.definition, FIX).state;
const idOf = (s, name, zone = "battlefield") => (zone === "battlefield" ? s.zones.battlefield : s.zones[zone].flat()).find((id) => s.objects[id].card === name);
const granted = (s) => abilitiesOf(s, idOf(s, THRANDUIL)).filter((a) => String(a.id).startsWith("granted:")).map((a) => a.text).sort();

{
  const s = table([{seat: 0, zone: "battlefield", cards: [THRANDUIL]}, {seat: 0, zone: "graveyard", cards: ["Elf Pumper", "Mimic Pumper", "Bear Pumper", "Elf Ward", "Llanowar Elves"]},
    {seat: 1, zone: "graveyard", cards: ["Elf Pumper"]}]);
  eq(granted(s), ["{0}: This creature gets +1/+1 until end of turn.", "{0}: This creature gets +1/+1 until end of turn.", "{T}: Add {G}."],
    "Rob's Elf cards' activated and mana abilities -- a changeling card's among them; not a Bear's, not a static, not Maya's");
  const ids = abilitiesOf(s, idOf(s, THRANDUIL)).filter((a) => String(a.id).startsWith("granted:")).map((a) => a.id);
  eq(new Set(ids).size, ids.length, "two cards' alike abilities are two, each its own id");
  /* "This creature" in a given ability is Thranduil: activated, it pumps Thranduil, not the card in the graveyard. */
  const offer = legalActions(s, 0).find((a) => a.kind === "activate" && a.label === THRANDUIL);
  applyAction(s, 0, offer);
  for (let n = 0; n < 4 && s.stack.length; n += 1) passPriority(s, null);
  eq(powerOf(s, idOf(s, THRANDUIL)), 6, "the ability, activated, gives Thranduil +1/+1");
}
{
  /* As the graveyard now is: a card that leaves takes its ability with it; one put there brings its own. */
  const s = table([{seat: 0, zone: "battlefield", cards: [THRANDUIL, "Elf Pumper"]}, {seat: 0, zone: "graveyard", cards: ["Llanowar Elves"]}]);
  eq(granted(s), ["{T}: Add {G}."], "Llanowar Elves's ability alone");
  moveObject(s, idOf(s, "Llanowar Elves", "graveyard"), "exile");
  eq(granted(s), [], "exiled from the graveyard: gone");
  runEffects(s, [{effect: "destroy", targets: [idOf(s, "Elf Pumper")]}], {controller: 0, source: null});
  eq(granted(s), ["{0}: This creature gets +1/+1 until end of turn."], "the Elf Pumper dies: its ability is Thranduil's");
}
{
  /* Its controller's graveyard: Maya gains control of it, and it has her Elf cards' abilities, not Rob's. */
  const s = table([{seat: 0, zone: "battlefield", cards: [THRANDUIL]}, {seat: 0, zone: "graveyard", cards: ["Llanowar Elves"]}, {seat: 1, zone: "graveyard", cards: ["Elf Pumper"]}]);
  runEffects(s, [{effect: "gainControl", targets: [idOf(s, THRANDUIL)]}], {controller: 1, source: null});
  eq(granted(s), ["{0}: This creature gets +1/+1 until end of turn."], "Maya's Elf Pumper's, not Rob's Llanowar Elves's");
}

/* ---- the compiler ---- */
const compiled = (apply, layer = 6) => compileScript({schema: "CrankCardScript@1",
  identity: {name: "Odd Elf", oracleId: "x", types: ["Creature"], subtypes: ["Elf"], manaCost: "{G}", colors: ["G"], colorIdentity: ["G"], power: 1, toughness: 1},
  oracleText: "x", source: "hand", abilities: [{kind: "static", text: "x", layer, affects: {self: true}, apply}]}).problems;
{
  eq(compiled({graveyardAbilities: {subtypes: ["Elf"]}}), [], "layer 6, a list of subtypes: compiles");
  ok(compiled({graveyardAbilities: {subtypes: ["Elf"]}}, 7).some((p) => p.includes("layer 6")), "in another layer, refused");
  ok(compiled({graveyardAbilities: {types: ["Creature"]}}).some((p) => p.includes("{subtypes: [...]}")), "described any other way, refused");
  ok(compiled({graveyardAbilities: {subtypes: []}}).some((p) => p.includes("{subtypes: [...]}")), "and with no subtype, refused");
  ok(compiled({graveyardAbilities: {subtypes: ["Elf"], types: ["Creature"]}}).some((p) => p.includes("{subtypes: [...]}")), "and with anything beside its subtypes, refused");
}

console.log(`engine-graveyard-abilities: ${checks} checks passed -- a graveyard's cards' activated abilities, given: its controller's graveyard as it now is, one each, "this creature" the holder.`);
