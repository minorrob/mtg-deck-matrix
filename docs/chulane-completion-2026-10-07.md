# Chulane completion, October 7, 2026

## Scope and source

`codex/chulane-completion` follows the cloud library work in PR #670. The unchanged
Train B head is `5d068d26`; the recovered desktop acceptance commit is `e6715329`.
This increment defines Guardian Project, Yavimaya Dryad and Claim Jumper from the
committed Oracle data. It does not substitute cards, promote provisional scripts,
read Forge implementations, or claim broader keyword families are implemented.

- Guardian Project compares the entering creature's current name, or its final
  battlefield name after leaving, with other creatures its controller controls
  and creature cards in that controller's graveyard. It rechecks on resolution.
  Tokens can be other battlefield creatures; tokens in a graveyard are not cards.
  Nameless creatures share no name. Pending and stacked triggers retain the
  departed subject's last known information independently of their source.
- Yavimaya Dryad can decline its Forest search, find a nonbasic Forest, fail to
  find, or give the card to any targeted player. The recipient controls the land
  as it enters, before entry replacements, counters and arrival triggers; its
  owner does not change. Forestwalk checks Forest lands controlled by the actual
  defending player, through type and control layers, including planeswalker attacks.
- Claim Jumper uses the existing per-opponent land comparison and search-memory
  primitives. The trigger's land comparison is intervening. Its second optional
  search independently reevaluates the comparison after the first decision and
  search. Declining the first does not decline the second. It shuffles once if
  either search happened, even when no card was found, and never if both were declined.

The compiled table has 1,656 confirmed definitions. The card checker also loads
28 provisional definitions, for 1,684 checked definitions in total. The committed
D2 main list now has zero unavailable cards. The seven-deck unavailable set is
51 distinct names (50 undefined plus provisional Tegwyll): D1 19, D2 0, D3 9,
D4 4, D5 0, D6 7, D7 12. Guardian Project also completes one D4 slot.

## Proof

Node 22.23.3; Playwright 1.56.0; system Chromium 151 via `UAT_CHROME`. The pinned
Chromium download remains blocked by the cloud egress proxy.

- All 241 local engine/regression suites passed: `tests/engine-*.mjs`,
  `tests/data-integrity.mjs` and `tests/feature-wiring.mjs`. This includes the
  1,000-game deterministic replay/hidden-information gate and the existing room
  performance budgets, without increasing any limit. Those general simulations
  are not a substitute for the real-deck game below.
- `tests/engine-chulane-completion.mjs`: 67 checks, including multiplayer,
  current/layered control and types, name changes, source/subject departures,
  graveyard token exclusion, independent choices and save/reload mid-resolution.
- The final card, condition, effect-condition and asset checks passed after the
  final graveyard-token guard. All 119 served asset hashes still match; no served
  client asset changed in this engine increment.
- `game/tools/batch/breaks-chulane-completion.py` contains 37 deliberate faults.
  Each was caught from a green baseline and restored. The new scenario and token
  edge were individually rerun with their corresponding new fault.
- Card validation and scenarios: `node --stack-size=4000 game/tools/batch/check-cards.mjs`.
  The final recorded count is 1,684 definitions and 2,756 scenarios, zero failures.

## A whole D2 game through two browsers

```
UAT_CHROME=/usr/bin/chromium REAL_DECKS_REQUIRED=1 REAL_DECK_ID=D2 \
  UAT_SHOTS=/tmp/crankmagic-d2-shots \
  node --stack-size=4000 tests/uat/real-deck-game.mjs
```

The harness keeps D5 as its default and now accepts D2 explicitly. It seats the
committed Chulane list at all four seats: two separate human browser contexts
and two house pilots. Human decisions use house suggestions applied through
browser controls. It uses the real GameTable/room/card definitions, with isolated
storage and in-process HTTP/WebSocket transport.

The D2 run passed 13 checks: **349 UI actions, 44 turns, natural win by seat 0,
zero refused AI answers over the entire match**. Lobby creation, invitation,
deck selection and readiness use the UI. Reload preserved both authoritative
revision and pending decision. Both browsers agreed on the final result, and all
354 frames per person hid other hands and libraries. Screenshots were saved at
`/tmp/crankmagic-d2-shots/d2-natural-end-seat0.png` and `seat1.png` (same prefix).

The run's periodic progress label still said D5; its selected decks, final
assertions and screenshots are D2. The label is now parameterized as well. No game
logic changed after this successful run.

## Remaining gates

This is cloud-local browser and engine evidence, not workerd or real-network
Access evidence. The exact October 4 backup remains on the offline desktop and
was not substituted with this committed September 30 library. Staging egress
returns CONNECT 403; Access service-token and Cloudflare token variables are
absent. No user data, credentials, Access policy or reserved dashboard setting
was changed; no merge, deployment or paid AI request occurred.

PR #670's first ready Actions run failed only the generated inventory reader
count. Its separate fix is `5174b836`, with rerun `37630443333` pending when this
record was written. D2 remains a separate draft follow-up until its review and
full CI gate. AI spending, actual staging access and release/rollback verification
remain open; this record does not declare the app production-ready.
