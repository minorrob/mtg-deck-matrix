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
| build → play | Lobby seats a validated hundred | **Built** (B.1/B.2). A deck Forge cannot load is now refused in the lobby. |
| play → refine | `attachMatchReport` writes the match onto the deck (`crankmagic-online.js`) | **Built.** This is the return edge and it exists. |
| lobby → create | Applying a deck in the lobby mints a real Decks draft with full metadata | **Built** (E.3). |
| refine → play | 120k simulation report attaches to the deck, readable from Decks | **Built** (E.3). |

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

## 4. The guest invitation failure — root cause found and fixed

Rob was opening the emailed link in a **second browser with no cache history**, simulating a guest. That rules out the stale-asset theory this document carried in its first draft: a cold browser on the Cloudflare tunnel never touches the service worker, and never loads `crankmagic.html`. The real cause is in the lobby.

**An invitation is sealed to the table id it was issued against** (`game/contracts/seat-access.mjs:22` — `v.tableId!==tableId` → `Invitation expired or unavailable`).

`Email Invite` opens the private lobby itself when none is open (`ensureLiveInvite`, `crankmagic-game.js:1531`). `Start` then called `/api/prepare` + `/api/start` **unconditionally**, and `/api/start` does `tableRuntime?.close(); tableRuntime=createLocalTableRuntime(...)` — a brand new table with a fresh random `tableId` (`serve-review.mjs:165`). Nothing gated it: `allReadyForStart` returns `true` for human seats regardless (`crankmagic-game.js:1243`), so Start is pressable the moment the host and AI seats are ready.

The sequence:

1. Host clicks **Email Invite** → lobby opens as table **T1**, link `#table=T1&invite=…` is emailed.
2. Host clicks **Start the game** → prepare + start again → T1 is closed, table **T2** is born.
3. Guest opens the emailed link → T1 ≠ T2 → *"Invitation expired or unavailable."*

A link that was valid minutes earlier, rejected on arrival, with nothing on either screen saying why — and the host's own UI copy tells him Start is what opens the private lobby, so pressing it is the expected move.

**Fixed.** `Start` now reuses an open accepting lobby instead of preparing a second one, and `/api/start` refuses to replace a table that has invitations outstanding unless the caller asks explicitly. `game/tests/table-foundation.test.mjs` holds the invariant.

### The stale asset pins were a real bug, just not this one

`tests/asset-versions.mjs` did fail on the Personal-HP branch: `index.html` was bumped to `crankmagic-game.js?v=37` and `crankmagic.css?v=132` while `crankmagic.html` and the service worker's `SHELL` list stayed at `v=3` and `v=115`. That would have served the pre-fix lobby to anyone entering through `crankmagic.html` or through Pages with a warm service worker. It was not Rob's failure, and it is now fixed and green — but it is worth recording that the repo's own suite had it pinned the whole time and nobody ran it.

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
| 2 | Library = real Desktop `.dek` D1–D6 | Fixed | `/api/desktop-deks` **absent from the branch**; embedding not found. Needs Rob's call — see A.5. | — |
| 3 | Save play style keeps Build path | Fixed | Not re-checked (visual) | — |
| 4 | Commander typeahead | Fixed | Not re-checked (visual) | — |
| 5 | Seat header alignment | Fixed | Not re-checked (visual) | — |
| 6 | Save play style keeps commander | Fixed | Not re-checked (visual) | — |
| 7 | GC strip + backfill, ≤3s notice, spinner | Claimed v=37 | **Present** — `finalizeBuiltSeat` + `cm-flame-spin`. Untested; basic-land backfill is a quality risk. | D8 |
| 8 | Invite email hyperlink + instructions | Fixed | Present | — |
| 9 | Guest link → seat lobby, fresh invite | **Trey still blocked** | **Root cause found and fixed.** `ensureLiveInvite` was correct; `Start` was minting a second table and voiding the emailed link. | §4 |

Items 1, 3, 4, 5, 6 are visual and need Rob's eyes or a screenshot pass — the mandate was to verify the way he sees it. **Item 2 does not appear in the pushed branch**; either it was left out of the commit or it was never built.

---

## 8. The plan

### Track A — Converge the trees — **DONE**

