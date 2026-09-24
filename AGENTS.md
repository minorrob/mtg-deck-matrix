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

## Merging to `main`

An agent may merge to `main` when it has followed standard practice, and says so: the
readiness checks re-run by the merging session rather than taken from the handoff (base
unmoved, no conflicts, CI green on the head), the full suite green locally with
`PAGE_BUDGET_REQUIRED=1 GEOMETRY_REQUIRED=1`, and a merge commit or rebase rather than a
squash whenever the commits carry their own reasoning and proof. Rob set this on
2026-09-19; before that, merging was his alone. Closing someone else's PR is still not an
agent's call unless the PR is superseded by one the agent opened and the report names it.

## American English, always

Everything written here is American English: prose, comments, commit messages, labels, tests,
documents. Never the British spellings: write color, center, gray, license, organize,
recognize, catalog, canceled, toward, and their kin, with the American endings. Sources arrive in UK style -- the Claude Design
handoff did -- and are converted when quoted or applied; the designer's verbatim handoff folder
under `docs/design/` is the one exemption, as source material. `tests/feature-wiring.mjs` counts
UK spellings across tracked files and the count only goes down; a commit that adds one fails.
Rob set this on 2026-09-20 and it applies to every tool he works with, not only this repository.

## Decisions inside the game belong to the players

Rob, 2026-09-23: *"any decisions that takes place within the game the players should be given that
option, and we should not make the decision in hardcoded here for them."*

If a rule or a card offers a choice, the choice is put to whoever owns it — never resolved in code
because one branch is easier or because the engine could infer what a player "probably" wants. The
engine plan already says this for the rules layer (`docs/engine/PLAN.md` §3.2, *every decision is an
offered choice*); the standing rule extends it to the whole product. Ordering triggers, ordering
replacement effects, which mana to spend when more than one payment is legal, whether to take a
"may" — all of them are asked. An automatic answer is only correct where the rules leave no choice
at all, and where that is true the code says so and cites the rule.

## Behavior that would break a game is refused, with instructions

Rob, 2026-09-23: *"when there might be human behavior that would cause issues in the game ... then
we don't allow the behavior, but we do provide the instructions for the user."*

Not a warning that can be clicked past, and not a silent correction. The action is refused, and the
refusal says what is wrong and what to do instead — in that order, naming the specific thing.

The worked example is the un-invited seat (U-09). Pressing Start on a table with a seat marked
human that nobody was invited to is refused with *"Sam's seat is marked as a human but nobody has
been invited to it. Remove the seat assignment or change it to AI to start the game."*
`unfilledHumanSeats` in `game/contracts/table-lifecycle.mjs` is the check, and two details there are
the rule's shape rather than that feature's:

- **It fires on the action, not continuously.** Written into `countdownBlockers` first — the list
  read to describe the table at rest — it made a fresh four-seat table report an error for being a
  fresh four-seat table. An instruction about one action belongs on that action.
- **It distinguishes a mistake from normal play.** A seat emptied by somebody leaving, a reconnect
  grace expiring, a rematch decline or a withdrawn invitation is `released`, and is never refused.
  Only the chair nobody ever accounted for is.

## Things no agent does

- Force-push or rewrite history on a branch someone else has pulled.
- Delete or relocate a directory it did not create — including with `git clean`, `rm -rf` or
  `git worktree remove`. `commander-plan-source` was once described in good faith as unrelated to
  the work; it was the object store every worktree depended on.
- Run git inside any copy of this repository other than `C:\Users\robmi\CrankMagic\repo`.

## Where things are on Personal-HP

`C:\Users\robmi\CrankMagic\` — `repo` (this clone), `forge`, `runtime`, `workbench`, `archive`.
Forge and the JDK are found through `CRANKMAGIC_FORGE_ROOT` and `CRANKMAGIC_JDK_ROOT`. Nothing
git touches lives in a synced folder. `node game/tools/preflight.mjs` is the one-command gate.
