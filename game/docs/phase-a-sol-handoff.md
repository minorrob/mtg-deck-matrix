# Phase A — foundation and Sol execution contract

Status: Phase A complete for handoff. Real three-controller opening/draw/land proof and native-AI turn passed. The owner explicitly deferred the live-provider test to Phase C on 2026-09-15; no live API request was made. This document does not certify multiplayer release or the final acceptance walkthrough.

## Decisions that implementation must preserve

### One game authority, separate seat views

Forge owns the shuffled libraries, rules, mana payment, priority, targets, stack, damage, losses and wins. Node authenticates and routes commands; browser layout never changes rules state. Neither an LLM nor JavaScript infers that a spell resolved because it left the hand. Render the actual stack until Forge moves it to its destination.

One Java process hosts one match and one journal. Every human has its own `PlayerControllerHuman`, `IGuiGame` proxy, bridge token and filtered projection. API pilots can use a separately controlled browser-style seat through a host-side driver; it must never share a human's controller. Native AI remains a separate, explicitly identified pilot. Lobby seat IDs and Forge player IDs are separate fields. `viewerSeatId` / `viewerPlayerId` identify the receiving seat; active-turn and priority IDs never imply ownership.

`ForgeLocalGame` accepts `engineController: browser | native-ai`. Default behavior remains solo seat 0 plus native opponents. Extra bridge connection files live under `seats/<seatId>/browser-bridge.json`; seat 0 retains the legacy file. These files and their tokens are host-private, not browser assets. The product setup must continue rejecting unsupported multiplayer configurations until the guest broker and UI are complete.

Native dialog fallback is acceptable for the existing local solo mode. For remote seats it is a release blocker: surface a recoverable unsupported-choice state to the correct seat, retain the pending decision, and implement that return contract. Do not send a remote human's hand to a host-visible fallback dialog or auto-answer it.

### Transport and authentication

Keep the existing admin service on loopback 8768. Do not expose `/api/setup`, `/api/import-deck`, game directories, the private journal, Forge ports, or API keys over LAN. Build a separate guest gateway with an explicit route allowlist. Initial automated tests run on loopback; real remote proof requires a selected HTTPS ingress and explicit exposure configuration. The browser frontend and guest API should share an HTTPS origin.

An invitation is an opaque 256-bit, expiring, single-use secret in the URL fragment. Redeem it for a seat capability, then remove the fragment from browser history. Store only hashes on the broker. A successful claim atomically occupies that reserved seat and consumes the invite. A different client cannot pick a seat by changing an ID in JSON. Reissue revokes old unclaimed invites. Exit/grace expiry revokes all capabilities for that membership. Reconnect uses the same capability until revoked. Credentials stay out of access logs and referrers.

`SeatAccess` is a tested in-memory primitive, not a complete authentication service. Its `generation` is a membership epoch, separate from `CrankMagicTable.generation` (match counter): rematches do not invalidate seated humans. Production persistence must transact claim/session issuance together. Host administration requires its own scope; being game seat 0 is not an admin credential.

Proposed gateway routes:

| Route | Scope | Result |
| --- | --- | --- |
| POST /table/invites | Host | One reserved-seat invitation |
| POST /table/join | Unclaimed invite | Capability and own seat identity |
| GET /table | Membership | Public lobby plus own deck/readiness |
| POST /table/deck | Membership, own seat | Validated immutable snapshot/version |
| POST /table/ready | Membership, own seat | Revised lobby/readiness |
| POST /table/heartbeat | Membership | Renew presence only |
| POST /table/exit | Membership, own seat | Departure/concession policy and revocation |
| GET /match/view | Membership | Own filtered Forge projection/decision |
| POST /match/action | Membership, own seat | Receipt, followed by authoritative revision |
| POST /match/feedback | Membership, own seat | Own feedback |
| POST /table/rematch | Membership, own seat | Own vote |

Use server-resolved table/seat/match identities, body size limits, exact allowed Origin/Host checks and per-membership rate limits. Never return another seat's prompt, options, receipt or private telemetry. Retain legal public reveals according to Forge, not blanket zone-name assumptions.

