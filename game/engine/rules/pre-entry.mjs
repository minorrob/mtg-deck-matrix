/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* CR 614.12a: an entrant is still in its old zone while choices modifying its entry are made. This operation keeps
   only the proposed characteristics and replacement progress. A local view derives what it would be on the field;
   it never joins the battlefield list, so a choice counting other permanents cannot count the entrant itself. */
import {registerRuleOperation, askRuleOperation, emitRuleEvents} from "./operations.mjs";
import {ruleReplacementCandidates, applyRuleReplacement} from "./replacement.mjs";
import {characteristicsOf, staticAbilities} from "./layers.mjs";
import {enteringChoice} from "./entering.mjs";
import {CREATURE_TYPES} from "../keywords/creature-types.mjs";
import {entryCopyPatch} from "../script/effects/permanents.mjs";
import {chosenFor, withChosen, namesChosen} from "../script/chosen.mjs";
import {matchesSelector} from "../script/filter.mjs";
import {amountOf} from "../script/amount.mjs";
import {cardsIn} from "../state/index.mjs";
import {runEffect} from "../script/effects/index.mjs";
import {cantBeSacrificed} from "./statics.mjs";

export function patchEnteringObject(object, patch) {
  for (const key of patch?.remove ?? []) delete object[key];
  Object.assign(object, structuredClone(patch?.set ?? {}));
}

export function prospectiveEnteringState(state, frame) {
  const object = {...(frame.candidate ?? state.objects[frame.objectId]), id: frame.objectId, zone: "battlefield", zonePlayer: null,
    controller: frame.player, counters: {}, tapped: false, timestamp: state.nextTimestamp};
  patchEnteringObject(object, frame.entryFace);
  if (frame.faceDown) Object.assign(object, {types: ["Creature"], subtypes: [], supertypes: [], colors: [], keywords: [], abilities: [], power: 2, toughness: 2});
  patchEnteringObject(object, frame.objectPatch);
  const own = (object.abilities ?? []).filter(ability => ability.kind === "static" && ability.layer !== undefined
    && ability.affects?.self === true && !ability.worksFrom).map(ability => ({...chosenFor(ability, object),
    sourceId: frame.objectId, sourceController: frame.player, timestamp: ability.timestamp ?? object.timestamp,
    partOf: `${frame.objectId}|${ability.text ?? ability.id ?? ""}`, affects: {...ability.affects, ids: [frame.objectId]}}));
  return {...state, objects: {...state.objects, [frame.objectId]: object}, effects: [...(state.effects ?? []), ...own]};
}

function proposalIn(view, frame) {
  const current = characteristicsOf(view, frame.objectId);
  return {...frame.proposal, player: frame.player, types: current.types,
    entering: {abilities: staticAbilities(view)(frame.objectId).map(ability => ({...ability, id: `entry-${frame.generation}:${ability.id}`}))}};
}

function askData(state, frame) {
  const ask = frame.asks[0], object = frame.candidate ?? state.objects[frame.objectId];
  const data = {objectId: frame.objectId, player: frame.player, ...ask};
  if (ask.choose !== undefined) data.choose = ask.choose === "creature type" ? [...CREATURE_TYPES] : ask.choose;
  if (ask.copyOf) data.copyOf = state.zones.battlefield.filter(id => id !== frame.objectId
    && matchesSelector({...ask.copyOf, what: "permanent"}, state, id, {controller: frame.player, source: frame.objectId}));
  if (ask.discardInstead) data.discardInstead = cardsIn(state, "hand", frame.player).filter(id => matchesSelector(
    {...ask.discardInstead, what: "card", zone: "hand"}, state, id, {controller: frame.player, source: frame.objectId}));
  if (ask.devour) data.devour = {amount: ask.devour.amount, ids: state.zones.battlefield.filter(id => id !== frame.objectId
    && matchesSelector({...ask.devour.of, what: "permanent", controller: "you"}, state, id, {controller: frame.player, source: frame.objectId}) && !cantBeSacrificed(state, id))};
  return {...data, life: ask.life ?? 0, card: object.card};
}

