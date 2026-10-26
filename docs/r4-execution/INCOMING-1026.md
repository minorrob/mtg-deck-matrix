# October 26 incoming integration evidence

Base: integration/r4 checkpoint `427ada654c936d6457eb36ca03d5d82715bdffc0`, scanned and pushed by the coordinator before handoff. Incoming branch: `claude/r4-rob-1026`.

The incoming work retains the newer program fixes. Its decision rows are EX-18–EX-26, after the coordinator's EX-17 tap rule. The separate incoming PR is draft during construction; the coordinator resumes full combined acceptance and main/staging work after the explicit return. This integration itself changes no release branch.

Conflicts resolved:
- crankmagic-board.js: combine the latest Turn tooltip with the incoming self/turn life list.
- crankmagic-stage.css: retain all latest row/caption readability and Full Camera/action/panel clearance rules, then append incoming camera/corner/mana/target styles.
- docs/r4-execution/DECISIONS.md: preserve EX-17 stable 30-degree taps; renumber incoming rows EX-18 through EX-26. Update the HANDOFF range and single wordmark reference, commit message and PR body. EX-18 explicitly records the later Cinzel request superseding CH-03.

Fixes made:
- Preserve the 15px scaled minimum for Mana Pool game-state labels, with a rendered regression assertion.
- Register both new suites in README and update the root-suite count to 627.
- Preserve fixed colored activation requirements as payColors; count actual color balances and distinct sources, so Castle Garenbrig cannot fund its {2}{G}{G} with four Islands or itself twice. Four Forests remains a valid six-mana case.
- Reflect unaffordable life-payment costs in per-way/source readiness; Myr Convert at one life contributes no available mana. Actual card definitions and legal-offer tests cover both insufficient and sufficient life.
- Regenerate affected asset versions and the 133-asset hash manifest with repository tools.

Proof: every requested gate passed serially with GEOMETRY_REQUIRED=1 and repo Playwright/installed Chrome. room-mana-pool20 and board-mana-pool20 include the new regressions. Intentional red-before-fix logs are retained locally. Report-only run remains separate from gating.

| Suite | Passed checks or validated records |
| --- | --- |
| design-tokens | 200 |
| planned-changes | 75 |
| deck-stages | 52 |
| asset-versions | 133 assets |
| crankmagic-change | 123 |
| slot-model | 49 |
| data-integrity | 50 variants + 50 connected buy profiles |
| feature-wiring | 131 |
| room-mana-pool | 20 |
| room-undo-play | 23 |
| type-final | 37 |
| decks-hub | 76 |
| planned-changes-ui | 41 |
| board-mana-pool | 20 |

| Report-only suite | Result |
| --- | --- |
| board-hand-table | FAIL: Focus hand hit point (listed failure). |
| table-camera-layout | FAIL: Camera changes battlefield card size (listed failure). |
| table-tabletop | FAIL: saved-owner/default module expectation. DIFFERENT from supplied list; identical failure reproduced on unchanged checkpoint 427ada65. |
| board-3d-camera | FAIL: wheel zoom/slider (listed failure); later menu and new head-look assertions were not reached. |
| board-babylon | FAIL: wheel zoom toward pointer (listed failure). |
| table-shared-shell | FAIL: old profile-menu Pages selector times out; Pages is under Table (listed failure). |
| board-r4-shell | FAIL: table/1440/100 whole-card scroll reachability (listed failing suite). |
| shell-r3 | PASS: 48 checks |
| landing-r3 | PASS: 55 checks |
| mobile-r3 | PASS: 27 checks |
| a11y-app | PASS: 108 checks |
| r4-density-safety | PASS: 19 checks |

These failures are report-only under Rob's explicit integration instructions. No unrelated failure was fixed or assertion weakened. The native full-table and remaining program acceptance limits in the coordinator handoff remain open. A failed suite proves only the assertions it reached.


Full command/output log: `work/claude-r4-rob-1026/gpt-run.log` (local, ignored).
