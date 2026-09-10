package web

import (
	"io/fs"
	"regexp"
	"strings"
	"testing"
)

func TestAssetsResolveHashedViteEntry(t *testing.T) {
	t.Parallel()

	resolved := Assets()
	assertHashedAsset(t, resolved.Script, `^/assets/app-[A-Za-z0-9_-]+\.js$`)
	if len(resolved.Stylesheets) == 0 {
		t.Fatal("Assets().Stylesheets is empty")
	}
	for _, stylesheet := range resolved.Stylesheets {
		assertHashedAsset(t, stylesheet, `^/assets/app-[A-Za-z0-9_-]+\.css$`)
	}
}

func TestAssetsReturnsAStylesheetCopy(t *testing.T) {
	t.Parallel()

	first := Assets()
	first.Stylesheets[0] = "/changed.css"

	if got := Assets().Stylesheets[0]; got == "/changed.css" {
		t.Fatal("Assets() exposed its internal stylesheet slice")
	}
}

func assertHashedAsset(t *testing.T, asset, pattern string) {
	t.Helper()

	if !regexp.MustCompile(pattern).MatchString(asset) {
		t.Errorf("asset %q does not match %q", asset, pattern)
	}
	if _, err := fs.Stat(Static(), strings.TrimPrefix(asset, "/")); err != nil {
		t.Errorf("resolved asset %q is not embedded: %v", asset, err)
	}
}
