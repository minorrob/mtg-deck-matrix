# CrankMagic Online — local browser play

Open the **Play** tab in CrankMagic. The public site offers **Open game setup**, which opens the local companion at http://127.0.0.1:8768/app/#game. The local service and pinned Forge runtime must be running on this computer.

For the shortest checklist, see [CrankMagic Online quick start](docs/CRANKMAGIC-ONLINE-QUICK-START.md). For the complete cold-start walkthrough and troubleshooting, see [How to start CrankMagic Online](docs/HOW-TO-START-CRANKMAGIC-ONLINE.md). The [CrankMagic Online overview](docs/crankmagic-online-overview.html) is a standalone product summary.

The startup guide includes both supported paths: one human against three AI players on this computer, and mixed human/AI tables using private HTTPS invitations.

From this repository:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\game\tools\start-crankmagic.ps1"
```

The Windows helper starts a hidden, persistent host, writes startup logs to ignored `game/.local/host/`, and preserves an existing running game. It looks for the generic Windows Credential Manager entry `crankmagic_openai_api`; when present, setup offers the OpenAI pilot without putting the key in the page, URL, files, or logs. GPT-5 Mini is the default and GPT-5 is the stronger manual fallback. Pass `-OpenAiCredential ''` to disable stored-key loading for that host. In Codex, use `$start-crankmagic` after installing the skill from `game/skills/start-crankmagic/`. The public launch dialog checks the host and offers startup/retry instructions before transferring a deck. Forge starts automatically when you launch the prepared table.

## Start and play

1. Choose your saved deck, a preloaded variation, a Lab starting list, or a public Archidekt deck.
2. Set bracket and budget, then choose one to three AI opponents and their commanders/decks. Select Forge native AI or the OpenAI pilot; the stored-key path starts with GPT-5 Mini.
3. **Prepare decks**, review the resolved hundred and compatibility notes, then **Launch game**.
4. Keep or mulligan the opening hand. Double-click the library for your pending draw-step draw. Drag a land/spell from hand or your commander onto your mat.
5. Forge pays a legal mana cost automatically when its planner can pay it. Targets, optional effects and non-mana decisions remain yours. Unpayable costs produce a notification; cancel returns the card through the engine.
6. Use the image-based card action panel, phase controls, and response windows. Empty opponent priority stops are skipped; effect responses and end-step opportunities remain. Yield skips empty stops through that turn and still stops for stack effects and required choices.
7. Use **View options** to follow the active player or hide either side pane. **Show board** swaps a seat into the main canvas; **My board** returns yours. Focus remains available separately.
8. Cards spread out until crowded. Drag battlefield cards together to group them, or drag a card out onto empty mat space. These arrangements never change game state. Layout groups currently last for the browser session.
9. **History** supports card/event search, phase filtering and more events. **Tracker** includes mana sources by color, observed mechanics, current rules and notes.
10. **Game setup → End current game** ends the engine position while retaining the private local journal. Ending a position is not a resumable save.

The current implementation supports two to four mixed human/API/native-AI seats, expiring QR invitations, durable lobby membership, reconnect/rematch flows, per-seat private projections, public history, and deck-linked match reports. Start with `-RemoteGuests` to create a temporary scoped HTTPS guest gateway; loopback links remain local-machine test links. Some complex choices still require the Forge window. Native AI compatibility warnings remain visible before launch. Card text is not a guarantee that native AI supports every strategy.

See [browser play checkpoint](docs/browser-play-checkpoint.md), [latest validation](docs/play-ux-validation-2026-09-15.md), and [AI card audit](docs/ai-card-support.md). The remaining instructions below reproduce the earlier engine proof, not the current interactive UI.
## Reproduce the engine proof

Prerequisites: Node 24, Git, a JDK 17, Maven 3.9.11, and the Forge checkout at `game/engine-adapter/forge.lock.json`'s commit. The Windows runtime used here is Temurin 17.0.20.1+1. Forge is GPL-3.0-or-later; the Java adapter source carries that license notice. Redistributing a bundled release will require its corresponding source and notices.

The existing local setup is adjacent to this checkout:

```text
../forge/
../commander-runtime/jdk-17.0.20.1+1/
../commander-runtime/apache-maven-3.9.11/
../commander-runtime/m2/
```

To build another clean engine checkout, clone [Card-Forge/forge](https://github.com/Card-Forge/forge), check out `58bcd59062a3b44019195a3c25d6ab41a7fe2f61`, and run from the CrankMagic repository:

```powershell
./game/tools/build-forge.ps1 -ForgeRoot ../forge -JdkRoot ../commander-runtime/jdk-17.0.20.1+1 -MavenRoot ../commander-runtime/apache-maven-3.9.11 -MavenRepository ../commander-runtime/m2
node game/tools/export-live-pod.mjs
node game/tools/run-forge-rules.mjs ../forge ../commander-runtime/jdk-17.0.20.1+1
node game/tools/run-forge-probe.mjs --forge=../forge --java=../commander-runtime/jdk-17.0.20.1+1 --run=my-match --seed=42 --turns=100 --bridge
node game/tools/run-forge-probe.mjs --forge=../forge --java=../commander-runtime/jdk-17.0.20.1+1 --run=my-replay --seed=42 --turns=100 --bridge --replay=game/.local/runs/my-match/rng.json
node game/tools/verify-forge-probe.mjs game/.local/runs/my-match game/.local/runs/my-replay
node game/tools/build-probe-review.mjs game/.local/runs/my-match
```

Use new run names: existing evidence is never overwritten. `--turns` counts individual player turns, not table rounds. A turn limit or the whole-process watchdog produces an incomplete proof, never a measured game result. Seed 42 currently completes; seed 220 at a longer horizon exposes a large token/untap chain that exceeds the watchdog.

Pending opening-choice recovery:

```powershell
node game/tools/run-forge-probe.mjs --forge=../forge --java=../commander-runtime/jdk-17.0.20.1+1 --run=my-pending --seed=220 --turns=4 --bridge --pause-before-answer
node game/tools/run-forge-probe.mjs --forge=../forge --java=../commander-runtime/jdk-17.0.20.1+1 --run=my-resumed --turns=4 --resume=game/.local/runs/my-pending
```

Do not change the engine, adapter, or pod between pause and resume. Recovery checks their hashes and compares the reissued decision before answering. This proves **opening-choice recovery only**. It is not a mid-stack checkpoint implementation.

## Data and trust boundaries

- `contracts/deck-snapshot.mjs` copies the deck allowlist, validates a hundred cards, strips the commander(s) into the command zone, freezes the result, and records version/fingerprint/gameplay hash. Six snapshots export; the default test pod is Chulane, Krenko, Atraxa, Shadrix. Final legality is checked by Forge.
- `fixtures/live-identities.json` contains twenty exact Scryfall Oracle identities missing from the committed public card references. It does not modify the website library. Normal runs need no identity lookups.
- `engine-adapter/src/crankmagic/ForgeProbe.java` records engine events, RNG requests, phase projections, cast/resolution links, player health, and a typed opening-player choice. It uses four native Forge pilots as an uncertified integration driver.
- `contracts/pilot-policy.mjs` defines per-seat difficulty and stale-plan rejection after draws. It is a contract/state helper, not a completed search or provider implementation.
- `.local/` is ignored. Raw engine journals and RNG tapes contain private match information and **must never be sent to an AI pilot or displayed as a live public log**. The preview exporter is restricted to this diagnostic fixture's visible zones and seat 0 hand; general information-flow certification is pending.
- No API key, API spend, live collection edit, report import, website deployment, or hosted bridge is implemented in this checkpoint.

## Before you host

```powershell
node game/tools/doctor.mjs
```

One answer to "can this computer host a game tonight?": the Node runtime, the Forge card database
and its script count, the Java runtime, whether anything already holds the host port, the Windows
credential for API pilots, and cloudflared for remote guests. It exits non-zero when something
blocks a game, and distinguishes that from a warning (API pilots or remote guests will not work,
the rest will) and from a check that does not apply to this machine. The desktop launcher runs it
through `GET /api/doctor` and refuses to report "Ready to play" over a blocking problem.

Point it at a Forge checkout elsewhere with `CRANKMAGIC_FORGE_ROOT`, and a JDK with
`CRANKMAGIC_JDK_ROOT`.

## Pasting a deck

A pasted list is read in whatever shape it arrived in: `1 Sol Ring`, `1x Sol Ring`, a bare name for
a single copy, two comma-separated columns in either order with quoted names, tab-separated from a
spreadsheet, `Commander` / `Deck` / `Sideboard` headers, and Archidekt or Moxfield set codes,
collector numbers and foil markers trailing the name. The commander is whichever side of the blank
line is small, so first and last both work, or whatever a `Commander` header names.

What it will not do is pick a commander for you. A hundred cards with no blank line and no header
gives nothing to go on but a guess, and it asks instead. Lines it cannot read come back with their
line numbers rather than one sentence about the whole paste.

## Who is the table waiting on

`GET /api/table/readiness` answers it once, for the host screen, the guest screen and the launcher
alike, derived from the same blocker list the countdown transition uses so a lobby cannot refuse to
start while every seat on it looks ready. Each seat reports claimed / connected / deck validated /
ready, how long it has been quiet, and what specifically is blocking it. `launch` carries the stage
the engine is at -- `engine-spawning`, `engine-spawned`, `waiting-for-engine`, `bridge-green`,
`seated`, or `failed` with its reason -- so the wait between the countdown and the board is
readable instead of blank.

The countdown is ten seconds, and Forge is asked to start when it *begins*, not when it ends. The
boot and the countdown run together; a fast engine still waits for the clock.

## When the table will not move

`POST /api/table/force-advance {"seatId":n}` clears the decision the named seat is sitting on. It
takes a legal action from the same enumerator the AI pilots use, so Forge validates it exactly as
it validates a click, and every use is written to `force-advance.ndjson` beside the match journal.
Host-only: it is deliberately absent from the guest gateway's routes.

## Validation

```powershell
node tests/commander-snapshots.mjs
node tests/commander-pilots.mjs
```

The focused Java rules command above checks actual Forge behavior. The full-game replay verifier compares random requests, every diagnostic projection hash, cast/resolution links, and the fixture's opening hands/seat visibility. See the evidence report for exact counts and qualifications.

Windows checkout note: existing asset/data hashes and some source-slicing tests require the committed LF bytes. Clone with `git -c core.autocrlf=false clone ...`; converting unchanged files back to their committed LF representation fixes those checkout artifacts without changing source. The existing `browser-geometry` and `page-budget` suites currently fail at their Unix-oriented Playwright import on Windows, before browser assertions. The new companion UI was separately exercised through the browser controls.

### Combat and recommendations

Use **Combat** beside Card / Tracker / History to review attack assignments, blockers, damage types and the combat event recap. Selecting a defender highlights it; choosing creatures assigns them to that defender. Review the assignments, then **Confirm attackers**. Attack power is shown separately from damage actually dealt.

**Recommended actions** appears during your turn and can be collapsed. It provides local, explainable suggestions using your hand and public boards; reviewing a suggestion opens the card's actions. It does not spend mana or play cards for you. Recommendations are heuristic, and the engine still validates timing, costs and targets.
