# Mechanics modelling in sim-engine.js — design notes

Covers the additions made to the combat and card-classification model: +1/+1 counters
(growth, doubling, proliferate) and combat keywords (flying, menace, trample, deathtouch,
first strike, lifelink). Written to record *why* each mechanic was modelled the way it was,
and how it should be read against the app's existing scoring vector and the twelve curated
per-variant dimensions (`data/variants.json`'s six playstyle + six engine ratings).

## Why these mechanics, and not others

The request named proliferate, counters, flying, and trample specifically, plus "other
mechanics." Flying's natural combat-keyword neighbours — menace, trample, deathtouch, first
strike, lifelink — are the ones already common enough in this catalog to be worth modelling
(82, 41 Defender, 23 vigilance, 18 proliferate, 15 lifelink, 11 trample, 10 deathtouch, 9 first
strike occurrences across the 666-card catalog). Vigilance, ward, and hexproof were left out:
vigilance has no effect in a model with no separate untapped-for-blocking state, and ward/
hexproof already fold into the existing `isProtection` classification.

## Detection: card.keywords vs oracle text

Scryfall's `card.keywords` array only tags an ability the card *has*, never one it grants or
references for other creatures — but the test harness's `classify()` helper constructs cards
without a `keywords` field, and the engine should work either way. Checked against every card
in `data/cards.json`: a card's own printed keywords always appear on oracle text's **first
line**, comma-separated ("Flying, vigilance, deathtouch, lifelink" on Atraxa), while every
granting/referencing case found (Favorable Winds, Craterhoof Behemoth, Elspeth's ultimate,
Iroas, Vito) puts the keyword in a **later** sentence. `hasKeyword()` therefore checks
`card.keywords` first, falling back to a first-line-only regex — which resolves every false
positive found in that scan without missing a real keyword line, with one refinement: a card
whose entire oracle text is a single line (Favorable Winds: "Creatures you control with flying
get +1/+1.") has no later line for the first-line check to skip past, so the fallback also
excludes any first line containing "you control" — a phrase no genuine keyword line ever uses.
Checked against every keyworded card in the catalog, this excludes exactly one real card from
the text-only path (Sephara, Sky's Blade, whose alternate-cost line 1 mentions creatures *you
control* with flying before her own keyword line 2) — a non-issue in practice, since
`card.keywords` resolves her correctly before this fallback ever runs.

## Counters: growth, not storage

Three real patterns exist in this catalog and are modelled:

1. **Enters with counters** ("enters the battlefield with a +1/+1 counter") — applied once,
   at the creature's own `makeCreatureEntry`.
2. **A source that adds counters** — one-shot (an instant, or a static enters-only clause)
   applies immediately to the board's current biggest creature (no real per-card targeting
   exists in this model — see SIMPLIFICATIONS); repeatable (an activated ability, or a
   trigger opening "at the beginning of" / "whenever") registers a per-turn rate that fires
   every turn from the turn it resolves onward.
3. **Proliferate** — adds one counter to every one of *our own* creatures that already carries
   one, matching the real rule's growth effect while skipping the real choice of which
   permanents/players to target (again, no targeting model exists here).

**Not modelled**: counter *storage and transfer* — The Ozolith's actual text ("when a creature
you control leaves the battlefield... put those counters on The Ozolith... move all counters
from The Ozolith onto target creature") is a genuinely different, more stateful mechanic
(tracking counters on a noncreature permanent across a creature's death) that would need its
own state machine for one card's specific behaviour. It classifies as an ordinary permanent
with no special interaction — an honest gap, not a silent wrong answer.

**Doubling** (Hardened Scales, Vorel of the Hull Clade, Ozolith-the-Shattered-Spire-style "that
many plus one... instead") is a deck-wide flag, exactly like the existing Defender-lifting
flags, checked once in `prepareDeck` rather than at every place a counter gets added.

## Combat: connect rate and deterrence, not real blocking

The existing model already summed attacking power and applied one flat "unblocked" factor
(0.7) to it — there was no lever for evasion to hook into. Rather than build real block
assignment (a much larger change, and the file's own SIMPLIFICATIONS list is explicit that
there is none), evasion is folded into that same factor: flying and menace both raise it to
0.85 (both make a creature meaningfully harder to block on an ordinary board — treated
identically since the model has no board composition to test menace's two-blocker requirement
against), trample lands at 0.78 (some damage gets through a block without being fully
unblockable). Lifelink converts the same connected damage into life gained.

Deathtouch and first strike don't have an attack-side lever — they matter on defense, when a
creature we control is blocking. The existing block-reduction estimate already weights total
toughness on board; both keywords add a flat deterrence bonus on top (deathtouch +2, first
strike +1) as a rough stand-in for "this blocker trades with anything regardless of its own
stats," not a claim about real combat math.

## Mapping to the scoring vector and the twelve curated dimensions

**No new `scoreWeights` key was added.** These mechanics change what happens *inside* a
simulated game — bigger creatures, more damage getting through, more life gained — which
flows through the *existing* eight-component vector (`winRate`, `screw`, `flood`, `commander`,
`interaction`, `clock`, `deadCards`, `fun`) exactly the way a stronger removal suite or a
faster curve already did before this change. Concretely:

| Mechanic | Primarily shows up in |
|---|---|
| Counter growth / doubling / proliferate | `winRate`, `clock` (bigger threats, faster) |
| A repeatable proliferate/counter engine | `clock`; itself reads as a value engine the way any other repeatable trigger does |
| Flying / menace (higher connect rate) | `clock` (damage lands more reliably) |
| Trample | `clock`, modestly |
| Lifelink | `winRate` (survives longer against the table's aggregate damage) |
| Deathtouch / first strike | modest survivability, via the block-reduction estimate feeding into `screw`-adjacent loss avoidance |

**The twelve curated dimensions in `data/variants.json` (six playstyle + six engine ratings)
are unaffected by this change and are not auto-derived from simulation output.** They remain
hand-authored per variant, as they have been throughout this project. This mechanics work
improves the *fidelity of the numbers the engine reports* for a given build (Score, Win%,
etc.) — it does not touch, and this phase did not attempt to build, a pipeline that would
recompute Fortress/Build-up/Convergence/Longevity/Friendly/Flavor or Rate/Card Adv./Clock/
Interaction/Resilience/Assembly from raw per-game metrics. That would be a separate, larger
mapping project (each of those twelve is currently an editorial judgment call, not a
formula), worth considering explicitly if the eventual re-simulation sweep (Phase 6/7 of the
active plan) wants engine output to inform them — but that decision was not asked for here and
is called out rather than done partially and silently.

## Verification

`tests/sim-engine.mjs` gained comparative, synthetic-deck cases in the same style already
established there (e.g. the existing Defender/Arcades walls-vs-attackers cases): a doubler
deck outgrowing an identical deck without one, a proliferate deck outgrowing one without,
flying/trample connecting more damage than an identical ground creature, lifelink recovering
life a non-lifelink attacker of the same power does not, and a deathtouch/first-strike-heavy
defensive board taking measurably less damage than the same stats without those keywords.
