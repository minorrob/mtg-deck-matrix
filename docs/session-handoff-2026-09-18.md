# CrankMagic Online — session handoff, 18 September 2026

**For a Claude Code session running locally on Personal-HP.** Read §1 and §2 before touching
anything. The previous session ran in a cloud container with no access to this machine, which is
why everything below is proven against fixtures and nothing is proven against Forge.

---

## 1. Where the work is

Branch: **`claude/sleepy-carson-saeway`**, pushed, open as draft
[PR #268](https://github.com/minorrob/mtg-deck-matrix/pull/268).

It contains `main`, the Personal-HP branch (`cursor/personal-hp-online-2026-09-17`), and PRs
**#259–#263** and **#264–#267**, all of which are now fully contained in it — verified by
`git merge-base --is-ancestor`, not by eye. Those PRs can be closed as superseded.

`./runtests.sh` → **92 suites, exit 0**, in the cloud container. Not yet run on this machine.

The plan of record is **`game/docs/readiness-plan-2026-09-18.md`**. Its §12 is the run-book that
this session exists to execute.

### Shipped this session

| Track | What |
|---|---|
| A | Tree convergence, asset-pin alignment, and the invitation bug (§2 below) |
| B | Forge card resolver; requirement 4.1 made blocking; Force Prompt fixed on lobby tables; host force-advance; pre-flight doctor |
| C.3–C.5 | One definition of what blocks a start; 10s countdown with Forge booting *during* it; launch progress stages |
| D | Skip to end; pilot status and prompt escalation; freeze telemetry |
| E.1 | Rematch drops the people who decline instead of waiting on them |
| E.3 | #264–#267 landed — the lobby→Decks and report→deck edges of the loop |
| E.5 | Paste parser that reads what the invitation email actually asks for |

### The two findings that mattered most

**The invitation bug.** `Email Invite` opened the private lobby as table T1 and mailed a link bound
to it; `Start` then called `/api/prepare` + `/api/start` unconditionally, and `/api/start` replaced
the table with a new random `tableId`. The emailed link was sealed to T1
(`game/contracts/seat-access.mjs:22`), so a guest on a clean browser was told the invitation had
expired — on a link minted minutes earlier. Fixed in two places, and the invariant is held by a test
in `game/tests/table-foundation.test.mjs`. **Never verified by a link actually opening.**

**Requirement 4.1 did not exist.** `ai-compatibility.mjs` guessed a `cardsfolder` filename from the
printed name, deleting diacritics rather than folding them and concatenating both faces of a
double-faced card — and then discarded the result, because its only consumer read a different
field. Decks Forge could not load passed preparation, Ready Up and the countdown, and failed at
engine load. Replaced by `game/contracts/forge-card-index.mjs`, which reads Forge's own scripts, and
made a blocking gate.

---

## 2. The immediate blocker: OneDrive

**Rob has decided to move the whole working set off OneDrive. That is the current task, ahead of
everything else.** He asked for it done properly: *no step proceeds until the one before it is
proven.*

Everything lives under `C:\Users\robmi\OneDrive\...`, and OneDrive holds files open while git is
modifying them. Symptoms seen tonight, all the same cause:

- `Deletion of directory '…/commander-plan-source/.git/objects/00' failed. Should I try again?`
  during git's automatic housekeeping
- The same prompt for `_e2e-confidence/fixes` during `git checkout`, which **interrupted the branch
  switch — its completion is unconfirmed**

`git config gc.auto 0` was suggested for the working repo; unknown whether it was applied.

### The migration plan

1. **Inventory** — establish what is there and how the pieces are linked ← *stopped here*
2. **Secure** — push everything uncommitted so no folder is load-bearing
3. **Choose the destination** — scope and target path
4. **Copy, not move** — the original stays until the copy is proven
5. **Repair git internals** — if anything is a worktree or shares an object store
6. **Re-point** — desktop shortcut, Forge path, any absolute paths
7. **Verify** — `node game/tools/preflight.mjs` green from the new location, then a real game
8. **Retire the old copies** — only after 7 passes

### What step 1 needs to answer

Run these in `…\work\commander-phase-c` unless noted. All read-only.

```powershell
git status -sb
git rev-parse --git-dir; git rev-parse --git-common-dir; git worktree list
Get-Item .git | Select-Object Name, Mode, Length
cd ..; Get-ChildItem -Directory | Select-Object Name; Test-Path "forge\forge-gui\res\cardsfolder"
Get-ChildItem -Directory | ForEach-Object { "{0,-34} {1,10:N0} MB" -f $_.Name, ((Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum/1MB) }
```

Looking for:

- **Which branch `commander-phase-c` is actually on.** The checkout was interrupted; do not assume
  it completed.
- **Whether `commander-phase-c` and `commander-plan-source` share a git object store.** Git's
  housekeeping, run from inside `commander-phase-c`, was deleting objects under
  `commander-plan-source/.git/objects` — so something links them. If `.git` is a *file* rather than
  a directory, it is a linked worktree and step 5 is mandatory. **Until this is settled, do not
  delete or move `commander-plan-source`.**
- **Whether Forge and the Java runtime are also inside OneDrive.** They are referenced as `../forge`
  and `../commander-runtime/…`, so almost certainly yes. A multi-gigabyte Forge tree under
  continuous sync is the likeliest real cause of tonight's lock errors, and moving the repo without
  moving Forge would fix half the problem.
- **How much data the copy involves.**

### Known state of the other folder

`commander-plan-source` is on `codex/online-multiplayer` with five uncommitted modified files
(`crankmagic-app.js`, `crankmagic-collection.js`, `crankmagic-sw.js`, `crankmagic-tabletop.js`,
`crankmagic.css`). That branch is **fully merged into `main`** and its last commit is 15 September,
so only the uncommitted edits are unique. Nobody has decided whether they matter. `git status` there
is clean-reading, so the failed deletions damaged nothing.

---

## 3. After the move: run §12

`game/docs/readiness-plan-2026-09-18.md` §12. Nine steps, about fifteen minutes.

Steps 1–3 are now one command:

```powershell
node game/tools/preflight.mjs
```

It runs every suite, the host doctor and the deck-against-Forge check, and exits non-zero if
anything that matters failed. **A local session can run this directly** — the cloud session could
not, which is the whole reason this document exists.

Steps 4–9 need a running game, a second browser and somebody watching the screen. The highest-value
three, if time is short:

- **Step 2/3** (`preflight.mjs`) — does *this* Forge know *these* decks? No fixture can answer it.
- **Step 6** — the invitation, on a clean browser, **after pressing Start**. The sequence that used
  to void the link.
- **Step 8** — pasting a deck in the invitation email's own format, which nobody has ever been able
  to do.

---

## 4. What is still outstanding

| ID | What | Why it is not done |
|---|---|---|
| C.1 | Unknown-card resolve UI — type, searchable name, hover art | Data is ready (`unresolved` comes back structured from both APIs); the page is not written |
| C.2 | Connection panel | Server side is done in `/api/table/readiness`; the panel is not drawn |
| C.6 | Visible first-player roll | Needs `chooseStartingPlayer` overridden in the engine adapter — Java, which the cloud session could not compile or exercise. `ForgeProbe.java:292` is a working reference and `game/tools/build-forge.ps1` builds it. **A local session with the JDK can do this.** |
| E.4 | Server-side 99-engine repair loop | The lobby screen strips and backfills; `setup-catalog.mjs` still throws on a violation, and its last-resort backfill is basic lands, which yields a legal 100 that is not a deck |
| F.1 | Move the lobby logic out of `crankmagic-game.js` | §6.1 of the plan: that file grew 2,204 lines and holds seat mapping, deck resolution, GC backfill, invite minting and Start orchestration, while `crankmagic-lobby.js` — whose header says the screen "spells nothing of its own", and which has a Node suite — stayed untouched at `?v=1`. There is no `tests/crankmagic-game.mjs`. **This is the fix that stops the regressions.** |
| — | Self-test #2, the Desktop `.dek` library | `/api/desktop-deks` and the embedding are absent from the pushed branch. Marked Fixed in the 17 September handoff. Either the commit missed them or they were never built. Needs Rob's call. |

---

## 5. Standing rules, and how they were broken

Rob's rules, locked before this session: UAT before prod; no stubs as ready; verify the way *he*
sees it, not by API health alone; capture bugs, plan, then execute.

The rules were not the gap. **Enforcement was.** Two mechanisms let green tests coexist with an
unplayable table, and both are now closed but worth not reopening:

- `runtests.sh` iterated `tests/*.mjs` only, so 22 `game/tests` suites sat outside the runner
  entirely. A regression there could not fail the build. `collection-lobby-draft.test.js` arrived in
  #264 as 1,012 lines of passing tests at the repository root, invisible the same way — the same
  shape recurring. Both are in the runner now.
- `tests/asset-versions.mjs` had real cache-poisoning drift pinned the whole time, in the runner,
  one command away. It was never run. It has caught genuine drift **twice more** since.

**Definition of done for this subsystem** (plan §10): `./runtests.sh` exits 0 with `game/tests`
included; `preflight.mjs` green on this machine; anything touching spec steps 3–7 proven by one real
table reaching turn 3; visual items proven by a screenshot; unresolvable cards, disconnected seats
and unvalidated decks are blockers, never warnings; a documentation claim ships with the command
that proves it.

One more, learned the hard way this session: **a test that cannot fail is a comment.** Several
assertions were written that passed without proving anything — one was a negative lookahead that
matches every string. Break the thing under test, confirm the test goes red, then restore it. That
is how `check-my-decks.mjs`, `collection-lobby-draft.mjs` and the library-sharing gate were
validated.
