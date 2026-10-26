# Incoming integration and release queue

Rob's direct October26 instruction in the authorized coordination chat assigns OpenAI the merges and
staging/production operations; Claude supplies source handoffs. The coordinator verified that human
message through read_thread. No release responsibility is delegated back to Claude.

## Release order

1. Finish PR #890's existing native gates, exact-head scan and full CI, merge main, then release and
   verify r4 staging. New incoming work does not expand this first candidate or postpone its first merge.
2. Review the four incoming PRs against that proven r4 base. Preserve their authorship/history and the
   newer board/Coach/toolbar/fan/access/cache fixes. Reconcile #893's access groups with the feedback owner
   gate explicitly; the feedback dependency order is #895, then #896, then #897.
3. Gate the integrated incoming candidate, migrate/configure only the applicable staging resources,
   validate deployment/live behavior and prepare the production candidate under Rob's release instructions.
   OpenAI retains production execution. Ownership alone is not a green build or a claim of live acceptance.

## Submitted heads and scope

These are coordination observations, not acceptance. Read-only reviewers must verify current heads,
subsequent handoff updates/comments and exact-head checks before mutation or merge.

| PR | Observed head/base | Scope and handoff | Known seam/limit |
| --- | --- | --- | --- |
| [#893](https://github.com/minorrob/mtg-deck-matrix/pull/893) | aafd2ee13d9575348881538aedc4726ce192896b; main | AI plans, access groups, threat model, left-over-right hand fan. docs/handoff-ai-players-2026-10-26.md. | Draft/conflicts reported. Preserve newer hand/board work. OWNER_EMAIL live configuration and Workshop access-group UI are unproven/incomplete; this is the submitted PR1/PR6 slice, not all plan packets. |
| [#895](https://github.com/minorrob/mtg-deck-matrix/pull/895) | 86f1f2657f7ab3d024570ce5dc77bafdef7201e1; main | Feedback schema/store/routes and release-builder import closure. docs/feedback-loop/CrankFeedback.md. | Migration0009 with0007/0008 reserved. Initial owner gate uses INVITE_ADMIN_ID; reconcile with #893. Screenshot storage awaits R2. Live migration/Access agent are unproven. |
| [#896](https://github.com/minorrob/mtg-deck-matrix/pull/896) | 85a12f42db47e849bc63a7729299f20a8373e1ad; #895 branch | Feedback control/sheet; shared app/decks/CSS/pages/SW and board/stage/table-board overlap. | Preserve current accessibility/native controls and held() public context. Screen-picker, phone sheet and real Worker round trip retain handoff limits. Read later proof comments. |
| [#897](https://github.com/minorrob/mtg-deck-matrix/pull/897) | a8e558fc99f16f846ac52d3a128d53326c454943; #896 branch | Triage/workflow/handoff, docs/handoff-feedback-loop-2026-10-26.md. | Earlier8f1c2575 is superseded. First live triage writes Linear issues and is unproven. Review bounded untrusted-input behavior and idempotency before activation. |

## Validation and configuration boundaries

Reported current Actions runs are #895/40418687834, #896/40420725479 and #897/40421027179, all in progress
at handoff. A skipped job or earlier-head result is not green. Do not duplicate their whole-suite runs;
record final results at the current heads and rerun required combined gates after integration as needed.

Claude reports a chain of table-board, accessibility comparison and five board mutation breaks, with
some final handoff lines still awaiting results. Temporary mutation edits in Claude's own worktree are
not deliverable source. Accept only committed/restored source and completed proof; do not reset/stash
an active mutation workspace or infer it is this canonical checkout.

Feedback prerequisites reported by Claude: ANTHROPIC_API_KEY, LINEAR_API_KEY,
FEEDBACK_AGENT_CLIENT_ID/SECRET repository secrets, FEEDBACK_API variable, a dedicated Access Service
Auth application and FEEDBACK_AGENT_AUD in staging. Inspect presence only; never print/write secret
values. No live triage, provider call or issue creation is authorized merely by a source test claim.
Keep feedback untrusted and constrain its actions to the reviewed workflow contract.

The read-only Engine/Workshop reviews are separate from the current r4 serial browser queue. They make
no canonical/index changes, run no duplicate full gate and do not activate the workflow or release.
