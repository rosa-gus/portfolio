package main

import (
	"bytes"
	"image/png"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"portfolio/internal/portfolio"
)

func TestArticleRoutesAcceptTrailingSlash(t *testing.T) {
	documents := portfolio.Documents
	t.Cleanup(func() { portfolio.Documents = documents })
	article := portfolio.Document{
		Slug: "article-route-test", Title: "Article route test", Kind: portfolio.DocumentArticle,
		Content: portfolio.MarkdownDocument{Source: "Example article body."},
	}
	note := portfolio.Document{Slug: "note-route-test", Title: "Note route test", Kind: portfolio.DocumentNote}
	portfolio.Documents = []portfolio.Document{article, note}

	handler := newHandler("https://example.com")
	path := "/article/" + article.Slug
	for _, test := range []struct {
		path     string
		status   int
		location string
	}{
		{path, http.StatusOK, ""},
		{path + "/", http.StatusPermanentRedirect, path},
		{path + "/?ref=preview", http.StatusPermanentRedirect, path + "?ref=preview"},
		{"/article/" + note.Slug + "/", http.StatusNotFound, ""},
		{path + "/nested", http.StatusNotFound, ""},
	} {
		t.Run(test.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, test.path, nil))
			if response.Code != test.status {
				t.Fatalf("status = %d, want %d", response.Code, test.status)
			}
			if got := response.Header().Get("Location"); got != test.location {
				t.Errorf("Location = %q, want %q", got, test.location)
			}
			if test.status == http.StatusOK && !strings.Contains(response.Body.String(), article.Content.Source) {
				t.Error("response does not contain the article body")
			}
		})
	}
}

func TestSkiSpritesAreServedFromEmbeddedAssets(t *testing.T) {
	handler := newHandler("https://example.com")
	assets := os.DirFS("../../web/assets")
	for _, theme := range []string{"light", "dark"} {
		sprites, err := fs.Glob(assets, "ski/sprites/"+theme+"/*.png")
		if err != nil {
			t.Fatal(err)
		}
		if len(sprites) == 0 {
			t.Fatalf("no Ski sprites found for theme %q", theme)
		}
		for _, sprite := range sprites {
			path := "/" + sprite
			t.Run(path, func(t *testing.T) {
				expected, err := fs.ReadFile(assets, sprite)
				if err != nil {
					t.Fatal(err)
				}
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
				if response.Code != http.StatusOK {
					t.Fatalf("GET %s: status %d", path, response.Code)
				}
				if got := response.Header().Get("Content-Type"); !strings.HasPrefix(got, "image/png") {
					t.Fatalf("Content-Type = %q, want image/png", got)
				}
				body := response.Body.Bytes()
				if _, err := png.Decode(bytes.NewReader(body)); err != nil {
					t.Fatalf("response is not a valid PNG: %v", err)
				}
				if !bytes.Equal(body, expected) {
					t.Error("served sprite differs from the source asset")
				}
			})
		}
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/ski/sprites/light/missing.png", nil))
	if response.Code != http.StatusNotFound {
		t.Errorf("missing sprite status = %d, want 404", response.Code)
	}
}
