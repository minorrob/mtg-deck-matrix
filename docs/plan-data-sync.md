# Card data that refreshes itself, served from Cloudflare — the plan

Rob, 2026-09-24: *"I want to set an auto-sync for the data. This includes the card catalog, the
prices, popularity, and the relationship graph. I want all of that served up from our database on
Cloudflare."* This is the design. Nothing here is built yet; the decisions at the end are Rob's.

## 0. Live first, the reader's cache second, a refreshed store last (Rob, 2026-09-25)

> "Card prices, artwork, metadata, rules, rules adjudication source (e.g. for where a rule is unclear
> in the making of the engine), and other 3rd party data sets to this app should all be using live
> connections as much as possible, and using the user's cache. I want to understand these and how we
> make them always refreshed if they need to be stored. Don't execute now, but add to the plan."

That sets the order of preference for every outside data set, and this section governs the rest of the
file where they differ:

1. **Live.** Ask the source of truth at the moment the reader needs it.
2. **The reader's cache.** Keep what was fetched in the reader's browser, with a stated lifetime:
   - IndexedDB for records (a card, its rulings);
   - the service worker's Cache Storage for files and pictures.
   Revalidate in the background (stale-while-revalidate), and send `If-None-Match` / `If-Modified-Since` where the source honors them.
3. **Stored by us, only when live cannot do the job.** A computation across all 31,830 cards, bulk arithmetic like a buy list's total, offline play, or a source's rate limit. A store is refreshed on a schedule, carries the date it was made, shows that date in the app, and is versioned so a game can pin the one it started with.

### Each outside data set

| Data | Source of truth | Live | The reader's cache | Stored by us, and why | How the store stays fresh |
| --- | --- | --- | --- | --- | --- |
| **Card metadata** (name, cost, type, rules text, legality, keywords) | Scryfall API (`/cards/named`, `/cards/collection`), Wizards' Oracle text | Yes: a card is read from Scryfall when it is opened or added | IndexedDB, 7 days, and at once when a set releases | The name index of every Commander-legal card (search and pickers must work without 31,830 requests); the engine's oracle snapshot (a game must be deterministic) | Scryfall's bulk `oracle_cards`, daily, to R2 with `current.json`; the engine pins the snapshot by date |
| **Prices** (US dollars from TCGplayer; Scryfall's other currencies are not read, per AGENTS.md "The United States, always") | Scryfall's `prices` | Yes, per card | IndexedDB, 24 hours (Scryfall updates prices once a day) | One dated price snapshot for bulk views: a deck's cost to finish, the buy list's total, the cap checks | Scryfall's bulk `default_cards`, daily |
| **Artwork and card images** | `cards.scryfall.io` (Scryfall's CDN) | Always | The browser's HTTP cache and the worker's image cache, first-come with a size limit | Never. The only exceptions are Rob's own processed brand art and playmats, which are ours | — |
| **Rulings** (Wizards' official card rulings) | Scryfall `/cards/:id/rulings` | Yes, on demand in the card pop-up | IndexedDB, 7 days | Only the rulings a hand-authored or compiled card definition cites, versioned with that definition | Checked when a definition is recompiled |
| **The Comprehensive Rules** | Wizards (`media.wizards.com/…/MagicCompRules <date>.txt`), revised with most sets | Fetched by the engine's tooling (`game/tools/check-citations.mjs`) at build time, never by the reader's browser | — | Not committed: the file stays Wizards'. The engine's citations name rules by number and are checked against the text of a stated date | A scheduled check for a newer text date; on a new one, re-check every citation and open an issue listing the rules that moved |
| **The rules adjudication sources** (for where the engine meets an unclear case) | In order: the **Comprehensive Rules**, then Wizards' **official rulings** for the card, then the set's **release notes**, then Wizards' **Commander format page** (the banned list, Game Changers, brackets) | Read live when a case is adjudicated | — | An **adjudication log** in the repository: the case, the sources read with their dates, the ruling applied, and the test that holds it. The log is ours and it cites its sources | Each entry names its source's date; a new CR date or release notes triggers a re-check of the entries citing them |
| **Commander legality, Game Changers, brackets** | Scryfall `legalities.commander` and its Game Changer flag, from Wizards' announcements | Yes, per card | IndexedDB with the card | A dated snapshot for the engine's legality check at prepare | Daily with the metadata |
| **Popularity and co-play** (EDHREC) | EDHREC's JSON pages (unofficial; no public API) | No: EDHREC is not built for live traffic from an app | The worker's data cache | Yes: commander ranks, themes, and the co-play links behind the graph | Weekly, gently, through the schedule, and never from the reader's browser |
| **Precon decklists and set data** | MTGJSON | No: its files are bulk | The worker's data cache | Yes: the precon list the landing page offers | Weekly |
| **Deck imports from Archidekt** | Archidekt's deck API | Yes, through the Worker (the page's security policy stays tight) | — | Never: an import is read once, and the person's library holds the result | — |
| **Our derived data** (the relationship graph, commander strategies, card facts) | Our own pipeline over the sets above | — | The worker's data cache | Yes: it is computed across every card | Rebuilt when its inputs change, on the schedule, versioned in `current.json` |

### Rules that hold across all of it

- **Say how old it is.** Settings › About lists each data set with its date. Anything past its lifetime is labeled stale, the way the Menu's card-data ages are today.
- **A game pins its data.** A game records the oracle snapshot and card-definition version it started with, so a replay is identical after the live data moves on (engine determinism, PLAN §3.2.1).
- **Honor each source's terms.**
  - Scryfall asks for a descriptive User-Agent, about ten requests a second at most, and bulk files for bulk pulls.
  - EDHREC has no public API, so it is read gently on a schedule and cached.
  - Wizards' texts are read, cited and not redistributed.
- **The security policy follows the sources.**
  - The browser may reach only `api.scryfall.com`, and load images only from `cards.scryfall.io` and `svgs.scryfall.io`.
  - Everything else goes through the Worker or the scheduled job, so no new origin reaches the page.
- **Offline still works.** The worker keeps the last good copy of every stored set, and the reader's cache keeps what they have opened. A table with no signal plays on what the device already holds.

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
4. ~~The repository's visibility.~~ **Settled 2026-09-25: private.** The scheduled job's minutes now count
   against the free plan's 2,000 a month, alongside CI at about 4 minutes a test run. A daily
   prices-and-records run plus a weekly graph is roughly 300 minutes a month.

Then the build is: the workflow, the R2 publish step in `tools/refresh.mjs`, the Worker's `/data/*`
route, the app reading `current.json`, and a test for each, in one PR, with staging first.
