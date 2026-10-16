# Draft execution plan for the October 14 playtest feedback

Prepared October 15, 2026. Status: execution authorized by Rob, starting with staging-deck verification and commander casting. This plan follows the latest feedback and clarifications, superseding earlier UI decisions where they conflict. Completion and release evidence are recorded in docs/ACTIVE.md.

The intended experience is a readable mobile board, direct interaction with cards, fewer unnecessary confirmations, and a clear explanation of who must act and why. Preserve server authority, private hands, reconnect behavior, and replay compatibility throughout.

## Infrastructure assessment added October 15

Rob confirmed that Cloudflare Email Sending presents an upgrade requirement and asked for an assessment before additional purchases or major pivots. The restarted Cloudflare connector authenticates and reads staging Access and DNS; Email Sending still returns 2036. No paid upgrade, new email delivery, database migration, or infrastructure cutover was performed for this assessment.

The current [Product Pass catalog](https://www.lennysproductpass.com/) includes one year of Resend Transactional Pro, $300 of Supabase Pro credits, Railway Hobby, Runway Pro, Higgsfield Pro, Google AI Pro, ElevenLabs Creator, Customer.io Essentials, and PostHog. Treat published benefits as entitlements to verify in the user's accounts, not proof of activation or unlimited usage. Credits, redemption deadlines, and renewal costs matter.

Recommended immediate path: retain the current Cloudflare hosting and authoritative game rooms; put outbound delivery behind a provider adapter and use the included Resend benefit after verifying its activation and sender domain. [Resend supports Workers](https://resend.com/docs/send-with-cloudflare-workers). Its [published plans](https://resend.com/pricing) provide 50,000 emails per month on Pro ($20 per month after the benefit), or 3,000 per month/100 per day on Free. Invitations and share notifications can keep notifications@crankmagic.com, authenticated with the provider's DNS records. Preserve the outbox and add stable provider idempotency, bounded retries, and verified delivery/bounce handling. Sending an email and granting game access are separate operations.

[Cloudflare Email Sending](https://developers.cloudflare.com/email-service/platform/pricing/) needs Workers Paid to send to arbitrary recipients: 3,000 per month included, then $0.35 per 1,000. [Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/) has a $5 monthly minimum plus usage. This may still be justified by compute needs, independently of email; it does not purchase a faster rendering GPU or automatically make rules evaluation faster. No purchase is currently necessary just to obtain an outbound email provider.

For graphics, prototype Babylon.js behind the existing room-view contract. The current renderer draws a procedural Pixi surface and projects HTML cards over it; materials and assets are visibly unfinished. [Babylon](https://www.babylonjs.com/specifications/) supplies a 3D scene graph, cameras, lighting, materials, picking, animation, and WebGL/WebGPU support under an open-source license. Three.js is a credible alternative with a smaller rendering-library scope; Pixi remains appropriate for a primarily 2D treatment. The prototype should prove one textured table, four mats, rigid card meshes with independent card angle, one animated draw, card picking, and the existing HTML header/drawers. Use WebGL as a broadly available baseline, with WebGPU optional. Do not replace the deterministic Magic rules engine. A renderer does not supply polished assets: use Runway/Flow/Higgsfield for background candidates and a consistent material/lighting art direction, with a static/mobile fallback. Preserve the supplied video as an environment asset, separate from the interactive table.

Supabase is the strongest candidate for a later account/deck-service migration: [Auth](https://supabase.com/docs/guides/auth), relational Postgres, and [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) fit profiles, verified identity, invitations, Reviewer/Collaborator grants, and deck revisions. The current library snapshot store is useful for backups but broad snapshot decoding and rewriting is an expensive foundation for many collaborators. Normalize these records whichever database is chosen. Do not keep two writable sources of truth. Validate migration counts, exact six decks/partners, grants, stable account mappings, and rollback before any cutover. Keep Cloudflare Access for staging/admin protection while evaluating Supabase Auth for product accounts. [Supabase's default email service](https://supabase.com/docs/guides/auth/auth-smtp) is limited to team addresses and two messages per hour; it still needs a provider such as Resend for actual users.

Retain one authoritative match controller with ordered revisions, private seat projections, replay, and reconnect. [Durable Objects and WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) match this existing architecture. Supabase Realtime broadcasts/database notifications are useful for social features, but do not replace rules execution, priority serialization, or hidden-information enforcement. Railway is an alternative host for a persistent Node game service if measurements justify it, and a candidate for CPU-heavy background jobs; its plan is metered and not unlimited. Do not add it to the live move path without a concrete need.

Performance acceptance should distinguish browser frame time, asset/video decoding, network round trip, server action generation, persistence, and third-party AI latency. Benchmark crowded boards and complicated mana/trigger states, at median and p95, with a representative phone and desktop. Proposed rendering targets are 60 fps on the reference desktop and at least 30 fps on the reference phone; these are targets, not measured results. Separate animation from server state acceptance, cache card assets, bound texture sizes/device pixel ratio, and avoid re-creating the entire interactive board for each update. Use PostHog for non-sensitive funnel/performance events and Jam for reproducible reports; exclude hidden cards, private deck data, email fields, and tokens from analytics/replays.

Asset delivery can stay with Cloudflare static assets initially; [R2](https://developers.cloudflare.com/r2/pricing/) is a candidate as video/skin assets grow, with free internet egress and metered storage/operations. Supabase Storage is convenient for profile uploads; its bandwidth quotas still apply. A first-year credit is not a permanent cost advantage. Verify active quotas and the cost of separate staging/production projects before adopting another managed service.

Decision sequence: (1) verify Resend activation and sender DNS, (2) prove a Babylon rendering slice against the same recorded game view, (3) measure current server and client bottlenecks, (4) compare an isolated Supabase account/deck prototype with retaining D1, then choose the migration scope. Major renderer/auth/storage replacement is a recommendation for review, not an executed change.

## Confirmed decisions

- Mobile needs a layout and interaction redesign: buttons, overlays, menus, and card inspection must work without obstructing play.
- Mobile uses one fixed Focused view, without a view selector. Desktop Full/Table/Focus share header, modules, and collapsible drawers; non-Full views retain applicable drawer resizing. Camera exists in every view and contains desktop view switching; Tilt appears only in Full. Remove the former Screen View placement and migrate existing layout preferences safely.
- Select a spell, highlight mana sources, tap the desired sources, then explicitly confirm the cast. Auto-pay is an optional shortcut.
- The zoom slider should have ample headroom. Comfortable card reading while retaining most cards should fall around the middle to upper-middle; the maximum should be intentionally oversized. There is no 800 by 800 pixel target.
- Provide a separate card-angle control in Camera, allowing battlefield cards to stand above the tabletop while retaining natural perspective. Keep board tilt separate.
- Show the actionable response prompt centrally, make card inspection available from stack entries, and allow inspection of public cards on every visible mat without switching seats.
- Animate a confirmed draw from library to hand, and label the pending draw action Draw card.
- Prefer direct blocker selection and assignment on the board, with a shared combat display, provided complete legal choices remain available.
- No HTML UAT guide is needed. Continue screenshots with object IDs and use game feedback and records.
- Yield turn passes only the toggling player's priority for the current opponent's turn, preserving required choices. It expires at that turn's end.
- Commander availability includes feasible payments from untapped sources. Use the same payment interaction as hand spells, with a small tax badge at the commander's top-right.
- Replace the shared catalog with the exact six decks currently in Rob's **staging** profile. Verify D1's two partner commanders and D3 against those records before publication.
- Add Game Logs to the account menu on the main site and Play; complete the updated Play home/lobby.
- Table setup uses Human / AI seat types. Humans get an email field and Send; AI gets Easy / Normal / Claude.

## Findings from the current implementation

The deployed milestone comes from main da39a2ed, release bad37e87. Its multiplayer walkthrough passed 38 checks and its release walkthrough passed 22. The subsequent full regression run failed three suites: https://github.com/minorrob/mtg-deck-matrix/actions/runs/38663852137.

The accessibility walkthrough stopped waiting for the former .cm-full-rail element. Four intentional-break tests still refer to old tabletop code anchors. The generated data inventory is stale. These findings require repairing the checks and running them; they do not establish that the current board has no accessibility defects, and they do not diagnose the reported card behavior.

Automatic passing currently requires an empty stack: game/engine/rules/actions.mjs, nothingToDo/idle, explicitly rejects a nonempty stack. game/room/room.mjs also preserves end-turn confirmation, step-by-step preferences, and eligible mana undo. Extend the relevant policy deliberately rather than removing those protections globally.

The Draw a card action already exists in crankmagic-board.js. New tables omit drawBeat because an October 9 instruction requested automatic drawing; older matches retain their saved behavior. The latest request reverses that interaction for new games. Diagnose the reported phase-label timing as part of the change, and keep recorded games replayable under their original policy.

Combat projection already includes attackers, defending players, blockers, and stack targets. Reuse these IDs. The blocker decision already enumerates legal blocker/attacker pairs; a new board interface should submit the same validated decisions.

The previous shared catalog was sourced from the committed data/live-state.json snapshot and published D1–D7. Rob reports that these are outdated decks. A passing test against that snapshot proved consistency with the wrong source, not accuracy against his current account. Replace that acceptance criterion with authenticated staging-profile provenance and exact list comparisons.

game/engine/rules/commander.mjs already tracks commanderCasts by persistent commander identity. Inspect affordability and cast-action generation before changing tax logic. The file also documents incomplete command-zone replacement handling for certain non-effect moves; include these in the commander audit.

crankmagic-table.js routes Play without a table ID straight to newTable(). The newer Play home is still pending under R24 in REQUIREMENTS.md. Current invitation actions create a one-day seat link, not a delivered email. cloud/game-room.mjs already exposes a finished-game record endpoint; crankmagic-account.js builds the account menu. Reuse these paths and extend their contracts instead of building separate account or game-history stores.

## Rules boundaries

Untap has no priority; upkeep and the period after the normal draw do. The normal draw does not use the stack. Spell timing still applies. Passing permits only the top stack object to resolve after everyone passes; browsing another card cannot resolve it out of order. Generic costs and specifically colorless costs are different. Blockers are eligible creatures, not response spells; combat assignments must satisfy restrictions and requirements. These boundaries follow the [current Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt), especially 107.4, 117, 502–504, 509, and 601.

## Execution stories

### P01 Recover the reported game and establish the baseline

Locate the game played roughly 12 hours before this feedback, identify Luke’s seat and deck, and preserve the full game record with its source version. No matching export was found in Downloads or the repository game-log intake, and this session has no authenticated staging service credentials. A table link or exported game record is needed to identify the exact incident; do not guess the card.

Replay the relevant sequence and compare the card definition, selected modes/targets, resolution journal, hand count, and each player’s visible state. Distinguish a missing effect, a skipped separate trigger, a legitimate choice/replacement, and a UI update that hid a completed draw. Add a minimal reproduction for the specific cause, then verify both reported effects and reconnect/replay.

Repair the three known regression failures without deleting coverage. This story also records phone model, browser, orientation, and viewport when those become available. Work on other stories need not wait for the exact card identity.

### P02 Design the mobile interaction layout first

Create reviewable portrait and landscape prototypes before broad implementation. Use one persistent primary-action area showing whose action is needed, the current phase, and a plain-language action. Collapse secondary tools and the phase list. Let one utility drawer open at a time on narrow screens, preserving access to the hand and the current decision.

Use compact response prompts for passing; reserve obstructive dialogs for choices that truly require them. Tapping a card inspects it unless the UI is explicitly in casting, payment, targeting, or blocking mode. Provide an explicit action affordance so inspecting a card cannot accidentally cast or tap it. Touch inspection must not depend on hover.

Keep touch targets comfortably sized, focus visible, labels readable, safe-area insets respected, and the on-screen keyboard from covering confirmation buttons. Avoid competing nested scrolling. Optional decorative video may pause on small devices or reduced motion without losing game information.

Acceptance: review screenshots at representative phone portrait/landscape sizes and desktop widths; every main action works by touch and keyboard. A real phone game validates touch behavior that desktop emulation cannot prove. Screenshot objects receive stable feedback IDs.

### P03 Improve scale, card angle, and battlefield navigation

Audit Full, Table, and Focus separately. Ensure zoom visibly enlarges cards rather than increasing a surface that is immediately fitted back into its old dimensions. Calibrate the comfortable range near the slider’s middle to upper-middle and retain an oversized maximum, with panning and a Reset/Fit control. Keep card sizing and table zoom clearly distinguished and persist settings per view/device.

Add Card angle independently of board tilt, from lying flat to upright. Prototype upright cards before choosing the default. Anchor their bases to the mat and preserve card proportions, natural perspective, tapped orientation, counters, hover previews, and accurate hit areas.

Add bounded vertical/horizontal battlefield scrolling when content overflows. Scope wheel, touch, and keyboard scrolling to the area being used; keep the hand and surrounding controls stationary. Avoid a full-page scrollbar caused by an oversized mat. Add an adjustable play-area width in Focus/Table views where space permits. Distinguish touch scrolling from long-press card rearrangement.

Acceptance: all slider endpoints work in all three views; crowded mats remain reachable; no accidental actions during pan/scroll; reset and reload behave predictably. Test wide and short desktop screens plus both phone orientations.

### P04 Make priority and stack resolution understandable

Extend server-side automatic passing for a player who has no meaningful legal response while a stack object is pending. Start conservatively: do not infer availability from the hand alone or simply from untapped lands. Account for activated abilities, other playable zones, alternative costs, and mana-source sequences; uncertain cases must preserve the decision. Keep Hold priority, stop preferences, and end-turn confirmation. Do not expose private reasons for another player’s automatic pass.

Show a compact central prompt only when this player must act, with Respond and Let resolve/Pass controls and the relevant card name. Distinguish a priority response from an actual choice during resolution. Make those controls available beside the current top stack entry, using one underlying action so duplicate clicks cannot advance twice. Lower entries are inspectable and show that they are waiting; they never receive an actionable out-of-order Resolve control.

Hover or keyboard focus reveals the full public card; touch offers a dedicated inspection action. Inspection works on all public visible mats, including rear seats. Required response prompts remain visible even when Actions is assigned to a drawer; the drawer may mirror the decision without creating a second independent prompt.

Acceptance: four humans, no-response seats, a responder with a mana ability, a response from another zone, a newly added stack item, stale/double clicks, hold-priority, disconnect/rejoin, and a decision encountered during resolution. The log records automatic passes without overwhelming the player.

### P05 Restore clear draw and phase interactions

For new games, explicitly represent the pending normal draw in the server decision. While it is pending, the primary button says Draw card and clicking the library performs the same action. Once acknowledged, perform exactly one draw, animate the confirmed movement, and update the button according to the new state. The display must not imply that drawing happens when leaving an already completed draw step.

Allow all actions the engine reports as legal during upkeep and after drawing, including suitable cards just drawn. Show why another card is unavailable instead of silently suggesting all actions wait until Main 1. Honor the rules boundary above and preserve optional step stops.

The drawing player sees the card flip into their hand after the server confirms it; opponents see only the allowed public animation/count. Skip decorative movement for reduced motion. Reconnects and repeated messages must not replay draws or disclose identities. Cover extra draws, skipped draws, and draw replacement choices.

Acceptance: new-match draw policy, old-record replay, first-player two-person rule, multiplayer first draw, double click, reconnect, and an instant played after drawing before Main 1.

### P06 Replace mana combination lists with direct payment

The primary sequence is select spell, choose modes/targets and any necessary X value, highlight eligible mana sources, tap/select sources, display remaining cost, then Confirm cast. The spell remains visibly pending until the server accepts the completed cast. Display source choices and leftover mana without enumerating every equivalent color combination in a long menu.

Separate a reversible payment preview from committed game actions. Basic source selection may remain a draft until confirmation. If activating a source has choices or side effects, process it through the engine; Cancel must not promise to undo an already committed sacrifice, information reveal, or trigger. Revalidate the cost and targets at confirmation and handle stale revisions explicitly.

Auto-pay proposes a legal payment for review. Use existing pool mana where appropriate; reserve required colors; prefer basic lands for colored requirements, then other lands; prefer suitable colorless production for generic portions while avoiding unnecessary colored spending and overproduction. This is a preference order, not a guarantee that the least number of tapped sources is strategically best. Show exceptions rather than spending life or sacrificing valuable resources silently. An artifact is not assumed to produce colorless mana.

Acceptance: multicolor and filtering lands, mana rocks, restricted mana, variable costs, commander tax, cost increases/reductions, hybrid/alternative payments, excess mana, activated-source side effects, cancel, reconnect, and no double cast. Keep a compact advanced payment fallback until parity is proven.

### P07 Introduce the shared combat display and direct blocking

First display the existing authoritative combat state without replacing input: attacker thumbnails on the left under the header, arrows and the attacked player/permanent, then assigned blockers on the right. Group separate defenders clearly in multiplayer. Use an awaiting-blocks marker only for the unknown blocker assignment; the attacked player is already known. Collapse long combat groups into a scrollable strip on phones.

Then add direct assignment: highlight eligible defending creatures, select one, select the attacker thumbnail it will block, and show a draft connection. Allow reassignment/clear, multiple blockers where legal, and Confirm blocks. Other players receive confirmed assignments; they do not watch another player’s unfinished draft. Preserve selected cards by stable ID and invalidate stale assignments safely.

Offer No blocks as the clear option corresponding to the request to take damage, subject to server validation. Do not immediately subtract life. Keep spell responses in their proper windows rather than treating spells as blockers. Show illegal-assignment reasons close to the selection.

Test the design against multiple attackers and defending players, flying/reach, menace, required blocks, creatures with expanded blocking permissions, attacked planeswalkers/battles, creature removal, first/double strike, trample, damage prevention, and damage allocation. Damage allocation remains a separate explicit decision where required; a preview must not promise an outcome before responses finish.

Retain an accessible list-based assignment fallback until the visual interface can express every supported legal assignment. If the visual prototype obscures complex combat, ship the shared display first and retain the existing assignment dialog while revising direct selection.

### P08 Validate a complete game and release the approved increment

Use deterministic scenarios for each rules change, browser tests for each interaction, and a fresh multiplayer game with an empty-library invitee. Exercise simultaneous messages, response chains, phone scrolling, payment cancellation, multi-block combat, and reconnection. Make the known accessibility and stale-test failures actionable again before claiming a green baseline.

Present screenshots with IDs after each visible milestone. Record proven behavior separately from unresolved feedback. Release small completed increments to staging after approval; do not interpret the prior one-time instruction to publish despite a particular regression run as a permanent exemption for future work.

### P09 Add explicit Yield turn without surrendering decisions

Show Yield turn only during another player's turn. A persistent active indicator names that turn and exposes Stop yielding. Store the policy on the server by match, seat, and authoritative turn ID, so it works across tabs and reconnects and expires even when an extra turn belongs to the same opponent. It must never carry into a new game or the player's own turn.

While enabled, pass every priority opportunity for that player, including newly added spells/abilities, being targeted, and drawing a new playable card. Unlike P04's conservative no-response optimization, this is the player's explicit instruction even when a response exists. Do not silently cancel it because the board becomes dangerous. Explain this scope next to the toggle before activation; activation itself needs no extra confirmation dialog.

Suspend passing whenever that player has a required decision: targets, modes, optional-effect yes/no, trigger ordering, replacement choices, commander destination, payments requested during resolution, discards, or blockers. Ask normally, then resume yielding within the same turn. Never answer No blocks or decline a may effect on the player's behalf. Define precedence: required decisions first, explicit Yield turn next, ordinary stop/hold preferences afterward. Restore those preferences when yielding ends.

Serialize Stop yielding with game actions. A stop affects future passes once acknowledged; it cannot undo an already accepted pass or resolved spell. Show connection/acknowledgment state so a local toggle cannot imply a server cancellation that has not happened. Test late cancellation, two tabs, reconnect, extra/skipped turns, end-turn effects, removal of the active player, and mandatory choices while yielded. Aggregate pass history for readability while preserving diagnostic events.

### P10 Make commander casting consistent and show accurate tax

Provide one server-owned castability/payment feasibility contract for hand and command-zone spells. Highlight a commander when a legal casting opportunity and a feasible complete payment exist. Check source activation costs, restrictions, and mutually exclusive output choices: one land that taps for either black or green cannot supply both with the same activation. Exercise that exact negative case and a positive two-source case. Pool-only affordability must not hide an otherwise payable commander.

Select the commander, choose required casting options, highlight sources, and complete P06's manual payment or reviewed Auto-pay. Show an unavailable reason when timing, cost, targets, or another restriction prevents casting. Keep inspection available regardless. The highlight means at least one legal casting configuration exists; changing X, modes, targets, or additional costs may require another payment.

Tax is **+{2} generic per prior cast of that commander from the command zone**, not per death or return; partner commanders track separately. Keep the existing cast counter and display its projected next-cast surcharge as a small, readable top-right badge, with details on focus/tap. A countered cast still counts; casting from hand and putting a commander onto the battlefield need separate tests. [Commander rules](https://magic.wizards.com/en/formats/commander) and [partner guidance](https://magic.wizards.com/en/news/feature/commander-2016-mechanics-2016-10-24) establish the distinction.

The badge shows tax; the payment view shows the actual final cost after applicable increases, reductions, and alternative/additional costs. Never edit printed mana value to display tax. Test cancellation before casting, rejected casts, countered casts, multiple returns, two partners, alternate faces, owner/controller differences, cost reductions, and reconnect/replay. Audit command-zone destination choices without replacing them with an automatic return policy.

### P11 Replace the incorrect shared decks from the current staging profile

Read the signed-in owner's staging profile through the supported authenticated account path or an owner-provided export. Record the profile revision and exact six deck IDs, commander IDs, quantities, and canonical card identities in a private comparison. Do not substitute the repository snapshot, infer decks from colors, or reconstruct lists from speech.

D1 is expected to be the partner pair transcribed as “Kimna, the Weaver and Krom, Ludivet,” likely Tymna the Weaver and Kraum, Ludevic's Opus; the saved records must confirm that. D3's transcribed “Tewara, salted sand” remains unverified. Both checkpoints and a six-deck count must match before replacing the catalog. If they do not, stop the replacement and present the mismatch.

Replace all outdated shared choices atomically for future selections, including the extra seventh entry. Preserve Rob's private profile and immutable deck snapshots in existing games and replay records. Every signed-in human retains read/use access to the corrected shared choices, without gaining edit access to Rob's account or collection. Prefer a versioned shared-deck publication sourced from the authenticated profile, with explicit refresh and provenance, over another disconnected hardcoded copy.

Before Ready, validate every deck against the actual staging engine: complete main deck, both partners where applicable, combined color identity, quantities, and card support. Names resolving is insufficient proof of implemented effects. Coordinate unsupported cards with the existing card-load program, surface any authorized playtest-candidate limitations accurately, and never silently substitute another card. Cache image assets without making image-download completion a rules requirement; provide readable text fallback.

Acceptance: an empty-library invitee selects and submits each of the exact six lists; partner selection/counts are correct; no old choices remain; unauthorized users cannot edit the publication; a newer profile revision cannot overwrite a running game's list. Include a human review of the six-deck roster before the release is called ready.

### P12 Add account Game Logs and useful issue reports

Add Game Logs to the shared account menu used by the website header and the Play profile control. Keep it reachable in Full screen and on mobile. Build a paginated list of the signed-in player's games with local date/time, table, participants' display names, deck/commander names, result or unfinished status, and a link to the game record. Support returning to an active table without abandoning its seat.

Reuse the existing record endpoint and enforce membership on both listing and record access. Separate ordinary player-visible history from full diagnostic exports: a normal log must not reveal opponents' hidden cards, future draws, invite tokens, or private account information. Respect the existing explicit playtest export policy and label when a debug export includes otherwise private information. Do not commit raw profile backups or full game records to this public repository.

Include engine/build and deck revisions, event/decision IDs, chosen modes/targets, draw events, automatic-pass reasons, and rejection details in appropriately protected diagnostic records. A Report game issue action can attach the current match/revision and the player's notes. Cover an interrupted game, reconnect, old-version replay, missing/expired records, and a nonparticipant attempting access. Use this path to locate Luke's missed-draw sequence; no guessed card fix.

### P13 Complete Play home, seat setup, and Cloudflare email invitations

Use the latest reconciled requirements and existing lobby concept to implement Play home: Resume game, New table, Join invitation, and Recent games. Keep shared deck selection easy to reach. Navigation from the left-side Play item, deep links, refresh, and browser Back must reach the same updated experience. Preserve invitation return paths through sign-in. Port the reference design into the current application; do not restore superseded prototype controls or introduce a second Play application. Features needing unavailable data, such as public open-table discovery, must not be filled with fake activity.

Each enabled seat shows its name and a Human / AI type selector. Human adds Email and Send; AI replaces those with Easy / Normal / Claude. Use Add/remove seat for optional seats so Nobody is not confused with a player type. On narrow screens, each row becomes a labeled card. Claude is an opponent implementation, not a promise of greater difficulty; expose availability and failure state without silently changing it to Normal.

Sending requires a real table and reserved seat. If Send is used before creation, validate the setup, persist one draft lobby, and send against that stable table/seat; prevent duplicate table creation on retries. Leaving setup must retain a visible resumable draft or offer explicit cancellation. Changing a sent seat's email or type revokes its prior invitation. Define the host, invited, joined, deck-validating, ready, disconnected, and countdown states. Any readiness-breaking change cancels the launch countdown and is visible to every participant.

Cloudflare now documents outbound **Email Sending (beta)** on Workers Paid, distinct from incoming Email Routing. Verify availability and quota in this account, then onboard crankmagic.com and configure the sending binding and SPF/DKIM/DMARC records without overwriting existing mail configuration. Sending to arbitrary invitees requires the sending domain to be onboarded. This plan does not assume that an existing routing setup is enough. [Service overview](https://developers.cloudflare.com/email-service/), [domain setup](https://developers.cloudflare.com/email-service/get-started/send-emails/), [recipient limits](https://developers.cloudflare.com/email-service/platform/limits/).

Use a dedicated sender at the requested domain and one recipient per invitation, with the host display name, table name, environment, expiration, and sign-in/join link. Keep sending in the Worker; no mail credentials in browser code. Add authenticated host authorization, per-account/recipient rate limits, deduplicated jobs, bounded retries, and delivery-failure handling. Distinguish queued, provider-accepted, bounced/failed, and joined states; provider acceptance is not proof of inbox delivery. Retain copy-link fallback.

Bind each token to table, seat, intended signed-in email, and expiry. Redeem once with an explicit authenticated join action so an email scanner visiting the URL cannot consume it. Support resend/revoke and correct wrong-account guidance. Verify the Cloudflare Access admission path: today's seat link does not add an address to the site's allowlist. Complete a scoped invitation/admission flow or identify the exact admission prerequisite before claiming Send makes someone able to play; do not open the whole site as a shortcut.

Acceptance: a fresh invitee receives a real staging invitation, signs in, claims only the intended seat, chooses a corrected shared deck with no collection import, and reaches Ready. Also cover expired/revoked links, changed email, repeated Send, two simultaneous claim attempts, mailbox failure, unavailable Claude, and host cancellation. Automated tests use captured mail; real sends are limited to explicitly designated test recipients during execution.

## Rules and game-flow audit across the stories

Use the September 25, 2026 [Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt) as the rules baseline, rechecked at implementation. The following are regression scenarios and interface requirements, not a claim that every listed mechanic is already supported. For each, record existing coverage, a reproducible defect if present, the responsible story, and the release impact. Prioritize mechanics present in the six verified decks while preserving complete engine validation for all offered actions.

| Risk to exercise | Planned safeguard and acceptance scenario | Story |
| --- | --- | --- |
| UI conflates turn owner, priority holder, decision owner, and viewed seat | Use distinct projected identities; switching the camera never changes action ownership. Test a defender's choice during an opponent's turn. | P02/P04/P09 |
| Automatic progress skips a trigger or required choice | Test simultaneous triggers, controller-chosen ordering, replacement/prevention choices, state-based actions, and newly created priority windows. Never auto-answer choices through Yield turn. | P01/P04/P09 |
| A card has several effects or separate triggers | Trace each effect to an event; cover modes, “then,” conditional clauses, illegal targets, source removal, copied abilities, and draw replacements. Include Luke's actual card when recovered. | P01/P12 |
| Availability is inferred from apparent mana or card type | Test alternative/no-mana costs, usable other zones, special actions, split second, restricted mana, summoning-sick mana creatures, and source activation costs. Use server decisions for highlighting. | P04/P06/P10 |
| Payment shortcut commits resources the player did not intend | Review life, sacrifice, discard, filter, convoke/delve, and optional costs where supported. Separate preview from irreversible activations; never present Cancel as universal undo. | P06 |
| Draw button invents a response window or duplicates a draw | Test upkeep stops, normal-draw acknowledgment, replacement choices, empty-library events, extra draws, and actions after the draw; deduplicate by decision ID. | P05 |
| Combat pictures imply guaranteed damage | Show draft/confirmed blocks distinctly, retain post-block response windows, and test blocked attackers losing blockers, deathtouch, trample, first/double strike, and multiple defenders. | P07 |
| Decorative rearrangement changes meaning | Preserve attachments, tapped status, counters, control changes, token groups, and face-down privacy while dragging/tilting; grouping must not merge distinct legal targets. | P02/P03/P07 |
| Commander identity is lost during movement | Test separate partners, tax, command-zone choices, commander damage, copied commanders, and reanimation against persistent identities. | P10/P11 |
| End-of-turn automation skips cleanup decisions | Exercise discard, expiring effects, cleanup triggers, extra phases/turns, skipped turns, and eliminated seats. Round labels must come from the room, not initial seat-count arithmetic. | P04/P09 |
| Disconnect or elimination deadlocks multiplayer | Test leave/rejoin during each decision type, pending objects controlled/owned by a departed player, host departure, final result, and rematch. Never equate Yield turn with concession or consent to a timeout choice. | P08/P09/P13 |
| Long trigger chains freeze the screen | Bound work per server tick without dropping events; show progress, preserve interruptible preferences at valid boundaries, and use explicit loop choices rather than an arbitrary silent cutoff. | P04/P08 |

Unsupported interactions found in this audit become explicit engine work or clear setup restrictions for the affected deck. An interface fallback cannot compensate for an incorrect rules result.

## Interaction and performance acceptance

Keep one current decision with one authoritative submission path. Show selection locally at once, mark pending submission, and commit game facts only from the server. Preserve drafts when compatible updates arrive; invalidate stale targets with a specific explanation. Repeated clicks and reconnect replays must not repeat an action. Network errors must retain recoverable input and name the next step.

Use text/icons as well as color for legal sources, selected cards, and urgent actions. Provide tap-select/tap-destination and keyboard alternatives wherever dragging is available. Aim for roughly 44-pixel touch hit areas for frequent phone actions while keeping visible controls compact, and ensure target spacing satisfies the [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). [Dragging guidance](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) supports a non-drag pointer path as well as keyboard operation.

Use restrained motion, reduced-motion equivalents, preserved focus, and concise live-region announcements. Do not announce every auto-pass or force the camera to follow every spell. Keep end-to-end game flow independent of animation completion. On phones, show the current actor/decision and hand first; public-card inspection and combat assignment must remain available with drawers closed.

Measure local input feedback, render duration, memory, and reconnect recovery on a real phone with a crowded board, long stack/history, video enabled/disabled, slow network, and image failures. Target local feedback within 100 ms and stable 30 fps or better on the agreed minimum device; set a separate measured budget for server round trips. Reduce decorative video/particles and unnecessary repainting first. Keep selected/targetable cards represented when optimizing offscreen rendering. Evaluate median and slow-case results rather than a single successful desktop run.

Record task success and misclicks for joining, choosing a shared deck, inspecting a rear-seat card, paying for a commander, yielding/reclaiming priority, blocking, and returning from Game Logs. Use those observations to refine the mobile prototype before broad rollout.

## Sequence and ownership

Start with P01's baseline and P11's authenticated deck verification, while P02 establishes the mobile interaction design. Add P12's record access early so real-game failures can be diagnosed. Engine work for P04/P05/P09 and the specific card defect precedes dependent UI; P06 and P10 share one feasibility/payment implementation. P03 uses the approved mobile layout. P07 first ships its display, then direct assignment after payment/selection conventions and rules parity are proven. P13's updated lobby and corrected deck catalog form the invitation milestone. P08 gates every increment and the combined four-player game.

Suggested review milestones: (1) verified six-deck roster and recovered diagnostics; (2) mobile/navigation prototype with object-ID screenshots; (3) commander payment, Yield turn, draw and priority scenarios; (4) shared combat display and complete blocker assignment; (5) invitation-to-finished-game staging walkthrough. Correcting the shared catalog can ship independently once its provenance and engine support are proven; it need not wait for the entire visual redesign.

UI work belongs to the existing UI lane. Rules, room persistence, projections, and card definitions belong to the engine lane; assign exclusive ownership before implementation so the sessions do not edit the same files. Existing public view contracts should be extended only when needed. October 15 update: Rob approved the Babylon interaction prototype, delivered separately in `ui-prototypes/babylon/` at commit `36bb9446`. It passed 36 desktop/emulated-touch checks; physical-device performance and live room integration remain unproven. Compare it with the current renderer before selecting the production migration scope.

## Additional improvements to include

- A consistent indication of who is being waited on and what kind of decision is pending.
- A readable remaining-mana display and an explicit reason when a card cannot be played now.
- One consistent distinction between inspecting, selecting, and committing an action across hand, battlefield, stack, and combat.
- Stable camera/scroll positions through ordinary state updates; intentionally center only actions that need attention.
- A Report game issue action that attaches the match, revision, source version, and relevant public history, with player notes. Keep full records and private hand data out of public reports unless explicitly provided for debugging.

## Information still needed

The current six staging decks were verified from revision 36: D1 Tymna the Weaver + Kraum, Ludevic’s Opus; D2 Chulane; D3 Kiora of Salt and Sand; D4 Felothar; D5 Teysa Karlov; D6 Krenko. Their complete lists passed the real lobby checks locally. A table link or exported record is needed to identify Luke's card and missed draw. These gaps block the corresponding replacement/bug claim, not the other planning work. Cloudflare sending availability, quota, and the invitation admission path need account-level verification during execution.

Specific phone/browser details will refine device acceptance, but do not block the mobile design. The garbled phrase about the cast animation and player name is not treated as a firm specification: prototype a restrained, player-labeled cast movement and review it before choosing exact motion or placement. Rob authorized execution on October 15; validate each increment before its staging release.


## P14 — Deck and library sharing, invitations and profiles (authorized October 15)

Share Deck sits directly below Change Commander on deck tiles and in a deck's More menu. A compact dialog provides registered-user autocomplete, public access and Email Deck. Save and Cancel sit at the bottom right; Send appears only on Email Deck and requires a valid address. Reviewer permits viewing and playing; Collaborator adds editing. Public sharing is for signed-in players. Owners can change permissions and revoke them. Decks has My Decks and Shared Decks; the latter lists public decks and explicit grants and feeds Play's deck chooser.

Share Library sits below Publish your To Trade list. It shares card identities and inventory quantities/status, excluding account settings, history, purchase prices and private lot notes. Collaborator edits use the existing collection rules and owner-library version check. Shared editing never changes a game already using its own deck snapshot. Notification email comes from notifications@crankmagic.com, with delivery failures visible and retryable. Publishing does not broadcast mail to every registered player; specific grants notify their recipients.

Only the designated administrator sees Invite to CrankMagic. The server enforces that restriction, admits precisely the invited address through the configured Access applications, creates its profile, and sends the invitation. Profile settings below Account provide a display name, cropped image and verified email change. A verified change retains the canonical library/game identity and retires the former sign-in. Settings uses compact desktop columns and a single mobile column.

Acceptance: authenticated owner/reviewer/collaborator/stranger tests; direct API refusal of unauthorized writes; revocation and stale-save conflict; keyboard selection and stale-search rejection; mobile fit; profile/identity retention; email failures and retry; inviter-only admission; real staging mail and a recipient walking from invitation through deck selection. Current Cloudflare Email Sending API access returns Unauthorized (2036), so live mail and admission remain blocked on configuring permissions, the sender domain and the scoped Access token. Local tests use isolated SQLite and simulated provider responses. No external invitations are sent by automated tests.

## P15 — Creative production, design references, playtest reports, and analytics

Added October 15, 2026, at Rob's request. This is the integration execution plan; Rob will redeem the subscription codes manually. Account activation, connections, SDK instrumentation, generated assets, and remote dashboards are not claimed complete. Preserve Babylon for physical card rendering, the existing HTML UI for controls, and the authoritative rules/room boundary. These tools support that work and do not replace rules evaluation, account storage, or game records.

### P15.1 Activate the benefits and establish ownership

The [current Product Pass catalog](https://www.lennysproductpass.com/) lists Runway Pro, Higgsfield Pro, Magic Patterns Starter, Mobbin Team with 10 seats, Jam Team with 10 seats, and PostHog Scale with doubled monthly limits. The public offers are one-year benefits; confirm the actual account entitlement, credit allowance, eligible features, expiration date, and renewal amount on redemption. Account eligibility and promotional terms can differ. Keep redemption codes and personal billing details out of the repository.

Rob redeems each benefit in the intended account and uses CrankMagic as the project/team name where supported. Record activation status, a non-secret workspace/project reference, quota, and renewal date in the private operations record. Start with Jam and PostHog for the next playtest, then Mobbin/Magic Patterns for design review; Runway/Higgsfield can be activated in the same period for the first art batch. Disable optional automatic credit top-ups where supported. First implementation uses included allowances; separate API purchases require a concrete cost assessment.

| Tool | Rob's activation step | Planned integration and first deliverable | Ready when |
| --- | --- | --- | --- |
| Runway Pro | Redeem Pro and verify available credits. | Generate a controlled Volcano environment loop and a Forest alternative from approved reference frames; download masters for the asset pipeline. | One approved silent loop, poster, and mobile rendition load in Babylon with no visible loop discontinuity. |
| Higgsfield Pro | Redeem Pro, then authenticate its available official connection. | Develop environment keyframes, table/material concepts, and comparison motion samples; use the best result for each asset. | One approved visual direction and a reproducible prompt/settings record are handed to the renderer implementation. |
| Mobbin | Redeem Team and create CrankMagic reference collections. | Curate mobile inspection/selection, drawers/Camera, and invitation/sharing flows with notes on which interaction principle to adopt. | Each priority flow has a small annotated reference set and a concrete CrankMagic design decision. |
| Magic Patterns | Redeem Starter; verify which export and integration features the offer enables. | Prototype the fixed mobile Focused HUD and shared desktop header/drawers using our existing tokens and latest requirements. | The same inspect, pay, respond, and close actions work through a clickable flow at phone and desktop sizes; export is available for implementation. |
| Jam | Redeem Team, create the private CrankMagic workspace, and install the desktop capture extension. | Capture a reproducible card interaction bug with feedback IDs, release version, and safe diagnostics. Evaluate recording links/iOS capture for phones. | A reporter can submit a private report and engineering can reproduce it without exposing a hand, token, or account detail. |
| PostHog | Redeem the offer and create a US-region organization with separate staging and production projects within the entitlement. | Start with explicit interaction events, renderer performance, errors, and a small dashboard; add presentation feature flags afterward. | One staged journey appears with correct events, no sensitive payloads, and no gameplay failure when analytics is blocked. |

Plugin discovery found PostHog and Higgsfield integrations available but not installed/connected at this checkpoint. Installation/connection suggestions were provided; finish those after redemption. Discovery did not find exact Jam, Magic Patterns, Mobbin, or Runway plugins in the returned catalog; this does not establish that none exist. MagicPath is a different product from Magic Patterns. Use verified official MCP integrations where available, or normal project/export handoffs. More options may be available in the [plugin directory](https://chatgpt.com/plugins).

### P15.2 Produce assets that fit an interactive 3D table

Use Runway as the initial environment-motion workbench and Higgsfield for visual exploration and alternate generations. Compare a small batch against the same brief, then choose a preferred provider per asset type based on accepted output per credit. Avoid spending both allowances repeatedly on identical approved work.

The first brief is a locked-camera Volcano environment with slow peripheral lava/embers, stable illumination, and a quiet central playing area. Start with a 6–10-second loop target and an approved still reference; create and check the loop in postproduction rather than assuming generation makes it seamless. No table, cards, text, player indicators, or UI should be baked into the video. Follow with Forest. Keep Background and Table independent so Volcano/Wooden and Forest/Stone are configurable combinations.

Generate table concepts and material source images separately. Codex builds or imports actual table geometry and prepares physically based materials, including consistent scale, texture seams, roughness, and normal maps as needed. A generated image/video does not supply a usable 3D table mesh or validated material maps by itself. Continue using existing card art for card faces. The environment loop remains a backdrop; physical parallax, card pickup, tapping, and shadows come from Babylon.

Asset handoff: master file, provider/model, prompt, relevant generation settings, reference source and usage provenance, crop-safe areas, and acceptance notes. Preserve large masters in controlled asset storage; commit only suitable optimized derivatives and a versioned manifest. Extend the existing environment appearance seam with stable background/table IDs, video renditions, poster, material/mesh references, lighting preset, and fallback. Continue the current serving path for the first pair; evaluate R2 when asset size justifies it rather than adding another storage migration to this milestone.

Prepare a broadly compatible MP4 rendition plus WebM where useful, a still poster, and a smaller mobile rendition. Strip audio tracks. Measure byte size, decode cost, and first-frame delay on the target devices. Pause video for reduced motion or hidden tabs; fall back to the poster after failure or when the local quality preference disables motion. Host-selected skin IDs synchronize through table settings later; a player's reduced-motion/quality setting stays local. No generation call belongs on a game turn's critical path.

[Runway web subscriptions and API credits are separate](https://help.runwayml.com/hc/en-us/articles/21668552945171-Runway-API-FAQs). Start with subscription generation and exported files. [Higgsfield's MCP can use plan credits](https://higgsfield.ai/blog/mcp-for-marketers), while its [developer API has a separate balance](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api). Verify the redeemed plan's connector access and remaining allowance before a generation batch. Do not infer free API access from either Pro subscription.

### P15.3 Turn references into implementable UI decisions

Create Mobbin collections for (1) mobile selection/inspection and bottom sheets, (2) desktop collapsible drawers, compact controls, and Camera, and (3) sharing, invitations, and account settings. Save links and short annotations explaining the useful behavior, including dismissal, focus, scrolling, and small-screen handling. Adapt the interaction pattern to card play; retain CrankMagic's visual identity. [Mobbin supports team collections](https://help.mobbin.com/en/articles/692672).

Give Magic Patterns the reconciled requirements, recent ID screenshots, existing colors/type/spacing, and representative sanitized UI states. Its first brief must include fixed Focused mobile, common desktop headers/drawers, Camera view switching with Full-only tilt, and an unobstructed card area. Exercise empty/loading/error states and long card names as part of the prototype. Direct manipulation remains implemented in Babylon; Magic Patterns designs the surrounding controls and decision flow.

[Magic Patterns supports code export, GitHub synchronization, and MCP handoff](https://www.magicpatterns.com/product/ai-prototype-generator). Verify feature availability on Starter. Use exported code or a separate design branch/project and a HANDOFF.md; Codex adapts approved patterns to the current application. Generated React output is not a reason by itself to migrate the existing frontend. Keep the main repository and latest user requirements authoritative. Each accepted design produces implemented screenshots with the existing object IDs and a linked browser test.

### P15.4 Make playtest feedback actionable with Jam

First prove capture on the existing Babylon sandbox using a known drag/inspection scenario. Add a Report game issue entry to the shared account/help surface, retaining a small footprint on mobile. The app prepares a diagnostic bundle with build/renderer version, viewport/input mode, feedback object ID, anonymous report reference, current phase, request/revision correlation, and the reporter's expected/actual behavior. Store the lookup to authorized game records inside CrankMagic; do not upload the raw room projection or full replay to Jam.

[Jam can send captures to GitHub with console and network context](https://jam.dev/docs/github). This repository is public: keep captures in a private Jam workspace and publish only a reviewed, sanitized reproduction in a GitHub issue. Automatic capture or issue creation must not expose cookies, Access credentials, request/response bodies containing hands, chat, emails, or deck lists. Generic secret filtering is insufficient for game-specific hidden information. Verify both the visible recording and attached diagnostics before enabling the workflow for invitees.

For phones, verify the redeemed account's supported recording-link or mobile-app path and whether it captures the necessary diagnostics on the real browser. A native screen recording plus the app's sanitized bundle is the fallback. Do not promise desktop-extension capabilities on mobile. Test a complete report-to-reproduction-to-fix cycle, then retain the report reference in the regression test notes. No external reports or invitations are sent during planning.

### P15.5 Measure usability and renderer health with PostHog

Add a small telemetry adapter to the existing frontend; it must be safe to disable, nonblocking, bounded, and separate from the rules transport. Start on staging. Configure US ingestion, distinguish environments/builds/renderers, use a pseudonymous analytics identity, and reset identity on logout. Disable broad autocapture and session replay initially. Keep emails, chat, card names, deck lists, invite URLs/tokens, private hands, full views, and request bodies out of event properties. Sanitize route/referrer fields as well as explicit properties. Provider credentials for querying/administering PostHog remain server-side or in the authenticated connector; use only the intended public project token in client configuration.

Initial explicit events: `table_join_started`, `table_join_completed`, `card_inspected`, `card_move_completed`, `card_move_canceled`, `cast_started`, `cast_confirmed`, `cast_rejected`, `commander_cast_attempted`, `priority_wait_started`, `priority_wait_finished`, `blocks_confirmed`, `game_report_opened`, and `renderer_health_sample`. Include only allowlisted properties such as desktop/touch, viewport bucket, view, renderer, public zone category, elapsed-time bucket, error category, and release version. Record completed interactions, not every pointer move or animation frame. The recorded prototype marks local actions as sandbox events; it cannot emit a successful live cast.

Correlate server-confirmed actions with a request ID and deduplicate retries. Measure active decision time separately from transport delay and time waiting on other players. Aggregate frame time, long stalls, texture failures, and graphics context loss locally into periodic summaries. Build three initial dashboards: join-to-play completion; inspect/payment/commander success and cancellation; and renderer health by device/view with video on/off. Use explicit short playtest feedback to interpret metrics; fewer clicks alone is not proof of a better tabletop experience.

Add presentation flags for the Babylon renderer, new mobile shell, and animated environments only after basic analytics is verified. Freeze a renderer choice for the current table session and preserve a local safe default if flags cannot be fetched. A remote flag must never alter Magic rules, permissions, match state, or required decisions. Test analytics blocked/offline and flag-provider failure as normal supported conditions.

[PostHog supports WebGL canvas recording](https://posthog.com/docs/session-replay/canvas-recording.md), but ordinary DOM masking does not protect canvas pixels. Default canvas capture is also too sparse to judge animation smoothness. Keep live-board canvas recording off initially. Use a synthetic/private-data-free fixture for replay experiments; recording a real player's board requires tested canvas masking or a separate sanitized capture surface, plus intentional recording controls. Measure recording overhead separately. Keep authoritative game logs in CrankMagic, Jam for reported defects, and PostHog for patterns across sessions.

### P15.6 Execution order and completion evidence

| Milestone | Dependencies | Deliverable and acceptance |
| --- | --- | --- |
| A. Activation and connections | Rob redeems codes; account feature/usage checks. | Verified workspace references, plan allowances, expiration notes, PostHog/Higgsfield connection where enabled. No purchased API balance required. |
| B. Feedback foundation | Jam and PostHog active. | One private, sanitized Jam report and an event journey from staging; metrics/recording disabled or blocked must not affect play. |
| C. Interaction design | Mobbin and Magic Patterns active; latest requirements and Babylon feedback available. | Annotated references and a clickable mobile/desktop decision flow; approved handoff ported by Codex with ID screenshots and keyboard/touch checks. |
| D. First themed 3D scene | Runway/Higgsfield active; asset brief agreed. | Volcano + Wooden asset set integrated into Babylon, alternate Forest concept, smooth loop/poster fallback, and measured real-phone performance. |
| E. Integrated staging playtest | Accepted renderer integration and relevant P01-P14 engine/UI stories. | Four-player invitation-to-game walkthrough; tested report workflow, inspected analytics, regression evidence, and release rollback path. |

B, C, and D can proceed independently after their own accounts are ready. A service activation delay does not block commander/payment, privacy, or rules work. Use actual output and device evidence before choosing the full renderer rollout. Run targeted tests, preserve negative proofs for new behavioral assertions, continue screenshots with IDs after visible changes, and update docs/ACTIVE.md at each checkpoint. This plan introduces no new recurring automation, paid purchase, production telemetry, or external publication by itself.