| ID | Work | Result |
|---|---|---|
| A.1 | Merge `main` and the Personal-HP branch | Done. 4 conflicts resolved: `crankmagic-online.js` kept main's wrapper shape (which reaches the branch's intent without deleting the legacy view) and dropped its UTF-8 BOM, the source of the mojibake in the nav copy; `crankmagic.css` union; `index.html` took main's Phase 1 nav and the highest pin per asset. |
| A.2 | Align the asset pins | Done. All entry points and the service worker agree; `crankmagic.css` and `crankmagic-online.js` took fresh numbers because their merged content matches neither side. `tests/asset-versions.mjs` passes — 94 assets, one version each. |
| A.3 | Remove the legacy `#seat=` builder | Done. It had **zero callers** — already dead, and therefore never the cause of the invite failure. Removed as a trap. |
| A.4 | `game/tests/` into `runtests.sh` | Done. **87 suites pass, exit 0.** Making it real surfaced two failures already present on `main`, both fixed: `README.md` had stopped naming three suites and its stated count had drifted, and `docs/data-inventory.md` no longer matched its generator. |
| A.5 | Confirm or close self-test #2 | **Open.** `/api/desktop-deks` and the Desktop `.dek` embedding are absent from the pushed branch. Either the commit missed them or they were never built. Needs Rob's call. |
| A.6 | **Fix the invitation-voiding Start** (found during A.3) | Done — see §4. |

### Track B — Ship before the next game — **DONE, pending live verification**

| ID | Work | Result |
|---|---|---|
| B.1 | Forge card resolver | `game/contracts/forge-card-index.mjs`. Reads every script Forge ships and indexes its `Name:` lines. Ladder: exact → front face → normalized, so a list pasted without accents resolves while two different cards can never collapse. Both faces and the joined `A // B` form are indexed. |
| B.2 | Make 4.1 blocking | An unresolved card now throws in `prepareSeat`, carrying `{name, quantity, reason, suggestions}` through both the host API and the guest gateway. No `deckVersion`, so the seat cannot Ready Up. `CRANKMAGIC_FORGE_ROOT` overrides the checkout path. |
| B.3 | Force Prompt on the lobby path | `createLocalTableRuntime` exposes `nudge(seatId)`; the endpoint asks the table before the solo runner. |
| B.4 | Host force-advance | `POST /api/table/force-advance {seatId}`. Takes a legal action from the pilots' own enumerator, prefers a required draw or acknowledgement, journals every use to `force-advance.ndjson`. Host-only — a test asserts it is absent from the guest route table. |
| B.5 | Pre-flight doctor | `node game/tools/doctor.mjs` and `GET /api/doctor`. The launcher will not report "Ready to play" over a blocking problem. Distinguishes fail / warn / **skip**, because a skipped check is not evidence that anything passed. |

Five new suites, 90 total, `./runtests.sh` exit 0. **Everything here is proven against fixtures, not against Forge** — see §12.

### Track C — Readiness and launch (spec 4–7) — **C.3/C.4/C.5 done; C.1/C.2 UI and C.6 outstanding**

| ID | Work | Result |
|---|---|---|
| C.1 | Unknown-card resolve UI | **Outstanding.** The data is ready — B.2 returns `{name, quantity, reason, suggestions}` through both APIs. What remains is the page: type, searchable name, hover art, per Trey's §3.3. |
| C.2 | Connection panel | **Server done** (C.3 carries per-seat quiet time and blocking reason). The panel itself is UI. |
| C.3 | Single readiness source | `countdownBlockers()` in the contract is now the one definition, consumed by the countdown transition itself, so the rule and the explanation of the rule cannot drift. `GET /api/table/readiness`; the guest table view carries the same object. |
| C.4 | 10s countdown, parallel boot | Done. The match identity is minted when the countdown *begins*; the engine boots alongside it. One pod for both calls, so exactly one match starts. A fast engine still waits for the clock. |
| C.5 | Launch progress | Done. `engine-spawning → engine-spawned → waiting-for-engine → bridge-green → seated`, or `failed` with its reason. |
| C.6 | Visible first-player roll | **Outstanding, and deliberately not half-done.** See below. |

**On C.6.** A roll is only meaningful if it decides turn order. Forge decides that internally from the seeded RNG (`ForgeLocalGame.java:49`), and overriding it means implementing `chooseStartingPlayer` on the browser bridge's controller — `ForgeProbe.java:292` is the working reference. That is Java which cannot be compiled or exercised in this environment, and a roll displayed next to a turn order it does not actually control would be worse than showing nothing. It belongs in a session on the host, where `game/tools/build-forge.ps1` can build it and a real game can prove it.

### Track E.1 — Rematch — **DONE**

