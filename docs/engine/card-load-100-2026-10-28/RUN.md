# The run's record: the card load to 100%

The orchestrator writes this after every wave (`ORCHESTRATION.md`, step 8). A fresh orchestrator resumes from it alone.
Newest wave first. Each line names its command's result line, never a summary of it.

## Where the run stands

- **Holder:** Codex resumed October 28, 2026, for Rob; Linear ROB-199 (run), ROB-200 (wave 0), under ROB-85.
  Rob requested W2/W3/W7 start, wave-0 completion, then continued loading without weaker gates.
- **Revised endpoint:** Rob explicitly chose **cards covering 95% of deck appearances**, not 95% of distinct names.
  Frozen `scope-95.json`: 8,514 names, including six basics; 527,373,351/555,122,162 appearances (95.0013%).
  Source graph September 11, played data September 19, Oracle October 4, 2026; exact hashes are in the manifest.
  Initial directory measurement at `5fc78a95`: 2,715 included finals, 5,799 undefined, zero wish exemptions in scope.
  `node tools/card-load-scope.mjs --check` passes; `--gate` correctly exits 1 with 5,799 missing. Two scope mutations
  caught, `missed: []`. G-1/G-2 now concern this fixed set; all accuracy/evidence requirements and the existing
  whole-directory ability gate remain. The least-played remaining appearances need not be loaded.
- **Main at the start:** `39a45706`.
- **Wave and step:** wave 0 is unfinished. Baseline, prerequisite reconciliation and five bounded role checkpoints are
  preserved; no new cards or promotions. W2/W3/W7 are now active in isolated worktrees. No gate or wave completion is claimed.
- **Integration:** `codex/engine-load100-w0`, worktree `C:\Users\robmi\CrankMagic\worktrees\load100\w0-integrate`.
  Package #911 and prerequisite #834 merged locally; eight debt lane files committed at `c9d31c40`.
  Draft integration PR #912: https://github.com/minorrob/mtg-deck-matrix/pull/912.
  Last root code checkpoint: `e7d00039` (paragraph prerequisite and four proved inherited-anchor repairs); subsequent
  record/readiness-command edits are documentation. No writer or verifier branch has been merged into integration.
- **Resumed root changes:** froze and checked the 95% appearance scope with an explicit failing final-definition gate;
  no engine runtime change. Re-anchored three more inherited mutations on the same original behaviors: new-table
  passStack default, front-door candidate report route, and the seated reconnect event floor. Each unbroken suite
  baseline passed and each selected break was caught, `missed: []`. Global anchors now have **50 inherited problems**;
  no gate acceptance is claimed. The new scope suite's two mutations were also caught.
- **Further anchor proof:** three deck-stage anchors now target the same stage/commander/substitute conditions after
  the over-size guard was added; all three caught. Three seated-ending anchors distinguish the later spectator view;
  all three caught after all original baseline suites passed. The `table-record` baseline had a false positive:
  `game:table:<matchId>:s1`, a public result id, matched its old seed-prefix assertion. The assertion now obtains the
  actual private seed from the match store and rejects it even inside wrapped strings. Existing hidden-field/card
  assertions stay; a new assertion preserves the public id. A mutation leaking the real seed inside a wrapped nested
  string is caught. No record runtime code changed. These six repairs leave **44 inherited anchor problems**.
- **Prerequisite:** original #834 remains open and conflicted on GitHub. Isolated reconciliation branch
  `codex/engine-load100-pr834` at `ba82617b` merges main and preserves paragraph boundaries alongside current
  castable-card spell segmentation. Integrated through `8c0566dc`. Full backstop validation exposed its inherited
  assertion that Gemstone Caverns must never be sampled; fixed to require sampling and successful scenario execution,
  with a mutation restoring the exclusion. The corrected full backstop suite passes in the mutation runner's baseline;
  both selected backstop breaks are caught, `missed: []`. The five paragraph breaks were also rerun and caught.
- **Lanes:** five clean, pushed bounded checkpoints are listed below; their remaining debts are queued, not waived.
  This session has three subagent slots, so the eight roles run in batches. Keep all eight roles separate; start the
  W2/W3/W7 are the current batch. Do not describe the earlier bounded checkpoints as complete themes.
- **Ownership:** the primary checkout has another session's unresolved merge and remains untouched. The old standing
  engine table predates Rob's direct October 28 assignment. At claim time no other active rule-module PR besides #834
  was listed. Re-check current work before `readDeck` edits. The monarch already has a canonical Engine-to-Play request
  (Requests row 1 in `docs/ACTIVE.md`); the card-load section reinforces it.
- **Toolchain:** Node `v22.23.3`; required dependency junctions created. Git Bash is
  `C:\Program Files\Git\bin\bash.exe`; Windows blocks its named-object initialization inside the sandbox, so the
  authorized scan runs with escalation. Network fetch/gh also requires escalation. W5's first export review was rejected;
  root verified the authorized remote/payload, rescanned, and published successfully. No approval remains pending.
