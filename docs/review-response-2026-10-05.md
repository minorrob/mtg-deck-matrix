# The independent review of 2026-10-05: what it found, what was done, and the plan from here

The review (OpenAI, report-only, `CrankMagic-review.html` with its `Claude-feedback.txt`) tested the live game's code
freeze, `31801daa`, with Rob's backup `crankmagic-backup-live-game-2026-10-04.json`, on Windows with Node 24.19.0. Its
verdict: **GO WITH WORKAROUNDS for exact-deck local play**; two minor findings (F-1, F-2); real staging not assessed.
This document evaluates each claim against the code, records what this session (Claude, a cloud container, branch
`claude/admiring-franklin-58cxy4`) changed and proved, and replaces the order of `docs/plan-execution-2026-10-03.md`
until the first live game in the cloud is played. That plan's steps resume after Phase L, as section 5 says.

## 0. In one screen

| | |
| --- | --- |
| **Where things stand** | The live game of 2026-10-04 was not played: staging never received the freeze. The Cloudflare API shows `crankmagic-staging` last deployed 2026-10-03 04:57 UTC (version `99f23f29`, from `main` 8107df4), which predates M5: the Worker that carries the engine and its 1,558 definitions has never run on Cloudflare. |
| **The review, evaluated** | Its verdict stands. F-1 is right and was worse in our own suite than in its fuzz script. F-2 is right, and is a code regression rather than the machine: bisected to #600, fixed, the same games event for event. The unmodified gate on the freeze, run here on the supported toolchain, passes all 342 suites. |
| **Found while evaluating** | A risk the review did not reach because it never ran on Cloudflare: once every person is out of a game, the AI seats played the rest inside one Durable Object request, and a request has 30 s of CPU. Built: the room plays the AI seats in slices on the object's alarm. |
| **Next** | Done: this branch merged on the gate (#665, `main` 2fd4b1bd), the staging release walked and pushed (`release/cloud-staging` 4f2c85df). **Staging runs it**: version `88cd1fae`, deployed 18:20:29 UTC, its Worker byte-identical to the release's bundle. Next, L2 (a signed-in person sees "Version 2fd4b1b · 2026-10-05" in Settings, a friend joins) and the first live game. |

## 1. The review, claim by claim

| Claim | Verdict here | Evidence (command or measurement) | Done |
| --- | --- | --- | --- |
| **Overall: GO WITH WORKAROUNDS** for exact-deck local play | **Agree.** Its browser evidence is the strongest end-to-end proof this project has: a natural four-seat finish on turn 40, 732 answers replayed to the same end, 1,538 journal entries reproduced, two reloads and a 60-second disconnect, a phone at 390 x 844, and the invitation refusals | the review's T3-T5 | kept as the baseline for the first live game |
| **F-1:** the fuzz script's "0 refused" covers retained history only | **Agree, and it was ours too.** `tests/engine-room-games.mjs` counted the same way. On its pinned deal, seed 1 refused **22** answers while the history still held **12**; seed 2, 5 against 3. Readiness claims built on that count (ACTIVE.md's "A4/A5 ... no refused answer") were measuring the 300-line window, not the game | `node tests/engine-room-games.mjs` (the tally, printed per seed); the probe in section 2 | the match-lifetime tally; `tools/fuzz-live.mjs`; `tests/room-refusals.mjs` |
| **F-2:** the room-games timing gate fails (seed 11, 53.2 s; seed 4, 46.9 s under load) | **Agree it is real; it is a regression, not the environment.** Same pinned deal, fresh process, this container: seed 11 took **4.1 s** at 5022e161 (where the 45 s budget was set) and **21.4 s** at the freeze, while playing fewer events (1,697 against 2,175). Bisected over the 73 merges to **#600 (X8a, cast in one action)**: the house pilot casts more, boards carry more continuous effects, and CR 613.8's ordering asked every pair again on every pass, four `structuredClone`s a trial (72% of the game's CPU) | section 3 | fixed: seed 11 **5.1 s**, the suite 99 s to 54 s, all ten games identical |
| The 342-suite baseline is not a clean pass on the review machine | **Agree for that machine; it passes on the supported one.** The workflow and `tools/local-ci.sh` require Node 22; the review ran Node 24 on Windows, and its two Git-dependent failures were the archive having no `.git`. Here, a clean checkout of `31801daa`: **PASS, 342 suites and 262 node tests, 987 s** | `tools/local-ci.sh 31801daa 1` (Node 22.22.0, Playwright 1.56.0, Linux) | no production code changed for the review's environment, as it asked |
| Worst human wait 6.5 s under concurrent load; 0.29 s and 2.6 s alone | **Agree; environment.** The five-second rule (G-B) is measured over the network, on staging, not on a loaded desk machine. The layer fix cuts the AI's time between a person's decisions by the same factor as the games | section 3 | measured again at staging in L2 |
| T7: real staging not verified | **Agree, and it is the gap that matters most.** Section 0 | Cloudflare API, `workers/scripts/crankmagic-staging/deployments` | Phase L |
| Known limitations are not new findings | **Agree;** the workarounds stay exactly as the brief wrote them (section 4). Three of them are the likeliest to stop an invited friend, so they are scheduled as fixes after the first game (L5), not relabeled as regressions | | |

