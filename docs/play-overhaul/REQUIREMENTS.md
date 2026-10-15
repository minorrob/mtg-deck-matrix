# Play requirements and acceptance checklist

Updated October 14, 2026. Execution branch: `codex/ui-play-tabletop-preview`.

Rob's current instructions override the compiled brief; the later feedback captured in INSTRUCTIONS.md overrides the older Replit prototype. The wireframes govern layout; the reference videos govern atmosphere and motion. RECONCILIATION.md is architectural evidence, including its corrections. Replit supplies reusable examples and recorded fixtures, not a replacement app or a new design authority.

## Current user decisions

- Drawer footers have no Add module or Restore default layout controls. Configure placement through Settings > Set Side Drawer Modules; retain in-module drag and keyboard ordering.
- Rob authorized all seven saved decks (D1-D7) for every signed-in human, so playtesters can choose a shared deck without importing a library. Ship only deck names, commanders, main-deck lists and brackets; never the collection, account data or owner source IDs. Validate against the current server before enabling selection. This is a snapshot of the committed decks, not automatic account-library sharing.

- On the Stack is one overlapping card pile beside a 25% wrapping list of numbered names and players. Clicking a name animates that card to the front; clicking the pile cycles and wraps. Browsing never changes resolution order (#1 resolves next). The front card matches Card Preview size. Reduced motion skips the shuffle animation.

- Profile avatar/menu at top right beside Skip to end; Settings removed from the left rail. Settings includes Set Side Drawer Modules, with Left / Right / None radio columns. Reorder by drag handle or keyboard buttons within each drawer; placement and order follow the profile through library sync. Cancel preserves the prior layout.
- Available modules: Screen View (one Full / Table / Focus popout), History, AI Coach, Counter-Intel, Resources, On the Stack, Card Preview, Table Vitals, Recommended Actions, Chat, and Actions. Recommended Actions shares the existing AI Coach conversation. Assigned Actions replaces floating decision popups in Full screen; other views retain their controls. Chat remains explicitly unavailable pending a shared service; voice is a later feature.
- Both drawers reach the screen bottom through the hand region. Handles stay attached to exposed edges in either state. Camera follows the right drawer whether expanded or collapsed.
- Borderless rows: creatures, artifacts/enchantments, then lands. Zone piles form a two-by-two block on the right. Rear-seat labels sit below mats, commander inline, without health; opponent health sits upper left in a black container at 80% transparency (20% opacity), with fully opaque text.
- Table Zoom is 60–120%, with 100% matching the former 110% scale. Small sizes may be unreadable; large sizes may clip table edges, as explicitly requested. Card size is separate: 100% matches the former 130%, and 150% is 40% larger than the new 100%. Hand bottoms slightly clip the screen edge and card tops overlap the table front.
- Tabletop card size has a separate camera slider; slider spacing is halved. Tilt uses a fixed camera scale with natural depth perspective; zero degrees is flat.
- The supplied October 14, 8:52 PM lava video is the Volcano background. Its audio stream is removed; the 8-second video loops behind the table, with a still poster for reduced motion and loading. Table material remains a separate setting. Other environments and the table still need final artwork.
- Battlefield cards can be dragged to reorder within their existing creature, artifact/enchantment, or land section. Alt+Left/Right provides keyboard ordering. Positions snap into existing card slots and persist for this player, match, seat and device; no gameplay action or zone change is sent.
- Pending round contract: Round x, Turn y must handle extra turns and eliminated seats using authoritative progression, not global turn divided by initial seat count.

- Full screen always uses the 3D tabletop. Remove both the 3D toggle and the opt-in preview toggle. Zero tilt provides the flat view.
- Tilt is an angle from 0 to 60 degrees, default 40 degrees. Cards and mats share the same physical camera perspective, without separate card deformation; the hand stays upright.
- T11 is a container-free fan, seven cards at most. Larger hands have previous/next arrows, wrapping indefinitely in either direction. Each viewed seat keeps its own carousel position; opponent faces stay private.
- Match the reference video's floating table with rounded edges, thickness and a distinct surrounding environment. Background and Table are independent appearance choices (for example Volcano and Wooden). Background-only videos will be supplied by Rob. Volcano now uses the supplied video; the other procedural environments remain placeholders.
- Prepare host-selected shared appearance as a table setting; current local appearance controls are explicitly labeled as this-device previews, not synchronized host controls.

- When viewing another seat, show that player's hand count and card backs. Return to your own seat to see your cards. Never reveal another player's private faces. This supersedes the initial execution plan's own-hand proposal.
- Send screenshots after meaningful UI updates, with stable visible object IDs for feedback.
- Notify Rob before building the configurable side-pane modules.
- Latest instruction: no HTML UAT guide is needed; Rob will transcribe the playtest game for feedback.
- Integrate the completed, verified work into staging. The staging release branch must be updated through the repository's release builder if it is generated; production is a separate release.

## Status legend

Preview means implemented in the desktop tabletop surface, with acceptance still being recorded. Pending means this preview does not claim the feature is complete. Inherited means existing behavior is preserved and requires regression checks.

| ID | Requirement and source | Status | Acceptance |
| --- | --- | --- | --- |
| R01 | Cloud path only; existing room authority (brief 0, 1) | Inherited | Real GameTable actions still use the existing answer envelope; no browser rules fork. |
| R02 | Hybrid Pixi ground and DOM card buttons (D1) | Preview | Vendored pinned library and license; CSP unchanged; buttons retain accessible names and options. |
| R03 | Full screen always uses the 3D tabletop (latest user correction) | Preview | No 3D toggle; 0 degrees is flat; phone retains its responsive board; graphics failure leaves readable controls. |
| R04 | Top strip, container-free hand fan, back row of three seats, front mat 70–75% depth (D3 plus latest correction) | Preview | Geometry measured at 1400, 1280 and 1024 widths and short heights. |
| R05 | Tilt 0–60 degrees, default 40, and zoom sliders (latest correction) | Preview | Live updates; save on release; Zoom 60–120%, with new 100% equal to previous 110%; high zoom may clip table edges. Mats and cards share one perspective; hand stays upright. Camera reset/reload remains to be accepted. |
| R06 | Independent host-selected Background and Table, synchronized in game (latest correction) | Pending | Local previews use a registry and independent selectors now. Pending: host-only route, validation, persisted appearance field and reconnect carrying both choices to every seat. |
| R07 | Last human ready starts 10-second countdown, host cancel, no Start (D6) | Pending | Alarm scheduled once; unready cancels; missing seats refused; cancel cannot instantly restart itself. |
| R08 | Atomic deck loading, visible real progress, cancel/resume (D7) | Pending | No partial POST; content/version-keyed progress; existing valid deck survives canceled replacement. |
| R09 | Warm existing card cache, preserve build-time engine definitions (D8) | Pending | Cache reuse proven; unavailable art has fallback; unsupported cards remain actionable errors. |
| R10 | Watch group and duplicate-safe Add Card (D9) | Pending | Quantity one, one group, no owned inventory mutation, unknown identity refused, Undo works. |
| R11 | Deterministic game music pool and measured loop offsets (D10) | Pending | Same match selects same member; source starts at loopStart; audible seams reviewed. |
| R12 | Combat music and distinct ramp durations (D11) | Pending | Resolve pause/resume contradiction before implementation; turn changes do not restart the track. |
| R13 | Opponent instant/flash layer, including responses; combat ducking (D12) | Pending | No duplicate sources; stack-empty restores bed; mute/slider/reconnect work. |
| R14 | Opponent reveal shelf, readable while on stack, destination motion (D13) | Pending | Overflow stays discoverable; public identity only; front-mat effects not duplicated. |
| R15 | Target and combat arrows from real IDs (D14) | Pending | Correct seat/card/planeswalker endpoints; removal and combat end clean up. Targets already exist in projection. |
| R16 | Existing C.notice confirmations; inline refusals where useful (D15) | Inherited | No replacement ticker; accessible message and correct Undo timing. |
| R17 | Counterintelligence facts and contributor drill-down (D16, section 6) | Pending | Counts reconcile to public cards; exact facts distinguished from text matches; no hidden inference. |
| R18 | No fake chat, spectator, Coach, open games, or Standing features (D17) | Inherited | Mock prototype capabilities do not appear as working services. |
| R19 | Own avatar and local Play preferences (D18) | Pending | Upload bounded; other seats use initials; shared avatars remain backlog. |
| R20 | Reduced motion (D19) | Preview | Static ground; no decorative loop; meaningful state remains readable. |
| R21 | Lazy cached Oracle details, unread inputs explicit (D20) | Pending | Bounded fetching; failures do not block gameplay or fabricate totals. |
| R22 | Seat controls and commander identity (1a) | Pending | Choose Deck, Settings, Ready; prerequisite footnotes; host-only game settings. |
| R23 | Stable deck dialog and catalog warming (1b) | Pending | Footer buttons stay visible; no fabricated per-card progress; correct retry. |
| R24 | Play home, join, rematch, recent games, direct invitation landing (1f) | Pending | Real records only; invite bypasses home; live game returns to seat. |
| R25 | Shared presentation events (2a) | Pending | Initial/reconnect/stale views do not replay effects; missing stack item is not called countered without evidence. |
| R26 | Fog, neon edge, five environments and scene dissolve (3b) | Pending | Initial forest is procedural preview only; cap particles and preserve readability. |
| R27 | Viewed seat changes camera and shown hand, not permissions (3c plus latest user correction) | Preview | Opponent count shown as backs; own hand returns; controls remain authorized to viewer. |
| R28 | Draw, place, tap, select, inspect and cast motion (3d, 5.3) | Pending | New video timings; interruptible; no accidental cast from selection; reduced motion preserved. |
| R29 | Acting-seat and unseen-permanent cues (3e) | Pending | Reset conditions and reconnect baseline tested. |
| R30 | Overlay rails never resize canvas (4a) | Preview | Both handles open/close overlays; canvas box unchanged. Existing content only at this milestone. |
| R31 | Profile drawer modules (latest correction) | Preview | Left/Right/None dialog; drag and keyboard order, hide/restore, owner isolation, reload and fresh-browser cloud restore. Counter-Intel currently shows public battlefield counts; deeper analysis remains pending. |
| R32 | Stack cards newest first, resolved history (4a) | Preview: active stack; resolved history pending | One source of truth with reveal shelf; all active entries remain accessible. |
| R33 | Attack readiness uses engine facts (section 6) | Pending | Engine already has controlledSinceTurn and summoningSick; project facts without guessing next turn or attack legality. |
| R34 | Mana and passive-effect wording (section 6) | Pending | Source count is not mana amount; text match is not a confirmed active restriction. |
| R35 | Screenshots with stable object IDs (latest user instruction) | Preview | T01 top, T02–T04 back seats, T05 front mat, T06 command, T07 library, T08 lands, T09 battlefield, T10 camera, T11 hand, T12/T13 handles, T14 panel, T15/T16 previous/next hand cards, T17 Background, T18 Table material, T19 Cards, T20 profile, T21 player life container, M01 stack, M02 Table Vitals, M03 History, M04 Card Preview, D01 drawer settings. |
| R36 | UAT feedback (latest user instruction) | HTML canceled by Rob | Rob will transcribe the game; retain screenshots and automated release checks. |
| R37 | Staging integration (latest user instruction) | Pending | Exact tested source, release verification and staging acceptance; no production release implied. |

## Reconciled technical decisions

- PixiJS 8.11.0 is pinned. Its matching compatibility module is required under script-src self; image workers are disabled to preserve worker-src self. Do not relax CSP to accommodate the library.
- The prototype's React app and side-positioned seats are not imported. Full screen uses the extended cloud board directly.
- The recorded-view preview is labeled and isolated. Its controls do not pretend that a recorded state transition is an accepted gameplay action. Live control acceptance uses the real GameTable browser suite separately.
- The code has stack targets, combat defenders and priority holder already. Do not add redundant protocol fields.
- Stack disappearance remains ambiguous. Add authoritative outcomes or use neutral wording.
- Audio brief contradictions: continuing silently and resuming at the interruption point differ. The proposed default is actual resume from saved position. The detailed D12 opponent-relative instant behavior takes priority over old JSON empty-stack wording. Main pool equality does not imply listener-relative effects are identical.
- Preserve the pre-existing collection-model.js change separately. The four new audio files remain pending the audio-pack milestone; do not claim them indexed or shipped correctly yet.

## Initial preview proof boundary

The preview proves the new layout on the existing card renderer, a persistent Pixi surface, rigid camera tilt, a wrapping seven-card fan, viewed-seat hand privacy and overlay geometry. It does not finish environment art, motion, audio, events, lobby flow or full Counter-Intel analysis. Both environment and motion videos were inspected at their two-second frames on October 14. Their rounded floating slab and independent surroundings guide the renderer; the newer back-row layout and hand fan take precedence over their older seat positions.

## Execution sequence

Baseline and this checklist; event contracts; tabletop preview and regression checks; lobby; motion and stack awareness; environments and audio; configurable side-pane modules and Counterintelligence; recorded playtest feedback and staging release. The preview may land before the shared event layer because it displays current projected state and does not yet infer animation events.

## UI control references, October 14

Use these first-party references for subsequent UI details while preserving the game's visual style:

- [shadcn/ui Sidebar](https://ui.shadcn.com/docs/components/radix/sidebar): sidebar structure, separate collapse controls, and edge rails. For this game, retain both outside-edge handles and avoid making the entire edge an ambiguous toggle/resize target.
- [Radix Icon Button](https://www.radix-ui.com/themes/docs/components/icon-button): compact icon actions and restrained visual variants; also use its component library as a reference for popovers, menus, dialogs, and sliders.
- [Atlassian navigation layout](https://atlassian.design/components/navigation-system/layout): full-height navigation and explicit expand/collapse controls.
- [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum): minimum 24-by-24 CSS-pixel targets, with specified exceptions. Keep controls easy to click even when their artwork is small.

Applied to T12/T13: 24-by-32-pixel tabs replace 27-by-60-pixel buttons, with thin directional chevrons, subtle borders, distinct hover and keyboard focus, and unchanged attachment to the drawer's outer edge. These are design references, not new framework dependencies.
