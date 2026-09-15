# Commander controls, mechanics evidence, and browser hosting

Status: implementation specification extending the accepted C0–C7 plan and C8 multiplayer scope. The custom web table is currently a replay. The standalone Forge launcher is the first route to complete human rules prompts; it does not implement the custom controls described here or API pilots.

## 1. Physical table appearance with precise controls

Keep the four miniature playmats, central phone counter, inspectable zone piles, and full-window Focus with a prominent Close button. Card artwork remains the main visual element. Use overlays sparingly:

| State | Visual | Interaction |
|---|---|---|
| +1/+1, -1/-1, loyalty, charge and other counters | Small die with numeral and counter-type label | Inspect shows exact types, totals, and source events; no manual die dragging required |
| Mana pool | Colored gems with mana symbols, quantity, and restrictions | Inspect sources and expiry; distinguish floating mana from untapped potential sources |
| Treasure, Food, Clue and creature tokens | Actual token card art with a quantity badge | Expand the pile to choose individual objects; distinct tapped/counter/attachment states never merge semantically |
| Tap, summoning sickness, attack and block | Card rotation plus labeled status; attack/block arrows | Select the actual ability or legal combat assignment |
| Poison / commander damage / life | Central phone counters, mirrored on each mat | Inspect damage by commander identity and engine-reported elimination reason |

Dice are numerical state indicators, not random rolls. Engine-required die rolls have separately logged RNG events. A mana gem is a display, not an invented game object; actual named tokens remain their own objects. Color is supplemented by symbols/text, keyboard controls, accessible labels, reduced motion, and a plain-counter option. Badge placement must preserve readable card names and artwork in Focus.

## 2. Human decisions remain human

The engine publishes seat-scoped legal actions and pending choices at every decision revision. Buttons are derived from that feed, never from keyword text alone. Static card definitions support explanation and telemetry; current effects, timing, priority, costs, control and targets determine legality.

- Drag a hand card onto the mat to begin Play land / Cast, then choose face, mode, X, targets and other required choices. Spells appear on the stack until resolution; lands use their legal special action. A failed or cancelled draft returns to the hand without state mutation.
- Right-click a permanent for named abilities such as **Tap: Add G**, **Tap, pay 4: Proliferate**, or **Sacrifice: Draw a card**. Touch and keyboard users get the same menu through an Actions button. A generic Tap command cannot bypass an ability's cost or timing.
- Show relevant unavailable actions with precise reasons: not enough available mana, already tapped, summoning sickness, no legal target, timing restriction, or another player's decision. Disabled explanations must be accessible by keyboard/touch as well as hover.
- Combat presents attackers, each defender, blockers and any allocation/ordering choices required by the pinned engine. Tapping itself does not declare an attack. Show vigilance and attack taxes accurately.
- Triggered abilities are registered automatically. The player chooses optional effects, targets, ordering and other required decisions when the engine asks. Mandatory arithmetic and resulting state changes happen automatically after those decisions and legal responses.
- **Proliferate** appears as a pending resolution choice or a named activatable ability that leads to it. Highlight eligible objects/players, let the human select any number, preview counter changes, then submit once. It does not allow placing a first poison counter on an unpoisoned player or choosing only one counter type on an object that has several. **Add counters**, **Create token**, and similar buttons likewise answer specific engine choices; they are not unrestricted editing tools.
- Resolve repeated equivalent choices in a compact batch only when the engine certifies they can be grouped. Preserve response windows and individually distinct targets. Offer Accept suggested selection and Clear, with no silent selection of strategically consequential targets.
- The player may set explicit auto-yields for routine prompts; the default preserves optional effects and response opportunities. No forced human autoplay. Revoke stale menus immediately when a response changes the state.