- **Next:** W2/W3/W7 work from `5fc78a95`; W3 owns shared explicit resumable-choice operations before the other roles
  replace outside-resolution fallback choices. W2 owns copy/effect-cast target and Gandalf blocks; W3 owns movement,
  destruction, commander and MayPlay permission blocks; W7 owns draw/APNAP/dredge, dice and compiler blocks. Fresh
  fetch found main unchanged and no open PR touching `game/room/table.mjs`, clearing W2's narrow wish refusal.
  Finish all queued writer/verifier debts. Merge W1 through W7, then V8,
  regenerate once, and run the strict consolidated checks. Do not mark ready while the ability/anchor gates remain red.
- **Rob's decision, October 28:** "Allow the additional harness proof." V8 may supplement journal evidence with an
  in-memory ability-removal scenario proof; the safeguards and limits are in `BRIEF.md`. G-3 remains unmet until the
  evidence is measured. No saved card/rule instrumentation or schema/fidelity-only failure earns coverage.

| Role | Branch under `codex/engine-load100-` | Pushed head | Draft PR | State |
| --- | --- | --- | --- | --- |
| W1 faces | `w0-w1-faces` | `27182d42e9afa664dfccae8fb5dd878d6079d6a8` | #917 | Source `9c4366f7`; Elspeth and supported preparation copies; battles, undefined emblem cards and permanent-type insets queued |
| W2 stack | `w0-w2-stack` | Pending | — | Active from `5fc78a95`; copy/effect-cast targets, facedown exile, entry type choices, named wish refusals |
| W3 graveyard | `w0-w3-graveyard` | Pending | — | Active from `5fc78a95`; permissions, manifest, commander and explicit resumable replacements |
| W4 combat | `w0-w4-combat` | `9177d29baca191ce1bee7773a6851bfabef68df5` | #914 | Clean bounded checkpoint; five debts queued |
| W5 mana | `w0-w5-mana` | `79fe06c741a2d25f1c7c75ecf20e2810e4d07977` | #915 | Clean bounded checkpoint; five debts queued |
| W6 tokens | `w0-w6-tokens` | `5c927528f8c26adc3e4e0300001f320331fb9272` | #916 | Clean bounded checkpoint; three replacement-order debts queued |
| W7 spells | `w0-w7-spells` | Pending | — | Active from `5fc78a95`; draw order/replacements, dice, compiler played-card and trust gates |
| V8 verifier | `w0-v8-verify` | `1890c72f5bf4aac013d554fe5a9035f688b1df55` | #913 | Clean bounded harness/review checkpoint; coverage, strict-runner and final integration debts remain |

Worktrees are `C:\Users\robmi\CrankMagic\worktrees\load100\<branch suffix>`. Preserve their node_modules junctions;
do not delete through a junction. Every code/evidence checkpoint is pushed; read each lane JSON and PR body before
continuing it. A model taking a lane over uses the brief's prefix/suffix hand-off rule; integration stays on its current
branch. PR #834 and #911 are ancestors of integration only, not yet merged to main.
Final local audit: all six prerequisite/role worktrees have empty `git status --porcelain` and heads equal their remote
branches. W5's task-created diagnostics were preserved outside its worktree at
`C:\Users\robmi\CrankMagic\workbench\load100-w5-79fe06c7-diagnostics`; W1's are at
`C:\Users\robmi\CrankMagic\workbench\load100-w1-27182d42-diagnostics`. The primary checkout is still on
`codex/reconcile-893-20261026`, `32109d12`; main remains `39a45706`. No lane process is left running.

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

- **W1:** draft #917, source `9c4366f7`. Elspeth now creates an actual emblem; optional emblem effect `text` follows
  the existing sentence-template path, is retained as `emblemOracleText`, and projects one exact sentence while the
  legacy fallback preserves genuine repeated abilities. Supported token/physical-copy preparation definitions and
  entry designations propagate without copying prepared state; named copies, control changes and LKI are covered.
  Focused 79 checks; 23 unique mutations caught across the preparation and final text increments; `missed: []`.
  Preparation checkpoint full checker: 6,430 definitions, 11,025 scenarios, 0 failed. Final text increment: seven
  baseline suites plus affected projection/planeswalker readers pass. V8 independently reran 79 and a persisted
  +4/+4 variant under a different controller, checking both actual Bear power 6 and opponent-visible text.
  No browser visual acceptance or real-table playtest is claimed. Battles, permanent-type preparation insets, and
  undefined Daretti/Teferi emblem cards remain queued; no new final was added.
