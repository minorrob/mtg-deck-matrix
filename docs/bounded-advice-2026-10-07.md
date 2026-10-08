# Bounded advice preparation, October 7, 2026

`codex/bounded-advice` follows D2 PR #671 at `6eec6348`. This is a preparation-only
contract for the third production pillar, not an enabled AI feature.

`cloud/advice-contract.mjs` prepares bounded inputs for deck summaries,
recommendations, live guidance and post-game critique. Its SHA-256 cache key
includes the account, subject, revision, policy version and every supplied fact,
card and offered option. Cosmetic card/fact row order does not invalidate it.
A daily batch planner coalesces duplicate and already-completed deck summaries.
It does not schedule that batch or call a provider.

The provider input is a strict whitelist: cards and quantities, bounded measured
or visible facts, deterministically eligible recommendation cards, and engine-
offered live options. Account identity scopes the cache but is not sent in that
input. No raw game state, owned lots, email or credential fields are copied.
The authorized server caller must supply seat-visible facts; this module cannot
make arbitrary client-supplied facts trustworthy or repair an unsafe projection.

Accepted findings must cite supplied evidence IDs and known card IDs. A live
suggestion must be one of the current offered option IDs. Acceptance requires a
fresh current snapshot with the same cache key; a changed revision, decision,
measurement, owner, policy or deck rejects the result. Output has a closed shape,
immutable evidence references and the label **AI interpretation**. Unknown fields
such as `apply` are rejected. No returned suggestion executes an engine action or
edits the library.

These checks establish provenance and scope, not semantic truth. Generated prose
can still misinterpret valid evidence. Product integration must display its
citations and uncertainty and must never present recommendations as deterministic
rules or recorded events.

## Proof

- `node tests/advice-contract.mjs`: 45 checks; no provider calls or state writes.
- `NODE=<node22> python game/tools/batch/breaks.py tools/advice-contract-breaks.py`:
  all 10 deliberate faults caught from a green baseline, then restored.
- `node tests/data-integrity.mjs`, `node tests/feature-wiring.mjs`: pass.
- `node tests/release-pages.mjs`: 141 checks pass; the release profile remains gated.
- `node --experimental-sqlite tests/ai-door.mjs`: 45 existing route checks pass
  with an in-memory database, generated test Access keys and a fake provider.

The fault checks cover stale answers, cross-account/subject cache reuse, accidental
private-field forwarding, invented evidence/cards/options, output mutation fields,
repeated unchanged summaries and removal of the input byte limit.

## Enabling is still separate

There is no new Worker route, UI button, provider adapter, network request,
credential lookup, persistent write, scheduler or paid execution in this change.
No AI spend amount has been configured or approved. The proposed $5/month is
still only a proposal.

Before enabling the product paths: finish explicit monthly budget approval,
atomic budget reservations and conservative treatment of ambiguous provider
failures; verify provider/model pricing; wire trusted measurements and per-seat
projections; add cached-summary UI, responsive live fallback/cancellation and
citation-backed post-game display; test those paths through the real authorized
staging boundary. Existing `cloud/ai.mjs` remains closed by its existing Access,
allowlist, key and spend gates. Its rolling daily check-then-log caps are not proof
of a race-safe monthly budget, and its timeout wording is not evidence that a
provider incurred no cost. Those issues remain ahead of enablement.
