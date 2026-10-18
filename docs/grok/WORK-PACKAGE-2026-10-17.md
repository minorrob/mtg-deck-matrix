# Grok Bot work package, October 17, 2026

Prepared by the Claude cloud session temporarily holding Codex's lane (`docs/ACTIVE.md`, Linear ROB-11). Rob's brief for Grok
Bot: well-instructed work, federated across worker bots and orchestrated by one coordinator bot; not open-ended creative or
nuanced design work. This package is the instruction set. Everything in it is bounded: one base commit, one branch per task,
an exclusive file scope, explicit exclusions, acceptance criteria that a command proves, and a fixed return format.

**Base commit for every task:** `main` at `20601740` or later (updated October 18; the earlier 9cf57d0c and 1990ad1d bases are superseded) (its full CI run is green) (October 17; it holds #737 and the engine lane's #739; the earlier 1990ad1d base is superseded). The relay prompt is `ORCHESTRATOR-PROMPT-2026-10-17.md`.
**Read first, in this order:** `AGENTS.md`, `docs/ACTIVE.md` (top section and the lanes table), this file, then the task's own
sources. **Repository:** https://github.com/minorrob/mtg-deck-matrix . **Linear:** project *CrankMagic — Tabletop Experience*,
team *Army of 1*; the tracking issue for this package is named in ROB-11.

## How the bots work together

| Role | Count | Does | Never does |
| --- | --- | --- | --- |
| **Coordinator** | 1 | Reads this package; starts one worker per task below, in the order given; checks each return against the task's acceptance and return format; rejects and resends a return that lacks a proof command or touches a file outside scope; compiles the one consolidated report (format at the end) and posts it as a comment on the tracking issue, or hands it to Rob to relay | Merges, releases, edits files, runs two workers on the same file, changes a task's scope |
| **Worker** | 1 per task | The task, on its own branch, in its own clone; pushes the branch; opens a **draft** PR; returns the evidence | Touches a file outside its scope; edits `docs/ACTIVE.md`; rebases or force-pushes; deletes or moves a directory; runs git in another agent's checkout; marks a Linear issue Done |

Workers run in parallel only when their file scopes are disjoint (they are, below). The coordinator reviews, the Claude session
integrates: a Grok PR is merged by the lane holder after review, never by a bot.

## Rules every worker follows (from `AGENTS.md`)

1. **Branch:** `grok/<task-id>-<topic>`, from the base commit. Draft PR against `main`, titled with the Linear ID.
2. **Scope:** only the files the task names. A change needed outside scope is written up in the return as a request, not made.
3. **American English everywhere** (prose, comments, commit messages): `tests/feature-wiring.mjs` counts UK spellings and a commit
   that adds one fails. Dates and numbers the US way. Currency USD only.
4. **A test that cannot fail is a comment:** every repaired or new check ships with a break (a deliberate mutation) that makes it
   fail, then the restored code passes. The return names the mutation and the failing assertion text.
5. **Before pushing:** the suites the change touches, then `tools/local-ci.sh <branch-head> 0` (the scan for secrets and
   personal addresses, and the clean merge with `main`). Paste its PASS block into the PR.
6. **No secrets, no personal addresses, no private hands or game records** in any file, screenshot, comment or chat. No
   credentials are issued to any bot by this package; no bot changes Cloudflare Access, deploys, or touches staging data.
7. **Honesty of the return:** what was run is listed with its command and its last lines; what was not run is said in those words.
   A claim that needs a browser carries the screenshot; a claim that needs Java or Forge is marked unproven.
8. **Tooling:** Node 22+, Python 3.12, Playwright 1.56.0 with Chromium (`UAT_PLAYWRIGHT`, `UAT_CHROME`; see
   `docs/release-pages.md`, *Tooling on a fresh machine*). The browser suites run with `GEOMETRY_REQUIRED=1`.

## The tasks

### G1 · ROB-16 · Re-anchor the four stale board breaks — WITHDRAWN (October 17, 17:45 UTC)

**Not for a bot.** The engine lane posted a verified patch on ROB-16 before any bot started (re-anchor one break, replace one, retire
the two 3D breaks the removed switch made moot); it lands as its own small PR. The coordinator skips G1. The text below is kept as
the record of what was asked.


**Why:** `tests/engine-breaks-anchors.mjs` is red on `main` because four entries in `game/tools/batch/breaks-play-ui.py` name
text that no longer exists in `crankmagic-board.js`, so those breaks change nothing and prove nothing.

**Scope (exclusive):** `game/tools/batch/breaks-play-ui.py`, and only these four entries (the file's other entries belong to the
engine lane and are not touched):
`'the ground is felt, not the mat'`, `'one other seat put at the left, not the back'`, `'3D never on the board'`, `'3D forgotten'`.
**Read-only:** `crankmagic-board.js`, `crankmagic-tabletop.js`, `tests/table-board.mjs`, `tests/table-tabletop.mjs`,
`game/tools/batch/breaks.py`, `game/tools/batch/anchors.py`. **Excluded:** every other file.

**Steps:**
1. Run `node tests/engine-breaks-anchors.mjs` on the base commit; record the four "found 0 times" lines.
2. For each of the four, find the current code that implements the same behavior and choose a new anchor text that occurs
   **exactly once** in its file. Decisions already made that change what the anchor means:
   the 3D switch was removed (`docs/ACTIVE.md`, October 14: *"Full screen now always uses the table, with no 3D switch. Tilt is
   0–60 degrees, default 40"*), so the two 3D breaks become breaks of the behavior that replaced it: the tilt preference being
   applied, and the tilt preference being remembered (`localStorage`). Keep the entry's label honest: rename it to what it now
   breaks.
3. Prove each new break: `GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py game/tools/batch/breaks-play-ui.py` must report
   the suite failing under each of the four mutations and passing when restored. If a break no longer makes `tests/table-board.mjs`
   fail because the behavior moved to `tests/table-tabletop.mjs`, say so and name the suite that catches it in the return; do not
   edit the `SUITES` line unless the file's header says a break may name its own suite.
4. `node tests/engine-breaks-anchors.mjs` passes (`problems: []`).

**Acceptance:** step 4 green on the branch; step 3's four fail-then-pass pairs in the return with the assertion text of each
failure; no line of the file outside the four entries changed (`git diff --stat` shows one file, and the diff shows only those
entries).

### G2 · ROB-15 · Retarget the board accessibility suite to the current tabletop — WITHDRAWN (October 17, 22:40 UTC)

**Not for a bot.** PR #729 (another Claude session, merged to main as 9cf57d0c) rewrote `tests/a11y-board.mjs` for the tabletop and
fixed what it found (contrast plates, one renderer across Full screen's visits); main's full CI run is green. Remaining accessibility
work is filed as follow-ups on ROB-15, not as a bot task. The text below is kept as the record of what was asked.


**Why:** `tests/a11y-board.mjs` (1,102 lines) is red on `main` at its first wait for `.cm-full-rail`, a container the board no
longer has. It also expects `.cm-board-strip`, `.cm-board-pane`, `.cm-full-pill`, `.cm-full-side`, `.cm-full-others` and a
keyboard order built on them. The checks themselves (contrast, keyboard reachability, focus restoration, labels, hidden-hand
privacy, mobile targets) are wanted; the selectors are stale.

**Scope (exclusive):** `tests/a11y-board.mjs`. A helper may be added as a new file `tests/uat/a11y-board-map.mjs` if it keeps the
suite readable. **Read-only:** `crankmagic-board.js`, `crankmagic-tabletop.js`, `crankmagic-table.js`, `crankmagic.css`,
`crankmagic-design.css`, `tests/table-tabletop.mjs` (how the current suite finds the drawers, Camera, handles and modules),
`docs/play-overhaul/REQUIREMENTS.md` (R35's object IDs T01–T21, M01–M04, D01). **Excluded:** every product file. A product defect the
repaired suite exposes is **reported in the PR**, with the failing assertion and a screenshot, not fixed.

**Steps:**
1. Inventory: every selector the suite uses, in a table (selector, line numbers, what it stands for, present on `main` yes/no).
2. Mapping: for each retired selector, its successor in the current board (the shared header, the Camera menu, the left and right
   drawers and their edge handles T12/T13, the modules M01–M04, the hand fan T11). Where a control was removed on purpose (the 3D
   switch, the seven-step strip), the check that covered it is re-pointed at the control that replaced it, and the mapping table
   says so. No assertion is deleted; one that truly has no successor is kept and marked `skip` with the reason in a comment
   and in the PR.
3. Apply the mapping; run `GEOMETRY_REQUIRED=1 node tests/a11y-board.mjs` (needs `UAT_PLAYWRIGHT` and `UAT_CHROME`).
4. Break it: remove one `aria-label` or one focus restoration in a scratch copy of the board, watch the suite fail, restore.

**Acceptance:** the suite passes on the branch; its printed check count is at least the count it printed when it was last green
(find it with `git log -S"a11y-board:" -- tests/a11y-board.mjs` or in the CI log of a green run); the mapping table is in the PR;
the mutation proof is in the return; product defects found are listed, not fixed.

### G3 · ROB-27 · Test cases for the invitation-to-game journey and the three Play views

**Why:** the live invitation works (ROB-72); what follows it (shared decks, permissions, the lobby, the game on desktop and on a
phone) needs a case list a person or a bot can run the same way every time. Grok Bot wrote the September UAT case lists
(`docs/uat/2026-09-22-test-cases.md`, `docs/uat/2026-09-24-cloud-workshop/TEST-CASES.md`); this continues them.

**Scope (exclusive):** new file `docs/uat/play-test-cases-2026-10.md`. **Read-only:** `docs/play-overhaul/REQUIREMENTS.md`,
`docs/play-overhaul/PLAYTEST-PLAN-2026-10-15.md`, `docs/playtest-harness.md`, `docs/uat/playtest-run.md`, the two earlier case
lists, `docs/uat/playtest-findings-template.csv`. **Excluded:** everything else; no code, no screenshots of private hands.

**Steps:** write cases in the earlier lists' format (ID, precondition, steps a person performs, expected result, evidence to
capture, R-number or Linear ID it proves), for: (a) recipient after sign-in: Shared Decks shows the six current decks with the
right commanders; a Reviewer's edit is refused with the exact wording the app uses; no owner library is copied; (b) a two-human
lobby: invitation link, seat claim, deck choice from the shared decks, the un-invited seat refusal (AGENTS.md's worked example),
ready, start; (c) the board on desktop in Full, Table and Focus, each with the Camera menu, both drawers, modules M01–M04, the hand
fan T11 with eight or more cards, zoom and Cards sliders at both ends; (d) the board on a phone in the fixed Focused view, portrait
and landscape, touch inspect, drawers closed; (e) reduced motion; (f) reconnect mid-game. Every expected result is observable
text, a count or a measurement, never "works correctly".

**Acceptance:** at least 40 cases; every case cites a requirement or Linear ID; none asks the runner to call an API or read
browser storage; `tools/local-ci.sh <head> 0` PASS; `node tests/feature-wiring.mjs` passes (the spelling ratchet).

### G4 · ROB-61 · Mobbin references turned into decisions (only if the bot has Mobbin access)

**Scope (exclusive):** new file `docs/design/references/mobbin-2026-10.md`. **Read-only:** `docs/design/BRIEF.md` (what a design may
and may not bring in), `docs/play-overhaul/REQUIREMENTS.md`. **Excluded:** everything else; no brand assets copied into the
repository, links and one-line annotations only.

**Steps:** three collections, (1) mobile selection, inspection and bottom sheets, (2) desktop collapsible drawers, compact
controls, a camera or view menu, (3) sharing, invitations and account settings. For each reference: the link, the app, the
one behavior worth adopting (dismissal, focus, scrolling, small-screen handling), and a *CrankMagic decision* column that is
either "adopt as behavior X for object T12" or "reject: <reason>", never visual copying. **Acceptance:** at least eight
references per collection, every row with a decision, nothing outside the US rule in `docs/design/BRIEF.md`.

### Later, when Rob issues the four service tokens: G5 · the playtest harness run

`docs/playtest-harness.md` and `docs/uat/playtest-run.md` were written for Grok Bot's 50 games on staging. It needs four Access
service tokens (Rob's steps are in the harness note) and nothing else from this package. Findings go in the template's columns,
triaged by `tools/playtest-triage.mjs`. Not started until ROB-11 says the tokens exist.

### G6 · ROB-136 · Performance budgets for every screen, measured on a phone and held by a suite (added October 18)

**Written by Claude · Deck intelligence; reviewed and merged by it.** Exclusive files: a new `tests/budgets.mjs` and a new
`docs/program/budgets.md`. Nothing else.

**The task:** a table of budgets per route (`#decks`, `#decks?deck=<fixture>`, `#cards`, `#cards?tab=buy`, `#discover`,
`#lab`, `#settings`, the landing page) for first paint, time to interactive, and the route's heaviest action, measured
with Playwright 1.56 at 390 wide with 4x CPU throttling and a slow-3G network profile on the served repository
(`node tools/serve-folder.mjs . 8798`); the suite measures them, prints the numbers, and fails when a route exceeds its
budget by more than the tolerance written beside it. The board's budgets are ROB-67's and are referenced, not
duplicated. Record the current numbers in the document with the machine and date; set each budget at the measured
number rounded up to the next 100 ms, with a 25% tolerance, so the suite holds today's performance and catches a
regression.

**Acceptance:** `node tests/budgets.mjs` passes in under three minutes; `GEOMETRY_REQUIRED=1` turns its no-browser skip
into a failure like `tests/browser-geometry.mjs`; the document names every route, budget, tolerance and source; a break
(a `setTimeout` of 2 s inserted into one route's render in a scratch copy, not committed) fails exactly that route;
`tests/data-integrity.mjs` passes after the suite is added (add the suite's line to `README.md`'s list and raise the
count by one); `tools/local-ci.sh <head> 0` PASS.

## The return (one per task; the coordinator compiles them)

```
Task: G<n> · ROB-<id>
Branch and head: grok/<...> @ <sha>      PR: <draft PR URL>
Base: 1990ad1d02171b6418fd54d9eeeb0ebda37a438c
Files changed: <list; must equal the task's scope>
Commands run, with last lines:
  <command> -> <last 2 lines>
Breaks proven (mutation -> failing assertion text -> restored pass): ...
Not run / unproven, and why: ...
Screenshots (object IDs visible, no private data): <paths in the PR>
Requests outside my scope: ...
Open risks: ...
```

The coordinator's consolidated report is the five returns in order, a line per task saying *accepted* or *sent back and why*,
and nothing else.
