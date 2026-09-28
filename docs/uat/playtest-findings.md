# Playtest findings: one row per finding

For Grok Bot's four-agent playtests (`docs/plan-to-100.md`, M8). Fill in one row of
`playtest-findings-template.csv` per finding, and put the run's rows and evidence in
`docs/uat/<date>-playtest/`. `tests/playtest-findings.mjs` checks every playtest CSV under `docs/uat/`
against these columns.

| Column | What goes in it |
|---|---|
| `id` | `PT-<run>-<nn>`, unique in the run |
| `game_id` | The match id the board shows (for example `t1234g1`); it names the stored game and its decision tape, so the game replays here (`game/room/replay.mjs`) |
| `seat` | The seat that saw it |
| `turn`, `phase` | Where in the game: the turn number and the step or phase |
| `cards` | The card or cards involved, `;`-separated |
| `happened` | What the game did |
| `should_have` | What it should have done |
| `cr_rule` | The Comprehensive Rules citation, when known (`CR 510.1a`) |
| `evidence` | A screenshot file name, or the journal event range |
| `severity` | `S1` blocks a game or corrupts it · `S2` wrong result · `S3` friction · `S4` cosmetic or copy |
| `class` | `rules`, `card` (a missing or wrong card definition), `ui`, `performance` or `ux` |
| `status` | `open`, `fixed` (with the PR) or `as-intended` (with the CR citation) |

**The triage loop** (M8): read the rows; replay each game from its seed and tape; class each finding;
fix it with a test; replay the game again; and answer each row with what was fixed and what was ruled
working as intended, with the CR citation.
