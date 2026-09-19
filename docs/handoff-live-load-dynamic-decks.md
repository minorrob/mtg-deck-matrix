# Live Load — dynamic decks, the price rule, and what remains

**Status: the dynamic-deck work is DONE.** This document was written when it was a plan; it is
now the record of how it was done, plus what is still outstanding.

**Last updated:** 2026-09-19, by the cloud session, at the end of its run.

---

## 1 · What you asked for, and where it landed

The original task was "make the Live Load carry any number of decks". It is done, but not the
way this document first proposed. The short version:

> Trey restructured the Master workbook as a **star schema**, and the importer now reads that
> instead of the wide sheet. The deck count is **discovered** from `master_target`'s `D<n>-T`
> columns, so adding a deck is a workbook edit. **`D7 Maralen Exile Cast` is live.**

The original plan was to unpick the `D1..D6` list and the pinned column letters in the wide
reader (`tools/build-live-load.mjs` lines 48–49). That path was not taken, and the wide reader
still has them. Two reasons the star tables won:

- **They hold no formulas.** The wide sheet computes `In Deck`, `In Bench`, `Buy Count` and
  `Target Qty`. A workbook written by anything other than Excel has those cells *empty* —
  openpyxl keeps formulas but drops their cached values — and `tools/read-sheet-rows.py` reads
  with `data_only=True`. The normalized tables carry plain numbers and import either way.
- **The deck count is already a column header there**, so discovery is three lines rather than
  a rewrite.

**The wide reader is still the fallback** for a pre-star workbook and still hard-codes six
decks. If Trey ever goes back to a Master-tab-only workbook — which he has said he intends —
that limit has to be lifted there too. See §4.

---

## 2 · What has been done since you pointed me at the repo

