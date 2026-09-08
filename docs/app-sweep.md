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

### 1. Make the generators run in CI, not just the tests

The `rate-decks.mjs` breakage is the shape of the problem: a committed data file whose
generator cannot run is a number nobody can reproduce, and the suite passes anyway
because it only checks the *file*. **Add a job that runs every generator in `tools/` in
`--check` mode** — the ones that already have it — and fails when a generator cannot
reach its inputs. Cost: small. It would have caught this on the commit that moved the
workbook.

### 2. Give the two-implementation test more to compare

`tests/slot-model.mjs` compares roles and colour production between the page and the
engine. It should also compare **mana value, the ramp amount, and the instant/one-shot
split**, which are the other judgements both halves make independently. Cost: small, and
it extends the one mechanism that has actually caught things.

### 3. Pin the browser journeys the way the suites are pinned

Everything in this session's UI verification was a throwaway Playwright script in a
scratch directory. `tests/uat/journeys.mjs` exists and is not run by `runtests.sh`.
**Fold the geometry checks into it** — no horizontal page overflow, no tap target under
36px, no element painting outside its box in the header — and run it. Cost: medium. It
is the difference between "I checked" and "it is checked".

### 4. Decide what happens when the engine cannot see a deck's win

v2.7 counts `unwatchedWinPaths` — cards saying "you win the game", whose condition is the
part not modelled. The number is computed and nothing shows it. **The report should say
it, and the Deck Lab should refuse to rank a list where it is high**, rather than quietly
scoring a combo deck as a pile of creatures. Cost: small (it is a rendering change plus
one guard). This is the highest-value honesty fix left.

### 5. Bound the service worker's cache list

`crankmagic-sw.js` names every asset with a `?v=`, and the count has grown to 108. Every
version bump rewrites the file and invalidates the whole cache. **Split the manifest**:
the shell (HTML, CSS, the app modules) from the data files, so a data refresh does not
evict the shell. Cost: medium. Symptom today is a slow first load after any change.

### 6. Give `data/` a size budget

`graph.json` is 7.1 MB and is fetched in full before the Discover graph can rank
anything — which is why the Deck Lab's refine pass had to learn to wait for it. **Split
it**: the relation fields the graph actually walks, and the rest. Cost: medium to large,
and it needs a generator change. Worth doing before the corpus grows again.

### 7. Retire the second app

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
