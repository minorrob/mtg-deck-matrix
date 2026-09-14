# CrankMagic — current state and handoff

Last updated 13 September 2026, late. Written so the next session can start work without
reading a transcript. **Read the first section before anything else.**

## 13 September 2026 — where things stand, and the two sessions

**Two cloud sessions share this repository and this working branch**
(`claude/mtg-deck-matrix-ui-fixes-f7om91`), and both carry the title "MTG Deck Matrix UI
fixes". Neither can read the other's conversation; git, the PR bodies and this file are the
only shared record.

| Session | Ran | Shipped | Left open |
|---|---|---|---|
| A — `session_01JxaMVGPFVWfBLPd3PXM1PR` (since 23 Aug, the long one) | 23 Aug → 11 Sep 04:10, then 12 Sep 20:12 → now | #133, #152–#168 | Phase C of the Discover / loop plan |
| B — `session_01JomnBiZWAGVBCFXBt3QbQk` (Opus, opened when Rob said "merge #133 then I'll switch to Opus") | 11 Sep 04:15 → 12 Sep 19:44 | #134–#151, `tools/screens.mjs`, the `docs/screens/*` sets | **Licensing**: its analysis recommended a proprietary licence (BSL or dual-licence), `data/` scoped out of the grant, a Wizards Fan Content disclaimer, and it is waiting for a go-ahead to write `LICENSE`, `NOTICE` and a README section. No `LICENSE` file exists today. |

A session resuming from a compaction summary sees only its own recent window. Session A's
summaries of 12–13 September never contained session B's work, which is how a question
about "old screenshots" was answered from the wrong record on 13 September: the last
screenshots session A had sent before the switch were 4 September's, one of them the retired
Trey's Deck Matrix. Anything either session needs the other to know goes in this file.

**Merged 12–13 September, in order** (B = session B, A = session A):

| PR | What | By |
|---|---|---|
| #150 | Lands are a mode, not a node; the filters are a dropdown over the page | B |
| #151 | Ownership rebuilt from Rob's owned-cards sheet: 623 cards, 1,156 copies | B |
| #152 | Load Live rebuilt from Master v13, with the Option flag and a workbook importer | A |
| #153 | Deck page: one summary card, actions in the hero; menus follow their button; hover art with a spinner | A |
| #154 | Discover filters: a grouped bar with a dialog per facet, mana value and a Mana facet | A |
| #155 | Collection: a Spreadsheet view, the Master sheet read from the library | A |
| #156 | Stand-ins: a copy in the box that the list does not call for fills a seat | A |
| #157 | In box means the box: physical counts everywhere, and a How-it-works page | A |
| #158 | Reserved, Owned, Substitutes, In Physical Deck: schema 2 and the six state decisions | A |
| #159 | Share menu (Subscribe, e-mail, QR), Deck Lab starting points, card pop-up rows, Ready to add | A |
| #160 | Simulation reports carry their hundred: file with the source deck, spin off a variant | A |
| #161 | "Physical deck" wording; Ready to add in place of the pull sheet | A |
| #162 | Option A of the simplification plan: the name is the heading, one primary action, six filters, glossary terms on request | A |
| #163 | Cards: Collection and Shop as one page (Library · To buy · Orders, Sheet view, Status column); nav reads Decks · Cards · Build · Discover | A |
| #164 | The sidebar opens the page you are on: Cards shows its tabs, Decks lists the decks | A |
| #165 | `docs/crankmagic-persistent-plan.md` — accounts, sync, crankmagic.com on a hosted runtime; plan only | A |
| #166 | Deck page Progress keys and Paid ≈ list price; Select all per Ready-to-add group; Sheet fixes; × on scope chips; header tightened, wordmark never clipped | A |
| #167 | Discover: Primary Purpose in gold, filter counts under the filters, Yours in green, a deck pick focuses its commander, the picture grows with the pane; `docs/crankmagic-discover-loop-plan.md` and `docs/crankmagic-loop-patterns.md` | A |
| #168 | The loop vocabulary — untap, copy, blink, counter removal, extra turn, cost reduction, tap-ability — read from rules text, the whole graph re-derived, Thornbite Staff rings untap | A |
| #170 | Phase C: loop joins (engine → tap ability, supply → demand), the cycle finder `crankmagic-loops.js`, Loops only on the depth gauge, Loops this card is in | A |
| #171 | Option B PR 3: the deck page as five tabs (Overview · Cards · Guide · Upgrades · History) on `?tab=`, the Next line, the phone action bar; deck-page budget re-based | A |
| #172 | Three plans, nothing built: the Trace on the graph (`docs/crankmagic-strategy-trace-plan.md` + mock-up), the Tabletop view of Cards (`docs/crankmagic-tabletop-plan.md` + two mock-ups), and the data-model evaluation that comes first (`docs/crankmagic-data-model-evaluation-plan.md`) | A |
| #173 | Discover: the card pop-up is the picture, four facts, the Primary Purpose and the join, opened beside its node; the term list moves to Inspect card as "Terms the graph reads" | A |
| #174 | E0 of the data-model evaluation: the generated data inventory (`tools/data-inventory.mjs` → `docs/data-inventory.md`, checked by the generators suite) and the report with the ranked recommendations (`docs/data-model-evaluation-2026-09.md`) | A |

