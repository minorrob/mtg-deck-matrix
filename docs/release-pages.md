# The production release

**What it is.** The web app and nothing else — no game host, no Forge, no engine, no tools, tests or
documents — built from one commit of `main` by `tools/release-pages.mjs`, committed to the `release/pages`
branch, and served by **Cloudflare at https://crankmagic.com/**: the Worker `crankmagic`, every page served as a
file and its script run for `/api/*` only (the account cloud, `docs/plan-account-cloud.md`), answering on crankmagic.com alone. It is deployed with `wrangler deploy` from the very folder the
acceptance walk passed on — wrangler lives in `C:\Users\robmi\CrankMagic\workbench\cloudflare` (outside the
repo, which has no dependencies) and was signed in to Rob's Cloudflare account by Rob on 2026-09-24.
Play's tab says *Coming Soon*. Rob, 2026-09-24: *"the CrankMagic build minus the
Play option (on that tab it should say 'Coming Soon'). I want to use everything else that exists in
CrankMagic today as a production release."*

**Why a build, not a branch someone edits.** Rob chose (2026-09-24) that Account Cloud and Play merge
into `main` as they are built, behind a build switch. So `main` holds everything, and the builder's
**profile** decides what reaches users. Today there is one profile, `pages`; Stages 2 and 3 add theirs.

## The rules

1. **`release/pages` is written only by the builder** (`--commit`), from a commit of `main`, never by hand,
   never from a feature branch, never from the working tree (`--worktree` refuses `--commit`).
2. **A deploy is `wrangler deploy` of the folder the walk passed on**, and `release/pages` is its record: the
   same build is committed and pushed there, so what is live is always a commit anyone can read. It happens
   only after the four journeys pass on that folder (step 3), and only by someone who says so in the handoff.
3. **The build refuses rather than guesses.** A page that is not what it expects (no `<meta charset>`), a
   file the service worker lists but the release lacks, a Play module that got in, a leaked tool — it stops
   and names the file.

## Releasing, step by step

```bash
# 1. main is green: the gate, and CI on the merge
PAGE_BUDGET_REQUIRED=1 GEOMETRY_REQUIRED=1 bash runtests.sh -q

# 2. build the release from origin/main into an empty folder
git fetch origin
node tools/release-pages.mjs --out <empty folder>

# 3. serve it at a *.localhost name (the web copy, and a secure context) and walk the four journeys
node <any static server> <folder> 8790
UAT_BASE=http://crankmagic.localhost:8790 UAT_LIVE_NETWORK=1 UAT_SHOTS=<folder> node tests/uat/release-acceptance.mjs

# 4. commit the same build to release/pages (the record), push it, and deploy the tested folder
node tools/release-pages.mjs --commit
git push origin release/pages
cd <folder> && C:/Users/robmi/CrankMagic/workbench/cloudflare/wrangler.cmd deploy

# 5. walk the live site
UAT_BASE=https://crankmagic.com UAT_LIVE_NETWORK=1 node tests/uat/release-acceptance.mjs
```

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
