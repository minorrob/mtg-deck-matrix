# CrankMagic Online: browser play checkpoint

## User flow

Open /app/#game in the local CrankMagic shell. Play defaults to Game Setup; the sidebar starts collapsed and can be reopened. Prepare a two-, three-, or four-seat pod, review decks and native AI limitations, then start. The live table contains only participating seats, a central life manager, each player’s public piles, and the human hand with left/right arrows. Focus fills the browser viewport and has a clear close button. Return through Game Setup to resume an active match.

The deck editor remains CrankMagic. “Use this deck” creates a resolved immutable game snapshot; subsequent edits apply to the next match. The local browser’s saved library is separate from the GitHub Pages origin. It is not silently copied or overwritten. A nonce-bound popup handoff is implemented for the hosted app but is not deployed or end-to-end verified from production.

## Implementation boundary

This is a local solo browser bridge backed by pinned Forge, with a native GUI fallback. Browser controls cover engine buttons, legal card selections, ordinary single/multiple choices, integer choices, acknowledgements and player selections. Dragging onto the human mat invokes a rules action, not an arbitrary zone move. Card images, grouped focus, dice for counters, and mana gems are rendered from observed state.

Complex ordering, damage assignment, generic amount distribution and some selection dialogs still require the Forge window. Full stack presentation, a complete abilities menu with cost previews, proven optimal auto-payment, attachment-aware rendering, token/alternate-face artwork, and complete causal chain/loop telemetry remain hardening work. API pilots/key entry and remote human seats are not implemented. Native AI profiles work; API difficulty is a saved future setting.

## Local security and lifecycle

The Node host binds 127.0.0.1:8768. Mutating requests require exact Host, Origin and a per-process session token. Static /app assets come from an explicit tracked-file allowlist. Private logs, game snapshots and Java bridge credentials are not static routes. Java binds an ephemeral loopback port and requires a private token; the browser receives the human projection and human starting deck, not AI hands/library order. Actions include revision and idempotency IDs. An accepted receipt means queued/submitted, not proof a spell resolved.

The final adapter additionally rechecks a queued action before execution and serializes outstanding actions. It is compiled for subsequent launches; the live smoke match predates this final queue hardening. Restarting the Node process does not currently recover its running-child ownership. Keep the host running for the match; browser reloads can resume. This is not yet a multiplayer security certification.

## Verification

- Java adapter compiled against the pinned Forge jar.
- Seven Node setup/import/AI classification tests passed.
- The real local browser flow prepared Rob + Krenko + Atraxa + Shadrix, launched Forge, acknowledged AI warnings, displayed the opening hand and Keep/Mulligan, and accepted Keep.
- Passing AI turns reached Rob’s first main phase. Dragging Thornwood Falls from hand opened the legal land-play choice; confirmation moved it to the battlefield tapped and reduced the hand count. Its life-gain trigger resolved, updating the human life counter to 41.
- The browser projection exposed seven human hand cards, no opponent hand identities, and no library order in this state. Broader hidden-information cases remain a gate.
- Wrong Origin, wrong token, and stale revision requests were rejected without changing the match.
- One AI Commander selector was verified with Random and explicit choices; returning to an explicit commander restored matching deck lists.
- Full-viewport Focus and its close button were verified in the CrankMagic iframe.
- Two-/three-seat CSS is implemented; full live matches at those sizes have not yet been exercised in this checkpoint.

## Friends phase, after solo hardening

Host creates a lobby and reserves human seats. Each seat gets an opaque, expiring, single-use invite link represented as a QR code. Scanning redeems the invite atomically for a seat session; reconnect uses that session, not the original QR. The QR is a bearer credential, not an additional security factor. Allow revocation and host approval before match start. Never include an API key in it.

A remote deployment needs HTTPS/WSS, a reachable authoritative rules host, per-seat private projections and sessions, persistent event/checkpoint storage, reconnect handling, room isolation, quotas/timeouts, and private host-held API credentials. GitHub Pages alone cannot run the match service. Initial capacity target remains 4 CPU cores / 8 GB RAM / 20 GB SSD for a small personal host, to be validated by measurement. Human CSV ingestion and full mechanic resolution precede readiness; AI seats can fill remaining slots. See ../../docs/commander-controls-and-hosting.md for the infrastructure scope.

### Seat ownership and commander selection

Each AI seat has one Commander dropdown containing Random and explicit commanders. The host chooses this. A human chooses their own deck; the commander is derived from that deck. Invited human seats must show only invitation/readiness status to the host until the friend claims the seat and chooses or imports a deck. The host must not receive an AI-style commander selector for a reserved human seat. Remote claiming remains phase C8.
