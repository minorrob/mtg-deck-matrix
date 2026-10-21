# ROB-102, first half: the stack passed for a person with no answer, and the spell called out

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

## Not in this half

**Draw card on** (`drawBeat`, the second half of ROB-102) waits on ROB-24, the board's draw step.

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
