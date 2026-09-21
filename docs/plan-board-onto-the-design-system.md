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
| 11.3 | **End game** is a permanent fixture in the action box; risks a misclick | Step 3. It is also **already duplicated** — `setup.mjs:139` has "End current game" — so removing it from the action row loses nothing |
| 11.4 | Stuck on **Untap** with no lands and nothing tapped | Rules behavior, not design — see below |
| 11.5 | "End my turn" *and* "Auto-pass turn" both present; one should be **Skip step** | Step 3 |
| 11.6 | "Continue from Untap" jumped to Main 1, skipping the card draw | **Probably correct rules** — see below |

### 11.6 is very likely not a bug

The board said *"D1 Quintorius Spirits, you are going first!"* **In Magic, the player who goes
first does not draw on their first turn.** So a jump from untap to main phase 1, with no draw, is
the rule being applied.

What *is* a defect is that nothing said so. He clicked the draw pile, was told the draw "had to
wait until my draw step", and then watched the draw step not happen — which reads as the game
losing his card. The board should say the first-turn draw is skipped because he is on the play.

**This needs confirming against the engine before anything is built on it.** It is stated here as
the likeliest reading, not as a finding.

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
