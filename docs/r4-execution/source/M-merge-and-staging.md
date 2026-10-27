# Session M · Consolidate, merge, CI, staging

Repo minorrob/mtg-deck-matrix. Works on `integration/r4`. Starts when the last builder PR (E, D1, F1, F2, A, B, C, D2) is open against `integration/r4`. This session is the only one that merges.

Read first: `00-task-list.md`, `01-unified-change-set.md` (all), `AGENTS.md`, `docs/ACTIVE.md` (every builder's note and the Requests table), each PR's description (CH IDs closed, functions touched, items left for M), and the Design System README `docs/design/2026-10-25-redesign-r4/project/readme.md`.

## Order of merge into `integration/r4`

1. E (engine fields and actions; everything downstream reads them).
2. D1 (board shell).
3. F1, F2 (no board files; merge in either order).
4. A, then B, then C, then D2 (all touch `crankmagic-board.js`; merge in this order and resolve each conflict before the next). Rebase each builder branch on the current `integration/r4` before merging; where a builder reformatted outside its functions, restore the surrounding code to the integration version and keep only the named functions' changes.

After each merge: `tools/local-ci.sh`; fix only merge fallout (a missing field rename, a duplicated helper, a CSS cascade order). Anything that is a builder's bug goes back to that builder's branch as a follow-up PR with the failing test, not fixed silently here.

## Consolidation checks (all must pass on `integration/r4`)

- **Tokens and type:** `tests/design-tokens.mjs` (194 + S0's additions) and `tests/type-final.mjs` green; no Satoshi / Young Serif / old palette reference in any shipped file; the wordmark element unchanged (snapshot from S0); no computed font-size under 12px anywhere, under 15px × scale on the board.
- **One primary per screen:** a sweep over the UAT journeys asserts at most one `.cm-btn--primary` / `.v-button.primary` per rendered screen state (board during blocks: Send blockers only; the decision desk: the verb button only).
- **RQ-12 sweep:** for every decision screen in the fixture games (ways, targets, costs, question, blocks, attacks, keep/mulligan) the rendered `cm-decide-actions` has a visible way back, and Escape triggers it; after a binding press the Undo drawer appears while the engine's window holds and not after.
- **Decision never hidden:** folding the Actions drawer in each view moves the decision to the slot (D1) and A/B's desks render there too.
- **Click map:** C's tests plus a cross-check that A's desk and B's tiles never consume the single click (the card menu still opens).
- **Privacy suite** green; hidden information checks on blocks, undo and focus.
- **UAT journeys** (`tests/uat/crankmagic-journeys.mjs`, extended): Landing › Decks › Create › Build › Generate › Measure › Explore › Acquire › Box › Share › Play lobby › 3D › Table › Focus › results › Log a game, at 1440 and 390, in `dark`, `light`, `bronze-dark`, screenshots saved per step; compare against the walkthrough frames W01–W18 by their element IDs (`data-wf`).
- **Accessibility:** focus ring visible on every focusable element; shell inert under the board; no footer link in the board's tab sequence; contrast per the DS table in every theme.
- **Reduced motion:** no slide, no tilt transition, no glow animation; callouts static.

## Merge to main and staging

1. One green Actions run on `integration/r4`.
2. Merge `integration/r4` into `main` with a merge commit titled `r4: Sapphire & Obsidian, Cinzel/Lato, the Study and drawers, decision desk, combat, board input, workshop refinements`; the body lists every CH ID shipped, grouped by session, and the CH IDs deferred with the reason.
3. Deploy to staging by the repo's documented staging procedure (AGENTS.md / docs/ACTIVE.md name it; do not invent one). Smoke the UAT journey on staging with Load Live at 1440 and 390 in three themes; verify `/api/me` and the service worker version bump (fonts precached, no stale palette CSS).
4. Write the `docs/ACTIVE.md` note: what shipped, what is deferred, the two queued items this program touched (the mana-payment panel and the Hand / Board / Other grouping now inherit RQ-12), and the house-rules keys reserved (`houseRules.undoLastPlay`, camera spacing).
5. Update the walkthrough's record: list in the PR body which findings F-001…F-129 are resolved by which CH, which remain open, and which frames W01–W18 the staging screenshots match or depart from (so the next audit starts from facts).
6. Report back: the merge commit, the staging URL, the deferred list, and anything a builder left for Rob to decide.

Do not: add features; restyle; change copy beyond merge fallout; merge a builder PR whose CI is red; push to production.
