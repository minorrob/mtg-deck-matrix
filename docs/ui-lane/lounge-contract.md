# The lounge contract: what the Pre-lobby, the New game pop-up and the Lobby ask of the server

*Rob, 2026-10-28: "You can do the server half." Written by the Play session (`claude/gifted-ride-w6xoa3`) from Rob's
three Claude Design screens (Pre-lobby, New game pop-up, Lobby with walkthrough). The page reads this; the server builds
it. Every route is behind Access like the rest of `/api/tables` (`x-crankmagic-email` names the caller). A route that is
not built answers 404 or 405 and the page says "not open on this server yet" and shows an empty list, never a made-up one.*

Identity: a person is their signed-in address. **Addresses never leave the server** except to that person (a seat's `you`
flag, `mine`); other people are shown by display name only. The admin is `groupOf(email) === "owner"` (Rob). The
organizer is the table's host (seat 1).

## 1. The lounge: who is playing

### `GET /api/tables/live` -> `{games: [...]}`

Every public table that is in its lobby (`selecting`/`countdown`) or being played (`playing`), plus **private** ones the
caller sits at or organizes; the admin sees every table. Finished and canceled tables are not listed. Newest first.

```json
{"tableId": "abc...", "location": "lobby" | "live", "organizer": "Rob", "commander": "Chulane, Teller of Tales",
 "mechanic": "Bant value · Enter-the-battlefield draw", "privacy": "public" | "private",
 "ai": 2, "human": 1, "open": 0, "startedAt": 1730000000000 | null,
 "roster": [{"name": "Rob", "ai": false, "commander": "...", "mechanic": "..."}, {"name": "Sable", "ai": true, ...}],
 "mine": true}
```

`commander` is the organizer's seat's commander (a seat that has not chosen a deck: `null`). `mechanic` is a short
phrase if the deck names one (optional; `""` is fine). `human` counts people seated or invited, `ai` counts AI seats,
`open` counts seats nobody holds and nothing is invited to (an `invited` seat is not open). `startedAt` is when the room
started (ms), `null` in the lobby. `roster` lists every occupied seat, **public facts only**: name, whether AI, the
commander named when the seat chose its deck (the table already shows commanders to every seat), never a hand or a
library. `mine` is true when the caller holds a seat or organizes it.

Implementation hint: a registry Durable Object (a name with a hyphen, as `cards-known`, so it is never a table) that each
table reports its summary to on every change, entries expiring after a day, and `live` reads it.

### `GET /api/tables/mine` -> `{tables: [{tableId, phase, organizer, summary, turn?}]}`

The caller's own unfinished tables (a seat held, phase `selecting`, `countdown`, `playing`), newest first. This is
"Resume game" and "saved state kept for the next login": it works on any device, not only the one that holds the
`crankmagic-play-seat` shortcut. A table whose game is over (`rematch`/`over`) is not listed.

### `GET /api/leaderboard` -> `{rows: [{name, wins, losses, ties, unfinished, you}]}`

Per person, from the games the server finished. `unfinished` = games the person sat in that ended without a result
(End game, abandoned, conceded before a result counts as a loss, not unfinished). `name` is the display name; `you` marks
the caller's row. Sorted by wins, then fewest losses. Rows only for people who sat in at least one game that has ended.
Needs a D1 table (`migrations/`, the next free number; Rob applies migrations): until it exists, answer `{rows: []}`.

## 2. Making a table

### `POST /api/tables` (existing) gains fields

```json
{"hostName": "Rob", "privacy": "public" | "private", "observe": false,
 "seats": [{"kind": "human", "name": "Avery Chen", "email": "avery@example.com"?, "user": "Avery Chen"?},
           {"kind": "ai", "level": "easy|normal|hard|llm", "name": "Sable", "persona": "sable"}]}
```

* `privacy` defaults to `"private"`. A public table is listed in `live` to everyone.
* `observe: true` is the admin's **Observe AI game**: only the admin may ask (403 otherwise); there is no human player
  at seat 1 (the admin watches, as a spectator, from the start); at least two AI seats. The room runs with AI seats only.
* A human seat may carry `email` (a "New user" invited by email) or a CrankMagic user's display name. Nothing is mailed
  by this call; the lobby's invite links do that work. The email is stored server-side, never returned.
