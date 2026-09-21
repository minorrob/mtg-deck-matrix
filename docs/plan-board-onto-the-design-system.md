# The board is not on the design system — plan

**Rob, 2026-09-21:** *"You need to clean up your approach on this build. Get consistent, Be
thoughtful. This local game view looks nothing like the redesign I had shared with you and nothing
like the cloud-based versions (Lobby also)."*

He is right, and the cause is not drift.

---

## The measurement

| | design tokens referenced | raw hex literals |
|---|---|---|
| `game/ui/review.css` | **0** | 96 |
| `game/ui/mats.css` | **0** | 72 |
| `game/ui/online.css` | **0** | 154 |

`game/ui/review.html` loads `review.css`, `mats.css`, `setup.css` and `online.css`. **It does not
load `crankmagic-design.css` at all.**

So the board shares nothing with the redesign — not a token, not a type scale, not a stylesheet.
It is a second visual system that happens to live in the same repository. No amount of
defect-by-defect correction converges it, which is exactly what the last eleven batches of lobby
work should have made obvious sooner.

**This was already recorded and not acted on.** `docs/audit-standards-2026-09-20.md` named
`game/ui` at a raw-hex ceiling of 475 as "the remaining blind spot of the same kind" as the graph
canvas, and named the mat surface against wireframes 2e/2f as never compared. Both were true then
and are true now. Writing a gap down is not the same as closing it.

---

## What went wrong in the approach, plainly

Eleven batches of lobby fixes were **reactive**: each one answered the defect in front of it. That
is the right mode for a surface already in the system and wrong for one that is not, because it
optimizes the thing being looked at while the thing next to it stays where it was. The lobby is
now measured against wireframe 2b by a suite; the board has never been measured against anything.

The consistency Rob is asking for is not "be more careful". It is that **one surface should not be
held to a standard the surface beside it is not held to at all.**

---

## The plan

Not batches. One conversion, in four steps, each with the guard that keeps it converted.

### 1. Put the board on the tokens
`review.html` loads `crankmagic-design.css` before its own sheets, and the board root carries the
same `#matrix-v2` scope the workshop uses — **or**, if that scope proves wrong for a full-bleed
play surface, the tokens are lifted to `:root` in the design sheet so both can read them. That
decision is made by reading the design sheet, not by preference, and recorded either way.

### 2. Convert the literals
322 raw hex values become tokens, in the same order the workshop's sweep ran: surfaces, then ink,
then lines, then status. The mat art and the card frames are **not** tokenized — they are
pictures, the same exception the sea elements got.

### 3. Measure against the design
Wireframes 2e (game canvas) and 2f (focus view) and the README's
"Addendum — Play: Table view, Focus view, tabletop". The lobby's tooling already does this:
`tests/wireframe-conformance.mjs` for structure and content, `tools/compare-to-screen.mjs` for
pixels where a hi-fi screen exists. Board pairs go in the same places rather than into something
new.

### 4. Ratchet it shut
`tests/design-tokens.mjs` gains `game/ui` at whatever the count is after step 2, so it can only
fall. That is the guard that was missing, and its absence is why 322 literals accumulated without
anyone noticing.

---

## Rob's board findings, 2026-09-21

Recorded here rather than patched one at a time, because most of them are the conversion's work.

| # | What he found | Where it belongs |
|---|---|---|
| 11.1 | "Build your table" appeared after the lobby, though the table was already built | Step 3 — the board should not offer setup for a table that exists |
| 11.2 | "a LOT of old code. Still old design." | The conversion itself |
| 11.3 | **End game** is a permanent fixture in the action box; risks a misclick | **Done, Stage A.3.** Removed from the action row; `setup.mjs:139` keeps "End current game" behind a two-click confirm |
| 11.4 | Stuck on **Untap** with no lands and nothing tapped | **Done, Stage A.2.** Not a rules problem at all — the board read a spent prompt as a live decision. See below |
| 11.5 | "End my turn" *and* "Auto-pass turn" both present; one should be **Skip step** | **Done, Stage A.3.** "Auto-pass turn" removed; "Skip to end" in the header does that job through `maySkipToEndOfTurn` |
| 11.6 | "Continue from Untap" jumped to Main 1, skipping the card draw | **Probably correct rules** — see below |

