# Legacy application reference

This is the pre-CrankMagic README, retained for the measurement workspace and its history. See the root README for current entry points and ownership semantics.

# MtG Deck Matrix

A Commander deck-planning site for one person's collection and the people they play with,
published as a static site and usable by anyone who opens it. It answers three questions a
spreadsheet used to answer badly: **what are my decks and how far from finished are they**,
**which version of each deck should I build and what does it cost**, and **what card should
go in this slot**.

Plain HTML, CSS and JavaScript served as files. No `package.json`, no build step, no server,
no framework, no account. Everything about you lives in the browser you opened it in; nothing
is uploaded. It is built for a phone at a card shop, so the header folds, the Shop has a view
for a vendor's booth, and no font or library is allowed to block first paint.

It looks like a printed reference rather than a dashboard: a parchment page (`#f4efdf`) under
a deep-green-to-gold banner carrying three card crops, gold rules, Fraunces headings over
Inter body text, and card art wherever the card is the thing being talked about. One header,
`header.css`, serves all three pages, so the way back and the way onward land on the same
pixel at 1400px and at 390px.

## Run it

```
python3 -m http.server 8790          # any static server at the repository root
```

Then open `http://localhost:8790/`. That is the whole setup. `file://` will not work — the
pages fetch `data/*.json`.

Two other ports appear in this repository and are not interchangeable: `8790` is what
`tests/uat/journeys.mjs` expects (`UAT_BASE` overrides it), and `8000` is what the Simulate
screen polls `sim/status.json` from.

## The three pages

### `index.html` · My Decks

The front door: every deck you have, what it does, how far from finished it is. Three tabs —
**Decks**, **Bench** (spare copies) and **Upgrades** (the card going in, the card coming out,
and why).

The Decks tab opens with three ways in, above the list rather than after it: **Add a deck**
(paste one you already have, or give an Archidekt link), **Build one** (describe it and have
it built) and **Explore cards** (the card graph). They sit above the grid because at six
decks it did not matter and at sixteen the two things somebody arrives wanting to do were the
two hardest to find.

Decks added or built land in the list below them, as peers of the six that ship. Each deck
card carries a **⋯** menu: *Archive* takes a deck off the list and its cards out of the buy
total without deleting anything, and one click in the drawer at the bottom brings it back;
*Delete* destroys a deck you added, and is not offered for the six that ship with the app
because there is nothing local to delete and a button claiming otherwise would be lying about
what it does.

Upload what you own as csv, xlsx or a pasted note and the collection is allocated to your
decks copy by copy, the remainder landing on the bench. `.xlsx` is read by walking the ZIP
and inflating the shared-string table rather than asking you to export a CSV first.

**A card name that is not a card is a question, not a wall.** An unmatched name gets up to
five candidates, each saying why it is offered, with *Leave it out* beside them as a real
answer. If none of them is right, paste a link — a Scryfall card page, a TCGplayer product
page, an EDHREC or Card Kingdom slug — and it is read for whatever it will give. If even that
resolves to nothing, the card is kept as a **manual card** and Scryfall is asked about it
again on every load; the day it is indexed it stops being manual in every deck holding it.

### `matrix.html` · the Deck Matrix

The build-and-buy half, in four steps.

**Compare** is a shelf you stock. Fifty researched variants live in a library and Compare
shows the ones you have taken out of it, with *"44 of 50 researched variants not on Compare"*
one click above them. Nothing is deleted — every variant is still measured and still scored —
and a deck you built yourself is always on the shelf.

**Deck** turns a pick into an exact hundred, slot by slot, at the rung you choose. Each slot
opens in place into its rung ladder plus any cards you already own that would do that slot's
job, ranked, with the reasoning shown. A readiness strip answers the two questions you cannot
answer by eye with the cards in front of you: is the hundred legal at this bracket, and can it
cast itself.

