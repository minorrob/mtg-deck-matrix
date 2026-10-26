# Current handoff

Integration: integration/r4, baseline origin/main c567c581. Updated October 26, 2026.
PR: https://github.com/minorrob/mtg-deck-matrix/pull/890 (draft).
Tracking: https://linear.app/robs-build/issue/ROB-197/implement-r4-design-foundation-and-reconciled-playworkshop-ux .

## Integrated and proven locally

- S0 foundation; E engine and public projection contracts; D1 shell/Study; A decision desk;
  B combat; F1/F2 Workshop/Admin. Detailed CH evidence is in requirements.json.
- Canonical A: decision browser118; exact target identities8 plus two meaningful breaks;
  account-bound result bridge28. Mandatory Cancel only clears an unsent draft; only actual
  legal decline choices are sent. Phone drawer tabs no longer cover its binding action.
- Canonical B: combat96; direct-blocking8 layouts including tall text, phone and crowded choices;
  public combat6 layouts; all7 meaningful browser mutations caught. Preserved private check
  retry and stale/reconnect guards. Native participant references fit; phone tile opens its desk.
- Workshop: joined journey77 with20 whole-page/dialog primary sweeps and six caught breaks;
  lobby155, setup46, seventeen pure regressions caught. Chooser uses canonical local names,
  content-based shared-snapshot deduplication, distinct shared versions and separate public precons.
  Inline error contrast is measured from rendered colors (dark4.686/bronze4.687/light9.588).
- Native-restore density: exact source4f8c202a;67 checks,42 captures,0 findings, source unchanged,
  zero real write attempts/page errors. Output: workbench/r4-live-density-proof-20261026-r2.
  Limits: placeholder art/top viewports, no engine availability/account-sync/SW/live-table proof.
- Workshop audit evidence covers42 mapped findings:21 locally verified,13 partial,5 newer-baseline
  reconciliations,3 open. Read WORKSHOP-AUDIT-EVIDENCE.md; mapping alone is not resolution.
- Current coordinator pure checks: offer-context12, land-identity9, setup46, Admin21,
  lock-feedback18, service-worker9, feature-wiring131, readout-feeds1121 and data-integrity.

## Source integrated, final proof pending

- C and D2 combined checkpoint b3008cb4 is integrated. Worker baseline input44 and layout69 passed;
  D2 pixel/caption/endpoint/native-drag acceptance and affected regressions remain in progress.
- Global AccountMenu6b70a600 is integrated. Workshop owns its native groups/app hooks and tests;
  Foundation owns board adoption and game-draft/hotkey boundary. New menu browser baseline is
  being repaired for fixture readiness; old authorization/reset semantics remain required.
- ROOT README now lists620 root suites. Root owns shared pins and the fixture; versions were
  refreshed for this local checkpoint, but any subsequent served change must move them again.
- Last remote push was scanned5c3d7ecb. Later source is local until current changed-suite browser
  baselines pass, then the exact-head secret/merge scan and push. PR stays draft until all gates pass.

## Release gates

No r4 full CI, main merge, staging release or production release has occurred. Finish C/D2/menu,
combined visual/behavior/privacy acceptance, exact-head scan and required Actions run before main.
Engine is the staging release executor after root's gate; supported checker authenticated against
staging c567c581 in readiness review. Production requires Rob's separate release instruction.

Use Node22.23.3 under workbench/node22/node_modules/node-win-x64/bin for release. Targeted local
checks used Node24.19.0 and installed Chrome. Browser/temporary-Git tests need external execution
because sandbox localhost/Git-init is restricted. A skip is not a pass. Browser suites run serially.

Workers: workbench/r4-foundation-20261026 (single board writer), r4-workshop-20261026 (Workshop/menu),
r4-engine-20261026 (engine contracts, independent reviews and release executor). Root owns canonical
repo merges, pins, tracking and central audit disposition. Preserve preexisting untracked design renders.
