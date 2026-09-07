# CrankMagic — collection and deck workflow

**An Intelligent MtG: Commander Deck Creator & Card Libary**

7 September 2026 · revision 4 · proposed implementation behavior, ready for final sign-off.

This is the functional contract for the master card roster. It incorporates acquisition/placement separation, released-copy reuse, visible protected cards, Collection groups, archive, Sell / Trade, reversible corrections and enriched Excel. The design study demonstrates selected sample transitions; production storage, transactions and general imports/exports remain planned. See the [full proposal](improvement-plan.md) and [acceptance plan](end-to-end-plan.md).

## One roster, several independent facts

The master roster contains every owned copy, every recorded order and every committed acquisition requirement, including bench cards, the Sell / Trade collection and commitments for all decks. Completed sales/trades remain in history and are excluded from current owned quantities. An Oracle card identity is not a physical copy. Two decks needing Sol Ring may require two copies. Printings, finishes and conditions remain separate when known; an unknown printing stays unknown.

| Dimension | Meaning |
|---|---|
| Source | **Owned**, **Ordered**, or **To buy** for the core acquisition workflow. Import origin and past transitions belong in history. An agreed inbound trade needs an explicit **Incoming trade** label until receipt; do not call it Owned or pretend it is a purchase order. |
| Purpose | **Main deck** for a selected slot; **Upgrade** linked to the card/slot it could replace within the base bracket; **Bracket bump** linked to a replacement slot or bundle and an explicit base/target bracket. Unassigned bench copies have no deck purpose yet. |
| Allocation | Which deck and purpose a particular copy/order is committed to, or whether it is on the bench. **Reserved** is an outstanding placement commitment. A released owned copy automatically fulfills a compatible outstanding commitment, or returns to the bench. |
| Physical placement | Last explicitly confirmed location: bench, a storage box or **In deck** for a named deck. A pending physical move retains the actual origin. Orders and To buy requirements have no claimed physical location. |
| List state | Draft or Finalized, plus independent Archived state, with version history. Finalization establishes the selected hundred; later accepted changes create a new finalized revision. Archive retains the list and releases allocations. |
| Collection membership | User **Collection groups** reference existing records or separately typed draft entries. **Sell / Trade** is an explicit per-copy designation. Membership creates neither ownership nor an exclusive physical location. |
| Reuse policy | **Visibility** and **optimizer eligibility** are distinct. Every owned copy is inspectable. Deck locks exclude allocations from automatic reuse; they do not hide records or prevent a deliberate, warned user override. Each build explicitly controls which donor copies the optimizer may consider. |

Use **In deck**, rather than Active, for physical placement. “Main deck” already distinguishes the selected hundred from upgrade and bracket alternatives; calling both the selection and physical placement “active” would hide a distinction you need.

The single Actions menu can contain acquisition and placement actions, grouped and labeled clearly; the data model must not collapse Owned, Ordered, To buy and In deck into one mutually exclusive status. A card can be Owned + Reserved while on the bench, or Owned + In deck. Receiving an Ordered card changes Source to Owned and leaves its reservation intact. Putting it into the intended box completes that reservation and records In deck.

## The journey

