package portfolio

import (
	"encoding/json"
	"strings"
	"testing"
	"testing/fstest"
)

func documentFiles(t *testing.T, documents []Document) fstest.MapFS {
	t.Helper()
	entries := make([]map[string]string, 0, len(documents))
	for _, document := range documents {
		entries = append(entries, map[string]string{
			"slug": document.Slug, "title": document.Title, "kind": string(document.Kind),
			"date": document.Date, "content": document.Content.Path,
		})
	}
	catalog, err := json.Marshal(entries)
	if err != nil {
		t.Fatal(err)
	}
	files := fstest.MapFS{"data/documents.json": {Data: catalog}}
	for _, document := range documents {
		files["data/"+document.Content.Path] = &fstest.MapFile{Data: []byte("Texto com **Markdown**.")}
	}
	return files
}

func TestDocumentsLoadNotesAndArticles(t *testing.T) {
	documents := []Document{
		{Slug: "nota", Title: "Nota", Kind: DocumentNote, Content: MarkdownDocument{Path: "documents/nota.md"}},
		{Slug: "artigo", Title: "Artigo", Kind: DocumentArticle, Date: "2026-11-18", Content: MarkdownDocument{Path: "documents/artigo.md"}},
	}
	loaded, err := loadDocuments(documentFiles(t, documents))
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded) != 2 || loaded[0].Kind != DocumentNote || loaded[1].Kind != DocumentArticle {
		t.Fatalf("unexpected catalog: %+v", loaded)
	}
	if loaded[1].Content.Source != "Texto com **Markdown**." {
		t.Fatalf("Markdown was not loaded: %q", loaded[1].Content.Source)
	}
}

func TestDocumentsRejectInvalidCatalogEntries(t *testing.T) {
	valid := Document{Slug: "nota", Title: "Nota", Kind: DocumentNote, Content: MarkdownDocument{Path: "documents/nota.md"}}
	for _, name := range []string{"kind", "slug", "title", "path", "date", "duplicate"} {
		t.Run(name, func(t *testing.T) {
			document := valid
			switch name {
			case "kind":
				document.Kind = "unknown"
			case "slug":
				document.Slug = "../private"
			case "title":
				document.Title = " "
			case "path":
				document.Content.Path = "../private.md"
			case "date":
				document.Date = "2026-02-31"
			}
			documents := []Document{document}
			if name == "duplicate" {
				documents = append(documents, document)
			}
			if _, err := loadDocuments(documentFiles(t, documents)); err == nil {
				t.Fatal("expected an invalid catalog error")
			}
		})
	}
}

func TestArticleFrontMatter(t *testing.T) {
	document := Document{Slug: "artigo", Kind: DocumentArticle, Content: MarkdownDocument{Path: "documents/artigo.md"}}
	files := documentFiles(t, []Document{document})
	body := strings.Repeat("palavra ", 200) + "\r\n"
	files["data/documents/artigo.md"].Data = []byte("\uFEFF---\r\ntitle: 'Artigo: uma releitura'\r\nauthor: Rosa Gus\r\ndate: 2026-11-18\r\nsummary: Uma breve descrição.\r\n---\r\n" + body)

	documents, err := loadDocuments(files)
	if err != nil {
		t.Fatal(err)
	}
	got := documents[0]
	if got.Title != "Artigo: uma releitura" || got.Author != "Rosa Gus" || got.Date != "2026-11-18" || got.Summary != "Uma breve descrição." {
		t.Fatalf("unexpected front matter: %+v", got)
	}
	if got.Content.Source != body || got.ReadingMinutes() != 1 {
		t.Fatalf("front matter affected the body or reading time: %q", got.Content.Source)
	}
}

func TestArticleRejectsInvalidFrontMatter(t *testing.T) {
	document := Document{Slug: "artigo", Kind: DocumentArticle, Content: MarkdownDocument{Path: "documents/artigo.md"}}
	for _, test := range []struct{ name, source string }{
		{"missing", "Texto."},
		{"unclosed", "---\ntitle: Artigo\nTexto."},
		{"unknown field", "---\ntitle: Artigo\nauthorr: Rosa Gus\n---\nTexto."},
		{"missing title", "---\nauthor: Rosa Gus\n---\nTexto."},
		{"invalid date", "---\ntitle: Artigo\ndate: 2026-02-31\n---\nTexto."},
		{"empty body", "---\ntitle: Artigo\n---\n"},
	} {
		t.Run(test.name, func(t *testing.T) {
			files := documentFiles(t, []Document{document})
			files["data/documents/artigo.md"].Data = []byte(test.source)
			if _, err := loadDocuments(files); err == nil || !strings.Contains(err.Error(), document.Slug) {
				t.Fatalf("expected a validation error for %s, got %v", document.Slug, err)
			}
		})
	}
}

func TestDocumentsRequireReadableNonemptyMarkdown(t *testing.T) {
	document := Document{Slug: "nota", Title: "Nota", Kind: DocumentNote, Content: MarkdownDocument{Path: "documents/nota.md"}}
	for _, source := range [][]byte{nil, []byte("   "), {0xff}} {
		files := documentFiles(t, []Document{document})
		files["data/documents/nota.md"].Data = source
		if _, err := loadDocuments(files); err == nil {
			t.Fatal("expected an invalid Markdown error")
		}
	}
	files := documentFiles(t, []Document{document})
	delete(files, "data/documents/nota.md")
	if _, err := loadDocuments(files); err == nil {
		t.Fatal("expected a missing Markdown error")
	}
}

func TestDocumentReadingMinutes(t *testing.T) {
	for _, test := range []struct{ words, minutes int }{{0, 1}, {1, 1}, {200, 1}, {201, 2}, {400, 2}, {401, 3}} {
		document := Document{Content: MarkdownDocument{Source: strings.Repeat("palavra ", test.words)}}
		if got := document.ReadingMinutes(); got != test.minutes {
			t.Errorf("%d words: got %d minutes, want %d", test.words, got, test.minutes)
		}
	}
}

func TestArticleLookupDoesNotExposeWelcomeNote(t *testing.T) {
	if _, ok := FindArticle("boas-vindas"); ok {
		t.Fatal("notes must not be exposed as article pages")
	}
}
