# The playtest harness: driving the real board

For the agents that play CrankMagic as people would (M8, Grok Bot's UAT; `docs/plan-to-done-2026-09-30.md`, Part 5).
This note covers the routes, the stable hooks the lobby and the board expose, how a game is played through them, how
the record is downloaded, and where findings go. Everything named here is covered by a suite (`tests/table-lobby.mjs`,
`tests/table-board.mjs`), so a rename breaks a test before it breaks an agent.

**Drive the page as a person does:** click, type and press keys. Never call `CrankFeatures`, `C.*` or the room's
socket directly. Read what a person reads: the text, and the ARIA names below.

## Where things are

| Route | What it is |
| --- | --- |
| `https://staging.crankmagic.com/` | Staging, behind Cloudflare Access (Play in the cloud is on; its tables are playtest tables) |
| `#decks`, `#cards`, `#discover` | The workshop: Decks, the Library, Explore |
| `#game` | Play: the table page, or the game you have on |
| `#table?id=<tableId>` | A table: the lobby, then the board once the game is on |
| `#table/<tableId>/<code>` | An invite link; opening it signed in joins that seat |

Access needs one of the agents' service tokens or invited test addresses (M8: Rob's step). A signed-out visit to
the API is refused with instructions (`not-invited.html`).

## The lobby (`crankmagic-table.js`)

Buttons carry `data-action`:

- `table-create`: start a table.
- `table-invite`, `table-copy-link`, `table-uninvite`: invite a seat, copy its link, take the invitation back.
- `table-deck`, then `table-use-deck` or `table-use-test-deck`: choose a deck for your seat.
- `table-mat`, `table-mat-pick`, `table-mat-use`: choose a mat. *Use this mat* sits beside the ✕ and is off until a mat is picked.
- `table-rules`, `table-rules-save`: the host's Edit beside *Table rules* (starting life, bracket limit). It is refused once any seat is ready.
- `table-ready`, `table-start`, `table-cancel`: ready, start the countdown, cancel it.

The countdown ends on the table's alarm, and the page hands itself to the board.

## The board (`crankmagic-board.js`)

`#cm-board` is the board; `data-view` on it is `table`, `focus` or `full`, and `data-phone` is set on a phone.

**The strip** (one 48px line): the turn (`.cm-board-turn`), the step (`.cm-board-step`), what the table waits on
(`.cm-board-waiting`, `role=status`), and then these controls:

- **The pass button, `data-action=board-pass`.** Its words say what passing does:
  - *Next step* on your turn with the stack empty;
  - *Resolve* plus the spell's name with something on the stack;
  - *Pass* on another player's turn.
- **`data-action=board-draw`, *Draw a card*.** It replaces the pass button in your own draw step. The draw waits for it.
- **`data-action=board-resolve-all`, *Resolve all N*.** It shows beside the pass when a run of the same trigger is on top of the stack: the same ability of the same source, one player's, with the same targets. One click lets the whole run resolve, and you are asked again as soon as anything else is on top. The stack shows the run as one line, ×N.
- **`data-action=board-skip`, *Skip to end*.** It passes for you through the rest of the turn and stops on anything on the stack or any other question.
- **`data-action=board-also`, *You can also ▾*.** What else you can do; each thing is a `data-action=board-option` button with `data-index`.
- **`data-action=board-view` with `data-view`:** Table, Focus, Full screen.
- **`data-action=board-history`, `board-tools`, `board-panel`, `board-menu`.**

A step where you have nothing to do passes by itself, and the history says so (*Upkeep, Draw step: nothing to do*),
so an agent does not have to click through empty steps.

**When the room says no.** An answer the rules refuse is not taken: the game is as it was, the room says why, and the
same question is asked again. While the AI players are still taking their turns, End game and Leave are refused for a
few seconds (*The AI players are still taking their turns*); try again when the table waits on a person.

**Deciding:**

- **With priority,** a card you can use now is lit (`.cm-bcard.is-bright`); click it to do its one thing.
- **Anything else the room asks** (Keep, attackers, blockers, an order, a number) floats as `#cm-board-decision`. It has `data-action=board-option` buttons, and `data-action=board-confirm` where several are picked. Its `h3` is the question.
- **A card with more than one way to use it** (a spell with two modes, a cost the pool pays more than one way) is
  offered under *You can also* as `data-action=board-choose` (*Cast Zap · 2 ways*). It opens the card with one
  `data-action=board-zoom-do` button per way (`.cm-board-choices`, *Choose one:*), each with `data-index`.