### 11.6 is not a bug — in a two-player game

The board said *"D1 Quintorius Spirits, you are going first!"* and the game Rob was testing had
two players, him and one AI. **CR 103.8a: "In a two-player game, the player who plays first skips
the draw step of their first turn."** So untap jumping to main phase 1 with no draw was the rule
being applied correctly.

I first wrote this as a general rule and Rob corrected it: **it is not one.** There is no
equivalent clause for ordinary multiplayer, so in a four-player Commander pod everyone draws,
including whoever goes first. The skip belongs to two-player games and to shared-team-turns games,
and to nothing else.

That correction turns one finding into two things to do.

**The defect that stands.** Nothing explained it. He clicked the draw pile, was told his draw "had
to wait until my draw step", and then watched the draw step not happen — which reads as the game
losing his card. The board should say the first-turn draw is skipped because he is on the play,
and say it in the place he was just refused.

**The thing to watch for.** If anything on our side of the bridge encodes "the starting player
skips the first draw" without asking how many players are at the table, it is correct in Rob's
two-player test and **wrong in every four-player pod** — which is the only size that matters for
this product. Forge implements the comprehensive rules and should get this right on its own; the
risk is in our adapter or our UI second-guessing it. **Worth an explicit check in the first
four-player run: does the starting player draw on turn one?** If they do not, that is a real bug
and this is where it was predicted.

### 11.4 is a real one

No player receives priority during the untap step. Being asked to act there is wrong regardless of
how the board looks, and "if nothing is tapped and there is no mana, check it off and move on" is
the right behavior. Whether that is fixed in the adapter or asked of Forge is a question for the
engine work, not for this conversion.

---

## What Rob actually wants, stated by him after the plan above

