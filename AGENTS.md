# Rules of engagement for AI systems working in this repository

Several AI systems hand work to each other here — Claude Code on Personal-HP, Claude in a cloud
container, Codex, Cursor, Grok Bot. Two never work the same thing at once: since 2026-10-12 two may work
at the same time, each in its own lane of files (*Lanes*, below). This file says how to build;
Linear says what to build (*The work is in Linear*, below). Read both before doing anything else.

## The work is in Linear: one loop

Rob, 2026-10-29: *"I want 1 structure for the organization of work: My input put into either backlog or onto the
Roadmap, then Roadmap > Epics/Features/Stories/Tasks in Linear > Execution by a GPT or Claude > GitHub update + Linear
Update + Roadmap and backlog (where applicable) update. Next session is told to pick up next item on the roadmap, it
looks at roadmap, looks at what's in progress or up next, identifies the associated Linear records, and continues the
loop. The PR drafts contain the summary of what was done. So yes, you can retire anything that doesn't support that
end-to-end pattern."* He chose Linear as the roadmap's home.

- **The roadmap is Linear initiative I-1** ("CrankMagic Commander Experience — the north star"): its projects (epics)
  in status Planned or In Progress, by priority; milestones are features, issues are stories, sub-issues are tasks.
  Issues in status **Backlog** are the backlog. **Rob's call** marks his queue. The full rules are the initiative's
  document **"How work flows: the one loop"**; read it before your first item.
- **Rob's input is filed before it is built:** an issue in the right project, his words quoted and dated, Backlog
  unless he says it goes on the roadmap (Todo). Only Rob moves an item between Backlog and Todo or changes the order.
- **"Pick up the next item"** means: first an issue handed back to Todo with a "Handed off" comment, else the
  highest-priority Todo issue in your lane (its **Lane** label) that is not blocked and not Rob's call.
- **The lock is the issue's status.** In Progress means a session holds it; claiming it is setting In Progress with a
  comment `Held by <platform/session>, branch <branch>, since <date>`. Two sessions never hold the same issue.
- **Close the loop in the same turn as the push or merge:** the PR body is current; the issue gets the PR link and a
  three-line summary (done, proven by, outstanding); Done when merged; `On staging at <sha>` / `In production at
  <sha>` on each issue a release carries; anything new found is a new issue. Stopping early: push, set the issue back
  to Todo with `Handed off: <state>; next step; branch; PR`.
- **Retired on 2026-10-29:** `docs/ACTIVE.md` as the lock and the record (kept, frozen, as the archive of what came
  before), the readout and its feeds (`docs/readout/`, `tests/readout-feeds.mjs`), per-session handoff documents (the
  draft PR is the handoff), the root `BACKLOG.md` and the roadmap draft under `docs/program/` (their open items are
  Linear issues now).

## The branch belongs to one agent

Branches are named `<agent>/<rob-key>-<topic>` (`claude/rob-228-lag-instrumentation`) — `claude/`, `codex/`,
`cursor/`, `grok/`. One agent owns a branch. Work is opened early as a **draft PR** whose title starts with the issue
key, so the next session gets a URL, a CI status and the summary of what was done in one object.

## Lanes: two systems at once, never on the same files

