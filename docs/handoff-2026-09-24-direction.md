# Handoff — the direction: the web app does everything but play

| | |
| --- | --- |
| **Branch** | `claude/engine-hosting` — draft PR #359, pushed, clean. Head: the commit that adds this file. |
| **Baton** | Free (`docs/ACTIVE.md`). |
| **Read first** | `docs/ACTIVE.md`, then this file, then only the files §5 names for the piece you take. |
| **Also current** | `docs/decisions-2026-09-24.md` (Rob's board calls); the second half of `docs/handoff-2026-09-24.md` (what the board work proved, and how). |

Everything in §3 and §4 was **measured by reading the code on 2026-09-24** (file:line given); nothing
there was run unless it says so. §5 is the work, in order, each piece with where it lands and how it is
proven. §6 is the parallel engine track.

---

## 1. Rob's direction, 2026-09-24 (verbatim)

> "My expectation is that CrankMagic on Github.io is where everything but play happens. Then on Play
> tab in github.io, I should have the redirect to local host. Then when I open the local host from that
> page in github.io, the local host then has the Lobby where I set up the game, then when I get into
> the local host I have the board setup page first, showing the pre-lobby view which should just be
> setting the table rules. Then I press "Enter Lobby". The lobby is both where I set which seats are
> human or AI, the AI decks, and I send the human invites, we've done this work then they join in,
> choose their decks if Human, then ready up. This local host should not display anything other than
> the pre-game setup, the lobby, the ability to load back up file of a user's decks from CrankMagic on
> Github.io, the ability to export game results that can then be loaded into CrankMagic on GitHub.io
> (which may require an additional option in the upload options, as a deck will already exist there,
> and this would be appending game history to that deck in CrankMagic on Github), and the actual game
> play. In parallel to all of this work, we are building our replacement of Forge, and will soon pivot
> (once we have fully functional games with Forge and local host done) to migrating it all to a
> cloud-based, self-sustaining and fully integrated CrankMagic game."

## 2. The target

```
github.io (the web app)                      local host (127.0.0.1:8768)
─────────────────────────                    ─────────────────────────────────────────────
Decks · Cards · Build · Explore · …          1. Pre-lobby: the table rules, nothing else
Save a backup file ──── backup file ───────▶ 3. Load my decks (the backup file)
Play tab: "open your local host" ──────────▶    │  "Enter Lobby"
                                             2. Lobby: seats human/AI · AI decks · invites
                                                   guests join · humans choose decks · ready up
                                             5. The game (the board)
Add game results (new upload) ◀── results ── 4. Export game results
  → appended to the deck that is already there
```

**The rule for the local host: it shows those five surfaces and nothing else.** Anything else on it is
removed or left to the web app — not polished. That is the test for every local-host change from now on.

**Decks go out and results come back by FILE.** This replaces the tunnel-based return path in
`docs/plan-web-to-local-table-2026-09-21.md` (see §3.7). Guests still join over the gateway and tunnel.

**The pivot condition** — "fully functional games with Forge and local host" — is not yet defined in
numbers. §6.3 proposes a gate; Rob has not confirmed it.

## 3. Where it stands today

### 3.1 Landing — the lobby Rob describes already exists, and the host lands on it

- `http://127.0.0.1:8768/` redirects to `/app/#game` (`game/tools/serve-review.mjs:285`); both launch
  scripts open or print that URL (`start-crankmagic.ps1:21,101`; `launch-crankmagic-online.ps1:12,103`).
- `/app/#game` is the web app's own lobby, the 2b `cm-lobby-table` (`crankmagic-game.js:1306-1467`,
  built at `:1378`), drawn for real on 127.0.0.1 (`:1186`, `:1307`) with the sidebar hidden by CSS
  (`crankmagic.css:2683-2685`).
- It already has Rob's lobby: "Seat your deck" (`:946`), "Invite someone" / "Seat an AI" (`:985`),
  "Email Invite" / "Copy Link" (`:675-688`), "Set up this seat" for AI seats (`:995`, `:1610-1617`),
  "Ready" / "Ready Up" (`:1159`, `:1169`), a 10-second countdown (`:1213`, `:2270-2279`).
- **Correction to earlier docs.** `ACTIVE.md` and `handoff-2026-09-24.md:136-142` said the local host
  "is not the app's lobby". That is true only of `/review`; the host LANDS on the app's lobby.

