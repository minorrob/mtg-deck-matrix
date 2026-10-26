# Session D1 · Play shell: Study, drawers, DecisionSlot, SeatHeader, HUD, Table menu

Repo minorrob/mtg-deck-matrix. Branch `claude/r4-d1-play-shell` from `integration/r4`. PR against `integration/r4`; do not merge. Starts when S0 has merged. A, B, C and D2 wait for this PR, so it lands before them: keep it to the shell.

Read first: `00-task-list.md`, `01-unified-change-set.md` §0–§2 and §3.5, `AGENTS.md`, `docs/ACTIVE.md`, the Design System READMEs for `Study`, `Drawer`, `DecisionSlot`, `SeatHeader`, `HudScale`, `NeonCallout`, `Button` (`docs/design/2026-10-25-redesign-r4/project/components/…`), `project/guidelines/play-surfaces.html`, the reference image `project/reference/concept-b-table-companion.webp`, `docs/play-overhaul/REQUIREMENTS.md` (R35 stable ids T01–T21, M01–M04, D01, H01, C01). Audit context: walkthrough pages P41–P49, P53–P56 and findings F-082…F-087, F-091, F-098, F-100, F-101, F-119, F-122, F-123; frame W13 r2.

## Scope

CH-40 … CH-48. Files: `crankmagic-board.js` (layout root, drawer/module rendering, seat headers, top bar, HUD, avatar/table menus, DecisionSlot), `crankmagic-stage.css`, `crankmagic-table.js` (seat placement on the Study). Do not touch the decision desk body (`decision()`, `deskCard()`, `blockDraft()`, `combatStrip()`, `commitReview()`, `card()`, the camera menu internals, the Coach body): A, B, C and D2 own those. Keep the R35 stable ids.

## Change

1. **CH-40 Study.** `cm-study` on the board root in every view: `table-wood` + `table-grain`, `table-light` over the middle, `table-shade` at the edges; `cm-mat` per seat with `table-felt` and nap, inset edge, soft drop. A chosen playmat replaces the Study (Camera › Table design keeps working). The selected seat / target takes the white ring and check (`is-selected`, `cm-mat__check`).
2. **CH-41 Drawers.** Left drawer = Actions (the decision, then Boards as `cm-disclosure`); right drawer = Stack, History, Coach as disclosures. Each drawer has the 32px spine tab with the chevron in a 48px cell (`aria-expanded`, `aria-controls`); folded, the panel goes and the tab stays at the screen edge with the drawer's name in `cm-section-title` and a count (stack size; pending choice). Bottom sheet on the phone layout with the same tab. Module headers toggle their disclosure on click, Enter and Space (RQ-03.5), 28px tall with 22px buttons (W13 r2); a press that moves >4px is a drag. Remove the six-dot handle from every header; ↑ ↓ in edit mode stay (D11). #886's height grips and the desk-card grip stay. "Actions" appears exactly once (the tab); the top-right toggle button is the drawer chevron. Existing drawer-width grips keep their wording pattern "<what>: drag, or use the arrow keys".
3. **CH-42 DecisionSlot.** Top center in every view, under the phase strip, sized × `--hud-scale`: when the Actions drawer is folded, the current decision renders there (the question, one help line, the choices as secondary buttons, the chosen one inverted, one accent primary, the way back). When the drawer is open the slot shows the phase strip and the step controls only. "Actions · choice pending" and "Your choice is waiting. Expand Actions to continue." are retired. The tab keeps a pulse while a choice is pending (D8).
4. **CH-43 SeatHeader.** One component for 3D, Table and Focus: portrait (commander art in a `table-brass` ring; initial disc without art), name, commander, life at `hud-vital`, poison, hand count, state word (Your turn, Deciding, Waiting); turn = aether ring on the portrait; priority = aether dot on the state chip; low life turns the figure `vital-danger` and keeps the word "life". `cm-seat--stack` for the corners. DOM order identical across views (snapshot test). Opponent hands are counts only.
5. **CH-44 HudScale.** `--hud-scale` on the board root (1, 1.25, 1.5, 2) from the Camera menu segmented control and Settings, stored with the account; every HUD size is a token × scale; at 200% the top bar stays on one line at 1440.
6. **CH-45 Table menu.** A "Table" button beside Camera: Concede (two-step), Leave table (keeps the seat for the reconnect grace, returns to Play home), End game for everyone (host, two-step, "keeps the record"), Table rules, Help (bound keys). Escape order (C-A7): an open menu/dialog closes → a focused opponent board returns to your own → the Table menu opens. While `#table` is open the app shell (sidebar nav, legal footer) is `inert` + `aria-hidden`; Tab order starts at the top bar and ends at the hand. Edge toggles get visible tooltips and a 32×48 hit area until the tabs replace them.
7. **CH-46 Opening hand in the slot.** Keep (primary) / Mulligan (way back) in the DecisionSlot; Pass never renders disabled in the center.
8. **CH-47 Callouts.** `NeonCallout` for your turn, an attack on you, a big swing, via `callout-*`; one at a time, 1–2 s; reduced motion shows it without the glow. The lobby countdown dims the table, shows a 72px figure and plays the existing sound (lobby file is F2's: expose the callout as a shared helper and note the hook for F2).
9. **CH-48 Top bar.** Turn number and priority at `hud`; phase strip at `hud-caption` with the current step inverted to ink; own life moves to the seat header (no 12px vitals left).

Do not: build the decision body, combat, card interactions, the camera menu's internals, the Coach, or Table/Focus view specifics (D2).

## Acceptance

- Board root has `cm-study`; each seat has `cm-mat`; the selected target shows the white ring and check.
- Folding the left drawer moves the pending decision into `#cm-decision-slot` with its primary and way back; no text "choice pending" remains; the tab shows "ACTIONS · 1".
- Module header click/Enter/Space toggles `aria-expanded`; no `.cm-module-drag` element exists.
- Seat header DOM order identical across the three views; own life computed ≥ 28px at scale 1; no board text under 15px at scale 1.
- "Table" menu: Concede requires two clicks and fires the table-lifecycle concede; Leave returns to `#game` with the seat retained; End game is host-only; `document.querySelector('.cm-sidebar').inert === true` with a table open.
- Escape order test: menu open → closes; opponent focused → returns; otherwise → Table menu.
- RQ-12: Mulligan is the way back on the opening hand.

Test: `tests/table-board.mjs` (layout, slot, seat header snapshot, menu, inert), `tests/play-settings.mjs` (HUD scale), `tests/table-lifecycle` contract (concede, leave, end); breaks scripts. 1440 and 390, Full/Table/Focus/phone, three themes. PR title `r4 D1: Study, drawers, DecisionSlot, SeatHeader, HUD scale, Table menu`. List the functions you changed so A/B/C/D2 can avoid them. Stop.
