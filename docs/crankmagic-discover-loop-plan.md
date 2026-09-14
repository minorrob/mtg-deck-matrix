# CrankMagic: Primary Purpose, loop vocabulary, loop edges, role lens

The reconciled plan. It replaces the session note `crankmagic-role-loop-lens-plan.md` (written
on 2026-09-13 without the app open, against branch state `4aa2bb3`) and the design sections of
`deck-tuning-session-2026-09-13.html`. Everything that note marked **verify** has been checked
against the code on `main`; where the note's premise was wrong the phase below is reshaped, not
carried. Standing rules unchanged: never write the Master workbook's target or actual columns,
every PR ships with the browser gates at desktop and phone widths on the live library, totals
reconcile.

## What is actually there (Phase 0, done)

| The note assumed | What the code has |
|---|---|
| `graph.json` carries only EDHREC `played` edges | `data/graph.json` (format 2, 31,830 cards) carries **per-card typed fields** — `roles` (15 values), `causes`, `triggers`, `produces`, `requires`, `multiplies`, `grants`, `extends`, `wants`, `makes`, `wantsStat`, `offersStat`, `mechanics`, `tribes` — plus 701,916 `played` co-play pairs. Typed **edges are computed at draw time** by `relateTerms` in `crankmagic-graph.js` from those fields: causes→triggers, makes→multiplies, grants→extends, supplies→needs, tribal, stat, shared terms. |
| Roles per card do not exist; the Master's Primary Purpose is the label source | Roles exist for 28,331 cards, derived from rules text by `card-classify.js` — the same classifier the app uses on a typed card. The Master's *Primary Purpose* and three mechanic columns are **not in the app anywhere** (`tools/build-live-load.py` does not copy them; no card in `graph.json` or `live-load.json` has a `purpose`). |
| Depth walks any edge | Depth walks the scored relation edges (`links()`), one kind capped at three fifths of a ring; `played` is a separate connection type the reader switches to. |
| Ownership needs a new node treatment | The canvas already paints a gold band on owned cards (`CrankFacets.ownedNames`), and the Yours facets (Ownership, In a deck) read the live library by name. |
| A role lens has to be built from scratch | The pane's List tab already lists everything the focus reaches under the filters, with Add/Buy per row; the lens is a view over `roles` plus Config minimums, not a new data path. |

Where the graph file comes from: `graph/ingest/` (Scryfall bulk + Neo4j) for a full rebuild;
`node tools/graph-amplifiers.mjs --all` re-derives every classified field from the cached rules
text under `graph/.cache/` without a rebuild. The cache is gitignored; a machine without it
refills it from Scryfall (`--from-bulk` or the API).

The two test cases the note started from stand, restated in the code's terms:

1. **Loop discovery.** D6 holds Krenko + Thornbite Staff + Goblin Bombardment / Skirk
   Prospector. The graph draws Krenko→Bombardment (*Supplies → needs*, creatures) and
   Bombardment→Thornbite (*Causes → triggers on*, a creature dying) but has no term for
   *untap*, so the cycle never closes and nothing says "this is a loop".
2. **Interaction filter.** `roles:removal` is derived from text, so Tweeze, Goblin Trashmaster
   and Siege-Gang Commander carry it already — the note's "only 4 of 7" was a Master-column
   problem, not an app problem. The workflow labels ("Tuned add") live in the Master, and the
   app never reads them.

## Phase A — shipped in this PR

Rob's Discover walk, plus the groundwork the later phases read.

- **Primary Purpose, deterministic.** `MtgCardClassify.purposeOf(card)` in `card-classify.js`:
  a fixed ladder (finisher, board wipe, multiplier, team quality, tutor, sacrifice outlet,
  removal, draw, ramp, token maker, payoff, tribal payoff, stat payoff, recursion, protection,
  counters, graveyard, grants, produces, needs, body, tribe, mechanic) whose first rung a card
  stands on wins; always one of the card's own terms, `null` for a card with only generic
  terms. The pane, the pop-ups and a List row's detail ring that chip in gold, and the hover
  reads "Primary Purpose — Ramp: mana ahead of the curve." Pinned in `tests/card-classify.mjs`
  on fifteen named cards, plus determinism and coverage (94 % of non-land cards) over the
  whole graph.
