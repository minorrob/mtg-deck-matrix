# Codex · Play: the instruction set

*Platform: Codex Astra, session 1. Linear label `Codex · Play`. Feed `docs/readout/feeds/codex-play.json`. Branches
`codex/play-<topic>`. Project: Play, an exceptional Commander game at the table (P-ROB-1), milestones M1 to M6, plus
ROB-56 (the coach drawer, under AI) and ROB-124 (play preferences, under Tailored). The charter is
`docs/program/README.md`; the handoff of October 18 is `docs/HANDOFF-TO-CODEX-2026-10-18.md`.*

## 1. What this lane is for

Rob's outcome 2: "The game in Play is an exceptional play experience for MtG Commander." The board, the table's
lobby, the three desktop views and the fixed Focused phone view, the 3D cards and table, the atmosphere (environment,
light, music), the decisions as the player sees them, and every control the player touches. The engine stays
authoritative: nothing you draw changes a legal action; a prototype's card movement never becomes a game action
without the room's say.

## 2. Read first, in this order

1. `AGENTS.md`. 2. `docs/ACTIVE.md`, the top and the lanes table. 3. `docs/HANDOFF-TO-CODEX-2026-10-18.md`.
4. `docs/program/README.md`. 5. This file. 6. `docs/readout/README.md`.
7. Your standing instructions, in their own precedence: `docs/ui-lane/astra/README.md` §2 (the precedence list),
   `docs/play-overhaul/INSTRUCTIONS.md` and `REQUIREMENTS.md`, `docs/play-overhaul/PLAY-REVIEW-2026-10-17.md` (the
   twelve findings and the milestone map), `docs/ui-lane/gameplay-anchor.md` (the view contract).
8. `ui-prototypes/babylon/README.md` (the lab, the seven table designs, the checks).

## 3. Your files

The Play row of the charter's table (§3). Two rules worth repeating: Settings' Play card lives in
`crankmagic-settings.js`, the Workshop's file, until your first PR moves it to `crankmagic-settings-play.js` (do this
first; it is small and ends a shared file); the board's styles live in `crankmagic-stage.css`, `crankmagic-mats.css`
and `crankmagic-online.css`, and the 455 board rules still in `crankmagic.css` move to a `crankmagic-play.css` of
yours when you next touch them in bulk (tell the Workshop in the Requests table the day you do; the pins cascade
covers both).

## 4. The order of work

| Order | Issue | Why now |
| --- | --- | --- |
| 0 | Move Settings' Play card to its own file | Ends the one shared file between you and the Workshop |
| 1 | ROB-99 slice 1: one header and Camera in every view, Tilt only in Full | M1; everything else lives in it |
| 2 | ROB-98, ROB-97 | Two small Full and Table fixes from the October 17 review |
| 3 | ROB-18 the fixed Focused phone view; ROB-20, ROB-22 | M1's rest |
| 4 | ROB-52 and ROB-100's last step: the Babylon renderer on the live board, the table design the player chose | M4 begins once slice 1 is on main |
| 5 | ROB-32, ROB-33, ROB-34, ROB-42, ROB-30 | M2: from invitation to a seat |
| 6 | ROB-23, ROB-24, ROB-28, ROB-29 (engine contracts already merged) | M3's unblocked half |
| 7 | ROB-25, ROB-26, ROB-49, ROB-50, ROB-53 as their contracts merge | M3's blocked half |
| 8 | ROB-21, ROB-60, ROB-59 (after Rob's go on the subscriptions), ROB-51, ROB-57, ROB-43 | M4 |
| 9 | ROB-31, ROB-48, ROB-45, ROB-46, ROB-47, ROB-56, ROB-63, ROB-54 (after the chat contract) | M5 |
| 10 | ROB-62, ROB-66, ROB-124, ROB-139 (after Rob names the game) | |

## 5. Seams

- **The engine** owns the room's view; ask in the Requests table of `docs/ACTIVE.md` and a Shared contract issue in
  ROB-11; build against `main` once merged. Pending today: ROB-74, ROB-75, ROB-76, ROB-77, ROB-78, the chat contract.
- **The Workshop** owns the app shell, header styles and tokens (`crankmagic.css`, `crankmagic-design.css`), Settings
  and accounts. A token or shell change you need is a request; the Workshop's first-time journey (ROB-135) needs
  your table step.
- **Deck intelligence** supplies the coaching service behind your drawer (ROB-129) and the legality function for the
  lobby (ROB-104).
- **Grok** proves around you: test cases (ROB-27), benchmarks (ROB-67). Write the task when you need one.

## 6. Decide, or surface

Decide: layout and motion inside Rob's dated decisions (the horizon, the ribbon, the views, sliders never steps),
the renderer's internals, performance work, accessibility, copy, which small fix goes first. Surface to Rob first:
a new view or a removed one, a navigation change, a changed default he set (tilt 40°, Zoom range, the fixed Focused
phone view, medieval-banded as the default table), spending credits (Runway, Higgsfield, Magic Patterns), anything
that makes a decision for the player, and the game's name's application once chosen.

## 7. Done, and proof

Done when: merged on a green run; the browser suites that drive your files green with `GEOMETRY_REQUIRED=1`; a
breaks file per change (`game/tools/batch/breaks-<topic>.py`, `missed: []`); screenshots at 1280x720 and 390x844
with stable IDs on the issue; the asset pins bumped and recorded; the evidence on the issue; released to staging by
the engine lane on request in ROB-11. Proof before a push: `tests/table-board.mjs`, `tests/a11y-board.mjs`,
`tests/settings-r3.mjs` and the others your change touches; `tests/asset-versions.mjs --update` after the cascade;
`tests/feature-wiring.mjs`; `tools/local-ci.sh <head> 0`. What a cloud container cannot prove (a real phone, WebGL on
real hardware) is marked unproven in those words.

## 8. The readout

At every merge: Linear status and a proof comment; `docs/readout/feeds/codex-play.json`; `node tests/readout-feeds.mjs`;
one paragraph in your `docs/ACTIVE.md` section. Your feed was seeded on October 18 with first estimates; correct them
at your first merge.

## 9. Tools and habits for this lane

- `AGENTS.md` is read natively; the precedence in `docs/ui-lane/astra/README.md` §2 settles conflicts.
- Playwright 1.56 with Chromium for every browser claim; `tools/play-tabletop-preview.mjs` for recorded views;
  `tools/board-fixture.mjs` for a crowded board.
- The Linear connector for every status; draft PRs on GitHub; your review command before marking ready.
- Keep each PR a day or less; a slice, not a wave. The broad draft (PR #735) is a quarry, never a merge.
