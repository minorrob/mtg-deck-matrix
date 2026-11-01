# Card status: use, ownership, play

Rob, 2026-09-25: *"I do want to maintain one clear taxonomy that's shared across all card definitions
used within CrankMagic, to keep everything downstream functionally sound."* On 2026-10-18 he replaced the
taxonomy of 2026-09-26 with this one. Its proposal is `docs/design/2026-10-18-status-axes/`. He approved it
with all eight recommended decisions and added **Upgrade**.

This file is the definition. The code is `cardState` and its vocabulary in `collection-model.js`, and
`tests/card-states.mjs` holds the two together. A screen that needs a card's status asks `cardState`
(through `stateReader`) and labels the answer with `stateLabel`, `stateNote` or `placeLabel`. It never
spells a status itself. A deck's counts come from `deckStatus`.

## Why it changed

The old pill used one word to answer three questions. Its words read wrong:

- **Target** meant "in the box", but read as "still to get". Rob's D1 had all 100 cards in the box, and
  every one of them said Target.
- **Reserved** meant a card taking an *empty* seat. What Rob means by Reserved, a card bought or taken to
  replace a substitute, was the old **Upgrade**.

Four functions also worked status out separately: `cardState`, The hundred's own `status(slot)`,
`readiness` and the older `statusOf`. They disagreed. For example, a copy in D2's box claimed by D7 was
counted as a D7 Substitute, shown as "To add", and left out of D7's tile. On top of that, the Library
scoped to a deck added every Bench copy in the library.

## The three questions

| Question | Values | Who sets it |
| --- | --- | --- |
| **Use**: what the copy is for | Final · Substitute · Reserved · Upgrade · Bench · Sell · Trade · Unowned | You |
| **Ownership**: where it is in the buying cycle | Watch · To buy · Ordered · Own · To sell · Trade | You |
| **Play**: can it be played | Playable · Loading · To load | The system only |

There is no Canceled. A card you no longer want is deleted.

### Use

| Use | Means | In the deck? |
| --- | --- | --- |
| **Final** | The list's own card, in the deck's box. | Yes |
| **Substitute** | In the box, holding the seat of a Reserved card until that card is in. | Yes |
| **Substitute · Loading** | An owned stand-in chosen for a Reserved card's seat, not in the box yet. Box deck (choice 2) or Ready to add puts it in, and it is a Substitute from then on (Rob, 2026-10-23, the Decks requirements' Q1). | Not yet |
| **Reserved** | Assigned to a seat and not in the box yet: to buy, ordered, sitting in another deck's box, or owned and waiting on the Bench to be boxed (Rob, 2026-11-01: *"Call it Reserved"*; it was Loading). It replaces the substitute holding its seat, or an empty seat. | No |
| **Upgrade** | Being considered to improve the deck. It names the card it would replace and changes nothing until it is reserved. | No |
| **Bench** | Owned, for no deck. | — |
| **Sell**, **Trade** | Offered. The same fact as the ownership To sell or Trade, shown on both questions. | — |
| **Unowned** | Not owned and for no deck: watched, on the To Buy list, or ordered. | — |

Only **Final** and **Substitute** put a card in the deck, and only they count toward its hundred. A Substitute · Loading
counts once it is in the box, as Final · Loading does.

Rob's two rules for a card that replaces another (2026-10-18):

1. **Reserved** and **Upgrade** both name the card they would replace.
2. Only **Reserved** changes it. Reserving a card in place of a Final card makes that card the Substitute
   holding the seat. An Upgrade changes nothing until you reserve it.

A **Bench** copy is Bench until you assign it to a seat; assigned and not boxed it reads **Reserved**, and Box puts it in
as Final (or as a Substitute where the list did not call for it). Boxing a card that replaces a Substitute takes the
Substitute out to the Bench, so the box keeps its count.

### Which ownership goes with which use