- **A question of numbers** (combat damage among blockers, a split, an X) has one `input[data-board-amount=<n>]` per row
  (`label.cm-board-amount`). Fill each, then `data-action=board-confirm`.
- **Turns that went by while you waited** float as `section.cm-board-went` (`role=status`, named *Turns 3–5 went by*), a
  few lines a turn, the History holding the rest. `data-action=board-went-close` (*OK*) puts it away.
- **Cards** are `button.cm-bcard`. `aria-label` is the name, then its state as the card shows it (*tapped*, power/toughness such as *2/2*, *3 damage*, *1 +1/+1 counter*), then, after a colon, what it can do now: `Llanowar Elves, tapped, 1/1` or `Forest: Play Forest`. A hidden card is a `div` labeled *A hidden card*. `data-card` is the object id, which changes when the card moves (CR 400.7).

**Your hand** (`section[aria-label="Your hand"]`):

- The count sits beside `data-action=board-show-hand`.
- The counts by type are `.cm-board-hand-types li[data-type]` (*Land 2/5*: castable now over in hand).
- Space fans the hand; 1–9 holds a card up; Enter does its first thing; Escape puts it back. ☰ › *Keys and help* lists every key the board has.

**The playmat** (`section.cm-mat[data-seat][data-fit]`):

- Zones: `[data-zone=battlefield|lands|command|exile|library|graveyard]`, each pile's count in its caption.
- `.cm-board-chip`: the mana-open and land-drop reminder, under your Lands.

**Table view:**

- The life counter at the center: `.cm-board-pie`, `role=group`, named *Life: You 40, Maya 40*. Its logo, `data-action=board-vitals`, opens Table vitals.
- The row bar and the tray bar: `[data-drag=rows]` and `[data-drag=hand]`, `role=separator`. The arrow keys move them.
- The card sizes: `[data-board-scale=board|hand]`.

**Focus:**

- The seat pane's divider: `[data-drag=pane]`.
- Tiles: `.cm-board-tile[data-seat]`, and `.cm-board-tile-main` puts that seat's board on the mat.

**Full screen:**

- `data-action=board-rotate` walks the big board round the table. Another seat's hand is drawn as card backs, never faces.
- The side column's divider: `[data-drag=side]`. The Panel's divider: `[data-drag=panel]`.

**Tools** (`#cm-board-tools`):

- the card size (`[data-card-scale]`), which also sets Board cards and Hand cards;
- Sound: `[data-board-sound=sfx|bgm]` and `data-action=board-mute`;
- `data-action=board-end`: End game, which asks a second tap;
- `data-action=board-concede`.

**Sound** starts at the first click on the board and not before. An agent that listens will hear a bed and effects;
one that does not can ignore it.

## A worked example

`tests/uat/board-person.mjs` answers one seat through exactly these hooks, as the house pilot would answer it: the
draw, Pass, an option by `data-index` (under *You can also* when it is not in the panel, through `board-choose` and
`board-zoom-do` when the card has several ways), the amount fields, then Confirm, and it times each answer.
`tests/uat/play-journeys.mjs` plays two four-seat tables of Rob's seven decks with it, every card the deck's own, a
person on a desk and one on a phone held sideways; `tests/uat/real-deck-game.mjs` plays a whole game to its end.

## The record

Once the game is over, the game-over panel offers `data-action=board-record`:

- **On a playtest table (staging's):** *Download the full record*, which is the seed, the pod, the decision tape and the journal. `game/room/replay.mjs` plays it again to the same end (`node -e` with `replayTape`, or `tests/table-record.mjs` as the example).
- **On any other table:** *Download your record*, which is your seat's last view and the public history.

## Findings

One row per finding, in `docs/uat/playtest-findings.md`'s shape (its CSV is `playtest-findings-template.csv`). For
each finding, record:

- the route and view;
- the table id and the turn;
- what was done, and what was seen against what was expected;
- a screenshot;
- for a game, the downloaded record, so the finding can be replayed.

Don't include anyone's address or any secret. The gate scans for both.
