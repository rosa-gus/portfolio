package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"portfolio/internal/portfolio"
)

func TestArticleRoutesAcceptTrailingSlash(t *testing.T) {
	documents := portfolio.Documents
	portfolio.Documents = append(documents, portfolio.Document{
		Slug: "article-route-test", Title: "Article route test", Kind: portfolio.DocumentArticle,
		Content: portfolio.MarkdownDocument{Source: "Example article body."},
	})
	t.Cleanup(func() { portfolio.Documents = documents })

	handler := newHandler("https://example.com")
	path := "/article/article-route-test"
	for _, test := range []struct {
		path     string
		status   int
		location string
	}{
		{path, http.StatusOK, ""},
		{path + "/", http.StatusPermanentRedirect, path},
		{path + "/?ref=preview", http.StatusPermanentRedirect, path + "?ref=preview"},
		{"/article/boas-vindas/", http.StatusNotFound, ""},
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
			if test.status == http.StatusOK && !strings.Contains(response.Body.String(), "Example article body.") {
				t.Error("response does not contain the article body")
			}
		})
	}
}

func TestSkiSpritesAreServedFromEmbeddedAssets(t *testing.T) {
	handler := newHandler("https://example.com")
	sprites := map[string][2]int{
		"skier-front": {24, 32}, "skier-left": {24, 32}, "skier-right": {24, 32},
		"pine": {24, 32}, "rock": {24, 16}, "tracks": {24, 32},
		"yeti-idle": {28, 32}, "yeti-run-01": {28, 32}, "yeti-run-02": {28, 32},
	}
	for _, theme := range []string{"light", "dark"} {
		for name, dimensions := range sprites {
			path := fmt.Sprintf("/ski/sprites/%s/%s.png", theme, name)
			t.Run(path, func(t *testing.T) {
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
				if response.Code != http.StatusOK {
					t.Fatalf("GET %s: status %d", path, response.Code)
				}
				if got := response.Header().Get("Content-Type"); !strings.HasPrefix(got, "image/png") {
					t.Fatalf("Content-Type = %q, want image/png", got)
				}
				body := response.Body.Bytes()
				if len(body) < 24 || !bytes.Equal(body[:8], []byte("\x89PNG\r\n\x1a\n")) {
					t.Fatal("response does not contain a PNG header")
				}
				width, height := binary.BigEndian.Uint32(body[16:20]), binary.BigEndian.Uint32(body[20:24])
				if int(width) != dimensions[0] || int(height) != dimensions[1] {
					t.Errorf("sprite size = %dx%d, want %dx%d", width, height, dimensions[0], dimensions[1])
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
