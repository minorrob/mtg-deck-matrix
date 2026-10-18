# Handoff: the repo steward, so any AI system keeps the work organized (2026-10-18)

From Fable (the engine lane, `claude/admiring-franklin-58cxy4`) to the session Rob assigns to it. Rob, 2026-10-18:
*"Tell me the best way to set up a repo steward or babysit skill that will ensure that, no matter which AI system is
working on it, it keeps things organized"*, then *"I'm going to have another session handle the 4 layers. Create a
handoff doc."* Linear: **ROB-143** (tracking) under the engine umbrella ROB-71. Coordination with the other lanes:
**ROB-11**.

Read `AGENTS.md` and `docs/ACTIVE.md` first, as every session does here. This file adds only what this job needs.

**The program changed on Oct 18 (ROB-11, 04:50 UTC). It now has five lanes, and PR #740 carries the charter:
`docs/program/README.md`.** Read its §3 (who owns which files), §5 (decide, or surface to Rob) and §6 (the short rules
list) before you start. §6 is already the seed of the playbook below, so build on it rather than writing a second list
beside it. This handoff follows #740's ownership. If #740 hasn't merged when you start, read the charter from its
branch, `claude/crankmagic-invitations-ob12tu`.

## The idea in one paragraph

A Claude skill alone cannot do it: `.claude/skills/` is read by Claude and nobody else. So the rules live once, in
plain markdown that every system reads (`docs/steward.md`, linked from `AGENTS.md`). Each system's own entry file
points at it in one line. Claude gets a thin skill wrapper at the exact path its PR-watching reads. Then **CI enforces
the mechanical parts**, because a check fails whoever opened the PR. Rules that nobody enforces drift; checks don't.

## 1. The branch and commit this describes

