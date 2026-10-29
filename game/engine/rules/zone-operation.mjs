/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import {registerRuleOperation, askRuleOperation, emitRuleEvents} from "./operations.mjs";
import {ruleReplacementCandidates, applyRuleReplacement} from "./replacement.mjs";
import {moveOne} from "../script/effects/zones.mjs";
import {controllerOf, lastKnown} from "./layers.mjs";
import {cantBeSacrificed} from "./statics.mjs";
import {recordDiscard, COPY_KEYS} from "../state/index.mjs";
import {validateSbaPreparation, savePreparedSbaMove} from "./sba-move-results.mjs";

function paymentEligible(state, id, kind, player) {
  const object = state.objects[id], zone = kind === "sacrifice-one" ? "battlefield" : "hand";
  return object?.zone === zone && !state.players[player]?.lost && (kind === "sacrifice-one"
    ? controllerOf(state, id) === player && !cantBeSacrificed(state, id)
    : state.zones.hand[player]?.includes(id));
}

/* CR 616.1f: finish each replacement choice before performing the move. The saved proposal and stage survive reload;
   every option is rechecked against live state after a concession changes the board. */
registerRuleOperation("move-one", (state, frame) => {
  if (frame.stage === "after-redirect") return {status: "done", result: frame.childResult};
  const object = state.objects[frame.id], options = frame.options ?? {};
  if (!object || (object.token === true && object.zone !== "battlefield")) return {status: "done", result: {moved: null, zoneEventIndex: null}};
  if (frame.payment && !paymentEligible(state, frame.id, frame.payment.kind, frame.payment.player))
    return {status: "done", result: {moved: null, zoneEventIndex: null}};
  if (frame.prepareOnly) validateSbaPreparation(state, frame);
  if (!frame.stage) {
    frame.proposal = {event: "zone-change", objectId: frame.id, from: object.zone, to: frame.to, player: object.controller, applied: []};
    if (object.exileIfLeaves === true) frame.proposal.to = "exile";
    frame.stage = "replacements";
  }
  if (frame.stage === "commander") {
    if (!frame.answer) return askRuleOperation(state, frame, {player: object.owner, choice: {
      id: `commander-move:${frame.id}`, title: `Put ${object.card ?? "your commander"} into the command zone instead?`, mode: "boolean", min: 1, max: 1,
      options: [{index: 0, label: "Put it into the command zone"}, {index: 1, label: `Put it into your ${frame.proposal.to}`}],
    }});
    if (frame.answer.indices[0] === 0) frame.proposal.to = "command";
    frame.commanderDeclined = true; delete frame.answer; frame.stage = "replacements";
  }
  if (frame.stage === "replacements") {
    const candidates = ruleReplacementCandidates(state, frame.proposal);
    const commander = object.commander === true && ["hand", "library"].includes(frame.proposal.to) && !frame.commanderDeclined;
    const keys = [...candidates.map(c => c.key), ...(commander ? ["commander-zone"] : [])];
    let chosen = frame.answer ? frame.keys[frame.answer.indices[0]] : null;
    delete frame.answer;
    if (chosen && !keys.includes(chosen)) chosen = null;
    if (!chosen && keys.length > 1) {
      frame.keys = keys;
      return askRuleOperation(state, frame, {player: object.zone === "battlefield" ? controllerOf(state, frame.id) : object.owner, choice: {
        id: `zone-replacements:${frame.id}:${(frame.proposal.appliedBy ?? []).length}`, title: `${object.card ?? "That card"}: which replacement applies first?`, mode: "one", min: 1, max: 1,
        options: [...candidates.map((candidate, index) => ({index, label: candidate.label, ...(candidate.holderId !== null ? {cardId: candidate.holderId} : {})})),
          ...(commander ? [{index: candidates.length, label: "The owner may put their commander into the command zone"}] : [])],
      }});
    }
    chosen ??= keys[0];
    if (chosen === "commander-zone") { frame.stage = "commander"; return {status: "continue"}; }
    if (chosen) {
      const before = frame.proposal.to;
      frame.proposal = applyRuleReplacement(state, frame.proposal, chosen);
      if (before !== frame.proposal.to) frame.commanderDeclined = false;
      return {status: "continue"};
    }
    frame.stage = "enter";
  }
  if (frame.stage === "enter") {
    if (frame.proposal.to === "battlefield") {
      const player = options.controller ?? object.owner;
      if (state.players[player]?.lost) return {status: "done", result: {moved: null, zoneEventIndex: null}}; // CR 800.4b.
      const down = options.faceDown === true, face = options.transformed === true ? object.mdfc?.back ?? object : object;
      frame.stage = "after-enter";
      return {status: "continue", children: [{kind: "entering", objectId: frame.id, player,
        additionalCounters: options.counters ?? {},
        types: down ? ["Creature"] : face.types, abilities: down ? [] : face.abilities,
        entryFace: {set: Object.fromEntries(COPY_KEYS.filter(key => face[key] !== undefined).map(key => [key, face[key]])),
          remove: COPY_KEYS.filter(key => face[key] === undefined)}, faceDown: down}]};
    }
    frame.stage = "move";
  }
  if (frame.stage === "after-enter") {
    frame.preparedCounterResult = frame.childResult?.counterResult ?? null;
    frame.entryPatch = frame.childResult?.objectPatch ?? null;
    frame.preparedEntering = frame.childResult?.entering ?? frame.childResult;
    delete frame.childResult; frame.stage = "move";
    if (frame.preparedEntering?.to && frame.preparedEntering.to !== "battlefield") {
      frame.stage = "after-redirect";
      return {status: "continue", children: [{kind: "move-one", id: frame.id, to: frame.preparedEntering.to, options, payment: frame.payment,
        ...(frame.prepareOnly ? {prepareOnly: true, cohortId: frame.cohortId} : {})}]};
    }
  }
  const events = [];
  if (frame.prepareOnly) {
    const preparedMove = savePreparedSbaMove(state, frame, {proposal: frame.proposal,
      entering: frame.preparedEntering ?? null, counterResult: frame.preparedCounterResult ?? null,
      entryPatch: frame.entryPatch ?? null, options: frame.options ?? {}});
    return {status: "done", result: {preparedMove}};
  }
  const moved = moveOne(state, frame.id, frame.to, events, {...options, preparedProposal: frame.proposal,
    preparedEntering: frame.preparedEntering ?? null, preparedCounterResult: frame.preparedCounterResult ?? null, entryPatch: frame.entryPatch ?? null});
  const index = events.findIndex(e => e.kind === "GameEventCardChangeZone" && e.data.fields.card?.cardId === frame.id);
  const zoneEventIndex = index < 0 ? null : state.ruleOperation.events.length + index;
  emitRuleEvents(state, events);
  return {status: "done", result: {moved, zoneEventIndex, proposal: frame.proposal}};
});

