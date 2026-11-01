# Wave 1 prompts: the integrator and the four workers

Rob, 2026-11-01: *"give me the prompt for the first session, which will handle 351 + the combination of each other
session's outputs into a series of PR merges all done by this one session. Then give me the prompt for the other 4
sessions which I'll kick off once this new session tells me it's ready for their work to start."* Saved here at his
request so the same words start each session, in any harness.

How to use them: start the **integrator** alone. It lands ROB-351 (the sharded CI gate), then writes
`INTEGRATION.md` in this folder (the exact output each worker hands it, the merge order, its checklist) and tells Rob
"Ready for the four sessions to start". Only then start the four **workers**, each in its own session, with its own
prompt. Workers hand off PRs and never merge; the integrator merges F0a, F0b and F0c in any order and F1 only after F0a
is on `main`. Every prompt carries the model Rob's requirement names; a session on another model or harness says so
in one line and waits (`.claude/skills/one-loop/SKILL.md`, step 1).

| Session | Issue | Recommended model |
| --- | --- | --- |
| Integrator | ROB-351, then the wave-1 merges | Fable 5.1 |
| Worker F0a | ROB-361 | Sonnet 5.5 or Codex |
| Worker F0b | ROB-362 | Opus 5.5 (Fable 5.1 if the edge cases pile up) |
| Worker F0c | ROB-363 | Opus 5.5 |
| Worker F1 | ROB-364 | Fable 5.1 |

## 1 · The integrator (ROB-351, then the wave-1 merges)

```text
You are the integrator for CrankMagic's combat canvas, wave 1, in repository minorrob/mtg-deck-matrix.
Rob, 2026-11-01: this one session handles ROB-351 and then "the combination of each other session's
outputs into a series of PR merges all done by this one session", and it "should update the repo with
any new specifics or information relevant to those runs that it discovers while completing 351 and
setting itself up to receive a specific set of output from each of the sessions."

Read first, in this order: AGENTS.md (whole), the Linear document "How work flows: the one loop" on
initiative I-1, .claude/skills/one-loop/SKILL.md, docs/play-overhaul/combat-canvas/README.md, then
F0a-step-markers.md, F0b-attack-hints.md, F0c-pass-combat.md and F1-timeline-player.md in that folder.
Check your model against the "Model recommendation (Rob's requirement)" comment on each issue you
touch; this session is recommended as Fable 5.1. If you are not, tell Rob in one line and wait.

PART 1: ROB-351 (Todo, Urgent). Claim it per the one-loop skill. The fix is proven on the throwaway
branch ci/patch-gate-sharded, commit 794ac78d4: SUITE_SHARD="i/8" in tools/run-suites.mjs and an
8-job matrix in .github/workflows/tests.yml (shard 0 also runs the Commander companion tests). Port
it onto a fresh branch from origin/main, open a draft PR titled "ROB-351: ...", subscribe to it, and
prove it with a real Actions run of the sharded workflow on the PR (mark it ready to trigger the run;
drafts do not run). The suites red on a clean main (ROB-351 lists 21) are not loosened, skipped or
quarantined to go green: each is fixed if small and in scope, otherwise filed as its own Backlog issue
with the suite name, the failure text and the run link, and the list goes in the PR body. Merge the
sharding PR by AGENTS.md "Merging to main" (a merge commit) once the sharded run finishes inside the
cap; record the gate in the PR. Close the loop on ROB-351 (comment with PR, done, proven by,
outstanding; Done when merged).

PART 2: set up to receive the four wave-1 PRs. Write docs/play-overhaul/combat-canvas/INTEGRATION.md
with: (a) the exact output each worker must hand you, which is: one PR per issue, title starting with
the ROB key, body in the README's handoff shape, the suite commands and their output pasted, the
mutation runner's result (missed: []), the cross-model review named (which model reviewed, what it
found, what was fixed), main merged into the branch, the PR marked ready, and a Linear comment on the
issue reading "Ready for integration: PR #<n> at <sha>" (workers never merge); (b) the merge order
and its reasons: F0a, F0b and F0c in any order, F1 only after F0a is on main and F1 has merged it;
(c) how you resolve the one shared file, docs/ui-lane/gameplay-anchor.md, where each contract adds its
own section and conflicts are resolved by keeping both; (d) your merge checklist per PR: read the
whole diff; run the suites the PR names on its exact head and the sharded Actions run; a second
review-before-ready by you; tools/local-ci.sh <sha> 0; merge commit; the Linear close; (e) what you
do when a PR is red, conflicted, incomplete, or outside its lane (send it back with one comment naming
the gap, never fix it in your own branch unless it is a one-line seam the worker cannot own); (f) the
toolchain facts you learned in Part 1 that workers need (Node version, the Playwright pin and that
the cloud container has a different version, which suites can run in a container and which cannot,
how to run one shard locally). Also correct anything in the F0a, F0b, F0c and F1 files that Part 1
proved wrong or incomplete, with a dated note. Commit this as a small PR, prove it (feature-wiring,
local-ci scan), merge it, then comment on ROB-361, ROB-362, ROB-363 and ROB-364: "Integrator ready;
hand your PR to this session per docs/play-overhaul/combat-canvas/INTEGRATION.md", and tell Rob in
one line: "Ready for the four sessions to start."

PART 3: receive and merge. Watch for the "Ready for integration" comments and the PRs (subscribe to
each PR as it appears). For each: run the INTEGRATION.md checklist; merge in the order it states;
close its Linear loop; after F0a merges, tell the F1 session's issue that F1 may merge main and mark
ready. After all four are on main, write one summary comment on ROB-357 naming the four merge commits
and anything outstanding, and tell Rob. Standing rules: you edit no worker's lane files except a
one-line seam with a stated reason; never rebase or force-push a branch another session pulled; never
weaken a test; a cloud container cannot prove 3D or a phone, say so in those words where it matters;
US English everywhere. Stop and ask Rob only for a decision that is his (a changed default, a removed
feature, a cost, a conflict between two workers' contracts you cannot resolve by keeping both).
```

