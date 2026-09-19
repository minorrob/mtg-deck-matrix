# Handoff — make the Live Load carry any number of decks

**For:** a fresh Claude Code session on `minorrob/mtg-deck-matrix`
**Goal:** the Live Load reads **how many decks the workbook defines** and builds exactly that many, instead of assuming six. Adding D7 (or D7–D12) becomes a workbook edit, not a code edit.
**Written:** 2026-09-19, from the cloud session that did the data refresh.

---

## 1 · The one-sentence version

`tools/build-live-load.mjs` line 48 is:

```js
const DECKS=['D1','D2','D3','D4','D5','D6'];
```

Everything downstream is driven off that array. Replace it with a list **discovered from the workbook's own column headers**, and most of the job is done. The rest is a second hardcoding (column letters), a handful of consumers, and one test that pins the number 6.

---

## 2 · What is already dynamic (do not rebuild it)

Verified before writing this — these need no work:

| Thing | Why it is fine |
|---|---|
| `data/live-load.json` | Already stores `decks` as an array of objects. Its count **is** `decks.length`. No schema change needed. |
| Column lookup | `build-live-load.mjs:73` finds columns by **header name** (`col('D1-T')`), not by letter. Give it more ids and it finds more columns. |
| The browser | No app-side file assumes six. Every `slice(0, 6)` in `crankmagic-*.js` is unrelated display truncation (loops, error lists). The app reads `decks` generically. |
| `schema/index.mjs:28` | Registers `live-load@1` with `main: "decks"` — a count, not a fixed shape. |

**Start from this.** The instinct will be to redesign the data model; it does not need redesigning.

---

## 3 · The actual work

### 3.1 Discover the deck ids — `tools/build-live-load.mjs:48`

Replace the constant with discovery from the Master sheet's headers. The ids are whatever `D<n>-T` columns exist. Suggested shape:

```js
/* THE DECKS ARE WHATEVER THE WORKBOOK DEFINES. Every D<n>-T column in the Master
   header is a deck; its D<n>-A partner is that deck's box. Discovered rather than
   listed, so adding D7 is a workbook edit and not a code edit. */
function decksIn(header) {
  const ids = header
    .map((h) => /^(D\d+)-T$/.exec(String(h || '').trim()))
    .filter(Boolean)
    .map((m) => m[1]);
  const seen = new Set(ids);
  ensure(seen.size === ids.length, `duplicate deck target columns: ${ids.join(', ')}`);
  ensure(ids.length > 0, 'the Master sheet defines no D<n>-T column, so there are no decks to build.');
  for (const id of ids) ensure(header.includes(`${id}-A`), `${id} has a target column (${id}-T) but no box column (${id}-A).`);
  return ids.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}
```

Then thread that list through instead of the constant. Every current use is already `DECKS`-shaped, so this is mechanical:

| Line | Use | Note |
|---|---|---|
| 73 | `t:DECKS.map(d=>col(d+'-T')), a:DECKS.map(d=>col(d+'-A'))` | works unchanged |
| 91 | each target column must sum to 100 | works unchanged — now enforced for D7 too |
| 100 | Decks sheet → commander/name, filtered by `DECKS.includes(id)` | works unchanged |
| 104 | builds the `decks` array | works unchanged |
| 112 | `inDeck[id]` per deck | works unchanged |
| 156, 170, 186 | upgrades / buy / plans rows filtered by `DECKS.includes(deck)` | works unchanged |

### 3.2 The second hardcoding — `tools/build-live-load.mjs:49`

```js
const EXPECTED={own:'P',buy:'Q',ordered:'S',t:['W','X','Y','Z','AA','AB'],a:['AE','AF','AG','AH','AI','AJ']};
```

This pins the **column letters**. A seventh deck shifts everything after `AB`, so this guard will fire even after 3.1 is done.

It exists to catch a workbook whose columns silently moved. Do not simply delete it — that guard has value. Replace the fixed letters with a **structural** check:

- the `D<n>-T` columns are contiguous and in id order;
- the `D<n>-A` columns are contiguous and in id order;
- the `-A` block starts after the `-T` block.

That keeps the protection (a scrambled sheet still fails loudly) without freezing the width. Keep `own`/`buy`/`ordered` as they are — those do not move.

**Decide and state which you did**, because it is a real trade-off: a structural check is more permissive than a letter check, and Trey's workbook is hand-maintained.

### 3.3 The test that pins the number

`tests/live-load.mjs:72`:

```js
eq(real.state.decks.length,6);
```

This is the assertion that will fail the moment a D7 exists. Make it read the count from the built Live Load rather than from a literal — the point of the test is that every deck came through `final`, not that there are six.

These are **fine as-is** and need no edit (they use `>=`, which survives expansion):

- `tests/crankmagic-lobby.mjs:37` — `decks.length >= 4`
- `tests/data-integrity.mjs:534` — `decks.length >= 6`

### 3.4 Consumers to check (not yet verified — confirm each)

