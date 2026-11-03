import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from PIL import Image, ImageChops


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
class ReticleVideoTest(unittest.TestCase):
    def test_black_profile_lossless_preserves_background_and_dimensions(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            image = Image.new("RGB", (96, 64), (12, 12, 12))
            image.paste((180, 180, 180), (24, 16, 72, 48))
            image.save(root / "source.png")
            subprocess.run([
                "ffmpeg", "-v", "error", "-loop", "1", "-i", str(root / "source.png"),
                "-frames:v", "2", "-r", "24", "-c:v", "ffv1", str(root / "source.mkv"),
            ], check=True)
            exporter = Path(__file__).resolve().parents[1] / "rosa_reticula_video.py"
            subprocess.run([
                sys.executable, str(exporter), str(root / "source.mkv"), str(root / "output.webm"),
                "--work-dir", str(root / "work"), "--width", "96", "--fps", "24",
                "--profile", "black", "--preset", "vp9", "--lossless",
                "--encoder-speed", "8", "--shadow", "#000000", "--highlight", "#ffffff",
            ], check=True, capture_output=True)
            with Image.open(root / "output-poster.webp") as poster:
                self.assertEqual(poster.size, (96, 64))
                self.assertEqual(poster.convert("RGB").getpixel((0, 0)), (0, 0, 0))
                self.assertGreater(poster.convert("L").getpixel((48, 32)), 100)
            manifest = json.loads((root / "output.json").read_text())
            self.assertEqual(manifest["fps"], "24")
            self.assertEqual(manifest["treatment_profile"]["blur_at_1280"], 0)
            self.assertIn("-lossless", manifest["encoding"])

    def test_duotone_and_exact_last_frame_poster(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for index, value in enumerate([0, 100, 255], 1):
                Image.new("L", (96, 64), value).save(root / f"{index:06d}.png")
            subprocess.run([
                "ffmpeg", "-v", "error", "-framerate", "2", "-i", str(root / "%06d.png"),
                "-c:v", "ffv1", str(root / "source.mkv"),
            ], check=True)
            exporter = Path(__file__).resolve().parents[1] / "rosa_reticula_video.py"
            subprocess.run([
                sys.executable, str(exporter), str(root / "source.mkv"), str(root / "output.webm"),
                "--work-dir", str(root / "work"), "--width", "96", "--fps", "2",
                "--preset", "vp9", "--encoder-speed", "8", "--crf", "10",
                "--shadow", "#000000", "--highlight", "#a1d17a",
            ], check=True, capture_output=True)
            subprocess.run([
                "ffmpeg", "-v", "error", "-i", str(root / "output.webm"),
                "-vf", "select='eq(n,2)'", "-frames:v", "1", str(root / "last.png"),
            ], check=True)
            with Image.open(root / "last.png") as decoded, Image.open(root / "output-poster.webp") as poster:
                self.assertIsNone(ImageChops.difference(decoded.convert("RGB"), poster.convert("RGB")).getbbox())
                for actual, target in zip(poster.convert("RGB").getpixel((48, 32)), (161, 209, 122)):
                    self.assertLessEqual(abs(actual - target), 3)
            manifest = json.loads((root / "output.json").read_text())
            self.assertEqual(manifest["posters"]["last"]["frame"], 2)
            self.assertEqual(manifest["transport"], "duotone")


if __name__ == "__main__":
    unittest.main()
