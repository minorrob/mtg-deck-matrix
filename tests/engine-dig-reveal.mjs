/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (p1-bugs): WHAT A DIG REVEALS IS SHOWN TO EVERY PLAYER (CR 701.20a).
 *
 * Seven definitions set `reveal` on a dig -- "reveal the top four cards of your library" (Satyr Wayfinder, Mulch, Goblin
 * Ringleader, Coiling Oracle's one) and "you may reveal a permanent card from among them and put it into your hand"
 * (Boughside Wanderers, Follow the Lumarets) -- and dig read none of them: no seat but the looker's ever learned the cards.
 * Now `reveal: true` reveals every card the dig looks at -- in the journal, and in every seat's view of that library's top
 * while its controller chooses -- and `reveal: "taken"` the cards taken alone, in the journal as they are taken
 * (script/effects/asking.mjs). The seat views are the projection's (projection.mjs), read here for another seat; the leak
 * judge of the G1 games (tools/fuzz-live.mjs) reads the same facts, so a revealed card is no secret to it either.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {secretsFor} from "../tools/fuzz-live.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const FIXTURES = {
  Elk: {types: ["Creature"], subtypes: ["Elk"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Grove: {types: ["Land"], subtypes: [], manaCost: null, colors: []},
  Stone: {types: ["Artifact"], manaCost: "{1}", colors: []},
  Glint: {types: ["Instant"], manaCost: "{U}", colors: ["U"]},
  /* A dig that reveals and takes cards one at a time, to a total mana value (`totalManaValueAtMost`, as Ao's): "Reveal the
     top three cards of your library. Put any number of them with total mana value 2 or less into your hand." */
  Sifter: {types: ["Sorcery"], manaCost: "{C}", colors: [], spell: {id: "s", text: "Reveal the top three cards of your library. Put any number of them with total mana value 2 or less into your hand.",
    effects: [{effect: "dig", count: 3, take: 3, totalManaValueAtMost: 2, upTo: true, to: "hand", rest: "bottom", reveal: true}]}},
  /* A dig that looks and does not reveal: "Look at the top four cards of your library. You may put one into your hand." */
  Gazer: {types: ["Sorcery"], manaCost: "{C}", colors: [], spell: {id: "s", text: "Look at the top four cards of your library. You may put one into your hand.",
    effects: [{effect: "dig", count: 4, take: 1, upTo: true, to: "hand", rest: "bottom"}]}},
};
const TOP = ["Elk", "Grove", "Stone", "Glint"];
const play = (scenario) => runScenario({expect: [], ...scenario}, cards.definition, FIXTURES);
const top = (state, viewer, owner = 0) => projectFor(state, viewer).players[owner].zones.Library.cards.map((c) => c.name);
const revealedNames = (events) => events.filter((e) => e.kind === "GameEventCardRevealed").map((e) => e.data.fields.card.name);
/* Three players and more: Rob draws on his first turn (CR 103.8), a Wastes first. */
const wayfinder = (steps = []) => play({name: "wayfinder", seats: 3, library: ["Wastes", ...TOP], setup: [at(0, "battlefield", "Forest", "Wastes"), at(0, "hand", "Satyr Wayfinder")],
  steps: [{tap: "Forest"}, {tap: "Wastes"}, {cast: "Satyr Wayfinder"}, {resolve: true}, {resolve: true}, ...steps]});

{
  /* Satyr Wayfinder, three players: the four it reveals named in the journal, and on top of Rob's library in Maya's and
     Trey's views while he chooses -- in his own too; no further card of it. */
  const {state, events} = wayfinder();
  eq([state.awaiting?.effect, revealedNames(events)], ["dig", TOP], "asking him which land: the four revealed, in order");
  eq([top(state, 1), top(state, 2), top(state, 0)], [TOP, TOP, TOP], "Maya's view, Trey's and his own: the four on top of his library");
  eq(projectFor(state, 1).players[0].zones.Library.hiddenCount, 15, "and the other fifteen hidden (twenty, less his first draw and the four)");
  eq(["Elk", "Grove", "Stone", "Glint"].filter((name) => secretsFor(state, 1).has(name)), [], "the leak judge agrees: none of the four is a secret from Maya");
  eq(JSON.parse(JSON.stringify(state.looks)), state.looks, "what each seat is shown is plain data, kept with a checkpoint");
}
{
  /* Answered: the Grove to his hand, the rest to his graveyard -- his library shown to nobody now, and the journal said it. */
  const {state, events} = wayfinder([{choose: ["Grove"]}]);
  eq([top(state, 1), top(state, 0), (state.looks ?? []).filter((l) => l.revealed).length], [[], [], 0], "done: no seat sees his library, and nothing is kept of the reveal");
  eq([revealedNames(events), projectFor(state, 1).players[0].zones.Graveyard.cards.map((c) => c.name).sort()], [TOP, ["Elk", "Glint", "Stone"]], "the four said once; the three to his graveyard");
}
{
  /* Looked at, not revealed: Maya sees nothing of it while he chooses, and the journal names none. */
  const {state, events} = play({name: "gazer", library: TOP, setup: [at(0, "battlefield", "Wastes"), at(0, "hand", "Gazer")],
    steps: [{tap: "Wastes"}, {cast: "Gazer"}, {resolve: true}]});
  eq([state.awaiting?.effect, top(state, 1), top(state, 0), revealedNames(events)], ["dig", [], [], []], "a look: nobody's view shows his library, nothing revealed");
  eq(TOP.every((name) => secretsFor(state, 1).has(name)), true, "and to the leak judge the four are Maya's secrets");
}
{
  /* Boughside Wanderers ("you may reveal a permanent card from among them"): nothing shown while he chooses; the Elk he
     takes revealed, alone. Declined, nothing revealed at all. */
  const wanderers = (steps) => play({name: "wanderers", library: TOP, setup: [at(0, "battlefield", "Forest", "Forest", "Wastes", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Boughside Wanderers")],
    steps: [...["Forest", "Forest", "Wastes", "Wastes", "Wastes", "Wastes"].map((tap) => ({tap})), {cast: "Boughside Wanderers"}, {resolve: true}, {resolve: true}, ...steps]});
  const asking = wanderers([]);
  eq([asking.state.awaiting?.effect, top(asking.state, 1), revealedNames(asking.events)], ["dig", [], []], "while he chooses: nothing shown, nothing revealed");
  eq(revealedNames(wanderers([{choose: ["Elk"]}]).events), ["Elk"], "the Elk taken: the Elk revealed, and only it");
  eq(revealedNames(wanderers([{answer: []}]).events), [], "none taken: none revealed");
}
{
  /* Coiling Oracle, a creature on top: revealed and into his hand at once, nobody asked -- the journal says so. Mulch, four
     players: every one of the four revealed, in each of the other three seats' views while he chooses. */
  const oracle = play({name: "oracle", library: ["Elk"], setup: [at(0, "battlefield", "Forest", "Island"), at(0, "hand", "Coiling Oracle")],
    steps: [{tap: "Forest"}, {tap: "Island"}, {cast: "Coiling Oracle"}, {resolve: true}, {resolve: true}]});
  eq([oracle.state.awaiting ?? null, revealedNames(oracle.events)], [null, ["Elk"]], "the Elk revealed, into his hand, nothing asked");
  const mulch = play({name: "mulch", seats: 4, library: ["Wastes", "Grove", "Elk", "Forest", "Stone"], setup: [at(0, "battlefield", "Forest", "Wastes"), at(0, "hand", "Mulch")],
    steps: [{tap: "Forest"}, {tap: "Wastes"}, {cast: "Mulch"}, {resolve: true}]});
  eq([1, 2, 3].map((seat) => top(mulch.state, seat)), [1, 2, 3].map(() => ["Grove", "Elk", "Forest", "Stone"]), "Mulch, four players: each other seat sees the four");
}

{
  /* One card at a time, to a total: the three shown while he picks, and not once he says no more. */
  const sift = (steps) => play({name: "sift", library: ["Elk", "Stone", "Glint"], setup: [at(0, "battlefield", "Wastes"), at(0, "hand", "Sifter")],
    steps: [{tap: "Wastes"}, {cast: "Sifter"}, {resolve: true}, ...steps]});
  const picking = sift([{choose: ["Stone"]}]);
  eq([picking.state.awaiting?.effect, top(picking.state, 1), revealedNames(picking.events)], ["dig", ["Elk", "Stone", "Glint"], ["Elk", "Stone", "Glint"]],
    "the Stone picked, one more to pick: the three still shown to Maya, said once");
  /* The two left go to the bottom in the order he chooses (CR 401.4; wave 4c, k2): asked once he says no more. */
  const done = sift([{choose: ["Stone"]}, {choose: ["No more"]}, {answer: [1, 0]}]);
  eq([done.state.awaiting ?? null, top(done.state, 1), projectFor(done.state, 0).players[0].zones.Hand.cards.map((c) => c.name), (done.state.looks ?? []).filter((l) => l.revealed).length],
    [null, [], ["Stone"], 0], "no more: the Stone in his hand, nothing shown, nothing kept of the reveal");
}

console.log(`engine-dig-reveal: ${checks} checks passed -- a dig that reveals shows every card it reveals to every player, in the journal and in each seat's view while its controller chooses; one that reveals what it takes, that alone; a look, nothing.`);
