# Simulator enhancement plan

What the Deck Lab's loop cannot answer today, why, and the order to fix it in.

Written 8 September 2026, after a session that fixed everything fixable **outside**
the engine: the loop's time budget, its acceptance test, its candidate pool, and the
per-card accounting behind its rankings. Those are shipped. What is left needs the
engine changed, and each item below says what would have to change and what it would
cost.

This is a companion to `design/crankmagic/simulation-fidelity-plan.md`, which argues
the long-run architecture. This one is narrower and nearer: **the smallest engine
changes that would make the Lab's recommendations worth acting on.**

---

## What is already true, and should not be re-litigated

- The loop **does** run the engine on every candidate. It always did. It was fast
  because it stopped early, not because it was faking.
- Measurement sits inside the loop: baseline, screen every candidate, confirm the
  best on a larger sample, keep the swap, re-baseline, repeat.
- No published number moved in any of this work. `cardStats` is a readout; it has
  never fed a score.

---

## Status, 8 September 2026

Items **3, 5 and 6 are done**, and item **4** with them. Items 3 and 5 shipped in engine
v2.7 and this document had not been updated to say so. Items 4 and 6 shipped in **v2.8**,
together, because each of them moves every published number and the generation rule says
that costs a re-sweep — so they were done in one, and the 200 viewer rungs and the six
decks were re-measured together on v2.8.

**What v2.8 changed, and by how much.** Measured, not estimated: the six decks were run
three ways — on v2.7, with the ramp fix alone, and on full v2.8.

| Deck | v2.7 | ramp fix only | v2.8 | ramp Δ | opening Δ |
|---|---|---|---|---|---|
| D1 Quintorius | 73.90 | 73.45 | 78.83 | −0.45 | +5.38 |
| D2 Chulane | 53.57 | 53.52 | 58.73 | −0.05 | +5.21 |
| D3 Atraxa | 73.15 | 73.13 | 78.55 | −0.02 | +5.42 |
| D4 Felothar | 63.97 | 63.97 | 70.65 | 0.00 | +6.68 |
| D5 Shadrix | 75.73 | 75.73 | 80.30 | 0.00 | +4.57 |
| D6 Krenko | 64.13 | 63.72 | 68.67 | −0.41 | +4.95 |

So **the whole of the rise is the opening procedure**, not the ramp fix. That is the
honest reading and it is worth stating plainly: these six lists carry one card of the 33
whose ramp reading changed (Skyshroud Claim, in D2, and it went up). The ramp fix will
matter in the Deck Lab, where any green list can draft Rampant Growth or Solemn
Simulacrum, and it barely touches the six published decks. Nobody should read +5 points
as "the decks got better"; the engine stopped playing half its games a card down and
stopped shorting every mulliganed hand.

---

## The six things the engine cannot see

### 1. Every drawn spell is eventually cast

**The symptom.** In a measured hundred, essentially every nonland card reads 99-100%
cast. The reader saw that and correctly said it was impossible. Half of it was an
accounting bug, now fixed. The other half is real: a game in this model runs ten to
fifteen turns, mana only goes up, and nothing an opponent does can stop a spell. So a
card that is drawn is a card that resolves.

**Why it matters more than it looks.** Cast rate was the loop's main ranking signal
and it ranks nothing when it is constant. This session replaced it with
"drawn and still stranded in hand at turn eight", which does vary — but that is a
proxy for cost, not for quality. The engine still cannot say *this card was bad*, only
*this card was expensive*.

**What would have to change.** Opponents that interact: counterspells, targeted
removal, discard, and a stack for them to happen on. That is the four-seat foundation,
not a patch. **Cost: large.** It is item B in the fidelity plan's delivery table.

**Cheaper interim.** Give the sampled opponent profiles a per-turn *interaction rate*
that can deny a cast, drawn from the profile rather than from a real board. It would
make cast rate vary and it would be honest as long as the report says the denial is
sampled, not played. **Cost: small. Value: makes one number vary; does not make it
true.** I would not ship it without the label.

### 2. There is no storm count, and no single-card win