### 3.2 There are TWO pre-game flows, and no rules-only pre-lobby

- **The landing lobby** edits table rules in a "Host tools ▾" menu on the same screen as the seats
  (`crankmagic-game.js:1343-1351`, read-only panel `:863-872`). No separate rules page, no "Enter Lobby".
- **`/review`'s Game setup** (`game/ui/setup.mjs`) is a second flow: `setupStage` `''` is "Build your
  table" (rules) with one button, "Set up game"; `'seats'` adds seats, "Prepare decks", then "Launch
  game" (one human) or "Open lobby" (two or more) (`setup.mjs:4,102-111,143`). Its "lobby" is "Your live
  table" (`:62-77`) with QR, invite link, email drafts, ready-up and countdown — **this is where a
  multi-human game actually gathers.** The stage is not saved; a reload returns to rules.
- **How they meet:** Start in the landing lobby calls `/api/setup` → `/api/import-deck` → `/api/prepare`
  → `/api/start` (`crankmagic-game.js:2283-2364`). One human: waits on `/api/live`, opens `/review` in a
  tab named `crankmagic-board` (`:2204-2246`). Two or more: the SERVER opens its own lobby
  (`serve-review.mjs:256-266`) and the landing page only shows a notice (`crankmagic-game.js:2326-2331`).
  "Email Invite" / "Copy Link" also open that server lobby (`:1636-1674`).
- The phrase "Enter Lobby" appears nowhere in the repository.

### 3.3 Decks: a backup can be restored on the host, but nothing shows how — and edits never reach a game

- The web app's backup: Menu › Back up and restore (`index.html:110`) saves
  `CrankMagic-backup-<date>.json` (`crankmagic-app.js:375`), format `live-state@1` / `crankmagic-backup`
  v1 with a SHA-256 checksum and `payload {state, history}` (`collection-exchange.js:18`). `state` is the
  whole library (decks with versions, cards, lots, games…); `history` is the undo journal.
- Restore replaces the ENTIRE library after "type RESTORE" (`crankmagic-exchange-ui.js:5`,
  `collection-repository.js:27`). The deck file `CrankMagicDecks@1` (New deck › Load footer,
  `crankmagic-decks.js:507-569`) imports new decks and **skips any id that already exists**.
- On the host, both importers exist in the served copy — but the Menu is hidden on 127.0.0.1
  (`crankmagic.css:2683`), the lobby links to neither, and its "Visit CrankMagic ↗" tooltip points at
  the hidden Menu (`crankmagic-game.js:1329`). The Node host itself accepts no backup file: no route,
  and request bodies are capped at 64,000 characters (`serve-review.mjs:209-211`).
- **The blocker:** at Start, decks with `deck:live:*` ids are requested BY ID and served from the host's
  committed `data/live-state.json`, and any deck sharing a commander with one of those, within the cost
  cap, is SWAPPED for the host's copy (`crankmagic-lobby.js:615-647`). **Edits made to D1–D7 in any
  browser never reach a game.** Single-deck handoff imports are held in memory only
  (`game/tools/setup-catalog.mjs:57-70`, lost on restart).
- `schema/live-state.json` does not describe the backups the app writes (generator and `count` differ,
  `collection-exchange.js:18`); restore never checks the schema.

### 3.4 Results: one report per game, downloadable — and no way back in

- At game over on `/review`, "Download report" saves `crankmagic-match-<matchId>.json`,
  `CrankMagicOnlineMatchReport@1` (`game/tools/match-report.mjs:25-52`, `/api/match-report` at
  `serve-review.mjs:167`, button `review.mjs:1429,1455`): deck name, source deck id/version, outcome,
  finish, pod, turns, bracket, opponents, telemetry.
- Only the LAST game this host process launched can be fetched (`serve-review.mjs:167`); after a restart
  there is nothing (`local-game-launcher.mjs:72-73`). None of the 47 folders under `game/.local/games/`
  on Personal-HP has a `summary.json` or `seat-<n>.json` — **no game has finished in a way that produced
  one.** Why is not established.
- The board tries to send the report back to its opener (`review.mjs:1435-1439`), but the lobby opens it
  with `noopener` (`crankmagic-game.js:2234`), so nothing arrives. **The lobby's text and help say
  finished games are written back to the deck (`:2051`, `:2393-2394`); in the reachable flow they are
  not.**
