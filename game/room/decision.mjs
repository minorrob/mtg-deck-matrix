/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* Additive desk facts in CrankRoomView@1. The original choice is kept private to its answering seat, as before.
   This describes its existing options and never introduces a Cancel, a target, or a shortcut past a mandatory choice. */
import {characteristicsOf, deriving} from "../engine/rules/layers.mjs";
import {modalScript} from "../engine/script/bind.mjs";
import {effectForTarget, targetFacts, targetGroups} from "../engine/script/decision.mjs";

function scriptFor(state, action) {
  const object = state.objects[action?.objectId];
  if (!object) return null;
  const script = action.kind === "cast" ? (action.adventure ? object.adventure?.spell : object.spell)
    : (characteristicsOf(state, action.objectId).abilities ?? []).find(a => a.id === action.abilityId);
  return script?.modal && Array.isArray(action.modes) ? {...script, ...modalScript(script.modal, action.modes)} : script;
}

export function describeDecision(state, choice, actions = null) {
  if (!choice) return choice;
  return deriving(state, () => description(state, choice, actions));
}
function description(state, choice, actions) {
  const awaiting = state.awaiting;
  const trigger = awaiting?.stackId !== undefined ? state.stack.find(e => e.stackId === awaiting.stackId) : null;
  const base = awaiting?.action ? scriptFor(state, awaiting.action) : trigger?.script;
  const may = awaiting?.optional === true || (awaiting?.effect === "modal" && awaiting.choose === 1 && awaiting.modes.some(m => !(m.effects ?? []).length));
  return {...choice, ...(may ? {optional: true} : {}), options: (choice.options ?? []).map((option, index) => {
    const action = actions?.[index];
    const script = action ? scriptFor(state, action) : trigger?.script?.modal && Array.isArray(option.modes)
      ? {...trigger.script, ...modalScript(trigger.script.modal, option.modes)} : base;
    const effects = awaiting?.effect === "modal" ? awaiting.modes[option.index]?.effects ?? []
      : script?.effects ?? (awaiting?.kind === "effect-choice" ? [{...awaiting, effect: awaiting.effect}] : []);
    const targets = action?.targets ?? option.targets;
    const offset = awaiting?.kind === "choose-targets" ? awaiting.index ?? 0 : 0;
    const groups = targetGroups(state, effects, targets).map((g, i) => offset ? {
      ...g, index: i + offset, effect: effectForTarget(effects, i + offset) ?? g.effect,
      targets: g.targets.map(t => ({...t, ...targetFacts(state, t, effectForTarget(effects, i + offset))}))} : g);
    const flat = groups.flatMap(g => g.targets);
    const aimed = flat.length === 1 ? targetFacts(state, flat[0], flat[0].effect) : {};
    const direct = option.playerId !== undefined ? {kind: "player", id: option.playerId}
      : option.cardId !== undefined && state.objects[option.cardId] ? {kind: "object", id: option.cardId} : null;
    const effect = effectForTarget(effects);
    const decline = may && awaiting?.effect === "modal" && !(awaiting.modes[option.index]?.effects ?? []).length;
    return {...option, ...targetFacts(state, direct), ...(effect ? {effect} : {}), ...aimed,
      ...(groups.length ? {targetGroups: groups} : {}), ...(may ? {optional: true} : {}), ...(decline ? {decline: true} : {})};
  })};
}