**The symptom.** A real mono-red Thor list — 19 instants, 18 artifacts, Mana Geyser,
Seething Song, Reiterate, Jeska's Will — scores 34.55 against the six baked decks'
71-86, on a 0.8% win rate. That is not a verdict on the deck. It is the engine saying
it cannot see how the deck wins.

**Why it matters.** The Lab will confidently refine a spellslinger list toward
creatures, because creatures are the only win it can measure. That is not a weak
recommendation, it is a wrong one, and the reader has no way to tell from the score.

**What would have to change.** Three things, in this order:
1. **A spell counter per turn and per game** (storm count), and a ritual that adds
   mana back rather than only ramping permanently.
2. **Copy effects** as a distinct resolution, not a second cast.
3. **Named alternate win conditions** — Thassa's Oracle, Approach, Aetherflux — as a
   checked condition with its prerequisites, not as a damage bonus.

**Cost: medium.** None of it needs the stack. All of it needs a per-turn resource
model that debits and refunds honestly, which is item 3 below.

**Until then**, the engine should refuse rather than score. It already knows how to:
`assertMeasurable` throws when coverage is too low. It should also throw — or
prominently label — when a list's win path is one it does not model. A deck whose
instants and sorceries outnumber its creatures three to one is the cheap detector.

### 3. Mana is untyped where it matters

**DONE in v2.7.** Typed, exclusive payment landed: a pool of typed mana, each source
contributing once, each pip paid from it and removed. `{C}` is colourless again rather
than every colour. `tests/slot-model.mjs` compares the page's copy of the rules against
the engine's over the whole catalog.

**The symptom.** `add {C}{C}` is treated as every colour; castability checks each
colour pip independently against a source count. Sol Ring can pay a coloured pip. One
multicolour source can appear to cover two incompatible simultaneous requirements.

**Why it matters.** Every mana-base recommendation the Lab makes rests on this, and
so does the "Casts its spells" score part, which is 15 of the 100 points.

**What would have to change.** Typed, exclusive payment: a pool of typed mana, each
source contributing once, each pip paid from it and removed. It is contained — one
function, `castable`, and the place that spends — and it is the highest ratio of
correctness gained to work done in this whole document.

**Cost: small-to-medium. Do this first.**

### 4. The opening procedure is wrong in two known ways

**DONE in v2.8.** Both conditions corrected, and the re-sweep they cost has been run. The
size of the effect is in the status table at the top of this document: +4.6 to +6.7 points
on the six published decks, which is what half the games being played a card down and
every mulliganed hand being a card short was worth.

Rule 103.5c gives ordinary multiplayer Commander a free first mulligan; the engine
bottoms a card on it. Rule 103.8c has every seat draw on its first turn; the engine
skips the first draw for half its seeds.

**Why it matters.** Every mana and opening-hand finding is biased before a decision is
made, and those findings are what the Lab shows first.

**Cost: small.** It is two conditions. It will move every published number, so it needs
a new engine generation and a re-sweep of the ladders — which is the real cost, and the
reason it has not been done casually.

### 5. Held answers are counted without being spent

**DONE in v2.7.** A held answer is now paid for cheapest-first out of an `answerPool`
taken from the same typed mana the turn had, so two answers cannot be counted against one
untapped land and a tapped-out pilot receives no protection credit.

The lens policies now remove the card, which fixed repeated reuse across turns. What
still does not happen: the mana is not debited, the coloured payment is not checked,
and no legal target is required. So multiple available answers can be counted against
the same resources, and a tapped-out pilot can receive protection credit.

**Cost: small**, and it belongs with item 3 — both are "spend the resource you claimed".

### 6. A spell that fetches one land is credited with two mana

**DONE in v2.8, in both directions.** Found while extending `tests/slot-model.mjs`. `rampAmount` is:

```js
/add \{[wubrgc]\}\{[wubrgc]\}|search your library for (?:a|up to two|two) (?:basic )?land/.test(text) ? 2 : 1
```

