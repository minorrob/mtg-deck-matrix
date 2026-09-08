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

## The five things the engine cannot see

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

Rule 103.5c gives ordinary multiplayer Commander a free first mulligan; the engine
bottoms a card on it. Rule 103.8c has every seat draw on its first turn; the engine
skips the first draw for half its seeds.

**Why it matters.** Every mana and opening-hand finding is biased before a decision is
made, and those findings are what the Lab shows first.

**Cost: small.** It is two conditions. It will move every published number, so it needs
a new engine generation and a re-sweep of the ladders — which is the real cost, and the
reason it has not been done casually.

### 5. Held answers are counted without being spent

The lens policies now remove the card, which fixed repeated reuse across turns. What
still does not happen: the mana is not debited, the coloured payment is not checked,
and no legal target is required. So multiple available answers can be counted against
the same resources, and a tapped-out pilot can receive protection credit.

**Cost: small**, and it belongs with item 3 — both are "spend the resource you claimed".

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

Still available and not yet surfaced:

| Figure | Where it already lives | What it would tell the reader |
|---|---|---|
| Per-seed scores | `result.perSeedScores` | How much of a difference is seed noise |
| Coverage detail | `report.coverage.unreadable` | Which cards the number does not describe |
| Turn distribution | not kept, but cheap to keep | Whether "turn 12.5 on average" is one hump or two |

**Cost: none beyond rendering**, except the last, which needs a histogram kept per run.

---

## Order of work

1. **Typed, exclusive mana payment** (item 3) and **spend the held answer** (item 5).
   Same area, same discipline, biggest correctness gain per hour.
2. **Per-seed scores and the turn distribution in the report.** Free or nearly so, and
   they make item 1's effect visible. (Loss causes and the pod detail are done.)
3. **Refuse to score a win path the engine cannot see** (item 2's guard). Cheap, and
   it stops the Lab confidently giving wrong advice about spellslinger lists.
4. **Storm count, rituals, copies, named win conditions** (item 2 proper). New engine
   generation.
5. **Opening procedure** (item 4). New engine generation, re-sweep the ladders.
6. **Interaction that can deny a cast** (item 1). Only inside the four-seat
   foundation; a sampled version is a label, not a fix.

Items 4, 5 and 6 each change every published number, so each needs its own engine
generation, its own re-sweep, and old results quarantined rather than reinterpreted.
That rule is not negotiable and it is why the order above front-loads everything that
does not trip it.

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
