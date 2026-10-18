# The CrankMagic program: north star, workstreams, and how five AI systems build one app without colliding

*Written October 18, 2026 by the Claude cloud session that held Codex's lane for a day (Fable 5.1), on Rob's
instruction: translate his outcomes into Linear, divide the work between the AI systems by the architecture, give him
one readout, and give each system its instructions. This file is the charter. `AGENTS.md` is still the law; where this
file and `AGENTS.md` disagree, `AGENTS.md` wins and this file is corrected.*

## 1. The north star, in Rob's words

Linear initiative **I-1 · CrankMagic Commander Experience — the north star**
(https://linear.app/robs-build/initiative/crankmagic-commander-experience-the-north-star-f1d5ace9617f). Each
outcome below is one Linear **project** under it; the project's name is the outcome in Rob's words so he can tell at a
glance whether what is being built is what he asked for.

| # | Outcome (Rob) | Linear project | Lead workstreams |
| --- | --- | --- | --- |
| 1 | Play any deck legal in Commander in the Play screen | P-ROB-2 · Play any Commander-legal deck | Claude · Engine |
| 2 | The game in Play is an exceptional Commander play experience (it needs a name: ROB-139) | P-ROB-1 · Play: an exceptional Commander game at the table | Codex · Play; Claude · Engine for the contracts |
| 3 | Managing my library is seamless, easy to follow, and fast | P-ROB-3 · Library: seamless, easy to follow, fast | Codex · Workshop |
| 4 | Creating Commander decks is fast and reasonable from my criteria | P-ROB-4 · Deck creation: fast and reasonable from my criteria | Claude · Deck intelligence; Codex · Workshop (screens) |
| 5 | Tuning is comprehensive and ordered: solid simulations, composition, synergies and chains | P-ROB-5 · Deck tuning: measure, understand, find the synergies | Claude · Deck intelligence; Codex · Workshop (screens) |
| 6 | Buying balances speed, print and cost by my priorities | P-ROB-6 · Buying cards: speed, print and cost, by my priorities | Codex · Workshop; Claude · Deck intelligence (logic and data) |
| 7 | CrankMagic tailored to me: preferences, aesthetics, information complexity | P-ROB-7 · CrankMagic tailored to me | Codex · Workshop; Codex · Play (the table) |
| 8 | AI in action: strategies and SWOT, coaching, upgrades, card resolution | P-ROB-8 · AI in action | Claude · Deck intelligence; Claude · Engine (the door) |
| 9 | Easily share deck builds | P-ROB-9 · Share deck builds easily | Codex · Workshop |
| 10 | Joyful end to end, from creation to managing | P-ROB-10 · Joyful end to end: launch readiness | Grok (proof); every workstream; Rob decides launch |
| 11 | Oathbreaker and Standard too, **held until the initial launch is 100% done** | P-ROB-11 · Beyond Commander (held) | Nobody, until Rob lifts the hold |

**Linear's model, as used here** (https://linear.app/docs/conceptual-model): the *initiative* is the north star; a
*project* is an outcome (what other tools call an epic); a *milestone* is a phase toward the outcome; an *issue* is a
feature, fix or decision; *labels* tag an issue across projects. Two label groups matter: **Lane** (who owns the
issue; one of the seven below, single-select) and the plain label **Rob's call** (only Rob can do this; added beside
the Lane label). An issue labeled Rob's call is in Rob's queue on the readout. The umbrella issues from before
(ROB-14, ROB-71) stay as records; new work is filed in a project and milestone, not as their children.

## 2. The workstreams: five AI sessions, one human

Rob runs three platforms: two Codex Astra sessions (GPT), two Claude sessions, and Grok Bot spinning up worker
agents under a coordinator. Each session is a **workstream** with a Lane label, a branch prefix, a readout feed it
alone edits, and a set of files nobody else edits.

