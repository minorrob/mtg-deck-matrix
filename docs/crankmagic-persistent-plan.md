# CrankMagic as a persistent app: accounts, sync, and its own address

**Status: plan only. Nothing here is built.** Written 13 September 2026 at Rob's request as
scope for a major revision; development starts only when the decisions at the end are made.
The reviewed version of this plan, with diagrams, is the artifact
<https://claude.ai/code/artifact/bcc89ef9-9b76-4f94-bf8f-6f706de719e9>; this file is the
copy that future sessions read.

Today CrankMagic is a static site on GitHub Pages and every library lives in one browser.
This plan moves it to `crankmagic.com` on a hosted runtime, with sign-in and a library that
follows the person across devices, while keeping the app, its model and its tests exactly
as they are.

## The recommendation in one paragraph

Keep the front end as the zero-dependency static app it is and add a second storage
backend behind the seam the code already has. Host the static files on **Vercel** at
**crankmagic.com**, deployed from the GitHub repository on every merge. Use **Supabase**
for accounts (email link, Google, optionally Apple) and for per-user storage in Postgres,
with a small Vercel function layer that runs the app's own `collection-model.js` on the
server to validate every change before it is stored. The browser keeps its IndexedDB copy
as an offline cache and as the guest mode for people without an account. GitHub stays where
the code and the tests live; only the hosting moves.

## What is true today

Read from the code on the day this was written.

- **One seam.** Every read and write goes through `collection-repository.js` (10 KB):
  `open`, `getState`, `commit(command, expectedRevision)`, `replace`, `subscribe`,
  `history`, `exportData`, `recover`. The UI never touches IndexedDB directly.
- **Every change is a command.** `collection-model.js` (85 KB) applies a command to a
  state and returns the next one, deterministically. It already runs in Node: 577 model
  checks run there on every commit.
- **Revisions already guard concurrency.** A commit carries the revision it expects; a
  second tab that moved first is refused and the app says "Library refreshed after a change
  in another tab". Server sync is the same rule over a network.
- **A library is small.** The live library is 2.1 MB as JSON: 752 cards, 742 copy lots,
  6 decks, 11 groups, at revision 102. A backup is that JSON plus a SHA-256 checksum
  (`collection-exchange.js`).
- **The heavy work stays in the browser.** The simulator runs in a Web Worker
  (`crankmagic-sim.js` + `sim-engine.js`); card data comes from Scryfall on the client; the
  service worker caches the shell for offline use.
- **Load Live is a stand-in for accounts.** It fetches a committed backup
  (`data/live-state.json`) behind a password that sits in public client code
  (`crankmagic-exchange-ui.js`). Accounts retire it.

## Where it goes

```
Browser (unchanged UI)
  pages, dialogs, tour ──► CrankRemoteRepository (same interface as today)
                              ├── IndexedDB: offline cache and the guest library
                              └── pending queue ──HTTPS──► Vercel functions (/api/commit, /api/library)
                                                              └── applies the command with collection-model.js
                                                                  └── Supabase Postgres: libraries · commands · shares
  sign in ──► Supabase Auth (email link · Google · Apple)
  Supabase Realtime ("a change landed") ──► other devices refresh
  Vercel CDN serves index.html and data/*.json · Scryfall stays a client call · the simulator stays in a Worker
```

The box that changes is the repository in the middle of the browser. Everything above it is
the app as it stands; everything to the right is rented.

## Accounts and the guest library

- **Sign-in** lives in User Functions: Sign in, Sign out, Account. Email magic link needs no
  password to manage; Google covers most people in one tap; Apple is worth adding if phones
  matter and needs an Apple developer account ($99 a year).
- **Guest mode stays.** Opening the site without an account works exactly as today,
  locally. Signing in offers to upload the local library into the account. That is also how
  Rob's own library moves: restore the backup once, sign in, and it is persistent.
- **One library per account** to start. The tables are shaped so a person can own several
  later, and share one.
- **Deleting an account deletes its libraries.** Export stays a client feature, so a backup
  file is always one click away.

## Data and sync

| Table | Holds | Why |
|---|---|---|
| `libraries` | owner, name, `revision`, the current state as JSONB, updated at | One row is one library; the row's JSON is what `getState()` returns. |
| `commands` | library, revision, the command as JSONB, summary, device, created at | The append-only log: history, undo, and the audit the app already shows. |
| `shares` | library or deck, token, scope | Read-only deck links, later. |

Row-level security in Postgres means an account can read and write only its own rows; the
function layer adds validation and rate limits on top.

The commit path:

1. The browser applies the command locally (optimistic) and writes it to IndexedDB as
   pending.
2. `POST /api/commit { library, baseRevision, command }`.
3. The function loads the library's state and revision. If the revision matches, it applies
   the command with `collection-model.js`, inserts the command, stores the new state at
   revision + 1 and answers `200 { revision }`; the browser marks the command synced.
