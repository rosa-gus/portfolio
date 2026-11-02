#!/usr/bin/env python3
"""Export rosa-reticle video with optional duotone and a final-frame WebP poster.

Separate prepare/encode phases keep full-clip jobs resumable. This does not
change the home page. Prepared frames stay grayscale; optional duotone colors
are baked into the encoded video.
Delivery defaults: original profile, 1920 px maximum width, 12 fps, AV1 CRF 30.
"""

import argparse
from concurrent.futures import ProcessPoolExecutor
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image, ImageColor

if __package__:
    from .rosa_reticula import __version__, pair_screen, CURVE, SHADOW_PALETTE
    from .rosa_reticula_profiles import PROFILES, profile_metadata, treat_profile
else:
    from rosa_reticula import __version__, pair_screen, CURVE, SHADOW_PALETTE
    from rosa_reticula_profiles import PROFILES, profile_metadata, treat_profile


PRESETS = {
    "av1": ("-c:v", "libsvtav1", "-crf", "30", "-preset", "6", "-pix_fmt", "yuv420p"),
    "vp9": ("-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-deadline", "good",
            "-cpu-used", "4", "-pix_fmt", "yuv420p"),
}


def file_digest(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def write_json(path: Path, value: dict) -> None:
    temporary = path.with_suffix(path.suffix + ".pending")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def prepare_frame(job: tuple[str, str, int, str]) -> None:
    source, destination, width, profile = Path(job[0]), Path(job[1]), job[2], job[3]
    with Image.open(source) as image:
        gray = treat_profile(image, width=width, profile=profile)
    gray.save(destination, compress_level=1)


def encode_chunks(work: Path, metadata: dict, preset: str, encoding: list[str],
                  chunk_frames: int, max_chunks: int | None, filters: str) -> tuple[Path | None, dict]:
    """Cache completed chunks and remux them without an additional encode."""
    config = {"job": metadata, "encoding": encoding, "chunk_frames": chunk_frames, "filters": filters}
    fingerprint = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()[:16]
    directory = work/"encoded"/preset/fingerprint
    directory.mkdir(parents=True, exist_ok=True)
    segments, generated = [], 0
    for start in range(0, metadata["frames"], chunk_frames):
        expected = min(chunk_frames, metadata["frames"]-start)
        path = directory/f"{start:06d}.webm"
        marker = path.with_suffix(".json")
        complete = False
        if path.exists() and marker.exists():
            try:
                previous = json.loads(marker.read_text())
                complete = previous["frames"] == expected and previous["sha256"] == file_digest(path)
            except (ValueError, KeyError):
                pass
        if not complete:
            if max_chunks is not None and generated >= max_chunks:
                print("Encoding paused at chunk boundary; repeat --encode-only to continue", flush=True)
                return None, {}
            temporary = directory/f"{start:06d}.pending.webm"
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                            "-framerate", metadata["fps"], "-start_number", str(start+1),
                            "-i", str(work/"gray/%06d.png"), "-frames:v", str(expected),
                            "-vf", filters, "-an",
                            *encoding, "-threads", "2", str(temporary)], check=True)
            probe = json.loads(subprocess.check_output([
                "ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames",
                "-show_entries", "stream=nb_read_frames", "-of", "json", str(temporary)]))
            if int(probe["streams"][0]["nb_read_frames"]) != expected:
                raise ValueError("Encoded chunk has an incorrect frame count")
            temporary.replace(path)
            write_json(marker, {"frames": expected, "sha256": file_digest(path)})
            generated += 1
            print(f"Encoded {preset} frames {start+1}..{start+expected}/{metadata['frames']}", flush=True)
        segments.append(path)
    listing = directory/"segments.ffconcat"
    listing.write_text("ffconcat version 1.0\n"+"".join(f"file {path.name}\n" for path in segments))
    combined = directory/"combined.webm"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                    "-f", "concat", "-safe", "1", "-i", str(listing), "-c", "copy", "-an",
                    str(combined)], check=True)
    return combined, {"chunk_frames": chunk_frames, "chunks": len(segments), "remuxed_without_reencoding": True}


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--preset", choices=PRESETS, default="av1")
    parser.add_argument("--profile", choices=PROFILES, default="original",
                        help="Visual treatment; original preserves the unmodified engine")
    parser.add_argument("--shadow", default="#000000", help="Duotone shadow color")
    parser.add_argument("--highlight", help="Duotone highlight color; omit for grayscale")
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--width", type=int, default=1920, help="Maximum treated width")
    parser.add_argument("--fps", default="12", help="Preparation frame rate, for example 12 or 24000/1001")
    parser.add_argument("--crf", type=int, help="Override encoder quality, 0..63 (lower is higher quality)")
    parser.add_argument("--lossless", action="store_true",
                        help="Encode without compression loss (requires --preset vp9; larger files)")
    parser.add_argument("--aspect", help="Optional crop ratio, for example 9:16")
    parser.add_argument("--focus-x", type=float, default=.5, help="Horizontal crop center, 0..1")
    parser.add_argument("--batch-size", type=int, help="Maximum frames to treat per preparation run")
    parser.add_argument("--chunk-frames", type=int, help="Encode in resumable groups of this many frames")
    parser.add_argument("--max-chunks", type=int, help="Maximum new chunks to encode in one run")
    parser.add_argument("--encoder-speed", type=int, help="Override AV1 preset or VP9 cpu-used speed")
    parser.add_argument("--version", action="version", version=f"rosa-reticle {__version__}")
    parser.add_argument("--resume-preparation", action="store_true")
    phase = parser.add_mutually_exclusive_group()
    phase.add_argument("--prepare-only", action="store_true")
    phase.add_argument("--encode-only", action="store_true")
    args = parser.parse_args(argv)
    try:
        fps = str(Fraction(args.fps))
        if Fraction(fps) <= 0:
            raise ValueError("nonpositive frame rate")
    except (ValueError, ZeroDivisionError):
        parser.error("fps must be a positive number or ratio")
    try:
        shadow = ImageColor.getrgb(args.shadow)
        highlight = ImageColor.getrgb(args.highlight or "#ffffff")
        if len(shadow) != 3 or len(highlight) != 3:
            raise ValueError("Colors must be opaque RGB")
    except ValueError as error:
        parser.error(str(error))
    color = args.highlight is not None or shadow != (0, 0, 0)
    filters = "pad=ceil(iw/2)*2:ceil(ih/2)*2:color=black"
    if color:
        channels = ":".join(
            f"{channel}='{dark}+({light}-{dark})*val/255'"
            for channel, dark, light in zip("rgb", shadow, highlight)
        )
        filters += f",format=rgb24,lutrgb={channels},format=yuv420p"
    treatment_profile = profile_metadata(args.profile)
    if args.workers < 1:
        parser.error("workers must be positive")
    if args.width < 1 or args.batch_size is not None and args.batch_size < 1:
        parser.error("width and batch-size must be positive")
    if args.chunk_frames is not None and args.chunk_frames < 1 or args.max_chunks is not None and args.max_chunks < 1:
        parser.error("chunk-frames and max-chunks must be positive")
    if args.max_chunks is not None and args.chunk_frames is None:
        parser.error("max-chunks requires chunk-frames")
    encoding = list(PRESETS[args.preset])
    if args.lossless:
        if args.preset != "vp9":
            parser.error("--lossless requires --preset vp9")
        if args.crf is not None:
            parser.error("--lossless cannot be combined with --crf")
        encoding[encoding.index("-crf")+1] = "0"
        encoding.extend(["-lossless", "1"])
    if args.crf is not None:
        if not 0 <= args.crf <= 63:
            parser.error("crf must be between 0 and 63")
        encoding[encoding.index("-crf")+1] = str(args.crf)
    if args.encoder_speed is not None:
        maximum = 13 if args.preset == "av1" else 8
        if not 0 <= args.encoder_speed <= maximum:
            parser.error(f"encoder-speed must be between 0 and {maximum} for {args.preset}")
        key = "-preset" if args.preset == "av1" else "-cpu-used"
        encoding[encoding.index(key)+1] = str(args.encoder_speed)
    if not 0 <= args.focus_x <= 1:
        parser.error("focus-x must be between 0 and 1")
    aspect = None
    if args.aspect:
        try:
            aspect = Fraction(args.aspect.replace(":", "/"))
            if aspect <= 0:
                raise ValueError("nonpositive aspect")
        except (ValueError, ZeroDivisionError):
            parser.error("aspect must be a positive ratio such as 9:16")
    if not args.source.is_file():
        parser.error("source video not found")
    if not args.encode_only:
        if args.work_dir.exists() and not args.resume_preparation:
            parser.error("Choose a new work directory")
        args.work_dir.mkdir(parents=True, exist_ok=True)
        original, gray = args.work_dir/"source", args.work_dir/"gray"
        original.mkdir(exist_ok=True)
        gray.mkdir(exist_ok=True)
        digest = hashlib.sha256(args.source.read_bytes()).hexdigest()
        preparation = {"source_sha256": digest, "algorithm_version": __version__,
                       "fps": fps, "width": args.width,
                       "aspect": str(aspect) if aspect else None, "focus_x": args.focus_x}
        # Original caches remain compatible; other profiles get distinct stamps.
        if args.profile != "original":
            preparation["treatment_profile"] = treatment_profile
        stamp = args.work_dir/"preparation.json"
        if args.resume_preparation:
            if not stamp.is_file() or json.loads(stamp.read_text()) != preparation:
                parser.error("Work directory does not match this source or rosa-reticle version")
            if not (args.work_dir/"decoded.json").is_file():
                parser.error("Decoding was interrupted; choose a new work directory")
        else:
            stamp.write_text(json.dumps(preparation, indent=2)+"\n")
        if not args.resume_preparation:
            decode_filters = [f"fps={fps}"]
            if aspect:
                ratio = float(aspect)
                decode_filters.append(f"crop=w='round(min(iw,ih*{ratio})/2)*2':h='round(min(ih,iw/{ratio})/2)*2':x='max(0,min(iw-ow,iw*{args.focus_x}-ow/2))':y='(ih-oh)/2'")
            decode_filters.append(f"scale=w='min(iw,{args.width})':h=-1:flags=lanczos")
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
                            "-i", str(args.source), "-vf", ",".join(decode_filters),
                            "-compression_level", "1", str(original/"%06d.png")], check=True)
        frames = sorted(original.glob("*.png"))
        if not frames:
            parser.error("Input contains no decoded frames")
        if not args.resume_preparation:
            (args.work_dir/"decoded.json").write_text(json.dumps({"frames": len(frames)}))
        elif json.loads((args.work_dir/"decoded.json").read_text())["frames"] != len(frames):
            parser.error("Decoded frame sequence is incomplete")
        pending = []
        for path in frames:
            target = gray/path.name
            try:
                with Image.open(target) as existing:
                    existing.verify()
            except (OSError, SyntaxError):
                pending.append(path)
        jobs = [(str(path), str(gray/path.name), args.width, args.profile) for path in pending[:args.batch_size]]
        if args.workers == 1:
            for index, job in enumerate(jobs, 1):
                prepare_frame(job)
                if index % 30 == 0:
                    print(f"Prepared {len(frames)-len(pending)+index}/{len(frames)}", flush=True)
        else:
            with ProcessPoolExecutor(max_workers=args.workers) as pool:
                for index, _ in enumerate(pool.map(prepare_frame, jobs), 1):
                    if index % 30 == 0:
                        print(f"Prepared {len(frames)-len(pending)+index}/{len(frames)}", flush=True)
        if len(jobs) < len(pending):
            print(f"Prepared {len(frames)-len(pending)+len(jobs)}/{len(frames)}; resume preparation to continue", flush=True)
            return
        assert hashlib.sha256(args.source.read_bytes()).hexdigest() == digest
        with Image.open(gray/frames[0].name) as first:
            dimensions = list(first.size)
        (args.work_dir/"job.json").write_text(json.dumps({"source":str(args.source), "source_sha256":digest,
            "frames":len(frames), "fps":fps, "width":args.width,
            "dimensions":dimensions, "framing":{"aspect":str(aspect) if aspect else None,"focus_x":args.focus_x}, "curve":CURVE,
            "palette":SHADOW_PALETTE, "ranks":pair_screen(),
            "algorithm":"rosa-reticle", "algorithm_version":__version__,
            "treatment_profile":treatment_profile}, indent=2)+"\n")
    if args.prepare_only:
        return
    metadata = json.loads((args.work_dir/"job.json").read_text())
    if metadata.get("algorithm_version") != __version__:
        parser.error("Prepared frames use a different rosa-reticle version")
    if metadata.get("treatment_profile", profile_metadata("original")) != treatment_profile:
        parser.error("Prepared frames use a different treatment profile; select its --profile")
    if hashlib.sha256(args.source.read_bytes()).hexdigest() != metadata["source_sha256"]:
        parser.error("Source does not match the prepared frames")
    if args.output.suffix != ".webm" or args.output.exists() or args.output.with_suffix('.json').exists():
        parser.error("Choose a new .webm output and manifest")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    chunk_metadata = {}
    if args.chunk_frames:
        combined, chunk_metadata = encode_chunks(args.work_dir, metadata, args.preset, encoding,
                                                 args.chunk_frames, args.max_chunks, filters)
        if combined is None:
            return
        with args.output.open("xb") as output, combined.open("rb") as encoded:
            shutil.copyfileobj(encoded, output)
    else:
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
                    "-framerate", metadata["fps"], "-i", str(args.work_dir/"gray/%06d.png"),
                    "-vf", filters, "-an",
                    *encoding, "-threads", "2", str(args.output)], check=True)
    # Decode the final delivered frame, so the poster matches the encoded video.
    poster = args.output.with_name(f"{args.output.stem}-poster.webp")
    if poster.exists():
        parser.error(f"Poster already exists: {poster}")
    with tempfile.TemporaryDirectory() as temporary:
        final_frame = Path(temporary) / "last.png"
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
            "-i", str(args.output), "-vf", f"select='eq(n,{metadata['frames'] - 1})'",
            "-frames:v", "1", str(final_frame),
        ], check=True)
        with Image.open(final_frame) as image:
            image.save(poster, lossless=True, method=6)
    posters = {"last": {"path": str(poster), "sha256": file_digest(poster),
                        "frame": metadata["frames"] - 1}}
    metadata.update({"transport": "duotone" if color else "gray",
                     "colors": {"shadow": args.shadow, "highlight": args.highlight or "#ffffff"},
                     "preset":args.preset, "encoding":encoding, "bytes":args.output.stat().st_size,
                     "sha256":file_digest(args.output), "posters":posters, **chunk_metadata,
                     "implementation":{"engine_sha256":file_digest(Path(__file__).with_name('rosa_reticula.py')),
                                       "profiles_sha256":file_digest(Path(__file__).with_name('rosa_reticula_profiles.py')),
                                       "exporter_sha256":file_digest(Path(__file__))},
                     "display": "Baked duotone; no display filter." if color else "Native grayscale; no display filter."})
    args.output.with_suffix('.json').write_text(json.dumps(metadata, indent=2)+"\n")
    print(args.output, args.output.stat().st_size, flush=True)


if __name__ == "__main__":
    main()
