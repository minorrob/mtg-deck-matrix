# Session D2 · Play views and Coach

Repo minorrob/mtg-deck-matrix. Branch `claude/r4-d2-views` from `integration/r4` after D1 has merged. PR against `integration/r4`; do not merge.

Read first: `00-task-list.md`, `01-unified-change-set.md` §0–§2 and §3.6, `AGENTS.md`, `docs/ACTIVE.md`, Design System READMEs `SeatHeader`, `Drawer`, `AccountMenu`, `DecisionSlot`. Audit: walkthrough pages P45, P49, P53–P56; findings F-090, F-093, F-098…F-104, F-112, F-120, F-121; remediations R-28, R-30, R-31. Frames: W11, W12 (r2). Note: production's Coach header is one 49px line; the banner Rob measured is `main`'s.

## Scope

CH-50 … CH-53. Files: `crankmagic-board.js` Table-view and Focus-view rendering, the Coach section, the avatar menu; `crankmagic-coach.js`; their CSS. Not: the shell (D1), the desk (A), combat (B), card clicks (C).

## Change

1. **CH-50 Table view.** A pending choice opens the Actions drawer or, folded, shows in the DecisionSlot (D1's); hand thumbnails ≥110px tall at 1440 (the slider's floor); the hand legend labeled once ("castable now / in hand") with a tooltip per count; the life dial gains seat labels under the totals, an aether glow on the active seat's half, and "Priority: you" under the mark (the top bar keeps the same facts). Seat headers are D1's SeatHeader.
2. **CH-51 Focus view.** An "Other seats" strip above the focused seat: one `cm-seat--stack` row per other seat (name, life ☠ poison, permanents count, hand count, Focus button; the active-turn seat highlighted; never a hand); a double click on a row focuses it (C's RQ-02); the header gains "All seats" (back to Table view) and previous/next seat; "n mana open · land drop used/available" moves into the seat header at `hud-caption`.
3. **CH-52 Coach (W11, W12 r2).** In the right drawer as a `cm-disclosure` section: a one-line 36px header "CrankMagic Coach" in the `cm-section-title` style, no subtext, `clamp()` with container units and `nowrap` so it shrinks on a narrow pane (ellipsis only under the floor), with … and ✕ at 28px; the conversation; a "Questions to Ask ▴" line, 22px tall, 13px, where "Explain the stack" sits today, `aria-expanded`, opening upward as an overlay over the conversation (30px rows, 12px minimum) so the input never moves; click again collapses. When the Coach backend is not enabled for this table, the section says "The Coach isn't at this table yet. Rules help and bound keys are under Help." with a Help link and no textarea (R-28).
4. **CH-53 Account menu on the board.** The board's avatar menu becomes the DS AccountMenu (You / This device / Your data / Skin / Help / Careful / Sign out); "Settings" is the one label (the "Profile" pill and "Account & app settings" go); the Careful group opens a confirm.

## Acceptance

- Table view with a pending choice: the drawer is open or the slot carries the decision; hand thumbnails ≥110px; legend header text present; dial shows seat labels and the priority line.
- Focus view with two seats: the other seat's life and hand count visible without any menu; "All seats" returns to Table view; prev/next cycle.
- Coach header computed height 36px at a 320px pane and one line at 240px; chips absent; "Questions to Ask" toggles `aria-expanded` and the input's bounding box does not move when it opens; with the Coach off, no textarea.
- Avatar menu: groups and labels per the DS README; "Settings" appears once.
- Full, Table, Focus and phone; 1440/390; three themes.

Test: `tests/table-board.mjs` Table/Focus cases, `tests/crankmagic-coach.mjs` (header, questions, stub), menu snapshot; breaks scripts; `tools/local-ci.sh`; one green Actions run. PR title `r4 D2: Table and Focus views, Coach section, account menu`. Stop.