`next-selection` proceeds once everyone asked has answered, keeps the seats that said yes with their decks intact so "same deck" is one click, and releases the rest; a `rematch-deadline` counts silence as a decline after two minutes. Releasing a seat exposed an older deadlock of the same family — `countdown` required every seat in the array to be occupied, so *any* departure locked the table out of its next game — now fixed. A released seat loses its capability, as `exit` and `expire` already did.

### Track D — At the table (spec 8–10) — **DONE**

| ID | Work | Result |
|---|---|---|
| D.1 | "Skip to end" | `maySkipToEndOfTurn` covers what auto-pass deliberately refuses: your *own* turn. Opt-in, expires with the turn, stops for any choice and for a non-empty stack. It also gave `yieldTurn` a job — it had been threaded through the render loop and into `mayAutoPassPriority`, which never read it. |
| D.2 | Pilot status + escalation | `GET /api/ai-pilots` says whether a seat is stuck or thinking. `POST /api/ai-pilots/prompt {seatId, force:true}` locks in a legal decision when re-asking has already failed. |
| D.3 | Freeze telemetry | A forced action records the position it was forced in — turn, phase, priority, stack size, prompt, choice, and every pilot's state. The old entry named the action alone. |

### Track E — Close the loop (spec 11 + §1) — **E.1, E.3 and E.5 done; E.4 outstanding**

| ID | Work | Result |
|---|---|---|
| E.1 | Rematch drops the rest | **Done.** See above. |
| E.2 | Same-deck fast path | **Done at the contract level** — a staying seat keeps its `deckVersion`, so "same deck" is just Ready Up. The explicit two-button affordance is UI, with C.1. |
| E.3 | Land #264–#267 | **Done.** #267 is the clean combination of the other three. `ensureLobbyDraft` mints a real Decks draft when a seat is applied (`crankmagic-game.js:579`); `attachDeckReport` files a simulation report against the deck it measured (`:1829`); `measurePublished` is the wrapper behind Generate Simulation Report. Neither helper creates Owned lots, so seating a deck never claims you own the cards. All five `crankmagic-game.js` conflicts resolved to the Personal-HP side, which is a later evolution of #266 and already contains it. |
| E.4 | Server-side 99-engine repair loop | **Outstanding.** The screen does GC strip/backfill; the server builder still throws on a violation, and its last-resort backfill is basic lands, which yields a legal 100 that is not a deck. |
| E.5 | Paste parsing and guest library | **Done.** The invitation email asks for `[Count] [Card Name]` with the commander first and suggests exporting to Excel; the parser took comma-separated columns with the commander last. Every instruction in that email produced a parse failure. `parseDeckList` now reads space, comma and tab separation, `1x`, bare names, section headers, set codes and collector numbers, commander first or last, with per-line errors. A guest can use a host library deck when the host shares it. |

### Track F — Make the rules enforceable

| ID | Work |
|---|---|
| F.1 | **Move the lobby logic out of `crankmagic-game.js`** into `crankmagic-lobby.js` behind its existing suite. Seat mapping, deck resolution, GC strip/backfill, invite minting. The screen draws; the module decides. This is the fix that stops the regressions. |
| F.2 | Real-Forge seam suite: card index build, launch to `bridge-green`, bridge parity against a live engine, one AI decision round-trip. Skips **loudly** when Forge is absent. |
| F.3 | Screenshot pass for the visual self-test items, so "verify the way he sees it" is a produced artifact, not a claim. |

---

## 9. Sequencing

```
A, B, D, C.3–C.5, E.1, E.3, E.5  →  DONE, all against fixtures. §12 is the live pass.
Next                             →  C.1/C.2 UI (swap dialog, connection panel)
Then                             →  E.4 (server-side repair loop), C.6 (needs a machine that compiles Java)
Continuous                       →  Track F  (F.1 is the one that stops the bleeding)
```

**The loop is closed.** Every edge of create → refine → acquire → build → play → refine now exists
in code. What remains is polish on the edges, not missing edges.

## 10. Definition of done

1. `./runtests.sh` exits 0 **with `game/tests/` included**.
2. `npm run doctor` green on the host.
3. Anything touching spec steps 3–7 proven by one real table reaching turn 3 with a saved journal.
4. Visual items proven by a screenshot, per Trey's standing rule.
5. Unresolvable Forge cards, disconnected seats and unvalidated decks are **blockers**, never warnings.
6. A capability claim in `game/docs/` ships with the command that proves it, or it does not ship.

## 11. Game-day fallback