| Workstream | Lane label | Platform and session | Branch prefix | Readout feed |
| --- | --- | --- | --- | --- |
| **Claude · Engine** | `Claude · Engine` | Claude Code, cloud container (Fable), the existing engine session | `claude/admiring-franklin-58cxy4` today; `claude/engine-<topic>` after | `docs/readout/feeds/claude-engine.json` |
| **Claude · Deck intelligence** | `Claude · Deck intelligence` | Claude, the second session (this one today) | `claude/deck-<topic>` | `docs/readout/feeds/claude-deck.json` |
| **Codex · Play** | `Codex · Play` | Codex Astra, session 1 | `codex/play-<topic>` | `docs/readout/feeds/codex-play.json` |
| **Codex · Workshop** | `Codex · Workshop` | Codex Astra, session 2 | `codex/workshop-<topic>` | `docs/readout/feeds/codex-workshop.json` |
| **Grok** | `Grok` | Grok Bot: one coordinator, workers on disjoint files, under a package in `docs/grok/` | `grok/<task>-<topic>` | `docs/readout/feeds/grok.json` (the coordinator) |
| Shared contract | `Shared contract` | Agreed in ROB-11 before either side builds; each side builds its half in its own files | | |
| Rob | `Rob's call` | Decisions, purchases, secrets, dashboard settings, logins, reviews, game nights | | the queue on the readout |

Why this split: the codebase has three natural seams. The **room's view** (`CrankRoomView@1`,
`docs/ui-lane/gameplay-anchor.md`) separates the engine from the Play boards. The **feature-module convention**
(`globalThis.CrankFeatures.push(fn(C))`, one file per screen) separates the workshop's screens from each other and from
the pure models under them. The **UMD models** (`deck-generator.js`, `sim-engine.js`, `collection-model.js`, the
classifier, the graph scoring) run in Node and the browser alike and are tested without a browser, which is exactly
what a Claude session in a cloud container proves best. So: Claude takes the engine and the models; Codex takes the
screens, split between the game and everything else; Grok takes bounded proof and reference work.

## 3. Who owns which files

A file has one owner. The owner edits it; anyone else asks for a change in the Requests table of `docs/ACTIVE.md`
(or in ROB-11 for a contract), and the owner makes it in a small PR merged first. "Everything else" in a row means
every tracked file not named in another row.

