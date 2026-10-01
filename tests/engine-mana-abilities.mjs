/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ENGINE 2.4b: THE MANA, AND WHAT HAPPENS AFTER A PLAYER ACTS.
 *
 * Rob's decks are a third lands, and most of those are not basics. This holds what lets them play:
 *   1. A mana ability that CHOOSES is offered once per thing it can add (CR 605.3a, as a cast is once per aim):
 *      "{W} or {U}", any color, and any color in your commander's color identity (CR 903.4) -- none without a
 *      commander (903.4f), both commanders' together with partners (702.124c). `produce` is part of the offer.
 *   2. A mana ability may COST more than {T}: a Signet's {1}, life, and a pain land's damage, all at once and off the
 *      stack.
 *   3. "Nothing to do" counts each source once, at the most it can add net of its cost: a Sol Ring is two.
 *   4. A land PLAYED enters through its replacements (CR 614.12): "enters tapped", and "unless you control a Forest or
 *      a Plains" -- a land with that subtype, the player's own.
 *   5. After ANY action the pass count starts over (CR 117.3c, 117.4) and state-based actions and triggers come before
 *      priority (CR 117.5): a gain land's trigger on the land drop, a pain land's last point of life.
 *   6. "You have no maximum hand size" (CR 402.2), a selector's `subtypes`, and a first striker that has left combat
 *      (CR 506.4) making no first-strike step.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction, nothingToDo, manaAlternatives, commanderIdentity} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {selectMatching} from "../game/engine/script/filter.mjs";
import {combatNeedsFirstStrike} from "../game/engine/keywords/combat.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (f, re, m) => { assert.throws(f, re, m); checks += 1; };

const WASTES = {card: "Wastes", types: ["Land"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const FOREST = {card: "Forest", types: ["Land"], subtypes: ["Forest"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {G: 1}}]};
const DUAL = {card: "Gate", types: ["Land"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: [{W: 1}, {U: 1}]}]};
const TOWER = {card: "Tower", types: ["Land"], abilities: [{id: "a0", kind: "mana", tapSelf: true, anyColor: "identity"}]};
const SIGNET = {card: "Signet", types: ["Artifact"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {W: 1, B: 1}, cost: "{1}"}]};
const PAIN = {card: "Pain Land", types: ["Land"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: [{B: 1}, {G: 1}],
  then: [{effect: "dealDamage", amount: 1, who: "you"}]}]};
const CANYON = {card: "Canyon", types: ["Land"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: [{R: 1}, {W: 1}], payLife: 1}]};
const SOL = {card: "Sol Ring", types: ["Artifact"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 2}}]};
const ENTERS_TAPPED = (unless) => ({id: "r0", kind: "replacement", text: "This land enters tapped.", watches: {event: "enters", who: "self", ...(unless ? {unless} : {})}, change: {entersTapped: true}});
const CHECK = {card: "Check Land", types: ["Land"], abilities: [ENTERS_TAPPED({controls: {anyOf: [{types: ["Land"], subtypes: ["Forest"]}, {types: ["Land"], subtypes: ["Plains"]}]}}),
  {id: "a0", kind: "mana", tapSelf: true, produces: [{G: 1}, {W: 1}]}]};
const FAST = {card: "Fast Land", types: ["Land"], abilities: [ENTERS_TAPPED({controls: {types: ["Land"]}, max: 2}), {id: "a0", kind: "mana", tapSelf: true, produces: [{R: 1}, {W: 1}]}]};
const GAIN = {card: "Gain Land", types: ["Land"], abilities: [ENTERS_TAPPED(),
  {id: "t0", kind: "triggered", text: "When this land enters, you gain 1 life.", trigger: {on: "GameEventCardChangeZone", to: "Battlefield", who: "self"}, effects: [{effect: "gainLife", amount: 1}]}]};
