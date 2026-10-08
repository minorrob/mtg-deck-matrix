/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE TURN: CR 500 TO 514.
 *
 * `docs/engine/PLAN.md` §3.3, second row. The turn is the clock every other rule reads, and the
 * phase 1 gate — a four-player game runs to completion for 1,000 seeds — rests on it reaching the
 * next player every time. A turn that cannot end is a hang, which is a worse failure than a loss
 * because nothing in the UI can report it.
 *
 * THE PHASE NAMES ARE NOT OURS. `match-telemetry.mjs` tests the phase string against
 * `/DECLARE_ATTACKERS|DECLARE_BLOCKERS/` and renders every other one by lowercasing it;
 * `table-notices.mjs`, the audio rules and every match journal already on disk use the same set.
 * They are Forge's names, and the engine adopts them so that swapping the engine in behind
 * `CRANKMAGIC_ENGINE` does not quietly stop the board's history from reading.
 *
 * WHAT ADVANCE MEANS. `advance` moves to the next step and performs that step's turn-based actions
 * on arrival, which is the order CR 500.2 gives: a step begins, its turn-based actions happen, then
 * the active player receives priority. Callers read the state after it returns.
 *
 * EVENTS ARE RETURNED, NOT WRITTEN. Nothing here holds a journal. The caller writes what it is
 * given, which keeps the rules pure over state, lets a test read the events without a journal, and
 * means a rollback discards the events with the state rather than leaving a record of a turn that
 * did not happen.
 *
 * THREE RULES THAT ARE EASY TO GET WRONG FROM MEMORY:
 *
 *   CR 103.8a is a TWO-PLAYER rule. The player who goes first skips their first draw step in a
 *   two-player game only. In four-player Commander everyone draws on turn one. Applying it to a pod
 *   silently costs the starting seat a card in every single game.
 *
 *   CR 506.5: with no attackers declared, the declare blockers and combat damage steps DO NOT
 *   HAPPEN. Running them anyway looks harmless and is not — every "at the beginning of the declare
 *   blockers step" trigger would fire on a turn nobody attacked.
 *
 *   CR 500.4: mana pools empty at the end of every step and phase, not at end of turn.
 */

import {cardsIn, moveObject, eventCard} from "../state/index.mjs";
import {attackers, blockers, combatDamage, endCombat} from "./combat.mjs";
import {checkStateBasedActions, gameOver, finishCommanderReplacement, legendChoice, finishLegendRule, finishDestructionChoice} from "./sba.mjs";
import {destructionChoice} from "../script/effects/zones.mjs";
import {commanderChoice} from "./commander.mjs";
import {damageOrderChoice} from "./replacement.mjs";
import {mulliganChoice, resolveMulligan} from "./mulligan.mjs";
import {answerResolution, resolutionChoice} from "../script/resolution.mjs";
import {finishResolving} from "./stack.mjs";
import {playerRuleChanged, untapsDuringOthers, ruleChanged} from "./statics.mjs";
import {emptyRestricted} from "./restricted-mana.mjs";
import {endCopies, phaseIn} from "../script/effects/permanents.mjs";
import {untapOne} from "../script/effects/resources.mjs";
import {runEffect} from "../script/effects/index.mjs";
import {askEntering, enteringChoice, resolveEnteringChoice} from "./entering.mjs";
import {collectTriggers, openTriggers, triggerChoice, resolveTriggerOrder, triggerTargetsChoice, resolveTriggerTargets, triggerCountedChoice, resolveTriggerCounted} from "./trigger.mjs";
import {chooseTargetsChoice, resolveChooseTargets, castCostChoice, resolveCastCost} from "./actions.mjs";
import {deriving} from "./layers.mjs";

/* The steps of a turn, CR 500.1, in order.
 *
 * `priority` is CR 117.1a: the active player receives priority at the beginning of most steps. Two
 * steps are exceptions — untap (CR 502.3) and cleanup (CR 514.3, which gains priority only if
 * something needs doing; 1.5 adds that once there are state-based actions to trigger it).
 *
 * `when` names a condition rather than hiding one in a branch, so 1.4 fills combat in one place. */
export const STEPS = Object.freeze([
  {phase: "UNTAP", priority: false},
  {phase: "UPKEEP", priority: true},
  {phase: "DRAW", priority: true},
  {phase: "MAIN1", priority: true},
  {phase: "COMBAT_BEGIN", priority: true},
  {phase: "COMBAT_DECLARE_ATTACKERS", priority: true},
  {phase: "COMBAT_DECLARE_BLOCKERS", priority: true, when: "attackers"},
  {phase: "COMBAT_FIRST_STRIKE_DAMAGE", priority: true, when: "firstStrike"},
  {phase: "COMBAT_DAMAGE", priority: true, when: "attackers"},
  {phase: "COMBAT_END", priority: true},
  {phase: "MAIN2", priority: true},
  {phase: "END_OF_TURN", priority: true},
  {phase: "CLEANUP", priority: false},
].map(Object.freeze));

