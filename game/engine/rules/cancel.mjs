/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import {hashState} from "../journal.mjs";

const SCHEMA = "PrecommitProposal@1";
export const proposalChoice = (s) => ["choose-cost", "choose-targets"].includes(s.awaiting?.kind)
  && s.awaiting.stackId === undefined && Boolean(s.awaiting.action);
/* These are the only fields an uncommitted proposal may change. No saved game snapshot or rollback of facts. */
const facts = (s) => {const {awaiting, passes, priorityPlayer, ...rest} = s; return hashState(rest);};
export function beforeProposal(state, player, action) {
  return ["cast", "activate", "activate-mana"].includes(action?.kind) && !state.awaiting && !state.resolving && !state.ruleOperation
    ? {schema: SCHEMA, player, priorityPlayer: state.priorityPlayer, passes: state.passes, hash: facts(state)} : null;
}
export function retainProposal(state, proposal, events) {
  if (proposal?.schema === SCHEMA && events.length === 0 && proposalChoice(state) && !state.resolving && !state.ruleOperation
    && state.awaiting.player === proposal.player && facts(state) === proposal.hash) state.awaiting.precommit = proposal;
  else if (state.awaiting?.precommit) delete state.awaiting.precommit;
  return events;
}
const reversible = (state) => {
  const p = state.awaiting?.precommit;
  return p?.schema === SCHEMA && proposalChoice(state) && !state.resolving && !state.ruleOperation
    && p.player === state.awaiting.player && p.priorityPlayer === p.player && !state.players[p.player]?.lost && facts(state) === p.hash;
};
export function cancellationFor(state, choice) {
  const base = {schema: "CrankDecisionCancel@1"};
  if (reversible(state)) return {...base, allowed: true, kind: "abandon-action", returnsPriority: true};
  if (proposalChoice(state)) return {...base, allowed: false,
    reason: "Invalid selection. This saved action has no unchanged reversible proposal. Complete its choice; it cannot be cancelled."};
  if (state.awaiting?.effect === "copySpell" && choice?.maySkip === true)
    return {...base, allowed: true, kind: "keep-targets", returnsPriority: false};
  if (["one", "many", "boolean", "index", "draw", "ack"].includes(choice?.mode) && choice.min === 0)
    return {...base, allowed: true, kind: "choose-none", returnsPriority: false};
  return {...base, allowed: false,
    reason: "Invalid selection. Complete this required choice to finish the current effect or game step; it cannot be cancelled."};
}
export function abandonProposal(state) {
  if (!reversible(state)) throw new Error("This action changed or has no reversible proposal; it cannot be cancelled. Complete its required choice.");
  const p = state.awaiting.precommit;
  state.awaiting = null; state.passes = p.passes; state.priorityPlayer = p.priorityPlayer;
  return [];
}
