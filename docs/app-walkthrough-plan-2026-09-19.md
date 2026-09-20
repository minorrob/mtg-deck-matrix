# CrankMagic workshop — walkthrough findings and the plan to resolve them

**Date:** 2026-09-19
**Source:** a live walkthrough of minorrob.github.io/mtg-deck-matrix in Rob's Chrome at 1136 px, against
his real library (6 decks, revision 24), by a separate session. Findings are that session's; the root
causes below were re-verified against the source at `main` `3a03f2a` by this one, and each says how
sure it is.
**Companion:** `game/docs/readiness-plan-2026-09-18.md` is CrankMagic Online (the play edge). This
document is the workshop (create, refine, acquire, build). `docs/ACTIVE.md` says which is in hand.

---

## 1. How this fits the loop

```
   create ──▶ refine / explore ──▶ acquire ──▶ build ──▶ PLAY ──┐
     ▲                                                          │
     └──────────────── iterate the hundred ◀────────────────────┘
```

D1 breaks the loop at its first edge: **no deck can be created**. Nothing else in this document
matters to a new user until that is fixed, which is why it is the first item and why it goes ahead
of the Online work in the sequence (§4). The count inconsistency (§3, W.4) is the second structural
problem: five surfaces print five different totals for one library, so the workshop cannot be
trusted to say what you own.

## 2. Defects — verified root causes and resolutions

Each row: the finding, what the source actually says, the fix, the proof the fix must ship with
(a test that was red first, and a rendering where the screen changes), and the size.

| ID | Finding | Verified root cause | Resolution | Proof | Size |
|---|---|---|---|---|---|
| **D1** | New deck → Create / Import / Lab do nothing; "dialog is not defined". | **Confirmed.** `crankmagic-decks.js` destructures `modal` from `C` but not `dialog` (line 3); `wizard-create`, `wizard-import`, `wizard-lab` (lines 352, 382, 395) call `dialog.close()` on a name that does not exist in that closure. `modal()` returns the dialog element (`crankmagic-app.js:86`) and `actions.close` exists (`:321`), so both are the idiom. | Close through `C.$('#cm-dialog')` or the returned handle, as `crankmagic-lab.js:487` and `crankmagic-exchange-ui.js:33` already do. | A Node test that loads the decks feature with a stub `C` and fires `wizard-create`: red with `ReferenceError`, green after. Rendering of the wizard's three doors. | S |
| **D2** | Play → "?" shows `undefined`. | **Confirmed.** `page-help` reads `HELP[key].title` and `.body` (`crankmagic-app.js:319`); every other page registers `{title, body}`, but `crankmagic-game.js:1706` sets `C.HELP.game` to a bare string. | Register `{title: "Play a game", body}`. | Test: every `HELP` entry has a string title and a body. Red on `game`. | S |
| **D3** | Tab title and menu show U+FFFD; three shell caches and two data caches coexist. | **Confirmed in part.** `crankmagic-sw.js` prunes caches only on `activate` (line 58) and never calls `skipWaiting`, so a new worker waits until every tab of the old one closes; until then the old worker serves its (in this case corrupted) shell and its caches survive. The corrupted bytes themselves came from a deploy that is already superseded; the network copy is correct. | Do **not** add a blind `skipWaiting`: a page loaded on the old pins would then fetch old `?v=` URLs from a worker whose lists no longer carry them. Instead: on `updatefound` show one line, "A new version is ready. Reload.", and post `skipWaiting` to the waiting worker on the click; prune on activate as today. Rob: one hard reload clears tonight's caches. | Test in `tests/service-worker.mjs`: the worker never calls `skipWaiting` unprompted, and the message handler does. Rendering of the reload line. | M |
| **D4** | Log a game defaults to tomorrow's date at 10 pm ET; card dialogs print a next-day price snapshot. | **Confirmed.** `crankmagic-decks.js:516` (Log a game), `crankmagic-app.js:322,343` (backup names), `crankmagic-collection.js:824,1140` (exports) all use `toISOString().slice(0,10)`, which is UTC. `card-catalog.js:174` stamps `priceUpdated` the same way. | One `today()` in `collection-model.js` that returns the local calendar date; every user-facing date uses it. Data stamps (`priceUpdated`, report `importedAt`) stay UTC, because they are compared across machines. | Test with a fixed clock at 2026-09-19T23:30 New York: `today()` is `2026-09-19`. Red against the UTC slice. | S |
| **D5** | Sidebar "Your cards. Your library." block overlaps Explore and Play after scrolling. | **Plausible.** `.cm-sidebar nav` is `position: sticky; top: 18px; z-index: 3` inside a flex column with the note after it; the sticky nav slides over the note as the column scrolls. Not reproduced at this width yet. | Make the note sticky to the bottom of the sidebar, or drop the nav's stickiness below the height where both fit. | Rendering at the walkthrough's height, before and after. | S |
| **D6** | "The hundred at a glance" legend overlaps the type-count column. | **Not yet located** (`.cm-glance-grid`, `crankmagic-decks.js:222`). | Read the grid; likely one track holds two absolutely sized children. | Rendering before and after. | S |
| **D7** | Every modal draws a horizontal scrollbar with nothing to scroll. | **Confirmed.** `#cm-dialog` is `overflow: auto` with `padding: 25px`, and `.cm-dialog-head` pulls itself out to the edges with `margin: -25px -25px 20px` (`crankmagic.css:17, 1284`); the head is wider than the scroll container's content box, so the box scrolls sideways by exactly the padding. | `overflow: hidden auto` on the dialog, or size the head with `width: calc(100% + 50px)` inside `overflow-x: clip`. | Geometry check in `tests/browser-geometry.mjs`: a help dialog's `scrollWidth` equals its `clientWidth`. Red today. | S |
| **D8** | Card dialog opens pre-scrolled; image clipped under the sticky title. | **Plausible.** `showModal()` focuses the first focusable element; the head's close button is first in DOM order, so the scroll must come from an `autofocus` or an explicit `focus()` in the card body. | After `showModal()`, `dialog.scrollTop = 0`; find and remove the body focus. | Geometry check: the card dialog's `scrollTop` is 0 after open. | S |
| **D9** | Compare checkbox ticks are dropped ("A save is already in progress") and persist across reloads. | **Confirmed.** The tick runs a `preferences` command through `commit()` (`collection-model.js:606`), and `commit()` refuses while one is in flight (`crankmagic-app.js:121`). A view selection is not a library change. | Keep compare selection in memory (or `sessionStorage`), never through `commit()`. | Test: two ticks 100 ms apart both register; `commit` is not called. | S |

