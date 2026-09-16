# The 56 new cards: what they are, and what they can replace

Written 16 September 2026, from `Treys_MtG_Master_v13.xlsx` (16 September) and
`MtG_Card_Photo_Extract_2026-09-15.xlsx`. Rob's rule for this pass, in his words: *"I'll take a
card I own any day over a card I have to buy, if it's a 1-to-1 or the owned card serves the
purpose better."*

## 1. What was missing, and where it came from

56 Master rows carried no Bracket, which is how a new row shows. They had a name, a colour, a
type, an MV, a price and a count — and nothing else: no set, no collector number, no rules text,
and so no place in the graph, the Discover pane or any pop-up.

| Gap | Filled from |
| --- | --- |
| Set code, set name, collector #, rarity, mana cost | the photo extract's `Cards` sheet |
| Oracle text, identity, legality, images, printing | Scryfall, via `tools/build-card-records.mjs --add` |
| Roles, causes, triggers, produces (the graph's terms) | `card-classify.js`, the same call the graph bake makes |
| Bracket, Primary Purpose, the three Mechanic columns | **still blank in the workbook** — see §4 |

55 of the 56 are now Card records (`data/cards.json` 2,131 → 2,186), in the facts table and in
the graph's card block. The 56th, *Iron Hills*, was already there.

## 2. What is worth swapping

**One is a clean win.**

| Deck | Buy this | Own this instead | Saving | Why |
| --- | --- | --- | --- | --- |
| D4 Felothar Walls | Saruli Caretaker `{G}` 0/3 | **Great Forest Druid** `{1}{G}` 0/4 | $0.27 | Felothar makes every creature assign damage equal to its **toughness**, so 0/4 hits for 4 where 0/3 hits for 3. It also taps for any colour on its own; Saruli has to tap a second creature to do it. One more mana is the whole cost. |

**Three are real trades, with the loss named. Rob's call, not mine.**

| Deck | Buy this | Own this instead | Saving | What you give up |
| --- | --- | --- | --- | --- |
| D1 Quintorius Spirits | Warleader's Call | **Kinbinding** `{3}{W}{W}` | **$7.12** | Both are anthems that pay off creatures entering, and D1 floods 3/2 Spirits. Kinbinding scales with the flood *and* adds a 1/1 Kithkin each combat. You lose the 1 damage to each opponent per ETB — real reach in a deck that wants to close — and it costs 5 rather than 4. This is the largest single line on the buy list. |
| D4 Felothar Walls | Beast Within `{2}{G}` | **Chelonian Tackle** `{2}{G}` | $0.73 | Same cost, same colour. In a deck where damage equals toughness, "+0/+10, then fight" is a one-sided kill on almost anything and leaves **no 3/3 behind**, which Beast Within always does. You lose instant speed and the ability to hit a non-creature. |
| D5 Shadrix Aristocrats | Anguished Unmaking `{1}{W}{B}` | **Wander Off** `{3}{B}`, or **Bogslither's Embrace** `{1}{B}` | $1.40 | Bogslither's Embrace is 2-mana unconditional exile whose extra cost — a −1/−1 counter on one of your own creatures — is close to free in an Aristocrats deck that wants its creatures to die. Wander Off is the instant-speed version at 4. Neither touches a non-creature permanent, which is the whole point of Anguished Unmaking. |

**Everything else: no.** Said plainly, because a near-miss offered as a swap costs more than it saves.

- **D2 Chulane** — every outstanding buy is a dual land, Command Tower, or a specific loop piece
  (Whitemane Lion, Dream Stalker, Kiora's Follower, Restoration Angel). Chulane triggers on
  **casting** creature spells, so the new blink-adjacent cards (Daydream, Joined Researchers) do
  not do Whitemane Lion's job. Nothing new replaces a land.
- **D3 Atraxa** — the buys that are not lands are proliferate effects (Contentious Plan, Infectious
  Inquiry, Prologue to Phyresis, Magistrate's Scepter). **Not one of the 56 proliferates.**
  *Fractal Anomaly* makes a counter-laden body Atraxa can proliferate, which is on-theme, but it is
  an addition, not a replacement.
- **D6 Krenko** — the buys are Goblin tribal (Piledriver, Pashalik Mons, Skirk Fire Marshal,
  Reckless Bushwhacker, Hobgoblin Bandit Lord) and colourless staples (Sol Ring, Lightning Greaves,
  Idol of Oblivion). The only new Goblin in red is *Misty Mountains Raider*, which is a 5-mana 4/4
  that amasses — not a lord and not a payoff. *Seething Song* on the back of Blazing Firesinger
  adds a fixed {R}{R}{R}{R}{R}; **Battle Hymn adds one red per creature**, and Krenko goes wide, so
  the card on the buy list is the better card. Leave it.
- **Upgrade Path (67 rows)** — these are Bracket 3 ceiling cards chosen for power, and the 56 new
  cards are draft chaff and bulk rares at $0.05–$1.50 with two exceptions. Nothing here reaches an
  upgrade slot. *Moonshadow* ($13.04) and *Gandalf, Goblins' Bane* ($4.65) are the two cards of real
  value, and neither fits a deck on the list: Moonshadow is mono-black with a −1/−1 mechanic that
  fights D5's counters rather than helping them, and Gandalf wants a spells deck, which D6 is not.

**If Rob takes all four: $9.52 off a $74.44 buy list, and one deck (D4) goes to $0.00 owing.**

## 3. What the new cards are, in bulk

Set spread: Lorwyn Eclipsed (ECL) and Secrets of Strixhaven (SOS) draft leftovers, The Hobbit (HOB)
and LOTR, a handful of Strixhaven and Innistrad. 52 of the 56 are under $0.40. Total added value
about $29, of which *Moonshadow* is $13.04.

They are on the bench, not in any deck: `owned.bench` 269 → 329 rows.

## 4. One thing left undone, and why

The workbook's **Bracket**, **Primary Purpose**, **Primary/Secondary/Tertiary Mechanic** columns are
still blank for these 56 rows. The app derives all four itself — `card-classify.js` reads the oracle
text and produces the roles the graph and Discover use, and every one of these cards now has that.
So the app is complete; the **workbook** is not.

Filling them in the workbook means writing to `Treys MtG Master v13.xlsx`, and the standing rule is
that nothing writes that file. The derived values are available on request as a paste-in block —
say the word and they arrive as a two-column table keyed by card name.