The alternation puts `a` beside `up to two` and `two`, so **Rampant Growth, Solemn
Simulacrum, Sakura-Tribe Elder, Farhaven Elf, Crop Rotation** and eight more — 13 cards
in today's catalog — each add two permanent mana sources when they fetch one land. Worse,
it is inconsistent rather than uniformly generous: Nature's Lore and Three Visits fetch
one land and are credited one, because they say "a Forest card" and never the word
"land". So two functionally identical cards ramp at different rates.

It was worse than the plan first said: 31 cards, not 13 — the smaller figure counted only
the ones that also read as ramp. And the mirror-image case was real too. Because the rule
required the literal word "land", **Skyshroud Claim, Nissa's Pilgrimage and
Archaeomancer's Map fetch TWO and were credited one**, since they name a basic land type
instead. Fixing only the direction the plan named would have left the same defect
pointing the other way.

The count now comes from the number word, and the type it names may be "land" or any
basic:

```js
/add \{[wubrgc]\}\{[wubrgc]\}|search your library for (?:up to two|two) [^.]{0,40}?(?:land|plains|island|swamp|mountain|forest)/
```

`tests/slot-model.mjs` pins all four cases — one land by either wording reads 1, two lands
by either wording reads 2.

---

## What the report could show tomorrow, with no engine change

Already shipped this session: the nine score parts with points, maximum and the
engine's own sentence; the targets for the chosen build; per-card rows ranked on a
figure that varies.

Also shipped since: loss causes, idle turns for the other seats, seats still playing at
the end, first elimination turn, and how often an answer was in hand. All of these were
counted by the engine already and dropped at the line that built the report. On a
mono-red Krenko hundred they read: 17.3% of games lost to the combo seat's combo against
4.9% to damage, 1.89 idle turns, 1.54 seats surviving, first elimination on turn 8.9, and
an answer in hand on 3.6% of turns against a 40% target.

**All three of the remaining ones shipped in v2.8:**

| Figure | Where it lives | What it tells the reader |
|---|---|---|
| Per-seed scores | `result.perSeedScores` | How much of a difference is seed noise. The report prints each seed and the spread, so a two-point gap next to a three-point spread reads as the shuffle rather than the list. |
| Coverage detail | `report.coverage.unreadable` | Which cards the number does not describe, named, behind a fold. |
| Turn distribution | `result.endTurnCounts` | Whether "turn 12.5 on average" is one hump or two. One integer per turn, kept for the price of an increment, drawn as a bar per turn. |

Nothing on this list is left.

---

## Order of work

1. ~~**Typed, exclusive mana payment** (item 3) and **spend the held answer** (item 5).~~
   **Done, v2.7.**
2. ~~**Per-seed scores and the turn distribution in the report.**~~ **Done, v2.8**, along
   with the coverage detail.
3. ~~**Refuse to score a win path the engine cannot see** (item 2's guard).~~ **Done**:
   the count is published and named, the report says it above the score, and the Deck
   Lab's refine loop stops once on such a list and explains why.
4. ~~**Opening procedure** (item 4) and **the ramp count** (item 6).~~ **Done, v2.8**,
   together, with the 200 rungs and the six decks re-measured on the new generation.
5. **Storm count, rituals, copies, named win conditions** (item 2 proper). New engine
   generation. **This is the next one.**
6. **Interaction that can deny a cast** (item 1). Only inside the four-seat
   foundation; a sampled version is a label, not a fix.

Items 5 and 6 each change every published number, so each needs its own engine
generation, its own re-sweep, and old results quarantined rather than reinterpreted.
That rule is not negotiable, and it is why v2.8 did the opening procedure and the ramp
count in one generation rather than two: both trip it, so paying for one sweep instead of
two is the only saving available, and it is the right one.

---

## What must not happen

- **No score weight gets tuned to make an average look right.** If a deck scores
  badly because the engine cannot see its win, the answer is to model the win or
  refuse the score, never to reweight until the number is comfortable.
- **No result is carried across a generation.** A score is a claim about a protocol
  and an exact hundred.
- **No recommendation is presented as more certain than its sample.** The `refine`
  protocol exists so a search has an error to beat; nothing measured on it may be
  published as a rating.
