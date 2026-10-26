# Handoff: the feedback loop, PRs 1 to 3, 2026-10-26

*From the Claude cloud session that built them (session `01X2xxK5FjzqAb91gfMipUAB`), for the session that merges them
(Rob: the OpenAI session handles the merges, alongside his other Claude session's work). The plan is
`docs/feedback-loop/PLAN-2026-10-26.html` (#893, the planning branch `claude/sharp-hawking-8lbwy9`). AGENTS.md's four
things, per PR: the branch and commit, what is proven and what is assumed, the command that proves each claim, and what
is outstanding with the reason.*

## The three branches, stacked, in merge order

| # | Branch | PR | Base | Lane of its files |
| --- | --- | --- | --- | --- |
| 1 | `claude/engine-feedback-store` | #895 | main c567c581 | Claude · Engine (`cloud/**`, `tools/release-pages.mjs`, `tests/feedback-store.mjs`); `feedback-schema.js` at the root (the contract module, new) |
| 2 | `claude/workshop-feedback-sheet` | #896 | PR 1's head | Codex · Workshop (`crankmagic-app.js`, `crankmagic-decks.js`, `crankmagic.css`, the pages, `crankmagic-sw.js`) and Codex · Play (`crankmagic-board.js`, `crankmagic-stage.css`, `tests/table-board.mjs`), at Rob's word through the plan's brief; `crankmagic-feedback.js` (new) |
| 3 | `claude/deck-feedback-triage` | #897 | PR 2's head | Claude · Deck intelligence (`tools/feedback-triage.mjs`) and Claude · Engine (`.github/workflows/feedback-triage.yml`) |

Each branch contains the one before it, so **merge in order, 1 then 2 then 3, each with a merge commit** (the commits
carry their reasoning). Merging 3 alone would carry 1 and 2 with it, which is also correct; merging 2 before 1 is not
possible. None of the three was merged by this session: Rob asked for the handoff instead.

**With the AI players branch** (`claude/sharp-hawking-8lbwy9`, its handoff `docs/handoff-ai-players-2026-10-26.md`), agreed
with that session on 2026-10-26: **its branch merges first** (it changes who may spend, and its `cloud/worker.mjs` change
is the smaller), then these three in stack order, each with a merge commit, the asset versions re-recorded with
`node tests/asset-versions.mjs --update` after each merge that bumps a pin, one green Actions run per PR. The collisions
were settled on this side: the store's group test is `feedbackGroup` (that branch's `groupOf` in `cloud/access.mjs` keeps
its name; `cloud/worker.mjs` imports both without a clash); `isOwner` takes that branch's `OWNER_EMAIL` first, in any
letter case, with `INVITE_ADMIN_ID` standing in until Rob sets it; the Requests row here is **15** (that branch holds 14);
`README.md`'s suite count is **602** after all four (main 598, its `engine-threat`, and `feedback-store`,
`feedback-sheet`, `feedback-triage`): whoever merges second sets it, so the merging session writes 602. Its
`cloud/access.mjs` change (`groupOf` added at the end, before `serviceIdentity`) and this one (`deps.service === true` in
`verifyAccess`) do not overlap.

**Where the other session's work meets this:** the shared files are `README.md` (the suite count: PR 3 sets it to 601
on a main of 598; whoever merges second after another PR adds suites sets it to the count, `tests/data-integrity.mjs`
checks it), `docs/ACTIVE.md` (three sections at the top and Requests row 14; each lane's own sections elsewhere are
untouched), the asset pins (`?v=` in `index.html`, `crankmagic.html`, `crankmagic-sw.js`, `crankmagic-app.js`, and
`tests/fixtures/asset-versions.json`: a merge that also bumps pins regenerates with `node tests/asset-versions.mjs
--update` after bumping, never by hand), and `cloud/worker.mjs` (PR 1 adds routes before the library block and two
functions before the AI door; a merge with another Worker change keeps both). `cloud/migrations/0009_feedback.sql` is
the migration number this work took; 0007 and 0008 stay reserved (docs/ACTIVE.md, the engine section).

## PR 1: CrankFeedback@1, the feedback table, the routes

- **Commit:** `86f1f265` on `claude/engine-feedback-store`, from main c567c581 (74f8c228 plus the owner by `OWNER_EMAIL`
  and the `feedbackGroup` name). Actions: PR_1_CI.