## 3. One number per concept (W.4)

The walkthrough found five totals for one library. They are not all wrong; they are different
concepts printed without their names, from different functions:

| Surface | Printed | Concept it is actually counting |
|---|---|---|
| Sidebar / Library tab | 868 | identities (distinct cards) with any record |
| List view | 1,078 records | lots (a card × a status), so one card three times |
| Sheet view | 808 cards · 1,249 owned | identities with owned copies · owned copies |
| Table view | 1,549 copies · 1,078 rows · 289 ghosts | copies including reservations · lots · unowned placeholders |
| Stat pills | 525 · 589 · 724 | identities by placement |

**Resolution.** One vocabulary, in the glossary and on the screen: **card** (an identity), **copy**
(one physical card), **row** (a lot: a card in one status), **placement** (deck box, bench, on order,
to buy). Then one function per number — `M.totals(state)` returning `{cards, copies, rows, byPlacement}` —
and every surface prints from it with its noun. The price disagreement (buy list $0.67 against
dialog $0.52) is the last place two price sources meet; both must read the catalog through
`marketPriceOf`. The "8 days old" line is the graph's age, not the catalog's, and should say so.

Proof: a test that renders each surface's header from one fixture and asserts the same `copies` and
`cards` appear wherever those words appear. Size M.

## 4. Sequence

The Online tracks (readiness plan §9) and this document share one queue. Ordered by what blocks
what, then by size.

| Step | Work | Why here |
|---|---|---|
| **W.1** | D1, D2, D4, D9 — the four verified, small code fixes | D1 blocks the create edge for everyone; the other three are minutes each and corrupt trust (a wrong date on a logged game, a dropped tick). Before C.1. |
| **C.1** | Unknown-card swap UI (Online) | Already scheduled; the data is ready. |
| **W.2** | D3 — the reload prompt for a waiting worker | The encoding leftover is gone with one reload, but the mechanism will bite on every deploy until fixed. |
| **W.3** | D5–D8 — the four CSS defects, each with a geometry check | One pass, one rendering per fix. |
| **W.4** | One number per concept (§3) | The second structural problem. |
| **E.4** | Server-side 99-engine repair loop (Online) | |
| **W.5** | P0 flow: deck header primary by state; fold the Explore and Acquire tabs | The "row-primary" idea from the 09-11 review, applied at deck level. |
| **W.6** | P1 flow (§5) | One at a time, each rendered. |
| **C.6** | Visible first-player roll (Online, needs a Forge build here) | |
| **W.7** | P2 polish (§5) | |