Rob, 2026-10-12: *"Have another AI platform work on the UI and player interaction branches while you work on the
engine and finishing card loads, then cleanly merge."* So two systems may now work at the same time, each in its own
**lane**. A lane is a set of files, and nobody edits a file of another lane. Any system may hold a lane: Fable or another
Claude session, Codex (Astra), Cursor, or Grok Bot. Since 2026-10-18 there are five lanes at once, one per AI session
(Rob: two Codex sessions, two Claude sessions, Grok's workers), organized around his north star in Linear.

| Lane | Its files | Its branches |
| --- | --- | --- |
| **Claude · Engine** | `game/**` (the engine and the room), the Worker's routing and rooms (`cloud/worker.mjs`, `play-worker.mjs`, `game-room.mjs`, `tables.mjs`, `ai.mjs`, `access.mjs`, `migrations/**` and every migration's number), `data/engine/**`, the release and CI tooling, the engine and room suites, the release branches | `claude/admiring-franklin-58cxy4`, then `claude/engine-<topic>` |
| **Claude · Deck intelligence** | The models and data under the screens: the generator, the simulator and its join, the classifier, strategies, loops, the graph's scoring, prices and card data and their tools, `cloud/advise*.mjs`, `sim/**`, `tools/sim/**`, `data/**` except the engine's, `.claude/skills/**`, `docs/program/**` | `claude/deck-<topic>` |
| **Codex · Play** | The game screen and the player's interaction with it: `crankmagic-board.js`, `crankmagic-table.js`, `crankmagic-tabletop.js`, `crankmagic-seat-art.js`, `crankmagic-sea.js`, `crankmagic-audio.js`, `crankmagic-stage.js`, `crankmagic-stage.css`, `crankmagic-mats.css`, `crankmagic-online.*`, `crankmagic-lobby.js`, `crankmagic-game.js`, `ui-prototypes/**`, `assets/audio/**`, Settings' Play card (in its own file once extracted), `docs/play-overhaul/**`, `docs/ui-lane/**`, and the browser suites that drive them | `codex/play-<topic>` |
| **Codex · Workshop** | Every screen outside the boards: the app shell and pages, `crankmagic.css`, `crankmagic-design.css`, Decks, the Lab, Library, Discover, Buy, Settings, accounts, sharing, the tour, the collection model and repository, `cloud/library.mjs`, `cloud/sharing.mjs`, `cloud/access-invites.mjs`, `cloud/mail.mjs`, `design/**`, `docs/design/**`, and their suites | `codex/workshop-<topic>` |
| **Grok** | Only the files a package under `docs/grok/` names for a task, exclusively | `grok/<task>-<topic>` |

The file-by-file table, the seams between the lanes and the rule for deciding versus surfacing to Rob are in
`docs/program/README.md` (October 18, 2026). Each lane's issues carry its Lane label in Linear.

Linear's In Progress issues say who holds what now. `docs/program/workstreams/<lane>.md` is each lane's brief; `docs/ui-lane/README.md` is the Play lane's older brief and still holds where they do not differ.

- **The room's view is the seam.** The UI lane reads `CrankRoomView@1` (`docs/ui-lane/gameplay-anchor.md`) and never
  edits `game/` or `cloud/`. A field it needs is asked for as a Linear issue labeled Shared contract. The engine lane
  adds it in a small PR, merged first, and the UI lane builds against `main`.
- **Shared files have one rule each:**
  - **Asset versions** (`?v=` in `index.html`, `crankmagic.html`, `crankmagic-sw.js` and `crankmagic-app.js`): the UI
    lane bumps them, and a merge regenerates them with `node tests/asset-versions.mjs --update`, never by hand.
  - **The README's suite count:** whoever merges second sets it to the count.
- **Merging:** each lane merges `main` into its branch before marking a PR ready. A merge commit, never a rebase or
  force-push of a branch another system has pulled.
- **One release owner:** the engine lane's session (Claude · Engine) releases staging (`tools/release-staging.sh`), and
  production on Rob's go. Every other lane merges to `main` and says so on its Linear issue.
- **A concept from a prototyping tool** comes back as an exported folder and a `HANDOFF.md`. The UI lane ports it into
  the board; it does not merge it as it is. A framework for the board is Rob's decision.
- Every other rule in this file holds in both lanes. That includes breaks, the four things a handoff states, and what
  a system cannot prove.

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
claim; and what is outstanding, with the reason. Anything else is narrative. The handoff is the draft
PR's body, kept current, with a short version on the Linear issue; there is no separate handoff file.

## Merging to `main`

