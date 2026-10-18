# Grok: the instruction set (one coordinator, workers on disjoint files)

*Platform: Grok Bot, spinning up worker agents under one coordinator. Linear label `Grok`. Feed
`docs/readout/feeds/grok.json` (updated by a worker whose only file is that feed). Branches `grok/<task>-<topic>`.
Home project: Joyful end to end, launch readiness (P-ROB-10), milestone J2 proof; tasks may live in any project.
The packages are under `docs/grok/`; the current one is `WORK-PACKAGE-2026-10-17.md`. The charter is
`docs/program/README.md`.*

## 1. What this lane is for

Rob, October 17: "I trust it less with highly creative and nuanced work, more with well-instructed work that can be
federated across agents and orchestrated by a single agent." So Grok takes **bounded, well-instructed, provable**
tasks: test cases, reference curation, benchmarks and budgets, data checks, fixtures, documentation that follows a
format, the playtest harness run. Grok does not design screens, decide product behavior, touch credentials, release,
or merge.

## 2. How a task reaches Grok

1. A workstream that needs bounded work writes the task into a package under `docs/grok/`: the Linear issue, the
   exclusive file scope (files only Grok touches for this task), explicit exclusions, acceptance a command proves,
   and the return format (the package's last section).
2. The issue gets the `Grok` label and lives in the project of the outcome it serves.
3. Rob relays the coordinator prompt (`docs/program/KICKOFF-PROMPTS.md` §5, or the package's own
   `ORCHESTRATOR-PROMPT-*.md`).
4. The coordinator starts one worker per task, checks each return against acceptance and format, sends back what
   lacks a proof command or touches a file outside scope, and posts one consolidated report on the tracking issue
   (ROB-96 today).
5. The workstream that wrote the task reviews and merges the PR. No bot merges.

## 3. The rules every worker follows

From `AGENTS.md`, restated in the package: branch from the base commit; only the named files; American English;
every check ships with a break; before pushing, the suites it touches then `tools/local-ci.sh <head> 0` with the PASS
block pasted into the PR; no secrets, addresses, private hands or game records; honesty of the return (what was run,
with its command and last lines; what was not, in those words); never edit `docs/ACTIVE.md`; never force-push; never
mark a Linear issue Done.

## 4. Tasks today

| Task | Issue | Exclusive files | Status |
| --- | --- | --- | --- |
| G1 anchors | ROB-16 | | Withdrawn: landed on main by the engine lane |
| G2 a11y retarget | ROB-15 | | Withdrawn: landed on main by PR #729 |
| G3 test cases | ROB-27 | `docs/uat/play-test-cases-2026-10.md` | Ready to start |
| G4 Mobbin references | ROB-61 | `docs/design/references/mobbin-2026-10.md` | Ready, if the worker has Mobbin access |
| G5 playtest harness run | | `docs/playtest-harness.md`'s outputs | Waits on Rob's four service tokens (ROB-11) |
| G6 performance budgets | ROB-136 | `tests/budgets.mjs`, `docs/program/budgets.md` | Ready to start; reviewed by Claude · Deck intelligence |
| later | ROB-67 | per package | Crowded-board benchmarks, once the board's M1 is on main |

Good next tasks for a package (any workstream may write them): a fixture of 200 real-world card lines for card
resolution (ROB-131); usability notes from the first-time persona's journey (ROB-135); the accessibility walk of
each workshop screen at 390 wide; a per-route screenshot set with stable IDs after each merge.

## 5. The return format

As in the package: for each task, the branch and head commit, the PR link, the files changed, the acceptance checks
with the command and its last lines, the break and the failing assertion text, what was not run and why, and
anything out of scope the worker noticed (as a request, never a change).

## 6. The readout

The coordinator's consolidated report is also the feed update: a worker whose only file is
`docs/readout/feeds/grok.json` sets `updated`, `now`, and each task's `status` and `remaining_hours`, runs
`node tests/readout-feeds.mjs`, and opens the PR. A task is `done` on the feed only when its PR is merged by the
reviewing workstream.