**Shop** is everything still owed in one list, with a Store view built for a phone at a
vendor's booth — a search box, the seller's own letter groups, one Buy button per row, and a
count of what is left to find. A narrow screen lands there rather than on the table.

**Game Log** records what actually happened in under thirty seconds between rounds, and reads
it back against what the simulation predicted — gated on a Wilson score interval, so twelve
games never becomes a claim. When the sample cannot support a verdict it says so, and it names
what it cannot separate: the deck, the pilot, or the pod. The simulation can now separate one
of those three on its own — see *The deck, and the person holding it* below.

Two lists reach the Shop, and they are not the same kind of thing. The **deck plan** is
derived: what the boxes want, minus what the ledger says you own. The **pull list** is not —
it is a written document, `data/pull-list.json`, built by `tools/import-pull-list.mjs` from
the .docx in `data/source/`, and most of its cards are for builds this app is not tracking.
Its rows carry a gold `list` tag, its per-copy ceiling is the price the Shop shows, and the
List filter scopes the page to either one.

### `graph.html` · the Card Graph

7,764 Commander-legal cards, what connects them, and a Copilot that says which twenty are
worth a look. Cards are never linked to cards in the model — a card links to the *events* it
fires on and the events it causes, so synergy is a path derived when you ask rather than a
pair somebody wrote down.

Type a name into **Focus card** and the graph is drawn around it — including a card the
catalog was never baked with, which is looked up on Scryfall, checked for Commander legality
and read by `card-classify.js`, the same module the corpus was baked with. A visiting card is
marked as one, because two things are true of it that are not true of the rest: nobody owns
it, and EDHREC co-play was never computed for it.

The Copilot never picks a card and never edits a deck. It states a finding, cites the
evidence, and offers a filter that resolves to the same state the side pane already drives, so
a finding you disagree with costs one click to ignore. Its findings filter by deck, by kind
and by whether they come from the card rules or from the simulator; **nothing is ever hidden**,
only folded into a drawer with its count on the label.

### What the browser keeps

Everything lives in `localStorage`. Export writes one file carrying the lot — picks, boxes,
Shop marks, prices, the decks you added and the collection you uploaded — and importing it
puts all of that back. `data/*.json` is never written to by the app: one describes Magic, the
other describes you. `user-state.js` names every key in one enumerable list, and
`tests/user-state.mjs` requires the backup to cover exactly what the clear destroys — every
listed key is one the code writes, and every key the code writes is listed.

## Current catalog coverage

Fifty variants, each published at four rungs and each connected to a buy profile. The six
that carry the ★ My Build ribbon are the owner's own decks with audited shopping plans. The
rest promote their published precon seed, key-upgrade table, upgrade ladder and Bracket 3
route into variant-specific purchase profiles; verified shared precons reuse their full
100-card shell, while incomplete source lists stay visibly modeled rather than being presented
as audited decklists.

## Build a deck from nothing

**Build a deck**, beside **Add a deck** on My Decks, takes a commander, sixteen themes as
chips, six play styles, a budget to aim at, and any cards you want kept in. It queries live
Scryfall and builds three complete, Tier 3 legal, exactly-100-card rungs, ranked by what
people actually play with *your* commander — EDHREC's per-commander inclusion and synergy
numbers, not a global popularity rank. Sol Ring outranks every card in Magic and says nothing
about whether it belongs in an Atraxa deck rather than a Krenko one. A commander with no
EDHREC page still builds; the weight folds back onto the global rank instead, and the deck it
produces is asserted card for card against the one it produced before.

The budget is labelled *aimed at, not capped*, because that is what it is. The rung you keep
is stored exactly the way a pasted deck is, so it is a peer of every other deck everywhere
downstream.

## What the numbers mean

Every number in this app comes from `sim-engine.js` and from nowhere else. It is a Monte
Carlo model of a four-player Commander game — not a rules engine, and the file says so in its
own header.

