# r4 execution record

Rob authorized the revised execution plan on October 26, 2026 ("go"). The baseline is main `c567c581`.
The supplied packets are preserved under `source/`; they are source material, not independent permission to
change scope, rewrite shared history, send messages, or deploy production.

## Working agreement

- `integration/r4` holds the complete program before it reaches main. S0 lands here first, not on main.
- The coordinator owns integration, this record, `docs/ACTIVE.md`, shared asset pins, and final evidence.
- At most three workers run alongside the coordinator. Workers use their own branches and worktrees.
  Rob's approval of the revised plan permits these worktrees for this effort; the canonical checkout and
  its pre-existing untracked design handoff are preserved.
- Foundation owns tokens, type, themes, global CSS, app theme handling, entry HTML and font assets until
  handed off. Workshop owns feature modules. Play has one writer for the shared board implementation.
- Engine owns game rules, room authority, additive view fields and their tests. UI code never infers a
  legal action or exposes another seat's hidden information.
- Merge shared branches; do not rebase or force-push history another worker has pulled.
- Only one browser suite runs locally at a time. Run affected checks before pushing; use the existing
  CI gate for full validation. Do not claim a browser, device or deployed behavior that was not checked.
- The coordinator merges reviewed work. The engine worker is the staging release executor after the
  integrated candidate passes its release gates. Production requires Rob's separate release instruction.

## Sequence and workspaces

| Work | Owner | Branch | Depends on |
| --- | --- | --- | --- |
| Requirements, decisions, merges, evidence | Coordinator | `integration/r4` | Baseline |
| S0 foundation | Foundation worker | `codex/r4-foundation` | Baseline |
| E engine contracts and behavior | Engine worker | `codex/r4-engine` | Baseline; no visual dependency |
| F1 then bounded F2 changes | Workshop worker | `codex/r4-workshop` | Foundation for shared styling |
| D1, then A, B, C, D2 | One Play writer | To be assigned after foundation | Foundation; engine contracts for A/B/C |
| Integrated QA and staging | Coordinator and reviewers | `integration/r4` | All required behavior proven |

Worker checkouts are under `C:\Users\robmi\CrankMagic\workbench\r4-*-20261026`.
Workers do not change one another's checkout or operate the canonical index.

## Source and evidence

`source-manifest.json` records the supplied source hashes. `requirements.json` is the machine-readable
61-change register; `REQUIREMENTS.md` is its compact index. An item becomes complete only when its behavior
is implemented, its relevant evidence is recorded, and its commit is integrated. Original packet claims
such as "194 checks" are expectations, not executed proof.

The design source is `docs/design/2026-10-25-redesign-r4/{project,pr,build}`. The actual reference is
`project/reference/concept-b-table-companion.webp`. The packet's `project/components/*/README.md` paths do
not exist in this handoff; use the local HTML guidelines and components CSS. Generated render galleries
and embedded screenshot HTML are not application assets and need not enter the release.

## Done

Each change records its code commit, test commands and results, any relevant screenshot/frame IDs, and
remaining limits. Final proof covers the combined tree: legal choices and undo windows, privacy, keyboard
and touch, reduced motion, desktop and phone layouts, all themes' contrast, asset versions, release acceptance,
and the live staging version. Existing Load Live data is a fixture, never permission to alter Rob's library.
