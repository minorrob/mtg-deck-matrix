/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* The dated summary a human files in their existing deck record. The table supplies its clock and the deck source;
   the rules engine supplies the outcome. No hand, library, seed, account address, or decision tape belongs here. */
export function outcomeForSeat(view) {
  const departure = view.departures?.[view.seatId];
  if (departure === "conceded") return {outcome: "loss", finishReason: "conceded"};
  if (departure === "timed-out") return {outcome: "unfinished", finishReason: "ran out of time"};
  if (view.status !== "finished") return null;
  const result = view.result ?? {}, mine = result.ending?.seats?.find(s => s.seatId === view.seatId);
  if (mine?.outcome === "won") return {outcome: "win", finishReason: result.reason ?? ""};
  if (mine?.outcome === "lost") return {outcome: "loss", finishReason: mine.reason ?? "lost"};
  if (result.ending?.kind === "ended" || result.endedBy !== undefined || result.reason === "ended early") return {outcome: "unfinished", finishReason: "ended early"};
  if (result.ending?.kind === "draw") return {outcome: "draw", finishReason: result.reason ?? ""};
  return {outcome: result.winner === view.seatId ? "win" : result.winner ? "loss" : "draw", finishReason: result.reason ?? ""};
}

export function resultRecord({tableId, matchId, view, deck, opponents, now}) {
  const result = outcomeForSeat(view);
  if (!result) return null;
  return {schema: "CrankMagicTableResult@1", id: `game:table:${matchId}:${view.seatId}`, tableId, matchId, seatId: view.seatId,
    source: deck?.source ? {...deck.source} : null, playedAt: new Date(now).toISOString(), ...result,
    finishRank: result.outcome === "win" ? 1 : null, turns: view.state.turn, pod: view.seats.length, seat: view.seat + 1,
    bracket: deck?.bracket ?? null, commanders: [...(deck?.commander ?? [])], opponents,
    ai: view.seats.some(s => s.pilot === "house")};
}