| Workstream | Owns |
| --- | --- |
| **Claude · Engine** | `game/**`; `cloud/worker.mjs`, `cloud/play-worker.mjs`, `cloud/game-room.mjs`, `cloud/tables.mjs`, `cloud/ai.mjs`, `cloud/access.mjs`, `cloud/migrations/**` (and the numbering of every migration); `data/engine/**`, `data/game-logs/**`; `tools/release-*.sh`, `tools/release-pages.mjs`, `tools/local-ci.sh`, `tools/run-suites.mjs`, `tools/staging-check.mjs`; `.github/workflows/**`; `tests/engine-*.mjs`, `tests/room-*.mjs`, `tests/cloud-worker.mjs`, `tests/uat/play-e2e.mjs`, `tests/uat/release-acceptance.mjs`; the release branches `release/cloud-staging` and `release/pages`; `docs/engine/**`. |
| **Claude · Deck intelligence** | The models and data: `deck-generator.js`, `draft-builder.js`, `lineup-model.js`, `compliance-model.js`, `slot-model.js`, `card-classify.js`, `custom-model.js`, `deck-measure.js`, `sim-engine.js`, `sim-worker.js`, `crankmagic-sim.js`, `pilot-policy.js`, `crankmagic-strategies.js`, `crankmagic-loops.js`, `crankmagic-graph.js` (the scoring; Discover's screen is the Workshop's), `crankmagic-graph-scoped.js`, `graph-payload.js`, `crankmagic-rules.js`, `edhrec-client.js`, `scryfall-client.js`, `crankmagic-card-client.js`, `card-catalog.js`, `card-images.js`, `card-link.js`, `deck-sources.js`, `deck-import.js`, `shop-export.js`, `guide-agent.js`, `guide-measured.js`; `cloud/advise*.mjs`, `cloud/advice-contract.mjs`, `cloud/import.mjs`; `sim/**`, `tools/sim/**`, `tools/refresh.mjs` and the data tools (`tools/*.mjs` and `tools/*.py` not named for the engine), `data/**` except the engine's; `graph/`, `payload/`, `payload_v3/`, `schema/`; `.claude/skills/**`; `docs/program/**`, `docs/readout/index.html`, `docs/readout/north-star.json`, `docs/readout/README.md`; `tests/readout-feeds.mjs`; the Node suites of these files. |
| **Codex · Play** | The game screen and the player's interaction with it: `crankmagic-board.js`, `crankmagic-table.js`, `crankmagic-tabletop.js`, `crankmagic-seat-art.js`, `crankmagic-sea.js`, `crankmagic-audio.js`, `crankmagic-stage.js`, `crankmagic-stage.css`, `crankmagic-mats.css`, `crankmagic-online.js`, `crankmagic-online.css`, `crankmagic-lobby.js`, `crankmagic-game.js`, `crankmagic-sandbox.js`; `ui-prototypes/**`; `assets/audio/**`; `docs/play-overhaul/**`, `docs/ui-lane/**`; the browser suites that drive them (`tests/table-board.mjs`, `tests/a11y-board.mjs`, `tests/board-*.mjs`, `tests/table-*.mjs`, `tests/room-resolve-all.mjs`'s board half, `tests/crankmagic-tabletop.mjs`, `tests/audio*.mjs`). Settings' Play card: today inside `crankmagic-settings.js` (the Workshop's file); the first Play PR moves it to its own `crankmagic-settings-play.js`, after which that file is Play's. |
| **Codex · Workshop** | Everything outside the Play boards: `crankmagic-app.js`, `crankmagic-route.js`, `index.html` and `crankmagic.html` (structure; pins by the cascade rule), `crankmagic.css`, `crankmagic-design.css`, `crankmagic-brand.js`, `crankmagic-landing.js`, `crankmagic-decks.js`, `crankmagic-collection.js`, `crankmagic-discover.js`, `crankmagic-lab.js`, `crankmagic-settings.js`, `crankmagic-account.js`, `crankmagic-sharing.js`, `crankmagic-orders.js`, `crankmagic-pull.js`, `crankmagic-trade.js`, `crankmagic-qr.js`, `crankmagic-exchange-ui.js`, `crankmagic-plan-editor.js`, `crankmagic-how.js`, `crankmagic-tour.js`, `crankmagic-glossary.js`, `crankmagic-facets.js`, `crankmagic-lens.js`, `crankmagic-change.js`, `crankmagic-change-ui.js`, `crankmagic-evidence.js`, `crankmagic-advisor.js` (the screen; the recommendation records come from the models), `crankmagic-trace.js`, `crankmagic-build.js`, `crankmagic-assets.js`, `crankmagic-sw.js`; `collection-model.js`, `collection-repository.js`, `collection-exchange.js`, `collection-evidence.js`, `collection-lobby-draft.js`, `user-state.js`, `cloud-sync.js`, `xlsx-*.js`, `docx-writer.js`; `cloud/library.mjs`, `cloud/sharing.mjs`, `cloud/access-invites.mjs`, `cloud/mail.mjs`; `privacy.html`, `terms.html`, `not-invited.html`; `design/**`, `docs/design/**`; the suites of these files (`tests/settings-r3.mjs`, `tests/deck-page-*.mjs`, `tests/sharing.mjs`, `tests/collection-*.mjs`, `tests/uat/journeys.mjs`, and the rest). |
| **Grok** | Only the files its package names, exclusively, per task: today `docs/uat/play-test-cases-2026-10.md` (G3), `docs/design/references/mobbin-2026-10.md` (G4), and under ROB-136 `tests/budgets.mjs` and `docs/program/budgets.md`. |

**Shared files, one rule each** (from `AGENTS.md`, extended):

- **Asset pins** (`?v=` in `index.html`, `crankmagic.html`, `crankmagic-sw.js`, `crankmagic-app.js`): whoever changes a
  served file bumps the cascade (`tools/bump-pins.mjs`, then `node tests/asset-versions.mjs --update`); a merge
  regenerates, never by hand.
