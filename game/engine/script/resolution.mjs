/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A RESOLUTION THAT CAN STOP HALF WAY THROUGH AND CARRY ON.
 *
 * `docs/engine/PLAN.md` §3.2.4 — "resume from any decision is a first-class feature, not a recovery
 * hack". Phase 1 made that true for turn-based actions: declaring attackers, discarding at cleanup.
 * This makes it true for card effects, which is where it is actually used. "Scry 2, then draw a
 * card" has to ask between the two, and the draw has to still happen afterwards.
 *
 * A QUEUE, NOT A CALL STACK. The effects of a resolution sit in a list, and a chosen mode's effects
 * are SPLICED INTO THE FRONT of it. That is what makes a modal containing a scry work: the scry
 * stops the resolution exactly as a top-level scry would, and whatever followed the modal is still
 * sitting behind it. Written with recursion, the paused call would have had to unwind across the
 * pause and rebuild itself on the way back in — which is the same reason the engine as a whole is a
 * state machine rather than a thread that blocks.
 *
 * AND IT IS PLAIN DATA. `state.resolving` is a list, an index and a context, so a game saved in the
 * middle of an effect resumes in the middle of that effect. Holding a generator or a closure here
 * would have made §3.2.4 true of everything except the part players spend the most time in.
 */

import {runEffect, eachOf} from "./effects/index.mjs";
import {mergedOrderToAsk} from "../state/index.mjs";
import {ASKING, commandersGoingHome} from "./effects/asking.mjs";
import {damageQuestion, addCounters, counterQuestion} from "./effects/resources.mjs";
import {controllerOf} from "../rules/layers.mjs";
import {drawQuestion, dredgers, singleDrawSteps} from "./effects/zones.mjs";
import {tokenQuestion, tokenEntryEffectFrame} from "./effects/permanents.mjs";
import {bindEffect} from "./bind.mjs";
import {countEffect, amountOf} from "./amount.mjs";
import {conditionHolds} from "./condition.mjs";
import {proliferateTimes, drawsMore} from "../rules/statics.mjs";
import {beginRuleOperation} from "../rules/operations.mjs";
import {destructionFrame} from "../rules/destruction-operation.mjs";
import {zoneEffectFrame} from "../rules/zone-operation.mjs";

/** Whether a resolution is paused, waiting for somebody. */
export const resolutionPending = (state) => Boolean(state.resolving);

/**
 * Start resolving a list of effects. `rng`, the game's random stream, reaches every effect of it (batch 80): it is handed
 * in at each step rather than kept, since a generator is not state and the resolution must stay plain data.
 *
 * @returns {{status: "done"|"waiting", events: Array}}
 */
export function beginResolution(state, effects, context = {}, rng = null) {
  if (state.resolving) throw new Error("A resolution is already under way; finish it before starting another");
  state.resolving = {
    queue: structuredClone(effects ?? []),
    /* `targets` are the ones still legal as the resolution began (bind.mjs, CR 608.2b), null where one is not. */
    context: {controller: context.controller ?? 0, source: context.source ?? null, x: context.x ?? 0, targets: context.targets ?? [], facts: context.facts ?? [],
      ...(context.about ? {about: context.about} : {}), ...(context.lastKnown ? {lastKnown: context.lastKnown} : {}), ...(context.attached !== undefined ? {attached: context.attached} : {}),
      /* What the ability's permanent chose as it entered ("the chosen type", script/chosen.mjs). */
      ...(context.chosen !== undefined ? {chosen: context.chosen} : {}),
      /* How a spell was cast, for "if this spell was cast from a graveyard" (script/condition.mjs, `cast`). */
      ...(context.cast ? {cast: context.cast} : {}),
      /* The opponent a spell's gift was promised to (CR 702.174k): "the chosen player" (script/bind.mjs), "if the gift was
         promised" (script/condition.mjs, `giftPromised`). */
      ...(context.gift !== undefined ? {gift: context.gift} : {}),
      /* How many times its source had transformed as the ability went on the stack (CR 701.27f; rules/stack.mjs). */
      ...(context.sourceTransforms !== undefined ? {sourceTransforms: context.sourceTransforms} : {}),
      /* Its source, gone before it reached the stack, for "this card" (Angelic Destiny; rules/stack.mjs, script/bind.mjs). */
      ...(context.sourceWas !== undefined ? {sourceWas: context.sourceWas} : {}),
      /* What the cost sacrificed, as it last existed ("the sacrificed creature's power"; script/amount.mjs). */
      ...(context.sacrificed ? {sacrificed: context.sacrificed} : {}),
      /* Its targets as they were chosen: what a total was divided among (CR 601.2d; script/amount.mjs, dividedAmong). */
      ...(context.targetsChosen ? {targetsChosen: context.targetsChosen} : {}),
      /* And the division its caster announced, target by target (CR 601.2d; effects/resources.mjs, damageHits' `divided`). */
      ...(context.division ? {division: context.division} : {}),
      /* How many times its ability resolved before this one this turn (rules/stack.mjs; script/condition.mjs, firstResolution). */
      ...(context.resolvedBefore !== undefined ? {resolvedBefore: context.resolvedBefore} : {})},
    events: [],
  };
  return runResolution(state, rng);
}

