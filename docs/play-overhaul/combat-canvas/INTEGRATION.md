# Wave 1 integration: what each worker hands the integrator, and how it lands on `main`

**Rob, 2026-11-01:** one session (the integrator, Fable 5.1 on Claude Code desktop, Personal-HP) handles ROB-351 and then
*"the combination of each other session's outputs into a series of PR merges all done by this one session."* This file is
the contract between the four wave-1 workers (F0a ROB-361, F0b ROB-362, F0c ROB-363, F1 ROB-364) and that session.
Workers never merge. `AGENTS.md` wins wherever the two disagree; `README.md` in this folder holds the invariants and the
constants; `PROMPTS.md` holds the words each session was started with.

## (a) The output a worker hands over, exactly

One PR per issue, and nothing else is read as a handoff. The integrator starts its checklist only when every item below
is there; a PR missing one is sent back with a comment naming it (section e).

1. **One PR per issue**, from a branch named `<agent>/rob-36x-<topic>` cut from `origin/main`, opened as a draft at the
   first commit, title starting with the key: `ROB-361: …`.
2. **The body in the README's handoff shape** ("The handoff (the PR body, kept current)"): the branch and sha; wave and
   lane; *Proven* as claim-and-command pairs; *Assumed / unproven* with the reason; *Outstanding* with the reason; *Seams
   used / filed*; *Superseded documents noted*.