Also on 13 September: stale PRs #80, #2 and #54 closed (superseded); the 25 branches behind
closed and merged PRs were verified safe to delete but the session's credential cannot delete
branches (GitHub answers 403), so they are still on the remote — the one-line
`git push origin --delete …` command was given to Rob in session A. `claude/fervent-hawking-f9565f`
is session B's paused P0 work-in-progress (six commits, superseded by #135) and its hand-off
notes; it was kept.

**Plans that govern what comes next**

- `docs/crankmagic-discover-loop-plan.md` — Phases A and B shipped (#167, #168). Phase C is
  next: the three directed edges the new vocabulary allows, a cycle finder (acceptance: the
  Krenko + Thornbite Staff + Bombardment loop, Niv-Mizzet + Curiosity), and a loop-mode depth
  gauge. Phase C shipped (#170); loop mode is on by default with a deck pick, as proposed. **Phase D is held** on Rob's instruction of 14 September. The order of work he set: the data-model evaluation first (`docs/crankmagic-data-model-evaluation-plan.md`; **E0 done in #174**, E1 the Card record next), then the two major enhancements as their own phases — the Trace (`docs/crankmagic-strategy-trace-plan.md`, T0–T4, mock-up in `docs/mockups/strategy-trace.html`) and the Tabletop (`docs/crankmagic-tabletop-plan.md`, TB0–TB4, mock-ups in `docs/mockups/`) — then Phase D. All three plans shipped in #172 and await Rob's review; the Discover pop-up change shipped as #173.
- `docs/crankmagic-persistent-plan.md` — accounts, per-user sync, crankmagic.com on Vercel +
  Supabase. Not started; nine decisions listed in the document.
- `docs/ux-plan-2026-09-11.md` — executed by session B. Its §7 data items are still Rob's:
  `definition.mechanics` per deck in `data/live-load.json`, and vendor / order references on
  the ordered copies.

**Gates now:** `GEOMETRY_REQUIRED=1 PAGE_BUDGET_REQUIRED=1 bash runtests.sh -q` runs **56
suites** (the README states the count and `tests/data-integrity.mjs` checks it);
`tests/uat/crankmagic-journeys.mjs` is at **180 checks**; the geometry and page-budget suites
run in the browser and fail on a clipped wordmark. Walks in the sandbox show **no card art**:
`tests/uat/scryfall-stub.mjs` answers every image with a one-pixel PNG, so panes and nodes
fall back to their placeholder colours. That is the harness, not the app.

**Housekeeping still open:** the `docs/screens/*` sets are from 8–12 September (refresh with
`tools/screens.mjs <name>` or remove the folder); `prototype/slot-ladder.html` is the last
old-style page the site still serves; the licensing go-ahead above.

---

## 11 September 2026, later — the list rework, the divider, and the whole-format graph

Three more PRs after the plan, in the order the owner asked for them:

| PR | What | Merge |
|---|---|---|
| #145 | Discover list reads Card · Link · Color · Price with a caret-only Add/Buy; a row opens the inspect content in place; the pane keeps its width when List opens; the Filters bar toggles across its full height | squash |
| #146 | A draggable divider between canvas and pane, width kept per device and mode in localStorage; the list sheds Link, then Color, then Price as the pane narrows | squash |
| #147 | The shipped graph is the whole format: every Commander-legal card (31,830), every legal commander (3,411), EDHREC co-play for each (701,916 links). A "?" beside the card count explains the universe from the file's own figures | see PR |

**Then #150: lands are a mode, and the filters are a dropdown.** Lands are off the
graph entirely. "Lands only" (Filters → Lands) turns Discover into a full-width sortable
list of every land that passes the other filters, with an Enters column and an Enters
facet (untapped / tapped / tapped unless); picking a spell in Find a card leaves the
mode. The filter panel floats over the page under the Filters bar instead of pushing
the page down; Done, Escape, or a click outside closes it. Facet picks and facet groups
carry a left rail and a bottom rule rather than a box. Vehicles and Equipment joined the
play-style vocabulary that reads a deck's mechanics.

**Then #148: lands by how they enter.** The classifier files every land under one of
`enters-untapped`, `enters-tapped` or `enters-tapped-unless` (a condition: shocks, checks,
fast and slow lands), read off the land's own sentences. It is a Mechanic facet value, so
Card type = Land plus Mechanic = enters-untapped is the filter; the graph does not join
lands on it and the deck-mechanics reading ignores it. The bake was rewritten with
`tools/graph-amplifiers.mjs --all --from-bulk`; the next full pipeline run carries it
through 02-build-csv.

**How the graph was built this time.** Neo4j 5.26 Community was stood up inside the
session container (no docker), pointed at `graph/.import`, and the pipeline ran
unchanged through it: `01-fetch --prices`, `02-build-csv`, `03-load`, `04-fetch-edhrec
--universe`, `05-build-edhrec-csv`, `06-load-edhrec`, `07-export-app --universe`, then
`tools/graph-amplifiers.mjs --from-bulk`. The same steps on the owner's docker workshop
produce the same file. EDHREC has no page for 29 Backgrounds (it files them as partners),
so those ship without co-play edges.

**Why the file is packed.** 700k edges as objects with two oracle ids each were 98 MB,
past GitHub's 100 MB limit with the cards. `graph-payload.js` writes edges as
`[from, to, inclusion, synergy, decks]` against the card list and art/buy links as the
one id each is built from: 38 MB on disk, 11 MB gzipped. `card-catalog.js` unpacks on
load, so nothing else sees the packed shape.

**Latent bugs the bigger file exposed, fixed in #147.** The catalog now keeps its own
price when a graph card merges over it (the bake's prices are a different day's). The
Shop's band header now sums the parts of a folded row, so it agrees with the strip when
an unassigned group holds priced wants. The bake reads a transform card's power off the
first face that has one, matching `tools/add-power-toughness.mjs`.

## 11 September 2026 — the UX plan is executed

`docs/ux-plan-2026-09-11.md` was carried out in order, one squash-merged PR per block, and
Rob's follow-on (a List tab on the Discover pane) after it:

| PR | What | Merge |
|---|---|---|
| #134 | Foundations: status tokens and pills, readiness segments, one button scale, SVG carets, geometry row check, `tools/screens.mjs` | `6b69267` |
| #135 | P0: money on the buy list (`crankmagic-rules.js`, paid stamping, Shop strip, Bought/Ordered/Arrived, export), "to pull" on the deck page and tiles, jump bar, the pull sheet (`crankmagic-pull.js`) | `f7656dc` |
| #136 | 3.4 Orders per order (`order` records, `crankmagic-orders.js`, receipts) | `eeee0dd` |
| #137 | 3.5 Upgrade Path panel (options carry tier / why / price) | `e60f035` |
| #138 | 3.6 Budget card, definition placeholders | `fb056d2` |
| #139 | 3.7 Game record read-back (`game-record.js` now loaded by the app) | `5ad2fc5` |
| #140 | 3.8 Row verb on the row, menu in four sections | `b51c247` |
| #141 | P2 consistency (fold by card, filter chips, scroll reset, page size, phone cards…) | `757f50b` |
| #142 | P3 polish, and the live-state rebuild keeping its prices | `4a925fe` |
| #143 | Discover List tab beside Card Info, pane widens while open | this PR |

**The one thing that went wrong on the way:** the rebuild of `data/live-state.json` in #137
ran without the `--scryfall` file the original build used and dropped 124 prices; #142 made
the builder carry forward every price the committed file holds. The reconciled live totals
are now Σ per-deck `$ to finish` = **$111.87** = Shop strip = Σ band subtotals (they read
$111.46 before #137 with fewer priced cards, and $74.69 between #137 and #142).

**Gates as of #143:** `bash runtests.sh -q` 52 suites; `tests/uat/crankmagic-journeys.mjs`
83 checks; `tests/browser-geometry.mjs` 78 checks at six widths. `tools/screens.mjs <name>`
shoots the plan's five views with the live state and prints the totals; each PR's set is
under `docs/screens/<name>/`.

**Still open, for Rob (§7 of the plan):** `definition.mechanics` per deck in
`data/live-load.json` (every tile says nothing under the commander until then), and vendor /
order references on the ten ordered copies now that orders have a home. Rebuild with
`node tools/build-live-state.mjs` — it keeps prices now.

**Conventions learned:** bumping `crankmagic-sw.js?v=` edits `crankmagic-app.js`, so bump
both or `asset-versions --update` refuses; after a squash merge reset the working branch to
`origin/main` (force-with-lease) before the next PR; the deck overview waits on Scryfall,
so screenshot tools wait for a per-route landmark; `Number(null)` is 0 — guard prices.

Everything below describes the state as of 8 September and is still accurate for the
modules it names.

---

## Where things stand

The app is a zero-dependency static site on GitHub Pages at
https://minorrob.github.io/mtg-deck-matrix/. It is tested live by its owner, and the
standing instruction is **merge any clear fix directly** rather than queuing it.

`bash runtests.sh -q` runs **44 Node suites** and all of them pass on `main`.

### Shipped in the most recent run of work

| What | Where |
|---|---|
| Directed graph relations (causes→triggers, makes→multiplies, grants→extends) and hover-to-name | `crankmagic-graph.js`, `card-classify.js` |
| Lowest-cost paper printing, fetched live when a card is inspected | `card-catalog.js` |
| iPhone share fix; Send Feedback button | `crankmagic-app.js` |
| Collection: colour grouping, inline row actions, like-for-like replacement with a side-by-side compare | `crankmagic-collection.js` |
| Flavour names — 513 of them, so "SpongeBob SquarePants" finds Jodah offline | `data/flavor-names.json`, `tools/flavor-names.mjs` |
| Three-way filters (include / exclude / off) on Discover and the graph | `crankmagic-facets.js`, `crankmagic-discover.js` |
| Deck Lab: opens fresh, a Clear button, skippable archive and delete confirmations | `crankmagic-lab.js`, `crankmagic-decks.js` |
| **Deck Lab loop rebuilt** — see below | `crankmagic-lab.js`, `crankmagic-sim.js`, `sim-engine.js`, `deck-measure.js` |
| Deck Lab form folds to three sections; only the relevant half is present | `crankmagic-lab.js`, `crankmagic.css` |
| Discover pane: one "Add and/or Buy" menu under the art, pane flush with the graph | `crankmagic-discover.js`, `crankmagic.css` |
| Loss causes, pod detail and the commander's own per-card row published | `sim-engine.js`, `deck-measure.js`, `crankmagic-sim.js` |

### The Deck Lab loop, in detail

Reported as "0 swaps found in under a second on a deck winning 0.94%". Three faults,
all fixed:

1. **The candidate pool could be empty in silence.** Candidates are ranked by
   `CrankGraph.relate` against the commander, and the graph is a 7 MB fetch the Lab
   started without waiting for. It now waits, says so, and refuses out loud if the
   pool is still empty.
2. **It was bounded by work, not time** — twelve slots, first candidate that won. A
   round is now 30 seconds and spends them: 14 candidates screened per weak slot, best
   two confirmed.
3. **The acceptance bar was noise.** A one-seed run has a standard error of exactly
   zero, so the bar was a flat quarter point against a measurement whose real spread
   is two or three. Cheap runs now only rank; the decision is made on the new
   **`refine` protocol — 3 seeds × 4,000 games** — by more than twice that run's own
   error.

It also now stops on **targets**, not just on "nothing changed". The targets are a
declared convention written beside the code: win rate against the 25% share every seat
of a four-player pod has, scaled by the Deck Definition's competitiveness; winning turn
from its speed; screw, flood and dead cards from `sim/config.json`.

Verified in Chromium: Krenko at competitiveness 3 — 2 rounds, 3 swaps kept from 44
screened, every target met, no console errors.

### The per-card readout

"Half the cards cast 99-100%, half cast 0%" was two accounting bugs and one real
limit.

- A **land** was added to the cast set when played (so it never counted as dead) but
  the counter was never incremented. All 36 lands read 0% cast, 0% dead.
- The **commander** is cast in a branch that returns before the bookkeeping, so the one
  card the header reported at 99.98% read 0% in the table under it.
- `castRate` divided cast **events** by **games drawn**, so a row standing for 36
  Mountains divided five plays a game by one game.

All three fixed. The remaining 100%s are real and are documented in
`docs/simulator-enhancement-plan.md` item 1: nothing in this model can stop a spell, so
a drawn card is a cast card. The loop now ranks on **stranded at turn eight** instead,
which varies.

**No published number moved.** `cardStats` is a readout and has never fed a score. The
Krenko hundred measures 58.6 before and after every change described here.

### What the report shows now

The nine score parts the composite is built from, each with points, maximum and the
sentence the engine wrote about it, ordered by points lost. Then the targets for the
chosen build with a tick or a cross. Then every per-card row, ranked by stranded-at-turn-8,
with lands and the commander marked.

Five figures the engine had counted since it was written and dropped at the line that
built the report are now published too. **`lossCauses` is the important one** — the only
figure in the engine that answers "why did I lose" rather than "how often". On a mono-red
Krenko hundred: 28.5% of games won, and of the rest, 17.3% lost to the combo seat's combo
against 4.9% to damage. That is a different card to go and find. The other four are what
the Pod experience index is made of, published beside it rather than folded into it.

## What is next, in the owner's stated order

1. **Engine fidelity** — `docs/simulator-enhancement-plan.md` is the plan. Start at
   its item 3 (typed, exclusive mana payment) and item 5 (spend the held answer);
   they are the same area and the best correctness-per-hour in the document.
2. **Non-AI how-to-play generator** — largely superseded by `guide-measured.js`, but
   still on the owner's list.
3. **Full-app sweep and hardening** — explicitly to be done after everything else is
   merged.

Open and unstarted:

- **The refresh plug-in itself.** The specification is written and complete in
  `docs/crankmagic-refresh.md`; nobody has built the plug-in.
- **Salvage Yard variant-assignment dropdown.**
- A written point-by-point answer to `design/crankmagic/simulation-fidelity-plan.md`.

## House rules that bite

- **Versioning.** Every asset is fetched with a `?v=`. One file, one version,
  everywhere. Change a file and its version must move, in every page that names it.
  The cascade is `data/*.json` → `crankmagic-assets.js` → `crankmagic-app.js` →
  `crankmagic-sw.js`, and the service worker's registration line lives inside
  `crankmagic-app.js`. Record with `node tests/asset-versions.mjs --update`. If you
  edit a file **after** bumping it, rebase the fixture:
  `git checkout origin/main -- tests/fixtures/asset-versions.json && node tests/asset-versions.mjs --update`.
- **56 suites** (44 when this section was first written). `README.md` states the count and
  `tests/data-integrity.mjs` checks that it matches. Adding a suite means editing the README.
- **A score is a claim about a protocol and an exact hundred.** Never carry a result
  across an engine generation, never reweight to make an average look right, and never
  publish anything measured on `preview` or `refine`.
- **Merging.** Push, open a **draft** PR, flip it out of draft, squash-merge, then
  `git fetch origin main && git reset --hard origin/main`.

## Where the useful files are

| File | What it is |
|---|---|
| `docs/simulator-enhancement-plan.md` | What the engine cannot measure, and the order to fix it |
| `docs/crankmagic-refresh.md` | How to refresh the eight data files; the plug-in specification |
| `design/crankmagic/simulation-fidelity-plan.md` | The long-run architecture argument |
| `crankmagic-lab.js` | The Deck Lab: draft, measure, refine, loop, report |
| `crankmagic-sim.js` | The only place that asks the simulator anything; protocols live here |
| `sim-engine.js` | The engine. 1,700 lines, no dependencies, runs in Node and a worker |
| `card-classify.js` | The one shared vocabulary for "what does this card do" |
| `crankmagic-graph.js` | Directed relations and the Discover canvas |
