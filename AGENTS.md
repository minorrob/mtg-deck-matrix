# Rules of engagement for AI systems working in this repository

Several AI systems hand work to each other here — Claude Code on Personal-HP, Claude in a cloud
container, Codex, Cursor. Two never work the same thing at once, so these rules are about handoff
quality, not concurrency. Read `docs/ACTIVE.md` before doing anything else.

## The baton is a file

`docs/ACTIVE.md` says who holds the work, on which branch, since when, and what they are doing.
A session's first act is to read it; its last act is to update it. It lives in git so a cloud
container and a local session read the same answer.

## The branch is the lock

Branches are named `<agent>/<topic>` — `claude/`, `codex/`, `cursor/`. One agent owns a branch.
A branch that is handed off is opened as a **draft PR**, so the next session gets a URL, a CI
status and a place for the handoff in one object.

## No session ends with uncommitted work

Push before you stop. A pushed branch costs nothing and makes every local folder disposable; an
unpushed edit makes a folder load-bearing and a migration frightening.

## Know what you cannot prove

| System | Can prove | Cannot prove |
| --- | --- | --- |
| Local session on Personal-HP | Suites, `preflight.mjs`, Forge deck resolution, Java builds, a real table | — |
| Cloud container | Suites and fixtures | Anything touching Forge, the JDK, a browser, or a real table |
| Editor-resident agents | Whatever they actually ran | Anything they did not execute |

Work that needs Java or Forge is assigned to a local session by definition. A claim that depends
on Forge is **unproven until a local session proves it**, and the handoff says so in those words.

## A test that cannot fail is a comment

Break the thing under test, watch the test go red, restore it. Assertions have been written here
that passed without proving anything — one was a negative lookahead that matches every string.
The definition of done for the online subsystem is in `game/docs/readiness-plan-2026-09-18.md` §10.

## A handoff states four things

The branch and commit it describes; what is proven versus assumed; the command that proves each
claim; and what is outstanding, with the reason. Anything else is narrative.

## Things no agent does

- Merge to `main` or close a PR. That is Rob's.
- Force-push or rewrite history on a branch someone else has pulled.
- Delete or relocate a directory it did not create — including with `git clean`, `rm -rf` or
  `git worktree remove`. `commander-plan-source` was once described in good faith as unrelated to
  the work; it was the object store every worktree depended on.
- Run git inside any copy of this repository other than `C:\Users\robmi\CrankMagic\repo`.

## Where things are on Personal-HP

`C:\Users\robmi\CrankMagic\` — `repo` (this clone), `forge`, `runtime`, `workbench`, `archive`.
Forge and the JDK are found through `CRANKMAGIC_FORGE_ROOT` and `CRANKMAGIC_JDK_ROOT`. Nothing
git touches lives in a synced folder. `node game/tools/preflight.mjs` is the one-command gate.
