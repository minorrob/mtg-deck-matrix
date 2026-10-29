# ROB-227 Snoop renderer proposal, not applied

Native and room projection already expose Snoop's public top card and offer legal Goblin spells with normal timing
and payment. The board's `mat()` passes `null` to the library pile, so it always draws a back even when the projected
library contains a revealed card. No production UI source has been edited in this engine lane.

[SNOOP-RENDERER-PROPOSAL.patch](SNOOP-RENDERER-PROPOSAL.patch) changes two renderer lines. The library uses only the
server-projected `Library.cards[0]`; an unseen library still has no card and keeps its back/count. A revealed card uses
the existing `card()` action override during a held draw, so clicking the visible top still draws once. After drawing,
the next public top uses ordinary inspection/native cast actions. Other viewers inspect the public top; they cannot
draw or cast for its owner. The existing native room remains authoritative for Goblin-only permission, timing and mana.

`git apply --check --unidiff-zero docs/engine/card-load-100-2026-10-28/w0/SNOOP-RENDERER-PROPOSAL.patch` passes against the
current board. The browser-only `candidateBoard()` applies those same two anchors in memory and refuses a moved anchor.
It never writes the production file.

Root's review caught an extra literal `+` in the first patch addition that was absent from `candidateBoard()`;
`git apply --check` had not detected the resulting JavaScript syntax defect. The patch is corrected. It was then
actually applied with native Git to the separate scratch copy
`C:\Users\robmi\CrankMagic\worktrees\load100\scratch\snoop-patch-proof\crankmagic-board.js`. The resulting bytes compare
exactly to `Buffer.from(candidateBoard(originalSource))`, and `node --check` on that actual patched file passes.
Production `crankmagic-board.js` still has no diff. The sandbox's GNU patch helper could not start; no result from
that failed attempt is credited.

The proposed [SNOOP-BROWSER-PROPOSAL.mjs](SNOOP-BROWSER-PROPOSAL.mjs) is deliberately outside the registered suite list
until the Play owner reviews it. It connects two actual native room views to the real `GameRoom` socket/check dispatcher
and broadcast. It covers Table, Focus and actual Babylon WebGL 3D, a revealed own held draw with its accessible draw
label, the other viewer's read-only public top, exactly one
draw, next-top refresh, a real paid Goblin Instigator cast from the library, a public but uncastable Mountain, another
unseen library and the public top disappearing after actual Lightning Bolt removes Snoop. Native spectator projections
are checked independently; a spectator browser is not claimed. The setup is a bounded native saved-room fixture with
recorded prefix events, not a full pod/deck-load acceptance run.

Preparation command passes without starting a browser:

```text
node docs/engine/card-load-100-2026-10-28/w0/SNOOP-BROWSER-PROPOSAL.mjs --prepare-only
```

The coordinated quiet browser audit ran with the pinned installed Chromium cache, `GEOMETRY_REQUIRED=1` and
`UAT_BROWSER=chromium`. Current renderer: RED after both Table mats mounted, at the missing native public Mogg Fanatic
card 6 in seat 0's library. That fail-fast baseline did not reach later modes; it was not an initial board-startup
failure. Candidate-only bytes: **98 checks passed**, including Table, Focus and full 3D for both room viewers. Each
full context explicitly required the actual Babylon WebGL renderer. All original held-draw, cast, next-top,
source-removal and public/hidden library assertions remained intact.

After the candidate process completed, a separate `--candidate --held-draw-reversion` run retained the revealed library
line but restored the old `card(top)` action. The unchanged held-draw assertion failed directly with expected
`board-draw`, actual `board-card`. This independently catches the second changed line; no timeout or unrelated startup
failure is counted as that mutation. All contexts, browsers and static servers closed through `finally`, and no
`node` or `headless_shell` process remained. Production board source still has no diff.

Exact logs remain outside the repository in `worktrees/load100/scratch/snoop-renderer-current-browser.log`,
`snoop-renderer-candidate-browser.log` and `snoop-renderer-held-draw-mutant.log`. The current-source run uses no argument;
`--candidate` serves only the proposed bytes. The fixture preparation command itself earns no browser credit. These
bounded proofs are not full UI/card-load acceptance, and ROB-227 is not fixed until an authorized production UI change
is applied and verified.

`AGENTS.md` reserves `crankmagic-board.js` for the Play lane and says "nobody edits a file of another lane." The concrete
browser RED/acceptance result and this unapplied patch can support an explicit narrow ownership override or a handoff
to that owner. No ownership permission is inferred from the engine assignment, and this engine lane has made no
production UI edit. The current native effect-play refresh dependency remains the first priority.