4. If someone else moved first it answers `409 { revision, commands }` — the commands it
   has not seen, not the state; the browser applies them through the same model, the way
   today's "changed in another tab" path refreshes, and replays the pending commands that
   still apply. Rejected commands are shown for review, never dropped.
5. Realtime tells other devices to refresh.

- **Offline** keeps working: commands queue in IndexedDB and replay in order when the
  connection returns.
- **Versioning.** The server and the browser run the same model file. The `?v=` discipline
  the repo already enforces extends to the model: a browser on an older model is told to
  reload before its commands are accepted.
- **Size.** A 2 MB library gzips to roughly a fifth and loads once per session. If libraries
  grow past a few thousand lots, the state splits into rows per lot; the command log makes
  that a migration, not a rewrite.

## Commands are the exchange format

The wire carries commands, never states. That one rule is what makes two devices merge
rather than overwrite, and it costs nothing new: the model already has a journal, a revision
on every apply, and a validator that refuses a command that no longer fits.

- **What travels.** `{id, type, …args, baseRevision, device, at}` — the object `M.apply`
  takes today, with the device that made it and the revision it was made against. A state
  travels twice only: at first sign-in, when the guest library is uploaded whole, and as a
  backup file, which stays the `crankmagic-backup` format that exists (schema, checksum,
  replaced whole).
- **How two devices merge.** By replay. A commit that is behind is answered with the commands
  it has not seen; the device applies them locally through the same model and re-applies its
  own pending commands on top. One that no longer applies (a lot deleted underneath it, a deck
  finalized first) is shown for review with the summary the model already writes — never
  dropped, never forced.
- **Idempotent by id.** A command's id is minted on the device, so a replay after a lost
  answer is one the server recognises and answers again rather than applies twice; the log
  holds each command once.
- **Order.** The server's revision order is the order. Device clocks are recorded for the
  audit, not trusted for sequencing.
- **Version.** A command names the model version it was made under. The server runs the same
  model file; a browser on an older one is told to reload before its commands are accepted
  (the `?v=` discipline above). `migrate` runs on states, at load; a command is never
  migrated, because the model that reads it is the one that wrote it.
- **What it buys.** History and undo are the log; the audit the app shows is the log; a
  lot-per-row store later is a projection of the log, not a rewrite; and a backup restore is
  one more line in it — a state that replaces the library and starts a new revision line,
  exactly what Restore does today.
- **What it forbids.** No endpoint accepts a state for a library that already has one, and no
  client sends its whole library to settle a conflict.

## Hosting and the domain

