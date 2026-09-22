# Stage B: the board becomes the Play surface — measured from the wireframes

**Rob, 2026-09-21:** *"ensure that you also include the redesign of the play game board for both the
cloud and local host… the local host is the one we care about here because the cloud doesn't see
the actual play board. It only sees the lobby. And make sure that both the local host and the web
app lobbies match as well."*

And the standing rule he restated: *"anytime there's any UI work check for that near pixel perfect
match that we expect and don't make any assumptions unless absolutely necessary and after
confirming there is no foundational baseline you can use to anchor your decision."*

**The baseline exists.** `wireframes/Wireframes.dc.html` frames **2e** (Play · Game canvas) and
**2f** (Play · Focus view) are React `h()` trees with inline styles — not sketches, but numbers.
This file is those numbers, extracted once so nobody re-derives them.

**Wireframes are drawn at half scale** (the handoff README grades them lo-fi: "follow their
structure and content order"). Every pixel below is **as written in the frame**; double it for the
built surface, the way `tests/wireframe-conformance.mjs` already treats frame 2b.

---

## 2e · Play · Game canvas

> *src: `game/README §Start and play 4–9` · `commander-human-play §Table and Focus`*

### The top strip — "the whole control surface"

`display:flex; align-items:center; gap:8; padding:6px 10px; background:#1a1815; color:#f5f0e8; fontSize:8`

`#1a1815` is `--color-bg` and `#f5f0e8` is `--color-ink`, so the strip is already on the token set.

| In order | Style |
|---|---|
| `☰` rail toggle | `padding:3px 7px; radius:5; border:1px solid #555` |
| `Turn 4 · You` | bold, `white-space:nowrap` |
| `·` | `#a99e90` (`--color-muted`) |
| Phase chip `Main` | `padding:1px 6px; radius:4; background:brass; color:#1a1815; font-weight:700` |
| `3 / 6 ▾` | `#a99e90` |
| `Next: declare attackers` | `margin-left:auto`, ellipsis, `#a99e90` |
| **`Pass priority`** | **brass primary**, `padding:3px 8px; radius:5; color:#1a1815; bold` |
| `Skip to end` | outline, `padding:3px 7px; radius:5` |
| divider | `1×14px #555`, `margin:0 2px` |
| `History ▾` · `Tools ▾` · `Panel ▸` | outline chips |

**`Tools ▾` holds:** Recommended, Tracker, Combat, View options, Hold priority / Yield.

### The mat

`radius:12; border:1px solid #cfc8bb; background:#e9e4da; padding:8; gap:6; overflow:hidden; min-height:300`
`grid-template-columns: minmax(0,1fr) 20px minmax(0,1fr)`
`grid-template-rows: 1fr 0px 1fr auto`

A `<canvas>` sits behind at `inset:0, z-index:0, opacity:.9` — the living mat — with the active
player's commander fan over it, **swapping as the turn passes**.

### The four boards

**Always identical in size. One 2×2 grid of equal 16:9 tracks. Content clips inside; a board never
grows.** Placement: `grid-column: i%2 ? 3 : 1`, `grid-row: i<2 ? 1 : 3`.

`aspect-ratio:16/9; height:100%; radius:8; padding:6; gap:4; overflow:hidden`
Yours: `background:rgba(255,255,255,.96)`, `border:2px solid brass`. Others: `.86`, `1px solid rgba(0,0,0,.1)`.
`flex-direction: column` for the top row, `column-reverse` for the bottom — **so each header rides
its OUTER edge** and the center counter never covers a name or a control.

Inside, in order:
1. **Header** — name (bold, ellipsis) + status (`● active`, `priority`) in `#888`;
   `flex-direction: row-reverse` in the right column, so `⤢ Focus` sits on the outer corner.
2. **Zone chips** — `Cmd`, `Lib 87`, `GY 3`, `Ex 1`; each `flex:1; height:16; radius:3;
   background:#d9d3c7; font-size:6; color:#555`, centered.
3. **Steps — your board only.** Pills of this turn's actions, ticked off as you go: done ones get
   `line-through`, `background:#e6e2da`, `color:#888`; pending are `#fff` with `1px solid #ccc`,
   `border-radius:99`.
4. **Battlefield** — tiles `9×12`, `radius:2`; lands `#c9b8a0`, creatures `#f0805f88`;
   `min-height:26`, wrapping.

### The center counter

`position:absolute; left:50%; top:calc(50% - 40px); 76×76; border-radius:50%; background:#fff;
border:2px solid #bbb; box-shadow:0 8px 18px -8px #000; z-index:3`
A 2×2 of four life totals, each on its seat's color at 20% (`+'33'`), `font-size:9; font-weight:700;
font-variant-numeric:tabular-nums`. Seat colors as drawn: `#77c58f`, `#e9d79a`, `#6b6480`, `#f0805f`.

Inner disc `30×30`, white, `1px solid #bbb`, carrying the wand logo at `18×18`. **Clicking it cycles
what YOU see: life → commander damage taken from each opponent → poison from each.**

### Your hand

`grid-column: 1 / -1; grid-row: 4` — **nothing sits below the mat but your hand.**
`padding:6px 8px; radius:8; background:rgba(26,24,21,.55); backdrop-filter:blur(3px); color:#f5f0e8`
`‹` and `›` pagers (`#fff`, `1px solid #ccc`, radius 5); cards `34×46`, radius 3, selected gets
`2px solid brass`; `Hand 7` at the end in `rgba(245,240,232,.8)`.

### What the frame says in words

> "The play surface is the whole window: CrankMagic's rail is hidden (☰ brings it back as an
> **overlay, not a column**) and the right panel is closed (Panel ▸ **slides it over the mat**)."

