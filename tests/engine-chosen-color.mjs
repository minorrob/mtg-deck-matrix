/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "AS IT ENTERS, CHOOSE A COLOR ... ADD ONE MANA OF THE CHOSEN COLOR" AND "TARGET CARD OF THE CHOSEN TYPE" (Rob's
 * Priority Batch 10.3, its forty-first slice: Night Market, the 146th card of Rob's list, and Dawn-Blessed Pennant, the
 * 186th).
 *
 * A mana ability's `{effect: "addMana", chosenColor: true}` (cards/index.mjs, rules/actions.mjs manaAlternatives) adds the
 * color its permanent chose as it entered -- one of `COLOR_CHOICES`, the five colors (CR 105.1) -- and nothing before a
 * choice. And a permanent's activated abilities are read with its own choice ("$chosen", script/chosen.mjs) as they are
 * offered, as their targets are asked for, and as they are activated, so the stack entry's targets are the chosen type's
 * -- as its statics, triggers and mana abilities already were.
 *
 * The card scenarios play the cards. This suite holds the mana, the reading of the choice, and the compiler.
 */
import assert from "node:assert/strict";
import {legalActions, applyAction, manaAlternatives, offerSpecs, COLOR_CHOICES} from "../game/engine/rules/actions.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {
  Elf: {types: ["Creature"], subtypes: ["Elf"], manaCost: "{G}", colors: ["G"], power: 1, toughness: 1},
  Sprite: {types: ["Creature"], subtypes: ["Faerie"], manaCost: "{U}", colors: ["U"], power: 1, toughness: 1},
};
const run = (setup, steps = []) => runScenario({name: "chosen", setup, steps}, index.definition, FIX).state;
const idOf = (s, card) => s.zones.battlefield.find((x) => s.objects[x].card === card);

/* ---- the chosen color ---- */
eq(COLOR_CHOICES, ["White", "Blue", "Black", "Red", "Green"], "the colors a choice of color offers");
{
  const s = run([at(0, "battlefield", "Night Market")]);
  const market = idOf(s, "Night Market");
  const ability = s.objects[market].abilities.find((a) => a.kind === "mana");
  eq(manaAlternatives(s, 0, ability, market), [], "set on the battlefield with no choice: no mana");
  const made = COLOR_CHOICES.map((color) => { s.objects[market].chosen = color; return manaAlternatives(s, 0, ability, market); });
  eq(made, [[{W: 1}], [{U: 1}], [{B: 1}], [{R: 1}], [{G: 1}]], "each color chosen: one mana of it");
}
{
  const compiled = compileScript({schema: "CrankCardScript@1", identity: {name: "Odd Market", oracleId: "x", types: ["Land"], subtypes: [], manaCost: "", colors: [], colorIdentity: []},
    oracleText: "{T}: Add one mana of the chosen color.", source: "hand", abilities: [{kind: "activated", text: "{T}: Add one mana of the chosen color.", mana: true, cost: [{atom: "{T}"}],
      effects: [{effect: "addMana", chosenColor: true}]}]});
  eq([compiled.problems, compiled.definition?.abilities?.[0]?.kind, compiled.definition?.abilities?.[0]?.chosenColor], [[], "mana", true], "the compiler: a mana ability of the chosen color");
}

/* ---- an activated ability read with its permanent's choice ---- */
{
  const setup = [at(0, "battlefield", "Dawn-Blessed Pennant", "Wastes", "Wastes"), at(0, "graveyard", "Elf", "Sprite")];
  const s = run(setup, [{tap: "Wastes"}, {tap: "Wastes"}]);
  const pennant = idOf(s, "Dawn-Blessed Pennant");
  const offered = () => legalActions(s, 0).filter((a) => a.kind === "activate" && a.objectId === pennant);
  eq(offered().length, 0, "set on the battlefield with no choice: no card is of the chosen type, so no offer");
  s.objects[pennant].chosen = "Elf";
  const [offer, ...others] = offered();
  eq([others.length, s.objects[offer.targets[0].id].card], [0, "Elf"], "Elf chosen: one offer, aimed at the Elf card -- not the Faerie");
  eq(offerSpecs(s, 0, offer).specs[0].subtypes, ["Elf"], "its targets' specs read with the choice too");
  applyAction(s, 0, offer);
  eq(s.stack.at(-1).script.targets[0].subtypes, ["Elf"], "activated: the stack entry's targets are the chosen type's");
}
for (const name of ["Night Market", "Dawn-Blessed Pennant"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-chosen-color: ${checks} checks passed -- one mana of the chosen color, none before a choice; a permanent's activated abilities read with its choice as offered, asked and activated.`);
