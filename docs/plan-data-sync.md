# Card data that refreshes itself, served from Cloudflare — the plan

Rob, 2026-09-24: *"I want to set an auto-sync for the data. This includes the card catalog, the
prices, popularity, and the relationship graph. I want all of that served up from our database on
Cloudflare."* This is the design. Nothing here is built yet; the decisions at the end are Rob's.

## What is true today

| | |
| --- | --- |
| **The data** | Eight files the app serves: `data/cards.json` (4.8 MB, the card records and their prices), `data/card-facts.json`, `data/commander-universe.json` (every Commander-legal card), `data/commander-ranks.json` (EDHREC popularity), `data/commander-strategies.json`, `data/flavor-names.json`, and the relationship graph, `data/graph.json` (16.6 MB) with its co-play links `data/graph-played.json` (21.6 MB). `data/manifest.json` lists them with their hashes. |
| **How it refreshes** | By hand. `node tools/refresh.mjs` runs the seven generators in order (universe, flavor names, graph, EDHREC ranks, Scryfall records, strategies, manifest), bumps the versions a changed file needs, and proves the result with the test gate. Someone commits it, and a release ships it. The data on crankmagic.com is as old as the last time that happened (Menu says how old). |
| **Where it is served from** | Cloudflare already: the files are static assets of the `crankmagic` Worker, cached by the browser after the first load. What is missing is the *refresh*, not the cloud. |

## The design

1. **A scheduled refresh.** GitHub Actions runs `tools/refresh.mjs` on a timer: prices and the records
   daily, the graph and EDHREC ranks weekly (the graph step is the long one). A run that fails its own
   proof publishes nothing; the site keeps serving the last good data.
   *Why not a Cloudflare cron Worker:* the refresh reads Scryfall's and EDHREC's bulk data and
   re-classifies 31,830 cards — minutes of CPU and hundreds of MB of memory. A Worker gets 10 ms of
   CPU per run on the free plan and 128 MB of memory on any plan. GitHub's runner is free and has
   the room.
2. **Published to R2, Cloudflare's object storage.** Each good run uploads its files under a dated
   key (`data/2026-09-25/cards.json`) and then a small `data/current.json` naming the files of the
   newest good run. The last seven runs are kept, so a bad day can be rolled back by rewriting one
   small file.
3. **Served by the Worker from R2.** `crankmagic.com/data/*` reads from the bucket instead of the
   static assets, with a long cache on the dated files and a short one on `current.json`. The app
   asks `current.json` which files are current, where it reads the `?v=` pins today. It then fetches
   those files as it does now, and the service worker keeps them for offline use as it does now.
4. **The Menu says it.** "Card data: prices refreshed today · graph 3 days old", read from
   `current.json`.

D1, the database the accounts use, is the wrong home for these: they are whole files the browser
downloads, not rows the Worker queries, and a D1 row is capped far below 16 MB. If the app ever
needs to ask "what does this one card cost today" without downloading the catalog, D1 is where that
table would go. That is a later step, and it is not needed for this one.

## What it costs

Nothing, at CrankMagic's size, on the free tiers:

| | Free tier | This use |
| --- | --- | --- |
| R2 storage | 10 GB-month | about 50 MB a run × 7 kept ≈ 350 MB |
| R2 writes (class A) | 1 million a month | about 10 a run |
| R2 reads (class B) | 10 million a month | a few per visitor, far under |
| R2 egress | always free | — |
| GitHub Actions | free on a public repository; 2,000 minutes a month if it is private | about 10 minutes a day ≈ 300 a month |

## What Rob decides, or does himself

1. **Turn on R2** in the Cloudflare dashboard (R2 → Purchase R2 Plan, the free plan). Cloudflare may ask
   for a payment method on file before it enables R2, even on the free plan. That step is Rob's.
2. **Make one API token** for the scheduled job: *R2 Storage: Edit* on this account, nothing else.
   Rob pastes it straight into the repository's GitHub secrets (`CLOUDFLARE_R2_TOKEN`), never into
   chat. I set up everything else, and can create the bucket with the wrangler sign-in I already have.
3. **The schedule:** prices daily and the graph weekly (my recommendation), or everything daily.
4. **The repository's visibility**, which is already an open call: GitHub Actions is free either way at
   this size, but the minutes are counted only if it is private.

Then the build is: the workflow, the R2 publish step in `tools/refresh.mjs`, the Worker's `/data/*`
route, the app reading `current.json`, and a test for each, in one PR, with staging first.
