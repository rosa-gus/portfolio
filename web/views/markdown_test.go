package views

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"portfolio/internal/portfolio"
)

func TestRenderMarkdownContentAndLinkPolicy(t *testing.T) {
	t.Parallel()

	source := strings.Join([]string{
		"Text with *italics* and **emphasis**.",
		"",
		"[Internal](/case/example), [fragment](#detail), [external](https://example.com/docs), [email](mailto:hello@example.com), and [dangerous](javascript:alert(1)).",
		"",
		"<script>alert('do not render')</script>",
	}, "\n")

	var output bytes.Buffer
	err := renderMarkdown(
		portfolio.MarkdownDocument{Source: source},
		"/portfolio",
	).Render(context.Background(), &output)
	if err != nil {
		t.Fatalf("renderMarkdown() returned an error: %v", err)
	}

	html := output.String()
	assertContains(t, html, `<em>italics</em>`)
	assertContains(t, html, `<strong>emphasis</strong>`)
	assertContains(t, html, `href="/portfolio/case/example"`)
	assertContains(t, html, `href="#detail"`)
	assertContains(t, html, `href="https://example.com/docs" target="_blank" rel="noreferrer noopener"`)
	assertContains(t, html, `class="project-content__external-marker"`)
	assertContains(t, html, `class="visually-hidden"`)
	assertContains(t, html, `href="mailto:hello@example.com"`)
	assertContains(t, html, `dangerous`)
	assertNotContains(t, html, `javascript:`)
	assertNotContains(t, html, `<script>`)
}

func TestRenderMarkdownAutolinksUseTheSamePolicy(t *testing.T) {
	t.Parallel()

	var output bytes.Buffer
	err := renderMarkdown(
		portfolio.MarkdownDocument{Source: `<https://example.com/docs>`},
		"",
	).Render(context.Background(), &output)
	if err != nil {
		t.Fatalf("renderMarkdown() returned an error: %v", err)
	}

	assertContains(t, output.String(), `target="_blank" rel="noreferrer noopener"`)
}

func TestResolveMarkdownLink(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		destination string
		wantHref    string
		wantAllowed bool
		wantNewTab  bool
	}{
		{name: "internal", destination: "/case/example", wantHref: "/portfolio/case/example", wantAllowed: true},
		{name: "relative", destination: "details", wantHref: "details", wantAllowed: true},
		{name: "fragment", destination: "#detail", wantHref: "#detail", wantAllowed: true},
		{name: "https", destination: "https://example.com", wantHref: "https://example.com", wantAllowed: true, wantNewTab: true},
		{name: "email", destination: "mailto:hello@example.com", wantHref: "mailto:hello@example.com", wantAllowed: true},
		{name: "javascript", destination: "javascript:alert(1)"},
		{name: "data URL", destination: "data:text/html,content"},
		{name: "protocol-relative URL", destination: "//example.com"},
		{name: "backslash", destination: `https:\\example.com`},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got := resolveMarkdownLink("/portfolio", test.destination)
			if got.href != test.wantHref || got.allowed != test.wantAllowed || got.externalTab != test.wantNewTab {
				t.Errorf("resolveMarkdownLink() = %#v", got)
			}
		})
	}
}

func assertContains(t *testing.T, value, expected string) {
	t.Helper()
	if !strings.Contains(value, expected) {
		t.Errorf("output does not contain %q:\n%s", expected, value)
	}
}

func assertNotContains(t *testing.T, value, unexpected string) {
	t.Helper()
	if strings.Contains(value, unexpected) {
		t.Errorf("output contains %q:\n%s", unexpected, value)
	}
}