const BOLT = {card: "Bolt", types: ["Instant"], manaCost: "{C}",
  spell: {id: "s", text: "Bolt deals 3 damage to any target.", targets: [{anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]}],
    effects: [{effect: "dealDamage", amount: 3, targets: {target: 0}, who: {target: 0}}]}};
const NO_MAX = {card: "Vessel", types: ["Artifact"], abilities: [{id: "s0", kind: "static", text: "You have no maximum hand size.", rule: "no-maximum-hand-size", affects: {what: "player", who: "you"}}]};

const pod = (n = 2) => ({matchId: "m", seed: "s", players: ["Rob", "Maya", "Trey", "Sam"].slice(0, n).map((name) => ({name}))});
function table(n = 2) {
  const s = createState(pod(n));
  for (let seat = 0; seat < n; seat += 1) for (let i = 0; i < 20; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, object, seat, zone = "battlefield") => addObject(s, {...object, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const offers = (s, kind, card, seat = 0) => legalActions(s, seat).filter((a) => a.kind === kind && (!card || a.label === card));
const pool = (s, seat = 0) => Object.fromEntries(Object.entries(s.players[seat].manaPool).filter(([, n]) => n));
const tappedIn = (s, name, seat = 0) => s.zones.battlefield.map((id) => s.objects[id]).find((o) => o.card === name && o.controller === seat)?.tapped;

/* ---- 1. what a mana ability can add ---- */
{
  const s = table();
  on(s, {card: "Boros General", types: ["Creature"], manaCost: "{2}{R}{W}", colorIdentity: ["R", "W"], commander: true}, 0, "command");
  eq(commanderIdentity(s, 0), ["W", "R"], "a commander's color identity, in WUBRG order (CR 903.4)");
  eq(commanderIdentity(s, 1), [], "a player with no commander has none");
  on(s, {card: "Simic Partner", types: ["Creature"], manaCost: "{G}{U}", commander: true}, 0, "command");
  eq(commanderIdentity(s, 0), ["W", "U", "R", "G"], "with two commanders, both identities together (CR 702.124c), one read off its printed cost");
  const tower = TOWER.abilities[0];
  eq(manaAlternatives(s, 0, tower).length, 4, "so \"any color in your commander's color identity\" offers four");
  eq(manaAlternatives(s, 1, tower), [], "and nothing at all to a player with no commander (CR 903.4f)");
  eq(manaAlternatives(s, 0, {produces: {C: 2}}), [{C: 2}], "a fixed amount is one alternative");
  eq(manaAlternatives(s, 0, {produces: [{W: 1}, {U: 1}]}), [{W: 1}, {U: 1}], "\"{W} or {U}\" is two");
  eq(manaAlternatives(s, 0, {anyColor: true}).map((m) => Object.keys(m)[0]), ["W", "U", "B", "R", "G"], "any color is five, never colorless");
}

/* ---- 2. offers, and paying for them ---- */
{
  const s = table();
  on(s, DUAL, 0);
  on(s, SIGNET, 0);
  on(s, PAIN, 0);
  on(s, CANYON, 0);
  on(s, WASTES, 0);
  main(s);
  const gate = offers(s, "activate-mana", "Gate");
  eq(gate.map((a) => [a.produce, a.mana]), [[0, {W: 1}], [1, {U: 1}]], "the dual land is offered once for each color, `produce` saying which");
  eq(offers(s, "activate-mana", "Wastes").map((a) => "produce" in a), [false], "a fixed ability is one offer, shaped as it always was");
  throws(() => applyAction(s, 0, {...gate[0], produce: 4}), /not a legal action/, "an alternative the land does not have is refused: `produce` is part of the offer");
  applyAction(s, 0, gate[1]);
  eq(pool(s), {U: 1}, "tapping it for blue adds blue");
  eq(offers(s, "activate-mana", "Signet").length, 1, "the Signet is offered once the pool holds the {1} it costs");
  applyAction(s, 0, offers(s, "activate-mana", "Signet")[0]);
  eq([pool(s), s.stack.length], [{W: 1, B: 1}, 0], "and it spends the {1} to add {W}{B}, at once and off the stack (CR 605.3a)");
  eq(offers(s, "activate-mana", "Signet").length, 0, "tapped, it is not offered again");
  const before = s.players[0].life;
  applyAction(s, 0, offers(s, "activate-mana", "Pain Land").find((a) => a.mana.G));
  eq([s.players[0].life, pool(s).G, s.stack.length], [before - 1, 1, 0], "the pain land deals its 1 damage as it adds green: part of the mana ability, off the stack");
  applyAction(s, 0, offers(s, "activate-mana", "Canyon")[0]);
  eq(s.players[0].life, before - 2, "and a land that costs a life to tap takes it");
}
{
  const s = table();
  on(s, SIGNET, 0);
  main(s);
  eq(offers(s, "activate-mana", "Signet").length, 0, "with an empty pool the Signet is not offered: its {1} cannot be paid");
}

/* ---- 3. nothing to do counts each source at its best ---- */
{
  const s = table();
  on(s, SOL, 0);
  on(s, WASTES, 0);
  on(s, {card: "Three Drop", types: ["Creature"], manaCost: "{3}", power: 3, toughness: 3}, 0, "hand");
  main(s);
  eq(nothingToDo(s, 0), false, "a Sol Ring and a land make three, so a three-drop in hand is something to do");
  const t = table();
  on(t, SOL, 0);
  on(t, WASTES, 0);
  on(t, {card: "Four Drop", types: ["Creature"], manaCost: "{4}", power: 4, toughness: 4}, 0, "hand");
  main(t);
  eq(nothingToDo(t, 0), true, "and a four-drop is not");
  const u = table();
  on(u, DUAL, 0);
  on(u, {card: "Two Drop", types: ["Creature"], manaCost: "{2}", power: 2, toughness: 2}, 0, "hand");
  main(u);
  eq(nothingToDo(u, 0), true, "a dual land is one mana, not one per color it offers");
}

/* ---- 4. a land played enters through its replacements ---- */
{
  const play = (setup, land) => {
    const s = table();
    for (const [object, seat] of setup) on(s, object, seat);
    on(s, land, 0, "hand");
    main(s);
    applyAction(s, 0, offers(s, "play-land", land.card)[0]);
    return s;
  };
  eq(tappedIn(play([], {...GAIN, abilities: [ENTERS_TAPPED()]}), "Gain Land"), true, "a land that enters tapped, played as the land drop, enters tapped (CR 614.12)");
  eq(tappedIn(play([[FOREST, 0]], CHECK), "Check Land"), false, "with a Forest of its controller's, the check land enters untapped");
  eq(tappedIn(play([[WASTES, 0]], CHECK), "Check Land"), true, "without one, tapped");
  eq(tappedIn(play([[FOREST, 1]], CHECK), "Check Land"), true, "and an opponent's Forest is not one \"you control\"");
  eq(tappedIn(play([[WASTES, 0], [WASTES, 0]], FAST), "Fast Land"), false, "with two other lands, the fast land enters untapped");
  eq(tappedIn(play([[WASTES, 0], [WASTES, 0], [WASTES, 0]], FAST), "Fast Land"), true, "with three, tapped");
}

/* ---- 5. after an action: the passes start over, and the checks come first ---- */
{
  const s = table();
  on(s, GAIN, 0, "hand");
  main(s);
  applyAction(s, 0, offers(s, "play-land", "Gain Land")[0]);
  eq([s.stack.length, s.stack[0]?.kind, s.priorityPlayer], [1, "trigger", 0],
    "the gain land's trigger is on the stack as its player receives priority back (CR 117.5): the land drop is an action like any other");
}
{
  const s = table();
  on(s, BOLT, 0, "hand");
  on(s, BOLT, 1, "hand");
  on(s, WASTES, 0);
  on(s, WASTES, 1);
  main(s);
  applyAction(s, 0, offers(s, "activate-mana", "Wastes")[0]);
  applyAction(s, 0, offers(s, "cast", "Bolt").find((a) => a.targets[0].kind === "player" && a.targets[0].id === 1));
  eq(passPriority(s).outcome, "passed", "Rob casts and passes; Maya receives priority");
  applyAction(s, 1, offers(s, "activate-mana", "Wastes", 1)[0]);
  applyAction(s, 1, offers(s, "cast", "Bolt", 1).find((a) => a.targets[0].kind === "player" && a.targets[0].id === 0));
  eq(s.passes, 0, "Maya answers with her own Bolt: the count of passes starts over (CR 117.3c)");
  const after = passPriority(s);
  eq([after.outcome, s.priorityPlayer, s.stack.length], ["passed", 0, 2],
    "so when she passes, Rob receives priority to answer her -- her Bolt does not resolve on a pass he made before it existed (CR 117.4)");
}
{
  const s = table();
  on(s, PAIN, 0);
  main(s);
  s.players[0].life = 1;
  applyAction(s, 0, offers(s, "activate-mana", "Pain Land")[0]);
  eq([s.players[0].lost, s.priorityPlayer], [true, null],
    "a pain land's last point of life loses the game at once, before its player could act again (CR 117.5, 704.5a), and the two-player game is over");
}

/* ---- 6. no maximum hand size; subtypes; a first striker that left ---- */
{
  const handAtCleanup = (holder) => {
    const s = table();
    if (holder !== null) on(s, NO_MAX, holder);
    for (let i = 0; i < 9; i += 1) on(s, WASTES, 0, "hand");
    beginGame(s);
    for (let n = 0; n < 200 && !s.awaiting && s.turn === 1; n += 1) advance(s);
    return s.awaiting?.kind ?? null;
  };
  eq(handAtCleanup(null), "discard-to-hand-size", "nine cards at cleanup: discard to seven (CR 402.2, 514.1)");
  eq(handAtCleanup(0), null, "with \"You have no maximum hand size\", nothing is discarded");
  eq(handAtCleanup(1), "discard-to-hand-size", "and an opponent's does not count for the active player");
}
{
  const s = table();
  const forest = on(s, FOREST, 0);
  const peaks = on(s, {card: "Peaks", types: ["Land"], subtypes: ["Mountain", "Plains"]}, 0);
  on(s, WASTES, 0);
  main(s);
  eq(selectMatching(s, {subtypes: ["Forest"]}), [forest], "a selector's subtypes find the Forest");
  eq(selectMatching(s, {subtypes: ["Plains"]}), [peaks], "and a land that is a Mountain and a Plains is a Plains (CR 205.3)");
  throws(() => selectMatching(s, {subtypes: "Forest"}), /subtypes are a list/, "subtypes are a list, as types are");
}
{
  const s = table();
  const striker = on(s, {card: "Striker", types: ["Creature"], power: 2, toughness: 2, keywords: ["First Strike"]}, 0);
  main(s);
  s.combat = {attackingPlayerId: 0, defenders: [1], attacks: [{attacker: striker, defender: 1, blocked: false, blockers: []}]};
  eq(combatNeedsFirstStrike(s), true, "an attacking first striker makes the first-strike step happen");
  delete s.objects[striker];
  s.zones.battlefield = s.zones.battlefield.filter((id) => id !== striker);
  eq(combatNeedsFirstStrike(s), false, "one that has left the battlefield has left combat (CR 506.4) and makes no step happen");
}

void cardsIn; void awaitingChoice;
console.log(`engine-mana-abilities: ${checks} checks passed — a land offered once per color it makes, a Signet's cost and a pain land's damage off the stack, a land played through its own replacements, and the checks that come after every action.`);
