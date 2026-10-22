/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE LIBRARY LOAD'S COMBAT LANE (L4, 2026-10-21; docs/engine/library-load-2026-10-21/): what the scenarios of its cards
 * cannot reach.
 *
 *   - BEGINNING THE GAME WITH IT ON THE BATTLEFIELD (CR 103.6a; Leyline Axe): any player's opening hand, the starting
 *     player's too -- Gemstone Caverns' rule without its "not the starting player" (rules/mulligan.mjs).
 *   - "MUST BE BLOCKED IF ABLE" (CR 509.1c; Vinebred Brawler): the defending player blocks as many such attackers as can be
 *     blocked at once -- a declaration short of it refused, saying what to do; no more asked than can be obeyed together (two
 *     required and one blocker; a menace attacker by two; one that can't be blocked by more than one, never by two); and the
 *     house pilot, the scored pilot and the random one each meet it (rules/combat.mjs, blockRequirements; pilots).
 *   - "CAN'T BE BLOCKED BY MORE THAN ONE CREATURE" (CR 509.1b; Safewright Cavalry): a second blocker refused, and the record's
 *     cap every answerer keeps to (keywords/combat.mjs; controller.mjs).
 *   - {Q}, THE UNTAP SYMBOL (CR 107.6; Umbral Mantle's granted ability): a summoning-sick creature waits for it as for {T}.
 *   - SADDLE (CR 702.171; Bounding Felidar): not helped by "crews Vehicles as though its power were greater"; what the
 *     compiler refuses of it and of bushido (CR 702.45); "while" on an attack trigger alone besides a cast trigger.
 *   - "ATTACKS YOU OR A PLANESWALKER YOU CONTROL" (Revenge of Ravens): a planeswalker of yours attacked triggers it; another
 *     player's does not.
 */
import {play, drive, asked, idOf, compiled, index, checks, creature, at, labels, choose, pilotsAnswer} from "./helpers/x11-keywords.mjs";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {beginMulligans} from "../game/engine/rules/mulligan.mjs";
import {blockers} from "../game/engine/rules/combat.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {meetRequirements, housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {scoredPilot} from "../game/engine/pilots/scored-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {createController} from "../game/engine/controller.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardScenarios} from "../game/tools/engine-cards.mjs";

const {eq, ok, throws, done} = checks("engine-libload-l4-combat");
const MUST = {id: "must", kind: "static", rule: "must-be-blocked", affects: {what: "permanent", self: true}};
const ONE = {id: "one", kind: "static", rule: "blocked-by-one-at-most", affects: {what: "permanent", self: true}};
const FIX = {
  "Their Bear": creature(["Bear"], 2, 2), "Their Other Bear": creature(["Bear"], 2, 2), "Their Sturdy Bear": creature(["Bear"], 2, 3),
  "Menacing Brute": creature(["Ogre"], 3, 3, {keywords: ["Menace"], abilities: [MUST]}),
  "Lone Brute": creature(["Ogre"], 3, 3, {keywords: ["Menace"], abilities: [MUST, ONE]}),
  "Big Brute": creature(["Ogre"], 5, 5, {abilities: [MUST]}),
  Samurai: {...compiled([{kind: "keyword", text: "Bushido 2", keyword: "bushido", amount: 2}], {subtypes: ["Samurai"], power: 2, toughness: 2}).definition},
  Pilot: creature(["Pilot"], 1, 1, {abilities: [{id: "p", kind: "static", rule: "crews-with-more", amount: 2, affects: {what: "permanent", self: true}}]}),
  Jace: {types: ["Planeswalker"], subtypes: ["Jace"], manaCost: "{3}{U}", colors: ["U"], loyalty: 5},
};
/* The blockers question, as Maya is asked it once Rob's named creatures attack her. */
function blocking(rob, maya, attackers, more = {}) {
  const s = play([at(0, "battlefield", ...rob), at(1, "battlefield", ...maya)], [{attack: attackers}], more, FIX);
  /* An attack trigger's target on the way (two Brawlers, each "another target Elf"): its first. */
  return drive(s, asked("declare-blockers"), {answer: (state) => (state.awaiting.kind === "trigger-targets" ? [0] : null)});
}
const optionOf = (s, blocker, attacker) => awaitingChoice(s).options.find((o) => o.label === `${blocker} blocks ${attacker}`).index;
const blocked = (s, attacker) => s.combat.attacks.find((a) => s.objects[a.attacker].card === attacker)?.blockers.map((b) => s.objects[b].card) ?? [];

/* ---- Leyline Axe: begun on the battlefield from any opening hand (CR 103.6a) ---- */
const AXE = "Leyline Axe";
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
function opening(hands) {
  const s = createState({matchId: "m", seed: "axe", players: ["Rob", "Maya"].map((name) => ({name}))});
  hands.forEach((cards, seat) => { for (const name of cards) addObject(s, {...(name === "Wastes" ? WASTES : {...index.definition(name), card: name}), owner: seat, controller: seat}, "library", seat); });
  const rng = createRng("axe");
  beginMulligans(s, rng);
  while (s.awaiting?.kind === "mulligan-decision") resolveAwaiting(s, [0], null, rng);
  return s;
}
const SEVEN = (first) => [first, "Wastes", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes"];
const axeOn = (s, owner) => s.zones.battlefield.filter((id) => s.objects[id].card === AXE && s.objects[id].owner === owner).length;
{
  const s = opening([SEVEN(AXE), SEVEN(AXE)]);
  /* Rob, the starting player, is asked first: nothing on the card says otherwise (unlike Gemstone Caverns). */
  eq([s.awaiting?.kind, s.awaiting?.player, labels(s)], ["opening-hand", 0, [`Begin the game with ${AXE} on the battlefield`, "Begin the game"]], "the starting player is asked");
  choose(s, `Begin the game with ${AXE} on the battlefield`);
  eq([axeOn(s, 0), s.awaiting?.player], [1, 1], "on Rob's battlefield, nothing exiled for it; then Maya is asked");
  choose(s, "Begin the game");
  eq([axeOn(s, 1), s.mulligan.done, cardsIn(s, "hand", 1).length], [0, true, 7], "Maya declines: her Axe stays in her hand of seven");
}

/* ---- Vinebred Brawler: must be blocked if able (CR 509.1c) ---- */
{
  const s = blocking(["Vinebred Brawler", "Wastes"], ["Their Bear"], ["Vinebred Brawler"]);
  const choice = awaitingChoice(s), brawler = idOf(s, "Vinebred Brawler");
  const WHY = "Vinebred Brawler must be blocked if able. Declare a creature that can block it as its blocker.";
  eq(choice.requires, [{by: "attackerId", values: [brawler], least: 1, why: WHY}], "the record requires it blocked, with what to do");
  eq(blockers.check(s, s.awaiting, []).reasons, [WHY], "no block: the board's check says why");
  throws(() => resolveAwaiting(structuredClone(s), []), /Vinebred Brawler must be blocked if able/, "and the declaration is refused");
  eq(meetRequirements(choice, []), [optionOf(s, "Their Bear", "Vinebred Brawler")], "met: the Bear blocks it");
  /* Every pilot the room seats meets it: the house pilot (L0), the random one, and the scored pilot (L1). */
  for (const after of pilotsAnswer(s)) eq(blocked(after, "Vinebred Brawler"), ["Their Bear"], "a pilot blocks it");
  const scored = scoredPilot({seat: 1}).answer(projectFor(s, 1), choice);
  const copy = structuredClone(s);
  resolveAwaiting(copy, scored.indices, null, createRng("l4"));
  eq(blocked(copy, "Vinebred Brawler"), ["Their Bear"], "the scored pilot blocks it too");
}
{
  /* With Rob's Bear attacking too, a block on the Bear alone is refused; blocking the Brawler is enough. */
  const s = blocking(["Vinebred Brawler", "Bear"], ["Their Bear"], ["Vinebred Brawler", "Bear"]);
  throws(() => resolveAwaiting(structuredClone(s), [optionOf(s, "Their Bear", "Bear")]), /must be blocked if able/, "the other attacker blocked instead: refused");
  resolveAwaiting(s, [optionOf(s, "Their Bear", "Vinebred Brawler")]);
  eq(blocked(s, "Vinebred Brawler"), ["Their Bear"], "the Brawler blocked: taken");
}
{
  /* Two required, one creature to block with: one of them must be -- either -- and no more. */
  const s = blocking(["Vinebred Brawler", "Vinebred Brawler"], ["Their Bear"], ["Vinebred Brawler", "Vinebred Brawler"]);
  const choice = awaitingChoice(s);
  eq([choice.requires[0].least, choice.requires[0].values.length], [1, 2], "one of the two");
  ok(/one of them can be blocked at once/.test(choice.requires[0].why), "said: one of them can be blocked at once");
  for (const option of choice.options) eq(blockers.check(s, s.awaiting, [option.index]).reasons, [], `${option.label}: taken`);
}
{
  /* Nothing of Maya's can block it -- her Bear is tapped: nothing required, and it deals its 4. */
  const s = play([at(0, "battlefield", "Vinebred Brawler"), at(1, "battlefield", "Their Bear")], [], {}, FIX);
  s.objects[idOf(s, "Their Bear")].tapped = true;
  drive(s, asked("declare-attackers"));
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label.startsWith("Vinebred Brawler")).index]);
  drive(s, (x) => x.phase === "MAIN2", {answer: (state, choice) => (state.awaiting.kind === "declare-blockers" ? (eq(choice.requires, undefined, "her Bear tapped: nothing required"), []) : null)});
  eq(s.players[1].life, 36, "unblocked: 4 to her");
}
{
  /* Two Brawlers, two Bears: both must be blocked, each by its own Bear -- the requirement met with two blockers, never one twice. */
  const s = blocking(["Vinebred Brawler", "Vinebred Brawler"], ["Their Bear", "Their Other Bear"], ["Vinebred Brawler", "Vinebred Brawler"]);
  const choice = awaitingChoice(s), met = meetRequirements(choice, []);
  eq([choice.requires[0].least, met.length, blockers.check(s, s.awaiting, met).reasons], [2, 2, []], "both blocked, by different Bears");
}
{
  /* A 5/5 that must be blocked, and a 2/2 to block it with: a chump block no pilot would choose -- every pilot makes it. */
  const s = blocking(["Big Brute"], ["Their Bear"], ["Big Brute"]);
  const choice = awaitingChoice(s);
  eq(housePilot({seat: 1}).answer(projectFor(s, 1), choice).indices, [optionOf(s, "Their Bear", "Big Brute")], "the house pilot chumps, as required");
  eq(scoredPilot({seat: 1}).answer(projectFor(s, 1), choice).indices, [optionOf(s, "Their Bear", "Big Brute")], "the scored pilot too");
  for (const after of pilotsAnswer(s)) eq(blocked(after, "Big Brute"), ["Their Bear"], "and the random one");
  /* The controller holds a browser's answer to it as the room does: none refused, with the record's words. */
  const controller = createController(), offered = controller.offer(choice);
  throws(() => controller.answer({actionId: "00000000-0000-4000-8000-000000000001", revision: controller.revision ?? 1, kind: "answer", choiceId: offered.id, indices: []}),
    /Big Brute must be blocked if able/, "the controller refuses no block");
}
{
  /* The menace Brute's two, held by the controller too: one Bear is not enough. */
  const s = blocking(["Menacing Brute"], ["Their Bear", "Their Other Bear"], ["Menacing Brute"]);
  const controller = createController(), offered = controller.offer(awaitingChoice(s));
  throws(() => controller.answer({actionId: "00000000-0000-4000-8000-000000000002", revision: controller.revision ?? 1, kind: "answer", choiceId: offered.id,
    indices: [optionOf(s, "Their Bear", "Menacing Brute")]}), /Menacing Brute must be blocked if able/, "one of the two: refused by the controller");
}
{
  /* One that can't be blocked (menace, and one blocker at most) beside one that can: the pilots' answer blocks the one that
     can, never the other with two. */
  const s = blocking(["Lone Brute", "Vinebred Brawler"], ["Their Bear", "Their Other Bear"], ["Lone Brute", "Vinebred Brawler"]);
  const met = meetRequirements(awaitingChoice(s), []);
  eq([blockers.check(s, s.awaiting, met).reasons, met.map((i) => awaitingChoice(s).options[i].label)], [[], ["Their Bear blocks Vinebred Brawler"]], "met legally");
}
{
  /* A menace attacker that must be blocked: by two, if she has two -- one alone is refused, and the pilots find the two. */
  const s = blocking(["Menacing Brute"], ["Their Bear", "Their Other Bear"], ["Menacing Brute"]);
  const choice = awaitingChoice(s), brute = idOf(s, "Menacing Brute");
  eq([choice.requires[0].least, choice.requires[0].per], [1, {[brute]: 2}], "one attacker, by two blockers");
  throws(() => resolveAwaiting(structuredClone(s), [optionOf(s, "Their Bear", "Menacing Brute")]), /menace/, "one blocker: refused");
  eq(meetRequirements(choice, []).length, 2, "the requirement met with two");
  for (const after of pilotsAnswer(s)) eq(blocked(after, "Menacing Brute").length, 2, "a pilot blocks it with both Bears");
  /* With one Bear, it cannot be blocked at all: nothing required. */
  eq(awaitingChoice(blocking(["Menacing Brute"], ["Their Bear"], ["Menacing Brute"])).requires, undefined, "one Bear: no requirement");
  /* Menace, and can't be blocked by more than one: never blocked, nothing required. */
  eq(awaitingChoice(blocking(["Lone Brute"], ["Their Bear", "Their Other Bear"], ["Lone Brute"])).requires, undefined, "menace and one at most: no requirement");
}
{
  /* Three players: Rob's Brawler at Trey; Maya, asked first about nothing of hers, is not required. */
  const s = play([at(0, "battlefield", "Vinebred Brawler"), at(1, "battlefield", "Their Bear"), at(2, "battlefield", "Their Other Bear")],
    [{attack: ["Vinebred Brawler"], at: "Trey"}], {seats: 3}, FIX);
  drive(s, asked("declare-blockers"));
  eq([s.awaiting.player, awaitingChoice(s).requires?.[0]?.least], [2, 1], "Trey is asked, and required");
}

