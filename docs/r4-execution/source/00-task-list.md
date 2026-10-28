# CrankMagic r4 execution: task list

**Date:** 2026-10-26. Ten Claude Code sessions: one gate, eight builders (up to six in parallel), one merge. Each session gets its packet (`S0-…md` … `M-…md`) plus `01-unified-change-set.md`. Branch names are `claude/r4-<code>`; every builder opens its PR against `integration/r4` and stops. Only M merges.

## Order

```
S0  land r4 tokens/type/skins ──► integration/r4 created
                                  │
        ┌─────────────────────────┼──────────────────────────────────┐
        ▼                         ▼                                  ▼
   E  engine (first PR in)   D1 play shell: Study, drawers,      F1 workshop deck journey
        │                        DecisionSlot, SeatHeader, HUD,  F2 workshop acquire→results→settings→admin
        │                        Table menu                       (fully parallel with everything)
        │                         │
        │        ┌────────────────┼────────────────┐
        ▼        ▼                ▼                ▼
       A desk & decisions    B combat         C board display & input      D2 views & Coach
                                  │
                                  ▼
                       M  consolidate · merge · CI · staging
```

- **Series:** S0 before everything. D1 before A, B, C, D2 (they all edit `crankmagic-board.js`; D1 restructures the layout they sit in). E's PR merges into `integration/r4` before A and C finish, because A needs CH-56's option fields and C needs CH-57/58's undo and untap actions; until then A and C build against the field contracts written in their packets and keep a fixture.
- **Parallel:** E, D1, F1, F2 start the moment S0 merges (four sessions). A, B, C, D2 start when D1 merges (four more; F1/F2 may still be running, so up to six at once).
- **M** starts when the last PR is open.

## The sessions, shorthand