Action envelope: `{matchId, actionId, revision, kind, choiceId?, targetId?, indices?, value?, amounts?}`. `actionId` is a UUID and receipt key. An identical retry returns the original receipt; changed content under that ID is rejected. Match identity is a new UUID per match, not a deck hash. Reject stale decisions; do not rebase old target selections. A receipt means accepted/queued, not resolved. Display pending until the engine records completion/error and refreshed state. Polling is adequate for the first gateway; SSE/WebSocket delivery can replace transport without changing this contract.

### Table and rematch lifecycle

`table-lifecycle.mjs` is a pure transition reference with stale-revision protection. The server supplies time, launch IDs, authenticated actors and validated deck versions. Persist transitions before acknowledging. Its reducer alone does not authorize users or validate cards.

`selecting → countdown → starting → playing → rematch → selecting`

Every occupied seat must have a validated deck and be ready. All human seats must be connected. Show a shared 10-second deadline. Deck edits, unreadiness or disconnect cancel the countdown. On expiry, persist a unique launch command before spawning Java. Repeated ticks cannot launch another game. Recovery retries that same launch ID; it never silently creates a second engine. Engine failure returns to selecting with readiness cleared.

On completion every human votes. Yes shows Waiting for other players. Unanimous yes returns everyone to deck selection with the previous deck available but nobody ready. Allow same/upload/saved/Deck Lab choices. No new invitations for existing members. A no leaves the table waiting for that person to exit or reconsider; do not silently expel them.

Heartbeat every 10 seconds; mark disconnected after 30 seconds without heartbeat; allow 60 seconds reconnect grace from disconnection. Unload is advisory. A disconnected/expired player in an active match requires an explicit engine departure/concession policy; never delete them from the rules state or assign a new person their private hand. Between games, release the seat and let the host reinvite or reconfigure to 2–4 seats. Host departure and worker crash require explicit handling; a diagnostic projection is not a resumable engine checkpoint.

### AI decision boundary and difficulty

An API model chooses among offered options; it never executes arbitrary engine commands or changes counters directly. Request contains seat-filtered observation, stable decision identity, allowed option IDs, remaining decision budget and policy version. Validate output structure and membership, then validate against the still-current engine decision. Refusal, timeout, invalid output and budget exhaustion must not create an action. Pause/retry or apply a separately tested declared fallback; log which occurred. Card/rules text is data, never executable instructions.

`api-choice-provider.mjs` is a bounded single-choice Responses API proof adapter. It is not a full tactical pilot. `phase-a-api-host.mjs` accepts a key only on loopback, stores it in process memory and makes a bounded test with synthetic decks. No key persistence or provider reply logging. Full provider budgets, cancellation, evaluations and secret lifecycle belong to Sol tickets below. Reference: https://developers.openai.com/api/docs/guides/structured-outputs

| Difficulty | Public-board attention and competency target |
| --- | --- |
| 1 Learner | Own mana, legal casts and attacks; simple immediate survival |
| 2 Casual | Own engine first; react to direct threats |
| 3 Focused | Evaluate public mana/draw/token engines and save appropriate interaction |
| 4 Advanced | Identify likely multi-card enablers earlier, sequence disruption and assess counterplay |
| 5 Expert | Broader legal candidate search and stronger public-board forecasting under bounded budget |

These are competency goals, not guaranteed win rates or permission to inspect hidden hands. Do not fabricate probabilities without a defined model/sample count. Replan after each draw and relevant public change, but act only when Forge offers a legal decision. Tests should compare action quality on the same observed position and available cards: token multiplier before a large token trigger; sacrifice outlet/recursion loop; mana engine; card-draw engine; inability to answer; counterspell/priority window; deceptive but harmless threat. Evaluate average performance, not assume every higher-difficulty choice must differ.

## Telemetry contract

One append-only host-private journal; separate public and seat-private projections/reports. Version every event. Recommended envelope: `{schema, eventId, sequence, matchId, turn, phase, engineRevision, kind, actorPlayerId, sourceInstanceId, targetIds, parentEventId, chainId, visibility, payload}`. `parentEventId` is nullable: record `causeUnknown` when Forge does not expose a cause, never guess. A card instance ID differs from its Oracle/printing IDs. Preserve token creation, movement and disappearance as separate facts.

Capture casts vs resolutions/counters/fizzles, payments vs available mana, source tapping, optional-cost decisions, trigger offer/order/resolution, replacements/prevention, counter deltas, proliferate selections, combat assignment vs actual damage, deaths/zone moves, loss causes, loop shortcuts/iteration counts, yields, unsupported choices and provider failures. Count mana flexibility without summing an any-color source as five independent mana. Record deck snapshot/hash, source user/deck/revision, commanders, resolved mechanics and pinned engine/rules versions.

