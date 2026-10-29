/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import {registerRuleOperation, askRuleOperation, emitRuleEvents} from "./operations.mjs";
import {ruleReplacementCandidates, applyRuleReplacement} from "./replacement.mjs";
import {moveOne} from "../script/effects/zones.mjs";
import {controllerOf} from "./layers.mjs";

/* CR 616.1f: finish each replacement choice before performing the move. The saved proposal and stage survive reload;
   every option is rechecked against live state after a concession changes the board. */
registerRuleOperation("move-one", (state, frame) => {
  const object = state.objects[frame.id], options = frame.options ?? {};
  if (!object || (object.token === true && object.zone !== "battlefield")) return {status: "done", result: {moved: null, zoneEventIndex: null}};
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
        types: down ? ["Creature"] : face.types, abilities: down ? [] : face.abilities, faceDown: down}]};
    }
    frame.stage = "move";
  }
  if (frame.stage === "after-enter") {
    frame.entryPatch = frame.childResult?.objectPatch ?? null;
    frame.preparedEntering = frame.childResult?.entering ?? frame.childResult;
    delete frame.childResult; frame.stage = "move";
  }
  const events = [];
  const moved = moveOne(state, frame.id, frame.to, events, {...options, preparedProposal: frame.proposal,
    preparedEntering: frame.preparedEntering ?? null, entryPatch: frame.entryPatch ?? null});
  const index = events.findIndex(e => e.kind === "GameEventCardChangeZone" && e.data.fields.card?.cardId === frame.id);
  const zoneEventIndex = index < 0 ? null : state.ruleOperation.events.length + index;
  emitRuleEvents(state, events);
  return {status: "done", result: {moved, zoneEventIndex, proposal: frame.proposal}};
});
