# r4 D1 shell checkpoint

October 26, 2026. Source: `docs/r4-execution/source/D1-play-shell.md` and `docs/r4-execution/DECISIONS.md`.

This checkpoint changes the shared seat header, labeled drawer tabs, keyboard disclosures,
decision handoff when a drawer folds, direct opening-hand choices, device-local continuous HUD sizing,
Table actions and covered-shell accessibility. The lobby can call `CrankBoard.countdown(host, n)`
and `CrankBoard.countdown(host, null)` while retaining its existing timer and sound.

The actual Babylon Study design now builds a painted walnut top, walnut apron and tapered legs,
with a fine brass edge and brass feet. It is the default only for an unset preference; all seven
existing designs, older saved aliases and the six newer backdrop videos remain available.
DOM felt mats use charcoal. The screenshot is material proof, not final acceptance of every 3D control.

## Proof

- `node tests/board-r4-shell.mjs`: 111 checks, Table/Focus/Full at 1440 and phone at 390,
  representative dark/light/Bronze skins, real rendered font sizes, one enabled priority primary,
  readable 100/200% HUD sizing, non-overlapping zone headings, phone Lands scroll reach,
  confirmed Concede, keyboard disclosures, opening-hand choices, whole battlefield/land card
  scroll reach, and a public-only live seat summary. Short seat grids now scroll complete content;
  the captions no longer consume a card row while leaving a clipped first creature row.
- `node tests/board-settings-window.mjs`: 64 checks.
- `node tests/table-shared-shell.mjs`: passes.
- `node tests/feature-wiring.mjs`: 131 checks.
- `node tests/data-integrity.mjs`: passes.
- Deliberate-break specification: `game/tools/batch/breaks-r4-shell.py`.

The browser runs use installed Chrome, Playwright 1.56 and Node 24.19. Local test-server
navigation requires execution outside the network-restricted sandbox. These are fixture views,
not proof of engine legality or a production game. Card-image placeholders in these fixtures
do not establish final art fidelity. Final combined CI, all real-game journeys and staging remain open.

Screenshots are captured by `UAT_SHOTS` with `r4-shell-<view>-<width>-100.png`, `-200.png`,
and `r4-shell-phone-lands-200.png`. Visual review caught and corrected a clipped phone seat row,
an overlapping battlefield caption, a Camera trigger widened by its popup, small phase text,
broken portrait-image glyphs, and decision controls covered by bottom tabs.

Follow-up proof:

- `node tests/board-graphics.mjs`: 87 checks, including Study default, real top/edge/side/leg meshes,
  walnut texture, all eight designs painted in full RGBA with relief, and LF/CRLF catalog generation.
- `node tests/board-result-bridge.mjs`: 23 checks. Refresh before filing, stable server date and identity,
  wrong seat/match rejected, pending summary retries, legacy fallback, commit retry, and stale table,
  account or rematch during async work rejected. Mere detach retains the finished-game retry.
- `python game/tools/batch/breaks.py game/tools/batch/breaks-board-result-bridge.py`: 3/3 caught, missed [].
- `tests/table-tabletop.mjs` expectations updated for eight designs/Study default; full suite not rerun
  in this checkpoint. The graphics suite exercises actual preserved design builds instead.

Unobstructed 3D material proof: `r4-study-babylon-1830.png` in the task evidence directory.
The dated bridge uses the server record only after validating schema, stable id, match and owner seat.
New rooms never fall back to a client timestamp while their server summary is pending.