**The score is a 0–100 composite of nine weighted parts, not a win percentage.** The nine:
wins games, casts its spells, draws action rather than lands, gets the commander down, has
answers when it needs them, closes the game, keeps its hand live, is a deck you enjoy
piloting, is a deck the table enjoys. The readout shows all nine, sorted by what each one
*cost* rather than what it scored, each carrying its raw measurement in words — *"mana screwed
in 8.5% of games, against a 10.0% target"* — because a second number is not an explanation.

**The protocol.** Six seeds (`20260904, 20268823, 20276742, 20284661, 20292580, 20300499`),
20,000 games each, against the `mixed-pod` opponent table, 16 turns, 3 mulligans. That is the
only run whose number may be recorded. A *preview* is one seed and 2,000 games — fast enough
to re-run on every click, and honest about being approximate; anything that reports one as a
measurement is lying by about a tenth of a point, which is exactly the size of the differences
people care about.

### The deck, and the person holding it

A score is a deck and a pilot multiplied together. Until 2026-09-07 there was one pilot, so
it could not be factored — the three opponents were nine parameterised archetypes, and our
side of the table had one mulligan rule, one cast order and one attack target.

`pilot-policy.js` makes five decisions into data — which sevens you keep, what you cast
first, who you attack, whether you tap out, and what you hold back — and names three answers.
`BALANCED` is the pilot that was already there, held to that by a test that requires a
no-policy run and a `BALANCED` run to be identical metric for metric across six decks and
three seeds. **No published number moved.**

Press *How you play it* on any deck and the app runs the same hundred four times — played
casually, played to win, and twice more with one decision handed back — and says which
decision the difference is made of:

```
Krenko, Mob Boss     casual 59.73    competitive 76.47    +16.74    win 30.1% -> 47.4%
  who you attack             attacking whoever is closest to winning              +11.10
  whether you tap out        keeping the mana for an answer up from turn four      +4.57
```

Those credits are runs, not inferences, which is why the sentence differs by deck: Krenko's
headroom is nearly all in who it attacks, Atraxa's nearly all in holding an answer up.

**The two lens numbers do not belong beside the header score.** Both are measured on a
stricter interaction rule — an answer counts only when the mana for it was genuinely left
over, where the published protocol counts one you *could* have held up — and that is worth
about twelve points to every deck. Read the pair against itself. The panel says so.

The most useful thing the lens found was about the model rather than about any deck.
Attacking "the leader" turns out to mean two different things: the biggest board is worth
+1.70, and whoever is closest to winning is worth +10.93, because the shipped combo profile
wins on turn 9 with almost no board. `docs/simulation-fidelity.md` §3a has the full table,
including the two measurement errors the ablation exposed.

### The four rungs

Every variant is published at four rungs, and each one is answering a different question
rather than spending a different amount of money.

| Rung | Question | How it is built |
|---|---|---|
| **Base** | What does the entry price buy? | The cheapest hundred that is still this deck — placeholders you sleeve up while the real cards are on the buy list. Constructed by `tools/sim/build-base.mjs`, measured once, never optimized. |
| **Tuned** | How well can this deck win? | Hill-climbed on the performance vector at Tier 2, $60 a card. |
| **Pod Fun** | Does the table get a game? | The same hundred asked a different question: win rate held **under 45%** as a hard constraint, the pod-experience metric weighted, and a floor on power so it can never come out the stronger build. |
| **Max** | What does Tier 3 add? | Hill-climbed on the performance vector again, starting from Tuned's final hundred, at Tier 3 and $100 a card. |

The six variants that carry the ★ My Build ribbon are the owner's own decks and were built to
a different brief. Their Pod Fun rung was searched over his own bench at zero spend, with the
win rate held **under 60%** rather than 45% — his own instruction — so all six sit above this
file's 45% ceiling and are declared as such in `data/simulation-summary.json`'s
`caveats.podFunOverCeiling`, which currently lists fifteen entries of which those six are a
subset. Their Base, Tuned and Max rungs are not hill-climbed at all: Base is the target
hundred with the workbook's Tuned swaps undone, Tuned is the target hundred itself, and Max is
that hundred with the deck's own Bracket-3 list applied.

