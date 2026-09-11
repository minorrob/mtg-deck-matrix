# CrankMagic UX changes — execution instructions for Claude Code

Repo: `minorrob/mtg-deck-matrix` (branch from `main`; the Load Live work sits on `claude/mtg-deck-matrix-ui-fixes-f7om91`, rebase onto it if it has not merged). Live app: https://minorrob.github.io/mtg-deck-matrix/. Companion report with mock-ups: `crankmagic-ux-gap-review-2026-09-11.html` (same numbering as below).

Read this whole file, then `docs/crankmagic-architecture.md`, `BACKLOG.md`, and the header comments of every file you touch, before changing anything. This repo keeps its reasoning in module headers and its decision log in commit messages; match that.

## 0. Ground rules

- **Do not rebuild the app.** Every change below is additive to the existing views, the existing command/commit model (`C.commit`, `C.repo`, `M.projection`, `M.readiness`) and the existing tokens in `crankmagic-design.css` / `crankmagic.css`.
- **Ownership truth is never guessed.** Only Rob's ticks change `location` or `source`. No step may infer a card is in a box.
- **Every write is one commit with a summary** so Undo and "See every change" keep working.
- **Phone first.** The device that decides layout is a phone at a card shop (see `docs/prd.md`). Verify every view at 390×844 and 1440×900 with `tests/uat/journeys.mjs` style Playwright runs; measure geometry, do not eyeball.
- **No new dependencies, no font or library that blocks first paint.**
- **Keep `tests/live-load.mjs` green** and add a test per change where a projection or command changes.
- **Copy voice:** short, plain, no marketing. American English.
- Commit per numbered change. Commit message quotes the finding it fixes, in one line, then what changed.

## 1. Core use cases (judge every change against these)

| UC | Rob is doing | Expected pattern |
|---|---|---|
| UC1 Buy | Finish six 100-card decks inside a hard budget ($100 pool, nothing over $30, $225 deck value cap, 110% cap on listings over $2), local store before TCGplayer, prices verified before money moves | Price on every buy line, running total, per-deck and per-vendor subtotals, one-tap Bought/Ordered that records what was paid |
| UC2 Organize | Keep a 100% accurate digital record of what is physically in each deck box vs the bench; assemble boxes at the table | Per-deck pull sheet grouped by where the card is now (this box · bench · another box · ordered · to buy), tick writes back |
| UC3 Define | Six definitions with Base/Tuned/Max tiers, ≤2 Game Changers, an Upgrade Path of "X replaces Y for $Z because" | Upgrades on the deck page as replace-pairs with tier, price, reason; promote in one action |
| UC4 Update | Report card events fast, often from a phone: bought, ordered, arrived, moved, replaced X with Y | Primary action on the row; same columns and actions on phone and desktop |
| UC5 Spend vs performance | Know what each deck cost, its value against the cap, whether it wins | Cost basis and market value per deck; game record read back (W-L, win %, $ per win) on the deck page |

