# Ski audio

These audio assets have separate terms from the GPL TypeScript sources.

| Runtime file | Original file / source | Credit and license |
| --- | --- | --- |
| `ski-slide-loop.wav` | First 1.25 seconds of `ski-slide-source.wav` (originally `sliding.wav`); 200 ms equal-power overlap, normalized | [Cross-country skiing (SoundAction 018)](https://freesound.org/s/721700/) by alexarje, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `impact-pine.ogg` | `impactWood_light_004.ogg` | [Kenney](https://kenney.nl/), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `impact-rock.ogg` | `footstep_concrete_000.ogg` | Kenney, CC0 1.0 |
| `impact-fall.ogg` | Supplied as `impact-fall.ogg` | Kenney, CC0 1.0 |
| `near-miss-bell.ogg` | `impactBell_heavy_001.ogg` | Kenney, CC0 1.0 |
| `yeti-step.ogg` | `footstep_snow_000.ogg` | Kenney, CC0 1.0 |
| `yeti-appear.ogg` | `monster_surprise.ogg`, supplied separately | Separate asset; no Kenney attribution. Author and license were not supplied. |

The retained `ski-slide-source.wav` is also by alexarje under CC BY 4.0.
Generate the derived loop with `python3 tools/prepare_ski_audio.py` from the
repository root. Only the derived loop is imported by the game.
