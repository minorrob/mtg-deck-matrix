*Rob's brief for the Replit prototype of 2026-10-12, kept here verbatim as the UI lane's direction (the anchor wins where they disagree). Committed by the UI lane's session at its handoff, `docs/ui-lane/astra/handoff.md`.*

# CrankMagic Play: the prototype brief

**For Replit.** Paste this whole file as your first message, together with `gameplay-anchor.md` (the facts of the game and the data contract) and `sample-views.json` (42 real views from one 60-turn game). Where this brief and the anchor disagree, the anchor wins; list the disagreement in `HANDOFF.md` as a request.

> **Replit:** build a static front end and, at most, a small local mock server that plays back `sample-views.json`. No database, no sign-in, no rules logic, no backend. Everything the server would do is faked behind one adapter.

---

## 1. What this is

CrankMagic is a Magic: The Gathering Commander app. Players build decks in it, then play them at an online table hosted in the cloud: two to four seats, people and AI, in a browser on a desktop or on a phone held sideways. The rules engine, the game server, the AI players, accounts and each player's deck library already exist and are not yours.

You are building **the whole Play experience as a player sees it**: Play home, the lobby, the table during a game, the spectator view, game over, and the settings that touch play. It is an **interactive synthetic prototype**: every screen works against sample data, every function that does not exist yet is drawn and wired to fake data so it can be felt, and a real team builds on your output afterward.

The owner's one-line brief: *a board game that meets a video game, that meets a social table, that meets a competitive league. Open and airy.*

## 2. The four players this screen serves

Design every screen so each of these four gets what they want **without a mode switch**. They differ in how much of the interface they show, not in which product they use.

| Player | Wants | So the screen gives them |
|---|---|---|
| **Competitive** | Information: the stack and its resolution order, incoming attacks by type, open mana at every seat, what is castable now, odds, history that answers why, vitals at a glance, fast keys | An information layer always one gesture away and pinnable: Turn Resources, the attack readout, the stack as cards, open-mana pips on every chair, a threat ring on the counter, odds chips, quick keys |
| **Casual** | Simplicity and support: one obvious button, the next step named, help without shame, no surprises, the Coach a tap away | The support engine: one button that says what it does, Skip to end, "what can I do?", plain-language refusals, the Coach and rules helper, step-by-step only if chosen |
| **Social** | Playing with people: invites that work, seeing who is here, chat and emotes, a shared moment at game end, rematch in one tap | Open Games, Chat in Lobby that carries into the game, chair presence, emotes over chairs, the game-over card everyone sees, Rematch |
| **Competitive-social** | Standing: records, win rates, a leaderboard among friends, a ladder of decks | Records on each deck, a friends leaderboard, a season view, a deck ladder in Play's home |

## 3. The five pillars

1. **Open board.** The game fills the window. Every supporting container can be shown, sized, or hidden. Minimal containers and borders; a frame only where a distinction must be clear.
2. **A round table, virtualized.** You sit at the near edge. The other seats are chairs around you, each a real miniature of that seat's board. The active player is where the light is.
3. **A callout overlay, fighting-game style, modernized.** Game events are called out above the table in a neon-cartoon register with an outer glow: crossed swords for incoming attacks, a shield for responses, HIT, COUNTERED, +N, PROLIFERATE. Loud, brief, legible, skippable. This area is expected to be wrong at first; take your best shot and make it easy to tune.
4. **It just works.** Paints in under a second on the sample; smooth at 250 permanents; nothing below the window edge; reconnects quietly; never decides for the player.
5. **AI, just enough, cheap.** A Coach that answers in one sentence, a rules helper that explains the stack, AI seats with a difficulty label. All stubs here; all styled final.

## 4. The one architectural rule (from the anchor, repeated because it governs everything)

**The server is the authority.** The screen renders the latest view for its seat, lets the player choose among `view.decision.options`, sends that choice, and never computes legality, never infers hidden information, never changes the game. The only actions outside the options are Concede, End game for everyone, and the "stop at every step of my turn" preference.

Put all traffic behind **one adapter**: views in, frames out. The mock plays back the sample; the real connection replaces the mock later without touching the rest.

## 5. The screens

### 5.1 Play home

- **New table** (primary), **Rematch the last table** (if any).
- **Open Games**: a column of other tables, each an object (Section 5.3).
- **Chat** (Section 5.6), already live before a table exists.
- **Standing** (STUB): your record by deck (W-L, last ten, average finish), a friends leaderboard among the people you have played with an "AI games" filter, a season view, a deck ladder. Fake data.
- **Game history**: past games as cards; a game opens its record (STUB).

