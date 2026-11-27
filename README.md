# Rosa Gus / Portfólio

A Portuguese-language software engineering portfolio built with Go, `templ`,
TypeScript, and Vite. Runs as an HTTP server or exports to a static site,
with an interactive project archive and dedicated case studies.

The portfolio's visual style aspires to an “editorial poetics of the digital archive”.

## Requirements

- Go 1.26+.
- Node.js 20.19+ or 22.12+ and npm.
- Python 3.10+ and Pillow 10–12 for build-time image dimensions and cover preparation.

## Development

```sh
npm install
python3 -m pip install -r tools/requirements.txt
npm run assets:build
npm run generate
go run ./cmd/portfolio
```

Open `http://localhost:8080`. Assets and image dimensions must be generated
before compiling Go because they are embedded in the binary.

| Command | Purpose |
| --- | --- |
| `npm run assets:dev` | Watch and rebuild front-end assets. |
| `npm run assets:build` | Build assets and extract image dimensions. |
| `npm run generate` | Regenerate Go templates after editing `.templ` files. |
| `npm run check` | Check TypeScript types. |
| `go test ./...` | Run Go tests. |
| `npm run build` | Build assets, check types, generate templates, and create `bin/portfolio`. |
| `npm run site:build` | Build and export the static site to `public`. |

Restart the Go server after rebuilding assets or templates. Edit `.templ`
sources rather than generated `_templ.go` files.

Pull requests run `.github/workflows/validate-pr.yml`: static export (including
TypeScript checks and template generation), Go tests, front-end tests, and Python
image tooling tests. New pushes cancel older validation runs for the same PR.
GitHub Pages deployment remains in the separate workflow triggered by pushes to `main`.

## Structure and content

| Path | Contents |
| --- | --- |
| `cmd/portfolio`, `cmd/export` | HTTP server and static exporter. |
| `internal/portfolio/data/profile.json` | Identity, metadata, biography, career, and contact. |
| `internal/portfolio/data/projects.json` | Projects, technologies, media, and links. |
| `internal/portfolio/data/archive.json` | Home document grid: order, visibility, collections, and links. |
| `internal/portfolio/data/cases/<slug>/` | Markdown case studies. |
| `internal/sitepath` | Origin, base-path, and URL handling. |
| `web/views`, `web/scripts`, `web/styles` | Templates, interactions, and styles. |
| `web/assets` | Source assets bundled by Vite. |

To add a project, create an entry in `projects.json` with a unique slug and
`#RRGGBB` tone. Add editorial sections in reading order to the optional
`caseStudy.sections` array. Give each section a unique English, lowercase
kebab-case `id` for its anchor, a display `title`, and a `content` path such as
`cases/fuste-confere/how-it-works.md`. The Markdown filename must match the ID.
The page adds the gallery when media is available and ends with the technical
details. The IDs `gallery` and `practice` and the suffix `-heading` are reserved.

Reference project assets from `web/assets/projects/` and select a media item
as `media.cover` when the project has media. To show a standalone icon on the home grid,
add a `project` entry referencing the slug in `archive.json`. Collection membership
is derived automatically from the project capabilities.

Image dimensions are generated automatically; do not add `width` or `height`
to `projects.json`. Rebuild assets after replacing images.

Set `introduction.showAvailability` in `profile.json` to `false` to hide the
availability message, or `true` to show `introduction.availability`.
Content is embedded, so rebuild the server or static site after editing it.

## Notes and articles

`internal/portfolio/data/documents.json` defines Markdown documents. Their position
and visibility on the home grid are controlled by `archive.json`. Each catalog
entry has a unique `slug`, `kind` (`note` or `article`), and `content` pointing
to `documents/<slug>.md`.

Notes open in a popup. Their `title` and optional `summary`, `date`, and
`updatedAt` belong in the catalog. Dates use `YYYY-MM-DD`, and `updatedAt`
appears as **Última edição** in the window's ficha. The initial note is `boas vindas`.

Articles open at `/article/<slug>` and are included in the static export. Start
the Markdown file with YAML front matter, then write the body.

```markdown
---
title: "Um artigo do portfólio"
author: "Rosa Gus"
date: 2026-11-18
summary: "Uma breve descrição do artigo."
---

Primeiro parágrafo do artigo.
```