/* ---- Safewright Cavalry: can't be blocked by more than one creature (CR 509.1b) ---- */
{
  const s = blocking(["Safewright Cavalry"], ["Their Bear", "Their Other Bear"], ["Safewright Cavalry"]);
  const choice = awaitingChoice(s), cavalry = idOf(s, "Safewright Cavalry");
  const WHY = "Safewright Cavalry can't be blocked by more than one creature. Choose one creature to block it.";
  eq(choice.capped, {by: "attackerId", most: {[cavalry]: 1}, why: {[cavalry]: WHY}}, "the record caps it at one, saying why");
  const both = [optionOf(s, "Their Bear", "Safewright Cavalry"), optionOf(s, "Their Other Bear", "Safewright Cavalry")];
  eq(blockers.check(s, s.awaiting, both).reasons, [WHY], "two blockers: the board's check says why");
  throws(() => resolveAwaiting(structuredClone(s), both), /can't be blocked by more than one creature/, "and refused");
  for (const after of pilotsAnswer(s)) ok(blocked(after, "Safewright Cavalry").length <= 1, "a pilot blocks it with one at most");
  resolveAwaiting(s, [both[1]]);
  eq(blocked(s, "Safewright Cavalry"), ["Their Other Bear"], "one blocker: taken");
}

/* ---- Umbral Mantle's {Q} (CR 107.6, 302.6) ---- */
{
  const offered = (s, name) => legalActions(s, 0).filter((a) => a.kind === "activate" && s.objects[a.objectId]?.card === name).length;
  const sick = play([at(0, "battlefield", "Umbral Mantle", "Wastes", "Wastes", "Wastes"), {seat: 0, zone: "battlefield", cards: ["Bear"], sick: true}],
    [{activate: "Umbral Mantle", targets: [{card: "Bear"}]}, {resolve: true}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}], {}, FIX);
  sick.objects[idOf(sick, "Bear")].tapped = true;
  eq(offered(sick, "Bear"), 0, "tapped, but summoning sick: {Q} waits as {T} does");
  const ready = play([at(0, "battlefield", "Umbral Mantle", "Bear", "Wastes", "Wastes", "Wastes")],
    [{activate: "Umbral Mantle", targets: [{card: "Bear"}]}, {resolve: true}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}], {}, FIX);
  eq(offered(ready, "Bear"), 0, "untapped: nothing to untap");
  ready.objects[idOf(ready, "Bear")].tapped = true;
  eq(offered(ready, "Bear"), 1, "tapped, and not sick: offered");
}

