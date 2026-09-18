# CrankMagic Online — table readiness evaluation and plan

**Date:** 2026-09-18
**Scope:** the eleven-step experience Rob specified — launcher → lobby → deck selection → readiness verification → countdown/launch → play → rematch.
**Target table:** 4 seats — Rob + 2 human guests + 1 AI seat.

## 0. What this document is based on

Evaluated: the `game/` subsystem in `minorrob/mtg-deck-matrix` at `9ee74e7` — 5 contracts, 3 servers, 30 tools, 14 UI modules, 20 test suites, 8 Java adapter classes, and the shipped operator docs.

**Not evaluated:** `CLAUDE-HANDOFF-crankmagic-online-2026-09-17.md` and `TREY-PROMPTS-SCOPE-2026-09-17.md`. Both live on the Windows workstation under `commander-phase-c`, which this session cannot read. Everything below is derived from the code and its committed evidence, not from the handoff narrative. If the local checkout has diverged from `9ee74e7`, re-run §2 against it before acting.

**Verdict in one line:** the *pure logic* is in good shape and fully tested; every failure Rob experiences lives in an **untested integration seam**, and the single most important readiness check in the spec — step 4.1, "every card maps to a Forge card" — is **not implemented at all**, despite a function that looks like it is.

---

## 1. Why the same class of mistake keeps recurring

This is the part worth fixing first, because it explains the rest.

| # | Process defect | Evidence | Consequence |
|---|---|---|---|
| P1 | The repo's trusted test runner does not run the game suites | `runtests.sh` iterates `tests/*.mjs` only; `game/tests/*.test.mjs` is never invoked | 20 suites are green but outside the gate. A regression in the game subsystem cannot fail the build. |
| P2 | Tests cover contracts, not seams | `local-table-runtime.test.mjs` and `table-broker.test.mjs` inject fake `launch`/`bridge`/`status`. No suite touches Forge card resolution, a real Forge launch, live bridge parity, or pilot liveness. | All 20 suites pass while the table is unplayable. Green tests are actively misleading about readiness. |
| P3 | Docs assert capability the code does not have | `HOW-TO-START-CRANKMAGIC-ONLINE.md` says the release proof covers a 2-human/2-AI table; on that exact path the Prompt AI control always errors (D4 below). Docs say "five-second countdown"; spec says ten. | Documentation is used as evidence of readiness. It is not evidence. |
| P4 | No single pre-flight command | Nothing answers "is this machine ready to host a game tonight?" in one run. Readiness is assembled by hand from a dozen places. | Problems are discovered *with guests watching*, which is the expensive moment. |

**Root cause:** readiness is asserted by prose and unit tests, and verified by playing. It needs to be verified by a machine, before guests arrive.

---

## 2. Requirement-by-requirement evaluation

Legend: **Built** = works as specified · **Partial** = exists, wrong shape or wrong path · **Missing** = not implemented.