**Where the review's own method could mislead, said once.** Its timings come from a machine that runs these games about
2 to 2.6 times slower than the container, and slower again beside other jobs; Node 24 is not the cause (on the
container, seed 11 at the freeze took 21.3 s on Node 22 and 19.1 s on Node 24). Its numbers are independent evidence
of behavior, and are read here as such, not as the speed staging will run at.

## 2. What this session changed, and the proof of each

Branch `claude/admiring-franklin-58cxy4`, from `main` at `31801daa` (main has not moved).

| Change | Files | Proof |
| --- | --- | --- |
| **The match's refusal tally (F-1).** Every refused pilot answer counted from the match's first event (`room.refusals`: `total`, `since`, the first 20 in full), saved with the room, reopened with it, in the fingerprint and in the full playtest record. A room saved before the tally counts from where it is reopened and says so (`since` > 0), so its zero is never taken for the whole game | `game/room/room.mjs`, `replay.mjs`, `table.mjs` | `node tests/room-refusals.mjs`: 20 checks, six breaks caught; `tests/table-record.mjs`, `tests/game-room.mjs`, `tests/game-replay.mjs` |
| **The harness on the corrected metric.** `tools/fuzz-live.mjs`: seeded games of a backup's decks through the real room, people answering through `room.act` and optionally reopened every N answers; a game is clean only if it finished, was counted from its start and refused nothing | `tools/fuzz-live.mjs` | `tests/room-refusals.mjs` drives it: a forced refusal at the opening hand of two-seat games that outrun the 300-line window, AI-only (start to end in one call) and with a person, reopened every ten answers and after the end: the tally stays 1, the harness fails both, replay agrees, a clean game is 0 |
| **The layer fix (F-2).** Each pair of a layer's effects asked once per ordering; a trial copies only the lists `applyEffect` pushes onto | `game/engine/rules/layers.mjs` | all ten pinned room games identical (state hash, events, turns) before and after; `tests/engine-derive-once.mjs`: five dependent effects ordered with at most one trial a pair (30 before, 14 after; caught when the memo is removed); a trial that shares lists is caught by that check and by the card scenarios |
| **Slices (found here).** A room given `slice` stops after that many engine steps with nobody asked (`continuing`), saved; `resume` plays on; the table's object sets its alarm for now; leaving and ending wait, refused with when to try again; a dropped player's five minutes wait too. The board says "The AI players are taking their turns…" | `game/room/room.mjs`, `table.mjs`, `cloud/game-room.mjs`, `crankmagic-board.js` (pins bumped) | `node tests/room-slices.mjs`: 26 checks, eight breaks caught; `tests/uat/play-e2e.mjs` under `wrangler dev` 4.139.0: **26 checks**, including a conceded game played to its end on the object's alarm in workerd and replayed in one go (fails with slices off) |

