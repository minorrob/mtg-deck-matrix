# Handoff to Codex Astra, October 18, 2026: the Play boards return to you

*From the Claude cloud session (Fable 5.1) that held Codex's lane on October 17 per Rob's handoff
(`docs/HANDOFF-OPUS-2026-10-17.md` on `codex/handoff-opus-oct17`). Rob, October 18: "We are going to hand back to
Astra the UI work on the Play boards now." This states what every handoff states (`AGENTS.md`): the branch and
commit it describes, what is proven versus assumed, the command that proves each claim, and what is outstanding.*

## 1. The branch and commit

- Branch `claude/crankmagic-invitations-ob12tu`, draft PR #740 (https://github.com/minorrob/mtg-deck-matrix/pull/740),
  on top of `main` 20601740 (#746). Its head at this writing is the commit that carries this file; the PR body lists
  the contents. Merge it with a merge commit, or cherry-pick nothing: everything in it is yours to build on from
  `main` once merged.
- Codex's broad draft `codex/ui-playtest-plan-oct15` (PR #735) was **not touched**: it is still a quarry for ROB-99's
  three slices, never a wholesale merge.
- The engine lane's branch `claude/admiring-franklin-58cxy4` was not touched; coordination happened in ROB-11.

## 2. What was done in your lane, and the proof

| Done | Proof | Where recorded |
| --- | --- | --- |
| PR #737 (the Workers redirect fix) merged to `main` 1990ad1d on Rob's one-time exception for two pre-existing failures; staging release eed2f1a4 (Workers Builds version 4992a1e5), byte-identical | Actions run 39044154055; `/version.json` on staging read `1990ad1d…`; the deployed `play-worker.js` compared byte for byte with a dry-run build | ROB-10, ROB-72 (both closed by Rob), `docs/ACTIVE.md` UI section |
| Two live invitations proven end to end, the second to an address never admitted before: Access policy updated once each (audit log), Resend sent on the first attempt, sign-in by code, profile and screens reached | Aggregates and masked policy readback only; no address read | ROB-10 closed; `docs/ACTIVE.md` |
| The Play screens reviewed on `main` against the October decisions: twelve findings F01 to F12, the 55 ROB-14 children reorganized into milestones M1 to M6 with engine dependencies | `docs/play-overhaul/PLAY-REVIEW-2026-10-17.md`, `docs/play-overhaul/screenshots/review-1017-*.png` | ROB-97, ROB-98, ROB-99 filed |
| The Babylon lab ported unchanged from the draft, plus `ui-prototypes/babylon/tables.js`: seven table designs as real 3D objects (medieval banded oak, colonial inlaid mahogany, futuristic glass, tavern planks, card-room felt, stone dais, volcanic obsidian), chosen in the lab's Camera panel, remembered per device | `node ui-prototypes/babylon/table-design-checks.mjs`: 83 checks, with a mutation; shots `table-design-{desktop,phone}-<design>.png` | ROB-100 step 1 |
| The catalog on the live board: `CrankStage.appearances.tables` carries the seven designs, `CrankStage.tableDesign(id)` maps `wooden`, `stone`, `obsidian` onto their replacements, the 2D stage paints a flat fallback per design, the Camera menu's select is "Table design", Settings › Appearance has the same choice (`cm-stage-table`); default `medieval-banded` (Rob's decision) | `tests/table-tabletop.mjs` (seven options, `stone-dais` remembered, `stone` maps on, no choice means `medieval-banded`), `tests/settings-r3.mjs` 63, `tests/a11y-board.mjs` 288, `tests/asset-versions.mjs` 124 after the pins (stage 6, board 52, settings 13, service worker 482, app shell 498), `tools/local-ci.sh HEAD 0` exit 0; shots `table-design-stage-fallback-{medieval-banded,glass-future}.png` | ROB-100 step 2 comment |
| The Grok package (`docs/grok/WORK-PACKAGE-2026-10-17.md`, `ORCHESTRATOR-PROMPT-2026-10-17.md`): G1 and G2 withdrawn (landed on `main` by the engine lane's patch and PR #729), G3 and G4 remain, G6 added October 18 | | ROB-96 |
| The program reorganized around Rob's north star (October 18): Linear initiative I-1, eleven projects, milestones, the Lane label group renamed to the five workstreams, forty new issues; the charter, the readout, the instruction sets | `docs/program/README.md`, `docs/readout/`, `docs/program/KICKOFF-PROMPTS.md`; `node tests/readout-feeds.mjs` 941 checks | ROB-138, ROB-11 |

## 3. Assumed, not proved

- The lab's `interaction-checks.mjs` fails in this container at its two-finger pinch check on the untouched draft as
  well; environmental, noted on ROB-100. Not proven on real hardware.
- The table designs on real WebGL hardware (a phone, a discrete GPU): the container renders with software WebGL.
- No staging release of the step-2 commit: the engine lane runs the combined release of `main`; verify the table
  design chooser on staging after it (ROB-11 announces it).

## 4. Outstanding, in your lane, in order

1. **ROB-99 slice 1**: one header and Camera in every view, Tilt only in Full, ported from the draft onto `main`.
2. **ROB-98, ROB-97**: the lands row under the hand fan; the Board cards slider off the life dial.
3. **ROB-18**: the fixed Focused phone view.
4. **ROB-52 and ROB-100's last step**: the Babylon renderer on the live board, building the player's chosen table
   design from `CrankTables.build` (`ui-prototypes/babylon/tables.js`); host sync of the choice is ROB-51 (engine).
5. **Your first small PR**, before any of these: move Settings' Play card out of `crankmagic-settings.js` into
   `crankmagic-settings-play.js`, so you and the Workshop never edit one file.
6. The rest in `docs/program/workstreams/codex-play.md` §4.

Rob's decision pending for you: the game's name (ROB-139; recommendation on the issue).

## 5. What changed around you

Rob now runs five workstreams (`docs/program/README.md` §2). The UI lane you left is two lanes: **Codex · Play**
(you: the boards) and **Codex · Workshop** (Astra's second session: everything outside the boards, including
Settings, accounts, sharing). Claude's second session is **Claude · Deck intelligence** (the models under the
workshop's screens, and the readout). The file ownership table is `docs/program/README.md` §3; the seams §4;
decide-or-surface §5. Your feed on the readout is `docs/readout/feeds/codex-play.json`, seeded with first estimates;
correct it at your first merge (`docs/readout/README.md`).

## 6. Pitfalls met this week, so you do not meet them again

- `pkill -f` with an unanchored pattern killed the shell that ran it; anchor the pattern (`^node …`).
- The pins cascade: `tools/bump-pins.mjs` for stage, board, settings, then the service worker and the app shell,
  then `node tests/asset-versions.mjs --update` once, at the end; `--update` before all the bumps records a lie.
- `tools/local-ci.sh … | tail` masks the exit code; read the PASS block, not the pipe's status.
- The chooser in the lab's camera panel is hidden until `#camera-toggle` is clicked; a reload test must guard the
  storage re-seed (`design: null`).
- `tests/table-tabletop.mjs` starts its own preview server, which needs `NODE_PATH` to find `playwright-core` when
  Playwright is installed outside the repository.

## 7. Ownership restored

As of this file: Codex owns UX, UI, Play and the user-facing access screens, split Play and Workshop as above;
Claude owns the engine, simulation, card loads and the models, split Engine and Deck intelligence; Grok takes bounded
tasks under a package. `docs/ACTIVE.md`'s lanes table says so; ROB-11 records the handoff.
