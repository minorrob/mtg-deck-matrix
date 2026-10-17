# The instructions to Codex Astra: the Play screen, pass 2 and after

*Assembled 2026-10-12 by the UI lane's outgoing session (Fable) on Rob's instruction: "put all of the instructions to
Astra into a single directory path." This directory is that path. Everything Astra needs to read is here or named
here; nothing depends on any session's container.*

> **Merged 2026-10-17, five days after it was written.** Main moved meanwhile: Codex's Play overhaul (`docs/play-overhaul/`,
> its `REQUIREMENTS.md` and `INSTRUCTIONS.md`), the lanes as `docs/ACTIVE.md` now states them (Fable the engine and
> simulation, Codex the UI and user management), and Full screen rebuilt on a tabletop with no 3D switch. This directory
> is the record of pass 1 and of Rob's direction on 2026-10-12; by section 2's precedence, `docs/ACTIVE.md` and
> `docs/play-overhaul/` are newer and win where they differ.

## 1. Read, in this order

| # | File | What it is |
| --- | --- | --- |
| 1 | `AGENTS.md` (repository root) | The rules of engagement, binding on any agent on any platform. **Lanes** above all. |
| 2 | `CLAUDE.md`, then `docs/ACTIVE.md` | Who holds the work; the Requests table between the lanes; the UI lane's record of pass 1. |
| 3 | `docs/ui-lane/README.md` | The UI lane's brief: your files, your branch, how work reaches `main`. |
| 4 | `docs/ui-lane/gameplay-anchor.md` | The facts of a game every screen must support, and the view contract `CrankRoomView@1`. |
| 5 | **this file** | The order of precedence, the conflicts already resolved, pass 2's order, the kickoff. |
| 6 | `handoff.md` | Where pass 1 stands: the game in one page, Rob's direction in his words, the file map, the proofs, the pitfalls, the standing rules, the open engine requests. |
| 7 | `pre-lobby.md` | Rob's instruction for Play home and setting a table: what to build now, in what order, against today's table. |
| 8 | `deals.md` | The deals between the chairs: the concept as it stands, and the part the UI lane builds alone. |
| 9 | `brief-v2-play-experience-2026-10-12.md` | The second-edition brief: the Play experience reimagined from the table up (the timeline, change marks, lean in, the threat lens, sigils, decision cards, the story, Play home). The design reference for everything after pass 1. |
| 10 | `brief-v1-replit-2026-10-12.md` | Rob's first brief, verbatim: what pass 1 and the Replit concept were built to. Kept for the record. |
| 11 | `docs/ui-lane/plan-play-ui-2026-10-12.md` | Pass 1's plan: kept and refused from the concept, the lower-confidence areas, the engine requests. |
| 12 | `docs/ui-lane/sample-views.json` | 42 real views from one 60-turn game: the fixtures. |

## 2. Precedence: how a conflict is decided

Higher wins. A conflict found that this list does not settle is put to Rob in one line, with a recommendation, and
work goes on with the recommendation stated as an assumption.

1. **`AGENTS.md`** and the standing rules (American English; sliders never steps; decisions belong to the players;
   nothing names a hidden card; secrets never read; no session ends with uncommitted work).
2. **`docs/ui-lane/gameplay-anchor.md`**: a fact of the game beats any design.
3. **Rob's latest words,** in `docs/ACTIVE.md` or his feedback, dated. Newer beats older.
4. **`pre-lobby.md` and `deals.md`**: his instructions after pass 1.
5. **`brief-v2-play-experience-2026-10-12.md`**: the design reference.
6. **`brief-v1-replit-2026-10-12.md`** and the Replit concept: superseded wherever v2 or pass 1 differs.
7. **`handoff.md` and the plan**: the record of what was built and why; the code on `main` is the truth of it.

## 3. Conflicts already resolved