### 5.2 The lobby

- **Four quadrants** in a square (2 · 3 / 4 · 1, you bottom right). A quadrant's fill is its seat's state: empty, invited, pending deck, ready, error. Once a commander is chosen, a 90° color-identity fan radiates from the quadrant's inner corner (WUBRG order, ~60% opacity, thin seams; mono is one wash).
- **A quadrant's content**: seat label and status pill in the outer top corner; the commander card full height in the outer bottom corner (dashed "?" frame until chosen; click opens the card); a detail column beside it (commander name wrapping to two lines, colors, bracket, deck fit).
- **All of a player's actions sit on their own quadrant only**: Change deck · Choose mat · Ready / Not ready · Leave seat. The host adds Invite (email, link, QR) on an empty quadrant and an AI configurator (commander · style · difficulty Easy/Normal · pilot) on an AI quadrant. Other quadrants are read-only.
- **The center panel**: Table rules (bracket, cap, starting life, access state, AI pilot) with a small **Edit** the host may use while no seat is ready; the line "Launches when all are ready · n to go". **No Launch button**: when every human is ready, a 10-second countdown starts, cancelable by the host; AI seats never hold it.
- **Open Games** column beside the table (Section 5.3) and **Chat in Lobby** (Section 5.6).
- **Change deck** opens over the table: a strip of the player's decks (art, colors, bracket, real-in-box bar), tabs Saved deck · Lab list · Bring a list; one primary "Use <deck> at Seat n". STUB lists.
- **Choose mat**: a strip of playmat art, 16:9, live preview of the zones over it; **Use this mat** beside the ✕ in the header. STUB art.
- **Invite**: email, copy link, QR. STUB. Only people on the app's invite list get in; anyone else is refused with instructions and keeps their seat.

### 5.3 Open Games and the detail card

Each game in the column is one selectable object: small commander art per seat, player count, turn, elapsed time, an access badge.

| Access state | Badge | Click | Action |
|---|---|---|---|
| Open | green ring | opens the detail card | **Join** a free seat |
| Invite-only | amber ring | opens the detail card | **Request invite** (the host sees it on their table) |
| Private, viewable | blue ring with an eye | opens the detail card | **Spectate** |
| Private, restricted | gray with a lock | not clickable | none |

**The detail card** (between click and action): length of game (turn and elapsed), number of players and free seats, each player's commander with current life (and poison when any), the table's rules in one line, and only the buttons the access state allows: Join · Spectate · Request invite · Close.

### 5.4 The table

**Layout.** Your mat is the near edge, full width. Opponents sit as **chairs** across and to the sides (three: left · across · right; two: left and right; one: across). Each chair is a real miniature of that seat's mat; a click brings that seat forward or walks the camera to it. The **counter** sits at the table's true center: two to four pie slices, one per seat with its life, the wand logo in the middle; clicking the logo opens Table vitals (heart for life, skull for poison, commander damage from each commander with its 21 threshold). The **hand tray** runs along the foot. The **strip** is one 48px line at the top. The **right pane** holds the tabs (Section 5.5).

**Sizing is one gesture everywhere: drag the divider between two main containers.** Chairs | mat, mat | right pane, board | hand tray, strip | board, and inside the right pane, card | history. Each divider has a legible minimum, double-click restores the default, arrow keys work. Card size and hand size are sliders inside their containers (hand cards twice the mat card by default). **Hiding** is in the container's own menu; a hidden container collapses to its divider, left as a thin handle on the window edge.

**The Layout menu** in the strip: presets **Open** (mat, hand, counter, the one button; callouts on), **Standard** (plus chairs and the right pane on Turn Resources, the history band on the mat), **Full** (plus Panel pinned, stack pinned, odds chips, chat open), **Grid** (four equal 16:9 mats in a 2×2, you bottom right), and "Save my layout". L cycles presets; Escape hides anything transient.

**The mat.** Battlefield over Lands on the left; Command, Exile, Library, Graveyard as card-shaped piles on the right, the card sitting on top of its footprint; in Focus the History band runs between the two pile pairs. **Minimal containers:** no border on the mat; zones named by a small italic label and implied by where cards sit; a frame appears only for an empty zone or a drop target; the hand tray keeps a faint translucent backing because cards over art need it.

