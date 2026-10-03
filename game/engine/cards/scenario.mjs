/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A CARD'S SCENARIOS: A STARTING POSITION, THE MOVES, AND WHAT EACH SEAT THEN SEES.
 *
 * `docs/engine/PLAN.md` §3.4 and §6's phase 2.4 -- "each [card] with a scenario test (`<slug>.scenarios.json`: a
 * starting position, a sequence of decisions, and assertions on the resulting projection)". This is the runner, kept
 * in the engine rather than in a test because two things need it: `tests/engine-cards.mjs`, which runs every card's
 * scenarios, and the card loader (AI-3), whose smoke test casts a newly learned card in a scratch game.
 *
 * IT PLAYS BY THE RULES, NOT AROUND THEM. A move is one of the actions `legalActions` offered, found by what it
 * names -- the card, and for a spell its targets -- so a scenario cannot do what the rules would not let a player do,
 * and "this is not offered" is a check like any other. Passing goes through `passPriority`, moving on through
 * `advance`, a question through `resolveAwaiting`: the same calls the room makes.
 *
 * WHAT IT CHECKS IS WHAT A SEAT SEES. Zones are read from `projectFor(state, seat)`, the view the seat's player is
 * sent, so a scenario that passes has also shown its card leaks nothing (a library is a count, even to its owner).
 *
 *   {schema: "CrankCardScenarios@1", card, fixtures?: {name: object}, scenarios: [{
 *     name, seats?: 2..4, at?: {turn, phase}, library?: [names],
 *     setup: [{seat, zone, cards, sick?}]   (a card put in the command zone is that seat's commander),
 *     steps: [ {play|tap|cast|activate: name, seat?, targets?: [{card, seat?} | {player}] | "any", ability?, mana?, x?, optional?}
 *            | {resolve: true} | {settle: true} | {pass: n} | {to: {turn, phase}} | {answer: [indices]} | {expect: [...]} ],
 *   (`targets: "any"` takes the first legal aim; `optional` skips a move the rules do not offer; `settle` answers every
 *   question with its first legal answer and resolves the stack until it is empty -- the card loader's smoke test.)
 *     expect: [ {seat, zone, cards} | {seat, zone, count} | {seat, life} | {seat, poison} | {stack} | {seat, tapped, is}
 *             | {seat, pool} | {offers: {kind, card, seat?}, count, targets?} | {event, where} ] }]}
 */

import {controllerOf} from "../rules/layers.mjs";
import {createState, addObject} from "../state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../rules/turn.mjs";
import {legalActions, applyAction} from "../rules/actions.mjs";
import {passPriority} from "../rules/priority.mjs";
import {gameOver} from "../rules/sba.mjs";
import {projectFor} from "../projection.mjs";
import {createRng} from "../rng.mjs";
import {targetName, isChoosing} from "../script/bind.mjs";

export const SCENARIOS_SCHEMA = "CrankCardScenarios@1";

/* The basic lands, for a directory that has no definition of them: a land with its mana ability. */
const BASIC = {Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G", Wastes: "C"};
const basic = (name) => (BASIC[name]
  ? {types: ["Land"], supertypes: ["Basic"], ...(name !== "Wastes" ? {subtypes: [name]} : {}),
    abilities: [{id: `t-${BASIC[name].toLowerCase()}`, kind: "mana", tapSelf: true, produces: {[BASIC[name]]: 1}}]}
  : null);

const ZONES = {hand: "Hand", battlefield: "Battlefield", graveyard: "Graveyard", exile: "Exile", command: "Command", library: "Library"};
const STEP_LIMIT = 2000;

/* Questions the rules ask on the way that a scenario has no view on: nobody attacks or blocks unless a step says so,
   a player's triggers go on in the order offered, and the legend rule keeps the first (CR 704.5j). Anything else stops
   the scenario, by name. */
function routine(state) {
  const kind = state.awaiting?.kind;
  if (kind === "declare-attackers" || kind === "declare-blockers") return resolveAwaiting(state, []);
  if (kind === "order-triggers") return resolveAwaiting(state, awaitingChoice(state).options.map((o) => o.index));
  if (kind === "legend-rule") return resolveAwaiting(state, [0]);
  return null;
}

/**
 * Run one scenario.
 *
 * @param {object} scenario  one entry of a scenarios file
 * @param {(name: string) => ?object} cards  a card's definition (cards/index.mjs `definition`), for any name not a basic
 *   land or one of the file's `fixtures`
 * @param {object} [fixtures]  objects for the file's supporting cast: the vanilla creature a removal spell is aimed at
 * @returns {{passed: string[], state: object, events: Array}} each check's description; throws on the first failure
 */
export function runScenario(scenario, cards, fixtures = {}) {
  const passed = [];
  const events = [];
  const fail = (message) => { throw new Error(`${scenario.name}: ${message}`); };
  const seats = scenario.seats ?? 2;
  const names = ["Rob", "Maya", "Trey", "Sam"].slice(0, seats);
  const state = createState({matchId: "scenario", seed: scenario.name, players: names.map((name) => ({name}))});
  const rng = createRng(scenario.name);
  const record = (list) => { events.push(...(list ?? [])); return list; };

  const define = (name) => {
    const object = fixtures[name] ? structuredClone(fixtures[name]) : cards(name) ?? basic(name);
    if (!object) fail(`no definition of ${name}: the engine cannot play it, and it is not a fixture`);
    return object;
  };
  const put = (seat, zone, name) => {
    const object = define(name);
    return addObject(state, {...object, card: name, owner: seat, controller: seat, ...(zone === "command" ? {commander: true} : {})},
      zone, ["battlefield", "exile"].includes(zone) ? null : seat);
  };

  /* Every library starts with twenty of the same filler, so a draw is visible and never the game's end. */
  for (let seat = 0; seat < seats; seat += 1)
    for (let i = 0; i < 20; i += 1) put(seat, "library", (scenario.library ?? [])[i] ?? "Wastes");
  for (const entry of scenario.setup ?? []) if (!entry.sick) for (const name of entry.cards) put(entry.seat, entry.zone, name);
  record(beginGame(state));

  /* The rules loop the room runs, without the people: pass, advance, and the routine questions. */
  const stepOnce = () => {
    if (state.awaiting) { if (!routine(state)) fail(`the game asks ${state.awaiting.kind}, which the scenario did not answer`); return; }
    if (state.priorityPlayer === null) { record(advance(state)); return; }
    const outcome = passPriority(state, null, rng);
    record(outcome.events);
    if (outcome.outcome === "step-ends") record(advance(state));
  };
  /* Every question with its first legal answer, as settle answers -- for a smoke game moving through turns, where a draw
     trigger's "you may" or an opponent's spell asks something nobody scripted. A scenario never sets it. */
  const settleOne = () => {
    const choice = awaitingChoice(state);
    const amounts = choice.mode === "damage" || choice.mode === "amount" ? choice.options.map(() => 0) : null;
    if (amounts && choice.total) amounts[0] = choice.total;
    record(resolveAwaiting(state, amounts ? [] : choice.options.slice(0, choice.min ?? 0).map((o) => o.index), amounts, rng));
  };
  const goTo = ({turn, phase, settle = false}) => {
    for (let n = 0; n < STEP_LIMIT; n += 1) {
      /* A smoke game the card ended (Tasha's Hideous Laughter exiling a library of Wastes): played to its end. */
      if (scenario.stopWhenOver && gameOver(state)) return;
      if (settle && state.awaiting && !["declare-attackers", "declare-blockers", "order-triggers"].includes(state.awaiting.kind)) { settleOne(); continue; }
      /* The first moment in that step at which someone holds priority: a trigger of the step may be waiting on the
         stack, which is what a scenario about that trigger wants to see. */
      if (state.turn === turn && state.phase === phase && state.priorityPlayer !== null && !state.awaiting) return;
      /* Or a question that step asks which no routine answers -- an upkeep trigger's targets -- for the scenario to answer. */
      if (state.turn === turn && state.phase === phase && state.awaiting && !["declare-attackers", "declare-blockers", "order-triggers"].includes(state.awaiting.kind)) return;
      if (state.turn > turn) break;
      stepOnce();
    }
    fail(`never reached turn ${turn}, ${phase}`);
  };
  goTo(scenario.at ?? {turn: 1, phase: "MAIN1"});
  for (const entry of scenario.setup ?? []) if (entry.sick) for (const name of entry.cards) put(entry.seat, entry.zone, name);

  const seatOf = (step) => step.seat ?? state.priorityPlayer;
  const sameTargets = (action, wanted) => {
    const got = action.targets ?? [];
    if (got.length !== (wanted ?? []).length) return false;
    return got.every((t, i) => {
      const w = wanted[i];
      /* A counted target ("up to two target creatures", a list in the step): the offer holds its placeholder, and the list
         is picked once the offer is taken (CR 601.2c; script/bind.mjs). */
      if (Array.isArray(w)) return isChoosing(t);
      if (w.player !== undefined) return t.kind === "player" && t.id === w.player;
      return t.kind === "object" && targetName(state, t) === w.card && (w.seat === undefined || state.objects[t.id].controller === w.seat);
    });
  };
  const offered = ({kind, card, seat}, targets) => legalActions(state, seat ?? state.priorityPlayer)
    .filter((a) => a.kind === kind && (card === undefined || a.label === card) && (targets === undefined || sameTargets(a, targets)));

  function act(step) {
    const seat = seatOf(step);
    const [kind, card] = step.play ? ["play-land", step.play] : step.tap ? ["activate-mana", step.tap]
      : step.cast ? ["cast", step.cast] : ["activate", step.activate];
    const aim = step.targets === "any" ? undefined : (kind === "cast" || kind === "activate" ? step.targets ?? [] : undefined);
    let found = offered({kind, card, seat}, aim);
    if (kind === "activate" && step.ability !== undefined) found = found.filter((a) => a.abilityId === step.ability);
    /* Which of a mana ability's alternatives: "{T}: Add {W} or {U}" taps for the one named. */
    if (step.mana !== undefined) found = found.filter((a) => JSON.stringify(a.mana) === JSON.stringify(step.mana));
    /* The value chosen for X (CR 107.3): the offer that names it. */
    if (step.x !== undefined) found = found.filter((a) => a.x === step.x);
    /* Which modes, chosen as it is cast (CR 700.2): the offer that names them. */
    if (step.modes !== undefined) found = found.filter((a) => JSON.stringify(a.modes) === JSON.stringify(step.modes));
    /* Which way it is paid for: an alternative cost by its ability's place (CR 118.9), or `false` for the mana cost. */
    if (step.alternative !== undefined) found = found.filter((a) => (a.alternative ?? false) === step.alternative);
    for (const key of ["exile"]) if (step[key] !== undefined) found = found.filter((a) => (a.costNames ?? []).includes(step[key]));
    /* Which permanent a "Sacrifice a creature" cost takes, which card a discard does, or which creature an "untap a tapped
       creature you control" cost untaps: the offer that names it. */
    for (const key of ["sacrifice", "discard", "untap"]) if (step[key] !== undefined) found = found.filter((a) => (a.costNames ?? []).includes(step[key]));
    /* Which creature a "tap another untapped creature you control" cost taps (station): the offer that names it. */
    if (step.tapping !== undefined) found = found.filter((a) => a.costChoice?.tap !== undefined && state.objects[a.costChoice.tap]?.card === step.tapping);
    if (!found.length && step.optional) return;
    if (!found.length) fail(`${names[seat]} is not offered ${kind} ${card}${step.targets ? ` at ${JSON.stringify(step.targets)}` : ""}`);
    record(applyAction(state, seat, found[0]));
    /* Each counted target the step names as a list, picked as it is asked: by name, or player, and seat. */
    for (let n = 0; n < 8 && state.awaiting?.kind === "choose-targets" && state.awaiting.stackId === undefined && Array.isArray((aim ?? [])[state.awaiting.index]); n += 1) {
      const choice = awaitingChoice(state), used = new Set();
      const indices = aim[state.awaiting.index].map((w) => {
        const option = choice.options.find((o) => !used.has(o.index) && (w.player !== undefined ? o.targets[0].kind === "player" && o.targets[0].id === w.player
          : o.targets[0].kind === "object" && targetName(state, o.targets[0]) === w.card && (w.seat === undefined || controllerOf(state, o.targets[0].id) === w.seat)));
        if (!option) fail(`${card}: no ${JSON.stringify(w)} among ${choice.options.map((o) => o.label).join(", ")}`);
        used.add(option.index);
        return option.index;
      });
      record(resolveAwaiting(state, indices));
    }
  }

  function check(expect) {
    for (const e of expect ?? []) {
      if (e.zone !== undefined) {
        const zone = projectFor(state, e.seat).players[e.seat].zones[ZONES[e.zone]];
        if (e.cards !== undefined) {
          const got = zone.cards.map((c) => c.name).sort();
          const want = [...e.cards].sort();
          if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${names[e.seat]}'s ${e.zone} is ${JSON.stringify(got)}, not ${JSON.stringify(want)}`);
          passed.push(`${names[e.seat]}'s ${e.zone}: ${want.join(", ") || "empty"}`);
        }
        if (e.count !== undefined) {
          if (zone.count !== e.count) fail(`${names[e.seat]}'s ${e.zone} holds ${zone.count}, not ${e.count}`);
          passed.push(`${names[e.seat]}'s ${e.zone} holds ${e.count}`);
        }
      } else if (e.life !== undefined) {
        const life = projectFor(state, e.seat).players[e.seat].life;
        if (life !== e.life) fail(`${names[e.seat]} is at ${life} life, not ${e.life}`);
        passed.push(`${names[e.seat]} at ${e.life} life`);
      } else if (e.poison !== undefined) {
        /* Poison counters, as the board shows them. */
        const poison = projectFor(state, e.seat).players[e.seat].health?.poison ?? 0;
        if (poison !== e.poison) fail(`${names[e.seat]} has ${poison} poison counters, not ${e.poison}`);
        passed.push(`${names[e.seat]} with ${e.poison} poison`);
      } else if (e.controls !== undefined) {
        /* What a seat controls on the battlefield -- a stolen creature is its new controller's (the zones are by owner). */
        const got = state.zones.battlefield.filter((id) => controllerOf(state, id) === e.seat).map((id) => state.objects[id].card).sort();
        const want = [...e.controls].sort();
        if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${names[e.seat]} controls ${JSON.stringify(got)}, not ${JSON.stringify(want)}`);
        passed.push(`${names[e.seat]} controls ${want.join(", ") || "nothing"}`);
      } else if (e.stack !== undefined) {
        const size = projectFor(state, 0).stackSize;
        if (size !== e.stack) fail(`the stack holds ${size}, not ${e.stack}`);
        passed.push(`the stack holds ${e.stack}`);
      } else if (e.tapped !== undefined) {
        const card = projectFor(state, e.seat).players[e.seat].zones.Battlefield.cards.find((c) => c.name === e.tapped);
        if (!card || card.tapped !== (e.is !== false)) fail(`${e.tapped} is ${card ? (card.tapped ? "tapped" : "untapped") : "not on the battlefield"}`);
        passed.push(`${e.tapped} ${e.is === false ? "untapped" : "tapped"}`);
      } else if (e.pool !== undefined) {
        const pool = state.players[e.seat].manaPool;
        for (const [color, n] of Object.entries(e.pool)) if ((pool[color] ?? 0) !== n) fail(`${names[e.seat]}'s pool has ${pool[color] ?? 0} ${color}, not ${n}`);
        passed.push(`${names[e.seat]}'s pool: ${JSON.stringify(e.pool)}`);
      } else if (e.offers !== undefined) {
        const found = offered(e.offers);
        if (found.length !== e.count) fail(`${e.offers.kind} ${e.offers.card ?? ""} is offered ${found.length} way(s), not ${e.count}`);
        if (e.targets !== undefined) {
          const got = found.map((a) => (a.targetNames ?? []).join(" + ")).sort();
          const want = e.targets.map((t) => t.join(" + ")).sort();
          if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${e.offers.card} is offered at ${JSON.stringify(got)}, not ${JSON.stringify(want)}`);
        }
        /* What each offer's cost takes ("Sacrifice a creature": one offer per creature). */
        if (e.costs !== undefined) {
          const got = found.map((a) => (a.costNames ?? []).join(" + ")).sort();
          const want = e.costs.map((c) => c.join(" + ")).sort();
          if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${e.offers.card} is offered paying ${JSON.stringify(got)}, not ${JSON.stringify(want)}`);
        }
        if (e.mana !== undefined) {
          const got = found.map((a) => JSON.stringify(a.mana)).sort();
          const want = e.mana.map((m) => JSON.stringify(m)).sort();
          if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${e.offers.card} offers ${got.join(" ")}, not ${want.join(" ")}`);
        }
        passed.push(`${e.offers.kind} ${e.offers.card ?? ""} offered ${e.count} way(s)`);
      } else if (e.asks !== undefined) {
        /* The question the game is waiting on: whom it asks, and the options it offers them. */
        if (!state.awaiting) fail(`nothing is being asked (expected ${JSON.stringify(e.asks)})`);
        const choice = awaitingChoice(state);
        if (e.asks.seat !== undefined && state.awaiting.player !== e.asks.seat) fail(`${names[state.awaiting.player]} is asked, not ${names[e.asks.seat]}`);
        if (e.asks.options !== undefined) {
          const got = choice.options.map((o) => o.label).sort();
          if (JSON.stringify(got) !== JSON.stringify([...e.asks.options].sort())) fail(`the question offers ${JSON.stringify(got)}, not ${JSON.stringify(e.asks.options)}`);
        }
        if (e.asks.min !== undefined && choice.min !== e.asks.min) fail(`the question takes at least ${choice.min}, not ${e.asks.min}`);
        passed.push(`asks ${names[state.awaiting.player]}: ${(e.asks.options ?? []).join(", ")}`);
      } else if (e.keywords !== undefined) {
        /* A permanent's current keywords, as its controller's view shows them. */
        const card = projectFor(state, e.seat).players[e.seat].zones.Battlefield.cards.find((c) => c.name === e.keywords.card);
        if (!card) fail(`${e.keywords.card} is not on ${names[e.seat]}'s battlefield`);
        for (const k of e.keywords.has ?? []) if (!card.keywords.includes(k)) fail(`${e.keywords.card} lacks ${k}`);
        for (const k of e.keywords.lacks ?? []) if (card.keywords.includes(k)) fail(`${e.keywords.card} has ${k}`);
        passed.push(`${e.keywords.card}: ${(e.keywords.has ?? []).join(", ")}${(e.keywords.lacks ?? []).length ? `, not ${e.keywords.lacks.join(", ")}` : ""}`);
      } else if (e.stats !== undefined) {
        /* A creature's current power and toughness, as its controller's view shows them (layer 7). */
        const card = projectFor(state, e.seat).players[e.seat].zones.Battlefield.cards.find((c) => c.name === e.stats.card);
        if (!card) fail(`${e.stats.card} is not on ${names[e.seat]}'s battlefield`);
        if (card.power !== e.stats.power || card.toughness !== e.stats.toughness) fail(`${e.stats.card} is ${card.power}/${card.toughness}, not ${e.stats.power}/${e.stats.toughness}`);
        passed.push(`${e.stats.card}: ${e.stats.power}/${e.stats.toughness}`);
      } else if (e.event !== undefined) {
        const hit = events.some((ev) => ev.kind === e.event && Object.entries(e.where ?? {}).every(([k, v]) => JSON.stringify(ev.data?.fields?.[k]) === JSON.stringify(v)));
        if (!hit) fail(`no ${e.event} with ${JSON.stringify(e.where ?? {})}`);
        passed.push(`${e.event} ${JSON.stringify(e.where ?? {})}`);
      } else fail(`an expectation the runner does not know: ${JSON.stringify(e)}`);
    }
  }

  for (const step of scenario.steps ?? []) {
    if (step.play || step.tap || step.cast || step.activate) act(step);
    else if (step.resolve) {
      if (!state.stack.length) fail("there is nothing on the stack to resolve");
      /* Everyone passes in turn until the top object has left the stack, or stopped to ask somebody. What its
         resolution put on the stack -- a permanent's "when this enters" -- waits for its own step. */
      const top = state.stack[state.stack.length - 1].stackId;
      for (let n = 0; n < STEP_LIMIT && state.stack.some((e) => e.stackId === top) && !state.awaiting; n += 1) stepOnce();
    } else if (step.settle) {
      for (let n = 0; n < STEP_LIMIT && (state.awaiting || state.stack.length); n += 1) {
        if (state.awaiting) {
          const choice = awaitingChoice(state);
          const amounts = choice.mode === "damage" || choice.mode === "amount" ? choice.options.map(() => 0) : null;
          if (amounts && choice.total) amounts[0] = choice.total;
          record(resolveAwaiting(state, amounts ? [] : choice.options.slice(0, choice.min ?? 0).map((o) => o.index), amounts, rng));
        } else stepOnce();
      }
    } else if (step.pass) {
      for (let n = 0; n < step.pass; n += 1) record(passPriority(state, null, rng).events);
    } else if (step.to) goTo(step.to);
    else if (step.attack) {
      /* On to the declare-attackers step of this turn, the named creatures attacking (each its first defender). */
      for (let n = 0; n < STEP_LIMIT && state.awaiting?.kind !== "declare-attackers"; n += 1) stepOnce();
      if (state.awaiting?.kind !== "declare-attackers") fail("the game never asked who attacks");
      const choice = awaitingChoice(state), picked = [];
      for (const name of step.attack) {
        const option = choice.options.find((o) => o.label.startsWith(`${name} → `) && !picked.some((i) => choice.options[i].cardId === o.cardId));
        if (!option) fail(`${name} cannot attack: ${choice.options.map((o) => o.label).join(", ") || "nothing can"}`);
        picked.push(option.index);
      }
      record(resolveAwaiting(state, picked));
    } else if (step.choose) {
      /* An answer by the options' words: ["Maya"] picks the option labeled Maya. */
      const choice = awaitingChoice(state);
      if (!choice) fail("nothing is being asked");
      const indices = step.choose.map((label) => { const o = choice.options.find((x) => x.label === label); if (!o) fail(`no option ${label}: ${choice.options.map((x) => x.label).join(", ")}`); return o.index; });
      record(resolveAwaiting(state, indices, null, rng, step.extra ?? {}));
    }
    else if (step.answer) record(resolveAwaiting(state, step.answer, null, rng, step.extra ?? {}));
    else if (step.expect) check(step.expect);
    else fail(`a step the runner does not know: ${JSON.stringify(step)}`);
  }
  check(scenario.expect);
  return {passed, state, events};
}