Each rung starts from the hundred the rung below it finished at. That is not a detail: two
independent hill-climbs from the same list land in different local optima, which is how a Tier
3 Max rung with twice the budget once came out *weaker* than the Tuned rung it is meant to be
an upgrade of.

Two things protect a deck from being optimized into a different deck. A **role census** stops
the search trading away a whole job — it cannot cut its way below two board wipes or eight
ramp pieces. And a **strategy floor** holds how much of the deck's own plan the hundred still
carries, measured against the phrases the deck itself repeats rather than against its declared
mechanics label. The label was tried first and is too coarse: "Control / Interaction" does not
describe a theft deck, so a census built on it scored every one of that deck's actual theft
cards as off-theme.

```
node tools/sim/sweep.mjs                     # all fifty variants, four rungs each
node tools/sim/bake-ladders.mjs --write      # measured hundreds back into the buy plans
node tools/sim/reprice.mjs --write           # cost figures re-summed from the cards
node tools/sim/bake-sweep.mjs --write        # the published numbers, with caveats
```

`bake-ladders` will refuse to write unless composing every rung through `lineup-model.js`
reproduces the exact hundred the sweep measured, because a published score belonging to a deck
other than the one printed underneath it is the failure this whole pipeline exists to avoid.

### Simulating one deck from the page

Every variant — curated or generated — has a **Simulate** button. It plays the deck's Tuned
build against randomized opponents thousands of times, finds where the build actually loses,
proposes swaps, and re-measures. The games run on your own computer; no API key is needed and
nothing is uploaded.

```
python3 -m http.server 8000                        # so the page can watch the run
node tools/sim/run-batch.mjs --variants 5o         # request, pool, baseline, optimize
node tools/sim/run-batch.mjs --all                 # every variant in the catalog
claude "/simulate-deck 5o"                         # let a local Claude session pick the swaps
```

The Simulate screen polls `sim/status.json` every two seconds while a run is in progress and
loads the result when it finishes. Away from localhost it shows the command and takes the
result file through a file picker instead. **Update variant** applies the optimized 100 as an
overlay, and **Revert** puts the original list back; neither touches the catalog on disk. To
ship an optimized list with the site instead, use `node tools/sim/bake-result.mjs --result
<file>`.

### What the runner will and will not do

`tools/sim/run-sim.mjs` owns every stop condition — the per-request game cap in
`sim/sim-ledger.json`, a wall-clock budget, an iteration limit, and a convergence test — and
returns the best list it measured on every stop path. A `--games` argument can lower a limit
but never raise one. Delete `sim/sim-ledger.json` to reset the cumulative count.

Convergence is "keep going until the improvements are negligible", where negligible means
smaller than the sampling noise or under 5% of the score already reached, whichever is larger.
It is measured over a window of the best score rather than one iteration at a time, so three
consecutive one-point gains count as progress on an eighty-point deck even though no single
one of them clears the bar. The noise figure is measured, not assumed: at two thousand games
the same deck scores within about ±0.7 points across seeds.

`maxLedgerSimulations` is a budget, not a safety property, and it has been raised once — from
five million to fifteen — to pay for the four-rung rebuild of all fifty variants. The engine
runs about 42,000 games a second, so the whole cap is a few minutes of compute; the ledger
exists so that spend is visible and deliberate, not so that it is impossible.

Two guards keep the output honest rather than model-shaped. Role floors stop the optimizer
trading away a whole job, and a card only becomes a cut candidate when the simulation caught
it stranded in hand, cast too late for its cost, or never cast — never when the games it was
cast in were measurably the games that were won.

Every run finishes by replaying both the original and the optimized list on seeds the
optimizer never saw. Only that comparison decides the verdict, so a gain that exists solely on
the tuned seeds is reported as `not-confirmed`.

