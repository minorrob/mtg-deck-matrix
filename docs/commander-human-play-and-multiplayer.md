# Human interaction hardening and mixed-player Commander

Status: accepted product direction; interaction work belongs to solo hardening, multiplayer is a later phase. This extends the [Commander plan](commander-simulator-plan-2026-09-15.md), not a replacement engine or another deck editor.

The [controls, mechanics evidence, and hosting specification](commander-controls-and-hosting.md) adds Rob's requested dice/gems, legal ability menus, automatic mana payment with human choices, and concrete LAN/private-remote/browser-only hosting options. Internet hosting is now scoped as an optional later C8 deployment, rather than enabled in the current local server.

## 1. Finish Rob's game first: C2–C7

### Table and Focus

- Desktop overview: four smaller playmats on one screen, plus the human hand. A shared phone-style life counter sits at the center, overlapping decorative mat edges rather than covering cards or pile controls. Each mat retains its own Command, Library, Graveyard, and Exile piles, with readable counts and identifiable top public cards. Four upright mats cannot all put their literal top-right corners at the center; prioritize a centered counter and accessible piles over rotating text upside down.
- Focus: the selected board fills the window, with an always-visible close/Return to table button, card zoom, grouped battlefield, zone piles, and access to your hand. Inspection and public-pile galleries close back to the same view and scroll position.
- Your hand: left/right arrows on both overview and Focus, keyboard and touch scrolling, clear disabled boundaries, and readable cards. Inspecting an opponent never switches the displayed hand to theirs.
- Your deck: show the physical library pile with its current count and card back. A separate starting-deck browser shows the saved hundred, clearly distinguished from the remaining library. Never reveal shuffled order or an unrevealed top card. Graveyard and exile are distinct zones, including face-down exile where required.
- On a small phone, preserve legible cards and use scrolling / Focus rather than shrinking four boards to unreadable thumbnails. The one-screen overview acceptance sizes are 1366×768 and 1920×1080.

### Drag-to-play is a rules action

Required before declaring the solo game playable. The present preview is a recording and accepts no game-state commands; dragging must not simply move a replay card between arrays.

1. A human drags one identified card from their hand onto their own battlefield, in overview or Focus. Pointer/touch handling and a keyboard **Play** action invoke the same command flow. Card inspection remains available without starting a drag.
2. The UI requests legal play options for that card, seat, and current engine revision. A land requests a land play; a spell requests a cast and enters the stack. Instants and sorceries do not appear as battlefield permanents. Some cards may need a face, mode, alternate cost, or other play choice.
3. Only valid destinations highlight. The engine checks priority, timing, permission, land limits, costs, targets, and restrictions. Owning the active turn alone is not permission to act; opponents may have priority or a required choice.
4. Present all required choices, including X, modes, targets, divisions, alternate/additional costs, and payment. Payment preview identifies the resources to spend; cancelling before commitment leaves state unchanged. A waiting card outline may indicate the proposed action, but must not look like a resolved permanent.
5. Submit an action ID, controlled seat, expected revision, decision ID, and chosen legal options. The host validates, commits once, emits events, and returns the resulting permitted state. Repeated delivery returns the existing receipt. Stale choices are rejected and refreshed without paying twice.
6. Resolve through ordinary priority / responses and engine effects. Only engine-confirmed zone changes animate the card to the battlefield, graveyard, exile, or other destination. Dragging directly to Graveyard or Exile is not arbitrary discard/exile permission; it must answer a current legal choice. Any later manual correction tool is a separately labeled assisted-game feature with telemetry.
7. Log attempted action, rejection reason or acceptance receipt, source card/ability, costs, targets, stack object, resolution, replacements, and resulting zone changes. Keep uncommitted UI gestures separate from measured game events.

Acceptance scenarios: legal land; second-land rejection; summon at wrong timing; instant during an opponent's turn with priority; unavailable mana; additional cost; modal / X spell; target invalidated before resolution; cancel; countered permanent; commander replacement; failed network retry; drag during another decision; touch and keyboard equivalents; recovery with a pending choice. Confirm exact zone conservation, one payment, and no optimistic fake resolution in every applicable case.

### Current implementation boundary

The local replay now supplies hand arrows, visual piles in all four mats and in Focus, a starting-deck browser, large card inspection, and a compact desktop overview. Real drag-to-play remains blocked on the live decision bridge and its C0–C2 correctness gates. It is a prerequisite for solo hardening, not deferred to multiplayer. The visual controls do not establish that a human can play a legal match yet.

