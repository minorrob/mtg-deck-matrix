# Draft execution plan for the October 14 playtest feedback

Prepared October 15, 2026. Status: ready for Rob’s review; implementation awaits his go-ahead. This plan follows the latest feedback and clarifications, superseding earlier UI decisions where they conflict. It changes no running game or deployment.

The intended experience is a readable mobile board, direct interaction with cards, fewer unnecessary confirmations, and a clear explanation of who must act and why. Preserve server authority, private hands, reconnect behavior, and replay compatibility throughout.

## Confirmed decisions

- Mobile needs a layout and interaction redesign: buttons, overlays, menus, and card inspection must work without obstructing play.
- Select a spell, highlight mana sources, tap the desired sources, then explicitly confirm the cast. Auto-pay is an optional shortcut.
- The zoom slider should have ample headroom. Comfortable card reading while retaining most cards should fall around the middle to upper-middle; the maximum should be intentionally oversized. There is no 800 by 800 pixel target.
- Provide a separate card-angle control in Camera, allowing battlefield cards to stand above the tabletop while retaining natural perspective. Keep board tilt separate.
- Show the actionable response prompt centrally, make card inspection available from stack entries, and allow inspection of public cards on every visible mat without switching seats.
- Animate a confirmed draw from library to hand, and label the pending draw action Draw card.
- Prefer direct blocker selection and assignment on the board, with a shared combat display, provided complete legal choices remain available.
- No HTML UAT guide is needed. Continue screenshots with object IDs and use game feedback and records.

## Findings from the current implementation

The deployed milestone comes from main da39a2ed, release bad37e87. Its multiplayer walkthrough passed 38 checks and its release walkthrough passed 22. The subsequent full regression run failed three suites: https://github.com/minorrob/mtg-deck-matrix/actions/runs/38663852137.

The accessibility walkthrough stopped waiting for the former .cm-full-rail element. Four intentional-break tests still refer to old tabletop code anchors. The generated data inventory is stale. These findings require repairing the checks and running them; they do not establish that the current board has no accessibility defects, and they do not diagnose the reported card behavior.

Automatic passing currently requires an empty stack: game/engine/rules/actions.mjs, nothingToDo/idle, explicitly rejects a nonempty stack. game/room/room.mjs also preserves end-turn confirmation, step-by-step preferences, and eligible mana undo. Extend the relevant policy deliberately rather than removing those protections globally.

The Draw a card action already exists in crankmagic-board.js. New tables omit drawBeat because an October 9 instruction requested automatic drawing; older matches retain their saved behavior. The latest request reverses that interaction for new games. Diagnose the reported phase-label timing as part of the change, and keep recorded games replayable under their original policy.

Combat projection already includes attackers, defending players, blockers, and stack targets. Reuse these IDs. The blocker decision already enumerates legal blocker/attacker pairs; a new board interface should submit the same validated decisions.

## Rules boundaries

Untap has no priority; upkeep and the period after the normal draw do. The normal draw does not use the stack. Spell timing still applies. Passing permits only the top stack object to resolve after everyone passes; browsing another card cannot resolve it out of order. Generic costs and specifically colorless costs are different. Blockers are eligible creatures, not response spells; combat assignments must satisfy restrictions and requirements. These boundaries follow the [current Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt), especially 107.4, 117, 502–504, 509, and 601.

## Execution stories

### P01 Recover the reported game and establish the baseline

Locate the game played roughly 12 hours before this feedback, identify Luke’s seat and deck, and preserve the full game record with its source version. No matching export was found in Downloads or the repository game-log intake, and this session has no authenticated staging service credentials. A table link or exported game record is needed to identify the exact incident; do not guess the card.

Replay the relevant sequence and compare the card definition, selected modes/targets, resolution journal, hand count, and each player’s visible state. Distinguish a missing effect, a skipped separate trigger, a legitimate choice/replacement, and a UI update that hid a completed draw. Add a minimal reproduction for the specific cause, then verify both reported effects and reconnect/replay.

Repair the three known regression failures without deleting coverage. This story also records phone model, browser, orientation, and viewport when those become available. Work on other stories need not wait for the exact card identity.

### P02 Design the mobile interaction layout first

Create reviewable portrait and landscape prototypes before broad implementation. Use one persistent primary-action area showing whose action is needed, the current phase, and a plain-language action. Collapse secondary tools and the phase list. Let one utility drawer open at a time on narrow screens, preserving access to the hand and the current decision.

