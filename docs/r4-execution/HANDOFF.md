# Current handoff

Baseline: main c567c581. Integration: integration/r4. Updated October 26, 2026.

- Draft PR: https://github.com/minorrob/mtg-deck-matrix/pull/890 . Tracking: ROB-197,
  https://linear.app/robs-build/issue/ROB-197/implement-r4-design-foundation-and-reconciled-playworkshop-ux .
  Rob explicitly approved the Linear issue after the initial automatic approval rejection.
- Source, decisions, 61 requirement IDs and the audit crosswalk are in this directory. The source
  design build/pr/project is committed; the preexisting untracked renders gallery is preserved.
- Foundation, D1 and the decision desk A are integrated. Latest A implementation: 77c21bf4,
  integration merge 02888a1e. The coordinator proved the final A browser fixture (118), both added decision regressions, two target-identity regressions, target presentation (8) and shared result bridge (28).
  Foundation is the single Play writer for B combat, C board input and D2 views/account adoption.
- Engine contracts and tests are integrated: public choice/source facts, safe reversible plays and
  mana, Prepared funding/offers, authoritative result records, per-attacker refusal reasons and
  truthful Coach capability. Public attachment/token facts (57fdfede) are integrated for land grouping; projection 93 and state 41 pass.
- Workshop F1/F2 and Admin are integrated. Latest global notice contract cc4d2230 keeps errors
  dismissible and persistent, and valid transaction Undo bound to its original revision. Final Workshop SW (8), Share (17) and a11y (108) browser proofs passed; preference-only Undo exclusion is integrated (lock-feedback 18). The joined journey and Explore proof are in progress.
- Coach presenter c81805fc is integrated; registration in both entries, offline shell and cloud release
  profiles is in 72773974. Help is connected to the existing Table Help action (42c4e7f4; presenter 32). Final board adoption remains open.
- The coordinator reran: engine-decision-facts 34, room-undo-play 23, board-result-bridge 25,
  lock-feedback 16, crankmagic-coach 30, service-worker 9, readout-feeds 1121 and data-integrity.
  Targeted browser proof and deliberate-break records remain with each bounded implementation.
  The README now lists 612 root suites; this total must be regenerated as more suites arrive.
- Asset versions were refreshed in 72773974. Subsequent implementation changes need fresh pins
  and tests/asset-versions.mjs --update before the next push. The release-builder rerun passed 226. A later phone drawer fix (d1a8d023) reserves the bottom tab strip and proves the binding action is not covered.
- Runtime for targeted checks: Node 24.19.0 and installed Chrome. Node 22.23.3 is available under
  workbench/node22/node_modules/node-win-x64/bin/node.exe for the release toolchain. Browser and
  temporary-checkout tests require external execution because the sandbox blocks those operations.
- Remote integration was pushed through scanned commit 5c3d7ecb. Newer local checkpoints await the next exact-head scan.
- Staging readiness was checked read-only: tools/staging-check.mjs authenticated successfully;
  staging served c567c581. Wrangler OAuth is available. No secret values were printed or changed.
- No full CI run, main merge, staging deployment or production deployment has occurred for r4.
  Remaining: B/C/D2, combined visual and behavioral acceptance, exact-head scan, green CI,
  main merge, release acceptance and live staging verification. Production requires Rob's separate go.

Workers: workbench/r4-foundation-20261026 (single Play writer), r4-workshop-20261026 and
r4-engine-20261026. Each owns its branch; canonical repo owns integration and pins. Browser suites
run one at a time. Do not delete or relocate any workspace that this effort did not create.