In order, all on `claude/data-refresh-2026-09-19` ([PR #272](https://github.com/minorrob/mtg-deck-matrix/pull/272)).

### The data refresh (the original errand)

`node tools/refresh.mjs` — catalog, flavor names, graph, EDHREC ranks, prices, strategies. No
count moved and none shrank: **no Commander-legal card had printed since 10 September**. The
substance was 587 changed records — 548 prices, 126 cheapest-printing changes, 8 oracle-text
corrections.

### Seven bugs, each of which shipped a wrong number quietly

| Commit | Bug |
|---|---|
| `2553e39` | Explore fetched the graph from a hardcoded `?v=18`; nothing ever assigned `C.assets`, so the fallback was the only path ever taken |
| `f669a33` | `refresh.mjs` trimmed `git status` output, cutting a character off the **first** changed path — every refresh silently skipped one file's `?v=` bump |
| `02f891e` | The manifest was written *before* the version bump, so it was always one version stale |
| `6e3faa6` | `reprice` used the frozen plan price, not the catalog, so it could not do the one thing it exists for |
| `cf8b6c3` | `newestWorkbook()` sorted filenames, so `..._-_v22_-_...` sorted **before** `_v13` and the build read a stale workbook |
| `cf8b6c3` | Card records carried `manaCost` but no `manaValue`, so anything grouping by mana value filed the card under "No cost" |
| `cf8b6c3` | The record set is fed from `master-v2.json`, so the 181 cards the new workbook brings into decks had **no records at all** |

### The price rule, both halves

> Market price always comes from Scryfall. The spreadsheet's `$ Each` is what Trey **paid**,
> for cards he owns — never a market price.

- **Buy list** (`73e5459`): was priced from the workbook, understating the shop by a third —
  **$74.44 → $100.47** on the committed file, with `Night's Whisper` quoted at $0.29 against a
  record-set price of $5.45.
- **Paid** (`a5e0e9f`): the workbook's `$ Each` never reached a lot. Now lands on **owned**
  copies only as `paid` + `paidSource: 'typed'` + `paidAt`. Ordered and watched copies are
  never stamped. **$706.18** total paid across owned copies.

### The workbook, v16 → v22

| | |
|---|---|
| `D7` named | `D7 Maralen Exile Cast` |
| Collector info | 158 rows merged, 2 extra-copy rows appended, `Skin Name` column added |
| Values | 828 of 917 rows priced from the catalog's cheapest printing |
| Names | `Blight-Vial Boggart` → `Bile-Vial Boggart`; `Vayne Carudas Solidor` → `Fynn, the Fangbearer` (skin name preserved) |
| `Master` headers | row 4 B–Q restored — they had been overwritten by a pasted note |
| Metadata | 61 purposes derived, 12 brackets set, every field populated on all 913 rows |
| Fable's upgrades | 56 new cards (`c0914`–`c0969`), targets rewritten to post-upgrade state, `master_buy_upgrade` rebuilt 918 → 111 rows, columns G–I removed |
| Brackets | 20 staples promoted B2 → B3 |
| Star schema | `Ordered` and `$ Each` added to `master_main`, so it no longer needs the wide sheet |

**Buy list now: 101 cards, 111 copies.**

### The Live Load itself

```
7 decks · 329 bench rows · 6 ordered · 101 buy rows · 111 upgrades
```

Plus two things it never carried before, both of which you asked for:

- **`decks[].strategy`** from `deck_strategies` — the overview Trey maintains wins over the
  committed file's.
- **`metadata`** per card — primary purpose, the three mechanics, bracket, type, color, mana
  value — so the app can show the workbook's own reading rather than only what the catalog
  derives.

---

## 3 · The house rules that made all of this findable

Both were learned the hard way in this repo and they are why the bugs above were caught rather
than shipped:

- **A test that cannot fail is a comment.** Break the code, watch the test go red, restore it.
  Every fix in this run was proven that way — the `.trim()` bug fails its new case with the
  exact corruption `'ata/card-facts.json'`, and removing the `paid` stamping fails its eight.
- **A check that reports green without running is worse than no check.** `runtests.sh` once
  skipped `game/tests/`; the browser suites self-skip without Playwright. CI sets
  `PAGE_BUDGET_REQUIRED=1 GEOMETRY_REQUIRED=1`; run them locally the same way or the browser
  suites pass by not existing.

---

## 4 · What remains to reach Trey's target

Ordered by what blocks what.

### 4.1 · Before the next Live Load import — **required**

**Open `Treys_MtG_Master_-_v22_-_For_Live_Load.xlsx` in Excel and save it once.** openpyxl
preserved all 4,879 formulas but dropped their cached values. The star-schema path does not
care — it reads plain numbers — but the wide sheet's `In Deck`, `In Bench`, `Buy Count`,
`$ To Buy` and `Target Qty` read as blank until Excel recalculates.

### 4.2 · The wide reader still hard-codes six decks

Trey has said the future input will be the **Master tab only**. The moment that happens, the
star path is gone and `tools/build-live-load.mjs` falls back to the wide reader, which:

- lists `D1..D6` at the `DECKS` constant, and
- pins the column letters in `EXPECTED` (`W`–`AB`, `AE`–`AJ`), which a seventh deck shifts.

Either lift both (discover the ids from the `D<n>-T` headers, make the column guard structural
rather than letter-pinned), or keep exporting the star tables. **This is a decision for Trey,
not a code choice.**

### 4.3 · The app does not yet display the metadata it now receives

`data/live-load.json` carries `metadata` and `decks[].strategy`, and `tools/live-load.js`
validates them, but **nothing renders them yet**. Wiring that up is the remaining half of
"the app should reflect what the workbook says":

- card metadata — purpose, mechanics, bracket — on the card view and in Collection;
- `decks[].strategy` (strategy / engine / attack / defense / ramp) on the deck overview.

`decks[].notes` already takes the Strategy text, so deck overviews show *something* today.

### 4.4 · Smaller threads, in priority order

| Thing | Where | Note |
|---|---|---|
| `tools/sim/lib.mjs:123` still prefers the plan price over the catalog | measurement tools | Deliberately left: "what this cost when bought" is a legitimate question there, and moving it shifts prices under published measurements. The last place the two numbers share a field. |
| 56 new upgrade cards are all `B2` | workbook | Placeholder. Several are staples (`Brainstorm`, `Preordain`, `Austere Command`) that arguably belong at B3. |
| `master_buy_upgrade` lost its 795 skeleton rows | workbook | Deliberate — they carried only a card id. Easily restored from v21 if wanted. |
| `Master` column `Q` | workbook | Confirmed by Trey as `Rarity`, newly added, now populated. |
| Two collector rows excluded | workbook | `Elf Token`, `Goblin Army` — tokens, not cards, absent from `master_main`. |

### 4.5 · Not started, from the original readiness plan

C.1 unknown-card swap UI · C.2 connection panel · C.6 first-player roll (needs a JDK) ·
E.4 server-side 99-engine repair loop · F.1 move lobby logic out of `crankmagic-game.js`.

---

## 5 · How to verify any of this

```bash
node tools/build-live-load.mjs                 # newest data/source/*Master*.xlsx, by version
node tools/build-live-state.mjs
PAGE_BUDGET_REQUIRED=1 GEOMETRY_REQUIRED=1 bash runtests.sh -q
```

65 suites, and they were green at `cf8b6c3`. Never skip, disable or quarantine a suite to get
through — that rule is load-bearing here.

**Never touch:** `data/deck-ratings.json`, `data/simulation-summary.json`, `sim/` (measured
results — only a re-run of the sweep may write a score) and `data/deck-guides.json`
(hand-written). If a change makes one of them stale, say so and stop.