/* The events this resolution has not handed back yet. A resolution that stops to ask hands back what happened before the
   question, and on carrying on only what happened after: each event once, whatever reads them -- a log, the conformance
   suite's "a life change begins where the last ended" (Uro: the 3 life gained, then "you may put a land card"). The whole
   list stays with the resolution. */
function unreported(resolving) {
  const fresh = resolving.events.slice(resolving.reported ?? 0);
  resolving.reported = resolving.events.length;
  return fresh;
}

/**
 * Work through the queue until it is empty or something asks a question.
 *
 * @returns {{status: "done"|"waiting", events: Array}}
 */
export function runResolution(state, rng = null) {
  const resolving = state.resolving;
  if (!resolving) return {status: "done", events: []};
  if (state.ruleOperation) return {status: "waiting", events: unreported(resolving)};

  while (resolving.queue.length > 0 || mergedOrderToAsk(state)) {
    if (mergedOrderToAsk(state) && resolving.queue[0]?.effect !== "orderMerged") resolving.queue.unshift({effect: "orderMerged"});
    /* Bound as it reaches the head, not when the queue was built: a modal's chosen effects arrive later, and are
       bound against the same targets as everything else (bind.mjs). */
    /* And counted as it reaches the head (CR 608.2h): "draw a card for each creature you control" counts then. */
    const effect = countEffect(state, bindEffect(resolving.queue[0], resolving.context, state), resolving.context);
    resolving.queue[0] = effect;
    /* Keep draw's existing remembered-card contract when replacement choices split the instruction across a pause.
       This is bookkeeping for that draw, not general remembered-object construct support (CR 608.2c). */
    if (effect?.effect === "__drawRemember") {
      resolving.queue.shift();
      resolving.context.remembered = resolving.events.slice(effect.fromEvent).map(e => e.data?.fields)
        .filter(f => f?.drawn === true && state.objects[f.drewAs]).map(f => f.drewAs);
      continue;
    }
    /* AN EFFECT'S OWN CONDITION (Forge's Condition): "Metalcraft -- If you control three or more artifacts, exile that
       creature". Asked now, as it reaches the head (CR 608.2c, the instructions in order); false, and it does nothing. */
    if (effect?.condition && !conditionHolds(state, effect.condition, {controller: resolving.context.controller, source: resolving.context.source, about: resolving.context.about,
      remembered: resolving.context.remembered, targets: resolving.context.targets, cast: resolving.context.cast, x: resolving.context.x,
      /* "If excess damage was dealt to that permanent this way" (Violent Echoes; effects/resources.mjs). */
      excessDamage: resolving.context.excessDamage, rememberedControllers: resolving.context.rememberedControllers,
      /* "If a Pirate was exiled this way" (`movedWas`), "if you search your library this way" (`searched`), and the source as it
         last was (CR 113.7a): what this resolution remembers of what its effects did. */
      movedWas: resolving.context.movedWas, searched: resolving.context.searched, lastKnown: resolving.context.lastKnown,
      /* "If this is the first time this ability has resolved this turn" (rules/stack.mjs counts them). */
      resolvedBefore: resolving.context.resolvedBefore, gift: resolving.context.gift})) {
      resolving.queue.shift();
      continue;
    }
    /* BRANCH (Forge's Branch; batch 72): "if you control six or more lands, create a token that's a copy of this creature
       instead" -- its own condition (`if`) asked now, as it reaches the head (CR 608.2c), and the effects of the way it goes
       put in front of whatever follows, so one of them may stop to ask (Composer of Spring's "you may put a card"). */
    if (effect?.effect === "branch") {
      const holds = conditionHolds(state, effect.if, {controller: resolving.context.controller, source: resolving.context.source, about: resolving.context.about,
        remembered: resolving.context.remembered, targets: resolving.context.targets, cast: resolving.context.cast, rolled: resolving.context.rolled,
        movedWas: resolving.context.movedWas, searched: resolving.context.searched, lastKnown: resolving.context.lastKnown, resolvedBefore: resolving.context.resolvedBefore,
        gift: resolving.context.gift});
      resolving.queue.shift();
      resolving.queue.unshift(...structuredClone((holds ? effect.then : effect.otherwise) ?? []));
      continue;
    }
    /* EMPOWER JACE N (the live-game plan of 2026-10-04): "put N loyalty counters on a Jace token you control. If you don't
       control one, first create a blue Jace planeswalker token" -- a token of yours with the subtype Jace. With two or
       more, which one is its controller's choice (chooseCard, kept where it is); with one, that one; with none, the
       predefined token made first (effects/permanents.mjs). Put in front of what follows, as a branch is. */
    /* "FOR EACH ..., THAT PLAYER SEARCHES" (Winds of Abandon, overloaded): a repetition whose effects ask, spliced in for each
       of what it ranges over (script/effects/index.mjs, eachOf: players in turn order, CR 101.4) -- each one's effects after
       a mark that makes it what "that player" and "that card" are while they run, so each is bound and counted as it reaches
       the head, as it would be repeated directly; and the resolution's own subject back after the last. */
    if (effect?.effect === "repeatFor" && (effect.effects ?? []).some((inner) => ASKING[inner?.effect] || inner?.effect === "connive")) {
      resolving.queue.shift();
      const before = resolving.context.about;
      const round = eachOf(state, effect.each, resolving.context).flatMap((about) => [{effect: "__about", about: {...(before ?? {}), ...about}}, ...structuredClone(effect.effects ?? [])]);
      /* "REPEAT THE FOLLOWING PROCESS X TIMES. EACH OPPONENT LOSES 3 LIFE UNLESS ..." (Torment of Hailfire; CR 608.2c, its
         instructions in order): `times`, counted as it reaches the head (CR 608.2h) -- the whole round, each of what it ranges
         over in turn, that many times over; none, and nothing is done. */
      const times = effect.times === undefined ? 1 : amountOf(state, effect.times, resolving.context);
      const spliced = Array.from({length: times}, () => structuredClone(round)).flat();
      resolving.queue.unshift(...spliced, {effect: "__about", ...(before !== undefined ? {about: before} : {})});
      continue;
    }
    if (effect?.effect === "__about") {
      resolving.queue.shift();
      if (effect.about === undefined) delete resolving.context.about; else resolving.context.about = effect.about;
      continue;
    }
    /* "IF YOU WOULD PROLIFERATE, PROLIFERATE TWICE INSTEAD" (Tekuthal, Inquiry Dominus; CR 614.1a, 701.34): replaced as it
       reaches the head, before anything is chosen, by as many proliferates as the replacements make (rules/statics.mjs,
       proliferateTimes) -- each its own choice of permanents and players, one after another (CR 701.34a). */
    /* "PROLIFERATE X TIMES, where X is the number of planeswalker types among planeswalkers you control" (Tam, the
       Possibility; CR 701.34a): `count`, counted as it reaches the head (CR 608.2h) -- that many proliferates, one after
       another, each one the replacements may change; none, and nothing is done. */
    if (effect?.effect === "proliferate" && effect.replaced !== true) {
      const times = proliferateTimes(state, resolving.context.controller) * (Number.isInteger(effect.count) ? effect.count : 1);
      if (times !== 1) {
        resolving.queue.shift();
        resolving.queue.unshift(...Array.from({length: times}, () => ({...structuredClone(effect), replaced: true})));
        continue;
      }
    }
    /* "ADD ONE MANA OF ANY COLOR FOR EACH ..." as an effect resolves (Coalition Relic; CR 106.3): which color each is, its
       controller's to say (effects/asking.mjs, manaColors) -- how many counted now, as the effect reaches the head. */
    /* "Add two mana of any one color. Spend this mana only to cast spells with mana value 4 or greater" (Ashling, Rimebound):
       one color for all of it (`oneColor`), and what it may pay for (`spendOnly`), carried to the question. */
    if (effect?.effect === "addMana" && effect.anyColor === true && effect.mana === undefined) {
      resolving.queue[0] = {effect: "manaColors", count: Number.isInteger(effect.count) ? effect.count : 1, ...(effect.oneColor === true ? {oneColor: true} : {}),
        ...(effect.spendOnly ? {spendOnly: effect.spendOnly} : {})};
      continue;
    }
    /* "LOOK AT TARGET PLAYER'S HAND" (Gitaxian Probe; CR 701.20e): a look at a hand is shown to its looker while they look,
       and asked of them so they may (effects/asking.mjs, handLook). */
    if (effect?.effect === "peekAndReveal" && effect.zone === "hand") {
      resolving.queue[0] = {effect: "handLook", who: effect.who};
      continue;
    }
    /* "ADD {B} OR {G} FOR EACH PERMANENT DESTROYED THIS WAY" (Culling Ritual; CR 106.1a): one of `colors` for each mana, its
       controller's to say mana by mana (effects/asking.mjs, manaColors) -- how many counted now, as the effect reaches the head. */
    if (effect?.effect === "addMana" && Array.isArray(effect.colors) && effect.mana === undefined) {
      resolving.queue[0] = {effect: "manaColors", count: Number.isInteger(effect.count) ? effect.count : 1, colors: [...effect.colors]};
      continue;
    }
    if (effect?.effect === "empowerJace") {
      const jace = {what: "permanent", token: true, subtypes: ["Jace"], controller: "you"};
      const count = Math.max(0, effect.count ?? 0);
      resolving.queue.shift();
      resolving.queue.unshift({effect: "branch", if: {present: jace, atLeast: 2},
        then: [{effect: "chooseCard", zone: "battlefield", selector: jace, count: 1, to: "stay", remember: true},
          {effect: "putCounter", targets: "remembered", counter: "loyalty", count}],
        otherwise: [{effect: "branch", if: {present: jace},
          then: [{effect: "putCounterAll", selector: jace, counter: "loyalty", count}],
          otherwise: [{effect: "createToken", count: 1, token: {predefined: "Jace"}, remember: true},
            {effect: "putCounter", targets: "remembered", counter: "loyalty", count}]}]});
      continue;
    }
    /* CONNIVE (CR 701.50): "each creature that convoked this spell connives" (Lethal Scheme). Each permanent told to connive
       does, one at a time: the first player in APNAP order controlling one still to connive picks which, when they control two
       or more (701.50c; effects/asking.mjs, conniveWhich). One that has left the battlefield still connives, by its last
       controller (701.50b) -- here the spell's controller, whose creatures convoked it. Conniving is its controller drawing
       N cards and discarding N (701.50a, 701.50d), each the draw and the discard they are everywhere else, then a +1/+1
       counter on it for each nonland card discarded, if it is still there (`__connived`). Connive 0 does nothing (701.50e). */
    if (effect?.effect === "connive") {
      resolving.queue.shift();
      const n = Math.max(0, effect.count ?? 1);
      if (n === 0) continue;
      if (effect.one) {
        const {id, controller} = effect.one;
        if (!state.players[controller] || state.players[controller].lost) continue;
        resolving.queue.unshift({effect: "draw", who: [controller], count: n}, {effect: "discard", who: [controller], count: n, remember: true, rememberOf: controller},
          {effect: "__connived", card: id, controller});
        continue;
      }
      const conniving = effect.conniving ?? [...new Set(effect.targets ?? [])].map((id) => ({id,
        controller: state.objects[id]?.zone === "battlefield" ? controllerOf(state, id) : resolving.context.controller}));
      const still = conniving.filter((c) => state.players[c.controller] && !state.players[c.controller].lost);
      if (!still.length) continue;
      const seats = state.players.length, rank = (p) => (p - (state.activePlayer ?? 0) + seats) % seats;
      const first = still.reduce((best, c) => (rank(c.controller) < rank(best.controller) ? c : best)).controller;
      const theirs = still.filter((c) => c.controller === first), rest = still.filter((c) => c.controller !== first);
      resolving.queue.unshift(...(theirs.length > 1 ? [{effect: "conniveWhich", player: first, theirs, rest, n}]
        : [{effect: "connive", one: theirs[0], count: n}, ...(rest.length ? [{effect: "connive", conniving: rest, count: n}] : [])]));
      continue;
    }
    if (effect?.effect === "__connived") {
      resolving.queue.shift();
      /* What the discard before it discarded, as the cards they became (effects/asking.mjs, discard's `remember`). */
      const nonland = (resolving.context.remembered ?? []).filter((id) => state.objects[id] && !(state.objects[id].types ?? []).includes("Land")).length;
      if (nonland > 0 && state.objects[effect.card]?.zone === "battlefield") {
        const events = [];
        addCounters(state, effect.card, "+1/+1", nonland, events, effect.controller);
        resolving.events.push(...events);
      }
      continue;
    }
    /* CR 903.9b: a commander this sends to its owner's hand or library may go to the command zone instead -- a
       replacement, so the owners are asked before anything moves (effects/asking.mjs, commanderHome). */
    const home = effect?.effect === "moveZone" || effect?.effect === "counterSpell" ? commandersGoingHome(state, effect) : [];
    let asked = null;
    if (home.length) resolving.queue[0] = {effect: "commanderHome", commanders: home, move: effect};
    /* CR 616.1: damage that two or more effects would change, where the order changes how it ends -- the player dealt it
       chooses which applies first, before any of it is dealt (effects/asking.mjs, orderDamage). */
    else if (damageQuestion(state, effect, resolving.context, effect?.damageOrders ?? {}))
      resolving.queue[0] = {effect: "orderDamage", damage: effect, answers: effect.damageOrders ?? {}};
    /* "Choose a counter on target permanent. Put an additional counter of that kind on that permanent" (Ichormoon Gauntlet),
       "move a counter from target creature you control onto a second target creature" (Tidus): a kind of counter its
       controller chooses (`counter: "chosen"`), asked before it is done, among the kinds there (effects/asking.mjs,
       counterKind). */
    else if ((effect?.effect === "putCounter" || effect?.effect === "moveCounters") && effect.counter === "chosen")
      resolving.queue[0] = {effect: "counterKind", then: effect};
    /* "Remove up to three counters from another target creature or planeswalker" (Mabel, Bitter Recluse): which counters,
       of any kinds, its controller chooses as it resolves (CR 608.2d; effects/asking.mjs, countersToRemove). */
    else if (effect?.effect === "removeCounter" && effect.counter === "any" && effect.removing === undefined)
      resolving.queue[0] = {effect: "countersToRemove", then: effect};
    /* "Move any number of counters from target permanent you control onto a second target permanent you control" (Resourceful
       Defense; CR 122.5, 608.2d): which of the counters on the first, of any kinds, its controller chooses as it resolves --
       the same question (effects/asking.mjs, countersToRemove), then moved (`moving`, effects/resources.mjs). */
    else if (effect?.effect === "moveCounters" && effect.counter === "any" && effect.moving === undefined)
      resolving.queue[0] = {effect: "countersToRemove", then: effect};
    /* "You may move any number of +1/+1 counters from this creature onto other creatures" (Forgotten Ancient): where each
       goes, its controller's choice as it resolves (effects/asking.mjs, countersOnto). */
    else if (effect?.effect === "moveCounters" && effect.onto !== undefined)
      resolving.queue[0] = {effect: "countersOnto", then: effect};
    /* "For each of those permanents, choose a different opponent. Each opponent gains control of the permanent for which they
       were chosen" (Dack Fayden, Helping Hand): whose each becomes, its controller's choice as it resolves (CR 608.2d;
       effects/asking.mjs, controlToOpponents). */
    else if (effect?.effect === "gainControl" && effect.toEach === "different opponent")
      resolving.queue[0] = {effect: "controlToOpponents", then: effect};
    /* "Each of those tokens fights a different one of those creatures" (Ezuri's Predation): which fights which, its controller's
       choice as it resolves (CR 608.2d, the card's ruling; effects/asking.mjs, fightPartners), then every fight at once. */
    else if (effect?.effect === "fight" && effect.against !== undefined)
      resolving.queue[0] = {effect: "fightPartners", then: effect};
    /* CR 616.1: counters that two or more effects would change, where the order changes how many -- the permanent's
       controller chooses which applies first, before any is put on (effects/asking.mjs, orderCounters). */
    else if ((asked = counterQuestion(state, effect, resolving.context, effect?.counterOrders ?? {})))
      resolving.queue[0] = {effect: "orderCounters", put: effect, answers: effect.counterOrders ?? {}, question: asked};
    /* CR 616.1: tokens two or more effects would change, where the order changes what is made -- Anointed Procession and
       Queen Allenal's Soldier -- their controller chooses which applies first, before any is made (effects/asking.mjs,
       orderTokens). */
    else if ((asked = tokenQuestion(state, effect, resolving.context, effect?.tokenOrders ?? {})))
      resolving.queue[0] = {effect: "orderTokens", make: effect, answers: effect.tokenOrders ?? {}, question: asked};
    /* CR 616.1: a draw two players' Alms Collectors would replace -- the drawing player chooses whose, before any card is
       drawn (effects/asking.mjs, orderDraws). */
    else if ((asked = drawQuestion(state, effect, resolving.context, effect?.drawOrders ?? {})))
      resolving.queue[0] = {effect: "orderDraws", draw: effect, answers: effect.drawOrders ?? {}, question: asked};
    /* DREDGE (CR 702.52a; Life from the Loam, wave 4c k2): a draw a dredge card in a drawing player's graveyard could replace --
       each card drawn its own draw (CR 121.2) -- rewritten as it reaches the head into its single draws (effects/zones.mjs,
       singleDrawSteps: Alms Collector's, asked above, among them). The drawing player chooses competing dredge or mandatory
       replacements even with no dredger (effects/asking.mjs, dredgeDraw); a dredge card the first dredge milled may replace
       the next. Every replacement's whole modified instruction is checked before its individual draws proceed. */
    else if (effect?.effect === "draw" && singleDrawSteps(state, effect, resolving.context).some(({player, replaced}) =>
      dredgers(state, player).length || drawsMore(state, player).some(m => !replaced.includes(m.key))))
      resolving.queue.splice(0, 1, ...singleDrawSteps(state, effect, resolving.context).map(({player, replaced}) => ({effect: "dredgeDraw", player, replaced})),
        ...(effect.remember ? [{effect: "__drawRemember", fromEvent: resolving.events.length}] : []));
    const head = resolving.queue[0];
    const asking = ASKING[head?.effect];

    if (asking) {
      /* `open` returns false when there is nothing to ask about — an empty library to scry, a hand
         with nothing in it to discard. The effect is then simply done, rather than the game
         stopping on a question with no answers. It returns {events} when it was done without asking
         anybody (batch 80): a discard at random, nothing among the cards a dig may take. */
      const opened = asking.open(state, head, resolving.context, rng);
      if (opened === true) {
        state.awaiting.resolution = true;
        /* Asked of a player who has left the game -- "its controller may draw up to two cards" (Arcane Denial), its
           controller gone before the upkeep: answered as the rules answer it (answerDeparted, below). */
        if (departedAsked(state)) return answerDeparted(state, rng);
        return {status: "waiting", events: unreported(resolving)};
      }
      if (opened && Array.isArray(opened.events)) resolving.events.push(...opened.events);
      resolving.queue.shift();
      /* Done without asking, with what follows it put in front of the rest: "for each opponent who doesn't" when none could
         (effects/asking.mjs, sacrifice's `ifNot`). */
      if (opened && Array.isArray(opened.splice) && opened.splice.length) resolving.queue.unshift(...opened.splice);
      continue;
    }

    resolving.queue.shift();
    /* CR 616.1, 702.89a: destroying an Aura instead may create another destruction choice. Persist every caller stage,
       not just the top-level question, so neither that child nor the following instruction can run early. */
    let operationFrame = zoneEffectFrame(effect, resolving.context) ?? tokenEntryEffectFrame(effect, resolving.context);
    if (effect?.effect === "destroy" || effect?.effect === "destroyAll") operationFrame = destructionFrame(effect, resolving.context);
    if (operationFrame) {
      const outcome = beginRuleOperation(state, operationFrame, {after: {kind: "resolution"}}, rng);
      resolving.events.push(...outcome.events);
      if (outcome.status === "waiting") return {status: "waiting", events: unreported(resolving)};
      Object.assign(resolving.context, outcome.result?.context ?? {});
      continue;
    }
    resolving.events.push(...runEffect(state, effect, resolving.context, rng));
    /* ITS CONTROLLER HAS LEFT THE GAME ("you lose the game", CR 104.3e; effects/resources.mjs loseGame): the spell or ability
       left the stack with them (CR 800.4a), and nothing more of it is done. */
    if (state.resolving !== resolving || state.players[resolving.context.controller]?.lost) break;
  }

  const events = unreported(resolving);
  state.resolving = null;
  /* And all of them, for what triggers on them as a player would next receive priority (rules/turn.mjs). */
  return {status: "done", events, all: resolving.events};
}

