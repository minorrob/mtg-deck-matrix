# The orchestrator's procedure: the card load to 100% (2026-10-28)

Rob, 2026-10-28: *"I want 100% accuracy, 0 errors in the game when any given card is played, for that to be play-tested
to satisfaction, and a 0 error rate on the execution of a card mechanic."* He handed this run to an OpenAI orchestrator
with eight subagents. `README.md` here is where the load stands and what 100% means; `BRIEF.md` is every subagent's
brief. This file is yours, the orchestrator's.

**The unit of work is a wave**: eight subagents in parallel, one consolidated integration branch, one consolidated test,
one merge to `main`, one staging release. Waves repeat until the gates in `README.md` ("What 100% means") are met or a
stop condition below holds. You keep the record in `RUN.md` here so that a fresh orchestrator can resume from the
repository alone.

## Before wave 0, once

1. **Read** `AGENTS.md` (the rules of engagement: they bind you), `docs/ACTIVE.md` (the top sections and the lanes
   table), this folder, `docs/engine/plan-card-load-program.md`, and the gameplay-gap list
   (`docs/engine/gameplay-gaps-2026-10-21.md`, on `main` after PR #834 lands; until then
   `git show origin/claude/engine-sentence-paragraphs:docs/engine/gameplay-gaps-2026-10-21.md`). Read narrowly.
2. **Claim the lane.** In `docs/ACTIVE.md`, add a section at the top, *"Card load to 100% (OpenAI orchestrator, for Rob;
   `codex/engine-load100-*`)"*: you hold the card-load files (`game/engine/cards/**`, the files generated from them,
   `data/engine/candidates.json`, `docs/engine/card-load-100-2026-10-28/**`) and the engine rule modules the cards need,
   by Rob's assignment of 2026-10-28. If another section of `docs/ACTIVE.md` says a session is working in `game/engine/**`
   now, write in the Requests table what you need from it and do not edit its files.
