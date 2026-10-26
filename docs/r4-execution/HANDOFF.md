# Current handoff

Integration: integration/r4, baseline origin/main c567c581. Updated October 26, 2026.
PR: https://github.com/minorrob/mtg-deck-matrix/pull/890 (draft).
Tracking: https://linear.app/robs-build/issue/ROB-197/implement-r4-design-foundation-and-reconciled-playworkshop-ux .

## Coordinator resumed after PR #894

Incoming ownership returned explicitly at pushed integration/r4
`9198910040383cb9907304bcea9acaaa1b7d89e5`, equal to origin and clean except the preserved untracked
design renders. PR #894 is merged. Its source commit is `87953f81`; all 14 requested gates passed on
both that source and the merge, with exact-head secret/clean-merge scans. No incoming browser remains.
The transfer and hold described in the historical handoff below are complete.

The original combined acceptance resumes: Engine continues the real-table pass from the unclassified
Focus Coach geometry stop; Foundation completes the finite remaining Play gates. Older report-only
tests must follow EX-15–EX-26 while retaining their functional assertions. In particular EX-17 permits
rotated card corners across unchanged slots, EX-16 permits a readable sizing offset, and EX-18 supersedes
the earlier unchanged-wordmark requirement. The required CI, main merge and staging are still pending.

## Incoming follow-ups: integration evidence

`claude/r4-rob-1026` applies the incoming patch to pushed checkpoint `427ada65`. All14 requested gates
pass, including room-mana-pool20 and board-mana-pool20 after red-before-fix/green-after-fix colored-cost
and life-cost regressions. All12 report-only suites ran serially: five pass, seven fail. The extra
table-tabletop failure is also present at unchanged427ada65. Full suite results, the three conflict
resolutions, fixes and limits are in [INCOMING-1026.md](INCOMING-1026.md).

After this separate PR's local no-ff merge, repeated gates and integration/r4 push, canonical/index/browser
ownership returns to the coordinator at the exact commit announced in the authorized cross-chat message.
The earlier combined acceptance work remains pending as documented below; this bounded integration does
not establish full CI, main readiness or staging acceptance.

## October 26 follow-up integration handoff

Rob authorized the separate chat **Integrate October 26 r4 follow-ups** to integrate the supplied Claude
patch as its own PR into integration/r4, and explicitly approved coordinating this handoff. Its direct
instructions are in the attached pasted text and work/claude-r4-rob-1026/. It owns the canonical
branch/index and serial browser slot once the coordinator sends the scanned, pushed checkpoint SHA.
The source/tests parent of this handoff note is036c321b73047a4ba5a213ae2cf0ab566305a176.

All coordinator source work is committed; both worker browser processes are closed. Preserve the
preexisting untracked docs/design/2026-10-25-redesign-r4/renders/. Incoming work must preserve newer
functional fixes, EX17 (stable30-degree tapped slots), and renumber its decisions toEX18–EX26.
The incoming patch's wordmark and other explicit new user requests must be reconciled with the earlier
source rulings under that chat's conflict instructions; do not silently drop either side.

**Main, full CI readiness and staging are held until that separate integration returns.** This is an
in-progress draft checkpoint, not an assertion of a full green gate. After the incoming PR is locally
merged/pushed to integration/r4, return canonical/browser ownership at its exact commit to this coordinator
so the combined acceptance, required CI, main merge and staging can resume. Production still requires
Rob's separate release instruction. The follow-up chat itself is explicitly forbidden to touch main or
release staging/production.

Latest frozen production isfdc4fc65; pins board111, stage69, app591, SW574,133 assets matching working/Git
LF bytes. Current completed browser baselines: input62, layout90, views97; focused draw/Hand independence12;
focused phone folded14 after allowing the actual preference-setup toast to expire. Seven pure suites116
and existing guard mutations pass. The full folded16, caption16 plus existing Focus-draw, settings-window
and fullscreen-notes baselines remain pending; remaining native mutations are listed by the Foundation
worker in workbench/r4-play-evidence-20261026/foundation-frozen-gates-4f3694df.json. Do not duplicate already
recorded real red-before-fix/green-after-fix paths.