1. **Describe the deck.** Select Commander by name or mechanics/EDHREC rank, then Auto-build 99; or start from an existing list/Collection group. Legal multi-commander configurations adjust the remaining card count. Set the base/target bracket, maximum bracket, budget, play style, desired speed, competitiveness, saltiness and reuse preferences. Every owned copy stays accessible in the builder. The optimizer uses only the explicitly selected pool; bench-only excludes other decks' In deck copies.
2. **Build and test.** Propose the remaining cards or improvements to the imported list. Compare supported strategies against the selected opponent decks and policies. Display model coverage and uncertainty. The current heuristic engine cannot yet establish reliable full-game outcomes across all Commander strategies; the simulator work in the main plan remains necessary.
3. **Review.** Show each outgoing card beside its proposed replacement or coordinated bundle, evidence, cost, acquisition source, existing allocation and intended purpose. Accept/reject individually where the bundle allows it. Keep a bundle atomic when its benefit depends on all its cards. Declining a suggestion changes no inventory.
4. **Finalize.** Validate the selected hundred, including the command zone under the applicable rules. Reserve its 100 slot commitments. Link suitable owned copies and existing orders; create To buy commitments for the remainder. Explicitly resolve any competing allocations. A generated or imported deck alone proves neither ownership nor an order.
5. **Fulfill incrementally.** Pull owned copies from the bench, mark purchases as Ordered, mark deliveries or store purchases as Owned, and separately mark cards In deck. Keep every outstanding commitment visible. Repeated imports or receipt clicks must not duplicate cards.
6. **Change a finalized slot.** Review upgrades within the current bracket or bracket-bump options bounded by the user's ceiling. Accepting a replacement atomically updates the selected slot and allocation. Automatically reserve a released owned copy to a compatible outstanding To buy commitment; otherwise return it to the bench. Its physical location stays recorded until moved. An outgoing order remains an order, never an owned bench copy; cancellation or reassignment must preserve its actual purchase state.
7. **Protect the build.** Lock its allocations against automatic reuse. All its owned cards remain visible. A deliberate manual transfer is possible after a hard warning and explicit override for the selected copy. Acquisition and placement can still be updated. Readiness is independent: a finalized list with 100 cards Owned is acquired; 100 confirmed In deck is physically assembled. A lock implies neither.

Finalization is a commitment boundary, not a ban on future changes. Each accepted change records a new list version, its allocation effects and the measurement version used to justify it. Any affected measurements become stale until rerun.

## Cross-deck example

Atraxa's proposed replacement is an Astral Cornucopia already Ordered and Reserved for an unlocked Shadrix deck. The review presents three concrete decisions:

- **Acquire another copy:** keep Shadrix's order and reservation; create a distinct To buy requirement for Atraxa. There are now two intended copies and one actual order.
- **Transfer this allocation:** move the existing order's allocation to Atraxa, preserving order details. Shadrix retains its intended slot but now has an explicit unfulfilled requirement. No second order is invented. If the transferred copy is already physically in Shadrix, that location remains until you confirm the move; Shadrix's physical and intended lists temporarily differ.
- **Keep the current card:** leave both decks and all acquisition records unchanged.

For a locked donor, automatic reuse is unavailable by default, but its copies are visible. Manual transfer offers a specific override after disclosing both the lock and the donor shortfall. That override applies to the selected copy; it does not unlock the entire donor deck. Acquiring another copy remains possible. Eligibility is evaluated per copy/allocation: a protected copy must not hide a separate available copy of the same card.

The donor shortfall is disclosed before accepting a transfer. Automatically placing a new order is never part of that transfer. Undo restores both decks, the original requirement, copy/order references and quantities together.

## Automatic reuse when a copy is released

The default is your requested behavior: **reuse an owned copy to fulfill an existing need before leaving it on the bench.** This is part of accepting the replacement, not a second inventory intake operation.

1. Apply the proposed slot changes to the intended lists in memory. Resolve the resulting set of requirements and releases together, so a multi-card swap cannot fulfill the same need twice or temporarily double-allocate one copy.
2. For each released owned copy, find still-unfulfilled, committed To buy requirements for other decks. Ignore draft suggestions, removed requirements and demands already covered by an order, another copy or an agreed incoming trade.
3. Match card identity and the destination's printing requirements. “Any printing” can accept a verified matching card; a specific set/collector number, finish, language or minimum condition must be satisfied. Unknown metadata cannot silently satisfy a specific constraint.
4. For one compatible need, reserve the copy there automatically, change that requirement's fulfillment from To buy to Owned, and remove only that fulfilled quantity from the purchase queue. Ownership totals do not change. Fulfilling an existing slot in a locked destination is allowed: it does not remove a protected donor allocation or alter the destination's chosen list.
5. For multiple compatible needs, use a visible priority policy: explicit user deck priority, then main-deck commitments before optional committed upgrades/bracket cards, then oldest commitment as a stable tie-breaker. Show the selected destination in the swap preview and offer Change destination or Keep on bench before acceptance. Rejected or explicitly excluded requirements cannot be fulfilled again in the same transaction.
6. With no compatible need, assign the owned copy to Bench. If it is physically in the outgoing deck, show **Bench · move pending from Atraxa**. If assigned elsewhere, show **Reserved for Shadrix · move pending from Atraxa**. A Pull / Move action completes the physical update.
7. Present one receipt summarizing the incoming replacement, outgoing copy's destination, purchase-queue reduction, any donor shortfall and required physical moves. One Undo reverses the whole transaction.

