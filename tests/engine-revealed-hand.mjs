/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (w2c-hands-triggers): A DISCARD CHOSEN FROM A REVEALED HAND (CR 701.9b, 701.20a), AND "ANY NUMBER".
 *
 * "Target opponent reveals their hand. You choose a nonland card from it. That player discards that card" (Render
 * Speechless, Stinging Vitriol, Dai Li Indoctrination, Auntie's Sentence): `discard` with `chooser: "you"` and `reveal:
 * true` -- every card of that hand said in the journal (and the table's history) and shown in every seat's view while its
 * card is chosen, the spell's controller asked which of the cards its `selector` fits, the hand's player discarding it.
 * And "target player discards any number of cards, then draws that many cards" (Steal the Show): `anyNumber`, from none to
 * every card, the discarder's choice, and "that many" what THAT player discarded. What the scenarios cannot reach: a third
 * seat's view and the leak judge's, the journal's words, the answers refused, a player leaving while asked, whose discard it
 * is, the house pilot's answer, and what the compiler refuses.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {ASKING} from "../game/engine/script/effects/asking.mjs";
import {historyLines} from "../game/room/history.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {secretsFor} from "../tools/fuzz-live.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const ok = (v, m) => { assert.ok(v, m); checks += 1; };
const throws = (f, ...m) => { assert.throws(f, ...m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const FIXTURES = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Rock: {types: ["Artifact"], manaCost: "{1}", colors: []},
  Shock: {types: ["Instant"], manaCost: "{R}", colors: ["R"]},
  /* "Each opponent reveals their hand. You choose two nonland cards from each. Those players discard those cards": each hand
     in turn, two of each. */
  Probe: {types: ["Sorcery"], manaCost: "{C}", colors: [], spell: {id: "s", text: "Each opponent reveals their hand. You choose two nonland cards from each. Those players discard those cards.",
    effects: [{effect: "discard", who: "opponent", chooser: "you", reveal: true, selector: {nonTypes: ["Land"]}, count: 2}]}},
  /* "Whenever a player discards a card, you gain 1 life" -- whose discard a chosen one is. */
  Watcher: {types: ["Enchantment"], manaCost: "{1}", colors: [], abilities: [{id: "w", kind: "triggered", text: "Whenever an opponent discards a card, you gain 1 life.",
    trigger: {on: "GameEventCardChangeZone", to: "Graveyard", discarded: true, discarder: "opponent"}, effects: [{effect: "gainLife", amount: 1}]}]},
};
const play = (scenario) => runScenario({expect: [], ...scenario}, cards.definition, FIXTURES);
const hand = (state, viewer, owner) => projectFor(state, viewer).players[owner].zones.Hand.cards.map((c) => c.name).sort();
const revealed = (events) => events.filter((e) => e.kind === "GameEventCardRevealed");
const SPEECHLESS = ["Swamp", "Plains", "Wastes", "Wastes"];
/* Render Speechless at Maya, three players (Trey the third), cast and resolved to Rob's choice. */
const speechless = (steps = [], seats = 3, mayaHand = ["Bear", "Shock", "Forest"]) => play({name: "speechless", seats,
  setup: [at(0, "battlefield", ...SPEECHLESS), at(0, "hand", "Render Speechless"), at(1, "hand", ...mayaHand), at(1, "battlefield", "Watcher")],
  steps: [...SPEECHLESS.map((tap) => ({tap})), {cast: "Render Speechless", targets: [{player: 1}, []]}, {resolve: true}, ...steps]});

{
  /* Asking Rob: her whole hand in Trey's view and his, as well as her own -- the land too, which is not offered -- and the
     leak judge agrees none of it is a secret from Trey. Rob is asked, not Maya, among the nonland cards. */
  const {state, events} = speechless();
  eq([state.awaiting?.effect, state.awaiting?.player, state.awaiting?.from], ["discard", 0, 1], "the discard asks Rob, about Maya's hand");
  eq([hand(state, 2, 1), hand(state, 0, 1), hand(state, 1, 1)], [["Bear", "Forest", "Shock"], ["Bear", "Forest", "Shock"], ["Bear", "Forest", "Shock"]], "Trey's view, Rob's and her own: all three of her cards");
  eq(["Bear", "Shock", "Forest"].filter((name) => secretsFor(state, 2).has(name)), [], "the leak judge: none of them is Trey's secret");
  eq(projectFor(state, 2).players[1].zones.Hand.hiddenCount, 0, "and nothing of her hand hidden from him");
  const choice = awaitingChoice(state);
  eq([choice.id.startsWith("discard-from:1:"), choice.min, choice.max, choice.options.map((o) => o.label).sort()], [true, 1, 1, ["Bear", "Shock"]], "one of her nonland cards: the Bear or the Shock");
  eq(revealed(events).map((e) => [e.data.fields.player.playerId, e.data.fields.card.name]).sort(), [[1, "Bear"], [1, "Forest"], [1, "Shock"]], "every card of her hand revealed in the journal, as hers");
  eq(revealed(events).flatMap((e) => historyLines(e, ["Rob", "Maya", "Trey"]).map((l) => l.text)).sort(), ["Maya revealed Bear", "Maya revealed Forest", "Maya revealed Shock"], "and the table's history says so");
  eq(JSON.parse(JSON.stringify(state.awaiting)), state.awaiting, "what each seat is shown is the question, plain data, kept with a checkpoint");
  /* The answers the rules refuse: none, two, an index past the offer. */
  for (const bad of [[], [0, 1], [2]]) throws(() => resolveAwaiting(structuredClone(state), bad), /Invalid selection/, `refused: ${JSON.stringify(bad)}`);
  /* The house pilot answers it within its bounds. */
  const answer = housePilot({seat: 0}).answer(projectFor(state, 0), choice);
  ok(answer.indices.length === 1 && answer.indices[0] < 2, "the house pilot picks one of the two");
}
{
  /* Answered: the Shock discarded -- by Maya, her discard, Rob's count of discards untouched; her hand hidden again from Trey
     and Rob, the question gone. */
  const {state, events} = speechless([{choose: ["Shock"]}]);
  const gone = events.find((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.discarded === true);
  eq([gone?.data.fields.card.name, gone?.data.fields.from.player.playerId], ["Shock", 1], "the Shock discarded from Maya's hand, as her discard");
  eq([state.players[1].discardedThisTurn, state.players[0].discardedThisTurn ?? 0], [1, 0], "counted as hers this turn, not his");
  eq([hand(state, 2, 1), hand(state, 0, 1), hand(state, 1, 1)], [[], [], ["Bear", "Forest"]], "done: only she sees her hand");
  eq(state.awaiting ?? null, null, "nothing asked, so nothing shown");
  eq(["Bear", "Forest"].filter((name) => secretsFor(state, 2).has(name)), ["Bear", "Forest"], "the leak judge: they are Trey's secrets again (the journal is what remembers them)");
}
{
  /* Whose discard: Rob's Watcher ("whenever an opponent discards a card") sees Maya's; her own does not. */
  const {state} = play({name: "watcher", setup: [at(0, "battlefield", ...SPEECHLESS, "Watcher"), at(0, "hand", "Render Speechless"), at(1, "hand", "Bear")],
    steps: [...SPEECHLESS.map((tap) => ({tap})), {cast: "Render Speechless", targets: [{player: 1}, []]}, {resolve: true}, {choose: ["Bear"]}, {resolve: true}]});
  eq([state.players[0].life, state.players[1].life], [41, 40], "Rob's Watcher: Maya, his opponent, discarded -- he gains 1");
}
{
  /* Maya leaves the game while Rob chooses: her hand left with her, nothing is discarded, and the rest of the spell goes on. */
  const {state} = speechless();
  concede(state, 1, createRng("leave"));
  eq([state.awaiting?.effect ?? null, state.awaiting?.player, hand(state, 2, 1)], ["discard", 0, []], "still asking Rob; her hand gone with her, shown to nobody");
  const events = resolveAwaiting(state, [0]);
  eq([events.filter((e) => e.data?.fields?.discarded).length, state.resolving ?? null, state.awaiting ?? null], [0, null, null], "answered: nothing discarded, the spell done");
}
{
  /* Rob leaves while he chooses: the spell left with him (CR 800.4a), nothing is discarded, nothing shown. */
  const {state} = speechless();
  concede(state, 0, createRng("leave"));
  eq([hand(state, 1, 1), state.zones.graveyard[1].length, hand(state, 2, 1), state.awaiting?.effect ?? null], [["Bear", "Forest", "Shock"], 0, [], null], "her hand kept whole, shown to Trey no more, nothing asked");
}
{
  /* A hand only chosen from by its own player is no hand revealed (Perfect Intimidation: "target opponent exiles two cards
     from their hand"): while Maya chooses, Rob sees none of it. */
  const {state} = play({name: "exiles", setup: [at(0, "battlefield", "Swamp", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Perfect Intimidation"), at(1, "hand", "Bear", "Rock", "Forest")],
    steps: [{tap: "Swamp"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Perfect Intimidation", modes: [0], targets: [{player: 1}]}, {resolve: true}]});
  eq([state.awaiting?.player, hand(state, 0, 1), hand(state, 1, 1)], [1, [], ["Bear", "Forest", "Rock"]], "Maya asked; Rob's view of her hand empty, hers whole");
}
{
  /* Asked as the rules would ask it of a controller who has left (script/resolution.mjs, answerDeparted): nothing is
     discarded. */
  const {state} = speechless();
  eq([ASKING.discard.left(state, state.awaiting), state.zones.graveyard[1].length], [[], 0], "nothing discarded for a chooser who has gone");
}
{
  /* Each opponent's hand in turn, four players: Maya's first, then Trey's (Sam has none), two of each; nothing discarded until
     the last is chosen, and then all of it, each by its own player. Two of a kind chosen twice is refused. */
  const probe = (steps) => play({name: "probe", seats: 4, setup: [at(0, "battlefield", "Wastes"), at(0, "hand", "Probe"), at(1, "hand", "Bear", "Rock", "Forest"), at(2, "hand", "Shock", "Rock", "Bear")],
    steps: [{tap: "Wastes"}, {cast: "Probe"}, {resolve: true}, ...steps]});
  const first = probe([]);
  eq([first.state.awaiting.from, awaitingChoice(first.state).min, awaitingChoice(first.state).options.map((o) => o.label).sort(), hand(first.state, 3, 1)],
    [1, 2, ["Bear", "Rock"], ["Bear", "Forest", "Rock"]], "Maya's hand first: two of her nonland cards, her hand shown to Sam");
  throws(() => resolveAwaiting(structuredClone(first.state), [0, 0]), "the same card twice: refused");
  const second = probe([{answer: [0, 1]}]);
  eq([second.state.awaiting.from, hand(second.state, 3, 1), hand(second.state, 3, 2), second.state.zones.graveyard[1].length], [2, [], ["Bear", "Rock", "Shock"], 0],
    "then Trey's, shown in its turn and hers no longer; nothing discarded yet");
  const done = probe([{answer: [0, 1]}, {answer: [0, 2]}]);
  eq([done.state.zones.graveyard[1].map((id) => done.state.objects[id].card).sort(), done.state.zones.graveyard[2].map((id) => done.state.objects[id].card).sort(), done.state.awaiting ?? null],
    [["Bear", "Rock"], ["Bear", "Shock"], null], "then both pairs discarded at once");
  eq(revealed(done.events).length, 6, "every card of both hands revealed once; Sam's empty hand none");
}
{
  /* Dai Li Indoctrination: "a nonland permanent card" -- not a land, not an instant or sorcery. */
  const dai = play({name: "dai", setup: [at(0, "battlefield", "Swamp", "Wastes"), at(0, "hand", "Dai Li Indoctrination"), at(1, "hand", "Shock", "Forest", "Render Speechless", "Bear", "Rock")],
    steps: [{tap: "Swamp"}, {tap: "Wastes"}, {cast: "Dai Li Indoctrination", modes: [0], targets: [{player: 1}]}, {resolve: true}]});
  eq(awaitingChoice(dai.state).options.map((o) => o.label).sort(), ["Bear", "Rock"], "the Bear and the Rock, never the Shock, the sorcery or the Forest");
  /* Nothing in her hand fits: all five revealed, nobody asked. */
  const none = play({name: "none", setup: [at(0, "battlefield", "Swamp", "Wastes"), at(0, "hand", "Dai Li Indoctrination"), at(1, "hand", "Shock", "Forest")],
    steps: [{tap: "Swamp"}, {tap: "Wastes"}, {cast: "Dai Li Indoctrination", modes: [0], targets: [{player: 1}]}, {resolve: true}]});
  eq([none.state.awaiting ?? null, revealed(none.events).length, none.state.zones.graveyard[1].length], [null, 2, 0], "nothing that fits: both revealed, nobody asked, nothing discarded");
  /* An empty hand reveals nothing. */
  const empty = play({name: "empty", setup: [at(0, "battlefield", "Swamp", "Wastes"), at(0, "hand", "Dai Li Indoctrination")],
    steps: [{tap: "Swamp"}, {tap: "Wastes"}, {cast: "Dai Li Indoctrination", modes: [0], targets: [{player: 1}]}, {resolve: true}]});
  eq([empty.state.awaiting ?? null, revealed(empty.events).length], [null, 0], "an empty hand: nothing revealed, nothing asked");
}
{
  /* Steal the Show at Maya: any number, her choice -- all three, then three drawn; the question is hers, from none up. */
  const steal = (steps) => play({name: "steal", setup: [at(0, "battlefield", "Mountain", "Wastes", "Wastes"), at(0, "hand", "Steal the Show", "Bear"), at(1, "hand", "Bear", "Rock", "Forest")],
    steps: [{tap: "Mountain"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Steal the Show", modes: [0], targets: [{player: 1}]}, {resolve: true}, ...steps]});
  const asking = steal([]);
  const choice = awaitingChoice(asking.state);
  eq([asking.state.awaiting.player, choice.title, choice.min, choice.max], [1, "Discard any number of cards", 0, 3], "Maya is asked: none to all three");
  const all = steal([{answer: [0, 1, 2]}]);
  eq([projectFor(all.state, 1).players[1].zones.Hand.count, all.state.zones.graveyard[1].length, projectFor(all.state, 0).players[0].zones.Hand.count], [3, 3, 1],
    "all three discarded, three drawn -- what SHE discarded; Rob's own hand untouched");
  throws(() => resolveAwaiting(structuredClone(asking.state), [0, 0]), "the same card twice: refused");
}
{
  /* What the compiler refuses: a chooser without a revealed hand, a reveal alone, a chosen discard of "up to", and a count
     beside "any number". */
  const script = (effect) => ({schema: "CrankCardScript@1", identity: {name: "Probe", oracleId: "x", types: ["Sorcery"], subtypes: [], manaCost: "{B}", colors: ["B"], colorIdentity: ["B"]}, oracleText: "Probe.",
    abilities: [{kind: "spell", text: "Probe.", targets: [{what: "player", who: "opponent"}], effects: [{effect: "discard", who: {target: 0}, count: 1, ...effect}]}]});
  const refused = (effect) => compileScript(script(effect)).problems.some((p) => p.startsWith("discard:"));
  eq([refused({chooser: "you", reveal: true}), refused({chooser: "you"}), refused({reveal: true}), refused({chooser: "you", reveal: true, upTo: true}),
    refused({chooser: "that player", reveal: true}), refused({chooser: "you", reveal: true, anyNumber: true, count: undefined}), refused({chooser: "you", reveal: true, random: true}),
    refused({chooser: "you", reveal: true, all: true}), refused({chooser: "you", reveal: false})], [false, true, true, true, true, true, true, true, true], "chooser and reveal together, nothing else");
  const any = (effect) => compileScript(script(effect)).problems.some((p) => p.startsWith("discard: anyNumber"));
  eq([any({anyNumber: true, count: undefined}), any({anyNumber: true}), any({anyNumber: false, count: undefined}), any({anyNumber: true, count: undefined, upTo: true})], [false, true, true, true], "anyNumber true, with no count and no up to");
}

console.log(`engine-revealed-hand: ${checks} checks passed -- a hand revealed for its card to be chosen by another player is shown to every seat while it is chosen, named in the journal, and discarded by its own player; any number is the discarder's choice, and that many what they discarded.`);