- **Proven:** `node tests/feedback-store.mjs` (135 checks: the migration; the schema module's every bound refused by
  name and unknown fields dropped; POST /api/feedback from a signed-in person, the reporter from the token, a screenshot
  dropped with its bytes kept nowhere; ten an hour a person with the eleventh refused and when to retry; the admin GET
  for the owner, by `OWNER_EMAIL` in any letter case or by `INVITE_ADMIN_ID`, and the agent's service token on its own
  application only; PATCH along the six states and no other move). `python3 game/tools/batch/breaks.py
  tools/feedback-store-breaks.py`: 31 breaks, each caught. Also green:
  `card-demand`, `cloud-worker`, `ai-door`, `release-pages` (the schema module and the migration ship with the Worker in
  every cloud profile; a release missing a module the Worker imports is refused by name), `data-integrity`,
  `feature-wiring`, `sharing`, `agent-seat-table`. `tools/local-ci.sh 74f8c228 0`: scan pass.
- **Assumed (Rob's calls, on the plan's defaults, named in the PR):** D1 not Supabase; GitHub Actions for the agent;
  approval by Linear label; screenshots dropped until R2 is on; the invite sender for the reporter's email (PR 5). Also:
  the owner is `OWNER_EMAIL` once Rob sets it, else `INVITE_ADMIN_ID` (production's profile sets neither yet, so there
  the admin routes admit only the agent until one is set); the agent's Access application does not exist yet
  (`FEEDBACK_AGENT_AUD` unset admits no agent).
- **Not proven:** the agent's token against live Access; migration 0009 on staging D1 (applied at the next staging
  release, on Rob's go, as 0006 was: `wrangler d1 migrations apply` through the release tooling).
- **Outstanding, Rob's steps:** an Access application for the triage agent with a Service Auth policy; its audience in
  the staging profile as `FEEDBACK_AGENT_AUD` (a one-line edit of `tools/release-pages.mjs`'s staging vars, the engine
  lane's file); migration 0009 applied to staging D1 at the next staging release.

## PR 2: the control and the sheet

- **Commit:** `85a12f42` on `claude/workshop-feedback-sheet`, from PR 1's head (d884c03d the sheet, 57910cd1 the page
  budgets and the view check, then PR 1's 86f1f265 merged in).
- **Proven:** `GEOMETRY_REQUIRED=1 node tests/feedback-sheet.mjs` (38 checks, a real browser against stubbed routes:
  the glyph on three pages' heads and the Menu, the sheet's tiles and names, the report's every field posted with the
  sheet's header and never the person, the Worker's 429 shown with the text kept, a picture chosen sent as WebP under
  1 MiB, signed out refused with Sign in and Email instead). `tools/feedback-sheet-breaks.py`: 17 breaks, each caught.
  `tests/table-board.mjs`'s Send feedback checks rewritten to the board's richer `held()` and the report's game context;
  `tools/feedback-breaks.py` (10 breaks; the five on the board's half run here: FEEDBACK_BREAKS_RESULT). Also green:
  `feature-wiring`, `menu-help`, `settings-r3`, `data-integrity`, `service-worker`, `asset-versions` (re-recorded: two
  new files, five bumps), `release-pages` 228, `page-budget` 80 (six control budgets raised by one for the glyph, the word budgets unmoved),
  `table-board` 294 (the whole game between two browsers, the Send feedback checks among them).
- **`a11y-board` fails here, and identically on main c567c581:** one contrast reading in the steel-cobalt theme, a mat
  card's power and toughness ("2/2", `.cm-bcard-pt`) read at 1.93 of 4.5 against the card's own picture at one pixel. Run
  on a clean checkout of main in the same container it fails the same way, so it is not this PR's; Actions is the gate
  for it, and it passed there on #895's run of 74f8c228 at 22:44 UTC, before that runner was shut down at 23:05: the
  reading is this container's software rendering of the card picture. Not fixed here: the mat card's label is
  the Play lane's, and a contrast fix is a design change, not a line in this PR.
- **Assumed:** the sheet's place: one ✉ glyph on every page head (`pageHead`), beside More on a deck's page, in the
  board's profile strip and its menu, and the Menu's Send Feedback (the plan said "a glyph in the header" and "the
  board's rail"); the kinds as two glyph tiles, 🐞 Bug and ✦ Idea; the build from `version.json`.
- **Not proven:** the browser's own screen capture (`getDisplayMedia` needs a person to pick the tab; the picture-chosen
  path is proved); a phone's layout of the sheet; the round trip against the Worker (PR 1's suite proves the Worker's
  side of the same contract, and PR 2's the sheet's, through `C.feedback.draft()`).

## PR 3: the triage agent

- **Commit:** `8f1c2575` on `claude/deck-feedback-triage`, from PR 2's head (d5dd1756 the agent, d6501d08 the record
  and this handoff, then PR 2 merged in twice as it moved).