- **Base:** `main` at **f6018fe4** (#747 merged). Work on a new branch of your own, `<system>/steward` (AGENTS.md, "The
  branch is the lock"); never `claude/admiring-franklin-58cxy4`, the engine lane's.
- **The state of the repo for this job, at f6018fe4:**
  - `AGENTS.md`: 233 lines, the cross-system rules ("Rules of engagement for AI systems working in this repository").
    It has no steward or PR-loop section.
  - `CLAUDE.md`: one line, pointing at `AGENTS.md` and `docs/ACTIVE.md`.
  - `docs/ACTIVE.md`: **1,813 lines**. The lanes table is at "## The lanes" (line 83) and the Requests table at "###
    Requests between the lanes" (line 90). Below those sit about 40 dated sections going back to September.
  - `.claude/skills/`: `crankmagic-live-load-sync`, `crankmagic-refresh`, `simulate-deck`. There's no `steward` or
    `babysit`. `crankmagic-refresh` is the pattern to copy: a thin `SKILL.md` over a spec in `docs/crankmagic-refresh.md`.
  - PR #740, not yet merged at this writing:
    - `docs/program/README.md`, the charter, with the five lanes' file ownership (§3) and the short rules list (§6);
    - `docs/program/workstreams/<lane>.md`, each lane's brief;
    - `docs/readout/`, a readout with one feed per lane, validated in CI by `tests/readout-feeds.mjs`;
    - `AGENTS.md`'s lanes table, rewritten for the five lanes.
  - None of these exist: `GEMINI.md`, `.github/copilot-instructions.md`, `.cursor/`, `.codex/`.
  - `.github/workflows/`: `tests.yml` (the `suites` gate, which runs once when a PR is marked ready, and never on
    drafts), `live-load.yml`, `compile-game-logs.yml`.

## 2. What is proven, and what is assumed

| Claim | Status | How it was established |
| --- | --- | --- |
| Claude Code, when watching a PR, reads `.claude/skills/steward/SKILL.md` and then `.claude/skills/babysit/SKILL.md` from the PR's **head branch**. It prefers `steward`, and treats either as repository guidance on conventions and how proactive to be. It can never override that harness's own "never" rules (skipping tests, rewriting someone else's history, approving or merging on a skill's say-so). | Proven for the harness this session runs in | Its PR-watching instructions say so, in those words |
| `tests/refresh.mjs` fails when the README's "There are N Node suites" doesn't match the suites on disk | Proven | `node --stack-size=4000 tests/refresh.mjs` (87 checks) |
| `tests/engine-breaks-anchors.mjs` fails when any breaks file's anchor isn't found exactly once | Proven | `node --stack-size=4000 tests/engine-breaks-anchors.mjs` |
| Codex reads `AGENTS.md`, including nested ones | **Assumed** (it's Codex's documented convention) | Check Codex's current docs before relying on it |
| Gemini CLI reads `GEMINI.md`, and can be told to read `AGENTS.md` instead (`contextFileName` in `.gemini/settings.json`) | **Assumed** | Check Gemini CLI's current docs |
| GitHub Copilot reads `.github/copilot-instructions.md`, and recent versions also read `AGENTS.md` | **Assumed** | Check GitHub's current docs |
| Cursor reads `.cursor/rules/*.mdc` (frontmatter with `alwaysApply`), and recent versions also read `AGENTS.md` | **Assumed** | Check Cursor's current docs |
| An Actions job on `pull_request` sees the PR's title, body and branch in its event payload, and its token is read-only for a fork | Standard GitHub behavior; not yet exercised in this repo | Prove it with the workflow's first run |

## 3. The four layers, each with what done looks like

### Layer 1: one playbook, `docs/steward.md`

Plain markdown with no tool names, written as checklists. It **consolidates rules the repo already follows**, citing
where each one is written, and adds none of its own.

**Where it lives** is the first thing to agree. The charter's §6 is already a short list of the same rules, and
`docs/program/**` belongs to Claude · Deck intelligence. Pick one, with that lane's OK in ROB-11:

1. *Recommended:* `docs/steward.md` holds the per-moment checklists, and §6 links to it as its long form.
2. The checklists go into §6 itself.

Either way there must be one list, not two that drift apart. Link it from a short new section in `AGENTS.md`
("Stewarding a change"). The sources:

- **Claiming work:**
  - set the Linear issue to In Progress before the first commit;
  - take the lane's row in `docs/ACTIVE.md` (AGENTS.md "The baton is a file");
  - one agent per branch (AGENTS.md "The branch is the lock").
- **Issue states:**
  - Done means merged, and on staging verified byte-identical when it ships to staging.
  - Leftover work becomes a new issue, related to the old one, rather than staying inside a Done one. ROB-102 is the
    worked example: it holds ROB-13's and ROB-73's table switches.
  - Every PR names its Linear issue (`ROB-<n>`).
- **The PR loop:**
  - Work as a draft and mark it ready once (drafts don't run CI).
  - The gate is the `suites` job.
  - The two **Workers Builds** checks fail in 0 s on every PR and aren't the deploy path. Post one standing-down comment
    per PR, never more. #744 through #748 each have one.
  - Merge on green with a merge commit (AGENTS.md "Merging to `main`").
  - `tools/local-ci.sh <ref> 0` (the secret and personal-address scan) before any push.
- **Staging releases:** the engine lane owns them (AGENTS.md "Lanes").
  - Announce in ROB-11 before the push.
  - Run `tools/release-staging.sh`; its log must not say `STAGING NOT RELEASED`.
  - Verify the deployed `play-worker.js` byte-identical to `wrangler deploy --dry-run`.
  - Run `node tools/staging-check.mjs --expect <sha>`.
  - Record the result in ROB-11.
  - Never two releases at once. Production only on Rob's go.
- **Lanes and shared files:** AGENTS.md "Lanes" and the charter's §3 and §4 (since 2026-10-18, five lanes: Claude ·
  Engine, Claude · Deck intelligence, Codex · Play, Codex · Workshop, Grok). A change to another lane's file is asked
  for in ROB-11 or the Requests table, never just made. What to decide versus surface to Rob is the charter's §5.
- **The readout:** each lane updates its own `docs/readout/feeds/<lane>.json` at every merge (charter §7).
- **Evidence:**
  - Every new guard gets a break that's caught (AGENTS.md "A test that cannot fail is a comment";
    `game/tools/batch/breaks.py`).
  - A new suite goes into the README's list and count.
  - A handoff states the four things (AGENTS.md).
