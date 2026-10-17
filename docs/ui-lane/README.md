# The UI lane: a brief for the session that takes it

*Written 2026-10-12 by the engine lane's session (Claude, a cloud container), on Rob's go. Whoever picks this up is
Fable (a Claude session) or Codex Astra, working on Rob's computer and in the cloud (Rob, 2026-10-12). The rules are
the same for any system.*

## Read first, in this order

1. `AGENTS.md`: the rules of engagement, and its **Lanes** section above all.
2. `docs/ACTIVE.md`: who holds what right now, and the open requests between the lanes.
3. This file.
4. `docs/ui-lane/gameplay-anchor.md`: the facts of a game that every game screen must support, and the contract between
   the room and the board. It was written for prototyping tools, and it is just as true for you.
5. `docs/ui-lane/astra/README.md`: the instructions to Codex Astra, one directory: the handoff from pass 1, Rob's briefs,
   Play home and the deals, and the order of precedence among them.

## Your lane

**Yours:**
- the game screen and the player's interaction with it: `crankmagic-board.js` (the board), `crankmagic-table.js` (the
  table's lobby), `crankmagic-tabletop.js`, `crankmagic-seat-art.js`, `crankmagic-sea.js`, `crankmagic-audio.js`;
- Settings' Play and display cards in `crankmagic-settings.js`;
- the stylesheets `crankmagic.css` and `crankmagic-design.css`;
- their browser suites: `tests/table-board.mjs`, `tests/a11y-board.mjs`, `tests/settings-r3.mjs`,
  `tests/board-choices.mjs`, `tests/table-lobby.mjs`, `tests/room-resolve-all.mjs` (its board half) and the other
  suites that only drive these files;
- the asset-version cascade these files need:
  1. bump the changed file's `?v=` in `index.html`, `crankmagic.html` and `crankmagic-sw.js`;
  2. bump `crankmagic-sw.js?v=` in `crankmagic-app.js`;
  3. bump `crankmagic-app.js?v=` in the pages and the service worker;
  4. run `node tests/asset-versions.mjs --update`.

  No other edit to those four files is yours.

