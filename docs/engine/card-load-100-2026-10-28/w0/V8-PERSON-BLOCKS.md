# Simulated-person joint blocker drafts

The strict pool seed1 on published0130f853 was NOT CLEAN: its simulated person submitted a lone block against
Gallia's Menace, received a native refusal and retried. Its entire exercise ledger remained zero. That historical
result is retained; no refusal is ignored, reclassified or removed from it.

The simulated person previously sampled individually offered block pairs as though every set were legal. It now
checks the complete proposed declaration through the existing public, read-only `room.check` before sending an
action, as a board drafts before Confirm. The check uses the actual waiting actor and exact question ID; no hidden
state is supplied to the sampler. Illegal private drafts consume the seeded sampler's next candidate and are counted
separately as `blockDraftsRejected`. The accepted candidate is submitted unchanged. This does not alter human UI,
native rules, canonical scenario choices, actual submitted refusal counts or strict verdict.

The sampler makes at most the existing `PERSON_TRIES`50 draft attempts. Exhaustion or a stale question fails the
game explicitly; neither submits a known illegal fallback nor obtains clean-game credit. The current real-room
producer always supplies this check. A custom injected answerer can still submit a bad answer, which remains a real
game failure. The ordinary refusal/retry path and fatal strict policy are unchanged.

`node tests/fuzz-person-blocks.mjs` passes1189 checks over96 seeded native declarations, including required Menace
blocks. The tests check every candidate without changing native state, require the final set to be legal and submit
that set through native blocker resolution, compare its actual assigned blockers, and reproduce the same answer
from the same seed. Legal nonempty/two-block declarations are reached. Stale and exhausted drafts fail explicitly.
A bounded real-room fixture checks actual actor/question binding, finishes and replays identically without leaks.
A deliberately submitted invalid envelope remains an exception/no-game result. Existing strict refusal checks remain
fatal. The initial fixture expected this malformed envelope to be a422 retry; actual room validation correctly gives
409 before submission. The final test preserves that actual failure rather than changing the room/refusal policy.

The mutation baseline retains all original readers from `breaks-fuzz-library.py` and
`breaks-load100-w0-v8-verify.py`, plus the new native draft reader and existing room check: six suites in total.
`python game/tools/batch/breaks.py game/tools/batch/breaks-fuzz-person-blocks.py` passes every unbroken reader and
catches all eight probes, `missed: []`. They cover skipped/ignored checks, stale question, illegal exhaustion fallback,
missing producer wiring, retagged stale IDs, the wrong actor and actual strict refusal policy. Source backups restore;
existing mutation specs/unions are unchanged. Direct focused readers also pass pool91 and room-block-check34.

The new clean-source368a9aad pool seed1 finishes in35 turns/73 decisions with zero actual submitted refusals,
one rejected private draft, identical replay and zero leaks across74 checks. The table's existing end policy ends
when its human is eliminated; the remaining AI seats are not a winner claim. The source-bound diagnostic observes
47 played/resolved loaded cards and20 printed abilities, with no newly completed card or final-runtime gate credit.
The original dirty game remains zero. The full ledger is hashed, privacy-scanned and compressed with verified
roundtrip; `evidence/pool-368a-seed1.json` binds the source/tree, command, actual result and ledger hashes.

No whole-game/G-5 credit is claimed by unit fixtures, by the historical dirty game or by a different runtime's game.
The200 pool/50 library/two25 staging runs, all-card exercise, full strict ledger and remaining wave0 gates stay open.
Full generators remains blocked at the separately recorded Scryfall search permission; no check is waived.