Choosing Keep on bench is a saved exception for that decision, not something background reconciliation immediately overrides. A destination choice is an allocation preference; it does not silently add or remove a Sell / Trade designation. If a copy is already promised in an agreed sale/trade, ordinary automatic reuse cannot consume it.

An outgoing Ordered copy may be reassigned to an unmet requirement through an explicit order-reassignment action, but must remain Ordered until received. The app never silently cancels a real-world purchase or labels an unreceived order as bench inventory. Releasing a To buy commitment simply removes that demand, with history retained.

## Collection groups and deck context

Call the workspace **Collection** and its user-created folders **Collection groups**. A group can hold references to actual copies/orders/commitments, or separately typed draft entries imported for a future deck. A draft entry has identity/quantity intent, not an acquisition Source. It appears as Plan only, never Owned or To buy until the user records an acquisition or commits a deck. Two groups referencing one physical copy still represent one owned copy.

From an inspector, **Move / add to group** changes organization. Moving between ordinary groups removes the old membership if requested; adding keeps both references. Moving a draft entry moves its plan record. A deck group is derived from allocations: choosing a deck destination invokes slot/transfer review, not ordinary folder membership. Sell / Trade is a separate explicit designation.

Create groups within Collection or inline from Lab. Accept CSV with quoted names, pasted decklist text, and per-card name/quantity entry. Stage validation and identity/printing reconciliation before applying; reject malformed or fractional quantities without guessing. The group's 100-card count does not establish Commander legality. A partial ideas group can be saved and enriched later. Supplemental card facts are stored with the user's catalog and included in backups and enriched workbooks.

Selecting a deck tile opens its overview. **View deck cards** opens Collection with a removable deck filter and recognizable deck context. Clearing filters removes both the deck context and any other active filters, showing all collection records. Presentation filters never redefine ownership, allocations, optimizer eligibility or backup scope.

## Archive and restore

Archiving a deck removes it from allocation destinations, active Lab inputs and automatic reuse donors. Its list, commander, intent, guide, measurement receipts and history remain inspectable under Archived decks. The tile's ordinary status stays In progress or Ready to play; its commander subtext is its key mechanic, not a second lifecycle label.

Preview archive effects before applying one transaction. Release owned copies using the same compatible-demand priority policy as a replacement; otherwise return their allocation to the bench. An In deck copy keeps its actual box location with a move task. An ordered card remains an order, can be reassigned explicitly, and is never lost or marked received. Remove only this deck's unfulfilled To buy demands. Do not release copies owned by another deck merely because a saved list mentions them. Preserve Sell / Trade membership and ongoing deal holds.

Archive can override that deck's protection after review. It must not consume allocations protected in another donor. Undo reverses the entire archive when revisions allow; after intervening transactions, review conflicts rather than stealing copies back. **Restore as draft** retains the saved list but performs fresh allocation review at finalization. It does not promise that the old physical deck still exists.

## Reversible acquisition and placement choices

Current Source and Placement appear in their own left-aligned columns. The far-right Actions caret contains Mark ordered, Bought in store / Mark received, Put in deck, Move to bench, Replacements and corrections as appropriate. Put in deck offers live, non-archived deck names in a left-opening submenu when space permits, with click, keyboard and touch alternatives. Full destinations require selection of the replaced slot; avoid creating a 101-card list or two allocations for one copy.