## 2. Next phase: C8 mixed human / AI pod

Start only after C7's personal-release gate: Rob can finish, save/recover, analyze, refine, and replay a full legal game with the intended AI seats. Multiplayer must reuse those exact engine, command, deck snapshot, and event contracts.

### Experience

1. Host chooses **Play with friends** and creates a four-seat lobby. Host occupies a human seat; each remaining seat is Human or AI. Support 2 humans + 2 AI, 3 + 1, and 4 + 0, alongside the existing 1 + 3 mode. Each AI retains its own Difficulty 1–5 and provider/fallback policy.
2. Human guests join from separate browser sessions/devices using an expiring invitation and claim an available seat. First delivery targets a trusted local network; internet joining / hosted relay is a separate follow-up. There is no paid account or public matchmaking requirement.
3. Each human uploads the requested deck CSV to the host, reviews resolved artwork, quantities, commander(s), legality, and engine support, and readies that exact snapshot. The host chooses the lists for AI seats. Editing a deck revokes ready state; no deck changes are accepted after match start.
4. Every player sees all public mats and the central counter, but only their own hand. Focus, hand arrows, drag-to-play, and choice prompts work identically to solo play. Public priority / waiting indicators identify who must act without exposing private options.
5. Host starts when all seats are ready. Saved games retain seats, deck hashes, policy versions, RNG state / journal, pending choices, and pilot assignments. After a game, each human can export the permitted report for their own deck and refine a new version.

## 3. Two-column CSV deck import

Implement the exact user-requested file dialect, described as a **Moxfield two-column deck export** in the UI. Do not assume every native Moxfield export has this shape. A broader Moxfield format adapter can follow when a real alternative sample is supplied; no Moxfield login, scraping, or API integration is required for this file flow.

### Supported contract

- UTF-8, optional BOM, LF or CRLF. CSV quoting must handle commas and doubled quotes in names. Parse with a real CSV parser and preserve physical blank records outside quoted fields.
- Preferred header: `Name,Count`; accept recognized `Card Name,Count` and header-based reversed `Count,Name`. Headerless files mean name first, count second. Show column mapping in the import review instead of silently guessing an ambiguous file.
- The first block is the main deck. One or more truly blank records separate it from the commander block. Blank lines at the end are ignored. Empty separator records may have two empty cells. An unexpected third nonempty block is an error, not a sideboard automatically added to the game.
- One commander: main-deck quantities sum to 99 and commander quantity is 1. Legal two-commander configurations: 98 + 2, each commander quantity 1, with the engine validating pairing. Never infer the commander from the last nonblank line when the separator is missing; request an explicit correction/selection in review.
- Quantities are positive integers with bounded totals; reject negative, fractional, zero, nonnumeric, or excessive counts. Repeated identical names merge before legality checks, with a visible warning; never discard a row silently.
- Resolve names to canonical card identity and current supported faces, then review ambiguities or unknowns. Validate the combined hundred, singleton exceptions, commander eligibility, color identity, selected rules/banned-list version, and engine support. Card name/count alone does not identify a printing: use the selected/default artwork and permit printing selection later.
- Reject malformed quoting, missing columns, extra unexpected columns, unsupported encoding, and oversized files with row-specific errors. Proposed bounds: 256 KiB and 1,000 parsed records. Treat all fields as data: no spreadsheet formula execution, markup rendering, path interpretation, or prompt instructions.
- Produce an immutable normalized snapshot through the existing deck contract, with source format, original-file hash, canonical card IDs/quantities, commander IDs, rules/support versions, and gameplay fingerprint. Both main deck and commander block contribute to the hash. Commander extraction happens before shuffling the main library.

Minimal parser fixture (a valid 100-card shape, not a deck recommendation):

```csv
Name,Count
Forest,98
Sol Ring,1

"Chulane, Teller of Tales",1
```

Import review must show **99 main + 1 commander = 100**, the resolved commander artwork, warnings, and whether the deck is ready. An invalid upload must leave the previously accepted seat deck intact. Raw uploaded files remain local to the host unless the uploader later chooses to export them.

