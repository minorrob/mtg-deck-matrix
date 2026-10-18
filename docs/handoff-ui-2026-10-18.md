# Handoff, 2026-10-18: the UI lane's session (Fable) closed

Written by Fable's session in a cloud container at Rob's instruction ("complete any outstanding work, close out the
session and prepare a session handoff"). Everything it relies on is in this repository; nothing depends on the
container, which will be reclaimed. The repository's state file is `docs/ACTIVE.md` (AGENTS.md: a handoff states
four things); this page is the pointer and the order to read in.

**Read first, in this order:**
1. `AGENTS.md`, `CLAUDE.md`.
2. `docs/ACTIVE.md`: the lanes table at the top (who holds what now), then the UI lane's section
   "2026-10-12: the UI lane's pass 1 on the Play screen", whose last bullets are 2026-10-17 and 2026-10-18.
3. `docs/ui-lane/astra/README.md`: the instructions to whoever holds the UI lane, one directory, with the precedence
   that settles any conflict; its `handoff.md` has the game in one page, the file map and the commands that prove
   each piece.
4. `docs/HANDOFF-TO-CODEX-2026-10-18.md`: the Play boards handed back to Codex Astra on 2026-10-18 by the session
   that held Codex's lane on the 17th; newer than this page's reading of who holds what, and it wins.
5. `docs/play-overhaul/REQUIREMENTS.md` and `INSTRUCTIONS.md`: Codex's Play overhaul, newer than the Astra
   directory where they differ.

## The four things

- **Branch and commit:** `claude/nice-hypatia-4ajdyi`, fast-forwarded to main's merge commit 9cf57d0c (PR #729);
  this page and the close-out bullet in `docs/ACTIVE.md` are the last small docs PR from it. Nothing unmerged.
- **Proven:** pass 1 of the Play screen (#725, main 222af699, on staging); the Astra directory and the a11y walk
  rewritten for the tabletop with the three tabletop defects it found fixed (#729, main 9cf57d0c, a green `suites`
  run). Each claim's command is in `docs/ui-lane/astra/handoff.md` §4 and the breaks files
  `game/tools/batch/breaks-play-ui.py`, `breaks-play-ui-rest.py`, `breaks-a11y-tabletop.py` (all caught).
- **Assumed:** nothing new today. Staging serves main 62900176 of 2026-10-18 (read back signed in with
  `tools/staging-check.mjs` at this close), which carries #729's fixes and Codex's tabletop; production is where
  `docs/ACTIVE.md`'s latest release record says.
- **Outstanding, and whose:**
  - ROB-154 (UI lane): Settings opened from Full screen's profile menu drops keyboard focus to the page body.
  - ROB-156 (UI lane, ROB-16's leftover): breaks for the tabletop's mat material, rear-seat layout and camera
    persistence against `tests/table-tabletop.mjs`.
  - Rob's feedback on pass 1, then pass 2 by whoever holds the UI lane (`docs/ui-lane/astra/README.md` §4).

## How to resume this lane in one line

Read `docs/ACTIVE.md`'s lanes table and the UI lane's last bullet; take the next item from the list above; branch
`<system>/ui-<topic>` from `main`; a draft PR at once; merge `main` in before marking ready; one green `suites` run;
a merge commit; a line in your `docs/ACTIVE.md` section.

## Learned this session, for whoever works this lane with Rob

- **Merge only on a green run of the head, and never over newer work:** when `main` moves, merge it into the branch,
  take `main`'s version of any shared file whole, and add your lines inside your own section. Rob asked for exactly
  this twice ("ensure we aren't overwriting newer work").
- **A red gate is diagnosed on `main` first** (a worktree of `origin/main`, the same suite): a failure red there too
  is not the PR's, and is said once on the PR with what was ported or that no fix exists. Rob then chooses: fix it in
  the PR, wait for its owner, or merge as admin. He chose the fix.
- **A CI-only reading is resolved from the suite's own evidence,** not by guessing: `A11Y_SHOTS` and `A11Y_DEBUG`
  save the measured screenshot, and the failure message now carries each word's place, ink and lowest pixel.
  `docs/ui-lane/tools/probe-tabletop.mjs` answers a question about Full screen in four minutes instead of ten.
- **Rob reviews from staging and screenshots** (1280×720 and 1920×1080), wants the lower-confidence areas named
  first, and sends feedback as one batch for the next pass.
- **At a close:** the four things in `docs/ACTIVE.md`, a handoff page, Linear commented with what was and was not
  done, and new issues for what was found and left.
