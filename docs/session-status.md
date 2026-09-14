# CrankMagic — current state and handoff

Last updated 14 September 2026, at session A's close-out. Written so the next session can start
work without reading a transcript. **Read the first section before anything else.**

## 14 September 2026 — session A's close-out and handoff

**Rob closed session A on 14 September at about 15:10 UTC**, after PRs #196–#204 merged. The
working branch `claude/mtg-deck-matrix-ui-fixes-f7om91` is reset onto `main` (`aae20ea`) and
clean: nothing uncommitted, nothing in flight, no background process left on the sandbox.

**Merged 14 September, in order** (all session A; every one squash-merged after green gates):

| PR | What |
|---|---|
| #195 | Publish your To Trade list: one link that is the list, a page anyone can open and ask from |
| #196 | Fix: a library saved before schema 3 could be read but never saved again — `commit()` and `undo()` migrate before they apply |
| #197 | Trace pane: the Speed control on its line, what each strategy lights on its own, Reset to the commander's own, ticked rows filed in a group |
| #198 | Cards header: the seven counts as chips that filter, List · Sheet · Table on the tab row of every tab, a Table for To buy, Owned as a status |
| #199 | Tabletop: the whole picture on every card, ghosts you can read, readings as chips, a folding Bench, one card on the stage with its facts and next/previous |
| #200 | Discover node pop-up: the picture at the inspector's size, the buttons stacked on its left, the mana pips on the type line |
| #201 | Deck Overview: *The hundred at a glance* — the curve, the hundred by type and by purpose, the key strategy line in the vocabulary's words |
| #202 | Trace limits: never more than a hundred cards lit; sliders for Cards lit (10–100, default 100), Loop length (2–6, default 4), Chain depth (1–3, default 3), saved with the library; a work budget in the loop finder so loop length 6 on a dense pool is a bounded wait, not a hang |
| #203 | Make the change: the Change List (`#change?deck=`) — *Remove this card → Put this card in* rows, a tick is one revision, four readings held to the mana formula and the floors, Excel export and Print; `crankmagic-change.js` (pure) and `crankmagic-change-ui.js`; ways in from the deck hero, the Cards More menu and the Discover trace pane |
| #204 | `docs/crankmagic-inventory-plan.md` — the plan the next session executes (below) |

**What the next session does, in Rob's stated order**

1. **Execute the inventory plan** — `docs/crankmagic-inventory-plan.md`, its §0 first. It is a
   gathering step, not a design step: wireframes of every surface at 1400 and 390 drawn from
   the DOM by a generator, and the feature register (every action key, view and overlay filed
   under thirteen groups, with where it lives, how it is reached, what it commits, what covers
   it and what else does the same job), both with a `--check` so they cannot drift. Three PRs,
   merged when done. Rob said he executes it in a separate session; nothing in it decides a
   redesign.
2. **Parked by Rob's instruction, do not start:** the persistent-app plan
   (`docs/crankmagic-persistent-plan.md`; its nine decisions are still his), and the scope of a
   model's influence if one were added ("we'll create that plan/scope after everything else is
   done so don't do that now"). Licensing stays parked.
3. **A number to argue with.** The Change List's mana formula (`MANA` in
   `crankmagic-change.js`: start at 38 lands, sub one out for every two ramp pieces at two mana
   or less, never below 33, one back for a high curve) reads all six live decks over on lands —
   D1 Quintorius holds 45 in the box against 35 asked, D2 Chulane 39 against 36. The numbers
   are in one place and meant to be tuned; Rob has been asked for the count he actually
   builds to. Change the constant, not the warning.