/**
 * Apply the answer to whatever the resolution asked, and carry on.
 *
 * `extra` carries what the generic `indices` cannot: scry's `toBottom`, for instance. The choice
 * record says which fields it expects, and `controller.mjs` validates them.
 */
/** Resume the saved script caller after one of its explicit rule operations answers or completes. */
export function continueRuleResolution(state, outcome, rng = null) {
  const resolving = state.resolving;
  if (!resolving) throw new Error("No resolution is waiting for the rule operation");
  resolving.events.push(...outcome.events);
  if (outcome.status === "waiting") return {status: "waiting", events: unreported(resolving)};
  Object.assign(resolving.context, outcome.result?.context ?? {});
  return runResolution(state, rng);
}

export function answerResolution(state, indices, extra = {}, rng = null) {
  const awaiting = state.awaiting;
  if (!awaiting || awaiting.kind !== "effect-choice")
    throw new Error("The resolution is not waiting on an effect choice");
  const asking = ASKING[awaiting.effect];
  if (!asking) throw new Error(`No asking primitive named ${awaiting.effect}`);

  /* The game's random stream, for an answer that shuffles a library (a search); a generator is not state, so it is
     handed in, as the mulligan's is. */
  return carryOn(state, asking.apply(state, awaiting, indices, extra, rng), rng);
}

