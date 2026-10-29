# Dedicated engine playtest subagent, next batch

Rob's October 29 handoff assigns one subagent slot to these playtest issues instead of another card-writing assignment.
Dispatch update: `playtest_engine` now starts the next batch in `w0-playtest` / `codex/engine-load100-w0-playtest`
from `fad5f009`, beginning independent ROB-211 while root checks the existing Confirm PR. Keep the
remaining wave-0 work and the frozen 95%-appearance target intact. No new card deal or promotion before wave 0 closes.

Current checkpoint: P0 Salty/safe Cancel #934 and native blink audit/US wording #939 are integrated through root
`50f47e22`. Root independently passes Salty71/room21, Cancel63/room53 and actual blink113. ROB-205 uses Rob's
confirmed reversible-only boundary; UI consumption remains pending. ROB-209 additive room staging is in progress.
ROB-210 browser audit awaits a coordinated quiet window; native proofs alone do not mark it Done. PR #932 was merged
externally at `0aee1474`, but its full CI was canceled at 60 minutes and provides no full acceptance credit here.

Root integrates and confirms the work. The subagent works in an isolated `codex/engine-load100-w0-playtest` branch
from the current integration head, after checking current main and ownership. Keep its source and proof in a pushed
draft PR and update the existing Linear issues with measured results and remaining work. Do not mark issues Done
from an implementation claim, passing unit tests alone, or a ready-but-unmerged PR. Do not change existing labels
merely because another model now holds the engine work.

| Issue | Engine assignment | Completion evidence and boundary |
| --- | --- | --- |
| ROB-204 | Review existing PR #932 and its exact-head CI; verify room acceptance of zero/one/multiple optional targets and continuation through the actual affected effects. Do not duplicate the existing fix. | Intake head `ea670e40b89203df2fd8415faac7c2c2467ab68b`, branch `claude/crankmagic-oct28-playtest-zgybjx`, against `b9999b16`; merged externally at `0aee1474`. Its full CI was canceled, and the owner explicitly used touched-suite validation. This does not satisfy our full gate. Its fix is client Confirm handling, with room regressions but no production engine changes. Keep UI source with its owner and retain all acceptance gaps. |
| ROB-210 | After ROB-204 is verified, audit required targets, up to one, any number including zero, combat-damage blink triggers, and blink/search/return continuations end to end. | Use actual Oracle definitions and actual room actions; verify final zones, new object IDs, targets, search result, shuffle, triggers and continued priority, including reload and invalid/stale answers. PR #932 notes that the issue's quoted blink text does not match Claim Jumper, whose actual effect searches for Plains. Audit that real search separately; identify the actual blink card rather than inventing an ability. |
| ROB-205 | Implement the engine side of Cancel on reversible pending decisions, using the existing room answer `cancel` flag as an investigation lead, not proof of full support. | Rob explicitly confirmed on October 29: Cancel reversible actions; keep committed mandatory choices pending with clear guidance. Define rollback/cancel boundaries for resources, targets and saved operations; prove restored priority, reload, actor/source departure and repeated/stale input. Never skip mandatory effects or committed information. The concrete life-loss-then-discard case must refuse Cancel unchanged and accept the required discard so its remaining effect completes. UI buttons remain with the UI owner; no skip-history policy or house-rule exception is authorized. |
| ROB-209 | Deliver the engine output/continuation contract for modes first, targets per selected mode, then payment, covering modal and spree spells. | Document stable transaction/action/mode IDs, stage order, per-mode legal options/cardinality, target constraints, costs and cancellation/backtracking semantics. Keep existing cardinality `mode` fields distinct from a new stage field. Prove real multi-mode casts, shared/repeated targets where legal, zero optional targets, spree additional costs, invalid answers, reload and payment exactly once. Hand off fixtures and a versioned/additive contract to the UI owner; do not build the UI or close the shared issue before both halves are verified. |
| ROB-211 | Correct the rules-only Normal Salty pilot's provocation and threat weighting: salt follows actual hits and pressure reflects threats, rather than repeatedly selecting the weakest board. | Reproduce the four-player situation with the weak player and opposing 12/12 trampler. Test multiple turns, no-provocation behavior, genuine retaliation, defensive blockers, lethal opportunities and multiple threats. Use public information only and preserve serializable personality memory. Require actual pilot/room choices, meaningful caught mutations and bounded deterministic easy/normal games. No provider API, paid model seat or new source of spending. |

## Ownership and order

1. Root checks the existing ROB-204 PR/CI and integration path. The subagent begins from that evidence and does
   ROB-210 after the Confirm blocker is verified. ROB-211 can proceed independently while that check runs.
2. This slot owns the engine halves of ROB-205 and ROB-209. UI controls, layout and shared issue closure remain
   with the UI owner. Publish concrete room-view fields and fixtures before asking that owner to consume them.
3. Coordinate `actions.mjs`, `asking.mjs`, `turn.mjs`, room decision projection and operation continuations with W2/W3
   and W5 before editing. W5 still owns payment identity/performance and effect-paid costs; W4 owns outside-resolution
   damage and the narrow mana-ability `then` bridge; W1 owns the queued Battle/Siege transformed-cast seam. These
   playtest fixes do not grant permission for concurrent edits to those regions or to production UI files.
4. Preserve every card-load gate and original test assertion. Add actual RED-to-GREEN regressions and caught
   mutations, run focused affected readers, and scan the exact commit before each push. Full suite runs once on
   Actions when ready; do not duplicate an unchanged run locally. No production release, migration or provider calls.
5. Keep Linear truthful: ROB-204 remains In Progress while its PR is unmerged; ROB-210 stays blocked until its
   prerequisite is verified. Record queue/intake now, change implementation status only when work actually starts,
   and log contract handoffs without marking the UI half complete.

## Linear intake records

All five issues received queue/ownership comments; their workflow states were left unchanged. Update these records
or add measured milestones as the work proceeds, without duplicate intake comments.

| Issue | Intake comment ID |
| --- | --- |
| ROB-204 | `c43f3aaa-f081-48ce-b897-f35a60c2d2a9` |
| ROB-210 | `8b32e469-c22b-4ec3-aa5e-492d9f86be87` |
| ROB-205 | `4e1461f8-6803-4eef-97f9-8f71bfa576f4` |
| ROB-209 | `b4961fee-ef80-4f07-ae8f-d96d7d8fe88a` |
| ROB-211 | `485b257f-5e63-4158-afb9-2c9eaa326c71` |