export const PHASE_NAMES = Object.freeze(STEPS.map((s) => s.phase));

/* Whether a conditional step happens at all this turn. Predicates over state rather than flags, so
   a rule that decides a step lives in one place. */
const CONDITIONS = {
  /* CR 506.5: no attackers, no declare blockers step and no combat damage step. */
  attackers: (state) => (state.combat?.attacks?.length ?? 0) > 0,
  /* CR 510.4: the first-strike damage step exists only if a creature in combat has first or double
     strike. `combat.firstStrike` is set when attackers are declared and stays false until phase 2
     gives creatures keywords, so for now the step never happens — which is correct, not deferred. */
  firstStrike: (state) => CONDITIONS.attackers(state) && (state.combat?.firstStrike ?? false) === true,
};

/** The step the game is in, as the name the board already reads. */
export const currentPhase = (state) => state.phase;

/** Whether anyone holds priority in the current step. */
export const hasPriority = (state) => STEPS[state.stepIndex]?.priority === true;

/**
 * The next seat still in the game, walking in seat order from `from`.
 *
 * Returns `from` when nobody else is left, so a one-player game still takes turns rather than
 * looping here forever. A pod with no living player at all would be a bug upstream; it throws.
 */
export function nextLivingPlayer(state, from) {
  const count = state.players.length;
  for (let step = 1; step <= count; step += 1) {
    const at = (from + step) % count;
    if (!state.players[at].lost) return at;
  }
  if (!state.players[from]?.lost) return from;
  throw new Error("Every player has lost; there is no next turn");
}

/* The seats passed over between one turn and the next, in seat order: each a player who has left the game and whose turn
   would have begun there (CR 800.4k, 800.4m). */
function skippedSeats(state, from, to) {
  const count = state.players.length, skipped = [];
  for (let step = 1; step < count; step += 1) {
    const at = (from + step) % count;
    if (at === to) break;
    if (state.players[at].lost) skipped.push(at);
  }
  return skipped;
}

/* ---- events, in the envelope the existing readers expect ---- */

/* `ForgeProbe.java` nests everything under `data.fields` and puts the turn on `data`, and
   `match-telemetry.mjs` reads exactly that. The shape is theirs, not a preference. */
const event = (kind, state, fields) => ({kind, data: {turn: state.turn, phase: state.phase, fields}});

/* The capitalized zone names the projection and the telemetry use, from the engine's own. */
const ZONE_LABEL = {
  library: "Library", hand: "Hand", battlefield: "Battlefield",
  graveyard: "Graveyard", exile: "Exile", stack: "Stack", command: "Command",
};

const cardRef = eventCard;

/* ---- turn-based actions, one per step that has any ---- */

/* CR 502.1. The ACTIVE PLAYER's permanents untap, and nobody else's. This is not a board-wide
   effect, and writing it as one is the kind of bug that only shows when a game is close. */
function untap(state, events) {
  /* Phasing (CR 502.1, 702.26b): the active player's phased-out permanents phase in first, and then untap with the rest. */
  if ((state.phasedOut ?? []).length) phaseIn(state, state.activePlayer);
  for (const id of state.zones.battlefield) {
    const o = state.objects[id];
    /* The active player's permanents (CR 502.3), and another player's that a static of theirs untaps now (Seedborn Muse). */
    if (!o.tapped || (o.controller !== state.activePlayer && !untapsDuringOthers(state, id))) continue;
    /* "Doesn't untap during your untap step" (Mana Vault, Meekstone). */
    if (ruleChanged(state, "doesnt-untap", id)) continue;
    /* A stun counter removed instead (CR 122.1d). */
    untapOne(state, id, events);
  }
}

/* CR 121.1 and 104.3c. A draw takes the top card of the library. Drawing from an empty library does
   not throw and does not lose the game here: the player is marked, and state-based actions turn the
   mark into a loss in 1.5. Throwing would make an ordinary, legal game position into a crash. */
export function draw(state, player, events) {
  const library = cardsIn(state, "library", player);
  if (library.length === 0) {
    state.players[player].drewFromEmpty = true;
    return null;
  }
  const top = library[0];
  const card = cardRef(state, top);
  const moved = moveObject(state, top, "hand", player);
  events.push(event("GameEventCardChangeZone", state, {
    card,
    from: {zoneType: ZONE_LABEL.library, player: {playerId: player}},
    to: {zoneType: ZONE_LABEL.hand, player: {playerId: player}},
    /* A draw (CR 121.1), as "whenever you draw a card" watches for; a search that puts a card into a hand is not one. */
    drawn: true,
  }));
  return moved;
}

