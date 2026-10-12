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

  `view.result` is `{winner, reason, endedBy}`, and `state.gameOver` is set.
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
  There may be a bracket limit, 1 to 5, or none.
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
  - A rematch is not built in the cloud.

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

- **No priority** in `UNTAP` or `CLEANUP`. The first player skips their first draw only in a two-player game.
- **Turn counting:** `state.turn` counts everyone's turns, so turn 3 of a four-player game is the third player's first.
  During its own turns, a seat's view also carries `yourTurn`: which of its own turns this is.
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
  - right after they cast or activate, unless they sent it with `hold: true`, their own setting to keep priority.

  **But it always asks when:**
  - it is the person's **own end step**. That pass option carries `endsTurn: true`: passing it ends their turn.
  - the person has turned on **step by step**, for every step of their own turn.
  - an **untap** option (below) is on offer.
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

**Received by the screen:**
- `view`: the whole `CrankRoomView@1` below.
- `receipt` `{accepted, actionId}`.
- `refused` `{actionId, status, error, view}`. A refused preference carries `of: "prefer"`.
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
  person, confirmed twice); and, once the game is finished, download its record.
- **The Coach:** a person invited to AI features may ask the Coach (an AI) about their game. It answers in text.

### The view, `CrankRoomView@1`

- **Top level:**
  - `schema`, `protocol`, `matchId`, `seatId`, `seat`, `revision`, `status`, `result`;
  - `departures`;
  - `seats: [{seatId, name, pilot, level?}]`;
  - `waitingOn`, `decision`, `state`, `history`;
  - sometimes `continuing`, `stepByStep` and `yourTurn`.
- **`state`:** `turn`, `turnPlayerId`, `priorityPlayerId`, `phase`, `players`, `combat`, `stack`, `stackSize`,
  `gameOver`.
- **Each player:** `{playerId, name, life, health, counters, mana, landsPlayed, monarch?, zones}`. A player's `counters`
  is an open set. `monarch: true` is on the monarch alone (one player at most, public to every seat); no other player
  carries the key, and with no monarch nobody does.
- **A card** in a zone:
  - `cardId`, `name`, `faceDown`, `faceDownName?`;
  - `owner`, `controller`, `tapped`, `damage`;
  - `counters: {kind: n}`, an open set (+1/+1, −1/−1, loyalty, lore, charge and more);
  - `types`, `power`, `toughness`, `keywords`;
  - `commander`, and sometimes `commanderKey`, `level`, `monstrous` or `prepared`.
- **Not in the view today** (ask in your handoff rather than faking one):
  - what an Aura or Equipment is attached to;
  - whether a permanent is a token;
  - summoning sickness;
  - colors and mana cost;
  - which face of a double-faced card is up.
- **Not in the game at all:** the initiative.

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
- **Never decide for the player.** A convenience that passes priority for them must be one they turned on. It stops
  whenever anything is on the stack, or when any other question is asked.
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