What is still open at the table:

- **No visible first-player roll** (C.6) — Forge decides silently. Nothing breaks; you just do not see the roll.
- An unrecognized card is refused with its name and suggestions, but the swap still means editing the list yourself (C.1).
- The server-side 99 engine still throws on a violation rather than repairing (E.4). The lobby screen's own strip-and-backfill covers the Build-from-Commander path.
- **Everything in B, C.4, C.5 and D is proven by unit tests, not by a live game.** §12.

## 12. Verify it live — the run-book for a local session

Everything in Track B is proven against fixtures. Fixtures cannot tell you whether *this* Forge checkout resolves *these* decks, and that gap is exactly where this project has been over-trusting green tests. Run this on the host, in order. It takes about fifteen minutes and needs no game.

**1 — The suites, on the real machine.**

```powershell
cd "C:\Users\robmi\OneDrive\Documents\My Games\MtG\work\commander-phase-c"
bash runtests.sh -q
```

Expect `90 suites passed.` and exit 0. On Windows the `browser-geometry` and `page-budget` suites may fail at a Unix-oriented Playwright import before any assertion — that is a known checkout artefact, not a regression. Anything else red, stop and send it.

**2 — The doctor, which is the whole point of B.5.**

```powershell
node game/tools/doctor.mjs
```

Expect every line `ok`, except `Local host` as `warn` if the host is not running yet. **The line that matters is `Forge card database`** — it should report tens of thousands of card scripts. If it reports a failure, the Forge checkout is not where the app expects it; set `CRANKMAGIC_FORGE_ROOT` and re-run.

**3 — Prove the resolver against the real card database.** This is the single most valuable check, because it is the one no fixture can stand in for:

```powershell
node -e "const{buildForgeCardIndex}=await import('./game/contracts/forge-card-index.mjs');const i=buildForgeCardIndex(process.env.CRANKMAGIC_FORGE_ROOT||'../forge');console.log(i.scripts+' scripts, '+i.names+' names');for(const n of ['Sol Ring','Malakir Rebirth // Malakir Mire',\"Lim-D\u00fbl's Vault\",'\u00c6therize','J\u00f6tun Grunt','Fire // Ice','Boseiju, Who Endures'])console.log((i.resolve(n)?'OK  ':'MISS')+'  '+n)" --input-type=module
```

Every line should read `OK`. A `MISS` means Forge names that card differently than expected and the ladder needs another rung — send the output.

**4 — Prove the gate blocks.** Start the host, open Game setup, and try to prepare a deck containing a card Forge does not have (any invented name in a pasted list will do). Expect a refusal naming the card, **before** Ready Up becomes available. Previously this passed preparation and failed at engine load.

**5 — A solo table to turn 3.** One human, three AI. Confirms Forge launches, the bridge is green, and the decks the doctor blessed actually load.

**6 — The guest path, on a clean browser.** Set up two humans, Email Invite yourself, then **press Start** — the sequence that used to void the link — and open the emailed link in a browser with no history for the site. Expect the seat lobby, not an expiry. This is the Track A fix and it is the one that most needs a live pass, because a contract test proved the invariant, not the round trip.

**7 — The two new host levers, during that game.** With an API-piloted AI seat, press **Prompt AI** (expect a response, not "no AI is running"), and call force-advance on a seat sitting on a decision:

```powershell
$t=(Invoke-RestMethod http://127.0.0.1:8768/api/setup).token
Invoke-RestMethod -Method Post http://127.0.0.1:8768/api/table/force-advance -Headers @{'X-Commander-Token'=$t;'Origin'='http://127.0.0.1:8768'} -ContentType 'application/json' -Body '{"seatId":1}'
```

Expect `ok:true` with the label of the action taken, and a line appended to `force-advance.ndjson` beside the match journal.

**8 — The paste path, which nobody has ever been able to use.** Take the invitation email's own
example format and paste it as a guest:

```
1 Chulane, Teller of Tales

1 Sol Ring
98 Forest
```

Expect it to import. Then try it with the commander at the bottom instead, and once more pasted
straight out of a spreadsheet. All three should work; before this they all failed.

**9 — Skip to end, during your own turn.** Main phase done, press it, and confirm it runs you to
end of turn and stops at the first real choice.

**What to send back:** the doctor output, step 3's list, and anything red. Steps 4 and 6 through 9 are pass/fail by eye.

Once step 6 passes live, the remaining game-day risk is §11 — and none of it stops a game starting.
