package portfolio

import (
	"encoding/json"
	"fmt"
	"io/fs"
)

type App struct {
	Slug        string          `json:"slug"`
	PublishedAt string          `json:"publishedAt,omitempty"`
	Version     string          `json:"version,omitempty"`
	SourcePath  string          `json:"sourcePath,omitempty"`
	License     string          `json:"license,omitempty"`
	Credits     []MetadataEntry `json:"credits,omitempty"`
	Metadata    []MetadataEntry `json:"metadata,omitempty"`
}

var apps = mustLoadApps()

func AppBySlug(slug string) App {
	return apps[slug]
}

func mustLoadApps() map[string]App {
	apps, err := loadApps(contentFiles)
	if err != nil {
		panic(err)
	}
	return apps
}

func loadApps(files fs.FS) (map[string]App, error) {
	source, err := fs.ReadFile(files, "data/apps.json")
	if err != nil {
		return nil, fmt.Errorf("read app catalog: %w", err)
	}
	var entries []App
	if err := json.Unmarshal(source, &entries); err != nil {
		return nil, fmt.Errorf("decode app catalog: %w", err)
	}
	apps := make(map[string]App, len(entries))
	for _, app := range entries {
		if _, exists := apps[app.Slug]; exists || !documentSlugPattern.MatchString(app.Slug) {
			return nil, fmt.Errorf("invalid or duplicate app: %q", app.Slug)
		}
		if err := validateDate(app.PublishedAt); err != nil {
			return nil, fmt.Errorf("invalid app publication date for %q: %w", app.Slug, err)
		}
		if app.SourcePath != "" && (app.SourcePath == "." || !fs.ValidPath(app.SourcePath)) {
			return nil, fmt.Errorf("invalid app source path for %q: %q", app.Slug, app.SourcePath)
		}
		if err := validateMetadata(app.Metadata); err != nil {
			return nil, fmt.Errorf("invalid metadata for app %q: %w", app.Slug, err)
		}
		if err := validateMetadata(app.Credits); err != nil {
			return nil, fmt.Errorf("invalid credits for app %q: %w", app.Slug, err)
		}
		apps[app.Slug] = app
	}
	return apps, nil
}
