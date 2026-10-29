# Handoff: from the Table, Focus and phone work to the live roadmap and backlog, 2026-10-29

*From the Claude cloud session that built and released the Table/Focus HUD, the card-shaped piles, the layering and the phone
fix, applied the staging migrations, and wrote the production-readiness roadmap draft (session
`018fHA6QX1E9X946VyGDp93o`, branch `claude/gifted-ride-w6xoa3`). For the session Rob starts next. AGENTS.md's four things
apply: what was shipped (branch, commit), what is proven and what is assumed, the command that proves each claim, and what is
outstanding with the reason. Facts are marked **[verified]** (checked this session), **[doc]** (a repo doc says so) or
**[inference]**.*

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
| Main | `50297778` or later (other sessions merge too: ROB-204/213/214 landed during this session) | **[verified]** `git log origin/main` |
| Production D1 migrations | 0001 and 0002, from the 10-25 release record. **Not re-read**: this session's guard refused production reads | **[doc]** `docs/ACTIVE.md` |
| The Actions gate | the `suites` job is canceled at `timeout-minutes: 60`; merges have used a full local run, recorded as a comment on each PR | **[verified]** run 3423 |
| Red on main, not this work's | `board-target-lands`, `board-ending-rematch`, `board-mana-symbols`, `board-control`, `browser-geometry`, `precons`, `page-budget`, `coach`, `crankmagic-coach`, `engine-breaks-anchors`, `table-record` | **[verified]** two full local runs |
| Linear | initiative I-1 with projects P-ROB-1 to P-ROB-11; every project last updated 2026-10-18 | **[verified]** Linear MCP |
| Readout feeds (`docs/readout/feeds/*.json`) | dated 10-18 to 10-26; they list as backlog things `docs/ACTIVE.md` says are built | **[verified]** by two readers |

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
| 11 suites red on main | not this work's; each needs a fix or a reasoned retirement, listed in the draft under T2 |
| Review screenshots after the last desktop changes | not regenerated; staging serves the result |
| "The additional work planned from before" | Rob had no list to name; this handoff's roadmap and backlog are the answer to it |
