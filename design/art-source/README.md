# Source art

Rob's original uploads, 5MB apiece. They lived outside the repository until 2026-09-25, when Rob asked
that nothing the plan needs be local only. They are in `design/`, which the release builder never
ships; the product ships the processed versions.

| source | becomes | where |
|---|---|---|
| `crankmagic_logo.png` | `crankmagic-logo-gear-v4-256.webp` (35KB) | `assets/crankmagic/` |
| `card_backgrounds/card_background_{tan,blue,black,red,green}.png` | `card-back-{white,blue,black,red,green}.webp` (~120KB each) | `game/ui/assets/card-backs/` |
| the same five | `card-back-{tan,blue,black,red,green}.webp` (280x392, ~20KB each), the cloud board's backs | `assets/crankmagic/`, by `tools/build-card-backs.py` |

Neither could be used as delivered. Both arrive 2752x1536 RGB with **no alpha**: the card backs'
transparency checkerboard is baked in as real gray pixels, and the logo sits on a flat navy field
close to but not the same as the app header, which would have shown as a rectangle behind it.

The processing script is `game/tools/prep-art.py`, and it reads this folder. Re-run it after replacing a
source file; it finds the real content, crops to it, keys the flat background out to alpha and
resizes. `tan` is the white/Plains back — the art is cream rather than white.
