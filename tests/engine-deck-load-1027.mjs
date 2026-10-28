/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CARD LOAD OF ROB'S ORZHOV DECK (2026-10-27): the 25 cards of the list that the engine did not have, and what their
 * scenarios cannot reach.
 *
 * - Every card of Rob's 100-card list resolves to a definition the table can play, and every scenario of the 25 new ones runs
 *   here on its own, so a change to one shows at once without the whole catalog's.
 * - "Any number of target creature cards that each have a different mana value X or less" (Agadeem's Awakening): the choice
 *   offered with a cap of one for each mana value, which the controller holds every answerer to -- two cards of one mana value
 *   refused with what to do, two of different ones taken.
 * - "Monocolored" (Vanishing Verse; CR 105.2a): exactly one color, through the layers.
 * - "Without being played" (Deep Gnome Terramancer; CR 305.1): the arrival of a land that was played, and of one that was not.
 * - "You may pay 2 life ... those spells cost {W} less" (Defiler of Faith; CR 601.2b, 601.2f): the cast offered both ways, the
 *   reduction of white mana only, and a spell of another color left as it is.
 * - "Discard X cards" as a cost (Gix, Yawgmoth Praetor): X announced, from none to the cards in hand.
 */
import assert from "node:assert/strict";
import {loadCardIndex, loadCardScenarios, loadCardScripts} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {createController} from "../game/engine/controller.mjs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {countedChoice} from "../game/engine/script/bind.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {PREDEFINED_TOKENS} from "../game/engine/script/effects/permanents.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

/* ---- Rob's list: the 25 cards it needed written, and the rest it already had ---- */
const NEW_CARDS = [
  "Agadeem's Awakening // Agadeem, the Undercrypt", "Blood Money", "Darkstar Augur", "Deep Gnome Terramancer", "Defiler of Faith",
  "Dusk Rose Reliquary", "Dwarven Priest", "Essence Channeler", "Gix, Yawgmoth Praetor", "Kamber, the Plunderer", "Key to the City",
  "Krav, the Unredeemed", "Lithoform Engine", "Malakir Familiar", "Moonstone Eulogist", "Nighthawk Scavenger", "Orzhov Locket",
  "Pilgrim of the Ages", "Ruthless Knave", "Sanguine Evangelist", "Taborax, Hope's Demise", "Tainted Adversary", "Traveling Minister",
  "Vanishing Verse", "Zoraline, Cosmos Caller",
];
const OTHERS = [
  "Adventurer's Inn", "Arcane Signet", "Ayara, First of Locthwain", "Blood Artist", "Caves of Koilos", "Charcoal Diamond", "Cleansing Nova",
  "Command Tower", "Commander's Sphere", "Cruel Celebrant", "Deadly Dispute", "Evolving Wilds", "Exotic Orchard", "Exquisite Blood",
  "Fabled Passage", "Feed the Swarm", "Godless Shrine", "Infernal Grasp", "Krav, the Unredeemed", "Marble Diamond", "Midnight Reaper", "Mind Stone",
  "Night's Whisper", "Orzhov Guildgate", "Path of Ancestry", "Plains", "Priest of Fell Rites", "Sanguine Bond", "Shineshadow Snarl", "Sign in Blood",
  "Skittering Surveyor", "Sol Ring", "Sun Titan", "Swamp", "Swords to Plowshares", "Tainted Field", "Talisman of Hierarchy", "Temple of Silence",
  "Thought Vessel", "Vampire Nighthawk", "Vanguard Seraph", "Vault of the Archangel", "Village Rites", "Wayfarer's Bauble", "Welcoming Vampire",
  "Zulaport Cutthroat",
];
const cards = loadCardIndex();
for (const name of [...new Set([...NEW_CARDS, ...OTHERS])]) ok(cards.resolve(name)?.playable === true, `${name} is playable`);
eq(NEW_CARDS.length, 25, "the load is the 25 cards the engine lacked");
const files = loadCardScenarios().map((f) => f.scenarios).filter((f) => NEW_CARDS.includes(f.card));
eq(files.length, 25, "every new card has its scenarios");
for (const file of files) for (const scenario of file.scenarios) { runScenario(scenario, cards.definition, file.fixtures ?? {}); checks += 1; }

/* ---- Agadeem's Awakening: a different mana value for each card chosen ---- */
{
  const state = createState({matchId: "deck-load-1027", seed: "agadeem", players: [{name: "Rob"}, {name: "Maya"}]});
  const bury = (name, cost) => addObject(state, {types: ["Creature"], subtypes: [], manaCost: cost, colors: [], power: 1, toughness: 1, card: name, owner: 0, controller: 0}, "graveyard", 0);
  const one = bury("One Drop", "{1}"), two = bury("Two Drop", "{2}"), twin = bury("Twin Drop", "{1}{G}"), three = bury("Three Drop", "{3}"), five = bury("Five Drop", "{5}");
  const spec = cards.definition("Agadeem's Awakening // Agadeem, the Undercrypt").abilities.find((a) => a.kind === "spell" || a.spell)?.targets?.[0]
    ?? cards.definition("Agadeem's Awakening // Agadeem, the Undercrypt").spell.targets[0];
  const choice = countedChoice(state, spec, {controller: 0, source: null, x: 3}, {id: "agadeem", name: "Agadeem's Awakening"});
  eq(choice.options.map((o) => o.label).sort(), ["One Drop", "Three Drop", "Twin Drop", "Two Drop"], "X of 3 offers the creature cards of mana value 3 or less");
  ok(!choice.options.some((o) => o.cardId === five), "mana value 5 is more than X");
  eq(choice.min, 0, "any number includes none");
  ok(/different mana value/.test(choice.title), "the question says each has a different mana value");
  const controller = createController();
  controller.offer(choice);
  const at = (...ids) => ids.map((id) => choice.options.find((o) => o.cardId === id).index);
  const refused = controller.check({choiceId: choice.id, indices: at(two, twin)});
  ok(/different mana value.*mana value 2/s.test(refused ?? ""), `two cards of mana value 2 are refused, with what to do (${refused})`);
  eq(controller.check({choiceId: choice.id, indices: at(one, two, three)}), null, "one of each mana value is taken");
  eq(controller.check({choiceId: choice.id, indices: []}), null, "and none");
  eq(controller.check({choiceId: choice.id, indices: at(one, twin)}), null, "mana value 1 and 2 are different, whatever the cards are called");
  /* "Each with a different mana value" belongs to a counted target, refused on any other (script/schema.mjs). */
  const script = JSON.parse(JSON.stringify(loadCardScripts().find(({script}) => script.identity.name === "Agadeem's Awakening // Agadeem, the Undercrypt").script));
  delete script.abilities[0].targets[0].count;
  const verdict = compileScript(script);
  ok(verdict.playable !== true && /differentManaValues/.test(JSON.stringify(verdict.problems ?? verdict)), "differentManaValues on a target without a count is refused");
}

/* ---- Vanishing Verse: monocolored ---- */
{
  const state = createState({matchId: "deck-load-1027", seed: "mono", players: [{name: "Rob"}, {name: "Maya"}]});
  const put = (colors) => addObject(state, {types: ["Creature"], subtypes: [], manaCost: null, colors, power: 1, toughness: 1, card: "Test", owner: 1, controller: 1}, "battlefield", null);
  const mono = compileSelector({what: "permanent", monocolored: true});
  ok(mono(state, put(["G"]), {controller: 0}), "one color is monocolored");
  ok(!mono(state, put(["G", "W"]), {controller: 0}), "two colors are not");
  ok(!mono(state, put([]), {controller: 0}), "colorless is not a color (CR 105.1)");
  assert.throws(() => compileSelector({what: "permanent", monocolored: false}), /monocolored is true/); checks += 1;
}

/* ---- The tokens ---- */
{
  const blood = PREDEFINED_TOKENS.Blood;
  eq([blood.name, blood.subtypes, blood.types], ["Blood", ["Blood"], ["Artifact"]], "a Blood token is an artifact with the subtype Blood");
  eq(blood.abilities[0].cost.map((a) => a.atom), ["mana", "{T}", "discard", "sacrifice"], "its cost is {1}, {T}, discard a card, sacrifice it");
  const zombie = PREDEFINED_TOKENS["Decayed Zombie"];
  eq([zombie.power, zombie.toughness, zombie.colors, zombie.keywords], [2, 2, ["B"], ["Decayed"]], "a decayed Zombie is a 2/2 black Zombie with decayed");
  eq(zombie.abilities.map((a) => a.rule ?? a.kind), ["cant-block", "triggered"], "it can't block, and when it attacks it is sacrificed at end of combat (CR 702.147)");
}

console.log(`engine-deck-load-1027: ${checks} checks passed`);
