# Commander companion — engine proof and table preview

This is the first executable checkpoint of the [accepted plan](../docs/commander-simulator-plan-2026-09-15.md). It runs the committed decks through pinned Forge and displays an actual recorded match. **It is not yet a human-playable or API-piloted game.** [Evidence and remaining gates](docs/c0-evidence.md).

[Table preview image](docs/table-preview.png) · [Grouped Focus preview](docs/focus-board-preview.png). The local branch includes merged website PRs #220 and #221; the engine fixture preserves its original #219 data provenance.

## Open the table

From the repository root:

```powershell
node game/tools/build-probe-review.mjs
node game/tools/serve-review.mjs
```

Open **http://127.0.0.1:8768**. The review server binds only to loopback and serves six explicit read-only routes, including the local mat artwork. It does not launch an engine or make AI calls. Its replay input is the local `health-full-42` run; another checkout must generate a run first or supply its run directory to `build-probe-review.mjs`.

The phone-shaped counter sits between all four boards. Each board follows Rob's reference mat: battlefield upper left, lands below, Command / Exile over Library / Graveyard on the right. The human seat uses the supplied floating-cube mat artwork. Lands remain battlefield objects; the split is presentation only. Library piles show a back and count.

Select a player counter for life, poison, damage from every commander, remaining thresholds, and the recorded loss reason. Select a card for actual artwork; **View hand**, **Focus board**, and zone piles provide larger views. Focus fills the window with wrapping groups for creatures, artifacts, enchantments, planeswalkers, battles, other permanents, and mana / lands. Its slider sizes cards from 120–260 px; empty groups collapse to a summary. Life counters, public zones, and a shortcut to your hand remain in its header. Card and zone inspection opens above Focus and returns to the same board. Opponent hands remain hidden. The small life display on each mat mirrors the central counter. Use the timeline to inspect recorded phases. Pod setup exports each opponent's intended Difficulty 1–5; those settings do not change the native pilots that produced this recording.

Card images currently load directly from Scryfall. The seven missing non-token image references were resolved from the public committed fixture. Token artwork, offline caching, selectable faces, full stack presentation, and attachment-aware grouping are later UI work. Focus assigns each permanent to one group using the replay's card-facts type line: creatures take precedence, then lands, then artifacts and enchantments. Mana rocks stay under Artifacts; face-down or missing-type objects stay under Other permanents. This is a visual partition, not current-type adjudication. The preview groups matching recorded attributes; its projection does not yet include attachments and all continuous effects.

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

## Validation

```powershell
node tests/commander-snapshots.mjs
node tests/commander-pilots.mjs
```

The focused Java rules command above checks actual Forge behavior. The full-game replay verifier compares random requests, every diagnostic projection hash, cast/resolution links, and the fixture's opening hands/seat visibility. See the evidence report for exact counts and qualifications.

Windows checkout note: existing asset/data hashes and some source-slicing tests require the committed LF bytes. Clone with `git -c core.autocrlf=false clone ...`; converting unchanged files back to their committed LF representation fixes those checkout artifacts without changing source. The existing `browser-geometry` and `page-budget` suites currently fail at their Unix-oriented Playwright import on Windows, before browser assertions. The new companion UI was separately exercised through the browser controls.
