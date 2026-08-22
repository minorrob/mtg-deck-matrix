"""Split a four-cell rarity sprite into normalized transparent PNG assets."""

from pathlib import Path
import sys

from PIL import Image


NAMES = ("common_rarity", "uncommon_rarity", "rare_rarity", "mythic_rarity")


def dominant_horizontal_run(image: Image.Image) -> Image.Image:
    """Discard any neighboring emblem sliver that crosses an equal-cell boundary."""
    alpha = image.getchannel("A")
    columns = []
    for x in range(alpha.width):
        visible = sum(alpha.getpixel((x, y)) > 12 for y in range(alpha.height))
        columns.append(visible > 3)

    runs = []
    start = None
    for x, occupied in enumerate(columns + [False]):
        if occupied and start is None:
            start = x
        elif not occupied and start is not None:
            runs.append((start, x))
            start = None
    if not runs:
        return image
    left, right = max(runs, key=lambda run: run[1] - run[0])
    return image.crop((left, 0, right, image.height))


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: extract_rarity_sheet.py SOURCE OUTPUT_DIR")

    source = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(source).convert("RGBA")
    cell_width = sheet.width / len(NAMES)

    for index, name in enumerate(NAMES):
        left = round(index * cell_width)
        right = round((index + 1) * cell_width)
        cell = dominant_horizontal_run(sheet.crop((left, 0, right, sheet.height)))
        alpha = cell.getchannel("A")
        bounds = alpha.getbbox()
        if not bounds:
            raise RuntimeError(f"{name} cell contains no visible artwork")
        icon = cell.crop(bounds)
        side = max(icon.size)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.alpha_composite(icon, ((side - icon.width) // 2, (side - icon.height) // 2))
        canvas.thumbnail((256, 256), Image.Resampling.LANCZOS)
        canvas.save(output_dir / f"{name}.png", optimize=True)


if __name__ == "__main__":
    main()
