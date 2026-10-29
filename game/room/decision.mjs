/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* Additive desk facts in CrankRoomView@1. The choice stays private to its answering seat. Cancellation describes
   a proven reversible proposal or a legal empty choice; mandatory committed effects still require an answer. */
import {deriving} from "../engine/rules/layers.mjs";
import {offerScript} from "../engine/rules/actions.mjs";
import {modalScript} from "../engine/script/bind.mjs";
import {effectForTarget, targetFacts, targetGroups} from "../engine/script/decision.mjs";
import {cancellationFor} from "../engine/rules/cancel.mjs";
import {castEntryFor} from "./cast-stages.mjs";

function scriptFor(state, action) {
  return offerScript(state, action);
}

/* Source identity is a reference into the exact view already being sent. Never recover it from a title, a last-known
   snapshot, or an ability stack entry whose old card id may now belong to a hidden zone. */
function visibleSource(state, awaiting, trigger, projected) {
  const id = awaiting?.action?.objectId ?? trigger?.cardId ?? (awaiting?.resolution === true ? state.resolving?.context?.source : null);
  const object = state.objects[id];
  if (!object || object.faceDown === true || !projected) return null;
  const named = card => card.cardId === id && typeof card.name === "string" && card.name.length > 0 && card.faceDown !== true;
  const visible = projected.players.some(player => Object.values(player.zones).some(zone => zone.cards.some(named)))
    || (object.zone === "stack" && projected.stack.some(entry => entry.kind === "spell" && named(entry)));
  return visible ? id : null;
}

export function describeDecision(state, choice, actions = null, projected = null) {
  if (!choice) return choice;
  return deriving(state, () => description(state, choice, actions, projected));
}
function description(state, choice, actions, projected) {
  const awaiting = state.awaiting;
  const trigger = awaiting?.stackId !== undefined ? state.stack.find(e => e.stackId === awaiting.stackId) : null;
  const sourceId = visibleSource(state, awaiting, trigger, projected);
  const base = awaiting?.action ? scriptFor(state, awaiting.action) : trigger?.script;
  const may = awaiting?.optional === true || (awaiting?.effect === "modal" && awaiting.choose === 1 && awaiting.modes.some(m => !(m.effects ?? []).length));
  const paymentStage = awaiting?.action?.castStage;
  return {...choice, ...(paymentStage ? {stage: "payment", castStage: {...paymentStage, canBack: false}} : {}), ...(!actions && awaiting ? {cancellation: cancellationFor(state, choice)} : {}), ...(sourceId !== null ? {sourceId} : {}), ...(may ? {optional: true} : {}), options: (choice.options ?? []).map((option, index) => {
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
    const preparedFrom = action?.kind === "cast" ? state.objects[action.objectId]?.prepareOf : undefined;
    const decline = may && awaiting?.effect === "modal" && !(awaiting.modes[option.index]?.effects ?? []).length;
    return {...option, ...(action?.kind === "cast" && script?.modal ? {castStages: castEntryFor(action)} : {}), ...targetFacts(state, direct), ...(effect ? {effect} : {}), ...aimed,
      ...(groups.length ? {targetGroups: groups} : {}), ...(preparedFrom !== undefined ? {preparedFrom} : {}),
      ...(may ? {optional: true} : {}), ...(decline ? {decline: true} : {})};
  })};
}
