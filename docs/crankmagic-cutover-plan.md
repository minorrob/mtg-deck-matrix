# Replacing the web app with CrankMagic

*Evaluation and cutover plan. Written 2026-09-07 against
`astra/simulation-fidelity-plan` at `86957c1` and `main` at `04491fc`.*

## 1 · What the branch actually is

Not a rewrite that discards the old app — an **additive front end over the same data**.
23 new modules (~210 KB) build a five-route application; the previous app is retained as
`legacy-decks.html`, `legacy-graph.html` and `matrix.html`, which keep their regression
coverage. `index.html` is now CrankMagic, `crankmagic.html` is a compatibility shell, and
`graph.html` forwards to `#discover`.

Still no framework, no build step, no package install. UMD modules ordered by the HTML,
exactly as before.

## 2 · Verified independently, not taken on trust

| Claim | Result |
|---|---|
| `bash runtests.sh -q` passes | **39 suites passed** — confirmed on a clean worktree |
| The app boots and routes work | **12/12 route loads** (6 routes × desktop 1400×950 and phone 390×780): every route rendered, no page errors, no horizontal overflow |
| The glossary is real | **335 terms**, 19 categories, each with a Comprehensive Rules citation |

The branch's own `docs/crankmagic-build-status.md` additionally claims 530 browser checks
(41 new + 30 recovery + the retained 459). Not re-run here; the thin smoke check above is
what this evaluation asserts.

## 3 · What it gains

- **A real collection model.** Exact printing lots, whole quantities, allocation kept
  separate from physical location, partial operations that split a lot, undo, archive,
  Sell/Trade and an audit trail. `collection-model.js` opens with the sentence that names
  the old bug directly: *"A planned hundred is a demand, never proof of a hundred owned
  cards."* The previous app inferred ownership from deck quantities. This is the
  "100% trustworthy way of managing owned cards" requirement, built.
- **Durable storage.** IndexedDB with real transactions, expected-revision checks,
  cross-tab notification, checksummed backup/restore, quota abort and damaged-record
  recovery — against `localStorage` JSON blobs.
- **The glossary**, with contextual hover/focus/touch definitions, and an explicit
  `simulationEligible: false` on its effect ratings so subjective numbers cannot leak
  into scoring.
- **Scale.** A 50,000-lot library reported paginated, sortable and filterable.

## 4 · What it costs, and the four things to fix

### 4a · The simulator is a generation behind — **blocking**

The branch deliberately held simulator work at `118fe39` and says so. Consequence:

| | `astra` | `main` |
|---|---|---|
| `sim-engine.js` | 118fe39 | +59/−3 (v2.6: fetch lands, gated Treasure) |
| `slot-model.js` | 118fe39 | +5 (Treasure mirror) |
| `data/deck-ratings.json` | v2.5 | **v2.6** |
| `data/simulation-summary.json` | v2.5 | **v2.6** |
| `combat.js`, `tests/combat.mjs` | absent | PR #79 (unmerged) |

**Merging `astra` as-is would revert every published score by one engine generation.**
`pilot-policy.js`, `deck-measure.js`, `measure-report.js`, `sim-lenses.js` and
`sim/opponents.json` are byte-identical, so the reconciliation is narrow and mechanical.

### 4b · Legacy state migration covers 4 keys of 22 — **blocking**

`user-state.js` registers **22** browser keys. `crankmagic-legacy.js` reads **4**:
`mtg-imported-decks.v1`, `mtg-viewer-inventory.v1`, `mtg-deck-matrix-custom-v1`,
`mtg-deck-matrix-browser-backup`.

Not read, and each is real user state: `mtg-variant-picks`, `mtg-catalog-source.v1`,
`mtg-manual-cards.v1`, `mtg-card-images.v1`, `mtg-viewer-archived.v1`,
`mtg-viewer.v1`, `mtg-owned-extras-import-v3`, `mtg-tuned-exclusions-v1`,
`mtg-graph-*` (four keys), `mtg-last-export-v1`, `mtg-load-undo-v1`,
`mtg-shop-extra-filters-v1`, `mtg-header-collapsed-v1`, `mtg-card-metadata-v2`,
`mtg-deck-matrix-state-v1`.

