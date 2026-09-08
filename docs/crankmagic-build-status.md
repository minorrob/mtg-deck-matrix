# CrankMagic production application build

Authorized September 7, 2026: implement the approved application with static hosting
and local persistence. **Simulator work remains on hold until the user releases it.**
Another session owns that work.

## Delivered application scope

- [x] Pure collection model: exact printing lots, whole quantities, commitments,
  allocation, In deck placement, source corrections, partial actions, swaps, archive,
  Sell / Trade, audit effects, linked upgrade/bracket options and reversible changes.
- [x] Native IndexedDB transactions, cross-tab revisions, staged migration, undo,
  checksummed backup/restore, quota abort, explicit damaged-record recovery and optional
  user-selected backup mirror.
- [x] Public catalog, supplemental records and reviewed exact verification; name/link
  resolution; staged CSV/TSV/text/XLSX; separate EDHREC commander ranking snapshot.
- [x] Approved CrankMagic brand, dark blue/Satoshi shell, mist, sticky navigation,
  semantic left-aligned sortable/filterable tables, groups, selected columns and glossary.
- [x] My Decks/overviews/comparison, Collection/groups, Shop/acquisition/assembly,
  partial status corrections, donor review, workbook export and User Functions.
- [x] Deck Lab Commander choice versus Deck Definition, real constrained initial
  construction and existing-list paths, report/advice history and a visible simulator hold.
- [x] Discover graph/wheel zoom/navigation, evidence-labeled alternatives, review/accept,
  dismissed recommendations, and recorded games.
- [x] Enriched Excel export and reviewed edited import, full printing fields, safe text
  cells, chunked audit records, and a zero-token advice request/response pack workflow.
- [x] Main-entry integration and documentation. `index.html` is CrankMagic;
  `crankmagic.html` is a matching compatibility shell; `graph.html` opens Discover.
  Retained legacy pages preserve measurement/migration regression coverage.

See [crankmagic-architecture.md](crankmagic-architecture.md) for module ownership,
formats, invariants, limits, services and the integration boundary. The approved mockup
and evaluations remain committed under `design/crankmagic/`; they are design history,
not sample records in production storage.

## Validation on this branch

- `bash runtests.sh -q`: **39 suites passed**, with `XLSX_PYTHON` pointing to the
  bundled Python/openpyxl runtime. The README suite-index mismatch found during the
  first run was corrected; the complete runner then passed.
- Core application checks include 71 collection-model checks, 31 exchange checks,
  44 core/conservation/provenance checks and 25 workbook checks with the independent
  spreadsheet reader. The model checks validate/project 10,000 lots without expanding
  quantities into individual repeated records.
- `node tools/check-glossary.mjs`: 335 canonical terms and 389 names/aliases valid.
- `node tests/asset-versions.mjs`: 104 referenced assets, one version per file, with
  hashes matching their recorded bumps across production and retained legacy pages.
- New real Chromium journeys: **41 assembly/main-flow checks + 30 recovery checks**
  passed. Includes native concurrency, quota abort, source corrections, exact printing,
  backup round trip, offline/mobile, migration, physical-location conservation, manual
  verification, edited XLSX import, stale forms and damaged-store recovery. A 50,000-lot
  native library saves and remains paginated, sortable and filterable (267 ms native
  replacement in the measured run; hardware/storage conditions affect timings).
- `node tests/uat/journeys.mjs`: **all 530 browser checks passed** — 41 new main-flow,
  30 recovery and the full retained 459-check legacy suite, after entry migration.
- Desktop visuals were inspected for the actual deck overview, Lab and Discover.
  New browser runs collect page errors; passing results have none. Chromium plus
  phone-width emulation is tested; other browser/device certification is not asserted.

## Simulator and release boundary

Engine, pilot, measurement, opponent/protocol configuration and baked score data are
unchanged from integrated upstream `118fe39`. The newer `bba5d08` / main `04491fc`
simulator refresh was fetched and deliberately not merged during the hold. Existing
simulator tests are run for compatibility, not as new simulator development. The
legacy measurement page fixture path in one test moved; its measurement assertions
remain intact. Reconcile the newer simulator branch only when integration is authorized.

No paid AI calls or API keys. No telemetry or uploads of private library records.
No merge to main and no deployment. Work stays on `astra/simulation-fidelity-plan`.
The complete release gates passed before the branch push. Publish for review as a draft
PR only; the simulator hold and deployment/merge boundary remain in force.