* An AI seat's `persona` is an opaque id `[a-z]{1,20}` (stored and returned as `persona`, additive; the AI-players
  session gives it meaning). `level` `hard` is not playable yet: answer 422 "Hard is not open yet" until the roster says
  otherwise; `llm` stays gated by `aiSeatOpen`.
* `POST /api/tables/:id/rules` also takes `houseRules: bool` and `privacy`.

### `GET /api/users/search?q=<text>` -> `{users: [{name, handle}]}`

CrankMagic users the organizer may invite by name: people on the invite list / accounts, matched on display name or the
part of the address before the `@`, at most 8, never the caller, **never returns an address**. If no directory exists,
derive display names from the invite list (`cloud/access-invites.mjs`) and say so in the PR. Requires sign-in.

### `GET /api/ai-seat` gains `levels` -> `{open, levels: ["easy","normal"], personas: [...]?}`

The levels a table may seat now (so the pop-up greys the rest with "not open yet"). `open` is unchanged (the Veteran/
`llm` gate).

## 3. The lobby

All `POST`, organizer only unless said, refused once a seat is ready or the game has started (as `rules` is), with
the table's usual `TableError` messages:

* `POST /api/tables/:id/seat` `{op: "remove", seatId}`: clears an AI or human seat (seat 1 never); a table needs two
  seats left. `{op: "add-ai", seatId, name?, level?, persona?}`: an open seat becomes an AI. `{op: "edit-ai", seatId,
  name?, level?, persona?}`: changes an AI seat's name, level, persona (host only; the seat's deck stays).
* `POST /api/tables/:id/request-join` (any signed-in person not seated, **lobby phase, public table or a private one
  they were told of, an open seat exists**): files a request `{requestId, name}` with the organizer; 409 if one is
  already open for this person. The table's view carries `requests: [{requestId, name}]` **to the organizer only**.
* `POST /api/tables/:id/request` `{requestId, accept: bool}` (organizer): accepting seats the person in the first open
  seat (a seat is bound to their address as `join` does) or, if it must be bound by a link, creates an invitation the
  requester's next `GET /table` finds; declining removes it. A person already seated cannot file one.
* `POST /api/tables/:id/quit` (the **organizer or the admin**; a game in the room or in the lobby): ends the table for
  everyone, as `end` does for the host, recorded as `unfinished` for every human seat; answers `{table}`.
  The existing `end` stays.
* `GET /api/tables/:id/log` (the **organizer or the admin**) -> `{log: [{at, text, kind}], chat: [...]}`: the game's
  public history lines (what `view.history` carries), then the chat history, in order, bounded. Never a hand or library.

The table view (`GET /api/tables/:id`) gains `privacy`, `observe`, `youAreAdmin`, `requests` (organizer only), each seat's
`persona` and `level` (AI seats), and `rules.houseRules`.

## 4. Watching

`GET /api/tables/:id/connect?watch=1` (WebSocket upgrade, as `connect`): a **spectator**. Allowed for a public table to
anyone signed in, a private one for its seats and the admin. It receives the same `view` frames as a seat, built from the
public state only: **no seat's hand, no library contents** (counts only), no private choices, no decision. It sends no
actions (any action frame answers `{type: "refused"}` and is not applied). Spectators are counted in the table's view as
`watching: n` (a number only). The admin's **Observe AI game** table starts with the admin connected this way.

## 5. Chat

* `POST /api/tables/:id/chat` `{text}` (a seated person, or the admin watching; 1-300 chars, rate-limited to a few a
  second): appended to the table's chat (last 500 kept) and pushed to every connection as `{type: "chat", message:
  {id, seatId|null, name, text, at}}`. Works in the lobby and in the game.
* The view carries the last 50 as `chat` so a reconnect shows them. A watcher's name is "Watching: <name>".
* The chat is part of `GET /api/tables/:id/log` and of the finished game's record.

## 6. Results

At the game's end (the table already knows the winner), write one row per human seat (`outcome`: win | loss | tie |
unfinished) for the leaderboard; **never** AI seats. A conceded game is a loss; `quit`/`end` before a result is
`unfinished`.

## What the page does with an unanswered route

`live`, `mine`, `leaderboard`, `search`, `request-join`, `request`, `quit`, `log`, `seat`, `chat`, `connect?watch=1`:
404/405 -> the page's part reads empty and says it is not open on this server yet.
