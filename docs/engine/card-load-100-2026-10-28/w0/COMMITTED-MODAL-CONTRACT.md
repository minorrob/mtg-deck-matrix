# ROB-209 private refinement of a committed native question

This additive contract refines an already pending native trigger/effect question. The original engine awaiting frame
and main controller question remain live throughout private selections. It differs from the reversible priority
proposal in [MODAL-CONTRACT.md](MODAL-CONTRACT.md): the spell, ability, random roll or effect prefix may already be
committed. Rob's approved policy still applies: cancel reversible actions; keep committed mandatory choices pending
with clear guidance. No production UI is changed, and the shared issues remain In Progress.

## Entry and identity

Supported original choices advertise `refinementStages.schema: "CrankDecisionRefinement@1"`. A modal trigger advertises
this on its choice and options. An effect-cast option advertises its selected physical card and native action route.
Answer the original option with the ordinary answer envelope and `staged: true` to begin a private child. Selecting
that entry does not answer the native choice or lock the old option's modes/targets. Native optional decline stays an
independent original answer.

The child uses `stage: "modes"`, then `stage: "targets"`, then `stage: "confirm"`. Existing `mode: "one"` continues to
describe answer cardinality. `refinement` carries the transaction ID, original choice ID/signature, stage, kind,
`canBack` and `modeSelection`. The saved sidecar contains only identities, hashes and private selections; it contains
no old engine question, controller checkpoint, resolving script, payment frame or restore snapshot. Accepted tape
positions produce stable transaction IDs for partial replay.

Mode options contain detached `modeIndices`; `modeChoices` supplies printed labels/IDs and additional-cost facts.
`modeCardinality.allowedCounts` preserves disjoint native bounds, including Shadrix's zero-or-two sets. Target stages
carry mode instance/group IDs, detached target facts and typed card/player IDs. Choices filter complete live native
variants, preserving restrictions between groups and permitting repeated/shared targets only where those variants do.
Confirm identifies the exact selected native variant rather than substituting its first index.

## Native commitment and cancellation

Child inputs change only private references, receipt caches and the accepted-input revision/tape. The original main
controller `pending` and `answered` records remain byte-identical. The complete engine state, RNG, journal and history
remain unchanged. Read-only `check` validates a cloned selection without consuming an input.

Cancel closes only the child. Its `CrankDecisionCancel@1` metadata has `kind: "close-refinement"` and
`returnsPriority: false`. The original native choice stays pending with guidance explaining that it must be completed.
No committed instruction, target question, activation payment or native random roll is skipped or rolled back. Back
edits private selections only. A native random mode must be rolled by its original handler first; a post-roll child
has locked modes and cannot Back across that commitment. Copies retain inherited modes and use their original native
retargeting path rather than a fresh private mode chooser.

Final confirmation revalidates the full current original question and native variant, then consumes the original
controller question once and invokes the existing native answer handler with its original `choiceId`. It does not
call the priority action/cast path. Further native payment/target continuations remain native choices; committed
funding is never made reversible by the child.

## Freshness, persistence and privacy

Every child view, answer and reload revalidates the original identity/signature and native context. Saved trigger
scripts and last known information support an actual Ao after its source has died; live-source existence is not a
condition for completing that mandatory trigger. Actor/target departure discards stale private references. Reopening
uses the current native question and never writes back an old saved question or revives a departed object/player.

Private children appear only to their answering seat. Fixed-cursor watcher and opponent views retain their original
content apart from the public revision. Returned arrays/target objects cannot mutate live native choices. Original
native pending/answered records, private selections and receipt ownership persist independently through JSON reload.

Accepted retry lookup runs before current child generation, expiry or later-seat ownership checks. The same action ID
and full payload returns its original receipt without another revision or native answer. A different payload or a
different actor is refused. The persistent controller cache preserves this behavior beyond the room's 256-receipt
window; it retains the existing 1,024-entry bound. Rejected stale/wrong-child/forged-Back answers change no state,
receipt or revision. An unaccepted expired child ID cannot answer a later original question.

An initial native effect-play question also needs the owner's authoritative generation refresh when external facts
change. Child-only expiry is insufficient: a refreshed original must both remove illegal cached targets and include
newly legal native variants. This dependency is being integrated separately with W5. No complete freshness or
publication claim is made until the joint native/controller lifecycle and stale-generation proofs pass.

Current live starts record `effectPlayVersion: 1` in both pod and engine state. The live room/table entry points force
this value rather than accepting a client opt-out. Native origin/generation behavior is independent of the older
`sourceChoices` flag. Trusted tape replay uses the original saved epoch; absence preserves the historical state shape
and native IDs, without adding a zero-valued field and changing the state hash. A captured 17-input pre-version
Scepter/Boros tape already has `sourceChoices: true` and the actual native ID `play:0:5`; its complete state/journal
hashes are fixed in `tests/fixtures/effect-play-legacy-tape.json`. This is historical compatibility, not acceptance or
migration of old live matches. Current canonical scenarios and operational runs must use the current epoch.

## Evidence and remaining routes

Focused native fixtures use actual saved definitions: departed Ao; Shadrix's combined/distinct-player choices and
optional decline; Scepter/Boros Charm; actual Magus Sisters random rolls; Reverberate and Return the Favor copies.
Room fixtures reach these questions through actual game actions, preserving payments, prefix events, original
handlers, reload, replay and privacy. Repeated fixture decks are bounded regression evidence, not Commander-load
G-3/G-5 acceptance. Exact counts and mutation receipts are recorded in PLAYTEST-PROGRESS.md at publication.

Counted targets continue through their existing native target questions. This sidecar does not invent counted-target
enumerations, free-spree funding, copy modes or unavailable native actions. Effect-paid additional-cost continuations
belong to W5, transformed Battle casts to W1, and UI consumption to its owner. Root owns integration/main/full
acceptance. No cards are added or promoted and no original gate, reader assertion or mutation union is removed.