- **Proven:** `node tests/feedback-triage.mjs` (75 checks on `tests/fixtures/feedback-rows.json` with Linear, the
  Worker and the model stood in: duplicates grouped, the lane and the project from the route and the files the console
  names, severity and the recommendation, an issue with every fact and no reporter's address, every row of a group
  written back as triaged with the issue key and a triaged row left alone, the model's answer taken only where it keeps
  the facts and the rules' draft standing when it throws, the digest fix-now first and dated the US way, the command's
  `--dry-run` writing `digest.md` and `issues.json`, the workflow's secrets by name). `tools/feedback-triage-breaks.py`:
  24 breaks, each caught. `data-integrity`, `feature-wiring`.
- **Assumed:** the rules classify and the model sharpens (so a run is the same on the same rows; the plan's agent "on
  Claude Haiku 5.5 by default" is `FEEDBACK_MODEL`, Haiku 5.5 unless set); Rob's call D3 on the default, the outcome
  project the route maps to (`PROJECT_NAMES`, matched on the charter's names in Linear); the `feedback` label is made by
  the agent on its first live run; the digest is the job summary and an artifact until PR 4 mails it.
- **Not proven:** a live run (no `LINEAR_API_KEY`, `ANTHROPIC_API_KEY` or agent service token in this container, by
  design): the Linear GraphQL shapes (`issueCreate`, `issueLabelCreate`, the team and project lookups) and the Claude
  Agent SDK's `query()` are written from their documented shapes and not exercised; the plan's "a live run on staging
  creates one issue Rob reviews" is the first live run, on `workflow_dispatch`, after Rob's steps below.
- **Outstanding, Rob's steps:** repository secrets `ANTHROPIC_API_KEY`, `LINEAR_API_KEY` (create issues and labels in
  team ROB), `FEEDBACK_AGENT_CLIENT_ID`, `FEEDBACK_AGENT_CLIENT_SECRET` (the agent's Access service token), and the
  variable `FEEDBACK_API` (staging by default). Then one `workflow_dispatch` run, read in Linear.

## Not built here: PRs 4, 5 and 6

- **PR 4, the approval channels** (Deck intelligence): the Resend digest, the Gmail-label reply reader, the scheduled
  Claude session with the digest as its prompt, the `approved` label. The store already takes `approved` as the next
  state after `triaged` (PATCH, PR 1).
- **PR 5, the release notification** (Engine, the release tooling): the feedback ids carried on PRs (the agent's issue
  body lists every row id under "Feedback rows"; a PR naming the issue carries them), the release workflow's step that
  moves rows to `released` with the commit and sends the reporter one email through Resend (`cloud/mail.mjs`, the invite
  sender, Rob's call D5 on the default), then `notified` with the message id. The store takes both moves today.
- **PR 6, the admin feedback view** (Workshop): the owner's list from `GET /api/admin/feedback`, which already answers
  the owner with every row and refuses everyone else.

## The commands that prove it, in one place

```
node tests/feedback-store.mjs
python3 game/tools/batch/breaks.py tools/feedback-store-breaks.py
GEOMETRY_REQUIRED=1 node tests/feedback-sheet.mjs
GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py tools/feedback-sheet-breaks.py
GEOMETRY_REQUIRED=1 node tests/table-board.mjs
GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py tools/feedback-breaks.py
node tests/feedback-triage.mjs
python3 game/tools/batch/breaks.py tools/feedback-triage-breaks.py
node tools/feedback-triage.mjs --dry-run --fixtures tests/fixtures/feedback-rows.json --out work/triage
node tests/release-pages.mjs && node tests/asset-versions.mjs && node tests/data-integrity.mjs && node tests/feature-wiring.mjs
tools/local-ci.sh <head> 0
```
