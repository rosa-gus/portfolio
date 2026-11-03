# Luis Gustavo R.C. / Portfólio

A Portuguese-language software engineering portfolio built with Go, `templ`,
TypeScript, and Vite. Runs as an HTTP server or exports to a static site,
with an interactive project archive and dedicated case studies.

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

## Structure and content

| Path | Contents |
| --- | --- |
| `cmd/portfolio`, `cmd/export` | HTTP server and static exporter. |
| `internal/portfolio/data/profile.json` | Identity, metadata, biography, career, and contact. |
| `internal/portfolio/data/projects.json` | Projects, technologies, media, and links. |
| `internal/portfolio/data/cases/<slug>/` | Markdown case studies. |
| `internal/sitepath` | Origin, base-path, and URL handling. |
| `web/views`, `web/scripts`, `web/styles` | Templates, interactions, and styles. |
| `web/assets` | Source assets bundled by Vite. |

To add a project, create an entry in `projects.json` with a unique slug and
`#RRGGBB` tone, add `context.md`, `challenge.md`, `decision.md`, and `result.md`
under its case directory, and reference its assets from `web/assets/projects/`.
Select a media item as `media.cover`.

Image dimensions are generated automatically; do not add `width` or `height`
to `projects.json`. Rebuild assets after replacing images.

Set `introduction.showAvailability` in `profile.json` to `false` to hide the
availability message, or `true` to show `introduction.availability`.
Content is embedded, so rebuild the server or static site after editing it.

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

## Credits

- About video: [brixiv / Pexels](https://www.pexels.com/@brixiv/).
- Favicon source photograph: [Diane Helentjaris / Unsplash](https://unsplash.com/@dhelentjaris).
- Project photograph credits: `media.coverCredit` in [projects.json](internal/portfolio/data/projects.json).

## License

Copyright © 2026 Luis Gustavo R.C.

Source code: [GNU AGPL v3](LICENSE.txt).
Portfolio copy, case studies, media, and identities have separate terms;
see [CONTENT_NOTICE.md](CONTENT_NOTICE.md).

The contact panel links to the [source repository](https://github.com/rosa-gus/portfolio).