| Code | Session | Ships (shorthand) | Files it owns | Starts after |
|---|---|---|---|---|
| **S0** | Tokens, type, skins | r4 landed: Sapphire & Obsidian + two skins, six themes, Cinzel/Lato, wordmark untouched, old palettes gone, design-tokens + type-final green, `integration/r4` created | `crankmagic-design.css`, `assets/crankmagic/*` fonts, `crankmagic-sw.js`, `tests/design-tokens.mjs`, `tests/type-final.mjs`, `pr/apply-r4.mjs`, `docs/design/2026-10-25-redesign-r4/` | – |
| **E** | Engine | Prepared copy fix; option fields (effect, controller, affected, optional); undo window house rule + untap-on-undo; untap a just-tapped land; game-over record; block refusal reasons | `game/**`, `cloud/game-room.mjs`, engine tests | S0 |
| **D1** | Play shell | Study table; left/right drawers with tabs and bottom sheet; DecisionSlot (decision never hidden); one SeatHeader with portraits; HUD scale; Table menu with Concede/Leave/End; shell inert; callouts | `crankmagic-board.js` (layout, drawers, seats, HUD, menu), `crankmagic-stage.css`, `crankmagic-table.js` | S0 |
| **F1** | Workshop, deck journey | Landing one door; DeckTile + StageChips hub; stage truth; Define validation under the field; Cinzel deck title + Tabs; Measure → Explore door | `index.html` landing, `crankmagic.css`, `crankmagic-lab.js`, deck/explore/measure modules | S0 |
| **F2** | Workshop, own → play home → settings → admin | One to-buy number; Share dialog (P0); Lock feedback; pull sheet confirm + box-done; New table validation; lobby hierarchy; results panel + Log a game + replacement handoff; Settings per DS; Admin v1; tours door | library/acquire/box modules, play home/lobby, log-a-game, settings, admin | S0 |
| **A** | Play desk & decisions | DS decision block; W01 one-target question (verb = confirm, Change target, Cancel, Don't [verb]); W02–W04 many targets; W15 grouped targets; single-action primary; RQ-12 way back on every desk screen | `crankmagic-board.js` decision/desk functions only | D1 (E for fields) |
| **B** | Play combat | Strip "Combat · blocks" with tiles, states, one scrolling row, "+N more", Send blockers primary; per-attacker desk with P/T tiles, Don't block / Confirm; twins by corner mark; attack way back | `crankmagic-board.js` combat functions only, combat CSS | D1 |
| **C** | Play board display & input | D5 click map (double-click activates, untap-again, focus on empty area); Undo hover drawer; identical lands stacked with count drawer and 30° tilt; divider line; Camera menu per DS + Spacing slider; focus affordances ≥32px | `crankmagic-board.js` table/card/camera functions, `crankmagic-table.js`, stage CSS | D1 (E for undo) |
| **D2** | Play views & Coach | Table view (pending choice, legible hand, dial labels); Focus view (Other seats strip, All seats, status line); Coach one-line header + Questions to Ask; AccountMenu on the board | `crankmagic-board.js` view/coach functions, `crankmagic-coach.js` | D1 |
| **M** | Consolidate, merge, staging | Merge all PRs into `integration/r4` in order, resolve `crankmagic-board.js` conflicts, full CI, UAT journeys at 1440/390 in three skins, merge to `main`, push to staging, write the ACTIVE.md note and the changelog | everything, read-mostly | all PRs open |

## Change IDs per session (from `01-unified-change-set.md`)

| Session | CH rows |
|---|---|
| S0 | CH-01, CH-02, CH-03, CH-04 |
| E | CH-55, CH-56, CH-57, CH-58, CH-59, CH-60 |
| D1 | CH-40, CH-41, CH-42, CH-43, CH-44, CH-45, CH-46, CH-47, CH-48 |
| F1 | CH-70, CH-71, CH-72, CH-73, CH-74, CH-75, CH-76 |
| F2 | CH-80, CH-81, CH-82, CH-83, CH-84, CH-85, CH-86, CH-87, CH-88, CH-89 |
| A | CH-10, CH-11, CH-12, CH-13, CH-14, CH-15, CH-16, CH-17 |
| B | CH-20, CH-21, CH-22, CH-23, CH-24, CH-25 |
| C | CH-30, CH-31, CH-32, CH-33, CH-34, CH-35, CH-36 |
| D2 | CH-50, CH-51, CH-52, CH-53 |
| M | none of its own; verifies all |

## Shared rules for every builder session

1. Read, in this order: this file, `01-unified-change-set.md` sections 0–2, your packet, `AGENTS.md`, `docs/ACTIVE.md`, then `docs/design/2026-10-25-redesign-r4/project/readme.md` and the component READMEs you touch (`project/components/<Name>/README.md`, same text as the Design System artifact).
2. Branch `claude/r4-<code>` from `integration/r4` (never from `main` after S0). Rebase on `integration/r4` before opening the PR.
3. Scope fence: touch only the files and functions your packet names. In `crankmagic-board.js`, edit only the functions listed; never reformat, reorder or rename outside them (M has to merge four branches of that file).
4. Red-first tests, `docs/ACTIVE.md` note under your session code, `tools/local-ci.sh`, one green Actions run. Verify at 1440 and 390, in `dark`, `light` and one Bronze or Chalk theme, with Load Live. Every board change: Full, Table, Focus and the phone layout.
5. An engine need goes to the Requests table in `docs/ACTIVE.md` with your session code; do not edit `game/` or `cloud/`.
6. Frames: the walkthrough's W01–W18 (r2) are the layouts; their element IDs (`desk-target-1-C02` …) are the names to use in tests and PR text. Where a frame and the Design System disagree, section 2 of the change set says which wins.
7. RQ-12 is a standing acceptance check on every screen you ship: name the way back in the PR.
8. Open the PR against `integration/r4` with the title `r4 <code>: <shorthand>`, list the CH IDs closed, the element IDs touched, and anything left for M. Do not merge. Stop.
