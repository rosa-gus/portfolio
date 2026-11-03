"""Optional treatments built around the unchanged rosa-reticle engine.

The original profile delegates directly to treat_gray. Delivery profiles control
preparation and where screening appears, retaining the engine's palette and
threshold geometry. Profile settings are versioned in video preparation caches.
"""

from dataclasses import asdict, dataclass
from functools import lru_cache

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

if __package__:
    from . import rosa_reticula as engine
else:
    import rosa_reticula as engine


@dataclass(frozen=True)
class ReticleProfile:
    name: str = "light"
    version: str = "0.2.0"
    blur_at_1280: float = .75
    black_floor: float = .08
    black_release: float = .30
    screen_start: float = .10
    screen_full: float = .20
    screen_fade: float = .45
    screen_end: float = .62
    white_start: float = .80
    white_full: float = .96


PROFILES = {
    "original": None,
    "light": ReticleProfile(),
    # Dark footage: suppress background haze without spatial smoothing.
    "black": ReticleProfile(
        name="black", version="0.1.0", blur_at_1280=0,
        black_floor=.08, black_release=.16,
        white_start=.90, white_full=1,
    ),
}


def profile_metadata(name: str) -> dict:
    if name not in PROFILES:
        raise ValueError(f"Unknown rosa-reticle profile: {name}")
    settings = PROFILES[name]
    return asdict(settings) if settings else {"name": "original", "version": engine.__version__}


@lru_cache(maxsize=8)
def profile_tables(settings: ReticleProfile) -> tuple[list[int], list[int]]:
    tones, screen = [], []
    for encoded in range(256):
        value = encoded / 255
        # A soft toe creates continuous blacks without a hard clipping edge.
        tone = value * engine.smoothstep(settings.black_floor, settings.black_release, value)
        tone += (1 - tone) * engine.smoothstep(settings.white_start, settings.white_full, value)
        tones.append(round(255 * tone))
        screen.append(round(255 * engine.smoothstep(settings.screen_start, settings.screen_full, value)
                            * (1 - engine.smoothstep(settings.screen_fade, settings.screen_end, value))))
    return tones, screen


def treat_profile(image: Image.Image, width: int = 1200, *, profile: str = "original") -> Image.Image:
    """Return treated grayscale; never resample or blur the finished reticle."""
    profile_metadata(profile)
    settings = PROFILES[profile]
    if settings is None:
        return engine.treat_gray(image, width)

    source = engine.prepare_source(image, width)
    gray = ImageOps.grayscale(source)
    if settings.blur_at_1280:
        gray = gray.filter(ImageFilter.GaussianBlur(settings.blur_at_1280 * source.width / 1280))
    base = ImageEnhance.Contrast(gray).enhance(1.1).point(engine.curve_lut())
    tones, screen = profile_tables(settings)
    base = base.point(tones)
    screened = engine.pairs_gray(base)
    return Image.composite(screened, base, base.point(screen))