- **The web app has no results import.** The code that appends a match report to an existing deck is
  written: `attachMatchReport` (`crankmagic-online.js:3-10`) validates the report, finds the deck by
  `deck.source.deckId`, skips duplicates by `game:online:<matchId>:<seatId>`, and appends a game record.
  Its only callers are in the `#online` view, which is overridden by a redirect (`:114`), so it never
  runs. Games live in `state.games[]`, linked by `deckId` + `deckVersion`, with an `online` field for
  the full report (`collection-model.js:615-617`) — **"appending game history to that deck" is the
  model's normal operation.**

### 3.5 Everything the local host shows outside the five surfaces

All of this is reachable on 8768 today and is to be removed or left to the web app (§5, piece 2):

- **The whole workshop, by URL.** The sidebar is hidden by CSS only; routes are not restricted:
  `#decks` (New deck, Load, deck pages), `#pull`, `#change`, `#how`, `#cards` (with buy / orders /
  tabletop / sheet), `#collection`, `#shop`, `#discover`, `#lab`, `#trade`, `#play`; an unknown hash
  falls back to Decks (`crankmagic-app.js:122`). Also served: `/app/crankmagic.html`,
  `/app/graph.html`, `/app/import-quintorius-owned.html`, `/crankmagic-online-overview.html`
  (`serve-review.mjs:68-75`).
- **On the landing lobby:** the "?" pop-up, a read-only "Game history" table, "Visit CrankMagic ↗", the
  intro line, the brand block; in Host tools, a Game Changer cap with a "Confirm" that gates nothing,
  "Seat an opponent", "Clear the table"; in the center panel, "Remote guests", a "Local host" link that
  loops to itself, "Stop", "Open table", "Send Log" (a mail to Rob), "Open the game board"; "Before you
  sit"; per seat "Choose mat", "Deck Summary", "View cards", "Trim to the bracket", "Generate
  Simulation Report", commander art zoom, "Build from Commander", "Define play style"; the "Local host
  offline" banner; a legal footer whose targets 404 (`crankmagic-game.js` and `crankmagic-online.js`,
  lines in the 2026-09-24 inventory).
- **The `/review` Game setup** — the second flow in §3.2, with an AI controller (OpenAI / Anthropic,
  model, API key), deck sources "Preloaded variations", "Deck Lab", "Archidekt", play style, a playmat
  picker, "Prepare decks", an unknown-card swap panel, rematch Yes / No, "Close table".
- **On the board (`/review`):** "Deck workshop ↗" (visible only in replay), "Game setup", "Join live
  table", "Prompt AI", "Your deck" (a filtered deck browser that loads workshop data), "View options"
  (Follow active player, Hide other boards, Sound), the recorded-phase timeline and "RECORDED TABLE",
  the development footer note and "Rules reference ↗", the Tracker tab with "Export tracker report",
  "Recommended actions", a card-onboarding pop-up that says AI onboarding is "not wired yet"; URL modes
  `?replay` (404s: no `match.json`), `?embedded`, `?debugDecisions`.

**Part of the game, and staying:** My board, Hold priority, Skip to end, Panel, View hand / Focus (board
size, other boards, Table view), History, End game, the Card / History / Combat tabs, hand size, the
board resize handle, the table notices. Whether "Sound" and "Follow active player" count as the game is
a call for Rob when piece 2 is done.

### 3.6 The Play tab on github.io

`views.game` renders `cloudPointer()` when not on 127.0.0.1 / localhost (`crankmagic-game.js:1306-1307`,
enforced by `tests/wireframe-conformance.mjs:185-207`): "Games run on your local host", a link to
`http://127.0.0.1:8768/app/#game`, "How to start the host", "Deck editor". Two defects:

- **"How to start the host" leads back to itself** — `#online` is replaced by a redirect to `#game`
  (`crankmagic-online.js:114`), which makes its copy-the-start-command button, health check and deck
  handoff (`:45-113`) unreachable. `game/skills/start-crankmagic/SKILL.md:12` still describes them.