- **Ending a session:** nothing uncommitted (AGENTS.md "No session ends with uncommitted work").
- **Private data:**
  - Raw records, decklists, ids and private hands stay in git-ignored `game/.local/`. ROB-94's snapshot is there.
  - Never print an email, a token, a key or a password.
  - Never disable TLS verification.
  - Never restore `data/live-state.json` as the owner's account.
- **Never in the repo:** model identifiers (in commits, PRs, code or docs).

*Done when:* `AGENTS.md` links it. It has one checklist per moment (start, push, PR ready, merge, release, end), each
item citing its source. It's under about 200 lines. It contradicts nothing in `AGENTS.md`; where the two differ,
`AGENTS.md` wins, and you change the playbook, not the rule.

### Layer 2: one-line pointers in each system's entry file

`GEMINI.md`, `.github/copilot-instructions.md`, `.cursor/rules/steward.mdc` (with `alwaysApply: true`). Each says only:
*"Read `AGENTS.md`, `docs/ACTIVE.md` and `docs/steward.md` before anything else."* `CLAUDE.md` already points at
AGENTS.md; add `docs/steward.md` to it.

*Done when:* each file exists and is one or two lines, and the Layer 4 suite fails if any is missing or stops pointing
at those three files.

### Layer 3: the thin Claude wrapper, `.claude/skills/steward/SKILL.md`

Name it `steward`, not `babysit`: the harness prefers `steward` when both exist, so having both just invites drift.
`.claude/skills/**` belongs to Claude · Deck intelligence (charter §3), so get its OK in ROB-11, or ask it to commit
the file.

* **Frontmatter:** `name: steward`, and a `description` that triggers on PR work: "Use when opening, watching, fixing CI
  on, merging, or releasing a change in this repository."
* **Body:**
  * a pointer to `docs/steward.md`, which is canonical;
  * only Claude-specific mechanics: posting through the GitHub MCP tools, subscribing to a PR's activity, and arming a
    self check-in;
  * how proactive to be: fix red CI and small review asks without asking; ask Rob before anything in another lane or in
    production.

*Done when:* the wrapper restates no rule from the playbook and only points to it. The Layer 4 suite checks its
frontmatter, and checks that it links the playbook.

### Layer 4: CI, the part that holds

1. **`tests/steward.mjs`**, a Node suite that `tools/run-suites.mjs` picks up like any other:
   - Every pointer file exists and names `AGENTS.md`, `docs/ACTIVE.md` and `docs/steward.md`.
   - `AGENTS.md` links `docs/steward.md`.
   - `SKILL.md` frontmatter is valid and links the playbook.
   - `docs/ACTIVE.md` stays under a line budget (Rob decides the number; 250 is my suggestion) and keeps its required
     sections: the lanes table, the Requests table, and one current section per lane naming holder, branch, since and
     doing.
   - It also runs `tools/pr-hygiene.mjs`'s own cases.
   - Don't duplicate `tests/readout-feeds.mjs` (#740), which already validates the feeds. Extend it, with its owner's
     OK, if the steward needs more of the feeds.
   - It goes into the README's list and count.
   - It gets a breaks file, `game/tools/batch/breaks-steward.py`, with every break caught (`python3
     game/tools/batch/breaks.py game/tools/batch/breaks-steward.py`, with nothing else editing the worktree while it
     runs).
2. **`tools/pr-hygiene.mjs` and `.github/workflows/pr-hygiene.yml`**, on `pull_request` (opened, edited, synchronize,
   ready_for_review):
   - **It names its issue:** `ROB-<n>` appears in the title or body.
   - **Lane paths:**
     - Classify each changed file by the ownership table (the charter's §3, mirrored in `AGENTS.md`'s lanes table).
       Keep it as `tools/lanes.json`, and have `tests/steward.mjs` prove it matches the table.
     - A PR's lane is its branch prefix: `claude/engine-` (and `claude/admiring-franklin-58cxy4`), `claude/deck-`,
       `codex/play-`, `codex/workshop-` or `grok/`. A Grok PR may touch only the files its package names.
     - A PR that changes another lane's file fails, unless its body carries a `Lane OK:` line linking the ROB-11 comment
       that granted it. Shared files (section 4) always pass.
   - **No model identifiers** in the PR body or in added lines. Keep the pattern list short and in the tool.
   - **Security:** use `pull_request`, never `pull_request_target`, with `permissions: contents: read`. Pass the title
     and body to the script **through environment variables**, never `${{ }}` spliced into a `run:` line. A PR body is
     attacker-controlled text, and splicing it into a shell line is script injection.
   - **Rollout:** start in **warn** mode (a notice, not a failure) for a week of PRs, then make it fail. Rob decides when
     it becomes a required check.

