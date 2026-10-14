# Replit prototype salvage: CrankMagic Play

**Read with `INSTRUCTIONS.md`.** Where this file and the instruction set differ, the instruction set wins (Rob's 2026-10-13/14 notes and wireframe are newer than the prototype). Section 9 is the part the executor uses: per PR, what to port and what not to.

Source: `docs/reference/replit-play/artifacts/crankmagic-play/` (the Replit repo Rob exported on 2026-10-14, committed without build output) (React 18 + TypeScript + Vite + Tailwind v4 + shadcn + framer-motion + wouter). All paths below are relative to its `src/` unless they start with `public/`, `attached_assets/` or `.agents/`. Target repo is vanilla classic-script JS, so nothing here is code to copy; it is values, structure, behavior, CSS and copy to carry.

Prototype's own self-description: `HANDOFF.md` (104 lines). Its agent memory `.agents/memory/play-scope.md` records Rob's instructions to Replit at the time (2026-10-12): "you bottom right" quadrants, no opponent hand containers, spatial swap between boards, 3D "uses one focused player's mat for all public cards, with opponents at top/left/right and a horizon about one quarter from the top", callouts must not overlap and life callouts show the name + animated life total in black text. Several of these are superseded by the 2026-10-14 instruction set (Section 9 lists the conflicts).

---

## 1. Screens and routes

Router: `App.tsx:28-31`. `/` PlayHome, `/lobby` Lobby, `/game` Game, `/spectate/:id` Spectate, else not-found. Providers: Prefs → Chat → Game (`App.tsx:43-45`). Sound unlock on first `pointerdown`/`keydown` (`App.tsx:39`, `lib/sound.ts:10-18`).

### 1.1 PlayHome (`pages/PlayHome.tsx`, 129 lines)

Page frame: `AppNav` (sticky, h-14 = 56px, `max-w-[1400px] px-5`, `components/brand/AppNav.tsx:78-79`), `main` `mx-auto max-w-[1400px] px-5 pb-16 pt-8` (:42), `AppFooter` (:125).

Three sections, each `grid gap-5 lg:grid-cols-[1.5fr_1fr]` except the last:

1. **Hero + public chat** (:43-64). Hero card `rounded-3xl border bg-card shadow-sm` with `assets/mats/highland-mist.jpg` at `opacity-70` under a left-to-right gradient `from card → card/0.85 → transparent` (:45-46); padding `p-7 sm:p-9`. Copy: zone-label "Your table is still warm"; h1 `font-display text-4xl sm:text-5xl leading-[1.05]` "Turn 13. Friend is *thinking.*" (italic primary); body "Rob, Friend, AI 2 and AI 3 · Faerie Flock · you are at 40. Pick up exactly where you left it, or try the demo table." Buttons (:52-56): **Resume demo table** (primary pill `rounded-full bg-primary px-5 py-2.5 text-sm font-semibold shadow-md`, loads scenario `demo`), **New table** (bordered pill → `/lobby`), **Rematch last pod** (ghost pill → `/lobby?rematch=1`; the query is never read). Right column: "Public lobby chat" with subtitle "Everyone looking for a game", `ChatPanel compact channel="public"` (:60-63). Hero motion: `opacity 0, y 12 → 1, 0` (:44).
2. **Open games + detail aside** (:66-111). Heading "Open games" + "12 tables"; filter chip group `All / Open / Friends / Invite only / Full · watch` (:71-75). Table rows (`divide-y rounded-2xl border bg-card`): overlapping seat avatars `h-7 w-7 rounded-full border-2 border-card text-[10px]` showing 2-letter initials in `hsl(var(--seat-i))`, empty seat dashed `+` (:84); name; `host · bracket N · pace · turn N` or `· N seats free` (:87); access pill with lucide icon (Globe/Users/Lock/Eye) (:89). ACCESS table (:17-22): `open` "Open" bg lichen/0.25 cta "Take a seat"; `friends` "Friends" bg seat-2/0.18 cta "Ask to join"; `invite` "Invite only" bg brass/0.2 cta "Enter code"; `full` "Full · watch" bg secondary cta "Watch". Aside (:96-110): detail card keyed on selection (`opacity 0, x 10 → 1, 0`) with access label, name, "Hosted by X · bracket N · pace pace", note, 2×2 seat grid with index numbers, "N watching", CTA button; **Standing** card marked `stub` with 7 wins / 12 games / 58.3% (:106-109). Actions (:33-37): full → `/spectate/:id`; open → `/lobby`; friends/invite → toast stub.
3. **Game history** (:113-123): `grid gap-3 md:grid-cols-2`, card = result line + `fmtDate` right + "deck · N turns · seats".

Data: `data/home.ts` OPEN_TABLES (12 rows, :6-19), HISTORY (4 rows, :22-27), DECKS (4 names, :28).

### 1.2 Lobby (`pages/Lobby.tsx`, 175 lines) — detail in Section 4

Frame: `AppNav`; `main` `mx-auto grid max-w-[1400px] gap-5 px-5 py-6 lg:grid-cols-[1fr_340px]` (:78). Left: header row, quadrant grid, countdown/wait panel. Right aside: "Table chat" card `lg:h-[calc(100dvh-110px)]` (:157).

### 1.3 Game (`pages/Game.tsx` → `components/layout/GameScreen.tsx`, 248 lines) — detail in Section 2

Root `game-root felt relative flex h-[100dvh] flex-col overflow-hidden` with `data-layout` and `data-table3d` (:127). Vertical stack:

- Reconnect bar `h-7` brass, only while `connection === 'reconnecting'` (:129-134), copy "Reconnecting. The board is unchanged; your next answer waits for the room."
- Header row: Logo link `h-12 px-3` + `Strip` (`h-12`) (:135-138).
- Synthetic badge pill absolute `left-3 top-[52px]` (:139-143).
- Body `flex min-h-0 flex-1` (:146): left column `flex min-w-0 flex-1 flex-col` holding, top to bottom:
  - Chairs nav (only `layout === 'focus' && !is3d`), `flex gap-2 overflow-x-auto px-3 pt-3`, height: phone 100 px; `prefs.panes.chairs ? prefs.sizes.chairsH : 116` (:150). Divider "Chairs height" 110-360 (:157).
  - Board area `relative min-h-0 flex-1 p-3` with `perspective: 1400` (:161). Contents by mode: Table3D | focus Mat in a `SeatSlot` | 2×2 grid (:162-185). Overlays: 3D toggle pill `left-5 top-5` when fullscreen or 3D (:186-195); StackPanel floating `right-6 top-14` unless pinned (:196); DecisionDock `inset-x-0 bottom-3` (:197); emote bubble `top-6` centered, 1800 ms (:66, :198-202).
  - CenterCounter strip `border-t bg-background/80` when `panes.counter` (:205-209).
  - Hand divider "Hand height" 96-340 + hand tray `border-t bg-background/70`, height phone 120 else `prefs.sizes.handH` (:210-217).
  - Right pane: Divider "Pane width" 260-560 + `RightPane` at `prefs.sizes.paneW` (:220-225).
- `rotate-hint` fixed overlay (`index.css:506-513`): shown only at `(max-width: 600px) and (orientation: portrait)`; copy "Turn your phone sideways" / "The table needs landscape. Your seat is held."
- Portals: FlightLayer, CalloutLayer, HoverPreview, CardZoom, GameOver, CoachDrawer, ScenarioPicker, KeyboardHelp, SettingsPlay, ConfirmTable (:235-244).

Breakpoints: phone = `(max-height: 520px) and (orientation: landscape)` (:36), forces layout `focus`, hides pane, 100 px chairs, 120 px hand, fanned hand. Strip hides door labels below `lg`, turn/phase text below `md`, the 7-step ribbon below `min-[1600px]` (`Strip.tsx:43,47`). HoverPreview is `md+` only (`HoverPreview.tsx:16`).

Layouts (`state/prefs.tsx:4`): `focus` (one big mat + chair row) and `table` (2×2 grid of compact mats, order `[r1, r2, r3, r0]` relative to your seat = you bottom-right, `GameScreen.tsx:120-123`; double-click a quadrant → focus it, :181). Shared-layout slot `SeatSlot layoutId="seat-${id}"` (:47-49) lets a board walk between chair and center.

### 1.4 Spectate (`pages/Spectate.tsx`)

Loads scenario `spectator` (= `spectatorProjection(FIXTURES[35])`, `game/adapter.ts` map) then renders Game. Projection (`game/synthetic.ts:144-161`): `__spectator=true`, `seat=-1`, `decision=null`, Hand/Library/Graveyard/Exile `cards=[]` with `hiddenCount=count`, face-down names nulled. Effects: one button reads "Watching" (`derive.ts:96`), hand tray shows "Spectating · hands are hidden. Counts only." (`HandTray.tsx:31-37`), piles aria "(count only)" (`Piles.tsx:25`), DecisionDock hidden (`DecisionDock.tsx:33`), ResourcesTab "Spectators have no resources." (`ResourcesTab.tsx:9`), chat sender "You (watching)" tagged `rail` (`ChatTab.tsx:19,28`).

---

## 2. Table components

### 2.1 Table3D.tsx (126 lines) — the "3D" table

**Method: CSS perspective + one `rotateX`, no WebGL.**

- Stage `t3d-stage absolute inset-0 overflow-hidden` with gradient `felt 0% → card/0.6 30% → felt 100%` (`index.css:582-584`); a `t3d-sky` band `inset-x-0 top-0 h-[40%]` with `radial-gradient(70% 100% at 50% 100%, card/0.85, transparent 70%)` (:106; css :585-587).
- Perspective container: `perspective: 900px`, `perspectiveOrigin: '50% 26%'` (:107). The vanishing point is at 26% of the stage height (Rob's "horizon about one quarter from the top" from `.agents/memory/play-scope.md`).
- Swing wrapper (`motion.div animate={controls}`): `absolute inset-x-[-9%] bottom-0 top-[-12%]`, `transformOrigin '50% 100%'`, `transformStyle preserve-3d` (:108). It is 118% wide and extends 12% above the stage so the tilted plane fills the view.
- Plane: `transform: rotateX(46deg)`, `transformOrigin '50% 100%'`, `rounded-t-[48px]`, `overflow-hidden` (:109); `t3d-plane` has `box-shadow: 0 -30px 60px -30px ink/0.35; backface-visibility: hidden` (css :588-591). Mat art fills the plane (`mat-surface` + `mat-art`, :110-112).
- Layout on the plane: CSS grid `h-full gap-3 px-[10%] pb-4 pt-6`, `gridTemplateRows: '30% 1fr'` (or `'0 1fr'` with no top seat), `gridTemplateColumns: '24% 1fr 24%'` (:113). Top patch spans 3 columns at `w-[62%]` centered (:114); left patch col 1 (:115); **viewed mat** center col with `<Mat bare />` (:116-118); right patch col 3 (:119). So: viewed mat ≈ 52% width × 70% depth; sides 24% each × 70%; top 62% × 30%. (The instruction set's D3 wants the three others in one back row across 25-30% depth in thirds; the prototype's "one at top, two at the sides" is Rob's older 2026-10-12 instruction.)
- Chairs (OpponentPatch, :21-73): `t3d-patch` = `card/0.22` fill with `1px dashed ink/0.14` outline (css :592-596); chip button `t3d-chip` (card/0.92, shadow, hover lift 1 px over 160 ms; css :597-603) with seat badge 20 px, name, heart + life, skull when out; aria "Rotate the table to {name}'s board. Life N." Card width `max(40, round(cardSize × 0.72))` on top, `× 0.62` at the sides (:28). Nonlands wrap, lands as piles with 5 px stagger and `×N` badge (:61-67). Turn seat gets `priority-ring`; out seat `grayscale-[0.7]`.
- Seat placement (:80-83): `ring = relativeSeats(view, focus)`, `others = ring.slice(1)`; 1 other → `{top}`; 2 → `{left, right}`; 3 → `{left: others[0], top: others[1], right: others[2]}` (clockwise from the viewer: next seat on the left, then across, then right).
- **Camera walk on focus change** (:87-96): direction = shortest way around the ring (`steps <= n/2 ? 1 : -1`); `controls.set({ rotateZ: dir*28, scale: 0.92, opacity: 0.75 })` then `start({ rotateZ: 0, scale: 1, opacity: 1 }, { duration: 0.75, ease: [0.22, 1, 0.36, 1] })`. Skipped under reduced motion. The viewed mat and patches use `layoutId="t3d-seat-${playerId}"` (:42, :116) so the mat that becomes the viewed one FLIPs from its patch under the global `MotionConfig` (360 ms, see 2.2).

### 2.2 GameScreen.tsx seat swap (2D)

- `MotionConfig transition={{ duration: 0.36, ease: [0.25, 0.8, 0.25, 1] }}` (:126) is the **360 ms walk**: any `layoutId` shared element (chair ↔ center mat via `SeatSlot`, :47-49, :152, :165, :180) FLIPs over 360 ms with that ease. Reduced → `duration 0`, `reducedMotion="always"`.
- Focus layout entrance (:166-175): the Mat keyed on `focus` animates from `rotateY: dir*24°, rotateZ: dir*2°, x: dir*65px, scale: 0.94` to zero over `0.65 s`, ease `[0.22, 1, 0.36, 1]`, `transformOrigin '50% 85%'`, inside the board area's `perspective: 1400` (:161). `dir` = +1 when the new focus index is higher (:114-117).
- HANDOFF.md:54 states the walk is "about 360 ms, over the brief's 250 ms cap ... Deliberate" (a shorter walk read as a cut). The instruction set 5.3 chose fade 120 ms / swap / fade 120 ms instead.

### 2.3 Chair.tsx (75 lines)

A miniature board, `motion.button layout`, `min-w-[220px] flex-1 rounded-xl border bg-card shadow-sm hover:shadow-md`, `priority-ring` when it is that seat's turn, `opacity-60 grayscale` when out (:36-44). Mat art backdrop `opacity-50` (:45-47). Header bar `bg-card/0.88 px-2.5 py-1.5`: seat badge 20 px (`h-5 w-5 text-[10px]`), name `font-display text-sm`, `AI` tag when pilot ≠ human, heart + life mono (:48-53). Body: nonlands as 22 px wide 5:7 thumbs (`w-[22px] rounded-[3px] ring-1 ring-black/10`), tapped → `rotate-90`, first 24 then `+N` (:54-61). Footer `text-[11px]`: `lands N`, `lib N`, `gy N`, "thinking" when `waitingOn` and not their turn, `away Nm` (brass, clock icon), WifiOff when departed (:62-72). Aria "{name}: life N. Press {n} to look at this board." Pill variant (:25-33): dot + name + life.

### 2.4 Mat.tsx (147 lines)

- Card width `w = compact ? round(cardSize × 0.8) : cardSize` (default 74 → 59 compact), `h = w × 1.4` (:54-55).
- Section `relative h-full w-full overflow-hidden rounded-2xl`, `priority-ring` on turn, `grayscale-[0.7]` when out, `--seat` var (:88-97). `MatBackdrop` unless `bare` (:98).
- Inner `flex h-full gap-4 overflow-auto p-3` (:99): left column `min-height h×2+76` (:100) = header row + permanents grid + lands row; right column = `PileColumn` at `width round(w × 0.78)`, `pt-8` (:139-143), omitted when compact.
- Header (:101-115): seat dot 10 px, name `font-display text-[15px]`, life pill `bg-card/0.85 rounded-full px-2 py-0.5 font-mono`, `poison N` pill, out pill (skull + lossReason). Hidden flight anchor for other seats' Hand (:114).
- Permanents grid (:116-124): `rows = max(1, floor((height − h − 24) / (h + 10)))`, `cols = max(1, ceil(n / rows))`, `grid gap-2.5 pt-3` with `gridTemplateColumns: repeat(cols, w px)`; empty copy "No permanents yet". Order: creatures first then others (`derive.ts:163-173`).
- Lands row (:125-137): `flex items-end gap-3 px-1 pb-1 pt-3`, `minHeight h+16`; piles by basic name and tapped state (`landPiles`, `derive.ts:176-189`, WUBRG order, untapped before tapped), stacked with 6 px offset per card, `×N` badge; "No lands".
- Card states: `bright` = has an option and options exist; `dim` = options exist but none for this card and mode ≠ one; `lit` = coach-lit, attacking or blocking; `selected` = in draft. `ATK`/`BLK` badges `-top-2 left-1 text-[10px]` (:81-82). Each card wrapper `layout="position"` 200 ms (:69).
- `useCardActivate` (:18-36): click on a card with exactly one option in `one/boolean/index` mode chooses it; several → opens zoom; `many` → toggles draft; other modes → zoom.

### 2.5 Piles.tsx (68 lines)

`Pile`: button of `width`; Library always a card back; else top card face (`showTapped=false`, nameplate when width > 60) or dashed "empty" box; count badge `-right-1.5 -top-1.5 min-w-5 rounded-full bg-ink text-[11px]`; label under it when `width >= 44` (:28-38). Public piles (not Library) open a browse dialog `max-w-3xl`, cards at 110 px, "N cards, newest last. Public zone." (:40-55). `PileColumn` order **Command, Library, Graveyard, Exile**, `grid grid-cols-2 gap-x-3 gap-y-2` or horizontal (:60-68).

### 2.6 HandTray.tsx (87 lines)

- Card width `w = round(min((height − 34) / 1.4, 56 × handScale))` (:28); default handH 168 and handScale 2 → `min(95.7, 112)` = 96 px.
- Header `text-[11px]`: "Your hand · N", "bright cards can be played now" when options exist, sort group (Order drawn / By type / By name) (:41-51).
- Row `flex items-end px-4 pb-2`, horizontal scroll, `gap-2` (:52). Phone fan: `rotate (i − mid) × 5°`, `marginLeft −w × 0.45`, `y |i − mid| × 4` (:58, :64, :67). Playable (has option) cards lift `y −8` (:64). Enter `opacity 0, y 20` over 200 ms; exit 10 ms (:63-66). Empty: "Your hand is empty".
- Sort by type uses `TYPE_ORDER = Land, Creature, Instant, Sorcery, Artifact, Enchantment, Planeswalker` (`derive.ts:145`).

### 2.7 CenterCounter.tsx (57 lines)

Row `min-h-9 gap-4 px-3 text-xs`: per player seat dot 6 px + name + life mono; "Vitals" wand button (:14-25). Vitals dialog `max-w-2xl` table: Seat / Life / Poison / Cmdr dmg (max) with per-commander breakdown `(key-suffix N, …)` / Counters / Status (:26-54). Copy: "Life, poison, and commander damage, read from the view. Totals change only through the game."

### 2.8 Strip.tsx (164 lines)

`h-12 gap-2 px-3 border-b bg-background/90 backdrop-blur`, `role=toolbar` (:42). Left: `turnLabel` ("Turn 13 · You (your 4th)" / "Opening hand", `derive.ts:70-76`) over `phaseLabel` (:43-46); ribbon `ol` of 7 steps `rounded-full px-2 py-0.5 text-[11px]`, current = primary fill, past = `text-foreground/60`, future = `muted/60` (:47-51). RIBBON (`derive.ts:21-29`): Beginning (UNTAP,UPKEEP,DRAW) · Main 1 · Combat (COMBAT_BEGIN, DECLARE_ATTACKERS) · Blocks · Damage (FIRST_STRIKE, DAMAGE, END) · Main 2 · End (END_OF_TURN, CLEANUP). Note the instruction set's 5.1 track is Untap · Upkeep · Draw · Main 1 · Combat · Main 2 · End (7 steps, different grouping).

Center: **the one button** `h-9 min-w-[180px] rounded-full px-5 text-sm font-semibold`, `priority-pulse` + primary when actionable, brass when kind `end`, title "{hint} (N or Space)", "Sending…" while pending (:54-63). Refusal under it: `absolute top-[42px] max-w-[420px] rounded-lg border-destructive/40 text-xs text-destructive`, "{error} ({status})" (:64-68). Labels from `oneButton` (`derive.ts:94-114`): Watching / Game over / "Waiting on {who}" / "Answer above" / "Choose an option" / **End Turn** (pass option `endsTurn`) / "Resolve {top name}" / **Draw** (UPKEEP or UNTAP on your turn) / **Next Step** / **Pass**.

Right doors (`Door` = `h-9 rounded-full px-3 text-sm`, label hidden below lg): Skip to end / Stop skipping (only on your priority); "You can also" dropdown of non-pass, non-land options with `#index`, label, detail, `lean` in brass (:73-88); History (opens pane on history tab); Tools menu (:90-117): Step by step, Hold priority after casting, Emote submenu, Prototype group (Scenarios & callouts, Simulate disconnect, Friend steps away, Send a stale answer (409), Engine failure (500)), Keyboard shortcuts, Settings › Play, Concede, End for everyone; Layout menu (:118-157): Focus/Table buttons, Full screen / Exit full screen (`requestFullscreen`, alert copy on failure), "3D table (one shared surface)" checkbox, Panel presets Minimal/Standard/All panels, **Card size slider 44-130 step 2 ("Card size · 74px")**, **Hand size slider 1-3 step 0.1 ("Hand size · 2.0×")**, checkboxes Expanded board previews / Hand tray / Life totals bar / Callouts, Save this layout / Restore saved layout; 3D door; Panel door; Coach door.

Skip-to-end (`state/game.tsx:160-176`): passes every 260 ms while it is your priority with an empty stack, stops at UPKEEP/UNTAP, a non-priority decision, a non-empty stack, or an `endsTurn` pass. Land reminder (`state/game.tsx:132-135`): `window.confirm` "You have not played a land this turn. Continue to the end step? Choose Cancel to stay and play a land from your hand." when passing in MAIN2 with 0 lands played and a land in hand.

### 2.9 DecisionDock.tsx (122 lines)

Hidden for priority decisions and spectators (:33). Panel `w-[min(720px,96%)] rounded-2xl border bg-card/95 p-3 shadow-xl backdrop-blur`, enter `y 24 → 0, opacity` over 220 ms (:41-49). Header: title `font-display text-[17px]`, mode copy (`header()`, :18-26): many "Choose N" / "Choose a to b"; order "Put these in order, first at the top"; damage/amount "Assign {total}, at least {minEach} each"; ack "Acknowledge to continue"; else "Choose one"; plus `· {mode}`, `capped.why`, `requires[].why` (brass), `cost {cost}`. Bodies: one/boolean/index → outline buttons (destructive when `hostile`) `max-h-[28vh]` (:58-66); many → toggle chips with a 30 px card thumb and a checkbox, `max-h-[30vh]` (:68-83); order → list with Move up / Move down (:85-96); damage/amount → rows with `lethal N` hint, −/+ steppers, "{remaining} left of {total}" (:98-110). Footer: "{n} chosen · click cards on the board too", Clear, Confirm / Confirm none / Confirm order / Assign / OK (:112-119). Draft rules (`state/draft.tsx`): `exclusiveBy` dedupes by that option key (:36-39), `max === 1` replaces (:40), clicking a card cycles that card's options (:47-61).

### 2.10 StackPanel.tsx (49 lines)

`readout` surface (`hsl(210 25% 10% / 0.84)`, blur 6 px, `index.css:400-404`), `w-[260px] rounded-xl p-2.5 shadow-lg` (:17). Top of stack first (:12). Shows 8 (4 compact) (:15); row: 17×24 px thumb with `box-shadow 0 0 0 1.5px seatColor` (:33), name or "Face-down spell", `{kind} · {player}`; first row opacity 1, rest 0.85. "+N more below". "What now?" popover copy (:26): "The top item resolves first, once every player passes in a row. Passing now lets **{top}** resolve. To answer it, choose a spell or ability instead." Resolve-all button in lichen only when the decision offers `act: 'resolve-all'` with `(count)` (:42-46). Position when floating: `right-6 top-14` (GameScreen :196); pinned into the Combat tab via `panes.stackPinned`.

---

## 3. Motion

### 3.1 `lib/flights.ts` (17 lines) + `components/table/FlightLayer.tsx` (192 lines)

Registry: `cardEls: Map<cardId, HTMLElement>` and `anchorEls: Map<key, HTMLElement>` with keys `seat:{id}`, `{owner}:{Zone}` (Hand/Library/Graveyard/Exile/Command), `stack` (`flights.ts:2-3`, used by Mat/Chair/Piles/HandTray/StackPanel/Table3D).

FlightLayer (FLIP between views, fixed layer `z-[60]`, portal to body):
- Snapshots card rects every 900 ms while idle and on resize/pointerup (:64-76).
- On a new view of the same match with a higher revision (:82): three passes, max **6 flights**, skip moves under **6 px** (:90-94):
  1. still on screen, zone changed → from old rect to new rect, duration **0.22 s**, **0.18 s when the destination is Battlefield** (:97-110);
  2. left the screen → from old rect to its owner's pile anchor; destination Graveyard/Exile/Command lands face-up; **tilt 18°** when Graveyard; duration **0.24 s** (:112-124);
  3. arrived from a hidden zone → from `{owner}:{oldZone}` anchor or Library (for Hand/Reveal) or the owner's Hand anchor; duration **0.22 s**, **0.24 s to Hand** (:126-142).
- The real card is hidden (`visibility: hidden`) during its flight and released on landing or by a **700 ms** safety timer (:104, :147-151).
- Ghost: `motion.div` width = destination width, `scale` from source/destination ratio, `rotate` to tilt, ease **[0.2, 0.8, 0.2, 1]** (:170-177). **Flip**: when landing face-up from a face-down source, inner `rotateY 90 → 0` over `duration × 0.6` after a `duration × 0.4` delay (:180); otherwise a CardBack.
- Disabled entirely under reduced motion (GameScreen :235 passes `disabled={reduced}`).

### 3.2 Callouts: `game/callouts.ts` (147 lines) + `components/table/CalloutLayer.tsx` (120 lines)

Grammar (`CalloutLayer.tsx:1-3`, `index.css:375-399`): a bold condensed italic uppercase word (Barlow Condensed 800, `-webkit-text-stroke 1.5px ink/0.85`, `paint-order: stroke fill`, `line-height 0.9`) with a neon text-shadow glow, a lucide glyph, an optional number, optional readout lines, and for life events a black name + animated life total above.

Kinds and tones (`callouts.ts:6-9`): `incoming`(harm) `response`(answer) `hit`(harm) `critical`(harm) `ko`(harm) `blocked`(answer) `saved`(answer) `countered`(answer) `counters`(growth) `proliferate`(growth) `tokens`(value) `life-gain`(growth) `life-loss`(harm) `fatal`(harm) `destroyed`(harm) `exiled`(fade) `your-turn`(value) `game-over`(value) `emote`(value). Words: Incoming, Response, Hit, Critical, KO, Blocked, Saved, Countered, +1/+1 (or Loyalty), Proliferate, Tokens, Life, Life, Fatal, Destroyed, Exiled, Your turn, Game over, GG. Glyphs (`CalloutLayer.tsx:12-16`): Swords, Shield, Zap, Flame, Skull, ShieldCheck, Shield, Slash, Sparkles, Waves, Sun, Heart, HeartCrack, Skull, Crosshair, Ghost, Trophy, Trophy, Hand.

Tone colors (`index.css:386-390`): harm `hsl(2 95% 64%)` glow `2 95% 60%`; answer `hsl(198 95% 62%)` glow `198 95% 56%`; growth `hsl(108 75% 56%)` glow `108 75% 50%`; value `hsl(44 98% 58%)` glow `44 98% 54%`; fade `hsl(276 80% 72%)` glow `276 80% 66%`. Glow (:391-396): three shadows at `0.5×`, `1×`, `2×` of `--glow-size` with alpha 0.9 / 0.7 / 0.45. Glyph drop-shadow 6 px/0.9 + 16 px/0.5 (:397-399).

Detection (`detectCallouts`, :47-147), only when same match and higher revision: game-over (returns alone); your-turn; incoming attacks at you (readout "{name} · P/T · keywords · → you|your planeswalker", anchored at the attacking seat); blocked (first new blocker); response = stack grew while non-empty (readout top 4 "{name} · {player}"); history text regexes: `/countered/i`, `/proliferate/i`, `/created (\d+) .*tokens?/i`; life deltas: in COMBAT_DAMAGE or FIRST_STRIKE → `ko` (status left active) / `critical` (≤ −10) / `hit`, else `life-loss`; gains → `life-gain`; `fatal` when poison crosses 10 or commander damage crosses 21; battlefield → graveyard `destroyed` (max 2), → exile `exiled`; `+1/+1` and `loyalty` counter increases → `counters` with `+N`. Capped at **6 per view** (:146). Life events carry `{name, from, to}` (:140-145).

Placement (`anchorPoint`, :18-34): anchor element by cardId → `stack` → `seat:{n}`; point = center x, `top + min(height/2, 120)`; clamped inside the board bounds by **140 px** left/right, **60 px** top, **90 px** bottom; fallback board center x at 38% height.

Timing (:36-91, :110-116): entrance spring `stiffness 520, damping 22, mass 0.7` from `opacity 0, scale 0.4, rotate −6°, y 12` (≈ 320 ms); exit `opacity 0, scale 1.12` over **150 ms**; **hold = 900 + overlay × 10 ms** (+700 ms when it has a readout); default overlay 70 → 1600 / 2300 ms. Intensity: glyph size `44 × (0.75 + overlay/200)` px (48.4 at 70), word `× 1.05`, number `× 1.15`, glow `6 + overlay/5` px (20 at 70); readout only when overlay > 15, `max-w-[340px] text-[14px]`. Life number counts from `from` to `to` over 850 ms after a 350 ms delay (:42-50). Click dismisses. **Depth: one at a time** (`callouts.slice(0, 1)` with `AnimatePresence mode="wait"`, :113-114); the queue in `state/game.tsx:68` is unbounded and the header comment's "never more than three" is not enforced in code. Under reduced motion: no entrance, instant exit, life number jumps. Callouts off when `panes.callouts` false (`state/game.tsx:63-67`).

Sounds tied to callouts (`state/game.tsx:69-73`): incoming → `sword`; any answer tone → `shield`; life-gain → `life`; your-turn → `turn`; game-over → `end`; hand count up → `draw` (:99).

### 3.3 `index.css` transitions and keyframes (every one)

| Rule | Line | Value |
| --- | --- | --- |
| `.mtg-card` | 326-335 | `transition: transform 220ms cubic-bezier(0.2,0.8,0.2,1), box-shadow 180ms ease, opacity 180ms ease`; `transform-origin 50% 60%`; `aspect-ratio 5/7`; `border-radius 4.5% / 3.2%` |
| `.mtg-card.is-tapped` | 344-346 | `transform: rotate(14deg)` (**tapped tilt is 14°, not 90°**; chairs use `rotate-90` on thumbs, `Chair.tsx:56`) |
| `.mtg-card.is-bright` | 350-352 | `0 0 0 2px lichen` ring |
| `.mtg-card.is-lit` | 353-355 | `0 0 0 2px brass, 0 0 18px 2px brass/0.55` |
| `.mtg-card.is-selected` | 356-358 | `0 0 0 3px primary` |
| `.active-wash` | 368-373 | `transition: opacity 600ms ease` (class defined, not used by any component) |
| `.divider-h/v::after` | 421-428 | `transition: background 150ms ease`; handle 44×3 px pill |
| `@keyframes pulse-ring` + `.priority-pulse::after` | 461-473 | scale 1 → 1.35, opacity 0.7 → 0, `1.6s ease-out infinite`, `inset -3px`, 2 px lichen border |
| `@keyframes shimmer` + `.skeleton-shimmer` | 474-482 | background-position −200 → 200 px, `1.2s linear infinite` |
| `@keyframes reconnect-bar` + `.reconnect-runner` | 483-486, 579 | translateX −100% → 300%, `1.4s ease-in-out infinite` |
| `.priority-ring::after` + `@keyframes active-light-in` | 569-578 | inset ring `inset 0 0 0 2px var(--seat), inset 0 0 28px -6px var(--seat)`, `animation: active-light-in 600ms ease-out both` (opacity 0 → 1). This is the **active light**; it fades in on the turn player's mat/chair/patch. There is no fade-out (element unmounts). |
| `.t3d-chip` | 597-603 | `transition: transform 160ms ease, box-shadow 160ms ease`; hover `translateY(-1px)` |
| `.reduce-motion *` and `prefers-reduced-motion` | 489-503 | `transition-duration 0ms; animation-duration 0ms; animation-iteration-count 1` |

Framer-driven timings outside CSS: hand card layout 200 ms (`HandTray.tsx:66`), mat card `layout="position"` 200 ms (`Mat.tsx:69`), DecisionDock 220 ms, GameOver card 300 ms (`GameOver.tsx:16`), emote bubble spring default (GameScreen :199), one button `whileTap scale 0.97` (`Strip.tsx:55`), lobby countdown panel `y 8` fade, lobby color fan `rotate (i−2)×9°, y −6 when on, opacity 0.35 when off` (`Lobby.tsx:37`).

### 3.4 Hover and zoom

- `lib/hover-store.ts`: `setHover(id, delay = 380)` sets after **380 ms**; `setHover(null)` clears immediately (:9-20). Store outside React so hover never re-renders the board.
- `HoverPreview.tsx`: fixed centered layer `z-[50]`, `md+` only; width `min(286, innerHeight × 0.62 / 1.4)` px (:14); in `opacity 0, scale 0.94 → 1` over **140 ms**, out **100 ms** (:19). Pointer events none; `showTapped=false`.
- `CardFace.tsx`: `onPointerEnter/Leave` drive hover when `hoverable` (:164-165); `Z`/`z` key or right-click → `onZoom` (:128-139); Enter/Space → activate; interactive cards `hover:-translate-y-1` (:177). P/T chip `bottom-[3%] right-[4%]` font `max(10, width × 0.11)`, red when damaged showing `toughness − damage` (:185-192); commander crown `right-[3%] top-[3%]` size `max(10, width × 0.12)` (:193-197); counters as dice (`CounterDice.tsx`: die size `max(12, width × 0.2)`, d6 pips up to 6 then a numbered chip; `+1/+1` lichen, `loyalty` brass, `-…` destructive, else primary).
- `CardZoom.tsx`: Dialog `max-w-xl`, card at **240 px** + "What it can do now" option list (click chooses and closes) (:38-56).
- `PanelTab.tsx`: shows the hovered-or-zoomed card at `width = panelCardH / 1.4` (300/1.4 ≈ 214 px), name, types · P/T · keywords, placeholder note, options, draw-odds stub line (:12-31).

---

## 4. Lobby.tsx (175 lines)

**Seats** (:19-27): `Seat { kind: 'you'|'human'|'ai'|'open', name, deck, colors[], mat, ready, level? }`. INIT: 0 Rob (you, Faerie Flock, UW, highland, ready); 1 Friend (human, Dwarven Guard, RW, felt, ready); 2 AI 2 (ai, Phyrexian Proliferate, WUBG, cloud, ready, level Steady); 3 Open seat (not ready).

**Quadrant layout** (:73, :91-96): `grid grid-cols-1 gap-3 sm:grid-cols-2` with render order `[1, 2, 3, 0]`, i.e. seat index 1 top-left, 2 top-right, 3 bottom-left, **you (seat 0) bottom-right** ("2·3 over 4·1"). Each seat is a `motion.section layout` card `rounded-2xl border bg-card p-4`, `borderTop: 4px solid seatColor(i)`, `ring-2 ring-primary/40` for yours, mat art at `opacity-25` behind (:96-97).

**Seat card contents, in order** (:99-131):
1. Header row: seat number badge (24 px circle in seat color) · name (`font-display text-lg`, "You" for yours) · for seat 0 a brass pill "👑 host · starts" · for AI a tag "AI · {level}" · right-aligned status text `waiting` / `ready` / `not ready` (:99-105).
2. Open seat: buttons **Invite Nina** and **AI · Gentle / Steady / Sharp** (:106-112). An invited human arrives `ready: false`; an AI arrives `ready: true`.
3. Filled seat: `ColorFan` (:115; editable only for you), then a 2-column grid of **Deck** select (editable for you and AI seats) and **Mat** select (you only) (:116-125), then a button row: **Ready / Mark ready** toggle (you only; toggling also clears the canceled flag), **Simulate ready** (prototype, on an un-ready human), **Free seat** (any seat that is not yours) (:126-130).

**Color fan** (:29-43): five fixed buttons W U B R G in a `h-10 w-[150px]` strip, each `h-9 w-7 rounded-md border-2 border-card`, `left: i × 24`, `rotate (i − 2) × 9°`, selected ones lift `y −6` at opacity 1, unselected opacity 0.35; colors from `MANA_COLORS` (`derive.ts:191-198`: W `48 60% 86%`, U `205 70% 52%`, B `260 10% 26%`, R `6 72% 52%`, G `135 45% 38%`, C `30 6% 62%`). Cosmetic (HANDOFF :53).

**Die** (:137-139): decorative `h-14 w-14 rounded-2xl` button at the grid center (`absolute left-1/2 top-1/2`), hidden below `sm`, shows a d20 roll, title "Decorative. The host seat starts."

**Header** (:80-89): zone-label "New table", h1 "Rob's table", rules pill "Bracket 3 · 40 life · normal pace · coach on" with **Edit**.

**Host rules dialog** (:160-172): title "Host rules", description "Only the host edits these. Changing them clears everyone's ready."; Bracket 1-5, Starting life 20/30/40, Pace relaxed/normal/quick, Coach allowed switch, Spectators allowed switch; **Save rules** un-readies every human seat (:170).

**Countdown** (:54-70, :142-155): `allReady = every seat is not open and ready`. When all are ready, the canceled flag is clear and no count is running → `count = 10`; ticks every 1000 ms; at 0 writes the four mats into prefs, loads the `demo` scenario and navigates to `/game`. Any seat becoming un-ready clears it. Panel: primary-filled `rounded-2xl p-4`, big `font-callout text-5xl` number, copy "Everyone is ready. The table opens on its own; you go first.", **Cancel** button (sets the canceled flag). Otherwise a dashed panel: "The table opens 10 seconds after every seat is ready. Fill the open seat with a friend or an AI." or, after a cancel, "Countdown canceled" (the prototype spells it the British way) with **Start it again**, plus "Leave lobby" link. `role=timer aria-live=polite`.

**No Start/Launch button** anywhere (HANDOFF :13; file header :2).

**Conflicts with the instruction set's Phase 1:**
- **Seat placement.** Prototype: you (seat index 0) bottom-right, order `[1,2,3,0]`. PR 1a: seat 1 top-left, seat 2 top-right, seat 3 bottom-left, seat 4 bottom-right, with the avatar in the **outer** corner. The prototype has no avatar slot; its seat badge sits at the inner-left of the header regardless of quadrant.
- **Control order.** Prototype: color fan → deck + mat side by side → Ready. PR 1a: Choose Deck → Settings ▾ (mat, zoom, sleeve, profile, exit, host-only Game settings) → Ready Up, with gray prerequisite footnotes under Ready. The prototype has no prerequisite gating (Ready is always clickable, deck is pre-filled) and no Settings menu; the mat picker is a bare select.
- **Countdown trigger.** Prototype: countdown starts when every non-open seat is ready, including AI seats which are ready by construction; practically that is "the last human's Ready", which agrees with D6/PR 1c. But the prototype also requires no open seats (an open seat blocks forever) and says "you go first"/"host · starts", which is the die/host-starts language PR 1c removes. Cancel is available to the viewer with no host check; **Start it again** after a cancel is a prototype-only affordance (PR 1c: a guest's un-ready clears the countdown; re-ready restarts it).
- **Host rules Edit** (bracket, life, pace, coach, spectators) has no counterpart in the instruction set; PR 1d adds a host-only Game settings pop-up with only the scene picker. Bracket/life/pace are not table fields in the repo.
- **Invite** is a fixed "Invite Nina" stub; the repo has Invite / New link + Withdraw.
- **AI level** labels Gentle / Steady / Sharp are prototype-only; the repo's seat `pilot` is `house`/`claude`/`human` with a `level` string.
- **Table chat** aside (340 px column) and the home page's public chat: D17 says chat is not built.
- **Color fan** is manual and cosmetic; PR 1a derives it from `C.catalog.exact(commander).colorIdentity`.

---

## 5. Right pane and derived figures

### 5.1 `RightPane.tsx` (65 lines)

`aside flex h-full min-w-0 flex-col bg-card/80` (:27). Top: `HandCounts`. Tab strip `role=tablist` `text-[12px]` with tabs **Turn Resources, Panel, History, Tracker, Combat, Chat** (:14-21), `⋯` menu with per-tab options (Resources: Group by type / Lands first; History: Show quiet steps; Panel: Show draw odds; Combat: Pin stack here; all: Hide pane) and an X Hide button (:38-53). Body `overflow-auto p-3 role=tabpanel` (:55-62). Active tab stored in `prefs.paneTab` (default `resources`).

### 5.2 Tabs

- **HandCounts** (`HandCounts.tsx`): "Cards in hand" zone-label, 2-column list of seat dot + "You"/name + `zones.Hand.count` mono; out players at opacity 0.5. The only place other players' hands exist in the UI (:1-2).
- **ResourcesTab** (`ResourcesTab.tsx`): computes `lands = my Battlefield cards with type Land`, `untapped = lands not tapped` (:10-11); `sources = options with act activate-mana | undo-mana`; `plays = options with act cast | activate` grouped by `primaryType(card)` or (Lands first mode) `play-land → "Lands" else "Spells"` (:12-20). Sections: **Mana pool** (chips of color dot + amount from `me.mana`, "Empty"), line "Lands {untapped} untapped of {n} · land drops used {landsPlayed}"; **Mana sources** (buttons, "None offered right now."); **Playable now** (grouped buttons `#index label detail`, "Nothing offered. The room decides what is playable.").
- **PanelTab**: see 3.4.
- **HistoryTab** (`HistoryTab.tsx`): `view.history` filtered by `historyBand || mark !== 'quiet'`; `mark 'turn'` rows `mt-3 font-display font-semibold`, `quiet` rows `text-xs italic muted`, `end` rows `font-semibold text-destructive`; "Nothing has happened yet."; aria "History, newest first".
- **TrackerTab** (`TrackerTab.tsx`): per player card with `borderLeft 4px seatColor`: name, life `font-mono text-lg`, 4-column counts Hand / Library / Graveyard / Exile, line "poison N · cmdr dmg max N · status".
- **CombatTab** (`CombatTab.tsx`): "No combat right now." or "{attacker} is attacking." + per attack: attacker name + P/T, "→ {defender or planeswalker name} · blocked by A, B | unblocked"; pinned StackPanel when `stackPinned`.
- **ChatTab**: `ChatPanel` (in-memory stub, `state/chat.tsx`; EMOTES `GG nice oops thinking salt hype`; 60% chance of a canned reply after 1400 ms; mute per sender).

### 5.3 `game/derive.ts` (211 lines): every derived figure

| Export | Line | Formula |
| --- | --- | --- |
| `PHASES` | 5-8 | the 13 phase ids |
| `phaseLabel(p)` | 16-18 | labels table :10-15; `null` → "Opening hand" |
| `RIBBON` | 21-29 | 7 groups (see 2.8) |
| `seatColor(i, alpha)` | 32-34 | `hsl(var(--seat-{i mod 4}) / alpha)` |
| `ordinal(n)` | 36-40 | 1st/2nd/3rd/nth |
| `player(view, id)` | 42-45 | lookup in `state.players` |
| `seatIndexOf('s2')` | 47-51 | 2 |
| `displayName(view, id)` | 53-57 | "You" for `view.seat`, else `name`, else "Seat n+1", null → "—" |
| `visibleName(c)` | 60-63 | `faceDown ? faceDownName ?? null : name` |
| `a11yCardName(c)` | 64-68 | "{name} (face down)" / "Face-down card" / "Hidden card" |
| `turnLabel(view)` | 70-76 | "Turn {n} · You (your {ordinal(yourTurn)})" / "Turn {n} · {name}" / "Opening hand" |
| `isPriority(d)` | 78-80 | `kind === 'priority' || title === 'Your priority'` |
| `passOption(d)` | 82-85 | option with `act === 'pass'` |
| `oneButton(view)` | 94-114 | label/hint/kind (see 2.8) |
| `locationMap(view)` | 117-125 | `cardId → {owner, zone, card}` across all players' zones |
| `findCard(view, id)` | 127-130 | via locationMap |
| `optionsByCard(d)` | 133-143 | `cardId → options[]` (the only source of "castable now") |
| `TYPE_ORDER`, `primaryType(c)` | 145-151 | first of Creature, Planeswalker, Land, Instant, Sorcery, Artifact, Enchantment, Battle present in `types`, else `types[0]` |
| `isBasic`, `basicOrder` | 153-160 | Plains, Island, Swamp, Mountain, Forest, Wastes |
| `splitBattlefield(cards)` | 163-173 | `lands` = Land and not Creature; `nonlands` = creatures first, then the rest |
| `landPiles(lands)` | 176-189 | basics grouped by `name:tapped`, sorted WUBRG then untapped first; nonbasics alone |
| `MANA_COLORS` | 191-198 | W/U/B/R/G/C label + hsl |
| `relativeSeats(view, focus)` | 200-204 | player ids rotated so `focus` is first |
| `fmtTime`, `fmtDate` | 206-211 | `toLocale…('en-US', …)` |

**Overlap with Counterintelligence (Section 6 of the instruction set):** none of the spec's rows exist. The prototype computes no creature counts, power sums, keyword counts, flying power, potential attackers, planeswalker loyalty totals, open mana, or oracle-text categories. The nearest figures are: untapped-land count for the viewer only (`ResourcesTab.tsx:10-11`), per-seat hand counts (`HandCounts.tsx:15`), per-seat zone counts and poison/commander-damage max (`TrackerTab.tsx:12-14`), combat attack rows (`CombatTab.tsx:16-24`), and the callout detector's threshold checks (poison ≥ 10, commander damage ≥ 21, life delta ≤ −10, `callouts.ts:104-117`). `splitBattlefield` and `primaryType` are reusable building blocks for a creature filter. Not found: anything using `keywords` beyond display, anything reading `counters.loyalty` beyond the +N callout and die tint.

---

## 6. Settings, prefs, keyboard, sound

### 6.1 `state/prefs.tsx` (136 lines)

Storage: **one localStorage key `crankmagic-play:prefs:v1`** holding the whole `Prefs` JSON (:70, :110-113); `document.documentElement.dataset.theme = prefs.theme` and class `reduce-motion` toggled (:112, :116-118). `reduced = prefs.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)')` (:100-115). Migration: old `layout 'grid' → 'table'`, `'full' → 'focus'` (:89-92).

| Field | Type / range | Default | Set from |
| --- | --- | --- | --- |
| `theme` | `moss`/`brass`/`felt`/`steel` | `moss` | Settings, App menu |
| `reduceMotion` | bool | false | Settings "Reduce motion (also follows your system)" |
| `overlay` (callout intensity) | 0-100 step 1 | 70 | Settings "Callout intensity · N" |
| `sfx` | 0-100 step 1 | 60 | Settings "Sound effects · N" |
| `music` | number | 0 | never exposed (HANDOFF: music unimplemented) |
| `mute` | bool | false | Settings "Mute" |
| `cardSize` | 44-130 step 2 px | 74 | Settings and Layout menu "Card size · Npx" |
| `handScale` | 1-3 step 0.1 | 2 | Settings and Layout menu "Hand size · N.N×" |
| `stepByStep` | bool | false | Tools menu; Settings "Step by step (stop at every step)"; also sent as `{type:'prefer'}` |
| `holdPriority` | bool | false | Tools "Hold priority after casting" |
| `remindLand` | bool | true | Settings "Remind me to play a land before ending my turn" |
| `layout` | `focus`/`table` | `focus` | Layout menu, L key |
| `table3d` | bool | false | Layout menu, 3D door, floating pill |
| `preset` | `open`/`standard`/`full`/`custom` | `standard` | Layout menu presets (:64-68: open = no chairs/pane; standard = resources tab; full = chat tab, stack pinned, odds on) |
| `panes` | `{chairs, pane, hand, counter, historyBand, stackPinned, odds, callouts}` | all true except `stackPinned`, `odds` false | Layout menu checkboxes, pane ⋯ menu, H key |
| `sizes` | `{chairsH 110-360, paneW 260-560, handH 96-340, panelCardH}` | `{190, 340, 168, 300}` | dividers (drag, arrows 16 px / Shift 48 px, Enter or double-click resets, `Divider.tsx`) |
| `paneTab` | `resources`/`panel`/`history`/`tracker`/`combat`/`chat` | `resources` | tabs |
| `coach` | `{suggestUnowned, preferOwned, stayInBracket, length short|detailed, sees board-hand|board}` | `{false, true, true, 'short', 'board-hand'}` | CoachDrawer switches |
| `mats` | `Record<seat, matId>` | `{'0':'highland','1':'felt','2':'cloud','3':'felt'}` | Settings "Your mat" (seat 0), lobby mat select |
| `nameplates` | bool | true | Settings "Nameplates on placeholder art" |
| `termHover` | bool | true | App menu "Term definitions on hover" (no effect in code) |
| `handSort` | `drawn`/`type`/`name` | `drawn` | hand tray sort buttons |
| `resourcesGroup` | `type`/`land` | `type` | pane ⋯ menu |
| `savedLayout` | null or `{layout, panes, sizes, paneTab}` | null | Layout menu Save/Restore |

### 6.2 `components/dialogs/SettingsPlay.tsx` (57 lines)

Dialog "Settings › Play" / "Saved on this device.", `max-w-2xl`, body `max-h-[68vh]`. Sections: **Theme** (4 swatch cards, 3-band swatch each); **Your mat** (9 mats, 3/5 columns, 48 px preview); **Motion & sound** (Reduce motion switch, Callout intensity slider, Sound effects slider, Mute switch); **Table** (Remind land switch, Step by step switch, Nameplates switch, Card size slider, Hand size slider). Everything is a slider or switch; no stepped size pickers (consistent with `feature-wiring`).

### 6.3 Keyboard (`GameScreen.tsx:80-99`, `KeyboardHelp.tsx:4-7`, `CardFace.tsx:128-139`, `Divider.tsx:30-39`)

Ignored while the target is inside `input, textarea, [contenteditable], [role=dialog], [role=menu], [role=slider]` or with Meta/Ctrl/Alt (:84-85).

| Key | Action |
| --- | --- |
| N, Space (not on a button) | the one button (`pass()`) |
| H | toggle hand tray |
| 1-4 | focus that seat (if present) |
| C | Coach drawer |
| L | cycle layout focus → table |
| ? | Keyboard help ("Keys never fire while you type.") |
| Esc | focus your own seat |
| Enter / Space on a card | activate |
| Z on a card, right-click | zoom |
| Arrows on a divider | resize 16 px (Shift 48); Enter resets; double-click resets |

### 6.4 `lib/sound.ts` (58 lines)

WebAudio synth only, no files. Unlocked by the first `pointerdown`/`keydown` on window (:10-18). `setSound(sfx, mute)` → `volume = sfx/100` (:20-23). `play(cue)`: one oscillator, frequency exponential ramp `f → f2` over `dur`, gain `0.0001 → 0.08 × volume` in 10 ms then back to `0.0001` at `dur`; stop at `dur + 0.02` (:39-58). CUES `[f Hz, dur s, type, f2 Hz]` (:25-37): draw 660/0.08/triangle/880; land 180/0.12/sine/120; arrive 440/0.14/triangle/660; leave 330/0.16/sine/160; life 520/0.18/sine/780; attack 140/0.2/sawtooth/90; turn 392/0.22/triangle/523; end 262/0.4/triangle/392; die 900/0.05/square/600; shield 1046/0.25/sine/1318; sword 220/0.12/square/110. Only `sword, shield, life, turn, end, draw` are ever fired (`state/game.tsx:69-73, :99`); `land, arrive, leave, attack, die` are defined and unused.

---

## 7. Theme and look

### 7.1 `index.css` tokens (lines 74-228)

Fonts (:1, :127-129, :62): display **Fraunces** (opsz 9-144, 300-700), body **Outfit** (300-700), callout **Barlow Condensed** (600, 800, 800i), numbers **JetBrains Mono** (400, 600). `.font-display` = serif with `letter-spacing -0.01em` (:257-261); `.zone-label` = Fraunces italic 11 px muted (:265-271); body `font-feature-settings 'ss01','cv11'` (:244-247).

Radius `--radius: 0.7rem` (:130); sm/md/lg/xl = radius −4 / −2 / 0 / +4 px (:64-67). Shadows (:131-141): `--shadow-sm 0 1px 2px hsl(150 20% 20%/0.08)`, `--shadow 0 2px 8px …/0.08`, `--shadow-md 0 6px 18px -6px hsl(150 25% 18%/0.18)`, `--shadow-lg 0 14px 40px -12px …/0.24`, `--shadow-xl 0 22px 60px -18px …/0.3`, `--shadow-2xl 0 30px 80px -20px …/0.34`, `--card-shadow 0 1px 2px hsl(150 30% 12%/0.22), 0 6px 14px -6px hsl(150 30% 12%/0.3)`.

Seat colors (:122-125, identical in all themes): `--seat-0: 168 55% 32%` (teal), `--seat-1: 10 68% 52%` (coral), `--seat-2: 256 42% 54%` (iris), `--seat-3: 38 82% 46%` (saffron). Hearts use `--seat-1` for the red.

| Token | Moss & Iron (default) :74-150 | Brass & Slate :152-176 | Felt & Cream :178-202 | Steel & Cobalt :204-228 |
| --- | --- | --- | --- | --- |
| background | 96 22% 95% | 36 30% 94% | 44 46% 95% | 214 26% 95% |
| foreground / ink | 210 18% 15% | 215 22% 17% | 150 30% 13% | 222 30% 15% |
| border | 100 12% 84% | 34 18% 82% | 44 22% 82% | 214 18% 83% |
| card | 90 30% 98% | 40 40% 98% | 46 60% 98% | 214 40% 98% |
| primary | 158 42% 28% | 212 24% 30% | 152 48% 24% | 222 62% 40% |
| primary-fg | 90 40% 97% | 40 40% 97% | 46 60% 97% | 214 40% 98% |
| secondary | 100 16% 89% | 36 22% 88% | 44 30% 88% | 214 22% 89% |
| muted / muted-fg | 100 14% 90% / 210 10% 38% | 36 20% 89% / 215 12% 38% | 44 28% 89% / 150 12% 34% | 214 20% 90% / 220 12% 38% |
| accent / accent-fg | 72 62% 80% / 150 40% 14% | 40 70% 78% / 30 50% 16% | 152 40% 84% / 152 48% 14% | 200 70% 84% / 222 60% 18% |
| destructive | 4 68% 46% (moss only; inherited) | | | |
| ring | 158 42% 34% | 40 62% 40% | 152 48% 30% | 222 62% 46% |
| input | 100 10% 78% | 34 14% 76% | 44 18% 76% | 214 14% 77% |
| felt / felt-2 | 120 16% 88% / 96 24% 93% | 210 14% 86% / 36 26% 92% | 150 26% 84% / 44 40% 93% | 214 20% 87% / 214 30% 93% |
| brass | 40 62% 46% | 38 70% 42% | 32 64% 44% | 200 60% 40% |
| lichen | 72 70% 46% | 38 80% 48% | 152 52% 38% | 196 80% 44% |

Theme swatches for pickers (`AppNav.tsx:19-24`): moss `96 22% 95% / 158 42% 28% / 72 70% 46%`; brass `36 30% 94% / 212 24% 30% / 38 70% 42%`; felt `44 46% 95% / 152 48% 24% / 32 64% 44%`; steel `214 26% 95% / 222 62% 40% / 196 80% 44%`. `.dark` only overrides background/foreground (:230-233) and is never applied.

Surfaces: `.felt` (:284-290) = felt color + 5 px dot grain `radial-gradient(ink/0.035 1px, transparent 1.2px)` + top wash `radial-gradient(120% 90% at 50% 0%, card/0.55, transparent 60%)` (the game root background). `.table-air` (:279-283) radial felt-2 glow (unused). `.mat-art img` at `opacity 0.62` with a `card/0.18 → card/0.42` top-to-bottom veil (:302-313). `.grain::before` SVG fractal noise at 0.05 (:315-323, unused). `.card-back` (:359-365): radial lichen/0.35 center dot + `repeating-conic-gradient` primary/0.92 and /0.78 every 10°, `3px solid card/0.9` border, with the wand mark centered at `width × 0.36` (`CardBack.tsx`).

### 7.2 Brand

- `Logo.tsx`: `WandMark` SVG 32×32 (a 3 px stroke wand from (6,26) to (19,13), a four-point spark polygon at (22,4)…(16,10), two faint dots) (:4-13); `Logo` = 28 px primary rounded square holding the mark in lichen + "Crank*Magic*" in Fraunces 17 px (:15-28).
- `AppNav.tsx`: links Decks `#decks`, Library `#cards`, Explore `#discover` on `https://staging.crankmagic.com/`, Play as a primary pill; "Rob's menu" dropdown with Settings, backup/restore/reset stubs, Help & glossary, Term definitions on hover, Take a Tour, Send Feedback, Show a QR code, theme grid.
- `AppFooter.tsx`: Fan Content Policy paragraph (:18) and links Fan Content Policy, Scryfall, EDHREC, License, Disclaimer, Third-party notices, Privacy, Terms, Contact.

### 7.3 Assets

- `public/assets/mats/`: `birch-lake.jpg`, `cloud-sea.jpg`, `glyph-dunes.jpg`, `highland-mist.jpg`, each JPEG 1024×1024 (109-192 KB), "generated for this project" (HANDOFF :91). `lib/art.ts:54-64` MATS: 5 CSS-drawn (`felt`, `lichen` 45° lichen stripes, `ironlines` 22 px grid, `brassring` radial brass rings, `dawn` 160° warm-to-cool wash) + 4 artwork (`highland` Highland Mist, `cloud` Cloud Sea, `dunes` Glyph Dunes, `birch` Birch Lake). The repo already has 30 mats under `assets/playmats/`; these four are extra candidates only.
- `public/assets/cards/`: `valkyrie.png` 744×1039, `colossification.jpg` 716×1000, `opt.jpg` 672×936, `ugin.jpg` 716×1000. Every other card name hashes (FNV-1a, `art.ts:19-26`) to one of the four; shown `object-contain` uncropped. Not for the repo (Scryfall images exist there).
- `public/favicon.svg`, `robots.txt`.

### 7.4 `attached_assets/` screenshots (viewed)

| File | Shows |
| --- | --- |
| `image_1791787125617.png` | A `life-loss` callout: broken-heart glyph + red neon "LIFE -1" with a dark pill "AI 3 · 40" beneath, on the felt dot grain. |
| `image_1791787188400.png` | A `life-gain` callout: green heart + "LIFE +1", pill "AI 3 · 41". |
| `image_1791787245683.png` | Two callouts at once: a faded yellow "YOUR TURN" (trophy) above a red "LIFE -5" with "Friend · 16" (the overlap Rob objected to; led to the one-at-a-time rule). |
| `image_1791787329355.png` | Worse overlap: red "LIFE -1 / You · 41" drawn over yellow "YOUR TURN", with a green "LIFE +1 / AI 3 · 44" below. |
| `image_1791787424903.png` | Crop of an earlier center counter: four rounded life tiles (1, 38, 44, 41) in seat-colored outlines around a round green wand button, over a mat corner with a card. |
| `image_1791787881685.png` | A viewed mat at a large size: "● You ♥ 39" header, a single column of four placeholder cards (Opt, Colossification, Ugin, Ugin) down the left, and a land row with a "×6" pile plus two singles at the bottom left; the rest of the mat empty. Shows the permanents grid collapsing to one column. |

---

## 8. Data

### 8.1 `data/sample-views.json` (600 KB, `CrankMagicSampleViews@1`)

42 views of seat s0 across one 60-turn game (seed 7, 257 decisions in the game, 42 kept), `matchId "sample-7"`, `state.schema "CommanderProbeProjection@1"`. Decks: s0 Proft, Consulting Detective; s1 Geist of Saint Thalia; s2 Yoshimaru, Scrappy Stray; s3 Bofur, Reliable Guardian // Concerted Care. Revisions 1 … 771; turns 0 … 60; combat present in 5 views; result only in the last (`every person had left the game, so it ended there`).

Field coverage found (profiled with Python):
- view: `schema, protocol, matchId, seatId, seat, revision, status, result, departures ({} always), seats[{seatId,name,pilot: human|house,level}], waitingOn, decision, state, history`; plus `yourTurn` on many views. **Absent in the sample: `continuing`, `stepByStep`.**
- state: `schema, viewerSeatId, turn, turnPlayerId, priorityPlayerId, phase (9 of 13 ids appear; never UNTAP, DRAW, FIRST_STRIKE, CLEANUP), players, combat, stack, stackSize, gameOver`.
- player: `playerId, name, life, health{life, poison, status active|lost, lossReason, commanderDamageMax, commanderDamage}, counters, mana[], landsPlayed, zones{Library,Hand,Battlefield,Graveyard,Exile,Command}{count, hiddenCount, cards}`.
- card: `cardId, name, faceDown, faceDownName, owner, controller, tapped, damage, counters, types, power, toughness, keywords, commander, commanderKey`. **Absent: `token`** (the repo projection carries it). `faceDownName` is present here but is not in the repo's projection list (instruction set 2.1). Counter kinds seen: `-0/-1`, `stun` only (no `loyalty`, no `+1/+1`). Types seen: Enchantment, Creature, Sorcery, Kindred, Instant, Artifact, Land (no Planeswalker, no Battle). Keywords seen: Flying, Annihilator, Flash, Deathtouch, Convoke, Multikicker, Partner with, Reach, Prowess, Hideaway, Lifelink, Defender, Hexproof, Vigilance, Trample.
- stack: `stackId, abilityId, cardId, name, faceDown, playerId, kind spell|ability|trigger, stage waiting|resolving, targets[{kind:'object', id}]` (answers the 4b assumption: target entries are `{kind, id}` with kind `object` in this sample).
- decision: `id, title, mode one|boolean|many|order, min, max, kind (priority or absent), cost, exclusiveBy, options[{index,label,cardId,act pass|cast|play-land|activate-mana|undo-mana,detail,defenderId,endsTurn,targets,key,…}]`. No damage/amount/ack/index modes in the sample (synthetic only).
- history: `{turn, text, mark?: turn|quiet}`, **oldest-first** in the file; `adapter.ts:37-41` reverses it.

Versus the repo view contract (instruction set 2.1): same top-level shape; repo adds `token` per card, `continuing?`; sample adds `faceDownName`, `yourTurn`, `protocol`, `schema`, `state.schema`, `state.viewerSeatId`.

### 8.2 `game/types.ts` (211 lines)

`ZoneName`, `Phase` (13), `CardView` (adds optional `level`, `monstrous`, `prepared`), `Zone`, `Health`, `PlayerView`, `StackEntry`, `CombatAttack{attacker, defender, planeswalker?, blocked, blockers[]}`, `CombatView{attackingPlayerId, defenders[], attacks[]}`, `GameState`, `DecisionMode` (8), `DecisionOption` (open), `Decision{…, requires[{by, values, least, why}], capped{by, most, why}, budget, total, minEach, divide, overrideOrder}`, `SeatInfo`, `HistoryLine`, `GameResult`, `RoomView` (+ `__synthetic`, `__spectator`), out-frames `{type:'view'} | AnswerFrame{type:'act', actionId, revision, kind:'answer', choiceId, indices?, amounts?, hold?} | {type:'prefer', stepByStep}`, in-messages `view | receipt | refused{status 400|409|422|500, error, view, of?} | away{seatId, until}`.

### 8.3 Demo script (`game/demo-script.ts`, 683 lines) — a usable motion/event fixture

Starts from `FIXTURES[7]` (rev 91, turn 13) reshaped (:44-75): your hand = Command Tower, Soul of New Phyrexia (Trample), Faerie Formation, Opt, Colossification, Ugin, the Spirit Dragon; AI 2 gains Garruk's Packleader 4/4; phase UPKEEP, you have priority, `yourTurn 4`. Emissions carry a `delay` (ms) before the frame.

Sequence it plays (branches depend on your answers):
1. **Your turn 13**: UPKEEP → pass = "Draw" (phase DRAW, a card from `DRAW_POOL` Valkyrie Harbinger 4/5 Flying Lifelink → Island → Opt → Faerie Formation 5/4 Flying → Island) → MAIN1: play-land, activate-mana (taps, mana pool), undo-mana, cast. `cast Opt` → stack → scry decision (`many 0-1`) → bottom/top → draw (delay 520). `cast Colossification` → **AI 2 responds with Swan Song** (delay 700, stack grows while non-empty = `response` callout) → pass → "Colossification was countered by Swan Song" (history regex `countered`). Other casts resolve after 650 ms.
2. MAIN1 pass → COMBAT: with untapped creatures, **Declare attackers** (`many`, `exclusiveBy: 'cardId'`, one option per attacker × opponent "A → Name") → blocks by AI (delay 700) → **Assign N damage** (`damage` mode with `lethal` and a trample defender row) → COMBAT_DAMAGE frame with "dealt", "went to the graveyard", "X: a → b life", "You gained N life" lines → MAIN2 (delay 900). With none, a `quiet` history line and straight to MAIN2.
3. MAIN2 → END_OF_TURN (pass option `endsTurn`) → **opponent turns** (:508-...): Friend: UPKEEP draw (0) → MAIN1 "Friend played Island" (650) → "Friend cast Spectral Sailor" 1/1 Flying Flash + "resolved" (650). AI 2: UPKEEP (650) → attacks you with Garruk's Packleader → **Declare blockers** (`many`, delay 700) → damage (blocked: blocker dies if ≤ 4; unblocked: "dealt 4 to Rob", life line, delay 600) → MAIN2 "AI 2 gained 3 life" (650). AI 3: UPKEEP → "AI 3 created 2 Soldier tokens" (650; `tokens` callout) → **ack** "AI 3 revealed the top card of their library: Sol Ring" (650).
4. **Your next turn**: UNTAP (all untapped, landsPlayed 0, `yourTurn+1`) → UPKEEP **amount** decision "Sigil of Growth (demo trigger): distribute three +1/+1 counters among your creatures" (`total 3, divide`) (delay 500) → `counters` callouts → loop.

### 8.4 Synthetic scenarios (`game/synthetic.ts`, 161 lines)

`bigBoard` (FIXTURES[35]/rev 661 padded to 70/60/60/60 permanents with token-like Goblin/Soldier/Spirit/Thopter/Saproling/Clue/Treasure/Zombie 1/1s, every 5th tapped, every 7th with +1/+1 counters); `twoSeat` (rev 91, seats s0+s2); `threeSeat` (rev 211, drops s3); `deepStack` (rev 451 + 250 Intruder Alarm triggers, priority with `resolve-all count 250`); `damageMode` (rev 100, "Assign 7 damage": Walking Bulwark lethal 3, Bofur lethal 2, "AI 2 (trample)" defender); `amountMode` (rev 211, "Distribute four +1/+1 counters"); `ackMode` (rev 391, "AI 3 revealed Sol Ring…"); `indexMode` (rev 391, "Choose a color" W/U/B/R/G); `constrainedMany` (rev 601 + `capped {by:'cardId', most:1, why:'Each permanent can pay only once.'}`, `budget 2`); `endedForEveryone` / `conceded` (finished views with `mark:'end'` history lines); `spectatorProjection`.

Mock refusals (`game/adapter.ts:131-173`, copy worth keeping): 409 "The game is over. Nothing more can be chosen." / "It is not your decision right now. Wait for the table to come back to you." / "The board changed. Review the refreshed choice and try again."; 400 "That answer named an option that does not exist." / "Choose exactly one option." / "Put every option in order, each once." / "Give every option a number."; 422 "Choose {n} options; you chose {m}." / "{X} can be chosen only once. Pick one of its options." / "Assign exactly {total}; you assigned {sum}." / "Each option needs at least {minEach}." / "Assign lethal damage to each blocker before any tramples over to the player."; 500 "The engine failed on that action; nothing changed. Try it again." Reconnect backoff 1 s → 2 s → 4 s, cap 10 s, then `{type:'view'}` (:248-266). Playback label "Playback · recorded view n of N" (:67).

---

## 9. SALVAGE TABLE

Format: **Port:** what, from where → PR. **Do not port:** what and why. **Conflict:** what the instruction set must resolve.

### Phase 1: lobby

**1a `lobby-seat-sequence`**
- Port: the seat card look: `rounded-2xl border bg-card p-4`, `borderTop: 4px solid seatColor`, mat art backdrop at `opacity-25`, own seat `ring-2 ring-primary/40` (`Lobby.tsx:96-97`) → as CSS values for `.cm-lobby-seat`, if the wireframe-pinned 5:7 card allows.
- Port: the status word set `waiting / ready / not ready` and the AI tag "AI · {level}" (`Lobby.tsx:103-104`) → footnote and header wording.
- Port: color-fan geometry: 5 wedges `h-9 w-7 rounded-md border-2`, `left i×24`, `rotate (i−2)×9°`, on = `y −6, opacity 1`, off = `opacity 0.35`, MANA_COLORS hsl set (`Lobby.tsx:29-43`, `derive.ts:191-198`) → the fan drawn from `colorIdentity` (only identity colors drawn, or all five with off-state dimming; pick one).
- Do not port: `order [1,2,3,0]` / you bottom-right; the host "host · starts" pill; the decorative die; the manual fan toggles; the deck+mat side-by-side selects; "Simulate ready"; "Free seat" on others. All contradicted by 1a's header/outer-corner/avatar spec and Choose Deck → Settings → Ready order.
- Conflict: the Replit brief (2026-10-12) and `.agents/memory/play-scope.md` said "you bottom right"; 1a says seat 1 top-left with you wherever your seat number puts you. 1a wins (newer); say so in the PR body.

**1b `lobby-deck-loading`**
- Port: nothing structural (the prototype's deck picker is a plain `<Select>` of four names, `Lobby.tsx:117-120`). The DECKS names (`data/home.ts:28`) are fixture labels only.
- Do not port: the select.

**1c `lobby-no-launch`**
- Port: countdown behavior and copy: 10 → 0 at 1000 ms ticks (`Lobby.tsx:60-70`); the panel look (primary fill, `font-callout text-5xl tabular` number, Cancel pill); copy "Everyone is ready. The table opens on its own" (drop "; you go first"); the waiting-state copy "The table opens 10 seconds after every seat is ready. Fill the open seat with a friend or an AI." (`Lobby.tsx:143-153`); `role=timer aria-live=polite`. Spell it "canceled" if the post-cancel line is kept (`Lobby.tsx:151` uses the British spelling).
- Port: the rule that AI seats count as ready by construction (`INIT` ai `ready: true`, AI pick sets `ready: true`, `Lobby.tsx:25,110`) → "AI seats never hold it".
- Do not port: viewer-side Cancel without a host check; "Start it again" after cancel (1c: re-ready restarts it); the open-seat-blocks-forever rule (1c refuses the last Ready with the unfilled-seat instruction instead).
- Conflict: none beyond the above; prototype and D6 agree there is no Start button.

**1d `table-scene`**
- Port: nothing. The prototype has no scene concept; its four mats are per-seat art, not a table background.
- Do not port: `prefs.mats` per seat (the repo's `cm-mat` is per seat already).

**1e `lobby-avatar-and-play-settings`**
- Port: the Settings › Play section structure and labels: Theme swatches (3-band swatch cards), "Your mat" grid with 48 px previews, "Motion & sound" (Reduce motion "(also follows your system)", Callout intensity 0-100, Sound effects 0-100, Mute), "Table" (Remind land, Step by step, Card size 44-130 step 2 labeled "Card size · Npx", Hand size 1-3 step 0.1 labeled "Hand size · N.N×") (`SettingsPlay.tsx:16-52`) → the Play card's slider labels and ranges (tilt/zoom are new).
- Port: pref defaults worth reusing: cardSize 74, handScale 2, handH 168, paneW 340, chairsH 190, overlay 70, sfx 60 (`prefs.tsx:35-62`) → starting values for the new keys.
- Do not port: the single-JSON-blob storage key `crankmagic-play:prefs:v1` (the repo uses per-setting keys and `preferences` commits); `termHover`, `nameplates`, `coach.*`, `music` (unused).
- Conflict: none.

**1f `pre-lobby-home`**
- Port: the page frame and proportions: `max-w-[1400px] px-5 pt-8 pb-16`, hero grid `lg:grid-cols-[1.5fr_1fr] gap-5`, sections `mt-10`, history `md:grid-cols-2 gap-3` (`PlayHome.tsx:42-43, :66, :113-115`).
- Port: the hero card: mat image at opacity 0.7 under a `card → card/0.85 → transparent` left-to-right gradient, `rounded-3xl`, `p-7 sm:p-9`, zone-label kicker, display h1 at `text-4xl/5xl leading-[1.05]`, italic primary emphasis, three pill buttons in the order primary / bordered / ghost (`PlayHome.tsx:44-57`) → New table (primary), Join by code, Rematch.
- Port: copy patterns: "Your table is still warm" (for the "Your seat is waiting" card), "Turn {n}. {name} is *thinking.*", "Pick up exactly where you left it".
- Port: history card content: result line, date right-aligned `text-xs muted`, "deck · N turns · seats" (`PlayHome.tsx:116-121`) → Recent games cards.
- Port: `fmtDate` with `'en-US'` (`derive.ts:209-211`), required by `feature-wiring`.
- Do not port: Open games list, access pills, filter chips, detail aside, Standing, public lobby chat, "Rematch last pod" query param (1f: "Open games, Standing and Table talk are not drawn").
- Conflict: none; 1f says "Build the layout as Replit had it".

### Phase 2: events and audio

**2a `board-events`**
- Port: the diff heuristics in `detectCallouts` as test ideas, not code (`callouts.ts:47-147`): your-turn (turnPlayerId flips to viewer), response (stack grew while non-empty), countered via history regex `/countered/i` (the repo has no such line, so 2a's structural rule replaces it), tokens via `/created (\d+) .*tokens?/i` (matches the repo's wording only if `history.mjs` uses "created"; verify), life deltas split by COMBAT_DAMAGE phase, fatal thresholds poison ≥ 10 / commander ≥ 21, battlefield → graveyard = `left`, counters +N on `+1/+1` and `loyalty`.
- Port: the `locationMap` idea (`derive.ts:117-125`): one `cardId → {owner, zone, card}` map per view makes every zone-move diff O(n).
- Port: the 6-flights-per-view and 6-callouts-per-view caps as a starting budget (`FlightLayer.tsx:91`, `callouts.ts:146`).
- Do not port: the regex-on-history approach as the primary signal; 2a's kinds are structural.

**2b `audio-bed-pool`, 2c `audio-combat-ramps`, 2d `audio-instant-layer`**
- Port: nothing. `lib/sound.ts` is an oscillator stub; the repo has a real pack. The cue → event mapping (`state/game.tsx:69-73`) is already covered by `momentsFor`.

### Phase 3: the board

**3a `board-stage-vendor`**
- Port: the "one canvas kept alive across redraws" is already the repo's `sea()` pattern; the prototype has no canvas. Nothing to port.

**3b `board-scenes`**
- Port: the `t3d-sky` horizon gradient `radial-gradient(70% 100% at 50% 100%, card/0.85, transparent 70%)` over the top 40% and the stage gradient `felt → card/0.6 at 30% → felt` (`index.css:582-587`) → a fallback/reduced-motion static frame behind the slab.
- Port: the `.felt` dot grain (5 px, ink/0.035) and the mat veil (`img opacity 0.62` + `card/0.18 → 0.42` gradient) (`index.css:284-313`) → mat texture treatment on the slab so cards stay readable.
- Do not port: the four mat JPEGs as scenes (they are mats, 1024², generated; the repo has 30 playmats).

**3c `board-3d-layout`**
- Port: the camera numbers as the **DOM-fallback/reference** values: `perspective 900px`, `perspectiveOrigin 50% 26%`, `rotateX(46deg)` with origin `50% 100%`, plane oversize `inset-x −9%, top −12%` (`Table3D.tsx:107-109`). D4 fixes tilt at 0-35° default 18°, so 46° is **not** the default; keep 26% as the horizon reference and consider whether `cm-board-tilt`'s top end should reach the prototype's 46°.
- Port: mat grid on the slab: `px-[10%] pt-6 pb-4 gap-3`, back row `30%` of depth (D3 says 25-30%), side/center split `24% / 1fr / 24%` (`Table3D.tsx:113`); chair card scale `cardSize × 0.72` (back) with floor 40 px (`:28`) → the back-row miniature card size; D3's "thirds" replaces the top/left/right split.
- Port: chair chip content and aria: seat badge, name, heart + life, skull when out, "Rotate the table to {name}'s board. Life N." (`Table3D.tsx:50-56`; `Chair.tsx:42`) → back-row mat name tag.
- Port: opponent life list = `CenterCounter` row (seat dot 6 px, name muted, life mono semibold, `gap-4 text-xs`) (`CenterCounter.tsx:14-21`) → the canvas top-left list.
- Port: top bar content = `Strip` left cluster: `turnLabel` ("Turn 13 · You (your 4th)") over phase label, and the one button's label grammar (`derive.ts:70-76, :94-114`) → 5.1's strip.
- Port: hand strip metrics: card width `min((height − 34)/1.4, 56 × handScale)`, row `items-end px-4 pb-2 gap-2`, playable lift `−8 px`, phone fan `5°` per card with `−45%` overlap (`HandTray.tsx:28, :52-67`); strip height default 168 px (close to 22 vh at 768) → the fixed hand band.
- Port: viewed-mat zone layout as a reference, then replace: prototype puts Command/Library/Graveyard/Exile in a 2×2 column on the **right** (`Mat.tsx:139-143`, `Piles.tsx:60-68`) and lands as a **bottom row** of piles with 6 px stagger; 3c wants piles along the near-left edge and lands as a left column. Keep: pile count badge style, `×N` pile badge, pile stagger 6 px, the `rows/cols` fill formula (`Mat.tsx:59-60`) for nonland rows.
- Port: `priority-ring` active light (`inset 0 0 0 2px seat, inset 0 0 28px -6px seat`, 600 ms ease-out fade-in, `index.css:569-578`) → the lit front mat / acting-seat cue.
- Do not port: the 750 ms rotateZ 28° swing (`Table3D.tsx:94-95`), the 650 ms rotateY 24° focus entrance (`GameScreen.tsx:169-171`), the 360 ms shared-layout walk (`:126`). 5.3 fixes the swap at fade 120 / swap / fade 120 and "no camera motion during any beat". HANDOFF :54 argues a 250 ms walk read as a cut on a large board; note it in the PR body as the prototype's finding, then build the fade.
- Conflict: HANDOFF :13 and play-scope.md describe the 3D table as "one shared surface … opponents at top/left/right"; D3/3c say one back row in thirds. 3c wins (wireframe is the layout authority).

**3d `board-card-motion`**
- Port: tapped tilt **14°** with `transform-origin 50% 60%` and `220 ms cubic-bezier(0.2,0.8,0.2,1)` (`index.css:326-346`) as the *in-DOM* rotation style; 5.3 specifies 90° over 250 ms, so port the origin and ease, not the angle. Note the chair thumbs use 90° (`Chair.tsx:56`).
- Port: card state rings: bright `2px lichen`, lit `2px brass + 18px/2px brass glow`, selected `3px primary` (`index.css:350-358`) → the ready-state ring (5.3 wants breathing cyan; use the lichen/brass values as a starting palette only), the inspect glow, the selected highlight.
- Port: flight timings as the *lower bound* already proven readable: 180 ms hand → mat, 220 ms zone moves, 240 ms to a pile, 18° graveyard tilt, flip at 60% of the flight after a 40% delay, ease `[0.2,0.8,0.2,1]`, skip under 6 px, 700 ms safety release, hide-the-real-card-while-the-ghost-flies (`FlightLayer.tsx:90-151, :170-185`). 5.3's targets (450-600 ms arrivals, 300 ms tidy, 500 ms play) are longer; keep the mechanics (ghost + hidden original + safety timer), take 5.3's durations.
- Port: the FLIP registry pattern: `cardEls` map keyed by cardId + zone anchors keyed `{owner}:{Zone}` and `seat:{id}` (`lib/flights.ts`) → where the stage's motion ghosts get their from/to rects.
- Port: hand enter `opacity 0, y 20 → 200 ms`, playable lift `y −8` (`HandTray.tsx:63-64`).
- Port: `CounterDice` (d6 pips, size `max(12, width × 0.2)`, tone by counter kind) and the P/T chip (`bottom 3% right 4%`, font `width × 0.11`, red with `toughness − damage` when damaged) and the crown badge (`CardFace.tsx:184-197`, `CounterDice.tsx`) → HUD overlays on DOM cards, consistent with Rob's "most unintrusive card-HUD" note.
- Do not port: framer `layout` props; `hover:-translate-y-1` (5.3 uses rock + ring instead).

**3e `board-arrows-and-shelf`**
- Port: StackPanel copy and row grammar: "Stack · N", top first, `{kind} · {player}`, "Face-down spell", "+N more below", the "What now?" explainer text (`StackPanel.tsx:20-41`) → the stack module (4a) and the shelf's hover text.
- Port: `response` detection (stack grew while non-empty) and its readout "{name} · {player}" top 4 (`callouts.ts:82-84`) → shelf fan order newest in front.
- Port: `incoming` readout grammar "{name} · P/T · keywords · → you|your planeswalker" (`callouts.ts:69-72`) → attack-arrow labels or the acting-seat cue text.
- Port: the targets shape confirmed by the sample: `stack[].targets = [{kind:'object', id}]` (sample-views.json) → arrow endpoint lookup; `combat.attacks[].planeswalker` optional id (`types.ts:81-87`).
- Port: callout anchor clamping (±140 px x, +60/−90 px y inside the board, y capped at 120 px below an element's top, `CalloutLayer.tsx:18-34`) → where the shelf tether and glow bursts may land without covering the hand strip or the one button.
- Do not port: the neon callout layer as a whole. The instruction set has no callout feature; Rob's planes use the edge, fog and shelf instead. If callouts return later: one at a time, hold `900 + intensity × 10` ms (+700 with readout), spring 520/22/0.7, exit 150 ms, tones harm/answer/growth/value/fade with the hsl values in 3.2, Barlow Condensed 800 italic uppercase with 1.5 px ink stroke. The overlap screenshots (`attached_assets/image_1791787245683.png`, `…329355.png`) are why only one shows at a time.

### Phase 4: info panes and Counterintelligence

**4a `board-modules`**
- Port: the pane frame: `bg-card/80`, tab strip `text-[12px]` with `rounded-t-lg px-2.5 py-1.5` tabs, active = `bg-background font-semibold`, a `⋯` per-module options menu + an X "Hide pane", body `overflow-auto p-3` (`RightPane.tsx:27-62`) → the slot header with its module dropdown.
- Port: module list as candidates for the registry: Turn Resources (mana pool chips + "Lands {untapped} untapped of {n} · land drops used {k}" + Mana sources + Playable now grouped by `primaryType`), Panel (hovered/zoomed card at `panelCardH/1.4` with options), History (turn/quiet/end marks styling; "Show quiet steps" toggle), Tracker (per-seat life + 4 zone counts + "poison N · cmdr dmg max N · status"), Combat (attack rows "→ defender · blocked by A, B | unblocked"), Hand counts strip (`HandCounts.tsx`, 2-column) (`ResourcesTab.tsx`, `PanelTab.tsx`, `HistoryTab.tsx`, `TrackerTab.tsx`, `CombatTab.tsx`) → Mana, Card image, History, Decision, Stack entries; Tracker and Hand counts fold into Counterintelligence's "Cards in hand" and commander rows.
- Port: pane width default 340, range 260-560, divider 9 px with a 44×3 px handle and 150 ms hover (`prefs.tsx:35`, `GameScreen.tsx:222`, `index.css:406-448`) → the right rail's expanded width, if resizable.
- Port: `prefs.panes` toggles + presets Minimal/Standard/All panels + Save/Restore layout (`prefs.tsx:64-68`, `Strip.tsx:138-155`) → `cm-board-modules` persistence shape idea (layout, panes, sizes, tab).
- Port: the Vitals table columns Seat / Life / Poison / Cmdr dmg (max) with per-commander breakdown / Counters / Status (`CenterCounter.tsx:33-50`) → a "Vitals" module or the commander row of Counterintelligence.
- Do not port: Chat tab (D17); Coach drawer tips (D16, stub stays); draw odds stub line; `stackPinned` (the stack is a module now).

**4b `counterintel`**
- Port: building blocks: `splitBattlefield` (Land-not-Creature vs creatures-first), `primaryType` order, `locationMap` (`derive.ts:117-173`) → the creature filter and card lookup.
- Port: the sample's keyword vocabulary (Flying, Reach, Deathtouch, Lifelink, Trample, Vigilance, Hexproof, Defender, Flash, Prowess, Annihilator, Convoke, Multikicker, Partner with, Hideaway) and counter kinds (`-0/-1`, `stun`) and `stack[].targets` shape (Section 8.1) → fixture realism and the keyword-row list (the spec's list lacks Reach and Annihilator; decide whether to add them).
- Port: the "Card name · P/T · keywords" readout grammar (`callouts.ts:71`) → the contributor line "Card name - Player name".
- Not found: any of the Section 6 analytics. `sample-views.json` has **no `loyalty` counter and no Planeswalker type**, so the loyalty key cannot be confirmed from this data; confirm in the engine as the spec says.
- Do not port: `CoachDrawer` tips ("Play X first…", "Keep a blocker back") — they are advice, which D16 forbids.

**4c `counterintel-watch`**
- Port: nothing. The prototype has no collection or Watch concept. Toast copy style from `use-toast` stubs ("Asked {host} to join", `PlayHome.tsx:36`) is not relevant; the repo uses `C.notice`.

### Cross-cutting items to carry regardless of PR

- Reduced motion contract: setting OR OS preference; CSS durations → 0, animations run once, flights off, callouts appear/leave instantly, life numbers jump (`prefs.tsx:100-118`, `index.css:489-503`, `GameScreen.tsx:126, :235`, `CalloutLayer.tsx:40, :66-68`). Matches D19's spirit; D19 keeps shadows, tap rotation, arrows, fade and shelf.
- Phone rule: landscape-only table (`(max-height: 520px) and (orientation: landscape)` = phone; portrait under 600 px shows "Turn your phone sideways / The table needs landscape. Your seat is held.") → `phoneView()` copy, if the repo wants a rotate hint.
- `feature-wiring` compatibility: every size control in the prototype is a slider (card 44-130 step 2, hand 1-3 step 0.1, intensity/sfx 0-100), every date/time uses `'en-US'`. One UK spelling exists: the post-cancel line and the canceled-flag state name use the British form (`Lobby.tsx:52-59, :147, :151`); write "canceled" in the repo or the scan fails.
- Keyboard map (6.3) → keep `N/Space` for the one button, `1-4` for seats (3c adds `V+1-4`), `H` hand, `?` help, `Esc` back to own seat, `Z`/right-click zoom.
- Mock refusal copy (8.4) → inline refusal wording under the one button (D15), where the repo's own room messages are terser.
- Sample fixtures: `sample-views.json` (42 real views, s0, seed 7) and the synthetic builders (8.4) → Node/vm fixtures for 2a (zone diffs across consecutive revisions), 3e (5 combat views, stack targets), 4b (three opponent boards with keywords, tapped states, a lost player). Note the sample's history is oldest-first and must be reversed, and it lacks `token`, `continuing`, damage/amount/ack decisions, loyalty counters and planeswalkers.
