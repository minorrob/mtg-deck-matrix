# The Play screen after the Replit concept: the plan, and pass 1

*The UI lane (Fable, a Claude session in a cloud container), 2026-10-12, on Rob's brief: "evaluate the attached and the
code base, devise a plan to improve the UI experience, leverage the game engine approach from Replit, but keep our mats
backgrounds and our theme color options."*

The concept is `CrankMagic-Play` (React, Replit, 2026-10-12) with its `HANDOFF.md`; the brief it was built to is
`docs/ui-lane/gameplay-anchor.md` and the Replit brief Rob wrote. This file says what of it is ported, how, in which
pass, and what the engine lane is asked for. The board stays plain JavaScript and CSS (`crankmagic-board.js`,
`crankmagic.css`): the concept is a reference to port, as `docs/ui-lane/README.md` says, never code to merge.

## 1. What the concept got right, and what it got wrong

**Kept, and ported in pass 1:**
- **The one adapter.** The board already has it: `connect`/`receive`/`send` in `crankmagic-board.js`, the view in, the
  §12.1 answer frame out. Nothing of the concept's `MockRoomAdapter` is needed; the real socket is the adapter.
- **The mat as the ground.** In Full screen the big board's mat is the whole background, not a mat on a dark page.
- **A 3D table** (perspective, `rotateX`, hinged at a horizon) as a switch in Full screen, not a mode of its own.
- **The other seats pushed out:** left, back, right, each a smaller board of its own; the big board keeps the most room.
- **The callout overlay:** the neon-cartoon grammar (condensed italic capitals, an ink stroke, a glow in the tone's
  color), read from the difference between two views, never from anything the view does not carry.
- **Motion:** a card flies from the hand to the mat (180 ms), from the library into the hand, from the mat to a pile; a
  tapped card turns where it lies; the turn's light crossfades. Reduce motion stills all of it.
