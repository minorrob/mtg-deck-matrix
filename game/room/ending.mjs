/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* HOW A GAME ENDED, AS DATA (`result.ending`; Linear ROB-166, the Requests table's row 10, asked by Codex · Play).
 *
 * `result` says it in words: the engine's ("last player standing"), "ended early", or the room's NO_PERSON_REASON. Read
 * from the words, a person knocked out by three AI seats and a person who walked away were the same game: "every person
 * had left the game, so it ended there", and the board titled it "The game was ended early". `ending` says the same end
 * as data, so the banner can say who lost and why and the person's record can be a loss. `winner`, `reason` and `endedBy`
 * stay as they were; `ending` is added beside them. Everything in it is public -- a player's loss and its reason are on
 * every seat's view (projection.mjs, `health`), and so are the departures -- so it is the same for every seat.
 *
 *   kind     how the game came to its end:
 *              "won"         a player won by the rules: the last player standing (CR 104.2a) or by an effect (CR 104.2b)
 *              "draw"        every player still in it lost at once, so nobody won (CR 104.4a)
 *              "eliminated"  every person was out and the last of them lost by the rules; the AI seats left did not play on
 *                            (room.mjs, `endWhenNoPerson`)
 *              "conceded"    every person was out and the last of them conceded: left the game (the table's Concede)
 *              "timed-out"   every person was out and the last of them ran out of time (table.mjs, AWAY_LIMIT)
 *              "ended"       a person ended the game for everyone (room.mjs, `end`)
 *   seatId   the seat it turned on: the winner; the last person out; the person who ended it. Null for a draw.
 *   reason   for "eliminated", "conceded" and "timed-out", that person's loss reason as the engine knows it; else null.
 *   seats    every seat, in seat order, as `{seatId, outcome, reason}`:
 *              outcome  "won"; "lost" (by the rules); "conceded"; "timed-out"; or "playing", still in it when it ended
 *              reason   the engine's loss reason for a seat that is out (sba.mjs `lossReason`, and "effect" from an effect
 *                       that says they lose, script/effects/resources.mjs): "life", "poison", "commander-damage",
 *                       "empty-library", "effect" or "conceded" -- "conceded" too for a seat that timed out, which the
 *                       engine concedes (CR 104.3a). Null for a seat that won or was still playing.
 *
 * A seat that conceded or ran out of time is said so from the room's departures; one that had lost by the rules first (and
 * left the table afterward) lost by the rules, as the engine has it. The last person out is read from `outs`, the seats
 * in the order they went out, which the room keeps from the engine's own "lost" events; a room ended before it kept them
 * counts the last person in seat order.
 */

/** The ways a game ends, and a seat's outcome in it: every word `ending` uses. */
export const ENDING_KINDS = Object.freeze(["won", "draw", "eliminated", "conceded", "timed-out", "ended"]);
export const SEAT_OUTCOMES = Object.freeze(["won", "lost", "conceded", "timed-out", "playing"]);

/* A seat's own end: won, out by the rules, out by leaving (the room's departures, "conceded" or "timed-out"), or still in. */
function seatEnd(seat, index, {over, players, departures}) {
  const player = players[index] || {}, gone = departures[seat.seatId];
  if (over.winner === index) return {seatId: seat.seatId, outcome: "won", reason: null};
  if (gone && (!player.lost || player.lostTo === "conceded")) return {seatId: seat.seatId, outcome: gone, reason: "conceded"};
  if (player.lost) return {seatId: seat.seatId, outcome: "lost", reason: player.lostTo ?? null};
  return {seatId: seat.seatId, outcome: "playing", reason: null};
}

/**
 * `ending` for a finished game. `over` is the room's `{winner, reason}` (the winner a seat index, or null); `ended` the room's
 * own end, or null (`{by, why}`: why "no-person" when every person was out); `seats` the room's seats (`seatId`, `pilot`);
 * `players` the engine's players (`lost`, `lostTo`); `departures` the room's, by seat id; `outs` the seat ids in the order
 * they went out (empty for a room that did not keep them).
 */
export function endingOf({over, ended = null, seats, players, departures = {}, outs = []}) {
  const each = seats.map((seat, index) => seatEnd(seat, index, {over, players, departures}));
  if (ended && ended.why !== "no-person") return {kind: "ended", seatId: ended.by ?? null, reason: null, seats: each};
  if (ended) {
    const people = new Set(seats.filter((s) => s.pilot === "human").map((s) => s.seatId));
    const last = [...outs].reverse().find((id) => people.has(id)) ?? [...people].at(-1) ?? null;
    const lastEnd = each.find((s) => s.seatId === last);
    /* Out by the rules is "eliminated"; out by leaving says which ("conceded", "timed-out"). */
    const kind = lastEnd && lastEnd.outcome !== "lost" ? lastEnd.outcome : "eliminated";
    return {kind, seatId: last, reason: lastEnd ? lastEnd.reason : null, seats: each};
  }
  if (over.winner === null || over.winner === undefined) return {kind: "draw", seatId: null, reason: null, seats: each};
  return {kind: "won", seatId: seats[over.winner].seatId, reason: null, seats: each};
}
