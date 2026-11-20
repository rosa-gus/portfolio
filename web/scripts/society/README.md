# Archive society

A decorative society of asterisks on the fully visible portfolio. It never loads
content, dims the page, captures input, or delays navigation.

## Files

- `engine.ts`: DOM-independent simulation. Each entity has curiosity,
  sociability, timidity, speed, and a memory of its last shelter. States are
  rest, walk, observe, enter, hidden, leave, and peek. Encounters require a
  nearby available neighbour and reciprocal acceptance.
- `index.ts`: measures the environment, draws asterisks and faint local lights
  on a transparent canvas, positions speech, and manages input and cleanup.
- `styles.css`: non-interactive overlay. Speech reuses
  `project-archive__complaint`, the documents' complaint balloon, not tooltips.

## Behaviour

Up to ten entities on desktop and five on mobile, with independent rhythms.
Folders and images provide shelter; text and controls are obstacles. A shared
navigation grid finds routes, then simplifies them into clear walking segments.
Shelters admit at most two entities. Long exposure encourages hiding; a hidden
entity waits several seconds before leaving, peeking, or withdrawing again.
Each entity carries a warm, soft-edged light with a brighter core. Its light
fades and is clipped at shelter edges as the entity slips inside.

Decisions use irregular intervals; one shared `requestAnimationFrame` draws
movement. Geometry updates after layout, font, and theme changes. Hidden tabs
pause the simulation. There is no remote AI, network request, or generated text.

Speech is rare and only occurs during nearby encounters: first opportunity
after 35–60 seconds, an 18% chance on subsequent checks, one balloon at a time
for three seconds, and a 45–75 second cooldown after speaking. Some visits have
no dialogue. Balloons are decorative, unfocusable, and not live announcements.

The first real mouse movement, touch, click, key, or scroll starts withdrawal
(up to 900 ms) without cancelling the original action. The society stays away
for the tab session: `portfolio:v1:society-dismissed` in `sessionStorage`.
Reduced motion disables it. To see it again, remove that key and reload.

## Verification

Run `node --test tools/tests/society*.test.mjs`, `npm run check`, and
`npm run build`. Visual review should check subtle lighting, readable projects,
edge occlusion, and infrequent encounters and speech.
