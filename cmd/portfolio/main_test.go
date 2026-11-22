package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSkiSpritesAreServedFromEmbeddedAssets(t *testing.T) {
	handler := newHandler("https://example.com")
	sprites := map[string][2]int{
		"skier-down": {24, 32}, "skier-left": {24, 32}, "skier-right": {24, 32},
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
