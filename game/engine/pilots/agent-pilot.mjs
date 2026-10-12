/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE LLM SEAT'S PILOT (AI-2, docs/plan-to-done-2026-09-30.md: "the LLM seat on L0 with L1 as its hint and its fallback").
 *
 * Rob, 2026-10-10: "Use Haiku 5.5. 0.25 per game is good", and "I do want to deliver on L0 as part of the LLM AI seat
 * capability". The seat is L1 at Normal (scored-pilot.mjs) for every decision but its close calls, where it asks to
 * CONSULT: the room then offers that one decision to the seat as it would to a person (game/room/room.mjs), and the
 * table's Durable Object asks the model to choose among L0's legal options, with L1's scores as the hint, and answers
 * through the room like a person. So the model's answer is on the tape and a replay never asks it; when the model
 * cannot answer -- the game's cap reached, a failure, an option that was not offered -- the room answers with L1
 * (`houseAnswer`), and that is on the tape too.
 *
 * A CLOSE CALL, read off the view alone, the same every time: the spells it would cast or an attack, when L1's two best
 * plans score within `CLOSE` of each other. Everything else -- a land, a pass with nothing to weigh, blocks, the opening
 * hand, every question an effect asks -- is L1's at once, so the model is asked rarely and a person waits little.
 */
import {scoredPilot} from "./scored-pilot.mjs";

export const AGENT_PILOT_ID = "agent";
/* How close two plans must score for the model to be asked: a little under one card's worth (scored-pilot.mjs, WEIGHTS). */
export const CLOSE = 1;

/** @param {{seat: number, cards?: Function, deck?: string[], seed?: string, close?: number}} options */
export function agentPilot({seat, cards = () => null, deck = [], seed = "", close = CLOSE} = {}) {
  const l1 = scoredPilot({seat, cards, deck, setting: "normal", seed});
  return {
    ...l1,
    id: AGENT_PILOT_ID,
    /** True when this decision is a close call, which the room then offers the seat to answer through its model. */
    consult(view, offer) {
      if (offer.actions && !(view.turnPlayerId === seat && ["MAIN1", "MAIN2"].includes(view.phase) && view.stackSize === 0)) return false;
      return l1.margin(view, offer) < close;
    },
  };
}
