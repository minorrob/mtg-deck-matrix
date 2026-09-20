import {buildPilotCandidates} from './ai-pilot.mjs';

/* THE HOST'S WAY OUT OF A STUCK STEP.
 *
 * Between "Yield through this turn" and ending the match there was nothing. A table parked on a
 * decision nobody could reach -- a seat whose browser had wandered off, a prompt the page never
 * drew, an AI that stopped answering -- left ending the game as the only move, which is to say it
 * left no move at all, because ending the game is what the table was trying to avoid.
 *
 * This does not invent an action. It asks the same enumerator the AI pilots use for the legal
 * choices Forge is currently offering that seat, and takes one. Forge validates it exactly as it
 * validates a click, so a forced action can never be an illegal one: the worst case is that the
 * engine rejects it and the table is no worse off than before.
 *
 * It prefers an automatic candidate -- the required draw, the acknowledgement -- because those are
 * the decisions with only one lawful answer and forcing them changes nothing about the game. Only
 * when there is no such answer does it take the first legal choice, and the caller is told which
 * happened so the journal records a real choice as a real choice.
 */
export function chooseForcedAction(view, seatId, difficulty = 1) {
  if (!view || view.state?.gameOver) return null;
  const candidates = buildPilotCandidates(view, seatId, difficulty);
  if (!candidates.length) return null;
  const automatic = candidates.find((c) => c.automatic);
  const chosen = automatic || candidates[0];
  return {
    label: chosen.label,
    automatic: !!automatic,
    choiceId: view.ui?.choice?.id ?? null,
    alternatives: candidates.length,
    request: {...chosen.action, revision: view.revision},
  };
}
