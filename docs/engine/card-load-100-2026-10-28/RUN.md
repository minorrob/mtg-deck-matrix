# The run's record: the card load to 100%

The orchestrator writes this after every wave (`ORCHESTRATION.md`, step 8). A fresh orchestrator resumes from it alone.
Newest wave first. Each line names its command's result line, never a summary of it.

## Where the run stands

- **Holder:** Codex, started October 28, 2026, for Rob; Linear ROB-199 (run), ROB-200 (wave 0), under ROB-85.
- **Main at the start:** `39a45706`.
- **Wave and step:** wave 0, baseline complete; prerequisite regression and first debt batch in progress; no new cards.
- **Integration:** `codex/engine-load100-w0`, worktree `C:\Users\robmi\CrankMagic\worktrees\load100\w0-integrate`.
  Package #911 and prerequisite #834 merged locally; eight debt lane files committed at `c9d31c40`.
  Draft integration PR #912: https://github.com/minorrob/mtg-deck-matrix/pull/912.
- **Prerequisite:** original #834 remains open and conflicted on GitHub. Isolated reconciliation branch
  `codex/engine-load100-pr834` at pushed `ae3bfd6f` merges main and preserves paragraph boundaries alongside current
  castable-card spell segmentation. Integrated through `50b1623c`. Full backstop validation exposed its inherited
  assertion that Gemstone Caverns must never be sampled; fixed to require sampling and successful scenario execution,
  with a mutation restoring the exclusion. Selected backstop breaks are running; do not mark the prerequisite complete.
- **Lanes:** V8 `codex/engine-load100-w0-v8-verify` is building the independent harness. W4 combat and W5 mana
  are implementing their first bounded fixes in isolated worktrees; other roles queued. This session has three subagent
  slots, so all eight roles remain separate and run in batches. No lane is complete.
- **Ownership:** the primary checkout has another session's unresolved merge and remains untouched. The old standing
  engine table predates Rob's direct October 28 assignment; current open PRs were checked. No active engine-rule PR
  besides #834 was listed. `readDeck` overlap remains a narrow coordination request; the monarch is Play's request.
- **Toolchain:** Node `v22.23.3`; required dependency junctions created. Git Bash is
  `C:\Program Files\Git\bin\bash.exe`; Windows blocks its named-object initialization inside the sandbox, so the
  authorized scan runs with escalation. Network fetch/gh also requires escalation. No approval review rejection.
- **Next:** complete #834's corrected backstop checks and selected breaks; integrate the follow-up; route W4/W5/V8
  findings and continue the remaining five roles. Do not claim a passed gate from package history.
- **Decision pending from Rob:** journals/history do not record static-ability application or distinguish all mana
  abilities. May V8 supplement journal evidence with an in-memory counterfactual scenario proof? Existing journal-only
  G-3 is unmet. The proposed proof method has not been implemented or credited while the answer is pending.

## Wave 0 evidence so far

Fresh baseline on main `39a45706`, before engine changes:

- `node --stack-size=4000 game/tools/batch/check-cards.mjs` (exit 0): `6430 definitions`; `11023 scenarios, 0 failed`.
- `node game/tools/card-compiler.mjs` (exit 0): `card-compiler: 25616 undefined Commander cards; 116 candidates,
  0 refused, 2 blocked, 0 vetoed, 24429 with an unknown sentence (12080 one short), 1069 another layout (62.7 s)`.
- `node game/tools/sentence-library.mjs` (exit 0): `sentence-library: 8048 templates from 6353 cards; 4165 of 6430
  translated with themselves held out, 4161 passed (99.9%); minimum count 1`.
- Prerequisite focused `node tests/sentence-library.mjs` (exit 0): `sentence-library: 77 checks passed`;
  8,048 templates, 4,165 held out, 4,161 passed. This is a green suite with four calibration failures, not G-4 passed.
- `node tests/sentence-paragraphs.mjs`: `sentence-paragraphs: 11 checks passed`.
- `python -u game/tools/batch/breaks.py game/tools/batch/breaks-sentence-paragraphs.py`: all five caught, `missed: []`.
- `node tests/card-waves.mjs`: `card-waves: 22 checks passed`.
- `node tests/feature-wiring.mjs`: `feature-wiring: 131 checks passed`.
- `python game/tools/batch/anchors.py`: main baseline 57 stale anchors; prerequisite 57; no new anchor problem.
  The global anchor gate remains red; none is called caught. Gameplay debt still needs resolution or a named ignore.
- `tests/data-integrity.mjs` initially found README missing the pre-existing `engine-mana-upkeep` and the new
  `sentence-paragraphs` suite names. Both names added; validation pending.
- Pre-push scans at `08e6c900` (integration) and `ae3bfd6f` (prerequisite): `local-ci: SCAN PASS`.
- Evidence logs live in `C:\Users\robmi\CrankMagic\worktrees\load100\scratch`; result lines are recorded here so the
  checkout is resumable without those scratch files.
- No pool games, independent card reviews, ability ledger, exercise totals, staging release, or Rob sign-off yet.

## The gates, measured

| Gate (README, "What 100% means") | At the start (2026-10-28, main `39a45706`) | Now |
| --- | --- | --- |
| G-1 Commander cards final | 6,430 defined of about 32,046; 25,616 undefined | Main baseline: 6,424 nonbasic pool finals of 32,040 raw pool cards, plus 6 basic definitions; 25,616 undefined. Wish exemptions not subtracted from raw counts. Unmet. |
| G-2 Candidates outstanding | 116 (compiler, live); 100 in the committed `candidates.json` | Main baseline reproduced: 116 candidates, 2 blocked. Unmet. |
| G-3 `check-cards` | 6,430 definitions, 11,023 scenarios, 0 failed | Main baseline reproduced. Ability coverage remains unproved; journal observability decision pending. Unmet. |
| G-4 Calibration failures | 4 of 4,165 (Blackblade Reforged, Contagion Clasp, Goblin Piledriver, Wayfarer's Bauble) | Main baseline reproduced. W4 reports 1 failure after its unintegrated fixes; integration and independent review pending. Unmet. |
| G-5 Pool fuzz, clean of games | the harness has no pool mode yet; library 3 of 3, staging decks 1 of 1 clean | V8 harness in progress; no final integrated pool-game result yet. Unmet. |
| G-6 Final cards exercised in a clean game | not measured (no ledger yet) | No measured clean-game coverage yet. Unmet. |
| G-7 Gameplay-gap list open items | section 4: 21 open, 5 unsure; section 5: 10 open; section 7: 10 open; section 8: 10 rows open, 4 partial (`README.md`, "Open accuracy debt") | Debt fixes in progress. Main's 57 pre-existing stale break anchors are named in `w0/preexisting-break-anchors.json`. Unmet. |
| G-8 Rob's playtest sign-off | none | None; only Rob can close this gate. |

## Waves

| Wave | Integration PR | Written | Promoted | Stopped | Checks (result lines) | Merged | Staging | Ignores added |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