---

## What this means for the work

**This is not a restyle of today's board.** Today's `/review` is a header of nine buttons, a row of
opponent boards, one large mat and a permanent right sidebar. The frame is a **single strip over a
2×2 of equal 16:9 boards on a light mat**, with the rail and the panel both as overlays. The
information is largely the same; almost none of the layout is.

So Stage B is a rebuild of the board's shell, and it is worth doing in pieces that each stand up on
their own and can each be measured.

### B.1 · The top strip
Self-contained, the most visible, and it replaces controls scattered across today's header. Nothing
else has to move for it to be right.

### B.2 · The 2×2 mat of equal 16:9 boards
The structural change. `.cm-lobby-table` in the lobby is already a 2×2 of quadrants — **the lobby
and the board become the same table, one dead and one live**, which is what Rob means by the two
matching.

### B.3 · The center counter
76px, four totals, the cycling disc. Depends on B.2 for a center to sit in.

### B.4 · Hand on the mat's bottom edge
Removes the separate hand region below.

### B.5 · Rail and panel as overlays
`☰` and `Panel ▸`. The last structural piece.

### B.6 · Focus view (2f)
A frame of its own; measured separately when B.1–B.5 are in.

### The guard
`tests/wireframe-conformance.mjs` gains board checks beside its lobby ones — the same file, because
it already knows how to hold a half-scale lo-fi frame to structure and content order rather than to
pixels. `game/ui` stays in the raw-hex ratchet, which drops as each piece converts.

---

## On "both lobbies match"

**They already are the same code.** `crankmagic-game.js` is served from the host at
`/app/#game` and published to github.io from the same file; there is no second lobby to
reconcile. What differs is behavior, and only where it must: `probeHost()` returns false off
loopback, so the web copy knows it cannot start a game itself. That difference is the subject of
`docs/plan-web-to-local-table-2026-09-21.md`, not a visual drift.

**Verified, not assumed:** the local-host link added on 2026-09-21 renders in both copies from the
same template, resolving to `location.origin` on loopback and to the documented default elsewhere.

## On "the cloud doesn't see the play board"

Correct, and it is structural rather than a decision anyone has to enforce: `/review` is served by
the local host and by the guest gateway. github.io has no board route at all. A guest reaches a
board only through the tunnel, which is the gateway serving the same files.

---

## B.2 attempted, measured, reverted — 2026-09-22

Tried as a CSS change: the frame's grid on `.arena`, `aspect-ratio:16/9` on `.seat`, and the four
breakpoint re-guesses removed. Measured at 1600 / 1280 / 1000px:

```
  west    190x107  ratio 1.778
  north   190x107  ratio 1.778
  east    190x107  ratio 1.778
  south  1028x578  ratio 1.778
  identical: NO      16:9: all four
```

**The ratio held everywhere. The boards were still not identical, and CSS cannot make them so.**

`review.mjs:46` builds an `.opponent-boards` container and moves seats 1–3 into it
(`opponents.append($('seat-'+id))`), leaving only the viewer's seat in `.arena`; `render()` keeps
that split every frame (`p.playerId===primarySeat ? opponents.after(seat) : opponents.append(seat)`).
**The three opponents are not siblings of the viewer's board in any grid**, so no grid rule can
size them together.

Screenshotted against Rob's live game: the ratio change also pushed his hand over the mat's bottom
edge and squashed an opponent seat. **Reverted the same minute.** B.1's strip was unaffected and
stayed.

### So B.2 is a JavaScript change, not a stylesheet one

1. Stop moving seats into `.opponent-boards`; place all four in `.arena` at the frame's positions.
2. `primarySeat` stops meaning "the big one" and means only "the one Focus opens" — which is what
   frame 2f is for.
3. "Hide other boards" survives as a View option but no longer changes anyone's size, because the
   frame says the four are always identical.
4. The hand moves onto the mat's bottom edge in the same pass (B.4), because it is the mat's fourth
   grid row in the frame and freeing it from the current layout is what stops it colliding.

**B.2 and B.4 should therefore land together.** Splitting them is what broke the hand.
