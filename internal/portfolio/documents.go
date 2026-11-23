package portfolio

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"regexp"
	"strings"
	"unicode/utf8"

	"go.yaml.in/yaml/v4"
)

type DocumentKind string

const (
	DocumentNote    DocumentKind = "note"
	DocumentArticle DocumentKind = "article"
)

type Document struct {
	Slug      string           `json:"slug"`
	Title     string           `json:"title"`
	Author    string           `json:"-"`
	Kind      DocumentKind     `json:"kind"`
	Summary   string           `json:"summary,omitempty"`
	Date      string           `json:"date,omitempty"`
	UpdatedAt string           `json:"updatedAt,omitempty"`
	Metadata  []MetadataEntry  `json:"metadata,omitempty"`
	Content   MarkdownDocument `json:"content"`
}

type articleMetadata struct {
	Title   string `yaml:"title"`
	Author  string `yaml:"author"`
	Date    string `yaml:"date"`
	Summary string `yaml:"summary"`
}

var documentSlugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
var articleMetadataFence = regexp.MustCompile(`(?m)^---[ \t]*\r?(?:\n|$)`)

var Documents = mustLoadDocuments()

func mustLoadDocuments() []Document {
	documents, err := loadDocuments(contentFiles)
	if err != nil {
		panic(err)
	}
	return documents
}

func loadDocuments(files fs.FS) ([]Document, error) {
	catalog, err := fs.ReadFile(files, "data/documents.json")
	if err != nil {
		return nil, fmt.Errorf("read document catalog: %w", err)
	}
	var documents []Document
	if err := json.Unmarshal(catalog, &documents); err != nil {
		return nil, fmt.Errorf("decode document catalog: %w", err)
	}
	seen := make(map[string]bool, len(documents))
	for index := range documents {
		document := &documents[index]
		if !documentSlugPattern.MatchString(document.Slug) || seen[document.Slug] {
			return nil, fmt.Errorf("invalid or duplicate document: %q", document.Slug)
		}
		seen[document.Slug] = true
		if document.Kind != DocumentNote && document.Kind != DocumentArticle {
			return nil, fmt.Errorf("invalid document kind for %q: %q", document.Slug, document.Kind)
		}
		if err := validateDate(document.UpdatedAt); err != nil {
			return nil, fmt.Errorf("invalid document update date for %q: %w", document.Slug, err)
		}
		if err := validateMetadata(document.Metadata); err != nil {
			return nil, fmt.Errorf("invalid metadata for document %q: %w", document.Slug, err)
		}
		expected := "documents/" + document.Slug + ".md"
		if document.Content.Path != expected {
			return nil, fmt.Errorf("invalid Markdown path for %q: expected %q", document.Slug, expected)
		}
		source, err := fs.ReadFile(files, "data/"+expected)
		if err != nil {
			return nil, fmt.Errorf("read document %q: %w", document.Slug, err)
		}
		if !utf8.Valid(source) {
			return nil, fmt.Errorf("invalid UTF-8 in Markdown for %q", document.Slug)
		}
		document.Content.Source = string(source)
		if document.Kind == DocumentArticle {
			if err := loadArticleMetadata(document); err != nil {
				return nil, fmt.Errorf("article %q: %w", document.Slug, err)
			}
		}
		if strings.TrimSpace(document.Title) == "" {
			return nil, fmt.Errorf("missing document title for %q", document.Slug)
		}
		if err := validateDate(document.Date); err != nil {
			return nil, fmt.Errorf("invalid document date for %q: %w", document.Slug, err)
		}
		if strings.TrimSpace(document.Content.Source) == "" {
			return nil, fmt.Errorf("empty Markdown for %q", document.Slug)
		}
	}
	return documents, nil
}

func loadArticleMetadata(document *Document) error {
	source := strings.TrimPrefix(document.Content.Source, "\uFEFF")
	opening := articleMetadataFence.FindStringIndex(source)
	if opening == nil || opening[0] != 0 {
		if strings.TrimSpace(document.Title) != "" {
			return nil // Legacy articles can still use catalog metadata.
		}
		return fmt.Errorf("missing YAML front matter")
	}
	source = source[opening[1]:]
	closing := articleMetadataFence.FindStringIndex(source)
	if closing == nil {
		return fmt.Errorf("unclosed YAML front matter")
	}
	var metadata articleMetadata
	if err := yaml.Load([]byte(source[:closing[0]]), &metadata, yaml.WithKnownFields()); err != nil {
		return fmt.Errorf("invalid YAML front matter: %w", err)
	}
	document.Title = strings.TrimSpace(metadata.Title)
	document.Author = strings.TrimSpace(metadata.Author)
	document.Date = strings.TrimSpace(metadata.Date)
	document.Summary = strings.TrimSpace(metadata.Summary)
	document.Content.Source = source[closing[1]:]
	return nil
}

func (document Document) ReadingMinutes() int {
	return max(1, (len(strings.Fields(document.Content.Source))+199)/200)
}

func FindArticle(slug string) (Document, bool) {
	for _, document := range Documents {
		if document.Kind == DocumentArticle && document.Slug == slug {
			return document, true
		}
	}
	return Document{}, false
}
