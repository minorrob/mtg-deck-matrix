# Cloud continuation, October 7, 2026

## Recovery

Rob explicitly authorized a separate cloud checkout while Personal-HP is offline. Work is in
`/workspace/crankmagic-cloud`; the preconfigured workspace was not modified. This authorization
supersedes AGENTS.md's older Personal-HP-only checkout restriction for this continuation.
There is no repository `.agents` directory. The repository instructions, active baton, handoff,
production-readiness record, and relevant existing test workflows were read.

Fresh `git ls-remote` confirmed:

- `main`: `2ad84eb07cace0de95ae901af2f26ca7a5416f12`.
- Train B, `claude/admiring-franklin-58cxy4`: `5d068d26accb719477d18eae65750989fc4290e1`.
- Recovered follow-up, `codex/real-deck-acceptance`: `e67153295af17d6a27e0d0a3a4c3a3037b1c7a73`.

The previously uncertain follow-up push succeeded. Its committed real-deck harness and proof
records are present. The uncommitted desktop commander edit was not recovered or assumed;
the implementation below was written in cloud. The connected GitHub app independently confirmed
PR #669 open, ready, unmerged and mergeable, with successful Tests run `37576879773` on its exact
head. The shell's GitHub API route returned Forbidden; the connector works. Git fetch and push
transport are available. Train B's branch is unchanged.

## Deck edits

- A main-list card's menu offers **Remove from deck**. The review names the quantity and linked
  options, releases their reservations, and preserves ownership. Returning matching copies
  physically in that deck to the Bench is an explicit checkbox. Copies elsewhere stay there.
  A commander instead offers **Change commander**.
- Deck menus offer **Change commander**. A verified Commander-legal replacement either takes
  the old commander's list slot or promotes an existing main-list card. Promotion keeps the
  previous commander in the list. Actual owned copies and physical locations are preserved;
  an unowned replacement is never invented. The deck becomes a draft for legality review.
- **Delete deck** is available without first archiving. One confirmed transaction removes the
  plan, reports, advice and game log, releases its reservations, and records its box contents on the Bench.
  Other decks' reservations survive. Owned quantities do not change. A saved confirmation opt-out
  for archived decks cannot skip review when deleting an active deck.
- The browser test found that navigation immediately hid deletion's Undo receipt. Deletion
  now displays that receipt after navigating, so the plan and exact copy assignments can be
  recovered together.

## Proof and reproduction

All browser data is isolated fixture data. No live library was restored or edited. The nine-card
fixture is explicitly a small workshop journey, not the exact October 4 backup or a playable
100-card game. Existing exact-backup and D5 game evidence is preserved as prior desktop proof,
not newly claimed as a cloud staging run.

The continuation uses Node 22.23.3 and Playwright 1.56.0. The proxy denies the pinned Chromium
1194 download with `403 Domain forbidden`; browser checks use the installed Chromium
151.0.7922.173 through the supported `UAT_CHROME` option. This differs from CI's pinned browser.

```
node tests/collection-model.mjs
node tests/crankmagic-core.mjs
UAT_CHROME=/usr/bin/chromium GEOMETRY_REQUIRED=1 node tests/deck-holds-cards.mjs
UAT_CHROME=/usr/bin/chromium GEOMETRY_REQUIRED=1 node tests/deck-page-r3.mjs
```

The final affected set passes all 35 suites: the 34 non-asset suites pass together, and
`tests/asset-versions.mjs` passes after the final pin cascade was regenerated (119 assets).
Key browser counts: deck-holds-cards 27, deck-page-r3 41, Decks hub 24, Library 137.
The first aggregate caught the shell test's obsolete archive prerequisite; its error/retry
check now uses a genuinely missing deck while retaining the archived-deletion/Undo checks.
The asset guard also correctly rejected changed files before their final pin update.

The model passes 746 checks. Five deliberate faults were caught independently from a green
baseline and restored: retaining a removed reservation; ignoring return-to-Bench; retaining
final status after changing commander; deleting the former commander's owned copy; requiring
archive before direct deletion. Each fault was applied only to `collection-model.js`, tested
with `node tests/collection-model.mjs`, and restored before the next fault and final green run.
The browser journey covers import-owned → create-from-group, cancellation/reload, another tab
changing the reviewed library, repeated clicks, both removal destinations, Undo, commander
replacement/reload, exact-name deletion confirmation, deletion Undo, and phone controls.

The affected set is reproducible with the installed browser (run browser suites alone):

```sh
for suite in advise-brief asset-versions card-link card-states-screens card-states \
  collection-exchange collection-lobby-draft collection-model copy-merge crankmagic-change \
  crankmagic-core crankmagic-lens crankmagic-lobby crankmagic-sandbox crankmagic-tabletop \
  crankmagic-trade crankmagic-workbook data-integrity deck-holds-cards deck-import \
  deck-page-r3 decks-hub drafts-reserve feature-wiring library-r3 \
  library-references live-load refresh release-pages shell-r3 \
  slow-start status-and-groupings tour user-state wireframe-conformance; do
  UAT_CHROME=/usr/bin/chromium GEOMETRY_REQUIRED=1 PAGE_BUDGET_REQUIRED=1 \
    node "tests/$suite.mjs" || exit 1
done
```

## Unresolved release gates

- `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `CLOUDFLARE_API_TOKEN` and `OPENAI_API_KEY`
  are absent here (presence only checked). No secret values were printed or credentials saved.
- `https://staging.crankmagic.com` is blocked by this environment's egress proxy with HTTP
  CONNECT 403. This is independent of missing Access credentials; no security bypass was tried.
- The exact October 4 backup was not supplied to this checkout or found in the cloud transfer
  locations. Prior checksum and 50+30-game proof is committed documentation, not cloud file
  availability. Committed live-state decks are not substituted for it.
- Friend/agent Access, live WebSocket latency, device matrix, remaining 54 unavailable cards,
  full real-deck game coverage, AI spending approval and production review remain open.
  The proposed $5/month budget has not been accepted. No paid model request was made.
- D8 dashboard previews, optional D11 permissions, history rewriting, and deleting the old
  velocity branch remain untouched. No merge, staging release, or production deployment was made.

## Actions follow-up

PR #670 is ready for review. Actions run `37628223331` on `7a96c5d3` ran the
396-suite inventory: only `tests/generators.mjs` failed. Its data-inventory check
found the recovered `tests/uat/real-deck-game.mjs` reader missing from the generated
`data/live-state.json` row. The remaining 395 suites passed; the separate companion
step was skipped after the failure. Regenerating `docs/data-inventory.md` fixes the
reader count without changing application code or weakening a check. The next
Actions run must prove the new head before merge.

The repaired inventory passes `node tools/data-inventory.mjs --check` locally.
The complete generator suite cannot finish in this cloud environment: the unrelated
`tools/flavor-names.mjs --check` requires `api.scryfall.com`, whose request returns
HTTP 403 here. That source and its test were not changed or bypassed; Actions has
the network access to recheck the entire suite.