| Spec step | State | Evidence | Gap |
|---|---|---|---|
| 1. Desktop shortcut launches the app | **Built** | `install-crankmagic-desktop-launcher.ps1`, `launch-crankmagic-online.ps1` — status window with green/yellow/red, health probe on `/api/health`, retains a live host rather than killing it | Status reflects *host* health only. Says nothing about Forge, Java, card data, or credential readiness. |
| 2. Lobby: define table, add players, send invites, choose AI | **Built** | `setup-catalog.mjs:validateSetup`, `serve-review.mjs` `/api/prepare` → `/api/start` → `/api/lobby-invite`; single-use scoped invites, 4h TTL, Cloudflare quick tunnel | Sound. |
| 3a. Guest lands in their seat via link | **Built** | `guest-gateway.mjs`, `seat-access.mjs`, `guest.mjs`; link claims exactly the reserved seat then clears the fragment | Sound. |
| 3b. Deck via paste / Archidekt / CrankMagic deck | **Partial** | `prepareGuestDeck` (`setup-catalog.mjs:133-141`) accepts `upload` (Moxfield two-column), `preloaded`, `lab`, `archidekt`. `library` is gated to `member.seatId===0`. | **D10** — guests cannot pick a saved CrankMagic library deck; only the host can. |
| 3c. Commander 99 engine with auto-repair loop | **Missing** | `prepareSeat` lab branch calls `Builder.build(...)` **once**, then `assess()`; a failure **throws**. `built.issues` is stored as `sourceNotes` and never acted on. | **D8** — no remove-violator → re-pick → re-validate loop. A guest using the 99 engine gets an error string, not a legal deck. |
| **4.1. Every card maps to data model → Forge card** | **Missing** | See §3. The function that appears to do this resolves nothing reliably and its result is discarded. | **D1** — the central readiness gate does not exist. |
| 4.1.1. Surface unrecognized cards, offer a swap | **Missing** | `assess()` returns a joined problem string; the guest UI renders it as text | **D2** — no per-card remediation affordance. |
| 4.2. Every player successfully connected | **Partial** | `connected` per seat; `countdown` requires `occupied && connected && ready && deckVersion` (`table-lifecycle.mjs:30`); 60s reconnect grace (`:23`) | **D11** — correct as a gate, but never surfaced as a readable connection panel. Rob cannot see *who* is stalling. |
| 5. Ready up → 10s countdown, Forge boots **during** it | **Partial** | `table-lifecycle.mjs:31` sets `countdownAt = now + 5000`. `launch()` runs only after `tick` moves the table to `starting` (`local-table-runtime.mjs` `launchWhenDue`) | **D3** — countdown is 5s not 10s, and Forge starts *after* it, not in parallel. The overlap the spec asks for is the entire point and it is absent. |
| 6. All players enter play once Forge + bridge are green | **Partial** | Launch waits for engine `ready`/`playing`, up to 240s, then `engine-started` | No progress contract during that wait. Players see a blank screen for up to four minutes with no signal. |
| 7. Random roll per player, highest goes first | **Missing** | `ForgeLocalGame.java:49-50` seeds `MyRandom`; Forge picks internally. `chooseStartingPlayer` is overridden only in `ForgeProbe` (the diagnostic path) | **D9** — no per-player number, no visible roll, no app-controlled seating order. |
| 8a. "Skip to end" for all players | **Missing** | Only `Yield through this turn` (`review.mjs:620`) | **D6** |
| 8b. "Force prompt" for stuck AI seats | **Partial — broken on Rob's path** | Button exists (`review.mjs:448`). Endpoint: `serve-review.mjs:102` — `if(!soloPilotRunner) throw`. In a lobby table the pilots live in `local-table-runtime`'s `pilotRunner`, which exposes `armPilots()`/`pilotStatus()` but **no `nudge()`** | **D4** — the control works only in 1-human-vs-3-AI solo mode. In the 2-human + AI game Rob is about to play, it always errors. |
| 9. Host failsafe to break a freeze | **Missing** | Nothing between `Yield` and `/api/close-game` (which ends the match) | **D5** — the only escape from a stuck step is ending the game. |
| 10. Joyful, frictionless | **Blocked** | Depends on D1–D6 | — |
| 11. Rematch: yes-voters continue, others dropped | **Partial — deadlocks** | `table-lifecycle.mjs:47` — `next-selection` requires **every** occupied human seat to have `rematch===true` | **D7** — one "No", or one person who walks away from their laptop, freezes the table in `rematch` permanently. The spec's drop-the-non-responders rule is inverted into a unanimity requirement. |

---

## 3. D1 in detail — the defect that causes most game-day failures

Requirement 4.1 asks the app to confirm every card in every deck is recognized and usable by Forge. The code that appears to do this is `game/tools/ai-compatibility.mjs:11-15`:

```js
const file = c.name.toLowerCase().replaceAll('-',' ').replaceAll(/[^a-z0-9 ]/g,'')
              .trim().replaceAll(/ +/g,'_') + '.txt';
const path = resolve(forgeRoot, 'forge-gui/res/cardsfolder', file[0], file);
if (!existsSync(path)) return {name: c.name, oracleId: c.oracleId, status:'script-location-unresolved'};
```

This **guesses a filename** instead of looking a card up. Actual output of that transform:

