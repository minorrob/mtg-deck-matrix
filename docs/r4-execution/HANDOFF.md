# Current handoff

Baseline: main `c567c581`. Integration: `integration/r4`.

- Draft PR: https://github.com/minorrob/mtg-deck-matrix/pull/890 . It is attached to this chat and stays draft
  until the combined implementation passes its checks. `integration/r4` was pushed through `14e59964`.
- Foundation `fe65eb65` is integrated. Proof: design-tokens 196, feature-wiring 131, type-final 34,
  a11y-app 72, shell-r3 44, settings-r3 69, and four caught deliberate breaks. The original design source
  (build/pr/project, without the render gallery) is committed as `59ec5ff4`.
- The foundation worker is now the single Play writer (same worktree/branch) on D1, then A/B/C/D2.
  D1 is not yet committed or integrated. Play owns stage CSS; Workshop owns generic CSS and landing/app markup.
- Engine decision facts `a7f0fa5f` and play Undo `bc097107` are integrated. The coordinator reran
  engine-decision-facts (20) and room-undo-play (23). The worker also reports six Undo breaks caught and
  the affected room, table, projection, mana, block and refusal checks passing.
- Workshop's first behavior commit `d9eed16f` is integrated: new-deck-flow 45, decks-hub 71,
  deck-page-r3 43, deck-stages 51; three deliberate regressions caught. Landing/styles and bounded F2
  changes are in progress. A new Admin UI module will need initial script/cache registration by the coordinator.
- Admin backend `c15a94b4` is integrated: cloud-worker 151, four deliberate authorization/read-only/delivery
  regressions caught. Contract: `ADMIN-CONTRACT.md`. No Access policy, database migration or secret was changed.
- Shared asset pins and fixture were regenerated in `14e59964`; service-worker 9, cloud-sync 18,
  readout-feeds 1121 and data-integrity pass at that point. New suite additions require README reconciliation.
- Local runtime is Node 24.19.0; CI targets Node 22. Browser proofs use installed Chrome through UAT_CHROME
  outside the sandbox because localhost is blocked inside it. A release-pages run hit a sandbox-only Git-init
  permission failure; its elevated retry is in progress, not yet claimed as passing.
- Linear's get_agent_context tool returned unavailable. Initial issue creation was rejected as an additional
  external mutation; Rob then explicitly approved it. The tracking issue is ROB-197:
  https://linear.app/robs-build/issue/ROB-197/implement-r4-design-foundation-and-reconciled-playworkshop-ux .
- No full CI run, main merge, staging deployment or production deployment has occurred for this program.

The coordinator updates this file with integrated commits, commands, results and outstanding work.
