# Source art

Rob's original uploads, 5MB apiece. They lived outside the repository until 2026-09-25, when Rob asked
that nothing the plan needs be local only. They are in `design/`, which the release builder never
ships; the product ships the processed versions.

| source | becomes | where |
|---|---|---|
| `crankmagic_logo.png` | `crankmagic-logo-gear-v4-256.webp` (35KB) | `assets/crankmagic/` |
| `card_backgrounds/card_background_{tan,blue,black,red,green}.png` | `card-back-{white,blue,black,red,green}.webp` (~120KB each) | `game/ui/assets/card-backs/` |
| `landing/landing-cards-source.png` (2026-09-30) | `landing-cards.webp` (1120px, 529KB), the landing page's hero | `assets/crankmagic/` |
| `landing/landing-cards-animation-source.mp4` (2026-09-30) | `landing-cards.webm` (808x656, 24 fps, 3.6 s loop, 646KB) and `landing-cards-poster.webp`, the hero animated | `assets/crankmagic/` |

Neither could be used as delivered. Both arrive 2752x1536 RGB with **no alpha**: the card backs'
transparency checkerboard is baked in as real gray pixels, and the logo sits on a flat navy field
close to but not the same as the app header, which would have shown as a rectangle behind it.

The processing script is `game/tools/prep-art.py`, and it reads this folder. Re-run it after replacing a
source file; it finds the real content, crops to it, keys the flat background out to alpha and
resizes. `tan` is the white/Plains back — the art is cream rather than white.

**The landing art (Rob, 2026-09-30)** came the same way, a painted checkerboard with no alpha, but its glow and haze
fade into the checker rather than stopping at a card's edge, so a tight crop cannot work.
`node tools/lift-checkerboard.mjs design/art-source/landing/landing-cards-source.png <out> 1120` lifts it (the method
is in the tool's header) and reproduces the committed WebP byte for byte. A version on solid black would need none of it.

**The animation (Rob, 2026-09-30)** is his second clip, the checkerboard painted in again. A transparent video every
browser plays does not exist, so `node tools/lift-checkerboard-video.mjs design/art-source/landing/landing-cards-animation-source.mp4 <out>`
lifts it onto black (the method is in the tool's header; it needs Microsoft Edge for the clip's H.264), and the landing
page draws it with `mix-blend-mode: screen` on the dark themes, where black is exactly the page. The light theme, and a
reader who asks for less motion, keep the still.
