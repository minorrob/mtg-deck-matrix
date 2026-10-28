/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE VETERAN: HARD, REASONED OVER BY A MODEL (AI-2, docs/plan-to-done-2026-09-30.md; docs/ai-players/PLAN-2026-10-26.html §6).
 *
 * Rob, 2026-10-10: "Use Haiku 5.5. 0.25 per game is good", and "I do want to deliver on L0 as part of the LLM AI seat capability". Rob,
 * 2026-10-26: "I want to create a veteran player, and this will be an AI agent ... powered by the cheapest model we can. You will take
 * the hard player code, and you will infuse that AI-8 model with it. That agent would run it and get the decisions, then reason over
 * the decisions and determine the best target ... it would not have familiarity with the mechanics behind the deterministic logic
 * determining the difficulty of the players they're up against."
 *
 * The seat is HARD (scored-pilot.mjs, setting "hard") for every decision it makes alone, and at the decisions below it asks to CONSULT:
 * the room offers that one decision to the seat as it would to a person (game/room/room.mjs), the table's Durable Object builds a brief
 * from what Hard worked out (`explain`: the table's threats, the urgency of what is on it, the reserve, its top plans as the decision's own
 * option indices) and asks the model to choose among them (cloud/ai.mjs `pilot`, instructed by the Veteran skill file), and answers through the
 * room like a person. So the model's answer is on the tape and a replay never asks it; when the model cannot answer -- the game's cap
 * reached, a failure, an option that was not offered -- the room answers with Hard (`houseAnswer`), and that is on the tape too.
 *
 * WHERE IT ASKS, read off the view alone, the same every time:
 *   every attack it could make, when Hard has more than one plan for it and the best is not a kill;
 *   the spells it would cast in its own main phase, when its two best plans are within `close` of each other, or when one of them is
 *     an answer to something on the table (a removal aim is the model's to weigh against the threat);
 *   its opening hand, when the odds of its third land are within a tenth of the odds it keeps at.
 * Everything else -- a land, a pass with nothing to weigh, blocks, every question an effect asks -- is Hard's at once, so the model is
 * asked rarely and a person waits little.
 */
import {scoredPilot} from "./scored-pilot.mjs";

export const AGENT_PILOT_ID = "agent";
/* How close two plans must score for the model to be asked about a cast: Hard's plans are worth a few points each. */
export const CLOSE = 3;
export const CLOSE_HAND = 0.1;

/** @param {{seat: number, cards?: Function, deck?: string[], seed?: string, close?: number, picks?: boolean, disposition?: object}} options */
export function agentPilot({seat, cards = () => null, deck = [], seed = "", close = CLOSE, picks = false, disposition = null} = {}) {
  const hard = scoredPilot({seat, cards, deck, setting: "hard", seed, picks, disposition});
  return {
    ...hard,
    id: AGENT_PILOT_ID,
    /** True when this decision is one the model is asked about, which the room then offers the seat to answer. */
    consult(view, offer) {
      if (offer.actions) {
        if (!(view.turnPlayerId === seat && ["MAIN1", "MAIN2"].includes(view.phase) && view.stackSize === 0)) return false;
        /* The spells it could cast, a pass beside them not counted as one: a lone spell is no question, an answer always is. */
        const casts = hard.explain(view, offer).alternatives.filter((a) => !/^pass/.test(a.why));
        return (casts.length >= 2 && casts[0].value - casts[1].value < close) || casts.some((a) => /answers a threat/.test(a.why));
      }
      const id = String(offer.choice?.id ?? "");
      /* An attack with more than one plan, unless the best is a kill: a kill is not a question. */
      if (id.startsWith("declare-attackers:")) {const alt = hard.explain(view, offer).alternatives; return alt.length > 1 && !/a kill/.test(alt[0].why);}
      if (id.startsWith("mulligan:")) {
        const ex = hard.explain(view, offer);
        return ex.alternatives.length === 2 && ex.close < CLOSE_HAND;
      }
      return false;
    },
  };
}