Reports distinguish opportunity from performance: drawn, castable, cast, resolved, generated value, removed, stranded and unknown. A game with no creatures drawn is not proof of a shuffle bug. Recommend against owned inventory and permitted budget with observed sample sizes, uncertainty and deck archetype context. AI feedback is labeled separately from human feedback. Cross-user reports never reveal hidden draws without explicit sharing.

## Sol implementation sequence

Each ticket requires implementation, focused tests, browser verification where relevant, and an evidence record. Use existing push/merge authorization for verified stages. Do not claim the final 13 gates passed from these smaller proofs.

1. **S1 — Launch/recovery polish.** `crankmagic-online.js`, startup skill/helper, launch tests. Preserve the exact loopback health CORS boundary and expiring handoff. Verify healthy/cold/permission-denied/timeout cases. No broad CSP or network relaxation.
2. **S2 — Guest broker and identity.** New `game/server/` modules using `seat-access.mjs`; separate listener from admin. Tests: wrong seat/table/epoch, expired/reused invite, revoked session, oversized body, spoofed Origin, path traversal and private-file denial. Establish safe remote-access configuration before external UAT.
3. **S3 — Lobby UI and deck intake.** `setup.mjs`, gateway routes, existing `importWorkshopDeck`/mechanics resolution. Own-seat CSV/saved/Deck Lab upload, source version, commander validation, bracket/budget feedback, unresolved-card blocking. AI commander controls appear only for AI seats.
4. **S4 — Per-seat browser game routing.** `local-game-launcher.mjs`, `serve-review.mjs` split, `review.mjs` ownership assumptions, new guest API. Server chooses bridge by authenticated membership. Replace seat-0 assumptions; validate all three private hands against the same public state. Never reuse unfiltered `matchTelemetry` in guest responses.
5. **S5 — Persistent table orchestration.** Implement lifecycle persistence and launch outbox from the transition reference. Build ready/countdown/rematch/exit/reconnect UI. Test timer races, reload, stale votes, duplicate starts, worker crash, seat replacement and table resize between matches.
6. **S6 — Full AI pilot.** Extend bounded provider to supported decision categories with explicit budgets and cancellation; map engine legal actions/targets/costs. Implement and evaluate difficulty scenarios above. Audit unsupported card scripts; preserve honest compatibility indicators. Never mark API pilot complete on one option-selection proof.
7. **S7 — Public history and private telemetry.** Audit real journals; add missing causal events in Java, project visibility in Node, test dropped/duplicate events and report accounting. Include token disappearances and action-to-resolution continuity.
8. **S8 — Deck feedback and recommendations.** Completion form, labeled AI analysis, deck-version attachment, owned-card evidence reports, workshop navigation and rematch entry. Test multiple users with different deck IDs and stale revisions.
9. **S9 — Full desktop regression/UAT.** 2/3/4-seat configurations, complete mixed game, complex combat, all supported prompt return contracts, shutdown/restart, then stale documentation repair. Preserve explicit remaining limitations. Run existing 62-suite harness and expanded game/Java checks.
10. **S10 — Cloud execution documentation.** Apply the architecture below; write concrete hosting configuration, cost inputs, migration/rollback, backup/restore and operations runbooks. No deployment or purchase implied.

Escalate back to Astra if the agreed interface cannot express a required Forge decision, a privacy test fails, an action loses identity/ordering, or persistence cannot prevent duplicate engines. Do not bypass failed gates to fit the plan.

## Cloud architecture selected for planning

Use one HTTPS browser/API gateway, an identity provider (OIDC), PostgreSQL for users/deck versions/table membership/launch outbox, private object storage for journals/replays, and one isolated Forge JVM worker per active match. Keep live authoritative state in that JVM; event snapshots are diagnostic until a validated restoration mechanism exists. Worker loss initially ends the match as interrupted with retained logs, rather than pretending replay is a complete save. A managed secret store holds provider credentials with envelope encryption if persistent BYOK is introduced; access is worker-scoped. No API key enters frontend assets.