- **Filter counts follow the filters.** `CrankFacets.narrowedCounts(cards, selection, state,
  key, {any})`: one facet's values counted over what the current picks leave (in *any* mode
  the facet's own includes are lifted first, its excludes kept). The dialog shows it, the
  whole-graph figure rides on the hover, options with nothing left step back, and the counts
  update live while the dialog is open. Pinned in `tests/crankmagic-facets.mjs`.
- **Yours in green; a deck pick focuses its commander.** The Yours facet group wears the owned
  token; picking a deck under *In a deck* refreshes the graph with that deck's first commander
  in focus (matched by name).
- **The picture grows with the pane.** `--cm-art-w` is 42 % of the divider's pane width,
  clamped 150–255 px (70 % larger at most); 50 % of the pane in presentation mode; fixed on a
  phone.
- **The loop catalogue.** `docs/crankmagic-loop-patterns.md`: eleven patterns with their general
  characteristic and their signature in the classifier's vocabulary, the missing terms, and the
  detection rule the next two phases implement.

## Phase B — the loop vocabulary (shipped, PR after #167)

Goal: the classifier can say *untap*, *copy*, *blink* and the rest, on every card in the graph.

What landed: roles `untap` (529 cards), `copy` (322), `blink` (81), `counter-removal` (9),
`extra-turn` (51 — the same 51 the bracket reading finds), `cost-reduction` (293), and the
`tap-ability` mechanic (3,057 nonlands with `{T}` in a cost, kept out of the shared-term
joins as land entry is). Granted abilities count: Thornbite Staff's *"whenever a creature
dies, untap this creature"* is an untap of the wearer, and Deadeye Navigator's quoted blink is
a blink. Self-untap, self-discount, self-counter-removal and clones that merely *enter* as a
copy are excluded, and the classify suite pins both what the terms must say and what they
must not. The ladder gained extra turn, untap engine, copier, blink, cost reduction and
counter removal; Thornbite Staff rings untap, Kiki-Jiki rings copy. `graph/.cache/oracle-text.json`
was refilled from Scryfall (31,830 cards) and `data/graph.json` re-derived with `--all`.
The original brief follows for the record.

- Add to `card-classify.js` `ROLE_PATTERNS`: `untap`, `copy`, `blink`, `counter-removal`,
  `extra-turn`, `cost-reduction`; add `tap-ability` as a mechanic on nonlands whose text has
  `{T}:`. Confirm `persist`, `undying`, `storm`, `cascade` arrive in `mechanics` from Scryfall's
  keywords. Patterns are narrow and named in `docs/crankmagic-loop-patterns.md`; a missed loop
  costs an edge, a false one puts a lie on the canvas.
- Extend `PURPOSE_LADDER` with `untap`, `copy`, `blink` between *Multiplier* and *Team quality*.
  Expected changes: Thornbite Staff rings untap, Kiki-Jiki rings copy, Deadeye Navigator rings
  blink. The named-card test in `tests/card-classify.mjs` pins them.
- Re-derive: `node tools/graph-amplifiers.mjs --all` over the cached text; commit `data/graph.json`
  with the diff summarised in the PR (how many cards gained each term). `tests/card-classify.mjs`
  already re-derives the bake from `data/cards.json` and must still agree card for card.
- Facets: the new roles appear under Role automatically (`FACETS` reads `c.roles`).

Acceptance: `roles:untap` on Thornbite Staff, Umbral Mantle, Staff of Domination, Freed from the
Real; `roles:copy` on Kiki-Jiki, Splinter Twin; `roles:blink` on Deadeye Navigator, Ephemerate,
Conjurer's Closet; none of them on Sol Ring or a basic land. The whole 55-suite run and the
journeys stay green.

