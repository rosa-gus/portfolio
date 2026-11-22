"""Build a seamless PCM loop from the beginning of the attributed ski recording."""
from array import array
from pathlib import Path
import math
import sys
import wave

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "web/scripts/games/ski/audio"


def main():
    with wave.open(str(AUDIO / "ski-slide-source.wav"), "rb") as source:
        if source.getnchannels() != 1 or source.getsampwidth() != 2:
            raise ValueError("Expected mono 16-bit PCM source")
        rate = source.getframerate()
        samples = array("h", source.readframes(round(rate * 1.25)))
    if sys.byteorder != "little":
        samples.byteswap()
    # The first 1.25 seconds only. A 200 ms equal-power overlap connects the tail
    # back to the head; start playback after that overlap for a continuous seam.
    overlap = round(rate * 0.2)
    seam = [
        samples[-overlap + i] * math.cos(i / (overlap - 1) * math.pi / 2)
        + samples[i] * math.sin(i / (overlap - 1) * math.pi / 2)
        for i in range(overlap)
    ]
    loop = list(samples[overlap:-overlap]) + seam
    # The source opening is quiet: normalize the derived asset, mix in-game.
    gain = 0.8 * 32767 / max(abs(value) for value in loop)
    output = array("h", (round(value * gain) for value in loop))
    if sys.byteorder != "little":
        output.byteswap()
    with wave.open(str(AUDIO / "ski-slide-loop.wav"), "wb") as target:
        target.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        target.writeframes(output.tobytes())


if __name__ == "__main__":
    main()