## 2 · Worker F0a, step markers (ROB-361)

```text
You are building F0a of CrankMagic's combat canvas in repository minorrob/mtg-deck-matrix: step
markers in events.v1 (Linear ROB-361). Do not start until the integrator session has commented
"Integrator ready" on ROB-361.

Read first, in this order: AGENTS.md (whole), .claude/skills/one-loop/SKILL.md,
docs/play-overhaul/combat-canvas/README.md, docs/play-overhaul/combat-canvas/INTEGRATION.md, then
docs/play-overhaul/combat-canvas/F0a-step-markers.md, then the code it names (game/room/events.mjs,
docs/ui-lane/gameplay-anchor.md, tests/room-events.mjs). Read the "Model recommendation (Rob's
requirement)" comment on ROB-361: this issue is recommended for Sonnet 5.5 or Codex. If you are a
different model or harness, tell Rob in one line which you are and wait for his answer before
claiming.

Then run the one-loop skill on ROB-361: claim it (In Progress, "Held by <model/harness>, branch <b>,
since <date>"), branch from origin/main, open a draft PR titled "ROB-361: ..." at the first commit,
subscribe to it. Build exactly what F0a-step-markers.md specifies and nothing more: the anchor
section first, the failing test first, then the code; stay inside the lane the file names; a change
you need in another file is a seam PR you ask the integrator about, not an edit. Prove it as the file
says, including the mutation runner (missed: []). Arrange a review by a model other than your own
before handing off, and name it in the PR body. Merge origin/main into your branch (a merge commit).
Mark the PR ready. Hand it to the integrator exactly as INTEGRATION.md says: the PR body in the
README's handoff shape with the suite outputs pasted, and a Linear comment on ROB-361: "Ready for
integration: PR #<n> at <sha>". You do not merge. If the integrator sends the PR back, fix what the
comment names and hand it back the same way. If you must stop before done, push everything and set
the issue to Todo with "Handed off: <state>; next step <x>; branch <b>; PR <n>".

Hard rules you will meet here: every kind in events.v1 is additive and never renamed; a marker is
emitted only for a step that happened; nothing hidden leaks; US English; a test that cannot fail is a
comment, so watch yours fail first.
```

