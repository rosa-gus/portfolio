#!/usr/bin/env python3
"""Extract project image metadata during the asset build, without editing assets."""

import argparse
import json
from pathlib import Path

from PIL import Image


def generate(root: Path) -> None:
    assets = (root / "web/assets").resolve()
    data = root / "internal/portfolio/data"
    projects = json.loads((data / "projects.json").read_text())
    sources = set()
    for project in projects:
        media = project["media"]
        sources.update(image["src"] for image in media["items"])
        cover = next(image for image in media["items"] if image["id"] == media["cover"])
        sources.add(
            cover["src"]
            if cover["src"].startswith("/projects/covers/")
            else f"/projects/covers/{project['slug']}.webp"
        )
    dimensions = {}
    for src in sorted(sources):
        filename = (assets / src.lstrip("/")).resolve()
        if not src.startswith("/projects/") or not filename.is_relative_to(assets):
            raise ValueError(f"Invalid project image path: {src}")
        try:
            with Image.open(filename) as image:
                width, height = image.size
                if width <= 0 or height <= 0:
                    raise ValueError("Invalid dimensions")
                dimensions[src] = {"width": width, "height": height}
        except (OSError, ValueError) as error:
            raise ValueError(f"Cannot read dimensions for {src}: {error}") from error
    output = data / "image-dimensions.json"
    contents = json.dumps(dimensions, indent=2) + "\n"
    if not output.exists() or output.read_text() != contents:
        output.write_text(contents)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    generate(parser.parse_args().root)