3. **Linear.** Under ROB-85 (the card load program), make one issue for the run (*"Card load to 100%: the OpenAI
   orchestration"*) and one per wave as each starts. Comment on each when it merges and when it reaches staging; the
   staging release is also recorded in ROB-11.
4. **Toolchain** (Personal-HP; `BRIEF.md`, "The machine", has every path). The primary checkout,
   `C:\Users\robmi\CrankMagic\repo`, is on another session's branch: never switch it, commit in it, stash in it, or run
   `git clean` there. Make every worktree from it:

   ```powershell
   git -C C:\Users\robmi\CrankMagic\repo fetch origin
   git -C C:\Users\robmi\CrankMagic\repo worktree add -b <branch> C:\Users\robmi\CrankMagic\worktrees\load100\<name> <base>
   New-Item -ItemType Junction -Path C:\Users\robmi\CrankMagic\worktrees\load100\<name>\node_modules -Target C:\Users\robmi\CrankMagic\repo\node_modules
   ```

   To remove one later: unlink the junction first
   (`[System.IO.Directory]::Delete('C:\Users\robmi\CrankMagic\worktrees\load100\<name>\node_modules', $false)`), then
   `git -C C:\Users\robmi\CrankMagic\repo worktree remove <path>`. A recursive delete through the junction would destroy the
   primary checkout's Playwright install. Never remove a worktree or folder you did not create.
5. **A green baseline.** In your own integration worktree, on `origin/main`:
   `node --stack-size=4000 game/tools/batch/check-cards.mjs` (expect 0 failed),
   `node game/tools/card-compiler.mjs`, `node game/tools/sentence-library.mjs`. Record their lines in `RUN.md`.
   A suite that is red on main before you change anything is recorded as such, never "caught" by a break.

## Each wave, N = 0, 1, 2, ...

### 1. Plan the wave (you alone)

- `git -C C:\Users\robmi\CrankMagic\repo fetch origin`; make the integration worktree `w<N>-integrate` on a new branch
  `codex/engine-load100-w<N>` from `origin/main`; push it; open a **draft** PR into `main` titled
  `Card load to 100%, wave <N>`.
- **Deal the cards.** Wave 0 is the debt wave (below). From wave 1, in this order of tiers, each finished before the next:
  1. **T1** Rob's library and decks: `node --stack-size=4000 tools/library-engine-index.mjs --out <scratch>/w<N> --lane-size 30 --review-by-theme`.
     Today 1 library card is unloaded; every one of the 477 live-deck cards is final.
  2. **T2** the most-played Commander cards: the same, with `--top 3239`. Today 1,247 are unloaded and 2 are candidates.
  3. **T3** every other Commander card, **sentence first**: from wave 0's `tools/library-engine-index.mjs --pool` (built in
     wave 0 by W5), each lane's list ordered so that the first cards written are the ones whose missing sentence
     completes the most other cards (`card-compiler.mjs`'s `nextSentences`; today 12,080 cards are one sentence short).
     After each wave's merge the compiler recompiles, and every card those sentences now complete arrives as a
     candidate for the next wave's review lists. This is the program's flywheel; it is what makes 25,000 cards
     reachable.
- **Deal for the flywheel, not for the count.** Among a tier's cards, prefer the ones whose gap sentences are shared by the
  most other undefined cards (`card-compiler.mjs --report`'s missing-sentence ranking; `engine-compile.mjs --plan` per
  card), so each hand-written sentence completes many cards as candidates for the next wave's review. Record in `RUN.md`
  the ratio **candidates gained per sentence written**; it is the number that decides how long T3 takes.
- Each writer gets its theme's lane file(s), about 30 cards (`cards`) plus its theme's candidates (`review`). A writer
  with nothing left in its theme takes the next `spells` cards. Copy the wave's lane files into this folder as
  `w<N>/lane-<role>.json` and commit them on the integration branch before spawning.

### 2. Spawn the eight (in parallel)

For each role in `BRIEF.md` (W1 faces, W2 stack, W3 graveyard, W4 combat, W5 mana, W6 tokens, W7 spells, V8 verifier):
make its worktree `w<N>-<suffix>` on branch `codex/engine-load100-w<N>-<suffix>` from the integration branch, with its
junction, and start the subagent with this prompt (fill the `<>`):

> You are `<role>` of wave `<N>` of the card load to 100%. Your worktree is
> `C:\Users\robmi\CrankMagic\worktrees\load100\w<N>-<suffix>`, on branch `codex/engine-load100-w<N>-<suffix>`. Read
> `AGENTS.md`, then `docs/engine/card-load-100-2026-10-28/BRIEF.md` and follow it exactly; then
> `docs/engine/card-load-2026-10-23/BRIEF.md` and `game/tools/batch/README.md`, which it sends you to. Your list is
> `docs/engine/card-load-100-2026-10-28/w<N>/lane-<role>.json` (for V8: the other seven lanes' PRs as they arrive).
> `<Wave 0 only: your debt items, listed below.>` Work only in your worktree, on your files. When done, push, open a
> draft PR into `codex/engine-load100-w<N>`, and send me the report in `BRIEF.md` in 30 lines or fewer. Send V8's
> findings and my questions as they come; do not wait to the end.

Keep each subagent's report short in your own context; the detail is in its branch and PR.

### 3. Route, while they work

- **A stopped card** (its construct belongs to another theme): give it to that lane for this wave if it has room, else
  carry it to the next wave's list. Record it in `RUN.md`.
- **A V8 finding:** send it to the lane that owns the card or rule; that lane fixes it on its branch with a scenario that
  failed before the fix, or names it an ignore. You decide no finding away. A finding against a card already on `main`
  goes to its theme lane this wave.
- **Two lanes needing the same new construct:** the lower-numbered builds it, the other stops on its card (the waves'
  rule).

### 4. Integrate (you, in `w<N>-integrate`)

1. Merge each writer's branch into the integration branch, W1 to W7, with a merge commit each
   (`git merge --no-ff origin/codex/engine-load100-w<N>-<suffix>`), then V8's harness branch if it has one.
   **Generated files are never hand-merged:** take either side, then regenerate once, after the last merge:

   ```sh
   node game/tools/engine-definitions.mjs --write
   node game/tools/card-compiler.mjs --write --report docs/engine --date <yyyy-mm-dd>
   node game/tools/engine-candidates.mjs --write
   node game/tools/engine-coverage.mjs --write
   CRANKMAGIC_RULES_ROOT=C:/Users/robmi/CrankMagic/rules node game/tools/engine-catalog.mjs --write --rules C:/Users/robmi/CrankMagic/rules/MagicCompRules-20260925.txt
   git add -A && node tools/data-inventory.mjs && node tools/data-inventory.mjs --check
   ```

   Set the README's suite count to `ls tests/*.mjs | wc -l`. A conflict in an engine module is resolved by reading both
   sides' intent; then both lanes' breaks files are run again.
2. Merge `origin/main` in (a merge commit; main moves while a wave runs), and regenerate again if it touched cards.

### 5. The consolidated test (on the integration head)

All of these, in this order, each recorded in `RUN.md` with its result line. Any red is a defect: route it (step 3),
re-integrate, and re-run from the first red check. Never rerun a red check unchanged hoping it passes; a flake is
recorded with its evidence.

| # | Check | Pass means |
| --- | --- | --- |
| 1 | `node --stack-size=4000 game/tools/batch/check-cards.mjs` | 0 failed |
| 2 | `node game/tools/sentence-library.mjs` | No new calibration failure (today's four are wave 0's debt) |
| 3 | `node game/tools/engine-definitions.mjs --check`, `node game/tools/engine-candidates.mjs --check`, `node game/tools/engine-catalog.mjs --check`, `node tools/data-inventory.mjs --check` | all current |
| 4 | `node tests/engine-cards.mjs`, `tests/card-compiler.mjs`, `tests/card-waves.mjs`, `tests/table-candidates.mjs`, `tests/sentence-library.mjs`, `tests/table-basics.mjs`, `tests/data-integrity.mjs`, `tests/feature-wiring.mjs`, `tests/engine-breaks-anchors.mjs`, every suite a lane added | all pass |
| 5 | Every `game/tools/batch/breaks-load100-w<N>-*.py`: `python3 -u game/tools/batch/breaks.py <file>` | `missed: []` each |
| 6 | V8's play: the pool fuzz (≥ 200 games, `--replay --leaks --exercised`), the library's 50 seeds, the staging decks' 2 × 25 | every game clean, replays identical, no leak, **every card new this wave exercised** |
| 7 | V8's review | every new or promoted card read; every finding fixed or a named ignore you agreed to |
| 8 | `bash tools/local-ci.sh HEAD 0` | SCAN PASS |
| 8b | `gzip -c game/engine/cards/definitions.mjs \| wc -c` and the same for `candidates.mjs` | Recorded in `RUN.md` each wave. The Worker ships both inside its script; a Cloudflare Worker script is capped at 10 MB compressed on the paid plan (3 MB free). At 6,430 cards `definitions.mjs` is 4.5 MB raw, 786 KB gzipped; the whole pool would be about 22 MB raw, 4 MB gzipped. **Stop and ask Rob at 2.5 MB gzipped** (about wave 12): the fix is the engine lane's, not a card's: keep each definition as JSON text parsed on first use (as `candidates.mjs` already does) or serve the directory from KV or R2 (`docs/plan-to-100.md`, M5) |
| 9 | Push; mark the PR **ready**; GitHub Actions `suites` (one run, about 45 to 60 minutes) | green on the exact head |

The whole suite runs once, on GitHub (Rob, 2026-10-01: never twice). The Workers Builds checks
(`crankmagic`, `crankmagic-staging`) fail on every PR and do not gate. If Actions cannot run at all (a job that fails in
seconds with no log, on `main` too), `bash tools/local-ci.sh HEAD 2` is the gate instead and its PASS block goes on the PR
as a comment; say so in the merge report.

**Pipeline the waves.** Once checks 1 to 8 pass on wave N's integration head, deal wave N+1 and start its lanes from
that head (not from `main`) while Actions runs check 9. If the run fails, the fix lands on wave N's branch and wave N+1
merges it in. That saves the hour of each Actions run; the record says which head a wave started from.

### 6. Confirm and merge

Right before merging, re-check: the green run's `headSha` is the PR's head; `origin/main` is an ancestor of the head
(`git merge-base --is-ancestor origin/main HEAD`); `gh pr view <n> --json mergeable` is `MERGEABLE`. If main moved, merge
it in, push, and wait for a new run (unless `git merge-tree --write-tree origin/main HEAD` equals
`git rev-parse HEAD^{tree}`). Then:

```sh
gh pr merge <n> --merge --match-head-commit <sha>
```

A merge commit, never a squash. Close the lane PRs as merged through the integration (comment the merge SHA on each).

### 7. Release to staging, read it back

Staging only; **production never** (it is Rob's go, every time).

1. A release worktree at `origin/main`, detached, with its junction:
   `git -C C:\Users\robmi\CrankMagic\repo worktree add --detach C:\Users\robmi\CrankMagic\worktrees\load100\release origin/main`
   (later waves: `git -C <that path> checkout --detach origin/main`). The release builder takes its rules from the
   checkout it runs in, so it must be main's.
2. First see whether main is already released: `git log -1 --format=%s origin/release/cloud-staging` names its main; if
   it already contains your merge, skip the build.
3. `WRANGLER=C:/Users/robmi/CrankMagic/workbench/cloudflare/node_modules/wrangler/bin/wrangler.js bash tools/release-staging.sh C:/Users/robmi/CrankMagic/worktrees/load100/release`,
   as a background task (it builds, walks `release-acceptance` and `play-e2e`, and only then commits and pushes
   `release/cloud-staging`).
4. Read it back, in PowerShell, with the Access token from the Windows user environment (never print it):

   ```powershell
   $env:CF_ACCESS_CLIENT_ID = [Environment]::GetEnvironmentVariable('CF_ACCESS_CLIENT_ID','User')
   $env:CF_ACCESS_CLIENT_SECRET = [Environment]::GetEnvironmentVariable('CF_ACCESS_CLIENT_SECRET','User')
   node tools/staging-check.mjs --expect <first 7 of the merged main sha>
   ```

   If no `crankmagic-staging` check run appears on the release commit within a few minutes
   (`gh api repos/minorrob/mtg-deck-matrix/commits/<release sha>/check-runs`), push an empty commit with the same tree
   to `refs/heads/release/cloud-staging` (`git commit-tree <tree> -p <head>`), which has made it build before.
5. If the release script or the read-back cannot authenticate, stop the release there and say so: never work around a
   credential.

### 8. Record, then the next wave

- `RUN.md`: the wave's row (cards written, promoted, stopped; each check's result line; the merge and release SHAs; the
  ignores); the gate totals in "What 100% means" measured again (`card-compiler.mjs`, `library-engine-index.mjs --top 3239`).
- The gameplay-gap list: each item fixed this wave leaves it (with its PR); each new ignore joins it.
- `docs/ACTIVE.md`: your section's state, in a small commit on the next wave's integration branch.
- Linear: the wave's issue closed with the merge and staging SHAs; ROB-11's release line.
- **Rob's playtest list:** in the wave's Linear issue, the cards this wave made playable and three decks (from his
  library or the precons) that use them, so he can play them on staging. "Play-tested to satisfaction" is Rob's word,
  never yours: you report what the fuzz and the scenarios prove, and what is not proven at a real table.
- Remove the wave's lane worktrees (junction first). Start wave N+1 with **fresh** subagents; none carries a wave's
  context into the next.

## Wave 0: the debt wave

No new cards until what is already loaded is exactly right and the harness can prove it. `README.md`, "Open accuracy
debt", is the list, checked against main on 2026-10-28, each row with its evidence line and its role. Give each role its
rows (copy them into `w0/lane-<role>.json` as `debt`, with the evidence). In short:

| Role | Wave 0 work |
| --- | --- |
| You, first | **Land PR #834** (`claude/engine-sentence-paragraphs`: a paragraph is one ability; the gameplay-gap list). It is CONFLICTING with main: in its own worktree merge `origin/main` in, regenerate, re-anchor its breaks and prove them caught (`breaks.py <file> <label>`), then merge it into wave 0's integration branch. Merge this package's branch, `claude/engine-loading-orchestration-dd4c7f`, in as well. |
| W1 | Elspeth's emblem object; the remaining emblems (Daretti, the second Teferi); prepare on tokens and copies; battles (ROB-149's battle half) |
| W2 | New targets for copies of "up to N" spells; "up to N" spells cast free or by an effect; Metallic Mimic and the copiers; Gandalf's face-down cast from exile (CR 708.4) |
| W3 | The command-zone choice (CR 903.9b); Innocuous Rat (CR 701.40f); two "you may play" permissions asked; nested destruction replacements asked; Liesa's zone-change question waited on; **remembered objects** (`RememberObjects`, `RememberChanged`) and `MayPlay` |
| W4 | Trample assignment asked (CR 702.19b); trample over a planeswalker (702.19c); protection from a departed source; damage doublers' order; a token entering attacking asks whom; blocker-side requirements (ROB-149); calibration failures **Blackblade Reforged** and **Goblin Piledriver** |
| W5 | Urza's Saga's "mana cost {0} or {1}"; token shock lands asked; casts from exile and alternative costs with mana not yet in the pool; {X} and additional costs by an effect; delve with {X}; convoke with Phyrexian and {2/W}; the 24/12 payment caps complete or lifted; **Wayfarer's Bauble**; and **`tools/library-engine-index.mjs --pool`** (every undefined Commander card, dealt by theme, sentence first) with its suite |
| W6 | Counter, token and entering replacements asked, not ordered in code; Plumb the Forbidden's copies by last known information; **Contagion Clasp**; Incubator copies (if V8 confirms) |
| W7 | Alms Collector and dredge asked (CR 616.1); "each player draws" from the active player; draw replacements asked; dice modifiers and "whenever you roll"; the compiler's gate: a candidate's smoke game must have **played** the card, and the minimum template count raised to what the calibration supports (`game/tools/card-compiler.mjs`) |
| V8 | The pool fuzz and the exercised ledger; the **ability ledger**: which abilities of each card no scenario ever makes fire or apply, read from the journal and history the engine already writes for every game (what `replay.mjs` and `fuzz-live.mjs` read), **never by instrumenting a rules module**, and reported by `check-cards.mjs` so a card with an unreached ability fails; the scenario runner's `settle` / `optional` / `targets: "any"`; `fuzz-live`'s silent throw and legendary-only commanders; `engine-room-games`' skipped seeds and frozen deal; `engine-x11-leave-questions`' replaced answers; coverage's partial constructs; the five unsure section-4 items settled by scenario. Then the first pool fuzz over **all 6,430 final cards**: the baseline of what still errors |

The monarch on the board is the Play lane's: put it in the Requests table of `docs/ACTIVE.md`. **Cunning Wish and
Extrapolate the Impossible are ruled** (Rob, 2026-10-28): W2 makes a deck holding either illegal in Play, refused by name
in `readDeck` (`game/room/table.mjs`) with the reason and the way out, and a suite that proves it; the Decks wishboard is
Linear ROB-198, after the load. Neither card is written.

A scenario-runner fix will turn many scenarios red at once (3,547 files use `settle`). V8 lands the runner change behind
an option first, measures which cards fail under it, and you deal those cards to their theme lanes in wave 0 or wave 1;
the strict runner becomes the default only when they pass. That is the one place a check may run in two modes for a
while, and `RUN.md` says so.

Wave 0's done: every row fixed or a named ignore Rob can read; V8's first pool fuzz over every final card run, its
findings routed and fixed. Only then does wave 1 start. Wave 0 may take more than one wave's length; that is expected.

## Hand-back: the run outlives any one model

Rob moves this run between OpenAI and Claude as each plan's limit allows, and Codex, Cursor or Grok may take a lane. The
run must be resumable from the repository alone, at any point, by any of them:

- `RUN.md`'s "Where the run stands" is the hand-back block: holder and model, the wave and step in progress, the
  integration branch and head, each open lane branch with its state (pushed, PR number, done or stopped where), and the
  next action. Keep it current at every step of a wave, not only at the end.
- Every lane's state is on its branch and in its draft PR body; nothing lives in a conversation. A subagent pushes at
  every clean point.
- Branch prefixes are the model's (`codex/` here; `claude/` when Claude holds the run). A resuming model continues an
  open integration branch as it is and starts new lanes with its own prefix.
- **When your own budget nears its end:** finish the step you are in if it is short; otherwise have every lane push with
  its report, write the hand-back block, update `docs/ACTIVE.md`'s section and the wave's Linear issue, and stop. Never
  leave an unpushed branch.

## Stop and ask Rob (and record why in `RUN.md`)

- The same defect fails twice after a fix attempt (AGENTS.md).
- A gate would pass only by weakening an assertion, retargeting a test or redefining "done".
- The card bundle the Worker ships passes 2.5 MB gzipped (check 8b): a change to how the directory is served, before more
  cards.
- Anything that spends money (an API key, a paid plan), touches production, applies a D1 migration, deletes a branch,
  folder or record you did not create, or changes a shared setting.
- A rules question the CR and the card's rulings do not settle (Rob's rulings decide; his ruling on "outside the game"
  is in `README.md`, section 8).
- Your own context is past one wave's worth: write `RUN.md` and stop; a fresh orchestrator resumes from it.

## After each wave, a checkpoint to Rob (10 lines)

What merged (PR, SHA), staging (release SHA and the `staging-check` line), cards final now of the pool (and the share),
the fuzz line (games, clean, exercised), the ignores added, what wave N+1 takes, and anything waiting on him.