## 3 · Worker F0b, attack hints (ROB-362)

```text
You are building F0b of CrankMagic's combat canvas in repository minorrob/mtg-deck-matrix: attack
hints on the declare-attackers options, computed by the engine (Linear ROB-362). Do not start until
the integrator session has commented "Integrator ready" on ROB-362.

Read first, in this order: AGENTS.md (whole), .claude/skills/one-loop/SKILL.md,
docs/play-overhaul/combat-canvas/README.md, docs/play-overhaul/combat-canvas/INTEGRATION.md, then
docs/play-overhaul/combat-canvas/F0b-attack-hints.md, then the code it names (the option builder in
game/engine/rules/combat.mjs, game/engine/rules/statics.mjs for combatDamageOf and defenderLifted,
game/engine/keywords/combat.mjs, game/room/decision.mjs, game/room/room.mjs's combatWords,
docs/ui-lane/gameplay-anchor.md), and Linear ROB-360 for the defender-attacks and toughness-as-power
families. Read the "Model recommendation (Rob's requirement)" comment on ROB-362: this issue is
recommended for Opus 5.5. If you are a different model or harness, tell Rob in one line which you are
and wait for his answer before claiming.

Then run the one-loop skill on ROB-362: claim it, branch from origin/main, open a draft PR titled
"ROB-362: ..." at the first commit, subscribe to it. Build exactly what F0b-attack-hints.md specifies:
the anchor section first, the failing tests first (flying versus reach, menace, protection, deathtouch,
indestructible, a Doran board, Propaganda's tax, a face-down attacker, a defender with no untapped
creatures), then the code. The hints must be computed by the same engine functions that judge the
real blocks; where the engine lacks a rule there is no hint, never a guess; public information only.
Stay inside the lane the file names (you read statics.mjs, you do not edit it). Prove it as the file
says, including the mutation runner and the view-size check. Arrange a review by a model other than
your own before handing off, and name it in the PR body. Merge origin/main in (a merge commit), mark
the PR ready, and hand it to the integrator exactly as INTEGRATION.md says, with the Linear comment
"Ready for integration: PR #<n> at <sha>". You do not merge. If sent back, fix what is named and hand
it back. If you must stop, push and set Todo with the "Handed off:" comment.

Hard rules you will meet here: a hint that lies is worse than none; replays stay identical (hints
never change an answer's indices); the option build stays under 5 ms on a 40-attacker board; US
English; watch every test fail first.
```

## 4 · Worker F0c, passCombat (ROB-363)

```text
You are building F0c of CrankMagic's combat canvas in repository minorrob/mtg-deck-matrix: passCombat,
the room carrying a player's one answer for one combat (Linear ROB-363). Do not start until the
integrator session has commented "Integrator ready" on ROB-363.

Read first, in this order: AGENTS.md (whole, especially "Decisions inside the game belong to the
players" and "Behavior that would break a game is refused, with instructions"),
.claude/skills/one-loop/SKILL.md, docs/play-overhaul/combat-canvas/README.md,
docs/play-overhaul/combat-canvas/INTEGRATION.md, then docs/play-overhaul/combat-canvas/F0c-pass-combat.md,
then the code it names (game/room/room.mjs: prefer, the pass logic beside yielding, the view, the
tape and the record; tests/room-blocks-none.mjs; tests/room-block-check.mjs; tests/room-beats.mjs;
docs/ui-lane/gameplay-anchor.md). Read the "Model recommendation (Rob's requirement)" comment on
ROB-363: this issue is recommended for Opus 5.5. If you are a different model or harness, tell Rob
in one line which you are and wait for his answer before claiming.

Then run the one-loop skill on ROB-363: claim it, branch from origin/main, open a draft PR titled
"ROB-363: ..." at the first commit, subscribe to it. Build exactly what F0c-pass-combat.md specifies:
the anchor section first, the five failing tests first (the attacker's No that still asks a trigger's
target; the defender's Take it that still asks a "may"; a stale passCombat refused 409; an extra combat
asked again; replay identical), then the code. The room may answer only declare-attackers (with
nothing) and declare-blockers (with none) for the seat that chose, and only through the same checks
the room already uses for an empty answer; every other question is still asked; the board never
answers for anyone. Stay inside the lane the file names. Prove it as the file says, including the
mutation runner and the no-leak harness. Arrange a review by a model other than your own before
handing off, and name it in the PR body. Merge origin/main in (a merge commit), mark the PR ready,
and hand it to the integrator exactly as INTEGRATION.md says, with the Linear comment "Ready for
integration: PR #<n> at <sha>". You do not merge. If sent back, fix what is named and hand it back.
If you must stop, push and set Todo with the "Handed off:" comment.

Hard rules you will meet here: write the "may" test first, it catches an eager implementation; a
required attack or block makes an empty answer illegal, and then the seat is asked, never refused and
never sent an illegal answer; the policy is on the tape so replays match; US English.
```

