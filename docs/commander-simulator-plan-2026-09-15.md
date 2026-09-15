# CrankMagic Commander: play, understand, refine, replay

**Accepted direction · C0 implementation in progress**  
Reviewed September 14, 2026, evening in New York / September 15 UTC.  
Baseline: main at [`e2bf018`](https://github.com/minorrob/mtg-deck-matrix/commit/e2bf018b96e7a6ecae702abdd963f450501ace38), including merged PR #219. Rob authorized execution after reviewing this direction. The isolated `codex/commander-engine-c0` branch now contains an executable Forge proof and a recorded-game table preview. See [the implementation evidence and remaining gates](../game/docs/c0-evidence.md). The human/API game is not yet playable.

## 1. Recommended outcome

Build **CrankMagic Commander as a local game companion**, connected to the existing website. Keep the website as the place to build and refine decks. Open the companion to play your exact list against three independently piloted AI decks, inspect all four battlefields, enjoy the card art, and return a detailed report to that deck's History and card table.

Use **one established deterministic Magic engine**, with **Forge as the first candidate**, behind a new adapter. Prove that adapter in a short technical spike before committing to the implementation. Use AI for tactical choices, deck playbooks, and explanations. The engine determines what is legal and what actually happens.

This is the most consequential change to the existing game plan. A schema-valid AI description of a card's effect does not establish that its timing, targets, replacement effects, or interactions are correct. Resolving an unsupported card as a no-op can quietly change the winner. Those approaches cannot produce the reliable deck-performance evidence requested here.

### The experience we are building

1. In the existing deck table, refine your list and choose **Play this version**.
2. Fill the other three seats using your library, a saved Lab candidate, an Archidekt deck URL, or a pasted export. Generated opponents retain the budget-and-bracket workflow delivered in #219.
3. Review the exact lists, rule support, table settings, AI personalities, and spending limit.
4. Play a real four-player game: opening hands, mulligans, draws, mana, priority, stack, triggers, attacks, blocks, choices, and eliminations.
5. Inspect cards, public zones, targeting links, and the reason the game is waiting. Pause, save, and resume.
6. Open a postgame report showing what each card did, what its abilities produced, where a chain broke, and which opposing effects disrupted the plan.
7. Return to **the same deck version** in CrankMagic, stage swaps in its table, save a new version, and play again against the same pod or a fresh one.

**First success:** one complete, saved, replayable game with your deck and three AI opponents, followed by a report imported into the website, a reviewed deck edit, and a second game with that new list.

## 2. What exists and what this plan changes

### Repository reconciliation

| Existing work | Verified baseline and treatment |
|---|---|
| [`docs/crankmagic-game-plan.md`](https://github.com/minorrob/mtg-deck-matrix/blob/e2bf018b96e7a6ecae702abdd963f450501ace38/docs/crankmagic-game-plan.md) | Retain G0 lobby, four deck sources, common table settings, graph-derived playbooks, AI-game labeling, cost controls, and deterministic fallback. Replace the proposed AI adjudicator and revise G1–G7 sequencing below. Section 9 already records five decisions; the README and final paragraph still saying those decisions are pending are stale. |
| [`docs/crankmagic-playspace-plan.md`](https://github.com/minorrob/mtg-deck-matrix/blob/e2bf018b96e7a6ecae702abdd963f450501ace38/docs/crankmagic-playspace-plan.md) | Preserve its staged deck/collection moves, shared List/Sheet/Table projection, artwork, single-click inspection, and performance goals. Its **PR 4 is Shelf mode**, expected by Rob to become GitHub #220. That is separate from the game plan's G4. |
| [`design/crankmagic/simulation-fidelity-plan.md`](https://github.com/minorrob/mtg-deck-matrix/blob/e2bf018b96e7a6ecae702abdd963f450501ace38/design/crankmagic/simulation-fidelity-plan.md) | Carry forward one rules authority, actual decks at every seat, information isolation, tested card support, replay evidence, versioned protocols, and cautious interpretation of results. Replace its proposed new UMD rules kernel with a reuse-first engine decision. |
| [`docs/simulator-enhancement-plan.md`](https://github.com/minorrob/mtg-deck-matrix/blob/e2bf018b96e7a6ecae702abdd963f450501ace38/docs/simulator-enhancement-plan.md) | Preserve completed typed-mana, opening-hand, ramp-accounting, and reporting work. Do not reopen those as missing work. The new game gets its own engine/protocol identity. |
| `sim-engine.js`, `combat.js` | The default simulator still uses profile opponents and simplified effects. An opt-in `combat: "board"` path and combat tests now exist; saying there is no combat implementation anywhere would be wrong. Neither path provides the complete four-deck game/priority foundation needed here. Preserve them as versioned historical estimators and useful test references. |
| `crankmagic-lobby.js`, `crankmagic-game.js`, `deck-sources.js`, `draft-builder.js` | Reuse the implemented lobby and normalization/import paths. Extend their contracts without replacing them. Add a real start-game path after support checks. |
| `crankmagic-loops.js`, `crankmagic-trace.js`, `crankmagic-strategies.js`, `card-classify.js` | Reuse vocabulary and candidate strategy graphs. A discovered cycle is a hypothesis; it is not proof that the game executed a legal loop. Preserve both measurements separately. |
| `collection-model.js`, `collection-repository.js`, `collection-evidence.js`, `crankmagic-decks.js`, `game-record.js` | Reuse deck versions, revisions, report provenance, game history, and conservative statistics. Current game records are coarse summaries, not a detailed event stream. Add a versioned integration contract and explicit game-source fields. |

PR [#219](https://github.com/minorrob/mtg-deck-matrix/pull/219) is merged. It fits generated opponents to their budget and Game Changer target before spending the remaining budget on upgrades. Preserve this behavior. The Game Changer count is a builder setting and one bracket constraint; it does not by itself prove a deck's actual playing strength or full bracket compliance.

GitHub returned no PR #220 at the baseline check. Treat its scope as **in progress per Rob**, not delivered. Before implementation, read its final diff, rebase onto the merged main, and refresh the shared-module inventory. This planning package was created in a separate source snapshot; neither active local checkout was edited.

### Changes proposed for review

| Earlier decision/design | Refined recommendation | Reason |
|---|---|---|
| Browser BYOK key in `localStorage` | User still supplies the key; a local broker holds it in session memory, with optional Windows-protected persistence | Fits the newly allowed local standalone option and keeps the key out of web-page storage and exports. |
| Kitchen-table rules now, stricter later | Correct rules for a declared, tested card pool from the first playable release | Good telemetry depends on correct interactions. Keep play comfortable through automatic passes and sensible stops. |
| AI resolves unknown cards as deltas | Engine handlers resolve supported cards; unsupported paths block measured play or enter a labeled manual sandbox | Structural validation cannot establish Magic semantics. |
| Classifier shapes execute most cards | Classifier informs search and playbooks; engine card definitions execute abilities | A role such as “draw” omits costs, timing, conditions, targets, and replacements. |
| Roughly 35 calls and $0.23–$0.35 per game | Measure API usage in representative games and enforce a configurable budget | Game length, prompt sizes, retries, model choice, and decision frequency vary. |
| Postgame reporting near the end | Event recording begins with the first engine adapter | Instrumentation and deterministic replay shape the engine contract. |

These decisions are the accepted implementation direction. Earlier documents remain historical context, with this successor taking precedence for the game engine, key handling, telemetry, and delivery sequence.

## 3. Delivery architecture

### Local companion first

A Windows launcher starts a local service and opens the game interface in a browser window. Package its required runtimes so ordinary use does not require a terminal. The game remains usable independently with imported deck packs and cached card art. API-backed opponents require internet; tested local pilots remain available offline.

```text
CrankMagic website: deck table / Build / Discover / History
       | exact deck/pod pack               ^ result/advice pack
       v                                   |
Local Commander UI <----> local session service + AI broker
       ^                         |
       | public/seat views       | typed decisions, recorded answers
       |                         v
       +------------------- Forge adapter + pinned engine
                                      |
                             event journal + replay tape
                                      |
                          local reports / SQLite / backups
```

The local UI and hosted website share card presentation and exchange contracts where practical. They do **not** share an IndexedDB database: browser storage belongs to an origin. The collection remains authoritative in the website; the game holds immutable snapshots of lists and match state.

| Option | Assessment |
|---|---|
| **Local service + browser game UI** | Recommended. Supports a mature Java engine, local secrets, durable logs, and headless batch runs while reusing web presentation. |
| Desktop wrapper around that same UI | Add after the game is dependable if a dedicated window/installer improves daily use. It must use the same service and engine. |
| Hosted website + authenticated local engine bridge | A later convenience. Prove browser security/pairing behavior first; retain file exchange as a working path. |
| Entirely static browser game | Viable only with a substantial new/browser-portable rules engine and a different key strategy. Higher rules-development risk; not the recommended route to a solid simulator. |
| Hosted backend | Unnecessary for personal use. Keep outside this delivery. |

### Engine selection: Forge first, with an explicit exit gate

[Forge](https://github.com/Card-Forge/forge) already supplies a Magic rules engine and AI Commander play. Source inspection found a substantial [`PlayerController`](https://github.com/Card-Forge/forge/blob/master/forge-game/src/main/java/forge/game/player/PlayerController.java) choice interface and [`IGameEventVisitor`](https://github.com/Card-Forge/forge/blob/master/forge-game/src/main/java/forge/game/event/IGameEventVisitor.java) events for casting, resolution, mana, damage, priority, zones, tokens, counters, and turns. Those are credible integration seams. **They are not an existing supported JSON game API.** We must build and maintain that adapter, including choices embedded inside resolutions and missing causal instrumentation.

[XMage](https://github.com/magefree/mage) is the alternative: it supports local servers, multiplayer Commander, AI, and rules enforcement. Evaluate it if Forge cannot expose all required decisions, deterministic recovery, or correctly filtered observations economically. Do not build both adapters in production.

Record the selected upstream commit, card definitions, dependencies, and license notices. Forge's repository identifies GPL-3.0; XMage identifies MIT. Keep a clear boundary and retain the relevant notices in any package. MTGO is a UX/reference source, not the engine being embedded.

**Five-to-eight engineering-day spike; deliver evidence, not a slide:**

- Load four exact deck snapshots and execute a scripted multiplayer game without the Forge desktop UI.
- Expose a human decision and an AI decision through the same typed protocol, including targets, payment, triggered choices, and blocking.
- Record a cast → response → resolution chain with stable object IDs and source attribution.
- Replay saved commands/chance results to the same canonical state hashes with the API disconnected.
- Save during an unresolved choice, restart the process, and recover that choice without re-spending tokens or duplicating actions.
- Audit local fallback pilots and all serializers for access to opponents' hidden information.
- Produce a card/ability coverage report for the first four decks, then the user's six-deck pool.

If these fail, time-box an XMage comparison and revise the estimate. Do not quietly fall back to AI adjudication. A custom kernel is a separately estimated, narrower project if neither integration works.

### Proposed module boundaries

| New area (names provisional until #220 lands) | Responsibility |
|---|---|
| `game/contracts/` | Deck/pod snapshots, seat observations, decision prompts, actions, events, reports, schema migrations |
| `game/engine-adapter/` | Pinned engine binding, choice interception, support audit, filtered views, event enrichment, chance recording |
| `game/service/` | Match lifecycle, persistence, replay, process supervision, private AI contexts, key handling, budget ledger |
| `game/ui/` | Four-seat board, hand, inspector, stack, choices, turn controls, replay, postgame report |
| `game/analysis/` | Per-card counters, causal chains, loop execution, disruption classification, version comparisons |
| `crankmagic-game-link.js` | Website export/import integration using existing repository transactions and deck fingerprints |
| `tests/commander/` | Contract, rules scenarios, hidden-information, replay, migration, and browser journeys |

Keep the existing site deployable as static files. New runtime requirements belong to the companion subtree.

## 4. Exact decks and repeatable randomness

### Import and freeze the list

Use the existing source adapters, but normalize to a stronger immutable `DeckSnapshot`: source URL/type and retrieval time; local deck ID/version; existing `M.fingerprint` value for compatibility; a canonical SHA-256 gameplay hash; commanders; quantities; stable Oracle identity; printing/art identity; all faces; and the card-data/rules versions.

An Archidekt **search page is a discovery surface**, not a deck. Open a result, then import its deck URL. The observed search page contains incomplete and oversized lists as well as complete decks. Use a documented export/paste fallback when its current API fails, is private, or changes. Preserve maybe-board categories and exclude them from the selected playable hundred. Cache a dated snapshot so a remote edit cannot change a game already underway.

Validate commander eligibility/partnership, singleton exceptions, color identity, banned-list snapshot, and the selected list's total. Show legality separately from house/bracket settings and engine support. A non-owned card can be played in this personal test environment; simulated cards never acquire physical ownership or reservations.

**The 100 includes the commander(s):** a usual list starts with 99 library cards and one commander in the command zone; a valid two-commander configuration starts with 98. After drawing an opening seven, those libraries contain 92 or 91. Tokens and spell copies are generated objects, not extra cards inserted into the starting deck. [Commander format reference](https://magic.wizards.com/en/formats/commander)

### Chance service and replay

- Seed a match from operating-system entropy, or accept a specified practice seed. Record the algorithm/version and every chance result needed to reproduce play.
- Use an unbiased shuffle of each actual library, with draws removing its top card. Never select each draw independently with replacement, smooth opening hands, or let the AI choose the next card.
- Track reshuffles, scry/surveil ordering, tutors, bottoming, milling, reveals, and random choices as state transitions.
- Keep seating, library/chance operations, and pilot randomness separate where the adapter permits. Never share randomness across concurrently running matches.
- Forge's [`MyRandom`](https://github.com/Card-Forge/forge/blob/master/forge-core/src/main/java/forge/util/MyRandom.java) currently exposes a static RNG that can be replaced. Therefore use **one engine process per active match** initially; process isolation plus a captured chance tape precedes claims of safe parallel batches. Audit other randomness and collection iteration during the spike.
- Save all actual player decisions and AI responses. Replaying a seed does not reproduce a fresh model call.

Three distinct commands: **Replay** reproduces the recorded game; **Rematch** runs new decisions with a fresh seed by default; **Practice this position** forks a labeled training branch. Choosing a repeated scenario is explicit and does not silently mix with ordinary match statistics.

## 5. Rules, chains, and a bounded support promise

### Required rules surface

Pin the current rules document for a release and test against it. At review time the official rules page links the August 19, 2026 text. The implementation matrix covers:

- Multiplayer opening procedure, free first mulligan, first-turn draws, turn order, and extra turns.
- Priority on empty and occupied stacks; retaining priority; passing around surviving seats; mana-ability exceptions.
- Cast/activate, modes, targets, additional/alternative costs, typed mana, and commander tax.
- Triggers in active-player/nonactive-player order; replacements, prevention, continuous effects, and repeated state-based checks.
- Combat assignments and both damage steps; current damage division, not obsolete blocker ordering.
- Commander movement, per-commander combat damage, loss conditions, draws, and player departure.

In particular, commander movement to graveyard/exile and to hand/library follow different procedures; a single generic replacement would be incorrect. [Official comprehensive rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt)

The UI may auto-pass according to preferences, but the engine must retain the actual response windows. Every prompt states **whose turn it is**, **who has priority**, **what is resolving**, and **what choice is required**.

### Player health, commander damage, poison, and elimination

Start ordinary four-player Commander at 40 life. Damage changes life only after prevention, replacement, combat assignment, and other applicable effects resolve; declaring an attack alone never deducts life. Poison counts upward to 10. Commander combat damage counts upward to 21 **from each individual commander**, independently of its current controller. Separate partner commanders do not combine. Life gain never erases commander-damage history. The UI also shows remaining poison/commander capacity where useful. [Comprehensive Rules](https://magic.wizards.com/en/rules)

The engine evaluates state-based loss conditions before priority: life at or below zero, ten poison, 21 combat damage from one commander, and an attempted draw from an empty library. An empty library alone is not a loss. Card effects may win/lose the game, replace losing, or prevent a player from losing; concession also exists. Preserve simultaneous losses, a rules draw, and multiplayer departure cleanup. The counter displays the engine outcome and its reason; numeric thresholds never bypass a card exception.

Retain Rob's requested **collective commander-damage option** as an explicit house setting: `commanderDamageMode: "pooled-house-rule"`, versus default `"per-commander"`. The house setting totals combat damage from all commanders received by that player, still keeps each source in the matrix, and uses 21 as its threshold. Pin the setting before shuffle, apply it inside the engine's state-based checks, label the table/report, and keep these results separate from standard Commander. This option is not enabled in the C0 adapter; it requires an engine patch and exception/removal tests before becoming selectable.

### Coverage policy

Start certification with Chulane, Krenko, Atraxa, and Shadrix lists selected from the user's collection, then add Quintorius and Felothar. These are candidate benchmark decks, not a claim that every current card is already supported. Add a control deck, spellslinger/storm deck, graveyard deck, and compact-combo deck before calling the simulator broadly useful.

For each imported deck, audit every face, ability path, generated token/card, and relevant interactions across the pod. Publish `verified`, `implemented but not yet certified`, `unsupported`, or `manual` evidence. A recognized card name or 99% coverage is insufficient if the missing 1% is its win condition.

- **Measured play:** all required paths supported; unknown runtime paths pause and quarantine the result.
- **Practice sandbox:** explicit manual corrections can continue a game; every correction is recorded and the run remains labeled assisted, excluded from ordinary comparison statistics.
- **Development:** AI may propose handlers and tests offline. Reviewed code/data changes are what ship. No generated code or guessed effects execute during a measured game.

### Chains and loops

Use the graph to suggest a line, then let the engine verify and execute it. Keep four different counters: **graph visits**, **legal opportunities**, **attempts**, and **completed iterations**. Also count actual triggers, copies, and resource output. A trigger that is countered or replaced is not a completed payoff.

A loop record contains participating card/ability IDs, entry state, costs, resource change per iteration, chosen repetition count, interruption point, and resulting state. Distinguish a resource-limited repeated line, a shortcut to a chosen finite count, a mandatory repeating state, and a compute limit. A resource limit or watchdog timeout never awards a win or becomes a rules draw automatically.

For a proposed shortcut, execute/check a representative cycle, prove its invariants, retain all players' opportunities to interrupt, and stop at the chosen boundary. If choices or random outcomes invalidate that proof, execute individually or pause for support. Record both the compressed representation and enough detail to expand a representative iteration. See the official rules' current **Taking Shortcuts** section (732), rather than relying on old rule numbering.

## 6. Three AI players that make choices fairly

Each seat has a separate observation and memory. It receives its own hand and deck brief, public battlefields/stack/zones, public counts, remembered reveals, and the current decision. It does not receive another hand, unrevealed library order, private face-down cards, future draws, or the complete match seed. Public-list practice can be an explicit mode; normal play reveals only what its rules allow.

Never put all three private seat states into one shared model conversation. The broker owns filtering, including what the user-facing log and explanations may display during play. A fairness test swaps inaccessible cards/order while preserving a seat's observation and verifies identical input and deterministic decision behavior.

### Decision protocol

```json
{
  "matchId": "...",
  "decisionId": "...",
  "stateVersion": 184,
  "seatId": "seat-2",
  "kind": "choose_targets",
  "observation": {"publicState": "...", "ownPrivateState": "..."},
  "options": [{"id": "target-17", "label": "Chulane"}],
  "constraints": {"minimum": 1, "maximum": 1}
}
```

The reply selects offered IDs, bounded values, and a short explanation. Validate the match, seat, decision ID, state version, targets, and payment before accepting it. Complex decisions are staged; do not try to enumerate every possible target/payment/combat combination in one giant prompt. Ranking a shortlist may help the pilot, but the adapter must still support all legal human choices.

### Pilot layers

1. **Local baseline:** legal heuristics for every decision type; graph-aware setup, mulligan, sequencing, removal, attack/block, and recovery. Reuse native AI only after its information-access audit passes.
2. **Deck playbook:** generate and cache strategic priorities for the exact deck hash, rules version, graph version, table constraints, and user style. Compile editable structured rules; arbitrary prose does not execute as a policy.
3. **API judgment:** ask at material choices, including threat removal, protection, attacks, tutor selection, or competing game plans. Models return actions, not changes to the board.
4. **Optional table personality:** concise commentary/deals grounded in public actions. Public tactical reasons and private strategic intentions are separate. Off by default during fast testing.

Retain the prior Anthropic direction initially: configurable Haiku/Sonnet roles, with current model IDs verified at setup. The [provider's current model reference](https://platform.claude.com/docs/en/models/overview) is the authority, not prices copied into an old plan. Keep the provider interface replaceable.

### Independent difficulty and reassessment after draws

Every AI seat has its own **Difficulty 1–5** control: Learner, Casual, Focused, Advanced, Expert. Higher levels increase candidate search, rollout count, and lookahead; they never reveal hidden cards or change rules. Keep difficulty distinct from deck bracket, deck strength, and personality. Record difficulty and policy version in the pod and report. Initial budgets in `game/contracts/pilot-policy.mjs` are hypotheses to calibrate through fixed scenarios and matched-seed comparisons, not a claim of optimal play.

After **each individual card draw**, mark that seat's plan stale and reassess its new hand, legal mana sequences, protection, interaction, combo progress, win conditions, and survival threats. Reassess at other material state changes too. Estimate odds from that seat's permitted information, without reading future draws. A multi-card draw invalidates the plan for each card; expensive API work can wait until the next actual choice so it uses the final legal observation. Do not grant priority during resolution merely because a card was drawn.

At every offered engine decision, evaluate the whole current hand and board, not only the newest card. Reject an in-flight answer if its decision, state version, or planning generation has become stale. Optimize expected survival and chance of winning according to the deck's strategy; do not promise mathematically optimal multiplayer play. The C0 policy/state contract is tested, but the draw-event subscription, search implementation, provider, and calibration are still pending.

### Latency, failure, and cost

Reserve the worst allowed cost of each request against a per-match budget before sending it, including output limits and cache-write pricing when applicable. Reconcile with returned usage; persist charges and uncertain requests across restart. Never retry a response merely because the game UI reconnected. Provider-level budgets remain useful as an additional limit.

Use a user-visible thinking indicator and a configurable deadline (initial target: local choices under 250 ms; ordinary API decisions roughly 2–8 seconds when the provider allows). On deadline, invalid reply, exhausted budget, or outage, use the tested local pilot or pause at the user's chosen policy. Reject a late reply after fallback changed state. The report records every fallback and its reason.

The initial playbook/escalation schedule is a **measurement hypothesis**, not a fixed calls-per-game promise. Record calls, input/output/cache tokens, latency, retries, and cost by seat and purpose. Target an adjustable $1 default game ceiling for the first pilot evaluation; this is a design setting for review, not a guaranteed game price.

## 7. A table where the cards remain the focus

The concept image accompanies this plan. It communicates visual direction; generated card faces/text and the sample game state are illustrative. The newer executable C0 replay preview uses actual printing images and recorded engine states.

**Put the shared counter in the middle of the board**, like a phone placed between the players at a physical Commander table. Use four colored quadrants with large life totals and visible poison/commander counts. Selecting a quadrant opens that player's full commander-by-commander damage matrix, remaining thresholds, and elimination reason. Keep the device compact enough that cards remain prominent. Rob's [Lotus life-counter reference](https://apps.apple.com/us/app/mtg-life-counter-app-lotus/id1498057193) establishes the physical-table interaction. This central placement supersedes the earlier image's scattered life badges.

### Views

| View | What the player sees |
|---|---|
| **Table** | Opponent battlefields above and to either side of the central four-player counter; your larger battlefield and hand below; stack/inspector at the right. All four seats remain present. |
| **Focus a seat** | Expand one battlefield while retaining a compact strip for the other seats, your hand, and the stack. Scroll/zoom dense boards locally. |
| **Inspect a zone** | Large-card grid for a public graveyard/exile/command zone, with filters, ordering, and return to table. Hidden zones show counts/backs unless an effect permits viewing. |
| **Expand hand / card showcase** | Straighten the hand into a readable gallery; enlarge a selected card, switch faces, pin it, and compare another. |
| **Replay and analysis** | Same renderer driven by saved events, with step/turn/choice navigation and optional postgame omniscient inspection. |

At 1920×1080, target battlefield cards around 110–150 CSS px wide, hand cards 140–180 px, and inspector cards 300–360 px. At 1366×768, use Focus/hand expansion and a collapsible analysis drawer. Do not shrink a crowded board to unreadable stamps. Group genuinely equivalent tokens visually, while preserving individual game objects and a way to expand/select them. Grouping must respect tapped state, counters, damage, abilities, attachments, and relevant identity.

Reuse CrankMagic's navy/blue design, art treatment, card resolver, glossary, and gestures. Extract rendering helpers if necessary. **Do not reuse collection move commands as game actions:** putting a card onto a game battlefield must never reserve a physical copy, move a lot, or alter a shopping list.

### Playing and reading the table

- Hover/focus enlarges; click selects/inspects; an explicit action or legal drag begins a cast/activation. Clicking a card must not accidentally spend it.
- Show payment preview and manual mana choices, modes, targets, X values, trigger ordering, replacement choices, and multi-block assignments.
- Distinguish active turn from current priority. Provide pass once, yield to a chosen stop, hold priority, and cancel auto-yields.
- Give visible numeric and text state for life, commander damage, poison, mana, card counts, counters, tapped state, marked damage, attachments, and temporary modifiers.
- Animate causal links briefly: source → trigger → target → outcome. The event log can replay those links on demand.
- Keep ordinary animation short and interruptible. No AI decision or rules transition waits for decorative animation. Include reduced motion, keyboard operation, contrast, and optional sound.
- Warm the pod's image cache before play, load larger art on inspection, reserve image dimensions, and keep cached art usable offline. Missing images have a clear labeled fallback and retry; supported image coverage is part of the release gate.

**Performance targets, to measure on this computer:** local input acknowledgement p95 below 100 ms; healthy 60 fps dragging/inspection on normal boards; responsiveness with 200 permanents and 1,000 equivalent tokens; no token-ID collapse in rules or telemetry. Virtualize logs and off-screen galleries. The first release targets desktop; phone editing/history continue through the existing app.

## 8. Telemetry: record the causes, not just a transcript

### The durable record

Create an append-only local journal, with SQLite indexes/aggregates and exportable JSON/NDJSON. Every accepted command has an operation ID; every committed event has a sequence number. Write a recoverable transaction before acknowledging the action. Recovery replays the command/chance tape into the pinned engine and checks canonical state hashes. Use engine checkpoints only if restoration is proven; a screenshot or UI snapshot is not a resumable game state.

Default game storage to `%LOCALAPPDATA%/CrankMagic/Commander`, with explicit backup/export to a chosen folder. Keep runtime private records out of the source repository. Version cached assets separately so updating card art cannot alter a historical rules snapshot.

```text
MatchManifest
  schema, matchId, mode, origin, startedAt, completionStatus
  exact four deck snapshots + hashes, seat order, house settings
  engine/card-data/rules/adapter versions, pilot/provider/playbook versions
  chance protocol, seed reference, recording completeness, assistance flags

GameEvent
  sequence, eventId, actionId, parentEventId, causalSpanId
  turn/phase/prioritySeat, actor/owner/controller, visibility
  sourceCardInstance + Oracle/printing ID + ability ID
  targets, zone transition, costs, result/replacement/prevention details
  resource delta, rule/handler reference, state hashes, outcome

DecisionRecord
  decisionId, observation hash, legal option IDs, selected action
  local/API/human source, public explanation, private explanation visibility
  model/prompt versions, tokens/cost/latency, fallback or rejection
```

Store identity across copies, tokens, control changes, and zone-change object lifetimes. Record enough context to distinguish who **owned** a card from who **controlled** its ability. Sensitive private observations and raw API payloads stay in a separate local debugging tier, opt-in for export; ordinary summaries do not need them. API keys never enter the journal, crash reports, deck packs, or provider request logs.

The upstream event visitor is a starting point. Add instrumentation around payment, trigger creation, replacement/prevention, resolution, and changes to continuous effects when ordinary engine events lack a cause. A coarse display log cannot be promoted into precise causal telemetry after the fact.

### Required card and mechanic measurements

| Area | Record and expose |
|---|---|
| Card access | Draws versus tutors/other movement to hand; first seen; turns held; discarded/milled/exiled; stranded while present; legal opportunities versus decisions to hold |
| Playing cards | Land plays, casts, activations, copies, resolutions, counters, invalidated targets, declined optional choices; all attributed by card instance and deck version |
| Mana | Sources, colors, restrictions, mana generated, paid, left unused, and lost at boundaries; rituals separately from permanent ramp; nonmana costs separately |
| Triggered mechanics | Trigger opportunities, created triggers, ordered/placed triggers, resolutions, missed/declined/replaced/prevented outcomes, and downstream output |
| Resources and combat | Actual card draw, tokens, counters, damage/life loss/life gain, commander damage, sacrifices, deaths, attacks, blocks, and recovery after removal/wipes |
| Chains and loops | Candidate graph ID, engine-validated entry, attempts, completed iterations, net resources, interruption window/source, stopped or shortcut outcome |
| Opposing disruption | Countered spell/ability, targeted destruction/exile/bounce, wipe, graveyard hate, sacrifice pressure, theft, taxes, ability/trigger suppression, resource denial, and combat pressure |
| Reliability | Unsupported paths, manual changes, event gaps, replay mismatch, cutoffs, pilot fallbacks, costs, and elapsed time |

Define denominators. For example, **cast rate when drawn** uses eligible games with the card drawn, excluding commander command-zone access and treating copies separately; **mana blockage** counts sampled decision points where payment alone prevents a relevant action, not every moment the card is in hand. Distinguish “not affordable,” “no legal target,” “timing unavailable,” and “pilot chose to hold.”

### What a useful report says

Provide an overview, sortable per-card table, mechanic/loop view, mana timeline, and disruption view. Each finding links to exact events and the board just before/after them.

Illustrative finding, not a measured result: **“Your sacrifice engine was assembled, then a removal spell eliminated its untap component. The next three activations were unavailable. Open turn 7 to inspect the interruption.”** A stronger claim such as “another protection spell would improve the deck” is a hypothesis until a replay branch or controlled comparison supports it.

Keep **opportunity → attempted line → interruption → lost output → recovery** as distinct fields. A correlated loss is not proof that a mechanic caused it. Several cards enabling one payoff should have shared attribution links; do not independently add the full payoff to every card and sum it as deck output.

## 9. The website feedback loop

### Exchange contracts first; convenience bridge second

**Website → game:** `CommanderPodPack@1` contains exact deck versions, selected sources, table settings, constraints, and relevant graph/playbook evidence. It contains no collection lots or key. Saved Lab results play only after selecting the precise candidate list to freeze.

**Game → website:** `CommanderResultPack@1` contains match/deck IDs and hashes, outcomes, provenance, coverage/reliability flags, per-card/mechanic metrics, findings, and replay references. A full self-contained replay can be a separate optional attachment. Summaries remain readable when the companion is not running.

Initially use explicit export/import, which works despite browser-origin differences. Then add paired handoff if it proves reliable: loopback-only service, exact origin checks, short-lived pairing/session token, no wildcard cross-origin access, bounded schemas, and no secrets in URLs. Test HTTPS-to-local restrictions in the actual supported browser; do not make a successful demo depend on disabling browser protections.

### Import and refine behavior

1. Import transactionally and deduplicate by `matchId`/pack hash. Match the exact retained deck fingerprint, not commander name.
2. Store `origin: human_vs_ai` or `ai_vs_ai`, protocol/version fields, support flags, and replay linkage through a schema migration. Legacy games without origin remain `unknown`; do not invent a provenance label for them.
3. Show AI games separately from recorded human games and historical Monte Carlo estimates. An assisted run, aborted game, cutoff, and rules draw have different statuses.
4. A report for an older list appears under that historical version. Never attach it as evidence for a newly edited hundred.
5. In the deck table, add optional evidence columns: drawn/played, output, held/unusable, interactions suffered, and links to moments. Empty evidence is “not observed,” not zero performance.
6. **Review changes** opens proposed cuts/additions under existing budget, commander, pinned-card, and collection constraints. Each swap has a reason and an evidence label.
7. The user applies swaps through the existing table's staged/Confirm workflow. Preserve its revision/conservation checks and receipt; game telemetry never writes inventory statuses directly.
8. Save a new deck version, revalidate its hundred, retain the previous report, and launch the next game with that new snapshot.

Keep detailed game logs local by default. The old `data/game-logs/` compile-to-GitHub path is not the automatic route for private, full-fidelity matches. A public export is a separate user action with private data removed.

### From enjoyable games to a useful simulator

Use the same engine and card definitions for interactive play and automated pod tests. A batch may use a different documented pilot budget; it may not silently use different rules.

Start with small, useful experiments: hold three opponent lists fixed, rotate seats and pilot assignments, test baseline versus a small number of candidate swaps, then confirm finalists on fresh seeds and held-out opponents. Separate chance streams and record scenario matching. The same numeric seed alone is insufficient when changed actions consume different randomness.

Report games completed, uncertainty, effect size, pod/pilot sensitivity, unsupported runs, and computation budget. Keep historical estimator scores in their own protocol; do not rebrand them as measured four-deck win rates. Do not promise 120,000 full games in a browser or tune score weights until a favored list looks stronger.

A single fun game is valuable evidence to inspect. It is not enough to rank every card or diagnose the human pilot. Human-play calibration remains a later effort requiring representative recorded games.

## 10. Magic Online reference review

After the client finished loading, I inspected **Display & Sound Settings**, **Game History**, and **In-Duel Settings** in the installed app. Card-preview and hover-zoom controls were visible. Multiplayer stops have separate rows for the three opponents and the player. Game History displayed no games to replay; its visible “Auto Save Draft Logs” option concerns draft logging and does not establish a Commander game-event export format. A bounded read-only search of the active MTGO app-data directory found no game/replay-named files to validate.

The [official multiplayer guide](https://www.mtgo.com/getting-started/getting-started-multiplayer) shows the opponent fields across the top, expandable zones, card resizing, hover zoom, priority indication, and commander-damage inspection. Its [tips guide](https://www.mtgo.com/getting-started/getting-started-tips-tricks) explains stops, responses, holding priority, and per-effect yields.

Adopt those interaction principles, with CrankMagic's clearer card-first design. Add a later **optional MTGO log importer** only after obtaining a real sample and verifying its format and missing information. Treat imported transcripts as observations, not a complete engine state or an authoritative rules database. No live match or replay was inspected in this review; gameplay-layout references came from the official guide. No game was joined and no settings were changed.

## 11. Build sequence and reviewable gates

Use new game milestone IDs below; they are not promised GitHub PR numbers. Do not reuse “PR 4” for this sequence. Estimates are focused engineering days, including validation, with the reuse route assumed. They are planning ranges, not dates or agent-session counts.

| Milestone | Deliverable | Acceptance gate | Estimate |
|---|---|---|---|
| **C0 — Reconcile and prove engine adapter** | Reconcile merged #220; inventory shared UI; Forge spike; recorded engine decision | Four lists load; complex choice round trip; event causes; replay/restart; hidden-information audit; written go/no-go | 5–8 days |
| **C1 — Snapshots and local shell** | Pack contracts, support report, launcher/service, immutable decks, journal foundations | Round-trip every deck source; valid one/two-commander opening; no collection mutation; duplicate/stale pack handling | 4–7 |
| **C2 — Four-deck playable core** | Engine choices, local pilots, basic four-seat board, save/resume/replay | Full games finish legally; all choices reachable; deterministic recovery mid-stack; unsupported paths stop honestly | 8–15 |
| **C3 — Card-first game table** | Table/Focus/zone/hand views, targeting, payments, stops, keyboard and art cache | Full user journey at 1920×1080 and 1366×768; dense-board performance; no hidden cards exposed | 6–10 |
| **C4 — Three API-backed pilots** | Playbooks, isolated seat contexts, decision calls, key pane, spend ledger, local fallback | All three opponents make observed API-backed decisions; invalid/stale/outage/cap tests; zero API calls during replay | 5–8 |
| **C5 — Mechanics and disruption analysis** | Complete telemetry enrichment, loop accounting, causal report, evidence-linked findings | Hand-audited event totals reconcile; interrupted and shortcut loops count correctly; no shared-payoff double counting | 6–10 |
| **C6 — Refine and replay in CrankMagic** | History/result import, deck-table evidence, staged swaps, version comparison, small batch runner | Play v1 → inspect report → confirm swaps → save v2 → play v2; historical evidence remains attached to v1 | 5–8 |
| **C7 — Reliable personal release** | Six-deck certification, additional archetypes, packaged runtime, backup/recovery, optional paired bridge | Soak/crash/recovery and regression gates; cold install/launch; accurate unsupported-card report; user playthrough | 6–10 |

**Total estimate: 45–76 focused engineering days, roughly 9–15 working weeks for one developer after plan acceptance.** A first useful local game arrives at C2; the visual API-backed alpha at C4; the requested end-to-end refinement loop at C6. Card-support gaps, engine adaptation, and recovery can extend the range. Re-estimate after C0 using measured evidence.

Map to the earlier game plan: G0 is retained; G1 becomes C1/C4; G2 becomes C4; G3a/G3b become the engine integration in C0–C2; G4 becomes C2/C3; G5 becomes C2/C4; **G6's AI adjudicator is removed**; G7's reporting begins at C1 and becomes C5/C6. Personality polish can follow C6. Play-space PR5/PR6 continue on their own ownership track; game-specific code need not wait for unrelated collection polish once shared contracts are agreed.

### Tests that determine whether this is a simulator

- **Deck/randomness:** separate physical card instances; exact zone conservation; correct commander extraction; first mulligan; draw order; tutors/reveals; deterministic shuffle/replay; no cross-match RNG interference.
- **Priority/choices:** empty-stack stop; retain priority; multiple responses; simultaneous triggers; mandatory/optional choices; payment restrictions; no duplicate or stale command application.
- **Rule fixtures:** triggered draw versus cast; copies versus casts; countered abilities; token creation/death; blink identity; counters/proliferate; cost taxes; replacement ordering; commander tax/return/damage; current combat division and relevant keywords.
- **Loop fixtures:** bounded repeated sequence; resource-growing optional shortcut; interruption on a selected iteration; mandatory repeating state; random-choice loop; watchdog with no fabricated result.
- **Information:** hidden-state permutation tests; face-down exile; remembered reveals; controller changes; API prompts and public logs contain only permitted information.
- **Telemetry:** independent expected totals for a scripted match; costs paid once; triggers created/resolved distinct; event/replay hash agreement; known source for every measured output; partial journal marked incomplete.
- **AI/failure:** fixtures for all prompt types; schema rejection; retry ambiguity; timeout; provider outage; budget exhaustion; restart in flight; local fallback; no unexpected spend.
- **Integration:** packs with old schemas, stale deck fingerprints, duplicate matches, malicious text, oversized payloads, missing replay files, and parallel website edits; collection conservation and existing repository regressions remain green.
- **Experience:** full game through mouse and keyboard; large-card inspection of every seat; dense token board; offline cached art; save/resume at a decision; postgame report and reviewed 100-card edit.

The release promise is **correct, observable play for the certified pool and explicit boundaries elsewhere**. Neither an upstream engine's card count nor a successful happy-path match proves universal support.

## 12. Scope and review recommendation

Rob approved execution of the **local-first, website-integrated, engine-reuse** direction. C0 is underway. Its concrete result is an adapter feasibility report and executable four-deck test. The current [evidence report](../game/docs/c0-evidence.md) separates proven capabilities from gates still required before a playable release.

Preserve these preferences: one human plus three AI seats by default; library/Lab/Archidekt imports; budget-and-bracket opponents; user-supplied API key; visible spending limit; local fallback; AI games recorded as such; beautiful large cards; and the existing table as the place to refine the hundred.

Defer multiplayer networking, accounts/cloud sync, monetization, an independent second deck editor, broad MTGO integration, and elaborate table-talk features until the core play-and-refine loop is dependable. Arbitrary card coverage expands through verified support, not a promise of automatic interpretation on day one.

### Review package and provenance

- This document is the accepted successor to the existing plans, grounded in the pinned main snapshot and the live website's implemented lobby.
- The initial planning pass did not build an engine. The subsequent C0 work built pinned Forge, ran actual four-deck games, checked full-game replay, exercised pending-opening-choice recovery, and created the interactive table preview. Validation details and limitations live in the evidence report.
- Companion deliverables: `commander-table-concept.png`, an illustrated HTML review, and `mockup-prompt.txt`. The concept was generated with the built-in image-generation tool. It is not a rules-accurate screenshot or an implemented UI.
- No repository push, PR creation, production deployment, collection edit, or paid gameplay API call was performed.