### What it cannot see

The engine is a model, not a rules engine. Combat and repeatable drain are the only routes to
victory it knows, opponents are nine archetype curves (three power tiers, six playstyles)
rather than real decks, there is no stack and no real blocking assignment (a toughness-weighted
reduction stands in for it, and a Defender creature contributes no attack power unless the deck
itself lifts that restriction — with its toughness as the damage when an Arcades-style effect
says so), and the fun/participation score is one reasonable take on a subjective idea, not a
settled definition. The full list is fourteen numbered entries in `sim-engine.js` and is copied
into every result file it writes.

It also does not model a storm count, a ritual chain, or winning off a single spell. A real
mono-red list built around Mana Geyser, Seething Song and Reiterate scores 34.55 against the
six baked decks' 71 to 86. That is not a verdict on the deck; it is the engine saying it cannot
see how the deck wins, and it will say the same about every spellslinger list it is shown.

And one gap is larger than anything that list names: **no creature's printed power or
toughness has ever reached the engine.** `data/cards.json` carries no such field, so almost
every creature ever simulated was played at `max(1, round(cmc × 0.9))` on both sides of the
slash. `tools/add-power-toughness.mjs` recovers a real body for all 880 creatures in the
catalog from a bulk file already on disk; re-measuring the six shipped decks with printed
bodies costs each of them between 2.10 and 14.82 points and moves the ranking. It has been
measured and deliberately not applied, because applying it moves every published number at
once. `docs/simulation-fidelity.md` §1 has the table.

**Read the numbers as a comparison between two versions of one deck, never as absolute odds.**
Figures measured on different engine versions are not comparable at all, and the app never
subtracts one from the other — `data/simulation-summary.json`'s `engineBoundaryNote` says why,
and `deck-audit.js` enforces it in code.

**One rule about anything generated rather than measured:** the app measures and any model
explains. Card counts, the curve, role counts, mana and the score are computed and handed over
as fact; prose is prose; and every card a model names is checked against the hundred that was
sent before it can reach the screen. `docs/ai-agents.md` covers each agent's prompt, schema
and checks; `docs/claude-api-evaluation.md` covers the money and why there is nowhere in a
static site to keep an API key.

## How the repository is laid out

Everything a page loads sits at the repository root, because there is no build step to
assemble it from anywhere else.

```
index.html  matrix.html  graph.html      the three pages; read their <script> blocks first
*.js                                     UMD modules — browser globals AND Node exports; 37, none dead
*.css                                    5 stylesheets: header, viewer, card-table, app, graph-page
data/                                    18 JSON files the app reads and never writes
data/source/                             the workbooks and documents those files are built from
tools/                                   importers and one-off migrations (⚠ several write data/)
tools/sim/                               the simulation pipeline: request → pool → optimize → bake
sim/                                     config.json, opponents.json, status.json — the rest is ignored
tests/                                   39 Node suites, built-ins only
tests/uat/                               the browser journeys, and a README worth reading
graph/                                   the Neo4j ingest that bakes data/graph.json — local only
prototype/  payload/  payload_v3/        historical; nothing running references them
```

Every shared module wraps itself so it attaches to `globalThis` in a browser *and* answers
`module.exports` under Node. That is what lets `tests/*.mjs` `require()` browser code with no
harness, and it is why the `<script>` tags on each page are in dependency order with `defer` —
`defer` preserves document order, so a module that reads `window.MtgSimEngine` at load time
must be listed after it.

The fastest map of the module graph is the `<script>` block of each page: the comment beside
each tag says why that module is there and what breaks without it.

## Working on it

### Tests

Thirty-nine suites, run individually or all at once. They use only Node built-ins — there is
no `package.json`, no dependency to install and no build step.

```
./runtests.sh -q             # all of them, one line each, non-zero exit if any fail
./runtests.sh                # the same, with every suite's own output
node tests/sim-engine.mjs    # or one, while working on it
```

