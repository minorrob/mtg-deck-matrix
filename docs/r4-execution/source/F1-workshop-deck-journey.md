# Session F1 · Workshop, the deck journey (S0 Landing → S8 Measure again)

Repo minorrob/mtg-deck-matrix. Branch `claude/r4-f1-deck-journey` from `integration/r4`. PR against `integration/r4`; do not merge. Starts when S0 has merged; fully parallel with everything else (no Play files).

Read first: `00-task-list.md`, `01-unified-change-set.md` §0–§2 and §3.8, §4, `AGENTS.md`, `docs/ACTIVE.md`, Design System READMEs `Button`, `DeckTile`, `StageChips`, `Tabs`, `FormControls`, `Toast`, `Dialog`, `StatusChip`, and `project/frames/decks-hub.html`, `deck-overview.html`, `deck-hundred.html` in the r4 folder. Audit: walkthrough pages P01–P24 and remediations R-01, R-04, R-08, R-09, R-10, R-13, R-15, R-16 (each has a full PR prompt with element IDs; this packet overrides their branch names and the merge rule).

## Scope

CH-70 … CH-76. Files: the landing in `index.html`, `crankmagic.css`, the Decks hub, New deck chooser and Lab (`crankmagic-lab.js`), the deck page tabs (Overview, The hundred, Upgrades, Explore), the Measure report. Not: Acquire, Library, box, Play, Settings (F2).

## Change

1. **CH-70 Landing (R-01).** One sapphire primary in the hero ("Start my deck"); the four import links become one quiet "Other ways to start" that opens the New deck chooser (same dialog as Decks › New deck); doors keep the verb only; "Decks" / "Open my decks" everywhere; the "new version ready" toast per DS Toast (dismiss, deferred to the next navigation); footer links at `small` 13px; `h1`/hero in Cinzel, no other Cinzel on the page; the wordmark untouched.
2. **CH-71 Decks hub (R-04, R-08).** DeckTile per DS (art full bleed under the poster gradient, eyebrow "D6 · Krenko", Cinzel-free tile name in Lato 700, up to three tags, the status bar, bracket, stage chip, identity pips, compact "Play it"; the New deck tile dashed); StageChips (All, Boxed, Defined, Building, Playable, Shared with counts; selection inverts to ink; scrolls sideways on phones); the grid count is live after a create; Start-from "Next" hands off to the Lab with a toast naming the deck.
3. **CH-72 Stage truth (R-09, R-10).** A deck is "Playable at the table" only when its rung counts say so; the stage chip takes the family of what the deck still needs; a one-card deck reads Building.
4. **CH-73 Define the Deck validation (R-13, P1).** Errors under the field with the alert glyph in `color-required`, the field edge turning `color-required`; never a dot on a tab; the Next band says why it is disabled ("Name the deck · 1 field left"); keyboard focus moves to the first error on Next.
5. **CH-74 Deck page (R-15).** Cinzel deck title (the only Cinzel on the page) with the eyebrow "D6 · Krenko"; Tabs per DS (44px, ink bar, counts in muted pills, no accent); one primary per tab; the Next band and the header agree: "24 cards unplayable" wins over "Lock" until it is fixed.
6. **CH-75 Measure → refinement (R-16, P1).** The report ends with "Fix in Explore" opening Explore with the weakest axis preselected and the report's score pinned in the header; "Measure again" stays beside it.
7. **CH-76 Explore and graph.** Aether only for the graph and focus rings; selection inverts to ink; no accent as a state; TableRow for list rows (48px, trailing verb, overflow) where the hundred lists cards.

Every screen: three planes, 1px lines, 12/16px corners, focus rings, sentence case, verbs with counts, American English; mana tints at 22% only on deck surfaces.

## Acceptance

- Landing: exactly one `.cm-btn--primary` above the fold at 1440 and 390; "Other ways to start" opens `cm-new-deck-dialog`; computed `h1` font-family Cinzel; the wordmark element unchanged (snapshot).
- Hub: tiles carry art and the bar; StageChips selected chip has `aria-pressed="true"` and ink inversion; creating a deck increments the count without reload.
- Define: submitting with an empty name renders the error under the field and moves focus to it; no tab dot.
- Deck page: Tabs have no accent color; the Next band text equals the header's state.
- Measure: "Fix in Explore" lands on Explore with the axis preselected.
- All in three themes at 1440 and 390.

Test: the existing suites per R-01/R-04/R-08/R-09/R-10/R-13/R-15/R-16 prompts (`tests/landing.mjs`, decks/lab/deck-page/measure suites), extended; `tests/type-final.mjs` for Cinzel placement; breaks scripts; `tools/local-ci.sh`; one green Actions run. PR title `r4 F1: landing, hub, stage truth, define validation, deck page, measure door`. Stop.
