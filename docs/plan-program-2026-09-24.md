# The program — one cloud CrankMagic

**Rob, 2026-09-24: "Ok, I'm done with Forge."** The product becomes one CrankMagic app on cloud
infrastructure Rob owns: the workshop that exists today, accounts that keep a library in the cloud, and Play
on CrankMagic's own engine, with AI features behind an allowlist only Rob controls. It is built in three
stages. This document is the plan and the record of Rob's decisions; `docs/release-pages.md` is Stage 1's
procedure.

Supersedes, as a direction: the local-host half of `docs/handoff-2026-09-24-direction.md` and Phases 1–2 of
`docs/plan-one-source-2026-09-24.md` (the local host playing `main`). Both stay as the record of what was
measured; the Forge path is frozen, not deleted.

## Rob's decisions (2026-09-24, AskUserQuestion; all the recommended options)

| Question | Rob's call |
|---|---|
| What does the Pages release hold? | **Only the web app** — no game host, Forge, engine, tools, tests or documents |
| Who switches the Pages source? | **The session, after the tests, confirming with Rob right before** |
| How far does "bring main up to date" go? | **Merge #358 and #359, audit every branch**, bring over what should come, list what may be deleted |
| Do Stages 2–3 wait off `main` until the end? | **No — merge as we go**, behind a build switch; the release build decides what users get (replaces "hold the merge to main until the very end") |
| A domain now? | **Yes — buy one now** and launch on it, so the address (and every browser's library, which is stored per address) never moves again |
| Engine card work before or after Accounts? | **Now, in parallel** — it is Play's long pole |
| Where to buy and run it? | **One provider, lowest cost, not commercial yet** → Cloudflare, below |

## Where each stage stood when this was written (measured 2026-09-24)

| | What exists | Left |
|---|---|---|
| **1 · Pages minus Play** | The whole workshop | The release build (PR #360), the Pages switch, the domain |
| **2 · Account Cloud** | One storage layer the whole library goes through, with revisions, an audit log and undo (`collection-repository.js`) — sync can sit behind it | Everything server-side |
| **3 · Play: the table** | Board, lobby, invites, seats, audio, notices (`game/ui`) | Wired to Forge through the local host; must become a view of the app talking to a cloud room |
| **3 · Play: the engine** | 27 rules subsystems, a runtime shaped as a drop-in for the Forge launcher (`engine-runtime`), a random pilot for fuzzing | **No card has a definition** — all 31,830 are `unsupported` in `data/engine/support.json`; 69.2% of the cards in Rob's seven decks use only rules the engine has (`docs/engine/coverage.md`); no pilot that plays well |
| **3 · AI calls** | Two prototypes: an AI-seat chooser (OpenAI, through the local host) and the guide writer (Claude, a batch tool) | No gate, no server |
| **3 · AI card reconciliation** | Designed: `docs/plan-card-extraction-skill.md`, the `CrankCardScript@1` schema | Not built |

## The infrastructure: Cloudflare, one account

Chosen for Play's hard requirement — an authoritative game room per match, holding live connections and
keeping each hand hidden — which Durable Objects meet with the engine as it is: JavaScript, a storage
adapter, a match that is a value (`docs/engine/PLAN.md` §3.7–3.8). Accounts and storage are commodity on
any provider. Prices checked 2026-09-24.

| Need | Cloudflare | Cost while not commercial |
|---|---|---|
| Domain + DNS | Registrar (at cost) | crankmagic.com **$10.46/yr** |
| The web app | Workers static assets, deployed from `release/pages` | $0 (static requests are free; 25 MiB per file) |
| Sign-in | Access (Zero Trust), email one-time code or Google | $0 up to 50 users |
| Accounts, library sync | Workers + D1 | $0 (100k requests/day; 5 GB) |
| Backups, files | R2 | $0 to 10 GB |
| Game rooms | Durable Objects (SQLite), one per match | $0 to start; **$5/month** (Workers Paid) once rules processing needs more than the free plan's 10 ms CPU per request |
| AI gate | a Worker holding the key as an encrypted secret; allowlist in D1; optionally AI Gateway for rate limits and spend | $0 at Cloudflare; API usage billed by Anthropic, capped in its console |

**What Rob does himself** (an agent never creates accounts, enters payment details, passwords or keys):
create the Cloudflare account with two-factor; register crankmagic.com; later, authorize Cloudflare's GitHub
app on this repository (so a push to `release/pages` deploys), add the Anthropic key as a Worker secret, and
keep the AI allowlist. **What the session does**: the code, the configuration files, the deploy
configuration, and the exact clicks for each of Rob's steps.

## Stage 1 — the production release (in progress)

1. PR #360: the build switch, Coming Soon, the version mark, American English on screen, the acceptance walk.
2. Build from `main`, walk it, commit and push `release/pages` (`docs/release-pages.md`).
3. **Rob confirms**, then GitHub Pages publishes `release/pages` — the release is live at the github.io address.
4. When crankmagic.com is registered: host `release/pages` on Cloudflare at crankmagic.com
   (`--origin https://crankmagic.com/`), and turn the github.io address into a *CrankMagic has moved* page
   that still opens the library saved there, so anyone who used it can save a backup and restore it on the
   new address. The user base is small today, which is why the move is now rather than later.

## Stage 2 — Account Cloud (next)

- **Local-first stays.** No sign-in required; the workshop works exactly as today. An account adds sync.
- **Sync unit: the repository's own commits.** Every change already goes through `repo.commit` with a
  revision; the server keeps an append-only log per user in D1, the browser pushes and pulls by revision, and
  a conflict is resolved the way two tabs already are (expected revisions). Backups become server copies in
  R2 as well as files.
- **Sign-in: Cloudflare Access** in front of `/api/*`; the Worker verifies the Access token and keys the
  user by email. Swappable later (a sign-in library on D1) without touching sync, if the product becomes
  commercial or outgrows 50 users.
- **A new build profile** (`cloud`): the same app plus the account pieces, published to Cloudflare; `pages`
  stays as it is. Work merges into `main` as it is built.
- Gate to leave Stage 2: two browsers signed in as one user converge on the same library after offline
  edits on both; a signed-out browser behaves exactly as the Stage 1 release.

## Stage 3 — Play with CrankMagic (engine track starts now)

**Engine track, in parallel from now** (pure JavaScript, so a cloud session can prove it — AGENTS.md):
1. 4.3 — the runtime chosen by the flag, as `ENGINE_STATUS.next` says.
2. The card compiler (engine phase 3): `CrankCardScript@1` definitions, checked by the schema and the engine's
   own suites.
3. **AI card reconciliation**: a batch tool drafts a card's script from its oracle text, the compiler and the
   rules suites check it, disagreement is adjudicated against the Comprehensive Rules — never copied from
   Forge (`ADR-001`). It runs on Rob's key like the guide writer, so it needs no cloud to start.
4. The house pilot (PLAN §3.6) — the engine's own AI opponent, which costs nothing per game.
5. First gate: **Rob's seven decks fully playable** — every card defined, 1,000 seeded four-player games
   finishing with the same hash on replay and no hidden card in any seat's view.

**Then Play in the cloud:** a Durable Object per match runs the engine; the board (`game/ui`) becomes a view of
the app talking to it; the lobby and invites move to accounts; LLM-assisted AI seats and advice go through the
gated Worker, allowlisted users only. **Play v1 is narrow and gated**: allowlisted players first; a deck with a
card the engine cannot play is refused with the cards named (Rob's rule); widen as coverage grows.

## Risks

- **The engine is the long pole.** Rules coverage is not card coverage; no card is defined yet.
- **One data file is near the host's cap**: `data/graph-played.json` 20.6 MB of 25 MiB.
- **The Access sign-in caps at 50 users** on the free plan — fine for a non-commercial release, a swap point
  otherwise.
- **The move to crankmagic.com strands libraries** saved at the github.io address unless their owners back
  up first — hence the moved page, and doing it while there are few users.