/* CR 103.8a, and note that it is a two-player rule. */
const skipsFirstDraw = (state) =>
  state.players.length === 2 && state.turn === 1 && state.activePlayer === state.startingPlayer;

/* CR 500.4. Reported only when there was something to empty: an empty pool emptying again is not
   news, and a board that announces it every step buries what matters. */
function emptyManaPools(state, events) {
  for (const player of state.players) {
    /* And the mana that could be spent only on some things (rules/restricted-mana.mjs). */
    emptyRestricted(player);
    const total = Object.values(player.manaPool).reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    const had = {...player.manaPool};
    for (const color of Object.keys(player.manaPool)) player.manaPool[color] = 0;
    events.push(event("GameEventManaPool", state, {player: {playerId: player.id, name: player.name}, emptied: had}));
  }
}

/* THE CLEANUP STEP (CR 514), in its order. First the active player discards down to their maximum hand size (514.1);
   then, at once, all damage wears off and every "until end of turn" and "this turn" effect ends (514.2) -- without that,
   damage accumulates across turns and every creature eventually dies to a scratch it took ten turns ago.
 *
 * THE DISCARD IS A DECISION, SO THE ENGINE STOPS HERE AND ASKS. It does not pick cards. `awaiting`
 * is how a turn-based action that needs an answer reaches the driver: the engine runs until it
 * needs one, records what it needs, and returns. Declaring attackers and blockers (CR 508.1, 509.1)
 * are the same shape and arrive in 1.4 through the same field. The rest of the step waits for the answer
 * (resolveAwaiting), so what lasts "this turn" -- "whenever you discard a card this turn" -- still sees the discard.
 *
 * Then CR 514.3a: no player receives priority in this step, unless a state-based action is performed or an ability
 * triggered -- a discard trigger, a death -- and then the active player does, and once the stack is empty and all pass,
 * another cleanup step begins (grantStepPriority, advance). */
function cleanup(state, events) {
  const player = state.players[state.activePlayer];
  /* CR 800.4: a turn whose active player has left the game runs to its end without them, so nobody discards. */
  /* CR 402.2: seven, unless a static ability says the player has no maximum hand size. */
  const limit = playerRuleChanged(state, "no-maximum-hand-size", state.activePlayer) ? Infinity : (player.maxHandSize ?? 7);
  const over = player.lost ? 0 : cardsIn(state, "hand", state.activePlayer).length - limit;
  if (over > 0) { state.awaiting = {kind: "discard-to-hand-size", player: state.activePlayer, count: over}; return; }
  endOfTurn(state);
  void events;
}

/* CR 514.2, as one event: all damage is removed from permanents AND every "until end of turn" effect ends. */
function endOfTurn(state) {
  /* Without the second half, a Giant Growth's +3/+3, Heroic Intervention's indestructible and Craterhoof's +X/+X lasted the
     rest of the game -- and the scenarios, which look within a turn, never saw it. */
  for (const id of state.zones.battlefield) {
    if (state.objects[id].damage !== 0) state.objects[id].damage = 0;
  }
  /* Control gained "until end of turn" returns now (effects/permanents.mjs gainControl), latest first, so the first
     controller is the last one set. It changed hands this very turn, which already makes it summoning sick for its old
     controller until their next turn begins (CR 302.6). */
  for (const effect of (state.effects ?? []).filter((e) => e.rule === "control-returns").reverse())
    for (const id of effect.affects?.ids ?? []) if (state.objects[id]) state.objects[id].controller = effect.apply.controller;
  if ((state.effects ?? []).some((effect) => effect.until === "end-of-turn")) state.effects = state.effects.filter((effect) => effect.until !== "end-of-turn");
  /* "Until the end of your next turn" (script/effects/zones.mjs, mayPlay): over at the end of the first turn of that player
     begun after it was made -- this one, if it was made before this turn began. */
  if ((state.effects ?? []).some((e) => e.until === "your-next-end"))
    state.effects = state.effects.filter((e) => !(e.until === "your-next-end" && e.sourceController === state.activePlayer && state.turn > e.madeOnTurn));
  /* "Becomes a copy of target artifact until end of turn" ends with them (effects/permanents.mjs). */
  endCopies(state);
  /* And a delayed trigger that lasted "this turn" ("whenever a creature dies this turn", CR 603.7b) ends with them. */
  if ((state.delayedTriggers ?? []).some((d) => d.thisTurn)) state.delayedTriggers = state.delayedTriggers.filter((d) => !d.thisTurn);
}

