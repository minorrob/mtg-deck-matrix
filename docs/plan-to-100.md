# CrankMagic to 100% — every task, in order

Rob, 2026-09-25: *"Provide me with the task list to get us to 100% done for everything (play, all
functionalities, accounts, etc.)"* — and, the same day: *"Everything cloud, remember. But we will need to
test our game engine thoroughly. I will have Grok Bot create 4 agents that will play against each other,
some simulating humans, others as AI … and log all of their findings then give them to you."*

**Everything cloud** means:
- The workshop, the accounts, the card data and **Play** all run on Cloudflare.
- The local Windows host, its gateway, the trycloudflare tunnel and the Forge launcher are frozen and are not the path to 100%.
- Games are played on **CME**, the CrankMagic Engine in `game/engine/`, inside the cloud.

Legend:
- **Rob** marks something only Rob can do: a decision, a purchase, a secret, a dashboard setting, a login, or a game night.
- Sizes are relative: S is about a PR, M a few, L a stretch of sessions, XL a campaign.
- Sources: `docs/plan-program-2026-09-24.md` (the program), `docs/engine/PLAN.md` (the engine), `docs/plan-account-cloud.md`, `docs/plan-data-sync.md`, `docs/design/2026-09-25-redesign-r3/INTAKE.md` (the design plan), `docs/decisions-2026-09-23.md` and `docs/decisions-2026-09-24.md`.

## Where it stands (2026-09-25)

