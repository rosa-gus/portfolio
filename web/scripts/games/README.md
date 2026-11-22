# Games

`snake/` and `ski/` contain each game's engine, controls, and rendering.
Engines have no DOM dependencies. Templates and styles remain in `web/views`
and `web/styles/components`.

## Ski

`ski-game.ts` loads the game when its popup opens. `ski-engine.ts` runs the
simulation at 60 fixed steps per second; `ski-renderer.ts` draws the sprites;
`ski-session.ts` handles input, pause, and separate local distance/score records.
`ski-feedback.ts` owns snow particles, impact wobble, floating captions, and the
brief capture/escape presentation. Its random sequence is independent of the
simulation. `ski-audio.ts` mixes the continuous ski loop and event sounds through
Web Audio, unlocked by the play gesture. Closing, pausing, restarting, hiding the
tab, or losing focus stops all sources, including pending asynchronous playback.
The sound button mutes the game; reduced-motion mode omits particles, wobble,
and the end-summary drift. The summary shows score, distance, near misses, and
the best score, using the same IBM Plex Mono weight/size as canvas feedback.
Its 2.2-second rise settles into a readable persistent result. The capture phrase
has a subtle per-letter wave (1.5 pixels, two 2.4-second cycles), then rests.
Decorative letters are hidden from assistive technology; a single complete phrase
is provided for screen readers. Reduced-motion mode disables both animations.

The horizontal window uses a 640×360 canvas. Left/right or A/D rotate the skis;
the heading persists when released. Down or S turns downhill, and Space pauses.
Touch supports dragging to set a heading and held buttons. Pointing downhill
gives maximum speed; diagonal and horizontal headings reduce descent.
Obstacle generation alternates six-row phrases of open snow, suggested turns,
tighter passages, and recovery. Corridors shift by at most 30 pixels per row;
their width and row spacing vary together, and the direction alternates each cycle.
Starting at 700 meters, slalom events add alternating gates built with existing
trees and rocks. An open approach row and "slalom à frente" caption precede the
first gate. Dense banks leave a single opening, with no permanent center or edge
lane. Each event locks its difficulty when generated:

| Distance at entry | Gates | Row spacing | Opening width | Center offset |
| --- | --- | --- | --- | --- |
| Below 3000 m | 4 | 330 px | 192 px | ±84 px |
| 3000–5999 m | 6 | 305 px | 168 px | ±92 px |
| 6000 m onward | 8 | 285 px | 148 px | ±100 px |

Opening widths are measured between obstacle centers; collision radii reduce
the usable width. Gates are generated once per row, with no random obstacles
inside their openings. The event ends only after the last gate passes the skier,
then leaves three recovery rows and at least 1800 meters before another slalom
can start. The first yeti is due no earlier than 2000 meters, with 2600 meters
between a successful escape and the next pursuit. Either event reserves at least
900 meters of normal terrain after it ends, and slalom never overlaps pursuit.
After slalom, the yeti is postponed if necessary so its footprints and glimpse
also wait for the full normal-terrain interval. Overdue events wait rather than
starting back to back. The original terrain phrases fill these intervals; ski
speed, gate layouts, and pursuit behavior are unchanged by this pacing change.

Obstacles slow the skier. Tracks precede the yeti.
Before each pursuit, a silent `yeti-glimpse` can peek from behind a pine on the
far side of an open/recovery row, generated 110–220 meters before the yeti.
It scrolls with its real anchor tree and peeks for 1.2 seconds once the tree is
inside the viewport. The glimpse has no collision, bonus, sound, or caption;
the anchor remains a normal pine. It appears at most once per encounter and
is deferred/skipped during slalom. The appearance sound remains exclusive to
the pursuit. Both theme variants are loaded with the other sprites.

Downhill skiing increases the
actual vertical gap; tight turns and collisions let the yeti close it. Escape
requires a 260-pixel vertical gap and at least six seconds of pursuit, replacing
the old automatic 24-second timeout. A proximity warning and footsteps communicate
approach. Closing the popup, hiding the tab, or losing focus pauses play.
Collisions recover speed smoothly over 1.1 seconds. Every 10 meters earns 10
points. Passing within 16 pixels beyond an obstacle's collision width earns a
single +50 "por pouco" bonus, caption, and bell after fully clearing it. Downhill
velocity must stay at least 55% of the current maximum downhill speed throughout
the collision band and at exit; accelerating only at exit does not qualify. Hits,
wide passes, footprints, and passes during collision recovery earn no bonus.
Simulation events are consumed after each fixed step, including catch-up steps.
Near misses within 250 ms share a caption with their combined bonus; bells are
spaced by at least 120 ms to prevent overlapping attacks.

Audio filenames describe their game roles: `impact-pine`, `impact-rock`,
`near-miss-bell`, `yeti-step`, `yeti-appear`, and `ski-slide-loop`. The slide
source is retained but not imported into the runtime bundle. See the root
[README credits](../../../README.md#credits) and [audio notice](ski/audio/README.md).
The slide loop is mixed at a maximum gain of 0.034 before the 0.5 master gain.
Volume follows absolute ski speed with a curved response and 220 ms smoothing;
carving adds only a small accent. High/low-pass filters soften rumble and bright
friction, and discrete events briefly duck the loop. Playback-rate variation is
limited to 0.94–1.0 to avoid exaggerated changes in pitch.

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
node --experimental-strip-types --test tools/tests/ski-*.test.mjs tools/tests/snake-engine.test.mjs
```
