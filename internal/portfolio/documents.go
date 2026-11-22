package portfolio

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"regexp"
	"strings"
	"unicode/utf8"
)

type DocumentKind string

const (
	DocumentNote    DocumentKind = "note"
	DocumentArticle DocumentKind = "article"
)

type Document struct {
	Slug      string           `json:"slug"`
	Title     string           `json:"title"`
	Kind      DocumentKind     `json:"kind"`
	Summary   string           `json:"summary,omitempty"`
	Date      string           `json:"date,omitempty"`
	UpdatedAt string           `json:"updatedAt,omitempty"`
	Metadata  []MetadataEntry  `json:"metadata,omitempty"`
	Content   MarkdownDocument `json:"content"`
}

var documentSlugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

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
		if !documentSlugPattern.MatchString(document.Slug) || strings.TrimSpace(document.Title) == "" || seen[document.Slug] {
			return nil, fmt.Errorf("invalid or duplicate document: %q", document.Slug)
		}
		seen[document.Slug] = true
		if document.Kind != DocumentNote && document.Kind != DocumentArticle {
			return nil, fmt.Errorf("invalid document kind for %q: %q", document.Slug, document.Kind)
		}
		if err := validateDate(document.Date); err != nil {
			return nil, fmt.Errorf("invalid document date for %q: %w", document.Slug, err)
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
		if !utf8.Valid(source) || strings.TrimSpace(string(source)) == "" {
			return nil, fmt.Errorf("empty or invalid Markdown for %q", document.Slug)
		}
		document.Content.Source = string(source)
	}
	return documents, nil
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