4. **Small facts worth knowing.** The Make-the-change journey's tick step is conditional
   (Journey Goblins has no row it can do at that point), so the journeys count 348 today and
   grow by two if a later journey deck has a doable row; the tick itself was walked on D2 and
   is held by the unit suite. The Tabletop's boundary class is `.cm-tt-mat`, the role lens's
   `.cm-lens-head`, the node pop-up's `.cm-graph-pop`, the trade page's `.cm-trade-grid` (the
   inventory plan's catalogue carries all of them).

**Gates and the sandbox, as they are now.** `GEOMETRY_REQUIRED=1 PAGE_BUDGET_REQUIRED=1 bash
runtests.sh -q` runs **58 suites** (the README states the count; `tests/refresh.mjs` and the
generators check it) and `node tests/uat/crankmagic-journeys.mjs` is at **348 checks**. In the
cloud sandbox the browser suites need the Playwright environment **exported for the whole
run**: `UAT_PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.js`,
`UAT_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
`UAT_BASE=http://localhost:8790`, with `python3 -m http.server 8790 --bind 127.0.0.1` serving
the repository. Set as a prefix on `bash runtests.sh` alone they reach the runner but not the
suites it spawns, and the geometry and page-budget suites report "REQUIRED but Playwright is not
installed" while everything else passes — that cost one re-run on 14 September. Never edit a
served file while a browser run is live; never run a walk beside the gates (contention shows as
click timeouts); kill stale runs in a command of their own with anchored patterns
(`pkill -f '^node tests/'`) — an unanchored pattern matched the shell's own command line and
killed it, twice. Walks and gates go to a log file with an `EXIT` line and a waiter loop
(`n=$(grep -c '^EXIT' log); n=${n:-0}`), because a command that ends by starting a background
job loses its earlier output.

**Credentials.** Rob supplied a repository-scoped fine-grained GitHub token in chat for the REST
merge flow (`POST /pulls` as a draft, `POST /pulls/{n}/ccr/ready_for_review`, `PUT
/pulls/{n}/merge` with `merge_method: squash` and the head sha, then `git fetch origin main &&
git checkout -B <branch> origin/main && git push --force-with-lease`). It is stored nowhere in
the repository or on disk and must stay that way; ask Rob for it again. The GitHub MCP tools work
without it at a lower rate. The Master workbook is never written; `treycmload1` (Load Live) is
public client JavaScript; `minor.rob@gmail.com` is the Subscribe address Rob asked for.

**Versions at head:** app and worker 174, css 103, decks 48, collection 49, discover 53,
trace 3, loops 4, change 1, change-ui 1, tabletop 5, strategies 2, xlsx-writer 2 —
`tests/fixtures/asset-versions.json` is the record (88 assets).

---

## 13 September 2026 — where things stand, and the two sessions

**Two cloud sessions share this repository and this working branch**
(`claude/mtg-deck-matrix-ui-fixes-f7om91`), and both carry the title "MTG Deck Matrix UI
fixes". Neither can read the other's conversation; git, the PR bodies and this file are the
only shared record.

| Session | Ran | Shipped | Left open |
|---|---|---|---|
| A — `session_01JxaMVGPFVWfBLPd3PXM1PR` (since 23 Aug, the long one) | 23 Aug → 11 Sep 04:10, then 12 Sep 20:12 → 14 Sep 15:10 (closed) | #133, #152–#168, #169–#204 | the inventory plan (#204) for a separate session; the persistent-app decisions; the model-influence scope, on Rob's call |
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
| #175 | Critical 6: the journeys answer Scryfall from the shipped catalog (the walks' stub); 180 checks in about two minutes instead of ten, and no third-party rate limit in the gate | A |
| #176 | Graph nodes draw their card art again on the live site: the art requests no longer carry the cross-origin flag (nothing reads the canvas back), and a failed load is retried once instead of written off | A |
| #177 | Critical 3: `data/graph.json` out of the precache and split from the 701,916 co-play pairs (`data/graph-played.json`, 20.6 MB); both fetched on the first Discover visit behind a status line and kept by the worker on demand; install precaches 5.1 MB of data instead of 41.6 MB; the inventory gains an "on demand" column | A |
| #178 | Critical 4+5: every data file opens with `{schema, stamp, generator, count}` (`schema/index.mjs` registry, `schema/*.json`, `schema/validate.mjs`, `tests/schemas.mjs`); readers check it through `CrankAssets.expect()`; `--check` on commander-ranks, commander-universe, generate-guides, rate-decks and the new build-card-records; the generators suite runs every registered check | A |
| #179 | Critical 1: `data/cards.json` is the Card record set (`cards@2`, 2,131 records: identity, facts, printing, one dated price, the classifier's terms) with `tools/build-card-records.mjs` as its one producer (`--check`, `--add`); `card-facts.json` and the graph's card block derive from it; four hand-writers retired; `tests/card-records.mjs` (682 checks) | A |
| #180 | Critical 2: the library references the Card record (schema 3): a shipped card is `{id, name, oracleId, shipped}`, the catalog's `overlay()` joins the record's facts to the copy's identity, one `reconcileCards` command at boot for a schema-2 library, every module reads through `C.card(id)`; live-state 2.1 MB → 0.8 MB; `tests/library-references.mjs` | A |
| #181 | Tabletop plan: the felt goes; a slate sorting mat with a dot grid, a raised bench ledge and slots under the piles; both mock-ups regenerated | A |
| #182 | Recommended 7, 8, 9, 11: `M.STATUS` vocabulary (statusOf/statusOrder/statusTone) read by Cards, pills and the deck page; `crankmagic-groupings.js`; the literals (`GC_LIMIT`, `UPGRADE_CHEAP_LINE`, `TYPE_ORDER`, `LOOP_MAX_LEN`, `DECK_ART`) on the rules module; projection memoised per revision; `tests/status-and-groupings.mjs` | A |
| #183 | Recommended 10, 14, 16: the five legacy files archived with 35 readers repointed, `deck-swaps.json` and its builder gone, `tools/data-manifest.mjs` → `data/manifest.json` (schema, stamp, generator, size, sha256, served version, cache class), `tests/data-manifest.mjs` with the 5 MB rule | A |
| #184 | Recommended 12, 13, 15: the oracle id is the join key (`catalog.oracle()`, `CrankFacets.owns()`, Discover's focus and band, `reconcileCards` fills it); posting lists behind the facets (`postings()` for the Trace); "Commands are the exchange format" in the persistent plan. Section 3 of the evaluation report is closed | A |
| #185 | Discover Phase D, the role lens: `crankmagic-lens.js` (pure), `ROLE_MINIMUMS` on the rules module, a mode of the List tab with a deck picked (`#discover?lens=Removal&deck=<id>` from the deck page's More menu), the deck's cards in the role against the house minimum beside ranked candidates, *Swap for…* as an uncommitted option; `tests/crankmagic-lens.mjs` | A |
| #186 | Trace T0 + T1: `crankmagic-strategies.js` (sixteen strategy tuples, derive / servedBy / forDeck), `tools/commander-strategies.mjs` → `data/commander-strategies.json` (2,746 commanders, on demand), graph relations carry `serves` and `strength`, `CrankLoops.countThrough`, `crankmagic-trace.js` (the deterministic walk: rings, loop-backs, score, grouped list, unlit buckets, the definition fence); `tests/commander-strategies.mjs`, `tests/crankmagic-trace.mjs`. Also repairs `docs/data-inventory.md` on main (the #185 regen listed this PR's tool early) | A |
| #187 | Trace T2 + T3: trace mode on the graph canvas (rings, beams, rim, gold returns, ghosts, transport, reduced motion), the Trace pane (score strip, strategy ticks persisted as `definition.strategies`, grouped list, This deck / What it could be, unlit sentence, CSV), `Trace` on the deck page, `#discover?deck=&trace=1`, tour step; `tools/trace-calibrate.mjs` — the trace score does not track the measured score (ρ 0.2 over 206 lists), so it is shown as a cohesion score | A |
| #188 | Trace T4: the Lab seeds the 99 from a pool trace over the legal catalog inside the definition (`CrankTrace.seedFrom` → `draft-builder.js` `seed`; *Seed the draft from the trace*, on by default; the trace beamed 60 · 40 · 30), *Watch the trace* on a saved deck; the trace plan is complete | A |
| #189 | Tabletop TB1, the table at rest: `crankmagic-tabletop.js` (pure `table()` over the list's rows — status piles in `M.STATUS` order, the Bench, group piles under nine groupings, ghosts for the copies not yet held — and `mount()`, the slate mat), a third *Tabletop* view on Cards → Library with the list's search and filters, the grouping remembered in preferences; `tests/crankmagic-tabletop.mjs` counts the piles against the projection | A |
| #190 | Tabletop TB2, lay out · page · select: a pile opens into rows and columns on the stage (`CrankTabletop.pileOrder`, `layout` — pure, paged, S · M · L), the group piles as a shelf of placards, ticks and shift-click for several, a plain click recombines the rest into the pile (transforms only, reduced motion skips it) and stands the selection large on the mat with name, status, price and deck; Back to the pile, Escape, right-click for the row menu; journeys +21 | A |
| #191 | Tabletop TB3, drag to a pile: the drop-target contract `CrankTabletop.accepts(pile, rows)` (pure; an action, its words, or why not), the drag with its badge and green/red targets, every drop the row menu's own command through the receipt (Bench ↔ Physical deck, Ordered, Watched, Reserved, Substitute, release to To buy, file in a group, reserve for a deck pile), ghosts becoming copies, *Move to…* for a phone; journeys: Bench → box → Bench with the tallies, a requirement onto Ordered | A |
| #192 | Tabletop TB4, polish: the card size remembered per device, the status piles' order (workflow / fullest first) as a preference, the keyboard (arrows among piles and cards, Enter opens or chooses, Space ticks, PageUp/PageDown turn), *Print* of the whole pile as a numbered list (`printSheet`, pure); the tabletop plan is complete, the leftovers listed in it | A |
| #193 | The sweep the retired pages left behind: fourteen modules no page served and no tool read (the old screens admin-menu, build-panel, import-panel, deck-page and the libraries only they drove) and their ten suites gone; xlsx-writer, deck-sources, data-integrity, assignment-model, card-link and user-state trimmed to what still exists; README 55 suites; the inventory regenerated | A |
| #194 | The refresh skill (backlog #167): `tools/refresh.mjs` runs the registry's generators in the specification's order (universe, flavour names, graph, ranks, records, strategies, manifest), refuses a shrink and a dirty tree, bumps `?v=` only for the served data files that changed with the cascade, and proves the result with every producer's `--check`, the asset manifest, the README count and `runtests.sh`; `.claude/skills/crankmagic-refresh/SKILL.md` is the judgment around it; `tests/refresh.mjs` holds the plan to the registry; the specification updated to ten files and the runner | A |
| #195 | Publish the To Trade list (backlog #200): `crankmagic-trade.js` — the copies offered for Sell / Trade and the To Trade group as one link that is the list (deflate-raw, base64url, in the hash), the `#trade` page a visitor opens with pictures and an Ask-by-mail per card or for the ticked ones, *Publish your To Trade list* on the Share menu with the publisher's name, contact and note remembered; QR when it fits; no server | A |
| #196 | Fix: a library saved before schema 3 could be read but never saved — `collection-repository.js` applied every command to the raw stored copy while reading it migrated, so every save failed with *Unsupported collection schema* (Rob's boot toast and the strategy tick); commit and undo now migrate first, and the first save stores the migrated copy; journey seeds a schema-2 library in IndexedDB and saves through it | A |
| #197 | Trace pane (Rob, 14 September): the Speed control on the transport line; each strategy tick carries what it lights on its own, so unticking one is legible (a card stays lit while any ticked strategy reaches it); *Reset to the commander's own* clears the ticks saved with the deck; a tick on every row and *Add ticked to a group* files the cards as planned entries (new group by default, named from the deck); journeys +8 | A |
| #198 | Cards header (Rob, 14 September): the counts as chips that filter (Owned included), Add cards primary and the rest compact, List · Sheet · Table on the tab row under More keeping the tab (a Table for To buy), the records count in the paging line, no tab-row scrollbar; Owned (any) on the Table's Status; journeys +9 | A |
| #199 | Tabletop, Rob's notes (14 September): the whole picture on every card with a caption under a laid-out card; ghosts at full strength behind a gold dashed frame wearing their status; the six drop-target status piles stand, Draft list · Suggestion · Planned · Unassigned are chips under the row; the Bench ledge folds (remembered per device); one chosen card on the stage at Card · Larger · Large · Full with its facts from the inspector's record, Inspect card, Explore connections, Previous / Next through its pile; unit +7, journeys +19 | A |
| #200 | Discover node pop-up (Rob, 14 September): the picture at the inspector's 230px, Focus here · Inspect card · Tick for a group stacked compact down its left, the mana pips on the type line, the facts in a narrower column; 620px wide where the graph has room, one column under 760px; journeys +4 | A |
| #201 | Deck Overview (Rob, 14 September): *The hundred at a glance* under the progress card — the curve and type counts, the hundred by card type and by Primary Purpose (the spells) as keyed bars, and the key strategy in the strategy vocabulary's own words (`CrankStrategies.describe`, deterministic, no model); type counts count each card once; unit +5, journeys +4 | A |
| #202 | Trace limits (Rob, 14 September): a trace never lights more than a hundred cards, whatever the world holds; three sliders under the strategy ticks — Cards lit (10–100), Loop length (2–6, four by default) and Chain depth (1–3) — kept with the library; a card draws at most four loop-backs; unit +8, journeys +4 | A |
| #203 | Make the change (Rob, 14 September): the Change List for one physical deck — *Remove this card → Put this card in* rows from the same projection and readiness the Cards page reads, one physical swap per row, ticks that are one revision each (the copy out to the Bench, the copy in placed here), rows waiting on orders or the buy list listed but not tickable, *Do all available*; four readings (the box now · after what can be done now · after everything arrives · the list as written) held to the mana formula (38 lands, less one per two cheap ramp pieces, floor 33, ±1 for the curve) and the floors in the rules, amber where a reading breaks one; Export Excel (two sheets) and Print; entries from the deck page hero, the Cards More menu and the Discover trace pane. `crankmagic-change.js` (pure) + `crankmagic-change-ui.js`; unit suite `crankmagic-change` (101), journeys +5 | A |
| #204 | App inventory plan (Rob, 14 September): `docs/crankmagic-inventory-plan.md` — for a separate session: wireframes of every page and overlay at 1400 and 390 drawn from the DOM by a generator, and the feature register (171 action keys, ten views, the shell's actions, every dialog and menu) filed under thirteen feature groups with where each lives, how it is reached, what it commits, what covers it and what else does the same job; two tools with `--check`, one test, three PRs; facts only, no redesign | A |

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
  gauge. Phase C shipped (#170); loop mode is on by default with a deck pick, as proposed. **Phase D shipped (#185)** after the data-model evaluation closed, on Rob's instruction of 14 September to complete every plan. The order of work he set: the data-model evaluation first (`docs/crankmagic-data-model-evaluation-plan.md`; **E0 done in #174**, E1 the Card record next), then the two major enhancements as their own phases — **the Trace is under way (T0 and T1 shipped in #186; T2–T4 follow)** — the Trace (`docs/crankmagic-strategy-trace-plan.md`, T0–T4, mock-up in `docs/mockups/strategy-trace.html`) and the Tabletop (`docs/crankmagic-tabletop-plan.md`, TB0–TB4, mock-ups in `docs/mockups/`) — then Phase D. All three plans shipped in #172 and await Rob's review; the Discover pop-up change shipped as #173.
- `docs/crankmagic-persistent-plan.md` — accounts, per-user sync, crankmagic.com on Vercel +
  Supabase. Not started; nine decisions listed in the document.
- `docs/ux-plan-2026-09-11.md` — executed by session B. Its §7 data items are still Rob's:
  `definition.mechanics` per deck in `data/live-load.json`, and vendor / order references on
  the ordered copies.

**Gates now:** `GEOMETRY_REQUIRED=1 PAGE_BUDGET_REQUIRED=1 bash runtests.sh -q` runs **56
suites** (the README states the count and `tests/data-integrity.mjs` checks it);
`tests/uat/crankmagic-journeys.mjs` is at **180 checks** (Scryfall stubbed since #175; the offline step is the one live-network step); the geometry and page-budget suites
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
- **58 suites** (44 when this section was first written, 56 on 13 September). `README.md` states the count and
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
