# ROB-205 engine contract

Rob confirmed on 2026-10-29 in the orchestrator chat: **Cancel reversible actions; keep committed mandatory choices
pending with clear guidance (preserves the gates).** There is no skip-mandatory house rule.

`CrankRoomView@1.decision.cancellation` is additive and private to the answering seat. Its schema is
`CrankDecisionCancel@1`, with `allowed`, and either a `reason` or a `kind` plus `returnsPriority`:

| kind | Meaning |
| --- | --- |
| `abandon-action` | Abandon only a proven uncommitted cast/activation target or cost proposal. Restore its original actor priority and pass count. |
| `choose-none` | Submit the legal empty selection for an optional index choice. The rest of the resolving effect/game step still runs. |
| `keep-targets` | Existing spell-copy Cancel semantics: keep the original legal targets and continue the copy's effect. |

Send the existing answer envelope (`actionId`, current `revision`, `choiceId`) with `kind: "cancel"`, or
`kind: "answer", cancel: true, indices: []`. IDs, revisions, retries, seat ownership and stale-input checks remain in
force. A refused mandatory Cancel leaves the question, state, RNG, tape and journal unchanged. Its reason retains
`Invalid selection` for existing readers and explains that the required choice must be completed.

The server creates `PrecommitProposal@1` only for ordinary priority actions. It records actor, original priority/pass
count and a normalized full-state fingerprint. The prefix must emit no events, mutate no other state, and have no
resolving effect or saved rule-operation frame. Every later target/cost stage rechecks that boundary. A reveal event
invalidates the proof even if no object moved; a silent native state mutation also fails the proof. No game snapshot
or rollback of committed information/resources is used. Answer-provided reversibility assertions are ignored.

Historical saved choices without this server proof are conservatively unavailable for abandoning an action. They
must be completed using their legal choices. There is no claimed migration of such live pending decisions. A source
change invalidates the proof; actual actor departure withdraws its proposal through the existing departure rules.
Neither old receipts nor stale Cancel requests resurrect actor/source cards. House-pilot choice options are unchanged;
Easy and Normal answer actual costs without selecting Cancel or entering retry loops.

The room clears a canceled proposal's queued auto-pass/held-priority/unfinished Undo bookkeeping before driving the
next decision, so `passAfterCast` cannot advance the actor out of the restored priority window. Cancellation is recorded
on the input tape and replays deterministically. It appends no game journal event and changes no existing history.

Proof commands: `node tests/engine-cancel-decision.mjs`, `node tests/room-cancel-decision.mjs`, and
`python game/tools/batch/breaks.py game/tools/batch/breaks-playtest-cancel.py`. UI controls remain with the UI owner;
this engine contract does not mark shared ROB-205 Done. ROB-209 priority proposals and committed native refinements are
documented separately in MODAL-CONTRACT.md and COMMITTED-MODAL-CONTRACT.md. A committed child uses
`kind: "close-refinement"`, `returnsPriority: false`: Cancel closes only its private selections and exposes the still-live
mandatory native question with guidance. It cannot undo costs, information, RNG or a committed effect prefix.
