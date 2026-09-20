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
