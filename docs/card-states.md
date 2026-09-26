# Card states: the one taxonomy

Rob, 2026-09-25: *"I do want to maintain one clear taxonomy that's shared across all card definitions
used within CrankMagic, to keep everything downstream functionally sound."* Rob approved the structure
and four decisions on 2026-09-26.

This file is the definition. The code is `cardState` and its vocabulary in `collection-model.js`, and
`tests/card-states.mjs` holds the two to each other. A screen that needs to say what state a card is in
asks `cardState` and labels the answer with the vocabulary. It never spells a state itself.

## The three questions

Every record answers three questions. The old status label answered all three in one word, which is how
"Watched" came to mean both a card you are thinking about and an owned card on the Bench.

### 1. Stage: how far along

Each record has exactly one stage, and the stages come in this order:

| Owned? | Stage | Means |
| --- | --- | --- |
| Not owned | *(the catalog)* | Any Magic card. There is no record; this is the universe before the first stage. |
| Not owned | **Watching** | Looked at, not decided. |
| Not owned | **To buy** | Decided to buy. |
| Not owned | **Ordered** | Bought, not yet in hand. |
| Owned | **Owned** | In hand. |

### 2. Deck and role: who it is for

A record can be for a deck at any stage, not only when owned: "To buy for D6" and "Watching for D2 as
an upgrade" are both states. With a deck, it has one role, and which roles are open depends on whether
the card is in the deck's box (Rob, 2026-09-26):

| Role | In the box? | Means |
| --- | --- | --- |
| **Target** | Yes | The list's own card, in its seat. |
| **Substitute** | Yes | Holding a seat for a Target not yet in the box. |
| **Upgrade** | No | Planned to replace a card that is in the box: the substitute holding its seat, or the list card an upgrade option would swap out. |
| **Reserved** | No | Takes an empty seat: nothing in the box holds it. |

A card outside the box is an **Upgrade** when a substitute is recorded as holding its seat, or when the box
is already full; it is **Reserved** when its seat is empty. An upgrade option, and an entry in a deck's own
collection group (a candidate for that deck), is always an Upgrade.

An owned card for no deck is on the **Bench**.

### Playable and complete

A deck is **playable** when nothing for it is Reserved: every one of its seats holds a card, the list's own
or a substitute. It is **complete** when every seat holds the list's own card: no Substitutes, no Upgrades
left to make. The model's `readiness(...).playable` (all the list's cards in the box) and "nothing Reserved"
are the same test, and `tests/card-states.mjs` holds them to each other deck by deck.

### 3. Two facts, not states

- **In the box**: an owned target or substitute is physically in the deck's box. An owned card for a deck
  that is not yet in the box is **To add**, and it is what *Ready to add* lists.
- **For trade**: the copy is offered for sale or trade, or held for a pending deal.

Collection groups are tags, not states. A group says where a card is filed, not how far along it is.

## The one word on a pill

- While a card is not owned, the pill names its stage: *Watching*, *To buy*, *Ordered*.
- Once owned, the pill says where the card is: *Bench*; *To add* (for a deck, not in its box yet); or its role
  in the box, *Target* or *Substitute*.
- A card for a deck that is not in its box wears its role beside the pill: *Upgrade* or *Reserved*. The deck
  sits beside it too.

## Today's labels, mapped

These counts are for Rob's library as committed (`data/live-state.json`, rebuilt in step 3b), and
`tests/card-states.mjs` pins each one.