/* Whether the question the resolution is asking is asked of a player no longer in the game. */
const departedAsked = (state) => state.players[state.awaiting.player].lost === true;

/**
 * The question this resolution is asking, of a player who has left the game (CR 800.4a): answered for them as the rules
 * say, and the resolution carried on (rules/sba.mjs, concede; and above, a question asked after they left). What was
 * theirs to choose among left with them: a discard from their hand, a sacrifice, a search of their library is no choice,
 * and the next player is asked (each primitive's `left`, effects/asking.mjs). A cost they would pay, or choose whether to
 * pay, is not paid (800.4f). Any other choice is made by another player the spell's or ability's controller chooses --
 * another opponent, since the one who left was an opponent (800.4g): with one opponent left that one, and with more the
 * controller is asked which (effects/asking.mjs, chooseInstead).
 */
export function answerDeparted(state, rng = null) {
  const awaiting = state.awaiting;
  const outcome = ASKING[awaiting.effect].left(state, awaiting);
  if (!outcome.another) return carryOn(state, outcome, rng);
  const controller = state.resolving.context.controller;
  const players = state.players.filter((p) => !p.lost && p.id !== controller).map((p) => p.id);
  state.awaiting = players.length === 1 ? {...outcome.another, player: players[0]}
    : {kind: "effect-choice", effect: "chooseInstead", player: controller, departed: awaiting.player, players, question: outcome.another};
  return carryOn(state, {events: [], again: true}, rng);
}