/* ---- Saddle and bushido: the compiler, and crew's "as though" (CR 702.171, 702.45) ---- */
{
  const felidar = (rob) => play([at(0, "battlefield", "Bounding Felidar", ...rob)], [], {}, FIX);
  const saddles = (s) => legalActions(s, 0).filter((a) => a.kind === "activate" && s.objects[a.objectId]?.card === "Bounding Felidar").length;
  eq(saddles(felidar(["Pilot"])), 0, "a Pilot that crews as though its power were 2 greater does not saddle so");
  eq(saddles(felidar(["Pilot", "Squirrel"])), 1, "the Pilot and a Squirrel, power 2 together: offered");
  const problems = (abilities, identity) => compiled(abilities, identity).problems;
  ok(problems([{kind: "keyword", text: "Saddle 2", keyword: "saddle", amount: 2}], {subtypes: ["Cat"]}).some((p) => /not a Mount/.test(p)), "saddle on a creature that is not a Mount: refused");
  ok(problems([{kind: "keyword", text: "Saddle", keyword: "saddle"}], {subtypes: ["Mount"]}).some((p) => /saddle needs its number/.test(p)), "saddle without its number: refused");
  ok(problems([{kind: "keyword", text: "Bushido", keyword: "bushido"}]).some((p) => /bushido needs its number/.test(p)), "bushido without its number: refused");
  eq(problems([{kind: "keyword", text: "Bushido 2", keyword: "bushido", amount: 2}]), [], "bushido 2: compiled");
  const samurai = blocking(["Samurai"], ["Their Sturdy Bear"], ["Samurai"]);
  resolveAwaiting(samurai, [optionOf(samurai, "Their Sturdy Bear", "Samurai")]);
  drive(samurai, (x) => x.phase === "COMBAT_DAMAGE" || x.phase === "MAIN2");
  eq([samurai.objects[idOf(samurai, "Samurai")]?.card, (projectFor(samurai, 0).players[0].zones.Battlefield.cards.find((c) => c.name === "Samurai") ?? {}).power], ["Samurai", 4], "bushido 2: +2/+2 as it becomes blocked");
  const script = (trigger) => ({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "odd", types: ["Creature"], subtypes: [], manaCost: "{1}", colors: ["G"], colorIdentity: ["G"], power: 1, toughness: 1},
    oracleText: "x", source: "hand", abilities: [{kind: "triggered", text: "x", trigger, effects: [{effect: "gainLife", amount: 1}]}]});
  eq(validateScript(script({on: "attacks", who: "self", while: {saddled: true}})).errors ?? [], [], "while saddled, on an attack trigger: valid");
  ok((validateScript(script({on: "enters", who: "self", while: {saddled: true}})).errors ?? []).some((e) => /While/.test(e.message)), "while on an enters trigger: refused");
  ok((validateScript(script({on: "attacks", who: "self", while: {saddled: "yes"}})).errors ?? []).some((e) => /saddled is true or false/.test(e.message)), "saddled is true or false");
}

