# CrankMagic Play Audio Pack

Standalone sound-design pack for **Play / live game** only. Not integrated into the CrankMagic app yet — hand to Claude Code with the Integration Notes sheet.

## Contents
- `CrankMagic-Play-Audio-Index.xlsx` — Summary, Master Prompt, Sound Index, Resolution Rules, Integration Notes
- `MASTER_PROMPT.txt` — parent prompt for the audio AI
- `sound-index.csv` / `sound-index.json` — machine-readable index (91 rows)
- `README.md` — this file

## How to generate clips
1. Paste `MASTER_PROMPT.txt` into your audio AI as the system/parent prompt.
2. For each **P0** then **P1** row in Sound Index, send the **Audio prompt** as the child prompt.
3. Save files as `Filename slug`.wav (or .ogg) into a folder Claude will mount (suggested `assets/audio/play/`).
4. Keep Descriptor column for human scanning.

## Design intent
- Mythical high fantasy, wondrous — not horror.
- Separate SFX vs BGM buses for a future Settings → Audio screen.
- Creature sounds vary by tribe (Human = weapons, Zombie = undead moan, Dragon = roar, etc.).
- Legendary gets an ethereal emphasis layer.
- Vehicles / Equipment / Auras get subtype-specific clips.

## Sources
Card types, Aura/Equipment/Vehicle/Fortification, Legendary/Basic/Snow, Dies / ETB / Board Wipe concepts: `data/commander-glossary.json` in the CrankMagic repo (read-only). Creature tribes curated for audio clarity (not every MTG creature type).