`title` is required. `author`, `date`, and `summary` are optional. When `author`
is omitted, the page uses the portfolio profile's display name. Reading time
is calculated from the body. The page renders the title from the front matter.
Add the article's `slug`, `kind`, and `content` to the catalog and reference its
slug with a `document` item in `archive.json` to display it on the home. Older
articles without front matter can still use their existing catalog metadata.

The archive preserves item positions and reading context in session storage
when navigating to an article. `[REORGANIZAR]` restores the original grid.

## Maintaining the home document grid

Edit `internal/portfolio/data/archive.json`. The `items` array is the original grid
order, also used by `[REORGANIZAR]`. Keep each `id` unique and stable: dragged
positions are stored by ID, independently of labels, destinations, or array order.

Add `?open=<id>` to the home URL to open a visible app, note, or collection,
or to select a project's consultation card on load. For example,
`/portfolio/?open=ski` opens Ski and `/portfolio/?open=welcome` opens the
welcome note. Opening an app or note sets `open` in the current URL and
closing it removes the parameter. Opening a collection or selecting a project
leaves the URL as it is. Articles and full case studies have their own URLs.

On an article or case study, use the app slug in `?open=<app>`, for example
`/portfolio/article/por-que-revisitei-o-ski?open=ski`. A Markdown link such as
`[Jogar Ski](?open=ski)` opens the app over the current page. The available apps
are those enabled in the home archive.

- **Add:** append an entry referencing existing content, or create a link.
- **Reorder:** move entries within `items`.
- **Hide temporarily:** add `"visible": false`; omitting `visible` means visible.
- **Remove from home:** delete its entry. Published case and article URLs remain
  available through their original content catalogs.

Supported entries (examples are independent, not a replacement catalog):

```json
[
  { "id": "project-timbre", "type": "project", "ref": "timbre-palette" },
  { "id": "welcome", "type": "document", "ref": "boas-vindas" },
  { "id": "collection-interfaces", "type": "collection", "ref": "interfaces" },
  { "id": "snake", "type": "app", "ref": "snake", "visible": false },
  { "id": "github", "type": "link", "source": "contact.githubURL", "label": "GitHub", "icon": "GH" },
  { "id": "external", "type": "link", "url": "https://example.com", "label": "Example", "icon": "EX" }
]
```

`document` automatically uses the note popup or article page according to
`documents.json`. The built-in apps are `snake` and `ski`; introducing a new app requires
its component and behavior. Link `icon` is a short text mark. Links require
an absolute HTTP(S) `url` or one profile `source`: `contact.githubURL`,
`contact.linkedInURL`, or `contact.sourceURL`. A channel with an empty profile URL
is omitted automatically.

On wide screens, the underlined title of a note or app opens its metadata in a
separate window. App records live in `internal/portfolio/data/apps.json`, where
`slug` matches the archive item's `ref`. The optional fields are
`publishedAt` (`YYYY-MM-DD`), `version`, `sourcePath` (path relative to the
repository root), and `license` (source code license). Apps and notes can
also define an ordered `metadata` array with `label` and `value` in each entry.
Apps can define `credits` in the same format for their intro and metadata window.

`collections` defines each folder's `id`, `label`, `symbol`, and `capabilities`.
A project belongs to a folder when it matches any listed capability; it can
belong to multiple folders. One optional collection may use `"fallback": true`
instead of capabilities to collect projects unmatched by the other definitions.
`"hideWhenEmpty": true` omits an empty collection; other empty folders remain
visible with their count and are disabled. Each folder needs its own `collection`
entry in `items` to appear on the grid.

Hiding a standalone project icon does not remove the project from its collections.
To remove it from home entirely, also adjust the matching collection definitions
or the project's capabilities. Consultation panels are generated for projects
reachable through either visible icons or visible folders. Hidden notes and apps
have no home popup; an archive without projects still supports documents and links.

The catalog validates IDs, references, types, fields and link URLs during server
startup or static export, including hidden entries. After deleting source content,
remove its references too. Errors identify the affected catalog entry.

When the grid changes, saved offsets are revalidated against its current bounds
and collisions. Removed IDs are ignored; new IDs start at their original grid
position. If a saved arrangement cannot fit, it falls back to the original grid.
Old saved positions migrate to stable IDs on the next save.

Content is embedded: rebuild the server or static export after editing the catalog.

## Related projects in the featured card

Add optional `relations` to an entry in `projects.json`:

```json
"relations": [
  { "ref": "abrigo-do-wlad", "label": "Design system de" }
]
```