/**
 * The choice record for whatever turn-based action the engine is waiting on (§12.1).
 *
 * Returns null when nothing is pending. The driver offers this to the controller, takes the answer
 * and hands it to `resolveAwaiting`.
 */
export function awaitingChoice(state) {
  /* It only reads: every object it derives, derived once (rules/layers.mjs, deriving). */
  return deriving(state, () => choiceFor(state));
}
function choiceFor(state) {
  const awaiting = state.awaiting;
  if (!awaiting) return null;
  if (awaiting.kind === "mulligan-decision" || awaiting.kind === "mulligan-bottom")
    return mulliganChoice(state, awaiting);
  if (awaiting.kind === "effect-choice") return resolutionChoice(state, awaiting);
  if (awaiting.kind === "commander-replacement") return commanderChoice(state, awaiting);
  if (awaiting.kind === "legend-rule") return legendChoice(state, awaiting);
  /* CR 616.1: which effect replaces a creature's destruction by lethal damage, when several would (rules/sba.mjs). */
  if (awaiting.kind === "destruction-replacement") return destructionChoice(state, awaiting);
  if (awaiting.kind === "order-triggers") return triggerChoice(state, awaiting);
  if (awaiting.kind === "trigger-targets") return triggerTargetsChoice(state, awaiting);
  /* A counted target ("up to two target creatures"), a trigger's or an offer's (CR 601.2c; script/bind.mjs). */
  if (awaiting.kind === "choose-targets") return awaiting.stackId !== undefined ? triggerCountedChoice(state, awaiting) : chooseTargetsChoice(state, awaiting);
  /* Escape's other cards (CR 702.138a), or a flashback cost's creatures (702.34a): which, asked once its cast is taken
     (rules/actions.mjs). */
  if (awaiting.kind === "choose-cost") return castCostChoice(state, awaiting);
  if (awaiting.kind === "entering-choice") return enteringChoice(state, awaiting);
  if (awaiting.kind === "declare-attackers") return attackers.choice(state, awaiting);
  if (awaiting.kind === "attack-tax") return attackers.taxChoice(state, awaiting);
  if (awaiting.kind === "declare-blockers") return blockers.choice(state, awaiting);
  if (awaiting.kind === "assign-combat-damage") return combatDamage.choice(state, awaiting);
  /* CR 616.1: which effect changes a hit of combat damage first, asked before any of it is dealt (rules/combat.mjs). */
  if (awaiting.kind === "order-damage") return damageOrderChoice(state, awaiting);
  /* The held draw (item 13): one thing to do, and nothing else happens until it is done. */
  if (awaiting.kind === "draw-card")
    return {id: `draw:${state.turn}`, title: "Draw a card", kind: "draw", mode: "one", min: 1, max: 1, options: [{index: 0, label: "Draw a card"}]};
  if (awaiting.kind === "discard-to-hand-size") {
    const hand = cardsIn(state, "hand", awaiting.player);
    return {
      id: `cleanup-discard:${state.turn}`,
      title: `Discard ${awaiting.count} card${awaiting.count === 1 ? "" : "s"}`,
      mode: awaiting.count === 1 ? "one" : "many",
      min: awaiting.count,
      max: awaiting.count,
      options: hand.map((id, index) => ({index, label: state.objects[id].card, cardId: id})),
    };
  }
  throw new Error(`No choice is defined for the turn-based action ${awaiting.kind}`);
}

/**
 * Apply the answer to the pending turn-based action.
 *
 * @param {Array<number>} indices  positions in the choice's options, as the controller validated
 * @returns {Array} events for the caller to journal
 */
