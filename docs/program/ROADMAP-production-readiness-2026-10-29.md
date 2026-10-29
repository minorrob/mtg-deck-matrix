# The road to a production-ready CrankMagic: what is outstanding, in the order to do it, and what to do about hosting

*Written 2026-10-29 by a Claude cloud session, for Rob, from the repository at main `50297778`, the staging and production
release records, the Linear initiative I-1, and two read-only research passes (an inventory of every doc that lists work, and a
read of the architecture and of what is known about lag). `AGENTS.md` is still the law; where this file and it disagree,
`AGENTS.md` wins. Facts are marked **[verified]** (I checked them this session), **[doc]** (a repo doc says so; not re-checked) or
**[inference]** (my judgment). Nothing here was read from the production database or Worker: the session's guard refused
production reads, so production's migration state below is from the docs and must be re-read before anything is applied there.*

## 0. How to use this

Rob's request: one place to say "take workstream X" or "take the next body of work". The north star already has the outcomes
(Linear initiative **I-1**, projects **P-ROB-1 to P-ROB-11**; `docs/program/README.md`, `LAUNCH-CHECKLIST.md`), but two things are
missing from it, and both are on this page:

1. **Every project's status was last touched 2026-10-18** [verified, Linear]. The readout feeds in `docs/readout/feeds/` are dated
   10-18 to 10-26 and still list as backlog work the docs say is built (table chat, AI seats, the 3D table). They are stale.
2. **Nothing in I-1 owns the platform and operations work** (hosting, auth for public sign-in, backups, alerts, the CI gate,
   privacy and licensing). `LAUNCH-CHECKLIST.md` line 10 mentions "operations" once. Section 3 proposes four cross-cutting
   tracks (T1 to T4) to add beside the eleven outcomes. I have not created anything in Linear; that is your call.

Each workstream below can be handed to a session as "take W<n>". Sizes are S (hours), M (a day or two), L (a week or more); they
are guesses, not estimates from the repo.

## 1. Where things stand

| Thing | State | Source |
| --- | --- | --- |
| Production | `release/pages`: profile `cloud-production`, main `c567c581`, 2026-10-26; Play is on | [verified] `git show origin/release/pages:version.json` |
| Staging | `release/cloud-staging` `a8abf916`, main `b9999b16`, read back by `staging-check` | [verified] |
| Main | `50297778` (PRs 910 and 925, ROB-204/213/214 merged since production) | [verified] |
| Staging D1 | migrations 0001 to 0006, **0009 and 0010 applied today** and recorded in `d1_migrations` | [verified] |
| Production D1 | 0001 and 0002 only, per the 10-25 release record; **not re-read** | [doc] `docs/ACTIVE.md` 10-25 release |
| CI gate | the Actions `suites` job is canceled at its 60-minute limit; merges have been on a full local run | [verified] run 3423; `tests.yml` `timeout-minutes: 60` |
| Red suites on main | `board-target-lands`, `board-ending-rematch`, `board-mana-symbols`, `board-control`, `browser-geometry`, `precons`, `page-budget`, `coach`, `crankmagic-coach`, `engine-breaks-anchors`, `table-record` | [verified] two local full runs |
| Lag | Never measured on a real game; one comment of yours (10-10); server per-action cost is small | section 5 |

## 2. Decisions only you can make (everything else below waits on these less)

1. **Public or invite-only at launch?** Not documented anywhere; every doc says invite-only. This single answer decides the auth
   plan (section 4), abuse and cost controls, support load, and the legal gates (T3). Needed first.
2. **Approve or edit the ten-line launch checklist** (still "draft for Rob's approval", ROB-137). It is the definition of done.
3. **Name the game** (ROB-139, blocked on you).
4. **Hosting direction** (section 4): my recommendation is *not* to move the game runtime.
5. **House rules default** in the lobby (on today; the 10-22 request said standard Commander with opt-in).
6. **Hard AI difficulty**: keep it offered though it benches below Normal in 2 seats and near fair share in a 4-pod?
7. **AI cost**: production key, daily and per-game caps, Veteran evaluation budget.
8. **Privacy and Terms wording** for the feedback sheet, table chat, results/leaderboard and game logs (the approved wording on
   10-09 covers the Coach only). **What account deletion promises** (today it does not delete `feedback` or `match_results` rows).
9. **Wizards of the Coast position.** `LICENSE` keeps every commercial right "so the project can be licensed or sold"; the docs call
   the app "personal, non-commercial". Whether Wizards' Fan Content Policy fits a hosted public service, or any sale, is not
   documented. Confirm before launch (I am not giving a legal opinion).