**Not done here, and why.** The 50 mixed-seat and 30 AI-only games on the exact live decks need the backup file,
which lives on Personal-HP and in the review folder, not in this repository or this container (section 6, A2). The
command is ready:

```bash
node tools/fuzz-live.mjs --backup crankmagic-backup-live-game-2026-10-04.json \
  --decks "Jace, Multiverse Architect (Trey)|Chulane, Teller of Tales (AI 1) (table)|Kiora of Salt and Sand (AI 2) (table)|Teysa Karlov (AI 3) (table)" \
  --humans 0,1 --seeds 1-50 --json fuzz-human.json
node tools/fuzz-live.mjs --backup crankmagic-backup-live-game-2026-10-04.json --decks "<the same four>" --seeds 1-30 --json fuzz-ai.json
```

Until it has run, no document here says the live decks play with zero refused answers. Given what the pinned deal
showed, a nonzero total is likely: the house pilot does not see attack taxes (Propaganda; Jace's own "pay {2}"), and
its refused attack becomes no attack. That is an AI-quality finding for the follow-up list, not a crash: the room
survives it with the least legal answer, as `tests/game-room.mjs` proves.

## 3. F-2 in numbers

The room-games deal is pinned (`tests/fixtures/room-games-pool.json`); the probe plays it through the same room and
card source, one process per measurement, on the container (4 cores, Node 22.22.0) unless it says otherwise.

| Seed 11 | Time | Turns, events |
| --- | --- | --- |
| at 5022e161, where the budget was set | 4.1 s | 50, 2,175 |
| at #599 (the merge before X8a) | 5.3 s | 50, 2,175 |
| at #600 (X8a) | 17.3 s | 37, 1,692 |
| at the freeze `31801daa`, fresh / in the suite's position | 21.4 s / 19.4 s | 37, 1,697 |
| at the freeze on Node 24.21.0 | 19.1 s | the same |
| **after the fix** (Node 22 / Node 24) | **5.1 s / 4.8 s** | the same game |

GC was not the cause: in the suite's position the whole run paused about 2.0 s for GC across nine games; the heap
stayed between 30 and 90 MB, so nothing leaks between games. After the fix the slowest held seed is **seed 1, about
18 s**, with no single hot spot (a 95-turn game, its cost spread across derivation): that is X9's work (the room's
budget), not a regression. The budget stays 45 s, and its comment now says which machine its numbers are from.

### Slices

A whole game of four house pilots is 1,500 to 4,500 engine steps, and a step late in a big game costs up to about 20 ms
here. Longest single slice over the ten pinned games: 18.2 s at 4,000 steps, 12.5 s at 1,500, 7.6 s at 500, **5.0 s at
250**, the value set (`SLICE_STEPS`, `cloud/game-room.mjs`). At the review machine's speed that is about 13 s, inside
Cloudflare's 30 s. Every sliced game had the same state hash as the game played in one go. The Worker bundle that
carries this is 2.0 MB, 362 KB gzipped (a `wrangler deploy --dry-run` of the staging build), under the Free plan's
3 MB.

## 4. The known limitations, with the user workarounds kept verbatim

From the review's "Before inviting a friend", which is the brief's:

- Use staging's intended freeze and confirm the deployed version.
- Have the friend sign in first and restore the backup through Settings → Data, then open the invitation. A signed-out
  Access redirect losing the invitation fragment is a known limitation.
- Use Jace's original deck and the three (table) copies. The original AI decks still contain unsupported cards.
- Keep the invitation link handy. Before the game starts, Play opens New table instead of returning to the occupied
  seat; reopening the link works.
