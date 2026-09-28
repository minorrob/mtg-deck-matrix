# Groups as the one place: the plan

Rob, 2026-09-28. He tried importing his collection and building a Quintorius deck from it,
and asked for three things: fix the import, make physical decks and groups one thing, and make
the Table view show each card once. This plan covers all of it. It is built in six PRs, and
**nothing in it is built until Rob approves the decisions in §8**.

## 1. What Rob asked for

**The import (held from his first message):**
- An existing group must not offer "New group name".
- Replace the input "What does this input represent?" with the card-state labels.
- Explain why an 886-card paste slowed after the first 150.
- Filter the review to the rows that need "Correct identity".
- Warn before closing the review loses the work.
- Check that the card data has Reality Fracture.
- Fix the New deck dialog's empty right side and its close button.
- Fix the confusion at "New deck from a group": the note says 100 cards "come across", but no deck appeared to exist.

**Groups (his second and third messages):**
- Physical decks and groups become one thing.
- Every group has a **template** and a **physical: yes/no** flag.
  - The templates are Commander deck, 40-card deck (Limited: draft or sealed), Bench, and To sell/trade.
  - Commander behaves as today's deck does. Bench and To sell/trade keep what they have today. The other templates come later.
- A Commander deck group holds **three things**: its commander, its 99 (the list), and its contents (the physical copies in the box).
- **One action, "Add/move to group",** replaces three: "Put in a physical deck", "Move physically to Bench" and "Add to a group".
  - It can also make a new group from the selection. A new group asks for its template; a Commander group confirms its commander and runs the deck-creation flow.
- Putting cards in a deck no longer requires Finalize.
- The Library loses "Ordered…", "Bought in store" and "Arrived".
- **The Table view shows each card once:**
  - Groups sit along the bottom, all shown by default, with the Bench always there. Rob chooses which groups are shown.
  - Clicking a group spreads it into stacks on the canvas.
  - Clicking a stack shows it in the card view at the top.

## 2. What is there today (the facts the plan rests on)

- **A deck** is a list: slots, commanders, versions, draft/final status (`collection-model.js`, `createDeck`). The commander is counted **inside** the 100: legality wants 100 main-list cards, with the commander once among them (`legality()`).
- **A copy** (a "lot") has a stage (`owned`, `ordered`, `watching`) and a **location**. The location is either `bench` or `deck` (with a `deckId`), and only owned copies have one.
  - A copy is **reserved** for a deck slot by `allocation`, and only a **final** deck can hold reservations or physical copies. That is why Rob's 85 cards could not go into his draft Quintorius deck: its Finalize needs a legal 100.
- **Groups** are tags: a list of planned entries, plus copies filed into them through `lot.groupIds`. They carry no physical meaning.
  - Every deck already has its own group (`ensureDeckGroups`), which is half of what this plan needs.
  - The starter groups are "Main Deck", "Bench", "To Trade" and "To Buy". "Bench" and "Main Deck" mean nothing to the model: the Bench is a *location*.
  - "To Trade" sits beside a separate *flag* on the copy (`offer`), and "To Buy" is read specially.
- **Roles** (Target, Substitute, Upgrade, Reserved) are worked out from where a copy is and what it is reserved for (`docs/card-states.md`, approved 2026-09-26).

## 3. The new model

- **Rob, 2026-09-28: one template group per copy, any number of General groups.** A copy sits in exactly one
  *template* group: Commander deck, 40-card deck (later), Bench, or To sell/trade. Those are the physical places.
  It can also be in any number of **General** groups (for example "proliferate" or "high damage"). General groups
  are assigned by hand and never move anything. Physical is therefore implied by the template, and General groups
  are never physical. A physical place that is not a deck, such as "Binder 3", would be a later template.
