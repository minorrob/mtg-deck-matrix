# ROB-102: the stack passed for a person with no answer, the spell called out; and Draw card

October 21, 2026, by Claude, holding Codex · Play while Codex is away. Branch `claude/play-pass-stack`, stacked on
#809 (ROB-168), which holds #808 (ROB-166, ROB-167).

## What a player sees

- **No stop at every AI spell.** At a table of three AIs, each AI spell used to stop Rob with a Pass he had nothing to
  answer with: the most-felt stop of the Oct 19 play test. Now a spell he can't answer resolves without asking him.
- **He sees it came and went.** The board calls out each such spell on his next view:
  **CAST** · *Maya* · *Cultivate* · resolved. At most three at once; a face-down spell isn't named.
- **Not called out:**
  - his own spells;
  - a spell still on the stack (that's the RESPONSE callout, as before);
  - a spell that was countered (that's COUNTERED, from the history).
- **When he holds an answer, he's still asked.** An instant, a flash creature, an ability he could activate: any of
  these stops him as before. So does a spell he cast holding priority (CR 117.3c), when priority comes back to him.
- **The history keeps every spell,** passed or not.

## The rule

- It's the room's `passStack` (ROB-13, `game/room/room.mjs`). A person with nothing they could do passes by themself,
  with something on the stack too. The engine's `nothingToDo` decides "nothing they could do".
- A table launches new matches with it **on**, unless the host turns it off: `POST /table/rules {passStack: false}`.
  Anything but true or false is refused, saying so. It's saved with the table's other rules (life, bracket, first
  draw).
- A match launched before keeps how it was asked, and replays as it was played.
- The lobby has no switch for it yet. That comes with the table-rules panel (ROB-124).
- The G1 harness (`tools/fuzz-live.mjs`) launches its games with it, as the table does (`tests/game-leave.mjs`
  checks the two pods match).

## The second half: Draw card

On `claude/play-draw-card`, stacked on this branch's PR (#810).

- **Your draw step waits for you.** Rob's Oct 15 playtest decisions reverse Oct 9's draw by itself: "label the pending
  draw action Draw card". A table's new matches launch with `drawBeat` (the engine's held draw, ROB-73, CR 504.1).
- **What you see in your draw step:**
  - the button reads **Draw card**;
  - your library is lit as the same button ("Draw card: your library, 92");
  - your hand doesn't change until you click one of them;
  - one click draws one card, and it flies from the library to your hand (the board's motion; none with Reduce motion);
  - the turn goes on to the first thing there is to do.
- **An AI seat draws for itself.** In a two-player game, the first player's first draw is still skipped unless the host
  turns that off.
- **Old matches:** one launched between Oct 9 and now drew by itself, and replays so.
- **The G1 harness** launches with it too.
- **ROB-24's other asks are still open:**
  - actions in upkeep and after the draw, with why a card can't be played yet;
  - the draw's motion as the other players see it.

Proof:

- `table-board` walks turn 2's draw step. The button reads Draw card, the other board has nothing to draw, and the
  library says what a click does. A pointer reaches the library where it is drawn (hit-tested, not a Playwright click).
  One click draws one card, and the room asks in the draw step and nowhere it shouldn't.
- `game-table`: the pod carries `drawBeat`.
- `game-leave`: the harness's pod matches the table's.
- `game/tools/batch/breaks-draw-card-on.py`: 5 breaks.

## Suites

- `tests/board-callouts.mjs`, 41 checks. CAST for another player's spell that resolved between views; not for:
  - your own;
  - one still on the stack;
  - a countered one;
  - a view sent again;
  - more than three.
- `tests/game-table.mjs`, 174 checks. The rule on for a new table; the host turns it off; anything else refused. With it
  off, the pod has no `passStack`.
- These suites play the respond-to-a-spell board, so they turn the rule off after creating their table, and are
  otherwise unchanged:
  - `tests/table-board.mjs`;
  - `tests/room-resolve-all.mjs`;
  - `tests/board-choices.mjs`.
- `tests/uat/solo-vs-ai.mjs` plays whole 1-vs-3 games with it on.
- `game/tools/batch/breaks-pass-stack.py`: 9 of 9 caught. Three older breaks re-anchored to the new lines:
  - two in `breaks-first-draw-step.py`;
  - the harness break in `breaks-yield-turn.py`.

  `breaks-yield-turn.py`'s "passing the stack" break now proves a table with the rule off doesn't pass it.
