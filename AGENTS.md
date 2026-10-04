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
unmoved, no conflicts, CI green on the head), the suites the change touches green locally and
the scan clean before the push (`tools/local-ci.sh <ref> 0`), and a merge commit or rebase rather than a
squash whenever the commits carry their own reasoning and proof. Rob set this on
2026-09-19; before that, merging was his alone. Closing someone else's PR is still not an
agent's call unless the PR is superseded by one the agent opened and the report names it.

**CI is one run per PR, and the local gate stands in when Actions cannot run.** The repository
is private on GitHub's free plan with a $0 budget, so Actions minutes are a monthly allowance,
and when it is spent no job starts until the next billing cycle. So: work on a PR as a draft
(drafts are not run), mark it ready when it is finished, and merge on one green run of the
head. When Actions cannot run it (the job fails within seconds with no log, on `main` as
well), the PR merges on `tools/local-ci.sh` instead: the workflow's own steps and toolchain
on a clean checkout of the exact head (merged with `main` if `main` has moved), run twice,
with a scan for secrets and personal addresses in what the PR adds. Its closing PASS block
goes on the PR as a comment before the merge, and the merge report says the merge was made
on the local gate. Rob set this on 2026-09-28, choosing not to wait out a spent allowance;
the Actions run is still the rule whenever Actions can run.

**The suites run several at a time, and none forever.** `runtests.sh` hands them to
`tools/run-suites.mjs`: `SUITE_JOBS` at once (the cores less one, at most four), the browser
suites one at a time among themselves, and a suite still running after 20 minutes stopped and
failed. On the cloud container's four cores a run of the suites takes about 11 minutes, from
about 20 one at a time; the browser suites, one at a time, are most of it. Leave the machine
to the gate while it runs: on 2026-10-03 a gate whose machine was also running suites in
parallel lost its second run to a browser suite that waited on a page for good.

**No run twice what another run already proved.** Rob, 2026-10-01: "decrease the # of scans
avoiding those that are redundant, especially between local vs. Github actions. Prefer to leave
with github, and minimize to minimum required before pushes." So while Actions can run, the
whole suite runs there and not also on the builder's machine. Before a push, run the suites the
change touches (a new or changed suite, the suites that read the files it changes,
`tests/data-integrity.mjs` when a suite is added, `tests/feature-wiring.mjs` for wording,
`tests/asset-versions.mjs` when a served file moves) and `tools/local-ci.sh <ref> 0`: the
scan for secrets and personal addresses, which must pass before anything reaches GitHub, and
the merge with `main`. Main is not run again after a merge whose tree is exactly the PR head's
that just ran green (`.github/workflows/tests.yml`).

## The production release

`release/pages` is production's record: it is written only by `tools/release-pages.mjs --commit`, from a
commit of `main`, and what is live at crankmagic.com is always a commit on it. A deploy is `wrangler deploy`
of that same build, made only after `tests/uat/release-acceptance.mjs` passes on it (`docs/release-pages.md`). Unfinished work may reach `main`; what reaches users is decided by
the builder's profile. Rob set this on 2026-09-24, when he chose to merge Account Cloud and Play into
`main` as they are built rather than hold them on long branches.

## The United States, always

Everything written here is American English: prose, comments, commit messages, labels, tests,
documents. Never the British spellings: write color, center, gray, license, organize,
recognize, catalog, canceled, toward, and their kin, with the American endings. Sources arrive in UK style -- the Claude Design
handoff did -- and are converted when quoted or applied; the designer's verbatim handoff folder
under `docs/design/` is the one exemption, as source material. `tests/feature-wiring.mjs` counts
UK spellings across tracked files and the count only goes down; a commit that adds one fails.
Rob set this on 2026-09-20 and it applies to every tool he works with, not only this repository.

**Nothing from anywhere but the United States** (Rob, 2026-09-25: *"I NEVER WANT ANYTHING, grammar,
currency, etc. from anywhere except The US"*). That is wider than spelling:

- **Currency is US dollars, only.** No euros, pounds or any other currency, and no currency switch. A source
  that also carries another currency (Scryfall's `eur`, `tix`) is read for its USD and nothing else.
- **Numbers and dates are formatted as in the US, whatever the reader's browser is set to:** every
  `toLocaleString`, `toLocaleDateString`, `Intl.NumberFormat` and `Intl.DateTimeFormat` names `'en-US'`. A
  date a reader sees is written the US way ("Sep 25, 2026"), never as a bare ISO `2026-09-25`; ISO stays
  for filenames, keys and data.
- **A design or a recommendation that brings in anything else is refused, not built.** The r3 Settings
  wireframe drew a USD/EUR switch; it was recommended and approved before this rule was written, and it is
  dropped (`docs/decisions-2026-09-25.md`, M1 · 8).

Designers get the same rule, as a table of what to write and what never to, in **`docs/design/BRIEF.md`**, which `docs/design/README.md` sends them to first.

`tests/feature-wiring.mjs` holds all three: no formatter without `'en-US'`, no raw date field printed
into a page, and no other currency in anything that ships.

## Sizes are sliders, never steps

Rob, 2026-09-26, and not for the first time: *"anywhere that SML is used, instead it should be the dragging slider
on the scale where you are simply ensuring that we make the minimum on the scale and the maximum, if chosen, still
legible and fit properly within the design and framework ... this may ... be different between mobile and
desktop."*

- **A size the reader picks is a continuous slider** (`<input type="range">`), never S / M / L, never a row of
  size buttons or named steps (Card · Larger · Large · Full), anywhere: cards, pictures, text, tables, the Play
  table. A design that draws steps is built as a slider.
- **The ends are the design's job.** The smallest size keeps every word on the thing legible (no text under
  10px), and the largest fits the screen and the layout around it without sideways scroll or overlap. The range
  may differ between a phone and a desktop, and is clamped when the window changes size.
- **Dragging previews live; letting go saves.** A size is a fact about the screen, so it is remembered per
  device (`localStorage`), not in the library.
- **Proved at both ends.** A suite drags each slider to its minimum and its maximum, at 1400 and at 390 wide,
  and measures legibility and fit. `tests/feature-wiring.mjs` refuses a size picker built from buttons.

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
Forge and the JDK are found through `CRANKMAGIC_FORGE_ROOT` and `CRANKMAGIC_JDK_ROOT`.
**Nothing outside this repository is needed for the plan to 100% (`docs/plan-to-100.md`).**
`forge` and `runtime` serve only the frozen local host and Forge's tools, which M9 retires.
`workbench` and `archive` are history, and what the plans cite from them was brought in on 2026-09-25:
- the UAT runs, now under `docs/uat/`;
- the MTGO research, now `docs/research/mtgo-2026-09-22/`;
- the art sources, now `design/art-source/`;
- the audio pack's notes, now `docs/audio-pack/`;
- the engine's first inventory, now `docs/engine/`.

The Comprehensive Rules text is Wizards'. It is fetched from its official address and is not committed
(`game/tools/check-citations.mjs`). Nothing
git touches lives in a synced folder. `node game/tools/preflight.mjs` is the one-command gate.
