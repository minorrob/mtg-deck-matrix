# CrankMagic Online — table readiness evaluation and plan

**Date:** 2026-09-18
**Audited:** `origin/cursor/personal-hp-online-2026-09-17` (the Personal-HP tree Rob actually plays on), reconciled against `origin/main` @ `9ee74e7`.
**Target table:** 4 seats — Rob + 2 human guests + 1 AI seat.
**Sources:** `CLAUDE-HANDOFF-crankmagic-online-2026-09-17.md`, `TREY-PROMPTS-SCOPE-2026-09-17.md`, and the code on both branches.

---

## 1. The loop this serves

CrankMagic is one system with one canonical loop:

```
   create ──▶ refine / explore ──▶ acquire ──▶ build ──▶ PLAY ──┐
     ▲                                                          │
     └──────────────── iterate the hundred ◀────────────────────┘
```

CrankMagic Online is not a separate product bolted onto the workshop — it is the **play** edge, and the loop only closes if play feeds back into refine. That framing decides what "ready" means here, and it promotes two items that look like polish into structural work:

| Loop edge | Mechanism | State |
|---|---|---|
| build → play | Lobby seats a validated hundred | **Broken at the Forge mapping gate** (D1) |
| play → refine | `attachMatchReport` writes the match onto the deck (`crankmagic-online.js`) | **Built.** This is the return edge and it exists. |
| lobby → create | Applying a deck in the lobby should mint a real Decks draft with full metadata | **Missing.** `ensureLobbyDraft` sits unmerged in #264/#267. |
| refine → play | 120k simulation report attaches to the deck, readable from Decks | **Partial.** `measurePublished` unmerged in #265/#267. |

So the Track 5 items below are not nice-to-haves. Without them the loop is a line, not a circle: decks built in the lobby die in the lobby, and games played teach the workshop nothing.

---

## 2. Reconciliation — three bodies of work, none complete

Getting the Personal-HP branch pushed resolved the central unknown. The relationship:

- Merge base: `f04dbef` "Add active AI prompt control".
- **Branch adds** 31 files, +3,235/−356, in 17 commits — and it **already contains** the #259–#263 chain (`bf578f0`, `cf2b6c3`, `360774a`, `6614f21`, `ac14533`, `ca31bd0`). That stack does not need separate merging; it is here.
- **Branch lacks** everything main did after `f04dbef`: Phase 1 PRs 1–5, Explore A/B/C, Measure fidelity banner, #257, and **HOTFIX #258 (Pages boot / asset versions)**.
- **Conflict surface is small** — 7 files, mostly docs: `crankmagic-online.js`, `crankmagic.css`, `index.html`, `tests/fixtures/asset-versions.json`, `game/ui/setup.mjs`, and two `game/docs` files.

Divergence is real but tractable. Verified pins on the branch: `game.js?v=37`, `online.js?v=10`, `css?v=132`, `lobby.js?v=1` — matching the handoff exactly.

One correction worth flagging: `main` carries `DEFAULT_OPENAI_MODEL='gpt-5.6-luna'` / `'gpt-5.6-terra'`. The branch corrects these to `'gpt-5-mini'` / `'gpt-5'`. **Main's identifiers are not real OpenAI models** — anyone starting from a fresh `main` clone gets HTTP 400 on every AI seat. The branch is right and main is wrong; this must not be lost in the merge.

---

## 3. What the 2026-09-17 work actually fixed

Verified in the code, not taken from the handoff:

| Item | Verified |
|---|---|
| Start is no longer a stub | `crankmagic-game.js:2080` — `lobby-start` is now async, resolves `/api/setup` → `/api/prepare` → `/api/start`. Main still has the G0 notice-only stub at line 305. |
| GC strip + backfill (self-test #7) | `finalizeBuiltSeat`, lines 466–547. Prefers `Lobby.trim`, manual strip as fallback, always returns a seatable 100. |
| Flame spinner + busy state | `cm-flame-spin` / `cm-build-busy`, lines 121–136. |
| Live invite minting (self-test #9) | `ensureLiveInvite`, line 1531 — resolves a real `seatId`, reuses an accepting lobby, opens one via `/api/prepare` + `/api/start` if needed, returns a genuine `#table=&invite=` link. |
| OpenAI model IDs | Corrected, as above. |
| New test coverage | `game/tests/decision-ui.test.mjs` (+177) and `host-routing.test.mjs` (+55). |

**All 22 `game/tests` suites pass on the branch.** The work is real and the direction is right. The problems are in what was not covered.

---

## 4. New finding — the delivery layer, not the fix layer

**`tests/asset-versions.mjs` fails on this branch.** The repo's own suite, already wired into `runtests.sh`, run here for the first time:

```
crankmagic.css      is requested as index.html→v=132 and crankmagic.html→v=115 and crankmagic-sw.js→v=115
crankmagic-game.js  is requested as index.html→v=37  and crankmagic.html→v=3   and crankmagic-sw.js→v=3
```

`index.html` was bumped to the fixed lobby. `crankmagic.html` and the service worker's `SHELL` list (`crankmagic-sw.js:25-27`) were not. Consequences:

1. **`crankmagic.html` still boots `crankmagic-game.js?v=3`** — the pre-fix stub lobby, whose only invite builder is the legacy `#seat=` path (`crankmagic-game.js:36-37`, still present on the branch with a comment acknowledging it is dead for live guests).
2. The service worker precaches `crankmagic-game.js?v=3`, and `SHELL_CACHE = keyFor('shell', SHELL)` derives its key from that unchanged list — so an installed worker never re-populates, and serves v=3 cache-first (line 71) on the public site.

**This is the strongest available explanation for "Trey still hitting expired/unavailable after the v=37 fix."** The fix was real; the delivery was not. Any entry through `crankmagic.html`, or through the Pages site with a warm service worker, runs the old lobby and mints dead `#seat=` links. The `Ctrl+F5` ritual in the handoff is the classic symptom of exactly this.

Caveat, stated honestly: the local host serves `/app/` → `index.html` on `127.0.0.1:8768`, a different origin from Pages, so the service worker does not apply to the local host path. Confirm the entry point Rob actually used before treating this as settled. But it is cheap to fix, the repo's own test already catches it, and it is the same failure class as main's HOTFIX #258 — which this branch does not contain.

---

## 5. What survives untouched — re-verified on the branch

`game/tools/ai-compatibility.mjs`, `game/tools/setup-catalog.mjs` and `game/contracts/` were **not modified** by any 2026-09-17 commit. Every defect below is live on the tree Rob plays.

### D1 — Forge card resolution is a filename guess. **Requirement 4.1 is not implemented.**

`game/tools/ai-compatibility.mjs:11-15` guesses a `cardsfolder` filename instead of looking the card up:

```js
const file = c.name.toLowerCase().replaceAll('-',' ').replaceAll(/[^a-z0-9 ]/g,'')
              .trim().replaceAll(/ +/g,'_') + '.txt';
```

| Card | Guessed | Forge's real file |
|---|---|---|
| `Malakir Rebirth // Malakir Mire` | `malakir_rebirth_malakir_mire.txt` | `malakir_rebirth.txt` |
| `Lim-Dûl's Vault` | `lim_dls_vault.txt` | `lim_duls_vault.txt` |
| `Ætherize` | `therize.txt` | `aetherize.txt` |
| `Jötun Grunt` | `jtun_grunt.txt` | `jotun_grunt.txt` |

Diacritics are **deleted** rather than transliterated, and both faces of a double-faced card are **concatenated** where Forge keys on the front face.

Worse, the result is discarded. `setup-catalog.mjs:125` stores it; the only consumer (`game/ui/setup.mjs:104`) reads `.warnings`, which `compatibility()` populates exclusively from `nativeAiWarning`. Every `script-location-unresolved` entry is dropped. `assess()` (`setup-catalog.mjs:28-37`) checks count, prices, budget, Game Changers and Oracle IDs — **never Forge resolvability**.

This is Trey's own stated gate, verbatim from the scope doc: *"Ready Up only when all 100 map cleanly to catalog/Forge (bracket/GC fit secondary to mapping)."* It does not exist. A deck passes Prepare, everyone readies, the countdown runs, and Forge fails at load with guests waiting.

Also confirm on the host: some Forge builds ship `cardsfolder` as a zip, in which case `existsSync` fails for **every** card and the check silently reports nothing at all.

### The rest

| ID | Defect | Evidence |
|---|---|---|
| D2 | No unknown-card resolve UI. Scope §3.3 specifies "type + searchable name + hover art"; `assess()` returns a joined string. | `setup-catalog.mjs:36` |
| D3 | Countdown is 5s (spec: 10s) and Forge starts **after** it, not during. The parallel boot the spec asks for is absent. | `table-lifecycle.mjs:31`, `local-table-runtime.mjs` `launchWhenDue` |
| D4 | **Force Prompt still dead on multi-human tables.** `if(!soloPilotRunner) throw` — in a lobby table the pilots live in `local-table-runtime`'s `pilotRunner`, which has no `nudge()`. Works solo; always errors on Rob's table. | `serve-review.mjs:106` |
| D5 | No host force-advance / Force End Turn. Nothing between `Yield` and ending the match. | — |
| D6 | No "Skip to end" / Auto-pass at the table level. | `review.mjs:620` has only `Yield through this turn` |
| D7 | **Rematch deadlocks.** `next-selection` requires *every* occupied human seat to vote yes. One "No", or one person who walks away, freezes the table permanently. Spec says drop them. | `table-lifecycle.mjs:47` |
| D8 | No repair loop in the 99 engine. `Builder.build` runs once; a violation **throws**. (The branch's `finalizeBuiltSeat` does GC strip/backfill in the *screen*, but the server-side builder still has no loop — and its last-resort backfill is basic lands, which yields a legal 100 that is not a deck.) | `setup-catalog.mjs:118-127` |
| D9 | No visible first-player roll. Forge chooses internally from the seeded RNG; `chooseStartingPlayer` is overridden only in the diagnostic `ForgeProbe`. | `ForgeLocalGame.java:49` |
| D10 | Guests cannot pick a host library deck (`seatId===0` gate). | `setup-catalog.mjs:136` |
| D11 | Connection state gates the countdown correctly but is never surfaced — Rob cannot see *who* is blocking. | `table-lifecycle.mjs:30` |

---

## 6. Root cause

Two mechanisms, both structural.

**6.1 — The logic moved into the file designed to hold none.**

`crankmagic-lobby.js` opens with its own contract: *"Everything the lobby decides is arithmetic over card lists… it lives here where a Node suite can hold it to the committed decks. The screen in crankmagic-game.js draws what this returns and spells nothing of its own."* It has a suite: `tests/crankmagic-lobby.mjs`.

On this branch `crankmagic-lobby.js` is still `?v=1` — **untouched**. `crankmagic-game.js` grew by **2,204 lines** and now contains seat mapping, deck resolution, GC strip/backfill, invite minting and Start orchestration. `tests/crankmagic-game.mjs` **does not exist**.

Every hard-won fix from 2026-09-17 lives in the one file with no test suite and an explicit design rule against holding logic. That is why fixes regress and why "fixed" cannot be verified without playing a game.

**6.2 — The suite that catches the failures was never run.**

`tests/asset-versions.mjs` had the §4 defect pinned the whole time, in `runtests.sh`, one command away. It was not run. Meanwhile `runtests.sh` does **not** iterate `game/tests/` at all — 22 suites sit outside the trusted runner.

Trey already locked the right rules — UAT before prod, no stubs as ready, verify in the browser not via API health. The rules are not the gap. **Enforcement is.** Nothing makes them machine-checkable, so they are satisfied by assertion.

---

## 7. Trey's self-test list — verified status

| # | Item | Claimed | **Verified** | ID |
|---|---|---|---|---|
| 1 | Bracket + GC cap same font | Fixed | Not re-checked (visual) | — |
| 2 | Library = real Desktop `.dek` D1–D6 | Fixed | `/api/desktop-deks` **absent from the branch**; embedding not found | — |
| 3 | Save play style keeps Build path | Fixed | Not re-checked (visual) | — |
| 4 | Commander typeahead | Fixed | Not re-checked (visual) | — |
| 5 | Seat header alignment | Fixed | Not re-checked (visual) | — |
| 6 | Save play style keeps commander | Fixed | Not re-checked (visual) | — |
| 7 | GC strip + backfill, ≤3s notice, spinner | Claimed v=37 | **Present** — `finalizeBuiltSeat` + `cm-flame-spin`. Untested; basic-land backfill is a quality risk. | D8 |
| 8 | Invite email hyperlink + instructions | Fixed | Present | — |
| 9 | Guest link → seat lobby, fresh invite | **Trey still blocked** | `ensureLiveInvite` is correct. **The stale `crankmagic.html` / service-worker pins are the likely cause.** | §4 |

Items 1, 3, 4, 5, 6 are visual and need Rob's eyes or a screenshot pass — the mandate was to verify the way he sees it. **Item 2 does not appear in the pushed branch**; either it was left out of the commit or it was never built.

---

## 8. The plan

### Track A — Converge the trees (do first; everything else depends on it)

| ID | Work | Gate |
|---|---|---|
| A.1 | Merge `main` into the Personal-HP branch. 7 conflicting files, mostly docs. Brings HOTFIX #258 and Phase 1. Keep the branch's `gpt-5-mini`/`gpt-5`. | `./runtests.sh` green including `asset-versions` |
| A.2 | Fix the asset pins: align `crankmagic.html` and `crankmagic-sw.js` SHELL to `game.js?v=37` / `css?v=132`. | `tests/asset-versions.mjs` passes; a warm-cache browser gets v=37 |
| A.3 | Delete the legacy `#seat=` builder (`crankmagic-game.js:36-37`) so it cannot be reached. | No call path can mint a `#seat=`-only link |
| A.4 | Add `game/tests/` to `runtests.sh`. | One command covers all 87 suites, non-zero exit on failure |
| A.5 | Confirm or close self-test #2 (Desktop `.dek` library). | Library lists D1–D6 from disk, or the item is reopened |

### Track B — Ship before the next game

| ID | Work | Gate |
|---|---|---|
| B.1 | **Forge card resolver.** `game/contracts/forge-card-index.mjs`: index `cardsfolder` (directory *or* zip) by parsing each script's `Name:`; resolve by exact name → front face → NFD-stripped, Æ→ae normalized key. | Fixture suite over §5's table resolves; an invented name returns `null` |
| B.2 | **Make 4.1 blocking.** Unresolved card ⇒ no `deckVersion` ⇒ cannot Ready Up. Return structured `{name, reason, suggestions}`, not a joined string. | A deck with one bad card cannot reach `ready` |
| B.3 | **Fix Force Prompt on the lobby path.** Expose `nudge(seatId)` from `createLocalTableRuntime`; try `tableRuntime` before `soloPilotRunner`. | Lobby table + 1 API seat → `{prompted:1}` |
| B.4 | **Host force-advance.** `POST /api/table/force-advance {seatId}` — pass priority or auto-answer the pending decision, host-token only, journalled. | A parked table advances on one press |
| B.5 | **`npm run doctor`.** Host health, Node, Forge root, JDK, card index builds with a sane count, credential readable, cloudflared, ports, bridge round-trip. Wired into the launcher's status window. | Rename Forge → red on that line only |

### Track C — Readiness and launch (spec 4–7)

| ID | Work |
|---|---|
| C.1 | Unknown-card resolve UI to Trey's spec: type + searchable name + hover art → OK → Ready enabled (D2) |
| C.2 | Connection panel — per-seat claimed / connected / validated / ready with heartbeat age (D11) |
| C.3 | `GET /api/table/readiness` as the single source of truth for host UI, guest UI and doctor |
| C.4 | 10s countdown, Forge boot kicked at *entry* to countdown, abort-and-reap on cancel (D3) |
| C.5 | Launch progress stages — `engine-spawning` → `card-db-loaded` → `decks-accepted` → `bridge-green`, replacing the silent 240s wait |
| C.6 | Visible first-player roll from the match seed; app passes the ordering to Forge (D9) |

### Track D — At the table (spec 8–10)

| ID | Work |
|---|---|
| D.1 | "Skip to end" / Auto-pass, distinct from `Yield` (D6) |
| D.2 | Surface `pilotStatus()` per AI seat so a stall is visible before pressing; escalating prompt: re-evaluate → cancel in-flight → force a legal default (D4) |
| D.3 | Freeze telemetry — every force-advance and force-prompt with the preceding 10 engine revisions |

### Track E — Close the loop (spec 11 + §1)

| ID | Work |
|---|---|
| E.1 | **Rematch: drop-the-rest, not unanimity.** Proceed when the yes-voters have re-readied and ≥2 seats remain; release `false`/`null` seats at that moment. Add a `rematch-deadline` transition so a no-answer resolves on the clock. (D7) |
| E.2 | Same-deck fast path — reuse the existing `deckVersion`, skip re-validation |
| E.3 | **Land #264–#267** — `ensureLobbyDraft`, `attachDeckReport`, `measurePublished`. These are the lobby→create and refine→play edges of §1. |
| E.4 | Server-side 99-engine repair loop with Forge resolvability in the predicate; backfill from the legal *candidate pool*, not basic lands; deterministic, bounded, with a swap log (D8) |
| E.5 | Guest library access behind a host setting (D10); broaden paste parsing beyond Moxfield two-column (§3.3) |

### Track F — Make the rules enforceable

| ID | Work |
|---|---|
| F.1 | **Move the lobby logic out of `crankmagic-game.js`** into `crankmagic-lobby.js` behind its existing suite. Seat mapping, deck resolution, GC strip/backfill, invite minting. The screen draws; the module decides. This is the fix that stops the regressions. |
| F.2 | Real-Forge seam suite: card index build, launch to `bridge-green`, bridge parity against a live engine, one AI decision round-trip. Skips **loudly** when Forge is absent. |
| F.3 | Screenshot pass for the visual self-test items, so "verify the way he sees it" is a produced artifact, not a claim. |

---

## 9. Sequencing

```
Now              →  Track A  (converge; A.2 may be the guest-invite blocker)
Before playing   →  Track B
Next             →  Track C, then E.1–E.2 (small, high relief)
Then             →  Track D, Track E
Continuous       →  Track F  (F.1 is the one that stops the bleeding)
```

## 10. Definition of done

1. `./runtests.sh` exits 0 **with `game/tests/` included**.
2. `npm run doctor` green on the host.
3. Anything touching spec steps 3–7 proven by one real table reaching turn 3 with a saved journal.
4. Visual items proven by a screenshot, per Trey's standing rule.
5. Unresolvable Forge cards, disconnected seats and unvalidated decks are **blockers**, never warnings.
6. A capability claim in `game/docs/` ships with the command that proves it, or it does not ship.

## 11. Game-day fallback, until Track B lands

- Enter through `index.html` (`/app/#game`). **Do not use `crankmagic.html`** — it boots the v=3 stub lobby and mints dead invite links.
- Prefer preloaded / library decks for every seat; they come from the local catalog with known-good cards.
- Avoid double-faced cards and accented names in guest decks — those are exactly the D1 misses.
- **Prompt AI will fail** on a multi-human table (D4). Working levers: `Yield through this turn`, then `Game setup → End current game`.
- No clean unstick exists (D5). End the game keeping the journal, then restart the table.
- Before inviting anyone: start the host and run one **solo** table to turn 2 to confirm Forge and the bridge are alive on that boot.