3. **The suite commands and their output, pasted** into the body: every suite the feature file's "Proof" names, and the
   universal ones (`tests/a11y-board.mjs`, `tests/board-flat-views.mjs`, the no-leak harness, `tests/feature-wiring.mjs`),
   each as the command and its last lines (`N checks passed`, or the suite's own closing line), run on the PR's head sha.
   A suite that was watched failing first says so with the failing line it showed.
4. **The mutation runner's result**: `python3 -u game/tools/batch/breaks.py game/tools/batch/breaks-<feature>.py`, with
   its closing `missed: []` pasted. A breaks file's suites must be green unbroken first (the runner stops otherwise), and
   `node tests/engine-breaks-anchors.mjs` must report no more stale anchors after the PR than before it (it is red on
   `main` today, ROB-250; the PR body states both counts).
5. **The cross-model review, named**: which model and harness ran `.claude/skills/review-before-ready/SKILL.md` on the
   diff (a model other than the one that wrote it: Rob's requirement on each issue), what it found (file and line, the
   failure it causes, severity), and what was fixed or answered. "Reviewed by the same model" is not a review.
6. **`origin/main` merged into the branch** as a merge commit (never a rebase or a force-push), after the last code
   change, and the suites in 3 green on the merged tree.
7. **The PR marked ready**, which starts the sharded Actions run (eight jobs; drafts do not run). The worker watches the
   run and fixes any red that is its own; a red suite from the list in section (f) is not its own and is named, not fixed.
8. **A Linear comment on the issue**, verbatim: `Ready for integration: PR #<n> at <sha>`, where `<sha>` is the full sha
   of the head the Actions run ran. A new push after that comment needs a new comment with the new sha.

A worker that must stop before done pushes everything and sets the issue to Todo with `Handed off: <state>; next step
<x>; branch <b>; PR <n>` (the one-loop skill, step 7); the integrator does not pick a handed-off PR up as a handoff.

## (b) The merge order, and why

| Order | PR | Why |
| --- | --- | --- |
| Any | F0a (ROB-361), F0b (ROB-362), F0c (ROB-363) | Three lanes that share no code file (`game/room/events.mjs`; the option builder in `game/engine/rules/combat.mjs` and `game/room/decision.mjs`; `game/room/room.mjs`). Each merges when its checklist passes, in the order they become ready. |
| Last | F1 (ROB-364) | It reads F0a's `step` markers. It merges only after F0a is on `main` **and** the F1 branch has merged that `main` (a merge commit) and its suites are green on the merged tree. Until then F1 builds against F0a's written contract with a fixture, as its file says. |

After F0a merges, the integrator comments on ROB-364: "F0a is on `main` at <sha>; merge `origin/main` and mark ready."
F0b and F0c never block F1; if either is late, F1 still merges after F0a.

## (c) The one shared file: `docs/ui-lane/gameplay-anchor.md`

Each contract adds its own `###` section, headed with its issue (`### Step markers (ROB-361)`, `### Attack hints
(ROB-362)`, `### passCombat (ROB-363)`), placed under "The conversation with the server" after the existing `events.v1`
and `CrankRoomView@1` sections, and edits nothing outside its section except the one line F0c adds to the list of
`prefer` fields and the one row F0a adds to the `events.v1` kinds table. Three PRs appending sections at the same place
conflict textually; the resolution is always **keep both**: the integrator resolves the conflict when merging the second
and third PR by keeping every section, in merge order, and never rewrites a word inside another contract's section. A
worker who finds its section conflicting after merging `main` does the same: keep both, touch nothing of the other's.

## (d) The integrator's checklist, per PR

Run in this order; a failed step sends the PR back (section e) and the checklist starts again on the next sha.

1. **Read the whole diff** (`gh pr diff <n>`): every changed file is inside the lane the feature file names, the anchor
   section matches the code, nothing is renamed or removed from `events.v1` or the view, no test was weakened, widened
   or skipped, US English throughout.
2. **Run the suites the PR names on its exact head**, from a clean worktree of that sha on Personal-HP (Node 22,
   Playwright 1.56.0): the feature's suites, the universal four, the mutation runner, `node tests/engine-breaks-anchors.mjs`
   (count compared with `main`). Where the PR's pasted output and this run disagree, this run wins and the PR goes back.
3. **Read the sharded Actions run on that head**: all eight shards finished inside the cap, and every red suite is in
   the list in section (f) with its issue; a red suite not on that list is the PR's, whatever its name.
4. **A second `review-before-ready` by the integrator**, on the diff, after the worker's cross-model one: correctness
   (an offered choice resolved in code; a refusal without its instruction; a race between a socket message and a render;
   a test that cannot fail), security where the change touches what another seat can see (the no-leak harness is read,
   not trusted), simplification only inside the diff. Findings that block go back to the worker; the integrator does not
   fix them in its own branch.
5. **`tools/local-ci.sh <sha> 0`** on the head: the secret and personal-address scan and the clean merge with `main`.
6. **The merge**, by `AGENTS.md` "Merging to `main`": `origin/main` is an ancestor of the head (or the head is merged
   again and the run repeated), `mergeable` is clean, the run's head sha is the PR's head, then
   `gh pr merge <n> --merge --match-head-commit <sha>` (a merge commit; never a squash, never a rebase). The record goes
   on the PR as a comment: the run id, the shards' times, and the suites run locally with their closing lines.
7. **The Linear close**, in the same turn: a comment on the issue with the PR link and *Done:* / *Proven by:* /
   *Outstanding:*; status Done; the merge commit's sha named. For F0a, the comment on ROB-364 from section (b).
8. **After the fourth merge**: one summary comment on ROB-357 naming the four merge commits and anything outstanding.

The integrator watches each worker PR from the moment its "Ready for integration" comment appears (section f says how
this harness watches a PR) and reads the issue's comments at the start of every turn until then.

## (e) When a PR is red, conflicted, incomplete, or outside its lane

The PR goes back with **one comment** that names the gap and nothing else: the suite and its failing line; the file that
conflicts; the item of section (a) that is missing; the file outside the lane. The issue stays In Progress with the
worker. The integrator never fixes it in its own branch, with one exception: **a one-line seam the worker cannot own**
(a line in a file of another lane that the feature needs and that no lane is holding), which the integrator commits on
`main` through its own small PR with the reason stated in the commit, then tells the worker to merge `main`. A gap that
needs Rob (a changed default, a removed feature, a cost, two contracts that cannot both be kept) is a **Rob's call**
issue with a one-line recommendation; the PR waits.

A PR that is red only on a suite from the list in section (f) is not red for this purpose; the comment says which suite
and which issue, and the checklist continues.

## (f) What Part 1 (ROB-351, PR #994) proved about the toolchain, for workers

- **Node 22.** The workflow installs `node-version: "22"`; Personal-HP runs 22.23.3 (`tools/local-ci.sh` refuses any
  other major). The app itself has no `package.json` and no dependencies.
- **Playwright 1.56.0, pinned.** The workflow installs `playwright@1.56.0` with its Chromium on `ubuntu-24.04` (24.04,
  not `ubuntu-latest`: 26.04 cannot install that browser). `tools/local-ci.sh` demands the same version. **The cloud
  container has a different Playwright (1.63 at last reading, ROB-345, ROB-382)**, and three table suites fail only
  there (`tests/table-camera-layout.mjs`, `tests/table-shared-shell.mjs`, `tests/table-tabletop.mjs`) while
  `tests/board-card-sharpness.mjs` fails only on Actions. A container's red on one of those four is not the PR's; a
  container's green on a browser suite is advisory, and the Actions run on the PR is the gate.
- **What a container can run:** every Node suite (engine, room, fixtures, the no-leak harness, `node --test
  game/tests/*.test.mjs`), the breaks runner (Python 3.12 with openpyxl), and the browser suites under headless Chromium
  with `GEOMETRY_REQUIRED=1 PAGE_BUDGET_REQUIRED=1` (the workflow's environment; without them a browser suite skips
  itself). **What it cannot prove:** 3D (Babylon) as a person sees it, a physical phone, sound, Forge or the JDK, a real
  table (`AGENTS.md`, "Know what you cannot prove"); the PR says "unproven until a local session proves it" in those
  words. The integrator's Personal-HP run covers what the container could not render, for F1's Table, Focus and 3D
  screenshots.
- **The sharded gate.** The Tests workflow is eight jobs; `SUITE_SHARD="i/8"` gives `tools/run-suites.mjs` every eighth
  browser suite and every eighth other suite (`tests/suite-shards.mjs` proves the partition). One shard on a machine:
  `SUITE_SHARD=2/8 bash runtests.sh -q`; the suites a shard holds: `SUITE_SHARD=2/8 node tools/run-suites.mjs --list`.
  A new suite joins a shard by its sorted name, so adding one moves the partition; that is fine and expected. Shard 0 also
  runs the Commander companion tests. A red shard does not cancel the others.
- **Before a push** (`AGENTS.md`, "No run twice what another run already proved"): only the suites the change touches,
  `tests/data-integrity.mjs` when a suite is added (the README must name it and say the count), `tests/feature-wiring.mjs`
  for wording, `tests/asset-versions.mjs` when a served file moves, then `tools/local-ci.sh HEAD 0`. The whole suite is
  the Actions run's.
- **The no-leak harness** every feature file names is `node tests/room-g1-terms.mjs` (every seat's view read at every
  question of a whole game on Rob's decks, judged against what the state says that seat may know; `tools/fuzz-live.mjs
  --leaks` is its engine), with `node tests/engine-gate.mjs` for the engine's own decks. Name it that way in the PR.
- **A worktree on Personal-HP** has no `node_modules`; it borrows the primary checkout's through a junction
  (`New-Item -ItemType Junction -Path <worktree>\node_modules -Target C:\Users\robmi\CrankMagic\repo\node_modules`),
  never an install per worktree. A cloud session installs Playwright itself, as the workflow does.
- **Watching a PR in Claude Code desktop:** `subscribe_pr_activity` (the tool `AGENTS.md` and the one-loop skill name)
  does not exist in this harness; the app's PR bar binds the PR to the session when it is created from its branch, and
  its monitor switch (wake on CI failures, conflicts and review comments) needs Rob's approval in the app. Until he gives
  it, the session reads the PR's checks at the start of each turn, as the other harnesses do.
- **Suites red on a clean `main` today**, so a worker knows a red it did not touch is not its own. The sharded run
  41323421887 on PR #994's head (the tree merged to `main` as 6f4b584f) confirmed `tools/gate/known-red-main.json`
  (ROB-377): twelve suites red with their issues (`board-babylon` ROB-378, `board-card-sharpness` ROB-379,
  `board-commander-hand` ROB-345, `board-control` ROB-242, `board-r5-visual` ROB-380, `browser-geometry` ROB-245, `coach`
  ROB-248, `crankmagic-coach` ROB-249, `engine-breaks-anchors` ROB-250, `page-budget` ROB-247, `precons` ROB-246,
  `table-record` ROB-251), four flakes that pass most runs (`board-r4-views`, `explore-commander-door`, `table-tabletop`
  ROB-381; `board-3d-camera` ROB-395), two red only in the cloud container (`table-camera-layout`, `table-shared-shell`
  ROB-382). `node tools/gate-compare.mjs --failed <the run's FAILED list>` says which of a PR's reds are OLD and which are
  NEW; a NEW one is the PR's. A red suite with no issue is filed by whoever sees it first, never loosened to go green.
- **What a shard costs.** On the merged head the eight shards took 10.6 to 19.3 minutes (shard 1 holds `a11y-board`,
  334 s, and `board-direct-blocking`); a run ends when the longest does. A PR marked ready, then pushed again, cancels its
  own run, so merge `main` and push once, then mark ready.

## Dated notes (what Part 1 found in the four contract files)

- **2026-11-01, all four files:** "the no-leak harness" is `tests/room-g1-terms.mjs` (above). The breaks runner is run
  with `python3 -u` so its output reaches a log before it ends.
- **2026-11-01, F0b:** there is no `blockers` function in `game/engine/rules/combat.mjs`. Blocker legality is
  `canBlock(state, id, player)` there (line 101) and `canBlockAttacker(state, blockerId, attackerId)`,
  `blockersAreLegal(state, attackerId, blockerIds)` and `lethalNeededFrom(state, sourceId, targetId)` in
  `game/engine/keywords/combat.mjs`; `combatDamageOf` and `attackTax` are in `game/engine/rules/statics.mjs`. Call those.
- **2026-11-01, F1:** the suites it names that were red on `main` on 2026-10-30 (`board-callouts-place`,
  `board-flat-views`, `board-combat-display`) were fixed by #988; the sharded run on PR #994 says what is red today.
