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
| **L2, the version** | Rob, 2026-10-06: "2fd4b1b · 2026-10-05 is current at staging" (Settings, signed in). Left of L2: a friend through Access, and both boards playing. |
| **Rob's answers, 2026-10-06** | Workers Builds deployed staging, not Rob (D8 changes, 6.1); #663 and #664 folded in; once every person is out the game ends there (built); the standing decisions explained in 6.1. |
| **Rob's actions, 2026-10-06 (later)** | **The repository is public** (D7, option C): Actions is free and unlimited on GitHub's runners, so the gate is Actions again, on the next push. **The Access service token exists** (`crankmagic-staging-checks`, to 2027-10-06) with a Service Auth policy, "Session checks", on CrankMagic staging, and **the rehearsal policy is gone** (A5, A8; read from the Cloudflare API). **The deploy fallback is set** as an environment variable (A4's second part), which only a new session receives. Left of A4: the injected token still expires 2026-10-25 and still cannot read Workers Builds. |

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
| **L1b** | Deploy it | Workers Builds, on the push to `release/cloud-staging` (2026-10-05 18:20 UTC; Rob did not deploy) | the version id read back from the Cloudflare API, and the deployed Worker compared byte for byte with the release's bundle | -- |
| **L2** | Verify the deployed site: the version id and `crankmagic-version` meta read back; Rob signs in through Access and opens Play; a friend signs in and reopens the invite; both WebSockets carry a game; the five-second rule measured over the network | session (version), Rob and a friend (the rest) | the version, Rob's word, the record downloaded | A1, A3 |
| **L3** | **The first live game**: Rob, a friend, two AI seats (or Rob and three), the backup's decks as seated in the brief; the full record downloaded and replayed; its `refusals` read | Rob and a friend; session reads the record | the record, replayed | L2 |
| **L4** | The 80 games of section 2 on the exact decks, on the corrected metric; each refusal found becomes a house-pilot fix (attack taxes first) | session | `fuzz-human.json`, `fuzz-ai.json` | A2 |
| **L5** | The three limitations likeliest to stop a friend, one PR each, released to staging: the invitation survives the Access sign-in (the code carried where a redirect keeps it, not in the `#` fragment); the empty library says how to restore the decks; Play returns to the occupied table before the game starts | session | the browser suites that hold each, `play-e2e` | -- |
| **L6** | The deploy path without Personal-HP exists again (Workers Builds, D8). Left: preview builds off (D8), the token's read access to Builds (A4), an Access service token for the automated live checks G-C asks for (A5) | session after Rob | a build's log read by a session; the live walk run against staging | D8, A4, A5 |

### After Phase L: the execution plan's steps, as amended

| Step | Change from `docs/plan-execution-2026-10-03.md` |
| --- | --- |
| The 28 undefined live-deck cards | First after L: helper B's 19 (waiting on A6), then the 9 others, so the true AI decks seat without stand-ins |
| X8b, X8c | Unchanged |
| **X9 The room's budget** | **Done (2026-10-06).** The CPU check went into `tests/engine-room-games.mjs`, which already plays the games, instead of a new `engine-perf.mjs` that would play them twice: each game's own-thread CPU in units of a yardstick run in the same process, a game at most 15 a thousand events and the ten together 8 (measured 1.8-9.4 and 4.1-5.4, alone and three at a time), and derivations and dependency trials an event held under 450 and 1,600. With F-2 put back it fails: seed 10 at 23.4, the ten at 12.0. Seed 1's spread cost: two answers asked again and again inside one question are now made once (whether an ability names the chosen type; the protections in play, once per target candidate), seed 1 21.1 s of CPU to 18.0 s, the same game; no single cost is over 9% of it, so what is left is spread across derivation |
| X7 Releases by script | Moves into L6 |
| X10-X14, G-B to G-F | Unchanged, except that G-B's five-second rule and G-C's version read-back are first measured in L2 |
| Readiness claims | Every claim of "no refused answer" is read from `room.refusals` (or `tools/fuzz-live.mjs`), never from the history |

## 6. Rob's questions and actions

Each has the recommended answer; the session takes it unless Rob says otherwise.

| # | Action or question | Recommended | Why it is Rob's |
| --- | --- | --- | --- |
| **A1** | ~~Deploy staging from Personal-HP~~ **Done without you (2026-10-05):** Workers Builds deployed the push to `release/cloud-staging` at 18:20 UTC (Rob, 2026-10-06: "I did not"). Pushing `release/cloud-staging` is how staging deploys again | -- | -- |
| **A2** | Attach `crankmagic-backup-live-game-2026-10-04.json` to this session (or the next) | Yes | It is your library, and it is not in the repository by design |
| **A3** | Let the friend through staging's Access. **Correction (read from the Cloudflare API, 2026-10-06):** the "CrankMagic staging" application has no Invited policy; it admits exactly two addresses, through "Rob Only" and "Rehearsal: test friend (2026-10-04)". ("Invited" belongs to production's `crankmagic.com/api/*`.) Add the friend's address to a staging policy, and tell them to sign in and restore the backup *before* opening the invite (section 4) | A policy "Friends" on the staging application, Allow, Include: Emails | Access is your dashboard |
| **A4** | **Half done (Rob, 2026-10-06: "6 ... done"):** the deploy fallback, the Cloudflare token as the environment variable `CLOUDFLARE_API_TOKEN`, which a new session receives (this one still runs on the injected token). **Left:** the injected token (`825fc1a3`) still expires 2026-10-25 and its Builds API still answers "Invalid token" (read 2026-10-06 after Rob's change): add Workers Builds Configuration, Read and move the expiry (6.2). Was: optional now: the Cloudflare token as an environment variable (not the proxy's API credentials), only as a fallback if Workers Builds stops again; and, separately, read access to Workers Builds for the token (its Builds API answers "Invalid token" today), so a session can read a build's log instead of inferring it from the deployments list | Read access yes; the deploy fallback only if Builds fails again | Your environment and your credential |
| **A5** | **Done (Rob, 2026-10-06; read from the Cloudflare API):** service token `crankmagic-staging-checks`, expiring 2027-10-06, and the Service Auth policy "Session checks" on CrankMagic staging. Whether `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` are in the environment a new session says. Was: an Access service token for automated checks of staging (version read-back, the live walk), given to sessions as `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` | Yes, scoped to staging | It changes Access policy, which the review asked not to do on its say-so |
| **A6** | Approve helper B's pushes (its 19 AI 1 and AI 3 cards), as ACTIVE.md has asked since 2026-10-04 | Yes | Its permission check refused every route |
| **A7** | **Done (Rob, 2026-10-06: yes):** #663 and #664 folded into the next PR, their walk run on the merged tree (`play-e2e` 35 checks), #664's "none refused" qualified like the freeze record's | -- | -- |
| **A8** | **Done (Rob, 2026-10-06; read from the Cloudflare API):** staging's policies are now "Rob Only" and "Session checks". Was: remove the staging Access policy **"Rehearsal: test friend (2026-10-04)"** that #664 says that session added (it admits only its test identity; "Rob Only" untouched), or confirm it should stay for automated checks until A5 replaces it | Remove it once A5's service token exists | Access policy is yours, and the review asked that it not change on its say-so |
| **Q1** | **Answered (Rob, 2026-10-06: no):** once every person at the table is out -- lost, conceded or out of time -- the game ends there, the AI seats not playing it out. Built as the pod's `endWhenNoPerson`, which the table sets as it launches, so a game made before it replays as it was played; the record says "every person had left the game, so it ended there", and a person knocked out files a loss | -- | -- |
| **Q2** | The standing decisions D7, D8, D11 and production, explained with options in section 6.1 | See 6.1 | Yours |

