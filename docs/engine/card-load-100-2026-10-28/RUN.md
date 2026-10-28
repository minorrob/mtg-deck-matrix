# The run's record: the card load to 100%

The orchestrator writes this after every wave (`ORCHESTRATION.md`, step 8). A fresh orchestrator resumes from it alone.
Newest wave first. Each line names its command's result line, never a summary of it.

## Where the run stands

- **Holder:** not started (the package was written 2026-10-28 by a Claude Code session on Personal-HP; nothing ran).
- **Main at the start:** `39a45706`.
- **Next:** wave 0, the debt wave.

## The gates, measured

| Gate (README, "What 100% means") | At the start (2026-10-28, main `39a45706`) | Now |
| --- | --- | --- |
| G-1 Commander cards final | 6,430 defined of about 32,046; 25,616 undefined | |
| G-2 Candidates outstanding | 116 (compiler, live); 100 in the committed `candidates.json` | |
| G-3 `check-cards` | 6,430 definitions, 11,023 scenarios, 0 failed | |
| G-4 Calibration failures | 4 of 4,165 (Blackblade Reforged, Contagion Clasp, Goblin Piledriver, Wayfarer's Bauble) | |
| G-5 Pool fuzz, clean of games | the harness has no pool mode yet; library 3 of 3, staging decks 1 of 1 clean | |
| G-6 Final cards exercised in a clean game | not measured (no ledger yet) | |
| G-7 Gameplay-gap list open items | section 4: 21 open, 5 unsure; section 5: 10 open; section 7: 10 open; section 8: 10 rows open, 4 partial (`README.md`, "Open accuracy debt") | |
| G-8 Rob's playtest sign-off | none | |

## Waves

| Wave | Integration PR | Written | Promoted | Stopped | Checks (result lines) | Merged | Staging | Ignores added |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