## Phase C — loop edges, loop-mode depth, edge priority by purpose (shipped, PR after #169)

Goal: Discover closes cycles and shows them as loops; the depth gauge can walk loops only.

**What shipped, and where it differs from the sketch below.** Everything is derived from
oracle text through the classifier, so it holds for any commander deck; the live library's
goblin deck is the worked example in the tests, not a special case.

- *Loop pair edges* — `drives` / `drivenBy` in `relateTerms`: an engine (untap, copy, blink)
  onto a card whose tap ability is worth another go. "Worth another go" is a rule, not a list:
  the target must have a tap ability **and** produce a token, a card, a counter or a treasure,
  or cause a loop event. A mana rock fails it, so Thornbite Staff → Sol Ring is no edge and
  Sol Ring never enters loop mode. The edge outranks *Causes → triggers*; its label is the
  engine's verb ("untaps it for another go"), and the source card's Primary Purpose already
  wears the gold ring beside it, so the label did not need to repeat it.
- *Supply → demand* — `loopFeeds` / `loopFed`: a repeatable supply (tokens, counters,
  treasures, graveyard entries) into a card that wants that class (a sacrifice outlet, a
  counters payoff). Krenko → Goblin Bombardment and Krenko → Goblin Chieftain are both loop
  feeds; a shared word alone (Thornbite Staff and Lightning Greaves) is not.
- *The cycle finder* is its own module, `crankmagic-loops.js`, driven by `tests/crankmagic-loops.mjs`:
  directed cycles of two to four cards over resets (the pair edges), feeds and fires
  (causes → triggers on a loop event). A cycle is *closed* when something on it resets a step
  or every step is a trigger; payoffs are cards outside the cycle that fire on an event the
  cycle causes and drain life or make cards, tokens, mana or treasure. Shared Animosity is
  **not** a payoff (an attack trigger, not an event the loop causes); mana loops wait for cost
  accounting, as before.
- *Loop mode* is a filter on the walk, not a three-rung ladder: with it on, every step of the
  depth gauge crosses only loop links, so the rings are whatever those links reach. It comes on
  by itself with a deck pick under Yours, the toggle overrides it, and clearing the filters
  clears the override.
- *Loops this card is in* sits above the chips in the pane: each cycle one line of names with
  the join between each pair, missing pieces dashed, payoffs beneath, closed loops first.

The original sketch, kept for the record:

- In `crankmagic-graph.js`, add the three pair cases the vocabulary now supports — untap →
  tap-ability, copy → creature-etb, blink → creature-etb — to `relateTerms`, scored above
  *Causes → triggers*. Their label is the **source card's Primary Purpose** (`purposeOf`), which
  is the dynamic, purpose-led edge label the tuning note asked for; every other kind keeps the
  sentence it has. Edges compete as they do today: the strongest is drawn, the rest are in the
  pop-up.