- **W6:** draft #916, pushed `5c927528`, source `6f2e915f`. Plumb's departed original is copied using bounded,
  departure-time memory; latest targets/modes/X/copied values survive countering, JSON reload and owner departure.
  Double-faced token copies preserve both faces/orientation without counters; physical single-faced copies do not
  become double-faced; illegal instant/sorcery opposite faces legally do nothing. Morph/disguise copies retain the
  correct nameless characteristics and Ward distinction without printed-face/preparation leaks in the copied token's
  three public views. Focused 90, 35 mutations caught (`missed: []`), 14 related readers; full checker 6,430/11,024/0.
  V8 independently countered the source, persisted/reloaded, copied under another controller, and resolved against the
  latest target with X/modes preserved. Three outside-resolution replacement-order rows remain queued.

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

## Authoritative initial ability audit and remaining verifier work

- Final V8 head: `1890c72f5bf4aac013d554fe5a9035f688b1df55`; code measured: `508afa94c70b00611e247d78adf23383d4403802`.
  Source is unchanged main `39a45706` card/scenario data plus the prerequisite; this is initial, not combined-writer,
  evidence. `6,430 definitions`; `11,023 scenarios, 0 failed`; `6,079 of 11,636` abilities reached by passing scenarios,
  including `1,840` runtime-removal proofs; `5,557` unreached across `3,665` cards; 0 over-budget probes. Expected exit 1.
- The provisional `0a848bb4` sweep overcredited seven spell abilities through ambiguous face-name ownership. Corrected
  lookup rejects ambiguous aliases, including exact standalone names colliding with preparation halves; denominator
  unchanged. Mixed game/scenario evidence also cannot manufacture scenario reachability: a successful-resolution
  observation must itself name a scenario, or a valid runtime-removal proof must exist. Historical artifacts are
  separately labeled; do not reuse their provisional 6,086/5,550 totals.
- Corrected raw ledger SHA-256: `60bda8067fcb6acaf2e28b7987dbd8807182d40464a95bfc1fe6d1e6155f2532`.
  Full ledger is compressed to 1,474,426 bytes, with independent raw/archive hashes and completed-measurement checks.
  On the V8 branch, read `w0/V8-PROOF.md` and
  `w0/evidence/ability-corrected-508afa94.manifest.json`; use the readable `.summary.json` and `.backlog.json` narrowly.
  Paths are under this package. Fetch/read `origin/codex/engine-load100-w0-v8-verify` if its worktree is unavailable.
- Initial missing proofs by theme: combat 1,954; spells 1,396; mana 912; tokens 486; graveyard 481; faces 238; stack 75;
  walkers 15. Large shared witness families include Flying, trample, vigilance, enters-tapped, enchant and haste.
  A family name or equivalence is not coverage; every ability still needs its own recorded evidence.
- V8 validation: pool 91, ability proof 42, library 12, data-integrity, feature-wiring 131; 35 incremental verifier and
  19 ability mutations caught, `missed: []`. Every bounded writer change was independently reviewed; no full-theme
  or all-past-card review is claimed.
- Legacy no-flag checker and automatic CI do not enforce ability coverage. ORCHESTRATION check 1 now requires the
  full `--ability-ledger ... --counterfactual` run and a completed whole-directory ledger with 0 unreached, plus exit 0
  and 0 scenario failures. Merge V8 first; ignored/unknown flags or a missing ledger cannot pass. This initial audit
  fails G-3 and cannot be omitted to mark the wave ready.
- Still unbuilt/unrun: strict scenario diagnostics/default transition, skipped/frozen room-game seeds, replaced pilot
  answers, partial construct coverage credits, the five unsure gameplay cases, all-card independent review, integrated
  200 pool games, strict library 50 and strict staging 2 by 25 runs, final all-card exercise, and G-5's 5,000 games.

## Resume priorities and shared-file seams

1. Read/claim this record, fetch, then start W2/W3/W7 with fresh subagents and their committed debt files. The session
   supports three concurrent subagents, not eight at once. Verify the current lane owners before edits.
2. W2 must implement Rob's named wish-deck refusals and stack/retargeting debt. Neither wish card is written. W3 owns
   graveyard/remembered-object work and should coordinate a serializable resumable operation outside script resolution
   before the W4/W5/W6/W7 replacement fallbacks are removed. Current token/counter creation and entering replacements
   cannot pause safely there; changing which default wins is not a fix.
3. Finish W1 battles/permanent insets; W4's five combat debts; W5's five mana/cost/payment-cap debts; W6's three ordering
   debts; and remaining V8 work. The exact itemized state is in each lane JSON and draft body. None is an agreed ignore.
4. Merge W1 through W7, then V8, with merge commits. Preserve W1's preparation fields alongside W6's MDFC token and
   copied-spell metadata in `permanents.mjs`; physical copies must stay distinct. Preserve W6's narrow spell-departure
   hooks in zones/stack/SBA while adding W3's real choice continuations. Re-run both sides' mutation proofs on conflicts.
