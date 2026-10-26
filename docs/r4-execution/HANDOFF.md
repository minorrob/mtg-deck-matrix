# r4 acceptance snapshot

Integration: integration/r4, main baseline c567c581. This is the pre-CI source and local-proof snapshot.
The current CI, main merge, staging revision/deployment and live readback are recorded in
[PR #890](https://github.com/minorrob/mtg-deck-matrix/pull/890), with tracking in
[ROB-197](https://linear.app/robs-build/issue/ROB-197/implement-r4-design-foundation-and-reconciled-playworkshop-ux).
Production requires Rob's separate go.

## Source and ownership

The coordinator owns canonical Git/index/pins/docs. Engine owns the current serial real-table browser
window and later staging release; Workshop's tabletop and the coordinator's shared-shell native gates
are queued. Foundation finished its bounded lane at757cf62b, clean with no browser. No further visual
polish is in scope; an actual failed acceptance gate may require a bounded repair.

All61 explicit CH rows are integrated, except CH-03, superseded by the later EX-18 Cinzel/gilt request.
The source numbering ends at89 with gaps. The129 original audit findings remain individually tracked;
53 unmapped findings and bounded partial/open evidence are not converted into closure by a CH mapping.

Latest integrated production/pin snapshot: ad4afea1f36451731b3a478bb845c703bacc6a1e. Board115,
stage.js21, stage.css71, SW578 and app595 have matching Git/working/manifest bytes;133 assets are recorded.
Static gates pass: asset133, wiring131, data50 variants/50 buy profiles, readout1121.
Preserve the preexisting untracked docs/design/2026-10-25-redesign-r4/renders/ and all evidence worktrees.

## Incoming work and intent

PR #894 merged into integration at91989100 after all14 requested gates passed on source and merge,
with exact-head secret/clean-merge scans. Three conflicts and the mana colored-cost/life-cost repairs
are recorded in INCOMING-1026.md. The incoming chat returned all canonical/browser ownership explicitly.
EX-17 keeps30-degree tapped cards in unchanged slots; corners may tuck under neighbors. EX-15/16 allow
usable full rows/readable sizing offsets. EX-18 replaces the original unchanged-wordmark instruction.
EX-27 applies the later no-drawer-overlap preview request to grown Focus mats, including the actual
spine controls; both existing Focus viewport cases used over-mat fallback, with no claimed gap-fit case.

## Bounded local proof

Commands use GEOMETRY_REQUIRED=1, repository Playwright and installed Chrome. A skipped browser is not
a pass. Exact source/test snapshots and logs are in workbench/r4-play-evidence-20261026/
foundation-final-gates-757cf62b.json; local artifacts are outside Git.

| Gate | Proven scope |
| --- | --- |
| Five legacy Play suites | Camera layout across three widths/phone/persistence; shell111; hand109; 3D camera106; Babylon90 on0fff1f12. Includes actual head-look, native menus and exact-once binding. |
| Folded decisions |224 checks/all16 existing scenarios on9ce2148d, including native three-point hits and way back. |
| Caption endpoints |169 checks/all17 scenarios on476f1176, including readable facts/badges, useful sizing,5:7, stable tapping and Focus draw/Hand independence. |
| Coach | Earlier all-mode views106 plus final Focus42 on9ce2148d; actual red-before/green-after draft/caret/scroll, async More/Clear/Questions and Clear-to-summary focus. |
| Settings window |70 checks oncfb65183, including phone Camera layering and real Side Drawer Modules None/save/order controls. |
| Fullscreen |49 checks on757cf62b, including physical stacked-land Undo, large action targets and preview/spine access. |
| Drawer contrast | Same existing Focus1440/HUD200 case11 checks: selected facts16.95:1 and initial12.98:1 after scoped repair. |
| Pure Play guards | Seven suites116 on757cf62b; earlier seven meaningful guard mutations caught. |
| A/B and Workshop | Decision118; combat96 plus direct-blocking/public-display and meaningful regressions; joined Workshop77, lobby155/setup46, account menu85, Admin boundary, Help/Settings and density evidence in QA.md/requirements.json. |

These are precise tested snapshots. Later scoped repairs have their own affected-path native proof;
not every earlier matrix was rerun after every CSS change. The final Actions run covers the combined tree.
The coordinator inspected representative Full/Table/Focus/phone captures and the corrected light drawer.

## Remaining at this snapshot

Engine Run33 is running on ad4afea1. Run32 reached277; the reproduced Coach focus failures are repaired,
but the next full real-table pass must still complete Escape/reopen, reconnect/newest-wins, phone and
End/private records/idempotent filing/deck Record. Workshop tabletop and coordinator shared-shell native
baselines follow. Required full CI, main readiness/merge and staging release/readback remain open.
No r4 release is claimed by this source snapshot; use PR #890 for subsequent completion records.

## Release execution

After the affected gates and exact-head tools/local-ci.sh <SHA> 0 scan, push the finished candidate and
mark PR #890 ready for its one required full Actions run. Recheck main/mergeability/green head and merge
with history preserved. Do not repeat the identical full suite locally while Actions can run.

Engine then uses tools/release-staging.sh with the dedicated checkout
C:/Users/robmi/CrankMagic/workbench/r4-release-checkout-20261026 and output workspace
C:/Users/robmi/CrankMagic/workbench/r4-release-staging-20261026. Reverify resolved build/commit delete paths,
ports and exact gated main SHA. Node22.23.3 is at workbench/node22/node_modules/node-win-x64/bin/node.exe;
use approved Wrangler, repo Playwright and installed Chrome. The script gates the real cloud-staging
build locally with release-acceptance and play-e2e before pushing release/cloud-staging.

Observe the configured deployment; run tools/staging-check.mjs --expect <main-SHA> for both entries and
authenticated service identity, then applicable isolated native staging acceptance/density. Never print
Access credentials or commit the copied native backup. A release-branch push alone is not live acceptance.

Physical phone/GPU hardware, real mail/provider calls and a fresh live finished-match/account-sync
journey retain their stated limits. The density walk uses a copied native backup in isolated browser
storage with writes/providers blocked; it cannot prove those live operations. Audit detail remains in
AUDIT-STATUS.md, findings.json and WORKSHOP-AUDIT-EVIDENCE.md.
