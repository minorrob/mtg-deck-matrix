# CrankMagic Trace: the deck's strategy, lit from the commander outward

Plan for the feature Rob described on 14 September 2026: a blank canvas with the deck's
commander in the middle; joins that serve the commander's abilities and the deck's strategies
step into existence as beams of light, ring by ring; each card the beam reaches is outlined,
added to a list in the side pane, and counted every time a later beam loops back to it. The
mock-up of the finished still is `docs/mockups/strategy-trace.html`. Nothing below is built;
**Phase D (the role lens) is held** until this plan is reviewed.

The app is for anyone building any deck. Every rule below runs off the classifier's reading
of rules text and the graph's own joins, so it works for a commander CrankMagic has never
seen; the six live decks are the fixtures the tests use, nothing more.

## 0. Is the idea good? Yes — and it is two products, so build them in that order

Rob's own framing is the right one: the feature does two things. **(1) It produces the list
of cards that most raise the deck's potency around its commander, inside the deck's
definition** (colour identity, bracket, cap, per-card cap, the owner's mechanics). **(2) It
animates how that list was chosen and how the cards interrelate**, so the builder understands
the deck rather than receiving it. The second is the reason people will enjoy the first.

*Why it is good.* Everything CrankMagic has built since August is a precondition for it and
is now in place: typed, directed joins in the graph; the loop vocabulary and the cycle finder;
a Primary Purpose per card; per-commander play styles and six written guides; a simulator
that can score any hundred. The trace is the first feature that uses all of them at once, and
it answers the question every builder actually has — *what does this deck do, and which cards
are doing it* — in a form that is fun to watch. It also gives the Lab a seed that is about
the commander rather than about filling role slots, which is the Lab's weakest point today.

*Improvements to the idea as described.*

- **Make the list the product, the animation the explanation.** The walk should produce a
  *grouped, tagged list* first — by ring, then by strategy served, each card carrying its
  Primary Purpose, the join that lit it, the strategies it serves, its loop-back count and
  its status (owned · ordered · to buy · not owned) — and the animation should play *that
  list*. A list that exists without the canvas can be printed, exported, read on a phone, and
  fed to the Lab. The pane's *Lit in order* in the mock-up is that list; §2 makes it the
  walk's primary output and adds the grouping.
- **Trace the pool, not only the hundred.** For an existing deck the trace over its hundred
  is the evaluation ("what the deck builds, and the 79 cards it never touches"). For the
  builder's real question — *which cards should be in it* — the same walk runs over the
  candidate pool (bench, buy list, upgrade path, the commander's co-play neighbours, the
  filtered graph) and the list that comes back is the recommendation, ranked by ring and
  loop-backs, with ownership on every row. Both are the same function with a different card
  set; the pane offers both ("This deck" · "What it could be").
- **Keep the definition as the fence.** Every card the pool trace lights must pass the
  deck's colour identity, bracket ceiling and caps *before* it is placed; a card that fails
  is not lit and is listed under "would help, outside the definition" so the builder can
  widen the fence knowingly. This is what makes the list "within the confines of the deck
  definition" rather than a wish list.
- **Say what potency means, and measure it.** The trace score (§2) is a heuristic; the
  simulator is the measure. Phase T2 calibrates the one against the other on the 50 variants
  and the six live decks, and the pane shows both. If the trace's ranking does not track
  the measured score, the weights change — not the claim.
- **Let the builder steer.** Strategies are ticks in the pane, persisted with the deck. A
  builder who wants Krenko as a token-swarm deck and not a combo deck unticks *Untap loop*
  and watches the trace change. That is the "fun while doing it" part: the deck is theirs.
- **Reduced motion and phones are first-class.** The finished still is the default on a
  phone and under `prefers-reduced-motion`; the list is always there.

## 1. Where it lives — recommendation

Rob's three candidates: a third Discover view or a top tab; part of the Deck Lab's initial
99 seed; an evaluation overlaid on an existing deck drawn as a graph.

**Recommendation: build the walk once, as a mode of the graph, and surface it first as
`Trace`, the third pane tab in Discover (Card Info · List · Trace), reached from the deck
page.** The reasons, in order:

1. *The deck view is where the question is asked; Discover is where the graph has room.* A
   **Trace** action on the deck page (hero row, beside Measure, and on the Guide tab) opens
   `#discover?deck=<id>&trace=1`: the deck's hundred is the world, loop mode's links plus the
   strategy links are the joins, and the Trace pane plays the animation. One click from the
   deck; the whole canvas for the beams.
2. *The overlay Rob described in his third option is the presentation, not a separate
   feature.* The hundred is drawn ghosted (dim, unlabelled) from the start; the trace lights
   the cards it reaches and leaves the rest ghosted. What stays dark is the evaluation: "79
   cards the trace never touched — 33 lands, 8 rocks, 12 removal, 26 bodies with no join to a
   traced strategy." That sentence is the finding the deck builder acts on.
3. *The Lab seed is the same walk over a different set, and it should come last.* Tracing the
   candidate pool (bench, buy list, upgrade path, co-play neighbours) instead of the hundred
   ranks candidates by the ring they land in and the loop-backs they add — a genuinely better
   99 seed than today's role-slot draft. But a seed has to be trusted, and trust comes from
   watching the trace on decks whose loops are known first. So: Discover Trace (Phases T1–T3),
   then the seed (T4) once the strategy vocabulary has been seen to be right.

Not recommended: a top-level tab. Trace is a way of looking at a deck's graph, not a place;
a fifth nav entry would put a verb where the nouns are.

## 2. What the trace is, precisely

A trace is a **deterministic breadth walk from the commander over the deck's cards, crossing
only joins that serve one of the deck's strategies**, with loop-backs counted. Pure function,
its own module (`crankmagic-trace.js`, UMD like `crankmagic-loops.js`), driven by a Node test
on the committed live state before any canvas draws it.

**Input.** The commander, the card set (the hundred, or a candidate pool), the graph's
`relation(a, b)`, and a list of *strategies* (§3).

**Rings.**
- Ring 1: cards with a join *from the commander* (or *to* it) that serves a strategy: an
  engine onto its tap ability (`drives`), a payoff that fires on an event it causes
  (`causes → triggers`), a demand its supply feeds (`loopFeeds`), a team quality its tribe
  wears (`tribal`), a multiplier of what it makes (`makes → multiplies`).
- Ring 2: cards with a serving join from a ring-1 card — the pieces that close the cycle
  (sacrifice outlets, a second untap engine, the equipment that pays for the first).
- Ring 3: cards with a serving join from ring 1 or 2 — payoffs and team quality.
- A card is placed in the first ring that reaches it. A later join onto a card already placed
  is a **loop-back**: it is not re-placed, its counter rises by one, and the join is kept as a
  return edge (drawn gold). Loop-backs are also read from `CrankLoops.find`, so a closed cycle
  through a card counts even when the walk reached that card by another route.
- Order within a ring is by join strength then name, so the animation is the same every time.

**Score.** `Σ over lit cards of ringWeight × (1 + loopBacks) × strategiesServed`, ring weights
3 · 2 · 1. It is a heuristic and is labelled one; Phase T2 calibrates the weights against the
simulator's measured scores on the 50 variants and the six live decks, and the pane shows
the trace score beside the measured score so the two are never confused.

**Output — the list first.** `{list: [{id, name, ring, group, purpose, via: {kind, term,
says}, from, strategies, loopBacks, status, price}], groups: [{strategy, ring, ids}], returns:
[{from, to, via}], unlit: [{id, bucket}], outsideDefinition: [{id, why}], score}`. The list is
grouped by ring and then by the strategy served, every row tagged with its Primary Purpose,
the join that lit it, the strategies it serves, its loop-back count and its ownership status.
The animation plays the list in order; the pane shows the groups; the Lab reads the same
object as its seed; the export writes it as a sheet. The test asserts the list.

## 3. Strategies: the vocabulary the walk queries

A strategy is **a small tuple over the graph's own terms**, not prose, so the walk is a query
and the same definition serves 3,411 commanders:

```
{id: "untap-loop", label: "Untap loop",
 needs:  {roles: ["untap"]},                     // ring-1 joins: engines
 onto:   {mechanics: ["tap-ability"]},           // what the engine must land on
 closes: {roles: ["sac-outlet"], produces: ["mana", "token"]},  // ring 2
 pays:   {triggers: ["creature-etb", "creature-death"], roles: ["payoff"]}}   // ring 3
```

Sources, in order of authority:
1. **Derived from the commander's rules text by the classifier** (`purposeOf`, `causes`,
   `produces`, `grants`, `wants`, `tribes`, `mechanics`): a commander with a tap ability that
   makes tokens gets *Untap loop*, *Copy loop* and *Sacrifice supply* offered; one that
   triggers on ETB gets *Blink*; one that grants gets *Team quality*; one with `wantsStat`
   gets the stat payoff. This covers every legal commander in the graph on day one.
