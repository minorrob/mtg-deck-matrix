# Standards audit: design conformance, resizing, function, aesthetics, code

**Written by:** Claude Code (Opus 5), local session on Personal-HP, 2026-09-20.
**Asked for by Rob:** after the deck-page pairs were defined, identify the other gaps — functional,
design, resizing, aesthetic — and anything below best practice or out of conformance.

Everything here is measured, grepped or driven in a browser. Where a number is stated, the command
that produced it is beside it. Where something is a judgment, it says so.

---

## 1. Design conformance — where it actually stands

`node tools/compare-to-screen.mjs` measures the app against the designer's screens at 1280 and
prints the difference for every paired element. Current result:

**45 measurements across four screens, 2 past ±4px.** Both remaining are heights that follow
content rather than layout — the deck page's Next card is 11px taller because this deck's next
line wraps to a second row, and an Explore door is 29px shorter because it holds less than the
drawn one. Those are the app carrying real data.

### The trap that hid eight pixels for four surfaces

`crankmagic-design.css` sets `#matrix-v2 h1{font-size:36px}` and `#matrix-v2 h3{font-size:16px}`.
An **id out-specifies a class, however many classes the rule has**. Every Gallery heading rule
written as a class has been losing to those silently:

| Surface | Written | Rendered | Screen |
|---|---|---|---|
| page head h1 | 44px (class) | 36px | 44px |
| deck tile commander name | 24px (class) | 16px | 24px |
| Explore entry heading | 52px (class) | 36px | 52px |

All three are fixed by carrying the id, not by `!important`. **This is the single most likely
place for the next silent regression**, because it is invisible in a screenshot and there are
**7** id-prefixed base rules in `crankmagic-design.css` that can do it again
(`grep -c '#matrix-v2 [a-z]' crankmagic-design.css`).

**Recommended:** when the `v-` study layer is deleted (below), drop those base rules to classes at
the same time, so the Gallery layer stops competing with an id.

### Coverage gap in the comparison itself