export function resolveAwaiting(state, indices, amounts = null, rng = null, extra = {}) {
  const awaiting = state.awaiting;
  if (!awaiting) throw new Error("The engine is not waiting on anything");

  /* The mulligan is the one decision that consumes randomness, because keeping or not decides
     whether a library is shuffled. A generator is a closure and game state is plain data (§3.2.4),
     so the stream is handed in rather than held. */
  if (awaiting.kind === "mulligan-decision" || awaiting.kind === "mulligan-bottom")
    return resolveMulligan(state, awaiting, indices, rng);

  /* A card effect that stopped half way through. `extra` carries what generic indices cannot --
     scry's `toBottom`, for instance -- and the choice record says which fields it expects. */
  if (awaiting.kind === "effect-choice") {
    const outcome = answerResolution(state, indices, extra, rng);
    /* A spell that stopped to ask leaves the stack once its last effect has run (stack.mjs), and only then does
       anyone receive priority -- after state-based actions and triggers, as after any resolution (CR 117.5). */
    const finished = outcome.status === "done" ? finishResolving(state) : [];
    const events = [...outcome.events, ...finished];
    /* Each event is handed back once, as it happened; what triggers reads the whole resolution once it is done, the
       events before its questions too -- they triggered then, and wait for a player to receive priority (CR 603.2,
       603.3): the life Uro gained before asking for a land still triggers "whenever you gain life". */
    grantStepPriority(state, events, outcome.status === "done" ? [...(outcome.all ?? outcome.events), ...finished] : events);
    return events;
  }

  if (awaiting.kind === "commander-replacement") {
    const events = finishCommanderReplacement(state, awaiting, indices);
    grantStepPriority(state, events);
    return events;
  }
  if (awaiting.kind === "legend-rule") {
    const events = finishLegendRule(state, awaiting, indices);
    grantStepPriority(state, events);
    return events;
  }
  if (awaiting.kind === "destruction-replacement") {
    const events = finishDestructionChoice(state, awaiting, indices);
    grantStepPriority(state, events);
    return events;
  }
  if (awaiting.kind === "order-triggers") {
    const events = resolveTriggerOrder(state, awaiting, indices);
    grantStepPriority(state, events);
    return events;
  }
  if (awaiting.kind === "trigger-targets") {
    const events = resolveTriggerTargets(state, awaiting, indices);
    /* What the trigger is now aimed at triggers at once (ward), even while another trigger still asks for its targets
       and nobody receives priority yet. */
    collectTriggers(state, events);
    const after = [];
    grantStepPriority(state, after);
    return [...events, ...after];
  }
  /* A counted target picked: a trigger's, then the next trigger's targets, as trigger-targets goes on; an offer's, then the
     offer taken -- cast or activated, its player holding priority after it (CR 117.3c, rules/actions.mjs applyAction). */
  /* Escape's other cards, or a flashback cost's creatures, picked: the cast taken, its player holding priority after it
     (CR 117.3c). */
  if (awaiting.kind === "choose-cost") return resolveCastCost(state, awaiting, indices);
  if (awaiting.kind === "choose-targets") {
    if (awaiting.stackId === undefined) return resolveChooseTargets(state, awaiting, indices);
    const events = resolveTriggerCounted(state, awaiting, indices);
    collectTriggers(state, events);
    const after = [];
    grantStepPriority(state, after);
    return [...events, ...after];
  }
  if (awaiting.kind === "entering-choice") {
    const events = resolveEnteringChoice(state, awaiting, indices);
    grantStepPriority(state, events);
    return events;
  }
  if (awaiting.kind === "declare-attackers") {
    const events = attackers.resolve(state, awaiting, indices);
    grantStepPriority(state, events);
    return events;
  }
  /* What attacking costs, paid with the mana the attacker chose (CR 508.1i-j); then the attack is declared. */
  if (awaiting.kind === "attack-tax") {
    const events = attackers.payTax(state, awaiting, indices);
    grantStepPriority(state, events);
    return events;
  }
  if (awaiting.kind === "declare-blockers") {
    /* Each defending player declares in turn; `blockers.resolve` names the next one, or clears the
       wait once the last has answered. */
    const events = blockers.resolve(state, awaiting, indices);
    grantStepPriority(state, events);
    return events;
  }
  if (awaiting.kind === "draw-card") {
    if (!Array.isArray(indices) || indices.length !== 1 || indices[0] !== 0) throw new Error("Invalid selection");
    const events = [];
    state.awaiting = null;
    draw(state, awaiting.player, events);
    grantStepPriority(state, events);
    return events;
  }
  if (awaiting.kind === "assign-combat-damage") {
    const events = combatDamage.resolve(state, awaiting, amounts ?? indices);
    /* Another attacker may also face several blockers; each gets its own question, and only once
       the last is answered is any damage dealt — CR 510.2, all of it at the same time, and as the
       damage of the step it was asked in (CR 510.4): a division in the first-strike step is
       first-strike damage. */
    const step = awaiting.step ?? "regular";
    if (!combatDamage.open(state, step)) events.push(...combatDamage.deal(state, {step}));
    grantStepPriority(state, events);
    return events;
  }
  /* The order of the effects changing one hit (CR 616.1); then the step's damage is dealt, or the next such hit asked. */
  if (awaiting.kind === "order-damage") {
    const events = combatDamage.orderDamage(state, awaiting, indices);
    grantStepPriority(state, events);
    return events;
  }

  const choice = awaitingChoice(state);
  if (!Array.isArray(indices) || indices.length !== awaiting.count)
    throw new Error(`This step needs exactly ${awaiting.count} card${awaiting.count === 1 ? "" : "s"}`);

  const events = [];
  /* Resolve every index to a card id BEFORE moving anything: each move makes a new object and
     rewrites the hand, so positions taken from the offered record would drift under us. */
  const chosen = indices.map((index) => {
    const option = choice.options[index];
    if (!option) throw new Error("Invalid selection");
    return option.cardId;
  });
  if (new Set(chosen).size !== chosen.length) throw new Error("Invalid selection");

  for (const id of chosen) {
    const card = cardRef(state, id);
    const owner = state.objects[id].owner;
    const discarded = moveObject(state, id, "graveyard", owner);
    events.push(event("GameEventCardChangeZone", state, {
      card,
      from: {zoneType: ZONE_LABEL.hand, player: {playerId: awaiting.player}},
      to: {zoneType: ZONE_LABEL.graveyard, player: {playerId: owner}},
      discarded: true,
      /* The card it became in the graveyard (CR 400.7e), as every discard says: what "whenever you discard a creature card"
         and "put into your graveyard" read. */
      becomes: discarded,
    }));
  }
  state.awaiting = null;
  /* What the discard triggered, as it happened (CR 603.2) -- a "this turn" ability among them, before CR 514.2 ends it;
     then CR 514.2; then CR 514.3a, those triggers on the stack and the active player with priority. */
  collectTriggers(state, events);
  endOfTurn(state);
  grantStepPriority(state, events, []);
  return events;
}