> "Local should be an exact replica of the github version, however I ONLY need the Play capability
> (I actually don't want anything else shown to users when they're using the public link. I want
> them to go to the github link for the full solution) and the infrastructure to support human and
> AI players carrying in decks they build in CrankMagic, then playing full Magic the Gathering
> Commander games as though hosted by a true MtG Commander expert system that knows the rules, the
> cards, and helps every player move at the speed they move at (not the speed the computer moves
> at; e.g. we don't leave users hanging for 5 seconds to wait for a button to enable or appear)."

This is a better plan than the one above and it replaces its first step.

### Three audiences, one app

| Who | Where | Sees |
|---|---|---|
| Rob, hosting | `http://127.0.0.1:8768/app/` | Everything. Already an exact replica — same `index.html`, same scripts, same stylesheets as github.io. |
| Guests, invited | the cloudflared link | **Play only.** No Decks, no Library, no Explore. The full solution is at github.io and they are sent there for it. |
| Anyone | `https://minorrob.github.io/...` | Everything, minus the ability to start a game. |

**The workshop is already an exact replica.** What is not a replica is `/review` — a separate page
with its own stylesheets and no tokens. So the board does not need "converting to match"; it needs
to stop being a separate page and become the Play surface of the one app.

That is a different and larger change than tokenizing three stylesheets, and it is the right one:
tokenizing them would make a second system that merely resembles the first, and it would drift
again the moment either side moved.

### What that makes the work

1. **The board becomes a view of the app**, drawn in the same shell, reading the same tokens, with
   the same rail and the same type. `review.mjs` keeps the engine plumbing — the bridge, the
   polling, the action policy — and loses its own chrome.
2. **The public link serves the same app with the rail reduced to Play**, and says where the rest
   of it lives. One build, one stylesheet, a navigation difference.
3. **Then** wireframes 2e and 2f are what it is measured against, with the same two tools the
   lobby uses.

### The speed requirement is a first-class item, not polish

> "helps every player move at the speed they move at (not the speed the computer moves at; e.g. we
> don't leave users hanging for 5 seconds to wait for a button to enable or appear)"

This is a design constraint on the board and it needs its own measurement, the way the lobby's
overlap got one. A control that is going to become available should be present and disabled with a
reason, not absent and then appearing; a poll that gates a button should not be the thing a person
waits on. **Nothing here is built until there is a number for how long each control takes to
become usable**, because "feels slow" cannot be fixed and 5,000ms can.

---

## Recommended order of execution

Four stages. The principle: **make the game playable before making it look right**, because
redesigning a surface whose interaction model is still wrong means doing it twice. Stage A
therefore changes only *behavior* — what is presented and when a control becomes usable — and
nothing about appearance, so none of it is thrown away by Stage B.

### Stage A — a game you can actually play through

Nothing here is a redesign. Everything here survives one.

1. **Put a number on the lag.** "We don't leave users hanging for 5 seconds" cannot be fixed until
   each control has a measured time-to-usable. A probe drives a real match and records, per
   control, how long from the state arriving to the control being enabled. That number is the
   acceptance test for the rest of this stage.
2. **Stop asking for input where no player has priority.** Untap is the case Rob hit; the same
   question should be asked of every step the board presents.
3. **Remove the duplicate and the dangerous.** `End game` out of the action row — it is already in
   Game setup, so nothing is lost. One turn control, not two.
4. **Say what the rules just did.** The skipped first draw is the example; any step the engine
   skips on the player's behalf should say why, in the place they were refused.
5. **Rob plays a four-player pod end to end.** This is the point of the stage. It also settles the
   four-player draw question above.

**Checkpoint:** a full game played without needing me. Everything after this is quality.

### Stage B — the board becomes the Play surface of the one app

The large one. The board stops being `/review` with its own stylesheets and becomes a view drawn
in the same shell, on the same tokens, with the same type — `review.mjs` keeping the bridge, the
polling and the action policy, and losing its own chrome. Measured against wireframes 2e and 2f
with the two tools the lobby already uses, and `game/ui` added to the raw-hex ratchet so the 322
literals cannot come back.

**Why not first:** its whole value is that the play surface looks like the product. If the
interaction model underneath is still wrong, that value is spent twice.

### Stage C — the public link shows Play only

Small, and depends on B. One build, the rail reduced to Play for guests, and a line saying the
rest of CrankMagic is at github.io.

### Stage D — setting a table up from the web

Pieces 2 to 5 of `plan-web-to-local-table-2026-09-21.md`: Send Local, invitations into the web
lobby, Ready packaging a deck. **Genuinely last, because setting a table up locally already
works** — this stage buys convenience, not capability, and the stages above buy capability.

---

## What I would not do

- **Not tokenize the three board stylesheets.** It would produce a second system that resembles
  the first and drifts the moment either moves. Stage B is more work and is the only version of
  this that stays true.
- **Not carry on in batches.** The last eleven were reactive and that is what Rob objected to.
  Each stage above ends at a checkpoint he can judge, rather than at whatever he happened to
  notice.
- **Not build on the first-draw reading until a four-player game has run.** It is correct for two
  players and would be wrong for four, and no one has watched four.

---

## Stage A.2–A.4, done 2026-09-21 — what the untap stall actually was

**It was not a rules problem, and it was not slowness.** Read from the running host rather than
reasoned about:

`ForgeBrowserBridge.view()` builds `okEnabled` as `okEnabled && activeInput`, where `activeInput`
is whether Forge has an input queued for this seat. It builds `prompt` from Forge's
`showPromptMessage`, and **never clears it** — a prompt stays on screen after it has been answered,
until the next one replaces it.

So in the gap between two decisions the board held:

| | |
|---|---|
| `ui.prompt` | the **previous** `Priority: <Rob>…` string, already spent |
| `ui.okEnabled` | `false` — nothing queued |
| `ui.inputType` | `""` — Forge naming no input |
| `state.phase` | `UNTAP` — the projection updates on engine events, which run ahead of prompts |

`review.mjs` tested `/^Priority:/` against that spent prompt, concluded the decision was live, and
`hasPriority()` confirmed it by matching the name in the same spent string. The board therefore
said **"Your action · play a card or use a board ability"** and drew a **"Continue from untap"**
button that was disabled, because `okEnabled` was false. Rob sat looking at his own action he
could not take. When the engine reached a step where somebody really did have priority, the button
enabled — *"Eventually it showed me the button"* — and pressing it passed priority at **that**
step, not at untap, which is why it landed in main phase 1.

**Two findings, one cause.** 11.4 and the confusing half of 11.6 are the same defect: the board
described a step the decision was not about.

### The fact to stand on

`ui.inputType` is the class name of the input Forge has queued for this seat, and the empty string
when there is none. That is Forge's own answer to "is anybody being asked anything", and it needs
no inference. `engineIsWorking()` in `action-policy.mjs` uses it, and **fails closed** for an older
adapter that does not send the field — the same rule `paymentMayAutoResolve` already followed.

Rob's proposed rule was *"If there is 0 mana on the board OR if no cards are tapped, then Untap
step should be checked off automatically."* The engine already moves on by itself; there was never
anything to check off. What needed fixing was the board claiming he had to act. **CR 502: "No
player receives priority during the untap step."**

### What changed

1. `hasPriority()` returns false while the engine is working, so a spent prompt cannot be read as
   a live decision.
2. The board says what is true — *"Untap · no player acts in this step"*, or the name of whoever
   is being waited on — and shows **no button** rather than a dead one. A disabled control reads
   as broken; an absent one reads as "not yet", which is what it is.
3. `Auto-pass turn` and `End game` left the action row (11.3, 11.5). Neither is lost.
4. Clicking your library on a skipped first draw now explains **CR 103.8a** instead of saying the
   draw "had to wait" for a draw that was never coming — and `firstDrawSkipped()` asks how many
   players are at the table, so it stays silent in a pod.

### Still open, and deliberately

**Nobody has watched a four-player pod.** The first-draw rule is two-player only; if a starting
player fails to draw in a pod, that is a real bug and this is where it was predicted. That is
Stage A.5, and it is Rob's to run.

### The four-player prediction, checked on our side

The risk named above was: *"If anything on our side of the bridge encodes 'the starting player
skips the first draw' without asking how many players are at the table, it is correct in Rob's
two-player test and wrong in every four-player pod."*

**Checked, and it is not present.** Exactly two places in our code reason about the first-turn
draw, and both ask:

| | |
|---|---|
| `ForgeBrowserBridge.java:102` | `!(getTurn()==1 && getPlayers().size()==2)` — gates whether the draw-step card is offered |
| `action-policy.mjs` `firstDrawSkipped()` | `turn===1 && players.length===2 && turnPlayerId===viewer` — gates the explanation |

Neither performs or suppresses the draw itself; that is `PhaseHandler.onPhaseBegin` in Forge. So in
a pod, the draw-step card **is** offered to the starting player on turn one and no explanation
fires.

This narrows Stage A.5 but does not close it: **Forge's own behavior in a four-player pod still has
not been watched by anyone.** That remains the thing to check first and trust least.

---

## Stage A.5, the rules half: answered 2026-09-21, from Rob's own pod

**The starting player DOES draw on turn one in a four-player pod. The predicted bug did not
happen.**

Read out of the match journal of the pod Rob was playing
(`game/.local/games/2026-09-21T22-06-46-581Z/events.ndjson`), not asserted:

```
T1 DRAW  D5 Shadrix Aristocrats      · Library -> Hand  (Make a Stand)
T2 DRAW  2nd D5 Shadrix Aristocrats  · Library -> Hand  (Thought Vessel)
```

Corroborated by the projection snapshots: the turn player's library fell 92 → 91 on turn 1, and
again for the next player on turn 2. Forge applies CR 103.8a by table size, as it should.

So the whole of the first-draw question is now settled: **skipped at two players, taken at four,
and our two call sites both ask the table size before saying anything.**

### The tool, and the false alarm it nearly raised

`tools/first-draw-check.mjs` watches a live game and answers this question by itself. Its first
version had the defect it was built to catch: pointed at the pod while it was still on its
mulligans, it watched for eight seconds, saw no library fall, and announced **"THE BUG THIS WAS
PREDICTED TO FIND"**. Nothing was wrong — the game had not dealt opening hands.

**"No draw seen" and "no draw happened" are different facts.** The tool now returns `unknown`
unless the watch actually covered turn 1's draw step, and refuses up front if started after it.
`tests/first-draw-check.mjs` pins that apart, because a measuring tool that cries wolf is worse
than no tool.

### What is still Stage A.5

The rules question is closed. **Playing a pod end to end is not** — that is Rob at the table,
judging whether it is a game he wants to play, which is the checkpoint the stage exists for.
