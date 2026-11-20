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

Ordinary paragraphs do not need a dedicated class when their role is clear from
their container. Add a token only when it represents a recurring decision;
component-specific exceptions belong to the component that requires them.

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