- **`README.md`'s suite count:** whoever merges second sets it.
- **`docs/ACTIVE.md`:** each workstream writes only in its own section and in the Requests table.
- **`docs/readout/feeds/<workstream>.json`:** only that workstream. `north-star.json` and `index.html` are Claude · Deck
  intelligence's; a change to the outcomes' wording is Rob's.
- **Migrations:** numbered by Claude · Engine in ROB-11 before the PR that adds one is opened, whoever writes it.
- **`crankmagic-settings.js`:** the Workshop's, until Play's card is extracted (above).

## 4. The seams: how a workstream gets something from another

1. **A view field or room rule** (Play needs a fact the engine does not project): a row in the Requests table of
   `docs/ACTIVE.md`, labeled Shared contract on the Linear issue, agreed in ROB-11; Claude · Engine ships it in a small
   PR first; Play builds against `main`.
2. **A model function or record** (a screen needs a number or a recommendation): the Workshop or Play asks Claude ·
   Deck intelligence the same way; the model ships as a pure UMD function with fixtures first; the screen renders it.
   The screen never computes the number itself.
3. **A Worker route or schema** (sharing, library, AI): the owner of the file builds it; the migration number comes
   from Claude · Engine; the contract is written on the Linear issue before either side codes.
4. **A bounded task for Grok:** the lane holder who needs it writes the task into a package under `docs/grok/`
   (exclusive files, acceptance a command proves, the return format), files the Linear issue with the Grok label, and
   Rob relays the coordinator prompt. Grok PRs are reviewed and merged by the workstream that wrote the task.

A blocked workstream does not wait idle: it records the block in its feed (`blocked_on`), takes the next item in its
lane, and the readout shows the block.

## 5. Ownership: decide, or surface to Rob

Rob, October 18: every system "takes ownership of its lane; meaning it considers and thinks how things can be better
where applicable, and where a material effect on the UX/UI or alignment with north star, surfaces to me for review,
otherwise makes improvements as needed."

| Decide and build, then record it | Surface to Rob first (file a Rob's call issue with a one-line recommendation; keep building elsewhere) |
| --- | --- |
| Anything inside your files that keeps the behavior Rob has seen and approved: refactors, performance, tests, copy fixes, accessibility, bugs. | A new screen, a navigation change, removing or hiding a feature, or changing a default Rob set or a dated decision in `AGENTS.md` or `docs/ACTIVE.md`. |
| An improvement you notice in your lane that serves the outcome: build it as its own small PR and file the issue in the project so the readout shows it. | A change to what an outcome means, or to the wording of the north star. |
| How a model computes something, as long as the acceptance on the issue still holds and the evidence is shown. | Spending: API calls beyond the caps, paid tool credits, new services or subscriptions. |
| The order of your own backlog within a milestone. | Security, Access, privacy posture, production releases, and any migration that loses or reshapes data. |
| Choosing the next milestone when the current one is done. | Anything that would close the door on outcome 11 (formats), per ROB-140. |

An improvement you notice **outside** your lane is an issue in the right project with the right Lane label, not a
change you make.

## 6. The rules every workstream keeps (the short list; `AGENTS.md` is the long one)

- Read `AGENTS.md`, `docs/ACTIVE.md` (top and the lanes table), this file, and your workstream file, in that order,
  at the start of every session.
- Branch `<prefix>-<topic>` from `origin/main`; draft PR at once; `main` merged in before marking ready; a merge
  commit, never a squash, rebase or force-push.
- Before every push: the suites your change touches, then `tools/local-ci.sh <head> 0` (secrets and addresses scan,
  clean merge); paste its PASS block in the PR; one green Actions run on the head before merging.
- American English everywhere; USD only; sizes are sliders; decisions inside the game belong to the players;
  behavior that would break a game is refused with instructions.
- A test that cannot fail is a comment: each guard ships with a break (`game/tools/batch/breaks-<topic>.py`).
- No secrets, personal addresses, private hands or game records in any file, screenshot, comment or chat. Never ask
  Rob to paste a key into chat.
- Know what you cannot prove, and say so in those words: a cloud container proves suites; a browser claim carries a
  screenshot; Forge and a real table are a local session's.
- **Annotate as this repository does:** every module opens with the problem, the options, the measurement and what was
  rejected (15 to 30 lines); a function that enforces a rule cites it (a CR number, an `AGENTS.md` heading, a Linear
  ID); commit messages are a decision log that quotes the complaint before describing the fix.
- **Use the tools you have:** Claude sessions use the repository skills (`simulate-deck`, `crankmagic-refresh`,
  `crankmagic-live-load-sync`), `/code-review` and `/security-review` before marking a PR ready, the Linear and GitHub
  connectors for the record, and subagents for parallel reading; Codex sessions use `AGENTS.md` natively, their
  review command before marking ready, and the Linear connector; Grok workers use the return format. Keep prompts
  cache-friendly (stable prefix: `AGENTS.md`, your workstream file, the issue), batch independent tool calls, write
  findings to docs instead of re-deriving them, and pick the cheapest model that can do a mechanical step.

## 7. The readout: how Rob sees the whole picture

`docs/readout/index.html` is one page. It reads `docs/readout/north-star.json` (the outcomes, projects, milestones
and the launch checklist) and the five feeds, and shows: the launch checklist with each outcome's progress; remaining
hours per workstream and the one line each is doing now; Rob's queue; each outcome's items by status and owner; what
is blocked and on whom; and how fresh each feed is.

**The protocol, for every workstream, at the end of every working session and at every PR merge:**

1. Update Linear: the issue's status (Backlog → In Progress → Done only when merged, released where it ships, and the
   evidence is on the issue), a comment with the proof, the PR linked.