Use compact response prompts for passing; reserve obstructive dialogs for choices that truly require them. Tapping a card inspects it unless the UI is explicitly in casting, payment, targeting, or blocking mode. Provide an explicit action affordance so inspecting a card cannot accidentally cast or tap it. Touch inspection must not depend on hover.

Keep touch targets comfortably sized, focus visible, labels readable, safe-area insets respected, and the on-screen keyboard from covering confirmation buttons. Avoid competing nested scrolling. Optional decorative video may pause on small devices or reduced motion without losing game information.

Acceptance: review screenshots at representative phone portrait/landscape sizes and desktop widths; every main action works by touch and keyboard. A real phone game validates touch behavior that desktop emulation cannot prove. Screenshot objects receive stable feedback IDs.

### P03 Improve scale, card angle, and battlefield navigation

Audit Full, Table, and Focus separately. Ensure zoom visibly enlarges cards rather than increasing a surface that is immediately fitted back into its old dimensions. Calibrate the comfortable range near the slider’s middle to upper-middle and retain an oversized maximum, with panning and a Reset/Fit control. Keep card sizing and table zoom clearly distinguished and persist settings per view/device.

Add Card angle independently of board tilt, from lying flat to upright. Prototype upright cards before choosing the default. Anchor their bases to the mat and preserve card proportions, natural perspective, tapped orientation, counters, hover previews, and accurate hit areas.

Add bounded vertical/horizontal battlefield scrolling when content overflows. Scope wheel, touch, and keyboard scrolling to the area being used; keep the hand and surrounding controls stationary. Avoid a full-page scrollbar caused by an oversized mat. Add an adjustable play-area width in Focus/Table views where space permits. Distinguish touch scrolling from long-press card rearrangement.

Acceptance: all slider endpoints work in all three views; crowded mats remain reachable; no accidental actions during pan/scroll; reset and reload behave predictably. Test wide and short desktop screens plus both phone orientations.

### P04 Make priority and stack resolution understandable

Extend server-side automatic passing for a player who has no meaningful legal response while a stack object is pending. Start conservatively: do not infer availability from the hand alone or simply from untapped lands. Account for activated abilities, other playable zones, alternative costs, and mana-source sequences; uncertain cases must preserve the decision. Keep Hold priority, stop preferences, and end-turn confirmation. Do not expose private reasons for another player’s automatic pass.

Show a compact central prompt only when this player must act, with Respond and Let resolve/Pass controls and the relevant card name. Distinguish a priority response from an actual choice during resolution. Make those controls available beside the current top stack entry, using one underlying action so duplicate clicks cannot advance twice. Lower entries are inspectable and show that they are waiting; they never receive an actionable out-of-order Resolve control.

Hover or keyboard focus reveals the full public card; touch offers a dedicated inspection action. Inspection works on all public visible mats, including rear seats. Required response prompts remain visible even when Actions is assigned to a drawer; the drawer may mirror the decision without creating a second independent prompt.

Acceptance: four humans, no-response seats, a responder with a mana ability, a response from another zone, a newly added stack item, stale/double clicks, hold-priority, disconnect/rejoin, and a decision encountered during resolution. The log records automatic passes without overwhelming the player.

### P05 Restore clear draw and phase interactions

For new games, explicitly represent the pending normal draw in the server decision. While it is pending, the primary button says Draw card and clicking the library performs the same action. Once acknowledged, perform exactly one draw, animate the confirmed movement, and update the button according to the new state. The display must not imply that drawing happens when leaving an already completed draw step.

Allow all actions the engine reports as legal during upkeep and after drawing, including suitable cards just drawn. Show why another card is unavailable instead of silently suggesting all actions wait until Main 1. Honor the rules boundary above and preserve optional step stops.

The drawing player sees the card flip into their hand after the server confirms it; opponents see only the allowed public animation/count. Skip decorative movement for reduced motion. Reconnects and repeated messages must not replay draws or disclose identities. Cover extra draws, skipped draws, and draw replacement choices.

Acceptance: new-match draw policy, old-record replay, first-player two-person rule, multiplayer first draw, double click, reconnect, and an instant played after drawing before Main 1.

### P06 Replace mana combination lists with direct payment

The primary sequence is select spell, choose modes/targets and any necessary X value, highlight eligible mana sources, tap/select sources, display remaining cost, then Confirm cast. The spell remains visibly pending until the server accepts the completed cast. Display source choices and leftover mana without enumerating every equivalent color combination in a long menu.