Moving a mistaken Owned record back to Ordered or To buy is an explicit **record correction**: preview the removed ownership claim, reservation retained and In deck placement cleared. Allow Undo. A real return, cancelled order, sale or trade is a separate transaction with the actual quantities and dates. Never imply the app reversed a real-world transaction. Repeat receipt or placement clicks are idempotent; correction history explains a backward transition rather than blocking it.

Shop has **Buying & orders** for requirements/acquisitions and **Ready to assemble** for owned reserved copies and pending physical moves. This is the proposed second view. Its placement actions show which deck was selected in the row, and changes remain visible in the master Collection even when they leave a filtered Shop view.

## Commander selection, result lists and display controls

Play Lab distinguishes **Commander choice** from **Deck Definition**. The commander catalog includes every legal option, including unowned cards. Reuse restrictions on the remaining deck do not restrict commander search; any commander purchase is explicitly counted in the acquisition budget. Choosing or generating a list creates no owned copies.

Completed Deck opens that run’s exact candidate list in Collection, visibly filtered by deck/list. It stays a draft until reviewed and finalized; simulation completion alone reserves nothing. Saved reports retain immutable inputs and deck snapshots so later edits do not rewrite historical results.

Roster filters include card type, subtype, mechanic, color, mana value, cost range, source, placement/status, deck/list, physical bench and Sell / Trade. A reserved owned card can physically be on the bench. Column visibility is independently selectable, with local display preferences and a reset; hiding a field never changes its underlying value. Keep headers, sorting, grouping and action menus usable with any supported column selection. Exports distinguish current visible columns from full enriched records.

## What the user sees versus what the simulator may use

The builder always offers **All owned cards**, with printing/copy expansion showing Source, current deck, In deck or Reserved, Sell / Trade, physical location and lock. Browsing, sorting, filtering or inspecting never changes eligibility or allocations. User-selected filters may narrow a view, but the app does not hide records because they are protected.

**Bench-only mode** is a precise constraint: use owned copies available on the bench, including copies designated Sell / Trade unless excluded by the user. Do not use other decks' In deck copies, their reserved copies, unreceived orders or new purchases unless their respective controls are enabled. Copies pending removal from another deck are identifiable for the future list, but do not count as immediately usable bench stock; show the required move explicitly. When tuning an existing deck, its own current cards remain the baseline; the bench restriction applies to additions, not removal of the input deck from the simulator.

Use a compact build-scope control with visible summary and expandable options:

- **Use cards In deck elsewhere** — off in bench-only mode. Turning it on admits unlocked donor copies for proposals and shows their current decks. It does not move or reserve them during simulation.
- **Use cards Reserved for other decks** — a separate choice, because an unassembled planned deck also has commitments.
- **Include ordered copies** — future availability, clearly distinguished from cards usable now.
- **Include Sell / Trade cards** — on with the bench pool, as requested; can be turned off for a particular build.
- **Allow purchases** — exposes the purchase budget and changes the constraint from bench-only to bench plus acquisitions.

Locked donor decks remain excluded from automatic reuse unless specifically opted in by deck or copy. The general In deck toggle does not quietly override every lock. A user can inspect and manually choose any still-owned copy, including a protected one, and then explicitly override the relevant restriction. Already sold/transferred cards are history, not available owned copies.

The optimizer only proposes changes. On acceptance, a hard warning names any donor deck that loses an In deck copy, the exact printing, the resulting shortfall, replacement cost if known, and any lock or Sell / Trade effect. Offer **Transfer this copy**, **Acquire another**, and **Keep current**, with no preselected destructive transfer. Prefer an eligible bench copy of the same acceptable printing when one exists. Revalidate current allocations when accepting a saved result; a copy sold, reassigned or received since the simulation ran must not be double-used.

## Sell / Trade without losing collection fidelity