| Use | Ownership it may have |
| --- | --- |
| Final, Substitute, Bench | Own |
| Reserved | To buy, Ordered, or Own (only when it sits in another deck's box) |
| Upgrade | Watch, To buy, Ordered, Own |
| Sell / Trade | To sell / Trade |
| Unowned | Watch, To buy, Ordered |

Reserving a watched card moves it to To buy, after you confirm. A status menu offers only these pairs.

**To sell and Trade are never chosen as ownership** (Rob, 2026-10-18). They follow the use: put a copy in Sell or Trade
(the row's Use menu) and its ownership reads To sell or Trade by itself. The Ownership menu shows that as the current
rung, locked, and offers only Watch, Ordered and Own to choose.

### Play

- **For a card:**
  - **Playable**: in the box.
  - **Loading**: owned, the deck's own card (or a stand-in chosen for one of its seats), and not in the box yet.
    The card's pill reads **Reserved** (2026-11-01); Loading is the model's `play` word and the deck's reading.
    This was "To add", and it is what Ready to add lists.
  - **To load**: still to get.
- **For a deck:**
  - **Playable**: the box holds the list (Final + Substitute).
  - **Loading**: owned cards cover the gap and only have to be put in.
  - **To load**: a seat waits on a card you don't have yet, or the list is not locked.
  - **Complete**, shown beside Play: every card in the box is the list's own. Nothing is Reserved,
    loading or substituting.

## A deck's stage (Rob, 2026-10-23)

The Decks screen reads a deck by its stage, which `deckStatus` works out (`stage`, `boxed`) and every screen reads.
The seats are the ones Play reads: the commander(s) plus the main list.

| Stage | Test |
| --- | --- |
| **Building** | Fewer than 100 seats on the list. Ownership doesn't matter. |
| **Defined** | All 100 seats on the list. To buy and Ordered cards count. Lock list isn't needed. |
| **Boxed** | Defined, and the box holds the hundred: Final + Substitute = 100. |
| **Playable** | Defined, and Play knows every one of the 100 (the table's own check). |

Every deck is Building or Defined. Boxed and Playable are both kinds of Defined, and a deck can be both. The deck's
Play reading above (Playable, Loading, To load) and Complete stay in the model; the screens show the stage.

## A deck's two hundreds

- **The list** (what you want) = Final + Loading + Reserved
- **The box** (what you play) = Final + Substitute = the **Deck total**
- Each Reserved card replaces one Substitute, or an empty seat.
- **Group total** = every record the deck's view lists: Final + Loading + Substitute + Reserved + Upgrade

Rob's example: 90 Final, 10 Substitute, 10 Reserved (to buy) and 4 Upgrade. That is a Deck total of 100
and a Group total of 114.

**The Library scoped to a deck lists exactly The hundred's records.** That means the deck's group, read from
the deck's side. A copy sitting in another deck's box and claimed by this deck is this deck's Reserved card,
"in" the other box. Bench copies appear only when **Show Bench cards that could go in** is ticked. The Table
view keeps them, because its ledge is where you pull a card from.

## The words on screen

- **The pill** (`stateLabel`): the use, with two exceptions.
  - It says **Reserved** for the deck's own card that is not in the box yet (Loading until 2026-11-01).
  - For an Unowned card it says the ownership (Watch, To buy or Ordered).
  - The order the pills sort in is `STATE_LABELS`: Watch, To buy, Ordered, Upgrade, Reserved,
    Bench, Final, Substitute, Sell, Trade.
- **The note beside the pill** (`stateNote`): a few words.
  - "To buy · replaces Swampsnare Trap"
  - "in D2 · replaces Great Fierce Bee"
  - "holds the seat for Spellstutter Sprite"
  - "Loading · stands in for Blood Artist" (a Substitute · Loading)
  - "Watch · would replace Quill"
- **The place** (`placeLabel`): where a card is, for the Table view's piles. The piles are Final, Reserved,
  Substitute, Bench, Ordered, To buy and Watch.
- **Lock list** is the deck action that was called Finalize. A deck's list is Draft or Locked. The stored
  status is still `final`, so no data changes.

## What changed in the stored data

On 2026-10-23 a copy chosen to stand in for a seat before it is boxed records `chosenFor` (`{deckId, slotId}`) on the
copy, set by `standIn` and cleared by `clearStandIn`. Putting it in the deck's box turns it into `standInFor`, as before.

Before that, two things changed in the stored data:

1. `swap` and `acceptOption` take `substitute`. It keeps the replaced copy in the box as the Substitute
   holding the seat (`standInFor`).
2. An offer records `offerKind`, which is `sell` or `trade`. An offer made before this reads as Trade.

When `swap` takes a copy from another deck's box (`lotId`), that copy keeps holding its old seat there
until it is moved.

## Rob's library (committed backup, 2026-09-30)

| Use | Copies |
| --- | --- |
| Final, in the box | 577 |
| Reserved, owned and not boxed (was Loading) | 9 |
| Substitute | 123 |
| Bench | 888 |
| Reserved | 107, all to buy. 106 of them replace the substitute holding their seat. D7's Peppersmoke has none. |
| Upgrade | 14: 13 candidates in D4's and D6's groups, and one owned copy filed in D4's. None names a replaced card yet. |

Seven copies sit in one deck's box and are claimed by another: D1 and D2 have one each, and D7 has five
(in D2's and D4's boxes). Every deck's Deck total is 100 and every deck is Playable.

## History

The taxonomy of 2026-09-26 (stage × role: Watching, To buy, Ordered, Owned × Target, Substitute, Upgrade,
Reserved) is replaced by this one. Its decisions that still hold:

- The To Buy list is for what no deck needs.
- Ordered means "bought, not yet in hand".
- A substitute's seat is recorded on the substitute (`standInFor`).

The Library's deck scope no longer includes the Bench, which reverses Rob's 14 September call. The checkbox
brings it back.

## Set status in the Library (ROB-358; Rob, 2026-11-01)

A ticked set in the Library takes four statuses and two things to do with a deck. There is no Assigned status:
assigning a card to a deck is something you do, not something a card is.

| Choice | What it does |
| --- | --- |
| **Watch** | Keeping an eye on it. The card leaves any box and reservation (a review says so). |
| **To buy** | Interested in buying it: a watched card moves to the To Buy list. A card owned, ordered, or already a seat to buy stays, and the receipt says how many. |
| **Ordered** | Bought, on its way: the order form (vendor, reference, shipping, date). |
| **Bench** | Owned, in no deck: an ordered copy arrives, a copy in a box comes out, a watched or wanted card is bought in store. |
| **Assign to a deck…** | Pick the deck. A card the list already wants is reserved for that seat; any other card replaces a seat you name (the replaced copy stays in the box as the Substitute holding it), and a copy in hand reads Reserved until it is boxed. A card not in hand becomes a seat to buy. |
| **Box** | Each ticked copy goes into the box of the deck it is assigned to. A copy in no deck stays on the Bench; a copy not in hand cannot be boxed. |

**Box warns, it never stops.** When a deck's box would hold more or fewer than its hundred, the receipt carries the
warning and its button reads Box anyway; one confirm boxes every card, and the deck does not read Boxed, and cannot be
played, until the box holds the hundred (Rob: "the deck status changes to not legal"). Past the hundred it reads Building
and Over, the 2026-10-26 rule; short of it, it reads Defined. The app has no separate "Not legal" word for a box.
The plans are `boxCommands`, `assignCommands` and `wantCommands` in `collection-model.js`; `tests/library-set-status.mjs` pins them.
