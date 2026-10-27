# CrankMagic's game table: the facts any game screen must support

*For Replit, with Fable (a Claude session) or Codex Astra building it, on Rob's computer and in the cloud. Paste
everything below the line as the first message to whoever builds it, and put `sample-views.json` from this folder in
the project. Read from CrankMagic's room and engine on 2026-10-12.*

---

## What you are building, and what you are not

You are exploring new game screens for **CrankMagic**: an online table where two to four people and AI opponents play
*Magic: The Gathering* in the **Commander** format. The rules engine, the game server, the AI players, accounts and
each person's deck library already exist. They are not yours to build or to change.

You build only **Play**: the table where a game is set up, and the screen it is played on. It is driven entirely by
data the server sends, plus the answers the player sends back.

This brief deliberately says nothing about how that screen should look, be arranged, move, sound or feel. That is the
open question you are exploring, and the more ambitious the better. Everything below is a fact about the game the
screen must support. **When an idea conflicts with a fact here, the fact wins.** If an idea needs something the facts
don't provide, don't invent it: list it in your handoff (the last section) as a request.

**In scope: Play, and only Play.** The screen a game is played on, and the way into it from the rest of the app.

**The rest of CrankMagic: its menus and links, with nothing behind them.** The prototype carries the app's real
navigation, so a concept can be judged in place. Each item is a link to the real app, or an entry that does nothing;
none is built.
- **The main pages:**
  - Decks: `https://staging.crankmagic.com/#decks`
  - Library: `https://staging.crankmagic.com/#cards`
  - Explore: `https://staging.crankmagic.com/#discover`
  - Play: `https://staging.crankmagic.com/#game`, the one page you build
  - the CrankMagic name and logo: home, `https://staging.crankmagic.com/#welcome`