2. Update your feed (`docs/readout/feeds/<workstream>.json`, schema in `docs/readout/README.md`): `updated`, `now`,
   each item's `status` and `remaining_hours`, `evidence`, `asks_of_rob`, `blocked_on`. Run
   `node tests/readout-feeds.mjs`; it fails on a malformed feed.
3. Commit the feed with the work (or on its own, on your branch) and push. The page reads `main`, so a feed reaches
   Rob when the PR merges; a draft PR's feed is visible on its branch.
4. Update your section of `docs/ACTIVE.md` in one paragraph.

Rob opens `docs/readout/index.html` from his clone (double-click; it fetches the feeds from GitHub's `main`) or
serves it with `node tools/serve-folder.mjs docs/readout 8797`. It is never part of a release (`docs/` is in the
release's never list).

## 8. First estimates, and the long pole

Hours are first estimates by the author of this file from the issues' scope; each workstream corrects its own in its
feed as it learns. Days assume six productive hours per session per working day.

| Workstream | Open items | Remaining hours | At 6 h a day |
| --- | ---: | ---: | ---: |
| Claude · Engine | 27 | ~300 | ~10 weeks |
| Claude · Deck intelligence | 20 | ~280 | ~9 weeks |
| Codex · Play | 45 | ~540 | ~18 weeks |
| Codex · Workshop | 24 | ~310 | ~10 weeks |
| Grok | 7 | ~55 | bounded tasks, parallel |

Codex · Play is the long pole. Two ways to shorten it, both Rob's call: move Play's non-board items (Game Logs on the
website, Play home's frame, the Settings Play card, PostHog instrumentation of the board) to Codex · Workshop once the
Workshop's first milestones land; and give Grok the proof work around the board (test cases, accessibility walks,
benchmarks) so Play builds and Grok proves. The readout recomputes the table from the feeds, so this snapshot goes
stale by design.

## 9. Where things are

| | |
| --- | --- |
| This charter | `docs/program/README.md` |
| Instruction set per workstream | `docs/program/workstreams/<workstream>.md` |
| The kick-off prompts Rob pastes | `docs/program/KICKOFF-PROMPTS.md` |
| The launch checklist (draft for Rob's approval, ROB-137) | `docs/program/LAUNCH-CHECKLIST.md` |
| The readout and the feed schema | `docs/readout/index.html`, `docs/readout/README.md` |
| The handoff of the Play boards back to Astra | `docs/HANDOFF-TO-CODEX-2026-10-18.md` |
| Grok packages | `docs/grok/` |
| Linear | initiative I-1; projects P-ROB-1 to P-ROB-11; coordination ROB-11; the readout ROB-138 |
