# Hand-off: AI players (PR 6 access groups, PR 1 threat model) and the hand fan, 2026-10-26

*From a Claude cloud session (Fable 5.1) on `claude/sharp-hawking-8lbwy9`, draft PR
[minorrob/mtg-deck-matrix#893](https://github.com/minorrob/mtg-deck-matrix/pull/893). Written for the session that
merges this branch with the feedback-loop session's branches, and for OpenAI, which Rob has handling every merge. It
states the four things AGENTS.md asks of a hand-off: the branch and commit, what is proven against what is assumed, the
command that proves each claim, and what is outstanding with the reason.*

## 1. The branch and the commit

- Branch `claude/sharp-hawking-8lbwy9`, on `main` c567c581 (its ancestor; the branch has not merged `main` since, and at
  the time of writing nothing on `main` moved). The commit this describes is the branch's head at push time (see
  `docs/ACTIVE.md`, the section of the same date, for the hash).
- Nothing here is merged. Rob, 2026-10-26: *"I'll have you give me a hand-off to merge your work with the other session's
  work that we'll then hand all of that work over to OpenAI that is handling all of the merges."* So this session does
  not merge, release, or touch the feedback-loop branches.
- Three bodies of work, as commits on this one branch (Rob confirmed the plan's six calls and said to start PR 6, then
  PR 1; the harness assigns one branch to a session, so the plan's PR numbers are commit boundaries here, not PRs):
  1. the two plans and the ACTIVE.md record (896a0e4b);
  2. the 3D hand fan stacked left over right (Rob's screenshot of 2026-10-26), a Play-lane change at his word;
  3. PR 6, the access groups, and PR 1, the threat model, with their suites, docs and the README's suite count.

## 2. What was built

### The hand fan (Codex · Play lane files, changed at Rob's word)

- `crankmagic-board.js` `stageHand`: the slots' `z-index` is `count - i`, so the leftmost card is on top and each card's
  left edge is under the card to its left. `crankmagic-stage.css`: the fanned name rule moves from `:not(:last-child)`
  with a `right` to `:not(:first-child)` with a `left`, so each name begins past where the card to its left ends.
- Asset versions bumped by hand in every page that names them (`crankmagic-board.js` 107, `crankmagic-stage.css` 64,
  `crankmagic-sw.js` 565, `crankmagic-app.js` 582) and recorded with `node tests/asset-versions.mjs --update`.
- `tests/board-hand-table.mjs` gains two checks (110 from 108): the stacking order with the pointer off the fan, and each
  name's start in the card's own frame.

### PR 6: the access groups (Claude · Engine lane)

- `cloud/access.mjs` `groupOf(email, env, db)`: `owner` when the address is `OWNER_EMAIL` (a Worker variable, never in
  the repository, matched in any letter case); `insider` on a row in `ai_allowlist`, which is now the Game Theory Insiders
  roster; `general` otherwise.
- `cloud/ai.mjs` `createAi(db, {owner})`: `allowed(email)` is "not general". `AI_EVERYONE` keeps only its sign-in
  meaning (the app's own Access application opens the AI door); it no longer makes everyone signed in an insider. Rob's
  2026-10-26 word supersedes his 2026-10-14 word, and `docs/ai-door.md` says so. New `insiders()` and
  `setGroup(email, group, note)` for the roster.
- `cloud/worker.mjs`: `/api/me` carries `group`; `GET` and `PUT /api/admin/groups` for the owner alone (403 to anyone else,
  saying who may); every `createAi` call passes `owner: env.OWNER_EMAIL`. `cloud/game-room.mjs` `pilotOpen` the same.
- No migration: the roster reuses `ai_allowlist`, so nothing changes in D1 and no migration number is taken (the plan
  had a `user_groups` table; reusing the roster is smaller and collides with nothing while OpenAI merges).
- Suites: `tests/ai-door.mjs` (78; the groups section rewritten: General refused with the switch on or off by either
  sign-in, an insider answered at the app's sign-in, the owner answered on no list and refused with `OWNER_EMAIL` unset,
  `/api/me`'s group, the roster read and set by the owner alone), `tests/agent-seat-table.mjs` (a host not on the roster
  refused with the switch on; the owner seats an AI on Claude), `tests/cloud-worker.mjs` (`/api/me` says general).
- Requests row 14 in `docs/ACTIVE.md` asks the Workshop lane to hide the paid controls for `general`, gate sharing's mail
  sends, and give the owner a roster card; the Worker is the gate either way.

### PR 1: the threat model (Claude · Engine lane)

- `game/engine/pilots/threat.mjs`: `threatTable(view, {seat, cards, setting})`, one row per living opponent with six
  signals in [0, 1] (life, hitters, growth, ramp, engine, commander; the last two are 0 until PR 2 reads the corpus and
  the catalog), the weighted mean under `THREAT_WEIGHTS[setting]`, `top`, `mean`, `of(id)` and `over(id)` (the score less
  the table's mean, so the table says where, never whether: with one opponent it is nothing). Easy keeps a rank (the top
  row 1, the rest 0). `absurd(going, out)`: every attacker lost and nothing through.
- `game/engine/pilots/scored-pilot.mjs`: `WEIGHTS.threat` 6 and `WEIGHTS.threatAim` 0.5; an attack plan's value gains
  `threat × over(seat) × effect` (the damage through as a share of the seat's life); a hostile target's worth gains
  `threatAim × over(controller)`; absurd plans are dropped before any draw; at Easy, while there is an attack to make at
  the top of its rank, plans at other seats are dropped unless lethal (when the top seat is walled or out of reach, the
  rest of the table is open).
- `tests/engine-threat.mjs` (46): the signals to the figure; Easy's rank and ties; the person-bias invariant (the same
  board under other names, kinds, levels and personas gives the same table to the byte and the same L1 answers; the LLM
  seat's brief carries none of them); L1 attacks where threat × effect is highest at Easy and Normal, and with the threat
  weight at 0 attacks the first seat (the break the suite catches); a walled threat loses to an open seat; one opponent
  moves nothing; the floor over 60 seeds.
- `README.md` names the suite and says 599 Node suites.

## 3. Proven, and the command for each claim

| Claim | Command | Result here |
| --- | --- | --- |
| The hand fan stacks left over right, names clear of the card to the left | `node tests/board-hand-table.mjs` | 110 checks passed |
| The stacking check goes red when the order is the old one | the same, with `z-index:${i+1}` in `stageHand` | red: "1 > 2 > 3 > 4 > 5 > 6 > 7" (then restored) |
| Asset versions recorded | `node tests/asset-versions.mjs --update` | recorded 134 assets |
| The door refuses General Access, answers insiders and the owner, the roster is the owner's | `node tests/ai-door.mjs` | 78 checks passed |
| A host not on the roster cannot seat an AI on Claude; the owner can | `node tests/agent-seat-table.mjs` | 20 checks passed |
| `/api/me` says the group | `node tests/cloud-worker.mjs` | 127 checks passed |
| The other door callers still pass | `node tests/coach.mjs`, `tests/advisor.mjs`, `tests/card-demand.mjs`, `tests/sharing.mjs` | 65, 56, 43, 119 |
| The threat table, Easy's rank, the invariant, the target, the floor | `node tests/engine-threat.mjs` | 46 checks passed |
| L1 still passes its own suite and the room's | `node tests/engine-scored-pilot.mjs`, `engine-house-pilot`, `engine-pilot-picks`, `room-seat-pilots`, `room-agent-seat` | 60, 19, 116, 15, 23 |
| The new suite is registered | `node tests/data-integrity.mjs` | exit 0 |
| Wording and release profiles | `node tests/feature-wiring.mjs`, `tests/release-pages.mjs` | 124, 224 |
| L1's win rate against L0 is not lost | `node tools/pilot-bench.mjs --games 100`, before and after | before: L1 65% of 100 (95%: 56–74%); after: L1 66% of 100 (95%: 57–75%); blunders 0 / 0 both ways |
| No secrets or personal addresses; clean on main | `tools/local-ci.sh HEAD 0` | see `docs/ACTIVE.md` |

## 4. Assumed, not proven

- The fan on a GPU browser, a phone, Safari or Firefox: the suite runs Chromium in this container.
- `OWNER_EMAIL` on staging and production: a dashboard variable Rob sets; until he does, nobody is the owner and the
  admin routes answer 403 to everyone (the door still answers insiders).
- The roster's effect on staging: with `AI_EVERYONE` on and the roster as it stands, anyone not on it is refused at the
  AI door from the next release, which is what Rob asked; the three AI testers' rows carry over as they are.
- The Actions run: not run here (the PR is a draft). The local gate's scan is in `docs/ACTIVE.md`.
- The engine and commander signals are 0 by design until PR 2; the bench measures the four foundation signals only.

## 5. Outstanding, and why

- PR 2 (Hard), 3, 4 (Veteran), 5 (personas and the deck matrix), 7 (the game-log index, detail and export): not started;
  Rob said PR 6 then PR 1 for this session. The plan's order after that is 2, 4, 3, 5, 7.
- The Workshop lane's half of PR 6 (Requests row 14).
- The plan's wording "held for the turn" for Easy's rank: built as a rank recomputed at each decision (a pilot keeps
  nothing between calls so a replay agrees); the effect is the same within a turn unless the board changes.
- Rob's "AI-8": read as the LLM seat; he confirmed the six calls without naming otherwise.

## 6. Merging this with the feedback-loop session's work: the one order for OpenAI

The feedback-loop session (`session_01X2xxK5FjzqAb91gfMipUAB`, started by this one) sent its hand-off at 00:54 UTC on
2026-10-27. Its own document is `docs/handoff-feedback-loop-2026-10-26.md` on `claude/deck-feedback-triage`. Nothing
from either session is merged. Rob's word to it: no second Actions run for a timing error; straight to merge.

### 6.1 The four branches, in merge order, each a merge commit

| # | Branch | Head | PR | Actions on that head |
| --- | --- | --- | --- | --- |
| 1 | `claude/sharp-hawking-8lbwy9` (this) | the pushed head; merged with `main` b13607b2 | #893 | a draft: not run; the local gate's scan passed on each push |
| 2 | `claude/engine-feedback-store` | 86f1f265 (from `main` c567c581) | #895 | `suites` green (run 40418687834) |
| 3 | `claude/workshop-feedback-sheet` (contains 2) | 85a12f42 | #896 | run 40420725479: one check red, `tests/table-tabletop.mjs:468` "selection animates cards cycling through the pile", an animation-count read right after a click; every other suite green. Not that PR's: it fails identically on a clean checkout of `main` c567c581, the PR touches neither the stack pile nor the motion gate, and the same tree passed on #897's run. Rob: no re-run. The reasoning is a comment on #896. |
| 4 | `claude/deck-feedback-triage` (contains 2 and 3) | cdfe26c3 | #897 | `suites` green (run 40421560221); its tree is PRs 1 + 2 + 3 of the feedback plan, so this green covers #896's files too |

After each merge: `node tests/asset-versions.mjs --update` (never by hand), and `README.md`'s suite count set to the
count: **599 on `main` after #891, 600 with this branch, 603 with all four** (the feedback hand-off says 602: it was
written before #891 added a suite to `main`).

### 6.2 The shared files, and what to keep

| File | This branch | The feedback branches | At the merge |
| --- | --- | --- | --- |
| `cloud/worker.mjs` | `groupOf` imported from `./access.mjs`; `/api/me` gains `group`; `adminGroups` and its route; `owner: env.OWNER_EMAIL` on every `createAi` call | One import line after the sharing import (its group function is named `feedbackGroup`, so `groupOf` is bound once); one route line before `let who;` (`/api/admin/feedback*`); a `/api/feedback` POST block before the general `fromTheApp` check; three functions before the AI door's comment; six header lines. Nothing inside an existing function. | Keep both. |
| `cloud/access.mjs` | `GROUPS` and `groupOf` before `serviceIdentity` | One condition in `verifyAccess` (`deps.service === true` beside `SERVICE_SEATS`) | Keep both; no overlap. |
| `cloud/feedback.mjs` `isOwner` | — | `OWNER_EMAIL` first (any letter case), else `INVITE_ADMIN_ID` | Theirs, as agreed. |
| `docs/ACTIVE.md` | A section at the top; Requests row 14 | Three sections at the top; Requests row 15 | Keep all. |
| `README.md` | `engine-threat` named; 600 suites | Three suites named | 603 after all four. |
| Asset pins and `tests/fixtures/asset-versions.json` | Bumped for the fan | Bumped for the sheet | Re-record with the tool after each merge. |
| `tests/page-budget.mjs` | — | +1 on six control budgets for the glyph | Theirs. |
| Migrations | None taken | 0009 (0007 and 0008 untouched) | Theirs. |

### 6.3 What the feedback branches prove, in their session's words, with the command for each claim

- **PR 1, the store** (#895): `node tests/feedback-store.mjs` 135 (migration 0009; `CrankFeedback@1`'s bounds refused by
  name and unknown fields dropped; `POST /api/feedback` for a signed-in person, the reporter from the token, a screenshot
  dropped and its bytes kept nowhere; ten an hour a person, the eleventh refused with when to retry; `GET`/`PATCH
  /api/admin/feedback` for the owner by `OWNER_EMAIL` or `INVITE_ADMIN_ID`, and for the agent's service token on its own
  Access application only; the six states, each move the next and no other). `python3 game/tools/batch/breaks.py
  tools/feedback-store-breaks.py` 31 breaks, each caught. `node tests/release-pages.mjs` 228. Also green: `card-demand`,
  `cloud-worker`, `ai-door`, `data-integrity`, `feature-wiring`, `sharing`, `agent-seat-table`. `tools/local-ci.sh
  86f1f265 0` scan pass.
- **PR 2, the control and the sheet** (#896): `GEOMETRY_REQUIRED=1 node tests/feedback-sheet.mjs` 38 (the glyph on three
  pages and the Menu; every field posted with its header, never the person; the Worker's 429 shown with the text kept; a
  picture as WebP under 1 MiB; signed out refused with Sign in / Email instead). `tools/feedback-sheet-breaks.py` 17
  caught. `GEOMETRY_REQUIRED=1 node tests/table-board.mjs` 294; `tools/feedback-breaks.py`, five board breaks caught.
  `page-budget` 80. Also green: `feature-wiring`, `menu-help`, `settings-r3`, `data-integrity`, `service-worker`,
  `asset-versions`, `release-pages`. `a11y-board` fails in its container identically on `main` (one contrast pixel,
  steel-cobalt mat card P/T) and passed on Actions for #895 and #897.
- **PR 3, the triage agent** (#897): `node tests/feedback-triage.mjs` 75 on `tests/fixtures/feedback-rows.json` with
  Linear, the Worker and the model stood in. `python3 game/tools/batch/breaks.py tools/feedback-triage-breaks.py` 24
  caught. `node tools/feedback-triage.mjs --dry-run --fixtures tests/fixtures/feedback-rows.json --out work/triage`
  writes `digest.md` and `issues.json`. `data-integrity`, `feature-wiring` green.

**Assumed there** (Rob's calls on the plan's defaults, named in each PR): D1 not Supabase; GitHub Actions for the agent;
approval by Linear label; screenshots dropped until R2 is on; the invite sender for its PR 5; the outcome project the
route maps to; Claude Haiku 5.5 as the agent's model (`FEEDBACK_MODEL` otherwise).

**Not proven there:** the agent's service token against live Access (no application exists yet); migration 0009 on
staging D1 (applied at the next staging release, as 0006 was); a live triage run (no Linear key, model key or agent
token in its container by design: the Linear GraphQL shapes and the Agent SDK's `query()` are written from their
documented shapes, unexercised); the browser's own screen capture (a person must pick the tab); a phone's layout of the
sheet.

**Rob's steps for the feedback loop:** an Access application for the agent with a Service Auth policy, its audience as
`FEEDBACK_AGENT_AUD` in the staging profile (`tools/release-pages.mjs` vars); repository secrets `ANTHROPIC_API_KEY`,
`LINEAR_API_KEY`, `FEEDBACK_AGENT_CLIENT_ID`, `FEEDBACK_AGENT_CLIENT_SECRET` and the variable `FEEDBACK_API`; then one
`workflow_dispatch` of `feedback-triage.yml`, read in Linear. **Not built there:** its PRs 4 (approval channels), 5
(release notification) and 6 (admin view); the store already takes their state moves.

### 6.4 Rob's steps for this branch

`OWNER_EMAIL` on staging and production (a dashboard variable); until it is set, nobody is the owner, the admin routes
answer 403 to everyone, and the feedback store's owner falls back to `INVITE_ADMIN_ID`.

### 6.5 After the merges

The remaining AI-player work is `docs/ai-players/NEXT-2026-10-27.md`, stored for the next session on Rob's word.