- For exile or alternate-cost casts, put mana into the pool first. On a phone, use landscape and the hand control; the
  upright board's rotation is documented behavior.

## 5. The plan from here, to the end state

The end state is `docs/plan-to-done-2026-09-30.md` Part 7: the gates G-A to G-F and the two sentences, said only when
true. Rob's priority now is live games in the cloud, so **Phase L comes first**; the execution plan's steps resume after
it, in their order, with the changes in the last table.

### Phase L: live games in the cloud

| Step | What | Who | Proof | Needs |
| --- | --- | --- | --- | --- |
| **L0** | This branch: F-1, F-2, slices. Gate on the exact head, PR, merge to `main` | session | `tools/local-ci.sh <head> 2` PASS block on the PR | -- |
| **L1** | The staging release of that `main`: built, walked (`release-acceptance`, `play-e2e`), committed and pushed to `release/cloud-staging` (`tools/release-staging.sh`) | session | the two walks' counts, the release commit | -- |
| **L1b** | **Deploy it** | **Rob** (A1) | `wrangler deploy`'s version id, which the session reads back from the Cloudflare API | A1 |
| **L2** | Verify the deployed site: the version id and `crankmagic-version` meta read back; Rob signs in through Access and opens Play; a friend signs in and reopens the invite; both WebSockets carry a game; the five-second rule measured over the network | session (version), Rob and a friend (the rest) | the version, Rob's word, the record downloaded | A1, A3 |
| **L3** | **The first live game**: Rob, a friend, two AI seats (or Rob and three), the backup's decks as seated in the brief; the full record downloaded and replayed; its `refusals` read | Rob and a friend; session reads the record | the record, replayed | L2 |
| **L4** | The 80 games of section 2 on the exact decks, on the corrected metric; each refusal found becomes a house-pilot fix (attack taxes first) | session | `fuzz-human.json`, `fuzz-ai.json` | A2 |
| **L5** | The three limitations likeliest to stop a friend, one PR each, released to staging: the invitation survives the Access sign-in (the code carried where a redirect keeps it, not in the `#` fragment); the empty library says how to restore the decks; Play returns to the occupied table before the game starts | session | the browser suites that hold each, `play-e2e` | -- |
| **L6** | A deploy path that does not need Personal-HP: either the cloud environment's credential changed (A4) and `tools/deploy.sh` (X7) run from the container, or Workers Builds repaired; and an Access service token for the automated live checks G-C asks for | session after Rob | a staging release deployed by script, its version read back | A4, A5 |

### After Phase L: the execution plan's steps, as amended

| Step | Change from `docs/plan-execution-2026-10-03.md` |
| --- | --- |
| The 28 undefined live-deck cards | First after L: helper B's 19 (waiting on A6), then the 9 others, so the true AI decks seat without stand-ins |
| X8b, X8c | Unchanged |
| **X9 The room's budget** | Narrowed: the regression is fixed; what is left is seed 1's spread cost and a CPU check in `tests/engine-perf.mjs` that fails on a machine like the container's, so a regression is caught where it is introduced instead of by an outside review |
| X7 Releases by script | Moves into L6 |
| X10-X14, G-B to G-F | Unchanged, except that G-B's five-second rule and G-C's version read-back are first measured in L2 |
| Readiness claims | Every claim of "no refused answer" is read from `room.refusals` (or `tools/fuzz-live.mjs`), never from the history |

## 6. Rob's questions and actions

Each has the recommended answer; the session takes it unless Rob says otherwise.