/* ---- Revenge of Ravens: "attacks you or a planeswalker you control" ---- */
{
  const s = play([at(0, "battlefield", "Revenge of Ravens", "Jace"), at(1, "battlefield", "Their Bear")],
    [{to: {turn: 2, phase: "MAIN1"}}, {attack: ["Their Bear"], at: "Jace (Rob)"}, {settle: true}], {}, FIX);
  eq([s.players[0].life, s.players[1].life], [41, 39], "Rob's planeswalker attacked: Maya loses 1, Rob gains 1");
  const t = play([at(0, "battlefield", "Revenge of Ravens"), at(1, "battlefield", "Their Bear"), at(2, "battlefield", "Jace")],
    [{to: {turn: 2, phase: "MAIN1"}}, {attack: ["Their Bear"], at: "Jace (Trey)"}, {settle: true}], {seats: 3}, FIX);
  eq([t.players[0].life, t.players[1].life], [40, 40], "Trey's planeswalker attacked: nothing for Rob");
}

/* ---- The lane's cards, each scenario (as tests/engine-cards.mjs runs every card's): the breaks file's quickest catch ---- */
{
  const lane = new Set(["Leyline Axe", "Umbral Mantle", "Cartel Aristocrat", "Teysa, Envoy of Ghosts", "Kaalia of the Vast", "Atarka, World Render",
    "Inti, Seneschal of the Sun", "Revenge of Ravens", "Bark of Doran", "Baseball Bat", "Black Knight", "Bounding Felidar", "Bristlepack Sentry",
    "Danitha, Spear of Agony", "Fear of Failed Tests", "Hand of Honor", "Safewright Cavalry", "Spring Splasher", "Vinebred Brawler", "Warren Torchmaster"]);
  let runs = 0;
  for (const {scenarios: file} of loadCardScenarios()) {
    if (!lane.has(file.card)) continue;
    for (const scenario of file.scenarios) { runScenario(scenario, index.definition, file.fixtures ?? {}); runs += 1; }
    lane.delete(file.card);
  }
  eq(lane.size, 0, "every one of the twenty defined");
  ok(runs >= 60, `their ${runs} scenarios played`);
}

done("Leyline Axe begun on the battlefield, must be blocked if able met by the most that can be blocked and by every pilot, one blocker at most, {Q}, saddle and bushido refusals, and Revenge of Ravens on a planeswalker");