The card inspector and selection toolbar offer **Put in Sell / Trade** for explicitly selected owned copies. The collection stays part of the master roster and its uncommitted copies remain bench candidates. Membership alone does not reduce Owned, create a sale, or change the physical location. A name-level action expands printings and quantities so the user can choose the exact copy or a homogeneous lot quantity.

Record the printing ID when known, set, collector number, finish, language, condition, and relevant distinguishing details such as signed/altered status. Keep dated price metadata separate from purchase cost, asking price and the eventual sale/trade value. No price lookup can establish condition or ownership. Unknown printing details stay visible and unresolved until confirmed.

Use a short local workflow:

- **Available to sell/trade:** user-designated copies remain eligible like other bench copies. Show the flag in build and swap review. Assigning one to a deck retains the designation but pauses its offer availability; provide an explicit Remove from Sell / Trade choice.
- **Deal pending / held:** a specific copy is committed to an agreed transaction. It remains owned until disposal is recorded, but automatic deck selection excludes it. A manual change requires explicitly cancelling or revising that deal commitment, rather than promising the copy twice.
- **Completed:** the user confirms the precise outgoing copies/quantity. Reduce current ownership and remove their allocations in one transaction. Keep a disposition record linked to those copy IDs. If a selected copy is In deck or Reserved, a hard warning exposes the affected deck and shortfall before completion.
- **Trade received:** explicitly record the actual incoming copies, printings and condition. An agreement alone does not add ownership. Pending incoming copies display Incoming trade and may cover a requirement as a future acquisition; they cannot be mistaken for Owned or appear as an uncovered purchase. A trade may have different outgoing and incoming quantities, and receipt may happen later than handoff.
- **Cancel, correct or reverse:** preserve an audit trail. Returning a real card to inventory requires an explicit return/receipt record; undoing a local mistake must never be presented as reversing the real-world sale.

Sell / Trade is an offer designation, not an exclusive deck reservation. A pending deal, however, is a fulfillment commitment and competes with deck reservations. This distinction prevents double-counting while preserving your ability to choose where a copy goes. No external marketplace posting, messages, payments or automatic sales are part of this static-app scope.

## Filters and grouping without visual clutter

Every list shares a small, consistent toolbar: Search, Filters with active-count badge, Group by, Sort and a contextual Import / Export menu. Essential filters appear as removable chips; more choices open in a drawer or compact sheet. The filter summary states what is included, result counts distinguish card names from copies, and Clear filters is always easy to find. Empty results retain the active filters and offer a clear recovery action.

Every table always has visible column headers and sort/filter options. Headers remain visible in mobile, grouped and empty states. All values, including numbers and statuses, are left aligned within stable columns. Use one shared table layout rather than independent per-row grids. Row actions such as Mark ordered, Bought in store and Replacements are options in a single caret menu; changing the options never shifts Source or Placement. Column-heading buttons show sort direction, active filter chips explain the current view, and menu controls support keyboard, Escape and outside-click dismissal. Secondary metadata can move into the inspector to save space while keeping headers and core column alignment intact.

Offer saved views such as All owned, Bench, Needed, In deck and Sell / Trade. Useful facets include Source, purpose, deck, placement, lock, printing/set/finish/condition, color identity, mana value, type, role, price and acquisition need. Group by one dimension at a time, with a second level optional in advanced view. Name groups expand to printings and then quantities/allocations; identical names never erase printing distinctions. Remember each view's presentation preferences locally, independently of the build's eligible card pool.

Keep list/gallery and graph selections coordinated through the same inspector. Card groups display badges such as “3 owned · 1 bench · 2 In deck” rather than hiding copies or filling every row with controls. Bulk actions appear after selecting rows and preview exact copy counts and affected decks. Export says whether it includes All records or the current filtered selection; exporting a filtered list must never silently become a full-collection reconciliation on import.

## Import, export and enriched Excel files

