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

The actual current-renderer browser RED and candidate browser acceptance are pending a coordinated quiet window with
the pinned installed Chromium cache, `GEOMETRY_REQUIRED=1` and `UAT_BROWSER=chromium`. Run the script without an argument
for the current renderer, then with `--candidate` for browser-only proposed bytes. Preserve all errors and teardown;
do not count a missing browser, startup timeout or the preparation command as a behavior proof.

`AGENTS.md` reserves `crankmagic-board.js` for the Play lane and says "nobody edits a file of another lane." A concrete
browser RED/acceptance result and this unapplied patch can support an explicit narrow ownership override or a handoff
to that owner. No ownership permission is inferred from the engine assignment, and no UI approval has been requested
before that reviewable evidence. The current native effect-play refresh dependency remains the first priority.