Fixtures: quoted commander comma; BOM/CRLF; headerless and reversed headers; whitespace/blank separators; repeated names; 98+2 legal and illegal commander pairs; missing commander; invalid quantities; unknown / ambiguous name; malformed CSV; embedded hostile text; file-size limits; exact 100 accounting; immutable hash consistency; one guest cannot replace another seat's deck.

## 4. One authoritative host, private seat views

Use the existing local engine service as the match authority. Browser clients send action intents, never arbitrary board state. A WebSocket connection carries ordered view updates and action receipts; bounded HTTP endpoints handle lobby operations and file uploads. Version these protocols independently of UI releases.

- Session credentials bind to one match and seat. The server derives the seat from the session, checks current decision ownership and legal options, and rejects spoofed seats, stale revisions, and replayed action IDs. A browser cannot take a second seat by editing a request.
- Every client receives a separate engine-filtered view. Private hands, library order, unseen faces, and private decision options are removed on the server. Hiding them with CSS is insufficient. AI pilots receive the same seat-scoped information contract, plus their permitted memory.
- The current replay `/match.json` includes the complete pod and is **not** the multiplayer transport. Do not expose raw journals, full deck packs, RNG material, API prompts, or omniscient saved states through guest endpoints. A guest may inspect the list they uploaded; other full starting lists are shared only under an explicit table preference.
- Serialize commands at the engine boundary. Revisioned updates, acknowledgments, and idempotent action receipts handle simultaneous responses and ambiguous retries. Reconnect requests a fresh permitted snapshot plus subsequent events; hidden data stays filtered during recovery too.
- Human disconnect pauses at a required decision. Display the disconnected seat and preserve pending choices. AI takeover requires an explicit agreed action; record the controller transition. Never silently concede, auto-pass, discard, or spend a disconnected human's resources. Host failure resumes from the durable journal; live host migration is outside this phase.
- A trusted host process necessarily possesses the full game state; this design protects clients from accidental disclosure and unauthorized guest actions, not cheating by the machine's operator. State that limitation plainly for a personal friends-only game.
- Solo remains loopback-only. Enabling LAN play is an explicit host action with scoped interface binding, exact allowed origins, protected sessions, bounded uploads, and a supported encrypted connection setup. Do not disable browser security or automatically open public ports. Internet play is postponed until its transport and connection model is separately reviewed.
- AI keys stay in the host's credential store. Guests get no key or ability to change the host's provider/spending cap. Calls for AI seats share the configured match budget with per-seat accounting. The solo game must still work when networking is disabled.

## 5. Telemetry and website integration

Keep the same causal game events and deck-version linkage used by solo play. Add match mode `mixed_human_ai` / `human_only`, and per-seat controller history with Human/API AI/local fallback, difficulty/policy versions, disconnects, takeover, and resume events. Human-vs-AI and human-only results must not be mislabeled as automated simulation evidence.

Maintain separate private host journals and exportable per-seat/public reports. Opponents' unrevealed hands must not leak via tooltips, rejected-action details, logs, result bundles, or reconnect messages. Public play sequences still support analysis of cards played, mechanics, loops, mana, and interaction susceptibility. Every finding keeps exact snapshot and event provenance. Website import keeps mixed/human-only categories and historical deck versions distinct; future guest deck changes never overwrite Rob's library or collection.

## 6. Deliver C8 in reviewable steps

| Step | Deliverable | Exit check |
|---|---|---|
| C8.1 | CSV importer and review, mixed-seat lobby | All import fixtures; accepted deck unchanged on error; ready state binds to exact snapshot |
| C8.2 | Seat sessions and authoritative transport | Two isolated browsers complete a spell/response sequence; no guest can act for another seat |
| C8.3 | Mixed human/AI play | Full games with 2+2, 3+1, and 4+0; all decisions reachable; per-AI difficulty retained |
| C8.4 | Recovery, privacy, and reports | Drop/reconnect during targeting, payment, and resolution; no duplicate payment; hidden-state permutation tests; correct report classification |

Required privacy tests inspect network payloads, DOM, logs, and exports for two real isolated sessions, including after reconnect and elimination. Test a human responding during another player's turn and receiving a private choice during resolution. Run the solo regression suite before each C8 acceptance.

Defer accounts, public matchmaking, spectators with omniscient views, same-screen hot-seat privacy, public internet hosting, host migration, and in-match deck editing. Re-estimate C8 only after the solo bridge is stable; multiplayer is not included in the existing C0–C7 estimate.
