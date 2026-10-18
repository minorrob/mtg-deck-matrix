# Codex · Workshop: the instruction set

*Platform: Codex Astra, session 2. Linear label `Codex · Workshop`. Feed `docs/readout/feeds/codex-workshop.json`.
Branches `codex/workshop-<topic>`. Projects: Library (P-ROB-3), Buying (P-ROB-6), Tailored to me (P-ROB-7), Share
(P-ROB-9), the screens of Deck creation (P-ROB-4) and Deck tuning (P-ROB-5), and the first-time journey and
instrumentation under Joyful (P-ROB-10). The charter is `docs/program/README.md`.*

## 1. What this lane is for

Every screen outside the Play boards, which is most of what Rob touches between games: Decks and the deck page, the
Deck Lab, the Library, Discover, Buy and orders, Settings, the account, sharing, the tour. Five of Rob's outcomes
land here (3, 6, 7, 9 and the screens of 4 and 5), and the first-time journey of outcome 10. The models under the
screens are Claude · Deck intelligence's: you render what a function returns and never compute it yourself.

## 2. Read first, in this order

1. `AGENTS.md`. 2. `docs/ACTIVE.md`, the top and the lanes table. 3. `docs/program/README.md`. 4. This file.
5. `docs/readout/README.md`. 6. `docs/INDEX-where-things-live.md`: the catalogs the product already owns (playmats,
   brackets, the status ladder, Primary Purpose, facets, the deck cap). Rob's rule: make no assumptions, scan and
   check, anchor every decision on referenced material.
7. `docs/crankmagic-architecture.md` (module ownership and the collection invariants), `docs/card-states.md`,
   `docs/design/README.md` and `docs/design/BRIEF.md` (what designers may and may never draw), the r3 intake
   `docs/design/2026-09-25-redesign-r3/INTAKE.md`.

## 3. Your files

The Workshop row of the charter's table (§3). You also own four Worker files Codex built: `cloud/library.mjs`,
`cloud/sharing.mjs`, `cloud/access-invites.mjs`, `cloud/mail.mjs`. Their routes are in `cloud/worker.mjs` (the
Engine's) and their migrations take numbers from the Engine in ROB-11 before a PR opens. `crankmagic-settings.js`
is yours; Play's card leaves it in Play's first PR.

## 4. The order of work

| Order | Issue | Why now |
| --- | --- | --- |
| 1 | ROB-36, ROB-37 (sharing acceptance, Share Library proven live), ROB-38, ROB-39 | Already in progress; finish before starting new |
| 2 | ROB-122 Preferences › Decks card | Deck intelligence's builder reads it (ROB-123) |
| 3 | ROB-125 the information complexity dial | Every later screen honors it; build it early |
| 4 | ROB-106 one search box | Outcome 3's most-felt gap |
| 5 | ROB-105 Add cards: the paste path now, the photo path when ROB-131 lands | Outcome 3 |
| 6 | ROB-107 plain-words status; ROB-44 Watch group; ROB-120 one order across decks | |
| 7 | ROB-110 the Lab's criteria screen (after ROB-109); ROB-113 the Tune tab (after ROB-114, ROB-115); ROB-118 the priority dial (after ROB-119) | As the functions land, with fixtures |
| 8 | ROB-133 one Share action; ROB-134 the public deck page; ROB-69 mail operations | Outcome 9 |
| 9 | ROB-126 aesthetics; ROB-127 preferences sync; ROB-108 fast at 10,000 lots | Outcome 7 and 3's finish |
| 10 | ROB-135 the first-time journey; ROB-64, ROB-65 PostHog; ROB-58 the tools record | Outcome 10 |

## 5. Seams

- **Deck intelligence** ships each function with fixtures first (`composition`, `synergies`, `buildFromCriteria`,
  `commanderLegality`, `buyPlan`, `resolveCard`, swap records). Your screen issue is blocked in Linear and in your
  feed until the function merges; build the screen against the fixture meanwhile if the signature is agreed on the
  issue.
- **The Engine** numbers migrations and routes Worker paths; ask in ROB-11 the day you know.
- **Play** owns the table step of the first-time journey (ROB-135) and reads the dial (ROB-125) for Table Vitals and
  Counter-Intel; agree the helper's name on the issue.
- **Grok** proves around you: budgets (ROB-136), test cases; write the task when you need one.

## 6. Decide, or surface

Decide: layout inside the r3 design and Rob's dated decisions, copy, performance, accessibility, fixes, the order
inside a milestone, extracting a module. Surface to Rob first: a new screen or route, a navigation change, removing
or hiding a feature, a changed default (the deck cap, the theme, card size), anything that changes what a status
word means, any new data stored about a person, Access or privacy changes, and the format field (ROB-140) when you
next touch the deck record.

## 7. Done, and proof

Done when: merged on a green run; the suites that drive your files green (`tests/settings-r3.mjs`,
`tests/deck-page-*.mjs`, `tests/sharing.mjs`, `tests/collection-*.mjs`, `tests/uat/journeys.mjs`, and a new suite per
new screen); a breaks file per change; both ends of every slider proven at 1400 and 390 wide; screenshots on the
issue; pins bumped and recorded; evidence on the issue. Proof before a push: those suites, `tests/feature-wiring.mjs`
(US English, `en-US` formatting, no size buttons), `tests/design-tokens.mjs` (the raw-hex ceiling only goes down),
`tests/asset-versions.mjs --update` after the cascade, `tools/local-ci.sh <head> 0`.

## 8. The readout

At every merge: Linear status and proof; `docs/readout/feeds/codex-workshop.json`; `node tests/readout-feeds.mjs`;
one paragraph in your `docs/ACTIVE.md` section. The feed was seeded on October 18 with first estimates; correct them.

## 9. Tools and habits for this lane

- `AGENTS.md` natively; `docs/INDEX-where-things-live.md` before any new concept; your review command before ready.
- Playwright 1.56 with Chromium for every browser claim; the first-time persona in `tests/uat/journeys.mjs` is the
  one that finds dead ends.
- The Linear connector for every status; draft PRs; one PR per screen slice, a day or less each.