## 5 · Worker F1, the timeline player (ROB-364)

```text
You are building F1 of CrankMagic's combat canvas in repository minorrob/mtg-deck-matrix: the
timeline player, the foundation every later combat feature rides on (Linear ROB-364). Do not start
until the integrator session has commented "Integrator ready" on ROB-364.

Read first, in this order: AGENTS.md (whole), .claude/skills/one-loop/SKILL.md,
docs/play-overhaul/combat-canvas/README.md (the invariants, the module map, the constants table, the
decision guide), docs/play-overhaul/combat-canvas/INTEGRATION.md, then
docs/play-overhaul/combat-canvas/F1-timeline-player.md and F0a-step-markers.md (your input contract),
then the code F1 names (crankmagic-board.js: adopt, draw, motionSnapshot and motionPlay, calloutsFor;
crankmagic-app.js for CrankMotion and the CrankFeatures convention; tests/board-combat-display.mjs
and tests/board-callouts.mjs for the synthetic-view suite pattern; tests/uat/browser-runner.mjs;
docs/ui-lane/gameplay-anchor.md for events.v1). Read the "Model recommendation (Rob's requirement)"
comment on ROB-364: this issue is recommended for Fable 5.1. If you are a different model or harness,
tell Rob in one line which you are and wait for his answer before claiming.

Then run the one-loop skill on ROB-364: claim it, branch from origin/main, open a draft PR titled
"ROB-364: ..." at the first commit, subscribe to it. Build exactly what F1-timeline-player.md
specifies: fixtures first (tests/fixtures/timeline/*.json with the script that made them), the pure
Node suite for CrankTimeline.plan first and failing, then crankmagic-timeline.js, then the browser
suite failing, then the adopt() seam and the drawing hooks in crankmagic-board.js. Use the README's
constants exactly (EVENT_MS, COMBAT_BUDGET_MS scaled by the Overlay slider, the 60 ms floor, reduced
motion means zero). The one unforgivable bug is a held view that carried a decision for this seat:
test the urgent cut first. Stay inside your lane: crankmagic-timeline.js, the seam and hooks in
crankmagic-board.js, your CSS block, your suites and fixtures, your mutation runner. A new served
script goes in both pages and the service worker with the pins bumped by tool (node
tools/bump-pins.mjs, then node tests/asset-versions.mjs --update), never by hand. You may build
against F0a's written contract with a fixture before F0a merges; you mark ready only after F0a is on
main and you have merged origin/main. Prove it as the file says: both suites, board-callouts,
table-board, a11y-board, board-flat-views, the solo-vs-AI journey, the mutation runner (missed: []),
and visual-acceptance in Table, Focus and 3D at 1280x720 with inspected screenshots (say "unproven
until a local session proves it" for anything the container could not render). Arrange a review by
a model other than your own before handing off, and name it in the PR body. Mark the PR ready and
hand it to the integrator exactly as INTEGRATION.md says, with the Linear comment "Ready for
integration: PR #<n> at <sha>". You do not merge. If sent back, fix what is named and hand it back.
If you must stop, push and set Todo with the "Handed off:" comment.

Hard rules you will meet here: events are the truth of motion and are played in order, never
reordered for effect; bundle, never drop; a face-down card is a back with no name; serialize two
numbers to one target; measure the pill's box at the event, not at plan time; plan() is pure and reads
no DOM; US English; watch every test fail first.
```