### 6.1 The standing decisions, explained (Rob asked, 2026-10-06)

**D7 -- where the test gate runs.** Every merge must pass the whole gate (344 suites, about 16 minutes a run). GitHub
Actions is supposed to run it; since 2026-09-27 every job fails within seconds ("recent account payments have failed or
your spending limit needs to be increased"), so each merge waits on `tools/local-ci.sh`, run twice, about 32 minutes of
a session per merge, with its PASS block pasted on the PR. On a private repository GitHub Free includes 2,000 Actions
minutes a month, and Linux minutes past that cost $0.006 each since January 2026 (they were $0.008).

| Option | Cost | Trade-off |
| --- | --- | --- |
| **A. Fix the Actions billing** (GitHub, Settings, Billing and plans: a working payment method and an Actions spending limit above $0, say $10 a month) | A run is about 22 minutes, so about 90 runs a month are free and each one past that is about 13 cents; $10 covers about 75 more | The gate returns as a green check on every PR at no session time. Recommended |
| B. A self-hosted runner on Personal-HP (the plan's D7) | Free (GitHub postponed the per-minute fee it had announced for self-hosted runners) | Runs only while the PC is on and awake, on Windows, beside your own work; the workflow already has a fallback to GitHub's runners |
| **C. Make the repository public (Rob chose this, 2026-10-06)** | Actions free and unlimited | The code, the plans and the history are public. The history scanned on 2026-10-06 with the gate's own patterns: no key or token; three personal e-mail addresses in commits of 2026-09-17 to 2026-09-24 (removed from the files on 2026-09-24, still in those commits; one only on the branch `cursor/personal-hp-online-2026-09-17`). Removing them from history is a rewrite of `main`, Rob's call. With a public repository, B is no longer safe: a self-hosted runner would run any fork's pull request on Personal-HP |
| D. Keep the local gate | Free in dollars | About 32 minutes of a session per merge, and the merging session vouches for its own run |

**D8 -- how releases deploy.** The plan recommended turning Cloudflare Workers Builds off and deploying from Personal-HP,
because every build terminated in its queue from 2026-10-03 05:19 UTC. That has changed: on 2026-10-05 Workers Builds
deployed the push to `release/cloud-staging` twelve minutes after it, with nobody at Personal-HP. So:

| | Recommended |
| --- | --- |
| Staging | Keep Workers Builds on `release/cloud-staging`: a session's push is the deploy, and its version is read back from the Cloudflare API (done this way for 2fd4b1bd) |
| Production | Keep it on `release/pages` too, which means **a push to `release/pages` is a production deploy**, so it stays your go, every time (AGENTS.md). `release/pages` holds 2543cef (2026-10-03), never deployed; crankmagic.com still serves b630128 (2026-10-01) |
| Previews | Turn the preview builds off for both Workers (Workers, each Worker, Settings, Builds: non-production branch builds off). They build every branch push, fail (the configuration has no previews block), put two red checks on every PR, and crowd the queue that terminated the release builds |
| The fallback | A4's environment variable, kept in reserve in case Builds stalls again |

**D11 -- what a session may do without asking.** Rob set on 2026-09-19 that an agent may merge to `main` after standard
practice. The session's own permission check does not know that rule: on 2026-10-03 it refused `gh pr merge` and the
re-run of a build, and on 2026-10-05 it refused folding #663 and #664 into a branch until you said yes. D11 is a
standing rule in the repository's Claude Code settings so those stop being asked one at a time.

| Allow without asking | Keep asking |
| --- | --- |
| Merging a PR whose local-gate or Actions PASS is on it; merging other agents' `claude/*` branches into a working branch; pushing `release/cloud-staging` (a staging deploy) | Pushing `release/pages` (production); anything in Cloudflare Access; force-pushing or deleting branches; closing another session's PR |

Recommended: yes, as that table splits it. The session writes it into `.claude/settings.json` on your go.

**Production -- when crankmagic.com changes, and whether Play goes live there.** Production runs the `pages` profile:
the workshop (Build, Decks, Explore, buying), Play showing Coming Soon, accounts behind Access on `/api/*`. It serves
b630128 of 2026-10-01; five days of workshop work on `main` have not reached it.

| Option | Recommended |
| --- | --- |
| Refresh the workshop now: the `pages` build of `main`, walked by `release-acceptance`, pushed to `release/pages` (Workers Builds deploys), walked again live | Yes, whenever you say go: it changes nothing about Play, and the walks hold the journeys |
| Play on production | Not before G-F, as the plan has it: after Grok Bot's agents, your invitees and your own review at staging |

### 6.2 How to do A4, A5, A8 and A3 (Rob asked, 2026-10-06)

The facts these rest on, read from the Cloudflare API on 2026-10-06: the account token this environment injects (id
starting `825fc1a3`) **expires on 2026-10-25**; staging's Access application, "CrankMagic staging", has two Allow
policies, "Rob Only" and "Rehearsal: test friend (2026-10-04)", each one email address; the account has no Access
service token yet.

**A4 -- the session's Cloudflare token (the part still worth doing).** Workers Builds now deploys staging on a push, so
the deploy fallback can wait. Two small changes to the existing token, in the Cloudflare dashboard: Manage Account,
Account API Tokens, the token whose id starts `825fc1a3`, Edit.
1. Add the permission Account, **Workers Builds Configuration, Read** (lets a session read a build's status and log).
2. Set its expiry past 2026-10-25, or sessions lose Cloudflare access that day.
3. Save. Nothing changes in this environment: the proxy keeps injecting the same token.

Only if Workers Builds stops deploying again: create a token from the "Edit Cloudflare Workers" template, then in this
environment's settings (the cloud environment menu in the session's title bar, then Edit) add it as the environment
variable `CLOUDFLARE_API_TOKEN` and remove the Cloudflare entry from the API credentials, since while the proxy injects
a token it overwrites wrangler's own.

**A5 -- a service token for automated staging checks.** In the Zero Trust dashboard (one.dash.cloudflare.com):
1. Access, Service credentials, Service Tokens, **Create Service Token**. Name `crankmagic-staging-checks`, duration a
   year. Copy the Client ID and the Client Secret now: the secret is shown once.
2. Access, Applications, **CrankMagic staging**, Policies, Add a policy: name `Session checks`, action **Service
   Auth**, Include: Service Token, `crankmagic-staging-checks`. Save.
3. In this environment's settings (as above), add two environment variables, `CF_ACCESS_CLIENT_ID` and
   `CF_ACCESS_CLIENT_SECRET`, with those values. A new session picks them up. Never paste them into a chat.

With it a session can read staging's pages and `version.json` itself (sending `CF-Access-Client-Id` and
`CF-Access-Client-Secret`). Playing a table needs one more step of ours: the Worker knows a person by the email in
Access's token, and a service token carries none, so the table API answers "Sign in to use a table". Letting the
service token sit at playtest tables as a named test seat is L6's code change, the session's.

**A8 -- the rehearsal policy.** Access, Applications, CrankMagic staging, Policies, "Rehearsal: test friend
(2026-10-04)", Delete. It admits only the test identity of 2026-10-04's session. Do it after A5 (or now: nothing of
ours depends on it once the service token exists).

**A3 -- the friend.** Same application, Add a policy: name `Friends`, action **Allow**, Include: Emails, the friend's
address (more addresses later). Save. Then the friend signs in at staging.crankmagic.com, restores the backup in
Settings, Data, and only then opens the invitation link (section 4).

## 7. Assumptions and confidence

| | |
| --- | --- |
| **Proven here** | Every row of section 2 and the numbers of section 3, by the commands named; the freeze's gate on Node 22; the staging Worker's last deployment and the account's plan, read from the Cloudflare API. |
| **Assumed** | That workerd on Cloudflare runs the engine within about 2.6 times the container's speed (the slowest machine measured); that the Free plan's Durable Object limits are those Cloudflare documents (30 s of CPU per request or alarm, both plans). L2 measures both. |
| **Not proven, and why** | Anything at the deployed site (A1); the exact live decks' refusal totals (A2); a phone or Firefox (AGENTS.md's table). The board's WebSocket at the real staging cannot be proven from a cloud container at all: its proxy carries no WebSocket (#664), so L2's socket check is Rob's and the friend's. |
