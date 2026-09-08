# Full-app sweep and hardening

A pass over the whole of CrankMagic, written 8 September 2026. Every finding below was
reproduced before it was written down, and the ones marked **fixed** were fixed and
merged in the same sitting. The rest are recommendations with a stated cost.

The method was deliberately boring: drive the real app in Chromium at phone and desktop
widths, measure geometry rather than eyeball it, run the engine against real hundreds in
Node, and compare what two modules say about the same card.

---

## What was found and fixed

### The header painted over its own buttons on every phone (fixed, #102)

The brand block is `flex:1; min-width:0`, so it shrinks below the width its own text
needs, and nothing stopped the text painting out of the box.

| Viewport | Buttons start at | Wordmark ends at | Overlap |
|---|---|---|---|
| 320px | 84 | 202 | 118px |
| 375px | 139 | 202 | 63px |
| 390px | 154 | 202 | 48px |
| 430px | 194 | 202 | 8px |

The wordmark can no longer overflow, and under 560px the two buttons become 38px icons
carrying an `aria-label`. The header also got shorter: 111px to 83px at 390.

### Three tap targets under 30px (fixed, #102)

The aether pause pill at 26×26 sitting beside the wordmark, every table header's sort
button at 24px, and the commander picker's name button at 16px. All 36px or more now.

### One mana source paid every pip, and nothing was ever spent (fixed, #103)

The engine kept a count, per colour, of permanents making that colour, and asked each
colour of a cost against it independently. So a single Watery Grave paid a `{U}` and a
`{B}` in the same spell; a triome counted three times; the table never decremented, so
the same land paid for the first spell of a turn and the fourth; and "Add {C}{C}" was
read as "any colour", which is how Sol Ring came to fix a five-colour manabase.

Costs are now matched to distinct sources and the assignment that proves a cost payable
is the payment. Every published score moved, so this is engine generation **v2.7** with a
re-sweep behind it.

### A ritual was a permanent mana rock (fixed, #103)

Seething Song adds five red mana once. It was classified as ramp, so it modelled as a
rock making five mana every turn for the rest of the game. Dark Ritual likewise. Most of
why a spellslinger list measured the way it did.

### The page and the engine disagreed about 22 cards (fixed, #103)

`tests/slot-model.mjs` compares what `slot-model.js` and `sim-engine.js` say about the
same card. Fixing the engine's colourless-mana and ritual rules broke it, correctly: the
page still called Ashnod's Altar a five-colour source and Cabal Ritual ramp. Both were
fixed in the page too. **This test is the most valuable one in the repo** and the reason
is worth stating: it is the only place where two independent implementations of the same
judgement are forced to agree, and it caught a real bug in the half nobody had touched.

### The ratings generator pointed at a file that had moved (fixed, #103)

`tools/sim/rate-decks.mjs` read `data/master-v2.json`; the workbook lives at
`data/archive/master-v2.json`. The generator that reproduces every published number had
been unrunnable for as long as that move is old, and nothing said so.

---

## Hardening recommendations

Ordered by what they buy, not by effort.

