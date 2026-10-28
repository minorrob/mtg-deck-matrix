# Handoff: the feedback loop's follow-ups, 2026-10-28

*From the Claude cloud session that built PRs 1 to 3 (session `01X2xxK5FjzqAb91gfMipUAB`), for whoever picks the loop up next
(Rob's merging session at OpenAI, or the lane sessions named below). Everything built so far is on `main`; this file is the
list of what is left, with the evidence for each item. It supersedes the status lines in
[`handoff-feedback-loop-2026-10-26.md`](handoff-feedback-loop-2026-10-26.md), which was written before the merge.*

## 1. Task list

Legend: **R** = Rob's step (a dashboard, a secret, a go), **E** = Claude · Engine lane, **W** = Codex · Workshop lane,
**D** = Claude · Deck intelligence lane, **P** = Codex · Play lane. Files belong to the lane that owns them
([charter §3](program/README.md)); a lane that needs another's file asks in the
[Requests table](ACTIVE.md).

### A. Switch the loop on (nothing is live until these are done)

- [ ] **A1 · R · Create the triage agent's Access application.** A Cloudflare Access application for the agent with a
  *Service Auth* policy (never a person's session), and an Access service token for it. Its audience tag becomes
  `FEEDBACK_AGENT_AUD`. Why: the Worker admits the agent's token only for that audience
  ([`cloud/worker.mjs`](../cloud/worker.mjs) `feedbackAdmin`, [`cloud/access.mjs`](../cloud/access.mjs) `deps.service`); with it
  unset, no agent is admitted. Pattern to copy: the "Session checks" service token and policy that
  [`tools/staging-check.mjs`](../tools/staging-check.mjs) uses.
- [ ] **A2 · E · Put the audience in the staging profile.** One line in the staging vars of
  [`tools/release-pages.mjs`](../tools/release-pages.mjs) (`FEEDBACK_AGENT_AUD`, beside `SERVICE_SEATS`), with
  [`tests/release-pages.mjs`](../tests/release-pages.mjs) checking it, and a break. Not in production's profile until the
  loop is proven on staging. Blocked by A1.
- [ ] **A3 · R · Name the owner.** Set `OWNER_EMAIL` (the address) in the staging and production profile vars, or the owner
  test falls back to `INVITE_ADMIN_ID`, which production's profile does not set. Today **neither** is set in
  `tools/release-pages.mjs` on main, so no person can read `GET /api/admin/feedback` anywhere; only the agent could, once A2
  is done. Where: `isOwner` in [`cloud/feedback.mjs`](../cloud/feedback.mjs).
- [ ] **A4 · R · Repository secrets and variable** (Settings → Secrets and variables → Actions): `ANTHROPIC_API_KEY`,
  `LINEAR_API_KEY` (create issues and labels in team `ROB`), `FEEDBACK_AGENT_CLIENT_ID`, `FEEDBACK_AGENT_CLIENT_SECRET`
  (from A1), and the variable `FEEDBACK_API` (defaults to `https://staging.crankmagic.com`). Names only; the workflow reads
  them as [`.github/workflows/feedback-triage.yml`](../.github/workflows/feedback-triage.yml) shows. Secrets never go in a
  file or a command line.
- [ ] **A5 · E · Apply migration 0009 to the databases, in order.** [`0009_feedback.sql`](../cloud/migrations/0009_feedback.sql)
  is on main but on no deployed D1 yet. Check each database with `wrangler d1 migrations list`; staging's has 0006 and what
  was released with it. Production's D1 holds only 0001 and 0002 per [ACTIVE.md](ACTIVE.md) (2026-10-25 release), so
  production needs 0003 to 0009 in order, and sharing stays off there. Staging first, on Rob's go, as 0006 was; the engine
  lane releases ([`tools/release-staging.sh`](../tools/release-staging.sh), [`docs/release-pages.md`](release-pages.md)).
- [ ] **A6 · R then D · The first live triage run.** After A1 to A5: file one report by hand through the sheet on staging,
  then run the workflow once with `workflow_dispatch` and read the issue it files in Linear
  ([team ROB](https://linear.app/robs-build)). This is the plan's "a live run on staging creates one issue Rob reviews"
  ([plan §3](feedback-loop/PLAN-2026-10-26.html)). Unproven until then: the Linear GraphQL shapes (`issueCreate`,
  `issueLabelCreate`, the team and project lookups), the Claude Agent SDK's `query()` call, the Access service-token
  headers. Fix what the run shows in [`tools/feedback-triage.mjs`](../tools/feedback-triage.mjs); the suite stands them in.

### B. Build the rest of the plan (order: 4, 5, 6)

- [ ] **B1 · D · PR 4, the approval channels** ([plan §4](feedback-loop/PLAN-2026-10-26.html)): the Resend digest through
  [`cloud/mail.mjs`](../cloud/mail.mjs) (the invite sender, Rob's call D5 on the default), the Gmail-label reply reader
  (a reply with two issue keys and "approve" labels both; an ambiguous reply becomes a comment), the scheduled Claude session
  that opens with the digest as its prompt, and the `approved` label in Linear. The store already takes `approved` as the move
  after `triaged` (`PATCH /api/admin/feedback/:id`, [contract](feedback-loop/CrankFeedback.md)); nothing sets it yet. Note
  `cloud/mail.mjs` is the Workshop's file: ask in the Requests table before changing it. Never send to a real address from a
  test.
- [ ] **B2 · E · PR 5, the release notification** ([plan §6](feedback-loop/PLAN-2026-10-26.html)): the release workflow asks
  the Worker which rows reached `released` by the commit just shipped (the issue body lists every row id under "Feedback
  rows"; the PR names the issue), moves them with `PATCH {state: "released", release: <commit>}`, sends each reporter one
  email (a reporter with five fixes gets one email listing them), then `PATCH {state: "notified", messageId}` so nobody is
  thanked twice. A staged release with two ids sends two emails once; a re-run sends none. Files:
  [`tools/release-production.sh`](../tools/release-production.sh) and the release tooling (the engine lane's).
- [ ] **B3 · W · PR 6, the admin feedback view** ([plan, execution table](feedback-loop/PLAN-2026-10-26.html)): the owner's
  list under Settings (state, group, issue, PR, release, notified; filters) from `GET /api/admin/feedback`, which already
  answers the owner with every row and refuses everyone else. Scope it with the game-log panel in
  [`docs/ai-players/PLAN-2026-10-26.html`](ai-players/PLAN-2026-10-26.html) section 10.

### C. Loose ends found on the way

- [ ] **C1 · E · One owner test, not two.** `cloud/worker.mjs` now has the AI players branch's `groupOf(email, env, db)`
  (owner by `OWNER_EMAIL`, insider by an `ai_allowlist` row) and this loop's `isOwner`/`feedbackGroup` in
  [`cloud/feedback.mjs`](../cloud/feedback.mjs). They agree on the owner only when `OWNER_EMAIL` is set. Make `isOwner` call
  `groupOf(...) === "owner"` (keeping `INVITE_ADMIN_ID` as the stated fallback), let `feedbackGroup` return `insider` too, and
  extend [`tests/feedback-store.mjs`](../tests/feedback-store.mjs) and its breaks.
- [ ] **C2 · P · A timing read in the stack pile's test.** [`tests/table-tabletop.mjs:468`](../tests/table-tabletop.mjs)
  ("selection animates cards cycling through the pile") reads the animation count right after a click and failed on
  Actions for #896 and on a clean main checkout in the cloud container, while passing elsewhere. Make it wait for the
  animations (`waitForFunction` on the count) or have `selectStack` mark that it animated. Raised in a comment on
  [#896](https://github.com/minorrob/mtg-deck-matrix/pull/896#issuecomment-6430696056); a Requests-table row is the right
  channel since the suite is the Play lane's.
- [ ] **C3 · P · `a11y-board` fails in the cloud container on main** (one reading in the steel-cobalt theme: a mat card's
  power and toughness "2/2", `.cm-bcard-pt`, 1.93 of 4.5 against the card picture at one pixel). It passed on Actions for
  [#895](https://github.com/minorrob/mtg-deck-matrix/pull/895) and [#897](https://github.com/minorrob/mtg-deck-matrix/pull/897),
  so Actions is the gate; if it ever fails there, the fix is a contrast change on the mat card's label (a design call).
- [ ] **C4 · W/P · The browser's own screen capture and a phone's sheet are unproven.** `getDisplayMedia` needs a person to
  pick the tab, so [`tests/feedback-sheet.mjs`](../tests/feedback-sheet.mjs) proves the picture-chosen path only. One
  walk on a real phone and one real capture on staging closes it; note the result in ACTIVE.md.
- [ ] **C5 · R · Screenshots are dropped until R2 is on** (Rob's call D4, on the default): the Worker records
  `screenshot: "dropped"` and writes no bytes. When R2 is bound, store the picture under the row's id and set the column to
  the key ([`cloud/feedback.mjs`](../cloud/feedback.mjs) `file`); the sheet and the schema already carry it.
- [ ] **C6 · D · File the follow-ups as Linear issues** (labels `Claude · Engine` and the others, `Rob's call` for the R
  items) under [P-ROB-10, launch readiness](https://linear.app/robs-build/project/joyful-end-to-end-launch-readiness-f8dd753a6998)
  so Rob's queue on the [readout](readout/index.html) shows them. None exist yet.

## 2. What is on main (so nobody rebuilds it)

| Piece | Where | Proof |
| --- | --- | --- |
| CrankFeedback@1, the shared schema module and the six-state machine | [`feedback-schema.js`](../feedback-schema.js) | [`tests/feedback-store.mjs`](../tests/feedback-store.mjs) (135), breaks [`tools/feedback-store-breaks.py`](../tools/feedback-store-breaks.py) (31) |
| The `feedback` table | [`cloud/migrations/0009_feedback.sql`](../cloud/migrations/0009_feedback.sql) | same suite |
| The store, ten reports an hour a person | [`cloud/feedback.mjs`](../cloud/feedback.mjs) | same suite |
| `POST /api/feedback`, `GET`/`PATCH /api/admin/feedback` | [`cloud/worker.mjs`](../cloud/worker.mjs), [`cloud/access.mjs`](../cloud/access.mjs) | same suite |
| The glyph and the sheet | [`crankmagic-feedback.js`](../crankmagic-feedback.js), the page heads, the board's profile strip | [`tests/feedback-sheet.mjs`](../tests/feedback-sheet.mjs) (38), [`tools/feedback-sheet-breaks.py`](../tools/feedback-sheet-breaks.py) (17), [`tools/feedback-breaks.py`](../tools/feedback-breaks.py) |
| The triage agent and its hourly workflow | [`tools/feedback-triage.mjs`](../tools/feedback-triage.mjs), [`.github/workflows/feedback-triage.yml`](../.github/workflows/feedback-triage.yml) | [`tests/feedback-triage.mjs`](../tests/feedback-triage.mjs) (75), [`tools/feedback-triage-breaks.py`](../tools/feedback-triage-breaks.py) (24), fixtures [`tests/fixtures/feedback-rows.json`](../tests/fixtures/feedback-rows.json) |
| The contract for the other lanes | [`docs/feedback-loop/CrankFeedback.md`](feedback-loop/CrankFeedback.md) | |

Re-checked on 2026-10-28 on a clean checkout of main `9e5b612e`: `feedback-store` 135, `cloud-worker` 155, `feedback-triage`
75 all pass. The merge was made by the OpenAI session: [#895](https://github.com/minorrob/mtg-deck-matrix/pull/895) merged
into main; [#896](https://github.com/minorrob/mtg-deck-matrix/pull/896) and [#897](https://github.com/minorrob/mtg-deck-matrix/pull/897)
closed unmerged because their base branch was deleted, and their content reached main by that session's own merge.

## 3. The rules this work runs under

- Rob's calls, taken on the plan's defaults and still the defaults until he says otherwise: D1 not Supabase (nothing is built
  on Supabase); GitHub Actions for the agent; approval by a Linear label; screenshots dropped until R2 is on; the invite
  sender for the reporter's email; the outcome project the route maps to. The six calls are in the
  [plan](feedback-loop/PLAN-2026-10-26.html) (published: [claude.ai artifact](https://claude.ai/artifact/1gEvtSpNM5vpPAK45frwVV)).
- [`AGENTS.md`](../AGENTS.md): a test that cannot fail is a comment (break it, watch it go red); a draft PR until the work
  is finished; the lanes and the Requests table; American English; symbols first.
- The agent never executes a fix. Its only writes are Linear issues and the feedback rows' state. No email goes to a real
  address from a test.

## 4. Where to look first

[`docs/ACTIVE.md`](ACTIVE.md) (the three feedback-loop sections and Requests row 15) · the
[feedback-loop plan](feedback-loop/PLAN-2026-10-26.html) · its companion
[AI players plan](ai-players/PLAN-2026-10-26.html) and [its handoff](handoff-ai-players-2026-10-26.md) · the
[contract](feedback-loop/CrankFeedback.md) · the earlier [handoff](handoff-feedback-loop-2026-10-26.md) · the planning PR
[#893](https://github.com/minorrob/mtg-deck-matrix/pull/893) · the
[Linear projects](https://linear.app/robs-build/project/joyful-end-to-end-launch-readiness-f8dd753a6998) the triage agent files under.