- **Turn Resources** beside Panel, and the right pane docked, not over the mat (Rob's notes 9 and 10).
- **The seven steps always in view.** The concept hid its ribbon under 1600px and merged untap, upkeep and draw into
  one "Beginning"; ours lists the seven on every turn, short forms under 1400px.

**Refused, with the reason:**
- **The land reminder** that blocked a legal pass with a native `confirm`, worked out from the hand's card types: the
  screen never computes legality, and never a warning that can be clicked past (AGENTS.md).
- **Its own themes and seat colors:** ours stay the four themes of `crankmagic-design.css` and the seats' mana colors.
- **Its mats:** four square placeholders whose CSS never applied; ours are the thirty of `crankmagic-mats.css`.
- **Only one callout at a time**, despite its own claim of three; ours holds three.
- **The hand tray clipping lifted cards; opponents' permanents silently cut off in 3D.** Ours keeps every row whole or
  scrolling, and a side seat's board wraps its rows.
- **"Full screen" as a browser toggle only.** Ours stays a view with its own layout.
- **`isPriority` by the decision's title string.** Ours reads `decision.kind`.

**Set aside for a later pass (the concept has them, the board does not yet):** the Tracker, Combat and Chat tabs; Open
Games and the detail card; Standing; the spectator view; the d20 and the life wheel; dice on cards for counters; the
Coach's three suggested questions drawn from the decision; the rules helper chip; the Grid preset by that name; chairs
as a strip in Focus; the Layout menu with presets and "Save my layout". Each is listed in section 4 with what it needs.

## 2. Pass 1, built on `claude/nice-hypatia-4ajdyi`

| Piece | What it is | Proved by |
|---|---|---|
| The seven steps | `turnRibbon()`: one ribbon in the strip and in Full screen's pill, every turn; done steps struck through, the step now the accent chip (still `.cm-board-step`), the rest in ink; short forms under 1400px (a container query); a button opening the steps menu | `tests/table-board.mjs` (one lit step per strip) |
| Full screen, the table from your chair | `.cm-full-ground[data-mat]` under everything; the big board bare on it; the others at `data-side` left · back · right (two: left and right; one: across); the side column and the rail on a near-opaque dark | `table-board`: ground is the seat's mat, the whole window; the one other seat at the back |
| 3D | the rail's **3D** switch, `cm-board-3d` on the device; the ground in a wall and a floor, the floor `rotateX(38deg)` hinged at a horizon 30% down; the back seat leans away, the sides turn in; your board flat | `table-board`: the floor shown and transformed, remembered |
| The right pane docked | `.cm-board-panel` a grid column beside the mat in Focus and Table, 240–560px by its own divider (`cm-board-panel-w`); tabs Turn Resources · Panel · History | `table-board`: beside the mat and the hand, the drag and the keys, the mat giving room |
| Turn Resources | the hand by type (castable now / in hand, from the decision's options), the lands by name (untapped / all), the pool, the land drop | `table-board`: the lands row as the mat has them |
| The hover card | never taller than the mat (`--peek-max` from `fit()`) | `table-board` at 1280×800 |
| Motion | `motionSnapshot`/`motionPlay` around a paint of a newer view: flights, the tap turn, the turn's light (`data-turn-changed`) | seen in the fixture; not yet held by a suite (section 5) |
| Callouts | `calloutsFor(was, next)` (pure, on `CrankBoard`), a layer beside the board, three at most, hold 0.9 s + Overlay × 10 ms | `tests/board-callouts.mjs` (the reading), `table-board` (the layer, Tools › Try the callouts) |
| Settings › Play › Overlay | a slider 0–100, saved as `play.overlay` | `tests/settings-r3.mjs` |
| The lobby | a seated deck's quadrant wears its commander's color fan; "Launches when all are ready · n to go" | `tests/table-lobby.mjs` |
| Play home | Recent games under New table, from the library's filed results | seen; not held by a suite |

Breaks: `game/tools/batch/breaks-play-ui.py` (12, the board suite) and `breaks-play-ui-rest.py` (7).

## 3. Where confidence is lower, for Rob's eye

1. **The 3D bend.** The ground bends at 30% down; the floor at 38° under a 1400px perspective. On a gradient mat the
   bend is subtle, on artwork plain. Whether the opponents' boards should also lie in the floor's plane (the concept
   did that, at the cost of every word on them) is a judgment call: here they stay upright and only lean.
2. **The side seats at 1280×720.** A side column is 150px at the least; a board of twenty permanents wraps to four rows
   of 26px cards. Legible as a presence, not to read; the Focus button on its head is the way to read it.
3. **The callouts' loudness and timing.** The grammar is the concept's; the hold is 0.9 to 1.9 s. Tools › Try the
   callouts shows the set. The tones' colors are fixed, not the theme's (a callout is a light, not a surface).
4. **Where the callouts sit:** a column under the strip (16% down in Full screen), never over the hand or the pass.
   The concept anchored each to its card or seat; that needs the layer to know the mat's geometry at every size, left
   for a later pass.
5. **Flights at 250 permanents.** The snapshot reads every card's rectangle before and after a paint; at 250 that is
   two layouts a view. Not measured yet.

## 4. The next passes, in order

1. **Chairs in Focus as a strip across the top** (the concept's Chair), the seat pane's tiles as chairs with a
   priority ring and the away clock; Grid as the Table view's name in the Layout menu; "Save my layout".
2. **Tracker and Combat tabs** in the pane; the stack pinned to Combat; INCOMING's readout in combat order.
3. **Callouts anchored to their cause** (the attacking seat, the card, the stack), and the sound cues for them.
4. **Dice on cards** for +1/+1 and loyalty counters; the d20 for first player (needs a room frame, section 5).
5. **The Coach's three suggested questions from the decision; the rules helper chip** on a stack entry.
6. **Open Games, the detail card, Standing, the spectator view, Chat** (all need the room or the Worker, section 5).

## 5. Requests to the engine lane (also in `docs/ACTIVE.md`, Requests)

| What | For | Where it touches |
|---|---|---|
| The lobby's countdown starting by itself once every seat is ready, with no Start press; Cancel by the host stays | the brief's lobby ("No Launch button") | `game/room/table.mjs` (`countdown`), the table's view |
| A structured record of what happened since the last revision (`events: [{kind, …}]`: damage dealt by source, countered by what, tokens created, proliferate, destroyed, exiled, life gained or lost with its cause) | callouts and sounds read from facts rather than the history's sentences; the readouts the brief wants | `game/room/history.mjs`, the view |
| Per-player `manaTapped` this step (or per land `tappedForMana`) | Turn Resources' "mana tapped this step"; today it counts tapped lands | the view's players |
| Whether a permanent is a token; attachments; summoning sickness; colors and mana cost; the face up | the anchor's own list; dice on tokens, the Turn Resources by color, a double-faced card's picture | the view's cards |
| A `roll` frame (the d20 for first player, sent to every seat with its result) | the die that animates to the result it was sent | the room, at the game's start |
| A spectator projection (counts for every hidden zone) and an eye count per table | the spectator view and Open Games | the room, the Worker's tables |
| A chat channel on the table (lobby and game, with the sender's seat) | Chat in Lobby and Chat in Game | the Worker's tables, the Durable Object |
| A view's size at 250 permanents and 120 history lines: whether a delta (`since`) is wanted | flights and repaints at that scale | the room's `view`, only if measured slow |

## 6. What this pass changed in the shared files

`index.html`, `crankmagic.html`, `crankmagic-sw.js`, `crankmagic-app.js`: the `?v=` of `crankmagic-board.js`,
`crankmagic.css`, `crankmagic-mats.css`, `crankmagic-table.js`, `crankmagic-settings.js`, the service worker and the app
(the cascade in `docs/ui-lane/README.md`), then `node tests/asset-versions.mjs --update`. Nothing else in them.