| Where they differ | Resolved as |
| --- | --- |
| v1: opponents across the top 40%, your board the lower 60%, in Full screen. Rob (2026-10-12) and pass 1: the mat is the whole background, bending at a horizon two thirds to three quarters up; the others at the far sides and the back. | Pass 1 and v2. The horizon is `--horizon-px` from `fit()` (30% down today; Rob's feedback may move it inside the 25–33% range). |
| v1: the step as a chip with the seven-step ribbon on click. Rob: all seven steps listed every turn. | Pass 1 and v2: the ribbon always in view, short forms under 1400px. |
| v1: the right pane's tabs Turn Resources · Panel · History · Tracker · Combat · Chat. v2: a dossier with the threat lens and the stack as cards. | Both: the tabs stay (Tracker and Combat still to build); the threat lens and the stack as cards are the dossier's new pieces, added as tabs or as the pane's top, Astra's call, said in the plan. |
| v1 keys: 1–4 bring a chair forward, L cycle layout. v2 keys: 1–4 lean in, V then 1–4 walk, T threat lens, M what did I miss. | v2, once the pieces exist. **Before binding any key**, read the help's key table (the HELP block in `crankmagic-table.js`, `.cm-help-keys`) and `tests/a11y-board.mjs` section 3, which parses every key bound in `crankmagic-board.js`'s keydown handlers and requires each to be in that help: a new key is documented there or the suite fails. |
| v1: Grid as a layout preset. The board's Table view is the 2×2. | The plan's call stands: Grid is the Table view's name in the Layout menu when that menu exists. |
| v2: Play the AI now skips the lobby. The room runs a ten-second countdown the host starts. | Build it as `pre-lobby.md` says: the client drives create, deck, ready, Start; the countdown still runs. Skipping it is Requests row 2, widened. |
| v2: a soft turn clock among the table's rules. The anchor: a dropped seat concedes after five minutes. | The clock is a reminder only, never an enforcement, and only once the table carries it (a request). |
| v2 deals: KEPT and BROKEN read from events. The anchor: the view carries history sentences, not events. | `deals.md` §2: the verdict function is built and proved against the requested event shape; nothing reads a verdict from sentences. |
| The Replit concept's land reminder, its own themes and mats, one callout at a time, `isPriority` from a title. | Refused in pass 1 (plan §1); not to be brought back. |
| v2's "nothing over 250 ms" and the 360 ms camera walk, the 600 ms turn light. | The two named exceptions stand, with reduce motion stilling both. |

## 4. Pass 2's order

Rob reorders this with his feedback; until then:

1. **Rob's feedback on pass 1**, when it arrives, as one batch: restate each item in one line in the plan, build it,
   name the suite check that holds it.
2. **Play home and setting a table** (`pre-lobby.md` §4): the New table card first, then Play home's frame, then the
   stubs styled final.
3. **The deals' beginnings** (`deals.md` §2): the two pure functions and their suite, the composer, the deal card, the
   two callouts, the stub behind the adapter.
4. **The second-edition brief's pieces that need no engine change**, in this order: seat sigils and colors everywhere;
   change marks on the board; the timeline and scrubbing from the views the client already holds; "What did I miss?"
   and the away card; lean in; the threat lens; decision cards; the planning tray; the story of the game from history
   lines.
5. **What waits on the engine** (file each as a Requests row the day you need it; the engine lane is paused, so build
   what needs no row first): the typed table channel (chat, emotes, deals); the structured events record; open tables
   and invite requests; the spectator projection; the roll frame; the card facts of row 5; filed results across
   accounts for Standing.

Each pass: a draft PR at once; `main` merged in before marking ready; the suites it touches plus `data-integrity` and
`asset-versions`; `tools/local-ci.sh HEAD 0`; one green `suites` run; a merge commit; a line in your `docs/ACTIVE.md`
section; staging on Rob's say-so; screenshots at 1280×720 and 1920×1080 to Rob with the lower-confidence areas named;
then his next batch.

## 5. What a handoff states, when you stop

In your section of `docs/ACTIVE.md`: the branch and commit; what is proven and what is assumed; the command that
proves each claim; what is outstanding and why. Push before you stop.