| Old label | State | Rob's library |
| --- | --- | --- |
| Physical deck | Owned, deck, Target, in the box | 577 copies |
| Reserved | Owned, deck, not in the box: **To add**, and an Upgrade (the box is full) | 5 copies |
| Substitute | Owned, deck, Substitute (in the box); 111 record the seat they hold | 123 copies |
| Reserved, and physically standing in another deck | Owned, that other deck, Substitute, *reserved for* its own deck | included above |
| Bench | Owned, no deck | 695 copies |
| Watched (an owned Bench copy shortlisted for a deck) | Owned, no deck; the shortlist is a tag | — |
| Ordered | Ordered, deck if reserved | 6 copies |
| Watched (a watched copy) | Watching | 0 |
| To buy (a deck's unmet need) | To buy, deck, **Upgrade**: each replaces the substitute recorded in its seat | 111 copies |
| **Wanted** (the To Buy list) | **To buy**, no deck (decision 1): only what no deck needs | 0 entries (the 101 repeated the needs and were removed) |
| Draft list | Watching, that deck, Reserved (a draft has an empty box); finalizing the deck turns these into To buy | 0 |
| Suggestion (an option) | Watching, deck, Upgrade | 0 on decks |
| Planned (entries in other groups) | Watching, with the group as a tag | 0 (the 111 Upgrade Path entries are now the substitutes' seats) |
| Planned (entries in a deck's own group) | Watching, that deck, Upgrade: a candidate for it | 13 entries (D4 7, D6 6) |

None of Rob's decks has an empty seat, so nothing is Reserved and all seven are playable. None is complete.

## Rob's four decisions (2026-09-26)

1. The To Buy list (101 cards) is **To buy**, not Watching.
2. **In the box** stays, as a yes-or-no fact on owned targets and substitutes.
3. ~~The 111 **Upgrade Path** entries become upgrade options on their own decks.~~ Revised the same day: each
   entry is already a Target its deck's list needs, and the card it "replaces" is the Substitute holding that
   seat. So the rebuild records each substitute's seat from the notes ("D2 · replaces Foraging Wickermaw") and
   removes the entries. Rob does not need the short-term and long-term flags.
4. **Ordered** is "bought, not yet in hand". They are one state.

Also from Rob (R3.7, 2026-09-25): a card no deck needs can be **To buy**, and it shows on the To buy tab.
Explore's Add dialog can also put a card straight on the **Bench**.

## The order of work

1. **This definition and its code.** `cardState` and the vocabulary in the model, and the suite that pins
   every mapping. No screen and no data changes. *(This PR.)*
2. **Every screen reads it**, in two PRs.
   - **2a, the Library.** Every row carries its state. The Status pill is the state's word, with two badges:
     *To add* for an owned target not yet in its box, and *In D2 · reserved for D7* for a substitute
     reserved elsewhere. The Library's count cards become two rows of four: the stages, then Owned split
     by where it is, with a caption that states the sum. The Filters dialog's status chips are the states,
     plus *Not yet in the box*. Sorting and grouping by status follow the lifecycle. The head's Bench is
     the state's (695, where it said 811, because a substitute in a deck's box is not on the Bench). The
     To buy tab and its count hold the To Buy list beside the decks' needs; the two overlap until step 3
     de-duplicates them.
   - **2b, the deck page, the inspector, the ladder, Explore.**
     - The deck page's hundred wears a card-state pill per slot: Watching on a draft list, To buy, Ordered,
       or Target, with *To add* beside a Target whose owned copy waits outside the box.
     - The card inspector's Status chips count the card's records by state, and its Assignment chips name
       each deck with the state's word.
     - How a deck comes together climbs Watching, To buy, Ordered, Owned, then *In the box*.
     - Explore's Add dialog offers **Watching** (a watched copy) and **To buy** (the To Buy list) as two
       choices, where it had one "Wanted".
     - A watched copy is Watching, so it leaves the To buy tab.
   - **2c, the Table view, Ready to add and the exports.**
     - The Table view's status piles are the card states: Target, *To add*, Substitute, Ordered, To buy,
       Watching. The Bench keeps its own place on the back row. Each pile takes the drops its old
       label took; the To buy pile releases a reserved copy or files a watched copy or planned entry on
       the To Buy list. The Table's own Status dropdown offers the same words, and staged moves name them.
     - Ready to add names a waiting copy *To add*, with where to find it ("To add · Bench").
     - The Excel export's Library, Allocations and Acquisition queue sheets gain a **State** column beside
       Placement, which stays for the sheets and scripts that read it.
3. **The four roles, and the rebuilt library** (Rob, 2026-09-26, "Go"), in two PRs.
   - **3a, the roles.** Target and Substitute in the box; Upgrade and Reserved outside it, decided by the
     deck's seats (`seats` and `stateReader` in the model). The pills: Bench, *To add*, Target, Substitute
     once owned, with Upgrade or Reserved beside a card outside its box. The Library's second row of count
     cards is Bench, To add, Target, Substitute, and the caption divides To buy into upgrades and reserved.
     The deck page says whether the deck plays and why ("Playable: every seat holds a card · 15 upgrades to
     make"). The Filters dialog adds Upgrade and Reserved; the workbook's State column reads "To buy ·
     upgrade". The Table view has no Upgrade pile: Upgrade is a role, not a place.
   - **3b, the rebuilt backup.** `data/live-state.json` rebuilt from the v25 workbook by `tools/live-load.js`:
     each upgrade whose card is on its deck's list and whose replaced card is a substitute in the box is
     recorded on that substitute (`standInFor`, one copy per seat), so the 111 Upgrade Path entries and their
     group are gone; the To Buy list keeps only copies beyond the decks' needs, so its 101 duplicates are gone.
     The short-term and long-term text is dropped. To buy is now 111 (the needs, once) and Watching 13. Rob
     has not restored v25, so no library changes in place and no in-app tidy is needed.
   - **R3.7b needs no storage change.** A card no deck needs goes on the To Buy list, which the To buy tab
     shows, and Bought moves it to the Bench (the entry-buy path). Step 3b found that Bought refused a list
     entry ("This copy is already recorded as owned"), and fixed it; `tests/explore-r3.mjs` proves the path.
