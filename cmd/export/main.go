package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/a-h/templ"
	"portfolio/internal/portfolio"
	"portfolio/internal/sitepath"
	"portfolio/web"
	"portfolio/web/views"
)

type config struct {
	origin   string
	basePath string
	output   string
}

func main() {
	cfg := config{}
	flag.StringVar(&cfg.origin, "origin", envOrDefault("SITE_ORIGIN", "http://localhost:8080"), "public site origin, for example https://rosa-gus.github.io")
	flag.StringVar(&cfg.basePath, "base-path", os.Getenv("SITE_BASE_PATH"), "public URL prefix, for example /portfolio")
	flag.StringVar(&cfg.output, "output", envOrDefault("SITE_OUTPUT", "public"), "output directory inside the project")
	flag.Parse()

	origin, err := sitepath.NormalizeOrigin(cfg.origin)
	if err != nil {
		log.Fatal(err)
	}
	cfg.origin = origin

	basePath, err := sitepath.Normalize(cfg.basePath)
	if err != nil {
		log.Fatal(err)
	}
	cfg.basePath = basePath

	output, err := exportSite(context.Background(), cfg)
	if err != nil {
		log.Fatal(err)
	}

	displayBasePath := cfg.basePath
	if displayBasePath == "" {
		displayBasePath = "/"
	}
	log.Printf("static site exported to %s (base path: %s)", output, displayBasePath)
}

func exportSite(ctx context.Context, cfg config) (string, error) {
	output, err := outputPath(cfg.output)
	if err != nil {
		return "", err
	}

	parent := filepath.Dir(output)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return "", fmt.Errorf("create output directory: %w", err)
	}

	temporary, err := os.MkdirTemp(parent, ".portfolio-export-")
	if err != nil {
		return "", fmt.Errorf("create temporary directory: %w", err)
	}
	defer os.RemoveAll(temporary)

	if err := copyStatic(web.Static(), temporary); err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(temporary, ".nojekyll"), nil, 0o644); err != nil {
		return "", fmt.Errorf("create .nojekyll: %w", err)
	}
	publicURL := sitepath.PublicURL(cfg.origin, cfg.basePath)
	if err := renderPage(ctx, filepath.Join(temporary, "index.html"), views.Home(portfolio.Profile, portfolio.Projects, cfg.basePath, publicURL)); err != nil {
		return "", err
	}

	for _, project := range portfolio.Projects {
		if project.Slug == "" || project.Title == "" {
			continue
		}
		if err := validateSlug(project.Slug); err != nil {
			return "", err
		}
		projectFile := filepath.Join(temporary, "case", project.Slug, "index.html")
		if err := renderPage(ctx, projectFile, views.ProjectPage(portfolio.Profile, project, cfg.basePath, publicURL)); err != nil {
			return "", err
		}
	}

	if info, err := os.Lstat(output); err == nil {
		if info.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("output directory %q cannot be a symbolic link", cfg.output)
		}
		if err := os.RemoveAll(output); err != nil {
			return "", fmt.Errorf("replace output directory: %w", err)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("inspect output directory: %w", err)
	}

	if err := os.Rename(temporary, output); err != nil {
		return "", fmt.Errorf("finalize export: %w", err)
	}

	return output, nil
}

func outputPath(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || !filepath.IsLocal(raw) {
		return "", fmt.Errorf("output directory %q must be a local path within the project", raw)
	}

	clean := filepath.Clean(raw)
	if clean == "." {
		return "", fmt.Errorf("output directory cannot be the project root")
	}

	workingDirectory, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("identify project directory: %w", err)
	}
	return filepath.Join(workingDirectory, clean), nil
}

func copyStatic(source fs.FS, destination string) error {
	return fs.WalkDir(source, ".", func(name string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if name == "." {
			return nil
		}

		target := filepath.Join(destination, filepath.FromSlash(name))
		if entry.IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return fmt.Errorf("create static directory %q: %w", name, err)
			}
			return nil
		}

		if err := copyFile(source, name, target); err != nil {
			return err
		}
		return nil
	})
}

func copyFile(source fs.FS, name, target string) error {
	input, err := source.Open(name)
	if err != nil {
		return fmt.Errorf("open static file %q: %w", name, err)
	}

	output, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		input.Close()
		return fmt.Errorf("create static file %q: %w", name, err)
	}

	_, copyErr := io.Copy(output, input)
	inputCloseErr := input.Close()
	outputCloseErr := output.Close()
	if copyErr != nil {
		return fmt.Errorf("copy static file %q: %w", name, copyErr)
	}
	if inputCloseErr != nil {
		return fmt.Errorf("close static source %q: %w", name, inputCloseErr)
	}
	if outputCloseErr != nil {
		return fmt.Errorf("close static file %q: %w", name, outputCloseErr)
	}
	return nil
}

func renderPage(ctx context.Context, filename string, component templ.Component) error {
	if err := os.MkdirAll(filepath.Dir(filename), 0o755); err != nil {
		return fmt.Errorf("create page directory %q: %w", filename, err)
	}

	file, err := os.OpenFile(filename, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("create page %q: %w", filename, err)
	}

	renderErr := component.Render(ctx, file)
	closeErr := file.Close()
	if renderErr != nil {
		return fmt.Errorf("render page %q: %w", filename, renderErr)
	}
	if closeErr != nil {
		return fmt.Errorf("close page %q: %w", filename, closeErr)
	}
	return nil
}

func validateSlug(slug string) error {
	if !filepath.IsLocal(slug) || filepath.Base(slug) != slug || slug == "." {
		return fmt.Errorf("invalid project slug for export: %q", slug)
	}
	return nil
}

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
