# Handoff: Claude · Deck intelligence, October 18, 2026 (the lane's record, and the next session's start)

From the Claude · Deck intelligence session (a cloud container, the second Claude session of the program) to the
session Rob assigns to this lane next. Rob, 2026-10-18 late: *"complete the work you're actively on, then prepare to
close out the session and prepare a session handoff, and update Linear."* Linear: the issues under the label
**Claude · Deck intelligence**; the engine seam on **ROB-11**. Coordination rules: `AGENTS.md`, then
`docs/ACTIVE.md` (the lanes table and the Requests table), then `docs/program/workstreams/claude-deck.md`.

Read those three first, as every session does here. This file adds only what this lane's next session needs.

## 1. The branch and commit this describes

- **Base:** `main` at **120efaf1** (#775 merged, 2026-10-18 evening). Every branch this lane opened is merged; none is
  open. Start a new branch of your own, `claude/deck-<topic>`, never one of the merged ones.
- **The lane's files on main** (the charter's §3 table): `deck-composition.js`, `deck-synergies.js`,
  `card-resolve.js`, `commander-legality.js`, `deck-criteria.js`, `buy-plan.js`, `compliance-report.js`,
  `swap-record.js`, `tools/sim/reasonableness.mjs`, the simulator (`sim-engine.js`, `deck-measure.js`,
  `crankmagic-sim.js`, `sim/opponents.json`), their fixtures under `tests/fixtures/`, their suites, their breaks files
  under `game/tools/batch/breaks-*.py`, the data files `data/commander-banned.json`, `data/vendors.json`,
  `data/commander-brackets.json` with their schemas, `docs/engine/sim-model-audit.md`, and the readout
  `docs/readout/` (the page, `north-star.json`, this lane's feed `feeds/claude-deck.json`, `snapshots/`).
- **Suites:** the README says 533 and 533 exist at 120efaf1. Whoever merges second sets the count
  (`tests/data-integrity.mjs`); it drifted twice today and each of this lane's merges restated it.

## 2. What was done today, and the proof

Every model shipped the same way: a pure UMD function (Node and the browser from one file), a fixture, a suite, a
breaks file that ends `missed: []`, evidence on the Linear issue, the feed updated at the merge.

| Issue | What | PR, merge | Proof on main |
| --- | --- | --- | --- |
| ROB-138 | The program readout: page, north star, five feeds | #740 | `tests/readout-feeds.mjs` |
| ROB-114 | `deck-composition.js` `compose()`: roles against targets by bracket and playstyle, objectives named | #749, 40e5ddcb | `tests/deck-composition.mjs`, `breaks-deck-composition.py` |
| ROB-115 | `deck-synergies.js`: pairs, chains, one-card completions | #750, 06a22909 | `tests/deck-synergies.mjs`, `breaks-deck-synergies.py` |
| ROB-131 | `card-resolve.js` `createResolver()`: a line to one card with its confidence; 178 of 200 real lines offline, none wrong | #752, 5dbdf75b | `tests/card-resolve.mjs` (63), `breaks-card-resolve.py` (5) |
| ROB-104 | `commander-legality.js` `check()`: size, commander, pair, banned, identity, singleton; `data/commander-banned.json` dated | #753, 41997462 | `tests/commander-legality.mjs` (177), `breaks-commander-legality.py` (11) |
| ROB-119 | `buy-plan.js` `buyPlan()`: printing, vendor, bundle, the trade-off said; `data/vendors.json`; `tools/printings-snapshot.mjs` | #758, 0fc6d6ff | `tests/buy-plan.mjs` (63), `breaks-buy-plan.py` (6) |
| ROB-111 | `compliance-report.js` `report()` and `ladder()`: each bracket rule, status, cards, swaps offered, never enforced; `data/commander-brackets.json` dated | #759, 53090ccd | `tests/compliance-report.mjs` (52), `breaks-compliance-report.py` (7) |
| ROB-109 | `deck-criteria.js` `buildFromCriteria()` and `suggestCommanders()`: a hundred with a reason per slot | #757, f96d4a99 | `tests/deck-criteria.mjs` (154), `breaks-deck-criteria.py` (7) |
| ROB-117 | `swap-record.js` `record()`, `withMeasurement()`, `rank()`, `measureTop()`: evidence, delta, measured gain only when one exists | #760, ec8cba20 | `tests/swap-record.mjs` (35), `breaks-swap-record.py` (6) |
| ROB-112 | `tools/sim/reasonableness.mjs`: the builder's decks against EDHREC, the precons and Rob's own; `docs/program/reports/reasonableness-2026-10-18.{md,json}` | #761, 939f2609 | `tests/reasonableness.mjs` (50), `breaks-reasonableness.py` (2) |
| ROB-84 | `docs/engine/sim-model-audit.md`: the three claims, the shared code, the sixteen simplifications, each score's variance, the stale sentences | #762, 27a23b0e | no code changed |
| ROB-116 steps 3 and 1 | `measure()` returns `winRateSe`, `perSeedWinRates`, spells per game, biggest turn, end-turn counts; the pack carries `winRateStandardError`; `simplificationsFor(cards)` labels each simplification with the cards it touches, on the result and in the pack's limits | #764, e074d8d1 | `tests/deck-measure.mjs` (8, parity on the six published decks), `tests/crankmagic-sim.mjs` (42), `tests/sim-engine.mjs`; `breaks-sim-variance.py` (3), `breaks-sim-labels.py` (3) |
| readout | The feed closed out; the first snapshot `docs/readout/snapshots/2026-10-18.html` (feeds inlined, reconciled with Linear) | #768, #772 | `tests/readout-feeds.mjs` |

Linear carries a Done comment with the merge commit on each issue. Project status updates were posted on Deck
creation, Deck tuning, Buying and AI in action (the last at risk only because everything after card resolution sits
behind the AI door, ROB-95).

## 3. Assumed, not proved

- The win rate's between-seed error is proved on three-seed runs; the published six-seed figures in
  `data/deck-ratings.json` were not re-run today (parity of the scores held, so nothing moved).
- The reasonableness finding (0 to 12% overlap with EDHREC, 3 to 18% of the most-played cards) is measured on the
  snapshot `tests/fixtures/edhrec-reference.json` of 2026-10-18; it is a finding for Rob's popularity-dial decision,
  not a defect.
- `simplificationsFor` labels; it removes nothing. The five it marks removable (counters moved, tutors, tokens as
  bodies, fetch lands, reminder-text keywords) are the next formula change and come with the calibration (step 2) to
  measure them against, never before it.
- The snapshot's reconciliation rules (Linear's Done and In Progress win over a feed; blocks whose blockers merged are
  lifted) are the readout keeper's judgment, stated in the snapshot's banner. The live page still reads each feed as
  its lane wrote it.
