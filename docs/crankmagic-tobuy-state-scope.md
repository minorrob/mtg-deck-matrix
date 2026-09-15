# Scope: a "To buy" state of its own

**Status: scope only. Nothing here is built.** Written 15 September 2026, after Rob asked for
"owned, to buy, ordered" in the Add copies control and listed *watch* separately as something he
does afterwards — which says he wants **decided to buy** as a state distinct from **Watched**.

The short version: he is right that the state is missing, wrong about where it belongs. It is not a
fourth source on a copy record. It is a want list, he already keeps one, and what is missing is the
two gestures that would make it work. **Recommendation is Design C, one PR, no schema change.**

---

## 1. Three things the code already says

### The app had this state and deliberately removed it

`collection-model.js` migrates schema 1 → 2 with:

```js
if(l.source==='wanted'){l.source='watching';
  l.notes=[l.notes,'Was Wanted before Wanted and Watched became one status.']…}
```

There was a `wanted` source. It was merged into `watching`, and the comment above `SOURCES`
records the reasoning:

> `'watching'` is a card you are considering — an upgrade you might get to, a card you are keeping
> an eye on — **with no decision to buy declared; a deck's To Buy claim is that decision.**

So the original model put the buy decision on **the deck's requirement**, not on the card. That was
coherent while every card entered through a deck's list. It stopped being coherent when Discover,
the Table and Add copies started bringing in cards that belong to no deck — which is exactly where
Rob hit it. Re-adding the state is a reversal, and it should be an argued one, not an accident.

### He does not use Watched at all — he uses a group

From the committed `data/live-state.json`, 742 copy records:

| source | records |
| --- | --- |
| `owned` | 729 |
| `ordered` | 13 |
| `watching` | **0** |

And the groups:

| group | planned entries |
| --- | --- |
| **To Buy** | **55** |
| Upgrade Path | 67 |
| D4 Felothar Walls | 7 |
| D6 Krenko Goblins | 6 |
| Main Deck, Bench, To Trade | 0 |

**The want list already exists.** `To Buy` is one of the app's four starter groups, it holds 55
planned entries, and several carry their price in the notes (`"$0.40 each"`). Rob has been running
the fourth state by hand for months. A `wanted` source would be a second way to say the same thing,
and the two would immediately disagree.

### The gap is the two gestures, not the state

A planned entry already carries everything a want-list row needs — `cardId`, `quantity`, `price`,
`notes`, `pinned`. What it cannot do:

1. **You cannot get one from Add copies.** That dialog writes `acquire`, which makes a *lot*. Filing
   a planned entry is `groupEntries`, a different command, reachable only from Discover's send or
   the row menu's *Move / copy to group*.
2. **You cannot buy one.** `primary(r)` in `crankmagic-collection.js` gives a **Bought** button to
   `kind === 'need'` and to planned *lots*; `kind === 'entry'` falls through every branch and gets
   **no primary action at all**. Rob's 55 rows have no one-click path to becoming owned copies —
   he has to add the card again from scratch.

That second one is the actual bug. It is why the list feels like it is not a real state.

---

## 2. The naming problem, stated once

**"To buy" is already taken.** `M.STATUS` has `{id:'buy', label:'To buy', order:6}`, and `statusOf`
gives it to `kind === 'need'` — *an unfulfilled requirement of a deck's list*. It is a status pile on
the Table, a tab on the Cards page, a column in the buy export, and the thing `data/live-load.json`'s
`buy` array is built from.

Two different things cannot share that label: a deck's shortfall is derived and disappears when a
copy is reserved; a want-list row is something Rob typed and only he removes. If both read "To buy"
then the To buy tab, the To buy pile and the "$ to Max" figure each have to say which one they mean,
everywhere, forever.

Three ways out, in preference order:

