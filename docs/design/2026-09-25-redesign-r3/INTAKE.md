# Revision 3 — the evaluation against the live app, and the plan to build it

Received 2026-09-25 from Rob: *"Here's your updated deck redesign. Note, it includes new pages including a
landing page. Begin by evaluating this against the current and creating an execution plan to ensure we
don't miss anything. Once the plan is created, I'll review and approve your executing it."*

**Nothing in this revision is built yet.** This file is the evaluation and the plan. The work starts when
Rob approves it, and the decisions in §4 come first.

It is the same Claude Design project as `2026-09-20-deck-page-r2/` and `2026-09-24-table/`, taken
further. r3 wins where they disagree. Inside r3, the README's **Wireframes v2** section wins where it
disagrees with the rest (§2.1).

## 1. What arrived, and what was kept

| Where | What |
| --- | --- |
| `design_handoff_crankmagic_gallery/` | The handoff, untouched: README (now with Wireframes v2, Play in three views, phones, card ratio, vitals, show hand, Lab strategy, Coach), `DELTA-play-and-implementation.md`, `IMPLEMENTATION-GUIDE.md`, the design system, the hi-fi screens (now including **`Landing Page.dc.html`** and `Play Focus Mock.dc.html`), and `wireframes/CrankMagic Wireframes v2.dc.html` with `wf2-screens.js`. |
| `project/` | The design system at the project root, which carries the **final type tokens** (`project/tokens/typography.css`: `--font-display` Satoshi 900, `--font-hero` Young Serif), its guidelines and readme, the designer's state (`_STATE.md`), the three alternative systems (`design-systems/`), and the working canvases (Landing Wireframe, Type/Palette/Sea Options, Deck Redesign, and the designer's pictures of the current Decks and Deck Overview). |

**Not committed:**

- **The designer's copies of our own code and data** (`crankmagic-*.js`, `crankmagic*.css`, `data/live-load.json`, `data/deck-guides.json`). They are a stale snapshot of this repository. One of them still carries a personal e-mail address that was scrubbed from the repository on 2026-09-24. `data/live-load.json` is Rob's collection.
- **`uploads/`**: 12 MB of screenshots of the app from 2026-09-14, plus our own wireframe index. It was the designer's input, and it is superseded.
- **Copies of our own assets at the project root** (`assets/`): the handoff folder keeps its own copies, as r2's did.

**How to open it.** Serve the folder and open `design_handoff_crankmagic_gallery/wireframes/CrankMagic Wireframes v2.dc.html`. Every screen has a hash route (`#deck-overview`, `#play-fullscreen`, …). The pack builds **76 screens**; the README says 70. Seven screens have a hi-fi mock-up, reachable through the Wireframe | Hi-fi toggle. Renders of all 76 and of the hi-fi pages were made for this evaluation. They are not committed; the README in this folder's parent says why.

## 2. What the design decides, against what is live

Live means crankmagic.com at 8577a27. Colors and shapes are **identical** to r2, so the app's tokens and `tests/design-tokens.mjs` stand. Everything below is type, layout, or function.

### 2.1 Type: the one real conflict inside the pack

| | Says |
| --- | --- |
| README, **"Type (final)"** (Wireframes v2) · `project/tokens/typography.css` · `project/readme.md` | Satoshi everywhere. Headings and figures in **Satoshi Black 900**, tracking −.035em. **Young Serif only for hero headlines 48px and up**: the landing hero, the deck title, and the landing's closing call to action. |
| `design_handoff_crankmagic_gallery/design-system/tokens/typography.css`, the IMPLEMENTATION-GUIDE, and the README's older sections | Young Serif 400 for h1–h3. These are the designer's copy from before 2026-09-24, and they overwrite the Satoshi edit made on that date. |
| Live (2026-09-24, Rob) | Satoshi 700 for every heading; Young Serif retired. |

**The plan follows "final"**, because it is newest and it still matches Rob's instruction for h1–h3. Two things are missing to build it:

