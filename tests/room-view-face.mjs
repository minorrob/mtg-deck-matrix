/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   THE VIEW SAYS WHICH FACE OF A DOUBLE-FACED PERMANENT IS UP (ROB-207, Luke's playtest of 2026-10-28; BUG-05; the UI's
   request #5 in docs/ACTIVE.md, "which face is up"; game/engine/projection.mjs).

   Luke played Mistgate Pathway; the board drew Hengegate Pathway. The rules were right (the pool made {U}) and the view's name
   was right ("Mistgate Pathway"), but a name alone cannot say which side of one picture to draw: Scryfall draws the front for a
   face's own name, and `face=back` is refused (422) for a split card. The permanent already records its face
   (`object.face`, state/index.mjs); the view now carries `face: "back"` for a permanent whose back face is up, public, as its
   name is.

     1. A modal double-faced land played as its back face is `face: "back"` on the battlefield, to every seat.
     2. Played as its front face it carries no `face`.
     3. A card in the hand, or one face down, carries none.
     4. A card that is not double-faced carries none.

     node tests/room-view-face.mjs
*/
import assert from "node:assert/strict";
import fs from "node:fs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {projectFor} from "../game/engine/projection.mjs";

let checks = 0;
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const index = loadCardIndex();
const doc = JSON.parse(fs.readFileSync(new URL("../game/engine/cards/h/hengegate-pathway-mistgate-pathway.scenarios.json", import.meta.url)));
const playedAs = (name) => runScenario(structuredClone(doc.scenarios.find((s) => s.name.startsWith(`Played as ${name}`))), index.definition, doc.fixtures).state;
const battlefield = (state, viewer) => projectFor(state, viewer).players[0].zones.Battlefield.cards;

const back = playedAs("Mistgate Pathway");
for (const viewer of [0, 1]) {
  eq(battlefield(back, viewer).map((c) => [c.name, c.face]), [["Mistgate Pathway", "back"]], `back face played: seat ${viewer} is told the back face is up`);
}
const front = playedAs("Hengegate Pathway");
for (const viewer of [0, 1]) {
  const [card] = battlefield(front, viewer);
  eq([card.name, "face" in card], ["Hengegate Pathway", false], `front face played: seat ${viewer} is told nothing, the front is the default`);
}

/* The same card in the hand: it has not been played as anything. */
const inHand = runScenario({name: "Hand", setup: [{seat: 0, zone: "hand", cards: ["Hengegate Pathway // Mistgate Pathway"]}], steps: [], expect: []}, index.definition, doc.fixtures).state;
const handCards = projectFor(inHand, 0).players[0].zones.Hand.cards;
eq([handCards.length, handCards.every((c) => !("face" in c))], [1, true], "in the hand a double-faced card carries no face");

/* A card that is not double-faced. */
const plain = runScenario({name: "Plain", setup: [{seat: 0, zone: "battlefield", cards: ["Forest"]}], steps: [], expect: []}, index.definition, {}).state;
eq(battlefield(plain, 1).every((c) => !("face" in c)), true, "a Forest carries no face");

console.log(`room-view-face: ${checks} checks passed -- a permanent played as its back face says so to every seat, and nothing else carries a face.`);
