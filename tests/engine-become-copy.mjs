/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 58 (THE CATALOG'S ORDER): "BECOMES A COPY" (CR 707.2, LAYER 1; Forge's Clone).
 *
 * A permanent becomes a copy of a permanent or a card elsewhere: its copiable values as they are now -- a copy of a copy
 * copies the copy (707.3) -- never its counters, its tapped state or the effects on it. "Except ..." changes the name,
 * adds a supertype or a keyword, or keeps an ability of its own. The latest copy effect shows; "until end of turn" ends
 * at cleanup and the one before shows again; leaving the battlefield ends them all, the card moving as itself.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {characteristicsOf, keywordsOf} from "../game/engine/rules/layers.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {endCopies} from "../game/engine/script/effects/permanents.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const BEAR = {card: "Bear", types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2,
  abilities: [{id: "a0", kind: "triggered", text: "Whenever this creature attacks, you gain 1 life.", trigger: {on: "GameEventAttackersDeclared", who: "self"}, effects: [{effect: "gainLife", amount: 1}]}]};
const OGRE = {card: "Ogre", types: ["Creature"], subtypes: ["Ogre"], manaCost: "{1}{R}", colors: ["R"], power: 3, toughness: 3};
function table() {
  const s = createState({matchId: "m", seed: "copy", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const main = (s) => { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; };
const put = (s, o, seat = 0, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
const becomes = (s, who, of, more = {}) => runEffects(s, [{effect: "becomeCopy", targets: [of], ...more}], {controller: s.objects[who].controller, source: who});
const look = (s, id) => { const c = characteristicsOf(s, id); return [s.objects[id].card, c.types, c.power, c.toughness]; };

{
  /* Mirage Mirror a copy of the Bear: its name, types, numbers and abilities -- the Mirror's own gone -- until end of turn. */
  const s = table();
  const mirror = put(s, card("Mirage Mirror")), bear = put(s, BEAR);
  becomes(s, mirror, bear, {until: "end-of-turn"});
  eq(look(s, mirror), ["Bear", ["Creature"], 2, 2], "the Mirror is a 2/2 Bear");
  eq(s.objects[mirror].abilities.map((a) => a.text), [BEAR.abilities[0].text], "with the Bear's ability, not its own");
  endCopies(s);
  eq([s.objects[mirror].card, characteristicsOf(s, mirror).types, s.objects[mirror].abilities.length, s.objects[mirror].uncopied], ["Mirage Mirror", ["Artifact"], 1, undefined], "end of turn: the Mirror again, its one ability back");
}
{
  /* Not its counters, its tapped state or the effects on it; the copier's own counters and tapped state stay. */
  const s = table();
  const mirror = put(s, card("Mirage Mirror")), bear = put(s, BEAR);
  s.objects[bear].counters = {"+1/+1": 2}; s.objects[bear].tapped = true; s.objects[mirror].counters = {charge: 1};
  runEffects(s, [{effect: "pump", targets: [bear], power: 3, toughness: 3}], {controller: 0, source: bear});
  becomes(s, mirror, bear);
  eq([characteristicsOf(s, mirror).power, s.objects[mirror].tapped ?? false, s.objects[mirror].counters], [2, false, {charge: 1}], "a 2/2, untapped, its own charge counter -- not the Bear's counters, tapped state or pump");
}
{
  /* A copy of a copy copies the copy (CR 707.3); the latest shows, and when it ends the one before shows again. */
  const s = table();
  const a = put(s, card("Mirage Mirror")), b = put(s, card("Mirage Mirror")), bear = put(s, BEAR), ogre = put(s, OGRE);
  becomes(s, a, bear);
  becomes(s, b, a);
  eq(s.objects[b].card, "Bear", "a copy of the Mirror that is a Bear: a Bear");
  becomes(s, a, ogre, {until: "end-of-turn"});
  eq(s.objects[a].card, "Ogre", "then a copy of the Ogre for the turn: an Ogre");
  endCopies(s);
  eq([s.objects[a].card, s.objects[b].card], ["Bear", "Bear"], "the turn over: a Bear again; the other still a Bear");
}
{
  /* Leaving the battlefield ends it: the card goes to the graveyard as itself. A token copy stays a token, a card a card. */
  const s = table();
  const mirror = put(s, card("Mirage Mirror")), bear = put(s, BEAR);
  const token = put(s, {...OGRE, card: "Ogre Token", token: true});
  becomes(s, mirror, bear); becomes(s, token, bear);
  eq([s.objects[token].token, s.objects[mirror].token ?? false], [true, false], "the token a token, the Mirror not");
  runEffects(s, [{effect: "destroy", targets: [mirror]}], {controller: 1, source: null});
  const gone = s.zones.graveyard[0].find((id) => s.objects[id].card === "Mirage Mirror");
  eq([gone !== undefined, s.objects[gone]?.types, s.objects[gone]?.uncopied], [true, ["Artifact"], undefined], "destroyed: Mirage Mirror in the graveyard, an artifact");
  /* And what has left does not become one: Sarkhan's trigger resolving after Sarkhan is gone changes the card in the graveyard not at all. */
  becomes(s, gone, bear);
  eq([s.objects[gone].card, s.objects[gone].uncopied], ["Mirage Mirror", undefined], "the Mirror in the graveyard stays Mirage Mirror");
}
{
  /* "Except ...": a name and a supertype (Sarkhan), a keyword and an ability of its own kept, renamed (Likeness Looter). */
  const s = table();
  const sarkhan = put(s, card("Sarkhan, Soul Aflame")), wyrm = put(s, {...OGRE, card: "Wyrm", subtypes: ["Dragon"]});
  becomes(s, sarkhan, wyrm, {except: {name: "Sarkhan, Soul Aflame", addSupertypes: ["Legendary"]}});
  eq([s.objects[sarkhan].card, s.objects[sarkhan].supertypes, s.objects[sarkhan].subtypes, characteristicsOf(s, sarkhan).power], ["Sarkhan, Soul Aflame", ["Legendary"], ["Dragon"], 3],
    "named Sarkhan, legendary, a 3/3 Dragon");
  const looter = put(s, card("Likeness Looter")), ogre = put(s, OGRE, 0, "graveyard");
  becomes(s, looter, ogre, {except: {addKeywords: ["Flying"]}, keep: ["a2"]});
  eq([s.objects[looter].card, keywordsOf(s, looter).includes("Flying"), s.objects[looter].abilities.map((a) => a.id)], ["Ogre", true, ["kept-a2"]],
    "a copy of the Ogre card in his graveyard, flying, with its {X} ability kept");
}
{
  /* Thespian's Stage keeps its ability: a copy of the Grove, and next turn a copy of the Island, and still able to. */
  const s = table();
  const GROVE = {card: "Grove", types: ["Land"], abilities: [{id: "g", kind: "mana", tapSelf: true, produces: {G: 2}, text: "{T}: Add {G}{G}."}]};
  const stage = put(s, card("Thespian's Stage")), grove = put(s, GROVE), island = put(s, {...WASTES, card: "Island", subtypes: ["Island"]});
  becomes(s, stage, grove, {keep: ["a1"]});
  eq([s.objects[stage].card, s.objects[stage].abilities.map((a) => a.id)], ["Grove", ["g", "kept-a1"]], "a Grove that keeps its copy ability");
  becomes(s, stage, island, {keep: ["a1"]});
  eq([s.objects[stage].card, s.objects[stage].abilities.map((a) => a.id)], ["Island", ["a0", "kept-a1"]], "then an Island, still with it");
}
{
  /* "With mana value X" (The Mycosynth Gardens): X = 2 targets the {2} Trinket; X = 1 does not. */
  const s = table();
  const gardens = put(s, card("The Mycosynth Gardens"));
  const trinket = put(s, {card: "Trinket", types: ["Artifact"], manaCost: "{2}", colors: []});
  put(s, WASTES); put(s, WASTES);
  main(s);
  for (const a of legalActions(s, 0).filter((x) => x.kind === "activate-mana" && x.label === "Wastes")) applyAction(s, 0, legalActions(s, 0).find((x) => x.kind === "activate-mana" && x.objectId === a.objectId));
  const aims = legalActions(s, 0).filter((a) => a.kind === "activate" && a.objectId === gardens).map((a) => [a.x, a.targets?.[0]?.id === trinket]);
  eq(aims, [[2, true]], "only X = 2 has a target: the Trinket");
  eq([missingFor({apis: ["Clone"]}).length, missingFor({keywords: ["ETBReplacement"]}).length], [0, 1], "the catalog credits Clone; ETBReplacement, entering as a copy among its forms, still not");
}

console.log(`engine-become-copy: ${checks} checks passed — the copied values as they are, a copy of a copy; never counters, tapped state or effects; except a name, a supertype, a keyword or its own ability; the latest shows; end of turn and leaving end it.`);