- **Keep "To buy" for the deck requirement; call the want list "Wanted".** One word, already in the
  app's history (`wanted`), reads right next to Owned and Ordered, and needs no disambiguation
  anywhere. The Add copies dropdown would read Owned / Ordered / Wanted / Watched.
- **Keep "To buy" for the want list; rename the deck requirement "Short".** Truer to Rob's words, but
  it renames a label that appears in ~9 surfaces including his live data pipeline and the workbook.
- **Both say "To buy", scoped by context.** Cheapest to write, worst to live with. Not recommended.

Everything below assumes **Wanted**. Say the word and I will swap it; the work does not change, only
the string.

---

## 3. Three designs

### Design A — a fourth source, `wanted`

`SOURCES = ['owned','ordered','wanted','watching']`, `PLANNED = ['wanted','watching']`.

- **For:** exactly Rob's mental model — a row in Add copies, symmetric with the other two.
- **Against:** a want-list row becomes a *lot*, a copy record, in a table that means "copies I have
  a claim on". It gets a printing, a box, a paid price, an offer state, a `sameCopy` merge rule and
  an eligibility answer — none of which mean anything for a card you have not bought. It duplicates
  the To Buy group, and nothing reconciles the two. Schema bump to 4 and a migration for every
  saved backup.
- **Cost:** ~8 model call sites, 11 UI surfaces, a migration, the live-load builder, ~6 test files.

### Design B — a flag on a watching lot (`decided: true`)

- **For:** no new source, no schema bump if the field is optional.
- **Against:** every reader now has to ask two questions where it asked one, and `statusOf` — one
  expression the whole app reads — grows a branch that is not about source. All of Design A's
  "a plan is not a copy" objections still apply. It is Design A with worse ergonomics.
- **Not recommended.**

### Design C — the want list is the group it already is ✅

No new source, no new status, **no schema change**. Make the existing thing work:

1. **Add copies gains a Wanted row** that files a `groupEntries` command into the To Buy group
   instead of an `acquire`. Same dialog, same counter, same batch — the row's verb picks the command.
2. **A planned entry gets its Bought button**, so a want-list row becomes an owned or ordered copy in
   one click, and the entry is consumed.
3. **Planned entries read "Wanted"** when they sit in the To Buy group, and keep reading "Planned"
   in any other group — the group is what makes it a want, which is already true and merely unsaid.
4. **The Table gives Wanted a pile**, so a card can be dropped onto it, and dropping a wanted row on
   Bench/Ordered buys it — the same two gestures, on the mat.

- **For:** it is what Rob already does; his 55 rows light up the moment it ships, with no migration
  and no reconciliation. Prices already ride along in `notes`. One source of truth.
- **Against:** the want list lives in a group, so deleting that group deletes the list (the same is
  true today). "Wanted" is a status a row wears because of *where it is filed* rather than because
  of a field — a slightly subtler rule to hold, worth one comment in `statusOf`.
- **Cost:** ~1 model call site, 5 UI surfaces, 2 test files. No migration.

---

## 4. What Design C actually changes

### `collection-model.js`

- `statusOf` — one branch: an `entry` row in the To Buy group reads `Wanted`, any other group keeps
  `Planned`. This needs the group's identity on the projection row; `entry` rows already carry
  `groupId`, so it is a lookup, not a new field.
- `STATUS` — add `{id:'wanted', label:'Wanted', tone:'watch', order:6}` and renumber `buy`..`unassigned`
  by one. Order matters: Wanted sits between Watched and To buy, because it is a firmer intent than
  the first and a looser claim than the second.
- Nothing else. `PLANNED`, `eligibility`, `readiness`, `allocate`, `matrix` and `shortfall` are
  untouched, because no new copy record exists to confuse them.

### `crankmagic-collection.js`

- `acquire` — the row verb picks the command. Owned/Ordered/Watched → `acquire` as now; Wanted →
  `groupEntries` into `group:to-buy`. Mixed rows still go as one `batch`, which already works.
