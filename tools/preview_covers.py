#!/usr/bin/env python3
"""Generate grid previews from original photos, resizing before dithering."""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageOps

from dither import treat_image


SOURCES = {
    "timbre-palette": "joao-henrique.jpg",
    "jaci-ui": "julia-reushenova.jpg",
    "mondo-send": "sue-hughes.jpeg",
    "coleoptera-identifier": "weronika-romanowska.jpg",
    "fuste-confere": "fin.jpg",
}
# The 88×60 CSS icon has a one-pixel border on each side.
PREVIEW_SIZE = (86, 58)


def generate(root: Path) -> None:
    assets = root / "web/assets"
    projects = json.loads((root / "internal/portfolio/data/projects.json").read_text())
    tones = {project["slug"]: project["tone"] for project in projects}
    output = assets / "projects/covers/previews"
    output.mkdir(parents=True, exist_ok=True)
    for slug, filename in SOURCES.items():
        with Image.open(assets / "untreated" / filename) as source:
            original = ImageOps.exif_transpose(source).convert("RGB")
            for density in (1, 2, 3):
                size = tuple(dimension * density for dimension in PREVIEW_SIZE)
                frame = ImageOps.fit(original, size, method=Image.Resampling.LANCZOS)
                treated = treat_image(
                    frame, shadow="#000000", highlight=tones[slug],
                    levels=8, strength=0.7, width=size[0], contrast=1.1, gamma=1.2,
                )
                suffix = "" if density == 1 else f"@{density}x"
                destination = output / f"{slug}{suffix}.webp"
                treated.save(destination, format="WEBP", lossless=True, method=6)
                print(f"{destination.relative_to(root)}: {size[0]}×{size[1]}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    generate(parser.parse_args().root)