- The Cloudflare "Workers Builds" preview checks fail in the same second on every pull request of every lane. It is
  Cloudflare-side configuration; a note was left on each PR. The gate is the `suites` job.

## 4. Outstanding, in this lane, in order

1. **ROB-116 step 2, the calibration harness,** when the engine lane lands `playPod({pod, seeds, cards, turnLimit})`
   (Requests row 1 in `docs/ACTIVE.md`; asked on ROB-11). The audit's §7 says what to compare: distributions (turn of
   first lethal attack, mana by turn, cards drawn) on the six live decks' defined subsets, not scores. Then the five
   removable simplifications, each with its own regression. Then the `docs/program/reports/` calibration report.
2. **ROB-121, prices on a schedule with their age,** when Rob says go (the ask is in the feed: a GitHub Actions cron,
   R2 only if the snapshot outgrows the repository).
3. **ROB-123, the builder and advisor honor deck preferences,** when the Workshop's Preferences › Decks card (ROB-122)
   exists; `buildFromCriteria` already takes `mustInclude`, `neverInclude`, `ownedFirst`, playstyles, budget, bracket.
4. **ROB-128, 130, 129, 132, the AI features,** when the AI door opens (ROB-95); the facts they read are on main.
5. **The readout,** at every merge: this lane's feed; a snapshot when Rob asks for the whole program's status.
6. **ROB-137, the launch checklist,** waits on Rob's approval of `docs/program/LAUNCH-CHECKLIST.md`.

## 5. Waiting on others; decisions for Rob

- **Engine lane:** `playPod` (Requests row 1); the one stale sentence in `game/engine/index.mjs:21` (noted on ROB-11).
- **Codex · Workshop:** ROB-110, 113, 118 and 105 were unblocked today by this lane's merges; the function
  signatures are in comments on each issue. ROB-122 unblocks ROB-123.
- **Rob:** the popularity dial (ROB-109); the AI door's two settings (ROB-95); the scheduled price refresh (ROB-121);
  the launch checklist (ROB-137); the game's name (ROB-139); cancel or re-scope ROB-16; a Mobbin login or an export
  for the Grok worker on ROB-61; the Cloudflare preview-build configuration.

## 6. What changed around you today

- The engine lane merged events.v1 (ROB-77), round and turn (ROB-76), block drafts (ROB-75) and the room's socket
  frames; it wrote the repo-steward handoff (`docs/handoff-steward-2026-10-18.md`, ROB-143), whose trim will move
  `docs/ACTIVE.md`'s history, this lane's sections included, to `docs/history/` inside a posted freeze window.
