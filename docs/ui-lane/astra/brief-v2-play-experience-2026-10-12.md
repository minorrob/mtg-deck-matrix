# CrankMagic Play: the prototype brief, second edition

**For Replit.** Paste this whole file as your first message, together with `gameplay-anchor.md` (the facts of the game and the data contract) and `sample-views.json` (42 real views from one 60-turn game). Where this brief and the anchor disagree, the anchor wins; list the disagreement in `HANDOFF.md` as a request.

> **Replit:** build a static front end and, at most, a small local mock server that plays back `sample-views.json`. No database, no sign-in, no rules logic, no backend. Everything the server would do is faked behind one adapter. Start from a blank page, not from any earlier concept.

---

## 0. Why a second edition

The first brief described a screen. This one describes an experience and lets the screen follow. It starts from what it is like to sit at a Commander table with three other people for ninety minutes, asks what an online table loses, and designs to give it back. Keep nothing from any previous concept out of habit; keep only what this brief asks for.

## 1. What this is

CrankMagic is a *Magic: The Gathering* Commander app. Players build decks in it, then play them at an online table hosted in the cloud: two to four seats, people and AI, in a browser on a desktop or on a phone held sideways. The rules engine, the game server, the AI players, accounts and each player's deck library already exist and are not yours.

You are building **the whole Play experience as a player lives it**: finding a game, the lobby, the table during a game, the moments between turns, game over, and the settings that touch play. It is an **interactive synthetic prototype**: every screen works against sample data, every function that does not exist yet is drawn and wired to fake data so it can be felt, and a real team ports your output into a plain-JavaScript board afterward.

The owner's one-line brief still holds: *a board game that meets a video game, that meets a social table, that meets a competitive league. Open and airy.*

## 2. What a Commander table is, and what the screen loses

At a real table of four, a player spends most of the game **not acting**: three turns out of four belong to someone else. What they do in that time is the game: they watch the board change, judge who is ahead, read a card across the table, talk, make and break deals, and plan their turn. When their turn comes they want to act fast and feel it land.

Every online table so far loses some of this:

| At the table | Online, usually | What this prototype gives back |
| --- | --- | --- |
| You see the whole board change as it happens | You look away during three turns and come back to a changed board you have to re-read | **A screen built on *what changed*** (Section 4) |
| Who is ahead is a glance: big boards, open mana, a grin | Four small panels of equal weight | **Attention follows the threat and the turn**, not the layout |
| A card across the table is a lean and a "what does that do?" | A hover somewhere small, or a click that opens a modal | **Lean in**: one gesture enlarges a seat in place and returns |
| Deals, jokes, groans | A chat box nobody reads | **Table talk** that lives over the chairs, and deals as objects |
| The big play is a moment everyone feels | A log line | **Callouts** and **the story of the game** at the end |
| Your turn is quick: untap, draw, act | Clicks, waits, "is it me?" | **The one button** that always names what comes next, and a turn that announces itself |
| New players are carried by the table | Alone with a rulebook | **Carried by the screen**: the next step named, the Coach beside you |

Design every screen against this table, not against a dashboard.

## 3. The people at the table

Four people share one table and want different things. They get them **without a mode switch**: they differ in how much of the interface they open, not in which product they use.

| Player | Wants | So the screen gives them |
| --- | --- | --- |
| **The competitor** | To answer "who can respond, with what, and what resolves first" without opening anything; incoming attacks by type; open mana at every seat; what is castable now; odds | **The dossier**: a layer always one gesture away and pinnable (the threat lens, the stack as cards, open-mana pips on every chair, Turn Resources, odds chips, quick keys) |
| **The newcomer** | One obvious thing to do, the next step named, help without shame, no surprises | **Carried**: the one button, the seven steps always in view, decision cards in plain words, the Coach, step by step only if chosen, refusals that say what to do |
| **The host** | People at the table: invites that work, who is here, talk, a shared ending, a rematch in one tap | **The table as a place**: open games, chair presence, table talk, deals, the game-over scorecard, Rematch |
| **The league player** | Standing: records by deck, a friends ladder, a season | **Standing** on Play home and on each deck |

A fifth person is at the table too: **the one who stepped away** (a phone call, a child, a dropped connection). The screen keeps their seat warm, shows everyone the clock, and brings them back to a board they can read in ten seconds (Section 4.3).

## 4. The core idea: a screen built on what changed

