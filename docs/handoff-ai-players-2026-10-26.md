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

## 6. Merging this with the feedback-loop session's work

The feedback-loop session (`session_01X2xxK5FjzqAb91gfMipUAB`, started by this one) builds its plan on three stacked
branches, each containing the one before (its interim word of 23:12 UTC; its own hand-off,
`docs/handoff-feedback-loop-2026-10-26.md` on the third branch, follows once its suites are green):

1. `claude/engine-feedback-store`, PR #895 (head 74f8c228 at that word), from `main` c567c581: the schema, migration
   0009, the routes;
2. `claude/workshop-feedback-sheet`, PR #896 (head d884c03d, two test fixes to come): the control and the sheet;
3. `claude/deck-feedback-triage`, PR #897 (head d6501d08): the triage agent.

**The order for OpenAI:** this branch first (it changes who may spend, and its `cloud/worker.mjs` change is the
smaller), then the three feedback branches in stack order, each a merge commit, with one green Actions run per PR.
After each merge: `node tests/asset-versions.mjs --update` (never by hand), and the README's suite count set to the
count (599 on `main` after #891, 600 with this branch, 603 with all four).

**Where both bodies of work touch one file, and what to keep:**

| File | This branch | The feedback branches | At the merge |
| --- | --- | --- | --- |
| `cloud/worker.mjs` | `groupOf` imported from `./access.mjs`; `/api/me` gains `group`; `adminGroups` and its route; `owner: env.OWNER_EMAIL` on every `createAi` call | An import from `./feedback.mjs`; a `/api/admin/feedback*` route after the `/api/ai/` dispatch; a `/api/feedback` POST block; three functions before the AI door's comment; header lines | Keep both; nothing inside an existing function changes on either side. **One collision, asked of that session before its hand-off:** its `./feedback.mjs` also exported a `groupOf`; it is to import this branch's from `./access.mjs` instead, so the name is bound once. If its hand-off does not confirm that, resolve it that way. |
| `cloud/access.mjs` | `GROUPS` and `groupOf` added before `serviceIdentity` | One condition in `verifyAccess` (`deps.service === true` beside `SERVICE_SEATS`) | Keep both; they do not overlap. |
| `cloud/feedback.mjs` `isOwner` | — | Its owner test is `INVITE_ADMIN_ID` | `groupOf(...) === "owner"` (by `OWNER_EMAIL`), with `INVITE_ADMIN_ID` as a fallback inside `isOwner` only, until Rob sets `OWNER_EMAIL`; that session was asked to make it so. |
| `docs/ACTIVE.md` | A section at the top and Requests row 14 | Three sections at the top and a Requests row, to be numbered 15 | Keep all; the rows are 14 (groups) and 15 (feedback). |
| `README.md` | `engine-threat` named; 600 suites | Its suites named; its count | 603 after all four. |
| Asset pins and `tests/fixtures/asset-versions.json` | Bumped for the fan (board 107, stage.css 64, sw 565, app 582) | Bumped for the sheet | Re-record after the merge with the tool. |
| `tests/page-budget.mjs` | — | Six control budgets +1 for the Send feedback glyph | Theirs. |
| Migrations | None taken | 0009 (0007 and 0008 untouched) | Theirs; this branch takes no number. |
