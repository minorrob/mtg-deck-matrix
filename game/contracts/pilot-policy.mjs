/** Difficulty changes effort and choice quality, never rules or access to hidden information.
 * These versioned budgets are for the API pilot; the C0 Forge-native driver is explicitly uncertified.
 */
const PRESETS = [
  {level:1,label:'Learner',candidateLimit:3,rolloutLimit:0,depth:1,opponentAttention:0,threatLimit:0,modelCallBudget:60},
  {level:2,label:'Casual',candidateLimit:5,rolloutLimit:16,depth:1,opponentAttention:.2,threatLimit:2,modelCallBudget:120},
  {level:3,label:'Focused',candidateLimit:8,rolloutLimit:64,depth:2,opponentAttention:.55,threatLimit:5,modelCallBudget:240},
  {level:4,label:'Advanced',candidateLimit:12,rolloutLimit:128,depth:3,opponentAttention:.8,threatLimit:8,modelCallBudget:400},
  {level:5,label:'Expert',candidateLimit:20,rolloutLimit:256,depth:4,opponentAttention:1,threatLimit:12,modelCallBudget:640}
].map(Object.freeze);
export const DIFFICULTIES=Object.freeze(PRESETS);
export function pilotPolicy(level=3) {
  if(!Number.isSafeInteger(level)||level<1||level>5) throw new Error('AI difficulty must be an integer from 1 to 5');
  return Object.freeze({schema:'CommanderPilotPolicy@1',...PRESETS[level-1],
    observation:'seat-filtered',replan:'after-each-draw-and-relevant-state-change',
    objective:'survival-then-win-probability-and-deck-strategy',budgetOverflow:'bounded-local-choice',
    implementation:'api-pilot@1'});
}

/** Invalidate a plan on each individual draw, without allowing a new action during resolution.
 * Providers evaluate only an offered engine decision. In-flight answers become stale on invalidation.
 */
export class PilotPlanningState {
  #seats=new Map();
  constructor(seatLevels) {
    for(const {seatId,difficulty} of seatLevels) {
      if(this.#seats.has(seatId)) throw new Error('Duplicate AI seat');
      this.#seats.set(seatId,{policy:pilotPolicy(difficulty),generation:0,reasons:new Set(['game-start'])});
    }
  }
  invalidate(seatIds,reason) {
    if(!reason) throw new Error('Replan requires a reason');
    for(const id of new Set(seatIds)) {
      const s=this.#seats.get(id); if(!s) continue;
      s.generation++;s.reasons.add(reason);
    }
  }
  beginDecision({seatId,decisionId,stateVersion,options}) {
    const s=this.#seats.get(seatId);
    if(!s||!decisionId||!Number.isSafeInteger(stateVersion)||!Array.isArray(options)||!options.length) throw new Error('An offered engine decision is required');
    return Object.freeze({seatId,decisionId,stateVersion,generation:s.generation,policy:s.policy,
      reasons:Object.freeze([...s.reasons]),optionIds:Object.freeze(options.map(o=>o.optionId))});
  }
  accepts(ticket,answer,currentStateVersion) {
    const s=this.#seats.get(ticket.seatId);
    return !!s && s.generation===ticket.generation && ticket.stateVersion===currentStateVersion &&
      answer?.decisionId===ticket.decisionId && answer?.stateVersion===ticket.stateVersion && ticket.optionIds.includes(answer?.optionId);
  }
}