Preserve and extend the repository's existing `inventory-import.js`, `xlsx-reader.js`, `xlsx-writer.js`, `deck-audit.js` and Shop export paths. The current XLSX writer already produces offline workbooks using the project's ZIP writer; this feature does not require a backend or runtime package download.

**Full backup / restore:** one versioned JSON file contains the complete user state: holdings and printings, acquisition records, requirements, allocations, Sell / Trade membership and transactions, intended and physical deck versions, intent, recommendations and their provenance, measurement receipts, game logs, preferences and history. Restore validates the schema and totals before committing and offers a rollback snapshot. Merge is a separate operation with stable-ID conflict review, not an implicit side effect of Restore.

**Collection and plan intake:** accept CSV, supported XLSX sheets, pasted decklists and existing app backups through explicit entry paths. Let the user identify the file as an acquisition batch, collection snapshot, deck plan or spreadsheet edits. Preview mapped columns, exact printings, unknown identities, quantity errors, duplicate batches and allocation effects. A decklist alone cannot create Owned records. Missing rows from a partial or filtered sheet never imply cards were sold or removed.

**Excel workbook:** generate locally from one consistent state revision. Include a Summary, Library, Deck plans, Allocations, Upgrade and Bracket options, Acquisition queue, Sell / Trade, Transactions/History, and a Metadata dictionary. Optional per-deck sheets show the intended hundred beside physical placement, fulfillment source and alternatives. Include all captured metadata through normalized sheets keyed by stable IDs, rather than duplicating huge fields on every visible row. Nested evidence remains readable across linked sheets or text fields; the workbook is not advertised as a complete restore format.

Library rows distinguish card identity, printing identity and owned copy/lot identity, with quantities, source, purpose, deck, location, In deck/Reserved, offer status and locks. Enrich with known mana cost/value, colors, types, rules text, roles, legalities/bracket tags with snapshot date, prices/currency/date/source, purchase cost and user notes. Plan and recommendation sheets add target intent, proposed replacements, estimated purchase need, measured outcomes and model coverage/provenance when available. Unknown values stay blank or explicitly Unknown; an absent price is not zero.

Provide frozen headers, filters, sensible widths and number formats, valid links, and materialized numeric values so totals are meaningful without a first Excel recalculation. If formulas are included, preserve cached values and validate them against app totals. Treat user-supplied text as text; it must not execute as spreadsheet formulas. Exports distinguish unique cards, owned copies, orders, incoming trades and unfulfilled requirements.

**Spreadsheet edits back into the app:** include export revision, row/copy IDs and an explicit editable-column contract. Re-import stages changes against that baseline. User edits to quantities, locations, notes or offer designation are reviewable; conflicting changes since export require resolution. Derived scores and authoritative metadata are not silently overwritten by edited display columns. Generic external sheets without IDs use identity/printing reconciliation and explicit import mode. Re-importing the same file or batch is idempotent.

**Trade/share export:** offer a selected-printing CSV or Excel list with chosen fields for a trading partner or shop. Keep private notes, acquisition costs, full deck allocations and history out unless explicitly included. Generating a local share file does not send it anywhere. The full personal workbook remains available with all captured metadata.

## Refinements I recommend

**Treat the hundred as commitments, not evidence of holdings.** “Reserved 100” can be true with zero owned cards. The UI should show the acquisition breakdown beside the committed total, never conflate it with the owned total.

**Separate candidates from acquired or committed alternatives.** An unselected recommendation appears beside a slot and does not automatically become a purchase requirement. You may explicitly reserve or acquire an upgrade or bracket option in advance; it then belongs in the roster with that purpose while remaining outside the current main hundred. Selecting it promotes it into the main slot and releases or reassigns the outgoing commitment. Purpose history preserves why it was originally acquired.

**Separate locking from completion.** You should be able to protect an incomplete build if needed. The normal journey can offer Lock after assembly without requiring that sequence. An unlocked, complete deck remains playable; a locked, incomplete deck remains incomplete.

