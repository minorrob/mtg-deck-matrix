# CC-1 reconciliation: the Replit prototype pack and the planned prompts against the repo (2026-10-14)

Read-only reconciliation produced before `INSTRUCTIONS.md`; that file is the authority where the two differ. Line numbers refer to the repo as of 2026-10-14 (commit on `main` at that date). "Not staged" below meant "not read in the first pass"; the addendum at the top settles those that were read afterwards.

## Addendum 2 (2026-10-14, later): the Replit source arrived

Everything below that says the Replit source was "not found" is now superseded: Rob exported the Replit repo on 2026-10-14 and it is committed at `docs/reference/replit-play/`. `REPLIT-SALVAGE.md` beside this file is its read, with a per-PR port list. Section B's prototype inventory below was built from the pack's documents and the brief; the salvage file is the authority on what the prototype actually does.

## Addendum (read after the second pass): `game/engine/projection.mjs` and `game/contracts/table-lifecycle.mjs`

These two files settle four of the open questions below; `INSTRUCTIONS.md` already reflects them.

- **The view's `state` is the projection** (`room.mjs:44` imports `projectFor`; `:503` sends `state: projectFor(state, seat)`), so the cloud view carries more than the board reads today:
  - `priorityPlayerId` (projection.mjs:205) — settles F.5: the priority holder is in the view; `waitingOn` is no longer the only signal.
  - `stack[]` entries carry `stackId, abilityId, cardId, name (null when face down), faceDown, playerId, kind, stage, targets[]` (:218-228) — settles E.6/F: targeting arrows can read `targets` now; no room change needed.
  - `combat` carries `attackingPlayerId, defenders[], attacks[{attacker, defender, planeswalker?, blocked, blockers[]}]` (:209-215) — settles the defender question for attack arrows and for "attacking you".
  - Cards: `cardId, name, faceDown, owner, controller, tapped, damage, counters{}, types[], power, toughness, keywords[]` (current characteristics on the battlefield, :80-99), `level?`, `monstrous?`, `prepared?`, `commander`, `commanderKey` (:100-108). `keywords` are sent for every shown card, not only hand cards. **Oracle text and the type line are still not in the view.**
- **Countdown:** `t.countdownAt = now + 10000` (table-lifecycle.mjs:104); `countdownBlockers()` (:10-42) wording: "A game needs at least two seats", "A game needs a human", "invitation sent, not joined yet", "not connected", "no validated deck", "not ready". Start is a `countdown` transition today (:94-104), cancel `cancel-countdown` (:108). The brief's no-Launch rule is a change to the transition that fires `countdown` when the last human readies (INSTRUCTIONS D6, PR 1c).
- **Countered spells** remain absent from history (history.mjs:47) and there is no events array; `INSTRUCTIONS` 2a derives `countered` from a stack entry vanishing without a "resolved" line and with no permanent arriving, and files a backlog line for a real history line.
- **The "ticker" PR (G 4b below) was dropped** from `INSTRUCTIONS`: Rob's "bottom ticker pop-up like we already do for status notifications" is `C.notice` (`crankmagic-app.js:127`), which already exists; event lines go to the reveal shelf and the History module instead.

---

# CC-1 v2: Play reconciliation against the Replit prototype pack and the planned CC-2..CC-5 prompts

Second pass, with the files the first pass marked "(not staged)" now under `/mnt/user-data/uploads/CrankMagic/repo/`. Read-only; nothing under uploads was modified. `repo/` means `CrankMagic/repo/`, `pack/` means `CrankMagic/archive/desktop-mtg/CrankMagic-Replit-Pack/`. Line numbers are from the staged copies.

## 0. What is and is not staged now

**Two Play implementations; only the cloud one ships.**

| Path | Lobby | Board | Ships where |
| --- | --- | --- | --- |
| Local Forge host (retiring, AGENTS.md:190-191) | `crankmagic-game.js` (`views.game`, local only; cloud copy is a pointer, :1051,1166) over `crankmagic-lobby.js` (pure model) | `game/ui/review.mjs` (1,765 lines, Forge view: `live.ui.prompt`, `priorityPlayerId`, `telemetry.recent`) | `127.0.0.1:8768` only; `LOCAL_PLAY` left out of every release (`tools/release-pages.mjs:75,109`) |
| Cloud (Play in the cloud, M5) | `crankmagic-table.js` (`views.table`, 432 lines) | `crankmagic-board.js` (1,513 lines) | staging (`cloud-staging`, `play:"cloud"`, release-pages.mjs:108-115). Production: Coming Soon (`pages` leaves out all PLAY, :100; app.js:670) |

CC-2..5 target the cloud path. Everything below that says "the lobby" means `crankmagic-table.js`.

