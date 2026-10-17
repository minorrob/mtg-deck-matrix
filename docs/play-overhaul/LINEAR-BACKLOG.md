# Linear delivery backlog

Updated October 17, 2026. [Delivery plan and acceptance map](https://linear.app/robs-build/issue/ROB-14/crankmagic-delivery-plan-complete-feature-backlog-and-acceptance-map) contains 55 child issues, verified by a Linear readback. Existing delivery and engine issues ROB-10 through ROB-13 remain linked without replacing Claude Code's status or ownership.

This index covers P01-P14, P15.1-P15.5, all R01-R37, and subsequent user requests. P15.6's integrated milestones and the cross-story rules, accessibility, performance and UX safeguards are preserved in ROB-14. Latest user decisions override historical source prose: six current staging decks; Resend sender; fixed Focused mobile; desktop view switching inside Camera; approved Babylon prototype; no HTML UAT document.

## Ownership and status

Codex owns UI and user management. Claude Code/Fable owns engine, simulation and card loads. Shared non-Play features require coordination through ROB-11 before overlapping files or contracts change. Review roles in issues are perspectives recorded by Codex, not claims of separate human review. Local implementation awaiting acceptance remains In Progress; no feature was marked Done merely because it has code.

## Feature map

| Issue | Feature | Plan | Requirements | Import status |
| --- | --- | --- | --- | --- |
| [ROB-15](https://linear.app/robs-build/issue/ROB-15/repair-board-accessibility-coverage-for-the-current-tabletop-ui) | Repair board accessibility coverage for the current tabletop UI | P01, P08 | R20, R35 | In Progress |
| [ROB-16](https://linear.app/robs-build/issue/ROB-16/restore-four-board-mutation-test-anchors-and-prove-each-catches-its) | Restore four board mutation-test anchors and prove each catches its regression | P01, P08 | — | Backlog |
| [ROB-17](https://linear.app/robs-build/issue/ROB-17/recover-the-playtest-record-and-reproduce-lukes-missed-second-card) | Recover the playtest record and reproduce Luke’s missed second card effect | P01, P12 | — | Backlog |
| [ROB-18](https://linear.app/robs-build/issue/ROB-18/deliver-one-fixed-focused-mobile-game-view-and-unobstructed-touch) | Deliver one fixed Focused mobile game view and unobstructed touch controls | P02 | R03, R04, R20 | In Progress |
| [ROB-19](https://linear.app/robs-build/issue/ROB-19/unify-desktop-headers-profile-menus-and-configurable-drawers-across) | Unify desktop headers, profile menus and configurable drawers across all three views | P02 | R30, R31 | In Progress |
| [ROB-20](https://linear.app/robs-build/issue/ROB-20/calibrate-zoom-and-card-size-sliders-with-fit-reset-and-per-view) | Calibrate zoom and card-size sliders with fit, reset and per-view persistence | P03 | R05 | In Progress |
| [ROB-21](https://linear.app/robs-build/issue/ROB-21/add-independent-physical-card-angle-while-preserving-board-perspective) | Add independent physical card angle while preserving board perspective | P03 | — | Backlog |
| [ROB-22](https://linear.app/robs-build/issue/ROB-22/make-crowded-battlefields-scrollable-and-adjustable-without-moving-the) | Make crowded battlefields scrollable and adjustable without moving the hand | P03 | R28 | Backlog |
| [ROB-23](https://linear.app/robs-build/issue/ROB-23/show-one-clear-priority-prompt-and-inspectable-stack-with-ordered) | Show one clear priority prompt and inspectable stack with ordered resolution | P04 | R14, R32 | Backlog |
| [ROB-24](https://linear.app/robs-build/issue/ROB-24/implement-explicit-draw-card-acknowledgment-legal-phase-actions-and) | Implement explicit Draw card acknowledgment, legal phase actions and private draw motion | P05 | — | Backlog |
| [ROB-25](https://linear.app/robs-build/issue/ROB-25/replace-mana-combination-menus-with-source-selection-remaining-cost) | Replace mana-combination menus with source selection, remaining cost and Confirm cast | P06 | R34 | Backlog |
| [ROB-26](https://linear.app/robs-build/issue/ROB-26/show-shared-combat-assignments-and-add-direct-blocker-selection-with-a) | Show shared combat assignments and add direct blocker selection with a fallback | P07 | R15, R33 | Backlog |
| [ROB-27](https://linear.app/robs-build/issue/ROB-27/validate-complete-multiplayer-journeys-accessibility-and-staged) | Validate complete multiplayer journeys, accessibility and staged releases | P08 | R01, R16, R18, R20, R35, R36, R37 | In Progress |
| [ROB-28](https://linear.app/robs-build/issue/ROB-28/add-acknowledged-yield-turn-and-stop-yielding-controls-for-opponents) | Add acknowledged Yield turn and Stop yielding controls for opponents’ turns | P09 | — | Backlog |
| [ROB-29](https://linear.app/robs-build/issue/ROB-29/highlight-castable-commanders-and-display-a-small-per-commander-tax) | Highlight castable commanders and display a small per-commander tax badge | P10 | — | Backlog |
| [ROB-30](https://linear.app/robs-build/issue/ROB-30/prove-all-six-current-staging-decks-are-selectable-and-playable-by) | Prove all six current staging decks are selectable and playable by invitees | P11 | — | In Progress |
| [ROB-31](https://linear.app/robs-build/issue/ROB-31/add-protected-game-logs-to-the-website-and-play-account-menus) | Add protected Game Logs to the website and Play account menus | P12 | — | Backlog |
| [ROB-32](https://linear.app/robs-build/issue/ROB-32/replace-the-old-play-entry-with-resume-new-table-invitation-and-recent) | Replace the old Play entry with Resume, New table, invitation and recent games | P13 | R24 | Backlog |
| [ROB-33](https://linear.app/robs-build/issue/ROB-33/redesign-table-seats-with-humanai-types-and-easy-normal-or-claude) | Redesign table seats with Human/AI types and Easy, Normal or Claude options | P13 | R22 | Backlog |
| [ROB-34](https://linear.app/robs-build/issue/ROB-34/deliver-reserved-seat-invitations-through-resend-with-revoke-and-safe) | Deliver reserved-seat invitations through Resend with revoke and safe redemption | P13 | — | Backlog |
| [ROB-35](https://linear.app/robs-build/issue/ROB-35/start-ready-tables-with-a-cancelable-ten-second-countdown) | Start ready tables with a cancelable ten-second countdown | P13 | R07 | Backlog |
| [ROB-36](https://linear.app/robs-build/issue/ROB-36/finish-deck-sharing-ui-permissions-public-catalog-and-email-deck) | Finish deck-sharing UI, permissions, public catalog and Email Deck acceptance | P14 | — | In Progress |
| [ROB-37](https://linear.app/robs-build/issue/ROB-37/finish-scoped-share-library-and-reviewercollaborator-acceptance) | Finish scoped Share Library and Reviewer/Collaborator acceptance | P14 | — | In Progress |
| [ROB-38](https://linear.app/robs-build/issue/ROB-38/complete-account-profile-editing-and-compact-responsive-settings) | Complete account profile editing and compact responsive Settings layout | P14 | R19 | In Progress |
| [ROB-39](https://linear.app/robs-build/issue/ROB-39/verify-account-email-changes-without-losing-library-grants-or-game) | Verify account email changes without losing library, grants or game identity | P14 | — | In Progress |
| [ROB-40](https://linear.app/robs-build/issue/ROB-40/diagnose-google-sign-in-rejection-while-preserving-working-email-code) | Diagnose Google sign-in rejection while preserving working email-code login | Later feedback | — | Backlog |
| [ROB-41](https://linear.app/robs-build/issue/ROB-41/remove-duplicated-google-provider-text-on-the-hosted-access-login-page) | Remove duplicated Google provider text on the hosted Access login page | Later feedback | — | Backlog |
| [ROB-42](https://linear.app/robs-build/issue/ROB-42/make-deck-loading-atomic-resumable-and-visibly-accurate) | Make deck loading atomic, resumable and visibly accurate | P11 | R08, R23 | Backlog |
| [ROB-43](https://linear.app/robs-build/issue/ROB-43/warm-card-art-and-lazy-oracle-details-with-bounded-caching-and) | Warm card art and lazy Oracle details with bounded caching and readable fallbacks | Later feedback | R09, R21 | Backlog |
| [ROB-44](https://linear.app/robs-build/issue/ROB-44/add-duplicate-safe-watch-group-card-capture-without-changing-owned) | Add duplicate-safe Watch-group card capture without changing owned inventory | Later feedback | R10 | Backlog |
| [ROB-45](https://linear.app/robs-build/issue/ROB-45/integrate-deterministic-match-music-pools-and-validate-audio-pack-loop) | Integrate deterministic match music pools and validate audio-pack loop offsets | Later feedback | R11 | Backlog |
| [ROB-46](https://linear.app/robs-build/issue/ROB-46/implement-combat-music-transitions-and-explicit-pauseresume-semantics) | Implement combat music transitions and explicit pause/resume semantics | Later feedback | R12 | Backlog |
| [ROB-47](https://linear.app/robs-build/issue/ROB-47/add-opponent-instantflash-response-layers-with-combat-ducking) | Add opponent instant/flash response layers with combat ducking | Later feedback | R13 | Backlog |
| [ROB-48](https://linear.app/robs-build/issue/ROB-48/build-factual-counter-intel-with-public-contributors-and-drill-down) | Build factual Counter-Intel with public contributors and drill-down | Later feedback | R17, R34 | Backlog |
| [ROB-49](https://linear.app/robs-build/issue/ROB-49/complete-resources-and-table-vitals-using-authoritative-public-facts) | Complete Resources and Table Vitals using authoritative public facts | Later feedback | R31, R33, R34 | Backlog |
| [ROB-50](https://linear.app/robs-build/issue/ROB-50/add-duplicate-safe-presentation-events-and-acting-seatunseen-card-cues) | Add duplicate-safe presentation events and acting-seat/unseen-card cues | Later feedback | R25, R29 | Backlog |
| [ROB-51](https://linear.app/robs-build/issue/ROB-51/synchronize-host-selected-background-and-table-skins-independently) | Synchronize host-selected Background and Table skins independently | Later feedback | R06, R26 | Backlog |
| [ROB-52](https://linear.app/robs-build/issue/ROB-52/integrate-the-babylon-card-interaction-prototype-with-live) | Integrate the Babylon card-interaction prototype with live authoritative game state | P03, P15.2 | R02, R27, R28 | In Progress |
| [ROB-53](https://linear.app/robs-build/issue/ROB-53/display-authoritative-round-and-turn-labels-across-extra-and-skipped) | Display authoritative Round and Turn labels across extra and skipped turns | Later feedback | — | Backlog |
| [ROB-54](https://linear.app/robs-build/issue/ROB-54/implement-authenticated-table-chat-with-ordered-history-and-reconnect) | Implement authenticated table chat with ordered history and reconnect | Later feedback | R18, R31 | Backlog |
| [ROB-55](https://linear.app/robs-build/issue/ROB-55/evaluate-and-later-add-opt-in-in-game-voice-chat) | Evaluate and later add opt-in in-game voice chat | Later feedback | — | Backlog |
| [ROB-56](https://linear.app/robs-build/issue/ROB-56/finish-ai-coach-and-recommended-actions-as-one-coherent-drawer) | Finish AI Coach and Recommended Actions as one coherent drawer experience | Later feedback | R18, R31 | Backlog |
| [ROB-57](https://linear.app/robs-build/issue/ROB-57/project-permitted-player-avatars-to-other-seats-with-a-safe-fallback) | Project permitted player avatars to other seats with a safe fallback | Later feedback | R19 | Backlog |
| [ROB-58](https://linear.app/robs-build/issue/ROB-58/operationalize-paid-tool-connections-ownership-quotas-and-renewal) | Operationalize paid tool connections, ownership, quotas and renewal tracking | P15.1 | — | In Progress |
| [ROB-59](https://linear.app/robs-build/issue/ROB-59/produce-approved-silent-volcano-and-forest-environment-loops-through) | Produce approved silent Volcano and Forest environment loops through Runway/Higgsfield | P15.2 | R26 | Backlog |
| [ROB-60](https://linear.app/robs-build/issue/ROB-60/build-a-convincing-3d-table-and-physically-based-materiallighting-set) | Build a convincing 3D table and physically based material/lighting set | P15.2 | R26, R28 | Backlog |
| [ROB-61](https://linear.app/robs-build/issue/ROB-61/curate-mobbin-references-for-mobile-play-drawers-and-sharing) | Curate Mobbin references for mobile play, drawers and sharing | P15.3 | — | Backlog |
| [ROB-62](https://linear.app/robs-build/issue/ROB-62/prototype-and-integrate-approved-mobiledesktop-hud-flows-in-magic) | Prototype and integrate approved mobile/desktop HUD flows in Magic Patterns | P15.3 | R35 | Backlog |
| [ROB-63](https://linear.app/robs-build/issue/ROB-63/add-report-game-issue-and-prove-a-private-sanitized-jam-to-fix) | Add Report game issue and prove a private, sanitized Jam-to-fix workflow | P12, P15.4 | — | Backlog |
| [ROB-64](https://linear.app/robs-build/issue/ROB-64/instrument-explicit-posthog-usability-and-renderer-events-on-staging) | Instrument explicit PostHog usability and renderer events on staging | P15.5 | — | Backlog |
| [ROB-65](https://linear.app/robs-build/issue/ROB-65/create-posthog-gameplay-funnels-latency-and-renderer-health-dashboards) | Create PostHog gameplay funnels, latency and renderer-health dashboards | P15.5 | — | Backlog |
| [ROB-66](https://linear.app/robs-build/issue/ROB-66/roll-out-renderermobile-presentation-flags-with-stable-per-match) | Roll out renderer/mobile presentation flags with stable per-match fallback | P15.5 | — | Backlog |
| [ROB-67](https://linear.app/robs-build/issue/ROB-67/benchmark-crowded-board-performance-across-browser-network-room-and-ai) | Benchmark crowded-board performance across browser, network, room and AI | P08 | — | Backlog |
| [ROB-68](https://linear.app/robs-build/issue/ROB-68/evaluate-supabase-auth-and-normalized-deckprofile-storage-before) | Evaluate Supabase Auth and normalized deck/profile storage before migration | Later feedback | — | Backlog |
| [ROB-69](https://linear.app/robs-build/issue/ROB-69/add-deliverybounce-observability-and-operational-recovery-for) | Add delivery/bounce observability and operational recovery for transactional mail | Later feedback | — | Backlog |

## Current release evidence

Focused PR #736 merged as `2d5772259fa3936543792c1e7ef20d396ee15c6f`. Staging release `45d35eefdc16d0af7160ca756d610b1ac32e3cfb` serves that source; authenticated version readback confirmed it. Production remains `c9ad0e65264582a786d02710e0b76774d064a792`. User authorized a one-time exception for the two existing CI failures; ROB-15 and ROB-16 track repairs. The generated release advances the compatibility date by one day; other app payload differences from the accepted candidate are release metadata.

The first live invitation failed Cloudflare Access admission and withheld email. ROB-10 remains In Progress. Recipient sign-in, live sharing and playable-deck end-to-end acceptance are not yet proven. The user is checking scoped token settings. Private test addresses, authentication storage and detailed test outputs remain in ignored work files.

## Verification

Linear parent readback returned 55 children and no further page. Source mapping covers each R01-R37 and P01-P14 plus P15 subsections. ROB-23/ROB-28 depend on engine ROB-13; ROB-25/ROB-29 depend on ROB-12; dashboards/flags depend on explicit analytics. Dependencies do not authorize Codex to implement engine-owned changes.

No application behavior changed in this documentation checkpoint. Backlog import data and audit scripts are retained locally under ignored work/.