function finishEntry(state, frame) {
  const view = prospectiveEnteringState(state, frame), object = view.objects[frame.objectId], current = characteristicsOf(view, frame.objectId);
  /* CR 310.9a, 310.12a: choose the protector using the prospective final characteristics, after entry-copy choices.
     The entrant stays in its old zone; its controller never receives an inferred opponent. */
  if (!frame.to && current.types.includes("Battle")) {
    const siege = current.subtypes.includes("Siege"), eligible = state.players.filter(player => !player.lost && (!siege || player.id !== frame.player)).map(player => player.id);
    if (!siege) frame.objectPatch.set.protector = frame.player;
    else if (eligible.length && !eligible.includes(frame.selectedProtector)) {
      frame.battleOptions = eligible; frame.battleChoice = true;
      frame.battleGeneration = (frame.battleGeneration ?? 0) + 1;
      return askRuleOperation(state, frame, {player: frame.player, choice: {
        id: `battle-protector:${frame.objectId}:${frame.battleGeneration}`, title: `${object.card}: choose its protector`, mode: "one", min: 1, max: 1,
        options: eligible.map((playerId, index) => ({index, playerId, label: state.players[playerId].name}))}});
    } else if (eligible.length) frame.objectPatch.set.protector = frame.selectedProtector;
    /* CR 101.3: if no eligible opponent remains, no player can be chosen. Battle SBAs are handled separately. */
  }
  const counters = {...frame.proposal.counters};
  for (const [counter, count] of Object.entries(frame.copyCounters ?? {})) counters[counter] = (counters[counter] ?? 0) + count;
  if (current.types.includes("Planeswalker") && Number.isInteger(object.loyalty)) counters.loyalty = (counters.loyalty ?? 0) + object.loyalty;
  /* CR 310.4b, 614.12: an ability-removal effect can remove this intrinsic entry ability. */
  if (current.types.includes("Battle") && !current.lostAbilities && Number.isInteger(object.defense)) counters.defense = (counters.defense ?? 0) + object.defense;
  if (frame.phyrexianLife > 0 && counters.loyalty > 0 && (object.keywords ?? []).includes("Compleated"))
    counters.loyalty = Math.max(0, counters.loyalty - 2 * frame.phyrexianLife);
  for (const {counter, count} of frame.proposal.chosenCounters ?? []) {
    const n = amountOf(view, withChosen(count, object.chosen), {controller: frame.player, source: frame.objectId, x: frame.x ?? 0});
    if (n > 0) counters[counter] = (counters[counter] ?? 0) + n;
  }
  for (const counter of Object.keys(counters)) if (!(counters[counter] > 0)) delete counters[counter];
  return {status: "done", result: {entering: {tapped: frame.proposal.tapped === true || frame.copyTapped === true, counters, asks: [],
    designations: frame.proposal.designations ?? [], ...(frame.gainsKeywords?.length ? {gainsKeywords: frame.gainsKeywords} : {}),
    ...(frame.to ? {to: frame.to} : {})}, objectPatch: frame.objectPatch}};
}

