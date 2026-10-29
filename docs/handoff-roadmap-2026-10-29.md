# Handoff: from the Table, Focus and phone work to the live roadmap and backlog, 2026-10-29

> **Done, 2026-10-29 (section 10).** Rob answered sections 1 and 6's process questions and the live roadmap and
> backlog now exist in Linear. This file is the last session handoff document: from here on, the draft PR's body is the
> handoff and Linear is the plan (`AGENTS.md`, "The work is in Linear: one loop").

*From the Claude cloud session that built and released the Table/Focus HUD, the card-shaped piles, the layering and the phone
fix, applied the staging migrations, and wrote the production-readiness roadmap draft (session
`018fHA6QX1E9X946VyGDp93o`, branch `claude/gifted-ride-w6xoa3`). For the session Rob starts next. AGENTS.md's four things
apply: what was shipped (branch, commit), what is proven and what is assumed, the command that proves each claim, and what is
outstanding with the reason. Facts are marked **[verified]** (checked this session), **[doc]** (a repo doc says so) or
**[inference]**.*

*Reviewed the same day by a second Claude cloud session (`018fHA6NZGbvuifwcpv4429J`, branch
`claude/practical-faraday-xr4nah`: this branch plus main `7f6e76ae` merged in, opened as a PR into
`claude/gifted-ride-w6xoa3` so it lands in PR #937). Every claim in sections 2 and 3 was re-checked against git, GitHub and
Linear; what changed is marked **[review]**, and section 9 holds what the first pass left out.*

## 0. Start here (commands)

```bash
git fetch origin main claude/gifted-ride-w6xoa3 release/pages release/cloud-staging
git checkout claude/gifted-ride-w6xoa3 && git merge origin/main   # PR #937's branch; merge, never rebase
git show origin/release/pages:version.json                        # production's commit
git show origin/release/cloud-staging:version.json                # staging's commit
git log --oneline --first-parent "$(git show origin/release/cloud-staging:version.json | node -pe 'JSON.parse(require("fs").readFileSync(0)).commit')"..origin/main   # on main, not on staging
```

Then read section 4 and section 9 before writing anything: the roadmap's files sit in another lane's folder (9.2).

## 1. What Rob asked the next session to do (his words, condensed)

1. **Take the questions this session left for him** (section 6) and resolve them with him.
2. **Turn the roadmap draft into a live roadmap, and write the instruction in the repo that every session must work against
   it** ("our single inflection point").
3. **Mirror it in Linear**, so one can trace from a roadmap item to its Linear task, to the PRs and the releases in GitHub.
4. The roadmap covers **what stands between us and production**. **The public release is set to the side as a future item**:
   Rob is "not focused on that yet". (This changes the draft: its decision 1, "public or invite-only", is no longer the first
   gate. Keep it as a Future item, not a blocker.)
5. **Consolidate the entire backlog.** A roadmap and a backlog, **both always up to date and live**, that every session reads as
   the definitive and comprehensive source of truth: how all tasks and processes relate to the roadmap, and which items are
   *off* the roadmap, in the backlog, to be considered for assignment onto the roadmap when applicable.

Rob did not say who owns keeping them current, how an item moves between roadmap and backlog, or what happens when Linear and the
repo disagree. Section 5 proposes answers; they are proposals, not decisions.

## 2. What this session shipped

| What | Where | Proof |
| --- | --- | --- |
| Table and Focus as the 3D view's HUD without the canvas; drawers on top; card-shaped piles; cards over the mat's edge; quick tab; Max; peek; chat default; lobby Start/End; "legible or absent" badges | PR #910, merged as `d25bac19` (merge commit) | **[verified]** full local run on the head (`node tools/run-suites.mjs -q` with `GEOMETRY_REQUIRED=1 PAGE_BUDGET_REQUIRED=1`): 672 ok, 13 FAIL; 12 identical on main, the 13th (`board-r4-folded-slot`) fixed in `9292a465` and re-run green with `a11y-board` 309, `board-r4-caption-fit` 187, `board-flat-views` 158 and nine more. Merge record is a comment on the PR. |
| Phone: a crowded lands row scrolls in the board's one frame (rows auto, nothing clipped); `board-commander-hand`'s 390x844 case back in its loop | PR #925, merged as `b9999b16` | **[verified]** `board-r3-zone-navigation` 130 (it failed on main), `board-commander-hand` 99, 24 phone-sensitive suites, scan pass. `table-board` lost one check in a batch under load and passed alone (326): a timing flake. |
| Staging release | `release/cloud-staging` `a8abf916`, main `b9999b16` | **[verified]** `node tools/staging-check.mjs --expect b9999b1`; `tests/uat/release-acceptance.mjs` 22 checks on the built pages |
| Staging D1 migrations 0009 (feedback) and 0010 (match_results) | the `crankmagic-staging` database | **[verified]** `SELECT name FROM d1_migrations` lists 0001 to 0006, 0009, 0010; both tables and their indexes exist. Applied through the Cloudflare D1 REST API with the credential the proxy injects for `*.cloudflare.com`, each migration's SQL plus its `d1_migrations` row in one call. |
| Roadmap draft, ACTIVE pointer, stray screenshot removed | PR #937 (draft), same branch | **[verified]** `node tests/feature-wiring.mjs`, `tests/asset-versions.mjs`, `tests/data-integrity.mjs` pass. Docs only. |

Nothing in this session touched production. No Linear item was created or changed.

## 3. State right now

| Thing | State | Source |
| --- | --- | --- |
| Production | `release/pages`: profile `cloud-production`, main `c567c581`, 2026-10-26; Play on | **[verified]** `git show origin/release/pages:version.json` |
| Staging | main `b9999b16`, `release/cloud-staging` `a8abf916` | **[verified]** |
| Main | `7f6e76ae` at review time. After `b9999b16` (the last staged commit) five PRs merged: #932 (ROB-204), #935 (ROB-213), #936 (ROB-214), #942 (ROB-216), #945 (ROB-221). **Staging does not carry any of them**; the playtest section of `docs/ACTIVE.md` says so for ROB-204 ("staging reads b9999b16 until the release owner's next release") | **[review]** `git log --oneline --first-parent b9999b16..origin/main` |
| Production vs. main | production `c567c581` (#888) is behind main by PRs #890, #891, #893, #895, #896, #897, #903, #910, #925, #932, #935, #936, #942, #945 plus the commits pushed straight to main for PRs 905, 908 and 909 | **[review]** `git log --oneline c567c581..origin/main \| grep -oE '#[0-9]+' \| sort -u` |
| PR #937 | draft, mergeable `clean`, opened against main `50297778`; main has moved two PRs since (#942, #945). The review branch merges `7f6e76ae` cleanly (no conflict in `docs/ACTIVE.md`) | **[review]** GitHub `pull_request_read get` |
| Production D1 migrations | 0001 and 0002, from the 10-25 release record. **Not re-read**: this session's guard refused production reads | **[doc]** `docs/ACTIVE.md` |
| The Actions gate | the `suites` job is canceled at `timeout-minutes: 60`; merges have used a full local run, recorded as a comment on each PR | **[verified]** run 3423 |
| Red on main, not this work's | `board-target-lands`, `board-ending-rematch`, `board-mana-symbols`, `board-control`, `browser-geometry`, `precons`, `page-budget`, `coach`, `crankmagic-coach`, `engine-breaks-anchors`, `table-record` | **[verified]** two full local runs |
| Red on main, reported by the playtest session | also `board-direct-blocking` and `board-yield` (with `board-target-lands`, already above): thirteen suites in all, not eleven | **[review] [doc]** `docs/ACTIVE.md`, the ROB-201 to ROB-221 section, "Known and not mine" |
| Linear | initiative I-1 with projects P-ROB-1 to P-ROB-11; every **project** last updated 2026-10-18. The **issues** are live: on 10-29 alone ROB-199, 200, 205, 209, 210, 211, 213 and 220 were In Progress and ROB-204, 214, 216, 221 went to Done | **[verified]** Linear MCP; **[review]** `list_issues updatedAt -P2D` |
| Linear and the repo can disagree today | ROB-213 is In Progress though PR #935 merged it to main. `docs/ACTIVE.md` says the one card it removes stays in the committed data until the next refresh, which may be why it is open: ask the playtest session before calling it drift | **[review]** Linear `ROB-213`; `git log --oneline -1 3a75d03b` |
| Readout feeds (`docs/readout/feeds/*.json`) | dated 10-18 to 10-26; they list as backlog things `docs/ACTIVE.md` says are built. 139 items: 31 done, 14 review, 21 in progress, 62 backlog, 11 blocked, 1 held; 1,078 `remaining_hours` | **[verified]** by two readers; **[review]** counts and hours summed from the five files |
| Audit findings | `docs/r4-execution/AUDIT-STATUS.md`: 129 = 53 `unmapped_open`, 33 `pending_verification`, 23 `verified_local`, 13 `partially_verified_local`, 5 `baseline_reconciled_local`, 2 `open` | **[review]** `grep -oE '\| [a-z_]+ \|' docs/r4-execution/AUDIT-STATUS.md \| sort \| uniq -c` |

## 4. What to read first

1. `docs/program/ROADMAP-production-readiness-2026-10-29.md` (PR #937): the draft this handoff continues. Its workstreams W1 to
   W11 and tracks T1 to T4, its decisions list and its manual-step list are the seed. **Edit it per section 1, point 4**: move
   "public sign-in" and everything that exists only for it to a Future section.
2. `docs/program/README.md` (the north star: eleven outcomes, five AI systems as lanes) and `docs/program/LAUNCH-CHECKLIST.md`
   (ten lines; still "draft for Rob's approval").
3. `BACKLOG.md` at the repo root (Rob's 10-04 and 10-28 asks), `docs/ACTIVE.md` (3,400 lines: top ~120 lines in full, then
   grep "Not proven", "Open", "Rob's", "blocked"), `docs/INDEX-where-things-live.md`, `docs/handover-index.md`.
4. Linear: initiative I-1 and its eleven projects; the issues under them (the repo's feeds are stale, so use Linear's live
   state). Tools available in the Claude cloud session: the Linear MCP (`list_projects`, `list_issues`, `save_issue`,
   `save_project`, `save_milestone`, labels) and the GitHub MCP (PRs, checks, merge). Linear write access was not exercised.
5. `AGENTS.md`: lanes, "Merging to main", "The game fits the window; it never scrolls", the no-weakening-assertions rule,
   US spelling (a suite, `feature-wiring`, fails on UK spellings in any tracked file, including docs).

## 5. A suggested shape for the live roadmap and backlog (proposals)

**One identifier scheme, three places.** Give every roadmap and backlog item a stable ID (for example `RM-<area>-<n>`), kept in
the repo file, in the Linear issue's title or description, and in the PR title or body. Then a trace is a search: roadmap row
to Linear key (`ROB-nnn`) to PR numbers to the release commit that carried them.

**Two files, one rule.**
- `docs/ROADMAP.md`: what is being worked on now and next, toward "production ready" only. A table per outcome and per track,
  one row per item: ID, one-line outcome, Linear key, status (`planned`, `in progress`, `in review`, `merged`, `staged`,
  `released`), PRs, release commit (staging and production separately), owner lane, blocked-on (a decision of Rob's, a manual
  step of his, another item), and the evidence (the command or suite that proves it). A **Future** section for public release
  and Oathbreaker/Standard (held).
- `docs/BACKLOG.md`: everything not on the roadmap, same ID and Linear fields, plus a one-line "why it is not on the roadmap"
  and a "consider when" trigger. It replaces the root `BACKLOG.md` (keep a one-line pointer there).
- **The rule:** an item is in exactly one of the two files. Moving it is a commit that changes both and says why.

**The instruction every session works against.** Add a short section to `AGENTS.md` (and a line in `CLAUDE.md`, which reads
`AGENTS.md` first): before starting work, find the roadmap item that the work serves; if there is none, add it to the backlog
first and ask Rob before it goes onto the roadmap; a PR names its roadmap ID; a merge updates the item's status, PR and release
fields; a release updates the release field; work that serves no item is not started. `docs/ACTIVE.md` keeps recording who
holds what and the proof; it points at roadmap IDs instead of carrying the plan.

**Keeping Linear and the repo from drifting.**
- Decide the direction of truth per field. A reasonable split: scope, order and status live in the roadmap file (it travels with
  the code and is gated by tests); Linear holds the issue conversation and assignment. A session that changes a status changes
  both in the same turn.
- Add a suite, `tests/roadmap-integrity.mjs`, that fails when: an ID appears in both files or neither of a table's pair, a row
  has no outcome or status, a `released` row has no release commit, a Linear key is malformed, or a PR number cited in a row
  does not exist in `git log` (merge commits name the PR). It cannot reach Linear from CI; a small tool
  (`tools/roadmap-linear-check.mjs`, run by the session, using the Linear MCP) can compare keys and statuses and print
  differences.
- Consider a Linear project and milestone for each track in the draft (T1 to T4) beside the eleven outcomes, and a label for
  the roadmap ID; Rob asked for the mirror, so confirm the structure with him before creating anything.

**Consolidating the backlog.** Sources to sweep, each item deduplicated against Linear: `BACKLOG.md`; Linear issues in Backlog
and Triage across all projects (including P-ROB-11, held); the non-done items in `docs/readout/feeds/*.json` (about 1,078 hours
by the feeds' own sizes; several are already built); every "Not proven", "Open" and "Rob's" line in `docs/ACTIVE.md`; the
request tables in `docs/ACTIVE.md`; `docs/r4-execution/AUDIT-STATUS.md` (129 audit findings: 53 `unmapped_open`, 33
`pending_verification`); `docs/r4-execution/INCOMING-QUEUE.md` (the feedback-loop security findings); the plans under
`docs/ai-players/`, `docs/feedback-loop/`, `docs/engine/`; the feedback table once it has rows (staging has the table now).
Record each source and the date swept at the top of the backlog so the next sweep is incremental.

## 6. The questions this session left for Rob

Put these to him, with the draft's reasoning (`ROADMAP-production-readiness-2026-10-29.md` sections 2 and 4). The public-release
question is deferred by his word; the rest stand.

1. Approve or edit the ten-line launch checklist (the definition of "production ready").
2. Name the game (ROB-139).
3. House rules default in the lobby (on today; the 10-22 request said standard Commander with opt-in).
4. Hard AI difficulty: keep it offered though it benches below Normal?
5. AI cost: the production key, the daily and per-game caps, the Veteran evaluation budget.
6. Privacy and Terms wording for the feedback sheet, chat, results/leaderboard and game logs; what account deletion promises.
7. The Wizards of the Coast position against `LICENSE` keeping commercial rights (not a legal opinion).
8. Provenance and notices for audio, video, persona avatars, table skins and playmats.
9. Rewrite the email-bearing git history of the public repo.
10. Pay for CI minutes or shard the suites to repair the 60-minute Actions gate.
11. Backup retention and what deletion means for backups.
12. **Whether to instrument the lag first** (about a day: client send-to-paint, Durable Object time and colo, a Chrome trace of one
    action in 3D, Table and Focus) before any hosting decision. This session's recommendation: yes, and do not move the game
    runtime; section 4 of the draft gives the reasoning and the options table.
13. Which Linear structure to create for the tracks and the roadmap ID (see section 5).
14. **[review]** The three things section 1 says he did not decide: who keeps the roadmap and backlog current (every session
    in the same turn, or one owner), how an item moves between them (his yes for onto the roadmap; anyone for off it?), and
    which side wins a field when Linear and the repo disagree. Section 5's answers are proposals until he picks.
15. **[review]** What becomes of the readout (`docs/readout/`, five feeds, `tests/readout-feeds.mjs`, and step 2 of
    `docs/program/README.md` section 6, which tells every session to update its feed). Kept beside a live roadmap it is a
    third plan that drifts; the proposal is to retire the feeds' `items` into the roadmap and backlog and keep the readout
    page reading the roadmap file, or retire it.
16. **[review]** Where the roadmap and backlog files live (section 9.2): `docs/program/` is the Deck intelligence lane's.

## 7. Mechanics and traps this session learned

- **Asset pins.** A served file that changes needs its `?v=` pin bumped everywhere it is named; never by hand. The repo's tool
  is `node tools/bump-pins.mjs <files…>`; `node tests/asset-versions.mjs --update` records the hashes. This session looped the
  second until it said "recorded". `tests/asset-versions.mjs` fails otherwise.
- **The Actions gate** cannot finish (60 minutes); the full local run takes about 75 minutes. A merge on the local gate needs the
  head's full run, `tools/local-ci.sh <ref> 0` (the scan and the merge with main), the suites named on the PR, and a comment on
  the PR saying so. Do not run browser suites while another browser suite runs: timing checks fail under load (one did here).
- **Staging release** (what this session did, from a clean checkout of main): `node tools/release-pages.mjs --ref origin/main
  --profile cloud-staging --out <folder>`; serve it (`node tools/serve-folder.mjs <folder> 8796`); `UAT_BASE=http://crankmagic.localhost:8796
  UAT_STATIC=1 UAT_LIVE_NETWORK=1 node tests/uat/release-acceptance.mjs`; then `node tools/release-pages.mjs --ref origin/main
  --profile cloud-staging --commit` and `git push origin release/cloud-staging`; read it back with `node tools/staging-check.mjs
  --expect <short commit>` (staging takes a minute or two to serve it). `tools/release-staging.sh` also runs `play-e2e`, which
  needs `wrangler`; this container has none, so that walk was not run. Production releases need Rob's go every time.
- **Cloudflare from this container.** The proxy injects a Cloudflare credential for `*.cloudflare.com`; the account's D1 REST API
  reached staging. The session's guard **refused a read of the production D1 and Workers list**; that is a boundary, not a
  bug to route around. Ask Rob for production reads and applies.
- **Do not `pkill -f` or `pgrep -f` a string that appears in your own command line**: it matches the shell running it and kills
  it (exit 144), twice here.
- **Sub-agent reports are claims.** The inventory pass quoted production at `9ca99e5` (10-25) while the release branch says
  `c567c581` (10-26); the other pass was right and checked the branch. Verify anything that matters against the repo or the
  live record before it goes into a roadmap row.
- **Other sessions edit `docs/ACTIVE.md` and merge while you work** (ROB-204/213/214 landed during this session). Merge main into
  the branch before marking a PR ready; `docs/ACTIVE.md` sections near the top change most.
- **Rob's standing rules from this session**, recorded in AGENTS.md or `docs/ACTIVE.md`: the game fits the window and never
  scrolls (panes may scroll); the phone is audited against that rule later; text is legible or absent (a badge that cannot fit at
  the 15px floor is not drawn; its label still says it); no weakening an assertion to get green, and where the design moved, a
  test follows it with a stated reason.

## 8. Outstanding from this session, with the reason

| Item | Why it is open |
| --- | --- |
| The roadmap draft (PR #937) is a draft, not the live roadmap | it was written before Rob's instruction to make it the single source of truth, mirrored in Linear |
| Nothing created in Linear | Rob had not asked; section 5 asks him to confirm the structure first |
| Production parity: migrations 0003 to 0006, 0009, 0010 on the production D1; about 15 PRs of main not released; secrets, `OWNER_EMAIL`, alerts, R2 backups | Rob's manual steps and his go; not read or changed here |
| Lag: instrumented nothing, changed nothing | no measurement exists; the draft's section 4 lists the cheap three-timestamp first step |
| Phone: not audited on a physical phone or against the fit-the-window rule beyond the lands-scroll fix | needs a device and Rob's eye |
| GPU browser, Safari, Firefox: not proven | no such browser here |
| 13 suites red on main (11 from this session's runs, 2 more from the playtest session's) | not this work's; each needs a fix or a reasoned retirement, listed in the draft under T2 |
| Review screenshots after the last desktop changes | not regenerated; staging serves the result |
| "The additional work planned from before" | Rob had no list to name; this handoff's roadmap and backlog are the answer to it |
| **[review]** Staging is five PRs behind main (#932, #935, #936, #942, #945) | the release owner (Claude · Engine) releases staging; not in this handoff's scope. Section 7's steps release it |
| **[review]** Two lines in `docs/ACTIVE.md` still say the staging migrations are Rob's to apply (the "Feedback form error on staging" line of the second PR's section, and "Not proven / Rob's" of PR 905's) | the review marks both as superseded; the third PR's "Known and Rob's" line is the current fact |
| **[review]** `docs/ACTIVE.md` has no record of the `a8abf916` staging release (main `b9999b16`, PR #925); it names only `8e608cfe` | added by the review under the phone follow-up line |
| **[review]** PR #937 is a draft against an older main | the review branch merges main; mark #937 ready only after Rob approves the roadmap shape |

## 9. What the first pass left out [review]

**9.1 Who else is working right now.** The roadmap and backlog session will not be alone. On 10-29: a Claude cloud session
holds the playtest fixes (ROB-201 to ROB-221, one PR per issue, `docs/ACTIVE.md` top section); the engine lane holds
ROB-205, 209, 210 and 211; ROB-199/200 (card load to 95%) and ROB-220 (Camera menu items to the Table menu) are In Progress.
The backlog sweep must link these issues, not copy them, and the roadmap must not reorder work another session holds
without Rob. ROB-212 and ROB-222 to ROB-225 were put out of the playtest's scope by Rob: they are backlog candidates as they
stand.

**9.2 The files are in lanes.** `docs/program/**`, the readout page, `north-star.json` and `tests/readout-feeds.mjs` are the
**Claude · Deck intelligence** lane's (`AGENTS.md`, Lanes; `docs/program/README.md`, the lane table). `AGENTS.md`,
`CLAUDE.md`, a root `docs/ROADMAP.md` / `docs/BACKLOG.md` and the root `BACKLOG.md` are in no lane. So: either the session
holds that lane for this work and says so in `docs/ACTIVE.md`, or the live files go at `docs/ROADMAP.md` and
`docs/BACKLOG.md` (section 5's proposal already does) and the draft under `docs/program/` becomes a pointer. Changing
`AGENTS.md` is a dated rule change: Rob's word, quoted, as every other rule there carries.

**9.3 A new suite has costs the proposal did not name.** `tests/roadmap-integrity.mjs` means `tests/data-integrity.mjs`
must know it, `README.md`'s suite count changes (whoever merges second sets it), and it must be broken once on purpose and
seen red ("A test that cannot fail is a comment"). It reads only the repo; Linear stays out of CI.

**9.4 What was re-checked and held.** Production `c567c581` (10-26, `cloud-production`); staging `a8abf916` carrying
`b9999b16`; every file, tool and folder sections 4, 5 and 7 name exists on the branch (`tools/bump-pins.mjs`,
`tools/serve-folder.mjs`, `tools/staging-check.mjs`, `tools/release-pages.mjs`, `tools/local-ci.sh`,
`docs/program/LAUNCH-CHECKLIST.md`, `docs/r4-execution/INCOMING-QUEUE.md`, `docs/ai-players/`, `docs/feedback-loop/`,
migrations 0001 to 0006, 0009, 0010: there are no 0007 or 0008); the roadmap draft already carries the "public release set
aside" note (its decisions section); Linear's eleven projects and their 10-18 dates. Not re-checked: the staging D1's
`d1_migrations` (no D1 read was made by the review) and the full local suite counts in section 2.

## 10. Rob's answers and what was built (2026-10-29) [review]

**Rob's answers.** *"The sessions/agents doing the work keep the roadmap and backlog up to date. They get assigned work
from the roadmap, they pull the features or build them out in Linear along with the stories and tasks, then they
execute, then they update Linear and GitHub and the roadmap. I want 1 structure for the organization of work ... So
yes, you can retire anything that doesn't support that end-to-end pattern."* Asked where the roadmap lives, he chose
**Linear** (over Google Drive), and asked for the cut-over to be built now. That answers questions 13 to 16 of
section 6 and supersedes section 5's proposals (no `docs/ROADMAP.md`, no `docs/BACKLOG.md`, no roadmap-integrity suite:
Linear holds the items, so there is nothing in the repo for such a suite to check).

**In Linear (verified by reading each object back after writing it):**

| What | Where |
| --- | --- |
| The process, written down | Document "How work flows: the one loop" on initiative I-1; the initiative's description points at it |
| Four track projects with features as milestones | P-ROB-12 Platform and runtime (R1 to R3), P-ROB-13 the Quality gate (Q1 to Q3), P-ROB-14 Trust (X1 to X3), P-ROB-15 Launch operations (L1 to L3) |
| The public release as a Future item | P-ROB-16, status Backlog; ROB-68 moved there; ROB-282 the decision |
| Order | Project priorities: P-ROB-1, 2, 12, 13, 15 High; 3 to 10 and 14 Medium; 11 and 16 Low |
| The roadmap draft's decisions, manual steps and items | ROB-228 to ROB-278, ROB-280, ROB-281 (the thirteen red suites are ROB-239 to ROB-251 under ROB-236; Rob's manual steps are ROB-265 to ROB-274 under ROB-261) |
| `BACKLOG.md`'s open items | ROB-279, ROB-283 to ROB-288 |
| Untracked open work found in the repo's docs (a read-only sweep of `docs/ACTIVE.md` since 10-18, the incoming queue, the audit status, the AI-player and feedback-loop plans) | ROB-289 to ROB-309 |
| This cut-over itself | ROB-310 (In Progress until this PR merges) |
| Issues whose premise changed | ROB-311, Rob's call: close or re-scope ROB-30, 59, 99, 95, 11, 14, 71 |
| A read-only audit of all 147 open issues against `main` | Evidence comments on the fifteen that look built; ROB-32 and ROB-33 set Done after the evidence was re-checked; the rest left for their holders |

**In the repository (this PR):** `AGENTS.md` gains "The work is in Linear: one loop" in place of "The baton is a file",
and the lanes section no longer sends anyone to `docs/ACTIVE.md` or a feed; `CLAUDE.md` points at the loop;
`docs/ACTIVE.md` is frozen as an archive under a banner; the readout (`docs/readout/`) and `tests/readout-feeds.mjs`
are removed (the README's suite list and count follow); `BACKLOG.md` is a table of where each item went; the roadmap
draft, the program charter, the workstream files and the kick-off prompts carry a banner and the one prompt to paste.

**Not done, with the reason:**
- Statuses of issues other sessions hold were not changed; the audit's evidence is on them for their holders.
- `docs/handover-index.md` and the dated handoff files still mention the readout and `ACTIVE.md`; they are history.
- Every platform needs Linear access to run the loop (Codex, Cursor and Grok through their own integrations); not
  verified here.

