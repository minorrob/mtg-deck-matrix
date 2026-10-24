# ROB-166 and ROB-167 on the board: how the game ended, said; Play again

October 21, 2026, by Claude, holding Codex · Play while Codex is away. Branch `claude/play-ending-rematch`, stacked on
#806 (the rematch route), which holds #805 (the room's `result.ending`), #807 and #804.

## What a player sees

- **When you're knocked out at a table of AIs** (ROB-166). The banner used to read "The game was ended early. Every person
  had left the game, so it ended there." Now it reads **"You lost"** with the reason: "Your life reached 0. With only AI
  players left, the game ends here." Ten poison counters, 21 commander damage and a draw from an empty library each
  say their own words.
- **Every other ending says what it was:**
  - you conceded;
  - you ran out of time (its record is kept as not finished);
  - another person was the last one out;
  - someone ended the game for everyone;
  - a draw;
  - a win.

  A room from before `ending` keeps its old words.
- **Play again** (ROB-167):
  - The banner offers **Play again**, **Leave the table** and Back to the table.
  - Play again answers the table's question and shows the lobby, which counts down ten seconds to the next game: the same
    seats, decks and rules, a new match. If the table hasn't heard yet that the room's game is over (409, "still being
    played"), the answer is tried again for a few seconds.
  - The lobby's panel shows every seat's answer (deciding, playing again, leaving), the closing time in your own time, and
    the buttons. When the table's games are over, it says why, with New table.
- **The library's record of the game** reads `ending` too, when it says this seat's own end:
  - lost by the rules is a loss with its reason;
  - a game ended for everyone is unfinished;
  - a draw is a draw.

  This changes nothing that was right before: a knock-out at a table of AIs was already filed as a loss.

## Proof (Personal-HP, Playwright 1.56 Chromium, `GEOMETRY_REQUIRED=1`)

- **`node tests/board-ending-rematch.mjs`** (new): 62 checks.
  - Every ending's head and line are checked, and none of them reads "ended early" unless it was ended early.
  - Play again and Leave on the banner, in Full and Focus at 1280x720 and on the phone, by `elementFromPoint`. Play again
    is answered after two "still being played" refusals, and the lobby counts down. Leave answers No.
  - The lobby's answers, closing time ("Answers close at 12:42 AM"), buttons, a Yes's "You are staying", and the closed
    reason with New table.
- **`REAL_DECKS_REQUIRED=1 GAMES=1 node tests/uat/solo-vs-ai.mjs`:** a whole 1-person-vs-3-AI game with Rob's decks,
  through the real board, on the real table (#805, #806) in-process.
  - The room says `{kind: "eliminated", reason: "life"}`.
  - The banner reads "You lost. Your life reached 0. With only AI players left, the game ends here."
  - Play again on the banner takes the pointer and the lobby counts down. The next match `…g2` is on the board, playing.
  - 20 checks.
- **`game/tools/batch/breaks-ending-rematch.py`:** 11 breaks, `missed: []`.
- **Also green:** `table-lobby`, `table-board`, `a11y-board`, `board-commander-hand`, `engine-breaks-anchors`,
  `feature-wiring`, `asset-versions`, `data-integrity`.
- **Pins:** board 62, table 30, service worker 503, app 520.

## Not here

- **The host rule is #806's:** the host must stay for a next game. That's a rule for Rob to confirm.
- **A game played with a Shared deck is still not filed in the library.** Game Logs (ROB-31) is the place to see those.