### 4.1 The timeline

A thin **timeline** runs along the foot of the board, above the hand: the game as turns, each turn as its seven steps, the current step lit. It is the game's clock and its memory at once.

- **Markers** sit on it where something happened: an attack, a spell countered, a board wipe, a player falling. Markers carry the seat's sigil and color (Section 6.1).
- **Scrubbing** the timeline shows the board as it was at that moment, dimmed, with "Then" in the corner; release returns to now. The client keeps every view it received for this purpose; nothing is fetched. (Hidden information stays hidden at every moment: a past view is still a seat's view.)
- **"What did I miss?"** (one tap, key `M`, offered automatically when you return from away or from another tab): plays the markers since you last acted, at pace, in the callout grammar, with the board changing under them; any tap stops it and lands on now. Ten seconds for a full round of three turns.

### 4.2 Change on the board itself

When a view arrives, what changed is **marked where it changed** for a few seconds: a new permanent glows in its seat's color, a card that left leaves a fading outline, a life total that moved shows the delta beside it, a counter that grew pulses. The marks fade on their own and never block a click. A player who glanced away for twenty seconds reads the board without the timeline.

### 4.3 Coming back

A seat that reconnects, or returns from another tab, gets one quiet card: *You were away for 2 turns. Maya attacked you for 6; Nina countered your Rhystic Study. It is Luis's second main phase.* Buttons: **Show me** (the replay) · **Got it**. Nothing else happens until they choose.

## 5. The stage: the table as a place

### 5.1 The layout

**Your board is the near edge of the table, full width.** The other seats are **chairs** across and to the sides (three: left · across · right; two: left and right; one: across). Each chair is a real miniature of that seat's board: its permanents, its lands, its piles as counts, its commander, its vitals, its sigil. The **counter** sits at the table's true center: one pie slice per seat with its life, poison when any, commander damage on hover. The **hand** runs along the foot, under the timeline. The **strip** is one 48px line at the top.

**The mat is the table.** The player's chosen playmat art is the whole ground of their board, felt where there is no art; no border, no frame; zones implied by where cards sit and named by a small italic label. A frame appears only for an empty zone or a drop target. In **Full screen** the near board's mat becomes the entire background and **bends** at a horizon between two thirds and three quarters of the way up the window: a floor in perspective, a wall behind it; the chairs sit on the far sides and the back; the near board keeps the most room. A **3D** switch bends it; off, the same layout lies flat.

**The light.** The active player's chair brightens and their color washes from their corner across the felt, crossfading on turn change. Priority is a thin ring that moves seat to seat. The background itself is still.

### 5.2 Lean in

**One gesture enlarges a chair in place:** press and hold (or hover for 400 ms, or key 1–4) and that seat's board grows toward you, over the mat, large enough to read every card; release and it returns. No mode switch, no modal, nothing to close. Holding and moving the pointer over a card shows that card at full size with its text. This is how a card across the table is read.

**Walk to a seat** (double-tap a chair, or `V` then a number) swings the camera to sit at that seat's edge: their board large, yours now a chair. The corner reads *Viewing Nina*; *My board* is one tap. A walk never shows a hand.

### 5.3 The threat lens

A toggle in the strip (key `T`): **everything that cannot affect you right now dims.** What stays lit, from view facts only: untapped creatures at every seat, open mana (untapped lands and pool) at every seat, the stack, cards in the current attack. The lens shows facts; it never says what is legal, what will happen, or what a player should do. A competitor leaves it on; a newcomer finds it when the Coach suggests it.

### 5.4 Every container shown, sized or hidden

Sizing is one gesture everywhere: **drag the divider** between two containers (chairs | board, board | dossier, board | hand, strip | board). A legible minimum, double-click restores the default, arrow keys work. Card size and hand size are **sliders** inside their containers, never steps. Each container's header carries one menu (⋯) with its options and **Hide**; a hidden container collapses to a thin handle at the window edge.

**Presets** in the strip's Layout menu: **Open** (board, hand, counter, the one button; callouts on), **Standard** (plus chairs, the timeline, the dossier on Turn Resources), **Full** (plus the stack pinned, the threat lens, odds, table talk open), **Grid** (four equal boards in a 2×2, you bottom right), and **Save my layout**. `L` cycles.

## 6. Reading the board

### 6.1 Seats you cannot confuse

Each seat has a **sigil and a color**: a shape (circle, triangle, square, diamond) and one of the table's seat colors. Every marker, callout, timeline mark, chat line, priority ring and life slice carries both, so a colorblind player and a player on a dim phone read the same thing. The sigil sits on the chair, on the commander, and beside the player's name.

### 6.2 Cards

Every card on a board is the commander's size; resize the board, not the card. Cards are 5:7, by width, images unaltered (never crop the artist line). Battlefield: reading order left to right, row by row; creatures first; a cell holds one card; stacks only as deep as needed; sideways scroll only when cards do not fit; one row when there is room for one. Lands: one row, basics in piles by name (W U B R G first); a tapped card tilts where it lies and moves nothing; the row overlaps to fit, then scrolls. Hidden cards show a card back. Hover shows the card centered at 400px and never taller than the board; right-click or long-press opens Card zoom with what the card can do.

**Dice on cards:** +1/+1 and loyalty counters as small die faces (d6 to six, a numbered chip beyond). A tapped card tilts; an attacking card leans forward toward its target; a blocked card meets it.

### 6.3 The seven steps

The strip carries the **turn label** (*Turn 3 · You · your 2nd*) and the **seven steps** as a ribbon on every turn: untap · upkeep · draw · main 1 · combat · main 2 · end; done steps struck through in ink, the step now as the accent chip, the steps to come in ink. Under 1400px the ribbon takes short forms (Un · Up · Dr · M1 · Cb · M2 · End). It never wraps and never hides. Clicking it opens the step menu (stop at every step; stop at a named step; skip to end).

### 6.4 The stack as cards

The stack is a column of cards on the dossier, top first, each with its targets drawn as lines to the board when hovered, and a **"How does this resolve?"** chip (the rules helper, a stub). When the stack is non-empty the one button names the top entry.

## 7. Acting

### 7.1 The one button

One button in the strip names what passing does, always: **Next step** (your turn, empty stack) · **Resolve <top of stack>** (something on the stack) · **Pass** (another player's turn) · **End turn** (your own end step; always asked, never automatic). **Skip to end** passes through the rest of your turn and stops by itself when anything goes on the stack or a question is asked. Draw is automatic and visible (the drawn card lifts into the hand). Clicking a tapped land whose mana is unspent untaps it (the `undo-mana` option). **Resolve all** collapses identical triggers into one click. An option that helps an opponent or hurts you carries its **lean** ("helps Maya", "against your own") as information, never a block.

### 7.2 Playing a card

Castable cards in the hand are **bright**; the rest are dim with the reason on hover in the server's words. A card is played by click or keyboard (drag to the board as a second way, with a drop target). Targets are chosen on the board itself: the legal targets (from the decision's options) light up, everything else dims, the chosen ones get the seat's sigil, and a confirm floats under the strip.

### 7.3 Decision cards

Every question that is not priority (Keep this hand?, blockers, damage, targets, order, costs, "may" choices) arrives as a **decision card** that slides in under the strip: the question in plain words, the options exactly as the server gives them, drawn as cards or buttons, with **Why am I being asked?** (one sentence from the Coach, a stub). Built from `decision.mode` and its constraint fields. The card never covers the board it asks about; it docks to a side when the question needs the board (blockers, targets).

### 7.4 Refusals

A refusal (409, 422, 400, 500) shows under the one button in the server's own words, naming the thing and what to do, and leaves the board as the fresh view says. Never a modal, never a warning that can be clicked past.

### 7.5 While you wait

During another player's turn the hand becomes a **planning tray**: cards can be reordered, **earmarked** (a small flag: "next turn"), and read; earmarks are local, sent nowhere, and show as a faint fan on your chair for you only. The Coach's suggested questions change with the turn (*What is Luis likely to do? Which of my cards answers Maya's board?*). The threat lens and lean-in are a tap away. Nothing in this tray ever acts.

## 8. The social table

### 8.1 Table talk

Text and six emotes (GG · nice · oops · thinking · salt · hype) live in one **Table talk** pane, carried from the lobby into the game. A message floats briefly **over its sender's chair** in the callout grammar, then settles into the pane; a spectator's message carries an eye. Voice and video are stubs: a microphone and a camera toggle on each chair, a small live tile when on (fake). Mute a player, Jump to newest, Leave chat in the pane's menu.

### 8.2 Deals

A **deal** is a structured message: *I won't attack you this turn* · *Truce until turn 10* · *Point: Nina is the threat* · a free-text proposal. It is sent to one seat or to the table, shows as a card over the chairs with **Accept** · **Decline**, and, accepted, sits as a small token on both chairs until it expires. Deals are social only; the engine never enforces them, and the screen never checks them. (STUB.)

### 8.3 Presence

A chair shows who is there: the sigil, the name, a thin away clock when a seat is away (everyone sees it; a seat concedes after five minutes away), a typing dot in table talk, a spectator count with an eye. An AI seat shows a persona glyph and a difficulty label.

## 9. Moments

### 9.1 Callouts

One visual grammar over the table: a bold condensed word or two in neon with an outer glow, a glyph, a number where there is one. Red for harm, blue for answers and defense, green for growth, gold for value, violet for what leaves. Entrance 250–400 ms, a hold, exit 150 ms. Never more than three on screen; the oldest leaves first. Each callout appears **near its cause** (the attacking chair, the stack entry, the card); a readout, where there is one, sits on a translucent dark backing at 4.5:1 contrast. Nothing covers the hand or the one button. An **Overlay** slider (off to loud) in Settings › Play and under Tools; reduce motion shows final frames only. A **debug toggle** fires any callout on demand so the grammar can be judged in minutes.

| Trigger (from the view) | Callout | Readout |
| --- | --- | --- |
| Attackers declared against you | Crossed red swords, INCOMING ×N | Attacks in the order to address them: attacker · P/T · keywords · target |
| Something added to a non-empty stack | Blue shield, RESPONSE | The stack, top first, the new entry outlined with its targets |
| Combat damage dealt | Red burst with the number, HIT (CRITICAL at 10+, KO when a player falls) | Damage per source, life after |
| Damage prevented, a blocker survives | Blue shield fragment, BLOCKED / SAVED | What was prevented |
| A spell countered | Blue slash, COUNTERED | Which spell, by what |
| Counters placed | Green pips rising, +N | Card and new total |
| Proliferate | Green ripple, PROLIFERATE | Each permanent's new counts |
| Tokens created | Gold bloom, ×N | Token name and count |
| Life changed outside combat | Green or red heart with the number | New life |
| Commander damage at 21, poison at 10 | Red seal, FATAL | The source |
| A permanent destroyed or exiled | Red shatter / violet fade | Card and destination |
| Your turn begins | The chair's light sweeps, YOUR TURN | The turn label |
| A player falls, game over | The winner's glow, VICTORY / GAME OVER | Winner, turn, reason |

### 9.2 The story of the game

At game over, before the scorecard, **the story**: the game retold in six to ten beats drawn from the markers (the first commander cast, the biggest hit, the counter that mattered, the wipe, the finishing play), each a frame of the board at that moment with its callout, played as a short reel anyone can scrub. Then the **scorecard**: the winner's chair glows; winner, turn, reason; the commanders; each player's record line; **Rematch** (same seats) · **Back to lobby** · **Download the record** · **Share the story** (an image, stub). Games with an AI seat carry an AI badge.

### 9.3 Sound

A quiet table ambience under everything (felt, a room). Cues: draw, land, a permanent arriving or leaving, a wipe, life gain, attackers (a sword clash), a counter (a shield chime), tokens (a bloom), dice (a clatter), your turn (a chime that also fires as a browser notification when the tab is in the background), game end. Lobby, game and combat beds crossfade. Nothing plays before the first press on the board. Effects, music and mute are separate sliders.

### 9.4 Motion, with discipline

A played card eases from the hand to the board (180 ms); a drawn card lifts from the library; a destroyed card tilts and slides to the graveyard; a token blooms; a tapped card tilts in place; an attacker leans toward its target; the light moves on turn change (600 ms); a walk to a seat swings the camera (360 ms, deliberately over the cap: shorter reads as a cut). Nothing else over 250 ms except a callout's entrance (≤ 400 ms). A handful of things moving at once at most; nothing animated on first paint; reduce motion makes every one an instant state change. The board at rest is what a glance reads.

## 10. Play home: the pre-lobby, and setting a table

### 10.1 What Play opens to

**Play in the app's left rail opens Play home, a place, not a form.** Today's staging opens to a *New table* form (your name, three seat rows with a dropdown and a name field, *Create the table*). Replace it. Play home is the lounge of the club: who is here, what is being played, your own standing, and the way to a table in one tap.

**Desktop layout** (the dividers and pane menus of Section 5.4 apply here too):

- **The top strip:** *Play* · your standing in one line (*12–9 this season · 3-game streak · Bracket 3*) · *4 friends at tables now* with their sigils · the Help ring.
- **The return banner,** only when you are seated at a live table or a lobby: *You are at Nina's table, turn 7, Luis's turn* · **Return** (primary) · **Leave the seat**. Nothing else in Play home is reachable above it; a seat is never silently abandoned.
- **Left column, Start:**
  - **New table** (primary; Section 10.2).
  - **Play the AI now** (one tap: you and one AI at Normal, your last deck, straight into the game; the lobby is skipped because nobody is waiting). A second AI and a difficulty are one tap more.
  - **Rematch the last table** (same seats, same decks; the others get an invite).
  - **Join by link or code** (a field; also where a pasted invite lands).
- **Center column, Open games** (Section 10.4): the tables you may join, request or watch, friends' tables first, then open tables by bracket, newest last; a filter row (bracket · seats free · friends only · spectate-able).
- **Right column, Table talk** (Section 8.1): the lounge conversation, already live before any table exists; the people in Play home are listed above it with a dot for *at a table* or *in the lounge*; a message to the lounge, or to one person, or *Invite to my table* beside any name.
- **Below the fold, Standing** (STUB, Section 10.5) and **Recent games** as cards, each opening its story and its record (Section 9.2).

**Phone (landscape):** the return banner, then Start, then Open games, then Table talk, as tabs across the top; Standing and Recent games under Start.

### 10.2 New table: set the table, don't fill a form

**New table opens a card over Play home**, not a page. It is the lobby's own square in miniature (Section 10.3), so setting a table and sitting at it look the same.

- **The square:** four quadrants, you in seat 1 at the bottom right with your sigil and your name (prefilled from the account, editable in place). **Tap a quadrant to set the seat:** *Invite a person* (a name, an email, or *anyone with the link*) · *AI* (a persona glyph, a style, a difficulty Easy or Normal) · *Open* (anyone the table's access allows may take it) · *Nobody* (the table seats fewer). Defaults: seat 2 *Open*, seats 3 and 4 *Nobody*; **the last table's setup** is one tap away as a preset. A quadrant's fill shows its state at a glance, as in the lobby.
- **The table's rules,** in one row under the square, each a chip that opens a small picker: **Bracket** (1 to 5; default the host's deck's) · **Starting life** (40; 20 and 30 offered) · **Access** (Open · Invite-only · Private, viewable · Private, restricted; default Invite-only when any seat is an invite, Open otherwise) · **Spectator talk** (on or off) · **Turn clock** (none, or a soft reminder at a chosen time, never an enforcement).
- **Your deck:** *Choose now* (the deck strip of Section 10.3) or *Choose at the table*. A deck chosen here fills your quadrant's commander and fan at once.
- **One button:** **Set the table.** It creates the table and lands you in its lobby with the **invite link already copied** and a toast saying so, the QR a tap away. There is no second form.
- **The square never asks for what it can infer:** your name, your sigil, the bracket of a chosen deck, the access state the seats imply. Everything inferred is shown and changeable.

### 10.3 The lobby

**Four quadrants** in a square (2 · 3 / 4 · 1, you bottom right). A quadrant's fill is its seat's state: empty, invited, pending deck, ready, error. Once a commander is chosen, its **color-identity fan** radiates from the quadrant's inner corner (WUBRG order, ~60% opacity, thin seams; mono is one wash), and the seat's **sigil** appears. A quadrant's content: seat label and status pill in the outer top corner; the commander card full height in the outer bottom corner (dashed "?" frame until chosen); a detail column (commander name, colors, bracket, deck fit, the player's record with this deck).

**All of a player's actions sit on their own quadrant only:** Change deck · Choose mat · Ready / Not ready · Leave seat. The host adds Invite (email, link, QR) on an empty quadrant and the AI configurator on an AI quadrant. The **center panel**: the table's rules as the chips of Section 10.2, with a small **Edit** the host may use while no seat is ready; the line *Launches when all are ready · n to go*. **No Launch button:** when every human is ready a 10-second countdown starts, cancelable by the host; AI seats never hold it. **The d20** rolls for first player as the game starts and animates to the result it was sent (STUB). **Table talk** continues beside the square, the same conversation as the lounge's, now scoped to the table; a lounge message still reaches a seated player as a quiet line.

**Change deck** opens over the square: a strip of the player's decks (art, colors, bracket, the record with each); one primary *Use <deck> at Seat n*. **Choose mat**: a strip of playmat art with a live preview of the zones over it. STUB lists and art.

### 10.4 Open games and the detail card

Each table in the column is one object: small commander art per seat, the host's sigil, player count and seats free, turn and elapsed time (or *in the lobby · 2 of 4 ready*), the bracket, and an access badge: **Open** (green ring; Join a free seat) · **Invite-only** (amber; Request invite, which the host sees on their square) · **Private, viewable** (blue with an eye; Spectate) · **Private, restricted** (gray with a lock; not clickable). The detail card between click and action: length of game, players and free seats, each player's commander with current life, the rules in one line, the spectator count, and only the buttons the access state allows: Join · Spectate · Request invite · Close. A friend's table carries their name in the lounge's color.

### 10.5 Standing

STUB, final styling, fake data: your record by deck (W-L, last ten, average finish, deals kept); a friends leaderboard among the people you have played, with an *AI games* filter; a season (games, wins, the commander you won most with); a deck ladder (your decks by win rate, with games played). Each row opens the deck in the app (a link, nothing built behind it).

### 10.6 The spectator

A spectator enters from Open games at the camera view and may walk to any seat. They see no hand and no inside of any library, graveyard or exile, only counts. They never act and are not counted; chairs show the watcher count. Spectators may use table talk if the table rule allows. (STUB from the sample, with hands and piles reduced to counts.)

## 11. Carried: the newcomer's path

- **The first turn** is narrated softly: the one button's label grows a one-line hint under it (*Playing a land is free once a turn*), the seven steps pulse once as they pass, and the Coach's drawer is open with *What should I do first?* already answered. The hints fade after the first game and can be turned off.
- **The Coach** (a speech bubble with a wand, in the strip) opens as a drawer with three questions drawn from the current decision (*Should I attack? What does X do? What is the biggest threat?*). Replies are one to three very concise sentences, usually one, with **Show me** (lights the named cards in the callout grammar) and **Why?**. The Coach never acts. All replies are stubs.
- **The rules helper**: *How does this resolve?* on any stack entry or combat readout, answered in a sentence or two, attached to the entry. STUB.
- **Refusals teach**: a refusal's words are the lesson; the Coach's *Why?* beside it says the rule in one sentence.
- **Nothing is ever decided for them.** Carried means named and offered, never done.

## 12. Phones

Landscape only. The stage compresses: your board full width, chairs as three pills across the top (sigil, life, open mana; tap to lean in), the one button at the thumb, the hand as a fan from ✋, the timeline as a thin line. Swipe left or right walks the camera between seats. Every drag has a tap alternative. Decision cards take the whole width under the strip.

## 13. Settings › Play

Stop at every step of my turn (off) · Reduce motion · Overlay (off to loud) · Sound: Effects, Music, Mute · Card size · Hand size · Change marks (on) · Timeline (on) · Threat lens on by default (off) · First-turn hints (on) · Theme (four swatches) · AI Coach settings (Suggest cards I don't own · Prefer what I own first · Stay inside the deck's bracket · Advice length · What the Coach may see · Spending meter, read-only).

## 14. The one architectural rule

**The server is the authority.** The screen renders the latest view for its seat, lets the player choose among `view.decision.options`, sends that choice, and never computes legality, never infers hidden information, never changes the game. The only actions outside the options are Concede, End game for everyone, and the "stop at every step of my turn" preference. Put all traffic behind **one adapter**: views in, frames out. The mock plays back the sample; the real connection replaces the mock later without touching the rest. The timeline, the change marks, the replay and the story are built from views the client already received and from history lines; they fetch nothing and infer nothing.

## 15. Rules the prototype must hold

- Every game action comes from `view.decision.options`; the only exceptions are Concede, End game for everyone (confirmed twice; any human may use it), and the step-by-step preference.
- Nothing names a hidden card in any tooltip, label, log line, callout, replay frame or story beat. The view is already filtered; never fetch more. A spectator sees even less.
- No decision is ever made for the player. Skip to end stops on anything on the stack or any non-priority question. The end step always asks. Earmarks, deals and the threat lens never act.
- **American English and US formats** (color, gray, canceled; $1,234.56; Sep 25, 2026; 2:42 PM). Card names keep their printed spelling.
- **Sizes are sliders or dividers, never steps.** Draw both ends; the minimum stays legible, the maximum fits.
- Text at or above 10px; contrast 4.5:1; every action keyboard-reachable with a visible focus; every card and control named for a screen reader (never a hidden card); one polite live region for the strip's state; every seat marked by sigil and color, never color alone.
- Card images from `https://api.scryfall.com/cards/named?exact=<name>&format=image` with `&version=small|normal|large`; shown unaltered; fetched politely and cached.
- A refusal always arrives with a fresh view and never changes the game; show its words under the one button.
- Reconnect: a thin "Reconnecting…" bar at the top edge, the board unchanged; a seat is away for up to 5 minutes before it concedes; everyone sees the clock; the returning player gets the "You were away" card.
- Paints in under a second on the sample; smooth at 250 permanents; nothing below the window edge; nothing clipped at an edge; no other player's hand ever visible.
- The playmats are the table and the four themes are the app's: the prototype uses placeholder art for both and keeps them swappable.

## 16. Fixtures to render

From `sample-views.json`: the first view of each of the 19 decision kinds; a deep stack; a 250-permanent board; a four-seat and a two-seat game; a mulligan; blockers; damage assignment; a search; the away state; a refusal; game over. Build the timeline and the replay from the sample's sequence of views. For the lobby and Open games, invent a dozen tables across the four access states. For the story, invent the beats from the sample's history lines. For the spectator view, reuse a sample view with hands and piles reduced to counts.

## 17. Real versus stubbed

| Real in the prototype (from the sample views) | Stubbed (fake data, final styling) |
| --- | --- |
| The stage, chairs, lean-in, the walk, the mat and the bend, the counter, vitals, the hand, the one button, decision cards, refusals, the seven steps, the stack as cards, the threat lens, the timeline and scrubbing, change marks, "What did I miss?", the away card, Turn Resources, layout presets, dividers, pane menus, callouts and the debug toggle, dice on cards, earmarks, the keyboard, phones | Coach and rules-helper replies, table talk and the lounge's presence list, emotes, voice and video tiles, deals, Open games and detail cards, join and invite requests, the return banner's live table, the spectator projection, invites and QR, Standing, the d20's roll, Choose mat art, the story's beats where the sample has no event data, Share the story |

## 18. Quick keys

Space pass or resolve · N next step · H hand · 1–4 lean in on a chair · V then 1–4 walk to a seat · T threat lens · M what did I miss · C coach · L cycle layout · ? what can I do · Esc hide transient panels and return to now.

## 19. What to hand back

`HANDOFF.md` with:

1. The concept in a paragraph, with screenshots of Play home, New table, the lobby, each preset, the lean-in, the timeline, the replay, the away card, the callouts, the story.
2. Where the adapter is: where views come in and frames go out.
3. Every view field the concept reads.
4. Everything it wanted that the view does not carry, and why. Expected: a structured record of events since the last revision (for markers, the story and the callouts); a spectator projection with pile counts only; a chat channel with a lounge scope and a table scope; a list of open tables with their access state, seats and turn; invite requests reaching the host; the roll frame; attachments, tokens, summoning sickness, colors and mana cost, the face up; a seat's away clock; filed results with friends, for Standing. These become requests to the engine.
5. Every assumption this brief did not state.
6. The libraries used, and their licenses.
7. Every animation with its duration and its reduce-motion fallback.
8. Every stub with the shape of the data it expects, so each can be wired without redesign.

Note for the implementers who follow: the production board is plain JavaScript and CSS. A framework concept is a reference to port, not code to merge, unless the owner decides otherwise.

## 20. How it will be judged

- A first-time player gets from Play to a game against the AI in two taps, finishes a turn with the one button and never reads a rule, and knows what happened while they looked away.
- A host sets a table for three friends, with its rules, in under thirty seconds and has the invite link in hand without looking for it.
- A competitive player answers "who can respond, with what, and what resolves first" without opening anything, and reads any card at the table in one gesture.
- A player who stepped away for two turns reads the board in ten seconds.
- The table reads as a table with people at it; an attack feels like an event; the end feels like a story.
- It paints in under a second on the sample and stays smooth with 250 permanents.
- Every stub looks final and fails loudly if it tries to do something Section 15 forbids.
