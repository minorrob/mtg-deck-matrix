# CrankMagic application handover

Production application work is authorized. **Simulator integration remains on hold.**
This document describes the implemented application; the design proposal and simulator
evaluations in `design/crankmagic/` remain the rationale and future integration plan.

## Entry points and boundaries

`index.html` and the compatibility URL `crankmagic.html` load the same static shell.
`graph.html` forwards to `index.html#discover`. Hash routes select My Decks,
Collection, Discover, Play Lab and Shop. No framework, application server, package
installation or build step is needed to serve them. All assets are repository files
except public card lookups/images requested while using the app.

`matrix.html` remains the legacy measurement workspace during the simulator hold.
`legacy-decks.html` and `legacy-graph.html` retain its earlier companion pages and
regression coverage. Their browser records are separate from the CrankMagic library.
They have a visible migration/legacy notice. They do not silently synchronize holdings.
The retained pages are compatibility surfaces, not an alternate CrankMagic theme.

No engine, pilot policy, measured result, simulation protocol, opponent file or
simulation tool was changed by this application implementation. Existing simulator
tests still run. The legacy measurement page fixture in `tests/measure-report.mjs`
moved to its retained filename; the measurement assertions themselves are unchanged.
Upstream simulator work after `118fe39` is deliberately not integrated during the hold.

## Ownership of production modules

| Module | Responsibility |
|---|---|
| `collection-model.js` | Pure commands, whole quantities, slots, lot splitting, exact print constraints, source corrections, physical placement, allocation, archive, Sell / Trade, group membership, version history and audit effects. |
| `collection-repository.js` | Native IndexedDB transactions, expected revisions, operation IDs, cross-tab notifications, atomic undo/restore, quota abort and damaged-record recovery. |
| `collection-exchange.js` | CSV/text mapping, explicit quantities, formula-safe CSV, checksummed JSON backups, normalized Excel sheets and reviewed edits by record ID/revision. |
| `collection-evidence.js` | Imported evidence validation and comparison compatibility. No simulation execution. |
| `card-catalog.js` | Public catalog and user supplemental identities, exact matching, independent commander/card ranks, dated metadata and graph loading. Drops historical ownership fields. |
| `crankmagic-card-client.js` | Adds complete printed facts from the shared Scryfall client's existing response/cache. Preserves its queue, retries and TTL without changing legacy/simulator consumers. |
| `draft-builder.js` | Deterministic initial construction using the existing classifier. Hard price and eligible-copy limits; partial result with explicit issues when infeasible. No game simulation or optimized-score claim. |
| `crankmagic-app.js` | Shared context, dialogs, hash navigation, transactional commands, User Functions, backup mirror, inspector, supplemental verification, error recovery and worker registration. |
| `crankmagic-decks.js` | Plans/overviews, composition, commander facts, reference strategy, structural SWOT, finalization/locking/archive, game records and imported evidence. |
| `crankmagic-collection.js` | Shared roster/Shop tables, filters, grouping, chosen columns, pagination, partial actions, deck submenu, linked upgrades and bracket options. |
| `crankmagic-exchange-ui.js` | Staged file/paste import, mapping, exact identity review, deduplication, edited workbook reconciliation and full restore. |
| `crankmagic-legacy.js` | Explicit migration of older deck plans and inventory claims, generated variant selection and retention of original records. |
| `crankmagic-plan-editor.js` | Draft/group lists, exact per-card resolution and preservation of pinned choices. |
| `crankmagic-lab.js` | Commander choice versus Deck Definition, ranked/mechanic search, optional second commander, existing lists/groups, initial construction and honest held-step indicators. |
| `crankmagic-advisor.js` | Inventory opportunities, labeled historical swaps, metadata hypotheses, dismiss/review/accept, donor review and deck comparison. |
| `crankmagic-evidence.js` | Sortable/filterable side-by-side report comparison; withholds deltas when declared protocols, versions or conditions differ/miss. |
| `crankmagic-graph.js`, `crankmagic-discover.js` | Bounded typed neighborhoods, co-play versus metadata evidence, cursor wheel zoom, pan, keyboard neighbors, trail/back and supplemental lookup. |
| `crankmagic-glossary.js` | The single glossary's contextual hover, focus and touch definitions. |
| `crankmagic-brand.js`, `crankmagic-design.css`, `crankmagic.css` | Approved dark blue/Satoshi shell, wordmark, transparent wand logo, animated mist, reduced-motion support and responsive semantic tables. |
| `crankmagic-assets.js`, `crankmagic-sw.js` | Versioned data URLs and public offline cache. User records are never service-worker state. |

The root HTML files explicitly order UMD scripts. Feature modules register callbacks
that receive a shared context; they do not own independent copies of saved state.
Existing `card-classify.js`, `custom-model.js`, Scryfall/link/import modules and native
XLSX helpers are reused. `xlsx-reader.js` now rejects corrupt/truncated or oversized
parts and correctly preserves cells following a self-closing blank cell.

## Collection invariants

- A deck is a versioned plan of slots. Finalize checks the Commander list, price
  caps and current facts, reserves eligible copies and creates unmet requirements.
  It never creates owned cards. Custom bracket/playstyle/restriction compliance
  remains a human review until the held simulator is integrated.
- A lot is a quantity of the **same recorded printing**, with its own ID, acquisition
  source, one allocation and one last-confirmed physical location. Unknown printing
  fields stay unknown. Partial operations split the lot; no rounding is accepted.
- Source is Owned, Ordered or Incoming trade. **To buy** is an unmet committed
  requirement. Purpose is main deck, linked upgrade or linked bracket option.
  **In deck** requires ownership, allocation and confirmed placement to agree.
