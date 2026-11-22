# Games

`snake/` and `ski/` contain each game's engine, controls, and rendering.
Engines have no DOM dependencies. Templates and styles remain in `web/views`
and `web/styles/components`.

## Ski

`ski-game.ts` loads the game when its popup opens. `ski-engine.ts` runs the
simulation at 60 fixed steps per second; `ski-renderer.ts` draws the sprites;
`ski-session.ts` handles input, pause, and the local distance record.
`ski-feedback.ts` owns snow particles, impact wobble, floating captions, and the
brief capture/escape presentation. Its random sequence is independent of the
simulation. `ski-audio.ts` mixes the continuous ski loop and event sounds through
Web Audio, unlocked by the play gesture. Closing, pausing, restarting, hiding the
tab, or losing focus stops all sources, including pending asynchronous playback.
The sound button mutes the game; reduced-motion mode omits particles and wobble.

The horizontal window uses a 640×360 canvas. Left/right or A/D rotate the skis;
the heading persists when released. Down or S turns downhill, and Space pauses.
Touch supports dragging to set a heading and held buttons. Pointing downhill
gives maximum speed; diagonal and horizontal headings reduce descent.
Obstacles slow the skier. Tracks precede the yeti; descent speed and steering
allow escape. Closing the popup, hiding the tab, or losing focus pauses play.
Collisions recover speed smoothly over 1.1 seconds. Every 10 meters earns 10
points. Passing within 16 pixels beyond an obstacle's collision width earns a
single +50 "por pouco" bonus, caption, and bell after fully clearing it. Hits,
wide passes, footprints, and passes during collision recovery earn no bonus.
Simulation events are consumed after each fixed step, including catch-up steps.

Audio filenames describe their game roles: `impact-pine`, `impact-rock`,
`near-miss-bell`, `yeti-step`, `yeti-appear`, and `ski-slide-loop`. The slide
source is retained but not imported into the runtime bundle. See the root
[README credits](../../../README.md#credits) and [audio notice](ski/audio/README.md).

Original artwork stays in `web/assets/ski/`. Runtime copies in
`web/assets/ski/sprites/{light,dark}` reduce the originals by exactly 32× using
nearest-neighbor sampling. Pixel colors and transparency remain unchanged.
Names describe direction and animation: `skier-down`, `pine`, `tracks`, and
`yeti-run-01/02`.

Ski is inspired by Chris Pirih's SkiFree. Its TypeScript sources are licensed
under GPL-3.0-only; the sprites are dedicated to the public domain under
CC0-1.0. Both are by rosa gus, 2026. See the [source license](ski/LICENSE.md)
and [sprite dedication](../../assets/ski/LICENSE.md).

```sh
node --experimental-strip-types --test tools/tests/ski-engine.test.mjs tools/tests/snake-engine.test.mjs
```
