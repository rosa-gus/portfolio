package sitepath

import (
	"fmt"
	"net/url"
	"path"
	"strings"
)

// NormalizeOrigin validates an HTTP(S) origin and removes its trailing slash.
func NormalizeOrigin(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", fmt.Errorf("public origin %q must be an absolute HTTP(S) URL", raw)
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Path != "" && parsed.Path != "/") {
		return "", fmt.Errorf("public origin %q must not contain credentials, a path, query, or fragment", raw)
	}

	parsed.Path = ""
	parsed.RawPath = ""
	return parsed.String(), nil
}

// Normalize returns a URL path prefix without a trailing slash. Both
// "portfolio" and "/portfolio/" become "/portfolio"; the site root becomes
// an empty prefix.
func Normalize(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "/" {
		return "", nil
	}
	if strings.ContainsAny(raw, "?#\\") || strings.Contains(raw, "://") {
		return "", fmt.Errorf("base path %q must contain only path segments", raw)
	}

	trimmed := strings.Trim(raw, "/")
	for _, segment := range strings.Split(trimmed, "/") {
		if segment == "" || segment == "." || segment == ".." {
			return "", fmt.Errorf("base path %q contains an invalid segment", raw)
		}
	}

	return path.Clean("/" + trimmed), nil
}

// Resolve prefixes root-relative internal URLs while leaving relative and
// external URLs untouched.
func Resolve(basePath, target string) string {
	if !strings.HasPrefix(target, "/") || strings.HasPrefix(target, "//") {
		return target
	}
	return basePath + target
}

// PublicURL combines a normalized origin and base path into the canonical site
// URL, without a trailing slash.
func PublicURL(origin, basePath string) string {
	return origin + basePath
}