function arrive(state, events) {
  events.push(event("GameEventTurnPhase", state, {
    phase: state.phase,
    playerTurn: {playerId: state.activePlayer, name: state.players[state.activePlayer].name},
  }));
  if (state.phase === "UNTAP") untap(state, events);
  if (state.phase === "DRAW" && !skipsFirstDraw(state) && !state.players[state.activePlayer].lost) {
    /* CR 504.1 makes the draw a turn-based action, not a choice. A table that asks for the beat (item 13) holds it
       until the player's click: the same card, at the player's moment, and priority after it (CR 504.2). */
    if (state.drawBeat) state.awaiting = {kind: "draw-card", player: state.activePlayer};
    else draw(state, state.activePlayer, events);
  }
  /* CR 714.3b: as the precombat main phase begins, the active player puts a lore counter on each Saga they control -- what
     brings its next chapter. */
  if (state.phase === "MAIN1") for (const id of state.zones.battlefield.filter((x) => state.objects[x].controller === state.activePlayer && (state.objects[x].subtypes ?? []).includes("Saga")))
    events.push(...runEffect(state, {effect: "putCounter", targets: [id], counter: "lore", count: 1}, {controller: state.activePlayer, source: id}));
  /* The combat steps' turn-based actions (CR 508.1, 509.1, 510.1) each stop the game and ask.
     `open` returns false when there is nothing to decide, and the step just proceeds. */
  /* "If it's the first combat phase of the turn" (Genji Glove): each combat phase counted as it begins. */
  if (state.phase === "COMBAT_BEGIN") state.combatsThisTurn = (state.combatsThisTurn ?? 0) + 1;
  if (state.phase === "COMBAT_DECLARE_ATTACKERS") attackers.open(state);
  if (state.phase === "COMBAT_DECLARE_BLOCKERS") blockers.open(state);
  /* CR 510.4: the first-strike step deals its own damage, and then the regular step deals the rest.
     Double strike is in both, which is why the two calls are the same code with a different step. */
  if (state.phase === "COMBAT_FIRST_STRIKE_DAMAGE" && !combatDamage.open(state))
    events.push(...combatDamage.deal(state, {step: "first"}));
  if (state.phase === "COMBAT_DAMAGE" && !combatDamage.open(state))
    events.push(...combatDamage.deal(state, {step: "regular"}));
  if (state.phase === "COMBAT_END") events.push(...endCombat(state));
  if (state.phase === "CLEANUP") cleanup(state, events);
  state.passes = 0;
  grantStepPriority(state, events);
}

/* CR 117.1a: the active player receives priority at the beginning of most steps — but AFTER that
   step's turn-based actions (CR 508.2, 509.3, 510.3). While the engine is waiting on one, nobody
   holds priority, which is why an instant cast in the declare attackers step is cast at creatures
   that are already attacking and already tapped.
 *
 * CR 704.3: state-based actions are checked WHENEVER A PLAYER WOULD RECEIVE PRIORITY, which makes
 * this the right and only place for it in the turn structure. Combat damage is dealt as this step
 * begins, so the creatures it killed are already gone by the time anybody could respond. */
