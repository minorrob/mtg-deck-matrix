# Play home and setting a table: the instruction (Rob, 2026-10-12)

Rob: *"Clicking Play should bring us into the pre-lobby screen. Within the pre-lobby screen, I can create a new game,
join existing games, chat in pre-lobby, see past game stats, leaderboard, etc."* The design is section 10 of
`brief-v2-play-experience-2026-10-12.md`; this file says what of it the UI lane builds now, in what order, against
what the table and the Worker carry today.

## 1. Today

Play (`crankmagic-table.js`) opens to the **New table** form: *Your name at the table*; seats 2 to 4, each a select
(*A person I will invite* · *An AI · Normal* · *An AI · Easy* · *Nobody*) and a name field; **Create the table**. Under
it, since pass 1, **Recent games** from the library's filed results. Creating lands in the lobby: four quadrants,
the center panel with the table's rules (starting life, bracket limit, seats, invitations last a day, a dropped player
has five minutes), the host's **Edit** while no seat is ready, the host's **Start** that begins the ten-second
countdown, Cancel during it. The client keeps the seat it holds in `localStorage` (`SEAT_KEY`) and reopens the table
from it. The table's API is `/api/tables/<id>` and its sub-paths (`rules`, invitations, `known`).

## 2. The target

Section 10 of the second-edition brief: Play home as the lounge (the return banner; Start: New table, Play the AI
now, Rematch, Join by link; Open games; Table talk; Standing and Recent games), and New table as the lobby's square in
miniature with the rules as chips and one button, **Set the table**, landing in the lobby with the invite link copied.

## 3. What can be built now, and what waits on the engine

| Piece | Now, with today's table | Needs the engine (file a Requests row) |
| --- | --- | --- |
| Play home as a page with its columns and the fold | yes | — |
| The return banner | yes: the kept seat, the table's phase from `/api/tables/<id>` | — |
| New table as the square: tap a quadrant to set the seat (person · AI Easy · AI Normal · Nobody); the name prefilled from the account; the last table's setup as a preset (kept on the device) | yes: the same create call the form makes today | *Open* as a seat kind (anyone the access allows) |
| The rules chips: starting life, bracket limit | yes: today's `rules` call, moved from the Edit dialog to the card | access state (Open · Invite-only · Private viewable · Private restricted), spectator talk, a soft turn clock |
| Choose your deck now | yes: the lobby's deck strip, shown on the card | — |
| Set the table → the lobby with the invite link copied | yes: the link is `inviteLink(id, code)`; copy it, toast it, keep the QR a tap away | — |
| Play the AI now | yes, as a sequence the client drives: create with one AI seat, bring the last deck, ready, Start; the countdown still runs (the room's) | the countdown skipped when every seat is yours or an AI (Requests row 2 widens to this) |
| Rematch the last table | the host's half: a new table with the same seats and the same invitations | a rematch the room knows (the anchor: not built in the cloud) |
| Join by link or code | yes: a link is `/api/join/<id>/<code>` already; a code is its last segment | — |
| Recent games | exists | — |
| Standing: your own record by deck, last ten, average finish, the season, the deck ladder | yes, from the library's filed results, the same data Recent games reads | the friends leaderboard (results across accounts), deals kept |
| Open games and the detail card | a stub with invented tables, styled final, behind the adapter | a list of tables with access state, seats, turn and elapsed time; join and invite requests |
| Table talk in the lounge and at the table | a stub behind the adapter, styled final | a typed table channel with a lounge scope and a table scope (the same channel deals need) |
| The spectator | — | the spectator projection |

## 4. The order

1. **New table as the square** (the whole card, the chips the table supports, Set the table with the link copied).
   The biggest visible change for the least engine dependence; it replaces the form outright.
2. **Play home's frame:** the page, the return banner, Start with Play the AI now and Join by link, Recent games moved
   under the fold, Standing's own-record half.
3. **The stubs, styled final:** Open games with a dozen invented tables across the four access states, Table talk.
   Each behind the adapter with its data shape in a comment, so wiring needs no redesign.
4. **The lobby's center panel** takes the same chips as the card; Table talk beside the square once the channel exists.

## 5. Rules that bind this screen

- Nothing a seat may not see: the lounge's presence list and Open games show what the Worker sends and nothing more.
- Sizes are sliders or dividers; the card and the columns size by them, never by steps.
- American English; US dates in Recent games and Standing (`C.usDate`).
- A refusal from the table (a seat that nobody was invited to, a deck the table cannot play) shows in the table's own
  words, under the button that asked, naming what to do.
- The invite link is copied on Set the table and said so; it is never shown to anyone but the host, and never logged.
- Every control keyboard-reachable with a visible focus; the square's quadrants are buttons with names.

## 6. Proof

- `tests/table-lobby.mjs` holds the lobby and the launch line today; extend it for the card (a table set from the
  square reaches the lobby with the same seats the form would have made; the link is on the clipboard) and for the
  return banner. Standing's own record: a Node check against invented filed results.
- A breaks file `game/tools/batch/breaks-play-home.py`, one break per thing the change makes true.
- Screenshots at 1280×720 and 1920×1080 of Play home and the card, for Rob.
