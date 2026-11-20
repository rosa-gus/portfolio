# Archive society

A decorative society of asterisks on the fully visible portfolio. It never loads
content, dims the page, captures input, or delays navigation.

## Files

- `engine.ts`: DOM-independent simulation. Each entity has curiosity,
  sociability, timidity, speed, shelter preferences, and encounter memory. States
  are rest, walk, observe, yield, enter, hidden, leave, and peek. Encounters require a
  nearby available neighbour and reciprocal acceptance.
- `index.ts`: measures the environment, draws asterisks and faint local lights
  on a transparent canvas, positions speech, and manages input and cleanup.
- `styles.css`: non-interactive overlay. Speech reuses
  `project-archive__complaint`, the documents' complaint balloon, not tooltips.

## Behaviour

Up to ten entities on desktop and five on mobile, with independent rhythms.
Bodies use four muted colours (ivory, rose, sage, and blue) at 63% opacity.
Colour identity survives layout/theme changes and is independent of affinity;
the theme selects a matching light/dark palette. Halos stay almost neutral.
Folders and images provide shelter; text and controls are obstacles. A shared
navigation grid finds routes, then simplifies them into clear walking segments.
Shelters admit at most two entities. Long exposure encourages hiding; a hidden
entity waits several seconds before leaving, peeking, or withdrawing again.
Each entity carries a warm, soft-edged light with a brighter core. Its light
fades and is clipped at shelter edges as the entity slips inside.

Encounters strengthen memories of up to three neighbours, fading over about
three minutes. Familiar neighbours are more likely to meet again or take a
short walk together, then separate. Fidelity encourages returning to a preferred
shelter; an occupied favourite prompts a brief wait before trying alternatives.
Curious observers can attract a neighbour without speaking. Entities yield and
step aside on crowded paths. After three blocked attempts, one entity may pass
through its neighbours with a subtle opacity dip. A shared permit and stable ID
priority prevent simultaneous crossings; it ends on separation or after four
seconds. This never bypasses text, controls, surfaces, or viewport boundaries.
Peeking can end in another retreat into shelter.
Occasional 4–7 second quiet periods leave one curious resident exploring while
others gradually pause or remain hidden. These habits never depend on colour.

Decisions use irregular intervals; one shared `requestAnimationFrame` draws
movement. Geometry updates after layout, font, and theme changes. Hidden tabs
pause the simulation. There is no remote AI, network request, or generated text.

Speech uses short, silent murmurs from a shared invented vocabulary; punctuation
suggests curiosity or familiarity without fixed translations. It remains rare
and only occurs during nearby encounters: first opportunity after 30–50 seconds,
a 24% chance on subsequent checks, one balloon at a time for three seconds, and
a 40–65 second cooldown after speaking. Some visits have no dialogue. Balloons
are decorative, unfocusable, and not live announcements. There is no audio.

The first real mouse movement, touch, click, key, or scroll starts withdrawal
(up to 900 ms) without cancelling the original action. The society stays away
for the tab session: `portfolio:v1:society-dismissed` in `sessionStorage`.
Reduced motion disables it. To see it again, remove that key and reload.

## Verification

Run `node --test tools/tests/society*.test.mjs`, `npm run check`, and
`npm run build`. Visual review should check subtle lighting, readable projects,
edge occlusion, and infrequent encounters and speech.