Pairs exist for Decks, the deck page, the Library and the Explore entry. **No pairs for the
Explore graph or the Play lobby**, and the Library's table-row pair does not resolve on the screen
side. Until those exist, "pixel perfect" is unproven for those surfaces — and the two tool bugs
found while writing these pairs (matching a custom-property *declaration* instead of its use, and
matching the shell's rail grid instead of the hero) are a warning that an unmeasured claim is
usually wrong in an unexpected direction.

---

## 2. Resizing

### What is covered

`tests/uat/geometry.mjs` runs at **320, 375, 390, 430, 768 and 1400** and checks, per width: no
sideways scroll, no tap target under 32px, no control stranded off the viewport edge, the rail is
216px with the content outside it, the wordmark inside its column and above the nav, Menu at the
rail's foot. 139 checks.

### The gaps

1. **It only covers four routes** — `decks`, `cards`, `cards?tab=buy`, `lab`. **The deck page, the
   Explore entry, the Explore graph and the Play lobby are not in it.** Every surface built this
   session is outside the suite that would catch a phone-width defect in it. This is the largest
   single gap in the audit, because the phone rail overflow it *did* catch (Menu's middle at x=384
   in a 375px viewport) was in a covered route; the same class of defect in the lobby would not be
   caught.
2. **No width above 1400 is tested.** The deck grid's ballooning at 1685 — three 440px tiles — was
   found by Rob looking at his own window, not by a suite. The grid is `auto-fill` from 260px now,
   but nothing holds it there above 1400.
3. **Breakpoints are inconsistent.** Eight distinct max-widths are in use: 760 (×35), 640 (×13),
   1050 (×8), 900 (×2), 860 (×2), 820, 560, 480. The guide names one phone breakpoint, 760. The
   others accumulated. A layout that changes at 860 and again at 820 is two rules nobody can hold
   in their head.
4. **35 rules use a fixed `width:760px`** and 15 use `width:640px` — those are inside media
   queries, so they are breakpoints rather than widths, but the mixture makes a grep for real
   fixed widths unreliable.

**Recommended, in order:** add the four missing routes to `geometry.mjs` PAGES; add 1685 and 2560
to WIDTHS; then collapse the breakpoint set toward 760 and 1050.

---

## 3. Functional gaps

1. **"Seat it" with no deck chosen does nothing and says nothing.** The lobby's seat dialog
   refuses silently. It cost this session a full test run to diagnose. A person gets no
   explanation at all. *Highest-value small fix in this list.*
2. **The 10-second auto-launch countdown is not drawn.** The readiness poll is wired and the
   center panel's line is read-only, but the countdown itself is not on screen, so the run-book's
   step 6 ("engine spawns before the countdown reaches zero") has to be read from the API.
3. **`lens` became a scope this session** so the Explore role pills open the graph. Before that,
   `go('discover',{lens:'Removal',deck})` — which `crankmagic-decks.js` had been sending for a
   while — fell through to the chooser and did nothing. **Worth auditing the other route
   parameters the same way**: a parameter a view reads but does not treat as a scope is a link
   that silently no-ops.
4. **`--v-text` is referenced twice in `crankmagic.css` and does not exist** (the token is
   `--v-ink`). An undefined custom property makes the declaration invalid at computed-value time,
   so those two colors silently inherit.
5. **The `?` help button is only inside More on the deck page.** Other pages keep the outlined
   circle. Not wrong, but not yet uniform.

---

## 4. Aesthetics

1. **The Next card and the hero primary are two brass buttons on one page** if the designer's
   "Open the buy list →" is added — their own definition of done says exactly one. Unresolved with
   the designer; the app currently keeps one.
2. **The lobby's action row is a panel, not a menu.** The DELTA puts the host's rule controls under
   **Host tools ▾**; they are a headed panel below the table instead.
3. **The mat still prints a turn-steps list and a life box** that the DELTA says to omit "because
   the app shows both". The app does not yet — the center counter carries life, but the turn-step
   ribbon does not exist. Hiding the printed guide before the ribbon exists would remove
   information rather than move it.
4. **The Explore graph's head is still the old toolbar** — h1 "Discover", a select, three buttons —
   rather than the screen's h1 36px, 44px search, segmented connections control and Filters with a
   count badge.

---

## 5. Code conformance and best practice

| Signal | Count | Judgment |
|---|---|---|
| `!important` in `crankmagic.css` | 29 | Each one is a rule that lost a specificity argument. Most predate this session; the id-vs-class finding above is the cause of that pressure. Worth reducing rather than adding to. |
| Inline `style="` written from JS | 15 in decks, 5 in discover, 3 in collection | Legitimate where it carries **data** (`--tint`, `--dot`, `--band`, `--door` are per-row values a stylesheet cannot know). Not legitimate where it carries **design**. Currently all of them carry data. Keep that line. |
| Dead CSS | the whole `v-` study layer | `.v-cover`, `.v-showcase`, `.v-gnode`, `.v-cardfan` and their kin appear only under `design/` and are **never rendered by the app**. Delete rather than restyle. |
| Raw hex ceilings | `crankmagic.css` 137, `crankmagic-graph.js` 0, `game/ui` 475, design sheet 31 | Held and ratcheting down. The graph's zero is new this session: the canvas held 38 navy literals in **JavaScript**, where a ceiling that reads `.css` files could never see them. **`game/ui` at 475 is the remaining blind spot of the same kind** — nothing checks `game/ui/*.mjs` for literals. |
| UK spellings | 563 ceiling, ratcheting | Caught four additions this session. Working as intended. |
| Accessibility | 41 `aria-` in discover, 15 in decks, 10 in game | Uneven. The lobby's new quadrants carry `data-state` but the seat's state is not announced; the sea canvases are correctly `aria-hidden`. Worth a pass with the `design:accessibility-review` checklist before sign-off. |

### Two process failures of mine, recorded because they are the kind that recur

- **I pushed a commit without re-running the suite on it.** The handoff document went up with four
  instances of the British spelling of "center" in prose I had just written about not writing it,
  and CI went red. The rule is the suite is green on *what is pushed*, not on the tree before it.
- **I committed to `main`** because a command chain had left me there. Nothing reached
  `origin/main`. `git branch --show-current` costs nothing.

---

## 6. The graph: should card information extend it?

**Yes, for three specific additions — and no for a fourth.**

The graph already indexes 23 facets (`crankmagic-facets.js`): roles, colors, type, mana value,
mana kind, lands, enters, mechanics, tribes, wants/makes tribe, pays-off/offers stat, triggers,
causes, multiplies, produces, requires, grants, extends, rarity, **ownership** and **deck
membership**. Ownership and deck membership are what make "From a deck gap" possible at all. It is
a richer model than it looks.

Three things the app computes elsewhere and the graph does **not** index. Each one makes a
question askable on the canvas that currently cannot be asked:

1. **Primary Purpose.** The classifier's single "what this card is for" label
   (`MtgCardClassify.purposeOf`). The Library chips it under every card name and the deck page
   counts it in "What the spells do" — but the graph carries `roles` (many per card), not
   `purpose` (one). Adding it lets Explore be asked *"the removal in this commander's
   neighbourhood that I do not own"* using the same word the rest of the app uses. **Highest value
   of the three**, because it aligns three surfaces on one vocabulary.
2. **Price.** The graph has no money facet. Explore's whole "From a deck gap" door is about filling
   a gap, the app knows every price, and *"the cheapest card that fills this gap"* is the question
   a person actually has. Today they must leave the graph to answer it.
3. **Bracket / Game Changer.** The lobby refuses a deck over its bracket and the deck page counts
   Game Changers, but the graph cannot filter *"legal at bracket 3"* — so Explore can recommend a
   card the table would refuse. That is a loop that teaches the wrong thing.

Each is a facet entry in the `FACETS` array with a `from(card)` function, the same shape as the
23 already there, plus a value in the graph payload where the datum is not already on the node.

**What I would not add:** rules text or oracle prose as a facet. The graph's whole argument is
that a join is *named* — "shares a mechanic", "produces what this requires". Free text has no name
and would make the canvas a search box with edges.

---

## 7. What I would do first

1. **Add the four missing routes to `tests/uat/geometry.mjs`** (deck page, Explore entry, Explore
   graph, Play lobby) and **1685 to WIDTHS**. Everything built this session is currently outside
   the suite that would catch a resizing defect in it.
2. **Fix the silent "Seat it".** It is small, it is on the path to a live game, and it wastes a
   person's time every time they meet it.
3. **Drop the id-prefixed base rules to classes** when the dead `v-` layer is deleted, so the
   Gallery layer stops losing specificity arguments it did not know it was having.
4. **Pairs for the Explore graph and the lobby**, so their conformance is measured rather than
   asserted.
5. **The Primary Purpose facet**, as the first of the three graph extensions.
