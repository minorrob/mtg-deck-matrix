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
  `codex/engine-load100-pr834` at `ba82617b` merges main and preserves paragraph boundaries alongside current
  castable-card spell segmentation. Integrated through `8c0566dc`. Full backstop validation exposed its inherited
  assertion that Gemstone Caverns must never be sampled; fixed to require sampling and successful scenario execution,
  with a mutation restoring the exclusion. The corrected full backstop suite passes in the mutation runner's baseline;
  both selected backstop breaks are caught, `missed: []`. The five paragraph breaks were also rerun and caught.
- **Lanes:** V8 `codex/engine-load100-w0-v8-verify` at pushed `0a848bb4` (draft #913) has the approved proof
  supplement and measuring initial full-directory coverage. W4 combat at pushed `9177d29b` (draft #914) and W5 mana at
  pushed `79fe06c7` (draft #915) are clean bounded checkpoints with their remaining debts explicitly queued.
  W1 faces and W6 tokens are active in their own worktrees; W2/W3/W7 remain queued. This session has three subagent
  slots, so all eight roles remain separate and run in batches. No lane is complete.
- **Ownership:** the primary checkout has another session's unresolved merge and remains untouched. The old standing
  engine table predates Rob's direct October 28 assignment; current open PRs were checked. No active engine-rule PR
  besides #834 was listed. `readDeck` overlap remains a narrow coordination request; the monarch is Play's request.
- **Toolchain:** Node `v22.23.3`; required dependency junctions created. Git Bash is
  `C:\Program Files\Git\bin\bash.exe`; Windows blocks its named-object initialization inside the sandbox, so the
  authorized scan runs with escalation. Network fetch/gh also requires escalation. No approval review rejection.
- **Next:** complete W1/W6 and V8's approved coverage measurement, then start W2/W3/W7 with fresh roles as slots free.
  Finish the remaining W4/W5 debts. Merge writers W1 through W7, then V8, into integration; regenerate once and run
  the consolidated gates. No writer branch is merged into integration yet. Do not claim a gate from package history.
- **Rob's decision, October 28:** "Allow the additional harness proof." V8 may supplement journal evidence with an
  in-memory ability-removal scenario proof; the safeguards and limits are in `BRIEF.md`. G-3 remains unmet until the
  evidence is measured. No saved card/rule instrumentation or schema/fidelity-only failure earns coverage.

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
- `python -u game/tools/batch/breaks.py game/tools/batch/breaks-card-backstop.py "a spell half written"
  "sample includes complete unfinished abilities"`: `baseline: every suite passes unbroken`;
  `caught sample includes complete unfinished abilities -- tests/engine-compile.mjs`;
  `caught a spell half written -- tests/sentence-paragraphs.mjs`; `missed: []`.
- `node tests/card-waves.mjs`: `card-waves: 22 checks passed`.
- `node tests/feature-wiring.mjs`: `feature-wiring: 131 checks passed`.
- `python game/tools/batch/anchors.py`: main baseline 57 stale anchors; prerequisite 57; no new anchor problem.
  The global anchor gate remains red; none is called caught. Gameplay debt still needs resolution or a named ignore.
- `tests/data-integrity.mjs` initially found README missing the pre-existing `engine-mana-upkeep` and the new
  `sentence-paragraphs` suite names. Both names added; rerun exit 0, `Validated 50 variants and 50 connected buy profiles.`
- Pre-push scans at `08e6c900` (integration) and `ae3bfd6f` (prerequisite): `local-ci: SCAN PASS`.
- Evidence logs live in `C:\Users\robmi\CrankMagic\worktrees\load100\scratch`; result lines are recorded here so the
  checkout is resumable without those scratch files.
- No final integrated pool run, completed independent card review, complete ability ledger, staging release, or Rob sign-off yet.

## First lane checkpoints (not final integration evidence)

- **V8:** first pushed `ae7e22ba`, then parser follow-up `8acb3213`, draft PR #913 into #912's branch. Pool suite 64 checks, library suite 12,
  feature-wiring 131, data-integrity, 28 mutation breaks caught (`missed: []`), SCAN PASS. Seed-parser review found
  whitespace, truncated ranges, and unsafe integer inputs; V8's follow-up passes 73 pool checks and two affected
  parser breaks. Exact empty and reversed ranges were already rejected; root's initial contrary inference from a
  truncated diff was corrected after reading the full committed function.
- **Initial pool baseline on V8's branch:** seeds 1-3, normal house pilots plus person seat 0; 3 of 3 finished clean,
  no human or AI refusals, replays identical, 0 leaks over 273 checks. 131 of 6,430 finals exercised; 47 of 11,636
  inventoried abilities have successful-resolution event evidence. This is not G-5's 5,000 games or full G-6 coverage.
  Seeds 1 and 3 ended when the only person was eliminated, with three AI seats still playing and no winner; seed 2
  reached a last-player-standing winner. The first two prove clean app termination and the played prefix, not a full
  four-player match to a winner. Exact result objects are in `w0/initial-pool-seeds-1-3.json`.
- **V8 proof method:** two guard mutation attempts were interrupted and restored after invalid difficulty testing
  could enter standalone room setup. The harness had no provider transport and made no model API call. Invalid-level
  CLI tests were removed; an exported pure validator is now tested without any game creation. Safe rerun: 28 caught.
- **W4:** pushed final checkpoint `9177d29b`, draft #914. Sentence-slot fixes, single-blocker trample choice, explicit scenario inputs;
  11 mutation breaks caught, 29 combat reader suites plus data-integrity/feature-wiring pass. Fresh full check-cards:
  `6430 definitions`; `11023 scenarios, 0 failed`. Full `tests/sentence-library.mjs` on code checkpoint `8e0f3a2f`:
  `77 checks passed`; `4165` held out, `4165` passed original scenarios, with no denominator exclusion. V8 independently
  reproduced its two-target counterexample fixed and reviewed chosen trample overassignment/lethal constraints.
  Later commit `ae4d6ba6` adds two actual behavior scenarios, retaining all old expectations. V8's independent selected
  ledger: Thran Dynamo, Glorious Anthem, Serra Angel; 3 definitions, 5 scenarios, 0 failed; 4/4 abilities reached by
  runtime removal, 0 unreached. No clean-game exercises credited by that proof. Artifact is committed on W4 at
  `w0/ability-depth-W4-sample.json`; both changed cards' held-out calibrations pass. Five other W4 debts remain queued.
- **W5:** pushed final evidence `79fe06c7` (code `8e6f5b5e`), draft #915. Saga exact-cost selector, Phyrexian/monohybrid convoke, full-pool dealer;
  20 mutation breaks caught, focused mana 36, pool 16, existing convoke 43, selected engine suites pass. Fresh full
  check-cards: `6430 definitions`; `11025 scenarios, 0 failed`. V8 independently probed mixed convoke/life, snow and
  insufficient-life cases; no new finding in this bounded scope. Generated Saga definitions and inventory remain for
  consolidated regeneration. Local-only regenerated table-basics: 6 checks and all 11,025 scenarios passed, followed
  by exact restoration of the previously clean generated file. Other W5 debt remains queued.
- **W5 approval review:** its first push/draft creation was rejected as an unverified code export. Root verified the
  exact HTTPS remote (no embedded credentials), all 12 authorized card-load paths, the full commit SHA, Rob's attached
  push/draft instruction, and independently reran SCAN PASS on that SHA. Root's bounded publish then succeeded:
  #915. No user action remains for that resolved review block.
- Initial exercise evidence is archived as `w0/initial-exercised-summary.json` (133 observed card records, of which
  131 exercised; unlisted cards remain unobserved). The complete scratch ledger and seed JSON are hashed there so
  their provenance is checkable. These are initial summaries, not the final all-card exercised ledger.
- No staging release, main merge, full-pool coverage, complete ability coverage, or Rob playtest sign-off yet.

## The gates, measured

| Gate (README, "What 100% means") | At the start (2026-10-28, main `39a45706`) | Now |
| --- | --- | --- |
| G-1 Commander cards final | 6,430 defined of about 32,046; 25,616 undefined | Main baseline: 6,424 nonbasic pool finals of 32,040 raw pool cards, plus 6 basic definitions; 25,616 undefined. Wish exemptions not subtracted from raw counts. Unmet. |
| G-2 Candidates outstanding | 116 (compiler, live); 100 in the committed `candidates.json` | Main baseline reproduced: 116 candidates, 2 blocked. Unmet. |
| G-3 `check-cards` | 6,430 definitions, 11,023 scenarios, 0 failed | Main baseline reproduced. Supplemental runtime proof works: selected 3 cards, 5 scenarios, 4/4 abilities reached. Full initial directory measurement on V8 `0a848bb4` running; legacy default does not enforce it. Unmet. |
| G-4 Calibration failures | 4 of 4,165 (Blackblade Reforged, Contagion Clasp, Goblin Piledriver, Wayfarer's Bauble) | W4 `8e0f3a2f`: 4,165 held out, 4,165 pass, no denominator exclusions. Writer changes independently reviewed; all past loads and final integration remain unreviewed/unmeasured. Full G-4 unmet. |
| G-5 Pool fuzz, clean of games | the harness has no pool mode yet; library 3 of 3, staging decks 1 of 1 clean | Initial 3/3 app-finished pool runs clean, of which 1 reached a winner; final integration and 5,000 games unmet. |
| G-6 Final cards exercised in a clean game | not measured (no ledger yet) | Initial 131/6,430 final definitions exercised in 3 app-finished clean runs. Unmet. |
| G-7 Gameplay-gap list open items | section 4: 21 open, 5 unsure; section 5: 10 open; section 7: 10 open; section 8: 10 rows open, 4 partial (`README.md`, "Open accuracy debt") | Debt fixes in progress. Main baseline's 57 stale break anchors are named in `w0/preexisting-break-anchors.json`; root re-anchored/proved one, leaving 56 on integration. Unmet. |
| G-8 Rob's playtest sign-off | none | None; only Rob can close this gate. |

## Waves

## Root's inherited-anchor repair

`breaks-libload-l4-combat.py`, "requirement checked", still pointed at a former one-line blocker-requirement guard.
The same guard now opens a block that also reports each affected attacker. Root re-anchored the mutation to disable
that exact conditional; it tests the same requirement, with no assertion change or retargeting.

- `python -u game/tools/batch/breaks.py game/tools/batch/breaks-libload-l4-combat.py "requirement checked"`:
  `baseline: every suite passes unbroken`; `caught requirement checked -- tests/engine-libload-l4-combat.mjs`;
  `missed: []`. Combat source restored exactly after the probe.
- `python game/tools/batch/anchors.py`: 56 remaining problems, down from the measured 57; the global gate remains red.
- Repeat this moved-anchor proof after final writer integration, as the procedure requires.

## Waves

| Wave | Integration PR | Written | Promoted | Stopped | Checks (result lines) | Merged | Staging | Ignores added |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| 0, in progress | #912 | 0 | 0 | 0 | Prerequisite and bounded lane evidence above; consolidated gates not run | No | No | 0; queued debt is not waived |
