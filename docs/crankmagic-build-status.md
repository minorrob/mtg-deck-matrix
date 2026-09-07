# CrankMagic production build

Authorized September 7, 2026: implement the approved application plan with static hosting and local persistence. **Simulator work is on hold until the user explicitly releases it.** Another session owns that work.

## Boundaries

- Work on `astra/simulation-fidelity-plan`, never main. Current application base includes upstream `118fe39`.
- Fetched `bba5d08` on execution start; its simulator/data refresh is intentionally not merged during the hold.
- Do not edit simulation engines, pilot policies, measurement protocols, baked measurements, simulation configuration or simulation tools. The application may consume existing verified card data and imported versioned reports. Do not invent progress or scores.
- Keep the approved mockup as the design reference. Production state must never come from its sample records.
- No paid API requests without the applicable spending authorization. Existing static guides and imported validated advice remain usable.
- Before pushing: `bash runtests.sh -q`, production browser journeys and relevant new checks. Publish only a draft PR; no merge to main or deployment.

## Implementation checklist

- [ ] Pure collection model: quantities, printings, commitments, placement, allocation, swaps, archive, Sell / Trade, audit and reversible corrections.
- [ ] IndexedDB transactions, optimistic revisions, migration review, undo, backup/checksum/restore, quota and concurrency handling.
- [ ] Card catalog, exact identity resolution, supplemental records, commander selection and staged CSV/text/XLSX intake.
- [ ] Shared CrankMagic shell, brand/mist, dark mode, responsive navigation, accessible tables, glossary and card inspector.
- [ ] My Decks and overviews; Collection and groups; Shop and assembly; imports/exports and User Functions.
- [ ] Play Lab Deck Definition and initial draft creation, report history/import and a clearly paused simulation boundary.
- [ ] Discover graph, navigation, actionable evidence-labeled recommendations and game logs.
- [ ] Enriched Excel exports and edited import reconciliation; optional local advice-pack workflow.
- [ ] Offline, failure/recovery, keyboard/mobile, large-collection, conservation and end-to-end checks.
- [ ] Final documentation, asset versions, review of simulator hold, commit, full checks and draft PR.

Update this record as work is completed; unchecked items are not delivered functionality.

## Implementation checkpoint

The new shared application is running at `crankmagic.html`. All five views are
wired to transactional local data, with a separate constructive initial-list
tool and an explicit simulator hold. The original entry pages remain pending the
final compatibility pass; their only current changes are shared spreadsheet
asset-version bumps.

Validated at this checkpoint:

- 71 `collection-model` checks, 31 `collection-exchange` checks and 23
  `crankmagic-core` checks.
- 25 `crankmagic-workbook` checks with the independent openpyxl reader enabled.
  This found and fixed an existing self-closing-cell parser bug that shifted
  fields after a blank cell. Large audit records are split into numbered parts
  before reaching Excel's cell text limit.
- 41 checks in the new Chromium journey, covering native IndexedDB, partial
  orders/receipts/placement/corrections, exact printing lots, Sell / Trade,
  concurrent writers, transaction abort on quota failure, backup/restore,
  initial construction, graph navigation, offline reopening and mobile layout.
- The existing full Node run passed every suite except the documentation index
  check for newly added test names. That documentation was corrected and the
  affected suite reran successfully. A complete final run remains required.

Still required before release: complete catalog fallback and legacy reconciliation,
improve recommendation/report comparison surfaces, exercise large libraries and
additional recovery cases, finish entry-page integration and documentation, run
both the established browser journeys and the new journeys, and perform the final
asset/simulator-boundary review. No push or draft PR has been made yet.
