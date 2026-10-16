# Fable engine and simulation handoff

Prepared October 16, 2026, for Fable on the other platform. Rob has assigned **Fable the game engine and simulation model**, and **Codex the UI and user management**. This is the current coordination record; the older paused-lane entries are historical. Fetch remote refs and read the newest `docs/ACTIVE.md` before starting because the staging email release is still in progress.

## Start here

1. Read `AGENTS.md`, the latest section of `docs/ACTIVE.md`, this handoff, and `docs/engine/plan-card-load-program.md`. Read narrowly; generated card files and old handoffs are large.
2. Create your own engine/simulation branch from current `origin/main`. Claim the lane in ACTIVE with your actual branch; do not reuse Codex's checkout or switch its branch.
3. Review the existing commander/payment patch described below before rebuilding that fix. It is on a mixed development commit, so do not cherry-pick the entire commit.
4. Triage the missing multi-effect draw and the priority/payment contracts, alongside the approved card-load program. Record which item you are implementing and which are deferred; do not silently treat all feedback as completed.
5. Keep the public projected view and replay contracts compatible. Ask for a versioned contract change before the UI consumes different semantics.

## Verified repository and deployment state

These values were read from Git and both live `version.json` endpoints on October 16. A Worker version can change when a secret is deployed without changing the source version below.