Registry lookups on 13 September 2026 (RDAP, the registries' own records) found **no
registration** for `crankmagic.com`, `crankmagic.io`, `crankmagic.app` or
`crankmagic.cards`. `crankmagic.gg` could not be checked; that registry publishes no RDAP
service. A registrar's search is the final word.

| Domain | Status that day | Typical price / year | Note |
|---|---|---|---|
| `crankmagic.com` | not registered | $10–15 | Recommended. The one people type. |
| `crankmagic.io` | not registered | $35–60 | Worth holding if the price is fine; redirect it to .com. |
| `crankmagic.app` | not registered | $15–20 | HTTPS-only by policy, which the app already satisfies. |
| `crankmagic.cards` | not registered | $25–35 | Fun, less typeable. |
| `crankmagic.gg` | unknown | $40–70 | Check at the registrar. |

### Runtime

| Option | What it gives | Cost to start | Read |
|---|---|---|---|
| **Vercel + Supabase** (recommended) | Static hosting with a preview per pull request and small serverless functions; accounts, Postgres with row-level security, realtime and file storage from one console. | Vercel Hobby free (non-commercial) or Pro $20/mo; Supabase Free, or Pro $25/mo once it must never pause. | Two mainstream vendors with generous free tiers. The function layer keeps validation and secrets off the client. |
| Firebase (Hosting + Auth + Firestore) | One vendor with excellent sign-in and offline sync in its SDK. | Free tier, pay as you go after. | Firestore documents cap at 1 MB, so the library would be split into many documents from day one. More rework for the same result. |
| Cloudflare Pages + Workers + D1 | Cheapest at any scale; SQLite at the edge. | Free tier. | No first-party consumer sign-in, so a third service joins anyway. More assembly. |
| Netlify + Neon + Clerk | Equivalent to the Vercel pairing. | Free tiers. | Three vendors instead of two. |

Two conditions to know. Vercel's free Hobby plan is for non-commercial use; the day
CrankMagic charges for anything, it is Pro. Supabase's free project pauses after a week
without traffic; a weekly ping avoids that, and Pro removes the rule and adds daily backups.

## What does not change

- The pages, the dialogs, the tour, the How page, the glossary, the simulator, and every
  command the model knows.
- The zero-dependency rule for the UI, with one considered exception: the Supabase browser
  client from a CDN with an integrity hash, or plain `fetch` against its REST API if we
  would rather add nothing.
- The repository as the home of the code, the Node suites, the journeys, geometry and
  page-budget gates. Vercel deploys from `main`; a pull request gets a preview address the
  journeys can run against.
- The workbook sync. The Load Live skill can keep rebuilding Rob's library from the Master
  workbook and push it into his account through the same API instead of committing a JSON
  file.

## Phases

Each phase is a set of pull requests that keeps every current gate green and adds an API
suite. No dates; the order is the point.

| Phase | What ships | PRs | Who |
|---|---|---|---|
| **0 · Decide and buy** | Domain(s); Vercel and Supabase projects; sign-in methods; commercial intent; the decisions below. | 0 | Rob, an evening |
| **1 · Same app, new address** | The static app deployed on Vercel from the repo; DNS and HTTPS; the Share link and QR code point at crankmagic.com (`APP_URL` in `crankmagic-app.js`); GitHub Pages becomes a one-line redirect. | 1 | Claude |
| **2 · Accounts** | Sign in / out / Account in User Functions; guest mode; the `libraries` table with row-level security; first sign-in uploads the local library. Nothing else changes yet. | 2 | Claude |
| **3 · Sync** | `CrankRemoteRepository`; `/api/commit` running the model; the command log; the pending queue and offline replay; realtime refresh; conflict review. Load Live and its password retire. | 3 | Claude |
| **4 · Operations** | Rate limits; backups (Supabase daily plus the app's export); account deletion; error and uptime reporting; a privacy and terms page; the API suite against a local Supabase; journeys against a preview deployment. | 1–2 | Claude |
| **5 · What accounts unlock** | Later, each its own plan: read-only deck links (`crankmagic.com/d/…`), several libraries per account, the To Trade group published as a hosted page (the link version shipped without an account in #195: `crankmagic-trade.js`, the list in the hash), Subscribe as a real list, playgroups. | — | later |

Phase 1 is worth doing the week the domain arrives: one small pull request, and the address
is in use from then on. Phases 2 and 3 are the revision proper, about five pull requests.

### Sequencing with the simplification work

The simplification plan (Option A shipped as #162; Option B's Cards page as #163 and #164)
still has two pull requests ahead of it: the deck page as tabs (Overview · Cards · Guide ·
Upgrades · History, the Next line, the phone action bar) and the Build and Discover
disclosure. None of that touches the repository seam, so it can land before, between or
after these phases without conflict.

## Risks, and what answers them

- **A stale browser writes with an old model.** The server checks the model version on
  every commit and answers "reload" rather than applying a command it would read
  differently. The `?v=` manifest already forces this on assets.
- **Two devices edit the same library.** Same rule as two tabs today: the first commit
  wins, the second refreshes and replays. Rejected commands are shown, never dropped.
- **Offline breaks.** IndexedDB stays as the cache and the queue. The app opens and edits
  with no connection; the queue drains when one returns.
- **Lock-in.** Postgres is portable, the command log is the whole history, and the backup
  file format is unchanged. Moving vendors is a data copy.
- **Costs creep.** Both vendors start free. The first paid line is Supabase Pro at $25 a
  month, and only when pausing or backups matter.
- **Collection data is personal.** Row-level security by account, no analytics over card
  data, HTTPS everywhere, deletion on request, and the export that has always been there.

## Decisions to make before Phase 0 ends

1. **The domain.** `crankmagic.com` as the address; `.io` too if the price is fine.
2. **The pairing.** Vercel + Supabase as recommended, or Firebase if one vendor matters
   more than the rework.
3. **Sign-in methods.** Email link and Google to start; Apple if the $99 developer account
   is acceptable.
4. **Guest mode.** Keep the app usable without an account (recommended), or require
   sign-in.
5. **A demo library.** Whether Rob's six decks become the "try it" library for visitors,
   replacing Load Live, or stay private.
6. **Commercial intent.** Free forever keeps Vercel Hobby; any charge means Pro from day
   one.
7. **The validation layer.** Functions that run the model on the server (recommended), or
   the browser writing straight to Postgres under row-level security, which is simpler and
   trusts the client.
8. **The workbook.** Whether the Master spreadsheet keeps feeding Rob's library through the
   sync skill, or the app becomes the source of truth for his decks.
9. **GitHub Pages.** Keep a redirect there, or let the old address lapse.

---

Figures: library size and record counts from `data/live-state.json`; file sizes from the
repository; domain status from the registries' RDAP services on 13 September 2026; plan
prices from the vendors' published tiers, approximate.
