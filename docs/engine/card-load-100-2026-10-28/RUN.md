# The run's record: the card load to 100%

The orchestrator writes this after every wave (`ORCHESTRATION.md`, step 8). A fresh orchestrator resumes from it alone.
Newest wave first. Each line names its command's result line, never a summary of it.

## Where the run stands

- **Holder:** Codex, started October 28, 2026, for Rob; Linear ROB-199 (run), ROB-200 (wave 0), under ROB-85.
- **Main at the start:** `39a45706`.
- **Wave and step:** wave 0, baseline and prerequisite reconciliation; no new cards.
- **Integration:** `codex/engine-load100-w0`, worktree `C:\Users\robmi\CrankMagic\worktrees\load100\w0-integrate`.
  Package #911 merged locally; eight debt lane files committed at `c9d31c40`.
- **Prerequisite:** original #834 remains open and conflicted on GitHub. Isolated reconciliation branch
  `codex/engine-load100-pr834` at `e800f4d1` merges main and preserves paragraph boundaries alongside current
  castable-card spell segmentation. Focused suites and mutation checks must pass before integration.
- **Lanes:** V8 `codex/engine-load100-w0-v8-verify` is independently auditing the harness; edits wait for the
  prerequisite. W4 combat and W5 mana worktrees are prepared; other roles queued. This session has three subagent
  slots, so all eight roles remain separate and run in batches. No lane is complete.
- **Ownership:** the primary checkout has another session's unresolved merge and remains untouched. The old standing
  engine table predates Rob's direct October 28 assignment; current open PRs were checked. No active engine-rule PR
  besides #834 was listed. `readDeck` overlap remains a narrow coordination request; the monarch is Play's request.
- **Toolchain:** Node `v22.23.3`; required dependency junctions created. Git Bash is
  `C:\Program Files\Git\bin\bash.exe`; Windows blocks its named-object initialization inside the sandbox, so the
  authorized scan runs with escalation. Network fetch/gh also requires escalation. No approval review rejection.
- **Next:** finish compiler calibration baseline; complete #834's focused checks, re-anchor and prove breaks;
  integrate it, then start the wave-0 fixes and proof harness. Do not claim a passed gate from package history.

## Wave 0 evidence so far

Fresh baseline on main `39a45706`, before engine changes:

- `node --stack-size=4000 game/tools/batch/check-cards.mjs` (exit 0): `6430 definitions`; `11023 scenarios, 0 failed`.
- `node game/tools/card-compiler.mjs` (exit 0): `card-compiler: 25616 undefined Commander cards; 116 candidates,
  0 refused, 2 blocked, 0 vetoed, 24429 with an unknown sentence (12080 one short), 1069 another layout (62.7 s)`.
- `node game/tools/sentence-library.mjs`: running; no completed calibration result yet.
- Prerequisite focused `node tests/sentence-library.mjs` (exit 0): `sentence-library: 77 checks passed`;
  8,048 templates, 4,165 held out, 4,161 passed. This is a green suite with four calibration failures, not G-4 passed.
- Pre-push scan at `f25d7d82`: `local-ci: SCAN PASS`; later commits need their own scan before push.
- Evidence logs live in `C:\Users\robmi\CrankMagic\worktrees\load100\scratch`; result lines are recorded here so the
  checkout is resumable without those scratch files.
- No pool games, independent card reviews, ability ledger, exercise totals, staging release, or Rob sign-off yet.

## The gates, measured

| Gate (README, "What 100% means") | At the start (2026-10-28, main `39a45706`) | Now |
| --- | --- | --- |
| G-1 Commander cards final | 6,430 defined of about 32,046; 25,616 undefined | |
| G-2 Candidates outstanding | 116 (compiler, live); 100 in the committed `candidates.json` | |
| G-3 `check-cards` | 6,430 definitions, 11,023 scenarios, 0 failed | |
| G-4 Calibration failures | 4 of 4,165 (Blackblade Reforged, Contagion Clasp, Goblin Piledriver, Wayfarer's Bauble) | |
| G-5 Pool fuzz, clean of games | the harness has no pool mode yet; library 3 of 3, staging decks 1 of 1 clean | |
| G-6 Final cards exercised in a clean game | not measured (no ledger yet) | |
| G-7 Gameplay-gap list open items | section 4: 21 open, 5 unsure; section 5: 10 open; section 7: 10 open; section 8: 10 rows open, 4 partial (`README.md`, "Open accuracy debt") | |
| G-8 Rob's playtest sign-off | none | |

## Waves

| Wave | Integration PR | Written | Promoted | Stopped | Checks (result lines) | Merged | Staging | Ignores added |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