registerRuleOperation("entering", (state, frame) => {
  const object = frame.candidate ?? state.objects[frame.objectId];
  if (!object || state.players[frame.player]?.lost || state.gameOver) return {status: "done", result: null};
  if (frame.battleChoice && frame.answer) {
    frame.selectedProtector = frame.battleOptions[frame.answer.indices[0]];
    delete frame.answer; delete frame.battleChoice;
  }
  if (!frame.proposal) {
    frame.generation = 0;
    frame.objectPatch = {set: {}, remove: ["chosen"]};
    frame.proposal = {event: "enters", objectId: frame.objectId, player: frame.player, x: frame.x ?? 0,
      escaped: frame.escaped === true, kicked: frame.kicked ?? 0, tapped: false, counters: {}};
    frame.asks = [];
  }
  if (frame.cost) {
    if (frame.cost.waiting) {
      if (frame.cost.kind === "sacrifice-one" && frame.childResult?.sacrificed) frame.cost.sacrificed += 1;
      if (frame.cost.kind === "discard-one" && !frame.childResult?.discarded) frame.to = "graveyard";
      delete frame.childResult; frame.cost.waiting = false;
    }
    if (frame.cost.ids.length) {
      frame.cost.waiting = true;
      return {status: "continue", children: [{kind: frame.cost.kind, id: frame.cost.ids.shift(), player: frame.player}]};
    }
    if (frame.cost.kind === "sacrifice-one") frame.proposal.counters["+1/+1"] = (frame.proposal.counters["+1/+1"] ?? 0) + frame.cost.amount * frame.cost.sacrificed;
    delete frame.cost;
  }
  if (frame.to) return finishEntry(state, frame);
  if (frame.asks.length) {
    const data = askData(state, frame), ask = frame.asks[0];
    if (data.discardInstead && !data.discardInstead.length) { frame.to = "graveyard"; frame.asks.shift(); return {status: "continue"}; }
    if (data.devour && !data.devour.ids.length) { frame.asks.shift(); return {status: "continue"}; }
    if (Array.isArray(data.choose) && !data.choose.length || Array.isArray(data.copyOf) && !data.copyOf.length) {
      frame.asks.shift(); return {status: "continue"};
    }
    const choice = enteringChoice(prospectiveEnteringState(state, frame), data);
    /* CR 614.12, 118.3: with no qualifying card, revealing is impossible. The replacement already made it tapped;
       there is no decision to suspend its move for (Choked Estuary and Murmuring Bosk). */
    if (data.reveal && !choice.options.some(option => option.reveal !== undefined && option.reveal !== null)) {
      frame.asks.shift(); return {status: "continue"};
    }
    if (!frame.answer) {
      frame.options = choice.options;
      return askRuleOperation(state, frame, {player: frame.player, choice});
    }
    const option = frame.options[frame.answer.indices[0]];
    if (data.devour) {
      frame.cost = {kind: "sacrifice-one", ids: frame.answer.indices.map(index => frame.options[index].cardId), sacrificed: 0, amount: data.devour.amount};
      delete frame.answer; frame.asks.shift(); return {status: "continue"};
    }
    delete frame.answer;
    if (option.discard !== undefined) {
      if (option.discard === null) frame.to = "graveyard";
      else frame.cost = {kind: "discard-one", ids: [option.discard]};
    }
    if (option.chosen !== undefined) frame.objectPatch.set.chosen = option.chosen;
    if (option.copyOf !== undefined && option.copyOf !== null) {
      if (!data.copyOf.includes(option.copyOf)) return {status: "continue"};
      const view = prospectiveEnteringState(state, frame), patch = entryCopyPatch(view, frame.objectId, option.copyOf, ask.copy ?? {});
      if (!patch) return {status: "continue"};
      frame.objectPatch.set = {...frame.objectPatch.set, ...patch.set};
      frame.objectPatch.remove = [...new Set([...frame.objectPatch.remove, ...patch.remove])].filter(key => !(key in frame.objectPatch.set));
      frame.generation += 1;
      frame.copyTapped = ask.copy?.tapped === true;
      frame.copyCounters = {};
      const copiedView = prospectiveEnteringState(state, frame);
      for (const extra of ask.copy?.except?.entersWithCounters ?? []) if (matchesSelector({...(extra.if ?? {}), what: "permanent"}, copiedView,
        frame.objectId, {controller: frame.player, source: frame.objectId})) frame.copyCounters[extra.counter] = (frame.copyCounters[extra.counter] ?? 0) + extra.count;
    }
    if (option.pay) {
      emitRuleEvents(state, runEffect(state, {effect: "loseLife", amount: data.life}, {controller: frame.player, source: frame.objectId}));
      frame.proposal.tapped = ask.wasTapped;
    }
    if (option.reveal !== undefined && option.reveal !== null) {
      emitRuleEvents(state, [{kind: "GameEventCardRevealed", data: {turn: state.turn, phase: state.phase,
        fields: {card: {cardId: option.reveal, name: state.objects[option.reveal].card, owner: frame.player}, player: {playerId: frame.player}}}}]);
      frame.proposal.tapped = ask.wasTapped;
    }
    if (option.riot === "counter") frame.proposal.counters["+1/+1"] = (frame.proposal.counters["+1/+1"] ?? 0) + 1;
    if (option.riot === "haste") (frame.gainsKeywords ??= []).push("Haste");
    if (option.readAhead) { frame.proposal.counters.lore = option.readAhead; frame.objectPatch.set.readAhead = option.readAhead; }
    frame.asks.shift();
    return {status: "continue"};
  }
  const view = prospectiveEnteringState(state, frame), proposal = proposalIn(view, frame);
  let candidates = ruleReplacementCandidates(view, proposal);
  /* The compiler may split one printed replacement into its choice and its choice-dependent counter part (Banner
     of Kinship). Those parts are one replacement, not two effects for the player to order. Distinct replacements,
     including repeated identical keywords, retain their own candidates and player order decision. */
  const grouped = new Set();
  candidates = candidates.map(candidate => {
    if (candidate.ability.change?.choose === undefined || !candidate.ability.text) return candidate;
    const parts = candidates.filter(part => part !== candidate && part.holderId === candidate.holderId
      && part.ability.text === candidate.ability.text && namesChosen(part.ability.change?.entersWithCounters?.count));
    for (const part of parts) grouped.add(part.key);
    return {...candidate, members: [candidate, ...parts]};
  }).filter(candidate => !grouped.has(candidate.key));
  /* Copy replacement effects precede every ordinary entry replacement (CR 616.1c). */
  const copies = candidates.filter(candidate => candidate.ability.change?.copyOf);
  if (copies.length) candidates = copies;
  if (!candidates.length) return finishEntry(state, frame);
  let selected = candidates[0];
  if (frame.answer) {
    selected = candidates.find(candidate => candidate.key === frame.candidates[frame.answer.indices[0]]);
    delete frame.answer;
    if (!selected) return {status: "continue"};
  } else if (candidates.length > 1) {
    if (!frame.answer) {
      frame.candidates = candidates.map(candidate => candidate.key);
      return askRuleOperation(state, frame, {player: frame.player, choice: {id: `entry-order:${frame.objectId}:${frame.proposal.appliedBy?.length ?? 0}`,
        title: `${object.card}: choose the next entry replacement`, mode: "one", min: 1, max: 1,
        options: candidates.map((candidate, index) => ({index, label: candidate.label}))}});
    }
  }
  const wasTapped = proposal.tapped;
  frame.proposal = proposal;
  for (const member of selected.members ?? [selected]) frame.proposal = applyRuleReplacement(view, frame.proposal, member.key);
  frame.asks.push(...(frame.proposal.asks ?? []).map(ask => ({...ask, wasTapped})));
  delete frame.proposal.asks;
  return {status: "continue"};
});
