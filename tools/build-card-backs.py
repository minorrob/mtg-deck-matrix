"""THE CLOUD BOARD'S CARD BACKS, from Rob's artwork (design/art-source/card_backgrounds/, 2026-09-30).

    python3 tools/build-card-backs.py          writes assets/crankmagic/card-back-{tan,blue,black,red,green}.webp

Each source is 2752x1536 RGB with the card painted over a baked-in grey checkerboard (the transparency is pixels,
not alpha). The card is found as everything that is not grey, cropped six pixels inside its edge (inside its own
rounded border, so no checker is left at the sides; the board's card radius clips the corners), and scaled to
280x392, 5:7 at twice the largest size a back is drawn (a library pile or a hand's back, at most about 140px wide),
WebP at quality 80. The local game host's backs (game/tools/prep-art.py, 488x680, "white" for tan) are the frozen
host's and are not these.

Tan is the universal back; a seat's back follows its color (docs/plan-to-done-2026-09-30.md, item 20).
"""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "design", "art-source", "card_backgrounds")
OUT = os.path.join(ROOT, "assets", "crankmagic")
SIZE = (280, 392)


def card_box(im):
    """Everything that is not grey: r, g and b more than a whisker apart."""
    px = im.convert("RGB").load()
    w, h = im.size
    left, top, right, bottom = w, h, 0, 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            if max(r, g, b) - min(r, g, b) > 12:
                left, right, top, bottom = min(left, x), max(right, x), min(top, y), max(bottom, y)
    return (left + 6, top + 6, right + 1 - 6, bottom + 1 - 6)


for color in ("tan", "blue", "black", "red", "green"):
    im = Image.open(os.path.join(SRC, f"card_background_{color}.png"))
    box = card_box(im)
    card = im.crop(box).convert("RGB").resize(SIZE, Image.LANCZOS)
    path = os.path.join(OUT, f"card-back-{color}.webp")
    card.save(path, "WEBP", quality=80, method=6)
    print(f"{color:6s} crop {box} ({box[2] - box[0]}x{box[3] - box[1]}, ratio {(box[2] - box[0]) / (box[3] - box[1]):.3f}) -> {SIZE[0]}x{SIZE[1]}, {os.path.getsize(path)} bytes")
