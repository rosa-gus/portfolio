import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image

spec = importlib.util.spec_from_file_location(
    "image_dimensions", Path(__file__).resolve().parents[1] / "image_dimensions.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ImageDimensionsTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.data = self.root / "internal/portfolio/data"
        self.data.mkdir(parents=True)
        self.assets = self.root / "web/assets/projects"
        (self.assets / "covers").mkdir(parents=True)
        self.image = self.assets / "portrait.png"
        Image.new("RGB", (10, 30)).save(self.image)
        Image.new("RGB", (40, 20)).save(self.assets / "covers/example.webp")
        self.catalog = [{"slug": "example", "media": {
            "cover": "cover",
            "items": [
                {"id": "cover", "src": "/projects/covers/example.webp"},
                {"id": "portrait", "src": "/projects/portrait.png"},
            ],
        }}]
        self.write_catalog()

    def write_catalog(self):
        (self.data / "projects.json").write_text(json.dumps(self.catalog))

    def test_extracts_gallery_and_cover_and_updates_replaced_image(self):
        module.generate(self.root)
        manifest = self.data / "image-dimensions.json"
        result = json.loads(manifest.read_text())
        self.assertEqual(result["/projects/portrait.png"], {"width": 10, "height": 30})
        self.assertEqual(result["/projects/covers/example.webp"], {"width": 40, "height": 20})
        Image.new("RGB", (50, 15)).save(self.image)
        module.generate(self.root)
        self.assertEqual(json.loads(manifest.read_text())["/projects/portrait.png"], {"width": 50, "height": 15})
        self.assertEqual(json.loads((self.data / "projects.json").read_text()), self.catalog)

    def test_missing_or_invalid_image_fails_with_path(self):
        self.image.unlink()
        with self.assertRaisesRegex(ValueError, "/projects/portrait.png"):
            module.generate(self.root)
        self.image.write_text("invalid")
        with self.assertRaisesRegex(ValueError, "/projects/portrait.png"):
            module.generate(self.root)

    def test_includes_preview_density_variants_without_changing_catalog(self):
        directory = self.assets / "covers/previews"
        directory.mkdir()
        self.catalog[0]["media"]["preview"] = "/projects/covers/previews/example.webp"
        self.write_catalog()
        for density in (1, 2, 3):
            suffix = "" if density == 1 else f"@{density}x"
            Image.new("RGB", (86 * density, 58 * density)).save(directory / f"example{suffix}.webp")
        module.generate(self.root)
        dimensions = json.loads((self.data / "image-dimensions.json").read_text())
        for density in (1, 2, 3):
            suffix = "" if density == 1 else f"@{density}x"
            self.assertEqual(dimensions[f"/projects/covers/previews/example{suffix}.webp"], {
                "width": 86 * density, "height": 58 * density,
            })
        self.assertEqual(json.loads((self.data / "projects.json").read_text()), self.catalog)

    def test_missing_preview_fails_with_path(self):
        self.catalog[0]["media"]["preview"] = "/projects/covers/previews/missing.webp"
        self.write_catalog()
        with self.assertRaisesRegex(ValueError, "/projects/covers/previews/missing.webp"):
            module.generate(self.root)

    def test_rejects_path_outside_assets(self):
        self.catalog[0]["media"]["items"][0]["src"] = "/projects/../../private.png"
        self.write_catalog()
        with self.assertRaisesRegex(ValueError, "Invalid project image path"):
            module.generate(self.root)


if __name__ == "__main__":
    unittest.main()