**Status: 1-5 are done** (PR #105). What each one turned up on its first run is recorded
under it. 6 and 7 are open, with the reasons below.

### 1. Make the generators run in CI, not just the tests
**DONE.** `tests/generators.mjs` resolves every repo-shaped path each tool names, and runs
the four that offer a check mode. Its first run found three more instances of the
rate-decks bug: `tools/sim/remeasure-all.mjs` read `data/rung-lists.json` and
`data/variants.json`, and `tools/build_card_facts.py` and `tools/build_guide_shapes.py`
read `data/master-v2.json` — all four moved to `data/archive/` and none had been
repointed. All fixed and re-run. `.github/workflows/tests.yml` now runs every suite on
every push; there was no test workflow at all before.


The `rate-decks.mjs` breakage is the shape of the problem: a committed data file whose
generator cannot run is a number nobody can reproduce, and the suite passes anyway
because it only checks the *file*. **Add a job that runs every generator in `tools/` in
`--check` mode** — the ones that already have it — and fails when a generator cannot
reach its inputs. Cost: small. It would have caught this on the commit that moved the
workbook.

### 2. Give the two-implementation test more to compare
**DONE.** Mana value turned out to be compared already — the sweep was wrong about that.
What was not: the type reading under everything else, and the instant/one-shot split.
`slot-model.js` now exports `isRitualSpell` (one copy of the rule instead of an inline
duplicate) and `tests/slot-model.mjs` compares it, plus land, creature and basic-land, over
all 2,025 catalog cards. No drift today. **Ramp amount cannot be compared, because only the
engine computes one** — and writing that check found that `rampAmount` credits a spell
fetching ONE land with two mana (13 cards, Rampant Growth and Solemn Simulacrum among
them), while Nature's Lore gets one for the same effect. Recorded as item 6 of
`docs/simulator-enhancement-plan.md`; the fix moves published numbers, so it belongs in the
v2.7 re-sweep, and the test pins today's behaviour with a comment pointing there.


`tests/slot-model.mjs` compares roles and colour production between the page and the
engine. It should also compare **mana value, the ramp amount, and the instant/one-shot
split**, which are the other judgements both halves make independently. Cost: small, and
it extends the one mechanism that has actually caught things.

### 3. Pin the browser journeys the way the suites are pinned
**DONE.** `tests/uat/geometry.mjs` holds the three properties; `tests/browser-geometry.mjs`
serves the repo on its own port and runs them at 320, 375, 390, 430, 768 and 1400 across
four pages, and is picked up by `runtests.sh`. It skips loudly with no browser and is
required in CI and in the release gate. **Its first run found two live bugs**: the hero
card fan pushed the page 9px wide at 768 (a rotated decorative card giving the whole page
a horizontal scrollbar), and the Deck Lab's sub-section headers were 28px tall on every
phone. Both fixed.


Everything in this session's UI verification was a throwaway Playwright script in a
scratch directory. `tests/uat/journeys.mjs` exists and is not run by `runtests.sh`.
**Fold the geometry checks into it** — no horizontal page overflow, no tap target under
36px, no element painting outside its box in the header — and run it. Cost: medium. It
is the difference between "I checked" and "it is checked".

### 4. Decide what happens when the engine cannot see a deck's win
**DONE.** `unwatchedWinPaths` is published as `winPathsTheEngineCannotWatch`, the engine
now returns the card names too, an extra `limits` line names them in the exported report,
and the Deck Lab prints the warning above the score rather than below it. The Lab's refine
loop stops once on such a list and says why: optimizing swaps on a score that cannot see
the combo tunes everything except the way the deck wins. Clicking again proceeds, because
tuning the shell is sometimes exactly what was wanted.


v2.7 counts `unwatchedWinPaths` — cards saying "you win the game", whose condition is the
part not modelled. The number is computed and nothing shows it. **The report should say
it, and the Deck Lab should refuse to rank a list where it is high**, rather than quietly
scoring a combo deck as a pile of creatures. Cost: small (it is a rendering change plus
one guard). This is the highest-value honesty fix left.

### 5. Bound the service worker's cache list
**DONE.** Two caches — shell and data — each keyed on a hash of its own list rather than on
the worker's `?v=`. A CSS fix no longer re-downloads `data/graph.json`. `tests/service-worker.mjs`
runs the real worker source against a fake Cache Storage and holds it to the property in
both directions.


`crankmagic-sw.js` names every asset with a `?v=`, and the count has grown to 108. Every
version bump rewrites the file and invalidates the whole cache. **Split the manifest**:
the shell (HTML, CSS, the app modules) from the data files, so a data refresh does not
evict the shell. Cost: medium. Symptom today is a slow first load after any change.

### 6. Give `data/` a size budget
**OPEN.** Still worth doing, and still medium-to-large: it needs a generator change and a
new shape for `graph.json`. Item 5 removed the worst symptom (the 7.1 MB was being
re-downloaded on every unrelated change), which lowers the urgency without closing the
issue — the file is still fetched in full before Discover can rank anything.


`graph.json` is 7.1 MB and is fetched in full before the Discover graph can rank
anything — which is why the Deck Lab's refine pass had to learn to wait for it. **Split
it**: the relation fields the graph actually walks, and the rest. Cost: medium to large,
and it needs a generator change. Worth doing before the corpus grows again.

### 7. Retire the second app
**OPEN, and not mine to close.** Whether `legacy-decks.html` and `matrix.html` are still
wanted is a product decision. If they stay, they should load the shared header instead of
a copy of it.


`legacy-decks.html` and `matrix.html` still carry their own header, their own CSS and
their own copy of the OG tags — four files to keep in step every time the brand changes,
and two of them were missed in earlier passes. **Decide whether they are still wanted**,
and if they are, make them load the shared header rather than a copy of it.

---

## What was checked and found sound

- **No horizontal page overflow** on any of the five pages at 320, 360, 375, 390 or 430.
  The wide Collection and Shop tables sit in their own scroller, which is the house rule.
- **No console errors** on any page at any width tested.
- **The version cascade holds.** 108 assets, one version each, every hash matching its
  recorded bump.
- **44 Node suites pass**, and the count in the README matches what `runtests.sh` runs.
- **The published protocol is still refused for previews.** Nothing measured on `preview`
  or `refine` can be filed as a rating.
