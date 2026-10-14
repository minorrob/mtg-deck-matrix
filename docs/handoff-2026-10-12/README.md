# The engine lane's integration scripts (handoff of 2026-10-12)

The session that ran waves 1 to 4c used these from its scratch space; they are kept here so another platform can run a
wave the same way (`docs/handoff-2026-10-12.md`, section 5). Each takes its paths as arguments; none holds a secret.

| Script | What it does |
| --- | --- |
| `BRIEF-wave.md` | Wave 4c's worker brief: change its base commit, its timing gate's path (`<scratch>`) and its "added these" list |
| `topneeds.mjs <root> <n> <out.json>` | The n most-played undefined cards of the 80% set, in play order, with what each still needs |
| `lanes.mjs <root> <themes.json> <out.json>` | The lanes' card lists: each theme's cards the table cannot play yet (`tableCards`), most-played first |
| `top90.mjs <root> <out.json>` | The 80%, 85% and 90% sets: how many defined, and the share of all card appearances they cover |
| `regen.sh <checkout>` | After a cherry-pick: the generated files from the merged sources (ours where they conflict, then `--write`), the README's suite count, the data inventory's check |
| `resolve-readme.py README.md` | README conflicts: ours for the suite count, both sides for each suite's entry |
| `break-one.py <breaks file> <label> ...` | One break at a time: applied, its file's suites run until one fails, the file restored |
| `run-list-at.sh <checkout> <out dir> <suite> ...` | Suites four at a time, a log each; prints "passed N of M" and the failures |
| `sentence-reuse.mjs <root>` | How many cards have every oracle sentence already in a defined card: the most a compiler built from them reaches, over all cards and over the 90% target (`docs/engine/plan-card-load-program.md`) |
| `verify-staging.sh <work dir> <previous version prefix>` | After `tools/release-staging.sh`: waits for Workers Builds, compares the deployed `play-worker.js` with the dry run's, lists the AI bindings; needs `CLOUDFLARE_ACCOUNT_ID`, `WRANGLER` and a Cloudflare token (read-only) |

The suite list a wave verifies (build it in the checkout):

```
ls tests/engine-*.mjs tests/room-*.mjs tests/table-basics.mjs tests/game-*.mjs tests/commander-pilots*.mjs \
   tests/pilot-policy*.mjs tests/data-integrity.mjs tests/feature-wiring.mjs tests/generators*.mjs tests/advisor.mjs \
   | grep -v room-resolve-all > list
```

The anchors check is in the repository itself: `python3 -I game/tools/batch/anchors.py` (run by
`tests/engine-breaks-anchors.mjs`).
