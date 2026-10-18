# Reasonableness report, generator 2026-10-18

*Measured 2026-10-18 06:58 UTC on the published protocol. Inputs: EDHREC reference 2026-10-18, precons 2026-09-28, Rob's library 2026-09-30. tools/sim/reasonableness.mjs; Linear ROB-112.*

A deck the app builds from criteria, beside what people play for the same commander (EDHREC's top ninety-nine by inclusion), the precons, and Rob's own deck where he has one. Composition is the mean absolute difference in role counts (deck-composition.js); overlap is the share of the reference's nonland cards the built deck carries; played is the share of the built deck's nonland cards EDHREC lists for the commander at all; the score is the simulator's, with its standard error, on one protocol for both. Near is good; identical would mean the builder copied, which it does not. EDHREC's list is popularity, not a deck; a precon is a product; Rob's deck is one person's. This is a sanity check on the builder, not a judgment of any deck.

## krenko-aggressive: A given commander, the Aggressive playstyle, bracket 3, $150, owned first; the suite then fences out one card this build took and builds again

Built: Krenko, Mob Boss (given), 99 cards, score 63.87 ± 0.163, $146.88 (cap $150), built in 2651 ms.

| Reference | Cards | Composition distance | Overlap | Played | Score | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| EDHREC top 99 for Krenko, Mob Boss (44,585 decks, 2026-10-18) | 99 | 4.6 (lands +28) | 8% (7 of 91) | 18% | 26.33 ± 0.08 | $588.13 |
| Built From Scratch (CM2, same colors) | 99 | 3.3 (lands -5) | 3% (2 of 58) | 18% | 60.65 ± 0.161 | $104.78 |
| Built From Scratch (C14, same colors) | 99 | 3.3 (lands -5) | 3% (2 of 58) | 18% | 60.65 ± 0.161 | $104.78 |
| Rob's D6 Krenko Goblins | 99 | 3.9 (lands -2) | 12% (7 of 61) | 18% | 67 ± 0.093 | $161.77 |

## green-white-value: No commander: suggested for green and white, Value engine, bracket 2, $75, no library

Built: Samwise Gamgee (suggested), 99 cards, score 65.55 ± 0.131, $73.79 (cap $75), built in 2604 ms.

| Reference | Cards | Composition distance | Overlap | Played | Score | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| EDHREC top 99 for Samwise Gamgee (3,514 decks, 2026-10-18) | 98 | 5.3 (lands +12) | 5% (4 of 74) | 10% | 70.18 ± 0.091 | $501.31 |
| Coven Counters (MIC, same colors) | 99 | 5 (lands -1) | 2% (1 of 62) | 10% | 78.53 ± 0.095 | $47.38 |
| Feline Ferocity (C17, same colors) | 99 | 4.8 (lands -1) | 0% (0 of 62) | 10% | 53.67 ± 0.167 | $116.38 |

## combo-open: Nothing but a playstyle and a bracket: Combo at bracket 4, no cap, no colors

Built: Lagomos, Hand of Hatred (suggested), 99 cards, score 63.88 ± 0.091, $620.96, built in 2206 ms.

| Reference | Cards | Composition distance | Overlap | Played | Score | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| EDHREC top 99 for Lagomos, Hand of Hatred (1,392 decks, 2026-10-18) | 99 | 3.1 (lands +11) | 0% (0 of 74) | 3% | 67.8 ± 0.175 | $337.40 |
| Planar Portal (AFC, same colors) | 99 | 3.4 (lands -3) | 2% (1 of 60) | 3% | 64.25 ± 0.134 | $100.32 |
| Merciless Rage (C19, same colors) | 99 | 2.3 (lands -4) | 2% (1 of 59) | 3% | 49.83 ± 0.154 | $75.67 |

## mono-blue-reactive-cheap: Mono-blue, Reactive, bracket 1, $50: answers on a budget with no Game Changers

Built: Sai, Master Thopterist (suggested), 99 cards, score 71.2 ± 0.082, $49.34 (cap $50), built in 2662 ms.

| Reference | Cards | Composition distance | Overlap | Played | Score | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| EDHREC top 99 for Sai, Master Thopterist (4,133 decks, 2026-10-18) | 99 | 5.7 (lands +23) | 2% (2 of 86) | 5% | 38.6 ± 0.073 | $382.98 |
| Keen Engineering (FDC) | 99 | 5.6 (lands -4) | 2% (1 of 59) | 5% | 53.03 ± 0.08 | $105.11 |

## kenrith-pins-and-fences: Five colors at bracket 5 with $400, two cards asked for and one fenced out, owned first

Built: Kenrith, the Returned King (given), 99 cards, score 75.38 ± 0.087, $386.07 (cap $400), built in 4774 ms.

| Reference | Cards | Composition distance | Overlap | Played | Score | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| EDHREC top 99 for Kenrith, the Returned King (31,760 decks, 2026-10-18) | 99 | 6.9 (lands -16) | 6% (3 of 47) | 6% | 61.23 ± 0.071 | $3078.01 |
| Painbow (DMC, same colors) | 99 | 4.3 (lands -3) | 3% (2 of 60) | 6% | 77.65 ± 0.076 | $81.59 |
| Draconic Domination (C17, same colors) | 99 | 4.6 (lands -1) | 7% (4 of 62) | 6% | 54.35 ± 0.072 | $119.09 |

## atraxa-combo-not-owned: A given four-color commander, Combo, bracket 3, $200, owned copies not preferred

Built: Atraxa, Praetors' Voice (given), 99 cards, score 69.75 ± 0.067, $172.01 (cap $200), built in 3451 ms.

| Reference | Cards | Composition distance | Overlap | Played | Score | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| EDHREC top 99 for Atraxa, Praetors' Voice (45,626 decks, 2026-10-18) | 99 | 2.1 (lands +1) | 2% (1 of 64) | 6% | 64.4 ± 0.026 | $856.34 |
| Breed Lethality (CM2) | 99 | 3.8 (lands -3) | 0% (0 of 60) | 6% | 77 ± 0.077 | $69.01 |
| Breed Lethality (C16) | 99 | 3.8 (lands -3) | 0% (0 of 60) | 6% | 77 ± 0.077 | $69.01 |
| Rob's D3 Atraxa Proliferate | 99 | 3 (lands -1) | 2% (1 of 62) | 6% | 81.97 ± 0.088 | $124.81 |