Rules authority: [Wizards Comprehensive Rules](https://magic.wizards.com/en/rules), specifically casting/activation, triggers, resolution, mana abilities, counters and proliferate. The engine and rules revision must be recorded together; the interface must not invent shortcuts that change game outcomes.

### Payment policy

Default **Auto-pay** executes the payment when the human commits a legal cast/activation. Show a compact preview and an accessible **Adjust payment** option; allow reserving a source for later. This is a deterministic, configurable preference, not a guarantee of strategic optimality.

1. Compute the complete payable cost using engine rules: colored and colorless requirements, generic, X, taxes, reductions, alternative/additional costs and source restrictions. Include commander tax. Do not mistake a tap symbol for a mana cost.
2. Use already-floating eligible mana first, considering expiry. Find a complete feasible assignment before taking any action; a greedy first-color algorithm can strand a later color.
3. Among feasible ordinary payments, prefer basics that meet required colors before mana rocks, preserve flexible sources, avoid excess mana, and preserve useful creature abilities where possible. Player reservations override convenience preferences if the cost remains payable.
4. Ask for explicit choice before sacrifices, discard, life payments, Treasure consumption or optional alternative costs. These choices may be included in the cast confirmation; avoid repetitive dialogs. Never auto-sacrifice an unrelated permanent just to make a cost affordable.
5. Revalidate the chosen plan against the current decision revision. Submit legal source activations/payment steps through the engine and honor any intervening choices/triggers. Do not directly edit mana or tap flags. An action that is not a mana ability must use the stack normally.
6. If payment is impossible, keep the card/action unchanged and explain the unmet requirement. If the board changed during selection, refresh the quote rather than executing a stale plan. Undo is restricted by the engine and revealed information; no promise of unrestricted rollback.

Acceptance scenarios: a summoning-sick mana creature; a tap ability also costing mana; a dual land needed for a later color; restricted mana that cannot pay this spell; cost reduction and tax; multiple mana abilities on one source; an optional sacrifice; a mana-trigger choice; paying X; stale payment after an opponent responds. No duplicate costs on retries.

## 3. Definitions and fired-mechanic telemetry

Every accepted human or AI deck resolves every distinct card, including commander(s), to canonical identity. Cache Oracle text, faces, types, keywords, source/capture date and supplemental mechanic tags. Persist an immutable mechanics snapshot next to the deck hash and match manifest. A later card-definition refresh must not silently rewrite historical matches. Unknown or unsupported abilities block measured runs or are explicitly classified as unsupported; never fabricate a successful mechanic from printed text.

The current setup implementation saves these snapshots. The existing private Forge journal captures raw events and some cast/resolution links. **Complete trigger causality, payment accounting and loop reconstruction remain C5 work.** A stored capability is not proof that it fired.

Required normalized events:

- Match, engine/rules version, deck/definition hashes, controller kind, pilot version and difficulty.
- Event ID, monotonic sequence, turn/phase/step, source object and Oracle identity, ability/script ID, controller, parent/root cause, stack entry, decision ID and committed action ID.
- Trigger created, ordered, resolved, countered or otherwise removed; replacement/prevention with original and resulting event; chosen targets and actual affected recipients.
- Counter type and before/after/delta for each object/player; proliferate occurrence, selected recipients, no-selection outcomes, and separately linked follow-on triggers.
- Mana source activation, color/type/restrictions produced, pool deltas, mana spent on each cost, life/sacrifice/discard costs, and unused mana lost. Attribute generated resources to the source chain.
- Token identity, quantity and initial state; zone changes, combat damage, life loss/gain, poison, commander combat damage and exact win/loss reason.
- Repeated chain fingerprint, proven iteration count, net resources, loop exit/interruption and responsible interaction. A watchdog stop is incomplete evidence, not an infinite combo win. Engine-recognized mandatory-loop draws and chosen finite shortcuts remain distinct.
- Human options offered and answers, auto-payment policy and overridden sources; API observations/answers privately stored with usage, latency, stale-answer rejections and legal fallback reasons.

Reports distinguish attempted / resolved / prevented / interrupted, and observed counts / inferred chains / unsupported attribution. Reconcile counters and mana against independent final-state deltas. Susceptibility findings link actual interactions and sample size; one disrupted game does not establish matchup odds. Preserve a private host journal and filtered public/per-seat reports. Public exports cannot expose hidden hands, RNG state, private choices or provider keys.

## 4. Infrastructure for live browser games

### Recommended first deployment: one private friends table

One always-on host runs the Node lobby/API and a separate Java engine worker per match. Browsers render the existing table and send decisions over authenticated WebSockets. The engine owns all rules, libraries, randomness and legal choices. AI provider calls originate at the host, using seat-filtered observations and host-stored credentials.

Planning capacity, **not a measured minimum**: 4 modern CPU cores, 8 GB RAM and 20 GB free SSD for one table, runtime/assets, cached definitions and bounded logs. Start each JVM with a 2 GB heap cap, measure token-heavy games and peak RSS, then adjust. Rob's Windows PC can serve the initial private test if it remains awake; a small Linux VM is a later alternative once the headless human-decision bridge is complete. No GPU is required when AI runs through a remote API. Sizing excludes a local language model.

| Layer | First-table requirement | Later growth |
|---|---|---|
| Frontend | Static browser build with card/image cache, secure HTTP, responsive controls | CDN optional |
| Lobby/API | Node service, invite/session handling, seat ownership, imports, setup validation | Multiple service instances only after shared-session design |
| Rules | Pinned Forge worker, serialized action queue, versioned decision protocol | Bounded worker pool; match affinity |
| Transport | HTTPS + WSS, exact allowed origins, per-seat authorization, action receipts | Backpressure, reconnect and protocol compatibility tests |
| Persistence | SQLite for one-host metadata and action receipts; append-only private journal on SSD | PostgreSQL and object storage when using multiple hosts |
| Recovery | Durable choices/events, snapshot/replay recovery with pinned RNG/engine; pause on disconnect | Host migration deferred |
| Card data | Server lookup queue, cached definitions and explicit unsupported-card review | Periodic bulk refresh with historical version retention |
| AI | Server-side secret storage, spend/latency caps, per-seat policy and cancellation | Provider adapter pool |
| Operations | Service restart policy, health checks, disk limits, private backups and tested restore | Metrics/alerts for multiple simultaneous games |

**Connection options:**

1. **Same LAN:** host on a deliberately selected LAN interface; browsers connect through a trusted HTTPS endpoint. Requires a scoped host firewall rule and certificate trust. Do not expose the diagnostic replay server as the multiplayer service.
2. **Remote friends, private network:** use an authenticated private-network connection, with friends enrolled and an HTTPS name/certificate trusted by their devices. The host must stay reachable. This avoids public inbound game ports but adds private-network enrollment.
3. **Browser-only remote access:** deploy the authority on an internet-reachable host with a domain, TLS certificate, reverse proxy, expiring seat invites/session cookies, and an explicit access policy. Clients need only the browser. Restrict public ingress to the web endpoint; keep engine, database and private journals inaccessible. This expands C8 beyond LAN and requires its own deployment/privacy verification.

[Caddy supports WebSocket reverse proxying](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) and [automatic HTTPS](https://caddyserver.com/docs/automatic-https), making it a suitable single-host proxy. Certificate issuance still requires appropriate domain/network validation. The current hard-coded loopback Host/Origin checks must be replaced by deployment-specific allowlists, not removed.

The GitHub Pages deck site can remain the deck-building frontend, but a static host cannot run the JVM or maintain authoritative live match state. Prefer a game origin serving UI and API together. The deck site hands off an explicitly selected versioned deck snapshot; importing a report produces a proposed refinement, never an automatic library overwrite. If direct cross-origin integration is added, use a narrow authenticated handoff and exact origins. Keep API keys off the public site and out of URLs.

### Multiplayer release gates

First complete the solo web decision bridge and the controls above. Then deliver C8 CSV upload and mechanics hydration, lobby readiness bound to the exact 100, and two separate browser sessions. Progress to 2 humans + 2 AI, 3 + 1, and 4 humans. Test private choices, out-of-turn interaction, disconnect/reconnect during payment, duplicate messages, stale actions, elimination, host crash and recovery, unsupported cards, and complete reports. No launch until hidden-state tests inspect network payloads, logs and reconnect snapshots.

Network transport alone does not make the current replay playable. The principal missing work is the complete human-decision bridge and its privacy/recovery certification; purchasing hosting will not remove that dependency.