*Done when:* the suite is green with every break caught, the workflow has run on its own PR in warn mode, and the
README count is right.

### And the trim: `docs/ACTIVE.md` back to a board

1,813 lines is a log, not a board, and a board nobody can read stops being the baton.

* **Move:** every dated section before the current ones, plus answered Requests rows, goes verbatim to
  `docs/history/ACTIVE-through-2026-10-17.md`. Git keeps them too.
* **Keep:** the header, the lanes table, the open Requests, one current section per lane (about 40 lines each), and
  "Standing facts".

This touches every lane's section, and each lane writes only its own (AGENTS.md; charter §3). So:

1. Post the plan and a **freeze window** in ROB-11.
2. Get an OK from each of the five lanes. Claude · Engine (Fable) agrees in advance, for the window you post.
3. Make it one PR, and merge it quickly.
4. After the merge, each lane merges `main` into its branch.

Two Requests rows were answered on Oct 18: #3 (events, now `events.v1`, ROB-77, on staging) and the round-label request
(ROB-76, PR #748). The engine lane fills in their Answer column in its next PR. If your trim lands first, move them to
history as answered.

## 4. Who owns which file, and how to coordinate

Ownership follows the charter's §3 (#740).

| Files | Owner | How you get them |
| --- | --- | --- |
| `.github/workflows/pr-hygiene.yml`, and any change to `tools/run-suites.mjs` or `tools/local-ci.sh` | Claude · Engine | Fable hands these to you for this job |
| `.claude/skills/steward/`, and anything under `docs/program/**` or in `tests/readout-feeds.mjs` | Claude · Deck intelligence | Its OK in ROB-11 first |
| The new files: `docs/steward.md`, `tests/steward.mjs`, `tools/pr-hygiene.mjs`, `tools/lanes.json`, `game/tools/batch/breaks-steward.py`, `docs/history/`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursor/rules/steward.mdc` | Yours, as files for this job | Name them in ROB-11 when you start |
| `AGENTS.md`, `CLAUDE.md`, `README.md`'s suite list and count, and `docs/ACTIVE.md` for the trim | No one lane: shared | Post your `AGENTS.md` text in ROB-11 before the PR is ready. Whoever merges second sets the README count. The trim needs every lane's OK (above) |

**Don't touch:** `game/**` (except `game/tools/batch/breaks-steward.py`, above), `cloud/**`, `data/**`, and the Play and
Workshop lanes' files (charter §3).

## 5. What is outstanding, and why

| Item | Why it waits |
| --- | --- |
| All four layers and the trim | Not started; this is the handoff |
| The `ACTIVE.md` line budget, warn-to-fail timing for `pr-hygiene`, and whether it becomes a required check | Rob's calls |
| The OKs: every lane's on the trim; Claude · Deck intelligence's on `.claude/skills/steward/` and on where the playbook lives; a look from each lane at the `AGENTS.md` section | Ask in ROB-11, and wait for answers rather than assuming them |
| PR #740 (the charter) merging | This handoff follows its ownership. Start from `main` once it has merged, or merge it in |
| Verifying the "Assumed" rows above against each tool's current docs | Not checked from this container |

## Suggested order: three small PRs, one at a time

1. Layers 1–3, docs only: playbook, pointers, wrapper.
2. Layer 4: the suite, its breaks, the workflow in warn mode, and the README count.
3. The ACTIVE.md trim, inside its posted freeze window.

Each PR names ROB-143, is announced in ROB-11, and merges on a green `suites` run with a merge commit. Record each one
in ROB-143.
