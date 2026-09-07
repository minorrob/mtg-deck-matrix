# Product requirements

*What this app is for, what it deliberately is not, and where every claim in it comes from.*

Reconstructed 2026-09-07 from the repository itself: `docs/handover-index.md`, the commit
history on `origin/main` (208 commits, of which 62 carry a merged pull-request number),
`BACKLOG.md`, the three design notes in `docs/`, the merged pull-request bodies, and the
code. Nothing here is invented. Where the record is ambiguous or where two sources disagree,
this document says so rather than picking a side.

Two conventions of this repository make that possible and are worth knowing before reading
on. **The reasoning lives in the code** — most modules open with fifteen to thirty lines
stating the problem, the options, the measurement and what was rejected. And **the commit
messages are a decision log**, not a changelog: they routinely quote the complaint that
caused the change before describing the fix. Those two places, not `docs/`, are where most
of this was recovered from.

---

## 1 · Problem and users

### Who it is for

One person's Commander collection, and increasingly the people they play with.

The primary user is the repository owner. The evidence is throughout: `data/source/`
carries his own workbooks (`Treys_MtG_Master_v3.xlsx`, `Robs_MtG_Current_State.xlsx`,
`MTGDeckDecisionMatrix.xlsx`), the six decks in `data/master-v2.json` are his physical
boxes, and commit after commit is a response to something he reported — "Rob's report: Build
cost does not update" (`26ba78c`), "Rob asked for it back" (`3a1754e`), "Rob audited all six
boxes card by card and sent the result" (`71e200f`).

The second audience arrived later and is now designed for explicitly. Three things record it:

- **`tests/friends-deck.mjs`** pins `tests/fixtures/splinter-deck.txt` — "a real export
  somebody handed over: 80 lines, 100 cards, a Universes Beyond commander, and one name that
  is not a card." Its header calls this "the whole first-time experience in one paste, from
  the person who has no reason to give the app a second try."
- **The browser journeys** (`tests/uat/journeys.mjs`) drive three personas, and the first is
  somebody who has never seen the app with an empty `localStorage`. `tests/uat/README.md`
  explains why that persona had to be invented: every browser check before it seeded a full
  collection first, "which is a returning user, and a first-time visitor is the persona that
  finds the dead ends."
- **PR #74** treats a stranger opening the page to somebody else's six decks and a 176-card
  bench "presented as their own" as a defect, and fixes it.

The device that decides most of the layout is a phone at a card shop. That is why the header
folds, why the Shop has a Store view, and why no font or graph library is allowed to block
first paint.

### What it replaces

A spreadsheet, and before that two hand-built single-file HTML pages generated from it.

`tools/extract_data.py` — 51 KB, the original extractor — reads `../MtG - Side-by-Side.html`
and `../MtG - Deck Shopping Plan.html` from one directory *above* the checkout. Neither file
is in this repository and the parent directory holds only this clone, so
`data/variants.json` and `data/buy-plans.json` cannot be regenerated from scratch; they can
only be patched by the later tools. `payload/` (9 chunks) and `payload_v3/` (4 chunks) hold
base64-gzip of a 1.27 MB and a 466 KB page titled *"Deck Variant Matrix — All Six Slots"*,
which is almost certainly those legacy apps or an ancestor of them. Nothing in the running
app references either directory.

The workbooks are still the upstream source of truth for the six real decks and for
ownership, and six of them are committed under `data/source/`.

### The specific failures that motivated the app

These are documented, not inferred. Each is a spreadsheet failure that cost real money or a
real evening.

1. **A workbook whose formulas have never been evaluated.** `tools/import_master_v2.py`
   records that `MtG_Deck_Master_v2.xlsx` "has never been opened in Excel, so every formula
   column comes back empty: Status, Qty, Own, Extra (Bench), Buy Count and $ To Buy are
   blank in the file." The importer therefore reads a second workbook (`MtG_Deck_Flat.xlsx`)
   for the resolved values *and* transcribes every formula anyway as a cross-check, stopping
   the import on disagreement. Today the two agree on all 579 rows across all six derived
   columns.

2. **A workbook that contradicts itself, with no way to say so.** PR #46 lists three live
   contradictions found on import: a D5 cut row that lost its card name to a paste and had
   four candidates that fit; a Notes sheet dated 2026-09-02 naming six replaced cards the
   Upgrades sheet dated 2026-08-31 does not list as cuts; and a Read Me naming *Quintorius,
   Loremaster* as a commander where the Master sheet tags *Quintorius Kand*, a planeswalker
   with no commander clause. The app's answer was to surface the conflicts rather than pick
   a side.

3. **Ownership that was wrong by an order of magnitude in the direction that costs money.**
   PR #71: the Shop was claiming 263 cards and $315.28 still to find. Of those 241 "need"
   rows, 128 were already in hand and 97 were on order — **16 were genuinely unowned**. The
   cause was 263 stale per-deck denials left by a superseded audit. After the fix: 17 cards,
   $80.14, and a shopping trip from 23 screens to 2.

4. **"A card in the post is not a card in the box."** PR #32: a state file listed 126 cards
   paid for and not received, and nothing read it, so all 126 were indistinguishable from a
   card sitting on the table.

5. **Numbers that do not add up and cannot be audited.** PR #36: "Deck 1 was reporting
   '0 to buy $0.00' while fifty-seven of its cards were still in the post." PR #25 records
   three separate ways the Deck header counted the wrong thing.

6. **No way to answer, with the cards physically in front of you, whether the hundred is
   legal and whether it can cast itself.** PR #28 states this as the motivating gap: "the
   Deck page could tell you how many were in the box and what was still to buy. It could not
   tell you whether the hundred was legal or whether it could cast itself — the two
   questions you are actually asking with the cards in your hands."

Behind all six is one question, stated at the top of `BACKLOG.md`: *sitting at the table with
the cards in front of me, does this app get the right hundred into the box and keep it
there?*

---

## 2 · Goals

1. **Answer three questions a spreadsheet answered badly.** What are my decks and how far
   from finished are they; which version of each deck should I build and what does it cost;
   what card should go in this slot.
2. **Every number on screen comes from a measurement, and the measurement is reproducible.**
   The simulation is the only source of a score anywhere in the app.
3. **Work on a phone, in a shop, on a connection that may be bad.** Time-to-usable, not
   time-to-load-event, is the target; PR #70 records My Decks going from 12,618 ms to 210 ms
   to first paint and the graph from 12,761 ms to 382 ms usable, both by removing a
   render-blocking third party.
4. **Nothing about the reader leaves their browser.** No account, no upload, no telemetry.
5. **A deck somebody pastes in is a peer of the six that ship**, scored on the same engine
   and shown by the same views.
6. **Never dead-end.** A bad card name, an unfetchable deck site, a missing library, an
   empty first visit and a cleared browser each get a real path forward rather than a
   message.
7. **Say what is not known.** A sample too small to support a claim says so; a published
   number measured on a different engine is never subtracted from a local one.

## 3 · Non-goals

These are strong, and each one has a consequence visible in the code.

- **Not a rules engine.** `sim-engine.js` opens with a `SIMPLIFICATIONS` array of fourteen
  numbered admissions, copied into every result file the pipeline writes. There is no stack,
  no blocking assignment, and no politics.
- **Not a price tracker.** Prices are read from Scryfall when a card is fetched and
  otherwise come from the committed catalog. `docs/claude-api-evaluation.md` §5 lists prices
  as something explicitly not to build a feature around: "Scryfall and TCGplayer have them
  and they change daily."
