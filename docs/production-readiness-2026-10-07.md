# Production readiness, October 7, 2026

Rob's finish line is a production app he can use and trust. Train B is the first continuation,
not the finish line. This record supplements `handoff-2026-10-06.md` and Part 7 of
`plan-to-done-2026-09-30.md`; it does not declare any gate passed.

## Delivery order

1. Finish the saved B4, B6 and B3 patches, regression suites and deliberate-fault proof on
   PR #669. Run the engine, game and room suites, the repository integrity checks and the
   pre-push scan. Push, mark the PR ready and diagnose Actions on that exact head.
2. Prove the library and deck paths with isolated data: import, create, edit, delete, move,
   change commanders, and restore. Quantities must reconcile; ownership, reservation and
   physical location remain distinct. No silent loss or duplication. Fix confusing core
   flows before extending cosmetic scope.
3. Prove a complete game with two human identities in separate browser contexts, including
   interrupted decisions, reload, reconnect and replay. Inspect every player's frames for
   hidden information. Then prove AI seats through the same authoritative room. Finish the
   seven decks' remaining definitions and the planned seeded games; vanilla stand-ins do
   not prove real card behavior.
4. Deliver useful, bounded AI assistance. Reuse the existing OpenAI integration where it
   fits, keep the model configurable, and evaluate actual card/strategy quality. Deck
   summaries may be deferred and cached by deck, rules, prompt and model versions. In-game
   hints and post-game critiques need compact evidence and responsive requests. Suggestions
   never mutate the authoritative state; reject stale replies and illegal recommendations.
5. Validate the staged release, record the release commit and deployed version, retain the
   previous release and rollback procedure, and prove the core journeys after release.
   Production delivery remains behind unresolved backup, access and security gates.

## Evidence collected so far

- Repository: `https://github.com/minorrob/mtg-deck-matrix`; PR:
  `https://github.com/minorrob/mtg-deck-matrix/pull/669`.
- Fresh fetch found `origin/main` at `2ad84eb0` and PR #669 draft at `d8774b32`.
  Actions suites were skipped; both Workers Builds checks failed. The dashboard cause is
  reported by the prior handoff, not independently verified here.
- Combined B4/B6/B3 card baseline: 1,681 definitions including 28 provisional definitions,
  2,747 scenarios, zero failures. The seven decks have 423 of 477 cards hand-defined;
  provisional definitions are not seated as confirmed cards.
- Node 22 collection-model: 708 checks; collection-exchange: 34; lobby-draft: 18;
  deck-import: 17; library-references: 27; user-state: 19. These are model-level evidence,
  not a substitute for the real browser journeys.
- The first local deck-holds-cards browser run skipped because pinned Chromium was absent.
  After installing Playwright's pinned Chromium in the local workbench, the required browser
  run passed 11 checks, including owned cards held by a draft deck.
- Existing cloud AI code (`cloud/ai.mjs`) is gated and uses Anthropic. Existing OpenAI
  Responses integration (`game/tools/api-choice-provider.mjs`) belongs to the local host.
  No live provider call or credential configuration was performed in this continuation.
- The exact October 4 live-game backup was found in the MtG project's AI Input folder.
  The app's `readBackup` validated its checksum, version and model, read-only. It contains
  four original 100-card decks and three explicitly named table alternatives. A2's file
  availability is resolved. The 50 two-human-protocol and 30 all-house exact-deck runs
  passed with zero whole-match refusals. The human-protocol games made 14,115 decisions,
  took 35-65 turns and had a maximum local response wait of 4,198 ms.
- Required Chromium browser checks passed: draft deck ownership 11, Library 137, Decks hub
  24 and deck page 41. These do not establish live Access or complete gameplay.
- PR #669's exact head `5d068d26` passed Actions run `37576879773`: 396 suites and
  262 companion tests. Both Workers Builds preview checks remain failed; no merge or deploy.
- `tests/uat/real-deck-game.mjs` uses real D5 Shadrix definitions at four seats, two separate
  browser sessions and two house pilots. It passed 377 UI actions to a natural win on turn 33,
  zero AI refusals, reload preserving the pending question and 381 protected frames per person.
  Its local GameTable transport does not establish workerd, Access or real-network latency.
- Live verification is blocked here: staging service-token variables are absent and the
  browser tool twice failed to load its request-header policy before interacting with a site.

## Remaining confirmed-card coverage

The committed seven-deck library has 54 distinct unavailable confirmed cards, appearing
55 times across the decks because Guardian Project occurs twice. Tegwyll is provisional;
the other 53 lack a playable definition. No substitutes are implied by this inventory.

| Deck | Gaps | Priority consequence |
| --- | ---: | --- |
| D1 Quintorius Spirits | 19 | Commander Quintorius, Loremaster is missing |
| D2 Chulane Value Loop | 3 | Claim Jumper, Guardian Project, Yavimaya Dryad; next compact completion increment |
| D3 Atraxa Proliferate | 9 | Includes extra turns, moving counters and keyword work |
| D4 Felothar Walls | 5 | Includes mana costs, flanking, total-power choices and umbra armor |
| D5 Shadrix Aristocrats | 0 | First real-card deck for complete-game acceptance |
| D6 Krenko Goblins | 7 | Includes additional costs, mentor, overload and attack-relative counts |
| D7 Maralen Exile Cast | 12 | Commander Maralen is missing; Tegwyll is provisional, not this deck's commander |

## Decisions and access still needed

- A2: file located and validated. Run the exact-deck acceptance against isolated storage;
  preserve the current library before any separately authorized real-data restore.
- A3: Rob controls the friend/agent staging Access policy. Test identities in a local harness
  do not prove that a real friend can sign in.
- A4: token expiry and Workers Builds read access remain Rob's decisions. Do not create a
  credential or expand access to work around them.
- D8: preview-build configuration remains Rob's action. Keep its red checks separate from
  the engine and Actions results.
- D11: persistent Claude Code settings remain Rob's action. This is not a game-code blocker
  and does not need changing for the already-authorized work in this session.
- AI: obtain concrete per-person and total daily spending caps before new paid usage.
  Use server-side secrets, bounded requests/retries, deduplication and spend reservations.
  Verify provider availability, pricing and quality before choosing a production model.
  Privacy wording and the existing AI access gates also need resolution before enabling it.
- Rewriting old email-bearing commits and deleting `claude/x10-velocity` remain Rob's calls.

The next expansion to 60-card formats must use explicit format rules for deck size, copies,
legality, life totals and match setup. Commander acceptance does not establish those rules.
