# CSS architecture

Styles are organized by responsibility and loaded in an explicit cascade order
from `app.css`.

## Layers

- `tokens.css` defines shared color, typography, spacing, sizing, and motion
  decisions.
- `reset.css` normalizes browser defaults without introducing visual opinions.
- `base.css` defines default HTML element behavior.
- `compositions.css` contains reusable content and layout patterns such as
  headings, prose, and metadata groups.
- `components/` contains styles tied to specific portfolio experiences.

## Reusable roles

- `SectionHeading` is a `templ` component that preserves the `h1`/`h2`
  hierarchy and accepts an optional description.
- `.prose` provides the default rhythm for editorial content.
- `.prose--intro` promotes the first paragraph to introductory copy.
- `.meta-text` applies the monospace treatment used by metadata and labels.
- `.control-text` applies the monospace treatment used by control groups.
- `.text-action` provides consistent presentation and interaction for textual
  actions.
- `GameMetadata` shares the initial title and description layout between games.
  `GameCredits` renders dotted credit rows on the games' opening screens.

Ordinary paragraphs do not need a dedicated class when their role is clear from
their container. Add a token only when it represents a recurring decision;
component-specific exceptions belong to the component that requires them.

## Windows

`Window` in `web/views/window.templ` provides modal and inline frames with
optional information, command, touch, help, and tips slots. Controls and tips
share the command-bar support area and open one panel at a time. Both pause games
through `window:help`; Escape dismisses the current panel and restores its toggle.
`WindowOptions` accepts
preferred `Width`/`Height` and optional `MinWidth`, `MinHeight`, `MaxWidth`, and
`MaxHeight` as trusted CSS lengths. Omit height to size to content. Decoration
is `tab`, `fold`, or empty for a plain frame.

Notes use a 36rem × 28rem folded frame; Snake uses a 26rem tabbed frame; Ski
uses a 48rem tabbed frame. Collections share the inline frame while retaining
archive navigation. Empty slots occupy no space.

Use `data-window-trigger="<window-id>"` to open a modal. `windows.ts` owns focus,
dragging, viewport bounds, and closing. `window-layout.ts` fits
`data-window-media` canvases to the available body, preserving their aspect
ratio when commands expand or the viewport changes. Wrap scrolling content in
`ScrollArea`; the frame and body contain overflow without adding a second
scrollbar. Commands stay accessible and scroll internally when necessary.

`ArrowGlyph` renders IBM Plex Mono's upward arrow with the text variation
selector, rotated through `.ui-arrow` for each direction. Use it for window
controls instead of bare arrow characters.

## Pixel icons

`PixelIcon(name)` renders the named matrix from `web/views/pixel_icon.go`.
Each `#` is a filled pixel; `.` is transparent. Snake and Ski share a 12×12
grid. The Go helper generates CSS shadows, with no browser JavaScript.

`pixel-icon.css` sets the pixel size through `--pixel-size` (3px by default).
Pixels inherit `currentColor`; the archive provides the frame and theme color.
Edit the matrix to change a drawing, or add a named matrix to reuse the renderer.

## Theme colors and active states

Use semantic theme tokens directly: `--color-surface-*`, `--color-text-*`,
and `--color-border-*`. Avoid paper/ink aliases and component-specific theme
colors.

Selected controls use `--color-surface-active` with `--color-text-active`.
Selection expressed through a border uses `--color-border-active`. These roles
also cover text selection and navigation swipe transitions. Light mode uses
deep rose with light text; dark mode uses pale rose with dark text.

Offset window shadows use `--color-shadow-offset`, independently of active
states. Selecting an item does not require adding a fill where its existing
indicator is an underline, marker, or border.