| | |
| --- | --- |
| **Done** | Stage 1: the web app minus Play on crankmagic.com. Stage 2: invite-only accounts with cloud library sync, on production and staging. The first-look list (#372), live as Worker version `0ad25bb1`. |
| **The engine** | Phase 1's kernel gate has passed: 1,000 four-player games, deterministic, with hidden information holding. Phase 2 is in progress: the vocabulary, the primitives and the combat keywords are done. 69.2% of the cards in Rob's seven decks (330 of 477) need only rules the engine already has. No card has a definition yet, so `createGame` still refuses. |
| **Not started** | Play in the cloud, the AI door, the compiler, the data sync, and the r3 design refresh. |

## M1 — The design refresh (r3), the web app · L

The full plan and its ten decisions are in `docs/design/2026-09-25-redesign-r3/INTAKE.md`. The steps are R3.0–R3.12, and Play's screens wait for M5.

- [ ] **Rob:** make the r3 decisions, including satoshi-900 and the landing page's audience.
- [ ] R3.0 intake and tokens → R3.1 type → R3.2 shell and account chip → R3.3 Settings, with **Delete account** → R3.4 Decks hub → R3.5 Deck page → R3.6 Library → R3.7 Explore → R3.8 **Landing page** → R3.9 5:7 cards → R3.10 Archidekt and precons → R3.11 Lab wizard → R3.12 mobile.

## M2 — Card data that refreshes itself · M

The plan is `docs/plan-data-sync.md`.

- [ ] **Rob:** turn on R2 (free plan). Make an *R2 Storage: Edit* token and put it in the GitHub secret `CLOUDFLARE_R2_TOKEN` himself. Choose the schedule: daily prices and weekly graph is recommended.
- [ ] Create the bucket.
- [ ] Add a scheduled GitHub Actions run of `tools/refresh.mjs`.
- [ ] Add a publish step to R2: dated keys plus `current.json`, keeping 7 runs.
- [ ] Have the Worker serve `/data/*` from R2, with `run_worker_first` and an R2 binding.
- [ ] Have the app read `current.json` in place of `?v=` pins.
- [ ] Show "Card data: prices refreshed today" in Settings › About.
- [ ] Add **EUR** prices, which the r3 Settings page offers.
- [ ] Refresh precon lists, for R3.10.
- [ ] Split or move `graph-played.json` (21.6 MB) before it reaches the 25 MiB per-file cap.
- [ ] Check Scryfall's and EDHREC's terms for automated pulls.

## M3 — Accounts and operations, hardened · M

- [ ] **Self-service account deletion.** A Worker route that removes the person's data, a type-to-confirm dialog in Settings (R3.3), and the Access e-mail removal as Rob's runbook step. The privacy page already promises this.
- [ ] **Rate limits on `/api/*`**, per identity and per IP.
- [ ] **Monitoring:** Workers observability logs, an alert on 5xx and on sync conflicts, and a weekly check. **Rob:** set the alert e-mail.
- [ ] **Backups:** confirm D1 Time Travel's window, and export a nightly copy to R2 once M2 turns it on.
- [ ] **Rob, ongoing:** invite people through the Access "Invited" policy. The free plan's cap is 50 people; past it, the program's swap point applies.
- [ ] **Rob:** how his workbook reaches his library now that Load Live is gone. Push it into his account through the API, or make the app the source of truth.
- [ ] Update the program document: sync ships whole-library snapshots, not a commit log.

## M4 — The engine plays Rob's seven decks · XL

This is `docs/engine/PLAN.md` phases 2 and 3, re-read for the cloud.

- [ ] **Finish 2.3, the keyword families the decks use:**
  - Flash · Equip · Haste · Flashback · Overload · Enchant · Changeling;
  - the rest of the 53 deck keywords;
  - the deck effects outside the top 25 (mill, destroy all, surveil, choose a card, copy a permanent, sacrifice, repeat, ETB replacement, …).
- [ ] 2.4 remainders: the **scenario runner** suite, and `cards/index.mjs` (resolve and suggest).
- [ ] **Phase 3, tier 0:** hand-author the 477 cards of the seven decks in batches of 40–60, each card with a scenario test.
- [ ] **4.2, the house pilot:** the engine's own opponent, which sees only its seat and costs nothing per game.
- [ ] **4.1b, a storage adapter** (PLAN §3.8): the runtime writes its journal and checkpoints through an interface, not Node's `fs`, so a Durable Object can host it. It needs a test that a checkpoint resumes identically in another process.
- [ ] The engine suites PLAN §5 and §7 ask for:
  - performance budgets: boot under 200 ms, a view under 2 ms, a random four-player game under 3 s;
  - card scenarios;
  - the bridge contract.
- [ ] Deck legality at prepare against a dated banned list, refusing by name.
- [ ] The CME history event contract (user, card, action, targets, effects), which the History band and the playtest logs read.
- [ ] **Gate G1:** all seven decks load, and 100 seeded games per deck against three house pilots and 100 against random pilots finish with zero exceptions, identical replays and no leaked hidden information.
- [ ] **Rob:** the engine documents disagree with each other in places, and these calls settle them:
  - **Forge's role.** Rob is "done with Forge". PLAN phase 5, the Forge differential, becomes CR adjudication plus the M8 playtests, or Forge stays as an offline oracle only. *Recommended: drop phase 5.*
  - **What a deck with unsupported cards does in Play v1.** Refuse it by name, per the program, or compile the cards just in time. *Recommended: refuse by name, then compile once M7 lands.*

## M5 — Play in the cloud · XL

The program's Stage 3 table, built to the r3 Play design.

- [ ] **The game room:** one Durable Object per match, running CME behind the M4 storage adapter. It holds the authoritative state and hides hands.
- [ ] **Card definitions served to the room** from R2 or KV, not bundled. `oracle.json` alone is 14 MB.
- [ ] **A live transport:** WebSocket on the Durable Object, carrying ordered view updates and receipts, with no polling.
- [ ] **The Worker front door:** create, join and leave a table, and hand a seat to an account (Access identity). Identity stays out of the engine.
- [ ] **The lobby, per r3's 2b design:**
  - four status quadrants, each with the color-identity fan;
  - Change deck and **Choose mat**;
  - Invite by e-mail, link and QR;
  - the table rules and Host tools;
  - auto-launch with the 10-second countdown, which waits for every human seat.
- [ ] Port the seat and table lifecycle from `table-lifecycle.mjs`, `seat-access.mjs` and `table-broker.mjs`: two to four mixed seats, readiness, rematch, and refusing with instructions.
- [ ] **Reconnect and disconnect:** pause at a required decision, send a fresh permitted view on reconnect, never concede silently, and let AI take over only by agreement.
- [ ] **The board per r3:**
  - three views: Table, Focus and Full screen;
  - **vitals** in each board header, plus the Table vitals matrix;
  - the **card-size slider** (60–160%, per player);
  - **Show hand** (contemplate, then choose);
  - card zoom;
  - the History drop-down and Game history;
  - the Coach shell, with stub replies until M6;
  - **5:7 cards**;
  - phones in landscape, Focus view only.
- [ ] **Results back to the library:** a finished game files its record under the deck and syncs with the account. AI games carry a badge, and a guest's deck never overwrites the host's library.
- [ ] Ship the **audio pack** (88 files, 5.3 MB) and wire the three clips that can never fire today, once CME emits their events.
- [ ] **Release:** a release profile that ships Play. The builder refuses `game/` today, and the Coming Soon mark comes off. Staging first.
- [ ] **Launch gate: hidden information.** Tests inspect network payloads, logs and reconnect snapshots, and MP-07 to MP-09 run live.
- [ ] **Speed:** Rob's rule, "we don't leave users hanging for 5 seconds", measured over the network.
- [ ] **Rob:**
  - Who can play v1: the accounts' invite list, or a narrower allowlist.
  - Buy Workers Paid ($5 a month) when the engine's CPU per request passes the free plan's 10 ms. That is likely at M5.
  - Provide end-user journeys for the invited guest and the host. The record says the seats and the join flow should follow them.
  - Where "End current game" lives during a live match.

## M6 — The AI door · M

- [ ] Its own **Access application:** Google, with passkey MFA if the plan offers it, and never the emailed code.
- [ ] An **AI allowlist** in D1, separate from the invite list, that Rob manages.
- [ ] **The key:** Rob runs `wrangler secret put` for the Anthropic key himself. It never appears in chat and never reaches a browser.
- [ ] **Spend caps:** in the provider console (Rob), a per-game cap with a visible meter, and optionally AI Gateway.
- [ ] **A log of every call:** who made it, what for, the tokens used and the cost.
- [ ] **Through the door:**
  - LLM seats in the lobby's AI configurator;
  - the **Coach's** real replies (r3's chat panel);
  - the workshop's AI features, starting with "explain the score" and recommendations.
