# Verification of the consolidated review branch

Checked September 7, 2026 on `astra/simulation-fidelity-plan`, after merging upstream `118fe39` in merge commit `d96a575`. The production source matches that upstream implementation; the additional work is the canonical glossary and this design-review package. The redesign and proposed simulator architecture remain unimplemented pending sign-off.

| Check | Result |
|---|---|
| `bash runtests.sh -q` | **35 suites passed**, including the new upstream pilot-policy suite and workbook regeneration |
| `node tests/uat/journeys.mjs` against the repo served on port 8790 | **459 checks passed**, desktop 1400×950 and phone 390×780; no skipped journey run |
| `node tools/check-glossary.mjs` | **335 terms, 389 names/aliases**, one canonical definition per ID |
| `node tests/asset-versions.mjs` | **61 referenced assets**, consistent versions and matching recorded hashes |
| `node design/crankmagic/tests/flows.mjs` | **84 checks passed**: collection accounting, deck context, acquisition, replacements, imports, archive, graph zoom and protected-copy choices |
| `node design/crankmagic/tests/overview.mjs` | **311 checks passed**: commander details, User Functions, fixed dark mode and responsive layouts |
| `node design/crankmagic/tests/run-roster.mjs` | **65 checks passed**: Play Lab progress/cancellation, immutable sample reports, reload retention, invalid-cache and quota behavior, roster filters and columns |
| Optional Python builder | Repeated build is **byte-identical** for both outputs; standalone matches the approved external mockup after newline normalization |

The three preview suites total **460 passing checks**, with no browser runtime errors. Layout checks cover 320, 390, 736, 1024 and 1440px. Network access is blocked in the preview suites; production journeys use their recorded fixtures. Playwright and installed Chrome were supplied externally; no runtime dependency or production package manifest was added. Python's standard library is sufficient to rebuild the review artifact.

Production journeys exercised first-visit, continued use and data-exit workflows with empty, default and large collections. They do not establish the simulator's agreement with human play or live service availability. No optimization sweep, generated score update, model training or paid API request was performed. The newly upstreamed pilot ablation magnitudes are reported upstream evidence, not independently rerun measurements here.

The final standalone remains an interaction prototype. Its progress is illustrative, its result lists are repository examples and its storage is a bounded preview-report cache. These checks do not establish production card-library migration, workbook exchange, general commander search or four-deck simulation readiness.

## Reproduction and evidence

Use the commands in [README.md](README.md). `qa/overview.json` and `qa/run-roster.json` contain the current structured preview results. Rerunning tests writes fresh screenshots and reports under ignored `qa/generated/`; production screenshots are regenerated under ignored `tests/uat/shots/`.

| Generated artifact | SHA-256 |
|---|---|
| `fragment.html` | `9fdfe3ae779313584a4169e363529ca6ccc2b90817579f0223008d31488f4b98` |
| `mtg-facelift-mockup.html` | `23be3a9c3c50960438d6b8776a56ea3622457b8429a4dd1d8611549df2c8c747` |

Git ancestry checks confirm that the earlier `astra/app-improvement-plan` branch, current fetched `origin/main` and current fetched upstream feature tip are incorporated in this review branch. No main-branch checkout or update was performed. Before any future push, rerun the required Node suites and production browser journeys; publish through a draft pull request.