Found by grep; **I did not trace their behaviour**, so treat this as a to-check list, not a to-change list:

| File | What it says |
|---|---|
| `tools/apply-deck-master.mjs:11,149` | sums "in hand and ordered across the six decks and the bench" |
| `tools/sim/rate-decks.mjs:2,31` | "re-measure the six real decks", writes `data/deck-ratings.json` |
| `tools/build-card-records.mjs:3` | record set covers "the library, the six decks, the ladders" |
| `tests/crankmagic-tabletop.mjs:44` | asserts the boxes pile is `> 400` cards |
| `tests/crankmagic-change.mjs:44,99` | change rows across the decks |
| `.claude/skills/crankmagic-live-load-sync/SKILL.md:29-30` | documents `D1-T…D6-T` (W–AB) and `D1-A…D6-A` (AE–AJ) |

The skill file **must** be updated — it is the instruction sheet for the workbook format, and leaving it at D6 will send the next Live Load sync back to six.

### 3.5 Not the same thing — do not get pulled in

`tests/data-integrity.mjs:29` asserts `variants.decks.length === 10` and 50 variants. That is `data/archive/variants.json` — the **simulation variants** archive (ten deck roles, five variants each), a different axis from the Live Load's real decks. Adding D7 to the Live Load does not imply a variant role. Leave it alone unless Trey asks.

---

## 3.6 · The price rule — market is Scryfall's, the workbook's is what Trey paid

**Stated by Trey directly, 2026-09-19. It is a domain rule, not a preference, and it
is currently only half-implemented.**

> The card price should always come from the Scryfall API. Sometimes the prices in the
> spreadsheet will be the price I paid for it. Always use the price in the spreadsheet
> as what I paid for the card, not as its market price, if the card is marked as owned.

Two different numbers have been sharing one field. Keep them apart:

| Number | Source of truth | Means |
|---|---|---|
| **Market price** | Scryfall, always | what the card costs to buy today |
| **Paid** | the workbook's `$ Each`, for rows with `Own > 0` | what Trey actually spent |

### What already obeys this (verified, leave alone)

- `collection-model.js:105` states the rule in so many words: *"a price is the catalog's,
  `paid` is per copy"*. `readiness()` accumulates `paid` and `marketValue` as **two separate
  figures**, and lots carry `paidSource` ∈ `catalog | receipt | typed`. The model is already
  built for this.
- `tools/build-live-state.mjs` prices from the bundled catalog plus a Scryfall fetch and
  records `priceSource`/`priceUpdated`. Market price there is Scryfall's.

### What violated it, and is now fixed

`tools/sim/lib.mjs:123` builds every list entry as `entry.item.price || meta.price`, so a
price frozen in a buy plan beats the card record. `tools/sim/reprice.mjs` therefore
republished stale quotes instead of re-pricing. Fixed in `6e3faa6` by pricing against the
audited catalog — **in reprice.mjs, not in lib.mjs**, because that helper also feeds the
measurement tools and a price a deck was measured at must not move under a published score.

`lib.mjs:123` itself is untouched and still prefers the plan price for every other consumer.
Check each one against the rule above before changing it; it is not automatically wrong,
because "what this cost when bought" is a legitimate question.

### Done — the buy list (commit `73e5459`)

`build-live-load.mjs` now prices the To Buy list from `bundledLookup`, which resolves
against `data/cards.json`, rather than from the workbook's `$ Each`. The preserved
"Wanted" entries go through the same path. On the committed file this moved the To Buy
total from **$74.44 to $100.47** — the shopping list had been understating the spend by a
third, with `Night's Whisper` quoted at $0.29 against a record-set price of $5.45.
`data/live-load.json` and `data/live-state.json` were rebuilt from the v13 workbook; the
diff is exactly `savedAt` and the buy prices.

### What is STILL NOT implemented — this is the gap to close

**The workbook's `$ Each` never reaches the app as `paid` for owned cards.**

- `tools/build-live-load.mjs:124` carries the price **only on the buy list**:
  `cards.filter(c=>c.buy).map(c=>[c.name,c.buy,c.price])` — cards not yet owned.
- In `data/live-load.json`, a buy row is `["Adarkar Wastes", 2, 0.4]` (name, qty, price)
  but an owned row is `["Advanced Reconstruction", 1]` — **name and quantity only**. The
  price is dropped.
- So for every card Trey owns, what he paid is thrown away at import, even though
  `collection-model.js` has `paid` and `paidSource: 'typed'` waiting for it.

Closing it means carrying `$ Each` through for rows with `Own > 0` and landing it on the
lot as `paid` with `paidSource: 'typed'` — **never** as the card's price. Market price stays
Scryfall's. The buy-list half above is the worked example of the same rule, so follow its
shape: resolve through `bundledLookup`, keep the workbook figure only as a fallback, and
rebuild both library files so `tests/generators.mjs` (which runs
`build-live-load.mjs --check`) stays green.