Use the script rather than a shell loop. `for f in tests/*.mjs; do node "$f" || echo FAIL;
done` exits 0 whatever happens — the exit code belongs to the last `echo` — so a red suite
scrolls past under a thousand green lines and the run ends looking like a pass. That happened,
and something got pushed on the strength of it.

| | |
|---|---|
| `asset-versions` | one `?v=` per file across every page, and a changed file has a changed version |
| `card-classify` | the one copy of "what does this card do", re-derived against 1,501 cards the bake already committed |
| `assignment-model` `slot-model` `lineup-compliance` | the slot projection, the hundred it composes to, and the rungs across all fifty plans |
| `compliance-model` | the Commander bracket rules, shared between the page and the simulator |
| `data-integrity` | the baked catalog and the source patterns the app depends on |
| `deck-audit` `deck-measure` `sim-engine` `sim-lenses` | the simulation engine, its caps, and the findings read off it |
| `deck-build` `deck-generator` `edhrec-client` `deck-sources` `deck-import` `deck-store` | building a deck from nothing, and adding one you already have |
| `game-record` | what the game log may claim, and the Wilson interval that gates it |
| `inventory-import` `master-regenerates` `xlsx-writer` `docx-writer` `shop-export` | reading what you own, and writing what you need |
| `import-wiring` `manual-rung` | the modules each page loads, and hand-added options |
| `card-table` | the one filter, sort and group-by engine behind the bench, the upgrades and the Shop |
| `user-state` | every key this browser saves: that a backup covers what a clear destroys, and that nothing writes a key the clear would miss |
| `card-resolve` | what to do when a pasted name is not a card: the ladder that finds candidates, and the panel that asks rather than dead-ends |
| `card-link` | a link to the card, read for whatever it will give: the exact-printing rung, the slug guess, and the manual card a link that resolves to nothing still becomes |
| `manual-cards` | the population of cards Scryfall does not have yet: one request to ask about all of them, exact matches only, and the promotion written back into every deck holding one |
| `card-images` | the picture for a card the app does not ship: shipped facts, then this browser's cache, then the image the deck record already carries, then Scryfall — bounded, least-recently-used, and safe when storage refuses to write |
| `measure-report` | what the score is made of: that the breakdown adds up to the number, that rounding for display never moves it, that the run says how much work it did and how fast, and that a re-run says whether the change is real before it replaces anything |
| `guide-agent` | the agent that writes "How to play it": that every card it names is one of the hundred it was sent, that it is never asked for a number the app can measure, and that the checks pass on the six guides a person wrote by hand |
| `pilot-policy` | the person holding the cards: that the published pilot is still exactly the published pilot when it becomes a parameter, that each measurable decision reverts to one the other pilot actually makes, and that the advice never attributes a gap it did not measure |
| `friends-deck` | a real 100-card export somebody handed over, pinned as a fixture: that every card in it is in the registry and reachable on the graph, and that the one name in it which is not a card is answered with the real cards a person would have meant |

### Journeys, in a real browser

`tests/uat/journeys.mjs` opens the pages as three people — a first-timer with empty storage,
somebody a year in with ten added decks and 3,200 cards, and somebody leaving with their data
— across twenty-one journeys at two screen sizes, 1400×950 and 390×780. Every step of every
journey is additionally checked for four things: no horizontal overflow, nothing under a 9.5px
type floor, no control without an accessible name, and nothing that looks selected without
saying so.

It needs Playwright and a static server, neither of which this repo depends on, so it **skips
rather than fails** when either is missing — a missing browser is a missing tool, not a
failing app.

```
python3 -m http.server 8790
node tests/uat/journeys.mjs                  # add --headed to watch it
```

`UAT_PLAYWRIGHT` points at a Playwright install elsewhere, `UAT_BASE` overrides the URL and
`UAT_CHROMIUM` the binary. Scryfall is stubbed from recorded answers, so a journey never fails
because somebody else's site was slow. See `tests/uat/README.md`, which lists journey by
journey the bugs each one caught.