- **`satoshi-900.woff2`.** The designer loaded it from Fontshare's CDN, and the app's security policy allows only self-hosted fonts.
- **Young Serif's two subsets**, retired on 2026-09-24. They come back from git history (9f289c6) with their OFL license file.

Rob confirms this in §4.

### 2.2 Screen by screen

"Tag" is the designer's own label. Status is what the app does today.

**Start and shell**

| Screen (wireframe id) | Tag | Status today | The gap |
| --- | --- | --- | --- |
| Landing page (`landing`) | new | Does not exist; `/` opens Decks | A public page at `/`. Hero (Young Serif) with "Step one: start your first deck": a commander name or a pasted list, plus Import from Archidekt · Upload a CSV · Start from a precon. Four doors (Decks, Library, Explore, Play "Coming soon · Get notified"). Plan · Collect · Play. Three promises. Closing call to action. Footer. "Signed-in users skip to Decks." **Four product questions (§4).** |
| Sign in / create account (`account-signin`) | live | Cloudflare Access's hosted page: Google, plus an emailed code | The design draws our own page with email, Google and **Apple**, and marks the providers "an assumption". Access hosts the login, so the app can only brand it and hand off to it. Apple is not configured. |
| Opening your library (`loading`) | live | Built | Restyle only. |
| App shell, dark and light (`shell-dark`, `shell-light`) | live | Built, except the rail's foot | **The rail's foot becomes an account chip**: avatar · name · "Synced · just now" ▾, which opens the Global menu. Signed out, it is a Sign in chip. The "saved in this browser" note went on 2026-09-24; the chip replaces the Menu button. |
| Global menu (`global-menu`) | live | Built, with more in it | Account (name, e-mail, sync state) · Theme **Dark / Light / Match system** (today it is one toggle) · Settings · Back up library… · Restore backup… · Help & glossary · Take a tour · Send feedback · Sign out. **Not drawn:** Share by e-mail, QR code, Publish To Trade, E-mail the export, Export as Excel, Undo / See every change, Confirmations…, Reset comparison picks, Clear all data, card data ages and version. Where each goes is decision §4.7. |
| Help ? panel (`help-panel`) | live | A dialog | A right slide-over, scoped to the page. |
| Settings (`settings`) | "live" | **Does not exist** | A page with four cards. **Account:** name, e-mail, Sign out. **Appearance:** Dark / Light / System · Card size · Reduce motion. **Prices:** **USD / EUR** · default budget cap. **Data:** Back up · Restore · **Delete account…**. EUR and Delete account are new features (§4.8). |
| Mobile: Decks, Library, Explore | live | Built | Restyle. The rail becomes a top row; tiles and doors stack. |
| Mobile: Deck detail | planned | Built; the bar was fixed 2026-09-24 | The sticky action row as **one row that scrolls sideways**, in place of three equal buttons. |

**Decks**

| Screen (wireframe id) | Tag | Status today | The gap |
| --- | --- | --- | --- |
| Decks, empty and with decks | live | Built | New: **filter chips** (All · Building · Playable · Complete), **Sort: closest to finished ▾**, and Compare and Show archived moved to the head. Compare exists today as a per-tile pick. |
| New deck: choose a path, from a commander, bring a list | live | Built | Restyle. "Bring a list" names **Archidekt** as a source; today a pasted Archidekt export works, but an Archidekt link does not. |
| New deck: Lab wizard (`new-deck-lab`) | planned | A Lab exists, with a different shape | Commander → **Strategy** → Budget → Review. The strategy chips are computed from the commander: rules text → deck-guide tags → EDHREC themes → generic archetypes. Each has a fit label, the top fit is preselected, and a skeleton shows while loading. |
| Deck Overview (`deck-overview`) | live | Built (the V.4b bento) | The title in **Young Serif** (hero). Headings in Satoshi 900. Otherwise as built. |
| The hundred, Upgrades, Explore (deck-scoped), Acquire, Ready to add, Make the change, Edit card list, More menu | live | Built | Restyle. The hundred is a sortable table where "the page grows, no inner scroll". The More menu lists Measure, Trace, Guide, Export, Compare, Archive, Delete. |
| Guide & SWOT (`deck-guide`) | live | Sections at the foot of Overview. "Full guide and SWOT" scrolls there since 2026-09-24 | A **dialog** opened from Overview › How it plays. |
| Measure report (`measure-report`) | planned | Measure runs, and the result is filed under the deck | A report view with the **fidelity notice above the score**. |
| Compare decks · Log a game · Export / print | live | Built | Restyle. Export lists list formats, proxies and a deck backup: check proxies. |