/* What an answer did, and the resolution carried on from it. */
function carryOn(state, outcome, rng) {
  const events = Array.isArray(outcome) ? outcome : outcome.events ?? [];
  state.resolving?.events.push(...events);

  /* `again` means the same effect has another player to ask — "each opponent discards a card" is
     one effect and several questions. The effect stays at the head of the queue and `open` is not
     called again, because `apply` has already set up the next question. One for a player who has left the game since is
     answered for them. */
  if (!Array.isArray(outcome) && outcome.again === true) {
    state.awaiting.resolution = true;
    if (departedAsked(state)) return answerDeparted(state, rng);
    return {status: "waiting", events: state.resolving ? unreported(state.resolving) : events};
  }

  state.awaiting = null;
  if (!state.resolving) return {status: "done", events};
  /* What the answer moved, remembered for the effects after it ("untap that land"). */
  /* Beside what was remembered before, when the answer says so (`rememberAdd`): "for each player, choose a creature that
     player controls" remembers each in turn (The Eternal Wanderer). */
  if (!Array.isArray(outcome) && Array.isArray(outcome.remembered)) state.resolving.context.remembered = outcome.rememberAdd === true
    ? [...(state.resolving.context.remembered ?? []), ...outcome.remembered] : outcome.remembered;
  /* And what it was as it left the battlefield (CR 608.2h): "that shares a card type with it" (Braids; script/bind.mjs). */
  if (!Array.isArray(outcome) && Array.isArray(outcome.movedWas)) state.resolving.context.movedWas = outcome.movedWas;
  /* "If you search your library this way, shuffle" (Claim Jumper): a library was searched -- whatever it found (CR 701.23). */
  if (!Array.isArray(outcome) && outcome.searched === true) state.resolving.context.searched = true;
  /* "Choose a creature type": the type, for the effects after it ("$chosen", script/bind.mjs). */
  if (!Array.isArray(outcome) && typeof outcome.chosen === "string") state.resolving.context.chosen = outcome.chosen;
  /* "Choose a color": the color, for the effects after it ("$chosenColor", script/chosen.mjs). */
  if (!Array.isArray(outcome) && typeof outcome.chosenColor === "string") state.resolving.context.chosenColor = outcome.chosenColor;
  /* And whose it is (`colorChooser`): "each player chooses a color. Then exile each permanent unless ... it's only the color
     its controller chose" (Selective Obliteration) -- each player's own, for a selector's `onlyChosenColor` (script/filter.mjs). */
  if (!Array.isArray(outcome) && typeof outcome.chosenColor === "string" && Number.isInteger(outcome.colorChooser))
    state.resolving.context.chosenColors = {...(state.resolving.context.chosenColors ?? {}), [outcome.colorChooser]: outcome.chosenColor};
  /* "You may pay {X}" (Halo Forager; CR 107.3f): the X its payer chose and paid, for what follows -- "when you do, ... with
     mana value X". */
  if (!Array.isArray(outcome) && Number.isInteger(outcome.paidX)) state.resolving.context.x = outcome.paidX;
  /* "Each opponent may ...": a player who did (effects/asking.mjs, modal's `did`), for "for each opponent who does". */
  if (!Array.isArray(outcome) && Number.isInteger(outcome.did)) state.resolving.context.whoDid = [...(state.resolving.context.whoDid ?? []), outcome.did];
  /* A vote's count, by choice (effects/asking.mjs, vote; CR 701.38), for "for each past vote". */
  if (!Array.isArray(outcome) && outcome.votes && typeof outcome.votes === "object") state.resolving.context.votes = {...outcome.votes};

  /* The effect that asked is finished. A modal hands back the chosen modes' effects, which go in
     front of whatever was already queued. */
  state.resolving.queue.shift();
  if (!Array.isArray(outcome) && Array.isArray(outcome.splice) && outcome.splice.length > 0) {
    state.resolving.queue.unshift(...outcome.splice);
  }
  /* An answered play choice can start an instruction that itself asks before entry. Withdraw the old question and
     advance its queue first, then let the explicit child own the wait; its splice remains behind that child. */
  if (!Array.isArray(outcome) && outcome.operation)
    return continueRuleResolution(state, beginRuleOperation(state, outcome.operation, {after: {kind: "resolution"}}, rng), rng);
  /* What follows the answer has the same random stream the answer had. */
  return runResolution(state, rng);
}

/** The choice record for whatever the resolution is asking (§12.1). */
export function resolutionChoice(state, awaiting) {
  const asking = ASKING[awaiting.effect];
  if (!asking) throw new Error(`No asking primitive named ${awaiting.effect}`);
  return asking.choice(state, awaiting);
}