An agent may merge to `main` when it has followed standard practice, and says so: the
readiness checks re-run by the merging session rather than taken from the handoff (base
unmoved, no conflicts, CI green on the head), the suites the change touches green locally and
the scan clean before the push (`tools/local-ci.sh <ref> 0`), and a merge commit or rebase rather than a
squash whenever the commits carry their own reasoning and proof. Rob set this on
2026-09-19; before that, merging was his alone. Closing someone else's PR is still not an
agent's call unless the PR is superseded by one the agent opened and the report names it.

**CI is one run per PR, and the local gate stands in when Actions cannot run.** The repository
is public since 2026-10-06 (Rob's choice, D7 of `docs/review-response-2026-10-05.md`), so Actions
runs on GitHub's runners without a minutes allowance; while it was private on the free plan with a
$0 budget, a spent allowance stopped every job until the next billing cycle. So: work on a PR as a
draft (drafts are not run), mark it ready when it is finished, and merge on one green run of the
head. Being public also means a self-hosted runner is never attached to this repository: a fork's
pull request could run on it. When Actions cannot run it (the job fails within seconds with no
log, on `main` as well), the PR merges on `tools/local-ci.sh` instead: the workflow's own steps and toolchain
on a clean checkout of the exact head (merged with `main` if `main` has moved), run twice,
with a scan for secrets and personal addresses in what the PR adds. Its closing PASS block
goes on the PR as a comment before the merge, and the merge report says the merge was made
on the local gate. Rob set this on 2026-09-28, choosing not to wait out a spent allowance;
the Actions run is still the rule whenever Actions can run.

**The suites run several at a time, and none forever.** `runtests.sh` hands them to
`tools/run-suites.mjs`: `SUITE_JOBS` at once (the cores less one, at most four), then the
browser suites each alone -- their waits were written for a quiet machine -- and a suite still
running after 20 minutes stopped and failed. On the cloud container's four cores a run of the
suites takes about 14 minutes, from about 20 one at a time. Leave the machine to the gate while
it runs: on 2026-10-03 a gate whose machine was also running suites lost its second run to a
browser suite that waited on a page for good, and on 2026-10-04 a browser suite run beside two
engine suites waited thirty seconds for a button to hold still.

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

## The game fits the window; it never scrolls

Rob, 2026-10-28, a standing rule: *"No scrolling down to see more of the game. The game always fits the visible window. (You can scroll down within panes in the game, but not the full game itself as though it's an informational website)."* Every Play view (Table, Focus and 3D; the phone layout has not been audited against this) is the size of the window: the boards, the hand, the header and the drawers fit it, and what does not fit shrinks (a board smaller, a caption shorter, a control folded away), never grows the board taller than the window. A pane inside the game (a drawer module, a mat's own rows, the log) may scroll; the game itself does not. A change that makes `#cm-board` scroll, or sets a minimum size that overflows it, is a defect; `tests/board-flat-views.mjs` proves it at three small window sizes in every view.

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

## Symbols first, words last

Rob, 2026-10-25: *"We need to shift the standing instruction on CrankMagic development that we always show as little
text instruction as possible, always deferring to visual symbols, colors, indicators and short-hand wherever possible.
This includes in actions. But always enough that the basics, e.g. source/cause > action > target/effect objects and
events are clear and card references always have a very quick path to viewing and reading the card."*

- **Prefer a glyph, a color, an indicator or shorthand to a sentence**, everywhere: menus, actions, callouts, prompts,
  status. A paragraph of instruction is a design to replace, not to add to.
- **The minimum that must stay clear:** the source or cause, the action, and the target or effect of every object and
  event (*Fauna Shaman* → ⤳ *Rob*), in that order.
- **Every card reference is one press from the card itself**, to see it large and read it.
- Words that are an accessible name (`aria-label`, a title) stay whole: a symbol on screen still says what it is to a
  screen reader. The refusal rule above still names the specific problem and the way out, as briefly as it can.

## Mandatory visual acceptance and budget checkpoints

These rules apply to any change affecting visible UI, layout, typography,
responsive behavior, animation, or interaction.

### Definition of done

- Passing tests, builds, and CI does not establish visual correctness.
- Inspect the running application and compare it with the approved
  wireframes, screenshots, and specifications.
- Saving screenshots without opening and inspecting them is insufficient.
- Never claim visual acceptance for a screen or state you did not inspect.
- If the application cannot be viewed, report visual acceptance as blocked.
  Do not substitute code inspection for rendered evidence.

### Before implementation

- Extract a short visual acceptance checklist from the existing approved
  plan. Do not make the user repeat requirements already documented.
- Identify the authoritative visual references. Surface contradictions
  before implementing the affected area.
- Record the current appearance and preserve a recoverable Git checkpoint.
- Identify existing interactions that must remain working, including
  dragging, zooming, camera tilt, scrolling, drawers, and card interaction.
- State the bounded scope, first visible milestone, and budget checkpoint.

### Early visual checkpoint

- Render and inspect the first representative screen within 30 minutes
  of starting implementation, or after the first meaningful UI change,
  whichever comes first.
- If that is not possible, stop implementation at the checkpoint and
  report the blocker and work completed.
- Complete one representative screen before propagating a layout or
  styling pattern throughout the application.
- Compare the actual implementation with the approved reference before
  expanding scope. Correct visible deviations first.
- Request user review when a material design choice lacks an approved
  reference. Do not invent a replacement design silently.

### Required visual inspection

Inspect the whole screen and affected components using realistic content,
the user's target viewport, and relevant application states.

Verify:
- Drawer and panel boundaries, including their top and bottom alignment.
- Font family, size, weight, line height, baseline alignment, and hierarchy.
- Readability at the final displayed size after zoom, transforms, and
  camera projection. CSS font sizes alone are not evidence of readability.
- Clipping, overflow, truncation, overlap, spacing, and excessive empty space.
- Long names, populated panels, empty states, and relevant player counts.
- Reachability of controls and preservation of existing interactions.
- Relevant viewport sizes and user-controlled display or camera settings.

Use side-by-side comparisons or image overlays when useful. Distinguish
intentional differences from defects using the approved requirements.

### Budget and progress checkpoints

- Honor the user's stated time, credit, token, and test limits.
- If no limit is supplied, use a mandatory checkpoint every 30 minutes.
  This is a review interval, not permission for unlimited work.
- At each checkpoint, report:
  1. What is complete and what has been visually verified.
  2. Remaining defects, uncertainty, and scope.
  3. Elapsed time and usage when available; never invent usage figures.
  4. The next bounded increment and its expected cost or duration.
- Stop and obtain direction before exceeding an explicit budget, materially
  expanding scope, or continuing after two unsuccessful attempts to fix
  the same defect.
- Do not start long test runs before the first visual checkpoint unless
  they are necessary to render or safely evaluate the application.
- Do not repeat broad verification without a concrete reason.

### Failure handling and regression protection

- Visible divergence from the approved design blocks completion.
- Pause dependent work when a shared layout or typography defect appears.
  Fix the underlying issue before extending the affected pattern.
- Do not weaken assertions, replace reference images, or redefine
  acceptance criteria merely to make failing checks pass.
- Do not rerun failed tests unless an actual defect required a repair.
  Document timing or flaky failures and existing evidence instead.
- Following a repair, run the affected verification. Broaden testing only
  when the change or remaining risk justifies it.
- Keep changes small and independently reversible. Preserve the rollback
  checkpoint until acceptance is complete.

### Final acceptance and release

- After integration, inspect the combined application again. Separate
  component reviews do not establish whole-screen correctness.
- Provide a concise requirement-to-evidence checklist with actual
  screenshots, inspected states, and any unresolved deviations.
- Report functional verification and visual acceptance separately.
- Do not declare completion, merge, or promote a UI change with unresolved
  visual acceptance failures unless the user explicitly accepts the named
  deviations.
- Visual QA is the implementing agent's responsibility. User review is an
  additional checkpoint, not a substitute for the agent's inspection.

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