- **A group** is `{id, name, template, physical, …}`.
  - `template` is one of `commander`, `limited`, `bench`, `trade`, or `general`.
  - `physical` is true or false.
  - **Physical groups are places.** A copy is in exactly one physical group at a time, like a real box, so a copy's *location* becomes its physical group.
  - **Non-physical groups are lists.** A card can be on any number of them, and nothing moves.
- **A Commander deck group** holds three things:
  1. **Its commander**: one card, or a legal pair (partners, a Background, and so on). It sets the color identity.
  2. **Its 99**: the list it should contain. Legality becomes **commander + 99 = 100**, instead of a 100-card list that must include the commander once.
  3. **Its contents**: the copies physically in it, the commander's copy included.
- **What each group now owns:**
  - The deck's versions, simulations, Record and advice keep working, because the deck stays the group's list.
  - The buy list and "Ready to add" still come from the gap between the list and the contents.
- **Finalize stops being a gate.** It becomes a badge, "Legal · 100/100", and any group accepts copies at any time.
  - Roles are still worked out, now from list against contents.
  - **Target:** on the 99 and in the box.
  - **Substitute:** in the box, standing in for a card on the 99.
  - **Owned elsewhere:** on the 99, owned, but in another group. This is shown as where the card is:
    "Owned · on the Bench" or "Owned · in D1 Atraxa". It is worked out live, never stored or locked, and nothing
    "becomes" it. **The Pull list** (today's "Ready to add") lists these cards: what to pull, and from where.
  - **Over 100 is allowed.** A deck group can hold more than 100 cards and shows **Not legal** as a warning.
  - **To buy:** on the 99 and not owned.
- **Bench** is a physical group with the `bench` template: always there, and cannot be deleted.
- **To sell/trade** is a physical group with the `trade` template. The `offer` flag becomes "is in a To sell/trade group" (decision D2).
- **To buy** stays a non-physical list and keeps its special reading.
- **Main Deck** is removed (decision D3).

## 4. The migration (schema 3 → 4)

It is done in the model's own `migrate()`, the way 1→2 was. A repair at boot is not enough, because the backup format and cloud sync both carry the schema.

1. Each deck's own group gets `template: 'commander'` and `physical: true`. A deck without a group gets one, as `ensureDeckGroups` does today.
2. **Commanders come out of the list.** Each deck's commander slot leaves the main list and stays as `commanders[]`, so a legal 100 today reads as commander + 99.
3. **Copies move to their physical group:**
   - `location.kind === 'deck'` goes to that deck's group.
   - `bench` goes to the Bench group.
   - A copy with `offer` set goes to the To sell/trade group (per D2).
4. **Reservations:**
   - A copy reserved for a deck **and** in its box stays there, as Target.
   - A copy reserved but elsewhere keeps its reservation as "To add".
5. **The starter groups:**
   - "Bench" and "To Trade" get their templates and `physical: true`.
   - "To Buy" becomes a `list`.
   - "Main Deck" is removed if empty (Rob's has no entries); otherwise it becomes a plain list.
6. **Safety:**
   - A dry run on Rob's real library (`data/live-state.json`) prints every change, counted, before the migration ships.
   - A backup restore is tested before and after.
   - The app refuses to write a schema-4 library over a newer or unknown one.

## 5. The screens

- **Add/move to group** replaces three batch actions and three row menus.
  - It lists every group, with the Bench first.
  - Choosing a physical group moves the copies there; choosing a list adds them to it.
  - **New group from selection** asks for a name, a template and physical yes/no.
    - Commander asks for the commander, or confirms it when the selection holds exactly one possible commander.
    - It then runs today's deck creation: the selection becomes the 99, the copies become the contents, and the deck page opens.
- **The Library** loses "Ordered…", "Bought in store" and "Arrived" (see D1 for where a copy's stage is changed instead).
- **The Table view** (`crankmagic-tabletop.js`, `crankmagic-collection.js`):
  - Groups along the bottom. The Bench is always there, every group is shown by default, and Rob chooses the others (a saved preference).
  - Clicking a group spreads its cards into stacks on the canvas; clicking a stack shows its cards in the card view at the top.
  - **Each card once:** the physical group a copy is in owns it. A card on a list with no copy owned shows only on that list.
  - The status piles, the group-by shelves and the play space go. Their jobs move into the group's stacks: stacks inside a group can be grouped by type, color, role and so on.

## 6. The import (the part Rob met first)

- **New group name** shows only when "Create a new group" is chosen. The same fix applies at two copies of that pattern in `crankmagic-discover.js`.
- **"What does this input represent?"** becomes the card-state labels, and depends on the group chosen.
  - Any group:
    - **Owned** (the copies go into the group if it is physical, onto the Bench if it is a list);
    - **Ordered** (bought, not yet in hand);
    - **Planned** (no ownership: the cards go on the group's list).
  - A Commander group:
    - **In this deck's box** (owned, the contents);
    - **Owned, for this deck** (owned elsewhere, targeted for it);
    - **Ordered for this deck**;
    - **On the list, to buy** (the 99, not owned);
    - **Upgrades for this deck**.
  - **Why "Copies arriving by trade" and "Order confirmation" were there, and why they should go.**
    - "Arriving by trade" is an *Ordered* copy whose channel is a trade instead of a purchase. It is a detail of Ordered, not a separate kind of input.
    - "Order confirmation" is not an import at all: it matches a store's receipt to copies already marked Ordered, to record what was paid. It already has its own home: Orders → Paste an order confirmation.
    - So Rob is right that both come out of the import. Ordered gains a "by trade" tick.
- **Speed.** The import resolves one row at a time.
  - Names the app knows (31,830 Commander cards) resolve at once. Every other name is one call to Scryfall's single-card lookup, spaced 120 ms apart.
  - Past its burst allowance Scryfall answers "too many requests". Each refusal is retried 3 times with growing waits (a quarter, a half and a whole second), so each unknown name costs about **2.6 seconds** and then may still fail as "Correct identity".
  - Which names miss locally:
    - the back-face or front-face-only names of double-faced cards;
    - cards not legal in Commander;
    - spelling variants;
    - Reality Fracture's new cards (see below).
  - **The fix costs nothing:**
    - Resolve every local name first.
    - Send the misses to Scryfall's collection lookup in batches of 75, a method the app already uses elsewhere.
    - Honor Scryfall's "retry after" instead of guessing.
    - Add front-face aliases for double-faced cards.
  - **Expected:** an 886-card paste resolves in about 5–15 seconds instead of minutes, with no new service and no new cost.
- **Review import:**
  - A "Needs identity" filter.
  - All unresolved rows shown, not only the first 100 alphabetically, which can hide them today.
  - The name filter and sort survive a correction.
- **Closing:**
  - Today the × button, the backdrop and Escape all close the review and throw the work away, and "Revise input" drops the pasted list.
  - After: closing asks "Are you sure you want to close this window? All progress will be lost."
  - Revise input keeps the list.
  - Closing while resolving stops the lookups instead of letting them run on and reopen the review later.
- **The card data and Reality Fracture.**
  - Scryfall lists the set: 285 cards shown so far, and 87 in Reality Fracture Commander. Both release 2026-10-02.
  - Our local card list dates from 2026-09-19 and is **missing 268** of those 285 and 18 of the 87.
  - The data refresh (`tools/refresh.mjs`, the crankmagic-refresh skill) brings them in now, and runs again after release day, since previews are still arriving.
- **New deck dialog:** narrowed to its buttons, with the × aligned to the buttons' right edge. **New deck from a group:** its note says plainly that the deck's list is copied from the group's cards and that no copies move.

## 7. The PRs, in order

| PR | What | Model change |
|---|---|---|
| G1 | The import and dialog fixes: New group name, the review filter and all unresolved rows, the close warning, Revise keeps the list, batched lookups, the New deck dialog, the "from a group" note | none |
| G2 | The data refresh: Reality Fracture now, and again after 2026-10-02 | data only |
| G3 | The model: group templates, physical flag, commander + 99, Finalize as a badge, migration 3 → 4 with the dry run on Rob's library | yes |
| G4 | Add/move to group, New group from selection with the Commander flow, the Library without Ordered / Bought in store / Arrived | uses G3 |
| G5 | The import's labels by group (§6) | uses G3 |
| G6 | The Table view: groups along the bottom, stacks, each card once | uses G3 |

G1 and G2 need no decisions and can start at once. G3–G6 wait on §8.

**G3 as built (2026-09-28).** G3 ships in steps:

| Step | What | State |
|---|---|---|
| G3a | A deck holds cards whether or not it is final: a draft reserves and holds copies; New deck from a group puts your copies in the box | merged (#421) |
| G3b | Group templates and schema 3 → 4: one Bench, Commander deck groups kept by the model, To sell / trade, General; the migration, checked on Rob's library | #422 |
| G3c | A draft works like a deck: assign, the sheet and Reserve available copies on a draft; a copy in a draft is one row, not a copy and a Draft list row; the live **Commander + 99** badge ("Legal · Commander + 99", "Not legal · Commander + 8 of 99") | next |
| G3d | The buy list for every deck, and Finalize fully a badge | **waits on D4**: a draft on the buy list needs a rule for owned copies elsewhere (reserved, or read live) |
| G3e | A copy's physical place is its template group (bench, deck box, To sell / trade) | with G4 |

**Commander + 99, how it is kept.** The list still stores the commander among its hundred, and the screens
read it as commander + 99. That changes no stored deck, no export, no game file and no legality rule
(a legal list is still 100 with the commander once), so nothing Rob has built moves. Taking the commander
out of the stored list, as §4 step 2 first planned, would touch every reader of a deck (the buy list,
reservations, the Table, the simulator) for no difference Rob would see.

## 7b. The design work that follows

Rob added a design update on 2026-09-28: a new hero image for Decks, and four themes (Moss & Iron by
default, Brass & Slate, Felt & Cream, Steel & Cobalt), saved with the profile. It has its own plan,
`docs/plan-appearance.md` (PRs A1 and A2, decisions A1–A4), and comes after G3–G6. The user profile page
is in `BACKLOG.md` (§7).

## 8. Decisions for Rob

Rob agreed D1–D3 and D5–D7 on 2026-09-28, with General groups as in §3. D4 awaits his answer.

| # | Question | Recommendation |
|---|---|---|
| D1 | With "Ordered…", "Bought in store" and "Arrived" gone from the Library, where does a copy's stage change? | A card's row menu keeps one **Stage** choice (Watching, To buy, Ordered, Owned). The Orders tab keeps order tracking (vendor, arrival, prices). |
| D2 | Is To sell/trade physical, a binder a copy sits in? | **Yes.** A copy in it is not in a deck, and the `offer` flag becomes "is in a To sell/trade group". |
| D3 | The "Main Deck" starter group means nothing to the model. Remove it? | **Remove it** when empty (yours is). |
| D4 | Reservations: keep "owned elsewhere, meant for this deck" as a state? | Rob questioned it (2026-09-28). The case for keeping it, reworded: it is worked out live (never stored or locked) and shown as where the card is ("Owned · on the Bench", "Owned · in D1"), so owned cards never land on the buy list, and the Pull list says what to pull from where. **Awaiting Rob.** |
| D5 | Can a copy be in a physical group and on lists at once? | **Yes.** One physical place, any number of lists. |
| D6 | The Table view's bottom row: physical groups only, or lists too? | **Physical groups by default**, lists addable. That keeps "each card once" true. |
| D7 | The 40-card template (Limited) | **Name it now, build it later**, as agreed. Until then it behaves as a plain physical group. |