`ref` is the destination project's slug; its title is resolved automatically.
The first relation appears beside the technologies in the featured card, truncating
on narrow screens without adding a row. Hovering or focusing shows the full relation.
Clicking selects the related project's card; the link also has its case URL as a
fallback. The relation arrow is the literal `↳` glyph, using the existing `ui-arrow` class
for IBM Plex Mono and text presentation, without rotation.

Related projects remain consultable even without their own grid entry. Relations
are directional; add a separate relation to the other project for a reverse link.
Missing destinations, empty labels, self references and duplicate destinations
are rejected during loading. Removing a relation removes this footer affordance.

The shared `Tooltip(id, title, description...)` component in `web/views/tooltip.templ` wraps its
trigger as children; the trigger references `id` through `aria-describedby`.
Four short corners drawn with CSS borders follow the bubble's dimensions.
The tooltip text uses IBM Plex Mono. An optional
description appears above the title in a muted color. The rectangular background fills only
the frame's interior. Hover or focus opens it; Escape dismisses it.

## Build and deployment

For the HTTP server, run `npm run build`, then `./bin/portfolio`.
Set `SITE_ORIGIN` to the public origin for canonical and social metadata;
it defaults to `http://localhost:8080`.

For a static GitHub Pages deployment:

```sh
SITE_ORIGIN=https://rosa-gus.github.io \
SITE_BASE_PATH=/portfolio \
npm run site:build
```

The export includes the home page, case studies, assets, and `.nojekyll`.

| Variable | Export CLI flag | Default |
| --- | --- | --- |
| `SITE_ORIGIN` | `--origin` | `http://localhost:8080` |
| `SITE_BASE_PATH` | `--base-path` | Empty |
| `SITE_OUTPUT` | `--output` | `public` |

Pass export flags with `npm run site:build -- --origin https://example.com`.
The output directory must be repository-relative, dedicated to the export,
and neither the repository root nor a symlink. A successful export replaces
its existing contents.

## Project covers

Prepare 1200×800 duotone WebP covers from untreated source images:

```sh
npm run images:covers -- \
  path/to/original.jpg web/assets/projects/covers/project-slug.webp \
  --cover --shadow '#000000' --highlight '#577142'
```

The tool does not overwrite existing files or edit `projects.json`.
Run `npm run images:covers -- --help` for framing and treatment options.

Generate the small grid previews from the mapped originals in `web/assets/untreated`:

```sh
python3 tools/preview_covers.py
```

This regenerates lossless WebP previews at 86×58, 172×116, and 258×174 in
`web/assets/projects/covers/previews`. Each size is framed before dithering.
The optional `media.preview` path selects these images for the grid; the main
covers remain independent. Image dimensions are collected during the normal asset build.

## Credits

- About video: [brixiv / Pexels](https://www.pexels.com/@brixiv/).
- Favicon source photograph: [Diane Helentjaris / Unsplash](https://unsplash.com/@dhelentjaris).
- Project photograph credits: `media.coverCredit` in [projects.json](internal/portfolio/data/projects.json).
- Ski sliding audio: [Cross-country skiing (SoundAction 018)](https://freesound.org/s/721700/)
  by **alexarje**, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  The original is preserved as `audio/source/ski-slide-source.wav`. `ski-slide-loop.ogg` uses
  only the first 1.25 seconds, with an equal-power crossfade and volume normalization
  to create a continuous loop. The prepared PCM loop is archived as `audio/source/ski-slide-loop.wav`.
- Ski impact effects (including `impact-fall.ogg`), near-miss bell, and yeti footstep effects: **[Kenney](https://kenney.nl/)**,
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
  Original files: `impactWood_light_004.ogg`, `footstep_concrete_000.ogg`,
  `impactBell_heavy_001.ogg`, and `footstep_snow_000.ogg`.
  The separate yeti appearance sound (`yeti-appear.ogg`, originally
  `monster_surprise.ogg`) is not part of the Kenney credit.

## License

Copyright © 2026 Luis Gustavo R.C.

Source code: [GNU AGPL v3](LICENSE.txt).
Ski TypeScript: [GNU GPL v3](web/scripts/games/ski/LICENSE.md).
Ski sprites: [CC0 1.0](web/assets/ski/LICENSE.md).
Portfolio copy, case studies, media, and identities have separate terms;
see [CONTENT_NOTICE.md](CONTENT_NOTICE.md).

The contact panel links to the [source repository](https://github.com/rosa-gus/portfolio).
