# Playtest findings: one row per finding

For Grok Bot's four-agent playtests (`docs/plan-to-100.md`, M8). Fill in one row of
`playtest-findings-template.csv` per finding, and put the run in `docs/uat/<date>-playtest/`:
- `playtest-findings.csv`, the rows;
- `records/`, each game's record from the board's game-over panel, *Download the record*. Every agent may put in
  its own copy, since copies of one game count once.
- the screenshots the rows name.

`tests/playtest-findings.mjs` checks every playtest CSV under `docs/uat/` against these columns.

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
| `status` | `open`, `fixed` or `as-intended` |
| `outcome` | Empty while open. Once closed: for `fixed`, the PR that fixed it (`PR #705`) and its test; for `as-intended`, why, and for a `rules` or `card` finding the rule in `cr_rule` (a `ui`, `ux` or `performance` one answers to the design, which its outcome says) |

**The triage loop** (M8): read the rows; replay each game from its seed and tape; class each finding;
fix it with a test; replay the game again; and answer each row with what was fixed and what was ruled
working as intended, with the CR citation for a rules or card finding.

**The machine half:** `node tools/playtest-triage.mjs docs/uat/<date>-playtest`. For each game:
- it plays the record again from its seed and tape, an answer at a time;
- at every answer it judges each seat's view for hidden information, with the oracle gate G1 used;
- it says whether the game threw, leaked, or replays to a different journal.

For each row, it says whether the finding is answered. Then it judges **the exit criteria**:
- at least 50 games (`--games` sets another number);
- zero engine exceptions and zero leaks;
- every `rules` and `card` finding adjudicated;
- no `S1` or `S2` finding open, in any class;
- every row's game among the records, so it can be replayed.

Exit 0 means the criteria are met. A game that a `fixed` finding names may replay differently once its fix is in;
the tool says so and doesn't count it against the run. Only a playtest table's record has a seed and tape, and
staging's tables are playtest tables.
