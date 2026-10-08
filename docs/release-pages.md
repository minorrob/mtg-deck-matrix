# The production release

**What it is.** The web app and nothing else — no game host, no Forge, no engine, no tools, tests or
documents — built from one commit of `main` by `tools/release-pages.mjs`, committed to the `release/pages`
branch, and served by **Cloudflare at https://crankmagic.com/**: the Worker `crankmagic`, every page served as a
file and its script run for `/api/*` only (the account cloud, `docs/plan-account-cloud.md`), answering on crankmagic.com alone. It is deployed with `wrangler deploy` from the very folder the
acceptance walk passed on. Wrangler is not a dependency of this repository, which has none: it is installed
on the machine that deploys, as "Tooling on a fresh machine" below says, and it is signed in to Rob's
Cloudflare account by Rob (first on 2026-09-24).
Play's tab says *Coming Soon*. Rob, 2026-09-24: *"the CrankMagic build minus the
Play option (on that tab it should say 'Coming Soon'). I want to use everything else that exists in
CrankMagic today as a production release."*

**Why a build, not a branch someone edits.** Rob chose (2026-09-24) that Account Cloud and Play merge
into `main` as they are built, behind a build switch. So `main` holds everything, and the builder's
**profile** decides what reaches users. `pages` is still the closed-Play default;
`cloud-staging` carries staging Play. The explicit production candidates
`cloud-production` and `cloud-production-standby` are described in
`docs/production-play-profile-2026-10-07.md`. Building them is not release approval.

## The rules

1. **`release/pages` is written only by the builder** (`--commit`), from a commit of `main`, never by hand,
   never from a feature branch, never from the working tree (`--worktree` refuses `--commit`).
2. **A deploy is `wrangler deploy` of the folder the walk passed on**, and `release/pages` is its record: the
   same build is committed and pushed there, so what is live is always a commit anyone can read. It happens
   only after the four journeys pass on that folder (step 3), and only by someone who says so in the handoff.
3. **The build refuses rather than guesses.** A page that is not what it expects (no `<meta charset>`), a
   file the service worker lists but the release lacks, a Play module that got in, a leaked tool — it stops
   and names the file.
4. **Once a release carries the table class, every later one does.** `cloud-production-standby` and
   `cloud-production` register the `GameTable` Durable Object on production's Worker (migration `tables-v1`).
   Cloudflare then refuses any deploy whose script lacks the class; the only way to drop it is a delete migration,
   which erases every table it stored, and it cannot roll back across the migration that made it. So after the first
   standby or Play release, `pages` is never committed to `release/pages` again: `--commit` refuses it, naming the
   release that is there and what to build instead (`refuseDropTables`; tests/release-pages.mjs proves it on a
   repository of its own). The guard reads `release/pages`' head; a deploy made from anywhere else is outside it.

## Releasing, step by step

```bash
# 1. main is green: the gate, and CI on the merge
PAGE_BUDGET_REQUIRED=1 GEOMETRY_REQUIRED=1 bash runtests.sh -q

# 2. build the release from origin/main into an empty folder
git fetch origin
node tools/release-pages.mjs --out <empty folder>

# 3. serve it at a *.localhost name (the web copy, and a secure context) and walk the four journeys,
#    then the first-look list (#372), which the redesign must not undo
node tools/serve-folder.mjs <folder> 8790
UAT_BASE=http://crankmagic.localhost:8790 UAT_STATIC=1 UAT_LIVE_NETWORK=1 UAT_SHOTS=<shots> node tests/uat/release-acceptance.mjs
UAT_BASE=http://crankmagic.localhost:8790 UAT_LIVE_NETWORK=1 node tests/uat/first-look.mjs

# 4. commit the same build to release/pages (the record), push it, and deploy the tested folder.
#    Staging first: the same steps with --profile cloud-staging, from its own folder.
#    A production deploy is Rob's go, asked for in the conversation, every time.
node tools/release-pages.mjs --ref origin/main --commit
git push origin release/pages
cd <folder> && npx --yes wrangler@4.139.0 deploy

# 5. walk the live site
UAT_BASE=https://crankmagic.com UAT_LIVE_NETWORK=1 node tests/uat/release-acceptance.mjs
```

