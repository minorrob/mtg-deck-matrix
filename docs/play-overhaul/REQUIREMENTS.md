# Play requirements and acceptance checklist

Updated October 14, 2026. Execution branch: `codex/play-tabletop-preview`.

Rob's current instructions override the compiled brief; the later feedback captured in INSTRUCTIONS.md overrides the older Replit prototype. The wireframes govern layout; the reference videos govern atmosphere and motion. RECONCILIATION.md is architectural evidence, including its corrections. Replit supplies reusable examples and recorded fixtures, not a replacement app or a new design authority.

## Current user decisions

- Playmats and all cards on them share the same perspective and tilt at every camera setting; the separate hand strip stays upright.

- When viewing another seat, show that player's hand count and card backs. Return to your own seat to see your cards. Never reveal another player's private faces. This supersedes the initial execution plan's own-hand proposal.
- Send screenshots after meaningful UI updates, with stable visible object IDs for feedback.
- Notify Rob before building the configurable side-pane modules.
- At the end of the complete overhaul, provide a standalone HTML UAT guide covering every feature and aspect, expected results, and ways to record findings.
- Integrate the completed, verified work into staging. The staging release branch must be updated through the repository's release builder if it is generated; production is a separate release.

## Status legend

Preview means implemented in the initial opt-in desktop surface, with acceptance still being recorded. Pending means this preview does not claim the feature is complete. Inherited means existing behavior is preserved and requires regression checks.

| ID | Requirement and source | Status | Acceptance |
| --- | --- | --- | --- |
| R01 | Cloud path only; existing room authority (brief 0, 1) | Inherited | Real GameTable actions still use the existing answer envelope; no browser rules fork. |
| R02 | Hybrid Pixi ground and DOM card buttons (D1) | Preview | Vendored pinned library and license; CSP unchanged; buttons retain accessible names and options. |
| R03 | Full board default, desktop stage at 1280+ after acceptance (D2) | Pending | Preview is opt-in; phone stays on existing layout; capability failure retains a readable board. |
| R04 | Top strip, upright hand below canvas, back row of three seats, front mat 70–75% depth (D3) | Preview | Geometry measured at 1400, 1280 and 1024 widths and short heights. |
| R05 | Tilt 0–35 degrees and zoom sliders (D4) | Preview | Live updates; save on release; endpoints fit; mats and cards share one projective plane, with the hand upright. Camera reset/reload remains to be accepted. |
| R06 | Host-selected table scene, five choices, synchronized in game (D5) | Pending | Host-only route, validation, persisted field, game refresh/reconnect carries scene to every seat. |
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
| R31 | Configurable pane slots, repeated modules, persisted layout (4a) | Pending | Notify Rob first; dropdown swap and duplicate instances have isolated state. |
| R32 | Stack cards newest first, resolved history (4a) | Pending | One source of truth with reveal shelf; all active entries remain accessible. |
| R33 | Attack readiness uses engine facts (section 6) | Pending | Engine already has controlledSinceTurn and summoningSick; project facts without guessing next turn or attack legality. |
| R34 | Mana and passive-effect wording (section 6) | Pending | Source count is not mana amount; text match is not a confirmed active restriction. |
| R35 | Screenshots with stable object IDs (latest user instruction) | Preview | T01 top, T02–T04 back seats, T05 front mat, T06 command, T07 library, T08 lands, T09 battlefield, T10 camera, T11 hand, T12/T13 handles, T14 panel. |
| R36 | Final comprehensive UAT HTML (latest user instruction) | Pending | Every row has steps, expected behavior, status, evidence and an input for findings. |
| R37 | Staging integration (latest user instruction) | Pending | Exact tested source, release verification and staging acceptance; no production release implied. |

## Reconciled technical decisions

- PixiJS 8.11.0 is pinned. Its matching compatibility module is required under script-src self; image workers are disabled to preserve worker-src self. Do not relax CSP to accommodate the library.
- The prototype's React app and side-positioned seats are not imported. The existing cloud board is extended behind an opt-in switch.
- The recorded-view preview is labeled and isolated. Its controls do not pretend that a recorded state transition is an accepted gameplay action. Live control acceptance uses the real GameTable browser suite separately.
- The code has stack targets, combat defenders and priority holder already. Do not add redundant protocol fields.
- Stack disappearance remains ambiguous. Add authoritative outcomes or use neutral wording.
- Audio brief contradictions: continuing silently and resuming at the interruption point differ. The proposed default is actual resume from saved position. The detailed D12 opponent-relative instant behavior takes priority over old JSON empty-stack wording. Main pool equality does not imply listener-relative effects are identical.
- Preserve the pre-existing collection-model.js change separately. The four new audio files remain pending the audio-pack milestone; do not claim them indexed or shipped correctly yet.

## Initial preview proof boundary

The preview proves the new layout on the existing card renderer, a persistent Pixi surface, camera controls, viewed-seat hand privacy and overlay geometry. It does not finish environment art, motion, audio, events, lobby flow or configurable modules. The environment and motion videos remain the references for those later milestones.

## Execution sequence

Baseline and this checklist; event contracts; tabletop preview and regression checks; lobby; motion and stack awareness; environments and audio; configurable side-pane modules and Counterintelligence; final UAT HTML and staging release. The preview may land before the shared event layer because it displays current projected state and does not yet infer animation events.