| Card | Guessed | Forge's real file | Result |
|---|---|---|---|
| `Sol Ring` | `sol_ring.txt` | `sol_ring.txt` | ok |
| `Malakir Rebirth // Malakir Mire` | `malakir_rebirth_malakir_mire.txt` | `malakir_rebirth.txt` | **miss** |
| `Valakut Awakening // Valakut Stoneforge` | `valakut_awakening_valakut_stoneforge.txt` | `valakut_awakening.txt` | **miss** |
| `Lim-Dûl's Vault` | `lim_dls_vault.txt` | `lim_duls_vault.txt` | **miss** |
| `Márton Stromgald` | `mrton_stromgald.txt` | `marton_stromgald.txt` | **miss** |
| `Ætherize` | `therize.txt` | `aetherize.txt` | **miss** |
| `Jötun Grunt` | `jtun_grunt.txt` | `jotun_grunt.txt` | **miss** |

Two independent bugs: **diacritics are deleted rather than transliterated** (`û`→removed, should be `u`; `Æ`→removed, should be `ae`), and **both faces of a double-faced card are concatenated** when Forge keys on the front face only.

Then the third and worst bug: **the result is never used.** `setup-catalog.mjs:125` stores `s.aiCompatibility`, and the only consumer — `setup.mjs:104` — reads `.warnings`, which `compatibility()` populates *exclusively* from `nativeAiWarning`. Every `script-location-unresolved` entry is silently discarded. `assess()` (`setup-catalog.mjs:28-37`) checks count, prices, budget, Game Changers and Oracle IDs — **never Forge resolvability**.

Net effect: a deck passes "Prepare decks", every seat readies up, the countdown runs, and Forge fails or misbehaves at load — after the guests are already waiting. That is precisely the reported symptom.

There is also a packaging risk to confirm on the host: some Forge distributions ship `cardsfolder` as a zip archive, in which case `existsSync` on the directory fails for **every** card and the check silently reports nothing at all.

**The fix is not a better regex.** Build the resolver from Forge's own card database — enumerate `cardsfolder` (directory *or* archive) once at host start, parse each script's `Name:` line, and index by exact name, front-face name, and a normalized key. Anything unresolved is a **hard blocker**, not a warning.

---

## 4. The plan

Six tracks. Track 0 is the game-day safety net and should land before Rob plays with friends. Tracks 1–5 are ordered by how much friction they remove per unit of work.

### Track 0 — Ship before the next game (highest urgency)

| ID | Work | Acceptance gate |
|---|---|---|
| 0.1 | **Forge card resolver.** New `game/contracts/forge-card-index.mjs`: build an index from `cardsfolder` (directory or zip) by parsing each script's `Name:`; expose `resolve(name)` returning `{script, matchedBy}` or `null`. Match on exact name → front face (`split(' // ')[0]`) → NFD-stripped + Æ/æ→ae transliterated normalized key. | Fixture suite covering every card in the table above resolves correctly; an invented name returns `null`. |
| 0.2 | **Make 4.1 a blocking gate.** `assess()` (or a new `readiness()`) rejects any deck with an unresolved card. `prepareSeat` and `prepareGuestDeck` refuse to mint a `deckVersion`. Unresolved names are returned as **structured data** (`{name, reason, suggestions}`), not a joined string. | A deck containing one unresolvable card cannot reach `ready`. Test asserts the seat has no `deckVersion`. |
| 0.3 | **Fix Force Prompt on the lobby path (D4).** Add `nudge(seatId)` to the runtime returned by `createLocalTableRuntime`, delegating to `pilotRunner.nudge`. Change `serve-review.mjs:102` to try `tableRuntime?.nudge(...)` before `soloPilotRunner`. | Integration test: lobby table with one API AI seat → `POST /api/ai-pilots/prompt` returns `{prompted:1}`. |
| 0.4 | **Host force-advance (D5).** `POST /api/table/force-advance {seatId}` → bridge instruction to pass priority / auto-answer the active player's pending decision and move to the next step. Host-token only. Every use written to the match journal. | A table parked on a pending choice advances on one press, with a journal entry naming seat, step and prior decision. |
| 0.5 | **`npm run doctor` pre-flight.** One command: host health, Node version, Forge root present, JDK present, card index builds and card count is sane, credential `crankmagic_openai_api` readable, cloudflared present, ports 8768/8769 free or owned-by-us, bridge round-trip. Green/yellow/red per line. Wire it into the desktop launcher's status window. | Run on a machine with Forge renamed → red on that line, green elsewhere. |
| 0.6 | **Put `game/tests/` in `runtests.sh`.** | `./runtests.sh` exits non-zero when any game suite fails. |