2. **EDHREC themes** for the 617 commanders in `data/commander-ranks.json` (the page payloads
   carry theme names; `tools/` already fetches them) — mapped to the same tuple ids, so a
   commander's *Aristocrats* theme becomes the sacrifice strategy rather than a label.
3. **Hand-written** for commanders with a guide in `data/deck-guides.json` (`shape`,
   `keyCards`, `howItWins` name the strategies explicitly) and for anything Rob writes in a
   deck's definition (`definition.mechanics` already exists and the tile reads it).

Shipped as `data/commander-strategies.json` (one entry per commander in the graph that has
at least one derived strategy; the derivation tool is `tools/commander-strategies.mjs`, run
with the graph amplifiers), plus the strategy catalogue itself (`crankmagic-strategies.js`,
~12 tuples to start: untap loop, copy loop, blink loop, sacrifice supply, ETB payoff, death
payoff, counters and proliferate, team quality, stat payoff, tutor chain, recursion loop,
extra turns). The deck's own strategies default to the intersection of the commander's and
the deck's mechanics; the pane lets the reader tick more.

*Shipped in #186 (T0): sixteen tuples in `crankmagic-strategies.js` (the twelve above plus
tribal payoff, draw payoff, landfall and spells cast), each a `commander(card)` and a `join(r)`
query; `tools/commander-strategies.mjs` bakes `data/commander-strategies.json` (2,746 of 3,411
legal commanders carry at least one; on demand in the worker, `commander-strategies@1` in the
registry with a `--check`). EDHREC themes are not in the bake: the ranks file carries no
themes and the sandbox cannot page EDHREC; the two named sources are the live decks'
`definition.mechanics` and the guides' archetype line. One correction: the deck's default is
the UNION of the commander's strategies and the ones the definition names, not the
intersection — the intersection left the Chulane landfall deck with one strategy and nothing
lit. A strategy no join serves lights nothing and costs nothing; the pane lets the reader
untick.*

