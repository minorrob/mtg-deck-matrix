"""Turn Rob's uploads into web assets.

Both arrive as 2752x1536 RGB at ~5MB. Neither can be used as delivered:

  * The card backs LOOK transparent but are not -- the checkerboard is baked in as real grey
    pixels, so anything but a tight crop to the card would put a chequered border on the mat.
  * The logo sits on a flat navy field that is close to, but not the same as, the app header
    (#0b0e1c against #101929), which would show as a rectangle behind it.

So: find the real content, crop to it, key the flat background out to alpha, and resize. 5MB PNGs
become small WebPs -- 26MB of source would otherwise land in a repository that ships to a browser.
"""
import sys
from PIL import Image

SRC = "C:/Users/robmi/CrankMagic/art"   # the sources moved here; see art/README.md
OUT = sys.argv[1]


def content_box(im, bg, tol):
    """Bounding box of everything that is not the flat background."""
    px = im.convert("RGB").load()
    w, h = im.size
    left, top, right, bottom = w, h, 0, 0
    step = 2
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > tol:
                left = min(left, x); right = max(right, x)
                top = min(top, y); bottom = max(bottom, y)
    return (left, top, right + 1, bottom + 1)


def checkerboard_box(im):
    """The card, against a baked-in grey checkerboard. Grey means r==g==b within a whisker."""
    px = im.convert("RGB").load()
    w, h = im.size
    left, top, right, bottom = w, h, 0, 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            if max(r, g, b) - min(r, g, b) > 12:      # colored => part of the card
                left = min(left, x); right = max(right, x)
                top = min(top, y); bottom = max(bottom, y)
    return (left, top, right + 1, bottom + 1)


def key_out(im, bg, tol, feather):
    """Flat background to alpha, with a ramp so the glow does not get a hard edge."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            d = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
            if d <= tol:
                px[x, y] = (r, g, b, 0)
            elif d < tol + feather:
                px[x, y] = (r, g, b, int(255 * (d - tol) / feather))
    return im


# ---- the logo -------------------------------------------------------------------------------
logo = Image.open(f"{SRC}/crankmagic_logo.png")
bg = logo.convert("RGB").getpixel((0, 0))
box = content_box(logo, bg, 26)
# Square it around the artwork's centre so the header gets a round badge, not a letterboxed strip.
#
# TIGHT TO THE GEAR, NOT TO THE WHOLE ILLUSTRATION. The first pass took the full content box, which
# includes the orbit's sweep far out to either side. The gear then filled about 60% of a 256px
# frame, and the header draws that at 36px -- so the subject landed at roughly 22 pixels and Rob
# reported the logo as not rendering at all. It was loading fine; it was just too small to read.
# The orbit is the widest thing in the picture and the gear is the logo, so the square is taken
# from the artwork's HEIGHT rather than its width.
cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
side = (box[3] - box[1]) // 2 + 10
square = (max(0, cx - side), max(0, cy - side),
          min(logo.size[0], cx + side), min(logo.size[1], cy + side))
out = key_out(logo.crop(square), bg, 24, 40).resize((256, 256), Image.LANCZOS)
out.save(f"{OUT}/crankmagic-logo-gear-v4-256.webp", "WEBP", quality=92, method=6)
print("logo content", box, "square", square, "->", out.size)

# ---- the card backs -------------------------------------------------------------------------
# 488x680 is the card ratio the whole board already uses; twice that keeps it crisp on a big mat.
COLORS = {"tan": "white", "blue": "blue", "black": "black", "red": "red", "green": "green"}
for src_name, color in COLORS.items():
    im = Image.open(f"{SRC}/card_backgrounds/card_background_{src_name}.png")
    box = checkerboard_box(im)
    # The scan steps two pixels at a time, so the box can sit a pixel or two wide and leave a
    # sliver of checkerboard in the corners. Six in from every side is inside the card's own
    # rounded border and costs nothing visible.
    box = (box[0] + 6, box[1] + 6, box[2] - 6, box[3] - 6)
    # 488x680 is the card ratio the board already uses. The back renders about 135px wide on the
    # mat, so this is still three and a half times what any screen asks for.
    card = im.crop(box).convert("RGB").resize((488, 680), Image.LANCZOS)
    card.save(f"{OUT}/card-back-{color}.webp", "WEBP", quality=90, method=6)
    print(f"{src_name:6s} -> {color:6s} crop {box} size {box[2]-box[0]}x{box[3]-box[1]} "
          f"ratio {(box[2]-box[0])/(box[3]-box[1]):.3f}")