### Track 1 — Readiness verification (spec 4)

| ID | Work | Acceptance gate |
|---|---|---|
| 1.1 | **Card swap remediation (D2).** For each unresolved or illegal card, offer: search the catalog for a legal replacement in the deck's colour identity, accept, re-validate. Available to guests in their own seat. | Guest with a bad card reaches a validated 100 without leaving the lobby. |
| 1.2 | **Connection panel (D11).** Lobby shows per-seat: claimed · connected · deck validated · ready, with last-heartbeat age. Host sees why the countdown is not starting, by name. | With one guest's tab closed, the panel names that seat as the blocker within one heartbeat interval. |
| 1.3 | **Readiness report object.** Single `GET /api/table/readiness` returning the full gate state (all seats, all checks) — one source of truth for host UI, guest UI, and the doctor. | Host UI and guest UI read the same endpoint; no divergent logic. |

### Track 2 — Launch choreography (spec 5, 6, 7)

| ID | Work | Acceptance gate |
|---|---|---|
| 2.1 | **10s countdown + parallel Forge boot (D3).** Change `countdownAt` to `now + 10000`. Kick `launch()` at the *moment the last seat readies* (entering `countdown`), not at `tick`. Add a `launching` field so a cancelled countdown aborts or reaps the engine. | Test: table reaches `countdown`; engine launch is observed to start before `countdownAt`. Cancellation during countdown leaves no orphan Forge process. |
| 2.2 | **Launch progress contract.** The `starting` phase reports stages (`engine-spawning` → `card-db-loaded` → `decks-accepted` → `bridge-green`) to all seats. Replace the silent 240s wait. | Guests see a named stage advancing; a stall names the stage it stalled in. |
| 2.3 | **Visible first-player roll (D9).** On `engine-started`, the app rolls a number per seat from the match seed, shows all rolls, highest starts, and passes the ordering to Forge rather than letting Forge choose silently. Ties re-roll among the tied seats. | Replaying a match seed reproduces identical rolls; the named winner is the player Forge seats first. |

### Track 3 — In-game control (spec 8, 9, 10)

| ID | Work | Acceptance gate |
|---|---|---|
| 3.1 | **"Skip to end" (D6).** Per-player: auto-pass all remaining priority this turn unless a required choice or a stack object targeting them appears. Distinct from the existing `Yield`, and clearly labelled as such. | Player presses once, advances to their next required decision, no illegal auto-answers. |
| 3.2 | **Force Prompt UX.** Surface `pilotStatus()` per AI seat (in-flight request, pending action, error count) so Rob can see *whether* the AI is stuck before pressing. Prompt escalates: re-evaluate → cancel in-flight → force a legal default. | Stuck AI seat is visibly stuck; three presses always terminate in a decision. |
| 3.3 | **Freeze telemetry.** Log every force-advance and force-prompt with the preceding 10 engine revisions to `game/.local/`. | After the next real game, a single file explains every freeze that occurred. |

### Track 4 — Rematch (spec 11)

| ID | Work | Acceptance gate |
|---|---|---|
| 4.1 | **Replace unanimity with drop-the-rest (D7).** Rewrite `next-selection` in `table-lifecycle.mjs`: proceed when every seat that voted `true` has re-readied and at least two seats remain; seats with `rematch===false` or `null` are released (seat vacated, invite revoked) at that moment. Add an explicit `rematch-deadline` transition so a no-answer resolves on the clock rather than never. | Contract test: 3 humans, one votes no, one never votes → table reaches `selecting` with the remaining seats, not an error. |
| 4.2 | **Same-deck fast path.** Yes-voters choose "same deck" (reuses the existing `deckVersion`, skipping re-validation) or "new deck". | Same-deck rematch reaches `countdown` without re-running Scryfall hydration. |

