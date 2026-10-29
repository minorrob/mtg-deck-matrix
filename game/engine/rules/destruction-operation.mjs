/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import {registerRuleOperation, askRuleOperation, emitRuleEvents} from "./operations.mjs";
import {destructionReplacements, destructionAsks, destructionChoice, event} from "../script/effects/zones.mjs";
import "./zone-operation.mjs";
import {regenerated} from "./replacement.mjs";
import {keywordsOf, lastKnown} from "./layers.mjs";
import {eventCard} from "../state/index.mjs";
import {selectMatching} from "../script/filter.mjs";

export const destructionFrame = (params, context) => ({kind: "destroy-effect", params, context});
registerRuleOperation("destroy-effect", (state, frame) => {
  const {params, context} = frame;
  if (!frame.stage) {
    const spared = params.except === "remembered" ? new Set(context.remembered ?? []) : null;
    const named = params.effect === "destroy" ? params.targets ?? []
      : [...selectMatching(state, params.selector ?? {what: "permanent"}, context)].filter(id => !spared?.has(id));
    // CR 701.8, 702.12b: determine simultaneous eligibility before removing a lord granting indestructible.
    const eligible = named.filter(id => state.objects[id]?.zone === "battlefield" && !keywordsOf(state, id).includes("Indestructible"));
    const replaced = id => destructionReplacements(state, id, {noRegenerate: params.noRegenerate === true, byEffect: true}).length > 0;
    frame.ids = [...eligible.filter(replaced), ...eligible.filter(id => !replaced(id))];
    frame.answers = {...(params.destructionAnswers ?? {})};
    frame.remembered = []; frame.movedWas = []; frame.cursor = 0; frame.stage = "choose";
  }
  if (frame.stage === "choose") {
    if (frame.answer) {
      frame.answers[frame.asking] = frame.options[frame.answer.indices[0]];
      delete frame.answer; delete frame.options; delete frame.asking;
    }
    const ask = destructionAsks(state, frame.ids, frame.answers, {noRegenerate: params.noRegenerate === true, byEffect: true})[0];
    if (ask) {
      frame.asking = ask.objectId; frame.options = ask.options;
      return askRuleOperation(state, frame, {player: ask.player, choice: destructionChoice(state, ask)});
    }
    frame.stage = "next";
  }
  if (frame.stage === "after-child") {
    const child = frame.childResult;
    // Preserve the effects' current remember contracts: targeted destroy counts deaths; destroyAll counts moves.
    if (child?.moved !== null && child?.moved !== undefined && (params.effect === "destroyAll" || state.objects[child.moved]?.zone === "graveyard")) {
      frame.remembered.push(child.moved);
      if (child.was) frame.movedWas.push(child.was);
    }
    delete frame.childResult; frame.stage = "next";
  }
  if (frame.cursor >= frame.ids.length) return {status: "done", result: {context: params.remember ? {remembered: frame.remembered, movedWas: frame.movedWas} : {}}};
  const id = frame.ids[frame.cursor++]; frame.stage = "after-child";
  return {status: "continue", children: [{kind: "destroy-one", id, noRegenerate: params.noRegenerate === true,
    chosen: frame.answers[id], byEffect: true, eligible: true, remember: params.remember === true}]};
});

registerRuleOperation("destroy-one", (state, frame) => {
  if (frame.stage === "after-move") return {status: "done", result: {moved: frame.childResult.moved, was: frame.was}};
  const object = state.objects[frame.id];
  if (!object || object.zone !== "battlefield" || frame.stage === "after-aura") return {status: "done", result: {moved: null}};
  if (!frame.eligible && keywordsOf(state, frame.id).includes("Indestructible")) return {status: "done", result: {moved: null}};
  const candidates = destructionReplacements(state, frame.id, {noRegenerate: frame.noRegenerate === true, byEffect: frame.byEffect === true});
  if (frame.answer) { frame.chosen = frame.options[frame.answer.indices[0]]; delete frame.answer; delete frame.options; }
  let chosen = candidates.find(candidate => candidate.key === frame.chosen);
  if (!chosen && candidates.length > 1) {
    frame.options = candidates.map(candidate => candidate.key);
    const ask = destructionAsks(state, [frame.id], {}, {noRegenerate: frame.noRegenerate === true, byEffect: frame.byEffect === true})[0];
    return askRuleOperation(state, frame, {player: ask.player, choice: destructionChoice(state, ask)});
  }
  chosen ??= candidates[0];
  const events = [];
  if (chosen?.key === "regenerate") { regenerated(state, frame.id, events); emitRuleEvents(state, events); return {status: "done", result: {moved: null}}; }
  if (chosen?.key === "shield") {
    const before = object.counters.shield; object.counters.shield = before - 1;
    emitRuleEvents(state, [event("GameEventCardCounters", state, {card: eventCard(state, frame.id), type: "shield", oldValue: before, newValue: before - 1})]);
    return {status: "done", result: {moved: null}};
  }
  if (chosen?.aura !== undefined) {
    // CR 702.89a, 616.1: the replacement creates a nested destruction with its own affected player's choices.
    object.damage = 0; object.deathtouched = false;
    emitRuleEvents(state, [event("GameEventUmbraArmor", state, {card: eventCard(state, frame.id), aura: eventCard(state, chosen.aura)})]);
    frame.stage = "after-aura";
    return {status: "continue", children: [{kind: "destroy-one", id: chosen.aura, byEffect: true}]};
  }
  frame.was = frame.remember ? lastKnown(state, frame.id) : null; frame.stage = "after-move";
  return {status: "continue", children: [{kind: "move-one", id: frame.id, to: "graveyard"}]};
});