**Apply bracket changes to the whole list.** A “bracket bump card” is part of a candidate list or bundle, not proof that adding one card reaches a bracket. Re-evaluate the resulting list against the pinned bracket rules and supported measurements. A B1 deck may have B2 and B3 paths under a B3 ceiling. A B2 deck has a B3 path. A B3 deck under a B3 ceiling has within-bracket upgrades only. Reductions are a separate tuning intent. Never increase the user's ceiling silently.

**Automate allocation without guessing physical reality.** A released owned copy automatically moves to Bench or the chosen outstanding requirement in the app. If it is still in the original box, retain that physical location and a move task until confirmed. An ordered replacement may still be in transit. Physical and intended deck snapshots can differ during assembly and must both remain inspectable.

## Acceptance examples for implementation

- Finalize from an empty roster: 100 selected slots, 100 To buy commitments, zero owned and zero ordered.
- Reserve three owned copies across five finalized deck requirements: three fulfilled allocations and two shortfalls, never five owned.
- Receive one reserved order: ordered decreases by one, owned increases by one, allocated deck stays fixed, In deck count stays fixed.
- Put the received copy in its box: ownership stays fixed, Reserved becomes In deck.
- Acquire a second copy for another deck: the original order/holding remains unchanged; the second requirement cannot become Owned before a receipt or explicit inventory record.
- Transfer from an unlocked donor: the copy/order remains singular; both deck versions and the donor shortfall update atomically. A locked donor cannot be transferred implicitly.
- Replace an owned In deck card: its ownership and physical location remain in the roster with a pending move until explicitly updated.
- Release a compatible owned copy when another finalized deck needs it To buy: reserve it there, reduce that purchase requirement by one, keep ownership fixed and retain any pending physical move.
- Release a foil when the outstanding demand specifies a nonfoil printing: do not silently substitute; keep it on the bench or show a user-selectable relaxation.
- Release a copy needed by multiple decks: apply the displayed priority policy, allow a destination override and never satisfy two slots with one copy.
- Keep a released copy on the bench by explicit choice: reconciliation respects that exception.
- View a locked deck's copy in the builder: it is visible with context, excluded from automatic selection, and manually transferable only after explicit warning/override.
- Run bench-only optimization: no other deck's In deck or reserved copies are used; Sell / Trade bench copies are eligible. Turning on In deck reuse allows proposals without changing allocations.
- Put two copies from a five-copy lot in Sell / Trade: ownership stays five; three ordinary bench copies and two flagged bench copies remain five, not seven.
- Complete a sale of one exact printing: reduce only that owned quantity; preserve other printings and the completed disposition history.
- Agree to receive a trade card: it remains non-owned until receipt and is not double-listed as an uncovered purchase requirement.
- Save an optional upgrade: the main list stays at 100, with the alternative separately linked to its target slot and purpose.
- Undo any transition: restore all affected quantities, allocations, physical placements and shortfalls together.
- Export, reload and restore: preserve these distinctions and their history; collection, Matrix, Discover and Shop agree.
- Filter or group the library: totals remain correct and simulator eligibility stays unchanged.
- Export all metadata to Excel and open it with an independent reader: printing and quantity fidelity, visible totals, valid sheet names and links, numeric types and readable headers survive.
- Re-import spreadsheet edits after a concurrent app change: show a conflict instead of overwriting newer state; re-importing the same accepted batch adds no copies.

## Current preview verification

Design study 04 uses embedded Satoshi and artwork, with blue accents, fixed dark mode, a User Functions preview and temporary sample state. The [acceptance plan](end-to-end-plan.md) records the final preview checks. It demonstrates commander selection and existing-list Lab entry, groups, deck overviews, clearable Collection context, Shop views, graph wheel zoom, acquisition corrections, warned transfers and archive/undo in addition to the shared table behavior. The production implementation must still validate general print/copy matching, multi-deck priority, conflict-safe persistence, sale/trade transactions and enriched Excel. A mockup passing its sample journeys is not evidence that these production features are complete.