### Track 5 — Deck acquisition (spec 3)

| ID | Work | Acceptance gate |
|---|---|---|
| 5.1 | **99-engine repair loop (D8).** Wrap `Builder.build` in: build → validate (legality, colour identity, budget, bracket, **Forge resolvability**) → on violation, remove the offending card, draw a replacement from the legal pool, re-validate. Bounded iterations with a deterministic seed; report what was swapped and why. | From a deliberately poisoned pool, the loop returns 100 legal, Forge-resolvable cards and a swap log. Never infinite-loops. |
| 5.2 | **Guest library access (D10).** Let guests pick from the host's shared preloaded/library decks where the host has permitted it — lift the `seatId===0` restriction behind an explicit host setting. | Guest seat 2 can select a host library deck when sharing is on, and cannot when it is off. |
| 5.3 | **Plain list paste.** `parseMoxfieldTwoColumn` is narrow. Accept `1 Sol Ring` / `1x Sol Ring` / bare names / Archidekt and Moxfield exports, with a per-line error report. | Four paste formats import; a malformed line names its line number. |

### Track 6 — Engineering discipline (P1–P4)

| ID | Work | Acceptance gate |
|---|---|---|
| 6.1 | **Seam tests.** Real-Forge integration suite, gated on Forge being present, covering: card index build, launch to `bridge-green`, bridge parity against the live engine, one AI decision round-trip. Skips loudly (not silently) when Forge is absent. | Suite runs in CI-skip mode and in full mode on Rob's machine. |
| 6.2 | **Definition of done.** No task is "done" until: `./runtests.sh` green, `npm run doctor` green, and — for anything touching steps 3–7 — one real 4-seat table reaches turn 3. | Adopted as the standing rule for this subsystem (see §6). |
| 6.3 | **Docs assert only what tests prove.** Every capability claim in `game/docs/*.md` carries the suite or command that proves it. Remove the rest. | No claim without a citation. |

---

## 5. Sequencing

```
Before the next game with friends  →  Track 0  (0.1 → 0.2 → 0.3 → 0.4 → 0.5 → 0.6)
Next sprint                        →  Track 1, Track 2
Then                               →  Track 4 (small, high relief), Track 3
Then                               →  Track 5
Continuous                         →  Track 6
```

Track 0 is deliberately small and mechanical. 0.1 + 0.2 together convert the most common failure — a card Forge cannot load — from a mid-lobby collapse into a lobby-time message with a fix. 0.3 + 0.4 give Rob working hands during the game. 0.5 tells him before guests arrive whether tonight will work.

## 6. Definition of done for this subsystem

Proposed standing rule, because the recurring failure is *declaring readiness without evidence*:

1. `./runtests.sh` exits 0, **with `game/tests/` included**.
2. `npm run doctor` is green on the host machine.
3. Any change touching spec steps 3–7 is proven by one real table reaching turn 3 with a saved journal, not by unit tests alone.
4. A documentation claim ships with the command that proves it, or it does not ship.
5. Unresolvable Forge cards, disconnected seats, and unvalidated decks are **blockers**, never warnings.

## 7. Game-day fallback (until Track 0 lands)

If Rob plays before these changes ship:

- Prefer **preloaded / library** decks for every seat. They come from the local catalog with known-good cards and avoid the Archidekt and 99-engine paths entirely.
- Avoid double-faced cards and cards with accented names in guest decks — those are exactly the D1 misses.
- Expect **Prompt AI to fail** in a multi-human table (D4). The working lever is `Yield through this turn`; the nuclear option is `Game setup → End current game`.
- On a hard freeze, there is no clean unstick today (D5). End the game keeping the journal, then restart the table.
- Before inviting anyone: start the host, open Play, run one **solo** table to turn 2 to confirm Forge and the bridge are alive on that boot.