- A cycle finder over the cards on the canvas (or a deck's set): directed cycles of length 2–4
  over causes→triggers, produces→requires and the three new edges, kept when every cost on the
  cycle is covered by a product on it; payoffs attached as in the catalogue. Pure, in a module
  a Node test can drive (`tests/crankmagic-graph.mjs`), acceptance on the committed live state:
  the D6 loop (Krenko, Thornbite Staff, Bombardment / Prospector, payoffs Purphoros, Impact
  Tremors, Shared Animosity) and the Niv-Mizzet + Curiosity two-node cycle.
- **Loop mode** on the depth gauge, default on when a deck is picked under Yours: depth 1 the
  cards that close a cycle with the commander, depth 2 the cards that close one with those,
  depth 3 the payoffs. Ramp, draw and `played`-only neighbours stay out until the toggle is
  off. Playwright at desktop and phone: pick D6, step 1–3, assert the node sets; Sol Ring,
  Arcane Signet and basics never appear.
- Loops on the card: the pane lists "Loops this card is in" above the chips, each loop one line
  of names with the missing piece marked, from the same finder.

## Phase D — the role lens (shipped, PR #185)

Goal: pick a deck, pick a role, see the deck's cards in that role beside the graph's candidates.

- Route `#discover?lens=Removal&deck=D6` (a mode of Discover's List tab rather than a new page,
  so it inherits filters, Add/Buy and the ownership band). Roles offered: Removal, Board wipe,
  Protection, Loop (untap, copy, blink, sacrifice outlet), Tutor, Ramp, Draw.
- Left: the deck's cards whose `roles` carry the lens, with the count against the minimum in
  `crankmagic-rules.js` (Removal 8, Board wipe 2, Ramp 10, Draw 10 — confirm the module's
  numbers before wiring) in the warning treatment when under. Right: candidates — bench, buy,
  upgrade path and the commander's `played` neighbours not already in the deck — ranked by
  co-play with the commander, then owned before ordered before not owned, price shown.
- One action per candidate: *Swap for…* writes an uncommitted option on the replaced slot through
  the existing option flag; nothing changes a finalized list directly.

Acceptance: `#discover?lens=Removal&deck=D6` lists Abrade, Chaos Warp, Cinder Strike, Tweeze,
Goblin Trashmaster, Siege-Gang Commander on the left (six; seven once Vandalblast lands) with
"6 / 8" in the warning treatment; D4 shows "9 / 8" plain. A swap creates an option and touches
no target.

*Shipped in #185 as `crankmagic-lens.js` (pure) drawn by Discover's List tab, with the house
minimums on `crankmagic-rules.js` (`ROLE_MINIMUMS`: removal 8, wipe 2, ramp 10, draw 10; the
other three lenses show their count plain). The route is `#discover?lens=<role>&deck=<deck id>`,
reached from the deck page's More menu; the select in the pane reaches the other six. The
acceptance numbers above were written against an earlier classifier: today D6 carries twelve
removal cards (Vandalblast landed, and the pingers — Goblin Bombardment, Thornbite Staff —
classify as removal), so D6 reads "12 / 8" plain, D5 "5 / 8" and "0 / 2" in the warning
treatment, D4's ramp "13 / 10". `tests/crankmagic-lens.mjs` pins the rules on the live state
and the swap: an uncommitted `option` on the chosen slot, the hundred unchanged, no copy
reserved. Candidates come from the bench, the orders, the buy list, the linked upgrades and the
commander's co-play neighbours, inside the colour identity, never a card already in the
hundred.*

## Data: the Master's columns (optional, any time after B)

The app derives roles for every card; the Master's *Primary Purpose* labels ~700 of them by
hand. Rather than make the Master the source, carry it as an **override**: `tools/build-live-load.py`
copies *Primary Purpose* and the three mechanic columns into each card definition (by header
name, never by letter), skipping workflow labels ("Tuned add", "B3 (Max) add") into
`reports/purpose-relabel-needed.csv`; `purposeOf` prefers a Master label when one is present and
maps it onto the ladder's vocabulary. The Master is never written.

## Order, packaging, decisions

One PR per phase: A (this one), then B, C, D in order — C reads B's terms, D reads both. Each
PR bumps `?v=` on what it touches and refreshes `tests/fixtures/asset-versions.json`, runs the
55 suites with the browser suites required, the journeys, and a walk with screenshots at 1400
and 390 on the live library.

Three decisions for Rob, none blocking A:

1. **Loop mode default.** On by default when a deck is picked (proposed), or off until toggled.
2. **The lens's home.** A mode of Discover's List tab (proposed) or its own nav entry under Build.
3. **Master columns.** Carry them as overrides after B (proposed), or leave the app's derived
   roles as the only source.

Out of scope, as before: editing the Master; simulated evidence on the graph; the Shop, deck
assembly and pull-sheet tracks, which proceed on their own.