**Not yours:**
- `game/**` (the engine and the room), `cloud/**` (the Worker and the table's Durable Object), `data/`, `tools/`, the
  card definitions, the release scripts.
- Staging and production releases: the engine lane's session releases both, and production only on Rob's go.

**The seam is the room's view,** `CrankRoomView@1`, which `docs/ui-lane/gameplay-anchor.md` describes field by field.
When the board needs something the view does not carry (the attachments of an Aura, whether a permanent is a token,
summoning sickness, which face of a card is up), don't work around it:
1. Add a row to the Requests table in `docs/ACTIVE.md`: the field, what it is for, and an example.
2. The engine lane adds it in a small PR, merged first.
3. Build against `main` once it is there.

## What is open for this lane, in Rob's words

From his playtest notes of 2026-10-11 (`docs/ACTIVE.md`, rows 9 and 10):

1. **A *Turn Resources* tab beside *Panel*.** By land and by card type: how many can be played this turn, how many in
   all, and the mana tapped. Some of this may need view fields (see above).
2. **The right pane docked, not over the mat.** "The right pane lies over the mat; it should sit beside it like the left
   one, its width dragged within the same bounds."
3. **The hover card no taller than the mat.**

**Built and merged before you started:** notes 1 to 8 and 11 to 14 (#714, #715):
- End turn always asks;
- step by step;
- the turn label;
- untap of unspent mana;
- the marker on options that help an opponent;
- the Lands row overlapping and then scrolling;
- the spell seen on the stack;
- a stack entry's card shown beside the box.

Rob may also bring back concepts from prototyping tools. See *Concepts from prototyping tools* below.

## Your environment

- **Node 22 and Python 3.12.** There is no `package.json`. Install as CI does
  (`.github/workflows/tests.yml`), from the repository root:
  `npm install --no-save --no-package-lock playwright@1.56.0`, then `npx playwright install --with-deps chromium`.
  On Claude's cloud containers Chromium is pre-installed (`PLAYWRIGHT_BROWSERS_PATH`).
- **A system that cannot run a browser cannot prove work in this lane** (AGENTS.md, *Know what you cannot prove*).
- Run a browser suite on its own, with geometry required:
  `GEOMETRY_REQUIRED=1 node tests/table-board.mjs`. It takes several minutes, and wants a quiet machine.
- The tests must be able to fail:
  1. Write `game/tools/batch/breaks-<topic>.py`, one break per thing your change makes true.
  2. Run `GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py <file>` until it prints `missed: []`.
  3. Never edit files while a breaks run is going: it edits them itself and puts them back.

## Working on Rob's computer

The system holding this lane may work on Rob's computer (Personal-HP) as well as in the cloud.
- **The one clone** is `C:\Users\robmi\CrankMagic\repo` (AGENTS.md, *Where things are on Personal-HP*). Git runs
  there and nowhere else. A cloud session uses its own checkout.
- **Your branch only:** `claude/ui-<topic>` for Fable, `codex/ui-<topic>` for Codex Astra. Never push `main`,
  `release/pages` or `release/cloud-staging`. Never force-push, and never rewrite a branch another system has pulled.
- **Secrets are never read, printed, copied or uploaded.** That includes browser profiles and saved passwords,
  `wrangler`'s sign-in in the user profile, `.env` and `.dev.vars`, SSH keys, API keys and Access service tokens. A step
  that seems to need one stops and asks Rob.
- **Never** run `wrangler`, deploy, or change Cloudflare, Access or GitHub settings. Releases are the engine lane's,
  and production is Rob's go.
- **Nothing outside the repository and the folder Rob gives you is deleted, moved or cleaned** (AGENTS.md, *Things no
  agent does*). Nothing is installed system-wide without his say-so.
- **A prototype's export lives in its own folder,** outside the repository. It is ported in; it is never committed
  as it is.

## How work reaches `main`

1. **Branch** `<your-system>/ui-<topic>`, from `main`. Open a **draft** PR at once.
2. **Before marking it ready:**
   - merge `main` into the branch;
   - run the suites the change touches, plus `tests/data-integrity.mjs` if you added a suite (the README names every
     suite and states their count);
   - then `tools/local-ci.sh <ref> 0`, the scan for secrets and personal addresses.
3. **Mark it ready.** Actions runs `suites` once, and that is the gate. The two *Workers Builds* checks fail by design
   on every branch but the release branches.
4. **Merge** with a merge commit, never a squash.
5. **Record it:** add a line to your section of `docs/ACTIVE.md` saying it is merged, and the engine lane releases
   staging.

## Concepts from prototyping tools

Rob is trying alternative Play screens in Replit, with `docs/ui-lane/gameplay-anchor.md` as the brief and
`docs/ui-lane/sample-views.json` as the data. Each concept covers Play only, the table and the game. It carries the
app's real menus and links to the rest of CrankMagic, with nothing built behind them. When he brings one back, it
comes as an exported folder and a `HANDOFF.md`. Your part:

- **Port it; don't drop it in.** The board is plain JavaScript in `crankmagic-board.js` and its CSS. A concept built in
  React or another framework is a reference to port, not code to merge. Moving the board onto a framework is Rob's
  decision, with its cost laid out for him, never the lane's alone.
- **Hold it to the anchor.**
  - Every game action must come from `view.decision.options`.
  - Nothing may name a hidden card.
  - No decision may ever be made for the player.
  - The suites stay green: `a11y-board`'s contrast and keyboard checks and `table-board`'s whole game included.
- **Send the engine lane its requests.** Anything the concept needs outside the UI (a view field, a new frame, a change
  of timing) becomes a row in the Requests table of `docs/ACTIVE.md`, with where it would touch the engine. The engine
  lane answers it there.

## A handoff states four things (AGENTS.md)

When you stop, write in your section of `docs/ACTIVE.md`:
- the branch and commit;
- what is proven, and what is assumed;
- the command that proves each claim;
- what is outstanding, and why.

Push before you stop.
