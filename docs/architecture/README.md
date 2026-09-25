# docs/architecture — M11, the architecture drawn for a director

`index.html` is the page: CrankMagic's **final state** in four views (data flows, network flows, user
journeys, the data schema), with a **Show current state** toggle. It is self-contained: fonts, styles,
script and data are inline, so it opens from a file or a share link with no request. Rob's brief is
`docs/plan-to-100.md` M11.

## Where the facts come from

The page draws `architecture.json`, which is embedded in `index.html`. That file is a projection of
two graphs made by **engram** ([minorrob/engram](https://github.com/minorrob/engram), Rob's own):

| | What | Made by |
| --- | --- | --- |
| `.kg/` | **The current state**, mapped from the code: 156 files surveyed, 1,635 nodes. On top of engram's code graph, this system's own kinds: D1 tables and fields parsed from `cloud/migrations`, the Worker's routes parsed from `cloud/worker.mjs`, and every other piece emitted only when its probe matches the code today, with an `evidenced-by` edge to the mapped file | engram `map-codebase` (survey and structure), then `tools/architecture-map.py current` |
| `.kg/final/` | **The final state**, forward-modeled: 45 requirements from M1–M11, r3's INTAKE and `plan-data-sync.md` §0 (`model/intent.yaml`), designed against a Cloudflare overlay profile (`model/profiles/cloudflare/`), then the same kinds traced to those requirements. 494 nodes | engram `forward-model`, then `tools/architecture-map.py final` |

A piece's status on the page is its **membership in the two graphs**: in both, only in the final state
(planned), or only in the current map (retiring, drawn 85% transparent unless the toggle is on). No
status is written by hand. `model/pieces.yaml` names the pieces, their places in the drawings, their
tap-in detail, the probe that proves each one today and the requirements each one serves.

- `model/schema-ext.yaml` declares the kinds engram's base schema lacks (D1Table, D1Field, WorkerRoute,
  R2Object, DurableObjectRoom, OutsideSource, plus the page's records, flows and journeys). engram's
  validator enforces their edges like built-in ones.
- `/.engramclassify` marks person-level fields and every secret confidential. A confidential node
  reaches the page as its name and kind only; secrets carry a generic name and their variable name is
  never exported.

## Re-running it

Only in a cloud session (Rob, 2026-09-25), with engram cloned beside the repository and `./vendor_deps.sh`
run once in it:

```bash
ENGRAM=/abs/path/to/engram bash docs/architecture/map.sh     # both graphs, both gates, then the page's data
node tests/architecture-page.mjs                               # the page's rules (GEOMETRY_REQUIRED=1 needs a browser)
```

When a milestone lands, its probes start to match and the next run moves its pieces from planned to
in place. When the plan changes, edit `model/intent.yaml` and `model/pieces.yaml`, not the drawings.

## What the map found (2026-09-25)

| | Count |
| --- | ---: |
| Pieces in place today and in the final state | 176 |
| Planned, not built yet | 127 |
| Retiring: exist today, no place in the final state | 16 |

- **Stages 1 and 2 are complete.** Every piece traced to the release and to accounts is in place.
- **R2 is the most-shared missing piece.** M2's refresh, M3's nightly backup, M5's card definitions and
  M7's compiled cards all land in the one bucket. engram's plan orders R2 before the game rooms for the
  same reason.
- **The browser still reaches EDHREC and Archidekt directly.** crankmagic.com's security policy allows
  `json.edhrec.com` and `archidekt.com` (checked live on 2026-09-25). `plan-data-sync.md` §0 says only
  the scheduled job reads EDHREC and only the Worker reads Archidekt.
- **Scryfall lookups are cached in session storage for 24 hours**, so they are gone when the tab closes.
  §0's final state is IndexedDB, 7 days for a record and 24 hours for a price.
- **CME already has the game's state, journal, checkpoints and seat projections.** What the room needs
  from M4 is the storage adapter and the house pilot.
- **Retiring:** the local game host, Forge, the trycloudflare tunnel, Rob's laptop as a build machine,
  github.io, the Load Live workflow, the session-storage lookups, and the `?v=`-pinned data files.