## 5. Flow findings, with their resolutions

**P0**

- **Deck header primary.** Choose the primary from state: `toBuy > 0` → Buy list (n); `readyToAdd > 0` →
  Ready to add (n); else Log a game. The counts already exist on the deck tile.
- **Explore and Acquire tabs.** Remove both. Acquire's content is the Progress/Cost panel's; Explore is
  the header's Trace button. `DECK_TABS` (`crankmagic-decks.js:5`) goes to three.

**P1**

- **Deck overview length.** Strategy and SWOT behind one disclosure each, closed by default; the
  left column after "About the commander" gets the deck's key cards with art (the guide already names
  them), or Strategy goes full width.
- **Library List view.** Group rows by card so Adarkar Wastes is one row with three status chips;
  show card art on hover; cut the eleven status words to the four placements plus "watched".
- **Library toolbar.** Twelve controls above the first row. Keep Add, Import, Search, View; the rest
  behind More. "Back to Play Space" only on the Table view.
- **Table view.** Open the drawer on the Bench pile by default; hide empty trays until a card is
  dropped on the table.
- **Discover side panel.** Two-row header (name, then pills); let the panel be 40 px wider than the
  longest commander name in the library.
- **Discover deck-gap dialog.** Delete the engineering sentence.
- **Upgrades "Working list".** Offer "Flag as option" on this page, in the row, rather than sending the
  reader to Cards.
- **Play lobby seat card.** "No deck yet" once. (`seatBoxHost`, `crankmagic-game.js`.)
- **Log a real game.** Three fields open (outcome, what won it, note); the other seven behind "More
  detail". The record keeps every field.
- **One name for Explore.** Nav, page, deck tab and header button all say **Explore**; "Discover" and
  "Trace" become section names inside it.

**P2**

- Compare dialog: keep the column-header row visible under the sticky title (second sticky row).
- Rules text: render mana symbols on every line, and hybrid pips as pips (`C.mana` already does this
  for the first line).
- Deck tile "···" menu: Buy list and Log a game in place of Open deck.
- "Show archived": hidden until an archived deck exists.
- "?" help: one sentence and a link to the tour, not a paragraph.
- User Functions: two groups, "Your data" (status, read-only) and "Actions".
- Sidebar highlighting D4 on D1: reproduce first; likely the subnav reading a stale route.
- Discover's 20 MB first load: a progress bar with the two file names, from the fetch's
  `Content-Length`.

## 6. What the walkthrough said to keep

The Decks home tiles, the deck header shape, Make the change, the card dialog content, the Upgrade
Path table, the Discover graph, the seated Play lobby, the New deck wizard's three doors, and the
tour dialog. These are the model; changes above should look like them, not the other way round.

## 7. Definition of done, per item

