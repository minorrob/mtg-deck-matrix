# Plan — one source: every experience runs `main`

**Status: PLAN, not started.** Rob, 2026-09-24: *"Create a plan to ensure, whether local or github, we have
the complete experiences leveraging the latest and correct version, all sourced from the same code
base/branch. Don't execute it yet."*

Everything in §1 was measured on 2026-09-24 (commands given); nothing below has been changed yet. §4
lists what Rob decides before any of it runs.

---

## 1. Where the versions come from today

| Place | What it shows | Where its code comes from | Version on 2026-09-24 |
|---|---|---|---|
| **github.io** | the web app | GitHub Pages, **legacy build of `main`'s root** (`gh api repos/minorrob/mtg-deck-matrix/pages`): no build step, no version stamp, the whole repository published | `main` f1c542c, 2026-09-23 |
| **Local host, 8768** — the "CrankMagic Online - Start Game" shortcut, `start-crankmagic.ps1`, the `$start-crankmagic` skill | the lobby, the board, a copy of the web app at `/app/` | **whatever branch is checked out** in `C:\Users\robmi\CrankMagic\repo`: both launchers resolve `$PSScriptRoot/../..` (`start-crankmagic.ps1:16`, `launch-crankmagic-online.ps1:10`) | `claude/engine-hosting` d9190a6 — 24 commits ahead of `main` |
| **Guest gateway, 8769**, through the tunnel | the guest page, the board | the same process as the host | same as the host |
| **Browser caches**, both origins | the app shell and data | service worker (`crankmagic-sw.js`): pages network-first, assets cache-first keyed by `?v=` pins | sound: a changed file must get a new pin, and `tests/asset-versions.mjs` enforces it |
| **Browser storage**, both origins | each user's library | IndexedDB per origin | **two libraries**, one per address |
| **Other copies of the code** | nothing served | `.claude/worktrees/friendly-lamarr-fd669a` (a Claude Code worktree, detached at ca4aca0, 2026-09-20); `CrankMagic\archive\mtg-deck-matrix-astra-review` (an old clone, 2026-09-07); `docs/design/*/project/*.js` (design-handoff copies of app files, published on github.io) | stale by construction |
| **Unmerged work** | — | PR #358 `claude/engine-blockers` (Engine 2.3b — one commit in NEITHER `main` nor #359); PR #359 `claude/engine-hosting` (24 ahead, 0 behind); PR #290 `claude/american-english-on-screen` (2 ahead, 165 behind); 58 branch refs that are not ancestors of `main`, some of them squash-merged already | — |

**The root cause, in one line:** github.io runs `main`, and the local host runs whatever an agent last
checked out — so the two disagree by default, and nothing on either page says which version it is.

## 2. The rule this plan puts in place

1. **`main` is the only thing that ships.** github.io, the local host Rob plays on (8768), and the guest
   gateway (8769) all run `main`.
2. **Branches are previewed, never played.** A branch runs on a spare port (8778/8779) from the repo
   checkout — never on 8768, never on github.io.
3. **Every copy says what it is** — commit and date — and each side can see the other's.
4. **Work reaches `main` quickly.** Short branches, merged when green; a branch that changes what users see
   does not sit unmerged.

## 3. The work, in order

Each phase is one PR unless it says otherwise. Every PR: the full gate (`PAGE_BUDGET_REQUIRED=1
GEOMETRY_REQUIRED=1 bash runtests.sh -q`), a test that fails when the change is broken (broken on purpose
once), and the merge rules in `AGENTS.md`.

### Phase 0 — converge what exists (one session; needs Rob's go, decision 3)

| Step | What | Proven by |
|---|---|---|
| 0.1 | Merge **#358** (Engine 2.3b) into `main`, after re-running its checks | `git merge-base --is-ancestor origin/claude/engine-blockers origin/main` |
| 0.2 | Bring **#359** up to date with `main` (it will then contain 0.1) and merge it — a merge commit, since its commits carry their own reasoning | the same, for `claude/engine-hosting`; github.io's Play tab shows the pointer, not the lobby |
| 0.3 | **#290**: rebase onto `main` or close as superseded — Rob's call | its PR state |
| 0.4 | **The 58 branch refs**: sort into *already in `main`* (content merged by squash — delete), *superseded* (close), *live* (keep). A `cursor/*` or `codex/*` branch is not an agent's to delete — a list for Rob | a written list in the PR; the remaining refs, each with a reason |
| 0.5 | Restart the 8768 host once `main` has everything (Rob's rule: restart after merges that touch `game/`) | `/api/health` answers |

### Phase 1 — the local host always plays `main` (1–2 sessions)

- **1.1 A play copy made from `main`.** `C:\Users\robmi\CrankMagic\play`, filled by `git archive
  origin/main` — a plain copy, not a second git checkout, which keeps AGENTS.md's rule that no agent runs
  git anywhere but `repo`. The Start Game shortcut and `start-crankmagic.ps1` run the host from it.
  On start, the launcher fetches `origin main` in `repo` (read-only for the working tree) and, when
  `origin/main` has moved, rebuilds the copy into a temporary folder and swaps it in — **only when no table
  is open** (`/api/table/readiness` answers 409), so a game is never pulled out from under a player.
- **1.2 What the copy needs from the host.** `serve-review.mjs` builds its served-file list from `git
  ls-files` at startup; a copy without `.git` needs a `files.json` manifest written at archive time instead.
  Game state (`game/.local`: games, journals, host records) moves to `C:\Users\robmi\CrankMagic\play-state`
  so swapping the copy loses nothing. The existing folders are **copied, not moved** (AGENTS.md: no agent
  relocates what it did not create); Rob removes the originals when satisfied.
- **1.3 Previews stay previews.** `start-crankmagic.ps1 -Preview` serves the repo checkout on 8778/8779
  with no tunnel. `qa-pod.mjs` defaults to 8768 today — it moves to 8778, so a test never touches the play
  host. `board-shots.mjs` already defaults to 8778.
- **1.4 The skill and the docs.** `game/skills/start-crankmagic/SKILL.md` launches the play copy;
  `AGENTS.md` gains rule 2 of §2.

*Proven by:* with `repo` on a feature branch, the Start Game shortcut serves `origin/main`'s commit
(`/api/health` reports it — Phase 2); a dry-run test of the launcher's refresh decision (moved / not moved /
table open).

