# Luis Gustavo (rosa gus) Portfolio

A Portuguese-language software engineering portfolio built with Go, `templ`,
TypeScript, and Vite. The same application can run as an HTTP server or export
the home page and project case studies as a static site.

- Website: [rosa-gus.github.io/portfolio](https://rosa-gus.github.io/portfolio)
- Source: [github.com/rosa-gus/portfolio](https://github.com/rosa-gus/portfolio)

## Features

- Responsive project carousel with progressive TypeScript enhancements.
- Dedicated case-study pages backed by JSON and Markdown content.
- Embedded profile, project, and static assets in a self-contained Go binary.
- Safe Markdown link handling for internal, external, and email links.
- Static export with canonical URLs and support for subpath deployments.
- Build-time project cover generation and ordered dithering tools.

## Requirements

- Go 1.26 or newer.
- Node.js 20.19 or newer, or Node.js 22.12 or newer.
- npm.
- ImageMagick with the `magick` command, only when generating project covers.

## Getting started

Install dependencies, build the front-end assets, generate the Go templates,
and start the server:

```sh
npm install
npm run assets:build
npm run generate
go run ./cmd/portfolio
```

The site is available at `http://localhost:8080` by default.

The asset build must run before the Go application is compiled because
`web/dist` is embedded into the binary.

For front-end work, run the asset watcher in one terminal and restart the Go
server when required:

```sh
npm run assets:dev
```

Changes to `.templ` files require `npm run generate` before the Go application
is rebuilt.

## Architecture

The project keeps authored content, presentation, and delivery separate:

```text
internal/portfolio/data/ ──> typed Go content models ──> templ views
web/assets/ ───────────────> Vite ──> web/dist/ ───────> embedded static files
                                                    └──> HTTP server
                                                    └──> static exporter
```

| Path                 | Responsibility                                                |
| -------------------- | ------------------------------------------------------------- |
| `cmd/portfolio`      | Runs the HTTP server and application routes.                  |
| `cmd/export`         | Renders the site to a repository-relative output directory.   |
| `cmd/dither`         | Produces two-color ordered-dither PNG images.                 |
| `internal/portfolio` | Loads and validates embedded portfolio content.               |
| `internal/sitepath`  | Normalizes origins, base paths, and internal URLs.            |
| `internal/dither`    | Implements resizing and Bayer ordered dithering.              |
| `web/views`          | Contains `templ` views, Markdown rendering, and view helpers. |
| `web/scripts`        | Contains progressive browser interactions.                    |
| `web/styles`         | Contains the CSS architecture and component styles.           |
| `web/assets`         | Contains source assets copied by Vite.                        |
| `scripts`            | Contains build-time asset utilities.                          |

## Content model

Personal and editorial content is stored outside the templates:

- `internal/portfolio/data/profile.json` contains identity, SEO metadata,
  introduction, career entries, biography, media captions, and contact details.
- `internal/portfolio/data/projects.json` contains the project catalog, media
  metadata, links, technology stacks, and references to case-study documents.
- `internal/portfolio/data/cases/<slug>/` contains one Markdown file for each
  case-study section: `context.md`, `challenge.md`, `decision.md`, and
  `result.md`.

Both JSON files and all case-study documents are embedded into the Go binary.
Project Markdown paths are restricted to the matching project directory and
section filename.

To add a project:

1. Add its entry to `projects.json` with a unique slug and a `#RRGGBB` tone.
2. Add the four Markdown documents under `data/cases/<slug>/`.
3. Add its media to `web/assets/projects/<slug>/` and reference each item from
   the project entry.
4. Select a media item as `media.cover` and generate its carousel cover.

## Development commands

| Command                 | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `npm run assets:dev`    | Rebuilds Vite assets when front-end files change.              |
| `npm run assets:build`  | Creates a production asset bundle in `web/dist`.               |
| `npm run generate`      | Regenerates Go files from all `.templ` sources.                |
| `npm run check`         | Runs TypeScript type checking without emitting files.          |
| `npm run images:covers` | Generates normalized carousel covers.                          |
| `npm run build`         | Builds assets, checks TypeScript, and creates `bin/portfolio`. |
| `npm run site:build`    | Builds and exports the complete static site to `public`.       |

Files ending in `_templ.go` are generated. Edit the corresponding `.templ`
source and run `npm run generate` instead of changing generated files directly.

## Building the server

Generate templates before producing a release build if any `.templ` source has
changed:

```sh
npm run generate
npm run build
./bin/portfolio
```

The server reads `SITE_ORIGIN` to build canonical metadata URLs. It defaults to
`http://localhost:8080`.

## Static export

Build the static site with:

```sh
npm run site:build
```

The exporter writes the home page, every valid project page, static assets, and
a `.nojekyll` file to `public`.

Configuration is available through environment variables or CLI flags:

| Environment variable | CLI flag      | Default                 | Purpose                                                        |
| -------------------- | ------------- | ----------------------- | -------------------------------------------------------------- |
| `SITE_ORIGIN`        | `--origin`    | `http://localhost:8080` | Absolute HTTP(S) origin used in canonical and social metadata. |
| `SITE_BASE_PATH`     | `--base-path` | empty                   | URL prefix for project-site or other subpath deployments.      |
| `SITE_OUTPUT`        | `--output`    | `public`                | Repository-relative export directory.                          |

For a GitHub Pages project site:

```sh
SITE_ORIGIN=https://rosa-gus.github.io \
SITE_BASE_PATH=/portfolio \
npm run site:build
```

The same configuration can be passed as flags:

```sh
npm run site:build -- \
  --origin https://rosa-gus.github.io \
  --base-path /portfolio \
  --output build/site
```

The output path must be relative to the repository and cannot be the repository
root or a symbolic link. The exporter renders into a temporary directory and
then replaces the configured output path after a successful render. Always use
a dedicated output directory because existing contents at that path are
removed.

## Project covers

Carousel covers are generated as 1200×800 WebP files in
`web/assets/projects/carousel/`:

```sh
npm run images:covers
```

The generator resolves each project's selected `media.cover`, normalizes its
orientation and color space, strips metadata, and either contains or crops the
image. It skips a project when its selected cover already points to the expected
carousel output file.

Generate a single cover with custom framing:

```sh
npm run images:covers -- \
  --only mondo-send \
  --fit cover \
  --gravity north
```

Run `npm run images:covers -- --help` for every available option.

## Ordered dithering

The dither command accepts PNG, JPEG, or GIF input and writes a paletted PNG
with transparency plus the configured dark and light colors:

```sh
go run ./cmd/dither \
  -input web/assets/source/portrait.jpg \
  -output web/assets/generated/portrait-960.png \
  -width 960 \
  -matrix 8 \
  -dark '#0a0a09' \
  -light '#fffefa' \
  -contrast 1.08
```

Generate each responsive size from the original image. Do not resize an image
that has already been dithered.

## Verification

Run both test suites before building or exporting:

```sh
go test ./...
npm run check
```

The Go tests cover content loading, path validation, URL handling, Markdown
security policy, rendering, project metadata, carousel media, and dithering.

## Credits

The untreated source footage used to produce `web/assets/fish.mp4` was obtained
from photographer **kampee_p** through [Videezy.com](https://www.videezy.com/).
Credits for the other untreated photographs used in the portfolio are recorded
in their respective media captions in
[`internal/portfolio/data/projects.json`](internal/portfolio/data/projects.json).

## License

Copyright © 2026 Luis Gustavo R.C..

The source code is licensed under the GNU Affero General Public License,
version 3. The AGPL permits use, modification, and commercial or non-commercial
redistribution under its terms, including its source-availability requirements
for modified versions made available over a network. See [`LICENSE.txt`](LICENSE.txt)
for the complete terms.

The source-code license does not grant permission to reuse portfolio copy, case
studies, media, personal identity, or project identities. See
[`CONTENT_NOTICE.md`](CONTENT_NOTICE.md) for the precise scope and the treatment
of third-party materials.

The website exposes the canonical
[source repository](https://github.com/rosa-gus/portfolio) from its contact
panel so network deployments provide a direct path to the corresponding source.