**Play in the cloud is on staging only (since 2026-09-29).** The `cloud-staging` profile is marked
`crankmagic-play` = `cloud`: the Play tab is the table's page, and the release carries the lobby and the board but
none of the local game host's modules. Its Worker is `cloud/play-worker.mjs`, which exports the table's Durable
Object (`GameTable`, bound as `TABLES`) beside the API. The rules engine that object carries (the `game/` modules it
imports, about 350 KB) ships in the tree for wrangler to bundle, and `.assetsignore` keeps it off the site.
`wrangler deploy` applies the Durable Object migration (`tables-v1`, a SQLite class) itself, so D1's migrations are
still the only ones to apply by hand. `PLAYTEST_TABLES` = `on` makes every staging table a playtest table: a
finished game's full record (seed, pod, decision tape, journal) may be downloaded (M8b). Before pushing a staging
release that carries Play, walk it under `wrangler dev` too:

```bash
WRANGLER=<wrangler.js> UAT_SHOTS=<shots> node tests/uat/play-e2e.mjs
```

It covers the Play tab, a playtest table with an AI seat, the alarm launching the game, the board over the WebSocket
(through a proxy that adds the Access token, as the edge does), End game and the full record replayed. Then two people
and an AI from a library backup: each restores it in Settings, the host invites, a second Access identity joins by
the link and chooses from the decks the table can play, both play the first turns, a reload mid-game returns to the
board, and the record of the game replays to the same end. Production
stays Coming Soon, and binds no table, until Rob's go. Until M4 defines the decks' cards, the engine plays basic
lands only: a real deck is refused by name, card by card.

**The browser matrix (Part 6 of the plan: Chrome, Edge, Safari and Firefox on the desk).** Every walk above runs in
the browser `UAT_BROWSER` names -- `chromium` (the default), `msedge`, `firefox` or `webkit`, Safari's engine --
through `launchBrowser` in `tests/uat/browser-runner.mjs`. With the release served as in step 3,
`tests/uat/browser-matrix.mjs --write` runs the walks in each and writes the table to `docs/uat/browser-matrix.md`;
a browser that will not start on the machine is recorded with the reason. The phones (Safari on an iPhone, Chrome on
an Android phone, in landscape, for Play) are a person's to run, and their rows say so.

```bash
UAT_BASE=http://crankmagic.localhost:8790 WRANGLER=<wrangler.js> node tests/uat/browser-matrix.mjs --write
```

**Once, before the first release that carries R3.10a (Rob, in the Cloudflare dashboard).** Import by link
(`GET /api/import/archidekt`, `cloud/import.mjs`) needs no account, but Access guards all of `/api/*` with the
Invited policy, so until Access lets that one path through, only a signed-in person can import a deck by its
link; everyone else is told to export the list and paste it, which always works. To open it to a first visit,
add a self-hosted Access application for `crankmagic.com/api/import/*` (and `staging.crankmagic.com/api/import/*`)
with one **Bypass** policy for **Everyone**. The Worker still refuses any request that did not come from the
app, holds each network to the rate limit, and stores nothing.

`tests/uat/release-acceptance.mjs` is Rob's confirmation, as he worded it: *"testing the full deck creation,
testing, exploring and acquiring capabilities."* On a fresh library it drafts a deck in Build, measures it
with the real simulator (the one step no other suite runs), saves and finalizes it, follows a card in
Explore, and buys a card from the To buy list — and across the walk requires no page error, no 404, no
request to a game host or a tunnel, and no security-policy refusal. `UAT_LIVE_NETWORK=1` matters: the
default answers Scryfall from the shipped catalog, and Measure rightly refuses a deck whose cards it cannot
read.

## What the `pages` profile does

