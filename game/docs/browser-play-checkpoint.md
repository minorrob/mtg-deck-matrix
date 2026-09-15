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

## Per-seat playmats — 2026-09-15

Game Setup now offers a thumbnail picker for each current seat: the seven newly supplied images, the original Runic cube, Classic black, and Random. Preferences persist locally; AI seats default to Random and the human defaults to Runic cube. The prepared pod retains the selected and resolved mat IDs. Cosmetic random selection uses an independent deterministic hash, not the engine RNG. The public view includes only seat appearance metadata, with no additional opponent deck information.

Artwork-specific CSS aligns the printed zones, especially Golden Lotus. Spirit Warrior receives app-drawn zone boundaries. Focus uses a subdued version of the selected image behind its grouped cards. Changing a mat can update the browser appearance without moving cards or changing rules state. Invited humans will choose their own mat after claiming their seat in the later multiplayer phase.

Validation: eight illustrated assets return successfully; Random is stable for a given match and seat; preparation preserves the explicit mat, resolves Random, and keeps all decks at 100 cards. Browser checks covered thumbnail rendering, selection persistence, and the Golden Lotus board/pile layout. Seven existing tests pass. The previous smoke match was unavailable after the local server reload, so the review page is at Setup; its logs remain preserved.

## Page canvas, board proportions and deck filters — 2026-09-15

Setup now occupies normal document flow. The embedded companion reports its content height to the same-origin CrankMagic shell so the outer page scrolls; Setup no longer has an independent scrolling dialog. Prepare decks and Launch game sit in the top-right heading. The active table can still be resumed without launching another match.

On wide screens, opponent mats stack on the left and the human mat dominates the right, with the hand below and shared life manager beside it. Each illustrated mat keeps its source-image aspect ratio. The shell supplies available viewport height separately from content height to size the main mat without a resize feedback loop. Narrow screens show the human mat and hand first, followed by the counter and opponent thumbnails. Empty mat space and Focus board open the grouped full-viewport view; card buttons retain inspection and legal engine actions. Closing nested card/pile dialogs preserves the focused board underneath.

Your deck now reuses CrankMagic's classifier and facet definitions: card type, mana sources, color identity, mechanic/keyword, roles, tribes, causes, triggers, produces/requires, multipliers, grants/extends, rarity, subtype, mana-value bounds and maximum price. Filters combine and count physical copies. These are starting-deck ability classifications, not evidence a mechanic fired or knowledge of library order. Only public card facts and the human's saved mechanics are joined; historical graph ownership flags are not copied. If public facts fail to load, saved mechanics remain usable and the UI identifies incomplete price/mana-value coverage.

Validation: resumed the user's running match without restarting the host; Setup overflow is visible and frame height matches its document content. Mat dimensions retain image proportions. Combined Mana rock and Sol Ring filters returned ten and then one card; an absent name returned zero, Clear filters restored 100, and an end-step trigger filter narrowed results. Syntax checks and the seven existing Node tests pass. This presentation change does not expand the rules-engine or multiplayer boundaries above.

## Direct play, phase cues and Tracker — 2026-09-15

The active player is named above the table and their seat is outlined. Only that mat highlights its current Untap / Upkeep / Draw / Main / Combat / End step. Human priority during an AI turn is labeled as an opportunity to respond. Continue passes priority through the rules engine; it never jumps past responses, triggers or combat decisions. A starting-player choice is explicitly labeled Start with, and generic player-target buttons are absent during normal priority.

Hand cards use a card-owned drag payload, with native image dragging disabled. Polling does not replace card DOM while dragging or resizing. Land drops outside the human main phase give a visible explanation. A drop followed by exactly one engine-offered ability accepts that ability without another confirmation; multiple abilities remain explicit buttons. A rejected card selection now produces an engine error instead of silently doing nothing. Right-click opens card actions. Inspection is dismissible by clicking anywhere inside it.

Focus uses the same mat renderer and zone placements as the table. Its board zoom retains proportions. The human board has a bottom-right resize handle, arrow-key adjustments and double-click reset; the preference is local. Cards scale with mat container width.

Card Info and Tracker share the side pane. Tracker exposes current permanent rules, recorded public-source lands/stack entries/taps/counter additions, per-card activity, recent events, saved review notes and JSON export. New journals distinguish spells, activated abilities and triggered stack entries. Human proliferate target selection is supported in-browser and recorded as a completed selection; it is not presented as an exact count of counters placed or successful resolutions. Opponent proliferate counts and older missing instrumentation remain unknown. Loop detection, causal attribution, missed-trigger accounting, and exact mana-payment efficiency are still open. The summary deliberately excludes private draws, library order and raw journal payloads.