- [ ] **The privacy page says what goes to the AI** before any AI feature is switched on. **Rob:** approve that wording.

## M7 — Every card: the compiler and AI card reconciliation · XL

This is PLAN phases 6, 7, 9 and 10.

- [ ] 6.1 templates · 6.2 the parser · 6.3 the primitive catalog and `engine-compile.mjs` on a **200-card sample**, reporting cost and pass rate to Rob. **Rob:** approve the sample's spend and confirm the provider's terms.
- [ ] **AI card reconciliation** (`plan-card-extraction-skill.md`): four checks (schema, fidelity to the oracle text, smoke test, and a differential against CR adjudication). Output goes to `data/engine/scripts/` with an onboarding ledger, and the compiled store ships as data.
- [ ] 6.5 the fuzzer · 6.6 the remaining library constructs · 7.1 a ledger that names each card's missing construct · 7.2 the go-live vocabulary · 7.3 compile about 27,000 cards · 7.4 a nightly fuzz · 7.5 **`engine-cards.yml`**: a set refresh that runs end to end, alongside M2.
- [ ] **Gate G4:** in-vocabulary cards covered, the rest refused naming what they lack, and 0 exceptions in 5,000 fuzzed games.
- [ ] Phases 9 and 10, toward every card and none refused. Re-measure the tier shares on the 31,830-card pool; the plan's 94.3% was measured on Forge's scripts.

## M8 — The playtest program: Grok Bot's four agents · M, repeating

Rob's plan: Grok Bot runs four agents that play each other, some simulating humans and some as AI, over many games, logging every finding and handing the logs over. What this side builds so they can:

- [ ] **A playtest table on staging:** staging.crankmagic.com with Play on, and games that never touch production data.
- [ ] **Access for the agents.**
  - **Rob:** create four Access **service tokens**, or four invited test addresses, for staging only.
  - Each agent signs in as its own seat.
- [ ] **Two kinds of seat:**
  - "simulating a human": an agent drives the real board in a browser, seat by seat, through the same UI a person uses;
  - "as AI": the lobby's house pilot, or an LLM seat through the AI door (M6).
- [ ] **A game record they can hand over:** every game exports its seed, its journal and its per-seat projections. **Game history has a Download for playtest button.** With it, any game replays identically here.
- [ ] **A findings template**, one row per finding:
  - game id, seat, turn and phase;
  - the card or cards involved;
  - what happened against what should have;
  - the CR rule, if they know it;
  - a screenshot or journal excerpt;
  - a severity.
- [ ] **The triage loop:**
  1. Ingest the logs.
  2. Replay each game from its seed and journal.
  3. Class each finding: a rules bug (checked against the CR), a missing card definition, a UI bug, a performance problem, or a UX note.
  4. Fix it, with a test.
  5. Re-run the affected games.
  6. Report back what was fixed and what was ruled working-as-intended, with the CR citation.
