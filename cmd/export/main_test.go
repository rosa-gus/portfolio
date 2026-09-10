package main

import (
	"errors"
	"io/fs"
	"os"
	"testing"
	"testing/fstest"

	"portfolio/web"
)

func TestCopyStaticDoesNotPublishViteManifest(t *testing.T) {
	t.Parallel()

	source := fstest.MapFS{
		web.AssetManifestFilename: {Data: []byte(`{"entry":{"isEntry":true}}`)},
		"assets/app-hash.js":      {Data: []byte("export {}")},
	}
	destination := t.TempDir()
	if err := copyStatic(source, destination); err != nil {
		t.Fatalf("copyStatic() returned an error: %v", err)
	}

	output := os.DirFS(destination)
	if _, err := fs.Stat(output, web.AssetManifestFilename); err == nil {
		t.Fatal("copyStatic() published the internal Vite manifest")
	} else if !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("stat manifest: %v", err)
	}
	if _, err := fs.Stat(output, "assets/app-hash.js"); err != nil {
		t.Fatalf("copied asset is missing: %v", err)
	}
}
