# ROB-26: direct blocking

Branch: `codex/play-direct-blocking`, based on main 17a1218c with #799 as the combat-display dependency.

Implementation in progress. Select a defending creature, select its legal attackers, inspect and correct the private draft, then explicitly confirm. Legal pairs come from the decision; whole-draft reasons come from the room's `check` socket frame. Keep the list fallback.

Proof pending: focused browser suite, stale response and reconnect checks, desktop and phone pointer reach, mutations, whole-game journey, asset pins, review and CI. No staging release requested yet.
