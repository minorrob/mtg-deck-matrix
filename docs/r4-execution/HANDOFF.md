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
- Workshop: joined journey 77 with 20 whole-page/dialog primary sweeps and six caught breaks;
  lobby 155, setup 46, seventeen pure regressions caught. Chooser uses canonical local names,
  content-based shared-snapshot deduplication, distinct shared versions and separate public precons.
  Inline error contrast is measured from rendered colors (dark 4.686 / bronze 4.687 / light 9.588).
  Measure uses a saved fixture report; these proofs make no provider calls or owner-library changes.
- Shared AccountMenu: global source and hooks pass 85 checks plus five caught regressions;
  Help 14, Settings 73, reset 43 and Landing 55 remain green. Native groups/gates, one Settings,
  actual aria, Tab/light-dismiss, phone fit, required danger ink, and fresh-invoker focus after a
  board-like redraw are covered. Actual board adoption/draft protection remains Play-owned.
  The shell baseline also proves one native deletion Undo receipt through hub/detail navigation;
  its duplicate-receipt regression was caught. Typed deletion and reset semantics are unchanged.
- Native-restore density: exact source4f8c202a;67 checks,42 captures,0 findings, source unchanged,
  zero real write attempts/page errors. Output: workbench/r4-live-density-proof-20261026-r2.
  Limits: placeholder art/top viewports, no engine availability/account-sync/SW/live-table proof.
- Workshop audit evidence covers42 mapped findings:21 locally verified,13 partial,5 newer-baseline
  reconciliations,3 open. Read WORKSHOP-AUDIT-EVIDENCE.md; mapping alone is not resolution.
- Current coordinator pure checks: offer-context12, land-identity9, setup46, Admin21,
  lock-feedback18, service-worker9, feature-wiring131, readout-feeds1121 and data-integrity.

## Source integrated, final proof pending

- C/D2 source through 1c65e917 is integrated, including the measured combat header and returned-picker
  flow repair. Source7931e2a1 passed71 assertions across14 caption/geometry scenarios; phone light-theme
  turn/icon ink passed its focused7 on777b0a60. Coordinator inspected Table100/200 and phone200 captures.
  The Table now preserves full battlefield/lands rows and scrolls vertically when required (EX15).
  Native input62 and views78 passed earlier bounded source checkpoints; final layout, folded16,
  actual card-badge bounds, affected legacy suites and browser mutations remain pending.
- Pure offer12, land9, Coach-context20, seat lifecycle10 and account-menu keyboard17 pass. Coordinator
  caught all three meaningful pending-draft/old-capability-response Coach regressions and restored source.
- The preserved real-table suite reached119 checks on66916e95. Its old DOM assertions are being
  migrated without dropping identity, privacy, legality, geometry or reconnect coverage. The whole
  suite is not green yet. Browser proofs remain serial; Engine currently owns the slot, with Foundation
  queued for the returned-picker repro and the remaining finite native/mutation gates.
- Global AccountMenu source begins at 6b70a600; opening/focus refinements are 6f2b1e83/17e599c4,
  required danger ink 69edbf73, and scoped Invite/Admin alignment 8da62a87. Global acceptance is
  green; Foundation owns the real board-avatar adoption and game-draft/hotkey boundary. Shared
  alternate-anchor proof does not replace that real board test. Final row-alignment capture is
  optional; the inspected earlier captures and functional proof are identified in the Workshop audit.
- ROOT README now lists625 root suites. Root owns shared pins and the fixture; versions were
  refreshed for this local checkpoint, but any subsequent served change must move them again.
- Last remote push was scanned5c3d7ecb. Later source is local until current changed-suite browser
  baselines pass, then the exact-head secret/merge scan and push. PR stays draft until all gates pass.

## Release gates

No r4 full CI, main merge, staging release or production release has occurred. Finish C/D2/menu,
combined visual/behavior/privacy acceptance, exact-head scan and required Actions run before main.
Engine is the staging release executor after root's gate; supported checker authenticated against
staging c567c581 in readiness review. Production requires Rob's separate release instruction.
Dedicated clean release checkout: workbench/r4-release-checkout-20261026; release output/log workspace:
workbench/r4-release-staging-20261026. Build/commit delete targets were checked within that workspace;
recheck paths, ports and the gated main revision immediately before running the documented script.

Use Node22.23.3 under workbench/node22/node_modules/node-win-x64/bin for release. Targeted local
checks used Node24.19.0 and installed Chrome. Browser/temporary-Git tests need external execution
because sandbox localhost/Git-init is restricted. A skip is not a pass. Browser suites run serially.

Workers: workbench/r4-foundation-20261026 (single board writer), r4-workshop-20261026 (Workshop/menu),
r4-engine-20261026 (engine contracts, independent reviews and release executor). Root owns canonical
repo merges, pins, tracking and central audit disposition. Preserve preexisting untracked design renders.