| Surface | Verified state | Meaning |
| --- | --- | --- |
| `origin/main` | `da39a2ed2420a60b8284db470258710513e83370` | PR #734 merged the October 14 tabletop work. No October 15/16 development changes have merged at this checkpoint. |
| Staging source | `da39a2ed2420a60b8284db470258710513e83370` | `release/cloud-staging` record `bad37e87`. Live endpoint returns `cloud-staging`. |
| Production source | `c9ad0e65264582a786d02710e0b76774d064a792` | `release/pages` record `b0cdc46e`; deployed Worker version `5bfe13ab-d140-473c-9282-fa4707732271`. Production has not received the newer tabletop, sharing, or Babylon work. |
| Broad development branch | `codex/ui-playtest-plan-oct15`, checkpoint `192e2f77` before this handoff | Draft [PR #735](https://github.com/minorrob/mtg-deck-matrix/pull/735). Includes plans, commander/payment patch, unfinished shared desktop shell, sharing/profiles, and isolated Babylon prototype. Do not merge wholesale. |
| Focused email release | `codex/staging-resend-oct16`, checkpoint `245bfb8e` before this handoff | [PR #736](https://github.com/minorrob/mtg-deck-matrix/pull/736). Sharing/user management and Resend, with board, stage stylesheet, and game engine restored to deployed main. Pending CI, merge, deployment, and live email acceptance. |

Latest already-deployed tabletop work includes a cycling visual stack, the supplied silent volcano video, within-section card arrangement, configurable drawers, camera/card-size controls, and shared deck choices. The deployed shared catalog is the **old source**; its apparent success must not be mistaken for using the owner's current six decks. The focused release replaces that catalog with account-backed sharing.

The Babylon experiment is `ui-prototypes/babylon/`, introduced in `36bb9446`; local preview port 4391. It reads a projected recording, renders card meshes, and demonstrates lifting, inspecting, repositioning, and tapping on desktop/emulated mobile. Its taps and movement do **not** submit live game actions. It is not a replacement rules engine, multiplayer integration, or production renderer. Codex owns its further integration.

## File ownership and release coordination

| Owner | Files and responsibility |
| --- | --- |
| Fable | `game/**`: rules, room semantics, legal decisions, cards, replay, AI game policies; simulation model in `sim/**`, `tools/sim/**`, relevant engine/simulation tests and generated card data. |
| Codex | Browser UI, `crankmagic-*.js`, styles, `ui-prototypes/**`, browser interaction tests; user management, account identity, profiles, sharing, Resend, invitation admission, and related account migrations. |
| Coordinate before editing | `cloud/game-room.mjs`, `cloud/tables.mjs`, `cloud/play-worker.mjs` are game-server integration; Codex needs their table-invitation/lobby APIs, while Fable owns rules semantics. `cloud/worker.mjs`, `cloud/library.mjs`, and save-time hooks are actively involved in user-management/card-demand integration. Agree on the small change before editing a shared file. |
| Codex during current release | `tools/release-pages.mjs`, release profiles/branches, migrations 0003–0005, asset cache versions, staging deployment and live email checks. No parallel deploy or mutation of staging Access/database configuration. |

Use the Requests table in ACTIVE for cross-lane contracts. Fable may work on game/simulation files immediately, but must avoid overlapping cloud/user-management files. Reserve distinct migration numbers after checking both branches. Keep each lane's ACTIVE entries; do not overwrite the other lane's history. The room projection is the seam; UI guesses must not become game rules.

Production release remains a separate decision. The October 14 instruction to publish despite a specific test run was not a permanent test-gate exemption. CI and release rules in AGENTS still apply. Never release the broad development branch to get one engine patch.

## Commander and payment patch to review first

The relevant changes are contained in mixed commit `377d6487`, still on PR #735, and deliberately excluded from PR #736:

```
git diff origin/main..377d6487 -- game/engine/projection.mjs game/engine/rules/actions.mjs game/engine/rules/mana.mjs tests/engine-commander.mjs tests/engine-cost-targets.mjs tests/engine-tap-to-cast.mjs
```

Review and port only those paths into your own branch, reconciling newer main changes first. Do not import the whole commit, which also contains UI, sharing, and profile work.

What it changes:

- `sourceTapPlans` combines floating mana with complete outputs of untapped sources, including multi-mana outputs. A source can be used only once even if it offers several colors. Surplus remains in the pool.
- Cast availability and payment plans for hand/command-zone spells no longer require an empty pool before considering sources.
- `tapUnits` optionally exposes output bundles and activation identities; `fundingPlans` uses the existing simple solver where applicable and the bundled solver otherwise.
- The public projection adds `commanderTax` for a visible command-zone commander, using the existing persistent commander identity and counter.

Its deliberately limited scope: plain tap-only sources without life, sacrifice, counters, spending restrictions, or side effects. Variable/alternative costs and more complex activations still require explicit decisions. It is **not** the complete manual-payment design or proof that every possible commander payment is offered. Review source-search complexity on crowded boards, pruning correctness, hybrid and specifically colorless requirements, and legal source activation/timing. Do not equate an omitted shortcut with an illegal spell.

Fresh proof on the development patch, October 16:

| Command | Result |
| --- | --- |
| `node tests/engine-commander.mjs` | 55 passed |
| `node tests/engine-cost-targets.mjs` | 41 passed |
| `node tests/engine-tap-to-cast.mjs` | 46 passed |

These are targeted local results, not a green full regression run or live commander-game proof. Rerun on your final integration, including deliberate break tests per AGENTS. Codex will consume Fable's reviewed castability/payment/tax contract in the UI.

## Playtest feedback requiring engine work

The detailed approved stories are P01, P04–P10, and the rules audit in `docs/play-overhaul/PLAYTEST-PLAN-2026-10-15.md`. Latest clarifications below supersede ambiguous speech transcription.

### Missing second effect or trigger

Rob reports that a card Luke played performed one effect but failed to draw two cards. **The card and exact game have not been identified.** Do not infer a card name from that description. Earlier local searches found no matching export; staging authentication is available now, but recovery of that record is not complete.

Recover the table/match record, source revision, seat/deck, chosen modes and targets, journal, and before/after hand counts. Distinguish a skipped sequential effect from a separate unqueued trigger, legal replacement/optional choice, illegal targets, or a UI display failure. Preserve a sanitized deterministic reproduction and cover both effects, resolution order, source removal, copies, reconnect, and replay. Raw records and private hands stay out of the public repository.

### Priority and explicit Yield turn

- Rob wants seats with no meaningful legal response to auto-pass while an object is on the stack. Current `nothingToDo`/`idle` in `game/engine/rules/actions.mjs` rejects a nonempty stack. Extend conservatively; hand emptiness or apparent mana alone is insufficient. Include activated abilities, other playable zones, alternate costs, and source sequences. Unknown feasibility keeps the decision.
- Distinct from that optimization, **Yield turn is explicit permission to pass every priority opportunity for that seat during the current opponent's turn**, even when targeted or after drawing a playable card. Rob confirmed required choices must remain interactive.
- Required choices include targets, modes, optional-effect yes/no, replacement choices, ordering triggers, commander destination, payments during resolution, discards, and blockers. Do not interpret yield as declining choices, taking damage, conceding, or enabling timeout decisions.
- Persist yield by match/seat/authoritative turn ID. It expires at that turn's end, including extra/skipped turns and active-player elimination, never carries to a rematch, and has an acknowledged Stop yielding action. Required decisions take precedence; yielding then resumes within the same turn.
- Preserve Hold priority, normal stop preferences, valid mana undo, and end-turn confirmation when not explicitly yielded. UI needs separate turn owner, priority holder, decision owner, and viewed seat. Only the top stack object may resolve after required passes; cycling the visual stack is inspection only.

### Draw and phase flow

- Untap has no normal priority window; upkeep and the period after the normal draw do. Do not make every card playable in every phase to satisfy the transcription literally.
- Normal drawing is a turn-based action, not a stack object. The requested Draw card button acknowledges the pending normal draw exactly once, then offers the legal post-draw actions. The UI animation follows the confirmed result; opponents see backs/counts.
- `drawBeat` support exists, but new tables omitted it after an older automatic-draw preference. The latest request reverses the interaction for new games. Version the policy so old recordings still replay identically.
- Test first draw in two-player versus multiplayer games, the existing `skipFirstDraw` setup rule, extra/skipped/replaced draws, empty-library events, double submission, and reconnect. Preserve upkeep stops and legal instant-speed opportunities before Main 1.

### Mana payment and commander rules

- Primary UI: select a spell, choose its necessary options, highlight legal sources, let the player select/tap them, then Confirm cast. Also offer Auto-pay. Replace the long list of equivalent mana combinations; do not hide genuine strategic choices.
- One dual-output source cannot pay both colors with one tap. Combine floating mana and available sources. Account for filters, source costs/restrictions, summoning sickness, variable/alternative/additional costs, and effects on final cost.
- Auto-pay preference: use appropriate floating mana; reserve required colors; prefer basic lands for colored requirements, then other lands; use suitable colorless production for generic portions where possible. Artifacts do not necessarily produce colorless. Do not silently spend life, sacrifice, discard, or reveal information.
- Define payment drafts versus committed activations. Cancel cannot undo irreversible actions. Revalidate cost, legality, targets and revision on confirmation. Expose actionable failure reasons and a deterministic payment witness; UI must not solve legality independently.
- Commander tax is **two generic mana per prior cast of that particular commander from the command zone**, not per death, and not specifically colorless `{C}`. Partners count independently. Countered casts count; moving a commander to the battlefield without casting does not. Keep printed mana value unchanged. Project next-cast tax separately from final modified cost.
- Audit command-zone destination choices, including non-effect moves; preserve owner/controller identity, commander damage, alternate faces, reanimation and replay. The existing counter should not be rewritten as a death counter.

### Combat

Codex will first render existing authoritative attackers, defending players/permanents, blockers, and stack targets. Fable should preserve stable IDs and legal blocker/attacker pairs in the projection.

Direct blocking will be a local draft: choose an eligible creature, choose the attacker it blocks, adjust assignments, then Confirm blocks. Only confirmed assignments are public. No blocks remains subject to the rules and does not immediately apply damage. Spells are responses in legal windows, not blockers. Keep a complete accessible list/dialog fallback while the visual interface matures.

Test multiplayer defenders, flying/reach, menace, required blocks, multi-block permissions, planeswalkers/battles, removed blockers, first/double strike, trample, deathtouch, prevention, damage allocation and post-block response windows. Visual arrows must not promise final damage before those decisions resolve.

## Current deck provenance and card loading

The owner explicitly selected **staging**, not production, as the authoritative source. On October 16, staging profile revision **37** was checksum-verified: six decks, each with 100 main-deck cards counting its commander slots.

| Deck | Saved commander identity |
| --- | --- |
| D1 | Tymna the Weaver and Kraum, Ludevic's Opus, partners |
| D2 | Chulane, Teller of Tales |
| D3 | Kiora of Salt and Sand |
| D4 | Felothar the Steadfast |
| D5 | Teysa Karlov |
| D6 | Krenko, Mob Boss |

Exact live IDs/lists/checksum are kept in ignored local comparison files; obtain an authorized fresh snapshot when needed. Do not restore `data/live-state.json` or the old seven-deck bundle as the owner's current account. A passing test against a stale fixture only proves consistency with the wrong source. The user wants invitees to play shared decks without imports or card-loading setup. The new sharing service reads the owner's live library and enforces access server-side.

Prioritize regression coverage for these six actual decks and demand from saved decks. “Card definition exists” must not mean every mode/trigger/effect is correct. Include multi-effect cards, separate triggers, target-dependent effects, hidden information, controller changes, serialization and complete game replay in promotion checks. Known historical failures with lasting-control serialization, waterbend/rider mana, and amass type/subtype handling are recorded in ACTIVE; preserve their regressions rather than reintroducing them during compiler work.

The approved card-load program remains:

1. Capture unknown-card demand without personal/deck payloads; show that it was recorded for the next wave.
2. Build and calibrate the sentence library using oracle text and our own definitions, observing ADR-001.
3. Compile candidates with measured confidence. The 99% threshold is a calibrated target, not a model's self-rating or a substitute for scenarios.
4. Use the API writer as a bounded backstop below that threshold; first measure the held-out sample. **The daily budget remains unresolved in the recorded plan; do not start paid bulk generation based solely on this handoff.**
5. Trigger on deck/library save. Candidate cards may play only at labeled playtest tables; a missing engine rule gets a clear reason and demand entry. Bundled final definitions take precedence.
6. Review/promote candidates with their scenarios; update the sentence library. Wave 4d waits while steps 1–4 are built unless Rob changes that priority.

Coordinate save-time demand hooks and D1 migrations with Codex; no duplicate account store or independent deck identity. Check `docs/engine/plan-card-load-program.md` for the one-step/session/PR workflow and recalibrate dated throughput or pricing estimates before using them for budgets.

## Simulation model expectations

No simulation-model changes were made by this Codex work. Inspect the existing simulator entry points and model before claiming it shares all runtime rules. Keep three distinct claims: rules conformance, deterministic replay, and statistical deck measurement. Passing one does not prove the others or prove a deck is ready for multiplayer.

Use reproducible seeds and the same verified card identities/deck quantities. If rules and simulator abstractions differ, document them; do not silently treat an unsupported effect as zero value or alter legal game behavior to make simulation convenient. Add a representative regression for any formula, sampling, or ranking change and report variance/limits where results are estimates. Coordinate any changed score meaning with Codex before changing UI labels.

## UI contracts still needed from the engine

- Authoritative round and turn-within-round, including extra/skipped turns and eliminated seats. UI must not divide a global turn number by the original seat count.
- Structured public events with stable event/decision IDs: draw, cast, tap, damage source/target, countered spell, token creation, zone movement, life change and elimination. Preserve viewer privacy and allow reconnect without replaying animations as actions.
- Castability and failure reasons, commander tax, payment sources/options, draft/commit semantics, and current legal decision identity.
- Source of a tap: mana paid this step must not be inferred from all tapped lands. Token, attachment, face, sickness, color and mana-cost facts for card presentation.
- Combat assignment validation, priority/yield acknowledgments and pending-draw state as above.
- Existing ACTIVE requests: automatic ready countdown, host-owned synchronized appearance, authenticated table chat/history, and preferences-only account sync. Coordinate ownership: appearance/chat presentation and account sync are Codex; room semantics require agreement. Voice is later scope.
- Game Logs in account/Play menus: Codex owns discovery/UI and account checks; preserve server record authorization and version metadata. Do not expose a full hidden-state playtest record to a live game's opponents.

## Validation and current release blockers

Historical main regression run [38663852137](https://github.com/minorrob/mtg-deck-matrix/actions/runs/38663852137) failed `a11y-board` on the former full-rail locator, four `engine-breaks-anchors` UI anchors, and `generators` inventory drift. These are observed test failures, not proof that accessibility or engine behavior is correct. Repair assertions without deleting coverage. Codex owns stale UI assertions; coordinate generated inventories and intentional-break anchors.

Focused Resend branch proof: sharing 68 checks; cloud-worker 126; release-pages 223; feature-wiring 124. A deliberate removal of prior Access include rules fails the intended preservation assertion. The shipped candidate's release-acceptance passed 22 checks; the multiplayer walk passed 42 after correcting a saved-deck-name expectation and bounding clicks across transient decision redraws. It proved an empty-library invitee selected a live shared deck, two humans and an AI reached turn 4, reconnection worked, and the downloaded record replayed. These tests used local workerd, not live staging email delivery.

Staging infrastructure already changed, separately from app deployment:

- `RESEND_API_KEY` and `ACCESS_INVITE_TOKEN` are installed as Worker secrets. Never print or copy them into source.
- Additive migrations **0003_sharing, 0004_mail_retries, 0005_access_invites** were applied to staging on October 16. Production was not migrated.
- The existing staging Invited Access policy was converted to reusable with its ID, rules and single-app attachment preserved. The new helper is restricted to that policy; it does not edit other app policies.
- Owner email-code sign-in works in the dedicated test browser. Google sign-in was reported failing; its cause and duplicated Google label are unresolved. Do not widen Access rules to conceal a sign-in defect.
- Sender is `invite@crankmagic.com` through Resend. Provider-only delivery succeeded previously. Real application invitation/share delivery and fresh-invitee sign-in are still pending; a test recipient has been supplied privately.
- Seat invitations are still link-based in the game lobby; account invitations/sharing email do not by themselves complete the future seat-email workflow.

Track the email release in [Linear ROB-10](https://linear.app/robs-build/issue/ROB-10/wire-invitations-and-sharing-to-resend-prove-staging-delivery-and). Use Linear for feature implementation and QA evidence without pretending role labels are separate human reviewers. The user has connected creative/design/bug/analytics tools; Codex will use them in their aligned UI areas. Keep private identities, hidden cards, raw logs and tokens out of analytics and public GitHub.

## Local workspace caution and next report

Canonical local checkout is `C:/Users/robmi/CrankMagic/repo`; the browser's local preview is not evidence of a deployment. Unrelated `collection-model.js` edits and four untracked background MP3s belong to other work; do not discard, commit, or reset them. A broad `git add .`, hard reset, or whole-branch cherry-pick is inappropriate.

Your next report should state: branch/commit, exact engine or simulation scope, verified tests including negative proof, changed public contracts, and remaining release risks. Link the small PR and update your ACTIVE section. Coordinate the release owner before any staging deployment; production remains unchanged unless Rob separately authorizes it.