*Rejected:* running `git switch main` in `repo` before starting. It would pull an agent's branch out from
under it mid-task, and it fails outright with uncommitted work.

### Phase 2 — every copy says what it is (1–2 sessions; decision 2 needs Rob)

- **2.1 github.io deploys through a workflow.** Switch Pages from the legacy branch build to a GitHub
  Actions workflow that runs the test gate, writes `version.json` (`{commit, date, branch: "main"}`), and
  publishes — so a failing `main` is never deployed, and the published site can leave out what is not the
  app (`docs/design/` copies, `game/.local`, tools). Run it by hand first; flip the Pages source only once a
  run has published a working site.
- **2.2 The local host stamps itself.** The play copy gets the same `version.json` at archive time;
  `/api/health` returns it.
- **2.3 Both show it.** One quiet line — `main · f1c542c · 2026-09-23` — in the web app's Menu and in the
  local host's lobby header.
- **2.4 Each side can see the other.** The lobby reads github.io's `version.json` (Pages serves it
  cross-origin) and, when github.io is newer, says so with the instruction — *"Your local host is running an
  older version than CrankMagic on the web. Close the table and start it again to update."* The Play
  pointer on github.io reads the host's `/api/health` where the browser's Local Network Access prompt allows.

*Proven by:* the workflow publishes `version.json` (checked in CI); a test that `/api/health` carries the
commit; a conformance check for the version line on both pages.

### Phase 3 — one set of data (folds into the direction's pieces 3–5)

- **3.1** Decks travel by backup file (`docs/handoff-2026-09-24-direction.md` §5 piece 3). The backup
  records the app version that wrote it; the host refuses a backup newer than itself, with the
  instruction to update — Rob's rule for behavior that would break a game.
- **3.2** Committed data (`data/live-state.json`, `cards.json`, the rest) reaches players only through
  `main`: the refresh and live-load skills open PRs to `main` rather than committing to a feature branch,
  and the play copy picks the data up at its next start.

### Phase 4 — keep it that way (1 session)

- **4.1 `game/tools/version-report.mjs`** (read-only): `origin/main`'s head; github.io's `version.json`;
  the 8768 host's version; every unmerged branch and open PR with its age; every other copy of the code it
  can find (worktrees, the archive clone). Run at the start of every session, and by `npm run doctor`.
- **4.2 `AGENTS.md`**: 8768 plays `main` only; previews use 8778; a branch that changes what users see is
  merged or closed within three days, and the baton lists every open PR.
- **4.3 Reference copies are marked.** A README in the archive clone and in each `docs/design/` handoff:
  reference material, not the app — never edited, never served.

## 4. Decisions for Rob before anything runs

1. **The play copy**: `git archive` into `CrankMagic\play` (recommended — no second git checkout), or a git
   worktree (faster to refresh, but a second checkout, which AGENTS.md exists to prevent).
2. **Pages through a workflow** instead of the legacy branch build — a repository settings change, which
   is Rob's to make or approve.
3. **Merges and cleanup**: #358 then #359 into `main` now; #290 rebased or closed; which of the 58 branch
   refs may be deleted.
4. **On a version mismatch**: say so and keep going (recommended for the lobby), or refuse — the plan
   refuses only where a mismatch would break something (a newer backup than the host can read).

## 5. Risks

- **Swapping the play copy mid-game.** The refresh runs only at start and only with no table open.
- **The first workflow deploy.** Keep the legacy build until a hand-run of the workflow has published a
  working site.
- **Game history in two places** during 1.2's copy. The report tool (4.1) lists both until Rob removes the
  originals.
- **Squash-merged branches look unmerged.** 0.4 compares content (`git cherry`, file diffs), not ancestry,
  before calling a branch safe to delete.

## 6. Done means

- `node game/tools/version-report.mjs` prints **one commit** for github.io, the play host and
  `origin/main`, and no user-facing branch older than three days.
- github.io and `127.0.0.1:8768` show the same version line.
- With an agent's branch checked out in `repo`, the Start Game shortcut still plays `main`.

## 7. How it fits with the direction

Do Phase 0 first: it puts #358 and #359 on `main`, so the direction's work
(`docs/handoff-2026-09-24-direction.md`) starts from the one source instead of adding a 25th unmerged
commit. Phases 1–2 can run alongside the direction's pieces 1–2; Phase 3 is the direction's pieces 3–5.