5. Regenerate generated card/candidate/coverage/catalog/inventory files once, as the procedure says. They deliberately
   remain out of the bounded writer commits; do not call the hand-written JSON proof a current table-bundle proof.
6. Repair the remaining 53 inherited anchors without retargeting/weakening tests, repeat moved-anchor proofs after
   integration, run every consolidated gate including strict ability coverage, then one Actions run. Main merge and
   staging remain gated; production/migrations/provider calls remain forbidden. Rob alone closes G-8.

## The gates, measured

| Gate (README, "What 100% means") | At the start (2026-10-28, main `39a45706`) | Now |
| --- | --- | --- |
| G-1 Commander cards final | 6,430 defined of about 32,046; 25,616 undefined | Main baseline: 6,424 nonbasic pool finals of 32,040 raw pool cards, plus 6 basic definitions; 25,616 undefined. Wish exemptions not subtracted from raw counts. Unmet. |
| G-2 Candidates outstanding | 116 (compiler, live); 100 in the committed `candidates.json` | Main baseline reproduced: 116 candidates, 2 blocked. Unmet. |
| G-3 `check-cards` | 6,430 definitions, 11,023 scenarios, 0 failed | Corrected initial code `508afa94`: 6,079/11,636 reached; 5,557 unreached, expected exit 1. Selected W4 additions prove 4/4 on 3 cards only. Strict consolidated coverage is mandatory; default/CI wiring remains open. Unmet. |
| G-4 Calibration failures | 4 of 4,165 (Blackblade Reforged, Contagion Clasp, Goblin Piledriver, Wayfarer's Bauble) | W4 `8e0f3a2f`: 4,165 held out, 4,165 pass, no denominator exclusions. Writer changes independently reviewed; all past loads and final integration remain unreviewed/unmeasured. Full G-4 unmet. |
| G-5 Pool fuzz, clean of games | the harness has no pool mode yet; library 3 of 3, staging decks 1 of 1 clean | Initial 3/3 app-finished pool runs clean, of which 1 reached a winner; final integration and 5,000 games unmet. |
| G-6 Final cards exercised in a clean game | not measured (no ledger yet) | Initial 131/6,430 final definitions exercised in 3 app-finished clean runs. Unmet. |
| G-7 Gameplay-gap list open items | section 4: 21 open, 5 unsure; section 5: 10 open; section 7: 10 open; section 8: 10 rows open, 4 partial (`README.md`, "Open accuracy debt") | Debt fixes in progress. Main baseline's 57 stale break anchors are named in `w0/preexisting-break-anchors.json`; root re-anchored/proved four, leaving 53 on integration. Unmet. |
| G-8 Rob's playtest sign-off | none | None; only Rob can close this gate. |

## Root's inherited-anchor repair

`breaks-libload-l4-combat.py`, "requirement checked", still pointed at a former one-line blocker-requirement guard.
The same guard now opens a block that also reports each affected attacker. Root re-anchored the mutation to disable
that exact conditional; it tests the same requirement, with no assertion change or retargeting.

- `python -u game/tools/batch/breaks.py game/tools/batch/breaks-libload-l4-combat.py "requirement checked"`:
  `baseline: every suite passes unbroken`; `caught requirement checked -- tests/engine-libload-l4-combat.mjs`;
  `missed: []`. Combat source restored exactly after the probe.
- `python game/tools/batch/anchors.py`: 56 remaining problems, down from the measured 57; the global gate remains red.
- Three further exact re-anchors preserve the original contracts, with no assertion change:
  - `breaks-combat-words.py`, "the seat's view keeps the engine's words": remove `combatWords` inside the new
    `describeDecision` wrapper; `caught ... -- tests/room-combat-words.mjs`; `missed: []`.
  - `breaks-train-d-c.py`, "each option's controller": the same `controllerId` option fact moved into the shared
    `targetFacts` helper; `caught ... -- tests/engine-target-constraints.mjs`; `missed: []`.
  - `breaks-first-draw-step.py`, "the host's choice not saved": the same `skipFirstDraw` setting now precedes more
    saved settings; `caught ... -- tests/game-table.mjs`; `missed: []`.
- All three mutation runners first reported `baseline: every suite passes unbroken`. Final `anchors.py`: 53 remaining
  problems. No source file or backup was left mutated. No UI behavior or test assertion was changed.
- Repeat this moved-anchor proof after final writer integration, as the procedure requires.

## Waves

| Wave | Integration PR | Written | Promoted | Stopped | Checks (result lines) | Merged | Staging | Ignores added |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| 0, in progress | #912 | 0 | 0 | 0 | Prerequisite and bounded lane evidence above; consolidated gates not run | No | No | 0; queued debt is not waived |