function grantStepPriority(state, events = [], triggering = events) {
  /* CR 514.3a: in the cleanup step, what happened in it -- a discard that triggered, a state-based action -- gives the
     active player priority, the triggers on the stack first; and `cleanupAgain` makes the step happen again once the
     stack is empty and everyone has passed (advance). */
  if (state.phase === "CLEANUP" && !state.awaiting) {
    collectTriggers(state, triggering);
    const sba = checkStateBasedActions(state);
    events.push(...sba);
    collectTriggers(state, sba);
    /* A trigger whose controller has left the game never goes on the stack (CR 800.4a; rules/trigger.mjs, openTriggers): it
       is no reason for another step, or the step would repeat for ever. */
    if (sba.length || (state.pendingTriggers ?? []).some((t) => !state.players[t.controller]?.lost)) {
      state.cleanupAgain = true;
      openTriggers(state);
    }
  } else if (hasPriority(state) && !state.awaiting) {
    /* What just happened triggers now (CR 603.2). A permanent that entered asking is then answered before anything
       else happens (rules/entering.mjs). */
    collectTriggers(state, triggering);
    if (!askEntering(state)) {
      const sba = checkStateBasedActions(state);
      events.push(...sba);
      /* CR 603.3: waiting triggers go on the stack the next time a player would receive priority —
         which is here, after state-based actions, so a trigger sees a board where the dead are
         already gone. `openTriggers` returns true when a player has more than one and has to be
         asked for the order, and that question holds priority off until it is answered. */
      collectTriggers(state, sba);
      /* Unless a state-based action is asking something (a commander's owner, CR 903.9a): the triggers wait for the
         answer, as they do after a resolution (priority.mjs, afterResolving). */
      if (!state.awaiting) openTriggers(state);
    }
  }
  /* Re-read after the above: a player can lose during their own turn, and ordering triggers can
     have set a new wait. Either way priority goes to nobody. */
  const active = state.players[state.activePlayer];
  state.priorityPlayer = (hasPriority(state) || (state.phase === "CLEANUP" && state.cleanupAgain === true)) && !state.awaiting && active && !active.lost
    ? state.activePlayer : null;
  return events;
}

/* ---- beginning, and moving on ---- */

/**
 * Put a new state at the first step of the first turn and perform it.
 *
 * @param {object} state           from `createState`
 * @param {number} startingPlayer  which seat goes first; the mulligan step picks it in 1.9
 * @returns {Array} events for the caller to journal
 */
export function beginGame(state, startingPlayer = 0) {
  if (!Number.isInteger(startingPlayer) || !state.players[startingPlayer])
    throw new Error("The starting player must be a seat at the table");
  state.startingPlayer = startingPlayer;
  state.turn = 1;
  state.activePlayer = startingPlayer;
  state.players[startingPlayer].turnBegan = 1;
  state.stepIndex = 0;
  state.phase = STEPS[0].phase;
  for (const player of state.players) player.landsPlayed = 0;
  const events = [];
  arrive(state, events);
  return events;
}

/**
 * Move to the next step and perform it.
 *
 * Conditional steps are skipped here rather than entered and immediately left, because entering a
 * step is what makes its triggers fire (CR 506.5, 510.4).
 *
 * @returns {Array} events for the caller to journal
 */
