package sitepath

import "testing"

func TestNormalizeOrigin(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "http", input: "http://localhost:8080", want: "http://localhost:8080"},
		{name: "trailing slash", input: "https://rosa-gus.github.io/", want: "https://rosa-gus.github.io"},
		{name: "path", input: "https://example.com/portfolio", wantErr: true},
		{name: "relative", input: "example.com", wantErr: true},
		{name: "query", input: "https://example.com?preview=1", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, err := NormalizeOrigin(tt.input)
			if (err != nil) != tt.wantErr {
				t.Fatalf("NormalizeOrigin(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("NormalizeOrigin(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestNormalize(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "empty", input: "", want: ""},
		{name: "root", input: "/", want: ""},
		{name: "name", input: "portfolio", want: "/portfolio"},
		{name: "slashes", input: "/portfolio/", want: "/portfolio"},
		{name: "nested", input: "/sites/portfolio", want: "/sites/portfolio"},
		{name: "parent segment", input: "/portfolio/../outro", wantErr: true},
		{name: "query", input: "/portfolio?preview=1", wantErr: true},
		{name: "url", input: "https://example.com/portfolio", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, err := Normalize(tt.input)
			if (err != nil) != tt.wantErr {
				t.Fatalf("Normalize(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("Normalize(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestResolve(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		base   string
		target string
		want   string
	}{
		{name: "root deployment", target: "/assets/app.css", want: "/assets/app.css"},
		{name: "project deployment", base: "/portfolio", target: "/assets/app.css", want: "/portfolio/assets/app.css"},
		{name: "fragment", base: "/portfolio", target: "/#case", want: "/portfolio/#case"},
		{name: "external URL", base: "/portfolio", target: "https://example.com/image.png", want: "https://example.com/image.png"},
		{name: "protocol relative URL", base: "/portfolio", target: "//cdn.example.com/image.png", want: "//cdn.example.com/image.png"},
		{name: "relative URL", base: "/portfolio", target: "image.png", want: "image.png"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := Resolve(tt.base, tt.target); got != tt.want {
				t.Errorf("Resolve(%q, %q) = %q, want %q", tt.base, tt.target, got, tt.want)
			}
		})
	}
}

func TestPublicURL(t *testing.T) {
	t.Parallel()

	if got, want := PublicURL("https://rosa-gus.github.io", "/portfolio"), "https://rosa-gus.github.io/portfolio"; got != want {
		t.Errorf("PublicURL() = %q, want %q", got, want)
	}
}