### `?v=` versioning

Every script, stylesheet and data file is fetched with a `?v=N` and through the browser cache,
which is what makes a second visit cost zero requests. That rests entirely on one rule: **a
changed file must get a new version.** Break it and the failure is not a stale render for a few
minutes — it is a browser running last month's code, indefinitely, with nothing on screen to
say so. It had already broken twice before anything checked it.

So: change a file, bump its `?v=` everywhere it is named, then

```
node tests/asset-versions.mjs --update
```

which re-records the content hashes and refuses to record a changed file whose version has not
moved.

### House conventions

- **The reasoning lives in the code.** Most modules open with fifteen to thirty lines stating
  the problem, the options, the measurement and what was rejected — usually by naming the bug
  that made the file what it is. Commit messages do the same at a larger scale, and quote the
  complaint that caused the change. `git log` is the design history, not a changelog.
- **Every behaviour gets a test, and the test names the rule where it broke.**
- **Measure, do not assume.** Moxfield answers 403 because that was checked, not because it
  seemed likely. A CDN that cannot be reached cost 12.7 seconds of blank page, measured. Prose
  in this repository should be able to name where a number came from.
- **Say what is not known.** A sample too small to support a claim says so; a number that
  cannot be compared is not compared.
- **No new dependency.** If something needs a library, the first question is whether eighty
  lines would do it — that is why `docx-writer.js` and `xlsx-writer.js` exist.
- Work on a branch, run `./runtests.sh -q` and the journeys before pushing, and open a draft
  pull request rather than merging.

## Read further

### CrankMagic application work in progress

The approved production implementation is being assembled at `crankmagic.html`
on `astra/simulation-fidelity-plan`. `docs/crankmagic-build-status.md` records the
remaining integration work. Simulator changes are explicitly on hold.

New Node suites run automatically with `bash runtests.sh -q`:

- `collection-model`: copy conservation, acquisition, reservations, placement,
  replacements, archive, Sell / Trade and duplicate imports.
- `collection-exchange`: staged parsing, printing identity, checksummed backups,
  safe spreadsheet text and enriched workbook projections.
- `crankmagic-core`: hard construction limits, atomic compound changes and linked
  option promotion without duplicate ownership.
- `crankmagic-workbook`: exact printing round trips, selective spreadsheet edits,
  Excel limits and an optional independent reader (`XLSX_PYTHON`).

`node tests/uat/crankmagic-journeys.mjs` exercises the new app through Chromium,
including native IndexedDB conflicts, quota aborts, offline reopening, mobile
navigation and the complete order/receipt/placement/backup journey.

| | |
|---|---|
| `docs/prd.md` | What this app is for, feature by feature, with the requirements that came directly from the user, the measurement system as a product requirement, the data provenance, and the open gaps with honest severity |
| `docs/handover-index.md` | The technical map: every module and what it owns, every data file and what generates it, every test, every tool, every external service, and what is deliberately absent |
| `docs/simulation-fidelity.md` | Where the model and Magic still disagree, in order of how much each gap distorts a score, with what closing each one would cost |
| `docs/ai-agents.md` | What Claude is asked to do here, how each ask is grounded, and what each one costs |
| `docs/claude-api-evaluation.md` | Why no API key can live in the browser, and the registry gate that stops an invented card name reaching the screen |
| `docs/handover-prompt.md` | A copy-and-paste prompt for handing this project to a fresh session on another machine |
| `docs/mechanics-design-v2.2.md` | How counters and combat keywords were modeled, and which mechanics were deliberately left out |
| `docs/simulation-refresh-instructions.md` | A historical brief: how the measurement protocol was specified when the catalog was thirty variants on engine v2.1 |
| `BACKLOG.md` | Six deferred decisions, each with the gap, what it would take, and why it is not minor |