## 4. What the graph, the data model and the properties need

Found while building Phases A–C and PR 3; none is large, all are worth doing now because
they cost nothing until Trace needs them.

**Edges (`relateTerms` / `relation()`).**
- Already there: direction (`causes → triggers`, `makes → multiplies`, `grants → extends`,
  `drives`, `loopFeeds`), `kind`, `score`, `tag`, `reason`, and `isLoopLink`. Enough for the
  walk.
- Add `serves: string[]` — the strategy ids a join advances, computed from the same term
  pairs (an `untap → tap-ability` pair serves *untap-loop*; a `creature-etb` trigger serves
  *ETB payoff*). Cheap: a lookup on the pair's term keys at draw time, like `kind`.
- Add `strength` in 0–1 (score normalised over the pair's kinds) so beam width and pane order
  come from one number, and a `returns` flag when the target is already lit.
- Export the kind → colour/priority table from the graph module so beams, chips and the
  pop-up agree without a renderer-side switch.

**Nodes (`positions()` and the walk).**
- Already there: `depth`, `parent`, `pinned`, `r`, `x`, `y`.
- Add `parentEdge: {kind, term, says}` (why the node was reached — the pane's *via* column),
  `loopBacks: n`, `strategies: string[]`, and `progress` 0–1 for the rim animation.
- `mount()` gains `trace: {rings, returns}` as an alternative to the depth walk, so the canvas
  places nodes by ring and parent angle (the mock-up's geometry) instead of by breadth budget.

**Data.**
- `data/commander-strategies.json` (new, §3) and per-card `strategies` are *not* added to
  `graph.json`: strategies are a property of the join, computed at draw time; keeping them
  out of the 7 MB file keeps the rebuild rule simple.
- `data/graph.json` needs nothing new for v1. v2 could carry the EDHREC theme ids per
  commander (a dozen bytes each) so derivation does not need the ranks pages at runtime.
- The deck definition gains `strategies: string[]` beside `mechanics` — what the reader
  ticked in the Trace pane persists with the deck and drives the Lab seed later.

**Loops module.** `CrankLoops.find` already returns cycles with steps and payoffs; add
`countThrough(cards, relate) → Map<id, n>` (cycles through each card, capped at four) so
the trace's loop-back counters and the pane's "×3" agree with *Loops this card is in*.

## 5. Execution plan

Each phase is one PR: tests first, then the feature, then a journeys step, the page budget,
a walk at 1400 and 390 on the live library, docs, merge. Every phase keeps the 56 suites and
169 journey checks green.

**T0 — the vocabulary (data + tool).** `crankmagic-strategies.js` (the tuples),
`tools/commander-strategies.mjs` (derivation over the 3,411 legal commanders, EDHREC theme
mapping for the 617, hand-written overrides for the guided six), `data/commander-strategies.json`,
`tests/commander-strategies.mjs` (Krenko: untap, copy, sacrifice supply, ETB payoff, team
quality; Atraxa: counters and proliferate; Chulane: ETB payoff, blink; Niv-Mizzet: draw payoff;
Sol Ring's commanderless case; counts per strategy within ranges). Edge `serves` and
`strength` land here too, with graph tests.

**T1 — the walk.** `crankmagic-trace.js` + `tests/crankmagic-trace.mjs` on the committed
live state: D6 ring 1 contains Thornbite Staff, Goblin Bombardment, Skirk Prospector,
Purphoros, Impact Tremors; ring 2 contains Thousand-Year Elixir; Sol Ring, Arcane Signet and
every land are unlit; loop-backs on Krenko ≥ 3; determinism; the score formula; the unlit
report's buckets. `CrankLoops.countThrough`.

*Shipped in #186 with T0. `relateTerms` now returns `serves` and `strength` on every relation
(§4). The walk lights D6's ring 1 with Thornbite Staff first (the strongest join from the
commander), then Goblin Bombardment, Skirk Prospector, Purphoros and Impact Tremors among 43;
Sol Ring, Arcane Signet and the lands stay dark; 50 of the 69 graph rows light, 19 never
touched. Two things the data taught: (1) Thousand-Year Elixir is not in today's D6, so the
ring-2 assertion names no card; (2) a return edge counts as a loop-back only when the join is
one a loop runs on (`CrankLoops.edgesOf`: an untap onto a tap ability, a repeatable supply into
a demand, an event caused and fired on) — counting every serving join onto a lit card made
thirty Goblins naming each other read as five hundred loop-backs. Closed cycles through a lit
card (`CrankLoops.countThrough`, one adjacency) add to the counter, so the pane's ×n agrees
with "Loops this card is in". Ring 3 is empty on all six live decks: by ring 2 every card a
strategy can reach is lit.*

**T2 — the animation.** `crankmagic-graph.js` trace mode: ghosted hundred, ring placement,
beams drawn as growing strokes with a soft glow, the rim that runs round a node and closes,
gold return arcs with counters, play / pause / step / speed, `prefers-reduced-motion` jumps
to the finished still. `positions()` gains the node fields above. Weight calibration against
the simulator on the 50 variants; the result written into the plan doc.

*Shipped in #187. `mount()` takes `onTrace`; `setTrace(result)` replaces the breadth walk with
the trace's rings (ring 1 evenly round the commander in the walk's order, ring 2 and 3 inside
the parent's sector, the untouched cards ghosted on an outer band), beams grow from parent to
child over the first half of a step and the rim runs round the child over the second, return
edges bow in gold once both ends are lit, a lit card in a loop wears its ×n; `traceControl`
takes play · pause · step · back · restart · end · speed; reduced motion opens on the finished
still; a tap in trace mode inspects instead of re-centring; `select()` ends the trace.
`positions()` carries `ghost`, `parentEdge`, `loopBacks`, `strategies`, `progress`.*

*The calibration (`tools/trace-calibrate.mjs`, over the 200 measured rungs and the six live
decks, Spearman's ρ against the measured score, and within each variant the share of rung
pairs the trace orders the way the simulator did):*

| scoring | ρ vs measured | ladder agreement |
|---|---|---|
| plan (3 · 2 · 1 × (1 + loop-backs) × strategies) | 0.20 | 27% |
| log-damped loop-backs | 0.22 | 28% |
| no loop-backs | 0.22 | 27% |
| lit share | 0.14 | 27% |
| lit count | 0.19 | 27% |

*None tracks the measured score, and inside a variant the trace orders the ladder the wrong
way more often than not (a Base rung is a cheap, creature-dense shell with more serving joins
than the Max rung's Game Changers and mana). So, as the plan's rule says, the weights did not
change the claim: the number is shown as a **cohesion score** — how much of the deck the
commander's strategies reach and how tightly it loops — labelled a heuristic, with the
measured score beside it and a line under the list saying it is not power (ρ 0.2). The plan
formula stays, since no alternative did better than noise. What would make the number
predictive is outside this plan: a per-card value the walk does not have (the simulator's
per-card impact, `docs/simulation-fidelity.md`), or scoring each lit set with the engine.*

**T3 — the Trace pane and the deck entry.** Discover's third pane tab: the score strip
(trace score beside the measured score, cards lit, closed loops, loop-backs), the grouped
list (ring → strategy, every row tagged and with its status), the strategy ticks, the unlit
report with "open in List", and the two worlds — **This deck** (the hundred, the evaluation)
and **What it could be** (the candidate pool inside the definition, the recommendation, with
"would help, outside the definition" beneath). *Add to deck* on a pool row writes a planned
entry or an option the way the Cards page does. Route `#discover?deck=<id>&trace=1`. Deck
page: *Trace* in the hero row and on the Guide tab; the deck definition keeps the ticked
strategies. Export the list as a sheet. Tour step; help text; page budget for Discover
re-measured (the tab adds one control).

*Shipped in #187: the Trace tab (Card Info · List · Trace), the score strip (cohesion score
with the measured score beside it, cards lit of N, loop-backs drawn and counted), the list
grouped ring → strategy with the join that lit each card, its Primary Purpose and its
loop-backs, the strategy ticks (the offered set inline, the rest behind +n) persisted as
`definition.strategies` through `editDeck`, the transport (Play/Pause, Step, Back, End, speed),
the two worlds — This deck, and What it could be over the library, the deck's linked options
and the commander's two hundred most-played neighbours inside the colour identity and the
per-card cap, with "Would help, outside the definition" beneath; a pool row is *Add to deck*
on a draft and *Link as option* (the lens's uncommitted option) on a finalized deck. The unlit
sentence with *Open them in List*; the list as CSV; `Trace` in the deck page's hero row;
route `#discover?deck=<id>&trace=1`; a tour step; the help text. A filter change ends the
trace (the trace is the deck's; the filters narrow the world). The pool world's cohesion
score is large by construction (three hundred cards, many loops) and is not compared with the
deck's.*

**T4 — the Lab seed (after T3 has been used for a week).** `draft-builder.js` gains a
trace-seeded mode: the same pool trace, over the whole legal catalogue inside the
definition, seeds the 99 — ring 1 and ring 2 first, then payoffs, then roles to the rules
minimums — and the Lab's report shows the trace score of the draft beside its measured
score. The Lab plays the animation of the seed it just built, which is the moment the two
halves of the idea meet.

*Shipped in #188, on Rob's instruction to complete the plan rather than wait the week. The
Lab's Starting point gains **Seed the draft from the trace** (on by default): a pool trace from
the commander over the legal catalog inside the definition — colour identity, per-card cap,
legality — beamed to 60 · 40 · 30 new cards per ring so ring 2 stays quick, turned into a
bonus per card (`CrankTrace.seedFrom`: ring 1 300, ring 2 200, ring 3 100, +20 per loop-back)
that joins the builder's score; the roles still fill to their targets and every cap holds. The
draft's method and notes say how many of the chosen cards the trace reached; once the deck is
saved, **Watch the trace** in the run pane opens it on Discover's canvas. The measured score
stays the simulator's; after the calibration in T2 the trace figure is a cohesion score and
the Lab does not print it beside the measurement as if it were one.*

Sizing, at the pace of Phases A–C: T0 and T1 one session each, T2 two, T3 one, T4 one.

## 6. Questions for Rob, with a recommendation each

*Adopted as recommended in #187, on Rob's instruction to complete the plan: 1 yes, 2 yes,
3 yes (and after the calibration the number is a cohesion score, never a power claim), 4
ghosted, 5 overridden — T4 ships with the rest rather than waiting a week, with the caveat
in its own note.*

1. *Discover Trace tab, reached from the deck page* — recommended over a top tab or a Lab-only
   home (§1). **Yes / no.**
2. *Strategies ticked per deck persist in the deck definition* (so a trace run twice agrees
   with itself and the Lab seed can read it). **Recommended yes.**
3. *The trace score is shown beside the measured score, labelled a heuristic*, and never in
   the tile or the ribbon until calibration (T2) says it tracks the simulator. **Recommended.**
4. *Ghost the hundred by default* (the evaluation reading) rather than a truly blank canvas;
   "Blank canvas" as the toggle. **Recommended ghosted.**
5. *The Lab seed waits for T3 to be used for a week.* **Recommended.**

## 7. Out of scope

Animating the whole 31,830-card graph (the trace is a deck's cards, or a candidate pool of a
few hundred); mana-cost accounting inside loops (still deferred, as in Phase C); editing the
Master workbook; any change to the simulator's protocol.