- **It cannot tell whether the host is running:** `probeHost()` returns false without asking
  (`crankmagic-game.js:1203-1204`). The host's `/api/health` already allows `https://minorrob.github.io`
  and private-network access (`serve-review.mjs:142-151`) and the page's CSP allows 127.0.0.1:8768
  (`index.html:9`); Chrome's Local Network Access prompt is the remaining obstacle (`:1176-1182`).

### 3.7 What happens to `plan-web-to-local-table-2026-09-21.md`

Its five pieces (none built) route github.io → tunnel → gateway → host: the lobby learns the tunnel
address; "Send Local" POSTs a table from the web lobby; invitations point at the web lobby; Ready
packages the deck; each player gets their own address. The 2026-09-23 decision already made the cloud
lobby a pointer (`decisions-2026-09-23.md:238-247`). **Rob's direction keeps the lobby on the local
host and moves decks and results by file, so pieces 1–4 are superseded.** What survives: guests still
reach the host's lobby through the gateway (8769) and the tunnel that `start-crankmagic.ps1
-RemoteGuests` runs, and invitations must carry the tunnel address a guest can actually reach (the plan's
piece 5, and UAT HAND-08, failed). Mark the plan superseded where it is, not silently.

---

## 4. Decisions the next session needs from Rob before building

1. **Which pre-game flow survives.** Recommendation: **the landing lobby (`/app/#game`,
   `cm-lobby-table`)** — it is where the host lands and where the Play tab points, it is the 2b design,
   and it already has seats, AI decks, invites and Ready. Take the multi-human gathering (guest join,
   ready-up, countdown) out of `setup.mjs` and the server's own lobby and drive it from there; `/review`
   becomes the board and nothing else. The alternative — make `setup.mjs` the flow — keeps a working
   multi-human path but throws away the 2b lobby.
2. **What "load my decks" does to the host's copy of the library.** Recommendation: a **decks-only**
   load from the backup that adds new decks and UPDATES existing ones by id, rather than Restore's
   replace-everything-after-typing-RESTORE. The host only needs decks.
3. **The pivot gate** in §6.3.

## 5. The work, in order — one PR each

Every piece: screenshots to Rob at each iteration (`game/tools/board-shots.mjs` for the board); the full
gate (`PAGE_BUDGET_REQUIRED=1 GEOMETRY_REQUIRED=1 bash runtests.sh -q`) before any commit; a test that
fails when the piece is broken, broken on purpose once to prove it.

1. **One pre-game flow: pre-lobby → "Enter Lobby" → lobby** (after decision 1).
   A rules-only page first — bracket, deck cost cap, human and AI seat counts, AI controller — with a
   single "Enter Lobby"; the lobby as it is, minus rules editing. Multi-human tables gather there.
   Lands in `crankmagic-game.js` (`views.game`, `:1306-1467`, Host tools `:1343-1351`),
   `crankmagic-lobby.js`, `serve-review.mjs:256-266`, `game/ui/setup.mjs`. Proven by: a conformance check
   that the lobby is unreachable before "Enter Lobby", a live pod through the new flow, and a two-human
   table (a real guest) reaching turn three.
2. **The host shows the five surfaces and nothing else.** On 127.0.0.1, any route but the game (and the
   guest seat page) goes to `#game`; the §3.5 extras are removed from the local build; `serve-review.mjs`
   stops serving the one-shot and overview pages. Lands in `crankmagic-app.js` (`route()`, `:122`),
   `crankmagic-game.js`, `game/ui/review.html` / `review.mjs`, `serve-review.mjs:68-75`. Proven by: a
   browser suite that walks every hash on a local origin and finds only the five surfaces, and a
   conformance check listing the allowed controls.
3. **Load my decks (backup file) — and make them the decks that play.** A "Load decks from a CrankMagic
   backup" control in the pre-lobby and lobby; decks-only, updating by id (decision 2). Then fix the
   blocker: send the player's actual deck definitions at Start instead of swapping `deck:live:*` for the
   host's committed copy (`crankmagic-lobby.js:615-647`); raise or remove the 64,000-character body cap
   for that route (`serve-review.mjs:209-211`); keep deck id and version through to the report
   (`:645-646`). Proven by: a test that an edited D1 plays as edited, and a report whose source deck id
   and version match the backup's.