> **The workbook is in the repo**: `data/source/Treys_MtG_Master_v13.xlsx`, which is the
> one `data/live-load.json` names. `node tools/build-live-load.mjs` with no argument picks
> the newest `data/source/*Master*.xlsx` and finds it, so you can rebuild and verify without
> anything from Trey.
>
> *(An earlier revision of this document claimed the repo only carried up to `v3`. That was
> wrong — a truncated `find` misread as the whole listing — and it is corrected here.)*

This pairs naturally with the dynamic-deck work because both are changes to the same
importer, and both need the workbook in hand. Confirm with Trey whether he wants them in
one PR or two.

## 4 · The workbook side

Trey maintains the Master workbook by hand, so the format doc has to move with the code.

- Current layout: `Card` (A), `Own` (P), `Buy Count` (Q), `Ordered` (S), `$ Each` (R or T — **check, the skill and the builder disagree**), `D1-T…D6-T` (W–AB), `D1-A…D6-A` (AE–AJ).
- A seventh deck adds `D7-T` and `D7-A`. Whether those append to each block (shifting `-A` right) or go elsewhere is **Trey's call** — ask before assuming.
- Each `D<n>-T` column must sum to exactly 100. The builder enforces this (line 91) and will now enforce it for the new deck too.
- The `Decks` sheet needs a row for the new id, with its commander and name, or the deck builds nameless.

> ⚠️ I noticed but did not resolve a discrepancy: `.claude/skills/crankmagic-live-load-sync/SKILL.md:29` lists `$ Each` at **T**, while the xlsx template produced earlier in that session used **R**. Confirm against the real workbook before changing either.

---

## 5 · How to verify

```bash
node tools/build-live-load.mjs <workbook.xlsx>   # rebuild
bash runtests.sh -q                              # all suites
```

Specifically:

1. **Prove the discovery works before trusting it.** Build once with the six-deck workbook and confirm the output is byte-identical to the committed `data/live-load.json` apart from the timestamp. If it is not, the discovery changed behaviour for the existing decks and that is a bug, not progress.
2. Then add D7 to a **copy** of the workbook and confirm `decks.length` is 7 and the new deck's hundred sums to 100.
3. `bash runtests.sh -q` must be green. **Never skip, disable or quarantine a suite to get through** — that rule is load-bearing in this repo.

**The house rule on tests, which the last two sessions both had to learn:** a test that cannot fail is a comment. If you change an assertion, break the code deliberately, watch the test go red, then restore it. Several "passing" checks in this repo were passing because they never ran or could never fail.

---

## 6 · Never touch

From `.claude/skills/crankmagic-refresh` and `docs/crankmagic-refresh.md`, and they apply here too:

- `data/live-state.json` — the reader's own library.
- `data/deck-ratings.json`, `data/simulation-summary.json`, `sim/` — **measured** results. A score is a claim about a protocol and an exact list; carrying one forward onto a different list is the one dishonesty this codebase is built to prevent. Only a re-run of the sweep (`tools/sim/rate-decks.mjs --write`) may write a score.
- `data/deck-guides.json` — hand-written.

If adding a deck makes a measured file stale, **say so and stop** — do not rewrite the numbers to make a suite green.

---

## 7 · Branch state when this was written

Work in flight on `claude/data-refresh-2026-09-19` ([PR #272](https://github.com/minorrob/mtg-deck-matrix/pull/272)), off `main` at `fe4e041`:

| Commit | What |
|---|---|
| `2553e39` | Explore read the graph URL from a hardcoded `?v=18` that nothing ever updated |
| `f669a33` | `tools/refresh.mjs` silently dropped the alphabetically first changed file from every version bump |
| `02f891e` | the manifest was written before the version bump, so it was always one version stale |
| _pending_ | the data refresh itself, plus a `reprice` + `rate-decks` re-measurement |

**Branch off `main`, not off this one**, unless #272 has merged by the time you start. Nothing in #272 touches `build-live-load.mjs`, so there is no conflict either way.

---

## 8 · Definition of done

- [ ] `build-live-load.mjs` derives its deck list from the workbook; no `D1..D6` literal remains.
- [ ] The column guard is structural, and which trade-off was taken is stated.
- [ ] Rebuilding the **existing** six-deck workbook produces the same output as today (timestamp aside).
- [ ] A seven-deck workbook builds seven decks, each hundred summing to 100.
- [ ] `tests/live-load.mjs` no longer pins the literal `6`.
- [ ] `.claude/skills/crankmagic-live-load-sync/SKILL.md` describes the dynamic format.
- [ ] `bash runtests.sh -q` green, with no suite skipped or weakened.
- [ ] The workbook's `$ Each` lands as `paid` (with `paidSource: 'typed'`) for rows with
      `Own > 0`, and **never** as the card's market price, which stays Scryfall's (§3.6).
- [ ] Draft PR opened, saying plainly what was proven and what was assumed.