- **The Menu** (the person's menu, with their own functions):
  - Settings;
  - Save a backup file, Restore from a backup file, Reset All;
  - Help & glossary;
  - Term definitions on hover (on or off);
  - Take a Tour;
  - Send Feedback;
  - Show a QR code;
  - a choice of theme.
- **The footer:**
  - the Wizards of the Coast Fan Content Policy notice;
  - the credits to Scryfall and EDHREC;
  - links: Fan Content Policy, Scryfall, EDHREC, License, Disclaimer, Third-party notices, Privacy
    (`privacy.html`), Terms (`terms.html`), Contact (`admin@crankmagic.com`).

Staging is behind a sign-in, so its links open the real app only for someone invited to it. That is expected.

**Out of scope:**
- rules logic, and working out what is legal;
- anything behind a link to another part of the app: decks, the library, Explore, Settings, backups;
- accounts or sign-in, databases, payments, a real backend, a deploy beyond Replit's own preview;
- any call to CrankMagic's servers, staging or production.

Use the sample data: a static front end and, at most, a small local mock server that plays it back.

## If you work with access to Rob's computer

The system building this may have access to Rob's computer. These hold as well as everything below:
- **Work only in the Replit project, and in a folder Rob gives you for it.** CrankMagic's repository
  (`C:\Users\robmi\CrankMagic\repo`) may be read for facts (`docs/ui-lane/` above all), but this work never edits
  it, never runs git in it, and never imports its code into the prototype.
- **Secrets are never read, printed, copied or uploaded.** That includes browser profiles and saved passwords,
  `wrangler`'s sign-in, `.env` and `.dev.vars` files, SSH keys, API keys, and service tokens. If a step seems to need
  one, stop and ask Rob.
- **Nothing is deployed, published or pushed** to CrankMagic's GitHub repository, its Cloudflare account, or any
  site, from this work. Never run `wrangler`. Never touch Cloudflare, Access or GitHub settings.
- **Nothing outside the project is deleted or moved,** and nothing is installed system-wide, without Rob's say-so.
- **The concept comes back one way:** an export and its `HANDOFF.md` (the last section), which a CrankMagic UI session
  ports into the app on a branch of its own (`docs/ui-lane/README.md`).

## The one architectural rule

**The server is the authority.** The screen:

1. **renders the latest view** it was sent for its seat;
2. **lets the player choose among the options** the current decision offers, and sends that choice;
3. **never** decides, filters or computes what is legal. It never changes the game itself, and never infers or shows
   hidden information.

Everything a player can do inside the game is one of the options in `view.decision.options`. There are three
exceptions, all table actions:
- conceding;
- ending the game for everyone;
- a preference, "stop at every step of my turn".

If the screen offers anything else as a game action, it is wrong.

Put all traffic behind one small adapter: views come in, frames go out. A mock can then play back the sample file, and
the real connection can replace the mock later without touching the rest.

## The format

- **Seats:** two to four, in a fixed order. The room names them `s0` to `s3`, and the table calls them seats 1 to 4.
  Seat `s0`, the host's, always takes the first turn. A seat is a person or an AI. In the sample, `s0` is the person and
  the other three are AI.
- **Commander:**
  - Each deck is 100 cards, led by one commander or two partner commanders.
  - Commanders begin in the **command zone** and can be cast from there.
  - Each recast costs {2} more (the commander tax). The tax is already included in the offer's cost; the view carries
    no tax count.
  - When a commander dies or is exiled, its owner is asked whether it goes back to the command zone.
- **Starting life:** 40, unless the host set another number (1 to 999).
- **A player loses at:**
  - 0 life;
  - 10 poison counters;
  - 21 combat damage from any one commander;
  - drawing from an empty library;
  - conceding;
  - an effect.

  Each player's `health` carries `life`, `poison`, `status`, `lossReason`, `commanderDamage` (by commander) and
  `commanderDamageMax`.
- **The game ends when:**
  - one player is left;
  - every player has lost;
  - an effect wins the game;
  - a person ends it for everyone;
  - every person has left (AI seats never play on alone).

  `view.result` is `{winner, reason, endedBy?, ending}`, and `state.gameOver` is set. The first three say it in words, as
  they always have; `ending` says the same end as data: who lost and why (*How the game ended*, below).
- **A player who leaves takes their cards with them.** Everything they own leaves every zone, effects that gave them
  control end, and whatever they still control is exiled.
- **A dropped connection:** the seat is "away" for up to 5 minutes before it times out, and the other seats are told.

## Before the game: the table

Play opens on a table, where a game is set up. These facts come from the table's code. The sample has no lobby views,
so a concept mocks this part.

- **Seats:** the host creates the table and takes seat 1. Seats 2 to 4 are each a person to invite, or an AI at Easy,
  at Normal, or as an AI on Claude (the last only for someone invited to AI features).
- **Invitations:**
  - Only the host invites, one link for each person's seat. A link lasts 24 hours, and a new one withdraws the old.
  - The host can withdraw an invitation.
  - Joining needs a CrankMagic account: a seat is a signed-in person, one seat each.
- **Decks:**
  - Each person brings a deck of their own, from their library.
  - The host picks each AI seat's deck, and that makes the AI seat ready.
  - A commander is a legendary creature, or a card that says it can be one, and there can be two partners. A deck has
    a bracket, 1 to 5, as its library measures it.
- **The table's rules:** set by the host before anyone is ready. Starting life is 40 unless the host sets 1 to 999.
  There may be a bracket limit, 1 to 5, or none. In a two-player game the player who goes first skips their first draw
  step (CR 103.8a) unless the host turns that off, a house rule: the table's `rules.skipFirstDraw` is `true` until the
  host sends `false`. A game of three or four has no such skip, whatever it says.
- **Mats:** each seat plays on a mat it chooses, any time, the game included, and everyone sees it. There are 30 today:
  five drawn by the app and 25 of Rob's own artwork. Every seat starts on felt.
- **Starting:**
  - A 10-second countdown runs once there are at least two seats and at least one person, and every seat is
    connected, has a deck and is ready. An invited person who has not joined yet holds it.
  - Pressing start with a person's seat that nobody was invited to is refused, with what to do: invite someone, or
    make the seat an AI.
  - If the launch fails, the table goes back to choosing decks and says why.
  - The table's phases are `selecting`, `countdown`, `starting`, `playing` and `rematch`.
- **The opening hand:** each person is asked to keep or mulligan (below). Then the first turn is seat 1's.
- **Afterward:**
  - A finished game's record can be downloaded.
  - The result is filed in each person's own library.
  - Every seat still in the game is asked to play again (below).

## After the game: Play again

When a game ends, however it ends (a player knocked out, End game, the last person leaving, a dropped player's time
running out), the table's `phase` becomes `rematch` and every seat still in the game is asked to play again. These
facts come from `game/room/table.mjs` (`rematch`, `decideRematch`) and its lifecycle (`game/contracts/table-lifecycle.mjs`).
Requests row 12, Linear ROB-167.

- **The answer:** each person sends `POST /api/tables/:id/rematch` with `{"accept": true}` for another game, or
  `{"accept": false}`, which is leaving the table (the board's Leave). It answers 200 `{table}`, the table as that
  person now sees it.
  - An answer can change until every person has answered. The answer that completes them decides.
  - Answering is being there: a seat whose socket closed before the game ended is connected again by its answer.
  - The AI seats always say yes, by themselves.
- **Two minutes:** a person who has not answered by `rematch.deadline` (the game's end plus two minutes,
  `REMATCH_WINDOW`) has said no. The table's own alarm decides then, whether anyone is connected or not.
- **The next game,** once every person has answered, when the host is staying and at least two seats are:
  - A seat whose person said no, did not answer, or left the game before it ended is released: an empty chair that
    never blocks the next start (U-09). Its person is no longer at the table, and their `GET` answers 403. The host may
    invite someone else to the chair.
  - Everyone staying keeps their seat, deck and mat, and is ready: the yes is the Ready. The table's rules stay the same.
  - The ten-second countdown starts at once (`phase: "countdown"`). The host can cancel it, as any countdown.
  - Then the game launches as the table's next match, with a new `matchId`: `<tableId>g2`, then `g3`. A socket still
    open from the last game is sent the new game's views. A new `matchId` is a new game.
- **No next game:** when the host says no, does not answer, or left the game before it ended, or when fewer than two
  seats would play, the table's games are over. It stays in `rematch` with `rematch.outcome: "closed"`, and
  `rematch.reason` says why and to start a new table. The host's no, or the host having left, decides this at once,
  without waiting for the others.
- **Refused, with what to do instead:**

  | When | Status | The words |
  |---|---|---|
  | The game is still on | 409 | "The game is still being played, so there is no Play again to answer yet. Answer it once the game is over." |
  | No game has been played | 409 | "No game has been played at this table yet, so there is no Play again to answer. Use Ready in the lobby instead." |
  | The next game is being set up | 409 | "There is no Play again to answer: this table's next game is already being set up. Use Ready in the lobby instead." |
  | The table's games are over | 409 | "Play again has been decided." and `rematch.reason` |
  | The person left that game | 409 | "You left that game, so the next one is not yours to answer. Ask the host to invite you again." |
  | No seat at this table | 403 | "You do not have a seat at this table." |
  | `accept` is not true or false | 400 | "Answer Play again with accept: true for another game, or false to leave the table." |

- **The table's view, `table.rematch`:** `null` in every phase but `rematch`. In it:
  - `lastMatchId`: the game just over.
  - `deadline`: when silence becomes a no, in milliseconds on the table's clock. `GET /api/tables/:id` answers
    `{table, now}` with that clock's time, as it does for `countdownAt`.
  - `outcome`: `"waiting"` while answers are open, `"closed"` once the table's games are over.
  - `reason`: why the games are over, and what to do, or `null`.
  - `votes: [{seatId, vote}]`: each seat still in the game when it ended, its `vote` `"yes"`, `"no"` or `"pending"`.
- **An example, one person and three AI seats.** Rob's game ends. His table reads:

  ```json
  {"phase": "rematch", "yourSeat": 0, "rematch": {"lastMatchId": "7f3c…g1", "deadline": 1792526540000,
    "outcome": "waiting", "reason": null, "votes": [{"seatId": 0, "vote": "pending"}, {"seatId": 1, "vote": "yes"},
    {"seatId": 2, "vote": "yes"}, {"seatId": 3, "vote": "yes"}]}}
  ```

  He presses Play again: `POST /api/tables/7f3c…/rematch {"accept": true}` answers `{"table": {"phase": "countdown",
  "countdownAt": …, "rematch": null, …}}`, every seat `ready: true` with its deck. Ten seconds on, the table reads
  `"phase": "playing", "matchId": "7f3c…g2"`. Had he pressed Leave (`{"accept": false}`) or waited two minutes, it would
  read `"outcome": "closed"` and `"reason": "The host is not staying for another game, so this table's games are over.
  Start a new table to play again."`

## Zones, and who sees what

| Zone | Whose | Who sees the cards |
|---|---|---|
| Library | each player's | Nobody, its owner included, unless an effect reveals the top card or lets its owner look. |
| Hand | each player's | Its owner. Everyone else sees only how many. |
| Graveyard | each player's | Everyone. |
| Command | each player's | Everyone. |
| Battlefield | shared, but the view groups it **by owner** | Everyone. A creature someone else controls stays under its owner, and its `controller` says who has it. |
| Exile | shared, grouped by owner | Everyone, except face-down exiled cards. |
| Stack | shared | Everyone, except a face-down spell's name. |

- **Zone shape:** each player's zones are `{count, hiddenCount, cards[]}` under `Library`, `Hand`, `Battlefield`,
  `Graveyard`, `Exile` and `Command`.
- **Face-down cards:** `faceDown: true` and `name: null` for everyone. Only their controller, or a player allowed to
  look, also gets `faceDownName`.
- **Phased-out permanents** are absent from the view.
- **The view is already filtered for its seat.** Never fetch, cache or show anything more about a hidden card.
  Nothing on screen may name a card the seat may not see, including a tooltip or an accessible label. There are no
  spectators.

## A turn

**Steps, in order** (`state.phase`):

1. `UNTAP`
2. `UPKEEP`
3. `DRAW`
4. `MAIN1`
5. `COMBAT_BEGIN`
6. `COMBAT_DECLARE_ATTACKERS`
7. `COMBAT_DECLARE_BLOCKERS` (only when something attacks)
8. `COMBAT_FIRST_STRIKE_DAMAGE` (only with first or double strike)
9. `COMBAT_DAMAGE` (only when something attacks)
10. `COMBAT_END`
11. `MAIN2`
12. `END_OF_TURN`
13. `CLEANUP`

- **No priority** in `UNTAP` or `CLEANUP`.
- **No first draw step for the first player, in a two-player game:** their first turn goes from `UPKEEP` to `MAIN1`, with
  no `DRAW` step at all, so nothing triggers there (CR 103.8a), unless the host's `skipFirstDraw` is `false`. In a game
  of three or four, every turn has its draw step.
- **Turn counting:** `state.turn` counts everyone's turns, so turn 3 of a four-player game is the third player's first.
  During its own turns, a seat's view also carries `yourTurn`: which of its own turns this is.
- **Rounds (Linear ROB-76):** label the turn from these, never by dividing `state.turn` by the seats:
  - `state.round`, from 1: a round is every player's turn once, from the starting player's.
  - `state.turnInRound`, from 1: the turns taken in this round so far, an extra one included.
  - `state.turnId`, `"turn:<turn>"`: this turn's own id, the one a Yield holds for.
  - `state.extraTurn`: true during an extra turn.
  - The turn's owner is `state.turnPlayerId`.
  - An extra turn (CR 500.7) is in the round of the turn it follows and never begins one. A player who leaves takes their
    turns out of the round; once the starting player has left, rounds begin at the next player after their seat.
  - `round` and `turnInRound` are null for a game saved before rounds were kept. All four are public, the same to every
    seat.
- **Lands:** one land a turn as a rule. `landsPlayed` counts this turn's.
- **Mana:** tapping makes mana into a pool (`mana: [{color, amount}]`), which empties between steps.
- **Combat:** `state.combat` is `{attackingPlayerId, defenders, attacks: [{attacker, defender, planeswalker?, blocked,
  blockers}]}`.
- **The active and priority players:** `state.turnPlayerId` and `state.priorityPlayerId`.

## Priority and the stack

- **How a step ends:** in each step with priority, the active player gets priority first, then each player in turn
  passes or acts. When all pass in a row on an empty stack, the step ends. When something is on the stack, all passing
  resolves the top object, and the active player gets priority again.
- **Stack entries:** `state.stack` holds `{stackId, cardId, name, faceDown, playerId, kind, stage, targets}`.
  - `kind` is `spell`, `ability` or `trigger`.
  - `stage` is `waiting`, `targeting` or `resolving`.
  - The top resolves first.
  - Stacks can be very deep: one real game had more than 250 identical triggers waiting at once.
- **When the server passes for a person.** It does so, so a person is asked only when there is a real choice:
  - when "pass" is their only option and the stack is empty (the history then says "…: nothing to do");
  - when something is on the stack and nothing they hold could answer it: no spell the mana they could make would pay
    for at this speed, no ability, and no mana ability that does more than add mana. **Only where the table asks for it
    (the room's `passStack`), and it doesn't yet:** a spell passed over this way is never on the stack in any view of
    that person's. It is cast and resolved between two views, so the board must show it from the history (or the
    events of request #3) before tables turn it on (Linear ROB-13, ROB-23);
  - right after they cast or activate, unless they sent it with `hold: true`, their own setting to keep priority;
  - at every priority of theirs in an opponent's turn they yielded (below).

  **But it always asks when:**
  - it is the person's **own end step**. That pass option carries `endsTurn: true`: passing it ends their turn.
  - the person has turned on **step by step**, for every step of their own turn.
  - an **untap** option (below) is on offer.
  - they cast or activated with `hold: true`: priority comes back to them, and they are asked.
- **Yield turn** (a game launched from 2026-10-18; the room's `yieldTurn`, Linear ROB-13):
  - **Starting it:** in an opponent's turn, a seat's own view carries `mayYield: true`. Sending `{type: "yield", on:
    true}` passes every priority of theirs for the rest of that turn, whatever they hold. Sent while they are being asked
    for priority, that priority is passed at once.
  - **While it holds:** their own view carries `yielding: true`. No other seat's view says so, and the history doesn't.
  - **Still asked:** what the rules ask of them is still asked: targets, modes, a "may", blockers, discards, the order
    of their triggers, payments. The yield holds on after they answer.
  - **Ending it:** it ends with that turn. An extra turn is a new one, so the yield doesn't carry into it. It also ends
    if the turn's player leaves the game, and never carries into the seat's own turn or a rematch. Stop yielding is
    `{type: "yield", on: false}`, acknowledged by the next view.
  - **Refused (409, with its words):** in the seat's own turn, before the game begins, for an AI seat, or in a game
    launched before Yield turn.
- **Resolve all:** when two or more identical triggers are on top, the priority decision may include one option that
  resolves them all (`count` says how many).

## Decisions

- **One at a time:** at most one decision is pending for a seat. `view.waitingOn` names the seat the game is waiting on.
  When that is not you, your `decision` is null.
- **AI timing:** while the AI seats are playing, the view may carry `continuing: true`.
- **The shape:** `decision` is `{id, title, mode, min, max, options: [{index, label, …}]}`, sometimes with constraint
  fields. Every answer is `{type: "act", actionId: <a new UUID>, revision: <view.revision>, kind: "answer", choiceId:
  <decision.id>, …}`. Each mode adds its own field:

| `mode` | The player… | The answer carries |
|---|---|---|
| `one`, `boolean`, `index` | picks exactly one option | `indices: [option.index]` |
| `many` | picks from `min` to `max` options | `indices: [option.index, …]` |
| `order` | puts every option in order, first first | `indices`, a permutation |
| `damage`, `amount` | gives each option a number | `amounts: [n for each option, in order]` |
| `ack` | has nothing to choose | `indices: []` |

**Constraint fields, which the server checks and a refusal explains:**
- on `many`:
  - `exclusiveBy`: no two picks may share that field, for example one choice per `cardId`;
  - `requires: [{by, values, least, why}]`;
  - `capped: {by, most, why}`;
  - `budget`.
- on `damage` and `amount`:
  - `total`, `minEach` and `divide`;
  - a blocker's `lethal`;
  - a `defender` option for trample;
  - `overrideOrder`.

### The priority decision

`kind: "priority"`, title "Your priority", mode `one`. Each option has an `act`:

| `act` | What it is |
|---|---|
| `pass` | Pass priority. |
| `play-land` | Play a land. |
| `activate-mana` | Tap something for mana. |
| `cast` | Cast a spell. |
| `activate` | Activate an ability. |
| `turn-face-up` | Turn a face-down permanent face up. |
| `suspend` | Suspend a card. |
| `resolve-all` | Resolve a run of identical triggers. |
| `undo-mana` | Untap a land whose mana is unspent. |

- **One offer per way:** each way of doing something is its own option, with the same `label` and a different
  `detail`. "Cast Lightning Bolt" might come as "→ Maya" and "→ Sam"; others read "X = 3", "sacrificing Bear", "{G}" or
  "tapping Forest". `cardId` ties an option to its card.
- **`lean`:** when an option would help an opponent or hurt your own side (for example, making an opponent's creature
  indestructible), it carries "helps <name>", "against your own" or "against you". It is information, never a block.
- **`undo-mana`:** "Untap Forest", detail "its mana unspent". It is offered when a land was tapped for mana and nothing
  else has happened since. Choosing it puts the game back exactly as it was before the tap.

### The other questions

Titles vary, and the sample has 19 kinds. Among them:
- **Mulligan:** "Keep this hand?" (London mulligan; the first one is free with more than two players), then which
  cards go to the bottom.
- **Combat:**
  - "Declare attackers": one option per creature per player or planeswalker it could attack.
  - "Declare blockers".
  - "Assign N damage".
- **Targets, modes, and costs:** mana, sacrifice, counters, convoke, behold and others. A cost can be paid more than one
  way ("Pay {N}: choose the mana").
- **Library and hand:** "Search your library", scry and surveil, discard, and choosing cards to exile.
- **Choices:** sacrifice, choose a color, a creature type or a card, vote, and "Choose the order your triggers go on the
  stack".
- **"May" choices:** these come with a way to decline ("Don't pay", "Don't cast").
- **Others:** "Put Proft into the command zone?", the legend rule, and discarding down to hand size.

## The conversation with the server

**Sent by the screen:**
- `{type: "view"}`: send me the latest.
- `{type: "act", …}`: an answer.
- `{type: "prefer", stepByStep: true | false}`.
- `{type: "yield", on: true | false}`: Yield turn, and Stop yielding.
- `{type: "view", after: "event:N"}`: the latest view, its `events` everything since event N (see Events, below). The
  room takes `after` (`room.view(seatId, {after})`); the socket passes it once its one line is added in
  `cloud/game-room.mjs` (asked in ROB-11). Until then a `view` frame's `after` is ignored.

**Received by the screen:**
- `view`: the whole `CrankRoomView@1` below.
- `receipt` `{accepted, actionId}`.
- `refused` `{actionId, status, error, view}`. A refused preference carries `of: "prefer"`, a refused yield `of: "yield"`.
- `away` `{seatId, until}`.

**Rules of the conversation:**
- **Views:** a view arrives on connecting and after every change, to every seat. Each carries `revision`, and a view
  older than the one shown is ignored.
- **Stale answers:** an answer sent against an old revision is refused: *"The board changed. Review the refreshed
  choice and try again."*
- **Refusals:**
  - 409: it is not your decision, the choice is stale, or the game is over.
  - 422: the rules' own words.
  - 400: a malformed answer.
  - 500: an engine failure, and nothing changed.
  - A refusal always comes with a fresh view, and **never** changes the game. The person must be told its words.
- **Reconnecting:** the connection can drop. The client reconnects (waiting 1 second, doubling up to 10) and is sent
  the current view.
- **Table actions over HTTP:** these exist; you only need to know they do. Concede; end the game for everyone (any
  person, confirmed twice); and, once the game is finished, download its record and answer Play again (above).
- **The Coach:** a person invited to AI features may ask the Coach (an AI) about their game. It answers in text.

### Events, `events.v1` (Linear ROB-77)

What happened, as data, so the board need not read it from the history's sentences or from two views' difference. A spell
cast and resolved between two views (an opponent passed for, `passStack`) arrives as `cast` then `resolve`.

- **Each view carries the change it shows:** `events` holds what the action that led to this view did, newest last. Two
  views in a row share no event; a view sent again (a refresh) may repeat the last change's, so keep the newest `eventId`
  you have handled and skip any not newer.
- **Each event:** `{eventId, kind, turn, phase, …}`. `eventId` is `"event:N"`, N rising through the match, the same on a
  replay. `player` (a seat index) where someone did it. `decisionId`, where a person's answer made it: the `decision.id`
  they answered.
- **A card** is `{cardId, name}`; `name` is null for a face-down card.
- **Kinds:**

| Kind | Fields |
|---|---|
| `turn` | `player`, `extra?`, `round`, `turnInRound` (as `state` has them; absent for a game saved before rounds were kept) |
| `draw` | `player`, `count` (1); the drawer's own view also has `card`, while it is still in their hand |
| `land` | `player`, `card` |
| `cast` | `player`, `card`, `stackId` |
| `ability` | `player`, `card`, `stackId`, `trigger?` |
| `resolve` | `card`, `stackId` |
| `countered` | `player`, `stackId` |
| `tap` | `card`, `tapped` |
| `damage` | `source`, `target` (`{player}` or `{card}`), `amount` |
| `life` | `player`, `from`, `to` |
| `token` | `player`, `card` (one event per token) |
| `move` | `card`, `from`, `to`, `owner` (zones: hand, library, battlefield, graveyard, exile, stack, command, or null) |
| `attack` | `player`, `attackers: [{card, defender: {player, planeswalker?}}]` |
| `block` | `player`, `blocks: [{card, blocking}]` |
| `reveal` | `player`, `card` |
| `monarch` | `player` |
| `roll` | `player`, `sides`, `result` |
| `lost` | `player`, `reason?` |
| `over` | `winner` |

  Ignore a kind you don't know; no kind changes its meaning within v1.
- **What a seat is told** is what the history tells everyone: a card moving between two hidden zones is no event, and
  another seat's draw is a count. The no-leak harness reads every view's events.
- **Reconnecting:** send `{type: "view", after: <the newest eventId you handled>}`. The view's `events` are then everything
  since. The room keeps its newest 200; when what you missed is older, the view says `eventsReset: true` and has no
  events: start from the view itself, without animating.

### The view, `CrankRoomView@1`

- **Top level:**
  - `schema`, `protocol`, `matchId`, `seatId`, `seat`, `revision`, `status`, `result`;
  - `departures`;
  - `seats: [{seatId, name, pilot, level?}]`;
  - `waitingOn`, `decision`, `state`, `history`;
  - sometimes `continuing`, `stepByStep`, `yourTurn`, `yielding` and `mayYield` (the last two the seat's own only);
  - `eventsSchema` (`"events.v1"`), `events`, and sometimes `eventsReset` (below);
  - `manaSources` (Rob, Oct 26, the Mana Pool module): the seat's own permanents with a mana ability that taps them,
    each `{cardId, name, tapped, ready, ways: [{mana: {W: 1, ...}, pay?}]}` (`rules/actions.mjs`, `manaSources`). A way is
    what one activation adds; `pay` is mana it costs first (a Signet's 1); `ready` is untapped and able to tap now (not
    summoning sick, nothing stopping its abilities). Facts only, the sums are the screen's; no other seat's view carries
    them.
- **`state`:** `turn`, `round`, `turnInRound`, `turnId`, `extraTurn`, `turnPlayerId`, `priorityPlayerId`, `phase`,
  `players`, `combat`, `stack`, `stackSize`, `gameOver`.
- **Each player:** `{playerId, name, life, health, counters, mana, landsPlayed, monarch?, zones}`. A player's `counters`
  is an open set. `monarch: true` is on the monarch alone (one player at most, public to every seat); no other player
  carries the key, and with no monarch nobody does.
- **A card** in a zone:
  - `cardId`, `name`, `faceDown`, `faceDownName?`;
  - `owner`, `controller`, `tapped`, `damage`;
  - `counters: {kind: n}`, an open set (+1/+1, −1/−1, loyalty, lore, charge and more);
  - `types`, `power`, `toughness`, `keywords`;
  - `commander`, and sometimes `commanderKey`, `level`, `monstrous` or `prepared`;
  - `why` (Linear ROB-24, Oct 21): on the viewing seat's own hand and command-zone cards, while that seat holds priority,
    for each one no option plays. It's a short sentence saying why it can't be played now: its time, its mana and the
    commander tax, a color nothing untapped makes, or no way to cast it (`rules/actions.mjs`, `whyNot`). It's words for
    a person to read and never a rule: what can be done is still the decision's options. No other seat's view carries
    it.
- **Not in the view today** (ask in your handoff rather than faking one):
  - what an Aura or Equipment is attached to;
  - whether a permanent is a token;
  - summoning sickness;
  - colors and mana cost;
  - which face of a double-faced card is up.
- **Not in the game at all:** the initiative.

### How the game ended, `result.ending` (Linear ROB-166)

`view.result` is null while the game goes on. Once `status` is `"finished"`, it is the same for every seat (nothing in it
is any one seat's), and it is in the finished game's record too (`GET /table/record`, its `result`, whole):

| Field | What it is |
|---|---|
| `winner` | The winner's seat id, or null. Unchanged. |
| `reason` | The end in words: `"last player standing"`, `"won by an effect"`, `"all players lost"`, `"ended early"`, or `"every person had left the game, so it ended there"`. Unchanged. |
| `endedBy` | Only when the room ended the game: the seat id of the person who ended it, or null when every person was out. Unchanged. |
| `ending` | The same end as data: `{kind, seatId, reason, seats}`. Added on 2026-10-20; read this rather than the words. |

The words could not tell a person knocked out by three AI seats from a person who walked away: both read "every person
had left the game". `ending` can:

| `ending.kind` | When | `seatId` | `reason` | `reason` in words, as before |
|---|---|---|---|---|
| `won` | A player won by the rules: the last player standing (CR 104.2a), or an effect (CR 104.2b) | the winner | null | `last player standing`, `won by an effect` |
| `draw` | Every player still in the game lost at once (CR 104.4a) | null | null | `all players lost` |
| `eliminated` | Every person was out, the last of them lost by the rules; the AI seats left did not play on | the last person out | their loss reason | `every person had left the game, so it ended there` |
| `conceded` | Every person was out, the last of them conceded | the last person out | `conceded` | the same |
| `timed-out` | Every person was out, the last of them ran out of time: away for five minutes, so the room conceded them | the last person out | `conceded` | the same |
| `ended` | A person ended the game for everyone (any person at the table, the host or not) | who ended it | null | `ended early` |

- **`seats`:** every seat, in seat order, as `{seatId, outcome, reason}`.
  - `outcome` is `won`; `lost`, out by the rules; `conceded`; `timed-out`; or `playing`, still in the game when it ended (the
    AI seats when every person was out, and everyone still in when a person ended it).
  - `reason` is the engine's loss reason for a seat that is out, the same word as that player's `health.lossReason`, and
    null for a seat that won or was still playing.
- **The loss reasons:**
  - `life`: 0 life or less (CR 704.5a), damage included;
  - `poison`: 10 poison counters (CR 704.5c);
  - `commander-damage`: 21 combat damage from one commander (CR 903.10a);
  - `empty-library`: drew from an empty library (CR 704.5b);
  - `effect`: an effect said they lose the game (CR 104.3e);
  - `conceded`: they conceded (CR 104.3a), or ran out of time, which the room concedes for them.
- **Leaving is conceding.** A person leaves a game in play only by conceding (the table's Concede, or the five minutes
  running out), so a person who left is `conceded` or `timed-out`. A seat that had already lost by the rules and left
  afterward keeps its loss: `lost`, with that reason.
- **The last person out** is the one `kind` and `seatId` turn on when more than one person played, whatever their seat
  order: the room keeps the order the seats went out in (a game played before `ending` kept none, and counts the last
  person by seat order).
- **The record.** The board files a person's own result in their library. As it files today (Rob, 2026-09-26): a
  concession is a loss, and a timeout or a game ended early is unfinished; and by ROB-166, a person `eliminated` is a
  loss. So, from the person's own entry in `seats`: `won` is a win; `lost` and `conceded` a loss; `timed-out` unfinished;
  and `playing` (in a game a person `ended`) unfinished. In a `draw`, nobody won.
- **One person and three AI seats, the person losing to damage.** Every seat's view says:

```json
"result": {
  "winner": null,
  "reason": "every person had left the game, so it ended there",
  "endedBy": null,
  "ending": {
    "kind": "eliminated",
    "seatId": "s0",
    "reason": "life",
    "seats": [
      {"seatId": "s0", "outcome": "lost", "reason": "life"},
      {"seatId": "s1", "outcome": "playing", "reason": null},
      {"seatId": "s2", "outcome": "playing", "reason": null},
      {"seatId": "s3", "outcome": "playing", "reason": null}
    ]
  }
}
```

  So the banner can say "You lost: your life reached 0", and the record is a loss. Had the person conceded, `kind` and
  `s0`'s `outcome` would be `conceded`; had their time run out, `timed-out`; had the host ended the game,
  `{"kind": "ended", "seatId": "s0", "reason": null}` with every seat `playing`, and `endedBy: "s0"`.
- `sample-views.json` was recorded before `ending`: its last view has the words alone.
- Proved by `tests/room-ending.mjs`, every guard broken by `game/tools/batch/breaks-loss-reason.py`; the code is
  `game/room/ending.mjs`.

## What players see of the AI

- **Levels:** AI seats play at Easy, at Normal, or as an AI on Claude.
- **What shows:** a person sees what the AI did only as views change and history lines appear. An AI's own decisions
  are never shown.
- **The five-second rule:** a person's wait for the game to come back to them should stay under five seconds.

## History

`view.history` is newest first, up to 120 lines of `{turn, text, mark?}`. The `mark` is one of:
- `turn`: a new turn began;
- `quiet`: steps that passed with nothing to do, merged into one line;
- `end`.

History is public. A draw says "drew a card", never which card, and taps, mana and shuffles are left out.

## Scale to plan for

- **Decks and cards:** decks of 100, up to four players, and an engine that knows 2,015 cards.
- **Boards:** real games in testing ran from about 20 to 260 permanents on the table. A Goblin deck once made more than
  2,000 tokens in one turn.
- **Games:** 10 to 60 turns or more, with 120 history lines in each view.
- **Card images:**
  - Use `https://api.scryfall.com/cards/named?exact=<name>&format=image`, plus `&version=small|normal|large` as needed.
  - Show card images unaltered: never crop away the artist credit or copyright line.
  - Fetch politely, and cache.
  - Hidden cards show a card back. CrankMagic has its own backs; use a placeholder in the prototype.
- **Devices:** it runs in a browser, on desktops and on phones.

## Requirements the finished product holds every screen to

These are acceptance requirements, not design direction.

- **Accessibility (WCAG 2.1 AA):**
  - text at 4.5:1 contrast or better;
  - every action reachable by keyboard, with a visible focus;
  - every card and control named for a screen reader, though never naming a card the seat may not see;
  - one polite live region for status.
- **Text size:** no text smaller than 10 px. A size the person can change is changed continuously, never in steps, and
  is remembered on that device.
- **Language:** American English and US number and date formats. Card names keep their printed spelling.
- **Never decide for the player.** A convenience that passes priority for them must be one they turned on. Their own
  Skip to end stops when anything is on the stack or another question is asked. Explicit room-backed Yield turn
  continues through spells and abilities for the rest of the opponent's turn (the Yield turn contract above).
  Required questions always remain theirs to answer; yielding resumes afterward within that same turn.
- **When something can't be done,** say what is wrong and what to do, naming the thing. Never a warning that can be
  clicked past.

## The sample data

`sample-views.json`:
- **Its fields:** `{schema, about, seed, decks, result, turns, decisionsInGame, kept, views}`.
- **What it is:** 42 views that seat `s0` (the person) was sent across one real, 60-turn, four-seat game, played by
  CrankMagic's own room:
  - the first view of each of the 19 kinds of question;
  - a spread across the game;
  - the last view.
- **How each is kept:** exactly as the browser received it, its history trimmed to the newest 12 lines. Hidden
  information is already removed.
- **How to use them:** as fixtures. Render any of them, build the answer each decision calls for, and log the frame you
  would have sent.

## What to hand back

When a concept is worth keeping, export the code with a `HANDOFF.md` that says:

1. The concept, in a paragraph, with screenshots.
2. Where the adapter is: where views come in and frames go out.
3. Every view field the concept reads.
4. Anything it wanted that the view does not carry, and why. These become requests to CrankMagic's engine.
5. Anything it assumed that this brief did not state.
6. The libraries it uses, and their licenses.

Mana source ways may include `payColors` for fixed colored activation requirements and `ready: false` when a non-mana cost cannot be paid. The source is ready only when at least one of its ways is ready. The Mana Pool counts activation funding with distinct sources and color balances; this does not choose or execute a player payment.
