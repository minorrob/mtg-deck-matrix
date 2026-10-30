/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ROB-343: the face a modal double-faced card is played with must leave state a room can save.
 *
 * Playing the land face of Fell the Profane // Fell Mire shows the back face while the card is still in the hand, so how it
 * enters is that face's own "as this land enters" (CR 712.12), and the game then waits on "pay 3 life?". A room saves a
 * checkpoint at that wait, and a checkpoint is refused unless the state reads back from JSON as the game it is
 * (game/engine/storage.mjs, saveCheckpoint). showFace copied every key of the face, `undefined` for what a land lacks (a
 * spell, loyalty, defense, enchant), so a person at that seat ended the game with an exception. The house AI answers
 * inside the same engine step, which is why only a person hit it. showAdventure already deletes what the side shown
 * lacks; this holds showFace to the same rule, for every saved modal double-faced card.
 */
import assert from "node:assert/strict";
import {createState, addObject, showFace} from "../game/engine/state/index.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex, loadCardScripts} from "../game/tools/engine-cards.mjs";
import {hashState} from "../game/engine/journal.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const FELL = "Fell the Profane // Fell Mire", BACK = "Fell Mire";
const stable = (s) => hashState(JSON.parse(JSON.stringify(s))) === hashState(s);
const holes = (s) => Object.entries(s.objects).flatMap(([id, o]) => Object.entries(o).filter(([, v]) => v === undefined).map(([k]) => `${id}.${k}`));
const inHand = (name) => {
  const s = createState({matchId: "mdfc-face", seed: "mdfc-face", players: [{name: "Rob"}, {name: "Maya"}]});
  return [s, addObject(s, {...index.definition(name), card: name, owner: 0}, "hand", 0)];
};

{
  /* The actual play, as a person is asked: the land face shown, the engine waiting on how it enters. */
  const s = runScenario({name: "fell mire pending", setup: [{seat: 0, zone: "hand", cards: [FELL]}], steps: [{play: BACK}]}, index.definition, {}).state;
  eq(awaitingChoice(s).title, "Fell Mire: pay 3 life?", "the land face is played and the game waits on how it enters");
  eq(holes(s), [], "a card waiting in the hand carries no key whose value is undefined");
  ok(stable(s), "the state at that wait reads back from JSON as the same game, so a room can save it");
  /* And the game it saved is the game: the reloaded copy asks the same question and finishes the same play. */
  const saved = JSON.parse(JSON.stringify(s));
  eq(awaitingChoice(saved).options.map((o) => o.label), awaitingChoice(s).options.map((o) => o.label), "the reloaded game asks the same question");
  resolveAwaiting(saved, [0]);
  const mire = saved.zones.battlefield.find((id) => saved.objects[id].card === BACK);
  eq([saved.players[0].life, saved.objects[mire]?.tapped, saved.objects[mire]?.types], [37, false, ["Land"]], "paying 3 life on the reloaded game puts Fell Mire in untapped");
}

{
  /* Every saved modal double-faced card, not only the one that was reported. */
  const names = loadCardScripts().map(({script}) => script.identity?.name).filter((n) => n && index.definition(n)?.mdfc);
  ok(names.length >= 29, `at least the 29 saved modal double-faced cards are covered (${names.length})`);
  const unstable = [], notRestored = [];
  for (const name of names) {
    const [s, id] = inHand(name);
    const original = hashState(s);
    showFace(s, id, "back");
    if (!stable(s) || holes(s).length) unstable.push(`${name} ${holes(s).join(",")}`);
    showFace(s, id, "front");
    /* Shown and put back, the card is exactly as it was (the contract showAdventure keeps). */
    if (hashState(s) !== original) notRestored.push(name);
  }
  eq(unstable, [], "with its back face shown, every modal double-faced card's state reads back from JSON");
  eq(notRestored, [], "shown as its back face and put back, every modal double-faced card is byte-identical to what it was");
}

{
  /* Showing the back face still shows the back face: the characteristics the face has are set, the ones it lacks are gone. */
  const [s, id] = inHand(FELL);
  eq([s.objects[id].types, s.objects[id].manaCost, Boolean(s.objects[id].spell)], [["Instant"], "{2}{B}{B}", true], "in the hand: the Instant, with its spell");
  showFace(s, id, "back");
  eq([s.objects[id].card, s.objects[id].types, s.objects[id].face, "spell" in s.objects[id]], [BACK, ["Land"], "back", false], "shown as the land: Fell Mire, a land, face back, and no spell");
  showFace(s, id, "front");
  eq([s.objects[id].card, s.objects[id].types, "face" in s.objects[id], Boolean(s.objects[id].spell)], [FELL.split(" // ")[0], ["Instant"], false, true], "and put back: the Instant and its spell again");
}

console.log(`engine-mdfc-face-state: ${checks} checks; a modal double-faced card's shown face leaves state a room can save, and put back leaves it as it was`);