The current adapter initializes Forge desktop GUI objects. Cloud workers therefore need a tested virtual display or a completed headless GUI adapter; do not assume the current Windows launch command is cloud-ready. Unsupported native dialogs must be eliminated or made explicit recoverable seat decisions before remote release. Verify Linux/JDK/runtime compatibility, per-match memory limits and display/process cleanup before selecting a worker size or price.

For the first personal remote proof, a scoped HTTPS tunnel or equivalent ingress may forward only the guest gateway while the local computer remains host. Select and approve that exposure as a concrete step; never tunnel the admin listener. Reuse gateway contracts in the cloud so migration changes worker placement and storage, not game semantics. Rate limits and per-user/match budgets bound provider spend; close idle workers and retain versioned evidence. Vendor selection/cost verification remains part of S10.

## Return to Astra

Sol hands back commit/PR IDs, passing commands, browser evidence, full-game journal references (kept private), known limitations and the revised startup guide draft. Astra independently reviews the cross-component implementation and failure cases, fixes findings, then executes the 13 final milestones only after all earlier work is complete. Landscape mobile follows that proof.

**Deferred Phase C prerequisite:** run the bounded live-provider proof with the owner's chosen provider and memory-only key entry. Record provider/model, accepted legal decision, exact Forge application, private-view checks and engine cleanup. Then independently evaluate the complete S6 pilot, difficulty behavior and provider failures. Passing mocked adapters or native Forge AI does not satisfy either live API gate. Complete these checks before the final 13-milestone walkthrough.

## Phase A evidence and reproduction

- Public HTTPS Play → Check again → Continue transferred the selected deck into local Play on 2026-09-15. Health returned product/protocol and exact public-origin CORS. Earlier failure was not reproduced; no browser permission or security setting was changed. Cold/error recovery still belongs in S1.
- `node game/tools/phase-a-engine-proof.mjs` creates four synthetic legal Commander decks, three distinct browser controllers and one native AI in the actual pinned Forge runtime. It uses separate authenticated HTTP clients, verifies private hands/hidden libraries, rejects cross-seat tokens, retries exact actions and verifies actual land zone changes. It is a transport integration proof, not browser UAT or a complete game. It shuts down only its own test engine and keeps ignored evidence.
- First successful three-seat run: `game/.local/games/2026-09-15T17-06-19-942Z/phase-a-result.json`; 244 private-view checks; each human drew/played a land; passed at individual turn 3. Later expanded proof must include native AI turn and return to human seat 0.
- Expanded final-adapter run: `game/.local/games/2026-09-15T17-12-46-960Z/phase-a-result.json`; 282 private-view checks, all six cross-seat token combinations rejected, each human drew and played a land, native AI played its land, returned to the first human at turn 5. Passed and test process closed. This verifies more than opening configuration; it still is not a full game or tactical AI evaluation.
- `node --test game/tests/*.test.mjs`: 37 passing tests at the first foundation checkpoint. Java `BridgeProtocolCheck`: 16 passing checks; `CombatAssignmentCheck`: 10 passing checks.
- Full repository regression: all 62 suites passed after the foundation changes.
- `node game/tools/phase-a-api-host.mjs` serves a temporary form at `http://127.0.0.1:8771/`. The owner enters their key directly and explicitly starts the live test. The form supports Anthropic Claude Haiku 4.5 (default) and OpenAI GPT-5.6 Sol, synthetic game data, at most three requests and 512 output tokens per request. No configured key existed when Phase A began. Windows Credential Manager was checked at the owner's request; no Anthropic/Claude target was found and no credential values were read. The owner deferred live verification to Phase C; the idle form was stopped without making a provider request. Mocked adapter tests do not certify a live provider call.
- Anthropic uses the official [Messages API](https://platform.claude.com/docs/en/api/messages/create) and [structured output contract](https://platform.claude.com/docs/en/build-with-claude/structured-outputs). Both adapters independently reject unavailable indices, extra fields, invalid JSON, incomplete/refused output and HTTP failures. No model can directly mutate Forge state. Game tests now total 39 passing checks after adding Anthropic adapter coverage.
- GitHub Actions Tests run 543 passed for foundation commit `9a4a0fa`. Expanded-run journal audit found one manifest, 1,413 events, 46 browser actions/answers attributed to the three seats, unique sequences and unique applied action IDs despite exact retries.
- No actual friend participation, internet lobby, API strategic competency, complete multiplayer match, deck-report integration, cloud deployment or final 13-milestone acceptance is certified by this checkpoint.
