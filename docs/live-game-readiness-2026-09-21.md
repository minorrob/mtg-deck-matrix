# Ready to test a live game — verified on Personal-HP, 2026-09-21

**Written by:** Claude Code (Opus 5), local session on Personal-HP.
**Supersedes the gating advice in** `docs/handoff-live-game-test-2026-09-20.md` §8 and
`docs/ACTIVE.md`'s "four open PRs" table. Read this first; that handoff's §1 (a live game plays
in Forge, not the browser) still stands and is still the thing to understand before starting.

Rob asked for the app to be ready for him to test a live game. This records what was actually run
on this machine today, what it returned, and what is left for him to do.

---

## 1. The gate that was not a gate

`docs/ACTIVE.md` said four open PRs — #259, #260, #262, #263 — had to be triaged before any
live-game test, because they fix the mulligan, the untap step and guest entry: run-book steps 5
and 6, the first steps that play a game.

**All four were already merged.** Every commit of the #259–#263 chain
(`bf578f0 cf2b6c3 360774a 6614f21 ac14533 ca31bd0`) is an ancestor of `main`, and
`git rev-list origin/main..<branch>` returns 0 for three of the four.

The fourth, #263, had one commit left (`061060c`). It deletes `C.views.game` from
`crankmagic-online.js` to stop it replacing the lobby with a `/review` iframe. **That problem is
already fixed on `main`, and fixed better:** `C.views.game` is now *wrapped* rather than
overwritten — it calls the real lobby from `crankmagic-game.js`, then adds the host-offline
banner, and the legacy iframe view moved to `C.views.online`. Merging `061060c` today would delete
that wrapper and `#online` with it.

All four are closed, each with its evidence in the closing comment. **Nothing blocks the test.**

The same readiness plan flagged a second blocker: `main` carrying `DEFAULT_OPENAI_MODEL` values
that are not real OpenAI models, giving HTTP 400 on every AI seat. That is also resolved —
`game/tools/windows-credential.mjs` reads `gpt-5-mini` / `gpt-5`, and
`game/tests/windows-credential.test.mjs` asserts it.

---

## 2. Run-book steps 1–4, run today, with their output

The run-book is `game/docs/readiness-plan-2026-09-18.md` §12. Steps 1 to 4 need no game and all
four were run here.

**1 — Every suite, on the real machine.**

```bash
PAGE_BUDGET_REQUIRED=1 GEOMETRY_REQUIRED=1 bash runtests.sh -q
```

→ `98 suites passed.` (The run-book says 92; the count has grown. Browser suites drove Chrome
through `UAT_PLAYWRIGHT` / `UAT_CHROME` rather than skipping.)

**2 — Can this computer host tonight?**

```bash
node game/tools/doctor.mjs
```

```
  ok    Node runtime           v24.19.0
  ok    Forge card database    33,819 card scripts, 35,649 names
  ok    Java runtime           C:\Users\robmi\CrankMagic\runtime\jdk-17.0.20.1+1
  ok    Local host             answering on 8768
  ok    OpenAI credential      crankmagic_openai_api is readable
  ok    Remote guest tunnel    cloudflared is installed
✓ Ready to host a game.
```

**3 — Does Forge know every card in your decks?** The run-book calls this the most valuable check,
because no fixture can stand in for it.

```bash
node game/tools/check-my-decks.mjs
```

→ `OK` for all seven decks (D1–D7, 100 cards each) and for all seven awkward names —
`Sol Ring`, `Malakir Rebirth // Malakir Mire`, `Lim-Dûl's Vault`, `Ætherize`, `Jötun Grunt`,
`Fire // Ice`, `Boseiju, Who Endures`. `✓ Every card in all 7 decks resolves to a Forge card
script.`

**4 — Does the gate actually block?** Run through the API rather than by hand, with an invented
card in an otherwise legal list:

```bash
curl -X POST http://127.0.0.1:8768/api/import-deck \
  -H "Content-Type: application/json" -H "X-Commander-Token: $TOKEN" \
  -H "Origin: http://127.0.0.1:8768" \
  -d '{"schema":"CrankMagicDeckHandoff@1","name":"Gate probe","commanders":["Krenko, Mob Boss"],
       "rows":[{"name":"Sol Ring","quantity":1},
               {"name":"Zzyzx Nonexistent Sprocket","quantity":1},
               {"name":"Mountain","quantity":97}]}'
```

→ `{"error":"Card definition unresolved: Zzyzx Nonexistent Sprocket"}`

It refuses **at import**, naming the card, before preparation and long before engine load. That is
exactly the failure mode the gate exists for: this used to pass preparation and fail at engine
load with everyone waiting.