Glossary (Rob's terms, use them in UI copy): Deck, Full Deck, Slot, Assigned card, Base / Tuned / Max card, Active card, Owned, Ordered, Bench, In box (deck box).

## 2. Shared foundations (build first, everything else uses them)

### 2a. Status color tokens (finding 10)
File: `crankmagic-design.css` (tokens), `crankmagic.css` (pills).
Add tokens and apply to `.cm-badge` / source pills and to all segmented bars:

```
--st-inbox:#5cc98a   /* owned, in this deck's box */
--st-pull:#4fc2c0    /* owned, reserved, not in box (bench or other box) */
--st-ordered:#3b7dd8
--st-buy:#f0b35a
--st-draft:#7f8ba0
--st-remove:#ef6b60  /* in box but no longer in the list */
```
Pill classes: `.cm-pill.inbox|pull|ordered|buy|draft|remove`, 11px/600, 2px 8px, radius 6, background at 22% alpha of the token, text at the token. Replace the single slate pill everywhere `source`/`placement` renders (`crankmagic-collection.js` `cell()`).

Acceptance: Collection, Shop, deck page, tiles all show the five states in five colors; contrast ≥ 4.5:1 on `#161e2d`.

### 2b. Readiness segments (finding 2, used by tiles, deck page, pull sheet)
File: `collection-model.js` (or wherever `M.readiness` lives).
Extend `M.readiness(state, deck)` to return `{ target, inBox, pull, ordered, toBuy, remove, owned, ready, costToFinish, paid, marketValue }` where
- `inBox` = reserved lots located in this deck's box
- `pull` = reserved lots owned but located elsewhere (bench or another box), split as `pullFromBench`, `pullFromOtherBox`
- `remove` = lots located in this box whose card is not in the current list
- `costToFinish` = Σ price × need over To buy rows; `paid` = Σ `lot.paid`; `marketValue` = Σ price × owned reserved copies.
Add a shared renderer `C.readinessBar(r)` that outputs the 4-segment bar (inbox / pull / ordered / buy) with `aria-label`.

Acceptance: for the live state, D3 returns inBox 55, pull 17, ordered 4, toBuy 24 (matches the walkthrough figures); unit test in `tests/`.

### 2c. Button scale (finding 19)
File: `crankmagic.css`.
Three sizes only: `.v-button` 40px min-height (padding 0 14px, 14px/1), `.v-button.compact` 32px (padding 0 10px, 13px) for table cells, `.cm-icon-button` 36×36. `.cm-text-button` gets `min-height:32px; display:inline-flex; align-items:center`. `.cm-actions{gap:12px}`. Replace typed chevrons (`▾`, `⌄`) in `Insight`, `Manage`, `User Functions`, row `Actions` with an inline 10px SVG chevron, `align-items:center`.

Acceptance: measured heights of every button in a shared row are equal; no glyph chevron remains in `index.html`, `crankmagic-decks.js`, `deck-page.js`, `crankmagic-collection.js`, `admin-menu.js`.

## 3. P0 changes

### 3.1 Money on the buy list (finding 1) — UC1, UC5
Files: `crankmagic-collection.js`, `shop-filters.js`, `shop-export.js`, `crankmagic.css`.
1. Shop defaults: when `show(params, shop)` runs with `shop === true`, use the compact column set at every width: `name, color, type, price, cap, vendor, deck, quantity, paid`. Keep the Columns dialog for overrides but store Shop prefs separately (`preferences.shopColumns`).
2. Add a `cap` cell: `price <= 2 ? price : round(price * 1.10, 2)`; red text and a "local only" suffix when `price >= 5`. Constants live in one place (`shop-filters.js` export `RULES = {capFloor:2, capPct:0.10, localOnly:5, perCardMax:30, deckCap:225, pool:100}`) so 3.6 reuses them.
3. Summary strip above the table (replaces the six-figure stat row on the Shop only): `to buy N · $X at sheet prices · $Y ordered unpaid · $Z left in pool`, then a price-band bar (under $1 / $1–5 / over $5) with counts and dollars. Pool remaining = `RULES.pool − Σ paid since pool start date` (store `preferences.poolStart`, default the live-load date).
4. Group rows by deck by default on the Shop (`groupBy='deck'`) with a subtotal in each `cm-group-row`: `D2 Chulane Value Loop · 16 cards · $19.40`. Offer `Group by vendor` too.
5. Row primary buttons, single tap, no dialog: `Bought` and `Ordered` on To buy rows, `Arrived` on Ordered rows; each stamps the catalog price as `paid` (see 3.4). The phone-only `shop-buy` path that writes `paid:null` is replaced by the same stamping.
6. Export view: include Price, Cap, Vendor and the subtotals in the CSV/XLSX; `shop-export.js` "To Buy" page gains a total line and per-deck groups.

Acceptance: at 1440 and 390 the Shop shows a price on every To buy row and a total that equals Σ(price × need) of the visible rows; grouping by deck sums to the total; exported file carries the same total.

### 3.2 "To pull" on the deck page and tiles (finding 2, 17, 18) — UC2
Files: `deck-page.js`, `crankmagic-decks.js`, `crankmagic.css`.
1. Deck page stat row → two clusters: left `In box · To pull · Ordered · To buy` (26px gaps, sentence-case 12px labels, 22px figures), right `$ to finish · cap $225`. Under it, `C.readinessBar(r)` with a legend. Remove `.cm-stats` auto-fit spread on this page.
2. Action row becomes: `Pull sheet (n)` primary when `pull+remove > 0`, `Buy list (n)`, `Upgrades (n)`, `Log a game`, `More ▾` (holds Collection group, Reserve available copies, Lock deck, Edit definition, Export, Archive). `Insight` content (What this deck looks like, Recommendations, Reports) moves under `More ▾` → `Insight`.
3. The "Finalized: reservations track what this list needs…" banner becomes a one-time tip with a close button stored in `preferences.dismissedTips`.
4. Tiles (`.cm-deck-tile`): replace `"95 / 100 in hand"` with `C.readinessBar(r)` plus a nowrap caption `83 in box · 12 pull · 4 buy`. Badge text `In progress · 5 to go` / `Ready to play`, moved into the copy block (remove `position:absolute;top:15px;left:16px`). Art: `.cm-deck-art{object-position:50% 22%;transform:scale(1.7)}`, gradient `linear-gradient(0deg,#101725 34%,#101725d0 58%,#10172500 86%)`. Footer: `display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px`, every child `white-space:nowrap`; `.cm-text-button[data-action=compare-pick]{width:74px;justify-content:center}` with the check as `::before` on `aria-pressed=true`; Compare and `⋯` both 32px tall. Hide the `<p>` when `definition.mechanics` is empty (finding 15) and populate `mechanics` in `data/live-load.json` from the guide's strategy tags, then rebuild `live-state.json`.

Acceptance: Playwright at 1440: tile footer children share one vertical center (±1px); no tile text wraps; badge does not overlap the card frame region (top 40px of the art). D3 page shows `17 to pull`.

### 3.3 Pull sheet view (finding 3; BACKLOG #3 and #6) — UC2
Files: new `pull-sheet.js`, route `#pull?deck=…` in `crankmagic-route.js`/`crankmagic-app.js`, print CSS in `crankmagic.css`, link from 3.2's `Pull sheet (n)` button and from Shop → `Deck assembly` (which becomes a deck picker that opens this view).
Layout, grouped in this order, color inside each group, then name:
1. **Pull from bench** (`pullFromBench`) — row: tick · name · type · MV · `Bench · box <box>` pill · `In box` button
2. **Move from another box** (`pullFromOtherBox`) — `<Dn> box` pill · `Move here` button
3. **Remove from this box** (`remove`) — `Remove → bench` pill · `To bench` button (this is BACKLOG #6's diff)
4. **Waiting** — ordered and to-buy counts with a link to the Shop filtered to this deck (read-only here)
Header: deck name, counts, `Print`, `Export`, `Mark all found in box`. Tick or button commits a `location` change for that lot (`{kind:'deck', deckId}` or `{kind:'bench', box}`); the row stays in place, greys out, and the group count decrements, so the walk through the boxes keeps its order. `Mark all found in box` is one batch commit with a review dialog listing the lots.
Print stylesheet: black on white, 11pt, checkboxes as `☐`, group headings kept with their first row, no header/sidebar.

Acceptance: D3 pull sheet lists 17 rows across groups 1–2, 0 in group 3 for the live state; ticking one row changes exactly one lot's location and the deck page's `In box` figure by one; `window.print()` preview fits D3 on one page; the view works at 390px with the button as the tap target (≥ 36px).

## 4. P1 changes

### 3.4 Order lifecycle, captured per order (finding 4) — UC1, UC4
Rob's rule: **never a screen per card.** Eighty-five cards must take one screen or none.
Files: `crankmagic-collection.js` (batch bar, row actions), `collection-model.js` (lot `order` field, `paid` stamping), `crankmagic-exchange-ui.js` (receipt paste), new `orders.js`, Shop tab `Orders`.
1. **Stamp, don't ask.** Any transition to `ordered` or `owned` from a To buy row writes `paid = catalog price at that moment` (plus `paidSource:'catalog'`) with no dialog. Row buttons `Ordered` / `Bought` are single-tap.
2. **Batch bar.** With rows ticked, the existing `batchBar()` gains `Ordered…`, `Bought in store`, `Arrived`. `Ordered…` opens one dialog for the whole selection: Vendor (Game Theory Wake Forest, Game Theory Raleigh, CCS Raleigh, TCGplayer, Card Kingdom, Trade, Other), Order ref, Shipping (spread evenly across lines into `shipShare`), Expected by. Save = one batch commit; every line gets `order:{id, vendor, ref, expectedBy}` and stamped `paid`. `Bought in store` = same with vendor only and `source:'owned'`, location bench.
3. **Receipt paste (exact prices, optional).** Under Import list / library add mode "Order confirmation (TCGplayer / Game Theory email or CSV)". Reuse `E.parse` and the existing `paid` column mapping; add a text parser for the TCGplayer confirmation layout (name · set · condition · qty · price). Match rows to To buy / Ordered lots by name (DFC front face), preview unmatched lines, then one commit that sets `paid` from the receipt (`paidSource:'receipt'`) and attaches the order ref. Never creates copies that were not on the buy list without showing them in the review.
4. **Orders tab** on the Shop: one row per `order.id`: vendor, ref, lines, total (`Σ paid` + shipping), status Ordered / Received, `Arrived → bench` primary (one batch commit: every line `source:'owned'`, location bench, reservations kept), `Paste receipt`, `Edit`. Lines with `paidSource:'catalog'` show a small "sheet price" marker so Rob knows which totals are estimates.
5. Inline rule warnings (over 110% cap, over $30, ≥ $5 not local) appear as a count in the batch bar and a marker on the row, never as a blocking dialog.

Acceptance: ticking 85 To buy rows and saving one `Ordered…` dialog produces 85 lots with `paid` set and one order in the Orders tab in under five clicks; `Arrived → bench` flips all 85 in one Undo step; pasting a receipt with 3 differing prices updates exactly 3 lots; `tests/live-load.mjs` still passes.

### 3.5 Upgrade Path panel (finding 5) — UC3
Files: `deck-page.js`, `slot-model.js` (options already exist as uncommitted option entries), `crankmagic.css`.
Panel on the deck page (`Upgrades (n)` button scrolls to it): table `Add · Replaces · Tier · Price · Why · Promote`, header `Upgrade Path · n · $X to Max`, filters `Tuned only`, `Under $2` (D1–D4) / `Under $1.50` (D5–D6) using the promote thresholds, GC chip on Game Changer rows and `GC k / 2` in the header. `Promote` = one commit: set the slot's Active card to the upgrade, move the replaced card's plan entry to a `Replaced` state (owned copy stays in the box until the pull sheet says remove), add the new card to To buy with price recorded. `Review linked upgrades` and Insight → Recommendations link here instead of to Collection. Source data: the `Upgrade Path` group entries plus the `replaces`, `tier`, `why` fields; add those fields to the option entry schema if they are not carried today (they are in `data/live-load.json` `upgrades`).

Acceptance: D3 shows its upgrade rows with replaces/tier/price/why; Promote changes exactly one slot and adds one To buy row; GC count never exceeds 2 without a confirm dialog.

### 3.6 Budget card (finding 7) — UC5
Files: `deck-page.js`, `crankmagic-plan-editor.js` (Deck Definition), `shop-filters.js` `RULES`.
1. Deck Definition: prefill Total price cap 225 and Per-card cap 30 when blank (write only on save; show as placeholders until then).
2. Deck page card under the stat row: `$ to finish (base)`, `Paid so far`, `Market value · % of cap` with a single bar, `Game Changers k / 2`, `n lines over the 110% cap` (amber when > 0). All from 2b.

Acceptance: figures reconcile with the Shop subtotal for the same deck; a deck over 90% of cap shows amber, over 100% red.

### 3.7 Game record read-back (finding 6) — UC5
Files: `game-record.js`, `deck-page.js`, the Log a game form in `deck-page.js`/`crankmagic-exchange-ui.js`.
Form gains Date (default today), Finish (1..pod), Pod size, Bracket, Card that won it, Dead card in hand (both card pickers limited to the deck). Deck page gains a `Record` card: last-n W-L, win % with n, $ per win (`paid / wins`), the Wilson-gated comparison sentence `game-record.js` already computes, and a table of the last 10 games. Tile caption shows `3–1` when games exist. Reports & advice modal keeps the full list.

Acceptance: logging a game updates the deck page without reload; with n < 8 the comparison line reads "too few games to tell", never a percentage difference.

### 3.8 Row actions (finding 8) — UC4
Files: `crankmagic-collection.js` (`row-actions`), `crankmagic.css`.
1. Primary button on the row by state: To buy → `Bought` (single tap, price stamped); Ordered → `Arrived`; Owned + reserved + not in box → `Put in <Dn> box`; In box → none; Bench unassigned → `Reserve…`.
2. Menu becomes sectioned: **Where it is** (Move to another box ▸, Move to bench), **Plan** (Reserve for a deck ▸, Replacements & options, Pin slot), **Record** (Edit print, paid & details; Add another copy; Add / move to group), then a rule, then danger items (Release reservation → To buy, Sell / trade out). Items that do not apply to the row's state are omitted, not disabled. Section labels 10px uppercase muted; danger items in `--st-remove`.

Acceptance: an owned-reserved row shows ≤ 9 menu items; the primary action is reachable in one tap on phone (≥ 36px).

### 3.9 Phone/desktop parity (finding 9) — covered by 3.1 step 1. Also fix (finding 16) in `.cm-table-shop`: `td.cm-price{white-space:nowrap;width:56px}`, `.cm-card-name span{overflow-wrap:normal;word-break:normal;letter-spacing:0}`.

## 5. P2 changes

- **3.10 Duplicate rows (finding 11):** on the Shop, fold by card by default (`×2 · D2, D3`), keep `Bought` on the folded row and split the commit across decks by need; `One row per card` moves into the Columns dialog.
- **3.11 Filters (finding 12, 20):** `expanded=false` by default; active filters render as chips under the search box with ✕ and `Clear all`; `Filters (n)` button shows the count; all `.cm-filter-panel input, select {height:36px}`; move `One row per card` out of the toolbar.
- **3.12 Scroll reset (finding 13):** in the router's view change, `window.scrollTo(0,0)` unless the route carries `#anchor`; keep offset on in-view re-renders (filters, paging).
- **3.13 Deep-link timing (finding 14):** `#decks?deck=` waits on the repository ready promise and renders the hero skeleton meanwhile; "Deck not found" only after the state has resolved and the id is truly absent.
- **3.14 Composition chart:** hide value labels for 0 bars.
- **3.15 Group chip:** make `Group: …` a plain chip and add an `Open group` text button beside `Edit definition`.

## 6. P3 micro-adjustments (one commit, `crankmagic.css` only unless noted)

1. `.cm-stats` on deck page → replaced by 3.2; on Collection/Shop keep the grid but cap `max-width:900px` and `gap:18px 32px`.
2. `.cm-table td{height:56px;vertical-align:middle}`; sublabel `<small>` becomes an inline `.cm-pill.draft` chip after the name (`crankmagic-collection.js`).
3. Desktop thumbnails: remove `.cm-card-thumb` from the row; add hover preview (`.cm-card-name:hover .cm-card-preview`, 240px, positioned right of the name, `pointer-events:none`) using `r.card.image`.
4. Editable cells `.cm-cell-live`: `border-bottom:1px dotted var(--v-line)` and a 12px pencil on `:hover`; empty money renders `$ —` (`cell()` for `paid`/`price`).
5. Sort glyph `↕` only on `th:hover` and the active column.
6. Pagination block duplicated above the table when `visibleRows.length > 60`.
7. Sidebar footer (`Your cards. Your library.` block): one size 12px, one color `--muted`, 4px line gap; `Back up now ↗` stays as the only link.
8. Header buttons `Take a Tour / Send Feedback / User Functions`: chevron via 2c; gap 10px → 12px.
9. Breadcrumb eyebrow dot `·` spacing: `letter-spacing:.14em` on the eyebrow only, not on the dot.

## 7. Build order and verification

1. Foundations 2a → 2b → 2c (tests for `M.readiness`).
2. 3.1 → 3.2 → 3.3 (P0; ship as one PR "money, to-pull, pull sheet").
3. 3.4 → 3.5 → 3.6 → 3.7 → 3.8 → 3.9 (P1; one PR each).
4. Section 5 and 6 as one "consistency and polish" PR.

For every PR:
- `./runtests.sh` green (except the Scryfall 403 case documented in the Load Live note).
- Playwright run at 1440×900 and 390×844 against `python3 -m http.server` with Load Live applied (password in `crankmagic-exchange-ui.js`); save screenshots of My Decks, D3 page, D3 pull sheet, Shop, Orders to `docs/screens/<pr>/` and attach to the PR.
- Geometry assertions, not eyeballing: no horizontal scroll at 390; every tap target ≥ 36px; every button in a shared row has the same height; no text node wraps inside `.cm-deck-tile footer`.
- Totals reconcile: Shop total = Σ per-deck subtotals = Σ Budget-card `$ to finish` across decks.
- Bump `crankmagic-sw.js` version and the `?v=` query on css/js as the repo does today.
- Update `README.md` (workflows: buy → ordered → arrived; pull sheet; log a game) and add a line to `BACKLOG.md` marking #3 and #6 shipped.

Report back with: what shipped per PR, the five screenshots, the reconciled totals for the live state, and anything in `data/live-load.json` that needed a field added (vendor, ref, mechanics) so Rob can fill it.
