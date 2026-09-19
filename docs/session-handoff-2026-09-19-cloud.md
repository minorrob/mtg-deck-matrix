# Session handoff — cloud session, 2026-09-19

**For:** the local Claude Code session picking this up.
**Branch:** `claude/data-refresh-2026-09-19` · **PR:** [#272](https://github.com/minorrob/mtg-deck-matrix/pull/272) · **Base:** `main` at `fe4e041`
**State at handoff:** 65 suites green, PR open and ready, **not merged**.

---

## 1 · Read these first, in this order

1. `docs/handoff-live-load-dynamic-decks.md` — the Live Load work, what was done and what
   remains. It is the substantive document; this one is the session's shape.
2. `docs/crankmagic-refresh.md` + `.claude/skills/crankmagic-refresh/SKILL.md` — the data
   refresh contract, including the never-touch list.
3. The PR body on #272 — every bug, with its evidence.

---

## 2 · The one thing that must happen before anything else

**`Treys_MtG_Master_-_v22_-_For_Live_Load.xlsx` must be opened in Excel and saved once.**

It is committed at `data/source/`. openpyxl preserved all 4,879 formulas but **dropped their
cached values**, and `tools/read-sheet-rows.py` reads with `data_only=True`. The star-schema
import path does not care — it reads plain numbers — but the wide sheet's `In Deck`,
`In Bench`, `Buy Count`, `$ To Buy` and `Target Qty` read as blank until Excel recalculates.

I could not do it here: **LibreOffice in this container cannot load any xlsx at all** — it
failed on Trey's original v16 too, so it is the environment, not the file.

---

## 3 · What this session did

The errand was "refresh the card data". It became seven bugs, a workbook rebuild and a new
importer. Twelve commits before the Live Load work, then `cf8b6c3`.

### Shipped

- **Data refresh** — catalog, flavor names, graph, ranks, prices, strategies. No count moved:
  no Commander-legal card had printed since 10 September. 587 records changed.
- **Four version/price bugs** — `2553e39`, `f669a33`, `02f891e`, `6e3faa6`. Each shipped a
  wrong number quietly; three would have poisoned a browser cache, the fourth put the wrong
  price on something Trey would spend money on.
- **The price rule, both halves** — `73e5459` (buy list from Scryfall; the shop had been
  understated by a third, $74.44 → $100.47) and `a5e0e9f` (what he paid now reaches owned
  copies; $706.18 total).
- **The workbook, v16 → v22** — D7 named, collector info merged, two card names corrected,
  `Master` headers restored, all metadata populated, Fable's 123 upgrades applied (56 new
  cards, targets rewritten, buy table rebuilt 918 → 111 rows), 20 brackets promoted.
- **The Live Load** — `cf8b6c3`. The importer now reads the star schema, **discovers the deck
  count**, and carries `metadata` and `decks[].strategy`. Seven decks live.

### The habit that found most of it

Every fix was proven by breaking it first. The `.trim()` bug fails its new test with the exact
corruption `'ata/card-facts.json'`; removing the `paid` stamping fails its eight checks;
reintroducing the hardcoded graph pin fails `asset-versions`. **A test that cannot fail is a
comment.** That rule is why this session found bugs rather than shipping them.

---

## 4 · Where I was wrong, so you do not inherit it as fact

Stated plainly because the record matters more than the tidiness:

- **I told Trey the v13 workbook was not in the repo.** It was. A `find` truncated by `head -5`
  read as a complete listing. The false claim reached a handoff document before I caught it;
  it is corrected in place at `5439fa7`.
- **I committed mid-run during the first refresh.** The version cascade derives its change set
  from `git status`, so committing hid finished files from it and `commander-ranks.json` —
  5,284 lines changed — got no `?v=` bump. Reset and re-ran. **Do not commit while
  `tools/refresh.mjs` is running.**
- **My first `reprice --write` used the unfixed tool** and wrote frozen plan prices over
  catalog-correct figures. History was rebuilt from the pre-reprice state and force-pushed.
- **I reported inflated metadata gaps** ("103 missing MV") because my completeness check
  counted `0` as blank. Lands legitimately have MV 0. The real gaps were 13 rows and 1 Type.

---

## 5 · Open threads, in priority order

| # | Thread | Where |
|---|---|---|
| 1 | **Open v22 in Excel and save** | see §2 — blocks any wide-sheet import |
| 2 | **Merge #272** | 65 suites green, `mergeable_state: clean`. Trey's call. |
| 3 | **App-side display of `metadata` and `decks[].strategy`** | the data is carried and validated; nothing renders it yet |
| 4 | **The wide reader still hard-codes six decks** | matters the moment Trey moves to a Master-tab-only workbook |
| 5 | 56 new upgrade cards defaulted to `B2` | several are staples; Trey may want them at B3 |
| 6 | `tools/sim/lib.mjs:123` prefers the plan price | last place market price and paid price share a field; left deliberately |

Details on every one in `docs/handoff-live-load-dynamic-decks.md` §4.

---

## 6 · Ground rules this repo enforces

- **Never skip, disable or quarantine a suite** to get a change through.
- **Run the browser suites for real:** `PAGE_BUDGET_REQUIRED=1 GEOMETRY_REQUIRED=1 bash
  runtests.sh -q`. Without the flags `page-budget` and `browser-geometry` self-skip and pass
  by not existing.
- **Never touch** `data/deck-ratings.json`, `data/simulation-summary.json`, `sim/` (measured
  results — only a re-run of the sweep may write a score) or `data/deck-guides.json`
  (hand-written). If a change makes one stale, say so and stop.
- **Market price is Scryfall's; the workbook's `$ Each` is what Trey paid.** Two numbers, and
  they must not share a field.
- **American English** in everything written for Trey — prose, comments, commit messages.

---

## 7 · Rebuilding from scratch

```bash
node tools/build-live-load.mjs      # picks the newest data/source/*Master*.xlsx by version
node tools/build-live-state.mjs
node tools/data-manifest.mjs && node tools/data-inventory.mjs
PAGE_BUDGET_REQUIRED=1 GEOMETRY_REQUIRED=1 bash runtests.sh -q
```

A data refresh is `node tools/refresh.mjs` and owns its own order; read
`.claude/skills/crankmagic-refresh/SKILL.md` before running it, and keep the tree clean while
it runs.