**Steps 5 to 9 need a game and are Rob's.** They are unchanged in the run-book.

---

## 3. The lobby, served by the real host

`http://127.0.0.1:8768/app/#game` was opened against the running host and photographed. It serves
the current files (`crankmagic.css?v=169`, `crankmagic-game.js?v=50`, `crankmagic-app.js?v=263`),
draws the wireframe-2b table, and shows **no host-offline banner** while the host is up — so the
wrapper in `crankmagic-online.js` is doing its job.

### Two things you will see and should not chase

**Repeated `409 (Conflict)` in the browser console, every two seconds, on the Play page.** This is
correct and deliberate. The lobby polls `/api/table/readiness`; the host answers 409 with
"No multiplayer lobby is open" until a table exists, and `pollLiveReadiness` reads 409 as "the
host is up, no table is open" — there is a comment saying exactly that at
`crankmagic-game.js:1904`. The browser logs the status itself; JavaScript cannot suppress it.
Nothing is wrong. They stop once a table is open.

**"Offline app caching is unavailable: Failed to register a ServiceWorker…"** was seen while
testing, but **it is an artifact of the embedded browser used for the test, not a defect.** The
same registration fails against a plain static file server on another port, and the script itself
fetches 200 with `text/javascript`. Chrome registers it normally. If it ever appears in real
Chrome, it is worth investigating then; it is not worth investigating now, and the app works
completely without it.

---

## 4. What is on the Play tab now that was not before

The lobby is wireframe 2b (`DELTA-play-and-implementation.md` §B, README "Play lobby
(table-first, wireframe 2b)"):

- Four quadrants in the order the players sit — 2 · 3 across the top, 4 · you across the bottom,
  you bottom-right — each with its own animated status element, its label bar and status pill
  along the top edge, and the commander card at 488:680 standing in the outer bottom corner with
  a detail column beside it. An empty seat shows the same frame, dashed, with a "?".
- **The color-identity fan now draws.** It never has before: every quadrant's wedge swept ninety
  degrees outside its own quadrant, where it was clipped to nothing. Present in the DOM, right in
  its colors, invisible on screen — which is why an earlier fix to the identity data appeared not
  to work. `tests/wireframe-conformance.mjs` walks a point along each sweep and fails if it lands
  outside.
- The player's four controls on their own seat only: Change deck, Choose mat, Ready / Not ready,
  Leave seat. **Choose mat is new and real** — it picks among the six elements of wireframe turn 3,
  painted by the same module that paints them under the table.
- Host tools is a menu in the action row, never on the table.
- The table's white card carries Bracket, Deck cost cap, AI pilot and Remote guests, with the
  wand-and-gear stamped into its corner.

**What this means for the test:** the lobby is where the test starts, and it is not the screen
anyone has tested against before. Treat unfamiliar lobby behavior as worth reporting even if the
game itself runs.

---

## 5. What is left, in the order it matters

1. **Run steps 5–9.** Nothing blocks them. Step 6 (the invitation on a clean browser) is the one
   the run-book singles out, because the invitation fix is proven today by a contract test holding
   an invariant, not by a link actually opening.
2. **The mat surface** (`game/ui/review.mjs`, `game/ui/mats.css`) against wireframes 2e and 2f.
   Not compared yet. `game/ui/*.mjs` is also the remaining raw-hex blind spot: the ceiling is 475
   and nothing checks those files, which is the same shape of gap that hid 38 literals in the
   graph canvas.
3. **The nine wireframe pages and four dialog groups** (1a–1i, 4a–4h). `tests/wireframe-conformance.mjs`
   covers the Play lobby only. The pattern is established — read the wireframe's own data, assert
   structure and content order — and extending it is mechanical.
4. **Gallery Explore's remaining pixel differences**, recorded in the commit that added its pairs:
   the h1 is 44 where that screen says 36, and the stage gap is 10px narrower because the app has
   a drag handle the drawing has no equivalent for.

---

## 6. Standing rules, unchanged

A test that was red first for every fix, named in the commit. The full suite with
`PAGE_BUDGET_REQUIRED=1 GEOMETRY_REQUIRED=1`, browser suites driving Chrome. Pins moved through
the chain for every changed asset and `node tests/asset-versions.mjs --update` after. Every
visible change rendered with `node tools/render-routes.mjs` and shown in chat. American English
everywhere. Git only inside `C:\Users\robmi\CrankMagic\repo`. Never touch
`data/deck-ratings.json`, `data/simulation-summary.json`, `sim/` or `data/deck-guides.json`.
Merge only on a CI result just read for that head SHA; pending is not green.