**Cards.** Every card on a mat is the commander's size; resize the board, not the card. Cards are 5:7, sized by width, images unaltered (never crop the artist line). Battlefield rules: reading order left to right, row 1 then row 2; creatures first; a cell holds one card; stacks only as deep as needed; scroll sideways only when cards do not fit; one row when there is room for one. Lands: one row, basics in piles by name (W U B R G first); a tapped card tilts where it lies and moves nothing; the row overlaps to fit, then scrolls with a bar. The library shows a card back (use a placeholder). Hover shows the card centered at 400px and never taller than the mat; right-click or long-press opens Card zoom with what the card can do.

**The strip.** ☰ (the app's rail, as an overlay) · the turn label (*Turn 3 · You (your 2nd)*) · the step as a chip with the 7-step ribbon on click · **the one button** · Skip to end · You can also ▾ · Table | Focus | Full screen · History ▾ · Tools ▾ · Layout ▾ · Panel ▸. Never wraps.

**The one button** names what passing does: **Next step** (your turn, empty stack) · **Resolve <top of stack>** (something on the stack) · **Pass** (another player's turn) · **End turn** (your own end step; always asked, never automatic). **Skip to end** passes through the rest of your turn and stops by itself when anything goes on the stack or a question is asked. Draw is automatic and visible (the drawn card lifts into the hand); clicking your library in the draw step also draws. Clicking a tapped land whose mana is unspent untaps it (the `undo-mana` option). **Resolve all** collapses identical triggers into one click. An option that helps an opponent or hurts you carries its **lean** ("helps Maya", "against your own") as information, never a block.

**Decisions that are not priority** (Keep this hand?, blockers, damage, targets, order, costs) float under the strip where the prompt is, built from `decision.mode` and its constraint fields. Priority floats nothing: castable cards are bright; everything else is under You can also ▾.

**Refusals** show under the one button in the server's own words, naming the thing and what to do. Never a modal, never a warning that can be clicked past.

**The active player's light.** Their chair brightens and their color fan washes from their corner across the felt, crossfading on turn change (~600 ms). Priority is a thin ring that moves seat to seat. The background itself is still.

### 5.5 The right pane and its tabs

Tabs, in this order: **Turn Resources · Panel · History · Tracker · Combat · Chat**. The pane sits beside the mat on the same layer (it shrinks the mat), never over it, sized by its divider.

- **Turn Resources**: by land and by card type (Land, Creature, Instant including flash, Sorcery, Artifact, Enchantment, Planeswalker): castable now / in hand; lands untapped / total; mana pool by color; mana tapped this step. The hand tray carries the short form (Land 2/5 · Creature 0/2 · Instant 1/1 · Other 0/0). "Castable now" comes from the decision's options.
- **Panel**: the picked card drawn upright (a small Tapped mark if tapped) with what it can do; a horizontal divider under it trades card size for history lines.
- **History**: newest first, fading with age, searchable, filterable by phase and card; a line expands to its cause where the sample carries one (otherwise a REQUEST). A clock is its icon everywhere.
- **Tracker** and **Combat**: counters and life changes; attackers, blockers and damage as the sample carries them.
- **Chat**: Section 5.6.

**Every pane header carries a menu icon (⋯)** holding that pane's options and **Hide this pane**. Chat: Join chat · Leave chat · Mute a player · Jump to newest. Panel: Pin · Card size. History: Search · Filter by phase · Filter by card. Turn Resources: Group by type / by land. Chairs: Grid / Table. Hand tray: Hand size · Sort. The menu is the one place a pane's options live, so headers stay clean.

### 5.6 Chat

**Chat in Lobby** is a pane beside the quadrants. The same conversation becomes **Chat in Game**, a tab in the right pane. Messages carry the sender's chair color; a spectator's message carries an eye. Six emote chips in the composer (GG, nice, oops, thinking, salt, hype) float briefly over the sender's chair in the callout grammar. Chat is a STUB kept in memory; it is saved with the game file in the real product, which is not your concern.

### 5.7 The callout overlay

One visual grammar: a bold condensed word or two in neon with an outer glow, a glyph, a number where there is one. Red for harm, blue for answers and defense, green for growth, gold for value. Entrance 250–400 ms, a hold, exit 150 ms. Never more than three on screen; oldest leaves first. Each callout appears near its cause (the attacking chair, the stack entry, the card); a readout, where there is one, sits on a translucent dark backing at 4.5:1 contrast. Nothing covers the hand tray or the one button. An **Overlay** slider (off to loud) in Settings › Play and under Tools; reduce motion shows final frames only.

| Trigger (from the view) | Callout | Readout |
|---|---|---|
| Attackers declared against you | Crossed red swords, INCOMING | Attacks in the order to address them: blockers first, then the stack's resolution order; attacker · P/T · keywords · target (you or your planeswalker) |
| Something added to a non-empty stack | Blue shield, RESPONSE | The stack, top first, the new entry outlined with its targets |
| Combat damage dealt | Red burst with the number, HIT (CRITICAL at 10+, KO when a player falls) | Damage per source, life after |
| Damage prevented, a blocker survives, indestructible saves | Blue shield fragment, BLOCKED / SAVED | What was prevented |
| A spell countered | Blue slash through the entry, COUNTERED | Which spell, by what |
| +1/+1 or loyalty counters placed | Green pips rising, +N | Card and new total |
| Proliferate | Green ripple across every permanent that grew, PROLIFERATE | Each permanent's new counts |
| Tokens created | Gold bloom with the count, ×N | Token name and count |
| Life gained or lost outside combat | Green or red heart with the number | New life |
| Commander damage reaches 21, poison reaches 10 | Red seal, FATAL | The source |
| A permanent destroyed or exiled | Red shatter / violet fade | Card and destination |
| A card drawn (yours) | The card lifts into the hand | none |
| Your turn begins / game over | Chair light sweep / the winner's glow | Turn label / winner, turn, reason |

Build a **debug toggle** that fires any callout on demand so the grammar can be judged in minutes. Expect the first cut to be wrong in intensity and timing; the aim is one grammar that is easy to tune, not a finished set. Leave a **named empty layer** above the mat and below the readouts; a later feature (a holographic card projection) will use it.

### 5.8 Views and the spectator

- **Focus** is the home layout (your mat large, chairs around it). **Grid** is the four-equal-mats preset. **Full screen** uses a 44px rail, opponents across the top 40%, your board full bleed across the lower 60% with zones implied, a right column with every seat's vitals, the hovered card large, and the log; **⟳ Rotate** walks the camera seat to seat (never showing a hand); the corner reads *Viewing Nina* with My board one click away.
- **The spectator view** (STUB from the sample): a spectator enters from Open Games in the camera view and may rotate to any seat. They see no hand and no inside of any library, graveyard or exile pile, only counts. They never act and are not counted; chairs show a small eye with the watcher count. Spectators may chat if the table rule allows.

### 5.9 Phones

Landscape only; Focus only. The hand fans from ✋; chairs collapse to three pills across the top; every drag has a tap alternative; the one button is always reachable.

### 5.10 Game over

A scorecard: the winner's chair glows, the banner floats over the center; winner, turn, reason, the commanders, each player's record line; **Rematch** (same seats) and **Back to lobby**. Games with an AI seat carry an AI badge. The record can be downloaded (STUB).

### 5.11 The Coach, the rules helper and AI seats (all STUB, styled final)

- **The Coach** opens as a drawer from the strip (icon: a speech bubble with a wand) with three suggested questions drawn from the current decision ("Should I attack?", "What does X do?", "What is the biggest threat?"). Replies are one to three very concise sentences, usually one, with **Show me** (lights the named cards on the mat in the callout grammar) and **Why?** (one sentence). The Coach never acts. In Full screen it opens in the side column under the log.
- **The rules helper**: a "How does this resolve?" chip on any stack entry or combat readout, answered in a sentence or two, attached to the entry it explains.
- **AI seats** show a small persona glyph and a difficulty label (Easy, Normal) on their chair. A person never sees an AI's decisions, only views and history lines.
- **AI Coach settings** (from Tools and from Settings): Suggest cards I don't own (off) · Prefer what I own first (on) · Stay inside the deck's bracket (on) · Advice length Short/Detailed · What the Coach may see: My board and hand / My board only · Spending meter (read-only).

### 5.12 Settings › Play

Stop at every step of my turn (off) · Reduce motion · Overlay (off to loud) · Sound: Effects, Music, Mute · Card size · Hand size · Theme (four swatches: Moss & Iron default, Brass & Slate, Felt & Cream, Steel & Cobalt) · AI Coach settings.

## 6. Joy, with discipline

- **Play mats** as the table under your cards; felt where there is no art.
- **Dice on cards**: +1/+1 and loyalty counters drawn as small die faces (d6 up to six, a numbered chip beyond).
- **The d20** rolls for first player and animates to the result it was sent (STUB).
- **The life wheel**: the center counter's slices can be dragged like a spindown die (display motion only; STUB).
- **Card motion**: a played card eases from hand to mat (180 ms); a destroyed card tilts and slides to the graveyard; a token blooms; a tapped card tilts in place.
- **Sound**: draw, land, a permanent arriving or leaving, a wipe, life gain, attackers, your turn, game end; lobby, game and combat beds crossfade. Nothing plays before the first press on the board. Add a die clatter, a shield chime and a sword clash for the callouts.
- **Transitions**: turn change moves the light and crossfades the fan; view changes walk the camera, never cut.

The discipline: nothing over 250 ms except a callout's entrance (≤ 400 ms); a handful of things moving at once at most; nothing animated on first paint; reduce motion makes every one of these an instant state change; the board at rest is what a glance reads.

## 7. Rules the prototype must hold

- Every game action comes from `view.decision.options`; the only exceptions are Concede, End game for everyone (confirmed twice: "End for everyone · keep the record"; any human may use it), and the step-by-step preference.
- Nothing names a hidden card in any tooltip, label or log line. The view is already filtered; never fetch more. A spectator sees even less (counts for libraries, graveyards and exile).
- No decision is ever made for the player. Skip to end stops on anything on the stack or any non-priority question. The end step always asks.
- **American English and US formats** (color, gray, canceled; $1,234.56; Sep 25, 2026; 2:42 PM). Card names keep their printed spelling.
- **Sizes are sliders or dividers, never steps.** Draw both ends; the minimum stays legible, the maximum fits.
- Text at or above 10px; contrast 4.5:1; every action keyboard-reachable with a visible focus; every card and control named for a screen reader (never a hidden card); one polite live region for the strip's state.
- Card images from `https://api.scryfall.com/cards/named?exact=<name>&format=image` with `&version=small|normal|large`; shown unaltered; fetched politely and cached.
- A refusal (409, 422, 400, 500) always arrives with a fresh view and never changes the game; show its words under the one button.
- Reconnect: a thin "Reconnecting…" bar at the top edge, the board unchanged; a seat is "away" for up to 5 minutes before it concedes; everyone sees the clock.

## 8. Fixtures to render

From `sample-views.json`: the first view of each of the 19 decision kinds; a deep stack; a 250-permanent board; a four-seat and a two-seat game; a mulligan; blockers; damage assignment; a search; the away state; a refusal; game over. For the lobby and Open Games, invent a dozen tables across the four access states. For the spectator view, reuse a sample view with hands and piles reduced to counts.

## 9. Real versus stubbed

| Real in the prototype (from the sample views) | Stubbed (fake data, final styling) |
|---|---|
| The mat, zones, piles, hand, counter, vitals, stack, combat readout, callouts, history, the one button, Turn Resources, chairs, layout presets, dividers, pane menus, phones, keyboard, the debug toggle | Coach replies, rules helper replies, chat and emotes, Open Games list and detail cards, join and invite requests, the spectator projection, invites and QR, leaderboard and season, deck ladder, Choose mat art, the die, the life wheel's effect, the AI configurator's effect, the empty hologram layer |

## 10. Quick keys

N next step · Space pass or resolve · H hand · 1–4 bring a chair forward · C coach · L cycle layout · ? what can I do · Esc hide transient panels.

## 11. What to hand back

`HANDOFF.md` with:

1. The concept in a paragraph, with screenshots of each preset and of the callouts.
2. Where the adapter is: where views come in and frames go out.
3. Every view field the concept reads.
4. Everything it wanted that the view does not carry, and why (expected: a spectator projection with pile counts only; a chat channel; cause links in history; odds data; attachments, tokens, summoning sickness, colors and mana cost, double-faced state). These become requests to the engine.
5. Every assumption this brief did not state.
6. The libraries used, and their licenses.
7. Every animation with its duration and its reduce-motion fallback.
8. Every stub with the shape of the data it expects, so each can be wired without redesign.

Note for the implementers who follow you: the production board is plain JavaScript and CSS. A framework concept is a reference to port, not code to merge, unless the owner decides otherwise.

## 12. How it will be judged

- A first-time player finishes a turn with the one button and never reads a rule.
- A competitive player answers "who can respond, with what, and what resolves first" without opening anything.
- The table reads as a table with people at it, and an attack feels like an event.
- It paints in under a second on the sample and stays smooth with 250 permanents.
- Every stub looks final and fails loudly if it tries to do something Section 7 forbids.