export function advance(state) {
  if (state.stepIndex === undefined) throw new Error("The game has not begun; call beginGame first");
  /* A turn-based action that needs an answer holds the game here until it has one. Advancing past
     it would silently skip the discard, or in 1.4 the attack, and leave a turn that never happened
     looking exactly like one that did. */
  if (state.awaiting) throw new Error(`The ${state.awaiting.kind} decision has to be answered before the game moves on`);
  /* A finished game has no next step, and saying so here is worth a line: without it the failure
     surfaces from `nextLivingPlayer` as "every player has lost", which is true and tells a caller
     nothing about what they did wrong. */
  const over = gameOver(state);
  if (over) throw new Error(`The game is over (${over.reason}); there is no next step`);
  const events = [];

  /* CR 500.4, on the way out of the step that is ending. */
  emptyManaPools(state, events);

  /* CR 514.3a: a cleanup step that gave priority is followed by another. */
  if (state.phase === "CLEANUP" && state.cleanupAgain === true) {
    state.cleanupAgain = false;
    arrive(state, events);
    return events;
  }

  /* CR 500.8: phases added after the one now ending go directly after it -- the most recently added first -- and then the
     turn goes on from where it was (`resumeAfter`). A conditional step among them happens only if it would. */
  const due = (state.extraPhases ?? []).filter((added) => added.turn === state.turn && added.after === state.phase);
  if (due.length) {
    state.extraPhases = state.extraPhases.filter((added) => !due.includes(added));
    state.stepQueue = [...due.reverse().flatMap((added) => added.steps.map((name) => PHASE_NAMES.indexOf(name))), ...(state.stepQueue ?? [])];
    if (!Number.isInteger(state.resumeAfter)) state.resumeAfter = state.stepIndex;
  }
  let next;
  while (next === undefined && (state.stepQueue ?? []).length) {
    const queued = state.stepQueue.shift();
    if (!STEPS[queued].when || CONDITIONS[STEPS[queued].when](state)) next = queued;
  }
  if (next === undefined) {
    next = (Number.isInteger(state.resumeAfter) ? state.resumeAfter : state.stepIndex) + 1;
    state.resumeAfter = null;
    while (next < STEPS.length && STEPS[next].when && !CONDITIONS[STEPS[next].when](state)) next += 1;
  }

  if (next >= STEPS.length) {
    /* CR 500.7 extra turns and CR 500.8 extra phases arrive in 1.6 with the triggers that grant
       them; until then a turn is followed by the next living player's. */
    const previous = state.activePlayer;
    state.activePlayer = nextLivingPlayer(state, state.activePlayer);
    state.turn += 1;
    /* "Since the beginning of your last upkeep" (echo, CR 702.30a; script/condition.mjs): the turn of theirs before this one. */
    if (state.players[state.activePlayer].turnBegan > 0) state.players[state.activePlayer].previousTurnBegan = state.players[state.activePlayer].turnBegan;
    state.players[state.activePlayer].turnBegan = state.turn;   /* CR 302.6, keywords/timing.mjs */
    /* Whom they attack in this turn, from none: "players who attacked you during their last turn" (rules/combat.mjs). */
    if (state.players[state.activePlayer].attackedPlayers) state.players[state.activePlayer].attackedPlayers = [];
    /* Whose next turn has now begun: this player's -- and each player who has left the game and whose turn it would have been
       on the way here, since an effect lasting until that player's next turn lasts until that turn would have begun (CR
       800.4m: Reflector Mage's controller conceding does not lock a name for the rest of the game). */
    const reached = [...skippedSeats(state, previous, state.activePlayer), state.activePlayer];
    /* "Until your next turn" (goad, CR 701.15a): over as that player's turn begins. */
    state.effects = (state.effects ?? []).filter((e) => !(e.until === "your-next-turn" && reached.includes(e.sourceController)));
    /* And "until that player's next turn" (Teferi's Reproach): over as that player's turn begins. */
    state.effects = state.effects.filter((e) => !(e.until === "their-next-turn" && (e.players ?? []).includes(state.activePlayer)));
    /* And a delayed trigger that lasted until then (effects/permanents.mjs, `untilYourNextTurn`). */
    if ((state.delayedTriggers ?? []).some((d) => d.untilYourNextTurn)) state.delayedTriggers = state.delayedTriggers.filter((d) => !(d.untilYourNextTurn && d.controller === state.activePlayer));
    /* CR 305.2 says "already played a land THIS TURN", so the count is per turn and resets for
       everyone, not only for whoever is about to take it. The difference shows the moment an
       effect lets somebody play a land on another player's turn: resetting only the active
       player's would carry that use forward and deny them their own land drop. */
    for (const player of state.players) player.landsPlayed = 0;
    /* And what each has cast this turn (rules/actions.mjs), counted afresh. */
    for (const player of state.players) if (player.castThisTurn) player.castThisTurn = [];
    /* Phases added to the turn that ended went with it; the combats of this one are counted from none. */
    state.extraPhases = [];
    state.stepQueue = [];
    state.resumeAfter = null;
    state.combatsThisTurn = 0;
    for (const player of state.players) {
      if (player.lostThisTurn) player.lostThisTurn = 0;
      /* And the loyalty abilities each activated (rules/actions.mjs). */
      if (player.loyaltyThisTurn) player.loyaltyThisTurn = 0;
      /* And what each gained and made this turn (script/amount.mjs, lifeGainedThisTurn, tokensCreatedThisTurn). */
      if (player.gainedThisTurn) player.gainedThisTurn = 0;
      if (player.tokensThisTurn) player.tokensThisTurn = 0;
      /* And how many permanents left the battlefield under each one's control (state/index.mjs, revolt), and what entered
         under it (rules/trigger.mjs, recordArrivals). */
      if (player.leftThisTurn) player.leftThisTurn = 0;
      if (player.enteredThisTurn) player.enteredThisTurn = [];
      /* And whether each was dealt combat damage (rules/combat.mjs). */
      if (player.combatDamagedThisTurn) player.combatDamagedThisTurn = false;
      /* And the sources each controlled that dealt combat damage to a player, with their creature types (prowl, CR 702.76a). */
      if (player.combatDamageSources) delete player.combatDamageSources;
    }
    next = 0;
  }

  state.stepIndex = next;
  state.phase = STEPS[next].phase;
  arrive(state, events);
  return events;
}