- Another Claude session merged card status (Use, Ownership, Play) and budgets (#777, #779) in the Workshop's files,
  with `tests/budgets.mjs` reading `data/cards.json` and `data/live-state.json`.
- Codex · Play merged the shared shell (ROB-99 slice 1) and the Table camera fix (ROB-97); its phone and Babylon
  PRs are drafts awaiting Rob's screenshot choices.
- Grok opened a second package of worker branches (`grok/o2-buy-dial`, `o4-add-cards-paste`, `o5-play-prefs`,
  `o6-commander-tax`); the paste path calls `card-resolve.js` read-only. Its October 18 report is on PR #763.
- main went to staging and production at 5f6ea9cc (ACTIVE's 2026-10-18 release section).

## 7. Pitfalls met today, so the next session does not meet them

- **The README suite count.** The merge ref of a PR counts main's suites plus the branch's; a branch that adds a suite
  sets main's count plus one, and when several branches queue, chain them in merge order (merge the previous branch
  in, set the count, regenerate `data/manifest.json` then `docs/data-inventory.md`, in that order). The scratch
  script that did it is not in the repository; the steps are in the merge commits of #749 to #761.
- **Served-file pins collide.** Two lanes bumping `crankmagic-sw.js` and `crankmagic-app.js` on the same day reached
  the same numbers with different content; after merging main, take main's pins and run the cascade again
  (`node tools/bump-pins.mjs <files>`, then `node tests/asset-versions.mjs --update` until it records). A merge that
  takes main's service worker drops this branch's pins in it; `tests/asset-versions.mjs` names the file fetched under
  two versions.
- **Generated pages:** `node tools/data-manifest.mjs` first, `node tools/data-inventory.mjs` second; the other order
  re-stamps the manifest. Every tool with `--check` must be in `tests/generators.mjs`'s CHECKABLE list.
- **`tests/refresh.mjs`** pins the refresh steps' order and requires every step's file be served with `?v=`; a new
  data file that no page serves gets no refresh step.
- **Honest counts in commit messages.** Three messages today overstated check or break counts and needed follow-up
  commits. Run the suite, read the number, then write it; never pipe a suite through `tail`, gate it with
  `>/dev/null && echo ok`.
- **The Write tool turns `\uXXXX` into the character.** Unicode escapes in a regex must be written literally in the
  file (`̀-ͯ`) and checked after writing.
- **`node -e` with apostrophes breaks the shell.** Put scripts in the scratchpad as `.mjs` files.
- **CI success events are not delivered** to a watching session, failures and merges are. Keep a timed check-in
  (about 50 minutes after a push) and re-check the PR's check runs yourself.
- **Feeds conflict on merge** when two of this lane's branches carry the same feed; resolve to the newer copy and
  reapply the newer statuses.

## 8. The next session's start

```
# Claude · Deck intelligence — STATE
Updated: 2026-10-18 · Progress: the lane's order of work through ROB-112 is on main; ROB-116 at step 2 of 3
Next: ROB-116 step 2 when playPod lands (watch ROB-11 and ACTIVE's Requests row 1); until then nothing in this lane
      can move without Rob or another lane. Open: docs/engine/sim-model-audit.md §7, tools/sim/reasonableness.mjs
      (the shape a calibration report should follow), docs/program/workstreams/claude-deck.md §4.
Captured:
- 2026-10-18 — eleven lane PRs merged (#740, #749, #750, #752, #753, #757, #758, #759, #760, #761, #762, #764), the
  feed closed out (#768), the first readout snapshot (#772); Linear Done on 11 issues with merge commits; four
  project status updates; the engine ask (playPod) on ROB-11 and in ACTIVE's Requests table.
Current state: every model the lane owns is a pure UMD function on main with fixtures, a suite and a breaks file;
  the simulator reports the win rate's error and labels its simplifications per deck; the readout reads main.
Open questions:
- Rob: popularity dial (ROB-109), AI door (ROB-95), price cron (ROB-121), checklist (ROB-137), ROB-16, ROB-61.
- Engine: playPod; the stale sentence in game/engine/index.mjs:21.
```

The kickoff prompt for the next session of this lane:

> You are Claude · Deck intelligence. Read `AGENTS.md`, `docs/ACTIVE.md` (the lanes table and the Requests table),
> `docs/program/workstreams/claude-deck.md` and `docs/handoff-deck-intelligence-2026-10-18.md` first, and claim the
> lane in `docs/ACTIVE.md`. Check ROB-11 and Requests row 1 for `playPod`; if it has landed, do ROB-116 step 2 as one
> PR on `claude/deck-calibration`, per `docs/engine/sim-model-audit.md` §7. If it has not, pick the first item of
> §4 of the handoff that is unblocked, or say so and stop. Read narrowly. Every model ships as a pure UMD function
> with fixtures, a suite and a breaks file; the feed at every merge; material UX or north-star changes surface to Rob.