- [ ] **Exit criteria:** a run of games (50 is proposed) with zero engine exceptions, zero hidden-information leaks, every rules finding adjudicated, and no severity-1 or severity-2 UI finding open.
- [ ] **Rob: a game night on CME.** That is gate G5's own test.

## M9 — Cutover, and Forge retired · M

- [ ] `CRANKMAGIC_ENGINE` defaults to `crank`, or the flag goes entirely.
- [ ] Forge's tools and the §10 removal list come out: LICENSE §4(a) is deleted, and THIRD-PARTY-NOTICES' Forge section becomes history.
- [ ] **Rob:** delete `forge`, `runtime`, `forge-oracle` and the two environment variables.
- [ ] Freeze the local host's documents as history: `game/README.md`, `docs/uat-deployment.md`, `live-load.yml`, and the stale plans (next section).

## M10 — Finishing work toward 100% · L

- [ ] **The Coach's logic,** through the AI door.
- [ ] The Lab's data-driven strategy (R3.11).
- [ ] **Accounts' later features** (the old persistent plan's Phase 5, if Rob still wants them):
  - read-only deck links (`crankmagic.com/d/…`);
  - several libraries per account;
  - To Trade as a hosted page;
  - playgroups.
- [ ] Spectators, if wanted. The engine can already produce a view with no hands in it.
- [ ] The workshop queue:
  - the defect items left from W.4–W.7, including the service worker's "new version, reload" prompt;
  - BACKLOG #1, #4 and #5, if still wanted: autosave, copies as individual things, curve coverage in the readiness strip.
- [ ] The ratchets, all the way down: raw hex at 137 · 458 · 31, and the UK spellings.

## Housekeeping and open calls

- [ ] **Rob:** github.io. A "moved" page, which also rescues libraries saved there, or leave it.
- [ ] **Rob:** `www.crankmagic.com`. A redirect to the root is a dashboard setting.
- [ ] **Rob:** the repository, private or public. This matters: github.io publishes `data/live-*.json` and all of `main`.
- [ ] **Rob:** GitHub rulesets and secret scanning; SPF, DKIM and DMARC for crankmagic.com.
- [ ] **Rob:** authorize the Cloudflare MCP server with `/mcp`, so dashboard-only settings can be done here.
- [ ] Mark the superseded documents: `plan-web-to-local-table-2026-09-21`, `handoff-2026-09-24-direction`, `plan-one-source`, `crankmagic-persistent-plan` (Vercel and Supabase), `crankmagic-game-plan`'s bring-your-own-key.
- [ ] Fix the engine documents' disagreements:
  - ACTIVE.md's "phase 1 not started";
  - PLAN §6's blank status cells;
  - `game/engine/index.mjs`'s "PHASE 0, STILL" header;
  - the two meanings of "4.3";
  - where the compiler sits.
- [ ] Update `tests/uat/crankmagic-journeys.mjs` to the V.4b deck page.
- [ ] **Rob:** the 15 kept branches and two folders. The audit found nothing in them to bring over.

## Rob's decisions, gathered

| When | Decision |
| --- | --- |
| Now (M1) | The r3 type (satoshi-900) · the landing page's audience (invite-only or open) · "Get notified" · where the undrawn Menu entries go · EUR and Delete account · Merge on restore · the land icon |
| Now (M2) | Turn on R2 · the token · the schedule |
| Now (M4) | Forge's role (drop phase 5?) · unsupported cards in Play v1 |
| Soon (M3) | The alert e-mail · the workbook's path into his library |
| M5 | Who plays v1 · Workers Paid · the guest and host journeys · End current game |
| M6 | The AI allowlist · the key · spend caps · the privacy wording |
| M7 | The 200-card sample's spend and terms |
| M8 | Service tokens or test addresses for the agents · the exit criteria · the game night |
| M9 | The deletions |
| Any time | github.io · www · repository visibility · GitHub rulesets · DMARC · Cloudflare MCP · the kept branches |

## The order

1. M1 (design) and M2 (data) in parallel with M4 (the engine to the seven decks).
2. M3 alongside them.
3. M5 (the cloud table) once M4's storage adapter and house pilot exist.
4. M6 before any LLM seat or the Coach's replies.
5. M8's playtests start as soon as M5 plays the seven decks on staging, and repeat through M7.
6. M9 once G4 and G5 have passed.
7. M10 last.