Separate a reversible payment preview from committed game actions. Basic source selection may remain a draft until confirmation. If activating a source has choices or side effects, process it through the engine; Cancel must not promise to undo an already committed sacrifice, information reveal, or trigger. Revalidate the cost and targets at confirmation and handle stale revisions explicitly.

Auto-pay proposes a legal payment for review. Use existing pool mana where appropriate; reserve required colors; prefer basic lands for colored requirements, then other lands; prefer suitable colorless production for generic portions while avoiding unnecessary colored spending and overproduction. This is a preference order, not a guarantee that the least number of tapped sources is strategically best. Show exceptions rather than spending life or sacrificing valuable resources silently. An artifact is not assumed to produce colorless mana.

Acceptance: multicolor and filtering lands, mana rocks, restricted mana, variable costs, commander tax, cost increases/reductions, hybrid/alternative payments, excess mana, activated-source side effects, cancel, reconnect, and no double cast. Keep a compact advanced payment fallback until parity is proven.

### P07 Introduce the shared combat display and direct blocking

First display the existing authoritative combat state without replacing input: attacker thumbnails on the left under the header, arrows and the attacked player/permanent, then assigned blockers on the right. Group separate defenders clearly in multiplayer. Use an awaiting-blocks marker only for the unknown blocker assignment; the attacked player is already known. Collapse long combat groups into a scrollable strip on phones.

Then add direct assignment: highlight eligible defending creatures, select one, select the attacker thumbnail it will block, and show a draft connection. Allow reassignment/clear, multiple blockers where legal, and Confirm blocks. Other players receive confirmed assignments; they do not watch another player’s unfinished draft. Preserve selected cards by stable ID and invalidate stale assignments safely.

Offer No blocks as the clear option corresponding to the request to take damage, subject to server validation. Do not immediately subtract life. Keep spell responses in their proper windows rather than treating spells as blockers. Show illegal-assignment reasons close to the selection.

Test the design against multiple attackers and defending players, flying/reach, menace, required blocks, creatures with expanded blocking permissions, attacked planeswalkers/battles, creature removal, first/double strike, trample, damage prevention, and damage allocation. Damage allocation remains a separate explicit decision where required; a preview must not promise an outcome before responses finish.

Retain an accessible list-based assignment fallback until the visual interface can express every supported legal assignment. If the visual prototype obscures complex combat, ship the shared display first and retain the existing assignment dialog while revising direct selection.

### P08 Validate a complete game and release the approved increment

Use deterministic scenarios for each rules change, browser tests for each interaction, and a fresh multiplayer game with an empty-library invitee. Exercise simultaneous messages, response chains, phone scrolling, payment cancellation, multi-block combat, and reconnection. Make the known accessibility and stale-test failures actionable again before claiming a green baseline.

Present screenshots with IDs after each visible milestone. Record proven behavior separately from unresolved feedback. Release small completed increments to staging after approval; do not interpret the prior one-time instruction to publish despite a particular regression run as a permanent exemption for future work.

## Sequence and ownership

P01 baseline investigation and P02 mobile design come first. The server changes for P04/P05 and the specific card defect should land before their dependent UI. P03 geometry can then use the approved mobile layout. P06 precedes the final P07 interaction design so the board has consistent selection and confirmation behavior. P07 first ships its display, then direct assignment after parity checks. P08 validates each completed increment and the combined game.

UI work belongs to the existing UI lane. Rules, room persistence, projections, and card definitions belong to the engine lane; assign exclusive ownership before implementation so the sessions do not edit the same files. Existing public view contracts should be extended only when needed. No framework or rendering-engine replacement is justified yet; test the current hybrid renderer against the mobile and upright-card prototypes first.

## Additional improvements to include

- A consistent indication of who is being waited on and what kind of decision is pending.
- A readable remaining-mana display and an explicit reason when a card cannot be played now.
- One consistent distinction between inspecting, selecting, and committing an action across hand, battlefield, stack, and combat.
- Stable camera/scroll positions through ordinary state updates; intentionally center only actions that need attention.
- A Report game issue action that attaches the match, revision, source version, and relevant public history, with player notes. Keep full records and private hand data out of public reports unless explicitly provided for debugging.

## Information still needed

A table link or exported record is needed to identify Luke’s card and the missed draw. Specific phone/browser details will refine device acceptance, but do not block the draft mobile design. The garbled phrase about the cast animation and player name is not treated as a firm specification: prototype a restrained, player-labeled cast movement and review it before choosing exact motion or placement.