| # | Action or question | Recommended | Why it is Rob's |
| --- | --- | --- | --- |
| **A1** | **Deploy staging** once the session has pushed the release (L1). In PowerShell on Personal-HP: `cd C:\Users\robmi\CrankMagic\repo`; `git fetch origin release/cloud-staging`; `git archive --format=zip -o ..\staging-release.zip origin/release/cloud-staging`; `Expand-Archive ..\staging-release.zip -DestinationPath ..\staging-release -Force`; `cd ..\staging-release`; `C:\Users\robmi\CrankMagic\workbench\cloudflare\wrangler.cmd --version` (it must say 4.139.0); `C:\Users\robmi\CrankMagic\workbench\cloudflare\wrangler.cmd deploy`. No database migration is needed (none changed since the live build). Then tell the session "deployed" | Deploy the new release, not last night's freeze folder: it carries the slices, without which a game whose people are all out can stop on Cloudflare's 30 s limit with its end never recorded | The container's proxy replaces the `Authorization` header on every request to `*.cloudflare.com` with the account token, and wrangler's asset upload authenticates with its own upload token, so the upload is refused (seen 2026-10-02, and confirmed today: a request with another token in that header is answered as the account token) |
| **A2** | Attach `crankmagic-backup-live-game-2026-10-04.json` to this session (or the next) | Yes | It is your library, and it is not in the repository by design |
| **A3** | Confirm the friend's address is on staging's Access **Invited** policy, and tell them to sign in and restore the backup *before* opening the invite (section 4) | Yes | Access is your dashboard |
| **A4** | Let cloud sessions deploy staging: in this environment's settings, remove the Cloudflare entry from the proxy-injected API credentials and add a token as the environment variable `CLOUDFLARE_API_TOKEN` instead, so wrangler sends its own headers. The same token moved is the first thing to try; if wrangler names a missing permission, the session says which | Yes, staging only; production stays your go every time | It is your environment and your credential |
| **A5** | An Access service token for automated checks of staging (version read-back, the live walk), given to sessions as `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` | Yes, scoped to staging | It changes Access policy, which the review asked not to do on its say-so |
| **A6** | Approve helper B's pushes (its 19 AI 1 and AI 3 cards), as ACTIVE.md has asked since 2026-10-04 | Yes | Its permission check refused every route |
| **A7** | Two drafts of last night's session wait for you: **#663** (the Play walk with two people and an AI from a library backup, which also touches `tests/uat/play-e2e.mjs`) and **#664** (its record of the checks after the freeze). Folding them into this branch was refused by this session's permission check, so: merge them after this PR, or tell the session to fold them in | Fold them in after this PR merges, with their walk run again on the merged tree. #664's "100 games ... none refused" was counted from the history, like the review's script, and is recounted in L4 | Another session's PRs |
| **A8** | Remove the staging Access policy **"Rehearsal: test friend (2026-10-04)"** that #664 says that session added (it admits only its test identity; "Rob Only" untouched), or confirm it should stay for automated checks until A5 replaces it | Remove it once A5's service token exists | Access policy is yours, and the review asked that it not change on its say-so |
| **Q1** | When every person at the table is out, should the AI seats play the game to its end (as now, in slices, the board saying so) or should the table end the game there? | Play on: the record then says who won, and nothing a person chose is cut short | A product call |
| **Q2** | Standing, unchanged: D7 (the runner or Actions billing), D8 (Workers Builds and previews off, or repaired), D11 (the permission rule for merges and release pushes), the production release and Play on production | As the execution plan recommends | Yours since 2026-10-03 |

## 7. Assumptions and confidence

| | |
| --- | --- |
| **Proven here** | Every row of section 2 and the numbers of section 3, by the commands named; the freeze's gate on Node 22; the staging Worker's last deployment and the account's plan, read from the Cloudflare API. |
| **Assumed** | That workerd on Cloudflare runs the engine within about 2.6 times the container's speed (the slowest machine measured); that the Free plan's Durable Object limits are those Cloudflare documents (30 s of CPU per request or alarm, both plans). L2 measures both. |
| **Not proven, and why** | Anything at the deployed site (A1); the exact live decks' refusal totals (A2); a phone or Firefox (AGENTS.md's table). The board's WebSocket at the real staging cannot be proven from a cloud container at all: its proxy carries no WebSocket (#664), so L2's socket check is Rob's and the friend's. |