**Lifecycle incident:** reloading the original host terminated its child Java process in this Windows tool session, despite validating bridge reconnection beforehand. The original journal at `game/.local/games/2026-09-15T04-13-53-910Z` survives; the engine position did not. The table was launched anew with the same decks. `COMMANDER_RESUME` can reconnect to a surviving engine, but is not a persistence guarantee. Do not restart a host during a match. True independent process supervision and durable engine checkpoints remain required.

Validation includes ten Node tests, including hidden-source exclusion, separate event classification and unknown instrumentation behavior, plus successful compilation against the pinned Java/Forge runtime.

## Blue HUD, compact actions, History and manual draw — 2026-09-15

The later visual direction replaces the shared four-seat life overlay with a life/poison/commander-damage display in each seat heading. The illustrated mats remain. Blue outlines identify the active seat, selected cards and legal target selections. Hand and battlefield cards are larger. The opponent column spans both board and hand rows, so it cannot push the human hand below the table. Desktop always shows the side pane; an older mat stylesheet had hidden it.

Interaction options considered: a card-anchored menu, a persistent action dock, and immediate one-click activation. The implementation combines the compact anchored menu with the dock: selecting or right-clicking an owned card opens a small, non-blocking menu; Play land / Cast / Use ability submits a normal engine action. Multiple engine-offered abilities appear as direct buttons, with a card image in the action area. A sole browser-selected ability follows Forge's normal fast path. On desktop the action area sits above the side-pane tabs; Focus and narrow layouts keep it by the hand. Inspect opens the large dismissible card view. This is not an arbitrary tap/untap toggle; actual abilities pay their costs, and the engine governs untap effects and Undo. Cost-specific disabling and complete browser handling of all payment/target decisions remain follow-up work.

History is a visible tab, selected initially, with shortcuts from the table header and Focus header. It shows up to 80 recent sanitized events: phase notifications, life changes, public-source plays, stack activity, resolution, taps and counter additions. Tracker retains cumulative observed source counts. No raw journal, private draw identity, hidden library order, or private choice description is exposed. These are recorded event counts, not net statistics after Undo; mana abilities that bypass the stack are not counted as stacked activations. Comprehensive causal chains, loop counts, undo reconciliation, full-history pagination and missing-mechanic instrumentation are still required for measured deck reports.

The adapter pauses synchronously at the human Draw phase event, after phase replacement handling and before Forge's normal turn-based draw. Double-clicking the library (or keyboard-accessible Draw card button) answers a unique pending choice. It does not move a card itself. Forge performs its normal draw, replacements, triggers and loss checks afterward. Two-player first-turn draw skipping follows the pinned PhaseHandler condition. Extra draws from card effects continue through the engine. Duplicate or stale answers are rejected by the existing choice/revision/idempotency checks.

Verification in fresh match `game/.local/games/2026-09-15T05-13-54-393Z`:

- Rob was the only human; Krenko, Atraxa and Shadrix completed their opening turns as native AI.
- Rob's Draw phase paused at seven hand cards / 92 library cards. Library double-click produced eight / 91; a second double-click produced no extra draw.
- Dragging Karn's Bastion onto Lands played it directly, leaving seven in hand and an untapped land on the battlefield. History recorded Land played.
- The card menu offered Use ability; the engine offered its mana and proliferate abilities. Choosing `{T}: Add {C}` tapped the land, added one colorless mana and recorded a tap. Engine Undo restored the untapped card and empty mana pool.
- History opened from Focus and showed the land/tap plus the opponent's Thornwood Falls trigger, resolution and life gain. Tracker showed one land and one recorded tap, with current board rules.
- Card-image click dismissed inspection while preserving Focus. Corner dragging changed the main board from 675 to 764 pixels wide with preserved proportions; keyboard resizing and reset also worked.
- Desktop layout at 1440×900 showed the action dock and History alongside all four mats. Eleven Node tests passed, Java compiled against the pinned jar, and browser startup had no console errors.

The earlier host and Java process were already unavailable when this validation resumed. Saved journals remain, but live positions are not durable checkpoints. A fresh match was necessary; host process supervision remains a hardening requirement.
