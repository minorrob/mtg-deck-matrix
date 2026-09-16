# CrankMagic — session handoff, 16 September 2026

For whoever picks this up next, human or otherwise. Read §1 and §2 before touching anything.

## 1. Where the work is

Everything from this session is **merged into `main`**. The working branch,
`claude/mtg-deck-matrix-ui-fixes-f7om91`, is reset onto `origin/main` after every merge and
carries nothing of its own between PRs.

Shipped this session, newest first:

| PR | What |
| --- | --- |
| #234 | Table: a drag no longer shuts the drawer; the mat's way out takes Rob's words |
| #231 | Table: an open pile goes in a drawer, the board stays standing, the deck shelf goes |
| #229 | Scope doc: a "To buy" state of its own (docs only) |
| #228 | Upgrade Path: Decline beside Promote, both shops on the screen that decides the buy |
| #227 | Add copies: a status-and-count control, and the back-row geometry fix |
| #226 | Status from the Table, Return to the Table, the Escape contract |
| #225 | Decks hero rhythm |
| #224 | The deck shelf and the Bench as a pile |

**A second agent is working the Play tab in the same repository** (`codex/…` branches, PRs
#230, #232, #233, #235, #236). Expect `main` to move under you mid-review: three of this
session's merges hit a conflict, always in the same two files —

- `index.html`, where CrankMagic Online's `<link>`/`<script>` sit immediately above the
  `crankmagic-app.js` tag this side bumps. Keep both; take their online versions and your app
  version.
- `tests/fixtures/asset-versions.json`. Never hand-merge it: `git checkout origin/main --
  tests/fixtures/asset-versions.json && node tests/asset-versions.mjs --update`.

## 2. Standing rules

- **Merge each piece as you finish it.** Draft PR → ready → squash-merge → reset the branch onto
  `origin/main`. Rob does not review a queue.
- **Never write `Treys MtG Master v13.xlsx`.** It is Rob's file. Read it, commit a copy under
  `data/source/`, and rebuild from that.
- **The `?v=` chain.** Any served file you edit gets its `?v=` bumped in `index.html`,
  `crankmagic.html` and `crankmagic-sw.js`. A change to the service worker's manifest bumps
  `crankmagic-sw.js?v=` **inside `crankmagic-app.js`**, which bumps `crankmagic-app.js?v=` in the
  three files. Data files (`data/cards.json`, `card-facts.json`, `graph.json`) are named in
  `crankmagic-assets.js` and the sw's `DATA`/`RUNTIME` lists, so bumping them bumps
  `crankmagic-assets.js` too, and round it goes. **Record last**, after every edit:
  `git checkout origin/main -- tests/fixtures/asset-versions.json && node tests/asset-versions.mjs
  --update && node tests/asset-versions.mjs`.
- **Regenerate, then re-record.** After any data change:
  `node tools/data-manifest.mjs && node tools/data-inventory.mjs`, in that order and *after* the
  `?v=` bumps — the manifest records the versions.

## 3. The gates, and how to run them

```sh
python3 -m http.server 8790 --bind 127.0.0.1 &      # it dies; ERR_CONNECTION_REFUSED means restart it

export UAT_PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.js \
       UAT_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
       UAT_BASE=http://localhost:8790 GEOMETRY_REQUIRED=1 PAGE_BUDGET_REQUIRED=1

bash runtests.sh -q                       # 62 Node suites — this is what CI runs
node --test game/tests/*.test.mjs         # 39 companion tests — CI runs this too
node tests/uat/crankmagic-journeys.mjs    # ~468 checks, NOT in CI
node tests/browser-geometry.mjs           # 102
node tests/page-budget.mjs                # 68
PLAYWRIGHT_HOME=/opt/node22/lib/node_modules/.. node tests/uat/tour-walk.mjs   # 7 tours, 62 steps
```

**To drive the real 1,249-card library in a browser**, use the harness rather than hand-rolling a
restore (a direct `CrankExchange.readBackup` + `repo.replace` fails with "Unsupported collection
schema"):

```js
import {openBrowser, loadLiveState} from './tests/uat/browser-runner.mjs';
```

### The one failure that is not yours

**The G0 lobby's 14 journey checks time out on `.cm-lobby-rules`.** `crankmagic-online.js` assigns
`C.views.game` and loads *after* `crankmagic-game.js`, so CrankMagic Online replaces the lobby
rather than sitting beside it: seating opponents, the bracket, and the by-number refusal of a list
that is not a hundred are unreachable, and `crankmagic-game.js` still ships as dead code. Verified
red on `origin/main` itself by running main's own journeys against a worktree of main. It belongs to
the Play-tab agent. Until it is resolved, run the journeys with that block excised to gate your own
work, and never commit the excision.

## 4. Traps this session paid for

- **`setPointerCapture` retargets the click that follows.** A captured pointer sends the trailing
  `click` to the capturing element, and `preventDefault` on a *pointermove* does not suppress it.
  This bit twice: once on ticks (fixed by moving the capture off the press) and once on drags
  (fixed by stamping when a moved drag ended and swallowing a click within 400 ms).
- **CSS specificity.** `#matrix-v2 :is(button,input,select){color:inherit}` and
  `#matrix-v2 .cm-form-grid select{width:100%}` outrank any bare class. Prefix new rules with
  `#matrix-v2`.
- **`preventDefault` on a keydown cancels a popover's own close-watcher**, leaving the menu stuck
  open. The Escape contract is `hooks.onClear("escape")` returning `false` to decline the key
  *before* `preventDefault`.
- **Python edit scripts**: verify exact line fences first and assert on leftovers before writing.
  Three scripts failed mid-edit this session; each threw before the write, which is the only reason
  the files survived.

## 5. Open decisions, waiting on Rob

1. **"To buy" as a fourth state** — `docs/crankmagic-tobuy-state-scope.md` recommends Design C and
   asks four questions (the name "Wanted"; whether the To buy tab lists wants; whether Watched
   survives; whether he wants Design A after all). Nothing built.
2. **Four card swaps** — `docs/crankmagic-new-cards-2026-09-16.md` §2. One is a clean win
   (Great Forest Druid for Saruli Caretaker in D4); three are trades with the loss named. $9.52 of
   a $74.44 buy list.
3. **The workbook's Bracket / Purpose / Mechanic columns** for the 56 new rows are still blank. The
   app derives all four itself, so nothing is broken; the workbook is simply behind. Filling it
   means writing Rob's file, which nothing does without him asking.

## 6. Held, by Rob's instruction

- **#291** — the scope of a model's influence, if one were added. *"We'll create that plan/scope
  after everything else is done so don't do that now."*
- **#258** — persistent CrankMagic with accounts, sync and its own domain. Plan only, not now.
- **§2.13** free pile placement on the Table. Held.
- **The substitute columns** (`D1-S`..`D6-S`, `Sub For`, `Sub Status`). An importer that read them
  was written and reverted: *"Don't use those columns."* A substitute is derived, by Rob's rule —
  **in actual but not in target** — which is what `collection-model.js` already does and what the
  live state already carries (75 substitute copies across the six decks).

## 7. The data, as of this handoff

Rebuilt wholly from `Treys_MtG_Master_v13.xlsx` (16 September, now committed under `data/source/`):

| | |
| --- | --- |
| Decks | 6, every target column summing to 100 |
| Owned | 1,249 copies (589 in deck boxes, 660 on the bench) |
| Identities / copy records | 808 / 802 |
| Ordered, in flight | 13 |
| To buy | 66 copies, $74.44 |
| Upgrade Path | 67 rows |
| Substitutes (in actual, not in target) | 75 |
| Card records | 2,186 (55 added this session) |

Per deck: D1 96/100 · D2 90/100 · D3 80/100 · D4 87/100 · D5 84/100 · D6 88/100. None ready.