**Still not staged, and it matters where said:** `game/engine/projection.mjs` (the function that builds `view.state`; the card fields are read from its consumers and the suites, not from it), `game/contracts/table-lifecycle.mjs` (the countdown's number, `countdownBlockers` wording), `game/engine/**` (card definitions, `characteristicsOf`), `tests/uat/browser-runner.mjs`, `tests/card-size.mjs`, `tests/fixtures/asset-versions.json`, `tests/uat/play-e2e.mjs`, `assets/audio/sfx/`. Everything else the first pass flagged is now read.

**Replit source code: not found.** Unchanged from v1: `pack/` is three md files and one grayscale IA wireframe (one Play lobby screen, `wireframes/index.html:482-526`); `repo/prototype/` is the Slot Ladder (Deck/Shop) prototype, unrelated to Play; the pptx holds two screenshots (a strip; a Full-screen rail with a **3D** button that `crankmagic-board.js:596-601` does not have). The brief's `gameplay-anchor.md` and `sample-views.json` are not staged.

---

## A. How Play is wired today

### A.1 Entry points

- **Routing** `crankmagic-app.js:180` `route()`: `#table/<id>/<code>` → `views.table({id, code})`; `#table?id=` → the lobby; `#table` → New table. `render()` (:289).
- **Play tab by build** (app.js:670-671): `coming-soon` → a panel; `cloud` → `views.game = views.online = () => views.table(new URLSearchParams())`.
- **`views.table`** (`crankmagic-table.js:227-257`): refuses to draw unless `<meta crankmagic-play=cloud>` and `<meta crankmagic-accounts=on>` (`cloudPlay`, :38-39); with a live game of yours (`C.board.live()`) it `location.replace`s to that table (:234-235); no id → `newTable()` (:268); with `code` → `POST /join` then rewrites the hash (:249-252); then polls `GET /api/tables/<id>` every 2 s (`POLL_MS`, :40; `refresh`, :219-225) and ticks the countdown number every 250 ms from the server's clock (`skew`, :64-65, :238-247). Its cleanup detaches the board but keeps the socket (:256).
- **Host path:** New table form (`newTable`, :268-278: host name, seats 2-4 each "A person I will invite / An AI / Nobody") → `POST /api/tables {hostName, seats}` (:300) → `cloud/tables.mjs:40-47` mints the id and forwards `/table/create` to the `GameTable` object with `x-crankmagic-email` (:33-36) → `game/room/table.mjs:169-182` `create()` (host in seat 1, `settings {startingLife:40, bracketLimit:null}`).
- **Guest path:** host `table-invite` (:305-317) → `POST /invite {seatId}` → `table.mjs:185-195` (32 random bytes, sha256 stored, `INVITE_TTL` 24 h, :31) → link `${origin}/api/join/<id>/<code>` (`inviteLink`, :81), mailto and QR (`CrankQR.svg`, :314) → `cloud/worker.mjs:27-30` `joinLocation` sends the browser to `#table/<id>/<code>` after Access → `POST /join {code}` → `table.mjs:206-221` (a spent/expired code: 410 "This invitation has expired or was withdrawn. Ask the host for a new link."; the same person again: their seat).
- **Board handoff:** `draw(t)` (:186-209) calls `C.board.show(t)` whenever `C.board.wants(t)` (`t.phase === "playing"`, board.js:1175); `C.tableApi = {api, tableUrl, refresh}` (:79) is what the board uses for End/Concede/record (board.js:1204-1419).

### A.2 Lobby ownership (`crankmagic-table.js`), settled

| Concern | Function | file:line |
| --- | --- | --- |
| Seat card | `seatBox(s, t)` → `C.seatArt.quadrant(corner, cls, [], state, inner)` | :106-136, :199-204 |
| Seat state | `seatState(s, t)`: empty / invited / error (away) / ready / deck / pending | :101-105 |
| Center panel (rules, launch row, countdown number, Start/Cancel) | `centerPanel(t)`; `rulesOf(t)` | :137-152, :155 |
| Rules dialog | `table-rules`, `table-rules-save` → `POST /rules {startingLife, bracketLimit}` | :158-181 |
| Deck picker | `table-deck` modal: the test deck on playtest tables, then `libraryDecks()` (unarchived, with a commander); empty library → "Restore from a backup file" | :332-348, :98, :326-331 |
| Known counts | `knownCounts(decks)` → `POST /known {names}` (≤ 2,000 names, table.mjs:226-229) → "87 of 100 known · 13 to learn" per deck, `.is-unknown` | :349-364 |
| Deck sent | `table-use-deck` → **one request** `POST /deck {seatId, deck: deckForTable(deck)}` where `deckForTable` (:84-97) sends `{name, commander:[names], cards:[99 names], bracket?, source:{deckId, deckVersion}}`; a 422 lists `error.unsupported` (:387-389) | :377-391 |
| Mat picker | `table-mat` modal with `matDialog()` (strip of 30 `MATS` :44-49 + a preview of the board's zones), `table-mat-pick`, `table-mat-use` → `POST /mat {mat}`; remembered in `cm-mat` (:50) and auto-applied once per table (`applyRememberedMat`, :212-217) | :393-426 |
| Ready | `table-ready` → `POST /ready {ready}` | :429 |
| Start / Cancel | `table-start` → `POST /start`; `table-cancel` → `POST /cancel` (host only; table.mjs:287-298 `needHost`) | :430-431 |
| Invite / withdraw | `table-invite`, `table-copy-link`, `table-uninvite` | :305-323 |
| Kept seat | `crankmagic-play-seat` localStorage; "Your seat is waiting" above New table (`waitingSeat`) | :57-59, :280-292 |
| Help | `C.HELP.table` | :25-37 |

**What a seat card shows today, in order** (:108-134): `<header><h3>Seat n · You | AI | <name></h3>` + status pill (Open / Invite sent / Pending / Pending deck / Ready / Blocked, seat-art.js:19-24)`</header>`, then `seatFigure(pseudo, detail, controls)` (seat-art.js:153-163): the commander card (5:7, `height:76%`, crankmagic.css:120; dashed "?" when empty; two-letter blank when no art) beside a detail column: commander name (`.cm-seat-name`), the line (`.cm-seat-line`: deck name + "· n cards" for your own seat, "Choose a deck.", "Choosing a deck", "Invitation sent · waiting on them", "No deck yet", "Invite someone", or "Dropped · back by h:mm"), then controls (`.cm-seat-controls`): **you** → `Choose a deck`/`Change deck` (primary until chosen), `Choose mat`, `Ready`/`Not ready` (only once a deck is chosen); **host on an AI seat** → `Choose its deck`/`Change deck`; **host on an empty human seat** → `Invite`/`New link` + `Withdraw`. Controls are drawn only in `selecting`/`countdown` (:118). No avatar, no settings fan-out, no prerequisites list; the status pill is the only "why not ready".

**Where a progress UI would hook.** The deck goes up in one `POST /deck` (≤ 64 KB body, tables.mjs:38; a hundred names is ~3 KB), so there is nothing to progress on the wire. The only staged per-card step is `knownCounts` (:352-364), which is already batched by name list. A "Loading cards 0-100%, n/100" screen is therefore a client-side step over `knownCounts`'s result (per-name known/unknown) before `POST /deck`, or a new batched room call; it is not a transport fact. (Rob's "persist what was loaded into the card index with the game engine" has no server counterpart: the engine's definitions are a build artifact, `cloud/game-room.mjs:24-29`.)

**Seat art (`crankmagic-seat-art.js`), signatures:** `statusPill(state, ready, check)` (:20-23); `identityFan(colors, corner)` SVG wedges in WUBRG (:31-62); `quadrant(corner, cls, colors, state, inner)` = `<article class="cm-seat-q cm-q-<corner>" data-state>` + `<canvas class="cm-seat-sea" data-sea=state>` + fan + shade + `.cm-seat-body` (:67-74); `startSeas()` (re)paints every `.cm-seat-sea` with `CrankSea.startSea(canvas, {element: elementFor(state), opacity:.8})` and sizes the table (:111-121); `commanderArtUrl(seat)` (:123-134); `seatFigure(seat, detail, controls)` (:153-163); `lobby-art-zoom` pop (:165-190). **No avatar slot exists**; the header `<h3>` is the only identity element. Note the cloud lobby passes `[]` for colors (`table.js:203`), so the fan is never drawn on the cloud lobby (the table view carries no color identity, `table.mjs:435-440`).

### A.3 The table (`game/room/table.mjs`), settled

- **Countdown:** "ten seconds" (:21, :286) but the number lives in `transitionTable` (`game/contracts/table-lifecycle.mjs`, not staged); `countdownAt` is server time (:291,:431) and the alarm launches at `tick()` (:301-328). `tests/table-lobby.mjs:376-379` only asserts `1 ≤ seconds ≤ 10`. Start is host-only (`needHost`, :288); any un-ready stops it (comment :286; the transition is in the contract).
- **`MATS`** (:35-39): `DRAWN_MATS` five (felt, forge, cavern, sea, night: CSS gradients, crankmagic.css:3675-3677) + `ART_MATS` 25 (Rob's art, `crankmagic-mats.css`). `mat()` (:271-278) validates against `MATS`, any phase, stored in `record.mats[seat]`, visible to everyone in `view()` (:437).
- **`readDeck`** (:91-108): ≤ 2 commanders, 1-250 cards, every name through `cards(name)` else **422** `"The table cannot play these N cards yet: …"` with `unsupported:[names]` (:96-97); commander legality (CR 903.3) and partners (:98-104) are 422s too; the bracket limit is a 409 in `deck()` (:238-239). `unknown(names)` (:226-229) is the no-side-effect preview.
- **A table-level scene/background field could live beside the rules.** `rules()` (:249-269) writes `lifecycle.settings {startingLife, bracketLimit}` and refuses once a seat is ready; `mat()` writes `record.mats` any time. A `scene` fits either: as a `settings.scene` through `/rules` (host-only, locked once ready) or as `record.scene` through a new `/table/scene` (host-only, any phase, like `mat`). Three places gate a new route: `cloud/tables.mjs:23` `ACTIONS` whitelist, `cloud/game-room.mjs:187-203` route table, and `table.mjs` `api`. `view()` (:423-441) is where it is read back.
- **What `/table/*` validates:** `create` id regex + 1-3 others (:170-173); `invite` human seat, not seat 0, not occupied (:188-189); `join` hash + TTL + one seat per person (:208-215); `deck` right seat (host for AI) + readDeck + bracket (:234-239); `rules` host, phase selecting, nobody ready, life 1-999, limit 1-5, no deck over it (:250-264); `mat` seat + `MATS` (:273-274); `ready`/`start`/`cancel` through `transitionTable` (a bad transition is a 409, :137-140); `end`/`concede` need a seat and a room (:333-349); `record` finished only, playtest = whole game (:408-420).

### A.4 The view contract (`game/room/room.mjs`), settled where the file reaches

`view(seatId)` (:489-506): `{schema:"CrankRoomView@1", protocol:1, matchId, seatId, seat, revision, status:"playing"|"finished", result:{winner, reason, endedBy?}|null, departures, seats:[{seatId, name, pilot}], waitingOn: seatId|null, decision: controller.pending|null (only for the seat asked), state: projectFor(state, seat), history: last 120 of {turn, text, mark?}, continuing?:true}`.

- **Priority:** `state.priorityPlayer` exists in the room's state (:366-367) but **the projection is not staged**, and no consumer reads a `priorityPlayerId` from the cloud view (the board uses `waitingOn` :393,:483; the local `action-policy.mjs:19` reads Forge's). Treat `waitingOn` as the only confirmed priority signal.
- **Decision options** (`priorityChoice`, :231-236): `{index, label, act, cardId?, detail?}`; `detail` is text (`offerDetails`, :139-228: "→ Maya", "→ Llanowar Elves (Maya's) 1/1, tapped", "sacrificing Bear", "{G}"). **Target ids are not in the option**; targets are words.
- **Stack entries:** the board reads `{stackId, name, playerId}` (board.js:400,:671; audio.js:192-199). No `targets`, no source `cardId` on the entry is read anywhere; whether the projection adds more is not staged.
- **Combat:** `state.combat.attacks[{attacker, blockers[]}]` is what `momentsFor` reads (audio.js:231-234). A `defender`/target field: **not found in any staged consumer**; the local Forge view had `row.defender` (play-guidance.mjs:89). Unconfirmed for the cloud.
- **Card fields confirmed by consumers:** `cardId`, `name` (absent on hidden), `types[]`, `power`/`toughness` (numbers: definitions carry `power: 2` in `tests/table-board.mjs:85`; the aria label prints `2/2`, :941), `tapped`, `damage`, `counters{}`, `token`, `commander`, `commanderKey` ("<seat>:<id>", table-board.mjs:433-434), `owner`, `keywords[]` (board.js:771, table-board.mjs:250). **Oracle text: not read by any cloud consumer; not confirmed in the projection.** `typeLine` is not on the view card either: the board gets it from `recordOf(name)` (board.js:155,316).
- **No events array exists** in the view. What changed is a diff of two views (`CrankAudio.momentsFor`) or the history.
- **History wording** (`game/room/history.mjs:23-76`): turn `Turn 3 · Maya` (mark `turn`); land `Maya played Forest`; cast `Maya cast Lightning Bolt` (spells only; abilities give no line); copy `… copied …`; **resolve** `Lightning Bolt resolved`; **counter: no line** (a card leaving the stack returns `[]`, :47; nothing handles a countered/removed-from-stack event); discard `Maya discarded X`; mill `X was milled`; graveyard `X went to the graveyard`; exile `X was exiled`; to command zone / hand / library / battlefield lines (:48-54); life `Maya: 40 → 37 life` (:57-58); loss `Maya lost the game (reason)`; damage to a player `Bolt dealt 3 to Rob` (:60); to a permanent `Bolt dealt 3 to Bear` (:62); attackers `Maya attacked with A, B` (:63-66); blockers `Rob: Bear blocked Wolf` (:67-70); transform, face-up, level, outcome `Maya won` (mark `end`); **poison: no line**; draws merged `Rob drew 2 cards` (:88-100); quiet steps `Upkeep, Draw step: nothing to do` (mark `quiet`, room.mjs:296-301); pilot refusals (room.mjs:328). Kept to 300, 120 sent.

### A.5 The board renderer (`crankmagic-board.js`) and its CSS (`crankmagic.css`), settled

Unchanged from v1 for the JS: whole-board `innerHTML` per view (`render`, :959-978), `fit()` (:989-1049), `sea()` re-parents one canvas (:1076-1089), three views + phone, `focus` seat swap (:1261-1267), `peek`/`drawPick`/`zoom` (:834,:620,:824), `strip`/`toolsMenu`/`soundMenu` (:409,:443,:465), `stack()` text list (:670), `panel()` (:676), `went()` (:741), Coach stub (:875).

**CSS the Full screen view relies on** (crankmagic.css): `.cm-board{position:fixed;inset:0;z-index:50;display:grid;grid-template-rows:48px 1fr}` (:3191); `.cm-board[data-view="full"]{grid-template-rows:1fr;grid-template-columns:44px 1fr 210px;gap:8px;padding:8px}` (:3472); `.cm-full-rail` (:3473-3478); `.cm-full-center{display:grid;grid-template-rows:minmax(0,2fr) minmax(0,3fr)}` = **40/60 top/bottom** (:3480); `.cm-full-others` (:3481-3483); **`.cm-full-mine{position:relative;display:grid}`** (:3484) with `>.cm-mat{height:100%;padding-top:52px;--mat-reserve:…}` (:3485-3486), `.cm-full-pill` absolute top center z6 (:3487), `.cm-full-corner` absolute top-left z6 (:3490), `.cm-full-mine>.cm-board-hand{position:absolute;left:120px;right:120px;bottom:0;z-index:5}` (:3492); `.cm-full-side` (:3493-3504); the Coach docked (:3596). The mat itself: `.cm-mat` grid with gradient felt (:3244), `.cm-mat-grid` three columns (:3266,:3305), `.cm-mat-zone` framed (:3267), `.cm-mat.is-bare` drops frames/labels (:3306-3311), `[data-mat=…]` backgrounds (:3675-3677, mats.css). Cards: `.cm-bcard` 5:7 by `--bc` (:3318), tapped `rotate(90deg) scale(.86)` (:3327), hand `--hc` (:3424), peek/zoom sizes (:3581-3586). **No `perspective`, `rotateX/Y`, `transform-style` or `translate3d` anywhere in the board's rules**; the one `perspective:900px` in the file is the deck hero card (:290). Reduce motion: `@media (prefers-reduced-motion)` kills `.cm-bcard,.cm-hand-slot,.cm-board-fan` transitions (:3634).

**Which rules the stage replaces (Full screen, 3D on):** `.cm-full-center`'s 2fr/3fr split (the chairs become part of the stage, Rob's 75/25); `.cm-full-others`/`.cm-full-other` (chairs drawn by the stage); `.cm-full-mine>.cm-mat` + `.cm-mat-grid`/`.cm-mat-zone`/`.is-bare` for the big board (zones by placement on the stage; the DOM card layer keeps `.cm-bcard`); `[data-mat]` backgrounds become the stage's texture. **Kept as is:** `.cm-board[data-view="full"]` grid, `.cm-full-rail`, `.cm-full-pill`, `.cm-full-corner`, `.cm-full-mine>.cm-board-hand`, `.cm-full-side`, `.cm-bcard`, peek/zoom, the Coach dock.

### A.6 Panels, ticker, watch, feed, audio, hover, auth, release

As v1 (A.4-A.10), with these corrections:
- **Watch / groups, settled** (`collection-model.js`): the command that adds planned entries is **`{type:'groupEntries', groupId, entries:[{cardId, quantity}], cards?:[card records to add first], replace?:bool, batchId?, commanderCardId?}`** (:738-742; `rows()` :519 normalizes each entry; every `cardId` must exist in `state.cards` or be in `c.cards`, :422,:738). `createGroup` is `{type:'createGroup', groupId?, name, template?:'general'|'limited'|'bench'|'trade'}` (:711-712; `commander` refused, one Bench). Other group commands: `groupTemplate`, `deleteGroup`, `moveGroupEntries {from,to,entryIds,copy?}`, `removeGroupEntries {groupId, entryIds, quantity?}`, `groupLots` (:713-723,:791). **No "watch" group exists**: the starter groups are Bench, To Trade, To Buy (`group:to-buy` is the want list, :53,:119-120). "Watched" is a label: a lot with `source:'watching'`, or an entry outside the want list reads "Planned" and a lot shortlisted on the Bench reads "Watched" (:31). So "Add Card to a Watch group" = a general group (created once) + `groupEntries`; the Library will show those rows as **Planned**, not Watched, unless the status reader (:31) is taught the group.
- **Local feed:** `game/tools/match-telemetry.mjs` `summarizeEvents(events, visibleCards, viewerSeatId)` builds `recent` rows `{id, turn, phase, kind, cardId, name, playerId, label}` from Forge `GameEvent*` journal events (:6-40); it is the local host's only; the cloud room writes history lines instead.
- **Service worker:** `crankmagic-sw.js` precaches `SHELL`/`DATA`/`RUNTIME` lists (:26-29); none of the Play files are in them (Play is network-only), so a new Play file needs no SW entry; `transform()` strips left-out names from it anyway (release-pages.mjs:313-319).
- **Third-party notices:** `THIRD-PARTY-NOTICES.md:103-107` states **"Runtime dependencies: None. The application ships no framework and no vendored libraries."** A vendored Pixi changes that statement; it is a hand-maintained file ("add it here in the same commit", :8-9), not a test.

### A.7 Tests that drive the UI, settled

- **`tests/table-lobby.mjs`** (Playwright + Chromium; `GEOMETRY_REQUIRED=1` in CI makes a missing browser fail, :22): two pages (Rob 1400, Maya 390) against the **built staging release page** (`build`/`worktreeSource` from release-pages.mjs, :32,:128) with `/api/tables/*` routed in-process to a real `GameTable` (`cloud/game-room.mjs`) over a Map storage (:120). Selectors it depends on: `#cm-table-new`, `[data-action=table-create]`, `.cm-cloud-table .cm-lobby-seat h3` (exact texts "Seat 1 · You", "Seat 2 · Maya", "Seat 3 · AI", :185), `.cm-cloud-table .cm-seat-q` count, `.cm-cloud-table .cm-seat-sea` (animated, `dataset.t` advancing, :192-200), `.cm-table-center` (+ "Table rules", "5 minutes" text, contrast ≥ WCAG on `h2, dt, dd`, :73-82), `.cm-table-rules-edit`, `#cm-table-rules-form`, `[data-action=table-rules-save]`, `.cm-table-rules` text, `.cm-lobby-seat[data-seat='0'] [data-action=table-deck]`, `.cm-table-deck`, `.cm-table-deck-known`, `.cm-table-deck-empty`, `#cm-table-deck-error` (regex on the refusal wording, :224), `[data-action=table-mat]`, `.cm-mat-pick`, `.cm-mat-swatch`, `.cm-mat-zone`, `[data-action=table-mat-use]` beside `.cm-dialog-close`, `[data-action=table-ready]`, `[data-action=table-start]`, `#cm-table-seconds` (1-10), `#cm-table-launch` "Starting in", `[data-action=table-cancel]` absent for a guest (:381), `[data-action=table-invite]`, `.cm-qr-code`, `[data-action=table-back]`, `[data-action=restore]`, `[data-action=account-sign-in]`. Also the words over a sea at contrast (`overSea`, :50-70).
- **`tests/table-board.mjs`** (Playwright, Rob 1400 + Maya 1280, same in-process `GameTable`, the page's WebSocket carried to the object's real `/connect`, every frame kept in `frames[email]`, :117-163): the card resolver fixture is `cards(name)` (:85: basics, `Rob Secret n` instants `{types:["Instant"], manaCost:"{2}"}`, else `{types:["Creature"], supertypes?, power:2, toughness:2, manaCost:"{1}"}`); decks are 40 cards of `<who> Secret i` + a land (:97). Views are read from `frames` (`views(email)`, :163) and from `object.room.view` (:432); a test may wrap `object.room.view` to inject fields and `object.broadcast()` (:435-436). Selectors it depends on (counts): `.cm-bcard` 55, `.cm-board-hand` 34, `.cm-board-mat` 33, `.cm-seatboard` 30, `.cm-board-table` 27, `#cm-board`, `.cm-board-strip`, `[data-action=board-view][data-view=…]`, `.cm-board-tile`, `#cm-board-tools`, `#cm-board-coach`, `[data-action=board-pass]`, `[data-action=board-focus]`, `.cm-full-rail`, `.cm-board-lands`, `#cm-dialog`, `.cm-coach-input/-msg/-more`, `.cm-board-panel`, `#cm-board-history`, `.cm-board-band`, `#cm-game-on`, `.cm-board-waiting`, `#cm-board-decision`, `.cm-table-vitals`, `.cm-hand-show/-slot/-fan`, `.cm-full-side`, **`.cm-full-mine .cm-seatboard.is-you`**, **`.cm-full-others .cm-seatboard`** (:592,:621,:635), `.cm-full-mine .cm-board-hand .cm-bcard`, `.cm-full-mine [data-zone=library] .cm-bcard` (:628), `.cm-full-mine .cm-seatboard-body` (:617), `#cm-full-pick .cm-bcard`, `.cm-full-side [data-drag=side]`, `.cm-full-rail [data-action=board-rotate]`, `.cm-full-viewing` "Viewing Rob", `.cm-full-rail [aria-label='CrankMagic Coach'|'Tools']`, `.cm-board-center`, `.cm-vitals-bar` titles, `.cm-board-chip`, `.cm-phone-*`, `#cm-notice`, `#cm-board-peek`. It also asserts no frame ever names a hidden card (:216-217,:1304) and that a creature's aria label carries `n/n` (:941). **A stage that removes `.cm-seatboard` from `.cm-full-mine`/`.cm-full-others` turns at least six checks red** (:592,:617,:620-621,:626-628,:635); the 3D switch must default off under this suite or the suite gains a 3D branch.
- **`tests/wireframe-conformance.mjs`** pins lobby CSS: `.cm-seat-q .cm-lobby-seat>header{position:absolute;left:0;right:0…}` (:36-42), `.cm-q-t[lr]` header `row-reverse` (:46), `.cm-seat-card{aspect-ratio:var(--card-ratio);height:…}` (:57-60), the fan's four angles (:107), `.cm-lobby-table{aspect-ratio}` and no `max-height` (:285-287), `.cm-table-center` width % and ratio (:299-321,:431), no duplicate lobby selectors (:255-262), 16:9 boards (:763), miniature `--mat-ratio` (:978). A new seat layout (avatar corner, press-order buttons) must keep the header bar absolute at the top and the card at 5:7 or change these checks in the same PR.
- **`tests/feature-wiring.mjs`, the rules concretely:** (1) UK spellings: the regex at :277 (about 60 British spellings) plus the hyphenated spelling of email, over every tracked `*.md *.mjs *.js *.css *.html` except `design_handoff_*`, nested `docs/uat/*/`, and itself; **ceiling 0** (:299-300); five named files must have none (:303-306). (2) Every `toLocale*String` / `Intl.*Format(` in shipped scripts names `'en-US'` first (:319-325). (3) No `${e(x.at|savedAt|createdAt|updatedAt|importedAt|playedAt|rankDate)}` printed raw (:327-328). (4) No `EUR|GBP|eur|tix|€|£|¥` in shipped js/html/css (:331-333). (5) **No size from steps**: regex `['S','M','L']` arrays, `data-size=`, or a `role="group"` whose `aria-label` contains "size" (:336-340) in shipped files and `game/ui/*`. Plus structural checks (dialogs, nav, themes, tiles) at :45-266 that Play work will not touch.
- **`tests/data-integrity.mjs:631-656`**: README must name every file in `tests/` in backticks and state the suite count; a new suite needs a README line and the count moved. **`tests/asset-versions.mjs`**: every script/style/data URL carries `?v=`; a changed file must move its version everywhere; `--update` re-records (fixture not staged). **`tools/run-suites.mjs`**: suites are `tests/*.mjs` + `game/tests/*.test.mjs`; any file naming `browser-runner`/`playwright` runs alone after the rest (:27-30,:71); 20-minute cap. **`tools/local-ci.sh <ref> 0`**: the scan + merge with main before a push (:1-40).

### A.8 Audio, hover, auth, invites, assets, release, keys

Unchanged from v1 (A.7-A.10): `crankmagic-audio.js` (`bedFor` :240, `startBgm` :140, `momentsFor` :179, `listen` board.js:207, arm on `pointerdown` :1327); `peek`/`drawPick`/`zoom`; `cloud/access.mjs verifyAccess` :50-88, `/api/auth/login?to=` account.js:122; `PLAY_CLOUD` release-pages.mjs:74, `verify` :324-361, `script-src` exact-match :339-342, `referencesOf` :213-245, `NEVER` :68; keys `cm-board-*`, `cm-card-scale*`, `cm-mat`, `crankmagic-play-seat`, `crankmagic-audio-*`.

---

## B. Prototype inventory (revised)

Rows that changed with the new files; others as v1.

| Item | Status | One line |
| --- | --- | --- |
| Play home (New table · Rematch · Open games · Table talk · Standing · Recent) [B §10.1, N] | Missing | `views.table` with no id is the New table form (table.js:268-278) with "Your seat is waiting" above it (:280-292); no Rematch, no recent list; no table-list route in `cloud/tables.mjs` |
| Four quadrants, color fan, sigil [B §10.2] | Partial | quadrants `ORDER` br/bl/tr/tl (table.js:61,:199-204); **the fan is never drawn on the cloud lobby** (colors `[]` passed, :203; the table view carries no identity); no sigil |
| Seat label, status pill, commander card, detail column [B] | Same (shape) / Partial (content) | A.2; record-with-this-deck and bracket chips absent |
| Your actions on your quadrant [B, N] | Partial | Choose/Change deck · Choose mat · Ready exist in that order (:120-122); no Settings fan-out, no Leave seat, no prerequisites footnotes |
| Avatar in the outer corner [N] | Missing | no slot in `seatFigure` or the header (seat-art.js:153-163; css:85) |
| Deck load progress 0-100 %, Cancel freezes, OK [N] | Missing | one `POST /deck` (:380); `knownCounts` is the only per-card step (A.2) |
| Invite (email, link, QR) [B] | Same | `table-invite` modal: link, Copy, Email it, QR (:305-317) |
| AI configurator [B] | Missing | AI = `kind:"ai"`, house pilot (table.mjs:313) |
| Center panel rules + Edit while nobody ready + "n to go" [B] | Partial | Starting life, Bracket limit, Seats, Invitations last, dropped-player minutes, Edit (host, selecting), "Waiting on n seats." (:137-152) |
| No Launch button; auto 10 s; host cancels [B] vs host Start [P,W,repo] | Conflict | the repo has host **Start** then a countdown (:144,:430; table.mjs:287) that any un-ready stops; only host cancels (:141) |
| d20 [B] | Missing | |
| Choose mat strip + live preview [B] | Same | `matDialog` (:396-403) with a zone preview |
| Choose Background (host) [N] | Missing | no field; fits beside rules or mats (A.3) |
| Settings fan-out, card back/sleeve, profile [N] | Missing / Partial | app Settings has theme, default card size, reduce motion, budget cap, data (settings.js:21-36); nothing Play-specific |
| Table talk, deals, presence [B §8] | Missing | away clock only |
| Spectator [B] | Missing | |
| Strip, steps ribbon, one button, Skip [B §6.3, §7.1] | Partial | as v1 |
| Refusals under the one button [B §7.4] | Conflict | toasts (board.js:182); the lobby's deck refusal is inline (`#cm-table-deck-error`, :371-389), the better precedent |
| Timeline, change marks, away card, lean-in, threat lens, presets, dice, callouts, story, motion, keys [B] | Missing / Partial | as v1 |
| Stack as cards [B §6.4, N] | Conflict | text list (board.js:670); stack entries carry name + player only (A.4) |
| Tabletop 80-85 %, viewed seat ¾, others across the back [N] | Conflict | `.cm-full-center` is 40/60 top/bottom (css:3480) |
| Server is the authority [B §14] | Same | |
| Reconnect bar, 5-min away [B §15] | Same | `AWAY_LIMIT` table.mjs:41 |
| Host Forge gate [P,W] | Conflict | retired path |

---

## C. Rendering decision, re-checked against `crankmagic.css` and `fullView()`

**Mount point confirmed: `.cm-full-mine`** (fullView, board.js:611; css:3484 `position:relative;display:grid`). Its children today: `.cm-full-pill` (absolute), `.cm-mat[data-fit=full]` (grid child, `height:100%`), `.cm-full-corner` (absolute), `.cm-board-hand` (absolute bottom, z5). A canvas inserted first with `position:absolute;inset:0;z-index:0` (or `-1` with `isolation:isolate` on `.cm-full-mine`, the exact pattern `.cm-board-table{isolation:isolate}` + `.cm-board-sea{position:absolute;inset:0;z-index:-2}` uses, css:3338,:3347) sits under the pill, corner and hand without touching their rules. **Re-parenting works**: `render()` rebuilds `#cm-board`'s innerHTML, so the canvas element must be held in a module variable and re-appended into the fresh `.cm-full-mine` after each render, as `sea()` does with `seaCanvas` (board.js:1076-1089: created once per size, `tbl.prepend(seaCanvas)` on every `fit()`); `fit()` already runs after every `render()` and has the `.cm-full-mine` box (:1026-1038), so the stage's `layout(box)` hooks there. A WebGL context survives detachment and re-attachment of its canvas (the canvas is the same DOM node); `ResizeObserver` (`watch`, :1147) already fires `fit()` on resize.

**What the stage replaces in Full/3D:** the `.cm-full-center` 2fr/3fr split and `.cm-full-others` (chairs go on the stage), the big `.cm-mat`'s grid/zones (cards positioned over the stage). What it must not replace: `.cm-bcard` buttons and their listeners (document-level, :1307-1342), `.cm-full-pill`, `.cm-full-corner`, `.cm-board-hand`, `.cm-full-side`, the Coach dock.

**Blockers found: none hard; two gates.** (1) `tests/table-board.mjs` asserts `.cm-seatboard` inside `.cm-full-mine`/`.cm-full-others` in Full screen (:592,:617-635) and reads `[data-zone=library]` backgrounds there: the 3D stage ships behind a switch that is **off by default**, or the suite grows a 3D branch in the same PR. (2) `THIRD-PARTY-NOTICES.md:103-107` says no vendored libraries ship; vendoring Pixi is Rob's call to make explicit (F.2). The CSP/`verify()` constraint stands (v1 C): `vendor/pixi.min.js` referenced by path from `crankmagic-stage.js`, never a CDN.

Recommendation unchanged: **(ii) PixiJS 8 for the ground, chairs, light, arrows and motion ghosts; cards stay DOM.** The comparison table in v1 C stands; the DOM+CSS option is now also measured against the fact that `.cm-mat-grid` is a three-column CSS grid whose zones are absolutely framed: tilting it in CSS tilts its text and the pile captions, which `tests/table-board.mjs` reads by `innerText`.

---

## D. Hooks the five prompts need (revised)

| Need | Exists as | Note |
| --- | --- | --- |
| Seat swap | `focus` + `board-focus`/`board-rotate` (board.js:130,:1261-1267); corner "Viewing <name>" (:606-608); test pins `.cm-full-viewing` text (table-board.mjs:621) | reuse; animate in the stage |
| Hover render | `peek()` :834; `hover`→`drawPick()` :620; `zoom()` :824; test pins `#cm-board-peek`, `#cm-full-pick .cm-bcard` | DOM only |
| Status ticker | none; `C.notice` app.js:127 (`#cm-notice`, pinned by the test 6×), `cm-board-waiting` :418, `seatFlag` :478, `went()` :741; the lobby's inline `#cm-table-deck-error` :371 | new module; keep `#cm-notice` for app-level notices |
| Card groups / watch | `{type:'groupEntries', groupId, entries:[{cardId, quantity}]}` (model.js:738); `{type:'createGroup', name, template:'general'}` (:711); `C.commit(cmd, {renderView:false})` (board.js:271); identity `C.catalog.exact(name)` (:318) and `cards:[record]` to add an unknown identity | a "Watch" group does not exist; entries read as **Planned** (model.js:31) |
| Stack events | `state.stack[{stackId, name, playerId}]`; history `"X cast Y"` / `"Y resolved"` (history.mjs:35,:39) | **countered: no line and no event** (history.mjs:47 returns `[]` for from-Stack); a stack entry that vanishes without a "resolved" line is the only signal |
| Combat events | `state.phase` `COMBAT_*` (`STEPS` board.js:102); `state.combat.attacks[{attacker, blockers[]}]` (audio.js:231); history `"Maya attacked with A, B"` / `"Rob: Bear blocked Wolf"` / `"Bolt dealt 3 to Rob"` (history.mjs:63-70,:60) | defender/target per attack: not confirmed |
| Instant on stack | new `stackId` + `recordOf(name).typeLine` includes Instant, or `c.keywords` has flash (board.js:771) | |
| Priority holder | `waitingOn` (room.mjs:501); `decision.kind==="priority"` for you; `turnPlayerId` | `priorityPlayer` is in room state (:366) but its projection is not staged |
| Per-seat state | `state.players[i]{playerId, name, health{life, poison, commanderDamage, status, lossReason}, zones{…:{cards,count}}, mana[{amount,color}], landsPlayed}`; cards as A.4 | hidden cards `{}`; other hands a count |
| Oracle text | not in the view; `recordOf(name).oracleText` only when cached; `C.catalog.details(c)` fetches | parse `keywords` + type line; `oracleText` opportunistic |
| Persistence keys | board `cm-board-*`; lobby `cm-mat`, `crankmagic-play-seat`; audio `crankmagic-audio-*` | new `cm-board-tilt`, `cm-board-scene`, `cm-board-3d`, `cm-board-modules` |
| Settings | `views.settings` (settings.js:21-36): Account, Appearance (theme cards, default card size slider, Reduce motion, Confirmations…), Prices, Data, About; `set-motion` writes `preferences.reduceMotion` (:41); board Tools ▾ :443 | add a **Play** card between Appearance and Prices; mirror in Tools |
| Table-level scene | none; `settings` via `/rules` or a `record.scene` via a new `/scene` (A.3) | three files gate a route (tables.mjs:23, game-room.mjs:187-203, table.mjs) |
| Lobby seat card | `seatBox` + `seatFigure`; header pinned by wireframe-conformance (:36-46) | |
| Deck load | `knownCounts` → `POST /deck` (A.2) | progress is client-side over `/known` |
| Countdown | `table-start`/`table-cancel`; `countdownAt`; number in `table-lifecycle.mjs` (not staged) | the suite accepts 1-10 s |
| Audio | as v1 | |
| Release | `PLAY_CLOUD` :74; `verify` :361; `?v=` + `asset-versions --update`; README suite list (data-integrity :631-656); notices file | |

---

## E. Conflicts (revised; v1's 22 stand, these are corrected or added)

1. **Countdown.** The repo's cloud lobby is **host Start → countdown (≤ 10 s) → any un-ready stops it, host Cancel** (table.js:141-144,:430-431; table.mjs:286-298; test :376-389). The brief wants no Start at all. Pack/wireframe wanted Start + 5 s. Recommendation: build the brief's rule as a lifecycle change (`table-lifecycle.mjs`, not staged: the `countdown` transition fires when the last human readies) and keep `/cancel`; the suite's `[data-action=table-start]` clicks go.
2. **The fan is not drawn on the cloud lobby** (`quadrant(corner, cls, [], …)`, table.js:203) because the table view carries no color identity (table.mjs:435-440). The brief's color-identity fan needs either the lobby to look the commander up in `C.catalog.exact(name).colorIdentity` (the board does this, board.js:320) or the table view to carry it. Recommendation: client-side lookup in `seatBox`, no server change.
3. **Deck loading progress has no transport to measure.** Recommendation: the progress dialog counts `knownCounts`'s names (known/unknown per name, already fetched) and then one `POST /deck`; "Cancel" at n/100 cannot leave a partial deck on the server (`readDeck` refuses a deck under 100 only by the 250 cap, :95, so a partial would be accepted and would then be a 99-card deck). Keep the partial client-side only.
4. **"Watch group" entries read as Planned in the Library** (model.js:31). Recommendation: name the group "Watched at the table" and accept "Planned" rows, or extend `statusOf` to read a flag on the group; do not touch lot `source`.
5. **COUNTERED is not in the history and not in the view.** Recommendation: a request to the room: `historyLines` gains a line for the stack-removal event (history.mjs:47 drops it) and poison; until then the board says "left the stack".
6. **Stack entries carry no targets**; the brief's target lines and the plan's targeting arrows need ids. Recommendation: ask the projection for `stack[].targets:[{kind, id}]`; arrows wait on it (the decision's `detail` text names targets for your own options only, room.mjs:139-228).
7. **Full screen is 40/60 top/bottom** (css:3480); Rob wants the viewed board ~75 % with the others across the back. Recommendation: the stage's own layout; the DOM `.cm-full-center` stays for 3D-off.
8. **`tests/table-board.mjs` pins the DOM mats in Full screen** (A.7). Recommendation: 3D off by default until the suite has a 3D branch; every PR in CC-3 runs this suite.
9. **Third-party notices say no vendored libraries ship.** Recommendation: F.2.
10. **Wireframe-conformance pins the seat header bar and the 5:7 card.** Recommendation: the avatar goes inside the pinned header (`<h3>` becomes avatar + name) rather than a new absolute element; the card stays.
11. **A new `/table/scene` route touches three files** (tables.mjs `ACTIONS`, game-room.mjs routes, table.mjs api) plus `view()`; the brief's "table rules" edit is locked once a seat is ready. Recommendation: scene as `record.scene` through `/scene`, host-only, any phase (like `mat`), read back in `view()`.
12. **Refusals**: the lobby already refuses inline (`#cm-table-deck-error`); the board toasts. Recommendation: the ticker PR routes the board's refusals inline under the one button, as the lobby does.

---

## F. Open questions (revised; v1's 15 reduced to what is still open)

1. ~~Where is the cloud lobby~~ settled: `crankmagic-table.js`.
2. **Vendoring Pixi vs the notices file's "no vendored libraries".** Default: vendor it, update `THIRD-PARTY-NOTICES.md` §Runtime dependencies in the same commit (MIT), and say so in the PR for Rob to veto.
3. **The projection's card fields** (`game/engine/projection.mjs`, still not staged): are `keywords` sent for battlefield cards (confirmed for hand cards only, board.js:771), is `power` a number after layers, is there a `priorityPlayer`, `stack[].targets`, `combat.attacks[].defender`? Default: stage `projection.mjs` before CC-3e/4c; until then read only what A.4 confirms.
4. **Countered vs resolved.** Settled as a gap (E.5). Default: "left the stack" + a room request.
5. **Priority holder.** Default: `waitingOn`.
6. **Watch semantics.** Settled command (`groupEntries`); open: group name and whether rows should read Watched. Default: "Watched at the table", rows read Planned.
7. **Tilt range/default.** Default: 0-35°, 18°, `cm-board-tilt`.
8. **Beds and files.** Default as v1 (pool `game`; re-encode ≤ 2.5 MB; index rows with `pool`).
9. **Instant layer trigger.** Default as v1.
10. **Combat bed scope.** Default: any `COMBAT_*`.
11. **Ticker placement.** Default: the stage's foot above the hand, 28 px.
12. **3D as a switch inside Full screen, default off** until `table-board.mjs` has a 3D branch (new, from A.7).
13. **Scene per table.** Default: `record.scene` via `/table/scene` (E.11); fallback per device `cm-board-scene`.
14. **Avatars.** Default: `preferences.avatar` (data URL ≤ 64 KB) through `{type:'preferences', values:{avatar}}` (the command exists, settings.js:41); shown in the seat header; the table view does not carry other seats' avatars, so **other players' avatars need a table field** (`/table/avatar`, like `mat`) or stay initials. Default: initials for others until a route exists.
15. **Headless WebGL in CI.** Default as v1; the stage smoke test is skipped with a printed reason where WebGL is missing, and `GEOMETRY_REQUIRED` does not cover it.
16. **The countdown number** lives in `table-lifecycle.mjs` (not staged). Default: read it there before changing the start rule.

---

## G. Phased PR list (revised)

Conventions as v1 (branch `claude/<topic>`, draft PR, red first, `docs/ACTIVE.md`, suites touched + `feature-wiring` + `asset-versions --update` + `data-integrity` when a suite is added + README's suite list and count, `tools/local-ci.sh <ref> 0` before the push; browser suites run alone). Each PR ≤ a day.

### CC-2 lobby flow (`crankmagic-table.js`, `crankmagic-seat-art.js`, `crankmagic.css`, `tests/table-lobby.mjs`, `tests/wireframe-conformance.mjs`)

| PR | Branch | Scope | Red-first test | Merged, the user sees |
| --- | --- | --- | --- | --- |
| 2a | `claude/lobby-seat-sequence` | `seatBox` controls in press order and words: Choose Deck → Change Deck + commander name under the player's name; Settings ▾ fan-out (Choose mat, Game settings for the host, Exit table, Profile); Ready Up with gray footnotes listing what is missing (deck · mat is optional · host's rules) that vanish as met; the color fan drawn from `C.catalog.exact(commander).colorIdentity` (E.2); `table-lobby.mjs:185` texts kept | a seat with no deck lists "Choose a deck" under a disabled Ready; with a deck the list is gone; the fan has as many wedges as the commander's identity | the seat reads as Rob's sequence |
| 2b | `claude/lobby-deck-loading` | the deck modal keeps Cancel · Save visible with the list scrolling inside; Save → "Loading cards" with a bar and `n / 100` driven by the `/known` answer per name, then `POST /deck`; Cancel at n keeps the count on the client and leaves the seat without a deck (E.3); 100 → green OK; the 422's names still inline in `#cm-table-deck-error` | progress ends at `100 / 100` and OK; cancel at 40 posts nothing; a 422 still lists the unsupported names | loading is visible |
| 2c | `claude/lobby-no-launch` | the last human's Ready starts the countdown (lifecycle transition), host-only Cancel stays, Start removed; "Launches when all are ready · n to go" in the center; `table-lobby.mjs` start clicks replaced | all ready → `#cm-table-seconds` appears without a Start; a guest's un-ready clears it | no Start button |
| 2d | `claude/play-home` | Play tab = Play home: New table (primary), Rematch the last table (from `C.state.games[].table`, filed by board.js:271-275), Recent games cards, "Your seat is waiting" kept, "Game on" card when `C.board.live()` | two filed table games → two cards newest first and a Rematch that pre-fills the seats | Play opens a home |
| 2e | `claude/lobby-avatar` | `preferences.avatar` upload in Settings › Play (≤ 64 KB data URL); drawn inside the seat header beside the name for your own seat; initials in the seat's color for others (F.14) | a saved avatar renders in `.cm-lobby-seat>header`; the header rule stays absolute (wireframe-conformance :36-42) | your face on your seat |
| 2f | `claude/table-scene` | `POST /table/scene {scene}` (host, one of five ids) across `cloud/tables.mjs:23`, `cloud/game-room.mjs` routes, `table.mjs` (`record.scene`, `view().scene`); the lobby's Game settings picks it; a Node suite over `GameTable` like `table-lobby`'s in-process object | a guest's POST is 403; an unknown id 400; the view carries the scene | the host picks the table's scene; CC-3c draws it |

### CC-3 board overhaul (`crankmagic-board.js`, new `crankmagic-stage.js`, `crankmagic.css`, `tests/table-board.mjs`)

| PR | Branch | Scope | Red-first test | Merged, the user sees |
| --- | --- | --- | --- | --- |
| 3a | `claude/board-events` | pure `crankmagic-board-events.js` (`CrankBoardEvents.between(was, next, {seat, typeLineOf})` → typed events: your-turn, draw, cast, stack-left, resolved (from a history "resolved" line), land, etb, token-batch, left (dies/destroy/exile/wipe), life, poison, attackers, blockers, damage, over); added to `PLAY_CLOUD`, `index.html` `?v=`, README suite list | `tests/crankmagic-board-events.mjs` (vm) over the 26 `crankmagic-audio` fixtures; first view → none | nothing yet |
| 3b | `claude/board-stage-vendor` | `vendor/pixi.min.js` + notices §Runtime dependencies; `crankmagic-stage.js` (`CrankStage.mount/layout/unmount`, lazy script load by path, canvas held and re-appended into `.cm-full-mine` after each `render()`, sized in `fit()`, `CrankMotion.reduced()` → one frame, disposed in `detach/close`); the 3D switch in the Full rail, **off by default**, hidden on phones | release `verify` refuses a cloud release without `crankmagic-stage.js`; vm: no DOM before `mount`, `unmount` removes the canvas; `table-board.mjs` unchanged and green | a 3D switch that draws the mat on a canvas |
| 3c | `claude/board-scenes` | five scenes + smoke vents as stage modules; read `table.scene` (2f) else `cm-board-scene`; picker in Tools and Settings › Play | radio set of five ids; reduced motion advances no frame | a living background |
| 3d | `claude/board-3d-tilt` | the three chairs as perspective miniatures (name, life, sigil, color) across the back; tilt slider 0-35° remembered; the viewed board ~75 %; click a chair = `focus`; 360 ms swing + fade; keys V+1-4; **a 3D branch added to `table-board.mjs`** so the DOM-mat checks apply with 3D off and chair checks with it on | slider ends legible at 1400 and 1024; walking sets `focus` and `.cm-full-viewing` reads "Viewing <name>" | the tilted table |
| 3e | `claude/board-card-motion` | DOM cards positioned over the stage (drag, soft snap, no rules); 3a events → draw lift (180 ms), cast flight with trail, graveyard slide, tap tilt, attacker lean; sigils wherever `seatColor` is used | events → motion queue with durations; reduced motion → 0 ms; `.cm-bcard` aria-label and `data-action` survive | cards move |
| 3f | `claude/board-reveal-shelf` | opponents' casts as card images on a shelf for 8 s; `stack()` as a card column newest on top in all three places; arrows deferred until `stack[].targets` exists (E.6) | shelf holds the last five opponent casts and drops one after 8 s (fake clock) | you see what the others play |

### CC-4 info-pane host + Counterintelligence

| PR | Branch | Scope | Red-first test | Merged, the user sees |
| --- | --- | --- | --- | --- |
| 4a | `claude/board-modules` | `MODULES` registry; `panel()` and `.cm-full-side` iterate it; pick, stack, went, decision, history become entries; ⋯ Hide per header; `cm-board-modules` | a registered module appears in both; hidden survives a redraw; `table-board.mjs` selectors kept (`.cm-full-side .cm-board-band`, `#cm-full-pick`, `[data-drag=side]`) | modules you can hide |
| 4b | `claude/board-ticker` | ticker module at the stage foot (3a events in words, sigil + color, 4 s, max 3, aria-live polite); the board's refusals inline under the one button; `C.notice` kept for the app | three queue, the fourth waits; a refusal is inline, `#cm-notice` untouched while attached | a bottom line |
| 4c | `claude/counterintel` | pure `crankmagic-counterintel.js`: per opponent untapped creatures (count, power, keywords), open mana, hand count, commander damage toward you, poison; click → contributing cards; Go to Player → `focus`; facts only | vm fixtures: counts and contributors exact | the threat readout |
| 4d | `claude/counterintel-watch` | Add Card → `createGroup` ("Watched at the table", general) once + `groupEntries {entries:[{cardId, quantity:1}]}` (identity via `C.catalog.exact`, `cards:[record]` when the library lacks it); ticker confirms; unknown name refused with the instruction | twice → one entry; unknown → no commit and the instruction (`tests/collection-model.mjs` if the model changes) | a card lands in the Library group |

### CC-5 audio (`crankmagic-audio.js`, `assets/audio/`, `tests/crankmagic-audio.mjs`)

As v1 (5a pool + a cloud pack check `tests/crankmagic-audio-pack.mjs` over `assets/audio`; 5b combat ramps `startBgm(slug, {fadeIn, fadeOut})`; 5c `layer` bus from 3a's opponent-instant event, ducking the bed). Unchanged.

---

## Confidence

- A.2/A.3/A.7 (lobby, table, tests): high; read in full.
- A.4 (view contract): high for `view()`, history and routes; the card fields and combat/priority/targets are inferred from consumers because `projection.mjs` is still not staged (said where it matters).
- C: high on mount point and re-parenting (CSS read); the hybrid remains a judgment until built.
- D/E/F/G: concrete; G's sizes assume `projection.mjs` and `table-lifecycle.mjs` are staged before 2c, 3e and 4c.