- **Not a deckbuilding social network.** There is no sharing, no comments visible to anyone
  else, no profile. The one social affordance is a `mailto:` draft, and even the address is
  kept in the browser "rather than written into a public repo" (PR #46).
- **It does not host anything.** Static files: HTML, CSS and JavaScript served as files. No
  `package.json` anywhere in the tree, no build step, no server, no framework. The single
  runtime library on any page is Cytoscape on `graph.html`, loaded `async` and explicitly
  optional.
- **It holds no accounts and no credentials.** There is no `.env`, no key file and no key in
  any script. `tests/sim-engine.mjs:428` asserts the app source never mentions
  `api.anthropic.com` or `ANTHROPIC_API_KEY`. This is the fact that decides how any AI
  feature can ever be built here — see §5.5 — and it is also why there is no TCGplayer API
  integration: their API needs a client id, a secret and an OAuth exchange, and a static site
  has nowhere to keep a secret that it would not also be handing to everyone who opens the
  page (`card-resolve.js` header).
- **Not a rules adjudicator.** "Does this combo work" is a judge question and a wrong answer
  loses a game (`docs/claude-api-evaluation.md` §5).
- **No dependency the reader has to install.** The Node suites use only built-ins.
  Playwright is used by the browser journeys and is deliberately not a dependency: the
  journeys **skip rather than fail** when it is absent, because "a missing browser is a
  missing tool, not a failing app."

---

## 4 · The product surface

Three pages, three jobs. Every module is loaded by at least one of them; none is dead
(verified by parsing the `<script src=…>` tags out of all three pages).

### 4.1 · `index.html` — My Decks

The front door, and the landing page. Title on screen: **My Commander Decks**.

| Feature | What it does | Why it exists | State |
|---|---|---|---|
| **Three doors above the list** — Add a deck, Build one, Explore cards | The three ways in, in a row above the deck grid, under a heading reading *My Decks* | Add and Build used to sit at the *end* of the grid "on the reasoning that they are what you reach for after looking at what is already there. That holds at six decks and stops holding at sixteen" (PR #73). Explore cards was added at the same time because the card graph had no route from this page but a footer link | Shipped, #73 |
| **Decks tab** | Every deck, ranked by measured score, with commander art, a one-line hook, and how much of its hundred is boxed. Opening one gives the play guide, the shape, the upgrade paths and all hundred cards colour-coded by in the box / on the bench / on order / still to buy | The original replacement for the workbook's per-deck sheets (PR #46) | Shipped |
| **Bench tab** | Spare copies, filtered and sorted through `card-table.js` | At 3,200 owned cards the bench was 1,940 cards in one list — 156 phone screens. It now shows fifty, says *"50 of 1,940 cards"*, opens on what a spare card is *worth* rather than alphabetically, and has one button for the rest (PR #70) | Shipped |
| **Upgrades tab** | The card going in, the card coming out, and why — filterable by deck, rung, status, colour, price band, type and rarity | "Upgrades is what had no home at all" (PR #74). It replaced a To Buy tab that duplicated and disagreed with the Matrix's Shop; `#/buy` now redirects to `matrix.html#shop` | Shipped, #74 |
| **Add a deck** (`import-panel.js`) | Paste a decklist or give an Archidekt link → resolve → preview → measure → save | A pasted deck should be a peer of the six that ship. The parse is the blank line, because Moxfield puts the command zone in its own trailing block and does not label it (`deck-import.js`) | Shipped |
| **Deck sources** (`deck-sources.js`) | Archidekt is fetched; Moxfield and Deckstats are recognised and answered with export-and-paste instructions | Measured, not assumed: Archidekt's API answers 200 with every card carrying its own `oracleCard`; Moxfield answers **403** "to a server and to a browser alike, not an origin-header problem." The module refuses to pretend otherwise | Shipped |
| **The fix-the-names screen** (`card-resolve.js`) | A name that is not a card becomes a question with up to five candidates, each carrying *why* it is offered, plus **Leave it out** as a real answer | It was a dead end: "1 card name could not be matched" and a Save button that saved a 99-card deck the simulator would then refuse to score. Four rungs, cheapest and most certain first: a trigram/word match against the 31,830-card registry with no request at all, autocomplete on the whole name, autocomplete on the part before the comma, fuzzy `named`, then a word search | Shipped, #75 |
| **A link is an answer** (`card-link.js`) | Every unmatched row also takes a URL: a Scryfall card page resolves a printing outright, a link stating a name is tried exactly, a TCGplayer product id is looked up by id, a slug is guessed from the longest reading down and checked before it is believed | "Sometimes the reader knows exactly which card they meant and none of the six is it — it is open in another tab" (PR #76) | Shipped, #76 |
| **Manual cards** (`manual-cards.js`) | A card no lookup can place is kept as a manual card carrying the name asked about, the picture if the link is one, and where it came from. One `/cards/collection` request asks about all of them on every load; exact matches only; the day a card is indexed it stops being manual in every deck holding it | Refusing the card is the same dead end the fix screen exists to remove. A manual card has no rules text, so the deck says so plainly "rather than being one card short and silent about why" | Shipped, #76 |
| **Never offer a card the list already has** | The exclusion holds at every rung, including the fill request that can rename a registry hit on the way out. Basics are exempt | Commander is singleton: offering a card already in the deck builds an illegal hundred | Shipped, #76 |
| **Build a deck** (`build-panel.js`, `deck-generator.js`, `deck-build.js`) | Commander, sixteen themes as chips, six play styles, a budget to aim at, cards to keep. Queries live Scryfall and builds three complete, Tier 3 legal, exactly-100-card rungs | The generator had been dead code since the Choose tab was retired — 983 lines reachable from nowhere (PR #70). The budget is labelled *aimed at, not capped*, because that is what it is | Shipped, #70 |
| **Ranked by what people play with *your* commander** (`edhrec-client.js`) | EDHREC per-commander inclusion and synergy, split against the global rank | `edhrecRank` is *global* popularity: "Sol Ring outranks every card in Magic and says nothing about whether it belongs in an Atraxa deck rather than a Krenko one." Inclusion alone rebuilds the same staples for everybody; synergy alone builds a themed deck with no removal. A commander with no EDHREC page still builds — the weight folds back onto the global rank, asserted card for card | Shipped, #70 |
| **Upload what you own** (`inventory-import.js`, `xlsx-reader.js`) | csv, xlsx or a pasted note, allocated copy by copy across decks in order, remainder to the bench | "The allocation is the hard part, not the parse." `.xlsx` is read by walking the ZIP central directory and inflating the shared-string table with `DecompressionStream("deflate-raw")` rather than telling the reader to export a CSV, which `xlsx-reader.js` calls "asking the user to do the app's job" | Shipped |
| **Archive and Delete** | A **⋯** menu on every deck card. Archive takes a deck off the list and its cards out of the buy total; one click in the drawer brings both back. Delete destroys a deck you added and asks first; the six that ship offer archiving only | Sixteen decks is not a list you hold in your head. Archiving is **one filter in one place** — `rebuild()`, where the catalog is built — so the grid, the ranking, the bench, the buy list and the allocation all stop seeing the deck at once. Delete is not offered for the shipped six "because there is nothing local to delete and a button claiming otherwise would be lying about what it does" | Shipped, #73 |
| **"How it played"** (`measure-report.js`) | The score out of 100 said to be a composite and not a percentage; the receipt (games, seeds, ms, games per second); the nine parts sorted by what each one *cost*; which cards carried the deck and which sat in hand; and **Run it again** on decks you added | See §5.4 and requirement 1 in §7 | In PR #77, open draft, on this branch |
| **Admin** (`admin-menu.js`) | Export, Import, Load default, Reset, Clear session, behind one button | Clear session offers a backup first, and the backup covers exactly the keys the clear destroys | Shipped, #74 |

### 4.2 · `matrix.html` — the Deck Matrix

The build-and-buy half. Four numbered steps: **Compare · Deck · Shop · Game Log**. Title on
screen: **My MtG Deck Builder**.

| Feature | What it does | Why it exists | State |
|---|---|---|---|
| **Compare, as a shelf you stock** | Ten deck roles, fifty researched variants, one pick per role. The fifty live in a library; Compare shows what you have taken out of it, with *"44 of 50 researched variants not on Compare"* one click above | Compare showed all fifty on every visit, in ten groups of five, "and a deck you generated yourself sat below the lot of them behind a divider. That is what *overshadowed* meant" (PR #75). Nothing is deleted — every variant is still in `data/variants.json`, still measured. A role appears once one of its variants is on the shelf *or already picked*, so a browser that had six decks before still has six. A generated deck is always on the shelf | Shipped, #75 |
| **Why This Variant** | A per-variant readout of the four-rung scores with the engine caveat behind an icon | The caveat had been restated verbatim under every readout, "burying the numbers" (`83f2f0`-era work, #7) | Shipped |
| **Deck step** (`deck-page.js`, `slot-model.js`) | One row per slot, expanding in place into its rung ladder plus owned cards that fit, each badged with where the physical copy lives | Keyed on the two things that actually exist: the **slot** (deck + position) and the **card** (merged across decks). Six tabs collapsed into this plus Shop in PR #14 | Shipped |
| **The five rungs a person sees** | Twelve storage arrays collapse into five rungs | `lineup-model.js` owns twelve named ladder arrays chained by `replaces`; `slot-model.js` is the one projection both the Deck page and the Shop read | Shipped |
| **Ready to sleeve** | A strip answering *is it legal* (through `compliance-model.js` at the deck's bracket) and *can it cast itself* (`Slot.manaHealth`: sources and pips weighted by slot quantity, commander excluded from demand) | The two questions you are actually asking with the cards in your hands (PR #28) | Shipped, #28 |
| **Three cards you own could fill this slot** (`Slot.slotFit`) | Up to three owned cards that would do the slot's job, ranked, with the reasoning shown; pressing one files it as a Manual pick | Ranks on type, then what the card is *for*, then cost, with colour identity as a **gate rather than a score** — an out-of-identity card is not a worse fit, it is illegal. The role tests are lifted from `sim-engine.js` and pinned against it across the catalog. Two things keep it quiet: it appears only on a slot you would still have to buy or an empty one, and only offers cards sharing the slot's role | Shipped (BACKLOG item 2, struck through) |
| **Active vs Assigned** | Every slot carries two states: Active (what the deck is counted, shopped and rules-checked as) and Assigned (the reviewed recommendation behind it, moved only by *Make Assigned*) | They start identical and diverge only on a rung change (PR #43) | Shipped |
| **Shop step** (`shop-page.js`) | Every slot re-keyed by card name and merged across decks, scoped to what is still **owed**. Four views: Table, Gallery, Store and Bench, sharing one filter engine and one group-by | A phone landed on the Table — 414 rows, each stacked into a 195px card, 105 screens. A narrow screen lands on **Store** now, decided when Shop is first opened and never again, so choosing the table on a phone keeps the table (PR #70) | Shipped |
| **Store view** | A search box, the seller's own letter groups, one green Buy button per row, a count of what is left to find | Built for a phone at a vendor's booth. "It was already there and already scoped to what is owed. Nothing was wrong with it except that nobody was sent to it" | Shipped |
| **Need / Ordered / In hand** | A three-state flag per row | "Money spent is not a card in hand" (PR #14) | Shipped |
| **Price paid** | A Paid field on every Shop row, in the table, the gallery and the slot pane | "The app knew what a card is worth and had nowhere to say what it actually cost" (PR #23) | Shipped |
| **The pull list** (`data/pull-list.json`, `Slot.withPullList`) | A written shopping document — 68 cards, 70 copies, $124.67, dated 2026-09-06 rev 2 — merged beside the derived rows, its rows tagged gold, with a **List** filter that scopes the page either way | It is not derived and cannot be: fifty-five of its cards are named by none of the six picked decks. Three merge rules: the list decides what is owed; the quantity never shrinks below what the decks asked for; the ceiling is the price, "because the plan's target came off an older sheet and reads $4.95 against a card the list prices at $0.14" | Shipped, #71 |
| **Shop export** (`shop-export.js`) | Three lists for three places: To Buy (printed), Order (TCGplayer Mass Entry), In hand (checked against the shelf) | Price bands with no gap and no overlap, no empty heading, names a vendor's matcher accepts (`tests/shop-export.mjs`) | Shipped |
| **Game Log** (`game-record.js`) | Under-30-second per-game entry between rounds, filtered by deck and result, most recent 25 first, exported as JSON that a GitHub Action compiles into `data/game-history.json` | At 250 games — about two years of weekly Commander — the log was 18 desktop screens and 47 phone screens with nothing to narrow it by. Filters live in module state, not the saved file: "a narrowing is a reading position, not a decision" | Shipped |
| **The read-back** | Real results read against the simulation's prediction, gated on a **Wilson score interval** | Chosen over the normal approximation because at n=12, x=1 the normal interval runs below zero, which is not a win rate. Under five decided games the headline is the interval, not the rate. It also names what it cannot separate: "the log cannot say whether it is the deck, the way it is being piloted, or a pod the simulation was never measured against" | Shipped |
| **Simulate** | Per-variant. Runs the deck's Tuned build against randomized opponents thousands of times, finds where it loses, proposes swaps, re-measures. Polls `sim/status.json` every two seconds on localhost; away from localhost it prints the command and takes the result file through a file picker | The games run on the reader's own computer; no key, nothing uploaded | Shipped |
| **The tour** | Per-view guided tours for Compare, Deck and Shop | Three bugs, each found by the one before it, are recorded in PR #70: a spotlight measuring a detached node, three of eleven steps spotlighting a 6×6 box inside a shut accordion, and Deck/Shop tours narrating ten steps at an empty page | Shipped |
| **Staleness** (`deck-audit.js`) | Says when the number on screen no longer describes the deck on screen | Two distinct cases: *the deck moved* (the selection no longer composes any measured rung) and *the engine moved* (a local re-measurement runs a different engine from the v2.4 sweep). A locally measured score is **never** subtracted from a published one | Shipped |

### 4.3 · `graph.html` — the Card Graph

7,764 Commander-legal cards with rules-derived edges, EDHREC co-play (10,315 `playedWith`
pairs), prices, ownership, facets and six deck overlays. Any of the 31,830 legal cards can be
typed in and looked up live.

| Feature | What it does | Why it exists | State |
|---|---|---|---|
| **One filter state, two views** | A faceted pane driving a card list and an ego-centric graph | Cards are never linked to cards in the model. A card links to the *events* it fires on and causes, so synergy is a path derived at query time — "31,830 cards would be 500 million authored pairs; this is about 130,000 edges" (PR #60) | Shipped |
| **Focus card** | Type a name; catalog cards come up as you type, and the last row is always the way on to the rest of Magic | "The graph is drawn around **one** card, and choosing it meant finding that card in the list." For anything outside the corpus — which is most of Magic — "there was no way in at all: you could not name the card, so you could not ask the question" (PR #72). Suggestions are ordered by how much Magic plays the card, not alphabetically, because an apostrophe sorts before a comma and put *Krenko's Command* above *Krenko, Mob Boss* | Shipped, #72 |
| **A visiting card** | A card outside the corpus is fetched, checked for Commander legality, classified by `card-classify.js`, drawn, marked as a visitor, counted (`7,711 of 7,711 cards · 1 looked up`), survives a reload, and has a chip to drop it | Two things are true of it that are not true of the rest: nobody owns it, and EDHREC co-play was never computed for it, so its connections come from rules text alone and the legend says so. A banned card is refused by name with the reason, because "a banned card in the middle of a Commander graph is a lie the picture cannot correct" | Shipped, #72 |
| **One copy of what a card does** (`card-classify.js`) | The event, role and resource tables shared between the browser and `graph/ingest/02-build-csv.mjs` | The drift between two copies would have been invisible: a typed card sits in the same picture as the baked ones, connected by subtly different rules, and every screen looks right. `tests/card-classify.mjs` re-derives 1,501 cards from `data/cards.json` and holds the result to what `data/graph.json` already committed, seven fields, card for card | Shipped, #72 |
| **The Copilot** (`data/lenses.json`, `sim-lenses.js`) | Findings that state a fact, cite the evidence, and hand you a filter | "The copilot never picks a card and never edits a deck… a lens you disagree with costs one click to ignore and can never quietly change anything." Every lens is generated from a query, so a finding that stops being true stops appearing rather than sitting there being wrong. `lenses.json` is optional: the two fetches race and the cards never wait on the advice | Shipped, #67 |
| **Copilot filters** | Three axes — deck, kind (Warning / Worth a look / Opportunity) and source (card rules vs simulator) — each multi-select, counted the faceted way | The rule that makes them safe to switch on: **nothing is hidden.** What does not match folds into a drawer with its count on the label, "because a filter that hides evidence is one you have to remember you set" | Shipped, #72 |
| **Simulator-derived findings** | Ten lenses computed from `data/deck-ratings.json` deltas, including the negative one — an upgrade that measures *worse* than what you already have | "no invented thresholds and each step of the ladder counted once" (PR #70) | Shipped |
| **Card Click to Navigate Graph** | A labelled on/off pill; off shows the card, on re-centres the graph. The list honours it too | The original ask was a lock toggle. It shipped the other way round first — "a mode is a cost paid on every click… 'What is this card?' is what you do constantly; re-centring is deliberate" (PR #66) — and then became an explicit labelled pill in PR #74 | Shipped, #66 then #74 |

### 4.4 · Cross-cutting

- **`localStorage` is the only store.** `data/*.json` is the app's content — the card
  catalog, the deck plans, the graph — and the app never writes to it. Everything about
  *you* lives in the browser, under keys enumerated one by one in `user-state.js`.
- **Export / Import / Load default / Reset / Clear session.** Export writes one file
  carrying the lot; importing it puts all of it back. Schema 2 added a `myDecks` block after
  PR #70 found that the export left behind the decks somebody added and the collection they
  uploaded — while the button that wrote the file said *"Exported your full state."*
  **Absent is not empty:** a file with no `myDecks` block leaves this browser's decks alone;
  a block that is present and empty clears them. That distinction exists because Load Active
  ships `data/active-state.json`, which has nothing to say about anybody's own decks.
- **Which catalog a browser starts from is a recorded decision**, not an inference
  (`mtg-catalog-source.v1`). See requirement 4 in §7.
- **A second visit downloads nothing.** Every data fetch uses `cache: "default"` and carries
  a `?v=`. `no-cache` was tried and measured at the socket to save nothing, because Chromium
  does not revalidate a `no-cache` response on a later page load. Polling `sim/status.json`
  keeps `no-store`, for the opposite reason: a local process is rewriting that file while the
  page reads it.

---

## 5 · The measurement system, as a product requirement

The simulation is the spine of the product. Every number shown anywhere comes from it, and
no other source of a score exists in the app.

### 5.1 · What it is

`sim-engine.js` (1,370 lines) is a Monte Carlo model of a four-player Commander game. It is
not a rules engine and its own header says so.

### 5.2 · The protocol

| Thing | Value | Where |
|---|---|---|
| Seeds (published) | `20260904, 20268823, 20276742, 20284661, 20292580, 20300499` | `deck-measure.js` (`FIRST_SEED` 20260904, `SEED_STRIDE` 7919); recorded in `data/deck-ratings.json` |
| Games per seed | 20,000 | `deck-measure.js` `FULL`; `data/deck-ratings.json` |
| Preview | 1 seed, 2,000 games | `deck-measure.js` `PREVIEW` |
| Opponent table | `mixed-pod` | `sim/config.json`, `sim/opponents.json` |
| Max turns / mulligans | 16 / 3 | `sim/config.json` |
| Land floor / ceiling | 33 / 42 | `sim/config.json` |
| Max swap-in price | $60 | `sim/config.json` |
| Holdout games | 5,000, on seeds the optimizer never saw | `sim/config.json` |
| Ledger backstop | 15,000,000 games | `sim/config.json` `maxLedgerSimulations` |
| Wall clock | 300,000 ms per invocation | `sim/config.json` |
| Convergence | noise margin 1.0, relative gain 5%, patience 6 | `sim/config.json` |

**Two tiers, deliberately.** A preview is one seed and 2,000 games — fast enough to re-run
on every click and honest about being approximate. The confirm is the published protocol and
is the only run whose number may be recorded. `deck-measure.js`: "Anything that reports a
preview as if it were a measurement is lying by a tenth of a point or so, which is exactly
the size of the differences people care about."

**One measurement path.** `tools/sim/rate-decks.mjs` used to carry its own copy of the seed
loop and the averaging. It now calls the module the browser calls, on the same seeds and the
same game count, and `tests/deck-measure.mjs` requires the published scores back **exactly**,
not approximately — "the same protocol on the same data is deterministic, so it is the same
number."

### 5.3 · What the score means

A **0–100 composite of nine weighted parts**, not a win percentage. The nine, with their
labels as the app prints them: *Wins games*, *Casts its spells* (mana screw), *Draws action,
not lands* (flood), *Gets the commander down*, *Has answers when it needs them*, *Closes the
game*, *Keeps its hand live* (dead cards at turn 8), *Is a deck you enjoy piloting*, *Is a
deck the table enjoys*.

There are three weight sets in the repository and they are easy to confuse:

| Weight set | winRate | screw | flood | commander | interaction | clock | deadCards | fun | podFun |
|---|---|---|---|---|---|---|---|---|---|
| `sim-engine.js` `DEFAULT_WEIGHTS` | 0.30 | 0.15 | 0.10 | 0.10 | 0.10 | 0.10 | 0.05 | 0.10 | — |
| `sim/config.json` `scoreWeights` (Tuned, Max) | 0.35 | 0.15 | 0.10 | 0.10 | 0.10 | 0.10 | 0.05 | 0.05 | — |
| `sim/config.json` `podFunRungScoreWeights` | 0.20 | 0.15 | 0.10 | 0.10 | 0.10 | 0.10 | 0.05 | 0.00 | 0.20 |

The engine's defaults are the fallback when nothing overrides them; the published numbers
were measured with the config's, which is what `data/simulation-summary.json` and
`data/deck-ratings.json` both report. A fourth set, `funRungScoreWeights`, matches the engine
defaults.

**Two rules protect the number from its own display.** The total is computed from the raw
norms, never from norms already rounded — summing rounded values moved D4 Felothar from 71.90
to 71.88, "a published number changing because of how it was displayed, which is the one
thing a breakdown must never do." And `tests/measure-report.mjs` pins that the breakdown adds
up to the score and that rounding never moves it.

**The four rungs.** Each answers a different question rather than spending a different amount
of money:

- **Base** — the cheapest hundred that is still this deck. Measured once, never optimized.
- **Tuned** — hill-climbed on the performance vector at Tier 2, $60 a card.
- **Pod Fun** — the same hundred asked a different question: win rate held **under 45% as a
  hard constraint**, the pod-experience metric weighted, and power floored at 75% of its own
  Tuned build so it can never come out the stronger deck.
- **Max** — hill-climbed again from Tuned's finished hundred, at Tier 3 and $100 a card.

Each rung starts from the hundred the rung below finished at. That is not a detail: two
independent hill-climbs from one list land in different local optima, "which is how a Tier 3
Max rung with twice the budget once came out *weaker* than the Tuned rung it is meant to be
an upgrade of."

**Two guards keep the output honest rather than model-shaped.** A **role census** stops the
search trading away a whole job — it cannot cut below two board wipes or eight ramp pieces
(`sim/config.json` `roleFloors`). And a **strategy floor** holds how much of the deck's own
plan the hundred still carries, measured against the phrases the deck itself repeats rather
than against its declared mechanics label. The label was tried first and is too coarse:
"Control / Interaction" does not describe a theft deck, so a census built on it scored every
one of that deck's actual theft cards as off-theme.

**A card only becomes a cut candidate** when the simulation caught it stranded in hand, cast
too late for its cost, or never cast — never when the games it was cast in were measurably
the games that were won (`sim/config.json` `cutEvidence`, including a `liftVeto`).

**Every run finishes on holdout seeds the optimizer never saw**, and only that comparison
decides the verdict, so a gain that exists solely on the tuned seeds is reported as
`not-confirmed`.

### 5.4 · What it deliberately does not model

`SIMPLIFICATIONS` in `sim-engine.js` is fourteen numbered entries, copied into every result
file the pipeline writes. The load-bearing ones:

- **No stack.** Spells resolve when cast; counterspells are generic interaction.
- **No blocking assignment.** Combat damage is total attacking power weighted by a
  per-creature connect rate (0.85 flying/menace, 0.78 trample, 0.70 otherwise), reduced by a
  toughness-weighted estimate plus flat deathtouch (2) and first-strike (1) deterrence.
- **Opponents are nine parameterised archetype curves** — three power tiers
  (starter-precon, upgraded-casual, tuned-bracket3) and six playstyles (combo, stax,
  aristocrats, voltron, tokens, group-hug) — not simulated decks. Each seat samples a profile
  from a table mix and jitters every number.
- **No politics.** Opponents never team up and never target each other's threats instead of
  ours.
- **Tokens are extra power on their maker**, not separate bodies. Tutors draw the best of
  three. Alternate win conditions and storm score as a large threat, not an instant win.
- **Counters model growth but not storage or transfer.**
- **The fun/participation score is one reasonable operationalization of a subjective idea**,
  not a settled definition.

`docs/mechanics-design-v2.2.md` is the methodology write-up for the counters and
combat-keyword work — why each was modeled as it was, how keywords are detected, and what was
deliberately left out (counter storage/transfer, vigilance, ward, hexproof).

**The consequence, stated plainly in `deck-measure.js`:** the engine "does not model a storm
count, a ritual chain, or winning off a single spell. Measured here: a real mono-red Thor
list — 19 instants, 18 artifacts, 14 creatures, and Mana Geyser, Seething Song, Reiterate and
Jeska's Will among them — scores 34.55 against the six baked decks' 71 to 86, on a 0.8% win
rate. That is not a verdict on the deck. It is the engine saying it cannot see how the deck
wins." **Read the numbers as a comparison between two versions of one deck, never as absolute
odds.**

**Engine boundaries are declared, not smoothed over.**
`data/simulation-summary.json`'s `engineBoundaryNote` states that v2.4 figures are not
comparable with anything published before it, "because the win-rate band alone moves a
dominant deck's score by ten points or more, and that is a change of question rather than a
change of answer." `deck-audit.js` encodes the same rule in code.

**The caveats are published as data, not as prose.** `caveats.inversions` holds 6 entries
and `caveats.podFunOverCeiling` holds 15; `tests/data-integrity.mjs` fails if an undeclared
inversion or ceiling breach ever appears.

### 5.5 · The rule: the app measures, any AI explains

This is a product requirement, and it is stated in two independent places.

`docs/claude-api-evaluation.md` §3: "This app's numbers come from `sim-engine.js` playing
each hundred 20,000 times per seed across six seeds. A model asked 'how good is this deck'
will produce a confident number that is not connected to anything. The division has to be
absolute: **the simulator measures** — scores, win rates, curve, mana, role counts,
compliance; **Claude explains and suggests** — what the deck is trying to do, how a turn
should go, what to look for."

`guide-agent.js` (currently uncommitted on this branch) states the same division as three
rules: **the app measures** (card counts, curve, role counts, mana, the score — all computed
and handed to the model as fact, so the model is never asked for a number it could get
wrong); **the model explains** (prose, and only prose); **the app checks** (every card named
must be one of the hundred that was sent — "not 'a real card' — one of THESE cards", a set
difference that cannot be argued with; a guide naming a card the deck does not contain is
rejected and re-asked, which costs four cents).

Two further consequences follow from having no server:

- **No key can live in the browser.** Any AI feature is generated offline into a committed
  JSON file — the pattern `data/deck-guides.json` already uses — or put behind a small
  proxy. A user-pasted key in `localStorage` is documented as an opt-in and explicitly not
  the default; if it ever ships it must join the enumerated keys in `user-state.js`, because
  "a credential that survives a reset is a bug."
- **A hallucinated card cannot reach the screen.** `data/commander-universe.json` is already
  in the browser — 31,830 Commander-legal cards, 3,411 of them legal commanders — and
  `tools/claude-api-grounding.mjs` runs the gate over a deliberately nasty sample: 16 names
  in, 4 reach the screen, 12 stopped. It blocks *Black Lotus* for legality, not for existing.
  The author of that document got a card name wrong while writing about card names and the
  gate caught it; that anecdote is in the document because it is the argument.

---

## 6 · Data model and provenance

Everything under `data/` is committed content the app reads and never writes: 18 JSON files
plus six source workbooks. **Regenerable** below means a committed tool can rebuild the file
from committed inputs.

| Path | Size | What it holds | Generated by | Regenerable? |
|---|---|---|---|---|
| `data/buy-plans.json` | 8.3 MB | The 50 purchase plans — starting shell plus twelve ladder arrays each — with the card audit, salvage, 99 owned extras and the price-bound audit | `tools/extract_data.py`, then patched by `import_budget_plan.py`, `sim/bake-ladders.mjs`, `sim/build-base.mjs`, `sim/promote-tier3.mjs`, `sim/reprice.mjs` | **No** — its original inputs are absent (§8). Only patchable |
| `data/graph.json` | 7.1 MB | 7,764 cards with rules-derived edges, 10,315 `playedWith` pairs, prices, ownership, facets, six deck overlays | `graph/ingest/07-export-app.mjs --commanders` | Yes, with a local Neo4j and network |
| `data/cards.json` | 3.0 MB | 1,972 audited cards from Scryfall's collection API | `tools/audit-cards.mjs` → `tools/apply-card-audit.mjs`; Game Changer flags by `tools/sim/sync-game-changers.mjs` | Yes, with network |
| `data/commander-universe.json` | 1.6 MB | 31,830 Commander-legal cards, 3,411 legal commanders, seven flat fields each — the registry, not the corpus | `tools/commander-universe.mjs` | Yes, with network |
| `data/variants.json` | 1.25 MB | 10 deck roles, 50 variants: commander, tags, summaries, stage notes, costs, brackets, ranks, facts, rarity, 12 scores, mechanics, pre-rendered detail HTML | `tools/extract_data.py`; kept in sync by `sim/reprice.mjs`, `sim/resync-compare.mjs` | **No** — same missing inputs |
| `data/rung-lists.json` | 1.2 MB | The exact hundred measured for each of 50 variants × 4 rungs, as name+quantity entries summing to 100 | `tools/sim/bake-ladders.mjs`, `promote-tier3.mjs`, `repair-tier2.mjs` | Yes, after a sweep |
| `data/master-v2.json` | 585 KB | The six real decks (D1–D6) and 648 card rows | `tools/import_master_v2.py` from `Treys_MtG_Master_v3.xlsx` | Yes — and `tests/master-regenerates.mjs` requires it |
| `data/card-facts.json` | 477 KB | 668 trimmed Scryfall facts — only the names `master-v2` uses, only the fields the card popup shows | `tools/build_card_facts.py` | Yes |
| `data/active-state.json` | 462 KB | A full app export used as the "Load Active" payload and as the UAT seed. `state` carries 27 keys including `compareSelections` | `tools/apply-deck-master.mjs` / `apply-current-state.mjs` / `apply-app-handoff.mjs` / `import-pull-list.mjs` / `seed-manual-rung.py` | Yes, from the workbooks |
| `data/my-load.json` | 408 KB | The "Load default" payload: a browser snapshot in the app's own export format, "so the file the app writes is the file this reads" | `tools/build-my-load.mjs` | Yes |
| `data/deck-ratings.json` | 400 KB | Measured scores for the six real decks, 6 seeds × 20,000 games, per-part breakdowns, standard errors, three rankings | `tools/sim/rate-decks.mjs` | Yes — and `tests/deck-measure.mjs` requires exact reproduction |
| `data/simulation-summary.json` | 164 KB | The published numbers: 50 variants × 4 rungs, engine v2.4, score weights, the win-rate band, 47 alt-commander cases, three caveat blocks | `tools/sim/bake-sweep.mjs` | Yes, after a full sweep |
| `data/deck-guides.json` | 40 KB | Hand-written play guides for 6 decks, each with an arithmetic `shape` block | Prose by hand; `shape` by `tools/build_guide_shapes.py` | Prose: **no**. `shape`: yes |
| `data/base-rebuild.json` | 39 KB | The Base-rung rebuild record for all 50 variants at a $2 per-card cap | `tools/sim/build-base.mjs` | Yes |
| `data/deck-swaps.json` | 39 KB | The optimizer's recommended swaps for the 6 decks, trimmed to what the viewer shows. Deliberately *not* applied to `master-v2.json` | `tools/build_deck_swaps.py` | **No** — its input `six-optimized.json` is not in this repository |
| `data/pull-list.json` | 39 KB | A written shopping document: 68 cards, 70 copies, $124.67, dated 2026-09-06 rev 2 | `tools/import-pull-list.mjs` from the .docx in `data/source/` | Yes |
| `data/lenses.json` | 19 KB | 10 Copilot lenses | `graph/ingest/08-build-lenses.mjs` | Yes, with a local Neo4j |
| `data/game-history.json` | 245 B | The cumulative game record. **Currently empty:** 0 games, 0 source files | `tools/compile-game-logs.mjs`, run by GitHub Actions | Yes — but there is nothing to compile |

`data/source/` holds six committed workbooks: `Treys_MtG_Master_v3.xlsx` (the current
authority on the six real decks), `MTGDeckDecisionMatrix.xlsx`, `MtG_Deck_Master_v2.xlsx`
(superseded by v3), `MtG_Deck_Flat.xlsx` (carries the resolved formula columns the v2
workbook leaves blank), `Robs_MtG_Current_State.xlsx` and `CardPullList-2026-09-06-rev2.docx`.

**Two catalogs, and they are not the same thing.** The app carries two independent
descriptions of "six decks": the 50-variant catalog (`variants.json` + `buy-plans.json`,
ids `1a`…`10e`), of which six carry a ★ My Build ribbon selected by
`active-state.json`'s `compareSelections` = `{1: 1b, 2: 2c, 3: 3o, 4: 4e, 5: 5o, 7: 7e}`;
and the six real decks in `master-v2.json` (D1 Quintorius, D2 Chulane, D3 Atraxa, D4
Felothar, D5 Shadrix, D6 Krenko). Four commanders agree; two do not — the Matrix's picks
include Betor and Purphoros where the workbook has Felothar and Krenko. The workbook is the
newer of the two. **It is not verified whether that divergence is deliberate.**

**One rule governs generated data.** `master-v2.json` is a build artifact of the workbook,
not a document. PR #69 records why: two sessions were editing this repository and a patch
crossing between them changed 23,203 lines of generated JSON around 96 lines of decisions.
"Exchange the workbook and the code, never the generated JSON" — enforced by
`tests/master-regenerates.mjs`, which regenerates and diffs.

---

## 7 · Requirements that came directly from the user

Each is stated in product terms, with how it was met and where. Quoted text is verbatim from
a commit message, a pull-request body or a module header, as marked.

1. **"What does 51.33 mean? Is that a percentage? What was the deck's performance against the
   different measures? Can I get a better readout? Could I see which cards are
   underperforming / carrying the deck?"** *(quoted verbatim in `measure-report.js` and PR
   #77.)*
   **Requirement:** a score must explain itself — what it is out of, what it is made of,
   how much work produced it, and which cards moved it.
   **Met by:** `measure-report.js` — the number said plainly with the win rate beside it; a
   receipt of games, seeds, elapsed ms and games per second; the nine parts sorted by what
   each one *cost*, each carrying its raw measurement in words; the cards that carried the
   deck and the cards that sat in hand, with lands excluded because "a land is cast the turn
   it is drawn, every time"; and a re-run that shows both numbers, names the parts that
   moved and says whether the move exceeds the combined noise before replacing anything.
   **Where:** the deck page ("How it played") and the import review screen.
   **Status:** in PR #77, open as a draft, one commit ahead of `origin/main` on this branch.

2. **"The fifty variants overshadow any deck I add."**
   **Requirement:** the researched catalog must not bury the reader's own decks.
   **Met by:** Compare became a shelf you stock. The fifty moved into a library;
   `state.compareLibrary` holds the shelf and rides along in exports. A role appears once one
   of its variants is on the shelf or already picked, so a browser that had six decks still
   has six — six lines instead of fifty cards, with *"44 of 50 researched variants not on
   Compare"* one click above them. Nothing is deleted. A generated deck is always on the
   shelf, "because it is the thing you made, and it does not have to ask."
   **Where:** `app.js`, PR #75.

3. **A card name that is not a card must not block the import.**
   **Requirement (from the original complaint): the screen "just blocks and there is no path
   forward."** The import said "1 card name could not be matched" and offered a Save button
   that saved a 99-card deck the simulator would then refuse to score — "a dead end with the
   answer one request away" (`card-resolve.js`).
   **Met by:** a four-rung resolve ladder producing at most five candidates, each carrying
   *why* it is offered, with **Leave it out** as a real answer and search links for a name no
   rung could place; then a link box, because sometimes the reader has the card open in
   another tab; then a manual card, because refusing it is the same dead end again. The way
   onward is disabled until every name has an answer, and a name left out on purpose is
   reported as *"1 name you left out"* rather than as a failure.
   **Where:** `card-resolve.js`, `card-link.js`, `manual-cards.js`. Tests: `card-resolve`,
   `card-link`, `manual-cards`, `friends-deck`. PRs #75 and #76.
   **Note on why this shipped broken:** "no test ever imported a list with a bad name in it."

4. **"When everything is cleared, the bench and all of my state shouldn't be present."**
   **Requirement:** a cleared browser must behave like one that has never opened the app, and
   must stay that way.
   **Met by:** the inference is gone. Clear session emptied the page, and then adding **one**
   deck brought all six shipped decks back with their collection, bench and ownership figures
   — "459 bench copies of someone else's cards for the crime of adding a deck" — because the
   app decided what to show by asking *"has this browser saved anything?"*, and saving your
   deck changed the answer. Which catalog a browser starts from is now a recorded decision in
   `mtg-catalog-source.v1`: Clear session writes `"empty"`, Load default writes `"default"`,
   a browser that has never decided decides once on first boot, and nothing else moves it. My
   Decks and the card graph read the same answer.
   **Where:** `user-state.js`, `viewer.js`, `graph-page.js`. `tests/user-state.mjs` pins the
   clear-then-add-a-deck scenario as reported. PR #76.

5. **"Build cost does not update."** *(quoted as "Rob's report" in `26ba78c`.)*
   **Requirement:** the stage control at the top of Compare must restage the cards, not just
   filter their scores.
   **Met by:** Compare has two stage controls — the page-level Score stage select and each
   deck's own Rank order row — and only the second ever restaged. Both do now, and the Maxed
   column describes the Tier 3 rung it names.
   **Where:** `app.js`, PR #19.

6. **"Put the Where dropdown back."** *(`3a1754e`: "I folded Where into the new pair last
   time. Rob asked for it back.")*
   **Requirement:** the Deck page must be able to answer *which pile is this copy physically
   in* as its own question.
   **Met by:** the Deck page carries all three controls and they compose — **Where** (this
   box, the bench, another deck's box, ordered, to buy, empty), **Status** (about the card),
   **Active** (about the deck's claim on the slot).
   **Where:** `deck-page.js`, PR #35, reverting part of PR #34.

7. **"Give me a way to clear every box at once."**
   **Requirement:** a bulk deselect on the Deck page.
   **Met by:** Select all / Deselect all on their own row under Rank order. "Deselect is what
   was asked for; select is here because a one-way door costing eighty-five clicks to walk
   back is not a control, it is a trap." Both write only which slots are claimed.
   **Where:** `deck-page.js`, PR #37. The reasoning is preserved verbatim in a source comment
   at `deck-page.js:928`.

8. **"I audited all six boxes card by card — make the app say what the audit says."**
   *(`71e200f`: "Rob audited all six boxes card by card and sent the result: one row per deck
   and card, with its status and count, every deck summing to a hundred.")*
   **Requirement:** the app's hundreds must equal the physically audited hundreds.
   **Met by:** selections re-solved so each deck composes the audited hundred, plus the two
   changes needed to represent what the audit contained.
   **Where:** `tools/apply-deck-master.mjs`, `data/active-state.json`. PR #38, extended by
   PRs #40 and #71.

9. **Ticking a box must always move a number, and must not lie about ownership.**
   **Requirement:** the box means *assignment* — this card is the one filling this job — and
   says nothing about whether the card is sleeved, on a truck, or on a shelf in a shop.
   **Met by:** the tick no longer writes the card into the ownership ledger as in-hand;
   assigned-but-not-here got its own term; and the assigned bucket stopped swallowing the
   ordered and to-buy counts, which had produced "0 to buy $0.00" over fifty-seven cards
   still in the post.
   **Where:** PRs #24, #27, #36. `tests/assignment-model.mjs` pins that choosing a rung
   changes Active and nothing else.

10. **"Max should be a real Tier 3 build, not a label over Tuned."**
    **Requirement:** the Max rung must actually spend the Bracket 3 allowance.
    **Met by:** forty of the fifty Max rungs composed byte-identical to the Tuned hundred.
    `tools/sim/promote-tier3.mjs` promotes in-colour, priced Game Changers already sitting in
    each plan: at most three in the finished hundred (counting one that is already the
    commander), checked with `compliance-model.js` on the *composed* list rather than assumed
    from a counter — variant `2a` shipped four before this landed, an illegal deck nothing was
    checking. Each candidate is tried in several slots, and the finished hundred is re-measured
    on a seed the selection never saw, with promotions removed until it holds up.
    **Where:** commit `756e4bb`, then PRs #18 and #19.

11. **"Measure my own six decks on a different brief."**
    **Requirement:** the owner's own Pod Fun rung is searched over his own bench at zero spend,
    with the win rate held under **60%** rather than 45%.
    **Met by:** done as asked, and declared rather than hidden. All six sit above the file's
    45% ceiling and are listed in `data/simulation-summary.json`'s `caveats.podFunOverCeiling`,
    with `caveats.note` explaining the different brief and why five of them out-power their own
    Tuned rung.
    **Where:** `data/simulation-summary.json`. `tests/data-integrity.mjs` fails on an
    undeclared ceiling breach.

12. **"Trade a basic land for a real card in Obuun's and Quintorius's shells."**
    **Requirement:** a shell that wants eleven Mountains and a Command Tower must be
    expressible.
    **Met by:** fixed at the shell, because "a basic-land slot is one slot carrying a
    quantity, so the choice is the whole pile or nothing" — it could not be expressed by
    choosing a rung. `tools/sim/remeasure-variant.mjs` then measures what the swap did without
    re-optimizing the other 99 slots.
    **Where:** `tools/reshell-basic-swap.mjs`, PR #44.

13. **"Minimal tokens, very small cost, but highly reliable/trustworthy"** — the constraint
    given for any Claude feature *(quoted in `docs/claude-api-evaluation.md` §3.)*
    **Requirement:** cheap, and trustworthy in a way that is architectural rather than
    prompt-shaped.
    **Met by:** the evaluation, with two runnable scripts behind every number. The most
    expensive single call is 4.5 cents; fifty how-to-play guides batched is $1.13. Prompt
    caching is measured as inapplicable at these sizes and the document says so "rather than
    recommending it out of habit." Haiku is rejected on accuracy, not price. The trust comes
    from the registry gate and from the measure/explain division in §5.5.
    **Where:** `docs/claude-api-evaluation.md`, `tools/claude-api-cost.mjs`,
    `tools/claude-api-grounding.mjs`, and `guide-agent.js` (uncommitted on this branch).

14. **"We don't need to retain all 50 variants at all."**
    **Requirement:** ambiguous, and read narrowly on purpose.
    **Met by:** read as being about *my load* — the sentence above it — rather than the shipped
    corpus. `data/my-load.json` carries only the six built variants; `data/variants.json` still
    holds all fifty for Compare to choose from. PR #74 says so explicitly and asks for
    confirmation: "Say the word and I will cut the repo copy too."
    **Status: open.** No confirmation is recorded anywhere in the repository. See §8.

15. **"Sitting with the cards in front of me, tell me whether the hundred is legal and whether
    it can cast itself."**
    **Requirement:** the two questions a physical build cannot answer by eye.
    **Met by:** a readiness strip. Legality runs the boxed hundred through
    `compliance-model.js` at the deck's bracket; castability is `Slot.manaHealth`, counting
    sources and pips across the boxed cards weighted by slot quantity (so `Forest x7` counts as
    seven) and flagging a colour whose sources fall under a floor scaled to how much that colour
    is actually demanded, with the commander excluded from demand.
    **Where:** `slot-model.js`, PR #28. `tests/slot-model.mjs` pins the mana rules card-for-card
    against `sim-engine.js` across the whole catalog, because a drifted second copy is worse
    than no readout.

16. **"Make card clicks show the card, and make focusing the graph deliberate."**
    **Requirement:** the ask was a lock toggle — flip a mode, then clicks show the card.
    **Met by:** answered differently first, with the reasoning recorded: "a mode is a cost paid
    on every click… 'What is this card?' is what you do constantly; re-centring is deliberate."
    So tapping a card shows the card and focusing became a button inside the popup. Later
    feedback turned it into an explicit labelled on/off pill, **Card Click to Navigate Graph**,
    which the list honours too — "which it never did."
    **Where:** PR #66, revised in PR #74.

17. **"A load I can undo, and a way to see how long since I exported."**
    **Requirement:** loading a file used to be irreversible, "which is the wrong property for
    the one file that holds every box decision."
    **Met by:** every `applyStatePayload` stashes the prior state first; an **Undo load**
    button appears only when a backup exists; and a header chip reads *exported 2h ago* /
    *never exported*.
    **Where:** `app.js`, PR #28. These are also the interim answer to `BACKLOG.md` item 1.

18. **Still open, from the most recent round of feedback** *(named as such at the foot of PR
    #76 and PR #77):* engine fidelity — storm count, ritual chains and one-card wins — and the
    how-to-play generator agent. The second is in flight on this branch as `guide-agent.js`
    and `tools/generate-guides.mjs`, neither of which is committed yet.

---

## 8 · Open requirements and known gaps

Severity below is about the reader's trust in a number or their ability to finish a build
night, not about effort.

### High — affects every published number

**No creature's printed power or toughness has ever reached the engine.** Verified today:
`data/cards.json` carries power and toughness for **none** of its 1,972 cards — the fields are
not in the schema. `estimatePower` / `estimateToughness` (`sim-engine.js` lines 177–192) do
read `card.power` and `card.toughness` when they are present, so this is a data gap and not a
code one; with the fields absent, both fall through to a guess from mana value:
`max(1, round(cmc × 0.9))`, +1 for trample/double strike/menace, −2 power and +2 toughness for
defender. A one-mana 2/1 is simulated as a 1/1 and a seven-mana 4/4 as a 6/6, in an engine
whose whole business is combat. Every published measurement in this repository — the
fifty-variant sweep, the ladders and the six deck ratings — estimated every creature's size
rather than reading it.

`data/card-facts.json` carries real printed figures but only partially: of its 326 creatures
(by type line), **60** have `power` and `toughness` populated — 62 rows in the file carry a
`power` field at all, two of them not creatures. (`docs/handover-index.md` §12 gives that
figure as 62 creatures, which is the whole-file count rather than the creature count; PR #54's
body says the facts file has the figures "for all 579 names the six decks use", which is not
what the file holds today either.)

This was found while building `tools/sim/rate-decks.mjs`, recorded only in the body of
unmerged PR #54, and written into `docs/handover-index.md` on 2026-09-07. It was deliberately
left alone because fixing it moves every number for a second reason at once. **Anyone
planning to touch scoring should decide about this first.**

### High — the engine cannot see whole archetypes

Storm count, ritual chains and one-card wins are not modeled. A real mono-red list scores
34.55 against the six baked decks' 71 to 86 on a 0.8% win rate, and the engine will say the
same about every spellslinger list it is shown. The mitigation in place is honesty: the
module header says to report a score for an imported deck with the archetype in view "or it
reads as an insult rather than a measurement." Named as still-open feedback at the foot of
PRs #76 and #77.

### Medium — deferred decisions in `BACKLOG.md`

Six items, ordered by how much they would change a build night. Item 2 is shipped.

1. **Autosave to a file you can see.** Everything lives in `localStorage` until Export is
   pressed, and Export is a habit that fails on the night you were concentrating. The File
   System Access API would make the file *be* the state, but Safari and Firefox do not
   support it, and it changes where the truth lives — Load Active, Import and Reset all have
   to mean something coherent against a continuously written file. *Shipped in the meantime:*
   a one-shot undo for a load and a header chip saying how long since the last export.
2. ~~"Three cards you own could fill this slot"~~ — **shipped.** Still open inside it: it
   ranks against the loose pool only, and does not consider what removing a card does to the
   curve or the colour sources (see item 5).
3. **A pull sheet for building at the table.** The Deck page is organised by the deck's
   structure; physically pulling a hundred cards wants them ordered the way they are sitting
   in boxes. Needs a new view with print styles and a second way of ticking that agrees with
   the first.
4. **Copies as things, not counts.** Ownership is a number per card name. Which four Sol
   Rings, what condition, which is foil, which box, which is lent out — none of it can be
   said. Every count in the app reads a number today; making copies real means every one of
   them reads a list.
5. **Curve and role coverage in the readiness strip.** The strip answers *is it legal* and
   *can it cast itself*, not *is it a functioning deck*. `sim-engine.js` already classifies
   every card into roles and `tests/lineup-compliance.mjs` already asserts floors against
   them — the numbers are computed and nothing shows them. The obstacle is that `sim-engine`
   is a Node-oriented module of 1,370 lines, so it means shipping it to the browser or
   maintaining a second copy, and this repository has already paid for one of those.
6. **What changed since I last sleeved this deck.** Needs a remembered "as sleeved" snapshot
   per deck, which is new state with its own lifecycle.

### Medium — records that stop

- **The Game Log's read-back has never had real data to read.** `data/game-history.json` is
  an empty shell — 0 games, 0 source files — and `data/game-logs/` holds only a README. The
  whole Wilson-interval path is tested but never exercised on a real season.
- **`data/deck-swaps.json` names a source file that is not in the repository**
  (`six-optimized.json`). Its generator comment says the full lists "stay in the scratchpad
  deliverable for anyone rebuilding"; that scratchpad is not here.
- **`data/variants.json` and `data/buy-plans.json` cannot be regenerated from scratch.**
  `tools/extract_data.py` reads two HTML files one directory above the checkout that are not
  present. The files can only be patched by later tools.
- **Forty-four of the fifty variants have no play guide.** `guideFor()` returns null and the
  panel is simply absent. `docs/claude-api-evaluation.md` §6 proposes the concrete next step
  — about $1, reviewed as a diff — and it has not been taken. `guide-agent.js` and
  `tools/generate-guides.mjs` exist uncommitted on this branch.

### Low — ambiguity and drift

- **The two catalogs diverge and nobody has said whether that is deliberate** (§6). Two of
  six commanders differ between the Matrix's ★ picks and `master-v2.json`.
- **"We don't need to retain all 50 variants at all" was never resolved** (requirement 14).
  The narrow reading shipped and the question is still open in PR #74's body.
- **Documentation drift.** Several counts in prose lag the data. As of this writing:
  `tests/uat/journeys.mjs`'s header still says "the twenty-three Node suites" in its skip
  note; `tests/import-wiring.mjs:255` still says the graph renders 7,710 cards where
  `data/graph.json` holds 7,764; and `docs/handover-index.md` §12's drift table lists several
  items that the commit which introduced it (`1fd35dd`) had already fixed — the 7,710 counts
  in `README.md`, `tests/uat/README.md` and `graph/README.md`, and the
  `caveats.note` find-and-replace artifact in `data/simulation-summary.json`, which now reads
  correctly.
- **`docs/handover-index.md` §8 describes "an out-of-sequence #80" among the merged PRs.**
  There is no pull request #80 in this repository (the API returns 404). `756e4bb` is an
  ordinary non-merge commit whose subject happens to carry a `(#80)` suffix.
- **`import-quintorius-owned.html`** is a standalone one-shot migration page that nothing
  links to. Kept for a browser that never ran it.
- **Two workbooks in `data/source/` are mode `600` where the rest are `644`.** Not verified
  whether that is deliberate.
- **GitHub Pages is clearly the intended host** — the OG and Twitter image tags name
  `https://minorrob.github.io/mtg-deck-matrix/` and `.nojekyll` is present — but it is **not
  verified** that it is currently serving.

---

## 9 · Quality bar

These are the repository's actual standards, each with what enforces it.

**Every module states why it is the way it is.** Most files open with fifteen to thirty lines
naming the problem, the options, the measurement and what was rejected. `card-resolve.js`
explains why not TCGplayer. `deck-sources.js` records that Moxfield answers 403 "to a server
and to a browser alike" — measured, not assumed. `docx-writer.js` explains why a ZIP writer
was hand-rolled. `xlsx-reader.js` explains why "just export as CSV" is asking the user to do
the app's job. `deck-audit.js` explains why a re-run measures two hundreds rather than one.
There is no linter for this; the convention holds because the reasoning is the only place
some of these decisions are recorded.

**Every behaviour has a test.** 32 committed Node suites under `tests/` (33 on disk at the
time of writing, the extra being the uncommitted `guide-agent`), using only Node built-ins.
`runtests.sh` runs them all and its own header explains why a shell loop will not do: the
obvious one-liner exits 0 whatever happens, because the exit code belongs to the last `echo`.
"That happened, and something got pushed on the strength of it."

Notable guarantees, each with the suite that holds it:

| Guarantee | Suite |
|---|---|
| The in-browser measurement path reproduces the published `deck-ratings.json` numbers **exactly**, not approximately | `deck-measure` |
| The score breakdown adds up to the score; nothing exceeds its weight; rounding for display never moves the total | `measure-report` |
| `master-v2.json` is still a build artifact of the workbook, regenerated and diffed | `master-regenerates` |
| The card vocabulary is re-derived from `cards.json` and checked field-for-field against what `graph.json` already committed — evidence, not self-consistency | `card-classify` |
| Page-side mana and role rules are pinned card-for-card against `sim-engine.js` across the whole catalog | `slot-model` |
| A backup covers exactly what a clear destroys, in both directions | `user-state` |
| Every rung of every variant composes through `lineup-model.js` to the exact hundred that was measured | `lineup-compliance` |
| The Game Log says "cannot tell" rather than printing a difference | `game-record` |
| The browser never calls an API to simulate; the app source never names `api.anthropic.com` | `sim-engine` (line 428) |
| A real handed-over 100-card export goes in clean, end to end | `friends-deck` |

**Browser journeys cover three personas at two screen sizes.** `tests/uat/journeys.mjs`
drives a first-timer with empty storage, somebody a year in with ten added decks and 3,200
cards, and somebody leaving with their data — 21 distinct journey labels at 1400×950 and
390×780. Every step of every journey is additionally checked for four things: no horizontal
overflow, nothing under a 9.5px type floor, no control without an accessible name, and
nothing that looks selected without saying so. Those four live in `healthy()` rather than in
journeys of their own "because these are properties of every screen and a journey that visits
one is the cheapest place to check it." Scryfall is stubbed from recorded answers, so a
journey never fails because somebody else's site was slow.

**A changed file gets a changed `?v=`.** Every script, stylesheet and data file is fetched
with a `?v=N` and through the browser cache, which is what makes a second visit cost zero
requests. The whole arrangement rests on one rule, and it had broken twice invisibly before
anything checked it — `deck-generator.js` was rewritten and `index.html` bumped to `v=5`
while `matrix.html` stayed at `v=3`, so anybody who had opened the Matrix kept the old
generator indefinitely with nothing on screen to say so. `tests/asset-versions.mjs` holds
every versioned asset to two rules: **one file, one version** across every page, and **a
changed file has a changed version**, checked against a committed content hash in
`tests/fixtures/asset-versions.json`. `node tests/asset-versions.mjs --update` re-records
after a legitimate bump and refuses to record a changed file whose version has not moved.

**A published number must reproduce exactly.** `tools/sim/bake-ladders.mjs` refuses to write
unless composing every rung through `lineup-model.js` reproduces the exact hundred the sweep
measured — "because a published score belonging to a deck other than the one printed
underneath it is the failure this whole pipeline exists to avoid." `tests/deck-measure.mjs`
requires the six published scores back to the last place. `tests/data-integrity.mjs` fails on
an undeclared inversion or ceiling breach, and holds the README's own suite list and count to
the contents of the `tests/` directory.

**The README is treated as load-bearing.** In a repository with no build step and no
`package.json` it is the only place that says what to run, so `tests/data-integrity.mjs`
asserts that it names every suite, states the right number of them, and does not name a tab
this app retired.

---

## 10 · Release history

Merged pull requests in order, oldest first. Titles are the repository's own and are already
product statements; the line beside each says what changed for the reader. PRs #1–#8 predate
the numbered-merge convention. **#2**, **#54** and **#77** are open drafts and are listed
separately at the end.

| PR | Title | What changed for the reader |
|---|---|---|
| #1 | Step 0 Choose deck builder and deck simulation loop | The first deck generator and the Monte Carlo engine, behind a Choose tab |
| #3 | Import Win/Fun/Alt-commander build ladders | The three ladder families came out of the decision-matrix workbook and into data |
| #4 | Win/Fun/Alt-commander ladders across the app | Those ladders reached the buy screens, the comparison view and the live-deck list |
| #5 | Fix count/cost coherence, consolidate ladder groups, widen desktop | Counts and costs that disagreed with each other were reconciled |
| #6 | Per-card build guidance and purchase-history restore | Each card said why it was there; a purchase history could be restored from an upload |
| #7 | Merge the simulation engine, 4 new decks, engine mechanics, alt commanders | The engine merged into the main line; +1/+1 counters and combat keywords modeled; 44 alternate commanders evaluated |
| #8 | Distinct commanders per variant, honest rung measurement, ladder merge | Every variant got its own commander, and each rung was measured as the list its tab actually shows |
| #9 | The four-rung rebuild: measured ladders for all 50 variants | Base / Tuned / Pod Fun / Max, all fifty variants, 10.8M games, measured hundreds baked back into the buy plans and every cost re-summed |
| #10 | Six tabs, a Cards table, Salvage intake, and a re-checked slate | An Excel-shaped Cards table, a way to take newly acquired cards in, and one re-checked deck pick |
| #11 | Fill the Enhance and Max rungs, correct 20 Game Changer flags | Forty variants had rendered an empty Max tab; the Game Changer list was reconciled against Wizards' own |
| #12 | Show the card being replaced, and sort Calibrate rows alphabetically | A ladder purchase is a trade, so both cards are shown at a readable size |
| #13 | Refresh active-state.json from the 2026-08-26 purchase checklist | Ownership marks refreshed from a hand-confirmed export |
| #14 | Collapse four screens into two pages: Deck and Shop | Six tabs became four, keyed on the two things that exist: the slot and the card |
| #15 | Carry Compare's rung into Deck, and let one click set every slot | The rung chosen on Compare seeds the Deck page once, and never overwrites a later pick |
| #16 | Keep a slot in place when its rung changes | Picking inside an open slot no longer appeared to slam the pane shut |
| #17 | Rank order ticks the box for what you own, and mana renders as symbols | Choosing a rung rebuilds the box ticks with it |
| #18 | Max is a Tier 3 build now, and Deck and Shop have their own tours | The Max rung actually spends the Bracket 3 allowance; the tour stopped narrating retired tabs |
| #19 | Compare's Maxed column now describes the Tier 3 rung | "Build cost does not update" — both stage controls now restage |
| #20 | A Manual rung for hand-added cards, and a header that folds on a phone | A card can be put in a slot by hand; the sticky header stopped taking a quarter of a phone screen |
| #21 | Send a hand-added card back to the bench | A Manual card could go into a slot and never come out |
| #22 | Offer every loose owned card, and stop asking for 146px art | A card sitting unused in another deck became visible everywhere, not only in Salvage |
| #23 | Price paid, an intake on the Bench, and search on the Deck screen | The app could say what a card is worth and had nowhere to say what it cost |
| #24 | Make the box mean assignment, so unticking gives the card its status back | The tick stopped claiming a card was in hand |
| #25 | Count cards, count copies, and count lands by the card in the slot | Three separate ways the Deck header counted the wrong thing |
| #26 | Basics are a pool of eighty, and the header's numbers add up | Basics became a shared pool rather than a per-deck count |
| #27 | Give assigned-but-not-here its own term, so ticking always moves a number | Ticking an ordered or unbought card used to move nothing |
| #28 | Show whether a deck is legal and can cast itself, and make a load undoable | The readiness strip, the mana model, Undo load, the export-age chip, and `BACKLOG.md` |
| #29 | Suggest cards you own for a slot, and make the phone Shop about buying | `Slot.slotFit` — three owned cards that would do this slot's job, with the reasoning shown |
| #30 | Replace active-state.json with a 2026-08-27 export | The fastest hundred in each box: Tuned with owned cards substituted wherever Tuned would have made you buy |
| #31 | Fill the Deck boxes in from the selection, and count basics against what you own | A deck whose hundred is settled stopped claiming nothing |
| #32 | Read the ordered manifest, so a card in the post is not a card in the box | 126 paid-for-not-received cards stopped reading as in hand |
| #33 | Rebuild ownership from the On Hand / Ordered sheet | Ownership became one explicit `{inHand, ordered}` per card |
| #34 | Split Where into Status and Active | One six-value dropdown mixed two different questions |
| #35 | Keep Where as its own dropdown alongside Status and Active | Put back on request; all three now compose |
| #36 | Stop "assigned" swallowing the ordered and to-buy counts | "0 to buy $0.00" with fifty-seven cards still in the post |
| #37 | Bulk claim, sort by name or cost, and show the price you actually paid | Select all / Deselect all, and a Paid figure that survives |
| #38 | Make the app say what the audit says | The hundreds re-solved to match a card-by-card physical audit of all six boxes |
| #39 | Put 41 new cards on the bench, and offer them where they would do a job | Newly acquired cards arrive resolved and are offered on slots they would fit |
| #40 | Rebuild from the audited workbook, add a Store view, and price every row at what it cost | The Store view for a phone at a booth |
| #41 | Cut the gallery tile to three rows, fix the Bench on a phone, collapse the Deck panels | Density work driven by measured screen heights |
| #42 | Fold away an open slot's second half, and cut the gallery tile to two rows | An open slot went from 1591px to 939px |
| #43 | Import the handoff workbook, and give every slot an Assigned card beside its Active one | Active and Assigned became two states that diverge only on a rung change |
| #44 | Trade a basic for a real card in Obuun's and Quintorius's shells | A basic-land slot carries a quantity, so the swap had to be made at the shell |
| #45 | Make the Shop's status describe the row you are looking at | A filtered Shop showed two cards where seven were owed |
| #46 | Replace the site with a three-tab viewer for the six real decks | `index.html` became My Decks; the comparison app moved intact to `matrix.html` |
| #47 | Open any card in a flip popup, and rework the app for a phone | Any card is inspectable anywhere |
| #48 | Drop the workbook-conflict notes from the deck page | The import's conflict notes had served their purpose |
| #49 | Put the commander in the spare stat cell, and price every bench row | Every bench row carries a price |
| #50 | Fix seven faults in the simulation engine | Ramp read as not-ramp on 8 of 8 green staples; win rate saturated at 50%; sacrifice did not exist. Every score fell; the ranking held |
| #51 | Re-measure the six decks on the repaired engine | The published six-deck numbers caught up with #50 |
| #52 | Show the optimiser's recommended changes on each deck page | The swaps the optimizer found became visible where the deck is |
| #53 | Stop reading reminder text as rules text, and re-measure | Reminder text in parentheses has no rules meaning and was being read as rules; 138 cards changed classification |
| #55 | Put the six real decks into the comparison app | The six real decks and the fifty-variant catalog met on one page |
| #56 | Rename slots 3 and 7 to fit the decks that are actually in them | Two role names no longer described the decks that had moved into them |
| #57 | Correct deck 8's mono-color claim and pin the count | Seven of fifty variants are mono-colour, in five different roles |
| #58 | Stop the commander tile clipping its own label | "COMMANDER" had been rendering as "COMM" at every desktop width |
| #59 | Add a back link from the matrix app to the viewer | The only way home had been the browser button |
| #60 | Add the card graph: Neo4j model over every Commander-legal card | Cards link to events, not to cards, so synergy is a path derived at query time |
| #61 | Add EDHREC as the graph's second synergy signal | What people actually play alongside a commander, beside what the rules text says |
| #62 | Correct the graph quickstart | Three steps in the documented sequence would have failed on a first run |
| #63 | Add the graph control plane: faceted pane, card list, ego-centric graph | Neo4j became the workshop; `data/graph.json` became the product |
| #64 | Extend EDHREC to all 49 variant commanders | Co-play edges went from 1,586 over six commanders to 12,929 over forty-nine |
| #65 | Price from every printing, not the one row oracle_cards happens to carry | Four staple shocklands had read as free |
| #66 | Tapping a card shows the card; focusing the graph is a button inside it | The frequent act became free; the deliberate one became explicit |
| #67 | Add the copilot layer: findings that hand you a filter | Findings that state a fact, cite the evidence, and hand you a filter — never edit a deck |
| #68 | Fix three extraction gaps, and the colour filter that hid every artifact | A colour filter had been excluding every colourless card |
| #69 | Guard master-v2.json as a build artifact | Exchange the workbook and the code, never the generated JSON |
| #70 | Build decks from nothing, and hold up on the first visit, at collection scale, and on the way out | The generator got a front door; the browser-journey harness arrived with the first-visit and 3,200-card personas; two pages stopped waiting on unreachable hosts; the export stopped leaving behind the part somebody typed in |
| #71 | Reconcile the collection, scope the Shop to what is owed, and put the pull list in it | The Shop went from a claimed 263 cards / $315.28 to a real 17 / $80.14 |
| #72 | Name the card you came to look at, and read the Copilot for tonight | Any of the 31,830 legal cards can be typed in; the Copilot filters on three axes, folding rather than hiding |
| #73 | Three doors above My Decks, and a way to put a deck down | Add / Build / Explore moved above the list; Archive arrived |
| #74 | One header, one table, and a browser that starts empty | One shared header, one table engine behind three lists, one buy list, and a first-time browser with no decks in it |
| #75 | Compare is a shelf you stock, and a bad card name is a question | The fifty moved into a library; an unmatched name became a question with candidates |
| #76 | A link is an answer, a clear stays cleared, and a friend's deck goes in clean | A URL resolves a card; a clear stays cleared; a real handed-over deck pinned end to end; the Claude API evaluation |

**Open drafts.** **#2** "Sim engine v2: opponent diversity, a fun signal, combat fidelity" —
its work reached `main` through the #7 merge. **#54** "Stop the engine reading reminder text
as rules text" — its work reached `main` as #53; its body is one of the most detailed
measurement write-ups in the project and carries the power/toughness finding in §8. **#77**
"The score, and what it is made of" — `measure-report.js` and `tests/measure-report.mjs`, the
current branch's one commit ahead of `origin/main`.

---

## Sources

- `docs/handover-index.md` — the technical map, written 2026-09-07 against commit `8f0a0c0`
- `git log origin/main` — 208 commits, 62 carrying a merged PR number. Note that local `main`
  is stale at `f519b8e` (#71) while `origin/main` is at `c0686fe` (#76)
- Merged pull-request bodies on `github.com/minorrob/mtg-deck-matrix`
- `BACKLOG.md`, `docs/claude-api-evaluation.md`, `docs/mechanics-design-v2.2.md`,
  `docs/simulation-refresh-instructions.md`, `docs/handover-prompt.md`
- `tests/uat/README.md`, `runtests.sh`, and the module header comments throughout the
  repository root
