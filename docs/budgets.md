# Budgets: a deck's and the account's

Rob, 2026-10-18: *"Budgets should be set at per-deck AND account-wide. Neither is a blocker, but a deck's budget does
not inherit the account-wide budget. Both are purely informational. Account-wide should be set by the player, then
compared against the sum of the per-deck budgets, superseded by the deck's actual cost if greater than the deck's
budget."*

This file is the definition. The code is `deckBudget` and `budgets` in `collection-model.js`, and `tests/budgets.mjs`
holds the two together.

## The two budgets

| Budget | Set where | Means |
| --- | --- | --- |
| **A deck's** | Its Deck Definition (Edit), or the Build wizard's Budget step | What you mean to spend on that deck. Blank is no budget. |
| **The account's** | Settings › Budget | What you mean to spend on all your decks together. Blank is none. |

- **Neither one blocks anything.** Lock list, a swap, accepting an option and correcting a card's identity all go
  through over budget. The deck page and the Lock list review say by how much.
- **A deck inherits nothing.** A deck with no budget of its own has none. It takes neither the account's budget nor
  the pod's $225 rule. The Build wizard offers the pod's rule in its Budget box, where you can see, change or clear
  it before the deck is made.

## The figures

- **A deck's cost** is its list at recorded prices: every main card's price times its quantity. A copy with no price
  counts as nothing and is marked ≈.
- **What a deck counts at** toward the account:
  - its budget, when its cost is at or under it;
  - its cost, when its cost is more than its budget (the cost supersedes it);
  - its cost, when it has no budget.
- **Planned** is the sum of what every live deck counts at. Archived decks and lobby decks are left out.
- **Left** is the account's budget minus Planned. Below zero it reads as **over**.

### Worked example

| Deck | Budget | Cost | Counts at |
| --- | --- | --- | --- |
| A | $150 | $100 | $150 (under its budget) |
| B | $100 | $120 | $120 (its cost supersedes its budget) |
| C | none | $50 | $50 (no budget) |
| **Planned** | | | **$320** |

Against a $1,000 account budget, that leaves $680. Against $300, it is $20 over.

Rob's library as committed has no deck budgets, so every deck counts at its cost: $789.54 for the seven decks at the
shipped catalog's prices.

## On screen

- **Settings › Budget**: the Account budget box, the sentence *Your decks plan $X of $Y · $Z left* (or *over*), and
  a table of every live deck with its budget, cost and what it counts at.
- **Decks**: the same sentence under the tiles, with a link to Settings. It sits below the grid so the page head stays
  inside its budget (`tests/page-budget.mjs`).
- **A deck page**: the Cost card reads *Budget $X* or *No budget*, with the list's percentage of its budget. The hero
  wears *Over the $X budget · about $Y* when the list costs more.
- **Lock list**: the review names what the budget and the per-card cap say, and the list locks either way. It used to
  be a dialog that would not lock until the cap was raised or removed.

## What changed in the stored data

- New preference `accountBudget`: a number of dollars above zero, or `null`.
- The preference `defaultBudgetCap` (Settings' old *Default budget cap*) is no longer read. Rob's library never set it.
- A deck's `definition.budget` keeps its meaning. Saving the Deck Definition with the box blank now stores `null`
  where it used to store the default cap.

## The per-card cap

The per-card cap is unchanged: blank in the Deck Definition still writes the pod's $30 rule. Like the budget, it no
longer blocks Lock list. It is the same check (`definitionIssues`), and only informs.

## Rob's decisions on the defaults

On October 18, after the build, Rob kept all three defaults ("keep the defaults on all three budget decisions"):

1. **A deck's cost** is its whole list at recorded prices. It is not what was paid plus what is left to buy.
2. **The per-card cap** still fills in the pod's $30 rule when left blank, and it no longer blocks Lock list.
3. **The Build wizard** puts the pod's $225 in its Budget box. You can see it, change it or clear it before the deck is
   made.

Linear: ROB-151.

## History

Until 2026-10-18 a deck with no budget was held to Settings' default cap, or the pod's rule, and Lock list refused a
list over it (`acceptance` included `definitionIssues`). The season's $100 pool on the Shop's money strip is a
separate rule about spending and is unchanged.
