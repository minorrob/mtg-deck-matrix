# r4 D1 shell checkpoint

October 26, 2026. Source: `docs/r4-execution/source/D1-play-shell.md` and `docs/r4-execution/DECISIONS.md`.

This checkpoint changes the shared seat header, labeled drawer tabs, keyboard disclosures,
decision handoff when a drawer folds, direct opening-hand choices, device-local continuous HUD sizing,
Table actions and covered-shell accessibility. The lobby can call `CrankBoard.countdown(host, n)`
and `CrankBoard.countdown(host, null)` while retaining its existing timer and sound.

The Study CSS is applied to the DOM surface and default felt mats. **CH-40 remains partial:**
the Babylon table still needs an actual Study design and default; a CSS class behind a canvas
does not prove that material change. Newer backdrop videos and explicit saved table choices are preserved.

## Proof

- `node tests/board-r4-shell.mjs`: 95 checks, Table/Focus/Full at 1440 and phone at 390,
  representative dark/light/Bronze skins, real rendered font sizes, one enabled priority primary,
  readable 100/200% HUD sizing, non-overlapping zone headings, phone Lands scroll reach,
  confirmed Concede, keyboard disclosures, and opening-hand choices.
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