| | |
|---|---|
| Walks | from `index.html`, `crankmagic.html`, `graph.html`, `crankmagic-sw.js`, `.nojekyll`: every src/href, `url()`, string naming a file, and `dir/${…}.ext` template. Only what it reaches ships (106 files, 47.8 MB on 2026-09-24) |
| Leaves out | `crankmagic-game.js`, `crankmagic-lobby.js`, `crankmagic-online.js`, `crankmagic-online.css`, `collection-lobby-draft.js` — tags removed from both pages, entries from the worker's shell |
| Marks | `<meta name="crankmagic-play" content="coming-soon">` (the app answers with the Coming Soon tab) and `<meta name="crankmagic-version">` (the Menu shows it); `version.json` at the root |
| Tightens | the security policy's `connect-src` loses `http://127.0.0.1:8768` and `https://*.trycloudflare.com` |
| Allows | `script-src 'self' https://static.cloudflareinsights.com` — Cloudflare Web Analytics, which Rob wants (2026-09-24); its automatic setup injects the beacon, which reports to the site's own origin (`connect-src 'self'`). No other script source is allowed, and `verify()` refuses one |
| No plain HTTP | `_headers` (parsed by Cloudflare, never served): `Strict-Transport-Security: max-age=31536000` and `X-Content-Type-Options: nosniff` on every path. A first visit's http→https redirect is the zone's **Always Use HTTPS** setting, which the wrangler sign-in cannot change — Rob's |
| Never ships | `game/ tools/ tests/ docs/ design/ prototype/ graph/ payload*/ schema/ .github/ .claude/ data/engine/ data/source/ data/archive/ data/game-logs/` |
| Moves the address | the profile's `origin`, `https://crankmagic.com/`, replaces the github.io address in the canonical and social links (`--origin` overrides it); the app reads its own address from the canonical link |
| Hosts | `wrangler.jsonc` — the Worker `crankmagic`, static assets from `./`, the API script (`cloud/worker.mjs`) for `/api/*` only with its D1 database and Access settings, **crankmagic.com as its only address** (a custom domain; `workers_dev` and `preview_urls` off, because every extra address is another origin with its own browser library) — and `.assetsignore`, which keeps `.git`, wrangler's `.wrangler` scratch folder (it writes one into the folder it deploys from) and the configuration off the site. Every file must fit Cloudflare's 25 MiB |

## Known limits

- **One file is close to the host's cap.** `data/graph-played.json` is 20.6 MB; Cloudflare serves static
  files up to 25 MiB. Past that it must be split.
- **`tests/uat/crankmagic-journeys.mjs` predates the deck-page redesign (V.4b).** On `main` and on the
  release alike it now runs through deck creation, assembly, backup and restore, Build's draft, Log a game
  and a filed report, then stops at the old Overview's checks (`#cm-sec-glance`). It is not in the gate.

## Tooling on a fresh machine

Nothing outside this repository is needed to build, walk, release or deploy. What a machine needs:

| | |
| --- | --- |
| **Node 22 or later**, with npm | The gate, the builder, the walks. On Personal-HP, Node comes from the Codex runtime and is not on PATH: `export PATH="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"`. |
| **Python 3.12** | For the few Python suites in the gate. On Personal-HP it is `$HOME/AppData/Local/Programs/Python/Python312`. |
| **Playwright and Chrome** | For the browser suites and the walks. Install with `npm install --prefix <folder> playwright`; set `UAT_PLAYWRIGHT=<folder>/node_modules/playwright/index.js` and `UAT_CHROME=<chrome.exe>`. CI installs its own. |
| **Wrangler 4.139.0** | Either `npx --yes wrangler@4.139.0 <command>` each time, or `npm install --prefix <folder> wrangler@4.139.0` with `WRANGLER=<folder>/node_modules/wrangler/bin/wrangler.js` (which `tests/uat/cloud-e2e.mjs` needs). **Rob signs it in** with `wrangler login`: the OAuth token lives in the machine's user profile and never in the repository. |
| **gh**, signed in as Rob | Pull requests, merges, the repository's settings. The repository is **private** since 2026-09-25. |

Everything else a release needs is in the repository: `tools/release-pages.mjs` (the builder and its
profiles, with the Worker names, the D1 ids and the Access audiences), `cloud/` (the Worker and its
migrations), `tools/serve-folder.mjs` (the local host for a walk), `tools/bump-pins.mjs` (the `?v=` pins a
changed file needs), and the walks in `tests/uat/`.