4. **Export game results.** Find out why no game has written `summary.json` (§3.4) and fix it; keep every
   finished game's report, not only the last; an "Export game results" control (lobby and game over)
   that downloads every report since the last export as one file. Give the file a schema in `schema/`.
   Lands in `game/tools/match-report.mjs`, `local-game-launcher.mjs`, `serve-review.mjs:167`,
   `review.mjs:1429-1455`. Proven by: a finished pod producing a report that validates against the schema.
5. **"Add game results" on github.io.** A new upload option (Decks page, or the Load pane footer at
   `crankmagic-decks.js:569`) that reads the export and calls `attachMatchReport`
   (`crankmagic-online.js:3-10`) per report: appended to the deck by `deck.source.deckId`, duplicates
   skipped, and — when the id is not in the library — a "which deck was this?" choice rather than a
   guess (Rob's rule: decisions belong to the player). Until pieces 4 and 5 land, correct the lobby
   text that claims results write back (`crankmagic-game.js:2051`, `:2393-2394`). Proven by: importing a
   pod's export twice appends each game once, to the right deck and version.
6. **The Play tab's pointer.** Fix "How to start the host" (`crankmagic-online.js:114`); give it the
   copy-the-start-command step; optionally detect a running host through `/api/health`
   (`crankmagic-game.js:1203-1204`). Update `SKILL.md:12`. Small; any time.
7. **The docs.** Mark `plan-web-to-local-table-2026-09-21.md` pieces 1–4 superseded by this file; fix
   `schema/live-state.json` against what Save actually writes; give `CrankMagicDecks@1` and the match
   report schemas.

## 6. The parallel track: CME, the Forge replacement

### 6.1 Where it is (from the commits; `docs/engine/PLAN.md` §6's status table is STALE — it still says
phase 1 is in progress — and should be brought up to date first)

- Phases 0 and 1 done: scaffold and the kernel, the gate passing on 1,000 four-player games replayed
  byte-identical with no hidden-card leak (#353; `node tests/engine-gate.mjs`).
- Phase 2 well along: 2.1 vocabulary, selector grammar and `CrankCardScript@1` (#354); 2.2a/b measured
  primitives and resolution (#355, #356); 2.3a combat keywords (#357); 2.3b how permanents enter
  (`d83b09a`); 2.4 coverage (`f1c542c`): **Rob's seven decks 260 of 477 cards (54.5%) have every rule
  they need; the library 1,007 of 2,365 (42.6%)**, and the list of what to build next comes from it.
- 4.1 the runtime (`8b2bfbc`): `CRANKMAGIC_ENGINE=crank` runs the engine in the host's own process, its
  surface proved export-for-export against the Forge launcher; it refuses before the game, by name,
  because every card in the support ledger is still `unsupported`.
- CR 113.7a last known information (`a3fa2f2`).

### 6.2 The rule that governs it

`docs/engine/ADR-001-own-engine.md`: the Comprehensive Rules and Scryfall oracle text come in, nothing
from Forge comes in, and a divergence is settled against the CR. A claim that depends on Forge is
unproven until a local session proves it.

### 6.3 The pivot gate — PROPOSED, not confirmed by Rob

"Fully functional games with Forge and local host done" could mean, all at once:

1. Pieces 1–5 of §5 done, each with its proof.
2. A real four-seat game — at least one invited human guest over the tunnel — played from the pre-lobby
   to a finish, its results exported and appended to the right deck on github.io.
3. `game/docs/readiness-plan-2026-09-18.md` §10 met: `runtests.sh` green with `game/tests/`, `npm run
   doctor` green, unresolved cards and unvalidated decks are blockers not warnings.

Put it to Rob before treating it as the gate.

## 7. Standing rules that carry over (all in `AGENTS.md` or the decision records)

- Decisions inside the game belong to the players; behavior that would break a game is refused, with
  instructions. Merging to `main` is allowed when the checks are re-run by the merging session.
- American English everywhere; `tests/feature-wiring.mjs` counts UK spellings and the count only goes down.
- Every card on a mat is the commander's size; nothing goes below a zone's edge; the battlefield's
  rules are `docs/decisions-2026-09-24.md` §8.
- Show Rob a screenshot at each UI iteration.

## 8. Next

**Put §4's three decisions to Rob, then start §5 piece 1.** Open `crankmagic-game.js:1306-1467` and
`game/ui/setup.mjs` first.