10. **Asset provenance and notices** for the audio pack, background videos, persona avatars, table skins and playmats
    (`THIRD-PARTY-NOTICES.md` lacks them).
11. **Rewrite the email-bearing git history** of the public repo (yes/no).
12. **Pay for CI minutes or shard the suites** to repair the 60-minute gate (section 6, W9).
13. **Backup retention** (R2 nightly D1 copies) and what "delete my data" means for backups.
14. **Lift the hold** on Oathbreaker and Standard: only after launch.

**Your manual steps** (dashboard, secret, or an apply that needs your account): production migrations; `OWNER_EMAIL` on both
Workers; the Workers Observability alerts; turning R2 on; the triage agent's Access application and secrets; production
`ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `ACCESS_INVITE_TOKEN`; the `not-invited.html` block-page redirect; the `/api/import/*`
Access bypass; `www` redirect, Always Use HTTPS, SPF/DKIM/DMARC; four Access tokens for Grok's playtest agents; deleting the Forge
directories and env vars (M9); a check on a physical phone. (This session did the staging D1 migrations with the Cloudflare
credential it was given; the production ones it has not touched.)

## 3. Workstreams

The eleven outcomes, each with what is left, then four cross-cutting tracks. "Needs" names a decision above or a manual step.

### Outcomes (existing Linear projects)

**W1 · Play any Commander-legal deck (P-ROB-2)** *[the largest gap to "complete"]*
- Card coverage: last generated figure 1,545 of 2,365 library cards fully defined (90.6% have every rule), 80%-played set 1,990 of
  3,238; no current "typical decks playable" number exists (the 10-12 figure was 0 to 1%). A table refuses a deck with an
  undefined card. **L** [doc `docs/engine/coverage.md`, `plan-coverage-90.md`]
- Candidate cards (2,643+ compiler outputs) play only at labeled playtest tables; review/promotion waves and the Claude API
  backstop (ROB-90, ROB-92) remain. **M**
- Lobby names the exact unplayable cards and why (ROB-103); your six live decks proven card by card (ROB-94); a real table game
  with the 25-card Orzhov deck (never run: scenarios only). **M**
- Rules audit: commander rules (ROB-82), exert/retrace/dash/emblems (ROB-83), blocking requirements and battles (ROB-149), three
  documented layer gaps that no library card needs yet. **L**
- Retire Forge (M9): delete `game/engine-adapter/`, the `forge` directories, `LICENSE` §4(a). **M**, needs your manual step.

**W2 · The Play experience (P-ROB-1)**
- Done on staging: Table, Focus and 3D as one HUD, drawers on top, card-shaped piles, cards over the mat's edge, Max and peek,
  chat, lounge, lobby layout, the phone's crowded-lands scroll. In production: not yet.
- Not proven anywhere: a GPU browser at 60 fps, Safari, Firefox, a physical phone (the docs say "Not proven" repeatedly). **M**
- The phone has not been audited against the "game fits the window, never scrolls" rule (AGENTS.md). **M**
- The lounge's server half (live list, seats, requests, results, leaderboard) is built but "never run on a real Durable Object, D1
  or browser" by its own record; migration 0010 is now on staging, so this can finally be proven. **S to M**
- Suites red on main that cover core play: `board-control`, `board-target-lands`, `board-ending-rematch`, `board-mana-symbols`.
  Fix or retire each with a reason. **M**
- Luke's playtest list ROB-201 to ROB-221: 204/213/214 done; 205/209/210/211 sit with the engine lane; the rest not documented.
- 3D polish backlog (ROB-21, 43, 45 to 47, 51, 57, 59, 60), card-draw flip animation, game name (ROB-139). **L**

**W3 · Library (P-ROB-3)**: paste/photo/scan add (ROB-105, blocked in the feed), one-box search (ROB-106), 10,000-lot phone speed
(ROB-108); `BACKLOG.md` items (autosave to file, copies as things, curve/role strip, profile page, Delete/Add Card, change a deck's
commander, "Build from Deck errors in prod" not reproduced). **L**

**W4 · Deck creation (P-ROB-4) and W5 · Tuning (P-ROB-5)**: simulator-vs-engine agreement (ROB-116, needs the engine's `playPod`
entry point), the Tune tab flow (ROB-113 to 117). Largely Claude · Deck intelligence. **L**

**W6 · Buying (P-ROB-6)**: priority dial, one order across decks, arrivals to boxes, **prices on a schedule with their age**
(ROB-121; `crankmagic-refresh.md` says prices are deliberately not baked, so the two docs disagree: your call). **M**

**W7 · Tailored to me (P-ROB-7)**: deck and play preferences, the information dial (ROB-122 to 125). **M**

**W8 · AI in action (P-ROB-8)**: strategy/SWOT (ROB-128), coaching (ROB-129), upgrade evidence (ROB-130), card resolution
(ROB-131), labeled and capped answers (ROB-132); AI players: Normal tuning (PR 3), default-deck matrix, game-log admin view (PR 7),
politics system, Veteran evaluation; the production AI door (ROB-95) needs your key and caps. **L**

**W9 · Share deck builds (P-ROB-9)**: sharing is in progress; live recipient acceptance "remains unproven"; mail delivery
observability (ROB-69); production needs migrations 0003 to 0006 and the mail secrets; `SHARING_ENABLED` is off in
`cloud-production`. **L**

**W10 · Joyful end to end (P-ROB-10)**: first-time journey under ten minutes (ROB-135), test cases per journey (ROB-27),
performance budgets (ROB-136, ROB-67), instrumentation (ROB-64, 65). **L**

**W11 · Beyond Commander (P-ROB-11)**: held. No work.

### Cross-cutting tracks (proposed; not in Linear)

**T1 · Platform and runtime** (section 4 and 5): measure the lag, fix what the measurement names, decide the public-sign-in auth
path, back up the data, alert on errors. Items: the instrumentation (S), client repaint and optimistic UI (M), Durable Object
placement and WebSocket health (S), checkpoint cost (S to M), the two Observability alerts per Worker (manual, S), nightly D1 copy
to R2 (needs R2 on, M), Workers Paid plan check (S), scale test of the lounge registry (a single object every table reports to
about every 15 s; never load-tested) (M), a cost view (ROB-58, S).

**T2 · The quality gate**: repair the 60-minute Actions limit (shard browser suites across jobs or use a larger runner; **M**,
needs decision 12); clear the eleven red suites (**M**); refresh `engine-breaks-anchors` (45 stale anchors); rerun the
hidden-information proof (1,400 games, 0 leaks, last run 10-09 before Hard, Veteran and the lounge) (**S**); a repeatable phone
and GPU-browser visual pass (**M**).

**T3 · Trust: security, privacy, legal** (all of it gates a public launch): privacy page update (it still says Send Feedback
opens your mail app and that AI features are open to everyone; it omits the feedback sheet, the triage agent, results and
leaderboard, chat, game logs) (**S**, decision 8); Terms for chat conduct and takedowns (**S**); the Wizards/commercial question
(decision 9); asset provenance and notices (**M**, decision 10); account deletion that covers every table that holds email (**S**);
the unrepaired feedback-triage review findings, which must be fixed before the triage agent is switched on (agent token falls back
to app verification beside `SERVICE_SEATS`; `INVITE_ADMIN_ID` as a second owner; prompt built from reporters' words under
`bypassPermissions`; duplicate Linear issue on retry; `../../` path acceptance) (**M**); accessibility on the landing and deck pages
(r4 audit); an outside security review (**M**, decision); repo history rewrite (decision 11).

**T4 · Launch operations**: apply migrations 0003 to 0006, 0009, 0010 to the production D1; release current main to production
(it is about 15 PRs ahead of `c567c581`); production secrets and flags; `OWNER_EMAIL`; alerts and backups (T1); support path (the
inbox forwards to you; the feedback loop's PRs 4 to 6 are not built); the launch checklist approval; refresh the readout so the
dashboard is true; the domain items (`www`, HTTPS, SPF/DKIM/DMARC); a rollback rehearsal in production (never done).

## 4. Hosting, storage and runtime: the recommendation

**Short answer: do not move the game to Supabase to fix lag, and do not move the game runtime at all for now.** Measure first
(section 5, about a day). Separately, *do* decide the public-sign-in path soon, because that is where a Supabase-like service has a
real argument.

### What the system is today [verified from the release branches' generated config and the code]

Each release is a Cloudflare **Worker with static assets** (not Pages): `crankmagic` (production) and `crankmagic-staging`. Only
`/api/*` runs the Worker. A **Durable Object per table** (`GameTable`) holds the authoritative game: the engine runs inside it,
its state is persisted to the object's own SQLite storage, and WebSockets (hibernation API) fan each seat its own full view.
**D1** holds accounts, libraries (a gzipped blob per library, up to 1.9 MB), sharing, AI spend, feedback and results. **Cloudflare
Access** gates sign-in (Google, invite list). Email is Resend. AI seats run as rules code inside the object; only the optional
"AI on Claude" seat calls Anthropic. No R2, no KV, no placement setting, no location hint on the object. Card images are hotlinked
from Scryfall; Babylon.js is 8.6 MB.

### What is known about lag

- **Server side, small.** [measured in a Node sandbox, not Cloudflare] a person's action, including the AI turns that follow it,
  took p50 80 to 90 ms and p99 280 to 350 ms; persisting costs 20 to 30 ms of that; projecting a seat's view 2 ms; a view is about
  21 KB at the median (gzips to roughly 3 KB). Earlier harness runs (1,400 games) put a person's longest wait at a median of
  about 170 ms and a worst of 3.5 s on the biggest boards. Your own staging play (10-10, 10 turns against AI): longest wait about
  3 s. [doc]
- **Not measured at all:** live WebSocket latency, Durable Object placement and cold start, client paint time, frame rate on a real
  GPU, AI-model latency (`ai_calls` has no latency column). The repo's own gates list these as open.
- **Likely culprits, by how much a player would feel them [inference from the code]:**
  1. The client rebuilds the whole board with `innerHTML` and then does synchronous layout reads, at least three times per action
     (send, receipt, view), and the 3D view adds a 150% render scale with 2048 to 4096 px skins. Nothing is updated optimistically,
     so every click waits a full round trip.
  2. A person's request is held for the engine's work *and* the AI turns that follow (up to 100 steps), then the AI plays on in
     alarm slices during which the person's actions are refused ("The AI players are still taking their turns").
  3. The Durable Object has no location hint, so it sits near whoever created the table; players elsewhere pay that distance on
     every click.
  4. A 250 to 350 KB full-state checkpoint is rewritten on every action; reopening an evicted room costs about 25 ms and 150
     storage reads and grows with the game.
  5. There is no client heartbeat, so a dropped socket is noticed only on the next send or close.
- A Supabase move would not touch items 1, 2 or 5, and would make 3 and 4 worse unless a game process stayed in place.

### Why Supabase is the wrong tool for the game runtime [partly doc, partly general knowledge; verify the Supabase facts]

- The authoritative room is a single-writer, long-lived, stateful process with alarms, hidden-information projection per seat and
  an engine in memory. **Durable Objects are exactly that.** Supabase offers Postgres, Auth, Realtime (pub/sub), short-lived
  stateless Edge Functions and Storage. It has no equivalent, so keeping the engine means running a separate always-on Node
  process (Fly, Railway, a VM) with its own single-writer lock, and Supabase becomes only the database, auth and files.
- Putting game state in Postgres rows with Realtime fan-out would add a database write and a hop to every action and would
  move the secrecy of hidden information from `projection.mjs` to row-level security, which is the wrong place for it.
- The repo already decided this twice: `docs/engine/PIVOT-OR-PERSIST.md` §9 chose Cloudflare precisely for "a Commander table is
  a durable object" (rejecting Fly as the lift-and-shift, and Render/Railway for spinning down mid-game); the feedback loop chose
  "D1, not Supabase". `docs/crankmagic-persistent-plan.md` (09-13) had recommended Vercel + Supabase and is marked superseded. The
  launch checklist says ROB-68 (Supabase) is an evaluation only, not part of the initial launch.
- The engine and client are portable (no Cloudflare imports; a four-method storage contract), so nothing here locks you in. The
  Cloudflare-specific parts are Access identity, the Durable Object glue (~510 lines), the Worker routing and rate limits, 47 D1
  `prepare()` calls and the SQLite migrations, and the release tooling (`release-pages.mjs`, staging/production scripts,
  `staging-check`, `ops-week`).

### Where a Supabase-class service does have a real argument

1. **Public sign-in.** Today's auth is Cloudflare Access with an invite-list policy; sharing even edits Access policies through
   the Cloudflare API. That is a good gate for a closed beta and a poor fit for open sign-up (invite management, a free Zero Trust
   plan that I believe is capped at 50 users: **verify current pricing and limits**, and the sign-in screen is Cloudflare's, not
   yours). If decision 1 is "public", you need an identity provider your app owns. Supabase Auth, Clerk or Auth0 would each do it;
   the work is replacing `cloud/access.mjs` and the invite flow and re-verifying a session token in the Worker and at the
   WebSocket upgrade. This is the only move I would plan now, and it is independent of where the game runs.
2. **Relational library data.** A library is one gzipped blob per user (1.9 MB cap), which is simple and safe but rules out
   queries across libraries, collaborative editing and richer sharing. If W3/W9 grow that way, Postgres is a better home than D1.
   Not needed for launch.

### Options, side by side

| Option | What moves | Lag effect | Cost/risk | Verdict |
| --- | --- | --- | --- | --- |
| A. Stay: Workers + Durable Objects + D1; fix lag in the client and network; keep Access for the beta | nothing | addresses the likely causes directly | none beyond the work | **Do now** |
| B. A, plus move **auth** (and later the library) to Supabase Auth/Postgres once decision 1 is "public" | Access verification, invite flow; later library storage | none for the game; fewer clicks at sign-in | a real migration of auth and sessions; two vendors; WebSocket auth to re-prove | **Plan after decision 1** |
| C. Game runtime on a Node host (Fly etc.) with Supabase for data | engine hosting, persistence adapter, auth, release tooling | uncertain: you lose DO colocation of state and sockets and add a database hop | largest rewrite; single-writer locking; new ops burden | Not recommended |
| D. Everything onto Supabase Edge Functions + Realtime | all of it | likely worse | rewrites the authority model and secrecy model | Reject |

### Sequence

1. **Instrument (about a day).** Three timestamps per action: client send, Durable Object start and finish (use
   `performance.now()`; a Worker's `Date.now()` stands still during pure compute), and client view painted; plus the object's
   colo, a ping/pong frame for idle round trip, cold-versus-warm in the constructor, and a Chrome performance trace of one action
   in 3D, Table and Focus at 100/150/200% render scale and on a phone. Add a latency column to `ai_calls`.
2. **Fix what it names**, most likely in this order: patch the DOM instead of rebuilding the board and drop two of the three
   repaints; optimistic acknowledgement of the person's own action; a location hint or smart placement for table objects;
   WebSocket heartbeats and auto-response pings; checkpoint every N actions with the journal carrying the rest; do the AI's turns
   in smaller slices or send intermediate views so the table feels alive.
3. **Decide the sign-in path** (decision 1) and write the ROB-68 evaluation against it, with the criteria: cost at 1k/10k users,
   invite versus open sign-up, WebSocket authentication, session lifetime, data-export and deletion, vendor lock-in, and migration
   effort.
4. Revisit hosting only if the measurements in step 1 show the Durable Object path itself (placement, cold start, storage) is the
   cause and step 2's placement fixes do not cure it.

## 5. Suggested order of work

**Phase 0, this week (unblocks everything, mostly small):** decisions 1, 2 and 5 to 8; instrumentation (T1); the production D1
read and migration plan (you apply); `OWNER_EMAIL`; alerts; repair the CI gate (T2) so merges stop relying on a local run.

**Phase 1, launch blockers:** the lag fixes (T1); engine coverage and the real-table proof (W1); the privacy, Terms, notices and
Wizards questions (T3); the triage review findings (T3); production release of main with its migrations and secrets (T4); the
public-sign-in path (T1/T3) if decision 1 is "public".

**Phase 2, hardening and the experience:** phone and GPU-browser proof, the red suites, hidden-information rerun, backups,
journeys and budgets (W10); the lounge proven on staging; sharing proven live; AI players' remaining work; library/deck/tuning/
buying outcomes (W3 to W7).

**Phase 3, after launch:** 3D polish backlog, the Supabase library evaluation if sharing needs it, Oathbreaker and Standard.

## 6. Contradictions found between docs (fix when touched)

- Repo visibility: `release-pages.md` and `plan-to-100.md` say private; AGENTS.md, the review response, README and LICENSE say public since 10-06; the `tests.yml` header still describes the private free-plan allowance.
- `privacy.html` against what is live (section 3, T3). `release-production.md` describes the closed-Play profile; production runs `cloud-production` with Play on.
- Prices: `crankmagic-refresh.md` against LAUNCH-CHECKLIST line 6. README: persistent-app plan "not started" and the Satoshi typeface against THIRD-PARTY-NOTICES.
- The list of red suites differs between sections of `docs/ACTIVE.md`; AGENTS.md says a full run takes about 14 minutes and that Actions is the gate; neither is true now.
- The Linear feeds and the readout are stale (10-18 to 10-26). The one production fact in the inventory pass that was out of date: it quoted production at `9ca99e5` (10-25); the release branch says `c567c581` (10-26).

## 7. What I could not verify

The live state of production (version, migrations, secrets, the AI key), the Cloudflare plan and its limits, Durable Object
placement, any real-network latency, anything on a GPU browser, Safari, Firefox or a physical phone, the Supabase and Cloudflare
Zero Trust facts quoted from general knowledge, and whether the half-year-old Linear estimates (about 1,078 hours of non-done feed
items, partly already built) mean anything today.
