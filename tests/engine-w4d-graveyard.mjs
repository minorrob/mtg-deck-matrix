/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE GRAVEYARD LANE OF THE CARD LOAD OF 2026-10-23 (wave 4d, L2): what the cards' scenarios cannot say.
 *
 * - Dauthi Voidwalker's replacement on every route to an opponent's graveyard -- an effect's move, a spell finishing on the
 *   stack, a discard by an effect, the cleanup's discard, a state-based death -- each card exiled with a void counter on it,
 *   a token and its controller's own cards untouched, and a discard still a discard (Waste Not sees it).
 * - Mox Diamond's arrival held for its question: declined or with no land card, it goes to the graveyard from where it came,
 *   and nothing that watches the battlefield sees it.
 * - Retrace's land card, skip-draw-step, a permanent becoming untapped (its untap step too), a card put into a graveyard
 *   from a library, the player a graveyard arrival is about, "another" than the card its source became, the player
 *   selector's life keys, and a graveyard's choice that must take a card that fits.
 * - And every card the lane wrote, played through its scenarios.
 */
import assert from "node:assert/strict";
import {loadCardIndex, loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";

let checks = 0;
const check = (name, fn) => { try { fn(); checks += 1; } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };
const index = loadCardIndex();
const BEAR = {types: ["Creature"], subtypes: [], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2};
const play = (scenario, fixtures = {}) => runScenario({name: "w4d", expect: [], ...scenario}, index.definition, {Bear: BEAR, ...fixtures}).state;
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const named = (s, ids) => ids.map((id) => s.objects[id].card).sort();
const exiled = (s, owner) => s.zones.exile.filter((id) => s.objects[id].owner === owner);
const voids = (s, owner) => exiled(s, owner).map((id) => s.objects[id].counters?.void ?? 0);

check("an effect's move: milled cards exiled, each with a void counter", () => {
  const s = play({library: ["Bear", "Bear"], setup: [at(0, "battlefield", "Dauthi Voidwalker", "Island"), at(0, "hand", "Thought Scour")],
    steps: [{tap: "Island"}, {cast: "Thought Scour", targets: [{player: 1}]}, {resolve: true}]});
  assert.deepEqual(named(s, exiled(s, 1)), ["Bear", "Bear"]);
  assert.deepEqual(voids(s, 1), [1, 1]);
  assert.deepEqual(named(s, s.zones.graveyard[0]), ["Thought Scour"], "its controller's own spell goes to their graveyard");
});

check("a spell finishing on the stack: an opponent's own Thought Scour is exiled with a void counter", () => {
  const s = play({setup: [at(0, "battlefield", "Dauthi Voidwalker"), at(1, "battlefield", "Island"), at(1, "hand", "Thought Scour")],
    steps: [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Island", seat: 1}, {cast: "Thought Scour", seat: 1, targets: [{player: 1}]}, {resolve: true}]});
  assert.deepEqual(named(s, exiled(s, 1)), ["Thought Scour", "Wastes", "Wastes"]);
  assert.deepEqual(voids(s, 1), [1, 1, 1]);
  assert.equal(s.zones.graveyard[1].length, 0);
});

check("a discard by an effect: exiled with void counters, and still a discard that Waste Not sees", () => {
  const s = play({setup: [at(0, "battlefield", "Dauthi Voidwalker", "Waste Not", "Cephalid Coliseum", "Island"),
    at(0, "graveyard", "Bear", "Bear", "Bear", "Bear", "Bear", "Bear", "Bear"), at(1, "hand", "Bear", "Bear", "Bear")],
  library: ["Bear", "Bear", "Bear"],
  steps: [{tap: "Island"}, {activate: "Cephalid Coliseum", ability: "a1", targets: [{player: 1}]}, {resolve: true}, {answer: [0, 1, 2]}, {settle: true}]});
  assert.equal(s.zones.graveyard[1].length, 0);
  assert.deepEqual(voids(s, 1), [1, 1, 1]);
  assert.equal(s.zones.battlefield.filter((id) => s.objects[id].card === "Zombie").length, 3, "three creature cards discarded, three Zombies");
});

check("the cleanup's discard: an opponent's card discarded to seven is exiled with a void counter", () => {
  const s = play({setup: [at(0, "battlefield", "Dauthi Voidwalker"), at(1, "hand", "Bear", "Bear", "Bear", "Bear", "Bear", "Bear", "Bear")],
    steps: [{to: {turn: 2, phase: "CLEANUP"}}, {settle: true}, {to: {turn: 3, phase: "MAIN1"}}]});
  assert.equal(s.zones.graveyard[1].length, 0);
  assert.equal(exiled(s, 1).length, 1);
  assert.deepEqual(voids(s, 1), [1]);
});

check("a state-based death: an opponent's creature exiled with a void counter; a creature of the Voidwalker's controller dies", () => {
  const s = play({setup: [at(0, "battlefield", "Dauthi Voidwalker", "Swamp", "Wastes", "Wastes", "Swamp", "Wastes", "Wastes", "Bear"), at(0, "hand", "Overkill", "Overkill"), at(1, "battlefield", "Bear")],
    steps: [{tap: "Swamp"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Overkill", targets: [{card: "Bear", seat: 1}]}, {resolve: true},
      {tap: "Swamp"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Overkill", targets: [{card: "Bear", seat: 0}]}, {resolve: true}, {settle: true}]});
  assert.deepEqual(voids(s, 1), [1]);
  assert.deepEqual(named(s, s.zones.graveyard[0]), ["Bear", "Overkill", "Overkill"]);
});

check("a token is no card: an opponent's Pest dies, and is not exiled", () => {
  const s = play({setup: [at(0, "battlefield", "Dauthi Voidwalker", "Swamp", "Wastes", "Wastes"), at(0, "hand", "Overkill"), at(1, "battlefield", "Beledros Witherbloom")],
    steps: [{to: {turn: 2, phase: "MAIN1"}}, {settle: true}, {pass: 1}, {tap: "Swamp", seat: 0}, {tap: "Wastes", seat: 0}, {tap: "Wastes", seat: 0},
      {cast: "Overkill", seat: 0, targets: [{card: "Pest", seat: 1}]}, {resolve: true}, {settle: true}]});
  assert.equal(s.zones.battlefield.filter((id) => s.objects[id].card === "Pest").length, 1, "one of the two Pests made in the upkeeps is left");
  assert.deepEqual(exiled(s, 1), []);
  assert.equal(s.players[1].life, 41, "it died: its \"when this token dies, you gain 1 life\"");
});

check("a state-based Aura and planeswalker: an opponent's Rancor, its creature gone, and Ajani at no loyalty are exiled with void counters", () => {
  const s = play({setup: [at(0, "battlefield", "Dauthi Voidwalker", "Swamp", "Wastes", "Wastes"), at(0, "hand", "Overkill"), at(1, "battlefield", "Bear", "Forest", "Ajani Steadfast"), at(1, "hand", "Rancor")],
    steps: [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Forest", seat: 1}, {cast: "Rancor", seat: 1, targets: [{card: "Bear", seat: 1}]}, {resolve: true},
      {pass: 1}, {tap: "Swamp", seat: 0}, {tap: "Wastes", seat: 0}, {tap: "Wastes", seat: 0}, {cast: "Overkill", seat: 0, targets: [{card: "Bear", seat: 1}]}, {resolve: true}, {settle: true}]});
  assert.deepEqual(named(s, exiled(s, 1)), ["Bear", "Rancor"]);
  assert.deepEqual(voids(s, 1), [1, 1]);
  assert.equal(s.zones.hand[1].includes(undefined), false);
  const carth = s.zones.battlefield.find((id) => s.objects[id].card === "Ajani Steadfast");
  s.objects[carth].counters.loyalty = 0;
  checkStateBasedActions(s);
  assert.deepEqual(named(s, exiled(s, 1)), ["Ajani Steadfast", "Bear", "Rancor"]);
  assert.deepEqual(voids(s, 1), [1, 1, 1]);
});

check("Mox Diamond's arrival is held for its question: Reckless Fireweaver sees it enter once a land is discarded, and never when it is declined", () => {
  const yes = play({setup: [at(0, "battlefield", "Reckless Fireweaver"), at(0, "hand", "Mox Diamond", "Forest")],
    steps: [{cast: "Mox Diamond"}, {resolve: true}, {choose: ["Discard Forest: Mox Diamond enters"]}, {settle: true}]});
  assert.equal(yes.players[1].life, 39);
  const run = runScenario({name: "w4d", expect: [], setup: [at(0, "battlefield", "Reckless Fireweaver"), at(0, "hand", "Mox Diamond", "Forest")],
    steps: [{cast: "Mox Diamond"}, {resolve: true}, {choose: ["Don't discard: Mox Diamond goes to the graveyard"]}, {settle: true}]}, index.definition, {});
  assert.equal(run.state.players[1].life, 40);
  const moves = run.events.filter((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.card?.name === "Mox Diamond").map((e) => `${e.data.fields.from?.zoneType}>${e.data.fields.to?.zoneType}`);
  assert.deepEqual(moves, ["Hand>Stack", "Stack>Graveyard"], "one move off the stack, said as the graveyard it went to");
});

check("Mox Diamond declined is a card put into a graveyard from anywhere: an opponent's, and Bloodchief Ascension drains", () => {
  const scen = loadCardScenarios().find((f) => f.scenarios.card === "Bloodchief Ascension").scenarios;
  const base = scen.scenarios[1];
  const s = runScenario({...base, setup: [...base.setup, at(1, "hand", "Mox Diamond")], expect: [],
    steps: [...base.steps, {to: {turn: 7, phase: "END_OF_TURN"}}, {settle: true}, {to: {turn: 8, phase: "MAIN1"}}, {cast: "Mox Diamond", seat: 1}, {resolve: true},
      {choose: ["Don't discard: Mox Diamond goes to the graveyard"]}, {settle: true}]}, index.definition, scen.fixtures).state;
  assert.equal(s.players[1].life, 28);
});

check("the activated ability: only an opponent's card with a void counter is chosen, and played free", () => {
  const s = play({library: ["Bear"], setup: [at(0, "battlefield", "Dauthi Voidwalker", "Island"), at(0, "hand", "Thought Scour")],
    steps: [{tap: "Island"}, {cast: "Thought Scour", targets: [{player: 1}]}, {resolve: true}, {activate: "Dauthi Voidwalker"}, {resolve: true}]});
  assert.equal(s.awaiting?.kind, "effect-choice");
  assert.deepEqual(named(s, s.awaiting.cards), ["Bear", "Wastes"]);
});

check("Mox Diamond declined: from the stack to the graveyard, never on the battlefield for what watches it", () => {
  const s = play({setup: [at(0, "battlefield", "Starfield Mystic", "Scrap Trawler"), at(0, "hand", "Mox Diamond", "Forest"), at(0, "graveyard", "Altar of Dementia")],
    steps: [{cast: "Mox Diamond"}, {resolve: true}, {choose: ["Don't discard: Mox Diamond goes to the graveyard"]}, {settle: true}]});
  assert.deepEqual(named(s, s.zones.graveyard[0]), ["Altar of Dementia", "Mox Diamond"]);
  assert.deepEqual(named(s, s.zones.hand[0]), ["Forest"]);
  assert.equal(s.stack.length, 0, "Scrap Trawler sees no artifact leave the battlefield");
});

check("Mox Diamond: the question offers each land card and not discarding; a discard enters it", () => {
  const s = play({setup: [at(0, "hand", "Mox Diamond", "Forest", "Island", "Bear")], steps: [{cast: "Mox Diamond"}, {resolve: true}]});
  assert.equal(s.awaiting?.kind, "entering-choice");
  assert.deepEqual(named(s, s.awaiting.discardInstead), ["Forest", "Island"]);
  const t = play({setup: [at(0, "hand", "Mox Diamond", "Island")], steps: [{cast: "Mox Diamond"}, {resolve: true}, {choose: ["Discard Island: Mox Diamond enters"]}]});
  assert.deepEqual(named(t, t.zones.battlefield), ["Mox Diamond"]);
  assert.deepEqual(named(t, t.zones.graveyard[0]), ["Island"]);
});

check("Mox Diamond with an opponent's Dauthi Voidwalker: declined, it is exiled with a void counter", () => {
  const s = play({setup: [at(0, "hand", "Mox Diamond"), at(1, "battlefield", "Dauthi Voidwalker")], steps: [{cast: "Mox Diamond"}, {resolve: true}, {settle: true}]});
  assert.deepEqual(named(s, exiled(s, 0)), ["Mox Diamond"]);
  assert.deepEqual(voids(s, 0), [1]);
});

check("retrace (Six): only a land card is discarded for it", () => {
  const s = play({setup: [at(0, "battlefield", "Six", "Forest", "Wastes"), at(0, "graveyard", "Bear"), at(0, "hand", "Forest", "Thought Scour")],
    steps: [{tap: "Forest"}, {tap: "Wastes"}]});
  const casts = legalActions(s, 0).filter((a) => a.kind === "cast" && s.objects[a.objectId]?.card === "Bear");
  assert.equal(casts.length, 1);
  assert.deepEqual(casts[0].costNames, ["Forest"]);
});

check("Necropotence: no draw step for its controller, while an opponent still draws", () => {
  const s = play({setup: [at(0, "battlefield", "Necropotence")], steps: [{to: {turn: 3, phase: "MAIN1"}}]});
  assert.equal(s.zones.library[0].length, 20);
  assert.equal(s.zones.library[1].length, 19);
});

check("Mesmeric Orb: the untap step's untapping triggers, waiting for the upkeep", () => {
  const s = play({setup: [at(0, "battlefield", "Mesmeric Orb", "Forest")], steps: [{tap: "Forest"}, {to: {turn: 3, phase: "UPKEEP"}}]});
  assert.equal(s.stack.length, 1);
  assert.equal(s.stack[0].kind, "trigger");
});

check("Hedge Shredder: a land card milled from the library comes in; one discarded does not", () => {
  const s = play({setup: [at(0, "battlefield", "Hedge Shredder", "Cephalid Coliseum", "Island"), at(0, "graveyard", "Bear", "Bear", "Bear", "Bear", "Bear", "Bear", "Bear")],
    library: ["Forest", "Forest", "Forest"],
    steps: [{tap: "Island"}, {activate: "Cephalid Coliseum", ability: "a1", targets: [{player: 0}]}, {resolve: true}, {answer: [0, 1, 2]}, {settle: true}]});
  assert.equal(s.zones.graveyard[0].filter((id) => s.objects[id].card === "Forest").length, 3);
});

check("a graveyard arrival is about the player whose graveyard it is: Bloodchief's \"that player\"", () => {
  const scen = loadCardScenarios().find((f) => f.scenarios.card === "Bloodchief Ascension").scenarios;
  const s = runScenario({...scen.scenarios[1], expect: []}, index.definition, scen.fixtures).state;
  assert.equal(s.players[1].life, 30);
});

check("Myr Retriever: the card it became is no target of its own trigger", () => {
  const s = play({setup: [at(0, "battlefield", "Myr Retriever", "Altar of Dementia")],
    steps: [{activate: "Altar of Dementia", sacrifice: "Myr Retriever", targets: [{player: 1}]}, {resolve: true}, {settle: true}]});
  assert.deepEqual(named(s, s.zones.hand[0]), []);
  assert.deepEqual(named(s, s.zones.graveyard[0]), ["Myr Retriever"]);
});

check("the player selector's life keys: Bloodghast's haste at 10, not at 11", () => {
  const hasty = (life) => { const s = play({startingLife: life, setup: [at(0, "battlefield", "Bloodghast")], steps: []});
    return characteristicsOf(s, s.zones.battlefield.find((id) => s.objects[id].card === "Bloodghast")).keywords.includes("Haste"); };
  assert.equal(hasty(10), true);
  assert.equal(hasty(11), false);
});

check("a graveyard's card is chosen, not searched for: Breach the Multiverse must take one that fits", () => {
  const scen = loadCardScenarios().find((f) => f.scenarios.card === "Breach the Multiverse").scenarios;
  const s = runScenario({...scen.scenarios[0], steps: scen.scenarios[0].steps.slice(0, 9), expect: []}, index.definition, scen.fixtures).state;
  assert.equal(s.awaiting?.kind, "effect-choice");
  assert.equal(s.awaiting.min, 1);
  assert.equal(s.awaiting.player, 0, "its caster chooses, in each player's graveyard");
});

/* Every card the lane wrote, through its scenarios. */
const LANE = ["Dauthi Voidwalker", "Emry, Lurker of the Loch", "Six", "Mox Diamond", "Green Sun's Zenith", "Haywire Mite", "Bloodchief Ascension",
  "Splendid Reclamation", "Midnight Clock", "Scrap Trawler", "Rancor", "Moldervine Reclamation", "Necropotence", "Reassembling Skeleton",
  "Altar of Dementia", "Myr Retriever", "Starfield Mystic", "Kaya's Ghostform", "Titania, Protector of Argoth", "Bloodghast",
  "Breach the Multiverse", "Mesmeric Orb", "Grisly Salvage", "Noxious Revival", "Hedge Shredder", "Cephalid Coliseum"];
const files = loadCardScenarios().filter((f) => LANE.includes(f.scenarios.card));
assert.equal(files.length, LANE.length, "each card the lane wrote has its scenarios");
for (const {scenarios: file} of files) for (const scenario of file.scenarios)
  check(`${file.card}: ${scenario.name}`, () => runScenario(scenario, index.definition, file.fixtures ?? {}));

console.log(`engine-w4d-graveyard: ${checks} checks passed — Dauthi Voidwalker's exile on every route to an opponent's graveyard, Mox Diamond's held arrival, retrace, skipped draws, untap triggers, and the lane's ${LANE.length} cards through their scenarios.`);
