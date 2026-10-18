# Claude · Engine: the instruction set

*Platform: Claude Code in a cloud container (Fable), the engine session that has held this lane since October 16.
Linear label `Claude · Engine`. Feed `docs/readout/feeds/claude-engine.json`. Branch today
`claude/admiring-franklin-58cxy4`; new topics `claude/engine-<topic>`. The charter is `docs/program/README.md`; this
file adds only what is specific to this lane.*

## 1. What this lane is for

Two of Rob's outcomes rest on it, and a third depends on its contracts:

- **Outcome 1, Play any Commander-legal deck** (project P-ROB-2): every legal card plays, through the card load
  program; the six live decks are proven card by card; a list that cannot play yet is named with its reason.
- **Outcome 2, the Play experience** (project P-ROB-1): the engine's half, the room's view contracts the board
  consumes (payment drafts, combat pairs, round and turn, events, card facts, the countdown, the roll frame).
- **Outcome 8, AI in action** (project P-ROB-8): the AI door and the meter in the Worker (ROB-95, ROB-132).

Everything in `docs/handoff-fable-engine-2026-10-16.md`, `docs/engine/PLAN.md`, `docs/engine/plan-card-load-program.md`
and ROB-71 still applies; this file reorganizes it under the outcomes and adds the readout.

## 2. Read first, in this order

1. `AGENTS.md`. 2. `docs/ACTIVE.md`, the top and the lanes table, then your own section ("the engine lane resumed").
3. `docs/program/README.md`. 4. This file. 5. `docs/readout/README.md`. 6. ROB-71 and ROB-11 in Linear.

## 3. Your files

The Engine row of the charter's table (§3): `game/**`; `cloud/worker.mjs`, `play-worker.mjs`, `game-room.mjs`,
`tables.mjs`, `ai.mjs`, `access.mjs`, `migrations/**` and the numbering of every migration; `data/engine/**`,
`data/game-logs/**`; the release and CI tooling; the engine, room and cloud-worker suites; the release branches;
`docs/engine/**`. The Worker files that the Workshop now owns (`cloud/library.mjs`, `cloud/sharing.mjs`,
`cloud/access-invites.mjs`, `cloud/mail.mjs`) and the advice files Deck intelligence owns (`cloud/advise*.mjs`,
`cloud/advice-contract.mjs`, `cloud/import.mjs`) are routed by `cloud/worker.mjs`, which is yours: a new route is a
request to you, answered in a small PR first.

## 4. The order of work

| Order | Issue | Why now |
| --- | --- | --- |
| in flight | ROB-76 round and turn; ROB-77 events.v1 (#747); the combined staging release of main | Three Play items (ROB-53, ROB-50) wait on them |
| 1 | ROB-74 payment drafts, Confirm cast, Auto-pay | Unblocks ROB-25, the most-felt playtest complaint |
| 2 | ROB-75 combat projection and block-draft validation | Unblocks ROB-26 |
| 3 | ROB-78 which sources paid, card facts | Unblocks ROB-49 |
| 4 | ROB-94 the six live decks' regression coverage | Outcome 1's first milestone; also finds ROB-17's card |
| 5 | ROB-86 and ROB-87 in parallel (demand capture; the sentence library) | Card load steps 1 and 2 |
| 6 | ROB-103 the lobby names what cannot play and why | Needs ROB-86's table |
| 7 | ROB-88, then ROB-90 after Rob's cap, ROB-91, ROB-92 | Card load steps 3 to 6 |
| 8 | ROB-79 countdown, ROB-80 roll frame, ROB-82 commander audit, ROB-83 constructs, ROB-93 waves | As the board and Rob's decisions allow |
| when asked | ROB-132 the meter; ROB-40, ROB-41 (Access); ROB-68 Supabase evaluation; ROB-102 after ROB-23 and ROB-24 | |

Rob's decisions already in your feed's `asks_of_rob`: ROB-95 (the two AI-door settings), ROB-90 (the backstop's
cap), ROB-93 (waves wait or not). Don't block on them; the readout shows them to Rob.

## 5. Seams you serve

- **Codex · Play** reads `CrankRoomView@1` (`docs/ui-lane/gameplay-anchor.md`) and `events.v1`. A field it needs is a
  row in the Requests table of `docs/ACTIVE.md` and a Shared contract issue in ROB-11; you ship it additive, with a pod
  key if it changes the options offered, merged first.
- **Codex · Workshop** needs migration numbers (ROB-127 preferences, ROB-86's `card_demand`, ROB-88's
  `card_candidates`) and Worker routes for the public deck page (ROB-134). Answer in ROB-11 within the same day; a
  number is cheap and a collision is not.
- **Claude · Deck intelligence** needs, for ROB-116 (simulation fidelity), a headless entry point that plays N seeded
  games with the AI pilots and returns a per-game summary; `tools/playtest-decks.mjs` and `tools/fuzz-live.mjs` are
  the nearest things. If one exists, say where; if not, it is a small PR in `game/tools/`.
- **Grok** gets the playtest harness run (G5) once Rob issues the four service tokens.

## 6. Decide, or surface

Decide: card definitions, rules constructs, projection fields (additive), room semantics that the anchor already
describes, test and tooling changes, CI fixes, staging releases of green main. Surface to Rob as a Rob's call issue:
anything that changes what a player is asked or shown at the table (a new decision, a removed confirmation), Access
policy, secrets, production releases, the backstop's spend, a migration that reshapes data, and the format field
(ROB-140) when you next touch the table settings record.

## 7. Done, and proof

An issue is Done when: merged with a merge commit on a green run of the head; released to staging (byte-identical,
announced in ROB-11); scenarios per card and a break per guard; replay of recorded games unchanged (a pod key
otherwise); the no-leak harness clean; the evidence on the issue. Proof commands this lane runs before a push: the
engine suites the change touches, `tests/engine-breaks-anchors.mjs`, `tests/room-resolve-all.mjs` when the room
changes, `tests/uat/play-e2e.mjs` when the Worker changes, `tools/local-ci.sh <head> 0`.

## 8. The readout

At every merge: Linear status and a proof comment; `docs/readout/feeds/claude-engine.json` (`updated`, `now`, items'
status and `remaining_hours`, `asks_of_rob`, `blocked_on`); `node tests/readout-feeds.mjs`; one paragraph in your
`docs/ACTIVE.md` section. Done means merged and released with evidence, never "the code exists." Your feed was
seeded from Linear on October 18 by the program session with first estimates; correct them.

## 9. Tools and habits for this lane

- The repository skills: `simulate-deck` (for ROB-116's calibration with Deck intelligence), `crankmagic-refresh`.
- `/code-review` and `/security-review` before marking a PR ready; the Linear and GitHub connectors for every record.
- Subagents for parallel reading of card text and rules; one orchestrating context that stays small (read `ACTIVE.md`'s
  top and your section, not the whole file; the handoffs are indexes, not reading).
- Prompt caching: keep the stable prefix stable (`AGENTS.md`, this file, the issue), put the volatile part last.
- Never Forge (ADR-001); the Comprehensive Rules fetched from Wizards, cited by number, never committed.
