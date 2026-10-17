# Deals between the chairs: the beginnings (Rob, 2026-10-12)

Rob: *"I really like the idea of informal deals between the chairs. It would be good if there was an alert if one
was satisfied or violated. But this would be fairly open-ended (I'll let you have this card's friendly draw if you
don't attack me next round, etc.). We can continue refining the idea for now."* This file holds the concept as far as
it stands, and the part of it the UI lane can build on its own before the engine carries anything for it. It is a
beginning; Rob refines it with each pass.

## 1. The concept

A **deal** is a promise between two seats, or one seat and the table, made at the table and remembered by it. The
game never enforces a deal, never blocks an action because of one, and never warns before one is broken. The screen
says afterward what happened, in the callout grammar: **KEPT** (green, quiet, on the keeper's chair at the window's
end) or **BROKEN** (red, the moment the fact lands, on the breaker's chair, with the deal's words as the readout).
Commander politics enforce themselves by reputation, so visibility is the lever.

**Structured terms with a free-text rider.** A deal is composed from chips, not typed, so both parties accept the same
reading; the composer shows the plain-words interpretation before sending (*"Luis declares no attackers against you
during his turn 12."*). Anything the chips cannot say goes in a rider, marked *on honor*, which the other party marks
Kept or Broken at expiry, or lets lapse.

| Term | Checkable from | Satisfied when | Violated when |
| --- | --- | --- | --- |
| No attacks on you (next turn · N turns · until turn N) | attackers declared and their targets | the window closes with no attack | an attacker is declared against you |
| No targeting your permanents or you (same windows) | spell and ability targets | the window closes | a target lands on you or yours |
| Truce (both of the above, mutual) | same | same | same |
| Attack someone else this turn (naming the seat) | attackers and targets | an attack on that seat | the turn ends without one |
| Give you the next draw or trigger from a named card | the card's chosen player | you are chosen | someone else is chosen |
| Anything else: the rider | nobody | the other party marks Kept | the other party marks Broken |

**Visibility is the proposer's choice:** a table deal shows on both chairs and its alerts go to everyone; a private
deal shows only to the two parties and alerts only them. **Expiry on the timeline** (when the timeline exists): a deal
is a marker when made and when it resolves, so the story of the game can say "Nina broke the truce on turn 9." Until
then, a History line.

**Later layers, not now:** a *Word* score on Standing (deals kept against broken); counter-offers inside the deal
card; AI seats accepting the checkable terms (the engine's call, never the screen's).

## 2. What the UI lane builds alone, now

Nothing here needs the engine, and all of it stays true once the engine arrives:

1. **`dealText(terms)`**, pure, on `globalThis.CrankBoard` beside `calloutsFor`: the chips to the plain words both
   parties read. One sentence per term, the rider quoted and marked *on honor*. Proved in a Node suite
   (`tests/board-deals.mjs`): every term and window, every seat name, a hidden card never named (a deal may name only
   a card the view shows the proposer).
2. **`dealVerdict(deal, events)`**, pure, beside it: given a deal and a list of structured events of the shape Requests
   row 3 asks for (`{kind: "attack", by, against, turn}`, `{kind: "target", by, on, turn}`, `{kind: "chosen", card,
   player, turn}`, `{kind: "turn", player, n}`), returns `kept`, `broken` with the event, or `open`. Proved in the same
   suite against invented events, so the checks are ready the day the events arrive. Until then nothing calls it with
   real data, and the screen never guesses a verdict from history sentences.
3. **The composer:** a card opened from a chair's menu (*Propose a deal*) and from the Table talk composer: the
   other party (a seat or the table), the term chips with their windows, the rider field, the visibility switch, the
   plain words as they will read, **Propose**. Three taps for a common deal; if it takes more, people will type it in
   chat and the alerts never happen. Keyboard-reachable, every chip named.
4. **The deal card** over the chairs: the words, the parties' sigils, **Accept** · **Decline** for the receiver, a
   small token on both chairs while it stands, Kept / Broken / Lapsed at the end; for a rider, the receiver's
   **Kept** · **Broken** at expiry.
5. **The callouts:** KEPT and BROKEN as two more entries in the grammar (`SAMPLE_CALLOUTS`, Tools › Try the callouts),
   with the deal's words as the readout.
6. **Behind the adapter:** a `deal` frame out (`{type: "deal", ...}`) and a `deal` message in, drawn and wired to a
   stub so the whole flow can be felt in the fixture with two browsers faking the channel; the real channel replaces
   the stub later without touching the rest. The stub never reaches the room.

## 3. What is asked of the engine (file these rows in `docs/ACTIVE.md`, Requests)

- **A typed table channel** delivered to every seat: chat, emote, deal, deal response, with the sender's seat and a
  scope (lounge or table). The same channel Table talk needs.
- **The structured events record** (row 3, strengthened): attackers with their targets, spell and ability targets,
  chosen players, each with its turn. Without it the verdicts would parse history sentences, which is brittle; this
  feature is the strongest argument for that row.

## 4. Rules that bind deals

- A deal never acts: no option is chosen, hidden or lit because of one; the threat lens and the Coach may read deals
  as facts only.
- Nothing names a hidden card: a deal may name a card only as the proposer's own view shows it.
- The screen never computes legality and never predicts: a verdict is read from events after the fact, never inferred
  from the board before it.
- Decisions inside the game belong to the players: a deal is between people; the engine is never asked to honor one.
- American English in every chip and sentence; sizes by sliders; every control keyboard-reachable.