**Library and Explore**

| Screen (wireframe id) | Tag | Status today | The gap |
| --- | --- | --- | --- |
| Library: List, Sheet, Table, To buy, Orders, empty | live | Built; the counts became cards on 2026-09-24 | Restyle. Check the filters dialog (type, color, status, deck, **MV, price**), the columns dialog (show, hide, **reorder**, with Card and Status locked), and Add cards (search or paste, quantity, **lands on the Bench**). |
| Card pop-up · Status change menu · More menu | live | Built (the inspector; the row ⋯; More) | Restyle. The menus were fixed on 2026-09-24. |
| Back up · Restore | live | Built | Back up is "an extra copy on top of the cloud save". **Restore offers Merge or Replace**; merge does not exist today. |
| Explore: entry, graph, lens & roles, add and/or buy | live | Built (entry fixed 2026-09-24) | Restyle. "Into deck / Wanted / To buy, kept distinct": check against today's Add/Buy. |

**Play**

| Screen (wireframe id) | Tag | Status today | The gap |
| --- | --- | --- | --- |
| Play: coming soon | live | Built | Restyle. |
| **Play: 16 planned screens.** Lobby (2b quadrants, the color-identity fan, auto-launch), Change deck, **Choose mat**, Invite (e-mail, link, QR), Countdown, **three views** (Table · Focus · Full screen), Table vitals, Tools (card-size slider 60–160%), Show hand (contemplate, then held), Coach (a chat shell with stub replies), Card zoom, History drop-down, Game history, and Play on phones (landscape only, Focus only). | planned | The Forge-hosted board on the frozen local host carries Focus and Table as decided on 2026-09-24. Nothing runs in the cloud. | All of it is Stage 3. It is built on the cloud table (Durable Objects and CME, `docs/plan-to-100.md` M5), not on the local host. The design moves past what the 2026-09-24 board shipped: **vitals** in each board header replace the center life counter, the **card-size slider** replaces the S/M/L chips, a **Full screen** view, a **5:7 card ratio everywhere**, and **Show hand**. Build these when the cloud board is built. |

**Accounts and system**

| Screen (wireframe id) | Tag | Status today | The gap |
| --- | --- | --- | --- |
| Review receipt · Glossary · Commander zoom · Empty-state patterns | live | Built | Restyle. |
| Toast / error (`toast-error`) | live | Toasts exist | **Success carries Undo; an error carries Retry.** |
| Confirm delete (`confirm-delete`) | live | Deck delete confirms | **Type-to-confirm** for decks **and the account**. |

### 2.3 Rules that apply everywhere

| Rule | What it means for the app |
| --- | --- |
| **Every card is 5:7** (`aspect-ratio: 5/7`), sized by width only | An audit of every card surface (tiles, pop-ups, pickers, thumbnails, the table view). Some set both width and height today. |
| Every card row shows mana symbols. Colorless is Scryfall's `{C}`; lands wear a land mark | Built. The land icon is still a placeholder disc; the design asks Rob for an icon. |
| American English everywhere | Held by `tests/feature-wiring.mjs`. The designer's files now comply. |
| No "saved in this browser" copy anywhere; backup is an extra copy | Mostly done on 2026-09-24. The account chip and the Settings copy finish it. |

## 3. What must not be lost

The design redraws surfaces. It does not list everything they do. Each item below exists today and must survive the build, or be moved on purpose with Rob's agreement:

- **Library:** the Sheet's in-place editing; the Table view's piles, trays, stage and sittings (confirm, step back, discard); batch ticks and the ticked-rows bar; group bands and collection groups; the Unexpected Party cost rule.
- **Decks:** Ready to add, Make the change and the change plan's four readings; Finalize & reserve; the upgrade path and replacements; Compare picks; deck archive and delete; Trace.
- **Data and sharing:** the To Trade link; Excel and CSV exports; undo and history; confirmations and their switches; the card data ages; the version row.
- **Help and accounts:** the tour and the glossary; the account conflict dialog ("Which library do you want to keep?").
- **Guards:**
  - the builder's refusals: one public address, Play left out, nothing that never ships;
  - the security policy: no font or script CDNs;
  - the ratchets: raw hex, UK spellings;
  - the page budget and geometry suites.

## 4. Decisions for Rob, before building

1. **Type.** Satoshi Black 900 for headings, with Young Serif only on 48px-and-up heroes (the design's "final"), in place of what shipped on 2026-09-24 (Satoshi 700, no Young Serif).
   - **Needs:** `satoshi-900.woff2` from Fontshare. Rob downloads it, or approves the download, since fonts are self-hosted. Young Serif returns from git history.
   - *Recommended: yes.*
2. **Who the landing page speaks to.** It says "Start free" and "Free account", and accounts are invite-only today (Access's Invited policy, which is also capped at 50 people on the free plan).
   - **Option A:** keep invite-only. The page says Sign in and **"Start without an account"**, because the workshop works without one.
   - **Option B:** open sign-up. That needs an Access policy change, rate limits (M3) and a plan past 50 users.
   - *Recommended: A, for now.*
3. **Where the landing page lives.** `/` shows the landing page to a visitor who is signed out **and** has no library in the browser. Anyone else goes straight to Decks. The app keeps its `#` routes. The page links Decks · Library · Explore into the app. *Recommended as stated.*
4. **The landing page's three new ways in.**
   - **Import from Archidekt:** a deck link, fetched through the Worker. The page's security policy lets the browser reach Scryfall and nothing else, and it should stay that tight.
   - **Upload a CSV:** Import takes a CSV today; this just exposes it.
   - **Start from a precon:** needs precon decklists; MTGJSON publishes them.
   - *Recommended:* ship the landing page with the paste box and CSV, and add Archidekt links and precons as their own steps (R3.10).
5. **"Get notified" on Play.** Rob removed Subscribe to updates on 2026-09-24.
   - **Option:** drop it, and have the Play door say "Coming soon" with no action.
   - **Option:** for a signed-in person, "Tell me when it's ready" is a switch stored with the account; the app shows it when Play ships, and no mailing list is involved.
   - *Recommended: the switch.*
6. **Sign in.** The in-app Sign in panel shows the brand and hands off to Access. The providers are the ones live: Google, and the emailed code (library only, never AI). **Apple is not added** unless Rob asks. *Recommended as stated.*
7. **The Menu entries the design does not draw.**
   - **Settings › Data:** Export as Excel, E-mail the export, Clear all data (in a danger zone).
   - **Settings › History:** See every change and Undo. A success toast carries Undo too.
   - **Library › More:** Publish your To Trade list.
   - **The Menu, under Help:** Share by e-mail and the QR code.
   - **Settings › Appearance:** Confirmations….
   - **Removed:** Reset comparison picks, because the Decks page clears its picks.
   - **Settings › About:** the card data ages and the version.
   - This also answers the open "which backup/share entries stay" question from 2026-09-24. *Recommended as listed.*
8. **Two new features on Settings.**
   - **EUR prices.** The card data carries USD only. The data sync (M2) would add Scryfall's EUR.
   - **Delete account.** A self-service delete route in the Worker, plus the Access e-mail removal, which stays a dashboard step for Rob. It fulfills the promise on the privacy page.
   - *Recommended:* both, EUR after M2.
9. **Merge on restore.** Merging a backup into a library is new model work (duplicate copies, conflicting states, receipts). *Recommended:* Replace only in this pass; Merge later with its own tests.
10. **The land icon.** The design asks Rob for one.

## 5. The plan, in order

Each step is one PR. Each renders the real pages before and after at 390, 1136 and 1400 px (`tools/render-routes.mjs`) and shows Rob screenshots. Each passes the full gate (`PAGE_BUDGET_REQUIRED=1 GEOMETRY_REQUIRED=1 bash runtests.sh -q`) and CI, and before release it passes the release walk (`tests/uat/release-acceptance.mjs`, extended per step). Staging deploys before production. Track V's rules stand: tokens not hex, one component in one place, the ratchets only go down. Play screens wait for the cloud table.

| Step | What | Proof added |
| --- | --- | --- |
| **R3.0 Intake** (this file) | Land the handoff. Point `tests/design-tokens.mjs` at r3's **project** tokens, the final ones, with the handoff folder's stale `typography.css` noted as superseded. Baseline renders. | `design-tokens` held to r3 |
| **R3.1 Type** | `satoshi-900.woff2` and Young Serif self-hosted. `--display-weight: 900`, `--display-tracking: -.035em`, `--font-hero` for hero titles 48px and up (the deck title, the landing hero and its closing call to action). The THIRD-PARTY-NOTICES font rows. | Tokens test; a check that a heading is Satoshi 900 and the deck title is Young Serif |
| **R3.2 Shell and account** | The account chip at the rail's foot (signed in and signed out). The Global menu restructured (§4.7). Theme Dark / Light / **Match system**. Help as a right slide-over. Toasts with Undo and Retry. Type-to-confirm delete. | Feature wiring; the release walk opens the menu; cloud e2e checks the chip's sync state |
| **R3.3 Settings** | `#settings`: Account, Appearance (theme, card size, **reduce motion** as a stored preference), Prices (USD; the **default budget cap** a new deck takes), Data (backup, restore, Excel, e-mail export, history, danger zone), About (data ages, version). **Delete account**: a Worker route that removes the person's snapshots, head and user row. Access removal stays a runbook step for Rob. | `cloud-worker` delete tests; the release walk visits Settings |
| **R3.4 Decks hub** | Filter chips, sort (closest to finished · name · recently changed), Compare and Show archived in the head. The empty state. | A Decks suite for filters and sort |
| **R3.5 Deck page** | The hero title. **Guide & SWOT as a dialog**, which the "Full guide and SWOT" link opens. The **Measure report** view with its fidelity notice above the score. The More menu's order. The phone's **one-row sideways-scrolling action bar**. | Geometry at 390; the release walk opens the guide and a report |
| **R3.6 Library** | Restyle to r3. The filters dialog (MV, price), the columns dialog (reorder; Card and Status locked), Add cards landing on the Bench. Every item in the §3 list checked. | Wireframe conformance |
| **R3.7 Explore** | Restyle. "Into deck / Wanted / To buy" kept distinct in the add dialog. | — |
| **R3.8 Landing page** | `/` for a signed-out visitor with no library (§4.3). The hero's paste box and CSV. The four doors. The closing call to action. The legal footer. The page budget holds, and nothing loads the 16 MB graph. | A landing suite: who sees it, where each door goes |
| **R3.9 5:7 cards** | Every card surface sized by width with `aspect-ratio: 5/7`. | A geometry check over rendered cards |
| **R3.10 New ways in** | An **Archidekt link** import through a Worker route (`/api/import/archidekt`, with a size limit and no stored data). **Precons** from a committed list refreshed with the card data (M2). | Import suites |
| **R3.11 Lab wizard** | Commander → Strategy (data-driven chips with fit labels) → Budget → Review. | A Lab suite over the strategy sources |
| **R3.12 Mobile** | Decks, Library, Explore and Deck detail per the wireframes. | Geometry at 390 |
| **Play (Stage 3)** | The 16 planned Play screens, built on the cloud table (`docs/plan-to-100.md` M5): lobby 2b, change deck, choose mat, invite, countdown, Table · Focus · Full screen, vitals, tools slider, show hand, card zoom, history, game history, Coach shell, and phones. | The Play suites of M5 |

**Estimate:** R3.0–R3.9 is the web app's refresh, about 8–10 PRs. R3.10–R3.12 follow in any order. Play is Stage 3's.