/* CR 701.21a, 701.9a: these actions retain their identity when a replacement changes the destination. The child records
   its exact zone-event index so follow-up events cannot accidentally be marked as the sacrifice or discard. */
for (const [kind, field] of [["sacrifice-one", "sacrificed"], ["discard-one", "discarded"]]) {
  registerRuleOperation(kind, (state, frame) => {
    if (!frame.stage) {
      const object = state.objects[frame.id];
      const player = frame.player ?? (kind === "sacrifice-one" && object ? controllerOf(state, frame.id) : object?.owner);
      const eligible = paymentEligible(state, frame.id, kind, player);
      if (!eligible) return {status: "done", result: {moved: null, [field]: false}};
      frame.player = player; frame.nontoken = object.token !== true; frame.stage = "after-move";
      return {status: "continue", children: [{kind: "move-one", id: frame.id, to: "graveyard", options: {owner: object.owner}, payment: {kind, player}}]};
    }
    const child = frame.childResult, moved = child?.moved ?? null;
    if (moved === null) return {status: "done", result: {moved: null, [field]: false}};
    const fields = state.ruleOperation.events[child.zoneEventIndex].data.fields;
    fields[field] = true;
    if (kind === "sacrifice-one") {
      fields.sacrificer = frame.player;
      if (frame.nontoken) state.players[frame.player].sacrificedNontokenThisTurn = (state.players[frame.player].sacrificedNontokenThisTurn ?? 0) + 1;
    } else recordDiscard(state, frame.player);
    return {status: "done", result: {moved, [field]: true}};
  });
}

/* Keep this bounded to the existing literal-target sacrifice instruction. Other moveZone modifiers retain their
   established caller until that caller has its own saved stages and behavioral proof. */
export function zoneEffectFrame(effect, context) {
  if (effect?.effect !== "moveZone" || effect.sacrifice !== true || !Array.isArray(effect.targets)
    || Object.keys(effect).some(key => !["effect", "targets", "sacrifice", "remember"].includes(key))) return null;
  return {kind: "sacrifice-effect", ids: effect.targets, remember: effect.remember === true, context};
}
registerRuleOperation("sacrifice-effect", (state, frame) => {
  if (!frame.stage) {
    frame.payments = frame.ids.filter(id => state.objects[id]?.zone === "battlefield").map(id => ({id, player: controllerOf(state, id)}));
    frame.remembered = []; frame.movedWas = []; frame.rememberedControllers = {}; frame.cursor = 0; frame.stage = "next";
  }
  if (frame.stage === "after-child") {
    const moved = frame.childResult?.moved;
    if (moved !== null && moved !== undefined) {
      frame.remembered.push(moved); frame.rememberedControllers[moved] = frame.current.player;
      if (frame.was && state.objects[moved]?.zone === "graveyard") frame.movedWas.push(frame.was);
    }
    delete frame.childResult; frame.stage = "next";
  }
  if (frame.cursor >= frame.payments.length) return {status: "done", result: {context: frame.remember ? {
    remembered: frame.remembered, movedWas: frame.movedWas, rememberedControllers: frame.rememberedControllers,
  } : {}}};
  frame.current = frame.payments[frame.cursor++];
  frame.was = frame.remember && state.objects[frame.current.id] ? lastKnown(state, frame.current.id) : null;
  frame.stage = "after-child";
  return {status: "continue", children: [{kind: "sacrifice-one", ...frame.current}]};
});
