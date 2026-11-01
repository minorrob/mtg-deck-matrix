# F9 · Combat sound keyed to the timeline

**Linear:** ROB-372 (folds in ROB-46 and ROB-47) · **Wave 2 onward** · **Lane:** `crankmagic-audio.js`,
`assets/audio/**`, `docs/play-overhaul/sound-index-additions.json`, `tests/audio*.mjs` · **Waits on:** F1 · **Runs beside:**
F2 onward.

## Goal

Sounds fire on `CrankTimeline`'s hooks, never on a view: the morph in and out, an attack declared, a block, each damage
burst (first strike's wave distinct), a death's dissolve, the summary card; the combat music ramp from the attacker's
Yes to end of combat; responses on the stack duck the bed and restore it on the authoritative empty stack (ROB-47).

## Hard rules

I2 (sound is also a claim about what happened), I10 (no clip chosen by a face-down card's identity), ROB-46's and
ROB-47's rules (mute, sliders, reconnect, duplicate frames, no restart each turn), `AGENTS.md`'s audio pack rules
(`docs/plan-play-audio.md`).

## The specification

- `CrankAudio.combat` subscribes to `CrankTimeline` hooks (a seam F1 exposes: `CrankTimeline.on(kind, fn)`); each hook
  maps to a moment in the pack's resolution rules; the index of new clips goes in `sound-index-additions.json`.
- The ramp: begins at `CrankCombat.enter` (reason attacker or defender), resolves at `leave`; a bystander's morph plays
  the ramp at lower gain; duplicate frames and a view replayed produce no sound (hooks fire once per `eventId`).
- Reduced motion does not silence sound; the sound preference does.

## Build steps

1. `tests/audio-combat.mjs`: hooks → clips; one sound per `eventId`; mute; sliders; reconnect; `eventsReset` plays
   nothing; ducking on a stack response and restore on empty. Watch it fail.
2. Implement; update the index; `breaks-audio-combat.py`: a clip on a view; a clip twice for one event; a face-down card's
   clip by its real name.
3. A local session listens in a real game.

## Done when

- [ ] Every combat sound is an event's; none is a view's; the ramp and ducking behave as ROB-46 and ROB-47 say.

## Risks and what to watch

- **Autoplay policy**: nothing plays before a user gesture; the gate's press is one.
- **Overlap**: a 25-damage wave must not fire 25 clips; bundle per step as the timeline does.

## Choices you will face

- *New clips or the pack's?* The pack's first; new clips only through the pack's process and index.