Some are cosmetic (a collapsed header). Several are not: picks, archived decks, manual
cards and owned-extras imports are things a person typed in and would notice losing.
Each needs a decision — migrate, deliberately drop, or export first — and the decision
has to be written down rather than made by omission.

### 4c · The code style is not this repository's — **not blocking, worth naming**

The new modules carry good file-level docstrings in the established voice. Their **bodies**
are compressed: no spaces around operators, several statements per line, lines up to 3,696
characters, and almost no inline comment.

| | bytes | lines | inline comment |
|---|---:|---:|---:|
| `collection-model.js` (new) | 33,634 | 130 | ~215 bytes |
| `crankmagic-app.js` (new) | 21,647 | 50 | ~76 bytes |
| `sim-engine.js` (current) | 92,394 | 1,738 | ~17,351 bytes |
| `combat.js` (current) | 15,862 | 313 | ~957 bytes |

The dense "why" commenting is the property that has repeatedly saved this project — every
engine bug found in the last two days was found by reading a comment that explained an
intent the code no longer matched. Losing it on 210 KB of new code is a real cost. It does
not block a cutover; it should be a stated, accepted trade or a follow-up.

### 4d · Deployment is unverified — **check before merging**

`.github/workflows/` contains only `compile-game-logs.yml`. `.nojekyll` is present, so the
site is presumably GitHub Pages from a branch. Whatever publishes the current site has to
be confirmed to publish the new `index.html`, and the retained legacy pages have to keep
resolving.

## 5 · The plan

Six steps. Steps 1–3 are the cutover; 4–6 are what makes it safe to keep.

**Step 1 · Reconcile the simulator.** Merge `origin/main` (`04491fc`) into the branch.
Expected conflicts are confined to `sim-engine.js`, `slot-model.js`,
`data/deck-ratings.json` and `data/simulation-summary.json`; take main's side on all four,
since v2.6 supersedes v2.5 and no card lists moved. Then run `tests/deck-measure.mjs` and
require the six published scores back: **77.60, 57.53, 82.33, 65.70, 79.57, 65.05**. If
they do not reproduce, the merge is wrong and nothing else proceeds.

**Step 2 · Decide the 18 unmigrated keys.** Produce a table — key, what it holds, migrate
or drop — and get it approved before writing any migration code. Then extend
`crankmagic-legacy.js` for the ones that migrate, and have the app say plainly what it did
not carry over. Add a test that fails if `user-state.js` grows a key the migration has
never heard of, so this cannot silently rot again.

**Step 3 · Verify on the real data.** Export current browser state, import it into
CrankMagic, and check that owned counts, deck assignments, archived decks and manual cards
survive. This is the step that matters most and the one no automated suite covers.

**Step 4 · Thin functional pass.** The 12-route smoke check already run, plus one
end-to-end path per surface: add a deck, mark a card owned, allocate it, shop it, undo it.
Not the full 459-check journey suite.

**Step 5 · Cut over.** Squash-merge to `main` behind a draft PR carrying this evaluation.
Confirm the deployed site serves the new `index.html` and that `legacy-decks.html`,
`legacy-graph.html` and `matrix.html` still load.

**Step 6 · Then, and only then, the simulator.** Connect the held Deck Lab stages, and take
the branch's own review seriously — it contains four criticisms of my simulator work that
are correct and that I had not made myself:

- **The `clock` attack policy reads `seat.winTurn`, which is an oracle.** It is the model's
  own internal schedule, not something a player could observe. Its +10.93 therefore cannot
  support coaching advice as it stands. Relabel it a benchmark and build an
  observation-limited policy to compare against.
- **`answerIsSpent` removes a card but never debits its mana**, checks colour, or requires a
  legal target. Multiple answers are counted against the same resources.
- **The published and lens protocols differ** and should carry different protocol
  identifiers rather than being reconciled by prose.
- **Do not tune combat until a retained blocker earns a positive delta.** This one I had
  reached independently and it is right: the −8.78 is evidence about the model, not a knob
  to turn.

## 6 · The recommendation

**Cut over, after steps 1–3.** The collection model is a direct answer to a requirement the
previous app got wrong, and it is better engineered than what it replaces. The blocking
issues are both narrow and mechanical — one merge and one migration table — and neither is
a reason to keep two applications alive.

The one thing not to do is merge it as it stands: that reverts the engine a generation and
silently drops eighteen keys of a real person's data.
