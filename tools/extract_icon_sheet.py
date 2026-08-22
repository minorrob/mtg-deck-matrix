"""Extract the approved icon cells from the supplied design sheet."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageOps


CELLS = {
    "build_cost.png": (102, 145),
    "power_level.png": (219, 145),
    "budget.png": (335, 145),
    "rarity.png": (451, 145),
    "does.png": (102, 271),
    "scoring_profile.png": (219, 271),
    "fit.png": (335, 271),
    "engine_rating.png": (451, 271),
    "room_grow.png": (102, 389),
    "value.png": (335, 389),
    "roles.png": (451, 389),
    "buy_location.png": (219, 508),
    "ceiling.png": (335, 508),
    "notes.png": (451, 508),
}


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: extract_icon_sheet.py SOURCE OUTPUT_DIR")
    source = Image.open(sys.argv[1]).convert("RGBA")
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)
    half = 44
    for filename, (center_x, center_y) in CELLS.items():
        crop = source.crop((center_x - half, center_y - half, center_x + half, center_y + half))
        crop = ImageOps.fit(crop, (192, 192), method=Image.Resampling.LANCZOS)
        crop.save(output_dir / filename, optimize=True)
    print(f"Extracted {len(CELLS)} icons to {output_dir}")


if __name__ == "__main__":
    main()