- `primary(r)` — `kind === 'entry'` gets the **Bought** button, wired to the existing `shop-buy`
  flow, which must then consume the entry (a `batch` of `acquire` + `removeGroupEntries`).
- `statusMenu(r)` — an entry can already be moved between groups; it gains the ladder rungs so
  Wanted → Ordered → Owned is one menu, like every other row.
- The Cards **To buy** tab — decide whether it lists deck shortfalls only (as now) or shortfalls
  *and* wants. **Open question, see §6.**

### `crankmagic-tabletop.js`

- A `Wanted` status pile, in `GHOST` (not a copy you hold) and in `TARGET` (a card can be dropped
  on it). `accepts()` gains a `case "Wanted"` — a catalog row or a watched card dropped there is
  filed into To Buy; an owned copy is refused with the reason.
- The existing `NOT_HELD` sentence gets shorter, because "file it in a collection group and it
  becomes a planned entry" now has a pile to point at.

### Data pipeline

- `tools/live-load.js` — `PLANNED_SOURCES` is unchanged (no new source). The builder should start
  emitting the To Buy group's entries so a workbook rebuild stops flattening them; today they
  survive only because the builder preserves existing group content.
- `data/live-load.json` / `live-state.json` — rebuilt, not reshaped.
- **The workbook does not have this column.** Rob's `Buy Order` sheet is a purchase order, not a
  want list. Either the sync skill learns to round-trip the To Buy group, or the group is
  app-only and the skill preserves it — which is what happens today and is probably right.

### Tests

- `tests/collection-model.mjs` — `statusOf` for an entry in To Buy vs. elsewhere; the status order.
- `tests/crankmagic-tabletop.mjs` — the Wanted pile's `accepts` answers for each row kind.
- `tests/uat/crankmagic-journeys.mjs` — the loop end to end: add a Wanted row, see it on the Table,
  press Bought, see an owned copy and the entry gone, in one revision.
- `tests/status-and-groupings.mjs` — the new status is in the one list and nothing spells it itself.

### Versions

`collection-model.js`, `crankmagic-collection.js`, `crankmagic-tabletop.js`, `crankmagic.css`, then
`crankmagic-app.js` + `crankmagic-sw.js` for the manifest, then re-record `asset-versions.json`.

---

## 5. Cost and risk

**One PR.** Roughly the size of the Add copies change (#227), plus the Table pile.

| Risk | Reading |
| --- | --- |
| Schema / data loss | **None.** No migration, no new field on any record. |
| Rob's live data | **Improves immediately** — 55 rows gain a status and a Bought button. |
| Naming collision | Resolved by "Wanted"; the only cost is one word he did not choose. |
| Regression surface | The `statusOf` branch is read by every list, pill and pile. It is one expression with one new condition, and the suites cover it. |
| The thing that could bite | `shop-buy` consuming an entry is a two-command batch; if the acquire succeeds and the removal does not, the card is both owned and wanted. It must go as one `batch` — which the model already guarantees is one revision. |

---

## 6. Decisions I need from you

1. **"Wanted", or rename the deck requirement?** Recommendation: Wanted. One word, no collision,
   no rename of a label your data pipeline uses.
2. **Does the Cards "To buy" tab list your wants as well as deck shortfalls?** They answer different
   questions — "what do my decks still need" vs "what do I want to pick up". Recommendation: keep
   the tab as deck shortfalls, and let the Table's Wanted pile and the To Buy group be the want
   list, so neither view has to explain itself.
3. **Should Watched survive?** You have never used it — zero records. If Wanted covers the intent,
   Watched may be dead weight, and retiring it would *simplify* the model rather than grow it.
   Recommendation: keep it this round, decide after a month of using Wanted.
4. **Design A anyway?** If you want it to be a genuine copy record — because you expect to record a
   printing or a price against a card before you own it — say so and I will scope A properly. It is
   real work, not a variant of C.