Real-table latest test head ed7165f3 is integrated (original diagnosticd53d26a5 retained in ancestry).
Run26 reached258 checks on b7a64cf8 and stopped at Focus Coach module/standalone geometry. The composer is
visible/focused; source vs oracle is unclassified. The next run prints exact mat/drawer rectangles and
main.scrollTop before/after; do not weaken the assertion without those facts. Evidence is outside Git:
workbench/r4-table-board-proof-20261026-r26 and workbench/r4-table-board-20261026-r26.log. Remaining sections
are Coach prompt/thread/keyboard/draft/Questions, dropped socket/newest-wins, phone, End/private records,
idempotent filing and deck Record. No full real-table pass is claimed.

This checkpoint is pushed at Rob's explicit incoming-integration instruction despite those documented
pending baselines. PR890 stays draft. Required secret/merge scan must pass before the checkpoint push.

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

- C/D2 source through60d058cd is integrated. Source7931e2a1 passed71 assertions across14 earlier
  caption scenarios; the final matrix now has16 including three-seat Table. Phone light-theme ink
  passed its focused7 on777b0a60. Native max-size50 on d18c7463 covers public badge bounds, wrapped zone
  labels, count-only narrow piles, 5:7 raster, whole first tapped card, useful60–160 range and no sideways
  overflow. Coordinator inspected those endpoint images. EX15 now covers Table and Focus row minima;
  exact Focus1280×800 Library draw10 passed, with real hand clearance and truthful null-priority display.
- Coach delayed/cached entry10 on9d828ff1 covers both the module and Play settings paths, actual composer
  access, draft retention and deliberate moved-focus protection. Returned folded target picker14 passed
  its focused Table200 case; full folded16, final layout/views/endpoint matrix, affected legacy suites,
  final combat geometry and browser mutations remain pending.
- Pure offer12, land9, Coach-context32, seat lifecycle10 and account-menu keyboard17 pass. Coordinator
  caught three meaningful pending-draft/old-capability Coach regressions; owner subsequently caught all
  five including account/moved-focus protection. Source was restored cleanly.
- The preserved real-table suite reached192 checks on e7c1c1ad. Its old DOM assertions are being
  migrated without dropping identity, privacy, legality, geometry or reconnect coverage. The whole
  suite is not green yet. Actual Table down-scroll/whole Lands hit/return-to-top is proven, as are cast
  Undo offer, closure on acknowledged pass, opponent response/Resolve, stack inspection and resolution.
  Browser proofs remain serial. Foundation owns the bounded current window: the combined Full1400
  inspector+Stack fix makes Camera reachable but its screenshot shows Next step/Skip covered, so peer
  control clearance remains a source blocker. Engine resumes on the reviewed fix, then Foundation
  completes its remaining finite native/mutation list. No full real-table pass has been claimed.
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

- Rob's October 26 follow-ups (EX-18 to EX-26) are integrated from `claude/r4-rob-1026`: the Cinzel gilt wordmark,
  the deck tile's star beside its stage pill, Planned Changes adds without take-outs and decks past 100, the Play camera,
  hand and backdrop, the life list and play cards, the head look, the Mana Pool module (and the room's `manaSources`) and
  targeted cards in red. B, C and D2 keep them, CH-34's Camera redesign included; CH-03 reads as superseded by EX-18.

Workers: workbench/r4-foundation-20261026 (single board writer), r4-workshop-20261026 (Workshop/menu),
r4-engine-20261026 (engine contracts, independent reviews and release executor). Root owns canonical
repo merges, pins, tracking and central audit disposition. Preserve preexisting untracked design renders.
