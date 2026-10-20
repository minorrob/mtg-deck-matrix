# ROB-165: keep a long choice at the player's scroll position

Branch: `codex/play-choice-scroll`, from main `d7eadfe1`.

Preserve the options list's scroll position when the board redraws the same
decision in the same match. A new decision starts at the top. Keep the heading,
selection count and Confirm reachable, as established by ROB-163.

Proof to record: real pointer selection and deselection near the bottom of the
60- and 150-option choices at 1024x768, 1280x720 and 1400x900; a new decision
starting at the top; labeled desktop and phone screenshots; a deliberate
regression that the browser suite catches. Local browser checks, asset pins,
exact-head CI and engine-owned staging remain outstanding.