1. A test that was red before the fix, named in the commit.
2. A rendering in chat when the screen changes (Rob's rule of 2026-09-19), before and after where
   the change is meant to be invisible.
3. `PAGE_BUDGET_REQUIRED=1 GEOMETRY_REQUIRED=1 bash runtests.sh -q` green, browser suites driving Chrome.
4. Pins moved for every file that changed; the fixture re-recorded by `tests/asset-versions.mjs --update`.
5. No touch on `data/deck-ratings.json`, `data/simulation-summary.json`, `sim/`, or `data/deck-guides.json`.

## 8. State the walkthrough left behind

The Play lobby has D1 seated and Seat 2 set to AI ("Clear the table" restores); D1 and D2 have their
compare boxes ticked (a saved preference until D9 lands). Nothing in the library changed.

---

## 9. The UAT of 2026-09-19/20, worked in

**Source:** `CrankMagic-UAT-2026-09-20.xlsx` (Rob's Downloads), a separate session's run of 59 cases
over Build, Acquire, Manage and Play against the live app and Rob's real library, at 1568 px. W.1
(#278) landed mid-run and was re-tested: B-01, B-02, B-03, B-23 and P-04 went from Fail to Pass.
Results: 19 pass, 5 pass after fix, 21 partial, 11 fail, 3 not run. Twelve S2 findings are open,
no S1. The run changed the library (a Yuriko draft, a Zoraline group and deck, a purchase, an order,
a logged game, a lobby AI deck); Rob chose to keep them.

The remediations below were re-verified against `main` at `f9a6e4f`, the commit the run cites.
Where this document disagrees with the UAT's recommendation it says so.

### 9.1 Two corrections to what this document said earlier

- **D3 / M-11.** The walkthrough said the network copy of `index.html` was correct and the U+FFFD
  bytes lived only in old worker caches. **Wrong.** `index.html` on `main` carries three U+FFFD
  bytes (the meta description's dash, the title's middle dot, and six ellipses in the User
  Functions menu on line 107), introduced by `26049b7` on 2026-09-17 and never repaired.
  `crankmagic.html` is clean. So the corrupted labels are not a stale cache; they are what is
  deployed. Fix: restore the characters, and a check in `tests/feature-wiring.mjs` that fails on
  the byte sequence EF BF BD in any tracked text file.
- **D5 / M-12 and D7 / M-13.** The CSS root causes are in `crankmagic-design.css`, not
  `crankmagic.css`: `dialog.v-dialog` (line 120) is `overflow: auto` with padding, and
  `.v-nav-links` (line 176) is the sticky element while `.v-navnote` follows in flow. The
  resolutions in §2 stand; the file does not.

### 9.2 The open S2 findings, verified

| Case | Finding | Verified root cause | Resolution | Size |
|---|---|---|---|---|
| **M-11** | Title and menu labels print U+FFFD | **Confirmed** (§9.1). | Restore `—`, `·`, `…`; byte guard in the suite. | S |
| **P-05** | A game logged after midnight prints the day before; "Paid per win $0.00" | **Confirmed.** `dateOf` (`crankmagic-decks.js:529`) is `Date.parse(g.at)`, and a date-only string parses as UTC midnight, which is the previous evening in New York. The paid-per-win figure divides a value the record does not carry. | Parse a date-only string as a local date; store the game date as the local calendar string (W.1's `today()`). Compute paid per win from the deck's paid total, or drop the figure. | S |
| **B-13** | A fresh measurement is labeled "Historical" at once | **Confirmed, and the UAT's cause is not the whole of it.** The report stores `deckFingerprint: result.hash`, the engine's lineup hash of the card list (`crankmagic-sim.js:188`); the deck page compares it with `M.fingerprint(d)`, a JSON of commander and slot card ids (`collection-model.js:626`, read at `crankmagic-decks.js:39,536,543`, `crankmagic-evidence.js:7`, and the lobby's `measuredScore`). They are two different functions, so a report from the in-app measure never matches its own deck, before or after identity verification. `collection-lobby-draft.js:292` builds a third. | One `M.fingerprint` computed from names and quantities, used by the sim when it files a report and by every reader; keep the engine's lineup hash on the report under its own name for rung cross-checks. Pin with a test that measures a fixture deck and asserts the report reads as current. | M |
| **B-20** | The deck header's primary is "Ready to add" with nothing ready | **Confirmed.** `crankmagic-decks.js:158` always puts Ready to add first for a final deck. | Primary by state: ready > 0 → Ready to add (n); else to buy > 0 → Buy list (n); else Log a game. The counts exist. | S |
| **A-01 / B-04 / A-06** | Staples show "—" for price on the buy list and in Lab while the card dialog has a price; two totals for one draft | **Plausible, not yet located.** Buy rows and the dialog both read `C.card(id)` (`crankmagic-collection.js:31,48`), so the difference is in which identity the row carries: a library identity without a price against the catalog record that has one. The Lab's two totals are two functions (panel estimate vs review sum). | Join every row's price through one lookup that falls back from the identity to the catalog record by name; one Lab total, labeled, with "N without a price". Part of W.4 (one number per concept). | M |
| **B-09** | Importing a known list makes a group, not a deck; the Lab cannot continue from it | **Plausible.** The Decks wizard's group path (`groupDeck`, `crankmagic-decks.js:369`) is the intended road; the Lab's import hook does not take it. | Wire the Lab's import after-hook to `groupDeck(gid)`; let the Lab's Existing deck select list groups; a result toast with the next step. | S |
| **B-15** | A card found in the graph cannot be swapped into a finalized deck from the graph | **Plausible.** `buyMenu` (`crankmagic-discover.js:694`) offers Add to deck for drafts only; the replacement flow exists in Collection. | "Swap into <deck>…" in the menu when the graph is scoped to a deck, opening the existing replacement flow prefilled. | S |
| **M-01** | Five totals for one library, and the Excel Summary's "watching 0" | **Confirmed** (W.4 in §3). `counters()` (`collection-model.js:98`) returns owned, ordered, watching, toBuy, inDeck, sellTrade; each surface counts its own thing in its own words. | W.4, plus the Summary sheet reading `counters()`. | M |
| **M-02** | Watched → Bought on a copy owned before records the catalog price as paid | **Confirmed as designed, and it is Rob's call.** One-tap Bought stamps `paid: sheetPrice(p), paidSource: 'catalog'` (`crankmagic-collection.js:1118`), and the model stamps only when the lot has no finite paid (`collection-model.js:496`). The lot had an estimate, not a paid figure, so the stamp landed. The rule is that market is Scryfall's and paid is what you typed; a catalog stamp shown as "paid" blurs it. | **Decided (Rob, 2026-09-20):** a catalog-sourced figure shows everywhere as "≈ $0.47 (catalog)", never as paid; one-tap Bought keeps stamping. | S |
| **M-15** | An AI deck built in the lobby becomes a ninth deck tile and 100 library rows | **Confirmed as designed.** Track E.3 mints a real draft on purpose (`collection-lobby-draft.js:198`, `deck:lobby:…`), so a lobby deck can carry a measurement into Decks. The UAT sees the side effect the plan called the loop's return edge. **Rob's call.** | **Decided (Rob, 2026-09-20):** keep the deck, mark it `kind: 'lobby'`, and hide lobby decks from the tiles, the sidebar, the compare list, the Lab select and the library counts unless a "Show lobby decks" toggle is on; "Save to Decks" promotes one. | M |
| **P-02** | The lobby page jumps to the bottom after Apply | Not verified. | Keep the scroll position after apply. | S |

### 9.3 The S3 and S4 findings

Taken as filed; each is small and each ships with its proof. In the order the UAT ranked them:
A-03 bulk bar reserves its height; A-04 Lines dialog reads paid from the lot; B-05 matching
commanders in flow; B-07 draft banner from the report; B-08 Lab keeps its steps after save; B-14
in-deck/owned chips and a progress bar; B-16 re-render the focused card after add; B-17 Options
dialog sized to its list, future tense before Confirm; B-18 promote note from the allocation
preview; B-19 Working list flags in place; B-21 fold the two stub tabs (W.5); B-23 sticky header
row in Compare; M-04 stage cards as drag sources (`crankmagic-tabletop.js:940` binds `fan` only);
M-06 Clear filters keeps the Table view; M-07 History sorted, preference saves dropped, lean
export; M-08 History dialog refreshes after undo, same-tab wording, local timestamps; M-10 tour
scrolls its first target into view; M-12 sidebar note outside the sticky track; M-14 card dialog
opens at the top; M-18 see §9.4; P-03 "Before you sit" reads Simulation history; P-06 Log a game
progressive disclosure, no basic lands in "won it"; then the S4s: A-06, B-10, B-12, B-22, B-24,
M-05, M-13, M-16 (toasts hide on navigation), M-19, and B-06's `incompleteGames` copy.

### 9.4 Where this document disagrees with the UAT

- **M-18, the service worker.** The UAT asks for `skipWaiting` on activate. This document keeps
  §2 D3: a worker that takes over mid-session leaves an already-open page fetching old `?v=` URLs
  that the new lists do not carry, and GitHub Pages serves the new bytes under the old query. The
  fix is a "new version ready, reload" line, with `skipWaiting` on the click. Cache pruning on
  activate is already there and works once the worker activates.
- **B-13's cause.** Identity verification does change ids, but the label would be wrong even
  without it: the two sides hash different things (§9.2).

### 9.5 The queue, re-ranked

The UAT's open S2s move ahead of the walkthrough's S3 work. Online items keep their place.

| Step | Work |
|---|---|
| **W.2** | The verified small S2s: M-11 (+ byte guard), P-05, B-20, M-16 (toasts), M-13, M-14, M-12 — one PR, each with a red-first test or a geometry check, rendered. |
| **W.3** | B-13 fingerprint unification (M). |
| **W.3b** | M-02 (catalog-sourced figures shown as "≈ (catalog)") and M-15 (lobby decks hidden behind a toggle, "Save to Decks" to promote), as Rob decided on 2026-09-20. |
| **W.4** | One number per concept: M-01, A-01, B-04, A-06 and the Excel Summary. |
| **W.5** | B-09, B-15, B-21, then the UAT's S3s in its order. |
| **E.4** | Server-side 99-engine repair loop (Online). |
| **W.6** | D3 / M-18 reload prompt, and the S4s. |
| **C.6** | Visible first-player roll (Online, needs a Forge build here). |

Everything in §7 (definition of done) applies to each step.