- Reallocation does not move a physical card. Releasing/swapping/archiving reserves
  compatible owned copies to outstanding needs in deck priority order, then leaves
  them on the bench allocation. A card can need moving out of its old physical box.
  Preview shows these effects before saving; Undo reverses the whole last change.
- All owned copies remain inspectable. A lock, In deck location, reservation or
  pending deal affects automatic eligibility, not visibility. Explicit donor transfer
  is reviewed. Pending deals must be released before a deck can claim those copies.
- Available Sell / Trade membership does not change ownership. Only a confirmed
  disposition reduces owned quantity. The event retains the exact former print.
- Groups contain independent planned entries and membership links to lots. Copying
  a planned entry or adding a membership never duplicates a physical card.
- User-entered supplemental cards remain unverified and excluded from automatic
  construction. Exact verification remaps current references in one transaction;
  it conserves quantities, prints and locations and retains historical identities.

## Persistence, migration and exchange

Native database `crankmagic-library`, schema 1, stores `state`, `journal`, `meta` and
rebuildable public `cache`. Each command checks the expected revision and commits
state, journal and a last-change undo snapshot atomically. A stale tab/form must
refresh/review; an aborted/quota-failed transaction does not become a visible success.
Library limit: 50,000 lot records. Tables show 60 rows per page; filters/exports operate
on the whole matching set. A measured 10,000-lot model validation/projection check is
part of the Node suite; browser timing varies with hardware and storage size.

Full JSON backups are schema-validated and SHA-256 checksummed. A checksum detects
damage; it is not a signature authenticating who created a file. Restore requires a
concrete reviewed replacement. A damaged native record has a separate recovery
screen: export the raw original, then restore a verified backup with explicit consent.
The raw damaged state/history is retained in the recovered library's legacy archive.

Older localStorage records are never interpreted as owned by loading a deck. The
user can restore saved/imported/generated plans as drafts, then separately review
uploaded inventory claims. The earlier importer merged prints and rounded some
quantities, so migrated inventory starts with unspecified prints and a visible review
notice. Original raw values remain in full backups. Browser origin/profile controls
which old data is available; a different port/host needs an exported backup.

CSV, TSV, text and XLSX inputs are staged, mapped and resolved before committing.
Exact duplicate acquisition batches are idempotent. Missing/unresolved rows cannot
silently create ownership. Edited CrankMagic Library sheets reconcile by record ID
and export revision; missing rows are not deletions. Source/deck placement/identity
changes use explicit application actions. Notes beginning with `=` are text, not
executable workbook formulas. Excel sheets carry plans, allocations, printing fields,
metadata, groups, acquisition, Sell / Trade, audit, games and reports. Large audit
records are split into numbered parts before Excel's 32,767-character cell limit.
JSON, rather than Excel, is the complete restore format.

An optional File System Access backup mirror writes only after successful commits.
It needs a supported browser and explicit file selection; permission loss leaves
the committed library intact and reports the mirror failure. Ordinary download/upload
remains available. Browser storage is not guaranteed against user deletion or eviction;
the UI requests persistent storage where supported and encourages external backups.

## Data, services and privacy

`data/commander-glossary.json` remains the **one** editable glossary authority.
`tools/check-glossary.mjs` validates it. The workbook is source history, not a runtime
override. The approved local brand/font/art assets retain provenance under
`assets/crankmagic/README.md` and `design/crankmagic/`.

`data/commander-ranks.json` is a separate dated Top 1,000 commander popularity
snapshot from [EDHREC Top Commanders](https://edhrec.com/commanders), period
**Past 2 Years**. `node tools/commander-ranks.mjs` refreshes its public pagination.
Tied ranks are preserved; combined commander pair ranks are not assigned to either
individual card. Unranked commanders remain selectable without a rank filter.
Scryfall's broader card rank is kept separately and is not labeled commander rank.

Card searches/links use the existing public Scryfall client, with exact identity
resolution, request pacing and bounded retries. Card images use Scryfall image URLs.
Public graph co-play metadata is dated EDHREC data. The static app sends no telemetry,
collection backup, physical inventory or game log to a server. A user-initiated card
lookup/image request does disclose that card name/identifier to its public provider.

No AI API key is stored, and no paid model request is made. The implemented advice
workflow exports a compact exact-list request and imports a versioned text response.
Any later direct API integration requires a separately designed credential, CORS,
budget and consent path; it does not belong inside a per-game simulation loop.

## Evidence and offline behavior

Report imports require kind, exact deck fingerprint, protocol, versions and metrics.
The fingerprint must match the current or a retained historical deck version.
Comparisons additionally require matching declared `conditions` such as pod, seat
schedule, policies, seeds and run settings. Different/missing contexts suppress
deltas. Matching declarations alone cannot prove calibration or statistical significance.
The importer labels reports as imported and retains their complete original fields.
Nothing here certifies untrusted simulator outputs as independently verified.

The service worker caches a complete versioned public shell/data set. It has no
`skipWaiting`: a failed new install leaves the complete previous cache intact, and
old tabs must close before activation replaces an older release. Saved card records,
tables and local operations work offline after initial caching. Uncached remote card
images/lookups need connectivity; failed images expose text instead of empty space.
File URLs are for the design mock only; run the application on HTTPS or localhost.

Support target: current browsers with IndexedDB, native dialog/popover and WebCrypto
on HTTPS/localhost. This release has actual Chromium desktop and 390px mobile
emulation coverage. Safari/Firefox/device-specific certification is not asserted.

Before a push, run `bash runtests.sh -q` and `node tests/uat/journeys.mjs` against a
server on port 8790. The browser wrapper runs new production and retained legacy
journeys and fails if its browser/server is missing. Every changed loaded asset needs
a new `?v=` at every reference before `node tests/asset-versions.mjs --update`.
