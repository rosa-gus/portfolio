# rosa gus Portolio

A Portuguese-language software engineering portfolio built with Go, `templ`,
TypeScript, and Vite. The same application can run as an HTTP server or export
the home page and project case studies as a static site.

## Features

- Responsive project archive with draggable folders and progressive TypeScript enhancements.
- Dedicated case-study pages backed by JSON and Markdown content.
- Embedded profile, project, and static assets in a self-contained Go binary.
- Safe Markdown link handling for internal, external, and email links.
- Static export with canonical URLs and support for subpath deployments.
- Offline project cover preparation with Bayer 4×4 duotone dithering.

## Requirements

- Go 1.26 or newer.
- Node.js 20.19 or newer, or Node.js 22.12 or newer.
- npm.
- Python 3.10 or newer and Pillow 10–12, for image dimensions during builds and for preparing project covers.

## Getting started

Install dependencies, build the front-end assets, generate the Go templates,
and start the server:

```sh
npm install
python3 -m pip install -r tools/requirements.txt
npm run assets:build
npm run generate
go run ./cmd/portfolio
```

The site is available at `http://localhost:8080` by default.

The asset build must run before the Go application is compiled because
`web/dist` and the generated image dimensions are embedded into the binary.

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
| `internal/portfolio` | Loads and validates embedded portfolio content.               |
| `internal/sitepath`  | Normalizes origins, base paths, and internal URLs.            |
| `web/views`          | Contains `templ` views, Markdown rendering, and view helpers. |
| `web/scripts`        | Contains progressive browser interactions.                    |
| `web/styles`         | Contains the CSS architecture and component styles.           |
| `web/assets`         | Contains source assets copied by Vite.                        |
| `tools/dither.py`    | Prepares project covers and other offline image assets.       |

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
4. Select a media item as `media.cover` and generate its archive cover.

Image dimensions are extracted automatically from gallery files and archive covers during `npm run assets:build` (also included in `build` and `site:build`). Do not add `width` or `height` to `projects.json`. The generated `internal/portfolio/data/image-dimensions.json` is ignored by Git; rebuild assets after replacing images. Missing or invalid images fail the build.

## Development commands

| Command                                             | Purpose                                                        |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `npm run assets:dev`                                | Rebuilds Vite assets when front-end files change.              |
| `npm run assets:build`                              | Creates a production asset bundle in `web/dist` and extracts project image dimensions.               |
| `npm run generate`                                  | Regenerates Go files from all `.templ` sources.                |
| `npm run check`                                     | Runs TypeScript type checking without emitting files.          |
| `npm run images:covers -- <input> <output> --cover` | Prepares one dithered project cover.                           |
| `npm run build`                                     | Builds assets, checks TypeScript, generates templates, and creates `bin/portfolio`. |
| `npm run site:build`                                | Builds and exports the complete static site to `public`.       |

Files ending in `_templ.go` are generated and ignored by Git. Edit the
corresponding `.templ` source and run `npm run generate` during development.

## Building the server

The release build generates templates automatically:

```sh
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

## About video

The About section uses `about-reticula.webm`, prepared from `web/assets/about.mp4`
at its native 1920×1080 and 24 fps. The `black` profile removes dark background
haze without blur and retains Rosa-reticle screening on the fish and highlights.
VP9 at CRF 18 balances size and screening detail. Delivery is grayscale,
with black shadows and white highlights. The source is preserved. The video loads when About plays; the still remains visible during
loading and for reduced motion.

To reproduce (requires FFmpeg with `libvpx-vp9` and Pillow):

```sh
job_dir=$(mktemp -d /tmp/rosa-about.XXXXXX)
python3 tools/rosa_reticula_video.py \
  web/assets/about.mp4 "$job_dir/about-reticula.webm" \
  --work-dir "$job_dir/frames" \
  --profile black --width 1920 --fps 24 \
  --shadow '#000000' --highlight '#ffffff' \
  --preset vp9 --crf 18 --encoder-speed 4
```

Use a fresh work directory and output path. Copy the resulting WebM and
`about-reticula-poster.webp` to `web/assets/`. The poster is extracted from the
**last decoded frame of the delivered video** and saved as lossless WebP,
without resizing or additional treatment. The JSON manifest records the
parameters and checksums; it is a preparation artifact.

At viewport widths up to 620 px, the page selects a separate 640×360 video
and its final-frame poster. Generate this directly from the untreated original:
the exporter scales before applying the reticle, preserving its pixel pattern.
Do not resize the finished desktop video to create the mobile version.

```sh
job_dir=$(mktemp -d /tmp/rosa-about-mobile.XXXXXX)
python3 tools/rosa_reticula_video.py \
  web/assets/about.mp4 "$job_dir/about-reticula-mobile.webm" \
  --work-dir "$job_dir/frames" \
  --profile black --width 640 --fps 24 \
  --shadow '#000000' --highlight '#ffffff' \
  --preset vp9 --crf 18 --encoder-speed 4 \
&& cp \
  "$job_dir/about-reticula-mobile.webm" \
  "$job_dir/about-reticula-mobile-poster.webp" \
  "$job_dir/about-reticula-mobile.json" \
  web/assets/
```

Rebuild assets after generating either version. The mobile source is listed
first with a media condition; the desktop source remains the fallback.

## Project covers

Archive covers are 1200×800 WebP files in `web/assets/projects/covers/`, named
`<project-slug>.webp`. Several selected `media.cover` items in
`internal/portfolio/data/projects.json` also reference those files. Prepare
each cover from its untreated source image. Keep that source separately; the
files in `covers/` are finished assets. Install Pillow before using the tool:

```sh
python3 -m pip install 'Pillow>=10,<13'
```

For example, to prepare the Jaci UI cover from an untreated photograph:

```sh
npm run images:covers -- \
  path/to/jaci-original.jpg web/assets/projects/covers/jaci-ui.webp \
  --cover --shadow '#000000' --highlight '#577142' \
  --levels 8 --strength 0.35 --contrast 1.1
```

`tools/dither.py` corrects EXIF orientation, composites transparency over the
shadow color, frames the image at 3:2, then applies the Timbre Palette Bayer 4×4
duotone treatment. `--fit cover` crops around the center by default;
`--focus-x` and `--focus-y` move that position from 0 to 1. `--fit contain`
preserves the full image and pads it with the shadow color. Cover framing can
enlarge a small input to 1200×800. The lossless WebP has no source metadata,
and an existing output is never overwritten. Choose another output path or
remove the old asset explicitly when replacing a cover. The tool prepares one
cover per invocation and does not edit `projects.json`. If the selected media
item should use the treated cover in the case study too, set its `src`, `width`,
and `height` to the resulting path, 1200, and 800.

The original PNG and WebM modes remain available. Run
`npm run images:covers -- --help` for all treatment parameters, including
`--gamma`. The [Timbre Palette tool documentation](https://github.com/rosa-gus/timbre-palette/blob/main/src/palette_api/tools/README.md)
describes the source treatment behavior.

## Verification

Run both test suites before building or exporting:

```sh
go test ./...
npm run check
```

The Go tests cover content loading, path validation, URL handling, Markdown
security policy, rendering, project metadata, and project covers.

## Credits

The original About video (`web/assets/about.mp4`) is by
[brixiv on Pexels](https://www.pexels.com/@brixiv/).
The original photograph used for the favicon is by
[Diane Helentjaris](https://unsplash.com/@dhelentjaris).
Credits for the other untreated photographs used in the portfolio are recorded
in each project's `media.coverCredit` object in
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
